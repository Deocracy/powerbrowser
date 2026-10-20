# Architecture Research

**Domain:** v1.5 Chrome Bar Firefox Parity: integration of Firefox-toolbar features into a Theia-hosted chrome bar whose web pages are chrome-owned `<xul:browser>` overlays in a non-`browser.xhtml` shell window
**Researched:** 2026-10-20
**Confidence:** HIGH for every Gecko claim (each one was read in `upstream/` at `FIREFOX_153_5_0esr_BUILD1` and is cited by file and line). HIGH for the current tree (read at `d353a94`). MEDIUM for Theia QuickInput placement and the WebExtension Tier 1 popup host (code reading only, not run). LOW for the freeze-frame latency (not measured).

Method note: Gecko and tree facts come from direct reads and `grep` over `upstream/`, `powerbrowser/` and `theia/extensions/`. No claim below relies on the gap list's own line numbers; every line number in this file was re-read. Where the gap list's proposal turned out to be wrong, the correction is called out as **Refinement**.

---

## Standard Architecture

### System Overview (today, and what v1.5 adds)

```
┌──────────────────────────── shell window: powerbrowser.xhtml (windowtype powerbrowser:main) ────────────────────────────┐
│                                                                                                                          │
│  powerbrowser.js  ── window.gBrowser stand-in {tabs, getTabForBrowser→null, getBrowserForTab, setIcon}                   │
│                   ── <keyset>: Ctrl+Alt+Shift+D, Ctrl+L (reserved)                                                       │
│                   ── NEW: PowerBrowserAPI.installShellFurniture(window)  ──────────────────────────────┐                 │
│                                                                                                         ▼                 │
│   ┌───────────────────────────────┐   PowerBrowserGroup actor pair   ┌───────────────────────────────────────────────┐   │
│   │ Theia frame <xul:browser      │   (GroupActorChild ⇄ Parent)     │ PowerBrowserAPI.sys.mjs (the ONE boundary)    │   │
│   │ id=powerbrowser-content>      │  ─ PowerBrowserGroupRequest ──▶  │  handleGroupMutation  (webTab*, window*)      │   │
│   │  @powerbrowser/chrome-bar     │  ◀─ PowerBrowserWebTabState ──   │  handleStoreRequest   (Places, search, NEW)   │   │
│   │  @powerbrowser/tab-uris       │     (one push name, many kinds)  │  webTabs Map  tabId → {browser, listener,…}   │   │
│   │  WebTabWidget placeholders    │                                  │  NEW: shell furniture objects (below)         │   │
│   └───────────────────────────────┘                                  └───────────────────────────────────────────────┘   │
│        z 0                                                                     │ positions                              │
│   ┌──────────────────────┐ ┌──────────────────────┐                            ▼                                          │
│   │ overlay <xul:browser>│ │ overlay <xul:browser>│  z 1, position:fixed over each placeholder rect                      │
│   └──────────────────────┘ └──────────────────────┘                                                                      │
│   error layer z 2 · diagnostics z 3 · NEW native XUL popups (always above every layer — OS popup widgets):                │
│   remoteBrowserTooltip · PopupAutoComplete · notification-popup · contentAreaContextMenu (relay stub) · ext popup panel  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The single fact that shapes most of v1.5: **a Theia DOM popup can never draw over a page**, because overlays sit above the Theia frame (`webTabOpen` sets `zIndex: "1"`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs` webTabOpen body), so today every Theia popup hides the pages through `BLOCKING_LAYER_SELECTOR` (`theia/extensions/tab-uris/src/browser/web-tab.ts:99`). A **native XUL popup** in the shell document (`<panel>`, `<menupopup>`, `<tooltip>`) is a separate OS popup widget and draws above the overlays with no occlusion. That splits v1.5's furniture into two classes:

| Class | Where it renders | Why |
|---|---|---|
| Things the user operates from the chrome bar (app menu, history menu, modes dropdown, site info, bookmark editor, downloads, puzzle menu) | Theia DOM, `.pb-chrome-bar-dropdown` / `.lm-Menu`, occlusion applies | Our own UI, our copy, themable, extensible by Theia extensions |
| Things a page requests that Gecko actors resolve by element id or by a window global (tooltips, form autocomplete, `<select>`, permission doorhangers, dialogs) | Native XUL popup or chrome window, chrome-side | Gecko code looks these up by id/global; security decisions must not be made in unprivileged content |
| Page context menu | Theia menu (relay), with occlusion or freeze-frame | Its items are our own UI (rule 5, and the "vibe-codeable" core value: Theia extensions can contribute items) |

### Component Responsibilities (v1.5)

| Component | Status | Responsibility |
|---|---|---|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | MODIFIED (large) | New web-tab action kinds, widened state push, push router kinds, search/fixup/Places-write store kinds, shell furniture installer, chrome-initiated tab adoption |
| `powerbrowser/shell/powerbrowser.js` | MODIFIED (small) | Calls `installShellFurniture(window)` first thing in DOMContentLoaded; grows the `<key>` table; adds `updateBrowserSharing` to the `gBrowser` stand-in |
| `powerbrowser/shell/powerbrowser.xhtml` | MODIFIED | Adds a `<popupset>` with stock toolkit furniture elements (list in Pattern 5) |
| `powerbrowser/shell/powerbrowser.css` | MODIFIED | Styles for the stock panels so they match the shell |
| `powerbrowser/shell/GroupActorChild.sys.mjs` | UNCHANGED | Already re-dispatches any `PowerBrowserWebTabState` payload; new pushes ride it as new `kind` values |
| `powerbrowser/INTERNAL-APIS.md` | MODIFIED | One row per new touchpoint; the Places row (`:36`, currently read-only) re-ruled to read-write |
| `theia/extensions/tab-uris/src/browser/web-tab.ts` | MODIFIED | `WebTabState` widened; `WebTabMessage` union grows; `WebTabChannel.onState` becomes a kind router with `onPush(kind)` subscriptions; adoption of chrome-created tabs; find bar inside the widget |
| `theia/extensions/tab-uris/src/browser/web-tab-context-menu.ts` | NEW | Receives `contextMenu` pushes, renders `WEB_TAB_CONTEXT_MENU` (exported `MenuPath`) through `ContextMenuRenderer`, sends `webTabContextAction` |
| `theia/extensions/tab-uris/src/browser/shortcut-relay.ts` | NEW | Maps `shortcut` push ids to Theia command ids |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` | MODIFIED (split) | 1158 lines today; the address pill moves out before modes land |
| `theia/extensions/chrome-bar/src/browser/address-bar/` | NEW dir | `address-bar-modes.ts` (contribution point), `address-bar-widget.tsx` (pill, chip, dropdown), `command-centre-mode.ts` (QuickInput delegate), `engine-modes.ts`, `places-modes.ts` |
| `theia/extensions/chrome-bar/src/browser/app-menu.ts` | NEW | Hamburger `MenuPath` + contributions (Settings, Passwords, Add-ons, History, Downloads, Help, Quit) |
| `theia/extensions/chrome-bar/src/browser/site-identity.tsx` | NEW | Lock/"Not Secure", site info and permissions popover; reports the identity-box rect for the doorhanger anchor |
| `theia/extensions/chrome-bar/src/browser/extensions-menu.tsx` | NEW (last, Tier 1 only) | Puzzle button and list |
| `scripts/verify-web-tab-bridge.mjs` | MODIFIED | Kind derivation already covers any `webTab*` name; add push-kind parity (chrome `kind: "…"` in pushes vs frontend router keys) |
| `scripts/verify-shell-gbrowser-standin.mjs` | MODIFIED | Scan set (`:75-83`) gains `PermissionUI.sys.mjs`, `WebRTCParent.sys.mjs`, `PromptParent.sys.mjs`, plus a "deliberately absent" list (`getTabDialogBox`) |
| `scripts/verify-shortcut-relay.mjs` | NEW | Derives the `<key>` ids in `powerbrowser.js` and the relay map keys in `shortcut-relay.ts`; set equality; `--self-test` |
| `scripts/verify-shell-furniture.mjs` | NEW | Derives the element ids upstream looks up (`remoteBrowserTooltip`, `PopupAutoComplete`, `notification-popup`, `contentAreaContextMenu`) from the cited upstream files and requires each in `powerbrowser.xhtml`; red on rebase drift |

No new `@powerbrowser/*` package. Each new package means app composition and generator churn for no gain; the two existing frontend packages already own the two halves (tab-uris owns the page, chrome-bar owns the bar).

---

## Validation of the 8 Shared Groundwork Pieces

| # | Gap-list piece | Verdict | Refinement from the code |
|---|---|---|---|
| G1 | Wider state push | **Confirmed** | `webTabPush` (`PowerBrowserAPI.sys.mjs:3385-3402`) sends 7 primitives; `WebTabState` (`web-tab.ts:150-156`) and the parser in `WebTabChannel.onState` (`web-tab.ts:270-300`) whitelist the same fields, so all three move together. Security needs a third listener flag: today's mask is `NOTIFY_LOCATION \| NOTIFY_STATE_NETWORK` (webTabOpen body); add `NOTIFY_SECURITY \| NOTIFY_CONTENT_BLOCKING` and an `onSecurityChange`/`onContentBlockingEvent` arm. Audio comes from the `DOMAudioPlaybackStarted/Stopped` events the browser element dispatches on itself (`toolkit/content/widgets/browser-custom-element.mjs:987-992`); crash from `oop-browser-crashed` on the frame element (`dom/base/nsFrameLoader.cpp:3717`). **Favicon is not cheap**: `LinkHandlerParent.setIconFromLink` returns at `getTabForBrowser(browser) == null` (`browser/actors/LinkHandlerParent.sys.mjs:177-180`), so overlay pages never deliver or store an icon. Ship the push without `favicon`; see Gaps. |
| G2 | Page-focus shortcut relay | **Confirmed, with a split** | Not every key may be `reserved="true"`: a reserved key never reaches content (`dom/events/GlobalKeyListener.cpp:463-471`), and the Theia frame is content, so reserving Ctrl+T would kill Theia's own `ctrlcmd+t`. Two kinds of rows: **reserved** (Ctrl+L, Ctrl+W, Ctrl+Shift+T, F6, Alt+D, Ctrl+Tab family — keys Firefox itself reserves) and **reply-path** (unreserved `<key>`; fires in chrome only when the focused content did not `preventDefault`, which is Firefox's default handling). The handler decides from `document.activeElement`: an overlay `<browser>` → push `{kind:'shortcut', id, tabId}`; the Theia frame → push `{kind:'shortcut', id, focus:'shell'}` and the frontend runs the same command on its active widget. One command table, in the frontend. |
| G3 | Web-tab action kinds | **Confirmed** | Add arms beside `webTabFocus` (`PowerBrowserAPI.sys.mjs:2454-2529`) behind `webTabIdIsValid` (`:385-387`). Naming every new kind `webTab*` keeps `verify-web-tab-bridge.mjs:127-142` covering it with no gate change. `reload()` already exists on the entry (`:3531-3538`); hard reload is `reloadWithFlags` (`browser-custom-element.mjs:892`). |
| G4 | Popover/menu primitive | **Confirmed, plus one addition** | `.pb-chrome-bar-dropdown` and `.lm-Menu` are already in the occlusion list (`web-tab.ts:99`); `layout-controls-widget.tsx:81-89` is the `ContextMenuRenderer.render({menuPath, anchor})` pattern. **Addition (G4b, freeze-frame):** before an overlay hides for a blocking layer, chrome draws it (`drawSnapshot`, already used by `captureShellRegion`, `PowerBrowserAPI.sys.mjs:2077`) and the placeholder paints that still, so a context menu or doorhanger-adjacent popover does not blank the page. Spike first: the menu waits on the capture (LOW confidence on latency). |
| G5 | Places-write policy | **Confirmed** | The writes belong in `handleStoreRequest` (`PowerBrowserAPI.sys.mjs` end-of-file section after `:3706`), not `handleGroupMutation`: that handler already carries the second wall, `storeSenderInShellWindow` (`:3728-3736`), that history/bookmark access needs. Input-history ranking has a stock writer, `UrlbarUtils.addToInputHistory` (`upstream/browser/components/urlbar/UrlbarUtils.sys.mjs:1073`); clear history has `Sanitizer.sanitize` (`upstream/browser/modules/Sanitizer.sys.mjs:314`). |
| G6 | Search area in PowerBrowserAPI | **Confirmed; take the small option** | Use `Services.uriFixup.getFixupURIInfo(text, FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP)` (`upstream/docshell/base/nsIURIFixup.idl:96,127`) for the whole "URL, host:port, or search" decision in one call, then apply the existing http(s) wall to the **result**; `Services.search` (`upstream/toolkit/components/search/SearchService.sys.mjs`) for engines; `SearchSuggestionController.fetch` (`upstream/toolkit/components/search/SearchSuggestionController.sys.mjs:274`) for suggestions. Do not spike a headless `UrlbarProvidersManager`: it drags in the urlbar's controller/view model for results the chrome bar already renders itself. Fixup in chrome also fixes the `typedAddressTargetOf` localhost bug (`chrome-bar-widget.tsx:49-57`) by deleting that function's guessing. |
| G7 | Shell-window furniture shims | **Confirmed, and the list was incomplete and partly wrong** | See Pattern 5. Corrections: (a) tooltips over remote pages come from `nsIXULBrowserWindow.showTooltip` (`dom/ipc/BrowserParent.cpp:2532`, `browser/base/content/browser.js:2016-2037`), not `<tooltip page="true">`, which serves in-process content only; (b) page fullscreen needs a `window.FullScreen` stand-in (`browser/actors/DOMFullscreenParent.sys.mjs:38,166`), it throws today; (c) `<select>` dropdowns need nothing: `SelectParent` creates its own `#ContentSelectDropdown` in the top chrome window (`toolkit/actors/SelectParent.sys.mjs:801-837`), and the XUL custom elements it needs auto-load into any system-principal XHTML document (`toolkit/components/processsingleton/CustomElementsListener.sys.mjs:9-28`); (d) middle-click and Ctrl+click on links need `window.openLinkIn` (`browser/actors/ClickHandlerParent.sys.mjs:85,146`), not on the list. |
| G8 | openStockTab allow-list | **Confirmed, reshaped** | Widening the URL wall at `:1107-1110` does not work: `addWebTab` uses a null principal (`tabbrowser.js:3185-3198`) and `about:preferences` is not `URI_SAFE_FOR_UNTRUSTED_CONTENT` (`upstream/browser/components/about/AboutRedirector.cpp:125-126`), so it would refuse to load. Add a separate kind `openStockPage {page}` whose argument is an **enum** (`settings`, `passwords`, `addons`, `processes`, `support`), mapped chrome-side to literal `about:` URLs and opened with `addTrustedTab` (`tabbrowser.js:3255`). View source is `webTabViewSource {tabId}`, which reads the URL from the chrome-side entry, never from the sender. The URL wall on `openStockTab` stays exactly as it is. |

### Groundwork the gap list did not name

- **G9: active-web-tab signal.** PopupNotifications, find, shortcuts and "which tab does Ctrl+W close" all need the *selected* web tab. Visibility (`webTabGeometry visible`) is not selection: the dock split puts two web tabs on screen at once. New kind `webTabActivated {tabId | null}` sent from the shell's `currentWidget` change.
- **G10: push router.** `WebTabChannel.onState` (`web-tab.ts:268-301`) hard-codes two kinds. Replace with a `kind → handler` table and `onPush(kind, handler)` so chrome-bar, the context-menu module and the shortcut relay each subscribe. The child and the actor message name do not change.
- **G11: catalogue churn.** `INTERNAL-APIS.md` rows are keyed by `PowerBrowserAPI.sys.mjs:<line>` (113 rows today). Code inserted above a catalogued line moves every row below it. Rule for v1.5: **append** new sections at the end of the file (the store-request section already does this, comment at `:3699-3704`), and re-run `check-internals-boundary.sh --catalogue` after each plan.

---

## Data Flow per Feature Family

All requests ride `PowerBrowserGroupRequest` → `GroupActorChild` → `PowerBrowserGroupParent.receiveMessage` (`PowerBrowserAPI.sys.mjs:3669-3683`), which already routes by kind set: shell kinds, store kinds, everything else to `handleGroupMutation`. All pushes ride `sendAsyncMessage("PowerBrowserWebTabState", {kind, …})`.

### 1. Navigation buttons and keys

```
click Stop / Shift+Reload / long-press Back
  → webTabStop {tabId} | webTabReload {tabId, bypassCache} | webTabHistory {tabId}
  ← reply {ok, where} | {ok, entries:[{index,title,url}], current}
  → webTabGotoIndex {tabId, index}
page-focused Ctrl+W
  chrome <key reserved> → activeElement is overlay → push {kind:'shortcut', id:'closeTab', tabId}
  → ShortcutRelay → Theia command → WebTabWidget.close() → existing closeTab + webTabClose
```

Home is theia-only (preference + existing `webTabNavigate`). History entries come from `browser.browsingContext.sessionHistory`, already read by `restoreWebTabHistory` (`:818`).

### 2. Address bar, modes and search

```
typing in the pill (mode = engine | all | bookmarks | tabs | history | actions)
  → searchPlaces {text, restrict}  (existing store kind)          ┐ merged by the
  → searchSuggestions {text, engineId}  (NEW store kind)           │ active mode's
  → autofill {text}  (NEW store kind, moz_origins)                 ┘ provider
Enter
  → resolveTypedAddress {text, engineId?}  (NEW store kind)
      chrome: getFixupURIInfo → if result is a search, engine.getSubmission
              → http(s) wall on the RESULT → {url, isSearch, engineName}
  → webTabNavigate {tabId, url}  (existing)
Shift+Del on a history row → removeHistoryEntry {url}  (NEW, first Places write)
mode = command centre (default in Coding)
  → QuickInputService.open(text)  — no chrome message; Theia stock quick access
```

**Where the modes dropdown lives: the chrome-bar widget, not Theia QuickInput.** The browser modes need inline autofill written into the pill's own `<input>` (`setSelectionRange`), per-row removal, favicons and one-off engine buttons. Monaco's quick input owns its own input box and its row model, so none of those can be done in it without patching Theia core (rule 1). The chip at the left of the pill opens a `.pb-chrome-bar-dropdown` listing the modes; each mode is a contribution:

```typescript
// address-bar-modes.ts
export interface AddressBarMode {
    id: string;                 // 'engine:<id>' | 'bookmarks' | 'tabs' | 'history' | 'actions' | 'command-centre'
    label: string;
    iconClass: string;
    restrictToken?: string;     // '*' bookmarks, '%' tabs, '^' history (Firefox tokens)
    delegate?: 'quick-input';   // command centre only
    provide?(text: string, token: CancellationToken): Promise<AddressBarRow[]>;
}
export const AddressBarModeContribution = Symbol('AddressBarModeContribution');
```

Engines are one mode each, generated from `listSearchEngines`. Downstreams add modes through the contribution, which is the "vibe-codeable" path.

**The command-centre mode lives in Theia's stock QuickInput.** Theia 1.76 has no command-centre widget (no `commandCenter` symbol anywhere in `node_modules/@theia/{core,monaco,file-search}/lib`); what VS Code calls the command centre is a title-bar button that opens quick access. Theia's providers are registered on `QuickAccessRegistry` with prefixes (`''` files in `@theia/file-search/lib/browser/quick-file-open.js:56-59`, `@` and `:` in `@theia/monaco/lib/browser/monaco-gotosymbol-quick-access.js:46-49` and `monaco-gotoline-quick-access.js:42-45`, `>` commands). The mode hands the typed text to `QuickInputService.open(text)` on the first non-URL keystroke; URL-shaped text (decided by `resolveTypedAddress`, not by the old regex) stays in the pill so a URL still navigates from Coding. `.quick-input-widget` is already in the occlusion list. Placement under the pill is CSS on `.quick-input-widget` scoped by a body attribute set while the pill delegated (MEDIUM: not run). Token collision: `>` means Theia commands in command-centre mode and Firefox actions elsewhere; the restrict tokens only apply in browser modes.

### 3. Site identity and app menu

```
state push gains securityState ('secure'|'insecure'|'mixed-passive'|'broken'|'local'|'none'),
  displaySpec, baseDomain, blockedTrackers count
identity click → webTabSiteInfo {tabId} → {securityState, issuer, permissions:[{id,state,scope}]}
  → webTabSetPermission {tabId, id, state} | webTabClearSiteData {tabId}
hamburger → Theia MenuPath; Settings → openStockPage {page:'settings'}
```

The permission rows read and write `SitePermissions` chrome-side keyed by the tab's own `contentPrincipal` (`browser-custom-element.mjs:684`), never by a sender-supplied origin.

### 4. Page tools and bookmarks

| Feature | Request | Push | Gecko surface |
|---|---|---|---|
| Find | `webTabFind {tabId, text, flags, dir}`, `webTabFindClose` | `findResult {tabId, result, current, total}` | `browser.finder` (`browser-custom-element.mjs:581`) → `toolkit/modules/FinderParent.sys.mjs`; works on any remote browser |
| Zoom | `webTabZoom {tabId, op}` | `zoom` in state | `browser.fullZoom` setter (`browser-custom-element.mjs:725`); per-site memory is our own content-pref write |
| Mute | `webTabMute {tabId, muted}` | `audible`, `muted` in state | `browser.mute()/unmute()` (`:1038`), `audioMuted` (`:785`) |
| Print | `webTabPrint {tabId}` | — | needs a live check; see browserDOMWindow `OPEN_PRINT_BROWSER` note below |
| Downloads | `listDownloads`, `downloadAction {id, action}` | `downloads {items}` | `Downloads.getList(Downloads.ALL)` view; check first what an overlay download does today (the stock downloads UI targets the most recent `navigator:browser` window) |
| Window fullscreen | `windowFullscreen {on}` | `fullscreen {on}` | `window.fullScreen` on the shell window |
| Bookmark star | `addBookmark`, `removeBookmark`, `updateBookmark` | `placesChanged` | `PlacesUtils.bookmarks.*` under the re-ruled Places row |
| Reopen closed tab | existing `tabs.sqlite` closed rows + `shellArmWebTabHistory` (`:2262`) | — | no new internal |

The find bar is the one tool that must not occlude: it lives inside `WebTabWidget` and shrinks the placeholder, so the published rect shrinks and the page moves down with no hide.

### 5. Page prompts and new-window links

#### 5a. `window.open` / `target=_blank` as web tabs (nsIBrowserDOMWindow)

Gecko path, read end to end:

1. A remote page calls `window.open` → `ContentParent::RecvCreateWindow` takes `topParent->GetBrowserDOMWindow()` (`upstream/dom/ipc/ContentParent.cpp:5428-5431`).
2. That value was copied from the root chrome window's `window.browserDOMWindow` when the `<browser>`'s frameloader got its `BrowserParent` (`upstream/dom/base/nsFrameLoader.cpp:2733-2739`). A remoteness switch creates a new `BrowserParent` and re-reads it.
3. With none, the location is forced to `OPEN_NEWWINDOW` (`ContentParent.cpp:5462-5471`). **That is GUI-01's mechanism today.**
4. With one, and a tab location (decided by `nsWindowWatcher::GetWindowOpenLocation`, `upstream/toolkit/components/windowwatcher/nsWindowWatcher.cpp:2588-2675`: `browser.link.open_newwindow` and the restriction pref send `window.open` *with features* to `OPEN_NEWWINDOW`, so OAuth popups stay windows), Gecko calls `createContentWindowInFrame(uri, params, where, flags, name)` (`ContentParent.cpp:5490`).
5. **If that returns null with success, Gecko falls through to the new-window path** (`ContentParent.cpp:5506-5509`: "Fall through to the normal window opening code path when there is no window which we can open a new tab in").

Design: `PowerBrowserAPI.createShellBrowserDOMWindow(win)` returns an object QI'd to `nsIBrowserDOMWindow` (`ChromeUtils.generateQI` is boundary-only, so it is built there), assigned to `window.browserDOMWindow` at the top of the DOMContentLoaded handler, before `TheiaService.start` and before any overlay exists.

| Method | Behaviour |
|---|---|
| `createContentWindowInFrame` / `openURIInFrame` | `params.openerBrowser` is an overlay in `webTabs` **and** `where` is a NEWTAB value → create a pending overlay (below) and return it. Opener is the Theia frame, or `where == OPEN_PRINT_BROWSER`, or anything else → **return null**, which reproduces today's behaviour exactly by step 5. |
| `createContentWindow` / `openURI` | return null (not on the remote content path; external opens go to `navigator:browser` windows) |
| `canClose()` | `true` — `nsGlobalWindowOuter::CanClose` consults it (`upstream/dom/base/nsGlobalWindowOuter.cpp:5976-5981`); quit stays on `window.onclose` |
| `tabCount` | `webTabs.size` |

The Theia-opener null return is the GUI-01 guarantee: `browser-window-command.ts`'s fallback `window.open(target, '_blank')` and every Theia `windowService.openNewWindow` still land in a stock window, by the same upstream fall-through as before. It must be a static check (the opener test) plus the existing `verify-gui01-window.mjs` live row.

Pending overlay (the reverse of today's frontend-first `webTabOpen`), mirroring what `BrowserDOMWindow.#openURIInNewTab` → `tabbrowser.addTab` does (`upstream/browser/modules/BrowserDOMWindow.sys.mjs:86-170`):

```
chrome  createContentWindowInFrame(opener = overlay A)
          browser = createXULElement('browser'); same attributes as webTabOpen;
          browser.openWindowInfo = params.openWindowInfo      (tabbrowser.js:2800-2801)
          remoteType = openerBrowser.remoteType               (tabbrowser.js:4251)
          no load (skipLoad: Gecko loads the opened URI itself, BrowserDOMWindow.sys.mjs:435-447)
          append, hidden 0x0; webTabs.set(pendingId, entry{owner: A.owner, openerTabId: A})
          push {kind:'adoptTab', pendingId, openerTabId, background}
          return browser                      → window.open returns a WindowProxy with opener
frontend  WebTabOpenHandler.adopt(pendingId) mints wt-<session>-<n>, adds widget next to opener
          → webTabAdopt {tabId, pendingId}
chrome    re-key webTabs pendingId → tabId; write the tab row; geometry flows as usual
timeout   no adoption in 5 s (frontend reloading) → close the pending overlay and open the URL
          in the stock window via openStockTab, so the page is never silently lost
```

The pending id is chrome-minted (`pc-<n>`, inside `webTabIdIsValid`'s alphabet) and never reaches a URI; the frontend id stays the only one `isCurrentSessionTabId` admits (`web-tab.ts:632-634`). "Opens next to its opener; closing reselects the opener" falls out of `openerTabId`.

`window.openLinkIn(href, where, params)` on the shell window serves middle-click/Ctrl+click from overlays (`ClickHandlerParent.sys.mjs:80-146`) through the same adoption path, with a normal (not frameloader-adopting) load. Opener = Theia frame → return without action, which is today's behaviour (`openLinkIn === undefined` → return, `:85`).

#### 5b. Permission doorhangers: stock PopupNotifications, not a Theia relay

Today: `PermissionPrompt.prompt()` calls `this.cancel()` when `chromeWin.PopupNotifications` is absent (`upstream/browser/modules/PermissionUI.sys.mjs:533-536`). Every geolocation, notification, storage, MIDI, XR and storage-access request is silently denied.

**Recommendation: instantiate the stock toolkit `PopupNotifications` on the shell window.** Its constructor (`upstream/toolkit/modules/PopupNotifications.sys.mjs:266`) reads exactly four members of its tabbrowser argument: `documentGlobal`, `selectedBrowser`, `selectedTab`, `tabContainer` (all uses in the file). That is a stand-in passed as an **argument**, not `window.gBrowser`, so it does not widen the global stand-in:

```javascript
// inside PowerBrowserAPI.installShellFurniture(win)
const tabContainer = new win.EventTarget();            // fires TabSelect/TabClose on webTabActivated/webTabClose
const tabbrowser = {
  documentGlobal: win,
  get selectedBrowser() { return activeOverlayBrowser(win); },   // from webTabActivated (G9)
  selectedTab: null,
  tabContainer,
};
win.PopupNotifications = new lazy.PopupNotifications(
  tabbrowser,
  win.document.getElementById("notification-popup"),  // <panel type="arrow"> in powerbrowser.xhtml
  null,                                                // no iconBox: anchor comes from the browser
  {}
);
// per overlay: browser.popupnotificationanchor = <chrome XUL element positioned over the
// identity-box rect the frontend reports> (getAnchorFromBrowser, PopupNotifications.sys.mjs:47-59)
```

Why not the gap list's relay to a Theia popover with a `doorhangerAction` kind:

1. **Trust boundary.** The Theia frame is unprivileged content. A `doorhangerAction {allow}` kind lets any script in that frame (a compromised or careless Theia extension) grant camera or location to any site. A grant must be clicked in chrome UI.
2. **Clickjacking delay.** The stock panel enforces `security.notification_enable_delay` (`PopupNotifications.sys.mjs:18`) and its focus checks (`:300-330`); a relay would have to re-implement both and keep them in step.
3. **No occlusion.** The panel is a native popup, so the page that asks stays visible.

The anchor uses the `windowDragRegions` precedent: the frontend already reports rects for chrome to lay elements over (`PowerBrowserAPI.sys.mjs:2543-2552`, `powerbrowser.js` `powerbrowserSetDragRegions`). A sibling kind `windowAnchors {identity: rect}` positions one chrome `hbox` (it must be a XULElement, `PopupNotifications.sys.mjs:270`).

Covered by this alone: everything built on `PermissionUI` (geolocation, desktop notifications, persistent storage, MIDI, XR, storage access, local network). **Not covered:** camera/microphone/screen (`WebRTCParent.sys.mjs` builds its device menus by `getElementById` on `webRTC-*` elements, `:771-1212`) and password save (`LoginManagerPrompter.sys.mjs:54-55, 291-312` reads `password-notification-*` fields). Those need the `popupnotification` templates from `browser/base/content/popup-notifications.inc.xhtml` in the shell document, ideally `#include`d by the jar preprocessor rather than copied (LOW, spike). Also add `updateBrowserSharing(browser, state)` to the `gBrowser` stand-in: `PermissionUI.sys.mjs:978-982` and `WebRTCParent.sys.mjs:153-157` call it on a non-null `gBrowser` and would throw on the missing member.

**Rule-5 decision for Chris:** these are stock toolkit elements with stock strings (no item, label or layout of ours), the same kind of furniture upstream's own non-tabbrowser content host carries (`upstream/browser/base/content/webext-panels.xhtml:43-53`: `aHTMLTooltip`, `PopupAutoComplete`, `contentAreaContextMenu`). The recommendation reads rule 5's "no custom browser chrome" as "no authored chrome", which permits them. It needs ratifying before Phase F.

#### 5c. alert / confirm / prompt / beforeunload / HTTP auth: already work, window-modal

`PromptParent.openPromptWithTabDialogBox` uses the tab-modal box only when `win?.gBrowser?.getTabDialogBox` exists (`upstream/browser/actors/PromptParent.sys.mjs:222`); otherwise it opens `commonDialog.xhtml` as a **window-modal chrome dialog** (`:285-293`). The `Prompt` actor is registered for all frames (`upstream/browser/components/DesktopActorRegistry.sys.mjs:717-722`). So these prompts already appear today, modal to the whole shell window. Recommendation: live-check, keep, and **do not** relay to Theia: auth credentials typed into the Theia frame would pass through unprivileged content and the actor channel. `getTabDialogBox` goes on the stand-in check's "deliberately absent" list so nobody adds it by accident.

#### 5d. Page context menu: Theia relay through a native stub

Today `ContextMenuParent` throws on every right-click in an overlay: the shell has no `nsContextMenu`, the fallback lookup finds the same window, and `win.nsContextMenu.contentData = …` dereferences undefined (`upstream/browser/actors/ContextMenuParent.sys.mjs:23-40, 190`). The actor runs in all frames (`DesktopActorRegistry.sys.mjs:416-429`), the Theia frame included when Theia does not `preventDefault`.

Shim: `window.nsContextMenu = {}` plus a real hidden `<menupopup id="contentAreaContextMenu">` (the parent calls `getElementById(...).openPopupAtScreen(...)`, `:218, :256`, which needs a real element). Its `popupshowing` handler cancels the native popup, stores `contentData` chrome-side under a token, and pushes a display-only summary:

```
push {kind:'contextMenu', tabId, token, x, y, context:{onLink, onImage, onEditable,
      isTextSelected, selectionPreview (trimmed), canGoBack, canGoForward}}
frontend renders WEB_TAB_CONTEXT_MENU (MenuPath) at x,y; extensions may contribute
→ webTabContextAction {tabId, token, action}   action ∈ fixed enum
chrome looks up the token's contentData; acts (open link → adoption path, copy link,
       save image, search selection → resolveTypedAddress, back/reload);
       then calls the stored actor's hiding() (ContextMenuParent.sys.mjs:42-48)
```

Theia sends back an action id and a token, never a URL; chrome reads link and media URLs from its own stored copy. Browser equal to the Theia frame → ignore (today it throws).

#### 5e. Remaining furniture (Pattern 5 lists all of it)

Form autocomplete: `AutoCompleteParent` needs `browser.autoCompletePopup` (`toolkit/actors/AutoCompleteParent.sys.mjs:224, 371`), which resolves the `autocompletepopup` attribute by id (`browser-custom-element.mjs:491-492`). The overlay attribute list (webTabOpen body) omits it on purpose today; v1.5 adds the attribute and the `PopupAutoComplete` panel. Link-hover status and remote tooltips: one `nsIXULBrowserWindow` object installed on the shell's `nsIAppWindow` the way `browser-init.js:256-258` does it (`setOverLink` → `overLink` push; `showTooltip`/`hideTooltip` → `#remoteBrowserTooltip`). Side effect worth knowing: native `title=` tooltips inside the **Theia frame** are also dead today for the same reason, and this fixes them too.

### 6. WebExtension toolbar buttons and the puzzle menu

What the code says (no live run):

- **The extension framework cannot see web tabs.** `TabTracker.getTabForBrowser` asks `browser.documentGlobal.gBrowser.getTabForBrowser` (`upstream/browser/components/extensions/parent/ext-browser.js:377-389`), which our stand-in answers with null on purpose. `getBrowserData` then checks `windowTracker.isBrowserWindow`, true only for `windowtype="navigator:browser"` (`upstream/toolkit/components/extensions/parent/ext-tabs-base.js:1739-1743`), so every overlay reports `{tabId: -1, windowId: -1}` (`ext-browser.js:747-770`), the id an extension background page gets. Content scripts and network filtering may still run in overlays (injection is by policy in the content process, not by tabbrowser), but `sender.tab` is missing and per-tab state is blind. `activeTab` resolves to the stock window's selected tab (`ext-browser.js:775-781`).
- **Action buttons are CustomizableUI widgets built only in browser windows** (`browser/components/extensions/parent/ext-browserAction.js:195-213`), and clicks need `window.gBrowser.selectedTab` (`:532, :555`).
- **Everything works in the stock window today** through GUI-01: buttons, popups, puzzle menu, with the stock window's tabs.

| Tier | What | Patch? |
|---|---|---|
| 0 (now) | Extensions fully usable in the stock browser window | no |
| 1 | Theia puzzle menu: installed extensions, icon, name, Manage (`openStockPage addons`), Options; the action runs **in the stock window** ("Open in browser window") | no |
| 1b | Popup hosted in the shell: an extension `<browser>` inside a XUL `<panel>`, built like `ExtensionPopups.sys.mjs:308-385` (`webextension-view-type=popup`, `extension-browser-inserted`, `Extension:InitBrowser`) | no, but MEDIUM-LOW: the popup's `tabs.query({active:true})` still answers with the **stock window's** tab, which is worse than Tier 1's honest routing |
| 2 | Web tabs are tabs to the extension framework | yes: a hook in `ext-browser.js` TabTracker/WindowTracker, or the chrome-owned tab model of the GUI-05 bridge |

**Recommendation:** v1.5 ships Tier 1 only, and Tier 2 is carried with the GUI-05 mirror/proxy bridge milestone, where a chrome-owned tab model gives the tracker something real to see. Faking tab records for the tracker is the failure `powerbrowser.js`'s stand-in comment already rules out: a fabricated tab would let privileged code act on a tab that does not exist. This needs Chris's product decision because the milestone text says "WebExtension toolbar buttons" without a tier.

---

## Architectural Patterns

### Pattern 1: One push name, many kinds

**What:** every chrome→frontend message is `PowerBrowserWebTabState` with a `kind`; the frontend routes by kind.
**When:** every new push in v1.5 (`shortcut`, `adoptTab`, `contextMenu`, `findResult`, `downloads`, `fullscreen`, `overLink`, `placesChanged`).
**Trade-offs:** no change to `GroupActorChild.sys.mjs` (whose only privileged touch, the `wrappedJSObject` JSON hop, stays the single one) or to the actor registration; the cost is one router table, which the bridge gate can derive and compare.

```typescript
// web-tab.ts
private readonly pushHandlers = new Map<string, (detail: Record<string, unknown>) => void>();
onPush(kind: string, handler: (detail: Record<string, unknown>) => void): Disposable { /* … */ }
private readonly onState = (event: Event): void => {
    const detail = (event as CustomEvent).detail;
    if (detail && typeof detail.kind === 'string') { this.pushHandlers.get(detail.kind)?.(detail); }
};
```

### Pattern 2: Chrome holds the payload, Theia holds a token

**What:** when chrome hands Theia something to act on (context menu target, download, pending tab), it keeps the privileged object and sends a token plus display-only fields; Theia answers with the token and an action from a fixed enum.
**When:** context menu, downloads, pending-tab adoption, site permissions.
**Trade-offs:** one more map chrome-side, cleared on `webTabClose` and `webTabDropOwnedBy`. It removes the class of bug where a URL that came back over the channel is loaded with chrome's authority.

### Pattern 3: Enum, not URL, across the wall

**What:** kinds that open privileged pages take an enum (`openStockPage {page:'settings'}`) or a tab id (`webTabViewSource {tabId}`); the URL is chosen chrome-side.
**When:** every `about:` page and `view-source:`.
**Trade-offs:** adding a page means a code change, which is what a security decision should cost.

### Pattern 4: Chrome element over a reported Theia rect

**What:** the frontend reports a rect; chrome lays a XUL element over it. The drag regions already do this.
**When:** the doorhanger anchor over the identity box; the extension popup's anchor; nothing else.
**Trade-offs:** the rect must be re-reported on layout change (the drag-region re-measure path at `chrome-bar-widget.tsx:1003-1040` already runs on mode switch and resize).

### Pattern 5: Stock furniture, by id, in one installer

**What:** `PowerBrowserAPI.installShellFurniture(win)` is the single place that gives the shell window what Gecko actors expect of a content-hosting window. `powerbrowser.js` calls it once, first.

| Furniture | Kind | Needed by (upstream) |
|---|---|---|
| `window.browserDOMWindow` | JS object (QI) | `ContentParent.cpp:5428-5510` |
| `window.openLinkIn` | function | `ClickHandlerParent.sys.mjs:85,146` |
| `window.PopupNotifications` + `<panel id="notification-popup">` | toolkit object + XUL | `PermissionUI.sys.mjs:533,730`; `PopupNotifications.sys.mjs:266` |
| `window.nsContextMenu` + `<menupopup id="contentAreaContextMenu">` | object + XUL stub | `ContextMenuParent.sys.mjs:190,218,256` |
| `nsIXULBrowserWindow` on the app window + `<tooltip id="remoteBrowserTooltip">` | JS object + XUL | `BrowserParent.cpp:2520-2560`; `browser.js:2016-2042`; `browser-init.js:256-258` |
| `<panel is="autocomplete-richlistbox-popup" id="PopupAutoComplete">` + overlay attribute | XUL | `AutoCompleteParent.sys.mjs:224`; `browser-custom-element.mjs:491` |
| `window.FullScreen` stand-in | object | `DOMFullscreenParent.sys.mjs:38,166` |
| `gBrowser.updateBrowserSharing` | stand-in member | `PermissionUI.sys.mjs:978-982`; `WebRTCParent.sys.mjs:153-157` |
| `#ContentSelectDropdown` | none: self-created | `SelectParent.sys.mjs:801-837` |

**Trade-offs:** each row is a place an upstream rebase can change shape. `verify-shell-furniture.mjs` derives the ids and globals from these files and fails by name, the same derive-and-compare discipline `verify-shell-gbrowser-standin.mjs` uses.

---

## Anti-Patterns

### Anti-Pattern 1: Granting permissions from a Theia button

**What people do:** render the doorhanger in Theia and send `doorhangerAction {allow}`.
**Why it's wrong:** an unprivileged frame decides camera/location grants for every site, and the stock clickjacking delay is gone.
**Do this instead:** stock `PopupNotifications` on a native panel (5b).

### Anti-Pattern 2: Making the shell a `navigator:browser` window

**What people do:** flip `windowtype` so extensions, downloads and `openStockTab` see the shell.
**Why it's wrong:** every Firefox module that enumerates browser windows then assumes `gBrowser.tabContainer`, `gURLBar`, CustomizableUI areas and `delayedStartupFinished` (`openStockTab` itself waits on `gBrowserInit`, `PowerBrowserAPI.sys.mjs:1109-1120`). It also breaks `storeSenderInShellWindow`, which keys on `powerbrowser:main`.
**Do this instead:** furniture by id (Pattern 5); WebExtension Tier 2 with the bridge.

### Anti-Pattern 3: Fabricating tab records

**What people do:** return a fake tab from `gBrowser.getTabForBrowser` to light up favicons or extensions.
**Why it's wrong:** `LinkHandlerParent`, `ContextMenuParent`, `PromptParent` and the extension tracker all branch on it and would act on a tab that does not exist (the stand-in's own comment in `powerbrowser.js`).
**Do this instead:** keep `null`; get favicons another way (Gaps).

### Anti-Pattern 4: Widening the `openStockTab` URL wall

**What people do:** add `about:preferences` to the regex at `:1108`.
**Why it's wrong:** it does not even load under `addWebTab`'s null principal, and the fix (system principal) on a sender-supplied string is an escalation.
**Do this instead:** `openStockPage {page}` enum (Pattern 3).

### Anti-Pattern 5: Reserving every shortcut

**What people do:** mark the whole key table `reserved="true"` so pages can never swallow a key.
**Why it's wrong:** reserved keys never reach the Theia frame either (`GlobalKeyListener.cpp:463-471`), which silently removes Theia keybindings in Coding.
**Do this instead:** reserve only the keys Firefox reserves; reply-path for the rest (G2).

### Anti-Pattern 6: Rebuilding the command centre

**What people do:** render file, symbol and command results in the chrome-bar dropdown.
**Why it's wrong:** those providers are Theia's and Monaco's (`QuickAccessRegistry`); reproducing them duplicates core and drifts on every Theia re-pin.
**Do this instead:** delegate to `QuickInputService.open` (2).

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| chrome-bar ↔ tab-uris | DI (`WebTabChannel`, `WebTabOpenHandler`, `TabUriRegistry`) | Chrome-bar never dispatches DOM events itself; it calls the channel |
| Theia frame ↔ chrome | `PowerBrowserGroupRequest` / `PowerBrowserWebTabState` | Unchanged transport; new kinds only |
| chrome ↔ Gecko actors | window globals and element ids on the shell window (Pattern 5) | Installed once by `installShellFurniture` |
| PowerBrowserAPI ↔ Places/search | `handleStoreRequest` (shell-window wall) | Places row re-ruled to read-write |
| Theia ↔ stock window | `openStockTab` (URL, http(s) wall), `openStockPage` (enum) | GUI-01 untouched |
| Theia frame `window.open` | stock window, via browserDOMWindow returning null | Identical outcome to today |
| Extensions ↔ web tabs | none in v1.5 (tabId -1) | Tier 2 belongs to the GUI-05 bridge |

### Configuration touchpoint

`configuration.toml [urls] default search` can reach Gecko through `distribution/policies.json` `SearchEngines` (Default/Add), the same policy file EXT-03 already generates for extensions. That keeps the single-file rebrand rule for the default engine and needs no new mechanism; it is a generator row, not a chrome-bar change.

---

## Suggested Build Order (by dependency)

```
A  Groundwork          G10 push router · G9 webTabActivated · G1 state push · G3 action kinds · G11 append rule
│                      (+ verify-web-tab-bridge push parity)
├─▶ B  Navigation      Stop, hard reload, history menu (needs G4), Home · G2 shortcut relay + Ctrl+T/W/R, Alt+←/→, F6, Alt+1-9
│                      (+ verify-shortcut-relay)
├─▶ C  Search & modes  G6 resolveTypedAddress (fixes localhost) · engines/suggestions/autofill · G5 Places write (Shift+Del)
│                      · pill split out of chrome-bar-widget.tsx · modes contribution · command-centre delegate
├─▶ D  Identity & menu securityState lock + "Not Secure" · G8 openStockPage · hamburger MenuPath · site info/permissions
├─▶ E  Page tools      find (in-widget), zoom, mute, print (live check), downloads, fullscreen · star, bookmarks toolbar,
│                      reopen closed tab, clear history (G5)
├─▶ F  Shell furniture F1 XULBrowserWindow (tooltips, overLink) + PopupAutoComplete + FullScreen stand-in  [S-M]
│                      F2 browserDOMWindow + openLinkIn + adoption                                       [L, GUI-01 risk]
│                      F3 context menu relay (+ G4b freeze-frame spike)                                  [L]
│                      F4 PopupNotifications on a native panel (needs rule-5 ratification, G9)          [L]
│                      F5 WebRTC + password templates                                                   [spike, may defer]
│                      F6 dialogs: live check only
└─▶ G  Extensions      Tier 1 puzzle menu (product decision first)                                      [M]
```

**Ordering rationale:**

- A first because B–G all add kinds and pushes; without the router and the append rule every later plan rewrites `onState` and re-pins the catalogue.
- C before D/E: the search fallback is the most visible defect (the pill is a search box that cannot search, and `localhost:4000` fails), and C's `resolveTypedAddress` is reused by the context menu's "search selection" in F3.
- D before E: the hamburger `MenuPath` is where E's Downloads, History and Clear History entries hang.
- F after B–E but not last: it is independent of B–E except for G9 and G4, and F2 (new-window links as tabs) is high value, but it is the only step that can regress GUI-01, so it lands after the cheaper bar work has stabilised the channel.
- G last: Tier 1 is small, Tier 2 is out of scope, and the tier itself is an open product decision.

**Research flags:**

- F2 needs a live BiDi row: page `window.open` → web tab with a working `window.opener`; Theia `window.open` → stock window; `window.open(url, '', 'popup')` → stock popup window.
- F4/F5 need a spike on `#include`-ing `popup-notifications.inc.xhtml` into the shell (Fluent links and markup assumptions).
- G4b needs a latency measurement before it is adopted.
- E's print and downloads both need a "what happens today" live check before design.
- Phases B–F are dominated by behaviour only a live run shows. Under the standing NG-089 pattern those rows will be deferred to Chris unless each phase adds scripted BiDi checks; plan them as registry rows, not sibling drivers.

---

## Gaps

- **Favicons for overlay pages.** No upstream path delivers them while `getTabForBrowser` returns null (`LinkHandlerParent.sys.mjs:177-180`), and the icon is not stored in Places either. Options: read Places favicons for pages also visited in the stock window (partial); a page-side actor (a new `registerWindowActor`, which is the WINDOWS #13 boundary hole class and needs its own review); or a hook patch. Needs a decision; do not fake a tab.
- **Edit commands into a focused overlay** (cut/copy/paste from the app menu): the routing through the command dispatcher to a remote browser was not traced. MEDIUM-LOW.
- **Downloads from overlays today**: not run.
- **Theia QuickInput placement under the pill**: CSS-only approach not run.
- **WebExtension content scripts in overlays**: inferred from the framework's design, not observed.

## Sources

- `upstream/` at `FIREFOX_153_5_0esr_BUILD1`: `dom/ipc/ContentParent.cpp`, `dom/base/nsFrameLoader.cpp`, `dom/base/nsGlobalWindowOuter.cpp`, `dom/interfaces/base/nsIBrowserDOMWindow.idl`, `toolkit/components/windowwatcher/nsWindowWatcher.cpp`, `browser/modules/BrowserDOMWindow.sys.mjs`, `browser/components/tabbrowser/content/tabbrowser.js`, `browser/actors/{PromptParent,ContextMenuParent,ClickHandlerParent,LinkHandlerParent,WebRTCParent,DOMFullscreenParent}.sys.mjs`, `browser/modules/PermissionUI.sys.mjs`, `toolkit/modules/PopupNotifications.sys.mjs`, `toolkit/actors/{SelectParent,AutoCompleteParent}.sys.mjs`, `toolkit/content/widgets/browser-custom-element.mjs`, `toolkit/components/processsingleton/CustomElementsListener.sys.mjs`, `dom/ipc/BrowserParent.cpp`, `browser/base/content/{browser.js,browser-init.js,webext-panels.xhtml}`, `browser/components/DesktopActorRegistry.sys.mjs`, `browser/components/about/AboutRedirector.cpp`, `browser/components/extensions/parent/{ext-browser.js,ext-browserAction.js}`, `toolkit/components/extensions/parent/ext-tabs-base.js`, `browser/components/extensions/ExtensionPopups.sys.mjs`, `toolkit/components/passwordmgr/LoginManagerPrompter.sys.mjs`, `dom/events/GlobalKeyListener.cpp`, `docshell/base/nsIURIFixup.idl`, `toolkit/components/search/{SearchService,SearchSuggestionController}.sys.mjs`, `browser/components/urlbar/UrlbarUtils.sys.mjs`, `browser/modules/Sanitizer.sys.mjs`
- Tree at `d353a94`: `powerbrowser/shell/{PowerBrowserAPI.sys.mjs,powerbrowser.js,powerbrowser.xhtml,GroupActorChild.sys.mjs}`, `powerbrowser/INTERNAL-APIS.md`, `theia/extensions/tab-uris/src/browser/{web-tab.ts,browser-window-command.ts}`, `theia/extensions/chrome-bar/src/browser/{chrome-bar-widget.tsx,layout-controls-widget.tsx,chrome-bar-keybindings.ts}`, `scripts/{verify-web-tab-bridge.mjs,verify-shell-gbrowser-standin.mjs,check-internals-boundary.sh}`
- Theia 1.76 installed packages: `theia/node_modules/@theia/{file-search,monaco}/lib/browser/*quick-access*.js`, `quick-file-open.js`
- `.planning/research/chrome-bar-firefox-gap.md` (the proposals validated above)

---
*Architecture research for: v1.5 Chrome Bar Firefox Parity*
*Researched: 2026-10-20*
