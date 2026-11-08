---
phase: 31-site-identity-permissions-and-app-menu
verified: 2026-10-30T05:09:00Z
status: human_needed
score: 5/5 success criteria verified; 11/11 requirement IDs mapped to code and live evidence (pending the human items below)
behavior_unverified: 0
overrides_applied: 0
covered_files: [".planning/phases/31-site-identity-permissions-and-app-menu/31-01-PLAN.md", ".planning/phases/31-site-identity-permissions-and-app-menu/31-01-SUMMARY.md", ".planning/phases/31-site-identity-permissions-and-app-menu/31-02-PLAN.md", ".planning/phases/31-site-identity-permissions-and-app-menu/31-02-SUMMARY.md", ".planning/phases/31-site-identity-permissions-and-app-menu/31-03-PLAN.md", ".planning/phases/31-site-identity-permissions-and-app-menu/31-03-SUMMARY.md", ".planning/phases/31-site-identity-permissions-and-app-menu/31-04-PLAN.md", ".planning/phases/31-site-identity-permissions-and-app-menu/31-04-SUMMARY.md", ".planning/phases/31-site-identity-permissions-and-app-menu/31-05-PLAN.md", ".planning/phases/31-site-identity-permissions-and-app-menu/31-05-SUMMARY.md", "inventory/brand-tokens.json", "powerbrowser/INTERNAL-APIS.md", "powerbrowser/shell/PowerBrowserAPI.sys.mjs", "powerbrowser/shell/powerbrowser.js", "scripts/fixtures/tls/README.md", "scripts/fixtures/tls/pb-fixture.key", "scripts/fixtures/tls/pb-fixture.pem", "scripts/fixtures/tls/test-ca.pem", "scripts/lib/firefox-bidi.mjs", "scripts/lib/pb-live-probe.mjs", "scripts/lib/pb-relaunch.mjs", "scripts/verify-address-bar-live.mjs", "scripts/verify-platform.sh", "scripts/verify-shell-error-copy.mjs", "scripts/verify-shortcut-relay.mjs", "scripts/verify-site-identity-live.mjs", "scripts/verify-site-identity.mjs", "scripts/verify-web-tab-bridge.mjs", "theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx", "theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts", "theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx", "theia/extensions/chrome-bar/src/browser/chrome-bar.css", "theia/extensions/chrome-bar/src/browser/site-identity/app-menu.ts", "theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts", "theia/extensions/chrome-bar/src/browser/site-identity/site-panel.tsx", "theia/extensions/tab-uris/src/browser/chrome-store-client.ts", "theia/extensions/tab-uris/src/browser/web-tab.ts"]
covered_digest: "v3:sha256:47956130225dfd7918b826626fda07ec0b5de53dd2c812ce98eead42753dbacb"
human_verification:
  - test: "Pixel review of the identity box on a https page, an http page, a mixed-content page, a localhost page and an IDN host (Chrome bar, pill)"
    expected: "Lock on https; crossed lock with Not Secure text on http; warning icon on mixed content; no icon on localhost; the registrable domain is bold; a spoofable IDN shows as punycode; https:// is trimmed only on the https page"
    why_human: "Visual layout, colour and spacing of the identity box are not checkable by grep or a DOM read"
  - test: "Pixel review of the site information panel: connection header, certificate block (secure pages only), the six permission rows, the shield count row and the Clear cookies and site data row"
    expected: "Panel shows connection details and certificate text read-only; permission rows show effective state with the tri-state label; shield row shows the blocked count or Protection off; clear-data row is styled as a row, not a warning"
    why_human: "Layout, copy hierarchy and visual weight are a judgment call against UI-SPEC"
  - test: "Hamburger menu: pixel review of the 280px sheet, the row order (New tab, Settings, Passwords, Add-ons, Help, Quit) and the separators, opened in Coding, Browsing and Organising"
    expected: "The sheet is 280px wide and sits under the button in each mode; separators fall between the four groups; disabled rows (none expected) would show Coming soon"
    why_human: "Sheet width and separator rendering are visual; the live gate checks the rows, not the pixels"
  - test: "Real-keyboard use of the hamburger menu (arrow keys, Enter, Escape), the shield toggle and the clear-data ConfirmDialog (Tab order, Enter on Clear, Escape on Cancel)"
    expected: "Keyboard reaches every row and control; Escape closes the menu and the dialog without acting; Clear runs the clear only after confirmation"
    why_human: "The live harness drives these by script, not by a user's keyboard focus path"
  - test: "Quit row pixel review and the Quit badge wording (`Quit {App}` with the Ctrl+Q badge)"
    expected: "Badge reads as UI-SPEC specifies; the row is the last item, separated from Help"
    why_human: "Copy judgment and badge placement are for Chris to accept"
  - test: "Real Ctrl+Q in three focus positions: a web page, a Theia editor, and Monaco with an unsaved editor. In the unsaved case choose Leave, and separately choose Cancel or Escape"
    expected: "Ctrl+Q with an unsaved editor shows the Firefox leave prompt; Cancel or Escape keeps the app running; Leave quits. The Leave branch has not been driven live (see Known-open)"
    why_human: "The live harness covers the Escape path only; the Leave branch and real-keyboard focus in Monaco need a person"
  - test: "OS session end (logout or shutdown) with an unsaved editor open"
    expected: "The leave prompt or veto behaves as on Ctrl+Q; no unsaved editor is lost silently"
    why_human: "Not driven live by any scenario; needs the desktop session to end"
---

# Phase 31: Site Identity, Permissions and App Menu - Verification Report

**Phase Goal:** The identity box reports the page's real connection and permissions, and a Firefox-ordered app menu opens in every mode
**Verified:** 2026-10-30T05:09:00Z (local 2026-10-29)
**Status:** human_needed
**Re-verification:** No (initial verification; no prior VERIFICATION.md existed)
**Tree:** HEAD dd4a2d5 on main; phase implementation diff base 3e8d991

## Verdict

Every success criterion is implemented in the code and has a passing live scenario. No truth is FAILED, no artifact is missing or a stub, and no key link is broken. The status is `human_needed` under the Step 9 decision tree because the human items above exist. They are deferred to the end of the milestone and produce no gap. Two warnings need a decision before acceptance: the SECURITY.md audit predates the review fixes, and the registrable-domain clear scope has not been re-approved by Chris.

## Method

Goal-backward. The five ROADMAP success criteria are the truth set (roadmap contract, Step 2a). PLAN frontmatter adds no further truths: all five plans cite roadmap-level requirements, and all eleven requirement IDs are claimed by a plan (no orphans). The SUMMARY files were read only as pointers. Each truth was checked in the code (`PowerBrowserAPI.sys.mjs`, `web-tab.ts`, `address-bar.tsx`, `chrome-bar-widget.tsx`, `app-menu.ts`, `site-identity-table.ts`, `site-panel.tsx`, `powerbrowser.js`).

Static gates were re-run by the verifier on this tree:

- `node scripts/verify-site-identity.mjs`: PASS, 43 cases.
- `node scripts/verify-site-identity.mjs --self-test`: rc 0, 52 planted faults all red.
- `scripts/check-internals-boundary.sh`: PASS.
- `scripts/check-internals-boundary.sh --catalogue`: rc 0.
- `scripts/check-internals-boundary.sh --self-test`: rc 0.
- `node scripts/scan-brand-residue.mjs`: rc 0.

The live gate (`scripts/verify-site-identity-live.mjs`, 12 scenarios, and its self-test) and `scripts/verify-platform.sh --quick` were not re-run. Their results are cited from the orchestrator's run on this tree today: all 12 scenarios PASS, self-test rc 0 with 10 of 10 plants red, `verify-nav-keys-live.mjs` rc 0, `verify-platform.sh --quick` PASS.

## Goal Achievement

### Observable Truths (roadmap success criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | An https page shows a lock taken from the real connection state; http shows "Not Secure"; mixed content or a certificate error shows the warning state; typing never changes the lock; editor tabs show no indicator | VERIFIED | Chrome side: `PowerBrowserAPI.webTabIdentity` (PowerBrowserAPI.sys.mjs ~3518-3550) decodes `browser.securityUI.state` (STATE_IS_SECURE, STATE_IS_BROKEN, STATE_IS_INSECURE, STATE_LOADED_MIXED_*, STATE_CERT_USER_OVERRIDDEN) into an enum. The push carries `securityState` in the same message as `url` (~3488-3490). `onSecurityChange` and `onContentBlockingEvent` are registered on the overlay mask (~3376-3397). Theia side: `address-bar.tsx` `identityState()` (~265-280) reads only pushed fields; `renderIdentityBox()` (~322-372) maps the enum to the icon. No scheme test on typed text survives (static case "no typed-text lock derivation"). Editor tabs: `setCurrentWebTab` clears on any non-web widget (chrome-bar-commands.ts:73-85), so `identityState()` returns undefined. Live: `identity-tls` (secure, http "Not Secure", mixed-passive warning) PASS; `identity-override` (broken from a user-overridden cert) PASS. |
| 2 | Host shows its registrable domain highlighted; a spoofable IDN shows as punycode; `https://` is trimmed only on a secure page | VERIFIED | `identityHost()` (address-bar.tsx ~343-352) bolds the base-domain suffix. `displaySpec` comes from `nsIIDNService.convertToDisplayIDN` (PowerBrowserAPI ~3558), so a spoofable host stays punycode. `pillText()` (~2217-2224) trims only when `identityState()?.state === 'secure'` and the pill is unfocused on the committed URL; the regex is `https://` only, so http is never trimmed. Live: `identity-tls` IDN case PASS. WR-08 (Unicode base-domain highlight) is static only (see Known-open). |
| 3 | Clicking the lock opens a site panel with connection details and the certificate; the user changes this site's camera, microphone, location, notifications, autoplay and popup permissions there; non-default permissions show icons in the identity box | VERIFIED | `openSitePanel` from the identity button (address-bar.tsx `renderIdentityBox`, onClick). Chrome `webTabSiteInfo` (PowerBrowserAPI ~3705-3760) reads `secInfo.serverCert` (issuer, subject, validity as PRTime, formatted in chrome), permissions via `SitePermissions.getForPrincipal` / `getPermissionLabel`, and the origin captured before the await with a page-change refusal (`where: "site-changed"`). Writes: `webTabSetPermission` (~4702-4746) keys on `entry.browser.contentPrincipal`, refuses unless `principal.origin === data.origin`, and calls `SitePermissions.removeFromPrincipal` then `setForPrincipal`. The ID list `SITE_INFO_PERMISSION_IDS` (~4498) is the six upstream IDs, and the static gate compares it to the Theia table by set equality. Icons: the push sends `permissionIcons` filtered to `stored !== 'default'` (~3493-3495), and `renderPermissionIcons` draws them in the box. Live: `site-panel` PASS (popup cycle from default, camera write); `site-panel-autoplay-allowed` PASS. |
| 4 | Clear cookies and site data removes the current site's data and the IDE stays signed in, including after clearing on a localhost tab; the shield shows what was blocked and turns protection off for the site | VERIFIED (scope warning, see W-2) | `webTabClearSiteData` (PowerBrowserAPI ~5370-5387): per-cookie removal over `getCookiesFromHost(site)` skipping the token cookie (`webTabTokenCookie`: name `POWERBROWSER_TOKEN` AND host `127.0.0.1`), then `deleteDataFromSite` with `CLEAR_COOKIES_AND_SITE_DATA & ~CLEAR_COOKIES`, then a token-count re-check that refuses with `token-cookie` if the token fell. Never `SiteDataManager.remove` or `Sanitizer.sanitize` (static gate). The clear is ConfirmDialog-gated, naming the domain (address-bar.tsx ~487-520; copy chrome-bar-copy.ts ~108-116). Shield: `webTabBlockedTrackerCount` counts only blocking-bit origins from `getContentBlockingLog()` (~3610-3640); `webTabShieldToggle` (~4778-4800) writes `ContentBlockingAllowList` add/remove under the origin echo; the box shield icon renders from pushed `shieldExcepted` (CR-02 fix in `web-tab.ts:324`). Live: `clear-data` (127.0.0.1 and localhost tabs; localhost marker removed, frame still signed in, hasData false) PASS; `clear-scope` PASS; `shield` (excepted tab navigated to a second site and back) PASS. |
| 5 | Hamburger opens from the chrome bar in Coding, Browsing and Organising, in Firefox's order, and opens Settings, Passwords and Add-ons; Ctrl+Q and the menu's Quit item quit the application | VERIFIED | The hamburger is a plain `pb-chrome-bar-button` in the chrome bar (chrome-bar-widget.tsx ~705-716), not gated by mode; `openAppMenu` renders the per-request `buildAppMenu(MENU_ORDER, WIRED_MENU_IDS, MENU_PHASE)` (~424-441). Order is in `MENU_ORDER` (site-identity-table.ts ~69-77): New tab | Settings, Passwords, Add-ons | Help | Quit, with separators by group; the static gate derives the order from the UI-SPEC hamburger entries. Settings/Passwords/Add-ons send `openStockPage` (enum only, no URL; `openStockPageFromMenu` allow-list at PowerBrowserAPI ~5406-5430). Quit row sends `quitRequest` (widget ~462-468); Ctrl+Q is a chrome-reserved `<key>` in `powerbrowser.js` ~322-336 calling `PowerBrowserAPI.quitApplication()`. `quitRequest` arm (~4173-4180) returns `cancelled` on a veto. One quit path: `Services.startup.quit` is spelled once, inside `quitApplication()` (static gate). Live: `app-menu` (Coding, Browsing, Organising in one session, rows read in tree order) PASS; `quit-key` PASS; `quit-row` PASS; `quit-typed` PASS (Escape holds the quit on a typed unsaved document; the browser keeps running). |

**Score:** 5/5 truths verified. Behavior-dependent truths (state transitions and cancellation invariants: shield exception across navigation, clear cleanup, quit veto) each have a passing live scenario, so none is PRESENT_BEHAVIOR_UNVERIFIED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SITE-01 | 31-01 | Lock reflects real connection security, never typed address | SATISFIED (human pixel review pending) | Truth 1 |
| SITE-02 | 31-01 | Not Secure on http; warning for mixed content and cert errors | SATISFIED (human pixel review pending; see W-3) | Truth 1; override path live, bare cert-error path static only |
| SITE-03 | 31-01 | Registrable domain highlighted; IDN safe; https trimmed only when secure | SATISFIED (human pixel review pending) | Truth 2 |
| SITE-04 | 31-02 | Site information panel from the lock: connection details and certificate | SATISFIED (human pixel review pending) | Truth 3; `site-panel` live |
| SITE-05 | 31-02 | View and change this site's camera, mic, location, notifications, autoplay, popups | SATISFIED | Truth 3; principal-keyed write; `site-panel`, `site-panel-autoplay-allowed` live |
| SITE-06 | 31-02 | Permission icons in identity box when non-default | SATISFIED | Truth 3; push filter `stored !== 'default'` |
| SITE-07 | 31-03 | Clear cookies and site data for current site; never signs the IDE out | SATISFIED (scope needs decision; see W-2) | Truth 4; `clear-data`, `clear-scope` live |
| SITE-08 | 31-03 | Shield shows what was blocked; turn protection off for a site | SATISFIED | Truth 4; `shield` live; CR-02 fix verified live |
| MENU-01 | 31-04 | Hamburger in every mode, Firefox order | SATISFIED (human pixel and keyboard review pending) | Truth 5; `app-menu` live across three modes |
| MENU-02 | 31-04 | Settings, Passwords, Add-ons from the menu | SATISFIED | Truth 5; `openStockPage` enum; `app-menu` live |
| MENU-04 | 31-05 | Quit with Ctrl+Q or the menu | SATISFIED (Leave branch and session end not live; see Known-open) | Truth 5; `quit-key`, `quit-row`, `quit-typed` live |

Orphaned requirements: none. Every ID mapped to Phase 31 in REQUIREMENTS.md is claimed by a plan. The REQUIREMENTS.md table still shows "Pending" for all eleven rows; this verifier did not edit it (see W-5).

### Review fix status (31-REVIEW.md, cross-checked)

All three Critical findings and the requested Warnings were checked in the code. Each is cited by the static gate, and the fixes are in the commits listed in the REVIEW.

- CR-01 (overridden certificate shown as secure): fixed. `webTabIdentity` routes `STATE_CERT_USER_OVERRIDDEN` to the warning bucket (~3536-3546). Live `identity-override` PASS.
- CR-02 and O-31-A (shield dropped by router): fixed. `web-tab.ts:324` forwards `shieldExcepted`. Live `shield` PASS.
- CR-03 (clear scope too narrow by a false premise): fixed by revising the scope to the registrable domain (`webTabSite`, ~5358-5360). Re-verified here. See W-2.
- WR-01, WR-02, WR-03, WR-05, WR-06, WR-07, WR-08 (ASCII part): fixed; each has a static case and a plant. Live coverage differs (see Known-open).
- WR-04 (quit could not honour the unsaved-editor veto): fixed in 3b9c443. `shellQuitVeto` (PowerBrowserAPI ~5520-5545) asks each shell browser's `permitUnload()`. Live `quit-typed` PASS.
- WR-09: PARTIAL, on purpose (see Known-open).
- IN-01 to IN-04: not in the requested set; not addressed; not blocking.

## Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | Chrome decode, site info, permission/clear/shield arms, stock-page enum, quit veto | VERIFIED | Exists; substantive (identity decode, webTabSiteInfo, webTabSetPermission, webTabClearSiteData, webTabShieldToggle, openStockPageFromMenu, quitRequest arm, shellQuitVeto); wired through `handleWebTabAction`/`handleStoreRequest` and the state push |
| `powerbrowser/shell/powerbrowser.js` | Chrome-reserved Ctrl+Q row | VERIFIED | Exists; `<key>` row calls `quitApplication()`; window-close also calls it |
| `theia/extensions/tab-uris/src/browser/web-tab.ts` | State router forwards pushed fields | VERIFIED | Forwards `shieldExcepted` (line 324) and the other Phase 31 fields |
| `theia/extensions/tab-uris/src/browser/chrome-store-client.ts` | `openStockPage`, `quitRequest` client methods | VERIFIED | Present; the Quit row calls `store.quitRequest()` |
| `theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts` | Permission and menu tables, PERMISSION_IDS, STOCK_PAGES | VERIFIED | Present; static gate checks each against the tree |
| `theia/extensions/chrome-bar/src/browser/site-identity/app-menu.ts` | Pure menu builder | VERIFIED | Present; `buildAppMenu` used by the widget |
| `theia/extensions/chrome-bar/src/browser/site-identity/site-panel.tsx` | Panel: connection, certificate, permissions, clear, shield | VERIFIED | Present; rendered from the widget's panel state |
| `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx` | Identity box, pill trim, clear dialog, panel open/write | VERIFIED | Present; `identityState`, `renderIdentityBox`, `clearSiteDataFromPanel` |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` | Hamburger button, menu open, Quit and stock-page handlers | VERIFIED | Present; hamburger at ~705-716 |
| `scripts/verify-site-identity.mjs` | Static gate with self-test | VERIFIED | Ran PASS (43 cases) and self-test (52 plants red) |
| `scripts/verify-site-identity-live.mjs` | Live gate, 12 scenarios | VERIFIED (cited) | Orchestrator run on this tree: 12 PASS; self-test rc 0 with 10 plants red |

## Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| overlay `securityUI` | pill identity box | `scheduleWebTabState` push with `securityState` | WIRED | `onSecurityChange` (~3376) and the state push (~3488) |
| Theia `WebTabChannel` state push | `WebTabWidget` fields | `web-tab.ts` `onPush('state')` mapping | WIRED | `shieldExcepted` forwarded (CR-02 fixed) |
| identity box click | site panel | `openSitePanel` | WIRED | address-bar.tsx `renderIdentityBox` onClick |
| panel permission row | `SitePermissions` write | `webTabSetPermission` with `data.origin` echo | WIRED | Origin compared; principal-keyed write |
| panel clear button | cookie and storage clear | ConfirmDialog then `webTabClearSiteData` | WIRED | address-bar.tsx ~487-520 |
| panel shield toggle | `ContentBlockingAllowList` | `webTabShieldToggle` | WIRED | Origin echo; box refresh from reply |
| hamburger row New tab | new-tab command | `runAppMenuRow` | WIRED | chrome-bar-widget.tsx ~449-451 |
| hamburger row Settings/Passwords/Add-ons/Help | `openStockPage` enum | `openStockPageRow` | WIRED | Enum only; chrome holds the URLs |
| hamburger Quit row | `quitApplication()` | `quitRequest` store kind | WIRED | Single quit path (static gate) |
| Ctrl+Q | `quitApplication()` | reserved chrome `<key>` | WIRED | powerbrowser.js ~327-336 |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Identity box | `securityState`, `displaySpec` | `securityUI.state`, `browser.currentURI` in the overlay | Yes | FLOWING |
| Permission rows | `state`, `stored`, `label` | `SitePermissions.getForPrincipal/getPermissionLabel` | Yes | FLOWING |
| Certificate block | issuer, subject, validity | `secInfo.serverCert` | Yes (secure pages only) | FLOWING |
| Shield count | `blockedTrackers` | `getContentBlockingLog()` parsed | Yes | FLOWING |
| Hamburger rows | row labels, enablement | `MENU_ORDER`, `WIRED_MENU_IDS`, `CHROME_BAR_COPY` | Yes (static table by design) | FLOWING |

## Behavioral Spot-Checks

Step 7b behaviours were exercised by the live gate (cited, not re-run). No single named test was run by the verifier.

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Identity states (secure, http, mixed, IDN, override, localhost) | `node scripts/verify-site-identity-live.mjs --scenario identity-tls,identity-override,identity-local` | PASS (cited) | PASS (cited) |
| Permission write and cycle | `... --scenario site-panel,site-panel-autoplay-allowed` | PASS (cited) | PASS (cited) |
| Clear cookies and site data, token survival | `... --scenario clear-data,clear-scope` | PASS (cited) | PASS (cited) |
| Shield exception across navigation | `... --scenario shield` | PASS (cited) | PASS (cited) |
| Menu rows in three modes | `... --scenario app-menu` | PASS (cited) | PASS (cited) |
| Ctrl+Q, Quit row, typed quit veto (Escape path) | `... --scenario quit-key,quit-row,quit-typed` | PASS (cited) | PASS (cited) |
| Static gate and its plants | `node scripts/verify-site-identity.mjs --self-test` | rc 0, 52 plants red | PASS (re-run) |

## Probe Execution

Not applicable. No `scripts/*/tests/probe-*.sh` exists in the tree, and no PLAN declares a probe.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (phase-changed files, 27) | - | `TBD`, `FIXME`, `XXX` | none | Debt-marker gate: zero markers in any phase-changed file |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | ~5528 | `shellBrowsersPermitUnload` logs and quits when `permitUnload()` throws | Warning | Fails open on an error; see W-4 |
| `theia/extensions/chrome-bar/src/browser/site-identity/*` and `address-bar.tsx` | - | `shortcut:` comments | Info | Recorded limits (upstream "verified by you" tooltip not replicated; no distinct state); not blocking |

## Warnings

- **W-1 (SECURITY.md is stale against HEAD).** `31-SECURITY.md` records `threats_open: 0` at HEAD 58465e6. Fourteen review-fix commits landed after it (32bff7c through 3b9c443), including the CR-03 clear-scope widening and the WR-04 quit-veto change. The audit therefore does not cover the current tree. This verifier re-read the two mitigations most affected: T-31-03, the token-cookie exemption (`webTabTokenCookie` by name and host, plus the post-clear token re-check), and T-31-06/P05, the single quit path (static gate green). Both still hold statically. Recommend a `gsd-secure-phase` re-run on HEAD before the phase is accepted. This does not change the status, because the threat register's mitigations were re-checked here.
- **W-2 (clear scope needs Chris's decision).** SITE-07 says "the current site's data". The shipped clear covers the registrable domain and all its subdomains, for cookies and storage, and removes closed tab rows for the site (D-31-12, revised 2026-10-29 under CR-03). The dialog discloses this. The prior "exact host" premise was false, and the fix follows upstream parity. The widening has not been re-approved by Chris. Separately, O-31-D (a clear from an overlay on the sidecar origin also clears the IDE frame's storage) is accepted as upstream parity.
- **W-3 (bare certificate-error path has no live case).** SITE-02's certificate-error warning is live-proven only through the user-override case, which takes the `isSecure && overridden` branch. A certificate error with no override takes the `isBroken` branch. The code is correct on reading, but no scenario drives it.
- **W-4 (quit veto fails open).** `shellBrowsersPermitUnload` (PowerBrowserAPI.sys.mjs ~5525-5538) catches an exception from `permitUnload()`, logs it, and treats the browser as permitting the quit. A throw therefore skips the leave prompt for that browser. The log says "quitting anyway", so this is a deliberate choice in the code. It is not covered by any scenario. Chris should decide whether the unsaved-editor veto should fail closed.
- **W-5 (bookkeeping not updated).** REQUIREMENTS.md still shows SITE-01..08 and MENU-01/02/04 as Pending. ROADMAP.md still shows the five plan checkboxes unchecked. This verifier was instructed not to edit ROADMAP.md or STATE.md, and did not edit REQUIREMENTS.md. The orchestrator should update these when accepting the phase.
- **W-6 (stale wording in the 31-03 summary).** The 31-03 SUMMARY's "accepted by design" wording on the exact-host scope is now wrong (REVIEW fix status states this and did not edit it). D-31-12 in CONTEXT.md is the corrected record.

## Known-Open Items (recorded, not blocking)

- WR-09 partial, on purpose: `EXPECTED_NAV_COPY` in `verify-shell-error-copy.mjs` stays a hand-kept list, since a derived list would agree with itself, and `STOCK_ROW_PAGES` has no tree source (the static gate pins it to the `openStockPage` switch). The synchronous `input.value` read after `focus()` is not addressed.
- WR-01, WR-02, WR-07 and the Unicode half of WR-08 are static-only. Their live steps (a race on the site-info reply, an IPv6 identity host, closing a stock window mid-poll, a Unicode-host highlight) do not exist yet.
- The Leave branch of the unsaved-editor quit is not driven live. The live gate covers Escape only. OS session-end quit is not driven live.
- O-31-D: a clear from an overlay on the sidecar's own origin also removes the IDE frame's local storage. Accepted as upstream parity; not re-approved by Chris.
- Info findings IN-01 (Help opens about:support), IN-02 (Ctrl+Q unconditionally reserved), IN-03 (extra about:newtab in a freshly opened window) and IN-04 (siteUnavailable copy differs from UI-SPEC) were not in the requested set and are not addressed.

## Human Verification Required

The items are deferred to the end of the milestone per the milestone rule. They produce no gap and do not change the phase's gap state. The list is also in the frontmatter `human_verification` section.

### 1. Identity box pixel review

**Test:** Load an https page, an http page, a mixed-content page, a localhost page and an IDN host. Look at the identity box in the chrome bar.
**Expected:** Lock on https; crossed lock with the Not Secure text on http; warning icon on mixed content; no icon on localhost; the registrable domain is bold; a spoofable IDN is shown as punycode; https:// is trimmed only on the https page.
**Why human:** Layout, colour and spacing are not checkable by grep or DOM read.

### 2. Site information panel pixel review

**Test:** Click the lock on an https page with a certificate, then on a page with non-default permissions.
**Expected:** Connection header, certificate block (secure pages only), six permission rows with the tri-state labels, the shield count row, and the Clear cookies and site data row, all readable in UI-SPEC hierarchy.
**Why human:** Visual weight and copy hierarchy are a judgment against UI-SPEC.

### 3. Hamburger menu pixel review and mode check

**Test:** Open the hamburger in Coding, Browsing and Organising.
**Expected:** The sheet is 280px wide and sits under the button in each mode. Rows read New tab | Settings, Passwords, Add-ons | Help | Quit, with separators between the four groups.
**Why human:** Sheet width and separator rendering are visual; the live gate checks the rows, not the pixels.

### 4. Real-keyboard use of the menu, shield toggle and clear dialog

**Test:** Use arrow keys, Enter and Escape in the hamburger menu. Tab to the shield toggle and toggle it with Enter. Open Clear cookies and site data, then press Escape, then reopen and press Clear.
**Expected:** Keyboard reaches every row and control. Escape closes the menu and the dialog with no action. Clear runs the clear only after confirmation.
**Why human:** The live harness drives these by script, not by a user's focus path.

### 5. Quit row pixel review and Quit badge wording

**Test:** Open the hamburger and look at the last row.
**Expected:** The row reads "Quit {App}" with the Ctrl+Q badge as UI-SPEC specifies, and sits after Help, separated.
**Why human:** Copy judgment and badge placement are for Chris to accept.

### 6. Real Ctrl+Q in three focus positions

**Test:** Press Ctrl+Q with focus (a) on a web page, (b) in a Theia editor, (c) in Monaco with an unsaved editor. In case (c), choose Cancel or press Escape, then press Ctrl+Q again and choose Leave.
**Expected:** Ctrl+Q with an unsaved editor shows the Firefox leave prompt. Cancel or Escape keeps the app running. Leave quits. Nothing unsaved is lost silently.
**Why human:** The live harness covers the Escape path only. The Leave branch and real focus in Monaco need a person (see W-4 and Known-open).

### 7. OS session end with an unsaved editor

**Test:** With an unsaved editor open, log out or shut down.
**Expected:** The leave prompt or veto behaves as on Ctrl+Q, and no unsaved editor is lost silently.
**Why human:** Not driven by any scenario; needs the desktop session to end.

## Gaps Summary

No gaps. Every must-have truth is VERIFIED, every artifact exists, is substantive and is wired, and every key link is wired. The human items and warnings above do not block the goal. Warnings W-1 and W-2 should be resolved before the phase is accepted: W-1 needs a SECURITY.md re-run, and W-2 needs Chris's approval of the registrable-domain clear scope.

---

_Verified: 2026-10-30T05:09:00Z_
_Verifier: Claude (gsd-verifier)_
