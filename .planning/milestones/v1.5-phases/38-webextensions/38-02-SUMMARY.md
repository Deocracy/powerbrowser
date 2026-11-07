---
phase: 38-webextensions
plan: "02"
subsystem: chrome-bar
tags: [webextensions, extension-actions, puzzle-menu, popup-panel, copy-gate, live-harness]
status: complete
live_proof: deferred
requires:
  - phase: 38-webextensions plan 01
    provides: the extensionAction push (WebTabChannel.extensionActions), the extensionClick/extensionPin/extensionRemove store kinds and their ChromeStoreClient methods, the one triggerClickOrPopup(selectedTab) call, the pinned pref
  - phase: 37-permission-prompts-and-dialogs
    provides: the shell's #powerbrowser-popupset (the native panel host the popup panel is appended to)
  - phase: 31-app-menu
    provides: openStockPage {page:'addons'}
provides:
  - ExtensionActionsWidget (buttons row, puzzle menu, gear menu EXTENSIONS_MENU_PATH, Remove confirm row)
  - anchorRectOf (extension-popup-anchor.ts) and the anchorRect field on extensionClick
  - the native popup panel (shellPanelPopup, a BasePopup subclass) opened inside extensionClick, with its close contract
  - popupOpen on every ExtensionActionRow
  - verify-extension-actions rule 8 (widget), copy-gate coverage of extensions/*.tsx, live scenarios buttons and manage
affects:
  - 38-03 (the page-action icon reuses ExtensionActionsWidget.run, so it sends extensionClick with an anchorRect and gets the same panel)
  - 38-04 (the Show/Hide Sidebar row joins the gear menu built in openRowMenu)
  - 38-05 (the empty-state footer "Install from add-ons site" opens the Add-ons Manager until 38-05's install trigger replaces its handler)
tech-stack:
  added: []
  patterns:
    - a chrome-bar sub-widget rendered into the bar's row through attach(host) + render(), the AddressBar pattern
    - pressed state and focus return driven by a pushed row field (popupOpen), never by Theia-side bookkeeping
key-files:
  created:
    - theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx
    - theia/extensions/chrome-bar/src/browser/extensions/extension-popup-anchor.ts
  modified:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/verify-extension-actions.mjs
    - scripts/verify-extension-actions-live.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-shell-error-copy.mjs
key-decisions:
  - "ExtensionActionsWidget is an injectable rendered into ChromeBarWidget's row (attach + render, like AddressBar), not a separate ReactWidget: the buttons sit inside the bar's flex row between the pill and New Tab."
  - "The popup panel is a BasePopup subclass that copies upstream PanelPopup but appends to #powerbrowser-popupset, because PanelPopup requires #mainPopupSet, which the shell does not have. It is created at runtime, so no shell furniture, xhtml or jar.mn change."
  - "Pressed state and focus return ride the push: each row carries popupOpen. On close chrome focuses the Theia frame and re-pushes, and the widget focuses the pill when popupOpen goes from some row to none."
  - "A click on the open popup's own button closes it in extensionClick (answer 'closed') before the click path runs, so the source still holds exactly one triggerClickOrPopup call."
  - "The pinned set stays chrome's pref powerbrowser.extensions.pinned (38-01). No Theia PreferenceService entry was added."
patterns-established:
  - "A Theia-side popup host is forbidden by gate: verify-extension-actions rule 8 fails any chrome-bar source with <iframe, dangerouslySetInnerHTML or an extension-scheme URL."
requirements-completed: []
duration: "not measured"
completed: "2026-11-01"
commits: 3
plan_head_before: 4c2bcdd7d5c13e448751ea46ae5b50437af4aec7
plan_head_after: ea3d07c2743938aa2f4c5d9cbe8f2e5b6d75a384
actuals:
  tokens: 21759
  tasks: 3
  commits: 3
---

# Phase 38 Plan 02: Extension buttons, puzzle menu and native popup panel Summary

**Pinned extension actions now render as chrome-bar buttons, with icon, badge, enabled state and pressed state taken only from the extensionAction push. Every extension is listed in a puzzle menu, each with a gear menu holding Pin to Toolbar, Manage Extension and Remove Extension. A click sends extensionClick with the button's anchorRect. Chrome runs the one click path and opens any popup in a native XUL panel at that rect. The panel closes on Esc, an outside click, focus moving into a page, a tab switch or a second click, and focus then returns to the pill. All static gates are green. The three live scenarios are written and deferred.**

## Status

Complete for every static criterion. `cd theia && nix develop ..#theia --command yarn build` passed after each task, and `nix develop .#theia --command scripts/verify-platform.sh --quick` exited 0 after each task. **The live proof is deferred** to the end-of-milestone live pass, because there is no objdir and so no binary to run. EXT-06 and EXT-07 are not marked complete, since their live truths are unproven.

## Accomplishments

- **Buttons and puzzle menu (Task 1, D-01, D-03).** `ExtensionActionsWidget` reads `WebTabChannel.extensionActions` and `onDidChangeExtensionActions`, and calls `extensionActionsSubscribe()` once at attach (a reloaded frontend attaches again). Up to three pinned rows render as 28×28 `.pb-ext-action` buttons between the pill and New Tab. Each shows a 16px `<img src>` icon (or the codicon when chrome sent none) and an 11px badge capped at four characters, with no badge node when the text is empty. A disabled row is drawn at 40% with `aria-disabled` and its click does nothing. The `extensions` codicon opens the puzzle menu, a `.pb-chrome-bar-dropdown.pb-ext-menu` portal using the Clear History picker pattern (Esc returns focus to the puzzle button, and focus leaving the menu closes it). The menu follows 38-UI-SPEC: no extensions shows the empty heading, body and install footer; one extension shows a single row with no heading; more than one shows a Pinned section and an Extensions section. Rows carry the icon, the badge, the name (160px ellipsis, full name as tooltip) and the "Disabled for this page" caption. Clicking a row runs the action anchored at the puzzle button.
- **Anchor reporting (Task 1, D-11).** `anchorRectOf(button)` returns `{left, top, width, height}` from `getBoundingClientRect()`. `ChromeStoreClient.extensionClick(extensionId, anchorRect)` carries it. The only caller is the widget's handlers, and the widget file was added to `PRIVILEGED_CALLERS`.
- **Native popup panel (Task 2, D-02).** `extensionClick(win, named, anchorRect)` opens the popup right after its single `triggerClickOrPopup(selectedTab)` call. `shellPanelPopup` is upstream `PanelPopup` (`ExtensionPopups.sys.mjs:484-518`) on top of `BasePopup`, appended to `#powerbrowser-popupset`. It opens with `openPopupAtScreenRect("bottomright topright", ...)` after `contentReady`, as `ext-pageAction.js` does. The rect is clamped to the Theia frame and offset into screen pixels (T-38-08). The close contract is: the panel's own rollup for Esc and an outside click, a capture `focus` listener for an overlay gaining focus, the host strip's `TabSelect` for a tab switch, and `extensionClick` for a second click on the open popup's button (answer `'closed'`). Every close path runs `destroy()`, which removes the listeners, focuses the Theia frame and re-pushes. A throw while building the panel answers `'popup-failed'`, and the widget shows "This extension's popup could not be shown. Reload the tab and try again." in the puzzle menu.
- **Pin, Manage, Remove (Task 3, D-08).** The gear menu, and a right-click on a button, is a per-request stock menu at `EXTENSIONS_MENU_PATH` and is never registered. Pin to Toolbar and Unpin from Toolbar call `extensionPin`. Manage Extension calls `openStockPage('addons')`, the existing enum, never a URL. Remove Extension opens the confirm row in the puzzle portal ("Remove {name}?", the data note, Remove and Cancel), and only its Remove button calls `extensionRemove`. A `'refused'` answer, for a built-in or locked add-on, shows "{name} can't be removed here. Choose Manage Extension to see it in Add-ons."
- **Copy.** 19 new `CHROME_BAR_COPY` entries (17 new strings pinned in `EXPECTED_NAV_COPY`; "Extensions" serves two entries and "Cancel" was already pinned), each pin in the commit that added its entry. No string carries an id, a pref key or a port, and `grep -c "extensionId\|tabId" chrome-bar-copy.ts` prints 0. `verify-shell-error-copy.mjs` now reads `extensions/*.tsx` as widget copy, and a planted literal title in `extensions/extension-actions-widget.tsx` goes red.

## Verification results (this lane)

| Check | Result |
|---|---|
| `node scripts/verify-extension-actions.mjs` (+ `--self-test`) | PASS (97 sources, up from 94; control green, 10 plants red, including the new popup-dom, inlined svg icon and anchor reporter gone) |
| `node scripts/verify-extension-actions-live.mjs --self-test` / `--static` | PASS (5 live plants audited: wrong-page, create-unadopted, buttons-stale, popup-dom, pin-lost) |
| `node scripts/verify-web-tab-bridge.mjs` (+ `--self-test`) | PASS (64 plants, two new: extensionRemove called from chrome-bar-commands.ts, extensionPin named in chrome-bar-keybindings.ts) |
| `node scripts/verify-shell-error-copy.mjs` (+ `--self-test`) | PASS (widget copy from 3 sources; 15 modes-copy plants, one new under extensions/) |
| `node scripts/verify-shell-furniture.mjs`, `verify-shell-gbrowser-standin.mjs` | PASS |
| `node scripts/verify-ng-040-internals-catalogue-lines.mjs` (normal mode; `--fix` never run) | PASS |
| `bash scripts/check-internals-boundary.sh` / `--catalogue` | PASS / PASS |
| `theia/node_modules/.bin/tsc --noEmit -p theia/extensions/chrome-bar` | PASS |
| `cd theia && nix develop ..#theia --command yarn build` | PASS after Tasks 1, 2 and 3 |
| `nix develop .#theia --command scripts/verify-platform.sh --quick` | PASS after Tasks 1, 2 and 3 |
| `node scripts/verify-extension-actions-live.mjs --scenario buttons,popup-action,manage` / `--self-test --live` | NOT RUN: no built binary (deferred) |

`grep -c "triggerClickOrPopup(selectedTab)" powerbrowser/shell/PowerBrowserAPI.sys.mjs` still prints 1. No `.pb-chrome-bar-dropdown` hosts popup content: rule 8 and the live popup-dom check both enforce this.

How the edits reach the binary: chrome JS changed only in `PowerBrowserAPI.sys.mjs`, with no `jar.mn` change, no new chrome file and no patch change. The live harness's `MOZ_PURGE_CACHES=1` picks the change up, so this plan needs no Gecko rebuild of its own. The 38-01 patch 050 rebuild is still outstanding.

## Task Commits

1. **Task 1: buttons row, puzzle menu and anchor-rect reporting** — `efd25638` (feat)
2. **Task 2: popup opens in a native XUL panel at the button's rect** — `9d6ac387` (feat)
3. **Task 3: Pin to Toolbar, Manage and Remove rows with the confirm row and copy** — `ea3d07c2` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] PanelPopup cannot be used in the shell**
- **Found during:** Task 2
- **Issue:** Upstream `PanelPopup` appends its panel to `#mainPopupSet`. The shell has `#powerbrowser-popupset` instead, so `PanelPopup` would throw on a null parent.
- **Fix:** `shellPanelPopup`, a `BasePopup` subclass with PanelPopup's attributes, `DESTROY_EVENT` and `destroy`, appended to `#powerbrowser-popupset`. Only `addPanelHidingHandler` (a module-private click debounce) is not reproduced. `closePopup` also destroys a popup that never showed. The new lazy import line is catalogued as an appended row. No furniture element was added, because the panel is created at runtime and the Phase 35 section is untouched.
- **Commit:** `9d6ac387`

**2. [Rule 2 - Missing functionality] Pressed state and focus return need a chrome signal**
- **Found during:** Task 2
- **Issue:** Theia cannot see the panel close when focus goes elsewhere (Esc in the popup, a tab switch), so its pressed state and focus return would go stale.
- **Fix:** Each pushed row carries `popupOpen`, which `extensionActionRowsOf` validates. Chrome re-pushes on open and close and focuses the Theia frame on close. The widget focuses the pill when the last open row closes.
- **Commit:** `9d6ac387`

**3. [Rule 1 - Bug] Copy-scanner false positives**
- **Found during:** Task 3
- **Issue:** The widget-copy text-node regex read `/> : <span` and `> 0 && <div` as copy (":" and "0 &&").
- **Fix:** The icon ternary became an if/return, and `> 0` became `!== 0`. The gate was not changed.
- **Commit:** `ea3d07c2`

### Scope and structure deviations

- **Not a ReactWidget.** The plan says `ExtensionActionsWidget extends ReactWidget`. A separate ReactWidget cannot sit inside the bar's flex row, so the class follows the AddressBar pattern (an injectable singleton with `attach(host)` and `render()`, bound statically per D-50).
- **No Theia PreferenceService for pins.** 38-01 made the pinned set the chrome pref `powerbrowser.extensions.pinned`, and the orchestrator confirmed it. Pins persist per profile, chrome-side.
- **Copy split across tasks.** Each task added the strings its TSX used, with the matching pins in the same commit, so every commit's copy gate stayed green. Task 3 still holds the Pin, Remove and confirm rows.
- **Copy beyond the spec table.** Two strings were added: "Options for {name}" (the gear button's accessible name and tooltip) and "{name} can't be removed here. Choose Manage Extension to see it in Add-ons." (the `'refused'` answer, whose next step is a real affordance on screen). The spec covers neither case.
- **Puzzle glyph.** `@vscode/codicons@0.0.45` has no `puzzle` icon, so the button uses `codicon-extensions`.
- **Badge colours.** The badge uses `--color-primary` / `--color-text` with fallbacks, which is the house token scheme in `chrome-bar.css` (the spec names the `--theia-button-*` family).
- **Popup size.** Not forced to 320×400: BasePopup sizes the browser from its content, as Firefox does. The anchor rect is clamped to the frame, and the panel's own constraints keep it on screen.
- **Install footer.** "Install from add-ons site" opens the Add-ons Manager (`openStockPage('addons')`) for now. The AMO install trigger is EXT-09 (38-05, a `network` store kind), and AMO hosts are not allowlisted yet.
- **Catalogue `--fix` not run.** The brief forbids it. 14 rows were renumbered by mapping `git diff -U0` hunks (with a text check that each old line equals the new one), and one row was appended.
- **Gate recursion.** `verify-extension-actions.mjs` already read sources recursively, so the count grew by itself (94 to 97). Rule 8 now names the two extensions/ files and fails if either is missing.
- **Phase 37 delta.** Phase 37 left `#powerbrowser-popupset`, which holds `#notification-popup` and the other prompt panels. The extension popup is a separate runtime panel inside that popupset; no second popup host was authored in the xhtml.

## Deferred to the end-of-milestone live pass

Prerequisites (from 38-01): re-patch main's `upstream/` with the amended patch 050, rebuild with `nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build'`, write `sha256sum patches/050-extension-tab-host.patch > objdir/.pb-050-build.sha256`, then build Theia with `nix develop .#theia --command bash -c 'cd theia && yarn build'`.

1. `node scripts/verify-extension-actions-live.mjs --scenario buttons`
2. `node scripts/verify-extension-actions-live.mjs --scenario popup-action` (the real button click, the native panel, and the four closes with pill focus)
3. `node scripts/verify-extension-actions-live.mjs --scenario manage`
4. `node scripts/verify-extension-actions-live.mjs --self-test --live` (a clean control, then buttons-stale, popup-dom and pin-lost must each go red naming their text, alongside the 38-01 plants)
5. Visual geometry (38-UI-SPEC backstop): raise the shell with a KWin script and capture with spectacle. Check the 28×28 buttons, the badge position, the 300px puzzle menu and the panel arrow under the button.

Live risks to watch: whether `pressKey` Escape reaches the popup browser, whether the outside-click rollup consumes the second click, which makes `'closed'` unreachable but harmless, and whether Lumino's mouseup activation works for the gear-menu rows. In each case only the scenario driver would need adjusting.

## Owner decisions

None taken.

## For 38-03 (page-action icon)

- Reuse `ExtensionActionsWidget.run(row, anchor)` (protected). It closes the puzzle menu, sends `extensionClick(extensionId, anchorRectOf(anchor))` and handles `'popup-failed'`. The page-action icon gets the same panel and close contract with no further chrome work.
- `extensionClick` answers `'popup' | 'action' | 'disabled' | 'no-tab' | 'closed' | 'popup-failed'`.
- A new row field (for example `pageActionShown`) must be added to `ExtensionActionRow` and to `extensionActionRowsOf`'s validator in `web-tab.ts`, or the row is dropped.
- `extensionActionsById()` entries now carry `{extension, action, browserStyle}`, and `extensionActionRow` takes a fifth argument (the extension whose popup is open).
- Any new chrome-bar TSX under `extensions/` is read by the copy gate. Keep copy in `CHROME_BAR_COPY`, avoid `> 0 &&` and `/> : <` on one line, and never use `<iframe`, `dangerouslySetInnerHTML` or an extension-scheme string (rule 8).
- The gear menu is built in `openRowMenu`. 38-04's Show/Hide Sidebar row belongs there.

## Known Stubs

- The empty-state footer "Install from add-ons site" opens the Add-ons Manager rather than the AMO install flow. This is intentional until 38-05 (EXT-09) lands the install trigger.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: native-panel | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `extensionClick` now opens a chrome panel at a Theia-reported rect. The rect is clamped to the Theia frame (non-finite values read as 0), one popup is open per window, and it closes on page focus and tab switch (T-38-08). |

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx, theia/extensions/chrome-bar/src/browser/extensions/extension-popup-anchor.ts
- FOUND: commits efd25638, 9d6ac387, ea3d07c2 (ancestors of HEAD)
