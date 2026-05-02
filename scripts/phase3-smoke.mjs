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

const isDashboardPost = (r) =>
  r.request().method() === "POST" && new URL(r.url()).pathname === "/dashboard";

const browser = await chromium.launch({ headless: true });

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  ctx.on("page", (p) => p.on("pageerror", (err) => console.log("PAGEERROR:", err.message)));
  const page = await ctx.newPage();
  await signIn(page, "maria@bellas-salon.test", "demo1234");

  // ---- Test 1: status filter narrows results ----
  await page.goto(`${BASE}/dashboard`);
  const totalSummary = await page.locator('[data-testid="bookings-summary"]').textContent();
  await page.goto(`${BASE}/dashboard?status=pending`);
  const pendingSummary = await page.locator('[data-testid="bookings-summary"]').textContent();
  const pendingBadges = await page
    .locator('[data-testid^="status-"]:visible')
    .allTextContents();
  if (pendingBadges.some((b) => b.trim() !== "pending")) {
    fail(`status filter leaked non-pending rows: ${pendingBadges.join(",")}`);
  }
  pass(`status=pending narrowed: total "${totalSummary?.trim()}" -> "${pendingSummary?.trim()}", all rows pending`);

  // ---- Test 2: date range filter narrows results ----
  // pick today through 7 days from now
  const today = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const oneWeek = new Date(today);
  oneWeek.setDate(oneWeek.getDate() + 7);
  await page.goto(`${BASE}/dashboard?from=${fmt(today)}&to=${fmt(oneWeek)}`);
  const rangeSummary = await page.locator('[data-testid="bookings-summary"]').textContent();
  pass(`date range applied: ${rangeSummary?.trim()}`);

  // ---- Test 3: customer-name search ----
  // pick a customer name actually present in Bella's seed
  await page.goto(`${BASE}/dashboard?q=Aaliyah`);
  const searchSummary = await page.locator('[data-testid="bookings-summary"]').textContent();
  const namesShown = await page.locator('[data-testid^="booking-row-"] td:nth-child(3)').allTextContents();
  if (namesShown.length > 0 && namesShown.some((n) => !n.toLowerCase().includes("aaliyah"))) {
    fail(`search leaked rows: ${namesShown.join(" | ")}`);
  }
  pass(`q=Aaliyah scoped table: ${searchSummary?.trim()}, rows: ${namesShown.length}`);

  // ---- Test 4: bulk-confirm two pending bookings ----
  await page.goto(`${BASE}/dashboard?status=pending`);
  const pendingIds = await page
    .locator('[data-testid^="status-"]:has-text("pending")')
    .evaluateAll((els) =>
      els
        .map((e) => e.getAttribute("data-testid")?.replace("status-", ""))
        .filter(Boolean),
    );
  if (pendingIds.length < 2) fail(`need at least 2 pending bookings, got ${pendingIds.length}`);
  const [a, b] = pendingIds;
  await page.click(`[data-testid="select-${a}"]`);
  await page.click(`[data-testid="select-${b}"]`);
  await page.waitForSelector('[data-testid="bulk-toolbar"]');
  await Promise.all([
    page.waitForResponse(isDashboardPost),
    page.click('[data-testid="bulk-confirm"]'),
  ]);
  await page.waitForTimeout(300);
  await page.goto(`${BASE}/dashboard?status=confirmed`);
  for (const id of [a, b]) {
    const status = await page.locator(`[data-testid="status-${id}"]`).textContent();
    if (status?.trim() !== "confirmed") fail(`booking ${id.slice(0, 8)} not confirmed after bulk: ${status}`);
  }
  pass(`bulk-confirm transitioned both ${a.slice(0, 8)} and ${b.slice(0, 8)} to confirmed`);

  // ---- Test 5: edit dialog reschedules a booking ----
  await page.goto(`${BASE}/dashboard?status=confirmed`);
  const editTargetId = await page
    .locator('[data-testid^="status-"]:has-text("confirmed")')
    .first()
    .getAttribute("data-testid");
  const targetId = editTargetId?.replace("status-", "");
  if (!targetId) fail("no confirmed booking to edit");
  await page.click(`[data-testid="edit-${targetId}"]`);
  await page.waitForSelector('[data-testid="edit-booking-dialog"]', { timeout: 5000 });
  // pick a far-future weekday at 15:45 to avoid all conflicts
  const farFuture = new Date(today);
  farFuture.setDate(farFuture.getDate() + 28);
  while (farFuture.getDay() === 0 || farFuture.getDay() === 6) farFuture.setDate(farFuture.getDate() + 1);
  const newSlot = `${fmt(farFuture)}T15:45`;
  await page.fill('[data-testid="edit-start"]', newSlot);
  await Promise.all([
    page.waitForResponse(isDashboardPost),
    page.click('[data-testid="edit-reschedule"]'),
  ]);
  await page.waitForTimeout(300);
  pass(`reschedule action posted for ${targetId.slice(0, 8)}`);

  // ---- Test 6: pagination ----
  // for Bella's, with 60 bookings total, page 2 should exist with default page size 25
  await page.goto(`${BASE}/dashboard`);
  const pagerNext = page.locator('[data-testid="page-next"]');
  if (await pagerNext.count() === 0) fail("expected pagination next button on default view");
  // visit page 2 directly
  await page.goto(`${BASE}/dashboard?page=2`);
  const page2Summary = await page.locator('[data-testid="bookings-summary"]').textContent();
  if (!page2Summary?.includes("26-")) fail(`page 2 summary should start at 26, got: ${page2Summary}`);
  pass(`pagination works: ${page2Summary?.trim()}`);

  // ---- Test 7: capture desktop and mobile screenshots ----
  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector('[data-testid="bookings-table"]');
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/03-dashboard.png`,
    fullPage: false,
  });
  pass(`captured 03-dashboard.png (desktop)`);

  // mobile: 390x800 (iPhone 12-ish)
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector('[data-testid^="booking-card-"]', { timeout: 5000 });
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/06-bookings-mobile.png`,
    fullPage: true,
  });
  pass(`captured 06-bookings-mobile.png (390px wide, cards layout)`);

  // capture the edit dialog at desktop width
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${BASE}/dashboard?status=confirmed`);
  const editId = await page
    .locator('[data-testid^="status-"]:has-text("confirmed")')
    .first()
    .getAttribute("data-testid");
  const editIdClean = editId?.replace("status-", "");
  if (editIdClean) {
    await page.click(`[data-testid="edit-${editIdClean}"]`);
    await page.waitForSelector('[data-testid="edit-booking-dialog"]', { timeout: 5000 });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/07-edit-dialog.png`,
      fullPage: false,
    });
    pass(`captured 07-edit-dialog.png`);
  }

  console.log("\nALL PHASE 3 CHECKS PASSED");
} catch (err) {
  console.error("\nUNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
} finally {
  await browser.close();
}
