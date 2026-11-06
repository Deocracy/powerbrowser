---
status: partial
phase: 35-shell-furniture-and-page-context-menu
source: [35-VERIFICATION.md, 35-REVIEW.md, 35-VALIDATION.md, "35-0[1-7]-SUMMARY.md"]
started: 2026-11-01T00:00:00Z
updated: 2026-11-05T01:52:09.825Z
---

Deferred to the one end-of-milestone pass (Chris, 2026-10-31). Run on `objdir/dist/bin/powerbrowser` with `-purgecaches` after any shell-module change. No live run of Phase 35 has happened: the lane had no objdir.

## Current Test

[testing complete]

## Tests

### 1. Full live suite and its self-test
expected: All 19 scenarios PASS and `--self-test` plants all go red. Covers the live half of SC1 to SC4. Any failure is a gap against the named criterion
result: skipped
reason: "Deferred follow-up: 16 of 19 scenarios PASS. tooltip-status (C22: the title= tooltip never opens), saved-login (C23: no autocomplete popup on the username field) and menu-edit Copy Image (C24: no image/png flavour on the clipboard) fail with no isolated cause; theia-hover-silent is not scored without tooltip-status, so its plant theia-tooltip-leak cannot apply, and the self-test clean control is red on the same three. Sent to the backlog by Chris"

### 2. Full driver
expected: `scripts/verify-platform.sh` (and `--gate`) is green with the live rows `page-furniture-live` and `page-furniture-live-self-test` included
result: skipped
reason: "Deferred follow-up: not run as a whole: its page-furniture-live and page-furniture-live-self-test rows are red on C22-C24 (item 1)"

### 3. ROADMAP research probe 3, right-click in an overlay (fallback taken)
expected: The `context-menu timing:` line is printed and shows the Theia-rendered menu opens within the 200 ms p95 budget over 20 opens. If it is over budget, record the measured value and decide whether the budget or the path changes
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: context-menu timing: p50 98 p95 106 n=7, under the 200 ms p95 budget. The harness times the context-menu scenario own 7 opens; the 20-open sample is the freeze-frame scenario (item 4)"

### 4. ROADMAP research probe 8, G4b freeze-frame latency (fallback taken)
expected: `freeze-frame timing: menu p50 <ms> p95 <ms>, still <k>/20 within 50 ms` is printed; p95 at most 200 ms and the still arrives within 50 ms on most opens. Record the verdict in 35-VALIDATION.md (currently "deferred"). Also look at the still with a Phase 37 notification bar showing (35-REVIEW IN-05: it covers the bar and is stretched)
result: [pending]
live: "v1.5 end-of-milestone live pass 2026-11-04, main: freeze-frame timing: menu p50 7 p95 9, still 20/20 within 50 ms, recorded in 35-VALIDATION.md. Still open for a human: the still under a Phase 37 notification bar (35-REVIEW IN-05)"

### 5. ROADMAP research probe 12, clipboard paste popup (fallback taken)
expected: A page calling `navigator.clipboard.readText()` opens the paste popup labelled "Paste" (from `textActions.ftl`), the popup appears under the pointer, and `readText()` resolves after the click (scenario `paste-popup`)
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: paste-popup PASS (C06, C07 harness fixes 30645c4f)"

### 6. SC1: page context menu for every target, and each item works
expected: Right-click a link, image, video, audio, a selection, an editable field, a frame and a blank area. The rows and order match the stock window's menu (open link in new tab, copy link, save image, search for selection, view source, Inspect and the rest). Each row does what it says, including Open in new tab, Copy Link, Save Page As, Bookmark This Page and the extension entry (scenarios context-menu, menu-page-tools, menu-edit, menu-spelling, menu-save, extension-entry). The search row (WR-02) loads the engine results page
result: skipped
reason: "Deferred follow-up: context-menu, menu-page-tools, menu-spelling, menu-save and extension-entry PASS, with the C09 (View Frame Source) and C14 (Inspect selects the node) product fixes in 1642f2d7. The one remaining blocker is Copy Image (C24, backlog 999.9): menu-edit fails only on it"
live: "39-02 2026-11-05, main a72d906b: C11 fixed in page-context-menu.ts (focusPageIfLatest) and PowerBrowserAPI.webTabFocus (no page focus while a page menu is pending); context-menu PASS with the delayed-dismissal leg; stale-dismiss-focus and stale-focus-unguarded red; closeMenu pre-focus removed; 39-05 2026-11-06, main 6f6c39da: C24 was the instrument, not the product. Copy Image writes application/x-moz-nativeimage (headless, read through the clipboard cache; the headless widget keeps only text/plain and text/html). Headed (PB_LIVE_HEADED=1): Gecko answers image/png and image/jpeg and wl-paste --list-types lists image/png, image/jpeg, image/bmp, image/tiff and more. menu-edit PASS headless and headed; plants copy-row-unwired and copy-image-html-only red"

### 7. SC1: the IDE keeps Theia's own menu
expected: Right-click in an editor, the explorer and the terminal: Theia's menu opens, not the page menu. Right-click while a web tab is open in the background never opens a page menu for the hidden tab (menu-not-in-ide, background-menu)
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: menu-not-in-ide and background-menu PASS (C12 harness fix 30645c4f)"

### 8. SC2: form autocomplete, saved login and validation bubble
expected: Typing in a text field with form history shows the stock autocomplete popup under the field and picking an entry fills it. A saved login fills a login form from the popup. Submitting an invalid form shows the validation bubble (autocomplete, saved-login, form-validation)
result: skipped
reason: "Deferred follow-up: autocomplete and form-validation PASS; saved-login fails (C23): the popup element is present, field and document are focused, LoginManager is in the browsers group and the console shows no error, yet no popup opens"

### 9. SC3: tooltips and link status
expected: Hovering an element with `title=` shows the tooltip after the stock delay and nothing shows over the IDE. Hovering a link shows its URL in the bar status line and clears when the pointer leaves, and a picture-in-picture close button works (tooltip-status, theia-hover-silent, pip-close)
result: skipped
reason: "Deferred follow-up: the link status line shows and clears clear of the page in Coding, Browsing and Organising, and pip-close PASS with the C05 product fix (1642f2d7); the title= tooltip never opens (C22: showTooltip matches upstream, cause unknown), so theia-hover-silent is not scored"
live: "39-05 2026-11-06, main 22317895: C22 cause found. showTooltip's drag-session check (upstream browser.js:2017-2022) calls getService on the drag service, which a headless shell does not have (widget/gtk nsDragService::GetInstance returns null), so it threw before the popup opened; a missing drag service now counts as no drag session. tooltip-status PASS with the exact non-ASCII label and the empty-title leg; theia-hover-silent PASS; plants tooltip-element-removed, tooltip-drag-lookup-throws and theia-tooltip-leak red. Headed tooltip not observed in this plan"

### 10. SC4: F11 on a page and in the IDE
expected: F11 with a web page focused makes the window full screen and F11 again leaves it. F11 with an editor focused keeps its debug binding. The Full Screen and Bookmark This Page rows work now that Phase 33 is merged (fullscreen-key, f11-keeps-debug)
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: fullscreen-key and f11-keeps-debug PASS (Full Screen row product fix C21 in 1642f2d7)"

### 11. SC4: element fullscreen warning and Esc
expected: A page video entering fullscreen shows Firefox's fullscreen warning with the page origin; Esc leaves fullscreen and the warning closes; switching tabs during element fullscreen leaves it; no page menu opens during element fullscreen (element-fullscreen, D-19)
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: element-fullscreen PASS (C06, C20 harness fixes 30645c4f)"

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
passed: 5
issues: 0
pending: 12
skipped: 5
blocked: 0

## Gaps

[none yet]

## Deferred Follow-Ups

```yaml
- test: 9
  idea: "C22: the title= page tooltip never opens in tooltip-status; the product showTooltip matches upstream browser.js:2016-2038; theia-hover-silent and its plant theia-tooltip-leak wait on it"
  deferred_at: 2026-11-04
- test: 8
  idea: "C23: saved-login shows no autocomplete popup on the username field; cause unknown"
  deferred_at: 2026-11-04
- test: 6
  idea: "C24: Copy Image leaves only text/html on the clipboard, no image flavour; environment (Wayland image targets) or product not separated"
  deferred_at: 2026-11-04
- test: 6
  idea: "C11: a page menu dismissal sends widget.focusPage() a round trip later; when it lands after the next menu opened, chrome focus ends on <body>. The harness now focuses the Theia frame first; the product race itself is unfixed"
  deferred_at: 2026-11-04
```
