---
phase: 39-v1-5-close-out
plan: 13
subsystem: testing
tags: [ext-tab-host-live, extension-actions-live, webextensions, EXT-05, EXT-06, 38-UAT, kwin, capture]

requires:
  - phase: 39-v1-5-close-out
    provides: "39-12 adopt harness; 39-04 patch 050 (999.15/999.16) and per-scenario fixture relaunch; 39-07 capture hook pattern"
provides:
  - "ext-tab-host-live scenarios container-refused (38 T25), activate-after-ack (T26), foreign-page-refused (T27), options-page-switch (T30), one plant each"
  - "extension-actions-live scenarios remove-copy (T28), frontend-reload (T29), private-access (T22), one plant each; PB_CAPTURE_DIR hook"
  - "fixtures private-denied and private-allowed (own /cmd-<channel>); action fixture storage ops"
  - "captures 38-T18, 38-T19, 38-T20"
  - "38-UAT: rows 25-28 pass, 24 skipped, 22/29/30 live lines, 18-20 captures, 17 evidence"
affects: [39-14, 39-19, 39-20]

actuals:
  tokens: 52000
  tasks: 3
  commits: 3
plan_head_before: fca1b561cc50d990f582ad39038b9c9c3c0f98b3
plan_head_after: 7d3739cf595fa4550b6bc994e011738395326cc2

tech-stack:
  added: []
  patterns:
    - "A race window the review fix covers is made deterministic by holding the frontend's ack in the page realm, so the product's ordering, not the timing, decides the result"
    - "An invariant over two processes is sampled in order (chrome first, then the frontend), so a violation seen after the first read was also true before it"
    - "Pages are counted on the BiDi tree (the documents), not on chrome's view of the browsers, so a plant that changes the chrome view cannot hide a duplicate"

key-files:
  created:
    - .planning/phases/39-v1-5-close-out/captures/38-T18-buttons-badge-puzzle-popup.png
    - .planning/phases/39-v1-5-close-out/captures/38-T19-page-action-pill.png
    - .planning/phases/39-v1-5-close-out/captures/38-T20-sidebar-view.png
    - .planning/phases/39-v1-5-close-out/39-13-SUMMARY.md
  modified:
    - scripts/verify-ext-tab-host-live.mjs
    - scripts/verify-extension-actions-live.mjs
    - scripts/lib/pb-extension-fixtures.mjs
    - .planning/phases/38-webextensions/38-UAT.md

key-decisions:
  - "activate-after-ack holds the frontend's webTabAdopt ack for 2 s. Without the hold the extension's activation sometimes lands before the adoptTab push has gone, and the product then foregrounds through the push (the pre-push branch, by design), so the test sometimes answered active true and was not testing CR-03"
  - "38 T24 is recorded as skipped. The add-ons listing visit needs network to addons.mozilla.org, and the lane orchestrator put AMO network out of scope for this lane. extension-amo-live and its self-test were not run for the same reason"
  - "38 T30 stays pending even though its scenario passes in 4 of 5 runs, because 1 run showed a duplicate options tab"
  - "private-access uses two fixtures with different ids (one denied, one allowed) rather than reinstalling one id. The static fixture gate refuses two fixtures with one id, and the allowed fixture is the positive control for every absence on the denied one"

requirements-completed: []  # EXT-05..EXT-09 follow the 39-RESEARCH Open Question 5 rule; T22 and T29 are not live-proven, so none are ticked

duration: 300 min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 13: 38 tab-host and extension UI scenarios Summary

**Seven new scenarios, each with a plant, cover 38 T22 and T25-T30.**

- **Tab-host (CR-02, CR-03, WR-01, WR-06):** all four pass through the registry, and every one of the 30 tab-host plants goes red.
- **Remove copy (WR-04):** passes.
- **Product defects found:**
  - A reloaded frontend does not bring the extension sidebar view back (T29).
  - The IDE never loads under permanent private browsing (T22).
  - A not-allowed extension's options page can open in a private stock window (T22).
  - An options page can open twice while the stock window is starting (T30), seen in 1 of 5 runs.
- **Fixes:** all four are deferred to main below. Rows 22, 29 and 30 stay pending with live lines.
- **Captures:** T18-T20 are committed for Chris.

## Verification (real output)

- `node scripts/verify-ext-tab-host-live.mjs --scenario query,container-refused,activate-after-ack,foreign-page-refused,options-page-switch`: all 5 PASS, exit 0.
- The tab-host `--self-test` over the four new scenarios printed `PASS -- every control was green and every plant went red naming its drift`. The plants named their drift as follows:
  - container-dropped: 'a container tab was opened'
  - activated-before-shown: 'the host selected a tab the frontend had not shown' (129 samples)
  - foreign-system-principal: 'a foreign page opened or used the wrong principal' (addTab got `[System Principal]`)
  - options-no-reuse: 'openOptionsPage opened a second tab' (1 -> 2 pages)
- `scripts/verify-platform.sh --only ext-tab-host-live`: 29 of 29 PASS, `verify-platform: PASS`.
- `scripts/verify-platform.sh --only ext-tab-host-live-self-test`: `PASS -- every control was green and every plant went red naming its drift`, with 30 plants red.
- `scripts/verify-platform.sh --only extension-actions-live`: FAIL. 14 scenarios PASS. frontend-reload and private-access FAIL on the deferred product defects.
- `scripts/verify-platform.sh --only extension-actions-live-self-test`: FAIL. 16 plants red. The controls for frontend-reload and private-access are red, so their plants are unscored.
- remove-copy self-test: control green; plant remove-keeps-storage red, naming 'reinstall kept old storage'.
- `node scripts/verify-webextensions.mjs`: PASS. `--only allowlist-doc-consistency`: PASS. `node scripts/verify-extension-actions.mjs`: PASS, with 7 fixtures derived. `--static`: PASS, with 18 plants.
- `scripts/verify-platform.sh --quick`: `PASS -- all checks passed`, before the harness commits.
- extension-amo-live and extension-amo-live-self-test were not run (lane scope: network).
- The plan's 38-UAT node check would fail on rows 22, 29 and 30, which are not pass. That is by design: their product fixes are deferred.

## Task Commits

1. **Task 1:** `e8186bee` test(39-13): tab-host scenarios container-refused, activate-after-ack, foreign-page-refused, options-page-switch with plants
2. **Task 2:** `728b962c` test(39-13): extension UI scenarios remove-copy, frontend-reload, private-access with plants; capture hook
3. **Task 3:** `7d3739cf` docs(39-13): 38-UAT rows 25-28 pass, 24 skipped, 22/29/30 live lines, 18-20 captures, row 17 evidence

## Product fix deferred to main

**1. 38 T29 (WR-05): the sidebar view does not come back after a frontend reload**
- **Red evidence:** frontend-reload, 4 of 4 runs. The reload half holds: chrome records popuphidden and the sidebar browser hidden. Afterwards the view reads `{"attached":true,"visible":false,"label":"PB sidebar probe","width":0}` for 60 s, and the panel browser stays `visibility: hidden`.
- **File:** `theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx` `syncSidebar` (lines 244-262).
- **Current behavior:** it runs `addWidget(..., { area: 'right' }).then(() => revealWidget(id))` only when the view is not attached.
- **Likely cause:** after a reload, the first extensionAction push arrives while the shell is still restoring its layout, and the restored right panel ends up collapsed after the reveal.
- **Proposed fix:**
  - Defer the add and reveal until the frontend's layout is restored: `await this.stateService.reachedState('initialized_layout')`, or `ready`, before `addWidget` and `revealWidget`.
  - Also reveal when the view is attached but not visible, and a push says it is open.
- **Check:** `node scripts/verify-extension-actions-live.mjs --scenario frontend-reload`.

**2. 38 T22: the IDE never loads under `browser.privatebrowsing.autostart`**
- **Red evidence:** private-access session 1 times out waiting for `window.theia`. A standalone launch with that pref showed the Theia frame at `http://127.0.0.1:<port>/` with body `Forbidden`.
- **File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs` `setSessionCookie` (lines 535-566).
- **Cause:** it adds the token cookie with `aOriginAttributes {}` only. A private shell window's frame uses the private cookie jar (`privateBrowsingId: 1`), so the sidecar answers 403.
- **Proposed fix:**
  - Add the same cookie a second time with `{ privateBrowsingId: 1 }`, or add it with the shell browser's own `originAttributes`.
  - Update the INTERNAL-APIS row.
  - Check `network-wall` still holds: the token must stay out of extension cookie reads.
- **Check:** `--scenario private-access`, whose session 1 then reads the rule.

**3. 38 T22 step 4: a not-allowed extension's options page can open in a private stock window**
- **Red evidence:** private-access session 2, in 3 runs.
  - With a private stock window opened last, the denied fixture's options tab landed in the private window (`[{"private":true}]`), in 2 of 3 runs.
  - With only a private window open, it landed in that window, in 1 of 3 runs.
- **Cause:** stock `openOptionsPage` (upstream `browser/components/extensions/parent/ext-browser.js:68-87`) uses `windowTracker.topWindow` and calls that window's own `switchToTabHavingURI`. Only the shell window has PowerBrowser's receiver (`installExtensionReceivers`), and that receiver does apply `canAccessWindow`. Stock Firefox behaves the same way, so this is an upstream default, not a PowerBrowser regression.
- **Proposed fix (patch 050, regenerated, owner call):** in `openOptionsPage`, use `extension.privateBrowsingAllowed ? windowTracker.topWindow : windowTracker.topNonPBWindow` (ext-tabs-base.js:1842). When that window is null, open a new non-private window.
- **Constraints:** patch 050 is stamped, so this needs a Gecko rebuild. It is a decision for Chris whether PowerBrowser should be stricter than stock here.

**4. 38 T30 (WR-06): two options tabs during stock-window startup, an intermittent race**
- **Red evidence:**
  - 1 of 5 options-page-switch runs: `2 options tabs in the one stock window (window still starting at the second call: true)`. The other 4 runs, including the registry row, were green.
  - An earlier version that sent both calls in the same tick opened two windows. That version was replaced: the scenario now sends the second call once the window exists.
- **File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs` `extensionOpenTabPage` (10690-10724) and `extensionSelectTabPage` (10727).
- **Cause:** both waiting calls resume after `stockWindowStarted`. The first `addTab`s; the second's reuse lookup compares `linkedBrowser.currentURI.spec` before the first tab has committed its URL, and adds again.
- **Proposed fix:** keep a per-window set of reuse URLs pending start (for example a `WeakMap<win, Set<url>>`), and skip a second `reuse` request for a URL already pending.
- **Check:** options-page-switch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Harness] activate-after-ack made deterministic**
- The ack is held for 2 s, and the scenario runs create, then waits for the adoptTab push, then runs update.
- The first version's control went red once, on the product's by-design pre-push branch.
- **Commit:** e8186bee

**2. [Rule 1 - Harness] The options-no-reuse plant broke the stock window**
- The first plant replaced `gBrowser.tabs` and broke the window.
- It now makes the open tab's browser report about:blank to chrome. Pages are counted on the BiDi tree.
- **Commit:** e8186bee

**3. [Rule 1 - Harness] foreign-page-refused origin and tab list**
- Node's `URL` gives `moz-extension:` the origin `null`, so the origin is taken from scheme and host instead.
- `tabs.query({})` lists stock tabs too, so the check is scoped to the shell window id.
- **Commit:** e8186bee

**4. [Rule 1 - Harness] remove-copy re-pins after reinstall**
- Remove unpins, so the "one button" check pins again and needs 3 equal reads.
- **Commit:** 728b962c

**5. A capture that showed another application was deleted, never committed**
- The first headed T19 run produced a PNG of the owner's other desktop app. The captureShell gate passed, and spectacle took about 25 s, during which focus moved. It was deleted at once and retaken.
- Every committed PNG was opened and shows only the PowerBrowser window.
- 39-18 or later should know that the gate check and the spectacle grab are not atomic.

**6. T18's capture shows the badge and the puzzle menu, not the popup arrow**
- The plan's file name says "popup". The popup panel arrow is not in the frame, and the 38-UAT row 18 capture line says so.

**Total deviations:** 6. No product code was touched.

## Threat Flags

None. The new chrome-scope reads and plants run only in a throwaway profile session.

## Notes for later plans

- 38 T31 stays `[pending]` for 39-14. T21 and T23 are elsewhere.
- **Headed runs in this plan:** 2, each under `/tmp/nix-shell.75PsxP/pb-headed.lock`: buttons,page-action,sidebar, then a page-action retake. 39-12 made 1 headed run.
- `--quick` was run before the two harness commits. The UAT and SUMMARY docs commits ran the brand scan only.
- EXT-05..EXT-09 were not ticked: T22 and T29 lack live evidence (Open Question 5 rule).

## Self-Check: PASSED

- FOUND: scripts/verify-ext-tab-host-live.mjs, scripts/verify-extension-actions-live.mjs, scripts/lib/pb-extension-fixtures.mjs, captures/38-T18, 38-T19, 38-T20
- FOUND commits: e8186bee, 728b962c, 7d3739cf (ancestors of HEAD)
