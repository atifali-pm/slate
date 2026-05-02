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

function nextWeekdayDateTimeLocal(hour = 14, minute = 30, daysOffset = 7) {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(minute);
  d.setHours(hour);
  d.setDate(d.getDate() + daysOffset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}`;
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL(`${BASE}/dashboard`),
    page.click('button[type="submit"]'),
  ]);
}

async function openNewBookingDialog(page) {
  await page.click('[data-testid="open-new-booking"]');
  await page.waitForSelector('[data-testid="new-booking-dialog"]', { timeout: 5000 });
}

async function fillBookingForm(page, { startAt }) {
  // pick the first option in each select that is not the disabled placeholder
  for (const name of ["customerId", "serviceId", "staffUserId"]) {
    const sel = page.locator(`[data-testid="new-booking-form"] select[name="${name}"]`);
    const options = await sel
      .locator("option:not([disabled])")
      .evaluateAll((els) => els.map((e) => e.value).filter(Boolean));
    if (options.length === 0) fail(`no options for ${name}`);
    await sel.selectOption(options[0]);
  }
  const start = page.locator('[data-testid="new-booking-form"] input[name="startAt"]');
  await start.fill(startAt);
}

async function submitForm(page) {
  // expect either dialog closes (success) or error appears (failure)
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/dashboard",
    ),
    page.click('[data-testid="new-booking-submit"]'),
  ]);
  await page.waitForFunction(() => {
    const err = document.querySelector('[data-testid="new-booking-error"]');
    const dialog = document.querySelector('[data-testid="new-booking-dialog"]');
    // either error message visible, or dialog closed
    return Boolean(err) || !dialog;
  }, { timeout: 5000 });
}

async function getDialogResult(page) {
  const err = await page.locator('[data-testid="new-booking-error"]').textContent().catch(() => null);
  if (err) return { ok: false, message: err };
  return { ok: true, message: "dialog closed" };
}

const browser = await chromium.launch({ headless: true });
function attachLogging(ctx) {
  ctx.on("page", (page) => {
    page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
  });
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  attachLogging(ctx);
  const page = await ctx.newPage();
  await signIn(page, "maria@bellas-salon.test", "demo1234");

  // ---- Test 1: create a booking at a known-empty future slot ----
  const future = nextWeekdayDateTimeLocal(14, 33, 14);
  await openNewBookingDialog(page);
  await fillBookingForm(page, { startAt: future });
  await submitForm(page);
  const result1 = await getDialogResult(page);
  if (!result1.ok) fail(`expected booking success, got: ${result1.message}`);
  pass(`created booking at ${future}`);

  // ---- Test 2: same slot/staff/service again => conflict ----
  await page.goto(`${BASE}/dashboard`);
  await openNewBookingDialog(page);
  await fillBookingForm(page, { startAt: future });
  await submitForm(page);
  const result2 = await getDialogResult(page);
  if (result2.ok) fail("expected conflict, dialog closed instead");
  if (!result2.message.toLowerCase().includes("conflict")) {
    fail(`expected conflict error, got: ${result2.message}`);
  }
  pass(`conflict rejected: ${result2.message.trim()}`);
  await page.click('[data-slot=dialog-close]').catch(() => {});

  // ---- Test 3: outside availability (8am before the 9am rule) => rejected ----
  await page.goto(`${BASE}/dashboard`);
  const earlyMorning = nextWeekdayDateTimeLocal(8, 0, 21);
  await openNewBookingDialog(page);
  await fillBookingForm(page, { startAt: earlyMorning });
  await submitForm(page);
  const result3 = await getDialogResult(page);
  if (result3.ok) fail("expected availability rejection, dialog closed instead");
  if (!result3.message.toLowerCase().includes("working hours") &&
      !result3.message.toLowerCase().includes("availability")) {
    fail(`expected availability error, got: ${result3.message}`);
  }
  pass(`outside availability rejected: ${result3.message.trim()}`);
  await page.click('[data-slot=dialog-close]').catch(() => {});

  // ---- Test 4: confirm a pending booking ----
  await page.goto(`${BASE}/dashboard?status=pending`);
  const pendingBadge = page.locator('[data-testid^="status-"]:has-text("pending")').first();
  if (!(await pendingBadge.isVisible())) fail("no pending booking visible to confirm");
  const pendingId = (await pendingBadge.getAttribute("data-testid"))?.replace("status-", "");
  if (!pendingId) fail("could not extract booking id from pending row");
  const confirmBtn = page.locator(`[data-testid="action-confirmed-${pendingId}"]`);
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/dashboard",
    ),
    confirmBtn.click(),
  ]);
  await page.waitForTimeout(300);
  // re-fetch with the same id; the row should now show "confirmed" or be gone (filtered out of pending view)
  await page.goto(`${BASE}/dashboard?status=confirmed`);
  const newStatus = await page.locator(`[data-testid="status-${pendingId}"]`).textContent();
  if (newStatus?.trim() !== "confirmed") fail(`expected confirmed, got ${newStatus}`);
  pass(`status transition pending -> confirmed succeeded for ${pendingId.slice(0, 8)}`);

  // ---- Test 5: cross-org isolation ----
  const trigger = page.locator('[data-slot=dropdown-menu-trigger]');
  await trigger.click();
  await page.waitForSelector('[role=menu]', { timeout: 5000 });
  const pinecrestItem = page.locator('[role=menuitem]', { hasText: "Pinecrest Clinic" });
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/dashboard",
    ),
    pinecrestItem.click(),
  ]);
  await page.goto(`${BASE}/dashboard`);
  const pinecrestNav = await page.locator('[data-slot=dropdown-menu-trigger]').textContent();
  if (!pinecrestNav?.includes("Pinecrest")) fail(`switch did not stick; nav: ${pinecrestNav}`);
  // Pinecrest dashboard summary should show 30 total bookings, not Bella's 60-something
  const summary = await page.locator('[data-testid="bookings-summary"]').textContent();
  if (summary?.includes("60") || summary?.includes("61")) {
    fail(`Pinecrest dashboard summary suggests Bella's data leaked: ${summary}`);
  }
  pass(`Pinecrest dashboard scoped correctly: ${summary?.trim()}`);

  // capture Pinecrest for cross-tenant proof
  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector('[data-testid="bookings-summary"]');
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/05-dashboard-pinecrest.png`,
    fullPage: false,
  });
  pass(`captured 05-dashboard-pinecrest.png`);

  console.log("\nALL PHASE 2 CHECKS PASSED");
} catch (err) {
  console.error("\nUNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
} finally {
  await browser.close();
}
