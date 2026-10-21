---
phase: 29-address-bar-search-and-fixup
plan: 04
subsystem: chrome-bar address bar / PowerBrowserAPI search area / packaged build
status: complete
tags: [BAR-04, search-engines, preferences, placeholder, packaged, live-check]
requires: [29-03]
provides:
  - "listSearchEngines store kind (read class): { engines: [{name, icon}], defaultName }; icons only as data:image/ strings up to 65536 chars, else null"
  - "ChromeStoreClient.listSearchEngines + SearchEngineInfo / SearchEngineList types"
  - "browser.defaultSearchEngine (string, default '', User scope); enum and enumItemLabels filled at runtime through PreferenceSchemaService.updateSchemaProperty"
  - "Widget: engineList, refreshEngines (on init, on a change to the setting, on pill focus), engineNameForRequest, effectiveEngine; placeholder and aria-label name the engine in use"
  - "CHROME_BAR_COPY.searchOrEnterAddress / searchPlaceholder / defaultSearchEngineDescription, pinned in EXPECTED_NAV_COPY"
  - "Live scenario default-engine, second served engine Probe Engine Two, plant engine-name-dropped"
  - "scripts/verify-search-engines-packaged.mjs; registry row search-engines-packaged (full run)"
  - "A fresh Linux package (objdir/dist/powerbrowser-153.5.0.en-US.linux-x86_64.tar.xz)"
affects: [29-05, 29-06, 29-07]
tech-stack:
  added: []
  patterns:
    - "Runtime-filled preference options: a static schema row, completed by updateSchemaProperty from a chrome reply"
    - "The packaged binary driven through the standard live harness by setting PB_FIREFOX_BIN before a dynamic import of pb-live-probe.mjs"
key-files:
  created:
    - scripts/verify-search-engines-packaged.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-address-bar-live.mjs
    - scripts/verify-chrome-bar-suggestions.mjs
    - scripts/verify-platform.sh
decisions:
  - "No default-engine write kind: the User-scope setting's value rides every resolveTypedAddress request as engineName, and chrome accepts only a name in the bar's engine set. Gecko's own default is never changed by the setting"
  - "The widget re-reads chrome's engine list on pill focus, as well as at init and on a change to the setting, because engines can be added after startup"
  - "barEngines hides Firefox's own engines by loadPath prefix [app] rather than by getAppProvidedEngines(). Upstream's getAppProvidedEngines prepends appDefaultEngine, which under a policy Default is the configured engine itself, so the old filter dropped the first configured engine"
metrics:
  duration: 16m
  completed: 2026-10-21
  tasks: 2
  files: 12
commits: 2
plan_head_before: 2db18c610ea06c1f9d057298cc81094da89fb038
plan_head_after: e32eacbc1a82cadc6d7c6ec4720e84b673c12e7c
actuals:
  tokens: 11800
  tasks: 2
  commits: 2
---

# Phase 29 Plan 04: Default search engine setting and packaged engine set Summary

Settings now has **Browser › Default Search Engine**. Its options come from chrome's new `listSearchEngines` kind. The engine chosen there travels with every typed search, and chrome checks the name against the bar's engine set. The placeholder names the engine that searches actually go to. On the packaged build, a new check proves that the bar offers exactly the `configuration.toml` engines, with the first one as the default. Running that check found a real bug: the configured default engine was being hidden. That bug is fixed.

## What was built

- **Boundary:** `listSearchEngines()` in the search area returns the bar engines in order as `{name, icon}`, plus `defaultName`, which comes from `barEngine("")`.
  - An icon crosses into the frame only as a `data:image/` string of at most 65536 characters. Anything else becomes `null`.
  - The kind has one STORE_REQUEST_KINDS member and one case arm.
  - Rule 12 classifies it as `read`.
- **Client:** `listSearchEngines()` with the `SearchEngineInfo` and `SearchEngineList` types.
- **Setting:** `browser.defaultSearchEngine`, a string with default `''` in User scope, using the contracted description.
  - The static row offers only `''` until chrome replies.
  - After that, `enum` is `['', ...names]` and `enumItemLabels` is `[defaultName, ...names]`. The empty option is therefore labelled with the configured default's name.
- **Widget:**
  - `engineNameForRequest()` returns the User-scope value only when chrome lists that name. Otherwise it returns `''`, which means chrome's default.
  - `effectiveEngine()` returns that name, else `defaultName`, else undefined.
  - `commitText` and `goHome` pass the name to `resolveTypedAddress`.
  - The placeholder and `aria-label` use `CHROME_BAR_COPY.searchPlaceholder(engine)` when an engine is known. Otherwise they read "Search or enter address".
  - No engine name appears in the source.
- **Copy:** three entries. "Search or enter address" moved from `EXPECTED_WIDGET_COPY` to `EXPECTED_NAV_COPY`, and two strings were added.
- **Live check:**
  - Session setup adds `Probe Engine Two`, with `/two/search` and `/two/suggest`.
  - Scenario `default-engine` checks four things:
    1. The placeholder and `aria-label` name Probe Engine One.
    2. The setting's options include `''`, One and Two.
    3. Choosing Two renames the placeholder with no reload, and Enter on `hello` sends a GET to `/two/search`.
    4. `No Such Engine` leaves the placeholder on One, and Enter sends a GET to `/one/search`.

    The setting is reset afterwards.
  - Plant `engine-name-dropped` is wired in.
- **Packaged check:** `verify-search-engines-packaged.mjs` follows ng-072's structure. It is a full-run row placed beside ng-072.
  - It extracts the package and requires the packaged `policies.json` to be byte-equal to the tracked file. Otherwise it fails with "the package is stale".
  - It sets `PB_FIREFOX_BIN` to the packaged binary, then dynamically imports the harness.
  - In one session it asserts three things: the engine names are exactly the manifest's names, in manifest order; `defaultName` is the first; and `resolveTypedAddress('hello world')` is a search on the first engine, with a URL that starts with its template up to `{searchTerms}`.
  - Every expectation comes from `resolveConfig`. The extracted tree is removed in a `finally` block.

## Verification (all run this session)

- **Boundary:** `verify-ng-040-internals-catalogue-lines` and `check-internals-boundary.sh --catalogue` PASS after each boundary edit.
- **Static checks:** `verify-web-tab-bridge` PASS. `verify-shell-error-copy` and its `--self-test` PASS. `verify-chrome-bar-suggestions` and its `--self-test` PASS.
- **Theia build:** `yarn build` passed with 0 errors.
- **Dev live check:** `node scripts/verify-address-bar-live.mjs --scenario search,default-engine` gave `search: PASS` and `default-engine: PASS`. After the Task 2 boundary edit, the full scenario set was re-run and all six passed: token-cookie, search, refused, no-engine, dev-addresses and default-engine.
- **Live self-test:** `node scripts/verify-address-bar-live.mjs --self-test` PASS. The clean control is green, and all 3 plants went red. `engine-name-dropped` named "no GET on /two/search with q "hello" after Enter with the setting on Probe Engine Two".
- **Packaged check, stale branch:** on the old package (17 Oct) it went red with "the package is stale: run powerbrowser/packaging/package-linux.sh".
- **Packaging:** `nix develop .#firefox --command bash powerbrowser/packaging/package-linux.sh` ran twice, the second time after the filter fix. Both runs passed.
- **Packaged checks:** `node scripts/verify-search-engines-packaged.mjs` PASS. `node scripts/verify-ng-072-policies-webextension.mjs` PASS, so its byte-equality is green again.
- **Brand scan:** `scan-brand-residue` PASS.
- **Quick gate:** `scripts/verify-platform.sh --quick` PASS after each task.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The bar dropped the first configured engine on the packaged build**
- **Found during:** Task 2, the first run of `verify-search-engines-packaged` on the fresh package.
- **Issue:** `listSearchEngines()` returned `["Wikipedia"]` with `defaultName` "Wikipedia", and a typed search went to Wikipedia. A chrome-side diagnostic showed that SearchService held both policy engines. However, `getAppProvidedEngines()` also returned `policy-DuckDuckGo Lite`. The reason is upstream `SearchUtils.sortEnginesByDefaults`, which always prepends `appDefaultEngine`, and under the policy `Default` that engine is the configured one. 29-01's filter therefore removed the engine `configuration.toml` names as the default.
- **Fix:** `barEngines` now filters `visible` on `!String(e.loadPath).startsWith("[app]")`. App-provided engines have a `[app]…` loadPath, policy engines have `[policy]` and user engines have `[user]`. No new internal is involved and no import was added. The catalogue lines were re-synced with ng-040 `--fix`.
- **Files modified:** powerbrowser/shell/PowerBrowserAPI.sys.mjs, powerbrowser/INTERNAL-APIS.md
- **Commit:** e32eacb

**2. [Rule 2 - Missing functionality] The engine list is re-read on pill focus**
- **Found during:** Task 1, while writing the scenario.
- **Issue:** The plan refreshes the list at init and when the setting changes. Engines added after startup were therefore missing from both the placeholder and the setting's options. That includes an engine added in the stock window, and the harness's own engines. The scenario's first assertion could never have held.
- **Fix:** `onFocus={this.onInputFocus}` on the pill input calls `refreshEngines()`. The scenario focuses the pill before its first read.
- **Commit:** 596cdf9

**3. [Rule 3 - Blocking] The engine-host plant anchor in verify-chrome-bar-suggestions moved**
- **Issue:** The plant replaces `resolved = await this.store.resolveTypedAddress(text);`, and that line now passes the engine name.
- **Fix:** The anchor now reads `resolveTypedAddress(text, this.engineNameForRequest());`. The self-test goes red naming `duckduckgo.com` again.
- **Commit:** 596cdf9

**4. [Rule 1 - Bug] ng-040 `--fix` swapped the two `IOUtils.remove` / `savePageCopy` rows again, and put the `searchLazy` getter row on the wrong line**
- **Issue:** 29-01 recorded this follow-up. With the same pattern and function in two rows, `--fix` gave each row the other row's line. It also mapped the `defineESModuleGetters` row to `const searchLazy = {};`, one line above the call.
- **Fix:** The numbers were corrected by hand. 4061 is the replaced copy (`previous`), 4065 is the failed-persist cleanup (`dir`), and the getter call is on 4300. ng-040 PASS.
- **Commit:** 596cdf9

### Notes

- Theia does not enforce a preference's `enum` on stored values. `PreferenceValidationService` is bound but never consulted by `PreferenceService`. A value such as `No Such Engine` is therefore stored as written, and the widget does the validation. The live check proves that it does.
- `goHome` also passes the engine name. It still opens only a `visit` reply, so the name has no effect there.
- **Requirements:** BAR-04 is complete. 29-03 delivered the manifest half, and this plan delivers the setting and the packaged proof.

## Known Stubs

None.

## Threat Flags

None. T-29-15 is mitigated: the setting is read in User scope only, unknown names are never sent, and chrome matches names exactly within the bar's set. T-29-16 is mitigated: icons cross only as size-capped `data:image/` strings. T-29-17 is mitigated: engine names reach the frame only as attribute values, the placeholder and `aria-label`, and as Settings option labels, never as markup.

## Self-Check: PASSED

- FOUND: scripts/verify-search-engines-packaged.mjs
- FOUND: 596cdf9 (Task 1), e32eacb (Task 2), both ancestors of HEAD
