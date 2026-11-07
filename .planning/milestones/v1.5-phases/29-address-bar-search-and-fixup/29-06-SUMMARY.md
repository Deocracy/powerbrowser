---
phase: 29-address-bar-search-and-fixup
plan: 06
subsystem: chrome-bar address bar / PowerBrowserAPI search area / live address-bar check
status: complete
tags: [BAR-03, BAR-05, suggestions, one-off, network-kind, live-check]
requires: [29-05]
provides:
  - "searchSuggestions store kind (rule 12 class network, not relayed) over one SearchSuggestionController per Theia frame; chrome re-resolves and fetches only for kind search"
  - "ChromeStoreClient.searchSuggestions(text, engineName) -> string[]"
  - "browser.searchSuggestions (boolean, default true, User scope) and CHROME_BAR_COPY.searchSuggestionsDescription"
  - "Engine rows (source search, key 'search:<value>', caption Search with {engine}) composed below the heuristic row; Enter or click commits the suggestion text through commitText"
  - "One-off strip: CHROME_BAR_COPY.oneOffLabel, runOneOff(name, 'current' | 'background'), highlightKeys() = row keys + 'oneoff:<name>'"
  - "Harness: json pages return 500 when their value is undefined; live scenarios suggestions and one-off; plants setting-ignored and oneoff-default"
affects: [29-07, 29-08, 29-09, 29-10]
tech-stack:
  added: []
  patterns:
    - "A network store kind re-applies the resolve wall chrome-side, so the frame's own gate is a second fence rather than the only one"
    - "Live expectation derived from chrome's engine list and compared in order, rather than a hand-kept button count"
key-files:
  created: []
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-address-bar-live.mjs
    - scripts/lib/pb-live-probe.mjs
decisions:
  - "searchSuggestions drops a remote value longer than 512 characters instead of truncating it, so a committed suggestion is always the engine's full text"
  - "The one-off live scenario derives the expected buttons from chrome's engine list (every engine but the one in use, in order). The harness profile lists Gecko's app engines too, so the plan's exactly-one-button assertion could not hold there"
  - "A background one-off with no tab to open after searches in place (openCommittedUrl), because openInBackground needs a reference widget"
  - "IME composition: onInputChange skips the query while isComposing, and fetchEngineRows refuses while composing. 29-10 adds the composition-end query"
metrics:
  duration: 35m
  completed: 2026-10-21
  tasks: 2
  files: 11
commits: 2
plan_head_before: 7c498542dc642727a2bed9fc5ceed05c83344395
plan_head_after: 92c4edcc7e69e0959794d2a220afd9bd9c560fda
actuals:
  tokens: 15600
  tasks: 2
  commits: 2
---

# Phase 29 Plan 06: Engine suggestions and the one-off engine strip Summary

While the user types search-shaped text, the address bar now shows up to 4 suggestions from the engine in use. Chrome fetches them anonymously through Gecko's SearchSuggestionController. Chrome re-resolves the text first and refuses to fetch for anything that resolves as an address. A User-scope setting turns suggestions off. Below the rows, a one-off strip ("This time, search with:") runs a single search with another engine. It works by click, Ctrl/middle-click (background tab) or keyboard, and never changes the default engine.

## What was built

- **Boundary** (`PowerBrowserAPI.sys.mjs`, search area):
  - `SearchSuggestionController` was added to the `searchLazy` getter block.
  - `searchSuggestions(actorRef, text, engineName)` validates its input (refusal `searchSuggestions: refusing ...`) and calls `resolveTypedAddress`. Any kind other than `search` returns `[]`.
  - It uses `barEngine(engineName)` and keeps one controller per frame (a `WeakMap` keyed by `browsingContext.top.embedderElement`), so the next fetch stops the one in flight.
  - The fetch is `fetch({ searchString, inPrivateBrowsing: false, engine, maxLocalResults: 0, maxRemoteResults: 4 })`. At most 4 string values of at most 512 characters are returned. A rejection or a null result returns `[]`.
  - Wiring: one STORE_REQUEST_KINDS member and one case arm.
- **Catalogue**: the `searchLazy` row now names `SearchSuggestionController` and `searchSuggestions`. A new row for `controller.fetch` was added at the end of Touchpoints. The privileged-kind paragraph records the first network kind.
- **Rule 12**: `['searchSuggestions', 'network']`. The class comment no longer says the network class is empty.
- **Client**: `searchSuggestions(text, engineName = '')` via `field(..., 'rows')`.
- **Setting**: `browser.searchSuggestions` (boolean, default `true`, `PreferenceScope.User`), with the contracted description pinned in `EXPECTED_NAV_COPY`.
- **Widget, suggestions**:
  - `engineRows` is cleared on new text and in `closeDropdown`.
  - In `runQuery`, the resolve reply chains `fetchEngineRows`. It runs only for kind `search`, with `suggestionsOn()` true and no open composition, under the query's `current()` guard. A failure is silent.
  - Rows reach the screen only through `composeVisibleRows()` → `composeRows(heuristic, engineRows, placeRows)`.
  - `commitRow` sends a `search` row to `commitText(row.title)`.
- **Widget, one-offs**:
  - `oneOffEngines()` is the visible engines minus `effectiveEngine()`, only for non-empty text.
  - `renderOneOffs()` renders the label and 32×32 buttons with an aria-label `Search with {name}`, a `safeIcon` image or `codicon-search`, and a HoverService tooltip (`pb-chrome-bar-hover`). Mousedown is prevented so the pill keeps focus.
  - Gestures: click searches in the current tab. Ctrl/Meta+click or an auxclick with button 1 opens a background tab.
  - `runOneOff` resolves with that engine name. It then calls `openCommittedUrl`, or `openInBackground` followed by `joinActiveGroup` (the pill reverts to the committed address). Any non-search reply shows the no-search row.
  - Keyboard: the arrow keys walk `highlightKeys()`, Enter on a one-off key runs it, and `aria-activedescendant` names the highlighted button.
  - A late reply keeps a one-off highlight, because `showComposedRows` now checks `highlightKeys()`.
- **CSS**: `.pb-chrome-bar-oneoffs` has a hairline top border, 8px padding and margin, and wraps with a 4px gap. The label uses the 12px muted caption style. `.pb-chrome-bar-oneoff` is 32×32 with a hover surface, and `.is-highlighted` uses the item-3 wash `rgba(0, 166, 245, 0.18)`.
- **Live harness**:
  - `/one/suggest` and `/two/suggest` return `[q, [q alpha, q beta]]`, and a 500 for `fail` (`serveNavPages` answers 500 when a json page's value is undefined).
  - Scenario `suggestions`:
    - Positive control: `hel` produces a suggest GET and shows two rows.
    - `127.0.0.1:<port>/x` and `localhost:4000` produce no GET, and the page-realm `searchSuggestions('localhost:4000')` returns `[]` with no GET.
    - `fail` leaves only the heuristic row, with no error row.
    - With the setting off, `world` produces no GET.
    - Enter on `hel alpha` searches it.
  - Scenario `one-off`:
    - The strip shows the derived button list, and the hover shows one tooltip.
    - A click searches `/two/search` in the current tab, and the default and the setting are unchanged afterwards.
    - ArrowDown onto the button plus Enter searches again.
    - A middle-click opens a background tab while the session tab stays current.
    - With every other engine hidden, no strip shows (restored in a finally).
  - Plants `setting-ignored` and `oneoff-default`.

## Verification (all run this session)

- **Boundary**: `verify-ng-040-internals-catalogue-lines` PASS, `check-internals-boundary.sh --catalogue` PASS, and `check-internals-boundary.sh` PASS.
- **Static gates**:
  - `verify-web-tab-bridge` PASS and its `--self-test` PASS (20 plants).
  - `verify-ng-027-reader-callers` PASS.
  - `verify-chrome-bar-suggestions` PASS and its `--self-test` PASS.
  - `verify-shell-error-copy` PASS and its `--self-test` PASS.
  - `scan-brand-residue` PASS.
  - `tsc --noEmit -p theia/extensions/chrome-bar` reported no errors.
- **Theia build**: `yarn build` passed with 0 errors after each task.
- **Live checks**:
  - `node scripts/verify-address-bar-live.mjs --scenario search,suggestions`: `search: PASS`, `suggestions: PASS`.
  - Full `node scripts/verify-address-bar-live.mjs`: all 10 scenarios PASS. This includes `suggestions` and `one-off`, and `rows` after its dedupe fix (below).
  - `node scripts/verify-address-bar-live.mjs --self-test`: PASS. The clean control is green and all 6 plants went red. `setting-ignored` named "suggest request while the setting was off: [?q=world]", and `oneoff-default` named "no GET on /two/search ... [/one/search?q=hello]".
  - `node scripts/verify-web-tab-live.mjs`: PASS.
- **Quick gate**: `scripts/verify-platform.sh --quick` PASS after each task.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ng-040 `--fix` swapped the savePageCopy `IOUtils.remove` pair and put the `searchLazy` getter row one line early, again**
- **Found during:** Task 1, the boundary edit (the carry-over named this risk).
- **Fix:** The rows were set by hand: the persist-failure cleanup (`dir`) is 4073, the replaced copy (`previous`) is 4069, and `defineESModuleGetters(searchLazy` is 4308. ng-040 PASS.
- **Commit:** 760de54

**2. [Rule 1 - Bug] The plan's one-off assertion "exactly one button" does not hold in the harness profile**
- **Issue:** No configured engines are active in the live profile, so chrome lists Gecko's app engines alongside the two probe engines. The strip correctly showed six buttons.
- **Fix:** The scenario derives the expected buttons from `ChromeStoreClient.listSearchEngines()` (every engine but Probe Engine One, in chrome's order) and compares them as an ordered list. Clicks, hovers and the keyboard walk target Probe Engine Two's button by aria-label. The one-engine case hides every engine but One, then restores them all in a finally.
- **Commit:** 92c4edc

**3. [Rule 1 - Bug] The rows scenario's dedupe assertion counted engine suggestions as duplicate rows**
- **Issue:** Engine rows for "Row" share the heuristic caption "Search with Probe Engine One", so the caption-uniqueness check went red with "two rows for one url".
- **Fix:** The check now covers only url-captioned rows. The `dedupe-off` plant still goes red (it named `/r-tab` in the self-test).
- **Commit:** 92c4edc

**4. [Rule 3 - Blocking] The tab-uris lib had to be rebuilt before the chrome-bar typecheck**
- `tsc -p theia/extensions/chrome-bar` reads `@powerbrowser/tab-uris/lib`, so `yarn --cwd extensions/tab-uris build` ran first. The build output is not tracked, and nothing was committed for it.

**5. [Rule 2 - Missing functionality] Background one-off with no tab to open after**
- `openInBackground` needs a reference widget. The fallback is `currentWebTab() ?? shell.currentWidget`, and with neither the search runs in place.
- **Commit:** 92c4edc

### Notes

- The plan's Task 1 `<files>` did not list `scripts/lib/pb-live-probe.mjs`. It gained the 500 response for the failing suggest endpoint, as the plan allowed ("extend the harness page shape ... if needed").
- Web-tab budget: the full run opens 4 web tabs on the served origin (cookie-page, /start, /r-tab and the one-off background tab), which is exactly the limit. A later scenario that opens another tab must serve from `localhost`.

## Known Stubs

None. The footer still names Alt+Enter, which 29-07 lands (carried from 29-05).

## Threat Flags

None. The only new surface is the `searchSuggestions` network kind, which the threat model covers (T-29-22..26).

## Self-Check: PASSED

- All 11 modified files exist. Commits 760de54 and 92c4edc are ancestors of HEAD, and `git rev-list --count 7c49854..HEAD` is 2.
