# Phase 36: New Window Links as Web Tabs - Research

**Researched:** 2026-10-22
**Domain:** Gecko `nsIBrowserDOMWindow` shim in the shell window + chrome-first pending overlay + frontend adopt over the group actor pair
**Confidence:** HIGH for every in-tree path cited (read this session at the pinned ESR `FIREFOX_153_5_0esr_BUILD1`, Theia 1.76.0); MEDIUM for live `window.open` routing which only a built shell can prove (listed in Assumptions Log + Validation Architecture).

## Summary

`PROMPT-05` is a chrome-routing problem, not a UI problem. When a page in an overlay calls `window.open` or clicks `target=_blank`, Gecko's content process asks the shell window for its `browserDOMWindow` (`ContentParent.cpp` → `nsFrameLoader` → `nsWindowWatcher`). The shell window today carries none (deliberately, for GUI-01), so the call falls through `AppWindow::CreateNewContentWindow` to a new stock window. Phase 36 installs the missing piece: a minimal `nsIBrowserDOMWindow` shim on the shell window that creates a **pending overlay chrome-first, loads nothing itself**, and lets Gecko perform the load into the returned browser. A `push {kind:'adoptTab'}` then tells the Theia frontend to mint a real `wt-<session>-<n>` tab directly after the opener. A 5 s adopt-ack timeout falls back to the already-landed `openStockTab` path, so a lost frontend can never swallow a navigation. The GUI-01 command moves onto `openStockTab` in the same landing, because Phase 36 alone would otherwise break the stock-window path it currently rides (`window.open(url,'_blank')` from the Theia frame).

**Primary recommendation:** three plans — (01) chrome shim + pending overlay + static gates; (02) frontend adopt + reselect + `browser-window-command` move; (03) live adopt harness + registry wiring. No new actor pair, no new patch, no new widget.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- One boundary file (`PowerBrowserAPI.sys.mjs`) + append-only catalogue (`INTERNAL-APIS.md`); `check-internals-boundary.sh` stays green.
- No Theia core fork; no Gecko edit outside the patch stack (no new patch in this phase).
- Adopted overlays enter the Phase 31.1 tab host as TabOpen with `openerTab` set; `getTabToAdopt` stays null.
- Adopted overlays fire no `webTabActivated` on adopt: activation state travels exclusively through the existing `activateWidget` (foreground) / no-activation (background) path, so the 31.1 host observes exactly one TabSelect per user-visible activation (no double-activation from a synthetic `webTabActivated` on the adopt handshake).
- Opener branch: overlay opener → adopt; Theia-frame opener → return null (fall through, preserves GUI-01).
- Shim implements `createContentWindowInFrame`/`openURIInFrame` + `openLinkIn` only; `OPEN_PRINT_BROWSER`/Theia opener → null.
- Pending overlay: `pc-<n>`, `openWindowInfo` set, `remoteType` from opener, NO shim-issued load.
- Adopt push over the existing group actor pair; `WebTabOpenHandler.adopt` mints `wt-<session>-<n>` `tab-after` opener; 5 s fallback to `openStockTab`.
- GUI-01 command moves onto `openStockTab` in this phase; GUI-01 live rows stay green unmodified.
- Every new check = one `verify-platform.sh` row, derive-from-tree set equality, `--self-test` planted faults.

### Claude's Discretion
Pending-table shape, ack correlator format, fallback timer plumbing, live scenario split, adopted-tab title/tooltip copy (app-name rule, no internal ids).

### Deferred ideas (OUT OF SCOPE)
`tabs.create` reuse (Phase 38), beforeunload/prompt/permission relays (Phase 37), strip drag/pin UX (Phase 34), host internals (Phase 31.1). Sized-popups-as-tabs is NOT deferred — superseded by B3 (ROADMAP: popup-features `window.open` opens a popup window).
</user_constraints>

<phase_requirements>
## Phase Requirements

PROMPT-05 (from `.planning/REQUIREMENTS.md`): "User clicking a `target=_blank` link or a page calling `window.open` gets a new web tab next to the opener, while the stock browser window stays reachable (GUI-01)."

ROADMAP Phase 36 success criteria:
1. `target=_blank` / `window.open` from a page → new web tab directly after the opener; shell window count stays 1. Closing the adopted tab reselects the opener.
2. The opened tab has a working `window.opener`, so a sign-in popup flow completes and returns to the opener.
3. A `window.open` with popup features still opens a popup window, and the IDE's open-browser-window command still opens the stock browser window (GUI-01 rows green).
</phase_requirements>

## Project Constraints (from CLAUDE.md)

1. One verification driver (`scripts/verify-platform.sh`); new checks are registry rows, never sibling drivers.
2. Never assert absence of a log line unless the emitter is the code under test.
3. Derive-from-tree-and-compare as set equality; every gate gets `--self-test` planting faults that each go red naming the drift.
4. Firefox internals only in the boundary file; catalogue every touch; append-only.
5. Stage new files by explicit path before `--quick` (brand scan reads `git ls-files`).
</project_constraints>

## Architectural Responsibility Map

| Layer | Owns | Must NOT own |
|---|---|---|
| Shell window (`powerbrowser.xhtml`/`powerbrowser.js`) | installer call (`PowerBrowserAPI.installNewWindowReceivers(window)`), focus tracker source | QI/internals (must call the boundary installer; the file carries only the call, never a `browserDOMWindow`/`openLinkIn` assignment of its own — both names are `FORBIDDEN_PATTERNS` at `check-internals-boundary.sh:83` with self-test plants at `:364-379`) |
| Boundary (`PowerBrowserAPI.sys.mjs`) | `installNewWindowReceivers`, pending table, opener branch, scheme wall, `adoptTab` push, `dropAdoptedTab` sweep push, fallback timer, `webTabAdopt` arm | strip order, widget identity |
| Actor child (`GroupActorChild.sys.mjs`) | unchanged byte-for-byte; carries the adopt push as opaque JSON | any privileged reach (D-96) |
| Frontend (`web-tab.ts`) | `adopt` (mint + `tab-after` + activate per background/foreground), reselect-on-close via existing path, `webTabAdopt` ack | docshell, navigation, store rows |
| `browser-window-command.ts` | command → `openStockTab` actor kind only; probe stays off the click path | `window.open` on the command path |
| Tab host (Phase 31.1) | TabOpen with `openerTab` for adopted overlays | adopt lifecycle itself |

## Standard Stack

### Core
- Gecko ESR `FIREFOX_153_5_0esr_BUILD1` `nsIBrowserDOMWindow` contract; `ChromeUtils.generateQI` (already catalogued, boundary-only).
- Existing group actor pair (`PowerBrowserGroupRequest`/`PowerBrowserGroupMutation`/`PowerBrowserWebTabState`); existing `webTabs` overlay table idiom.
- Theia 1.76 `ApplicationShell.addWidget(widget, {area:'main', ref, mode:'tab-after'})` (already used by `openInBackground`).

### Supporting
- `scripts/lib/pb-live-probe.mjs` + `verify-nav-keys-live.mjs --scenario/--self-test` harness shape for the live adopt check.
- `verify-web-tab-bridge.mjs` kind-classification + overlay-attribute contract (extend, do not fork).

### Alternatives Considered
- **Second actor pair for adopt:** rejected — doubles the origin wall (D-96), doubles the audit surface; the group pair already carries both directions.
- **`powerbrowser.js` inline QI shim:** rejected — a second `generateQI`/`browserDOMWindow` definition site outside the boundary trips the boundary guard by design.
- **Frontend-first adopt (frontend creates overlay via `webTabOpen`, then tells Gecko):** rejected — races Gecko's synchronous load-into-returned-browser contract; produces double loads / blank tabs.
- **Deferring the `browser-window-command` move:** rejected — ROADMAP notes Phase 36 alone breaks GUI-01; the hole must close in the same landing.

## Package Legitimacy Audit

No new package. No manifest/lockfile change. (If a plan's diff touches one, its threat model carries T-36-SC and the plan fails review.)

## Verified In-Repo Values (verbatim, read this session)

- Shell content browser: `powerbrowser/shell/powerbrowser.xhtml:58` — `<xul:browser id="powerbrowser-content" type="content" primary="true" remote="true" remoteType="web" src="about:blank" tabindex="-1"/>`; windowtype `powerbrowser:main` (`:21`).
- Upstream IDL (re-verified this run at the pinned tag): `upstream/dom/interfaces/base/nsIBrowserDOMWindow.idl` — members `createContentWindow` (`:139-145`), `createContentWindowInFrame` (`:153-155`), `openURI` (`:171-175`), `openURIInFrame` (`:186-188`), `canClose` (`:196`), `tabCount` (`:202`), constants incl. `OPEN_PRINT_BROWSER` (`:74`); companion `upstream/toolkit/components/windowwatcher/nsIOpenWindowInfo.idl` for the `openWindowInfo` shape (`forceNoOpener` at `:53-55` — the `window.opener` switch the shim preserves by keeping `openWindowInfo` on the overlay). `openLinkIn` is NOT IDL — frontend JS (`utilityOverlay.js:123` → `URILoadingHelper.sys.mjs:465`), called by `ClickHandlerParent.sys.mjs:85,146` / `nsContextMenu.sys.mjs:1503-1530` on the chrome window, so the shell needs a companion `window.openLinkIn` function beside the QI shim.
- Popup-features routing (checker B3, verified this run): `nsWindowWatcher::GetWindowOpenLocation` (`upstream/toolkit/components/windowwatcher/nsWindowWatcher.cpp:2588-2675`) returns `OPEN_NEWWINDOW` when the chrome flags are not the plain default (`:2658-2669`: `restrictionPref == 2` default + `uiChromeFlags != CHROME_ALL` → `OPEN_NEWWINDOW`). The remote path then falls through: `ContentParent.cpp:5505-5508` (`NS_SUCCEEDED && !frameLoaderOwner` → `aOpenLocation = OPEN_NEWWINDOW`) reaches the `OPEN_NEWWINDOW` branch that opens through `OpenWindowWithRemoteTab` (`:5525-5533`). The in-process path falls through likewise: `nsContentTreeOwner::ProvideWindow` (`upstream/xpfe/appshell/nsContentTreeOwner.cpp:505-511`) returns `NS_OK` with a null target for any non-tab location, and `nsWindowWatcher::OpenWindowInternal` (`upstream/toolkit/components/windowwatcher/nsWindowWatcher.cpp:1029-1035`: `!targetBC` in the parent process) creates a new toplevel window — the GUI-01 stock window, reachable in v1.5.
- Opener truth (checker B4, verified this run): the remote path parents the new browsing context under the opener (`ContentParent.cpp:5490` `CreateContentWindowInFrame` with `params.openerBrowser`; stock tabbrowser keeps the opener's remote type `tabbrowser.js:4249-4251` and sets `crossGroupOpener` `tabbrowser.js:3468-3469`, and keeps `hasValidUserGestureActivation` from `openWindowInfo` `tabbrowser.js:3515-3518`). The attachment idiom is `b.openWindowInfo = openWindowInfo` (`tabbrowser.js:2801`); the shell's pending overlay must do the same for `window.opener` to work.
- Content-process null path (checker GUI-01, verified this run): `ContentParent.cpp:5464-5472` — when the shell carries no `browserDOMWindow`, `browserDOMWin` is null and the location is forced to `OPEN_NEWWINDOW` (`:5466-5472`), i.e. the stock window. This is today's GUI-01 fall-through, and the Theia-frame-opener null return in the shim preserves exactly it. The ClickHandler actor that would call `openLinkIn` is registered by stock `BrowserGlue` (`DesktopActorRegistry.sys.mjs:875-879` `init()` via `ActorManagerParent.addJSWindowActors`; `BrowserGlue.sys.mjs:360`), which the shell never loads (no `BrowserGlue` reference under `powerbrowser/` or `patches/` — verified this run), so installing `window.openLinkIn` does NOT switch on stock click handling in the shell; the shim's own `adoptLinkIn` is the only consumer. `ClickHandlerParent.sys.mjs:85` bailing out while `openLinkIn` is undefined is therefore today's behaviour, and defining it is accounted: the new function loads through the overlay docshell with the params principal, never through stock `URILoadingHelper` (not loaded in the shell).
- Overlay factory precedent: `PowerBrowserAPI.sys.mjs:3244` `doc.createXULElement("browser")`, attrs `type:content, remote:true, remoteType:web` (`:3256-3259`), `messagemanagergroup="browsers"` + `manualactiveness` + attrs-before-append (comment `:3212-3220`, body `:3256+`); scheme wall `spec !== "about:blank" && !/^https?:\/\//` (`:3236`); outcome vocabulary `"opened"|"already-open"|"refused-scheme"|"loading"|"unknown-tab"` (`:3231-3232`).
- Progress listener QI: `ChromeUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"])` (`:3313`); parent holds listeners weakly (`BrowsingContextWebProgress.cpp:49-51` per comment `:3304-3306`); entry held strongly in `webTabs` (`:372-379`).
- Sender walls: `groupSenderIsTheia` (`:310-341`, embedder-is-primary + `SHELL_CONTENT_BROWSER_ID` + port/spec); `webTabIdIsValid` (`:385-387`, `/^[A-Za-z0-9_-]{1,64}$/`); `webTabKeyIsValid` (`:140-142`, `/^web:[A-Za-z0-9_-]{1,64}$/`).
- Mutation arms: `openStockTab` (`:2446-2448`, writes no row, reply carries `where`); `webTabOpen` (`:2457-2466`, id+key walls, theiaBrowser from sender); `webTabClose` (`:2485-2490`).
- Frontend: `WebTabMessage` union (`web-tab.ts:172-184`, 12 kinds, "eight in handleGroupMutation" comment now stale-counted); `WebTabChannel.send/request`, never read `dispatchEvent` return (`:283-299` + comment `:228-230`); `openInBackground` = `addWidget(..., {ref, mode:'tab-after'})` (`:781-789`); widget id `wt-<session>-<n>` (`:791-794`); ack timeout `WEB_TAB_ACK_TIMEOUT_MS = 5000` (`:44`).
- Command: `browser-window-command.ts` probe off click path (`:116-154`), `openBrowserWindow` channel-first-then-popup (`:174-192`), `requestStockTab` cancelable+bubbles `document.dispatchEvent` shape (`:212-234`).
- Actor child: zero privileged reach, content-compartment JSON rule, `preventDefault`-as-availability-signal (`GroupActorChild.sys.mjs` whole file).
- Boundary guard: `FORBIDDEN_PATTERNS` includes `ChromeUtils.generateQI`, `browserDOMWindow`, `openLinkIn` (`check-internals-boundary.sh:78,83`); Phase 27 shim-global policy (`:82-83`).
- Bridge gate: `KIND_CLASSES` 12 entries + `privileged` empty (`verify-web-tab-bridge.mjs:58-72`); store classes; stock-handler priority 500; chrome-bar may not reach `OPEN_BROWSER_WINDOW_COMMAND_ID` or bare `window.open` with `browser-window-command.ts` as positive control (`:109-114` + header).
- Stand-in gate: REQUIRED/IMPLEMENTED ∪ DELIBERATELY_ABSENT set equality; derivations that yield nothing fail as broken instruments (`verify-shell-gbrowser-standin.mjs` header).
- GUI-01: `verify-gui01-window.mjs` (popup path + last-window hazard, sentinel count, no second shell); command check `verify-gui01-command.mjs`; registry rows `gui01-browser-close-does-not-quit`, `gui01-command-registered` (`verify-platform.sh:4896-4897`); quick rows `shell-gbrowser-standin`, `gui02-web-tab-bridge` + self-tests (`:3713-3714,3796-3797`).

## Architecture Patterns

### System Architecture Diagram

```
page (overlay docshell) --window.open/target=_blank--> content process
  --getBrowserDOMWindow--> shell window.browserDOMWindow [SHIM, new]
  --createContentWindowInFrame/openURIInFrame--> pending overlay (pc-<n>, openWindowInfo, remoteType=opener's)
  --Gecko loads into returned browser--> progress/title listeners (existing host idiom)
  --push {kind:'adoptTab', pcKey, openerTabId, url}--> Theia frame (existing actor pair)
  --WebTabOpenHandler.adopt--> widget wt-<session>-<n> tab-after opener --> ack {kind:'webTabAdopt'}
  --timeout 5s--> fallback openStockTab (existing GUI-01 path)
Theia-frame opener --shim returns null--> fall-through new stock window (GUI-01 preserved)
```

### Recommended Change Map

1. `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (end-of-file section + 2 routing arms + installer): `installNewWindowReceivers(win)` (one delegating member appended to the frozen literal at `:396`), pending table, `adoptTab`/`webTabAdopt`/`dropAdoptedTab`, fallback. Closest analog: `webTabOpen` body + `STORE_REQUEST_KINDS` end-of-file precedent. Exact.
2. `powerbrowser/shell/powerbrowser.js` (one installer call, no assignment of its own): `PowerBrowserAPI.installNewWindowReceivers(window)` beside the gBrowser stand-in. Analog: `window.gBrowser` stand-in block. Exact.
3. `powerbrowser/INTERNAL-APIS.md` (append rows): `generateQI(nsIBrowserDOMWindow)`, `browserDOMWindow`/`openLinkIn` definition lines, `openURIInFrame`/`createContentWindowInFrame` member names, `openWindowInfo`, `browser.loadURI` on the openLinkIn path. Analog: existing rows. Exact.
4. `theia/extensions/tab-uris/src/browser/web-tab.ts` (`adopt`, push-kind subscription, ack): third open path beside `openUrl`/`openInBackground`. Exact (self).
5. `theia/extensions/tab-uris/src/browser/browser-window-command.ts` (command → `openStockTab`, drop popup path): delete `window.open` from the command path. Exact (self).
6. `scripts/verify-*` (extend `verify-web-tab-bridge.mjs` + 1 new `verify-new-window-adopt.mjs` + live `verify-new-window-adopt-live.mjs`): derive-and-compare + `--self-test`. Analog: `verify-shortcut-relay.mjs` (Phase 27). Exact.
7. `scripts/verify-platform.sh` (append rows only). Analog: existing quick/live rows. Exact.
8. `scripts/check-internals-boundary.sh` (no new pattern needed; assert single definition site of the shim members via the new gate, not the guard).

### Pattern 1: Shim installer behind the boundary (Phase 27 policy)

The interface owns `createContentWindow` (`:139-145`) / `createContentWindowInFrame` (`:153-155`) / `openURI` (`:171-175`) / `openURIInFrame` (`:186-188`) + `canClose` (`:196`) + `tabCount` (`:202`). `openLinkIn` is NOT an IDL member — it is frontend JS (`utilityOverlay.js:123` → `URILoadingHelper.sys.mjs:465`), called by `ClickHandlerParent.sys.mjs:85,146`/`nsContextMenu.sys.mjs:1503-1530` on the chrome window. The shell window therefore needs BOTH: the QI shim (IDL members) and a companion `window.openLinkIn` function (single site, boundary-owned, not a QI member). Both are defined inside `PowerBrowserAPI.sys.mjs` (exempt from `FORBIDDEN_PATTERNS` as a file) and installed by one installer call from `powerbrowser.js` — no per-line exemption is added (checker B1 route (a): installer the shell calls).

```javascript
// PowerBrowserAPI.sys.mjs end-of-file section (append-only; nothing above moves).
// One delegating member appended to the frozen literal (:396); receivers below.
installNewWindowReceivers(win) {
  const domWindow = {
    QueryInterface: ChromeUtils.generateQI(["nsIBrowserDOMWindow"]),
    // Verbatim IDL signatures (:153-155, :186-188):
    // Element createContentWindowInFrame(in nsIURI aURI, in nsIOpenURIInFrameParams params, in short aWhere, in long aFlags, in AString aName)
    // Element openURIInFrame(in nsIURI aURI, in nsIOpenURIInFrameParams params, in short aWhere, in long aFlags, in AString aName)
    // params.openerBrowser / params.openWindowInfo carry the opener + info.
    createContentWindowInFrame(aURI, params, aWhere, aFlags, aName) { return PowerBrowserAPI.adoptContentWindow(win, aURI, params, aWhere); },
    openURIInFrame(aURI, params, aWhere, aFlags, aName) { return PowerBrowserAPI.adoptContentWindow(win, aURI, params, aWhere); },
    // Deliberate null fall-throughs (upstream opens a real window = GUI-01 preserved):
    createContentWindow() { return null; },
    openURI() { return null; },
    canClose() { return true; },
    get tabCount() { return 1; },
  };
  win.browserDOMWindow = domWindow;
  // Companion (NOT a QI member): stock ClickHandler/context-menu call it and expect a load.
  win.openLinkIn = (url, where, params) => PowerBrowserAPI.adoptLinkIn(win, url, where, params);
}
```

`powerbrowser.js` carries only the call: `PowerBrowserAPI.installNewWindowReceivers(window);` — no `browserDOMWindow`/`openLinkIn` spelling of its own (both are `FORBIDDEN_PATTERNS` at `check-internals-boundary.sh:83`; the self-test loop at `:364-379` already plants `window.browserDOMWindow = {};` / `window.openLinkIn = {};` outside the boundary and requires rejection naming file and pattern — positive control for the single-site rule).

### Pattern 2: Pending overlay (chrome-first, split load rule per checker B2)

Mirror `webTabOpen`'s attribute half exactly (type/remote/remoteType from opener, `messagemanagergroup="browsers"`, `manualactiveness`, all attrs before append), then `b.openWindowInfo = openWindowInfo` (the tabbrowser idiom at `tabbrowser.js:2801` — this is the `window.opener` truth) and append. Register progress/title listeners with the same QI + strong-hold idiom. Key the table `pc-<n>`; never write a store row for `pc-*`; never leak `pc-*` to copy.
- InFrame path (`adoptContentWindow`): NO navigation call — Gecko's frameloader performs the `window.open`/`_blank` load into the returned element (`ContentParent.cpp:5490-5522`; stock sets `nodefaultsrc`/`skipLoad` at `tabbrowser.js:2835` precisely so creation does not itself load).
- `openLinkIn` path (`adoptLinkIn`): MUST load through the new overlay's docshell with the params principal (`browser.loadURI(...)`), the stock contract (`URILoadingHelper.sys.mjs:465` loads into the new tab; `ClickHandlerParent.sys.mjs:146` expects the call to open and load). Each path gets its own static assertion + self-test plant (no-load plant on the InFrame section; missing-load plant on the `adoptLinkIn` section).

### Pattern 3: Adopt push + ack + fallback + unknown-key sweep

Chrome `sendWebTabPush(theiaBrowser, {kind:'adoptTab', pcKey, openerTabId, url, background})`; frontend `onPush('adoptTab')` → `adopt()` mints `wt-<session>-<n>`, inserts `tab-after` opener widget ref, sends `{kind:'webTabAdopt', tabId, pcKey}`; on the `opened` reply chrome swaps the table key `pc-* → wt-*`, and that swap IS the binding — the widget's existing geometry/navigate/close paths then address the adopted overlay by tabId with no new wiring and no handle in the payload. Ack correlator reuses `WebTabChannel.request` (5 s). On timeout chrome calls its own `openStockTab(url)` — the page still opens, in the stock window. On an ack for an unknown `pcKey`, chrome replies `unknown-tab` and pushes `{kind:'dropAdoptedTab', tabId}` so the frontend drops the orphan widget (checker W4) instead of keeping a widget with no overlay behind it.

### Pattern 4: Opener branch + null fall-through

Resolve opener via `tabIdOfBrowser(openerBrowser)`-style derivation (existing `:4219` helper family): overlay opener → adopt path; Theia-frame opener or `where==OPEN_PRINT_BROWSER` → return `null` immediately (upstream falls through to a new window = GUI-01). The null path must not create, append, push, or write anything.

### Anti-Patterns to Avoid
- One no-load rule for both paths (checker B2: blank middle-click tabs).
- Frontend-minted overlay (Gecko needs a chrome browser synchronously).
- Browser handles in the adopted-widget payload (Xray/compartment leak); the pcKey→tabId swap is the binding.
- A synthetic `webTabActivated` on the adopt handshake (double TabSelect in the 31.1 host); activation travels the widget path only.
- Reading `dispatchEvent` return as "adopted" (measured false twice in this tree).
- Asserting "no second window opened" via log absence (CLAUDE.md rule 1); assert instead: pending-table set == adopt-ack set + fallback set, and shell-window count == 1 derived from the probe.
- Touching `GroupActorChild.sys.mjs` (zero-reach file) or adding a second `generateQI(nsIBrowserDOMWindow)` site.

## Don't Hand-Roll
- QI helpers (use `ChromeUtils.generateQI`), actor plumbing (reuse the group pair), tab-after insertion (use `openInBackground`'s `addWidget` shape), integrity/catalogue line fix (`verify-ng-040-internals-catalogue-lines.mjs --fix`), live shell launch (`pb-live-probe.mjs`).

## Common Pitfalls

- **P1 — GUI-01 breakage:** installing any `browserDOMWindow` changes the Theia-frame `window.open` path the GUI-01 command rides. Avoid: opener branch + null fall-through + moving the command to `openStockTab` in the same landing + GUI-01 rows green unmodified.
- **P2 — Double load:** shim loads AND Gecko loads. Avoid: shim never navigates; Pattern 2.
- **P3 — Pending leak:** `pc-*` entries surviving a lost frontend/closed window. Avoid: ack timeout + `webTabDropOwnedBy`-style sweep on close/quit; `pc-*` never in the store.
- **P4 — Stale chrome JS in kept profiles:** adopted-tab code paths cached across upgrades. Avoid: `-purgecaches` live runs (existing harness flag), version-gated correlator (reject unknown `pcKey` with `unknown-tab`).
- **P5 — Copy/capability leak:** `pc-*`/kind names in titles, tooltips, logs, or pushes. Avoid: copy gate scope includes adopt strings; pushes carry `tabId/url/title/booleans` only.
- **P6 — Rebase drift:** upstream adds an `nsIBrowserDOMWindow` member the shim lacks → silent `NS_ERROR`. Avoid: static gate deriving the member set from the pinned IDL + call sites, set equality.
- **P7 — Scheme escape:** `javascript:`/`moz-extension:`/`file:` adopted into a privileged docshell. Avoid: same `^https?://` + `about:blank` wall as `webTabOpen`, applied BEFORE any element exists; refusal outcome `refused-scheme`.
- **P8 — Focus theft:** background (middle-click) adopt stealing opener focus. Avoid: `background` flag through the push; `openInBackground` insertion without activation.

## Code Examples

Pending-table key discipline (boundary file):
```javascript
let pendingContentSeq = 0;
// pc-<n> only; never a store key, never user-facing.
function mintPendingKey() { return `pc-${++pendingContentSeq}`; }
```

Frontend adopt (third open path, beside openUrl/openInBackground):
```typescript
async adopt(opener: Widget, pcKey: string, url: string, background: boolean): Promise<WebTabWidget> {
    const widget = await this.createWidget(url); // wt-<session>-<n>
    this.shell.addWidget(widget, { area: 'main', ref: opener, mode: 'tab-after' });
    if (!background) { await this.shell.activateWidget(widget.id); }
    await this.channel.request({ kind: 'webTabAdopt', tabId: widget.id, pcKey } as any);
    return widget;
}
```

Null fall-through (shim):
```javascript
if (isTheiaFrameOpener(opener) || where === Ci.nsIBrowserDOMWindow.OPEN_PRINT_BROWSER) {
  return null; // upstream opens a new window; creates nothing, pushes nothing
}
```

## State of the Art

Firefox 153 ESR `tabbrowser.js` + `nsWindowWatcher` implement exactly this split: `browserDOMWindow` returns a browser for in-frame adoption, null for a real new window. PowerBrowser keeps the split but replaces the tabbrowser with the pending-overlay table + Theia strip. No newer upstream pattern supersedes it at the pinned tag.

## Assumptions Log

| ID | Assumption (phases 30–35 planned/parallel, code does not exist yet) | If false → fallback |
|---|---|---|
| A-01 | Phase 31.1 tab host exists with TabOpen-with-`openerTab` + `getTabToAdopt`=null | Adopted overlays still work as plain overlays; host wiring becomes a follow-up keyed to 31.1's landing |
| A-02 | Phase 35 `installShellFurniture` does not own `browserDOMWindow` (furniture = tooltips/autocomplete/context-menu/fullscreen only) | Shim factory lives in its own end-of-file section; merge order resolved at implementation |
| A-03 | Phase 34 strip order API keeps `tab-after` insertion + close-reselect-opener semantics | Adopt inserts after opener via `ApplicationShell` directly (as `openInBackground` does today) |
| A-04 | Phase 30–33 do not add competing `webTabAdopt`/`adoptTab` kinds or `pc-*` keys | Bridge gate derives kinds as set equality — a collision goes red by name at `--quick` time |
| A-05 | Upstream `nsIBrowserDOMWindow` IDL at the pinned tag matches ARCHITECTURE.md §5a citations | Plan 36-01 re-derives the member set from the tree; drift goes red before any behaviour is built |
| A-06 | Live harness (`pb-live-probe.mjs`, `withProbeShell`, `-purgecaches`) works for popup-spawning pages | Adopt live check serves its own slow/popup pages the way nav-keys-live serves slow paths |

## Assumes from Earlier Phases (planned/parallel — code does not exist yet)

- **Phase 30** (address-bar modes/command centre): pill/overlay geometry protocol unchanged; adopt pushes reuse the widened push without new pill work.
- **Phase 31** (identity/permissions/menu): security-state push will ride adopted overlays unchanged; no identity work here.
- **Phase 31.1** (extension tab host): TabOpen-with-openerTab entry point exists; `verify-shell-gbrowser-standin.mjs` rewrite owned by 31.1 (this phase only adds adopted-tab coverage expectations, does not fight the rewrite).
- **Phase 32** (downloads/print/fullscreen media): `OPEN_PRINT_BROWSER` null path stays a plain new window; no print/download work here.
- **Phase 33** (Places/bookmarks/menus): no Places writes from adopt; `pc-*` never enters the store.
- **Phase 34** (tab strip order/pin/multiselect): opener-adjacent insertion + close-reselect-opener assumed; strip visuals owned there.
- **Phase 35** (shell furniture/context menu): furniture installer assumed present as the shim's neighbour; context-menu-on-adopted-tabs owned there.
- **Phase 27** (assumed landed): push router, `webTabActivated`, shortcut relay, live-probe harness — all reused.
- **Phase 29** (assumed landed): `resolveTypedAddress`/scheme-wall precedent — adopt applies the same wall.

## Open Questions (RESOLVED autonomously)

1. Sized popup features (`width/height`)? → Popup window (ROADMAP governs; checker B3). `GetWindowOpenLocation` (`nsWindowWatcher.cpp:2658-2669`) returns `OPEN_NEWWINDOW` for non-default chrome flags; both the remote (`ContentParent.cpp:5505-5508`) and in-process (`nsContentTreeOwner.cpp:505-511`, `nsWindowWatcher.cpp:1029-1035`) paths fall through to the stock window. Proven live by `adopt-popup`.
2. `window.open` with no URL / empty string from a page? → `about:blank` adopted tab (same as `webTabOpen` empty-page literal).
3. Adopted tab opener closed first? → Existing close path owns it; pending entry swept with the window (`webTabDropOwnedBy` family).

## Environment Availability

- Static gates: Node only, `--quick`, seconds. Available now.
- Live adopt check: needs built binary + last Theia build + display (same as nav-keys-live). Not run during planning (forbidden); plans carry the exact commands.

## Validation Architecture

One driver: `scripts/verify-platform.sh` (`--quick` gates commits; `--only <label>` samples; full suite before verify-work). Proof tiers: **S** static (`--quick` + `--self-test`); **L** live (built shell, `-purgecaches`, page-realm `probe()`).

| Requirement | Behaviour | Tier | Check (new or extended) | Self-test plants (each goes red naming drift) |
|---|---|---|---|---|
| PROMPT-05 shim | shim QI members == pinned IDL + call-site member set; single definition site via the boundary guard (plants already in `check-internals-boundary.sh:364-379`) | S | new `verify-new-window-adopt.mjs` (bridge file untouched except KIND_CLASSES) | remove a shim member; add an IDL/call-site member; second `browserDOMWindow`/`openLinkIn` site (positive control: the guard's own plants); empty derivation |
| PROMPT-05 opener | Theia-frame opener returns null before creating anything (static assertion on the null path); upstream null fall-throughs cited | S | `verify-new-window-adopt.mjs` | Theia-opener path creates/appends/pushes; missing null return |
| Pending overlay | attrs-before-append; `remoteType` from opener; `openWindowInfo` set; InFrame path issues no load, `openLinkIn` path loads via overlay docshell; `pc-*` never in store/copy | S | `verify-new-window-adopt.mjs` | drop an attr; reorder append-before-attrs; load call on the InFrame path; missing load on the `openLinkIn` path; `pc-` store write |
| Kind contract | `adoptTab`/`webTabAdopt`/`dropAdoptedTab` classified (tab-lifecycle), routed, walled (id/pcKey shape, sender), reply vocabulary (`opened`/`refused-scheme`/`unknown-tab`) | S | `verify-new-window-adopt.mjs` + `KIND_CLASSES` extension in bridge gate | unclassified kind; unwalled arm; unknown reply word |
| GUI-01 preserved | command has no `window.open` on its path; chrome-bar (excl. command file) has no stock escape; GUI-01 rows green unmodified | S+L | extend bridge "no stock escape" rule (re-point positive control) + `gui01-*` rows | re-add `window.open` to command; new escape in chrome-bar; changed GUI-01 assertion |
| Adopt order + reselect | tab-after opener; close reselects opener | L | `verify-new-window-adopt-live.mjs --scenario adopt-order` | `adopt-append-at-end` plant; `reselect-opener-off` plant |
| Opener round-trip | adopted tab reports a working `window.opener`; postMessage to the opener completes | L | `--scenario adopt-opener` | `opener-null` plant (overlay without `openWindowInfo` → `window.opener` null) |
| Popup outcome | `window.open` with popup features opens a stock popup window, not a tab | L | `--scenario adopt-popup` | `popup-becomes-tab` plant |
| Fallback | 5 s no-ack → stock window with URL; nothing swallowed (event-waited, never a fixed 6 s sleep) | L | `--scenario adopt-fallback` (kills frontend ack) | `fallback-off` plant (ack dropped, no stock window) |
| Scheme wall | `javascript:`/`moz-extension:` refused pre-creation | S+L | static wall assertion + `--scenario adopt-scheme` | `adopt-javascript` plant loads |
| Focus | background adopt keeps opener focus; foreground activates | L | `--scenario adopt-focus` | `background-activates` plant |

Sampling: `--quick` after every task commit (plus catalogue-line `--fix` + boundary `--catalogue` after every boundary edit); live scenarios per plan wave; full suite + every `--self-test` green before `/gsd-verify-work`. Max latency ~90 s (quick).

## Security Domain

### Applicable ASVS Categories
V1 Architecture (boundary, trust boundaries), V4 Access Control (opener/actor walls), V5 Input Validation (scheme, id/key shape), V8 Data Protection (no token/URL in logs), V11 Business Logic (adopt-or-fallback, no swallowed navigation), V14 Configuration (no new manifests).

### Threats (STRIDE; Phase 36 prefix T-36-)

| ID | S | Threat | Severity | Mitigation (plan) |
|---|---|---|---|---|
| T-36-01 | E | Second `browserDOMWindow`/`generateQI` site outside the boundary | high | single installer; boundary guard (`FORBIDDEN_PATTERNS` + plants, `check-internals-boundary.sh:83,364-379`) + shim-member gate (01) |
| T-36-02 | T | Scheme escape (`javascript:`/`moz-extension:`/`file:` adopted) | high | pre-creation `^https?://`+`about:blank` wall; `refused-scheme` (01, live 03) |
| T-36-03 | T | Spoofed opener (non-overlay/Theia-loopback page adopts into another window) | high | `groupSenderIsTheia` + opener `tabIdOfBrowser` derivation; Theia opener → null (01) |
| T-36-04 | T | Adopt push forgery (fake `adoptTab`/`webTabAdopt` binds attacker tab to victim docshell) | high | shape walls + `pcKey` correlator + sender wall; unknown → `unknown-tab` + `dropAdoptedTab` sweep (01/02) |
| T-36-05 | I | Token/URL/title leak in logs, pushes, store rows, copy | medium | kind+message-only logs; primitives-only pushes; `pc-*` never stored/shown (01/02) |
| T-36-06 | D | Swallowed navigation (lost frontend, no fallback) | high | 5 s ack timeout → `openStockTab`; live fallback scenario (02/03) |
| T-36-07 | D | Pending-table leak (`pc-*` survives close/quit, unbounded growth) | medium | ack-swap + close/quit sweep; no store rows (01) |
| T-36-08 | E | Focus theft / page-trapping via forced foreground adopt | medium | `background` flag; background never activates (02, live 03) |
| T-36-09 | T | Rebase adds IDL member the shim lacks (silent NS_ERROR) | medium | IDL-derived set-equality gate (01) |
| T-36-10 | T | GUI-01 regression (stock window unreachable / doubled) | high | command → `openStockTab` same landing; GUI-01 rows green unmodified (02/03) |
| T-36-SC | T | Supply-chain (manifest/lockfile installs) | low | accept: no manifest change in the diff (all plans) |

## Sources

### Primary (HIGH)
- `upstream/dom/interfaces/base/nsIBrowserDOMWindow.idl` (203 lines, pinned tag; plan 36-01 re-derives) + ARCHITECTURE.md §5a call chain (`ContentParent.cpp`, `nsFrameLoader.cpp`, `nsWindowWatcher.cpp`).
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (`webTabOpen` `:3234-3299`, walls `:140-142,310-341,385-387`, arms `:2446-2510`, `openStockTab`, `webTabClose`/`webTabDropOwnedBy`).
- `theia/extensions/tab-uris/src/browser/web-tab.ts` (union `:172-184`, channel `:232-299`, `openInBackground` `:781-789`, mint `:791-794`).
- `theia/extensions/tab-uris/src/browser/browser-window-command.ts` (`:106-234`).
- `powerbrowser/shell/GroupActorChild.sys.mjs`; `powerbrowser/shell/powerbrowser.js` (`gBrowser` `:83-99`); `powerbrowser.xhtml:58`.
- `scripts/verify-web-tab-bridge.mjs`, `verify-shell-gbrowser-standin.mjs`, `check-internals-boundary.sh`, `verify-gui01-window.mjs`, `verify-gui01-command.mjs`, `verify-platform.sh` registry.

### Secondary (MEDIUM)
- `.planning/research/*` (ARCHITECTURE §5a, PITFALLS 1–2, chrome-bar-firefox-gap, SUMMARY Phase 6); 28-SPIKE-DECISION Phase 36 adjustments; 27-RESEARCH/PATTERNS/VALIDATION harness shapes.

## Metadata

- Reads: repo tree + pinned upstream at planning time; no live run (forbidden in planning).
- Subagent fan-out (IDL text, call-site matrix, harness idioms, adopt patterns) corroborates the above; any conflict between a subagent return and a verified in-repo value above resolves in favour of the in-repo value, and plan 36-01 re-derives the IDL set from the tree at build time.

## RESEARCH COMPLETE
