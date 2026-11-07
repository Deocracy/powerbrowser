---
phase: 37-permission-prompts-and-dialogs
verified: 2026-11-01T00:00:00Z
status: human_needed
score: 9/18 must-haves verified
covered_files: [".planning/phases/37-permission-prompts-and-dialogs/37-01-PLAN.md", ".planning/phases/37-permission-prompts-and-dialogs/37-01-SUMMARY.md", ".planning/phases/37-permission-prompts-and-dialogs/37-02-PLAN.md", ".planning/phases/37-permission-prompts-and-dialogs/37-02-SUMMARY.md", ".planning/phases/37-permission-prompts-and-dialogs/37-03-PLAN.md", ".planning/phases/37-permission-prompts-and-dialogs/37-03-SUMMARY.md", ".planning/phases/37-permission-prompts-and-dialogs/37-04-PLAN.md", ".planning/phases/37-permission-prompts-and-dialogs/37-04-SUMMARY.md", ".planning/probes/prompt-probe-verdict.json", "powerbrowser/INTERNAL-APIS.md", "powerbrowser/shell/PowerBrowserAPI.sys.mjs", "powerbrowser/shell/powerbrowser.js", "powerbrowser/shell/powerbrowser.xhtml", "scripts/check-internals-boundary.sh", "scripts/verify-permission-prompts.mjs", "scripts/verify-platform.sh", "scripts/verify-prompts-live.mjs", "scripts/verify-web-tab-bridge.mjs", "theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts", "theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx", "theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx", "theia/extensions/tab-uris/src/browser/web-tab.ts"]
covered_digest: "v3:sha256:9211365af10ca0b5a13e90ed66378f86082ae35064f8570036aa264fc47b1caf"
behavior_unverified: 8
overrides_applied: 0
behavior_unverified_items:
  - truth: "A page asking for the camera, microphone, location or notifications shows a permission prompt anchored in the chrome bar (SC1, PROMPT-01)"
    test: "Run verify-prompts-live.mjs --scenario permission on a built binary, then look at the panel on KDE Wayland"
    expected: "The stock doorhanger opens over the page's top-left corner under the chrome bar; Allow after the stock delay resolves the page's callback, Block in a second tab denies"
    why_human: "#notification-popup is XUL and BiDi cannot see it; no live run has happened (every SUMMARY says live_proof: deferred)"
  - truth: "The answer is remembered per site (SC1, PROMPT-01)"
    test: "Scenario remember: Allow without Remember, then with the stock Remember checkbox"
    expected: "Without it a fresh tab on the same origin prompts again; with it the fresh tab is granted with no panel and getAllForBrowser reports a persistent allow"
    why_human: "The only grant write is the stock PermissionUI callback, which only a live stock prompt exercises"
  - truth: "A request from a background tab waits until that tab is shown, and a fourth request from one tab evicts that tab's oldest (SC1, D-04)"
    test: "Scenarios background-queue and cancel-on-evict, plus the CR-01 adopted-tab check"
    expected: "No panel for a hidden tab; the panel shows and the grant lands once the tab is current; the evicted page sees a denial; another tab's prompt survives"
    why_human: "Depends on the facade's selection reaching the stock TabSelect and anchorVisibilityChange paths in a running shell"
  - truth: "While a page uses the camera, microphone or screen, a sharing indicator shows (SC2, PROMPT-02)"
    test: "Scenario sharing, then camera-then-location and share-then-navigate by hand"
    expected: "A mark per live kind in the chrome bar, cleared when the track ends or the page navigates; a location grant does not clear the camera mark"
    why_human: "The state comes from webrtcUI in a live WebRTC session; the CR-02, WR-01 and WR-02 fixes are proven only against stub maps"
  - truth: "A page that repeats alert, confirm or prompt can be stopped (SC3, PROMPT-03)"
    test: "Scenario stop-repeat"
    expected: "Ticking the stock checkbox on the second alert ends the loop with no further dialog in that tab; a new tab still prompts"
    why_human: "Native stock checkbox in a window-modal commonDialog; needs a built binary"
  - truth: "After a login the user is offered to save or update the password (SC4, PROMPT-07)"
    test: "Scenarios password-save and password-update"
    expected: "The stock doorhanger shows with the prompter-filled fields; Save stores the login and Update replaces it; no credential reaches a log or a push"
    why_human: "Stock LoginManagerPrompter and the real login store, live only"
  - truth: "Per-tab notification bars appear for a blocked popup, a hung script and a protocol handler, and their actions work (SC5, PROMPT-09)"
    test: "Scenarios popup-block, hung-script, protocol-handler"
    expected: "Each bar shows in the web tab widget with the page rect shrunk below it; Keep waiting hides and restores, Stop script ends the loop, Add stores the handler, Don't allow stores nothing"
    why_human: "Needs a hung page, a blocker event and a handler service on a built binary"
  - truth: "Allow on a blocked popup opens it as a web tab (SC5, PROMPT-09)"
    test: "Scenario popup-block, plus a popup that reports back through window.opener.postMessage"
    expected: "The popup is adopted next to its opener with window.opener, name and features kept; no popup permission is written"
    why_human: "The Allow is now the stock unblockPopup replay (22d02c9c) reaching Phase 36's receivers; the join has never run"
human_verification:
  - test: "Run the 17 live scenarios and the live --self-test (37-UAT.md items 1-17)"
    expected: "All green; each plant goes red naming its drift"
    why_human: "No live run has happened; owner rule defers all browser-dependent criteria to the end-of-milestone pass"
  - test: "Check the ten fixes in 37-REVIEW's fix report live (37-UAT.md items 18-27)"
    expected: "Each behaves as the fix report states"
    why_human: "All ten are 'Fixed, needs live check'; the proofs are static plants against stubs"
  - test: "Look at the doorhanger, pending mark, sharing marks, device and password panels and the bars on KDE Wayland (37-UAT.md items 28-33)"
    expected: "Placement, legibility in both themes, no overlay of page content"
    why_human: "Visual; BiDi cannot see XUL"
  - test: "Decide the 37-03 gate once probe 1 returns (37-UAT.md item 34)"
    expected: "Relay is built or PROMPT-03 goes to the owner (see Gaps Summary)"
    why_human: "Owner decision; the source reads as stock-blocks-ide"
  - test: "Owner decisions 35-41 (indicator click, getTabSharingState, D-12 points, bar copy rows, prohibitions, the Phase 31 writer, review info findings)"
    expected: "Accept or reopen each"
    why_human: "Owner decisions; none is a code defect against the roadmap contract"
---

# Phase 37: Permission Prompts and Dialogs Verification Report

**Phase Goal:** A page that asks for a permission, a password save or a dialog gets Firefox's prompt in place, and the IDE stays usable
**Verified:** 2026-11-01 (HEAD `9e054572`)
**Status:** human_needed
**Re-verification:** No. Initial verification. No previous VERIFICATION.md existed.

No live run has happened for this phase. By the owner's rule, criteria that need a browser are `human_needed`, not gaps. A gap would be something the static tree shows missing or wrong. I found none. The tree implements every roadmap criterion except the PROMPT-03 dialog path, which is the stock window-modal fallback by an owner-default provisional verdict. That fallback is not proven to leave the IDE usable, and the source points the other way (see Gaps Summary).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: a page asking for camera, microphone, location or notifications shows a prompt anchored in the chrome bar | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `installPermissionPromptFurniture` (PowerBrowserAPI.sys.mjs:7182) constructs one stock `PopupNotifications(promptTabbrowser, panel, null)` (:7208) on `#notification-popup`; `placePromptAnchor` (:7336) puts the `powerbrowser-notification-anchor` strip on the page's top edge. The furniture gate (`verify-shell-furniture` PASS, which now owns the old rule (a)) and rule (b) pin the template and the single construction. Scenario `permission` has not run |
| 2a | SC1: the answer is remembered per site | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | No code writes it, by design (D-11). Rule (l) derives every `setForPrincipal/removeFromPrincipal/addFromPrincipal/perms.add*` under `powerbrowser/shell`; the one hit is `webTabSetPermission` (:4907). The stock PermissionUI callback writes the grant. Scenario `remember` has not run |
| 2b | SC1: the remembered choice shows in the Phase 31 site panel | ✓ VERIFIED | `SITE_INFO_PERMISSION_IDS = ["camera","microphone","geo","desktop-notification","autoplay-media","popup"]` (:4668) feeds `webTabPermissionRows`, which reads the same stock `SitePermissions` store the stock callback writes. 37-02-SUMMARY confirms the read path |
| 3 | SC1: a background tab's request waits until the tab is shown; cap 3 per tab with cancel-on-evict | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Facade `selectedBrowser` is the visible overlay (`promptVisibleTab` :7281 requires the host selection to be the current tab's node); stock TabSelect and TabClose drive show and cancel; `PROMPT_QUEUE_CAP = 3` (:7174). Rules (b)-(g), (i) and the facade audit (e) pass. Scenarios `background-queue`, `cancel-on-evict` have not run |
| 4 | SC2: while a page uses camera, microphone or screen, a sharing indicator shows | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Wiring is complete: `gBrowser.updateBrowserSharing` (powerbrowser.js:128) → `updateWebTabSharing` (:7362) → `sharingChanged` push → `renderSharing` (chrome-bar-widget.tsx:1630) with `SHARING_KINDS` marks and three copy rows. Only a `webRTC` part moves the marks (`"webRTC" in sharingState`, :7370), and navigation resets them (`resetWebTabSharing` :7380, called at :7266). Rule (ab) runs these against stub maps. No live WebRTC session |
| 5 | SC3: alert, confirm, prompt, leave-page and HTTP-auth dialogs appear and can be answered while the rest of the IDE stays usable | ? UNCERTAIN | The tree ships the stock window-modal fallback: no `getTabDialogBox` member anywhere in `powerbrowser.js` (only a comment at PowerBrowserAPI.sys.mjs:5499), no relay kind, no `dialogRequest` push. That is correct only if probe 1 returns `stock-keeps-ide-usable`. The verdict file is the owner default, `provisional: true`, no evidence. I read the upstream sources: `AppWindow::ShowModal` calls `EnableParent(false)` (upstream/xpfe/appshell/AppWindow.cpp:460), `nsWindow::SetModal` calls `gtk_window_set_modal` (upstream/widget/gtk/nsWindow.cpp:751), and PromptParent opens the commonDialog with `"centerscreen,chrome,modal,titlebar"` (upstream/browser/actors/PromptParent.sys.mjs:303-306) because the shell has no `getTabDialogBox`. This points to `stock-blocks-ide`. Human decision, see UAT 34 |
| 6 | SC3: a page that repeats dialogs can be stopped | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Stock checkbox in the stock dialog; suppression is upstream's, per browsing-context group. The static audit derives `ShouldPromptToBlockDialogs`/`DisableDialogs` from upstream. Scenario `stop-repeat` has not run |
| 7 | SC4: after a login the user is offered to save or update the password | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Stock `password-notification` template and `PopupAutoComplete` panel installed verbatim; furniture gate compares ids against upstream (`verify-shell-furniture` PASS, plants (ag)-(ai) red). `login-doorhanger-username-field` callback installed. No credential in any push, log or Theia source (grep: no password/credential in web-tab.ts; no log call names password/username). Scenarios `password-save`, `password-update` have not run |
| 8 | SC5: per-tab notification bars appear for a blocked popup, a hung script and a protocol handler, and their actions work | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Three sources (`showBlockedPopupBar`, `installHangBars`, registrar wrap) → `setBar` → `notificationBar` push → bar host in web-tab.ts; copy via `notificationBarCopy` (chrome-bar-copy.ts:328). Actions in `BAR_ANSWERS` (:7574). Scenarios have not run |
| 9 | SC5: Allow on a blocked popup opens it as a web tab | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `openBlockedPopup` (:7654) calls the stock `popupAndRedirectBlocker.unblockPopup(browsingContext, innerWindowId, reportIndex)` after an http(s)/empty-URL wall; Phase 36's receivers adopt the replayed `window.open`. The join with Phase 36 has never run |
| P1 | Owner ruling: no allow, grant or permit kind exists that a frame could call | ✓ VERIFIED | `WEB_TAB_ACTION_KINDS` (:4662) holds 27 kinds; grep for `webTab\w*(Allow\|Grant\|Permit\|Doorhanger\|Prompt)` finds none in chrome or Theia source. `verify-permission-prompts` rule (d) is green and its self-test plants a `webTabDoorhangerAction`; `verify-web-tab-bridge` (+ self-test, 62 plants) is green. `allow-popup` is an enum value of `webTabBarAction`, not a kind |
| P2 | The `doorhanger` push is display-only; nothing in Theia answers a prompt | ✓ VERIFIED | The subscriber (web-tab.ts:504-518) reads `tabId`, `token`, `pending` and only adds or deletes a token in `pendingPrompts`; it sends nothing. No chrome code resolves `promptRecords` to answer (the comment at :7164 and rule (f) agree) |
| P3 | The only permission writes are the stock PermissionUI callback and the Phase 31 site panel's own edit | ✓ VERIFIED | One `setForPrincipal` call in the tree (:4907), inside `webTabSetPermission`, behind `webTabIdIsValid`, a known permission id and state, and an origin echo that must equal the tab's own `contentPrincipal.origin`. Rule (l) goes red on any other writer |
| P4 | `webTabBarAction` answers only a chrome-held record of the sender's own tab and frame, with a fixed action set per bar | ✓ VERIFIED | `webTabBarActionReply` (:7556) resolves `barRecords.get(token)`, refuses a record whose `tabId` or `theiaBrowser` differs from the sender's, and refuses an action not in `WEB_TAB_BAR_ACTIONS[record.barKind]`. It reads no URL, origin or principal from the frame. The group actor is registered for the Theia origin only |
| P5 | Theia never sees or syncs a credential | ✓ VERIFIED | Only the stock template fields and the stock prompter touch the login. No `password`/`credential` word in web-tab.ts; no log call names a username or password |
| P6 | The 37-REVIEW CR-01, CR-02 and WR-01..WR-07 fixes are in the tree | ✓ VERIFIED | CR-01 `tabHostAddTab(...)` in `adoptPendingOverlay` (:7144); CR-02 `"webRTC" in sharingState` (:7370); WR-01 `isPendingOverlay` (:7010) and `adoptPendingPushes` (:7401); WR-02 `resetWebTabSharing`; WR-03 `options.dismissed` guard (:7219); WR-04 `unblockPopup` (:7658); WR-05 `relayFeasibleFrom` (verify-prompts-live.mjs:709) and the `prompt-probe-verdict-live` row (verify-platform.sh:5206); WR-06 catalogue rows, `--catalogue` PASS; WR-07 plants, `--self-test --static` PASS. Commits `b33f8953`..`7b104dbc` are in the log. Their live behavior is item P-live below |
| P7 | The provisional probe verdict cannot pass the full gate | ✓ VERIFIED | `prompt-probe-verdict.json` has `provisional: true`, empty evidence. Rule (p) names it provisional in the plain gate and goes red under `--require-live-verdict` (self-test plant "provisional verdict under --require-live-verdict -> red"). The full-set row `prompt-probe-verdict-live` fails by design until a live run supersedes it. That is expected, not a gap |
| P8 | The static gates for this phase are green and their plants go red | ✓ VERIFIED | See Behavioral Spot-Checks |

**Score:** 9/18 truths verified (8 present but behavior-unverified, 1 uncertain, 0 failed)

### Deferred Items

None. Step 9b: Phase 38 (WebExtensions) is the only later phase in the milestone. Its goal and success criteria do not name the sharing indicator, `getTabSharingState`, or any Phase 37 carry-over, so none of the Phase 37 open items is deferred to it.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | Phase 37 sections: prompts (:7156), bars (:7433), `webTabBarAction` arm (:5185) | ✓ VERIFIED | Substantive; each helper named above exists and is wired |
| `powerbrowser/shell/powerbrowser.js` | `updateBrowserSharing` on the stand-in; no `getTabDialogBox` | ✓ VERIFIED | :128 calls `updateWebTabSharing`; no dialog member |
| `powerbrowser/shell/powerbrowser.xhtml` | stock `notification-popup`, `webRTC-shareDevices`, `password-notification`, `PopupAutoComplete` templates | ✓ VERIFIED | Compared with upstream by the furniture gate (PASS) and rules (j), (q) |
| `theia/extensions/tab-uris/src/browser/web-tab.ts` | `doorhanger`, `sharingChanged`, `notificationBar` subscribers; bar host | ✓ VERIFIED | Subscribers present; bar host shrinks the published page rect |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` | sharing indicator; bar copy hand-off | ✓ VERIFIED | `renderSharing` :1630, rendered at :1854 |
| `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx` | pending-prompt mark | ✓ VERIFIED | Copy `pendingPrompt` (chrome-bar-copy.ts:71) |
| `scripts/verify-permission-prompts.mjs` | rules (b)-(ae), 52 plants | ✓ VERIFIED | PASS; self-test 52 plants red |
| `scripts/verify-prompts-live.mjs` | 16 scenarios, 21 plants | ✓ VERIFIED (static) | `--self-test --static` PASS; live half not run |
| `.planning/probes/prompt-probe-verdict.json` | probe 1 verdict | ⚠️ PROVISIONAL | Owner default, no evidence; replaced only by a live `dialog-probe` run |
| `powerbrowser/INTERNAL-APIS.md` | rows for every new touchpoint | ✓ VERIFIED | `--catalogue` PASS (all three files) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `PermissionUI` / `WebRTCParent` show | `doorhanger` push | instance `show` wrap composing `options.eventCallback` | ✓ WIRED | Display-only; `pushDoorhanger` :7318 |
| `WebRTCParent.updateIndicators` | chrome bar mark | `gBrowser.updateBrowserSharing` → `updateWebTabSharing` → `sharingChanged` → `renderSharing` | ✓ WIRED | Chrome-observed; a forged frame flag has no entry point |
| `webTabActivated` | stock `anchorVisibilityChange` | `setActiveTabOfFrame` (:7290) | ✓ WIRED | Shows and hides a waiting prompt on IDE↔web focus moves |
| `adoptPendingOverlay` | tab host | `tabHostAddTab(..., pending.opener)` (:7144) | ✓ WIRED | Closes the CR-01 hole; rule (a) of `verify-ext-tab-host-scope` admits exactly this call (PASS, 26 plants) |
| bar button | `BAR_ANSWERS` | `webTabBarAction {tabId, token, action}` | ✓ WIRED | Token resolved to a chrome-held record |
| `allow-popup` | Phase 36 adoption | stock `unblockPopup` → page `window.open` → `adoptContentWindow` | ⚠️ WIRED (unrun) | Statically sound; the live popup-block scenario is the first run |
| Phase 37 prompt furniture | `installShellFurniture` | folded in by `4d34ce5e` | ✓ WIRED | Furniture gate lists the prompt templates in its wired set |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Sharing indicator | `currentWebTab().sharing` | `sharingChanged` push from webrtcUI state | Yes by construction; no live session | ✓ FLOWING (static) |
| Pending-prompt mark | `widget.pendingPrompts` | `doorhanger` push from the stock eventCallback | Yes by construction | ✓ FLOWING (static) |
| Notification bar | `bar.displayFields` | `setBar` from blocker / hang monitor / registrar | Yes by construction | ✓ FLOWING (static) |
| Site panel permission rows | `webTabPermissionRows` | stock `SitePermissions.getForPrincipal` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Permission-prompt gate | `node scripts/verify-permission-prompts.mjs` | exit 0; "dialog outcome stock-keeps-ide-usable (PROVISIONAL ...)" | ✓ PASS |
| Its plants | `... --self-test` | exit 0; "52 planted faults all went red" | ✓ PASS |
| Live harness, offline half | `node scripts/verify-prompts-live.mjs --self-test --static` | exit 0; 21 plants each target a scenario and name an emitted failure | ✓ PASS |
| Shell furniture | `node scripts/verify-shell-furniture.mjs` and `--self-test` | both exit 0; plants (a)-(ai) red | ✓ PASS |
| Web tab bridge | `node scripts/verify-web-tab-bridge.mjs` and `--self-test` | both exit 0; 62 plants red | ✓ PASS |
| Ext tab host scope | `node scripts/verify-ext-tab-host-scope.mjs` and `--self-test` | both exit 0; 26 plants red | ✓ PASS |
| Internals catalogue | `bash scripts/check-internals-boundary.sh --catalogue` | exit 0 | ✓ PASS |
| upstream untouched | `git -C upstream diff --quiet` | exit 0 | ✓ PASS |
| Any live scenario | not run, as instructed | n/a | ? SKIP |
| `verify-platform.sh --quick` | not run (three other verifiers share the host; the named static gates above are its Phase 37 rows) | n/a | ? SKIP |

### Probe Execution

No `scripts/*/tests/probe-*.sh` is declared by any Phase 37 plan. Research probe 1 is the live `dialog-probe` scenario (UAT 8); its verdict file is provisional.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROMPT-01 | 37-01, 37-02 | Asked before camera, microphone, location, notifications; choice remembered per site | ? NEEDS HUMAN | Truths 1, 2a, 2b, 3. Static wiring complete; live scenarios unrun |
| PROMPT-02 | 37-02 | Sharing indicator | ? NEEDS HUMAN | Truth 4. The click-to-site-panel in 37-UI-SPEC is not built (UAT 35) |
| PROMPT-03 | 37-03 | Working alert, confirm, prompt, leave-page, HTTP-auth that do not lock the IDE; stoppable | ? NEEDS HUMAN | Truths 5, 6. Probe 1 provisional; source points to stock-blocks-ide |
| PROMPT-07 | 37-04 | Offered to save or update a password | ? NEEDS HUMAN | Truth 7 |
| PROMPT-09 | 37-04 | Per-tab bars with actions | ? NEEDS HUMAN | Truths 8, 9 |

All five requirement IDs appear in a plan's `requirements` field (37-01: PROMPT-01; 37-02: PROMPT-01, 02; 37-03: PROMPT-03; 37-04: PROMPT-07, 09). No orphans: REQUIREMENTS.md maps PROMPT-04/06/08 to Phase 35 and PROMPT-05 to Phase 36. REQUIREMENTS.md still lists all five as Pending, which is correct until the live pass.

### Prohibitions

| Plan | Prohibition | Tier | Disposition |
|------|-------------|------|-------------|
| 37-01 | No PopupNotifications outside the furniture installer; no sender-supplied origin | judgment | One construction (:7208, grep over `powerbrowser/shell` finds no other). Principal is the overlay's own (`browser.contentPrincipal`). Non-authoritative pass, flagged |
| 37-01 | No answer from a Theia widget, frame message or webTab kind (D-11) | judgment | Rules (d), (f) and (g) and the bridge gate go red on a planted `webTabDoorhangerAction`; subscriber reads only. Verified by test; the judgment wording is also flagged |
| 37-01 | No BiDi DOM assertion on `#notification-popup` | backstop | The live harness reads page-side and chrome-side outcomes; I found no BiDi query of the panel. `insufficient_spec` for a held-out test: flagged for human |
| 37-01/02/04 | Do not re-implement a missing Phase 31/35/36 dependency | judgment | Phase 35 and 36 were merged before the review fixes; the pre-merge `typeof` guard and `openStockTab` fallback were removed (`1fd843af`). Flagged |
| 37-02 | No second permission writer | judgment | Rule (l) derives writers; one found, Phase 31's. Verified by test |
| 37-02 | No indicator driven by a frame flag | judgment | Rule (n); the `sharing` live scenario forges a frame message that must show nothing. Verified statically; live forgery check unrun |
| 37-02 | No Theia Remember toggle or remember field | judgment | Rule (m). Verified by test |
| 37-03 | No dialog relay unless probe 1 proves the block (D-06) | judgment | No relay exists. Satisfied now; becomes an open question when probe 1 returns (UAT 34) |
| 37-03 | No `getTabDialogBox` added speculatively | backstop | Rule (p) and `verify-shell-gbrowser-standin` pin it absent; explicit test. Verified |
| 37-04 | No password sync Theia↔chrome | judgment | P5. Non-authoritative pass, flagged |
| 37-04 | No frame-supplied URL loaded with chrome authority for Allow or Open | judgment | Allow replays chrome-held identifiers; `add-handler` uses the stored `protocol/uri/name`. Flagged |
| 37-04 | Bars not in `BLOCKING_LAYER_SELECTOR`, never cover page content | backstop | The selector (web-tab.ts:115) lists no bar class; the live `popup-block` scenario asserts the rect shrink. Explicit test exists but unrun. Flagged |
| 37-04 | No `getNotificationBox` / `getTabBrowser` stand-in | judgment | grep of powerbrowser.js: none. Verified |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (Phase 37 files) | n/a | `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, `PLACEHOLDER` | none | Grep over the ten Phase 37 source files finds none |
| PowerBrowserAPI.sys.mjs | 7207-7217 | `doorhanger` push carries `displayHost` that nothing reads, and it is the top-level host, not the requester's | ℹ️ Info (37-REVIEW IN-01, unfixed) | None today; wrong if ever displayed |
| PowerBrowserAPI.sys.mjs | 7257-7266 | A reloaded frontend loses the pending-prompt marks (IN-02, unfixed) | ℹ️ Info | Bell missing after a Theia reload |
| chrome-bar-copy.ts | 71 | Pending mark says "permission" for a password offer, and stays on the current tab (IN-03, unfixed) | ⚠️ Warning | Copy accuracy, not a contract failure |
| PowerBrowserAPI.sys.mjs | 7146 | The cap counts only never-shown records (IN-04, unfixed) | ℹ️ Info | The cap is looser than "three waiting per tab" |

### Human Verification Required

37-UAT.md holds 41 items. In order: the 17 live scenarios and the live self-test (1-17); the ten review-fix checks (18-27); the six visual checks on KDE Wayland (28-33); the 37-03 gate (34); owner decisions (35-41).

### Gaps Summary

**No gaps.** Nothing the static tree shows missing or wrong against ROADMAP's five criteria or the owner ruling. The owner ruling holds: no allow, grant or permit kind exists, the `doorhanger` push is display-only, and the one `webTab*` answer kind (`webTabBarAction`) is for bars, which the owner confirmed on 2026-10-25 are not permission prompts. One pre-existing writer, the Phase 31 site panel's `webTabSetPermission`, can set a persistent value from the Theia frame. It is the user's own settings edit, not a prompt answer, and it is called out as UAT 40 so the owner can confirm that it satisfies the ruling.

**Warning, not a gap: PROMPT-03 is likely to fail the probe.** Criterion 3 needs the dialogs to leave the IDE usable. The tree ships the stock window-modal fallback on an owner-default `stock-keeps-ide-usable` verdict that has no evidence. I read the three facts in upstream that 37-03-SUMMARY cites, and they are as quoted (`AppWindow.cpp:460` `EnableParent(false)`, `nsWindow.cpp:751` `gtk_window_set_modal`, `PromptParent.sys.mjs:303-306` the `modal` feature string). A live probe will most likely return `stock-blocks-ide`. Then rule (p) goes red until one of two things happens:

- `relayFeasible` is true: the relay (a `getTabDialogBox` stand-in with the Pitfall 2 call-site audit, `webTabDialogAnswer`, a `dialogRequest` push) must be built. That is more work in this phase, planned and run again.
- `relayFeasible` is false: PROMPT-03 cannot be met as written, and the phase routes to the owner (ROADMAP "Needs Chris").

`relayFeasible` is now a real measurement (WR-05) and can be false. After the CR-01 fix, adopted tabs have `getTabForBrowser` nodes, so the remaining false terms are `authSpoof` without `gURLBar.setURI` and `setTabLabelForAuthPrompts` (a stand-in widening). Which it will be is not decidable without the live run.

The 37-REVIEW fixes landed, but all are "needs live check". The two most exposed are the CR-01 tab-host join (every Phase 36 adopted-tab consumer now sees host nodes) and the WR-04 replay (the first run of the join with Phase 36's receivers).

---

_Verified: 2026-11-01_
_Verifier: Claude (gsd-verifier)_
