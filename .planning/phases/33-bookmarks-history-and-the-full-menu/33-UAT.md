---
status: testing
phase: 33-bookmarks-history-and-the-full-menu
source: [33-VERIFICATION.md]
started: 2026-11-01T00:00:00Z
updated: 2026-11-01T00:00:00Z
---

Deferred to the one end-of-milestone pass (Chris, 2026-10-31). Run on `objdir/dist/bin/powerbrowser` with `-purgecaches` after any shell-module change, with the last Theia app build. Live scenarios are in `node scripts/verify-address-bar-live.mjs`; also run its `--self-test`.

## Current Test

number: 1
name: Bookmark star, editor and Ctrl+D (SC1)
expected: |
  Star outline/filled by readBookmarkByUrl in Coding, Browsing and Organising; Ctrl+D works Theia-focused
  (and does not steal Monaco's add-selection-to-next-match in an editor) and page-focused (Name field takes focus);
  editor Done/Remove/Esc return focus to the star; the ctrl-d-everywhere plant goes red.
awaiting: user response

## Tests

### 1. Bookmark star, editor and Ctrl+D (SC1)
expected: `node scripts/verify-address-bar-live.mjs --scenario bookmark-star,bookmark-editor,bookmark-keys` passes. Organising mode may dim the star if its surface keeps no current web tab (33-02 flagged this)
result: [pending]

### 2. Reopen closed tab and History submenu (SC2)
expected: `--scenario reopen-closed,history-menu` passes. A tab closed after a walked navigation reopens on its row key with `withHistory: true` and its back/forward entries; an empty closed set is a no-op; the History submenu lists Recent pages (newest first) and Recently closed tabs and a closed row reopens
result: [pending]

### 3. Bookmarks toolbar (SC3)
expected: `--scenario bookmarks-toolbar` passes. Ctrl+Shift+B shows a 28px row in Coding, Browsing and Organising; a bookmark added or removed in a stock window pushes `bookmarks-changed` and the row updates with no reload; `ApplicationShell.fit()` grows the top panel by exactly 28px and the web-tab overlay moves down
result: [pending]

### 4. Clear history (SC4)
expected: `--scenario clear-history` passes. For each of the five ranges: planted Places visit, closed row, thumbnail, saved page and web-tab history gone; open rows (closed_at NULL) and out-of-range rows kept; POWERBROWSER_TOKEN cookie survives and the Theia backend stays authorised; a refused clear shows the failure row; Esc closes the picker; Ctrl+Shift+Del opens it on both focus paths
result: [pending]

### 5. App menu, Actions list and Command centre privacy (SC5)
expected: `--scenario app-menu,actions-list,command-centre-privacy` passes. The 280px hamburger shows 17 rows in Firefox order; Full Screen toggles the shell window both ways and the Theia frame re-lays out; New Window opens a stock window and no second shell; About opens the branded dialog; every menu row runs the command id its Actions row runs; Command centre typing sends zero chrome/network requests (the same-session positive control proves the recorder works)
result: [pending]

### 6. PAGE-09 Edit menu greying (manual, no scenario exists)
expected: In a page textarea select text, collapse the selection, then open hamburger > Edit. Cut and Copy dimmed; Paste and Select All enabled; with text selected all enabled; Undo dimmed with nothing undoable; each row performs its edit on the page. Confirms the PowerBrowserEditState child is created for a web-tab overlay and docShell.isCommandEnabled answers after focus moved to the Theia menu. Add a row beside 32-06's `edit` scenario in verify-page-tools-live.mjs
result: [pending]

### 7. Visual and copy pass against 33-UI-SPEC (KDE Wayland, KWin raise + spectacle)
expected: Star 3px inset and editor anchor; 28px toolbar row; 32px History rows; 320px clear panel with danger ink on Clear only; 280px hamburger geometry. Owner judges copy: toolbar failure "Press Ctrl+Shift+B twice to try again.", history read failure "Open this menu again to try again.", the 300 ms Lumino submenu delay vs the spec's 200 ms, Edit placed after Zoom, "Reset Zoom" as the Actions label, the added Settings command
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
