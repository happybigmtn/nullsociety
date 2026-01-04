const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');
const { parseEnv } = require('../src/utils/env.cjs');
const { deriveKeysFromMnemonic } = require('../src/utils/bidders.cjs');

const envConfig = parseEnv({
  BIDDER_COUNT: { type: 'number', default: 100, integer: true, min: 1 },
  BIDDER_MNEMONIC: { type: 'string', default: '' },
});

const count = envConfig.BIDDER_COUNT;
const mnemonic = envConfig.BIDDER_MNEMONIC || ethers.Wallet.createRandom().mnemonic.phrase;
const keys = deriveKeysFromMnemonic(mnemonic, count);
const bidders = keys.map((key, index) => {
  const wallet = new ethers.Wallet(key);
  return {
    index,
    address: wallet.address,
    privateKey: key,
  };
});

const outDir = path.resolve('data');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'bidders.json');
fs.writeFileSync(outPath, JSON.stringify({ mnemonic, bidders }, null, 2));

const keysPath = path.join(outDir, 'bidder-keys.txt');
fs.writeFileSync(keysPath, bidders.map((b) => b.privateKey).join(','));

console.log(`Generated ${count} bidders.`);
console.log(`Mnemonic: ${mnemonic}`);
console.log(`Saved ${outPath}`);
console.log(`Saved ${keysPath}`);
