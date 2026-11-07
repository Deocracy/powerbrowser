---
phase: 33-bookmarks-history-and-the-full-menu
plan: "05"
subsystem: chrome-bar
tags: [app-menu, menu-03, actions-mode, smode-07, full-screen, window-chrome, edit-menu, page-09, edit-state-actor, live-harness]
status: complete
requires:
  - phase: 33-01
    provides: the store-kind rule-12 machinery (classes, two-file privileged fence), bookmark and closed-tab kinds
  - phase: 33-02
    provides: CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID and its star path (openBookmarkStar)
  - phase: 33-03
    provides: AppMenuView.submenu, MENU_PHASE 33, menuLeaf/menuGroup/renderBarMenu/openPlace, the History submenu, the toolbar toggle command
  - phase: 33-04
    provides: CHROME_BAR_CLEAR_HISTORY_COMMAND_ID and the History submenu's clear row
  - phase: 32-page-tools (plan 06)
    provides: the webTabEdit arm, the frozen WEB_TAB_EDIT_CMDS set, the four Edit commands, verify-page-tools-edit
  - phase: 31-site-identity-permissions-and-app-menu
    provides: the hamburger skeleton (MENU_ORDER, buildAppMenu, openStockPage, Quit)
provides:
  - "MENU_ORDER (MENU-03): New Tab, New Window | Bookmarks, History, Downloads | Print, Save Page As, Find in Page, Zoom, Edit, Full Screen | Settings, Passwords, Add-ons | More Tools, Help | Quit; no Phase 31 row moved, Help became a submenu"
  - "Browser-category commands: new-window, full-screen, print, save-page, find-in-page, zoom-in, zoom-out, zoom-reset, devtools, settings, edit-redo, edit-select-all; view-source and reader-toggle now labelled ('Page Source', 'Reader View') and categorised"
  - "CHROME_BAR_FULL_SCREEN_COMMAND (= CHROME_BAR_FULL_SCREEN_COMMAND_ID = 'powerbrowser.chrome-bar.full-screen'), the id Phase 35 plan 35-07 runs"
  - "Store kind fullScreen, class window-chrome (D-14b): STORE_REQUEST_KINDS member, handleStoreRequest arm, toggleShellFullscreen at the end of PowerBrowserAPI.sys.mjs, ChromeStoreClient.fullScreen(), called only by ChromeBarWidget.toggleFullScreenRow"
  - "Stock page 'about' (openStockPageFromMenu -> win.openAboutDialog) for the Help submenu's About row"
  - "ChromeBarWidget: APP_MENU_COMMANDS (menuId -> Browser command id), appSubmenu(menuId, bookmarks, editState) for Bookmarks/Zoom/Edit/More Tools/Help, commandLeaf(id, label, command, accelerator?, enabled?), readEditState(), toggleFullScreenRow()"
  - "chrome-bar-commands.ts openers setToggleFullScreen/toggleFullScreen and setOpenStockPage/openStockPage; chrome-bar-shortcuts.ts pageKeyLabel(id)"
  - "AppMenuView.isEnabled?(menuId): a wired row dims (keeps its place) while its command is disabled"
  - "PAGE-09: the PowerBrowserEditState actor pair (PowerBrowserEditStateParent in PowerBrowserAPI.sys.mjs, PowerBrowserEditStateChild in GroupActorChild.sys.mjs), registered from registerGroupActor; webTabEdit checkOnly replies from webTabEditEnabled (live docShell.isCommandEnabled); WebTabReply.enabled"
  - "verify-address-bar-modes cases 15-18 (ROADMAP-parsed MENU-03 entries, ROADMAP Actions entries, menu/Actions shared ids, Actions enumeration) with 6 plants"
  - "verify-page-tools-edit rules 5-7 (Edit rows == Edit commands, live greying, the query chain) with 4 plants"
  - "Live scenarios app-menu and actions-list, command-centre-privacy extended; plants menu-twin-diverges and actions-reach-store"
affects:
  - 34 (tab menu rows: Bookmark Tab / Bookmark All Tabs, Reopen Closed Tab -- see "Names Phase 34 must know")
  - 35 (35-07 swaps the Full Screen implementation behind CHROME_BAR_FULL_SCREEN_COMMAND; the fullScreen kind and toggleShellFullscreen are what it replaces)
  - end-of-milestone live pass (every live item below)
tech-stack:
  added: []
  patterns:
    - "A hamburger row that does what a command does runs that command's id (APP_MENU_COMMANDS / commandLeaf), so a menu row and its Actions row cannot run two implementations; the gates derive both sides"
    - "A store kind that changes only window chrome state is classed window-chrome: never relayed, widget-only caller, but a command may reach it through the widget's opener"
    - "A second actor pair rides the existing actor files: parent class in the boundary file, child class in the one actor-child file, registered from the one registration method"
key-files:
  created: []
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/GroupActorChild.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
    - theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts
    - theia/extensions/chrome-bar/src/browser/site-identity/app-menu.ts
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-chrome-bar-commands.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-site-identity.mjs
    - scripts/verify-address-bar-modes.mjs
    - scripts/verify-address-bar-live.mjs
    - scripts/verify-page-tools-edit.mjs
    - .planning/phases/33-bookmarks-history-and-the-full-menu/33-UI-SPEC.md
key-decisions:
  - "Print, Save Page As, Find in Page, Zoom and Page Developer Tools had working tab methods and relay rows but no command id. Following the plan literally (absent row when the id is missing) would have failed ROADMAP criterion 5. Each now has a Browser-category command whose execute is the same tab method the relay row runs, so the menu row, the Actions row and the key share one implementation."
  - "A Settings command was added because ROADMAP criterion 5 names settings among the Actions entries. It and the Settings menu row run the same widget stock-page handler."
  - "New Window runs GUI-01's OPEN_BROWSER_WINDOW_COMMAND_ID (D-12). verify-web-tab-bridge rule 6 admits exactly that import and that one registration in chrome-bar-commands.ts. A second mention anywhere in chrome-bar still fails, and both directions have plants."
  - "fullScreen is classed window-chrome (D-14b/N1). The rule-12 fence admits a command naming it. The caller fence still requires the chrome-bar widget as the only caller, and the relay rule fails it."
  - "History moved from group 1 to the Bookmarks/Downloads group, so the separator falls after New Window as 33-UI-SPEC orders. Its position is unchanged and no Phase 31 row moved."
  - "Help, a Phase 31 row, keeps its position and becomes a submenu. Get Help opens the existing support stock page. About {App} opens upstream's openAboutDialog through a new 'about' stock-page enum value."
  - "PAGE-09 Edit row placement: after Zoom, where Firefox's hamburger last carried an Edit row. 33-UI-SPEC was amended in the same commit (new-rows cell, numbered order, Edit submenu strings row) so the derived UI-SPEC gate keeps deriving."
  - "PAGE-09 greying uses a live child-side query, not the cache. The second actor pair reuses the existing files and the one registration method rather than adding an actor file: check-internals-boundary allows exactly one actor-child file. The child has no events and no matches. It is created only when chrome asks a web-tab overlay (messageManagerGroups browsers). A failed query falls back to the cached flag, so a working row is never greyed by an error."
  - "Edit rows show no shortcut hints. The edit keys are content-native and have no PAGE_SHORTCUTS row (32-06 Deviation 5), and 33-UI-SPEC sources hints from that table only."
  - "Submenu timing is stock Lumino: 300 ms hover open, Right/Enter open, Left/Esc back one level. 33-UI-SPEC asks for 200 ms; changing it would mean editing @lumino/widgets (hard rule 1)."
patterns-established:
  - "verify-site-identity derives the hamburger order from two UI-SPECs: the Phase 31 sentence for its own rows, and 33-UI-SPEC's new-rows cell plus numbered order for MENU-03 rows and their separators."
requirements-completed: [MENU-03, SMODE-07, PAGE-09]
duration: "approx. 150 min"
completed: "2026-10-31"
commits: 4
plan_head_before: ae9e41735f08668b5ae87c21e69c7f026333a187
plan_head_after: 506f1f2b394ebbbef75e0cd5def73fc69390f755
actuals:
  tokens: 39958
  tasks: 4
  commits: 4
---

# Phase 33 Plan 05: The full hamburger menu, Actions coverage and the PAGE-09 Edit menu Summary

**The hamburger now has every MENU-03 entry in Firefox order around the unmoved Phase 31 rows, plus an Edit row (PAGE-09). There are five submenus: Bookmarks, Zoom, Edit, More Tools and Help (History came from 33-03). Every action row runs the Browser command id its Actions row runs. Full Screen toggles the shell window through a new `window-chrome` store kind behind a stable id that Phase 35 inherits. The Edit rows grey from the page's live enablement, read through a new child-side actor query.**

## Status

Complete for the static scope:
- The Theia app was rebuilt (chrome-bar, tab-uris, browser app: 0 errors).
- `tsc --noEmit` on chrome-bar is clean.
- `scripts/verify-platform.sh --quick` exits 0 on the final tree.
- Every touched gate and its self-test passes.

The live scenarios exist with their plants. Running them needs `objdir/dist/bin/powerbrowser`, which this worktree does not have. The attempt stopped at `harness: firefox-bidi: .../objdir/dist/bin/powerbrowser does not exist`. That run, and everything else that needs a live run, is listed under "Deferred to end-of-milestone live pass".

## Performance

- Tasks: 4 (the plan's 3, plus the PAGE-09 scope addition)
- Commits: 4 (measured from the plan ledger)
- Files: 19 modified, 0 created

## Accomplishments

- **Menu (MENU-03, D-11..D-14):**
  - Order: New Tab, New Window | Bookmarks, History, Downloads | Print…, Save Page As…, Find in Page…, Zoom, Edit, Full Screen | Settings, Passwords, Add-ons | More Tools, Help | Quit {App}. No row shows "Coming soon".
  - Shared command ids: each command row runs its id through `APP_MENU_COMMANDS`. Each submenu row that does what a command does runs that command through `commandLeaf`.
  - Dimming: a row whose command is disabled (no web tab) dims and keeps its place, through `AppMenuView.isEnabled`.
- **Submenus**, each built per open:
  - Bookmarks: Bookmark This Page with Ctrl+D, | Show Bookmarks Toolbar (check, from the toggle command's `isToggled`), | up to 10 newest bookmarks (`searchPlaces('', 10, 'bookmark')`, Phase 29 targets). A refused read shows a failure row.
  - Zoom: Zoom In, Zoom Out, Reset (keys from `PAGE_SHORTCUTS`), | disabled "Zoom: {percent}" from the tab's pushed zoom.
  - Edit: Undo, Redo | Cut, Copy, Paste | Select All.
  - More Tools: Page Source (Ctrl+U), Reader View, Page Developer Tools (F12).
  - Help: Get Help | About {App}.
- **Commands:** 12 new Browser-category ids, and labels for view-source and reader-toggle. Actions lists each one with no address-bar change, because the Phase 30 enumeration is unchanged.
- **Full Screen:**
  - Path: `CHROME_BAR_FULL_SCREEN` → `toggleFullScreen()` opener → `ChromeBarWidget.toggleFullScreenRow` → `ChromeStoreClient.fullScreen()` → `case "fullScreen"` → `toggleShellFullscreen(actorRef)`. That last step is upstream's toggle body on the window holding the sender's Theia frame.
  - It has a catalogue row and a sentence on the window-chrome class in the INTERNAL-APIS privileged-kind paragraph.
- **PAGE-09:**
  - Opening the hamburger runs `readEditState()`, which calls `tab.edit(cmd, true)` for the six Edit commands in parallel.
  - Chrome's checkOnly branch now returns `webTabEditEnabled(entry, cmd, cached)`. That sends `PowerBrowserEditState:Query {cmd}` to the overlay's `PowerBrowserEditState` child, which answers `docShell.isCommandEnabled(cmd)`.
  - A collapsed selection therefore greys Cut and Copy. The cached flag, which stays `true` after a collapse, is only the fallback.
  - The Edit rows run the 32-06 commands. Redo and Select All are added from the same frozen set.
- **Gates:**
  - verify-web-tab-bridge: window-chrome class, fullScreen classed, relay rule widened, rule-6 New Window admission; 7 new plants (47 total).
  - verify-chrome-bar-commands: 28 ids and 27 labels; 2 new plants (9 total).
  - verify-shell-error-copy: 28 new strings pinned.
  - verify-site-identity: UI-SPEC order derived from both specs; command and submenu rows wired; 3 new plants (56 total).
  - verify-address-bar-modes: cases 15-18; 6 new plants (23 total).
  - verify-page-tools-edit: rules 5-7; 4 new plants (8 total).
  - Catalogue: rows for `win.fullScreen`, `win.openAboutDialog`, the second `ChromeUtils.registerWindowActor` and the second `JSWindowActorChild`. Every shifted row was remapped by hunk offset and checked by both catalogue gates.
- **Live scenarios** (in `verify-address-bar-live.mjs`; every expectation is derived from the tree):
  - `app-menu`: table order, ROADMAP entries in ROADMAP order, each command row running its twin's id, Print and Save reaching the relay rows' tab methods, New Window running GUI-01's command, Full Screen both ways through the kind, the submenus, Zoom In, Esc back one level, and the About dialog.
  - `actions-list`: Actions equals the enumeration, with badges. Full Screen is the store-recorder positive control. Zoom In must run only its own id and reach no store kind.
  - `command-centre-privacy`: extended with four type shapes and a live all-false `modeSends()` assertion. The "hello" control is kept.

## Names Phase 34 must know (Bookmark Tab / Bookmark All Tabs rows)

- Command ids, never re-spelled:
  - `CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID` (`powerbrowser.chrome-bar.bookmark-page`) opens the star path for the **current** tab only (`openBookmarkStar`, `bookmarkablePageUrl()`).
  - `CHROME_BAR_REOPEN_CLOSED_TAB_COMMAND_ID` for the tab menu's Reopen Closed Tab.
  - `CHROME_BAR_FULL_SCREEN_COMMAND` / `CHROME_BAR_FULL_SCREEN_COMMAND_ID` (Phase 35).
  - New: `CHROME_BAR_NEW_WINDOW_COMMAND_ID`, `CHROME_BAR_PRINT_COMMAND_ID`, `CHROME_BAR_SAVE_PAGE_COMMAND_ID`, `CHROME_BAR_FIND_IN_PAGE_COMMAND_ID`, `CHROME_BAR_ZOOM_IN/OUT/RESET_COMMAND_ID`, `CHROME_BAR_DEVTOOLS_COMMAND_ID`, `CHROME_BAR_SETTINGS_COMMAND_ID`, `CHROME_BAR_EDIT_REDO_COMMAND_ID`, `CHROME_BAR_EDIT_SELECT_ALL_COMMAND_ID`.
- **`bookmarkPage` is a privileged store kind.** Rule 12 allows its `.bookmarkPage(` call only in `address-bar/address-bar.tsx` and `chrome-bar-widget.tsx` (`PRIVILEGED_CALLERS` in `verify-web-tab-bridge.mjs`), never from a command or keybinding file.
  - A tab-strip "Bookmark Tab" or "Bookmark All Tabs" row in `tab-strip-widget.tsx` must either route through a widget handler in one of those two files, or extend `PRIVILEGED_CALLERS` with a reasoned rule edit and a plant.
  - "Bookmark All Tabs" has no bulk kind; `bookmarkPage(url, title, folderGuid?)` is per page and idempotent.
- Widget helpers for per-request menus: `menuLeaf`, `menuGroup`, `commandLeaf(id, label, command, accelerator?, enabled?)`, `renderBarMenu(path, menu, anchor)`, `acceleratorOf(command)`.
  - Rows that run a command must go through `commandLeaf`. `verify-address-bar-modes` case 17 fails a submenu `menuLeaf` row that runs its own implementation.
- `MENU_ORDER` rows: `new-window`, `bookmarks`, `downloads`, `print`, `save-page`, `find-in-page`, `zoom`, `edit`, `full-screen`, `more-tools`.
  - A new row needs an `appMenuLabel` case, a copy key, and a wiring path that verify-site-identity derives: an `APP_MENU_COMMANDS` entry, an `appSubmenu` case, or a stock page.
  - It also needs a place in 33-UI-SPEC's new-rows cell and numbered order.
- Copy keys added: `menuNewWindow`, `menuBookmarks`, `menuDownloads`, `menuPrint`, `menuSavePage`, `menuFindInPage`, `menuZoom`, `menuFullScreen`, `menuMoreTools`, `menuEdit`, `bookmarkThisPageRow`, `showBookmarksToolbarRow`, `bookmarksMenuFailed`, `zoomInRow`, `zoomOutRow`, `zoomResetRow`, `zoomLevelRow`, `pageSourceRow`, `readerViewRow`, `pageDevToolsRow`, `getHelpRow`, `aboutAppRow`, `editUndoRow`, `editRedoRow`, `editCutRow`, `editCopyRow`, `editPasteRow`, `editSelectAllRow`.

## Task Commits

1. Task 1: `b305036e` feat(33-05): MENU-03 hamburger rows, four submenus and the full-screen window-chrome kind
2. Task 2: `8f55ee82` test(33-05): menu/Actions coverage gate and the ROADMAP-parsed MENU-03 check
3. Task 3: `d8120f2e` test(33-05): live app-menu and actions-list scenarios, command-centre-privacy type shapes
4. PAGE-09 (scope addition): `506f1f2b` feat(33-05): PAGE-09 Edit submenu greyed from the page's live enablement

## Files Created or Modified

- `PowerBrowserAPI.sys.mjs`: the fullScreen kind and toggle, the 'about' stock page, the edit-state actor registration and parent class, and `webTabEditEnabled`
- `GroupActorChild.sys.mjs`: `PowerBrowserEditStateChild`
- `INTERNAL-APIS.md`: 4 rows, the window-chrome sentence, remapped line numbers
- `chrome-store-client.ts`: `fullScreen()`
- `web-tab.ts`: `WebTabReply.enabled`
- `chrome-bar-widget.tsx`: menu rows, submenus, `APP_MENU_COMMANDS`, `commandLeaf`, `readEditState`, the full-screen handler
- `chrome-bar-commands.ts`: 12 commands, two opener pairs, labels for view-source and reader-toggle
- `chrome-bar-copy.ts`: 28 strings
- `chrome-bar-shortcuts.ts`: `pageKeyLabel`
- `site-identity-table.ts`: `MENU_ORDER` rows and the 'about' stock page
- `app-menu.ts`: `WIRED_MENU_IDS` and `AppMenuView.isEnabled`
- Scripts: `verify-web-tab-bridge`, `verify-chrome-bar-commands`, `verify-shell-error-copy`, `verify-site-identity`, `verify-address-bar-modes`, `verify-address-bar-live` and `verify-page-tools-edit`, as above
- `33-UI-SPEC.md`: the Edit row, the Edit submenu strings row, and the renumbered order (the PAGE-09 contract)

## Decisions Made

See the `key-decisions` frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Commands for the Phase 32 page tools**
- Found during: Task 1 (the D-13 grep-first step)
- Issue: Print, Save Page As, Find in Page, Zoom and Page Developer Tools had no command id. The plan's literal rule ("absent when the id does not exist") would have left four of ROADMAP criterion 5's twelve entries off the menu. Actions could not have run print either.
- Fix: one Browser-category command per tool, whose execute is the tab method its relay row already runs. Settings was added for criterion 5's Actions list. The view-source and reader-toggle commands were labelled and categorised, which 32-08 left to Phase 33.
- Files: `chrome-bar-commands.ts`, `verify-chrome-bar-commands.mjs`
- Commit: b305036e

**2. [Rule 3 - Blocking] verify-web-tab-bridge rule 6 forbade New Window's own path**
- Issue: rule 6 fails any chrome-bar source naming `OPEN_BROWSER_WINDOW_COMMAND_ID`, but D-12 requires New Window to run it.
- Fix: the rule admits exactly the import line and the `CHROME_BAR_NEW_WINDOW` registration in `chrome-bar-commands.ts`. Plants cover a widget reach and a second reach in the commands file.
- Commit: b305036e

**3. [Rule 3 - Blocking] The derived UI-SPEC menu check knew only the Phase 31 sentence**
- Fix: verify-site-identity reads 33-UI-SPEC too. It checks the new-rows cell for names and order, and the numbered "Full menu" list for MENU-03 separators. Phase 31-only neighbours keep the old sentence check.
- Plants: an out-of-order MENU-03 row, a wrong separator, and a command row with no command behind it.
- Commit: b305036e

**4. [Rule 1 - Bug] The forbidden pattern `FullScreen` matched the toggle function's name**
- Fix: renamed it `toggleShellFullscreen`. `win.fullScreen` is lower-case, so the Phase 27 shim policy does not apply.
- Commit: b305036e

**5. Catalogue remap by hand, not `--fix`**
- Every shifted `PowerBrowserAPI.sys.mjs` and `GroupActorChild.sys.mjs` row was remapped by the insertion hunks of the diff (32-06 Deviation 10 precedent). Both catalogue gates pass.

### Scope Deviations

**6. PAGE-09 scope addition (coordinator ruling).** Delivered as its own commit: the Edit row, the live greying source, and verify-page-tools-edit rules 5-7. 33-UI-SPEC was amended so the Edit row is part of the derived contract.

**7. The new actor pair is a Gecko-side surface added without a live run.** The registration options, the lazy child creation on `getActor`, and `messageManagerGroups: ["browsers"]` matching the overlays are unverified. A failed query falls back to the cached flag (the 32-06 behaviour), so a wrong guess degrades greying, not editing.

**8. Submenu timing is Lumino's.** It opens after 300 ms, not the 200 ms in 33-UI-SPEC. Right/Enter open, Left/Esc step back. A change would mean editing `@lumino/widgets`, which hard rule 1 forbids.

**9. Menu-row tooltips.** Theia's per-request `.lm-Menu` rows carry no tooltip, so "dimmed with tooltips retained" holds for dimming only. This is the same limitation 33-03 recorded for header rows.

**10. `chrome-bar.css` and `verify-ng-040` were not edited.** The plan listed both. No rule was needed, because the submenus use the stock `.lm-Menu` and the root keeps `.pb-app-menu`, and ng-040 needed only a catalogue remap.

**11. Plan-head ledger** created before the first commit; `commits: 4` is measured from it.

## Known Stubs

None. Every row runs a real path. Zoom's percent row reads 100% when no web tab is current, which is the dimmed state.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: actor-surface | powerbrowser/shell/PowerBrowserAPI.sys.mjs, GroupActorChild.sys.mjs | The PowerBrowserEditState pair is a new chrome-to-content message: one frozen cmd in, one boolean out. Page script cannot send it, and the child has no events. Catalogued. |

- T-33-05 (twin implementations): mitigated by `APP_MENU_COMMANDS` and `commandLeaf`, verify-address-bar-modes case 17 with its `twin-implementation` and `removed-command` plants, and the live `menu-twin-diverges` plant.
- T-33-06 (Command centre sends): `MODE_SENDS` stays all-false and this plan adds no exception. Cases 5, 8 and 9, the `resolve:true` plant, and the extended live privacy scenario cover it.

## Deferred to end-of-milestone live pass

- `node scripts/verify-address-bar-live.mjs --scenario app-menu,actions-list,command-centre-privacy` and `--self-test`, against a rebuilt binary. `PowerBrowserAPI.sys.mjs` and `GroupActorChild.sys.mjs` changed, so `-purgecaches` is needed; the harness sets `MOZ_PURGE_CACHES=1`. In particular:
  - `toggleShellFullscreen` on the shell window: both directions, and whether the Theia frame re-lays out.
  - New Window with the chrome channel alive: a stock tab or window opens and no shell window opens.
  - `win.openAboutDialog()` from a stock window opens the branded About dialog.
  - The Zoom In push carries `zoom > 1`.
  - The submenu hover and Esc behaviour on Lumino.
  - Actions badges for the four keyed Phase 33 commands.
- **PAGE-09 live confirmation:** select text in a page's textarea, collapse the selection, then open the hamburger's Edit submenu. Cut and Copy must be dimmed, and Paste and Select All enabled. With text selected, all are enabled. With nothing undoable, Undo is dimmed. Each row performs its edit on the page.
  - This confirms that the `PowerBrowserEditState` child is created for an overlay (`messageManagerGroups: ["browsers"]`, no events) and answers `docShell.isCommandEnabled` with the page's focused editor after focus has moved to the Theia menu.
  - No live scenario was written for it. A row in `verify-page-tools-live.mjs` beside 32-06's `edit` scenario is the natural home.
- Visual check against 33-UI-SPEC: the 280px root menu with 17 rows, submenu geometry, the Bookmarks check mark, and the dimmed rows with no web tab (Print, Save, Find, Zoom rows, Full Screen, More Tools rows).
- Owner judgement:
  - The 300 ms Lumino submenu delay against the 200 ms the spec asks for.
  - The Edit row's place after Zoom (not in ROADMAP's list).
  - "Reset Zoom" as the palette/Actions label for the Zoom submenu's "Reset".
  - The Settings command added for criterion 5.

## Issues Encountered

None beyond the deviations. The site-identity self-test takes about 2 minutes, because its catalogue plant runs the real instruments.

## Next Phase Readiness

- Phase 34 can add tab-menu rows with the helpers and ids above. Bookmark Tab needs the privileged-caller decision noted there.
- Phase 35 (35-07) swaps the full-screen implementation behind `CHROME_BAR_FULL_SCREEN_COMMAND`. The `fullScreen` kind, its class row and `toggleShellFullscreen` are what it replaces or keeps.

Final `nix develop .#theia --command scripts/verify-platform.sh --quick`: exit 0, "verify-platform: PASS -- all checks passed".

## Self-Check: PASSED

- FOUND: b305036e, 8f55ee82, d8120f2e, 506f1f2b (ancestors of HEAD)
- `node scripts/verify-web-tab-bridge.mjs --self-test`: PASS (47 plants)
- `node scripts/verify-chrome-bar-commands.mjs --self-test`: PASS (9 plants)
- `node scripts/verify-site-identity.mjs --self-test`: PASS (56 plants)
- `node scripts/verify-address-bar-modes.mjs --self-test`: PASS (23 plants)
- `node scripts/verify-page-tools-edit.mjs --self-test`: PASS (8 plants)
- `node scripts/verify-ng-040-internals-catalogue-lines.mjs`, `bash scripts/check-internals-boundary.sh --catalogue`: PASS
- `theia/node_modules/.bin/tsc --noEmit -p theia/extensions/chrome-bar`: clean; Theia app rebuilt with 0 errors after the last commit
