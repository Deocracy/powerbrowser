---
phase: 29-address-bar-search-and-fixup
plan: 01
subsystem: chrome-bar address bar / PowerBrowserAPI search area
status: complete
tags: [BAR-01, search, uri-fixup, store-kind, live-check]
requires: []
provides:
  - "Phase 29 search area at the end of PowerBrowserAPI.sys.mjs (searchLazy, configuredEnginesActive, barEngines, barEngine, upgradeSchemeless, resolveTypedAddress)"
  - "resolveTypedAddress store kind; ChromeStoreClient.resolveTypedAddress + ResolvedAddress {kind: visit|search|refused|no-engine, url?, engineName?}"
  - "pill commitText and goHome on chrome's resolve kind; no-search row (CHROME_BAR_COPY.noSearch)"
  - "scripts/verify-address-bar-live.mjs (search, refused, no-engine; plant resolve-bypassed); registry rows address-bar-live, address-bar-live-self-test"
  - "pb-live-probe.mjs: request log with search + cookie, json pages, shared BROKEN/isState/loadedAt/setPref/readPill/pillKey/makeCurrent/appNameExpr, Enter in the BiDi key fallback"
affects: [29-02, 29-03, 29-04, 29-05, 29-06, 30]
tech-stack:
  added: []
  patterns:
    - "Hermetic engine per live session: chrome-side SearchService.addUserEngine on a served path + setDefault"
    - "End-of-file boundary section with its own lazy-getter block"
key-files:
  created:
    - scripts/verify-address-bar-live.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - scripts/verify-shell-error-copy.mjs
    - scripts/lib/pb-live-probe.mjs
    - scripts/verify-nav-keys-live.mjs
    - scripts/verify-platform.sh
    - scripts/verify-chrome-bar-suggestions.mjs
decisions:
  - "upgradeSchemeless detects loopback with /^(.+\\.)?localhost$/ instead of a \"localhost\" string literal, so the gui08 'dropped localhost' plant keeps discriminating"
  - "Typed text with a non-http(s) scheme (view:, settings:) now resolves to refused; suggestion rows keep the opener route for those schemes"
metrics:
  duration: 24m
  completed: 2026-10-21
  tasks: 2
  files: 11
commits: 2
plan_head_before: 8b4f6fbe39f593979de85640a606a6a56f3e4137
plan_head_after: 3bb194b0d27a3aca830d19fce373c928e43a232a
actuals:
  tokens: 15275
  tasks: 2
  commits: 2
---

# Phase 29 Plan 01: Address Bar Search and Fixup tracer Summary

When you type words in the pill and press Enter, chrome's new `resolveTypedAddress` store kind now handles them in three steps: Gecko URI fixup, then the bar engine's GET submission, then an http(s) check on the resulting URL. The default engine's results load in the current web tab. The live check proves this against a served hermetic engine. Refused schemes show the commit-failure row, a missing engine shows the contracted no-search row, and Home only opens a `visit` result.

## What was built

- **Boundary (PowerBrowserAPI.sys.mjs):** a new end-of-file section, "Phase 29: the search area". It has its own `searchLazy` getter block for `SearchService`.
  - `configuredEnginesActive` checks for active policy with a non-empty `SearchEngines.Add`.
  - `barEngines` drops app-provided engines when engines are configured. `barEngine(name)` matches the name exactly and never substitutes another engine. With no name it returns the default, else the first engine, else null.
  - `upgradeSchemeless` changes bare dotted hosts to https. Loopback, IP literals and hosts with an explicit port stay on http.
  - `resolveTypedAddress` refuses empty input, input over 2048 characters, and engine names over 256 characters. It awaits `SearchService.init()` first. A fixup throw replies `refused`. A keyword lookup uses the bar engine's submission and refuses `postData` or any non-http(s) URL. Every other input goes through the http(s) check on `preferredURI`.
  - One `STORE_REQUEST_KINDS` member and one case arm. Four Touchpoints rows were appended.
- **Client:** the `ResolvedAddress` type and the `resolveTypedAddress(text, engineName = '')` method, through `field(…, 'resolved')`.
- **Widget:** `typedAddressTargetOf` is deleted.
  - `commitText` awaits the resolve kind. `visit` and `search` navigate, `no-engine` shows the no-search row, and anything else shows the commit-failure row.
  - `goHome` navigates only a `visit` reply.
  - The `noSearch` flag is cleared by typing, by `closeDropdown` and by a pill sync. Enter on the no-search row retries.
- **Copy:** `CHROME_BAR_COPY.noSearch`, pinned in `EXPECTED_NAV_COPY`.
- **Harness:**
  - The `serveNavPages` log now records `search` and `cookie`, and pages can be `json:`.
  - Seven helpers moved out of nav-keys-live into `pb-live-probe.mjs`: BROKEN, isState, loadedAt, setPref, readPill, pillKey, makeCurrent. `appNameExpr` moved too, in Task 2.
  - NEW `verify-address-bar-live.mjs` and its two registry rows.

## Verification (all run this session)

- Static checks: ng-040 catalogue lines, check-internals-boundary (default and `--catalogue`), web-tab-bridge, chrome-bar-suggestions (and its `--self-test`), ng-027 reader-callers, shell-error-copy (and its `--self-test`), and `tsc` for tab-uris and chrome-bar. All PASS.
- `scripts/verify-platform.sh --quick`: PASS (all checks), after each task.
- Theia app rebuilt with `yarn build` before every live run.
- `node scripts/verify-address-bar-live.mjs`: search PASS, refused PASS, no-engine PASS.
- `node scripts/verify-address-bar-live.mjs --self-test`: PASS. The clean control is green, and `resolve-bypassed` went red with "no GET on /one/search".
- `node scripts/verify-nav-keys-live.mjs --scenario home,home-failure,pill-esc`: three PASS lines.
- `node scripts/verify-web-tab-live.mjs`: exit 0, including the typed commit with the upper-case scheme. Its `--self-test` also passes: all 12 plants went red, including dropdown-rearms.
- Tracer feedback gate: the search scenario was re-run end-to-end after the last Task 1 boundary edit (PASS) before Task 2 began.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The engine-host plant in verify-chrome-bar-suggestions lost its anchor**
- **Found during:** Task 1 `--quick`
- **Issue:** The plant mutated `` return `https://${text}`; ``, which was a line of the deleted `typedAddressTargetOf`. Without that line the self-test reported "the anchor it edits has drifted".
- **Fix:** The plant now targets the widget's new `resolved = await this.store.resolveTypedAddress(text);` line and swaps in a minted engine URL. The self-test goes red naming `duckduckgo.com` again.
- **Files modified:** scripts/verify-chrome-bar-suggestions.mjs
- **Commit:** 61c6c86

**2. [Rule 1 - Bug] A `"localhost"` literal in the search area stopped the gui08 'dropped localhost' plant from going red**
- **Found during:** Task 1 `--quick` (gui08-persistence-roundtrip-self-test, ng-016-gui08-persistence-at-head)
- **Issue:** The gui08 static check looks for `"localhost"` anywhere in the boundary file. `upgradeSchemeless`'s new literal satisfied it even with the CR-01 acceptance removed.
- **Fix:** `upgradeSchemeless` now uses `/^(.+\.)?localhost$/.test(host)`. The gui08 check was not changed.
- **Commit:** 61c6c86

**3. [Rule 1 - Bug] `verify-ng-040-internals-catalogue-lines.mjs --fix` swapped two rows with the same pattern and function**
- **Found during:** Task 1 catalogue step
- **Issue:** The two `IOUtils.remove` / `savePageCopy` rows moved 4 lines. `--fix` kept one row's number and gave the other row 4058, so each description named the other line. ng-040 still read green, because it only matches the pattern.
- **Fix:** Hand-swapped the two line numbers in INTERNAL-APIS.md so each description names its own line: 4054 is the replaced copy and 4058 is the failed-persist cleanup. ng-040 PASS.
- **Commit:** 61c6c86
- **Follow-up:** `--fix` cannot tell apart rows with the same pattern and function. Every later boundary edit should check that pair again.

**4. [Rule 3 - Blocking] The React-controlled pill value reads back stale right after typing**
- **Found during:** Task 1, first live run (`broken instrument`)
- **Fix:** `typeInPill` now polls `readPill` until the re-render shows the typed value. Enter was also added to the BiDi key fallback map in `pb-live-probe.mjs`, in case TIP is refused.
- **Commit:** 61c6c86

**5. [Scope] `appNameExpr` also moved into the harness**
- The plan listed only seven helpers to move. The new no-engine scenario reads the application name the same way `homeFailure` does, so the expression moved too, keeping one copy. Commit 3bb194b.

### Acceptance-criterion note
- `grep -n "address-bar-live|" scripts/verify-platform.sh` prints one line, not two. The literal `address-bar-live|` does not occur in the `address-bar-live-self-test|` row. Both rows are present, matching how the nav-keys-live rows are written. The criterion's count is mis-specified; the registry is as the plan's action describes.

## Known Stubs

None.

## Threat Flags

None. The new store kind is behind the existing `groupSenderIsTheia` and `storeSenderInShellWindow` checks (T-29-02). The T-29-01, 03, 04 and 05 mitigations are implemented as planned.

## Risks for later plans

- `scripts/verify-address-bar-live.mjs` opens one 127.0.0.1 tab per session. Later scenarios should reuse `sessionTab(ctx)`, or move to `localhost`, to stay under the four-tab limit.
- `refused` and `no-engine` return `not-scored` unless `search` passed in the same session, so `--scenario refused` on its own is never scored.
- Chrome now refuses typed text with a non-http(s) scheme (`view:`, `settings:`). Today nothing typed relies on those schemes; suggestion rows still use the opener route.

## Self-Check: PASSED

- FOUND: scripts/verify-address-bar-live.mjs
- FOUND: 61c6c86 (task 1), 3bb194b (task 2), both ancestors of HEAD
