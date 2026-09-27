// One command for both logins this repo depends on:
//   1. AWS SSO (era) — needed for the Group Bookings-Salesforce Sync check in extra-checks.js.
//      Opens YOUR browser for YOU to sign in; nothing here ever sees or types a password.
//      Independent of step 2 — if you skip/cancel it, or it's not set up, or it fails, this
//      still goes on to the B2B login below rather than blocking on it. The AppFlow check
//      already degrades to [check manually] on its own if this was skipped; see README:
//      "Also needs a live login".
//   2. B2B portal (customercare.raileurope.com) — the actual tests/auth.setup.js flow this
//      script replaces as the `auth` command; unchanged, same as running it directly.
//
// Run with:  npm run auth
// Only step 2 is required for `npm run sanity` to work at all; step 1 only affects one item
// in the sanity mail, so its outcome never fails this command's exit code.
const { spawnSync } = require('child_process');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: __dirname });
  return r.status == null ? 1 : r.status;
}

console.log('\n=== 1/2 · AWS SSO (era) — for the Group Bookings-Salesforce Sync check ===\n');
console.log('Opens your browser for you to sign in. Skip/cancel is fine — this never blocks step 2.\n');
const awsExit = run('aws', ['sso', 'login', '--sso-session', 'era']);

console.log(`\n${awsExit === 0 ? '✓ AWS SSO refreshed.' : '⚠ AWS SSO not refreshed — the Group Bookings-Salesforce Sync item will read [check manually] until this succeeds. Re-run any time with: aws sso login --sso-session era'}\n`);

console.log('=== 2/2 · B2B portal login (customercare.raileurope.com) ===\n');
console.log('A real browser window opens — sign in there yourself. Nothing here ever sees your password.\n');
const b2bExit = run('npx', ['playwright', 'test', '--project=setup', '--headed']);

console.log(`\n=== auth done · AWS SSO ${awsExit === 0 ? 'OK' : 'skipped/failed'} · B2B ${b2bExit === 0 ? 'OK' : 'FAILED'} ===`);
// Exit code reflects the B2B login only — that one is required for npm run sanity to work at
// all. AWS SSO failing/being skipped is a real but non-blocking gap, already surfaced above
// and by the sanity mail item itself; it must not make `npm run auth` itself look broken.
process.exit(b2bExit);
