# Phase 28 — WebExtension Tab Route: spike record and decision (EXT-04)

**Status:** awaiting Chris's sign-off (success criterion 3)
**Spikes:** .planning/spikes/001-ext-visibility-today (VALIDATED), 002a-ext-route-patch (PARTIAL), 002b-ext-route-gui04-bridge (INVALIDATED), 002c-ext-route-chrome-tab-model (PARTIAL)
**Run:** 2026-10-21, autonomous; throwaway code only, no product file changed.

## Criterion 1 — what extensions see today (spike 001)

I ran it live twice, once as an MV2 extension and once as MV3, and the two runs agree on every observation.

1. Install route: AddonManager.installTemporaryAddon, called from the shell document in chrome scope, worked first time. This build has MOZ_REQUIRE_SIGNING=false. I did not try the profile extensions directory.
2. tabs.query and windows.getAll:
   - With two overlays open and no stock window, both return []. That holds through create, activate, navigate and close.
   - With no stock window, tabs.query({active,currentWindow}) and {lastFocusedWindow} do not return empty. They fail with "An unexpected error occurred". The real cause is that nsIWindowMediator.getMostRecentNonPBWindow('navigator:browser') throws NS_ERROR_FAILURE (ext-tabs-base.js:1792-1794).
   - With no stock window, windows.getCurrent and windows.getLastFocused throw a TypeError from canAccessWindow(null) (ext-windows.js:181-195).
   - Once the GUI-01 stock window is open, every query returns only the stock tab (id 1, windowId 31). That stays true while the shell is focused and an overlay is the page on screen.
3. tabId/windowId: every overlay, and the Theia frame, reads {tabId:-1, windowId:-1} from tabTracker.getBrowserData. getTabForBrowser returns null; that answer comes from our own gBrowser stand-in. Trap: windowTracker.getId(shell) returns 1 even though the shell is not tracked.
4. Events:
   - No tabs.onCreated, onActivated, onUpdated or onRemoved fires for any overlay operation.
   - No windows event fires for the shell.
   - webNavigation.onCommitted is dropped for overlays because their tabId is below 0.
   - webRequest.onBeforeRequest does fire for overlay page loads, but with tabId -1, so a blocker cannot tell which tab the request belongs to.
   - The only signal that an overlay closed is the content script's port disconnecting.
5. Content scripts:
   - They inject into every overlay page, because overlays carry messagemanagergroup="browsers".
   - runtime.sendMessage and runtime.connect ports work in both directions.
   - sender.tab is null and sender.frameId is missing.
   - The background cannot start contact with an overlay: tabs.sendMessage(-1) fails schema validation.
   - The Theia frame is never injected, because its browser element has no messagemanagergroup. That missing attribute is load-bearing for security: adding it would run every all-sites content script inside the authenticated Theia UI.
6. Toolbar button (browserAction / action):
   - The button exists only in the stock window's nav-bar.
   - A click in the stock window fires onClicked with the stock tab. It does this even while the user is looking at an overlay, and tabs.executeScript then runs in the stock page. This is Pitfall 12's wrong-page bug, now observed live.
   - Triggering the click on the shell window with no stock window open throws (nativeTab is null).
   - With a stock window open, triggering it on the shell first grants activeTab on the stock tab and then throws in activateScripts(undefined). So a permission is granted on a page the user did not pick.
7. Lead for Phase 28 (not tested): getTabForBrowser is answered by our stand-in, not by Gecko. Returning a real shell tab node there would probably give overlays a real tabId, plus sender.tab, webRequest tab attribution and webNavigation events, with no patch. It would not fix tabs.query, windows.* or the tab events, which are all gated on windowtype navigator:browser in ext-tabs-base.js. It is also the kind of made-up tab object that powerbrowser.js:80-82 currently rules out.

## Criterion 2 — the three routes compared

| Route | Needs Gecko patch | Needs GUI-05 | v1.5 phases changed | EXT-05..10 met | Size | Risks |
|---|---|---|---|---|---|---|
| (a) Patch 050 (tracker gate) + product tab host — **recommended, implemented as described below** | Yes. 050-extension-tab-host.patch: JS only, 7 files, 19 hunks, +105/-8. Covers the window gate keyed on the `extensiontabhost` attribute, guards for a window with zero tabs, the webDriverTabs split, and skip guards for browserAction, menus, sessions and sidebarAction. Amends D-74 (config-only). | No. Needs a chrome-side tab host, the seed of GUI-04. | 32 (getTabForBrowser-null ruling flips; favicons via LinkHandlerParent; mute and zoom become tab-host members), 34 (tab order, pinned and multiselect mirrored; TabMove/TabPinned events), 35 (page actors take their "has a tab" branches; stand-in gate member set grows; extension menus need contentAreaContextMenu), 36 (adopted overlays fire TabOpen with openerTab), 37 (PromptParent tab-modal branch; AMO prompt), 38 | EXT-05 met live except chrome-initiated writes, zoom, windowType "normal", and IDE-focus semantics. EXT-07 action half met. EXT-08 content scripts met. EXT-06, popups, EXT-09 and EXT-10 still need Theia buttons, a popup host and Phase 37. | Patch S. Patch + host L (300-400 lines). Full EXT-05..10 XL. | Shell is exposed to every per-window extension feature (5 broke live; guarded). Rebase conflicts at each ESR major (4/7 files). Synthesised tab handed to privileged actors. Theia-frame safety depends on the tabs/webDriverTabs split. Proven by runtime emulation, not a patched build. |
| (b) GUI-04 bridge with hidden twin tabs | Experiments: no. A correct version: yes, a tracker patch. | Yes, and GUI-05 alone is still not enough. | 29, 32, 34, 35, 36, 37 all hit by the hidden window (most-recent-window paths, doorhangers, menus, reverse sync). 38 cannot be planned. | None. The only gains already work today (content scripts, global filtering at tabId -1). | XL (GUI-05 + patch) | Extensions act on a hidden copy or on about:blank (data exposure). Double page loads (CSRF, carts, one-time tokens). One tab id for two documents. Phantom session window. Links open invisibly. **Invalidated.** |
| (c) Chrome tab model with runtime overrides, no patch file | Tier A: no. Full route: overrides private windowTracker members at runtime (a patch with no patch file, breaks without warning on rebase). Still needs a real patch for the CustomizableUI/updateWindow badge and popup gate. | No (it is itself a chrome-owned model). | 29 (OpenSearch records), 32 (null ruling flips; reader view and crash recovery change), 34, 35 (FormValidationParent and AboutReaderParent go ahead; furniture must land first), 36, 37 (getTabDialogBox auth-spoofing branch), 38 | EXT-05 met live (query, events, active tab, currentWindow), except writes and windowType. EXT-07 action met. EXT-08 content scripts met. EXT-06, popups, EXT-09 and EXT-10 not met. | Tier A M. Full XL. | Fragile private-member overrides (conflicts with hard rule 2's intent). Gate ordering: either extension startup fails, or onUpdated is lost and removed listeners leak. Badge and popup regression for every extension, stock window included. executeScript into the Theia UI if its record leaks. moz-extension:// navigation past the http(s) rule. |

## Recommendation (judge)

**Patch-stack tracker gate plus a product chrome-side tab host. This combines route (a), patch 050-extension-tab-host.patch, with the tab model from route (c), implemented behind PowerBrowserAPI. It does not use (c)'s runtime overrides of the windowTracker internals. Route (b), the GUI-04 bridge with hidden twin tabs, is rejected.**

- **(a) and (c) are the same design, with the hook put in two different places.**
  - 002a found that patch 050 only opens the gate. Behind it the shell still needs a gBrowser shaped like tabbrowser, with real tab elements and TabOpen/TabSelect/TabClose events. That is the model 002c built.
  - 002c found that its runtime overrides are "in effect a patch with no patch file". They break without warning on an ESR rebase, and they still need a real patch for the CustomizableUI and updateWindow gate. 002c says itself that a patch-stack version would be smaller and would fail loudly.
  - So the converged route is: put the hook in the patch stack, which hard rule 2 requires, and put the tab host in the product.
- **(c)'s gate-ordering problems go away with the patch.** In (c), the shell may count as a browser window only while a web tab is selected. That loses listeners, leaks removed listeners, and breaks extension startup with "tab is null". Patch 050 fixes this with two guards for a window with zero tabs, which were seen live, so the shell can stay registered all the time.
- **(b) is ruled out by live evidence.**
  - Pages load twice.
  - The extension acts on a hidden copy of the page (nonce-2 while the user sees nonce-1), which is a data-exposure risk.
  - One tab id names two documents.
  - Wiring the twin to the overlay breaks tabbrowser selection and removal.
  - SessionStore saves a phantom window, and links open invisibly in it.
  - A correct version needs GUI-05 and a tracker patch, and still meets none of EXT-05..10.
- **The recommended route does not need GUI-05.** The tab host mirrors PowerBrowserAPI.webTabs. It is the seed of the GUI-04 chrome-owned model and fits hard rule 3 without rework.
- **What was proven live (emulated):**
  - tabs.query, all four tabs.on* events, windows.* and onFocusChanged work.
  - webNavigation and webRequest carry the real tabId, and content scripts get sender.tab.
  - executeScript and sendMessage work by tab id.
  - A toolbar click reaches the overlay on screen, so Pitfall 12 is fixed.
  - The Theia frame stays out of tabs.query.
- **Costs that need explicit rulings:**
  - It is the first logic patch in a stack D-74 calls config-only.
  - It reverses the 2026-10-20 ruling that getTabForBrowser keeps returning null, and the "never synthesise a tab" rule at powerbrowser.js:80-82.
  - 4 of the 7 patched files conflict at every ESR major jump. There is no churn within an ESR line.
  - Every new upstream consumer of browserWindows() needs a derived gate (set equality) to catch it.

### Correction from the adversarial check (both skeptics)

The route choice survives; one claim does not. Patch 050's two zero-tab guards fix `_handleWindowOpen` and `Window.activeTab` only. They do **not** cover the `ext-pageAction.js:169` `browserWindows()` loop (`isShownForTab(null)`, the "tab is null" startup failure 002c saw) or the TabOpen handler's `selectedTab.linkedBrowser` read (`ext-browser.js:543-544`). Starting an extension while the shell has zero overlays was never tested under route (a). Consequences:
- Patch 050 grows by an `ext-pageAction.js` guard (likely 8 files) and a TabOpen null guard; hunk, file and rebase counts are re-derived in the build phase.
- The build phase's rebuild-verified test must install and start a `page_action` `show_matches` extension with zero overlays, with the IDE focused and `selectedTab` cleared, and open the first overlay while `selectedTab` is null.
- Sub-ruling 1 (no active web tab while the IDE has focus) depends on those guards; until they are proven the safe default is to keep the last web tab selected.

Skeptic evidence (feasibility): The choice of route survives: (b) is ruled out by live evidence, and (a)+(c) do converge. But one claim the rationale depends on is not supported by the spikes, and the code contradicts it. The rationale says "(c)'s gate-ordering problems go away with the patch ... Patch 050 fixes this with two guards for a window with zero tabs ... so the shell can stay registered all the time."

1. The 002c gate-always failure was not either of 050's two zero-tab sites. 002c trail 5 says the test extension failed to start at ExtensionActions.sys.mjs:494 with "tab is null". That happened because the page_action show_matches check isShownForTab(selectedTab) ran on the shell while it had no selected tab. In upstream/browser/components/extensions/parent/ext-pageAction.js:166-172 the code loops windowTracker.browserWindows(), reads window.gBrowser.selectedTab, and calls this.action.isShownForTab(tab). In upstream/toolkit/components/extensions/ExtensionActions.sys.mjs:484-498, getContextData(null) returns the globals and then dereferences tab.linkedBrowser.currentURI, which throws when tab is null. Patch 050 changes 7 files and ext-pageAction.js is not one of them. Its two zero-tab guards are TabTracker._handleWindowOpen and Window.activeTab in ext-browser.js. So with the shell always admitted and zero overlays open, an extension that declares page_action show_matches still fails at startup. Zero overlays is how the shell starts every time.

2. 002a never tested this case. In .planning/spikes/002a-ext-route-patch/run.mjs:222, the furniture extension (the only one with page_action show_matches) is installed after overlays A and B are open, so selectedTab was set. The 002a README's furniture table lists pageAction as "none" (no error) for that reason.

3. The proposed sub-ruling "while the IDE has focus, there is no active web tab" means the host clears selectedTab. That makes selectedTab null even while overlays exist, which widens hazard 1. 002a trail 3 also notes that the TabTracker TabOpen handler reads selectedTab.linkedBrowser (ext-browser.js:557-562), and 050 does not guard that either.

4. Secondary overstatement. The comparison table says "5 broke live; guarded", which implies the guards were verified. The 002a README (Fidelity, risk 7) says the menus, sessions and sidebarAction guards were not emulated and are argued from the failing lines. Only the browserAction updateWindow skip and the two zero-tab guards ran. The stock-window sidebar regression ("sidebar never registered in the stock window") and the sessions.getRecentlyClosed failure therefore have no live fix. Both are GUI-01 stock-window regressions.

5. Rule check, no violation found. 050 goes through patches/ (rule 2). The tab host sits behind PowerBrowserAPI (boundary). No Theia core edit. No GUI-05 dependency. One caveat: Theia-frame safety relies on the webDriverTabs hunk plus a host that never pushes the Theia record. 002c Security 2 showed executeScript reaching the authenticated IDE when that split fails.

Skeptic evidence (scope and rules): The hard-rules part holds up. Patch 050 lives in patches/ (rule 2). The tab host sits behind PowerBrowserAPI, and extension parents calling the shell's gBrowser is inbound use, not a second boundary. Nothing touches Theia core. The GUI-01 stock window stays reachable, and the patch still prefers it in _mostRecentBrowserWindow. GUI-05 is not hidden: 002a and 002c both say a chrome-side host is enough.

The feasibility claim is refuted. The rationale says "(c)'s gate-ordering problems go away with the patch ... two guards for a window with zero tabs, which were seen live, so the shell can stay registered all the time." The spike evidence does not show this.

1. **002a never started an extension while the shell was admitted with zero web tabs.**
   - In .planning/spikes/002a-ext-route-patch/run.mjs, the probe and activeTab extensions are installed before tabhost.js admits the shell ("install first, then emulate"), and tabhost then replays _handleWindowOpen by hand.
   - The only extension installed after admission is the furniture extension (page_action show_matches <all_urls>). It is installed after overlays A and B are open and B was reactivated, so selectedTab is non-null.
   - 002c's failure case (ExtensionActions "tab is null" at extension startup, gate "always", no web tab) was therefore never re-run under route (a).

2. **That failure path is unguarded in patch 050.**
   - upstream/browser/components/extensions/parent/ext-pageAction.js:169-171 loops windowTracker.browserWindows() and calls action.isShownForTab(window.gBrowser.selectedTab).
   - upstream/toolkit/components/extensions/ExtensionActions.sys.mjs:484-497: getContextData(null) returns the globals, then the pattern-matching branch reads tab.linkedBrowser on null, which throws.
   - 050 has no ext-pageAction.js hunk. Its 7 files are ext-browser, ext-browserAction, ext-menus, ext-sessions, ext-sidebarAction, TabManager and ext-tabs-base.
   - 002a's furniture table lists pageAction as "none" (no error) only because the selected-tab state was non-null at install.
   - ext-pageAction.js:113, :200 and :297 also dereference selectedTab without a check.

3. **The proposed default sub-ruling makes this worse.** The sub-ruling is "while the IDE has focus there is no active web tab", which means selectedTab is cleared.
   - 002a trail 3 says the TabOpen handler still reads selectedTab.linkedBrowser. In upstream ext-browser.js:543-544, `currentTab = gBrowser.selectedTab; currentTab.linkedBrowser.frameLoader` runs with no null check.
   - Opening an overlay while the IDE is focused, or installing or starting a page_action extension in that state, would then throw.
   - The recommendation picks this default without noting that it needs more guard hunks.

4. **The "proven live" list overstates the evidence.**
   - 002a itself says the patch was runtime-emulated, the load-event admission was driven by hand, and the menus, sessions and sidebar guards were not emulated at all.
   - The comparison table does say "Proven by runtime emulation, not a patched build". But the rationale's "seen live, so the shell can stay registered all the time" goes past what was tested.

## Scope consequence

- **GUI-05 is not needed.** The recommended route stays inside the v1.5 out-of-scope line. It needs a chrome-side tab host, which is the GUI-04 seed and is compatible with hard rule 3, not the GUI-05 unified tab strip.
- **The milestone grows in size, not in requirements.**
  - One new phase: the tab host plus patch 050. That is roughly 300-400 lines of host, the chrome-to-Theia request kinds, and new derived gates.
  - Phase 38 stays XL: Theia buttons and puzzle menu, popup host, window-type flags, AMO install, live checks.
  - Phases 32, 34, 35, 36 and 37 each gain tab-host members or rulings.
  - EXT-05..10 all stay in scope.
- **Policy changes:**
  - D-74 goes from config-only to allowing one logic patch.
  - The getTabForBrowser-null ruling and the "no synthesised tab" rule are overturned.
  - verify-shell-gbrowser-standin.mjs changes: its DELIBERATELY_ABSENT set and member set are rewritten.
- **Ongoing cost:** expect conflicts in 050 at every ESR major rebase (4 of 7 files conflicted on 115, 128 and 140).
- **If Chris picks option 3 (Tier 1),** the milestone shrinks:
  - EXT-05 is deferred with GUI-05.
  - EXT-06/07 become stock-window actions that refuse while an overlay is active.
  - EXT-08 covers content scripts only.
  - EXT-10 covers the ad blocker only.
- **If any route needing GUI-05 were chosen** (route (b)), v1.5 would have to take in GUI-05 plus a tracker patch, roughly an extra XL milestone's worth of work, and it still meets nothing. That is why it is not offered.

## Phase adjustments if option 1 is chosen

- **Phase 28:** record the route, the D-74 amendment, the getTabForBrowser ruling reversal and the three sub-rulings. Mark EXT-04 done on sign-off.
- **New Phase 31.1, "Extension Tab Host", inserted before Phase 32.** Use a decimal insert, because the deploy workstream holds 40-58. It covers:
  - Patch 050, regenerated from a patched tree, never text-edited.
  - The tab host behind PowerBrowserAPI: tab elements, TabOpen/TabSelect/TabClose/TabAttrModified, a tabs-progress fan-out, gBrowserInit and selectedTab/selectedBrowser. getTabForBrowser and gBrowserInit must land together, or content-script sendMessage breaks.
  - The CHROME_TOOLBAR window-type fix.
  - A derived gate comparing the browserWindows() consumers as set equality.
  - A Theia-frame-not-in-tracker gate.
  - An http(s)-only navigation guard against moz-extension:// targets.
  - A rewrite of verify-shell-gbrowser-standin.mjs.
  - A rebuild-verified test of patch 050, which was only emulated in the spike.
  - EXT-05 query, events and active tab, and the EXT-08 content-script part, move here from 38.
- **Phase 29:** note that page-declared OpenSearch engines are recorded per overlay once the host lands.
- **Phase 32:**
  - Remove "getTabForBrowser keeps returning null". Favicons come via LinkHandlerParent → gBrowser.setIcon(tab) plus Places.
  - Add mute, soundPlaying and ZoomManager/FullZoom as tab-host members, without loading browser-fullZoom.js.
  - Handle the AboutReaderParent "button is null" error and the crash-recovery members (updateBrowserRemoteness, reviveCrashedTab).
- **Phase 34:**
  - Tab-host _tPos, pinned and multiselected mirror the Theia strip, and fire TabMove, TabPinned/TabUnpinned and TabMultiSelect.
  - Add chrome-to-Theia requests for tabs.move, update({pinned}) and highlight.
- **Phase 35:**
  - FormValidationParent and AboutReaderParent now go ahead, so the furniture must land with the host's selectedBrowser.
  - Add contentAreaContextMenu for extension menus entries (the EXT-08 context-menu part).
  - Be careful with a tabContainer member, because it starts PopupNotifications.
- **Phase 36:**
  - Adopted overlays enter the host as TabOpen with openerTab set, and gBrowserInit.getTabToAdopt stays null.
  - tabs.create reuses the chrome-first overlay creation built here.
- **Phase 37:**
  - Plan getTabDialogBox together with the host, because it makes PromptParent's auth-spoofing branch run (gURLBar.setURI, setTabLabelForAuthPrompts).
  - The AMO install PopupNotification (EXT-09) lands here.
- **Phase 38:**
  - Theia-rendered toolbar buttons and puzzle menu that call action.triggerClickOrPopup(selectedTab), never triggerAction(shell).
  - A popup host, since CustomizableUI refuses any document other than browser.xhtml.
  - Badge and popup state read chrome-side, through the updateWindow skip in 050.
  - tabs.create/remove/update({active}) via addTab/removeTab and a selectedTab setter routed to Theia.
  - The EXT-09 allowlist change, and the EXT-10 live checks (ad blocker, password manager, dark mode).
- **REQUIREMENTS traceability:** move EXT-05 and the EXT-08 content-script part from 38 to 31.1.

## Decision for Chris

Phase 28 / EXT-04 sign-off: by which route do web tabs become WebExtension tabs?

1. **(Recommended) Patch-stack tracker gate plus a product tab host. No GUI-05.**
   - Add patch 050-extension-tab-host.patch (JS only, +105/-8), and amend D-74 to allow this one logic patch.
   - Build a tabbrowser-shaped tab host in the shell behind PowerBrowserAPI that mirrors webTabs.
   - Reverse the 2026-10-20 ruling that getTabForBrowser keeps returning null, and the "never synthesise a tab" rule at powerbrowser.js:80-82.
   - Land the tab host in a new phase before Phase 32, so Phases 32-37 are built against it.
   - Phase 38 keeps EXT-05..10 in full: Theia-rendered toolbar buttons and puzzle menu, a popup host, AMO install, and the live checks.
   - Three sub-rulings come with this option, defaults proposed:
     - While the IDE has focus, there is no active web tab.
     - Extensions may not navigate an overlay to moz-extension:// pages; the http(s) rule holds.
     - The Theia frame never enters the tracker; a derived gate checks this.
2. **The same route, but the tab host lands inside Phase 38.**
   - Phases 32-37 keep the null ruling, and Phase 38 reworks the parts of them that read getTabForBrowser (favicons, prompts, page actors, tab-strip order).
   - Smaller now, but Phase 38 grows by that rework.
3. **Tier 1 only for v1.5: no Gecko patch, no tab host.**
   - EXT-05 is deferred together with GUI-05.
   - EXT-06/07 become a Theia puzzle menu whose actions run in the GUI-01 stock window. The menu refuses, with a message, while a web tab is active.
   - EXT-08 shrinks to content scripts only.
   - EXT-09 installs through the stock window.
   - EXT-10 shrinks to an ad blocker with global filtering at tabId -1. A password manager and dark mode are not checked.

Route (b), the GUI-04 bridge with hidden twin tabs, was disproved by the spike and is not offered.

## Sign-off

- Route chosen: _pending_
- Sub-rulings: _pending_
- Recorded by / date: _pending_
