---
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
reviewed: 2026-10-21T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - powerbrowser/shell/powerbrowser.js
  - powerbrowser/INTERNAL-APIS.md
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar.css
  - theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx
  - theia/extensions/tab-uris/src/browser/web-tab.ts
  - theia/extensions/tab-uris/src/browser/profile-storage.ts
  - theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts
  - scripts/verify-platform.sh
  - scripts/verify-shortcut-relay.mjs
  - scripts/verify-nav-keys-live.mjs
  - scripts/lib/pb-live-probe.mjs
  - scripts/verify-web-tab-bridge.mjs
  - scripts/verify-shell-gbrowser-standin.mjs
  - scripts/verify-shell-error-contract.mjs
  - scripts/verify-shell-error-copy.mjs
  - scripts/check-internals-boundary.sh
findings:
  critical: 0
  warning: 6
  info: 24
  total: 30
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-10-21
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Three area reviewers ran over the phase 27 diff (base `24a7ba0`):

- **CHROME:** the Gecko shell side (`PowerBrowserAPI.sys.mjs`, `powerbrowser.js`, `INTERNAL-APIS.md`)
- **THEIA:** the `@powerbrowser/chrome-bar` and `@powerbrowser/tab-uris` extensions
- **GATES:** the verification scripts and the `verify-platform.sh` registry

Each critical or warning finding was adversarially verified: a separate verifier tried to refute it against the source. No finding was refuted. The verifiers lowered six findings from warning to info (CHROME-01, CHROME-02, CHROME-03, THEIA-01, GATES-04, GATES-05). The verifier evidence is quoted under each finding. Findings that were raised as info were not adversarially verified, and their evidence line says so.

No critical issues were found. Three of the six warnings are product defects:

- THEIA-02: one keyboard Back or Forward is lost after a hold that is released off the button.
- THEIA-03: F6 from the address pill is taken by the debugger's pause binding during a debug session.
- THEIA-04: Ctrl+W on the only tab of a split pane leaves no current tab.

The other three warnings are checks that cannot go red, which breaks the project's verification rules:

- GATES-01: stop-guard passes whether or not the Reload guard exists.
- GATES-02: the "no shortcut push under Theia focus" assertions pass by construction.
- GATES-03: the reservation rule is checked in one direction only.

Finding IDs below use the GSD numbering. The area reviewer's original ID is shown in each title.

## Warnings

### WR-01: suppressNavClick stays set after a hold released off the button, swallowing the next keyboard Back/Forward (THEIA-02)

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:329`
**Issue:** The hold timer sets `suppressNavClick = true` (line 331). Only two things clear it: the next onNavClick (lines 301-303) and the next primary pointerdown (line 327). If the hold ends with the pointer released over the history menu or anywhere else off the button (press, drag onto a menu entry, release), no click event reaches the button and the flag stays true. Keyboard activation (Enter or Space on a focused button) fires click without a pointerdown. Back and Forward share the one flag.
**Failure scenario:** The user holds Back, drags onto a history entry and releases there. Lumino's Menu runs the entry on mouseup. Later the user tabs to Forward (or Back) and presses Enter. onNavClick sees `suppressNavClick === true`, clears it and returns, so that one navigation is lost without any feedback.
**Fix:** Make the suppression one-shot and limit it to the release that ends the hold. Either clear it in the menu's onHide, or arm it with the hold's pointerId or timestamp and ignore it for any click that is not the pointerup that ends that hold. For example, in the hold callback:
```ts
const clear = () => { setTimeout(() => { this.suppressNavClick = false; }); window.removeEventListener('pointerup', clear, true); };
window.addEventListener('pointerup', clear, true);
```
**Verifier evidence (not refuted, kept at warning):** The code path is real. The field `suppressNavClick` is declared at line 208. The hold timer sets it to true at line 331 and then calls `openHistoryMenu(button)`. Only two places clear it. `onNavClick` clears it at lines 301-303 and returns early, which swallows that click. A primary pointerdown clears it in `onNavPointerDown` at line 327. Neither the menu's `onHide` (lines 484-488) nor `clearHold` clears it. `clearHold` (lines 351-355, wired at 1065-1067 and 1081-1083 to pointerup, pointerleave and pointercancel) only cancels the timer. Back and Forward share the field: both buttons use `onNavPointerDown` (lines 1064 and 1080) and the same `onNavClick` guard. The scenario is reachable. The menu opens at the button's bottom-left (line 478) as a separate node, so the browser sends the `click` to the common ancestor of the pointerdown and pointerup targets, not to the button. A later Enter or Space fires `click` with no pointerdown, so line 301 consumes it. No keydown path resets the flag. Any later mouse press on a nav button resets it (line 327), so only the first keyboard activation after such a hold is affected. Not tested live.

### WR-02: Pill F6 -> page is pre-empted by Theia's capture-phase F6 binding while debugging (THEIA-03)

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:732`
**Issue:** Theia's KeybindingRegistry listens for keydown on the document in the capture phase (core `keybinding.js:528`), so it runs before React's root-delegated onKeyDown on the pill input. @theia/debug 1.76 binds F6 to `DebugCommands.PAUSE` with `when: 'inDebugMode'`. When that binding matches, Theia calls preventDefault and stopPropagation, and onInputKeyDown never sees F6. The UI-SPEC decision that the pill is chrome and F6 works in both directions fails during a debug session.
**Failure scenario:** In Coding mode with a debug session running, the user presses Alt+D in a page and then F6 in the pill to return to the page. The debugger pauses instead, and focus stays in the pill.
**Fix:** Register F6 and Shift+F6 as a Theia keybinding scoped to the pill, so its context outranks the debug binding. Add a context key such as `powerbrowser.addressFocused`, set and cleared on the input's focus and blur, then call `registerKeybinding({ command: <focus-page command>, keybinding: 'f6', when: 'powerbrowser.addressFocused' })` (and the same for shift+f6). An alternative is a capture listener on the input node that handles F6 and stops propagation before Theia sees it.
**Verifier evidence (not refuted, kept at warning):** Every step holds:
1. The app ships @theia/debug 1.76.0 (`theia/applications/browser/package.json:63`).
2. `debug-frontend-application-contribution.js:715-719` binds `f6` to `DebugCommands.PAUSE` with when `inDebugMode`. PAUSE is registered at :236 with no `isEnabled`, so `isEnabledInScope` passes whenever a debug session is active.
3. Theia's capture listener runs `run()`, then `matchKeybinding`, then `executeKeyBinding` (`keybinding.js:436-452`), which calls preventDefault and stopPropagation. The event never reaches React's root listener, so `onInputKeyDown` (chrome-bar-widget.tsx:731-740) does not run.
4. Nothing else handles this case. The chrome-side F6 rows (chrome-bar-shortcuts.ts:62-63) fire only while a web page has focus. `ChromeBarKeybindingContribution` registers only `ctrlcmd+l`.

Correction to the finding: Theia 1.76 has no shift+f6 binding, so Shift+F6 still returns from the pill to the page. Only plain F6 fails, and only during a debug session. Warning is at the low end. Not run live.

### WR-03: Ctrl+W on the only tab of a split pane leaves no current tab and no focus target (THEIA-04)

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts:158`
**Issue:** closeTab reads `mainPanel.currentTitle` after closeWidget. The page-focused tab was made current only through `markAsCurrent` (line 196), not through Theia activation. If it is the only tab in its pane, the pane's tab bar empties and emits currentChanged(null), and TheiaDockPanel calls `markAsCurrent(undefined)`. Nothing marks a tab in the other pane as current, because Theia moves activation on close only for the active widget. `next` is undefined, so switchTo is never called.
**Failure scenario:** The window is split. Pane A has a1 and pane B has only b1. The user clicks into b1's page and presses Ctrl+W. b1 closes and currentTitle becomes undefined. The pill goes blank, Back, Forward and Reload are disabled, and keyboard focus is left on the bare Theia frame while a1 is still on screen.
**Fix:** Capture a fallback before closing and use it when the dock has no current title:
```ts
const order = this.strip.switchOrder(tab);
const at = order.indexOf(tab);
const fallback = order[at + 1] ?? order[at - 1];
await this.shell.closeWidget(tab.id);
const next = this.shell.mainPanel.currentTitle?.owner
  ?? (fallback && !fallback.isDisposed ? fallback : this.shell.mainAreaTabBars[0]?.currentTitle?.owner);
```
**Verifier evidence (not refuted, kept at warning):** The code path is real:
1. chrome-bar-shortcuts.ts:195-196 makes the tab current only through `markAsCurrent(tab.title)`.
2. `theia-dock-panel.js:147-155` connects `title.owner.disposed` to `markAsCurrent(undefined)`. The `_onCurrentChanged` override (57-59) gets null when b1's tab bar empties, with the same result.
3. `application-shell.js:1039-1091` (`onActiveChanged`) wraps `onCloseRequest` with the move-to-a-neighbouring-tab fallback only for the tracker's active widget. b1 was never activated, so it has no wrapper.
4. `closeWidget` (1546-1562) does not mark any tab as current.
5. `group-model.ts:233-251` acts only on groups in their undo window. `web-tab.ts:702-708` sends `webTabActivated` null, so the bar goes blank.
6. Line 160 sets `next` to undefined, and line 161 skips `switchTo`.
7. Split panes are reachable: drag-to-split in the main area is not disabled.
8. The file is new in phase 27.

Not run live.

### WR-04: stop-guard passes whether or not the 650 ms Reload guard exists (GATES-01)

**File:** `scripts/verify-nav-keys-live.mjs:764`
**Issue:** The scenario's listener runs synchronously inside the WEB_TAB_STATE_EVENT dispatch that ends the load, then calls `reload()?.click()`, where `reload()` finds the button whose aria-label is 'Reload'. WebTabChannel's own listener, registered earlier at postConstruct, applies the state. The bar's onDidChangeState then arms the guard and calls `this.update()` (chrome-bar-widget.tsx:841-847). Lumino's update request and React's render are both asynchronous, so at that moment the single nav button still has aria-label 'Stop'. `reload()` returns undefined, and the optional chaining makes the early click a no-op that nothing reports. Only the 700 ms click happens. It falls outside the guard window, so it produces exactly one extra GET at or after `guard.late`, which is the pass condition. The scenario has no self-test plant, and no plan summary records a red run.
**Failure scenario:** Delete the line `if (performance.now() < this.reloadGuardUntil) return;` in onReloadClick, or set RELOAD_GUARD_MS to 0. The early click still never lands, the server still sees exactly one extra GET of /guard after the late click, and the run prints `stop-guard: PASS`.
**Fix:** Make the early click record what it hit, and require that it hit Reload. For example, in the listener, poll in requestAnimationFrame (up to about 200 ms) until the button reads 'Reload', click it, and store `{ earlyHit: true, earlyAt: performance.now() }`. If earlyHit is false, fail with BROKEN. Also add a PLANTS row such as `{ plant: 'guard-disabled', target: 'stop-guard' }` that zeroes `get('ChromeBarWidget').reloadGuardUntil` on every state push, and require it to go red with 'must be ignored'.
**Verifier evidence (not refuted, kept at warning):** Each step holds:
1. The listener at 759-765 is synchronous. `reload()` is `navButtonExpr('Reload')` (515). WebTabWidget's listener (web-tab.ts:240) runs first.
2. The bar's subscription (chrome-bar-widget.tsx:841-847) arms `reloadGuardUntil` and calls `this.update()`. That only posts a MessageLoop request, so while the dispatch runs the button still renders `aria-label={stopping ? 'Stop' : 'Reload'}` (1091) as 'Stop'. `/guard` has `delayMs: 400` (168), so the button has already rendered as 'Stop'.
3. The pass check (781-787) requires exactly one extra GET at or after `guard.late`. The 700 ms click comes after the 650 ms window (RELOAD_GUARD_MS, 60), so removing the guard check at chrome-bar-widget.tsx:284-286 still gives PASS.
4. PLANTS (1865-1872) has no stop-guard row. hardReloadClick sleeps 800 ms to stay clear of the guard (733), so it does not test the guard either.

The product code is correct. The defect is a check that cannot go red.

### WR-05: The "no shortcut push with the Theia frame focused" assertions can never go red (GATES-02)

**File:** `scripts/verify-nav-keys-live.mjs:264`
**Issue:** theia-keeps-esc (264-270) and theia-keeps-keys (1483, 1520, 1546) both require that no `kind: 'shortcut'` push arrives while the Theia frame, an editor or a terminal has focus. The only emitter is `PowerBrowserWebTabs.relayShortcut` (PowerBrowserAPI.sys.mjs:4259-4272). It returns 'no-page' without pushing when `tabIdOfBrowser(overlay)` is null. Every `<key>` command passes `document.activeElement`, and in exactly these states that is the Theia `<browser>`. So the push cannot be emitted even if a page-key row fires by mistake. The positive control (esc-stop / page-keys) proves that pushes appear when a page has focus, not that this assertion can detect a leak. The only plant on this half, row-enabled-under-theia, removes the disabled attribute and then reads the same attribute back (246-263). It therefore fails at line 262 before Esc is pressed, so the Esc-press half has never been shown red. In theia-keeps-keys, the other assertion, `recorded`, is true for every non-reserved key whatever chrome does, because content always gets the first pass.
**Failure scenario:** syncPageFocus stops disabling rows when focus moves to the Theia frame. Esc, F5, Ctrl+R and the other rows then fire their chrome `<key>` commands under Theia focus and preventDefault the key. theia-keeps-keys still passes for every non-reserved key, and the push-absence half of theia-keeps-esc passes by construction. Only the attribute read catches the Esc row.
**Fix:** Assert what a leaking row actually does instead of the push. Record each page-key row's `command` events in chrome, for example `document.getElementById('powerbrowser-page-key-stop').addEventListener('command', () => window.__pbFired.push('stop'))`, and require zero firings under Theia focus. Add a plant that removes `disabled` but skips the attribute check, so the firing half goes red and names the row. Alternatively, state in the scenario doc that relayShortcut's no-page refusal is the guarantee, and drop the absence assertion.
**Verifier evidence (not refuted, kept at warning):** Every page-key `<key>` command calls `PowerBrowserWebTabs.relayShortcut(browserElement, document.activeElement, row.id, row.landsInTheia)` (powerbrowser.js:381-383). relayShortcut is the only emitter of the push (4259-4272). It returns 'no-page' before sendWebTabPush when tabIdOfBrowser is null. tabIdOfBrowser (4188-4198) matches only webTabs entries, and the Theia `<browser>` is never one of them. The F6 reply listener checks the same thing (powerbrowser.js:415).

So the absence checks at 264-269 and in theia-keeps-keys always pass, which is the pattern CLAUDE.md Verification rule 1 forbids. The plant fails at 259-261 before Esc is pressed. `recorded` comes from a capture keydown listener in the Theia document, so it is true for every non-reserved key.

Mitigating point: a leaking row does almost nothing a user could see. The defect is the check that cannot go red, not a hidden product bug. It stays at warning because it breaks an explicit project rule.

### WR-06: The reservation rule is checked in one direction only: unreserving a Firefox-reserved key stays green (GATES-03)

**File:** `scripts/verify-shortcut-relay.mjs:441`
**Issue:** Rule (4) checks only rows with `row.reserved === true`: each must name a reserved Firefox key or appear in RESERVED_EXCEPTIONS. Nothing checks the other direction, so a row whose `firefox` key is reserved="true" upstream but which is itself `reserved: false` passes. 27-CONTEXT rules that Firefox's unblockable keys are reserved, so the table's reserved set should equal the Firefox-reserved mirrored rows plus the exceptions. CLAUDE.md requires set equality that goes red on both an addition and a removal. The reviewer ran check() on the tree with newTab flipped to `reserved: false`, and it returned zero failures.
**Failure scenario:** A refactor sets `reserved: false` on newTab (key_newNavigatorTab) or closeTab (key_close). The `--quick` gate stays green, and a page that calls preventDefault on keydown can now swallow Ctrl+T or Ctrl+W. Only the non-quick page-prevented live scenario would notice.
**Fix:** In the `if (row.firefox)` branch, add:
```js
if (fx && fx.reserved && row.reserved !== true)
  failures.push(`${row.id}: Firefox's ${row.firefox} is reserved="true" but the row is not reserved`);
```
Add a self-test plant that flips newTab to `reserved: false` and expects that message.
**Verifier evidence (not refuted, kept at warning):** The failure reproduces. The checks that exist do not cover it:
- Rule (4) (441-446) runs only inside `if (row.reserved === true)`.
- Rule (5) (448-455) never compares `fx.reserved`, although upstreamKeys parses it (389).
- The stale-exception loop (457-461) covers only the RESERVED_EXCEPTIONS ids.
- Rule (8) (479-488) only forces replyListener rows to be unreserved.

Upstream marks key_newNavigatorTab (browser-sets.inc.xhtml:137) and key_close (:186) as reserved="true". The chrome table has both at `reserved: true` (powerbrowser.js:337-338). check() returned [] on the base tree, and [] again with newTab flipped. The only other coverage is the live scenario (verify-nav-keys-live.mjs:177), which is not in `--quick` (verify-platform.sh:4978), and none of the plants (590-607) flips a reserved row. The proposed reverse check passes on the current tree. Kept at warning because the live gate would still catch the regression.

## Info

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
**Issue:** chrome-bar-shortcuts.ts imports ChromeBarWidget and uses it in `@inject(ChromeBarWidget)` and the `design:type` metadata, both of which run at module evaluation. chrome-bar-widget.tsx:40 imports BUTTON_SHORTCUTS and tooltipFor back from it. Startup works only because chrome-bar-frontend-module.ts imports './chrome-bar-shortcuts' (line 26) before './chrome-bar-widget' (line 28).
**Failure scenario:** Someone sorts the imports, or a new module imports chrome-bar-widget earlier. `ChromeBarWidget` is then undefined when `@inject(...)` runs, Inversify throws at decoration time, and the chrome-bar module fails to load.
**Fix:** Move PAGE_SHORTCUTS, NavButton, ButtonShortcut, BUTTON_SHORTCUTS and tooltipFor into a leaf module (for example chrome-bar-shortcut-table.ts). Import it from both files, and point verify-shortcut-relay.mjs at it.
**Verifier evidence (not refuted, downgraded warning -> info):** The cycle is real and new in phase 27. The compiled lib/browser/chrome-bar-shortcuts.js:34 requires the widget, and :200-201 evaluate `inject(chrome_bar_widget_1.ChromeBarWidget)` at module load without LazyServiceIdentifier. Inversify 6.2.2 throws on an undefined identifier (inject_base.js:11-13). Only import order keeps it working (frontend-module 26 vs 28). No other file imports either module. Mitigating factors: theia/ has no eslint, prettier or sort-imports config, and the failure would be loud and immediate at startup, not silent.

### IN-11: Page-focus context key has no consumer (THEIA-05)

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts:187`
**Issue:** `powerbrowser.webPageFocused` is set on every pageFocus push, but no when-clause, menu or command reads it. Only the live probe observes it. KEY-04 is enforced chrome-side by the `disabled` attribute on the page `<key>` rows. The key is also set to true for a pushed tabId this frontend does not know (line 190 runs before the widgetOf check).
**Failure scenario:** A future binding gated on `!powerbrowser.webPageFocused` trusts the key while it reports true for an unknown tab id.
**Fix:** Document it as an observable signal only, or derive it from the resolved widget: `this.pageFocused?.set(tab !== undefined)`.
**Verifier evidence:** info: not verified.

### IN-12: Reload/Stop tooltip goes stale on swap; aria-keyshortcuts are not macOS-aware (THEIA-06)

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:342`
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

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:635`
**Issue:**
- In the empty-home path, the reply of `tab.navigate(EMPTY_PAGE_URL)` is discarded (636).
- In the non-empty path, any `!reply.ok`, including the 5 s timeout, shows the 'change it in Settings' copy (650-657).
- At line 1106, `onClick={() => this.goHome(currentWebTab())}` drops the promise.

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

**File:** `scripts/lib/pb-live-probe.mjs:167`
**Issue:** BIDI_KEYS maps only Escape, the modifiers, F5 and F6. ArrowLeft, ArrowRight, Home, Tab, PageDown, PageUp and F11 would be sent as multi-character strings, which WebDriver rejects. The TIP block returns 'tip: <error>' for a throw at any point, so a key whose keydown was already delivered is sent again by the fallback.
**Failure scenario:** On a build that refuses beginInputTransactionForTests, the page-keys, tab-keys and theia-keeps-keys scenarios raise harness errors at the first unmapped key. A partial TIP failure doubles a key: Ctrl+T opens two tabs, or F5 adds two GETs.
**Fix:** Complete the table with the WebDriver code points (ArrowLeft U+E012, ArrowRight U+E014, Home U+E011, Tab U+E004, PageUp U+E00E, PageDown U+E00F, F11 U+E03B), and throw on any unmapped multi-character key. Return 'tip: partial' once any keydown has been dispatched, and make pressKey throw on it instead of falling back.
**Verifier evidence (not refuted, downgraded warning -> info):** Confirmed. BIDI_KEYS (174) holds only the seven mapped keys (bytes checked with od), and line 167 uses `BIDI_KEYS[k] ?? k`. The TIP block (144-160) has a single try, and line 162 falls back on anything that is not 'ok'. keyRoute is printed but never checked. This is test-harness code on a fallback route that normal runs do not take, and both failure modes produce a false red, never a false green.

### IN-17: pageKeyDisabled's null sentinel for a missing row cannot be observed (GATES-06)

**File:** `scripts/lib/pb-live-probe.mjs:121`
**Issue:** A BiDi null RemoteValue has no `value`, so evaluateIn returns undefined instead of null. The `disabled === null` branches at verify-nav-keys-live.mjs:214 and 258 never run.
**Failure scenario:** A rename drops `powerbrowser-page-key-stop`. esc-stop then reports a product defect instead of `broken instrument:`, and the self-test's BROKEN filter classifies the failure wrongly.
**Fix:** Return a JSON string (`JSON.stringify(k ? k.hasAttribute('disabled') : null)`) and parse it, or return the string 'missing' and test for that.
**Verifier evidence:** info: not verified.

### IN-18: The KEY-04 ban on Ctrl+P and Ctrl+K only checks the 'accel' modifier (GATES-07)

**File:** `scripts/verify-shortcut-relay.mjs:474`
**Issue:** Rule (6) fires only when `mods(row).has('accel')`. On Linux, `modifiers: "control"` is the same Ctrl key.
**Failure scenario:** A row `{ id: "print", key: "P", modifiers: "control" }` passes the gate while binding Ctrl+P.
**Fix:** Use `(mods(row).has('accel') || mods(row).has('control'))`, and add a plant that uses 'control'.
**Verifier evidence:** info: not verified.

### IN-19: A --scenario subset without the positive control exits 0 (GATES-08)

**File:** `scripts/verify-nav-keys-live.mjs:1836`
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
**Issue:** The shortcut-relay row comment says the self-test "plants ten faults", but PLANTS holds 14. The nav-keys-live row comment (4975) says the scenario list grows in later Phase 27 plans, but Phase 27 is complete.
**Failure scenario:** A reviewer counts the plants against the comment and concludes that four of them are unregistered.
**Fix:** Remove the count and delete the "grows in later plans" sentence.
**Verifier evidence:** info: not verified.

### IN-22: Most live scenarios have no planted fault (GATES-11)

**File:** `scripts/verify-nav-keys-live.mjs:1865`
**Issue:** PLANTS covers 6 of the 29 scenarios. stop-guard, hard-reload-click, page-prevented, focus-keys-prevented, drop's javascript: refusal, history-error, pill-esc and page-focus-reload have never been shown red. WR-04 shows that one of these unplanted scenarios cannot go red.
**Failure scenario:** Another unplanted scenario has an assertion that cannot fail, and the self-test still reports PASS.
**Fix:** Add one plant for each absence-style or timing scenario: at minimum stop-guard, page-prevented, focus-keys-prevented and pill-esc.
**Verifier evidence:** info: not verified.

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

None. The verifiers did not refute any warning-level finding from the three area reviewers. Six were downgraded to info on verifier evidence (IN-01, IN-02, IN-03, IN-10, IN-15, IN-16), and the reasons are recorded under each finding above.

---

_Reviewed: 2026-10-21_
_Reviewers: three area reviewers (CHROME, THEIA, GATES), with adversarial verification of every critical and warning finding_
_Depth: standard_
