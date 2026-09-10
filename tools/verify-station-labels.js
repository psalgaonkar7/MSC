/**
 * Read-only: prove every route in data/journeys.js can actually be ENTERED in the portal's
 * station autocomplete, and that it resolves to the RIGHT station. Never searches, never adds
 * to a cart, never books.
 *
 * Why this exists: a fallback route is worthless if its `opt` label does not match a real
 * autocomplete option — the route silently fails and the run just moves on. The LocoHub API
 * validates that an OD SELLS the carrier; only the portal validates that we can TYPE it.
 *
 * It checks two separate things, because the second one bites hardest:
 *   1. the label matches SOME option at all  (accents are the usual culprit:
 *      "Malaga" never matches "Malaga-Maria Zambrano")
 *   2. the option it matched is in the country the LocoHub code says it should be.
 *      "Brugge" cheerfully matched "Brugge (Westf), Germany" and "Milano" matched
 *      "Milano Nord Cadorna" — both real places the carrier does not serve, so the route
 *      would have looked fine here and then quietly returned nothing on every run.
 *
 *   node tools/verify-station-labels.js            # every distinct station in journeys.js
 *   node tools/verify-station-labels.js --headed
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const data = require('../data/journeys');
const { SEL, blockNoise } = require('../lib/helpers');

const BASE = 'https://customercare.raileurope.com';
const STATE = path.join(__dirname, '..', 'storageState.json');

// LocoHub country prefix -> the country name the portal prints after the station.
const COUNTRY = {
  AT: 'Austria', BE: 'Belgium', CH: 'Switzerland', CZ: 'Czechia', DE: 'Germany',
  ES: 'Spain', FR: 'France', GB: 'UK', HU: 'Hungary', IT: 'Italy',
  NL: 'Netherlands', PL: 'Poland', SK: 'Slovakia',
};

function everyStation() {
  const seen = new Map();
  const push = (s, where, code) => {
    if (!s || !s.q) return;
    const key = s.q + '||' + (s.opt || '');
    if (!seen.has(key)) seen.set(key, { q: s.q, opt: s.opt || s.q, code, where: [] });
    seen.get(key).where.push(where);
  };
  for (const j of data.ptpJourneys) {
    for (const r of [j, ...(j.alternates || [])]) {
      push(r.from, '#' + j.id + ' ' + j.carrier, r.fromCode || j.fromCode);
      push(r.to, '#' + j.id + ' ' + j.carrier, r.toCode || j.toCode);
    }
  }
  for (const j of data.sncfPosJourneys || []) {
    for (const r of [j, ...(j.alternates || [])]) {
      push(r.from, 'SNCF-POS', r.fromCode || j.fromCode);
      push(r.to, 'SNCF-POS', r.toCode || j.toCode);
    }
  }
  return [...seen.values()];
}

(async () => {
  const headed = process.argv.includes('--headed');
  const stations = everyStation();
  console.log('Verifying ' + stations.length + ' distinct station entries from data/journeys.js\n');

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({ baseURL: BASE, storageState: STATE });
  await blockNoise(context);
  const page = await context.newPage();
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await page.locator(SEL.from).first().waitFor({ state: 'visible', timeout: 60000 });

  const bad = [];
  for (const s of stations) {
    const input = page.locator(SEL.from).first();
    let ok = false, saw = '', why = '';
    try {
      await input.click();
      await input.fill('');
      await input.pressSequentially(s.q, { delay: 20 });
      const option = page.getByRole('option', { name: s.opt, exact: false }).first();
      await option.waitFor({ state: 'visible', timeout: 8000 });
      saw = (await option.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      ok = true;
    } catch {
      // capture what the portal DID offer, so a fix is one edit away rather than a guess
      saw = (await page.getByRole('option').first().innerText().catch(() => '(no options)'))
        .replace(/\s+/g, ' ').trim();
      why = 'no option matched';
    }

    const want = COUNTRY[String(s.code || '').split(':')[0]];
    if (ok && want && saw && saw.toLowerCase().indexOf(want.toLowerCase()) === -1) {
      ok = false;
      why = 'WRONG COUNTRY — expected ' + want + ' for code ' + s.code;
    }

    console.log('  ' + (ok ? 'OK  ' : 'FAIL') + '  q="' + s.q + '" opt="' + s.opt + '"  -> ' + saw
      + (ok ? '' : '   [' + why + ']   used by ' + [...new Set(s.where)].join(', ')));
    if (!ok) bad.push({ ...s, saw, why });
  }

  console.log('\n' + (stations.length - bad.length) + '/' + stations.length + ' station entries are correct.');
  if (bad.length) {
    console.log('\nFIX THESE in data/journeys.js:');
    bad.forEach((b) => console.log('  q="' + b.q + '" opt="' + b.opt + '" (' + b.code + ')  portal gave "'
      + b.saw + '"  — ' + b.why + '  — used by ' + [...new Set(b.where)].join(', ')));
  }
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})();
