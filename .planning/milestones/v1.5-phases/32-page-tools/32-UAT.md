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
capture: "39-16 headed (PB_CAPTURE_DIR, f984b2fd): .planning/phases/39-v1-5-close-out/captures/32-T1-crash-ui.png shows the crashed tab with the crash copy, the Reload tab button and the strip's crashed mark. Look for Chris"

### 2. Reader view toggle in the light theme and in the dark theme
expected: Enabled only on article pages (or in reader view); enters and leaves reader view in the same tab; legible in both themes
result: [pending]
live: "39-16, 116ac682: reader PASS. The toggle enables on an article page and enters and leaves reader view in the same tab, with Back and Forward kept. A short page keeps the toggle disabled with the non-article tooltip. Plant reader-signal-dropped is red"
capture: "39-16 headed (f984b2fd): .planning/phases/39-v1-5-close-out/captures/32-T2-reader-light.png and 32-T2-reader-dark.png, taken in reader view after workbench.colorTheme was set to light and then to dark. The harness checks that the body carries theia-light and then theia-dark before each capture. Finding for Chris: the two captures differ only in the page scrollbar. The chrome bar, the tab strip and the reader toggle keep their dark palette under the light Theia theme, so 'legible in both themes' compares two dark bars"

### 3. Favicons at 16px on the Browsing-mode strip and the Tabs-mode pill rows; dock tab bar scope
expected: Strip and pill rows show the site icon, crisp at 16px. Decide whether the dock tab bar in non-Browsing modes must also show the favicon and audio mark (today: codicon-globe, no audio mark or mute control — web-tab.ts:617,1208)
result: [pending]
live: "39-16, 116ac682: favicon PASS. The page's data: icon reaches a state push, and both the strip row and the Tabs-mode pill row draw it as an img with that URL. Plants favicon-http-src and favicon-pill-http-src are red"
capture: "39-16 headed (f984b2fd): .planning/phases/39-v1-5-close-out/captures/32-T3-favicons.png shows the icon tab's strip row and the Tabs-mode pill row with the 16px icon. Crispness is for Chris"
owner: "Chris 2026-11-05 via AskUserQuestion: box 32, Accept all (Recommended). T3: keep dock-bar scope as is and log a backlog row."

### 4. DevTools toolbox window (F12)
expected: F12 on a focused page opens one stock DevTools toolbox window for that page; a second F12 keeps one; closing the tab closes it
result: [pending]
live: "39-16, 116ac682: devtools PASS. F12 relays from the page and opens one toolbox, a second open keeps one, closing the tab closes its toolbox window, and a quit with a toolbox open exits (in 752 ms). Plant devtools-open-dropped is red. The toolbox window's look is still for Chris"
capture: "39-16 headed (f984b2fd): .planning/phases/39-v1-5-close-out/captures/32-T4-devtools-toolbox.png is the toolbox window itself, captured with captureActive while KWin reported it active: class powerbrowser, caption 'Developer Tools — Find fixture — http://127.0.0.1:<port>/find', 900x348"

### 5. Downloads button and panel on screen; Open and Show in folder
expected: Start a page download, open the Downloads button. Open launches the file with the OS handler; Show in folder opens the file manager on it; arrow keys move between rows; Esc closes the panel and returns focus to the page; the badge clears for finished rows once the panel opens (PAGE-06 stays Pending until this passes)
result: [pending]

### 6. Find strip layout, toggles, and F3 on a closed bar
expected: Ctrl+F shows the 32px strip under the bar and the page moves down by its height (nothing covers the page); Match case and Whole words change the count; with the bar closed, F3 opens it (focus stays on the page) and steps to the next match (`59f61fd1`)
result: [pending]
live: "39-16, 116ac682: find PASS. A find reports three matches with a current index, and FindNext moves it. With the bar closed, F3 from the page opens the bar and steps. Ctrl+F opens the bar. Highlight-all goes on and then off. A step after a navigation still finds, and FindClose resets the counts. Plants find-kind-dropped, find-step-noop and find-f3-bar-closed are red. The 32px layout and the toggles' effect on screen are still for Chris"
fixed: "39-16, 10c17a52: the first capture showed the strip drawn over the page. The strip sits in the top panel, whose height comes from the panel's CSS min-height, and opening the bar never grew it. The measured page rect stayed at top 73px with the strip at 73-105px, and the overlay stayed at top 73px. The fix adds a body attribute data-pb-find-strip and a --pb-find-strip-height variable (32px) to the top-panel min-heights, then calls shell.fit(). After the fix the page rect and the overlay start at 105px. The find scenario now asserts that the page rect starts below the strip's bottom. Its new plant find-strip-overlays goes red with 'the find strip covers the page', and `--self-test --only find` PASS (4 plants)"
capture: "39-16 headed (f984b2fd): .planning/phases/39-v1-5-close-out/captures/32-T6-find-strip.png shows the strip docked under the bar with 3 of 3 and the toggles, and the page moved down by 32px. Match case and Whole words were not clicked on screen; that is for Chris"

### 7. Ctrl+P system print dialog
expected: Ctrl+P on a focused page opens the OS print dialog for that page; cancel does nothing else. window.print() from page content has no shell path in this phase (D-09a)
result: pass
evidence: "39-16 headed (f984b2fd): `PB_CAPTURE_DIR=... node scripts/verify-page-tools-live.mjs --scenario print-dialog` PASS. Ctrl+P relayed from the focused page, and KWin reported the active window as class powerbrowser, caption 'Print', 652x512 (the GTK print dialog). A real Escape was sent through pb-kwin's gate, and the shell (caption 'PowerBrowser') was active again within 10 s. The page was unchanged: same URL, history length 1 before and after, no tab-modal box"
capture: ".planning/phases/39-v1-5-close-out/captures/32-T7-print-dialog.png is the GTK dialog alone (Print to File, Print to LPR). The look is for Chris"

### 8. Audio on a hand-started binary (32-REVIEW WR-10)
expected: Start objdir/dist/bin/powerbrowser by hand and play audio in a web tab: sound plays and the strip shows the audio mark and mute. Today libpulse does not load outside the harness's LD_LIBRARY_PATH on this host — decide whether PAGE-05 stands with the packaging follow-up open
result: issue
evidence: "39-16 (2026-11-06): objdir/dist/bin/powerbrowser hand-started with `env -u LD_LIBRARY_PATH`, a throwaway profile with autoplay allowed, and a looping 440 Hz tone page from a loopback server (opened as a command-line URL, which lands in a stock window of the same process). After 25 s pw-dump showed no Stream/Output/Audio node for the process, and stderr (MOZ_LOG=cubeb:4) read: '[Parent <pid>: AudioIPC Server RPC]: E/cubeb context.rs:55: libpulse not found'. Control, same run, with LD_LIBRARY_PATH set to the objdir's MOZ_PULSEAUDIO_LIBS dir: two nodes {name PowerBrowser, binary powerbrowser, media 'tone', state running}. pactl is not installed on this host (PipeWire), so pw-dump was the read. Both browsers were quit and confirmed gone. PAGE-05 stands with the packaging follow-up open (owner 2026-11-05)"
owner: "Chris 2026-11-07 via AskUserQuestion: Keep unticked until 999.19 (Recommended)"

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
passed: 4
issues: 1
pending: 6
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
