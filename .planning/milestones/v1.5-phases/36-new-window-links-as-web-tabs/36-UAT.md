---
status: partial
phase: 36-new-window-links-as-web-tabs
source: [36-VERIFICATION.md, 36-REVIEW.md, 36-03-SUMMARY.md]
started: 2026-11-01T00:00:00Z
updated: 2026-11-06T23:30:00.000Z
---

Deferred to the one end-of-milestone pass (Chris, 2026-10-31). Run on `objdir/dist/bin/powerbrowser` with `-purgecaches` after any shell-module change, after `nix develop .#theia --command bash -c 'cd theia && yarn build'`. `verify-new-window-adopt-live.mjs` has not been touched since `d9861749`, so it predates the 36-REVIEW fixes and Phase 37's tab-host change; expect that the first run may need harness edits as well as product fixes.

## Current Test

[testing complete]

## Tests

### 1. Assumption A-06 (a): the recorder can wrap the shell's browserDOMWindow
expected: `node scripts/verify-new-window-adopt-live.mjs --scenario adopt-order` does not print "harness: the receiver recorder could not be installed". If it does, fix the harness before reading any scenario result
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: the recorder installs and records receiver calls once it wraps browserDOMWindow.wrappedJSObject (60b2ab8b). A-06 (a) as written was false: reading browserDOMWindow back in chrome gives an XPConnect wrapper whose members are read-only"

### 2. adopt-order: _blank and window.open land after the opener; close reselects it
expected: With two web tabs, a `target=_blank` click and a `window.open` button each open a web tab directly after the opener; the shell-window count stays 1 and no stock window opens; closing the adopted tab makes the opener current. Exactly one `adoptTab` push per open. Gecko accepts the returned pending element (remote frameloader, no double load)
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: adopt-order PASS"

### 3. adopt-opener: window.opener works (sign-in popup shape)
expected: The page opened by the `window.open` button has a non-null `window.opener`, and a postMessage round trip completes in both page contexts. The `_blank` link has a null `window.opener` by design (`noopener`), so the round trip is asserted on the button path only
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: adopt-opener PASS"

### 4. adopt-popup: popup features still open a popup window
expected: A `window.open(url, '', 'width=...,height=...')` opens a stock popup window holding the URL; no `adoptTab` push arrives and no web tab is created for it
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: adopt-popup PASS"

### 5. adopt-focus: background versus foreground
expected: A background open (`openLinkIn(url, 'tab', { openerBrowser, inBackground: true })`) leaves the opener current and focused; a foreground open shows and focuses the new tab. A real middle-click cannot be driven (ClickHandler is not registered in the shell, 36-01 deferred 5), so also check a middle-click by hand and note what happens
result: pass
evidence: "39-15 2026-11-06, objdir/dist/bin/powerbrowser headed on the owner KDE Wayland desktop, PB_REAL_INPUT=1 behind the pb-kwin gate (active window read back before every move and button, pointer read back on target, calibrated by a trusted-mousemove read-back within 2 px). Harness b9f4c375: verify-new-window-adopt-live adopt-focus PASS, pointer os (calibration 0,0): a REAL middle-click on the opener page's link gave an adoptTab push with background true, the web tab attached, no stock window opened and the opener stayed current; then the background openLinkIn adopt left the opener current and chrome-focused, and the foreground window.open made the new tab current. The 36-01 note that a real middle-click cannot be driven no longer holds: it opens a background web tab, as Firefox does"
live: "v1.5 end-of-milestone live pass 2026-11-04, main: adopt-focus PASS. Still open for a human: a real middle-click"

### 6. adopt-fallback: no frontend ack in 5 s opens the stock window
expected: With the ack dropped, a stock window holds the URL within `ADOPT_ACK_TIMEOUT_MS` plus the margin; no pending overlay remains in the shell; no tab is left in the Theia strip. The page may load twice (IN-01); note whether the second load shows
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: adopt-fallback PASS. Whether the page loads twice (IN-01) is not visible to the harness"

### 7. adopt-scheme: a javascript: URL opens nothing
expected: A `javascript:` `target=_blank` link adopts no tab, opens no stock window and leaves the opener on its page. `window.openLinkIn` returns `refused-scheme` for it. If Gecko instead asks the receiver for about:blank, the scenario goes red and the receiver's "noted" call shows why (assumption (d))
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: adopt-scheme PASS: no web tab is adopted, the opener stays on its page and openLinkIn answers refused-scheme. Gecko own new-window path does open one stock window on about:blank, which 36-01 ratified (the receiver returns null for a refused scheme); the expectation clause 'opens no stock window' contradicts that and is on the owner list (60b2ab8b)"

### 8. adopt-unknown-key: an ack for a key chrome does not hold is swept
expected: The `webTabAdopt` reply is `unknown-tab`; a `dropAdoptedTab` push arrives for the widget; the widget is disposed and its channel registration gone
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: adopt-unknown-key PASS"

### 9. adopt-live self-test names all eight plants red
expected: `node scripts/verify-new-window-adopt-live.mjs --self-test` exits 0, the clean control is green, and adopt-append-at-end, reselect-opener-off, opener-null, popup-becomes-tab, background-activates, fallback-off, adopt-javascript and unknown-key-keeps-widget each go red naming their drift. Then `scripts/verify-platform.sh --only new-window-adopt-live` and `--only new-window-adopt-live-self-test`
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: --self-test PASS: clean control green and all eight plants red naming their drift; verify-platform.sh --only new-window-adopt-live PASS; 39-12 lane-b 2026-11-06: 999.11 fixed in 7fcde822, opener-null expects 'window.opener is null' and is re-sited to a noopener open (the old openWindowInfo strip broke the adopt and was scored by accident); the self-test now refuses overlapping plant expects on one target; 14 plants red, registry self-test row PASS"

### 10. GUI-01: single shell window and the application survives closing the stock window
expected: `gui01-single-shell-window` and `gui01-browser-close-does-not-quit` stay green with the receiver installed. The second row drives a bare `window.open` from the Theia frame, so it proves the null fall-through (a Theia-frame opener is not in `webTabs`, so the receiver returns null and Gecko opens its own window), not the command route
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: gui01-single-shell-window and gui01-browser-close-does-not-quit PASS"

### 11. GUI-01: the palette command opens a stock window through openStockTab
expected: "Open Browser Window" from the command palette, with no URL and with an http(s) URL, opens a stock browser window or tab (never a second shell window, never a popup block). `gui01-command-registered` stays green. `verify-ext-tab-host-live.mjs` (:928, :969) and `verify-address-bar-live.mjs` also execute the command; take their results as supporting evidence
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: gui01-command-registered PASS; the command also ran green from the ext-tab-host gui01 scenario and the address-bar token-cookie scenario"

### 12. GUI-01: stock window opened from a page opener while adopted tabs exist
expected: With one adopted tab open, run the palette command and also open a popup-features window. Both reach a stock window; the adopted tab is unaffected; closing the stock window leaves the application running
result: pass
evidence: "39-12 lane-b 2026-11-06, objdir/dist/bin/powerbrowser: scenario gui01-adopted PASS (palette command and a popup-features window each reached a stock window, the adopted tab stayed attached directly after its opener, closing both stock windows left one shell window and a ready frontend); plant stock-command-dead red naming 'GUI-01 broke with an adopted tab open'; harness 35f344f3; verify-platform.sh --only new-window-adopt-live and --only new-window-adopt-live-self-test PASS"

### 13. 36-REVIEW WR-03: window.close() in an adopted tab closes the tab
expected: A page opened by `window.open` that calls `window.close()` makes the Theia tab disappear (row closed, overlay released) and the opener is reselected; the opener sees `w.closed === true`. No live scenario exists for this leg
result: pass
evidence: "39-12 lane-b 2026-11-06, objdir/dist/bin/powerbrowser: scenario adopt-close PASS (window.close() in the adopted page removed the tab and released its overlay, the opener was reselected and read w.closed === true); plant close-ignored red naming 'window.close() left the adopted tab open'; harness 7fcde822; registry rows new-window-adopt-live and -self-test PASS"

### 14. 36-REVIEW WR-04: a blank window.open shows about:blank with the opener's host in the identity box
expected: `w = window.open(); w.document.write('<p>hi</p>')` shows the written content (not the "New Tab" empty state); the label and caption read about:blank; the identity box names the opener's origin and the security state is `none`. Confirm `documentPrincipal` is the opener's at push time (36-REVIEW WR-04 "needs human check")
result: pass
evidence: "39-12 lane-b 2026-11-06, objdir/dist/bin/powerbrowser: scenario adopt-blank-write PASS. DOM-written blank: shown, label and caption about:blank, identity 127.0.0.1 with security state none, documentPrincipal the opener's origin. Literal document.write: shown once under the opener's principal; document.open gives the written page the opener's URL (HTML spec, Gecko follows it), so its label and identity are that URL's, not about:blank. Plant blank-hidden red naming 'a written blank window lost the opener's identity'; harness 7fcde822"

### 15. 36-REVIEW WR-02: a late ack after the timeout keeps the tab
expected: Delay the `webTabAdopt` reply past the 5 s frontend timeout while chrome still holds the overlay: the tab attaches (the `webTabHistory` read answers a held overlay) and the page is not closed. If chrome's fallback already took it, the widget is dropped and the page is in the stock window, once
result: pass
evidence: "39-12 lane-b 2026-11-06, objdir/dist/bin/powerbrowser: scenario adopt-late-ack PASS (the webTabAdopt reply swallowed so the frontend's own 5 s deadline timed out: chrome held the overlay, the frontend read webTabHistory and kept the tab, page open once; with the ack held past chrome's fallback the widget was disposed and the page was in the stock window once); plant late-ack-closes red naming 'a late ack lost or duplicated the page'; harness 7fcde822"

### 16. 36-REVIEW WR-07: the stock-window command after a failed startup probe
expected: Make the first channel probe fail (for example by running the command during a sidecar swap), then run "Open Browser Window" again: the click re-probes and opens the stock window. With the channel still dead, the thrown copy names PowerBrowser and gives an on-screen next step, and shows no command id, port or raw error
result: pass
evidence: "39-12 lane-b 2026-11-06, objdir/dist/bin/powerbrowser: scenario stock-command-reprobe PASS (first channel probe made to fail, Open Browser Window re-probed once and opened the stock window; with the channel held dead it threw the tree's no-answer copy, which names PowerBrowser, ends with a step naming Open Browser Window, and carries no all-caps token, dotted key, command id, kebab-case id, host, port or raw error); plants reprobe-off and reprobe-copy-leak red; harness 35f344f3"

### 17. VB-01: an adopted tab looks like a normal web tab
expected: No pending flash, spinner and title parity with a tab opened from the strip, on KDE Wayland, against `36-UI-SPEC.md` VB-01. Also check favicon, F12 and prompts on an adopted tab (the tab-host node is wired statically, live-unproven)
result: [pending]
capture: ".planning/phases/39-v1-5-close-out/captures/36-T17-adopted-tab.png (39-12, headed adopt-order run under the capture lock: the adopted tab current, directly after the strip-opened Adopt Opener tab, beside strip-opened tab B; KDE Wayland, spectacle -a -S)"

### 18. CLAUDE.md hard rule 5 wording (owner decision)
expected: Owner accepts or rewrites the replacement in 36-02-SUMMARY Deferred item 1 for the span "It opens via `window.open(url, '_blank')` ... so `BROWSER_CHROME_URL` is stock upstream chrome." The sentence "The shell window carries no `nsIBrowserDOMWindow`" is false since 36-01 installed the receiver, and the command's route is now `openStockTab`. An agent does not edit CLAUDE.md
result: pass
evidence: "owner decision 2026-11-05; CLAUDE.md hard rule 5 route span replaced with the 36-02-SUMMARY Deferred item 1 text in the same commit"
owner: "Chris 2026-11-05 via AskUserQuestion: box 36, Accept replacement text (Recommended): replace CLAUDE.md hard rule 5 with the text in 36-02-SUMMARY.md Deferred item 1, verbatim."

## Summary

total: 18
passed: 17
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

[none yet]

## Deferred Follow-Ups

```yaml
- test: 9
  idea: "the opener-null plant expect string 'opener' can match incidental failure text; anchor it to the failure the plant causes"
  deferred_at: 2026-11-04
```
