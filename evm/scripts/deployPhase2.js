const { ethers, network } = require('hardhat');
const { buildAuctionParameters } = require('../src/auction/params');
const { parseEnv } = require('../src/utils/env.cjs');
const { saveDeployments } = require('../src/utils/deployments.cjs');
const { virtualLbpFactoryAbi } = require('../src/abis/virtualLbpFactory');
const { distributionContractAbi } = require('../src/abis/distributionContract');
const { erc20Abi } = require('../src/abis/erc20');
const { DEFAULT_ADDRESSES } = require('../src/config/addresses');
const {
  AUCTION_ALLOCATION,
  BONUS_ALLOCATION,
  LIQUIDITY_ALLOCATION,
  LBP_TOTAL,
  PLAYER_ALLOCATION,
  TEAM_ALLOCATION,
  TOTAL_SUPPLY,
  TREASURY_ALLOCATION,
  tokenSplitMps,
  USDT_DECIMALS,
  USDT_UNIT
} = require('../src/config/phase2');

const Q96 = 2n ** 96n;
const ACTION_MSG_SENDER = '0x0000000000000000000000000000000000000001';

function validateAddress(value) {
  if (!value) return 'must be a valid address';
  try {
    ethers.getAddress(value);
    return null;
  } catch {
    return 'must be a valid address';
  }
}

function optionalAddress(value) {
  if (!value) return null;
  return validateAddress(value);
}

function parseBigIntValue(value, label) {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${label} must be a bigint`);
  }
}

function floorPriceQ96(currencyDecimals, config) {
  if (config.AUCTION_FLOOR_PRICE_Q96) {
    return parseBigIntValue(config.AUCTION_FLOOR_PRICE_Q96, 'AUCTION_FLOOR_PRICE_Q96');
  }
  const floorUnitsRaw = config.AUCTION_FLOOR_PRICE;
  let floorUnits;
  try {
    floorUnits = ethers.parseUnits(floorUnitsRaw, currencyDecimals);
  } catch {
    throw new Error('AUCTION_FLOOR_PRICE must be a decimal string');
  }
  return floorUnits * Q96;
}

function resolveTickSpacing(floorPrice, config) {
  if (config.AUCTION_TICK_SPACING) {
    const spacing = parseBigIntValue(config.AUCTION_TICK_SPACING, 'AUCTION_TICK_SPACING');
    if (spacing < 2n) {
      throw new Error('AUCTION_TICK_SPACING must be >= 2');
    }
    if (floorPrice % spacing !== 0n) {
      throw new Error('AUCTION_TICK_SPACING must divide the floor price');
    }
    return spacing;
  }
  const spacing = floorPrice / 100n;
  if (spacing < 2n) {
    return 2n;
  }
  return spacing;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = DEFAULT_ADDRESSES[network.name];
  if (!addresses) {
    throw new Error(`Unsupported network: ${network.name}`);
  }

  const envConfig = parseEnv({
    VIRTUAL_LBP_FACTORY: {
      type: 'string',
      default: addresses.virtualLbpFactory || '',
      validate: validateAddress,
    },
    CCA_FACTORY: {
      type: 'string',
      default: addresses.ccaFactory || '',
      validate: validateAddress,
    },
    PHASE2_CURRENCY: { type: 'string', default: '', validate: optionalAddress },
    CURRENCY_DECIMALS: { type: 'number', default: Number(USDT_DECIMALS), integer: true, min: 0 },
    AUCTION_START_BLOCK_OFFSET: { type: 'number', default: 30, integer: true, min: 0 },
    AUCTION_DURATION_BLOCKS: { type: 'number', default: 7200, integer: true, min: 1 },
    AUCTION_CLAIM_BLOCK_OFFSET: { type: 'number', default: 400, integer: true, min: 0 },
    MIGRATION_BLOCK_OFFSET: { type: 'number', default: 200, integer: true, min: 0 },
    SWEEP_BLOCK_OFFSET: { type: 'number', default: 400, integer: true, min: 0 },
    AUCTION_FLOOR_PRICE_Q96: { type: 'string', default: '' },
    AUCTION_FLOOR_PRICE: { type: 'string', default: '0.05' },
    AUCTION_TICK_SPACING: { type: 'string', default: '' },
    AUCTION_REQUIRED_RAISE: { type: 'string', default: '' },
    POOL_LP_FEE: { type: 'number', default: 3000, integer: true, min: 0 },
    POOL_TICK_SPACING: { type: 'number', default: 60, integer: true, min: 0 },
    POOL_POSITION_RECIPIENT: {
      type: 'string',
      default: deployer.address,
      validate: validateAddress,
    },
    TREASURY_OPERATOR: { type: 'string', default: deployer.address, validate: validateAddress },
    GOVERNANCE_ADDRESS: { type: 'string', default: deployer.address, validate: validateAddress },
    ONE_SIDED_TOKEN: { type: 'boolean', default: false },
    ONE_SIDED_CURRENCY: { type: 'boolean', default: false },
    LBP_SALT: { type: 'string', default: '' },
    TREASURY_ADDRESS: { type: 'string', default: deployer.address, validate: validateAddress },
    TEAM_ADDRESS: { type: 'string', default: deployer.address, validate: validateAddress },
  });

  const virtualLbpFactory = envConfig.VIRTUAL_LBP_FACTORY;
  const ccaFactory = envConfig.CCA_FACTORY;

  if (virtualLbpFactory === ethers.ZeroAddress) {
    throw new Error('VIRTUAL_LBP_FACTORY is required for this deployment');
  }

  const currencyDecimals = envConfig.CURRENCY_DECIMALS;
  const currentBlock = await ethers.provider.getBlockNumber();
  const startOffset = envConfig.AUCTION_START_BLOCK_OFFSET;
  const durationBlocks = envConfig.AUCTION_DURATION_BLOCKS;
  const claimOffset = envConfig.AUCTION_CLAIM_BLOCK_OFFSET;
  const migrationOffset = envConfig.MIGRATION_BLOCK_OFFSET;
  const sweepOffset = envConfig.SWEEP_BLOCK_OFFSET;

  const startBlock = currentBlock + startOffset;
  const endBlock = startBlock + durationBlocks;
  const claimBlock = endBlock + claimOffset;
  const migrationBlock = endBlock + migrationOffset;
  const sweepBlock = migrationBlock + sweepOffset;

  const floorPrice = floorPriceQ96(currencyDecimals, envConfig);
  const tickSpacing = resolveTickSpacing(floorPrice, envConfig);
  let requiredRaise = 0n;
  if (envConfig.AUCTION_REQUIRED_RAISE) {
    try {
      requiredRaise = ethers.parseUnits(envConfig.AUCTION_REQUIRED_RAISE, currencyDecimals);
    } catch {
      throw new Error('AUCTION_REQUIRED_RAISE must be a decimal string');
    }
  }

  const steps = (() => {
    const step1 = Math.max(1, Math.floor(durationBlocks * 0.2));
    const step2 = Math.max(1, Math.floor(durationBlocks * 0.3));
    const step3 = Math.max(1, durationBlocks - step1 - step2);
    return [
      { blockDelta: step1, weight: 10 },
      { blockDelta: step2, weight: 30 },
      { blockDelta: step3, weight: 60 }
    ];
  })();

  const [
    rngTokenFactory,
    mockUsdtFactory,
    recoveryPoolFactory,
    bogoFactory,
    bridgeFactory,
    feeDistributorFactory
  ] =
    await Promise.all([
      ethers.getContractFactory('RNGToken'),
      ethers.getContractFactory('MockUSDT'),
      ethers.getContractFactory('RecoveryPool'),
      ethers.getContractFactory('BogoDistributor'),
      ethers.getContractFactory('BridgeLockbox'),
      ethers.getContractFactory('FeeDistributor')
    ]);

  const rngToken = await rngTokenFactory.deploy('RNG', 'RNG', TOTAL_SUPPLY, deployer.address);
  await rngToken.waitForDeployment();

  let currencyAddress = envConfig.PHASE2_CURRENCY;
  let mockUsdt = null;
  if (!currencyAddress) {
    mockUsdt = await mockUsdtFactory.deploy(deployer.address, currencyDecimals);
    await mockUsdt.waitForDeployment();
    currencyAddress = await mockUsdt.getAddress();
  }
  if (currencyAddress === ethers.ZeroAddress) {
    throw new Error('PHASE2_CURRENCY must be an ERC-20 for recovery pool support');
  }

  const auctionParams = buildAuctionParameters({
    currency: currencyAddress,
    tokensRecipient: ACTION_MSG_SENDER,
    fundsRecipient: ACTION_MSG_SENDER,
    startBlock: BigInt(startBlock),
    endBlock: BigInt(endBlock),
    claimBlock: BigInt(claimBlock),
    tickSpacing,
    validationHook: ethers.ZeroAddress,
    floorPrice,
    requiredCurrencyRaised: requiredRaise,
    totalMps: 10_000_000,
    steps
  });

  const auctionParamsEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      'tuple(address currency,address tokensRecipient,address fundsRecipient,uint64 startBlock,uint64 endBlock,uint64 claimBlock,uint256 tickSpacing,address validationHook,uint256 floorPrice,uint128 requiredCurrencyRaised,bytes auctionStepsData)'
    ],
    [auctionParams]
  );

  const poolLPFee = envConfig.POOL_LP_FEE;
  const poolTickSpacing = envConfig.POOL_TICK_SPACING;
  const positionRecipient = envConfig.POOL_POSITION_RECIPIENT;
  const operator = envConfig.TREASURY_OPERATOR;
  const governanceAddress = envConfig.GOVERNANCE_ADDRESS;
  const createOneSidedTokenPosition = envConfig.ONE_SIDED_TOKEN;
  const createOneSidedCurrencyPosition = envConfig.ONE_SIDED_CURRENCY;

  const migratorParams = {
    migrationBlock: BigInt(migrationBlock),
    currency: currencyAddress,
    poolLPFee,
    poolTickSpacing,
    tokenSplitToAuction: tokenSplitMps(),
    auctionFactory: ccaFactory,
    positionRecipient,
    sweepBlock: BigInt(sweepBlock),
    operator,
    createOneSidedTokenPosition,
    createOneSidedCurrencyPosition
  };

  const configData = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      'address',
      'tuple(uint64 migrationBlock,address currency,uint24 poolLPFee,int24 poolTickSpacing,uint24 tokenSplitToAuction,address auctionFactory,address positionRecipient,uint64 sweepBlock,address operator,bool createOneSidedTokenPosition,bool createOneSidedCurrencyPosition)',
      'bytes'
    ],
    [governanceAddress, migratorParams, auctionParamsEncoded]
  );

  const saltInput = envConfig.LBP_SALT;
  const salt = saltInput
    ? saltInput.length === 66 && saltInput.startsWith('0x')
      ? saltInput
      : ethers.id(saltInput)
    : ethers.id('RNG-LBP');

  const factory = new ethers.Contract(virtualLbpFactory, virtualLbpFactoryAbi, deployer);
  const expectedDistribution = await factory.getVirtualLBPAddress(
    await rngToken.getAddress(),
    LBP_TOTAL,
    configData,
    salt,
    deployer.address
  );

  const recoveryPool = await recoveryPoolFactory.deploy(deployer.address, currencyAddress);
  await recoveryPool.waitForDeployment();

  const bogoDistributor = await bogoFactory.deploy(deployer.address, await rngToken.getAddress());
  await bogoDistributor.waitForDeployment();

  const bridgeLockbox = await bridgeFactory.deploy(deployer.address, await rngToken.getAddress());
  await bridgeLockbox.waitForDeployment();

  const feeDistributor = await feeDistributorFactory.deploy(deployer.address, currencyAddress);
  await feeDistributor.waitForDeployment();

  await (await rngToken.mint(deployer.address, TOTAL_SUPPLY)).wait();

  const rng = new ethers.Contract(await rngToken.getAddress(), erc20Abi, deployer);
  await (await rng.transfer(expectedDistribution, LBP_TOTAL)).wait();
  await (await rng.transfer(await bridgeLockbox.getAddress(), PLAYER_ALLOCATION)).wait();
  await (await rng.transfer(envConfig.TREASURY_ADDRESS, TREASURY_ALLOCATION)).wait();
  await (await rng.transfer(envConfig.TEAM_ADDRESS, TEAM_ALLOCATION)).wait();

  await (await rng.approve(await bogoDistributor.getAddress(), BONUS_ALLOCATION)).wait();
  await (await bogoDistributor.seed(BONUS_ALLOCATION)).wait();

  const initTx = await factory.initializeDistribution(
    await rngToken.getAddress(),
    LBP_TOTAL,
    configData,
    salt
  );
  await initTx.wait();

  const distribution = new ethers.Contract(expectedDistribution, distributionContractAbi, deployer);
  await (await distribution.onTokensReceived()).wait();
  const auctionAddress = await distribution.auction();

  const output = {
    network: network.name,
    deployer: deployer.address,
    rng: await rngToken.getAddress(),
    currency: currencyAddress,
    mockUsdt: mockUsdt ? await mockUsdt.getAddress() : null,
    recoveryPool: await recoveryPool.getAddress(),
    bogoDistributor: await bogoDistributor.getAddress(),
    bridgeLockbox: await bridgeLockbox.getAddress(),
    feeDistributor: await feeDistributor.getAddress(),
    distribution: expectedDistribution,
    auction: auctionAddress,
    allocations: {
      total: TOTAL_SUPPLY.toString(),
      auction: AUCTION_ALLOCATION.toString(),
      liquidity: LIQUIDITY_ALLOCATION.toString(),
      bonus: BONUS_ALLOCATION.toString(),
      player: PLAYER_ALLOCATION.toString(),
      treasury: TREASURY_ALLOCATION.toString(),
      team: TEAM_ALLOCATION.toString()
    },
    auctionParams: {
      ...auctionParams,
      floorPrice: auctionParams.floorPrice.toString(),
      tickSpacing: auctionParams.tickSpacing.toString(),
      requiredCurrencyRaised: auctionParams.requiredCurrencyRaised.toString(),
      startBlock: auctionParams.startBlock.toString(),
      endBlock: auctionParams.endBlock.toString(),
      claimBlock: auctionParams.claimBlock.toString()
    },
    migratorParams: {
      ...migratorParams,
      migrationBlock: migratorParams.migrationBlock.toString(),
      sweepBlock: migratorParams.sweepBlock.toString()
    },
    blocks: {
      current: currentBlock,
      start: startBlock,
      end: endBlock,
      claim: claimBlock,
      migration: migrationBlock,
      sweep: sweepBlock
    }
  };

  const outPath = saveDeployments(output);

  const recoveryTarget = 20_000_000n * USDT_UNIT;
  console.log('Deployment complete.');
  console.log(`RNG token: ${output.rng}`);
  console.log(`Currency: ${output.currency}`);
  console.log(`Distribution: ${output.distribution}`);
  console.log(`Fee distributor: ${output.feeDistributor}`);
  console.log(`Auction: ${output.auction}`);
  console.log(`Recovery pool target: ${recoveryTarget.toString()}`);
  console.log(`Saved deployment to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
