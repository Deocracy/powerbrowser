---
phase: 38-webextensions
reviewed: 2026-11-01T00:00:00Z
depth: deep
files_reviewed: 29
files_reviewed_list:
  - patches/050-extension-tab-host.patch
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/endpoint-allowlist.json
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - powerbrowser/shell/powerbrowser.js
  - scripts/check-internals-boundary.sh
  - scripts/lib/pb-extension-fixtures.mjs
  - scripts/verify-ext-tab-host-live.mjs
  - scripts/verify-ext-tab-host-patch-guards.mjs
  - scripts/verify-ext-tab-host-scope.mjs
  - scripts/verify-extension-actions-live.mjs
  - scripts/verify-extension-actions.mjs
  - scripts/verify-extension-amo-live.mjs
  - scripts/verify-new-window-adopt.mjs
  - scripts/verify-platform.sh
  - scripts/verify-shell-error-copy.mjs
  - scripts/verify-shell-gbrowser-standin.mjs
  - scripts/verify-web-tab-bridge.mjs
  - scripts/verify-webextensions.mjs
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar.css
  - theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx
  - theia/extensions/chrome-bar/src/browser/extensions/extension-popup-anchor.ts
  - theia/extensions/chrome-bar/src/browser/extensions/extension-sidebar-view.ts
  - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
  - theia/extensions/tab-uris/src/browser/web-tab.ts
findings:
  critical: 3
  warning: 9
  info: 8
  total: 20
status: issues_found
---

# Phase 38: Code Review Report

**Reviewed:** 2026-11-01
**Depth:** deep
**Files Reviewed:** 29
**Status:** issues_found

## Summary

Scope: `git diff ead9bf16..HEAD -- . ':!.planning'` at `7eb1bc67` (workspace/p38). Line numbers are at `7eb1bc67`. These upstream callees were read where a finding depends on them: `ext-browserAction.js` (`updateOnChange`, `updateWindow`), `ext-pageAction.js` (`updateOnChange`, `onManifestEntry`), `ExtensionActions.sys.mjs` (`triggerClickOrPopup`), `ext-tabs.js` (`create`, `remove`, `setContentTriggeringPrincipal`, `getTabOrActive`), `ext-tabs-base.js` (`getUserContextIdForCookieStoreId`), `ext-browser.js` (`openOptionsPage`), `ExtensionShortcuts.sys.mjs`, `ExtensionPopups.sys.mjs` (`BasePopup`, `PanelPopup`), `webext-panels.js` and `Extension.sys.mjs` (startup/shutdown order, `clearOnUninstall`). Note: `upstream/` is a symlink to the main checkout, which still carries the pre-Phase-38 patch 050 (the re-patch and rebuild are deferred), so the new 050 lines were read from the patch file, not from `upstream/`.

Static gates at `7eb1bc67`: `verify-extension-actions` (plain and `--self-test`, 28 plants), `verify-webextensions`, `verify-ext-tab-host-scope`, `verify-ext-tab-host-patch-guards`, `verify-web-tab-bridge`, `verify-shell-error-copy`, `verify-shell-gbrowser-standin`, `verify-new-window-adopt` and `check-internals-boundary` (plain and `--catalogue`) all pass. No live script was run.

What holds up: the Theia frame never gets a host node, and every extension entry point resolves tabs only through host nodes. `tabsBridgeCreate` sends `moz-extension:` URLs to the stock window and accepts only http(s) URLs into an overlay. `OVERLAY_LOCATION` still names no extension scheme. Patch 050's `tabs.update` URL wall is intact. The store walls (Theia sender, shell window) run before every extension kind. The private-browsing checks added in `866b535f`/`8fce2695` cover every function that reads an action, sidebar, popup, click, tab page or tab create. Stock `getTabOrActive` and `getNativeTabsFromIDArray` cover `tabs.update` and `tabs.remove` through `canAccessTab`. The extension set is read after `GlobalManager.uninit` and before `Management.emit("shutdown")`, so a stopped extension never shows a row.

The main defect is in the patch 050 amendment. The new `TabHostActionUpdate` signal dispatches on `window.gBrowser.tabContainer`, and the shell's gBrowser stand-in has no such member. The SUMMARY claim that it "is the host strip" confuses the stand-in with Phase 37's separate `promptTabbrowser` facade. Once the patch is applied, every toolbar click, every `setBadgeText`/`setIcon`/`setTitle`, every page-action navigation update and some extension startups throw. No popup can open. The static gates cannot see this because the gBrowser member audit reads `upstream/`, which does not yet carry the new lines (CR-01).

Two further blockers:

- `tabs.create({cookieStoreId})` drops the container and loads the page in the default cookie jar (CR-02).
- `tabs.update({active: true})` on a tab still waiting for its ack moves the host selection to a tab the frontend never shows. Clicks then run on a page the user cannot see (Pitfall 12), and prompts for the visible page are suppressed (CR-03).

No Phase 38 live scenario has run on a built binary.

## Critical Issues

### CR-01: Patch 050's `TabHostActionUpdate` dispatch reads `gBrowser.tabContainer`, which the shell does not define, so every click, badge/icon update and page-action update throws

**File:** `patches/050-extension-tab-host.patch:80`, `:130`; `powerbrowser/shell/powerbrowser.js:77-148`; `powerbrowser/shell/PowerBrowserAPI.sys.mjs:9853-9855`, `:9999`, `:6440-6446`

**Issue:** Both new 050 lines run `window.gBrowser.tabContainer.dispatchEvent(new window.Event("TabHostActionUpdate"))` for the tab host window. The shell's `window.gBrowser` (powerbrowser.js:77-148) has no `tabContainer` member. The only object with `tabContainer: host.strip` is Phase 37's `promptTabbrowser` facade (PowerBrowserAPI.sys.mjs:7225), which is not `window.gBrowser`. No upstream extension code reads `gBrowser.tabContainer` (grep of both `parent/` directories), so these two lines are its only readers. Each call throws `TypeError: window.gBrowser.tabContainer is undefined`:

1. **Every toolbar click fails and no popup can open.** `extensionClick` calls `triggerClickOrPopup(selectedTab)`, which ends with `this.updateOnChange(tab)` (`ExtensionActions.sys.mjs:258`). `ext-browserAction.js:60-72` routes a selected tab to `buttonDelegate.updateWindow(shell)`, which throws after `dispatchClick` and before the popup URL is returned. `handleStoreRequest`'s catch returns `ok: false`. The widget shows "could not reach the extension. Restart ..." and opens the puzzle menu on every click.
2. **Extension writes reject.** `browserAction.setBadgeText`, `setIcon`, `setTitle`, `enable` and `disable` all reach `updateOnChange`, then `updateWindow(shell)`, and the extension's promise rejects. A global or window target iterates `browserWindows()`, so a stock window enumerated after the shell is never updated.
3. **Page actions break on every navigation.** `ext-pageAction.js:34-36` calls `updateButton(target.documentGlobal)` unconditionally, for any tab. `handleLocationChange` runs from the tabs-progress listener. `attachProgress`'s `fan` (:6440-6446) has no try, so the throw also stops every listener registered after it from hearing that `onLocationChange`.
4. **Page-action extensions can fail to start.** `ext-pageAction.js:166-175` calls `updateButton(window)` during `onManifestEntry` when `show_matches` matches the shell's selected tab. The throw rejects `runManifest`, and `Extension.startup` records "Startup: Error".

`verify-shell-gbrowser-standin.mjs` derives the required members from `upstream/`, which still has the old 050 applied (`grep -c TabHostActionUpdate` on both upstream files returns 0). It therefore passes. Rule 7 of `verify-extension-actions.mjs` checks only that `EXTENSION_TAB_EVENTS` lists the event name. The live `popup-action` scenario would go red, but it has not run.

**Fix:** Give the stand-in the member the patch reads, and have the gate read the patch file's added lines:

```js
// PowerBrowserTabHost.install's returned accessors
tabContainer: () => strip,
// powerbrowser.js window.gBrowser
get tabContainer() {
  return host.tabContainer();
},
```

Add `tabContainer` to the stand-in gate's implemented set. Add a rule (to `verify-shell-gbrowser-standin.mjs` or `verify-extension-actions.mjs`) that derives every `window.gBrowser.<member>` read from 050's `+` lines and requires each to be a stand-in member, with a plant that deletes the getter. Do not rely on `upstream/` being re-patched.

**Outcome:** Fixed in `de1dd0e5`. The shell `window.gBrowser` now has `get tabContainer()`, returning the hidden host strip through a new tab host accessor (`tabContainer: () => strip`). That is the node `EXTENSION_TAB_EVENTS` already listens on, so patch 050 and the listener are unchanged and no regeneration was needed. `verify-shell-gbrowser-standin.mjs` now also derives required members from 050's `+` lines, read from the patch text (WR-09). Plant s2 removes the getter, and the gate goes red naming `tabContainer` UNIMPLEMENTED at the patch. Its converse strips the patch's reads and leaves `tabContainer` DEAD SURFACE. The live `popup-action` run is still deferred.

### CR-02: `tabs.create({cookieStoreId})` silently loads the page in the default container

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:10083-10107`

**Issue:** Stock `tabs.create` validates `cookieStoreId` and passes `options.userContextId` to `addTab` (`ext-tabs.js:722-728`). `tabsBridgeCreate` ignores `options.userContextId`. `createPendingOverlay` builds a default-context overlay, and the page loads in the default cookie jar. A container extension (Multi-Account Containers, Temporary Containers) that opens a site in an isolated container gets a tab that shares cookies, storage and logins with every default-context tab. The returned tab reports the default `cookieStoreId`, but the request succeeds, so an extension that does not re-check proceeds as if the site were isolated. `tabs.update` refuses the writes the shell cannot make (pinned, highlighted). `tabs.create` drops this isolation request without any error.

**Fix:** Refuse what the overlay cannot honour, before any element exists:

```js
if (options?.userContextId) {
  throw new extensionLazy.ExtensionUtils.ExtensionError("PowerBrowser refused to open that page: container tabs are not supported in this window.");
}
```

Put this next to the private-window check. Add a `verify-extension-actions` rule and plant for it, and a `tabs-bridge` live row: a `cookieStoreId` create must reject.

**Outcome:** Fixed in `defbc088`, by refusing. `tabsBridgeCreate` throws `ExtensionError("PowerBrowser refused to open that page: container tabs are not supported in this window.")` on any non-zero `options.userContextId`, before either branch opens anything. `firefox-default` maps to 0 and still passes. Neither the overlay path nor the stock-window tab page can carry a container, so honouring it would not be a small change. `verify-extension-actions` rule 12 requires the refusal ahead of the moz-extension route, and plant `container dropped` goes red. The live row is deferred: it needs a fixture with the `cookies` permission and containers enabled, or stock validation rejects the call before it reaches the bridge.

### CR-03: Activating a tab that is still waiting for its ack moves the host selection to a tab the frontend never shows

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:10139-10158`, `:7104-7108`, `:6386-6392`, `:9995-9999`, `:7217-7224`

**Issue:** `createPendingOverlay` sends the `adoptTab` push one microtask after `addTab`, with `background` read at that moment. `tabsBridgeActivate`'s pending branch runs `selectNode(host, tab)` and sets `pending.background = false`. This works only for the synchronous `selectedTab` write inside stock `create`. The common pattern `const t = await tabs.create({url, active: false}); await tabs.update(t.id, {active: true})` reaches `tabsBridgeActivate` after the push has gone with `background: true` but before the frontend's ack, which needs an async widget creation. In that case:

- `host.selected` becomes the hidden pending node, and no `selectTab` push is ever sent, because `tabId` is null.
- The frontend adopts the tab in the background. `tabHostAddTab`'s `built` branch selects the node only when `activeTabByFrame` names it, which it does not.
- The user still sees the opener, but `extensionClick` and the `_execute_*` shortcuts run `triggerClickOrPopup` on the hidden tab. That grants `activeTab` and runs the extension on a page the user cannot see, which is the Pitfall 12 wrong-page bug the bridge exists to prevent.
- `promptVisibleTab` now fails for the visible tab (`host.byTabId.get(tabId) !== host.selected`), so the visible page's permission prompts stop showing.

This lasts until the user focuses a page or switches tabs. Gate rule 6 checks only the spelling `triggerClickOrPopup(selectedTab)`, and the live `tabs-bridge` scenario activates `/c` only after it is adopted, so neither covers this case.

**Fix:** Never move the host selection ahead of the frontend for a tab the frontend has not been told to show. Record the request and honour it on the ack:

```js
// tabsBridgeActivate, pending branch
for (const pending of pendingContent.values()) {
  if (pending.browser === tab.linkedBrowser) {
    pending.background = false;   // still read if the push has not gone
    pending.activateOnAck = true; // the push may already have gone
  }
}
return; // no selectNode here: webTabActivated selects it once the frontend shows it

// adoptPendingOverlay, after tabHostAddTab
if (pending.activateOnAck) {
  sendWebTabPush(theiaBrowser, { kind: "selectTab", tabId });
}
```

Stock `create`'s synchronous `selectedTab` write must still select the node at once, because `tabs.create` returns `active: true`. Restrict the deferred path to calls made after the push has been sent, using a `pending.pushed` flag set inside the microtask. Add a live row: background create, immediate `tabs.update({active})`, and the tab must be the frontend's current widget and `host.selected`.

**Outcome:** Fixed in `4bc15671`, by deferring. `createPendingOverlay` sets `pending.pushed` when the adoptTab push goes:

- **Push not yet sent** (stock create's synchronous write): `tabsBridgeActivate` selects the node and clears `background`, as before.
- **Push already sent:** it only records `activateOnAck`. `adoptPendingOverlay` copies that onto the adopted entry (`activateOnAttach`). `webTabOpen`'s already-open branch is the widget's own open on attach. There, chrome pushes `selectTab`, and `webTabActivated` then selects the node. The push is not sent from the ack itself because the frontend acks before `addWidget`, so a `selectTab` sent at the ack would find no attached widget.

`verify-extension-actions` rule 6 requires this shape. Plants `activate ahead of ack` and `deferred activation never shown` go red. The live `tabs-bridge` scenario gains a step on `/d`: fixture op `create-activate`, which creates in the background and activates at once. It requires `/d` to end both current in the frontend and `host.selected`. Live run deferred. Until the attach, `tabs.update` returns the tab with `active: false`.

## Warnings

### WR-01: The "only its own pages" check in `extensionOpenTabPage` always passes for `tabs.create`, and the no-window branch loads the extension URL with the system principal

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:10248-10252`, `:10262-10270`; `scripts/verify-extension-actions.mjs` rule 12 and plant `foreign extension page`

**Issue:** For an extension URL, stock `tabs.create` replaces `options.triggeringPrincipal` with `createContentPrincipal(url)` (`ext-tabs.js:743-747`, `:608-623`) before calling `addTab`. That principal's `addonId` comes from the URL's own host. So `principal?.addonId !== policy.id` compares the URL with itself and is never true: extension A can open extension B's page. Stock Firefox allows this too, so it is not a regression against stock. The comment, the INTERNAL-APIS row and the gate all claim a refusal that does not happen. The gate checks for the text, and its plant replaces that text with `false`, so it cannot detect this. Separately, with no started stock window, the URL goes to `PowerBrowserAPI.openBrowserWindow(url)`. That loads through `loadOneOrMoreURIs`, whose triggering principal defaults to the system principal. This is the path the `openStockTab` comment calls "a real escalation" for non-web schemes, and it is reached here with a `moz-extension:` URL.

**Fix:** Either carry the caller's identity across `addTab` (a regenerated 050 hunk that sets `options.callerPrincipal = context.principal` in tab host windows, compared here), or delete the claim, the INTERNAL-APIS wording and the plant so they match stock. For the window branch, open the window empty (`openBrowserWindow("")`), wait for `browser-delayed-startup-finished`, then `addTab(url, { triggeringPrincipal: principal })`. Never pass a non-web URL through `openBrowserWindow`.

### WR-02: Closing the popup because focus moved into the page pulls focus back to the address pill

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:9949-9965`; `theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx:193-202`; `scripts/verify-extension-actions-live.mjs:190-205`

**Issue:** `onDestroy` always calls `bridge.theiaBrowser.focus()`. The frontend then sees `popupOpen` go false and calls `focusAddressPill()`. When the close was caused by `pageFocus` (focus entering a web tab) or by `TabSelect`, this takes focus away from the page the user or the page just focused. The user's next keystrokes go into the address bar. It also pushes page focus as null, which disables the extension keys. The UI-SPEC line ("Focus returns to the pill on close") and the live close way `focus into page /a`, which requires `pillFocused`, both encode this behaviour.

**Fix:** Pass the close reason to `onDestroy`. Refocus the Theia frame only for Esc, a second click and the panel's own rollup. Leave focus where it is for `pageFocus` and `TabSelect`. Add a `refocus: false` field to the push so the widget skips `focusAddressPill()`, and change the live row to require page focus after the page-focus close.

### WR-03: `tabs.remove` resolves before the tab is closed

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:10111-10119`; `theia/extensions/tab-uris/src/browser/web-tab.ts:1695-1698`

**Issue:** Stock `tabs.remove` calls `removeTab` synchronously and documents that "all tabs are actually closed when the browser.tabs.remove() promise resolves" (`ext-tabs.js:846-849`). For an adopted tab, `tabsBridgeRemove` only pushes `closeAdoptedTab`. The node and overlay go when the frontend's close later reaches `webTabClose`. After `await tabs.remove(id)`, `tabs.get(id)` still returns the tab and `tabs.query` still lists it, and `onRemoved` fires later. If the frontend is reloading or unresponsive, nothing closes and no error is returned.

**Fix:** Drop the host node synchronously (`tabHostDropTab`, so `TabClose`/`onRemoved` fire before the promise resolves), close the overlay chrome-side (`PowerBrowserAPI.webTabClose(tabId)`), then push `closeAdoptedTab` so the frontend removes its widget.

### WR-04: The Remove confirm tells the user the extension's data stays until restart; upstream deletes it at once

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` (`removeExtensionBody`); `powerbrowser/shell/PowerBrowserAPI.sys.mjs:10030-10043`

**Issue:** The confirm row says "The extension and its data stay in the profile until the browser restarts." `addon.uninstall()` uninstalls an active WebExtension immediately. `ExtensionAddonObserver.onUninstalled` → `clearOnUninstall` (`Extension.sys.mjs:507-575`) then clears permissions, cache, service workers and stored data, unless `extensions.webextensions.keepStorageOnUninstall` is set, and the shell does not set it. This promise of recoverability appears right before a destructive action.

**Fix:** Change the copy (and 38-UI-SPEC line 159) to state the real effect, for example "The extension and its data are removed from this profile." Do not promise data retention unless the shell sets the keep-storage pref.

### WR-05: The sidebar panel browser and an open popup are not torn down with the frontend that owns them

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:10169-10200`, `:4007-4019`

**Issue:** `webTabDropOwnedBy` closes every overlay when the frontend's WindowGlobal dies (reload, sidecar swap). The sidebar `<browser>` is not tied to it. It stays at its last rect with `visibility: visible`, painted over the reloading frontend, until a new frontend subscribes, recreates the view and reports geometry. If the subscribe fails, it stays there.

**Fix:** In the same teardown path, set the open sidebar frame's `visibility` to `hidden` (chrome keeps it open, and the next subscribe's push re-shows the view) and close any open extension popup for that window.

### WR-06: An extension tab page that opened successfully is reported as an error, and `openOptionsPage` reopens instead of switching

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:10262-10275`, `:10281-10284`

**Issue:** With no started stock window, the page opens in a new window, and then `ExtensionError("PowerBrowser opened that page in a new browser window.")` is thrown. `tabs.create` therefore rejects after the page has opened. In `runtime.openOptionsPage`, the throw escapes `switchToTabHavingURI`, so the extension gets an error for a success. A stock window that exists but has not finished delayed startup also gets a second window. `switchToTabHavingURI` always adds a tab, so every Options click opens a duplicate instead of switching to the open one, which is what the name promises and what stock does.

**Fix:** Wait for `browser-delayed-startup-finished` on the window just opened (as stock `create` does) and return its tab. In the receiver, look for an existing tab with that URI in the chosen stock window and select it, and add a tab only when none exists. Never throw on the success path.

### WR-07: Two live plants return red unconditionally, and one simulates a symptom

**File:** `scripts/verify-extension-actions-live.mjs:502-505`, `:543-546`, `:175-182`

**Issue:** The `sidebar-as-tab` and `tabpage-in-overlay` branches run `return verdict(false, ...)` whatever the product does. They can never be green, so they prove nothing about the product. The static audit accepts them because the expected text is emitted. `popup-dom` blocks the native panel with a `preventDefault` listener and draws a DOM node itself. It shows that the scenario detects a planted symptom, not that the product cannot regress. This is the pattern 37-REVIEW WR-07 rejected.

**Fix:** Make each plant change what the product does and read the result through the same assertion the clean run uses. For example, replace `extensionOpenTabPage` in chrome (via `live.inChrome`) with a call that opens an overlay, then run the normal `tab-pages` assertions. If that is not possible, remove the plant and rely on static rules 11 and 12, saying so in the file header.

### WR-08: The privileged-caller fence is shared by every privileged kind, so it widened when the extension widget was added

**File:** `scripts/verify-web-tab-bridge.mjs:234-237`, `:729`

**Issue:** `PRIVILEGED_CALLERS` is one list for every privileged store kind. Adding `extension-actions-widget.tsx` lets that file call `readClipboardText`, `removeBookmark`, `clearHistory` and every other privileged kind. It also lets `address-bar.tsx` and `chrome-bar-widget.tsx` call `extensionRemove`, `extensionClick` and `extensionSidebar*`. The gate cannot go red on either.

**Fix:** Key the homes by kind: a `Map<kind, files[]>` where the extension kinds map only to `extension-actions-widget.tsx` and the earlier kinds keep their two files. Add one plant per direction: `readClipboardText` in the extension widget, and `extensionRemove` in `address-bar.tsx`.

### WR-09: Rules 6 and 14 match spelling, not the property, and the gBrowser audit cannot see unapplied 050 lines

**File:** `scripts/verify-extension-actions.mjs` rule 6 (click path), rule 14 (private browsing), plant `click path re-targeted`; `scripts/verify-shell-gbrowser-standin.mjs`

**Issue:** Rule 6 requires the text `triggerClickOrPopup(selectedTab)`, not that `selectedTab` is the host's current selection. Its plant renames the argument. CR-03 shows the host selection itself can diverge, and no rule can see it. Rule 14 accepts a function if its body contains `.canAccessWindow(` anywhere, whether or not that check guards the sink. In `tabsBridgeCreate`, the check is skipped when the principal has no `addonId`, and the rule cannot tell. The gBrowser audit derives from `upstream/`, which lags the patch file whenever a re-patch is deferred. That is how CR-01 passed every static gate.

**Fix:** In rule 6, also require the binding `const selectedTab = tabHosts.get(win)?.selected` inside `extensionClick`. Add a rule that the only `selectNode(` calls in the extension section are on nodes the frontend has acknowledged (see CR-03). In rule 14, require the check to appear on a line before the sink that returns or throws. Make the gBrowser audit read 050's `+` lines in addition to `upstream/` (see CR-01).

**Outcome:** Fixed in `de1dd0e5` (gBrowser audit) and `bcea29df` (rules 6 and 14). The CR-03 `selectNode` rule landed in `4bc15671`.

- **gBrowser audit:** derives from 050's added lines as well as from `upstream/` (see CR-01).
- **Rule 6:** also requires `const selectedTab = tabHosts.get(win)?.selected` inside `extensionClick` (plant `click selection unbound`). The CR-03 part restricts `tabsBridgeActivate` to two `selectNode(` calls: one for an adopted tab and one for a pending tab whose push has not gone.
- **Rule 14:** the check must come before its sink, unless the sink line resolves the window the check tests (`extensionOpenTabPage`'s `getMostRecentWindow`). Within three lines it must also return, throw, continue or replace that window. Plants `private check without effect` and `private check after its sink` cover this.
- **Not tightened:** a guard made conditional on its own input. `tabsBridgeCreate` skips the check when the principal has no `addonId`. Stock `tabs.create` always passes the extension's `context.principal`, so only a non-extension caller reaches that skip.

## Info

### IN-01: The icon cache never evicts

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:9680`, `:9759-9762`

**Issue:** `extensionIconData` keeps every icon URL's data-URL promise for the process lifetime. An extension that animates its icon with `setIcon({imageData})` adds a new entry on every frame.

**Fix:** Key the cache by extension and drop an extension's entries on `shutdown`, or cap it with an LRU.

### IN-02: `tabs.create` silently ignores `pinned`, `discarded`, `title` and `index`

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:10083-10107`

**Issue:** Patch 050 makes `tabs.update` refuse `pinned`, but `tabs.create({pinned: true})` succeeds with an unpinned tab. `discarded: true` loads eagerly, and `index` is ignored.

**Fix:** Throw the same refusal for `options.pinned` and `options.createLazyBrowser` as `tabs.update` does for pinned.

### IN-03: `extensionShortcutOf` dereferences an extension that may have stopped

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:10393-10398`

**Issue:** `extension.manifestVersion` is read without a null check. An extension that stops during the push's awaited icon reads makes `extensionMap.get` return undefined, and the whole push is logged as a read failure.

**Fix:** Return null when `extension` is undefined.

### IN-04: A sidebar page's `window.close()` throws in `webext-panels.js` and the sidebar stays open

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:10169-10188`

**Issue:** `webext-panels.js:110-120` calls `windowRoot.window.SidebarController.hide()`. The shell window has no `SidebarController`, so the handler throws before its `stopPropagation`.

**Fix:** Listen for `DOMWindowClose` on the sidebar frame in `extensionSidebarOpen` (capture) and call `extensionSidebarClose`. Alternatively, add a `SidebarController.hide` shim under the Phase 27 policy, with a stand-in gate row.

### IN-05: An install-site failure shows the "restart" copy, and the https check accepts any host

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:10407-10413`; `extension-actions-widget.tsx:401-404`

**Issue:** A non-https `extensions.getAddons.link.url` returns a validation refusal, which the widget shows as "could not reach the extension. Restart ...", and a restart does not fix the pref. The check also accepts any https host, not only the allowlisted add-ons site.

**Fix:** Require the URL's host to be in the allowlist's add-ons rows, and give the install footer its own failure line.

### IN-06: The add-ons-site allowlist rows were probed for the XPI URL, not for the listing page

**File:** `powerbrowser/endpoint-allowlist.json` (the `addons.mozilla.org` row)

**Issue:** The reason "no CDN host is touched" rests on the XPI download URL. The listing page the footer opens also loads its own static assets and images, which were not probed.

**Fix:** Capture one live visit to the listing page and an install with `verify-endpoints`, and record every host contacted.

### IN-07: A popup created before any subscribe leaks its panel and extension context

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:9944-9947`

**Issue:** `shellPanelPopup(...)` appends the panel and builds the popup browser before `extensionPopupRect(win, bridge.theiaBrowser, ...)` reads `bridge`. If a `_execute_*` shortcut fires before the frontend has subscribed, `bridge` is undefined. The throw is caught as `popup-failed`, and the panel is never destroyed or recorded.

**Fix:** Return `"no-bridge"` from `extensionOpenPopup` before building the popup when `extensionBridges.get(win)` is undefined.

### IN-08: The pinned-ids pref is never pruned

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:9676`, `:10030-10043`

**Issue:** Only the shell's own Remove drops an id. An add-on uninstalled from about:addons keeps its pin, and a reinstall shows the button pinned again without the user choosing it.

**Fix:** Drop the id on `apiManager` `uninstall` (or in `pushExtensionActions`, drop ids not installed).

---

_Reviewed: 2026-11-01_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
