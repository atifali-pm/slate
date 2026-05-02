import { chromium } from "playwright";
import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SCREENSHOT_DIR = "/home/atif/projects/slate/screenshots";

if (!process.env.SKIP_SEED) {
  console.log("seeding database...");
  execSync("pnpm db:seed", { stdio: "ignore", cwd: "/home/atif/projects/slate" });
}

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const pass = (msg) => console.log(`PASS: ${msg}`);

async function signIn(page, email, password) {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL(`${BASE}/dashboard`),
    page.click('button[type="submit"]'),
  ]);
}

const browser = await chromium.launch({ headless: true });

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
  ctx.on("page", (p) => p.on("pageerror", (err) => console.log("PAGEERROR:", err.message)));
  const page = await ctx.newPage();
  await signIn(page, "maria@bellas-salon.test", "demo1234");

  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector('[data-testid="analytics-cards"]', { timeout: 5000 });

  // ---- Test 1: KPI tiles render with non-empty values ----
  for (const id of ["kpi-today", "kpi-next7", "kpi-cancel-rate", "kpi-30day"]) {
    const tile = page.locator(`[data-testid="${id}"]`);
    if (!(await tile.isVisible())) fail(`KPI ${id} not visible`);
    const value = (await tile.locator(".text-3xl").textContent())?.trim();
    if (!value) fail(`${id} has empty headline value`);
    pass(`${id} renders: ${value}`);
  }

  // ---- Test 2: 30-day volume sane (Bella's seed has 60 bookings spread +/-30d, so ~30 in last 30) ----
  const volumeText = await page.locator('[data-testid="kpi-30day"] .text-3xl').textContent();
  const volume = parseInt(volumeText?.trim() ?? "0", 10);
  if (Number.isNaN(volume) || volume < 1) fail(`30-day volume looks wrong: ${volumeText}`);
  pass(`30-day volume sane: ${volume}`);

  // ---- Test 3: top services card shows at least one row ----
  const serviceRows = await page
    .locator('[data-testid="top-services-card"] [data-testid^="top-service-"]')
    .count();
  if (serviceRows === 0) fail("top services card is empty");
  pass(`top services renders ${serviceRows} entries`);

  // ---- Test 4: staff utilization renders all 3 staff in Bella's seed ----
  const utilRows = await page
    .locator('[data-testid="utilization-card"] [data-testid^="util-"]')
    .count();
  if (utilRows < 3) fail(`expected at least 3 staff in utilization card, got ${utilRows}`);
  pass(`utilization renders ${utilRows} staff`);

  // ---- Test 5: cross-org isolation - Pinecrest analytics differ from Bella's ----
  const trigger = page.locator('[data-slot=dropdown-menu-trigger]');
  await trigger.click();
  await page.waitForSelector('[role=menu]');
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/dashboard",
    ),
    page.locator('[role=menuitem]', { hasText: "Pinecrest Clinic" }).click(),
  ]);
  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector('[data-testid="analytics-cards"]');
  const pinecrestVolumeText = await page.locator('[data-testid="kpi-30day"] .text-3xl').textContent();
  const pinecrestVolume = parseInt(pinecrestVolumeText?.trim() ?? "0", 10);
  // Pinecrest has 30 bookings vs Bella's 60; volumes must differ
  if (pinecrestVolume === volume) {
    fail(`Pinecrest 30-day volume (${pinecrestVolume}) matches Bella's (${volume}); analytics not org-scoped`);
  }
  pass(`analytics scoped per org: Bella's=${volume}, Pinecrest=${pinecrestVolume}`);

  // ---- Capture screenshots ----
  // switch back to Bella's for the headline screenshot
  await trigger.click();
  await page.waitForSelector('[role=menu]');
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/dashboard",
    ),
    page.locator('[role=menuitem]', { hasText: "Bella's Salon" }).click(),
  ]);
  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector('[data-testid="analytics-cards"]');
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/10-analytics-home.png`,
    fullPage: false,
  });
  pass(`captured 10-analytics-home.png`);

  // capture a focused list view by scrolling past the analytics
  await page.evaluate(() => window.scrollTo({ top: 540, behavior: "instant" }));
  await page.waitForTimeout(150);
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/03-dashboard.png`,
    fullPage: false,
  });
  pass(`refreshed 03-dashboard.png with filters + table in frame`);

  console.log("\nALL PHASE 5 CHECKS PASSED");
} catch (err) {
  console.error("\nUNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
} finally {
  await browser.close();
}
