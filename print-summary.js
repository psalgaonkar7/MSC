// Prints a human-readable summary of the latest sanity run to the console — the same kind
// of detailed breakdown given in chat (booking ref, per-check table, sector list, connectivity
// flags with affected routes, API detail). Reads only the report files already on disk;
// makes no network calls. Run standalone: node print-summary.js
const fs = require('fs');
const path = require('path');
const REPORT = path.join(__dirname, 'report');
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(REPORT, f), 'utf8')); } catch { return null; } };

const b2b = read('msc-b2b.json') || {};
const api = read('api-searchability.json') || {};
const env = (label) => (api.envs || []).find((e) => e.label === label);
const prod = env('PRODUCTION');
const stg = env('STAGING');

const line = (ch = '─') => ch.repeat(72);
const check = (ok) => (ok ? '[PASS]' : ok === false ? '[FAIL]' : '[ -- ]');

console.log('\n' + line('='));
console.log(' RAIL EUROPE MSC — SANITY RUN SUMMARY');
console.log(line('='));

if (b2b.booking) {
  const trains = (b2b.sectorsInCart != null && b2b.sectorsTotal != null) ? `${b2b.sectorsInCart}/${b2b.sectorsTotal}` : '?/12';
  const passNote = b2b.passInBooking && b2b.passInBooking.status === 'IN CART' ? ` + pass: ${b2b.passInBooking.product}` : '';
  console.log(`\n BOOKING REFERENCE: ${b2b.booking}`);
  console.log(` ${trains} sectors in cart${passNote}  ·  expired: ${b2b.bookingExpiredSectors ?? 0}  ·  stopped before payment`);
} else {
  console.log('\n BOOKING REFERENCE: none captured this run (browser suite likely failed — check login with `npm run auth`)');
}

console.log('\n' + line());
console.log(' CHECK                          RESULT');
console.log(line());
const sncfOk = Array.isArray(b2b.sncfPos) && b2b.sncfPos.length > 0 && b2b.sncfPos.every((r) => r.result === 'PASS');
console.log(` Connectivity read              ${check(Array.isArray(b2b.connectivity) && b2b.connectivity.length > 0)} ${b2b.connectivity ? b2b.connectivity.length + ' carriers' : ''}`);
console.log(` SNCF Connect POS               ${check(b2b.sncfPos && b2b.sncfPos.length ? sncfOk : null)} ${(b2b.sncfPos || []).map((r) => `${r.od}:${r.result}${r.count != null ? '(' + r.count + ')' : ''}`).join(', ')}`);
console.log(` Booking reference              ${check(!!b2b.booking)}`);
console.log(` API — Production               ${check(prod ? prod.summary.pass === prod.rows.length : null)} ${prod ? `${prod.summary.pass}/${prod.rows.length}` : 'n/a'}`);
console.log(` API — Staging                  ${check(stg ? stg.summary.pass === stg.rows.length : null)} ${stg ? `${stg.summary.pass}/${stg.rows.length}` : 'n/a'}`);

if (Array.isArray(b2b.sectors) && b2b.sectors.length) {
  const inCart = b2b.sectors.filter((s) => s.status === 'IN CART').map((s) => `#${s.id} ${s.carrier}`);
  const dropped = b2b.sectors.filter((s) => s.status !== 'IN CART');
  console.log('\n' + line());
  console.log(' SECTORS');
  console.log(line());
  console.log(' In cart: ' + (inCart.join(', ') || '(none)'));
  if (dropped.length) {
    console.log('\n ⚠ DROPPED:');
    dropped.forEach((s) => console.log(`   #${s.id} ${s.carrier} — ${s.status}${s.error ? ': ' + s.error : ''}`));
  }
}

const esc = b2b.connectivityEscalations || [];
const watch = b2b.connectivityWatch || [];
console.log('\n' + line());
console.log(' CONNECTIVITY FLAG  (SOP rule #1 — nothing auto-sent, manual review only)');
console.log(line());
if (esc.length) {
  esc.forEach((e) => {
    const dur = e.minutes != null ? `~${e.minutes} min` : 'duration not stated';
    const ods = e.affectedODs && e.affectedODs.length ? `  ->  ${e.affectedODs.join(', ')}` : '';
    console.log(`  ${e.carrier} — ${e.status} (${dur})${ods}`);
  });
} else {
  console.log('  No carriers currently flagged (all under 15 min / stable).');
}
if (watch.length) {
  console.log('\n  Watch-list (<=15 min or unknown, not escalated):');
  console.log('   ' + watch.map((w) => `${w.carrier}:${w.status}${w.minutes != null ? '(' + w.minutes + 'm)' : ''}`).join(', '));
}

if (prod || stg) {
  console.log('\n' + line());
  console.log(' API DETAIL');
  console.log(line());
  for (const [label, e] of [['Production', prod], ['Staging', stg]]) {
    if (!e) continue;
    const issues = e.rows.filter((r) => r.status !== 'PASS');
    console.log(`  ${label}: ${e.summary.pass}/${e.rows.length} PASS` + (issues.length ? '' : '  (clean)'));
    issues.forEach((r) => console.log(`    #${r.id} ${r.route} — ${r.status}${r.rechecked ? (r.status === 'ERROR' ? ' (re-checked, still failing)' : ' (recovered on re-check)') : ''}`));
  }
}

console.log('\n' + line('='));
console.log(` Reports: report/msc-b2b.json, report/api-searchability.json, report/msc-api-searchability.md`);
console.log(` Deck:    Rail-Europe-MSC-Automation-Overview.pptx (auto-refreshed)`);
console.log(line('=') + '\n');
