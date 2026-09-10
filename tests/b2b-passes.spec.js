// B2B RAIL PASS sanity check — SEARCH ONLY (never books, never pays).
// Confirms each rail pass is searchable on the portal and the expected products come back:
//   - "Europe"      -> Eurail Global Pass AND Interrail Global Pass
//   - "Switzerland" -> Swiss Travel Pass
// Results land in report/msc-passes.json.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const data = require('../data/journeys');
const { futureDate, searchPasses, blockNoise } = require('../lib/helpers');

// NOT serial: each check owns its page fixture and navigates itself, so they are independent.
// Under serial mode a single missing product (Eurail, 2026-09-10) SKIPPED the Swiss and BritRail
// checks — the run then reported nothing at all about two passes that were actually fine.
// workers:1 already runs them one at a time.

// Drop unreachable third-party analytics/AB hosts; they add ~38s per page load here.
test.beforeEach(async ({ context }) => { await blockNoise(context); });

const findings = [];

const RUN_ID = process.env.MSC_RUN_ID || 'local';
const OUT = path.join(__dirname, '..', 'report', 'msc-passes.json');

// Playwright starts a FRESH worker process after a test failure, so this module (and the
// in-memory `findings`) is reloaded and the surviving tests would otherwise overwrite the
// file with only their own rows — that is how the failing Eurail check vanished from the
// report on 2026-09-10. Merge by run id instead, same as tests/b2b-msc.spec.js does.
test.afterAll(() => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  let prior = [];
  try {
    const onDisk = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    if (onDisk.runId === RUN_ID && Array.isArray(onDisk.findings)) prior = onDisk.findings;
  } catch {}
  const byLabel = new Map(prior.map((x) => [x.label, x]));
  for (const x of findings) byLabel.set(x.label, x);
  const all = data.passChecks
    .map((c) => byLabel.get(c.label))
    .filter(Boolean)
    .concat([...byLabel.values()].filter((x) => !data.passChecks.some((c) => c.label === x.label)));
  const pass = all.filter((x) => x.status === 'PASS').length;
  fs.writeFileSync(OUT, JSON.stringify({ runId: RUN_ID, daysAhead: data.daysAhead, summary: { pass, total: all.length }, findings: all }, null, 2));
});

for (const check of data.passChecks) {
  test(`Pass searchable: ${check.label} (destination "${check.destination}")`, async ({ page }) => {
    const date = futureDate(data.daysAhead);
    let result = { destination: check.destination, label: check.label, date, status: 'ERROR', count: 0, products: [], missing: [] };
    try {
      const { count, products } = await searchPasses(page, check.destination, date);
      const joined = products.join(' | ');
      const missing = check.mustInclude.filter((rx) => !rx.test(joined)).map((rx) => String(rx));
      result = { ...result, count, products, missing, status: count > 0 && missing.length === 0 ? 'PASS' : 'FAIL' };

      // Assertions: results returned AND every expected pass brand is present.
      expect(count, `no pass results for "${check.destination}"`).toBeGreaterThan(0);
      expect(missing, `expected products missing for "${check.destination}": ${missing.join(', ')}`).toEqual([]);
    } finally {
      findings.push(result);
      console.log(`[${result.status}] ${check.label}: ${result.count} results | ${result.products.slice(0, 6).join(', ')}`);
    }
  });
}
