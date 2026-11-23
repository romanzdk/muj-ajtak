# Můj ajťák — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Static web where people (mainly seniors) find an IT helper near them in a list sorted by distance and on a map; helpers join via a GitHub issue form that a GitHub Action turns into a PR for manual approval.

**Architecture:** One static page on GitHub Pages (no build step). Pure logic lives in `lib.js` (ES module, tested with `node --test`), DOM wiring in `app.js`. Listings are `data.json`. A workflow on new issues runs `scripts/issue-to-entry.mjs`, which parses the issue form, geocodes the city (Nominatim), checks IČO in ARES and opens a PR that edits `data.json`.

**Tech Stack:** HTML/CSS/vanilla JS, Leaflet 1.9.4 (cdnjs), OpenStreetMap tiles, Nominatim, ARES REST, Node 22 (`node:test`, global `fetch`), GitHub Actions, `gh` CLI.

**Spec:** `docs/2026-11-23-ajtaci-mapa-design.md`

## Global Constraints

- All UI text in Czech. Base font ≥ 20px, buttons ≥ 48px high, contrast WCAG AA, no popups/modals.
- List above the map. Phone shown as `tel:` link.
- Public data: city / city part + its coordinates only, never street address.
- Contact e-mail `<kontaktni-email>` must never appear as plain text in any committed file: store it split into parts in `mail.js` and build the `mailto:` only on click. Used for: adding without GitHub, removal, and the per-record "Nahlásit problém" link (mailto with subject `Nahlášení: <name>`, because seniors have no GitHub).
- Nominatim: only on user click, `countrycodes=cz`, ≤ 1 request/s; Action sends a `User-Agent` naming the repo URL.
- No npm dependencies. Tests: `node --test tests/`.
- All user-provided strings rendered via `textContent` / escaped (never `innerHTML` with data).
- Repo `romanzdk/muj-ajtak`, public; Pages from `main` root. Before first commit: `git config user.email <kontaktni-email>` and `git config user.name "Roman Žydyk"`; check `git log --format='%ae %ce'` before push.

## Review Focus

1. User denies or lacks geolocation → clear Czech message pointing to the city/PSČ field, no dead end. (Task 3 manual check)
2. City/PSČ not found → message "Místo jsme nenašli, zkuste jiné město nebo PSČ." (Task 3 manual check; `geocodeQueryUrl` test in Task 1)
3. No helper close by → still list all, nearest first, with distance (Task 1 `sortByDistance` test, no radius cut-off).
4. ARES down or IČO invalid → PR still created, without badge, with a note in the PR body (Task 4 test).
5. Malicious/odd input in issue (HTML tags, empty optional fields, phone with spaces/+420) → stored as plain text, phone normalized, empty optionals omitted (Task 4 tests); rendered with `textContent` (Task 3).

---

### Task 1: Pure logic (`lib.js`)

**Files:** Create `lib.js`, `tests/lib.test.mjs`, `package.json` (`{"type":"module","scripts":{"test":"node --test tests/"}}`)

**Interfaces — Produces:**
- `distanceKm(a: {lat,lon}, b: {lat,lon}) -> number` (haversine, R = 6371)
- `sortByDistance(helpers: Helper[], origin: {lat,lon}) -> (Helper & {distanceKm})[]` — all items, ascending, input not mutated
- `filterByServices(helpers, services: string[]) -> Helper[]` — empty `services` = all; otherwise helper has ANY of them
- `SERVICES = {pocitac:"Počítač", telefon:"Telefon a tablet", internet:"Internet a Wi-Fi", tiskarna:"Tiskárna", ostatni:"Ostatní"}`
- `formatDistance(km) -> string` — `< 1` → `"méně než 1 km"`, else one decimal with comma + `" km"` (`2.34` → `"2,3 km"`)
- `geocodeQueryUrl(q: string) -> string` — Nominatim search URL with `format=jsonv2&countrycodes=cz&limit=1&q=<encoded>`
- `Helper = {id, name, city, lat, lon, phone?, email?, web?, services: string[], visits: boolean, note?, icoVerified?: boolean}`

- [ ] **Step 1: Write failing tests** — `distanceKm(Praha{50.0755,14.4378}, Brno{49.1951,16.6068})` ≈ 185 km (±2); `sortByDistance` returns all 3 sample helpers in order near→far incl. one 300 km away; `filterByServices(h, [])` returns all, `["tiskarna"]` returns only matching; `formatDistance(0.4)==="méně než 1 km"`, `formatDistance(2.34)==="2,3 km"`; `geocodeQueryUrl("Brno Líšeň")` contains `countrycodes=cz` and `q=Brno%20L%C3%AD%C5%A1e%C5%88`.
- [ ] **Step 2:** `npm test` → FAIL (module not found).
- [ ] **Step 3:** Implement the functions above in `lib.js`.
- [ ] **Step 4:** `npm test` → all PASS.
- [ ] **Step 5:** `git init`, set git identity (Global Constraints), commit `feat: core search logic`.

### Task 2: Data + page skeleton

**Files:** Create `data.json` (3 clearly fake sample helpers marked `"name": "Ukázka – …"` in Praha, Brno, Ostrava), `index.html`, `style.css`, `ochrana-udaju.html` (short GDPR page: what is published, why, how to be removed via e-mail/issue).

**Interfaces — Produces:** element ids used by Task 3: `#btn-locate`, `#place-form`, `#place-input`, `#services` (checkboxes `name="service" value=<SERVICES key>`), `#status` (`aria-live="polite"`), `#results` (`<ol>`), `#map`.

- [ ] **Step 1:** `index.html`: heading "Najděte ajťáka ve svém okolí", big button "📍 Najít v mém okolí", form "Nebo napište město nebo PSČ" + "Hledat", service checkboxes, `#status`, `#results`, `#map` (height 400px), footer with "Přidat se" (link to issue form `…/issues/new?template=pridat-se.yml`), "Nemáte GitHub? Napište nám e-mail" (button, mailto built in JS), link to `ochrana-udaju.html`. Load Leaflet 1.9.4 CSS/JS from cdnjs, `app.js` as module.
- [ ] **Step 2:** `style.css` per Global Constraints (single column, max-width 720px, 16px side padding).
- [ ] **Step 3:** Verify: `python3 -m http.server` and open page → layout renders at 375px width without horizontal scroll.
- [ ] **Step 4:** Commit `feat: page skeleton and sample data`.

### Task 3: UI wiring (`app.js`)

**Files:** Create `app.js`

**Interfaces — Consumes:** everything from Task 1 and element ids from Task 2.

- [ ] **Step 1:** On load fetch `data.json`, render all helpers (alphabetical, no distance) + all markers; map fits bounds of markers.
- [ ] **Step 2:** `#btn-locate` → `navigator.geolocation.getCurrentPosition`; success → `sortByDistance`, re-render, map centers on user (zoom 11) with "Vy jste zde" marker; error/unsupported → `#status` "Polohu se nepodařilo zjistit. Napište prosím své město nebo PSČ do pole níže." and focus `#place-input`.
- [ ] **Step 3:** `#place-form` submit → fetch `geocodeQueryUrl`; empty result → `#status` "Místo jsme nenašli, zkuste jiné město nebo PSČ."; else same as located. Disable button while loading.
- [ ] **Step 4:** Service checkbox change → `filterByServices` on current list, re-render.
- [ ] **Step 5:** Each list item (built with `textContent` only): name, `formatDistance` if known + city, service labels, "Přijede i domů" if `visits`, phone as big `tel:` link, e-mail/web if present, badge "✔ Ověřené IČO" if `icoVerified`, note, small link "Nahlásit problém" (mailto built on click, see Global Constraints). Clicking an item pans map to its marker; marker popup shows name + phone.
- [ ] **Step 6:** Manual check of Review Focus 1–3 in browser (deny location; search "xyzxyz"; search "Aš" → all 3 listed with distances). Then commit `feat: search, location and map`.

### Task 4: Join flow (issue form → PR)

**Files:** Create `.github/ISSUE_TEMPLATE/pridat-se.yml`, `.github/ISSUE_TEMPLATE/config.yml` (`blank_issues_enabled: true`), `scripts/issue-to-entry.mjs`, `tests/issue.test.mjs`, `.github/workflows/pridat-se.yml`

**Interfaces — Produces:**
- `parseIssueBody(body: string) -> {name, city, phone?, email?, web?, services: string[], visits: boolean, note?, ico?, consent: boolean}` — GitHub issue-form markdown (`### <label>\n\n<value>`; `_No response_` = empty; checkboxes `- [X] …`)
- `normalizePhone(s) -> string` — strip spaces, keep leading `+`, `"777 123 456"` → `"777123456"`, `"+420 777 123 456"` → `"+420777123456"`
- `checkIco(ico, fetchFn = fetch) -> Promise<{ok: boolean, name?: string, reason?: string}>` — GET `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}`; ok when 200 and no `datumZaniku`; 8-digit check first; network error → `{ok:false, reason:"ARES nedostupný"}`
- `toHelper(parsed, geo: {lat,lon}, ico: {ok}) -> Helper` with `id = "gh-<issueNumber>"`
- CLI: `node scripts/issue-to-entry.mjs <issueNumber>` reads `ISSUE_BODY` env, updates `data.json`, writes PR body to `pr-body.md` (includes ARES name or reason, geocoded place name for the approver).

Issue form fields (labels exactly): `Jméno nebo název firmy` (required), `Město nebo část města` (required), `Telefon`, `E-mail`, `Web`, `S čím pomáháte` (checkboxes = SERVICES labels), `Přijedete i domů?` (dropdown Ano/Ne), `Krátká poznámka`, `IČO (nepovinné)`, `Souhlas` (required checkbox "Souhlasím se zveřejněním těchto údajů na webu").

- [ ] **Step 1: Failing tests** — `parseIssueBody(fixture)` returns expected object (fixture: optional fields `_No response_`, name `"<b>Pepa</b>"` kept as literal string, two services checked); `normalizePhone` cases above; `checkIco("123")` → `{ok:false}` without calling fetch; `checkIco` with fake fetch returning `{obchodniJmeno:"X s.r.o."}` → `{ok:true,name:"X s.r.o."}`; with `datumZaniku` → `ok:false`; fake fetch throwing → `{ok:false, reason:"ARES nedostupný"}`; `toHelper` omits empty optionals.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement; geocoding in CLI uses Nominatim with `User-Agent: muj-ajtak (https://github.com/romanzdk/muj-ajtak)`; geocode failure → exit non-zero and comment on the issue "Město se nepodařilo najít, upravte prosím issue." (handled in workflow).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Workflow `pridat-se.yml`: `on: issues: [opened, edited]`, only if issue body contains `### Souhlas`; permissions `contents: write, pull-requests: write, issues: write`; steps: checkout, setup-node 22, run CLI with `ISSUE_BODY: ${{ github.event.issue.body }}` passed via env (never inlined in script), `gh pr create` on branch `pridat-se/<n>` (force-push on edit) with `--body-file pr-body.md` and `Closes #<n>`. Requires repo setting "Allow GitHub Actions to create pull requests".
- [ ] **Step 6:** Commit `feat: join via issue form`.

### Task 5: Publish

- [ ] **Step 1:** `gh repo create romanzdk/muj-ajtak --public --source . --push` (after checking commit e-mails).
- [ ] **Step 2:** Enable Pages from `main` / root (`gh api -X POST repos/romanzdk/muj-ajtak/pages -f 'source[branch]=main' -f 'source[path]=/'`) and allow Actions to create PRs (`gh api -X PUT repos/romanzdk/muj-ajtak/actions/permissions/workflow -f default_workflow_permissions=write -F can_approve_pull_request_reviews=true`).
- [ ] **Step 3:** End-to-end: open a test issue via the form with IČO `27074358` → PR appears with ARES name "Asseco Central Europe, a.s." and correct coordinates; close PR + issue without merging.
- [ ] **Step 4:** Open `https://romanzdk.github.io/muj-ajtak/` → page works, location + city search work.
- [ ] **Step 5:** `README.md` (what it is, how to approve a PR, how to add someone manually by editing `data.json`), commit, push.
