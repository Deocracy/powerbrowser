# Stack Research: v1.5 Chrome Bar Firefox Parity

**Domain:** Firefox-toolbar parity for a Theia-hosted chrome bar that drives chrome-owned overlay `<browser>` elements in a non-`browser.xhtml` shell window
**Researched:** 2026-10-20
**Confidence:** HIGH that each named module, method and line exists at the pinned tags; read in `upstream/` (`git describe` = `FIREFOX_153_5_0esr_BUILD1`) and `theia/node_modules/@theia/*` (1.76.0). MEDIUM for runtime behaviour: nothing below was run live. Lines marked **UNVERIFIED** need a live check before a plan relies on them.

Scope: only what the v1.5 features need. The "Already have" list in `chrome-bar-firefox-gap.md` and the Validated sections of `PROJECT.md` are not re-researched.

---

## The one fact that shapes everything

Web tabs are overlay `<xul:browser>` elements that `PowerBrowserAPI.webTabOpen` creates inside `powerbrowser.xhtml` (`PowerBrowserAPI.sys.mjs:3231-3270`, `messagemanagergroup="browsers"`, `remoteType="web"`). Because of that `messagemanagergroup`, **every stock Firefox JSWindowActor already runs for them**: ContextMenu, Prompt, LinkHandler, DOMFullscreen, LoginManager, AutoComplete, Finder, Printing, AudioPlayback, PopupAndRedirectBlocking (`browser/components/DesktopActorRegistry.sys.mjs:416,459,591,717`; `toolkit/modules/ActorManagerParent.sys.mjs:143,156,375,435,508,527`).

Each parent actor then looks for window-level furniture on `browser.documentGlobal`, such as `gBrowser.getTabDialogBox`, `PopupNotifications`, `nsContextMenu` or `FullScreen`. That furniture exists only in `browser.xhtml`. The shell has none, so each feature currently fails in one of three ways: it bails out silently, it throws, or it falls back to a stock window-modal dialog. Most of v1.5 is therefore not new Gecko plumbing. It is **one shim per upstream receiver, installed on the shell window from `PowerBrowserAPI`**, that turns what the actor already sends into a push to Theia and turns Theia's answer back into the callback the actor expects.

No patch-stack change and no Theia core change is needed for any recommended item. WebExtension toolbar actions are the one area where a clean result may need a patch. They are flagged below.

---

## Recommended Stack

### Core Technologies (pinned; no version moves this milestone)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Gecko / Firefox ESR | `FIREFOX_153_5_0esr_BUILD1` (153.5.0) | Every browser capability below | Already pinned and built in v1.4. Every module below was checked at this tag. Moving it now would invalidate the line citations this research rests on. |
| Eclipse Theia | 1.76.0 (`@theia/core`, `@theia/monaco`, `@theia/file-search`, `@theia/workspace` already composed in `theia/applications/browser/package.json`) | Chrome bar UI, menus, dialogs, command centre | Every Theia API needed is in packages already composed. **No new npm dependency.** |
| `PowerBrowserAPI.sys.mjs` (lazy-getter block, line 15) | in tree | The only route to every module below | CLAUDE.md rule 2 / D-96. Each new import is one line in the existing `ChromeUtils.defineESModuleGetters(lazy, {...})` block plus a catalogue row. Each new `Services.*`/`Ci.*`/`Cc[...]` line gets a row, and `verify-ng-040-internals-catalogue-lines.mjs --fix` renumbers rows after edits. |
| Group actor channel (`handleGroupMutation`, `PowerBrowserAPI.sys.mjs:2323-2545`; push `webTabPush`, `:3385`) | in tree | Theia → chrome requests and chrome → Theia pushes | All new kinds go beside the existing `webTab*` cases behind `webTabIdIsValid` and `groupSenderIsTheia`. `verify-web-tab-bridge.mjs` and the `WebTabMessage` union (`web-tab.ts:159-167`) grow in the same commit. |

### Gecko modules, by feature (all consumed only from `PowerBrowserAPI`)

#### Search, fallback, fixup, suggestions, engines

| Module / service | Path in `upstream/` | How it is consumed at 153.5 | Notes |
|---|---|---|---|
| **SearchService** (module singleton) | `toolkit/components/search/SearchService.sys.mjs:95` (`export const SearchService`) | `lazy.SearchService` from `"moz-src:///toolkit/components/search/SearchService.sys.mjs"` (same URL `UrlbarUtils.sys.mjs:38` and `URIFixup.sys.mjs:24` use). Methods: `init()` :529, `getDefault()` :179, `setDefault(engine, reason)` :193, `getVisibleEngines()` :445, `getEngineByAlias()` :412, `getEngineByName()` :367. Engine: `getSubmission(terms)` → `{uri, postData}` (`SearchEngine.sys.mjs:1347`), `getIconURL(width)` :1576 (async), `alias`/`aliases`/`name`/`id`. | **`Services.search` does not exist at 153.** It is absent from the JS Services table (`tools/lint/eslint/eslint-plugin-mozilla/lib/services.json`). The gap list's "over Services.search" must read "over SearchService.sys.mjs". **Init is lazy and nothing in a shell-only session triggers it.** Only `browser.xhtml` consumers call `SearchService.init()` (`UrlbarSearchUtils.sys.mjs:327`, `searchbar.js:142`). The sync getters `defaultEngine`/`defaultPrivateEngine` throw until init (`:150-158`). Use the async API, or `await SearchService.init()` once on the first search kind. |
| **URIFixup** | `docshell/base/URIFixup.sys.mjs`, IDL `docshell/base/nsIURIFixup.idl:127` | `Services.uriFixup.getFixupURIInfo(text, FIXUP_FLAG_FIX_SCHEME_TYPOS \| FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP)` → `preferredURI`, `keywordProviderId`, `keywordAsSent`, `postData`, `fixupCreatedAlternateURI` (IDL :31-78) | Replaces the hand-rolled `typedAddressTargetOf` (`chrome-bar-widget.tsx:49-57`). That function cannot open `localhost:4000` because it requires a `.`. Fixup handles host:port, localhost, single words with `browser.fixup.dns_first_for_single_words`, and keyword search in one call. Keyword lookup silently returns no keyword while `SearchService.hasSuccessfullyInitialized` is false (`URIFixup.sys.mjs:498`), which is a second reason to init search first. |
| **SearchSuggestionController** | `toolkit/components/search/SearchSuggestionController.sys.mjs:216` | `new lazy.SearchSuggestionController()`, then `.fetch({searchString, inPrivateBrowsing, engine, maxLocalResults, maxRemoteResults})` :274 returns `{local, remote}`. `.stop()` :381 cancels. | `inPrivateBrowsing` is mandatory, otherwise it throws (:300-304). It requires SearchService to be initialised (:296). It honours `browser.search.suggest.enabled` (:23). It is used directly rather than through the urlbar provider; see "Alternatives". |
| **Search defaults from `configuration.toml`** | `browser/components/enterprisepolicies/Policies.sys.mjs:3074` (`SearchEngines`), `:3191` (`SearchSuggestEnabled`) | Generator writes them into the `distribution/policies.json` that EXT-03 already emits | This is the rebrand-safe route for "default search" in the planned `[urls]` section. It needs no runtime pref writes and no new generator surface type. |
| **Places keywords** | `toolkit/components/places/PlacesUtils.sys.mjs:2411` (`keywords.fetch` :2434) | `lazy.PlacesUtils.keywords.fetch(word)` | Bookmark keywords row. |

#### Places writes (bookmarks, history removal, input history, toolbar)

| Module | Path | Consumption | Notes |
|---|---|---|---|
| **PlacesUtils.bookmarks** | `toolkit/components/places/Bookmarks.sys.mjs` | `insert(info)` :230, `update(info)` :687, `remove(guid)` :1265, `fetch` :1510, `search` :1857. Roots: `toolbarGuid`/`menuGuid`/`unfiledGuid` :123-125 | `lazy.PlacesUtils` is already imported (`PowerBrowserAPI.sys.mjs:37`), so **no new import**. Re-rule the read-only Places row (`INTERNAL-APIS.md:36`) once. |
| **PlacesUtils.history** | `toolkit/components/places/History.sys.mjs` | `remove(urls)` :340, `removeByFilter` :516, `removeVisitsByFilter` :429 | Backs Shift+Del row removal. |
| **PlacesObservers** | `PlacesUtils.observers` (`PlacesUtils.sys.mjs:464`) | `addListener(["bookmark-added","bookmark-removed","bookmark-moved","page-removed"], fn)` | This is the live refresh push for the star state and the bookmarks toolbar. Remove the listener on shell unload (same discipline as `startTabStoreTriggers`). |
| **UrlbarUtils.addToInputHistory** | `browser/components/urlbar/UrlbarUtils.sys.mjs:1073` | `lazy.UrlbarUtils.addToInputHistory(url, typed)` | Writes `moz_inputhistory`, the ranking signal behind "Ranking by input history". The function is stateless and needs no window. |
| **PlacesTransactions** (optional) | `toolkit/components/places/PlacesTransactions.sys.mjs` | `NewBookmark(...).transact()` | Use it only if bookmark undo is in scope. Otherwise use `bookmarks.insert`. |

#### Site identity, permissions, site data, tracking protection

| Module | Path | Consumption | Notes |
|---|---|---|---|
| **Security state** | `netwerk/base/nsISecureBrowserUI.idl:13-15` | `overlay.securityUI.state` / `.isSecureContext` / `.secInfo` (`browser-custom-element.mjs:797`). Event: add `Ci.nsIWebProgress.NOTIFY_SECURITY` (0x40, `uriloader/base/nsIWebProgress.idl:94`) to the existing listener mask (`PowerBrowserAPI.sys.mjs:3343`) and implement `onSecurityChange` | Decode with the `STATE_IS_SECURE`/`STATE_IS_BROKEN`/`STATE_IS_INSECURE`/`STATE_IDENTITY_EV_TOPLEVEL`/`STATE_LOADED_MIXED_*` flags the same way `browser/base/content/browser-siteIdentity.js:77-127` does. Push a small enum, not the bitfield. The cert chain from `secInfo.serverCert` is rendered in Theia, which keeps the scheme wall unchanged. |
| **Tracking-protection events** | same listener | Add `NOTIFY_CONTENT_BLOCKING` (0x200, `nsIWebProgress.idl:97`), implement `onContentBlockingEvent`. Log: `overlay.getContentBlockingLog()` (`browser-custom-element.mjs:1889`) | This is the shield-icon state. |
| **ContentBlockingAllowList** | `toolkit/components/antitracking/ContentBlockingAllowList.sys.mjs` (**not** `browser/`) | `canHandle(browser)` :68, `add` :75, `remove` :93, `includes` :103 | Per-site ETP exception. |
| **SitePermissions** | `browser/modules/SitePermissions.sys.mjs` | `getAllForBrowser(browser)` :237, `getAllPermissionDetailsForBrowser` :281, `setForPrincipal` :543, `removeFromPrincipal` :631, `getPermissionLabel` :699, `listPermissions` :326 | Permissions panel and identity-box icons. It is browser-scoped, so it works on an overlay. |
| **SiteDataManager** | `browser/modules/SiteDataManager.sys.mjs` | `remove(hosts)` :528, `hasSiteData` :330, `getBaseDomainFromHost` :79 | Clear cookies and site data. Skip `promptSiteDataRemoval` (:580) and confirm in Theia instead, because it opens a window-modal dialog. |
| **eTLD / IDN** | `Services.eTLD` (services.json), `Cc["@mozilla.org/network/idn-service;1"]` `domainToDisplay` (`netwerk/dns/nsIIDNService.idl:55`) | Fields in the wider state push | Domain highlighting and punycode display. |

#### Page tools

| Feature | Module / API | Path | Notes |
|---|---|---|---|
| Find in page | **FinderParent** via `overlay.finder` | getter `browser-custom-element.mjs:581-596`. Class `toolkit/modules/FinderParent.sys.mjs` (**not** `toolkit/actors/`): `fastFind` :408, `findAgain` :417, `highlight` :426, `requestMatchesCount` :447, `addResultListener` :50, `removeSelection` :560, `onFindbarOpen/Close` :587/:582 | The child actor `Finder` is registered toolkit-wide (`ActorManagerParent.sys.mjs:375`). Results and match counts come back through a result listener and become a push. The Theia find bar shrinks the page rect (the gap list exception). |
| Zoom | `overlay.fullZoom` setter/getter | `browser-custom-element.mjs:725-745`. Steps come from pref `toolkit.zoomManager.zoomValues` (`modules/libpref/init/all.js:3035`) | Per-site memory uses `Cc["@mozilla.org/content-pref/service;1"]` (nsIContentPrefService2) under the name `browser.content.full-zoom`, the same key `browser/components/tabbrowser/content/browser-fullZoom.js:10,52` uses, so zoom levels are shared with stock windows. **Do not load `browser-fullZoom.js`.** It is a `gBrowser` chrome script. |
| Print | printsettings-service + printdialog-service + `BrowsingContext.print(settings)` | `toolkit/components/printing/content/printUtils.js:262-337` (the `PREFER_SYSTEM_DIALOG` branch), services at :105/:118 | `PrintUtils` is a chrome *script* whose default path is tab-modal preview through `gBrowser.getTabDialogBox` (:132-137). Reproduce only the system-dialog branch in `PowerBrowserAPI`. **`window.print()` from page content** goes through `nsIBrowserDOMWindow.OPEN_PRINT_BROWSER` (`dom/interfaces/base/nsIBrowserDOMWindow.idl:74`, `nsWindowWatcher.cpp:2595`), so it depends on the browserDOMWindow shim below. |
| Mute / audio | `overlay.mute()`/`unmute()`/`audioMuted` | `browser-custom-element.mjs:1030-1043`, `:785`. Events `DOMAudioPlaybackStarted/Stopped` are dispatched on the browser element (:992-998) by the toolkit `AudioPlayback` actor (`ActorManagerParent.sys.mjs:143`) | Listen on the overlay element, exactly as the existing `pagetitlechanged` listener does (`PowerBrowserAPI.sys.mjs:3357`). |
| Stop / hard reload / history menu | `overlay.stop()` :896, `reloadWithFlags(flags)` :892, `gotoIndex(i)` :925, `sessionHistory` :648 | `browser-custom-element.mjs` | Stop and hard reload use existing internals. Hard reload adds a `Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE` row. |
| Favicons | `LinkHandlerParent` already runs for overlays; `PlacesUtils.favicons.getFaviconForPage` (`nsIFaviconService.idl:137`) | `browser/actors/LinkHandlerParent.sys.mjs:163-263` | **Overlays get no favicon at all today, not even in Places.** `setIconFromLink` returns at :177 because the shell's `gBrowser.getTabForBrowser` returns `null` (`powerbrowser.js:84-86`), so `setFaviconForPage` (:240) never runs either. Recommended fix: `getTabForBrowser` returns the `{linkedBrowser}` record that `webTabOpen` already pushes (`PowerBrowserAPI.sys.mjs:3290`), plus `ownerDocument` for the multi-image canvas path (:183). `setIcon(tab, iconURL)` then forwards a favicon push. That record is a real overlay record, not a fabricated tab, but it does change the stand-in contract stated at `powerbrowser.js:73-76`. `verify-shell-gbrowser-standin.mjs` must re-derive it. This is a recorded decision, not an implementation detail. |
| Downloads | **Downloads** | `toolkit/components/downloads/Downloads.sys.mjs:153` `getList(Downloads.ALL)`, `DownloadList.addView/removeView` (`DownloadList.sys.mjs:247/269`). Download: `start` :378, `cancel` :971, `showContainingDirectory` :932, `launch` :905 (`DownloadCore.sys.mjs`) | **UNVERIFIED:** what an overlay-initiated download does today. `DownloadsCommon` opens its panel in the most recent `navigator:browser` window, and a shell-only session may have none. Run a live check before designing the panel. |
| Fullscreen (page) | `DOMFullscreenParent` needs `window.FullScreen` | `browser/actors/DOMFullscreenParent.sys.mjs:38,131-166` calls `window.FullScreen.enterDomFullscreen/cleanupDomFullscreen` and `window.windowUtils.remoteFrameFullscreenChanged` | Shim `FullScreen` on the shell window. Window fullscreen (F11) is `window.fullScreen` plus a push so Theia collapses the top panel. |
| Edit commands to the page | `document.commandDispatcher.getControllerForCommand(cmd).doCommand(cmd)` with the overlay focused | (XUL command dispatcher) | **UNVERIFIED:** `goDoCommand` lives in `globalOverlay.js`, which the shell does not load. Use the dispatcher directly. |

#### Page prompts and shell furniture

| Receiver upstream expects | Who reads it | Current outcome in the shell (from source) | What to build |
|---|---|---|---|
| `window.PopupNotifications` (`toolkit/modules/PopupNotifications.sys.mjs:266`, `show` :634) | `PermissionUI` (`browser/modules/PermissionUI.sys.mjs:533-536, 616-617, 676-730`), via `browser/components/permissions/ContentPermissionPrompt.sys.mjs` | `if (!chromeWin.PopupNotifications) { this.cancel(); }`, so geolocation, notifications, storage-access, persistent-storage and MIDI are **silently denied** | A `PopupNotifications`-shaped stand-in on the shell window. `show(browser, id, message, anchorId, mainAction, secondaryActions, options)` pushes a doorhanger record to Theia, keeps the action callbacks chrome-side keyed by an id, and runs the chosen one on a `doorhangerAction` kind (including `options.eventCallback` topics). **Do not instantiate the real `PopupNotifications`.** Its constructor needs a tabbrowser, a XUL panel and an icon box. |
| Same, plus chrome DOM ids `password-notification-username/-password` | `LoginManagerPrompter` (`toolkit/components/passwordmgr/LoginManagerPrompter.sys.mjs:54-55, 142, 241-312, 583`) reaches `documentGlobal.wrappedJSObject.PopupNotifications` and reads and writes those inputs | Password save/update never shows | The shim alone is not enough. The prompter reads the username and password back from DOM elements in the chrome document. Either add hidden inputs with those ids to `powerbrowser.xhtml` and sync them from Theia, or defer. **XL, and needs phase research.** |
| Same, plus `webRTC-*` DOM | `browser/actors/WebRTCParent.sys.mjs:771-897, 1367` | Camera/mic/screen prompts cannot render | Same DOM coupling as passwords. Defer device pickers, or treat them as a separate research phase. |
| `gBrowser.getTabDialogBox` | `browser/actors/PromptParent.sys.mjs:222` | Absent, so it **falls back to a window-modal stock `commonDialog` window** (`:292-306`, `Services.ww.openWindow(..., "modal")`). alert/confirm/prompt, beforeunload and HTTP auth probably already appear as separate OS dialogs. **UNVERIFIED, live check first** (the gap list says the same). | Keep the stock window-modal fallback for v1.5, because it is stock Gecko UI and needs no code. A Theia relay would need a fake `TabDialogBox`, a large and fragile surface. The Theia frame's own `beforeunload` (dirty editors) also uses this path, so any relay must exclude the Theia frame. |
| `window.nsContextMenu` + `#contentAreaContextMenu` | `browser/actors/ContextMenuParent.sys.mjs:22-46, 160-256` | `win.nsContextMenu` is absent, so it falls back to `docShell.chromeEventHandler`'s window and then dereferences `.nsContextMenu.contentData`. **Right-click in a web tab throws in the parent today.** | A plain `nsContextMenu = {contentData: null}` object, plus a `<menupopup id="contentAreaContextMenu">` in `powerbrowser.xhtml` whose `popupshowing` handler calls `preventDefault()` and forwards `contentData.context` (link, image, selection, editable flags) to Theia. Hold `contentData.actor`/`.browser` chrome-side for the follow-up action kinds. The ContextMenu actor has no `messageManagerGroups` restriction (`DesktopActorRegistry.sys.mjs:416-429`), so it also fires for the **Theia frame**. Ignore that browser in the shim. |
| `window.browserDOMWindow` (nsIBrowserDOMWindow, `dom/interfaces/base/nsIBrowserDOMWindow.idl:43-202`, chrome attribute `dom/webidl/Window.webidl:757`) | `nsWindowWatcher` / `ContentParent::CommonCreateWindow` for `target=_blank`, `window.open`, `OPEN_PRINT_BROWSER` | Absent, so every page `window.open` opens a stock window (the GUI-01 mechanism, CLAUDE.md rule 5) | A PowerBrowserAPI object QI'd to `nsIBrowserDOMWindow` (Firefox's own is `browser/modules/BrowserDOMWindow.sys.mjs:43`; read it as the reference, but do not reuse it, because it drives `win.gBrowser`). `createContentWindowInFrame` must **synchronously return a new overlay** with `b.openWindowInfo = params.openWindowInfo` set before insertion (the same order as `tabbrowser.js:2801`), then push a chrome-initiated "tab created" so Theia builds the widget. That reverses today's Theia-mints-the-tabId flow. **Two consequences:** (1) the Theia frame's own `window.open` fallback in `browser-window-command.ts:184` would land in this shim too. It must special-case `params.openerBrowser === theiaFrame` or switch that command to `openBrowserWindow` over the actor, and CLAUDE.md rule 5's wording changes. (2) Print-from-page needs the `OPEN_PRINT_BROWSER` branch. |
| `nsIXULBrowserWindow` on the app window | `xpfe/appshell/nsIXULBrowserWindow.idl:33-42` (`setOverLink`, `showTooltip`, `hideTooltip`); set via `treeOwner…getInterface(Ci.nsIAppWindow).XULBrowserWindow` (`nsIAppWindow.idl:123`; Firefox does it at `browser-init.js:258`) | Absent, so there is no link-hover status and **no page tooltips** for remote browsers | One shim object that pushes link-hover and tooltip events. Theia renders the tooltip with `HoverService`. |
| `browser.autoCompletePopup` → element named by the `autocompletepopup` attribute | `toolkit/actors/AutoCompleteParent.sys.mjs:224, 371`; getter `browser-custom-element.mjs:491-492` | The attribute was deliberately not set (`PowerBrowserAPI.sys.mjs:3248-3251`), so form history and login autocomplete have no popup | Add the stock `<panel is="autocomplete-richlistbox-popup" type="autocomplete-richlistbox" id="PopupAutoComplete" …>` (markup at `browser/base/content/main-popupset.inc.xhtml:173-182`) to `powerbrowser.xhtml` and set `autocompletepopup` on each overlay. It is a top-level XUL popup, so it paints above the Theia frame with no occlusion work. This is the one place a stock Gecko widget is better than a Theia relay: AutoCompleteParent drives the richlistbox directly. |
| `window.FullScreen` | DOMFullscreenParent (above) | Page fullscreen requests fail | Shim. |

#### Extensions

| Module | Path | Consumption | Notes |
|---|---|---|---|
| **AddonManager** | `toolkit/mozapps/extensions/AddonManager.sys.mjs:3036` `getAddonsByTypes(["extension"])` | Puzzle-menu list | Read-only. |
| **browserAction state** | `ExtensionParent.apiManager.global.browserActionFor(extension)` (`toolkit/components/extensions/ExtensionParent.sys.mjs:2493-2500`; stock consumer `browser/base/content/browser-addons.js:2918`). Action data: `ExtensionActions.sys.mjs` `getProperty(target, prop)` :130, `getContextData` :112, `getIcon` :146 | Title, icon, badge and enabled state for the toolbar buttons | `browserActionFor` is published by `ext-browserAction.js:1132` only after the API module has loaded. |
| **Popup host** | Reference: `browser/components/extensions/ExtensionPopups.sys.mjs:300-412` (`messagemanagergroup="webext-browsers"`, `webextension-view-type="popup"`, `initialBrowsingContextGroupId`, `remoteType = extension.remoteType`, load with `triggeringPrincipal: extension.principal`) | A chrome-owned overlay browser positioned like a web tab | Feasible, but it adds a principal Theia cannot choose (the extension's). |
| **Hard limit** | `toolkit/components/extensions/parent/ext-tabs-base.js:1739-1742` (`isBrowserWindow` checks `windowtype === "navigator:browser"`); `browser/components/extensions/parent/ext-browser.js:747-778` | The shell is `powerbrowser:main`, so overlays are `tabId: -1` to every extension, and `browserAction.onClicked` needs a real tab (`ext-browserAction.js:1011`, `tabManager.convert(tab)`) | Popup-type actions can work in the shell. `onClicked`-only actions, `tabs.*` on web tabs, and per-tab badges cannot without a tab-tracker hook, which is a patch-stack change. **Recommend:** v1.5 ships the puzzle menu, the button state and popup-type actions. `onClicked` actions open in the stock window. A full tab-tracker integration is a `[patch?]` research flag. Changing the shell's `windowtype` is not an option: `startTabStoreTriggers`, `openStockTab` and `findStockTabBrowser` all key on `navigator:browser`. |

#### App menu, stock pages, history clearing

| Item | Path | Notes |
|---|---|---|
| Settings / Add-ons / Passwords | `browser/components/about/AboutRedirector.cpp:125` (`preferences`, not `URI_SAFE_FOR_UNTRUSTED_CONTENT`) | `openStockTab` loads through `gBrowser.addWebTab`, which mints a null principal, so **about:preferences cannot load that way**. Call the stock window's own entry points instead: `openPreferences()` (`browser/base/content/utilityOverlay.js:381`) or `BrowserAddonUI.openAddonsMgr` (`browser-addons.js:1956`). `gBrowser.addTrustedTab` (`tabbrowser.js:3255`) is the alternative. Settle the `openStockTab` allow-list (`PowerBrowserAPI.sys.mjs:1107-1110`) once, as one named list. |
| Clear history | `browser/modules/Sanitizer.sys.mjs:314` `sanitize(items, {range})`, `getClearRange` :250, `TIMESPAN_*` :75-93 | Call `sanitize` directly from a Theia dialog. `showUI` (:124) wants `parentWindow.gDialogBox`, which the shell lacks. Clear the `tabs.sqlite` closed rows through the single writer in the same kind. |
| Quit | existing `quitApplication` (`INTERNAL-APIS.md` rows at `:702-713`) | No new internals. |

### Theia 1.76 APIs (all already in composed packages)

| API | Package / file | Use | Why |
|---|---|---|---|
| **`QuickInputService.open(filter)`** | `@theia/core/lib/common/quick-pick-service.d.ts:254`; impl `@theia/monaco/lib/browser/monaco-quick-input-service.js:106-108, 316-318` (`quickAccess.show(filter)`) | **Command-centre mode.** In that mode the pill hands its text, prefix included, to `open()` | `open()` routes through monaco's quick-access registry, so every prefix works: `''` files (`@theia/file-search` `QuickFileOpenService.PREFIX`), `>` commands (`quick-command-service.js:50`), `@` symbols, `:` line, `#` workspace symbols, `?` help, `view `, `task `, `term `, `debug `, `edt `. `.quick-input-widget` is already in the occlusion list (`web-tab.ts:99`). |
| `QuickAccessRegistry` | `@theia/core/lib/browser/quick-input/quick-access.d.ts` | **Not** for inline rendering of command-centre picks | `MonacoQuickAccessRegistry.getQuickAccessProvider(prefix)` returns only Theia-registered descriptors (`monaco-quick-access-registry.js`, `.theiaDescriptor`). `@` is registered monaco-natively (`monaco-gotosymbol-quick-access.js:47-49`) and `:` likewise, so inline `getPicks` would return nothing for them. Use it only to register *new* providers, for example a Bookmarks, History or Tabs provider with its own prefix, if those modes should also be reachable from the palette. |
| `ContextMenuRenderer.render({menuPath, anchor, context, menu?})` | `@theia/core/lib/browser/context-menu-renderer.d.ts:30-45` | App menu, back/forward history menu, page context menu, tab context menu, engine picker, modes dropdown | The pattern already exists at `layout-controls-widget.tsx:81-89`. The optional `menu` (a `CompoundMenuNode`) lets the page context menu be built per `contentData.context` without static registration. `.lm-Menu` is already in the occlusion list. |
| `MenuModelRegistry` + `MenuPath` | `@theia/core` | Static menus: the hamburger menu, Help, Bookmarks | Stock. |
| `AbstractDialog` / `ConfirmDialog` / `SingleTextInputDialog` | `@theia/core/lib/browser/dialogs.d.ts:50,104,137` | Doorhanger fallback, clear-history dialog, bookmark name edit, delete confirmations | `.lm-Widget.dialogOverlay` is already in the occlusion list. |
| `HoverService` | `@theia/core/lib/browser/hover-service.d.ts` | Page tooltips (from the XULBrowserWindow shim), button tooltips with shortcut text | Stock. |
| `ContextKeyService.createKey` | `@theia/core/lib/browser/context-key-service.d.ts:30,72` | when-clauses such as `powerbrowser.webTabActive` and `powerbrowser.addressMode` | Needed to scope Ctrl+F, F5, Ctrl+W and Ctrl+P away from Theia's own bindings (see below). |
| `KeybindingRegistry` | `@theia/core` (`chrome-bar-keybindings.ts` pattern) | Theia-focused half of each shortcut | Stock. |

**Theia browser-mode bindings that clash** (Theia runs as a browser app, so `isElectron()` is false): `ctrlcmd+f` find (`common-frontend-contribution.js:788`, `terminal-frontend-contribution.js:826`), `alt+w` close (:808), `ctrlcmd+p` quick file open (`quick-file-open-contribution.js:46`, which clashes with print), `ctrlcmd+o` workspace symbols (`workspace-symbol-command.js:60`), `alt+shift+t` reopen editor (`editor-keybinding.js:40`), `f5` debug (`debug-frontend-application-contribution.js:677`). Every web-tab shortcut needs a `when` on `powerbrowser.webTabActive`.

### Development tools (existing gates that must grow, not new tools)

| Tool | Purpose | Notes |
|---|---|---|
| `scripts/check-internals-boundary.sh --catalogue` | Every new forbidden-pattern line has an `INTERNAL-APIS.md` row | `moz-src:` and `resource://` imports go in the one `defineESModuleGetters` block. `lazy.X.method()` calls match no pattern, but by convention each import line still gets a row (see `:27-37`). |
| `scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` | Renumbers rows after edits | Expect many rows this milestone. Run it on every PowerBrowserAPI edit. |
| `scripts/verify-shell-gbrowser-standin.mjs` | Derives the upstream `gBrowser` member set and compares | **Clone this pattern for each new shim** (`nsContextMenu`, `PopupNotifications`, `FullScreen`, `browserDOMWindow`, `XULBrowserWindow`): derive the members upstream calls on each receiver at the pinned tag and compare as set equality, so an ESR rebase that adds a call goes red by name (CLAUDE.md, Verification rule 2). |
| `scripts/verify-web-tab-bridge.mjs` | Bridge kind set | Grows with every new `webTab*` kind. |
| `scripts/verify-endpoints.sh` + `powerbrowser/endpoint-allowlist.json` | D-85 runtime host allow-list | **Search suggestions contact the engine's suggest host.** It is not in the allow-list, and `www.google.com` is allowed only for a GMP redirect. Either add rows for the configured default engine's suggest host, or keep the live endpoint scenario from typing into the pill. Region lookup is denied (`location.services.mozilla.com`), so the default engine is the locale default unless `configuration.toml` sets one. |
| `objdir/dist/bin/powerbrowser -purgecaches` | Chrome JS startup cache | Edits to `powerbrowser/shell/*.js` silently do not run without it (project memory). Every shim lives in that tree. |

## Installation

```bash
# Nothing to install. No new npm package, no new Gecko patch, no flake change.
# Every module above is already in the pinned Gecko build; every Theia API is in
# @theia/core / @theia/monaco / @theia/file-search, already composed.
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| SearchService + SearchSuggestionController + URIFixup called directly | One headless `urlbarQuery` kind over `ProvidersManager.getInstanceForSap("urlbar").startQuery(ctx, null)` (`UrlbarProvidersManager.sys.mjs:315, 426`; `UrlbarQueryContext` is `UrlbarUtils.sys.mjs:3126`) | **Do not use it as the general engine.** The `controller = null` signature is legal, but `UrlbarProviderSearchSuggestions` dereferences `controller.browserWindow` (`:299`), so suggestions die, and quick actions call `controller.browserWindow.gBrowser` (`ActionsProviderQuickActions.sys.mjs:122`). It also drags in QuickSuggest, Merino, AI and telemetry providers. **Possible narrow use:** `queryContext.providers = ["UrlbarProviderAutofill"]` for inline autofill, because Autofill's `startQuery` does not touch the controller (its only controller use is `onEngagement`, `:538`). That avoids writing a second set of raw `moz_origins` SQL beside `searchPlaces`, whose Places-schema coupling `INTERNAL-APIS.md:36` already warns about. Spike it before committing (MEDIUM). |
| Window-modal stock `commonDialog` for alert/confirm/auth (current fallback) | A Theia relay through a fake `gBrowser.getTabDialogBox` | Only if the live check shows the window-modal dialog is unusable (for example, it hides behind the shell on KDE Wayland). |
| Stock `PopupAutoComplete` panel in `powerbrowser.xhtml` | A Theia-rendered autocomplete list fed by a fake popup object | Never. AutoCompleteParent drives the richlistbox element directly. |
| `QuickInputService.open()` for command-centre mode | Rendering command-centre picks inline in the pill dropdown from `QuickAccessRegistry` | Never for v1.5. It misses `@` and `:` and duplicates stock keyboard handling. |
| System print dialog (`printdialog-service` + `BrowsingContext.print`) | Firefox's tab-modal print preview (`PrintUtils._openTabModalPrint`) | Never. It needs `gBrowser.getTabDialogBox` and the preview UI in `browser.xhtml`. |
| Puzzle menu + popup-type actions in the shell; `onClicked` actions in the stock window | Full WebExtension tab integration for overlays | A later milestone, with a patch giving `ext-browser.js`'s TabTracker a foreign-tab-host hook. |
| Per-site zoom through ContentPrefService2 under `browser.content.full-zoom` | A Theia preference for zoom | Never. The shared key keeps stock windows and web tabs consistent. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `Services.search` | Does not exist at 153.5 (absent from `services.json`) | `lazy.SearchService` from `moz-src:///toolkit/components/search/SearchService.sys.mjs` |
| Loading `browser.js`, `browser-fullZoom.js`, `printUtils.js`, `browser-places.js` or `browser-siteIdentity.js` into the shell | They are `gBrowser`/`browser.xhtml` chrome scripts. Loading them would make the shell a second Firefox chrome, and their DOM lookups would fail | The underlying modules (FinderParent, ContentPrefService2, print services, PlacesUtils, `securityUI`) called from PowerBrowserAPI |
| A real `new PopupNotifications(...)` on the shell | Needs a tabbrowser, a XUL panel and an icon box, which is custom chrome in the shell | A `PopupNotifications`-shaped relay object |
| `BrowserDOMWindow.sys.mjs` as the shell's browserDOMWindow | Drives `win.gBrowser.addTab`, `selectedBrowser` and `fixupAndLoadURIString` on a tabbrowser the shell lacks | A PowerBrowserAPI implementation that creates overlays |
| Changing the shell's `windowtype` to `navigator:browser` | Would make the shell match every stock-window enumeration (tab-store triggers, `openStockTab`, `findStockTabBrowser`, extensions, DownloadsCommon) and break all of them | Stay `powerbrowser:main`; route stock-only features to a stock window |
| Shims defined in `powerbrowser.js` that touch internals | `generateQI`, `Ci.*` and actor access outside the boundary fail the guard. Only the `window.gBrowser = {` definition line is exempt | One `PowerBrowserAPI.installShellFurniture(window)` called once from `powerbrowser.js` |
| `UrlbarInput`, `UrlbarView`, `UrlbarController` or the `ActionsProvider*` quick actions | Window-bound (`controller.browserWindow`) | Theia Actions mode built from `CommandRegistry` commands |
| Editing `upstream/` or a Theia package | CLAUDE.md rules 1 and 2 | Shims and extensions |
| Custom chrome in the stock browser window | CLAUDE.md rule 5 / Milestone 2 boundary | The stock window stays stock; only its existing entry points (`openPreferences`, `openAddonsMgr`) are called |
| A second Places writer path (for example, Theia's backend `better-sqlite3` writing `places.sqlite`) | Theia reads read-only, and Places has its own connection and invariants | `PlacesUtils.bookmarks`/`history` from PowerBrowserAPI only |

## Stack Patterns by Variant

**If a feature's upstream actor already runs for overlays** (context menu, prompts, permissions, favicons, fullscreen, autocomplete):
- Build the receiver it looks for on `browser.documentGlobal` and relay. Do not write a new actor.
- Reason: the actor protocol is stock and versioned with the ESR. A new actor is a second `registerWindowActor` caller, and the guard is designed to fail on that.

**If a feature is a pure browser-element method** (stop, reload flags, history index, zoom, mute, find, security state):
- Use a new `webTab*` kind beside the existing ones, plus fields in the one state push.
- Reason: no new channel and no new principal.

**If a feature only exists inside `browser.xhtml`** (about:preferences, about:addons, the library window, onClicked extensions):
- Route it to the stock window through its own global entry points.
- Reason: GUI-01 already makes the stock window reachable, and re-hosting the feature would be custom chrome.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Gecko 153.5.0esr | `moz-src:///` URLs in `defineESModuleGetters` | Used by upstream itself (`UrlbarUtils.sys.mjs:38`, `URIFixup.sys.mjs:24`). It was not previously used in PowerBrowserAPI; confirm the boundary guard's conditional-import rule (`is_conditional_pattern`, `check-internals-boundary.sh:84-89`) treats the new line like the existing ones. |
| Gecko 153.5.0esr Places schema | `searchPlaces`/`queryTabsWithPlaces` raw SQL | Writes go through `PlacesUtils` APIs, not SQL, so they add **no** new schema coupling. Hand-written autofill SQL would add some, which is a reason to prefer the Autofill provider spike. |
| Theia 1.76.0 `@theia/monaco` | `@theia/monaco-editor-core` 1.108.201 | `@`/`:` quick access live in monaco's registry, reachable only through `QuickInputService.open`. |

## Sources

All local, at the pinned tags; no web source was needed or used.
- `upstream/` at `FIREFOX_153_5_0esr_BUILD1`: every path:line cited above (HIGH for existence and signature).
- `theia/node_modules/@theia/*` 1.76.0 `.d.ts`/`.js`: quick access, quick input, menus, dialogs, hover, context keys, keybinding clashes (HIGH).
- In-tree: `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/shell/powerbrowser.js`, `powerbrowser/shell/powerbrowser.xhtml`, `powerbrowser/INTERNAL-APIS.md`, `powerbrowser/endpoint-allowlist.json`, `scripts/check-internals-boundary.sh`, `theia/extensions/tab-uris/src/browser/web-tab.ts`, `theia/extensions/chrome-bar/src/browser/*` (HIGH).
- Runtime behaviour statements (today's prompt, download and right-click outcomes) are inferred from source control flow. They are MEDIUM until a live check.
