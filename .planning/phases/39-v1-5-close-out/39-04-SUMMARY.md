---
phase: 39-v1-5-close-out
plan: 04
subsystem: patch-stack
status: complete
tags: [patch-050, webextensions, enterprise-policies, 999.15, 999.16, live-harness, guards]
requires:
  - phase: 39-02
    provides: wave order; 39-BASELINE.md A7 (both target modules symlink into upstream/)
provides:
  - patch 050 sections for ExtensionParent.sys.mjs (browserPaintedPromise raced with extensions-late-startup) and EnterprisePoliciesParent.sys.mjs (observer and observe() arm on extensions-late-startup)
  - guard rows G14, G15, G16 with WEAKEN entries in verify-ext-tab-host-patch-guards.mjs
  - live scenarios event-page-wake and policies-shell-only with plants startup-promises-rearmed and policy-default-prerecorded
  - wake fixture (event page, persisted webRequest listener, no runtime.onStartup) in pb-extension-fixtures.mjs
  - objdir/.pb-050-build.sha256 re-stamped (ebae8968...)
  - backlog 999.15 and 999.16 ticked; 38-UAT row 5 live line
affects: [39-05, 39-18, 39-19, every live harness that checks the 050 stamp]
actuals:
  tokens: 7800
  tasks: 3
  commits: 3
plan_head_before: 88bfabf0407152f08c958543e9fcfd727d0f2992
plan_head_after: 5e4086db80ef368bf6491bf67f66df351b3ff9fc
commits: 3
tech-stack:
  added: []
  patterns:
    - "A new 050 file section: edit upstream/, git -C upstream add, append the pinned regenerate_one diff, then regenerate-patches.sh (write) and --check"
    - "A clean replay of the amended stack is proved on a sparse --shared clone of upstream/ (apply-patches.sh --upstream <scratch>), never by resetting upstream/"
    - "A live scenario that needs pre-launch profile state launches its own session (SELF_LAUNCH_SCENARIOS), so its plant can seed user.js before the first launch"
key-files:
  created: []
  modified:
    - patches/050-extension-tab-host.patch
    - scripts/verify-ext-tab-host-patch-guards.mjs
    - scripts/verify-extension-actions-live.mjs
    - scripts/lib/pb-extension-fixtures.mjs
    - docs/BUILD.md
    - .planning/phases/38-webextensions/38-UAT.md
    - .planning/ROADMAP.md
key-decisions:
  - "policies-shell-only runs two launches: a fresh profile's default is already the policy engine (observed pre-fix: DuckDuckGo Lite with the run-once pref pre-seeded), so the first launch leaves another engine as the user's default and clears the policy record; the relaunch must apply and record the Default"
  - "The no-re-run half clears the policy record and restores the user's engine before the GUI-01 stock window opens, so a second run of onAllWindowsRestored would be visible as a change; the stock window was seen to fire sessionstore-windows-restored once"
  - "G16 is its own row: the observe() case arm is a separate hunk from the constructor's addObserver line"
  - "Requirements EXT-05 and EXT-08 are not ticked: 38-UAT human rows 18-28 are still open (39-RESEARCH OQ5 ticking rule); EXT-03 is not a v1.5 requirement row"
requirements-completed: []
duration: 35 min
completed: 2026-11-06
---

# Phase 39 Plan 04: 999.15/999.16 through patch 050 Summary

**Patch 050 now resolves `ExtensionParent.browserPaintedPromise` on `extensions-late-startup` and runs the enterprise policies' `onAllWindowsRestored` callbacks on that topic. As a result, event pages wake and shipped policies apply in a shell-only session. The change shipped with no Gecko compile, is covered by guard rows G14 to G16, and is proven red-then-green by two live scenarios with live plants.**

## Performance

- Duration: about 35 min
- Tasks: 3 of 3
- Commits: 3 task commits, plus the docs commit for this summary
- Fallback `./mach build`: **not run**. The A7 symlink gate passed: both modules resolve into `upstream/`.

## Accomplishments

### Task 1: red first (02758bfc)
- Added the `wake` fixture: an MV2 event page (`persistent: false`) whose only listener is a persisted `webRequest.onBeforeRequest` for `http://127.0.0.1/wake*`. It deliberately has no `runtime.onStartup` listener.
- Scenario `event-page-wake` uses the relaunch path. The fixture installs as an XPI and the shell relaunches. Three preconditions are checked: zero stock windows, `extensions-late-startup` seen, and the page not yet started. A web tab then loads `/wake`, and the scenario expects a `woke` record within 15 s.
- Scenario `policies-shell-only` launches its own session (see Decisions). The expected engine is read from `powerbrowser/distribution/policies.json` at check time.
- Plants added:
  - `startup-promises-rearmed` calls the file's test-only `ExtensionParent._resetStartupPromises()` after startup. This confirms assumption A3.
  - `policy-default-prerecorded` seeds `browser.policies.runOncePerModification.setDefaultSearchEngine` in user.js before the first launch.
- Pre-fix red lines, run against the unamended 050:
  - `event-page-wake: FAIL -- the event page never woke with no stock window (0 stock window(s); records since the load: [])`
  - `policies-shell-only: FAIL -- the policy Default engine was not applied with no stock window: the default is "Bing" and the policy record is null, policies.json names "DuckDuckGo Lite"`
- Pre-fix exposure (T-39-10): in a shell-only session the shipped `SearchEngines` Default was never applied or recorded. A user default of Bing stayed in place.

### Task 2: patch 050 and guards (735dc25b)
- In `upstream/`, `_resetStartupPromises` now sets `browserPaintedPromise = Promise.race([promiseObserved("browser-delayed-startup-finished"), promiseObserved("extensions-late-startup")]).then(() => {})`.
- `EnterprisePoliciesManager` adds `Services.obs.addObserver(this, "extensions-late-startup", true)`, and `observe()` gains `case "extensions-late-startup":`, which falls into the `sessionstore-windows-restored` arm. That arm does not unregister its topic, and `_runPoliciesCallbacks` drains the callbacks with `shift`, so no unregister was needed.
- Both files are staged in upstream/. The sections were appended using the pinned `regenerate_one` invocation. `regenerate-patches.sh` rewrote only 050, and `--check` passes.
- Guard rows:
  - G14: replace mode, anchor `ExtensionParent.browserPaintedPromise = promiseObserved(`, site `_resetStartupPromises`.
  - G15: after mode, the `sessionstore-windows-restored` addObserver line, site `EnterprisePoliciesManager`.
  - G16: before mode, the `case "sessionstore-windows-restored":` line, site `observe`.
  - Constants `EXT_PARENT` and `POLICIES_PARENT` were added.
- Added the BUILD.md 050 bullet text.

### Task 3: go-live and records (5e4086db)
- The symlink gate passed. The stamp was rewritten with `sha256sum patches/050-extension-tab-host.patch > objdir/.pb-050-build.sha256`, giving `ebae8968b017707250ffcf2c72694cf565ee6623b7e0c7725c0472a9005be1ea`. `sha256sum -c` reports OK.
- Updated the 38-UAT row 5 `live:` line, and ticked ROADMAP 999.15 Test 5 and 999.16 Test none with `fixed in 39-04 (735dc25b)`.

## Verification (real output)

- `regenerate-patches: PASS -- 8 patch(es) equal their regeneration from upstream/`
- `check-patch-surface: PASS -- no compiled-file target paths and no brand values in 8 patch(es)`
- `apply-patches: --self-test PASS`
- Clean replay onto a sparse `--shared` clone of upstream HEAD: `apply-patches: all 8 patches applied and verified non-vacuous`. Both new files were staged there, and `regenerate-patches.sh --check --upstream <scratch>` PASS.
- `verify-ext-tab-host-patch-guards: PASS -- ... G14 _resetStartupPromises, G15 EnterprisePoliciesManager, G16 observe ...`
- `--self-test: PASS -- 60 planted faults`. Each of G14, G15 and G16 went red when removed (MISSING), weakened (WEAKENED) and misplaced (MISPLACED).
- `verify-webextensions: PASS` (EXT-03 non-regression). `verify-extension-actions: PASS` (5 fixtures derived).
- `check-internals-boundary.sh --catalogue` and `--self-test`: PASS.
- `scripts/verify-platform.sh --quick`: `verify-platform: PASS -- all checks passed`, run before both the Task 2 and Task 3 commits.
- `git -C upstream diff --name-only`: empty. The two target files are staged.
- Live results after the patch:
  - `event-page-wake: PASS -- the event page, with no runtime.onStartup listener, woke on /wake with 0 stock window(s)`
  - `policies-shell-only: PASS -- with zero stock windows the policy Default "DuckDuckGo Lite" replaced the user's "Bing" and was recorded; a GUI-01 stock window (sessionstore-windows-restored seen 1 time(s)) re-ran nothing: "Bing" stayed the default, no policy error`
  - `--self-test --live --scenario event-page-wake,policies-shell-only`: both controls PASS and both plants red. `policy-default-prerecorded` reported `the default is "Bing" and the policy record is "DuckDuckGo Lite"`.
- Neighbour runs:
  - `verify-ext-tab-host-live --scenario query,events,active-tab`: all three PASS.
  - `verify-address-bar-live --scenario search`: PASS. The AB-1 pre-recorded Default stays harmless.
  - `verify-extension-actions-live --scenario content`: PASS. This was an extra run because the shared relaunch path changed.

## Deviations from Plan

1. **[Rule 1 - Bug] policies-shell-only redesigned as a two-launch scenario.** The scenario as written passed before the fix, and its plant passed too. In a fresh profile the default engine is already the policy's DuckDuckGo Lite even when the run-once pref is pre-seeded, so the scenario could not see the defect. The fix: a first launch makes another visible engine the user's default and clears the policy record. On the relaunch, both the default engine and the run-once record must equal the policy Default. The no-re-run half clears the record and restores the user's engine before the stock window opens, so a double run would change the default. Both the red and the green runs are above. File: `scripts/verify-extension-actions-live.mjs`. Commit 02758bfc.
2. **[Rule 1] G16's WEAKEN entry changes the topic instead of dropping the line.** G16's change block is a single line, so dropping it is identical to the removal plant and produced a corrupt patch. The entry now replaces it with `case "extensions-late-startup-x":`. Commit 735dc25b.
3. **[Rule 3] Site rule added to `defName` for member-assigned functions.** The rule handles `Outer.inner = () => {` so G14 can derive `_resetStartupPromises`. It is limited to function and arrow values: a broader first attempt moved G1 and G2's sites to `pageAction.*` (class-valued member) and was narrowed. All 15 rows keep their sites. Commit 735dc25b.
4. **[Rule 3] Relaunch path generalised.** `runRelaunchSession` takes the fixture per scenario (`RELAUNCH_FIXTURE`), each with a literal `installFixture(app, '<name>')` so the static fixture-coverage gate still derives the set. The `wake` fixture does not wait to restart after the relaunch.
5. **Task 3 plant run scoped.** It used `--self-test --live --scenario event-page-wake,policies-shell-only` (the two plants the action names) rather than the verify line's unscoped `--self-test --live`, which runs every plant in the harness.
6. **Policy scenario reads the default engine through `SearchService`.** It uses `moz-src:///toolkit/components/search/SearchService.sys.mjs`, the AB-1 pattern, not `Services.search.defaultEngine`.

## Notes for 39-05 onward

- The 050 stamp is now `ebae8968...`. Every live harness compares it, so any further 050 change must re-stamp.
- `objdir/dist/bin/distribution/policies.json` differs from the tracked `powerbrowser/distribution/policies.json`: it lacks the `Preferences` crash-report entry. `SearchEngines` is identical, so this plan is unaffected, but the installed copy is stale.
- The scratch replay clone is at /tmp/nix-shell.75PsxP/claude-1000/-home-chris-coding-Power-Browser/0e65b9de-330c-4679-93d5-f2360adf8d08/scratchpad/replay. It is session temp and was never part of upstream/.

## Threat Flags

None. No new surface beyond the plan's threat register. T-39-08 is mitigated: live no-re-run assertion, plus G16. T-39-09 is mitigated: regenerate --check and G14 to G16 plants. T-39-10: the pre-fix exposure is recorded above. T-39-11: no runtime override; the only runtime call is the plant's test-only reset.

## Known Stubs

None.

## Self-Check: PASSED
