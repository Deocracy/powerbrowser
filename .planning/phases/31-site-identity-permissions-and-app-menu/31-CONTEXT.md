# Phase 31: Site Identity, Permissions and App Menu - Context

**Gathered:** 2026-10-22
**Status:** Ready for UI spec / research / planning
**Mode:** `--auto` (Chris's standing autonomous rule: every gray area takes the recommended option, recorded with a one-line reason; marked `[auto]`)

<domain>
## Phase Boundary

The identity box reports the page's real connection and permissions, and a Firefox-ordered app menu opens in every PowerBrowser mode (ROADMAP.md Phase 31; requirements SITE-01..SITE-08, MENU-01, MENU-02, MENU-04).

In scope: `securityState` enum pushed chrome-side with `url` and reset on location change; `NOTIFY_SECURITY|NOTIFY_CONTENT_BLOCKING` on the existing overlay listener; display host via `nsIIDNService.convertToDisplayIDN` / base domain via `SiteDataManager.getBaseDomainFromHost`; site panel (connection, certificate, per-site permissions with upstream Firefox IDs, clear site data with token-cookie exemption via per-cookie removal + cookie-excluding `deleteDataFromPrincipal`, tracking shield + per-site ETP exception); `openStockPage {page}` enum (`settings|passwords|addons|processes|support`) via `addTrustedTab` / stock-window entry points; hamburger `MenuPath` via `ContextMenuRenderer` in Coding/Browsing/Organising; chrome-reserved Ctrl+Q `<key>` + menu Quit via store kind `quitRequest` → existing `quitApplication()`; identity-box permission icons; pill lock derived from push (never typed text).

Not in scope: MENU-03 page-tool/bookmark entries (Phase 33 hosts them; Phase 32 owns PAGE-*); Downloads/Find/Zoom/Print/Save (Phase 32); permission prompts/dialogs (Phase 35-37); extension tab host (Phase 31.1, separate); tab-strip favicons beyond pill/tab (Phase 32 PAGE-04).
</domain>

<decisions>
## Implementation Decisions

### Recorded rulings that apply (REQUIREMENTS.md header, ROADMAP Phase 31, research picks)
- Firefox keys that clash with Theia take the browser meaning only while a web page has focus (KEY ruling 2026-10-20); Ctrl+Q is reserved chrome-side (Pitfall 4 exception list: Ctrl+T/W/N/Q/Tab) and therefore takes the browser meaning (quit) even with Theia focused — documented in the menu and keybinding table.
- Chrome-bar copy reads the configured application name via `appSubject()`, never a hard-coded brand; no internal identifier (mode id, pref key, port, sec-state enum, principal) in user-facing text (BAR-14 carries forward; 01-UI-SPEC copy rule).
- Hard rule 1: no Theia core edit; `@theia/*` from npm only. Hard rule 2: Firefox internals only in `powerbrowser/shell/PowerBrowserAPI.sys.mjs`; new chrome code in the end-of-file section; catalogue every touched internal in `powerbrowser/INTERNAL-APIS.md`.
- Privileged `webTab*` / store kinds run only from widget event handlers, never as a command id or key-relay row (Phases 27/30 privileged-kind rule, research D7).
- `127.0.0.1` token cookie is exempt from every clear-data kind (REQUIREMENTS header ruling; research probe 13).

### Autonomous decisions `[auto]` (recommended option + one-line reason)
- **D-31-01: `securityState` enum `secure|insecure|mixed-passive|broken|local|none`, computed chrome-side from `overlay.securityUI.state` in the same push as `url`, reset on every location change.** Reason: one atomic push keeps pill and URL consistent and kills the typed-text spoof by construction (SITE-01 note). [auto]
- **D-31-02: widen the existing overlay listener mask with `NOTIFY_SECURITY (0x40)` + `NOTIFY_CONTENT_BLOCKING (0x200)`; implement `onSecurityChange` + `onContentBlockingEvent` to call `scheduleWebTabState`.** Reason: reuses the Phase 27 push path instead of a second channel (STACK.md:54-63). [auto]
- **D-31-03: display host via `nsIIDNService.convertToDisplayIDN`, base domain via `SiteDataManager.getBaseDomainFromHost`; both ride the wider state push as `displaySpec`/`baseDomain` fields.** Reason: matches `getEffectiveHost` at `browser-siteIdentity.js:746-759` + call site `SiteDataManager.getBaseDomainFromHost` at `:473` without copying its DOM. [auto]
- **D-31-04: decode with the upstream flag recipe (`STATE_IS_SECURE/BROKEN/INSECURE`, `STATE_IDENTITY_EV_TOPLEVEL`, `STATE_LOADED_MIXED_*`); push the enum, never the bitfield; cert chain (`secInfo.serverCert`) rendered Theia-side.** Reason: keeps the scheme wall unchanged and the wire small (STACK.md:58). [auto]
- **D-31-05: site reads/writes keyed by the overlay's own principal (`browser.contentPrincipal`), never a sender-supplied origin.** Reason: a frame can then only affect its own site (ARCHITECTURE.md §3). [auto]
- **D-31-06: permissions via `SitePermissions.getAllForBrowser/setForPrincipal/removeFromPrincipal`; site data via per-cookie removal + `clearData.deleteDataFromPrincipal` with cookie-excluding flags / `hasSiteData` (D-31-12; never `SiteDataManager.remove` or `promptSiteDataRemoval`, confirm in Theia); ETP exception via `ContentBlockingAllowList.add/remove/includes`; shield count via `overlay.getContentBlockingLog()`.** Reason: all are browser-scoped so they work on an overlay (STACK.md:60-62). [auto]
- **D-31-07: `openStockPage {page}` enum (`settings|passwords|addons|processes|support`) executed chrome-side through the stock window's own entry points (`openPreferences`, `BrowserAddonUI.openAddonsMgr`) or `gBrowser.addTrustedTab`; never a URL; unknown page refused.** Reason: `openStockTab` loads with a null principal so `about:preferences` cannot load that way (SUMMARY.md:142, STACK.md:106). [auto]
- **D-31-08: hamburger is a `MenuPath` rendered per-request by `ContextMenuRenderer` (pattern at `layout-controls-widget.tsx:81-89`), in Firefox's order, filtered to what exists in this milestone (Settings/Passwords/Add-ons/Quit + already-landed navigation); MENU-03 rows arrive with Phase 32/33 and reuse the same menu.** Reason: no static registration, no stale rows, MENU-03 stays out of scope. [auto]
- **D-31-09: the pill lock is replaced: pushed `securityState` selects lock / "Not Secure" / warning / hidden; typed text never feeds it; editor (non-web) tabs show no indicator.** Reason: SITE-01 success criterion 1 by construction. [auto]
- **D-31-10: trimming rule — `https://` trimmed only on `secure`; `http://` never trimmed; punycode shown when `convertToDisplayIDN` differs from ASCII host; registrable domain highlighted.** Reason: matches Firefox identity-box behavior (SITE-03). [auto]
- **D-31-11: new actor/store kinds (`webTabSiteInfo`, `webTabSetPermission`, `webTabClearSiteData`, `webTabShieldToggle`, `openStockPage`, `quitRequest`) join `WEB_TAB_ACTION_KINDS` / `STORE_REQUEST_KINDS` with set-equality coverage in `verify-web-tab-bridge.mjs` (`quitRequest` classified `lifecycle`, a new deliberate class; `openStockPage` classified `store-write`; webTab* classified per the privileged-kind rule) + a new `verify-site-identity.mjs` static gate.** Reason: CLAUDE.md rule 2 — derive-from-tree-and-compare with `--self-test` plants. [auto] Chrome-side permission-id array lives in `PowerBrowserAPI.sys.mjs`; chrome never imports the Theia TS `PERMISSION_IDS` table — the static gate compares the two by set equality (resolves B3). [auto] Permission IDs use the upstream Firefox IDs (`camera`, `microphone`, `geo`, `desktop-notification`, `autoplay-media`, `popup` at `SitePermissions.sys.mjs:935/954/1014/930/863/971`); Theia renders display labels through a `PERMISSION_DISPLAY` table keyed by those IDs (copy in `CHROME_BAR_COPY`), never renamed IDs. Reason: the plans used invented IDs that do not match `gPermissions`, so `setForPrincipal` would throw on an unknown type (B-B). [auto] `autoplay-media` tri-state maps `allow→ALLOW`, `block-audible→BLOCK`, `block-all→AUTOPLAY_BLOCKED_ALL`, `default→removeFromPrincipal` (`SitePermissions.sys.mjs:863-910` states array `:888-892`); Theia control cycles Allow → Block sounds → Block all → Default. [auto]
- **D-31-12: clear-data enumerates host cookies via `Services.cookies.getCookiesFromHost(host, {})` (`nsICookieManager.idl:290`) and removes each with `Services.cookies.remove(host, name, path, originAttributes)` (`nsICookieManager.idl:81`) except the `127.0.0.1` token cookie by name+host (`TOKEN_COOKIE_NAME` in `PowerBrowserAPI.sys.mjs:4606`, referenced — never a duplicated literal), then clears the remaining site storage via `Services.clearData.deleteDataFromPrincipal(principal, true, COOKIE_EXCLUDING_FLAGS)` where the flags are `CLEAR_COOKIES_AND_SITE_DATA & ~CLEAR_COOKIES` composed from `nsIClearDataService.idl:424` and `:208` (or an explicit non-cookie flag list: `CLEAR_DOM_STORAGES|CLEAR_HSTS|CLEAR_EME|CLEAR_AUTH_TOKENS|…` per `:420-431`); never `SiteDataManager.remove` (it calls `deleteDataFromSite` with `CLEAR_COOKIES_AND_SITE_DATA|CLEAR_ALL_CACHES` at `SiteDataManager.sys.mjs:547-552`, deleting every cookie including the token after the per-cookie loop); never `Sanitizer.sanitize` for host scope; a planted-clear live step proves the token survives.** Reason: time-range sanitization is not host-scoped and the old `SiteDataManager.remove` sequence deleted the token after exempting it per-cookie, so only per-cookie removal plus a cookie-excluding storage clear keeps the session (resolves B-A). [auto] Scope note: `getCookiesFromHost` and `deleteDataFromPrincipal` both cover the exact host/origin only, so subdomain data survives a clear; this is consistent between the two calls and safe for the token (plan-check round 3 advisory).
- **D-31-13: Quit = existing `PowerBrowserAPI.quitApplication()` (`PowerBrowserAPI.sys.mjs:701-713`: quit-requested → flush → attempt-quit) from the menu row and Ctrl+Q; no new quit path. The menu sends a new store kind `quitRequest {page}` (class `lifecycle`) whose chrome arm is one line calling `quitApplication()` — the Theia menu row cannot call chrome directly, and a Theia-side quit implementation is forbidden, so the kind is the route (resolves B-C). Chrome Ctrl+Q: reserved chrome `<key>` row in `powerbrowser.js` (Pitfall-4 exception class, Firefox's own `key_quitApplication` at `browser-sets.inc.xhtml:352-366` → `cmd_quitApplication` → `goQuitApplication` at `browser-sets.js:103-105`); no Theia keybinding for Ctrl+Q (chrome-reserved row is the single implementation, so Theia/Monaco can never swallow it). Theia `ChromeStoreClient.quitRequest()` method required by rule 12 for the new store class. `verify-shortcut-relay.mjs` gains the Ctrl+Q reserved-row derivation + plant, not a Theia-side row.** Reason: STACK.md:108 — no new internals; Theia code with no route to chrome's quit is a dead row (B-C). [auto]
- **D-31-14: site panel + hamburger are `.pb-chrome-bar-dropdown`-class portals (layer rule (a)); permission icons are codicons in the identity box; certificate is read-only text (issuer/subject/validity), never a file path.** Reason: reuses the 29/30 occlusion contract; no new `BLOCKING_LAYER_SELECTOR` entry. [auto]

### Claude's Discretion
All other implementation choices (exact portal anchoring, icon glyph picks among installed codicons, static-gate file layout, live scenario splits) are at the planner/executor's discretion within the UI-SPEC and RESEARCH contracts.
</decisions>

<specifics>
## Specific Ideas

- Firefox parity reference is `browser-siteIdentity.js:77-127` decode + `identity-block` visuals (lock / crossed lock / warning triangle / shield), but rendered with Theia codicons and `--theia-*` theming, not XUL CSS.
- Chris asked for no mockup tooling beyond the existing `30-MOCKUPS.html` pattern; Phase 31 UI-SPEC carries static ASCII mockups only (no new HTML mockup file).
- The `?` help-row pattern from Phase 30 (rows derived from registry, never hand-kept) is the model for the hamburger order derivation.
</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/ROADMAP.md:309-324` — Phase 31 goal/depends/requirements/notes/success criteria 1-5
- `.planning/REQUIREMENTS.md:73-89,231-242` — SITE-01..08 + MENU-01/02/04 text + phase map + header rulings (search allowed, Places write via API, token cookie exempt, copy uses configured app name)
- `.planning/PROJECT.md` — platform streams, brand rule, Key Decisions table

### Research corpus
- `.planning/research/SUMMARY.md:27,83,142,294-306` — openStockPage enum ruling, hamburger/Quit scope, Phase 4 delivers/avoids
- `.planning/research/STACK.md:54-63,106-108,116-117` — security state, ContentBlockingAllowList, SitePermissions, SiteDataManager, eTLD/IDN, openStockPage entry points, quitApplication, MenuPath/ContextMenuRenderer
- `.planning/research/ARCHITECTURE.md:148-158` — §3 site identity + app menu contract (push shape, principal keying)
- `.planning/research/FEATURES.md:220-223,274-289` — identity/menu rows, dependency fan-in
- `.planning/research/PITFALLS.md` — Pitfalls 4 (reserved keys incl. Ctrl+Q), 5/6/7 (prompts/panel layer), 8 (overlay z-order/layer policy)
- `.planning/research/chrome-bar-firefox-gap.md:79-102,152-168` — SITE/MENU gap rows

### Prior-phase contracts this phase builds on
- `.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-CONTEXT.md`, `27-RESEARCH.md`, `27-PATTERNS.md`, `27-SECURITY.md`, `27-01-PLAN.md`, `27-08-SUMMARY.md` — push router, PAGE_KEYS/reserved-key rule, webTab* kinds, layer policy; open risk T-27-11 (stand-in derivation gap → Phase 35)
- `.planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md` — extension route binds 31.1+38; while IDE focused last web tab stays active; `getTabForBrowser` null ruling reversed (tab host)
- `.planning/phases/29-address-bar-search-and-fixup/29-CONTEXT.md`, `29-VALIDATION.md`, `29-SECURITY.md`, `29-10-SUMMARY.md`, `deferred-items.md` — `resolveTypedAddress`, Places write, token strip, privileged/network kind rule 12, GUI-02 remoteness flake
- `.planning/phases/30-address-bar-modes-and-command-centre/30-CONTEXT.md`, `30-RESEARCH.md`, `30-VALIDATION.md`, `30-PATTERNS.md`, `30-UI-SPEC.md`, `30-02-PLAN.md`, `30-04-SUMMARY.md`, `deferred-items.md` — pill in `address-bar/`, DEFAULT_MODE_BY_UI_MODE, QuickAccessRegistry, D-04 move constraints, canGoBack-after-round-trip deferred item
- `.planning/phases/31.1-extension-tab-host/31.1-CONTEXT.md` — tab-host direction (do not collide: no windowtype change, no getTabForBrowser fork)

### Code anchors
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` — `webTabOpen` overlay + listener mask (`:3346` with `onLocationChange` `:3314` + `onStateChange` `:3329`, no security/content-blocking methods; persist `writePersistedDocument` listener is separate at `:4007-4023`), `handleGroupMutation`/`handleStoreRequest`/`webTabPush` (`:3388-3404`), `openStockTab` wall (`:1100-1130`), `quitApplication` (`:701`), `savePageCopy` minted-dir pattern (`:4037-4088`), web-tab action section (`:4110+`)
- `powerbrowser/shell/powerbrowser.js` — PAGE_KEYS, relay, `gBrowser` stand-in, quit wiring
- `powerbrowser/INTERNAL-APIS.md:23-46` — append-only catalogue rule, privileged-kind rule
- `theia/extensions/tab-uris/src/browser/web-tab.ts:159-184,232-256` + `chrome-store-client.ts:107-230` (single-flight request with timeout reply) + `tab-store-access-protocol.ts:58-65` (relay hub; nothing crosses except `TAB_STORE_RELAY_KINDS`) — state/push union, store kinds
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` (Back/Forward/Reload/Home/New Tab render, history MenuPath `:40-43,368-374`, Mode toggle), `address-bar/address-bar.tsx` (pill; typed-text lock at `:2137` + lock span `:2160` to be replaced), `address-bar/address-bar-rows.ts`, `chrome-bar-copy.ts`, `chrome-bar-shortcuts.ts`, `chrome-bar-keybindings.ts`, `chrome-bar-preferences.ts`, `chrome-bar-frontend-module.ts`, `layout-controls-widget.tsx:81-89` (MenuPath pattern)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Push path: `sendWebTabPush` + `scheduleWebTabState` + `WebTabChannel.onPush('state')` router — widen the pushed object, do not add a channel.
- History menu: `CompoundMenuNode` built per request + `menus.render({menuPath, menu})` — the exact pattern for the site panel's permission rows and the hamburger.
- `savePageCopy` minted-dir guard + `storeUrlArg` validators — copy the validation shape for `openStockPage` enum + host args.
- `verify-address-bar-modes.mjs` (Node type-stripping import of a pure table + derived comparison + plants) — template for `verify-site-identity.mjs`.
- `verify-web-tab-bridge.mjs` KIND_CLASSES set-equality — extend with the new kinds, do not fork.
- `ChromeStoreClient.request` recorder + `scripts/lib/pb-live-probe.mjs` harness — live-proof pattern for shield/panel/clear flows.

### Established Patterns
- Overlay layer policy (a)-(d) from 27/29/30 UI-SPECs: chrome-anchored layers are `.pb-chrome-bar-dropdown` portals that hide the page; no new `BLOCKING_LAYER_SELECTOR` entry.
- Static contribution binding at module load (D-50); privileged kinds only from widget event handlers.
- Copy gate: every user string in `CHROME_BAR_COPY`; `verify-shell-error-copy.mjs` pinned expectations move in the same commit.
- One driver `scripts/verify-platform.sh` (`--quick`, `--only`, `--gate`); every new check appends one registry row, derives-from-tree-and-compares, ships `--self-test` plants that go red naming the drift.

### Integration Points
- `chrome-bar-frontend-module.ts` binds new site/hamburger contributions; `AddressBar` renders the identity box from pushed state; `ChromeBarWidget` hosts the hamburger button.
- `PowerBrowserAPI.sys.mjs` end-of-file section grows: mask + two listener methods + push fields + 4-5 kinds + `openStockPage`; `INTERNAL-APIS.md` rows appended.
- `scripts/verify-platform.sh` gains `site-identity` + `site-identity-self-test` rows (added by the plans, not by this CONTEXT).
</code_context>

<deferred>
## Deferred Ideas

- MENU-03 full page-tool/bookmark menu section — Phase 33 (hamburger reserves ordered slots, plans do not build them).
- PAGE-*/BMK-* entries reachable from the menu — Phases 32/33 own the features; menu only links them once they exist.
- Certificate viewer beyond issuer/subject/validity text; full `about:certificate` surface — later milestone.
- Per-site ETP exception UI beyond AllowList add/remove for the current site — later milestone.
- `openStockPage` pages beyond the five-enum (`processes`, `support` included here; anything else is a new enum value with its own plan).
- Passwords manager write flows — Phase 31 opens Passwords; vault edits live where the stock page owns them.
</deferred>

---

## Appendix (planning-run contract — satisfies the "every file" rule)

### must_haves (CONTEXT-level; refined per plan)
- truths:
  - "Every SITE-01..08 + MENU-01/02/04 requirement and every D-31-01..D-31-14 decision has an implementing plan task"
  - "Permission IDs are the upstream Firefox IDs; autoplay-media handles block-audible"
  - "Clear-data never deletes the token cookie (per-cookie removal + cookie-excluding storage clear)"
  - "Quit reaches chrome via the quitRequest store kind; Ctrl+Q is chrome-reserved with no Theia keybinding"
  - "No MENU-03/PAGE/BMK feature work is planned in Phase 31"
- prohibitions:
  - statement: "MUST NOT plan code outside `.planning/phases/31-site-identity-permissions-and-app-menu/` in this run"
    status: resolved
    verification: judgment
- artifacts:
  - path: ".planning/phases/31-site-identity-permissions-and-app-menu/31-CONTEXT.md"
    provides: "locked decisions D-31-01..D-31-14 with reasons"
    contains: "D-31-01"

### threat_model (planning artifact)
| ID | Category | Threat | Severity | Disposition |
|----|----------|--------|----------|-------------|
| T-31-C01 | Spoofing | Typed text or stale push spoofs the lock | medium | mitigate — push carries state atomically with url; reset on location change (D-31-01); plans verify |
| T-31-C02 | Information disclosure | Planning leaks an internal identifier into copy | low | mitigate — copy-gate rule carried into UI-SPEC + plans |

### verify + fails_when (this file)
- `<automated>` `grep -c "D-31-" .planning/phases/31-site-identity-permissions-and-app-menu/31-CONTEXT.md` — expect `>=14`
  <fails_when>non-zero exit; count < 14; any `TODO`/`TBD` line</fails_when>

*Phase: 31-site-identity-permissions-and-app-menu*
*Context gathered: 2026-10-22*
