---
spike: 002c
idea: webext-tab-visibility
name: ext-route-chrome-tab-model
type: comparison
validates: "Given the shell window grows a tabbrowser-shaped gBrowser stand-in (tab nodes, selectedTab, getTabForBrowser, TabOpen/TabSelect/TabClose, a tabs-progress fan-out) and registers with the extension windowTracker/tabTracker from chrome-side code, with no Gecko patch, when overlays are opened, switched, navigated and closed, then tabs.query returns overlays, tab events fire, and the toolbar click targets the overlay on screen"
verdict: PARTIAL
related: [001-ext-visibility-today, phase-28-webextension-tab-route-spike, phase-32-page-tools, phase-34-tab-strip, phase-35-shell-furniture, phase-36-new-window-adoption, phase-37-prompts, phase-38-webextensions, EXT-04, EXT-05, EXT-06, EXT-07, EXT-08, EXT-09, EXT-10, pitfall-2, pitfall-12, D3, GUI-05]
tags: [webextensions, tabTracker, windowTracker, gBrowser-stand-in, getTabForBrowser, CustomizableUI, live-probe, security]
---

# Spike 002c: a chrome-side tab model registered with the extension trackers

## What This Validates

Can the shell window supply a tabbrowser-shaped `gBrowser` and register with the extension
`windowTracker`/`tabTracker` from chrome-side (PowerBrowserAPI-side) code, with no Gecko
patch, so that extensions see overlay web tabs as tabs?

Verdict: **PARTIAL.**

- It works live. `tabs.query`, `windows.getAll`, `tabs.onCreated/onActivated/onUpdated/onRemoved`,
  `sender.tab`, `tabs.sendMessage`/`executeScript` by id, `webNavigation`, `webRequest` tab
  attribution and `browserAction.onClicked` with the overlay on screen all work.
- "No Gecko patch" holds only in the narrow sense. The registration half works by overriding
  members of the live upstream `windowTracker` instance at runtime: `isBrowserWindow`,
  `topWindow`, `topNonPBWindow`, `getTopNormalWindow`, and the private
  `_handleWindowOpened`/`_openListeners`. That is a patch with no patch file.
- It breaks things that work today:
  - With the shell registered and no web tab selected, a new extension fails to start.
  - While the shell is registered, `browserAction.setBadgeText`/`setPopup` reject for every
    extension, including in the stock window.
- It opens two security holes that need explicit mitigation.

The un-registered half ("Tier A": a real tab node from `getTabForBrowser`, plus
`gBrowserInit`) is clean, needs no tracker override, and gives most of the per-tab value on
its own.

## Research

Code read at `upstream/` = `FIREFOX_153_5_0esr_BUILD1` before building the probe.

**What a stand-in has to satisfy**
- `TabTracker.getTabForBrowser` → `browser.documentGlobal.gBrowser.getTabForBrowser`
  (`browser/components/extensions/parent/ext-browser.js:377-389`).
- `setId` needs `nativeTab.parentNode` and an open `documentGlobal` (`:391-401`). A plain
  `{linkedBrowser}` record cannot be a tab, so the model uses real XUL element nodes.
- `TabManager.getWrapper` reads `nativeTab.documentGlobal.gBrowserInit.isAdoptingTab()`
  (`:1282-1286`).
- The `Tab` getters read `selected`, `_tPos`, `pinned`, `muted`, `linkedPanel`,
  `getAttribute("busy")`, `gBrowser.getIcon` and `gBrowser.getTabSharingState` (`:789-930`).

**The window gate**
- `WindowTrackerBase.isBrowserWindow` requires `windowtype == "navigator:browser"`
  (`toolkit/components/extensions/parent/ext-tabs-base.js:1739-1743`).
- `topWindow`/`topNonPBWindow` are `Services.wm.getMostRecent*Window("navigator:browser")`
  (`:1782-1795`).
- Listeners attach to a window only at `addListener` time (`:2046-2048`), or on its `load`
  through `_handleWindowOpened` (`:2124-2130`).
- `getTopNormalWindow` goes through `BrowserWindowTracker` (`ext-browser.js:314-323`).
- None of these can be satisfied without either changing the windowtype (ruled out by
  Pitfall 1/2) or overriding the instance members.

**Events and the toolbar button**
- TabTracker events come from `TabOpen`/`TabSelect`/`TabClose` on the window
  (`ext-browser.js:349-352`, handled at `:529-600`). `TabOpen` reads
  `gBrowser.selectedTab.linkedBrowser.frameLoader` (`:543-544`).
- Progress comes through `gBrowser.addTabsProgressListener` (`:298-300`).
- The toolbar button path is `browserAction.triggerAction(window)` →
  `action.triggerClickOrPopup(window.gBrowser.selectedTab)`
  (`browser/components/extensions/parent/ext-browserAction.js:555-571`).
  `updateWindow(window)` → `widget.forWindow(window)` (`:982`) →
  `CustomizableUI.buildWidgetNode`, which throws unless
  `documentURI == chrome://browser/content/browser.xhtml`
  (`browser/components/customizableui/CustomizableUI.sys.mjs:2509-2512`). That is a second
  gate, separate from windowtype, and no stand-in member can satisfy it.

**Readers of `getTabForBrowser` and the other members the model adds (Pitfall 2, D3).**
The table below covers the readers that matter. A full list is in Results Q4.

| Reader | Today (`null` / member absent) | With a tab node (and `selectedBrowser`) |
|---|---|---|
| `LinkHandlerParent.sys.mjs:105-106, 159-160` | throws `tab is null` on `Link:LoadingIcon`/`SetFailedIcon` (seen live) | sets/clears `pendingicon` on the node; no error |
| `LinkHandlerParent.sys.mjs:177-178, 246-262` | `setIconFromLink` returns before the Places write and before `setIcon` | writes the favicon to Places (`setFaviconForPage`) and calls `gBrowser.setIcon(tab, dataURL, originalURL)` (seen live) |
| `LinkHandlerParent.sys.mjs:141-147` → `OpenSearchManager.addEngine` (`browser/components/search/OpenSearchManager.sys.mjs:87-125`) | page OpenSearch engines are ignored | engines are recorded per browser; `updateOpenSearchBadge` runs when the browser is `selectedBrowser` |
| `PromptParent.sys.mjs:222-288` | `getTabForBrowser` is read only inside `if (win.gBrowser.getTabDialogBox)`, which is absent | unchanged while `getTabDialogBox` stays absent. If Phase 37 adds it, a non-null tab plus `privacy.authPromptSpoofingProtection=true` (`firefox.js:1299`) reaches `win.gURLBar.setURI()` and `setTabLabelForAuthPrompts` for cross-domain auth, and the stand-in has neither |
| `ContextMenuParent.sys.mjs` | does not read `getTabForBrowser` at this tag (`:33-46, 160-215` read `win.nsContextMenu`) | unchanged. `ext-menus.js:1343` (menus.onClicked during background wakeup) now finds the tab |
| `PopupNotifications.sys.mjs:282-373` | not constructed in the shell | unchanged by this route. Phase 37 would pass the tabbrowser: `selectedBrowser` now exists, and `tabContainer` (not added here) gates its `TabSelect`/`TabClose` listeners (`:370-373`) |
| `AboutReaderParent.sys.mjs:165, 187` | returns early (`browser != undefined`) | proceeds and throws `button is null` (seen live, from `selectedBrowser`) |
| `FormValidationParent.sys.mjs:92` | returns early for every overlay: no validation popup | proceeds into the popup path, which needs Phase 35 furniture |
| `ProcessHangMonitor.sys.mjs:505-520`, `ext-runtime.js:113` | "nonspecific tab" hang text; no `tabId` in `runtime.onPerformanceWarning` | names the selected tab; reports `tabId` |
| `ContentCrashHandlers.sys.mjs:299-306`, `AboutTabCrashedParent.sys.mjs:30` | background-crash recovery never gets a tab | calls `gBrowser.updateBrowserRemoteness` and `SessionStore.reviveCrashedTab(tab)`, which the stand-in lacks |
| `webrtcUI.sys.mjs:240, 580-582`, `SharingUtils.sys.mjs:113-121` | no tab | now sets `gBrowser.selectedTab = tab` to reveal a sharing tab, which needs a setter routed to Theia |
| `remote/shared/TabManager.sys.mjs:169-177` (WebDriver BiDi `activate`/`close`/`handleUserPrompt`) | `getTabForBrowsingContext` is `null` for overlays | returns the node. The harness kept working through every step of all runs |

## How to Run

```sh
node .planning/spikes/002c-ext-route-chrome-tab-model/run.mjs                        # layers added one at a time -> results-incremental.json
node .planning/spikes/002c-ext-route-chrome-tab-model/run.mjs --early --gate-always  # full model before install   -> results-early-gate-always.json
node .planning/spikes/002c-ext-route-chrome-tab-model/run.mjs --early                # gate whenSelected            -> results-early.json
node .planning/spikes/002c-ext-route-chrome-tab-model/run.mjs --early --rebackfill   # + re-attach on gate open     -> results-early-rebackfill.json
```

- No dev shell is needed. Each run takes about 100 s.
- Each run launches its own `objdir/dist/bin/powerbrowser` on a fresh profile through
  `scripts/lib/pb-relaunch.mjs` `makeProfile`/`withShell`, and kills only that browser.
- `tab-model.js` is the throwaway chrome-side model. It is evaluated in the shell document
  and switched on in three cumulative layers:
  - `node`: `getTabForBrowser` returns a real element node.
  - `init`: `window.gBrowserInit`, `getIcon`, `getTabSharingState` and `isTab`.
  - `register`: the tracker-instance overrides, `selectedTab`/`selectedBrowser`/`selectedTabs`,
    `TabOpen`/`TabSelect`/`TabClose`/`TabAttrModified`, the tabs-progress fan-out, and the
    late backfill.
- It also has:
  - three Theia-record modes (`plain` = the product's record; `hidden` = a record that
    `getWrapper` skips; `node` = an exposed tab);
  - two gate modes (`always`, `whenSelected`);
  - a console-error recorder tagged by stage.
- It observes the product's own `gBrowser.tabs.push`/`splice` (`PowerBrowserAPI.sys.mjs:3290`,
  `:3498-3502`). Selection follows `PowerBrowserWebTabs.activeTabIdOf`, polled every 100 ms.
- `extension/` is spike 001's recorder plus id-addressed and write operations. Its manifest
  declares `browser_action`, `page_action` with `show_matches`, `sidebar_action` and
  `commands`, so per-window startup paths run.

No product file was edited. `git -C upstream diff` is empty, and nothing is committed.

## What to Expect

Each results file has `startupState`, `modelInstall`, `registerReport`, `steps[]` and
`log[]`, plus `model.calls` (the stand-in's `setIcon`/`selectedTab=` calls) and
`model.errors` (every chrome-side error, tagged by stage).

- Each step records the action result.
- It records chrome ground truth:
  - each overlay's `tabTracker.getBrowserData`;
  - `windowTracker.isBrowserWindow(shell)`;
  - `topWindow`;
  - `tabTracker.activeTab`.
- It records the extension's snapshot of `tabs.query` × 3 and `windows.getAll`/`getCurrent`/
  `getLastFocused`.
- `log[]` holds every extension-side event, tagged with its step.

Noise to ignore: `DataCloneError: Response object could not be cloned` comes from the spike
extension's own listeners, which return a `fetch` promise.

## Investigation Trail

1. **Startup state.**
   - When the shell is ready, `ext-browser.js` is already loaded.
   - 7 built-in extensions are active.
   - `windowTracker` already has 15 listener types and 2 open-listeners.

   So a product registration always runs late, and must backfill listeners that are already
   attached to stock windows only.
2. **Incremental run, layer `node` only.**
   - Overlays get real ids: `getBrowserData` is `{tabId:1, windowId:1}`.
   - `webRequest` and `webNavigation.onCommitted` carry the id.
   - `tabs.sendMessage(id)` reaches the content script.
   - `tabs.executeScript(id)` fails.
   - **Content-script `runtime.sendMessage` regresses from working to "An unexpected error
     occurred"**, because `sender.tab` conversion hits
     `nativeTab.documentGlobal.gBrowserInit is undefined` (`ext-browser.js:1283`).

   `node` must never land without `init`.
3. **Layer `init` added.**
   - `sender.tab` is populated.
   - `tabs.executeScript(id)` returns `["…/a","page /a"]`.
   - `tabs.get(id)` works.
   - `tabs.onUpdated` fires for `isArticle` only.
   - `tabs.query` is still `[]`, and the window queries still throw: the window gate is
     untouched.
   - Control: `browserAction.setBadgeText` resolves.
4. **Layer `register`, late.** The first registration attempt left the Theia record `plain`.
   `tabs.query({})` and `windows.getAll` then threw: the record has no `documentGlobal`. The
   backfill's open-listeners also threw:
   - `Cannot attach ID to a destroyed tab`: `TabTracker._handleWindowOpen` emits activation
     for `gBrowser.tabs[0]`, which is the Theia record.
   - `SidebarController is undefined` (`ext-sidebarAction.js:149`).
   - `nativeTab is null`.

   Switching the Theia record to `hidden` (a `documentGlobal.gBrowserInit.isAdoptingTab()`
   that returns true, so `getWrapper` skips it) made the queries work. Every event then fired
   for overlays (Results Q1-Q2).
5. **Early run, gate `always`.** I ran this to mimic a product that registers before
   extensions install. The test extension **failed to start**:
   `ExtensionActions.sys.mjs:494` `tab is null`, because the `page_action` `show_matches`
   `isShownForTab(selectedTab)` ran on the shell with no selected tab. Then
   `Browser load failed: NS_ERROR_NOT_AVAILABLE`. The policy never became active
   (`results-early-gate-always.json`).
6. **Early run, gate `whenSelected`.** The shell counts as a browser window only while a web
   tab is selected.
   - The extension started.
   - With no web tab, `tabs.query` returns `[]` instead of throwing.
   - `tabs.onCreated/onActivated` fired.
   - **`tabs.onUpdated` never fired for overlays.** The extension added its listeners while
     the gate was closed, so they were never attached to the shell (`results-early.json`).
7. **Early run, gate `whenSelected` plus a re-attach on every closed-to-open transition**
   (`_handleWindowOpened(shell)`, which is idempotent through DOM and Set dedup).
   `onUpdated` fired with `status`, `url` and `title` (`results-early-rebackfill.json`).
   Unresolved: `removeListener` iterates `browserWindows()`, so a listener removed while the
   gate is closed stays on the shell. An extension disabled with no web tab selected would
   leak its listeners into the shell.
8. **Edge cases in the early runs** (Results Q3, Q5). These covered the Theia record as an
   exposed tab, the writes (`update`, `create`, `remove`), the toolbar click,
   `setPopup`/`setBadgeText`, and a GUI-01 stock window open beside the shell.
9. Added a Tier-A write check to the incremental run, without registration.
   `tabs.update(id, {url: moz-extension page})` navigates the overlay. The hole does not need
   the registration half.

## Results

**Q1. Does `tabs.query` return overlays?** Yes, once registered with the Theia record hidden:
`tabs.query({})` returns `[{id:2,windowId:1,index:0},{id:3,windowId:1,index:1,active:true}]`.

- `{active, currentWindow}` follows the Theia selection (A, then B, then B navigated to `/c`).
- `windows.getAll` returns window `1` with 2 tabs.
- With the GUI-01 stock window open, both windows are listed, and `currentWindow` follows
  focus:
  - shell focused → `windows.getCurrent` = 1, active tab = the selected overlay;
  - stock window focused → 35.
- Spike 001's wrong-window answer is gone.

Caveats measured:

- The shell's window `type` is `"popup"`, not `"normal"`: `WindowBase.type` reads
  `CHROME_TOOLBAR` in the app window's chrome flags (`ext-tabs-base.js:1080-1092`).
  `tabs.query({windowType:"normal"})` and `windows.getAll({windowTypes:["normal"]})` return
  `[]` for the shell.
- With gate `always` and no web tab, every query throws. Firefox's invariant is that a
  browser window always has a `selectedTab` (`Window.activeTab`, `ext-browser.js:1146-1158`).

**Q2. Do events fire?**

| Event | Late registration | Early, gate `whenSelected` | Early, gate `whenSelected` + re-attach |
|---|---|---|---|
| `tabs.onCreated` (overlay open) | yes | yes | yes |
| `tabs.onActivated` (Theia selection change) | yes, with `previousTabId` | yes | yes |
| `tabs.onUpdated` status/url/title | yes | **no** | yes |
| `tabs.onRemoved` (overlay close through Theia) | yes, `isWindowClosing:false` | yes | yes |
| `webNavigation.onCommitted` | yes, with `tabId` | yes | yes |
| `webRequest` `tabId` | real id | real id | real id |
| `windows.onFocusChanged` | (not exercised) | `-1` then `1` on shell focus | same |

`windows.onCreated` never fires for the shell, because it was never "opened" as a browser
window.

**Q3. Toolbar button (EXT-07, Pitfall 12).**

- `triggerAction(shell)` and the direct `action.triggerClickOrPopup(selectedTab)` both
  delivered `browserAction.onClicked` with the **overlay on screen**: id 3 `/c`, and later
  id 2 with the stock window open. Then each threw `buildWidget was called for a non-browser
  window!`, because `updateWindow(shell)` asks CustomizableUI for a widget node in a
  non-`browser.xhtml` document.
- `triggerAction(stock window)` still targets the stock tab (id 5). That is correct for a
  click in that window.
- Pitfall 12's wrong-page bug is fixed for a Theia-rendered button that calls
  `triggerClickOrPopup` with the selected overlay.

What breaks:

- While the shell is registered, `browserAction.setBadgeText` (global) and `setPopup` reject
  for the extension, whichever window is in front. The control call in the incremental run,
  made with the shell not registered, resolved.
- A per-tab `setBadgeText` on the stock tab still resolved.
- The popup path (`openPopup` against a CUI widget node) cannot work in the shell. This was
  not reached live because `setPopup` rejected first.

**Q4. Readers that flip** (live where marked; the rest from code). Good for v1.5:

- **favicons, live:** `setIcon(tab node, data:…, /icon.png)` is called, and the
  `LinkHandlerParent` `tab is null` errors from 24-GAPS disappear;
- the Places favicon write now happens (Phase 32/33);
- OpenSearch engines are recorded per browser (Phase 29);
- `FormValidationParent` stops returning early (Phase 35);
- BiDi gets a tab for overlays.

Bad unless the model grows further:

- **live:** `AboutReaderParent` throws `button is null`;
- crash recovery calls `updateBrowserRemoteness`/`reviveCrashedTab`;
- webrtc and sharing set `gBrowser.selectedTab`;
- PromptParent's auth-spoofing branch becomes reachable as soon as `getTabDialogBox` exists.

**Q5. Writes and security.**

- `tabs.update(id, {active:true})` resolves `active:false`. The stand-in setter has no route to
  the Theia frontend.
- `tabs.create` → `window.gBrowser.addTab is not a function` (`ext-tabs.js:809`), because
  `getTopNormalWindow` now returns the shell.
- `tabs.remove` → `gBrowser.removeTab is not a function` (`ext-tabs.js:835`).
- `pageAction.show` resolves, with no surface to show it on.
- **Security 1:** `tabs.update(id, {url: "popup.html"})` navigated an overlay to
  `moz-extension://…/popup.html`. This happens even with only the Tier-A layers (incremental
  step 17). It bypasses the http(s) wall that `webTabOpen`/`webTabNavigate` apply
  (`PowerBrowserAPI.sys.mjs:3233`). In Firefox this is ordinary extension behaviour; here an
  overlay that Theia treats as a web tab then hosts a privileged extension page. The route
  needs a ruling plus a chrome-side check on overlay location changes.
- **Security 2:** with the Theia record exposed as a tab node, `tabs.query` listed
  `http://127.0.0.1:<sidecar>/`, and `tabs.executeScript(4)` ran in the authenticated Theia UI
  and returned its title. The `messagemanagergroup` absence that spike 001 found protects only
  declarative content scripts, not programmatic injection. Any chrome tab model must keep the
  Theia record out of the tracker. The `hidden` record works, but it does so by borrowing the
  `isAdoptingTab` guard.

**Q6. Answers for Phase 28.**

- **Gecko patch?**
  - Tier A (`node` + `init`) needs none.
  - Full visibility through this route needs none in `upstream/`. Instead it needs runtime
    overrides of upstream instance members, including two private ones (`_handleWindowOpened`,
    `_listeners`/`_openListeners`), plus ordering hacks: the gate and the re-attach.
  - The CustomizableUI `documentURI` gate cannot be overridden from outside the module, so
    toolbar badges, popups and `setPopup` need either a patch to skip non-CUI windows in
    `ext-browserAction.updateWindow`, or a Theia-rendered surface plus a patch.

  A patch-stack version (WindowTracker accepting a registered windowtype, `topWindow` over
  both types, and `updateWindow` skipping a window with no widget) is smaller and fails loudly
  on rebase. The override version fails silently.
- **GUI-05 bridge?** Not needed. This route is itself a chrome-owned tab model of the kind
  GUI-05 describes. It reuses `TabUriRegistry`'s ownership, because overlays stay owned by
  `PowerBrowserAPI.webTabs`. It is compatible with rule 3.

## Phases, size and requirements

**Phases changed:**

- **32**: favicons come from `setIcon(tab, …)` through the existing LinkHandler path, which
  replaces the Places read and reverses the 2026-10-20 "keep null" ruling (D3). Reader view and
  crash recovery readers flip and need either members or interception.
- **34**: the model's node list is a natural tab-strip source. Its order (`_tPos`), pinned and
  muted state then become extension-visible and must be kept true.
- **35**: `selectedBrowser` makes `FormValidationParent`/`AboutReaderParent` proceed, so the
  furniture installer must land with or before it. A `tabContainer` member would also arm
  `PopupNotifications` and the product's own `startTabStoreTriggers`. That is safe only because
  `startTabStoreTriggers` enumerates `navigator:browser` only (`PowerBrowserAPI.sys.mjs:3101`).
- **36**: adopted overlays must go through the model's `push` so that `TabOpen` fires. The
  `openWindowInfo` adoption path needs `gBrowserInit.getTabToAdopt` to stay `null`.
- **37**: adding `getTabDialogBox` together with a real tab makes PromptParent's
  auth-spoofing branch reachable, which calls `gURLBar.setURI` and `setTabLabelForAuthPrompts`.
  Plan both together.
- **38**: the toolbar button must call `triggerClickOrPopup(selectedTab)` from a Theia surface,
  and must never go through `triggerAction(shell)`. Badge, icon and popup need the
  `updateWindow` fix. `tabs.create`/`remove`/`update{active}` need the `addTab`/`removeTab`
  members and the `selectedTab` setter routed to Theia.
- **29**: page OpenSearch engines become available per overlay.

**Size: XL** for the full route (Tier B). **M** for Tier A alone.

**EXT-05..10 coverage:**

| Req | This route |
|---|---|
| EXT-05 | Mostly met: query, events and active tab work. Not met for `windowType:"normal"` filters, `windows.onCreated`, or gate edge cases |
| EXT-06 | Not met: badge, icon and popup break against CustomizableUI |
| EXT-07 | Click: met (correct tab). Popup: not met |
| EXT-08 | Content scripts and messaging: met (`sender.tab`, `sendMessage` by id). Page actions: no surface. Context-menu entries: not tested |
| EXT-09 | Not addressed (AMO install is orthogonal) |
| EXT-10 | Not tested; password managers rely on `sender.tab` and `tabs.query`, both now working |
