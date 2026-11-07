# Phase 35: Shell Furniture and Page Context Menu - Research

**Researched:** 2026-10-22
**Domain:** Gecko chrome-window furniture for overlay `<xul:browser>` web tabs (ContextMenu,
form autocomplete, tooltips, link status, fullscreen) driven from a non-`browser.xhtml` shell
window, plus the Theia rendering layer
**Confidence:** HIGH for every in-tree and upstream source path cited below (read this session at
the pinned ESR tag and the working tree). MEDIUM for runtime behaviour that only a live run can
confirm (listed in Assumptions Log and the Validation Architecture).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Firefox keys that clash with Theia keys take the browser meaning only while a web page has
  focus (2026-10-20 ruling; F11 follows the Phase 27 page-focus key mechanism, D-07).
- Stock Firefox toolkit popups with stock strings in `powerbrowser.xhtml` are shell furniture,
  not authored chrome (rule 5 clarification, 2026-10-20; D-01 one-installer shape).
- Chrome-bar copy reads the configured application name, never a hard-coded brand.
- `windowtype` never changes (`powerbrowser:main`).
- Every new `gBrowser` member or shim global follows the Phase 27 policy.
- 28 sign-off binds: FormValidationParent/AboutReaderParent go ahead with the host's
  `selectedBrowser`; `contentAreaContextMenu` carries EXT-08; no `tabContainer` member.
- D-02 page menu is Theia-rendered from the `nsContextMenu` shim capture (stub `contentAreaContextMenu`, popupshowing cancelled) via `ContextMenuRenderer`.
- D-03 form autocomplete is the stock `PopupAutoComplete` panel (`type="autocomplete-richlistbox"`) plus `autocompletepopup` on every overlay.
- D-04 remote tooltips and link status go through a shell `XULBrowserWindow` on the AppWindow; tooltips use the stock `remoteBrowserTooltip`; link status is a Theia in-bar line.
- D-05 fullscreen ships both halves with the stock warning: `FullScreen`/`PointerlockFsWarning` stand-ins, stock markup, `browser.ftl`, stock stylesheet; Esc exits element fullscreen; F11 runs Phase 33's command and the top panel stays.
- D-06 menu actions run with the page principal under the http(s) wall; `disablecontextmenu` on the Theia frame.
- D-08 G4b is the freeze-frame: a still under the menu when the capture makes 50 ms; 200 ms p95 menu budget.
- D-09 privileged menu actions are event-handler-only, no command ids.
- D-10 window-modal fallback stays for the Theia frame itself.
- D-11..D-19 (revision): tabContainer ruling restated, the D-12 row set, Inspect route, the
  validation bubble, the paste popup's localization, EXT-08 carriage, T-27-11 and shim coverage in
  the stand-in gate, seven sequential plans, no menu during element fullscreen.

### Claude's Discretion
MenuPath ids, push field names, XUL element ids, file splits, plant and scenario names, and the
status-line slot within UI-SPEC rule (c).

### Deferred Ideas (OUT OF SCOPE)
Permission doorhangers/dialogs (37), new-window-as-tab (36), favicons display (32),
toolbar buttons/puzzle menu (38), screenshot/translations/PiP/page-info/unload (out of v1.5).
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Furniture receivers + installer (`installShellFurniture`) | Gecko chrome window (shell) | — | Actors address `browser.documentGlobal` window furniture; only the chrome window can host it |
| Actor message validation, principal derivation, http(s) wall | `PowerBrowserAPI.sys.mjs` boundary | — | Hard rule 2: every Firefox internal is reached only through the one file |
| Page menu rendering + menu actions | Theia frontend (`@powerbrowser/chrome-bar`) | — | BiDi-visible, themeable, reuses the Phase 27 menu pattern |
| Autocomplete popup, validation bubble, tooltip element, context-menu stub, fullscreen warning | Stock markup in `powerbrowser.xhtml` | — | Must paint over the overlay (or be read by an actor); Theia DOM is composited underneath |
| Shim globals (`XULBrowserWindow`, `nsContextMenu`, `FullScreen`, `PointerlockFsWarning`) | `PowerBrowserAPI.sys.mjs` boundary | — | Gecko and actor parents read them on the window; hard rule 2 |
| Link-status line, fullscreen state collapse | Theia frontend | chrome push | In-bar line keeps the page rect clear; collapse follows the pushed state |
| Checks (furniture derive-compare, menu self-test, live page-side assertions) | `scripts/` + `verify-platform.sh` registry | — | One driver; derive-and-compare; planted faults |

</architectural_responsibility_map>

<research_summary>
## Summary

**Revised 2026-10-22 (planner revision; checker findings B1-B5, W1-W7).** Every mechanism in this
file was re-read at `FIREFOX_153_5_0esr_BUILD1` and in the tree at `3e8d991`; the earlier draft
named three receivers that do not exist in Gecko (an observable ContextMenuParent message, a
`<tooltip page="true">` serving remote content, a `window.nsIXULBrowserWindow` global) and is
superseded where it differs from what follows.

Every Phase 35 behaviour is already started by stock Firefox code and dies at missing furniture.
Overlay web tabs carry `messagemanagergroup="browsers"` and `remote="true"`, so ContextMenuParent,
the AutoComplete parents (FormHistory, LoginManager), FormValidationParent, DOMFullscreenParent,
ClipboardContextMenu and Gecko's own tooltip and link-status IPC all reach the shell window. Each
then reads furniture that exists only in `browser.xhtml` or its scripts:

| Consumer | What it reads | Today in the shell | Phase 35 receiver |
|----------|---------------|--------------------|-------------------|
| ContextMenuParent (`ContextMenuParent.sys.mjs:27-47, 190-256`) | `win.nsContextMenu` (else the null `chromeEventHandler` of a top window, a TypeError), then `getElementById("contentAreaContextMenu").openPopupAtScreen` | throws on every right-click; also fires for the Theia frame (no `messageManagerGroups`, `DesktopActorRegistry.sys.mjs:416-429`) | `window.nsContextMenu` shim + empty stub menupopup with `popupshowing` cancelled; `disablecontextmenu` on the Theia frame (D-02, D-06) |
| BrowserParent `RecvShowTooltip`/`RecvHideTooltip`/`RecvSetLinkStatus` (`BrowserParent.cpp:2520-2566`), nsContentTreeOwner (`:298-309`) | the AppWindow's `nsIXULBrowserWindow` (`GetXULBrowserWindow`, `:512-536`, looked up per call) | null: no tooltips, no link status | `window.XULBrowserWindow` registered as `browser-init.js:255-258`; `remoteBrowserTooltip` (`main-popupset.inc.xhtml:151`) (D-04) |
| AutoCompleteParent (`AutoCompleteParent.sys.mjs:212-224, 367-371`) | `browser.autoCompletePopup` = `getElementById(browser.getAttribute("autocompletepopup"))` (`browser-custom-element.mjs:491-492`) | overlays carry no attribute: the popup closes silently | `PopupAutoComplete` panel (`main-popupset.inc.xhtml:173-182`) + attribute in `webTabOpen` (`tabbrowser.js:2771`) (D-03) |
| FormValidationParent (`FormValidationParent.sys.mjs:86-93, 195-208`) | `gBrowser.selectedBrowser`, then `invalidFormTemplate` / `invalid-form-popup` | returns early today (stand-in has no `selectedBrowser`); throws once 31.1 adds it | upstream template + panel (`main-popupset.inc.xhtml:221-226`) (D-14) |
| DOMFullscreenParent (`DOMFullscreenParent.sys.mjs:28-43, 133-213, 253-291`) | `window.FullScreen.enterDomFullscreen/cleanupDomFullscreen`, `window.PointerlockFsWarning.showFullScreen/close`, the `inDOMFullscreen` root attribute | TypeError: element fullscreen never completes | stand-ins ported from `browser-fullScreenAndPointerLock.js`, stock `#fullscreen-warning` markup, `browser/browser.ftl`, the stock stylesheet (D-05) |
| ClipboardContextMenu (`ClipboardContextMenu.sys.mjs:84-180`) | creates `#clipboardReadPasteMenuPopup` itself, labels it through `document.l10n` (`:162`) | the shell has no `document.l10n`: `readText()` rejects | `<link rel="localization" href="toolkit/global/textActions.ftl"/>` (D-15, research probe 12) |
| ext-menus (`ext-menus.js:51-60, 188-201, 560-572, 1047-1050`) | an `on-build-contextmenu` subject whose `menu` it fills | never notified | stock subject shape from `nsContextMenu.sys.mjs:147-180`, menu = the stub (D-16) |

The work is one installer plus thin receivers, no Gecko patch: `PowerBrowserAPI.installShellFurniture(window)`
(a delegating member of the frozen `PowerBrowserAPI` literal, `:389`) calling an end-of-file Phase
35 section. The two load-bearing constraints are the layer policy (a Theia menu hides the page
while open; Theia DOM can never draw over a page or over the fullscreen top layer) and
verification blindness (BiDi cannot see XUL panels, so XUL-resident behaviour is asserted
page-side or in chrome scope). The built binary reads `powerbrowser/shell/*` through symlinks
(`objdir/dist/bin/.../powerbrowser.xhtml` → `upstream/powerbrowser/shell/` → `../powerbrowser`),
so no file in this phase needs a Gecko rebuild; a new file under `powerbrowser/shell/` would.

**Primary recommendation:** seven sequential plans (CONTEXT D-18): the stand-in gate first
(T-27-11 plus shim coverage, so every shim is checked in the plan that creates it), then the
tooltip/status tracer that creates the installer, the furniture gate and the live harness, then
the page menu in three plans, forms, and fullscreen last.
</research_summary>

<standard_stack>
## Standard Stack

The established libraries/tools for this domain (all pinned; nothing moves this milestone):

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Gecko / Firefox ESR | `FIREFOX_153_5_0esr_BUILD1` | The actors and IPC above, `Localization`, `Downloads`, `DevToolsShim`, `InlineSpellCheckerUI`, `BrowserUtils`, `BrowserUIUtils` | Already pinned and built in v1.4; every consumer above was read at this tag |
| Eclipse Theia | 1.76.0 (`@theia/core` `ContextMenuRenderer`, `CompoundMenuNode`, `.lm-Menu`, `FileDialogService`) | Page menu rendering, status line, save dialogs | Already composed; `openHistoryMenu` (`chrome-bar-widget.tsx:334`) is the exact pattern |
| `PowerBrowserAPI.sys.mjs` | in tree (one boundary) | Installer, shims, validation, pushes | Hard rule 2; end-of-file section convention; `--fix` renumber workflow |
| `powerbrowser.js` + `powerbrowser.xhtml` | in tree (shell window) | Installer call site, F11 key row; stock furniture host | `windowtype` unchanged; CSP `default-src chrome:` allows `chrome:` stylesheets and Fluent links |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `scripts/lib/pb-live-probe.mjs` | in tree (Phase 27) | `-purgecaches` launch, push recorder, fire recorder, chrome-scope key synthesis | Every live scenario in this phase |
| `scripts/verify-shell-gbrowser-standin.mjs` | in tree (Phase 27) | Derived member comparison | Grows the registry scope and the shim comparison (35-01) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Theia-rendered context menu from the shim | Native XUL `contentAreaContextMenu` with upstream's markup and `nsContextMenu.sys.mjs` | Draws over the page, but `nsContextMenu` reaches `gBrowser`, `gURLBar` and dozens of browser.xhtml ids, and BiDi cannot see it; rejected per D-02 |
| Loading `browser-fullScreenAndPointerLock.js` | Ported stand-ins | The script reaches `gIdentityHandler`, `gNavToolbox`, `gURLBar`, `PopupNotifications`, `gXPInstallObserver`; "never load a browser.xhtml script" (ROADMAP Phase 32 notes); rejected per D-05 |
| `<tooltip page="true">` (aHTMLTooltip) | `remoteBrowserTooltip` + XULBrowserWindow | aHTMLTooltip serves non-remote browsers only; every shell browser is remote (D-04) |
| Stock `statuspanel` | In-bar status line | Needs browser.xhtml layout around overlays; rule (c) is met in the bar (D-04) |
| A new chrome file with `jar.mn` row | Inline furniture in `powerbrowser.xhtml` | A new chrome file needs a Gecko rebuild |

**Installation:** none — no new npm package, no new system dependency.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
page right-click / hover / field focus / submit / readText / F11 / video fullscreen
  → overlay <xul:browser remote messagemanagergroup="browsers" autocompletepopup>
  → stock parent code reads shell furniture, installed by PowerBrowserAPI.installShellFurniture(window):
      ContextMenuParent → window.nsContextMenu.contentData (captured) → stub popupshowing (cancelled)
        → rows (PAGE_MENU_ROWS, upstream ids + Firefox strings) [+ on-build-contextmenu extension items]
        → [G4b still ≤50 ms] push pageStill → push pageContextMenu → Theia .lm-Menu
        → pick: webTabContextMenuAction (privileged, single-use) → chrome row | frontend row
          (open rows: grant → openInBackground → webTabOpen{grant} with page principal + referrer)
      BrowserParent tooltip/link IPC → AppWindow.XULBrowserWindow
        → showTooltip (overlays only) → remoteBrowserTooltip
        → setOverLink (source = hovered/focused overlay) → push overLink → in-bar status line
      AutoCompleteParent → PopupAutoComplete; FormValidationParent → invalid-form-popup
      ClipboardContextMenu → #clipboardReadPasteMenuPopup (document.l10n via textActions.ftl)
      DOMFullscreenParent → window.FullScreen / window.PointerlockFsWarning (ported)
        → :fullscreen top layer + #fullscreen-warning; Esc / exit button / tab switch leave
  F11 (page focus) → PAGE_KEYS row → shortcut push → Phase 33 chrome-bar.full-screen → window.fullScreen
```

### Recommended Project Structure

```
powerbrowser/shell/
  powerbrowser.xhtml          # furniture block: remoteBrowserTooltip, contentAreaContextMenu stub,
                              # PopupAutoComplete, invalidFormTemplate, fullscreen-warning; textActions.ftl,
                              # browser.ftl, warning stylesheet; disablecontextmenu on the Theia frame
  powerbrowser.js             # installShellFurniture call; F11 PAGE_KEYS row
  PowerBrowserAPI.sys.mjs     # installShellFurniture member; end-of-file Phase 35 section;
                              # in place: webTabOpen (attribute, grant), webTabGeometry (fullscreen exit),
                              # WEB_TAB_ACTION_KINDS + handleWebTabAction arm
theia/extensions/chrome-bar/src/browser/
  page-context-menu.ts        # NEW: PAGE_CONTEXT_MENU_PATH, push subscriber, frontend rows, pick/dismiss
  chrome-bar-widget.tsx       # status line (onPush('overLink'))
  chrome-bar-shortcuts.ts     # F11 row + relay action
  chrome-bar-copy.ts, chrome-bar.css, chrome-bar-frontend-module.ts
theia/extensions/tab-uris/src/browser/
  web-tab.ts, web-tab.css     # union members, grant option, pageStill still
scripts/
  verify-shell-furniture.mjs      # NEW (35-02), grows in every plan
  verify-page-furniture-live.mjs  # NEW (35-02), grows in every plan
  verify-shell-gbrowser-standin.mjs, check-internals-boundary.sh, verify-web-tab-bridge.mjs,
  verify-shell-error-copy.mjs, verify-shortcut-relay.mjs, verify-page-tools-edit.mjs, verify-platform.sh
```

### Pattern 1: One installer, one section
`PowerBrowserAPI.installShellFurniture(window)` is one member appended to the frozen literal; it
calls `installShellFurnitureReceivers(window)` in the end-of-file `// Phase 35: shell furniture.`
section (own lazy-getter block, the Phase 29 precedent). Each receiver names its upstream consumer
with file:line in a comment, so an ESR rebase that renames a member fails a derived gate by name.

### Pattern 2: Shims are object literals the stand-in gate compares (D-17)
`window.nsContextMenu`, `window.XULBrowserWindow`, `window.FullScreen` and
`window.PointerlockFsWarning` are `window.<Name> = { ... }` literals in the boundary file whose
members are exactly what upstream calls (actor parents from both registries, the IDL for
`XULBrowserWindow`); helpers are module functions, never members. Their names are in
`FORBIDDEN_PATTERNS`; their definition lines are catalogued.

### Pattern 3: Capture, cancel, re-render (D-02, D-06, D-09)
The `nsContextMenu.contentData` setter keeps data only for a visible overlay; the stub's
`popupshowing` is always cancelled; chrome builds rows, focuses the Theia frame and pushes; picks
come back as `webTabContextMenuAction {tabId, menuId, itemId[, path]}`, classified privileged and
fenced to `page-context-menu.ts`; every target is read from the captured data; open rows mint a
5 s single-use grant `webTabOpen` consumes.

### Pattern 4: Stock XUL where Theia DOM cannot paint (D-03, D-04, D-14, D-15)
Furniture elements are upstream's start tags verbatim inside a marked furniture block, compared
attribute-for-attribute with upstream by `verify-shell-furniture.mjs`; nothing in Theia observes
them; live checks assert in chrome scope (`state`, `label`) and page-side (values, promises).

### Pattern 5: Fullscreen as the top layer (D-05, D-07, D-19)
`remoteFrameFullscreenChanged` makes the overlay the chrome document's fullscreen element, so
`:fullscreen` UA styles cover the window and the popover warning sits above it; no rect is
written. The stand-ins port the message routing; leaving visibility exits; no page menu opens
during element fullscreen.

### Pattern 6: The furniture gate (derive and compare)
`verify-shell-furniture.mjs` rules, each with a planted fault: (1) furniture ids = ids the section,
the overlay attribute and upstream actor parents wire; (2) start-tag parity with upstream (subtree
for the warning and the template); (3) one installer, one call; (4) policy (windowtype, no
PopupNotifications or tabContainer in the section, status class outside the blocking selector);
(5) row ids and strings exist upstream; (6) chrome rows = dispatcher arms, frontend rows =
frontend handlers; (7) `disablecontextmenu` on the Theia frame; (8) on-build-contextmenu subject
keys = upstream's; (9) overlay `autocompletepopup` = the autocomplete panel id; (10) localization
links resolve and cover every furniture string; (11) `inDOMFullscreen` set and removed; (12) the F11
row matches `key_enterFullScreen` (Linux) and is unreserved. Upstream `.inc.xhtml` files are
preprocessor input: `#` lines are dropped and `#ifdef`/`#ifndef` are evaluated for a Linux
release build, as `verify-shortcut-relay.mjs` does.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Page menu labels | Hand-typed English labels | `browserContext.ftl` / `textActions.ftl` through `Localization`, `browser.properties` `contextMenuSearch` | Firefox's strings, localised, checked against upstream by the gate |
| Row ids and order | An invented list | upstream `browser-context.inc.xhtml` ids, D-12's subset | The gate derives them; a rebase rename goes red |
| Autocomplete matching | Theia-side ranking | Stock `PopupAutoComplete` driven by the actors | Matching and logins live in FormHistory/LoginManager |
| Tooltip placement | Theia hover over pages | `remoteBrowserTooltip` through XULBrowserWindow | Theia hovers paint under overlays (Pitfall 8) |
| Fullscreen warning | Custom copy or layout | Stock markup, `browser.ftl`, the stock stylesheet | Custom text would be authored chrome |
| Fullscreen messaging | A new protocol | Port of `browser-fullScreenAndPointerLock.js` routing | Fission frame chains need the upstream walk |
| Edit, view-source, devtools, save page | Second paths | Phase 32's `edit(cmd)`, `webTabViewSource`, `webTabDevtools`, `savePage()` | One mechanism per job |
| Downloads | Writing files directly | `Downloads.createDownload` into the public list | Phase 32's panel lists it; no silent save |
| Geometry in fullscreen | A rect writer | `:fullscreen` top layer | Two writers desync on exit |
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

| Pitfall | How to Avoid |
|---------|--------------|
| Expecting to observe ContextMenuParent's message from outside | Define the `nsContextMenu` shim the actor reads (D-02) |
| `<tooltip page="true">` for remote content | Remote tooltips go through `XULBrowserWindow.showTooltip` and `remoteBrowserTooltip` (D-04) |
| A `window.nsIXULBrowserWindow` global | Nothing reads it; register on the AppWindow (`browser-init.js:255-258`) |
| `setOverLink` attributed to the Theia frame | It carries no browser; source = hovered or focused overlay; empty url always clears |
| Context menu acts on the wrong tab | Push carries the chrome-derived tab id; the frontend resolves `widgetOf(tabId)` only; hidden tabs never capture |
| Menu action with a page-chosen URL | Targets read from captured data; grants for open rows; http(s) wall + `checkLoadURIWithPrincipal` |
| A privileged webTab kind callable from anywhere | Classed privileged with an owner-file fence; single-use menu id |
| Page menu inside the IDE | `disablecontextmenu` on the Theia frame + the setter's overlay check |
| A wrong popup tag | `<xul:panel is="autocomplete-richlistbox-popup" type="autocomplete-richlistbox">`, parity-checked (W6) |
| FormValidation throws once 31.1 lands | Ship `invalidFormTemplate` (D-14) |
| Paste popup throws | Give the shell `document.l10n` (D-15) |
| Fullscreen without warning | Warning in the same plan as the stand-ins; `warning-removed` plant |
| A stand-in member upstream does not call | DEAD SURFACE in the stand-in gate; helpers stay module functions |
| `FullScreen` in `powerbrowser.js` | The F11 row omits the `firefox` column; checked by the furniture gate instead |
| The relay gate bans F11 | Narrow rule 6 for the page-scoped `fullscreen` row only |
| Menu over a fullscreen page | No menu during element fullscreen (D-19) |
| Live run without purge | `withProbeShell` sets `MOZ_PURGE_CACHES=1`; scenarios require the line |
| Absence assertions over self-emitted lines | `CONTROL_OF`: each absence is scored only after its positive control passed in the same session |
| Plants that edit the tree under a running binary | Plants are runtime mutations (chrome scope, Theia frame, prefs) in their own session |
</common_pitfalls>

<code_examples>
## Code Examples

Shapes only; the plans hold the full instructions.

### Installer
```js
// in the frozen PowerBrowserAPI literal (last member):
installShellFurniture(window) { installShellFurnitureReceivers(window); },

// end of file:
// Phase 35: shell furniture.
function installShellFurnitureReceivers(window) {
  installTooltipsAndLinkStatus(window); // BrowserParent.cpp:2520-2566 via the AppWindow (35-02)
  installPageContextMenu(window);       // ContextMenuParent.sys.mjs:27-256 (35-03..35-05)
  // 35-06 adds no receiver: the autocomplete, validation and paste furniture is markup
  installFullscreenStandIns(window);    // DOMFullscreenParent.sys.mjs:28-291 (35-07)
}
```

### XULBrowserWindow registration (browser-init.js:255-258)
```js
window.XULBrowserWindow = {
  QueryInterface: ChromeUtils.generateQI(["nsIXULBrowserWindow"]),
  setOverLink(url) { /* overlay source only; empty url clears */ },
  showTooltip(x, y, text, direction, browser) { /* overlays only, remoteBrowserTooltip */ },
  hideTooltip() { /* remoteBrowserTooltip.hidePopup() */ },
};
window.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor)
  .getInterface(Ci.nsIAppWindow).XULBrowserWindow = window.XULBrowserWindow;
```

### nsContextMenu shim (ContextMenuParent.sys.mjs:190, 219)
```js
window.nsContextMenu = {
  get contentData() { return captured; },
  set contentData(data) { captured = keepIfVisibleOverlay(data); },
};
```

### F11 row (no `firefox` column; D-07)
```js
{ id: "fullscreen", keycode: "VK_F11", modifiers: "", reserved: false, landsInTheia: false },
```
</code_examples>

<assumptions_log>
## Assumptions Log

Each item is a live assertion in a named plan, never a silent premise.

- **Probe 35-1 (context fields):** the fields ContextMenuChild sends (`ContextMenuChild.sys.mjs:800-1272`) reach the shim; recorded per target class in 35-03's SUMMARY.
- **Probe 35-2 (autocomplete element):** the `PopupAutoComplete` panel upgrades to `autocomplete-richlistbox-popup` in the shell (customElements.js loads it eagerly) and opens under the field: 35-06 `autocomplete`.
- **Probe 35-3 = ROADMAP probe 8 (G4b):** measured in 35-05 `freeze-frame` against D-08's budgets.
- **Probe 35-4 (fullscreen warning):** the warning opens with the domain and Esc exits: 35-07 `element-fullscreen`.
- **Probe 35-5 (F11 key id):** `key_enterFullScreen`, Linux branch, `browser-sets.inc.xhtml:235`, unreserved: read statically by furniture rule 12.
- **Probe 35-6 (status geometry):** the status line never intersects the page rect in any mode: 35-02 `tooltip-status`.
- **ROADMAP probe 3 (right-click today):** answered statically: ContextMenuParent throws (null `chromeEventHandler`, `:39-41`) and fires for the Theia frame too (no `messageManagerGroups`); 35-03's live scenarios assert the fixed behaviour.
- **ROADMAP probe 12 (paste popup):** answered statically (no `document.l10n`, `ClipboardContextMenu.sys.mjs:162`) and live in 35-06 `paste-popup`.
- **Fluent links under the shell CSP:** `<link rel="localization">` resources are resolved by the localization registry, not fetched by the document; proven by the translated labels the live checks read (35-06, 35-07).
</assumptions_log>

<assumes_from_earlier_phases>
## Assumes from Earlier Phases

Every PLAN.md carries its own "Assumes from earlier phases" list with the symbols it uses. A missing
dependency is a blocker the executor reports; no plan re-implements another phase's work. The
union, at planning time (Phase 31 is being executed concurrently; Phase 31-01 landed after
`3e8d991`):

- **Phase 31:** `PowerBrowserAPI.webTabIdentity(browser, pageSpec)` (31-01; the warning's
  `data-identity`, 35-07); the `openStockPage` kind (31-04) behind Phase 32's devtools route.
- **Phase 31.1:** patch 050 and the tab host (31.1-01, 31.1-02): `getTabForBrowser` returns overlay
  tab nodes, `selectedBrowser` is the active overlay, the shell is extension-tracked, and the
  rewritten stand-in gate. **Conflict:** the 31.1-02 draft also claims T-27-11; CONTEXT D-17 keeps it
  in 35-01.
- **Phase 32:** `WebTabWidget.edit(cmd)` with its frozen set and `verify-page-tools-edit.mjs` (32-06);
  `WebTabWidget.savePage()` (32-05); the chrome functions behind `webTabViewSource` and
  `webTabDevtools` and the view-source widget method (32-07); the downloads panel over
  `Downloads.PUBLIC` (32-04); 32-03's narrowing of the relay gate's rule 6 for Ctrl+P.
- **Phase 33:** `chrome-bar.bookmark-page` (33-02); `chrome-bar.full-screen` and its `fullScreen`
  store kind (33-05, D-14 there).
- **Phase 34:** nothing called; `openInBackground`'s after-opener placement (NAV-06, in the tree) is
  what Phase 34's strip mirrors.
- **In the tree (Phases 27, 29, 30):** `PAGE_KEYS` and the relay, `WebTabChannel.onPush`/`widgetOf`,
  the layer policy, `barEngine`/`engineSearch`, the `address-bar/` pill.
</assumes_from_earlier_phases>

<validation_architecture>
## Validation Architecture

Proof tiers: **S** static gate (`--quick` + `--self-test`); **L** live binary with
`MOZ_PURGE_CACHES=1`, push and fire recorders, chrome-scope reads and key synthesis.

- **S:** `verify-shell-gbrowser-standin.mjs` (registry scope, shim comparison, 35-01);
  `verify-shell-furniture.mjs` (rules 1-12, 35-02..35-07); `verify-web-tab-bridge.mjs` (push
  parity for `overLink`, `pageContextMenu`, `pageStill`; `webTabContextMenuAction` privileged with
  its fence; overlay attributes); `check-internals-boundary.sh` (`PointerlockFsWarning` pattern,
  catalogue); `verify-shell-error-copy.mjs` (refusal row, save copy, `F11`);
  `verify-shortcut-relay.mjs` (F11 row); `verify-page-tools-edit.mjs` (`cmd_copyImage`).
- **L:** `verify-page-furniture-live.mjs` scenarios: `tooltip-status`, `theia-hover-silent` (02);
  `context-menu`, `menu-not-in-ide`, `background-menu` (03); `menu-page-tools`, `menu-edit`,
  `menu-spelling`, `menu-save` (04); `extension-entry`, `freeze-frame` (05); `autocomplete`,
  `saved-login`, `form-validation`, `paste-popup` (06); `element-fullscreen`, `fullscreen-key`,
  `f11-keeps-debug` (07). Absence scenarios score only after their `CONTROL_OF` control passed in
  the same session; every scenario has at least one runtime plant in `--self-test`.
- **Manual-only:** menu look against Firefox, tooltip clamping, warning pixels, status truncation:
  KWin raise + `spectacle`, deferred to Chris's end-of-milestone checks.

Sampling: `--quick` after every task commit (stage new files first); each plan's live task builds
Theia and runs its scenarios; 35-07 runs every scenario of the phase once.
</validation_architecture>

<source_hierarchy>
## Source Hierarchy

1. **Authoritative (HIGH):** this tree at planning time (`powerbrowser/shell/*`,
   `theia/extensions/{chrome-bar,tab-uris}/*`, `scripts/*`); `upstream/` at
   `FIREFOX_153_5_0esr_BUILD1` for actor contracts; `theia/node_modules/@theia/*` 1.76.0 for
   menu/hover APIs. Every cited path was read this session.
2. **Corrective (HIGH):** 28-SPIKE-DECISION sign-off (tab host, no tabContainer,
   contentAreaContextMenu); 27/29/30 SUMMARY risk and deferred-items entries; PITFALLS
   moderate/minor rows named above.
3. **Advisory (MEDIUM):** gap-list line numbers (agents did not re-check them); FEATURES
   Firefox-behaviour prose. Re-derived live in probes 35-1..35-6 where a plan depends on them.

**Confidence:** HIGH that the installer + four-relay shape covers the four requirements; MEDIUM
that each actor's exact message/element contract matches the cited upstream path until probes
35-1/35-2/35-4 run live. No `[VERIFIED:]`/`[CITED:]` tag claims beyond what this session read;
the planner treats probes as tasks, not premises.
</source_hierarchy>

---

*Research completed: 2026-10-22*
*Ready for planning: yes. Revised 2026-10-22 by the planner revision; probes are live assertions in named plans and each PLAN.md carries its own assumptions list.*
