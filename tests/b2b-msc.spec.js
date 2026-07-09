// B2B Manual Sanity Check.
//   1) Pre-flight: read the connectivity (health-center) page and record carrier status.
//   2) SNCF Connect POS test: switch POS to 832072551, search-only validation for 3 ODs, switch back.
//   3) Build one shared cart across the healthy PTP journeys and capture ONE booking reference,
//      asserting that NO sector is expired at capture time. Stops at Traveler details. NEVER pays.
//
// Reuses the saved login (storageState.json). Run `npm run auth` first if it doesn't exist.

const fs = require('fs');
const { test, expect } = require('@playwright/test');
const data = require('../data/journeys');
const H = require('../lib/helpers');

const DATE = H.futureDate(data.daysAhead);
const report = { date: new Date().toISOString(), testDate: DATE, connectivity: [], sncfPos: [], booking: null, sectors: [], issues: [] };

test.afterAll(async () => {
  fs.mkdirSync('report', { recursive: true });
  fs.writeFileSync('report/msc-b2b.json', JSON.stringify(report, null, 2));
});

test('Pre-flight: connectivity status', async ({ page }) => {
  await page.goto('/health-center');
  await H.dismissCookies(page);
  await page.getByText(/Systems connectivity status/i).waitFor({ timeout: 30000 });
  // Carrier cards load asynchronously (skeleton placeholders first) — wait for real status text.
  await page.getByText(/\b(is up|has been unstable|is unknown|is down)\b/i).first().waitFor({ timeout: 30000 });
  const body = await page.locator('body').innerText();
  // Capture lines like "DB has been unstable for 2 hours" / "OBB is up" / "RHB is unknown".
  report.connectivity = [...body.matchAll(/([A-Z][A-Za-z ]+?) (is up|has been unstable[^\n]*|is unknown|is down)/g)]
    .map((m) => `${m[1].trim()} ${m[2].trim()}`);
  console.log('[connectivity]', report.connectivity.join(' | '));

  // MSC checklist #1: flag any carrier RED/unstable/down for > 15 min for manual cross-check.
  const { escalate, watch } = H.flagConnectivity(report.connectivity, 15);
  escalate.forEach((e) => { e.affectedODs = H.affectedODs(e.carrier, data.ptpJourneys); });
  report.connectivityEscalations = escalate;
  report.connectivityWatch = watch;
  if (escalate.length) {
    report.issues.push({ type: 'connectivity-flag', detail: escalate });
    // NOTE: this only FLAGS to the console/report. Nothing is sent anywhere — no Teams, no email,
    // no ticket. Actually escalating is a manual human step (per SOP rule #1).
    console.log('\n⚠️  CONNECTIVITY FLAG — carriers RED/unstable > 15 min (SOP rule #1). Nothing is auto-sent; these need MANUAL review:');
    for (const e of escalate) {
      const dur = e.minutes != null ? `~${e.minutes} min` : 'duration not stated';
      const ods = e.affectedODs.length ? ` | our ODs: ${e.affectedODs.join(', ')}` : '';
      console.log(`   - ${e.carrier}: ${e.status} (${dur})${ods}`);
    }
    console.log('   SUGGESTED MANUAL STEPS: cross-check offers/products for the affected OD(s); compare on Trainline');
    console.log('           (https://thetrainline.com) to isolate ERA vs carrier; if confirmed, follow');
    console.log('           Critical Incident Management: https://wiki.vsct.fr/display/SR/Critical+Incident+Management');
  }
  if (watch.length) console.log('[watch <=15min / unknown]', watch.map((w) => `${w.carrier}:${w.status}${w.minutes != null ? '(' + w.minutes + 'm)' : ''}`).join(', '));

  expect(report.connectivity.length).toBeGreaterThan(0);
});

test('SNCF Connect POS: search-only validation', async ({ page }) => {
  await page.goto('/home');
  await H.dismissCookies(page);
  // Re-select the SNCF Connect POS before EACH OD: selecting the POS reloads a clean search
  // form (and keeps the POS), which is far more robust than the EDIT SEARCH modify-panel.
  for (const j of data.sncfPosJourneys) {
    let rec = null;
    // Retry each OD once: a single transient timeout shouldn't fail the whole POS check.
    for (let attempt = 1; attempt <= 2 && !rec; attempt++) {
      try {
        await page.goto('/home');            // clean start each OD (resets POS to default)...
        await H.switchPOS(page, data.pos.sncfConnect); // ...then re-apply SNCF Connect
        await page.locator('input[name="from"]').waitFor({ state: 'visible', timeout: 30000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await H.searchJourney(page, j, DATE, { withAdult: true }); // form reloads each time, so set adult each time
        const n = await H.resultCount(page);
        rec = { od: `${j.from.q}->${j.to.q}`, result: n > 0 ? 'PASS' : 'NO RESULTS', count: n };
      } catch (e) {
        await page.goto('/home').catch(() => {}); // recover before retry / next iteration
        if (attempt === 2) rec = { od: `${j.from.q}->${j.to.q}`, result: 'ERROR', error: String(e).split('\n')[0] };
      }
    }
    report.sncfPos.push(rec);
  }
  // Revert POS to default: navigating home resets to the Test Profile.
  await page.goto('/home');
  console.log('[sncf-pos]', JSON.stringify(report.sncfPos));
  expect(report.sncfPos.every((r) => r.result !== 'ERROR')).toBeTruthy();
});

test('B2B: build cart and capture booking reference (none expired)', async ({ page }) => {
  // A rough run (carrier instability) can hit several slow timeouts — give it room to finish
  // and still report, rather than being killed mid-loop with no reference.
  test.setTimeout(9 * 60 * 1000);
  // Start clean.
  await page.goto('/cart');
  await H.dismissCookies(page);
  const delAll = page.getByRole('button', { name: /^delete all$/i });
  if (await delAll.isVisible().catch(() => false)) {
    await delAll.click();
    await page.getByRole('button', { name: /^delete all$/i }).last().click().catch(() => {});
  }
  await page.goto('/home');

  // MSC_MAX_SECTORS lets us validate the flow on a small subset (e.g. 2) before the full 12.
  let journeys = data.ptpJourneys.slice(0, Number(process.env.MSC_MAX_SECTORS || data.ptpJourneys.length));
  // Build the known-flaky RENFE sector LAST so, if it stalls, it can't block healthy sectors behind it.
  journeys = [...journeys].sort((a, b) => (/RENFE/i.test(a.carrier) ? 1 : 0) - (/RENFE/i.test(b.carrier) ? 1 : 0));

  const added = [];
  let adultSet = false;
  for (const j of journeys) {
    try {
      // Only use the cart's "Add New Products" link when the cart actually HAS items;
      // otherwise search straight from /home. This stops a failed sector from cascading
      // into the ones after it.
      if (added.length > 0) await H.addNewProducts(page);
      const wantAdult = !adultSet;
      await H.searchJourney(page, j, DATE, { withAdult: wantAdult });
      if (wantAdult) adultSet = true; // set the traveller exactly once, after a search actually completes
      const n = await H.resultCount(page);
      if (n === 0) { report.sectors.push({ id: j.id, carrier: j.carrier, status: 'NO RESULTS' }); continue; }
      await H.addFirstStandardToCart(page);
      added.push(j);
      report.sectors.push({ id: j.id, carrier: j.carrier, status: 'IN CART' });
    } catch (e) {
      report.sectors.push({ id: j.id, carrier: j.carrier, status: 'ERROR', error: String(e).split('\n')[0] });
      // HARD reset to a clean state so the next sector isn't dragged down by this failure.
      // The cart persists server-side, so reloading it (or /home if nothing's banked yet) is safe.
      if (added.length > 0) {
        await page.goto('/cart', { waitUntil: 'domcontentloaded' }).catch(() => {});
      } else {
        await page.goto('/home').catch(() => {});
        await page.locator('input[name="from"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
      }
    }
  }
  expect(added.length, 'at least some sectors should be in the cart').toBeGreaterThan(0);

  // Add ONE rail pass to the SAME cart, randomly choosing which each run:
  // "Europe" -> Eurail/Interrail Global Pass, "Switzerland" -> Swiss Travel Pass family.
  // Wrapped so a pass hiccup can never harm the train booking we already have.
  const passDest = ['Europe', 'Switzerland'][Math.floor(Math.random() * 2)];
  try {
    const passName = await H.addPassToCart(page, passDest, DATE);
    report.passInBooking = { destination: passDest, product: passName, status: 'IN CART' };
    report.sectors.push({ id: 'PASS', carrier: `PASS/${passDest}`, product: passName, status: 'IN CART' });
    console.log(`[booking] pass added to cart: ${passName} (${passDest})`);
  } catch (e) {
    report.passInBooking = { destination: passDest, status: 'ERROR', error: String(e).split('\n')[0] };
    report.sectors.push({ id: 'PASS', carrier: `PASS/${passDest}`, status: 'ERROR', error: String(e).split('\n')[0] });
    console.log(`[booking] pass (${passDest}) did NOT add: ${String(e).split('\n')[0]}`);
    await page.goto('/cart', { waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  // Capture the booking reference while every sector is still live.
  await page.goto('/cart');
  const expiriesBefore = await H.cartExpiries(page);
  expect(expiriesBefore.some((t) => t === '00:00:00'), 'no sector should be expired before checkout').toBeFalsy();

  const ref = await H.continueToTravelerDetails(page);
  report.booking = ref;

  // Verify on the Traveler details page that no sector shows an expired (00:00:00) timer.
  const bodyAfter = await page.locator('body').innerText();
  const expiredCount = (bodyAfter.match(/00:00:00/g) || []).length;
  report.bookingExpiredSectors = expiredCount;

  report.sectorsInCart = added.length;
  report.sectorsTotal = journeys.length;
  const dropped = report.sectors.filter((s) => s.status !== 'IN CART');
  const passNote = report.passInBooking && report.passInBooking.status === 'IN CART' ? `+ pass: ${report.passInBooking.product}` : 'pass: none';
  console.log(`\n[booking] reference=${ref}  trainSectors=${added.length}/${journeys.length}  ${passNote}  expired=${expiredCount}`);
  console.log(`[booking] IN CART: ${report.sectors.filter((s) => s.status === 'IN CART').map((s) => `#${s.id} ${s.carrier}`).join(', ') || '(none)'}`);
  if (dropped.length) {
    report.issues.push({ type: 'sectors-dropped', detail: dropped });
    console.log(`[booking] ⚠️  DROPPED ${dropped.length}/${journeys.length}: ` +
      dropped.map((s) => `#${s.id} ${s.carrier} [${s.status}${s.error ? ': ' + s.error : ''}]`).join('  |  '));
  }
  console.log('');
  expect(ref, 'a booking reference should be created').toMatch(/^[A-Z]\d{6,}$/);
  expect(expiredCount, 'no sector expired in the captured booking').toBe(0);

  // ⛔ HARD STOP. We are on Traveler details. We DO NOT fill payment, DO NOT click any
  // Pay/Confirm control. The booking reference is the proof of a successful MSC.
});
