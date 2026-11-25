# Fix brief: G3b-pane-hosting

Lane: product. Items: 15. Files this group owns: `^theia/extensions/orca-panes/` (pattern), `^theia/extensions/modes/` (pattern).

Item IDs: 67-CR-01; theia-pane-hosting-02; theia-pane-hosting-01 = 64-CR-02; pairing-credentials-01; 67-WR-01; 67-WR-02; 67-WR-04; 65-WR-04; 67-WR-03; 64-WR-01; theia-pane-hosting-04; theia-pane-hosting-03; pairing-credentials-04; sidecar-gate-backends-01; theia-pane-hosting-05.

## 67-CR-01: Automatic re-pair never runs after Restart Orca, and the page hides while orcad is still starting

- **Severity:** medium (reviewer label: critical)
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts`

*Section CR-01 of `.planning/workstreams/orca/phases/67-hosting-hardening/67-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts:167-169, 279-297, 262-270`
**Issue:** `take()` re-pairs only when the previous sample's chrome class is in `REPAIR_AFTER` and the current sample is `ready` with no class (line 288). The Restart Orca button (shown only for `could-not-start` and `port-in-use`) calls `OrcaService.restart()`. That sets `_state = "starting"` and `_restarting = false` (OrcaService.sys.mjs:160-162), and `OrcaEnv.failureClassOf` returns `null` for that state (OrcaEnv.sys.mjs:504-519). `restart()` at line 168 polls straight away, so `chrome.failureClass` becomes `null` while orcad is still starting. Then:
1. `failureClass` is null, so both widgets unmount the page and show Orca's own hidden pane root while orcad is down. P67-07 says the page hides only "when the state is `ready` and the client has reconnected".
2. `hide()` empties `pages`, so `schedule()` stops the one-second poll once boot has settled.
3. When orcad later reaches `ready`, the previous sample is `null`, so `recovered` is false and the re-pair never runs. The session-only device row died with the old orcad (P65-17, A-7), so the hosted client stays unpaired until it reports `access-revoked`, and the user then gets a second failure page (`pairing-lost`) and must press Reconnect.

For two of the three `REPAIR_AFTER` classes, the only way back to `ready` is Restart, which always goes through `starting`. The automatic re-pair is therefore dead code for those two classes. The `restarting` path has the same weakness: it works only if a poll samples the `restarting` window, and a single poll triggered by the client's status change can land before `_supervise` has seen the exit. VERIFICATION row 6 exercised only the kill -9 (`restarting`) path.
**Fix:** Track a pending re-pair instead of comparing two adjacent samples, and keep the page and the poll up until it completes:
```ts
protected repairPending = false;
// in take(), before change():
if (next.failureClass !== null && REPAIR_AFTER.includes(next.failureClass) || (this.repairPending && next.state !== 'ready')) {
    this.repairPending = true;
    this.held = next.failureClass ?? this.held;   // keep the page up through 'starting'
}
if (this.repairPending && next.state === 'ready' && next.failureClass === null) {
    this.repairPending = false;
    void this.reconnect().finally(() => this.change(() => { this.held = null; }));
}
// in schedule(): const wanted = this.pages.size > 0 || !this.bootSettled || this.repairPending;
```
A sturdier option is to have chrome's orcaStatus reply carry an orcad generation (for example `restartCount` or a start counter, which carries no identifier) and re-pair whenever it changes.

## Warnings

**Verifier (CONFIRMED, medium; scope: linux product (all platforms: frontend hosting status and chrome OrcaService)).** I traced the state sequence on disk.

Chrome side:
- OrcaService.restart() (OrcaService.sys.mjs:156-167) runs only from the failed state. It sets _state="starting", _restarting=false and _failureRows=[], then starts _startSequence() without awaiting it and returns true.
- handleOrcaShellMessage (PowerBrowserAPI.sys.mjs:11888-11891) replies {accepted} at once.
- OrcaEnv.failureClassOf (OrcaEnv.sys.mjs:504-519) returns null when restarting is false and state is "starting". It returns a class only for restarting===true, for failed, and for ready with a pairing or browser-host reason.
- The state becomes "ready" only at the end of _spawnAndGate (OrcaService.sys.mjs:531). That is after a Node spawn and orcad's ready line, so it takes well over one poll round trip.

Frontend side:
- restart() runs send(orcaRestart) and then poll(). That poll's take() sees state "starting" with failureClass null.
- In take() (line 288), `recovered` needs before∈REPAIR_AFTER, next.state==='ready' and next.failureClass===null. Here next.state is "starting", so it is false.
- this.chrome becomes {starting, null}. failureClass therefore goes to null (held is null, clientReason is unset), and orca-pane-widget.tsx:108-111 unmounts OrcaFailurePage. Its effect cleanup calls hide() (orca-failure-page.tsx:31).
- schedule() (line 263) then stops the interval, because pages is empty and bootSettled is true.
- The next sample comes only from onClientStatus (line 255-256, transport not ready). By then `before` is null, so when ready arrives `recovered` stays false and reconnect() never runs.
- repair() has no other caller (grep: only pb-session-pairing.ts:107, reached from runReconnect).

So the page hides while orcad is still starting, and the automatic re-pair is skipped.

Consequence: recorded live evidence shows the old client is refused by a restarted orcad. Its session device row died with the old orcad. See 67-07-SUMMARY.md:59-70 and D-36: the refusal comes 6-10 s later as verification blocked / access-revoked. onClientStatus then reports 'unauthorized', and the user gets a pairing-lost page and must press Reconnect.

Precondition: the pane bundle booted against an earlier orcad. orcad then crashed, and _supervise → _launch ended in _fail. That happens after 5 attempts or on the non-recoverable pinned-port or lock-held code (OrcaService.sys.mjs:385-397, 480-486), giving could-not-start or port-in-use. These are the only classes with a Restart button (orca-failure-copy.ts:66-75).

Counter-evidence checked:
- The orca-failure-page-live port-in-use clause (scripts/verify-orca-failure-page-live.mjs:466-483) presses Restart Orca and requires the content back within 60 s, and it passed in run6/8/9 (67-VERIFICATION row 1). But it induces port-in-use at relaunch, so the bundle has never booted. bootSettled stays false, polling continues, and the loader's own hand-off loop pairs with the new offer. No re-pair is needed there, so the pass does not exercise this path.
- That clause checks only that the page is gone and content is back. It does not check that the page stays up until ready, so it does not contradict claim 1 either.

The only narrow exception to "always": a timer poll already in flight when the restart reply arrives is shared and returns the pre-restart failed sample. Then, if orcad became ready before the next 1 s tick, the re-pair would fire. That is unlikely given the spawn and ready-line cost.

Severity: the result is user-visible and recoverable by Reconnect, under real but secondary preconditions (a crash followed by a failed respawn). That is medium on this scale, not critical: there is no security boundary, and the feature is not dead for all users.

## theia-pane-hosting-02: An Orca store activation of any origin brings an agent web tab forward and gives it keyboard focus

- **Severity:** medium
- **Verdict:** PLAUSIBLE
- **Location:** `theia/extensions/orca-panes/src/browser/orca-pane-observer.ts:262`
- **Owner decision cited:** D-34

**What is wrong.** revealBrowserTabs runs on every pane list. It calls shell.activateWidget, which moves keyboard focus, for each browser page whose `active` flag went from false to true. The record's `active` is Orca's group activeTabId, so a user click in Orca's sidebar and a change made by an agent through Orca's runtime look the same. Orca exposes browser.tabSwitch, browser.focus and terminal.focus as runtime RPCs to agents. The rest of this extension keeps agent actions from taking focus (P64-10: "an agent opening a pane must not take focus"; D-57). This path is the exception, and the tab it focuses is an agent-controlled page.

**Scenario.** A prompt-injected agent with an Orca browser page switches Orca's active tab to that page, or toggles another tab and back, while the user is typing in a Theia editor or a hosted terminal. The PowerBrowser web tab is activated and receives focus. The user's next keystrokes (a command, a passphrase typed at a terminal prompt) go to a page the agent drives and can read through its own browser tools.

**Preconditions.** An Orca agent can change the paired web client's store activeTabId for a browser row. Whether browser.tabSwitch or browser.focus does this for PB-hosted rows is not settled statically.

**Evidence.** orca-pane-observer.ts:262-264:
  for (const widget of this.browserPages.reveal(browser)) {
      this.shell.activateWidget(widget.id);
  }
orca-browser-dispatch.ts:213: `if (active && previous.get(pageId) === false && table.tabOf(pageId) !== undefined) reveal.push(pageId);`
pb-pane-mount.tsx:828: `active: group?.activeTabId === tab.id`
Compare orca-pane-observer.ts:242: `// Never activated: an agent opening a pane must not take focus (P64-10).`

**Suggested fix.** Reveal without focus: use shell.revealWidget, or activate only when Theia's current focus is already inside the Orca sidebar view that made the selection. Alternatively, have the bundle report whether the activation came from a user gesture in a hosted view and reveal only those.

**Verifier (PLAUSIBLE, medium).** Most of the path checks out. revealBrowserTabs (observer.ts:262-264) calls shell.activateWidget, which moves focus, for each page that createRevealTracker (orca-browser-dispatch.ts:203-216) reports as having turned from inactive to active. The tracker cannot tell a user selection from any other change to the store. An agent controls the input: browser.tabSwitch is a 'workspace'-permission RPC (orca/src/main/runtime/rpc/methods/browser-core.ts:120-125) that takes a page id and focus:true from the caller. For a client-registered page, browser-tab-queries.ts:97-140 calls registry.activatePage and publishSwitchedBrowserSessionTab, which republishes the session tabs and, when focus is true, calls markHeadlessBrowserSessionTabActive with focusesHost (browser-tab-create-publication.ts:158-176). One step cannot be settled statically. That step is whether that republish or focus marker changes the paired pane client's group activeTabId for the row PowerBrowser itself added under D-34 (overlay pb-pane-mount.tsx:828 derives `active` from it). D-34 says 'Selecting the row in Orca's store brings the PowerBrowser web tab forward (P66-09)', so the owner intended reveal on selection. That decision does not separate user selections from agent ones, and it does not accept the agent case. *Checked at:* Unsettled step: whether Orca's runtime activatePage or the focusesHost marker sets the pane client's store activeTabId for a PB-added browser row (orca/src/main/runtime/browser-tab-create-publication.ts:162-176 through to the paired client). No guard in revealBrowserTabs or createRevealTracker separates an agent-caused activation from a user one.

## theia-pane-hosting-01 = 64-CR-02: A restored Orca tab cannot be closed while the pane bundle has failed or never finishes booting

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx:159`

**What is wrong.** onCloseRequest never disposes a hosted (non-page) widget itself. It forwards the close to Orca. When the bundle boot failed (bundle.failed set), it logs and returns. When the boot is still pending (waitForPairing loops forever while orcad has not written the offer), ready() never resolves and the close is dropped. The observer, the only other path that disposes these widgets (disposeFromStore), starts only after ready() resolves. So every Orca tab that Theia's layout restorer recreated stays open and cannot be closed. It is saved into the layout again and comes back at every launch.

**Scenario.** The user had pb-orca:term1 and pb-orca:chat1 open. At the next launch the bundle fails at the identity or load step (for example a bundle/React version drift), or orcad never becomes ready. Theia restores both tabs. The user clicks X, or presses Ctrl+Shift+W (now bound to CLOSE_TAB by this change), on each tab. Nothing happens beyond a console line, and the tabs come back on every relaunch until Orca boots again.

**Preconditions.** The bundle boot fails or orcad never writes the pairing offer, while Theia's stored layout contains hosted Orca tabs.

**Evidence.** orca-pane-widget.tsx:159-171:
  protected override onCloseRequest(_msg: Message): void {
      if (this.tabless) { this.dispose(); return; }
      ...
      if (this.bundle.failed) {
          console.info(`${LOG_PREFIX} Orca ${this.options.kind} pane close not sent: the pane bundle did not boot`);
          return;
      }
      this.bundle.ready().then(api => api.closePane({ worktreeId, tabId, paneKey }))

orca-pane-bundle.ts:102-110: waitForPairing is `for (let wait = 1000; ; ...)` with no exit except an offer. orca-pane-observer.ts:105: `this.bundle.ready().then(api => this.start(api))`, which is the only route to disposeFromStore.

**Suggested fix.** When the bundle has failed, or Orca's store does not hold the pane (closePane finds no unified tab), dispose the widget locally. Also give the pending boot a bound: a close requested while ready() is unresolved past a timeout should dispose the tab. The Orca pane, if it exists, is re-adopted by key on the next list.

**Verifier (CONFIRMED, medium).** orca-pane-widget.tsx:159-171 disposes only tabless (page) widgets. For a hosted widget it returns early when bundle.failed is set, and otherwise chains on bundle.ready(). orca-pane-bundle.ts:66 caches the boot promise in `booting ??=`, and nothing resets it, so after a failed step bundle.failed stays set for the rest of the session. waitForPairing (bundle.ts:102-110) is an unbounded loop that exits only when an offer arrives, so while orcad has written no offer ready() stays pending and closePane is never sent. The only other dispose path is disposeFromStore, called from observer.ts:214 inside start(), and start() runs only after ready() resolves (observer.ts:105). The widget factory (frontend-module.ts:171-178) builds the widget from the replayed options without depending on the bundle, so Theia's layout restorer recreates these tabs, and storeLayout saves them again. Every close route in Theia (X, Close Tab, Close All) ends in onCloseRequest. In the pending-offer case the close does take effect later if orcad recovers, but in the failed-boot case the tab cannot be closed for the whole session and returns at every launch. *Checked at:* orca-pane-widget.tsx:165-170 (early return when failed, ready() chain otherwise); orca-pane-bundle.ts:66 (cached boot promise, no reset); orca-pane-bundle.ts:102-110 (unbounded poll); orca-pane-observer.ts:105 and :214 (disposeFromStore reachable only after ready()). No guard found.

---

**Per-phase review report of the same defect (64-CR-02).**

*Section CR-02 of `.planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx:159-171`
**Issue:** `onCloseRequest` returns without closing when `bundle.failed` is set (line 165-168). It also routes the close through `bundle.ready()`, and `ready()` does not settle while `waitForPairing` (orca-pane-bundle.ts:102-110) is still polling. That polling has no limit: it runs forever while orcad is down or has not started, and while the hand-off keeps returning `{ refused }`. In either case the Lumino close button does nothing. A widget that Theia's layout restorer recreated therefore stays in the dock, with no way to remove it, for the whole session and every later session while Orca is unavailable. Phase 67's failure page offers no close button (failure/orca-failure-page.tsx has no close affordance). There is a second effect: each click queues a `closePane` that fires all together once the bundle boots later (see WR-02 for why queued leaf closes are harmful). P64-11 requires the close to go through Orca, but only on the assumption that Orca is there to receive it. P64-28 says a restored tab whose Orca tab is gone disposes itself, and this path never reaches that.
**Fix:** When Orca cannot receive the close, close the PowerBrowser tab locally. Only the stored record is involved, because there is no live Orca pane behind it:
```ts
protected override onCloseRequest(_msg: Message): void {
    if (this.tabless || this.bundle.failed || !this.bundle.booted) {
        this.dispose();
        return;
    }
    ...
}
```
To do this, expose a synchronous `booted` flag on OrcaPaneBundle, set when `boot()` resolves. Alternatively, send the close only when `hostingStatus.failureClass` is unset.

## Warnings

## pairing-credentials-01: handOff returns the offer before orca-panes-dir exists, so a poll in that gap fails the pane bundle boot until the document reloads

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts:154`

**What is wrong.** The protocol says handOff is undefined until both bridge files are written (orca-panes-protocol.ts:31). handOff checks only the web-pairing file. OrcaService._writeHandOff writes web-pairing first, then awaits pathExists(panesDir) and a whole second writePrivateFile before orca-panes-dir exists. If the frontend poll lands in that gap, the frontend gets the pairing and imports /orca-panes/pb-panes.js at once. bundleRootReal finds no orca-panes-dir and the route answers 404, so the boot fails at the load step. OrcaPaneBundle.ready caches the rejected promise and nothing resets it. OrcaHostingStatus.reconnect then does nothing: this.api is undefined, so it clears the client reason and returns. Its comment assumes the loader is still polling, but the loader has already failed. The chrome state is ready, so no failure class is set and no failure page appears. Orca tabs stay empty until the Theia document reloads.

**Scenario.** PowerBrowser launches and the Theia frontend starts polling handOff (1 s, 2 s, 4 s, then every 5 s). orcad prints its ready line. OrcaService writes web-pairing, and a handOff poll arrives before orca-panes-dir is renamed into place. The frontend loads pb-panes.js, gets a 404, and boot() rejects with failed set to 'load'. Every later bundle.ready() call rejects, and Reconnect does nothing.

**Preconditions.** A handOff poll lands within the few milliseconds between the two bridge-file writes at an orcad start.

**Evidence.** OrcaService.sys.mjs:552 writes the offer first: `await PowerBrowserProcesses.writePrivateFile(this._bridgeDir, OrcaEnv.ORCA_WEB_PAIRING_FILE, ...)`. Lines 559-567 run `pathExists(panesDir)` and then `writePrivateFile(..., ORCA_PANES_DIR_FILE, ...)`. orca-panes-backend-module.ts:169-198: handOff reads only WEB_PAIRING_FILE and returns `{ pairing }`. orca-panes-backend-module.ts:246-248: the route answers 404 when bundleRootReal() is undefined. orca-pane-bundle.ts:65-67: `return this.booting ??= this.boot();` and the boot catch at :94-97 rethrows. orca-hosting-status.ts:197-207: `if (this.api) {...}` then `// Not booted yet: the loader's own hand-off loop pairs with this offer.` and `this.setClientReason(undefined)`. pb-pane-mount.tsx:669 also memoises its own rejected `booting`.

**Suggested fix.** Make handOff return undefined until orca-panes-dir passes readBridgeFile, which is what the protocol already states. Alternatively, write orca-panes-dir before web-pairing in _writeHandOff. Also clear OrcaPaneBundle.booting on a load or pairing failure, so that Reconnect, or the next handOff that succeeds, can retry the boot.

**Verifier (CONFIRMED, medium).** I traced every step. OrcaService._writeHandOff (OrcaService.sys.mjs:550-570) writes web-pairing, then awaits pathExists(panesDir), then calls writePrivateFile for orca-panes-dir. writePrivateFile (PowerBrowserAPI.sys.mjs:11071-11089) runs about seven IOUtils calls in sequence, so the gap is a few milliseconds of async work. handOff (orca-panes-backend-module.ts:154-198) lstats and reads only WEB_PAIRING_FILE, so it returns { pairing } during that gap. This breaks the protocol contract at orca-panes-protocol.ts:31 ('undefined until both bridge files are written'). OrcaPaneBundle.waitForPairing (orca-pane-bundle.ts:102-110) returns on the first pairing, and boot() goes straight to loadEntry. The route (backend :232-248) calls bundleRootReal(), which hits ENOENT on orca-panes-dir and returns undefined, so the route answers 404. The inline module script's import() rejects and dispatches LOAD_FAILED_EVENT, and boot() sets failed='load' and rethrows (:94-97). ready() memoises that rejected promise through `this.booting ??= this.boot()` (:66), and nothing resets booting. In OrcaHostingStatus.onStart the reject path calls settle, so bootSettled becomes true and the stuck-boot check (:298-301) never runs. this.api stays undefined, so runReconnect (:197-207) only clears the client reason. Once chrome reaches ready, failureClass is null, so no failure page is shown and the widget host stays empty (orca-pane-widget.tsx:110,142-146). The window exists only on a start where orca-panes-dir is absent, which is the normal case after a clean quit because _stopTree removes it (:630). On an orcad respawn the old file is still there. The poll landing in the window depends on timing, but that is the stated precondition, not an open runtime question. The race is narrow but its effect is visible to the user and lasts until the document reloads, so medium stands. *Checked at:* No guard. orca-panes-backend-module.ts:169-198 reads only web-pairing; OrcaService.sys.mjs:552 then :560-567; orca-pane-bundle.ts:66 `this.booting ??= this.boot()`; orca-hosting-status.ts:197-207 does nothing when api is undefined.

## 67-WR-01: A stuck boot with no offer file, or with a non-private bridge folder, never shows a failure page

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts`

*Section WR-01 of `.planning/workstreams/orca/phases/67-hosting-hardening/67-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts:305-314`
**Issue:** `checkStuckOffer()` handles a `{ refused }` result and does nothing when `handOff()` returns `undefined`. The backend returns `undefined` in three ready-state cases (orca-panes-backend-module.ts:155-176):
- the pairing file is absent because `_writeHandOff`'s write failed, which is "one log line, never a start failure" (OrcaService.sys.mjs:550-555);
- the bridge folder fails `privateDirVerdict` (wrong owner or a group or other bit set);
- the bridge folder cannot be lstat'ed.

In all three, orcad is `ready`, chrome's class is `null`, and the loader's `waitForPairing` loops forever (orca-pane-bundle.ts:102-110). `checkStuckOffer` runs every second with no effect, and every hosted tab shows Orca's waiting state indefinitely. That contradicts P67-09 ("A refusal shows pairing-lost"). `runReconnect` already treats "no offer while ready" as `offer-missing` (line 188-190), but `checkStuckOffer` does not.
**Fix:** Mirror `runReconnect`:
```ts
if (!result) {
    if (this.chrome.state === 'ready' && this.clientReason !== 'offer-missing') {
        await this.reportClientReason('offer-missing');
    }
} else if ('refused' in result) { ... }
```
Also consider having `handOff` return `{ refused: 'offer-unreadable' }` (or a new folder reason) instead of `undefined` when the folder verdict fails, so the tampered-folder case appears in a diagnostics row.

## 67-WR-02: Reconnect after a failed bundle boot reports success and removes the page

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts`

*Section WR-02 of `.planning/workstreams/orca/phases/67-hosting-hardening/67-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts:197-207`
**Issue:** When `this.api` is undefined, `runReconnect` assumes "Not booted yet: the loader's own hand-off loop pairs with this offer" and clears the client reason. `api` is also undefined when the boot has *failed*: `bundle.ready()` rejected, the rejected promise is cached by `this.booting ??=` (orca-pane-bundle.ts:65-67), and `onStart`'s rejection handler only sets `bootSettled`. A failed bundle has no hand-off loop and never retries. For example, if orcad crashes during the bootstrap step, the restart leads to `recovered`, then `reconnect()` takes the `api === undefined` branch, `held` is cleared, and the page disappears over an empty host with nothing re-paired. `watchClient()` never ran on that path, so no later client failure brings the page back.
**Fix:** Distinguish the two cases with `OrcaPaneBundle.failed`:
```ts
if (!this.api) {
    if (this.bundle.failed) {
        await this.reportClientReason('unauthorized'); // or a dedicated reason; keeps the page and the Details affordance
        return;
    }
    // still booting: the loader's own loop pairs with this offer
}
```
A better fix is to let `OrcaPaneBundle` reset `booting` after a failure so that Reconnect can call `ready()` again.

## 67-WR-04: A successful Reconnect never clears chrome's pairing-failure reason, so diagnostics stay stale

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts`

*Section WR-04 of `.planning/workstreams/orca/phases/67-hosting-hardening/67-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts:207, 257-258, 312`
**Issue:** `reportClientReason` sends each pairing reason to chrome, which stores it in `OrcaService._clientReason`. Chrome clears it only on orcad's next ready line or, for the browser-host reason only, on the `browserHost: 'attached'` clearing form (OrcaService.sys.mjs:535, 736-752). When the frontend recovers (repair succeeds at line 207, the client verifies again at line 258, or the offer file becomes valid at line 312), it clears only its own `clientReason` and sends nothing. The diagnostics layer keeps the row "Orca pairing failure: unauthorized" (or `offer-mode` and so on; OrcaService.sys.mjs:772-775) for the rest of that orcad's life, which reports a failure that has ended. The handler also has no clearing form for pairing reasons: `handleOrcaShellMessage` accepts only `browserHost: 'attached'` as a clear.
**Fix:** Add a clearing form for pairing reasons (for example `{ kind: 'orcaStatus', clientReason: null }` accepted by `handleOrcaShellMessage`, which calls a new `OrcaService.clientRecovered()` that clears any non-browser-host `_clientReason`). Send it from `setClientReason(undefined)` whenever the previous reason was set.

## Info

## 65-WR-04: Re-selecting the same Orca page or Settings does nothing after focus moved elsewhere

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-sync.ts`

*Section WR-04 of `.planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-sync.ts:219-238`, `:258-289`; `orca-overlay/files/src/renderer/src/pb/pb-workspace-api.ts:22-32`

**Issue:** The store's `activeView` is written back from PB only when a page tab activates or when the page tab of the current view closes. Two ordinary sequences break:

- **A page.** The user opens Tasks (activeView is `tasks`, and the `pb-orca:tasks` tab opens). They click an editor or terminal tab, which writes nothing, and then click Tasks again in Orca's sidebar. Orca writes `tasks` again. `subscribeProjection` suppresses the unchanged JSON, so `onActiveView` never runs and the Tasks tab is not brought forward.
- **Settings.** Collapsing the Settings part, or switching the left panel away, never writes back. A second Settings click is likewise swallowed, and `revealSettings` never runs.

**Fix:** In `onActiveWidget`, when a main-area widget that is not a page activates while `this.activeView` is a page view or `settings`, write `'terminal'` (as `watchPage` already does on close). Write `'terminal'` too when the Settings part is collapsed or hidden (`ViewContainer` part `onDidChangeVisibility`/collapse). Alternatively, project a request counter from the overlay so that a repeated `setActiveView` with the same value is still reported.

## 67-WR-03: The offer's endpoint is checked against a port taken from the same file, not orcad's port

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-panes/src/node/offer-file-policy.ts`

*Section WR-03 of `.planning/workstreams/orca/phases/67-hosting-hardening/67-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-panes/src/node/offer-file-policy.ts:187-201` (caller `orca-panes-backend-module.ts:194`)
**Issue:** P67-09 requires refusing an offer "whose endpoint is not `ws://127.0.0.1:<orca port>`". `offerEndpointVerdict(offer, offerPortOf(pairing))` takes the expected port from the web-client URL in the same file that supplies the endpoint. Anyone able to write that file sets both values consistently, so the equality test binds nothing. For a bare offer (not a URL), `offerPortOf` returns `undefined` and any loopback port from 1024 to 32767 is accepted. The check therefore only enforces the loopback host and port range. It never checks that the offer targets the orcad PowerBrowser launched, which is the point of the threat (T-67-13: redirecting the client to another local listener).
**Fix:** Give the backend orcad's real port from a source the offer file does not control, for example a `POWERBROWSER_ENV` value captured at sidecar start, or `powerbrowser.orca.port` passed through the token-gate env, or a separate private bridge file written by OrcaService. Pass that port as the second argument instead of `offerPortOf(pairing)`. Refuse when it is unknown on POSIX.

## 64-WR-01: The bundle boot can race OrcaService's two bridge-file writes, and a failed boot is never retried

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts`

*Section WR-01 of `.planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts:154-199`; `theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts:65-67`
**Issue:** The `OrcaPanesService.handOff` contract (orca-panes-protocol.ts:31) says "undefined until both bridge files are written". `handOff` checks only `web-pairing`. OrcaService writes `web-pairing` first and `orca-panes-dir` second, with an `await PowerBrowserAPI.pathExists` between the two writes (OrcaService.sys.mjs:552-567). A poll that lands between the two writes returns the pairing. `loadEntry` then requests `/orca-panes/pb-panes.js`, and `bundleRootReal()` returns 404 because `orca-panes-dir` is still missing. The boot fails at the `load` step. `ready()` keeps that rejected promise in `this.booting` for the life of the document, so no hosted pane, Orca command or observer works until a reload. The same permanent failure follows any transient error at the `load` or `bootstrap` step, for example orcad restarting between the hand-off and the pairing.
**Fix:** Have `handOff` return undefined until `orca-panes-dir` is also present and private, which is what the contract says. In `ready()`, clear `this.booting` on rejection so that the next `ready()` call, or a timed retry, boots again:
```ts
ready() { return this.booting ??= this.boot().catch(err => { this.booting = undefined; throw err; }); }
```
`failed` stays set for diagnostics.

## theia-pane-hosting-04: A user's existing custom mode named "Orca" is silently dropped on upgrade and erased on the next mode save

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/modes/src/browser/mode-service.ts:216`

**What is wrong.** v1.7 adds a shipped mode labelled 'Orca'. parseModeStore skips any stored custom row whose name matches a shipped label (`continue`), without adding it to badNames, so no notice is shown. The next saveCustom writes `[...this.lastGoodCustoms, row]`, which removes the user's row from storage permanently. A persisted active id of custom-orca then resolves to Browsing.

**Scenario.** Before v1.7 the user saved a custom mode named 'Orca' (or 'orca') with their own panel and view layout. After the upgrade it no longer appears, and the app opens in Browsing. When the user saves any other custom mode, the old row is deleted from the mode store without notice.

**Preconditions.** A custom mode named 'Orca' was saved before v1.7.

**Evidence.** mode-service.ts:216-219:
  if (SHIPPED_MODES.some(descriptor => descriptor.label.toLowerCase() === name.toLowerCase()) || seen.has(id)) {
      continue;
  }
mode-descriptors.ts: `export const SHIPPED_MODES = [coding, browsing, organising, orca];`
mode-service.ts saveCustom: `const customs = [...this.lastGoodCustoms, row];`

**Suggested fix.** Migrate a colliding legacy row instead of dropping it: rename it (for example 'Orca (custom)'), or keep it under its custom-<slug> id with a distinct label, and report it through the existing badNames notice path.

**Verifier (CONFIRMED, low).** mode-service.ts:216-220 skips a stored custom row whose name matches a shipped label, case-insensitively, with `continue` and does not add it to badNames. No notice is shown for it. saveCustom (mode-service.ts:514-516) writes `[...this.lastGoodCustoms, row]`, so the skipped row is removed from the file on the next save. git log shows the 'Orca' shipped label was added in b0ded1ab (2026-11-10, phase 64-03), inside v1.7, so a pre-v1.7 custom mode named 'Orca' would collide. Impact is limited because, according to project memory, no public release exists yet, so only pre-release profiles can hold such a row. *Checked at:* mode-service.ts:216-220 (silent skip); mode-service.ts:514-516 (rewrite from lastGoodCustoms); mode-descriptors.ts:57,66 (Orca label added in b0ded1ab). No migration or notice path found.

## theia-pane-hosting-03: The launch prune treats an unreadable or corrupt setups.json as naming nothing, so tombstoned pb-orca names a Setup still uses are released and minted again

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/modes/src/browser/setups-service.ts:1419`

**What is wrong.** referencedTabUris() catches any read error of setups.json and returns an empty set for it, and uses parseSetupStore(...).setups even when parsed.ok is false. OrcaPaneNameMap.prune then drops every tombstone that the session snapshot does not name. SetupsService's own loader says read failures happen in a mid-save race. Once a tombstone is pruned, mintName can issue that name to a different Orca pane, and a saved Setup that names pb-orca:<name> then opens the wrong pane in its slot. This is the case T-65-13 says is mitigated: "never reissued while a Setup or the session names them".

**Scenario.** A Setup 'Review' contains pb-orca:chat2, whose Orca chat was closed, so chat2 is a tombstone. At launch, setups.json is caught mid-write by another window, or is unparseable after a partial write. prune() drops the chat2 tombstone. The user starts a new Orca chat, and planPanes mints chat2 for it. Restoring 'Review' later opens the new, unrelated chat as the Setup's chat2 tab.

**Preconditions.** A read failure or a not-ok parse of setups.json at frontend start, while a tombstoned name is referenced only by a saved Setup.

**Evidence.** setups-service.ts:1418-1424:
  let setups: SetupSnapshot[] = [];
  try {
      setups = parseSetupStore((await this.fileService.read(this.setupsUri)).value).setups;
  } catch {
      console.info('[@powerbrowser/modes] no saved setups read for the referenced tab list');
  }
orca-pane-name-map.ts:125-129: `const gone = [...map].filter(([name, e]) => e.tombstone && !referenced.has(name))...; gone.forEach(name => map.delete(name));`
setups-service.ts:1338-1341: `// A later read failure is a mid-save race: keep last good`

**Suggested fix.** Return a tri-state from referencedTabUris: distinguish 'file absent' (empty is correct) from 'read failed' or 'parse not ok', and skip the prune when the reference set is unknown. A tombstone left in place an extra launch costs nothing.

**Verifier (CONFIRMED, low).** setups-service.ts:1419-1432 catches a read failure and uses an empty list. parseSetupStore (setups-service.ts:348-373) returns {ok:false, setups:[]} for an unparseable file, and referencedTabUris uses .setups without checking ok. The prune contribution (orca-pane-name-map.ts:147-150) runs on onStart and passes that set to prune (name-map.ts:124-133), which deletes every tombstone not named by the set. After that the name is free, because mintName (orca-pane-routes.ts:81-88) skips only the names in the taken set, which comes from the map. A Setup that later reads correctly then resolves pb-orca:<name> through the new live entry (name-map.ts:203-209). This defeats the mitigation stated in T-65-13. The precondition is narrow. The writes go through a single fileService.write, which the code comment at setups-service.ts:628 describes as atomic to readers. A corrupt file that stays corrupt also makes the Setup itself unrestorable. So the harm needs a transient read failure, or a corrupt file that is later repaired. *Checked at:* setups-service.ts:1421-1424 (catch gives an empty list, parsed.ok not checked); orca-pane-name-map.ts:125-129 (unconditional delete of unreferenced tombstones). No guard found. The likelihood is limited by single-write saves (setups-service.ts:628-630).

## pairing-credentials-04: Every orcad start mints a new runtime-scope token row that is never revoked, so each offer PowerBrowser writes stays valid indefinitely

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts:20`

**What is wrong.** PowerBrowser treats the offer as tied to one orcad start ('the session-only device row died with the old orcad'; D-36 cites P65-17). At the pin, the row that dies is only the ephemeral session-key fork. The legacy token row that the offer's deviceToken names survives. It is marked seen on first authentication, so it is no longer pending, and the next orcad start calls getOrCreatePendingDevice and creates another row with reach 'network'. Upstream removes token rows only through explicit user removal, and pruneIdleEphemeralDevices touches only ephemeral rows. Over months the profile's orca-devices.json accumulates one live full-runtime token per launch or orcad restart. Every web-pairing file, copy, or backup ever written stays a working credential against any later orcad on that profile. The pairing-containment check lists the registry as holder 5, but neither it nor any decision addresses the unbounded count or the lifetime.

**Scenario.** A user launches PowerBrowser daily for a year, and about 365 runtime-scope token rows accumulate. A web-pairing file left by a crash months ago, or found in a home-directory backup, still authenticates to today's orcad with full runtime control (terminals, files).

**Preconditions.** Access to an old offer file or the registry, which requires the same uid or a backup copy of the profile.

**Evidence.** orca/src/main/server/serve-pairing-readiness.ts: `rpc.createPairingOffer({ ..., scope: options.mobilePairing ? 'mobile' : 'runtime', grants: ... })` with no `reach`, so it defaults to 'network'. orca/src/main/runtime/device-registry.ts:96-107 reuses only `isPendingTokenRow(d)` (device-entry.ts:51-54: `device.lastSeenAt === 0 && ...`), otherwise `addDevice`. orca/src/main/runtime/ephemeral-device-rows.ts:20 prunes only `device.ephemeral === true`. orca-hosting-status.ts:20-22 states: 'the session-only device row died with the old orcad (P65-17, A-7)'.

**Suggested fix.** At each orcad start (or stop), have PowerBrowser revoke the token row its previous offer named. pairedDeviceId is in the decoded offer, so chrome can record it in memory and remove it through orcad's device RPC or CLI after the new offer is written. Alternatively, request the offer with rotate so that pending rows are replaced, and remove seen PowerBrowser rows by name. Record the token's real lifetime in INTERNAL-APIS or DECISIONS.

**Verifier (CONFIRMED, low).** PowerBrowser starts orcad with no rotate flag (buildOrcadArgs, OrcaEnv.sys.mjs:182). createPairingOffer (orca runtime-rpc-pairing.ts) then calls getOrCreatePendingDevice with reach defaulting to 'network'. getOrCreatePendingDevice (device-registry.ts:87-107) reuses a row only when isPendingTokenRow is true, which requires lastSeenAt === 0 (device-entry.ts:51-54); otherwise it calls addDevice. A token-authenticated socket reaches onReady, which calls updateLastSeenDeferred, and on first sighting that persists lastSeenAt immediately (mobile-socket-wiring.ts:245; device-registry.ts:252-265). The hosted client's first token authentication therefore takes the row out of the pending state, and the next orcad start mints a new row. Ephemeral pruning only touches rows with ephemeral === true (ephemeral-device-rows.ts:8-27). device-key-fork.ts:70 records forkedFrom, and device-entry.ts:35 documents that 'that row stays for its other holders', so the legacy token row survives the fork. The only removal is removeDevice, which an explicit user action triggers. This contradicts the 'session-only device row died with the old orcad' framing at orca-hosting-status.ts:20-22, which is true only of the ephemeral fork. Rows accumulate one per orcad start, and every old offer stays valid. The impact stays low. Exploiting it needs an old offer file or the registry itself, which means the same uid or a profile backup, and the backup already contains orca-devices.json with the tokens. orcad binds 127.0.0.1 only, so a token is usable only from the local host. *Checked at:* No revocation path. device-registry.ts:96-107 (pending-only reuse), mobile-socket-wiring.ts:245 (token row marked seen), ephemeral-device-rows.ts:8-27 (prunes only ephemeral rows), OrcaEnv.sys.mjs:182 (no rotate).

## sidecar-gate-backends-01: Third-party Orca renderer bundle runs in the sidecar's own origin with no CSP, so any Orca UI XSS reaches Theia's full RPC

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts:135`
- **Owner decision cited:** D-15

**What is wrong.** The Orca pane bundle (upstream Orca renderer code, re-pinned weekly under D-26) is loaded as a module script into the Theia document at http://127.0.0.1:<sidecar port>. The 67-02 gate admits its requests as same-origin by construction. Code in that document can call every authenticated Theia JSON-RPC service: filesystem read and write, terminal and process spawn, plugin install, and pb-orca-git. In Orca's own web build the renderer can only reach orcad. Here it renders untrusted remote text (GitHub/GitLab/Jira/Linear comments through CommentMarkdown with rehype-raw plus rehype-sanitize, markdown preview, Mermaid, ipynb), and it runs with Theia's privileges. No Content-Security-Policy is set on the Theia document (no CSP header or meta anywhere in theia/extensions or the browser app). Local code-execution safety therefore depends on every Orca sanitizer holding.

**Scenario.** An outside contributor posts a PR comment containing HTML that gets past Orca's rehype-sanitize schema (an upstream regression at a weekly re-pin, or a gap in a schema extension such as the file-link allowance at CommentMarkdown.tsx:217). The user opens the PR in an Orca pane. The script runs at the sidecar origin, opens a Theia terminal over the authenticated socket, and runs commands as the user.

**Preconditions.** An HTML-injection flaw in Orca's renderer, present at the pinned tag, reachable from content an attacker can author (a PR, issue or comment the user views in an Orca pane).

**Evidence.** orca-pane-bundle.ts:135-145: `const url = new URL(ORCA_PANES_ROUTE_PREFIX + ORCA_PANES_ENTRY, document.baseURI).href; ... script.textContent = [`import(${JSON.stringify(url)})...`]; document.head.appendChild(script);` ; orca-panes-backend-module.ts:227-251 serves that bundle from the gated `/orca-panes/` route on the same origin; orca/src/renderer/src/components/sidebar/CommentMarkdown.tsx:231-232 `// GitHub comments use raw HTML; parse it then sanitize before rendering. const rehypePlugins = [rehypeRaw, [rehypeSanitize, commentMarkdownSanitizeSchema]]`. 67-02-SUMMARY: pane-bundle requests are 'same-origin ... -> 200'.

**Suggested fix.** Set a strict CSP on the Theia document (script-src 'self' with the inline boot replaced by a hashed or nonce'd script, no unsafe-eval where Monaco allows it, object-src 'none'). Consider hosting the Orca pane bundle in a separate origin or frame that reaches only orcad and a narrow postMessage bridge, so an Orca-side XSS does not get the Theia RPC. At minimum, add a re-pin check that diffs Orca's sanitize schemas and raw-HTML sinks.

**Verifier (CONFIRMED, low).** The structure is as described. orca-pane-bundle.ts:135-145 loads ORCA_PANES_ROUTE_PREFIX+ORCA_PANES_ENTRY as a module script into the Theia document. orca-panes-backend-module.ts:225-252 serves it from configure(), behind the token gate, on the same origin. No CSP header or meta exists in theia/extensions or theia/applications sources. The only CSP strings in the built backend are express/send `default-src 'none'` on error responses. The only PB CSP is on chrome powerbrowser.xhtml:30. The bundle (orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx, pb-side-mounts.tsx) mounts NativeChatView, Sidebar, RightSidebar and CheckRunDetailsPanel, and these use CommentMarkdown, which runs rehypeRaw plus rehypeSanitize (CommentMarkdown.tsx:231-232). The impact claim overstates what PB adds. The same bundle receives orcad's pairing (orca-pane-bundle.ts:85-86). Under D-31, Orca terminals run on Orca's own daemon again (DECISIONS.md:11-16, 66-67). An Orca renderer XSS therefore already reaches shell execution through orcad in upstream Orca's web build and inside PB alike. Theia RPC is a second path to a capability class the XSS already has, not a new privilege boundary. The whole chain also depends on a hypothetical sanitizer bypass. This is a real defence-in-depth gap (no CSP on a document that runs third-party code against untrusted content), but it is low rather than medium. *Checked at:* No CSP: grep over theia/extensions and theia/applications finds no Content-Security-Policy outside express error handlers. Equivalent existing capability: the orcad pairing is handed to the bundle at orca-pane-bundle.ts:85-86; Orca's terminal daemon is in use per DECISIONS.md D-31 (lines 11-16, 66-67).

## theia-pane-hosting-05: pb-orca:creating opens the worktree creation surface when no creation is pending

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/orca-panes/src/browser/restore/orca-pane-name-map.ts:191`

**What is wrong.** ORCA_PAGE_ROUTES marks the creating page whilePendingCreation, and docs/URI-SCHEMES.md says it is "open only while an Orca worktree creation is pending". The restore opener nevertheless creates a page:creation widget for the name 'creating' whenever the URI is opened: typed in the address bar, opened from a Setup or session restore, or recreated by Theia's layout restorer, since page widgets are never disposed from a list. Nothing reads whilePendingCreation. Only OrcaSidePanelSync closes the tab, and only on a pending-to-not-pending transition.

**Scenario.** A Setup saved while a creation was pending contains pb-orca:creating. Restoring it, or a relaunch with that tab in the layout, mounts Orca's CreationMount with no pending creation. The tab stays until the user closes it, because no creationChanged transition occurs.

**Preconditions.** The pb-orca:creating URI is opened, or present in a Setup, session or layout, while no creation is pending.

**Evidence.** orca-pane-name-map.ts:191-195:
  const pageKind = Object.prototype.hasOwnProperty.call(PAGE_WORDS, name) ? PAGE_WORDS[name] : undefined;
  if (pageKind) {
      const page: OrcaPaneOptions = { name, kind: pageKind, worktreeId: '', tabId: '', paneKey: null };
      return this.widgetManager.getOrCreateWidget<OrcaPaneWidget>(ORCA_PANE_FACTORY_ID, page);
Orca-pane-routes.ts:68: `'terminal': { word: 'creating', kind: 'page:creation', whilePendingCreation: true }`. `whilePendingCreation` has no reader in theia/.

**Suggested fix.** In widgetFor, refuse the whilePendingCreation route unless the side-panel sync reports pendingCreation. Close a layout-restored page:creation widget at start when the store reports no pending creation.

**Verifier (CONFIRMED, low).** whilePendingCreation appears only in its type and route declaration (orca-pane-routes.ts:56,68) and is read nowhere in theia/. OrcaPaneRestoreOpenHandler.widgetFor (orca-pane-name-map.ts:190-195) creates a page:creation widget for 'creating' on any open, with no pending-creation check. Page widgets are tabless, are excluded from restoredWidgets (observer.ts restoredWidgets filters on tabId), and are skipped in plan.dispose (observer.ts:208-209), so the observer never closes them. OrcaSidePanelSync.onActiveView (side-panel-sync.ts:219-228) closes the tab only on a transition from pending to not pending. Its initial pendingCreation is false (line 108), so a not-pending state at startup produces no close. The result contradicts docs/URI-SCHEMES.md:211. The effect is a stale creation surface that the user can still close, since tabless widgets do dispose on close. *Checked at:* orca-pane-name-map.ts:191-195 (no pending check); orca-side-panel-sync.ts:221-228 (closes only when creationChanged and the creation is not pending); whilePendingCreation has no reader.

