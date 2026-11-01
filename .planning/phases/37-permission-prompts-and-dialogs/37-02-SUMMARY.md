---
phase: 37-permission-prompts-and-dialogs
plan: "02"
subsystem: chrome-boundary
tags: [permission-prompts, webrtc, remember, sharing-indicator, single-writer, static-gate, live-harness]
status: complete
live_proof: deferred
requires:
  - phase: 37-permission-prompts-and-dialogs
    plan: "01"
    provides: installPermissionPromptFurniture, #notification-popup, the doorhanger push, verify-permission-prompts.mjs, verify-prompts-live.mjs and answerStock
  - phase: 31-site-identity-permissions-and-app-menu
    provides: the site panel's permission rows (webTabPermissionRows over the stock SitePermissions store)
provides:
  - the stock webRTC-shareDevices-notification template, verbatim, in powerbrowser.xhtml
  - the webrtc-preview creation callback in installPermissionPromptFurniture
  - gBrowser.updateBrowserSharing on the shell stand-in, and updateWebTabSharing pushing sharingChanged
  - the chrome bar sharing indicator (one codicon per shared kind) with three pinned copy rows
  - verify-permission-prompts.mjs rules (j) template, (k) preview callback, (l) single writer, (m) no remember field, (n) chrome-observed sharing
  - verify-prompts-live.mjs scenarios remember, sharing, camera-doorhanger and four live plants
affects:
  - 37-03 and 37-04 (same Phase 37 section, same live harness)
  - Phase 35 merge (rules j and k move to verify-shell-furniture.mjs with rule a)
tech-stack:
  added: []
  patterns:
    - upstream template text pasted verbatim, with namespace declarations on its root element only, so it parses unchanged in the HTML shell document
    - a gate that reads its own source to reject a hand-kept expectation list
key-files:
  created: []
  modified:
    - powerbrowser/shell/powerbrowser.xhtml
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/powerbrowser.js
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-permission-prompts.mjs
    - scripts/verify-prompts-live.mjs
    - scripts/check-internals-boundary.sh
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-shell-gbrowser-standin.mjs
key-decisions:
  - "The sharing state enters through the stock call: WebRTCParent.updateIndicators already calls browser.documentGlobal.gBrowser.updateBrowserSharing(browser, {webRTC: state}). The shell stand-in implements that member, which moves it from DELIBERATELY_ABSENT to implemented."
  - "The single-writer rule allows exactly one existing writer: the Phase 31 site panel's webTabSetPermission arm, which is the user's own settings edit. Every other SitePermissions or permission-manager write under powerbrowser/shell goes red."
  - "The webrtc-preview import runs through window.ChromeUtils with global \"current\". From the boundary module, bare ChromeUtils would resolve \"current\" to the module's shared global, which has no customElements."
  - "The Fluent links branding/brand.ftl and browser/browser.ftl are in the shell head (copied from browser.xhtml:57,60), because the template's labels are data-l10n-id."
  - "Sharing booleans are normalised the way tabbrowser's getTabSharingState reads them: a paused track still counts as shared."
patterns-established:
  - "A furniture template is compared element by element (tag plus sorted attributes, namespace declarations dropped) and by id set against the upstream file at check time."
requirements-completed: []
duration: "about 25 minutes"
completed: "2026-10-31"
commits: 3
plan_head_before: f6e6df360e3d7b1dd34d47eae63cb9e94ddae2f2
plan_head_after: 867f6ba42a2f17fb287edcf54242b8c7583d565a
actuals:
  tokens: 15400
  tasks: 3
  commits: 3
---

# Phase 37 Plan 02: WebRTC template, Remember single-writer rule and sharing indicator Summary

**Upstream's webRTC-shareDevices doorhanger is now installed verbatim in the shell, with its webrtc-preview callback, so a camera or microphone request has the template WebRTCParent looks up. Remember stays the stock checkbox, and a derived gate rule makes the stock PermissionUI write the only prompt-path writer. The chrome bar shows one mark per shared kind. The marks come from webrtcUI's own state, which WebRTCParent reports through `gBrowser.updateBrowserSharing`. The live scenarios are written and their offline audit passes. The live run is deferred because this lane has no built binary.**

## Status

Every static criterion is met. `scripts/verify-platform.sh --quick` passed after each of the three tasks. **The live proof is deferred** to the end-of-milestone live pass, because this lane has no `objdir`. `verify-prompts-live.mjs --scenario remember,sharing,camera-doorhanger` exits with `BROKEN INSTRUMENT: no built binary`. No live evidence is claimed.

PROMPT-01 and PROMPT-02 are not marked complete. Their live truths are unproven until that pass: Remember persisting across a fresh tab, the camera doorhanger resolving, and the indicator appearing and clearing.

## Performance

- **Tasks:** 3 of 3 executed.
- **Commits:** 3 task commits (`dbe275af`, `1838350a`, `867f6ba4`), plus this SUMMARY commit.
- **Realized diff:** about 15,400 tokens by the chars/4 estimate over the plan's diff (plan estimate 85,000). The template is a paste, and no live-debug iterations happened.

## Accomplishments

- **Template (B2).** `powerbrowser.xhtml` carries upstream's `webRTC-shareDevices-notification` (popup-notifications.inc.xhtml:16-77) byte for byte. It is placed as a sibling of `#notification-popup` inside the popupset, where upstream puts it; PopupNotifications moves it into the panel itself. The only addition is three namespace declarations on its root tag, so `label`, `menulist`, `html:div` and `xul:image` parse as upstream intends inside this HTML document. All five sections are present: camera, window or screen, preview, microphone and the speaker richlistbox.
- **Preview callback (N4).** `installPermissionPromptFurniture` registers `setElementCreationCallback("webrtc-preview", ...)` on `chrome://browser/content/webrtc/webrtc-preview.mjs`, the same callback as browser.js:623-625. `check-internals-boundary.sh` now lists `setElementCreationCallback` under the Phase 27 policy, so the call is legal only in the boundary file. A self-test plant shows it is rejected anywhere else. One catalogue row covers the line.
- **Remember (D-02, D-11).** No code was added for this, by design. The stock checkbox and the stock PermissionUI callback (PermissionUI.sys.mjs:552-585) write the grant. Rule (l) derives every `setForPrincipal`, `removeFromPrincipal`, `addFromPrincipal` and `perms.add*`/`perms.remove*` call under `powerbrowser/shell` and fails on any call outside the Phase 31 site panel arm. Rule (m) fails on a `remember` field in any webTab kind literal, push payload or sender read.
- **Sharing (D-05).** `updateWebTabSharing(browser, {webRTC})` turns webrtcUI's per-tab state into `sharingChanged {tabId, camera, microphone, screen}`. It sends only when a kind changes (one key per overlay in a WeakMap; no polling). Device labels, the browsing context and the window id stay in chrome. `web-tab.ts` stores `widget.sharing` from a display-only subscriber and ignores unknown tabs. `chrome-bar-widget.tsx` renders `codicon-device-camera-video`, `codicon-mic` and `codicon-device-desktop` inside an accent-ringed `.pb-chrome-bar-sharing`, next to the reader toggle. Each mark has a tooltip and aria-label from `CHROME_BAR_COPY.sharingCamera/Microphone/Screen` ("{App} is sharing your camera with this tab.", per 37-UI-SPEC). Rule (n) requires that the one `sharingChanged` push is in `updateWebTabSharing` and is reached only from the stand-in's `updateBrowserSharing`. It also requires that the frontend writes `.sharing` only inside its `sharingChanged` subscriber and never reads a `sharing` field from a message.
- **Live harness.** The plan adds three scenarios and four plants, giving 7 scenarios and 10 plants in total. `--self-test --static` now also derives the names the new scenarios read: the SitePermissions names, the template and menulist ids in the xhtml, and the indicator class and codicons in chrome-bar-widget.tsx. A rename therefore goes red offline.

## Verification results (this lane)

| Check | Result |
|---|---|
| `node scripts/verify-permission-prompts.mjs` | PASS |
| `node scripts/verify-permission-prompts.mjs --self-test` | PASS (control green, 21 plants red; 9 new in this plan) |
| `bash scripts/check-internals-boundary.sh --self-test` / `--catalogue` | PASS / PASS (new plant: `setElementCreationCallback` rejected outside the boundary) |
| `node scripts/verify-ng-040-internals-catalogue-lines.mjs` (after `--fix`) | PASS |
| `node scripts/verify-web-tab-bridge.mjs` (+ `--self-test`) | PASS (rule 9 pairs `sharingChanged` with its subscriber; 32 kinds, none added) |
| `node scripts/verify-shell-error-copy.mjs` (+ `--self-test`) | PASS (three rows pinned in EXPECTED_NAV_COPY) |
| `node scripts/verify-shell-gbrowser-standin.mjs` (+ `--self-test`) | PASS (`updateBrowserSharing` implemented, no longer absent) |
| `node scripts/verify-prompts-live.mjs --self-test --static` | PASS (10 plants applied and named; derived names present) |
| `node scripts/verify-prompts-live.mjs --scenario remember,sharing,camera-doorhanger` | NOT RUN: BROKEN INSTRUMENT, no built binary (deferred) |
| `cd theia && nix develop ..#theia --command yarn build:extensions` | PASS (`renderSharing` and `sharingChanged` present in lib output) |
| `nix develop .#theia --command scripts/verify-platform.sh --quick` | PASS after Task 1, Task 2 and Task 3 ("verify-platform: PASS -- all checks passed") |

Restart note: chrome JS and XHTML under `powerbrowser/shell` load with `MOZ_PURGE_CACHES=1`. This plan changed no `jar.mn` and added no file under `powerbrowser/shell`, so no Gecko rebuild is needed. The `chrome://browser/content/webrtc/webrtc-preview.mjs` URL and the two Fluent files ship with the stock browser build.

## Task Commits

1. **Task 1: WebRTC template, preview callback, rules (j)/(k)** — `dbe275af` (feat)
2. **Task 2: single-writer and remember rules, sharing push, indicator, rule (n)** — `1838350a` (feat)
3. **Task 3: live remember, sharing and camera-doorhanger scenarios** — `867f6ba4` (test)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The observation hook is the gBrowser stand-in's updateBrowserSharing**
- **Found during:** Task 2
- **Issue:** WebRTCParent.sys.mjs:153-155 passes the webrtcUI state only to `browser.documentGlobal.gBrowser.updateBrowserSharing`. The shell stand-in lacked that member, so the call threw a TypeError, and `verify-shell-gbrowser-standin.mjs` listed it as DELIBERATELY_ABSENT pending "Phase 37 furniture". No other chrome-side hook carries the per-tab state.
- **Fix:** `powerbrowser.js` implements `updateBrowserSharing(browser, state)`, which delegates to the boundary's exported `updateWebTabSharing`. The DELIBERATELY_ABSENT entry was removed, because the member is now implemented. Two files were added to the plan's file list.
- **Commit:** `1838350a`

**2. [Rule 1 - Bug] The single-writer rule as written would be red on the tree**
- **Found during:** Task 2
- **Issue:** The plan says no SitePermissions write appears anywhere under `powerbrowser/shell`. The Phase 31 site panel's `webTabSetPermission` arm already calls `removeFromPrincipal` and `setForPrincipal`. That arm is the user's own settings edit, behind an origin echo, and it was shipped and approved in Phase 31.
- **Fix:** Rule (l) allows calls only inside that one arm (located by brace matching) and fails on any other write. The planted `setForPrincipal` in the Phase 37 section goes red naming "a second permission writer". That arm neither answers a prompt nor sets Remember.
- **Commit:** `1838350a`

**3. [Rule 1 - Bug] `global: "current"` from the boundary module targets the wrong global**
- **Found during:** Task 1
- **Issue:** browser.js runs in the window, so its `{ global: "current" }` loads webrtc-preview.mjs into the window. The same call from PowerBrowserAPI.sys.mjs would load it into the module's shared global, where `customElements.define` and `window.MozXULElement` do not exist.
- **Fix:** The callback calls `window.ChromeUtils.importESModule(...)`. A static method's global is its callee's, so "current" is the shell window.
- **Commit:** `dbe275af`

**4. [Rule 2 - Missing functionality] Fluent links for the template's labels**
- **Found during:** Task 1
- **Issue:** Every label in the template is a `data-l10n-id` from browser.ftl, and the shell document linked no localization. WebRTCParent also calls `doc.l10n.setAttributes` (:1015). Without the links the device selector would render unlabelled.
- **Fix:** Two `<link rel="localization">` lines (branding/brand.ftl, browser/browser.ftl), copied from browser.xhtml:57,60.
- **Commit:** `dbe275af`

### Scope and structure deviations

- **Lane override for Phase 35:** `installShellFurniture` and `verify-shell-furniture.mjs` are absent from this lane. The callback extends 37-01's `installPermissionPromptFurniture` in place. The furniture-gate rows for this plan (the template and the preview callback) are rules (j) and (k) of `verify-permission-prompts.mjs`, derived from upstream markup. **They move to `verify-shell-furniture.mjs` at merge**, together with rule (a). `verify-shell-furniture.mjs` was not created.
- **Template placement:** the template is a sibling of the panel inside the popupset, as upstream places it, not a child of `<xul:panel>`. PopupNotifications reparents it into the panel when it shows.
- **Extra template plant:** a menulist replaced by `html:select` with the same id goes red as "element drift". The id set alone would not catch this, so the element-by-element comparison was added.
- **Hand-kept list check:** the gate reads its own source and fails on an array literal that starts with a `webRTC-` id. The plant builds its text from parts, so the clean file stays green.
- **chrome-bar.css:** one rule for the indicator's accent ring (37-UI-SPEC "accent ring while sharing"). This file is not in the plan's list.
- **Copy rows** are functions of `appSubject()`, following the 37-UI-SPEC copy row "{App} is sharing your camera / microphone / screen with this tab". They are pinned as `${name} is sharing your … with this tab.`.
- **Phase 31 read path:** present. `webTabPermissionRows` reads the same stock store (getForPrincipal per id), so a stock-written persistent grant appears in the site panel. No blocker.
- **answerStock** was reused unchanged. Its `remember` flag clicks the stock checkbox only when it is unchecked, and the geolocation checkbox starts unchecked (PermissionUI.sys.mjs:889-893), so the `remember-checkbox-dropped` plant applies.
- **Theia app bundle:** only `yarn build:extensions` ran (lane rule). The plan's `theia build --app-target=browser --mode development` belongs to the deferred live pass.

## Deferred to the end-of-milestone live pass

1. `node scripts/verify-prompts-live.mjs --scenario remember,sharing,camera-doorhanger` against a built binary, after the Theia app bundle build. Not run: there is no objdir.
2. `node scripts/verify-prompts-live.mjs --self-test`: a clean control per target scenario, then the plants remember-checkbox-dropped, sharing-stuck-on, frame-flag-accepted and camera-template-missing, plus 37-01's six. Not run.
3. The Theia app bundle build (`theia build --app-target=browser --mode development`).
4. Visual check (KWin screenshot) of the camera doorhanger and the chrome bar indicator. **Risk:** the shell loads no browser.css, so the stock `webRTC-selectDevice-*` and preview styles that browser.xhtml gets may be missing. The panel may draw unstyled even though it works.
5. **Risk for the sharing scenario's screen half:** on KDE Wayland, a screen share goes through the PipeWire portal, which is an OS dialog. The harness picks the first real menulist item, as upstream's tests do. If the portal needs a human, the scenario returns "screen share was not granted through the stock Allow" rather than passing.
6. Watch live: whether `media.navigator.streams.fake` lists exactly one camera with a populated menulist (listDevices fills the menupopup even when the single-device label shows), and whether the fresh-tab half of `remember` resolves without any panel within its 3-second window.

## Assumed cross-lane names

- **Phase 35 (35-02):** `installShellFurniture(window)`. The webrtc-preview callback lives in `installPermissionPromptFurniture`, which folds into it at merge. `scripts/verify-shell-furniture.mjs` receives rules (j) and (k) at merge, with rule (a).
- **Phase 36:** none used or added (no `webTabAdopt`, `adoptTab`, `dropAdoptedTab` or `installNewWindowReceivers`).

## Known Stubs

None. The indicator is wired to the live push.

Skipped on purpose, and not stubs: clicking the indicator does nothing. 37-UI-SPEC wants it to open the Phase 31 site panel, but this plan's tasks do not include that. Also, `getTabSharingState` (read by extensions) still reports no sharing, because extension sharing state is outside this plan.

## Threat Flags

None outside the plan's threat model. `gBrowser.updateBrowserSharing` is a new member on the stand-in, but it is the stock WebRTCParent call path that T-37-02-02 names. It is reachable only from privileged chrome, it is catalogued, and rule (n) gates it.

## Self-Check: PASSED

- FOUND: the `webRTC-shareDevices-notification` template in powerbrowser/shell/powerbrowser.xhtml, `updateWebTabSharing` in powerbrowser/shell/PowerBrowserAPI.sys.mjs, `updateBrowserSharing` in powerbrowser/shell/powerbrowser.js, `renderSharing` in chrome-bar-widget.tsx, the `remember` scenario in scripts/verify-prompts-live.mjs
- FOUND commits: dbe275af, 1838350a, 867f6ba4 (ancestors of HEAD; `git rev-list --count f6e6df36..867f6ba4` = 3)
- Live proof: deferred, not claimed (see above)
