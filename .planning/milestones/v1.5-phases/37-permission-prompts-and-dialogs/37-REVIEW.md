---
phase: 37-permission-prompts-and-dialogs
reviewed: 2026-11-01T00:00:00Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - powerbrowser/shell/powerbrowser.js
  - powerbrowser/shell/powerbrowser.xhtml
  - scripts/check-internals-boundary.sh
  - scripts/verify-permission-prompts.mjs
  - scripts/verify-platform.sh
  - scripts/verify-prompts-live.mjs
  - scripts/verify-shell-error-contract.mjs
  - scripts/verify-shell-error-copy.mjs
  - scripts/verify-shell-gbrowser-standin.mjs
  - scripts/verify-web-tab-bridge.mjs
  - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar.css
  - theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx
  - theia/extensions/tab-uris/src/browser/web-tab.css
  - theia/extensions/tab-uris/src/browser/web-tab.ts
findings:
  critical: 2
  warning: 7
  info: 4
  total: 13
status: issues_found
---

# Phase 37: Code Review Report

**Reviewed:** 2026-11-01
**Depth:** deep
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Scope: the files the lane commits changed (`git diff --name-only 23c08bb5 83083c8b -- powerbrowser scripts theia`), read as they exist at `1fd843af`, plus `1fd843af` itself. Every file was read from the pinned commit with `git show` or `git archive`; nothing was read from the working tree. Line numbers below are at `1fd843af`. These upstream callees were read where a finding depends on them: `PopupNotifications.sys.mjs`, `PermissionUI.sys.mjs`, `WebRTCParent.sys.mjs`, `webrtcUI.sys.mjs`, `tabbrowser.js` (`updateBrowserSharing`), `browser.js` (onLocationChange), `PopupAndRedirectBlockingParent/Child.sys.mjs`, `WebProtocolHandlerRegistrar.sys.mjs`, `LoginManagerPrompter.sys.mjs`, `CustomElementRegistry.cpp` and `AppWindow.cpp`.

The answer route follows the owner ruling. No `webTab*` kind answers a permission prompt. The `doorhanger` push is display-only, and its subscriber sends nothing back. No allow, grant or permit kind exists. The only new answer kind is `webTabBarAction`. It resolves a chrome-held record by token, requires that record to belong to the sender's own frame and tab, accepts only the action set of that bar's kind, and reads no URL, origin or principal from the frame. No credential reaches a push or a log: the stock prompter fills and reads its own template fields. At the pinned tree, `verify-permission-prompts` passes (the self-test plants 52 faults and all go red), as do `check-internals-boundary` (plain and `--catalogue`) and `verify-web-tab-bridge`.

The main defect comes from the merge with Phase 36, not from either lane alone. The prompt facade's "selected tab" is the tab host's selection. Adopted tabs never get a tab-host node (`tabHostAddTab` has one call site, inside `webTabOpen`'s non-pending branch). Adopted tabs are Phase 36's new-window tabs and the popups Phase 37's own bar Allow opens. As a result:

- an adopted tab's prompts never show;
- another tab's prompt can show over an adopted tab;
- navigation and close cleanup never run for adopted tabs.

The second blocker is in the sharing indicator. A geolocation or XR state report from PermissionUI arrives through the same `updateBrowserSharing` member and is read as "nothing shared", so the camera and microphone marks go out while a track is live.

Other problems:

- pushes that arrive while an overlay is still pending (`pc-<n>`) are dropped, which is the open item the merge agent recorded;
- the sharing state is never reset on navigation;
- prompts the stock module shows pre-dismissed are stranded behind a false "Open the tab to answer it" mark;
- the blocked-popup Allow drops `window.opener`;
- probe 1's `relayFeasible` measurement cannot return false.

No Phase 37 live scenario has run on a built binary. Every SUMMARY records `live_proof: deferred`, so none of the stock-module behaviour below has been exercised.

## Fix outcome

Scope: CR-01, CR-02 and WR-01 to WR-07. Info findings are not in scope.

| Finding | Outcome | Commit | Proof |
|---|---|---|---|
| CR-01 | Fixed, needs live check. Preferred approach taken: `adoptPendingOverlay` calls `tabHostAddTab(win, tabId, pending.browser, pending.opener)` after `webTabAttach`, so adopted tabs are host nodes. Prompts, bars, favicon, F12, WebDriver and extensions all see them, and TabSelect, TabClose and `attachProgress` now drive navigation and close clearing. `tabHostAddTab` takes an optional opener browser for `openerTab`, which is cleared when the opener closes. `promptVisibleTab` also requires the host selection to be the current tab's node. Closes 36-02's deferred tab-host item. | `b33f8953` | `verify-ext-tab-host-scope` rule (a) admits one call in `webTabOpen` and one in `adoptPendingOverlay` on the `pendingContent` record's browser. 2 new plants; 26 plants red, plain run green. `verify-permission-prompts` rule (ae) has 2 plants (`7b104dbc`). Live: not run. |
| CR-02 | Fixed, needs live check. `updateWebTabSharing` merges each report into a per-overlay state, as `tabbrowser.js:2193-2198` does with `_sharingState`. Only a report carrying `webRTC` moves the marks. | `9aee3790` | `verify-permission-prompts` rule (ab) runs the sharing functions against stub maps. A `{ geo }` or `{ xr }` report after a camera report must not push the camera mark off. The plant goes red. Live: not run. |
| WR-01 | Fixed, needs live check. `isPendingOverlay` keeps prompt, bar, hung-script, protocol and sharing records for a `pc-<n>` overlay with a null tab id. `adoptPendingOverlay` → `adoptPendingPushes` gives those records the tab id and pushes them, pushes the merged sharing state through `resendWebTabSharing`, and re-reads blocked popups. `adoptFallback` drops the kept records. The stale comment is fixed. | `badf1036` | Rule (ab) pending-overlay scenario and rule (ac). Rule (i) accepts the per-browser cap filter. 2 plants. Live: not run. |
| WR-02 | Fixed, needs live check. The navigation listener calls `resetWebTabSharing` after `notifications.locationChange`, as `browser.js:2977-2983` does. | `5ffef72e` | Rule (ab): a reset after a camera report must push all marks off, and the listener must call it. 2 plants. Live: not run. |
| WR-03 | Fixed. A show with `options.dismissed` takes the stock path before any record exists. It stays invisible, as in a chromeless stock window. It is not counted toward the cap and gets no "Open the tab to answer it" mark. The shell has no anchor icon, so no real affordance exists for it. | `657f0a4b` | Rule (ad) and 1 plant. |
| WR-04 | Fixed, needs live check. The Allow calls the stock replay `popupAndRedirectBlocker.unblockPopup(browsingContext, innerWindowId, reportIndex)`, so Phase 36 adopts the page's own `window.open` with `window.opener` intact. The wall admits http(s) and an empty URL, so the about:blank case is no longer dropped. The popup leaves the list only after the replay is sent. No principal is stored; `openAdoptedWebTab` had no remaining caller and was removed. Recorded in 37-04-SUMMARY. | `22d02c9c` | Rule (x) rewritten with 3 plants. INTERNAL-APIS row added. The popup-block scenario now requires `browsingContext.opener` (`7b104dbc`). Live: not run. |
| WR-05 | Fixed. Probe 1 opens an adopted tab, and `relayFeasibleFrom` reads the relay's real preconditions: every host and adopted tab has a `getTabForBrowser` node, and the auth branch needs no widening. Each of those can be false, and the reason is recorded as `relayWhy`. The provisional verdict expires: `--require-live-verdict` is red while the verdict is provisional. It is registered as the full-set row `prompt-probe-verdict-live`, so `--gate` at the end-of-milestone pass fails until the live dialog-probe run supersedes the verdict. | `d9c8c3a1` | Static self-test: 3 fact-set plants must make the verdict false. The `verify-permission-prompts` expiry plant goes red. |
| WR-06 | Fixed. Rows added for the `chromehidden` write, the `notifications.remove` eviction, `anchorVisibilityChange` and `contentPrincipal.asciiHost`. `setAttribute("chromehidden"` and `anchorVisibilityChange` are added to `FORBIDDEN_PATTERNS`. | `652c06d5` | `check-internals-boundary.sh` plain, `--catalogue` and `--self-test` all PASS. `verify-ng-040-internals-catalogue-lines.mjs` normal mode PASS. Removing the two rows makes `--catalogue` name both lines. Lines were renumbered from exact `git diff -U0` hunks, never `--fix`. |
| WR-07 | Fixed. `allow-loads-frame-url` replaces the opener's `unblockPopup`, the call the Allow makes. `adopt-next-to-opener-failed` makes the frontend's `addWidget` drop the tab-after reference. The adopted-prompt plants are static (rule (ae)), and so are the camera-then-geo plants (rule (ab)). The remaining live checks are listed in the `verify-prompts-live.mjs` header for the end-of-milestone pass. | `7b104dbc` | `verify-prompts-live --self-test --static` PASS (21 plants). The live plant sessions have not run. |

## Critical Issues

### CR-01: The prompt facade's selection ignores adopted tabs, so their prompts never show and another tab's prompt shows over them

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7096-7105`, `:7172-7174`, `:7180-7189`, `:7155`, `:7314`, `:7322`, `:3346`, `:7034-7051`

**Issue:** `promptTabbrowser.selectedBrowser` returns `host.selected.linkedBrowser` whenever the Theia frame reports a web tab current (`promptVisibleTab`). `host.selected` is always a tab-host node. Adopted tabs never have one. `adoptPendingOverlay` calls `webTabAttach` only, and `verify-ext-tab-host-scope.mjs` (a) pins `tabHostAddTab` to its one call inside `webTabOpen`. `powerbrowser.js` states it too: "Adopted tabs do not yet enter the Phase 31.1 tab host." So when the user activates an adopted tab C, `tabHostSelectById` finds no node and `host.selected` stays the previously selected host tab A, which is now hidden. Upstream's `_isActiveBrowser` compares `selectedBrowser.frameLoader` (`PopupNotifications.sys.mjs:1632-1652`). The consequences:

1. **C's prompts never show.** C is never `selectedBrowser`, so every request from C queues and the strip says "Open the tab to answer it". Opening the tab changes nothing.
2. **A's prompt shows while the user looks at C.** IDE → C runs `anchorVisibilityChange` (`:7186`), which shows A's waiting prompts, anchored at A's last rect over C's page. A → C sends no TabSelect, because C has no node, and `setActiveTabOfFrame` refreshes only on an IDE↔web change. A panel that is already open for A therefore stays open over C. Either way the user answers a prompt for a page they cannot see. That breaks the D-04 truth ("no prompt shows over a page the user is not looking at") and invites a grant to the wrong page.
3. **No navigation cleanup.** The `locationChange` listener (`:7155`) and the bar listener (`:7314`) sit on `host.progressListeners`, which only `attachProgress` feeds, and only for host nodes. On an adopted tab, a previous page's prompts and bars survive a navigation. The blocked-popup bar would then still offer to open the previous document's stored popup while the user is on a different site. The refused-handler set is not cleared either.
4. **No close cleanup.** The stock module's TabClose listener and `hideBars` (`:7322`) never fire for an adopted tab. `promptRecords` and `barRecords` keep the removed `<browser>` alive, and no `pending:false` push is sent.

The blocked-popup Allow (`openBlockedPopup`, `:7492`) always produces an adopted tab, so Phase 37's own feature creates tabs that cannot be prompted. The facade audit (`verify-shell-gbrowser-standin.mjs` FACADES) compares member names only. No live scenario opens a prompt from an adopted tab.

**Fix:** Derive the visible overlay from chrome's tab registry rather than from the host node, and refresh on every activation change. Hang the navigation cleanup on the per-entry listener every tab has, and drop records in `webTabClose`:

```js
function promptVisibleBrowser(host) {
  const tabId = activeTabByFrame.get(host.theiaBrowser) ?? null;
  return tabId === null ? null : webTabs.get(tabId)?.browser ?? null;
}
// facade
get selectedBrowser() { return promptVisibleBrowser(host) ?? host.theiaBrowser; },
get selectedTab() { const b = promptVisibleBrowser(host); return b ? host.byBrowser.get(b) ?? null : null; },
// setActiveTabOfFrame: refresh whenever the id changes, not only on IDE<->web
if (notifications && previous !== tabId) { win.setTimeout(() => notifications.anchorVisibilityChange(), 0); }
```

Call `notifications.locationChange(browser)`, `hideBars(browser)` and `refusedHandlers.delete(browser)` from `webTabAttach`'s `entry.listener.onLocationChange`, for non-same-document top-level changes. In `webTabClose`, before `browser.remove()`, remove that browser's notifications with `notifications.remove(getNotificationsForBrowser(browser), true)` and call `hideBars(browser)`. Add a live row in which an adopted tab raises a geolocation prompt that must appear while the tab is current and must not appear while a host tab is current.

### CR-02: A geolocation or XR state update turns the camera and microphone indicator off while a track is live

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7244-7253`, `powerbrowser/shell/powerbrowser.js:120-124`

**Issue:** The shell's `gBrowser.updateBrowserSharing` is reached by more than WebRTCParent. `PermissionUI.sys.mjs:976-982` (`#updateGeoSharing`) calls `gBrowser.updateBrowserSharing(this.browser, { geo: state })`, and `:1099` does the same with `{ xr: state }`. `updateWebTabSharing` reads `const webRTC = (sharingState && sharingState.webRTC) || {}`, so a `{ geo: true }` call becomes camera, microphone and screen all false. If the tab is sharing its camera, the key changes from `true/false/false` to `false/false/false` and a `sharingChanged` push turns every mark off while the camera is live. Upstream merges partial states (`Object.assign(aBrowser._sharingState, aState)`) and touches the WebRTC attribute only when `"webRTC" in aState` (`tabbrowser.js:2196-2198`). The trigger is ordinary: a video-call page that also asks for location, and the user clicks Allow. The privacy indicator then says nothing is shared while the camera is on. Gate rule (n) checks where the push comes from, not what the state means, so it cannot see this.

**Fix:**

```js
export function updateWebTabSharing(browser, sharingState) {
  if (!sharingState || !("webRTC" in sharingState)) {
    return; // geo / xr updates carry no camera, microphone or screen state
  }
  ...
}
```

Add a gate plant (a `{ geo: true }` call after a camera push must not produce an all-false push) and a live row (camera live, then a location grant, and the camera mark stays).

## Warnings

### WR-01: Pushes for an overlay that is still pending (`pc-<n>`) are dropped, and the sharing re-push the comment promises never happens

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7244-7247`, `:7256`, `:7034-7051`, `:7328-7339`, `:7546-7554`, `:7575-7578`, `:7113-7115`

**Issue:** Between `createPendingOverlay` and the `webTabAdopt` ack (up to 5 s), the overlay is not in `webTabs`, so `tabIdOfBrowser` returns null for it. In that window:

- **Sharing.** `updateWebTabSharing` returns before anything is stored in `sharingSent`, so there is nothing to re-push later. A site with a remembered camera grant that starts its camera at load gets no indicator until its next state change. The comment at `:7256` says "adoptTab calls this too", but `adoptPendingOverlay` never calls `resendWebTabSharing`, and the comment's "no hook in this tree yet" has been false since the Phase 36 merge.
- **Bars.** `setBar` finds no host and stores nothing. A blocked-popup bar recovers at the next block event. A hung-script bar does not: `hungOverlay` iterates `webTabs`, so the report is dropped.
- **Protocol registration.** The registrar wrap sends the call down the stock path, which throws on `getNotificationBox` for an overlay, so the page's request is lost.
- **Prompts.** `notifications.show` takes the record-less stock path: no anchor attribute, no queue cap, no `doorhanger` push.

**Fix:** In `adoptPendingOverlay`, after `webTabAttach`, call `resendWebTabSharing(tabId)` and `showBlockedPopupBar(host, pending.browser)`. Make `updateWebTabSharing` record state for a pending overlay: key `sharingSent` by browser before the tab-id check, and push only when a tab id exists. Make `hungOverlay` also walk `pendingContent`, and keep its report so it is shown at attach. For prompts and protocol registrations, either treat a pending overlay as a background tab with a deferred tab id, or document the window as an accepted gap with a live row that measures it. Fix the comment at `:7256`.

### WR-02: The sharing indicator is never reset when the page navigates away

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7155-7161`, `:7244-7279`

**Issue:** Stock `browser.js` onLocationChange runs `PopupNotifications.locationChange(aBrowser)` and, right after it, `gBrowser.resetBrowserSharing(aBrowser)` (`browser.js:2977-2983`). Navigation does not reliably produce a final `updateIndicators` call: `WebRTCParent.didDestroy` only calls `webrtcUI.forgetStreamsFromBrowserContext` (`WebRTCParent.sys.mjs:23-32`, `webrtcUI.sys.mjs:501-526`), which does not call `updateBrowserSharing`. The Phase 37 listener ports the first call and not the second, so a tab that shared its camera and then navigated can keep the Theia camera mark lit on the next page. This is inferred from the upstream source; no live row covers it.

**Fix:** In the same top-level non-same-document branch (after the CR-01 move, `entry.listener.onLocationChange`), push the all-false state when the last sent state was not all-false: `pushWebTabSharing(browser, tabId, host, { camera: false, microphone: false, screen: false }, false)`. Add a live row: share the camera, navigate, and require a `sharingChanged` push with all false.

### WR-03: Notifications the stock module shows pre-dismissed are stranded behind a false "Open the tab to answer it" mark

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7108`, `:7140-7151`, `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts:71`

**Issue:** The furniture constructs `PopupNotifications` with `iconBox` null, so the shell has no anchor icon. Upstream shows some notifications dismissed, and a dismissed notification can be opened only from its anchor icon. `_update` filters out dismissed non-persistent notifications (`PopupNotifications.sys.mjs:1485-1490`). Two such cases are common:

- the desktop-notification post-prompt, shown dismissed and non-persistent (`PermissionUI.sys.mjs:521-529`, `:686-690`, `:722-723`) whenever a page asks without a user gesture;
- password-capture doorhangers shown dismissed, in private windows and for unchanged or autosaved logins (`LoginManagerPrompter.sys.mjs:117-129`, `:758-787`).

The wrapper marks these `queued` (no "showing" ever arrives), pushes `pending: true`, and counts them toward the per-tab cap of 3. The strip then shows the bell with "This page asked for a permission. Open the tab to answer it." Opening the tab never shows them, so the mark stays until the page navigates. That is a false affordance under the user-facing copy rule (the next step must be a real affordance). It can also push a real prompt out of the queue.

**Fix:** In the `show` wrapper, when `options.dismissed` is true, do not create a queued record and do not push. Either take the stock path unchanged, so the notification is invisible as it would be in a chromeless stock window, or remove it at once with `notifications.remove(n, true)` so PermissionUI's cancel and the prompter's own fallbacks run. Add a gate rule or plant asserting that a dismissed show creates no `pending: true` push.

### WR-04: The blocked-popup Allow loses `window.opener`, so sign-in and payment popups do not work

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7420-7436`, `:7492-7497`, `:7380-7382`

**Issue:** Stock unblock replays the page's own call: `PopupAndRedirectBlockingParent.unblockPopup` (`:164-172`) has the child run `requestingWindow.open(spec, name, features)` (`PopupAndRedirectBlockingChild.sys.mjs:117-127`). The popup therefore keeps its opener, its window name and its features. In this shell, Phase 36's `adoptContentWindow` would adopt that replay as a web tab with `openWindowInfo`. `openBlockedPopup` instead loads the spec into a fresh adopted tab through `adoptLinkIn`, which has no `openWindowInfo`, so `window.opener` is null. OAuth and payment popups that report back through `window.opener.postMessage` are the main reason a user clicks Allow, and they fail. A second, smaller problem: `allow-popup` shifts the popup off the list and marks it opened before the http(s) wall (`:7421-7428`). A blocked `window.open()` with no URL (`about:blank`) therefore disappears with a log line and no visible result.

**Fix:** Answer Allow with the stock replay on the stored identifiers: `record.browser.popupAndRedirectBlocker.unblockPopup(popup.browsingContext, popup.innerWindowId, popup.reportIndex)`. Phase 36's receivers then adopt the result, with its opener, next to the opener tab. Keep the http(s) wall as a pre-check on `popup.spec`, or rely on `createPendingOverlay`'s wall. Remove the popup from the list only after the replay has been sent. This also removes the need to store a principal. If the D-12 design must keep `openAdoptedWebTab`, record the lost opener as an accepted limitation in D-12 and in the bar copy row.

### WR-05: Probe 1's `relayFeasible` cannot return false, so rule (p)'s "route to Chris" branch cannot be reached

**File:** `scripts/verify-prompts-live.mjs:676-678`, `:833-856`, `scripts/verify-permission-prompts.mjs:293-340`

**Issue:** `tabBranchReachable` returns `typeof gBrowser.getTabForBrowser === 'function' && 'selectedBrowser' in gBrowser`. Both members have existed on the shell stand-in since Phase 31.1 (`powerbrowser.js` `window.gBrowser`), so a live `stock-blocks-ide` verdict always records `relayFeasible: true`. The rule (p) branch "relayFeasible false → PROMPT-03 cannot be met as written; route to Chris" therefore cannot be reached from a live run, and the owner decision the probe exists to inform is answered by construction. The measurement also ignores the tab-dialog branch's real dependency: `getTabForBrowser` returns null for every adopted tab (CR-01), which a relay keyed on it would also miss. Separately, the gate accepts the provisional `stock-keeps-ide-usable` default, although 37-03-SUMMARY's Risk section predicts from upstream (`AppWindow.cpp:460` `EnableParent(false)`, `PromptParent.sys.mjs:301-306` `modal`) that the live verdict will flip. Until it does, a hidden web tab's `alert()` disables the whole shell window, the IDE included.

**Fix:** Measure the relay's real preconditions. For a host tab and an adopted tab, require `getTabForBrowser(overlay)` to return a node, and require the tab-dialog-box call sites PromptParent reaches (`PromptParent.sys.mjs:222-224`) to be satisfiable without a Pitfall-2 widening. Add a self-test plant that makes the measurement return false and requires the "route to Chris" failure. Give the provisional verdict an expiry: for example, make rule (p) name the end-of-milestone pass and go red under `--gate` while `provisional` is true.

### WR-06: New Firefox-internal touchpoints have no INTERNAL-APIS.md row

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7088-7090`, `:7149`, `:7186`, `:7214`

**Issue:** The boundary rule is that every Firefox touchpoint is catalogued. `--catalogue` passes because it checks forbidden-pattern lines only. These Phase 37 reaches are not catalogued:

- the write of the `chromehidden` attribute on the shell's document element (`:7088-7090`), which AppWindow owns (`AppWindow.cpp:2310-2354`) and which `PopupNotifications` reads to set `followanchor`;
- the direct call to the stock module's `anchorVisibilityChange` (`:7186`), added post-review in `0584e5dd`;
- `notifications.remove(..., true)` as the eviction path (`:7149`), which depends on PermissionUI cancelling when `withoutUserResponse` is set (`PermissionUI.sys.mjs:712-716`);
- `browser.contentPrincipal.asciiHost` (`:7214`).

`grep -c` over INTERNAL-APIS.md finds 0 rows for `anchorVisibilityChange`, `chromehidden` and `asciiHost` in this section.

**Fix:** Add one row each, with the upstream line each depends on, and add `anchorVisibilityChange` and `setAttribute("chromehidden"` to the gate's catalogue derivation, so the next unrecorded reach goes red.

### WR-07: Two popup-block plants simulate a symptom instead of planting a fault, and no scenario covers adopted tabs

**File:** `scripts/verify-prompts-live.mjs:1127-1130`, `:1135-1139`, `:1282`, `:1284`

**Issue:** `allow-loads-frame-url` does not make Allow take a frame URL. It opens a tab at `/e` itself, then checks that no tab is at `/e`. `adopt-next-to-opener-failed` moves the tab with `ApplicationShell` itself. Both prove only that the detector reads the tab order. Neither can show that the scenario would catch a real regression in `openBlockedPopup` or in the adoption path. CLAUDE.md asks for plants that plant faults. Neither the prompt scenarios nor the bar scenarios include an adopted tab (CR-01, WR-01), and the camera scenario never combines sharing with a location grant (CR-02).

**Fix:** Plant faults in chrome. For example, replace `openBlockedPopup` in the running module with one that opens a fixed URL, and replace the adoption with `openStockTab`. Require each plant to go red. Add `adopted-prompt`, `adopted-bar-navigate` and `camera-then-geo` scenarios.

## Info

### IN-01: The `doorhanger` push carries a `displayHost` that nothing reads

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7207-7217`, `theia/extensions/tab-uris/src/browser/web-tab.ts:488-503`

**Issue:** The subscriber reads only `tabId`, `token` and `pending`. The field is also the top-level document's host, not the host of the requesting principal, which is what the stock prompt names. A request from an embedded iframe (`allow="camera"`) would be labelled with the wrong host if the field were ever shown.

**Fix:** Drop the field, or compute it from the request's principal before anything renders it.

### IN-02: A reloaded frontend loses the pending-prompt marks

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7257-7266`

**Issue:** `resendWebTabSharing` re-pushes bars and sharing to a frontend that registers an overlay again, but not the `doorhanger` state, so waiting prompts lose their bell.

**Fix:** In `resendWebTabSharing`, re-push `pushDoorhanger(record, true)` for each `promptRecords` entry of that tab.

### IN-03: The pending mark's copy says "permission" for password save, and shows on the tab that is already open

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts:71`, `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:663-669`

**Issue:** `password` notifications go through the same record path, so a save offer is described as a permission request. A prompt that is showing on the current tab keeps the mark with "Open the tab to answer it".

**Fix:** Use a kind-neutral line ("This page is waiting for your answer."), or derive the copy from the notification id class. Hide the mark on the current tab while its prompt is shown.

### IN-04: The D-04 cap counts only records that have never been shown, and blocked-popup reads can resolve out of order

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7146`, `:7373-7391`

**Issue:** A record that was shown once and then hidden by a tab or IDE switch has `queued` false and no longer counts, so "three waiting per tab" is not what is enforced. Separately, `showBlockedPopupBar` awaits `getBlockedPopups()` for each event, so two quick block events can resolve in reverse order and the older list overwrites the newer one.

**Fix:** Count every record of the tab that has not been answered and is not currently visible. Use a per-browser sequence number in `showBlockedPopupBar` and drop stale resolutions.

---

_Reviewed: 2026-11-01_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
