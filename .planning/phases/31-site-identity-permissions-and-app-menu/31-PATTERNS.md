# Phase 31 — Pattern Map (PATTERNS.md)

> Read-only codebase analysis: what each new/changed file copies from. Planner copies the excerpts, not the idea.

## File Classification

| File (new/modified) | Role | Data flow | Closest analog |
|---------------------|------|-----------|----------------|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (end-of-file section) | controller (boundary) | event-driven (progress listener → push; actor request → reply) | itself: `webTabOpen` listener block (~3346) + `handleWebTabAction` switch (~4126-4203) + `savePageCopy` validation (~4037-4088) |
| `powerbrowser/shell/powerbrowser.js` (Ctrl+Q row) | controller (chrome) | event-driven (key → quit) | itself: PAGE_KEYS rows + `PowerBrowserWebTabs.relayShortcut` (~335-451) + `quitApplication` call (~484); upstream Firefox's own `key_quitApplication` (`browser-sets.inc.xhtml:352-366` → `cmd_quitApplication` → `goQuitApplication` at `browser-sets.js:103-105`) |
| `theia/.../chrome-bar/site-identity/site-identity-table.ts` (new, pure) | utility | request-response (imported by UI + gate) | `address-bar/address-bar-mode-table.ts` (import-free ids/table/order; gate imports under type stripping) |
| `theia/.../chrome-bar/address-bar/address-bar.tsx` (identity box) | component | event-driven (push → render; click → panel) | itself: mode button/chip render + typed-text lock at `address-bar.tsx:2137` / lock span `:2160` to be replaced; `renderModeButton` pattern |
| `theia/.../chrome-bar/site-identity/site-panel.tsx` (new, or in address-bar.tsx) | component | request-response (kind → reply → render) | `chrome-bar-widget.tsx` history menu (~368-374: per-request `CompoundMenuNode` + `menus.render`) + 30-04 command-centre `provide`/`acceptHelp` rows |
| `theia/.../chrome-bar/site-identity/app-menu.ts` (new, pure order+filter) | utility | request-response | `address-bar/address-bar-mode-table.ts` (order table + `defaultModeFor` fallback) + `layout-controls-widget.tsx:81-89` (`menus.render` call shape) |
| `theia/.../chrome-bar/chrome-bar-widget.tsx` (hamburger button) | component | event-driven | itself: Back/Forward/Reload/Home/New Tab buttons (~542-619) + history `onHistoryContextMenu` |
| `theia/.../chrome-bar/chrome-bar-copy.ts` (strings) | config | file I/O (read at render) | itself: `CHROME_BAR_COPY` + `appSubject()`; pinned by `EXPECTED_NAV_COPY` in `verify-shell-error-copy.mjs` |
| `theia/.../tab-uris/.../web-tab.ts` + `chrome-store-client.ts` (state/kind unions) | model | streaming (push) + request-response | themselves: `WebTabState`/`WebTabMessage` (~159-184,232-256), `STORE_REQUEST_KINDS` set |
| `scripts/verify-site-identity.mjs` (new static gate) | test | file I/O (derive-and-compare) | `scripts/verify-address-bar-modes.mjs` (type-stripping import + derived comparison + plants) |
| `scripts/verify-site-identity-live.mjs` (new live gate) | test | event-driven (probe harness) | `scripts/verify-nav-keys-live.mjs` / `verify-address-bar-live.mjs` (`PLANTS`, served pages, recorder) |

## Pattern Assignments (copy these excerpts)

1. **Boundary listener widen** — the overlay listener at `:3346` (`NOTIFY_LOCATION | NOTIFY_STATE_NETWORK`, entry literal ~:3297, onLocationChange `:3314`, onStateChange `:3329`) has NO onSecurityChange/onContentBlockingEvent methods; add them there calling `scheduleWebTabState(...)`. The `onSecurityChange(){}/onContentBlockingEvent(){}` at `:4021-4022` belong to the `writePersistedDocument` persist listener (`:4007-4023`) and must not be edited for this. Never touch lines above the last catalogued internal.
2. **Boundary kind switch** — copy one `handleWebTabAction` case arm (~4147+: validate `webTabIdIsValid`, `webTabs.get`, reply `{ok,kind,where}`) per new `webTab*` kind; copy one `handleStoreRequest` arm (`:3753-3810`, e.g. `savePageCopy` at `:3818`) per new store kind (`openStockPage`, `quitRequest`); extend `WEB_TAB_ACTION_KINDS` (`:4156`) / `STORE_REQUEST_KINDS` (`:3729-3744`) sets in place; classify each new store kind in `verify-web-tab-bridge.mjs` `STORE_KIND_CLASSES` (`openStockPage` → `store-write`, `quitRequest` → `lifecycle`) + `ChromeStoreClient` same-named method + plant, same commit.
3. **Principal keying** — copy `entry.browser.contentPrincipal` reads (cf. ARCHITECTURE.md §3; `browser-custom-element.mjs:684`); reject any `data.origin`/`data.host` write path the way `storeUrlArg` rejects bad urls (~3736-3741). Cookie removal copies the per-cookie precedent: `Services.cookies.remove(cookie.host, cookie.name, cookie.path, cookie.originAttributes)` (`SiteDataManager.sys.mjs:503-512`, `Discovery.sys.mjs:95-100`); storage clear copies the principal precedent `Services.clearData.deleteDataFromPrincipal(principal, true, flags, resolve)` (`Sanitizer.sys.mjs:1273-1280`) with cookie-excluding flags.
4. **Minted/enum validation** — copy `savePageCopy`'s scheme/size/privacy guards (~4037-4052) for `openStockPage`'s enum switch (unknown page → `{ok:false,reason:'validation'}`); copy `isMintedSavedPageDir` structural-check style for any path handling.
5. **Pill identity box** — copy `renderModeButton` + lock-span block (`address-bar.tsx:2137` typed-text secure line + `:2160` lock span): replace the typed-text line with `this.identityState()` from pushed state; keep `className='pb-chrome-bar-pill'` and `pb-chrome-bar-lock` anchors other gates derive.
6. **Per-request menu** — copy `chrome-bar-widget.tsx:368-374` (`CompoundMenuNode` + `menus.render({menuPath, menu})` + `HISTORY_MENU_PATH` const pattern at :40-43) for both the site-permission rows and the hamburger; never statically register per-site rows.
7. **Module-load binding** — copy `chrome-bar-frontend-module.ts:84-98` (`bindContributionProvider` / `bind(...).toSelf().inSingletonScope()` at load, D-50) for any new contribution.
8. **Copy discipline** — copy `CHROME_BAR_COPY.*` reference style; add rows + move `EXPECTED_NAV_COPY` in the same commit; `appSubject()` for the product; never an internal identifier.
9. **Static gate** — copy `verify-address-bar-modes.mjs` structure: type-stripping import of the pure table, tree-derived expectations, set-equality compares, `--self-test` plants each asserting red-with-expected-text; register both rows in `verify-platform.sh` beside the `address-bar-modes` rows (~3773-3774).
10. **Live gate** — copy `verify-address-bar-live.mjs` shape: served `127.0.0.1`+`localhost` pages (≤4 web tabs per session on the served origin), `ChromeStoreClient.request` recorder, `PLANTS` map, `--scenario` split; reuse `scripts/lib/pb-live-probe.mjs` + `pb-relaunch.mjs` (`__getByName` needs class name `AddressBar` kept).

## Shared Patterns (apply to every plan)

- Standing rules block from 30-02-PLAN: STATE re-read, explicit-path commits, hard rules 1-2 + catalogue `--fix`, copy gate, D-50 binds, privileged-kinds-only-from-handlers, layer (a) portals, live-run budget (`MOZ_PURGE_CACHES=1`, ≤4 served-origin tabs, no `.planning/` literals, no absence assertions without positive control, every scenario gets a plant).
- Log lines carry kind + error only, never URL/title/principal (cf. `sendWebTabPush` catch at ~4207-4215).
- After every boundary edit: `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` → `bash scripts/check-internals-boundary.sh --catalogue` → append INTERNAL-APIS.md row(s).

## Files with No Analog

- `site-identity-table.ts` content (SecurityState enum, PERMISSION_IDS, STOCK_PAGES, MENU_ORDER): values derive from upstream/decision (RESEARCH.md), but the *file shape* copies `address-bar-mode-table.ts`.
- Cert-field formatting (`Issued to/by`, validity dates): no in-repo analog; keep to plain `secInfo.serverCert` string fields, no file paths.

---

## Appendix (planning-run contract)

### must_haves
- truths:
  - "Every new/changed file in the plans has a row above with role, data flow, and analog"
  - "Shared Patterns name the standing-rules block and catalogue flow the plans must repeat"
- artifacts:
  - path: ".planning/phases/31-site-identity-permissions-and-app-menu/31-PATTERNS.md"
    provides: "per-file analogs + excerpts + shared patterns"
    contains: "Pattern Assignments"

### threat_model
| ID | Category | Threat | Severity | Disposition |
|----|----------|--------|----------|-------------|
| T-31-P01 | Tampering | Planner copies a spoofable analog (typed-text lock) | medium | mitigate — assignment 5 replaces that line; gate asserts absence |

### verify + fails_when
- `<automated>` `grep -c "copy \|analog\|~" .planning/phases/31-site-identity-permissions-and-app-menu/31-PATTERNS.md` — expect `>=8`
  <fails_when>non-zero exit; count < 8</fails_when>

*Phase: 31-site-identity-permissions-and-app-menu*
