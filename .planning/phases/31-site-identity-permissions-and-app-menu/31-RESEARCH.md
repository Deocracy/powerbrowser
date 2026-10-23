# Phase 31: Site Identity, Permissions and App Menu - Research

**Researched:** 2026-10-22
**Domain:** Gecko security UI / site permissions / Theia menus
**Confidence:** HIGH (all Gecko surfaces read in-repo or pinned in STACK.md; Theia surfaces read in installed `@theia/core@1.76.0`)

<user_constraints>
## User Constraints (from 31-CONTEXT.md)

### Locked Decisions
- D-31-01: `securityState` enum pushed atomically with `url`, reset on location change.
- D-31-02: widen overlay listener with `NOTIFY_SECURITY|NOTIFY_CONTENT_BLOCKING`; implement `onSecurityChange` + `onContentBlockingEvent`.
- D-31-03: display host via `nsIIDNService.convertToDisplayIDN` (browser-siteIdentity.js:746-759), base domain via `SiteDataManager.getBaseDomainFromHost` (SiteDataManager.sys.mjs:79-82, call site browser-siteIdentity.js:473).
- D-31-04: upstream flag-recipe decode; push enum never bitfield; cert rendered Theia-side.
- D-31-05: reads/writes keyed by overlay's own `contentPrincipal`.
- D-31-06: `SitePermissions` + per-cookie removal + cookie-excluding `deleteDataFromPrincipal` (no modal confirm) + `ContentBlockingAllowList` + `getContentBlockingLog()`.
- D-31-07: `openStockPage {page}` enum via stock-window entry points / `addTrustedTab`, never a URL.
- D-31-08: hamburger as per-request `MenuPath` via `ContextMenuRenderer`, Firefox order, filtered to landed features.
- D-31-09/D-31-10: pill lock from push; trim/punycode/highlight rules.
- D-31-11: new kinds join kind sets with set-equality gates + `verify-site-identity.mjs`.
- D-31-12: clear-data removes host cookies one by one via `getCookiesFromHost` + `remove` with the `127.0.0.1` token-cookie exemption (never `SiteDataManager.remove` — it re-deletes every cookie via `deleteDataFromSite` at `SiteDataManager.sys.mjs:547-552`; never `Sanitizer.sanitize` for host scope) + cookie-excluding `deleteDataFromPrincipal` + planted-clear check.
- D-31-13: Quit = existing `quitApplication()` from menu + Ctrl+Q.
- D-31-14: portals + codicons; cert read-only text.

### Claude's Discretion
- Portal anchoring, glyph picks among installed codicons, static-gate layout, live scenario splits.

### Deferred Ideas (OUT OF SCOPE)
- MENU-03 full section, PAGE-*/BMK-* features, rich cert viewer, ETP UI beyond allow-list, extra `openStockPage` values, vault writes.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| securityState decode + push | Gecko chrome (PowerBrowserAPI boundary) | — | Only chrome sees `securityUI`; Theia renders the enum |
| display host / base domain | Gecko chrome | — | `nsIIDNService.convertToDisplayIDN` + `SiteDataManager.getBaseDomainFromHost` are chrome-only |
| permissions / site data / ETP | Gecko chrome | Theia panel (render + events) | `SitePermissions`/`SiteDataManager`/`AllowList` are browser-scoped |
| openStockPage | Gecko chrome (stock window) | Theia menu (event) | `about:preferences` needs a trusted load path |
| hamburger menu | Theia (MenuPath/ContextMenuRenderer) | — | Static menus are framework-owned |
| Quit | Gecko chrome (`quitApplication`) | Theia menu + key | Existing path, no new internal |
</architectural_responsibility_map>

<research_summary>
## Summary

- What was researched: the exact Gecko surfaces for connection state, content-blocking events, permissions, site data, ETP exceptions, IDN/eTLD, stock-page entry points, and Theia's menu/context-menu APIs at the pinned 1.76.0.
- Standard approach: widen the existing `addProgressListener` mask at `PowerBrowserAPI.sys.mjs:3346` (overlay listener has NO security/content-blocking methods — the `onSecurityChange(){}/onContentBlockingEvent(){}` at `:4021-4022` belong to the `writePersistedDocument` persist listener at `:4007-4023` and must not be confused with the overlay listener), add the two methods calling `scheduleWebTabState`, decode with the `browser-siteIdentity.js` flag recipe, push a small enum with the URL, and build the panel/menu Theia-side from per-request replies.
- Key recommendations: (1) never push the bitfield; (2) never load `about:preferences` through `webTabOpen`/`openStockTab` — use the stock window's entry points or `addTrustedTab`; (3) skip `SiteDataManager.promptSiteDataRemoval` and confirm in Theia; (4) derive hamburger order from a checked-in Firefox-order table + landed-feature filter, compared as set equality.

**Primary recommendation:** implement D-31-01..D-31-14 exactly as decided; every new check derives expectations from the tree and compares, with `--self-test` plants.
</research_summary>

<standard_stack>
## Standard Stack

### Core (in-repo/upstream, no installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `nsISecureBrowserUI.state` + `nsIWebProgressListener` flags | ESR 153 (`FIREFOX_153_5_0esr_BUILD1`) | connection decode | Same source `browser-siteIdentity.js:77-127` reads |
| `nsIIDNService.convertToDisplayIDN` | ESR 153 (`FIREFOX_153_5_0esr_BUILD1`) | safe display host | Upstream IDN path (browser-siteIdentity.js:746-759) |
| `SiteDataManager.getBaseDomainFromHost` | ESR 153 | registrable domain | Upstream highlight path (browser-siteIdentity.js:473 call site) |
| `SitePermissions.sys.mjs` (`getAllForBrowser :237-264`/`setForPrincipal :543-570`/`removeFromPrincipal :631-644`/`getPermissionLabel :699`/`listPermissions :326-331`) | ESR 153 | per-site permissions | Browser-scoped; works on overlay. Upstream permission IDs in this panel: `camera` (`:935`), `microphone` (`:954`), `geo` (`:1014`), `desktop-notification` (`:930`), `autoplay-media` (`:863`, states ALLOW/BLOCK/AUTOPLAY_BLOCKED_ALL `:888-892`), `popup` (`:971`). Plans use these IDs with a `PERMISSION_DISPLAY` label table, never renamed IDs |
| `Services.cookies.getCookiesFromHost` (`nsICookieManager.idl:290`) / `remove` (`:81`) + `Services.clearData.deleteDataFromPrincipal` (`nsIClearDataService.idl:109-112`) with cookie-excluding flags (`CLEAR_COOKIES_AND_SITE_DATA :424` minus `CLEAR_COOKIES :208`) | ESR 153 | clear site data with token exemption | Per-cookie loop (`Discovery.sys.mjs:95` / `SiteDataManager.sys.mjs:503-512` precedent) skips the token; `deleteDataFromPrincipal` (cf. `Sanitizer.sys.mjs:1273-1280` precedent) clears storage without cookies. Never `SiteDataManager.remove` (`:528-568` → `deleteDataFromSite` with `CLEAR_COOKIES_AND_SITE_DATA|CLEAR_ALL_CACHES` at `:547-552`, re-deletes every cookie) |
| `ContentBlockingAllowList.sys.mjs` (`canHandle/add/remove/includes`, toolkit — not browser/) | ESR 153 | per-site ETP exception | No browser-window dependency |
| `overlay.getContentBlockingLog()` | ESR 153 | shield counts | Same log the shield panel reads |
| `@theia/core@1.76.0` `ContextMenuRenderer`, `MenuPath`, `CompoundMenuNode`, `ConfirmDialog` | 1.76.0 | hamburger + panel + confirm | Installed; pattern at `layout-controls-widget.tsx:81-89` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `addTrustedTab` for stock pages | `openPreferences()` on stock window | Prefer entry points where they exist; `addTrustedTab` (tabbrowser.js:3255) is the fallback — both beat `openStockTab` (null principal) |
| per-request menu build | static `MenuModelRegistry` registration | Static registration leaks MENU-03 rows before they exist; per-request keeps the filter honest |
| Theia confirm | `promptSiteDataRemoval` | Latter wants `parentWindow.gDialogBox` the shell lacks (STACK.md:62) |

**Installation:** none — no new package, no new dependency (hard rule 1).
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
overlay <browser> (securityUI.state, contentPrincipal)
  │ onSecurityChange / onContentBlockingEvent / onLocationChange
  ▼
PowerBrowserAPI widen-state (D-31-01..04) ──atomic──▶ WebTabMessage.state {url,title,loading,canGoBack,canGoForward,
                                                        securityState,displaySpec,baseDomain,blockedTrackers,
                                                        permissionIcons[]}
  │                                                          │
  │ webTabSiteInfo {tabId}                                   │ AddressBar identity box (D-31-09/10)
  ▼                                                          ▼
{securityState,issuer,permissions[],hasData,│          site panel (D-31-14)
  shield{count,excepted}}                    │          hamburger MenuPath (D-31-08)
  │ webTabSetPermission / ClearSiteData /    │
  │ ShieldToggle (D-31-05/06/12)             │ openStockPage {page} (D-31-07)
  ▼                                          ▼
SitePermissions/SiteDataManager/AllowList    stock window entry points / addTrustedTab
```

### Recommended Project Structure
```
theia/extensions/chrome-bar/src/browser/
  site-identity/
    site-identity-table.ts   # pure: SecurityState, PERMISSION_IDS, STOCK_PAGES, MENU_ORDER (import-free; gate imports it)
    site-panel.tsx           # panel render (portal) — or inside address-bar.tsx per planner
    app-menu.ts              # hamburger order table + filter (pure, gated)
  address-bar/address-bar.tsx# identity box render (lock → pushed state)
powerbrowser/shell/PowerBrowserAPI.sys.mjs  # end-of-file section only: mask, listeners, push fields, kinds
scripts/verify-site-identity.mjs            # static gate + --self-test
scripts/verify-site-identity-live.mjs       # live scenarios + PLANTS
```

### Component Responsibilities
| Component | Responsibility | Entry |
|-----------|----------------|-------|
| widen-state | decode + atomic push | `scheduleWebTabState` call sites |
| site-identity-table | single source of enums/order | imported by gate + UI |
| site-panel | render + event-only kind sends | identity click |
| app-menu | order + filter + render | hamburger click |
| static gate | derive-and-compare | `verify-platform.sh` row |
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

- **Security-state decode:** use the `browser-siteIdentity.js:77-127` flag recipe (`STATE_IS_SECURE/BROKEN/INSECURE`, `STATE_IDENTITY_EV_TOPLEVEL`, `STATE_LOADED_MIXED_*`); do not invent thresholds on the bitfield, and never ship the bitfield over the wire (D-31-04).
- **IDN safety:** use `convertToDisplayIDN` (browser-siteIdentity.js:746-759); do not regex punycode yourself (D-31-03/10).
- **Stock pages:** use entry points / `addTrustedTab`; do not widen `openStockTab`'s allow-list to `about:preferences` (null-principal wall, SUMMARY.md:142).
- **Clear confirm:** use Theia `ConfirmDialog`; do not call `promptSiteDataRemoval` (needs `gDialogBox`).
- **Hamburger order:** derive from the checked-in Firefox-order table filtered by landed features; do not hand-keep a second list in the gate (CLAUDE.md rule 2).
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

1. **Stale lock after navigation** — pushing state without resetting on `onLocationChange` shows the old page's lock on the new URL. Avoid: reset to `none`/recompute in the same push as `url` (D-31-01). Warning sign: live plant `stale-lock` stays green.
2. **Typed-text spoof** — deriving the lock from pill text (`startsWith('https://')`, `address-bar.tsx:2137,2160`) lets page script or paste fake security. Avoid: D-31-09 replaces that line; gate asserts its absence.
3. **Null-principal stock page** — loading `about:preferences` via `webTabOpen`/`openStockTab` silently fails or escalates. Avoid: D-31-07 enum wall; positive live control opens Settings in the stock window.
4. **Token-cookie sign-out** — clearing `127.0.0.1` cookies kills the IDE session. Avoid: D-31-12 exemption + planted-clear live step asserting the session survives.
5. **Principal confusion** — keying writes by sender-supplied origin lets a frame clear another site. Avoid: D-31-05 `contentPrincipal` keying; gate asserts no `data.origin`/`data.host` write path.
6. **Reserved-key swallow (Pitfall 4)** — Ctrl+Q must be chrome-reserved (Firefox's own list) and documented; non-reserved relay would let Theia/Monaco eat it. Avoid: reserved row + keybinding-table gate entry.
7. **Panel-occlusion (Pitfall 8/layer rule)** — a panel covering the page breaks the layer contract. Avoid: D-31-14 portals; live rect assert.
8. **Hand-kept expectations (CLAUDE.md rule 2)** — a gate that copies the enum/order list it checks can never go red. Avoid: derive-from-tree-and-compare + self-test plants.
</common_pitfalls>

<code_examples>
## Code Examples

**Listener widen (boundary, end-of-file section):**
```js
browser.addProgressListener(entry.listener,
  Ci.nsIWebProgress.NOTIFY_LOCATION | Ci.nsIWebProgress.NOTIFY_STATE_NETWORK
  | Ci.nsIWebProgress.NOTIFY_SECURITY | Ci.nsIWebProgress.NOTIFY_CONTENT_BLOCKING);
// onSecurityChange(_p,_r,_s,state){ scheduleWebTabState(theiaBrowser, tabId, browser, false); }
// onContentBlockingEvent(_p,_r,{blocked}={}){ entry.blocked = blocked; scheduleWebTabState(...); }
```

**Decode (recipe, not literal flags):**
```js
// mirror of browser-siteIdentity.js:77-127 — secure only when
// STATE_IS_SECURE && !(BROKEN||INSECURE); EV when IDENTITY_EV_TOPLEVEL;
// mixed-passive when LOADED_MIXED_DISPLAY_CONTENT_LOADED && !..._ACTIVE.
// Push 'secure|insecure|mixed-passive|broken|local|none' with url.
```

**Principal-keyed write (shape):**
```js
const principal = entry.browser.contentPrincipal; // never data.origin
SitePermissions.setForPrincipal(principal, id, state);
```

**Per-request menu (Theia 1.76):**
```ts
const menu: CompoundMenuNode = { id: 'powerbrowser-app-menu', sortString: '0', children, isVisible: () => true, isEmpty: () => false };
this.menus.render({ menuPath: APP_MENU_PATH, menu, anchor, context });
```
</code_examples>

<assumptions>
## Assumes from earlier phases (planned/parallel — code may not exist; refresh at execution)

- Phase 27 widened push exists (`url` atomic with state; `scheduleWebTabState`; `sendWebTabPush`); Phase 30 pill lives in `address-bar/` with `DEFAULT_MODE_BY_UI_MODE` and copy gate. If the tree disagrees at execution, re-point and re-run the named gates.
- Phase 31.1 tab host may add `selectedBrowser`/tab-tracker members; do not fork `getTabForBrowser` or change `windowtype`.
- Open risks carried: T-27-11 stand-in derivation gap (→ Phase 35); Phase 30 deferred `canGoBack:true` after mode round-trip; live-only binary probes deferred (binary in use).
</assumptions>

<validation_architecture>
## Validation Architecture (what the plans must build)

- `scripts/verify-site-identity.mjs` (+ `--self-test`): imports the pure `site-identity-table.ts` under Node type stripping; derives `SecurityState` members from the boundary decode, `PERMISSION_IDS` from upstream `SitePermissions.listPermissions()` / the `gPermissions` keys (`SitePermissions.sys.mjs:326` and `:863-1024`) parsed from `upstream/` at check time compared by set equality (never the call-site-literal union — the write arm passes a validated variable), `STOCK_PAGES` from `openStockPage` switch arms, menu order from the order table filtered by landed-feature flags; compares as set equality; asserts absence of the typed-text lock line, of `openStockTab('about:…')`, of `data.origin` write paths, of hex/font literals; checks codicon glyphs against `dist/codicon.css`; checks `INTERNAL-APIS.md` rows for each new internal; `autoplay-media` multichoice states derived from `:888-892`; plants go red naming drift.
- `scripts/verify-site-identity-live.mjs`: scenarios `identity-lock` (https lock / http Not Secure / mixed warning / typed-text spoof attempt / editor-tab none), `site-panel` (open, cert text, permission tri-state round-trip, icons appear), `clear-data` (planted clear keeps IDE signed in incl. localhost), `shield` (count + exception toggle), `app-menu` (order, Settings/Passwords/Add-ons open stock-side, Ctrl+Q + Quit row quit), each with a `PLANTS` fault that must go red naming its text.
- Registry: `verify-platform.sh` gains `site-identity`, `site-identity-self-test`, `site-identity-live`, `site-identity-live-self-test` rows.
- Manual-only: pixel appearance on KDE Wayland vs 31-UI-SPEC; punycode visual vs Firefox chrome.
</validation_architecture>

<sources>
## Sources

- In-repo: `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (webTabOpen mask `:3346` with onLocationChange `:3314` + onStateChange `:3329` and no security/content-blocking methods; writePersistedDocument persist listener `:4007-4023` with `onSecurityChange(){}/onContentBlockingEvent(){}` at `:4021-4022` that must NOT be confused with the overlay listener; state push `:3388-3404`; `STORE_REQUEST_KINDS:3729-3744`; `:701-713` quitApplication body; action section `:4147+`; openStockTab wall `:1100-1130`; `TOKEN_COOKIE_NAME:4606` `TOKEN_STRIP_TOPIC:4607` `observe:4621+`); `upstream/browser/base/content/browser-siteIdentity.js:77-127` (decode recipe, via STACK.md:58).
- Upstream IDLs: `netwerk/base/nsISecureBrowserUI.idl:13-15`, `uriloader/base/nsIWebProgress.idl:94,97`, `netwerk/dns/nsIIDNService.idl:55` (via STACK.md:54-63).
- Toolkit/browser modules: `ContentBlockingAllowList.sys.mjs:68-110` (canHandle/add/remove/includes), `SitePermissions.sys.mjs:237-264` getAllForBrowser, `:281-288` label details, `:326-331` listPermissions, `:543-570` setForPrincipal, `:631-644` removeFromPrincipal, `:699` getPermissionLabel, table `:863-1076` (panel IDs: `autoplay-media:863`, `desktop-notification:930`, `camera:935`, `microphone:954`, `popup:971`, `geo:1014`; autoplay states `:888-892`), `SiteDataManager.sys.mjs:79-82` getBaseDomainFromHost, `:503-512` cookie-per-cookie removal precedent, `:528-568` remove (forbidden here: `deleteDataFromSite` with `CLEAR_COOKIES_AND_SITE_DATA|CLEAR_ALL_CACHES` at `:547-552` re-deletes the token), `:580-622` window-modal prompt, `Sanitizer.sys.mjs:250-314` time-span ranges (not host-scoped) + `:1273-1280` `deleteDataFromPrincipal` precedent, `nsICookieManager.idl:81` remove + `:290` getCookiesFromHost, `nsIClearDataService.idl:208` CLEAR_COOKIES + `:424` CLEAR_COOKIES_AND_SITE_DATA (storage clear = the latter minus the former), `Discovery.sys.mjs:95-100` per-cookie remove precedent (via STACK.md:60-62,106-108).
- Theia 1.76.0 installed: `context-menu-renderer.d.ts:30-45`, `MenuPath`/`MenuModelRegistry`, `dialogs.d.ts:50,104,137`, `quick-access` registry (via STACK.md:116-117, 30-CONTEXT).
- Quit: `PowerBrowserAPI.quitApplication()` (`PowerBrowserAPI.sys.mjs:701-713`); chrome Ctrl+Q `<key>` in `powerbrowser.js` (PAGE_KEYS `:335-364` has no Ctrl+Q today; new reserved row citing Firefox's `key_quitApplication` at `browser-sets.inc.xhtml:352-366` → `cmd_quitApplication` → `goQuitApplication` at `browser-sets.js:103-105`); menu Quit via new store kind `quitRequest` (class `lifecycle`) + `ChromeStoreClient.quitRequest()`; no Theia Ctrl+Q keybinding (reserved chrome row is the single implementation). Stock pages: `openPreferences` (`utilityOverlay.js:381`), `BrowserAddonUI.openAddonsMgr` (`browser-addons.js:1956`), Passwords via `switchToTabHavingURI` (`QuickActionsLoaderDefault.sys.mjs:35` + `about:logins` trusted path `:185`) or `gBrowser.addTrustedTab` (`browser.js:4873/4937` system-principal tab), never a URL.
- Confidence: HIGH on surfaces above (read this session or pinned with line refs); MEDIUM on which stock entry point the executor picks per page — executor confirms against the pinned `upstream/` tag at build time and the static gate derives them from the tree.
</sources>

---

## Appendix (planning-run contract)

### must_haves
- truths:
  - "Every Gecko surface named above is confirmed against the pinned tag or a cited line before plans use it"
  - "Validation Architecture names the gate, live scenarios, plants, and registry rows the plans must build"
- prohibitions:
  - statement: "MUST NOT recommend a new npm package or a Theia-core edit"
    verification: judgment
- artifacts:
  - path: ".planning/phases/31-site-identity-permissions-and-app-menu/31-RESEARCH.md"
    provides: "Gecko/Theia surfaces, recipes, pitfalls, validation architecture"
    contains: "Validation Architecture"

### threat_model
| ID | Category | Threat | Severity | Disposition |
|----|----------|--------|----------|-------------|
| T-31-R01 | Spoofing | Research blesses a spoofable decode (bitfield/typed-text) | medium | mitigate — D-31-01/04/09 recipe locked above |
| T-31-R02 | Elevation | Research blesses null-principal stock-page load | high | mitigate — D-31-07 enum wall; openStockTab widening forbidden |

### verify + fails_when
- `<automated>` `grep -c "D-31-\|STACK.md\|INTERNAL-APIS" .planning/phases/31-site-identity-permissions-and-app-menu/31-RESEARCH.md` — expect `>=10`
  <fails_when>non-zero exit; count < 10; any `TODO`/`TBD` line</fails_when>

*Phase: 31-site-identity-permissions-and-app-menu*
