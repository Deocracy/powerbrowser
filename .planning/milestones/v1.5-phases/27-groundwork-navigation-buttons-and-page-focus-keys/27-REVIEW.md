---
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
reviewed: 2026-10-21T06:28:19Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - scripts/lib/pb-live-probe.mjs
  - scripts/verify-nav-keys-live.mjs
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
findings:
  critical: 0
  warning: 0
  info: 26
  total: 26
status: clean
---

# Phase 27: Code Review Report (final re-review, iteration 3)

**Reviewed:** 2026-10-21T06:28:19Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** clean (no critical or warning findings remain; info findings are carried)

## Summary

This is the third pass. It covers the two commits of fix iteration 2: 4447528 (WR-07) and 79738ce (IN-25), range `1a54610..79738ce`, three files. The fix report is `27-REVIEW-FIX.md`. Passes 1 and 2 reviewed the wider scope (23 files from base `24a7ba0`, then six files from `f07af6f`). Their info findings IN-01..IN-24 are carried below unchanged, and several cite files outside this pass's scope.

Result:
- WR-07 is resolved in the code. The recorder's condition was checked against Gecko's flag semantics in `upstream/`, not only against the fix report.
- IN-25 is resolved in the code.
- Two new info findings. IN-26: the "focus-keys is its positive control" claim is not enforced by `CONTROL_OF`. IN-27: the hold clear, now shared by pointerup and pointercancel, does not filter on pointerId.
- No critical or warning finding remains, so status is `clean`.

Gates run in this pass:
- `node scripts/verify-shortcut-relay.mjs --self-test`: PASS. The clean tree is green and all 15 plants went red.
- `scripts/verify-platform.sh --only chrome-bar-typecheck`: PASS.

The live `verify-nav-keys-live.mjs --self-test` was not re-run here. Its result (11 plants red, including `reply-listener-ungated`, and a green clean control) comes from the fix report.

## Fix verification

| ID | Status | Evidence |
|----|--------|----------|
| WR-01 | resolved | Pass 2. The pointercancel residual it left (IN-25) is now closed too. |
| WR-02 | resolved | Pass 2. |
| WR-03 | resolved | Pass 2. |
| WR-04 | resolved | Pass 2. |
| WR-05 | resolved | Pass 2 marked it partially resolved, and the F6 remainder was WR-07. WR-07 is now resolved, so WR-05 is closed. |
| WR-06 | resolved | Pass 2. |
| WR-07 | resolved | pb-live-probe.mjs:78-90. A bubble-phase `keydown` listener on the chrome window records `focusAddressF6`/`focusAddressShiftF6` when `isTrusted && keyCode === DOM_VK_F6 && !ctrl/alt/meta && defaultPrevented && !defaultPreventedByContent && !isReplyEventFromRemoteContent && !isWaitingReplyFromRemoteContent`. Gecko check: `Event::IsReplyEventFromRemoteContent` is `IsHandledInRemoteProcess()`, which is `mNoRemoteProcessDispatch && mWantReplyFromContentProcess` (Event.h:398-400, BasicEvents.h:290-292). A chrome `preventDefault()` (default `aCalledByDefaultHandler = true`) calls `StopCrossProcessForwarding()`, which sets `mWantReplyFromContentProcess = false` (BasicEvents.h:191-206, 232-236). After chrome prevents a reply, it no longer reads as a reply and does not read as waiting. That is why the review's original condition (`isReply && defaultPrevented`) could never be true, and the fixer's correction is right. A reply nobody in chrome touched still reads `isReply` true, so the guard excludes it whether or not it arrives prevented. A page-prevented reply has `defaultPreventedByContent` true and is excluded. The first pass to an overlay is excluded by `isWaiting`, and `MarkAsWaitingReplyFromRemoteProcess` also stops propagation (BasicEvents.h:736-741). An F6 to the Theia frame with no reply requested is not prevented in the parent at keydown, so it is not recorded. Positive control: focus-keys (verify-nav-keys-live.mjs:1472-1481) requires the slice after the press to include `focusAddressF6`, then `focusAddressShiftF6`, and fails as BROKEN otherwise. The product calls `relayShortcut` before `preventDefault()` in the same dispatch (powerbrowser.js:430-431), so the entry already exists when the push is seen. Plant: `reply-listener-ungated` (1696-1712, PLANTS row 2066) adds a capture listener after the product's, which requests and then prevents the Theia frame's F6 reply. theia-keeps-keys then fails with `fired ["focusAddressF6"]`, which is exactly the row's `expect` string (message at 1716). The plant listener is never removed, but `runSession` starts a fresh probe shell for each plant, so it cannot leak into another run. |
| IN-25 | resolved | chrome-bar-widget.tsx:354-360. A named `done` handler is registered in the capture phase on `window` for both `pointerup` and `pointercancel`. Whichever fires first removes both listeners and clears `suppressNavClick` in a `setTimeout`. On pointerup, the release's click is still dispatched in the same input task before the timeout, so it is still swallowed. On pointercancel, no click follows. If a previous hold's pair was never fired, it stays registered and fires harmlessly on the next pointerup, because it only ever clears the flag after the click. The pointercancel path is not covered live (fix report). |

## Info

### IN-26: theia-keeps-keys is gated only on page-keys, so its F6 check can be scored without its declared positive control (new, from the WR-07 fix)

**File:** `scripts/verify-nav-keys-live.mjs:1996` (doc claim at 105-108)
**Issue:** The scenario header and the fix now say that focus-keys is the positive control for theia-keeps-keys' F6 firing check. `CONTROL_OF['theia-keeps-keys']` is still `'page-keys'` only, and `theiaKeepsKeys` checks only page-keys (1662-1665). In a full run this does not matter. focus-keys runs first (SCENARIOS order 1984 before 1989), and a BROKEN focus-keys fails the run. But `--scenario page-keys,theia-keeps-keys`, which is also the `reply-listener-ungated` plant's `run` list, scores the F6 absence with no proof in that session that the recorder can see a chrome-prevented F6. If a rebase changes the reply-flag semantics, that subset still goes green. This is the IN-19 class, made specific by a control the doc names but the code does not enforce.
**Fix:** Let `CONTROL_OF` hold a list (`'theia-keeps-keys': ['page-keys', 'focus-keys']`). Have the NOT SCORED path check every entry, and add `focus-keys` to the plant row's `run`. Alternatively, have selectedScenarios add the controls automatically, which also closes IN-19.

### IN-27: The hold clear does not filter on pointerId, so another pointer's pointerup or pointercancel ends the suppression early (residual of WR-01, widened by the IN-25 fix)

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:354-360`
**Issue:** `done` accepts any pointerup or pointercancel on the window. With the IN-25 fix, a cancel of an unrelated pointer also clears the flag. A second touch point or a pen lifted while the Back/Forward hold is still down clears `suppressNavClick` before the holding pointer is released. That release's click then navigates as well as leaving the history menu open.
**Failure scenario:** On a touchscreen, the user long-presses Back with one finger, and the menu opens. A second finger taps and lifts. The first finger then releases on Back, and the page goes back once while the menu is still shown.
**Fix:** Capture `const id = e.pointerId` in `onNavPointerDown` and start `done` with `(ev: PointerEvent) => { if (ev.pointerId !== id) return; ... }`.
**Verifier evidence:** info: not verified live. Multi-pointer input on the chrome bar is uncommon.

### IN-01: Quit flush can run before the coalesced state push, so the saved layout keeps the previous URL (CHROME-01)

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:2286`
**Issue:** Phase 27 changed the progress and title listeners to call scheduleWebTabState (line 4216). It holds each state push until the shell window's next requestAnimationFrame. flushShellState (2286-2292) sends its push straight away and does not drain `pendingStatesByWindow` first. Before this phase every state push was sent synchronously on the same actor, so the frontend always had the latest URL before the flush request arrived. The layout snapshot stores the widget's live URL (tab-uri-registry.ts:173, set in applyState), so a pending push leaves the previous URL and title in the snapshot.
**Failure scenario:** A page in an overlay redirects (a JS redirect or a meta refresh) in the same frame as the quit. The window is wider if the shell window is occluded or minimized and the user quits with Ctrl+Q from a stock browser window. The frontend runs storeLayout with the old `widget.url` before the queued push arrives. On relaunch the tab title shows the old page. If no saved history exists for the row key, or restoreWebTabHistory fails (its catch at 3367 navigates to the snapshot URL), the old page loads.
**Fix:** Factor the rAF body into a drain helper and call it synchronously at the top of flushShellState:
```js
function drainWebTabStates(win) {
  const pending = pendingStatesByWindow.get(win);
  if (!pending) return;
  pendingStatesByWindow.delete(win);
  for (const [id, rec] of pending) {
    if (webTabs.get(id)?.browser === rec.browser) PowerBrowserAPI.webTabPush(rec.theiaBrowser, id, rec.browser, rec.loading);
  }
  pending.clear(); // the already-scheduled rAF then finds nothing
}
```
**Verifier evidence (not refuted, downgraded warning -> info):** The code path exists. At 24a7ba0 the listeners called webTabPush synchronously (base lines 3324, 3340, 3354). They now call scheduleWebTabState, which sends only from rAF (4214-4232), and flushShellState never drains the queue. runQuitFlushSync (729-747) spins the event loop, but nothing guarantees that a pending rAF fires, and a hidden shell window runs no rAF at all. ShellStateFlushContribution.flush (profile-storage.ts:297-309) stores the live `WebTabWidget.url`.

The impact is narrower than the finding states. saveWebTabHistories (763-776) saves the live session history keyed by `entry.rowKey` (3293-3294), so the restore (3361-3367) normally loads the correct page. What remains is a stale title until the page loads, and the old URL only when no history was saved or the restore fails. In both cases the state corrects itself once the page loads.

### IN-02: handleWebTabAction has no try/catch, so raw XPCOM error text reaches the frontend (CHROME-02)

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4095`
**Issue:** The other dispatchers (handleGroupMutation 2321, handleShellMessage 2224) wrap their switch and reply with a fixed string plus `err.name`, following the Final-review M3 rule. handleWebTabAction calls `entry.browser.stop()` (4109), `sessionHistory.getEntryAtIndex` and `entry.browser.gotoIndex` (4156) with no guard. A throw rejects the actor query, and GroupActorChild's rejection branch forwards `String(error.message)` unchanged with reason 'store'.
**Failure scenario:** The user presses Esc or picks a history entry while an overlay is switching process or being torn down. stop(), gotoIndex() or getEntryAtIndex() throws an NS_ERROR whose message names the internal interface and its chrome:// source location. That text reaches the Theia frontend.
**Fix:**
```js
try {
  switch (kind) { ... }
} catch (err) {
  return { ok: false, reason: "store", message: `handleWebTabAction: ${kind} failed (${err && err.name ? err.name : "error"})` };
}
```
**Verifier evidence (not refuted, downgraded warning -> info):** The function is new in this phase (4095-4177). Its switch is unguarded at 4109, 4138 and 4156. PowerBrowserGroupParent.receiveMessage (3667) returns the promise directly, and GroupActorChild.sys.mjs:69-76 forwards the raw message. So the inconsistency with the other dispatchers is real.

No consumer shows or logs the message:
- webTabStop is fire-and-forget (web-tab.ts:663).
- history() and gotoIndex() read only `reply.where` (644-649).
- chrome-bar-widget.tsx:370-372 reads only ok, index and entries, and shows the fixed `CHROME_BAR_COPY.historyReadFailed` (445-446).

The child's synchronous-throw branch (GroupActorChild.sys.mjs:44-50) already forwards raw text for every kind. This is a defense-in-depth gap with no current exposure path.

### IN-03: Chrome-only event internals are used outside the boundary file, and the boundary gate cannot detect it (CHROME-03)

**File:** `powerbrowser/shell/powerbrowser.js:410`
**Issue:** The F6 reply listener calls `event.requestReplyFromRemoteContent()` and reads `isReplyEventFromRemoteContent`, `isWaitingReplyFromRemoteContent` and `defaultPreventedByContent`, which are [ChromeOnly] members (Event.webidl:90-99). It also uses `KeyEvent.DOM_VK_F6`. The AppCommand listener (443) handles a chrome-only widget event. None of these names is on check-internals-boundary.sh's FORBIDDEN_PATTERNS list, so `--quick` passes and INTERNAL-APIS.md has no row for them.
**Failure scenario:** An upstream rebase renames or removes requestReplyFromRemoteContent. F6 breaks, and no catalogue row points at the cause.
**Fix:** Move the reply decision behind the boundary, for example as `PowerBrowserWebTabs.handlePageKeyReply(event, browserElement, rows)`. Then add `requestReplyFromRemoteContent`, `isReplyEventFromRemoteContent`, `defaultPreventedByContent` and the `"AppCommand"` listener to FORBIDDEN_PATTERNS, each with a catalogue row.
**Verifier evidence (not refuted, downgraded warning -> info):** The facts are correct: powerbrowser.js:413-430 and :443 use these members, FORBIDDEN_PATTERNS (check-internals-boundary.sh:40-80) contains none of them, and a rebase could break F6 with no static gate catching it.

It is not a rule-2 violation. INTERNAL-APIS.md:3-14 defines a touchpoint as a match of FORBIDDEN_PATTERNS, and the shell file already uses ChromeOnly ChromeWindow members directly as accepted practice (`window.minimize()`, `window.maximize()`, `windowState` at powerbrowser.js:469-474). The nodePrincipal and fixupAndLoadURIString precedent covered privileged XPCOM APIs, not DOM event members. Widening the list is a policy decision. Not checked: whether any live test exercises F6 after a rebase.

### IN-04: The F6 comment cites the wrong event, and the F6 keypress still reaches the page after the relay (CHROME-04)

**File:** `powerbrowser/shell/powerbrowser.js:403`
**Issue:** EventStateManager reaches its F6 document-navigation code only from eKeyPress (EventStateManager.cpp:4749-4751). The BrowserChild "reply with it prevented" path (BrowserChild.cpp:2600-2608) therefore applies to the keypress, not to the keydown this listener inspects. Nothing stops the F6 keypress from being forwarded to content. There ESM runs MoveFocus(FORWARDDOC), which can send a move-focus request back to the parent after relayShortcut has focused the pill.
**Failure scenario:** The user presses F6 in a page and Theia focuses the address pill. The page's own keypress F6 then makes the content process ask the parent to move document focus onward from the overlay, which can take focus away from the pill. The passing live test shows this race usually resolves in the pill's favour. It does not show the race is gone.
**Fix:** Correct the comment to cite keypress. Also add a capture keypress listener that calls `event.preventDefault()` on the first (non-reply) pass when the key is F6 and the target is an overlay. A chrome-side PreventDefault calls StopCrossProcessForwarding (BasicEvents.h:200-202).
**Verifier evidence:** info: not verified.

### IN-05: The focus tracker misses removal of the focused overlay, because Gecko fires no blur when a focused element is removed (CHROME-05)

**File:** `powerbrowser/shell/powerbrowser.js:400`
**Issue:** syncPageFocus runs only on focus and blur events. nsFocusManager::ContentRemoved clears the focused element without firing any events (nsFocusManager.cpp:1083-1085). When webTabClose removes the overlay that has focus (`browser.remove()` at PowerBrowserAPI.sys.mjs:3507), the page-key rows stay enabled and `lastPageFocusByFrame` keeps the removed tab id.
**Failure scenario:** The sidecar restarts or is swapped while a page has focus. The reserved rows (Ctrl+T, Ctrl+W, Ctrl+Tab) stay live and take those keys, and their handlers return 'no-page'. This lasts until a focus event resyncs the rows.
**Fix:** In webTabClose, if `browser.ownerDocument.activeElement === browser`, call `theiaBrowser.focus()` before `browser.remove()`.
**Verifier evidence:** info: not verified.

### IN-06: pushPageFocus records its dedupe entry before the send succeeds, and logs an error at startup (CHROME-06)

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4243`
**Issue:** `lastPageFocusByFrame.set` runs before sendWebTabPush, and sendWebTabPush only logs a failure. A failed push is therefore never retried, because later identical answers are deduped. Before the Theia swap, browserElement holds an about:blank WindowGlobal that the actor's matches pin refuses. As a result, the first focus event of every launch logs '[web-tab] pageFocus push failed' at error level.
**Failure scenario:** Every launch writes an error-level line to the diagnostics log before any web tab exists. If the push for a real answer fails once, `powerbrowser.webPageFocused` stays wrong until focus moves to another tab.
**Fix:** Make sendWebTabPush return a boolean and record `last` only on success. Skip the send while `windowGlobal?.documentURI` is not the Theia origin.
**Verifier evidence:** info: not verified.

### IN-07: webTabActivated and activeTabIdOf have no production consumer (CHROME-07)

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4162`
**Issue:** The frontend sends webTabActivated on every selection change, and chrome stores the value in `activeTabByFrame` (4207). The only reader, `activeTabIdOf` (4238), has no caller in production code. scripts/verify-nav-keys-live.mjs is its only caller.
**Failure scenario:** No user-visible failure today. A later path may assume this state is authoritative when no production code has ever used it. The 'activation' live scenario passes but proves no product behaviour.
**Fix:** Use it (for example as the AppCommand fallback target when nothing is hovered), or remove the kind, the WeakMap and the export until a consumer exists.
**Verifier evidence:** info: not verified.

### IN-08: The new section comment and the append-only rule disagree with this phase's own diff (CHROME-08)

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4085`
**Issue:** The section header says 'handleGroupMutation is not touched', and the new append-only rule in INTERNAL-APIS.md says new boundary code goes in the end-of-file section. This phase edited handleGroupMutation's webTabReload arm (2504). It also added five lines and a new `Ci.nsIWebNavigation` touchpoint in the middle of the file (3536-3541), which renumbered the later catalogue rows.
**Failure scenario:** The next contributor trusts the comment and the rule, and is surprised by mid-file edits and catalogue renumbering.
**Fix:** Correct the comment, or move the hard-reload branch into the end section (for example a `webTabHardReload(entry)` helper) and leave the existing webTabReload lines unchanged.
**Verifier evidence:** info: not verified.

### IN-09: scheduleWebTabState drops webTabPush's never-throw guarantee and can stop pushes for a window (CHROME-09)

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4216`
**Issue:** webTabPush's contract is that a throw is logged and dropped rather than allowed to unwind a progress notification. The new wrapper runs outside any try block. `frame.ownerDocument.defaultView` can be null during teardown, and `WeakMap.set(null)` throws. The pending map is also stored before requestAnimationFrame is called. If rAF throws or returns 0, the map stays in place and no callback is scheduled, so every later push for that window is queued and never sent.
**Failure scenario:** During shell-window teardown or a document swap, an overlay's STATE_STOP reaches scheduleWebTabState. Either the listener throws into the progress notification, or no further state pushes are sent for that window for the rest of the session.
**Fix:** Wrap the body in try/catch with webTabPush's log line. Call requestAnimationFrame first, and store the map only when it returns a non-zero handle.
**Verifier evidence:** info: not verified.

### IN-10: Widget<->shortcuts import cycle only works because of import order in the frontend module (THEIA-01)

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts:22`
**Issue:** chrome-bar-shortcuts.ts imports ChromeBarWidget and uses it in `@inject(ChromeBarWidget)` and the `design:type` metadata, both of which run at module evaluation. chrome-bar-widget.tsx:42 imports BUTTON_SHORTCUTS and tooltipFor back from it. Startup works only because chrome-bar-frontend-module.ts imports './chrome-bar-shortcuts' (line 26) before './chrome-bar-widget' (line 28).
**Failure scenario:** Someone sorts the imports, or a new module imports chrome-bar-widget earlier. `ChromeBarWidget` is then undefined when `@inject(...)` runs, Inversify throws at decoration time, and the chrome-bar module fails to load.
**Fix:** Move PAGE_SHORTCUTS, NavButton, ButtonShortcut, BUTTON_SHORTCUTS and tooltipFor into a leaf module (for example chrome-bar-shortcut-table.ts). Import it from both files, and point verify-shortcut-relay.mjs at it.
**Verifier evidence (not refuted, downgraded warning -> info):** The cycle is real and new in phase 27. The compiled lib/browser/chrome-bar-shortcuts.js:34 requires the widget, and :200-201 evaluate `inject(chrome_bar_widget_1.ChromeBarWidget)` at module load without LazyServiceIdentifier. Inversify 6.2.2 throws on an undefined identifier (inject_base.js:11-13). Only import order keeps it working (frontend-module 26 vs 28). No other file imports either module. Mitigating factors: theia/ has no eslint, prettier or sort-imports config, and the failure would be loud and immediate at startup, not silent. (Re-review: the WR-02 fix adds an import of chrome-bar-keybindings into the widget, which is a leaf module and does not extend the cycle.)

### IN-11: Page-focus context key has no consumer (THEIA-05)

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts:197`
**Issue:** `powerbrowser.webPageFocused` is set on every pageFocus push, but no when-clause, menu or command reads it. Only the live probe observes it. KEY-04 is enforced chrome-side by the `disabled` attribute on the page `<key>` rows. The key is also set to true for a pushed tabId this frontend does not know (line 197 runs before the widgetOf check).
**Failure scenario:** A future binding gated on `!powerbrowser.webPageFocused` trusts the key while it reports true for an unknown tab id.
**Fix:** Document it as an observable signal only, or derive it from the resolved widget: `this.pageFocused?.set(tab !== undefined)`.
**Verifier evidence:** info: not verified.

### IN-12: Reload/Stop tooltip goes stale on swap; aria-keyshortcuts are not macOS-aware (THEIA-06)

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:366`
**Issue:** The hover content is computed once, on pointerenter, so the tooltip keeps the old verb when the button swaps between Reload and Stop under a resting pointer. BUTTON_SHORTCUTS.aria hard-codes 'Control+R', 'Control+T' and 'Alt+...' (chrome-bar-shortcuts.ts:84-89), while tooltipFor uses macLabel on macOS.
**Failure scenario:** The tooltip says 'Reload (Ctrl+R)' over a Stop glyph. On macOS, VoiceOver announces Control+T for New Tab, which does nothing there.
**Fix:** Call `hover.cancelHover()` (or request the hover again) when `stopping` flips while the pointer is over the button. Derive aria from the row's modifiers, using `isOSX ? 'Meta' : 'Control'` for accel.
**Verifier evidence:** info: not verified.

### IN-13: Dropped plain text is accepted by prefix only, so multi-line text yields a malformed URL (THEIA-07)

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:72`
**Issue:** droppedUrlOf takes the first line of uri-list and x-moz-url but the whole text/plain payload, and tests only `^https?://`. The scheme stays http(s), so this is not a security issue.
**Failure scenario:** Dragging a two-line selection that starts with a URL onto New Tab opens 'https://example.comsee above'.
**Fix:**
```ts
const value = (... || data.getData('text/plain').split(/\r?\n/)[0]).trim();
return /^https?:\/\/\S+$/i.test(value) ? value : undefined;
```
**Verifier evidence:** info: not verified.

### IN-14: goHome ignores the empty-page reply, blames the setting for a timeout, and the Home onClick promise is unhandled (THEIA-08)

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:656`
**Issue:**
- In the empty-home path, the reply of `tab.navigate(EMPTY_PAGE_URL)` is discarded.
- In the non-empty path, any `!reply.ok`, including the 5 s timeout, shows the 'change it in Settings' copy.
- At line 1130, `onClick={() => this.goHome(currentWebTab())}` drops the promise.

**Failure scenario:** When chrome is slow to reply, Home on a valid https:// home page tells the user to change the setting. A failing New Tab command from Home logs an unhandled rejection.
**Fix:** Show the Home-failure row only when `typedAddressTargetOf` rejects the value or the reply is `refused-scheme`, and route other failures to the commit-failure row. Wrap the onClick: `onClick={() => void this.goHome(currentWebTab()).catch(e => console.error('[@powerbrowser/chrome-bar] Home failed:', e instanceof Error ? e.name : typeof e))}`.
**Verifier evidence:** info: not verified.

### IN-15: The call-site scope misses actor parents that live outside browser/actors and toolkit/actors (GATES-04)

**File:** `scripts/verify-shell-gbrowser-standin.mjs:87`
**Issue:** deriveCallSiteFiles scans only `*Parent.sys.mjs` directly under upstream/browser/actors and upstream/toolkit/actors. Firefox also registers JSWindowActor parents from component directories, for example CanonicalURLParent (browser/components/tabnotes) and TranslationsParent. The header's claim that a parent added by a rebase is in scope without an edit holds only for the two scanned directories.
**Failure scenario:** A rebase adds a `gBrowser.someNewMember(browser)` call to a parent outside those directories. The gate stays green, and the call throws a TypeError in the parent at runtime.
**Fix:** Derive the file list from the registries (DesktopActorRegistry.sys.mjs, ActorManagerParent.sys.mjs). Map each `esModuleURI` to a source path, and fail as broken instrument when a URI resolves to no file.
**Verifier evidence (not refuted, downgraded warning -> info):** The gap is real. The scan is limited to two directories (87-118). Missed parents that reach gBrowser:
- CanonicalURLParent.sys.mjs:41
- ProfilesParent
- AboutLoginsParent:713
- TranslationsParent:633/939/1269
- AIChatContentParent and AboutMessagePreviewParent

The scenario is overstated. CanonicalURL is gated on `browser.tabs.notes.enabled`, which is false by default (firefox.js:1110). The stand-in already implements getTabForBrowser (powerbrowser.js:89). Most of the other missed parents serve about: pages that overlays do not normally load.

### IN-16: The BiDi key fallback cannot send most of the keys the scenarios press, and can deliver a key twice (GATES-05)

**File:** `scripts/lib/pb-live-probe.mjs:193`
**Issue:** BIDI_KEYS (line 200) maps only Escape, the modifiers, F5 and F6. ArrowLeft, ArrowRight, Home, Tab, PageDown, PageUp and F11 would be sent as multi-character strings, which WebDriver rejects. The TIP block returns 'tip: <error>' for a throw at any point, so a key whose keydown was already delivered is sent again by the fallback.
**Failure scenario:** On a build that refuses beginInputTransactionForTests, the page-keys, tab-keys and theia-keeps-keys scenarios raise harness errors at the first unmapped key. A partial TIP failure doubles a key: Ctrl+T opens two tabs, or F5 adds two GETs.
**Fix:** Complete the table with the WebDriver code points (ArrowLeft U+E012, ArrowRight U+E014, Home U+E011, Tab U+E004, PageUp U+E00E, PageDown U+E00F, F11 U+E03B), and throw on any unmapped multi-character key. Return 'tip: partial' once any keydown has been dispatched, and make pressKey throw on it instead of falling back.
**Verifier evidence (not refuted, downgraded warning -> info):** Confirmed. BIDI_KEYS holds only the seven mapped keys (bytes checked with od), and the mapping line uses `BIDI_KEYS[k] ?? k`. The TIP block has a single try, and the fallback runs on anything that is not 'ok'. keyRoute is printed but never checked. This is test-harness code on a fallback route that normal runs do not take, and both failure modes produce a false red, never a false green. (Re-review: line numbers moved by +26 when installFireRecorder was added; content unchanged.)

### IN-17: pageKeyDisabled's null sentinel for a missing row cannot be observed (GATES-06)

**File:** `scripts/lib/pb-live-probe.mjs:146`
**Issue:** A BiDi null RemoteValue has no `value`, so evaluateIn returns undefined instead of null. The `disabled === null` branches at verify-nav-keys-live.mjs:227 and 285 never run.
**Failure scenario:** A rename drops `powerbrowser-page-key-stop`. esc-stop then reports a product defect instead of `broken instrument:`, and the self-test's BROKEN filter classifies the failure wrongly. (Re-review: theia-keeps-esc now presses Esc before this read, so with the row missing it now reaches this branch and reports the attribute failure, which is still not the BROKEN class.)
**Fix:** Return a JSON string (`JSON.stringify(k ? k.hasAttribute('disabled') : null)`) and parse it, or return the string 'missing' and test for that.
**Verifier evidence:** info: not verified.

### IN-18: The KEY-04 ban on Ctrl+P and Ctrl+K only checks the 'accel' modifier (GATES-07)

**File:** `scripts/verify-shortcut-relay.mjs:478`
**Issue:** Rule (6) fires only when `mods(row).has('accel')`. On Linux, `modifiers: "control"` is the same Ctrl key.
**Failure scenario:** A row `{ id: "print", key: "P", modifiers: "control" }` passes the gate while binding Ctrl+P.
**Fix:** Use `(mods(row).has('accel') || mods(row).has('control'))`, and add a plant that uses 'control'.
**Verifier evidence:** info: not verified.

### IN-19: A --scenario subset without the positive control exits 0 (GATES-08)

**File:** `scripts/verify-nav-keys-live.mjs:2022`
**Issue:** selectedScenarios does not add a selected scenario's CONTROL_OF prerequisite, and report() does not count NOT SCORED rows as failures. Only direct runs are affected, because the registry row runs every scenario.
**Failure scenario:** `node scripts/verify-nav-keys-live.mjs --scenario page-prevented` exits 0 when nothing was scored.
**Fix:** In selectedScenarios, add each selected scenario's CONTROL_OF entry. Alternatively, make report() return 1 when a NOT SCORED row's control was not requested.
**Verifier evidence:** info: not verified.

### IN-20: The --quick chrome-bar-typecheck emits tab-uris build output (GATES-09)

**File:** `scripts/verify-platform.sh:337`
**Issue:** `tsc -b theia/extensions/tab-uris` writes lib/*.js, .d.ts, source maps and tsconfig.tsbuildinfo inside a gate described as "no build". Two simultaneous `--quick` runs, which concurrent sessions make possible, write the same files with no lock.
**Failure scenario:** Two sessions run `--quick` at the same moment. One tsc reads a half-written .d.ts or tsbuildinfo, and chrome-bar-typecheck fails with no source change.
**Fix:** Emit the declarations to a private temp directory and type-check chrome-bar with a `paths` override, or take a flock around the `-b` step.
**Verifier evidence:** info: not verified.

### IN-21: Registry comments are out of date (GATES-10)

**File:** `scripts/verify-platform.sh:3743`
**Issue:** The shortcut-relay row comment says the self-test "plants ten faults", but PLANTS now holds 15 (the WR-06 fix added `newTab unreserved`). The nav-keys-live row comment (4975) says the scenario list grows in later Phase 27 plans, but Phase 27 is complete.
**Failure scenario:** A reviewer counts the plants against the comment and concludes that five of them are unregistered.
**Fix:** Remove the count and delete the "grows in later plans" sentence.
**Verifier evidence:** Re-checked in this pass: both comments are still present at 3743 and 4975.

### IN-22: Most live scenarios have no planted fault (GATES-11)

**File:** `scripts/verify-nav-keys-live.mjs:2037`
**Issue:** PLANTS now covers 10 of the 31 scenarios. The fix pass added stop-guard (`guard-disabled`), close-split, focus-keys-debug and a second theia-keeps-keys plant. hard-reload-click, page-prevented, focus-keys-prevented, drop's javascript: refusal, history-error, pill-esc and page-focus-reload have still never been shown red. pill-esc's firing-absence check, new in the WR-05 fix, has no plant of its own. It relies on esc-stop's positive control for the recorder.
**Failure scenario:** Another unplanted scenario has an assertion that cannot fail, and the self-test still reports PASS. WR-07 is one such case inside a planted scenario.
**Fix:** Add one plant for each absence-style or timing scenario: at minimum page-prevented, focus-keys-prevented and pill-esc.
**Verifier evidence:** Re-counted in this pass from the SCENARIOS and PLANTS tables. (Iteration 3: `reply-listener-ungated` adds an 11th plant. It targets theia-keeps-keys, which already had one, so the count of covered scenarios does not change.)

### IN-23: DELIBERATELY_ABSENT keeps a known TypeError path green (GATES-12)

**File:** `scripts/verify-shell-gbrowser-standin.mjs:150`
**Issue:** The refreshBlocked entry is labelled a KNOWN GAP: with `accessibility.blockautorefresh` on, RefreshBlockerParent calls `gBrowser.refreshBlocked` and throws. The gate treats a deferral to Phase 37 the same as a member that must stay absent.
**Failure scenario:** A user turns on the pref. Auto-refreshing pages stall with no notification shown, and each attempt logs a TypeError in the parent.
**Fix:** Add a no-op `refreshBlocked() {}` to the stand-in, or move known gaps to a separate KNOWN_GAPS map that prints a warning line on every PASS.
**Verifier evidence:** info: not verified.

### IN-24: Push-kind derivation silently skips push sites without a literal leading `kind` (GATES-13)

**File:** `scripts/verify-web-tab-bridge.mjs:326`
**Issue:** pushedKinds matches only push calls whose object literal starts with `kind: "literal"`. A push that builds its payload in a variable, or puts `kind` after another property, adds no kind and produces no failure.
**Failure scenario:** `const payload = { kind: "permission", tabId }; sendWebTabPush(theiaBrowser, payload);` with no frontend subscriber, and push-kinds stays green.
**Fix:** Count every `sendWebTabPush(` call and every `"PowerBrowserWebTabState"` send (except the wrapper's own), and fail naming each call whose kind could not be extracted.
**Verifier evidence:** info: not verified.

## Appendix: Refuted findings

None in any pass. The first pass downgraded six findings to info on verifier evidence (IN-01, IN-02, IN-03, IN-10, IN-15, IN-16).

---

_Reviewed: 2026-10-21T06:28:19Z (iteration 3, final re-review after fix iteration 2; pass 2 2026-10-21T06:10:30Z; first review 2026-10-21)_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
