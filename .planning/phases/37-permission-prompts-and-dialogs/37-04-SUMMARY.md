---
phase: 37-permission-prompts-and-dialogs
plan: "04"
subsystem: chrome-boundary
tags: [password, doorhanger, notification-bars, blocked-popup, hung-script, protocol-handler, webTabBarAction, static-gate, live-harness]
status: complete
live_proof: deferred
requires:
  - phase: 37-permission-prompts-and-dialogs
    plan: "01"
    provides: installPermissionPromptFurniture, #notification-popup, the show wrapper, verify-permission-prompts.mjs, verify-prompts-live.mjs and answerStock
  - phase: 37-permission-prompts-and-dialogs
    plan: "02"
    provides: the popupset template pattern (namespace declarations on the root), the sharing re-push hook on re-registration
  - phase: 37-permission-prompts-and-dialogs
    plan: "03"
    provides: the stock dialog outcome (bars and the stock dialog do not share a surface)
provides:
  - the stock password-notification template and the PopupAutoComplete panel, verbatim, in powerbrowser.xhtml
  - the login-doorhanger-username-field creation callback in installPermissionPromptFurniture
  - the "// Phase 37: notification bars." section of PowerBrowserAPI.sys.mjs (blocked-popup, hung-script, protocol-handler sources)
  - the notificationBar push and its web-tab.ts bar host, which shrinks the published page rect
  - webTabBarAction {tabId, token, action}, fixed enum allow-popup|dismiss|stop-script|wait-longer|add-handler|deny-handler, classified tab-lifecycle
  - verify-permission-prompts.mjs rules (q)-(t) and (u)-(aa), 23 new plants (52 in total)
  - verify-prompts-live.mjs scenarios password-save, password-update, popup-block, hung-script, protocol-handler and seven plants
affects:
  - Phase 36 merge (openBlockedPopup's typeof guard and openStockTab fallback go away)
  - Phase 35 merge (rules q and r move to verify-shell-furniture.mjs with a, j and k)
tech-stack:
  added: []
  patterns:
    - a stock service method wrapped on its module prototype for overlay callers only, with every other caller on the stock path
    - bar copy owned by chrome-bar and handed to tab-uris through a setter, because tab-uris cannot import CHROME_BAR_COPY
key-files:
  created:
    - .planning/phases/37-permission-prompts-and-dialogs/37-04-SUMMARY.md
  modified:
    - powerbrowser/shell/powerbrowser.xhtml
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/check-internals-boundary.sh
    - scripts/verify-permission-prompts.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-prompts-live.mjs
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/tab-uris/src/browser/web-tab.css
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
key-decisions:
  - "The blocked-popup Allow calls the Phase 36 API PowerBrowserAPI.openAdoptedWebTab(openerBrowser, url, { triggeringPrincipal }) from one function (openBlockedPopup), on the stored popup spec and source principal, behind the http(s) wall. Until the merge a typeof guard falls back to openStockTab."
  - "The PopupAutoComplete panel is installed with the password template. LoginManagerPrompter's showing callback writes onUsernameSelect on it, and a null panel would throw there."
  - "Blocked-popup events are subscribed once on the shell window. They bubble from the overlay, so webTabOpen and the catalogued lines above it do not move."
  - "Keep waiting reproduces ProcessHangMonitor.waitLonger rather than calling it: the stock function reads win.gBrowser.selectedBrowser and its own report list, which holds the report only when the stock monitor has started."
  - "The protocol hook wraps WebProtocolHandlerRegistrar.prototype.registerProtocolHandler. The service is the module's own constructor, so overlay calls reach the wrap and every other caller takes the stock path."
  - "Don't allow stores nothing and holds the refusal for the overlay's current document, so a page cannot re-ask in a loop."
patterns-established:
  - "One per-tab bar per kind, keyed by overlay identity, with chrome-held records resolved by token for the sender's own tab and frame."
requirements-completed: []
duration: "about 2 hours 30 minutes (five --quick runs of about 10 minutes each)"
completed: "2026-11-01"
commits: 5
plan_head_before: 406ce121a347b8d7a710ad2d1ef25f81a4486be4
plan_head_after: 815b231d4176ff83abd98b3df6c3ba2f21399411
actuals:
  tokens: 49479
  tasks: 5
  commits: 5
---

# Phase 37 Plan 04: Password template, three per-tab notification bars and webTabBarAction Summary

**Password save and update now use upstream's own password-notification template and PopupAutoComplete panel. The stock LoginManagerPrompter fills those fields and reads them back, and no credential crosses to Theia or reaches a log. Blocked popups, hung scripts and protocol registrations each produce a per-tab bar. The bar renders inside the web tab widget, and the page rect starts below it. The bars are answered through webTabBarAction, a single kind with a fixed enum, and no answer writes a permission. The blocked-popup Allow opens the stored popup through one Phase 36 openAdoptedWebTab call site. The five live scenarios are written and pass their offline audit. The live run is deferred because this lane has no built binary.**

## Status

Every static criterion is met. `scripts/verify-platform.sh --quick` passed after each of the five tasks; the final run ended "verify-platform: PASS -- all checks passed". **The live proof is deferred** to the end-of-milestone live pass, because there is no `objdir`. `verify-prompts-live.mjs --scenario password-save,password-update,popup-block,hung-script,protocol-handler` exits with `BROKEN INSTRUMENT: no built binary`. No live evidence is claimed.

PROMPT-07 and PROMPT-09 are not marked complete. Their live truths are still unproven: the save and update offers, an Allow that opens a web tab next to its opener, Stop script ending the loop, and the handler choice being honoured. In this tree the blocked-popup Allow opens a stock tab until Phase 36 merges.

## Performance

- **Tasks:** 5 of 5 executed.
- **Commits:** 5 task commits, plus this SUMMARY commit.
- **Realized diff:** about 49,500 tokens by the chars/4 estimate (the plan estimated 115,000).

## Accomplishments

- **Password (Task 1, D-07).**
  - `powerbrowser.xhtml` carries `password-notification` byte for byte from popup-notifications.inc.xhtml:100-115. Namespace declarations are on its root only, the same pattern 37-02 used for the WebRTC template. The field stylesheet link is in the head.
  - The `PopupAutoComplete` panel from main-popupset.inc.xhtml:173-182 is also installed (deviation 1).
  - `installPermissionPromptFurniture` registers the `login-doorhanger-username-field` creation callback (browser.js:631-634). It runs through `window.ChromeUtils` with `global: "current"`. The line is catalogued, and a boundary self-test plant rejects the callback in any other shell file.
  - There is no Theia credential path, no hidden input, and no credential field in any push.
- **Bar host and the blocked-popup source (Task 2, D-08, D-12).**
  - `DOMUpdateBlockedPopups` and `DOMUpdateBlockedRedirect` are subscribed on the shell window.
  - The overlay's own `popupAndRedirectBlocker` supplies the count, the redirect flag, `hasBeenDismissed`, and the blocked popups. Each popup's spec and source-document principal stay on the chrome-held record. Theia receives `{popupCount, redirectBlocked}` and a token.
  - The one `notificationBar` push is in `pushNotificationBar`.
  - In `web-tab.ts`, a `.pb-web-tab-bars` host inside the widget node renders the bars, and `publish()` sends `y + bars` and `h - bars`. The host is outside `BLOCKING_LAYER_SELECTOR`.
  - A reloaded frontend gets its bars again through the existing re-registration hook (`resendWebTabSharing` now also calls `resendWebTabBars`).
- **webTabBarAction lands whole (Task 2).** It consists of:
  - the `WEB_TAB_ACTION_KINDS` entry
  - the `case "webTabBarAction"` arm, which runs shape validation and then calls `webTabBarActionReply`
  - the `KIND_CLASSES` row, `tab-lifecycle`
  - the sender literal, in `WebTabWidget.barAction`
  - the bridge plant "planted webTabBarAction dropped from WEB_TAB_ACTION_KINDS"

  The reply resolves `barRecords.get(token)`. It refuses a record whose tabId or Theia frame differs from the sender's, and it refuses an action outside that bar's set. No name contains allow, grant or permit (rule d holds).
- **Allow (D-12).** The Allow takes the stored popup off the record and calls `openBlockedPopup(opener overlay, stored spec, stored principal)`. That function applies the http(s) wall first, then calls the single `PowerBrowserAPI.openAdoptedWebTab(...)`. A `typeof` guard falls back to `openStockTab(spec)` until the merge. `"refused-scheme"` and `null` open no tab and log only the outcome word. No popup permission is written, and the stock site-wide toggle is not offered.
- **Hung script (Task 3).** `process-hang-report` and `clear-hang-report` are observed once, chrome-side. An overlay's report (matched with `isReportForBrowserOrChildren`) gets a per-tab bar.
  - Stop script calls `report.terminateScript()`.
  - Keep waiting pauses the report for the stock `browser.hangNotification.waitPeriod` without `userCanceled`, and shows the bar again if no clear arrives in that time.
  - Add-on hangs are left to the stock monitor. `win.gNotificationBox` is never reached.
- **Protocol registration (Task 4, N2).** The registrar's prototype method is wrapped. For an overlay it runs the stock checks (`checkProtocolHandlerAllowed`, `_protocolHandlerRegistered`) and then shows the bar.
  - Add runs the stock store path (:483-504) on the stored registration: web handler app, `possibleApplicationHandlers`, `alwaysAskBeforeHandling = true`, `hs.store`.
  - Don't allow stores nothing.
  - No `getTabBrowser` or `getNotificationBox` member was added.
- **Copy.** All rows are in `CHROME_BAR_COPY` and pinned in `EXPECTED_NAV_COPY`:
  - "{App} blocked a popup from this page." / "{App} blocked N popups from this page."
  - "{App} stopped this page from sending you to another page."
  - "A script on this page is taking too long."
  - "Allow {host} to open {scheme} links?"
  - Allow, Dismiss, Stop script, Keep waiting, Add, Don't allow

  `notificationBarCopy` in chrome-bar-copy.ts maps a bar to its message and labels. `ChromeBarWidget` hands it to `WebTabChannel.setBarCopy`.
- **Gate rules (`verify-permission-prompts.mjs`).** Each rule has a plant after the same-session green control:
  - (q) password template and PopupAutoComplete, derived from upstream, with no hidden input
  - (r) login callback URL, derived from browser.js
  - (s) prompter fill and read-back ownership, and no shell or frontend source naming a field id
  - (t) no credential-shaped key in any push or webTab kind literal, and no credential-shaped argument in any shell log call (walks every site)
  - (u) bar host outside the blocking layer, inside the widget, with the page rect shrunk
  - (v) one display-only `notificationBar` push
  - (w) token-resolved record of the sender's own tab, and no frame URL read
  - (x) one `openAdoptedWebTab` call site behind the http(s) wall, and no `webTabAdopt`/`adoptTab` vocabulary
  - (y) sender/arm enum parity per bar kind, plus `BAR_ANSWERS` coverage
  - (z) no `getNotificationBox`/`gNotificationBox` under powerbrowser/shell
  - (aa) registrar contract and module derived from components.conf, the prototype wrap present, and no `getTabBrowser` under powerbrowser/shell

## Verification results (this lane)

| Check | Result |
|---|---|
| `node scripts/verify-permission-prompts.mjs` | PASS |
| `node scripts/verify-permission-prompts.mjs --self-test` | PASS (control green, 52 plants red; 23 new) |
| `node scripts/verify-web-tab-bridge.mjs` (+ `--self-test`) | PASS (33 kinds; 33 plants, including the webTabBarAction drop) |
| `node scripts/verify-shell-error-copy.mjs` (+ `--self-test`) | PASS |
| `bash scripts/check-internals-boundary.sh` (+ `--self-test`) | PASS (new login-callback plant) |
| `node scripts/verify-ng-040-internals-catalogue-lines.mjs` | PASS (rows remapped from the git hunks by hand; `--fix` not used) |
| `node scripts/verify-shell-gbrowser-standin.mjs` | PASS (no member added) |
| `node scripts/verify-prompts-live.mjs --self-test --static` | PASS (21 plants applied and named; new names derived from the tree and upstream) |
| `node scripts/verify-prompts-live.mjs --scenario password-save,password-update,popup-block,hung-script,protocol-handler` | NOT RUN: BROKEN INSTRUMENT, no built binary (deferred) |
| `cd theia && nix develop ..#theia --command yarn build:extensions` | PASS after Tasks 2, 3 and 4 (bar code present in lib output) |
| `nix develop .#theia --command scripts/verify-platform.sh --quick` | PASS after every task; final: "verify-platform: PASS -- all checks passed" |

Restart note: chrome JS and XHTML under `powerbrowser/shell` load with `MOZ_PURGE_CACHES=1`. No `jar.mn` change and no new shell file were made, so the live pass needs no Gecko rebuild. It does need the Theia app bundle, because `web-tab.ts`, `web-tab.css`, `chrome-bar-copy.ts` and `chrome-bar-widget.tsx` changed. The chrome URLs used ship with the stock browser build: `login-doorhanger-username-field.mjs/.css`, `moz-input-password`, and `resource:///modules/WebProtocolHandlerRegistrar.sys.mjs`.

## Task Commits

1. **Task 1: stock password template, prompter-owned fields and the login callback**: `24aea2f1` (feat)
2. **Task 2: blocked-popup bar, the per-tab bar host and webTabBarAction**: `d9e91538` (feat)
3. **Task 3: hung-script bar and the bar action enum parity rule**: `c9976689` (feat)
4. **Task 4: protocol-registration bar through a registrar wrap**: `2e2542a1` (feat)
5. **Task 5: password and notification-bar live scenarios with plants**: `815b231d` (test)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The password template needs the PopupAutoComplete panel**
- **Found during:** Task 1
- **Issue:** In its `showing` callback, LoginManagerPrompter runs `chromeDoc.getElementById("PopupAutoComplete").onUsernameSelect = ...` (LoginManagerPrompter.sys.mjs:648-650). The shell had no such panel, so the template alone would throw at the first prompt.
- **Fix:** Upstream's panel was added verbatim (main-popupset.inc.xhtml:173-182). Rule (q) compares it attribute by attribute, with a plant.
- **Commit:** `24aea2f1`

**2. [Rule 1 - Bug] The stock hang path does not throw in the shell, and Keep waiting cannot call waitLonger**
- **Found during:** Task 3
- **Issue:** The plan says the stock path throws on the shell's undefined `gNotificationBox`. In fact `ProcessHangMonitor.updateWindows` walks only `navigator:browser` windows (:425-443), so it never touches the shell window, and an overlay hang simply got no bar. Stock `waitLonger(win)` reads `win.gBrowser.selectedBrowser` and the stock `_activeReports`. Those hold the report only when the stock monitor has started (it starts on `browser-first-window-ready`, which a shell-only session never fires).
- **Fix:** The shell's own observer handles the bar. Stop calls the report's own `terminateScript()`. Keep waiting reproduces waitLonger's behaviour: it pauses the report for the stock pref, skips `userCanceled`, and re-shows the bar on expiry.
- **Commit:** `c9976689`

**3. [Rule 1 - Bug] The stock protocol throw names getNotificationBox, not getTabBrowser**
- **Found during:** Task 4
- **Issue:** The Phase 31.1 tab host makes `getTabBrowser()` non-null for overlays (verify-shell-gbrowser-standin.mjs). The stock `:506` call therefore reaches the missing `getNotificationBox` member and throws there.
- **Fix:** The live plant now expects "stock protocol bar path reached: getNotificationBox TypeError" and detects it from the console.
- **Commit:** `2e2542a1`, `815b231d`

**4. [Rule 1 - Bug] The gate's push parse stopped at a nested brace**
- **Found during:** Task 2
- **Issue:** The existing `sendWebTabPush\(…\{([^}]*)\}` pattern ended at the `{}` inside `displayFields: visible ? … : {}`, so keys after it (a planted `url`) were never checked.
- **Fix:** `pushPayloads` and `topKeys` parse the payload with brace matching. Rules (t) and (v) use them, and the "bar push carries a url" plant proves it.
- **Commit:** `d9e91538`

**5. [Rule 3 - Blocking] Rule (c) would forbid the stored popup principal**
- **Found during:** Task 2
- **Issue:** Rule (c) scanned from the prompt marker to the end of the file and allows only `contentPrincipal`. The Allow needs the stored source principal.
- **Fix:** The prompt section now ends at `// Phase 37: notification bars.`. The bar section has its own rules: (v), plus (w), which forbids any sender-supplied URL, origin or principal read. The self-test's `inSection` inserts before the bar section.
- **Commit:** `d9e91538`

### Scope and structure deviations

- **Phase 36 vocabulary superseded.** The plan's `webTabAdopt`/`adoptTab` handshake is replaced by the real Phase 36 API, called once in `openBlockedPopup`, with a `typeof` guard and an `openStockTab` fallback until the merge. Rule (x) asserts that call site and fails on any `webTabAdopt`, `adoptTab`, `dropAdoptedTab` or `installNewWindowReceivers` token. **The plan's page-side opener-reference check is not possible:** a URL opened through adoption has no `window.opener`. `popup-block` therefore asserts that the adopted tab sits directly after its opener in the main area. Without `openAdoptedWebTab` in the binary, it returns a broken-instrument result and does not score.
- **Listeners on the shell window, not per overlay.** The blocked-popup events bubble from the overlay, so one window listener filtered with `tabIdOfBrowser` replaces per-overlay registration. This keeps `webTabOpen` and the catalogued lines above it unchanged.
- **Phase 35 lane override.** `installShellFurniture` and `verify-shell-furniture.mjs` are absent. The callback and templates extend `installPermissionPromptFurniture`, which calls `installNotificationBars`. Rules (q) and (r) are the furniture-gate rows and move to `verify-shell-furniture.mjs` at merge. Neither the installer nor that gate file was created.
- **Copy differs from 37-UI-SPEC in two places, following the plan.** The popup bar's second action is "Dismiss", not "Don't show again for this site", because that would be a permission or pref write. The protocol bar reads "Allow {host} to open {scheme} links?" with Add / Don't allow, in place of "This page wants to open another app." with Open / Don't allow. A redirect-only message row was added.
- **Files beyond the plan list.** `chrome-bar-widget.tsx` (the copy hand-off, because tab-uris cannot import `CHROME_BAR_COPY`) and `web-tab.css` (the bar styles).
- **check-internals-boundary.sh in Task 4:** unchanged. `Cc[`, `Ci.` and `ChromeUtils.import` are already forbidden outside the boundary, so no exemption was needed. Its `--self-test` passed in the chain.
- **Mailto dual prompt.** The Nimbus `mailto.dualPrompt` variant (:452-458) is not taken for overlays. A mailto registration from an overlay shows the normal bar.
- **`wrapped.stock`.** The wrap keeps the stock method on itself so the live `protocol-stock-path-unhooked` plant can restore it. Only privileged chrome can reach it.
- **Extra live plant.** The static audit requires a plant for every scenario, so `password-update` got `update-dropped`.
- **Simulated-symptom live plants**, each labelled in code as in 37-03: `allow-loads-frame-url` opens the frame URL itself; `adopt-next-to-opener-failed` moves the adopted tab; `hung-stop-ignored` sends a stale token, which chrome answers `unknown-bar`; `bar-covers-page` sets the bar host to `display: contents`. The code-level versions of the first three are real plants in `verify-permission-prompts.mjs --self-test`.
- **Catalogue rows.** 14 rows were added: 1 password, 4 popup, 5 hang, 4 protocol. Rows below each insertion were remapped from `git diff -U0` hunks with a scratch script, because NG-040 `--fix` can pick wrong lines. Every cited upstream line was checked against the pinned tree.
- **Theia app bundle:** only `yarn build:extensions` ran (lane rule). `theia build --app-target=browser` belongs to the deferred live pass.

## Deferred to the end-of-milestone live pass

1. The Theia app bundle build (`theia build --app-target=browser --mode development`), then `node scripts/verify-prompts-live.mjs --scenario password-save,password-update,popup-block,hung-script,protocol-handler` against a built binary. Not run: there is no objdir.
2. `node scripts/verify-prompts-live.mjs --self-test`: a clean control per target scenario, then the seven new plants (credential-leak, update-dropped, allow-loads-frame-url, bar-covers-page, adopt-next-to-opener-failed, hung-stop-ignored, protocol-stock-path-unhooked) and the 14 earlier ones.
3. **popup-block needs Phase 36 merged.** Before the merge it reports a broken instrument by design.
4. Visual check (KWin screenshot) of the password doorhanger and the three bars. **Risk:** the shell loads no browser.css, so the doorhanger fields may draw with toolkit styles only. The bars use Theia variables.
5. **Watch live:**
   - Whether a scripted `requestSubmit` with `signon.userInputRequiredToCapture.enabled=false` reaches `form-submission-detected` on 127.0.0.1.
   - Whether `dom.max_script_run_time=3` with `require_critical_input=false` produces a `process-hang-report` for an overlay.
   - Whether `registerProtocolHandler` from a 127.0.0.1 page passes `checkProtocolHandlerAllowed`.
6. **Known interaction to watch:** once a stock browser window has opened, the stock ProcessHangMonitor also tracks overlay reports. If every stock window then closes, its `updateWindows` calls `stopAllHangs("no-windows-left")`, which terminates an overlay's hung script without asking.

## Open points for Chris (recorded in CONTEXT D-12, not settled here)

1. Whether notification bars count as prompts under the 2026-10-25 ruling. This plan treats them as bars (D-08).
2. Protocol-handler Add is a **persistent** handler write (`hs.store`) answered from a Theia bar. The bar classification applies, but Chris should confirm it.
3. Whether per-popup Allow alone is enough, with no site-wide "Allow popups for this site" (the 2026-10-25 ruling says yes, per CONTEXT).

## Assumed cross-lane names

- **Phase 36 (lands on workspace/p36):** `PowerBrowserAPI.openAdoptedWebTab(openerBrowser, url, { inBackground = false, triggeringPrincipal = null } = {})`. It returns the pending tab element, `"refused-scheme"` for a non-http(s) URL, or `null` when the opener is not a chrome-held web tab, and it turns a system or missing principal into a null principal. This plan calls it as `openAdoptedWebTab(<opener overlay>, <stored popupWindowURISpec>, { triggeringPrincipal: <stored source document principal> })` from `openBlockedPopup` only. **The plan's `webTabAdopt`/`adoptTab` vocabulary was superseded** and appears nowhere. `dropAdoptedTab` and `installNewWindowReceivers` were not added. At merge, delete the `typeof` guard and the `openStockTab` fallback in `openBlockedPopup`.
- **Phase 35 (35-02):** `installShellFurniture(window)`. The password template, PopupAutoComplete and the login callback sit in `installPermissionPromptFurniture`, which folds into it. `scripts/verify-shell-furniture.mjs` receives rules (q) and (r) at merge, with (a), (j) and (k).

## Known Stubs

- `openBlockedPopup`'s pre-merge fallback: while `PowerBrowserAPI.openAdoptedWebTab` is absent, the Allow opens the stored popup as a **stock** tab (`openStockTab`, http(s) only) rather than an adopted web tab next to its opener. It is intentional and goes away at the Phase 36 merge. It is not recorded in WINDOWS.md, because the merge resolves it.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: process-wide hook | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `WebProtocolHandlerRegistrar.prototype.registerProtocolHandler` is wrapped for the whole process. Non-overlay callers (stock windows) take the stock method unchanged. The wrap exposes `.stock` to privileged chrome only. |
| threat_flag: process-wide observer | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `process-hang-report` / `clear-hang-report` are observed once for the process. Only reports for a shell overlay produce a bar. Reports stay chrome-side. |

Both fall under T-37-04-05 and the D-08 bar model. Neither is a new trust boundary.

## Self-Check: PASSED

- FOUND: #password-notification and #PopupAutoComplete in powerbrowser/shell/powerbrowser.xhtml; the notification-bar section, `webTabBarActionReply`, `openBlockedPopup`, `installHangBars` and `installProtocolBars` in powerbrowser/shell/PowerBrowserAPI.sys.mjs; `NOTIFICATION_BAR_ACTIONS` and `renderBars` in web-tab.ts; the five scenarios in scripts/verify-prompts-live.mjs
- FOUND commits: 24aea2f1, d9e91538, c9976689, 2e2542a1, 815b231d (`git rev-list --count 406ce121..815b231d` = 5)
- Live proof: deferred, not claimed
