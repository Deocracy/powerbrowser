---
phase: 38-webextensions
plan: "04"
subsystem: chrome-boundary
tags: [webextensions, sidebar, tab-pages, commands, b5-ruling, static-gate, live-harness]
status: complete
live_proof: deferred
requires:
  - phase: 38-webextensions plan 03
    provides: the extensionAction push with page-action rows, extensionNamed(data), ExtensionActionRow + extensionActionRowsOf
  - phase: 38-webextensions plan 02
    provides: ExtensionActionsWidget (openRowMenu gear menu, run(row, anchor)), extensionClick's native popup panel
  - phase: 31.1-extension-tab-host
    provides: patch 050's sidebarAction skips and the moz-extension wall, the tab host install, the gBrowser stand-in's addTab/selectedTab
  - phase: 27 key table
    provides: the page-focus tracker that calls pushPageFocus on every focus change, the disabled-row idiom
provides:
  - the extensionSidebar and extensionSidebarGeometry store kinds (both privileged)
  - ExtensionSidebarView (a Theia right-side-panel view; chrome paints the sidebar page over its rect)
  - rows gain sidebarTitle, sidebarOpen and shortcut; a sidebar-only extension gets a puzzle row
  - Show Sidebar / Hide Sidebar gear row; button tooltips "{name} ({shortcut})"
  - extensionOpenTabPage (extension tab pages to the stock window) and the switchToTabHavingURI shim
  - installExtensionReceivers (per shell window, from the tab host install)
  - extension keyset scoping through pushPageFocus, and the _execute_* routing through extensionClick / the sidebar toggle
  - verify-extension-actions rules 11 (sidebar), 12 (tab pages), 13 (commands), 7 new plants
  - live scenarios sidebar, tab-pages, commands (5 new live plants) and the surfaces fixture
affects:
  - 38-05 (phase close re-runs sidebar, tab-pages and commands; the surfaces fixture is the 4th fixture; AMO install pages may open as tab pages)
tech-stack:
  added: []
  patterns:
    - a chrome-privileged browser painted over a rect a Theia view reports (the overlay geometry discipline, for a non-overlay page)
    - a capture listener at the shell document pre-empting an upstream key listener without a patch change
key-files:
  created:
    - theia/extensions/chrome-bar/src/browser/extensions/extension-sidebar-view.ts
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - scripts/verify-extension-actions.mjs
    - scripts/verify-extension-actions-live.mjs
    - scripts/lib/pb-extension-fixtures.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/check-internals-boundary.sh
key-decisions:
  - "The sidebar page loads in the stock panel document chrome://browser/content/webext-panels.xhtml through its loadPanel, in a chrome browser chrome creates at runtime and paints over the Theia view's rect. webext-panels builds the extension's remote browser, message manager group and API context, so the shell sets none of them and rule 4 (messagemanagergroup) stays green."
  - "One sidebar is open per shell window, as in Firefox. The Theia view follows the push: a row with sidebarOpen shows it in the right side panel, none closes it. The view's own close sends extensionSidebar(open false)."
  - "Geometry is its own store kind (extensionSidebarGeometry), so a late rect can never reopen a closed sidebar. Both sidebar kinds are privileged and sent only from extension-actions-widget.tsx (the view gets callbacks)."
  - "Extension tab pages: tabsBridgeCreate sends a moz-extension URL to extensionOpenTabPage, which admits only the caller's own pages (principal.addonId equals the page's extension) and adds a stock-window tab with the extension's principal, returned to tabs.create. runtime.openOptionsPage reaches it through a switchToTabHavingURI shim on the shell window."
  - "Commands: ExtensionShortcuts already appends a keyset per extension to the shell window. pushPageFocus disables every ext-keyset-id-* key while no page has focus. The _execute_* keys are pre-empted by a capture command listener at the shell document and run through extensionClick or the sidebar toggle, so no patch 050 change was needed and the stock trigger is never spelled."
patterns-established:
  - "An extension-facing refusal is an ExtensionError: a plain chrome Error reaches the extension as 'An unexpected error occurred' (ExtensionCommon normalizeError)."
requirements-completed: []
duration: "not measured"
completed: "2026-11-01"
commits: 3
plan_head_before: 7134e4a4
plan_head_after: bbebb091e6f0fc433760ecff055416723a8c4431
actuals:
  tokens: 37944
  tasks: 3
  commits: 3
---

# Phase 38 Plan 04: Extension sidebars, tab pages and commands shortcuts (B5 ruling) Summary

**Chris's B5 ruling is built on the 38-01 bridge, with patch 050 unchanged. An extension's sidebar page shows as a Theia right-side-panel view, toggled from the gear menu's Show Sidebar / Hide Sidebar row. Chrome loads the page in the stock panel document and paints that chrome browser over the view's rect. Extension pages that open in a tab (tabs.create, runtime.openOptionsPage with open_in_tab) open as tabs of the stock browser window, never an overlay. Extension shortcuts are enabled only while a web page has focus, and their _execute_* keys run on the bridge instead of upstream's stock path. Every static gate passes. All three live scenarios are written and their runs are deferred.**

## Status

Every static criterion is met. `nix develop .#theia --command scripts/verify-platform.sh --quick` exited 0 after each task. `cd theia && nix develop ..#theia --command yarn build` passed after Tasks 1 and 3, the two tasks that changed `theia/`. **The live proof is deferred** to the end-of-milestone live pass. There is no objdir. This plan changed no patch, no `jar.mn` and no chrome file list, so it adds no Gecko rebuild of its own. The 38-01/38-03 patch 050 rebuild is still outstanding. EXT-06, EXT-07 and EXT-08 are not marked complete because their live truths are unproven.

## Accomplishments

- **Sidebar view (Task 1, B5 sidebar half).**
  - Chrome reads each running extension's sidebar action through `apiManager.global.sidebarActionFor`. Each row gains `sidebarTitle`, which is the sidebar's title or else the extension name, or null when the extension has no sidebar page. Each row also gains `sidebarOpen`.
  - An extension with a sidebar and no toolbar action gets a row read from its sidebar action, so the puzzle menu reaches it. A click on that row toggles the sidebar.
  - `extensionSidebar {extensionId, open}` creates or removes a chrome `<browser src="chrome://browser/content/webext-panels.xhtml">`. On load it calls `contentWindow.loadPanel(id, panel, browserStyle)`, as `ext-sidebarAction.js` createMenuItem does. The browser starts hidden, at z-index 1 like an overlay.
  - `extensionSidebarGeometry` places that browser at the rect the view reports. The rect is clamped to the Theia frame the way webTabGeometry clamps an overlay's. The browser is hidden while the view is not visible or a Theia blocking layer is open.
  - `ExtensionSidebarView` uses WebTabWidget's publish discipline (one rAF per frame, deduplicated) and the same body observer, through a new `watchBlockingLayers` export in web-tab.ts. When an extension stops, its open sidebar closes before the next push.
- **Tab pages (Task 2, B5 tab-pages half).**
  - `tabsBridgeCreate` routes a `moz-extension:` URL to `extensionOpenTabPage` before any overlay exists. Every other non-http(s) URL is still refused.
  - `extensionOpenTabPage` refuses another extension's page. Otherwise it adds a tab to the most recent started stock window with the extension's own triggering principal, selects that tab, focuses the window and returns the tab. `tabs.create` gets a real stock tab back.
  - The shell's `tabsBridgeActivate` accepts that foreign tab as already selected.
  - `runtime.openOptionsPage` calls the top window's `switchToTabHavingURI`. The shell now defines it in `installExtensionReceivers`, under the Phase 27 shim policy: the name is on the Phase 27 FORBIDDEN_PATTERNS line, and the standin gate compares it as a function value.
  - The overlay wall is unchanged. patch 050's `tabs.update` URL wall still refuses an extension page in a web tab.
- **Commands (Task 3, B5 commands half plus the 2026-10-20 keys ruling).**
  - One inserted line in `pushPageFocus` calls `extensionKeysFollowPageFocus`. It sets or removes `disabled` on every key under the shell document's `ext-keyset-id-*` keysets. A MutationObserver on the document element gives a keyset that arrives later the current state, which starts as no page focused.
  - `extensionKeysetArrived` matches each `_execute_*` key to its command by building a reference key with upstream's `buildKeyFromShortcut`.
  - A capture `command` listener at the shell document stops those keys before upstream's own listener runs. `_execute_action` and `_execute_browser_action` then run through `extensionClick`, anchored where the button last reported its rect, or else at the frame's top-right corner. `_execute_page_action` runs the same way, but only while the page action is shown. `_execute_sidebar_action` toggles the sidebar view.
  - Custom commands reach `commands.onCommand` untouched, and their tab is the focused page's tab.
  - Rows carry `shortcut`, and toolbar and pill buttons show `{name} ({shortcut})`.
- **Gates.** `verify-extension-actions.mjs` has three new rules and seven new plants (now 20):
  - Rule 11 checks the sidebar. 050's createMenuItem and updateWindow skips must be present in the patch text. extensionSidebarOpen must load through loadPanel and call no overlay opener. The validator must require sidebarOpen. Only the widget may show the view.
  - Rule 12 checks tab pages. The extension route must come before any overlay, extensionOpenTabPage must admit only the caller's own pages, and OVERLAY_LOCATION must name no extension scheme.
  - Rule 13 checks commands. The `_execute_*` set and the keyset prefix are derived from upstream `ExtensionShortcuts.sys.mjs` and compared as set equality. The scoping must run before pushPageFocus's early return, the receivers must be installed exactly once, and the boundary must create no `<key>` and name no Phase 27 row id.
  - `verify-web-tab-bridge.mjs` classifies both sidebar kinds as privileged.
  - `verify-shell-error-copy.mjs` pins the three new strings: "Show Sidebar", "Hide Sidebar" and "${name} (${name})".

## Verification results (this lane)

| Check | Result |
|---|---|
| `node scripts/verify-extension-actions.mjs` (+ `--self-test`) | PASS (99 sources, 4 fixtures; 20 plants red, 7 new: sidebar skip reverted, sidebar-as-tab, tabpage-in-overlay, foreign extension page, execute name drift, commands-always-fire, key collision) |
| `node scripts/verify-extension-actions-live.mjs --static` / `--self-test` | PASS (13 live plants audited, 5 new: sidebar-in-shell, sidebar-as-tab, tabpage-in-overlay, commands-always-fire, commands-never-fire) |
| `node scripts/verify-web-tab-bridge.mjs` (+ `--self-test`) | PASS (64 plants) |
| `node scripts/verify-shell-error-copy.mjs` (+ `--self-test`) | PASS |
| `node scripts/verify-shell-gbrowser-standin.mjs` (+ `--self-test`) | PASS (`switchToTabHavingURI {}` listed with the Phase 27 shims) |
| `verify-shell-furniture`, `verify-ext-tab-host-scope`, `verify-new-window-adopt`, `verify-ext-tab-host-patch-guards` | PASS |
| `node scripts/verify-ng-040-internals-catalogue-lines.mjs` (normal mode and `--self-test`; `--fix` never run) | PASS |
| `bash scripts/check-internals-boundary.sh` / `--catalogue` / `--self-test` | PASS |
| `theia/node_modules/.bin/tsc --noEmit -p theia/extensions/chrome-bar` | PASS |
| `cd theia && nix develop ..#theia --command yarn build` | PASS after Tasks 1 and 3 |
| `nix develop .#theia --command scripts/verify-platform.sh --quick` | PASS after Tasks 1, 2 and 3 |
| `node scripts/verify-extension-actions-live.mjs --scenario sidebar,tab-pages,commands` / `--self-test --live` | NOT RUN: no built binary (deferred) |

`grep -c "triggerClickOrPopup(selectedTab)" powerbrowser/shell/PowerBrowserAPI.sys.mjs` still prints 1. No `messagemanagergroup` was added, no `browserDOMWindow` was registered, and patch 050 is byte-identical to 38-03's.

## Task Commits

1. **Task 1: extension sidebar page as a Theia side-panel view** — `cd68bf4d` (feat)
2. **Task 2: extension tab pages open in the stock browser window** — `6b320312` (feat)
3. **Task 3: extension shortcuts fire with page focus, Theia keeps its keys otherwise** — `bbebb091` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Sidebar-only extensions had no row**
- **Found during:** Task 1
- **Issue:** Rows existed only for extensions with a toolbar action or a shown page action. Most sidebar extensions have neither, so their Show Sidebar row could not exist.
- **Fix:** A sidebar-only extension gets a row read from its sidebar action (`extensionActionRow` takes the sidebar object). `extensionNamed` falls back to the sidebar, and `extensionClick` toggles it.
- **Commit:** `cd68bf4d`

**2. [Rule 1 - Bug] Tabs bridge refusals never reached the extension**
- **Found during:** Task 2
- **Issue:** `tabsBridgeCreate`, `tabsBridgeRemove` and `tabsBridgeActivate` threw plain `Error`s. ExtensionCommon's `normalizeError` replaces those with "An unexpected error occurred". 38-01's live tabs-bridge step that matches `/refused/` could never have passed.
- **Fix:** Those throws, and the two new ones, are `ExtensionUtils.ExtensionError`.
- **Commit:** `6b320312`

**3. [Rule 1 - Bug] tabs-bridge's extension-page step contradicts the ruling**
- **Found during:** Task 2
- **Issue:** The 38-01 scenario asserted that an extension-page `tabs.create` is refused. Under B5 it opens stock-side.
- **Fix:** The step now expects the page to go to a new stock window. The tab-pages scenario covers the case where a stock window is already open.
- **Commit:** `6b320312`

### Scope and structure deviations

- **No `extensionSidebar` shell furniture.** The orchestrator's note says a chrome-side sidebar browser goes through installShellFurniture and verify-shell-furniture. That gate compares the stock elements a remote page reaches through the shell, each against its upstream element in the xhtml. A sidebar host has no upstream element. The panel browser is created at runtime, as 38-02's popup panel is, so there is no xhtml or `jar.mn` change and no Gecko rebuild. The per-window install is `installExtensionReceivers`, called once from the tab host install (rule 13 checks that it is called once).
- **Two sidebar store kinds instead of one.** The plan names `extensionSidebar` only. The view's rect needs a channel. A separate `extensionSidebarGeometry` kind keeps a late rect from reopening a closed sidebar. Both kinds are privileged.
- **No Theia-side change for tab pages.** `browser-window-command.ts` is listed in the plan, but the Theia opener cannot open an extension page: content cannot load a non-web-accessible moz-extension page, and the URL must not cross the bridge. Chrome uses the same stock-window target as `openStockTab` (`Services.wm.getMostRecentWindow("navigator:browser")`) and GUI-01's `openBrowserWindow` for the no-window case.
- **No patch 050 change.** 38-03's note suggested routing `_execute_*` through a 050 hand-off. The capture listener does it without touching the patch, so 050's skips, guards and hash are unchanged.
- **Catalogue `--fix` not run.** The brief forbids it. Rows were renumbered by mapping `git diff -U0` hunks (a scratchpad script; no row sat on a modified line), and the normal-mode ng-040 check passes. 17 rows were appended at the end of the Touchpoints table: 4 sidebar, 7 tab pages, 6 commands.
- **Live fixture.** One new temporary-add-on fixture, `surfaces` (MV2: `sidebar_action`, `options_ui` with `open_in_tab`, a dashboard page, and the commands `pb-probe` Alt+Shift+U and `_execute_sidebar_action` Alt+Shift+I). It is installed alone in the three B5 sessions, so its background is the only reader of `/cmd`. Its name has no digit because gate rule 1's install regex is `[a-z-]+`.
- **The commands IDE-side control is a keydown recorder in the Theia frame, not a Theia keybinding.** A Theia keybinding on the same chord would `preventDefault`, and the chrome key would then skip regardless of `disabled`, so the `commands-always-fire` plant could never go red. The recorder proves that the key reached Theia, and the plant is meaningful.
- **Static vs live plants.** `sidebar-as-tab` and `tabpage-in-overlay` exist in both forms. The static plant rewires the chrome source. The live plant drives the page into a web tab.

## Known limits (shortcut comments in code)

- **`tabs.create` of an extension page with no started stock window** opens a new stock window on the page, and the call rejects with "PowerBrowser opened that page in a new browser window." Returning a tab would need that window's delayed startup to finish before `tabs.create` resolves. The page still opens, and an install-time welcome page usually ignores the result.
- **`switchToTabHavingURI` always opens a new tab.** It does not reuse an options tab that is already open.
- **Not routed: `sidebarAction.open()`/`close()`/`toggle()` and `browserAction`/`pageAction.openPopup()` called from extension code.** They still reach upstream. In the shell the sidebar methods do nothing, because `SidebarController` is absent and 050's skips hold. `openPopup()` still has 38-03's stock-panel problem. Only the B5 surfaces in this plan (the gear row and the shortcuts) were routed.
- **`sidebarAction.setPanel()` while open** does not reload the open panel. Patch 050's updateWindow skip sends no signal. The next open uses the new panel.
- **The panel document's `DOMWindowClose` handler** calls `windowRoot.window.SidebarController.hide()`, which throws in the shell. A sidebar page calling `window.close()` leaves the view open. Hide Sidebar still works.

## Deferred to the end-of-milestone live pass

Prerequisites (unchanged from 38-03): re-patch main's `upstream/` with the amended 050. From `/home/chris/coding/Power-Browser`, run `cd upstream && git checkout HEAD -- $(grep '^+++ b/' ../patches/050-extension-tab-host.patch | sed 's#^+++ b/##') && git apply --3way ../patches/050-extension-tab-host.patch`. Rebuild with `nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build'`, stamp with `sha256sum patches/050-extension-tab-host.patch > objdir/.pb-050-build.sha256`, then build Theia with `nix develop .#theia --command bash -c 'cd theia && yarn build'`.

1. `node scripts/verify-extension-actions-live.mjs --scenario sidebar`
2. `node scripts/verify-extension-actions-live.mjs --scenario tab-pages`
3. `node scripts/verify-extension-actions-live.mjs --scenario commands`
4. `node scripts/verify-extension-actions-live.mjs --scenario tabs-bridge`. Its extension-page step changed.
5. `node scripts/verify-extension-actions-live.mjs --self-test --live`. A clean control, then sidebar-in-shell, sidebar-as-tab, tabpage-in-overlay, commands-always-fire and commands-never-fire must each go red naming their text, alongside the 38-01 to 38-03 plants.
6. Visual: raise the shell with a KWin script and capture it with spectacle. Check that the sidebar page sits exactly over the right side-panel view, hides under a Theia menu, and follows a splitter drag.

Live risks to watch:
- Whether the `load` capture listener on the chrome panel browser fires for the webext-panels document. Stock SidebarController uses the same idiom.
- Whether GlobalKeyListener honours `disabled` toggled on keys of a keyset appended by ExtensionShortcuts. The Phase 27 rows rely on the same behaviour.
- Whether the capture `command` listener at the document runs before the key's own listener for a XUL key command.
- Whether `contentTitle` on the inner remote browser reports the panel page title.

## Owner decisions

None taken. Recommended follow-ups for the orchestrator:
- Whether the no-stock-window `tabs.create` case must return a tab, which needs a wait on the new window's delayed startup.
- Whether extension-code `sidebarAction.open()` and `openPopup()` should be routed too. That needs a patch 050 hand-off.

## For 38-05 (AMO allowlist, install trigger, EXT-10 live fixtures)

- **Fixtures.** There are now four: action, popup, content (XPI) and surfaces. Rule 1 requires every fixture to be installed by some scenario, and its regex only admits `[a-z-]+` names. B5 scenarios run in `B5_SCENARIOS` sessions with only `surfaces` installed. Add a new B5-style scenario name to that set, or the action fixture's `/cmd` poller will consume its commands.
- **Phase-close re-run.** `--scenario sidebar,tab-pages,commands`, plus `tabs-bridge`, whose extension-page step now expects a new stock window.
- **Row shape.** `{extensionId, title, icon, badgeText, enabled, hasPopup, pinned, popupOpen, pageActionShown, sidebarTitle, sidebarOpen, shortcut}`. A new field goes into `ExtensionActionRow` and `extensionActionRowsOf`. A sidebar-only extension has a row whose click toggles its sidebar.
- **Install pages.** Real extensions open welcome and onboarding pages on install. uBlock Origin's dashboard and Bitwarden's options are tab pages and land stock-side through `extensionOpenTabPage`. Only the caller's own pages are admitted. With no stock window open, `tabs.create` rejects after opening one (see Known limits), so an EXT-10 fixture that awaits its welcome tab will see that rejection.
- **Error class.** Throw `ExtensionUtils.ExtensionError` for any refusal an extension should read. A plain `Error` arrives as "An unexpected error occurred".
- **Sidebar fixtures.** Use Tree Style Tab or any sidebar_action extension. Show Sidebar is in the gear menu, and `_execute_sidebar_action` toggles the view while a page has focus.
- **Catalogue.** The Phase 38 section now ends with the tab-pages and commands sub-sections. Append new rows after the `setAttribute("disabled"` row at the end of the Touchpoints table, and keep each backticked token a literal substring of its line (ng-040 matches substrings).

## Known Stubs

None. The 38-02 install-footer stub (Add-ons Manager until 38-05) is unchanged.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: chrome-browser-over-rect | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `extensionSidebarGeometry` places a chrome-privileged panel browser (an extension page inside) at a Theia-reported rect. The rect is clamped to the Theia frame, and non-finite values are refused. The browser is hidden unless the view reports it visible. Only an open sidebar of the named extension moves. |
| threat_flag: stock-tab-principal | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `extensionOpenTabPage` adds a stock tab with the extension's triggering principal, and only for the caller's own page (`principal.addonId === WebExtensionPolicy.getByURI(url).id`). The no-window fallback goes through `openBrowserWindow` (system principal), guarded by the same check. |
| threat_flag: key-preemption | powerbrowser/shell/PowerBrowserAPI.sys.mjs | A capture `command` listener stops `_execute_*` key events before upstream's listener. Only keys matched to that extension's `_execute_*` commands are stopped, and every extension key is disabled while no page has focus. |

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/extensions/extension-sidebar-view.ts
- FOUND: scripts/verify-extension-actions-live.mjs (`--scenario sidebar`, `tab-pages` and `commands` defined)
- FOUND: commits cd68bf4d, 6b320312, bbebb091 (ancestors of HEAD)
