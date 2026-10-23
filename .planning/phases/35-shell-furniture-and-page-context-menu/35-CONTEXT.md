# Phase 35: Shell Furniture and Page Context Menu - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** `--auto` (standing autonomous rule: every gray area takes the recommended option, recorded with a one-line reason)

<domain>
## Phase Boundary

The stock Firefox furniture that page actors look for is present on the shell window, so the page
context menu, form autocomplete, tooltips and page fullscreen work in web tabs
(ROADMAP.md Phase 35; requirements PROMPT-04, PROMPT-06, PROMPT-08, PAGE-07).

In scope: one installer `PowerBrowserAPI.installShellFurniture(window)`; the XUL elements in
`powerbrowser.xhtml` it needs; the four behaviours above against overlay web tabs.
Not in scope: permission doorhangers and dialogs (Phase 37), new-window links as tabs
(Phase 36), permission writes and the site panel (Phase 31), find/zoom/print/downloads
(Phase 32), bookmarks/history/menu entries (Phase 33), tab-strip behaviour (Phase 34),
any windowtype change, any Theia core edit, any patch-stack change.

</domain>

<decisions>
## Implementation Decisions

### Recorded rulings that apply (REQUIREMENTS.md header, ROADMAP Phase 35, 28 sign-off)
- Firefox keys that clash with Theia keys take the browser meaning only while a web page has
  focus (2026-10-20 ruling; Phase 27 mechanism reused for F11).
- Stock Firefox toolkit popups with stock strings in `powerbrowser.xhtml` are shell furniture,
  not authored browser chrome (rule 5 clarification, 2026-10-20; ROADMAP Phase 35 Notes).
- Chrome-bar copy reads the configured application name, never a hard-coded brand.
- `windowtype` never changes (`powerbrowser:main` stays; ROADMAP Phase 35 Notes).
- Every new `gBrowser` member or shim global follows the Phase 27 policy (derived call sites,
  DELIBERATELY_ABSENT reasons, `FORBIDDEN_PATTERNS` exemption for definitions only).
- 28 sign-off binds this phase: FormValidationParent and AboutReaderParent go ahead with the
  host's `selectedBrowser`; `contentAreaContextMenu` carries the EXT-08 context-menu part;
  be careful with a `tabContainer` member, because it starts PopupNotifications, which is
  Phase 37's (28-SPIKE-DECISION.md Phase 35 bullet; restated as D-11 below).

### Decided after research (autonomous, recommended, 2026-10-23 run)

Revision 2026-10-22 (planner, checker findings B1-B5, W1-W7 and the common fixes): every
mechanism below was re-checked against `upstream/` at `FIREFOX_153_5_0esr_BUILD1` and the tree
at commit `3e8d991`. Line numbers in the tree are at `3e8d991`; Phase 31 is being executed in
the working tree at the same time, so executors grep by symbol, not by line. Decisions that
changed carry an **Amended** or **Re-stated** note with the reason.

- **D-00: This run takes the recommended option at every open choice.**
  Reason: the task brief orders autonomous resolution and a one-line reason recorded here.
- **D-01: One installer owns all furniture.** `PowerBrowserAPI.installShellFurniture(window)`
  installs every Phase 35 receiver on the shell window from one call site in `powerbrowser.js`.
  Reason: a single place to audit is what keeps the shim surface reviewable at ESR rebase.
  **Amended:** `PowerBrowserAPI` is `Object.freeze({...})` (`PowerBrowserAPI.sys.mjs:389`), so
  the name the ROADMAP and Phase 37's draft use is one delegating member appended to that
  literal; the receivers live in an end-of-file `// Phase 35: shell furniture.` section. The
  call sits right after `window.powerbrowserGetBrowser` (`powerbrowser.js:114-116`), before
  `TheiaService.start`. Reason: the frozen literal admits no member added from the end of the file.
- **D-02: Page context menu is Theia-rendered.** **Re-stated (B4):** a JSWindowActor message
  cannot be observed from outside its actor. `ContextMenuParent.receiveMessage`
  (`ContextMenuParent.sys.mjs:27-47`) reads `browser.documentGlobal.nsContextMenu`, writes
  `nsContextMenu.contentData` (`:190-216`) and opens `getElementById("contentAreaContextMenu")`
  with `openPopupAtScreen` (`:218-256`). So the installer defines the shim global
  `window.nsContextMenu` (a `contentData` accessor pair that captures the data) and the shell
  carries an empty stub `<xul:menupopup id="contentAreaContextMenu"/>` whose `popupshowing` the
  installer cancels. Chrome builds the rows from the captured data (D-12), labels them from
  Firefox's `browser/browserContext.ftl` through `Localization`, and pushes
  `{kind:'pageContextMenu'}`; Theia renders through `ContextMenuRenderer.render` (the
  `openHistoryMenu` pattern, `chrome-bar-widget.tsx:334`). The overlay hides under rule (a).
  Reason: BiDi can see a Theia menu and assert its actions page-side; a native XUL panel is
  invisible to every harness (Pitfall 15).
- **D-03: Form autocomplete uses the stock popup.** **Amended (W6):** the element is
  `<xul:panel is="autocomplete-richlistbox-popup" type="autocomplete-richlistbox"
  id="PopupAutoComplete" …>` with upstream's attribute set (`main-popupset.inc.xhtml:173-182`),
  and every overlay carries `autocompletepopup="PopupAutoComplete"` from `webTabOpen`'s
  attribute map, as `tabbrowser.js:2771` sets it. `AutoCompleteParent` reads
  `browser.autoCompletePopup` (`browser-custom-element.mjs:491-492`;
  `AutoCompleteParent.sys.mjs:212-224, 367-371`). The `autocomplete-richlistbox-popup` element
  is defined in every system-principal XHTML document (`CustomElementsListener.sys.mjs:9-27`
  loads `customElements.js`, which loads `autocomplete-popup.js` eagerly at `:928-952`).
  Reason: a Theia DOM popup is painted under the overlay (Pitfall 8).
- **D-04: Tooltips are the stock remote-browser tooltip; link status is a Theia status line.**
  **Re-stated (B2, B3):** remote content tooltips go `BrowserParent::RecvShowTooltip`
  (`BrowserParent.cpp:2532-2555`) to the AppWindow's `nsIXULBrowserWindow.showTooltip`, which
  upstream implements with `<tooltip id="remoteBrowserTooltip"/>` (`browser.js:2016-2044`,
  `main-popupset.inc.xhtml:151`). `<tooltip page="true">` (`aHTMLTooltip`, `:150`) serves only
  non-remote browsers, and every shell browser is remote. Link status arrives on the same
  object's `setOverLink` (`BrowserParent.cpp:2520-2530`; `nsContentTreeOwner.cpp:298-309`).
  The installer defines `window.XULBrowserWindow` (`setOverLink`, `showTooltip`, `hideTooltip`,
  the three methods of `nsIXULBrowserWindow.idl:33-42`) and registers it as
  `browser-init.js:255-258` does (`docShell.treeOwner` → `nsIAppWindow.XULBrowserWindow`); a plain
  `window.nsIXULBrowserWindow` global is never read. Registration at DOMContentLoaded is enough:
  `BrowserParent::GetXULBrowserWindow` looks the object up on every call (`:512-536`).
  `showTooltip` serves overlays only (the Theia frame keeps its HoverService hovers, the 27-08
  invariant). `setOverLink` carries no browser, so its source is the overlay under the pointer
  (a capturing `mouseover` listener, the `powerbrowser.js:441-442` precedent; upstream chrome
  reads pointer moves over remote content the same way, `browser-init.js:649`), else the focused
  overlay; the tab id comes from the existing `tabIdOfBrowser` (`PowerBrowserAPI.sys.mjs:4251`).
  The URL is transformed as `browser.js:1979-2005` does (unescape for UI, bidi controls encoded,
  `trimURLs`). Push `{kind:'overLink'}`; the bar renders one in-bar line (rule c). No `title`
  attribute is added to chrome-bar buttons. Reason: the earlier D-04 named a tooltip element
  that never fires for remote content and a global nothing reads.
- **D-05: Fullscreen ships both halves with the stock warning.** **Re-stated (B5):**
  `DOMFullscreenParent` (`DOMFullscreenParent.sys.mjs:28-43, 133-213, 253-261`) calls
  `window.FullScreen.enterDomFullscreen/cleanupDomFullscreen` and
  `window.PointerlockFsWarning.showFullScreen/close`, which `browser-fullScreenAndPointerLock.js`
  defines and the shell does not load (and must not: it reaches `gIdentityHandler`,
  `gNavToolbox`, `gURLBar`, `PopupNotifications` and `gXPInstallObserver`). The installer defines
  both stand-ins, porting the upstream messaging (`:574-675`, `:716-849`) and the warning state
  machine (`:5-310`) without the PopupNotifications, add-on-install, find-bar, toolbox and
  pointer-lock lines (`:640-647, 655-670, 738-746`), and keeps the `inDOMFullscreen` root
  attribute the actor reads (`:651, :750`; `DOMFullscreenParent.sys.mjs:21, 107`). The shell
  gains the stock `#fullscreen-warning` markup (`fullscreen-and-pointerlock.inc.xhtml:5-13`), its
  Fluent resource `browser/browser.ftl` (`:1022-1031`) and its stock stylesheet
  `chrome://browser/skin/tabbrowser/fullscreen-and-pointerlock.css`. The overlay covers the
  window through the `:fullscreen` top layer, so no geometry writer is added; an overlay that
  stops being visible leaves DOM fullscreen (upstream's TabSelect rule, `:660`, mapped to
  `webTabGeometry`'s visible-to-hidden branch). Esc exits element fullscreen (Gecko). The warning
  shows on every element-fullscreen entry; PowerBrowser adds no setting or code path that
  suppresses it (the stock `full-screen-api.warning.timeout` pref behaves as upstream).
  **Amended:** window fullscreen (F11) runs Phase 33's `chrome-bar.full-screen` command (Phase 33
  D-14: the stable id whose `window.fullScreen` toggle stays the path), and the top panel is
  **not** collapsed. Reason: hiding it needs a chrome-side top-edge reveal because Theia DOM
  cannot paint over an overlay (Pitfall 8), and the bar's Full Screen menu row is the
  window-fullscreen exit; no requirement asks for the collapse (PAGE-07, success criterion 4).
- **D-06: Context-menu actions run with the page's principal and the http(s) wall.**
  **Amended:** open-in-new-tab rows (link, image, media, frame, search selection) mint a
  one-time grant chrome-side from the captured data (triggering principal, policy container,
  referrer info: the `nsContextMenu.sys.mjs:1438-1471` shape) after
  `checkLoadURIWithPrincipal(principal, target)` and the http(s) wall; the frontend opens the
  tab with the existing `openInBackground` (`web-tab.ts:800`, NAV-06), and its `webTabOpen`
  carries the grant id. `webTabOpen` loads with the granted principal and referrer only when the
  grant matches the URL, is unused and is under 5 s old; any other `webTabOpen` keeps today's
  null-principal load. Non-http(s) link targets show the UI-SPEC refusal row.
  `disablecontextmenu` on `#powerbrowser-content` (`ContextMenuParent.sys.mjs:29`) keeps IDE
  right-clicks off the page path; without it the actor fires for the Theia frame too, because
  the ContextMenu actor has no `messageManagerGroups` (`DesktopActorRegistry.sys.mjs:416-429`).
  Reason: Pitfall "Context-menu actions run with the wrong principal"; D-06's referrer kept.
- **D-07: F11 follows the Phase 27 page-focus key mechanism.**
  A non-reserved `<key>` row created disabled, enabled only while chrome's active element is
  an overlay the boundary holds; with the Theia frame focused F11 keeps its debug meaning
  (KEY-04 class). Reason: F11 is Theia's step-into in Coding; a reserved row would break it.
  **Amended:** the row omits the `firefox` column, because the upstream id
  `key_enterFullScreen` contains the boundary-scan pattern `FullScreen`
  (`check-internals-boundary.sh:82`) and a non-comment line in `powerbrowser.js` carrying it is
  an offense; `verify-shell-furniture.mjs` checks the row against `browser-sets.inc.xhtml:235`
  instead.
- **D-08: G4b is the freeze-frame, measured in-phase against fixed budgets.** **Re-stated
  (W4):** G4b (ARCHITECTURE.md:80) is not about icon rows. Before the overlay hides for the page
  menu, chrome draws the overlay (`drawSnapshot`, the `captureShellRegion` path,
  `PowerBrowserAPI.sys.mjs:2077`) and the web-tab placeholder paints that still, so the page
  does not blank behind the menu. Budgets: the menu waits for the still at most **50 ms**; a
  capture that misses the deadline is dropped and the menu opens over the hidden page (today's
  rule (a)); right-click to menu visible is a live FAIL above **200 ms p95 over 20 opens**; the
  on-time fraction and capture p50/p95 are recorded in the SUMMARY and in 35-VALIDATION.md.
  Reason: ARCHITECTURE flags G4b as adopt-after-measurement; the deadline bounds its cost.
- **D-09: Privileged context actions are event-handler-only.**
  Menu rows that change state outside the tab (download, save, view-source routing, extension
  entries) fire through widget event handlers; no new command id performs a state change and
  no new row enters a key table. Reason: Phase 27 privileged-kind rule (Pitfall 7).
  **Amended:** the pick travels as `webTabContextMenuAction {tabId, menuId, itemId}`, the first
  privileged `webTab*` kind. `verify-web-tab-bridge.mjs` classes it `privileged` (its "no
  privileged webTab kind" rule becomes "each privileged kind is listed with a reason and sent
  only from its owning file"), `INTERNAL-APIS.md`'s privileged-kind rule records it, and only
  `page-context-menu.ts` sends it. A call performs only a row chrome offered for that menu: the
  menu id is single-use, the item id must be in the offered set, and every target is read from
  the captured data, never from the payload.
- **D-10: Window-modal fallback stays for the Theia frame.**
  Prompt/beforeunload/alert paths are Phase 37; this phase changes nothing about which dialogs
  the Theia frame itself gets. Reason: Pitfall "Theia frame's own beforeunload".
- **D-11: The tabContainer ruling, restated.** Phase 35's furniture section defines no
  `PopupNotifications` and attaches nothing to `tabContainer`; the stock fullscreen lines that do
  (`browser-fullScreenAndPointerLock.js:640-647, 660, 670, 738-746`) are not ported. The
  `tabContainer` strip element itself is Phase 31.1's (31.1-02 D-03). Reason: the 28 sign-off
  says "be careful", and 31.1-02 adds the element, so a blanket "no tabContainer" rule would go
  red the moment 31.1 lands.
- **D-12: The page-menu row set.** Ids, order and labels come from upstream
  (`browser-context.inc.xhtml`, `browser/browserContext.ftl`); a row shows only when its action
  works in the shell (UI-SPEC: rows that cannot run are omitted).
  Offered: navigation (`context-back`, `context-forward`, `context-reload`/`context-stop`,
  `context-bookmarkpage`); page (`context-savepage`, `context-selectall`, `context-viewsource`);
  link (`context-openlinkintab`, `context-savelink`, `context-copyemail`, `context-copylink`,
  `context-stripOnShareLink` under upstream's pref condition); image (`context-reloadimage`,
  `context-viewimage`, `context-saveimage`, `context-copyimage-contents`, `context-copyimage`,
  `context-viewimagedesc`); media (play/pause, mute/unmute, the playback-rate submenu, loop,
  `context-video-fullscreen`, show/hide controls,
  `context-viewvideo`, save video/audio, copy video/audio link); selection (`context-copy`,
  `context-searchselect`); editable (spelling suggestions, `spell-add-to-dictionary`/
  `spell-undo-add-to-dictionary`, `spell-check-enabled`, `context-undo`, `context-redo`,
  `context-cut`, `context-copy`, `context-paste`, `context-paste-no-formatting`,
  `context-delete`, `context-selectall`); frame submenu (`context-showonlythisframe`,
  `context-openframeintab`, `context-reloadframe`, `context-viewframesource`); always last
  `context-inspect-a11y` (upstream's pref condition) and `context-inspect`; extension entries
  (D-16). Omitted, with reasons: open in current tab, private window, container,
  split view and smart window (open-in-current-tab is the plain link click; private, container
  and split view are not v1.5). Open Link in New Window (`context-openlink`) is omitted from
  Phase 35 although a stock-window path exists (GUI-01 `openBrowserWindow`, MENU-03 New Window):
  no plan here wires it, so it is a deferred idea, not "Phase 36's" (Phase 36 covers
  page-initiated new windows only). Preview link, ask chat, visual search,
  translate selection, take screenshot (Firefox's Screenshots component is not loaded in the shell;
  a scope choice for v1.5, not a REQUIREMENTS Future item), picture-in-picture, video snapshot, send to device, email image/video/audio and set desktop
  background (REQUIREMENTS Future, or no OS integration in v1.5); view image info, view frame
  info and frame process id (Page Info is out of v1.5); fill login, relay mask, manage saved
  logins and reveal password (password UI is Phase 37's); bookmark link and bookmark frame
  (a mechanism limit, not a scope cut: Phase 33's `bookmarkPage` is a privileged store kind
  fenced to its sanctioned callers by rule 12; adding the context menu as a caller is a
  follow-up for Phase 33's fence, recorded as a deferred idea);
  save frame, print frame and print selection (Phase 32's save and print act on the top page);
  add search engine (engine management is not this phase's requirement); copy link to
  highlight and remove highlight (the text-directive rows depend on the child's asynchronous
  directive computation and are not named by PROMPT-04); view selection source (Phase 32's view
  source has no selection range); the pdf.js editor rows; the bidi direction toggles (upstream
  shows them only with `bidi.browser.ui`); DRM learn-more; the dictionary submenu and "add
  dictionaries" (they open add-on installs, Phase 38's); the view-source page tools (Phase 32's
  source view owns them); `context-leave-dom-fullscreen` (D-19). Reason: "each item works" is
  the success criterion; a dead row is worse than an absent one.
- **D-13: Inspect uses Phase 32's devtools route, then selects the node.** The Inspect rows
  first open the right-clicked page's toolbox through the function behind Phase 32's
  `case "webTabDevtools"` (Phase 32 D-23: a stock DevTools window for the overlay), then call
  `DevToolsShim.inspectNode(tab, targetIdentifier)` / `inspectA11Y` with the 31.1 host tab
  (`nsContextMenu.sys.mjs:1424-1436`); `gDevTools.inspectNode` selects the node in an
  already-open toolbox (`devtools.js:883-920`). Reason: one DevTools host for web tabs, and node
  selection is what Firefox's Inspect does.
- **D-14: The form-validation bubble lands with the autocomplete popup.** The 31.1 host's
  `selectedBrowser` makes `FormValidationParent` proceed (`FormValidationParent.sys.mjs:86-93`)
  to `getElementById("invalid-form-popup")` through `invalidFormTemplate` (`:195-208`); the shell
  carries upstream's template and panel (`main-popupset.inc.xhtml:221-226`). Reason: the 28
  sign-off binds this phase; without the element the actor throws on every invalid submit once
  31.1 lands.
- **D-15: The page clipboard paste popup (ROADMAP research probe 12).** `ClipboardContextMenu`
  creates `#clipboardReadPasteMenuPopup` on demand in the top chrome document
  (`ClipboardContextMenu.sys.mjs:93, 159-180`) but labels it with
  `document.l10n.setAttributes(…, "text-action-paste")` (`:162`), and the shell document has no
  `document.l10n`. The shell head gains `<link rel="localization"
  href="toolkit/global/textActions.ftl"/>` (and `browser/browser.ftl` for the warning, D-05); a
  live scenario asserts the popup opens and the page's `readText()` resolves. Reason: ROADMAP
  research line; furniture a page actor looks for.
- **D-16: EXT-08 carriage.** For each captured menu the installer notifies
  `on-build-contextmenu` with the stock subject shape (`nsContextMenu.sys.mjs:140-180`; `menu` is
  the stub, `tab` from the 31.1 host's `getTabForBrowser`), so `ext-menus.js` builds extension
  items into the stub (`ext-menus.js:54-60, 1030`); the installer forwards those items as an
  extension group, dispatches `command` on the picked item, and fires `popuphidden` on the stub
  when the Theia menu closes so `ext-menus.js` cleans up (`:560-572`). Toolbar buttons and the
  puzzle menu stay Phase 38's. Reason: 28 sign-off Phase 35 bullet; the deferred-ideas line
  "this phase only forwards contentAreaContextMenu entries".
- **D-17: T-27-11 closes in this phase, and shim coverage lives in the stand-in gate.**
  `verify-shell-gbrowser-standin.mjs` derives its call-site files from both actor registries
  (`DesktopActorRegistry.sys.mjs`, `ActorManagerParent.sys.mjs`) as well as the two actor
  directories, and compares every Phase 27 shim global the boundary file defines with the members
  upstream calls on it (`nsIXULBrowserWindow.idl` for `XULBrowserWindow`, which Gecko C++ calls).
  The new `PointerlockFsWarning` name joins `FORBIDDEN_PATTERNS` with a plant. Definitions live
  in `PowerBrowserAPI.sys.mjs`, which the scan exempts as a file, so no per-line exemption is
  added (the gBrowser one-line exemption exists only because that definition lives in
  `powerbrowser.js`); each definition line gets an `INTERNAL-APIS.md` row instead. Reason: the
  todo's `resolves_phase: 35` and common fix 5. **Cross-phase note:** the 31.1-02 draft (Task 2)
  also widens this scope and appends a T-27-11 row; one owner must remain, and this phase is it.
- **D-19: No page menu during element fullscreen.** While the shell document is in element
  fullscreen the `nsContextMenu` setter refuses captures and calls `actor.hiding()`: the overlay
  is the fullscreen element in the top layer and a Theia-rendered menu cannot draw over it
  (Pitfall 8; the overlay hiding under rule (a) would leave the fullscreen backdrop). Esc and the
  stock warning's exit button leave fullscreen. Reason: a menu the user cannot see is worse than
  none; a second, native renderer for fullscreen would be authored chrome no requirement asks for.
- **D-18: Seven plans, strictly sequential.** Every plan edits `PowerBrowserAPI.sys.mjs` and
  `INTERNAL-APIS.md`, so each wave holds one plan: 01 stand-in gate (T-27-11, shims); 02 tooltips
  and link status (PROMPT-08), the furniture gate and the live harness; 03 page-menu engine and
  core rows (PROMPT-04); 04 rows over Phase 32/33 mechanisms, saves and spelling (PROMPT-04);
  05 extension entries and the G4b freeze-frame (PROMPT-04); 06 forms: autocomplete, validation
  bubble, paste popup (PROMPT-06); 07 fullscreen (PAGE-07). Reason: each plan stays under 15
  files and three tasks.

### Claude's Discretion
- Exact `MenuPath` ids, push field names, plant names in the self-tests, scenario names in the
  live script, and file splits within the files each plan names.
- Whether the status line lives in the pill or beside it, within UI-SPEC rule (c).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` § Phase 35 (goal, depends-on, requirements, research notes, success criteria)
- `.planning/REQUIREMENTS.md` §§ PROMPT-04, PROMPT-06, PROMPT-08, PAGE-07; header rulings (search, Places write, rule 5, suggestions default, key clash, no clipboard suggestion, app-name copy); Out of Scope table
- `.planning/PROJECT.md` Key Decisions (hard rules 1–5, autonomous nonstop default)

### Research inputs
- `.planning/research/SUMMARY.md` (furniture finding: actors already run, furniture missing; shared-groundwork order)
- `.planning/research/ARCHITECTURE.md` §§ F1–F4, build order step F, integration points (furniture installer, openStockTab/openStockPage)
- `.planning/research/STACK.md` (per-feature Gecko modules consumed only from `PowerBrowserAPI`)
- `.planning/research/PITFALLS.md` Pitfalls 1–3, 5, 7, 8, 14, 15; Moderate "Context-menu actions", "Prompts from background tabs"; "Looks Done But Isn't" rows (window.open-to-tab, permissions, every chrome-side change used -purgecaches)
- `.planning/research/FEATURES.md` §§ PROMPT, PAGE-07 (Firefox behaviour baseline)
- `.planning/research/chrome-bar-firefox-gap.md` §§ Page prompts and shell furniture, Page tools (F11, element fullscreen)

### Binding prior decisions
- `.planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md` §§ Scope consequence, Phase adjustments Phase 35, Sign-off (tab host, getTabForBrowser reversal, contentAreaContextMenu, no tabContainer)
- `.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-CONTEXT.md`, `27-RESEARCH.md` (push router, PAGE_KEYS, layer policy, privileged-kind rule), `27-PATTERNS.md`, `27-VALIDATION.md`
- `.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-SECURITY.md` (open item T-27-11 carried here; sender-wall and log-line precedents)
- `.planning/phases/29-address-bar-search-and-fixup/29-CONTEXT.md`, `29-SECURITY.md` (token-cookie exemption, http(s) wall precedents)
- `.planning/phases/30-address-bar-modes-and-command-centre/30-CONTEXT.md` (pill location `address-bar/`, DEFAULT_MODE_BY_UI_MODE)

### Code
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (the one boundary; end-of-file section convention; `webTabPush` coalescing)
- `powerbrowser/INTERNAL-APIS.md` (append-only rule, privileged-kind rule)
- `powerbrowser/shell/powerbrowser.js` (PAGE_KEYS, focus tracker, `window.gBrowser` stand-in)
- `powerbrowser/shell/powerbrowser.xhtml` (shell markup; CSP `default-src chrome:`)
- `theia/extensions/tab-uris/src/browser/web-tab.ts` (BLOCKING_LAYER_SELECTOR, onPush router, geometry)
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`, `address-bar/address-bar.tsx`, `chrome-bar-shortcuts.ts`, `chrome-bar-copy.ts`
- `scripts/verify-shell-gbrowser-standin.mjs`, `scripts/verify-web-tab-bridge.mjs`, `scripts/verify-platform.sh`, `scripts/check-internals-boundary.sh`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WebTabChannel.onPush(kind, handler)` router + `widgetOf(tabId)` (Phase 27): every Phase 35 push subscribes through it, no second dispatcher.
- `PAGE_KEYS` + focus tracker in `powerbrowser.js` (Phase 27): F11 row follows the same created-disabled / enabled-while-overlay-focused mechanism.
- `ContextMenuRenderer` + `MenuPath` → `.lm-Menu` (Phase 27 history menu): the page context menu renders through the same path, already in the occlusion list.
- `HoverService.requestHover({position:'top'})` + `verify-shortcut-relay` rule 10 (Phase 27-08): tooltip/status copy derivation pattern; status line reuses the bar's hover CSS lane.
- `ChromeStoreClient` + `handleStoreRequest` walls (`groupSenderIsTheia`, shell-window check): any store kind this phase needs follows the same validation shape.
- `scripts/lib/pb-live-probe.mjs` (`withProbeShell`, push recorder, `MOZ_PURGE_CACHES=1`, page-focus probe, chrome-scope key synthesis): the live script builds on it, no second harness.
- `verify-shell-gbrowser-standin.mjs` (derived call sites + DELIBERATELY_ABSENT): grows the registry scope (T-27-11) and the shim-global comparison (D-17); the new furniture gate copies its derive-and-compare shape.

### Established Patterns
- Boundary: Firefox internals only in `PowerBrowserAPI.sys.mjs`; new code in the end-of-file section; `--fix` renumber after every edit; append-only catalogue rows.
- One driver: a new check is one appended row in `scripts/verify-platform.sh`, never a sibling driver.
- Derive and compare: expectations are derived from the tree at check time and compared as set equality; hand-kept lists are forbidden.
- Copy: no internal identifier in user-facing text; product name from the configured application name; every new surface joins the copy gate's derived set.
- Live: `-purgecaches` recorded, positive page-side assertions (`confirm()` return, `document.fullscreenElement`, menu action outcome), `--self-test` plants per scenario.

### Integration Points
- `PowerBrowserAPI.installShellFurniture(window)` (one delegating member of the frozen literal, D-01) ← called once from `powerbrowser.js` after `window.powerbrowserGetBrowser`; all receivers installed by the end-of-file Phase 35 section.
- Chrome pushes → `WebTabChannel.onPush` → chrome-bar widgets (context menu, status line, fullscreen state).
- Theia answers → existing `webTab*` kinds (`webTabOpen`, `webTabNavigate`, `webTabReload`) — no new navigation path.
- Assumed Phase 31.1 tab host: furniture reads `selectedBrowser`/tab nodes from the host; `getTabForBrowser` returns a real tab node by the time this phase runs. Each PLAN.md carries its own "Assumes from earlier phases" list; a missing dependency is a blocker the executor reports, never re-implemented.

</code_context>

<specifics>
## Specific Ideas

- Firefox behaviours to match: right-click menu order (open link in new tab, copy link, save image, inspect and the rest); form-history plus saved-login popup under the field; `title=` tooltip and link-hover status; F11 window fullscreen and video element fullscreen with Firefox's warning and Esc exit.
- Right-clicking IDE content must keep showing Theia's own menu — the page menu appears only over overlays.

</specifics>

<deferred>
## Deferred Ideas

- Permission doorhangers, sharing indicator, alert/confirm/prompt/leave-page/HTTP-auth dialogs, password save, notification bars — Phase 37.
- `target=_blank` / `window.open` as web tabs, opener adoption, GUI-01 row — Phase 36.
- Favicons on tabs/strip/pill beyond what the tab host delivers — Phase 32 owns the display; this phase only keeps `setIcon` working.
- Extension toolbar buttons and puzzle menu — Phase 38 (this phase only forwards `contentAreaContextMenu` entries).
- Screenshot, translations, PiP, page info, unload tab — out of v1.5 (REQUIREMENTS.md Future).

</deferred>

---

*Phase: 35-shell-furniture-and-page-context-menu*
*Context gathered: 2026-10-22; decisions revised 2026-10-22 (planner revision, checker B1-B5/W1-W7)*
