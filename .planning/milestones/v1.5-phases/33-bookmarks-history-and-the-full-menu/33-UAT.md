---
status: partial
phase: 33-bookmarks-history-and-the-full-menu
source: [33-VERIFICATION.md]
started: 2026-11-01T00:00:00Z
updated: 2026-11-06T14:54:18.000Z
---

Deferred to the one end-of-milestone pass (Chris, 2026-10-31). Run on `objdir/dist/bin/powerbrowser` with `-purgecaches` after any shell-module change, with the last Theia app build. Live scenarios are in `node scripts/verify-address-bar-live.mjs`; also run its `--self-test`.

## Current Test

[testing complete]

## Tests

### 1. Bookmark star, editor and Ctrl+D (SC1)
expected: `node scripts/verify-address-bar-live.mjs --scenario bookmark-star,bookmark-editor,bookmark-keys` passes. Organising mode may dim the star if its surface keeps no current web tab (33-02 flagged this)
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: bookmark-star, bookmark-editor and bookmark-keys PASS in the full address-bar run (AB-3 harness fix c52002f9)"

### 2. Reopen closed tab and History submenu (SC2)
expected: `--scenario reopen-closed,history-menu` passes. A tab closed after a walked navigation reopens on its row key with `withHistory: true` and its back/forward entries; an empty closed set is a no-op; the History submenu lists Recent pages (newest first) and Recently closed tabs and a closed row reopens
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: reopen-closed and history-menu PASS. reopen-closed needed the AB-4 product fix (1642f2d7): a pill navigation now marks the page it leaves, so Back reaches it; history-menu needed AB-5 (c52002f9)"
live: "39-08 (2026-11-06), main, 039bc791: `node scripts/verify-nav-keys-live.mjs --scenario back-no-interaction` PASS. The scenario goes /n1 to /n2 through webTabNavigate with no interaction in the page; Back is enabled and returns to /n1. `--self-test` PASS: the clean control is green and all 12 plants go red. Plant history-entry-unmarked (the pre-1642f2d7 behaviour) is red with 'Back did not return after a navigation with no page interaction: Back stayed disabled on /n2'"

### 3. Bookmarks toolbar (SC3)
expected: `--scenario bookmarks-toolbar` passes. Ctrl+Shift+B shows a 28px row in Coding, Browsing and Organising; a bookmark added or removed in a stock window pushes `bookmarks-changed` and the row updates with no reload; `ApplicationShell.fit()` grows the top panel by exactly 28px and the web-tab overlay moves down
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: bookmarks-toolbar PASS run alone on the rebuilt Theia with the AB-2 product fix (1642f2d7: min-width 0, overflow goes to the chevron). In every full address-bar run (3 of 3) it stops on the instrument line 'broken instrument: the session tab page could not be focused', so an earlier scenario leaves page focus unreachable (deferred below)"
live: "39-08 (2026-11-06), main: the leak was the trusted pointer, not focus. mode-lifetime and mode-defaults switch PowerBrowser modes by clicking a toggle segment; Organising puts the bar where Browsing has its tab strip, so the pointer was left on the strip at (1124,20) or (1024,20), and from bookmark-star on, a .pb-tab-preview card for an unseen tab was open. That card is a blocking layer, so the session tab's overlay stayed hidden. Pair runs could not reproduce it (bookmark-editor,bookmarks-toolbar and search,mode-defaults,bookmarks-toolbar were green, because they open too few tabs to put one under the pointer). The full prefix through bookmarks-toolbar was red with mode-defaults and also without it (the pointer left by mode-lifetime). Fixed in switchUiMode and mode-lifetime's teardown (0b69d339): the pointer goes back onto the segment and waits for no preview card. The chevron settle (76231ef3) closes the address-bar-live-self-test baseline row. Three consecutive full `node scripts/verify-address-bar-live.mjs` runs at c17a549d each exited 0 with 40 PASS, bookmarks-toolbar PASS in each"

### 4. Clear history (SC4)
expected: `--scenario clear-history` passes. For each of the five ranges: planted Places visit, closed row, thumbnail, saved page and web-tab history gone; open rows (closed_at NULL) and out-of-range rows kept; POWERBROWSER_TOKEN cookie survives and the Theia backend stays authorised; a refused clear shows the failure row; Esc closes the picker; Ctrl+Shift+Del opens it on both focus paths
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: clear-history PASS (AB-6 harness fix c52002f9)"

### 5. App menu, Actions list and Command centre privacy (SC5)
expected: `--scenario app-menu,actions-list,command-centre-privacy` passes. The 280px hamburger shows 17 rows in Firefox order; Full Screen toggles the shell window both ways and the Theia frame re-lays out; New Window opens a stock window and no second shell; About opens the branded dialog; every menu row runs the command id its Actions row runs; Command centre typing sends zero chrome/network requests (the same-session positive control proves the recorder works)
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: app-menu, actions-list and command-centre-privacy PASS (AB-7, AB-8 harness fixes c52002f9)"

### 6. PAGE-09 Edit menu greying (manual, no scenario exists)
expected: In a page textarea select text, collapse the selection, then open hamburger > Edit. Cut and Copy dimmed; Paste and Select All enabled; with text selected all enabled; Undo dimmed with nothing undoable; each row performs its edit on the page. Confirms the PowerBrowserEditState child is created for a web-tab overlay and docShell.isCommandEnabled answers after focus moved to the Theia menu. Add a row beside 32-06's `edit` scenario in verify-page-tools-live.mjs
result: pass
evidence: "39-16 (2026-11-06), main, 116ac682: `node scripts/verify-page-tools-live.mjs --scenario edit-greying` PASS, and it passed again inside `scripts/verify-platform.sh --only page-tools-live` (20 scenarios PASS). The textarea is focused in the page, then chrome focus moves to the Theia frame and the hamburger's Edit submenu is read. With the caret collapsed and nothing to undo, Undo, Cut and Copy are dimmed and Paste and Select All are enabled. After a Paste, Undo is enabled. With the whole value selected, Cut, Copy, Paste and Select All are enabled. Paste, Undo, Select All, Copy, Paste, Select All, Cut and Paste are each chosen from the submenu, and each one's effect is read back from the textarea's value and caret. `--self-test` (page-tools-live-self-test, 22 plants) PASS: plant edit-state-stale replays the first open's edit-state replies and goes red with 'Edit row state did not follow the page selection'"

### 7. Visual and copy pass against 33-UI-SPEC (KDE Wayland, KWin raise + spectacle)
expected: Star 3px inset and editor anchor; 28px toolbar row; 32px History rows; 320px clear panel with danger ink on Clear only; 280px hamburger geometry. Owner judges copy: toolbar failure "Press Ctrl+Shift+B twice to try again.", history read failure "Open this menu again to try again.", the 300 ms Lumino submenu delay vs the spec's 200 ms, Edit placed after Zoom, "Reset Zoom" as the Actions label, the added Settings command
result: [pending]
owner: "Chris 2026-11-05 via AskUserQuestion: box 33, Accept shipped values (Recommended): accept the shipped values (300 ms submenu delay, Edit placement, Settings command, copy strings) and amend 33-UI-SPEC to match."
capture: "39-16 headed (f984b2fd, `--scenario menu-captures`): .planning/phases/39-v1-5-close-out/captures/33-T7-hamburger.png (the menu, 17 rows, at the hamburger), 33-T7-history-rows.png (History submenu: Reopen Closed Tab, Recently closed tabs, Recent pages, Clear Recent History...), 33-T7-star-editor.png (the 'Bookmark this page' editor under the star), 33-T7-bookmarks-toolbar.png (the toolbar row under the bar) and 33-T7-clear-panel.png (the Clear Recent History panel; only Clear carries the danger ink). Notes for Chris: in the star editor the 'Remove bookmark' label wraps onto two lines and overflows its button, and History > Recent pages lists 'http://127.0.0.1:<port>/find - PowerBrowser' as well as 'Find fixture' for the same page"

## Summary

total: 7
passed: 6
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

## Deferred Follow-Ups

```yaml
- test: 3
  idea: "bookmarks-toolbar stops in every full address-bar run (3 of 3) on 'broken instrument: the session tab page could not be focused' and passes alone; find the earlier scenario that leaves page focus unreachable"
  deferred_at: 2026-11-04
- test: 2
  idea: "verify-nav-keys-live drives Back only after a real click in the page (interactWith), so it cannot see an AB-4 style regression; add a navigate leg with no interaction"
  deferred_at: 2026-11-04
- test: none
  idea: "AB-9: the mode-tokens *x step failed once in four address-bar runs (flaky, minor)"
  deferred_at: 2026-11-04
```
