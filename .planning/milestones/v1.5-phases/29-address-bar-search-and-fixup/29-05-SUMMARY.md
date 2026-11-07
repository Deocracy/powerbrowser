---
phase: 29-address-bar-search-and-fixup
plan: 05
subsystem: chrome-bar address bar / PowerBrowserAPI search area / copy gate
status: complete
tags: [BAR-11, BAR-14, rows, favicons, combobox, brand-ban, live-check]
requires: [29-04]
provides:
  - "address-bar-rows.ts (no imports): Row, RowSource, composeRows, nextHighlight, iconFor, safeIcon, ENGINE_ROW_LIMIT 4, PLACE_ROW_LIMIT 5, ROW_LIMIT 10"
  - "scripts/verify-address-bar-rows.mjs plus registry quick rows address-bar-rows and address-bar-rows-self-test"
  - "placesFavicons store kind (read class) and ChromeStoreClient.placesFavicons(urls) -> Record<url, data:image/ URI>"
  - "SourcedRow (tab | bookmark | history) from the places suggestion service"
  - "Widget: heuristic row first and highlighted, rows composed only through composeVisibleRows(), highlight tracked by key, favicons merged under the query guards, combobox ARIA, 32px rows, 432px panel"
  - "CHROME_BAR_COPY.visit / searchWith / dropdownFooter / commitFailed / suggestionsFailed, pinned in EXPECTED_NAV_COPY"
  - "Brand ban: verify-shell-error-copy derives identity.display_name through resolveConfig and bans it from every chrome-bar .ts/.tsx/.css"
  - "Live scenarios rows and failure-rows; plant dedupe-off"
affects: [29-06, 29-07, 29-08, 29-09, 29-10, 30]
tech-stack:
  added: []
  patterns:
    - "A pure .ts module imported straight from its source by a Node gate (Node 24 type stripping), with mkdtemp mutation plants"
    - "Two parallel requests per query (resolve and Places), each re-checking the armed flag and sequence on arrival, recomposed through one method"
key-files:
  created:
    - theia/extensions/chrome-bar/src/browser/address-bar-rows.ts
    - scripts/verify-address-bar-rows.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-places-suggestions.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-address-bar-live.mjs
    - scripts/verify-platform.sh
decisions:
  - "Typing new text resets the rows and the highlight; the highlight then lands on the heuristic row when it arrives. A reply for the same text keeps the highlighted row by key"
  - "Failure and no-search sentences render as is-message rows that wrap (height auto, min 32px) instead of truncating on one 32px line"
  - "The caption truncates first through flex-shrink 1000 against the title's min-width 40%; the plan's flex: 0 1 auto would have shrunk both"
  - "A place row whose url equals the heuristic row's url is dropped, including an open-tab row for a typed address; 29-07's switch-to-tab must decide whether that tab row should win instead"
metrics:
  duration: 22m
  completed: 2026-10-21
  tasks: 3
  files: 13
commits: 3
plan_head_before: 069721d64db9ae77adff9fff6dbbd57ef5066bf9
plan_head_after: f65a1494be87c81092280c1b6ca3298393f0dab8
actuals:
  tokens: 21900
  tasks: 3
  commits: 3
---

# Phase 29 Plan 05: Result rows, Places favicons and the configured-name ban Summary

The address bar dropdown now shows rows shaped like Firefox's. Non-empty text gets a highlighted heuristic row first ("Search with {engine}" or "Visit"). Below it come open-tab, bookmark and history rows. Each is one 32px line with a 16px icon (a cached Places favicon as a `data:image/` URI, else a codicon) and a muted type marker. The row logic is a pure module that a Node script tests directly. Every chrome-bar message that names the product now reads the configured application name, and a derived brand ban fails the copy gate on any literal.

## What was built

- **Rows module** (`address-bar-rows.ts`, no imports):
  - `composeRows`: the heuristic row, then up to 4 engine rows, then up to 5 place rows, deduplicated by url (an open tab wins; the heuristic's own url is dropped), 10 at most.
  - `nextHighlight`: moves by key and wraps; an unknown key steps from the first row.
  - `iconFor`: follows the 29-UI-SPEC icon table.
  - `safeIcon`: keeps only a `data:image/` string of at most 65536 characters.
- **Node test** `verify-address-bar-rows.mjs`: 11 named cases. Its `--self-test` plants four faults in mkdtemp copies (ROW_LIMIT 11, tab-wins inverted, wrap removed, safeIcon accepting http), and each goes red naming its case. The test was run against an empty stub first (RED: "exports: ... broken instrument"), then against the module (GREEN).
- **Boundary**: `placesFavicons(urls)` in the search area.
  - A non-array is refused (`placesFavicons: refusing a malformed url list`).
  - At most 10 entries are read, each an http(s) string of at most 8192 characters.
  - Icons come only from `PlacesUtils.favicons.getFaviconForPage(uri, 16)`, and only a bounded `data:image/` URI crosses back.
  - Wiring: one STORE_REQUEST_KINDS member, one case arm, a catalogue row at the end of Touchpoints, rule 12 class `read`, and the client method `placesFavicons`.
- **Places service**: rows carry `source`: `tab`, `bookmark` (when `PlaceMatch.bookmarked`) or `history`.
- **Widget**:
  - `runQuery` runs `resolveTypedAddress` and `searchByPrefix(prefix, PLACE_ROW_LIMIT)` in parallel. Each reply re-checks `dropdownArmed` and the sequence, then rebuilds through `composeVisibleRows()`.
  - The highlight is kept by key, else it moves to the heuristic row.
  - Open-tab rows are kept only while a live `WebTabWidget` shows that url.
  - Favicons are requested for row urls not yet cached, under the same guards.
  - Empty text closes the dropdown.
  - Enter on the heuristic row (or before any row arrives) runs a fresh `commitText`. Enter on another row runs `commitRow(row)` through `row.url`.
  - Arrow keys use `nextHighlight`.
  - The input carries `role='combobox'`, `aria-expanded`, `aria-controls='pb-chrome-bar-dropdown'`, `aria-autocomplete='both'` and `aria-activedescendant`.
- **CSS**: single-line 32px rows with an 8px gap, 16×16 icon and type slots in `--color-text-muted`, and a title with `min-width: 40%`. The panel's `max-height` is 432px, and `renderDropdown` narrows it to `min(432, innerHeight - top - 8)`.
- **Copy**: `visit`, `searchWith`, `dropdownFooter`, `commitFailed(subject)` and `suggestionsFailed(subject)` were added, all pinned. The old empty state ("No suggestions" plus its caption), the old footer and the two product literals were removed from the widget and from `EXPECTED_WIDGET_COPY`.
- **Brand ban**: `NAV_BRAND_LITERAL` is now `resolveConfig().config.identity.display_name`.
  - An empty value is a broken-instrument failure.
  - `checkChromeBarBrand` scans every `.ts`, `.tsx` and `.css` under `theia/extensions/chrome-bar/src` with comments blanked (line numbers kept), and names file and line.
  - Two new plants: the name in a widget JSX text node, and the name in a `chrome-bar-copy.ts` string. The existing `noAppName` plant now uses the derived name.
- **Live checks**:
  - Scenario `rows`: seeds a history visit with a favicon, a bookmark and an open web tab, then asserts everything the plan lists. The late-reply part runs `runQuery('Row')` again with chrome's resolve held back 800 ms, after ArrowDown.
  - Scenario `failure-rows`: a rejected resolve gives a first row that starts with the configured application name. After the stub is restored, Enter sends a GET to `/one/search` with q `Row`.
  - Plant `dedupe-off`.

## Verification (all run this session)

- **Rows module**: `verify-address-bar-rows` PASS (11 cases) and `--self-test` PASS (4 plants red). `tsc --noEmit -p theia/extensions/chrome-bar` reported no errors.
- **Boundary**: after the boundary edit, `verify-ng-040-internals-catalogue-lines` PASS and `check-internals-boundary.sh --catalogue` PASS; `check-internals-boundary.sh` PASS.
- **Static gates**:
  - `verify-web-tab-bridge` PASS, and its `--self-test` PASS (20 plants).
  - `verify-chrome-bar-suggestions` PASS, and its `--self-test` PASS.
  - `verify-shell-error-copy` PASS. Its `--self-test` PASS: 15 shell plants and 11 modes-copy plants, including the two new brand plants.
  - `scan-brand-residue` PASS.
- **Theia build**: `yarn build` passed with 0 errors, after Task 2 and after Task 3.
- **Live checks**:
  - `node scripts/verify-address-bar-live.mjs --scenario search,rows`: `search: PASS`, `rows: PASS`.
  - Full run: token-cookie, search, refused, no-engine, dev-addresses, default-engine, rows and failure-rows all PASS.
  - `node scripts/verify-address-bar-live.mjs --self-test`: PASS. The clean control is green and all 4 plants went red: resolve-bypassed, engine-name-dropped, token-strip-off, and dedupe-off, which named "two rows for one url: [.../r-tab]".
  - `node scripts/verify-web-tab-live.mjs`: PASS, after Task 2 and after Task 3.
- **Quick gate**: `scripts/verify-platform.sh --quick` PASS after each task.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ng-040 `--fix` swapped the two savePageCopy `IOUtils.remove` rows and put the `searchLazy` getter row one line early, again**
- **Found during:** Task 2, the boundary edit (the carry-over named this risk).
- **Fix:** The numbers were set by hand. The persist-failure cleanup (`dir`) is 4069, the replaced copy (`previous`) is 4065, and `defineESModuleGetters` is 4304. ng-040 PASS.
- **Commit:** dad93cc

**2. [Rule 1 - Bug] The plan's caption rule would not make the caption truncate first**
- **Issue:** `flex: 0 1 auto` on the caption and `flex: 1 1 auto` on the title shrink both, in proportion to their content width.
- **Fix:** The caption is `flex: 0 1000 auto; min-width: 0`, and the title keeps `flex: 1 1 auto; min-width: 40%`.
- **Commit:** dad93cc

**3. [Rule 2 - Missing functionality] Message rows wrap**
- **Issue:** The commit-failure, no-search and suggestions-failure sentences are longer than a pill on one 32px line, so they would have been cut off.
- **Fix:** A modifier class `is-message` (height auto, min 32px, 4px vertical padding, title `white-space: normal`). The rows scenario's 32px assertion covers the result rows only.
- **Commit:** dad93cc

**4. [Rule 3 - Blocking] The rows scenario retypes `Row` until the tab store has the open tab's row**
- **Issue:** The open tab reaches `tabs.sqlite` a moment after its load. React also ignores an input event that leaves the value unchanged.
- **Fix:** The scenario clears the pill, then types again, for up to 20 s.
- **Commit:** dad93cc

### Notes

- Acceptance check `grep -n "address-bar-rows|" scripts/verify-platform.sh` prints one line, not two. The self-test row follows the registry's naming convention, `address-bar-rows-self-test|`, so it does not contain that substring. Both rows exist and both run under `--quick`.
- The footer reads "Enter opens · Alt+Enter opens in a new tab · Esc closes suggestions" as the plan specifies, but Alt+Enter lands in 29-07. Until then the footer names a gesture that does nothing.
- Engine rows are passed as `[]` to `composeRows`. This is intentional: 29-06 adds engine suggestions through `composeVisibleRows()`.
- Requirements: BAR-14 is complete. BAR-11 stays Pending in REQUIREMENTS.md: this plan delivers its rows-and-icons half, and 29-10 owns the rest (first click selects the whole address, IME composition never commits early). `requirements.mark-complete` had ticked it, and that was reverted by hand.

## Pending manual check (for Chris's end-of-milestone checks)

- Run the sidecar with a different configured `applicationName` and look at the failure rows: they must show that name (29-VALIDATION "Manual-Only"). The automated half passed: the brand ban derives the name from `configuration.toml`, and `failure-rows` reads the page realm's configured name.
- The rows were checked through the DOM (classes, `src`, heights, computed max-height), not looked at in a screenshot.

## Known Stubs

None that block the plan's goal. `composeRows(heuristic, [], placeRows)` leaves the engine-row slot empty on purpose; 29-06 fills it.

## Threat Flags

None beyond the plan's register.
- T-29-18: titles and captions are React text nodes.
- T-29-19: favicons come from the Places cache only, as size-capped `data:image/` strings, and pass through `safeIcon` again in the frame. The rows scenario fails on any `<img>` that does not use a `data:image/` src.
- T-29-20: the input is an array, at most 10 entries, each an http(s) string capped at 8192 characters.
- T-29-21: the derived brand ban, with plants.

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/address-bar-rows.ts
- FOUND: scripts/verify-address-bar-rows.mjs
- FOUND: 4b78e90 (Task 1), dad93cc (Task 2), f65a149 (Task 3), all ancestors of HEAD
