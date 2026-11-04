---
spike: 001
idea: webext-tab-visibility
name: ext-visibility-today
type: standard
validates: "Given a test WebExtension installed into a PowerBrowser test profile, when a web tab (overlay) is active, then record exactly what the extension sees"
verdict: VALIDATED
related: [phase-28-webextension-tab-route-spike, phase-38-webextensions, EXT-04, pitfall-12, GUI-01, GUI-05]
tags: [webextensions, tabTracker, windowTracker, overlays, content-scripts, browserAction, live-probe]
---

# Spike 001: What a WebExtension sees today

## What This Validates

Given a test WebExtension (MV2, and the same scripts as MV3) installed into a fresh
PowerBrowser profile, when overlay web tabs are opened, switched, navigated and closed, and a
GUI-01 stock window is opened beside them, then record exactly what the extension sees:
`tabs.query`, `windows.*`, every tab/window/navigation/request event, content-script
injection and `sender`, and what a toolbar-button click targets.

Verdict VALIDATED: every question has a live answer, recorded in `results.json` (MV2) and
`results-mv3.json` (MV3), and each answer is explained by a cited upstream line. The two
runs agree on every observation.

## Research

Code read at `upstream/` = `FIREFOX_153_5_0esr_BUILD1` before building the probe:

| Gate | Where | Effect on an overlay |
|---|---|---|
| `isBrowserWindow` = `windowtype == "navigator:browser"` | `toolkit/components/extensions/parent/ext-tabs-base.js:1739-1743` | shell (`powerbrowser:main`) is never a browser window |
| `browserWindows()` enumerates only those | `ext-tabs-base.js:1764-1772` | `tabs.query`, `windows.getAll` never visit the shell |
| Tab/window listeners attach only to browser windows | `ext-tabs-base.js:2040-2047` (`addListener` loops `browserWindows()`), `:1959-1967` (load), `:1990-1993` (close) | no `TabOpen`/`TabSelect`/`TabClose`/progress listener is ever on the shell |
| TabTracker listens for `TabOpen`/`TabSelect`/`TabClose` | `browser/components/extensions/parent/ext-browser.js:349-352`; progress via `gBrowser.addTabsProgressListener` `:298-300` | no `tabs.onCreated/onActivated/onUpdated/onRemoved` for overlays |
| `getTabForBrowser` defers to `browser.documentGlobal.gBrowser` | `ext-browser.js:377-389` | answered by the shell's own stand-in, which returns `null` on purpose (`powerbrowser/shell/powerbrowser.js:84-91`) |
| `getBrowserData` returns `{-1,-1}` when no tab and the top chrome window is not a browser window | `ext-browser.js:747-770` | every overlay is `tabId -1, windowId -1` |
| `activeTab` = most recent `navigator:browser` window's `selectedTab` | `ext-browser.js:775-781`, `ext-tabs-base.js:1782-1784` | a click resolves to the stock window, or to `null` |
| Content-script gate is the top BC's message-manager group | `toolkit/components/extensions/ExtensionPolicyService.cpp:371-382`, used at `:557-566`; group copied from the `<browser>` attribute at `docshell/base/BrowsingContext.cpp:816-819` | overlays carry `messagemanagergroup="browsers"` (`PowerBrowserAPI.sys.mjs:3259`), so they inject; the Theia frame has none (`powerbrowser.xhtml:58`), so it does not |

Install route chosen: `AddonManager.installTemporaryAddon(nsIFile)` from a chrome-scope
evaluate in the shell document. It worked first time in this build. The result recorded
`MOZ_REQUIRE_SIGNING = false` and `temporarilyInstalled: true`. The profile also sets
`xpinstall.signatures.required=false`, but a temporary install does not need it. The
profile-extensions-dir route was not tried because the first route worked.

## How to Run

```sh
node .planning/spikes/001-ext-visibility-today/run.mjs          # MV2  -> results.json
node .planning/spikes/001-ext-visibility-today/run.mjs --mv3    # MV3  -> results-mv3.json
```

No dev shell needed. Each run takes about 70 s. It launches its own headless
`objdir/dist/bin/powerbrowser` on a fresh profile through `scripts/lib/pb-relaunch.mjs`
`makeProfile`/`withShell`, uses `pb-live-probe.mjs` `openWebTab`/`inChrome`, and kills only
the browser it launched (the `withFirefoxPage` cleanup).

Files:
- `extension/manifest.json`: MV2 manifest. `--mv3` rewrites a temporary copy to MV3:
  `action`, `host_permissions`, `scripting`, an event-page background, and
  `extensions.background.idle.timeout` raised so the page stays alive for the run.
- `extension/background.js`: logs every query and event to the driver's `/log` endpoint
  and takes commands from `/cmd`.
- `extension/content.js`: on `<all_urls>`. Reports injection by a direct POST and by
  `runtime.sendMessage`, and opens a `runtime.connect` port.
- `run.mjs`: the driver. On every step it also records chrome-side ground truth: each
  overlay's `tabTracker.getTabForBrowser`, `getBrowserData` and `messagemanagergroup`,
  plus `windowTracker.topWindow` and `tabTracker.activeTab`.

## What to Expect

The run prints 20 numbered steps and writes a JSON file with `install`, `steps[]` (action
result, chrome ground truth and the extension's snapshot per step),
`noBrowserWindowStacks`, and `log[]` (every extension-side event, tagged with its step).

## Investigation Trail

1. First run (MV2) answered every question. The `messageManagerGroup` read came back
   undefined because the BC property was the wrong read. Re-read as the `<browser>`
   attribute: overlays `"browsers"`, Theia frame `null`.
2. With no stock window open, the background's `tabs.query({active, currentWindow})`,
   `windows.getCurrent()` and `windows.getLastFocused()` all rejected with the sanitised
   `"An unexpected error occurred"`. The first chrome-side repro passed a raw `queryInfo`
   and failed on `parseMatchPatterns(undefined)`. That failure was my mistake: the schema
   layer normalises every absent key to `null` (`ext-tabs-base.js:2322-2327`). With a
   null-filling proxy, the real cause showed up: `nsIWindowMediator.getMostRecentNonPBWindow`
   throws `NS_ERROR_FAILURE` when no `navigator:browser` window exists. The throw is in the
   `topNonPBWindow` getter (`ext-tabs-base.js:1792-1794`), reached through `getTopWindow`
   (`:1804-1808`) → `getCurrentWindow` (`:1833-1835`) → `getWindow` (`:1854-1856`) →
   `candidates` (`:2486-2499`); the mediator side is `xpfe/appshell/nsWindowMediator.cpp:275-289`.
   `windows.getCurrent/getLastFocused` fail separately: `canAccessWindow(null)` throws a
   TypeError (`browser/components/extensions/parent/ext-windows.js:181-195` →
   `Extension.sys.mjs:3790-3791`).
3. Added the step `triggerAction(shell)` with a stock window open, to see whether a click
   from the shell would silently retarget to the stock tab. It does, partly. See Results Q5.
4. Added the MV3 variant. Its results match MV2 on every observation (host permissions were
   granted at temporary install, so content scripts injected).
5. Side observation: navigating overlay B from `/b` to `/c` left `/b`'s port open but
   frozen. The page went into the bfcache: it answered no ping, and its port disconnected
   only when the overlay closed. Stock tabs behave the same. It is recorded here because
   the port is the only live channel to an overlay (Q4).

## Results

**Q1. Do overlays appear in `tabs.query`?** No. With two overlays open and no stock window,
`tabs.query({})` returns `[]` and `windows.getAll()` returns `[]` (steps 2-10).
`tabs.query({active:true, currentWindow:true})` and `{lastFocusedWindow:true}` do not return
empty: they reject with "An unexpected error occurred" (Trail 2). Once the GUI-01 stock
window opens, every query returns only the stock tab (`id 1, windowId 31`). That stays true
after the shell window is focused and overlay B is the visible page (steps 15-20). In that
state `windows.onFocusChanged(-1)` fires, `getCurrent()` returns window 31 with
`focused:false`, and `{active, currentWindow}` still answers the stock tab. Cause:
`ext-tabs-base.js:1739-1743` and `:1764-1772`.

**Q2. What tabId/windowId does an overlay get?** `{tabId:-1, windowId:-1}`, read directly
from `tabTracker.getBrowserData(overlay)` at every step. `getTabForBrowser(overlay)` is `null`
(`ext-browser.js:377-389` → the stand-in at `powerbrowser.js:89-91`), and the shell is not a
browser window (`ext-browser.js:760-766`). The Theia frame gets the same `{-1,-1}`.
A trap for anyone reading the trackers by hand: `windowTracker.getId(shellWindow)` returns
`1`, a non-null id, because `getId` maps any window. A non-null id does not mean the window
is tracked.

**Q3. Do events fire for overlay create/activate/navigate/close?**
- `tabs.onCreated/onActivated/onUpdated/onRemoved`: none for any overlay operation. The
  first tab event of the run is the stock tab's `onCreated` (step 11). Listeners attach
  only to `navigator:browser` windows (`ext-tabs-base.js:2040-2047`, `ext-browser.js:298-300, 349-352`).
- `windows.onCreated/onRemoved`: none for the shell.
- `webNavigation.onCommitted`: none for overlays. It is dropped when `tabId < 0`
  (`toolkit/components/extensions/parent/ext-webNavigation.js:166-170`). It fires for the stock tab.
- `webRequest.onBeforeRequest`: does fire for overlay main-frame loads (`/a`, `/b`, `/c`),
  with `tabId:-1, frameId:0`. The tabId comes from `tabTracker.getBrowserData`
  (`toolkit/components/extensions/webrequest/WebRequest.sys.mjs:849-853`, used at `:783`).
  A blocker therefore sees overlay traffic but cannot attribute it to a tab.
- Overlay close: no tab event. The only signal is `runtime.Port.onDisconnect` from that
  page's content script (step 10).

**Q4. Do content scripts inject into overlay pages?** Yes, on every overlay load
(`/a`, `/b`, `/c`), because overlays carry `messagemanagergroup="browsers"`
(`ExtensionPolicyService.cpp:371-382`). Messaging works both ways:
- `runtime.sendMessage` is delivered and its reply returns.
- `runtime.connect` ports work in both directions (ping → pong).
- `sender.tab` is `null`, and `sender.frameId` is absent, because both are set only when
  `tabId > 0` (`toolkit/components/extensions/ExtensionParent.sys.mjs:304-313`).
- `sender.url`, `origin` and `documentId` are present.
- The background cannot start contact with an overlay: `tabs.sendMessage(-1)` fails schema
  validation, and an overlay has no other id. Only a port opened by the content script
  reaches it.
- The Theia frame (`http://127.0.0.1:<sidecar>/`) is never injected, because its
  `<browser>` has no `messagemanagergroup` (`powerbrowser.xhtml:58`). This attribute is
  load-bearing for security: adding `messagemanagergroup="browsers"` to the Theia frame
  would run every `<all_urls>` content script inside the authenticated Theia UI.

**Q5. What does a browserAction click target?**
- The widget exists only in the stock window's `nav-bar`; the shell has no widget node.
- `triggerAction(stockWindow)` fires `onClicked` with the stock tab (`id 1, /s`). It does
  the same when the shell is focused and overlay B is the page on screen (step 16), and
  `tabs.executeScript` on the "active tab" then runs in `/s` (step 17). This confirms the
  wrong-page bug in Pitfall 12: the extension acts on a page the user is not looking at.
  Path: `ext-browserAction.js:555-571` uses `window.gBrowser.selectedTab` of the window it
  is given.
- `triggerAction(shellWindow)` with no stock window throws
  `nativeTab is null`. `gBrowser.selectedTab` is `undefined` on the stand-in; the default
  parameter `addActiveTabPermission(nativeTab = tabTracker.activeTab)` then resolves to
  `null` (`ext-browser.js:1256`, `:775-781`); `canAccessTab(null)` dereferences it (`:1264-1266`).
- `triggerAction(shellWindow)` with a stock window open first grants `activeTab` on the
  **stock** tab (the same default parameter now resolves to it). It then throws
  `nativeTab is undefined` in `activateScripts(undefined)` → `getWrapper` → `canAccessTab`
  (`ext-tabs-base.js:2225-2226`, `:2272-2274`). The click never dispatches, but a permission
  grant has already retargeted to a page the user did not choose.
- MV3 `action` behaves the same (it shares `ext-browserAction.js`).

**For Phase 28 (route choice).** Untested lead: `getTabForBrowser` is answered by our own
stand-in, not by Gecko. Returning a real shell-document tab node there would probably give
overlays a non-negative `tabId` and therefore `sender.tab`, webRequest attribution and
webNavigation, with no patch: `getBrowserData` takes the `nativeTab` branch at
`ext-browser.js:757-759`, and `setId` needs only `parentNode` and an open window, at
`:391-397`. It would not change `tabs.query`, `windows.*` or any tab event, because those
are all gated on `windowtype == "navigator:browser"` in `ext-tabs-base.js`. Full visibility
therefore needs either a patch to `WindowTracker.isBrowserWindow`/`browserWindows` plus a
`TabOpen`/`TabSelect`/`TabClose`/progress event source on the shell, or the GUI-05 bridge's
chrome-owned tab model. A tab node returned from the stand-in is the fabricated tab that
`powerbrowser.js:80-82` rules out today, so Phase 28 must decide it explicitly.
