# Phase 37: Permission Prompts and Dialogs - Research

**Researched:** 2026-10-22
**Domain:** Gecko permission/dialog furniture + Theia chrome-bar surfaces
**Confidence:** HIGH (Gecko paths read at ESR tag; Theia 1.76 APIs in-tree)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01 stock PopupNotifications + native panel anchored to Theia-reported rect
- D-02 camera/mic/location/notifications only; remembered per site via SitePermissions keyed by tab's own contentPrincipal
- D-03 never an `allow` frame-callable kind; webTabDoorhangerAction fixed enum + chrome-side callbacks
- D-04 background-tab queue until webTabActivated
- D-05 sharing indicator in chrome bar from webrtcUI state
- D-06 stock window-modal dialog iff KDE Wayland probe shows IDE usable, else tab-scoped relay; repeating dialogs stoppable per tab
- D-07 password save/update via LoginManagerPrompter + hidden inputs in powerbrowser.xhtml
- D-08 per-tab notification bars shrinking page rect; Allow via Phase 36 adoption path
- D-09 WebRTC device picker UI deferred; D-10 copy in CHROME_BAR_COPY + appSubject()
</user_constraints>

## Summary

Phase 37 lights up the stock page-prompt actors that already run in overlays (PermissionUI/ContentPermissionPrompt, LoginManagerPrompter, PromptParent, PopupAndRedirectBlocking/RefreshBlocker, WebRTCParent) by installing the shell furniture they feature-detect: `window.PopupNotifications` + the panel set from `upstream/browser/base/content/popup-notifications.inc.xhtml` (`#notification-popup` `:7-14`, `webRTC-shareDevices-notification` `:16-77`, `password-notification` `:100-115`), `gBrowser.getTabDialogBox` absent-as-fallback unless probe 1 forces the audited relay member (D-06: no deliberate-absence option), and chrome-observed `webrtcUI.updateIndicators` sharing state (`WebRTCParent.sys.mjs:141-158`). All chrome→frontend traffic rides the one `PowerBrowserWebTabState` push with new kinds (`doorhanger`, `sharingChanged`, `dialogRequest`, `notificationBar`); all frontend→chrome answers are token + fixed enum on `webTab*`-prefixed kinds (`webTabDoorhangerAction`, `webTabBarAction`, `webTabDialogAnswer` — N1: the prefix is REQUIRED because `scripts/verify-web-tab-bridge.mjs` derives kinds only from `case "webTab..."` / `kind: 'webTab...'` and rule 11 compares that set with KIND_CLASSES; a non-prefixed answer name shows only as a stale entry and escapes the unclassified rule; classified `tab-lifecycle` with self-test plants). XUL panels are BiDi-blind, so gates assert page-side outcomes (permission state, opener existence, bar-driven geometry) plus KWin screenshots, never BiDi DOM reads of panels.

**Primary recommendation:** extend Phase 35 `installShellFurniture(win)` in place; instantiate the real `PopupNotifications.sys.mjs` against a minimal tabbrowser façade; keep callbacks chrome-side; queue background-tab requests; drive the bar/indicator from state pushes.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `toolkit/modules/PopupNotifications.sys.mjs` | Gecko 153.5esr | doorhanger object (`show`, `remove`, `getNotification`) | What PermissionUI/LoginManager call; stock strings, stock anchoring |
| `browser/modules/PermissionUI.sys.mjs` + `browser/components/permissions/ContentPermissionPrompt.sys.mjs` | 153.5esr | permission request → PopupNotifications | Already runs in overlays; today cancels for lack of `chromeWin.PopupNotifications` |
| `browser/modules/SitePermissions.sys.mjs` | 153.5esr | per-site remember (`setForPrincipal`, `getAllForBrowser`) | Browser-scoped, works on overlay; Phase 31 panel reads same source |
| `toolkit/components/passwordmgr/LoginManagerPrompter.sys.mjs` | 153.5esr | save/update password doorhanger | Reads `documentGlobal.PopupNotifications` (`LoginManagerPrompter.sys.mjs:142,583,709`) + the stock template fields `#password-notification-username` (`popup-notifications.inc.xhtml:102`) / `#password-notification-password` (`:110`); fills them itself (`:290-303`) and reads back edits (`:308-314`) |
| `browser/actors/PromptParent.sys.mjs` | 153.5esr | alert/confirm/prompt/beforeunload/HTTP-auth | Feature-detect `win?.gBrowser?.getTabDialogBox` (`PromptParent.sys.mjs:222`); absent falls back to window-modal `Services.ww.openWindow(win, uri COMMON_DIALOG ...)` (`:154,156,295-307`); present enters the `getTabDialogBox(browser)` branch (`:224`) |
| `toolkit/components/antitracking/ContentBlockingAllowList.sys.mjs` | 153.5esr | not in scope (Phase 31) | Listed to prevent scope creep |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `WebTabChannel.onPush` router | tree (27-02) | subscribe `doorhanger/sharingChanged/dialogRequest/notificationBar` | Every new push |
| `webTabGeometry` shrink | tree (27) | notification bars + find bar shrink placeholder | Bars belonging to page |
| Phase 36 adoption (`webTabAdopt {pendingId}`) | Phase 36 | Allow-on-blocked-popup opens as web tab | Never load frame-supplied URL with chrome authority |
| KWin screenshots (`spectacle`/`grim`) | host | visual evidence for BiDi-blind panels | Manual-only rows in VALIDATION.md |

## Architecture Patterns

```
page event (permission/prompt/auth/popup-block/hang)
  → stock actor (PermissionUI/PromptParent/PopupBlocking/RefreshBlocker)
  → shell furniture (PopupNotifications panel | commonDialog | bar push)
  → PowerBrowserAPI.sys.mjs end-of-file section (append-only)
  → PowerBrowserWebTabState {kind: doorhanger|sharingChanged|dialogRequest|notificationBar}
  → WebTabWidget / chrome-bar (token + display-only fields)
  → webTabDoorhangerAction|webTabBarAction|webTabDialogAnswer {token, action: fixed enum} (N1 names)
  → chrome looks up token → stored callback/principal → SitePermissions/store/the Phase-36 path
```

### Pattern 1: Real PopupNotifications, minimal tabbrowser façade
What: construct `PopupNotifications(tabbrowserLike, panel, null)` with `iconBox` null. Anchoring resolves ONLY through `getAnchorFromBrowser` (`PopupNotifications.sys.mjs:47-61`, read at `Notification.anchorElement` `:161-166`), and `_update` shows a panel only when an anchor exists (`:1517-1519`); therefore set `popupnotificationanchor` (ICON_ANCHOR_ATTRIBUTE, `:16`) on EVERY overlay at creation, pointing at the chrome-bar anchor element (N4 choice; 37-01 T2). The rejected alternative is an `iconBox` containing the stock `notification-popup-box` ids verbatim (`upstream/browser/base/content/navigator-toolbox.inc.xhtml:295-345`: `default-notification-icon`, `geo-notification-icon`, `webRTC-shareDevices-notification-icon`, `password-notification-icon`, siblings). Never a full tabbrowser; every added member is audited against all upstream `gBrowser` readers per Pitfall 2. Both custom-element callbacks the templates need are furniture: `webrtc-preview` (`browser.js:623-625`) and `login-doorhanger-username-field` (`browser.js:631-634`, N3) via `customElements.setElementCreationCallback` in the installer under the Phase 27 policy.
When: D-01/D-07.

### Pattern 2: Chrome holds payload, Theia holds token (ARCH Pattern 2)
What: doorhanger record `{id, browser, principal, callbacks, eventCallback topics}` stays chrome-side in a `Map` cleared on `webTabClose`/`webTabDropOwnedBy`; push carries `{id, tabId, message(stock key or display text), anchorKind, actions:[fixed enum]}`.
When: every doorhanger/bar/pending action.

### Pattern 3: Enum-not-URL across the wall (ARCH Pattern 3)
What: Allow/Open answers carry `{token, action}`; chrome resolves the blocked URI from its own stored `PopupBlocking` data or pending overlay, then routes through Phase 36 adoption. No URL crosses Theia→chrome.
When: D-08 Allow; protocol-handler Open.

### Pattern 4: Rect-anchored native panel (ARCH Pattern 4)
What: chrome bar reports identity-box rect; chrome calls `panel.openPopup(anchorElement, ...)` or positions `#notification-popup` over the reported rect; re-reported on layout/mode/resize via the drag-region re-measure precedent.
When: D-01/D-07.

### Pattern 5: Bars shrink, panels float (Pitfall 8 rules b/d)
What: notification bars render inside `WebTabWidget` and shrink the placeholder (published rect shrinks, page moves down); doorhangers/dialogs never enter `BLOCKING_LAYER_SELECTOR`.
When: D-08; find-bar precedent (Phase 32 assumption).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| doorhanger UI in Theia | custom React doorhanger | real `PopupNotifications` + native panel | stock strings, a11y, eventCallback topics, password-DOM coupling |
| permission remember store | new sqlite table | `SitePermissions` per principal | Phase 31 panel reads same; no second writer |
| dialog modality | Theia modal for all dialogs by default | stock `commonDialog` unless probe 1 fails | PROMPT-03 accepts stock iff IDE usable; relay is large/fragile (D5) |
| popup Allow | `webTabNavigate(url-from-frame)` | Phase 36 pending-overlay adoption | frame-supplied URL + chrome authority = escalation |

## Common Pitfalls

### Pitfall 1: Adding a gBrowser member retargets unrelated actors (PITFALLS Pitfall 2)
What goes wrong: adding `getTabDialogBox` to support one path moves every `alert()` onto a code path whose other members (`getTabForBrowser`, `selectedBrowser`, `setTabLabelForAuthPrompts`) the stand-in lacks.
How to avoid: before adding any stand-in member, grep every upstream `gBrowser`/`tabbrowser` reader reachable from overlay actors, record the branch each takes, and widen the REAL derivation (`UPSTREAM_SCOPE` + `DELIBERATELY_ABSENT` in `scripts/verify-shell-gbrowser-standin.mjs:87,132`); `--self-test` plants a new caller.

### Pitfall 2: "Already works" without a page-side assertion (Pitfall 3)
What goes wrong: upstream fails silently when furniture is missing; a green BiDi DOM check proves nothing about panels BiDi cannot see.
How to avoid: every gate asserts page-side outcomes (permission state via `navigator.permissions.query`/geolocation error shape, `window.open` opener, bar geometry delta, SitePermissions read-back) + KWin screenshot manual rows.

### Pitfall 3: Bars that occlude instead of shrink (Pitfall 8)
What goes wrong: bar in blocking layer blanks the page; bar outside layer but absolutely positioned covers content and breaks clicks.
How to avoid: bars live in widget flow above page, placeholder shrinks, published `webTabGeometry` shrinks; derived check pins bar classes outside `BLOCKING_LAYER_SELECTOR`.

### Pitfall 4: Frame-callable allow (ROADMAP Notes / D-03)
What goes wrong: a `webTabAllow {origin}` kind lets any frame grant itself camera/mic.
How to avoid: no such kind; bridge gate rule pins the forbidden names; plants attempt registration and must go red.

## Code Examples

```js
// PowerBrowserAPI.sys.mjs end-of-file section (append-only; catalogue line never moves)
// Source: ARCH Pattern 5 + INTERNAL-APIS.md:26-30 append-only rule
import { PopupNotifications } from "moz-src:///toolkit/modules/PopupNotifications.sys.mjs";
function installPermissionFurniture(win) {
  const panel = win.document.getElementById("notification-popup");
  win.PopupNotifications = new PopupNotifications(tabbrowserLike(win), panel, ...);
}
```

```ts
// web-tab.ts push subscription (Pattern 1: one push name, many kinds)
// Source: 27-02 WebTabChannel.onPush precedent
channel.onPush("doorhanger", (d) => doorhangerStore.show(d as DoorhangerRecord));
channel.onPush("notificationBar", (d) => barHost.show(d as BarRecord));
```

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | plain-node derive-and-compare scripts + BiDi live scripts; one driver `scripts/verify-platform.sh` |
| Config file | registry inside `scripts/verify-platform.sh` (`CHECKS=(` for `--quick`; live block for full) |
| Quick run command | `scripts/verify-platform.sh --quick` |
| Full suite command | `scripts/verify-platform.sh` (needs built binary + last Theia build) |
| Estimated runtime | ~90 s quick; live rows add minutes |

Tiers: **S** static gate (`--quick` + `--self-test`); **L** live BiDi probe (`scripts/lib/pb-live-probe.mjs`, `-purgecaches`); **M** manual KWin screenshots for BiDi-blind XUL.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| PROMPT-01 | permission doorhanger asks; remembered per site; background waits | S+L | `verify-permission-prompts.mjs` + live `verify-prompts-live.mjs` (permission, remember, background-queue) | ❌ Wave 0 |
| PROMPT-02 | sharing indicator while camera/mic/screen live | S+L | same gates (sharing scenarios) | ❌ Wave 0 |
| PROMPT-03 | dialogs answerable, IDE usable, stoppable | S+L+M | same gates + KWin screenshot manual row | ❌ Wave 0 |
| PROMPT-07 | password save/update offered | S+L | same gates (login scenarios) | ❌ Wave 0 |
| PROMPT-09 | per-tab bars appear; Allow opens as web tab | S+L | same gates (popup-block, hang, handler scenarios) | ❌ Wave 0 |
| groundwork | furniture installed via one installer; no frame-callable allow; stand-in deltas derived | S | `--only shell-furniture`, `--only web-tab-bridge`, `--only internals-boundary` (+ self-tests) | ✅ grows |

Sampling: after every task commit `--quick`; after every plan wave `--quick` + live script after a Theia build; before verify-work full green. Max latency ~90 s quick.

Wave 0: `scripts/verify-permission-prompts.mjs` (+`--self-test` plants), live `scripts/verify-prompts-live.mjs` (+`--self-test` plants), registry rows in `verify-platform.sh`.

## Assumes from Earlier Phases (refresh before run)

- Phase 27: push router + `onPush` subscription discipline; `webTabActivated` keyed by sender embedder; privileged-kind rule + `KIND_CLASSES` set equality in `verify-web-tab-bridge.mjs`; `webTabGeometry` placeholder contract; layer policy + `BLOCKING_LAYER_SELECTOR`; live-probe harness (`pb-live-probe.mjs`, `-purgecaches`, push recorder); shared-process blank defect (deferred-items) still open.
- Phase 29: `resolveTypedAddress` http(s) wall + engine submission; token-cookie strip (loopback-port scoping, fail-closed, exempt-from-clear-data); `STORE_REQUEST_KINDS` classification (privileged/network) + rule 12; copy gate (`CHROME_BAR_COPY` + `appSubject()` + `verify-shell-error-copy.mjs` set equality); IME/select-all/drafts behavior in pill.
- Phase 30: pill lives in `address-bar/`; modes contributions + Command centre via `QuickAccessRegistry.getPicks` (never sends typed text to engines); recursive gate scans must include `address-bar/`; `verify-address-bar-*` gates green.
- Phase 31 (planned at write time): site information panel + `SitePermissions.getAllForBrowser` read path; security-state push fields; `openStockPage {page}` enum; shield/permissions icons. If Phase 31 reshaped the panel contract, rebind D-02/D-05 display surface.
- Phase 31.1: tab host (`getTabForBrowser` reversal for tab host only, http(s)-only guard, Theia frame never in tracker, derived `browserWindows` set equality); `verify-shell-gbrowser-standin.mjs` member set.
- Phase 32 (planned): find bar shrinking precedent; `browser.finder`/`fullZoom`/mute patterns; downloads `getList` view + token-not-payload precedent.
- Phase 35 (created in 35-02-PLAN.md; context menu in 35-03, autocomplete in 35-06, fullscreen in 35-07; NOT in the tree today, `installShellFurniture` greps 0 hits under `powerbrowser/`): `installShellFurniture(win)` single installer + `verify-shell-furniture.mjs` derived check; `nsContextMenu` stub + `#contentAreaContextMenu`; `PopupAutoComplete`; `remoteBrowserTooltip`; `FullScreen` shim; windowtype never `navigator:browser`.
- Phase 36 (planned): `nsIBrowserDOMWindow` opener branching (Theia-frame opener → stock window/GUI-01); pending-overlay create with wire vocabulary `webTabAdopt` (frontend-to-chrome request arm, classified `tab-lifecycle`) + `adoptTab` (chrome-to-frontend push, 36-01-PLAN.md:118,121,175) + 5 s fallback; `browser-window-command.ts` on actor kind; GUI-01 live row green. Phase 36 is NOT in the tree today (`webTabAdopt`/`adoptTab` grep 0 hits under `theia/`, `powerbrowser/`, `scripts/`); every 37 plan lists the adopt vocabulary in `## Assumes from earlier phases`, and absence at execution time is a blocker the executor reports, never re-implemented.
- GSD tiers: S vs L vs M as above; no `git add/commit/stash/checkout`; no builds. Live probes run AT EXECUTION TIME (probe 1 is a live run under the built binary); planning output performs no live runs.

## Threat Model

| Boundary | Description |
|----------|-------------|
| page → chrome (request) | untrusted page/frame triggers stock actors; chrome keys by overlay identity + own principal |
| chrome → Theia (push) | display-only + token; no callbacks/principals/URLs cross |
| Theia → chrome (answer) | token + fixed enum; no URL/origin/principal accepted |

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-37-R-01 | Spoofing | permission origin display | medium | mitigate | display derives from chrome principal's base domain; Theia never supplies origin text |
| T-37-R-02 | Elevation | frame-callable allow | high | mitigate | forbidden-kind rule in bridge gate; plants must go red |
| T-37-R-03 | Elevation | Allow-popup URL | high | mitigate | enum + stored blocked-URI + Phase 36 adoption; http(s) wall on result |
| T-37-R-04 | Tampering | background-queue starvation | low | mitigate | FIFO cap + activation flush; queue cleared on tab close |
| T-37-R-05 | Info disclosure | password inputs sync | medium | mitigate | hidden inputs Theia→chrome only; values never pushed to frontend; logs carry kind+class only |
| T-37-R-06 | DoS | repeating dialogs | medium | mitigate | per-tab suppress flag + stop checkbox; checkbox state chrome-side |
| T-37-SC | Tampering | npm/pip/cargo installs | low | accept | no manifest/lockfile change in phase diff |

## Must_Haves (research-level)

- truths: ["Every new gate derives expectations from the tree and compares as a set", "Every new gate has --self-test planting faults that go red", "No plan ships a frame-callable allow kind", "BiDi-blind XUL is proven by page-side outcomes + KWin screenshots"]
- artifacts: [`37-RESEARCH.md` this file]

## Verify

- `scripts/verify-platform.sh --quick` — still green after each research edit (no code changed here).
- fails_when: any row reds, or a cited upstream path:line does not exist at `FIREFOX_153_5_0esr_BUILD1`, or a gate asserts BiDi DOM on `#notification-popup`.
- fails_when: any row reds, or a cited upstream path:line does not exist at `FIREFOX_153_5_0esr_BUILD1`.

## Sources

Primary (HIGH): `upstream/` at pinned tag (`PopupNotifications.sys.mjs`, `PermissionUI.sys.mjs`, `ContentPermissionPrompt.sys.mjs`, `SitePermissions.sys.mjs`, `LoginManagerPrompter.sys.mjs`, `PromptParent.sys.mjs`, `WebRTCParent.sys.mjs`, `ContentParent.cpp:5428-5510`, `nsFrameLoader.cpp:2733-2739`, `nsWindowWatcher.cpp:2588-2675`); tree (`PowerBrowserAPI.sys.mjs`, `powerbrowser.js`, `powerbrowser.xhtml`, `INTERNAL-APIS.md`, `web-tab.ts`, `chrome-bar/*`, `scripts/verify-*.mjs`); Theia 1.76 installed packages.
Secondary (MEDIUM): `.planning/research/*` (STACK/ARCH/FEATURES/PITFALLS/SUMMARY/gap list) — verified against tree this session.
Tertiary (LOW): none — no web source used.

## Metadata

- Confidence: HIGH (stack/arch), HIGH (pitfalls — tree-verified), MEDIUM (dialog-usability outcome until probe 1 runs live).
- Research date: 2026-10-22. Valid until upstream re-pin or Phase 31/35/36 contract change.
