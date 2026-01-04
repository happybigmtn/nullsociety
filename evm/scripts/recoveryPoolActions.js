const { ethers } = require('hardhat');
const { erc20Abi } = require('../src/abis/erc20');
const { recoveryPoolAbi } = require('../src/abis/recoveryPool');
const { loadDeployments } = require('../src/utils/deployments.cjs');
const { parseEnv } = require('../src/utils/env.cjs');

function parseArgs() {
  const envConfig = parseEnv({
    ACTION: { type: 'string', default: '' },
    AMOUNT: { type: 'string', default: '' },
    RECIPIENT: { type: 'string', default: '' },
    AMOUNT_RAW: { type: 'boolean', default: false },
    CURRENCY_DECIMALS: { type: 'number', integer: true, min: 0 },
  });
  const args = process.argv.slice(2);
  const parsed = {
    action: envConfig.ACTION || undefined,
    amount: envConfig.AMOUNT || undefined,
    recipient: envConfig.RECIPIENT || undefined,
    raw: envConfig.AMOUNT_RAW,
    decimals: envConfig.CURRENCY_DECIMALS,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--action') {
      parsed.action = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--amount') {
      parsed.amount = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--recipient') {
      parsed.recipient = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--raw') {
      parsed.raw = true;
    }
  }

  return parsed;
}

async function resolveDecimals(currency, explicitDecimals) {
  if (explicitDecimals !== undefined) {
    return explicitDecimals;
  }
  try {
    return Number(await currency.decimals());
  } catch (error) {
    return 6;
  }
}

async function resolveAmount(input, decimals, raw, balanceOf) {
  if (!input || input === 'balance' || input === 'max') {
    return await balanceOf();
  }
  if (raw) {
    return BigInt(input);
  }
  return ethers.parseUnits(input, decimals);
}

async function main() {
  const parsed = parseArgs();
  if (!parsed.action) {
    throw new Error('Action required: --action fund|repay|sweep');
  }
  if (parsed.recipient) {
    try {
      ethers.getAddress(parsed.recipient);
    } catch {
      throw new Error('Recipient must be a valid address');
    }
  }

  const deployments = loadDeployments();
  const [signer] = await ethers.getSigners();
  if (!deployments.recoveryPool) {
    throw new Error('Deployments missing recoveryPool address');
  }
  if (!deployments.currency || deployments.currency === ethers.ZeroAddress) {
    throw new Error('Deployments missing currency address');
  }

  const recoveryPool = new ethers.Contract(deployments.recoveryPool, recoveryPoolAbi, signer);
  const currency = new ethers.Contract(deployments.currency, erc20Abi, signer);
  const decimals = await resolveDecimals(currency, parsed.decimals);

  const action = parsed.action.toLowerCase();
  if (action === 'fund') {
    const amount = await resolveAmount(
      parsed.amount,
      decimals,
      parsed.raw,
      async () => currency.balanceOf(signer.address)
    );
    if (amount === 0n) {
      throw new Error('Amount is zero');
    }
    const balance = await currency.balanceOf(signer.address);
    if (amount > balance) {
      throw new Error(`Amount exceeds signer balance (${balance.toString()})`);
    }
    const allowance = await currency.allowance(signer.address, recoveryPool.target);
    if (allowance < amount) {
      await (await currency.approve(recoveryPool.target, amount)).wait();
    }
    await (await recoveryPool.fund(amount)).wait();
    console.log(`Funded recovery pool with ${amount.toString()}`);
    return;
  }

  if (action === 'repay' || action === 'sweep') {
    if (!parsed.recipient) {
      throw new Error('Recipient required: --recipient <address>');
    }
    const poolBalance = await currency.balanceOf(recoveryPool.target);
    const amount = await resolveAmount(
      parsed.amount,
      decimals,
      parsed.raw,
      async () => poolBalance
    );
    if (amount === 0n) {
      throw new Error('Amount is zero');
    }
    if (amount > poolBalance) {
      throw new Error(`Amount exceeds pool balance (${poolBalance.toString()})`);
    }
    if (action === 'repay') {
      await (await recoveryPool.repay(parsed.recipient, amount)).wait();
      console.log(`Repaid ${amount.toString()} to ${parsed.recipient}`);
    } else {
      await (await recoveryPool.sweep(parsed.recipient, amount)).wait();
      console.log(`Swept ${amount.toString()} to ${parsed.recipient}`);
    }
    return;
  }

  throw new Error(`Unknown action: ${parsed.action}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
