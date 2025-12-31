import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HOST = '127.0.0.1';
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;
const CHROMIUM_PATH = process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium';

const WEBSITE_DIR = fileURLToPath(new URL('..', import.meta.url));
const REPO_DIR = fileURLToPath(new URL('../..', import.meta.url));

const SIMULATOR_PORT = Number(process.env.SMOKE_SIMULATOR_PORT || 8089);
const SIMULATOR_URL = process.env.SMOKE_SIMULATOR_URL || `http://127.0.0.1:${SIMULATOR_PORT}`;
const SIMULATOR_BIN =
  process.env.SMOKE_SIMULATOR_BIN || path.join(REPO_DIR, 'target', 'release', 'nullspace-simulator');
const EXECUTOR_BIN =
  process.env.SMOKE_EXECUTOR_BIN || path.join(REPO_DIR, 'target', 'release', 'dev-executor');
const ONCHAIN = /^(1|true)$/i.test(process.env.SMOKE_ONCHAIN || '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttpOk(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.ok || res.status === 304) return;
    } catch {
      // ignore
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function readDotEnv(envPath) {
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    const out = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

async function waitForSimulatorReady(url, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/seed/00`, { redirect: 'manual' });
      if (res.ok || res.status === 404) return;
    } catch {
      // ignore
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for simulator at ${url}`);
}

function killGroup(child, signal = 'SIGTERM') {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // ignore
  }
}

function startBackend(identityHex) {
  if (!fs.existsSync(SIMULATOR_BIN)) {
    throw new Error(`Simulator binary not found at ${SIMULATOR_BIN} (build with cargo)`);
  }
  if (!fs.existsSync(EXECUTOR_BIN)) {
    throw new Error(`dev-executor binary not found at ${EXECUTOR_BIN} (build with cargo)`);
  }

  const simulator = spawn(
    SIMULATOR_BIN,
    ['--host', '127.0.0.1', '--port', String(SIMULATOR_PORT), '--identity', identityHex],
    { cwd: REPO_DIR, stdio: 'inherit', detached: true }
  );
  simulator.unref();

  const executor = spawn(
    EXECUTOR_BIN,
    ['--url', SIMULATOR_URL, '--identity', identityHex, '--block-interval-ms', '100'],
    { cwd: REPO_DIR, stdio: 'inherit', detached: true }
  );
  executor.unref();

  return { simulator, executor };
}

function startVite(extraEnv) {
  const child = spawn(
    'npm',
    ['run', 'dev', '--', '--host', HOST, '--port', String(PORT), '--strictPort'],
    {
      cwd: WEBSITE_DIR,
      stdio: 'inherit',
      env: { ...process.env, PORT: String(PORT), ...extraEnv },
      detached: true,
    }
  );
  child.unref();
  return child;
}

async function run() {
  const envFile = path.join(WEBSITE_DIR, '.env');
  const envFromFile = readDotEnv(envFile);
  const identityHex = process.env.VITE_IDENTITY || envFromFile.VITE_IDENTITY;

  let backend = null;
  if (ONCHAIN) {
    if (!identityHex) {
      throw new Error(`Missing VITE_IDENTITY (set env or add ${envFile})`);
    }
    backend = startBackend(identityHex);
    await waitForSimulatorReady(SIMULATOR_URL);
  }

  const server = startVite(ONCHAIN ? { VITE_URL: SIMULATOR_URL, VITE_IDENTITY: identityHex } : {});
  try {
    await waitForHttpOk(BASE_URL);

    const browser = await chromium.launch({
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage({ baseURL: BASE_URL });
      page.setDefaultTimeout(25_000);

      await page.addInitScript(
        ({ vaultEnabled }) => {
          try {
            localStorage.removeItem('nullspace_responsible_play_v1');
            localStorage.setItem('nullspace_vault_enabled', vaultEnabled);
          } catch {
            // ignore
          }
        },
        { vaultEnabled: ONCHAIN ? 'false' : 'true' }
      );

        const openSafety = async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            if (await page.getByText(/session insight/i).isVisible().catch(() => false)) return true;
            try {
              await page.getByRole('button', { name: /^safety$/i }).click({ timeout: 2000 });
              await page.getByText(/session insight/i).waitFor();
              return true;
            } catch {
              await page.keyboard.press('Escape');
              await page.waitForTimeout(150);
            }
          }
          if (!(await page.getByText(/session insight/i).isVisible().catch(() => false))) {
            console.warn('[smoke] Safety overlay not available');
            return false;
          }
          return true;
        };
        const closeSafety = async () => {
          if (await page.getByText(/session insight/i).isVisible().catch(() => false)) {
            const acknowledge = page.getByRole('button', { name: /acknowledge|continue/i });
            if (await acknowledge.isVisible().catch(() => false)) {
              await acknowledge.click();
            } else {
              await page.keyboard.press('Escape');
            }
            await page.getByText(/session insight/i).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
          }
        };
        const dismissOverlays = async () => {
          await closeSafety();
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
        };

      const clickWithFallback = async (locator, label) => {
        try {
          await locator.click({ timeout: 15000 });
        } catch (error) {
          console.warn(`[smoke] ${label} click fallback:`, error?.message ?? error);
          await page.evaluate((labelText) => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const target = buttons.find((btn) =>
              btn.textContent?.toLowerCase().includes(labelText)
            );
            if (!target) {
              throw new Error(`Button not found: ${labelText}`);
            }
            target.click();
          }, label.toLowerCase());
        }
      };

      await page.goto('/');
      await page.getByRole('heading', { name: /select your mode/i }).waitFor({ timeout: 30000 });
      await clickWithFallback(page.getByRole('button', { name: /cash game/i }), 'cash game');

      if (ONCHAIN) {
        const openRewards = async () => {
          const menuButton = page.getByLabel('Menu');
          if (await menuButton.isVisible().catch(() => false)) {
            await menuButton.click();
          }
          const rewardsButton = page.getByRole('button', { name: /^rewards$/i });
          if (await rewardsButton.isVisible().catch(() => false)) {
            await rewardsButton.click();
            await page.getByText(/daily bonus/i).waitFor({ timeout: 10000 });
            return true;
          }
          return false;
        };

        const claimFaucetIfAvailable = async () => {
          const claimButton = page.getByRole('button', { name: /^claim now$/i });
          if (await claimButton.isVisible().catch(() => false)) {
            await claimButton.click();
            await page
              .getByRole('button', { name: /claiming|claimed/i })
              .first()
              .waitFor({ timeout: 60_000 });
          }
        };

        if (await openRewards()) {
          await claimFaucetIfAvailable();
          await page.keyboard.press('Escape');
        }

        await page
          .getByText(/localnet\s*·\s*offline|testnet\s*·\s*offline/i)
          .first()
          .waitFor({ state: 'hidden', timeout: 60_000 });
      }

      const gamesButton = page.getByRole('button', { name: /^games$/i });
      await gamesButton.waitFor({ timeout: 30000 });
      await gamesButton.click();
      await page.getByPlaceholder(/search nullspace|type command/i).fill('blackjack');
      await page.getByText(/^blackjack$/i).first().waitFor({ timeout: 10000 });
      await page.getByText(/^blackjack$/i).first().click();
      await page
        .locator('#casino-main h2')
        .filter({ hasText: /place bets|place your bet/i })
        .first()
        .waitFor({ timeout: 60_000 });
      await dismissOverlays();

        if (await openSafety()) {
          await closeSafety();
        }

        const statusHeading = page.locator('#casino-main h2').first();
        const readStatus = async () => ((await statusHeading.textContent()) ?? '').trim();

        await dismissOverlays();
        console.log('[smoke] blackjack status before deal:', await readStatus());
        await clickWithFallback(page.getByRole('button', { name: /^deal$/i }), 'deal');
        console.log('[smoke] blackjack status after deal:', await readStatus());
        try {
          await page
            .locator('#casino-main h2')
            .filter({ hasText: /your move|reveal|game complete/i })
            .first()
            .waitFor({ timeout: 60_000 });
        } catch (error) {
          console.warn('[smoke] blackjack status timeout:', await readStatus());
          throw error;
        }

        let status = ((await statusHeading.textContent()) ?? '').toLowerCase();
        if (status.includes('your move')) {
          await page.keyboard.press('s');
          await page
            .locator('#casino-main h2')
            .filter({ hasText: /reveal|game complete/i })
            .first()
            .waitFor({ timeout: 60_000 });
          status = ((await statusHeading.textContent()) ?? '').toLowerCase();
        }

        if (status.includes('reveal')) {
          await page.keyboard.press(' ');
          await page
            .locator('#casino-main h2')
            .filter({ hasText: /game complete/i })
            .first()
            .waitFor({ timeout: 60_000 });
        }

      if (ONCHAIN) {
        await gamesButton.click();
        await page.getByPlaceholder(/search nullspace|type command/i).fill('craps');
        await page.getByText(/^craps$/i).first().waitFor({ timeout: 10000 });
        await page.getByText(/^craps$/i).first().click();
        await page
          .locator('#casino-main h2')
          .filter({ hasText: /place bets/i })
          .first()
          .waitFor({ timeout: 60_000 });
        await dismissOverlays();

        await page.keyboard.press('Shift+3');
        await page.keyboard.press('0');
        await page.getByText(/placed \d+ bonus bets/i).first().waitFor({ timeout: 60_000 });

        await page.keyboard.press('Shift+1');
        await page.keyboard.press('f');

        await page.keyboard.press('Shift+1');
        await page.keyboard.press('p');
        await page.keyboard.press('Shift+1');
        await page.keyboard.press('d');

        await page.keyboard.press('Shift+1');
        await page.keyboard.press('h');
        await page.getByText(/select hardway number/i).waitFor();
        const hardwayModal = page.getByText(/select hardway number/i).locator('..');
        await hardwayModal.getByRole('button', { name: /6/ }).first().click();

        await page.keyboard.press('Shift+2');
        await page.keyboard.press('y');
        await page.getByText(/select yes number/i).waitFor();
        const yesModal = page.getByText(/select yes number/i).locator('..');
        await yesModal.getByRole('button', { name: /6/ }).first().click();

        await page.keyboard.press('Shift+2');
        await page.keyboard.press('n');
        await page.getByText(/select no number/i).waitFor();
        const noModal = page.getByText(/select no number/i).locator('..');
        await noModal.getByRole('button', { name: /5/ }).first().click();

        await page.keyboard.press('Shift+2');
        await page.keyboard.press('x');
        await page.getByText(/select next number/i).waitFor();
        const nextModal = page.getByText(/select next number/i).locator('..');
        await nextModal.getByRole('button', { name: /8/ }).first().click();

        const rollDiceButton = page.getByRole('button', { name: /roll dice/i });
        if (await rollDiceButton.count()) {
          await rollDiceButton.first().click();
        } else {
          await page.getByRole('button', { name: /^roll$/i }).first().click();
        }
        await page.getByText(/^LAST:/i).first().waitFor({ timeout: 60_000 });
      }

        await page.getByRole('link', { name: /^swap$/i }).click();
        await page.getByText(/economy — swap/i).waitFor();

        await page.getByRole('link', { name: /^stake$/i }).click();
        await page.getByText(/^staking$/i).waitFor();

      console.log('[smoke] ok');
    } finally {
      await browser.close();
    }
  } finally {
    killGroup(server);
    if (backend) {
      killGroup(backend.executor);
      killGroup(backend.simulator);
    }
  }
}

run().catch((e) => {
  console.error('[smoke] failed:', e);
  process.exit(1);
});
