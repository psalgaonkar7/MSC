# Rail Europe — MSC Automation (Playwright)

Deterministic, repeatable **Manual Sanity Check** for Rail Europe **B2B**.
Replaces "an AI clicking the live browser" (~28 min, non-deterministic) with a real
test suite that covers **every carrier on the connectivity page** in **~6 minutes**,
with zero human-error variance and auto-generated evidence — booking references, a
Markdown/JSON report, an auto-updating manager slide deck, and a weekly summary.

> **Safety, always:** the suite **never pays, never confirms a booking**, and
> **never uses agency allowance**. It builds the cart and proceeds only as far as the
> **Traveler Details** page to capture the booking reference — status `Created`.
>
> It deliberately does **not** fill traveler details and does **not** click "Continue to
> Hold & Payment". That step submits the order to the carrier's own booking system —
> confirmed via LocoHub admin, where a real provider PNR/order was found held on the
> carrier side ("Booked. The item has not been purchased."). That is a real side effect
> on a third-party system, so a daily automation must not trigger it. `Created` status
> (cart-side only, nothing sent to any carrier) is sufficient proof of a working MSC.
> The API layer is **read-only search**; nothing is ever booked.

---

## ⚠️ Run only ONE instance at a time

Every browser check shares **one B2B account, one cart, and one point of sale**. Two
concurrent `npm run sanity` (or a `npm run auth` during a run) corrupt each other — this
has already caused two misdiagnoses. For the same reason `playwright.config.js` pins
**`workers: 1`**; do not raise it. See [Why not more workers?](#why-not-more-workers).

---

## What this checks (maps to the official Manual Sanity Check SOP)

| # | Check | How |
|---|---|---|
| 1 | **Carrier connectivity** | Reads the B2B health-center page **section-aware** (Point-to-point / Passes / Services). Flags any carrier RED/unstable **> 15 min** (SOP rule #1) with the affected route — **manual review only**, nothing is auto-sent anywhere |
| 2 | **Carrier coverage guard** | Asserts every carrier on the connectivity page is booked, passed, knowingly excluded, or explicitly pending a route. Anything else is reported as **`UNMAPPED CARRIER`** so coverage cannot drift silently when Rail Europe adds a carrier |
| 3 | **19 point-to-point sectors + 4 rail passes** | Built into shared carts, proceeding to Traveler Details to capture a booking reference per order (status **Created**), asserting no item is expired. Stops there — no traveler data, no Hold & Payment, no payment |
| 4 | **SNCF Connect key-account POS** | Switches POS, runs **search-only** validation for 3 ODs, then explicitly switches back |
| 5 | **Rail passes searchability** | Confirms Eurail + Interrail ("Europe"), Swiss Travel Pass ("Switzerland") and BritRail ("United Kingdom") return real products |
| 6 | **API searchability (bot-proof)** | Calls the LocoHub search API directly on **Staging and Production** — no browser, so anti-bot walls don't apply. Runs **in parallel** with the browser suite. Self-heals transient timeouts with an automatic re-check |
| 7 | **Manager deck** | `Rail-Europe-MSC-Automation-Overview.pptx` auto-refreshes its "Proof" slide from the latest run |
| 8 | **Weekly report** | Every run is logged; `npm run weekly` compiles the week into `weekly-report.md` |

**B2C note:** the public consumer site (`www.raileurope.com`) is protected by anti-bot
detection, so it cannot be driven by a headless browser. Its search engine is validated
instead through the **Production API check** (#6), which is the same engine B2C uses.

---

## Carrier coverage

The connectivity page currently advertises **28 status lines / 26 distinct carriers**
across three inventories. `TRENITALIA` and `SBB` appear in **both** point-to-point and
passes and can report **different statuses at the same time**, which is why the parse is
section-aware — flattening them made the escalation list self-contradictory and hid one
of two outages.

Coverage is **explicit, not inferred**. Each journey in `data/journeys.js` carries:

| Field | Purpose |
|---|---|
| `connectivityNames` | the EXACT health-center names this journey proves |
| `carrierSlug` | prefix of the results-page `data-select="ptp-carrier-logo-<slug>"` |
| `fromCode` / `toCode` | LocoHub station codes (so the API check derives routes from here) |

`carrierSlug` matters: several routes serve multiple carriers (Barcelona→Madrid returns
RENFE **and** IRYO **and** OUIGO; Rome→Milan returns Trenitalia **and** Italo). The old
flow added whichever fare was listed first, so those routes tested **one** carrier while
implying they tested all of them. `addFareForCarrier()` now selects that carrier's own
fare and **throws** if the carrier isn't offered, rather than silently adding someone
else's and reporting a false pass.

Slugs are matched as a **prefix** because operators sell under sub-brands —
`rdg` covers `rdg_avanti_west_coast` / `rdg_lumo` / `rdg_scotrail`, `trenitalia` covers
`trenitalia_frecciarossa`, `dbahn` covers `dbahn_intercity_express`. SNCF has no `sncf`
logo at all; it sells as `tgvinoui`.

**Current status: 22 of 26 covered, 0 unmapped.**

- **Excluded deliberately:** `HEPSTAR` — an insurance service, not a bookable rail product.
- **Pending a confirmed route:** `ARENAWAYS`, `CAMPANIA EXPRESS`, `SJ` — each was down or
  unknown during discovery, so no route is asserted rather than guessing one. Re-run the
  discovery tool when they recover.

> **Note on the official MSC sheet:** its `TER / SNCF — Paris-Stuttgart` row is
> misleading. That route returns `dbahn`, `dbahn_intercity_express`, `dbsncf` and
> `tgvinoui` — **no `ter` at all** — so TER was never actually covered despite the label.
> TER now has its own route (Paris→Rouen).

### Discovering / re-checking carrier routes

```bash
node tools/discover-carriers.js          # all candidate routes
MSC_ONLY_NEW=1 node tools/discover-carriers.js   # skip the already-covered ones
```

Read-only (search only, never adds to a cart). For each route it reports the autocomplete
option it chose and every carrier logo slug the results contain, then writes
`report/carrier-discovery.json`. It deliberately does **not** auto-assign carriers to
routes: the LocoHub API reports train *brands* ("Railjet Xpress", "ICE", "TGV INOUI",
"Intercity") which don't map cleanly onto operator codes, so that mapping stays a human
decision.

---

## The 15-item order cap

The B2B portal **caps an order at 15 items** — the 16th add-to-cart is answered with
*"You have reached the maximum number of items in your order, please proceed to …"*.

Full coverage needs 23 items (19 sectors + 4 passes), so the run builds **multiple orders**
and captures **a booking reference for each**:

| Order | Contents | Items |
|---|---|---|
| 1 | 4 passes + first 11 sectors | 15 |
| 2 | remaining sectors | 8 |

**Passes go first** so they can't be squeezed out by sectors filling the cart. Between
orders the cart is cleared and each order gets its own expiry check and reference.

This cap is also the real cause of a long-standing "the Swiss Travel Pass randomly times
out" mystery: 12 sectors + 3 passes is *exactly* 15, so the third pass sat right on the
limit and failed intermittently. It looked like an opaque 35s timeout for weeks purely
because nothing was reading the portal's on-screen error text.

Override with `MSC_MAX_ITEMS_PER_ORDER` if the portal's limit changes.

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
   (`npm run api` / check #6). Set an environment variable to your own exported
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
npm run sanity   # EVERYTHING: connectivity + coverage guard + SNCF POS + 19 sectors + 4 passes + API + deck + log
npm run booking  # JUST the cart/booking references (fastest path to a K-number)
npm run msc      # connectivity + SNCF POS + booking references (no API, no deck)
npm run passes   # rail pass searchability only (Eurail + Interrail + Swiss + BritRail)
npm run api      # read-only API searchability, staging + production
npm run deck     # rebuild the manager PowerPoint from the latest report (close the .pptx first if open)
npm run weekly   # compile run-history.jsonl into weekly-report.md
npm run report   # open the Playwright HTML report
npm run auth     # re-do the login capture when your session expires
```

Handy env vars: `MSC_MAX_SECTORS=4` (validate the flow on a subset first),
`MSC_DAYS_AHEAD`, `MSC_MAX_ITEMS_PER_ORDER`, `HEADED=1` (watch it run),
`LH_ONLY=production`.

**Fully standalone (no AI assistant needed):** `npm run sanity` prints a human-readable
summary at the end — booking references, per-check table, sector list grouped by outcome,
connectivity flags with affected routes, coverage gaps, and API detail. Two
double-clickable PowerShell scripts wrap the common commands so you never have to
remember the Node PATH setup:

```powershell
.\run-sanity.ps1   # full sanity check, prints the summary, pauses at the end
.\run-auth.ps1     # login refresh
```

Reports land in `report/` (gitignored — regenerated every run):
- `msc-b2b.json` — connectivity rows, coverage, SNCF POS results, booking references, per-item status
- `msc-passes.json` — pass search results
- `api-searchability.json` / `msc-api-searchability.md` — API results, both environments
- `carrier-discovery.json` — output of the discovery tool

`run-history.jsonl` accumulates one line per `npm run sanity` run — this is what
`npm run weekly` reads. It's **local to your machine** (git-ignored, like the report
files) so everyone's run history stays their own and running the suite never creates
merge conflicts.

---

## Runtime (measured)

| Step | Time |
|---|---|
| Pre-flight connectivity | ~7s |
| SNCF Connect POS (3 ODs) | ~1m 51s |
| Build carts + booking references (23 items) | ~3m 37s |
| Pass searchability (4 destinations) | ~10s |
| API check (staging + production) | runs **in parallel** — adds nothing |
| **Total** | **~6 min** |

Previously ~8.5 min. The gain came from removing dead waiting, not from parallelism:
the POS check was calling `waitForLoadState('networkidle')`, which could never settle
because the page keeps a third-party request open for ~38s
(`kameleoon.io/engine.js`, `ERR_CONNECTION_RESET`). `blockNoise()` now aborts those
analytics/AB hosts at the browser-context level, which speeds up every page load.

### Why not more workers?

Only ~13s of the run is parallelisable (the connectivity read and the four pass
searches). The two checks that own ~98% of the time both mutate state everything else
depends on — the POS check changes the point of sale **account-wide**, and the booking
test owns the **single shared cart**. A run at Playwright's default worker count proved
the damage: `results.json` showed worker 0 switching POS at 06:41:10 while worker 1 was
searching at 06:41:12, and that run lost all 3 POS ODs and all 12 sectors.

Genuine parallelism needs a **second B2B account**, not a config change: sectors could
then be sharded across two accounts (each serial internally), taking the cart phase to
roughly 1m 50s and the whole run to about 3m 30s.

---

## Running where? (cloud vs. local)

This automation **runs locally** — it drives a real Chromium browser using your saved
login session, so it needs to run on a machine, not as a hosted cloud service. There is
no shared "cloud" version to log into; each person runs it in **their own terminal**
(or their own Claude Code / coding-assistant session) with **their own copy of this
folder** open as the working directory. To hand this to a teammate:

1. Get the code onto their machine (**git repo strongly recommended** — see below)
2. They do the one-time setup above (their own login, optionally their own Postman env)
3. They run the same `npm run sanity`

If you eventually want this running unattended on a schedule, that needs a machine that
stays on with a durable login — a separate, bigger conversation about session/credential
handling with your security team. Not required for day-to-day on-demand use.

---

## Sharing this with a teammate: git repo vs. a shared folder

**Use a private git repository.** It's safer and far less effort to keep updated:

| | Shared folder / zip | Git repo |
|---|---|---|
| Secrets excluded automatically | ❌ you must remember to delete `storageState.json` etc. every time | ✅ `.gitignore` handles it every time |
| Getting your latest fixes | ❌ re-zip and re-send | ✅ `git pull` |
| History / review | ❌ none | ✅ full history, diffs, PRs |

If a shared folder/zip is genuinely your only option, **always delete
`storageState.json`** (and any Postman JSON files) from the copy before sending it —
those are login credentials, not code.

`.gitignore` already excludes `node_modules/`, `storageState.json`, Postman
environment files, `report/`, `test-results/`, and one-off diagnostic scripts.

---

## Safety guardrails (built in, not optional)

- ✅ **Stops at Traveler Details** (status `Created`) — never fills traveler data, never
  clicks "Continue to Hold & Payment", so **nothing is ever submitted to a carrier**
- ✅ Never selects/changes a payment method, never touches billing fields, never pays
- ✅ Never uses agency allowance
- ✅ The API layer only searches — never books
- ✅ No booking reference is reported if any item in that order shows as expired
- ✅ Login credentials are never typed into, stored by, or logged by any script
- ✅ Connectivity issues are **flagged for manual review only** — nothing is auto-sent
  to Teams, email, or a ticketing system
- ✅ The SNCF Connect POS check is **search-only**, and always switches the POS back
  explicitly (navigating away does **not** reset it — it's an account-level setting)

---

## Project layout

```
playwright.config.js       projects: setup (login) / b2b / b2c · workers:1 (shared account) · stamps MSC_RUN_ID
data/journeys.js           19 sectors + 4 passes + SNCF POS ODs + coverage metadata (edit test data here)
lib/helpers.js             reusable flow steps: SEL selector map, search, carrier-specific add-to-cart,
                           pass add, POS switch, connectivity parse/flag, coverage guard, blockNoise
tests/auth.setup.js        one-time manual login -> storageState.json
tests/b2b-msc.spec.js      connectivity + coverage guard + SNCF POS + batched carts/booking references
tests/b2b-passes.spec.js   rail pass searchability (Eurail + Interrail + Swiss + BritRail)
tests/b2c-searchability.spec.js   B2C search checks (blocked by anti-bot; reports as such)
tools/discover-carriers.js read-only carrier↔route discovery (not part of `npm run sanity`)
api-searchability.js       read-only LocoHub API check, staging + production
run-sanity.js              orchestrates: browser suite ‖ API check -> deck refresh -> history log -> summary
print-summary.js           human-readable end-of-run summary (also runnable standalone)
log-run.js                 appends one summary line per run to run-history.jsonl
weekly-report.js           compiles run-history.jsonl into weekly-report.md
deck/gen.js                builds/refreshes Rail-Europe-MSC-Automation-Overview.pptx
check-login.js             quick standalone check of whether the saved login is still valid
report/                    JSON + HTML output (gitignored, regenerated every run)
```

## Fallback routes

Every carrier has **verified alternate routes**, tried in order when its primary route fails.
A sector is only reported as failed once **every** route for that carrier has failed — which is
the honest signal ("this carrier is not sellable anywhere we know to look") rather than "one
route happened to be empty today".

This matters because a single OD can be empty for reasons that say nothing about the carrier or
the search: a seasonal gap, a timetable change, engineering works that day. Before this,
one such route turned the whole run red — Zermatt→Chur did exactly that for weeks.

- **36 alternates across the 19 sectors**, plus fallbacks on all 3 SNCF POS routes
- Applied in the **booking test**, the **SNCF POS check** and the **API check**
- Every alternate OD was verified against the LocoHub production API before being added; the
  carrier names in the `data/journeys.js` comments are what the API actually returned

When a fallback is used it is stated, not hidden:

```
[sncf-pos] Zermatt->Chur was empty; fallback 1 Saint Moritz->Chur returned 3
[PASS] #2 Frankfurt -> Berlin   ·  via fallback (primary "Berlin -> Munich" NO RESULTS)
```

When every route fails, the report names **each route tried** and the last reason, so "one bad
route" is distinguishable from "carrier genuinely down".

Add an alternate by appending to the `ALTERNATES` map at the bottom of `data/journeys.js`,
keyed by journey id. Verify it returns products first — `node tools/discover-carriers.js`, or a
direct API search — rather than guessing.

## Environment inventory gaps (declared, not failures)

Staging carries **no Swiss domestic and no French regional inventory**. Verified with controls:
Zurich→Bern, Geneva→Zurich, Basel→Zurich, Chur→Tirano and Zermatt→Chur all return 0 products on
staging while Geneva→Paris (international) passes; Paris→Rouen and Lyon→Grenoble return 0 while
Paris→Bordeaux (TGV) returns 9. Production returns results for all of them.

Those ODs are marked `apiSkipEnvs: ['STAGING']` and reported as **SKIPPED with the reason**,
excluded from that environment's pass ratio. Production still tests them properly. This is a
data gap in the environment, not a search failure, and reporting it as red said nothing useful.

## Known limitations

- **Never run two instances at once** — see the warning at the top. One account, one cart,
  one POS.
- **Selectors can drift** if the portal's UI changes. All the fragile point-to-point
  selectors are centralised in the `SEL` map in `lib/helpers.js`; other tuning spots are
  marked `// TUNE:`. **Do not select on `id`** — the portal generates a fresh random `id`
  on every page load. `data-select` is the stable contract.
- **A flagged carrier's sector is still tested**, but a resulting failure is reported as
  `EXPECTED (carrier flagged)` rather than `ERROR`, so a genuine carrier outage doesn't
  read as a regression. Flagged carriers are also ordered last so they can't delay the
  healthy ones.
- **Three carriers have no confirmed route yet** (`ARENAWAYS`, `CAMPANIA EXPRESS`, `SJ`) —
  reported as *pending an OD* rather than quietly missing.
- **Cart item TTL:** items expire ~30 min after being added. The current run finishes well
  inside that, but a much larger item count could start bumping into it.
- **B2C UI** cannot be driven directly (anti-bot); covered via the Production API check.
