import { chromium, devices } from 'playwright-core';
import process from 'node:process';

const BASE_URL = 'http://localhost:3000';
const CHROMIUM_PATH = process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium';

async function run() {
  console.log('Connecting to', BASE_URL);
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const iPhone = devices['iPhone 12 Pro'];
    const context = await browser.newContext({
      ...iPhone,
      baseURL: BASE_URL,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Initial setup: Clear storage to reset state
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('nullspace_touch_mode', 'true');
    });

    console.log('Navigating to home...');
    await page.goto('/');
    
    // Select Cash Game
    await page.getByRole('button', { name: /cash game/i }).click();
    await page.waitForTimeout(1000);

    // Helper to open bets menu if needed
    const openBetsMenu = async () => {
        const betsBtn = page.getByLabel('Game controls').getByRole('button', { name: /^BETS$/i });
        if (await betsBtn.isVisible()) {
            await betsBtn.click();
            await page.waitForTimeout(500); // Animation
        }
    };

    const closeBetsMenu = async () => {
        const closeBtn = page.getByRole('button', { name: /\[CLOSE\]/i });
        if (await closeBtn.isVisible()) {
            await closeBtn.click();
            await page.waitForTimeout(500);
        }
    };

    // --- BACCARAT TEST ---
    console.log('Testing Baccarat...');
    await page.getByRole('button', { name: /^games$/i }).click();
    await page.getByPlaceholder(/type command/i).fill('baccarat');
    await page.keyboard.press('Enter');
    
    // Check for error boundary or crash
    await page.waitForTimeout(1000);
    const bodyText = await page.textContent('body');
    if (bodyText.includes('Something went wrong') || bodyText.includes('bankerColor is not defined')) {
        throw new Error('Baccarat crashed with bankerColor error!');
    }

    // Place bet
    await openBetsMenu();
    await page.getByRole('button', { name: /player/i }).first().click();
    await closeBetsMenu();

    // Deal
    await page.getByRole('button', { name: /deal/i }).click();
    await page.waitForTimeout(2000);
    
    // Check for result
    const baccaratMsg = await page.locator('.animate-pulse').first().textContent();
    console.log('Baccarat Result:', baccaratMsg);

    // --- ROULETTE TEST ---
    console.log('Testing Roulette...');
    await page.getByRole('button', { name: /^games$/i }).click();
    await page.getByPlaceholder(/type command/i).fill('roulette');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Place bet on RED
    await openBetsMenu();
    await page.getByRole('button', { name: /red/i }).click();
    await closeBetsMenu();

    // Spin
    await page.getByRole('button', { name: /spin/i }).click();
    await page.waitForTimeout(3000);

    // Check for log update
    const rouletteMsg = await page.locator('.animate-pulse').first().textContent();
    console.log('Roulette Result:', rouletteMsg);

    // --- CRAPS TEST ---
    console.log('Testing Craps...');
    await page.getByRole('button', { name: /^games$/i }).click();
    await page.getByPlaceholder(/type command/i).fill('craps');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Place Pass Line bet
    await openBetsMenu();
    await page.getByRole('button', { name: /^pass$/i }).click();
    await closeBetsMenu();

    // Roll
    await page.getByRole('button', { name: /roll/i }).click();
    await page.waitForTimeout(2000);

    const crapsMsg = await page.locator('.animate-pulse').first().textContent();
    console.log('Craps Result:', crapsMsg);

    console.log('Mobile tests completed successfully.');
  } catch (e) {
    console.error('Test failed:', e);
    // Take screenshot on failure
    try {
        // await page.screenshot({ path: 'failure.png' });
    } catch {}
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();