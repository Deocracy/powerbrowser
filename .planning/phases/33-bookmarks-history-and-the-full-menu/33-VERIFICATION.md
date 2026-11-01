---
phase: 33-bookmarks-history-and-the-full-menu
verified: 2026-10-31T00:00:00Z
status: human_needed
score: 5/5 success criteria verified-static; 0 failed
covered_files:
  - ".planning/phases/33-bookmarks-history-and-the-full-menu/33-01-PLAN.md"
  - ".planning/phases/33-bookmarks-history-and-the-full-menu/33-01-SUMMARY.md"
  - ".planning/phases/33-bookmarks-history-and-the-full-menu/33-02-PLAN.md"
  - ".planning/phases/33-bookmarks-history-and-the-full-menu/33-02-SUMMARY.md"
  - ".planning/phases/33-bookmarks-history-and-the-full-menu/33-03-PLAN.md"
  - ".planning/phases/33-bookmarks-history-and-the-full-menu/33-03-SUMMARY.md"
  - ".planning/phases/33-bookmarks-history-and-the-full-menu/33-04-PLAN.md"
  - ".planning/phases/33-bookmarks-history-and-the-full-menu/33-04-SUMMARY.md"
  - ".planning/phases/33-bookmarks-history-and-the-full-menu/33-05-PLAN.md"
  - ".planning/phases/33-bookmarks-history-and-the-full-menu/33-05-SUMMARY.md"
  - "powerbrowser/shell/GroupActorChild.sys.mjs"
  - "powerbrowser/shell/PowerBrowserAPI.sys.mjs"
  - "powerbrowser/shell/powerbrowser.js"
  - "scripts/verify-address-bar-live.mjs"
  - "scripts/verify-address-bar-modes.mjs"
  - "scripts/verify-chrome-bar-commands.mjs"
  - "scripts/verify-clear-history.mjs"
  - "scripts/verify-page-tools-edit.mjs"
  - "scripts/verify-shell-error-copy.mjs"
  - "scripts/verify-shortcut-relay.mjs"
  - "scripts/verify-web-tab-bridge.mjs"
  - "theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx"
  - "theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts"
  - "theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts"
  - "theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts"
  - "theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx"
  - "theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts"
  - "theia/extensions/tab-uris/src/browser/chrome-store-client.ts"
covered_digest: "v3:sha256:5eadf747a12d153d36777481bc8040dc6fce41d207f15114986b1ceefee9e12f"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Run `node scripts/verify-address-bar-live.mjs --scenario bookmark-star,bookmark-editor,bookmark-keys` and `--self-test` against a built binary (SC1)"
    expected: "Star outline/filled by readBookmarkByUrl in Coding, Browsing and Organising; Ctrl+D works Theia-focused (and does not steal Monaco's add-selection-to-next-match in an editor) and page-focused (Name field takes focus); editor Done/Remove/Esc return focus to the star; the ctrl-d-everywhere plant goes red"
    why_human: "No objdir/Gecko build in this worktree. Organising mode may dim the star if its surface keeps no current web tab (33-02 flagged this)"
  - test: "Run `--scenario reopen-closed,history-menu` against a built binary (SC2)"
    expected: "A tab closed after a walked navigation reopens on its row key with `withHistory: true` and its back/forward entries; an empty closed set is a no-op; the History submenu lists Recent pages (newest first) and Recently closed tabs and a closed row reopens"
    why_human: "Needs the built shell; the session-history restore path is Gecko runtime behaviour"
  - test: "Run `--scenario bookmarks-toolbar` against a built binary (SC3)"
    expected: "Ctrl+Shift+B shows a 28px row in Coding, Browsing and Organising; a bookmark added or removed in a stock window pushes `bookmarks-changed` and the row updates with no reload; `ApplicationShell.fit()` grows the top panel by exactly 28px and the web-tab overlay moves down"
    why_human: "The Places observer push and the layout fit are runtime behaviour"
  - test: "Run `--scenario clear-history` against a built binary (SC4)"
    expected: "For each of the five ranges: planted Places visit, closed row, thumbnail, saved page and web-tab history gone; open rows (closed_at NULL) and out-of-range rows kept; POWERBROWSER_TOKEN cookie survives and the Theia backend stays authorised; a refused clear shows the failure row; Esc closes the picker; Ctrl+Shift+Del opens it on both focus paths"
    why_human: "Needs live Places, tabs.sqlite and the profile directory; the static gate proves the fan-out table and the cookie exemption, not the deletions"
  - test: "Run `--scenario app-menu,actions-list,command-centre-privacy` and `--self-test` against a built binary (SC5)"
    expected: "The 280px hamburger shows 17 rows in Firefox order; Full Screen toggles the shell window both ways and the Theia frame re-lays out; New Window opens a stock window and no second shell; About opens the branded dialog; every menu row runs the command id its Actions row runs; Command centre typing sends zero chrome/network requests (the same-session positive control proves the recorder works)"
    why_human: "Runtime window-chrome, Lumino submenu hover/Esc behaviour, and the recorder-based absence proof need the built shell"
  - test: "PAGE-09 live: in a page textarea select text, collapse the selection, then open hamburger > Edit"
    expected: "Cut and Copy dimmed; Paste and Select All enabled; with text selected all enabled; Undo dimmed with nothing undoable; each row performs its edit on the page"
    why_human: "No live scenario exists for this (33-05 says so). It confirms the PowerBrowserEditState child is created for a web-tab overlay and that docShell.isCommandEnabled answers for the page's focused editor after focus moved to the Theia menu. Add a row beside 32-06's `edit` scenario in verify-page-tools-live.mjs"
  - test: "Visual and copy pass against 33-UI-SPEC on KDE Wayland (screenshot with the KWin raise + spectacle)"
    expected: "Star 3px inset and editor anchor; 28px toolbar row; 32px History rows; 320px clear panel with danger ink on Clear only; 280px hamburger geometry. Copy to judge: toolbar failure 'Press Ctrl+Shift+B twice to try again.', history read failure 'Open this menu again to try again.', the 300 ms Lumino submenu delay vs the spec's 200 ms, Edit placed after Zoom, 'Reset Zoom' as the Actions label, the added Settings command"
    why_human: "Rendering and owner judgement; the gates read DOM and strings"
---

# Phase 33: Bookmarks, History and the Full Menu Verification Report

**Phase Goal:** The user bookmarks, reopens and clears from the chrome bar, and the app menu and Actions mode reach every browser action v1.5 ships
**Verified:** 2026-10-31
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

This worktree (workspace/p33) has no objdir and no Gecko build, so nothing here ran in a browser. The owner ruled every live and human check deferred to one end-of-milestone pass. This report is static and goal-backward: for each success criterion it checks that the code exists, that it is wired from the user's entry point to the boundary, and that a derive-and-compare gate or a live scenario covers it. The SUMMARY claims were checked against the code, not taken from it.

No gap was found. All five criteria have code, wiring and a static gate. Each also has a live scenario (written, with plants) that has never run, and PAGE-09's live greying has no scenario at all.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 (BMK-01, BMK-02): the star or Ctrl+D bookmarks the page, the star is filled on bookmarked pages, and the star's popover edits name/folder or removes | VERIFIED-STATIC; live human_needed | `address-bar.tsx:2605-2665` `refreshStar` reads `store.readBookmarkByUrl` for the active URL, and the star toggles `codicon-star-full` / `is-bookmarked`. `openBookmarkStar` (:2675) calls `store.bookmarkPage` on an unbookmarked page, then opens the editor. `saveBookmarkEditor` calls `updateBookmark(guid, title, folder)`, `removeFromBookmarkEditor` calls `removeBookmark(url)`, and a refused write shows a failure row. Ctrl+D: `chrome-bar-keybindings.ts` binds `ctrlcmd+d` to the bookmark-page command with `!editorFocus && !terminalFocus`, and `powerbrowser.js` carries the page-focused `bookmarkPage` relay row (`landsInTheia`). The boundary arms are `bookmarkPage` / `updateBookmark` / `removeBookmark` in `PowerBrowserAPI.sys.mjs:6881-6940`, which use `PlacesUtils.bookmarks.insert/update/remove` and never write SQL. `bookmarks-changed` re-reads the star (:677). Gates PASS: shortcut-relay (43 rows agree), chrome-bar-commands, web-tab-bridge rule 12, shell-error-copy (+self-tests) |
| 2 | SC2 (BMK-03, BMK-06): Ctrl+Shift+T reopens the last closed tab with its back/forward history, and a history menu lists recently closed tabs and recent pages | VERIFIED-STATIC; live human_needed | `reopenClosedTabRow` (`chrome-bar-widget.tsx:527`) calls `store.reopenClosedTab`, arms the saved history with `profileStorage.armWebTabHistory(tab.key)` when `withHistory`, then opens the web tab on the row key. This is the 27-02 restore path, so no history is fabricated. Chrome keeps closed overlays' histories unarmed (cap 25, `keepClosedWebTabHistory`). `reopenClosedTab` (`PowerBrowserAPI.sys.mjs:7027`) returns the newest closed row or null (a no-op). Keys: Theia `ctrlcmd+shift+t` with no when-clause, and the `reopenClosedTab` relay row in `powerbrowser.js` and `chrome-bar-shortcuts.ts`. History submenu: `readHistoryMenu` reads `listClosedTabs` and `searchPlaces('', n, 'history')` in parallel, and `historyMenuChildren` builds the two sections, a disabled reopen row when nothing is closed, and per-section failure rows. `openAppMenu` builds it per request |
| 3 | SC3 (BMK-04): Ctrl+Shift+B shows a bookmarks toolbar that updates at once when a bookmark is added or removed elsewhere | VERIFIED-STATIC; live human_needed | `browser.showBookmarksToolbar` is declared in `chrome-bar-preferences.ts`. The toggle command flips it, and `syncBookmarksToolbar` / `refreshBookmarksToolbar` (:686-715) re-read `listBookmarkFolder('toolbar')` (http(s) rows only). `renderBookmarksToolbar` is mode-independent. The observer is installed once in `installBookmarkObserver` (`PowerBrowserAPI.sys.mjs:6958`). It subscribes to `PlacesUtils.observers` for `bookmark-added|removed|moved|url-changed`, is called from `setGroupSenderPort` (:2260), and pushes `bookmarks-changed` to the shell window's Theia frame. `WebTabChannel.onDidChangeBookmarks` is subscribed by both the toolbar (:507) and the star. `verify-clear-history.mjs` carries the observer-install check, and web-tab-bridge has push-kind parity for `bookmarks-changed`. Keys: Theia `ctrlcmd+shift+b` (when `!editorFocus && !terminalFocus`) plus the relay row |
| 4 | SC4 (BMK-05): Ctrl+Shift+Del clears history over a chosen range, also clears closed tabs, thumbnails, saved pages and web-tab history, and leaves the IDE signed in | VERIFIED-STATIC; live human_needed | One `clearHistory` kind (`PowerBrowserAPI.sys.mjs:7150`) refuses any range outside the five names (`last-hour`, `last-2-hours`, `last-4-hours`, `today`, `everything`). It runs `CLEAR_HISTORY_FANOUT` = places (`History.removeVisitsByFilter`, not Sanitizer), `tabs.closed_at` (closed rows only, `closed_at IS NOT NULL`, so open rows survive), `tabs.thumbnail`, `saved_pages` (DB rows plus only minted `saved-pages/` directories), and web-tab histories (memory and file). Every target runs even if one fails, and any failure fails the kind. No target touches cookies, so the token cookie is exempt by construction. The picker is `ClearHistoryPicker` (five radios, confirm-only `store.clearHistory(range)`, a failure row, Esc/focus restore). Keys: Theia `ctrlcmd+shift+delete` with no when-clause, and the relay row (`VK_DELETE`). `node scripts/verify-clear-history.mjs` PASSES and its `--self-test` PASSES: it derives the fan-out from the store declarations and goes red on a dropped target, a token-enumerating fan-out and a removed observer site |
| 5 | SC5 (MENU-03, SMODE-07): the app menu reaches New Tab, New Window, Bookmarks, History, Downloads, Print, Save Page As, Find in Page, Zoom, Full Screen, More Tools and Help; Actions runs print, downloads, clear history, settings and the other browser actions; Command centre never sends typed text | VERIFIED-STATIC; live human_needed | `MENU_ORDER` (`site-identity-table.ts:90`) has all twelve entries plus Edit (PAGE-09), Settings/Passwords/Add-ons and Quit: 17 rows. `APP_MENU_COMMANDS` maps new-window, downloads, print, save-page, find-in-page, full-screen and settings to `Browser`-category command ids. Bookmarks, Zoom, Edit, More Tools and Help are built per open in `appSubmenu`, each row a `commandLeaf` or a disabled information row. `verify-address-bar-modes.mjs` cases 15-18 PASS: they parse ROADMAP success criterion 5 at check time, require every named entry to be a wired hamburger row in order, require every Actions entry to name a labelled Browser command, require every menu row to run a registered Browser id (a submenu row running its own implementation fails), and require `ActionsAddressBarMode` to enumerate `command.category === CHROME_BAR_COMMAND_CATEGORY` and call only `executeCommand(command.id)`. `MODE_SENDS['command-centre']` is all false, enforced by the same script. `fullScreen` is a `window-chrome`-class kind: command-reachable, never relayed (web-tab-bridge rule 12 PASS), with a catalogue row. The Full Screen id is stable for Phase 35 |
| 6 | PAGE-09 (folded into 33-05 by the coordinator ruling): the Edit menu exists and greys from the page's live enablement | VERIFIED-STATIC; live human_needed | The Edit submenu (undo, redo, cut/copy/paste group, select all) is built in `appSubmenu` and runs the 32-06 Edit command ids. `readEditState` calls `tab.edit(cmd, true)` for the six frozen commands before the menu opens. Chrome's `checkOnly` branch (`PowerBrowserAPI.sys.mjs:6545`) returns `webTabEditEnabled`, which `sendQuery`s `PowerBrowserEditState:Query` to the overlay's child, and `PowerBrowserEditStateChild` (`GroupActorChild.sys.mjs`) answers `docShell.isCommandEnabled(cmd)`. This replaces Gecko's cached flag, which stays true after a collapse. The actor is registered by `registerEditStateActor`, called from `registerGroupActor` (:2246), with `messageManagerGroups: ["browsers"]` and a catalogue row. `verify-page-tools-edit.mjs` PASSES (+self-test, 8 plants) |
| 7 | Hard rules: Places writes only through PowerBrowserAPI, no Theia core edit, brand scan clean | VERIFIED | `internals-boundary`, `internals-catalogue`, `ng-040-internals-catalogue-lines`, `scan-brand-residue`, `chrome-bar-typecheck` and `tab-uris-typecheck` PASS. No Theia-side file mentions `moz_bookmarks` or `places.sqlite`. The phase's `moz_bookmarks` reads in `PowerBrowserAPI.sys.mjs` are pre-existing Phase 29-31 reads. All writes are `PlacesUtils` API calls |

**Score:** 7/7 truths verified statically; every user-visible behaviour is also in the human_needed list below because no live scenario has run.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | six store kinds, `fullScreen`, observer, fan-out, edit-state parent | VERIFIED | Kinds listed at :4114-4120 with arms at :4232-4251; fan-out :7063; observer :6958; edit-state :7200 |
| `powerbrowser/shell/GroupActorChild.sys.mjs` | `PowerBrowserEditStateChild` | VERIFIED | Boolean-only reply, no module import |
| `powerbrowser/shell/powerbrowser.js` | four relay rows | VERIFIED | `bookmarkPage`, `reopenClosedTab`, `toggleBookmarksToolbar`, `clearHistory` |
| `theia/extensions/tab-uris/src/browser/chrome-store-client.ts` | same-named client methods and types | VERIFIED | `typecheck` PASS; client methods are used by the widget and the address bar |
| `theia/extensions/chrome-bar/.../address-bar.tsx` | star, editor | VERIFIED | Substantive and wired; calls the store client only from event handlers |
| `theia/extensions/chrome-bar/.../chrome-bar-widget.tsx` | toolbar, picker, History/app submenus, reopen, Edit state | VERIFIED | Wired to `chrome-bar-commands.ts` through the `set*` openers |
| `theia/extensions/chrome-bar/.../chrome-bar-commands.ts` | reopen, toggle, clear, new-window, full-screen, print, save, find, downloads, settings commands | VERIFIED | `Browser` category; 28 ids and 27 contracted labels match |
| `scripts/verify-clear-history.mjs` | derive-and-compare gate + `--self-test` | VERIFIED | Registered as the `clear-history` and `clear-history-self-test` quick rows |
| `scripts/verify-address-bar-live.mjs` | ten new/extended live scenarios with plants | EXISTS, never run | `bookmark-star`, `bookmark-editor`, `bookmarks-toolbar`, `reopen-closed`, `history-menu`, `clear-history`, `app-menu`, `actions-list`, `bookmark-keys`, `command-centre-privacy` (extended) are in `SCENARIOS` |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| Star / Ctrl+D | `PlacesUtils.bookmarks` | `openBookmarkStar` > `ChromeStoreClient.bookmarkPage` > `case "bookmarkPage"` | WIRED | privileged kind, called only from `address-bar.tsx` handlers (rule 12) |
| Places observer | star and toolbar | `pushBookmarksChanged` > `WebTabChannel.onDidChangeBookmarks` | WIRED | push parity derived both sides |
| Ctrl+Shift+T | session history | `reopenClosedTab` > `armWebTabHistory` > `openUrl(url, key)` | WIRED | |
| Clear panel | five stores | `confirmClearHistory` > `clearHistory` > `CLEAR_HISTORY_FANOUT` | WIRED | |
| Hamburger row | Actions row | `APP_MENU_COMMANDS` / `commandLeaf` > `executeCommand(id)`; Actions `executeCommand(command.id)` | WIRED | one implementation per id, gate-enforced |
| Edit row grey | page | `readEditState` > `webTabEdit{checkOnly}` > `webTabEditEnabled` > edit-state child | WIRED | |
| Full Screen row | shell window | `toggleFullScreenRow` > `store.fullScreen()` > `toggleShellFullscreen` | WIRED | |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| star | `starBookmark` | `readBookmarkByUrl` > Places | Yes | FLOWING |
| bookmarks toolbar | `items` | `listBookmarkFolder('toolbar')` > Places | Yes | FLOWING |
| History submenu | `closed`, `recent` | `listClosedTabs` (tabs.sqlite), `searchPlaces` (Places) | Yes | FLOWING |
| Bookmarks submenu recent rows | `bookmarks` | `searchPlaces('', n, 'bookmark')` | Yes | FLOWING |
| Edit rows | `editState` | child-side `docShell.isCommandEnabled` | Yes | FLOWING (live unconfirmed) |

### Behavioral Spot-Checks

Run in this worktree with no browser. All exit 0, each plain and with `--self-test`.

| Check | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| clearHistory fan-out, ranges, token exemption, observer | `node scripts/verify-clear-history.mjs [--self-test]` | PASS | PASS |
| Command ids and labels (28 ids, 27 labels) | `node scripts/verify-chrome-bar-commands.mjs [--self-test]` | PASS | PASS |
| MENU-03 from ROADMAP, SMODE-07, MODE_SENDS (25 cases; 23 plants) | `node scripts/verify-address-bar-modes.mjs [--self-test]` | PASS | PASS |
| Shortcut relay (43 rows agree) | `node scripts/verify-shortcut-relay.mjs [--self-test]` | PASS | PASS |
| Rule 12 store-kind classes, push parity (32 webTab kinds; 47 plants) | `node scripts/verify-web-tab-bridge.mjs [--self-test]` | PASS | PASS |
| User-facing copy has no internals (14 plants) | `node scripts/verify-shell-error-copy.mjs [--self-test]` | PASS | PASS |
| Edit set and live greying chain (8 plants) | `node scripts/verify-page-tools-edit.mjs [--self-test]` | PASS | PASS |
| Hamburger order and site identity (43 cases) | `node scripts/verify-site-identity.mjs [--self-test]` | PASS | PASS |
| Boundary, catalogue, catalogue lines, brand scan, chrome-bar and tab-uris typecheck | `nix develop .#theia --command scripts/verify-platform.sh --only <label>` | all PASS | PASS |

### Probe Execution

Step 7c: SKIPPED. Phase 33 declares no `scripts/*/tests/probe-*.sh`. The live scenarios are the phase's runtime probes and need the built binary.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| BMK-01 | 33-01, 33-02 | Star and Ctrl+D bookmark; star filled | SATISFIED (static); live deferred | Truth 1 |
| BMK-02 | 33-02 | Editor edits name/folder or removes | SATISFIED (static); live deferred | Truth 1 |
| BMK-03 | 33-01, 33-03 | Ctrl+Shift+T reopens with history | SATISFIED (static); live deferred | Truth 2 |
| BMK-04 | 33-01, 33-03 | Toolbar with live observer refresh | SATISFIED (static); live deferred | Truth 3 |
| BMK-05 | 33-01, 33-04 | Ranged clear across all stores, token exempt | SATISFIED (static); live deferred | Truth 4 |
| BMK-06 | 33-03 | History menu: closed tabs and recent pages | SATISFIED (static); live deferred | Truth 2 |
| MENU-03 | 33-05 | Full hamburger | SATISFIED (static); live deferred | Truth 5 |
| SMODE-07 | 33-05 | Actions coverage; Command centre silent | SATISFIED (static); live deferred | Truth 5 |
| PAGE-09 | 33-05 (from 32-06 ruling) | Edit menu greyed from live enablement | SATISFIED (static); live deferred, no scenario | Truth 6 |

No orphaned requirement: BMK-01..06, MENU-03 and SMODE-07 are the ROADMAP list, and PAGE-09 is carried by 33-05 per the ruling. `.planning/REQUIREMENTS.md` still shows these as unchecked / Pending (PAGE-09's box is already checked). The orchestrator should tick them when it accepts this phase; this verifier did not edit them.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (phase files) | - | TBD / FIXME / XXX scan over the phase's changed sources | None found | - |
| `chrome-bar-commands.ts` | ~448 | Full Screen `isEnabled: () => !!currentWebTab()` | Info | The command, and so its Actions row, is disabled with no web tab, though the shell-window toggle needs none. Intentional per 33-05 (rows dim "with no web tab"); the owner may prefer it always enabled |
| `33-VALIDATION.md` | frontmatter | `status: draft`, `nyquist_compliant: false`, Wave 0 boxes unticked | Info | Never updated after execution. The Wave 0 files it lists do exist. Not a goal gap |

### Human Verification Required

See the frontmatter `human_verification` list (six items). Each item names the exact live scenario or the exact manual steps. In order: SC1 `bookmark-star,bookmark-editor,bookmark-keys`; SC2 `reopen-closed,history-menu`; SC3 `bookmarks-toolbar`; SC4 `clear-history`; SC5 `app-menu,actions-list,command-centre-privacy`; the PAGE-09 manual check (no scenario exists); and the visual and copy pass.

All live runs need `objdir/dist/bin/powerbrowser` rebuilt (`PowerBrowserAPI.sys.mjs`, `GroupActorChild.sys.mjs` and `powerbrowser.js` changed, so `-purgecaches`; the harness sets `MOZ_PURGE_CACHES=1`) and the last Theia app build. Also run `verify-address-bar-live.mjs --self-test`, because the clean-then-planted sessions are what prove the scenarios can go red.

### Gaps Summary

No gaps. Every success criterion has code that exists, is substantive and is wired from the user's entry point to the Places or store boundary, and each is held by a derive-and-compare static gate that I ran at HEAD with its self-test. The status is `human_needed` rather than `passed` because the runtime behaviour of the observer push, the session-history restore, the clear-history deletions and the Gecko window-chrome and actor paths has not been observed in a browser, which is the owner's deferred end-of-milestone pass. One piece, PAGE-09's live greying, has no live scenario written, so that pass needs a manual step or a new row.

---

_Verified: 2026-10-31_
_Verifier: Claude (gsd-verifier)_
