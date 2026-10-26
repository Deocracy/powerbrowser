---
phase: "37"
slug: "permission-prompts-and-dialogs"
status: draft
shadcn_initialized: false
preset: none
created: "2026-10-22"
---

# Phase 37 — UI Design Contract

> Visual and interaction contract for permission doorhangers, sharing indicator, dialogs, password save, notification bars. Extends 27-UI-SPEC layer policy, 29-UI-SPEC pill/dropdown, 30-UI-SPEC modes. No Theia core patch, no custom browser chrome; stock toolkit popups with stock strings are shell furniture (rule 5 ruling 2026-10-20).

**Scope note.** This phase adds no new chrome-bar widget. It contracts: (a) doorhanger anchored at identity box via native panel over Theia-reported rect; (b) sharing indicator in chrome bar; (c) window-modal stock dialogs (kept iff IDE stays usable) or tab-scoped relay; (d) password save/update doorhanger; (e) per-tab notification bars shrinking page rect. Copy in `CHROME_BAR_COPY` + `appSubject()`; `verify-shell-error-copy.mjs` pins by set equality.

## Design System

| Property | Value |
|----------|-------|
| Tool | **none**. No Vite/Next app; Theia widgets inherit `--theia-*` theming; second token system would fork theming and break rebrand-without-recompile (standing reasons 01/13/27/29/30-UI-SPEC). |
| Preset | not applicable |
| Component library | `@theia/core@1.76.0` primitives only (`ReactWidget`, `MenuPath` for notification-bar actions where needed). Doorhanger itself is stock `PopupNotifications` + `<panel id="notification-popup">` — not a Theia component. |
| Icon library | Codicons via installed `@vscode/codicons` (`camera`, `mic`, `location`, `bell`, `shield`, `warning`, `info`, `close`). No new icon package. |
| Font | Delegated: bar/bars inherit Theia UI font; `@powerbrowser/*` carries no font-family literal. |

## Spacing Scale

Declared values (multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | indicator dot padding, bar action gaps |
| sm | 8px | notification-bar inner padding, doorhanger anchor offset |
| md | 16px | bar-to-content gap |
| lg | 24px | panel min offset from bar |
| xl | 32px | unused |
| 2xl | 48px | unused |
| 3xl | 64px | unused |

Exceptions: doorhanger panel geometry is stock Gecko (not token-governed); only the anchor rect origin is ours.

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body (bar text) | 13px (Theia default) | 400 | 1.5 |
| Label (indicator tooltip, bar message) | 12px | 400 | 1.5 |
| Heading | n/a (no custom headings; stock dialog/panel strings govern) | — | — |
| Display | n/a | — | — |

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--theia-editor-background)` | page, bars inherit editor surface |
| Secondary (30%) | `var(--theia-sideBar-background)` | notification bar background |
| Accent (10%) | `var(--theia-focusBorder)` | sharing-active ring, blocked-popup Allow affordance |
| Destructive | `var(--theia-errorForeground)` | hung-script stop/destructive action only |

Accent reserved for: sharing-active indicator ring, Allow-on-blocked-popup action, permission-remembered icon in identity box. Never for body text.

## Copywriting Contract

All sentences live in `CHROME_BAR_COPY`; `{App}` = `appSubject()` (configured app name, never literal "PowerBrowser" in code).

| Element | Copy |
|---------|------|
| Permission doorhanger | Stock Gecko strings (not authored). Theia-side fallback title only: `{App} needs your answer before the page continues` |
| Sharing indicator tooltip | `{App} is sharing your camera / microphone / screen with this tab` (one per active kind) |
| Dialog relay title | `{App} dialog from this tab` (only if relay built; stock dialog keeps stock strings) |
| Stop-repeating checkbox/row | `Stop this page from showing more dialogs` |
| Password save | Stock `LoginManagerPrompter` strings (not authored) |
| Notification bar: blocked popup | `{App} blocked a popup from this page.` + actions `Allow` / `Don't show again for this site` |
| Notification bar: hung script | `A script on this page is taking too long.` + actions `Stop script` / `Keep waiting` |
| Notification bar: protocol handler | `This page wants to open another app.` + actions `Open` / `Don't allow` |
| Empty state | n/a (bars/doorhangers appear only on event) |
| Error state | `{App} couldn't show the prompt for this tab. Reload the tab and try again.` |
| Destructive confirmation | Stop script: `Stop the slow script? The page may not work.` |

No internal identifier in text: no pref key, port, sentinel, `webTab*` kind, tab id, timeout value.

## UI Considerations

Applicable state considerations resolved: 6 covered, 3 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | doorhanger queue (background tab) | ✅ covered | No panel until tab shown; activation shows queued doorhanger |
| zero-one-many | queued doorhangers per tab | ✅ covered | One visible at a time; extras queue FIFO, cap 3 then oldest dropped with error copy |
| long-text | permission origin display | ✅ covered | Display shows registrable domain only, truncated per 27-COPY 60-char rule where Theia-rendered |
| overflow | notification bar + find bar stacked | ✅ covered | Bars stack vertically inside widget, page rect shrinks by total height |
| error | doorhanger/report rect failure | 🧪 backstop | Held-out visual: anchor missing → panel falls back to top-center of shell window |
| error | sharing push with unknown tab | 🧪 backstop | Held-out visual: unknown-tab folds to lost view, no indicator |
| populated | sharing active (camera/mic/screen) | ✅ covered | Indicator shows per-kind icon + accent ring while any track live |
| loading | hung-script deciding | 🧪 backstop | Held-out timing: bar appears only after upstream hang threshold, never speculative |

## Element Anatomy

### (a) Permission doorhanger
- Native `<panel id="notification-popup">` positioned over the chrome-bar anchor element; every overlay carries `popupnotificationanchor` at creation (N4). Page rect MUST NOT shrink or blank: panel is XUL native, above overlays (Pitfall 8 exception for native popups).
- Anchor: `popupnotificationanchor` attribute (ICON_ANCHOR_ATTRIBUTE, `upstream/toolkit/modules/PopupNotifications.sys.mjs:16`) on every overlay, pointing at the chrome-bar anchor; re-pointed on layout/mode/resize. The stock icon ids it replaces are cited from `upstream/browser/base/content/navigator-toolbox.inc.xhtml:295-345` (rejected alternative); `webrtc-preview` (`browser.js:623-625`) and `login-doorhanger-username-field` (`browser.js:631-634`) creation callbacks registered in 37-02.
- One doorhanger visible per window; background-tab requests queue chrome-side, shown on `webTabActivated`.
- Callbacks run chrome-side; Theia answer is `webTabDoorhangerAction {token, action}` with fixed enum (`allow|block`). No `allow` kind exists (W-e: the stock panel's own buttons resolve the prompt; no second web-tab.ts allow surface — it would be a frame-callable allow primitive).

### (b) Sharing indicator
- 16px Codicon in chrome bar next to identity box; accent ring while sharing; tooltip names kind; click opens Phase 31 site panel (permissions tab). Hidden when nothing shared.
- Driven by `sharingChanged` field in state push; unknown-tab → no indicator (fails closed).

### (c) Dialogs
- Default: stock window-modal `commonDialog` (no layout authored). Accepted only if KDE Wayland probe shows IDE stays usable (PROMPT-03 condition).
- Fallback relay (only if probe fails): tab-scoped Theia dialog (`alert` message + OK; `confirm` OK/Cancel; `prompt` input + OK/Cancel; `beforeunload` Leave/Stay; HTTP-auth username+password + OK/Cancel), modal to the tab widget only, never the IDE. Stock outcome uses the NATIVE checkbox (N6: `nsGlobalWindowOuter.cpp:2816 ShouldPromptToBlockDialogs`, `:4725-4739`/`:4824-4836 DisableDialogs`, group-scoped, verified no cross-tab leak); only the relay outcome wires its own stop affordance to a per-tab flag. Excludes Theia frame's own `beforeunload` (dirty editors keep stock path).

### (d) Password doorhanger
- Same native panel path as (a); the stock `password-notification` template installs verbatim (`upstream/browser/base/content/popup-notifications.inc.xhtml:100-115`, fields `#password-notification-username` `:102` / `#password-notification-password` `:110`) and the stock prompter owns fill + read-back (`LoginManagerPrompter.sys.mjs:290-303 writeDataToUI`, `:308-314 readDataFromUI`). No credential value crosses Theia→chrome (D-07 correction). Stock strings.

### (e) Notification bars
- Rendered inside `WebTabWidget` above page content; page placeholder shrinks by bar height via `webTabGeometry` (Pitfall 8 rule b). Never in blocking-layer selector; never occludes page.
- Actions: fixed enum on `webTabBarAction` (`allow-popup`, `dismiss`, `stop-script`, `continue-script`, `open-handler`, `deny-handler`; N1 `webTab*` name, classified `tab-lifecycle`); Allow routes through Phase 36 adoption path (`webTabAdopt`), never a frame-supplied URL load. Hung-script Stop/Wait call the report's OWN `terminateScript` / `waitLonger` methods (W-c: `ProcessHangMonitor.sys.mjs:100-101`, `:152-189`); the stock `win.gNotificationBox` path (`:534,564,588-591`) is never called — the per-tab bar replaces it wholesale, so the undefined-box throw is contained by non-reachability plus a catch-and-hide guard.

## Threat Model

| Boundary | Description |
|----------|-------------|
| page → chrome (doorhanger request) | untrusted page triggers PermissionUI; chrome keys by overlay's own principal |
| chrome → Theia (doorhanger/bar push) | display-only fields + token cross; privileged callbacks stay chrome-side |
| Theia → chrome (action answer) | fixed-enum action + token; no URL, no origin, no principal crosses |

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-37-UI-01 | Spoofing | doorhanger anchor rect | medium | mitigate | rect accepted only from chrome-bar widget event context; sender wall `groupSenderIsTheia`; anchor never from page message |
| T-37-UI-02 | Elevation | `allow` action shape | high | mitigate | no `allow` kind exists; action enum fixed; chrome looks up token → stored callback; unknown token refused |
| T-37-UI-03 | Tampering | sharing indicator state | low | mitigate | indicator derives from chrome-observed `webrtcUI.updateIndicators` sharing state (`WebRTCParent.sys.mjs:141-158`), never a frame-supplied flag |

## Must_Haves

- truths: ["Background-tab permission request waits until its tab is shown", "Sharing indicator shows while camera/mic/screen live and hides after", "Blocked-popup Allow opens as web tab next to opener", "Repeating dialogs can be stopped per tab", "No prompt text names an internal identifier"]
- artifacts: [`37-UI-SPEC.md` contract above, `CHROME_BAR_COPY` rows for bars/indicator/relay]

## Verify

- `scripts/verify-platform.sh --only shell-error-copy-no-internals` — new copy has no internal identifier and no brand literal.
- fails_when: gate prints a row naming the offending string, or a new sentence lives outside `CHROME_BAR_COPY`.

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS (stock strings untouched; new rows in copy contract)
- [ ] Dimension 2 Visuals: PASS (native panel; bars shrink rect; no page occlusion)
- [ ] Dimension 3 Color: PASS (accent reserved list closed)
- [ ] Dimension 4 Typography: PASS (delegated Theia font)
- [ ] Dimension 5 Spacing: PASS (multiples of 4; stock panel exempt)
- [ ] Dimension 6 Registry Safety: PASS (no third-party registry)
- [ ] Dimension 7 Inventory Provenance: PASS (`Tool: none`, section omitted by rule)

**Approval:** approved 2026-10-22 (autonomous, recommended)
