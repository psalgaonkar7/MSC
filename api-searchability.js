// ============================================================================
// Rail Europe MSC — READ-ONLY API searchability check (LocoHub /searches)
// ----------------------------------------------------------------------------
// Fires one POST /searches per OD and confirms results come back. This is the
// fast, bot-proof equivalent of "did the search work + did fares show" for all
// 12 MSC journeys. It is SEARCH-ONLY: it never books, pays, or writes anything.
//
// Tokens/endpoints are read AT RUNTIME from the user's Postman environment files
// (gitignored). No secret is ever copied into this repo.
//
// Run:  node api-searchability.js                 (staging + production)
//       LH_ONLY=staging node api-searchability.js (one env)
// ============================================================================
const fs = require('fs');
const path = require('path');

// Configurable so this works on any teammate's machine: set POSTMAN_DIR to point at your own
// exported Postman environment folder. Defaults to this machine's path for convenience.
const POSTMAN_DIR = process.env.POSTMAN_DIR
  || 'C:\\Users\\PSalgaonkar\\OneDrive - RAILEUROPE\\Desktop\\Notes\\Training\\Postman json files\\LH';

// Which Postman env files to drive. Staging = validate; Production = real MSC signal.
const ENVS = [
  { label: 'STAGING',    file: path.join(POSTMAN_DIR, 'LocoHub_Staging (ROW_B2B).postman_environment 4.json') },
  // ROW_B2B (env 4) uses SSM (no literal token). ROW_B2B2C carries a literal token on the real
  // production endpoint, so it's the one that yields a live production searchability signal.
  { label: 'PRODUCTION', file: path.join(POSTMAN_DIR, 'LocoHub_Production (ROW_B2B2C).postman_environment 2.json') },
];

// The 12 MSC journeys, mapped to LocoHub station codes (resolved via GET /stations).
const ODS = [
  { id: 1,  carrier: 'OBB',               route: 'Vienna -> Munich',      from: 'AT:vienna',          to: 'DE:munich' },
  { id: 2,  carrier: 'DB',                route: 'Berlin -> Munich',      from: 'DE:berlin',          to: 'DE:munich' },
  { id: 3,  carrier: 'TER/SNCF',          route: 'Paris -> Stuttgart',    from: 'FR:paris',           to: 'DE:stuttgart' },
  { id: 4,  carrier: 'EUROSTAR',          route: 'London -> Paris',       from: 'GB:london',          to: 'FR:paris' },
  { id: 5,  carrier: 'LYRIA',             route: 'Geneva -> Paris',       from: 'CH:geneva',          to: 'FR:paris' },
  { id: 6,  carrier: 'RDG (Avanti)',      route: 'Edinburgh -> London',   from: 'GB:edinburgh',       to: 'GB:london' },
  { id: 7,  carrier: 'SNCB',              route: 'Brussels -> Mons',      from: 'BE:brussels_midi',   to: 'BE:mons' },
  { id: 8,  carrier: 'RENFE/IRYO',        route: 'Barcelona -> Madrid',   from: 'ES:barcelona_sants', to: 'ES:madrid_atocha' },
  { id: 9,  carrier: 'RHB/SBB',           route: 'Zermatt -> Chur',       from: 'CH:zermatt',         to: 'CH:chur' },
  { id: 10, carrier: 'RegioJet',          route: 'Prague -> Brno',        from: 'CZ:prague',          to: 'CZ:brno' },
  { id: 11, carrier: 'RegioJet',          route: 'Wien -> Gyor',          from: 'AT:wien_hbf',        to: 'HU:gyor' },
  { id: 12, carrier: 'TRENITALIA/ITALO',  route: 'Rome -> Milan',         from: 'IT:rome',            to: 'IT:milan' },
];

const DAYS_AHEAD = Number(process.env.MSC_DAYS_AHEAD || 45);
function futureDate(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function envVal(env, key) { const v = (env.values || []).find((x) => x.key === key); return v ? v.value : undefined; }
function usableToken(t) { return !!t && t.length > 20 && !/^(see |\{\{)/i.test(t); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run fn over items with limited concurrency; preserves input order in the result. */
async function mapPool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

async function searchOne(endpoint, token, od, dateStr) {
  const body = { data: { type: 'new_search', attributes: {
    start_station_code: od.from, finish_station_code: od.to,
    departure_date: dateStr, departure_time: '10:00',
    passengers: { adt_1: { category: 'adults' } },
  } } };
  const t0 = Date.now();
  // Retry transient failures (connection resets, 5xx) so flaky network never masquerades
  // as a real test failure. Real "no results" / 4xx are NOT retried — they're genuine signal.
  const MAX_ATTEMPTS = 2;
  let res, json, lastErr = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      res = await fetch(`${endpoint}/searches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.api+json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(18000),
      });
      json = await res.json().catch(() => ({}));
      if (res.status < 500) break;           // 2xx/3xx/4xx are final answers
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      res = null; lastErr = String(e).slice(0, 80);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(1500 * attempt);
  }
  const ms = Date.now() - t0;
  if (!res) {
    return { status: 'ERROR', http: 0, products: 0, ms, note: `${lastErr} (after ${MAX_ATTEMPTS} tries)` };
  }
  if (res.status !== 200) {
    const detail = (json && json.errors && json.errors[0] && (json.errors[0].detail || json.errors[0].title)) || '';
    return { status: 'ERROR', http: res.status, products: 0, ms, note: String(detail).slice(0, 90) };
  }
  const included = Array.isArray(json.included) ? json.included : [];
  const products = included.filter((c) => c.type === 'product');
  // sample lowest fare price if present (purely informational)
  let price = '';
  const fares = included.filter((c) => c.type === 'fare' && c.attributes && c.attributes.price);
  if (fares.length) {
    const cheapest = fares.reduce((a, b) => (Number(a.attributes.price.amount) <= Number(b.attributes.price.amount) ? a : b));
    price = `${cheapest.attributes.price.amount} ${cheapest.attributes.price.currency || ''}`.trim();
  }
  return { status: products.length ? 'PASS' : 'NO RESULTS', http: 200, products: products.length, ms, price };
}

(async () => {
  const only = (process.env.LH_ONLY || '').toUpperCase();
  const dateStr = futureDate(DAYS_AHEAD);
  console.log(`\nLocoHub API searchability — read-only — travel date ${dateStr} (+${DAYS_AHEAD}d), 1 adult\n`);
  const reportEnvs = [];

  for (const e of ENVS) {
    if (only && e.label !== only) continue;
    if (!fs.existsSync(e.file)) { console.log(`### ${e.label}: env file not found, skipped\n`); continue; }
    const env = JSON.parse(fs.readFileSync(e.file, 'utf8'));
    const endpoint = envVal(env, 'endpoint');
    const token = envVal(env, 'auth_token');
    console.log(`### ${e.label}  (${env.name})`);
    console.log(`    endpoint: ${endpoint}`);
    if (!usableToken(token)) { console.log('    -> no literal token in this env file (uses SSM); SKIPPED\n'); continue; }

    // Fire all 12 routes concurrently (read-only search) — far faster than one-by-one,
    // and one slow/dead route no longer holds up the rest.
    const envT0 = Date.now();
    const rows = await mapPool(ODS, 5, async (od) => ({ ...od, ...(await searchOne(endpoint, token, od, dateStr)) }));

    // Safeguard against transient blips: a timeout under concurrency isn't a real failure.
    // Re-check any ERRORed route ONCE, sequentially (no contention) — keep ERROR only if it
    // still fails. This stops a one-off timeout showing as a failure on the report or the deck.
    const toRecheck = rows.filter((r) => r.status === 'ERROR');
    if (toRecheck.length) {
      console.log(`    (transient? re-checking ${toRecheck.length} timed-out route(s) sequentially…)`);
      for (const r of toRecheck) {
        const retry = await searchOne(endpoint, token, r, dateStr);
        const i = rows.findIndex((x) => x.id === r.id);
        if (i >= 0) rows[i] = { ...rows[i], ...retry, rechecked: true };
      }
    }
    const wallSec = ((Date.now() - envT0) / 1000).toFixed(1);
    for (const r of rows) {
      const tag = r.status === 'PASS' ? 'PASS    ' : r.status === 'NO RESULTS' ? 'NO RESULT' : 'ERROR   ';
      let extra = r.status === 'PASS' ? `${r.products} product(s)${r.price ? ', from ' + r.price : ''}`
                   : r.status === 'ERROR' ? `HTTP ${r.http} ${r.note || ''}` : `HTTP ${r.http}`;
      if (r.rechecked) extra += r.status === 'ERROR' ? ' · re-checked, still failing' : ' · recovered on re-check';
      console.log(`    [${tag}] #${String(r.id).padStart(2)} ${r.route.padEnd(24)} ${String(r.ms).padStart(5)}ms  ${extra}`);
    }
    const pass = rows.filter((r) => r.status === 'PASS').length;
    const nores = rows.filter((r) => r.status === 'NO RESULTS').length;
    const err = rows.filter((r) => r.status === 'ERROR').length;
    console.log(`    ---- ${pass} PASS / ${nores} NO-RESULT / ${err} ERROR  (${wallSec}s wall-clock)\n`);
    reportEnvs.push({ label: e.label, name: env.name, endpoint, dateStr, summary: { pass, noResults: nores, error: err }, rows });
  }

  // Persist machine-readable + markdown report (no secrets).
  const outDir = path.join(__dirname, 'report');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'api-searchability.json'), JSON.stringify({ generatedFor: dateStr, envs: reportEnvs }, null, 2));

  let md = `# Rail Europe MSC — API Searchability (read-only)\n\n`;
  md += `Travel date tested: **${dateStr}** (+${DAYS_AHEAD} days), 1 adult. Source: LocoHub \`POST /searches\`.\n`;
  md += `This is a search-only check (no cart, no booking, no payment). Bot protection on the B2C site does not affect the API.\n\n`;
  for (const env of reportEnvs) {
    md += `## ${env.label} — ${env.name}\n\n`;
    md += `Endpoint: \`${env.endpoint}\`  \nResult: **${env.summary.pass} PASS / ${env.summary.noResults} NO-RESULT / ${env.summary.error} ERROR**\n\n`;
    md += `| # | Route | Carrier | Status | Products | Sample fare | ms |\n|---|---|---|---|---|---|---|\n`;
    for (const r of env.rows) {
      md += `| ${r.id} | ${r.route} | ${r.carrier} | ${r.status} | ${r.products || ''} | ${r.price || ''} | ${r.ms} |\n`;
    }
    md += `\n`;
  }
  fs.writeFileSync(path.join(outDir, 'msc-api-searchability.md'), md);
  console.log(`Reports written: report/api-searchability.json , report/msc-api-searchability.md`);
})().catch((e) => { console.log('FATAL:', String(e)); process.exit(1); });
