---
phase: 38-webextensions
plan: "01"
subsystem: chrome-boundary
tags: [webextensions, extension-actions, tab-host, tabs-bridge, adoption, static-gate, live-harness]
status: complete
live_proof: deferred
requires:
  - phase: 31.1-extension-tab-host
    provides: the tab host (selected, byBrowser/byTabId, hidden strip firing TabOpen/TabSelect/TabClose/TabAttrModified, patch 050)
  - phase: 36-new-window-tabs
    provides: createPendingOverlay, the adoptTab/webTabAdopt/closeAdoptedTab adoption shape
  - phase: 29-address-bar-search-and-fixup
    provides: the store request channel (STORE_REQUEST_KINDS, handleStoreRequest, rule 12 classes)
provides:
  - Phase 38 end-of-file extension section in PowerBrowserAPI.sys.mjs (extensionAction push, store kinds extensionActionsSubscribe/extensionClick/extensionPin/extensionRemove, tabsBridgeCreate/Remove/Activate)
  - the one click path triggerClickOrPopup(selectedTab)
  - host members addTab/removeTab/selectTab behind the gBrowser stand-in's addTab/removeTab/removeTabs/selectedTab setter
  - WebTabChannel.extensionActions + onDidChangeExtensionActions (validated ExtensionActionRow[]) and ChromeStoreClient extension methods
  - selectTab push and its WebTabOpenHandler subscriber
  - scripts/verify-extension-actions.mjs (6 rules, --self-test, 6 plants) and scripts/lib/pb-extension-fixtures.mjs
  - scripts/verify-extension-actions-live.mjs (popup-action, tabs-bridge; 2 live plants; static --self-test with 3 audit plants)
affects:
  - 38-02 (buttons, puzzle menu and popup panel render onDidChangeExtensionActions and call the ChromeStoreClient methods; PRIVILEGED_CALLERS must admit the widget file)
  - 38-03 (pageActionShown joins the extensionAction row; the page-action icon sends extensionClick)
  - 38-04 (sidebar fields join the row; tab pages go to the stock window, never tabsBridgeCreate)
  - 38-05 (install pushes through the ready listener already in place)
tech-stack:
  added: []
  patterns:
    - subscribe store kind making the sending frame the push target (the downloads-subscribe shape)
    - whole-set push deduplicated by JSON, newest read wins (sequence guard)
    - host node minted at addTab time and named by the later adoption ack
key-files:
  created:
    - scripts/verify-extension-actions.mjs
    - scripts/verify-extension-actions-live.mjs
    - scripts/lib/pb-extension-fixtures.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/powerbrowser.js
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-ext-tab-host-scope.mjs
    - scripts/verify-shell-gbrowser-standin.mjs
    - scripts/verify-new-window-adopt.mjs
    - scripts/verify-platform.sh
key-decisions:
  - "Action state is pushed after a subscribe store kind (extensionActionsSubscribe, class read): without it a frontend that loads after the first tab event, or a shell with zero overlays, never gets a push."
  - "The push carries the whole set ({kind:'extensionAction', actions:[{extensionId,title,icon,badgeText,enabled,hasPopup,pinned}]}); icon is a data:image/ URL read chrome-side with ExtensionUtils.makeDataURI, or null."
  - "tabsBridgeCreate/Remove/Activate are chrome functions behind the host's addTab/removeTab/selectTab members, not wire kinds: no Theia caller exists, so no KIND_CLASSES rows were added."
  - "tabs.create mints the host node at once (the caller reads the tab back synchronously) and the Phase 36 adoptTab push, deferred one microtask, lets tabs.create's selectedTab write foreground it."
  - "The pinned set is the pref powerbrowser.extensions.pinned (JSON id array)."
patterns-established:
  - "A store kind that changes chrome state outside a tab is privileged and needs only its same-named ChromeStoreClient method until its widget lands."
requirements-completed: []
duration: "not measured"
completed: "2026-11-01"
commits: 3
plan_head_before: ead9bf16d6b9e0cbe1937b9386a45ecdec01f775
plan_head_after: 8edac7605ad2f6cef3b21f2aa8e09613f0d971bf
actuals:
  tokens: 41532
  tasks: 3
  commits: 3
---

# Phase 38 Plan 01: Extension action-state push, the one click path and the tabs bridge Summary

**Chrome now reads every running extension's browser action for the 31.1 host's selected tab and pushes the whole set to Theia. A click runs `triggerClickOrPopup(selectedTab)` and nothing else. An extension's `tabs.create`, `tabs.remove` and selection writes mint, close or select an overlay that the frontend claims through the Phase 36 adoption shape. Every static gate is green; both live scenarios are written and deferred.**

## Status

Complete for every static criterion. `nix develop .#theia --command scripts/verify-platform.sh --quick` exited 0 after each task and on the final HEAD. `cd theia && yarn build` passed after Tasks 2 and 3. **The live proof is deferred** to the end-of-milestone live pass: there is no objdir, so no binary can run.

EXT-06 and EXT-07 are not marked complete. Their live truths are unproven, and two of them need a patch 050 change first (see "Blocked on patch 050" below).

## Accomplishments

- **Gate first (Task 1).** `verify-extension-actions.mjs` derives the fixture set from `scripts/lib/pb-extension-fixtures.mjs`, the module the live file installs from. It bans a fixture-id literal and the stock delegate's trigger-action call in every product source, holds `messagemanagergroup` to the two 31.1 host sites, and requires every `extension*` store kind and `tabsBridge*` action kind to be classified (click, pin and remove are privileged, per D-11). Task 2 flipped the `PRESENCE_ASSERTION_TODO` switch (`BRIDGE_LANDED`). Since then the gate requires exactly one `triggerClickOrPopup(` call, spelled `triggerClickOrPopup(selectedTab)`, with no `tabTracker` or `getTabForBrowser(` in the section, and it requires the live file.
- **Action-state push (Task 2, D-03).** `extensionActionsSubscribe` makes the sending frame the push target and pushes at once. Later pushes follow the host strip's TabOpen, TabSelect, TabClose and TabAttrModified events, and `apiManager` `ready`/`shutdown` (install, enable, disable, remove). Each extension's row is read through `action.getContextData(host.selected)`. A set identical to the last one is not re-sent, and a slower read never overwrites a newer one.
- **Click path (Task 2, EXT-07).** `extensionClick` resolves the extension from the running set and calls `named.action.triggerClickOrPopup(selectedTab)` on the host's selected tab. While the IDE has focus that is still the last web tab (sub-ruling 1). It answers `popup`, `action`, `disabled` or `no-tab`. The popup URL stays in chrome for 38-02's panel.
- **Pin and Remove (Task 2, D-08).** `extensionPin {extensionId, pinned}` writes the pref. `extensionRemove {extensionId}` refuses built-in or uninstall-locked add-ons (`PERM_CAN_UNINSTALL`), drops the id from the pinned set, and uninstalls. The extension's shutdown then pushes the set without it.
- **Tabs bridge (Task 3, D-06).** The host's `refuse` accessor became `addTab`, `removeTab` and `selectTab`. `tabsBridgeCreate` refuses any non-http(s) URL before any element exists, builds the pending overlay next to the opener through `createPendingOverlay`, mints its host node at once (`tabHostAddTab(host.win, null, browser, opener)`), and loads the page with the extension's principal. The adoption ack then names that node. `tabsBridgeRemove` sends `closeAdoptedTab` for an adopted tab, and drops a pending one in chrome. `tabsBridgeActivate` selects the node and pushes `selectTab`; for a pending tab it clears the background flag before the adoptTab push leaves. `adoptFallback` drops a minted node along with its overlay.
- **Theia plumbing (no UI).** `WebTabChannel` validates each pushed row (an icon must be `data:image/` or null) and exposes `extensionActions` and `onDidChangeExtensionActions`. `ChromeStoreClient` gained `extensionActionsSubscribe`, `extensionClick`, `extensionPin` and `extensionRemove`. `WebTabOpenHandler` shows the tab a `selectTab` push names.

## Verification results (this lane)

| Check | Result |
|---|---|
| `node scripts/verify-extension-actions.mjs` (+ `--self-test`) | PASS (94 sources; control green, 6 plants red) |
| `node scripts/verify-extension-actions-live.mjs --self-test` / `--static` | PASS (2 live plants audited; 3 audit plants red) |
| `node scripts/verify-web-tab-bridge.mjs` (+ `--self-test`) | PASS (62 plants) |
| `node scripts/verify-ext-tab-host-scope.mjs` (+ `--self-test`) | PASS (27 plants, one new) |
| `node scripts/verify-shell-gbrowser-standin.mjs` (+ `--self-test`) | PASS |
| `node scripts/verify-new-window-adopt.mjs` (+ `--self-test`) | PASS (22 plants) |
| `node scripts/verify-ng-040-internals-catalogue-lines.mjs` (normal mode; `--fix` never run) | PASS |
| `bash scripts/check-internals-boundary.sh` / `--catalogue` | PASS / PASS |
| `cd theia && nix develop ..#theia --command yarn build` | PASS after Task 2 and Task 3 |
| `nix develop .#theia --command scripts/verify-platform.sh --quick` | PASS after each task and on the final HEAD |
| `node scripts/verify-extension-actions-live.mjs --scenario popup-action,tabs-bridge` / `--self-test --live` | NOT RUN: no built binary (deferred) |

`grep -c "triggerClickOrPopup(selectedTab)" powerbrowser/shell/PowerBrowserAPI.sys.mjs` prints 1. The literal stock trigger string appears in neither `PowerBrowserAPI.sys.mjs` nor the gate. The gate assembles it from two parts; only the live plant driver spells it.

Restart note: only chrome JS changed under `powerbrowser/shell`. There is no `jar.mn` change, no new chrome file and no patch change, so the plan's own edits need no Gecko rebuild.

## Task Commits

1. **Task 1: the extension-actions gate before the bridge** — `965999ae` (test)
2. **Task 2: action-state push and the one sanctioned click path** — `ddbab7c5` (feat)
3. **Task 3: tabs.create/remove/update bridge with chrome-first adoption** — `8edac760` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] A subscribe kind for the push**
- **Found during:** Task 2
- **Issue:** The plan pushes only on host tab events. A frontend that loads after the last event, or a shell with zero overlays, would never receive the set, and 38-02 renders from pushes only.
- **Fix:** Added the store kind `extensionActionsSubscribe` (class `read`), in the downloads-subscribe shape. Extension `ready`/`shutdown` also push, so an install or a removal shows up without a tab event.
- **Commit:** `ddbab7c5`

**2. [Rule 3 - Blocking] Push-kind parity needs a frontend subscriber**
- **Found during:** Task 2
- **Issue:** `verify-web-tab-bridge` rule 9 fails a pushed kind that no frontend subscribes to. The privileged class also requires same-named `ChromeStoreClient` methods.
- **Fix:** Added a `WebTabChannel` subscriber (validated rows, emitter) and four client methods in tab-uris. This is plumbing for 38-02, not UI. `anchorRect` is not in `extensionClick` yet: 38-02 adds it together with the panel that reads it.
- **Commit:** `ddbab7c5`

**3. [Rule 3 - Blocking] tabs.create needs a node synchronously**
- **Found during:** Task 3
- **Issue:** `ext-tabs.js:809-834` uses `addTab`'s return value at once (`addTabReadyBlocker`, the `selectedTab` write, `tabManager.convert`). Host nodes existed only after the frontend's ack.
- **Fix:** `tabsBridgeCreate` calls `tabHostAddTab` with a null tab id. `tabHostAddTab` reuses that node when the ack arrives. `verify-ext-tab-host-scope.mjs` now admits exactly this third call site, passing the overlay `createPendingOverlay` returned, and has a new plant for it.
- **Commit:** `8edac760`

**4. [Rule 1 - Bug] Background flag decided before the selection write**
- **Found during:** Task 3
- **Issue:** `createPendingOverlay` pushed `adoptTab` synchronously, before `tabs.create`'s `selectedTab` write, so an active create would land in the background.
- **Fix:** The pending record carries `background`, and the push is sent one microtask later. The Phase 36 paths are unchanged in effect. `verify-new-window-adopt.mjs`'s plant anchor follows the new record literal.
- **Commit:** `8edac760`

**5. [Rule 2 - Missing functionality] removeTabs**
- **Found during:** Task 3
- **Issue:** `tabs.remove` with more than one id calls `gBrowser.removeTabs` (`ext-tabs.js:851`), which was deliberately absent.
- **Fix:** Implemented it on the stand-in, and moved it out of `DELIBERATELY_ABSENT`.
- **Commit:** `8edac760`

### Scope and structure deviations

- **Catalogue `--fix` not run.** The plan says to run `verify-ng-040 --fix`; the shared brief forbids that. Rows were renumbered by mapping `git diff -U0` hunks (moving the new kinds onto their own line kept the `verify-web-tab-bridge` plant anchor intact). 15 rows were appended. The normal-mode ng-040 check and `--catalogue` pass.
- **No `tabsBridge*` wire kinds and no KIND_CLASSES rows.** The tabs bridge is reached from the extension side (`gBrowser.addTab/removeTab/selectedTab=`), and no Theia caller sends such a kind. Adding wire kinds would open an unused Theia-to-chrome path. Rule 5 of the gate still classifies any future `tabsBridge*` kind as `tab-lifecycle`.
- **No new shim global or `gBrowser` member beyond `removeTabs`.** So `check-internals-boundary.sh` needed no new exemption. `removeTabs` lives inside the exempt literal.
- **Fixtures module.** `scripts/lib/pb-extension-fixtures.mjs` was added so that the gate (Task 1) and the live file (Task 2) read one source before the live file exists.
- **Live `--self-test` is static.** Per the brief, `--self-test` does not launch a browser. The live control and plant sessions are `--self-test --live`, registered as `extension-actions-live-self-test` in the full set, with `extension-actions-live-static` in `--quick`.
- **Badge in the live scenario.** popup-action asserts the page-side effect (retitle of `/a`) and the click record. It does not assert a badge push, because of the patch 050 gap below.

## Blocked on patch 050 (a 31.1 dependency, reported rather than re-implemented)

The plan assumes both of these behaviours from 31.1; neither is in patch 050. A patch change has to be regenerated from a patched upstream tree, and `upstream/` here belongs to the main checkout, so it was not touched.

1. **Badge/icon changes made by the extension are not pushed until the next tab event.** `ext-browserAction.js` `updateWindow` returns early for a tab host window (`:983`) and notifies nobody. `setBadgeText`/`setIcon` (`updateOnChange` → `updateWindow`) therefore never reach chrome. The fix is a 050 hunk in that skip that tells the shell (for example, a DOM event on the window that `extensionActionsSubscribe` listens for). The truth "re-read each time updateWindow runs" holds only after that hunk lands.
2. **`tabs.update(id, {active: true})` on another tab is still refused** by 050's WR-07 block in `ext-tabs.js` (`:878-887`, guard G10 in `verify-ext-tab-host-patch-guards.mjs`). Selection through `tabs.create({active})` works. The chrome side (`tabsBridgeActivate` plus the `selectTab` push and its subscriber) is in place; only the `(updateProperties.active && tabbrowser.selectedTab !== nativeTab)` clause and its G10 regex need to go. Until then, `tabs-bridge`'s activate step goes red live, by design.
3. **`tabs.create` with zero web tabs** throws in `ext-tabs.js:754` (`currentTab.linkedBrowser` on a null `selectedTab`). This needs the same null guard as 050's G3. With zero tabs there is no opener anyway, and `tabsBridgeCreate` refuses that case.

## Deferred to the end-of-milestone live pass

Prerequisites: regenerate patch 050 for items 1-2 above, then run `scripts/apply-patches.sh` and `MOZCONFIG=../.mozconfig ./mach build` from `upstream/` inside `nix develop .#firefox`, and write a fresh `objdir/.pb-050-build.sha256`. Build Theia with `nix develop .#theia --command bash -c 'cd theia && yarn build'`.

1. `node scripts/verify-extension-actions-live.mjs --scenario popup-action`
2. `node scripts/verify-extension-actions-live.mjs --scenario tabs-bridge`
3. `node scripts/verify-extension-actions-live.mjs --self-test --live` (clean control, then `wrong-page` must go red naming the stock tab, and `create-unadopted` must go red naming the orphan overlay)
4. The 31.1 regression set is still `node scripts/verify-ext-tab-host-live.mjs` (its toolbar-target and gui01 scenarios drive the stock path deliberately).

## Owner decisions

None taken. Patch 050 items 1-2 are the orchestrator's to schedule. Recommended: a 050 regeneration task inside Phase 38, before 38-02's live work.

## For 38-02 (buttons, puzzle menu, popup)

- **Push shape:** `{kind:'extensionAction', actions: ExtensionActionRow[]}`, where a row is `{extensionId, title, icon: string|null (data:image/ only), badgeText, enabled, hasPopup, pinned}`. It is always the whole set for the host's selected tab; an empty array means no extension has a toolbar action. Read it from `WebTabChannel.extensionActions` and `onDidChangeExtensionActions`. The `onPush('extensionAction')` subscription lives in `web-tab.ts`, so do not add a second subscriber to satisfy parity. Render `icon` only through `<img src>`: an SVG data URL must never be inlined.
- **Start:** call `ChromeStoreClient.extensionActionsSubscribe()` once on widget start, and again after a frontend reload. Chrome re-sends the whole set on every subscribe.
- **Kinds (store, D-11):** `extensionClick(extensionId)` resolves `'popup' | 'action' | 'disabled' | 'no-tab'`. `extensionPin(extensionId, pinned)` resolves `'pinned' | 'unpinned'`. `extensionRemove(extensionId)` resolves `'removed' | 'refused'`. All three are privileged: add the widget file to `PRIVILEGED_CALLERS` in `verify-web-tab-bridge.mjs` and call them only from event handlers, with no command id and no key row.
- **Popup:** on `'popup'`, `triggerClickOrPopup` has already run (activeTab granted, scripts activated) and the popup URL stayed in chrome. 38-02 T2 adds `anchorRect` to `extensionClick`. It should open the `PanelPopup` inside the `extensionClick` arm (`extensionClick(win, named)` in the Phase 38 section), right after the sanctioned call, keeping that one call.
- **Pinned set:** the pref `powerbrowser.extensions.pinned`; chrome sets `pinned` on each row.

## Known Stubs

None. The plumbing has no UI. Nothing renders placeholder data; 38-02 renders the pushed rows.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-store-kind | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `extensionActionsSubscribe` (read) is a store kind beyond the plan's three; it is behind the store walls (Theia sender, shell window), writes nothing and returns only `subscribed`/`unknown-window` |
| threat_flag: page-load-principal | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `tabsBridgeCreate` loads the extension's http(s) URL with the extension's triggering principal (as stock `addTab`); a system principal is replaced with a null principal |

## Self-Check: PASSED

- FOUND: scripts/verify-extension-actions.mjs, scripts/verify-extension-actions-live.mjs, scripts/lib/pb-extension-fixtures.mjs
- FOUND: commits 965999ae, ddbab7c5, 8edac760 (ancestors of HEAD)
