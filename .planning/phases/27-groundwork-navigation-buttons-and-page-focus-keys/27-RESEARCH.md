# Phase 27: Groundwork, Navigation Buttons and Page-Focus Keys - Research

**Researched:** 2026-10-20
**Domain:** Gecko chrome key handling for remote `<xul:browser>` overlays, the PowerBrowserGroup actor channel, and Theia 1.76 chrome-bar UI (menus, hovers, preferences, context keys)
**Confidence:** HIGH for every in-tree and upstream code path cited below (read this session at `8e523e7`, `upstream/` at `FIREFOX_153_5_0esr_BUILD1`, `theia/node_modules/@theia/*` 1.76.0). MEDIUM for runtime behaviour that only a live run can confirm (listed in the Assumptions Log and the Validation Architecture).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Recorded rulings that apply (REQUIREMENTS.md header, 2026-10-20)
- Firefox keys that clash with Theia keys take the browser meaning only while a
  web page has focus; only Firefox's unblockable keys are reserved, the rest use
  the reply path (research SUMMARY.md D6, Pitfall 3).
- Chrome-bar copy reads the configured application name, never a hard-coded brand.
- Stock Firefox toolkit popups in powerbrowser.xhtml are shell furniture (rule 5
  clarified); not needed in this phase.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was
skipped per user setting. Use the ROADMAP phase goal, success criteria,
.planning/research/SUMMARY.md (Phase 1 section, D6, D7, Pitfalls 2/3/7/8) and
codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.

**Also binding:** the approved `27-UI-SPEC.md` (interaction contract, copy, tooltips, history menu, Home, keys table). Its "Deferred (named, not specified)" provenance row lists what stays out of this phase: favicons in the history menu (Phase 32), "Show Full History" (Phase 33), middle-click on a history-menu entry, middle-click paste-and-go on New Tab, multi-page home page, Shift+click opening a new window, dropped-text search (Phase 29), routing Ctrl+P/F1 into the pill.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-01 | Reload turns into Stop while a page loads; stop with the button or Esc | `browser.stop()` exists (browser-custom-element.mjs:896); new `webTabStop` kind; Esc is a reply-path `<key>` (Firefox `key_stop` is non-reserved); one React element keeps focus (Pitfall P7) |
| NAV-02 | Shift+click Reload, Ctrl+Shift+R, Ctrl+F5 bypass the cache | `reloadWithFlags` (browser-custom-element.mjs:892) with Firefox's `kSkipCacheFlags` = `LOAD_FLAGS_BYPASS_PROXY \| LOAD_FLAGS_BYPASS_CACHE` (browser-commands.js:7-9); widen `webTabReload` with `bypassCache`; one new INTERNAL-APIS row for the `Ci.` touch |
| NAV-03 | Right-click / long-press Back/Forward for a session-history menu; jump to any entry | Read `browser.browsingContext.sessionHistory` (NOT `browser.sessionHistory`, which throws for remote browsers, Pitfall P1); `gotoIndex` (:925); Firefox's 15-entry window algorithm (browser.js:1545-1585); dynamic `CompoundMenuNode` through `ContextMenuRenderer` (verified to render Action nodes) |
| NAV-04 | Home button and Alt+Home; home page is a setting | `PreferenceContribution` + `PreferenceService`; Home routes through the pill's `typedAddressTargetOf`; Settings opened with `CommonCommands.OPEN_PREFERENCES` and a query string (preferences-contribution.js:44-51) |
| NAV-05 | Each button's tooltip shows its shortcut | `HoverService.requestHover({position:'top', cssClasses})`; Gecko dispatches mouseenter on disabled buttons (nsGenericHTMLElement.cpp:2258-2281); tooltip text built from the shortcut table, never `KeybindingRegistry` |
| NAV-06 | Middle-click Back/Forward/Reload opens a new tab; a link dropped on New Tab opens | `onAuxClick` button 1 / Ctrl+click; `addWidget({area:'main', ref, mode:'tab-after'})` without `activateWidget`; drop data is unreadable during dragover (HTML spec protected mode, Pitfall P10) |
| KEY-01 | Ctrl+T, Ctrl+W, Ctrl+R/F5, Alt+Left/Right from inside a page | Chrome `<key>` table in `powerbrowser.js`: Ctrl+T/Ctrl+W reserved (Firefox reserves them, browser-sets.inc.xhtml:138-139,186), the rest reply-path; every row enabled only while an overlay has focus (live `disabled` read, KeyEventHandler.cpp:187-190) |
| KEY-02 | Alt+D, Ctrl+L, F6/Shift+F6 move focus between pill and page | Alt+D/Ctrl+L: `<key>` rows to the existing `webTabFocusAddress`; F6 cannot use a `<key>` reply (content's own document navigation consumes it, Pitfall P3) — use a chrome reply listener; pill→page F6 in the pill's own keydown handler |
| KEY-03 | Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp/PageDown, Alt+1..9 from inside a page | Ctrl+Tab family is unblockable in Firefox (tabbox.js:120-168 "tab navigation should always work") → reserved rows; Alt+1..9 non-reserved (browser-sets.inc.xhtml:381-389, `alt` on GNOME); strip order needs one public ordering method on `TabStripWidget` |
| KEY-04 | Clashing keys keep Theia's meaning in editors, terminals, non-web tabs | Keys disabled while the Theia frame has focus, so Theia sees every key first (reserved Ctrl+W/T would otherwise eat terminal readline keys, Pitfall P2); `F11`, `Ctrl+P`, `Ctrl+K` get no row in this phase |
| KEY-05 | Mouse buttons 4/5 for Back/Forward over a web page | GTK maps buttons 8/9 to an `AppCommand` widget event (`Back`/`Forward`), never a mouse event (nsWindow.cpp:3050-3063); chrome `AppCommand` listener, as browser-init.js:331 does |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Planner must verify compliance with each:

1. **Never fork or patch Theia core.** All UI is `@powerbrowser/*` composition; `scripts/diff-theia-core.sh` is the check. `TheiaDockPanel.markAsCurrent`, `ContextMenuRenderer`, `HoverService`, `PreferenceContribution`, `ContextKeyService` are public API (no edit).
2. **Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`**, each touchpoint a row in `powerbrowser/INTERNAL-APIS.md`; `scripts/check-internals-boundary.sh` (+ `--catalogue`, `--self-test`) enforces it. `powerbrowser.js` may use DOM only (`createXULElement`, `addEventListener`, `document.activeElement`).
3. **Design for the bridge (GUI-04):** `TabUriRegistry`'s exported shape must not change (`scripts/verify-registry-shape.mjs`). Nothing in this phase needs a registry change.
4. **Repo path has no space** (compliant).
5. **Theia is the default GUI; stock chrome reachable; no custom browser chrome beyond the chrome bar.** GUI-01's `window.open` path is untouched by this phase.
6. **Patches are regenerated, never hand-edited.** This phase needs no patch.
7. **Residual-brand scan is permanent:** `node scripts/scan-brand-residue.mjs` exits 0; stage new files before trusting it.
8. **One verify driver:** a new check is one row (plus its `-self-test` row) in `scripts/verify-platform.sh`, never a sibling driver.
9. **Verification rules:** never assert on the absence of a log line unless the emitter is the code under test (give every absence a positive control); derive and compare, never hand-keep; every new check gets a `--self-test` that plants faults and requires red naming the drift.
10. **User-facing copy:** no internal identifier (pref key, kind name, port, timeout, raw exception); product named by the configured application name (UI-SPEC: no literal fallback, "The browser" when empty); every error ends with an on-screen next step. `shell-error-copy-no-internals` must cover the new copy.
11. **Builds in Nix dev shells:** `nix develop .#theia` for yarn/Theia builds. `node`, `theia/node_modules/.bin/tsc` and `objdir/dist/bin/powerbrowser` run outside a dev shell.
12. **Concurrent sessions on `main`** (project memory): commit with explicit paths; never `--amend`/`-a`/`stash`; re-read STATE.md before writing it.

## Summary

Phase 27 is mostly wiring of mechanisms that already exist in the tree or in Gecko. The overlay `<browser>` element already has `stop()`, `reloadWithFlags()` and `gotoIndex()`, and the parent-side session history is already read by the NG-034 restore path. The actor channel already carries one push name with three kinds (`state`, `focusAddress`, `flushShellState`). The bridge gate already derives every `case "webTab…"` arm, so new kinds named `webTab*` are covered with no gate rewrite. The chrome bar already routes clicks through commands and owns the pill, the 13-UI-SPEC tokens and the `.lm-Menu` occlusion rule. Nothing needs a new npm package, a Gecko patch, a Theia core edit or a new chrome file.

The hard part is keys. A key pressed while an overlay has focus reaches chrome in one of three ways, and this research traced each one in `upstream/`. (1) A `reserved="true"` `<key>` fires in chrome and the content process never sees it — no page and no Theia frame. (2) A non-reserved `<key>` waits for the content process's reply and fires only if the reply is not default-prevented. (3) Some keys never come back usable on the reply path, because content's own default action consumes them: F6 and Ctrl+Tab trigger document navigation inside the content process (EventStateManager.cpp:4005-4040), and the reply arrives prevented. The locked ruling (reserve only Firefox's unblockable keys, reply-path the rest, browser meaning only while a page has focus) is satisfiable with one mechanism the code supports directly: GlobalKeyListener reads a `<key>`'s `disabled` attribute live on every event (KeyEventHandler.cpp:187-190). A chrome focus tracker enables the page-key rows only while an overlay has focus. Reserved rows are then reserved only while a page is focused, and when the Theia frame is focused every key goes to Theia untouched. That is KEY-04 by construction, including terminal readline keys (Ctrl+W, Ctrl+R, Ctrl+T) that reservation would otherwise destroy. F6 needs the Firefox `requestReplyFromRemoteContent()` pattern instead of a `<key>`.

The groundwork has two structural constraints. First, `PowerBrowserAPI` is one frozen object literal, and `INTERNAL-APIS.md` rows are keyed by line number down to line 4066. New kinds and helpers therefore go in a new section appended at the end of the file, routed from `PowerBrowserGroupParent.receiveMessage` by one added line, the way the store-request section already does it. Then `verify-ng-040-internals-catalogue-lines.mjs --fix` runs. Second, the gBrowser stand-in gate's derivation must widen from a hand-kept list of three upstream files to a derived file set. Over the actor parents, the required set grows by five members the stand-in must not implement. That needs a reasoned "deliberately absent" record instead of plain set equality (Pitfall P6).

**Primary recommendation:** Build the groundwork first, as one serialised plan on `PowerBrowserAPI.sys.mjs`: the end-of-file section, the push helper with rAF coalescing, `webTabStop`/`webTabHistory`/`webTabGotoIndex`/`webTabActivated`, `bypassCache`, the gate growth and the live-probe harness. Then build the chrome-bar buttons, then the chrome key table with its focus tracker and the frontend relay. Every row in the key table must be enabled only while an overlay has focus.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stop / hard reload / goto-index / history read | Chrome (PowerBrowserAPI, privileged) | Theia frame (button handlers) | Browser-element methods and `nsISHistory` are Firefox internals; Theia sends `webTab*` kinds by tab id |
| Reload↔Stop button state, history menu, Home, tooltips, middle-click, drop | Theia frame (`@powerbrowser/chrome-bar`) | — | Our own UI; `.lm-Menu`, `HoverService`, React |
| Key detection while a page has focus | Chrome (`powerbrowser.js` keyset, focus tracker, AppCommand listener) | — | Only chrome sees keys targeted at a focused overlay; DOM-only APIs, no internals |
| Key → action mapping (one table) | Theia frame (shortcut relay in chrome-bar) | Chrome (push `shortcut`) | Actions are Theia commands and widget methods; tooltip text comes from the same table |
| Page-focus signal | Chrome (focus tracker → `pageFocus` push) | Theia frame (context key, `markAsCurrent`) | Chrome knows which `<browser>` is focused; Theia scopes UI by it |
| Selected-web-tab signal (`webTabActivated`) | Theia frame (dock current title) | Chrome (stores per Theia browser) | Theia owns selection; chrome needs it for later furniture (PopupNotifications `selectedBrowser`) |
| State push coalescing | Chrome (PowerBrowserAPI, rAF on the shell window) | — | Traffic originates in progress listeners chrome-side |
| Home page setting | Theia frame (`PreferenceContribution`) | — | A Theia preference; no Firefox `browser.startup.homepage` reach needed |

## Standard Stack

No new package. Everything is already pinned and composed.

### Core
| Library / API | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Gecko `<browser>` element methods `stop()`, `reloadWithFlags(flags)`, `gotoIndex(i)`, `canGoBack/Forward` | ESR 153.5.0 (`FIREFOX_153_5_0esr_BUILD1`) | Nav actions on an overlay | Same calls Firefox's own `BrowserCommands` makes [VERIFIED: upstream/toolkit/content/widgets/browser-custom-element.mjs:886-927] |
| `browser.browsingContext.sessionHistory` (`nsISHistory`: `count`, `index`, `getEntryAtIndex(i)` → `nsISHEntry.title`, `.URI`) | ESR 153.5.0 | History menu | The parent-side session history; the tree already reads it at `PowerBrowserAPI.sys.mjs:769` and `:828` [VERIFIED: upstream/docshell/shistory/nsISHistory.idl:46,52,77; nsISHEntry.idl:54,82] |
| XUL `<keyset>`/`<key>` + GlobalKeyListener | ESR 153.5.0 | Page-focus keys | The mechanism the shell already uses for Ctrl+L and Ctrl+Alt+Shift+D [VERIFIED: powerbrowser/shell/powerbrowser.js:305-333] |
| `@theia/core` `ContextMenuRenderer.render({menuPath, menu, anchor, context, onHide})` | 1.76.0 | History menu as `.lm-Menu` | Pattern at `layout-controls-widget.tsx`; `menu?: CompoundMenuNode` allows a dynamic menu [VERIFIED: theia/node_modules/@theia/core/lib/browser/context-menu-renderer.d.ts] |
| `@theia/core` `HoverService.requestHover({content, target, position, cssClasses})` | 1.76.0 | Tooltips | Stock hover; handles delay, mouseout and mousedown cancel [VERIFIED: hover-service.d.ts; hover-service.js:111-145,294-334] |
| `@theia/core` `PreferenceContribution`/`PreferenceSchema`/`PreferenceService` | 1.76.0 | `browser.showHomeButton`, `browser.homePage` | In-tree pattern `telemetry-preferences.ts`; no `browser.*` key is registered by any installed `@theia/*` (grep, this session) |
| `@theia/core` `ContextKeyService.createKey(key, default)` | 1.76.0 | Page-focus context key | Stock [VERIFIED: context-key-service.d.ts:30] |
| `@theia/core` `TheiaDockPanel.markAsCurrent(title)` | 1.76.0 | Make the focused page's tab current without stealing DOM focus | Public method on the dock panel [VERIFIED: theia-dock-panel.js:147-156] |

### Supporting
| API | Purpose | When to Use |
|---------|---------|-------------|
| `CommonCommands.OPEN_PREFERENCES` with a string argument | Settings filtered to `browser.homePage` (Home-failure row) | `execute: async (query) => { … widget.setSearchTerm(query) }` [VERIFIED: theia/node_modules/@theia/preferences/lib/browser/preferences-contribution.js:44-51] |
| `FrontendApplicationConfigProvider.get().applicationName` | `{App}` in copy | Read pattern at `branding/src/browser/powerbrowser-about-dialog.tsx:62`; UI-SPEC forbids that file's literal fallback for chrome-bar copy |
| `ApplicationShell.addWidget(widget, {area:'main', ref, mode:'tab-after'})` | Background tab next to the current one | `ref?: Widget`, `mode?` (default `'tab-after'`) [VERIFIED: application-shell.d.ts:542-558] |
| `Event.requestReplyFromRemoteContent()`, `isReplyEventFromRemoteContent`, `defaultPreventedByContent` | F6 reply path | ChromeOnly in Event.webidl:48,92,96,100 [VERIFIED]; the tabbrowser pattern at tabbrowser.js:8064-8083 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `disabled` toggling on page rows | `reserved="true"` always, as today's Ctrl+L | Reserved keys never reach the Theia frame; terminal Ctrl+W/Ctrl+T and Monaco Ctrl+L die (KEY-04 violation) |
| Frontend relay table (one table) | Chrome acts directly on the overlay for reload/back/stop | Two action tables; tooltip text and actions drift; no single derivation |
| URL-only duplicate for middle-click | History-carrying duplicate through NG-034 `takeWebTabHistory` arming | Firefox duplicates history; that touches the restore path and the row-key arming. Not required by NAV-06; record as a follow-up |

**Installation:** none.

**Version verification:** `require('@theia/core/package.json').version` → 1.76.0 per UI-SPEC registry table; `git -C upstream describe --tags` → `FIREFOX_153_5_0esr_BUILD1` [VERIFIED this session].

## Package Legitimacy Audit

This phase installs no external package (UI-SPEC "Registry Safety": "no new packages").

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Verified In-Repo Values (verbatim, read this session)

These are the discrete values plans will touch. Quote, path and lines:

- `theia/extensions/tab-uris/src/browser/web-tab.ts:99` — `const BLOCKING_LAYER_SELECTOR = '.pb-chrome-bar-dropdown, .quick-input-widget, .lm-Widget.dialogOverlay, .lm-Menu, .lm-mod-drag-image';`
- `web-tab.ts:42` — `export const WEB_TAB_STATE_EVENT = 'PowerBrowserWebTabState';`
- `web-tab.ts:150-156` — `export interface WebTabState { url: string; title: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; }`
- `web-tab.ts:159-167` — the union: `'webTabOpen'`, `'webTabGeometry'`, `'webTabNavigate'`, `'webTabBack'`, `'webTabForward'`, `'webTabReload'`, `'webTabClose'`, `'webTabFocus'` (`{ kind: 'webTabReload'; tabId: string }` today).
- `web-tab.ts:276-280` — router today: `if (detail.kind === 'focusAddress') {` … `if (detail.kind !== 'state' || typeof detail.tabId !== 'string') {`
- `theia/extensions/tab-uris/src/browser/profile-storage.ts:46` — `export const SHELL_FLUSH_KIND = 'flushShellState';` (a second `window.addEventListener(WEB_TAB_STATE_EVENT, …)` at `:286`).
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs:385-387` — `function webTabIdIsValid(tabId) { return typeof tabId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(tabId); }`
- `PowerBrowserAPI.sys.mjs:3385-3402` — `webTabPush(theiaBrowser, tabId, browser, loading)` sends `kind: "state"`, `tabId`, `url: browser.currentURI.spec`, `title: browser.contentTitle`, `loading: !!loading`, `canGoBack: browser.canGoBack`, `canGoForward: browser.canGoForward`.
- `PowerBrowserAPI.sys.mjs:2292` — `.sendAsyncMessage("PowerBrowserWebTabState", { kind: "flushShellState", flushId });`
- `PowerBrowserAPI.sys.mjs:3562` — `.sendAsyncMessage("PowerBrowserWebTabState", { kind: "focusAddress" });`
- `PowerBrowserAPI.sys.mjs:3343` — `browser.addProgressListener(entry.listener, Ci.nsIWebProgress.NOTIFY_LOCATION | Ci.nsIWebProgress.NOTIFY_STATE_NETWORK);`
- `PowerBrowserAPI.sys.mjs:3531-3538` — `webTabReload(tabId)` calls `entry.browser.reload();` and returns `"done"`.
- `PowerBrowserAPI.sys.mjs:3676-3680` — receiveMessage routing: `if (SHELL_MESSAGE_KINDS.has(message.data && message.data.kind)) {` … `if (isStoreRequestKind(message.data?.kind)) { return handleStoreRequest(message.data, this); }` … `return PowerBrowserAPI.handleGroupMutation(message.data, this);`
- `PowerBrowserAPI.sys.mjs:3699-3704` (comment) — "This section sits at the end of the file on purpose: nothing above the last catalogued internals line moves when it grows".
- `powerbrowser/shell/powerbrowser.js:79-94` — stand-in members `tabs`, `getTabForBrowser()` (returns `null`), `getBrowserForTab(tab)`, `setIcon() {}`.
- `powerbrowser.js:324-333` — `focusAddressKey.setAttribute("id", "powerbrowser-focus-address-key"); … ("modifiers", "accel"); … ("key", "L"); … ("reserved", "true");` handler `PowerBrowserAPI.webTabFocusAddress(browserElement);`
- `scripts/check-internals-boundary.sh:40-82` — `FORBIDDEN_PATTERNS=( 'Services.' 'Cc[' 'Cc.' 'Ci.' 'Cr.' 'Cu.' 'Components.classes' 'Components.interfaces' 'AppConstants' 'ChromeUtils.import' 'ChromeUtils.defineESModuleGetters' 'ChromeUtils.registerWindowActor' 'nodePrincipal' 'fixupAndLoadURIString' 'wrappedJSObject' 'drawSnapshot' 'IOUtils' 'SessionStoreUtils' 'ChromeUtils.generateQI' 'JSWindowActorParent' 'JSWindowActorChild' 'gBrowser' )`
- `scripts/verify-web-tab-bridge.mjs:128-129` — `derive(src[API], /case "(webTab[A-Za-z]+)"/g)` and `derive(src[WEB_TAB], /kind: '(webTab[A-Za-z]+)'/g)`; `:171` — `derive(src[API], /sendAsyncMessage\("(PowerBrowser[A-Za-z]+)"/g)`.
- `scripts/verify-shell-gbrowser-standin.mjs:73-86` — `UPSTREAM_CALL_SITES` = `upstream/toolkit/content/widgets/browser-custom-element.mjs`, `upstream/browser/actors/LinkHandlerParent.sys.mjs`, `upstream/browser/actors/ContextMenuParent.sys.mjs`; `:104` — `const GBROWSER_CALL = /\bgBrowser\s*\??\.\s*([A-Za-z_$][\w$]*)\s*\(/g;`
- `scripts/verify-shell-error-copy.mjs:546-560` — `EXPECTED_WIDGET_COPY` = `"Back"`, `"Forward"`, `"Reload"`, `"Search or enter address"`, `"New Tab"`, `"Suggestions"`, `"Mode"`, `"Chrome Bar"`, `"No suggestions"`, `"No matches for what you typed — press Enter to visit it as an address."`, `"Enter opens the address · Esc closes suggestions"`, `"PowerBrowser couldn&apos;t load suggestions. Press Enter to visit what you typed."`, `"PowerBrowser couldn&apos;t open that address. Press Enter to try again."`; `:524` — scope is only `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`.
- `scripts/verify-chrome-bar-commands.mjs:44-53` — `EXPECTED_IDS` = `'powerbrowser.chrome-bar.back'`, `'powerbrowser.chrome-bar.forward'`, `'powerbrowser.chrome-bar.reload'`, `'powerbrowser.chrome-bar.new-tab'`, `'powerbrowser.chrome-bar.focus-address'`; `EXPECTED_LABELS = Object.freeze(['Back', 'Forward', 'Reload', 'New Tab'])`.
- `scripts/verify-platform.sh:3756-3757` — `"gui02-web-tab-bridge|node $REPO_ROOT/scripts/verify-web-tab-bridge.mjs"` / `"…-self-test|… --self-test"` (quick array `run_own_checks` `CHECKS=(`, line ~3563; live rows under `if [ "$QUICK" -eq 0 ]; then CHECKS+=(` at :4628-4629).
- `powerbrowser/shell/jar.mn` — lists exactly `powerbrowser.xhtml`, `powerbrowser.js`, `powerbrowser.css`, `PowerBrowserAPI.sys.mjs`, `GroupActorChild.sys.mjs`, `TheiaService.sys.mjs`.

## Architecture Patterns

### System Architecture Diagram

```
                ┌──────────────────────────── shell window (powerbrowser.xhtml) ────────────────────────────┐
 keyboard ──▶   │ GlobalKeyListener (keyset in powerbrowser.js)                                              │
 (OS / TIP)     │   page rows enabled ⇔ focus tracker says an overlay is focused (disabled attr, live)        │
                │   ├─ reserved row (Ctrl+T/W, Ctrl+Tab family, …) ──▶ fires in chrome, page never sees it   │
                │   ├─ reply row (Ctrl+R, F5, Esc, Alt+←/→, Alt+Home, Alt+D, Ctrl+L, Alt+1..9)               │
                │   │     └─▶ forwarded to overlay content ─▶ page may preventDefault ─▶ reply ─▶ fires?     │
                │   └─ F6 reply listener (keypress, requestReplyFromRemoteContent) ─▶ !preventedByContent ─▶ │
                │ AppCommand listener (mouse 8/9 → "Back"/"Forward") ─▶ hovered overlay                      │
                │                                   │ handler: focus Theia frame first if the row lands in UI│
                │                                   ▼                                                        │
                │ PowerBrowserAPI (end-of-file section)                                                      │
                │   sendWebTabPush(theiaBrowser, {kind:'shortcut'|'pageFocus'|'state'|…})  rAF-coalesced     │
                │   handleWebTabAction: webTabStop · webTabReload{bypassCache} · webTabHistory ·             │
                │                       webTabGotoIndex · webTabActivated   (sender wall + webTabIdIsValid)   │
                │        ▲ PowerBrowserGroupMutation                          │ PowerBrowserWebTabState       │
                │        │                                                    ▼                               │
                │  GroupActorChild (unchanged: one request event in, one push event out)                     │
                │        ▲                                                    │                               │
                │  ┌─────┴───────────── Theia frame ──────────────────────────▼────────────────────────────┐  │
                │  │ WebTabChannel.onPush(kind) router ─▶ 'state' → WebTabWidget.applyState                │  │
                │  │                                    ─▶ 'focusAddress' → focusAddressPill               │  │
                │  │                                    ─▶ 'flushShellState' → ShellStateFlushContribution  │  │
                │  │                                    ─▶ 'pageFocus' → context key + markAsCurrent        │  │
                │  │                                    ─▶ 'shortcut' → ShortcutRelay (one table) ─▶ action │  │
                │  │ mainPanel.onDidChangeCurrent ─▶ webTabActivated{tabId|null}                           │  │
                │  │ ChromeBarWidget: Reload/Stop · Back/Fwd menu (ContextMenuRenderer) · Home · hovers    │  │
                │  └───────────────────────────────────────────────────────────────────────────────────────┘  │
                │  overlay <xul:browser> z1 (pages) — hidden while .lm-Menu etc. open (BLOCKING_LAYER_SELECTOR) │
                └────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Change Map (no new package, no new chrome file)

```
powerbrowser/shell/
├── PowerBrowserAPI.sys.mjs   # + end-of-file section: push helper/coalescer, WEB_TAB_ACTION_KINDS,
│                             #   handleWebTabAction, tabIdOfBrowser, active-tab map; 1 routing line in
│                             #   receiveMessage; webTabPush call sites → coalescer (same lines)
├── powerbrowser.js           # + key table literal, focus tracker, F6 reply listener, AppCommand listener
└── (powerbrowser.xhtml, jar.mn unchanged — a new chrome file would need a jar.mn row AND ./mach build faster)
powerbrowser/INTERNAL-APIS.md # + 1 row (hard-reload flags) + append-only rule in the header; NG-040 --fix
theia/extensions/tab-uris/src/browser/
├── web-tab.ts                # onPush router, union + new kinds, webTabActivated contribution, reload(bypass)
└── profile-storage.ts        # flush listener moves onto channel.onPush('flushShellState')
theia/extensions/chrome-bar/src/browser/
├── chrome-bar-widget.tsx     # Reload/Stop, history menu, Home, hovers, middle-click, drop, pill Esc/F6
├── chrome-bar-shortcuts.ts   # NEW: the one shortcut table (ids, display text, actions) + relay
├── chrome-bar-preferences.ts # NEW: browser.showHomeButton / browser.homePage schema
├── tab-strip-widget.tsx      # one public switch-order method shared with render()
└── chrome-bar-frontend-module.ts # static binds (D-50: late binds are invisible)
scripts/
├── verify-web-tab-bridge.mjs        # + push-kind parity (+ self-test plants)
├── verify-shell-gbrowser-standin.mjs# derived call-site set + DELIBERATELY_ABSENT record
├── check-internals-boundary.sh      # + shim-global patterns + plants
├── verify-shell-error-copy.mjs      # widget pin update + new copy surfaces
├── verify-chrome-bar-commands.mjs   # EXPECTED_IDS only if new command ids are added
├── verify-shortcut-relay.mjs        # NEW (+ --self-test), quick
├── lib/pb-live-probe.mjs            # NEW harness: -purgecaches flag, push recorder, page-focus probe
└── verify-nav-keys-live.mjs         # NEW live check (+ --self-test), full run only
```

Put the shortcut relay in chrome-bar, not tab-uris: its actions (New Tab, pill focus, strip order, Home) live in chrome-bar, and chrome-bar already depends on tab-uris. The reverse import would be a package cycle. ARCHITECTURE.md's `tab-uris/shortcut-relay.ts` placement predates that check.

### Pattern 1: End-of-file action section (G11 append rule)

**What:** New web-tab kinds are served by a module-level `handleWebTabAction(data, actorRef)` at the end of `PowerBrowserAPI.sys.mjs`, dispatched from `receiveMessage` by one line. That copies the `STORE_REQUEST_KINDS` precedent (`:3706-3719`). The frozen `PowerBrowserAPI` object cannot gain members after `Object.freeze`, and inserting arms into `handleGroupMutation` (`:2454-2510`) moves every catalogued line below `:2510` (rows run to `:4066`). If powerbrowser.js needs new API functions, export a second frozen object from the same boundary file, for example `export const PowerBrowserWebTabs = Object.freeze({...})`. The boundary rule is one file, not one object.

**Why it is safe for the gates:** `verify-web-tab-bridge.mjs` derives `case "webTab…"` over the whole file, so end-of-file arms are counted. `webTabIdIsValid`, `groupSenderIsTheia` and `webTabs` are module-level, so they are reachable. Function declarations hoist, and every call runs after module evaluation.

```javascript
// Source: pattern of PowerBrowserAPI.sys.mjs:3706-3719 (STORE_REQUEST_KINDS), names proposed
const WEB_TAB_ACTION_KINDS = new Set(["webTabStop", "webTabHistory", "webTabGotoIndex", "webTabActivated"]);
async function handleWebTabAction(data, actorRef) {
  if (!groupSenderIsTheia(actorRef)) {
    return { ok: false, reason: "validation", message: "handleWebTabAction: rejecting non-Theia-origin sender" };
  }
  const kind = data.kind;
  if (kind === "webTabActivated") {
    if (data.tabId !== null && !webTabIdIsValid(data.tabId)) { return { ok: false, reason: "validation", message: "…malformed tabId" }; }
    activeWebTabByFrame.set(actorRef.browsingContext.top.embedderElement, data.tabId);
    return { ok: true, kind, where: "applied" };
  }
  if (!webTabIdIsValid(data.tabId)) { return { ok: false, reason: "validation", message: "…malformed tabId" }; }
  const entry = webTabs.get(data.tabId);
  if (!entry) { return { ok: true, kind, where: "unknown-tab" }; }
  switch (kind) {
    case "webTabStop": entry.browser.stop(); return { ok: true, kind, where: "done" };
    case "webTabHistory": { /* see Code Examples */ }
    case "webTabGotoIndex": { /* integer and 0 <= index < count, else validation */ }
  }
  return { ok: false, reason: "validation", message: `handleWebTabAction: unknown kind ${String(kind)}` };
}
// receiveMessage, one added line beside :3679:
//   if (WEB_TAB_ACTION_KINDS.has(message.data?.kind)) { return handleWebTabAction(message.data, this); }
```

Widen the existing `webTabReload` arm with `bypassCache` (a new kind is not needed). The flags constant needs `Ci.`, so it gets one catalogue row. Keep that `Ci.` on a single line so it costs exactly one row.

### Pattern 2: One push name, kinds by router; coalesced state

**Chrome:** one helper, `sendWebTabPush(theiaBrowser, payload)` (end of file), that every push site uses. `state` goes through a per-tab coalescer: a pending map `tabId → {theiaBrowser, browser, loading}`, flushed in `win.requestAnimationFrame` on the shell window. Latest `loading` wins; the other fields are read live at flush time; tabs no longer in `webTabs` are skipped. The three existing `PowerBrowserAPI.webTabPush(...)` call sites inside `webTabOpen` (`:3324, :3340, :3354`) change in place, so the line count stays the same.

**Frontend:** `WebTabChannel.onPush(kind, handler): Disposable` over a `Map<string, Set<handler>>`. `onState` routes by `detail.kind`. `state` and `focusAddress` become registered handlers. `profile-storage.ts` subscribes to `flushShellState` through the channel instead of its own window listener, so there is one listener and one derivation site.

**Parity gate (new rule in `verify-web-tab-bridge.mjs`):** derive pushed kinds chrome-side (`kind: "x"` inside `sendWebTabPush(` / `sendAsyncMessage("PowerBrowserWebTabState", {` payloads) and subscribed kinds frontend-side (`onPush('x'` across tab-uris + chrome-bar sources). Compare as set equality, with an empty-derivation failure and two self-test plants: a chrome-only kind and a frontend-only kind. Kinds today: `state`, `focusAddress`, `flushShellState`; this phase adds `pageFocus`, `shortcut`.

### Pattern 3: Page-scoped key rows (the core of KEY-01..05)

**What:** one array literal in `powerbrowser.js`. Each row has `{ id, key | keycode, modifiers, reserved, landsInTheia }`. Each row becomes a `<key>` created at DOMContentLoaded (the existing idiom). A chrome focus tracker toggles every page row's `disabled` attribute: rows are enabled only while `document.activeElement` is an overlay `<browser>` that PowerBrowserAPI holds.

**Why it works (verified):**
- `disabled` is read on every key event, not cached: `KeyEventHandler::KeyElementIsDisabled() { … keyElement->GetBoolAttr(nsGkAtoms::disabled); }` [VERIFIED: upstream/dom/events/KeyEventHandler.cpp:187-190] and `CanHandle` checks it first (GlobalKeyListener.cpp:705-710).
- A reserved key is decided in chrome before content (`IsReservedKey`, GlobalKeyListener.cpp:463-500). A non-reserved key waits for the content reply, and `WalkHandlers` returns early when the reply is default-prevented (`if (aKeyEvent->DefaultPrevented()) return;`, GlobalKeyListener.cpp:91-93).
- Executing a XUL key handler calls `aEvent->PreventDefault()` (KeyEventHandler.cpp:342), so chrome's own Tab/F6 document navigation does not run after a reserved Ctrl+Tab row fires.

**Handler:** derive `tabId` from `document.activeElement` through the API (defence in depth, even though the row is enabled only while a page has focus). For rows that land in Theia UI (New Tab, Close Tab, focus pill, tab switching), call `theiaBrowser.focus()` first (Pitfall 8 focus rule, the `webTabFocusAddress` precedent). Then push `{kind:'shortcut', id, tabId}`. The frontend relay looks `id` up in the one table.

**Reserved vs reply, per key (recommendation, evidence in the Key Table below):** reserve Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp, Ctrl+PageDown. Use the reply path for Ctrl+R, F5, Ctrl+Shift+R, Ctrl+F5, Esc, Alt+Left, Alt+Right, Alt+Home, Alt+D, Ctrl+L, Alt+1..9. Use the F6 reply listener for F6 and Shift+F6. The diagnostics chord stays reserved and always enabled.

### Pattern 4: F6 through the Firefox reply-request pattern

Content's EventStateManager treats F6 (and Ctrl+Tab) as document navigation and sets `nsEventStatus_eConsumeNoDefault` (EventStateManager.cpp:4004-4040). BrowserChild then calls `PreventDefault()` on the event it replies with (BrowserChild.cpp:2600-2608), so a non-reserved `<key>` for F6 can never fire. The page-blockable route Firefox itself uses for such keys is a chrome listener calling `event.requestReplyFromRemoteContent()` on the first pass (tabbrowser.js:8064-8083). On the reply (`event.isReplyEventFromRemoteContent`), act only if `!event.defaultPreventedByContent`, which means the page did not block it. At that point content's document navigation has already moved focus, so the handler calls `webTabFocusAddress(theiaBrowser)` to land focus on the pill. This keeps F6 on the reply path as the locked ruling requires. Because the attribute semantics need a live check, a reserved, page-scoped F6 row is recorded as the fallback. That fallback deviates from the ruling and needs Chris's acceptance (Open Question 1).

### Pattern 5: History menu as a dynamic `CompoundMenuNode`

Theia's browser menu renderer accepts any node with `label`, `run` and `isEnabled` (`CommandMenu.is` = `RenderedMenuNode.is && Action.is`). It wraps such a node in a throwaway command, supports `isToggled` (the check mark), and restores focus to the previously focused element before `run` [VERIFIED: theia/node_modules/@theia/core/lib/browser/menu/browser-menu-plugin.js:300-330; common/menu/menu-types.js:26-51]. So the history menu needs no registered command per entry. Build `{ id, sortString, children, isVisible: () => true, isEmpty: () => false }` with one child per entry. Pad `sortString` so the newest entry sorts first. Pass it as `menu` to `ContextMenuRenderer.render({ menuPath: [<proposed id>], menu, anchor: {x: rect.left, y: rect.bottom}, context: button, includeAnchorArg: false, onHide })`. `.lm-Menu` is already in `BLOCKING_LAYER_SELECTOR`, so layer rule (a) holds with no change.

### Anti-Patterns to Avoid

- **Reserving keys unscoped (today's Ctrl+L):** kills Theia/Monaco/xterm meanings while Theia has focus. Scope every row by `disabled`.
- **`browser.sessionHistory` on an overlay:** throws `NS_ERROR_NOT_IMPLEMENTED` for remote browsers (RemoteWebNavigation.sys.mjs:205-216). Use `browser.browsingContext.sessionHistory`.
- **Two React elements for Reload and Stop:** remounting loses keyboard focus on every load (PITFALLS moderate). Use one `<button>` with changing glyph and attributes.
- **Tooltip text from `KeybindingRegistry`:** shows Theia's binding, not the relayed Firefox key (PITFALLS minor).
- **Routing a dropped string through `OpenerService` unvalidated:** a `file:` or `javascript:` drop would reach a non-web-tab opener. Admit `^https?://` only, before opening.
- **A new file under `powerbrowser/shell/`:** it needs a `jar.mn` row and `./mach build faster` before the objdir symlink exists. Keep the key table in `powerbrowser.js` and the API in `PowerBrowserAPI.sys.mjs`.
- **New key rows that execute palette commands for state outside the tab** (privileged-kind rule): nothing in this phase is privileged, but write the rule now (see Security Domain).

## Key Table (evidence for the reserved/reply split)

| Key (page focused) | Mechanism | Firefox evidence | Theia/terminal meaning protected by page-scoping |
|---|---|---|---|
| Ctrl+T | reserved row | `key_newNavigatorTab … reserved="true"` (browser-sets.inc.xhtml:138-139) | terminal readline transpose-chars; `ctrlcmd+k ctrlcmd+t` chord |
| Ctrl+W | reserved row | `key_close … reserved="true"` (:186) | terminal readline delete-word |
| Ctrl+Tab / Ctrl+Shift+Tab | reserved row | tabbox keydown "tab navigation should always work" (tabbox.js:120-168); ctrlTab (browser-ctrlTab.js:550-566) | Theia `core.nextTab` `'ctrl+tab'` / `'ctrl+shift+tab'` (common-frontend-contribution.js:796,802) |
| Ctrl+PageUp / Ctrl+PageDown | reserved row | tabbox `PREVIOUS_TAB`/`NEXT_TAB` (tabbox.js:155-166) | editor/terminal page keys |
| Ctrl+R, Ctrl+Shift+R | reply row | `key_reload`, `key_reload_skip_cache` no reserved attr (:264-265) | terminal reverse-i-search (Ctrl+R) |
| F5, Ctrl+F5 | reply row | `key_reload2`, `key_reload_skip_cache2` (:231, :234) | debug start `'f5'` `!inDebugMode`, `'ctrl+f5'` start-no-debug (debug-frontend-application-contribution.js:675-685) |
| Esc (while loading) | reply row | `key_stop keycode="VK_ESCAPE"` no reserved (:293) | many Theia `esc` bindings |
| Alt+Left / Alt+Right | reply row | `goBackKb`/`goForwardKb` (:220-221, non-mac) | editor go back/forward on Windows (`'alt+left'`, editor-keybinding.js:28-31) |
| Alt+Home | reply row | `goHome keycode="VK_HOME" modifiers="alt"` (:230) | — |
| Alt+D, Ctrl+L | reply row | `focusURLBar2` (alt) / `focusURLBar` (accel), no reserved (:140-145) | Monaco `expandLineSelection` / notebook `'ctrlcmd+l'` |
| F6, Shift+F6 | F6 reply listener (Pattern 4) | handled by content ESM document navigation (EventStateManager.cpp:4005-4040) | debug pause `'f6'` `inDebugMode` (:717) |
| Alt+1 … Alt+9 | reply row | `key_selectTab1…key_selectLastTab`, modifier `alt` on GNOME, `accel` elsewhere (:374-389) | — |
| Mouse 4/5 | AppCommand listener | GTK button 8/9 → `DispatchCommandEvent(nsGkAtoms::Back/Forward)` (widget/gtk/nsWindow.cpp:3050-3063); browser.js `HandleAppCommandEvent` (:1248-1256) | none: the content process never sees these (no mouse event is created) |

Not in this phase: F11, Ctrl+P, Ctrl+K and every other key. KEY-04 is satisfied for them because no row exists. The derived check must assert this (no row may bind them).

**Ctrl+L note:** it is reserved today (`powerbrowser.js:328`), but Firefox does not reserve it. Per the locked ruling it moves to a page-scoped reply row. 14.1-UI-SPEC A13 called it "the one key guaranteed to leave a web page". After this phase the guaranteed exits are the reserved rows (Ctrl+T, Ctrl+W, Ctrl+Tab), as in Firefox. Record this as a deliberate contract change in the plan. No script references `powerbrowser-focus-address-key` (grep, this session).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session-history window of 15 | A new ranking | Firefox's `FillHistoryMenu` algorithm (browser.js:1545-1585): `half=7; start=max(index-7,0); end=min(start==0?15:index+8,count); if end==count start=max(count-15,0)`, newest first | Matches Firefox exactly; edge cases already handled |
| Hard reload | Cache-busting query strings | `reloadWithFlags(LOAD_FLAGS_BYPASS_PROXY \| LOAD_FLAGS_BYPASS_CACHE)` (nsIWebNavigation.idl:175,181) | Sends `Cache-Control: no-cache`; same as Firefox |
| Context menu with keyboard nav and edge flipping | A custom popover | `ContextMenuRenderer` + `.lm-Menu` | Stock keyboard handling and the occlusion rule already apply |
| Tooltips | `title=` or a custom tooltip div | `HoverService` | Native `title` tooltips are dead in the shell until Phase 35 (UI-SPEC) |
| Key interception | `window.addEventListener('keydown')` in the Theia frame | Chrome `<key>`/reply mechanism | A focused overlay swallows every key the Theia frame would see |
| Settings UI for Home | A custom dialog | Theia Settings editor via `PreferenceContribution` | Stock editor, rebrand-safe keys |
| Push dedupe/coalescing | Per-event pushes | rAF coalescer chrome-side (latest wins) | PITFALLS minor "Pushes not coalesced" |

**Key insight:** every behaviour here already exists in Gecko or Theia. The work is choosing the right existing path and proving it with a derived check, not writing logic.

## Common Pitfalls

### Pitfall P1: `browser.sessionHistory` throws for overlays
**What goes wrong:** STACK.md lists "`sessionHistory` :648". The element getter returns `this.webNavigation.sessionHistory`, and for a remote browser `webNavigation` is `RemoteWebNavigation`, whose getter throws `NS_ERROR_NOT_IMPLEMENTED` [VERIFIED: upstream/toolkit/components/remotebrowserutils/RemoteWebNavigation.sys.mjs:205-216].
**How to avoid:** `entry.browser.browsingContext.sessionHistory`, as `saveWebTabHistories` (`:769`) already does.
**Warning signs:** the history menu always shows the error item.

### Pitfall P2: A reserved key is reserved from the Theia frame too
**What goes wrong:** `reserved="true"` is decided before any content process, the Theia frame included. Reserving Ctrl+W/Ctrl+T/Ctrl+R breaks readline in Theia's terminal and Monaco/notebook bindings (KEY-04).
**How to avoid:** page-scope every row with `disabled` from the focus tracker. Reserve only Firefox's unblockable keys.
**Warning signs:** Ctrl+W in a terminal does nothing; Ctrl+L in an editor focuses the pill.

### Pitfall P3: Some keys never return unprevented on the reply path
**What goes wrong:** content ESM consumes F6 (and Ctrl+Tab) for document navigation, and BrowserChild turns `eConsumeNoDefault` into `PreventDefault()` on the reply. A non-reserved `<key>` never fires, and focus wanders to whatever document comes next in the chrome window.
**How to avoid:** Pattern 4 for F6; reserved rows for the Ctrl+Tab family (Firefox reserves them in effect).
**Warning signs:** F6 in a page moves focus into the Theia frame's editor or another overlay.

### Pitfall P4: Reply-path rows fire when the Theia frame did not handle the key
**What goes wrong:** with the Theia frame focused, an unbound key (Alt+Left on Linux, F6 outside debug) comes back unprevented, and an enabled chrome `<key>` would navigate a web tab while the user types in an editor.
**How to avoid:** the same `disabled` toggle. The handler also re-derives the target from `document.activeElement` and no-ops for anything that is not an overlay.

### Pitfall P5: Catalogue line churn in `PowerBrowserAPI.sys.mjs`
**What goes wrong:** inserting code above `:4066` shifts line-keyed `INTERNAL-APIS.md` rows; `ng-040-internals-catalogue-lines` and `internals-catalogue` go red.
**How to avoid:** the end-of-file section (Pattern 1); change existing lines in place; run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` after every edit of the file (it repairs stale references but never writes a new row); add new rows at the end of the Touchpoints table. Serialise plans that touch this file (other sessions commit on main).

### Pitfall P6: Deriving the gBrowser call sites changes what set equality means
**What goes wrong:** the derived scope over `browser/actors/*Parent.sys.mjs` + `toolkit/actors/*Parent.sys.mjs` + `browser-custom-element.mjs` (46 actor parent files) yields the required set {getBrowserForTab, getTabForBrowser, setIcon} plus {getNotificationBox, getTabDialogBox, refreshBlocked, removeTab, setTabLabelForAuthPrompts} (computed this session with the gate's own regex). Plain set equality would demand the stand-in implement five members it must not have.
**How to avoid:** compare `required == implemented ∪ DELIBERATELY_ABSENT`, where `DELIBERATELY_ABSENT` is a reasoned Map, the same discipline as `DATA_MEMBERS`. It must be red on a stale entry (an absent member no longer called) and on any new upstream call. Reasons, verified:
- `getTabDialogBox` — PromptParent.sys.mjs:222 feature-detects `win?.gBrowser?.getTabDialogBox`; absent keeps the window-modal prompt.
- `setTabLabelForAuthPrompts` — called only inside that branch (:255, :288).
- `getNotificationBox` — BlockedSiteParent.sys.mjs:38-39 calls it on `this.browser.getTabBrowser()`, which is null for overlays because `getTabBrowser()` requires `gBrowser.getTabForBrowser(this)` to be truthy (browser-custom-element.mjs:950-951).
- `removeTab` — AboutTabCrashedParent.sys.mjs:29-44, same null `getTabBrowser()` receiver.
- `refreshBlocked` — RefreshBlockerParent.sys.mjs:10-12 on `browser.documentGlobal.gBrowser` (the stand-in), reached only with `accessibility.blockautorefresh` on (DesktopActorRegistry.sys.mjs:734 `enablePreference`). That is a real TypeError if the user enables the pref. Record it as a known gap.

The self-test gains: plant a new caller file in a staged copy of a scanned dir (red), plant a stale absent entry (red), and keep the existing four plants.

### Pitfall P7: Stop/Reload swap and the 650 ms guard
**What goes wrong:** remounting loses focus. Also, Firefox's guard differs from the UI-SPEC: Firefox disables Reload for 650 ms only when the load ends on its own, and skips the guard after a Stop click (`if (!shouldAnimate || this._stopClicked) { … return; }`, browser.js:2834-2856).
**How to avoid:** one element; implement the UI-SPEC rule as written (ignore clicks for 650 ms after Stop turns into Reload, not dimmed). The UI-SPEC rule is stricter than Firefox on purpose.

### Pitfall P8: The selected web tab is not the focused page in a split
**What goes wrong:** the bar follows `mainPanel.currentTitle`, which follows Theia focus. A click into the other pane's page never gives Theia DOM focus, so the bar and the relay act on the wrong tab.
**How to avoid:** on `pageFocus {tabId}`, if that widget's title is not current, call `shell.mainPanel.markAsCurrent(widget.title)`. This fires `onDidChangeCurrent`, then the chrome-bar sync, then `webTabActivated`, without stealing DOM focus. Relay actions use the pushed `tabId`, never "current".

### Pitfall P9: Ctrl+W leaves focus nowhere
**What goes wrong:** Theia moves activation on close only for its *active* (focus-tracked) widget, and a web tab placeholder never holds DOM focus. After the relay closes a web tab, nothing is focused.
**How to avoid:** chrome focuses the Theia frame before the push. After `widget.close()`, the relay focuses the new current: `focusPage()` if it is a `WebTabWidget`, else `shell.activateWidget(id)`.

### Pitfall P10: Drop data cannot be read during dragover
**What goes wrong:** the UI-SPEC wants the ring only for droppable links, including plain text that is an http(s) URL. During `dragenter`/`dragover` the drag data store is in protected mode: "the data itself is unavailable", and `getData()` returns "" [CITED: https://html.spec.whatwg.org/multipage/dnd.html].
**How to avoid:** at dragover decide from `dataTransfer.types` only: `text/uri-list` or `text/x-moz-url` → ring and `dropEffect='copy'`. Plain-text-only drags cannot be classified before drop, so either accept them without the ring and validate at drop, or exclude them (Open Question 3). Always validate `^https?://` at drop.

### Pitfall P11: Live checks cannot use BiDi content-context key input for chrome keys
**What goes wrong:** WebDriver BiDi `input.performActions` on a content context synthesizes keys inside that content process (remote/webdriver-bidi/modules/windowglobal/input.sys.mjs:225 → `event.sendKeyDown`). They never pass the parent's GlobalKeyListener, so every chrome `<key>` looks dead.
**How to avoid:** synthesize at the parent. The harness already launches with `--remote-allow-system-access` and reaches the shell document through `"moz:scope": "chrome"` (scripts/lib/pb-relaunch.mjs:269-279). From that chrome context, either drive `input.performActions` against the chrome context, or call `nsITextInputProcessor` in a chrome-scope `script.evaluate`, after `overlay.focus()` (Assumptions A3/A4). ydotool (`/run/ydotoold/socket`, user in group `ydotool`) plus kdotool is the OS-level path for a headed manual run.

### Pitfall P12: Stale chrome JS in kept profiles
**What goes wrong:** edits to `powerbrowser/shell/*.js` do not run without a startup-cache purge (project memory, F9 incident).
**How to avoid:** the harness passes `-purgecaches` and sets `MOZ_PURGE_CACHES=1`, and prints that it did. The temporary profiles `withFirefoxPage` makes are cache-fresh anyway, but kept profiles (`pb-relaunch.mjs`) and Chris's default profile are not.

### Pitfall P13: Copy gate scope and pins
**What goes wrong:** `shell-error-copy-no-internals` pins the widget's copy by set equality, and its scope is `chrome-bar-widget.tsx` only. Removing `title=`, adding "Stop"/"Home" and moving tooltip strings into `chrome-bar-shortcuts.ts` will turn it red, and new copy outside the widget would be unchecked.
**How to avoid:** update `EXPECTED_WIDGET_COPY` in the same plan. Add the new copy files to the derived surface: tooltip table, history error item, "Untitled page", Home-failure row, preference descriptions. New sentences interpolate a single plain identifier (the existing modes rule allows `${name}`-style), and the gate must reject a `PowerBrowser` literal in new chrome-bar copy.

### Pitfall P14: `about:blank` in history labels
**What goes wrong:** the initial New Tab entry is `about:blank`, and the UI-SPEC fallback "title, else address" would print it. `web-tab.ts:40` says the empty page URL is "Never shown in copy".
**How to avoid:** label `about:blank` entries "New Tab" (the existing `NEW_TAB_LABEL`), as the tab title already does (Open Question 4).

## Code Examples

### History read (chrome, end-of-file section)
```javascript
// Source: Firefox FillHistoryMenu (upstream/browser/base/content/browser.js:1572-1609) reading the same nsISHistory
case "webTabHistory": {
  const sh = entry.browser.browsingContext?.sessionHistory;
  if (!sh || sh.count === 0) { return { ok: true, kind, where: "empty", index: -1, entries: [] }; }
  const entries = [];
  for (let i = 0; i < sh.count; i++) {
    const e = sh.getEntryAtIndex(i);
    entries.push({ title: String(e.title || ""), url: String(e.URI?.spec || "") });  // primitives only (structured clone)
  }
  return { ok: true, kind, where: "done", index: sh.index, entries };
}
case "webTabGotoIndex": {
  const sh = entry.browser.browsingContext?.sessionHistory;
  if (!Number.isInteger(data.index) || !sh || data.index < 0 || data.index >= sh.count) {
    return { ok: false, reason: "validation", message: "handleWebTabAction: refusing an out-of-range history index" };
  }
  entry.browser.gotoIndex(data.index);
  return { ok: true, kind, where: "done" };
}
```

### Page-scoped key row and focus tracker (powerbrowser.js, DOM only)
```javascript
// Source: idiom of powerbrowser.js:305-333; disabled read live per KeyEventHandler.cpp:187-190
const PAGE_KEYS = [ // derived by scripts/verify-shortcut-relay.mjs; ids shared with chrome-bar-shortcuts.ts
  { id: "newTab", key: "T", modifiers: "accel", reserved: true, landsInTheia: true },
  { id: "reload", keycode: "VK_F5", modifiers: "", reserved: false, landsInTheia: false },
  // …
];
const pageKeyElements = PAGE_KEYS.map(row => {
  const key = document.createXULElement("key");
  key.setAttribute("id", `powerbrowser-page-key-${row.id}`);
  if (row.key) { key.setAttribute("key", row.key); } else { key.setAttribute("keycode", row.keycode); }
  if (row.modifiers) { key.setAttribute("modifiers", row.modifiers); }
  if (row.reserved) { key.setAttribute("reserved", "true"); }
  key.setAttribute("disabled", "true");               // nothing page-scoped fires until a page has focus
  key.addEventListener("command", () => PowerBrowserWebTabs.relayShortcut(window, browserElement, row.id, row.landsInTheia));
  diagnosticsKeyset.appendChild(key);
  return key;
});
const syncPageFocus = () => {
  const tabId = PowerBrowserWebTabs.tabIdOfBrowser(document.activeElement);  // null for the Theia frame
  for (const el of pageKeyElements) { el.toggleAttribute("disabled", tabId === null); }
  PowerBrowserWebTabs.pushPageFocus(browserElement, tabId);                   // deduped chrome-side
};
document.addEventListener("focus", syncPageFocus, true);
document.addEventListener("blur", syncPageFocus, true);
```

### Frontend router (web-tab.ts)
```typescript
// Source: ARCHITECTURE.md Pattern 1, adapted to the existing onState at web-tab.ts:269-297
private readonly pushHandlers = new Map<string, Set<(detail: Record<string, unknown>) => void>>();
onPush(kind: string, handler: (detail: Record<string, unknown>) => void): Disposable {
    const set = this.pushHandlers.get(kind) ?? new Set();
    set.add(handler);
    this.pushHandlers.set(kind, set);
    return Disposable.create(() => set.delete(handler));
}
private readonly onState = (event: Event): void => {
    const detail = (event as CustomEvent).detail;
    if (!detail || typeof detail !== 'object' || typeof detail.kind !== 'string') { return; }
    for (const handler of this.pushHandlers.get(detail.kind) ?? []) {
        try { handler(detail); } catch (error) { console.error('[@powerbrowser/tab-uris] push handler failed:', detail.kind, error); }
    }
};
```

### Tooltip on a nav button
```tsx
// Source: HoverRequest in @theia/core 1.76 hover-service.d.ts
onMouseEnter={e => this.hoverService.requestHover({
    content: tooltipFor('back'),            // from chrome-bar-shortcuts.ts, e.g. 'Back (Alt+Left Arrow)'
    target: e.currentTarget, position: 'top', cssClasses: ['pb-chrome-bar-hover'],
})}
```
Gecko dispatches `mouseenter`/`mouseover` to disabled buttons (nsGenericHTMLElement.cpp:2258-2281), so disabled buttons keep their tooltips. It blocks `contextmenu`, `mousedown` and `click` on them, so the history menu and the long-press start only from enabled buttons, which is what the UI-SPEC wants.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Push kinds tested inline in `onState` | `onPush(kind)` router | this phase | Later phases add kinds without editing the router |
| `UPSTREAM_CALL_SITES` hand-kept (3 files) | Derived file set + reasoned absences | this phase | Rebase adding a gBrowser call anywhere in actor parents goes red |
| Reserved Ctrl+L, always on | Page-scoped reply-path Ctrl+L | this phase | Monaco/notebook Ctrl+L return to Theia's meaning in editors |

**Deprecated/outdated:** `STACK.md` "`sessionHistory` :648" for overlays (see Pitfall P1). ARCHITECTURE G2's reserved list (Ctrl+L, F6, Alt+D reserved) is superseded by the 2026-10-20 ruling.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The chrome document gets `focus`/`blur` capture events whose target is the overlay `<browser>` when focus enters or leaves its content, and `document.activeElement` is that element meanwhile | Pattern 3 | Rows never enable; fallback: re-derive focus in each handler and in a `focusin` on the Theia frame push (live probe 1) |
| A2 | `defaultPreventedByContent` survives the IPC reply and is false when only content's document navigation consumed F6 | Pattern 4 | F6 never or always redirects; fallback: page-scoped reserved F6 row (needs Chris, Open Question 1) |
| A3 | BiDi `input.performActions` against a `moz:scope: "chrome"` context dispatches at parent level (through GlobalKeyListener and remote forwarding) | Pitfall P11 | Use `nsITextInputProcessor` from chrome-scope `script.evaluate` instead |
| A4 | `Cc`/`Ci` (or `Components.classes`) are reachable in the shell document's realm for a chrome-scope evaluate | Pitfall P11 | Use BiDi chrome-context input, or `windowUtils` |
| A5 | Chrome receives `mouseover`/`mouseout` with the overlay `<browser>` as target, so "pointer over a page" is trackable for AppCommand | KEY-05 | Fall back to the page-focused overlay for AppCommand |
| A6 | The `AppCommand` event reaches a capture listener on the shell window (browser-init.js:331 does this in `browser.xhtml`) | KEY-05 | Mouse 4/5 dead; check with a chrome-dispatched `AppCommand` and a real button press (UAT) |
| A7 | `win.requestAnimationFrame` on the shell window runs while the window is visible and headless; a minimised window delays pushes, which is acceptable | Pattern 2 | Pushes stall headless; fallback `win.setTimeout(…, 16)` |
| A8 | `navigator.platform` in the chrome document is usable to pick `alt` (Linux/GNOME) vs `accel` (Windows/macOS) for Alt+1..9 and Alt+Left; v1.5 ships and verifies Linux only | Key Table | Wrong modifiers on non-Linux builds (none exist today) |
| A9 | Theia's `DynamicMenuWidget` renders `isToggled` as the stock check mark on the current history entry | Pattern 5 | Use a disabled current item; cosmetic only |

## Open Questions

1. **F6 if A2 fails.** Recommendation: try Pattern 4 first in the live probe. If `defaultPreventedByContent` does not discriminate, the only working route is a page-scoped reserved F6 row. That deviates from "only unblockable keys reserved", so get Chris's acceptance before switching (autonomous mode: this is a stop point only if Pattern 4 fails).
2. **Ctrl+L contract change.** Moving it to the reply path follows the ruling but retires 14.1-UI-SPEC A13's "guaranteed exit" wording. Recommendation: follow the ruling and record the A13 supersession in the plan.
3. **Plain-text drops.** They cannot be classified at dragover. Recommendation: accept `text/uri-list`/`text/x-moz-url` with the ring. For plain-text-only drags, set `dropEffect='copy'` without the ring and validate at drop (Phase 29 adds search). This needs a one-line UI-SPEC note.
4. **`about:blank` history entries.** Recommendation: label them "New Tab".
5. **"Widened WebTabState" content.** No field is needed by NAV/KEY. Recommendation: widen structurally (coalesced push, one parser) and add no field; later phases append fields (security, zoom, audible) in one place.
6. **Middle-click duplicate depth.** Recommendation: URL-only duplicate (the target entry's URL in a new background tab). The history-carrying duplicate through NG-034 arming is a follow-up.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Built binary `objdir/dist/bin/powerbrowser` | Live checks | ✓ | built 2026-10-18 (chrome JS symlinked, current with tree) | — |
| Theia app build `theia/applications/browser/lib` | Live checks | ✓ | bundle 2026-10-20 11:57; must be rebuilt after frontend edits (`nix develop .#theia`) | — |
| Node | All gates | ✓ | v24.19.0 | — |
| `theia/node_modules/.bin/tsc` | Typechecks (`-p theia/extensions/tab-uris`, `-p theia/extensions/chrome-bar` ~2 s; rebuild tab-uris `lib` with `tsc -b` before chrome-bar sees new exports) | ✓ | — | — |
| `upstream/` checkout | gBrowser derivation, shortcut derivation | ✓ | `FIREFOX_153_5_0esr_BUILD1` | — |
| ydotool daemon | Headed OS-level key/mouse injection (manual live run) | ✓ | socket `/run/ydotoold/socket`, user in `ydotool` group | chrome-scope TIP (Pitfall P11) |
| kdotool / KWin script + spectacle | Raise and screenshot for tooltip geometry | ✓ | kdotool v0.2.3 | BiDi rect reads |
| `scripts/verify-platform.sh --quick` baseline | Commit gate | ✓ | PASS, 137 rows, ~84 s (this session) | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none. No Gecko rebuild is needed (no patch, no new chrome file).

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Plain-node derive-and-compare scripts plus BiDi live scripts, run by one driver: `scripts/verify-platform.sh` |
| Config file | The registry inside `scripts/verify-platform.sh` (`run_own_checks` `CHECKS=(` for `--quick`; `if [ "$QUICK" -eq 0 ]; then CHECKS+=(` for live rows) |
| Quick run command | `scripts/verify-platform.sh --quick` (~84 s) or `scripts/verify-platform.sh --only <label>` |
| Full suite command | `scripts/verify-platform.sh` (needs the built binary and the last Theia build) |

### Three proof tiers used below
- **S — static gate** (`--quick`): text derivation over the tree and `upstream/`, with a `--self-test`.
- **D — sidecar DOM measure:** the standalone sidecar on :4000 (`POWERBROWSER_TOKEN_DISABLE=1`) driven with gsd-browser. It shows only Theia-frame layout (tooltip boxes, Home presence, menu rendering with a stubbed reply). It has no chrome actor and no overlays, and gsd-browser is not Gecko, so Gecko-specific event rules are not proven there.
- **L — live binary run:** `withFirefoxPage`/`withShell` with `-purgecaches`, the push recorder in the Theia frame, chrome-scope key synthesis after `overlay.focus()`, overlay state read in the overlay's BiDi context, and served pages from `servePages` (counters, slow responses, header capture).

### Phase Requirements → Test Map
| Req ID | Behavior | Tier | Automated Command | File Exists? |
|--------|----------|------|-------------------|-------------|
| (groundwork) | new `webTab*` arms ↔ union literals; push kinds ↔ `onPush` subscriptions | S | `scripts/verify-platform.sh --only gui02-web-tab-bridge` (+ `-self-test`) | ✅ grows |
| (groundwork) | gBrowser stand-in == derived required − reasoned absences | S | `--only shell-gbrowser-standin` (+ `-self-test`) | ✅ grows |
| (groundwork) | shim globals forbidden outside the boundary; every new internal catalogued with correct lines | S | `--only internals-boundary`, `--only internals-catalogue`, `--only ng-040-internals-catalogue-lines` (+ self-tests) | ✅ grows |
| (groundwork) | `TabUriRegistry` shape unchanged | S | `--only gui04-registry-shape` | ✅ unchanged |
| (groundwork) | `webTabActivated` reaches chrome; coalesced `state` push still drives the pill | L | `node scripts/verify-nav-keys-live.mjs` (scenario "activation") | ❌ Wave 0 |
| NAV-01 | slow page shows Stop on the same element; button stops; Esc in page stops; returns to Reload | L | `verify-nav-keys-live.mjs` ("stop": served page that never ends, assert `aria-label` Stop, click, assert `loading:false` push and button node identity) | ❌ Wave 0 |
| NAV-02 | Shift+click, Ctrl+Shift+R, Ctrl+F5 reload without cache | L | "hard-reload": server records `Cache-Control: no-cache` on the reload request (positive server-side assertion) | ❌ Wave 0 |
| NAV-03 | contextmenu / 500 ms hold opens `.lm-Menu` with entries; choosing one navigates | L (+D for render) | "history": 3 navigations, dispatch `contextmenu` on Back, read `.lm-Menu` items, click entry 0, assert overlay URL | ❌ Wave 0 |
| NAV-04 | Home hidden by default; setting shows it live; click and Alt+Home load the home page; bad value shows the failure row | L (+D) | "home": set prefs through `PreferenceService` in the page realm | ❌ Wave 0 |
| NAV-05 | tooltip text equals the derived table; tooltip box never intersects the page rect in 3 modes | S + L | `node scripts/verify-shortcut-relay.mjs` (+ `--self-test`); live "tooltips" reads `.theia-hover` rect vs placeholder rect | ❌ Wave 0 |
| NAV-06 | middle-click Back opens a background tab with the previous URL, current tab stays selected; drop of a link opens a foreground tab; `javascript:` drop refused | L | "middle-click", "drop" (constructed `DataTransfer` + `DragEvent` in the Theia frame) | ❌ Wave 0 |
| KEY-01 | page-focused Ctrl+T/W/R/F5/Alt+←/→ do the Firefox action; a page that `preventDefault`s F5/Alt+Left keeps it while Ctrl+T/W still act | L | "page-keys" (chrome-scope synthesis; positive control first) | ❌ Wave 0 |
| KEY-02 | Alt+D/Ctrl+L/F6/Shift+F6 → pill selected; F6 in pill → page | L | "focus-keys" (Theia `document.activeElement` is the pill input with full selection; chrome `activeElement` is the overlay after F6) | ❌ Wave 0 |
| KEY-03 | Ctrl+Tab family and Alt+1..9 follow strip order in Browsing, tab-bar order in Coding; wrap; focus lands in the page | L | "tab-keys" | ❌ Wave 0 |
| KEY-04 | Theia-focused F5/F6/Ctrl+Tab/Ctrl+W/Ctrl+R reach Theia (command spy / key recorder) and produce no `shortcut` push; no row binds F11/Ctrl+P/Ctrl+K | S + L | `verify-shortcut-relay.mjs` (no-row assertion); live "theia-keeps-keys" (positive: `workbench.action.debug.start` / `core.nextTab` executed, keydown recorded in the terminal; control: same key page-focused produces a push) | ❌ Wave 0 |
| KEY-05 | AppCommand Back/Forward over a page navigates it | L + manual | "mouse-buttons" (chrome-dispatched `AppCommand`); real button press in UAT | ❌ Wave 0 |
| copy | new copy carries no internal identifier and no brand literal; pinned widget copy updated | S | `--only shell-error-copy-no-internals` (+ self-test) | ✅ grows |
| commands | command id set matches the contract | S | `--only` row of `verify-chrome-bar-commands.mjs` | ✅ grows if ids are added |
| types | tab-uris and chrome-bar compile | S | `--only tab-uris-typecheck`; `theia/node_modules/.bin/tsc --noEmit -p theia/extensions/chrome-bar` | ✅ / ❌ (no chrome-bar row today; add one) |

Manual (`human_verify_mode: end-of-phase`): a real keyboard and mouse on KDE Wayland (ydotool optional), the tooltip look via KWin raise + `spectacle`, and the long-press feel. Scripted passes are evidence, never UAT (PROJECT.md decision).

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --quick` (stage new files first for the brand scan).
- **Per wave merge:** `--quick` plus `node scripts/verify-nav-keys-live.mjs` after a Theia build.
- **Phase gate:** full `scripts/verify-platform.sh` green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `scripts/lib/pb-live-probe.mjs`: `-purgecaches` + `MOZ_PURGE_CACHES=1` launch option on `withFirefoxPage` (recorded in output); push recorder (Theia-frame listener on `PowerBrowserWebTabState`, precedent `verify-web-tab-live.mjs:459`); page-focus probe (chrome-scope `overlay.focus()` + key synthesis + `document.activeElement` read); overlay-context lookup.
- [ ] `scripts/verify-shortcut-relay.mjs` + `--self-test`: derive `PAGE_KEYS` ids from `powerbrowser.js` and table ids from `chrome-bar-shortcuts.ts` (set equality); display text derived from each row's key/modifiers equals the tooltip string; reserved rows ⊆ {Firefox `reserved="true"` rows in `upstream/browser/base/content/browser-sets.inc.xhtml`} ∪ a reasoned exception map (Ctrl+Tab family from tabbox.js); no row for F11/Ctrl+P/Ctrl+K; every page row created `disabled`.
- [ ] `scripts/verify-nav-keys-live.mjs` + `--self-test` (plants: a removed relay row, a key left enabled while Theia is focused, Stop rendered as a second element).
- [ ] Registry rows: `shortcut-relay`, `shortcut-relay-self-test` (quick); `nav-keys-live`, `nav-keys-live-self-test` (live block); optionally `chrome-bar-typecheck` (quick).

## Security Domain

`security_enforcement` is absent from `.planning/config.json`, so it is enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | Token cookie untouched this phase |
| V4 Access Control | yes | `groupSenderIsTheia` wall on every new kind; overlay looked up by frontend tab id only, never a URL; privileged-kind rule written down |
| V5 Input Validation | yes | `webTabIdIsValid` (`null` explicitly allowed only for `webTabActivated`); integer range check for `index`; `^https?://` for drops and Home; reply payloads primitives only |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Any Theia-origin script (extension, AI tool) calls `webTab*` kinds | Elevation | All Phase 27 kinds act only on a tab's own navigation (same power as today's back/forward/reload). Write the **privileged-kind rule** in `INTERNAL-APIS.md`: a kind that changes state outside the tab's own navigation (permissions, site data, Places writes, clipboard, stock pages) runs only from a widget event handler and never gets a command id. Phase 27 adds no such kind. A cheap enforcement: every `case "webTab…"` arm is classified in one map (derived set equality inside `verify-web-tab-bridge.mjs`), so a new unclassified kind goes red |
| Dropped `javascript:`/`file:` URL routed through `OpenerService` | Tampering | Scheme wall before open; chrome's `webTabOpen` wall (`:3231-3235`) is the second line |
| Out-of-range or non-integer history index | Tampering | Chrome-side range check against `sessionHistory.count` |
| History titles and URLs exposed to the Theia frame | Information disclosure | Same data the `state` push already carries for the current entry; no principal, no form data; text nodes only in the menu |
| Shim global defined outside the boundary (`window.PopupNotifications`, `nsContextMenu`, `browserDOMWindow`, `openLinkIn`, `FullScreen`, `XULBrowserWindow`) | Elevation (second boundary) | Add these names to `FORBIDDEN_PATTERNS` now, with self-test plants; none occurs in `powerbrowser/shell/` today (grep, this session) |
| A focused page traps the user (blocks every exit key) | Denial of service | Reserved Ctrl+T/Ctrl+W/Ctrl+Tab rows cannot be blocked by pages, matching Firefox |

## Sources

### Primary (HIGH confidence)
- `upstream/` at `FIREFOX_153_5_0esr_BUILD1`: `dom/events/GlobalKeyListener.cpp:60-275,340-500,596-726`; `dom/events/KeyEventHandler.cpp:187-195,292,334-342`; `dom/events/EventStateManager.cpp:3947-4040,4749-4751`; `dom/ipc/BrowserParent.cpp:2901-2990`; `dom/ipc/BrowserChild.cpp:2600-2640`; `dom/webidl/Event.webidl:48,92,96,100`; `dom/html/nsGenericHTMLElement.cpp:2249-2289`; `browser/base/content/browser-sets.inc.xhtml:133-388`; `browser/base/content/browser-commands.js:5-145`; `browser/base/content/browser.js:1248-1300,1545-1660,2820-2856`; `browser/components/tabbrowser/content/tabbrowser.js:8057-8240`; `browser/components/tabbrowser/content/browser-ctrlTab.js:550-566`; `toolkit/content/widgets/tabbox.js:120-168`; `toolkit/modules/ShortcutUtils.sys.mjs:375-430`; `toolkit/content/widgets/browser-custom-element.mjs:640-660,855-935,950`; `toolkit/components/remotebrowserutils/RemoteWebNavigation.sys.mjs:200-216`; `docshell/shistory/nsISHistory.idl`, `nsISHEntry.idl`, `docshell/base/nsIWebNavigation.idl:136-181`; `widget/gtk/nsWindow.cpp:3040-3070,3266-3270`; `modules/libpref/init/StaticPrefList.yaml:19536-19547`; actor parents `PromptParent`, `BlockedSiteParent`, `AboutTabCrashedParent`, `RefreshBlockerParent`, `LinkHandlerParent`; `browser/components/DesktopActorRegistry.sys.mjs:733-734`; `remote/webdriver-bidi/modules/windowglobal/input.sys.mjs:225`.
- `theia/node_modules/@theia/*` 1.76.0: `core/lib/browser/context-menu-renderer.d.ts`, `common/menu/menu-types.{d.ts,js}`, `browser/menu/browser-menu-plugin.js:280-330`, `hover-service.{d.ts,js}`, `shell/theia-dock-panel.js:33-156`, `shell/application-shell.{d.ts,js}`, `common-frontend-contribution.js:790-860`, `context-key-service.d.ts`; `debug/lib/browser/debug-frontend-application-contribution.js:670-740`, `debug-commands.js:51-70`; `editor/lib/browser/editor-keybinding.js:20-40`; `monaco/lib/browser/workspace-symbol-command.js:55-65`; `terminal/lib/browser/terminal-frontend-contribution.js:79-80,806`; `preferences/lib/browser/preferences-contribution.js:44-51`.
- This tree at `8e523e7`: `powerbrowser/shell/{PowerBrowserAPI.sys.mjs,powerbrowser.js,powerbrowser.xhtml,GroupActorChild.sys.mjs,jar.mn}`, `powerbrowser/INTERNAL-APIS.md`, `theia/extensions/tab-uris/src/browser/{web-tab.ts,profile-storage.ts,tab-uris-frontend-module.ts}`, `theia/extensions/chrome-bar/src/browser/{chrome-bar-widget.tsx,chrome-bar-commands.ts,chrome-bar-keybindings.ts,layout-controls-widget.tsx,tab-strip-widget.tsx,chrome-bar-frontend-module.ts}`, `theia/extensions/telemetry/src/browser/telemetry-preferences.ts`, `theia/extensions/branding/src/browser/powerbrowser-about-dialog.tsx`, `scripts/{verify-web-tab-bridge.mjs,verify-shell-gbrowser-standin.mjs,check-internals-boundary.sh,verify-registry-shape.mjs,verify-ng-040-internals-catalogue-lines.mjs,verify-shell-error-copy.mjs,verify-chrome-bar-commands.mjs,verify-platform.sh,verify-web-tab-live.mjs}`, `scripts/lib/{firefox-bidi.mjs,pb-relaunch.mjs}`.

### Secondary (MEDIUM confidence)
- `.planning/research/{SUMMARY,ARCHITECTURE,STACK,PITFALLS}.md` (milestone research; corrected here on `sessionHistory` and on the reserved-key list).
- WHATWG HTML drag-and-drop, drag data store modes — https://html.spec.whatwg.org/multipage/dnd.html

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Every API was read at its pinned version; no package.
- Architecture: HIGH for the code paths, MEDIUM for focus-event and reply-attribute runtime behaviour (A1, A2).
- Pitfalls: HIGH. Each was traced to source lines read this session.

**Research date:** 2026-10-20
**Valid until:** 2026-11-19 (stable pins; re-check only on a Theia re-pin or an ESR rebase)

## RESEARCH COMPLETE
