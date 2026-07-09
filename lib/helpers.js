// Reusable building blocks for the MSC. These encode the exact flow behaviour we
// observed on customercare.raileurope.com (B2B). Selectors prefer accessible roles
// and stable attributes (input[name="from"], the date input id, button text) so they
// survive layout/zoom changes. The 3-4 selectors most likely to need first-run tuning
// are marked with  // TUNE:
//
// NOTE: setStandardFareToCart picks the FIRST "Standard" fare in the results, which is
// the cheapest-listed for that train. The goal is sanity coverage, not fare optimisation.

const { expect } = require('@playwright/test');

/** Dismiss the cookie consent banner (privacy-preserving: decline non-essential). */
async function dismissCookies(page) {
  for (const name of [/continue without accepting/i, /reject all/i]) {
    const b = page.getByRole('button', { name }).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); return; }
  }
}

/** True if the page is the anti-bot "Access is temporarily restricted" wall. */
async function isBotWall(page) {
  return await page.getByText(/access is temporarily restricted|unusual activity/i)
    .first().isVisible().catch(() => false);
}

/** Returns a YYYY-MM-DD date `daysAhead` from today. */
function futureDate(daysAhead = 45) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/** Type into the From/To autocomplete and click the matching suggestion. */
async function selectStation(page, fieldName, query, optionText) {
  const input = page.locator(`input[name="${fieldName}"]`);
  await input.click();
  await input.fill('');                          // clear any retained value
  await input.pressSequentially(query, { delay: 25 }); // real keystrokes trigger the suggestions API
  const option = page.getByRole('option', { name: optionText, exact: false }).first(); // TUNE: option role/text
  await option.waitFor({ state: 'visible', timeout: 12000 });
  await option.click();
  // Confirm a station was selected. Don't compare to the typed query — the portal may
  // resolve it to a different display name (e.g. "Prague" -> "Praha hl.n").
  await expect(input).not.toHaveValue('');
}

/** Set the adult traveller count (defaults to 1). The first "increase" button is Adults. */
async function setAdults(page, n = 1) {
  const inc = page.getByRole('button', { name: /increase/i }).first(); // TUNE: adults +; first of Adults/Seniors/Children
  for (let i = 0; i < n; i++) await inc.click();
}

/** Inject the departure date into the Angular date field (it ignores plain typing). */
async function setDate(page, dateStr) {
  await page.locator('#datetime-selector-date-departureDate').evaluate((el, v) => {
    el.focus();
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }, dateStr);
}

/** Click the main SEARCH button and wait for the point-to-point results to render. */
async function clickSearchPTP(page) {
  // There are 3 "search" controls (main form button + 2 sidebar magnifier icons). The icon
  // buttons have no visible text, so filter to the visible button whose TEXT is "SEARCH".
  await page.locator('button:visible').filter({ hasText: /^\s*search\s*$/i }).first().click();
  await page.waitForURL(/\/search\/point-to-point/, { timeout: 35000 });
  await page.getByText(/select your outbound trip/i).waitFor({ timeout: 35000 });
}

/** Fill the whole search form for one journey and run the search. `withAdult` only needed once per session. */
async function searchJourney(page, journey, dateStr, { withAdult = false } = {}) {
  await selectStation(page, 'from', journey.from.q, journey.from.opt);
  await selectStation(page, 'to', journey.to.q, journey.to.opt);
  if (withAdult) await setAdults(page, 1);
  await setDate(page, dateStr);
  await clickSearchPTP(page);
}

/** How many results did the search return? Reads the "(N results)" label. */
async function resultCount(page) {
  const txt = await page.getByText(/\(\d+ results?\)/i).first().innerText().catch(() => '');
  const m = txt.match(/\((\d+)\s+results?\)/i);
  return m ? Number(m[1]) : 0;
}

/** On a results page: open the first Standard fare and add it to the cart. */
async function addFirstStandardToCart(page) {
  // Pick the first AVAILABLE Standard fare. Skipping "Unavailable"/sold-out cells matters for
  // carriers like RENFE where the top train's Standard is often sold out — clicking that dead
  // cell selects nothing and "Add to cart" never appears (the old first-Standard 12s timeout).
  const fare = page.getByRole('button', { name: /standard/i })
    .filter({ hasNotText: /unavailable/i })
    .first();
  await fare.click();
  const addBtn = page.getByRole('button', { name: /add to cart/i });
  await addBtn.waitFor({ state: 'visible', timeout: 12000 });
  await addBtn.click();
  await page.waitForURL(/\/cart/, { timeout: 35000 });
}

/** From the cart, go back to the search form to add another product (keeps the cart). */
async function addNewProducts(page) {
  const btn = page.getByRole('link', { name: /add new products/i }).first(); // it's an <a> link, not a button
  await btn.waitFor({ state: 'visible', timeout: 20000 }); // cart content loads async (skeletons first)
  await btn.click();
  await page.waitForURL(/\/home/, { timeout: 30000 });
  await page.locator('input[name="from"]').waitFor({ state: 'visible', timeout: 15000 });
}

/** Read every cart item's TTL string, e.g. ["00:27:46", ...]. */
async function cartExpiries(page) {
  const text = await page.locator('body').innerText();
  return [...text.matchAll(/Expiry\s+(\d{2}:\d{2}:\d{2})/g)].map((m) => m[1]);
}

/** Continue to Traveler details and return the created booking reference (K + digits). */
async function continueToTravelerDetails(page) {
  await page.locator('button:visible').filter({ hasText: /continue to traveler details/i }).first().click();
  await page.waitForURL(/traveler-details/, { timeout: 40000 });
  // The page shows skeletons first — wait for the booking reference to actually render.
  await page.getByText(/Booking reference:\s*[A-Z]\d{6,}/i).first().waitFor({ timeout: 40000 });
  const body = await page.locator('body').innerText();
  const m = body.match(/Booking reference:\s*([A-Z]\d{6,})/i) || body.match(/\b([A-Z]\d{9})\b/);
  return m ? m[1] : null;
}

/**
 * Search RAIL PASSES by destination (read-only — never books). The PASSES tab takes a
 * destination region/country (e.g. "Europe" -> Eurail + Interrail Global Passes;
 * "Switzerland" -> Swiss Travel Pass), a 1st-date-of-validity, and traveller counts
 * (defaults to 1 adult). Returns { count, products } for assertions.
 */
async function searchPasses(page, destination, dateStr) {
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^passes$/i }).click();      // TICKETS | PASSES | GROUPS

  // "Select a destination" is an Era custom <button> select; click it, then click the region.
  await page.getByLabel(/select a destination/i).first().click();
  await page.getByText(destination, { exact: true }).first().click();

  // 1st date of validity (text input, YYYY-MM-DD). Try fill, fall back to JS injection.
  const dateInput = page.getByLabel(/1st date of validity/i).first();
  await dateInput.fill(dateStr).catch(async () => {
    await dateInput.evaluate((el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, dateStr);
  });

  // The page has 3 "search" buttons; the pass form's has a stable data-select.
  await page.locator('[data-select="passes-search-form-search-button"]').click();
  await page.waitForURL(/\/search\/passes/, { timeout: 35000 });
  await page.getByText(/\(\d+ results?\)/i).first().waitFor({ timeout: 35000 });

  const count = await resultCount(page);
  const headings = await page.getByRole('heading').allInnerTexts().catch(() => []);
  const products = [...new Set(headings)]
    .filter((h) => /pass|card|eurail|interrail/i.test(h) && !/^passes:/i.test(h));
  return { count, products };
}

/** Parse a connectivity line's outage duration into minutes (null if not stated). */
function outageMinutes(line) {
  const m = line.match(/for\s+(?:(an?)\s+|(\d+)\s*)(minute|hour|day)/i);
  if (!m) return null;
  const qty = m[1] ? 1 : Number(m[2]);
  const unit = m[3].toLowerCase();
  return unit.startsWith('minute') ? qty : unit.startsWith('hour') ? qty * 60 : qty * 1440;
}

/**
 * Official MSC checklist rule #1: any carrier RED / unstable / down for MORE than
 * `thresholdMin` needs a manual cross-check. Returns { escalate, watch }.
 *  - escalate: unstable/down > threshold (or duration not stated → treat as escalate, safest)
 *  - watch:    unstable <= threshold, or "unknown" status (duration undeterminable)
 */
function flagConnectivity(lines, thresholdMin = 15) {
  const escalate = [], watch = [];
  for (const line of lines) {
    if (/\bis up\b/i.test(line)) continue;
    const carrier = line.replace(/\s+(has been|is)\b.*/i, '').trim();
    if (/is down/i.test(line)) { escalate.push({ carrier, status: 'down', minutes: null }); continue; }
    if (/unstable/i.test(line)) {
      const mins = outageMinutes(line);
      (mins === null || mins > thresholdMin ? escalate : watch).push({ carrier, status: 'unstable', minutes: mins });
    } else if (/is unknown/i.test(line)) {
      watch.push({ carrier, status: 'unknown', minutes: null });
    }
  }
  return { escalate, watch };
}

/** Which of our test ODs use a given carrier (for the "cross-check the affected OD" step). */
function affectedODs(carrier, journeys) {
  const c = carrier.toUpperCase().trim();
  return journeys
    .filter((j) => j.carrier.toUpperCase().split(/[^A-Z]+/).some((tok) => tok.length > 1 && (tok === c || c.includes(tok) || tok.includes(c))))
    .map((j) => `${j.from.q}->${j.to.q}`);
}

/**
 * Add ONE rail pass to the current (shared) cart. Deterministic flow discovered on the portal:
 *   PASSES tab -> destination -> validity date -> search -> expand first price button
 *   -> CONTINUE (passes-result-continue) -> ADD TO CART -> lands on /cart.
 * SEARCH/ADD only — NEVER pays. `destination` e.g. "Europe" (Eurail/Interrail) or "Switzerland".
 * Returns the pass product name that landed in the cart.
 */
async function addPassToCart(page, destination, dateStr) {
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^passes$/i }).click();
  await page.getByLabel(/select a destination/i).first().click();
  await page.getByText(destination, { exact: true }).first().click();
  const di = page.getByLabel(/1st date of validity/i).first();
  await di.fill(dateStr).catch(async () => {
    await di.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, dateStr);
  });
  await page.locator('[data-select="passes-search-form-search-button"]').click();
  await page.waitForURL(/\/search\/passes/, { timeout: 35000 });
  await page.getByText(/\(\d+ results?\)/i).first().waitFor({ timeout: 35000 });

  const name = await page.locator('[data-select="passesResult-title"]').first().innerText().catch(() => destination);
  // The price button is an accordion — expand it, then CONTINUE, then ADD TO CART.
  await page.locator('[data-select^="passesResult-priceButton-pass-offer-"]').first().click();
  const cont = page.locator('[data-select="passes-result-continue"]').first();
  await cont.waitFor({ state: 'visible', timeout: 12000 });
  await cont.click();
  const addBtn = page.getByRole('button', { name: /add to cart/i }).first();
  await addBtn.waitFor({ state: 'visible', timeout: 12000 });
  await addBtn.click();
  await page.waitForURL(/\/cart/, { timeout: 35000 });
  return (name || destination).replace(/\s+/g, ' ').trim();
}

/** Switch the B2B point of sale (e.g. to SNCF Connect 832072551). */
async function switchPOS(page, posNumber) {
  await page.getByText(/Salgaonkar/i).first().click();           // open profile menu (account name, top-right)
  const posInput = page.getByLabel('Switch POS');               // field uses name/aria-label "Switch POS" (not a placeholder)
  await posInput.waitFor({ state: 'visible', timeout: 10000 });
  await posInput.fill(posNumber);
  const opt = page.getByText(new RegExp(posNumber)).first();     // suggestion e.g. "KA-RESAS-EUROPE-FRANCE-832072551"
  await opt.waitFor({ state: 'visible', timeout: 10000 });
  await opt.click();
  // The profile menu stays OPEN with a dimmed backdrop that blocks the form — close it.
  await page.waitForTimeout(1500);                               // let the POS-change reload settle
  await page.getByText(/Salgaonkar/i).first().click().catch(() => {}); // toggle menu closed
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
}

module.exports = {
  dismissCookies, isBotWall,
  futureDate, selectStation, setAdults, setDate, clickSearchPTP, searchJourney,
  resultCount, addFirstStandardToCart, addNewProducts, cartExpiries,
  continueToTravelerDetails, switchPOS, searchPasses, addPassToCart,
  outageMinutes, flagConnectivity, affectedODs,
};
