import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEBSITE_ROOT = path.resolve(__dirname, '../../../');
const REPO_ROOT = path.resolve(WEBSITE_ROOT, '..');

const ENV_WASM_PKG_DIR = process.env.WASM_PKG_DIR;
const PRIMARY_WASM_PKG_DIR =
  ENV_WASM_PKG_DIR ?? path.join(WEBSITE_ROOT, 'wasm', 'pkg-test');
const FALLBACK_WASM_PKG_DIR = path.join(WEBSITE_ROOT, 'wasm', 'pkg');
const RESOLVED_WASM_PKG_DIR = ENV_WASM_PKG_DIR
  ? PRIMARY_WASM_PKG_DIR
  : fs.existsSync(PRIMARY_WASM_PKG_DIR)
      ? PRIMARY_WASM_PKG_DIR
      : FALLBACK_WASM_PKG_DIR;

export const WASM_BINARY_PATH = path.join(
  RESOLVED_WASM_PKG_DIR,
  'nullspace_wasm_bg.wasm'
);
export const WASM_BINDINGS_PATH = path.join(
  RESOLVED_WASM_PKG_DIR,
  'nullspace_wasm.js'
);
export const SIMULATOR_BINARY_PATH = path.join(
  REPO_ROOT,
  'target',
  'release',
  'nullspace-simulator'
);

export async function loadWasmBindings() {
  const wasmBuffer = await fsPromises.readFile(WASM_BINARY_PATH);
  const wasmJs = await import(pathToFileURL(WASM_BINDINGS_PATH).href);
  await wasmJs.default(wasmBuffer);
  globalThis.__NULLSPACE_WASM_BINDINGS__ = wasmJs;
  return wasmJs;
}
