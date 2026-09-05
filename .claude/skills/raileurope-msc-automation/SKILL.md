---
name: raileurope-msc-automation
description: Run the Rail Europe B2B Manual Sanity Check (MSC) via this repo's Playwright automation instead of manually driving a browser — section-aware connectivity read, carrier-coverage guard, 19 point-to-point sectors + 4 rail passes built into batched carts, SNCF Connect POS check, and read-only API searchability on staging + production. Use whenever asked to "run the sanity check", "run the MSC", or check Rail Europe B2B/carrier health, and this repo (RE\MSC in the C:\Claude workspace) is present.
---

# Rail Europe MSC Automation

Deterministic Playwright replacement for the old "AI drives a live browser" approach
(~28 min, token-heavy, non-deterministic). This repo covers **every carrier on the
connectivity page** in **~6 minutes** and produces booking references as evidence.

Repo: https://github.com/psalgaonkar7/Local.git (primary copy: `RE\MSC` in the `C:\Claude` workspace)

**Safety, always:** never pays, never uses agency allowance, never clicks
"CONTINUE TO PAY". The flow stops at the **Traveler Details** page — status
**Created** — to capture the booking reference. It deliberately does **not** fill
traveler details or proceed to Hold & Payment: that step submits the order to the
carrier's own booking system and holds a real reservation there, confirmed via a
LocoHub admin lookup showing a real provider PNR for a sector that reached it.
`Created` is the correct stopping point — if you ever see a real-looking PNR in a
carrier admin panel, or the status reads `Prebooked`, something has regressed back to
advancing past Traveler Details. Fix it back to stopping there; don't relabel the result.

## ⚠️ Run only ONE instance at a time

Every browser check shares **one B2B account, one cart, one POS**. Never start a run
while another `npm run sanity` (or `npm run auth`) is going — they corrupt each other.
This has already caused two misdiagnoses. Before starting, check nothing is running:

```bash
# PowerShell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'run-sanity|playwright' }
```

Also note: killing a run's wrapper does **not** stop its Playwright children — they
orphan and keep driving the account. Kill the whole process tree by walking descendants.

## Running it

```bash
cd C:\Claude\RE\MSC
export PATH="C:/Users/PSalgaonkar/AppData/Local/nodejs-portable/node-v24.18.0-win-x64:$PATH"
npm run sanity
```

Takes ~6 min. Running it in the background is fine — it's a real Playwright process,
not something driven through the browser-pane MCP tools, so don't use `Claude_Browser`
tools for this: they're unnecessary and burn tokens. Only reach for a manual browser
flow if this automation is unavailable.

Useful env vars: `MSC_MAX_SECTORS=4` (validate on a subset first — do this before any
full run after changing selectors), `MSC_MAX_ITEMS_PER_ORDER`, `MSC_DAYS_AHEAD`,
`HEADED=1`, `LH_ONLY=production`.

### If login has expired

`storageState.json` holds the saved B2B session. If the browser suite fails early with
auth/redirect-to-login errors, the session has expired. Do **not** attempt to log in
yourself (credential entry is off-limits) — tell the user to run `npm run auth`, which
opens a headed browser for **them**. Their password is never typed by or stored in any
script you run. Note `npm auth` is not a valid command; it must be `npm run auth`.

## What it checks

1. **B2B browser suite** (`tests/b2b-msc.spec.js`, `tests/b2b-passes.spec.js`):
   - **section-aware** connectivity read (Point-to-point / Passes / Services) — flags any
     carrier RED/unstable >15 min per SOP rule #1
   - **carrier-coverage guard** — every carrier on the page must be booked, passed,
     knowingly excluded, or explicitly pending a route, else `UNMAPPED CARRIER`
   - SNCF Connect POS search-only validation (3 ODs), then switches POS **back explicitly**
   - **19 sectors + 4 passes** built into batched carts → one booking reference per order
2. **API searchability** (`api-searchability.js`): LocoHub API on staging + production.
   Runs **in parallel** with the browser suite. Also how B2C's engine is validated, since
   B2C itself is anti-bot blocked.
3. **Manager deck** (`deck/gen.js`) and **run history** (`log-run.js` → `npm run weekly`).

## Things that are true and non-obvious

- **An order caps at 15 items.** The 16th add-to-cart returns "You have reached the
  maximum number of items in your order". Coverage needs 23, so the run builds multiple
  orders (passes first) and captures a reference for each. This cap was also the real
  cause of the long-running "Swiss Travel Pass randomly times out" symptom.
- **`workers: 1` is mandatory** in `playwright.config.js`. Only ~13s of the run is
  parallelisable; the POS check mutates the point of sale **account-wide** and the booking
  test owns the shared cart. A run at default workers lost all 3 POS ODs and all 12 sectors.
  Real parallelism needs a second B2B account, not a config change.
- **Never select on `id`** — the portal generates a fresh random `id` per page load.
  `data-select` is the stable contract; the fragile selectors live in the `SEL` map in
  `lib/helpers.js`. A portal rename (`name="from"` → `ng.form1.from`) once made every
  sector fail with opaque 20s timeouts.
- **Travellers reset to 0** on any full `/home` load, and SEARCH then silently refuses to
  submit with no validation message. `setAdults()` is idempotent and runs before every
  search for this reason.
- **Switching POS is account-level** — navigating away does NOT reset it. It must be
  switched back explicitly or it poisons the next test.
- **`blockNoise()`** aborts `kameleoon.io` / `quantummetric.com`; they hang ~38s per page
  load. Never add `waitForLoadState('networkidle')` to this suite — it can never settle.
- A carrier already flagged down is reported as `EXPECTED (carrier flagged)`, not `ERROR`.
  Don't report those as regressions.
- **Pending routes:** `ARENAWAYS`, `CAMPANIA EXPRESS`, `SJ` have no confirmed OD yet.
  Re-run `node tools/discover-carriers.js` when they're up. `HEPSTAR` is excluded by
  design (insurance, not bookable).

## Reporting results

Read `report/msc-b2b.json`, `report/msc-api-searchability.md`, and the console summary
("RAIL EUROPE MSC — SANITY RUN SUMMARY"). Lead with:
- **Booking references** (K + 9 digits, one per order) — status reads `Created`, expected
- Sectors in cart and passes in cart, expired count (must be 0)
- **Carrier coverage** — covered/pending/excluded, and loudly if anything is `UNMAPPED`
- API PASS counts for staging and production
- Any connectivity flags (RED/unstable >15 min) with affected ODs — these need manual
  review (cross-check on Trainline, escalate per Critical Incident Management if
  confirmed); **never auto-escalate yourself**

Do **not** draft or send the daily team email — only report findings back to the user.
Do not treat a `storageState.json` expiry as a site outage. Don't present an unverified
guess as a finding: if something dead-ends, say so.
