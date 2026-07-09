// B2C searchability checks on www.raileurope.com.
// Goal (per spec): confirm each journey is SEARCHABLE and returns results. No login,
// no payment. The "Explore places to stay" toggle is turned OFF so it doesn't spawn a
// Booking.com tab. These run in parallel for speed.

const fs = require('fs');
const { test, expect } = require('@playwright/test');
const data = require('../data/journeys');
const H = require('../lib/helpers');

const DATE = H.futureDate(data.daysAhead);
const results = [];

test.afterAll(async () => {
  fs.mkdirSync('report', { recursive: true });
  fs.writeFileSync('report/msc-b2c.json', JSON.stringify({ date: new Date().toISOString(), testDate: DATE, results }, null, 2));
});

test.describe.configure({ mode: 'parallel' });

for (const j of data.ptpJourneys) {
  test(`B2C searchable: ${j.from.q} -> ${j.to.q} (${j.carrier})`, async ({ page }) => {
    await page.goto('/en-gb', { waitUntil: 'networkidle' }).catch(() => {});

    // The public B2C site uses anti-bot protection that blocks headless automation.
    // Detect it and report clearly (so the run doesn't fail with a confusing selector error).
    if (await H.isBotWall(page)) {
      results.push({ od: `${j.from.q}->${j.to.q}`, carrier: j.carrier, status: 'BLOCKED (bot protection)', booking: 'N/A' });
      test.skip(true, 'B2C blocked by anti-bot wall — needs real-browser runner, IP allow-list, or API check (see README).');
    }
    await H.dismissCookies(page);

    // Turn OFF "Explore places to stay" so the search doesn't open Booking.com.
    const stayToggle = page.getByText(/explore places to stay/i).locator('xpath=following::*[@role="switch" or self::input][1]'); // TUNE
    if (await stayToggle.isVisible().catch(() => false)) {
      const on = await stayToggle.getAttribute('aria-checked').catch(() => null);
      if (on === 'true' || on === null) await stayToggle.click().catch(() => {});
    }

    // Fill the B2C widget. Placeholders are "From"/"To"; suggestions appear as options.
    const from = page.getByPlaceholder('From'); // TUNE: B2C widget field
    const to = page.getByPlaceholder('To');     // TUNE
    await from.click();
    await from.fill(j.from.q);
    await page.getByText(new RegExp(`^${j.from.q}`, 'i')).first().click({ timeout: 10000 }).catch(() => {});
    await to.click();
    await to.fill(j.to.q);
    await page.getByText(new RegExp(`^${j.to.q}`, 'i')).first().click({ timeout: 10000 }).catch(() => {});

    await page.getByRole('button', { name: /^search$/i }).click();

    // Expect to land on a results/journey page that lists trains.
    await page.waitForURL(/journey|search|selection/i, { timeout: 40000 }).catch(() => {});
    const hasResults = await page.getByText(/from\s*[€£$]|select your|outbound|direct/i).first()
      .isVisible({ timeout: 30000 }).catch(() => false);

    results.push({ od: `${j.from.q}->${j.to.q}`, carrier: j.carrier, status: hasResults ? 'PASS' : 'NO RESULTS', booking: 'N/A' });
    expect(hasResults, 'B2C search should return results').toBeTruthy();
  });
}
