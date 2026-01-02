import { chromium, devices } from 'playwright-core';
import process from 'node:process';

const BASE_URL = 'http://127.0.0.1:3000';
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

    // Initial setup
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('nullspace_touch_mode', 'true');
    });

    console.log('Navigating to home...');
    await page.goto('/');
    await page.getByRole('button', { name: /cash game/i }).click();
    await page.waitForTimeout(1000);

    // Helpers
    const openHamburger = async () => {
        const menuBtn = page.getByLabel('Menu');
        if (await menuBtn.isVisible()) {
            await menuBtn.click();
            await page.waitForTimeout(500);
        }
    };
    const openBetsMenu = async () => {
        const betsBtn = page.getByLabel('Bets').first();
        if (await betsBtn.isVisible()) {
            console.log('Opening Bets Menu...');
            await betsBtn.click();
            await page.waitForTimeout(500);
            return;
        }
        const desktopBetsBtn = page.getByLabel('Game controls').getByRole('button', { name: /^BETS/i });
        if (await desktopBetsBtn.isVisible()) {
            console.log('Opening Bets Menu (desktop control)...');
            await desktopBetsBtn.click();
            await page.waitForTimeout(500);
        } else {
            console.log('Bets Menu button not visible.');
        }
    };
    const closeBetsMenu = async () => {
        const closeBtn = page.getByLabel('Close Bets');
        if (await closeBtn.isVisible()) {
            console.log('Closing Bets Menu...');
            await closeBtn.click();
            await page.waitForTimeout(500);
            return;
        }
        const legacyCloseBtn = page.getByRole('button', { name: /\[CLOSE\]/i });
        if (await legacyCloseBtn.isVisible()) {
            console.log('Closing Bets Menu (legacy)...');
            await legacyCloseBtn.click();
            await page.waitForTimeout(500);
        }
    };
    const getBetsScope = async () => {
        const drawer = page.getByTestId('bets-drawer-panel');
        try {
            if (await drawer.isVisible()) return drawer;
        } catch {
            // ignore
        }
        return page;
    };
    const goToGame = async (gameName) => {
        console.log('');
        console.log(`--- Testing ${gameName} ---`);
        await page.getByRole('button', { name: /^games$/i }).click();
        await page.getByPlaceholder(/search nullspace/i).fill(gameName);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
        let header = null;
        try {
            header = await page.locator('h1').first().textContent({ timeout: 2000 });
        } catch {
            header = null;
        }
        console.log(`Loaded game: ${header ?? gameName}`);
    };
    const getLog = async () => {
        const logLocator = page.locator('.animate-pulse').first();
        try {
            return await logLocator.textContent({ timeout: 2000 });
        } catch {
            return 'No live log captured';
        }
    };

    // 1. BACCARAT
    await goToGame('baccarat');
    await openBetsMenu();
    const baccaratBets = await getBetsScope();
    await baccaratBets.getByRole('button', { name: /player/i }).first().click();
    await closeBetsMenu();
    await page.getByRole('button', { name: /deal/i }).click();
    await page.waitForTimeout(2000);
    console.log('Result:', await getLog());

    // 2. BLACKJACK
    await goToGame('blackjack');
    await page.getByRole('button', { name: /deal/i }).click();
    await page.waitForTimeout(1000);
    if (await page.getByRole('button', { name: /stand/i }).isVisible()) {
        await page.getByRole('button', { name: /stand/i }).click();
    }
    await page.waitForTimeout(2000);
    console.log('Result:', await getLog());

    // 3. CRAPS
    await goToGame('craps');
    await openBetsMenu();
    const crapsBets = await getBetsScope();
    await crapsBets.getByRole('button', { name: /^pass$/i }).first().click();
    await closeBetsMenu();
    await page.getByRole('button', { name: /roll/i }).click();
    await page.waitForTimeout(2000);
    console.log('Result:', await getLog());

    // 4. ROULETTE
    await goToGame('roulette');
    await openBetsMenu();
    const rouletteBets = await getBetsScope();
    await rouletteBets.getByRole('button', { name: /red/i }).first().click();
    await closeBetsMenu();
    await page.getByRole('button', { name: /spin/i }).click();
    await page.waitForTimeout(3000);
    console.log('Result:', await getLog());

    // 5. CASINO WAR
    await goToGame('war');
    await page.getByRole('button', { name: /deal/i }).click();
    await page.waitForTimeout(2000);
    if (await page.getByRole('button', { name: /^war$/i }).isVisible()) {
        await page.getByRole('button', { name: /^war$/i }).click();
        await page.waitForTimeout(2000);
    }
    console.log('Result:', await getLog());

    // 6. HILO
    await goToGame('hilo');
    // If playing, cashout to reset
    if (await page.getByRole('button', { name: /cashout/i }).isVisible()) {
        await page.getByRole('button', { name: /cashout/i }).click();
        await page.waitForTimeout(1000);
    }
    // Deal if available
    if (await page.getByRole('button', { name: /deal/i }).isVisible()) {
        await page.getByRole('button', { name: /deal/i }).click();
        await page.waitForTimeout(1000);
    }
    // Pick Higher
    if (await page.getByRole('button', { name: /higher/i }).isVisible()) {
        await page.getByRole('button', { name: /higher/i }).click();
        await page.waitForTimeout(1500);
    }
    console.log('Result:', await getLog());

    // 7. SIC BO
    await goToGame('sic_bo');
    await openBetsMenu();
    const sicBoBets = await getBetsScope();
    await sicBoBets.getByRole('button', { name: /small/i }).first().click();
    await closeBetsMenu();
    await page.getByRole('button', { name: /roll/i }).click();
    await page.waitForTimeout(2000);
    console.log('Result:', await getLog());

    // 8. THREE CARD POKER
    await goToGame('three_card');
    await page.getByRole('button', { name: /deal/i }).click();
    await page.waitForTimeout(1000);
    if (await page.getByRole('button', { name: /play/i }).isVisible()) {
        await page.getByRole('button', { name: /play/i }).click();
        await page.waitForTimeout(2000);
    }
    if (await page.getByRole('button', { name: /reveal/i }).isVisible()) {
        await page.getByRole('button', { name: /reveal/i }).click();
        await page.waitForTimeout(2000);
    }
    console.log('Result:', await getLog());

    // 9. ULTIMATE HOLDEM
    await goToGame('ultimate_holdem');
    await page.getByRole('button', { name: /deal/i }).click();
    await page.waitForTimeout(1000);
    if (await page.getByRole('button', { name: /check/i }).isVisible()) {
        await page.getByRole('button', { name: /check/i }).click();
        await page.waitForTimeout(1000);
    }
    console.log('Result:', await getLog());

    // 10. VIDEO POKER
    await goToGame('video_poker');
    if (await page.getByRole('button', { name: /deal/i }).isVisible()) {
        await page.getByRole('button', { name: /deal/i }).click();
        await page.waitForTimeout(1000);
    }
    await page.getByRole('button', { name: /draw/i }).click();
    await page.waitForTimeout(1500);
    console.log('Result:', await getLog());

    // 11. SWAP
    console.log('');
    console.log('--- Testing Swap ---');
    await openHamburger();
    await page.getByRole('link', { name: /swap/i }).click();
    await page.waitForTimeout(1000);
    if (await page.getByText(/swap/i).first().isVisible()) {
        console.log('Swap UI loaded');
    } else {
        console.error('Swap UI not found');
    }

    // 12. STAKE
    console.log('');
    console.log('--- Testing Stake ---');
    await openHamburger();
    await page.getByRole('link', { name: /stake/i }).click();
    await page.waitForTimeout(1000);
    if (await page.getByText(/staking/i).first().isVisible()) {
        console.log('Stake UI loaded');
    } else {
        console.error('Stake UI not found');
    }

    console.log('');
    console.log('All tests completed.');
  } catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
