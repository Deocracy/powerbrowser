---
spike: 002a
idea: webext-tab-visibility
name: ext-route-patch
type: comparison
validates: "Given a patch in patches/ that lets the extension window and tab trackers accept the powerbrowser:main window and treat its overlay <xul:browser> elements as tabs, when a WebExtension runs against overlays, then it sees them as Firefox tabs; and record the minimal hook surface, the rebase risk, and the tabbrowser API the shell must then provide"
verdict: PARTIAL
related: [spike-001-ext-visibility-today, spike-002b, spike-002c, phase-28-webextension-tab-route-spike, phase-32-page-tools, phase-34-tab-strip, phase-35-shell-furniture, phase-36-new-window-links, phase-37-prompts, phase-38-webextensions, EXT-04, EXT-05, EXT-06, EXT-07, EXT-08, EXT-09, EXT-10, pitfall-12, GUI-01, GUI-04, GUI-05, D-74]
tags: [webextensions, patch-stack, windowTracker, tabTracker, tabbrowser-shape, rebase-risk, live-probe, comparison]
---

# Spike 002a: The patch route for WebExtension tab visibility

## What This Validates

Route (a) of Phase 28: change Gecko through a patch in `patches/` so the extension framework
treats the shell window as a browser window and its overlays as tabs. This spike asks four
things:

1. What is the smallest hook surface?
2. Does it give extensions Firefox-equivalent tabs, proven live?
3. How risky is it to rebase?
4. What tabbrowser API do the extension parents then call on the shell window?

**Verdict: PARTIAL.**

- The route works for the tab model. With the patch logic running on the built binary, a real
  extension sees overlays as ordinary tabs:
  - `tabs.query` returns them with real tab and window ids.
  - `tabs.onCreated`, `onActivated`, `onUpdated` and `onRemoved` fire.
  - `windows.*` reports the shell window.
  - `webNavigation` events arrive and `webRequest` reports the right `tabId`.
  - `sender.tab` is set on content-script messages.
  - `tabs.executeScript` and `tabs.sendMessage` work by tab id.
  - A toolbar click runs against the overlay the user is looking at, including for an
    activeTab-only extension, even with a stock window open. This fixes the Pitfall 12
    wrong-page bug.
- The route is not a patch-only route. The patch only opens a gate. Behind the gate the shell
  must provide a tabbrowser-shaped `gBrowser` with real tab elements, which is route (c)'s
  chrome-side tab model.
- The patch does not deliver EXT-06 (buttons and the puzzle menu), the popup half of EXT-07,
  the page-action and context-menu parts of EXT-08, EXT-09 or EXT-10.
- Admitting the shell window also exposes it to every per-window extension feature. Measured
  live, five of them break, some in the stock window too, unless the patch also guards them.

## Research

The upstream code was read at `upstream/` = `FIREFOX_153_5_0esr_BUILD1` before writing the patch.

**Where the gates are (from spike 001), and the narrowest place to open each:**

| Gate | Site | Hook chosen |
|---|---|---|
| A window counts as a browser window only if `windowtype == "navigator:browser"` | `toolkit/components/extensions/parent/ext-tabs-base.js:1739-1743` | Also accept a document element carrying the attribute `extensiontabhost`. It is brand-neutral and `windowtype` stays unchanged, as Pitfall 1 and the Phase 35 note require. |
| `topWindow` and `topNonPBWindow` ask the window mediator for `"navigator:browser"` only | `ext-tabs-base.js:1782-1794` | `_mostRecentBrowserWindow(nonPB)` tries, in order: the most recent window of any type if it is a browser window; then the most recent stock window; then a tab host window. With no browser window it keeps the old result (null, or the throw). |
| `getTopNormalWindow` uses `BrowserWindowTracker`, which tracks only `browser.js` windows | `browser/components/extensions/parent/ext-browser.js:314-323`; `browser/modules/BrowserWindowTracker.sys.mjs:139-152, 503-514` | When the top browser window is a tab host, return it. |
| Everything else in the tab model already goes through `isBrowserWindow` or `gBrowser` | `browserWindows()` `:1754-1774`; listener install `:2040-2047`; `getWindow` `:1856-1878`; `getBrowserData` `ext-browser.js:747-770`; `getTabForBrowser` `ext-browser.js:377-389` | No hunk needed. |

**Why the hunks name no product.** `configuration.toml` `[identity] app_basename = "powerbrowser"`
is a rebrand value, and `scripts/check-patch-surface.sh`'s brand-value scan rejects it on an
added patch line. So the patch must not spell `powerbrowser:main`, and it is keyed on an
attribute instead. Both patch-stack scans pass with the spike patch added (see Results).

**Theia-frame conflict (found by reading the code, then confirmed live).**

- Today the shell's `gBrowser.tabs` holds `{linkedBrowser: <Theia frame>}` plus one record per
  overlay (`powerbrowser/shell/powerbrowser.js:84-85`, `PowerBrowserAPI.sys.mjs:3290`). That
  list exists only for WebDriver.
- `remote/shared/TabManager.sys.mjs:189-199` finds every content browser through it. The live
  harness's `app.evaluate` into the Theia frame depends on that.
- Once the shell is a browser window, the extension parents iterate the same `gBrowser.tabs`
  (`Window.getTabs` `ext-browser.js:1172-1186`, `_handleWindowOpen` `:631-649`).
- The Theia frame must never be an extension tab. It is the authenticated IDE on `127.0.0.1`,
  and an `<all_urls>` extension could `executeScript` into it. Spike 001 established that the
  Theia frame's lack of a `messagemanagergroup` is what keeps content scripts out of it.
- So the two lists must split. The patch adds one WebDriver hunk: prefer
  `tabBrowser.webDriverTabs` when present. The shell's `gBrowser` then gives extensions
  overlay tab elements only, and gives WebDriver the Theia frame plus the same tab elements.

## How to Run

All commands run from the repo root, outside a dev shell (only `node` and the built binary are
needed). Each live run takes about 2 minutes, runs headless on its own throwaway profile, and
only stops the browser it launched.

```sh
node .planning/spikes/002a-ext-route-patch/run.mjs              # the patch's logic plus the prototype tab host -> results.json
node .planning/spikes/002a-ext-route-patch/run.mjs --no-guards  # only the three window-gate hunks -> results-noguards.json
node .planning/spikes/002a-ext-route-patch/run.mjs --control    # no tab host (today's behaviour) -> results-control.json
node .planning/spikes/002a-ext-route-patch/summarise.mjs [results-*.json]   # compact per-step view
.planning/spikes/002a-ext-route-patch/history.sh <scratch-dir> | tee history.txt   # rebase-risk measurement (gh, read-only)
(cd upstream && git apply --check -v ../.planning/spikes/002a-ext-route-patch/050-extension-tab-host.patch)
```

**How the patch is proven without a rebuild** (a rebuild takes about 50 minutes).
`tabhost.js` runs in chrome scope in the shell document:

1. **Patch emulation.** It installs the patch's + lines, copied verbatim, on the live
   singletons: `ExtensionParent.apiManager.global.windowTracker`, `Window.prototype.activeTab`,
   the `browserAction` class prototype's `updateWindow`, and the WebDriver `TabManager`. It
   then takes the window-open path by hand (`_handleWindowOpened`, `_handleWindowOpen`),
   which a patched build would reach from the shell's `load` event.
2. **Prototype tab host.** This is the shell half the route needs:
   - the `extensiontabhost` attribute;
   - a `gBrowser` whose `tabs` are real hidden XUL elements, one per overlay and never the
     Theia frame, plus `webDriverTabs`;
   - a `gBrowserInit` stub;
   - `TabOpen`, `TabSelect`, `TabClose` and `TabAttrModified` events (label, busy);
   - a tabs-progress fan-out.

   Overlay lifecycle is observed with a MutationObserver: `<browser>` added or removed, and
   `style.visibility` becoming visible. A product version would hook `webTabOpen`,
   `webTabClose` and `webTabGeometry` instead.

The guards in `ext-menus.js`, `ext-sessions.js` and `ext-sidebarAction.js` live in module
scopes an evaluate cannot reach, so they are not emulated. Their failures are recorded instead.

Files:

- `050-extension-tab-host.patch` — the would-be patch, generated with `git diff --no-index`
  from patched copies (never hand-edited). It is not applied to `upstream/`.
- `tabhost.js` — the emulation and the prototype tab host.
- `run.mjs` — the driver. It imports `scripts/lib/pb-relaunch.mjs` and
  `scripts/lib/pb-live-probe.mjs` unmodified.
- `extension/` — spike 001's probe, widened with tab-id operations and `favIconUrl`.
- `extension-activetab/` — the activeTab-only probe.
- `extension-furniture/` — the per-window features probe: browserAction badge, menus, sessions,
  pageAction, sidebarAction, zoom.
- `summarise.mjs`
- `history.sh` and its output `history.txt`
- `results.json`, `results-noguards.json`, `results-control.json`

## What to Expect

In `results.json`:

- Overlays get tab ids 1 and 2 in window 1 (the shell).
- The stock window is 33.
- `extTabsUrls` never contains the Theia frame.
- `webDriverBrowsers` always starts with `THEIA-FRAME`.

In `results-control.json`, every overlay is `tabId -1`, as in spike 001.

In `results-noguards.json`:

- `setBadgeText` rejects.
- The stock window's furniture badge stays empty.
- The active-tab query errors whenever the shell has no overlay.

## Investigation Trail

1. **The first live run failed in the emulation itself.** `TabTracker._handleWindowOpen` calls
   `emitActivated(window.gBrowser.tabs[0])` (`ext-browser.js:646`). The shell opens with zero
   web tabs, which a tabbrowser window never does, so it threw
   `nativeTab is undefined` (`results-noguards.json` → `tabhost.handleWindowOpenThrew`).

   A second zero-tab failure followed: `Window.activeTab` passes a null `selectedTab` to
   `getWrapper` (`ext-browser.js:1196`, `:1283`). With no overlay open,
   `tabs.query({active:true,currentWindow:true})` then fails with "An unexpected error
   occurred" (no-guards run, steps 1, 33 and 34, stack recorded). Two guard hunks fix both.
   The query's caller already tolerates a null active tab (`ext-tabs-base.js:2346-2349`).

2. **Also on the first run, every toolbar update threw** `buildWidget was called for a
   non-browser window!` (`CustomizableUI.sys.mjs:2510-2511`, keyed on
   `documentURI == browser.xhtml`). It came from `ext-browserAction.js:982` on every `TabSelect`.

   On the second run a global `browserAction.setBadgeText` **rejected, and the stock window's
   button never got the badge**. `updateOnChange` loops `browserWindows()`
   (`ext-browserAction.js:68`). The shell enumerates first and throws, so the loop stops before
   the stock window (no-guards run, steps 20 and 27; the furniture badge stays `""`).

   This is the general hazard of the route: **admitting a window into `isBrowserWindow` hands
   it to every per-window feature.** I enumerated them:
   - `browserWindows()` consumers: `ext-browserAction.js:68`, `ext-menus.js:1031,1040`,
     `ext-sidebarAction.js:95,116,131,241`, `ext-pageAction.js:169`, `ext-sessions.js:32,209`,
     `ext-tabGroups.js:54`, `ext-tabs.js:1330`
   - window-open listeners: `ext-menus.js:1034`, `ext-sidebarAction.js:65`

   A third extension, installed after the shell was admitted, measured which ones break. The
   table is in Results.

3. **Selection while the IDE has focus (step 7).** `preferences:open` hid both overlays, but
   the extension's active tab stayed the last overlay. A tabbrowser always has a visible
   selected tab; the shell does not. A toolbar press while the user is in an editor would act
   on a page they cannot see. The tab host has to choose between keeping the last web tab and
   clearing `selectedTab`. Clearing it is now safe for queries, thanks to the activeTab guard,
   but `TabTracker`'s `TabOpen` handler still reads `selectedTab.linkedBrowser`
   (`ext-browser.js:557-562`). That needs Chris's ruling.

4. **Chrome-initiated tab operations.**
   - `tabs.update(id, {active:true})` returned `active:false` silently: the `selectedTab`
     setter was unsupported in the host (step 13, trace `selectedTab=`).
   - `tabs.create` failed: `addTab` was unsupported (step 14).

   Upstream assigns `gBrowser.selectedTab` and calls `addTab`, `removeTab`, `moveTabTo`,
   `pinTab` and so on. The shell can only honour those through a **chrome → Theia request**:
   overlays are created and selected by the Theia frontend. That is the direction Phase 36
   builds for chrome-created pending overlays.

5. **Window type.** `windows.getAll` reports the shell as `"type":"popup"` (step 9).
   `WindowBase.type` returns popup when `CHROME_TOOLBAR` is absent
   (`ext-tabs-base.js:1080-1092`). A separate live read gave the shell's
   `chromeFlags = 2150630918`, which has no toolbar bit, and `window.toolbar.visible = false`.
   Extensions that filter `windowType:"normal"` will miss overlays. The fix is the flags the
   startup window opens with (not tested).

6. **Favicons came for free (Phase 32).** Once `getTabForBrowser` returns a real tab element,
   `LinkHandlerParent` calls `gBrowser.setIcon(tab, …)` with the page icon (steps 2, 3 and 6,
   `host setIcon isTab:true`). `Tab.favIconUrl` then reports it to extensions through
   `getIcon`. This contradicts the Phase 32 technical ruling of 2026-10-20 that
   `getTabForBrowser` keeps returning null.

   Other actors also take their "has a tab" branch:
   - `PromptParent.sys.mjs:232` goes to the tab-modal path with `getTabDialogBox` (Phase 37).
   - `TabStateFlusher.sys.mjs:105` reads `linkedPanel`.
   - `CanonicalURLParent.sys.mjs:41` and `PageDataService.sys.mjs:566` activate.
   - `AboutTabCrashedParent.sys.mjs:30`.

   `scripts/verify-shell-gbrowser-standin.mjs`'s DELIBERATELY_ABSENT set
   (`getNotificationBox`, `getTabDialogBox`, `refreshBlocked`, `removeTab`,
   `setTabLabelForAuthPrompts`) and the rule at `powerbrowser.js:80-82` ("None of them
   synthesises a tab object") are overturned by this route.

7. **Rebase history.** The pinned checkout is shallow (one commit), so `history.sh` uses the
   GitHub API. Results are in the next section.

## Results

### Live (`results.json` vs `results-control.json`, same driver and same steps)

| Observation | Today (control) | With this route |
|---|---|---|
| `tabs.query({})` with 2 overlays and no stock window | `[]` | `1:/a w1`, `2:/c* w1` |
| `tabs.query({active,currentWindow})` | "An unexpected error occurred" | the visible overlay; it follows activate A → B |
| `tabs.on{Created,Activated,Updated,Removed}` for overlays | none | all fire, with `previousTabId`, url/title/status changes and `isWindowClosing:false` |
| `windows.getAll` / `getCurrent` / `getLastFocused`; `onFocusChanged` | shell absent | shell is window 1 (`type:"popup"`, see trail 5); focus changes 33 → 1 reported |
| `webNavigation.onCommitted` / `webRequest.onBeforeRequest` tabId | dropped / `-1` | `1`, `2` |
| content script `sender.tab` | null | full tab, including `favIconUrl` |
| `tabs.executeScript(tabId)` / `tabs.sendMessage(tabId)` on a background overlay | schema error (id -1) | `["/a"]` / reply from `/a` |
| toolbar click in the shell, probe ext and activeTab-only ext | throws | `onClicked` gets overlay `/c`; activeTab `executeScript` returns `["/c"]` |
| click with a stock window open, shell focused, overlay B visible | throws, after granting activeTab on the stock tab | activeTab ext gets `/c`; a stock-window click still gets `/s` |
| `tabs.query` urls over the whole run | — | only `/a`, `/b`, `/c`, `/s`; the Theia frame never appears; WebDriver still evaluates in the Theia frame (`webDriverStillReachesTheia`) |
| zero overlays: active-tab query | throws (`getMostRecentNonPBWindow` NS_ERROR_FAILURE) | `[]` (guard hunk) |
| `tabs.update(active)` / `tabs.create` | schema error | returns `active:false` silently / "An unexpected error occurred" (no chrome → Theia path) |

### Per-window features once the shell is admitted (furniture extension, stock window open)

| Feature | Error in the shell | Effect | Guard in the patch |
|---|---|---|---|
| browserAction updates (`ext-browserAction.js:68,982`) | buildWidget non-browser window | **stock badge not updated**; `setBadgeText` rejects | `updateWindow` skips tab hosts; emulated, stock badge then shows `X` and `Y` |
| sessions (`ext-sessions.js:32,209`) | SessionStore "Window is not tracked" | **`sessions.getRecentlyClosed` fails entirely** (control: `0`) | skip tab hosts in both loops |
| sidebarAction (`ext-sidebarAction.js:95-149`) | `SidebarController is undefined` at install | **sidebar never registered in the stock window**: `isOpen` false (control: true) | 6 skips, plus `isOpen` without a controller |
| menus (`ext-menus.js:1052-1055`) | `menu is null` (no `contentAreaContextMenu`) | async, so the stock window is unaffected; no menu in overlays | skip tab hosts; entries in overlays need Phase 35's page context menu |
| zoom (`ext-tabs.js:1261,1322`) | `ZoomManager is undefined` | `tabs.getZoom(overlay)` fails; `onZoomChange` registration logs an error | none; the shell must provide `ZoomManager`/`FullZoom`/`ZoomUI`, or overlay zoom APIs fail (Phase 32 forbids loading `browser-fullZoom.js`) |
| pageAction (`ext-pageAction.js:169`) | none | `show(overlay)` → `isShown` true; nothing renders (no urlbar) | none; needs a Theia surface |

### The patch (`050-extension-tab-host.patch`)

- 7 files, 19 hunks, +105/−8.
- Applies cleanly to the pinned `upstream/` (`git apply --check`).
- Both patch-stack scans pass over `patches/*.patch` plus this one. I sourced the two functions
  from `scripts/check-patch-surface.sh` unmodified and ran them on a scratch copy:
  compiled-suffix scan exit 0, brand-value scan exit 0.
- It is the first logic patch in a stack that D-74 describes as config-only (130 lines today
  across 4 config patches). That needs an explicit ruling.

| File | Hunks | Purpose |
|---|---|---|
| `toolkit/components/extensions/parent/ext-tabs-base.js` | 3 | `isBrowserWindow` + `isTabHostWindow`; `_mostRecentBrowserWindow`; `topWindow` and `topNonPBWindow` |
| `browser/components/extensions/parent/ext-browser.js` | 3 | `getTopNormalWindow`; zero-tab `_handleWindowOpen`; `Window.activeTab` with no selected tab |
| `remote/shared/TabManager.sys.mjs` | 1 | `webDriverTabs` (keeps the Theia frame out of the extension list) |
| `browser/components/extensions/parent/ext-browserAction.js` | 1 | skip tab hosts in `updateWindow` |
| `browser/components/extensions/parent/ext-menus.js` | 2 | skip tab hosts in `onWindowOpen` and `cleanupWindow` |
| `browser/components/extensions/parent/ext-sessions.js` | 2 | skip tab hosts in both loops |
| `browser/components/extensions/parent/ext-sidebarAction.js` | 7 | skip tab hosts in 4 loops plus `createMenuItem` and `updateWindow`; `isOpen` without a controller |

### Rebase risk (`history.txt`)

| File | Commits on main, ESR 140.0 → 153.0 | On the 153 ESR line, 153.0 → 153.5 |
|---|---|---|
| ext-browserAction.js | 30 | 0 |
| ext-tabs-base.js | 21 | 0 |
| ext-browser.js | 20 | 0 |
| ext-sidebarAction.js | 17 | 0 |
| ext-menus.js | 16 | 0 |
| ext-sessions.js | 13 | 0 |
| remote/shared/TabManager.sys.mjs | 10 | 0 |

`git apply --check` of the patch against each tag's files:

- **Fails** on 115.0esr, 128.0esr and 140.0esr, in 4 of the 7 files.
- **Applies** on 153.0esr and 153.5esr.

The failures fall on the exact lines the hunks touch, which changed in the last cycle:

- `browserWindows()` gained `isBrowserWindowInitialized`.
- `getTopNormalWindow` gained `allowFromInactiveWorkspace` (bug 1983854).
- `TabManager.getTabsForWindow` was reformatted.
- The sidebarAction loops were reworked.

Expect manual conflict resolution in about half the files at every ESR jump, and none within
an ESR line. The guard hunks scale with upstream: a new `browserWindows()` consumer upstream is
a new silent breakage. A permanent gate should derive that consumer list and compare it as set
equality, as `verify-shell-gbrowser-standin.mjs` does.

### Tabbrowser API the extension parents call on the window

Derived by grep over `browser/components/extensions/parent/*.js` plus `ext-tabs-base.js`. The
number in brackets is the call count. Members marked † were exercised live by the prototype
host.

- **`gBrowser`:**
  - Exercised live: `selectedTab`† [23], `tabs`† [15], `getTabForBrowser`† [10],
    `selectedTabs`† [3], `tabGroups`† [2], `currentURI`† [2], `selectedBrowser`† [1],
    `addTabsProgressListener`† / `removeTabsProgressListener`†, `isTab`†, `getIcon`†,
    `getTabSharingState`†, `pinnedTabCount`†.
  - Stubbed: `addTab` [2] and `removeTab` [2].
  - Not provided: `showTab` [2], `hideTab`, `setSuccessor` [2], `replaceInSuccession` [2],
    `moveTabTo` [2], `moveTabsBefore` [2], `moveTabsAfter`, `removeTabs`, `unpinTab`,
    `duplicateTab`, `discardBrowser`, `prepareDiscardBrowser`, `loadURI`, `updateTitlebar`,
    `adoptTab`, `adoptTabGroup`, `adoptSplitView`, `addTabGroup`, `getTabGroupById`,
    `isSplitViewWrapper`.
  - Setter: `selectedTab =`.
- **`gBrowserInit`:** `isAdoptingTab`† [3], `getTabToAdopt`†, `delayedStartupFinished`†.
- **Tab element members:**
  - `documentGlobal`† [27] and `parentNode`†, which must be a real node: `setId` throws
    without `parentNode` (`ext-browser.js:391-397`).
  - `linkedBrowser`† [18], `_tPos`† [6], `ownerDocument`†, `openerTab`†, `muteReason`†,
    `undiscardable`†, `selected`†, `pinned`†, `muted`†, `linkedPanel`†, `group`†,
    `userContextId`†, `splitview`†, `soundPlaying`†, `multiselected`†, `lastAccessed`†,
    `label`†, `hidden`†, `successor`†.
  - `getAttribute("busy")`†, `hasAttribute("attention")`†, `addEventListener`†.
  - `toggleMuteAudio` (stubbed).
- **Tab DOM events dispatched on the tab, bubbling to the window:**
  - Driven by the host: `TabOpen` (`detail.adoptedTab`)†, `TabSelect`
    (`detail.previousTab`)†, `TabClose` (`detail.adoptedBy`)†, `TabAttrModified`
    (`detail.changed`)†.
  - Not driven: `TabMultiSelect`, `TabMove`, `TabPinned`, `TabUnpinned`, `TabShow`,
    `TabHide`, `TabBrowserInserted`, `TabBrowserDiscarded`, `TabGrouped`, `TabUngrouped`,
    `TabGroup*`.
  - Window-level events `FullZoomChange`, `TextZoomChange`, `focus` and `blur` are also
    listened for.
  - `tabContainer` is read only by `BrowserWindowTracker`, which never tracks the shell.
- **Window globals:**
  - Needed only by features: `SidebarController`, `gUnifiedExtensions`, `BrowserPageActions`,
    `ZoomManager`, `FullZoom`, `ZoomUI`, `gURLBar`, `BrowserAddonUI`,
    `switchToTabHavingURI`, `BROWSER_NEW_TAB_URL`.
  - Generic window members already work: `windowState`, `screenX`, `moveTo` and the rest.
  - The CustomizableUI area requires `documentURI == browser.xhtml`, so it can never be in
    the shell.

### Per-phase consequences (if this route is chosen)

- **Needs a Gecko patch:** yes. The patch is `050`, 7 JS files. No compiled files are touched.
- **Needs GUI-05:** no. It needs a chrome-side tab host, which is the GUI-04 tab model's seed,
  not the unified strip.
- **Phase 29 (search):** no change from this route.
- **Phase 32 (page tools, favicons):**
  - The `getTabForBrowser` → null ruling flips.
  - Favicons arrive through the stock `LinkHandlerParent` → `setIcon(tab)` path (observed).
  - Mute, audio and zoom become tab-host members (`toggleMuteAudio`, `soundPlaying`,
    `ZoomManager`/`FullZoom`), or the matching extension APIs fail on overlays.
- **Phase 34 (tab strip, pinned):** the tab host's order (`_tPos`), `pinned`, `multiselected`
  and the `TabMove`/`TabPinned`/`TabMultiSelect` events must mirror the Theia strip.
  `tabs.move`, `tabs.update({pinned})` and `tabs.highlight` need chrome → Theia requests.
- **Phase 35 (furniture, context menu):**
  - Page actors now take their tab branches (`PromptParent`, `CanonicalURL`, `PageData`,
    `TabStateFlusher`).
  - The standin gate's member set grows to most of the list above.
  - `ext-menus` entries in overlays need `contentAreaContextMenu` in the shell.
- **Phase 36 (new-window adoption):** adopted overlays must arrive as `TabOpen` with
  `openerTab`. `tabs.create` needs exactly the chrome-first overlay creation Phase 36 builds.
- **Phase 37 (prompts):** the `PromptParent` tab-modal branch and `getTabDialogBox` are reached
  as soon as overlays are tabs. EXT-09's install prompt is a PopupNotification and belongs here.
- **Phase 38 (extensions):** planned on patch `050`, a product tab host in `powerbrowser/shell/`
  behind `PowerBrowserAPI`, Theia-rendered buttons and puzzle menu, and a popup host.

### EXT-05 to EXT-10 under this route

- **EXT-05 (tabs API):**
  - Met for query, events and active tab, live.
  - Not met: chrome-initiated mutations (`create`, `update active/url/pinned`, `remove`,
    `move`, `hide`, `discard`) until the chrome → Theia path exists.
  - Not met: zoom.
  - Not met: `windowType:"normal"` filters.
  - Open: active-tab semantics while the IDE has focus need a ruling.
- **EXT-06 (buttons, puzzle menu):** not met by the patch. CustomizableUI refuses the shell
  document. The per-tab action state (`action.getContextData(tab)`) is now keyed on real tabs,
  so a Theia-rendered button can read icon and badge chrome-side.
- **EXT-07 (click → popup or action on the active web tab):**
  - The action half is met, live, including activeTab-only extensions.
  - Popups are not met: a browserAction popup needs a widget node and panel in a
    `browser.xhtml` window.
- **EXT-08 (content scripts, page actions, context menus):**
  - Content scripts are met, now with `sender.tab`.
  - Page actions have state but no UI.
  - Context-menu entries need Phase 35.
- **EXT-09 (AMO install):** not addressed by the route. It needs the Phase 37 PopupNotifications
  and the allowlist change.
- **EXT-10 (popular extensions):** not met until popups exist. An ad blocker and a password
  manager are both popup-driven. Their per-tab `webRequest` and `sender.tab` prerequisites are
  now in place.

### Size and risks

- **Size:**
  - The patch is **S** (105 added lines).
  - Patch plus tab host for EXT-05 and EXT-08 content scripts is **L**: a tab host of roughly
    300–400 lines, chrome → Theia request kinds, and gate updates.
  - The full EXT-05 to EXT-10 is **XL** with the button, puzzle menu and popup host.
- **Main risks:**
  1. The blast radius of `isBrowserWindow`. Five per-window features broke live, three of them
     in the stock window too. Every new upstream `browserWindows()` consumer is a silent
     regression without a derived gate.
  2. Rebase. About half the touched files conflict at every ESR jump; the hunks sit in code
     that changed in the last cycle.
  3. A synthesised tab object is handed to privileged upstream code. This overturns a recorded
     rule and needs Chris's ruling.
  4. The Theia frame's safety now depends on the `tabs`/`webDriverTabs` split being right. A
     regression that puts the Theia record into `tabs` exposes the authenticated IDE to
     `<all_urls>` extensions.
  5. Active-tab semantics while the IDE has focus.
  6. D-74's config-only patch surface must be amended.
  7. Fidelity. The patch was proven by runtime emulation, not a patched build. The menus,
     sessions and sidebar guards were not emulated; they are argued from the recorded failing
     lines. The load-event admission was driven by hand.
