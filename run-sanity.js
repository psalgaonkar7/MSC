// Full sanity runner. Runs the B2B browser suite AND the API searchability check —
// the API ALWAYS runs, even if a browser test fails, so a transient portal hiccup can
// never hide the (bot-proof) search signal. Then it auto-refreshes the manager deck from
// the fresh report data. Exits non-zero if the browser or API part failed.
const { spawnSync } = require('child_process');

// One id for the whole run, inherited by every Playwright worker. The b2b spec merges its
// report with the on-disk copy only when the ids match, so a worker that Playwright replaces
// mid-run can't lose the earlier worker's results or pick up a previous run's.
process.env.MSC_RUN_ID = `${new Date().toISOString()}-${process.pid}`;

function run(cmd) {
  const r = spawnSync(cmd, { stdio: 'inherit', shell: true, cwd: __dirname });
  return r.status == null ? 1 : r.status;
}

console.log('\n=== 1/4 · B2B browser suite (connectivity, SNCF POS, booking, passes) ===\n');
const b2b = run('npx playwright test --project=b2b');

console.log('\n=== 2/4 · API searchability (all 12 ODs · staging + production) ===\n');
const api = run('node api-searchability.js');

console.log('\n=== 3/4 · Refresh manager deck from this run ===\n');
const deck = run('node deck/gen.js'); // never blocks the run result; just a warning if the .pptx is open

console.log('\n=== 4/4 · Log this run to run-history.jsonl (for the weekly report) ===\n');
run('node log-run.js'); // always logs — even a failed/partial run — so the weekly report stays complete

// Human-readable summary (booking ref, per-check table, sectors, connectivity flags, API
// detail) — the same breakdown given in chat, so this is useful standalone too.
run('node print-summary.js');

// Deck refresh is silent on success — only shout if it couldn't update (needs attention).
const deckNote = deck === 0 ? '' : '  ·  ⚠ DECK NOT UPDATED — close Rail-Europe-MSC-Automation-Overview.pptx and run `npm run deck`';
console.log(`=== sanity done · browser ${b2b === 0 ? 'PASS' : 'FAIL'} · api ${api === 0 ? 'PASS' : 'FAIL'} ===${deckNote}`);
process.exit(b2b || api ? 1 : 0);
