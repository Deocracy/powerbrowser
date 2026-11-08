---
phase: 36-new-window-links-as-web-tabs
reviewed: 2026-10-31T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - powerbrowser/shell/powerbrowser.js
  - scripts/verify-new-window-adopt-live.mjs
  - scripts/verify-new-window-adopt.mjs
  - scripts/verify-page-tools-print-save.mjs
  - scripts/verify-platform.sh
  - scripts/verify-shell-error-contract.mjs
  - scripts/verify-web-tab-bridge.mjs
  - theia/extensions/tab-uris/src/browser/browser-window-command.ts
  - theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts
  - theia/extensions/tab-uris/src/browser/web-tab.ts
findings:
  critical: 1
  warning: 8
  info: 5
  total: 14
status: issues_found
---

# Phase 36: Code Review Report

**Reviewed:** 2026-10-31
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Scope: the source files changed by the 13 lane commits `e185f319..186618c3` (`git diff --name-only 23c08bb5 186618c3 -- powerbrowser scripts theia`), read as they exist on main at `8143fedd`, after the merge `aa8989d9` moved the registration half into `webTabAttach`. The review concentrated on the receivers (`installNewWindowReceivers`), the adopt section at the end of `PowerBrowserAPI.sys.mjs`, the frontend `WebTabOpenHandler.adopt`, and the stock-window command. Upstream callees were read where a finding depends on them: `ContentParent::CommonCreateWindow` (`dom/ipc/ContentParent.cpp:5412-5522`), `nsContentTreeOwner::ProvideWindow`, `BrowserDOMWindow.sys.mjs`, `URILoadingHelper.openLinkIn`, `BrowserUtils.willLoadInBackground`, `nsGlobalWindowOuter::CloseOuter` and the `BrowserElement` actors.

These parts hold:

- **GUI-01.** A Theia-frame opener is not in `webTabs`, so `adoptContentWindow` returns null. `CommonCreateWindow` treats a successful null as "no tab window" and falls through to `OpenWindowWithRemoteTab` (`ContentParent.cpp:5508-5512`), which opens the stock window. Popup-feature opens never reach the receiver, because `GetWindowOpenLocation` returns `OPEN_NEWWINDOW` for them. `openStockTab` is the only sender left in `theia/extensions/*/src`.
- **The opener and scheme walls.** Both run before any element exists. A refused scheme on the InFrame path returns null, so Gecko's own window takes the page.
- **Background rules.** `willLoadInBackground` semantics, including the `tabshifted` inversion, match stock.
- **The pending-key boundary.** `pc-<n>` never reaches the store: the ack attaches through `webTabAttach(..., key = null)`, so the row key is `web:<tabId>`. No log line carries the key.
- **Catalogue.** Every new Firefox-internal touchpoint has an `INTERNAL-APIS.md` row, and `check-internals-boundary.sh --catalogue` passes on main.
- **Null-principal substitution.** It is correct for the `openLinkIn` path. The InFrame path issues no load, so Gecko uses the opener's own triggering principal.

The main defect is in the frontend. The ack sends the Theia widget id (`powerbrowser.web-tab:wt-…`), not the tab id. Chrome's `webTabIdIsValid` rejects that string, so every adopt fails. The page runs hidden for 5 s and then reloads in the stock window. No live run has happened (all 36-03 live checks are deferred), and the static gate has no rule that could see this.

Other problems:

- the two failure cases the SUMMARYs name (an `addWidget` throw after the ack, and a late ack after the timeout) leave an orphan overlay or drop the navigation;
- a page's `window.close()` leaves a dead tab;
- a `window.open()` blank document with scripted content is never shown;
- adopted tabs skip the tab host, so they have no favicon and no DevTools;
- the stock-window command now depends on one startup probe that is never retried.

## Fix outcome

| Finding | Outcome | Commit | Proof |
|---|---|---|---|
| CR-01 | Fixed | `b2c4ef6a` | The `webTabAdopt` ack and the failure-branch `webTabClose` send `widget.tabId`. The new `verify-new-window-adopt` rule (g) plants `widget.id` in both sends, and both plants go red. Live `adopt-order` is deferred to the live pass. |
| WR-01 | Fixed | `2ab28316` | `addWidget` and `activateWidget` are wrapped. If the widget never attached, `webTabClose` releases the overlay and its row, and the widget is disposed. Static proof only: typecheck and the adopt gate. |
| WR-02 | Fixed (needs human check) | `883bc237` | On `timeout`, adopt() sends `webTabHistory` and acts on chrome's answer. If the overlay is held, the widget attaches. On `unknown-tab`, it drops. A second silence still closes the tab, and that close is queued behind the ack. This is a logic change. It depends on chrome handling one frontend's messages in order, and no live run has confirmed that yet. |
| WR-03 | Fixed | `19b1adb5` | `adoptPendingOverlay` listens for `DOMWindowClose` on the overlay and pushes `closeAdoptedTab`, and the frontend calls `widget.close()`. New INTERNAL-APIS row; ng-040 PASS. The live `window.close()` leg is deferred. |
| WR-04 | Fixed (needs human check) | `04b054ae`, `1ba57370` | Adopted overlays now show on about:blank. Security follow-up (coordinator): `hasPage` includes the adopted flag, which `markAdopted()` sets before `addWidget`. So visibility, the "about:blank" label and caption, and the identity box all use one test. `webTabIdentity` now reads the host through `webTabIdentityURI`, which takes an about:blank's inherited `documentPrincipal`. The identity box names the opener's origin, and the security state stays `none`. Rule (h) has four plants. New INTERNAL-APIS row. Not yet confirmed live: the `document.write` leg, and that `documentPrincipal` is the opener's at push time. |
| WR-05 | Fixed (docs) | `64bb0967` | The favicon, DevTools and WebDriver losses are recorded in 36-02-SUMMARY's scope deviations, next to the extensions note, which lives in 36-01-SUMMARY. Tab-host adoption is still the 36-01 deferred follow-up. Post-merge correction (2026-11-01): tab-host adoption is no longer a follow-up; `tabHostAddTab` runs in `adoptPendingOverlay` (37-REVIEW CR-01). |
| WR-06 | Fixed | `1c87aac8` | Fixed the comment and added logging rather than adding a fallback. A non-web scheme on the tab path, and an `openStockTab` refusal on the stock-window path, are now logged by kind and never by URL. The comment names the current/save divergence and the no-opener null. `openAdoptedWebTab`'s JSDoc tells the caller to act on `"refused-scheme"` and null. Six catalogue rows were renumbered by hand, and ng-040 passes in normal mode. Post-merge correction (2026-11-01): `openAdoptedWebTab` was removed; Phase 37's Allow replays the page's own `window.open` through `unblockPopup`, so its JSDoc no longer exists. |
| WR-07 | Fixed | `e0e8b10b` | A click re-probes a channel that is not known to be alive. The thrown text is now one of two exported constants. Each names PowerBrowser, states the problem, and gives an on-screen next step (re-run "Open Browser Window" from the command palette, or type the address in the address bar). The command id and the cause go to the console. The bridge gate's dead-channel rule now requires the re-probe and checks the copy, with three new plants. |
| WR-08 | Fixed | `b2c4ef6a` | Rule (g) `ack-id` derives two things: the field `WebTabChannel.register` keys on, and that field's value from `init` plus `createWidget`'s id template. It checks every `tabId:` sent by adopt() against that field, and the value against the regex taken from chrome's `webTabIdIsValid`. |

All fixes are on main. The Theia build (`yarn build`) and `verify-platform.sh --quick` were both run in the main checkout, with no worktree, and both exited 0. IN-01..05 were out of scope.

## Critical Issues

### CR-01: The adopt ack sends the widget id, so chrome refuses every adopt

**File:** `theia/extensions/tab-uris/src/browser/web-tab.ts:1339`, `:1342`; `powerbrowser/shell/PowerBrowserAPI.sys.mjs:5135-5136`, `:392-394`

**Issue:** `adopt()` sends `{ kind: 'webTabAdopt', tabId: widget.id, pcKey }`. `WebTabWidget.init` sets `this.id = \`${WEB_TAB_FACTORY_ID}:${options.id}\`` (`web-tab.ts:626`), which gives `powerbrowser.web-tab:wt-<session>-<n>`. The tab id is `widget.tabId`. The arm checks `webTabIdIsValid(data.tabId)`, whose pattern is `/^[A-Za-z0-9_-]{1,64}$/`. That pattern rejects `.` and `:`, so every ack gets `{ ok: false, reason: "validation" }`. What follows:

1. `adopt()` takes the failure branch. It sends `webTabClose` with the same widget id, which chrome also refuses, and disposes the widget. No tab appears.
2. The pending overlay stays hidden (0x0, `visibility: hidden`) for 5 s while its page runs. `adoptFallback` then removes it and reloads the page through `openStockTab`.
3. In a second browsing context, `window.opener` is lost, so the `postMessage` round trip that `adopt-opener` asserts cannot work.

PROMPT-05 does not work for either a `target=_blank` link or `window.open`. Introduced in `049fe84f`. The live harness itself uses the correct field (`verify-new-window-adopt-live.mjs:643`, `tabId: w.tabId`), so `adopt-order` would go red on its first run. That run is deferred.

**Fix:**
```ts
const reply = await this.channel.request({ kind: 'webTabAdopt', tabId: widget.tabId, pcKey });
if (reply.ok !== true) {
    this.channel.send({ kind: 'webTabClose', tabId: widget.tabId });
    widget.dispose();
    return;
}
```
`activateWidget(widget.id)` is correct as it stands. Add the static rule in WR-08.

## Warnings

### WR-01: An `addWidget` throw after the ack leaves a hidden overlay and an open store row

**File:** `theia/extensions/tab-uris/src/browser/web-tab.ts:1346-1351`, `:1321`

**Issue:** The 36-02 SUMMARY names this case and leaves it open. Once chrome replies `opened`, it holds the overlay under the tab id. `webTabAttach` has written the row `web:<tabId>`, attached the listeners and scheduled a push. If `addWidget` throws, or `activateWidget` rejects before the widget is attached, the rejection reaches only the `.catch` in `onStart`, which logs `adopt failed: adoptTab`. Nothing sends `webTabClose`, so the overlay stays in the shell document at its last geometry (hidden), and its store row stays as an open tab that has no widget. The navigation is lost, and the 5 s fallback cannot help because the pending entry is already gone.

**Fix:** After a successful ack, wrap the attach and undo it on failure:
```ts
try {
    this.shell.addWidget(widget, opener ? { area: 'main', ref: opener, mode: 'tab-after' } : { area: 'main' });
} catch (err) {
    this.channel.send({ kind: 'closeTab', uri: widget.rowKey });
    this.channel.send({ kind: 'webTabClose', tabId: widget.tabId });
    widget.dispose();
    throw err;
}
```

### WR-02: A late ack after the frontend timeout closes a page chrome already adopted

**File:** `theia/extensions/tab-uris/src/browser/web-tab.ts:1340-1344`; `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7020-7024`

**Issue:** Any reply that is not ok, `reason: 'timeout'` included, sends `webTabClose` and disposes the widget. If chrome did process the ack (it attaches and deletes the pending entry) but the reply arrives after the 5 s request timer, the frontend closes the overlay chrome just adopted. `webTabClose` also removes the row. Neither path then opens the page: there is no tab and no stock-window fallback. With CR-01 fixed, this is the late-ack edge the 36-01 SUMMARY records (item 6). The SUMMARY treats it as acceptable. It is a lost navigation, and it is most likely when chrome's main thread is busy loading pages, which is exactly when popups open.

**Fix:** Handle `reason === 'timeout'` separately. If `widget.isDisposed` is still false (no `dropAdoptedTab` push arrived), attach the widget anyway: its own `webTabOpen` on attach answers `already-open` when chrome adopted, and `lostReply` marks the view lost otherwise. Alternatively, send a cheap idempotent query (for example `webTabHistory`) and close only on `unknown-tab`.

### WR-03: A page's `window.close()` in an adopted tab leaves a dead tab

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6960-6971` (adopt path); no `DOMWindowClose` listener exists anywhere under `powerbrowser/`

**Issue:** An adopted browsing context is created by web content (`TopLevelCreatedByWebContent`), so `nsGlobalWindowOuter::CloseOuter` lets its script close it, and `dom.allow_scripts_to_close_windows` does not apply. The content side marks the context closed. `BrowserElementParent` then re-dispatches `DOMWindowClose` on the overlay `<browser>` (`toolkit/actors/BrowserElementParent.sys.mjs:12-30`). Stock `tabbrowser` handles that event by removing the tab (`tabbrowser.js:8659-8700`). The shell does not handle it. The overlay and the Theia tab stay, showing a closed context, while the opener sees `w.closed === true`. OAuth and payment popups close themselves this way. Before Phase 36, no overlay was created by script, so this case could not occur.

**Fix:** In `webTabAttach`, add a `DOMWindowClose` listener on the overlay. It should push a close request to the frontend (for example `{ kind: "closeAdoptedTab", tabId }`), and the frontend should run the widget's normal close (`widget.close()`), so the row is marked closed and the opener is reselected. Add a live leg where the adopted page calls `window.close()` and the tab disappears.

### WR-04: A blank `window.open()` with scripted content is adopted and never shown

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6968`, `:6975`; `theia/extensions/tab-uris/src/browser/web-tab.ts:803`

**Issue:** `adoptContentWindow` adopts `about:blank` (the URI when `window.open()` has no URL). The widget is minted with `url: 'about:blank'`, which is `EMPTY_PAGE_URL`, and every push carries `about:blank` while the page stays there. `publish()` shows the overlay only when `this.hasPage` is true (`url !== EMPTY_PAGE_URL`). A popup that writes its content with `document.write` or DOM calls, such as report or print windows, is therefore hidden behind the "New Tab" empty state. Before Phase 36, these windows rendered in the stock window.

**Fix:** Do not adopt a blank open. In `adoptContentWindow`, return null when `!aURI || aURI.spec === "about:blank"`, so Gecko's own window takes it as before. The other option is a chrome-minted `adoptedBlank` flag in the push that makes `showable` true. Record the choice either way, and add a live leg (`window.open(); w.document.write(...)`).

### WR-05: Adopted tabs skip the tab host, which costs favicon, DevTools, WebDriver and extension visibility

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7022` (attach without `tabHostAddTab`), `:6780` (`webTabFaviconOf`), `:6851-6855` (`webTabDevtoolsReply`)

**Issue:** The 36-01 SUMMARY records only that extensions do not see adopted tabs. Several other paths also look up the tab-host node by browser:

- `webTabFaviconOf` reads `tabHostNodeOf(browser)?.image`, so an adopted tab never pushes a favicon;
- `webTabDevtoolsReply` answers `unavailable` when no node exists, so F12 and the DevTools item fail on an adopted tab;
- `gBrowser.webDriverTabs` does not list it;
- LinkHandlerParent's `setIcon` finds no tab.

The tab only becomes a full tab after a restart, when it is reopened through `webTabOpen`.

**Fix:** In `adoptPendingOverlay`, call `tabHostAddTab(win, tabId, pending.browser)` after `webTabAttach`, and record the Pitfall-2 effect: `makeTabNode` keeps `openerTab: null`. If that cannot land in this phase, add the favicon, DevTools and WebDriver losses to the SUMMARY's scope deviations and to the WINDOWS ledger, and add a live leg for each.

### WR-06: `adoptLinkIn` silently drops opens it does not adopt, contrary to its own comment

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6929-6956`, `:4056-4058`

**Issue:** The comment says "a click is never swallowed", but several opens disappear:

- **Non-web URLs.** A `tab`/`tabshifted` open of a `mailto:`, `data:` or `blob:` URL returns the string `"refused-scheme"` with no fallback and no log. Stock `openLinkIn` returns nothing, so no caller checks the value.
- **Other `where` values.** `openStockTab` returns `"refused-scheme"` for any non-http(s) URL, also silently.
- **`current` and `save`.** Stock routes these to the opener's own tab and to Save As. Here both go to the stock window.
- **No opener.** A call without an overlay `openerBrowser` returns null and opens nothing.

`openAdoptedWebTab` hands the string or null to its Phase 37 caller, and the JSDoc does not tell that caller to fall back.

**Fix:** In `adoptLinkIn`, send every non-adopted case down one fallback: `refused-scheme`, `where` other than `tab`/`tabshifted`, and no opener. Log the kind when `openStockTab` refuses too. At minimum, document in `openAdoptedWebTab`'s JSDoc that `"refused-scheme"` and null mean "nothing opened" and that the caller must act on them.

### WR-07: The stock-window command depends on one startup probe that is never retried, and its error copy is stale

**File:** `theia/extensions/tab-uris/src/browser/browser-window-command.ts:120-157`, `:175-187`

**Issue:** `channelAlive` is set once, by the `@postConstruct` probe with a 5 s timeout. Before Phase 36, a false or undefined probe fell back to `window.open`. Now it throws on every call for the rest of the session:

- a click before the probe settles, or after a probe that timed out once (for example during a sidecar swap), makes the only Theia route to stock chrome unusable until restart;
- the thrown text still says "the browser window was blocked" and talks about the "user activation a popup needs", and neither is the cause any more;
- the text tells the user to retry from the command palette, which throws the same error because nothing re-probes;
- the text starts with the internal command id `powerbrowser.open-browser-window`, which the user-facing copy rule forbids if the error is ever shown. The palette does not catch it (`quick-command-service.js:101`), so in practice the click does nothing visible.

This weakens rule 5 ("a stock browser window is reachable") in exactly the degraded state where the user needs it.

**Fix:** When `channelAlive !== true`, re-probe on click (`await this.probeChannel()`, which has no user-activation constraint now that the popup path is gone), and send if the probe succeeds. Replace the error text with copy that names PowerBrowser and gives a real next step, and move the command id to the diagnostics layer.

### WR-08: The static adopt gate cannot catch CR-01

**File:** `scripts/verify-new-window-adopt.mjs:275-315`

**Issue:** Rule (e) checks that the chrome arm validates `tabId` with `webTabIdIsValid`. Rule (f) checks pc-* hygiene. No rule checks that the frontend's ack sends the identifier the arm admits and the channel registers under (`widget.tabId`). The SUMMARY frames the `--quick` gate as holding "all of this", but the one wire mismatch that breaks the feature passes it. Under the project's check-design rules, a gate should derive both ends of a contract and compare them.

**Fix:** Add a rule that derives the `tabId:` expression of every frontend `kind: 'webTabAdopt'` send and of the failure-branch `webTabClose`, and requires it to be the same field `WebTabChannel.register` is called with (`this.tabId`, which is `widget.tabId` at the call site). Add a plant that swaps it to `widget.id` and must go red.

## Info

### IN-01: The 5 s fallback reloads the page in a second browsing context

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6991-7006`

**Issue:** By the time the fallback runs, the hidden pending page has run for up to 5 s: scripts, network, possibly audio. The fallback then loads its live URL again through `openStockTab`. One-time URLs (OAuth callbacks, signed links) run twice, a POST result reloads as a GET, and `window.opener` is lost. `openStockTab` also targets the most recent stock window "private or not" (`:1138-1140`), so a page from a normal overlay can land in a private window. The SUMMARYs record the fallback but not these effects.

**Fix:** Record them in the SUMMARY. Consider choosing a stock window whose private state matches the opener's.

### IN-02: A malformed http(s) URL in `adoptLinkIn` leaves a blank adopted tab

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6945-6954`

**Issue:** The scheme regex admits strings such as `http://[`. `createPendingOverlay` pushes `adoptTab` and arms the fallback, and only then does `Services.io.newURI(spec)` throw. The throw escapes to the caller, while the frontend still adopts an empty overlay titled with the bad URL.

**Fix:** Build the URI first (`const uri = Services.io.newURI(spec)` inside a `try` that returns `"refused-scheme"`), and call `createPendingOverlay` only after that succeeds.

### IN-03: `openURIInFrame` does not load, unlike the stock contract

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4035-4037`

**Issue:** Stock `openURIInFrame` loads `aURI` (`skipLoad = false`, `BrowserDOMWindow.sys.mjs:452-461`). The receiver sends it to `adoptContentWindow`, which never loads. No upstream caller exists today, so this has no effect, but the catalogue row (`INTERNAL-APIS.md:267`) states the no-load rule for both members as if it were correct for both.

**Fix:** Return null from `openURIInFrame`, which gives Gecko's own window and is safe, or note the divergence in the row.

### IN-04: `adoptLinkIn` drops most of the stock `openLinkIn` params

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6929-6956`

**Issue:** `referrerInfo`, `postData`, `policyContainer`, `userContextId`/`originAttributes` and `forceForeground` are ignored. When the Phase 37 "Allow" on a blocked popup goes through `openAdoptedWebTab`, the page loads with no referrer.

**Fix:** Pass `referrerInfo` and `policyContainer` to `loadURI`, and honour `forceForeground` the way `BrowserUtils.willLoadInBackground` does. Alternatively, record the reduction.

### IN-05: CLAUDE.md rule 5 now describes a mechanism the tree no longer has

**File:** `CLAUDE.md` (Hard rule 5), `theia/extensions/tab-uris/src/browser/browser-window-command.ts:86-93`; hand-kept lists in `scripts/verify-new-window-adopt.mjs:68-70`

**Issue:** Rule 5 says the shell window "carries no `nsIBrowserDOMWindow`" and that the command opens the stock window with `window.open`. Both stopped being true in this phase. The fall-through now depends on the receiver returning null, and the command uses `openStockTab`. Separately, `REPLY_WORDS`, `ADOPT_PUSH_KEYS` and `DROP_PUSH_KEYS` are hand-kept expectation lists. The frontend's destructure in `adopt()` could be the derived side instead.

**Fix:** Update rule 5 to name the receiver's null return as the GUI-01 mechanism and `openStockTab` as the command's route. Derive the push keys from the frontend consumer.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
