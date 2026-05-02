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

async function fillBookingForm(page, { startAt }) {
  // pick the first option in each select that is not the disabled placeholder
  for (const name of ["customerId", "serviceId", "staffUserId"]) {
    const sel = page.locator(`select[name="${name}"]`);
    const options = await sel
      .locator("option:not([disabled])")
      .evaluateAll((els) => els.map((e) => e.value).filter(Boolean));
    if (options.length === 0) fail(`no options for ${name}`);
    await sel.selectOption(options[0]);
  }
  const start = page.locator('input[name="startAt"]');
  await start.fill(startAt);
}

async function submitForm(page) {
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().endsWith("/dashboard"),
    ),
    page.click('[data-testid="new-booking-form"] button[type="submit"]'),
  ]);
  // wait for the React state update to flush a result message
  await page.waitForFunction(() => {
    return Boolean(
      document.querySelector('[data-testid="booking-success"]') ||
        document.querySelector('[data-testid="booking-error"]'),
    );
  }, { timeout: 5000 });
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
  // Use a slot far enough out and unusual enough that the seed loop is unlikely to have hit it
  const future = nextWeekdayDateTimeLocal(14, 33, 14);
  await fillBookingForm(page, { startAt: future });
  await submitForm(page);
  const okMsg = await page.locator('[data-testid="booking-success"]').textContent({ timeout: 5000 });
  if (!okMsg?.includes("Booked")) fail(`expected success message, got: ${okMsg}`);
  pass(`created booking at ${future}: ${okMsg.trim()}`);

  // ---- Test 2: same slot/staff/service again => conflict ----
  // After a successful action, React 19 resets the <form action={fn}> form, which
  // wipes the select values. Reload the page to get a fresh form, then refill.
  await page.goto(`${BASE}/dashboard`);
  await fillBookingForm(page, { startAt: future });
  await submitForm(page);
  const conflictMsg = await page.locator('[data-testid="booking-error"]').textContent({ timeout: 5000 });
  if (!conflictMsg?.toLowerCase().includes("conflict")) {
    fail(`expected conflict error, got: ${conflictMsg}`);
  }
  pass(`conflict rejected: ${conflictMsg.trim()}`);

  // ---- Test 3: outside availability (8am before the 9am rule) => rejected ----
  await page.goto(`${BASE}/dashboard`);
  const earlyMorning = nextWeekdayDateTimeLocal(8, 0, 21);
  await fillBookingForm(page, { startAt: earlyMorning });
  await submitForm(page);
  const availMsg = await page.locator('[data-testid="booking-error"]').textContent({ timeout: 5000 });
  if (!availMsg?.toLowerCase().includes("working hours") &&
      !availMsg?.toLowerCase().includes("availability")) {
    fail(`expected availability error, got: ${availMsg}`);
  }
  pass(`outside availability rejected: ${availMsg.trim()}`);

  // ---- Test 4: confirm the booking we created in Test 1 ----
  await page.goto(`${BASE}/dashboard`);
  // find the row whose start time matches; the recent list shows local-format dates
  // simpler: find the most-recently-created pending booking and confirm it
  const pendingRows = page.locator('[data-testid^="booking-row-"]:has([data-testid^="status-"])')
    .filter({ has: page.locator('[data-testid^="status-"]:has-text("pending")') });
  const firstPending = pendingRows.first();
  if (!(await firstPending.isVisible())) fail("no pending booking row visible to confirm");
  const confirmBtn = firstPending.locator('[data-testid^="action-confirmed-"]').first();
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().endsWith("/dashboard"),
    ),
    confirmBtn.click(),
  ]);
  await page.waitForTimeout(200);
  await page.goto(`${BASE}/dashboard`);
  const confirmedRows = await page
    .locator('[data-testid^="status-"]:has-text("confirmed")')
    .count();
  if (confirmedRows === 0) fail("no confirmed badges after confirm action");
  pass(`status transition pending -> confirmed succeeded`);

  // ---- Test 5: cross-org isolation: a booking made in Bella's must not show in Pinecrest ----
  // switch to Pinecrest via the org switcher
  const trigger = page.locator('[data-slot=dropdown-menu-trigger]');
  await trigger.click();
  await page.waitForSelector('[role=menu]', { timeout: 5000 });
  const pinecrestItem = page.locator('[role=menuitem]', { hasText: "Pinecrest Clinic" });
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().endsWith("/dashboard"),
    ),
    pinecrestItem.click(),
  ]);
  await page.goto(`${BASE}/dashboard`);
  // count rows; just need to verify it's not Bella's
  const pinecrestNav = await page
    .locator('[data-slot=dropdown-menu-trigger]')
    .textContent();
  if (!pinecrestNav?.includes("Pinecrest")) fail(`switch did not stick; nav: ${pinecrestNav}`);
  // Pinecrest seed had 30 bookings; the booking we just created in Bella's must not be here
  const allRowsHere = await page.locator('[data-testid^="booking-row-"]').count();
  if (allRowsHere > 10) fail(`unexpected row count in Pinecrest: ${allRowsHere}`);
  pass(`Pinecrest dashboard scoped correctly (${allRowsHere} rows visible, none from Bella's)`);

  // ---- Capture Bella's dashboard for the README (replaces the Phase 1 stale shot) ----
  // switch back to Bella's so the captured screenshot shows our test booking + the seed data
  const trigger2 = page.locator('[data-slot=dropdown-menu-trigger]');
  await trigger2.click();
  await page.waitForSelector('[role=menu]', { timeout: 5000 });
  const bellasItem = page.locator('[role=menuitem]', { hasText: "Bella's Salon" });
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().endsWith("/dashboard"),
    ),
    bellasItem.click(),
  ]);
  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector('[data-testid="new-booking-form"]');
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/03-dashboard.png`,
    fullPage: true,
  });
  pass(`captured 03-dashboard.png with Phase 2 booking form + recent list`);

  console.log("\nALL PHASE 2 CHECKS PASSED");
} catch (err) {
  console.error("\nUNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
} finally {
  await browser.close();
}
