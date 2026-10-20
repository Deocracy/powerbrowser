---
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
plan: 02
subsystem: web-tab channel, boundary file, bridge gate
tags: [session-history, webTabActivated, state-coalescer, bypass-cache, background-open, privileged-kind-rule, bridge-parity]
status: complete

requires:
  - phase: 27-01
    provides: end-of-file web-tab action section, sendWebTabPush, WebTabChannel.onPush router, pb-live-probe harness, verify-nav-keys-live
provides:
  - "webTabHistory / webTabGotoIndex / webTabActivated arms in handleWebTabAction; PowerBrowserWebTabs.activeTabIdOf"
  - "scheduleWebTabState: per-tab, per-animation-frame state-push coalescer (webTabPush's only caller)"
  - "webTabReload(tabId, bypassCache): Firefox kSkipCacheFlags hard reload"
  - "WebTabWidget.history(), gotoIndex(), reload(bypassCache); WebTabOpenHandler.openInBackground(url, ref)"
  - "WebTabActivationContribution (selected tab -> chrome); overlay layer-policy record above BLOCKING_LAYER_SELECTOR"
  - "ShellStateFlushContribution on channel.onPush(SHELL_FLUSH_KIND): one window listener for every push kind"
  - "INTERNAL-APIS.md append-only rule and privileged-kind rule; one Ci.nsIWebNavigation row"
  - "verify-web-tab-bridge rules 9-11 (push-kind parity, action routing, KIND_CLASSES classification) and four plants"
  - "live scenarios history-channel, activation, hard-reload-channel, background-open"
affects: [27-03, 27-04, 27-05, 27-06, 27-07, 27-08, every later v1.5 phase adding a webTab kind or push]

actuals:
  tokens: 16646
  tasks: 3
  commits: 3
plan_head_before: f63a4fc5289dc3448f69386ee1e441124d4b1aee
plan_head_after: 154cadf79686136b0b033ee1b8254a783c1235ba

tech-stack:
  added: []
  patterns:
    - "Chrome-side push coalescing: pending Map per shell window, one requestAnimationFrame, fields read live at flush"
    - "Selection keyed by the sender's embedder element (WeakMap), never by a frame-supplied id"
    - "Every webTab arm classified in the bridge gate's KIND_CLASSES; privileged class exists and must stay empty"

key-files:
  created:
    - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/deferred-items.md
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts
    - theia/extensions/tab-uris/src/browser/profile-storage.ts
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-nav-keys-live.mjs

key-decisions:
  - "A7 held: shell-window requestAnimationFrame flushes state pushes in the headless live session; no setTimeout fallback was needed"
  - "history() and gotoIndex() fold only unknown-tab into lost view (settleUnknownTab), so an out-of-range refusal or a timeout never blanks a live page"
  - "hard-reload-channel runs first in verify-nav-keys-live so a pre-existing GUI-02 reload defect (5th+ same-site tab) cannot confound the bypass-cache check; the defect is logged in deferred-items.md"

patterns-established:
  - "A new push kind needs an onPush subscriber in tab-uris or chrome-bar (and vice versa), or verify-web-tab-bridge goes red naming it"
  - "A new handleWebTabAction arm needs a WEB_TAB_ACTION_KINDS member and a KIND_CLASSES entry"

requirements-completed: [NAV-02, NAV-03, NAV-06]

coverage:
  - id: D1
    description: "webTabHistory returns the windowed history as primitives; webTabGotoIndex jumps and refuses an out-of-range index"
    requirement: NAV-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario history-channel"
        status: pass
  - id: D2
    description: "webTabActivated reaches chrome on each current change (null for Settings); the coalesced push still drives the pill"
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario activation"
        status: pass
  - id: D3
    description: "reload(true) sends Cache-Control/Pragma no-cache; a plain reload does not"
    requirement: NAV-02
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario hard-reload-channel"
        status: pass
  - id: D4
    description: "openInBackground places the new tab directly after the reference tab and keeps the current tab current"
    requirement: NAV-06
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario background-open"
        status: pass
  - id: D5
    description: "Bridge gate goes red on push-kind, action-routing and classification drift"
    verification:
      - kind: other
        ref: "node scripts/verify-web-tab-bridge.mjs --self-test (14 plants, 4 new)"
        status: pass

duration: 37min
completed: 2026-10-20
---

# Phase 27 Plan 02: History, selection, coalesced state, hard reload and background open on the web-tab channel Summary

**The chrome boundary file now serves the session-history read and jump, records the selected web tab per Theia frame, coalesces state pushes to one per tab per animation frame, and hard-reloads with Firefox's kSkipCacheFlags. The frontend has `history()`, `gotoIndex()`, `reload(bypassCache)`, `openInBackground` and a selection contribution. The bridge gate now derives push kinds, action kinds and kind classes, and goes red when any of them drift.**

## Performance

- **Duration:** about 37 min
- **Started:** 2026-10-20T22:49:45Z
- **Completed:** 2026-10-20T23:26:13Z
- **Tasks:** 3
- **Files modified:** 7 code files, plus one created `.planning` file

## Accomplishments

- NAV-03 mechanism: the history arm reads `browsingContext.sessionHistory` and builds Firefox's FillHistoryMenu 15-entry window, returning `{index, title, url}` primitives in the request's own reply. Neither new arm logs a URL or title. `gotoIndex` checks the index is an integer in range on the chrome side.
- Selection: `webTabActivated` arrives on every `mainPanel.onDidChangeCurrent`, deduped, and is null for a non-web widget. Chrome keys it by the sender's embedder element. `activeTabIdOf` reads it.
- Coalescer: the three `webTabOpen` push sites call `scheduleWebTabState(` on the same lines. The flush is the only caller of `webTabPush(`, and it skips a tab whose overlay is gone.
- The quit flush runs through the router. `ng-033` and `ng-034` still PASS.
- NAV-02 and NAV-06 mechanisms, the two written rules, one catalogue row, and three new bridge rules, each with a plant.

## Task Commits

1. **Task 1 (tracer): read a tab's session history and jump to an entry** - `f1966be` (feat). The tracer gate re-ran `<verify>` end to end and it passed before any expansion.
2. **Task 2: selected-tab signal, coalesced state push, quit flush on the router** - `aa01468` (feat)
3. **Task 3: hard reload, background open, boundary rules, bridge parity** - `154cadf` (feat)

## Assumption A7 (requested by the plan's output section)

`theiaBrowser.ownerDocument.defaultView.requestAnimationFrame` flushed pushes in the live session, which `firefox-bidi.mjs` launches with `--headless`. Every scenario that waits on a state push passed: `activation`, `history-channel`, `esc-stop`, `stop-button`, `gui02-web-tab-live`, `ng-033` and `ng-034`. The `setTimeout(flush, 16)` fallback was not needed and is not in the tree.

## Verification run

- `scripts/verify-platform.sh --quick`: PASS after each task and at the end.
- `node scripts/verify-nav-keys-live.mjs`: PASS for `hard-reload-channel`, `esc-stop`, `theia-keeps-esc`, `stop-button`, `history-channel`, `activation` and `background-open`.
- `node scripts/verify-nav-keys-live.mjs --self-test`: PASS. The clean control is green, and the 3 plants go red on their targets.
- `node scripts/verify-web-tab-bridge.mjs` (+ `--self-test`, 14 plants, all red by name): PASS.
- `verify-ng-040-internals-catalogue-lines`, `check-internals-boundary --catalogue`, `tsc --noEmit -p theia/extensions/tab-uris`, `scan-brand-residue`, and `diff-theia-core` (in `nix develop .#theia`): PASS.
- `scripts/verify-platform.sh --only gui02-web-tab-live`, `--only ng-033-layout-survives-relaunch`, `--only ng-034-web-tab-history-survives-restart`: PASS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] History read and jump would have blanked the page on a refusal**
- **Found during:** Task 1
- **Issue:** the plan wrote `history()`/`gotoIndex()` as `this.settle(...)` "like `back()`". `settle()` folds any `ok !== true` reply into lost view, so the planned `gotoIndex(99)` validation refusal, or a timeout, would have replaced a live page with the "can't show this page" surface.
- **Fix:** I added `settleUnknownTab()`, which folds only `unknown-tab`, the way `publish()` already does. The `lost-reply` gate allows it (bare `true` argument), and the reopen comment now names it.
- **Files modified:** `theia/extensions/tab-uris/src/browser/web-tab.ts`
- **Commit:** f1966be

**2. [Rule 3 - Blocking] The activation check read chrome's `null` as `undefined`**
- **Found during:** Task 2
- **Issue:** the BiDi result reader returns `undefined` for a `null` chrome-scope result, so the Settings-is-null assertion could never pass.
- **Fix:** the scenario reads `activeTabIdOf` as JSON. This was a check defect, not a product defect.
- **Commit:** aa01468

**3. [Rule 3 - Blocking] `hard-reload-channel` was confounded by a pre-existing GUI-02 defect**
- **Found during:** Task 3, full live run (deterministic in full order, green alone)
- **Issue:** see Deferred Issues. A plain reload of the session's fifth or later same-site tab lands on `about:blank`, so the scenario saw no GET in either direction.
- **Fix:** `hard-reload-channel` runs first, on the session's first tab, with a comment that explains why. Both directions (no-cache present, then absent) are still observed by the server.
- **Files modified:** `scripts/verify-nav-keys-live.mjs`
- **Commit:** 154cadf

### Minor

- The coalescer declares `function scheduleWebTabState(frame, ...)` so that the plan's acceptance grep (`scheduleWebTabState(theiaBrowser, tabId, browser` counts 3) counts only the three call sites.
- Adding the bypass branch inside `webTabReload` shifted 13 catalogued lines below it. `--fix` re-pointed them, and the one new row is at the end of the table.
- `openUrl` and `openInBackground` share a protected `createWidget` that mints the id. `openUrl`'s behaviour is unchanged.
- `functionBody` in the bridge gate now accepts `async function`, because `handleWebTabAction` is async.

## Deferred Issues

- **Reload of a web tab that shares a content process blanks the page (pre-existing, GUI-02).** Four same-site tabs come first, so the fifth shares a webIsolated process with the first (`dom.ipc.processCount.webIsolated` = 4). Reloading that tab switches the overlay to remoteType `web` at `about:blank`: browsing context 14 is kept and the childID changes from 7 to 15. It reproduced in 3 of 4 scratch runs at N=4 and never at N=0. Plain reload's path is unchanged by this plan, so 27-02 did not cause it. Details are in `deferred-items.md` in this phase directory. Recording it in `.planning/WINDOWS.md` failed: `gsd-tools windows append` refused because the ledger table already disagreed with its JSON for rows 10, 11 and 19. Those rows predate this plan, so I did not edit them.

## Known Stubs

None.

## Threat Flags

None. Every new surface is in the plan's threat model (T-27-05 to T-27-09).

## Self-Check: PASSED

- FOUND: powerbrowser/shell/PowerBrowserAPI.sys.mjs, powerbrowser/INTERNAL-APIS.md, theia/extensions/tab-uris/src/browser/web-tab.ts, theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts, theia/extensions/tab-uris/src/browser/profile-storage.ts, scripts/verify-web-tab-bridge.mjs, scripts/verify-nav-keys-live.mjs, deferred-items.md
- FOUND commits: f1966be, aa01468, 154cadf (ancestors of HEAD)
