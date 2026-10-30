---
phase: 31-site-identity-permissions-and-app-menu
plan: 03
subsystem: ui
tags: [site-identity, clear-site-data, token-cookie, shield, content-blocking, react, theia, chrome-bar]

# Dependency graph
requires:
  - phase: 31-site-identity-permissions-and-app-menu
    plan: 02
    provides: [webTabSetPermission kind, site-panel.tsx, origin-echo write pattern, identity-box icons]
provides:
  - webTabClearSiteData kind (cookies one by one except the token cookie, then non-cookie storage through the overlay principal, origin echo)
  - webTabShieldToggle kind (ContentBlockingAllowList add/remove on the overlay browser, origin echo, upstream reload)
  - clear-data row with a ConfirmDialog in the site panel; shield count line and toggle; identity-box shield for an excepted site
  - live clear-data and shield scenarios with planted-clear proof, and static cases 15-16 with six new plants

# Actuals — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 20764    # chars/4 over the added lines of the code commits (git diff 6d5170c..9c097a6, powerbrowser/theia/scripts)
  tasks: 3
  commits: 5       # MEASURED: git rev-list --count 6d5170c..9c097a6
  plan_head_before: 6d5170c4d7bd3224700574a617b5c960c836854e
  plan_head_after: 9c097a607606032907c2a6188ae9a83959da36b7

# Tech tracking
tech-stack:
  added: []
  patterns: [origin-echo compare on the clear and shield writes (one per privileged write arm), cookie-by-cookie removal with a name+host exemption, cookie-excluding storage clear, live planted-clear proof with positive controls, render-level plant where a refresh-level plant would race a state push]

key-files:
  created:
    - .planning/phases/31-site-identity-permissions-and-app-menu/31-03-LIVE-HANDOFF.md
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/chrome-bar/src/browser/site-identity/site-panel.tsx
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-site-identity.mjs
    - scripts/verify-site-identity-live.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-platform.sh

key-decisions:
  - "The clear never calls SiteDataManager.remove or the window-modal prompt: per-cookie removal skipping the token (name + 127.0.0.1), then deleteDataFromPrincipal with CLEAR_COOKIES_AND_SITE_DATA minus CLEAR_COOKIES"
  - "Both privileged webTab writes (permission, clear, shield) take the origin the panel displayed and refuse when the tab moved; the static gate allows exactly one echo compare per write arm"
  - "An applied shield change closes the panel and reloads the tab, as upstream's popup does (browser-siteProtections.js:2754-2757); the next open reads the count from the reloaded page"
  - "The shield exception is written on entry.browser only (ContentBlockingAllowList add/remove, browser-scoped; the second-site isolation is live-checked)"
  - "The token-cookie exemption name is the boundary's TOKEN_COOKIE_NAME literal, cross-checked at check time against the token gate's POWERBROWSER_TOKEN_COOKIE_NAME"

# Coverage: the plan's must-haves as shipped
coverage:
  - id: D1
    description: "Clear cookies and site data removes the current site's data and the IDE stays signed in, including after clearing on a localhost tab"
    requirement: "SITE-07"
    verification:
      - kind: e2e
        ref: "node scripts/verify-site-identity-live.mjs --scenario clear-data"
        status: pass
  - id: D2
    description: "The 127.0.0.1 token cookie is exempt from every clear-data kind, proven by a planted-clear live step"
    requirement: "SITE-07"
    verification:
      - kind: e2e
        ref: "node scripts/verify-site-identity-live.mjs --scenario clear-data (token and frame checks); --self-test plant clear-signout"
        status: pass
      - kind: unit
        ref: "node scripts/verify-site-identity.mjs (case 15; plants token-cleared, token-name-drift)"
        status: pass
  - id: D3
    description: "The shield reports blocked-tracker count and turns protection off and back on for this site only"
    requirement: "SITE-08"
    verification:
      - kind: e2e
        ref: "node scripts/verify-site-identity-live.mjs --scenario shield"
        status: pass
      - kind: unit
        ref: "node scripts/verify-site-identity.mjs (case 16; plant shield-leak in the live self-test)"
        status: pass
  - id: D4
    description: "A non-default shield exception shows in the identity box"
    requirement: "SITE-08"
    verification:
      - kind: e2e
        ref: "node scripts/verify-site-identity-live.mjs --scenario shield (icon present when excepted, gone when back on)"
        status: pass

---

# 31-03 Summary — site-data clear, token-cookie exemption, tracking shield

## Accomplishments

- `webTabClearSiteData {tabId, origin}` (`PowerBrowserAPI.sys.mjs`, handler arm
  after `webTabSetPermission`). The origin echo and the content-principal check
  come first. The helper `webTabClearSiteData(browser, principal)` removes each
  host cookie except the token cookie (`webTabTokenCookie`: name equals
  `TOKEN_COOKIE_NAME`, host equals `127.0.0.1`), then runs
  `Services.clearData.deleteDataFromPrincipal(principal, true, flags, resolve)`
  with `CLEAR_COOKIES_AND_SITE_DATA & ~CLEAR_COOKIES`, then re-counts the token
  cookies (a fall refuses with `token-cookie`). The tab-store purge
  (`purgeSiteTabRows`) runs through `PowerBrowserAPI.openTabStore()`.
- `webTabShieldToggle {tabId, origin, except}`: the same echo; `lazy.ContentBlockingAllowList.add(entry.browser)` or `.remove(entry.browser)`; `entry.browser.reload()` (upstream reloads after an exception change); the reply re-reads `ContentBlockingAllowList.includes`.
- The state push carries `shieldExcepted` with `url` (`webTabPush`).
- Site panel (`site-panel.tsx`): the clear-data row, a notice line for a refused or failed clear, the shield count line (clean, one, many, or the protection-off line), and a toggle row when there is a count or an exception.
- Clear-data confirm: `ConfirmDialog` from `@theia/core/lib/browser/dialogs`, title `Clear data for {host}?`, message `You stay signed in to {App}.`, buttons Clear / Cancel. Only the dialog's accept sends the kind.
- Identity box: a warning-ink shield for a site with a non-default exception, tooltip `Tracking protection is off for this site`, refreshed from the shield reply and from the push.
- Copy in `CHROME_BAR_COPY`, pinned in `EXPECTED_NAV_COPY` (`verify-shell-error-copy.mjs`).
- Static gate `verify-site-identity.mjs`: 23 cases (new: 15 clear-path exemption and API ban, 16 shield scope and box refresh; case 14 generalized to one echo compare per write arm) and 28 planted faults (six new).
- Bridge gate: both new kinds classified `privileged`; `clearSiteData` and `shieldToggle` frontend methods checked by call site.
- Live gate `verify-site-identity-live.mjs`: `clear-data` and `shield` scenarios, `clear-signout`, `shield-stale` and `shield-leak` plants, and a per-scenario pref map for the shield session.

## Commits

Plan 31-03 commits, oldest first (`git log --oneline 6d5170c..HEAD`):

- `e6d2794` feat(31-03): site-data clear and shield exception kinds at the boundary
- `dc1420a` feat(31-03): clear cookies and site data row with confirm (SITE-07)
- `916e0cf` feat(31-03): shield count, exception toggle and identity-box shield (SITE-08)
- `bb48f47` test(31-03): static gate for the clear exemption and the shield scope (SITE-07/08)
- `9c097a6` test(31-03): live clear-data and shield scenarios with planted faults (SITE-07/08)

The docs commit that carries this file and the handoff is not counted, as in 31-01 and 31-02.

## Static results

- `node scripts/verify-site-identity.mjs`: PASS (23 cases)
- `node scripts/verify-site-identity.mjs --self-test`: PASS (28 planted faults red; token-cleared, token-name-drift, modal-confirm, clear-cookies-flag, shield-leak, shield-stale among them)
- `node scripts/verify-web-tab-bridge.mjs` + `--self-test`: PASS (16 webTab kinds)
- `node scripts/verify-shell-error-copy.mjs`: PASS
- `node scripts/verify-ng-040-internals-catalogue-lines.mjs`: PASS
- `bash scripts/check-internals-boundary.sh` and `--catalogue`: PASS
- `tsc -b theia/extensions/tab-uris` and `tsc --noEmit -p theia/extensions/chrome-bar`: exit 0
- `node scripts/scan-brand-residue.mjs`: PASS (393 files at the time of the scan; re-run after the docs commit)
- `scripts/verify-platform.sh --quick`: PASS (exit 0, after `9c097a6`)
- `node --check` on every changed `.mjs`, `bash -n scripts/verify-platform.sh`: clean

## Live results

Theia built with `yarn build` (exit 0) after the last Theia source change. Commands and PASS definitions are in `31-03-LIVE-HANDOFF.md`.

- `clear-data: PASS` (run on the final build). Passing steps: the token and the page marker are in the jar before the clear (positive controls); after the clear on 127.0.0.1 the marker is gone, the token is present, and a same-origin frame request returns 200; on localhost the marker is present before, gone after, `SiteDataManager.hasSiteData('localhost')` is `false` after and `true` before.
- `shield: PASS` (run on the final build). Passing steps: the count line reads the blocked count (`1 tracker blocked`) with the toggle `Turn off protection for this site`; off closes the panel, the box shield appears, chrome holds the exception for the tracker page and not for the second site; reopened: `Tracking protection is off for this site` and `Turn protection back on`; on: the exception and the box shield go, the count returns, the second site stays unexcepted.
- `identity-tls: PASS`, `identity-local: PASS` (regression, final build).
- `site-panel: PASS` (regression, final build; after the permission-row selector fix below).
- Live `--self-test`: PASS, see "Self-test" below.

## Self-test

- Clean controls: `identity-local`, `identity-tls`, `site-panel`, `clear-data`, `shield`.
- Plants, each red naming its text: `typed-lock`, `perm-refused`, `icons-stale`, `clear-signout` (`signed out`), `shield-stale` (`shield icon did not update`), `shield-leak` (`wrong site`).
- Result: `verify-site-identity-live --self-test: PASS -- the clean control is green and all 6 planted faults went red: typed-lock, perm-refused, icons-stale, clear-signout, shield-stale, shield-leak` (exit 0, final build, after the commit `9c097a6`).

## Deviations

- **Clear reply `hasData` is re-read, not the literal `false`.** The plan's reply is `{ok, kind, where:'cleared', hasData:false}`. The reply now carries `SiteDataManager.hasSiteData(host)` after the clear. On 127.0.0.1 that stays `true` by design: `hasCookiesForSite` counts the exempt token as site data (`SiteDataManager.sys.mjs:330-338`). Live, `localhost` reads `false`. Nothing reads `hasData` on screen.
- **No empty-state row after a clear.** The plan's "success refreshes hasData and shows the empty-state row" is not built: the UI-SPEC defines no copy for it, and the clear row is always shown (UI-SPEC lists it unconditionally). Recorded as a copy decision for review.
- **The shield icon shows only for a non-default exception.** UI-SPEC makes the shield optional and the must-have says the exception shows. No muted always-on shield for a protected site is rendered.
- **The shield toggle row shows when there is a count or an exception.** UI-SPEC lists the toggle under the blocked row only. An excepted site with zero blocked trackers needs the toggle to turn protection back on, so the row also shows for an exception.
- **An applied shield change closes the panel.** Upstream hides its popup and reloads the tab (`browser-siteProtections.js:2754-2757`; the trust panel reloads at `browser-trustPanel.js:853-857`). The count after the reload is read on the next open, so the panel cannot show a stale count.
- **Refused or failed clears and shield changes.** A refused or failed clear reopens the panel with a one-line notice (`clearDataFailed`, pinned copy). A refused shield change takes the panel to the unavailable copy, as a refused permission write does (31-02).
- **Closed-row and thumbnail purge (`purgeSiteTabRows`).** Thumbnails of every tab row whose url host matches are cleared; closed rows for that host are deleted unless they belong to a group. The plan does not say which of these the purge should do to closed rows; this is a product call for review.
- **`getCookiesFromHost` uses the overlay's `originAttributes`** (not `{}`), so the read and the removal cover the partition the tab is in. For ordinary tabs this is the default attributes. Partitioned (CHIPS) cookies in other partitions are not cleared; only the host and the overlay's own attributes are.
- **Live `clear-signout` plant removes the token before the clear.** A runtime plant cannot remove the in-module exemption branch. The static `token-cleared` plant covers the branch; the live plant produces the outcome a missing exemption would produce, and the signed-in checks must name it.
- **Live `shield-stale` plant is render-level.** The plant stops the box shield from being rendered. A plant on the reply's refresh alone would race the reload's state push (which carries `shieldExcepted`) and be masked, so it could not go red reliably.
- **Live `shield-leak` plant writes the second site's exception after the toggle.** The echo check makes a real misdirected write refuse, so the plant emulates the leak at the chrome layer and the isolation check must catch it.
- **Tracker fixture.** `trackertest.org` is blocked by the classifier data this build ships (observed in the probe profile as `STATE_BLOCKED_TRACKING_CONTENT` in the content-blocking log). The test-only `UrlClassifierTestUtils` in `objdir/_tests` is not used: a product build refuses its `file:` import. The scenario fails `BROKEN` if the count is not at least 1, so a missing block cannot pass.
- **Marker cookies are set by the page, not by chrome.** A chrome-side `Services.cookies.add` returned `eOK` in the probe shell but the cookie never appeared in the jar (not diagnosed). The `/seed` page sets its marker with `document.cookie`, which is also closer to real site data.
- **Live gate fix found by the self-test.** The panel row read counted the new clear-data button as a permission row (7 rows, not 6). The read is now scoped to `[data-permission]` rows; the `site-panel` regression was re-run and passes.
- **Gate changes.** Case 14 (sender origin) now allows exactly one echo compare per privileged write arm (permission, clear, shield) and no other sender-origin use. The plan's wording was one compare for the permission arm only.
- **Token gate cross-check.** Case 15 compares the boundary's `TOKEN_COOKIE_NAME` with `POWERBROWSER_TOKEN_COOKIE_NAME` in `theia/extensions/token-gate`, not with the derivation in `verify-token-cookie-strip.mjs`; `verify-token-cookie-strip` still runs as its own row.
- **Registry.** `verify-platform.sh` gains no new row: the new static cases and plants run in the existing `site-identity` and `site-identity-self-test` rows, and the scenarios in `site-identity-live`. Only the row comment changed.
- **Commit trailer.** `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`, per the instruction in force for this run (the plan's standing rule names another model).
- **No STATE.md or ROADMAP.md edit.** The orchestrator owns those; this run did not touch them to avoid colliding with the concurrent session.

## Blockers

None open.

## Not done

- Pixel review of the count line, the shield icon's warning ink and the panel's geometry against UI-SPEC (manual).
- Keyboard flow of the ConfirmDialog (Enter, Esc, Tab order) and the shield toggle; the live gate checks clicks, not keys (manual).
- Subdomain site data: `getCookiesFromHost` and `hasSiteData` cover the exact host, so cookies scoped to a parent or sibling domain survive a clear (the CONTEXT scope note; accepted by design).
- Partitioned or CHIPS cookies outside the overlay's own partition are not cleared.
- The plan's `hasData:false` literal and the empty-state row (see Deviations).

## Deferred human verification

- Visual check of the clear-data row, the confirm, the count line and the shield icon against UI-SPEC (pixels, KDE Wayland).
- Keyboard-only use of the confirm dialog and the shield toggle.

## Handoff

`.planning/phases/31-site-identity-permissions-and-app-menu/31-03-LIVE-HANDOFF.md`
