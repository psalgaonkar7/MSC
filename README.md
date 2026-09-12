# Rail Europe — MSC Automation (Playwright)

Deterministic, repeatable **Manual Sanity Check** for Rail Europe **B2B**.
Replaces "an AI clicking the live browser" (~28 min, non-deterministic) with a real
test suite that covers **every carrier on the connectivity page** in **~5.5 minutes**,
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
| 3 | **19 point-to-point sectors + 3 rail passes** | Built into shared carts, proceeding to Traveler Details to capture a booking reference per order (status **Created**), asserting no item is expired. Stops there — no traveler data, no Hold & Payment, no payment |
| 4 | **SNCF Connect key-account POS** | Switches POS, runs **search-only** validation for 3 ODs, then explicitly switches back |
| 5 | **Rail passes searchability** | Confirms the Interrail Global Pass ("Europe"), Swiss Travel Pass ("Switzerland") and BritRail ("United Kingdom") return real products |
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
"Intercity"), and deciding which operator a brand belongs to is a human call — that is
**discovery**, for a carrier we have no route for yet.

Do not confuse that with **verification** of a carrier we already know (see
[Fallback routes](#fallback-routes)). There the brand is exactly the right thing to match
on, because we already know which brands belong to that operator. Discovery asks "whose
train is this?"; verification asks "is *our* carrier's brand in these results?".

---

## The 15-item order cap

The B2B portal **caps an order at 15 items** — the 16th add-to-cart is answered with
*"You have reached the maximum number of items in your order, please proceed to …"*.

Full coverage needs 22 items (19 sectors + 3 passes), so the run builds **multiple orders**
and captures **a booking reference for each**:

| Order | Contents | Items |
|---|---|---|
| 1 | 3 passes + first 12 sectors | 15 |
| 2 | remaining sectors | 7 |

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
npm run sanity   # EVERYTHING: connectivity + coverage guard + SNCF POS + 19 sectors + 3 passes + API + deck + log
npm run booking  # JUST the cart/booking references (fastest path to a K-number)
npm run msc      # connectivity + SNCF POS + booking references (no API, no deck)
npm run passes   # rail pass searchability only (Interrail + Swiss + BritRail)
npm run api      # read-only API searchability, staging + production
npm run deck     # rebuild the manager PowerPoint from the latest report (close the .pptx first if open)
npm run weekly   # compile run-history.jsonl into weekly-report.md
npm run report   # open the Playwright HTML report
npm run auth     # re-do the login capture when your session expires
npm run verify-routes   # check every route in data/journeys.js is typeable in the portal
node check-login.js     # ~10s: is the saved session still valid? run this BEFORE a long run
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

Measured on the 2026-09-12 22:00 run (19/19 sectors, 2 booking references, 0 expired):

| Step | Time |
|---|---|
| Pre-flight connectivity | ~14s |
| SNCF Connect POS (3 ODs) | ~1m 33s |
| Build carts + booking references (22 items) | ~3m 16s |
| Pass searchability (3 destinations) | ~16s |
| API check (staging + production) | runs **in parallel** — adds nothing |
| **Total** | **~5m 30s** |

Deepening the fallback chains from 55 to 101 routes cost nothing: alternates are only
tried when a primary fails, and on this run every primary worked.

Two separate things got us here from ~8.5 min:

1. **Removing dead waiting, not adding parallelism.** The POS check was calling
   `waitForLoadState('networkidle')`, which could never settle because the page keeps a
   third-party request open for ~38s (`kameleoon.io/engine.js`, `ERR_CONNECTION_RESET`).
   `blockNoise()` now aborts those analytics/AB hosts at the browser-context level,
   which speeds up every page load.
2. **Fixing a failure cascade in the cart build.** `addNewProducts()` returns to the
   search form via the cart page's ADD NEW PRODUCTS link — but a failed sector left the
   browser on a *results* page, where that link does not exist, so every later item in
   the same order waited the full 20s for a link that could never appear. One dead route
   took 7 sectors down with it on 2026-09-10 and burnt ~6 min of an 8.3 min run. It now
   navigates back to the cart first, and falls back to `/home`. Cart build: **196s vs 500s**.

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

**This repo:** `https://github.com/psalgaonkar7/MSC.git` (private). It was previously named
`.../Local.git`; GitHub still redirects that name, but update any old remote with
`git remote set-url origin https://github.com/psalgaonkar7/MSC.git`.
For access, contact Pratikesh Salgaonkar.

If a shared folder/zip is genuinely your only option, **always delete
`storageState.json`** (and any Postman JSON files) from the copy before sending it —
those are login credentials, not code.

`.gitignore` already excludes `node_modules/`, `storageState.json`, Postman
environment files, `report/`, `test-results/`, and one-off diagnostic scripts.

---

## Troubleshooting

### "Everything timed out" — check the login FIRST

**By far the most common failure**, and it does not look like a login problem. An expired
session produces *opaque timeouts across every test* — pre-flight waiting 30s for the
connectivity heading, the POS check burning 5 minutes, every pass failing on
`locator.click: Timeout 20000ms exceeded`. The browser is actually sitting on:

> ⚠ *You tried to access a page that requires authentication, please sign in.*

The tell is the **shape**: everything fails, including the very first check, and each
failure is a plain timeout with no portal error text. A real carrier or portal problem
fails *selectively* — some sectors pass, some do not.

Ten seconds of checking beats ten minutes of a doomed run:

```bash
node check-login.js
# LOGIN: VALID (logged in)          -> good, run the sanity
# LOGIN: EXPIRED (needs npm run auth)
```

Fix by re-capturing your own session — this opens a real browser and **you** sign in;
no script ever types or stores your password:

```bash
npm run auth
```

`storageState.json` lasts roughly a few hours of inactivity, so an overnight gap almost
always means re-authenticating. Do **not** run `npm run auth` while a sanity run is going
— they share the account.

### Killing a stuck run

Closing the terminal or killing the wrapper does **not** stop the Playwright children —
they orphan and keep driving the shared account, which will corrupt the next run. Kill the
whole tree:

```powershell
$all = Get-CimInstance Win32_Process
$procs = $all | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'run-sanity|playwright' }
function Get-Tree($id) { foreach ($k in ($all | Where-Object { $_.ParentProcessId -eq $id })) { Get-Tree $k.ProcessId }; $id }
$ids = $procs | ForEach-Object { Get-Tree $_.ProcessId } | Select-Object -Unique
$ids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
```

Then confirm nothing survived before starting again:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'run-sanity|playwright' }
```

### A sector reports ERROR

Read the error text — it names **every route tried** and the last reason, because a sector
is only failed once all 3–6 of its routes have failed. `NO RESULTS` on every route means
the carrier is genuinely not sellable anywhere we look; a mix usually means something
transient. Check whether the carrier is already on the connectivity flag list first — a
flagged carrier is reported as `EXPECTED (carrier flagged)`, not a regression.

### A pass reports ERROR but the others pass

Check the portal's own banner in the failure screenshot under `test-results/`. When it
reads *"Results are incomplete due to missing products"* and names product codes, the
product is not being offered — that is a platform-side matter, not an automation fault.

**Establish whether the product still exists before treating it as an outage.** That
banner is the Partial Offers feature (OVS-19296) reporting what it could not retrieve; it
says nothing about *why*. A retired brand and a broken supplier look identical through it.

The Eurail Global Pass is the worked example. It vanished on 2026-09-10 and failed six
consecutive runs. Nothing was erroring — every call returned 200, and no monitor fired.
What the APM traces showed was a clean handover: calls to
`/distribution/api/{}/eurail/product-projections/search` stopped and
`.../interrail/...` started, crossing over in the hour after `era-offers-passes` 1.642.0
reached production. It was not POS-scoped either — a US point of sale, where Eurail is
precisely the correct product, saw the same absence. **The Eurail brand had been retired
and replaced by Interrail**, confirmed by the release owner. The fix was to change our
expectation, not to chase a bug.

Two things worth stealing from that:

- **A supplier disappearing with no errors anywhere is a strong hint of an intended
  change**, not an incident. Check APM for a handover to a sibling endpoint before
  escalating.
- **Testing a second POS is cheap and decisive.** Identical results across an EU and a
  non-EU POS rules out the whole class of publication/residency and cache-keying defects
  in one run.

### After editing `data/journeys.js`

Always run both gates, or a broken route will sit there silently failing:

```bash
npm run verify-routes                 # portal autocomplete + right country
LH_ONLY=production npm run api        # the ODs still return products
```

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
data/journeys.js           19 sectors + 3 passes + SNCF POS ODs + coverage metadata (edit test data here)
lib/helpers.js             reusable flow steps: SEL selector map, search, carrier-specific add-to-cart,
                           pass add, POS switch, connectivity parse/flag, coverage guard, blockNoise
tests/auth.setup.js        one-time manual login -> storageState.json
tests/b2b-msc.spec.js      connectivity + coverage guard + SNCF POS + batched carts/booking references
tests/b2b-passes.spec.js   rail pass searchability (Interrail + Swiss + BritRail)
tests/b2c-searchability.spec.js   B2C search checks (blocked by anti-bot; reports as such)
tools/discover-carriers.js     read-only carrier↔route discovery (not part of `npm run sanity`)
tools/verify-station-labels.js read-only check that every route in data/journeys.js can be
                               typed into the portal autocomplete AND lands in the right
                               country — `npm run verify-routes`
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

- **101 routes across the 19 sectors** — every carrier has between 3 and 6, plus fallbacks on
  all 3 SNCF POS routes. Try-order per carrier is `primary → ALTERNATES → VERIFIED_EXTRA`.
- Applied in the **booking test**, the **SNCF POS check** and the **API check**
- Nothing here is guessed. Each OD had to clear **two independent gates**:

| Gate | Tool | What it proves |
|---|---|---|
| 1. The OD actually sells that carrier | LocoHub production `POST /searches` | the response carries the carrier's own **brand** (`search_connection.transport_name`) |
| 2. The OD can actually be typed into the portal | `node tools/verify-station-labels.js` | the `opt` label matches a real autocomplete option **in the right country** |

### Why brand, not provider

`search_connection.attributes.carrier` is **null** on most responses — do not use it.
`provider` names the *aggregator*, not the carrier: SNCF sells through `PAO`, RDG through
`Atomised`, Trenitalia through `PICO`, and RegioJet **and** Leo Express both through
`Distribusion`. Only `transport_name` (the brand: `Frecciarossa`, `Italo`, `Avanti West Coast`,
`OUIGO ESP`, `Lyria`, `TGV INOUI`) identifies the carrier — and it is the same identity the
browser matches via `data-select="ptp-carrier-logo-<slug>"`.

### Why gate 2 exists

The autocomplete matches `opt` as a **substring**, so a label can match confidently and still
select the wrong place. Real examples this caught, all of which had passed gate 1:

- `Brugge` → **Brugge (Westf), *Germany*** (not Bruges, Belgium)
- `Linz` → **Linz (Rhein), *Germany*** (not Linz Hbf, Austria)
- `Milano` → Milano Nord Cadorna (a suburban station, not Milano Centrale)
- `Innsbruck` → Innsbruck Hotting; `Brno` → Brno-Zidenice
- accents never match at all: `Malaga` ≠ `Málaga-María Zambrano`

Run `node tools/verify-station-labels.js` after **any** edit to `data/journeys.js`. It is
read-only — it never searches, adds to a cart or books — and it prints the exact fix line for
anything wrong.

When a fallback is used it is stated, not hidden:

```
[sncf-pos] Zermatt->Chur was empty; fallback 1 Saint Moritz->Chur returned 3
[booking] RDG: primary route failed, succeeded on fallback 1 (London->Manchester)
```

When every route fails, the report names **each route tried** and the last reason, so "one bad
route" is distinguishable from "carrier genuinely down".

### Deliberately absent

Rejected by the gates above — re-test before ever adding, don't reinstate on a hunch:

| Route | Why |
|---|---|
| #3 Paris→Strasbourg | domestic TGV INOUI only, no DB leg — not an Alleo route |
| #11 St Moritz→Zermatt, Chur→Zermatt | 0 products (Glacier Express is not sold this way) |
| #13 Wien→Bratislava | ÖBB Regional Express only, no RegioJet |
| #16 EUROPEAN SLEEPER extras | Amsterdam→Prague/→Dresden and Bruxelles→Dresden all return DBahn **day** trains, never the sleeper. Still on 3 routes; no verified 4th yet. |
| #17 Prague→Kosice | RegioJet only, no Leo Express |
| CAMPANIA EXPRESS | Naples→Sorrento and Porta Nolana→Sorrento return 0 products; Naples→Pompei is Trenitalia. Stays in `pendingDiscovery`. |

`ARENAWAYS` and `SJ` have **no searchable stations at all** in the production catalogue
(`GET /stations`), which is why discovery keeps coming up empty — it is not a search bug.

To add an alternate: append to `VERIFIED_EXTRA` at the bottom of `data/journeys.js`, keyed by
journey id, then run both gates.

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
