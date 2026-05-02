import { chromium } from "playwright";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";

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

async function getCounts(page) {
  // The bookings-summary text "Showing 1-25 of 60" is the durable signal for total
  // bookings in the active org's view. The Phase 1 dashboard's three plain cards were
  // replaced by Phase 5 analytics; the summary line is the cleanest cross-phase anchor.
  await page.waitForSelector('[data-testid="bookings-summary"]');
  const summary = (await page.locator('[data-testid="bookings-summary"]').textContent()) ?? "";
  const m = summary.match(/of\s+(\d+)/);
  const total = m ? parseInt(m[1], 10) : 0;
  return { Bookings: total };
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

const browser = await chromium.launch({ headless: true });

// surface React/hydration errors as PAGEERROR so a real bug doesn't read as a
// flake-pattern timeout (this caught the MenuGroupRootContext bug during dev)
function attachLogging(ctx) {
  ctx.on("page", (page) => {
    page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
  });
}

try {
  // ---- Test 1: redirect when unauthenticated ----
  {
    const ctx = await browser.newContext();
    attachLogging(ctx);
    const page = await ctx.newPage();
    const resp = await page.goto(`${BASE}/dashboard`);
    if (!page.url().includes("/sign-in")) {
      fail(`unauth /dashboard did not redirect to /sign-in (now at ${page.url()})`);
    }
    pass("unauth /dashboard redirects to /sign-in");
    await ctx.close();
  }

  // ---- Test 2: sign in as Maria, verify Bella's counts ----
  let mariaCtx;
  {
    mariaCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    attachLogging(mariaCtx);
    const page = await mariaCtx.newPage();
    await signIn(page, "maria@bellas-salon.test", "demo1234");
    const counts = await getCounts(page);
    assert.equal(counts.Bookings, 60, `Bella's bookings should be 60, got ${counts.Bookings}`);
    pass(`Maria default org Bella's: 60 bookings in scope`);

    // ---- Test 3: org switcher lists both orgs ----
    const trigger = page.locator('[data-slot=dropdown-menu-trigger]');
    await trigger.click();
    await page.waitForSelector('[role=menu]', { timeout: 5000 });
    const items = await page.locator('[role=menuitem]').allTextContents();
    if (!items.some((t) => t.includes("Bella's Salon"))) fail(`switcher missing Bella's: ${items}`);
    if (!items.some((t) => t.includes("Pinecrest Clinic"))) fail(`switcher missing Pinecrest: ${items}`);
    pass(`org switcher lists both orgs: ${items.map((t) => t.trim()).join(" | ")}`);

    // ---- Test 4: switch to Pinecrest, counts must change ----
    // wait for the server action POST response so the active-org cookie lands
    // before we navigate; without this the click-then-goto race lets the new
    // GET fire with the old cookie state
    const pinecrestItem = page.locator('[role=menuitem]', {
      hasText: "Pinecrest Clinic",
    });
    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().endsWith("/dashboard"),
      ),
      pinecrestItem.click(),
    ]);
    await page.goto(`${BASE}/dashboard`);
    const after = await getCounts(page);
    assert.equal(after.Bookings, 30, `Pinecrest bookings should be 30, got ${after.Bookings}`);
    pass(`switched to Pinecrest: 30 bookings in scope`);

    // verify nav shows Pinecrest as active
    const activeOrg = await page.locator('[data-slot=dropdown-menu-trigger]').textContent();
    if (!activeOrg?.includes("Pinecrest Clinic")) {
      fail(`nav still shows ${activeOrg} after switching`);
    }
    pass(`top-nav shows Pinecrest Clinic as active`);

    // capture Pinecrest dashboard
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/05-dashboard-pinecrest.png`,
      fullPage: false,
    });
    pass(`captured 05-dashboard-pinecrest.png`);

    // re-open the switcher and capture it (now Pinecrest is active and Bella's is the alt)
    // base-ui uses fade-in/zoom-in animations; wait past the 100ms duration so the popup
    // is fully opaque in the capture
    await page.locator('[data-slot=dropdown-menu-trigger]').click();
    await page.waitForSelector('[role=menu]', { timeout: 5000 });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/04-org-switcher.png`,
      fullPage: false,
    });
    pass(`captured 04-org-switcher.png`);
  }

  // ---- Test 5: sign-out terminates session ----
  {
    const page = await mariaCtx.newPage();
    await page.goto(`${BASE}/dashboard`);
    await page.click('button:has-text("Sign out")');
    await page.waitForURL(`${BASE}/`);
    // try to access dashboard again
    await page.goto(`${BASE}/dashboard`);
    if (!page.url().includes("/sign-in")) {
      fail(`after sign-out, /dashboard did not redirect to sign-in (now ${page.url()})`);
    }
    pass(`sign-out clears session, /dashboard redirects to /sign-in again`);
    await mariaCtx.close();
  }

  // ---- Test 6: sign-up creates org + user, lands on dashboard with that org ----
  {
    const ctx = await browser.newContext();
    attachLogging(ctx);
    const page = await ctx.newPage();
    const stamp = Date.now();
    const newSlug = `acme-${stamp}`;
    const newEmail = `owner-${stamp}@acme.test`;
    await page.goto(`${BASE}/sign-up`);
    await page.fill('input[name="name"]', "Acme Owner");
    await page.fill('input[name="email"]', newEmail);
    await page.fill('input[name="password"]', "supersecret");
    await page.fill('input[name="orgName"]', "Acme Cuts");
    await page.fill('input[name="orgSlug"]', newSlug);
    await Promise.all([
      page.waitForURL(`${BASE}/dashboard`),
      page.click('button[type="submit"]'),
    ]);
    // a brand-new org has no customers/services/staff so the dashboard renders the
    // "add demo data" notice instead of the bookings list. The lack of a bookings table
    // is itself the assertion: empty org cannot leak into another org's view.
    await page.waitForSelector("text=Add customers, services, and staff", { timeout: 5000 });
    const tableCount = await page.locator('[data-testid="bookings-table"]').count();
    if (tableCount > 0) fail("new org showed a bookings table; should be empty-state notice");
    pass(`sign-up creates fresh org "${newSlug}" with empty-state dashboard`);

    const navText = await page.locator("header").textContent();
    if (!navText?.includes("Acme Cuts")) {
      fail(`new org not shown in nav: ${navText}`);
    }
    pass(`new org "Acme Cuts" appears in top nav`);
    await ctx.close();
  }

  // ---- Test 7: isolation — Hanna only sees Pinecrest, switcher has only one org ----
  {
    const ctx = await browser.newContext();
    attachLogging(ctx);
    const page = await ctx.newPage();
    await signIn(page, "hanna@pinecrest-clinic.test", "demo1234");
    const counts = await getCounts(page);
    assert.equal(counts.Bookings, 30, `Hanna sees Pinecrest bookings, got ${counts.Bookings}`);
    pass(`Hanna sees Pinecrest 30 bookings (isolation: not Bella's 60)`);

    await page.click('[data-slot=dropdown-menu-trigger]');
    await page.waitForSelector('[role=menu]', { timeout: 5000 });
    const items = await page.locator('[role=menuitem]').allTextContents();
    if (items.length !== 1 || !items[0].includes("Pinecrest")) {
      fail(`Hanna's switcher should list only Pinecrest, got: ${items}`);
    }
    pass(`Hanna's switcher lists only Pinecrest (no leakage)`);
    await ctx.close();
  }

  console.log("\nALL CHECKS PASSED");
} catch (err) {
  console.error("\nUNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
} finally {
  await browser.close();
}
