import { chromium, firefox, webkit } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const BASE_URL = process.env.LAYOUT_BASE_URL ?? "http://127.0.0.1:3000";
const CHROMIUM_PATH = process.env.PW_CHROMIUM_PATH || "/usr/bin/chromium";
const CHROME_PATH = process.env.PW_CHROME_PATH || "/usr/bin/google-chrome-stable";
const PLAYWRIGHT_CACHE = process.env.HOME
  ? path.join(process.env.HOME, ".cache", "ms-playwright")
  : null;
const resolvePlaywrightBinary = (prefixes, relativePath) => {
  if (!PLAYWRIGHT_CACHE) return null;
  try {
    const entries = fs
      .readdirSync(PLAYWRIGHT_CACHE, { withFileTypes: true })
      .filter((entry) => entry.isDirectory());
    const matches = entries
      .filter((entry) => prefixes.some((prefix) => entry.name.startsWith(prefix)))
      .map((entry) => path.join(PLAYWRIGHT_CACHE, entry.name, relativePath))
      .filter((candidate) => fs.existsSync(candidate))
      .sort();
    return matches.at(-1) ?? null;
  } catch {
    return null;
  }
};
const DEFAULT_FIREFOX_PATH = resolvePlaywrightBinary(
  ["firefox-"],
  path.join("firefox", "firefox"),
);
const DEFAULT_WEBKIT_PATH = resolvePlaywrightBinary(
  ["webkit"],
  path.join("minibrowser-gtk", "bin", "MiniBrowser"),
);
const FIREFOX_PATH = process.env.PW_FIREFOX_PATH || DEFAULT_FIREFOX_PATH;
const WEBKIT_PATH = process.env.PW_WEBKIT_PATH || DEFAULT_WEBKIT_PATH;
const DEFAULT_WEBKIT_LIB_PATH = process.env.HOME
  ? path.join(process.env.HOME, ".cache", "nullspace-webkit-libs", "lib")
  : null;
const WEBKIT_LIB_PATH =
  process.env.PW_WEBKIT_LIB_PATH ||
  (DEFAULT_WEBKIT_LIB_PATH && fs.existsSync(DEFAULT_WEBKIT_LIB_PATH)
    ? DEFAULT_WEBKIT_LIB_PATH
    : undefined);
const HEADLESS = !process.env.HEADED;
const BROWSERS = (process.env.PW_BROWSERS || "chromium")
  .split(",")
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean);

const viewports = [
  { name: "mobile", width: 360, height: 740, touch: true },
  { name: "large-mobile", width: 430, height: 932, touch: true },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

const games = [
  { name: "baccarat", drawers: ["BETS"] },
  { name: "blackjack", drawers: ["BETS"] },
  { name: "craps", drawers: ["BETS", "BONUS"] },
  { name: "roulette", drawers: ["BETS"] },
  { name: "sic_bo", drawers: ["BETS"] },
  { name: "three_card", drawers: ["BETS"] },
  { name: "ultimate_holdem", drawers: ["BETS"] },
  { name: "video_poker", drawers: [] },
  { name: "casino_war", drawers: [] },
  { name: "hilo", drawers: [] },
];

const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const assertNoHorizontalOverflow = async (page, label) => {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const maxWidth = Math.max(doc.scrollWidth, body.scrollWidth);
    return { maxWidth, innerWidth: window.innerWidth };
  });
  if (metrics.maxWidth > metrics.innerWidth + 1) {
    throw new Error(`${label}: horizontal overflow (${metrics.maxWidth}px > ${metrics.innerWidth}px)`);
  }
};

const openGame = async (page, gameName) => {
  await page.getByRole("button", { name: /^games$/i }).click();
  await page.getByPlaceholder(/search nullspace|type command/i).fill(gameName);
  await page
    .getByText(new RegExp(`^${escapeRegex(gameName)}$`, "i"))
    .first()
    .click();
  await page.getByText(/status:/i).first().waitFor();
  await page.waitForTimeout(300);
};

const findDrawerButton = async (page, label) => {
  const regex = new RegExp(`^${label}$`, "i");
  const controlBar = page.getByLabel("Game controls");
  if ((await controlBar.count()) > 0) {
    const button = controlBar.getByRole("button", { name: regex });
    if ((await button.count()) > 0) return button.first();
  }
  const fallback = page.getByRole("button", { name: regex });
  if ((await fallback.count()) > 0) return fallback.first();
  return null;
};

const validateDrawer = async (page, label, viewport) => {
  const button = await findDrawerButton(page, label);
  if (!button) {
    console.warn(`[layout] missing ${label} button`);
    return;
  }
  if (!(await button.isVisible())) {
    return;
  }
  await button.click();
  const panel = page.locator(
    `[data-testid="mobile-drawer-panel"][data-drawer-label="${label}"]`,
  );
  await panel.waitFor({ state: "visible", timeout: 5000 });
  const box = await panel.boundingBox();
  ensure(box, "Drawer panel not visible");
  ensure(box.x >= 0, "Drawer panel clipped left");
  ensure(box.y >= 0, "Drawer panel clipped top");
  ensure(box.x + box.width <= viewport.width + 1, "Drawer panel clipped right");
  ensure(box.y + box.height <= viewport.height + 1, "Drawer panel clipped bottom");
  const escButton = page.getByRole("button", { name: /^esc$/i });
  if (await escButton.isVisible().catch(() => false)) {
    await escButton.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await panel.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
};

async function runViewport(browserType, viewport) {
  console.log(`[layout] ${browserType} · viewport: ${viewport.name}`);
  const launchOptions = {
    headless: HEADLESS,
    args:
      browserType === "chromium" || browserType === "chrome"
        ? ["--no-sandbox", "--disable-dev-shm-usage"]
        : [],
  };
  if ((browserType === "chromium" || browserType === "chrome") && CHROMIUM_PATH) {
    launchOptions.executablePath = CHROMIUM_PATH;
  }
  if (browserType === "chrome" && CHROME_PATH) {
    launchOptions.executablePath = CHROME_PATH;
  } else if (browserType === "firefox" && FIREFOX_PATH) {
    launchOptions.executablePath = FIREFOX_PATH;
  } else if (browserType === "webkit" && WEBKIT_PATH) {
    launchOptions.executablePath = WEBKIT_PATH;
  }
  if (browserType === "webkit" && (WEBKIT_LIB_PATH || WEBKIT_PATH)) {
    const libPaths = [];
    const appendPaths = (value) => {
      if (!value) return;
      for (const entry of value.split(":").filter(Boolean)) {
        if (!libPaths.includes(entry)) libPaths.push(entry);
      }
    };
    const webkitLibDir = WEBKIT_PATH
      ? path.resolve(WEBKIT_PATH, "..", "..", "lib")
      : null;
    appendPaths(WEBKIT_LIB_PATH);
    appendPaths(webkitLibDir);
    appendPaths(process.env.LD_LIBRARY_PATH);
    if (libPaths.length > 0) {
      launchOptions.env = { ...process.env, LD_LIBRARY_PATH: libPaths.join(":") };
    }
  }
  const browserLauncher =
    browserType === "firefox" ? firefox : browserType === "webkit" ? webkit : chromium;
  const browser = await browserLauncher.launch(launchOptions);

  try {
    const contextOptions = {
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: Boolean(viewport.touch),
      baseURL: BASE_URL,
    };
    if (browserType !== "firefox") {
      contextOptions.isMobile = Boolean(viewport.touch);
    } else {
      contextOptions.contrast = "no-override";
    }
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.addInitScript(() => {
      localStorage.setItem("nullspace_touch_mode", "true");
    });

    await page.goto("/");
    await page.getByRole("button", { name: /cash game/i }).click();
    await page.waitForTimeout(500);

    for (const game of games) {
      await openGame(page, game.name);
      await assertNoHorizontalOverflow(page, `${viewport.name}/${game.name}`);
      if (viewport.width < 768 && game.drawers.length > 0) {
        for (const label of game.drawers) {
          await validateDrawer(page, label, viewport);
        }
      }
    }
  } finally {
    await browser.close();
  }
}

async function run() {
  if (
    BROWSERS.includes("webkit") &&
    process.platform === "linux" &&
    !WEBKIT_LIB_PATH
  ) {
    console.warn(
      "[layout] WebKit runtime libs missing; run website/scripts/setup-webkit-libs.sh and set PW_WEBKIT_LIB_PATH.",
    );
  }
  if (BROWSERS.includes("firefox") && !FIREFOX_PATH) {
    console.warn(
      "[layout] Firefox binary not found; set PW_FIREFOX_PATH or install Playwright Firefox.",
    );
  }
  if (BROWSERS.includes("webkit") && !WEBKIT_PATH) {
    console.warn(
      "[layout] WebKit binary not found; set PW_WEBKIT_PATH or install Playwright WebKit.",
    );
  }
  for (const browserType of BROWSERS) {
    for (const viewport of viewports) {
      await runViewport(browserType, viewport);
    }
  }
  console.log(`[layout] complete (${BROWSERS.join(", ")})`);
}

run().catch((error) => {
  console.error("[layout] failed:", error.message ?? error);
  process.exit(1);
});
