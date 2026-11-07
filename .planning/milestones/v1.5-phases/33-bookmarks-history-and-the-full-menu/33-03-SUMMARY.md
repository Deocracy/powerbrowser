---
phase: 33-bookmarks-history-and-the-full-menu
plan: "03"
subsystem: chrome-bar
tags: [bookmarks-toolbar, reopen-closed-tab, history-submenu, observer-push, key-ruling, live-harness]
status: complete
requires:
  - phase: 33-01
    provides: listClosedTabs/reopenClosedTab read kinds, listBookmarkFolder('toolbar'), the bookmarks-changed push (WebTabChannel.onDidChangeBookmarks), removeBookmark, the rule-12 two-file privileged fence
  - phase: 33-02
    provides: verify-shortcut-relay rule 12 (both focus paths), the module-level opener pattern (setOpenBookmarkStar), copy pins in verify-shell-error-copy
  - phase: 31-site-identity-and-app-menu
    provides: the hamburger skeleton (MENU_ORDER with the reserved History slot, buildAppMenu, APP_MENU_PATH)
  - phase: 27-nav-keys
    provides: PAGE_SHORTCUTS / PAGE_KEYS relay table and shellArmWebTabHistory (the 27-02 restore path)
provides:
  - "Bookmarks toolbar row .pb-bookmarks-toolbar (28px, every mode) behind browser.showBookmarksToolbar (SHOW_BOOKMARKS_TOOLBAR_PREFERENCE, User scope, default false)"
  - "Body attribute data-pb-bookmarks-toolbar='shown' sets --pb-bookmarks-toolbar-height: 28px, added to every mode's #theia-top-panel min-height and the chrome-bar widget height"
  - "Commands powerbrowser.chrome-bar.reopen-closed-tab (CHROME_BAR_REOPEN_CLOSED_TAB_COMMAND_ID, 'Reopen Closed Tab') and powerbrowser.chrome-bar.toggle-bookmarks-toolbar (CHROME_BAR_TOGGLE_BOOKMARKS_TOOLBAR_COMMAND_ID, 'Show Bookmarks Toolbar', isToggled from the setting), Browser category"
  - "chrome-bar-commands.ts exports setReopenLastClosedTab/reopenLastClosedTab and setToggleBookmarksToolbar/toggleBookmarksToolbar"
  - "The hamburger History row is a submenu at BOOKMARKS_HISTORY_MENU_PATH: Reopen Closed Tab + key, Recently closed tabs (<= HISTORY_MENU_ROWS = 10), Recent pages (<= 10)"
  - "app-menu.ts: AppMenuView.submenu?(menuId) and AppMenuSubmenu; MENU_PHASE = 33; 'history' in WIRED_MENU_IDS"
  - "ChromeBarWidget helpers: openPlace(url, target), menuLeaf, menuGroup, renderBarMenu (records Alt/Ctrl of the choosing key or click), reopenClosedTabRow(uri?), historyMenuChildren(reads), readHistoryMenu()"
  - "Ctrl+Shift+T and Ctrl+Shift+B on both focus paths (PAGE_SHORTCUTS/PAGE_KEYS rows reopenClosedTab, toggleBookmarksToolbar + Theia keybindings)"
  - "verify-shortcut-relay ALWAYS_ON_TWINS exception map for rule 12"
  - "Live scenarios bookmarks-toolbar, reopen-closed, history-menu with plants toolbar-ignores-push, reopen-no-history, recent-opens-new-tab"
affects:
  - 33-04 (the Clear Recent History row and Ctrl+Shift+Del: append a fourth group to historyMenuChildren; the picker reuses renderBarMenu's anchor and the hamburger; the keys follow the same rule-12 pattern)
  - 33-05 (MENU-03 rows go into MENU_ORDER at minPhase 33 and render at once, since MENU_PHASE is 33; the Bookmarks submenu's Show Bookmarks Toolbar check row runs CHROME_BAR_TOGGLE_BOOKMARKS_TOOLBAR_COMMAND_ID; a submenu row uses AppMenuView.submenu)
  - 34 (tab-menu Reopen Closed Tab reuses CHROME_BAR_REOPEN_CLOSED_TAB_COMMAND_ID)
tech-stack:
  added: []
  patterns:
    - "One CSS variable (--pb-bookmarks-toolbar-height) added to each mode's top-panel height, so a mode-independent row grows every mode by the same amount"
    - "Overflow measured in a function component (useLayoutEffect + ResizeObserver): items past the edge stay laid out but hidden; the pinned chevron lists them"
    - "Per-request menus record the modifiers of the choosing key or click in a capture listener, so a row's run can follow the Phase 29 new-tab targets"
    - "A pure menu builder takes per-row submenus from the caller (AppMenuView.submenu), so the Node gate still draws the table rows"
key-files:
  created: []
  modified:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - theia/extensions/chrome-bar/src/browser/site-identity/app-menu.ts
    - theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts
    - powerbrowser/shell/powerbrowser.js
    - scripts/verify-shortcut-relay.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-chrome-bar-commands.mjs
    - scripts/verify-site-identity.mjs
    - scripts/verify-address-bar-live.mjs
key-decisions:
  - "The History submenu lives in the Phase 31 hamburger by landing its reserved MENU_ORDER row: MENU_PHASE 31 -> 33, 'history' wired, and the builder draws an enabled row as a labelled CompoundMenuNode when the widget supplies children. The menu opens after both reads reply (the NAV-03 no-spinner rule)."
  - "The toolbar grows the top panel through one body attribute and one CSS variable added to each mode's min-height, then ApplicationShell.fit() so Lumino re-measures. No mode rule is duplicated."
  - "Toolbar items are the toolbar folder's http(s) bookmarks only. Folders, separators and other schemes are skipped, because folder rows carry place: URIs and the toolbar has no folder dropdown."
  - "A toolbar read the push triggers always re-reads; a refused read replaces the items with the failure row. Favicons come in batches of 10 (placesFavicons' cap) after the items render."
  - "Reopen and the toggle need no web tab, so both commands are always enabled. The toggle's execute flips the setting only, and the toolbar follows the setting change, so the key, the Actions row and 33-05's check row cannot disagree."
  - "Ctrl+Shift+T's Theia twin has no when-clause (33-UI-SPEC Keys: Theia binds its own reopen-closed-editor to Alt+Shift+T in the browser build, verified in node_modules). verify-shortcut-relay rule 12 admits it only through ALWAYS_ON_TWINS, with a stale check and a plant. Ctrl+Shift+B's twin excludes editorFocus and terminalFocus."
  - "The reopen relay row lands in Theia (the reopened tab takes focus). The toolbar toggle row does not: focus stays in the page."
  - "Recent pages and toolbar items follow the Phase 29 targets: plain = current tab, Ctrl/middle = background tab, Alt (Alt+Enter, or Alt on a menu row) = foreground tab. Menu rows read the modifiers of the choosing key or click."
patterns-established:
  - "verify-shortcut-relay rule 12 exception: a twin may stay bound in editors and terminals only through ALWAYS_ON_TWINS with a reason; an entry whose twin is editor-scoped after all, or that names no pair, is stale."
requirements-completed: [BMK-03, BMK-04, BMK-06]
duration: "approx. 95 min"
completed: "2026-10-31"
commits: 3
plan_head_before: 8245c01c8463978663d4504091c125c9512c3832
plan_head_after: b81e23e4bdf3370a37a2a191abdb6546a4e87a92
actuals:
  tokens: 18062
  tasks: 3
  commits: 3
---

# Phase 33 Plan 03: Bookmarks toolbar, reopen closed tab and the History submenu Summary

**A 28px bookmarks toolbar row under the pill, in every mode, behind `browser.showBookmarksToolbar`. It re-reads `listBookmarkFolder('toolbar')` on every `bookmarks-changed` push and puts overflow behind a pinned chevron. Ctrl+Shift+T reopens the newest closed tabs.sqlite row on its own key, arming its saved back/forward history first. The hamburger's reserved History row is now a submenu: Reopen Closed Tab, Recently closed tabs, Recent pages. Ctrl+Shift+T and Ctrl+Shift+B work on both focus paths.**

## Status

Complete for the static scope. The Theia app was rebuilt (chrome-bar, tab-uris, browser app: 0 errors), `tsc --noEmit` on chrome-bar is clean, and the relay gate and its self-test pass. The three live scenarios exist with their plants. Running them needs `objdir/dist/bin/powerbrowser`, which this worktree does not have. The attempt stopped at `harness: firefox-bidi: .../objdir/dist/bin/powerbrowser does not exist`. That run is listed under "Deferred to end-of-milestone live pass".

## Performance

- Tasks: 3/3
- Commits: 3 (measured from the plan ledger)
- Files: 15 modified, 0 created

## Accomplishments

- **Toolbar** (`BookmarksToolbar` function component plus `ChromeBarWidget` methods):
  - Layout: 24px items, each with a 16px Places favicon (or `codicon-globe`) and a label capped at 160px with an ellipsis. The tooltip is the title, or the address when there is none.
  - Clicks: a click loads in the current tab, Ctrl or middle-click opens a background tab, and Alt+Enter opens a foreground tab. Right-click offers Open, Open in New Tab and Remove bookmark. Remove calls `removeBookmark` from the widget handler, then the push re-reads.
  - Overflow: items never wrap and the row never scrolls. Items past the edge stay laid out but hidden, and the 24x24 chevron (`»`, aria "More bookmarks") lists them in a per-request menu.
  - Height: one body attribute and one CSS variable add exactly 28px to each mode's top-panel height, then `ApplicationShell.fit()` re-measures. Pill-ground fill; no accent ink.
- **Refresh**: the toolbar re-reads on `WebTabChannel.onDidChangeBookmarks` (chrome's `bookmarks-changed` push), on the setting turning on, and on every toggle. A sequence guard drops stale replies. A refused read shows "{App} couldn't load your bookmarks toolbar. Press Ctrl+Shift+B twice to try again." and no items.
- **Reopen**: `reopenClosedTabRow(uri?)` calls `store.reopenClosedTab(uri)`. When `withHistory` is set, it calls `profileStorage.armWebTabHistory(key)`, then `webTabOpener.openUrl(url, key)`, joins the active group and focuses the page. Nothing closed, or a non-http(s) row, is a no-op.
- **History submenu** (D-08), built per open:
  - Reopen Closed Tab, with the accelerator from KeybindingRegistry, disabled when nothing is closed.
  - Recently closed tabs: a header plus up to 10 `listClosedTabs` rows, newest first. Each row reopens with history.
  - Recent pages: a header plus up to 10 `searchPlaces('', 10, 'history')` rows. Each row loads in the current tab, or a new tab with Ctrl or Alt.
  - An empty section shows its disabled "No ..." row. A refused read shows "{App} couldn't read your history. Open this menu again to try again."
- **Commands**: `reopen-closed-tab` and `toggle-bookmarks-toolbar`, both in the Browser category, so Actions lists them. Each execute calls a module-level opener the widget registers.
- **Keys**:
  - Page rows: `reopenClosedTab` mirrors `key_restoreLastClosedTabOrWindowOrSession`; `toggleBookmarksToolbar` mirrors `viewBookmarksToolbarKb`.
  - Theia twins: `ctrlcmd+shift+t` with no when-clause; `ctrlcmd+shift+b` with `!editorFocus && !terminalFocus`.
- **Gates**:
  - verify-chrome-bar-commands: 2 ids and 2 labels pinned.
  - verify-shell-error-copy: 11 strings and 2 key labels pinned.
  - verify-site-identity: History is wired only when the widget builds its submenu from `listClosedTabs` (new plant); the menu-extra plant now reserves its own later slot (53 plants).
  - verify-shortcut-relay: ALWAYS_ON_TWINS and 4 plants (27 total), 5 pairs now.
- **Live**: 3 scenarios and 3 plants in `verify-address-bar-live.mjs`, plus 17 served pages. Every expectation is derived from the source tree: key events from `PAGE_SHORTCUTS`, labels from `CHROME_BAR_COPY`, the row cap from `HISTORY_MENU_ROWS`, the setting key from the preference const. Places is read back chrome-side as the independent observer of the toolbar folder.

## Names 33-04, 33-05 and Phase 34 must know

- Command ids, never re-spelled:
  - `CHROME_BAR_REOPEN_CLOSED_TAB_COMMAND_ID` = `powerbrowser.chrome-bar.reopen-closed-tab`
  - `CHROME_BAR_TOGGLE_BOOKMARKS_TOOLBAR_COMMAND_ID` = `powerbrowser.chrome-bar.toggle-bookmarks-toolbar`
  - Command objects: `CHROME_BAR_REOPEN_CLOSED_TAB` and `CHROME_BAR_TOGGLE_BOOKMARKS_TOOLBAR`.
- Openers in `chrome-bar-commands.ts`: `reopenLastClosedTab()`, `toggleBookmarksToolbar()` and their setters.
- `SHOW_BOOKMARKS_TOOLBAR_PREFERENCE` = `browser.showBookmarksToolbar` (`chrome-bar-preferences.ts`).
- Widget, `chrome-bar-widget.tsx`:
  - Consts: `BOOKMARKS_HISTORY_MENU_PATH`, `BOOKMARKS_TOOLBAR_MENU_PATH`, `BOOKMARKS_TOOLBAR_ATTRIBUTE`, `HISTORY_MENU_ROWS`.
  - Methods: `historyMenuChildren(reads)` returns `[reopen leaf, closed group, recent group]`. **33-04 appends its Clear Recent History group as a fourth child.** The row stays out of this plan, so there is no forward dependency. Also `readHistoryMenu()`, `openAppMenu(button)` (now async), `renderBarMenu(path, menu, anchor)` (sets `menuTarget`), `menuLeaf(id, label, run, enabled?, accelerator?)`, `menuGroup(id, children)`, `openPlace(url, 'current' | 'background' | 'foreground')`, `reopenClosedTabRow(uri?)`, `syncBookmarksToolbar()` and `refreshBookmarksToolbar()`.
- `app-menu.ts`: `AppMenuView.submenu?(menuId)` returns `{ menuPath?, children }` for an enabled row. `MENU_PHASE` is 33, so **every MENU-03 row 33-05 adds at `minPhase: 33` renders immediately.** Its label needs an `appMenuLabel` case, and its wiring needs a case in verify-site-identity's wired-rows check.
- Copy keys:
  - Toolbar: `showBookmarksToolbarDescription`, `bookmarksToolbar`, `bookmarksToolbarMore`, `bookmarksToolbarFailed`, `bookmarkOpen`, `bookmarkOpenInNewTab`.
  - History submenu: `menuHistory`, `reopenClosedTab`, `recentlyClosedTabs`, `recentPages`, `noClosedTabs`, `noRecentPages`, `historyMenuFailed`.
  - **No `showBookmarksToolbar` menu-row copy exists yet.** 33-05's Bookmarks submenu check row adds it, or uses the command label.
- 33-04's Ctrl+Shift+Del: Theia binds no Ctrl+Shift+Del, so a twin with no when-clause needs an `ALWAYS_ON_TWINS` entry with its reason in `verify-shortcut-relay.mjs`. Otherwise give it the editor/terminal exclusion.
- CSS: `.pb-bookmarks-toolbar`, `-item` (`.is-overflow`), `-icon`, `-label`, `-chevron`, `-failed`.

## Task Commits

1. Task 1: `9071fdc9` feat(33-03): bookmarks toolbar row with live observer refresh
2. Task 2: `f034817d` feat(33-03): reopen closed tab, History submenu and the two commands
3. Task 3: `b81e23e4` feat(33-03): Ctrl+Shift+T and Ctrl+Shift+B on both focus paths, live scenarios

## Files Created or Modified

- `chrome-bar-widget.tsx`: the toolbar component and methods, the History submenu, reopen, toggle, `openPlace`, the menu helpers
- `chrome-bar-commands.ts`: two ids and commands, two opener pairs, the `PreferenceService` injection for `isToggled`
- `chrome-bar-copy.ts`: 13 strings
- `chrome-bar-preferences.ts`: `browser.showBookmarksToolbar`
- `chrome-bar-keybindings.ts`: two Theia twins
- `chrome-bar-shortcuts.ts`: two rows and two relay actions
- `chrome-bar.css`: the height variable in the top-panel rules, and the toolbar rules
- `site-identity/app-menu.ts`: the per-row submenu, `history` wired
- `site-identity/site-identity-table.ts`: `MENU_PHASE` 33
- `powerbrowser/shell/powerbrowser.js`: two `PAGE_KEYS` rows
- `scripts/verify-shortcut-relay.mjs`: `ALWAYS_ON_TWINS` and 4 plants
- `scripts/verify-shell-error-copy.mjs`, `scripts/verify-chrome-bar-commands.mjs`: pins
- `scripts/verify-site-identity.mjs`: the History wiring case, one plant, and the plant runner's `also` second edit
- `scripts/verify-address-bar-live.mjs`: 3 scenarios, 3 plants, 17 pages, the `firedRows` import

## Decisions Made

See the `key-decisions` frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The History submenu lands the Phase 31 reserved row (outside the plan's file list)**
- Found during: Task 2
- Issue: `MENU_PHASE` was 31 and History's row is `minPhase: 33`, so the hamburger never drew it. The builder could only draw plain rows.
- Fix: `MENU_PHASE` is now 33, `history` is in `WIRED_MENU_IDS`, and `AppMenuView.submenu` lets the widget supply children. `verify-site-identity.mjs` now wires History only when the widget builds the submenu from `listClosedTabs`, with a plant for that.
  - The old `menu-extra` plant could no longer go red, because no row sits above phase 33. The runner gained an `also` second edit, and the plant now reserves its own `minPhase: 99` slot.
- Files: `site-identity/app-menu.ts`, `site-identity/site-identity-table.ts`, `scripts/verify-site-identity.mjs`
- Commit: f034817d

**2. [Rule 3 - Blocking] rule 12 exception for the always-on Ctrl+Shift+T twin**
- Found during: Task 3
- Issue: the plan, D-15 and 33-UI-SPEC require the reopen twin to stay bound in editors and terminals. 33-02's rule 12 requires every twin to exclude them, so the gate failed.
- Fix: `ALWAYS_ON_TWINS` in `verify-shortcut-relay.mjs`: a reasoned exception (the RESERVED_EXCEPTIONS precedent), with stale checks in both directions and a `stale always-on twin` plant.
- Commit: b81e23e4

**3. [Rule 1 - Bug] The closed-row variable renamed for verify-chrome-bar-suggestions**
- Found during: the Task 2 `--quick` run (`gui06-chrome-bar-suggestions` went red: any `row.uri` in the widget reads as the opaque-key mint recurrence).
- Fix: the closed row is named `closedTab`. Its `uri` goes only to the `reopenClosedTab` lookup, which is 33-01's contract; the tab opens on the url chrome returns. A comment records why. This is not a navigation to the opaque key.
- Commit: f034817d

**4. Enablement**
- The plan says the two commands read "the shared tab predicate". Neither needs a web tab: reopen works from a file editor, and the toggle is a setting. 33-UI-SPEC lists History and Bookmarks as always enabled. Both commands are therefore always enabled. The History reopen row disables when nothing is closed.

**5. Live plant for the history half**
- The plan's plant "deletes the saved history key". `savedWebTabHistories` is module-private in `PowerBrowserAPI.sys.mjs`, so it cannot be reached. `reopen-no-history` stubs `ProfileStorageService.armWebTabHistory` to a no-op instead. Chrome then never arms the key and the reopen falls back to a plain load. That is the same observable fault, and it goes red on the history assertion.

## Known Stubs

None. By design (the plan's no-forward-dependency rule), 33-04 adds the History submenu's Clear Recent History row.

## Threat Flags

None beyond the register.
- T-33-02: reopen arms only the key chrome returns for the chosen closed row (chrome's `WEB_TAB_ROW_KEY_RE` wall in both `reopenClosedTab` and `shellArmWebTabHistory`). The live `reopen-no-history` plant goes red on the history assertion.
- T-33-03: rows come from the re-read only, never from the push. A refused read shows the failure row. Logs carry the error name only, never a title or URL.

## Deferred to end-of-milestone live pass

- `node scripts/verify-address-bar-live.mjs --scenario reopen-closed,bookmarks-toolbar,history-menu` and `node scripts/verify-address-bar-live.mjs --self-test`, against a rebuilt binary. `powerbrowser.js` changed, so `-purgecaches` is needed; the harness sets `MOZ_PURGE_CACHES=1`. In particular:
  - `ApplicationShell.fit()` after the body attribute flips: confirm the top panel grows by exactly 28px and the web-tab overlay moves down in Coding, Browsing and Organising.
  - The find strip and the toolbar together: the find strip sits below the toolbar inside the widget host. Its own height handling is Phase 32's, and this plan did not change it.
  - Key matching: Ctrl+Shift+T and Ctrl+Shift+B on the page rows through the text-input processor (`key: 'T'` with shift held), and the Theia twins with the pill focused.
  - `listClosedTabs` returning the walked tab's last url (/rc-b) and its history surviving the close (33-01's `keepClosedWebTabHistory`).
  - The `searchPlaces('', 10, 'history')` order: the history-menu scenario expects the newest visit (/hm-b) first.
  - Menu modifiers: Ctrl on a synthetic `mouseup` reaches `renderBarMenu`'s capture listener before Lumino triggers the row.
- Visual check against 33-UI-SPEC:
  - The toolbar's 28px row, item padding and chevron, with no accent ink.
  - The History submenu's 32px rows. Group headers render as stock disabled rows: Theia's per-request `.lm-Menu` gives no per-item class, so the 24px caption header style is not applied.
- Copy judgement for Chris: the toolbar failure row "Press Ctrl+Shift+B twice to try again." and the history read failure "Open this menu again to try again." are not verbatim in 33-UI-SPEC.

## Issues Encountered

None beyond the deviations.

## Next Phase Readiness

- 33-04 can dock the Clear Recent History row into `historyMenuChildren`, anchor the picker under the hamburger, and add Ctrl+Shift+Del with the rule-12 pattern (`ALWAYS_ON_TWINS` if it carries no when-clause).
- 33-05 adds MENU-03 rows at `minPhase: 33`. They render at once, and Bookmarks can be a submenu through `AppMenuView.submenu`.

Final `nix develop .#theia --command scripts/verify-platform.sh --quick`: exit 0, "verify-platform: PASS -- all checks passed".

## Self-Check: PASSED

- FOUND: 9071fdc9, f034817d, b81e23e4 (ancestors of HEAD)
- `node scripts/verify-shortcut-relay.mjs --self-test`: PASS (27 plants)
- `node scripts/verify-site-identity.mjs --self-test`: PASS (53 plants)
- `node scripts/verify-chrome-bar-commands.mjs --self-test`: PASS (7 plants)
- `node scripts/verify-shell-error-copy.mjs --self-test`: PASS
- `node scripts/verify-web-tab-bridge.mjs --self-test`: PASS (40 plants)
- `theia/node_modules/.bin/tsc --noEmit -p theia/extensions/chrome-bar`: clean
