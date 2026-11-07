# Phase 29: Address Bar Search and Fixup - Research

**Researched:** 2026-10-21
**Domain:** Gecko search, URI fixup and Places, driven from PowerBrowserAPI over the PowerBrowserGroup actor; Theia 1.76 chrome-bar pill UI; the `configuration.toml` generator path to `distribution/policies.json`
**Confidence:** HIGH for every in-tree and upstream code path cited below (read this session at `88ad96c`, `upstream/` at `FIREFOX_153_5_0esr_BUILD1`, `theia/node_modules/@theia/*` 1.76.0). MEDIUM for runtime behaviour that only a live run can confirm (Assumptions Log, Validation Architecture).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Recorded rulings that apply (REQUIREMENTS.md header and PROJECT.md Key Decisions)
- Typed non-URL text may search (lifts 13-UI-SPEC "no new addressability scheme").
- The chrome bar may write to Places (Shift+Del is the first write), only through PowerBrowserAPI.
- Search suggestions are ON by default, with a setting to turn them off; the engine set and default engine come from configuration.toml via distribution/policies.json SearchEngines; suggest hosts get endpoint-allowlist.json rows in this phase (keep allowlist-doc-consistency green).
- No clipboard-reading suggestion.
- Chrome-bar copy reads the configured application name, never a hard-coded brand (BAR-14).
- Overlay loads to other loopback ports never carry the Theia token cookie; clear-data never removes it.
- The modes dropdown is Phase 30, not this phase; keep the pill structure ready for it (address-bar/ split is Phase 30's).
- Extensions tab host is Phase 31.1 (signed off 2026-10-21); this phase must not depend on it.

### Claude's Discretion
All other choices are at Claude's discretion (discuss skipped). Use the ROADMAP
goal and notes, .planning/research/SUMMARY.md (Phase 2 section, D1-D8,
Pitfalls 6, 10, 11, 13, probes 11 and 13), STACK.md (SearchService via moz-src,
await init(), URIFixup, SearchSuggestionController) and codebase conventions.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BAR-01 | Type non-URL text, Enter searches the default engine | `resolveTypedAddress` store kind: `await SearchService.init()`, `getFixupURIInfo(ALLOW_KEYWORD_LOOKUP)`, `keywordProviderId` means search, `engine.getSubmission(keywordAsSent)`, http(s) wall on the result (Pattern 2) |
| BAR-02 | `localhost`, `localhost:4000`, `host:port`, IP open as addresses | URIFixup handles all four (`isURILike`, `possiblyHostPortRegex`, `makeURIWithFixedLocalHosts`); replaces `typedAddressTargetOf`; token-cookie strip ships in the same plan (Pattern 6) |
| BAR-03 | Engine suggestions while typing, on by default, setting to turn off | `searchSuggestions` store kind over `SearchSuggestionController.fetch` (`LOAD_ANONYMOUS`, `maxLocalResults: 0`); `browser.searchSuggestions` User-scope pref; suggest hosts derived into `endpoint-allowlist.json` via `manifestEndpointSources` (Pattern 3, 7) |
| BAR-04 | Pick the default engine from engines whose initial set comes from `configuration.toml` | `[[search_engines]]` in `configuration.toml` → `emitSearchEngines` fragment → `policies.json` `SearchEngines {Add, Default}`; `listSearchEngines` kind; `browser.defaultSearchEngine` pref with runtime `enum` via `updateSchemaProperty` (Pattern 1) |
| BAR-05 | One-off search with another engine from the result list | Same `resolveTypedAddress` kind with an explicit `engineName`, validated chrome-side against the bar's engine set |
| BAR-06 | Open-tab suggestion switches to that tab | Backend tab rows intersected with live `WebTabWidget`s by `url`; `shell.activateWidget(id)` then `focusPage()` (Phase 27 `switchTo` path); never `row.uri` (gate) |
| BAR-07 | Inline autofill of a typed origin; Enter or Tab accepts | `autofillOrigin` read kind over `moz_origins` (read-only SQL, same class as `searchPlaces`); `setSelectionRange`; commit the reply's exact URL |
| BAR-08 | Alt+Enter, Ctrl+click, middle-click open in a new tab | `WebTabOpenHandler.open` (foreground) and `openInBackground(url, ref)` (Phase 27) |
| BAR-09 | Shift+Del removes a history suggestion | `removeHistoryEntry` store kind → `PlacesUtils.history.remove(url)`; only on `source === 'history'`; first privileged store kind, never in `TAB_STORE_RELAY_KINDS`, never a command |
| BAR-10 | Right-click the pill: Cut, Copy, Paste, Paste & Go | Per-request `CompoundMenuNode` through `ContextMenuRenderer` (Phase 27 history-menu pattern); `readClipboardText` privileged store kind (chrome-side `Services.clipboard`), because content `navigator.clipboard.readText` raises Firefox's native paste confirmation popup (Pitfall 4) |
| BAR-11 | Favicons and type icons on rows; first click selects all; IME never commits early | Favicons from `PlacesUtils.favicons.getFaviconForPage(uri, 16)` → `dataURI` (data: only); row `source` drives the type icon; mousedown/mouseup select-all; `isComposing`/`keyCode 229` guard |
| BAR-12 | Typed-but-unsubmitted text kept per tab | `WeakMap<Widget, string>` in `ChromeBarWidget`, saved on current-widget change before `syncAddressFromWidget` |
| BAR-13 | Ctrl+Enter completes `name` → `www.name.com`; drop link or text loads or searches | `resolveTypedAddress {canonize: true}` mirrors `UrlbarInput._maybeCanonizeURL` (`Services.locale.urlFixupSuffix`, `FIXUP_FLAGS_MAKE_ALTERNATE_URI`); drop payload through the same kind |
| BAR-14 | Every chrome-bar message names the configured app name | Move the two literals (`chrome-bar-widget.tsx:1041,1047`) into `CHROME_BAR_COPY` with `appSubject()`; extend `verify-shell-error-copy.mjs` with a brand ban over the widget surface, brand derived from `configuration.toml` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

| Directive | Consequence for this phase |
|-----------|----------------------------|
| Never fork or patch Theia core | All pill work is `@powerbrowser/chrome-bar` composition; menus via `ContextMenuRenderer`, settings via `PreferenceContribution`/`PreferenceSchemaService` |
| Never modify Gecko outside the patch stack; one boundary file | Search, fixup, Places, clipboard, cookie observer all live in `PowerBrowserAPI.sys.mjs` end-of-file sections; every forbidden-pattern line gets an `INTERNAL-APIS.md` row; no `PowerBrowserSearch.sys.mjs` (Pitfall 14) |
| Design for the bridge (GUI-04) | `TabUriRegistry` shape untouched; `gui04-registry-shape` stays green |
| Repo path has no space | n/a (no relocation) |
| Theia is the default GUI; stock chrome reachable; no custom browser chrome beyond the bar | The bar grows inside its own widget; no XUL panel; the stock paste popup is avoided by design |
| No generator early; Phase 2 byte-identity | New `search-engines.json` fragment has no tracked comparand (the EXT-03 pattern); none of the 33 byte-identical surfaces changes |
| Residual-brand scan is permanent; stage new files before trusting it | `node scripts/scan-brand-residue.mjs` after `git add` |
| Patches regenerated, never text-edited | No patch is needed in this phase |
| One driver, one registry (`verify-platform.sh`); never assert on absence of a self-emitted log line; derive and compare with `--self-test` | Every new check is one row pair; absence assertions use an independent observer with a positive control (served-page request log) |
| No internal identifier in user-facing text | No pref key, kind, engine id, port in copy; `{App}` and `{engine}` only |
| Builds in Nix dev shells; `-purgecaches` for shell JS edits | Live rows use `withProbeShell` (`MOZ_PURGE_CACHES=1`) |

## Summary

Every Gecko piece this phase needs exists at 153.5 and runs in the parent process without a stock window, provided the code awaits `SearchService.init()` first: URI fixup's keyword branch silently returns nothing while `SearchService.hasSuccessfullyInitialized` is false (`URIFixup.sys.mjs:498`), and `SearchSuggestionController.fetch` throws until init (`SearchSuggestionController.sys.mjs:296`). `getFixupURIInfo` with `FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP` already performs the default-engine submission and reports it through `keywordProviderId`/`keywordAsSent`, so one chrome function decides address versus search, and the http(s) wall is applied to whatever URL it produced.

The engine set needs one design correction to the roadmap note. `SearchEngines.Add` and `Default` work in a shell-only session (`Add` is applied inside `SearchService.init()`, and `#appDefaultEngine` honours the policy `Default` at lookup time, `SearchService.sys.mjs:1835-1852`). `Remove` does not: it runs from `onAllWindowsRestored`, which is driven by `sessionstore-windows-restored`, sent from `SessionStore.initializeWindow` for a `navigator:browser` window (`SessionStore.sys.mjs:2161,2190`). The app-provided engines (Google as the global default, with Mozilla's ESR partner codes) therefore stay visible. The bar must hide them itself: when the policy declares engines, the bar's set is `getVisibleEngines()` minus `getAppProvidedEngines()`. A policy engine whose `Name` equals an app-provided name is silently dropped (`#addEngineToStore` throws `duplicate-title`, `SearchService.sys.mjs:2588-2594`, and `#addPolicyEngine` is not awaited), so a static gate must reject colliding names against `upstream/services/settings/dumps/main/search-config-v2.json`.

Three things are not where the earlier research expected. (1) Clipboard read from the Theia frame through Theia's `ClipboardService` uses `navigator.clipboard.readText()`, which in Firefox opens a native "Paste" confirmation menupopup that `ClipboardContextMenu` creates on demand in any chrome document (`ClipboardContextMenu.sys.mjs:172-181`). Paste and Paste & Go must read through a privileged chrome kind instead. (2) The token cookie is host-only `127.0.0.1` with no port scope, so every overlay load to `127.0.0.1:<port>` carries it once fixup makes such loads routine. Gecko adds cookies before `http-on-modify-request` (`nsHttpChannel.cpp:713-722` then `:821-822`), so an observer can strip it from requests whose browsing context is an overlay; it must ship in the same plan as BAR-02. (3) The backend relay forwards a whitelisted set of store kinds from the Theia backend to chrome (`TAB_STORE_RELAY_KINDS`), so the new privileged store kinds must stay out of that list, and nothing gates store kinds today.

**Primary recommendation:** Build one chrome-side search area in an end-of-file section of `PowerBrowserAPI.sys.mjs` (seven store kinds, one cookie observer), feed it from a new `[[search_engines]]` manifest table through the EXT-03 fragment pattern, and keep the Theia side to pill behaviour plus a dependency-free `address-bar-rows.ts` module that a Node script can test directly.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Address-or-search decision, engine submission, http(s) wall | Gecko parent (`PowerBrowserAPI`) | — | URIFixup and SearchService exist only in the parent; the frontend is unprivileged and must not mint engine URLs (`verify-chrome-bar-suggestions` bans engine hosts in chrome-bar source) |
| Engine set and default | Build (`configuration.toml` → `policies.json`) | Gecko parent (filter) | Rebrand rule: one file; the parent hides app-provided engines because `Remove` never runs in a shell session |
| Engine suggestions (network) | Gecko parent (`SearchSuggestionController`) | Theia frame (debounce, render) | Anonymous XHR from chrome (`LOAD_ANONYMOUS`); the frame only sends text that chrome re-checks as search-shaped |
| History/bookmark rows | Gecko parent (`searchPlaces`, existing) | Theia frame (merge) | Unchanged reader |
| Open-tab rows and switch | Theia frame (`ApplicationShell`, `WebTabWidget`) | Theia backend (existing tab rows) | The widget is the switch target; the store row only matches it by URL |
| Autofill origin | Gecko parent (read-only `moz_origins` query) | Theia frame (`setSelectionRange`) | Places DB is chrome's; one reader connection |
| Shift+Del (Places write) | Gecko parent (`PlacesUtils.history.remove`) | Theia frame (keydown handler only) | Privileged-kind rule |
| Clipboard read | Gecko parent (`Services.clipboard`) | Theia frame (menu item handler only) | Avoids the native paste popup; privileged |
| Clipboard write (Cut/Copy) | Theia frame (`ClipboardService.writeText`) | — | Content may write with transient activation; no popup |
| Favicons and engine icons | Gecko parent (Places favicons, engine data) | Theia frame (render `data:` only) | Technical ruling: favicons from Places, no network fetch |
| Token-cookie strip | Gecko parent (`http-on-modify-request` observer) | — | Only the parent sees every channel and its browsing context |
| Copy, drafts, select-all, IME | Theia frame | — | DOM-only |
| Brand name in copy | Build (`applicationName` in frontend config) | Theia frame (`appSubject()`) | Already wired (`chrome-bar-copy.ts:21-23`) |

## Standard Stack

No new package. Every API below is in the pinned trees.

### Core (Gecko 153.5.0esr, parent process)
| API | Location (verified this session) | Use |
|-----|----------------------------------|-----|
| `SearchService` (moz-src) | `toolkit/components/search/SearchService.sys.mjs:95` export; `init()` :529, `getDefault()` :179, `getEngineByName()` :367, `getVisibleEngines()` :445, `getAppProvidedEngines()` :454, `hasSuccessfullyInitialized` :280 [VERIFIED: upstream read] | Engine list, default, init |
| `SearchEngine.getSubmission(terms, responseType)` | `SearchEngine.sys.mjs:1347` [VERIFIED: upstream read] | Search URL for an explicit engine (one-offs, the setting) |
| `SearchSuggestionController` (moz-src) | `SearchSuggestionController.sys.mjs:216`; `fetch({searchString, inPrivateBrowsing, engine, maxLocalResults = 5, maxRemoteResults = 10, ...})` :274-284; throws without `inPrivateBrowsing` :299-301; remote fetch uses `LOAD_ANONYMOUS \| INHIBIT_PERSISTENT_CACHING` :475; honours `browser.search.suggest.enabled` :23 [VERIFIED: upstream read] | Engine suggestions |
| `Services.uriFixup.getFixupURIInfo(text, flags)` | `docshell/base/URIFixup.sys.mjs`; flags `FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP = 1`, `FIXUP_FLAGS_MAKE_ALTERNATE_URI = 2`, `FIXUP_FLAG_FIX_SCHEME_TYPOS = 8` (`nsIURIFixup.idl:96,102,114`); info fields `preferredURI`, `keywordProviderId`, `keywordAsSent`, `postData`, `fixupChangedProtocol` (idl :31-78) [VERIFIED: upstream read] | Address/search decision |
| `Services.locale.urlFixupSuffix` | `intl/locale/mozILocaleService.idl:210` [VERIFIED: upstream read] | Ctrl+Enter suffix (".com" in en-US) |
| `PlacesUtils.history.remove(url)` | `toolkit/components/places/History.sys.mjs` (STACK.md :340) [CITED: STACK.md] | Shift+Del |
| `PlacesUtils.favicons.getFaviconForPage(uri, width)` → `nsIFavicon.dataURI` | `nsIFaviconService.idl:137`, `:172` [VERIFIED: upstream read] | Row favicons |
| `PlacesUtils.promiseDBConnection()` | already used by `searchPlaces` (`PowerBrowserAPI.sys.mjs:3879`) [VERIFIED: tree read] | `moz_origins` autofill read |
| `Services.clipboard.getData(trans, kGlobalClipboard)` + `nsITransferable` | `widget/nsIClipboard.idl:77`; Firefox's own reader `browser.js:1399-1428` [VERIFIED: upstream read] | Paste, Paste & Go |
| `Services.obs` `http-on-modify-request` + `nsIHttpChannel.getRequestHeader/setRequestHeader` | ordering `nsHttpChannel.cpp:713-722,821-822`; precedent `Policies.sys.mjs:188-194` [VERIFIED: upstream read] | Token-cookie strip |
| Enterprise policy `SearchEngines {Add, Default}` | `Policies.sys.mjs:3074-3189`; schema `Add[]: {Name*, URLTemplate*, IconURL, Alias, Description, Encoding, Method, PostData, SuggestURLTemplate}`, `Default`, `DefaultPrivate`, `PreventInstalls`, `Remove` [VERIFIED: upstream policies-schema.json read] | Engine set from config |

### Core (Theia 1.76.0, already composed)
| API | Use |
|-----|-----|
| `ContextMenuRenderer.render({ menuPath, menu, anchor, context, onHide })` | Pill context menu (Phase 27 history-menu pattern) |
| `ClipboardService.writeText` | Cut, Copy |
| `PreferenceContribution` + `PreferenceSchemaService.updateSchemaProperty(key, property)` (`preference-schema-service.d.ts:46`) [VERIFIED: node_modules read] | `browser.searchSuggestions`, `browser.defaultSearchEngine` with runtime `enum`/`enumItemLabels` |
| `HoverService` (`pb-chrome-bar-hover`) | One-off tooltips |
| `ApplicationShell.activateWidget` | Switch to tab |
| `WebTabOpenHandler.open` / `.openInBackground(url, ref)` (`web-tab.ts:768,782`) [VERIFIED: tree read] | New-tab targets |
| `FrontendApplicationConfigProvider.get().applicationName` via `appSubject()` | `{App}` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SearchService + URIFixup + SearchSuggestionController directly | Headless `UrlbarProvidersManager` | Providers dereference `controller.browserWindow` (STACK.md :148); drags in QuickSuggest and telemetry. Rejected |
| `autofillOrigin` read-only SQL on `moz_origins` | `UrlbarProviderAutofill` through `ProvidersManager` | Needs a spike (STACK.md MEDIUM). The SQL is the same coupling class as the existing `searchPlaces` reader and Pitfall 11 bans raw SQL **writes** only. Take the SQL |
| Bar filters out app-provided engines | Policy `Remove` | `Remove` never runs without a stock window (Summary). Keep `Remove` out of the generator |
| Chrome-side `readClipboardText` | Theia `ClipboardService.readText` | Native paste popup over the bar; invisible to BiDi; two clicks for Paste & Go |
| Engine passed per request (`engineName`) | `setDefaultSearchEngine` write kind driven by the setting | A preference listener is not a widget event handler, so a write kind there breaks the privileged-kind rule; per-request names need no write. **Decided (autonomous, recommended)**; this narrows 29-UI-SPEC's "changes it only through a PowerBrowserAPI kind" to "validated by the kind on every request" |

**Installation:** none.

## Package Legitimacy Audit

No external package is installed by this phase. `@theia/core@1.76.0` and `@vscode/codicons@0.0.45` are existing pins.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Verified In-Repo Values (verbatim, read this session)

| Value | Source | Verbatim |
|-------|--------|----------|
| Store kinds | `powerbrowser/shell/PowerBrowserAPI.sys.mjs:3694-3703` | `"readHistoryEntry", "readBookmarkByUrl", "listBookmarkFolder", "projectSessionStoreTabs", "queryTabsWithPlaces", "searchPlaces", "setSetting", "savePageCopy"` |
| Web-tab action kinds | `PowerBrowserAPI.sys.mjs:4093` | `const WEB_TAB_ACTION_KINDS = new Set(["webTabStop", "webTabHistory", "webTabGotoIndex", "webTabActivated"]);` |
| Store routing line | `PowerBrowserAPI.sys.mjs:3666` | `if (isStoreRequestKind(message.data?.kind)) { return handleStoreRequest(message.data, this); }` |
| Store walls | `PowerBrowserAPI.sys.mjs:3733-3737` | `if (!groupSenderIsTheia(actorRef) \|\| !storeSenderInShellWindow(actorRef)) {` |
| Navigate wall | `PowerBrowserAPI.sys.mjs:3409-3420` | `if (spec !== "about:blank" && !/^https?:\/\//i.test(spec)) { return "refused-scheme"; }` … `entry.browser.fixupAndLoadURIString(spec, { triggeringPrincipal });` |
| Token cookie mint | `PowerBrowserAPI.sys.mjs:536-549` | `Services.cookies.add(host, path, name, value, /* aIsSecure */ false, /* aIsHttpOnly */ true, /* aIsSession */ true, …, Ci.nsICookie.SAMESITE_LAX, Ci.nsICookie.SCHEME_HTTP, …)` |
| Health probe sets the cookie by hand | `PowerBrowserAPI.sys.mjs:675` | ``xhr.setRequestHeader("Cookie", `POWERBROWSER_TOKEN=${token}`);`` |
| Token cookie name (backend) | `theia/extensions/token-gate/src/node/token-gate-backend-contribution.ts:16` | `export const POWERBROWSER_TOKEN_COOKIE_NAME = 'POWERBROWSER_TOKEN';` |
| Bridge gate classes | `scripts/verify-web-tab-bridge.mjs:58` | `const KIND_CLASS_NAMES = ['tab-navigation', 'tab-lifecycle', 'selection', 'privileged'];` |
| Backend relay whitelist | `theia/extensions/tab-uris/src/browser/tab-store-access-protocol.ts:58-65` | `'readHistoryEntry', 'readBookmarkByUrl', 'listBookmarkFolder', 'projectSessionStoreTabs', 'queryTabsWithPlaces', ...TAB_STORE_WRITE_OPS,` |
| Suggestion cap (pinned by gate) | `chrome-bar-suggestion-service.ts:18`; `scripts/verify-chrome-bar-suggestions.mjs:89` | `export const CHROME_SUGGESTION_LIMIT = 8;` / `uiCap: 8,` |
| Engine-host ban in chrome-bar source | `scripts/verify-chrome-bar-suggestions.mjs:394-406` | `'google.com', 'bing.com', 'duckduckgo.com', 'search.yahoo.com', 'yandex.com', 'yandex.ru', 'startpage.com', 'ecosia.org', 'search.brave.com', 'mojeek.com',` and `const SEARCH_QUERY_PATTERN = /[?&](q\|query)=\|search\?/;` |
| Brand literals left | `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:1041,1047` | `PowerBrowser couldn&apos;t open that address. Press Enter to try again.` / `PowerBrowser couldn&apos;t load suggestions. Press Enter to visit what you typed.` |
| Old address rule | `chrome-bar-widget.tsx:99-107` | `if (!/\s/.test(text) && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text) && text.includes('.')) { return \`https://${text}\`; }` |
| Copy object and subject | `chrome-bar-copy.ts:11-12,21-22` | `export const CHROME_BAR_COPY = Object.freeze({` / `noAppName: 'The browser',` / `return FrontendApplicationConfigProvider.get().applicationName?.trim() \|\| CHROME_BAR_COPY.noAppName;` |
| Pref key precedent | `chrome-bar-preferences.ts:14-15` | `'browser.showHomeButton'`, `'browser.homePage'` |
| Widget copy pin and brand constant | `scripts/verify-shell-error-copy.mjs:548`, `:596` | `const EXPECTED_WIDGET_COPY = new Set([` / `const NAV_BRAND_LITERAL = "PowerBrowser";` |
| Shipped policy file | `powerbrowser/distribution/policies.json:1-8` | `"AppUpdateURL": "https://updates.powerbrowser.org/update.xml", "DisableTelemetry": true, "DisableFirefoxStudies": true, "ExtensionSettings": {}` |
| Manifest endpoint sources | `scripts/generate.mjs:2644-2648` | `take('telemetry.endpoint', …); for (const key of ['release_notes', 'update', 'crash_report', 'homepage', 'search']) { take(\`urls.${key}\`, …); } take('installer.support_url', …);` |
| Policy file shipped only in the package | `powerbrowser/packaging/package-linux.sh:63` | `cp "$ROOT/powerbrowser/distribution/policies.json" "$STAGE/distribution/policies.json"` |
| Display name for the brand ban | `configuration.toml` `[identity]` | `display_name = "PowerBrowser"` |

## Architecture Patterns

### System Architecture Diagram

```
 keystroke in pill (Theia frame, unprivileged)
   │
   ├─ IME composing? ── yes ─▶ nothing (one query on compositionend)
   │
   ▼ debounce 150 ms (existing pDebounce)
 ┌──────────────── ChromeStoreClient.request (DOM event → actor) ────────────────┐
 │ resolveTypedAddress{text,engineName}   searchPlaces{text} (existing)          │
 │ autofillOrigin{text}                   searchSuggestions{text,engineName}     │
 │                 (only after resolve said "search" and the setting is on)      │
 └───────────────────────────────┬───────────────────────────────────────────────┘
                                 ▼
 PowerBrowserGroupParent.receiveMessage ─▶ handleStoreRequest
   walls: groupSenderIsTheia + storeSenderInShellWindow
                                 ▼
   search section (end of PowerBrowserAPI.sys.mjs)
     await SearchService.init()
     getFixupURIInfo ─▶ keyword? ─ yes ─▶ engine(name ∈ bar set).getSubmission
                     └─ no ─▶ preferredURI
     http(s) wall on the RESULT ─▶ {kind: visit|search|refused, url, engineName}
     SearchSuggestionController.fetch (anonymous XHR) ─▶ configured suggest host
     moz_origins SELECT (read-only) ─▶ {text, url}
     PlacesUtils.favicons ─▶ data: URIs
                                 ▼
 Theia frame: address-bar-rows.ts compose
   heuristic(1, highlighted) + engine(≤4) + tab/bookmark/history(≤5), dedupe by url, cap 10
                                 ▼
 Enter / click / Alt+Enter / Ctrl|middle-click / Shift+Del / context menu
   ├─ visit|search ─▶ navigateWebTab(url) | WebTabOpenHandler.open | openInBackground
   ├─ tab row ─▶ shell.activateWidget(widget.id) + focusPage()   (no load)
   ├─ Shift+Del on history row ─▶ removeHistoryEntry (privileged) ─▶ PlacesUtils.history.remove
   └─ Paste / Paste & Go ─▶ readClipboardText (privileged) ─▶ insert | resolve + commit

 every http channel (parent) ─▶ http-on-modify-request observer
   host 127.0.0.1 and initiator is an overlay ─▶ drop POWERBROWSER_TOKEN from Cookie
```

### Recommended file map

```
configuration.toml                        + [[search_engines]] (name, url, suggest_url)
scripts/lib/config-schema.json            + search_engines[].name|url|suggest_url
scripts/generate.mjs                      + emitSearchEngines, frozen-table row (no tracked comparand),
                                            manifestEndpointSources takes each engine url and suggest_url
powerbrowser/distribution/policies.json   + "SearchEngines": {"Add": [...], "Default": "<first name>"}
powerbrowser/endpoint-allowlist.json      + one row per engine host, "manifest" field set
powerbrowser/shell/PowerBrowserAPI.sys.mjs  STORE_REQUEST_KINDS (in-place line edit) + end-of-file
                                            "Phase 29: search area" section + cookie-strip section;
                                            webTabOpen calls installTokenCookieStrip() once
powerbrowser/INTERNAL-APIS.md             rows appended; Places row re-ruled in place (read-write)
theia/extensions/tab-uris/src/browser/chrome-store-client.ts   + 7 typed client methods
theia/extensions/chrome-bar/src/browser/
  address-bar-rows.ts      NEW, zero imports: row types, compose(1+4+5, cap 10, dedupe), canonize test,
                           highlight-by-key, autofill splice; tested by a Node script
  chrome-bar-widget.tsx    pill behaviour (resolve path, rows, one-offs, autofill, Shift+Del,
                           context menu, select-all, IME, drafts, drop)
  chrome-bar-places-suggestions.ts  rows carry source; tab rows matched to live widgets
  chrome-bar-copy.ts       all new strings
  chrome-bar-preferences.ts  + browser.searchSuggestions, browser.defaultSearchEngine
  chrome-bar.css           32px single-line rows, 432px panel, one-off strip, drop ring
scripts/verify-search-engines.mjs        NEW (+ --self-test)
scripts/verify-address-bar-rows.mjs      NEW (+ --self-test)
scripts/verify-token-cookie-strip.mjs    NEW (+ --self-test)
scripts/verify-address-bar-live.mjs      NEW (+ --self-test), on scripts/lib/pb-live-probe.mjs
scripts/verify-web-tab-bridge.mjs        + rule 12 store-kind classification
scripts/verify-shell-error-copy.mjs      pins move; widget brand ban
```

Phase 30 boundary: do not create `address-bar/`; `address-bar-rows.ts` sits beside the widget and Phase 30 moves it with the pill. Nothing may assume the lock or the input is the pill's first child (29-UI-SPEC).

### Pattern 1: Engine set from `configuration.toml` (the EXT-03 fragment path)

**What:** A top-level array table, first entry is the default (no cross-reference to validate):

```toml
# Search engines (BAR-04). The first entry is the default. Each name must not
# equal a name Firefox already ships, or Gecko drops the entry without a word.
[[search_engines]]
name = "DuckDuckGo Lite"
url = "https://lite.duckduckgo.com/lite/?q={searchTerms}"
suggest_url = "https://ac.duckduckgo.com/ac/?q={searchTerms}&type=list"

[[search_engines]]
name = "Wikipedia"
url = "https://en.wikipedia.org/wiki/Special:Search?search={searchTerms}"
suggest_url = "https://en.wikipedia.org/w/api.php?action=opensearch&search={searchTerms}"
```

The two suggest endpoints and the Wikipedia search path are the ones Firefox's own config uses (`search-config-v2.json` dump: ddg `https://ac.duckduckgo.com/ac/` with `type=list`; wikipedia `https://en.wikipedia.org/w/api.php` with `action=opensearch`, search `https://en.wikipedia.org/wiki/Special:Search`) [VERIFIED: upstream dump read]. The DuckDuckGo Lite search URL is [ASSUMED]. The names avoid the shipped names `DuckDuckGo` and `Wikipedia (en)` [VERIFIED: upstream dump read]. **Decided (autonomous, recommended)**; Chris can change it by editing one file, which is the product's core value.

`emitSearchEngines(config)` emits `{"Add": [{"Name", "URLTemplate", "SuggestURLTemplate"?}], "Default": <first name>}` in manifest order, no `IconURL` (an https icon would be fetched over the network and trip the endpoint gate), no `Method`/`PostData` (GET only), no `Remove`. Absent list emits `{}` and the bar shows Gecko's visible engines (stock behaviour). Validation in `validate()`: `url` and `suggest_url` match `^https://[^\s\x00-\x1f\x7f]+$` and contain `{searchTerms}`; names unique and non-empty. Copy-over sets only the `SearchEngines` key, siblings byte-identical (the `verify-webextensions.mjs` contract).

`verify-search-engines.mjs` (S, `--quick`, clone of `verify-webextensions.mjs`): (1) `generated/search-engines.json` equals the emission when present; (2) `policies.json` `SearchEngines` equals the emission; (3) no configured `name` equals any app-provided `base.name` in `upstream/services/settings/dumps/main/search-config-v2.json` (skip with a SKIP line when `upstream/` is absent, the generate-check rule); (4) every engine host is in the allowlist (or leave that to `theia-endpoints`, below). Plants: stale key, colliding name, missing `{searchTerms}`.

Chrome side, the bar's engine set:

```javascript
// Phase 29: the engines the bar offers. When configuration.toml supplied
// engines (policy SearchEngines.Add), Firefox's own engines are hidden here,
// because the policy's Remove only runs after a stock window restores.
async function barEngines() {
  await searchLazy.SearchService.init();
  const visible = await searchLazy.SearchService.getVisibleEngines();
  if (!configuredEnginesActive()) {
    return visible;
  }
  const builtIn = new Set((await searchLazy.SearchService.getAppProvidedEngines()).map(e => e.id));
  return visible.filter(e => !builtIn.has(e.id));
}
function configuredEnginesActive() {
  return Services.policies?.status === Ci.nsIEnterprisePolicies.ACTIVE
    && (Services.policies.getActivePolicies()?.SearchEngines?.Add?.length ?? 0) > 0;
}
async function barEngine(name) {
  const engines = await barEngines();
  if (name) {
    return engines.find(e => e.name === name) ?? null;   // a name outside the set is refused
  }
  const def = await searchLazy.SearchService.getDefault();
  return engines.find(e => e.id === def?.id) ?? engines[0] ?? null;
}
```

User-installed engines stay visible (they are neither app-provided nor policy), which is also how the live check gets a hermetic engine (Validation).

Frontend: `listSearchEngines` → `{engines: [{name, icon}], defaultName}`; `icon` only when `getIconURL(16)` resolves to a string starting `data:image/`, else `null` (codicon fallback). Fill `browser.defaultSearchEngine`'s `enum: ['', ...names]` and `enumItemLabels` through `PreferenceSchemaService.updateSchemaProperty` after the reply. The placeholder reads the engine actually returned by chrome, never the pref value.

### Pattern 2: `resolveTypedAddress` (one resolve path)

```javascript
// Source: URIFixup.sys.mjs keywordToURI :480-530, UrlbarInput.mjs _maybeCanonizeURL :4081-4120
async function resolveTypedAddress(text, engineName, canonize) {
  const typed = typeof text === "string" ? text.trim().slice(0, 2048) : "";
  if (!typed) throw new Error("resolveTypedAddress: refusing empty text");
  await searchLazy.SearchService.init();  // keyword fixup is empty before init (URIFixup.sys.mjs:498)
  let input = typed;
  if (canonize && /^\s*[^.:\/\s]+(?:\/.*|\s*)$/i.test(typed)) {
    let suffix = Services.locale.urlFixupSuffix;
    if (!suffix.endsWith("/")) suffix += "/";
    const slash = typed.indexOf("/");
    input = slash >= 0 ? typed.slice(0, slash) + suffix + typed.slice(slash + 1) : typed + suffix;
    input = Services.uriFixup.getFixupURIInfo(input, Ci.nsIURIFixup.FIXUP_FLAGS_MAKE_ALTERNATE_URI).fixedURI.spec;
  }
  let info;
  try {
    info = Services.uriFixup.getFixupURIInfo(input,
      Ci.nsIURIFixup.FIXUP_FLAG_FIX_SCHEME_TYPOS | Ci.nsIURIFixup.FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP);
  } catch {
    return { kind: "refused" };
  }
  if (info.keywordProviderId) {
    const engine = await barEngine(engineName);
    if (!engine) return { kind: "no-engine" };
    const sub = engine.getSubmission(info.keywordAsSent);
    if (!sub || sub.postData || !/^https?$/.test(sub.uri.scheme)) return { kind: "refused" };
    return { kind: "search", url: sub.uri.spec, engineName: engine.name };
  }
  const uri = info.preferredURI;
  if (!uri || !/^https?$/.test(uri.scheme)) return { kind: "refused" };   // the wall, on the RESULT
  return { kind: "visit", url: upgradeSchemeless(info, uri).spec };
}
```

Keyword search always goes through the bar's engine, not fixup's own default-engine URL, so one-offs and the setting share one path. `upgradeSchemeless` keeps today's behaviour for bare dotted hosts (`typedAddressTargetOf` minted `https://`): when `info.fixupChangedProtocol` and the host has a dot, no explicit port, is not an IP literal and is not `localhost`/`*.localhost`, return the `https` mutation; everything else keeps fixup's `http://` (fixup adds `http://`, `URIFixup.sys.mjs:970`). **Decided (autonomous, recommended):** HTTPS-First schemeless fallback (passing `schemelessInput` through `webTabNavigate`) is deferred; it would widen two existing kinds for a behaviour today's tree does not have.

Frontend: `commitText` awaits the kind (never the debounced heuristic), so Enter is correct even before the heuristic row arrives. `no-engine` shows the no-search row; `refused` shows the commit-failure row. The heuristic row is computed from the same reply.

### Pattern 3: Suggestions

```javascript
// One controller per Theia frame: fetch() stops the previous request itself.
const suggestControllers = new WeakMap();
async function searchSuggestions(frame, text, engineName) {
  const resolved = await resolveTypedAddress(text, engineName, false);
  if (resolved.kind !== "search") return [];          // URL-shaped text never reaches an engine
  const engine = await barEngine(engineName);
  let ctl = suggestControllers.get(frame);
  if (!ctl) { ctl = new searchLazy.SearchSuggestionController(); suggestControllers.set(frame, ctl); }
  const result = await ctl.fetch({ searchString: text.trim(), inPrivateBrowsing: false, engine,
                                   maxLocalResults: 0, maxRemoteResults: 4 });
  return (result?.remote ?? []).slice(0, 4).map(entry => String(entry.value));
}
```

`frame` is `actorRef.browsingContext.top.embedderElement`. A rejection resolves `null` in the controller (`handleRejection`), so a failure is an empty list (silent, as in Firefox). Frontend sends this kind only when the Theia setting is on, the text is not composing, and the last resolve was `search`; it drops replies by sequence number.

### Pattern 4: Store-kind section and the privileged rule

Add the seven kinds to `STORE_REQUEST_KINDS` (that `new Set([...])` is an existing line block; editing it in place is allowed) and dispatch them from one `case` per kind that calls a function defined in the end-of-file section, so no catalogued line above moves. Reply strings only; every URL leaves as a `String`.

| Kind | Class | Caller (frontend) |
|------|-------|-------------------|
| `listSearchEngines` | read | widget init |
| `resolveTypedAddress` | read | input change, Enter, drop, Paste & Go |
| `searchSuggestions` | read (network) | input change |
| `autofillOrigin` | read | inserting keystroke |
| `placesFavicons` | read | after rows arrive |
| `removeHistoryEntry` | **privileged** | Shift+Delete keydown handler only |
| `readClipboardText` | **privileged** | Paste / Paste & Go menu `run` only |

Gate growth (rule 12 in `verify-web-tab-bridge.mjs`): derive `STORE_REQUEST_KINDS` from the boundary file; require a `STORE_KIND_CLASSES` entry for each (surplus/missing both red); for every `privileged` kind require (a) absent from `TAB_STORE_RELAY_KINDS` (derived from `tab-store-access-protocol.ts`), (b) its `ChromeStoreClient` method is called only from `chrome-bar-widget.tsx`, (c) no `registerCommand`/`registerKeybinding` file references it. Plants: privileged kind added to the relay list; client method called from `chrome-bar-commands.ts`; unclassified store kind. Update the `INTERNAL-APIS.md` privileged-kind rule text in place to cover store kinds.

### Pattern 5: Rows module (pure, testable without a browser)

`address-bar-rows.ts` has no imports. It exports `Row = { key, source: 'heuristic'|'search'|'history'|'bookmark'|'tab', title, caption, url, engineName?, icon? }`, `composeRows(heuristic, engineRows, placeRows)` (1 + ≤4 + ≤5, dedupe by `url` with tab winning, cap 10), `nextHighlight(rows, oneOffs, currentKey, step)` (key-tracked, wraps through one-offs), `isCanonizable(text)`, `autofillSplice(typed, completion)`. `verify-address-bar-rows.mjs` imports the `.ts` file directly: Node 24.19 strips types natively (checked this session: a type-annotated `.ts` module imported from `.mjs` ran under `node v24.19.0`) [VERIFIED: local run]. The widget imports it as `./address-bar-rows` (tsc resolution). Keep `CHROME_SUGGESTION_LIMIT = 8` untouched (pinned by `gui06-chrome-bar-suggestions`); request 5 from the tab/Places service.

### Pattern 6: Token-cookie strip (technical ruling, probe 13)

```javascript
// Phase 29: overlay requests to 127.0.0.1 never carry the Theia token. The
// cookie is host-only 127.0.0.1 and cookies are not port-scoped, so a dev
// server on another port would otherwise receive it. Cookies are attached
// before this topic fires (nsHttpChannel.cpp:713-722, 821-822).
const TOKEN_COOKIE_NAME = "POWERBROWSER_TOKEN";  // = token-gate POWERBROWSER_TOKEN_COOKIE_NAME (gated)
const tokenCookieStrip = {
  observe(subject) {
    const channel = subject.QueryInterface(Ci.nsIHttpChannel);
    if (channel.URI.host !== "127.0.0.1" || !fromOverlayOrForeignWorker(channel)) return;
    let header;
    try { header = channel.getRequestHeader("Cookie"); } catch { return; }
    const kept = header.split(/;\s*/).filter(c => !c.startsWith(`${TOKEN_COOKIE_NAME}=`)).join("; ");
    if (kept !== header) channel.setRequestHeader("Cookie", kept, false);
  },
};
function fromOverlayOrForeignWorker(channel) {
  const top = channel.loadInfo.browsingContext?.top?.embedderElement;
  if (top) return tabIdOfBrowser(top) !== null;          // the Theia frame and chrome keep it
  const p = channel.loadInfo.triggeringPrincipal;         // workers: no browsing context
  return !!p && !p.isSystemPrincipal && p.host === "127.0.0.1" && p.port !== channel.URI.port;
}
let tokenCookieStripInstalled = false;
function installTokenCookieStrip() {
  if (!tokenCookieStripInstalled) {
    tokenCookieStripInstalled = true;
    Services.obs.addObserver(tokenCookieStrip, "http-on-modify-request");
  }
}
```

`probeHealth` (system principal, no browsing context, explicit header) is untouched by the rule. An overlay loading the Theia port itself also loses the cookie, so the IDE cannot be loaded inside a web tab with credentials; that is intended. Call `installTokenCookieStrip()` from `webTabOpen`'s body (an existing-line edit in place is allowed; or from the end-of-file `handleWebTabAction`/store entry, whichever runs first). Clear-data never removes the cookie in this phase because no clear-data kind exists; `PlacesUtils.history.remove` touches Places only.

`verify-token-cookie-strip.mjs` (S): the literal equals `POWERBROWSER_TOKEN_COOKIE_NAME` derived from the token-gate source and the `probeHealth` header; the observer topic is `http-on-modify-request` (not `-before-cookies`); `installTokenCookieStrip` is reachable from `webTabOpen`. Plants: renamed literal, wrong topic, install call removed. The live half is a scenario in `verify-address-bar-live.mjs` (Validation).

### Pattern 7: Suggest hosts in the allowlist (derived, not hand-kept)

Add each `search_engines[i].url` and `search_engines[i].suggest_url` to `manifestEndpointSources` (`generate.mjs:2626-2650`). The existing `theia-endpoints` gate then requires every host in `endpoint-allowlist.json` and goes stale-red when a host changes (`manifest` field). New rows: `lite.duckduckgo.com`, `ac.duckduckgo.com`, `en.wikipedia.org`, each `disposition: "allow"`, `manifest` set, `reason` naming BAR-03/BAR-01. These are not Mozilla hosts, so `allowlist-doc-consistency` (Mozilla allow hosts only, `verify-platform.sh:2675`) is unaffected; still name the hosts in this phase's SUMMARY as the deliberate egress the requirements footer promised.

### Pattern 8: Pill behaviours (Theia frame)

- **Context menu:** `onContextMenu` and Shift+F10/ContextMenu key build a `CompoundMenuNode` with children `{id, label, run, isEnabled}` and call `this.menus.render({ menuPath: PILL_MENU_PATH, menu, anchor, context: input, onHide })` exactly as the history menu does. Cut/Copy enabled only when `selectionStart !== selectionEnd`; Select All when value non-empty; Paste and Paste & Go always enabled (no clipboard probe). Cut = `clipboard.writeText(sel)` then `input.setRangeText('')` and the input-change path. Paste = `readClipboardText` then `setRangeText(text, start, end, 'end')`, refresh suggestions, skip autofill. Paste & Go = `readClipboardText` then `commitText`. Never log or push the text.
- **Select-all on first click:** on `mousedown` record `wasFocused = document.activeElement === input`; on `mouseup`, if `!wasFocused` and the selection is collapsed, `input.select()`.
- **IME:** in `onInputKeyDown` return early when `e.nativeEvent.isComposing || e.keyCode === 229`; in `onInputChange` update the value but skip queries and autofill while `(e.nativeEvent as InputEvent).isComposing`; add `onCompositionEnd` that runs one query.
- **Drafts:** `drafts = new WeakMap<Widget, string>()`. In `onCurrentWidgetChanged`, before re-syncing, store `inputValue` for the previous widget when it differs from `committedAddress`; then set the pill from the new widget's draft (caret at end, dropdown closed, focus unchanged) or its address. The existing focus guard in `syncAddressFromWidget` must not keep the old tab's text on a tab switch. Clear on commit, on the Esc restore step and when the widget is disposed.
- **Autofill:** only when caret at end, no space, not composing, and `inputType` starts with `insert` (not paste). Reply `{text, url}`; set value `typed + rest`, `setSelectionRange(typed.length, value.length)`; remember `autofill = {value, url}`. Enter with `input.value === autofill.value` commits `autofill.url`; Tab collapses the selection and `preventDefault`s only when an autofill selection exists.
- **Switch to tab:** `ChromeBarPlacesSuggestions` marks a backend tab row `source: 'tab'` only when a live `WebTabWidget` has the same `url`; choose it with `shell.activateWidget(widget.id)` then `widget.focusPage()`. Never read `row.uri` in a commit path (the suggestions gate fails on it).
- **Drop on the pill:** reuse `dropKindOf`/`droppedUrlOf` logic and the Phase 27 finding that the handler must `stopPropagation` for accepted drags (Theia's document-level `dragover` forces `dropEffect 'none'`). Links → `resolveTypedAddress`; plain text → `resolveTypedAddress`; load in the current tab.

### Anti-Patterns to Avoid
- **An engine URL, engine host, `?q=` or `search?` anywhere in `theia/extensions/chrome-bar/src/browser`, comments included:** `verify-chrome-bar-suggestions.mjs:394-406` scans raw text.
- **Reading `row.uri` in any commit or switch path:** same gate.
- **A command id or keybinding for Shift+Del, Paste or Paste & Go:** privileged-kind rule.
- **Adding a new store kind to `TAB_STORE_RELAY_KINDS`:** the backend could then delete history or read the clipboard.
- **Calling `navigator.clipboard.readText` or Theia `ClipboardService.readText` from the pill.**
- **Adding lines to the top `defineESModuleGetters` block:** every catalogued line below shifts. Use a second `ChromeUtils.defineESModuleGetters(searchLazy, {...})` in the end-of-file section.
- **Policy `Remove` or `IconURL` in the generator.**

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Address vs search, `localhost`, `host:port`, IPv6, IDN, scheme typos | Regexes in the widget | `Services.uriFixup.getFixupURIInfo` | Dozens of edge cases (`isURILike`, public-suffix checks, `browser.fixup.*` prefs) |
| Search URL building, encoding, `{searchTerms}` | String templating | `engine.getSubmission(terms)` | Charset and param handling per engine |
| Suggestion HTTP, JSON parsing, timeouts, cancel | `fetch()` from the frame | `SearchSuggestionController` | Anonymous request, timeout pref, format handling |
| Ctrl+Enter `www.`/`.com` | Hard-coded ".com" | `Services.locale.urlFixupSuffix` + `FIXUP_FLAGS_MAKE_ALTERNATE_URI` | Locale-correct suffix, Firefox parity |
| History removal | SQL `DELETE` | `PlacesUtils.history.remove` | Triggers, frecency, `moz_origins` cleanup (Pitfall 11) |
| Context menu | A custom React popover | `ContextMenuRenderer` + `.lm-Menu` | Already in `BLOCKING_LAYER_SELECTOR`, keyboard handling |
| Engine list from policy | Parsing `policies.json` in Theia | `listSearchEngines` over SearchService | Gecko owns policy state |

**Key insight:** the frontend decides nothing about what a string means; it renders what chrome resolved.

## Common Pitfalls

### Pitfall 1: Search before `SearchService.init()`
**What goes wrong:** "hello world" throws `NS_ERROR_MALFORMED_URI` instead of searching; suggestions throw "Search not initialized yet".
**Why:** keyword lookup returns an empty info before init (`URIFixup.sys.mjs:498`); the controller checks `isInitialized` (`:296`).
**How to avoid:** every search kind starts with `await searchLazy.SearchService.init()`; never read `defaultEngine` synchronously (throws until init, `SearchService.sys.mjs:156-158`).
**Warning signs:** the first search of a session shows the commit-failure row.

### Pitfall 2: Configured engines silently missing
**What goes wrong:** the bar shows Google, or no engine.
**Why:** `Remove` never runs without a stock window; a policy name equal to an app-provided name is dropped (`duplicate-title`).
**How to avoid:** bar-side filter (Pattern 1) and the collision rule in `verify-search-engines.mjs`; the packaged live check lists engine names.
**Warning signs:** placeholder names an engine that is not in `configuration.toml`.

### Pitfall 3: Policy engines absent in dev runs
**What goes wrong:** live checks against `objdir/dist/bin` see no configured engines.
**Why:** `policies.json` is copied only by `package-linux.sh:63`; the objdir has no `distribution/`.
**How to avoid:** the dev live script adds a user engine chrome-side (`SearchService.addUserEngine({name, url, suggestUrl})`, `UserSearchEngine.sys.mjs:78-109`) pointing at a served page; a separate packaged check (ng-072 pattern, `extractPackage`) asserts the configured set and default.

### Pitfall 4: The native paste popup
**What goes wrong:** Paste & Go shows a small native "Paste" menu that must be clicked, possibly over the page, and BiDi cannot see it.
**Why:** content `navigator.clipboard.readText()` routes through `ClipboardContextMenu.confirmUserPaste`, which creates `clipboardReadPasteMenuPopup` in the chrome document on demand (`ClipboardContextMenu.sys.mjs:172-181`).
**How to avoid:** `readClipboardText` privileged kind; read `kGlobalClipboard` only (never the selection clipboard); cap the returned length (e.g. 8192); never log.

### Pitfall 5: Token credential sent to a dev server
**What goes wrong:** `127.0.0.1:3000` receives `POWERBROWSER_TOKEN`; a hostile local server gains terminal access to the IDE backend.
**Why:** host-only cookie, no port scope; fixup makes such loads routine.
**How to avoid:** Pattern 6 in the same plan as BAR-02; live scenario with a positive control.
**Warning signs:** the served page's request log shows a `Cookie` header with the token.

### Pitfall 6: Privileged store kinds reachable from the backend or a command
**What goes wrong:** an AI tool or extension deletes history or reads the clipboard.
**Why:** `TAB_STORE_RELAY_KINDS` forwards whitelisted kinds from the backend; nothing gates store kinds today.
**How to avoid:** rule 12 (Pattern 4).

### Pitfall 7: Engine strings in Theia source
**What goes wrong:** `gui06-chrome-bar-suggestions` goes red, or a rebrand needs a second file.
**How to avoid:** no engine name, host, or query pattern literal in chrome-bar source (comments included); engine names arrive at runtime.

### Pitfall 8: Catalogue churn
**What goes wrong:** `internals-catalogue` and `ng-040` go red after the boundary edit.
**How to avoid:** end-of-file section; one row per forbidden-pattern line (`Services.`, `Ci.`, `Cc[`, `ChromeUtils.defineESModuleGetters`); re-rule the Places row (`INTERNAL-APIS.md:49`) in place to read-write for `history.remove`; run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` then `bash scripts/check-internals-boundary.sh --catalogue` after every boundary edit. Plans that touch the boundary file are sequential.

### Pitfall 9: Stale suggestion replies reopening the dropdown
**What goes wrong:** a reply that lands after Enter reopens the dropdown over the page.
**Why:** existing failure mode recorded in `runQuery`'s comment (the `dropdownArmed` guard).
**How to avoid:** all new async replies (resolve, suggestions, autofill, favicons) check `dropdownArmed` and the sequence number, like `runQuery`.

### Pitfall 10: Shift+Del on a bookmarked page
**What goes wrong:** a bookmark's history is deleted from a bookmark row.
**How to avoid:** `source` is `bookmark` whenever `PlaceMatch.bookmarked`; Shift+Del is consumed only for `history`; chrome re-checks nothing about the source, so the gate is the frontend `source` plus the live check.

### Pitfall 11: Copy gate drift
**What goes wrong:** `shell-error-copy-no-internals` red on every new string.
**How to avoid:** all new strings in `CHROME_BAR_COPY`; edit `EXPECTED_NAV_COPY` and `EXPECTED_WIDGET_COPY` in the same commit (retire "No suggestions", the old footer, the two brand rows; the placeholder becomes a copy function). Add the widget brand ban with the brand derived from `configuration.toml` `identity.display_name`.

### Pitfall 12: Scheme regression for bare hosts
**What goes wrong:** `example.com` now loads over http.
**Why:** fixup adds `http://` (`URIFixup.sys.mjs:970`); today's rule minted `https://`.
**How to avoid:** `upgradeSchemeless` (Pattern 2).

## Code Examples

### Store client methods (frontend)
```typescript
// chrome-store-client.ts additions; `field` is the existing helper.
resolveTypedAddress(text: string, engineName = '', canonize = false): Promise<ResolvedAddress> {
    return this.field<ResolvedAddress>({ kind: 'resolveTypedAddress', text, engineName, canonize }, 'resolved');
}
searchSuggestions(text: string, engineName = ''): Promise<string[]> {
    return this.field<string[]>({ kind: 'searchSuggestions', text, engineName }, 'rows');
}
removeHistoryEntry(url: string): Promise<boolean> {
    return this.field<boolean>({ kind: 'removeHistoryEntry', url }, 'removed');
}
```

### Autofill query (chrome, read-only)
```javascript
// Same coupling class as searchPlaces: bound parameters, SELECT only.
async function autofillOrigin(text) {
  const typed = typeof text === "string" ? text.toLowerCase() : "";
  if (!typed || typed.length > 253 || /[\s/:?#]/.test(typed)) return null;
  const like = `${typed.replace(/[\\%_]/g, c => "\\" + c)}%`;
  const db = await lazy.PlacesUtils.promiseDBConnection();
  const rows = await db.executeCached(
    `SELECT prefix, host FROM moz_origins
      WHERE (host LIKE :like ESCAPE '\\' OR host LIKE 'www.' || :like ESCAPE '\\')
        AND prefix IN ('http://', 'https://') AND frecency > 0
      ORDER BY frecency DESC LIMIT 1`, { like });
  if (!rows.length) return null;
  const host = rows[0].getResultByName("host");
  const shown = host.startsWith("www.") && !typed.startsWith("www.") ? host.slice(4) : host;
  return { text: `${shown}/`, url: `${rows[0].getResultByName("prefix")}${host}/` };
}
```
`moz_origins` columns `id, prefix, host, frecency, …, UNIQUE (prefix, host)` [VERIFIED: `nsPlacesTables.h:176-189`].

### Favicons (chrome)
```javascript
async function placesFavicons(urls) {
  const out = {};
  for (const url of (Array.isArray(urls) ? urls : []).slice(0, 10)) {
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) continue;
    try {
      const icon = await lazy.PlacesUtils.favicons.getFaviconForPage(Services.io.newURI(url), 16);
      const data = icon?.dataURI?.spec;
      if (data && data.startsWith("data:image/") && data.length <= 65536) out[url] = data;
    } catch { /* no icon: the row shows its codicon */ }
  }
  return out;
}
```
Overlay pages never store a favicon today (`LinkHandlerParent` returns at `getTabForBrowser == null`), so most rows show `codicon-globe` until Phase 32; that is the accepted technical ruling.

### Clipboard read (chrome)
```javascript
// Source: browser.js readFromClipboard :1399-1428, global clipboard only.
function readClipboardText() {
  const trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
  trans.init(null);
  trans.addDataFlavor("text/plain");
  Services.clipboard.getData(trans, Services.clipboard.kGlobalClipboard);
  const data = {};
  trans.getTransferData("text/plain", data);
  return String(data.value?.QueryInterface(Ci.nsISupportsString).data ?? "").slice(0, 8192);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Services.search` | `SearchService` module singleton from `moz-src:///toolkit/components/search/SearchService.sys.mjs` | before 153 (absent from `services.json`, STACK.md) | Import via a `defineESModuleGetters` line |
| `typedAddressTargetOf` regex | URIFixup in chrome | this phase | `localhost:4000` and IPs work |
| Stacked 43px rows, 8-row cap, "No suggestions" row | Single-line 32px rows, 10-row composition, heuristic row always first | this phase (29-UI-SPEC) | Copy pins change |

**Deprecated/outdated:** the `urls.search` manifest key (schema exists, unused, feeds only endpoint hosts) is superseded by `[[search_engines]]`; leave the key alone this phase (removing it is a downstream-breaking schema change) and note it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `SearchService.init()` completes in a shell-only session (Remote Settings dump fallback) | Pattern 1, 2 | No search at all; probe 11 is the first live scenario |
| A2 | `channel.loadInfo.browsingContext.top.embedderElement` is the overlay `<browser>` in the parent for top-level and subresource loads | Pattern 6 | Strip misses requests; the live scenario with a planted-off control proves it |
| A3 | Worker requests carry a 127.0.0.1 triggering principal with the page's port | Pattern 6 | A dev-server worker could still receive the token; live sub-scenario |
| A4 | The DuckDuckGo Lite search URL `https://lite.duckduckgo.com/lite/?q={searchTerms}` works and the two engine choices are acceptable to Chris | Pattern 1 | Product choice only; one-file edit |
| A5 | `getIconURL(16)` for policy engines with no `IconURL` resolves to nothing, and app-provided icons are not `data:` URIs | Pattern 1 | Codicon fallback either way |
| A6 | `Services.clipboard.getData` with `trans.init(null)` reads the global clipboard on KDE Wayland while the shell is focused | Code Examples | Paste & Go failure row; Pitfall 13 notes stale reads when unfocused |
| A7 | `SearchSuggestionController` remote results arrive as entries with `.value` | Pattern 3 | Empty suggestions; live scenario asserts rows |
| A8 | `PlacesUtils.favicons.getFaviconForPage` resolves `null` (not reject) for unknown pages | Code Examples | Caught either way |

## Open Questions (RESOLVED)

1. **Which engines does PowerBrowser ship?** Decided (autonomous, recommended): DuckDuckGo Lite (default) and Wikipedia, defined as policy engines with non-colliding names, no partner codes. Chris may replace them in `configuration.toml`.
2. **Default-engine write kind (29-UI-SPEC) vs privileged rule?** Decided (autonomous, recommended): no write; the engine name rides each request and is validated chrome-side. Record the UI-SPEC narrowing in the plan.
3. **Autofill via provider spike or SQL?** Decided (autonomous, recommended): read-only `moz_origins` SQL; Pitfall 11 bans writes, and `searchPlaces` is the read precedent.
4. **Typing scenario in `verify-endpoints.sh`?** Decided (autonomous, recommended): no; `theia-endpoints` (static, derived) covers allowlist rows and `verify-address-bar-live` proves URL-shaped text contacts no suggest endpoint.
5. **Brand literals outside chrome-bar** (`mode-service.ts`, `web-tab.ts`, `save-page-copy-command.ts`, Pitfall 10): out of BAR-14's "chrome-bar source" scope; list them in the phase SUMMARY as remaining debt.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | static gates, rows test | ✓ | v24.19.0 | — |
| `upstream/` checkout | collision rule, citations | ✓ | `FIREFOX_153_5_0esr_BUILD1` | gate SKIPs the collision leg |
| `objdir/dist/bin/powerbrowser` | live rows | ✓ (present) | last built tree | rebuild via `nix develop .#firefox` |
| `theia/node_modules` (tsc) | `chrome-bar-typecheck` | ✓ | Theia 1.76.0 | `yarn install` in `nix develop .#theia` |
| Packaged tree (`extractPackage`) | configured-engine live check | needs `package-linux.sh` | — | Defer the row to the full gate run |
| Network to engine hosts | none of the automated checks | not required | — | local served engine |

**Missing dependencies with no fallback:** none.

## Validation Architecture

Workflow `nyquist_validation: true` (`.planning/config.json`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Plain-node derive-and-compare scripts + BiDi live scripts on `scripts/lib/pb-live-probe.mjs`; one driver `scripts/verify-platform.sh` |
| Config file | The registry in `scripts/verify-platform.sh` (quick block and live block) |
| Quick run command | `scripts/verify-platform.sh --quick` |
| Full suite command | `scripts/verify-platform.sh` |

Tiers: **S** static gate (`--quick`, with `--self-test`); **D** sidecar DOM check on :4000 (`POWERBROWSER_TOKEN_DISABLE=1`, gsd-browser), DOM-only; **L** live binary with `-purgecaches` (`withProbeShell`), push recorder, chrome-scope evaluate and TIP keys; **P** packaged live (ng-072 pattern).

### Phase Requirements → Test Map
| Req ID | Behavior | Tier | Automated Command | File Exists? |
|--------|----------|------|-------------------|-------------|
| BAR-01 | word + Enter searches the bar engine; no-engine shows the no-search row | L | `node scripts/verify-address-bar-live.mjs --scenario search` | ❌ W0 |
| BAR-02 | `localhost:P`, `127.0.0.1:P`, `[::1]:P`, `localhost` open; `javascript:`/`file:` refused | L | `… --scenario dev-addresses` | ❌ W0 |
| BAR-02 (ruling) | overlay request to 127.0.0.1:P has no token; Theia frame keeps it; plant (observer off) goes red | S + L | `node scripts/verify-token-cookie-strip.mjs` (+ self-test); `… --scenario token-cookie` | ❌ W0 |
| BAR-03 | suggestions from served engine appear; off setting sends none; URL-shaped text sends none (positive control: search-shaped sent ≥ 1) | L | `… --scenario suggestions` | ❌ W0 |
| BAR-03 | every engine host has an allowlist row | S | `scripts/verify-platform.sh --only theia-endpoints` (+ self-test) | ✅ grows |
| BAR-04 | tracked `SearchEngines` == emission; no name collision; fragment fresh | S | `node scripts/verify-search-engines.mjs` (+ self-test); `--only generate-check` | ❌ W0 |
| BAR-04 | packaged build lists configured engines, default = first | P | `node scripts/verify-search-engines-packaged.mjs` | ❌ W0 |
| BAR-04 | setting changes the engine used and the placeholder | L | `… --scenario default-engine` | ❌ W0 |
| BAR-05 | one-off button searches with that engine; default unchanged | L | `… --scenario one-off` | ❌ W0 |
| BAR-06 | open-tab row activates the tab; push recorder shows no `loading: true` for it | L | `… --scenario switch-to-tab` | ❌ W0 |
| BAR-07 | `loc` autofills a visited origin with selection; Tab accepts; Backspace suppresses | L | `… --scenario autofill` | ❌ W0 |
| BAR-08 | Alt+Enter foreground tab; Ctrl/middle-click background tab | L | `… --scenario new-tab-targets` | ❌ W0 |
| BAR-09 | Shift+Del on history row → `PlacesUtils.history.fetch` null; bookmark row unchanged | L | `… --scenario shift-del` | ❌ W0 |
| BAR-09/10 | privileged store kinds classified, not relayed, widget-only callers | S | `--only gui02-web-tab-bridge` (+ self-test) | ✅ grows |
| BAR-10 | menu items and enablement; Paste & Go with chrome-written clipboard navigates | L + D | `… --scenario context-menu` | ❌ W0 |
| BAR-11 | first click selects all; drag keeps selection; IME composition Enter commits nothing (TIP composition) | L + D | `… --scenario select-ime` | ❌ W0 |
| BAR-11 | row icons by source; favicon only as `data:` | S + L | `node scripts/verify-address-bar-rows.mjs` (+ self-test); `… --scenario rows` | ❌ W0 |
| BAR-12 | draft survives tab switch and page navigation; cleared by commit/Esc/close | L | `… --scenario drafts` | ❌ W0 |
| BAR-13 | Ctrl+Enter `name` → `https://www.name.com/` (assert reply, no load); dropped link loads; dropped text searches | L | `… --scenario canonize-drop` | ❌ W0 |
| BAR-14 | no brand literal in chrome-bar copy (brand from manifest); copy pinned | S | `--only shell-error-copy-no-internals` (+ self-test) | ✅ grows |
| BAR-14 | different `applicationName` shows in failure rows | manual/D | sidecar build with a fixture name | — |
| all | chrome-bar and tab-uris compile; boundary rows; brand residue | S | `--only chrome-bar-typecheck`, `--only internals-catalogue`, `--only ng-040-internals-catalogue-lines`, `--only scan-brand-residue` | ✅ |
| all | suggestions gate (engine-host ban, `row.uri` ban, cap 8) still green | S | `--only gui06-chrome-bar-suggestions` | ✅ |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --quick` (stage new files first)
- **Per wave merge:** `--quick` plus `node scripts/verify-address-bar-live.mjs` after a Theia build (and `-purgecaches` for any `powerbrowser/shell/*.js` edit)
- **Phase gate:** full `scripts/verify-platform.sh` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `scripts/verify-address-bar-live.mjs` + `--self-test` (scenarios above; plants: token strip off, suggestions sent for URL-shaped text, Shift+Del on a bookmark row removes it, tab row navigates instead of switching); a served page set with `/search`, `/suggest` request logs
- [ ] `scripts/verify-search-engines.mjs` + `--self-test`
- [ ] `scripts/verify-search-engines-packaged.mjs` (P tier, ng-072 harness)
- [ ] `scripts/verify-token-cookie-strip.mjs` + `--self-test`
- [ ] `scripts/verify-address-bar-rows.mjs` + `--self-test` over `address-bar-rows.ts`
- [ ] `verify-web-tab-bridge.mjs` rule 12 + plants; `verify-shell-error-copy.mjs` widget brand ban + plant
- [ ] Registry rows (one pair each): `search-engines`, `token-cookie-strip`, `address-bar-rows` (quick); `address-bar-live`, `search-engines-packaged` (live)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (token credential) | Strip `POWERBROWSER_TOKEN` from overlay requests (Pattern 6) |
| V3 Session Management | yes | Cookie stays host-only, HttpOnly; never cleared by this phase |
| V4 Access Control | yes | Sender walls (`groupSenderIsTheia`, `storeSenderInShellWindow`); privileged kinds widget-only, not relayed |
| V5 Input Validation | yes | Every kind argument type- and length-checked chrome-side; engine name ∈ bar set; http(s) wall on the resolved URL; `data:image/` only for icons |
| V6 Cryptography | no | — |
| V8 Data Protection | yes | Suggestions anonymous (`LOAD_ANONYMOUS`), never for URL-shaped or composing text; clipboard text never logged or pushed |
| V12 Files/Resources | yes | `file:`, `javascript:`, `chrome:`, `about:` never load from the pill |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Dev server on another loopback port harvests the IDE token | Information disclosure / Elevation | `http-on-modify-request` strip keyed by the overlay browsing context |
| Extension or AI tool calls a privileged kind via command or backend relay | Elevation | Privileged class, no command id, absent from `TAB_STORE_RELAY_KINDS`, gated |
| Typed `javascript:` / `file:` / data URL via fixup or engine template | Tampering | Wall on the result, not the input; GET-only engines; `postData` refused |
| Intranet hostnames or secrets sent to the search engine | Information disclosure | Suggestions only when fixup says keyword; no clipboard suggestion (ruling) |
| Workspace settings file redirects search | Tampering | `browser.defaultSearchEngine` and `browser.searchSuggestions` User scope only; name validated chrome-side |
| Remote favicon fetch as a tracking beacon | Information disclosure | Places cache only, `data:` only |

## Sources

### Primary (HIGH)
- `upstream/` at `FIREFOX_153_5_0esr_BUILD1`: `toolkit/components/search/{SearchService,SearchEngine,SearchSuggestionController,PolicySearchEngine,UserSearchEngine}.sys.mjs`; `docshell/base/{URIFixup.sys.mjs,nsIURIFixup.idl}`; `browser/components/enterprisepolicies/{Policies.sys.mjs,schemas/policies-schema.json}`; `toolkit/components/enterprisepolicies/EnterprisePoliciesParent.sys.mjs`; `browser/components/sessionstore/SessionStore.sys.mjs`; `services/settings/dumps/main/search-config-v2.json`; `netwerk/protocol/http/nsHttpChannel.cpp`; `netwerk/base/nsILoadInfo.idl`; `dom/chrome-webidl/LoadURIOptions.webidl`; `toolkit/modules/ClipboardContextMenu.sys.mjs`; `widget/nsIClipboard.idl`; `browser/base/content/browser.js`; `browser/components/urlbar/content/UrlbarInput.mjs`; `toolkit/components/places/{nsIFaviconService.idl,nsPlacesTables.h}`; `modules/libpref/init/all.js`; `intl/locale/mozILocaleService.idl`
- This tree at `88ad96c`: `PowerBrowserAPI.sys.mjs`, `INTERNAL-APIS.md`, `endpoint-allowlist.json`, `distribution/policies.json`, `configuration.toml`, `scripts/{generate.mjs,lib/config-schema.json,check-internals-boundary.sh,verify-shell-error-copy.mjs,verify-chrome-bar-suggestions.mjs,verify-web-tab-bridge.mjs,verify-webextensions.mjs,verify-theia-endpoints.mjs,verify-ng-072-policies-webextension.mjs,lib/pb-live-probe.mjs}`, chrome-bar and tab-uris sources, token-gate backend
- `theia/node_modules/@theia/*` 1.76.0: `preference-schema-service.d.ts`, `browser-clipboard-service.js`, keybinding registrations (`ctrlcmd+enter` only under `scmFocus` and chat focus; no `alt+enter` or `shift+delete` binding)

### Secondary (MEDIUM)
- `.planning/research/{SUMMARY,STACK,ARCHITECTURE,PITFALLS,FEATURES}.md`; Phase 27 summaries and PATTERNS; 29-UI-SPEC

### Tertiary (LOW)
- DuckDuckGo Lite URL template (A4)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every API read at the pinned tags
- Architecture: HIGH for the kinds, walls, generator path and gates; MEDIUM for the cookie observer's browsing-context attribution (A2, A3)
- Pitfalls: HIGH — each traced to a line in `upstream/` or the tree

**Research date:** 2026-10-21
**Valid until:** the next ESR re-pin or Theia re-pin

## RESEARCH COMPLETE
