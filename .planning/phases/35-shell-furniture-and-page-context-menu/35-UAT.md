---
status: testing
phase: 35-shell-furniture-and-page-context-menu
source: [35-VERIFICATION.md, 35-REVIEW.md, 35-VALIDATION.md, 35-0[1-7]-SUMMARY.md]
started: 2026-11-01T00:00:00Z
updated: 2026-11-01T00:00:00Z
---

Deferred to the one end-of-milestone pass (Chris, 2026-10-31). Run on `objdir/dist/bin/powerbrowser` with `-purgecaches` after any shell-module change. No live run of Phase 35 has happened: the lane had no objdir.

## Current Test

number: 1
name: Full live suite and its self-test
expected: |
  `node scripts/verify-page-furniture-live.mjs` passes all 19 scenarios (tooltip-status, theia-hover-silent, pip-close,
  context-menu, menu-not-in-ide, background-menu, menu-page-tools, menu-edit, menu-spelling, menu-save, extension-entry,
  freeze-frame, autocomplete, saved-login, form-validation, paste-popup, element-fullscreen, fullscreen-key, f11-keeps-debug),
  and `--self-test` turns every plant red naming its drift.
awaiting: user response

## Tests

### 1. Full live suite and its self-test
expected: All 19 scenarios PASS and `--self-test` plants all go red. Covers the live half of SC1 to SC4. Any failure is a gap against the named criterion
result: [pending]

### 2. Full driver
expected: `scripts/verify-platform.sh` (and `--gate`) is green with the live rows `page-furniture-live` and `page-furniture-live-self-test` included
result: [pending]

### 3. ROADMAP research probe 3, right-click in an overlay (fallback taken)
expected: The `context-menu timing:` line is printed and shows the Theia-rendered menu opens within the 200 ms p95 budget over 20 opens. If it is over budget, record the measured value and decide whether the budget or the path changes
result: [pending]

### 4. ROADMAP research probe 8, G4b freeze-frame latency (fallback taken)
expected: `freeze-frame timing: menu p50 <ms> p95 <ms>, still <k>/20 within 50 ms` is printed; p95 at most 200 ms and the still arrives within 50 ms on most opens. Record the verdict in 35-VALIDATION.md (currently "deferred"). Also look at the still with a Phase 37 notification bar showing (35-REVIEW IN-05: it covers the bar and is stretched)
result: [pending]

### 5. ROADMAP research probe 12, clipboard paste popup (fallback taken)
expected: A page calling `navigator.clipboard.readText()` opens the paste popup labelled "Paste" (from `textActions.ftl`), the popup appears under the pointer, and `readText()` resolves after the click (scenario `paste-popup`)
result: [pending]

### 6. SC1: page context menu for every target, and each item works
expected: Right-click a link, image, video, audio, a selection, an editable field, a frame and a blank area. The rows and order match the stock window's menu (open link in new tab, copy link, save image, search for selection, view source, Inspect and the rest). Each row does what it says, including Open in new tab, Copy Link, Save Page As, Bookmark This Page and the extension entry (scenarios context-menu, menu-page-tools, menu-edit, menu-spelling, menu-save, extension-entry). The search row (WR-02) loads the engine results page
result: [pending]

### 7. SC1: the IDE keeps Theia's own menu
expected: Right-click in an editor, the explorer and the terminal: Theia's menu opens, not the page menu. Right-click while a web tab is open in the background never opens a page menu for the hidden tab (menu-not-in-ide, background-menu)
result: [pending]

### 8. SC2: form autocomplete, saved login and validation bubble
expected: Typing in a text field with form history shows the stock autocomplete popup under the field and picking an entry fills it. A saved login fills a login form from the popup. Submitting an invalid form shows the validation bubble (autocomplete, saved-login, form-validation)
result: [pending]

### 9. SC3: tooltips and link status
expected: Hovering an element with `title=` shows the tooltip after the stock delay and nothing shows over the IDE. Hovering a link shows its URL in the bar status line and clears when the pointer leaves, and a picture-in-picture close button works (tooltip-status, theia-hover-silent, pip-close)
result: [pending]

### 10. SC4: F11 on a page and in the IDE
expected: F11 with a web page focused makes the window full screen and F11 again leaves it. F11 with an editor focused keeps its debug binding. The Full Screen and Bookmark This Page rows work now that Phase 33 is merged (fullscreen-key, f11-keeps-debug)
result: [pending]

### 11. SC4: element fullscreen warning and Esc
expected: A page video entering fullscreen shows Firefox's fullscreen warning with the page origin; Esc leaves fullscreen and the warning closes; switching tabs during element fullscreen leaves it; no page menu opens during element fullscreen (element-fullscreen, D-19)
result: [pending]

### 12. Visual: menu look and order against the stock window
expected: The page menu matches the stock window's page menu in order, separators and labels, side by side (KWin raise plus spectacle)
result: [pending]

### 13. Visual: tooltip placement at the window edge
expected: A `title=` element near the right and bottom window edge shows the tooltip clamped inside the window
result: [pending]

### 14. Visual: fullscreen warning banner
expected: Stock XUL rendering of the warning banner, readable over video, with the exit button
result: [pending]

### 15. Visual: status-line truncation
expected: A long link URL shows one truncated line with the full URL in `aria-label`
result: [pending]

### 16. 35-REVIEW CR-01: Save As answered after 60 seconds
expected: Right-click a link or image, choose Save Link As or Save Image As, wait over 60 seconds in Theia's save dialog, then pick a path: the file is saved and a download row appears. Repeat with a second right-click opened before answering the dialog: the first save still lands. A save that cannot land shows the "menu had already closed" message and is never silent
result: [pending]

### 17. 35-REVIEW CR-02: edit rows inside a cross-origin iframe
expected: Right-click an input and a selection inside a cross-origin iframe: Undo, Cut, Copy, Paste, Delete and Select All reflect and act on the iframe's content, not the outer page, and Copy Image copies the iframe image
result: [pending]

### 18. 35-REVIEW WR-03: pointer-lock warning
expected: A page requesting pointer lock (not in fullscreen) shows "<domain> has control of your pointer. Press Esc" and the warning closes on exit. In fullscreen only the fullscreen warning shows
result: [pending]

### 19. 35-REVIEW WR-04: link status clearing
expected: With the pointer resting on a link, switch tabs from the keyboard: the status line clears. Click the link and navigate: the line clears on the new location
result: [pending]

### 20. 35-REVIEW WR-06: Inspect absent under policy, and refused rows say so
expected: With the DevTools-disabled policy active the page menu has no Inspect row. A row chrome refuses (a blocked scheme, or Reload Image on a non-http(s) image) shows the "couldn't do that on this page. Right-click the page to choose something else." message instead of doing nothing
result: [pending]

### 21. Open point: Edit submenu while the hamburger is open
expected: Decide the behavior. Today the Edit submenu falls back to the top document when no content frame is focused (the hamburger holds focus, `webTabEditContext` returns the top browsing context). Check that Cut, Copy, Paste and Undo from the hamburger Edit submenu still act on the right target in a page with a focused iframe input, or record the limitation
result: [pending]

### 22. Open point: a stale first pick gives no message
expected: Open a page menu, wait over 60 seconds, then pick a row: nothing runs and the page only regains focus (the `stale` reply, 35-REVIEW WR-06). Decide whether the first stale pick must also show a message, as the second step of a save now does
result: [pending]

## Summary

total: 22
passed: 0
issues: 0
pending: 22
skipped: 0
blocked: 0

## Gaps

[none yet]
