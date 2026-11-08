---
phase: 35-shell-furniture-and-page-context-menu
reviewed: 2026-11-01T08:13:05Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - powerbrowser/shell/powerbrowser.js
  - powerbrowser/shell/powerbrowser.xhtml
  - scripts/check-internals-boundary.sh
  - scripts/verify-page-furniture-live.mjs
  - scripts/verify-page-tools-edit.mjs
  - scripts/verify-permission-prompts.mjs
  - scripts/verify-platform.sh
  - scripts/verify-shell-error-contract.mjs
  - scripts/verify-shell-error-copy.mjs
  - scripts/verify-shell-furniture.mjs
  - scripts/verify-shell-gbrowser-standin.mjs
  - scripts/verify-shortcut-relay.mjs
  - scripts/verify-web-tab-bridge.mjs
  - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar.css
  - theia/extensions/chrome-bar/src/browser/page-context-menu.ts
  - theia/extensions/tab-uris/src/browser/web-tab.css
  - theia/extensions/tab-uris/src/browser/web-tab.ts
findings:
  critical: 2
  warning: 7
  info: 7
  total: 16
status: issues_found
---

# Phase 35: Code Review Report

**Reviewed:** 2026-11-01
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Scope: the files changed by the lane commits `9db907a8..475a5396` (`git diff --name-only 23c08bb5 475a5396 -- powerbrowser scripts theia`), read as they are at `4d34ce5e`, plus the fold commit `4d34ce5e` (which also touches `scripts/verify-permission-prompts.mjs`). Every source file was read with `git show 4d34ce5e:<path>`, not from the working tree. Upstream callees were read where a finding depends on them: `ContextMenuParent`, `ContextMenuChild`, `DOMFullscreenParent`, `PointerLockParent`, `ControllersParent`, `BrowserParent::RecvEnableDisableCommands`, `InlineSpellChecker`, `ext-menus.js`, `SearchUIUtils.loadSearchFromContext` and `browser-fullScreenAndPointerLock.js`.

The static gates were run on an export of `4d34ce5e` (scratchpad copy, with `upstream/` linked). These passed: `verify-shell-furniture` and its `--self-test` (35 plants), `verify-shell-gbrowser-standin` and its `--self-test`, `check-internals-boundary.sh` and `--catalogue`, `verify-permission-prompts` and its `--self-test` (42 plants), `verify-web-tab-bridge`, `verify-shortcut-relay`, `verify-page-tools-edit` and `verify-shell-error-contract`. `verify-shell-error-copy` could not run on the export because it has no `configuration.toml`, so it is not a finding. No `verify-*-live.mjs` script was run.

What holds:

- **One installer.** `installShellFurniture` is the one entry, and powerbrowser.js calls it once, after `PowerBrowserTabHost.install` (`powerbrowser.js:75`). The prompt furniture now runs first inside `installShellFurnitureReceivers` and still finds the tab host.
- **Open grant.** The grant is consumed exactly once, in `webTabAttach`, and used once, by `firstWebTabLoad`. The adopt path passes `undefined` to `webTabOpen` and no grant to `webTabAttach`, so it never takes one.
- **Pick walls.** A pick is single-use, at most 60 s old, and must name an offered row. Every target comes from the captured data.
- **`disablecontextmenu`.** It is set only on `#powerbrowser-content`. `webTabOpen`'s attribute map does not set it, and nothing copies it onto an overlay. `ContextMenuParent` reads it from `rootFrameLoader.ownerElement`, which is the overlay for page content, so the page-menu path is not suppressed.
- **Fullscreen stand-ins.** `FullScreen.enterDomFullscreen`, `cleanupDomFullscreen` and the recipient walk match upstream line for line, apart from the documented omissions.
- **Video Full Screen user-input wrap.** `E10SUtils.wrapHandlingUserInput` is safely scoped. The elevation lasts only for the synchronous `mediaCommand` call, which reads `windowUtils.isHandlingUserInput` and sends one async message. It runs only after a validated pick.
- **Stand-in gate.** `IDL_SHIMS`, `STOCK_INSTANCE_SHIMS` and the registry-derived scope are derived, not hand-kept, and each plant goes red naming its drift.

Defects:

- **Save rows.** A save dialog answered more than 60 s after the right-click drops the save without any message.
- **Edit rows.** The page menu's edit rows read and run the top document's commands even when the right-click was inside a cross-origin iframe.
- **Startup exposure.** The furniture installers run unguarded ahead of `TheiaService.start`.
- **Search row.** It uses the page principal where upstream uses a null principal.
- **Pointer lock.** It is still granted with no warning.
- **Link status.** The status line is never cleared on a tab switch.
- **Dead at this commit.** F11 and Bookmark Page do nothing until Phase 33 merges.
- **Silent refusals.** A chrome-side refusal of a row the menu offered gives no feedback.

## Fix outcome

| Finding | Outcome | Commit | Proof |
|---|---|---|---|
| CR-01 | Fixed; needs a live check | `fcdc2490` | The save pick moves its captured target (URL, referrer, principal, cookie jar) into a per-menu `state.saves` slot that neither the 60 s menu TTL nor `openPageMenu` ends. The path reply answers that slot. `saveTarget` treats anything but `where:"saved"` as a failure and shows `saveTargetExpired` for `stale`. Static gates are green (`verify-shell-error-copy` lists the new sentence). The live pass must answer the dialog after more than 60 s, and also after a second right-click. |
| CR-02 | Fixed; needs a live check | `e9abe240` | `webTabEditContext` picks the browsing context the way `nsWindowRoot::GetControllerForCommand` does: the captured `frameBrowsingContext`, else the focused frame inside the overlay, else top. The edit rows and Copy Image are now chrome rows: one dispatcher arm calls `doCommand` on that frame's `Controllers` actor. The PAGE-09 Edit submenu (`webTabEditReply`, `webTabEditEnabled`) uses the same helper. The edit-state actor is now `allFrames: true`. `verify-page-tools-edit` rule 4 checks `PAGE_MENU_EDIT_CMDS` against the frozen set, and its plant moved there. The live pass needs a cross-origin iframe input. |
| WR-01 | Fixed | `b16ebd61` | Each installer runs in its own `step` in `installShellFurnitureReceivers`, which logs `[furniture] <name> failed (<error name>)` and continues. Furniture plant (x) follows the new call shape. `verify-shell-error-contract` and its `--self-test` are green. |
| WR-02 | Fixed | `abee0c27` | The search row loads with `createNullPrincipal(page originAttributes)` and the page's policy container. It gets no referrer and no `triggeringRemoteType`, as `SearchUIUtils.loadSearchFromContext` does. The page principal still gates `openGrant`. A catalogue row was added. |
| WR-03 | Fixed; needs a live check | `bd2ab5e7` | `window.PointerLock` (`entered`/`exited`) now fires `pointer-lock-entered` and shows the stock `#pointerlock-warning` unless fullscreen. The markup is upstream's, in the furniture block. The warning state machine now takes upstream's `show(origin, elementId, …)` shape. `PointerLock` is on the Phase 27 shim line, and plant (j2) goes red naming `PointerLock.exited`. Catalogue rows were added. |
| WR-04 | Fixed; needs a live check | `3f04b575` | A per-window clearer is registered by `installTooltipsAndLinkStatus`. `webTabActivated` clears the line unconditionally. The overlay listener's top-level `onLocationChange` clears it when that tab owns the line. |
| WR-05 | Fixed (gate half); the literal half was closed by `70f35bbb` | `ed3b2cdd` | `verify-chrome-bar-commands` derives every `executeCommand` in `page-context-menu.ts` and `chrome-bar-shortcuts.ts`. Each must name an imported `*_COMMAND_ID` whose id is contracted and whose `Command` is registered. Three plants go red: the registration renamed, the id re-spelled, and a const that is not imported. |
| WR-06 | Fixed; needs a live check | `835b7940` | `settle` shows `pageMenuRowRefused` (PowerBrowser, the plain problem, then "Right-click the page to choose something else.") for a refused, failed or rejected pick. Show Only This Frame and View Frame Source map a non-start to `refused`. `showInspect` adds `DevToolsShim.isEnabled()`. A first pick on a menu older than 60 s (`stale`) still only refocuses the page. |
| WR-07 | Fixed | `299b363b` | Catalogue rows were added for `new Localization`, `E10SUtils.wrapHandlingUserInput` (synchronous, only after a validated pick) and `Glean.fullscreen.change.cancel`. `'wrapHandlingUserInput' 'Glean.' 'new Localization'` are now in `FORBIDDEN_PATTERNS`, and without the rows `--catalogue` went red on all three lines. Line references were renumbered from `git diff -U0` hunks after every commit, never with `--fix`. `ng-040` normal mode, `--catalogue` and `--self-test` pass. |
| IN-01..IN-07 | Not in scope | | Info findings were not part of this fix pass. |

## Critical Issues

### CR-01: A save row answered after 60 s drops the save without a message

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:8131-8133`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:8151-8155`, `theia/extensions/chrome-bar/src/browser/page-context-menu.ts:224-236`

**Issue:** Save Link As, Save Image As, Save Video As and Save Audio As each take two picks. The first returns `save-pick`, and `handlePageMenuAction` puts the same `pending` back into `state.pending`. `pending.at` is not reset, so the 60 s TTL still counts from the right-click and not from the save-pick. While Theia's save dialog is open:

- if more than 60 s pass between the right-click and the user's answer, the second pick hits `Date.now() - pending.at > PAGE_MENU_TTL_MS` and returns `{ ok: true, where: "stale" }`;
- if any other right-click opens a page menu, `openPageMenu` replaces `state.pending`, and the second pick also returns `{ ok: true, where: "stale" }`.

`saveTarget` shows `saveTargetFailed` only when `reply.ok !== true`, so it shows nothing. The user picks a path, no file is written, no download row appears, and no message says so. This breaks T-35-15 ("no save is silent"). A user browsing folders in a save dialog for a minute is an ordinary case. The live `menu-save` row answers the dialog at once, so it cannot see this.

**Fix:** Restart the clock when the save-pick re-arms the menu. The frontend should then treat anything other than `saved` as a failure:

```js
if (result.where === "save-pick") {
  pending.savePick = data.itemId;
  pending.at = Date.now(); // the path reply gets its own minute
  state.pending = pending;
}
```

```ts
if (path !== undefined && (reply.ok !== true || reply.where !== 'saved')) {
    this.messages.error(CHROME_BAR_COPY.saveTargetFailed(appSubject()));
}
```

Optionally, keep a save-pick pending when `openPageMenu` would replace it, or give it a separate slot.

### CR-02: The page menu's edit rows use the top document, not the right-clicked frame

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:8369-8387` (`pageEditFacts`), `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6643-6658` (`webTabEditReply`), `theia/extensions/chrome-bar/src/browser/page-context-menu.ts:67-75`

**Issue:** `pageEditFacts` reads the command state from `data.browser.browsingContext.currentWindowGlobal.getActor("Controllers")`, which is the top-level window global. The edit rows then run `widget.edit(cmd)`, and `webTabEditReply` executes the command on the same top-level actor. Upstream Gecko delivers each frame's command updates to that frame's own `ControllersParent` (`BrowserParent.cpp:2722-2735`: `do_QueryActor("Controllers", aContext...GetCurrentWindowGlobal())`, `allFrames: true`). With Fission, a cross-origin iframe runs in another process, so for a right-click inside it:

- **Undo, Redo, Cut, Copy, Paste, Delete.** These rows are disabled from the top document's state, even when the iframe has a selection or a focused input. Typical cases are embedded comment boxes, payment fields and editors.
- **Select All.** It shows enabled and selects the outer page, not the iframe.
- **Copy Image.** It has no `off` predicate and runs `cmd_copyImage` on the top docShell. The command node `ContextMenuChild` set belongs to the iframe's document viewer, so the copy does nothing. It may copy an image from an earlier top-level right-click, if that document viewer still holds that node.

`data.frameBrowsingContext` (the right-clicked frame, `ContextMenuParent.sys.mjs:207`) is already captured but not used for this. The live `menu-edit` and Copy Image rows test top-level fields only. This misses D-12's "each item works" for any iframe content.

**Fix:** Read the facts from the frame and run the commands there. The pick should then run the command chrome-side, the way spelling already does, rather than through the tab-wide `webTabEdit` route:

```js
const controller = data.frameBrowsingContext?.currentWindowGlobal?.getActor("Controllers");
```

Make the edit rows `runs: "chrome"` with one dispatcher arm that calls `controller.doCommand(cmd)` on that frame's actor (Paste still only from the pick). Add a live row with a cross-origin iframe input.

## Warnings

### WR-01: One throw in a furniture installer stops Theia from starting

**File:** `powerbrowser/shell/powerbrowser.js:172`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7653-7659`

**Issue:** `installShellFurnitureReceivers` runs four installers in sequence with no guard. They do the following:

- `getElementById(...).addEventListener` on `#contentAreaContextMenu` and `#fullscreen-exit-button`;
- `docShell.treeOwner...getInterface(Ci.nsIAppWindow)`;
- construct `PopupNotifications`;
- register custom-element callbacks.

The call sits in the `DOMContentLoaded` handler, before `window.powerbrowserShowError` (`:193`) and `TheiaService.start` (`:357`). A throw from any installer ends the handler at that point, so:

- the remaining furniture is not installed;
- the error layer is never defined;
- Theia is never started.

The shell then stays on the branded loading layer with no error copy and no next step. Phase 35 adds three installers to a chain that previously held one.

**Fix:** Isolate each installer and log the failure with a fixed string:

```js
for (const install of [installPermissionPromptFurniture, installTooltipsAndLinkStatus, installPageContextMenu, installFullscreen]) {
  try {
    install(window);
  } catch (err) {
    PowerBrowserAPI.log("error", `[furniture] ${install.name} failed (${err && err.name ? err.name : "error"})`);
  }
}
```

Alternatively, wrap the single call in `powerbrowser.js` so the shell still reaches `TheiaService.start`.

### WR-02: The search row loads with the page's principal, not upstream's null principal

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:8222-8223`

**Issue:** `context-searchselect` mints its grant with `pageMenuLoad(data, undefined)`, so the search results page loads with `triggeringPrincipal: data.principal`, the right-clicked page's principal. Upstream `SearchUIUtils.loadSearchFromContext` always replaces it with `Services.scriptSecurityManager.createNullPrincipal(triggeringPrincipal.originAttributes)`, at `SearchUIUtils.sys.mjs:546-548`. With the page principal, the engine receives the request as a cross-site navigation started by the page. That affects `Sec-Fetch-Site` and SameSite=Strict cookies. The comment ("loadSearch with the bar engine; no referrer") claims parity that the code does not have. D-06 asks for the page's principal for page-chosen targets, but the search URL is chosen by the browser, not the page.

**Fix:** Use upstream's principal for this row:

```js
case "context-searchselect":
  return openGrant(state, data.principal, facts.search.url, {
    ...pageMenuLoad(data, undefined),
    triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal(data.principal.originAttributes),
  }, "browser.search.context.loadInBackground");
```

The `Services.scriptSecurityManager` line needs a catalogue row.

### WR-03: Pointer lock is granted with no warning, and its actor throws

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:8595-8603` (the `installFullscreen` header listing the omissions), `scripts/check-internals-boundary.sh:83`

**Issue:** The `PointerLock` actor has no `messageManagerGroups`, so it runs for overlays. `PointerLockParent.receiveMessage` calls `browser.documentGlobal.PointerLock.entered(origin)` and `.exited()`, at `PointerLockParent.sys.mjs:10-17`. The shell defines no `window.PointerLock`, so both calls throw a TypeError. The page's pointer lock itself still succeeds in content, so a page can hide the real cursor and draw its own with no "<domain> has control of your pointer. Press Esc" warning. That warning is the spoofing mitigation Firefox ships.

This phase ported the warning state machine (`showWarning`/`closeWarning`) and chose to leave out `#pointerlock-warning`. The stand-in gate does not cover the gap, because `PointerLock` is not one of the quoted shim names on the Phase 27 line, so nothing shows that the actor fails. The gap existed before this phase. This phase is where the decision was made, and it recorded no consequence.

**Fix:** Do one of the following:

- port `PointerLock` (`entered`/`exited`) with upstream's `#pointerlock-warning` markup and reuse `showWarning`/`closeWarning` keyed by element id;
- refuse pointer lock for overlays.

Add `PointerLock` to the Phase 27 shim line so the stand-in gate compares it.

### WR-04: The link status line belongs to no tab and is not cleared on a tab switch or a navigation

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:241-247`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7684-7715`

**Issue:** `pageStatus` is one field for the whole bar. The `overLink` handler checks only that the pushed tab still exists, not that it is the current tab. Chrome clears the line in two cases only: on a `mouseover` outside every overlay, or when content sends `setOverLink("")`. Two situations leave a stale URL:

- The pointer rests on a link and the user switches tabs from the keyboard. The pointer has not moved, so neither clear fires, and the bar keeps showing the first tab's link target over the second tab's page.
- A link click navigates. The new page sends no leave, so the URL can stay.

Upstream clears the overlink in `XULBrowserWindow.onLocationChange` and when the selected browser changes. A link-target line that names a page other than the visible one is misleading in a security-relevant place.

**Fix:**

- Keep the status per tab and render only the current tab's value.
- Clear it in chrome when a top-level location changes, the way `entry.listener.onLocationChange` would.
- Clear it when the overlay goes from visible to hidden in `webTabGeometry` (`queue(tabId, "")`).

### WR-05: F11 and Bookmark Page do nothing at this commit, and no gate ties their command ids to Phase 33

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts:121`, `:202`, `theia/extensions/chrome-bar/src/browser/page-context-menu.ts:54`, `:66`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7771`

**Issue:** At `4d34ce5e`, `powerbrowser.chrome-bar.full-screen` and `powerbrowser.chrome-bar.bookmark-page` are not registered anywhere (`git grep` finds only these two literals). As a result:

- F11 from a page logs `shortcut failed` and does nothing.
- The Bookmark Page row is offered on every blank-area menu (`bookmarkPage` has no availability predicate). Picking it rejects inside `settle`, and the page only gets focus back.

That is a dead row, which D-12 says is worse than an absent one. On `workspace/p33` the ids match (`CHROME_BAR_FULL_SCREEN_COMMAND_ID`, `CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID`), so this resolves when Phase 33 merges. But both places spell the id as a literal and no gate compares it with the export. A rename in Phase 33 would leave both dead with every check green.

**Fix:** After the Phase 33 merge, import the two exported constants and delete the literals together with their `shortcut:` comment. Until then, either omit the Bookmark Page row and the F11 action or record them as known-open. Add a static rule that every `executeCommand('<id>')` literal in chrome-bar names a registered command.

### WR-06: A row the menu offered can be refused by chrome without any feedback

**File:** `theia/extensions/chrome-bar/src/browser/page-context-menu.ts:243-262`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:8340-8348`, `:8441-8460`

**Issue:** Several chrome arms return `{ where: "refused" }` after the menu has offered the row as enabled:

- `openGrant`, when `checkLoadURIStrWithPrincipal` refuses;
- `context-reloadimage`;
- `context-showonlythisframe`;
- `context-viewframesource`;
- `pageMenuInspect`, when the toolbox fails to open or `shim.isEnabled()` is false.

`settle` has no branch for `refused`, so it calls `widget.focusPage()` and the click does nothing visible. `pageToolFacts` shows Inspect without checking `DevToolsShim.isEnabled()`, which `webTabDevtoolsReply` does check, so the availability check and the action disagree. The UI-SPEC rule is that rows that cannot run are omitted, and every failure names the product and gives a next step.

**Fix:**

- Compute the same conditions in the facts. Add `shim.isEnabled()` to `showInspect`, and apply `pageMenuTargetAllowed` in the `when` predicates of the open rows, so these rows are omitted.
- Give `settle` a `refused`/`ok:false` branch that shows a UI-SPEC sentence naming PowerBrowser with a next step.

### WR-07: New Firefox-internal touchpoints that the pattern-based catalogue does not cover

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:8204`, `:8868`, `powerbrowser/INTERNAL-APIS.md:276`

**Issue:** Three Phase 35 touchpoints have no catalogue entry that describes them:

- **`E10SUtils.wrapHandlingUserInput`**, called at `:8204`. This marks the chrome window as handling user input so a page may enter fullscreen without a gesture of its own. It is a security-relevant elevation, but the only catalogue mention of `E10SUtils` is the lazy-getter row (`:276`), which names `linkStatusText` as its consumer and says nothing about the elevation.
- **`Glean.fullscreen.change.cancel`**, at `:8868`. This is a Firefox telemetry internal with no row.
- **`new Localization([...])`**, at `:7988`. No row.

None of them matches a `FORBIDDEN_PATTERNS` entry, so `--catalogue` and `ng-040-internals-catalogue-lines` both pass. The boundary rule ("every touchpoint catalogued") is therefore weaker than the module's surface.

**Fix:** Append rows for these three call sites, with the user-input row stating that the elevation is synchronous and runs only after a validated pick. Consider adding `wrapHandlingUserInput` and `Glean\.` to `FORBIDDEN_PATTERNS`, so the next one fails `--catalogue` until it has a row.

## Info

### IN-01: The G4b capture keeps running after its 50 ms deadline

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:8560-8601`

**Issue:** When the deadline wins the race, the capture still runs to completion and discards its result. That work is `drawSnapshot`, a canvas `drawImage`, and a synchronous JPEG `toDataURL` on the parent main thread. A late still costs the same main-thread time as an on-time one.

**Fix:** Set a `late` flag when the deadline fires, and return before `drawImage`/`toDataURL` if it is set.

### IN-02: The IDL member regex does not match return types longer than one token

**File:** `scripts/verify-shell-gbrowser-standin.mjs:648`

**Issue:** `(?:[A-Za-z_][\w:<>]*\s+)?([A-Za-z_]\w*)\s*\(` allows one return-type token. A declaration such as `unsigned long foo(` or `long long bar(` does not match, so an upstream-added method with that shape would not appear in REQUIRED for `XULBrowserWindow` or `browserDOMWindow`. That is a blind spot in a derived check. Neither IDL has such a method today.

**Fix:** Allow multi-token return types, for example `(?:(?:unsigned\s+)?(?:long\s+)?[A-Za-z_][\w:<>]*\s+)?`. Add a plant that adds `unsigned long zzz();`.

### IN-03: Furniture rule 10 does not check the fullscreen l10n ids the section sets in code

**File:** `scripts/verify-shell-furniture.mjs:58-62`, `:624-627`

**Issue:** The header says the `fullscreen-warning-*` ids are held "by rule 10". Rule 10 reads only the markup ids and the `setAttributes` ids in `ClipboardContextMenu.sys.mjs`. The ids that `showWarning` sets through `document.l10n.setAttributes` (`fullscreen-warning-domain`, `fullscreen-exit-button`, `fullscreen-keyboardlock-exit-button`) are not checked against the linked `.ftl` files.

**Fix:** Add the Phase 35 section's own `setAttributes(..., "<id>")` literals to `l10nIds`.

### IN-04: Comments about grant spending do not match the code

**File:** `theia/extensions/tab-uris/src/browser/web-tab.ts:661`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:3392`

**Issue:** The widget comment says "chrome spends it either way". `webTabOpen` returns `refused-scheme` or `already-open` before `webTabAttach`, so the grant is not spent on those paths; it expires after 5 s. Once taken, the grant's principal, policy container and referrer stay on `entry.grant` for the life of the tab, although `firstWebTabLoad` reads them only once.

**Fix:** Correct the comment. Clear `entry.grant = null` after `firstWebTabLoad` uses it.

### IN-05: The freeze-frame still covers the notification bars and is stretched

**File:** `theia/extensions/tab-uris/src/browser/web-tab.css:75-82`, `theia/extensions/tab-uris/src/browser/web-tab.ts:1042-1051`

**Issue:** `.pb-web-tab-still` is `inset: 0; object-fit: fill` over the whole placeholder. The capture is the overlay's rect, which starts below the Phase 37 notification bars. With a bar showing, the still hides the bar and is stretched vertically while the menu is open.

**Fix:** Position the still at the published page rect, below `barsNode`, or append it after the bars at the page rect's top.

### IN-06: Extension menus' `overrideContext` and `refresh()` are not honoured

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:8463-8541`

**Issue:** Two extension behaviours are lost:

- `ext-menus.js` hides the stock items when `webExtContextData.showDefaults` is false (`:64-71`). The stock rows here are built by Theia, so they always show.
- Items that `menus.refresh()` rebuilds in the stub after the push are never forwarded.

Both are EXT-08 edge behaviour.

**Fix:** When `data.webExtContextData?.showDefaults === false`, skip the stock rows. Record `refresh()` as a known gap, or re-push on a stub mutation while the menu is pending.

### IN-07: The D-11 policy rule checks only the Phase 35 section text, not what the installer does

**File:** `scripts/verify-shell-furniture.mjs:31-33`, `:541`

**Issue:** After the fold, `installShellFurniture` defines `window.PopupNotifications` and hands `host.strip` to the stock module as `tabContainer`, through `installPermissionPromptFurniture`. Rule 4 still passes, because it reads only the text of the Phase 35 section. Its summary ("D-11 ... hold") now describes the section, not the one installer, which D-01 says is what reviewers audit.

**Fix:** Reword rule 4 and its summary to scope it to the section, and note in the header that the prompt furniture's `PopupNotifications` and `tabContainer` are Phase 37's and are checked by rule 13.

---

_Reviewed: 2026-11-01T08:13:05Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
