# Project Research Summary

**Project:** PowerBrowser, milestone v1.5 Chrome Bar Firefox Parity
**Domain:** Firefox-toolbar parity for a Theia-hosted chrome bar that drives chrome-owned overlay `<xul:browser>` web tabs inside a non-`browser.xhtml` shell window (`powerbrowser.xhtml`, windowtype `powerbrowser:main`)
**Researched:** 2026-10-20
**Confidence:** HIGH for existence and signature of every cited module (read in `upstream/` at `FIREFOX_153_5_0esr_BUILD1` and `theia/node_modules/@theia/*` 1.76.0). MEDIUM for runtime behaviour: nothing in the four files was run live. Every runtime claim a plan depends on is listed under "Live probes required".

Inputs: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, chrome-bar-firefox-gap.md, PROJECT.md (Current Milestone).

## Executive Summary

v1.5 brings the chrome bar to Firefox-toolbar parity, measured against the 2026-10-20 gap list (20 have, 31 partial, 123 missing). All four files reach the same main finding. Web tabs are overlays created with `messagemanagergroup="browsers"`, so **every stock Firefox JSWindowActor already runs for them**: ContextMenu, Prompt, LinkHandler, DOMFullscreen, LoginManager, AutoComplete, Finder, Printing, AudioPlayback, PopupAndRedirectBlocking. Each parent actor then looks for window furniture that exists only in `browser.xhtml` (`PopupNotifications`, `nsContextMenu`, `FullScreen`, `browserDOMWindow`, `gBrowser.getTabDialogBox`). Without it, the actor bails out silently, throws, or falls back to a window-modal dialog. So most of v1.5 needs no new Gecko plumbing. It needs:

- furniture installed on the shell window from one place, `PowerBrowserAPI.installShellFurniture(window)`
- new `webTab*` action kinds
- a wider state push
- Theia UI

No new npm package, Gecko patch, flake change or Theia core edit is needed for any recommended item. The only area that may need a patch is WebExtension tab identity, and the recommendation is to defer it.

Recommended approach, in order:

1. **Shared groundwork.** Push router, active-web-tab signal, widened state push, action kinds, an append-only rule for the line-keyed internals catalogue, and a live-probe harness.
2. **The visible bar defects.** The pill is labelled as a search box but cannot search, and it cannot open `localhost:4000`. Both are fixed by one `resolveTypedAddress` kind over `Services.uriFixup.getFixupURIInfo` plus `SearchService`.
3. **The rest, in this order.** The modes dropdown (Chris's headline feature), then navigation, site identity and menu, page tools and bookmarks, shell furniture, and extensions.

Rules that hold throughout: Firefox internals go only through `PowerBrowserAPI`. Privileged pages are opened by enum, never by URL (`openStockPage {page}`). Privileged payloads stay chrome-side behind tokens. Features that exist only inside `browser.xhtml` go to the stock window.

The main risks are security and regression risks, not complexity:

- (a) An `nsIBrowserDOMWindow` on the shell can break GUI-01.
- (b) Each new `gBrowser` stand-in member or shim global silently changes which upstream code runs.
- (c) Reserved keys override Theia and Monaco bindings.
- (d) The current lock is computed from the typed text, so it is wrong.
- (e) The Theia credential is a port-less `127.0.0.1` cookie, and Clear Site Data on a localhost tab would delete it.
- (f) Any code in the Theia origin can call privileged kinds, including extensions and AI tools.

Most v1.5 behaviour is invisible to the `--quick` gates, the standalone sidecar loop and BiDi. Every prompt and furniture item therefore starts with a recorded live probe run with `-purgecaches`, and every check asserts a positive page-side outcome.

## Key Findings

### Recommended Stack

Nothing moves. Gecko stays 153.5.0esr and Theia stays 1.76.0; every API needed is already composed. All work rides the existing group-actor channel (`handleGroupMutation`, `handleStoreRequest`, `webTabPush`). Each new Gecko import is one line in the existing `defineESModuleGetters` block plus a catalogue row.

**Core technologies:**

- **Search, fixup, engines, suggestions:** `lazy.SearchService` (moz-src URL), `Services.uriFixup.getFixupURIInfo` and `SearchSuggestionController`.
  - `Services.search` does not exist at 153.
  - Await `init()`.
  - Not headless `UrlbarProvidersManager`: its providers dereference `controller.browserWindow`.
- **Places writes:** `PlacesUtils.bookmarks`, `.history` and `.observers`, plus `UrlbarUtils.addToInputHistory` and `Sanitizer.sanitize`, all from PowerBrowserAPI. Never raw SQL, and never a second writer in the Theia backend.
- **Security state:** `browser.securityUI.state`, with `NOTIFY_SECURITY | NOTIFY_CONTENT_BLOCKING` added to the overlay listener mask, pushed as an enum. Also `SitePermissions`, `SiteDataManager`, `ContentBlockingAllowList`, eTLD and IDN.
- **Page tools:**
  - browser-element methods: `finder`, `fullZoom`, `mute`, `stop`, `reloadWithFlags`, `gotoIndex`
  - ContentPrefService2 under `browser.content.full-zoom` for per-site zoom
  - the system print path: `printdialog-service` + `BrowsingContext.print`
  - Never load `browser-fullZoom.js`, `printUtils.js` or other `browser.xhtml` scripts.
- **Theia UI:**
  - `ContextMenuRenderer` and `MenuPath` for every menu (the `layout-controls-widget.tsx` pattern)
  - `AbstractDialog` and `ConfirmDialog`
  - `HoverService`
  - `ContextKeyService` for when-clauses such as `powerbrowser.webTabActive` and page focus
- **Default search engine:** `configuration.toml` → `distribution/policies.json` `SearchEngines`. This is the same generator path EXT-03 uses, so the rebrand rule holds.

### Expected Features

Prefixes:

- `SMODE-`: modes dropdown. `MODE-` is taken by v1.4.
- `BAR-`, `NAV-`, `KEY-`, `SITE-`, `MENU-`, `PAGE-`, `BMK-`, `PROMPT-`
- `EXT-`: continues at EXT-04.

Groundwork gets no REQ-IDs. Each piece lands inside the first requirement that needs it.

**Must have (P1):**

- search fallback, localhost and host:port fixup, a real Switch to Tab
- SMODE-01..08: dropdown, per-mode defaults, chip, mode-dependent prefix table, Command centre
- page-focus shortcuts (Ctrl+T/W/R, Alt+Left/Right, Alt+D, F6, Alt+1-9), each scoped by a when-clause
- Stop and hard reload
- real security state and "Not Secure"
- the hamburger menu in every mode (Settings, Passwords, Add-ons)
- find, zoom, print, favicons, mute, fullscreen
- star and Ctrl+D, reopen closed tab, clear history
- permission prompts
- page `window.open` opens a web tab

**Should have (P2):**

- page context menu and form/password autofill
- site info and permissions panel, clear site data
- engine suggestions, one-offs, Paste & Go
- back/forward history menu and Home
- bookmarks toolbar
- downloads panel, after its probe
- the extensions puzzle menu, after its spike

**Defer:**

- routing Ctrl+P, F1 and Ctrl+Shift+P into the pill
- per-site zoom memory, inline autofill, input-history ranking
- OpenSearch "Add engine" rows
- WebExtension Tier 2 (move it to the GUI-05 bridge milestone)
- certificate viewer, protections panel, Picture-in-Picture, translations, toolbar customisation

### Architecture Approach

The two existing packages keep their halves: tab-uris owns the page and chrome-bar owns the bar. No new `@powerbrowser/*` package is needed. Before modes land, the pill moves out of the 1158-line `chrome-bar-widget.tsx` into an `address-bar/` directory with an `AddressBarModeContribution` point.

Patterns:

1. One push name, many kinds, routed by a table.
2. Chrome holds the payload; Theia holds a token.
3. Across the wall, send an enum, not a URL.
4. A chrome element sits over a rect that Theia reports (doorhanger anchor and extension popup only).
5. Stock furniture is installed by id from one installer, checked by a derived `verify-shell-furniture.mjs`.

**Major components:**

1. **`PowerBrowserAPI.sys.mjs`** (large growth). New kinds, the widened push, search/fixup/Places store kinds, `installShellFurniture`, and adoption of chrome-created tabs. New code goes in sections appended at the end of the file.
2. **`powerbrowser.js` and `powerbrowser.xhtml`** (small). The installer runs first. The key table grows. A `<popupset>` holds stock toolkit elements.
3. **`web-tab.ts`, plus new `web-tab-context-menu.ts` and `shortcut-relay.ts`.**
   - the push router (`onPush`)
   - the widened `WebTabState`
   - a find bar inside the widget that shrinks the page rect
4. **chrome-bar UI.** `address-bar/`, `app-menu.ts`, `site-identity.tsx`, `extensions-menu.tsx`.
5. **Gates that grow.**
   - `verify-web-tab-bridge.mjs` gains push-kind parity.
   - `verify-shell-gbrowser-standin.mjs` derives its call sites instead of keeping a list.
   - New: `verify-shortcut-relay.mjs` and `verify-shell-furniture.mjs`, each with `--self-test`.

Groundwork the gap list missed:

- **G9 `webTabActivated`.** Visible is not the same as selected: the dock split shows two tabs at once.
- **G10** push router.
- **G11** catalogue churn.

Corrections to the gap list:

- Page tooltips come from `nsIXULBrowserWindow.showTooltip`.
- `openStockTab` cannot be widened to `about:preferences`, because it loads with a null principal. Use an `openStockPage` enum that calls the stock window's own entry points instead (`openPreferences`, `openAddonsMgr`).

### Critical Pitfalls

1. **`nsIBrowserDOMWindow` vs GUI-01.**
   - The object belongs to the window, and the Theia frame shares that window with the overlays, so the shim must branch on the opener.
   - Move `browser-window-command.ts` onto an actor kind.
   - Set `openWindowInfo`, otherwise `window.opener` is null and OAuth popups break.
   - Keep the GUI-01 live row in the same phase.
2. **Adding to the `gBrowser` stand-in changes upstream code you have not read.** For example, adding `getTabDialogBox` moves every `alert()` onto a different path.
   - Derive `UPSTREAM_CALL_SITES` (58 upstream files touch `gBrowser`).
   - Pass the tabbrowser as an argument where possible.
   - Add each shim global to `FORBIDDEN_PATTERNS`.
   - Never change `windowtype`.
3. **Reserved keys reach no content, and the Theia frame is content.**
   - Reserve only Firefox's unblockable set.
   - Give every other key the reply path plus a check of which browser was the target.
   - Push page focus as a Theia context key.
4. **The security state is wrong.**
   - Compute it chrome-side from `secureBrowserUI.state`, in the same push as `url`.
   - Reset it on every location change.
   - Get the display host and IDN form from `nsIIDNService`.
   - Show no indicator on the Theia frame or on editor tabs.
   - Ship the fullscreen warning together with page fullscreen.
5. **Token cookie and privileged kinds.**
   - Exempt the `127.0.0.1` token cookie from every clear-data and sanitize kind, with a planted-clear check.
   - Decide whether overlay loads to loopback strip it.
   - State-changing kinds run only from widget event handlers, never as command ids.
   - Validate every argument against the overlay's own principal.

Also: settle the overlay z-order layer policy once, in groundwork (Pitfall 8). Clear history must cover the project's own stores (`tabs.sqlite` closed rows and thumbnails, `saved-pages/`, the web-tab history file, shell state). Suggestion hosts get `endpoint-allowlist.json` rows on purpose, not after the gate goes red.

## Disagreements Between the Research Files, and the Pick

**D1. Command-centre mode.**

- **Positions:**
  - STACK and ARCHITECTURE (Anti-Pattern 6): the pill hands its text to `QuickInputService.open(text)`.
  - FEATURES (SMODE-08) and PITFALLS 9: render the `QuickAccessRegistry` `getPicks()` results in `.pb-chrome-bar-dropdown`. Hand off only `@` and `:`, which are monaco-native and have no Theia descriptor.
- **Pick: inline rendering plus the `@`/`:` hand-off.**
  - `.quick-input-widget` is in `BLOCKING_LAYER_SELECTOR`, so the stock widget hides the page while you type.
  - The widget sits centred, not under the pill.
  - Switching inputs loses the text, the caret and IME state.
  - Calling the registry's providers does not reimplement them, so ARCHITECTURE's drift concern does not apply.
  - The hand-off answers STACK's `@`/`:` objection.
- **Fallback:** if the probe fails, use `QuickInputService.open` and accept that the page hides.

**D2. Doorhangers.**

- **Positions:**
  - The gap list and STACK: a `PopupNotifications`-shaped relay to Theia, answered through a `doorhangerAction` kind.
  - ARCHITECTURE 5b: the stock toolkit `PopupNotifications` on a native panel, anchored to a rect Theia reports.
  - PITFALLS 8 and 15: a native panel needs a rule-5 ruling, and BiDi cannot see it.
- **Pick: the stock panel.**
  - A `doorhangerAction {allow}` kind would let an unprivileged frame grant camera or location.
  - The stock panel keeps the clickjacking delay and the focus checks.
  - It does not hide the page that is asking.
  - The constructor reads 4 members of an argument, so `window.gBrowser` does not grow.
- **Verify** on the page side and with KWin screenshots. **Blocked on Q1.**

**D3. Favicons.**

- **Positions:**
  - STACK: `getTabForBrowser` returns a `{linkedBrowser}` record.
  - ARCHITECTURE (Anti-Pattern 3) and PITFALLS 2: never fabricate a tab, because PromptParent, ContextMenuParent and the extension tracker branch on it.
- **Pick: keep `null`.** This is Q6.

**D4. browserDOMWindow when Theia is the opener.**

- **Positions:**
  - ARCHITECTURE: return null. That falls through to the new-window path (`ContentParent.cpp:5506-5509`), which is today's behaviour.
  - PITFALLS 1: a null return cancels the open, so call `openBrowserWindow` explicitly.
- **Pick: ARCHITECTURE's cited fall-through, plus PITFALLS' safeguard:** move `browser-window-command.ts` onto an actor kind in the same phase. Confirm with probe 5.

**D5. alert, confirm, prompt and HTTP auth.**

- **Positions:**
  - STACK and ARCHITECTURE: keep the stock window-modal dialog.
  - PITFALLS 3: that dialog blocks the IDE, so build a tab-scoped relay with a stop-prompting control.
- **Pick: keep the stock dialog after the probe.**
  - A relay needs a fake `TabDialogBox`.
  - It would also flip the path the Theia frame's own `beforeunload` takes.
  - Revisit only if the probe shows the dialog is unusable or that a prompt loop locks the shell.

**D6. Which keys are reserved.**

- **Positions:**
  - ARCHITECTURE G2: Ctrl+L, Ctrl+W, Ctrl+Shift+T, F6, Alt+D and the Ctrl+Tab family.
  - PITFALLS 4: Ctrl+T, W, N, Q, Ctrl+Tab and Ctrl+Shift+T.
- **Pick:** settle it per key in groundwork. F6 uses the reply path, because it is Theia's debug pause. Reserve Ctrl+T and Ctrl+N only with Chris's acceptance (Q8).

**D7. Browser actions as Theia commands.**

- **Positions:**
  - FEATURES SMODE-06: every browser action is a command in a "Browser" category.
  - PITFALLS 7: no command may change privileged state.
- **Pick: split them.** Actions that open UI are commands. Actions that change state run only from that UI's event handlers.

**D8. Phase order.**

- **Positions:** ARCHITECTURE uses A-G. PITFALLS uses P0-P6, with prompts last.
- **Pick:** below follows ARCHITECTURE's dependency order and splits shell furniture by risk.

## Implications for Roadmap

Suggested phases: 9.

### Phase 1: Groundwork, navigation buttons and page-focus shortcuts

**Rationale:** Every later phase adds kinds, pushes and catalogue rows.
**Delivers:**

- G10 router, G9 `webTabActivated`
- G1 widened push, coalesced per tab per frame
- G3 kinds, G11 append rule
- the layer policy
- the shim policy, with derived call sites and the `FORBIDDEN_PATTERNS` additions
- the privileged-kind rule
- live harness: purgecaches launcher, push recorder, page-focus probe
- Stop (one element), hard reload, history menu, Home
- the shortcut relay with Ctrl+T/W/R, Alt+Left/Right, Alt+D, F6, Alt+1-9

**Addresses:** NAV-, KEY-.
**Avoids:** Pitfalls 2, 4, 7, 8, 14, 15.

### Phase 2: Address bar search and fixup

**Delivers:**

- `resolveTypedAddress`: fixup, then `getSubmission`, then the http(s) wall applied to the result
- default engine from `configuration.toml` through `policies.json`, in the first plan
- Switch to Tab, select-all, IME guard, typed text kept per tab
- Alt+Enter and Shift+Enter targets
- row favicons and source, Shift+Del (the first Places write)
- the token-cookie loopback decision
- suggestions behind the privacy decision, with allowlist rows
- new copy reads `applicationName`

**Addresses:** BAR-.
**Avoids:** Pitfalls 6, 10, 11, 13.

### Phase 3: Address-bar modes dropdown and command centre

**Delivers:**

- the pill split and `AddressBarModeContribution`
- SMODE-01..08
- Command centre rendered inline, with the `@`/`:` hand-off (D1)
- Ctrl+K

**Avoids:** Pitfall 9. A gate checks that Command centre mode never calls suggestions.

### Phase 4: Site identity, permissions panel and app menu

**Delivers:**

- `securityState`, "Not Secure", display host and IDN, trimming
- the `openStockPage` enum
- the hamburger menu in every mode, and Quit
- the site info and permissions panel, keyed by the overlay's principal
- clear site data, with the cookie exemption
- the tracking shield

**Addresses:** SITE-, MENU-.
**Avoids:** Pitfalls 5, 6, 7.

### Phase 5: Page tools and bookmarks

**Delivers:**

- find (a bar that shrinks the rect)
- zoom (guarding overlay geometry)
- print (system dialog)
- mute and the audible push
- window fullscreen
- downloads, after its probe
- star, Ctrl+D and the bookmark editor, refreshed by a Places observer push
- reopen closed tab
- one `clearHistory` kind that fans out to every store
- the bookmarks toolbar

**Addresses:** PAGE-, BMK-.
**Avoids:** Pitfall 11 and the moderate pitfalls.

### Phase 6: Low-risk shell furniture and the page context menu

**Delivers:**

- `installShellFurniture`
- `nsIXULBrowserWindow` (tooltips, link-hover status)
- `PopupAutoComplete` and the `autocompletepopup` attribute
- the `FullScreen` stand-in, with the warning
- the context menu: `nsContextMenu` stub, hidden `contentAreaContextMenu`, a token push, Theia `WEB_TAB_CONTEXT_MENU`, `disablecontextmenu` on the Theia frame
- the G4b freeze-frame spike
- `verify-shell-furniture.mjs`

**Avoids:** Pitfalls 2, 3, 14.

### Phase 7: New-window links as web tabs

**Rationale:** The only phase that can regress GUI-01, so it lands on its own.
**Delivers:**

- `browserDOMWindow` with opener branching, and `openLinkIn`
- pending overlays created chrome-first with `openWindowInfo`
- adoption, with a 5 s fallback to the stock window
- the new tab opens next to its opener; closing it reselects the opener
- `browser-window-command.ts` moved to an actor kind

**Avoids:** Pitfall 1.

### Phase 8: Permission prompts and dialogs

**Delivers:**

- stock `PopupNotifications` on a native panel, with a `windowAnchors` rect (D2, needs Q1)
- `updateBrowserSharing` and the sharing indicator
- requests from background tabs queue until the tab is shown
- a dialog probe; keep the stock dialog (D5)
- WebRTC device pickers and password save as a spike (may defer)

**Avoids:** Pitfalls 3 and 7, Anti-Pattern 1.

### Phase 9: Extensions (Tier 1)

**Delivers:**

- a Theia puzzle menu: icon, name and badge read chrome-side; Manage; Options
- extension actions run in the stock window
- with an overlay active, the action refuses with plain copy instead of acting on the wrong tab

**Addresses:** EXT-04+.
**Avoids:** Pitfall 12.

### Phase Ordering Rationale

- Phase 1 comes first.
- Phase 2 comes before 3, because modes need the engines and the heuristic row.
- Phase 4 comes before 5, because the menu hosts the page-tool entries.
- Phases 6-8 depend only on G9 and the popover primitive. They are serialised anyway, because they all edit `PowerBrowserAPI.sys.mjs` (catalogue churn, and other sessions commit on main).
- Tab-strip rows are not placed until Q7 is answered.

### Research Flags

**Need `/gsd-plan-phase --research-phase`:**

- Phase 3: `getPicks` outside the widget.
- Phase 7: the adoption lifecycle and the GUI-01 design.
- Phase 8: including `popup-notifications.inc.xhtml`, and the WebRTC and password templates.
- Phase 9: run `/gsd-spike` first.
- Phase 5, partly: downloads and print probes.

**Standard patterns:** Phases 1, 2 and 4.

## Live Probes Required Before Plans Depend on Them

Each probe runs with `-purgecaches` and asserts a positive outcome on the page side.

1. **alert, confirm, prompt, beforeunload and HTTP auth today.** Does the window-modal dialog appear? Is it usable on KDE Wayland? Does it block the IDE? (Phase 8)
2. **Permission requests today.** Are they silently denied (`Notification.permission`, the geolocation error)? (Phase 8)
3. **Right-click in an overlay today.** Does ContextMenuParent throw? Does it also fire for the Theia frame? (Phase 6)
4. **Overlay-initiated downloads today.** Do they save silently (a drive-by exposure that must be fixed first), open a stock panel, or do nothing? (Phase 5)
5. **`window.open`.**
   - A Theia-frame `window.open` with the shim returning null still opens a stock window.
   - A page `window.open` gives a web tab with a working `window.opener`.
   - A `'popup'` features string stays a window.

   (Phase 7)
6. **Print.** `window.print()` and `webTabPrint` through `OPEN_PRINT_BROWSER`. Headless runs use the PDF path. (Phase 5)
7. **`QuickAccessRegistry.getPicks` called from the chrome bar.** Check the picks for each prefix and that `execute()` works. If the D1 fallback is taken, also check that the quick input can be placed under the pill. (Phase 3)
8. **G4b freeze-frame latency.** (Phase 6)
9. **Edit commands into a focused overlay through `commandDispatcher`.** (Phase 5)
10. **WebExtension content scripts in overlays,** and what `tabs.query` returns while an overlay is visible. (Phase 9)
11. **`SearchService`** initialisation without a stock window, and fixup keyword lookup before init. (Phase 2)
12. **The page clipboard paste popup.** (Phase 6)
13. **The token cookie.** Is it sent to `127.0.0.1:<other port>`? Does Clear Site Data on a localhost tab disconnect the IDE? (Phases 2 and 4)

## Open Questions for Chris

1. **Rule 5.** May `powerbrowser.xhtml` carry stock toolkit popups with stock strings and no authored layout (`notification-popup`, `PopupAutoComplete`, `remoteBrowserTooltip`, the `contentAreaContextMenu` stub)? Upstream's `webext-panels.xhtml` carries the same set. Blocks Phases 6 and 8.
2. **Extensions tier.** Choose one:
   - Tier 1 (puzzle menu; actions run in the stock window) in v1.5, and Tier 2 in the GUI-05 bridge milestone, or
   - Tier 1b (popups hosted in the shell; their `tabs.query` answers with the stock window's tab).
3. **Modes dropdown defaults.**
   - Coding = Command centre (already ruled).
   - Browsing = Address (proposed).
   - Organising = Tabs (recommended) or Address?
   - Coding with a web tab active: keep Command centre (assumed) or switch to Address?
4. **Search suggestions.**
   - Off by default (proposed), or on?
   - If on, which suggest hosts get endpoint-allowlist rows?
   - Should the default engine and engine set come from `configuration.toml` through `policies.json` `SearchEngines`?
5. **Token cookie on `127.0.0.1` overlays.**
   - Strip it on overlay loads to other loopback ports?
   - Exempt it by name from clear-data, or re-mint it on 403?
   - Record the answer as a threat-model entry.
6. **`getTabForBrowser` for favicons.** Keep `null` and accept partial favicons (recommended), or allow a non-null record after a per-reader audit?
7. **Tab-strip rows** (context menu, reorder, middle-click close, overflow, pin, multiselect, hover card): in v1.5 or out?
8. **Reserved-key overrides.** Accept losing Theia's own Ctrl+T, Ctrl+N and Ctrl+Q while Theia has focus, key by key, or use the reply path?
9. **Clipboard URL suggestion.** Off, or URL-only on an explicit gesture?
10. **Existing hard-coded "PowerBrowser" literals in chrome-bar copy.** Fix them in v1.5, or record them as debt? New copy reads `applicationName` either way.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every module was read at the pinned tags. Runtime behaviour is MEDIUM. |
| Features | HIGH/MEDIUM | Firefox and Theia behaviour come from source. VS Code behaviour and the complexity sizes are MEDIUM. |
| Architecture | HIGH/MEDIUM/LOW | Gecko and tree claims are HIGH. QuickInput and the extension popup host are MEDIUM. The freeze-frame latency is LOW. |
| Pitfalls | HIGH | Verified against `upstream/` and the tree. Items that need a live run are marked. |

**Overall confidence:** HIGH for what to build and where. MEDIUM for how each feature behaves today, until the probes run.

### Gaps to Address

- **Favicons:** no clean upstream path while `getTabForBrowser` returns null (Q6).
- **Edit commands:** routing into a remote overlay was not traced.
- **WebRTC pickers and password save:** they need the `browser.xhtml` DOM templates and may slip out of v1.5.
- **Verification blind spot:** BiDi cannot see XUL panels, doorhangers, the findbar or autocomplete. Those rows will defer to Chris unless each phase adds scripted page-side checks as rows in `scripts/verify-platform.sh`.
- **Boundary guard:** confirm its conditional-import rule accepts the new `moz-src:` imports.

## Sources

### Primary (HIGH)

- **`upstream/` at `FIREFOX_153_5_0esr_BUILD1`:**
  - urlbar and search modules, URIFixup, Places
  - PermissionUI, PopupNotifications
  - actors: Prompt, ContextMenu, ClickHandler, LinkHandler, WebRTC, DOMFullscreen
  - `ContentParent.cpp`, `nsFrameLoader.cpp`, `nsWindowWatcher.cpp`, `GlobalKeyListener.cpp`
  - the extension parents
  - Sanitizer, SitePermissions, SiteDataManager, printing, Policies
- **`theia/node_modules/@theia/*` 1.76.0:** quick access and quick input, file-search, monaco quick-access registry, menus, dialogs, hover, context keys, the keybinding clashes.
- **This tree at `d353a94`:**
  - `PowerBrowserAPI.sys.mjs`, `powerbrowser.js`, `powerbrowser.xhtml`
  - `INTERNAL-APIS.md`, `endpoint-allowlist.json`
  - `web-tab.ts`, `chrome-bar-widget.tsx`, `layout-controls-widget.tsx`
  - the verify-* scripts and `check-internals-boundary.sh`

### Secondary (MEDIUM)

- `chrome-bar-firefox-gap.md`. Its line numbers were not re-checked, but ARCHITECTURE re-read every line it relies on.
- VS Code 1.69 release notes and UI docs.
- `GUI-DEFECTS.md` and v1.4 24-GAPS.

### Tertiary (LOW)

- The Linux Mint Firefox branding test case (PITFALLS 10).

---
*Research completed: 2026-10-20*
*Ready for roadmap: yes. Q1 blocks Phases 6 and 8; Q2 blocks Phase 9.*
