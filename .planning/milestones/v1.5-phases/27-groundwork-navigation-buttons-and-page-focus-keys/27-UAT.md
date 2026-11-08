---
status: partial
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
source: [27-VERIFICATION.md]
started: 2026-10-21T07:05:00Z
updated: 2026-11-06T23:30:00.000Z
---

# Phase 27 UAT — human checks (deferred to Chris, end of milestone)

## Current Test

[testing complete]

## Tests

### 1. Real keyboard with a web page focused
expected: Ctrl+T, Ctrl+W, Ctrl+R, F5, Ctrl+Shift+R, Ctrl+F5, Alt+Left, Alt+Right, Alt+Home (Home on), Alt+D, Ctrl+L, F6, Shift+F6, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp, Ctrl+PageDown, Alt+1..Alt+9 and Esc on a loading page each do what Firefox does
result: pass
evidence: "39-15 2026-11-06, objdir/dist/bin/powerbrowser headed on the owner KDE Wayland desktop, harness commit 2f42a1ed: PB_REAL_INPUT=1, keyRoute os -- every key a real uinput key through ydotool, sent only after KWin read back the PowerBrowser shell as the active window in the same step (pb-kwin gate; pb-kwin --self-test PASS, its two refusal plants refused). verify-nav-keys-live page-keys PASS (Ctrl+R, F5, Ctrl+Shift+R, Ctrl+F5, Alt+Left, Alt+Right, Alt+Home, Alt+D, Ctrl+L, Ctrl+T, Ctrl+W), tab-keys PASS (Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageDown, Ctrl+PageUp, Alt+1, Alt+9, Alt+5 no-op), focus-keys PASS (F6, Shift+F6), esc-stop PASS (Esc on a loading page), all keys: os. Alt+2..Alt+8 were not each pressed: tab-keys proves the first, the last and an out-of-range digit"

### 2. Real keyboard in an editor and a terminal
expected: F5, F6, F11, Ctrl+P, Ctrl+K, Ctrl+Tab, Alt+Left, Ctrl+R, Ctrl+L, Ctrl+W keep Theia's meaning (Ctrl+P Quick Open, F11 full screen, Ctrl+R reaches the shell in a terminal); no browser action runs
result: pass
evidence: "39-15 2026-11-06, objdir/dist/bin/powerbrowser headed on the owner KDE Wayland desktop, harness commit 2f42a1ed: PB_REAL_INPUT=1, keyRoute os -- every key a real uinput key through ydotool, sent only after KWin read back the PowerBrowser shell as the active window in the same step (pb-kwin gate; pb-kwin --self-test PASS, its two refusal plants refused). verify-nav-keys-live theia-keeps-keys PASS in the same session as page-keys: in an untitled editor F5, F6, F11, Ctrl+P, Ctrl+K, Ctrl+Tab, Alt+Left, Ctrl+R, Ctrl+L, and in a terminal Ctrl+R and Ctrl+W, reached the Theia frame with no page-key row firing its chrome command; theia-keeps-esc PASS"

### 3. Physical mouse back/forward buttons
expected: over a web page they go back/forward in that page; over the Theia frame nothing browser-side happens
result: pass
evidence: "39-15 2026-11-06, objdir/dist/bin/powerbrowser headed on the owner KDE Wayland desktop, harness commit 6fc1161a: PB_REAL_INPUT=1, pointer os -- real uinput buttons through ydotool behind the pb-kwin gate (the active window read back before the move and again before the button, the pointer read back on target, the owner's mouse idle 750 ms first); the screen point calibrated by a trusted-mousemove read-back in the target document, within 2 px. verify-nav-keys-live mouse-buttons PASS: a real side (back) button over page /m2 landed on /m1, a real extra (forward) button landed on /m2 (calibration within 1 px, two runs); a real back button over the Theia frame (the Reload button) changed nothing within 1500 ms"

### 4. Press-and-hold cleanup (WR-01, IN-25)
expected: after holding Back, releasing off the button (or a cancelled touch/pen press), pressing Enter on Back still goes back one page
result: pass
evidence: "39-15 2026-11-06, objdir/dist/bin/powerbrowser headed on the owner KDE Wayland desktop, harness commit 6fc1161a: PB_REAL_INPUT=1, pointer os -- real uinput buttons through ydotool behind the pb-kwin gate (the active window read back before the move and again before the button, the pointer read back on target, the owner's mouse idle 750 ms first); the screen point calibrated by a trusted-mousemove read-back in the target document, within 2 px. verify-nav-keys-live long-press PASS: a real 600 ms hold on Back opened the two-entry history menu, the pointer moved off Back onto the pill and released there, the release navigated nothing, then Enter on the focused Back (key os) went back one page to /h1. Finding (not this row's claim): after that release focus is in the pill, so a real Escape is the pill's and leaves the history menu open; the check closed it through the menu node. Product fix deferred (39-15 SUMMARY)"

### 5. Look and timing
expected: one-line tooltips above the bar in Coding and Browsing, on the toolbar row in Organising, never over the page; a ~500 ms hold on Back opens the history menu like Firefox; narrowing the window with Home shown shrinks the address pill to 120px before any button wraps or clips
result: [pending]

### 6. Real drag onto New Tab
expected: dragging a link from another app shows the ring and opens one focused web tab; a javascript: or file: drop opens nothing
result: [pending]

### 7. Shared-process blank-reload defect (ownership)
expected: owned by a phase
result: resolved (autonomous, recommended) — assigned to Phase 32 via .planning/todos/pending/2026-10-21-shared-process-blank-reload.md; Chris may reassign

### 8. Judgment-tier prohibitions (14)
expected: confirm or reject each LLM verdict listed in 27-VERIFICATION.md
result: pass
evidence: "owner decision 2026-11-06"
owner: "Chris 2026-11-06 via AskUserQuestion: Box 27, T8 (confirm the 14 judgment-tier prohibition verdicts): Accept all (Recommended)"

## Summary

total: 8
passed: 5
issues: 0
pending: 2
skipped: 0

## Gaps

[none yet]
