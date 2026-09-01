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

test.describe.configure({ mode: 'serial' });

// Drop unreachable third-party analytics/AB hosts; they add ~38s per page load here.
test.beforeEach(async ({ context }) => { await blockNoise(context); });

const findings = [];

test.afterAll(() => {
  const outDir = path.join(__dirname, '..', 'report');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const pass = findings.filter((f) => f.status === 'PASS').length;
  fs.writeFileSync(
    path.join(outDir, 'msc-passes.json'),
    JSON.stringify({ daysAhead: data.daysAhead, summary: { pass, total: findings.length }, findings }, null, 2),
  );
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
