---
phase: 67-hosting-hardening
reviewed: 2026-11-20T22:44:56Z
depth: deep
files_reviewed: 6
files_reviewed_list:
  - theia/extensions/branding/src/browser/powerbrowser-update-copy.ts
  - theia/extensions/branding/src/browser/powerbrowser-welcome-widget.tsx
  - theia/extensions/orca-panes/src/browser/failure/orca-failure-copy.ts
  - theia/extensions/orca-panes/src/browser/failure/orca-failure-page.tsx
  - theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts
  - theia/extensions/orca-panes/src/node/offer-file-policy.ts
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
  necessity: 1
status: issues_found
---

# Phase 67: Code Review Report

**Reviewed:** 2026-11-20T22:44:56Z
**Depth:** deep
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the six files at HEAD (e0c19c54). For the two pre-existing branding files, the review covered the v1.7 diff from 2b5f4609. Call chains were traced into the code each file depends on: `orca-panes-backend-module.ts` (handOff), `orca-pane-bundle.ts` (boot and `ready()`), `orca-pane-widget.tsx` and `orca-side-view-widget.tsx` (page hosts), `OrcaBrowserHost` in orca-browser, and on the chrome side `handleOrcaShellMessage` (PowerBrowserAPI.sys.mjs), `OrcaService.restart/_supervise/_writeHandOff/reportClientFailure` and `OrcaEnv.failureClassOf`. The upstream Orca `createWebClientUrl` was read to confirm the offer text format.

The branding changes are small and correct. `offer-file-policy.ts` matches Orca's parser and OrcaEnv's loopback rule. Its port-equality check, however, compares the offer file against itself. The main defects are in `orca-hosting-status.ts`. The automatic re-pair (P67-06) depends on catching one transitional class in consecutive poll samples, and the Restart Orca path always passes through a class-less `starting` state. So the re-pair never fires after `could-not-start` or `port-in-use`, and the page hides before orcad is ready, which P67-07 does not allow. Two other cases also leave a hosted tab without a failure page: the bundle is stuck with no offer file, and the bundle boot has failed. The chrome-side `_clientReason` is never cleared after a successful Reconnect, so the diagnostics layer keeps showing a pairing failure that has ended.

No owner decision in DECISIONS.md ratifies any of the behaviours flagged below. D-33 (browser-host failure folded into the page) and D-36 (environment id kept across a restart) were checked, and the implementation is consistent with both.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Automatic re-pair never runs after Restart Orca, and the page hides while orcad is still starting

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

### WR-01: A stuck boot with no offer file, or with a non-private bridge folder, never shows a failure page

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

### WR-02: Reconnect after a failed bundle boot reports success and removes the page

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

### WR-03: The offer's endpoint is checked against a port taken from the same file, not orcad's port

**File:** `theia/extensions/orca-panes/src/node/offer-file-policy.ts:187-201` (caller `orca-panes-backend-module.ts:194`)
**Issue:** P67-09 requires refusing an offer "whose endpoint is not `ws://127.0.0.1:<orca port>`". `offerEndpointVerdict(offer, offerPortOf(pairing))` takes the expected port from the web-client URL in the same file that supplies the endpoint. Anyone able to write that file sets both values consistently, so the equality test binds nothing. For a bare offer (not a URL), `offerPortOf` returns `undefined` and any loopback port from 1024 to 32767 is accepted. The check therefore only enforces the loopback host and port range. It never checks that the offer targets the orcad PowerBrowser launched, which is the point of the threat (T-67-13: redirecting the client to another local listener).
**Fix:** Give the backend orcad's real port from a source the offer file does not control, for example a `POWERBROWSER_ENV` value captured at sidecar start, or `powerbrowser.orca.port` passed through the token-gate env, or a separate private bridge file written by OrcaService. Pass that port as the second argument instead of `offerPortOf(pairing)`. Refuse when it is unknown on POSIX.

### WR-04: A successful Reconnect never clears chrome's pairing-failure reason, so diagnostics stay stale

**File:** `theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts:207, 257-258, 312`
**Issue:** `reportClientReason` sends each pairing reason to chrome, which stores it in `OrcaService._clientReason`. Chrome clears it only on orcad's next ready line or, for the browser-host reason only, on the `browserHost: 'attached'` clearing form (OrcaService.sys.mjs:535, 736-752). When the frontend recovers (repair succeeds at line 207, the client verifies again at line 258, or the offer file becomes valid at line 312), it clears only its own `clientReason` and sends nothing. The diagnostics layer keeps the row "Orca pairing failure: unauthorized" (or `offer-mode` and so on; OrcaService.sys.mjs:772-775) for the rest of that orcad's life, which reports a failure that has ended. The handler also has no clearing form for pairing reasons: `handleOrcaShellMessage` accepts only `browserHost: 'attached'` as a clear.
**Fix:** Add a clearing form for pairing reasons (for example `{ kind: 'orcaStatus', clientReason: null }` accepted by `handleOrcaShellMessage`, which calls a new `OrcaService.clientRecovered()` that clears any non-browser-host `_clientReason`). Send it from `setClientReason(undefined)` whenever the previous reason was set.

## Info

### IN-01: The `restarting` sentence says "This tab" but also renders in side-panel parts

**File:** `theia/extensions/orca-panes/src/browser/failure/orca-failure-copy.ts:32`
**Issue:** `OrcaFailurePage` is mounted by `OrcaSideViewWidget` (orca-side-view-widget.tsx:96) as well as `OrcaPaneWidget`. A side-panel part is not a tab, so the sentence "This tab comes back when it is ready" is inaccurate there.
**Fix:** Use neutral wording such as "Orca comes back here when it is ready; open Details if it doesn't." Keep the copy check's derived expectation in step.

### IN-02: Every hosted view announces the same sentence through its own aria-live region

**File:** `theia/extensions/orca-panes/src/browser/failure/orca-failure-page.tsx:42`
**Issue:** Each hosted tab and each side part mounts its own `aria-live='polite'` region with the same text. A class change makes a screen reader announce the sentence once per attached view, including views hidden behind other tabs that are still in the DOM.
**Fix:** Set `aria-live` only on the page in the active or visible widget, or announce through one shared live region owned by `OrcaHostingStatus`.

### IN-03: The offer-file mode rule differs from the sibling bridge-file rule

**File:** `theia/extensions/orca-panes/src/node/offer-file-policy.ts:64`
**Issue:** `offerFileVerdict` accepts any owner-only mode (0400, 0500, 0700, and write-only 0200, which then fails to read and is reported as `offer-unreadable`). `privateFileVerdict` in orca-panes-backend-module.ts:81 requires exactly 0600 for `orca-panes-dir` in the same folder. `writePrivateFile` always writes 0600 (P67-33). Two rules for the same holder make it harder to see which one a check asserts.
**Fix:** Either require `(stat.mode & 0o777) === 0o600` here, or record in the doc comment why the looser rule is intended.

### IN-04: Impossible-state guard: the try/catch around `dispatchEvent` cannot fire

**File:** `theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts:351-355`
**Category:** necessity
**Issue:** `document.dispatchEvent` throws only for an uninitialised event or one already being dispatched. A newly constructed `CustomEvent` is neither, and exceptions thrown by listeners are reported to the console, not rethrown to the dispatcher (DOM dispatch semantics). The `settle('no-chrome')` branch cannot be reached, so a missing chrome listener ends in the 5 s timeout, not `'no-chrome'`. This rests on DOM semantics rather than repository evidence, so it is Info.
**Fix:** Remove the try/catch, or replace it with a comment saying that an absent chrome is detected by the acknowledgement timeout.

---

_Reviewed: 2026-11-20T22:44:56Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
