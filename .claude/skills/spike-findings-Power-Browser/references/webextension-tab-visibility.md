# WebExtension tab visibility (EXT-04)

How PB web tabs, which are chrome-owned `<xul:browser>` overlays in the `powerbrowser:main` shell
window, become tabs that Firefox WebExtensions can see. The route was decided in
`.planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md` (signed off 2026-10-21)
and built in Phase 31.1: `patches/050-extension-tab-host.patch` plus the tab host in
`powerbrowser/shell/powerbrowser.js`.

## Requirements

- The Theia frame never enters the extension tab tracker and has no `messagemanagergroup`.
  Without that, every all-sites content script would run inside the authenticated IDE.
- Gecko changes go through the patch stack only (hard rule 2). Private upstream members are
  never overridden at runtime.
- The GUI-01 stock window stays reachable.

## How to Build It

1. **Open the tracker gate in the patch stack.** `050-extension-tab-host.patch` admits a window
   that carries the `extensiontabhost` attribute next to `navigator:browser`. It adds
   zero-tab guards, splits `tabs` from `webDriverTabs` so the Theia frame is never listed, and
   adds skip guards for browserAction `updateWindow`, menus, sessions and sidebarAction. The
   spike version had 7 files. The adversarial check added an `ext-pageAction.js` guard and a
   TabOpen `selectedTab` null guard. The patch in the tree has 11 files.
   Regenerate the patch from a patched tree. Never text-edit it.
2. **Put a tabbrowser-shaped host in the shell, behind PowerBrowserAPI.** The shell needs
   real tab elements, TabOpen/TabSelect/TabClose/TabAttrModified events, a tabs-progress
   fan-out, `selectedTab`/`selectedBrowser`, and `gBrowserInit`. The host mirrors
   `PowerBrowserAPI.webTabs`. `getTabForBrowser` and `gBrowserInit` must land together, or
   content-script `sendMessage` breaks.
3. **Toolbar actions call `action.triggerClickOrPopup(selectedTab)`, never
   `triggerAction(shell)`.** The Theia side renders the buttons. Badge and popup state are read
   chrome-side, through the patch's `updateWindow` skip.
4. **Sub-rulings (Chris):**
   - While the IDE has focus, the last web tab stays the active tab for extensions.
   - Extensions may not navigate an overlay to `moz-extension://` pages; the http(s) rule holds.
   - A derived gate keeps the Theia frame out of the tracker.
5. **Gates:** `ext-tab-host-patch-guards`, `ext-tab-host-scope` (each with a `--self-test`) and
   `ext-tab-host-live` in `scripts/verify-platform.sh`.

## What to Avoid

- **Hidden twin tabs (GUI-04 bridge, spike 002b): INVALIDATED.**
  - Pages load twice, which breaks CSRF tokens, carts and one-time tokens.
  - Extensions act on a hidden copy of the page (nonce-2 while the user sees nonce-1), which
    exposes data.
  - One tab id names two documents.
  - SessionStore saves a phantom window, and links open invisibly in it.
- **Runtime overrides of `windowTracker` internals (spike 002c).** This works, but it is a patch
  with no patch file and breaks without warning on rebase. Gating the shell in only while a web
  tab is selected loses `onUpdated` listeners, leaks removed listeners, and fails extension
  startup with "tab is null".
- **`triggerAction` on the shell window.** It throws, or grants activeTab on the stock tab the
  user is not looking at (Pitfall 12, observed live in 001).
- **Adding `messagemanagergroup` to the Theia frame's browser.** Its absence is what keeps
  content scripts out of the IDE.
- **Trusting `windowTracker.getId(shell)`.** It returns 1 even though the shell is not tracked.
- **Assuming 050's zero-tab guards cover page_action.** They did not. The fix was
  `ext-pageAction.js:169` `isShownForTab(null)`. Test extension startup with zero overlays and
  the IDE focused.

## Constraints

- Baseline without the route (spike 001):
  - `tabs.query` and `windows.getAll` return `[]` for overlays.
  - With no stock window, `{active,currentWindow}` throws because
    `getMostRecentNonPBWindow('navigator:browser')` fails.
  - Overlays read `{tabId:-1, windowId:-1}`.
  - `webRequest` fires with tabId -1, and `webNavigation` drops overlay events.
  - Content scripts inject (overlays carry `messagemanagergroup="browsers"`), but `sender.tab`
    is null.
- Install route for tests: `AddonManager.installTemporaryAddon` from the shell document in chrome
  scope. It works because the build has `MOZ_REQUIRE_SIGNING=false`.
- Rebase cost: 4 of the 7 original patched files conflicted at each ESR major
  (115→128→140).
- `CustomizableUI` refuses any document other than `browser.xhtml`, so popups need their own host.

## Origin

Synthesized from spikes 001, 002a, 002b and 002c.
Sources: `sources/001-ext-visibility-today/`, `sources/002a-ext-route-patch/`,
`sources/002b-ext-route-gui04-bridge/`, `sources/002c-ext-route-chrome-tab-model/`.
