---
status: partial
phase: 35-shell-furniture-and-page-context-menu
source: [35-VERIFICATION.md, 35-REVIEW.md, 35-VALIDATION.md, "35-0[1-7]-SUMMARY.md"]
started: 2026-11-01T00:00:00Z
updated: 2026-11-06T18:20:00.000Z
---

Deferred to the one end-of-milestone pass (Chris, 2026-10-31). Run on `objdir/dist/bin/powerbrowser` with `-purgecaches` after any shell-module change. No live run of Phase 35 has happened: the lane had no objdir.

## Current Test

[testing complete]

## Tests

### 1. Full live suite and its self-test
expected: All 19 scenarios PASS and `--self-test` plants all go red. Covers the live half of SC1 to SC4. Any failure is a gap against the named criterion
result: pass
evidence: "39-07 2026-11-06, main 0c6b3a85: scripts/verify-platform.sh --only page-furniture-live PASS, 25 of 25 scenarios (context-menu timing: p50 98 p95 99 n=7; freeze-frame timing: menu p50 7 p95 9, still 20/20 within 50 ms); --only page-furniture-live-self-test PASS, the clean control green and all 34 plants red with their named texts. Flake record, every run counted: live run 1 at 51303699 had iframe-edit-rows (Undo) and menu-spelling red, run 2 menu-spelling red; menu-spelling's cause (no overlay focus before the spell check, so the inline checker never started) fixed in 0c6b3a85, then run 3 green. Self-test run 1 at 0c6b3a85 had copy-image-html-only red on 'Paste did not set the second field' (the 39-05 menu-edit Paste flake), run 2 34 of 34"

### 2. Full driver
expected: `scripts/verify-platform.sh` (and `--gate`) is green with the live rows `page-furniture-live` and `page-furniture-live-self-test` included
result: [pending]
live: "39-07 2026-11-06, main 0c6b3a85: the blocker is gone: page-furniture-live (25 of 25) and page-furniture-live-self-test (34 plants) both PASS through the registry (item 1). The full driver and --gate were not run in 39-07; that run is 39-19's (39-BASELINE.md ## Final run)"

### 3. ROADMAP research probe 3, right-click in an overlay (fallback taken)
expected: The `context-menu timing:` line is printed and shows the Theia-rendered menu opens within the 200 ms p95 budget over 20 opens. If it is over budget, record the measured value and decide whether the budget or the path changes
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: context-menu timing: p50 98 p95 106 n=7, under the 200 ms p95 budget. The harness times the context-menu scenario own 7 opens; the 20-open sample is the freeze-frame scenario (item 4)"

### 4. ROADMAP research probe 8, G4b freeze-frame latency (fallback taken)
expected: `freeze-frame timing: menu p50 <ms> p95 <ms>, still <k>/20 within 50 ms` is printed; p95 at most 200 ms and the still arrives within 50 ms on most opens. Record the verdict in 35-VALIDATION.md (currently "deferred"). Also look at the still with a Phase 37 notification bar showing (35-REVIEW IN-05: it covers the bar and is stretched)
result: [pending]
live: "v1.5 end-of-milestone live pass 2026-11-04, main: freeze-frame timing: menu p50 7 p95 9, still 20/20 within 50 ms, recorded in 35-VALIDATION.md; 39-07 2026-11-06, main 0c6b3a85 (registry run): freeze-frame timing: menu p50 7 p95 9, still 20/20 within 50 ms, freeze-frame PASS. Still open for a human: the still under a Phase 37 notification bar (35-REVIEW IN-05)"

### 5. ROADMAP research probe 12, clipboard paste popup (fallback taken)
expected: A page calling `navigator.clipboard.readText()` opens the paste popup labelled "Paste" (from `textActions.ftl`), the popup appears under the pointer, and `readText()` resolves after the click (scenario `paste-popup`)
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: paste-popup PASS (C06, C07 harness fixes 30645c4f)"

### 6. SC1: page context menu for every target, and each item works
expected: Right-click a link, image, video, audio, a selection, an editable field, a frame and a blank area. The rows and order match the stock window's menu (open link in new tab, copy link, save image, search for selection, view source, Inspect and the rest). Each row does what it says, including Open in new tab, Copy Link, Save Page As, Bookmark This Page and the extension entry (scenarios context-menu, menu-page-tools, menu-edit, menu-spelling, menu-save, extension-entry). The search row (WR-02) loads the engine results page
result: pass
evidence: "39-07 2026-11-06, main 0c6b3a85 (registry run of page-furniture-live and its self-test): context-menu, menu-page-tools, menu-edit, menu-spelling, menu-save, extension-entry and background-menu PASS; plants stub-removed, referrer-dropped, stale-dismiss-focus, stale-focus-unguarded, background-check-off, inspect-no-select, copy-row-unwired, copy-image-html-only, spellcheck-off, save-dialog-cancelled, ext-cleanup-skipped and ext-command-dropped red. C24 was the instrument (39-05); the search row loads the served engine's /search?q= (context-menu). Visual order against the stock window is row 12"
live: "39-02 2026-11-05, main a72d906b: C11 fixed in page-context-menu.ts (focusPageIfLatest) and PowerBrowserAPI.webTabFocus (no page focus while a page menu is pending); context-menu PASS with the delayed-dismissal leg; stale-dismiss-focus and stale-focus-unguarded red; closeMenu pre-focus removed; 39-05 2026-11-06, main 6f6c39da: C24 was the instrument, not the product. Copy Image writes application/x-moz-nativeimage (headless, read through the clipboard cache; the headless widget keeps only text/plain and text/html). Headed (PB_LIVE_HEADED=1): Gecko answers image/png and image/jpeg and wl-paste --list-types lists image/png, image/jpeg, image/bmp, image/tiff and more. menu-edit PASS headless and headed; plants copy-row-unwired and copy-image-html-only red"

### 7. SC1: the IDE keeps Theia's own menu
expected: Right-click in an editor, the explorer and the terminal: Theia's menu opens, not the page menu. Right-click while a web tab is open in the background never opens a page menu for the hidden tab (menu-not-in-ide, background-menu)
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: menu-not-in-ide and background-menu PASS (C12 harness fix 30645c4f)"

### 8. SC2: form autocomplete, saved login and validation bubble
expected: Typing in a text field with form history shows the stock autocomplete popup under the field and picking an entry fills it. A saved login fills a login form from the popup. Submitting an invalid form shows the validation bubble (autocomplete, saved-login, form-validation)
result: pass
evidence: "39-07 2026-11-06, main 0c6b3a85 (registry run): autocomplete, saved-login and form-validation PASS; plants autocomplete-element-removed, autocomplete-attr-removed, login-manager-disabled and validation-template-removed red. C23 was the instrument (39-06, f39f6e25)"
live: "39-06 2026-11-06, main f39f6e25: C23 was the instrument, not the product. The WebDriver BiDi remote agent applies its recommended prefs (upstream remote/shared/RecommendedPreferences.sys.mjs), which set signon.rememberSignons=false, so LoginManagerChild never processed the login form: no PasswordManager message reached the parent and the search asked only FormHistory. A stock window in the same session failed the same way. saved-login now sets the pref true before the page loads; autocomplete and saved-login PASS (popup lists probe-user, Down+Enter fills both fields); plant login-manager-disabled red"

### 9. SC3: tooltips and link status
expected: Hovering an element with `title=` shows the tooltip after the stock delay and nothing shows over the IDE. Hovering a link shows its URL in the bar status line and clears when the pointer leaves, and a picture-in-picture close button works (tooltip-status, theia-hover-silent, pip-close)
result: pass
evidence: "39-07 2026-11-06, main 0c6b3a85 (registry run): tooltip-status, link-status-clear, theia-hover-silent and pip-close PASS; plants tooltip-element-removed, tooltip-drag-lookup-throws, overlink-unregistered, status-over-page, theia-tooltip-leak, status-clear-pointer-only and pip-shouldactivate-missing red. C22 fixed in 39-05 (22317895). Headed (one PB_CAPTURE_DIR run, 39-07): the title= tooltip opened and is in capture 35-T13"
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
capture: .planning/phases/39-v1-5-close-out/captures/35-T12-menu.png
live: "39-07 2026-11-06, main 0c6b3a85, headed: the blank-area page menu open in the shell window (Back and Forward disabled, Reload, Bookmark Page, Save Page As, Select All, View Page Source, Inspect Accessibility Properties, Inspect). No scenario opens the stock window's menu, so the side-by-side half is by hand"

### 13. Visual: tooltip placement at the window edge
expected: A `title=` element near the right and bottom window edge shows the tooltip clamped inside the window
result: [pending]
capture: .planning/phases/39-v1-5-close-out/captures/35-T13-tooltip-edge.png
live: "39-07 2026-11-06, main 0c6b3a85, headed, Browsing: a title= element 2 px from the page's bottom-right corner, which is 0 px from the window's right and bottom edges; the tooltip shows above-left of it, inside the window"

### 14. Visual: fullscreen warning banner
expected: Stock XUL rendering of the warning banner, readable over video, with the exit button
result: [pending]
capture: .planning/phases/39-v1-5-close-out/captures/35-T14-fullscreen-warning.png
live: "39-07 2026-11-06, main 0c6b3a85, headed: the warning reads '127.0.0.1:<port> is now full screen' with Exit Full Screen (Esc). Look at this: the capture shows the banner over the IDE layout with an empty main area, not over the video, although element-fullscreen read overlayFull and windowFull true just before"

### 15. Visual: status-line truncation
expected: A long link URL shows one truncated line with the full URL in `aria-label`
result: [pending]
capture: .planning/phases/39-v1-5-close-out/captures/35-T15-status-truncation.png
live: "39-07 2026-11-06, main 0c6b3a85, headed, Browsing: a 440-character link URL shows as one line over the address field, cut with an ellipsis"

### 16. 35-REVIEW CR-01: Save As answered after 60 seconds
expected: Right-click a link or image, choose Save Link As or Save Image As, wait over 60 seconds in Theia's save dialog, then pick a path: the file is saved and a download row appears. Repeat with a second right-click opened before answering the dialog: the first save still lands. A save that cannot land shows the "menu had already closed" message and is never silent
result: pass
evidence: "39-06 2026-11-06, main e7a851e0 (scenario) + c77e2bd0 (fix): save-as-late PASS. Save Link As answered 61 s after the pick landed the served bytes and a downloads row; a second page menu opened while the dialog waited (the dialog layer stepped aside for that right-click) did not drop the first save; neither landed save showed a failure message. The same menu's save answered again (slot spent) wrote nothing and showed the saveTargetExpired sentence; before c77e2bd0 it showed the generic 'couldn't save' sentence, because a path with no slot was a validation refusal. Plant save-reply-ttl (chrome's pre-fix stale answer after the minute) red: 'a late Save As did not land'"

### 17. 35-REVIEW CR-02: edit rows inside a cross-origin iframe
expected: Right-click an input and a selection inside a cross-origin iframe: Undo, Cut, Copy, Paste, Delete and Select All reflect and act on the iframe's content, not the outer page, and Copy Image copies the iframe image
result: pass
evidence: "39-06 2026-11-06, main e7a851e0: iframe-edit-rows PASS on a localhost iframe in another content process inside a 127.0.0.1 page. With a selection in the frame's field Cut, Copy, Paste, Delete and Select All are enabled; Copy copied the frame's selection; Paste and Undo acted on the frame's second field; Select All selected the frame field's text; Copy Image on the frame's image left an image flavour (clipboard cache, headless). Plant edit-rows-top-document (every Controllers read and command sent to the top document) red: 'edit rows followed the outer page, not the iframe'"

### 18. 35-REVIEW WR-03: pointer-lock warning
expected: A page requesting pointer lock (not in fullscreen) shows "<domain> has control of your pointer. Press Esc" and the warning closes on exit. In fullscreen only the fullscreen warning shows
result: pass
evidence: "39-06 2026-11-06, main e7a851e0: pointer-lock-warning PASS. A button's requestPointerLock opened #pointerlock-warning reading upstream's en-US pointerlock-warning-domain with the page's host ('127.0.0.1:<port> has control of your pointer. Press Esc to take back control.'; an IP host keeps its port, as formatURIForDisplay does upstream); exitPointerLock closed it; locked from fullscreen, only the fullscreen warning showed over 1 s of reads. Plant pointerlock-standin-missing (window.PointerLock deleted) red: 'no pointer-lock warning'"

### 19. 35-REVIEW WR-04: link status clearing
expected: With the pointer resting on a link, switch tabs from the keyboard: the status line clears. Click the link and navigate: the line clears on the new location
result: pass
evidence: "39-07 2026-11-06, main 0c6b3a85: link-status-clear PASS (scenario 51303699; registry run at 0c6b3a85). With the pointer resting on a link, Ctrl+Tab from the page to the next tab cleared the status line; back on the page, clicking the link cleared it on /target and it stayed clear for 500 ms. Plant status-clear-pointer-only (every overLink clear no pointer event caused is dropped at the push, the pre-fix behaviour) red: 'status line kept a link after a tab switch'"

### 20. 35-REVIEW WR-06: Inspect absent under policy, and refused rows say so
expected: With the DevTools-disabled policy active the page menu has no Inspect row. A row chrome refuses (a blocked scheme, or Reload Image on a non-http(s) image) shows the "couldn't do that on this page. Right-click the page to choose something else." message instead of doing nothing
result: pass
evidence: "39-07 2026-11-06, main 0c6b3a85: inspect-policy PASS (scenario 51303699; registry run at 0c6b3a85). With devtools.policy.disabled true (the pref the DisableDeveloperTools policy locks), read back, the element menu has no Inspect row (control: the same menu offers it with DevTools allowed). Inspect offered, then picked after the policy came on, is refused by chrome and shows 'PowerBrowser couldn't do that on this page. Right-click the page to choose something else.' (CHROME_BAR_COPY.pageMenuRowRefused, read from the tree). A blocked-scheme link and Reload Image on a non-http(s) image are now omitted or shown as the disabled refusal row (context-menu), so Inspect is the offered-then-refused row. Plant inspect-offered-unchecked (the menu given an Inspect row DevTools cannot open) red: 'Inspect row shown under the DevTools policy'. Pre-fix facts already read the policy pref, so the defect proven live is the silent refusal"

### 21. Open point: Edit submenu while the hamburger is open
expected: Decide the behavior. Today the Edit submenu falls back to the top document when no content frame is focused (the hamburger holds focus, `webTabEditContext` returns the top browsing context). Check that Cut, Copy, Paste and Undo from the hamburger Edit submenu still act on the right target in a page with a focused iframe input, or record the limitation
result: [pending]

### 22. Open point: a stale first pick gives no message
expected: Open a page menu, wait over 60 seconds, then pick a row: nothing runs and the page only regains focus (the `stale` reply, 35-REVIEW WR-06). Decide whether the first stale pick must also show a message, as the second step of a save now does
result: [pending]

## Summary

total: 22
passed: 14
issues: 0
pending: 8
skipped: 0
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
