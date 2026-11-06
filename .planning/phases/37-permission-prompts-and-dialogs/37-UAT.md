---
status: partial
phase: 37-permission-prompts-and-dialogs
source: [37-VERIFICATION.md, 37-REVIEW.md, 37-03-SUMMARY.md, 37-CONTEXT.md]
started: 2026-11-01T00:00:00Z
updated: 2026-11-06T22:00:02.000Z
---

Deferred to the one end-of-milestone pass (Chris, 2026-10-31). Run on `objdir/dist/bin/powerbrowser` with `-purgecaches` after any shell-module change. Spectacle and the KWin raise script need the session DBus, so run with the sandbox off. The live scenarios are `node scripts/verify-prompts-live.mjs --scenario <name>`.

Items 1-17 are the live scenarios and the live self-test. Items 18-27 are the ten fixes in 37-REVIEW's fix report, each recorded there as "needs live check". Items 28-33 are visual checks on KDE Wayland. Item 34 is the 37-03 gate. Items 35-41 are owner decisions. 41 items in all.

## Current Test

[testing complete]

## Tests

### 1. Scenario `permission`
expected: Active tab's request shows the stock doorhanger anchored under the chrome bar; Allow after the delay resolves the page callback; Block in a second tab denies
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: permission PASS (notification anchor product fix in 1642f2d7)"

### 2. Scenario `answer-delay`
expected: An Allow click inside the stock security delay is ignored (the stock console line proves the branch ran) and the page keeps waiting; Allow after the delay grants (positive control)
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: answer-delay PASS"

### 3. Scenario `background-queue`
expected: A background tab's request shows no panel and keeps its pending push; it does not show on another tab's activation; it shows and grants once its own tab is active
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: background-queue PASS"

### 4. Scenario `cancel-on-evict`
expected: One background tab asks three distinct prompts; a fourth from the same tab evicts that tab's oldest (its page sees a denial, its stock notification is gone); another background tab's prompt survives; the remaining prompts grant
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: cancel-on-evict PASS"

### 5. Scenario `remember`
expected: Allow without Remember leaves a fresh tab on the same origin prompting again; Allow with the stock Remember checkbox leaves a fresh tab granted with no panel, getAllForBrowser reports a persistent allow, and the grant shows in the Phase 31 site panel
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: remember PASS (geolocation permission id harness fix 54af4fc8)"

### 6. Scenario `sharing`
expected: Live camera, microphone and screen tracks bring a sharingChanged push and the chrome bar marks; stopping them clears both; a forged frame message carrying sharing: true shows nothing
result: pass
evidence: "39-09 2026-11-06, main d891dbe7: sharing PASS on the X11 capture route, a harness route only: the session runs with media.webrtc.capture.allow-pipewire=false and MOZ_ENABLE_WAYLAND=0, GDK_BACKEND=x11, XDG_SESSION_TYPE=x11, so getDisplayMedia takes libwebrtc's X11 screen capturer and the stock doorhanger lists the screen with no KDE portal chooser. The pref alone gave NotFoundError: the X11 capturer is built only when IsRunningUnderWayland() is false. Camera, microphone and screen pushes and marks, the clear push and the forged-flag leg all pass; --self-test --scenario sharing: control green, sharing-stuck-on and frame-flag-accepted red"
human: "37 T6 portal click: on the default Wayland session (no route), share a screen from a page and pick it in the KDE portal chooser; the chrome bar shows the screen mark and stopping the share clears it"

### 7. Scenario `camera-doorhanger`
expected: A camera request shows the stock webRTC-shareDevices doorhanger with its device menulist populated; the stock Allow resolves the page promise
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: camera-doorhanger PASS"

### 8. Scenario `dialog-probe` (probe 1)
expected: alert, confirm, prompt, leave-page and HTTP-auth each shown by the stock window-modal commonDialog. While each is open: an IDE edit is typed and read back, the shell window's input-enabled state is read, a traffic tab navigates and the push sequence advances, and a KWin screenshot is taken. A live run writes `.planning/probes/prompt-probe-verdict.json` (replacing the provisional one) and `.planning/probes/prompt-probe/`; then `git add` them by explicit path and run `node scripts/verify-permission-prompts.mjs`. Red when the stock dialog blocks the IDE. Watch: whether BiDi auto-closes content prompts (needs unhandledPromptBehavior: ignore), whether the 127.0.0.1 cross-port 401 shows the auth dialog
result: skipped
reason: "Deferred follow-up: PROMPT-03 (backlog 999.3): the verdict stays stock-blocks-ide; for all five kinds the IDE edit did not land, shell input was disabled and pushes stalled"
owner: "Chris 2026-11-05 via AskUserQuestion: OQ1: Derived scenario skip (Recommended). A scenario-level skip printed as `SKIPPED (PROMPT-03 deferred, 999.3)`, derived from the REQUIREMENTS.md deferral record so it stops applying the moment the deferral is removed, plus a WINDOWS.md ledger row; --gate goes green by a recorded exclusion. Plan 39-10 implements it; this row's result is recorded there"

### 9. Scenario `dialog`
expected: Each of the five kinds resolves the page on answer; an IDE edit lands and the shell's input stays enabled while it is open; the push sequence advances on the same recorder; screenshots logged for review
result: skipped
reason: "Deferred follow-up: PROMPT-03 (backlog 999.3): IDE push traffic stops while a stock dialog is open"
owner: "Chris 2026-11-05 via AskUserQuestion: OQ1: Derived scenario skip (Recommended). A scenario-level skip printed as `SKIPPED (PROMPT-03 deferred, 999.3)`, derived from the REQUIREMENTS.md deferral record so it stops applying the moment the deferral is removed, plus a WINDOWS.md ledger row; --gate goes green by a recorded exclusion. Plan 39-10 implements it; this row's result is recorded there"

### 10. Scenario `stop-repeat`
expected: A 20-alert loop is stopped with the stock checkbox on the second alert: the loop finishes with no further dialog, this tab does not prompt again, a new tab (new browsing-context group) still prompts
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: stop-repeat PASS (Remote Agent prefs harness fix 54af4fc8)"

### 11. Scenario `beforeunload-scope`
expected: A web tab's leave-page reaches the stock dialog (control); a dirty Theia editor plus a frame reload shows the stock leave dialog, answered "stay"; no `dialogRequest` push is recorded. Watch: whether the Theia frame's location.reload() with a dirty untitled editor prompts at all
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: beforeunload-scope PASS (leftover handler harness fix 54af4fc8)"

### 12. Scenario `password-save`
expected: A login form submit shows the stock save doorhanger with fields filled by the prompter (read chrome-side); the stock Save stores the login (read back through Services.logins); no credential reaches a log or a push
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: password-save PASS (identity-icon-box product fix in 1642f2d7; FillHelpers.showConfirmation threw before the login was stored)"

### 13. Scenario `password-update`
expected: A changed password shows the stock doorhanger and its stock Update replaces the stored password
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: password-update PASS (same product fix, 1642f2d7)"

### 14. Scenario `popup-block`
expected: A gesture-less window.open is blocked; the tab's blocked-popup bar shows inside the web tab widget with the page rect shrunk below it; Allow opens the stored popup as a web tab right after its opener with browsingContext.opener intact; no popup permission is written (read back through the same reader that sees a stock location grant)
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: popup-block PASS"

### 15. Scenario `hung-script`
expected: A page loop past dom.max_script_run_time shows the hung-script bar; Keep waiting hides it and it returns after the wait period; Stop script ends the loop
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: hung-script PASS"

### 16. Scenario `protocol-handler`
expected: registerProtocolHandler shows the protocol-handler bar; Add stores the handler (read back through the handler service); Don't allow on a second scheme stores nothing
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: protocol-handler PASS"

### 17. `node scripts/verify-prompts-live.mjs --self-test` (live half)
expected: Clean control session per target scenario green, then all 21 plants each go red naming their drift (the static half already passes)
result: skipped
reason: "Deferred follow-up: static half PASS (21 plants). Live half run with --self-test --scenario over the 13 scenarios whose clean controls are green: all 13 controls green, 13 of 17 plants red as named. queue-shown-early and activation-wrong-tab stay green; camera-template-missing goes red on an empty device menulist instead of its own failure; allow-loads-frame-url goes red on popup not adopted next to its opener instead of its own failure. The 4 plants on sharing (2), dialog-probe and dialog were not run: the screen-share portal check and PROMPT-03 (999.3)"

### 18. Review fix CR-01a: an adopted tab's prompt shows only while that tab is current
expected: Open an adopted tab (a target=_blank link, or a blocked-popup Allow). Its geolocation prompt shows while the adopted tab is current and does not show while a host tab is current; switching host tab to adopted tab to IDE shows and hides it each time and never shows another tab's prompt over the adopted page (`b33f8953`, no live row)
result: [pending]

### 19. Review fix CR-01b: adopted-tab cleanup on navigation and close
expected: A bar on an adopted tab clears when that tab navigates to another document. Closing the adopted tab drops its prompts and bars, sends pending:false, and leaves no stale mark in the strip
result: [pending]

### 20. Review fix CR-01c: adopted-tab parity with host tabs
expected: An adopted tab has a tab-host node: its favicon shows, F12 opens DevTools for it, WebDriver and an extension's tabs.query see it, and its opener tab is cleared when the opener closes
result: [pending]

### 21. Review fix CR-02: camera, then a location grant
expected: A page holds a live camera track, then asks for location and the user grants it in the stock panel. The camera mark stays lit (`9aee3790`, proven so far only against stub maps)
result: [pending]

### 22. Review fix WR-01: reports that arrive before the adoption ack
expected: A camera report, a blocked-popup bar, a protocol-handler registration and a hung-script report that happen while an overlay is pending (pc-N) are all shown at the ack: the camera mark lights, the bar appears, the registration is not lost (`badf1036`). Also check the remaining pending-window gap the review listed: a hung script and a prompt raised before the ack
result: [pending]

### 23. Review fix WR-02: navigation resets the sharing marks
expected: Share the camera, then navigate the tab to another page. A sharingChanged push with all false arrives and every mark goes off (`5ffef72e`)
result: [pending]

### 24. Review fix WR-03: dismissed prompts leave no false mark
expected: A notification request made without a user gesture (the post-prompt shown dismissed), and a password capture in a private window or an unchanged login, show no "Open the tab to answer it" mark, count nothing toward the cap of 3, and push no pending:true (`657f0a4b`)
result: [pending]

### 25. Review fix WR-04: blocked-popup Allow keeps window.opener
expected: A sign-in or payment style popup that reports back with window.opener.postMessage works after Allow; a blocked window.open() with no URL (about:blank) is still offered and opens; the popup leaves the list only after the replay is sent (`22d02c9c`)
result: [pending]

### 26. Review fix WR-05: probe 1 replacing the verdict
expected: A live dialog-probe run replaces the provisional verdict with evidence; `relayFeasible` and `relayWhy` come from the measured preconditions (host and adopted tab nodes, selectedBrowser, auth members) and `prompt-probe-verdict-live` goes green under `--gate`
result: [pending]

### 27. Review fix WR-07: the live plants
expected: The reworded popup-block plants (`allow-loads-frame-url`, `adopt-next-to-opener-failed`) and the plants that only simulate a symptom (`cross-tab-leak`, `theia-beforeunload-relayed`) go red in a live session. Decide whether the adopted-prompt, adopted-bar-navigate and camera-then-geo scenarios are worth writing (WR-07's fix list), since items 18-21 are held only by hand
result: [pending]
live: "v1.5 end-of-milestone live pass 2026-11-04, main: adopt-next-to-opener-failed, cross-tab-leak and theia-beforeunload-relayed go red naming their drift; allow-loads-frame-url goes red on popup not adopted next to its opener instead (deferred under item 17). Still open for the owner: whether the adopted-prompt, adopted-bar-navigate and camera-then-geo scenarios are worth writing"

### 28. Doorhanger placement and keyboard (KDE Wayland)
expected: The native panel opens over the page's top-left corner just under the chrome bar, above the Theia frame, with its stock Allow, Block and Remember controls; Tab and Enter operate it; Esc dismisses it; it follows a window resize and a move; nothing overlays it
result: [pending]

### 29. Pending-prompt mark in the tab strip
expected: A background tab with a waiting prompt shows the bell mark and its tooltip in both themes; the mark clears when the prompt is answered or the page navigates. Note IN-03: the copy says "permission" even for a password offer and stays on the current tab
result: [pending]

### 30. Sharing indicator in the chrome bar
expected: One mark per shared kind (camera, microphone, screen), legible in light and dark, with the tooltip "{App} is sharing your camera with this tab." and its siblings; no mark for a tab that shares nothing
result: [pending]

### 31. WebRTC device doorhanger and password doorhanger
expected: The device menulists and the camera preview lay out correctly in the native panel; the password doorhanger shows both fields, the username field upgraded, and the autocomplete panel opens
result: [pending]

### 32. Notification bars
expected: Blocked-popup, hung-script and protocol-handler bars sit inside the web tab widget, shrink the page rect (never cover content), read correctly in both themes, and a stacked state (popup and hung script on one tab) does not overlap. Copy: "Stop script" reads as destructive
result: [pending]

### 33. Probe screenshots
expected: Review `.planning/probes/prompt-probe/` for the five dialog kinds: does the IDE look and behave interactive while each is open (a screenshot cannot show input state, so cross-check `inputEnabled` in the verdict)
result: pass
evidence: "39-09 2026-11-06, main fae88df5: the five dialog PNGs are window captures. kwinShot now goes through pb-kwin captureShell (raise, active-window gate on the powerbrowser class, spectacle -a -S) and keeps a PNG only when its size equals the active window's frame times its output scale; each is 1600x1000, the 1280x800 shell frame at scale 1.25, and each was opened and shows only the PowerBrowser window. Headed run (PB_LIVE_HEADED=1, sandbox off); verdict unchanged (stock-blocks-ide, inputEnabled false for every kind). The stock dialog is its own window and is not in the shell capture. The full-desktop copies from 6eef7dbc remain in history on origin/main (owner decision)"

### 34. Owner decision: the 37-03 gate (probe 1)
expected: |
  Decide once item 8 returns. The lane expects `stock-blocks-ide`: the verifier read upstream and found `AppWindow::ShowModal` calling `EnableParent(false)` (xpfe/appshell/AppWindow.cpp:460), `nsWindow::SetModal` calling `gtk_window_set_modal` (widget/gtk/nsWindow.cpp:751), and the dialog opened with `"centerscreen,chrome,modal,titlebar"` (browser/actors/PromptParent.sys.mjs:303-306).
  What then happens:
  - stock-keeps-ide-usable: nothing to build; the verdict replaces the provisional one and PROMPT-03 can close.
  - stock-blocks-ide with relayFeasible true: the relay is built (a `getTabDialogBox` stand-in with the Pitfall 2 call-site audit and the `setTabLabelForAuthPrompts` audit, `webTabDialogAnswer`, a `dialogRequest` push and subscriber, the stop-repeat enum and copy row). Rule (p) in verify-permission-prompts.mjs goes red until the member exists. That is a replan of 37-03, then a live pass again.
  - stock-blocks-ide with relayFeasible false: PROMPT-03 cannot be met as written and goes to the owner (ROADMAP "Needs Chris"). Rule (p) goes red with "route to Chris".
  `relayFeasible` is false when an adopted or host tab has no getTabForBrowser node, when selectedBrowser is missing, or when cross-domain auth needs gURLBar.setURI and setTabLabelForAuthPrompts (a stand-in widening). After the CR-01 fix the first term is expected true.
result: pass
evidence: "resolved 2026-11-03 (PROMPT-03 deferred to backlog 999.3); owner decision 2026-11-06"
owner: "Chris 2026-11-06 via AskUserQuestion: box 37, Accept all (Recommended). T34: mark resolved, decided 2026-11-03 (defer PROMPT-03 to 999.3)."

### 35. Owner decision: the sharing indicator does not open the site panel
expected: 37-UI-SPEC wants a click on the sharing indicator to open the Phase 31 site panel. 37-02 did not build it; clicking does nothing. Accept as a follow-up, or schedule it. PROMPT-02's roadmap wording (a sharing indicator shows) does not require it
result: pass
evidence: "owner decision 2026-11-06; follow-up listed under Deferred Follow-Ups"
owner: "Chris 2026-11-06 via AskUserQuestion: box 37, Accept all (Recommended). T35: accept as follow-up."

### 36. Owner decision: getTabSharingState reports no sharing to extensions
expected: The tab host's getTabSharingState (PowerBrowserAPI.sys.mjs:6663) returns camera, microphone and screen undefined even while a track is live, so an extension reading tab sharing state sees none. 37-02 left it as outside its plan. Phase 38's roadmap criteria do not name it. Decide whether Phase 38 or a follow-up owns it
result: pass
evidence: "owner decision 2026-11-06; follow-up listed under Deferred Follow-Ups"
owner: "Chris 2026-11-06 via AskUserQuestion: box 37, Accept all (Recommended). T36 and 38 T37: one ruling for both, accept as follow-up."

### 37. Owner decision: CONTEXT D-12 open points
expected: |
  The three open points from D-12. CONTEXT's "Chris's confirmations (2026-10-25)" section records points 1 and 3 as answered (bars are not permission prompts and keep their Theia buttons; per-popup Allow is enough, no site-wide toggle). Point 2 was covered only by the words "link-handler request": protocol-handler Add writes a persistent handler (`hs.store`, WebProtocolHandlerRegistrar.sys.mjs:483-504) from a Theia bar button, and the Don't allow refusal holds for the document. Confirm that the persistent write from a bar is intended, or ask for a stock route (which would need getNotificationBox reinstated and N2 reversed).
result: pass
evidence: "owner decision 2026-11-06: the persistent protocol-handler write from the bar button is intended"
owner: "Chris 2026-11-06 via AskUserQuestion: box 37, Accept all (Recommended). T37: confirm intended."

### 38. Owner decision: two bar copy rows differ from 37-UI-SPEC
expected: |
  The blocked-popup bar's second action is "Dismiss", not "Don't show again for this site" (the latter would be a permission or pref write). The protocol bar reads "Allow {host} to open {scheme} links?" with Add and Don't allow, in place of "This page wants to open another app." with Open and Don't allow. A redirect-only message row was added. Accept the plan's version or restore the spec's wording.
result: pass
evidence: "owner decision 2026-11-06; 37-UI-SPEC copy rows amended to the shipped copy in the same commit"
owner: "Chris 2026-11-06 via AskUserQuestion: box 37, Accept all (Recommended). T38: accept the shipped copy; amend 37-UI-SPEC."

### 39. Judgment-tier and backstop prohibitions (37-VERIFICATION Prohibitions table)
expected: Confirm or reject each flagged non-authoritative verdict, including the two backstops (no BiDi DOM assertion on #notification-popup; bars never cover page content) that only a held-out test or a live run proves
result: pass
evidence: "owner decision 2026-11-06. The two backstops (no BiDi DOM assertion on #notification-popup; bars never cover page content) stay on the human checklist (plan 39-19)"
owner: "Chris 2026-11-06 via AskUserQuestion: box 37, Accept all (Recommended). T39: accept; keep the two backstops on the human checklist."

### 40. Owner ruling check: the Phase 31 site-panel writer
expected: The ruling is "prompts are answered only through Firefox's own buttons". No allow, grant or permit kind exists. One persistent-write path remains from the Theia frame: `webTabSetPermission` (Phase 31) writes `SitePermissions.setForPrincipal` for camera, microphone, geo, notifications, autoplay and popup from the site panel, behind a tab id, a known id and state, and an origin echo equal to the tab's own contentPrincipal. It cannot answer a pending prompt (the prompt record is never consulted), but it can pre-set a value that the next request would honour. Confirm that the site panel's own edit satisfies the ruling
result: pass
evidence: "owner decision 2026-11-06"
owner: "Chris 2026-11-06 via AskUserQuestion: box 37, Accept all (Recommended). T40: satisfies the rule (cannot answer a pending prompt; origin echo checked)."

### 41. Owner decision: 37-REVIEW info findings left unfixed
expected: IN-01 (`displayHost` on the doorhanger push is unread and is the top-level host), IN-02 (a reloaded frontend loses the pending-prompt marks), IN-03 (the pending mark's copy says "permission" for a password offer and stays on the current tab), IN-04 (the cap counts only never-shown records; blocked-popup reads can resolve out of order). Accept all four as follow-ups or schedule any
result: pass
evidence: "owner decision 2026-11-06; IN-01..IN-04 listed under Deferred Follow-Ups"
owner: "Chris 2026-11-06 via AskUserQuestion: box 37, Accept all (Recommended). T41 and 38 T38: accept all info findings as follow-ups."

## Summary

total: 41
passed: 23
issues: 0
pending: 15
skipped: 3
blocked: 0

## Gaps

[none yet]

## Deferred Follow-Ups

```yaml
- test: 6
  idea: "screen sharing needs the KDE portal chooser answered by hand; run sharing with a person at the machine"
  deferred_at: 2026-11-04
- test: 8
  idea: "PROMPT-03 stock dialogs block the IDE (backlog 999.3); dialog-probe and dialog stay red until it lands"
  deferred_at: 2026-11-04
- test: 17
  idea: "four prompts self-test plants misbehave once the self-test gets past sharing: queue-shown-early and activation-wrong-tab stay green, camera-template-missing goes red on an empty device menulist, allow-loads-frame-url goes red on popup not adopted next to its opener; re-site each so it reaches its own failure"
  deferred_at: 2026-11-04
- test: 33
  idea: "kwinShot does not raise the shell before spectacle, so the dialog probe PNGs are full-desktop captures; raise the shell with the KWin script first"
  deferred_at: 2026-11-04
- test: 35
  idea: "a click on the sharing indicator should open the Phase 31 site panel as 37-UI-SPEC asks; 37-02 did not build it; accepted as a follow-up 2026-11-06 (source: 37-UAT test 35)"
  deferred_at: 2026-11-06
- test: 36
  idea: "getTabSharingState on the tab host returns camera, microphone and screen undefined while a track is live, so extensions see no sharing; one follow-up for 37-UAT test 36 and 38-UAT test 37, accepted 2026-11-06"
  deferred_at: 2026-11-06
- test: 41
  idea: "37-REVIEW info findings IN-01 (displayHost unread, top-level host), IN-02 (reloaded frontend loses pending-prompt marks), IN-03 (pending mark copy says permission for a password offer), IN-04 (cap counts only never-shown records; blocked-popup reads can resolve out of order); accepted as follow-ups 2026-11-06 (source: 37-UAT test 41)"
  deferred_at: 2026-11-06
```
