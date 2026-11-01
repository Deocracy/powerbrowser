---
phase: 36-new-window-links-as-web-tabs
plan: "01"
subsystem: chrome-boundary
tags: [new-window, browserDOMWindow, openLinkIn, adopt, pending-overlay, web-tabs, static-gate]
status: complete
requires:
  - phase: 27-groundwork-navigation-buttons-and-page-focus-keys
    provides: sendWebTabPush, tabIdOfBrowser, groupSenderIsTheia, KIND_CLASSES and push-kind parity in the bridge gate
  - phase: 01-platform-extraction-and-rename
    provides: openStockTab (delayed-startup-safe), the GUI-01 stock-window fall-through
provides:
  - PowerBrowserAPI.installNewWindowReceivers(win) -- `win.browserDOMWindow = {` (full nsIBrowserDOMWindow member set) and `win.openLinkIn`
  - PowerBrowserAPI.openAdoptedWebTab(openerBrowser, url, { inBackground, triggeringPrincipal }) -- the public open-as-adopted-tab path (Phase 37) (Post-merge correction (2026-11-01): removed. Phase 37's Allow replays the page's own window.open through popupAndRedirectBlocker.unblockPopup, so the receivers adopt it.)
  - webTabOpen pending mode (opener remoteType, openWindowInfo before append, returns the element) and PowerBrowserAPI.webTabAttach (the split registration half)
  - end-of-file adopt section -- adoptContentWindow, adoptLinkIn, createPendingOverlay, adoptFallback, adoptPendingOverlay; pc-<n> pending table; adoptTab and dropAdoptedTab pushes; 5 s openStockTab fallback
  - case "webTabAdopt" in handleWebTabAction (routed through WEB_TAB_ACTION_KINDS)
  - frontend WebTabOpenHandler.adopt / dropAdopted with onPush('adoptTab') and onPush('dropAdoptedTab'); WebTabMessage gains webTabAdopt
  - scripts/verify-new-window-adopt.mjs with --self-test (16 plants), registered in --quick
affects:
  - 36-02 (its Task 1 frontend adopt landed here -- verify, do not re-implement; ack must precede addWidget)
  - 36-03 (live adopt scenarios run against this chrome half)
  - 35 merge (add the browserDOMWindow IDL_SHIMS entry, below)
  - 37 (Allow on a blocked popup calls PowerBrowserAPI.openAdoptedWebTab) (Post-merge correction (2026-11-01): stale. 37 uses the unblockPopup replay; openAdoptedWebTab no longer exists.)
tech-stack:
  added: []
  patterns:
    - one overlay factory -- webTabOpen's attribute literal builds both frontend-opened and adopted overlays (pending mode), so the two can never drift
    - registration split -- webTabAttach is the shared entry/row/listener/table half; tabHostAddTab stays webTabOpen's alone
    - ack before attach -- chrome moves pc-<n> to the widget's id before the widget attaches, so the widget's own webTabOpen answers already-open
key-files:
  created:
    - scripts/verify-new-window-adopt.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/powerbrowser.js
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-page-tools-print-save.mjs
    - scripts/verify-shell-error-contract.mjs
    - scripts/verify-platform.sh
key-decisions:
  - "The pending overlay is built by webTabOpen in pending mode, not by a second attribute literal: verify-ext-tab-host-scope.mjs allows exactly one messagemanagergroup write (webTabOpen's overlay literal) and exactly one tabHostAddTab call (inside webTabOpen)."
  - "webTabOpen's registration half moved verbatim into a new literal member webTabAttach; an adopted overlay is registered there on the webTabAdopt ack, under the frontend's wt-* id with row key web:<wt-id>. pc-<n> never reaches a store row."
  - "Listeners attach at the ack, not while pending; the pending entry holds the element strongly in pendingContent until the ack or the 5 s fallback, and the ack schedules one settled state push so the widget gets the page's current url and title."
  - "The frontend acks webTabAdopt BEFORE addWidget: WebTabWidget.onAfterAttach sends webTabOpen for its own id, which would otherwise build a second overlay and load the URL again."
  - "openURIInFrame does not load (both InFrame members share adoptContentWindow, as the plan states). Stock openURIInFrame loads a given URI, but the pinned tree has no caller of it; ContentParent.cpp calls only CreateContentWindowInFrame."
  - "A refused scheme on the InFrame path returns null to Gecko (its own new-window path, today's behaviour), never an overlay; adoptLinkIn and openAdoptedWebTab return the outcome word refused-scheme."
  - "adoptLinkIn sends where values other than tab/tabshifted to openStockTab, so a link open is never swallowed; a missing or system triggering principal becomes a fresh null principal."
  - "KIND_CLASSES gains webTabAdopt only. adoptTab and dropAdoptedTab are chrome->frontend push kinds; adding dropAdoptedTab to KIND_CLASSES would go red as a stale entry (the map is compared with case arms)."
patterns-established:
  - "A new nsIBrowserDOMWindow member upstream goes red in new-window-adopt as UNIMPLEMENTED browserDOMWindow.<member>."
requirements-completed: []
duration: "about 20 min of editing after the read-in (start stamp taken after reading the plan and context)"
completed: "2026-10-31"
commits: 4
plan_head_before: 23c08bb5dd176949f619cf8781cf34fb54c74f6d
plan_head_after: 227856df85e517bad7fcce9d703cba22b4e1f517
actuals:
  tokens: 40881
  tasks: 3
  commits: 4
---

# Phase 36 Plan 01: New-window receivers and pending-overlay adopt (chrome half) Summary

**The shell window now carries a full nsIBrowserDOMWindow receiver and an openLinkIn companion behind the boundary. A page in a web tab that opens a new window gets a pending overlay chrome-first. The frontend mints the widget next to the opener and acks. A 5 s fallback opens the page in the stock window. Theia and print openers fall through to Gecko's own window. A new derive-and-compare gate holds all of this in --quick.**

## Status

The plan is **complete for its static scope**. Every behaviour is proven statically only. The live proof belongs to plan 36-03 (see Deferred Items). One task element was skipped by owner ruling: the `browserDOMWindow` `IDL_SHIMS` entry in `verify-shell-gbrowser-standin.mjs`, because Phase 35's shim comparison has not merged into this tree.

## Performance

- **Tasks:** 3 of 3, plus one deviation commit (the frontend adopt half).
- **Commits:** 4 code commits (`e185f319`, `08e1fd55`, `049fe84f`, `227856df`), plus this SUMMARY commit.
- **Realized diff:** about 40,881 tokens by the chars/4 estimate (plan estimate 70,000). 10 files, 866 insertions, 139 deletions.

## Accomplishments

- **Receiver (PROMPT-05).** `PowerBrowserAPI.installNewWindowReceivers(win)` assigns `win.browserDOMWindow = {` with `QueryInterface: ChromeUtils.generateQI(["nsIBrowserDOMWindow"])` and the six IDL members, with verbatim signatures. `createContentWindowInFrame` and `openURIInFrame` delegate to `adoptContentWindow`. `createContentWindow` and `openURI` return null. `canClose()` returns true and `tabCount` returns 1. `win.openLinkIn = (url, where, params) => adoptLinkIn(url, where, params)`. `powerbrowser.js` makes the one call `PowerBrowserAPI.installNewWindowReceivers(window);` and spells neither name.
- **Null fall-through (GUI-01).** `adoptContentWindow` first tests `tabIdOfBrowser(opener) === null || aWhere === OPEN_PRINT_BROWSER` and returns null with nothing created. Gecko then opens its own window (`ContentParent.cpp:5505-5508`), which is the stock window the GUI-01 command still reaches.
- **Pending overlay.** `createPendingOverlay` applies the scheme wall before any element exists. It then calls `PowerBrowserAPI.webTabOpen(theiaBrowser, null, pcKey, spec, null, { remoteType: opener.remoteType, openWindowInfo })`. That call uses the same attribute literal, sets `browser.openWindowInfo = openWindowInfo` before `appendChild`, and returns the element with no entry, row, listener or load. The overlay is registered under `pc-<n>`, the function pushes `{ kind: "adoptTab", pcKey, openerTabId, url, background }`, and it arms the 5 s fallback.
- **Split load rule.** The InFrame path issues no navigation. `adoptLinkIn` loads through the new overlay's docshell: `browser.loadURI(Services.io.newURI(spec), { triggeringPrincipal })`.
- **Ack and sweep.** `case "webTabAdopt"` checks `webTabIdIsValid`, the `/^pc-[0-9]+$/` shape and (through `handleWebTabAction`) `groupSenderIsTheia`. On a valid ack it moves the entry to the frontend id through `webTabAttach` and replies `opened`. An unknown key, or a key minted by another shell window, replies `unknown-tab` and pushes `{ kind: "dropAdoptedTab", tabId }`. An id that is already open is refused with `validation`.
- **Fallback.** With no ack within 5 s, the pending overlay is removed and the page (its live http(s) location, else the requested URL) opens through `openStockTab`. That path waits for a stock window still starting. A shell window that has already closed opens nothing.
- **Frontend half (deviation).** `WebTabOpenHandler` is bound as a `FrontendApplicationContribution` and subscribes both pushes at startup. `adopt()` validates the payload, mints the widget, acks before attaching it, then inserts it `tab-after` the opener and activates it only for a foreground open. If the opener has closed, the tab is added at the end.
- **Gate.** `verify-new-window-adopt.mjs` and its `--self-test` are registered in `--quick`. The 16 planted faults each go red naming the drift.

## Derived IDL member set (A-05 check)

Re-derived from `upstream/dom/interfaces/base/nsIBrowserDOMWindow.idl` at the pinned `FIREFOX_153_5_0esr_BUILD1`:

| Member | Line |
|---|---|
| `createContentWindow` | 139 |
| `createContentWindowInFrame` | 153 |
| `openURI` | 171 |
| `openURIInFrame` | 186 |
| `canClose` | 196 |
| `tabCount` | 202 |

Call sites on a `browserDOMWindow` receiver in upstream JS, test directories excluded: `browserDOMWindow.openURI` at `browser/components/BrowserContentHandler.sys.mjs:1281` and `uriloader/exthandler/WebHandlerApp.sys.mjs:167`. Both are inside the IDL set. There is no call site under `powerbrowser/shell` outside the boundary. **No A-05 drift.** The line numbers match ARCHITECTURE.md section 5a and the plan.

## Pending attribute set vs webTabOpen

The two sets are identical by construction, because the pending overlay is built by webTabOpen's own literal: `type: content`, `remote: true`, `remoteType`, `maychangeremoteness: true`, `manualactiveness: true`, `messagemanagergroup: browsers`, `tabindex: -1`. The only difference is the value of `remoteType`: it is the opener's (`pending?.remoteType || "web"`, per `tabbrowser.js:4249-4251`), where a frontend-opened tab gets `"web"`. The pending path also sets `openWindowInfo` before append. The gate asserts that the adopt section sets and removes no attribute of its own and builds no element.

## Task Commits

1. **Task 1: receivers, pending overlay, adopt arms, fallback:** `e185f319`
2. **Task 2: static adopt gate with self-test:** `08e1fd55`
3. **Deviation: frontend adopt half:** `049fe84f`
4. **Task 3: bridge classification and registry rows:** `227856df`

## Files Created or Modified

- `powerbrowser/shell/PowerBrowserAPI.sys.mjs`: webTabOpen pending mode, the `webTabAttach` split, the two literal members, the `webTabAdopt` arm and routing, and the end-of-file adopt section that ends with `// Phase 36: new-window adopt section end.`
- `powerbrowser/shell/powerbrowser.js`: the one installer call.
- `powerbrowser/INTERNAL-APIS.md`: line references remapped through the boundary diff. Seven rows whose lines moved into `webTabAttach` now name it. Ten Phase 36 rows were appended.
- `theia/extensions/tab-uris/src/browser/web-tab.ts`, `tab-uris-frontend-module.ts`: the frontend adopt half.
- `scripts/verify-new-window-adopt.mjs`: the new gate.
- `scripts/verify-web-tab-bridge.mjs`: the `webTabAdopt` entry in `KIND_CLASSES`, plus its plant.
- `scripts/verify-page-tools-print-save.mjs`: the D-09a rule is now derived for the receiver.
- `scripts/verify-shell-error-contract.mjs`: a harness stub for the new bootstrap call.
- `scripts/verify-platform.sh`: rows `new-window-adopt` and `new-window-adopt-self-test`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The pending overlay could not have its own attribute literal**
- **Found during:** Task 1, reading the gates over webTabOpen
- **Issue:** `verify-ext-tab-host-scope.mjs` allows one `messagemanagergroup` write (webTabOpen's overlay literal) and one `tabHostAddTab` call (inside webTabOpen). A second literal in the adopt section would turn that row red.
- **Fix:** webTabOpen gained a `pending` parameter and is the adopt path's factory. Its registration half moved verbatim into `webTabAttach`. The gate checks one factory instead of a superset of attributes.
- **Commit:** `e185f319`

**2. [Rule 3 - Blocking] Catalogue `--fix` misassigned rows**
- **Issue:** after the insertions, `verify-ng-040-internals-catalogue-lines.mjs --fix` assigned rows to the nearest line with the same token, which was a different occurrence.
- **Fix:** every row was remapped from the committed catalogue through a difflib line map of the boundary diff. Seven rows were re-pointed to `webTabAttach`, and Phase 36 rows were appended. ng-040, `--catalogue` and the boundary self-test all pass.
- **Commit:** `e185f319`

**3. [Rule 3 - Blocking] Phase 32's print gate forbade the receiver outright**
- **Issue:** `verify-page-tools-print-save.mjs` banned `browserDOMWindow`, `OPEN_PRINT_BROWSER` and `nsIBrowserDOMWindow` from the boundary file (D-09a, "no browserDOMWindow shim"). Phase 36 D-07 adds the receiver and requires print to answer null.
- **Fix:** in the boundary file those three names are now checked by a derived rule. Every `OPEN_PRINT_BROWSER` use must be the `Ci` destructure or an `if` that returns null, and a receiver in the file requires that guard. They stay forbidden in every other shell file. A new plant ("print location adopted") goes red naming `print location`.
- **Commit:** `e185f319`

**4. [Rule 3 - Blocking] The error-contract harness stubs every boundary member**
- **Issue:** `verify-shell-error-contract.mjs` throws on any unstubbed `PowerBrowserAPI` member that the bootstrap reaches.
- **Fix:** added `installNewWindowReceivers: () => {}` beside the other bootstrap stubs.
- **Commit:** `e185f319`

**5. [Rule 3 - Blocking] The bridge gate cannot be green with the chrome half alone**
- **Issue:** `verify-web-tab-bridge.mjs` always compares chrome `case "webTab…"` arms with the frontend's `kind: 'webTab…'` literals, and chrome pushes with frontend `onPush` subscriptions. With chrome alone it reports `webTabAdopt` as never sent, and `adoptTab` and `dropAdoptedTab` as never subscribed. `page-tools-reader-crash` also requires every arm to be a union member. The plan's claim that parity could wait for 36-02 does not hold for a gate in `--quick`.
- **Fix:** landed 36-02 Task 1's frontend half as written in 36-02-PLAN, with one correction: the ack precedes `addWidget` (see Decisions).
- **Commit:** `049fe84f`

**6. [Plan inconsistency] `dropAdoptedTab` is not added to KIND_CLASSES**
- **Issue:** the plan adds both `webTabAdopt` and `dropAdoptedTab`. `KIND_CLASSES` is compared with case arms, and `dropAdoptedTab` is a push kind, so the entry would go red as stale. This is the same reasoning the plan gives for `adoptTab`.
- **Fix:** added `webTabAdopt` only, with one plant. The push kinds are covered by push-kind parity.
- **Commit:** `227856df`

### Scope Deviations

- **IDL_SHIMS entry skipped (owner ruling).** Phase 35's shim comparison (`IDL_SHIMS`, `SHIM_ABSENT`, the shim-name derivation) has not merged into this tree. The entry is a deferred merge item (below). Coverage is not lost, because `new-window-adopt` already compares the IDL set. Post-merge correction (2026-11-01): closed by the "Merge into main" section in 36-02-SUMMARY, which added the entry.
- **Self-test plants use in-memory source copies** (the print-save gate's shape) instead of mkdtemp copies. The tree is never written.
- **Adopted overlays do not enter the Phase 31.1 tab host.** `tabHostAddTab` stays webTabOpen's only call, and `makeTabNode` hard-codes `openerTab: null`. There is no TabOpen-with-openerTab entry point (assumption A-01 is false). RESEARCH A-01's fallback applies: adopted tabs work as plain overlays, and extensions do not see them yet. Post-merge correction (2026-11-01): reversed. `adoptPendingOverlay` now calls `tabHostAddTab(win, tabId, pending.browser, pending.opener)` after `webTabAttach` (37-REVIEW CR-01), so adopted tabs join the tab host and extensions see them.

## Deferred Items

1. **Phase 35 merge: add the `browserDOMWindow` IDL_SHIMS entry** to `scripts/verify-shell-gbrowser-standin.mjs`. Map `browserDOMWindow` to `upstream/dom/interfaces/base/nsIBrowserDOMWindow.idl`. Reason text: Gecko C++ calls it through the chrome window, on the remote path at `ContentParent.cpp:5430,5451,5490` and the in-process path at `nsContentTreeOwner.cpp:524,550`. REQUIRED members are the IDL's six members (`:139,153,171,186,196,202`) plus JS call sites on a `browserDOMWindow` receiver. Plant: a staged boundary copy whose shim drops `canClose` must go red naming `UNIMPLEMENTED browserDOMWindow.canClose`. `openLinkIn` stays out of `IDL_SHIMS` (it is function-valued). The literal is already spelled `win.browserDOMWindow = {` with `QueryInterface` as a member, so 35's `objectLiteralMembers` reads it. Note that 35's parser, as it exists today for ZOOM_SHIMS, would also collect `generateQI` from the `QueryInterface:` value. The 35 comparison must skip identifiers in value position, as this plan's gate does. Post-merge correction (2026-11-01): closed by the "Merge into main" section in 36-02-SUMMARY.
2. **Live proof (plan 36-03).** None of the following has been run: Gecko accepting the returned element (frameloader remote tab, no double load), a working `window.opener` (postMessage round trip), popup-features windows staying stock windows, background versus foreground focus, the 5 s fallback, the unknown-key sweep, and the GUI-01 rows with the receiver installed.
3. **36-02 overlap.** 36-02 Task 1 (`adopt`, `dropAdopted`, both subscriptions, the union member) is in `049fe84f`. The 36-02 executor should verify it and not re-implement it. 36-02-PLAN's order (`addWidget`, then activate, then `request webTabAdopt`) would build a second overlay through the widget's own `webTabOpen`. The ack must come first.
4. **Tab-host follow-up (31.1 side).** Adopted overlays need a TabOpen with `openerTab` set, through a sanctioned second `tabHostAddTab` path or an amended `verify-ext-tab-host-scope.mjs` rule. Post-merge correction (2026-11-01): closed by 37-REVIEW CR-01 (`tabHostAddTab` from `adoptPendingOverlay`).
5. **openLinkIn has no stock caller in the shell.** BrowserGlue is not loaded, so ClickHandler is not registered. The path is reachable only through `openAdoptedWebTab` or a future context menu (Phase 35). Middle-click on a link in an overlay does not reach it yet. Post-merge correction (2026-11-01): `openAdoptedWebTab` is gone; Phase 37's Allow reaches the receivers through the `unblockPopup` replay.
6. **Late-ack edge.** If the frontend's 5 s request times out but chrome did adopt, the frontend sends `webTabClose` and drops the widget, and the page is not reopened. This is rare, because the frontend and chrome share one process.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-public-entry | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `openAdoptedWebTab` is a chrome-only literal member (not reachable from the actor channel). It applies the same opener and scheme walls and replaces a missing or system principal with a null principal. | Post-merge correction (2026-11-01): `openAdoptedWebTab` was removed; the entry no longer exists.

## Verification

- `node scripts/verify-new-window-adopt.mjs`: PASS. `--self-test`: PASS, 16 plants red.
- `node scripts/verify-web-tab-bridge.mjs` and `--self-test`: PASS, 33 plants red.
- `node scripts/verify-page-tools-print-save.mjs` and `--self-test`: PASS, 12 plants red.
- `node scripts/verify-ng-040-internals-catalogue-lines.mjs`, `bash scripts/check-internals-boundary.sh`, `--catalogue` and `--self-test`: all PASS.
- `scripts/verify-platform.sh --quick`: every row PASS except `gui07-strip-spike-verdict` and `gui07-strip-spike-verdict-self-test`. Both fail on the environment: `diff-theia-core.sh` stage 1 runs `yarn check --integrity`, which fails with "Flags don't match" against this worktree's `theia/` install, and outside a dev shell `yarn` is not on PATH. No file under `theia/node_modules`, any package manifest or the lockfile is touched by this plan. `tab-uris-typecheck`, `chrome-bar-typecheck` and the gui09 rows pass now that the sidecar is built.

## Self-Check: PASSED

- Files: `scripts/verify-new-window-adopt.mjs` present. Every modified file is in the commits above.
- Commits: `e185f319`, `08e1fd55`, `049fe84f` and `227856df` are each an ancestor of HEAD (`git merge-base --is-ancestor`).
