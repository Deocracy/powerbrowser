---
phase: 39-v1-5-close-out
plan: 16
subsystem: live-harness
tags: [page-tools, tab-strip, captures, uat, page-09, page-01, bmk-07, tab-04]
status: complete
requires: [39-15 real input and pb-kwin gate]
provides:
  - "page-tools-live edit-greying (plant edit-state-stale)"
  - "page-tools-live find docking check (plant find-strip-overlays)"
  - "page-tools-live print-dialog and menu-captures (capture only), PB_CAPTURE_DIR hooks"
  - "pb-kwin captureActive"
  - "tab-strip-live bookmark-all repeat and failure legs (plants bookmark-repeat-duplicates, bookmark-failure-silent), overflow drag-handle measure, badge-capture"
affects: [32-UAT, 33-UAT, 34-UAT]
tech-stack:
  added: []
  patterns:
    - "a tab-strip scenario may carry several plants (`plants: [...]`); each goes red against the same clean control"
    - "capture-only scenarios run only when named with PB_CAPTURE_DIR; default runs and self-tests skip them"
key-files:
  created:
    - .planning/phases/39-v1-5-close-out/captures/32-T1-crash-ui.png
    - .planning/phases/39-v1-5-close-out/captures/32-T2-reader-light.png
    - .planning/phases/39-v1-5-close-out/captures/32-T2-reader-dark.png
    - .planning/phases/39-v1-5-close-out/captures/32-T3-favicons.png
    - .planning/phases/39-v1-5-close-out/captures/32-T4-devtools-toolbox.png
    - .planning/phases/39-v1-5-close-out/captures/32-T6-find-strip.png
    - .planning/phases/39-v1-5-close-out/captures/32-T7-print-dialog.png
    - .planning/phases/39-v1-5-close-out/captures/33-T7-hamburger.png
    - .planning/phases/39-v1-5-close-out/captures/33-T7-history-rows.png
    - .planning/phases/39-v1-5-close-out/captures/33-T7-star-editor.png
    - .planning/phases/39-v1-5-close-out/captures/33-T7-bookmarks-toolbar.png
    - .planning/phases/39-v1-5-close-out/captures/33-T7-clear-panel.png
    - .planning/phases/39-v1-5-close-out/captures/34-T14-badge-and-selection.png
  modified:
    - scripts/verify-page-tools-live.mjs
    - scripts/verify-tab-strip-live.mjs
    - scripts/lib/pb-kwin.mjs
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - .planning/phases/32-page-tools/32-UAT.md
    - .planning/phases/33-bookmarks-history-and-the-full-menu/33-UAT.md
    - .planning/phases/34-tab-strip/34-UAT.md
decisions:
  - "The find strip grows the top panel through a body attribute and a CSS variable, then shell.fit(); this is the BMK-04 toolbar pattern, because the panel's height is its CSS min-height (product fix 10c17a52)"
  - "34 T8 was measured in the built shell's Theia frame over BiDi, not in a standalone :4000 sidecar: the standalone sidecar has no web-tab channel to open strip tabs, and no gsd-browser tools were available to this executor"
  - "32 T8 was read with pw-dump: pactl is not installed on this PipeWire host"
metrics:
  duration: "about 2 h 45 min"
  completed: 2026-11-06
  headed_runs: 5
estimate:
  tokens: 85000
  tasks: 3
actuals:
  tokens: 12600
  tasks: 3
  commits: 8
plan_head_before: cebfac94
plan_head_after: 4ce04c24
---

# Phase 39 Plan 16: Page-tools and tab-strip live rows Summary

The plan covered the PAGE-09 Edit greying row (33 T6), a fresh page-tools suite run with a recorded commit (it replaces the earlier unsourced claim), the print dialog, the hand-started audio check, and the remaining 34 T4 and T8 rows. All of them now run as harness scenarios. Captures for 32 T1-T4, T6, T7, 33 T7 and 34 T14 are committed for Chris. A capture showed the find strip covering the top 32px of the page; that is fixed in Theia.

## What was built

- **`edit-greying`** (page-tools-live). The textarea is focused in the page, then chrome focus moves to the Theia frame and the hamburger's Edit submenu is opened as a pointer does. Row states are read for three cases: a collapsed caret, after a paste, and with the whole value selected. Paste, Undo, Select All, Copy, Paste, Select All, Cut and Paste are each chosen from the submenu, and each effect is read back from the textarea's value and caret in the page title. The plant `edit-state-stale` replays the edit-state replies of the first open.
- **Find docking check and plant `find-strip-overlays`.** After Ctrl+F, the page rect (the widget the overlay follows) must start at or below the strip's bottom.
- **`captureActive(out)`** (pb-kwin). It does not raise any window, and it uses the same powerbrowser-class gate. The self-test gained a clean `clean-capture-active` leg, and both refusal plants now also cover captureActive.
- **`PB_CAPTURE_DIR` hooks in page-tools-live:** crash, reader (theme set to light, then dark), favicon, devtools (the toolbox window through captureActive) and find.
- **Capture-only scenarios:**
  - `print-dialog`: Ctrl+P, then KWin must report a powerbrowser-class window that is not the shell. That window is captured and cancelled with a real Escape, then the shell must be active again with the page unchanged.
  - `menu-captures`: the hamburger, the History submenu, the star editor, the toolbar row and the clear panel.
- **tab-strip-live `bookmark-all`:**
  - Bookmark Tab on /c first.
  - Bookmark All Tabs then repeats /c, and Bookmark Tab repeats /a.
  - Places counts are read in chrome through `PlacesUtils.bookmarks.fetch`.
  - The failure sentence must contain the application name.
  - Two new plants. The runner now accepts `plants: [...]` per scenario.
- **tab-strip-live `overflow`:** prints the row, chevron and picked-tab rects. After a scroll it reads chrome's `.powerbrowser-drag` handles, and they must overlap no visible tab and equal a fresh `publishDragRegions()`.
- **tab-strip-live `badge-capture`** (capture only).

## Verification (verbatim)

```
node scripts/verify-page-tools-live.mjs --scenario edit,edit-greying   (after the focus settle)
  edit: PASS ; edit-greying: PASS  (edit-greying 3 of 3 consecutive runs PASS)
scripts/verify-platform.sh --only page-tools-live   (116ac682)
  find zoom audio keys-theia favicon reader source crash crash-reader crash-switching crash-navigate devtools
  downloads downloads-today print save edit edit-greying edit-today print-today: PASS (20)
  page-tools-live: PASS / verify-platform: PASS -- all checks passed
scripts/verify-platform.sh --only page-tools-live-self-test   (116ac682)
  ok  edit-state-stale -> red, naming 'Edit row state did not follow the page selection'
  page-tools-live --self-test: PASS -- clean control green, 22 planted fault(s) went red
node scripts/verify-page-tools-live.mjs --self-test --only find   (after fix 10c17a52)
  ok  find-strip-overlays -> red, naming 'the find strip covers the page'
  page-tools-live --self-test: PASS -- clean control green, 4 planted fault(s) went red
node scripts/lib/pb-kwin.mjs --self-test   (headed)
  ok  clean-capture-active -> powerbrowser 1280x800 ; ok class-mismatch -> refused ; ok readback-empty -> refused
  pb-kwin --self-test: PASS
PB_CAPTURE_DIR=... verify-page-tools-live --scenario print-dialog,crash,reader,favicon,devtools,find,menu-captures   (headed)
  print-dialog: active dialog powerbrowser "Print" 652x512
  print-dialog: cancelled; page before {"url":".../find","entries":1} after {"url":".../find","entries":1}, tab-modal boxes 0
  all 7: PASS
scripts/verify-platform.sh --only tab-strip-live   (331ed734, PB_NG_ALLOW_DIRTY=1, see below)
  13 scenarios PASS; bookmark-all: Places bookmarks after the repeats: /a 1, /c 1
  overflow: row scrollWidth 590 clientWidth 268; chevron {"left":272,"right":296,"top":4,"bottom":28}
  overflow: picked tab {"left":126,"right":268} inside row {"left":0,"right":268}
  overflow: after scrollLeft 322, 13 drag handle(s) ...; fresh publish (identical)
scripts/verify-platform.sh --only tab-strip-live-self-test   (331ed734)
  plant bookmark-repeat-duplicates went red: a repeated bookmark created a second entry: /a has 2 Places bookmarks for its URL
  plant bookmark-failure-silent went red: a failed bookmark was silent: a refused bookmarkPage showed no strip notice
  verify-tab-strip-live --self-test: PASS ; tab-strip-live-self-test: PASS
32 T8 hand start (env -u LD_LIBRARY_PATH): no PowerBrowser stream in pw-dump;
  [Parent <pid>: AudioIPC Server RPC]: E/cubeb context.rs:55: libpulse not found
  control (LD_LIBRARY_PATH=<MOZ_PULSEAUDIO_LIBS dir>): {"name":"PowerBrowser","binary":"powerbrowser","media":"tone","state":"running"} x2
scripts/verify-platform.sh --only page-tools-live   (f77f4f89, final-HEAD rerun)
  edit-greying: FAIL -- the Copy row did not perform its edit on the page (the selection copied); the page reads "... eg s0 e16 |alpha beta gamma| aTEXTAREA"
  -> harness fix 4ce04c24; then edit-greying 3 of 3 PASS, --self-test --only edit-greying PASS (edit-state-stale red)
scripts/verify-platform.sh --only page-tools-live   (4ce04c24)
  19 PASS incl. edit-greying; crash-navigate: FAIL -- a URL sent to a crashed tab did not load it (no loaded push with crashed false)
  crash-navigate rerun alone: PASS, PASS (one retry rule; flake logged as WINDOWS id 28 for 39-18)
scripts/verify-platform.sh --quick: PASS before 116ac682; before 10c17a52, f984b2fd and 331ed734 it was red only in
  crash-submit, crash-submit-self-test, events-worker and events-worker-self-test (EISDIR on worker/.wrangler, see below)
UAT checks: "33 row 6 ok", "32-UAT ok", "34-UAT ok partial"; captures 32-T* count 7
```

## UAT rows

| Row | Result | Evidence |
|-----|--------|----------|
| 33 T6 | pass | edit-greying at 116ac682, plant edit-state-stale |
| 32 (suite) | recorded | page-tools-live 20 PASS, self-test 22 plants at 116ac682 (replaces the 2026-11-04 claim) |
| 32 T1 | [pending] + live + capture | crash, crash-reader, crash-switching, crash-navigate PASS; 32-T1-crash-ui.png |
| 32 T2 | [pending] + live + capture | reader PASS; light and dark captures (theme finding below) |
| 32 T3 | [pending] + live + capture | favicon PASS; 32-T3-favicons.png |
| 32 T4 | [pending] + live + capture | devtools PASS; the toolbox window captured |
| 32 T6 | [pending] + live + fixed + capture | find PASS; strip docking fixed 10c17a52; 32-T6-find-strip.png |
| 32 T7 | pass | print-dialog (headed): the GTK dialog opened, was captured and cancelled, and the page was unchanged |
| 32 T8 | issue | 'libpulse not found' on a hand start; the pulse-path control plays |
| 33 T7 | [pending] + capture | five 33-T7 captures, two visual notes |
| 34 T4 | pass | Bookmark Tab, Bookmark All Tabs, repeats (IN-02: one Places entry per URL), failure naming the application |
| 34 T7 | [pending] + human | drops from outside the browser and of a file |
| 34 T8 | pass | overflow DOM numbers and drag handles after a scroll |
| 34 T14 | [pending] + capture | 34-T14-badge-and-selection.png |

## Rows for the human checklist

- **32 T5 (Open and Show in folder through the OS handler).** Not touched. It is human-only by plan.
- **34 T7 (drops from outside the browser and of a file).** No harness can start a drag in another application. The `human:` line is on the row.
- **Visual verdicts on the captures:** 32 T1-T4, T6, T7; 33 T7; 34 T14.

## Deviations from Plan

### Auto-fixed Issues

**0. [Rule 1 - Bug, harness] edit-greying waited for a title push after Copy.**
- **Found during:** the rerun at the final HEAD (f77f4f89).
- **Issue:** Copy changes nothing on the page. Earlier passes saw a push only because a focus transition around the menu changed the title's active-element field. With no such transition, the step timed out.
- **Fix:** The Copy row is now read as the current title after a 500 ms settle. The paste that follows still proves the copy (with "PB" left on the clipboard, the value would read "PB").
- **Commit:** 4ce04c24

**1. [Rule 1 - Bug] The find strip covered the top 32px of the page (PAGE-01).**
- **Found during:** Task 2. The first 32-T6 capture showed no strip.
- **Issue:** The strip is rendered inside the top panel, but the panel's height comes from its CSS min-height, and opening the bar never changed it. Measured: the strip at 73-105px, the page rect and the overlay at top 73px, so the overlay drew over the strip.
- **Fix:** `setFindOpen()` sets `data-pb-find-strip` on body and calls `shell.fit()`. `--pb-find-strip-height: 32px` is added to the five top-panel and chrome-bar height calcs. The chrome-bar extension and the app were rebuilt. Measured after the fix: the top panel is 105px and the page rect and overlay start at 105px. The find scenario now asserts docking, with plant `find-strip-overlays`.
- **Files modified:** chrome-bar-widget.tsx, chrome-bar.css.
- **Commit:** 10c17a52

**2. [Rule 3 - Blocking] The page textarea must hold focus before each menu open (edit-greying).**
- **Issue:** In the first runs, the first hamburger open-and-Escape cycle after load left the page's activeElement on BODY, and the Paste row then did nothing: the paste event fired on the textarea, but no text was inserted. A `focus()` on a textarea in a hidden overlay does nothing.
- **Fix:** Before each open, the scenario does what a click in the page and then on the hamburger does: focusOverlay, wait for the page to report its textarea focused, then focusTheiaFrame. With that in place, the loss did not reproduce in later cycles, and a record-only probe of one more cycle read focus kept. It is not logged as a product defect, because it was seen only before the page had settled its first focus.

**3. [Deviation] 34 T8 was measured in the shell, not in the standalone :4000 sidecar.**
- The standalone sidecar has no web-tab channel, so strip tabs cannot be opened there, and this executor had no gsd-browser tools. The same Theia DOM was measured in the built shell over BiDi (Gecko layout).
- Chrome's drag handles were compared with a fresh publish, rather than against a hand-kept expectation.

**4. [Deviation] 32 T8 used a stock window and pw-dump.**
- Without the harness there is no BiDi session to open a web tab, so the tone page was a command-line URL, which opens in a stock window of the same process. libpulse is loaded by the parent's AudioIPC server, so the tab type does not change the result.
- `pactl` is absent on this host. My first read piped it through grep and was blind; that read was discarded. The recorded run used `pw-dump`, with a control run (pulse library path set) that does show the PowerBrowser streams. The baseline listing also contained other applications' streams; none of that text was recorded.

**5. [Environment] The tab-strip-live registry runs used `PB_NG_ALLOW_DIRTY=1`.**
- The tracked-dirty files were the foreign `.claude/settings.json` and `.planning/state.json` and my own `.planning/phases/34-tab-strip/34-UAT.md` record. No product or harness code was uncommitted (331ed734 was HEAD).

**6. [Environment] The `--quick` gate had four reds that are not from this plan.**
- crash-submit, crash-submit-self-test, events-worker and events-worker-self-test fail with EISDIR. An empty untracked `worker/.wrangler/tmp` directory, created at 19:37 by another process (no harness in this plan runs wrangler), is read as a file by `verify-worker-submit.mjs:636` and `verify-events-worker.mjs:198`. It was left in place because it is not this plan's file. The gate was fully green before 116ac682.

## Findings for Chris (not fixed)

- **32 T2 theme.** With `workbench.colorTheme` set to light, the body carries `theia-light`, but the chrome bar, the strip and the reader toggle keep their dark palette. The light and dark captures differ only in the page scrollbar. Whether the bar should follow the Theia theme is a design call.
- **33 T7 star editor.** The "Remove bookmark" label wraps onto two lines and overflows its button.
- **33 T7 History > Recent pages.** The list shows "http://127.0.0.1:<port>/find - PowerBrowser" as well as "Find fixture" for the same page.

## Product fix deferred

- **PAGE-05 packaging (32 T8).** A hand-started binary logs 'libpulse not found' and plays nothing. This is already in the 32-UAT Deferred Follow-Ups (release packaging must make libpulse load), and the owner kept PAGE-05 standing on 2026-11-05.

## Threat surface

- **T-39-41** is mitigated. Every capture went through the class gate (captureShell, or captureActive for the dialog and the toolbox). Every PNG was opened before commit and shows only a PowerBrowser window or its GTK print dialog.
- **T-39-42** is mitigated. Both hand-started browsers used throwaway profiles, were killed, and were checked gone with `pgrep`.
- **T-39-43** is mitigated. The 32-UAT suite line cites the registry run at 116ac682.

## Flake recorded

- In the registry run at 4ce04c24, crash-navigate went red once: 'a URL sent to a crashed tab did not load it (no loaded push with crashed false)'. It passed in the 116ac682 and f77f4f89 runs, and twice alone right after the failure. 39-16 did not change that code path. Logged as WINDOWS.md id 28 for 39-18's flake work.

## Not done

- page-tools-live-self-test was not re-run at the final HEAD. Since 116ac682 the file gained the capture hooks (no-ops unless PB_CAPTURE_DIR is set), the two capture-only scenarios (excluded from default runs and from PLANTS) and the find docking check, whose plants were run (`--self-test --only find`, 4 plants).

## Self-Check: PASSED

- Commits 116ac682, 3672353e, 10c17a52, f984b2fd, c5116ece, 331ed734, f77f4f89 and 4ce04c24 are all ancestors of HEAD.
- `SCENARIOS` in verify-page-tools-live.mjs contains 'edit-greying', and PLANTS contains edit-state-stale.
- pb-kwin exports captureActive.
- bookmark-all contains both 'a repeated bookmark created a second entry' and 'a failed bookmark was silent'.
- 13 capture PNGs are present under captures/.
