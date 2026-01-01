import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const require = createRequire(import.meta.url);

const baseUrl = process.env.SIMULATOR_HTTP_URL ?? process.env.SIMULATOR_URL ?? 'http://localhost:8080';
const identityHex = (process.env.SIMULATOR_IDENTITY_HEX ?? process.env.VITE_IDENTITY ?? '').trim();
const outputPath = process.env.OPS_ECONOMY_SNAPSHOT_PATH ?? path.join(process.cwd(), 'data', 'ops', 'economy', 'latest.json');
const maxSnapshots = Number.parseInt(process.env.SNAPSHOT_MAX_POINTS ?? '360', 10);
const maxPlayers = Number.parseInt(process.env.SNAPSHOT_PLAYER_SAMPLE ?? '500', 10);

if (!identityHex) {
  console.error('Missing SIMULATOR_IDENTITY_HEX or VITE_IDENTITY');
  process.exit(1);
}

const wasmModulePath = require.resolve('website/wasm/pkg/nullspace_wasm.js');
const wasmBinPath = require.resolve('website/wasm/pkg/nullspace_wasm_bg.wasm');
const wasmModule = await import(pathToFileURL(wasmModulePath).href);
const wasmBin = await fs.readFile(wasmBinPath);
await wasmModule.default({ module_or_path: wasmBin });

const hexToBytes = (hex) => {
  const normalized = hex.trim().toLowerCase().replace(/^0x/, '');
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const identityBytes = hexToBytes(identityHex);

const snakeToCamel = (value) => {
  if (Array.isArray(value)) return value.map((item) => snakeToCamel(item));
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    next[camel] = snakeToCamel(entry);
  }
  return next;
};

const queryState = async (keyBytes) => {
  const hashed = wasmModule.hash_key(keyBytes);
  const hexKey = bytesToHex(hashed);
  const response = await fetch(`${baseUrl}/state/${hexKey}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`State query failed (${response.status})`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!bytes.length) return null;
  const decoded = wasmModule.decode_lookup(bytes, identityBytes);
  return snakeToCamel(decoded);
};

const giniCoefficient = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  if (!sum) return 0;
  let cumulative = 0;
  let weighted = 0;
  sorted.forEach((v) => {
    cumulative += v;
    weighted += cumulative;
  });
  return (sorted.length + 1 - (2 * weighted) / sum) / sorted.length;
};

const now = Date.now();
const [house, amm, registry] = await Promise.all([
  queryState(wasmModule.encode_house_key()),
  queryState(wasmModule.encode_amm_pool_key()),
  queryState(wasmModule.encode_player_registry_key()),
]);

if (!house || !amm) {
  console.error('Failed to load house or AMM state');
  process.exit(1);
}

const reserveRng = Number(amm.reserveRng ?? 0);
const reserveVusdt = Number(amm.reserveVusdt ?? 0);
const totalShares = Number(amm.totalShares ?? 0);
const bootstrapPrice =
  Number(amm.bootstrapPriceVusdtNumerator ?? 0) /
  Math.max(1, Number(amm.bootstrapPriceRngDenominator ?? 1));
const price = reserveRng > 0 ? reserveVusdt / reserveRng : bootstrapPrice;
const tvl = reserveVusdt + reserveRng * price;
const lpPrice = totalShares > 0 ? tvl / totalShares : 0;

const snapshot = {
  timestamp: now,
  epoch: Number(house.currentEpoch ?? 0),
  total_issuance: Number(house.totalIssuance ?? 0),
  total_burned: Number(house.totalBurned ?? 0),
  accumulated_fees: Number(house.accumulatedFees ?? 0),
  house_pnl: Number(house.netPnl ?? 0),
  total_vusdt_debt: Number(house.totalVusdtDebt ?? 0),
  stability_fees_accrued: Number(house.stabilityFeesAccrued ?? 0),
  recovery_pool_vusdt: Number(house.recoveryPoolVusdt ?? 0),
  rng_price: price,
  pool_tvl_vusdt: tvl,
  lp_share_price_vusdt: lpPrice,
  amm_invariant_k: reserveRng * reserveVusdt,
};

const balances = [];
const players = Array.isArray(registry?.players) ? registry.players : [];
const limitedPlayers = players.slice(0, Math.max(0, maxPlayers));
for (const keyHex of limitedPlayers) {
  try {
    const playerState = await queryState(wasmModule.encode_casino_player_key(hexToBytes(keyHex)));
    if (playerState) {
      balances.push(Number(playerState.chips ?? 0));
    }
  } catch {
    // ignore per-player errors
  }
}

const total = balances.reduce((acc, v) => acc + v, 0);
const sortedDesc = [...balances].sort((a, b) => b - a);
const topCount = Math.max(1, Math.ceil(sortedDesc.length * 0.01));
const topSum = sortedDesc.slice(0, topCount).reduce((acc, v) => acc + v, 0);

const distribution = {
  gini: giniCoefficient(balances),
  top1Share: total > 0 ? topSum / total : 0,
  players: balances.length,
  updatedAt: now,
};

let existing = { data: [] };
try {
  const raw = await fs.readFile(outputPath, 'utf8');
  existing = JSON.parse(raw);
} catch {
  // ignore if missing
}

const nextData = Array.isArray(existing.data) ? [...existing.data, snapshot] : [snapshot];
const trimmed = nextData.slice(-maxSnapshots);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(
  outputPath,
  JSON.stringify({ updatedAt: now, data: trimmed, distribution }, null, 2) + '\n',
  'utf8',
);

console.log(`Snapshot saved to ${outputPath} (${trimmed.length} points)`);
