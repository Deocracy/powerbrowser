# Phase 32: Page Tools - Research

**Researched:** 2026-10-22
**Domain:** Gecko page-tools surface (Finder, zoom, print, favicons, audio, downloads, save, edit, reader/source/devtools, crash) driven from PowerBrowserAPI over the PowerBrowserGroup actor; Theia 1.76 chrome-bar composition
**Confidence:** HIGH for every in-tree and upstream code path cited below (read this session at pinned `FIREFOX_153_5_0esr`, Theia 1.76.0). MEDIUM for runtime behaviour only a live run can confirm (Assumptions Log, Validation Architecture).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Recorded rulings that apply (REQUIREMENTS.md header, PROJECT.md Key Decisions, prior phases):
- Typed non-URL text may search (lifts 13-UI-SPEC "no new addressability scheme"); the chrome bar may write to Places, only through `PowerBrowserAPI`.
- Places writes go only through `PlacesUtils.*`, never raw SQL, never a second writer in the Theia backend (Pitfall 11).
- Firefox keys that clash with Theia keys take the browser meaning only while a web page has focus; Theia keeps its meanings in editors, terminals and other non-web tabs (KEY-04, 2026-10-20 ruling, Phase 27 relay).
- Chrome-bar copy reads the configured application name, never a hard-coded brand; no internal identifier in user-facing text (BAR-14, 01-UI-SPEC contract).
- Stock Firefox toolkit popups in `powerbrowser.xhtml` are shell furniture, not authored browser chrome (rule 5 clarified) — not used by this phase (print takes the system-dialog branch, never tab-modal preview).
- Hard rules hold: no Theia core patch (`scripts/diff-theia-core.sh`); no Gecko change outside the patch stack (`git -C upstream diff` empty); Firefox internals only via `PowerBrowserAPI.sys.mjs` catalogued in `powerbrowser/INTERNAL-APIS.md` (`scripts/check-internals-boundary.sh`); design for the bridge (`TabUriRegistry` shape asserted); repo path contains no space; Theia is the default GUI with the stock window reachable via `window.open(url,'_blank')` and no custom chrome authored.
- Extension tab host is Phase 31.1 (Chris sign-off 2026-10-21, Phase 28 spikes): patch 050 is the one logic patch (D-74 amended); the getTabForBrowser-null / no-synthesised-tab rulings are reversed; while the IDE has focus the last web tab stays the extensions' active tab; 31.1 delivers the favicon path (`setIcon`/`getIcon`) and host nodes with only the data fields `muted`, `muteReason` and `soundPlaying`; plan 32-09 adds the sync, `toggleMuteAudio` and the zoom shims (corrected 2026-10-23).
- The `127.0.0.1` token cookie is exempt from every clear-data kind and overlay loads to other loopback ports never carry it (technical ruling 2026-10-20) — downloads and save-as must not expose or delete it.
- Privileged kinds are invoked only from widget event handlers; an action that changes state is never a bare command id (Phase 27 rule, 30-D7/D-26) — applies to every new `webTab*` kind below.
- Verification: one driver, one registry (`scripts/verify-platform.sh`); new checks derive expectations from the tree and compare as set equality, with a `--self-test` that plants faults and requires each one to go red naming the drift; never assert on the absence of a log line.

Decided after research (autonomous, recommended, 2026-10-22) — D-01..D-31 in `32-CONTEXT.md`, summarized:
- D-01..D-04 (find): Theia-rendered find bar shrinking the page rect; chrome uses only `overlay.finder` (`fastFind`/`findAgain`/`highlight`/`requestMatchesCount` + listener → push); Ctrl+F/F3/Shift+F3/Esc + highlight-all/match-case/whole-words + `{current} of {total}`; page-focus scope only.
- D-05..D-07 (zoom): Ctrl+plus/minus/0 on `overlay.fullZoom`; chip in pill at live level ≠100%, click resets; session-only; never load `browser-fullZoom.js`; steps from `toolkit.zoomManager.zoomValues`.
- D-08..D-09 (print): system-dialog branch only (printsettings + printdialog services + `BrowsingContext.print`); Ctrl+P page-focus-scoped. D-09a: no browserDOMWindow shim is added — the shell carries no `nsIBrowserDOMWindow` (`powerbrowser.js:513`) and adds no stock popupsets as furniture. D-08a: a print-today failure is a blocker the executor reports (no stock-window fallback built here).
- D-10..D-11 (favicons): `LinkHandlerParent` → Phase 31.1 tab host → Places → cached `data:image/` icon in the wider push; Theia never fetches; `safeIcon` cap reused.
- D-12..D-13 (audio): `DOMAudioPlaybackStarted/Stopped` listener per overlay fanned out as push; `mute()`/`unmute()`/`audioMuted`; tab/strip mark + Ctrl+M page-focus-scoped.
- D-14..D-16 (downloads): probes 4/6/9 first; `Downloads.getList(Downloads.ALL)` + add/remove view push; rows open/show-in-folder/cancel/retry; no silent saves; button in chrome-bar composition; no custom path UI.
- D-17..D-18 (save): Ctrl+S page-focus-scoped → Theia file dialog ("Save page as"), write stays chrome-side (extends `savePageCopy`, never a Theia-backend writer).
- D-19..D-20 (edit): probe 9 decides per command; content-native editing stays in content; Edit menu/keys reach the focused page through the page-focus relay; no clipboard-reading suggestion.
- D-21..D-24 (reader/source/devtools): reader opens in same overlay when the readability signal (`Readerable.shouldCheckUri` + `isProbablyReaderable`, `AboutReaderChild.sys.mjs:233`) says article; view-source loads `view-source:` chrome-side via overlay navigation (the ViewSource actor is child-only, `ActorManagerParent.sys.mjs:576-583`); F12 routes through Phase 31's `openStockPage` enum (assumption — missing = blocker, no toolbox-window fallback built here); Ctrl+U page-focus-scoped.
- D-25 (crash): crashed overlay pushes a crashed flag + shows the CONTRACTED Theia crash UI over the overlay (N3/D-25e — never `displayLoadError` on the crashed overlay, never the stock copy beside it); tab/strip reload button runs existing `webTabReload`; never a blank page. D-25d: the live crash mechanism is `about:crashcontent` in a NAMED scratch tab (`nsAboutRedirector.cpp:49-50`; sibling-process overlays expected to crash too and are recorded); signal is ONE `oop-browser-crashed` addEventListener per overlay — never `TabCrashHandler.sendToTabCrashedPage` (its `browser.getTabBrowser()` returns null in the shell, `:950-955`). D-25a/b: Phase 32 also owns the shared-process blank-reload todo (five same-site tabs → repro first, then live remoteness-switch fix → regression row); the four-tab workaround is dropped once the fix lands.
- D-26..D-29 (architecture): every new kind joins `WEB_TAB_ACTION_KINDS` + `WebTabMessage` union, bridge gate grows its KIND_CLASSES set-equality in the same commit; Places-backed reads reuse `STORE_REQUEST_KINDS`; tab-host members ride the state push, not new store kinds; no new stand-in member; `webTabPush` widens with primitives/small enums only.
- D-30..D-31 (verification): new rows in `verify-platform.sh` (`--quick` static first, live extends the Phase 27 `pb-live-probe` harness); plans define live rows but do not run the binary now; every kind set is checked by deriving the set from the boundary file and comparing with the frontend union as set equality, with `--self-test` plants.

### Claude's Discretion

Row markup, chip and panel CSS, codicon choice per tool, downloads-panel list virtualization, find-bar match-count phrasing (from `findbar.ftl` via copy rules), exact plan split and wave order after the research probes. The UI spec fixes visual details; plan-phase research fixes the Finder-listener shape, the `Downloads` view push shape, the readability signal, the crash event, and the F12 stock-DevTools attachment.

### Deferred Ideas (OUT OF SCOPE)

- PAGE-07 window and page fullscreen — Phase 35 (fullscreen furniture, warning, relayed-prompt origin).
- MENU-03 menu entries and SMODE-07 Actions-mode rows for print / downloads / save / find / zoom — Phase 33 (kinds built here, entries there).
- Tab-menu Mute / Bookmark items — Phase 34.
- Per-site zoom memory; input-history ranking — Future Requirements (explicitly deferred).
- OpenSearch "Add engine" rows; Picture-in-Picture, translations, page-info dialog — Future Requirements.
- Ctrl+P / F1 / Ctrl+Shift+P routing into the pill — Future Requirements (stock quick input keeps them in v1.5).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAGE-01 | Find in page: Ctrl+F bar, F3/Shift+F3 next/previous, Esc close + clear selection, highlight-all, match-case, whole-words, `{current} of {total}` / phrase-not-found count | FinderParent via `overlay.finder` (Pattern 4): `fastFind` :408, `findAgain` :417, `highlight` :426, `requestMatchesCount` :447, `addResultListener` :50, `removeSelection` :560, `onFindbarOpen/Close` :587/:582; child actor `Finder` (`ActorManagerParent.sys.mjs:375`); listener vocabulary `onFindResult` :192, `onHighlightFinished` :504, `onMatchesCountResult` :542 |
| PAGE-02 | Zoom: Ctrl+plus/minus/0 on the active overlay, live-level chip in pill (≠100% only), click resets to 100% | `overlay.fullZoom` setter/getter (Pattern 5): `browser-custom-element.mjs:725-744`; steps from `toolkit.zoomManager.zoomValues` (`all.js:3035`); ZoomManager step engine as reference only (`viewZoomOverlay.js:12-105`); never load `browser-fullZoom.js` (gBrowser script :46-74) |
| PAGE-03 | Print: Ctrl+P (page-focus) opens the system print dialog for the overlay; no tab-modal preview | System-dialog branch only (Pattern 6): `printUtils.js:265-333` (`useSystemDialog`, `getPrintSettings`, `handleSystemPrintDialog`, `browsingContext.print(settings)`); page-setup variant :99-124; `getTabDialogBox` :132-134 is the hard tabbrowser dependency the shell lacks; `window.print()` routing is asserted absent-with-reason unless proven (D-09a); upstream key anchors: `printKb` (`browser-sets.inc.xhtml:185`, `modifiers="accel"`) + `.key = P` (`browserSets.ftl:88-89`), `key_savePage` (`browser-sets.inc.xhtml:184`) + `.key = S` (`browserSets.ftl:71-72`) — the Ctrl+P/Ctrl+S page-focus relay rows mirror these upstream keys, and `verify-shortcut-relay.mjs` rule 6 (no global F11/Ctrl+P/Ctrl+K row) is narrowed in plan 32-02 to allow page-scoped rows under the disable-when-not-overlay discipline |
| PAGE-04 | Favicons: tabs, strip and pill render the page icon; icon never fetched over the network | `LinkHandlerParent.setIconFromLink` (Pattern 10): `browser/actors/LinkHandlerParent.sys.mjs:163-263`; tab-host member via Phase 31.1 `getTabForBrowser` reversal (STACK.md:74); Places `setFaviconForPage` :248-255; `placesFavicons` read precedent (`PowerBrowserAPI.sys.mjs:4457`) |
| PAGE-05 | Audio + mute: playing tab shows its audio mark; mute toggles from tab/strip or Ctrl+M (page-focus) | `overlay.mute()/unmute()/audioMuted` (Pattern 5): `browser-custom-element.mjs:785-787,1030-1042`; `DOMAudioPlaybackStarted/Stopped` :987-1000 driven by the toolkit `AudioPlayback` actor (`ActorManagerParent.sys.mjs:143`); `soundPlaying` derived chrome-side (no getter on the element) |
| PAGE-06 | Downloads button + panel: every page-started download appears; rows open / show-in-folder / cancel / retry; no silent saves | `Downloads.getList(ALL)` + add/remove view push (Pattern 7): `Downloads.sys.mjs:153`, `DownloadList.sys.mjs:247/269`, `DownloadCore.sys.mjs:378/905/932/971`, `DownloadIntegration.sys.mjs:789/991/1075/1214`; panel is stock-window-only (`DownloadsCommon.sys.mjs:1027`), so the shell builds its own panel on a view push |
| PAGE-08 | Save page: Ctrl+S (page-focus) saves through a chrome-side kind to a user-picked destination | `savePageCopy` precedent + picker split (Pattern 8): `PowerBrowserAPI.sys.mjs:3984-4107` (`frameLoader.startPersistence`, `nsIWebBrowserPersist.saveDocument`, minted `saved-pages/<stamp>-<rand>/`, `isMintedSavedPageDir`); store kind `"savePageCopy"` :3705/:3786; Theia file dialog picks, chrome writes |
| PAGE-09 | Edit commands: Edit menu + usual keys reach the focused page; content-native editing needs no round-trip; only chrome-help commands get kinds | Probe 9 verdict (Pattern 9): `key_undo/redo/cut/copy/paste/selectAll` are `internal="true"` with no `command=` (`browser-sets.inc.xhtml:189-215`), editor-routed with page focus; chrome path is `docShell.doCommand` (`nsIDocShell.idl:550-554`); Theia-initiated UI only gets `webTabEdit` |
| PAGE-10 | Reader view in the same overlay (article signal); view source loads `view-source:` chrome-side; F12 routes through Phase 31 `openStockPage` (assumption) | ReaderMode + scheme wall + stock window (Pattern 10): `ReaderMode.enterReaderMode` (`ReaderMode.sys.mjs:55-67`, `about:reader?url=` + same-history entry), `getOriginalUrl` :133-149; readability signal is `Readerable.shouldCheckUri` + `isProbablyReaderable` (`AboutReaderChild.sys.mjs:233`); ViewSource actor is child-only with no parent (`ActorManagerParent.sys.mjs:576-583`) so entry reuses overlay navigation; `view-source:` minted chrome-side only; no custom inspector (rule 5), no toolbox-window fallback built here |
| PAGE-11 | Crashed tab: contracted Theia crash UI over the overlay + crashed push (no displayLoadError, no stock copy); tab/strip reload button runs `webTabReload`; history survives; shared-process blank-reload fixed (repro first) | Crash signal (Pattern 10, corrected 2026-10-23, checker N3): ONE `addEventListener("oop-browser-crashed", …)` per overlay — the event fires on the browser element itself (`nsFrameLoader.cpp:3717/3728/3736`, dispatched at `:3765`), so no gBrowser is needed; polling `isCrashed` (`browser-custom-element.mjs:553-559`) never fires (crashed process sends no further events); `displayLoadError(NS_ERROR_CONTENT_CRASHED)` is docShell-null on a crashed remote overlay (stock switches to `NOT_REMOTE` first at `ContentCrashHandlers.sys.mjs:545-552`, a swap no shell gBrowser performs); live crash via `about:crashcontent` in a NAMED scratch tab (`nsAboutRedirector.cpp:49-50`, sibling-process overlays expected to crash too); reload is the existing `webTabReload` arm (`PowerBrowserAPI.sys.mjs:3836+`), not a new restore path |
</phase_requirements>

<research_summary>
## Summary

Page tools are a browser-element-only phase: every control in scope resolves to a method or event on the overlay `<xul:browser>` (`finder`, `fullZoom`, `mute`/`unmute`/`audioMuted`, `stop`, `reloadWithFlags`, `gotoIndex`) or to a toolkit service called with the overlay's browsing context (`BrowsingContext.print`, `Downloads.getList`, `docShell.doCommand`, Places favicons), plus two chrome-owned subscriptions (the Finder result listener and the `Downloads` view). Nothing in scope needs a `browser.xhtml` script, a tab-dialog box, or a second browser chrome: the one branch of print that needs a dialog box is the branch this phase does not build, and the one zoom file that knows per-site memory is the file this phase does not load.

The standard approach, confirmed file-by-file at the pinned tag, is: (1) new `webTab*` action kinds beside the Phase 27 kinds, one routing line each, with the two sender walls (`groupSenderIsTheia` + `webTabIdIsValid`) and chrome-side argument validation; (2) tab-host members (favicon, mute/`soundPlaying`, zoom) arriving through the widened `webTabPush` as primitives/small enums, read live like URL/title, never as prefs, tokens or objects; (3) Places-backed reads reusing `STORE_REQUEST_KINDS` with the shell-window wall; (4) the Theia find bar, zoom chip, downloads button/panel, reader toggle and crash reload composed in `@powerbrowser/chrome-bar` from `@theia/core` primitives and the installed codicons, with all new strings in `CHROME_BAR_COPY` and all new keys page-focus-scoped through the `PAGE_KEYS`/`PAGE_SHORTCUTS` relay.

**Primary recommendation (W-A, ROADMAP "probes run first"):** EXECUTE the three research probes first (downloads-today, print-today, edit-commands-today) in plan 32-01 itself (Theia build + `--scenario <probes>`) and write their verdict strings to `scripts/lib/pb-probe-verdicts.json`, which the probe-gated build plans (32-03/32-04/32-06) read as their first step (missing file/key = blocker, never assumed); then land the kinds in dependency order — find/zoom/mute (pure element methods, no probe risk) → crash/favicon/reader (push + same-tab navigation) → print/downloads/save/edit (service-backed, probe-gated) — with every kind set covered by a derive-and-compare gate plus `--self-test` plants in the same commit.
</research_summary>

<standard_stack>
## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Gecko `FinderParent` via `overlay.finder` | `FIREFOX_153_5_0esr` | In-page search: `fastFind`, `findAgain`, `highlight`, `requestMatchesCount`, result-listener → push | The element getter (`browser-custom-element.mjs:581-596`) returns `FinderParent` for remote overlays; no `browser.xhtml` findbar script is loaded |
| `overlay.fullZoom` | `FIREFOX_153_5_0esr` | Session zoom read/write on the overlay's browsing context | Setter/getter (`browser-custom-element.mjs:725-744`) is the browser-element-only path; steps come from the `toolkit.zoomManager.zoomValues` pref default (`all.js:3035`) |
| printsettings-service + printdialog-service + `BrowsingContext.print(settings)` | `FIREFOX_153_5_0esr` | System-dialog print for the overlay's top browsing context | The system branch of `printUtils.js:265-333`; the tab-modal branch (`_openTabModalPrint`, `getTabDialogBox`) needs a tabbrowser the shell lacks and is never built |
| `overlay.mute()` / `unmute()` / `audioMuted` + `DOMAudioPlaybackStarted/Stopped` | `FIREFOX_153_5_0esr` | Mute control + playing signal on the overlay element | Element methods (`browser-custom-element.mjs:785-787,1030-1042`) and element events (:987-1000) driven by the toolkit `AudioPlayback` actor (`ActorManagerParent.sys.mjs:143`) |
| `Downloads` (`Downloads` / `DownloadList` / `DownloadCore` / `DownloadIntegration`) | `FIREFOX_153_5_0esr` | Download enumeration, view subscription, row actions | `getList(Downloads.ALL)` (`Downloads.sys.mjs:153`), `addView`/`removeView` (`DownloadList.sys.mjs:247/269`), `start`/`launch`/`showContainingDirectory`/`cancel` (`DownloadCore.sys.mjs:378/905/932/971`) |
| `ReaderMode` (`ReaderMode.sys.mjs` + `Readerable`) | `FIREFOX_153_5_0esr` | Article signal + same-tab reader entry/exit | `enterReaderMode` (`:55-67`, `about:reader?url=` + history entry), `getOriginalUrl` (:133-149); toggle signal is `shouldCheckUri` + `isProbablyReaderable` (`AboutReaderChild.sys.mjs:231-237`), stored parent-side as `browser.isArticle` (`AboutReaderParent.sys.mjs:120-129`) — the shell reads the pair live and pushes booleans, never an expando |
| `LinkHandlerParent` + `PlacesUtils.favicons` (reference — Phase 31.1 owns the host) | `FIREFOX_153_5_0esr` | Favicon capture → Places → `data:image/` icon in the push | `setIconFromLink` (`LinkHandlerParent.sys.mjs:163-263`, tab via `win.gBrowser.getTabForBrowser` `:95-119`); read precedent `placesFavicons` (`PowerBrowserAPI.sys.mjs:4457`); `safeIcon` 64 KiB cap reused; Phase 32 consumes the host, never re-derives it |
| Crash signal: `oop-browser-crashed` listener per overlay + contracted Theia crash UI | `FIREFOX_153_5_0esr` | Crashed-tab signal for the over-overlay crash UI + crashed push | Event fires on the element (`nsFrameLoader.cpp:3717/3728/3736`, dispatched `:3765`) — no gBrowser needed; `displayLoadError` is docShell-null on a crashed remote overlay (stock `NOT_REMOTE`-first at `ContentCrashHandlers.sys.mjs:545-552`); stock shape `sendToTabCrashedPage` (`:541-556`) is NOT callable in the shell (`getTabBrowser()` null at `browser-custom-element.mjs:950-955`); live crash via `about:crashcontent` (`nsAboutRedirector.cpp:49-50`); reload reuses `webTabReload` |
| `nsICommandManager` via `docShell.doCommand` | `FIREFOX_153_5_0esr` | Theia-initiated edit commands only | `isCommandEnabled`/`doCommand` (`nsIDocShell.idl:550-554`); key-driven editing is editor-routed (`browser-sets.inc.xhtml:189-215`) and needs no kind |
| `@theia/core` primitives | 1.76.0 | Bar, find bar, downloads panel, dialogs, menus, keybindings | Already composed: `ReactWidget`, `ContextMenuRenderer` + `MenuPath`, `HoverService`, `KeybindingRegistry`, `DialogService`/file dialog, `ApplicationShell`; no new framework |
| `@vscode/codicons` | 0.0.45 (via Theia) | Tool glyphs | Installed; new glyphs (`search`, `zoom-in/out`, `arrow-down/up`, `close`, `printer`, `save`, `volume`/`mute`, `cloud-download`, `folder-opened`, `refresh`, `book`, `code`, `tools`) confirmed present by grep of `dist/codicon.css` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ChromeStoreClient` | tree | Places-backed reads from Theia | Any new Places-backed read (favicon-adjacent) reuses the `searchPlaces`/`placesFavicons` method shape |
| `WebTabChannel` (`send` vs `request`, `onPush`, `widgetOf`) | tree | Bridge transport | `request` when the reply decides UI (find/next/close, zoom, mute, edit); `send` for fire-and-forget |
| `pb-live-probe.mjs` BiDi harness | tree | Live scenarios | Every live row extends `withProbeShell` + push recorder + chrome-scope evaluate, after the static gates |
| `nsIWebBrowserPersist` + `frameLoader.startPersistence` | ESR | Save-page bytes | The landed `savePageCopy` path (`PowerBrowserAPI.sys.mjs:3992-4026`); the picker split reuses it |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Theia find bar shrinking the page | Toolkit findbar overlaying the page | The overlay covers content; the roadmap grants the shrink-the-page exception and the bar must never cover the page |
| System-dialog print | Tab-modal print preview | Needs `gBrowser.getTabDialogBox` + `chrome://global/content/print.html` + `PrintPreview`; a second browser chrome the shell must not host |
| Per-site zoom memory now | Session zoom now, memory later | Memory needs `ContentPrefService2` writes keyed `browser.content.full-zoom`; a Future Requirement, explicitly deferred |
| `browser-fullZoom.js` step logic | Chrome-side snap over the `zoomValues` pref | The file is a `gBrowser` chrome script (`gBrowser.browsers` loop); loading it makes the shell a second Firefox chrome |
| Custom inspector for F12 | Stock DevTools window for the overlay | A custom inspector is authored browser chrome; rule 5 forbids it |
| `DownloadsPanel` reuse | Shell-owned panel on a `Downloads` view push | `DownloadsCommon` opens its panel in the most recent `navigator:browser` window; a shell-only session may have none |
| Raw SQL Places writes | `PlacesUtils.*` only | Raw SQL bypasses observers and the single-writer rule; Pitfall 11 bans it |

**Installation:** none — no new packages. Every dependency above is pinned in-tree (`upstream/`, `theia/node_modules`) or already landed in `powerbrowser/shell`.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
Theia event (key, click, menu, relay push)
  → chrome-bar widget handler ONLY (never a bare command id; D-43)
  → WebTabChannel.request/send({ kind: 'webTab*', tabId, ... })   [tab-uris]
  → PowerBrowserGroup actor → handleWebTabAction                    [chrome]
      ├── walls: groupSenderIsTheia + webTabIdIsValid, args validated chrome-side
      ├── element method on webTabs.get(tabId).browser
      │     (finder / fullZoom / mute / stop / reloadWithFlags / gotoIndex /
      │      browsingContext.print / docShell.doCommand / view-source load)
      └── reply { ok, kind, ... }  →  settle / settleUnknownTab  →  UI state
Chrome subscriptions (no Theia round-trip to start):
  overlay.finder result listener  →  findMatches / findStatus push   [PAGE-01]
  DOMAudioPlaybackStarted/Stopped →  soundPlaying push               [PAGE-05]
  Downloads.getList(ALL).addView  →  downloadsChanged push           [PAGE-06]
  LinkHandlerParent → tab host → Places → data:image/ icon in push   [PAGE-04]
  wider webTabPush (url/title/loading/canGoBack/canGoForward + favicon,
    audioMuted/soundPlaying, zoom, securityState, crashed)           [all]
Places-backed reads: ChromeStoreClient → STORE_REQUEST_KINDS →
  handleStoreRequest (shell-window wall) → PlacesUtils.* only        [PAGE-04]
```

### Component Responsibilities

| Component | Responsibility | Key Files |
|-----------|---------------|-----------|
| Chrome find/zoom/mute/print/save/edit/reader/source/crash kinds | Validate sender + tabId + args; call the element method or toolkit service; reply `{ok,kind,…}` or `{ok:false,reason:validation}` | `powerbrowser/shell/PowerBrowserAPI.sys.mjs` end-of-file web-tab section (grows downward; `WEB_TAB_ACTION_KINDS`, `handleWebTabAction`, `sendWebTabPush`, `scheduleWebTabState`) |
| Chrome subscriptions | Finder listener, audio element listener, `Downloads` view, crash signal → pushes | Same file + `powerbrowser.js` overlay-creation listener discipline |
| State push | Coalesced per-tab push of primitives/small enums read live (URL/title/loading/canGoBack/canGoForward + favicon/audio/zoom/crashed/securityState) | `webTabPush` + `scheduleWebTabState` |
| Theia channel | `WebTabMessage` union, `WebTabState`, `send` vs `request`, `onPush` subscription (never router edits), `widgetOf(tabId)` | `theia/extensions/tab-uris/src/browser/web-tab.ts` |
| Theia store client | Places-backed reads only | `theia/extensions/tab-uris/src/browser/chrome-store-client.ts` |
| Bar composition | Find bar, zoom chip, downloads button/panel, reader toggle, crash reload; command-per-action + `currentWebTab()`; page-focus keybindings; copy in `CHROME_BAR_COPY` | `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`, `chrome-bar-commands.ts`, `chrome-bar-keybindings.ts`, `chrome-bar-shortcuts.ts`, `chrome-bar-copy.ts`, `chrome-bar.css` |
| Pill rows | Favicon/type-icon rendering via `safeIcon`/`iconFor`/`composeRows` | `address-bar/address-bar-rows.ts` |
| Shell keys | `<key>` rows mirroring `PAGE_SHORTCUTS` row-for-row; page-focus enable; F6 reply-listener precedent | `powerbrowser/shell/powerbrowser.js` (`PAGE_KEYS`: `powerbrowser.js:335-365`, disable-when-not-overlay `:387-397`, row-creation loop `:366-386`) |
| Gates | Derive-and-compare set-equality + `--self-test` plants; one registry | `scripts/verify-web-tab-bridge.mjs`, `scripts/verify-*.mjs` (new), `scripts/verify-platform.sh` |

### Recommended Project Structure

```
powerbrowser/shell/PowerBrowserAPI.sys.mjs   # all new kinds (end-of-file web-tab section only)
powerbrowser/INTERNAL-APIS.md                # append-only catalogue rows for every touched internal
powerbrowser/shell/powerbrowser.js           # PAGE_KEYS additions mirroring PAGE_SHORTCUTS
theia/extensions/tab-uris/src/browser/web-tab.ts            # union + state + widget methods
theia/extensions/tab-uris/src/browser/chrome-store-client.ts # only if a new Places-backed read appears
theia/extensions/chrome-bar/src/browser/
  chrome-bar-widget.tsx      # find bar, zoom chip, downloads button/panel, reader toggle, crash reload
  chrome-bar-commands.ts     # command-per-action, Browser category, currentWebTab()
  chrome-bar-keybindings.ts  # page-focus-scoped keys, ADDRESS_FOCUSED passthrough precedent
  chrome-bar-shortcuts.ts    # PAGE_SHORTCUTS additions mirroring PAGE_KEYS
  chrome-bar-copy.ts         # every new string (appSubject(), no internals)
  chrome-bar.css             # find-bar/dropdown/panel rules under the existing layer
scripts/verify-page-tools-*.mjs  # one static gate per kind family + --self-test
scripts/verify-page-tools-live.mjs  # BiDi scenarios on pb-live-probe.mjs
scripts/verify-platform.sh   # one registry row per new check (quick + live)
```

### Pattern 1: New `webTab*` kind, end to end (Phase 27 precedent, exact)

**What:** every control in scope is one routing line + one union member + one gate entry, in the same commit.
**When to use:** find, zoom, mute, print, downloads actions, save, edit, reader, view-source, crash-adjacent loads.
**Example:**
```js
// powerbrowser/shell/PowerBrowserAPI.sys.mjs (end-of-file web-tab section; grows downward)
case "webTabFind": {
  if (!webTabIdIsValid(data.tabId)) {
    return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
  }
  return { ok: true, kind, ...PowerBrowserAPI.webTabFind(data.tabId, data) };
}
```
```typescript
// theia/extensions/tab-uris/src/browser/web-tab.ts (union grows; count comment updated)
| { kind: 'webTabFind'; tabId: string; query: string; caseSensitive?: boolean; entireWord?: boolean; highlightAll?: boolean }
```
```typescript
// caller: request when the reply decides UI, send when fire-and-forget (stop() precedent :662-664)
const reply = this.settle(await this.channel.request({ kind: 'webTabFind', tabId: this.tabId, query }));
```
Walls: `groupSenderIsTheia(actorRef)` at the top of `handleWebTabAction`, `webTabIdIsValid` per kind, overlay derived from the `webTabs` map — never accept a browser reference from the frame. Privileged follow-ups run only from widget event handlers, never as bare command ids (Pitfall 7; the bridge gate pins this shape).

### Pattern 2: State-push widening for tab-host members (favicon / mute / `soundPlaying` / zoom / crashed)

**What:** read the field live off the overlay (like URL/title today) and add it to the same coalesced push.
**When to use:** any per-tab field the bar renders without asking.
**Example:**
```js
// webTabPush(theiaBrowser, tabId, browser, loading) — read live, primitives/small enums only
{ kind: "state", tabId, url, title, loading, canGoBack, canGoForward,
  zoom: entry.browser.fullZoom, audioMuted: entry.browser.audioMuted, soundPlaying, favicon, crashed }
```
Zoom, mute state and `soundPlaying` arrive this way (ROADMAP Notes; 28-SPIKE-DECISION; D-27) — not as store kinds. `WebTabState` gains the same fields; `applyState` renders chip/marks from the push; the chip never reads prefs. Push zoom in the same push as URL (Pitfall 5 item 3: a location push landing before a zoom push shows the last site's level on the next site).

### Pattern 3: Places-backed reads reuse `STORE_REQUEST_KINDS`

**What:** `case "placesFavicons"` (`:3796-3797`) is the template: shell-window wall, `PlacesUtils.*` only, bounded `data:image/` out.
**When to use:** any new favicon- or history-adjacent read.
```js
case "placesFavicons": {
  return { ok: true, kind, icons: await placesFavicons(data.urls) };
}
```
`placesFavicons` caps at 10 urls, skips non-http(s), resolves `getFaviconForPage(uri, 16)`, keeps only `data:image/` ≤ 65536 chars (`PowerBrowserAPI.sys.mjs:4457-4477`). No icon fetch ever crosses into the Theia frame (D-11).

### Pattern 4: Find via `overlay.finder` + listener → push

**What:** the Theia find bar drives `FinderParent` on the overlay element; counts and status come back through the result listener as pushes.
**When to use:** PAGE-01 only.
**Example:**
```js
const entry = webTabs.get(tabId);
const f = entry.browser.finder; // remote branch: new lazy.FinderParent(this) (browser-custom-element.mjs:581-596)
f.fastFind(query, false, false);            // first search / Enter
f.findAgain(query, backwards, false, false); // F3 / Shift+F3
f.highlight(highlightAll, query, false);     // highlight-all toggle
f.requestMatchesCount(query, { linksOnly: false }); // {current} of {total}
f.caseSensitive = bool; f.entireWord = bool; f.matchDiacritics = bool; // toggles re-run
f.removeSelection(false);                    // Esc / close clears the selection
f.onFindbarOpen(); f.onFindbarClose();        // paired with bar open/close
```
Upstream: `fastFind` (`FinderParent.sys.mjs:408-415`), `findAgain` (:417-424), `highlight` (:426-445), `requestMatchesCount` (:447-466), `addResultListener` (:50-52), `removeSelection` (:560-564). The child actor `Finder` is toolkit-wide child-only + `allFrames:true` (`ActorManagerParent.sys.mjs:375-381`); listener vocabulary is `onFindResult` (:192), `onHighlightFinished` (:504-507), `onMatchesCountResult` (:542-550, `{searchString,current,total,limit,snippets}`). Kinds: `webTabFind{query,caseSensitive?,entireWord?,highlightAll?}`, `webTabFindNext{backwards}`, `webTabFindClose{}`; pushes `findMatches{current,total}` + `findStatus{found|notFound|wrapped}`. Query kept per-tab in frontend memory (UI-SPEC); bar docks above the page and the page rect shrinks (granted occlusion exception).

### Pattern 5: Zoom and mute as element members + push

**What:** write the level/flag through the element; read it back live into the push.
**When to use:** PAGE-02, PAGE-05.
**Example:**
```js
entry.browser.fullZoom = next;              // setter browser-custom-element.mjs:725-737
const z = entry.browser.fullZoom;           // getter :739-744 (browsingContext.fullZoom)
entry.browser.mute(); entry.browser.unmute(); // :1030-1042 (notifyMediaMutedChanged)
const m = entry.browser.audioMuted;         // :785-787
browser.addEventListener("DOMAudioPlaybackStarted", onPlay);  // :987-994 (suppressed while muted :988-990)
browser.addEventListener("DOMAudioPlaybackStopped", onStop);  // :996-1000
```
Steps: parse the live `toolkit.zoomManager.zoomValues` pref (`all.js:3035`, `.2,…,1,…,2,…,3,4,5`), snap index±1 like `enlarge/reduceForBrowser` (`viewZoomOverlay.js:58-72`), clamp to MIN..MAX; Ctrl+0 sets `1`. `toFixed(2)` equality is a no-op by design (:726) — idempotent reset is free. `soundPlaying` has no element getter (grep confirms) — derive it chrome-side from the event + flag and push both. Control kinds: `webTabZoomIn/Out/Reset{tabId}` (or `webTabZoom{tabId,value?}`), `webTabMute{tabId,muted:boolean}` (explicit boolean, not a toggle).

### Pattern 6: Print as the system-dialog branch only

**What:** reproduce `startPrintWindow`'s system path inside `PowerBrowserAPI`, never the tab-modal path.
**When to use:** PAGE-03.
**Example:**
```js
// printUtils.js:265-333, minus everything that needs a tabbrowser:
const useSystemDialog = true; // PREFER_SYSTEM_DIALOG && !PRINT_ALWAYS_SILENT
let settings = getPrintSettings("", false, /*aAllowPseudoPrinter*/ !useSystemDialog);
if (useSystemDialog) {
  doPrint = await handleSystemPrintDialog(browsingContext.topChromeWindow, hasSelection, settings);
  if (!doPrint) return;
}
browsingContext.print(settings);
```
`getPrintSettings` (:485-538), `handleSystemPrintDialog` = `nsIPrintDialogService.showPrintDialog` with `NS_ERROR_ABORT`→false (:542-567), page-setup variant (:99-124). Never call `getTabDialogBox` (:132-134 — `gBrowser.getTabDialogBox`, absent in the shell) or `_openTabModalPrint` (:162-208 — `print.html` + `PrintPreview` in `browser.xhtml`). `window.print()` from content has no proven shell path (D-09a): the shell carries no `nsIBrowserDOMWindow` (`powerbrowser.js:513`), `OPEN_PRINT_BROWSER` (`nsIBrowserDOMWindow.idl:74`) routes into a hidden print browser only a DOM-window owner can provide, and no shim is added here. Do not load `printUtils.js` (a `gBrowser`/chrome-document script). Print settings/print-dialog service reach-throughs are new `Ci.`/`Cc.` touches: they need the Phase 27 policy (FORBIDDEN_PATTERNS exemption + self-test plant + catalogue row) in the plan that first uses them.

### Pattern 7: Downloads as a `Downloads` view push

**What:** one chrome-side view on `Downloads.getList(Downloads.ALL)`; view callbacks serialize rows into pushes; row actions run chrome-side.
**When to use:** PAGE-06.
**Example:**
```js
const list = await Downloads.getList(Downloads.ALL); // Downloads.sys.mjs:153-190
await list.addView(chromeView);   // DownloadList.sys.mjs:247-261 (replay + batch)
await list.removeView(chromeView); // :269-271 on unload
// chromeView.onDownloadAdded / onDownloadChanged serialize:
// { id, url, filename, bytesTotal, bytesReceived, state, succeeded, canceled, error, targetPath? }
download.cancel(); download.launch(); download.showContainingDirectory(); // DownloadCore.sys.mjs:971/905/932
```
Download objects do not structured-clone — serialize inside the view callbacks (same rule as `PowerBrowserAPI.sys.mjs:3751-3752`). `launch`/`showContainingDirectory` stay chrome-side (OS + executable confirm at `DownloadIntegration.sys.mjs:821-828`). Never instantiate `DownloadsPanel` (`DownloadsCommon.sys.mjs:1027` opens it in the most recent `navigator:browser` window, which a shell-only session may lack). The no-silent-save invariant (roadmap criterion 4) is a live assertion: every page-started download appears as a row. Overlay-initiated download behaviour is UNVERIFIED until the probe runs (STACK.md:75).

### Pattern 8: Save as picker-split `savePageCopy`

**What:** keep the landed `savePageCopy` byte path; add a Theia-owned picker in front of it.
**When to use:** PAGE-08.
```js
// existing, unchanged: PowerBrowserAPI.sys.mjs:3984-4107
persistDocument(browser) // frameLoader.startPersistence :3992-3999
writePersistedDocument(doc, pageFile, pageFilesDir) // nsIWebBrowserPersist.saveDocument :4001-4026
// minted dir only: profile/saved-pages/<stamp>-<rand>/ (:4057-4059), isMintedSavedPageDir (:4090-4107)
// guards: missing/oversized uri, unknown tab, private tab, non-http(s), unknown profile (:4038-4056)
```
The destination picker is a Theia file dialog ("Save page as"); the write stays chrome-side into the minted dir, then an export copies to the picked path — never a raw frontend absolute path executed with chrome privileges, never a Theia-backend writer (Pitfall 11). `PERSIST_FLAGS_FROM_CACHE` (:4006) honors the jar: the token-cookie rules still hold (never exfiltrate loopback pages).

### Pattern 9: Edit commands — probe 9 decides, content-native needs no kind

**What:** key-driven editing never crosses the bridge; only Theia-initiated Edit UI gets a kind.
**When to use:** PAGE-09.
Upstream: `key_undo/redo/cut/copy/paste/selectAll` are `internal="true"` with NO `command=` (`browser-sets.inc.xhtml:189-215`) — editor-routed with page focus, no chrome handler; only `key_delete` has `command="cmd_delete"`. Menus bind `command="cmd_*"`; `goDoCommand` resolves `document.commandDispatcher.getControllerForCommand` (`globalOverlay.js:100-131`). Chrome equivalent for Theia-initiated UI: `overlayBrowser.docShell.doCommand(cmd)` guarded by `isCommandEnabled` (`nsIDocShell.idl:550-554`). Kind (only if the probe confirms a chrome-help command exists): `webTabEdit{tabId, cmd: 'cmd_undo'|…|'cmd_delete'}` with the literal set frozen + self-test; paste only from an explicit widget Paste handler (Pitfall 13); return status, never clipboard text. Enablement for menu greying is a read kind or a state-push field.

### Pattern 10: Reader, favicon, source, devtools, crash

**What:** same-tab navigation or stock windows through chrome; pushes carry the state.
**When to use:** PAGE-04, PAGE-10, PAGE-11.
- **Reader:** `ReaderMode.enterReaderMode(docShell, win)` sets `about:reader?url=` + history entry (:55-67) so Back exits; `leaveReaderMode` loads the original (:73-124); `getOriginalUrl` parses it (:133-149). Toggle enabled only when the chrome-side readability signal says article: `Readerable.shouldCheckUri(document.baseURIObject, true) && Readerable.isProbablyReaderable(document)` — the exact pair `AboutReaderChild` evaluates before sending `Reader:UpdateReaderButton{isArticle:true}` (`AboutReaderChild.sys.mjs:231-237`); the parent stores it as the expando `browser.isArticle` (`AboutReaderParent.sys.mjs:120-129`), which the shell must NOT copy (an expando on a tabbrowser-less overlay is invisible to every other consumer — read the pair live and push booleans instead). Stays in the same overlay so `gotoIndex` history survives (D-21). `parseDocument` is NOT the toggle signal (it builds the article body for the about:reader page itself).
- **Favicon:** Phase 32 consumes the Phase 31.1 tab host (assumption — missing = blocker, never rebuilt here). Upstream reference only: `LinkHandlerParent.setIconFromLink` (`LinkHandlerParent.sys.mjs:163-263`) resolves its tab via `win.gBrowser` + `getTabForBrowser(browser)` (`:105`/`LinkHandlerParent.sys.mjs:95-119`, guarded by `getTabBrowser()` null at `browser-custom-element.mjs:950-955`); multi-image canvas path :183; `setFaviconForPage` :248-255; `setIcon(tab,…)` :262-264. No new stand-in member for favicons (D-28; its amended exceptions are plan 32-09's mute and zoom members); if a consumer needs one, its `gBrowser`-receiver branch is grepped and recorded per Pitfall 2 first.
- **View source:** chrome mints the `view-source:` load with the overlay's own navigation (`fixupAndLoadURIString` + null principal, the `webTabNavigate` shape at `PowerBrowserAPI.sys.mjs:3413-3426`) in the active or a new overlay; Theia never holds a `view-source:` URL across the scheme wall (D-22, Out of Scope row). Never send `ViewSource:LoadSource` — the ViewSource actor registers child-only toolkit-wide with NO parent (`ActorManagerParent.sys.mjs:576-583`), so there is no chrome-side actor to message.
- **Devtools:** F12 routes through Phase 31's `openStockPage` enum (assumption — missing = blocker); no custom inspector (rule 5) and no toolbox-window fallback is built here (W5). Reference only: the stock entry is `gDevTools.showToolboxForTab(tab,…)` (`devtools.js:622`), which needs a real XUL tab — the reason it belongs to the Phase 31 stock-window path, not to this phase.
- **Crash (corrected 2026-10-23, checker N3 — chosen mechanism B):** ONE `addEventListener("oop-browser-crashed", …)` per overlay at creation (fires on the element itself: `nsFrameLoader.cpp:3717/3728/3736`, `EventDispatcher::DispatchDOMEvent(ownerContent, …)` at `:3765` — needs NO gBrowser, NO BrowserGlue, NO stock popupsets as furniture). On fire: push `crashed:true` + render the CONTRACTED Theia crash UI OVER the overlay — never `browser.docShell.displayLoadError` on the crashed overlay (null on a crashed remote overlay; stock switches to `NOT_REMOTE` first at `ContentCrashHandlers.sys.mjs:545-552`, a swap no shell gBrowser performs) and never the stock `about:tabcrashed` copy (one crash UI at a time). Polling `isCrashed` (`browser-custom-element.mjs:553-559`) on the network-stop push path never fires (crashed process sends no further events). `sendToTabCrashedPage` (`:541-556`) is reference-only (its `browser.getTabBrowser()` returns null in the shell at `:950-955`). Live crash: `about:crashcontent` in a NAMED scratch tab (`nsAboutRedirector.cpp:49-50`, sibling-process overlays expected to crash too). Reload reuses `webTabReload` (`PowerBrowserAPI.sys.mjs:3836+`, D-25).
- **Shared-process blank-reload (B1):** with `dom.ipc.processCount.webIsolated=4` (`upstream/modules/libpref/init/all.js:1887-1889`, non-Android branch) the fifth same-site tab shares a content process; reloading it swaps the frameloader while `docShellIsActive` reads false and the overlay sticks at `about:blank` (27 deferred-items evidence: same browsing-context id, new childID, no GET). The fix is chrome-side in the remoteness/activation ordering — it keeps `remoteType:"web"` + `maychangeremoteness` (`PowerBrowserAPI.sys.mjs:3245-3259`) and repairs activeness after the swap; it never disables process switching. Live mechanism (W-B: reproduce FIRST, then fix — the todo's order): the repro scenario runs before any fix line and records the verdict (expected-before-fix: `about:blank`, `docShellIsActive` false, no GET); then the fix lands; `remoteness-regression` (five same-site tabs on one served origin, reload/activate the fifth, assert the page (not `about:blank`) + `docShellIsActive` true) stays as the regression row.

### Anti-Patterns to Avoid

- **Loading `browser.xhtml` scripts** (`findbar.js`, `browser-fullZoom.js`, `printUtils.js`, `editMenuOverlay.js`, `browser-places.js`): they are `gBrowser`/chrome-document scripts; loading them makes the shell a second Firefox chrome and their DOM lookups fail (STACK.md:161).
- **Tab-modal print preview** (`getTabDialogBox`, `_openTabModalPrint`, `print.html`, `PrintPreview`): needs a tabbrowser the shell lacks; system-dialog only (STACK.md:152).
- **A second Places writer or raw SQL**: all writes go through `PlacesUtils.*` from chrome; the Theia backend never opens places/tabs.sqlite RW (Pitfall 11).
- **Bare command ids for state-changing kinds**: every new `webTab*` kind runs only from a widget event handler (Pitfall 7); the bridge gate pins the call-site shape.
- **Fetching icons or pages from Theia**: favicons cross only as bounded `data:image/` (64 KiB cap); downloads/save honor the token-cookie walls.
- **Asserting on the absence of a log line**: every gate asserts a derived set as equality with a planted-fault `--self-test` (CLAUDE.md rule).
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| In-page search engine | A Theia-side text scan of page content | `FinderParent` on the overlay + listener pushes | Content lives in the content process across subframes; the toolkit actor already fans out, counts, wraps and sounds |
| Zoom stepping | A Theia-side percentage ladder | The live `zoomValues` pref parsed chrome-side, snapped index±1 | Stock and shell stay on the same ladder; MIN/MAX clamping is already defined there |
| Print preview UI | A Theia-hosted preview | The OS system dialog via printdialog-service + `BrowsingContext.print` | Preview needs a tab-dialog box the shell lacks; the system branch needs three calls |
| Download tracking | Polling `Downloads.getList` from Theia | One chrome-side `addView` + `downloadsChanged` pushes | Views replay + batch; polling misses in-flight state and structured-clone drops Download objects |
| Save-page serialization | A Theia-side HTML scrape | `frameLoader.startPersistence` + `nsIWebBrowserPersist.saveDocument` | The browser's own "Web Page, complete" writer (documents + images + styles + scripts) already exists |
| Favicon fetching | `fetch(iconURL)` from Theia | `LinkHandlerParent` → tab host → Places → `data:image/` push | Fetching leaks the token jar and bypasses the allowlist; the pipeline already gates scheme + size |
| Clipboard reads | Reading on focus or hover | Explicit-gesture reads only (`readClipboardText` precedent, Pitfall 13) | Unfocused reads go stale on Wayland and violate the privacy row |

**Key insight:** every page tool in this phase is a thin Theia surface over a toolkit actor or element method that already runs for overlays — the work is kinds, pushes and gates, not engines.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Stand-in members change every feature-detecting module (Pitfall 2 carryover)
**What goes wrong:** adding a `gBrowser`-receiver member breaks an upstream module that feature-detects it.
**Why it happens:** dozens of modules branch on member presence; each addition is a contract change.
**How to avoid:** D-28 — no new stand-in member this phase except plan 32-09's amended set, each recorded with its receiver grep before it lands; any future need greps the receiver branch and records it before the plan lands it; `verify-shell-gbrowser-standin.mjs` re-derives.
**Warning signs:** a plan touches `powerbrowser.js` stand-in shape without a grep table.

### Pitfall 2: Silent failure without `browser.xhtml` globals (Pitfall 3 carryover)
**What goes wrong:** a call that needed a chrome global fails silently in the shell.
**Why it happens:** `browser.xhtml` scripts assume `gBrowser`, `gTabDialogBox`, `PrintPreview`.
**How to avoid:** browser-element-only rule; every live scenario asserts a positive push received (find matches, zoom level, print dialog result, download row), never the absence of a log line.
**Warning signs:** a plan reproduces a `_openTabModalPrint` or `getTabDialogBox` call chain.

### Pitfall 3: Reserved-key clash with Theia (Pitfall 4 carryover)
**What goes wrong:** Ctrl+F/P/S/M/U, F3, F12 fire Theia's binding instead of the page tool.
**Why it happens:** Theia runs as a browser app (`isElectron()` false); `ctrlcmd+f` (find), `ctrlcmd+p` (quick open) and kin are already bound.
**How to avoid:** page-focus scope only — `PAGE_KEYS` + relay + `powerbrowser.webTabActive`/pill-focus when-clauses; F6 reply-listener is the precedent; the plan confirms no Theia binding intercepts while the page or find bar has focus.
**Warning signs:** a keybinding without a `when` clause, or a `PAGE_SHORTCUTS` row without its `PAGE_KEYS` mirror.

### Pitfall 4: Privileged kinds callable from any Theia-origin code (Pitfall 7 carryover)
**What goes wrong:** a state-changing kind becomes a bare command/palette entry any extension can invoke.
**Why it happens:** commands are global; widget handlers carry tab context.
**How to avoid:** privileged follow-ups run only from widget event handlers against `widgetOf(tabId)`; the bridge gate pins the call-site shape; validate args chrome-side (query caps, boolean defaults, finite zoom clamp, frozen edit-cmd literals).
**Warning signs:** a command id that sends a `webTab*` kind directly.

### Pitfall 5: Zoom/count/chip staleness across navigations
**What goes wrong:** the chip shows the last site's level; the count shows the last query's total; the audio mark sticks after close.
**Why it happens:** location, zoom and match pushes race; `didDestroy`/navigation clears one signal but not the other.
**How to avoid:** push zoom in the same push as URL; combine the audio event with the `audioMuted` flag (Started is suppressed while muted); clear playing state on `didDestroy`/navigation; re-run `requestMatchesCount` on toggle change.
**Warning signs:** separate pushes for URL and zoom; audio state read from the event alone.

### Pitfall 6: Token-cookie exposure through downloads/save (Pitfall 6 carryover)
**What goes wrong:** a download or save revalidation carries `POWERBROWSER_TOKEN` to a non-sidecar loopback port, or a clear-data kind deletes it and Theia 403s.
**Why it happens:** the cookie is host-only on 127.0.0.1 without port scoping; `FROM_CACHE` revalidation sends the jar.
**How to avoid:** clear-data kinds exempt the token cookie by name with a planted-clear check; overlay loads to other loopback ports never carry it; never record grants for the Theia ephemeral-port origin.
**Warning signs:** a new clear-data or fetch path without the exemption row.

### Pitfall 7: Places fan-out on clear-history (Pitfall 11 carryover)
**What goes wrong:** clearing history leaves closed rows, thumbnails, `saved-pages/`, or the history file behind.
**Why it happens:** the Sanitizer does not know the tab-store closed rows, `saved_pages` table, or shell-state files.
**How to avoid:** `clearHistory` fans out Places → closed rows/thumbnails → `saved-pages` → history file → shell-state URLs, with a planted-URL check; writes only via `PlacesUtils.*`, never raw SQL.
**Warning signs:** a plan touches history deletion without the fan-out list.

### Pitfall 8: Modal-highlighter and subframe search gaps
**What goes wrong:** matches in subframes or the modal highlight path are missed.
**Why it happens:** `needSubFrameSearch` (`FinderParent:156-183`) and the `findbar.modalHighlight` pref (:5) change the fan-out; overlays are remote so `gatherBrowsingContexts` (:138-150) matters.
**How to avoid:** keep `linksOnly:false`, default prefs, and assert counts on a multi-frame fixture page in the live scenario.
**Warning signs:** `linksOnly:true` or a pref flip without a fixture.

### Pitfall 9: Download objects across IPC
**What goes wrong:** pushing a Download object yields `{}` or a clone error.
**Why it happens:** Download objects do not structured-clone.
**How to avoid:** serialize inside the view callbacks to plain rows (id/url/filename/bytes/state/flags); same rule as `PowerBrowserAPI.sys.mjs:3751-3752`.
**Warning signs:** a push carrying a live object reference.

### Pitfall 10: Clipboard staleness and over-read (Pitfall 13 carryover)
**What goes wrong:** Paste reads stale text, or a read happens without a gesture.
**Why it happens:** KDE/Wayland reads go stale while unfocused; reads without gestures violate the privacy row.
**How to avoid:** read only on explicit Paste & Go / accept; return the parsed http(s) URL where possible; `readClipboardText` (8192 cap, never logged) is the precedent; `webTabEdit` paste cites the same rule.
**Warning signs:** a clipboard read on focus, hover, or suggestion render.
</common_pitfalls>

<code_examples>
## Code Examples

### Find: first search + listener → push

```js
// Source: upstream/toolkit/modules/FinderParent.sys.mjs:408-415, :50-52, :192, :542-550
const f = webTabs.get(tabId).browser.finder;
f.addResultListener(chromeFindListener); // once per overlay; remove on close
f.fastFind(query, false, false);
// listener: callListeners("onFindResult", [response]) → findStatus push
// listener: callListeners("onMatchesCountResult", [{ searchString, current, total }]) → findMatches push
f.requestMatchesCount(query, { linksOnly: false });
```

### Zoom: step chrome-side, write the element

```js
// Source: upstream/toolkit/content/viewZoomOverlay.js:58-72 (reference only) + browser-custom-element.mjs:725-744
const values = Services.prefs.getCharPref("toolkit.zoomManager.zoomValues").split(",").map(Number);
const cur = entry.browser.fullZoom;
const next = zoomIn ? values[values.indexOf(snap(values, cur)) + 1] : values[values.indexOf(snap(values, cur)) - 1];
entry.browser.fullZoom = Math.min(MAX, Math.max(MIN, next)); // Ctrl+0 sets 1
```

### Mute: element methods + element events

```js
// Source: upstream/toolkit/content/widgets/browser-custom-element.mjs:1030-1042, :987-1000
entry.browser.mute(); entry.browser.unmute();
const muted = entry.browser.audioMuted;
browser.addEventListener("DOMAudioPlaybackStarted", onPlay);  // suppressed while muted
browser.addEventListener("DOMAudioPlaybackStopped", onStop);
```

### Print: system-dialog branch

```js
// Source: upstream/toolkit/components/printing/content/printUtils.js:265-333 (system path only)
let settings = getPrintSettings("", false, false);
if (await handleSystemPrintDialog(browsingContext.topChromeWindow, hasSelection, settings)) {
  browsingContext.print(settings);
}
```

### Downloads: one view, serialized pushes

```js
// Source: upstream/toolkit/components/downloads/Downloads.sys.mjs:153 + DownloadList.sys.mjs:247-269
const list = await Downloads.getList(Downloads.ALL);
await list.addView({ onDownloadAdded(d) { push(serialize(d)); }, onDownloadChanged(d) { push(serialize(d)); } });
```

### Save: landed byte path (unchanged)

```js
// Source: powerbrowser/shell/PowerBrowserAPI.sys.mjs:3992-4026
const doc = await persistDocument(browser); // frameLoader.startPersistence
await writePersistedDocument(doc, pageFile, pageFilesDir); // nsIWebBrowserPersist.saveDocument
```

### Edit: Theia-initiated command only

```js
// Source: upstream/docshell/base/nsIDocShell.idl:550-554
if (browser.docShell.isCommandEnabled(cmd)) { browser.docShell.doCommand(cmd); }
```

### Reader: same-tab entry

```js
// Source: upstream/toolkit/components/reader/ReaderMode.sys.mjs:55-67
win.document.location = "about:reader?url=" + encodeURIComponent(win.document.location.href);
```
</code_examples>

<sota_updates>
## State of the Art (2024-2025)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Services.search` | `SearchService` module singleton (`moz-src:///toolkit/components/search/SearchService.sys.mjs`) | before 153 (absent from `services.json`, STACK.md) | Import via a `defineESModuleGetters` line |
| `typedAddressTargetOf` regex | URIFixup in chrome | Phase 29 | `localhost:4000` and IPs work |
| `DownloadsCommon` panel reuse | Shell-owned panel on a `Downloads` view push | this phase | Stock panel needs a `navigator:browser` window the shell may lack |
| `browser-fullZoom.js` per-site steps | Chrome-side snap over the `zoomValues` pref, session-only | this phase (D-06/D-07) | No `gBrowser` script loads; memory deferred to Future Requirements |

**New tools/patterns to consider:**
- `SearchSuggestionController` remote fetch (`LOAD_ANONYMOUS`, `maxLocalResults: 0`) — Phase 29 precedent for anonymous engine contact.
- `nsIWebBrowserPersist.saveDocument` complete-page writer — the save path this phase extends.

**Deprecated/outdated:**
- The `urls.search` manifest key (schema exists, unused, feeds only endpoint hosts) — superseded by `[[search_engines]]`; leave alone (removing it is a downstream-breaking schema change).
</sota_updates>

<open_questions>
## Open Questions (RESOLVED at research time; autonomous, recommended)

1. **Which downloads surface does the shell build?** Decided: a shell-owned button + panel on a chrome-side `Downloads.getList(ALL)` view push (Pattern 7). Reason: `DownloadsCommon` needs a stock window; the no-silent-save invariant needs a push, not a poll.
2. **Which print branch?** Decided: system-dialog only (Pattern 6). Reason: the tab-modal branch needs a tab-dialog box the shell lacks; STACK.md:152 already rules it out.
3. **Which edit commands get kinds?** Decided: probe 9 decides per command; key-driven editing needs none (Pattern 9). Reason: `internal="true"` keys are editor-routed with page focus; only Theia-initiated UI may need `webTabEdit`.
4. **Where does the find bar live?** Decided: a Theia-rendered bar that shrinks the page rect (D-01). Reason: the roadmap grants the occlusion exception; covering the page breaks the layer policy.
5. **Session or per-site zoom?** Decided: session-only (D-06). Reason: per-site memory is a Future Requirement; the chip reflects the tab's live level.
6. **Custom inspector for F12?** Decided: no — stock DevTools window (D-23). Reason: rule 5; a custom inspector is authored browser chrome.
</open_questions>

<assumptions>
## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `FinderParent` listener callbacks (`onFindResult`, `onHighlightFinished`, `onMatchesCountResult`) fire for overlay-initiated searches the same way they do for stock findbar searches | Pattern 4 | Find counts/status never arrive; the live find scenario (positive push assertion) catches it |
| A2 | `overlay.fullZoom` reads/writes the live level for remote overlays without a tabbrowser (`browsingContext.fullZoom`) | Pattern 5 | Zoom chip never updates; live zoom scenario catches it |
| A3 | `DOMAudioPlaybackStarted/Stopped` dispatch on the overlay element in the shell (toolkit `AudioPlayback` actor runs for overlays per `ActorManagerParent.sys.mjs:143`) | Pattern 5 | Audio mark never appears; live audio scenario catches it |
| A4 | The system-dialog print path (`getPrintSettings` → `showPrintDialog` → `browsingContext.print`) completes without a tab-dialog box in a `powerbrowser:main` window | Pattern 6 | Print probe records the verdict; on failure the executor reports a blocker (D-08a — no stock-window fallback is built in Phase 32) |
| A5 | `Downloads.getList(Downloads.ALL)` initializes and `addView` replays in a shell-only session (no `navigator:browser` window) | Pattern 7 | Downloads probe fails; panel design re-derives from the probe verdict |
| A6 | `Readerable.shouldCheckUri` + `isProbablyReaderable(document)` are callable chrome-side against an overlay document | Pattern 10 | Reader toggle enablement stays conservative (disabled until proven); probe decides |
| A7 | the `oop-browser-crashed` listener per overlay fires on the element with no gBrowser; the contracted Theia crash UI covers the overlay; `about:crashcontent` crashes a content process in the shell | Pattern 10 | Crash scenario shows no page; executor reports a blocker (no chrome-rendered fallback is built here) |
| A8 | `docShell.doCommand` on the overlay docshell performs the edit command for the focused page editor | Pattern 9 | `webTabEdit` falls back to `commandDispatcher.getControllerForCommand().doCommand()`; probe 9 decides |
| A9 | Theia keybindings for Ctrl+F/P/S/M/U, F3, F12 can be scoped so they do not intercept while the page or find bar has focus | Pitfall 3 | KEY-04 stop point: get Chris's acceptance for a page-scoped reserved row (Phase 27 precedent: F6) |
| A10 | Phases 30, 31, 31.1 land as ROADMAP promises (pill in `address-bar/` + modes; widened push with `securityState`; tab host + `getTabForBrowser` reversal + tab-host members) | Assumes below | Plans re-derive if a promise changes shape; no plan rebuilds those phases |
</assumptions>

<environments>
## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Built binary `objdir/dist/bin/powerbrowser` | Live checks | ✓ (another agent holds the binary; plans define but do not run live rows now) | built 2026-10-18 (chrome JS symlinked, current with tree) | — |
| Theia app build `theia/applications/browser/lib` | Live checks | ✓ | bundle 2026-10-20 11:57; must be rebuilt after frontend edits (`nix develop .#theia`) | — |
| Node | All gates | ✓ | v24.19.0 | — |
| `theia/node_modules/.bin/tsc` | Typechecks (`-p theia/extensions/tab-uris`, `-p theia/extensions/chrome-bar` ~2 s; rebuild tab-uris `lib` with `tsc -b` before chrome-bar sees new exports) | ✓ | — | — |
| `upstream/` checkout | gBrowser derivation, shortcut derivation, print/downloads/edit/reader/crash reads | ✓ | `FIREFOX_153_5_0esr` | — |
| ydotool daemon | Headed OS-level key/mouse injection (manual live run) | ✓ | socket `/run/ydotoold/socket`, user in `ydotool` group | chrome-scope TIP (Pitfall P11) |
| kdotool / KWin script + spectacle | Raise and screenshot for tooltip geometry | ✓ | kdotool v0.2.3 | BiDi rect reads |
| `scripts/verify-platform.sh --quick` baseline | Commit gate | ✓ | PASS, 137+ rows, ~84-90 s (this session) | — |

**Missing dependencies with no fallback:** none. No Gecko rebuild is needed (no patch, no new chrome file).

**Missing dependencies with fallback:** none.
</environments>

<assumes_from_earlier>
## Assumes from Earlier Phases (Phase 32 builds on these; plans do NOT rebuild them)

- **Phase 30:** the pill lives in `address-bar/` with the `AddressBar` injectable and the modes contribution point; `updateSchemaProperty` runtime enum; gates recursive. Plans compose the zoom chip and reader toggle into the pill and consume the modes; they do not move the pill. Missing = blocker the executor reports, never rebuilt here.
- **Phase 31:** the widened push already carries `securityState`; the site panel and hamburger `MenuPath` exist; `openStockPage {page}` enum exists for stock-window routing (F12 devtools path). Plans consume these; they do not rebuild them. Missing = blocker the executor reports, never rebuilt here. There is NO print fallback through the stock window in Phase 32 (D-08a).
- **Phase 31.1:** the extension tab host exists (one tab element per overlay, patch 050, `getTabForBrowser` reversal, last-web-tab-stays-active ruling). Corrected 2026-10-23: 31.1 delivers `setIcon`/`getIcon` and the favicon path; its host nodes carry only the data fields `muted`, `muteReason` and `soundPlaying`, with no sync, no `toggleMuteAudio` and no zoom member. Plan 32-09 adds those; favicon, mute and zoom state reach Theia through the wider push. Plans consume those pushes (D-27/D-10a); they do not rebuild the host. Missing = blocker the executor reports, never rebuilt here.
- **Phase 33:** owns SMODE-07/Actions-mode rows and the full menu entries for print / downloads / save / find / zoom (this phase builds the kinds; Phase 33 consumes them).
- **Phase 34:** owns tab-menu Mute / Bookmark items (strip/tab own the mute affordance per the UI-SPEC boundary).
- **Phase 35:** owns PAGE-07 fullscreen furniture (D-25-adjacent crash work never touches fullscreen).
- **Security carryovers:** T-27-11 (stand-in call-site derivation) stays open → Phase 35; T-29-01..14 closed; the privileged/network store-kind rule, sender/subject checks, http(s) wall, copy-gate no-internals rule and brand-from-config rule hold for every new `webTabFind/Zoom/Print/Mute/Downloads/Edit/Source/Reader/Crash` kind.
</assumes_from_earlier>

<validation_arch>
## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Plain-node derive-and-compare scripts plus BiDi live scripts, run by one driver: `scripts/verify-platform.sh` |
| Config file | The registry inside `scripts/verify-platform.sh` (`run_own_checks` `CHECKS=(` for `--quick`; `if [ "$QUICK" -eq 0 ]; then CHECKS+=(` for live rows) |
| Quick run command | `scripts/verify-platform.sh --quick` (~84-90 s) or `scripts/verify-platform.sh --only <label>` |
| Full suite command | `scripts/verify-platform.sh` (needs the built binary and the last Theia build) |

### Three proof tiers used below
- **S — static gate** (`--quick`): text derivation over the tree and `upstream/`, with a `--self-test`.
- **D — sidecar DOM measure:** the standalone sidecar on :4000 (`POWERBROWSER_TOKEN_DISABLE=1`), DOM-only (find-bar geometry, panel cap, chip slot).
- **L — live binary:** `withProbeShell` (`-purgecaches`), push recorder, chrome-scope evaluate, TIP keys, served fixture pages; plans define L rows but do not run them now (another agent holds the binary).
- **P — packaged:** ng-072 pattern (`extractPackage`) for the save/export path only.

### Sampling
- After every task commit: `--quick` (stage new files first for the brand scan; after any `PowerBrowserAPI.sys.mjs` edit run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` then `bash scripts/check-internals-boundary.sh --catalogue`).
- After every plan wave: `--quick` plus the live script after a Theia build.
- Max feedback latency: ~90 s (quick).

### New gates (one registry row each; every gate derives and compares as set equality + `--self-test` plants)

| Gate script | Family | Derives | Compares with | Plants |
|-------------|--------|---------|---------------|--------|
| `scripts/verify-page-tools-find.mjs` | PAGE-01 | `webTabFind/FindNext/FindClose` arms in `handleWebTabAction` + `WEB_TAB_ACTION_KINDS` | `WebTabMessage` union literals + `WebTabState` count fields + `CHROME_BAR_COPY` find rows | dropped kind, stale union member, copy pin missing |
| `scripts/verify-page-tools-zoom-mute.mjs` | PAGE-02/05 | zoom/mute arms + kinds | union + `WebTabState` zoom/audio fields + chip/mark copy | dropped arm, stale field, chip reading prefs |
| `scripts/verify-page-tools-print-save.mjs` | PAGE-03/08 | print/save arms + kinds; `getTabDialogBox`/`_openTabModalPrint` absence; `window.print()` shim absence | union; `savePageCopy` guards intact | tab-modal call smuggled in, minted-dir check removed, browserDOMWindow shim added |
| `scripts/verify-page-tools-downloads.mjs` | PAGE-06 | downloads arms + view lifecycle (`addView`/`removeView`) + row-action set | union + serialized row fields | `DownloadsPanel` reference, unserialized push, silent-save path |
| `scripts/verify-page-tools-edit.mjs` | PAGE-09 | `webTabEdit` cmd literal set (frozen) | union + menu/key rows | extra cmd literal, bare-command call site |
| `scripts/verify-page-tools-reader-crash.mjs` | PAGE-10/11 | reader/source/devtools/crash arms | union + toggle/crash copy + `view-source:` wall (Theia never holds the URL) | `view-source:` literal in Theia, custom inspector import |
| `scripts/verify-page-tools-copy.mjs` (or extend `verify-shell-error-copy.mjs`) | all | `CHROME_BAR_COPY` keys for every new string | widget/panel copy usage | brand literal, internal identifier in copy |
| `scripts/verify-page-tools-live.mjs` | all L | — (BiDi scenarios on `pb-live-probe.mjs`) | push recorder + served fixtures + request logs | removed relay row, key enabled while Theia focused, silent download, print tab-modal |

### Per-requirement proof map (summary; full map in 32-VALIDATION.md)

| Requirement | Tier | Proves |
|-------------|------|--------|
| PAGE-01 | S + D + L | kinds ↔ union ↔ relay rows; bar shrinks page rect; typing + toggles + F3/Esc produce `findMatches`/`findStatus` pushes with `{current} of {total}` |
| PAGE-02 | S + L | arms ↔ union ↔ state fields; Ctrl+plus/minus/0 step the overlay; chip appears ≠100% and resets on click/Ctrl+0 |
| PAGE-03 | S + L | system-branch calls only; Ctrl+P prints the overlay; `window.print()` asserted absent-with-reason unless proven (D-09a); cancel is a clean no-op |
| PAGE-04 | S + L | `LinkHandlerParent` path intact; icon in push is bounded `data:image/`; rows render it, else codicon |
| PAGE-05 | S + L | arms ↔ union ↔ state fields; playing tab marked; Ctrl+M toggles; Theia keeps its meaning in editors |
| PAGE-06 | S + L | view lifecycle + row actions; every page-started download appears; cancel/retry/open/reveal work |
| PAGE-08 | S + L (+ P for export) | picker + chrome write; guards intact (private/non-http(s)/oversized); failure row with retry |
| PAGE-09 | S + L | frozen cmd set; content-native keys need no round-trip; Theia-initiated commands work; enablement greys items |
| PAGE-10 | S + L | reader same-tab entry/exit; `view-source:` never in Theia; F12 opens the stock window via Phase 31 `openStockPage` (assumption — missing = blocker) |
| PAGE-11 | S + L | crash page in place + crashed push; Reload runs `webTabReload`; history survives; shared-process blank-reload regression row (five same-site tabs) |
| all | S | bridge KIND_CLASSES, copy, typechecks, internals catalogue + lines, brand residue |

### Self-test contract (every new script)

1. Clean tree is green (fail otherwise — the instrument is broken, not the tree).
2. Each plant applies (fail when the anchor it edits has drifted).
3. Each plant goes red naming the drift (fail when the message does not name it).
</validation_arch>

<sources>
## Sources

### Primary (HIGH confidence)
- `upstream/toolkit/content/widgets/browser-custom-element.mjs:357,581-596,725-755,785-787,889-900,925-927,987-1052` — finder getter, fullZoom, textZoom (unused), audioMuted, reload/stop/gotoIndex, audio events, mute/unmute
- `upstream/toolkit/modules/FinderParent.sys.mjs:5,43-56,114-222,256-406,408-466,468-589` — prefs, listeners, doFind, fastFind/findAgain/highlight/requestMatchesCount, removeSelection, open/close
- `upstream/toolkit/modules/Finder.sys.mjs:94-352,608-660` — content finder used via the child actor
- `upstream/toolkit/actors/FinderChild.sys.mjs:47-114` — Find/Highlight/UpdateHighlightAndMatchCount/MatchesCount
- `upstream/toolkit/modules/ActorManagerParent.sys.mjs:143-154,375-381` — AudioPlayback + Finder actor registrations
- `upstream/toolkit/actors/AudioPlaybackParent.sys.mjs:11-40`, `AudioPlaybackChild.sys.mjs:6-17` — audio event driver
- `upstream/toolkit/content/viewZoomOverlay.js:12-144` — ZoomManager step engine (reference only)
- `upstream/modules/libpref/init/all.js:3035` — `zoomValues` default
- `upstream/toolkit/components/printing/content/printUtils.js:33-52,99-124,132-208,230-364,485-567` — prefs, page-setup, tab-modal path (never built), system path, settings/dialog
- `upstream/toolkit/components/downloads/Downloads.sys.mjs:44-51,93-95,125-190` + `DownloadList.sys.mjs:161-290,513-557` + `DownloadCore.sys.mjs:378,905-934,971-1003` + `DownloadIntegration.sys.mjs:789-828,991-1021,1075-1097,1214-1267` — getList, views, row actions, observers
- `upstream/browser/components/downloads/DownloadsCommon.sys.mjs:1027` — stock-only panel (why the shell builds its own)
- `upstream/toolkit/components/reader/ReaderMode.sys.mjs:40-180` + `Readerable.sys.mjs` + `AboutReaderChild.sys.mjs:231-237` (toggle signal pair) + `AboutReaderParent.sys.mjs:120-129` (why the shell never copies `browser.isArticle`) — reader entry/exit, original URL, article signal
- `upstream/browser/actors/LinkHandlerParent.sys.mjs:163-264` — icon capture → Places → setIcon (reference; Phase 31.1 owns the host)
- `upstream/browser/actors/AboutTabCrashedParent.sys.mjs:13-83` is NOT consumed (why: its `onAboutTabCrashedLoad` needs `BrowserGlue`/stock tabbrowser the shell never loads); crash signal is ONE `oop-browser-crashed` addEventListener per overlay (fires on the element itself at `nsFrameLoader.cpp:3717/3728/3736`, dispatched `:3765`) + the CONTRACTED Theia crash UI (N3/D-25e — `displayLoadError` is docShell-null on a crashed remote overlay; stock switches to `NOT_REMOTE` first at `ContentCrashHandlers.sys.mjs:545-552`), live crash via `about:crashcontent` in a NAMED scratch tab (`nsAboutRedirector.cpp:49-50`)
- `upstream/toolkit/actors/ViewSourceChild.sys.mjs` + `ViewSourceParent` absence (`ActorManagerParent.sys.mjs:576-583`, child-only) — why view-source reuses overlay navigation instead of an actor message
- `upstream/toolkit/content/globalOverlay.js:100-131`, `editMenuOverlay.js:37-152`, `upstream/browser/base/content/browser-sets.inc.xhtml:189-215` — edit command routing
- `upstream/docshell/base/nsIDocShell.idl:550-554` — doCommand; `nsIBrowserDOMWindow.idl:74` noted as NOT consumed (why: no `nsIBrowserDOMWindow` in the shell, D-09a)
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs:246,310-341,372-387,3346-3404,3692-3797,3984-4107,4112-4303,4440-4477` — actor name, walls, webTabs map, push, store kinds, savePageCopy, placesFavicons, web-tab section
- `theia/extensions/tab-uris/src/browser/web-tab.ts:51,74-184,208-338,430-681` — outcomes, state, union, channel, widget lifecycle
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`, `chrome-bar-commands.ts`, `chrome-bar-keybindings.ts`, `chrome-bar-shortcuts.ts`, `chrome-bar-copy.ts`, `chrome-bar.css`, `address-bar/address-bar-rows.ts` — composition surface
- `powerbrowser/shell/powerbrowser.js:73-99,305-434` — stand-in, PAGE_KEYS, focus gate, F6 precedent

### Secondary (MEDIUM confidence)
- `.planning/research/{SUMMARY,ARCHITECTURE,FEATURES,PITFALLS,STACK}.md` — milestone research (page-tools rows, Pitfalls 2/3/4/6/7/11/13, clash table, allowlist)
- `.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-{CONTEXT,RESEARCH,VALIDATION,PATTERNS,UI-SPEC}.md` — push router, action kinds, relay, harness, privileged-kind rule
- `.planning/phases/{29,30}-*/29,30-{CONTEXT,RESEARCH,VALIDATION,PATTERNS}.md` — search/fixup/Places pipeline, pill + modes, D-50 static binding
- `.planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md` — signed-off tab-host route, patch 050, reversals, tab-host members
- `.planning/phases/31-site-identity-and-app-menu/` + `31.1-extension-tab-host/` (assumed — depends) — ROADMAP promises consumed, not rebuilt

### Tertiary (LOW confidence - needs validation)
- None. Every runtime claim above is an assumption (A1-A10) with a named live scenario that proves it.
</sources>

<metadata>
## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every API read at the pinned tag.
- Architecture: HIGH for the kinds, walls, push widening and gate shapes; MEDIUM for listener/view/crash/reader runtime attribution (A1-A8).
- Pitfalls: HIGH — each traced to a line in `upstream/` or the tree.

**Research date:** 2026-10-22
**Valid until:** the next ESR re-pin or Theia re-pin

## RESEARCH COMPLETE
</metadata>
