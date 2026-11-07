---
status: partial
phase: 32-page-tools
source: [32-VERIFICATION.md, 32-REVIEW.md]
started: 2026-11-01T00:00:00Z
updated: 2026-11-06T14:54:18.000Z
---

Deferred to the one end-of-milestone pass (Chris, 2026-10-31). Run on `objdir/dist/bin/powerbrowser` with `-purgecaches` after any shell-module change.

## Current Test

[testing complete]

## Tests

### 1. Crashed tab — crash UI look, Reload tab, and WR-08 navigate-after-restore
expected: Crash copy and Reload tab in place of the page; Reload restores page and history; after a second crash, navigating from the pill loads the new URL with the kept history behind it (32-REVIEW WR-08, `0cbb77b6`)
result: [pending]
suite: "39-16 (2026-11-06), main, 116ac682: `scripts/verify-platform.sh --only page-tools-live` PASS, with all 20 default scenarios PASS (find, zoom, audio, keys-theia, favicon, reader, source, crash, crash-reader, crash-switching, crash-navigate, devtools, downloads, downloads-today, print, save, edit, edit-greying, edit-today, print-today). `--only page-tools-live-self-test` PASS: every clean control is green and all 22 planted faults go red. Logs are in /tmp/pb-39-16/. This run replaces the earlier unsourced claim of a page-tools pass on 2026-11-04"
live: "39-16, 116ac682: crash, crash-reader, crash-switching and crash-navigate PASS. The contracted crash copy and the Reload tab button show and the overlay hides. Reload tab brings the page back with its history, including the reader entry and a crash that happens mid process switch. After a crash, Back and Forward are disabled, and a URL sent to the tab loads with the kept history behind it (WR-08). The look is still for Chris"

### 2. Reader view toggle in the light theme and in the dark theme
expected: Enabled only on article pages (or in reader view); enters and leaves reader view in the same tab; legible in both themes
result: [pending]

### 3. Favicons at 16px on the Browsing-mode strip and the Tabs-mode pill rows; dock tab bar scope
expected: Strip and pill rows show the site icon, crisp at 16px. Decide whether the dock tab bar in non-Browsing modes must also show the favicon and audio mark (today: codicon-globe, no audio mark or mute control — web-tab.ts:617,1208)
result: [pending]
owner: "Chris 2026-11-05 via AskUserQuestion: box 32, Accept all (Recommended). T3: keep dock-bar scope as is and log a backlog row."

### 4. DevTools toolbox window (F12)
expected: F12 on a focused page opens one stock DevTools toolbox window for that page; a second F12 keeps one; closing the tab closes it
result: [pending]
live: "39-16, 116ac682: devtools PASS. F12 relays from the page and opens one toolbox, a second open keeps one, closing the tab closes its toolbox window, and a quit with a toolbox open exits (in 752 ms). Plant devtools-open-dropped is red. The toolbox window's look is still for Chris"

### 5. Downloads button and panel on screen; Open and Show in folder
expected: Start a page download, open the Downloads button. Open launches the file with the OS handler; Show in folder opens the file manager on it; arrow keys move between rows; Esc closes the panel and returns focus to the page; the badge clears for finished rows once the panel opens (PAGE-06 stays Pending until this passes)
result: [pending]

### 6. Find strip layout, toggles, and F3 on a closed bar
expected: Ctrl+F shows the 32px strip under the bar and the page moves down by its height (nothing covers the page); Match case and Whole words change the count; with the bar closed, F3 opens it (focus stays on the page) and steps to the next match (`59f61fd1`)
result: [pending]
live: "39-16, 116ac682: find PASS. A find reports three matches with a current index, and FindNext moves it. With the bar closed, F3 from the page opens the bar and steps. Ctrl+F opens the bar. Highlight-all goes on and then off. A step after a navigation still finds, and FindClose resets the counts. Plants find-kind-dropped, find-step-noop and find-f3-bar-closed are red. The 32px layout and the toggles' effect on screen are still for Chris"

### 7. Ctrl+P system print dialog
expected: Ctrl+P on a focused page opens the OS print dialog for that page; cancel does nothing else. window.print() from page content has no shell path in this phase (D-09a)
result: [pending]

### 8. Audio on a hand-started binary (32-REVIEW WR-10)
expected: Start objdir/dist/bin/powerbrowser by hand and play audio in a web tab: sound plays and the strip shows the audio mark and mute. Today libpulse does not load outside the harness's LD_LIBRARY_PATH on this host — decide whether PAGE-05 stands with the packaging follow-up open
result: [pending]
owner: "Chris 2026-11-05 via AskUserQuestion: box 32, Accept all (Recommended). T8: keep PAGE-05 standing and log the packaging follow-up."

### 9. Judgment-tier prohibitions (32-VERIFICATION Prohibitions table)
expected: Confirm or reject each flagged, non-gate-proven verdict, including the 32-09 backstop (no commit of the regenerated 050 before its rebuild)
result: pass
evidence: "owner decision 2026-11-05"
owner: "Chris 2026-11-05 via AskUserQuestion: box 32, Accept all (Recommended). T9/T10: accept both verifier overrides and the judgment verdicts."

### 10. Confirm the two verifier overrides
expected: Accept or reopen (a) the 32-07 docShellIsActive re-assert closed as obsolete after afda7df1 and (b) the D-25b four-tab harness cap kept in verify-ext-tab-host-live / verify-site-identity-live
result: pass
evidence: "owner decision 2026-11-05"
owner: "Chris 2026-11-05 via AskUserQuestion: box 32, Accept all (Recommended). T9/T10: accept both verifier overrides and the judgment verdicts."

### 11. PAGE-09 owner
expected: Phase 33's plans (or a new plan) include the Edit menu entries and greying, or PAGE-09 is re-scoped. Phase 33's criteria and plans 33-01..33-05 do not contain it today
result: pass
evidence: "owner decision 2026-11-05: PAGE-09 delivered by 33-05"
owner: "Chris 2026-11-05 via AskUserQuestion: box 32, Accept all (Recommended). T11: close, delivered by 33-05, PAGE-09 already ticked."

## Summary

total: 11
passed: 3
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps

## Deferred Follow-Ups

```yaml
- test: 3
  idea: "dock tab bar in non-Browsing modes shows codicon-globe with no favicon, audio mark or mute control (web-tab.ts:617,1208); owner kept that scope on 2026-11-05, so log a backlog row for it (source: 32-UAT test 3)"
  deferred_at: 2026-11-05
- test: 8
  idea: "release packaging must make libpulse load for a hand-started objdir/dist/bin/powerbrowser (today only the harness LD_LIBRARY_PATH finds it); PAGE-05 stands with this packaging follow-up open, owner 2026-11-05 (source: 32-UAT test 8)"
  deferred_at: 2026-11-05
```
