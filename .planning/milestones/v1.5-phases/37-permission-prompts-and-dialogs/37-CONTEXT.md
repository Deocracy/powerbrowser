# Phase 37: Permission Prompts and Dialogs - Context

**Gathered:** 2026-10-22
**Revised:** 2026-10-25 (plan revision: Chris's answer-route ruling recorded as D-11 and D-12; checker warnings W1-W10 and INFO applied)
**Sequencing (W10):** Phase 37 cannot start until Phases 35 and 36 have executed. Each plan repeats this in its Assumes section.
**Status:** Ready for planning
**Mode:** --auto (autonomous run; every open choice takes the recommended option with a one-line reason)

<domain>
## Phase Boundary

Page asks for permission / password-save / dialog gets Firefox's prompt in place, IDE stays usable. Covers PROMPT-01, PROMPT-02, PROMPT-03, PROMPT-07, PROMPT-09 only. Depends on Phase 36 (Allow on a blocked popup opens through the new-window path). Phase 35 furniture installer (`installShellFurniture`, created in 35-02-PLAN.md — MISSING from the tree today, so every plan carries an explicit `## Assumes from earlier phases` dependency line and treats its absence as a blocker) is the landing surface; the 35-02 furniture gate's upstream comparison list gains every new 37 furniture element (X1); the context-menu shim lives in 35-03, autocomplete/form-validation in 35-06, fullscreen in 35-07. No new browser chrome is authored; stock toolkit popups with stock strings are shell furniture (rule 5 ruling, 2026-10-20). Never `git add/commit/stash/checkout`; never build Theia/Gecko in planning output. Live probes run AT EXECUTION TIME under the built binary (probe 1 is a live run); planning performs no live runs.

**Sequencing (W10):** Phase 37 cannot start until Phases 35 and 36 have executed (their SUMMARY files exist and their symbols are in the tree). Every plan repeats this in its `## Assumes from earlier phases` section. An absent symbol at execution time is a blocker the executor reports, never re-implemented.
</domain>

<decisions>
## Implementation Decisions

### D-01 Doorhanger surface: stock PopupNotifications on a native panel anchored via popupnotificationanchor [auto]
- Use the real `toolkit/modules/PopupNotifications.sys.mjs` object on the shell window plus `<panel id="notification-popup">` (`upstream/browser/base/content/popup-notifications.inc.xhtml:7-14`) in `powerbrowser.xhtml`, with `iconBox` null. Anchoring choice recorded (N4, recommended option): set the `popupnotificationanchor` attribute (ICON_ANCHOR_ATTRIBUTE, `upstream/toolkit/modules/PopupNotifications.sys.mjs:16`) on EVERY overlay at creation, pointing at an anchor element in the chrome-bar rect — because with `iconBox` null the anchor resolves only through `getAnchorFromBrowser` (`upstream/toolkit/modules/PopupNotifications.sys.mjs:47-61`) and `_update` shows a panel only when an anchor exists (`:1517-1519`). The iconBox alternative (supplying the stock `notification-popup-box` ids verbatim from `upstream/browser/base/content/navigator-toolbox.inc.xhtml:295-345`) is rejected: it copies a whole toolbox set for no function. 37-02 also registers the `webrtc-preview` creation callback (`upstream/browser/base/content/browser.js:623-625`) and 37-04 T1 the `login-doorhanger-username-field` callback (`:631-634`, N3; moved from 37-02 on 2026-10-25 because 37-04 owns the password template). Reason: research D2 signed off stock over a Theia re-implementation; stock strings keep the copy contract and the rule-5 furniture ruling.

### D-02 Permission scope: camera / mic / location / notifications only; choice remembered per site via SitePermissions [auto]
- `PermissionUI` drives the doorhanger for non-WebRTC permissions via `PermissionUI.sys.mjs:730` (`chromeWin.PopupNotifications.show` with `this.notificationID`, `:732`), and `WebRTCParent` drives camera/mic/screen via `WebRTCParent.sys.mjs:1367` (`PopupNotifications.show` with the `webRTC-shareDevices` prefix, `:1369`); the grant is written only by the stock PermissionUI callback (`PermissionUI.sys.mjs:552-585`, `SitePermissions.setForPrincipal` at `SitePermissions.sys.mjs:543`, keyed by the request's own principal, the tab's `contentPrincipal`), never a sender-supplied origin. The boundary never calls `setForPrincipal` (D-11). Camera/mic templates are owned by `WebRTCParent` (grep `camera|microphone` over `PermissionUI.sys.mjs` = 0 hits), so plan 37-02 installs the `webRTC-shareDevices-notification` template verbatim — a camera request cannot resolve without it. Reason: matches PROMPT-01 wording exactly and reuses the Phase 31 site-panel read path (`getAllForBrowser`, `SitePermissions.sys.mjs:237`) with no second writer.

### D-03 Never an `allow` kind a frame can call [auto]
- No `webTab*` / store kind named `allow`, `grant`, or `permit` is ever registered (forbidden-family rule, 37-01 T1). **Amended 2026-10-25 by D-11:** the answer route for permission prompts is replaced. No `webTab*` kind answers a prompt, and `webTabDoorhangerAction` does not exist. The remaining answer kinds are `webTabBarAction {token, action}` (bar buttons, D-08, D-12, fixed enum `allow-popup|dismiss|stop-script|wait-longer|add-handler|deny-handler`) and, on the relay branch only, `webTabDialogAnswer {token, action}` (D-06, fixed enum). Naming rule, corrected 2026-10-25: the `webTab` prefix is REQUIRED on request and answer kinds, because `scripts/verify-web-tab-bridge.mjs` rules 1, 10 and 11 derive those only from `case "webTab..."` arms and `kind: 'webTab...'` literals, and KIND_CLASSES must match them. Push kinds (`doorhanger`, `sharingChanged`, `notificationBar`, `dialogRequest`) are derived separately by rule 9 (a literal double-quoted `{ kind: "..." }` in `sendWebTabPush`, and an `onPush('...')` subscriber) and carry no prefix requirement. Reason: ROADMAP note and research D2 — a frame-callable allow is an elevation primitive.

### D-04 Background-tab queue: request waits until its tab is shown; cap 3 FIFO with cancel-on-evict [auto]
- If the requesting overlay is not the active web tab, the doorhanger record queues chrome-side and is shown on `webTabActivated`. Queue cap 3 FIFO: when a fourth request arrives the OLDEST queued record is dropped and its page promise is CANCELLED (`PermissionPrompt.cancel` then `request.cancel()`, `PermissionUI.sys.mjs:375,767-768`), so the page observes a denial, never a hang; the live gate asserts `getNotification(id, browser)` is empty for the dropped record plus a page-side denial. No upstream background-tab deferral is duplicated: `PopupNotifications.show` (`PopupNotifications.sys.mjs:696-731`) already suppresses DISPLAY for a non-active browser (`_isActiveBrowser` false yields `backgroundShow`, `:728-731`), while the chrome-side queue is what makes the request SURVIVE to activation instead of being cancelled at once — queue and suppress are complementary, not duplicate. Reason: Firefox parity (background tabs do not pop) and avoids focus stealing from the IDE.

### D-05 Sharing indicator: chrome-bar element driven by webrtcUI state [auto]
- While a page uses camera/mic/screen, chrome observes `webrtcUI.updateIndicators(topBrowsingContext)` (`webrtcUI.sys.mjs:660-677`, tabState `{camera, microphone, screen, sharing}` `:296-322`) in the `WebRTCParent.updateIndicators` path (`WebRTCParent.sys.mjs:141-158`, `tabbrowser.updateBrowserSharing(browser, {webRTC: state})` `:153-158`) and pushes `{sharingChanged: {camera, microphone, screen}}` in the coalesced state; the chrome bar shows the indicator. There is no `gBrowser.updateBrowserSharing` member on the stand-in (it was never added) — the equivalent is this observed-state push. Reason: PROMPT-02 needs an always-visible affordance; the bar is the only surface that never occludes the page.

### D-06 Dialogs: stock window-modal fallback UNLESS probe 1 keeps it; tab-scoped relay otherwise (no deliberate absence) [auto]
- `PromptParent` falls back to a window-modal dialog via `Services.ww.openWindow(win, uri COMMON_DIALOG ... "centerscreen,chrome,modal,titlebar")` (`upstream/browser/actors/PromptParent.sys.mjs:154,156,295-307`) only when the feature-detect `win?.gBrowser?.getTabDialogBox` (`upstream/browser/actors/PromptParent.sys.mjs:222`) is falsy. Because this detect runs per dialog (`upstream/browser/actors/PromptParent.sys.mjs:222,224`), a `getTabDialogBox` stand-in member is a LIVE hook, not a passive absence: the moment it exists, every alert/confirm/prompt/HTTP-auth call enters the `getTabDialogBox(browser)` branch (`upstream/browser/actors/PromptParent.sys.mjs:224`), which then requires `setTabLabelForAuthPrompts` and a tab-dialog-box contract the stand-in cannot satisfy. Fix for the checker contradiction: there is NO `getTabDialogBox` deliberately-absent option. Probe 1 (37-03, checkpoint:decision, Chris gate) decides the single outcome — stock kept (no member, fallback stays) or relay built (audited member added). Reason: PROMPT-03 accepts the stock dialog only under the ROADMAP Needs Chris condition (KDE Wayland IDE usable); research D5 says a Theia relay is a large fragile surface, so do not pay it unless forced; and a relay leaves no honest absent entry.
- Stop-repeat (N6, recommended option: native checkbox for the stock outcome): the PromptParent actor has NO pre-hook, so a chrome-side suppress map for the stock outcome would be invented surface. Upstream already blocks repeated dialogs in content (`upstream/dom/base/nsGlobalWindowOuter.cpp:2816 ShouldPromptToBlockDialogs`, `:4725-4739` alert/confirm `AlertCheck`/`ConfirmCheck` with `disallowDialog` to `DisableDialogs()`, `:4824-4836` prompt `Prompt` with `disallowDialog` to `DisableDialogs()`, group-scoped via `DisableDialogs()`/`GetBrowsingContextGroup()`). The stock outcome therefore uses that native checkbox with a live check that the block does not leak across tabs; only the RELAY outcome names a real hook (its own stop affordance checked chrome-side before delegating).
- Autonomous choice recorded: keep the stock dialog as the DEFAULT outcome and build the relay only if probe 1 proves the stock dialog blocks the IDE (recommended: smallest furniture, no new stand-in member, no Pitfall-2 retargeting). Reason: one line — the relay is large/fragile surface (research D5) paid only if the ROADMAP Needs Chris condition forces it.

### D-07 Password save/update: install the stock template; Theia never syncs credentials [auto]
- Install the stock `password-notification` template verbatim from `upstream/browser/base/content/popup-notifications.inc.xhtml:100-115` as furniture inside `#notification-popup` (fields stock ids `#password-notification-username` `:102` and `#password-notification-password` `:110`; both visible, editable elements of the stock doorhanger). No Theia credential sync: form submission is captured in content by `LoginManagerChild.sys.mjs:1494` (`form-submission-detected`) through `PasswordManager:onFormSubmit` to `LoginManagerParent.sys.mjs:352` and `#onShowDoorhanger` (`LoginManagerParent.sys.mjs:423-425`) calling `prompter.promptToSavePassword` (`LoginManagerParent.sys.mjs:1159`); the prompter fills the stock fields itself (`LoginManagerPrompter.sys.mjs:290-303 writeDataToUI`) and reads back the user's edits (`LoginManagerPrompter.sys.mjs:308-314 readDataFromUI`, wired to `onInput` `:317-320` and `:623/:635`). The old "Theia syncs credentials" path is dropped: it contradicts `LoginManagerPrompter.sys.mjs:290-314` (prompter owns fill + read-back) and would put credential values in a Theia-to-chrome push. The doorhanger shows through the D-01 `PopupNotifications` panel; the answer runs the stored prompter callback. Reason: one line — the stock prompter fills and reads its own template, so any Theia-synced value is redundant and an info-disclosure path.
- Autonomous choice recorded: verbatim stock template, no synced-input variant (recommended). Reason: one line — the Theia-sync variant contradicts the verified fill/read-back ownership and adds a credential push for no function.

### D-08 Notification bars: per-tab bar that shrinks the page rect, not an overlay [auto]
- Popup-blocked, hung-script, protocol-handler use one generic `notificationBar {token, tabId, barKind, displayFields}` push rendered inside `WebTabWidget`, shrinking the placeholder via `webTabGeometry` (Pitfall 8 rule b). Bar event sources are named per B4: blocked popups `PopupAndRedirectBlockingParent.sys.mjs:211-225` + boundary listeners replacing unloaded `browser-init.js:311-317`; hung script `process-hang-report` observer (`ProcessHangMonitor.sys.mjs:88-92`) translated per-tab (no `win.gNotificationBox`); protocol registration `registerProtocolHandler` (`WebProtocolHandlerRegistrar.sys.mjs:421`) observed chrome-side (no `getNotificationBox`, which stays deliberately absent — `browser-custom-element.mjs:950-955` + `powerbrowser.js:89-91`). Allow on a blocked popup opens via the Phase 36 adoption vocabulary `webTabAdopt`/`adoptTab` (36-01-PLAN.md:118,121,175); it is a per-popup chrome action, classified in D-12 (not an allow kind, not a prompt answer). Reason: bars belong to the page (ARCHITECTURE §4 table), and shrinking keeps the page visible unlike a blocking-layer overlay.

### D-09 WebRTC device picker: NOT deferred — installs with the B2 template; only in-content room pickers defer [auto]
- Correction: the device selector is IN-DOORHANGER, not an in-page picker and not separable. `WebRTCParent.sys.mjs:838 listDevices` populates the template menulists on the `showing` topic (`WebRTCParent.sys.mjs:814`), ALLOW is delayed to `popupshowing` (`WebRTCParent.sys.mjs:821-822`), and the camera preview is inserted in-doorhanger (`WebRTCParent.sys.mjs:1632-1636`). Therefore plan 37-02 installs the full `webRTC-shareDevices-notification` template verbatim (`upstream/browser/base/content/popup-notifications.inc.xhtml:16-77`: camera `:24`, window/screen `:35`, microphone `:62`, speaker richlistbox `:72`, preview section `:42-54`) because the camera/mic answers CANNOT resolve without it — `PermissionUI` owns no camera/mic template (grep `camera|microphone` over `PermissionUI.sys.mjs` = 0 hits; cam/mic owned by `WebRTCParent`), and D-09 as written contradicts the B2 requirement. What stays deferred: any page-embedded (in-content WebRTC room) picker UI, which is a page DOM surface, not the doorhanger template. Reason: one line — dropping the template drops the ask path for exactly the PROMPT-01 devices the phase must cover.
- Autonomous choice recorded: install the full template including menulists + preview section verbatim (recommended). Reason: one line — selective install re-creates the missing-template silent failure the phase exists to remove.

### D-10 Copy: configured app name, plain language, next-step affordance [auto]
- Every new sentence lives in `CHROME_BAR_COPY` + `appSubject()`; no internal identifier (pref key, port, sentinel) in text; `verify-shell-error-copy.mjs` pins by set equality. Reason: CLAUDE.md copy contract + gate hygiene.

### D-11 Answer route: the stock Allow/Block buttons and Remember checkbox are the only answer to a permission prompt [locked 2026-10-25, Chris's ruling; replaces D-03's answer route]
- Permission prompts (camera, microphone, location, notifications, and the WebRTC device doorhanger) are answered ONLY by the stock Firefox prompt's own Allow and Block buttons and its Remember checkbox, activated in the chrome window. No Theia widget, no frame-sent message and no `webTab*` kind can answer a prompt.
- Theia shows WHERE a prompt is, never what the answer is. The chrome pushes `doorhanger {tabId, token, permission, displayHost, pending}` on the stock `showing` and `shown` events (`eventCallback`, `upstream/toolkit/modules/PopupNotifications.sys.mjs:528`, which also covers background requests) and `pending: false` on `dismissed` or `removed`. The tab widget shows a pending-prompt indicator from that push. Every field is display-only. `token` identifies the chrome-held record and no answer path consumes it.
- Remember is the stock checkbox. The only grant write is the stock PermissionUI callback (`upstream/browser/modules/PermissionUI.sys.mjs:552-585`, persistent when `state.checkboxChecked`). The boundary never calls `SitePermissions.setForPrincipal`. A planted call goes red in `scripts/verify-permission-prompts.mjs` (37-02 T2).
- The click delay is the stock protection, applied only inside `_onButtonEvent` (`upstream/toolkit/modules/PopupNotifications.sys.mjs:2008-2011`; `security.notification_enable_delay` defaults to 500 ms, `upstream/modules/libpref/init/StaticPrefList.yaml:18549`). A click inside the delay is ignored, and each rejected click restarts the window (capped). Block carries `disableSecurityDelay` (`PermissionUI.sys.mjs:604`, bug 2035581) and fires at once, so the live delay test exercises the primary Allow only.
- Reason: keeps Firefox's click-delay protection (a Theia-originated answer would bypass `_onButtonEvent`) and removes the second answer surface. It also settles the ROADMAP note "never an allow kind a frame could call".
- Consequences in the plans: `webTabDoorhangerAction` is removed entirely (no kind, Set entry, case arm, KIND_CLASSES entry, sender literal or plant). The widget answer affordance and any Theia Remember toggle are removed. 37-01 T1 adds a forbidden-family rule: no `webTab*` kind whose name contains Allow, Grant, Permit, Doorhanger or Prompt, proven by a planted `webTabDoorhangerAction` going red. Live scenarios answer by activating the stock buttons and checkbox through chrome after the stock delay, with a same-session positive control (37-01 T3, scenario `answer-delay`).

### D-12 Blocked-popup Allow is a per-popup chrome action: not an allow kind, not a prompt answer [planner decision 2026-10-25; open points for Chris below]
- Question from the ruling: is a blocked-popup Allow from a Theia bar button an allow kind a frame could call? If so, route it through the stock bar's own button.
- Answer: no, for these reasons.
  - (a) The kind is `webTabBarAction` with enum value `allow-popup`. No kind is named allow, grant or permit, so the D-03 family rule holds. An enum value is not a kind.
  - (b) Only the Theia origin can send it. The group actor is registered for `http://127.0.0.1/*` alone (`powerbrowser/shell/PowerBrowserAPI.sys.mjs:254,2206`), and `handleGroupMutation` rejects any other sender (`:2327`). Page content cannot call it.
  - (c) It writes no permission. It opens one popup the page already requested, from the chrome-held record (`getBlockedPopups()`), through the Phase 36 adoption path with the http(s) wall. The stock per-popup action, `showBlockedPopup` then `unblockPopup` (`upstream/browser/modules/PopupAndRedirectBlockerObserver.sys.mjs`), also writes nothing.
  - (d) The stock bar's site-wide "Allow popups for site" (`toggleAllowPopupsForSite`, which calls `Services.perms.addFromPrincipal(..., "popup", ALLOW_ACTION)`) IS a permission write. Under D-11 no Theia widget offers it, so this phase ships per-popup Allow only.
  - (e) The stock route is not available. The stock bar is `browser.getTabBrowser().getNotificationBox(browser)`, which throws in the shell (`upstream/toolkit/content/widgets/browser-custom-element.mjs:950-955`), and N2 rejects a getNotificationBox stand-in.
- Decision: per-popup `allow-popup` stays a `webTabBarAction` enum value, with no reroute and no site-wide toggle. The popup-block live scenario reads back the `popup` permission after the per-popup Allow and asserts it was not written. The same-session read-back of a stock location grant is the positive control that proves the reader works.
- Open points for Chris (this decision does not settle them):
  1. Whether notification bars count as "prompts" under the ruling. D-08 classes them as bars, so this plan does not treat them as prompts. If Chris reads them as prompts, all three bar answers (`allow-popup`, `add-handler`, `deny-handler`) need a stock route, which requires reinstating getNotificationBox.
  2. Protocol-handler Add writes a persistent handler (`hs.store`, `upstream/browser/components/protocolhandler/WebProtocolHandlerRegistrar.sys.mjs:483-504`), so it is a persistent grant answered from a Theia bar. The same classification applies, but the write is persistent, and Chris should confirm it.
  3. The site-wide popup toggle is not in this phase. PROMPT-09 says "with their actions", which may cover it. The planner recommends accepting per-popup Allow as the PROMPT-09 Allow.

### Claude's Discretion
- Exact push-field names, token lifetimes, queue eviction cap, hung-script timeout values, and KWin screenshot geometry.
- Which derived gate file hosts each rule (new `verify-permission-prompts.mjs` vs extension of `verify-web-tab-bridge.mjs`), as long as every new check is one row in `scripts/verify-platform.sh` with `--self-test`.
- Screenshot helper reuse vs a new `scripts/lib/` helper, as long as BiDi-blind XUL is never asserted via BiDi DOM.
</decisions>

<specifics>
## Specific Ideas

- Firefox parity reference: permission doorhanger anchored at identity box; sharing indicator where Firefox shows the camera/mic/screen icon; notification bar above content for blocked popup / hung script.
- "A page asking for camera while I am editing code must not steal the IDE; the answer waits until I look at that tab."
- Dialog probe is the only Chris gate: if the stock dialog blocks the IDE and no tab-scoped relay is feasible, PROMPT-03 as written rules the stock dialog out (ROADMAP Needs Chris).
</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and roadmap
- `.planning/REQUIREMENTS.md` §Page prompts and shell furniture (PROMPT-01,02,03,07,09) + v1.5 header rulings (typed-text search, Places writes, rule-5 furniture, suggestions on, Firefox-keys-only-with-page-focus, no clipboard reading, copy reads configured app name).
- `.planning/ROADMAP.md` §Phase 37 (goal, Depends Phase 36, Requirements, Notes, Success Criteria 1-5, UI hint yes, Needs Chris).
- `.planning/PROJECT.md` — platform context, `configuration.toml`+`brand/` rebrand, Key Decisions table, Gecko 153.5.0esr / Theia 1.76.0 state.

### Prior research (binding proposals)
- `.planning/research/SUMMARY.md` §Live Probes 1-2 (dialog usability on KDE Wayland; permission outcomes today), Open Questions Q1/Q5, Gaps (BiDi cannot see XUL panels).
- `.planning/research/STACK.md` §Page prompts and shell furniture (PopupNotifications stand-in vs real, LoginManagerPrompter hidden inputs, WebRTC DOM coupling, PromptParent fallback, nsIBrowserDOMWindow design) + §Version Compatibility (moz-src imports + boundary guard).
- `.planning/research/ARCHITECTURE.md` §5a (nsIBrowserDOMWindow opener branching + pending overlay + GUI-01 guarantee), §5d-e (furniture list, Pattern 5 installer), Patterns 1-5 (one push name, token-not-payload, enum-not-URL, rect-anchored chrome, stock furniture in one installer).
- `.planning/research/PITFALLS.md` Pitfall 2 (every gBrowser member changes upstream branches; derive the scope from the actor registries), Pitfall 3 (silent upstream failure; "already works" untested), Pitfall 8 (overlays have no z-order; bars shrink rect; XUL panels draw above overlays but BiDi-blind), Pitfall 15 (BiDi-blind verification → page-side outcomes + KWin screenshots).
- `.planning/research/FEATURES.md` §Dependency Notes (furniture → all PROMPT rows; window.open-as-tab ↔ GUI-01 conflict rule).
- `.planning/research/chrome-bar-firefox-gap.md` §Page prompts and shell furniture (doorhanger XL, dialogs L, password L, notification bars L, sharing M, WebAuthn/FedCM L, add-on prompts → stock window).

### Prior phases (assumed outputs; refreshed at run start)
- `.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-CONTEXT.md`, `27-SECURITY.md`, `27-VALIDATION.md`, `27-PATTERNS.md`, `27-01-PLAN.md` through `27-08-SUMMARY.md` — push router, `webTabActivated`, privileged-kind rule, `verify-web-tab-bridge`, live-probe harness, layer policy, shared-process blank defect.
- `.planning/phases/29-address-bar-search-and-fixup/29-CONTEXT.md`, `29-SECURITY.md`, `29-VALIDATION.md`, `29-PATTERNS.md`, `29-01-PLAN.md` through `29-10-SUMMARY.md` — resolveTypedAddress, token-cookie strip, copy gate, drafts, IME/select-all.
- `.planning/phases/30-address-bar-modes-and-command-centre/30-CONTEXT.md`, `30-UI-SPEC.md`, `30-RESEARCH.md`, `30-PATTERNS.md`, `30-01-PLAN.md` through `30-04-SUMMARY.md` — pill in `address-bar/`, modes contributions, Command centre, copy discipline.
- `.planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md` — signed-off extension route (binds 31.1/38); sub-rulings last-web-tab-active, no moz-extension navigation; D-74 amended, getTabForBrowser-null reversed for tab host.

### Shell and Theia surfaces
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` — the sole boundary (append-only; privileged-kind rule).
- `powerbrowser/INTERNAL-APIS.md` — catalogue discipline + privileged-kind rule.
- `powerbrowser/shell/powerbrowser.js` — chrome bootstrap, `window.gBrowser` stand-in, GUI-01 no-browserDOMWindow fallthrough.
- `powerbrowser/shell/powerbrowser.xhtml` — furniture host (no custom chrome).
- `theia/extensions/tab-uris/src/browser/web-tab.ts` — push router (`onPush`), geometry, adoption, activation.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`, `address-bar/`, `chrome-bar-copy.ts`, `chrome-bar-keybindings.ts` — bar, pill, copy, keys.
- `scripts/verify-platform.sh`, `scripts/check-internals-boundary.sh`, `scripts/verify-web-tab-bridge.mjs`, `scripts/verify-shell-gbrowser-standin.mjs`, `scripts/verify-shell-error-copy.mjs`, `scripts/lib/pb-live-probe.mjs` — gates and harness.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WebTabChannel.onPush(kind, handler)` router (27-02) — every new push (`doorhanger`, `sharingChanged`, `dialogRequest`, `notificationBar`) subscribes without touching `GroupActorChild.sys.mjs`.
- Autonomous choices recorded (round 3, one-line reasons each): N1 `webTab*` prefix on request and answer kinds only (push kinds are derived by rule 9 and carry no prefix) — required by the gate's derive regexes, widening them instead would weaken every existing kind's proof; N2 wrap `registerProtocolHandler` rather than add stand-in members — a fabricated tabbrowser hands privileged actors a tab that does not exist; N4 `popupnotificationanchor` on overlays — one attribute vs copying the whole stock icon box; N6 native checkbox for the stock outcome — the actor has no pre-hook and upstream already blocks repeats in content; live rebuilds in every task — a stale binary fails the gate the same as a missing one.
- `PowerBrowserAPI.installShellFurniture(win)` (Phase 35 plan 35-02 — NOT in the tree today: `installShellFurniture` greps 0 hits under `powerbrowser/`; every 37 plan lists it in `## Assumes from earlier phases` and halts on its absence) — the single installer this phase extends; never scatter furniture across files.
- `scheduleWebTabState` coalescer — sharing/security/permission-icon fields ride the existing state push.
- `PowerBrowserAPI.installShellFurniture(win)` (Phase 35 plan 35-02 — NOT in the tree today: `installShellFurniture` greps 0 hits under `powerbrowser/`; every 37 plan lists it in `## Assumes from earlier phases` and halts on its absence) — the single installer this phase extends; never scatter furniture across files.
- N2 hook: the protocol-handler interception point is a chrome-side wrap/observer on `registerProtocolHandler` (`upstream/browser/components/protocolhandler/WebProtocolHandlerRegistrar.sys.mjs:421-427`, component `upstream/browser/components/protocolhandler/components.conf:8`); the stock `:506`/`:582` `browser.getTabBrowser().getNotificationBox(browser)` throws for every shell overlay (`getTabBrowser` null per `browser-custom-element.mjs:950-955`), so the plan wraps the service method (or observes its arguments) and emits the per-tab bar directly — the stock throw is recorded with a live plant, justified against PROMPT-09 because the wrapped hook honors Add/Don't-allow without the window box.
- N3 callback: `login-doorhanger-username-field` is defined only in `browser.js:631-634` (shell loads no browser.js); 37-04 T1 registers `customElements.setElementCreationCallback("login-doorhanger-username-field", ...)` for `chrome://browser/content/passwordmgr/login-doorhanger-username-field.mjs` (chrome URL in `passwordmgr/jar.mn:6-7) in the furniture installer under the Phase 27 policy.
- N5 rebuild rule: every live task rebuilds Theia first (same `nix develop .#theia` command); powerbrowser/shell chrome JS/XHTML is symlinked into the objdir and loads with MOZ_PURGE_CACHES=1, so no Gecko rebuild unless jar.mn changes or a new file is added — each plan states which applies.
- `ChromeStoreClient` request/response + `STORE_REQUEST_KINDS` classification — permission/site-data reads that fit store semantics reuse it; tab-scoped dialog relay does not become a store kind.
- Theia answer surfaces (superseded 2026-10-25 by D-11): no Theia surface answers a permission prompt. The stock panel's own Allow and Block buttons and the Remember checkbox are the only answer. The `doorhanger` push is display-only, and the `webTabDoorhangerAction` kind is removed from the plans. The remaining Theia-to-chrome answers are bar actions (`webTabBarAction`, D-12) and, on the relay branch only, dialog answers (`webTabDialogAnswer`, D-06).
- `CHROME_BAR_COPY` + `appSubject()` + `verify-shell-error-copy.mjs` set equality — all new copy lands here.

### Established Patterns
- Append-only boundary: new code in end-of-file sections; catalogue lines never move; `verify-ng-040-internals-catalogue-lines.mjs --fix` after each edit.
- Privileged-kind rule: any `webTab*` kind that changes state outside a tab's own navigation/lifecycle/selection runs only from a widget event handler, gets no command id or key-relay row, and is classified in `verify-web-tab-bridge.mjs`.
- Token-not-payload: chrome holds the privileged object, Theia holds a token + display-only fields; Theia answers with token + fixed-enum action.
- Enum-not-URL: `openStockPage {page}` / `webTabViewSource {tabId}`; this phase's Allow opens via Phase 36 adoption path, never a frame-supplied URL.
- Derive-and-compare: every gate derives expectations from the tree and compares as a set, with `--self-test` planting faults.

### Integration Points
- `PermissionUI` → `window.PopupNotifications.show(...)` on the shell window (doorhangers).
- `LoginManagerPrompter` → `documentGlobal.PopupNotifications` + `#password-notification-username/-password` inputs (password save/update).
- `PromptParent` → feature-detect `win?.gBrowser?.getTabDialogBox` (`PromptParent.sys.mjs:222`): absent falls back to window-modal `Services.ww.openWindow(win, uri COMMON_DIALOG ...)` (`:154,156,295-307`); present enters `getTabDialogBox(browser)` (`:224`). No deliberately-absent option for this member (D-06 fix).
- `WebRTCParent` / `webrtcUI` → `gBrowser.updateBrowserSharing`-equivalent (sharing indicator).
- `RefreshBlocker` / popup-blocker / protocol-handler → per-tab notification bar push.
- Phase 31 site panel ← `SitePermissions.getAllForBrowser` (remembered choices surface).
- Phase 36 adoption path ← Allow on a blocked popup (`webTabAdopt {pendingId}` vocabulary).
</code_context>

<deferred>
## Deferred Ideas

- WebRTC/camera/mic/screen device picker UI — CLARIFIED by D-09 correction: the doorhanger device template (`webRTC-shareDevices-notification` menulists + preview, 37-02) is NOT deferred; only page-embedded (in-content WebRTC room) picker UI defers to a later phase.
- WebAuthn/passkey and FedCM prompts — later phase (gap list L, DOM-coupled like passwords).
- Add-on install prompts — sent to the stock window (gap list: bridge+chrome M), not this phase.
- Certificate viewer / protections panel / HTTPS-Only toggle — Phase 31 site-panel scope, not here.
- Picture-in-Picture, translations, screenshots — Future Requirements, not v1.5.
- Per-site zoom memory, OpenSearch "Add engine" rows, custom mode-data defaults — other phases' scope.
</deferred>

## Threat Model (context-level; refined in 37-RESEARCH.md)

| Boundary | Description |
|----------|-------------|
| page → chrome | untrusted page triggers stock actors; chrome keys by overlay identity + own principal |
| chrome → Theia | display-only fields + token; no callbacks/principals/URLs cross |
| Theia → chrome | Bar actions (`webTabBarAction`, fixed enum) and, relay branch only, dialog answers. Never a permission-prompt answer (D-11). No URL/origin/principal accepted |

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-37-C-01 | Elevation | frame-callable allow | high | mitigate | D-03: no allow/grant/permit kind; bridge-gate forbidden-name rule (37-01) |
| T-37-C-04 | Elevation | Theia-originated answer to a permission prompt | high | mitigate | D-11: no `webTab*` kind naming a prompt; the doorhanger push is display-only; a planted `webTabDoorhangerAction` goes red (37-01 T1) |
| T-37-C-02 | Spoofing | permission principal/origin | high | mitigate | D-02: tab's own contentPrincipal; Theia never supplies origin text |
| T-37-C-03 | Info disclosure | credentials/URLs in pushes/logs | high | mitigate | D-07: no credential sync at all (stock template + prompter-owned fill/read-back); token-not-payload; kind+class logs only |

## Must_Haves (context-level)

- truths: ["Every PROMPT-01/02/03/07/09 requirement and every D-01..D-12 decision has an implementing plan", "No plan ships a frame-callable allow kind, and no Theia-originated message answers a permission prompt (D-03, D-11)", "BiDi-blind XUL is proven by page-side outcomes + KWin screenshots + chrome-side geometry"]
- artifacts: [`37-CONTEXT.md` this file]

## Verify

- `scripts/verify-platform.sh --quick` — still green (no code changed by this file).
- fails_when: a D-0X decision has no implementing task in 37-01..37-04, or a deferred idea (in-content WebRTC room pickers, WebAuthn, add-on prompts) appears in a plan; the doorhanger device template itself is NOT deferred (D-09 correction).

---

*Phase: 37-permission-prompts-and-dialogs*
*Context gathered: 2026-10-22*


## Chris's confirmations (2026-10-25)

- Permission prompts are answered only by the stock Firefox prompt's own buttons and Remember checkbox (D-11, locked).
- Notification bars (blocked pop-up, hung script, link-handler request) keep their buttons in Theia (D-12 confirmed); they are not permission prompts.
- PROMPT-09's pop-up actions: per-pop-up Allow is enough; no site-wide "Allow pop-ups for this site" toggle is written from a bar.
