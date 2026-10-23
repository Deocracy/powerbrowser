---
status: awaiting_human_verify
trigger: "Debug and fix the intermittent overlay focus failure: after Paste & Go from the pill's context menu, or after the harness's focusOverlay (scripts/lib/pb-live-probe.mjs:147), chrome's focus is sometimes not in the overlay's page (3 of 5 full verify-address-bar-live runs). Todo: .planning/todos/pending/2026-10-23-overlay-focus-intermittent.md"
created: 2026-10-22T00:00:00Z
updated: 2026-10-22T23:59:00Z
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "Chrome focus misses the overlay because three defects meet one Gecko rule (a visibility:hidden element cannot take focus, and a focused one that becomes hidden loses focus at the next refresh tick). (1) PowerBrowserAPI's state push reads browser.currentURI/canGoBack live, so between DidChangeBrowserRemoteness and the new document's onLocationChange it pushes the rebuilt RemoteWebNavigation's placeholder (about:blank, canGoBack false); WebTabWidget takes that as 'no page' and publishes visible=false, hiding the overlay for a frame or two on every browsing-context-replacing navigation. (2) WebTabWidget.focusPage sends webTabFocus at once, while the geometry that shows the overlay may still be pending (rAF-coalesced publish after a menu or dropdown closes, or after a hasPage flip), so chrome receives the focus before the show. (3) Paste & Go's focusPageWhenLoaded waits for a loading=true push that chrome's per-frame coalescer drops for a fast load, so it never sends the focus. The address-keys failure is the harness's own o.focus() racing the dropdown-close restore."
  confirming_evidence:
    - "trace2/r1: Did(+7233) -> push about:blank loading=true (+7238) -> geometry visible=false (+7253) -> chrome hidden + webTabFocus (+7254) -> visible=true (+7272), no focus event"
    - "trace/run3 and run6: only '/pasted loading=false' after webTabNavigate, no loading=true push, no webTabFocus sent"
    - "trace3/r7: chrome hidden at +15421 (dropdown), harness focusOverlay logs visibility 'hidden' at +15434, visible at +15435"
    - "Gecko: nsIFrame::IsFocusable checks IsVisibleConsideringAncestors; Document.cpp:19332 FixUpFocus each tick; browser-custom-element.mjs finishChangeRemoteness -> construct() -> new RemoteWebNavigation (about:blank, no history)"
  falsification_test: "After the fix: (a) no state push for a page-to-page navigation carries about:blank or drops canGoBack; (b) F6 from the pill with the dropdown open gives the page focus every time; (c) 10+ consecutive loops of search,context-menu,address-keys pass. A failure of any of those with the fix in place refutes the corresponding part."
  fix_rationale: "(1) removes the transient hide at its source (chrome stops reporting a placeholder as the page); (2) makes every focusPage caller (8 sites) order the focus after the geometry that shows the overlay, using the channel's in-order delivery; (3) Paste & Go focuses at commit through the fixed focusPage, which is what 29-09 specified ('commits it as Enter would, moving focus to the page') and survives the navigation because Gecko keeps a focused frame owner focused across a frameloader swap (nsFrameLoaderOwner.cpp:234-240). The harness focusOverlay waits for chrome to show the overlay, a real precondition (a user cannot click a hidden page)."
  blind_spots: "Not measured: whether BFCache replacement happens for content-initiated navigations (the new scenario uses the product's navigate path). A focus deferred while a blocking layer stays open for long would land when it closes. The stock browser windows are not involved."
  candidate_causes:
    - "code: frontend focus ordering (web-tab.ts focusPage) and Paste & Go load detection (address-bar.tsx)"
    - "code/environment: chrome push reads Gecko's placeholder navigation state after a remoteness change (PowerBrowserAPI.sys.mjs + Gecko browser-custom-element)"
    - "harness: focusOverlay focuses before chrome applied the restore (pb-live-probe.mjs)"
  and_gate: "yes -- the Paste & Go failure needs the hide (placeholder push or pending restore) AND a focus arriving inside it, or the dropped loading push; address-keys needs the dropdown-close hide AND the harness focus inside the restore window. Each defect is fixed separately."
next_action: human check on a real display and keyboard: (1) type in the pill so suggestions open, press F6, then type -- keys must reach the page; (2) right-click the pill, Paste & Go a URL, then press Down -- the page scrolls; (3) click into a page, follow a same-site link, then press Down -- the page scrolls. Archive to resolved/ and write the knowledge-base entry after that.
bug_class: heisenbug (timing-dependent, intermittent)
known_pattern_candidate: none (no knowledge-base.md)

## Symptoms

expected: after Paste & Go from the pill context menu, and after the harness's focusOverlay, chrome's document.activeElement is the overlay browser of the current web tab
actual: sometimes chrome's focus is not on the overlay (address-keys: "broken instrument: the page could not be focused before F6"; context-menu: "after Paste & Go chrome's focus must be in the tab's page")
errors: see actual
reproduction: node scripts/verify-address-bar-live.mjs --scenario search,context-menu,address-keys, in a loop
started: Phase 29 (about 2 in 5 full runs), Phase 30 (3 in 5 full runs on 2026-10-22)

## Eliminated

- hypothesis: H1 alone (every failure is a focus sent while the overlay is hidden behind a closing menu)
  evidence: traced runs 3 and 6 never sent webTabFocus at all (shape A); run 5's hide came from an about:blank state push, not from the menu (the menu restore had already been applied at +7327)
  timestamp: 2026-10-22

## Evidence

- timestamp: 2026-10-22
  checked: web-tab.ts BLOCKING_LAYER_SELECTOR and publish()
  found: while '.pb-chrome-bar-dropdown, .quick-input-widget, .lm-Widget.dialogOverlay, .lm-Menu, .lm-mod-drag-image' is rendered, every web tab publishes visible=false; publish() is rAF-coalesced and sent as an actor request; webTabGeometry sets overlay style.visibility hidden/visible
  implication: after the pill menu or dropdown closes there is a window (>= one animation frame plus the IPC hop) in which the overlay is still visibility:hidden
- timestamp: 2026-10-22
  checked: PowerBrowserAPI.webTabFocus and pb-live-probe focusOverlay
  found: both call browser.focus() synchronously with no check of visibility
  implication: a focus attempt in that window targets a non-focusable element
- timestamp: 2026-10-22
  checked: upstream layout/generic/nsIFrame.cpp:11642 and dom/base/Document.cpp:19332 + PresShell::FixUpFocus (PresShell.cpp:1398)
  found: nsIFrame::IsFocusable returns not-focusable when !IsVisibleConsideringAncestors() (visibility:hidden); the HTML focus fixup rule runs on every refresh tick and ClearFocus()es a focused element whose frame is no longer focusable
  implication: two failure modes from one cause: (a) focus() on a hidden overlay is a silent no-op (29-09 "Chrome then logged no focus event at all"), (b) a focused overlay that is hidden afterwards loses focus at the next tick with no related target (29-09 "got focus, then lost it 32 ms later with no related target")
- timestamp: 2026-10-22
  checked: channel ordering, web-tab.ts WebTabChannel.send/request and PowerBrowserGroupParent.receiveMessage
  found: send and request both dispatch the same DOM event to the one actor child; the parent routes webTabGeometry and webTabFocus to synchronous arms of handleGroupMutation
  implication: chrome applies frontend messages in send order, so a geometry sent before a focus is applied before it
- timestamp: 2026-10-22
  checked: BASELINE, unmodified tree, `node scripts/verify-address-bar-live.mjs --scenario search,context-menu,address-keys` x15 (plus one timing run that passed)
  found: 6 of 15 runs exit 1 (40%). context-menu "after Paste & Go chrome's focus must be in the tab's page; it is on undefined" in all 6 (runs 1,2,5,7,11,13); address-keys "broken instrument: the page could not be focused before F6" in 2 (runs 1,5), only in runs where context-menu also failed. "undefined" is a null tabIdOfBrowser (chrome's active element is not an overlay). Logs: scratchpad/base/run*.log
  implication: reproducible at a useful rate; the address-keys failure correlates with the context-menu one in the same session
- timestamp: 2026-10-22
  checked: traced runs (PB_FOCUS_TRACE=1), 6 runs of search,context-menu,address-keys: runs 3,5,6 failed context-menu; scratchpad/trace/run*.log
  found: TWO distinct failure shapes. Shape A (runs 3, 6): after webTabNavigate the only state push is "/pasted loading=false"; no loading=true push ever arrives, and the frame never sends webTabFocus. Shape B (run 5): pushes "about:blank loading=true" then "/pasted loading=false"; the frame sends webTabGeometry visible=false 2 ms before webTabFocus, chrome logs "vis hidden" at +7343 and receives webTabFocus at +7344, then visible=true at +7358; no focus event
  implication: H1 (focus sent while hidden) explains shape B only. Shape A is a different defect: focusPageWhenLoaded requires a loading=true push before a loading=false one, and chrome's scheduleWebTabState keeps one pending record per tab per animation frame (latest wins), so a load that starts and finishes within one frame yields only the loaded push
- timestamp: 2026-10-22
  checked: traced run with Will/DidChangeBrowserRemoteness listeners and a progress listener on the overlay; scratchpad/trace2/r1.log
  found: +7228 onStateChange START (cur=/one/search) -> +7229 WillChangeBrowserRemoteness -> +7233 DidChangeBrowserRemoteness (currentURI now about:blank) -> +7238 push "about:blank loading=true" -> +7243 onLocationChange /pasted -> +7249 STOP -> +7253 frame sends geometry visible=false -> +7254 chrome hides overlay, frame sends webTabFocus, push "/pasted loading=false" -> +7272 visible=true. No focus event.
  implication: the about:blank is the placeholder of the browser's rebuilt RemoteWebNavigation (browser-custom-element.mjs finishChangeRemoteness -> construct() -> new RemoteWebNavigation, _currentURI null reads about:blank; canGoBack false) between DidChangeBrowserRemoteness and the new document's onLocationChange. webTabPush reads browser.currentURI live, so it pushes that placeholder; WebTabWidget.applyState takes it as "no page" (hasPage false), renderState mutates the body, the body observer publishes visible=false. Every navigation that replaces the browsing context (BFCache in parent, process switch) flashes the overlay hidden for a frame or two
- timestamp: 2026-10-22
  checked: upstream nsFrameLoaderOwner.cpp:131,198,234-240 (FixUpFocusBefore/AfterFrameLoaderChange)
  found: when the overlay element is chrome's focused element, a frameloader swap keeps it focused and re-activates the new remote frame
  implication: the Phase 29 note "a focus given earlier is lost when the navigation commits into a new browsing context" was the hide (focus fixup rule), not the swap itself
- timestamp: 2026-10-22
  checked: traced run of search,address-keys x8; failure in r7 (scratchpad/trace3/r7.log)
  found: chrome hides the overlay at +15421 (the pill dropdown opened by the Address-mode focus), the harness focusOverlay records visibility "hidden" at +15434 and calls o.focus(), chrome shows the overlay at +15435
  implication: the address-keys failure is the harness focusing before chrome applied the restore; the step has a real signal to wait on (the overlay's style.visibility in chrome)
- timestamp: 2026-10-22
  checked: new scenario page-focus run against the UNFIXED product (scratchpad/red/r1-r18)
  found: step 1 (type in the pill so the dropdown hides the page, then F6) red 18 of 18: webTabFocus sent at +7347 while the dropdown was still open, restore at +7350. Step 2 (four frontend navigations of a focused page): every hop does Will/DidChangeBrowserRemoteness with focused=true kept by Gecko; with plain pages the Did-to-onLocationChange window is 3-5 ms and the START push is flushed before the switch, so step 2 was red only 2 of 15 runs (1 run lost focus at /pf-3). With pages that spend 60 ms on pagehide (window ~63 ms) plus a pagetitlechanged re-dispatched on the overlay at DidChangeBrowserRemoteness (the product's own title listener schedules a push inside the window), step 2 is red 4 of 4: "the focused page lost chrome's focus while it loaded /pf-2" and "1 of 4 state pushes carried about:blank"
  implication: both product defects reproduce deterministically; canGoBack was dropped as a signal (RemoteWebNavigation.canGoBack is canGoBackFromEntryAtIndex, which skips entries without user interaction, so harness-driven history reads false legitimately)
- timestamp: 2026-10-22
  checked: fixed tree, page-focus with PB_FOCUS_TRACE (scratchpad/green/g1.log) and search,context-menu,page-focus,address-keys x3
  found: all green 3 of 3. In each hop the retitle trigger schedules a push inside the ~64 ms Did-to-onLocationChange window, and no push reaches the frame until onLocationChange carries the new URL; focused=true holds through every switch
  implication: the suppression works by mechanism, not by timing luck
- timestamp: 2026-10-22
  checked: AFTER the fix (commits c423f1a, 5b725e1): 15 loops of search,context-menu,address-keys (scratchpad/after1), full verify-address-bar-live, its --self-test, verify-nav-keys-live, verify-web-tab-live, verify-platform --quick
  found: loops 15 of 15 exit 0 (baseline 9 of 15). Full run 31/31 PASS in 4m27s. --self-test exit 0: clean control green and all 36 plants red as named, focus-before-show and placeholder-push included. nav-keys-live exit 0, 31 PASS. web-tab-live exit 0 (5 mode hops, max alignment delta 0.48 CSS px). --quick PASS before each commit. ng-040 catalogue, check-internals-boundary plain and --catalogue PASS
  implication: the failure no longer reproduces in 15 + 2 full sessions; the new scenario fails on the old behaviour and passes on the new

## Resolution

root_cause: "Chrome's focus misses the overlay because a hidden <browser> cannot take focus and a focused one that is hidden loses it at the next refresh tick (Gecko nsIFrame::IsFocusable, Document focus fixup), and three defects put the focus inside a hidden moment: (1) PowerBrowserAPI's state push read browser.currentURI live, so between DidChangeBrowserRemoteness and the new page's onLocationChange it pushed the rebuilt RemoteWebNavigation's about:blank placeholder; WebTabWidget took it as no page and hid the overlay for a frame on browsing-context-switching navigations; (2) WebTabWidget.focusPage sent webTabFocus at once, ahead of the rAF-coalesced geometry publish that shows the overlay after a menu or dropdown closes; (3) Paste & Go's focusPageWhenLoaded waited for a loading=true push that chrome's per-frame coalescer drops for a fast load, so it never sent the focus. Harness: focusOverlay called o.focus() before chrome applied the dropdown-close restore."
fix: "PowerBrowserAPI.sys.mjs: switchingOverlays WeakSet, set on DidChangeBrowserRemoteness, cleared by a top-level location change or network stop (scheduleWebTabState settled arg); the rAF flush skips an overlay mid-switch. firstWebTabLoad gets a .catch logging err.name only. web-tab.ts: focusPage sets focusWanted and publishes; the publish sends webTabFocus after its geometry when visible, holds it while only a blocking layer hides the page, drops it when the tab cannot show. address-bar.tsx: Paste & Go calls tab.focusPage() after the commit; focusPageWhenLoaded deleted. pb-live-probe.mjs: focusOverlay waits until chrome shows the overlay (overlayVisibility) before focusing. New live scenario page-focus (F6 with the dropdown open; four navigations of a focused page with slow-pagehide pages and a push requested inside each switch) and plants focus-before-show, placeholder-push."
verification: "Signal 1 (reproduction): baseline 6/15 red -> 15/15 green on the same three scenarios. Signal 2 (new regression check): page-focus red on the unfixed product 18/18 (F6 step) and 4/4 (navigation step, with the slow-pagehide pages and the in-switch retitle), green on the fixed product 3/3 plus the full run and the self-test clean control. Signal 3 (mutation): plants focus-before-show (old focusPage) and placeholder-push (old chrome push) go red as named. Signal 4 (regression): full verify-address-bar-live 31/31, --self-test 36/36 plants, verify-nav-keys-live 31/31, verify-web-tab-live PASS, --quick PASS. Signal 5 (mechanism): trace on the fixed tree shows no push inside the switch window and focused=true held through each switch. oracle_type: specified (chrome's activeElement is the overlay; no about:blank push for a page-to-page navigation). guardrail_verdict: accepted"
files_changed: [powerbrowser/shell/PowerBrowserAPI.sys.mjs, powerbrowser/INTERNAL-APIS.md, theia/extensions/tab-uris/src/browser/web-tab.ts, theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx, scripts/lib/pb-live-probe.mjs, scripts/verify-address-bar-live.mjs]
