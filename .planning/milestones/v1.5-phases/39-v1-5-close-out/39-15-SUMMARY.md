---
phase: 39-v1-5-close-out
plan: 15
subsystem: live-harness
tags: [real-input, ydotool, kwin, uat, ext-07]
status: complete
requires: [39-01 pb-kwin gate, 39-14]
provides:
  - "PB_REAL_INPUT=1 os key route in pb-live-probe pressKey"
  - "pb-kwin osPointer, cursorPos, waitPointerIdle"
  - "pb-live-probe osClientPointer (hover-calibrated client-to-screen mapping)"
  - "tab-strip-live keyboard-menu, extension-actions-live popup-keyboard (one plant each)"
affects: [27-UAT, 34-UAT, 36-UAT, 38-UAT, WINDOWS.md]
tech-stack:
  added: []
  patterns:
    - "real OS input only after a KWin active-window read-back in the same step"
    - "pointer moved by closed-loop relative ydotool moves read back from KWin cursorPos"
    - "screen mapping calibrated by a trusted-mousemove read-back in the target document"
key-files:
  created: []
  modified:
    - scripts/lib/pb-kwin.mjs
    - scripts/lib/pb-live-probe.mjs
    - scripts/lib/pb-extension-fixtures.mjs
    - scripts/verify-tab-strip-live.mjs
    - scripts/verify-extension-actions-live.mjs
    - scripts/verify-nav-keys-live.mjs
    - scripts/verify-new-window-adopt-live.mjs
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-UAT.md
    - .planning/phases/34-tab-strip/34-UAT.md
    - .planning/phases/36-new-window-links-as-web-tabs/36-UAT.md
    - .planning/phases/38-webextensions/38-UAT.md
    - .planning/WINDOWS.md
decisions:
  - "Absolute ydotool moves do not land under pointer acceleration (mousemove --absolute 500 400 ended at 2,0), so osPointer moves by relative steps read back from KWin cursorPos"
  - "Every pointer step first waits for the owner's mouse to be idle 750 ms; a moving pointer refuses the button event instead of racing the owner"
  - "The extension popup is focused from chrome on popupshown: stock Extension:GrabFocus leaves the shell's focus on no element (product fix cba92e2a)"
metrics:
  duration: "about 3 h"
  completed: 2026-11-06
  headed_runs: 25
estimate:
  tokens: 85000
  tasks: 3
actuals:
  tokens: 26500
  tasks: 3
  commits: 7
plan_head_before: c68de4a4515de174c578f8e469f6abe68bf9eb24
plan_head_after: 549d18ad
---

# Phase 39 Plan 15: Real OS input rows Summary

Real keyboard and pointer input from ydotool, sent only after KWin reports the PowerBrowser window as active, covers 27 T1-T4, 34 T1/T6/T13, 36 T5 and 38 T23. Every pointer leg was calibrated by a hover read-back to within 2 px, so no row went to the human checklist because calibration failed. The runs found two product defects. The extension popup never took keyboard focus; that is fixed. A native double-click on the empty tab strip maximizes the window and opens no tab; that is evidence for owner batch B.

## What was built

- **`pressKey` os route** (`pb-live-probe.mjs`): with `PB_REAL_INPUT=1`, the session runs headed and the shell is raised once per session. Each chord is translated from its DOM `code` to Linux key codes and sent through `osKeys`, and `keyRoute.last` is set to `os`. A gate refusal throws. Nothing falls back to TIP. With the variable unset, the TIP and BiDi branches are byte-identical to before.
- **pb-kwin.** Adds a wider `KEY_CODES` table (letters, digits, F1-F12, navigation, modifiers, menu, back, forward). Also adds `cursorPos()`, `waitPointerIdle()` and `osPointer({x, y, button, action, holdMs})`. The gate runs before the move and again before the button event, and the button is refused unless KWin still reads the pointer on the target. Only key and button events are sent, never text. The self-test adds a `clean-pointer` control, and both refusal plants now also cover `osPointer`.
- **`osClientPointer(app, context, spec)`** maps a client point in any BiDi document to screen coordinates. The guess is the KWin frame origin plus the document's `mozInnerScreenX/Y`, minus the shell's own inset (the 26.4/23.2 CSS px client-side shadow that KWin's frame excludes), times dpr over the output scale. The guess is then corrected from the document's last trusted mousemove until it is within 2 px, in at most five attempts. `calibrateAt` calibrates on one point and acts on another, for strip gaps where chrome drag handles swallow the mousemove.
- **Scenarios:** `keyboard-menu` (plant `keyboard-menu-pointer-origin`) and `popup-keyboard` (plant `popup-esc-swallowed`), plus real-input branches in `mouse-buttons`, `long-press`, `double`, `middle` and `adopt-focus`. The popup fixture gained a button and a key recorder.

## Verification (verbatim)

```
pb-kwin --self-test (final):
ok  clean-control -> sent shift to powerbrowser
ok  clean-pointer -> moved to 1024,626
ok  clean-capture -> powerbrowser 1280x800
ok  class-mismatch -> refused
ok  readback-empty -> refused
pb-kwin --self-test: PASS

PB_REAL_INPUT=1 verify-nav-keys-live --scenario page-keys,tab-keys,focus-keys,theia-keeps-keys
  page-keys: keys: os / page-keys: PASS / tab-keys: PASS / focus-keys: keys: os / focus-keys: PASS / theia-keeps-keys: PASS
PB_REAL_INPUT=1 verify-nav-keys-live --scenario esc-stop,theia-keeps-esc
  esc-stop: keys: os / esc-stop: PASS / theia-keeps-esc: PASS
PB_REAL_INPUT=1 verify-tab-strip-live --scenario keyboard-menu
  keyboard-menu: keys os, pointer os [0,0] after 1 attempt(s); menu offsets Shift+F10 0px, the context-menu key 0px, right-click 0px
  tab-strip-live: keyboard-menu: PASS
PB_REAL_INPUT=1 verify-extension-actions-live --scenario popup-keyboard
  popup-keyboard: PASS -- keys os, clicks os [1,0] after 1 attempt(s): the popup took focus, Tab and Enter reached its button, Esc closed it with focus in the pill, and a click on page /a closed it with focus in the page
default: keyboard-menu PASS (keys tip, pointer bidi); popup-keyboard PASS (keys tip)
PB_REAL_INPUT=1 verify-nav-keys-live --scenario mouse-buttons,long-press
  long-press: finding: a real Escape left the history menu open after the release off Back (focus in pb-chrome-bar-input); closed through the menu node
  long-press: keys os: Enter on Back went back to /h1 after the hold
  long-press: PASS
  mouse-buttons: pointer os Back over the page, calibration [0,0] after 1 attempt(s)
  mouse-buttons: pointer os Forward over the page, calibration [0,0] after 1 attempt(s)
  mouse-buttons: pointer os Back over the Theia frame, calibration [0,0]
  mouse-buttons: PASS
PB_REAL_INPUT=1 verify-tab-strip-live --scenario double,middle
  double: pointer os [0,0] after 1 attempt(s); window 384,226 1280x800 -> 0,0 2048x1252
  middle: pointer os [0,0] after 1 attempt(s); controls frame 2 page 2; page text unchanged true
  verify-tab-strip-live: FAIL
  double: a double-click on the empty strip opened no new tab on the empty page ({"grew":false,"emptyPage":false,"pillFocused":false})
  double: the new tab from the empty strip did not focus the pill
  double: the native double-click on the strip moved or resized the window (maximize toggle): 384,226 1280x800 -> 0,0 2048x1252
default: long-press PASS, mouse-buttons PASS, double PASS, middle PASS
PB_REAL_INPUT=1 verify-new-window-adopt-live --scenario adopt-focus
  adopt-focus: real middle-click (pointer os, calibration [0,0] after 1 attempt(s)) on the opener's link: adoptTab push, background true; attached web tab "wt-hp0ve4-2"; stock windows 0 -> 0; current the opener
  adopt-focus: PASS
default: adopt-focus PASS
verify-tab-strip-live --self-test --scenario keyboard-menu,double,middle: PASS (each plant went red naming its text)
verify-extension-actions-live --self-test --live --scenario popup-keyboard: PASS (popup-esc-swallowed red)
verify-extension-actions-live --static: PASS -- 19 plant(s)
verify-platform.sh --quick: PASS -- all checks passed (before each of the three code commits)
UAT row/result counts: uat ok for 27, 34, 36, 38
```

## UAT rows

| Row | Result | Route |
|-----|--------|-------|
| 27 T1 | pass | keyRoute os (page-keys, tab-keys, focus-keys, esc-stop) |
| 27 T2 | pass | keyRoute os (theia-keeps-keys, theia-keeps-esc) |
| 27 T3 | pass | pointer os, side/extra buttons (mouse-buttons) |
| 27 T4 | pass | pointer os hold plus key os Enter (long-press) |
| 34 T1 | [pending], owner | pointer os: native double-click maximizes the window, opens no tab (3 of 3 runs) |
| 34 T6 | pass | pointer os middle-click, primary selection set and page text selected |
| 34 T13 | pass | keys os plus pointer os right-click (keyboard-menu) |
| 36 T5 | pass | pointer os middle-click on a link opened a background web tab |
| 38 T23 | pass | keys os plus clicks os (popup-keyboard), after fix cba92e2a |

No row went to the human checklist: every pointer leg calibrated within 2 px, almost always on the first attempt.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The extension popup never took keyboard focus.**
- **Found during:** Task 1 (popup-keyboard, real keys and real click).
- **Issue:** After the panel showed, chrome's active element was `<body>`. Stock `Extension:GrabFocus` (`Services.focus.focusedWindow = content.window` in the extension process) moved no shell focus, so Tab and Enter never reached the popup. This happened both headless and headed.
- **Fix:** `extensionOpenPopup` focuses `popup.browser` once on `popupshown` (2 lines in shell JS, no rebuild). The `INTERNAL-APIS.md` catalogue line refs after line 10396 were shifted by 2, and `check-internals-boundary.sh --catalogue` passes.
- **Commit:** cba92e2a

**2. [Rule 3 - Blocking] The pointer is shared with the owner's live desktop.**
- **Issue:** `ydotool mousemove --absolute` does not land under pointer acceleration. Separately, the owner was using the mouse during runs: a 2 px move read back 12 px off, and the shell window lost activation twice.
- **Fix:** Moves are now closed-loop relative steps read back from KWin `cursorPos`. Each step waits for 750 ms of pointer idle, and the button event is refused if the pointer moved off target. The gate refused correctly both times the owner reactivated another window.

**3. [Rule 3 - Blocking] Targets that no hover read-back can reach.**
- **Issue:** The strip gaps are chrome drag handles, so no mousemove reaches the Theia frame there. The middle scenario's Theia-frame paste control at 40%/60% sat under the page overlay.
- **Fix:** Added `calibrateAt` (calibrate on /a's tab, act on the gap). Under real input, the Theia-frame paste control is placed over /b's strip tab. Default routes are unchanged.

**4. [Deviation] Default routes where the TIP or BiDi route cannot raise the event.**
- **keyboard-menu:** GTK raises the context-menu-key `contextmenu` in the widget layer (`nsGtkKeyUtils::MaybeDispatchContextMenuEvent`), which TIP never reaches. The default route therefore dispatches that keyboard-shaped event (button 0, at 0,0) itself.
- **popup-keyboard:** A BiDi click in the page moves no chrome focus. The default route's page click is therefore `focusOverlay`.
- **What proves the real behaviour:** only the `PB_REAL_INPUT=1` runs.

**5. [Scope] Work landed in different tasks than the plan assigned.**
- popup-keyboard's real page click (Task 3 in the plan) landed with the Task 1 scenario, so one real run covers both halves of 38 T23.
- 27 T1's evidence also includes `esc-stop` run with real keys, because the row lists Esc on a loading page.

**6. [Verify] Task 2's `PB_REAL_INPUT=1 ... --scenario double,middle` is red, by design.**
- The real double-click maximizes the window and opens no tab. That is the product behaviour 34 T1 asked about, not a harness fault, so the row stays `[pending]` for the owner.

## Product fix deferred

- **Long-press Back, then release off the button (27 T4 side finding).** With a real pointer, holding Back for 600 ms, moving onto the pill and releasing leaves keyboard focus in the pill. A real Escape then belongs to the pill, and the history menu stays open. This was seen in 3 of 3 runs. The T4 claim itself (Enter on Back still goes back one page) passes. The cause is not yet traced (Lumino menu focus versus a pill focus on the drag-release), so it is not a small fix here. Logged as WINDOWS.md id 27. Evidence: `verify-nav-keys-live --scenario long-press` under `PB_REAL_INPUT=1` prints the `finding:` line.
- **TAB-03 double-click versus the native drag region (34 T1).** This is not a code fix: whether to carve the empty strip out of the drag handles, keep both, or drop the double-click clause is the owner's decision. The evidence is in the 34-UAT row 1 `real-input:` line.

## Threat surface

- **T-39-39** is mitigated as planned. Every key and button goes through `gate()`. Pointer buttons also need the pointer read back on target and an idle mouse. Only key and button events are sent (no `ydotool type`).
- **T-39-40** is accepted. There were 25 headed runs, each a few seconds to about 70 s. The owner's activity twice caused a refusal and no input went elsewhere.

## Not done

- The full `verify-nav-keys-live --self-test`, which runs every scenario and has no scenario filter. The default runs of the touched scenarios are green and their plant paths are unchanged.

## Self-Check: PASSED

- The commits cba92e2a, 2f42a1ed, 79071d83, 6fc1161a, cc9790f6, b9f4c375 and 549d18ad are all ancestors of HEAD.
- `scripts/lib/pb-kwin.mjs` exports osPointer.
- `scripts/lib/pb-live-probe.mjs` contains PB_REAL_INPUT.
- The plan's key strings are present: `keyboard-menu` in verify-tab-strip-live.mjs, `popup-keyboard` in verify-extension-actions-live.mjs, and `osKeys` in pb-live-probe.
