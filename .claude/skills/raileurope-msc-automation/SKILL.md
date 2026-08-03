---
name: raileurope-msc-automation
description: Run the Rail Europe B2B Manual Sanity Check (MSC) via this repo's Playwright automation instead of manually driving a browser — connectivity read, 12-sector cart + rail passes, SNCF Connect POS check, and read-only API searchability on staging + production. Use whenever asked to "run the sanity check", "run the MSC", or check Rail Europe B2B/carrier health, and this repo (raileurope-msc-automation) is present.
---

# Rail Europe MSC Automation

Deterministic Playwright replacement for the old "AI drives a live browser through
17 sectors" approach (~28 min, token-heavy, non-deterministic). This repo does the
same checks in ~3–5 minutes with zero human/AI click-variance, and produces a
booking reference as evidence.

Repo: https://github.com/psalgaonkar7/MSC.git (primary copy: `C:\Claude\raileurope-msc-automation`)

**Safety, always:** never pays, never uses agency allowance, never clicks
"CONTINUE TO PAY". The B2B flow stops at the Traveler Details page — status
**Created** — to capture the booking reference. It deliberately does **not** fill
traveler details or proceed to Hold & Payment: that step submits the order to the
carrier's own booking system and holds a real reservation on the carrier side (a
real side effect on a third-party system), confirmed via a LocoHub admin lookup
showing a real provider PNR/order for a sector that reached that step. `Created`
is the correct and sufficient stopping point — if you ever see a real-looking PNR
in a carrier admin panel or the booking status reads `Prebooked`, something has
regressed back to advancing past Traveler Details; fix it back to stopping there,
don't just relabel the result.

## Running it

```bash
cd C:\Claude\raileurope-msc-automation
export PATH="C:/Users/PSalgaonkar/AppData/Local/nodejs-portable/node-v24.18.0-win-x64:$PATH"
npm run sanity
```

Takes ~3–5 min. Runs in the background is fine — it's a real Playwright process,
not something driven through the browser-pane MCP tools, so don't use
`Claude_Browser` tools for this: they're unnecessary here and burn tokens for no
reason. Only reach for a manual browser flow if this automation is unavailable.

### If login has expired

`storageState.json` holds the saved B2B session. If the browser suite fails early
with auth/redirect-to-login errors, the session has expired. Do **not** attempt to
log in yourself (credential entry is off-limits) — tell the user to run:

```bash
npm run auth
```

This opens a real headed Chromium window for **them** to sign in manually with
their own credentials; it closes once the session is captured. Their password is
never typed by or stored in any script you run.

## What it checks (4 stages, see README.md for full detail)

1. **B2B browser suite** (`tests/b2b-msc.spec.js`, `tests/b2b-passes.spec.js`):
   connectivity read (flags any carrier RED/unstable >15 min per SOP rule #1),
   SNCF Connect POS search-only validation (3 ODs), builds all 12 point-to-point
   sectors + 1 random rail pass into **one shared cart**, proceeds only as far as
   Traveler Details → booking reference, status Created. Stops there.
2. **API searchability** (`api-searchability.js`): same 12 ODs hit directly via
   the LocoHub API on staging + production — bypasses anti-bot, so this is also
   how B2C's search engine gets validated (B2C itself can't be browser-driven).
3. **Manager deck refresh** (`deck/gen.js`): auto-updates the "Proof" slide in
   `Rail-Europe-MSC-Automation-Overview.pptx` from this run.
4. **Run history log** (`log-run.js`): appends to `run-history.jsonl` for
   `npm run weekly`.

## Reporting results

Read `report/msc-b2b.json`, `report/msc-api-searchability.md`, and the console
summary block ("RAIL EUROPE MSC — SANITY RUN SUMMARY"). Lead with:
- **Booking reference** (K + 9 digits) — status will read Created, that's expected
- Sectors in cart (X/12) + which pass, expired count (must be 0)
- API PASS count for staging and production (expect 12/12 each)
- Any carrier connectivity flags (RED/unstable >15 min) with affected ODs — these
  need manual review (cross-check on Trainline, escalate per Critical Incident
  Management if confirmed), never auto-escalate yourself
- Staging/production API errors, noting if they self-resolved on retry

Do **not** draft or send the daily team email — only report findings back to the
user. Do not treat a `storageState.json` expiry as a site outage (see above).
