---
phase: 31-site-identity-permissions-and-app-menu
reviewed: 2026-10-29T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - powerbrowser/shell/powerbrowser.js
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar.css
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/site-identity/app-menu.ts
  - theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts
  - theia/extensions/chrome-bar/src/browser/site-identity/site-panel.tsx
  - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
  - theia/extensions/tab-uris/src/browser/web-tab.ts
  - scripts/verify-site-identity.mjs
  - scripts/verify-site-identity-live.mjs
  - scripts/verify-web-tab-bridge.mjs
  - scripts/verify-shortcut-relay.mjs
  - scripts/verify-shell-error-copy.mjs
  - scripts/lib/firefox-bidi.mjs
  - scripts/lib/pb-live-probe.mjs
  - scripts/lib/pb-relaunch.mjs
  - scripts/verify-address-bar-live.mjs
findings:
  critical: 3
  warning: 9
  info: 4
  total: 16
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-10-29
**Depth:** standard (upstream sources in `upstream/` read for parity questions)
**Status:** issues_found

## Summary

Scope was the 31-0x commits in 3e8d991..HEAD. Static reading only: no build and no live run was
executed, so every finding below is derived from the tree and from `upstream/`. The live gate was
read, not run.

Three defects are Critical. A user-overridden certificate is shown as "Connection secure". The
identity-box shield is fed by a push field the Theia router drops, so it goes stale across
navigation, and the static gate that claims to cover this checks only the producer. Clear site data
deletes cookies for the whole registrable domain, not the host, on a wrong premise that is recorded
in CONTEXT D-31-12 and the 31-03 summary.

Three more things the checks cannot see: the certificate "Valid:" row can never render, the quit
checks cannot exercise Theia's unsaved-editor veto, and the popup row has a dead click in its cycle.

Verdicts on the five requested items are at the end.

## Critical Issues

### CR-01: A user-overridden certificate is decoded as `secure` (lock, "Connection secure", certificate block)

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:3523` (`webTabIdentity`)
**Issue:** The decode is `isSecure && !isBroken && !isInsecure` -> `"secure"`.
`security/manager/ssl/nsNSSCallbacks.cpp:1211-1235` sets `STATE_IS_SECURE | STATE_CERT_USER_OVERRIDDEN`
for a page the user loaded through "Accept the risk" on a certificate error. Upstream treats that
state separately: `browser-siteIdentity.js:827,878,939-946,1005,1172` give it the `certUserOverridden`
class and the "verified by you" tooltip, and exclude it from the CA-verified path. This tree never
reads `STATE_CERT_USER_OVERRIDDEN` (`grep` finds no hit in `powerbrowser/`, `theia/extensions/` or
`scripts/`).

Failure scenario: a self-signed, expired or wrong-host certificate is accepted once. The pill then
shows the lock, the panel header says "Connection secure", and the certificate block lists
"Issued to / Issued by" as if the connection were verified. This is the indicator SITE-01 exists to
get right. The TLS fixture only exercises a trusted CA, so no check goes red.

**Fix:** Decode the bit. Either push a state that renders as a warning, or reuse `broken`:
```js
const overridden = !!(state & wpl.STATE_CERT_USER_OVERRIDDEN);
if (isSecure && !isBroken && !isInsecure && !overridden) { securityState = "secure"; }
else if (isBroken || (isSecure && (isInsecure || overridden))) { /* mixed-passive vs broken as now */ }
```
Add a live fixture (a leaf the probe CA does not cover, plus `certdb.rememberValidityOverride`) and a
static case that derives the bit from `nsIWebProgressListener.idl`. Do this before the fixture CA is trusted.

### CR-02: The Theia state router drops `shieldExcepted`, so the box shield is stale or wrong across navigation; the gate checks only the producer

**File:** `theia/extensions/tab-uris/src/browser/web-tab.ts:305-321` (router) with `:851-853` (consumer);
gate at `scripts/verify-site-identity.mjs:865-872`
**Issue:** Chrome pushes `shieldExcepted` (`PowerBrowserAPI.sys.mjs` `webTabPush`). `WebTabWidget.applyState`
reads `state.shieldExcepted`. The `WebTabChannel` `'state'` handler builds the object passed to
`applyState` and lists `securityState`, `displaySpec`, `baseDomain`, `blockedTrackers`, `permissionIcons` and
`permissionLabels`, but not `shieldExcepted`. The widget's field is therefore written only by the
shield-toggle reply (`refreshShield`, `:803-810`).

Failure scenarios:
- Turn protection off on site A. The shield appears (from the reply). Navigate the same tab to
  site B. No push updates the field, so B shows "Tracking protection is off for this site" although B
  has no exception. This is a false statement about security state.
- A site that already has an exception (set earlier, in another window, or restored) never shows the shield.

The gate case "the box shield follows the shield reply and the pushed exception" only greps that
chrome's push contains `shieldExcepted: webTabShieldExcepted(browser)` and that the reply handler
text exists. It never looks at the router. The live `shield` scenario toggles on one tab and never
navigates it afterwards, and `shield-stale` plants the render, not the push path. So the gate passes
while the described behaviour is broken.

**Fix:** Add the field to the router object:
`shieldExcepted: typeof detail.shieldExcepted === 'boolean' ? detail.shieldExcepted : widget.shieldExcepted,`.
Make the static case derive the pushed field names from `webTabPush` and require each in the router's
`applyState({...})` literal, by set equality. Add a live step: except site A, navigate that tab to B,
require no shield; navigate to a site with a pre-set exception, require the shield.

### CR-03: Clear site data deletes cookies for the whole registrable domain; the recorded "exact host only" premise is false

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:5308-5323` (`webTabClearSiteData`), premise in
CONTEXT D-31-12 and the 31-03 summary "Not done" section
**Issue:** `Services.cookies.getCookiesFromHost(host, attrs)` does not return host cookies only.
`nsICookieManager.idl:268-290` says it returns cookies "within the base domain of aHost ... any host or
domain cookies for 'yahoo.com' and its subdomains", and `CookieService.cpp:1458-1467` looks up by base
domain. The loop at `:5309-5314` then removes every non-token cookie in that list.

Failure scenario: "Clear cookies and site data" on `www.example.com` confirms "Clear data for
www.example.com?" and deletes cookies of `mail.example.com`, `accounts.example.com`, `example.com` and
every other subdomain. The user is signed out of unrelated services. The storage half
(`deleteDataFromPrincipal`, `:5316`) is origin-scoped, so the two halves disagree. The summary
documents "subdomain data survives" as accepted by design. That is the opposite of what the code does.
The `clear-data` live scenario uses only `127.0.0.1` and `localhost`, where the base domain equals the
host, so it cannot see this. On `127.0.0.1` every non-token cookie on the host, for any port, is also
removed, which includes any other cookie the Theia origin holds.

**Fix:** Filter to the host before removing, and delete only host-scoped cookies or ones whose domain
covers the host:
```js
const cookies = Services.cookies.getCookiesFromHost(host, attrs)
  .filter(c => c.host === host || c.host === "." + host);
```
Decide explicitly whether parent-domain cookies (`.example.com`) are in scope, and write the answer
in D-31-12. Add a live positive control: a sibling-subdomain cookie must survive, and the base-domain
cookie must follow the decided rule. Correct the 31-03 summary's "accepted by design" line.

## Warnings

### WR-01: `webTabSiteInfo` reads `origin` after an await, defeating the origin echo

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:3658-3708`
**Issue:** Identity, certificate and permission rows are read synchronously (`:3659-3688`). Then
`await lazy.SiteDataManager.hasSiteData(host)` runs (`:3690`). The return object evaluates
`origin: webTabPermissionOrigin(browser)` (`:3707`) afterwards, together with the shield reads. If the
overlay navigates during that await, the reply carries page A's header, certificate and rows with page
B's origin. The panel echoes that origin on a write (`setSitePermission`), and chrome's
`principal.origin !== data.origin` check passes. The check was added to stop exactly this (the
"TOCTOU" review fix).

**Fix:** Capture `const principal = browser.contentPrincipal; const origin = webTabPermissionOrigin(browser);`
at the top. After the await, compare `browser.contentPrincipal.origin` to it and return
`where: "site-changed"` on mismatch. Derive host from the captured principal.

### WR-02: `identityHostText` corrupts IPv6 literals and strips a port that is never there

**File:** `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx:293-296`
**Issue:** `host.replace(/:\d+$/, '')` runs on `displaySpec`. Chrome sets `displaySpec` from
`convertToDisplayIDN(uri.host)` (`PowerBrowserAPI.sys.mjs:3540`). `nsIURI.host` has no port, and for
IPv6 it has no brackets (`nsStandardURL.h:604-618`). So `http://[::1]:8080/` gives `::1`, which the
regex turns into `:`. `[2001:db8::10]` becomes `2001:db8:`. The box host, its `aria-label`, the panel
header (for the `local` copy) and the clear-data dialog title (`Clear data for :?`) all show the
wrong host. This is the identity indicator.

**Fix:** Drop the strip on the chrome path (chrome never sends a port), and apply it only in the
`committedAddress` fallback, with bracket handling:
`const m = /^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(host)`. Add a static unit case (the helper is pure)
and a live IPv6 loopback step.

### WR-03: The certificate "Valid:" row can never render, and nothing checks it

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:3673-3676`
**Issue:** The guard is `typeof validity.notBefore === "string"`. In this tree
`nsIX509CertValidity.idl:17-23` declares `notBefore` and `notAfter` as `PRTime` (a number), and the
IDL has no `*LocalDay` strings. `validFrom` and `validTo` are therefore always `null`, `dates` in
`site-panel.tsx` is `null`, and `Valid: {dates}` (a UI-SPEC row) is never drawn. The live `site-panel`
step checks only `Issued to:` and `Issued by:`, and the static gate pins only the copy template, so
the omission is invisible.

**Fix:** Format the numbers in chrome (`new Date(validity.notBefore / 1000)` through
`Intl.DateTimeFormat`) and push strings. Add `Valid:` to the live `opened.cert` assertion, with
the date text parsed to confirm it is not empty.

### WR-04: The quit checks cannot exercise Theia's unsaved-editor veto, and they encode "exit 0 with a dirty editor" as the pass

**File:** `scripts/verify-site-identity-live.mjs:1176-1181` (fixture), `:1232-1260` (`quitKey`, `quitRow`);
`powerbrowser/shell/PowerBrowserAPI.sys.mjs:708-721`, `:4140-4145`
**Issue:** See item 4 below for the code path. The fixture sets the Monaco model with `setValue()` from
chrome, with no user activation. Gecko only honours a `beforeunload` cancel when the document
"UserHasInteracted" (`nsDocumentViewer.cpp:1216-1221`, pref
`dom.require_user_interaction_for_beforeunload`), so the prompt is skipped and the quit exits 0. The
31-05 summary reads that as "the dirty editor did not block the quit ... no product decision was
needed". Both quit scenarios then require exit 0 with a dirty editor. If a real user's edit does
trigger Theia's veto, these checks go red with "quit did not exit" and prove nothing about
data safety either way.

Two smaller defects in the same path:
- `quitApplication()` returns `true` after `Services.startup.quit()` even when `CanClose` vetoed the
  quit (`nsAppStartup.cpp:394-396` returns `NS_OK` without quitting). `quitRequest` then replies
  `applied` for a quit the user declined.
- `setIntPref("toolkit.shutdown.fastShutdownStage", 0)` runs before the quit is known to proceed, so
  a declined quit leaves slow shutdown on for the rest of the session.

**Fix:** Add a live step that edits through real input events on the Theia frame (the probe's
`nsITextInputProcessor` route) so activation is set. Assert the leave prompt appears (or its
absence, as an explicit product decision), and answer it. Return the real outcome: compare
`Services.startup.shuttingDown` after the call, and move the pref write after that check. Reword the
31-05 deviation as an open item, not a settled one.

### WR-05: Permission cycle has a dead click for every default-equal state; the `intents` map shadows server state

**File:** `theia/extensions/chrome-bar/src/browser/site-identity/site-panel.tsx:133`;
`theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts:106-111`;
`theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx:525-545`
**Issue:** The cycle is fixed (`default -> allow -> block -> default`) and the next step comes from
`intents[id] ?? row.stored`. A write equal to the permission's default is a removal
(`SitePermissions.sys.mjs:575-580`). `popup` always has default `BLOCK` (`:1001-1003`), so its
visible sequence is Blocked, Allowed, Blocked, Blocked, Allowed: the click from the `block` intent to
`default` changes nothing on screen. The same happens for `autoplay-media` when
`media.autoplay.default` is `ALLOWED` or `BLOCKED_ALL`. The live gate tests only `camera` and the
autoplay pref default (`BLOCKED`), so it does not see this.

`intents` is a client copy of chrome's state, set before the write is confirmed. It is not tied to
origin or tab and is not refreshed from the reply, so an external change (another window, an expired
temporary permission) is overridden by the stale intent.

**Fix:** Have chrome return the next state per row: the next entry of the cycle whose capability
differs from the effective state, skipping default-equal ones. Delete `intents`. Add `popup` and the
`ALLOWED`-pref case to the live gate; derive the expectation from `SitePermissions.getDefault`.

### WR-06: `purgeSiteTabRows` scope is inconsistent with the clear, undisclosed, and mis-reports a partial failure

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:5345-5366`, caller `:4722-4724`
**Issue:**
- The match is `new URL(row.url).hostname === principal.asciiHost`. For IPv6 `URL.hostname` is
  `[::1]` and `asciiHost` is `::1`, so no row ever matches.
- It ignores the port, so clearing `127.0.0.1:3000` deletes closed-tab rows for every `127.0.0.1` port.
- It ignores subdomains while CR-03 clears cookies base-domain-wide.
- It also deletes ungrouped closed rows, which the quit flush creates for previous-session tabs
  (`closed_at` set at `:1656`), so session-restore candidates for that host disappear.
- Firefox leaves history and closed tabs. The confirm text says only "You stay signed in", so the
  deletion is not disclosed.
- The purge runs inside the same `try` as the clear. If it throws (store locked), the cookies are
  already gone but the reply is `write-failed`, and the UI says the clear failed and offers a retry.

**Fix:** Compare `URL.hostname` with brackets stripped, scope the match to the same rule the clear
uses (CR-03), and wrap the purge in its own `try` so the reply stays `cleared`. Product call (record
it): either drop the closed-row delete (thumbnails only) or say it in the confirm text.

### WR-07: `stockWindowStarted` can hang forever if the stock window closes mid-poll

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:5387-5399`
**Issue:** The wait uses `await new Promise(resolve => win.setTimeout(resolve, 50))`. A timer owned
by a window does not fire once that window is destroyed, so the promise never settles. The `win.closed`
check and the 15 s deadline are never reached, and the `openStockPage` store request never replies.

**Fix:** Use the file's own `sleep()` (the module-level one that holds strong timer references, per
the comment near `:18`) instead of `win.setTimeout`.

### WR-08: The base-domain highlight never matches an IDN host

**File:** `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx:297-305`;
`powerbrowser/shell/PowerBrowserAPI.sys.mjs:3540-3546`
**Issue:** `baseDomain` is computed from `uri.host`, which is ASCII/punycode. `displaySpec` is
`convertToDisplayIDN(uri.host)`, which is Unicode for a host the IDN policy allows. `host.endsWith(base)`
is then false, so the bold registrable domain, the spoof-resistance cue, silently disappears for
exactly the hosts where it matters most. The IDN live step covers only the mixed-script host that is
shown as punycode.

**Fix:** Convert `baseDomain` through `convertToDisplayIDN` in chrome, with the same policy.

### WR-09: Several live and static checks pass on a missing or null read, and some expectations are hand-kept

**File:** `scripts/verify-site-identity-live.mjs:257, 634-637, 923-926`;
`scripts/verify-shell-error-copy.mjs:570+`; `scripts/verify-site-identity-live.mjs` `STOCK_ROW_PAGES`
**Issue:**
- `:634` (`none.icons.length !== 0`) and `:923` (`iconGone ... === false`): `ICON_READ` returns
  `present:false, icons:[]` and `shieldIconOn` returns `false` when the identity box is absent. Both
  assertions pass if the box vanished. Neither checks `present`.
- `:257`: `plainBox.pill !== null && ...`, so a missing input passes the "http:// kept" check.
- `EXPECTED_NAV_COPY` (about fifty entries appended by hand), `STOCK_ROW_PAGES`, `WIRED_MENU_IDS`
  and `KIND_CLASSES` are hand-kept lists. CLAUDE.md says to derive and compare. The static gates
  partly derive against them, but the copy list can only ever agree with itself.
- The unfocused/focused pill checks read `input.value` synchronously after `focus()`, so they prove
  the imperative write in the focus handler, not the React reconcile that follows.

**Fix:** Require `present === true` before every "none" assertion, and add a positive control (the
same selector finding an element in an earlier step). Treat a null pill as BROKEN. Derive
`EXPECTED_NAV_COPY` from the `CHROME_BAR_COPY` object at check time.

## Info

### IN-01: `Help` opens `about:support`

**File:** `theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts:96`
**Issue:** The Firefox "Help" entry is a submenu. Here it opens the Troubleshooting Information page
(profile path, add-ons, preferences) under the label "Help". Product call; the live handoff does not
list it as one.
**Fix:** Confirm with the product owner, or label the row "Troubleshooting information".

### IN-02: Ctrl+Q is unconditionally reserved

**File:** `powerbrowser/shell/powerbrowser.js:327-336`
**Issue:** A reserved `<key>` means the Theia terminal and Monaco can never receive Ctrl+Q. It
matches Firefox's Linux binding, but the terminal's XON and readline users lose a key with no
confirmation. Recorded as a deliberate parity choice; flag it in the human-verification list.

### IN-03: `openStockPageFromMenu` leaves an extra `about:newtab` in a freshly opened window

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:5420-5436`
**Issue:** When no stock window exists it opens `about:newtab`, then adds the requested page as a
second tab. The live gate counts tabs on the target URL only.

### IN-04: `siteUnavailable` copy differs from UI-SPEC

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` (`siteUnavailable`)
**Issue:** The 31-02 deviation changed the planted expectation to the implemented wording instead of
the UI-SPEC wording ("Site information is not available for this page."). The implemented text
follows the CLAUDE.md copy rule (names the product, ends with a next step), so the spec should be
updated rather than left to disagree with the code.

## Verdicts on the five requested items

**1. `identityHostText` strips any `:port`.** Not a port bug, an IPv6 bug (WR-02).
- Chrome's `displaySpec` is `convertToDisplayIDN(uri.host)` and never has a port, so
  `127.0.0.1:8080` shows `127.0.0.1` whatever the regex does. The strip only affects the
  `committedAddress` fallback.
- For the `local` state, two services on different ports are indistinguishable in the box. The pill
  text still shows the port, and Firefox's box is host-only, so this is acceptable.
- The regex corrupts IPv6 hosts (`::1` -> `:`), which is a real defect.

**2. `pillText` / `onInputFocus` / `onInputBlur` writing `e.currentTarget.value` on a controlled input.**
No defect proven.
- `pillFocused` is set before the handler writes and before `update()`, so the DOM value and the next
  render agree: the value tracker sees the write and React's next set is a no-op.
- Typing, paste and IME flow through `onChange` into `inputValue`, which `pillText` returns untrimmed
  while focused. Trimming applies only when `inputValue === committedAddress`.
- A URL change while focused re-assigns `inputValue` (existing code at `address-bar.tsx:2268-2272`).
- Residual risks: `pillFocused` stays true if the input is removed without a blur (not seen, the pill
  is always mounted), and the imperative writes are redundant with the controlled value. They are
  only needed so Tab's select-all sees the full URL, which the live step does cover.
- Nothing covers IME, paste or URL-change-while-focused (WR-09).

**3. Clear site data purge scope.** Not scoped correctly. See CR-03 and WR-06.
- Cookies: whole base domain, not exact host.
- Storage: exact origin.
- Tab rows: exact `URL.hostname` equality, any port, never IPv6.
- `127.0.0.1` rows match every local port; the token cookie is exempt only by name+host.
- A user-visible deletion (closed rows) is not in the confirm text.

**4. Quit and unsaved editors.** What the code does, in order:
1. `quitRequest` or Ctrl+Q calls `quitApplication()` (`PowerBrowserAPI.sys.mjs:708`). That notifies
   `quit-application-requested`, sets `fastShutdownStage=0`, then calls
   `Services.startup.quit(eAttemptQuit)`.
2. `nsAppStartup::Quit` calls `CanClose()` on every window before any close (`nsAppStartup.cpp:394`).
3. For the shell window `GetBrowserDOMWindow()` is null (per CLAUDE.md), so
   `nsGlobalWindowOuter::CanClose` falls through to `viewer->PermitUnload()` (`:5990`).
4. `PermitUnload` walks the browsing-context tree, including out-of-process children
   (`nsDocumentViewer.cpp:1085-1100`), and fires `beforeunload` in Theia's frame.
5. Theia's `DefaultWindowService.handleBeforeUnloadEvent` (`default-window-service.js:156-163`)
   collects `onWillStop`. `CommonFrontendContribution.onWillStop` vetoes when `shell.canSaveAll()`
   (`common-frontend-contribution.js:892`). The handler calls `preventDefault()`.
6. Gecko cancels the quit only if the Theia document has had user interaction
   (`nsDocumentViewer.cpp:1217`), and then shows its generic leave-page prompt.
   Theia's own "Save all / Don't save" dialog cannot run in `beforeunload` (the code says it must
   finish in one tick).

So Theia does get a chance, but only as a generic Gecko prompt and only after real input. The live
run cannot show it either way, because the fixture edits with no user activation (WR-04). This is
unverified, not confirmed safe and not confirmed data loss. Treat the 31-05 conclusion as open until a
real-input live check exists. Separate from that, `quitRequest` replies `applied` when the user
declines the prompt.

**5. Autoplay effective-vs-stored and per-panel intents.** The effective/stored split is sound.
- Rows show the effective state, writes equal to the default are removals, and icons and the cycle
  key on `stored`.
- The intent map is needed only because the cycle is client-side. It still leaves a dead click for
  every default-equal state, always for `popup` and for autoplay when the pref is `ALLOWED` or
  `BLOCKED_ALL` (WR-05). The live gate tests only `camera` and the `BLOCKED` default.
- `setSitePermission` also applies a reply to whatever `sitePanelInfo` is current, without comparing
  origin or tab, so a reply that arrives after close-and-reopen lands on the new panel. Narrow, but
  worth closing alongside WR-05.

---

## Fix status

Applied 2026-10-29 on `main` (one commit per finding; the commits that touched two findings or a
catalogue remap are named). Checks run at the end: `verify-site-identity.mjs` and `--self-test` (52 plants),
`verify-site-identity-live.mjs` (every scenario), its `--self-test` (the clean control and 9 plants),
`verify-nav-keys-live.mjs`, `verify-platform.sh --quick`, `scan-brand-residue.mjs`, both internals-boundary checks.

| ID | Status | Commit | Note |
|----|--------|--------|------|
| CR-01 | FIXED | 32bff7c | An overridden certificate takes the warning bucket (`broken`), not `secure`. Upstream's distinct "verified by you" tooltip (`browser-siteIdentity.js:939-946`) is not replicated: a `shortcut:` comment records it. Live `identity-override` (fixture CA untrusted, override in the probe profile only) passes; with the old condition it goes red. Static plant added. |
| CR-02 | FIXED | 86df510 | The state router forwards `shieldExcepted`. The static case derives the pushed keys and the router keys and compares them. Live `shield` navigates the excepted tab to a second site and back. Runtime plant `router-drops-shield` goes red. |
| O-31-A | FIXED | 86df510 | Same root as CR-02. |
| CR-03 | FIXED | 83904ec | Scope is the registrable domain for cookies and storage alike, as upstream (`browser-siteIdentity.js:473-475`, `SiteDataManager.remove` over `deleteDataFromSite`). The token cookie stays exempt by name and host. The dialog names the domain and says it covers subdomains. D-31-12 is revised. The review's exact-host suggestion is not taken. The 31-03 summary's "accepted by design" wording is now wrong and is not edited here. Live `clear-scope` (`pb-fixture.test` / `www.pb-fixture.test`, TLS session) passes; with origin-only storage it goes red (`store:seeded`). `clear-data` still passes. |
| WR-06 | FIXED | 2e57534 | The purge has its own `try`: a tab-store failure after a successful clear is logged and the reply stays `cleared`. The closed-tab removal is disclosed in the confirm text (product call: disclose, not drop). Static plant added. |
| O-31-B | FIXED | 2e57534 | The three `handleWebTabAction` failure logs carry a fixed string. Static case derives the handler body and requires no `err.message` on any log line in it. |
| WR-01 | FIXED | 73faf06 | The origin and host are captured before the await; a page change returns `where: "site-changed"`. Static case and plant. No live race step. |
| WR-02 | FIXED | febd06a | `identityHostText` uses `displaySpec` as it is; the port strip and IPv6 brackets apply to the committed-address fallback only. Static case and plant. No live IPv6 step yet. |
| WR-08 | FIXED | febd06a, f84981e | `baseDomain` is converted with `convertToDisplayIDN` in chrome. f84981e removes a duplicated plan citation that moved the frozen `-PLAN.md` count. Static case and plant. No live Unicode-host highlight step yet. |
| WR-03 | FIXED | d16a43f | `notBefore`/`notAfter` are `PRTime`; formatted in chrome (UTC). Live `site-panel` asserts a `Valid:` row with both dates (passes). |
| WR-05 | FIXED | 96a8430, a82cbc3 | No client intents map. The cycle runs over effective states (`permissionOrder`); each click changes what the row shows, for popup and for autoplay under ALLOWED and BLOCKED_ALL defaults. Live `site-panel` clicks popup three times from its default; `site-panel-autoplay-allowed` (new session, pref asserted) passes. |
| WR-04 | FIXED | 3090e37 (6ceaa4d superseded), 3b9c443 | FIXED: `quitRequest` replies `cancelled` when the quit is declined (`attemptingQuit`, set only after every `CanClose`); the fast-shutdown stage is restored on a decline. Static case and plant. 3b9c443: the unsaved-editor veto is honoured. The shell window has no nsIBrowserDOMWindow, so nsGlobalWindowOuter::CanClose (nsGlobalWindowOuter.cpp:5975) never reached the Theia `<browser>`. A `quit-application-requested` observer (`shellQuitVeto`, end of PowerBrowserAPI.sys.mjs) now asks each shell browser's `permitUnload()`, as upstream CanCloseWindow does (browser.js:3633-3690). Live `quit-typed` passes: the leave prompt is Firefox's beforeunload text in a window-modal commonDialog, Escape stays, and the browser keeps running. So `dom.require_user_interaction_for_beforeunload` did not suppress the prompt; the typed document had user activation. The harness now finds that dialog (it was never a shell-document node) and reads a BiDi timeout on the key reply as a held quit, not a closed channel; the pass/fail criteria are otherwise unchanged. Self-test plant `quit-no-veto` goes red. No pref change and no custom confirm (UI-SPEC :117). The 31-05 summary's "no product decision needed" is correct for this fix. |
| WR-07 | FIXED | 3f66136 | The stock-window poll uses the module `sleep()`. Static case and plant. No live step (closing a stock window mid-poll is not driven). |
| WR-09 | PARTIAL | e8335a7 | FIXED: every "none" read needs `present === true`; a null pill is a failure; the autoplay icon check needs the box. NOT CHANGED, on purpose: `EXPECTED_NAV_COPY` (`verify-shell-error-copy.mjs`) is the reviewed copy list; the gate already derives the strings from `CHROME_BAR_COPY` and compares both ways, so a derived list would agree with itself. `STOCK_ROW_PAGES` labels-to-pages has no tree source; the static gate pins the page set to the `openStockPage` switch. Not addressed: the synchronous `input.value` read after `focus()` (not in the requested set). |
| IN-01..04 | not in scope | — | Info findings were not requested for this pass. |

Live results on the final run: `identity-tls`, `identity-override`, `clear-scope`, `site-panel`,
`site-panel-autoplay-allowed`, `identity-local`, `clear-data`, `shield`, `app-menu`, `quit-key`, `quit-row` PASS;
`quit-typed` PASS after the WR-04 fix (3b9c443). The live `--self-test` passes (clean control green for all nine sessions, quit-typed included; 10 plants red, quit-no-veto among them).
`verify-nav-keys-live.mjs` passes.

_Reviewed: 2026-10-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
