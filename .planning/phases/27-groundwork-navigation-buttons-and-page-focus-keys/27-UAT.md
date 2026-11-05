---
status: partial
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
source: [27-VERIFICATION.md]
started: 2026-10-21T07:05:00Z
updated: 2026-11-05T01:52:09.187Z
---

# Phase 27 UAT — human checks (deferred to Chris, end of milestone)

## Current Test

[testing complete]

## Tests

### 1. Real keyboard with a web page focused
expected: Ctrl+T, Ctrl+W, Ctrl+R, F5, Ctrl+Shift+R, Ctrl+F5, Alt+Left, Alt+Right, Alt+Home (Home on), Alt+D, Ctrl+L, F6, Shift+F6, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp, Ctrl+PageDown, Alt+1..Alt+9 and Esc on a loading page each do what Firefox does
result: [pending]

### 2. Real keyboard in an editor and a terminal
expected: F5, F6, F11, Ctrl+P, Ctrl+K, Ctrl+Tab, Alt+Left, Ctrl+R, Ctrl+L, Ctrl+W keep Theia's meaning (Ctrl+P Quick Open, F11 full screen, Ctrl+R reaches the shell in a terminal); no browser action runs
result: [pending]

### 3. Physical mouse back/forward buttons
expected: over a web page they go back/forward in that page; over the Theia frame nothing browser-side happens
result: [pending]

### 4. Press-and-hold cleanup (WR-01, IN-25)
expected: after holding Back, releasing off the button (or a cancelled touch/pen press), pressing Enter on Back still goes back one page
result: [pending]

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
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 7
skipped: 0

## Gaps

[none yet]
