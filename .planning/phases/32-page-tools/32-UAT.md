---
status: partial
phase: 32-page-tools
source: [32-VERIFICATION.md, 32-REVIEW.md]
started: 2026-11-01T00:00:00Z
updated: 2026-11-05T01:52:09.504Z
---

Deferred to the one end-of-milestone pass (Chris, 2026-10-31). Run on `objdir/dist/bin/powerbrowser` with `-purgecaches` after any shell-module change.

## Current Test

[testing complete]

## Tests

### 1. Crashed tab — crash UI look, Reload tab, and WR-08 navigate-after-restore
expected: Crash copy and Reload tab in place of the page; Reload restores page and history; after a second crash, navigating from the pill loads the new URL with the kept history behind it (32-REVIEW WR-08, `0cbb77b6`)
result: [pending]

### 2. Reader view toggle in the light theme and in the dark theme
expected: Enabled only on article pages (or in reader view); enters and leaves reader view in the same tab; legible in both themes
result: [pending]

### 3. Favicons at 16px on the Browsing-mode strip and the Tabs-mode pill rows; dock tab bar scope
expected: Strip and pill rows show the site icon, crisp at 16px. Decide whether the dock tab bar in non-Browsing modes must also show the favicon and audio mark (today: codicon-globe, no audio mark or mute control — web-tab.ts:617,1208)
result: [pending]

### 4. DevTools toolbox window (F12)
expected: F12 on a focused page opens one stock DevTools toolbox window for that page; a second F12 keeps one; closing the tab closes it
result: [pending]

### 5. Downloads button and panel on screen; Open and Show in folder
expected: Start a page download, open the Downloads button. Open launches the file with the OS handler; Show in folder opens the file manager on it; arrow keys move between rows; Esc closes the panel and returns focus to the page; the badge clears for finished rows once the panel opens (PAGE-06 stays Pending until this passes)
result: [pending]

### 6. Find strip layout, toggles, and F3 on a closed bar
expected: Ctrl+F shows the 32px strip under the bar and the page moves down by its height (nothing covers the page); Match case and Whole words change the count; with the bar closed, F3 opens it (focus stays on the page) and steps to the next match (`59f61fd1`)
result: [pending]

### 7. Ctrl+P system print dialog
expected: Ctrl+P on a focused page opens the OS print dialog for that page; cancel does nothing else. window.print() from page content has no shell path in this phase (D-09a)
result: [pending]

### 8. Audio on a hand-started binary (32-REVIEW WR-10)
expected: Start objdir/dist/bin/powerbrowser by hand and play audio in a web tab: sound plays and the strip shows the audio mark and mute. Today libpulse does not load outside the harness's LD_LIBRARY_PATH on this host — decide whether PAGE-05 stands with the packaging follow-up open
result: [pending]

### 9. Judgment-tier prohibitions (32-VERIFICATION Prohibitions table)
expected: Confirm or reject each flagged, non-gate-proven verdict, including the 32-09 backstop (no commit of the regenerated 050 before its rebuild)
result: [pending]

### 10. Confirm the two verifier overrides
expected: Accept or reopen (a) the 32-07 docShellIsActive re-assert closed as obsolete after afda7df1 and (b) the D-25b four-tab harness cap kept in verify-ext-tab-host-live / verify-site-identity-live
result: [pending]

### 11. PAGE-09 owner
expected: Phase 33's plans (or a new plan) include the Edit menu entries and greying, or PAGE-09 is re-scoped. Phase 33's criteria and plans 33-01..33-05 do not contain it today
result: [pending]

## Summary

total: 11
passed: 0
issues: 0
pending: 11
skipped: 0
blocked: 0

## Gaps
