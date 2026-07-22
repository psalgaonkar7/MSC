# Rail Europe — MSC Automation (Playwright)

Deterministic, fast, repeatable **Manual Sanity Check** for Rail Europe **B2B**.
Replaces "an AI clicking the live browser" (~28 min, non-deterministic) with a real
test suite that runs the same checks in **~3–4 minutes**, with zero human-error
variance and auto-generated evidence — a booking reference, a Markdown/JSON report,
an auto-updating manager slide deck, and a weekly summary.

> **Safety, always:** the suite **never pays and never confirms a booking**, and
> **never uses agency allowance**. The B2B flow fills *dummy* traveler details (never
> real PII) for every sector and pass in the cart, then proceeds to the *Hold &
> Payment* page — one step further than just creating the booking — so the booking
> reaches status **Prebooked** rather than stopping at `Created`. That is the hard
> stop: no payment method is ever selected, no billing field is ever touched, and
> **CONTINUE TO PAY is never clicked**. The API layer is **read-only search**, nothing
> is ever booked.

---

## What this checks (maps to the official Manual Sanity Check SOP)

| # | Check | How |
|---|---|---|
| 1 | **Carrier connectivity** | Reads the B2B health-center page; flags any carrier RED/unstable **> 15 min** (SOP rule #1) with the affected route — flags for **manual review only**, nothing is auto-sent anywhere |
| 2 | **12 point-to-point routes** | Builds all 12 into **one shared cart**, adds **1 randomly-chosen rail pass** (Eurail/Interrail *or* Swiss) to the same cart, fills dummy traveler details for every sector/pass, and proceeds to Hold & Payment — asserts the booking reaches status **Prebooked** and no sector is expired. Never pays. |
| 3 | **SNCF Connect key-account POS** | Switches POS, runs **search-only** validation for 3 ODs, reverts POS |
| 4 | **Rail passes searchability** | Confirms Eurail, Interrail (destination "Europe") and Swiss Travel Pass (destination "Switzerland") return real products |
| 5 | **API searchability (bot-proof)** | Calls the LocoHub search API directly for all 12 routes on **Staging and Production** — no browser, so it isn't affected by anti-bot walls. Self-heals transient timeouts with an automatic re-check. |
| 6 | **Manager deck** | `Rail-Europe-MSC-Automation-Overview.pptx` auto-refreshes its "Proof" slide from the latest run |
| 7 | **Weekly report** | Every run is logged; `npm run weekly` compiles the week into `weekly-report.md` |

**B2C note:** the public consumer site (`www.raileurope.com`) is protected by anti-bot
detection, so it cannot be driven directly by a headless browser. Its search engine is
validated instead through the **Production API check** (#5 above), which is the same
engine B2C uses.

---

## One-time setup (each person does this on their own machine)

1. **Install Node.js** (18+). If you don't have admin rights, use a **portable Node**
   build (zip, no installer) and add its folder to your PATH.
2. Install dependencies:
   ```bash
   npm install
   npx playwright install chromium
   ```
3. **Capture your own B2B login** (opens a real browser — you sign in manually with
   *your own* Rail Europe credentials; the password is never typed into or stored by
   any script):
   ```bash
   npm run auth
   ```
   Saves `storageState.json` locally. **This file is your live login session —
   never share it, never commit it** (it's already git-ignored). Re-run `npm run auth`
   whenever the session expires (roughly every few hours of inactivity).
4. **(Optional) Point at your own Postman exports**, only needed for the API check
   (`npm run api` / step 5 above). Set an environment variable to your own exported
   Postman environment folder:
   ```bash
   # PowerShell
   $env:POSTMAN_DIR = "C:\path\to\your\Postman json files\LH"
   # bash
   export POSTMAN_DIR="/path/to/your/Postman json files/LH"
   ```
   If you skip this, the API check simply won't have a token and will report which
   environment file it needs — everything else (the booking-reference flow) still
   works without it.

**Nothing else is shared or transferable.** Each teammate authenticates as *themselves*
— that's intentional. This also means the checks reflect exactly what a real agent with
that person's permissions can do.

---

## Daily commands

```bash
npm run sanity   # EVERYTHING: connectivity flag + SNCF POS + booking (12 trains + 1 pass) + API + deck + log
npm run booking  # JUST the booking reference (fastest path to a K-number, ~2-3 min)
npm run msc      # connectivity + SNCF POS + booking reference (no API, no deck)
npm run passes   # rail pass searchability only (Eurail + Interrail + Swiss)
npm run api      # read-only API searchability, all 12 ODs, staging + production
npm run deck     # rebuild the manager PowerPoint from the latest report (close the .pptx first if it's open)
npm run weekly   # compile run-history.jsonl into weekly-report.md
npm run report   # open the Playwright HTML report
npm run auth     # re-do the login capture when your session expires
```

**Fully standalone (no AI assistant needed):** `npm run sanity` already prints a
human-readable summary at the end (booking reference, per-check table, sector list,
connectivity flags with affected routes, API detail) — the same breakdown you'd get
if someone summarized it for you. Two double-clickable PowerShell scripts wrap the
common commands so you never have to remember the Node PATH setup:

```powershell
.\run-sanity.ps1   # full sanity check, prints the summary, pauses at the end
.\run-auth.ps1     # login refresh
```

Reports land in `report/` (gitignored — regenerated every run):
- `msc-b2b.json` — connectivity flags, SNCF POS results, booking reference, per-sector status
- `msc-passes.json` — pass search results
- `api-searchability.json` / `msc-api-searchability.md` — API results, both environments

`run-history.jsonl` accumulates one line per `npm run sanity` run — this is what
`npm run weekly` reads to build the weekly report. It's **local to your machine**
(git-ignored, like the report files) so everyone's run history stays their own and
running the suite never creates merge conflicts. Each teammate gets their own weekly
report from their own runs.

---

## Running where? (cloud vs. local)

This automation **runs locally** — it drives a real Chromium browser using your saved
login session, so it needs to run on a machine, not as a hosted cloud service. There is
no shared "cloud" version to log into; each person runs it in **their own terminal**
(or their own Claude Code / coding-assistant session) with **their own copy of this
folder** open as the working directory. To hand this to a teammate:

1. Get the code onto their machine (see below — **git repo strongly recommended**)
2. They do the one-time setup above (their own login, optionally their own Postman env)
3. They run the same `npm run sanity`

If you eventually want this running unattended on a schedule (so nobody has to trigger
it by hand), that needs a machine that stays on with a durable login — a separate,
bigger conversation about session/credential handling with your security team. Not
required for day-to-day manual/on-demand use.

---

## Sharing this with a teammate: git repo vs. a shared folder

**Use a private git repository** (whatever your org uses internally — GitHub, GitLab,
Azure DevOps). It's safer and far less effort to keep updated:

| | Shared folder / zip | Git repo |
|---|---|---|
| Secrets excluded automatically | ❌ you must remember to delete `storageState.json` etc. every time | ✅ `.gitignore` handles it every time |
| Getting your latest fixes | ❌ re-zip and re-send | ✅ `git pull` |
| History / review | ❌ none | ✅ full history, diffs, PRs |

If a shared folder/zip is genuinely your only option, **always delete
`storageState.json`** (and any Postman JSON files) from the copy before sending it —
those are login credentials, not code.

### Quick repo setup
```bash
git init
git add .
git commit -m "Rail Europe MSC automation"
# then push to your team's private remote
```
`.gitignore` already excludes `node_modules/`, `storageState.json`, Postman
environment files, `report/`, `test-results/`, and one-off diagnostic scripts
(`inspect*.js`, `explore-*.js`, `api-find.js`, `api-smoke.js`, `api-stations.js`).

---

## Safety guardrails (built in, not optional)

- ✅ Traveler details are always dummy data (`Sanity Test`, a `donotuse@` email) —
  never real PII, regardless of how far the flow proceeds
- ✅ Never selects/changes a payment method, never touches billing fields, and
  **never clicks CONTINUE TO PAY** — the flow stops on the Hold & Payment page
- ✅ Never uses agency allowance
- ✅ The API layer only searches — never books
- ✅ No booking reference is reported if any sector shows as expired
- ✅ Login credentials are never typed into, stored by, or logged by any script
- ✅ Connectivity issues are **flagged for manual review only** — nothing is
  auto-sent to Teams, email, or a ticketing system
- ✅ The SNCF Connect POS check remains **search-only** — untouched by the
  Prebooked-flow change

---

## Project layout

```
playwright.config.js       projects: setup (login) / b2b / b2c
data/journeys.js           the 12 journeys + SNCF POS ODs + pass destinations (edit test data here)
lib/helpers.js              reusable flow steps (search, add-to-cart, checkout, pass add, POS switch, connectivity flagging)
tests/auth.setup.js         one-time manual login -> storageState.json
tests/b2b-msc.spec.js       connectivity flag + SNCF POS + booking reference + random pass in cart
tests/b2b-passes.spec.js    rail pass searchability (Eurail + Interrail + Swiss)
tests/b2c-searchability.spec.js   parallel B2C search checks (blocked by anti-bot; reports as such)
api-searchability.js        read-only LocoHub API check for all 12 ODs (staging + production)
run-sanity.js                orchestrates: browser suite -> API check -> deck refresh -> history log
log-run.js                   appends one summary line per run to run-history.jsonl
weekly-report.js             compiles run-history.jsonl into weekly-report.md
deck/gen.js                  builds/refreshes Rail-Europe-MSC-Automation-Overview.pptx from the latest report
check-login.js               quick standalone check of whether the saved login is still valid
report/                      JSON + HTML output (gitignored, regenerated every run)
```

## Known limitations

- **Selectors can drift** if the portal's UI changes — the spots most likely to need a
  tweak are marked `// TUNE:` in `lib/helpers.js`.
- **Carrier instability** (a real carrier being RED/unstable) can occasionally drop a
  sector from the cart; this is flagged, isolated (won't cascade to other sectors), and
  is not a bug in the automation.
- **Traveler-details confirm can intermittently fail** with a generic backend error
  ("Sorry, something unexpected happened" / "Error: Something went wrong") on an
  otherwise-correctly-filled section. Observed across unrelated cart items (a specific
  Eurail pass product, Swiss Travel Pass, a plain OBB sector) in different runs, with
  field values confirmed correct via DOM inspection each time — this looks like backend
  confirm-endpoint instability rather than a script bug. The automation retries 3x per
  section, then **fails fast with a clear error** naming the booking ref and the exact
  error text, rather than retrying indefinitely. Worth a bug report if it recurs
  consistently for one specific product.
- **B2C UI** cannot be driven directly (anti-bot); covered via the Production API check
  instead.
