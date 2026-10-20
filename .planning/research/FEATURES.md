# Feature Research

**Domain:** Firefox-toolbar parity for a Theia-hosted browser chrome bar (PowerBrowser v1.5)
**Researched:** 2026-10-20
**Confidence:** HIGH for Firefox and Theia behaviour (read from the pinned `upstream/` at `FIREFOX_153_5_0esr_BUILD1` and from the installed `@theia/*` 1.76.0 `lib/`); MEDIUM for VS Code command-centre behaviour (release notes only); MEDIUM for complexity estimates (taken from the 2026-10-20 gap list, which did not re-check its own line numbers).

Scope: only the features that are new in v1.5. The "Already have" list in `.planning/research/chrome-bar-firefox-gap.md` is the baseline and is not repeated here. Out of scope (Chris, 2026-10-20): private browsing, containers, Sync, sketch 005 items 1-2, the 24-GAPS defects, data-driven custom modes.

Complexity uses the gap list's S/M/L/XL. Mapping to the template: S = LOW, M = MEDIUM, L and XL = HIGH.

---

## Proposed requirement categories

| Prefix | Category | Gap-list area |
|--------|----------|---------------|
| `SMODE-` | Address-bar modes dropdown (engines, Bookmarks, Tabs, History, Actions, Command centre) | new (Chris, 2026-10-20) |
| `BAR-` | Address-bar input and search (fallback, fixup, switch-to-tab, suggestions, autofill, one-offs, paste & go) | Address bar input |
| `NAV-` | Navigation buttons (Stop, hard reload, history menu, Home) | Navigation buttons |
| `KEY-` | Keyboard shortcuts that work with the page focused | Keyboard shortcuts |
| `SITE-` | Site identity, security state, permissions panel, clear site data, tracking shield | Site identity |
| `MENU-` | App (hamburger) menu and the stock-page entries it opens | App menu and windows |
| `PAGE-` | Page tools: find, zoom, print, favicons, mute, downloads, fullscreen | Page tools |
| `BMK-` | Bookmarks and history: star, editor, reopen closed tab, toolbar, clear history | Bookmarks and history |
| `EXT-` | WebExtension toolbar buttons and the extensions (puzzle) menu | App menu row "WebExtension toolbar buttons" |
| `PROMPT-` | Page prompts: permission requests, alert/confirm/auth, context menu, window.open as tab, autofill | Page prompts and shell furniture |

`MODE-` is already used by v1.4 (PowerBrowser modes, MODE-01..04), so the dropdown takes `SMODE-` to avoid a collision. `EXT-01..03` exist from v1/v1.1 (extension declaration); new EXT rows must continue the numbering at `EXT-04`.

The shared groundwork in the gap list (wider state push, shortcut relay, web-tab action kinds, popover primitive, Places-write policy, search area, shell-window shims, openStockTab allow-list) should not get its own REQ-IDs. Each piece lands inside the first requirement that needs it, and the requirement's check covers it.

---

## The address-bar modes dropdown (SMODE) — exact specification

### How Firefox does it (pinned source)

Firefox 153 ships the "unified search button" on by default: `browser.urlbar.scotchBonnet.enableOverride` is `true` (`upstream/browser/app/profile/firefox.js:451`, `upstream/browser/components/urlbar/UrlbarPrefs.sys.mjs:446`). The implementation is `upstream/browser/components/urlbar/content/SearchModeSwitcher.mjs`.

**Markup** (`upstream/browser/components/urlbar/content/UrlbarInput.mjs:124-151`): a `moz-button.searchmode-switcher` sits at the far left of the pill, before the site-info slot. It contains an icon, a dropmarker, a `.searchmode-switcher-title` label, and a `.searchmode-switcher-close` (x) button. The popup is a `panel-list` with a heading, an installed-engines group, a separator, the local modes, a footer separator, and a settings item.

**Popup contents, top to bottom** (`SearchModeSwitcher.mjs` `#buildSearchModeList`, `#populateEngines`):

1. Heading "This time search with:" (`urlbar-searchmode-popup-one-off-header`, `upstream/browser/locales/en-US/browser/browser.ftl:898`). The wording says the choice is for one search, because `scotchBonnet.persistSearchMode` defaults to `false` (`UrlbarPrefs.sys.mjs:450`).
2. One row per visible engine (`SearchService.getVisibleEngines()`, minus `hideOneOffButton`). Each row has the engine icon, the engine name, and the first letter as its access key. A "new" badge appears on unused app-provided engines.
3. Separator.
4. Local modes from `UrlbarUtils.LOCAL_SEARCH_MODES` (`upstream/browser/components/urlbar/UrlbarUtils.sys.mjs:291-326`), in this order:
   - Bookmarks — restrict `*`, access key B
   - Tabs — restrict `%`, access key T
   - History — restrict `^`, access key H
   - Actions — restrict `>`, access key A
   The labels come from `browser.ftl:877-884`.
5. Up to 3 "Add “{engine}”" rows for OpenSearch engines that the current page advertises (`MAX_OPENSEARCH_ENGINES = 3`).
6. "Search Settings" (access key S), which opens `about:preferences#search`.

**Selecting a row:**
- Engine row, normal click: enters that engine's search mode and keeps the typed text (`#remoteSearch`).
- Engine row with Shift, or a middle/Ctrl click: opens the results page immediately, in the current tab or a new one (`#whereToOpenSerp`). Shift never opens a window.
- Local row: runs `input.search(restrict + " " + text)`, which enters that mode (`#localSearch`).
- Typed text is carried over only when the pill is not showing the page's own URL (`#getSearchString` checks `pageproxystate != "valid"`).

**What the pill shows** (`updateSearchIcon`):
- Outside a search mode, the button shows the default engine's icon and has no label. Its tooltip is "{engine}, pick a search engine" (`urlbar-searchmode-button3`). The globe icon replaces it when keyword search is disabled.
- Inside a search mode, the button shows the mode's icon, its label in `.searchmode-switcher-title`, and the x button.
- The placeholder changes with the mode (`browser.ftl:540-594`):
  - default: "Search with { $name } or enter address", or "Search or enter address" when no engine is known
  - general-purpose engine mode: "Search the Web"
  - site engine, bookmarks, history, tabs and actions modes: "Enter search terms", with aria-labels "Search bookmarks", "Search history" and so on

**Keyboard:**
- Typed token plus a space enters a mode, and the token is removed from the text. `^` is History, `*` is Bookmarks, `%` is Tabs, `?` is the default engine, and `>` is Actions (Actions only with scotchBonnet). Sources: `UrlbarShared.mjs:46-72` (`RESTRICT_TOKENS`, `SEARCH_MODE_RESTRICT`), `UrlbarProviderHeuristicFallback.sys.mjs:235-270`, and `UrlbarInput.mjs:2341-2356` (`onFirstResult`, entry `"typed"`). A token without a space after it stays plain text. `+` (tags), `#` (titles) and `$` (URLs) narrow the results but do not enter a mode.
- `@` lists the engines that have aliases, and `@alias ` enters that engine's mode (`UrlbarProviderTokenAliasEngines.sys.mjs:63`).
- Alt+Up or Alt+Down opens the popup and focuses the button (`handleKeyDown`, `#handleAltUpDown`).
- Accel+Up or Accel+Down cycles through the engines and then the local modes without opening the popup, and re-runs the query (`#handleAccelUpDown`).
- Down on the focused button opens the popup. Tab past the last result moves focus to the button, and Shift+Tab past the first result does the same (`UrlbarController.sys.mjs:437-460`).
- Backspace with the caret at position 0 and no selection leaves the mode and re-queries (`UrlbarController.sys.mjs:560-570`).
- Escape first closes the results list. A second Escape reverts the pill, and `handleRevert` sets `searchMode = null` (`UrlbarController.sys.mjs:358-376`, `UrlbarInput.mjs:1420-1423`).
- Ctrl+K enters default-engine search mode (`key_search`, `searchModeShortcut`, `UrlbarInput.mjs:2868-2882`). Ctrl+J (Linux) or Ctrl+E (other platforms) is the alternate key (`key_search2`, `browser-sets.inc.xhtml:165-172`, `browserSets.ftl:50-55`).
- Search mode is stored per tab (`#getSearchModesObject(browser)`).
- The quick actions behind Actions are `upstream/browser/components/urlbar/QuickActionsLoaderDefault.sys.mjs:80-335`: addons, bookmarks, clear history, downloads, extensions, help, inspect, color picker, library, logins, mute, print, private, refresh, restart, save PDF, screenshot, settings, themes, translate, update, view source and labs.

### How Theia 1.76 and VS Code do the command centre

Theia 1.76 has no title-bar command-centre widget. A search for `commandCenter` across `@theia/core` and `@theia/monaco` finds nothing. What Theia has is the quick-access registry behind the stock quick input. Its prefixes, read from the installed `lib/`:

| Prefix | Provider | Stock key (browser target) | Source |
|--------|----------|----------------------------|--------|
| `''` (none) | Go to file | Ctrl+P | `@theia/file-search/lib/browser/quick-file-open.js:55,136`, `quick-file-open-contribution.js:46` |
| `>` | Commands | F1, Ctrl+Shift+P | `@theia/core/lib/browser/quick-input/quick-command-service.js:50`, `quick-command-frontend-contribution.js:64-68` |
| `@` | Go to symbol in the active editor | — | `@theia/monaco/lib/browser/monaco-gotosymbol-quick-access.js:49` |
| `:` | Go to line | — | `@theia/monaco/lib/browser/monaco-gotoline-quick-access.js:45` |
| `#` | Go to symbol in workspace | Ctrl+O (Ctrl+T in Electron) | `@theia/monaco/lib/browser/workspace-symbol-command.js:38,60` |
| `?` | Help: lists every provider | — | `@theia/core/lib/browser/quick-input/quick-help-service.js:26,47-69` |
| `edt ` | Open editors | — | `@theia/editor/lib/browser/quick-editor-service.js:32` |
| `term ` | Terminals | — | `@theia/terminal/lib/browser/terminal-quick-open-service.js:29` |
| `task ` | Tasks | — | `@theia/task/lib/browser/quick-open-task.js:60` |
| `debug ` | Launch configurations | — | `@theia/debug/lib/browser/debug-prefix-configuration.js:43` |
| `view ` | Open view | — | `@theia/core/lib/browser/quick-input/quick-view-service.js:32` |

The file provider's placeholder is computed at runtime: "Search files by name (append : to go to line or @ to go to symbol)" (`quick-file-open.js:136`).

VS Code's command centre was introduced in 1.69 (setting `window.commandCenter`). It replaces the title-bar text. Clicking it opens Quick Open, which shows recent files and a search box with no prefix. Go Back and Go Forward sit on its left, and a separate control lists the quick-access options. It launches the quick input; it is not an inline input. (MEDIUM: VS Code 1.69 release notes.)

**The integration finding that shapes the design.** `QuickAccessRegistry` (`@theia/core/lib/browser/quick-input/quick-access.d.ts`) exposes `getQuickAccessProviders()` and `getQuickAccessProvider(prefix)`. Each descriptor's `getInstance().getPicks(filter, token)` returns plain `QuickPicks`: items with label, description, detail and `execute()`, plus separators. The chrome bar can therefore render Theia's files, commands, `#`, `?`, `edt `, `term `, `task `, `debug ` and `view ` results in its own dropdown with no core patch.

The exceptions are `@` and `:`. They are registered as monaco-native providers, so `MonacoQuickAccessRegistry.getQuickAccessProvider` returns no Theia descriptor for them (`@theia/monaco/lib/browser/monaco-quick-access-registry.js`, the `theiaDescriptor` filter). They also preview inside the editor as the selection moves. For those two prefixes the pill hands off to the stock widget with `quickInputService.open(text)`. That widget is already in the page-overlay occlusion list (`.quick-input-widget` in `BLOCKING_LAYER_SELECTOR`, `theia/extensions/tab-uris/src/browser/web-tab.ts:99`).

### PowerBrowser specification (recommended)

**SMODE-01 Dropdown entries**, top to bottom:

1. Heading "This time search with:" (Firefox wording, because the pick does not persist; see SMODE-04)
2. **Command centre**, access key C. It sits in its own group at the top because it is the Coding default.
3. Separator
4. One row per visible engine: icon, name, first-letter access key. Data comes from the `listSearchEngines` kind (BAR- groundwork).
5. Separator
6. Bookmarks (B), Tabs (T), History (H), Actions (A), in Firefox's order and with Firefox's labels
7. Separator
8. "Search Settings" (S). It opens PowerBrowser's engine picker (BAR-), or `about:preferences#search` through `openStockTab` once the allow-list decision is made.

"Add “{engine}”" OpenSearch rows are deferred (see Future Consideration).

The Command centre row has no sub-rows. Its sub-modes are reached by prefix. Typing `?` in Command centre lists them through Theia's help provider, so the list comes from the registry and is never hand-kept.

**SMODE-02 Default mode for each PowerBrowser mode:**

| PowerBrowser mode | Default | Rationale |
|-------------------|---------|-----------|
| Coding | Command centre (files) | Chris, 2026-10-20 |
| Browsing | Address (Firefox's state outside any search mode: URL or default-engine search) | Firefox parity |
| Organising | Tabs | **Recommendation, needs Chris's decision.** Panorama is about finding and arranging tabs; the alternative is Address. |
| Custom modes | Address | Data-driven custom modes are out of scope, and `chrome-bar-widget.tsx` keys modes on hard-coded ids |

**SMODE-03 How the mode shows in the pill.** The mode button is the leftmost element of `.pb-chrome-bar-pill`, before the lock. Codicons are used, never Firefox's `chrome://` icons, because the Theia frame cannot load them across the scheme wall.

- **Address mode:** the default engine's favicon, or a search codicon when none is known. No label. Tooltip "{engine}, pick a search engine". Placeholder "Search with {engine} or enter address". The existing placeholder "Search or enter address" is the fallback.
- **Any other mode:** icon plus a label chip, for example "Command centre", "Bookmarks" or the engine name.
- **x button:** shown only when the active mode differs from the PowerBrowser mode's default, because x means "back to default". In Coding the "Command centre" chip is always visible, so the pill is not mistaken for an address box, and it has no x.
- **Placeholders by mode:**
  - Command centre: the active provider's own `placeholder`, read from the registry descriptor rather than copied
  - engine mode: "Search the Web" for general engines, otherwise "Enter search terms"
  - local modes: "Enter search terms", with aria-labels "Search bookmarks", "Search tabs", "Search history" and "Search actions"

**SMODE-04 Lifetime.** A mode picked from the dropdown, by token or by Accel+Up/Down lasts until any of these happens:
- Enter commits
- Escape reverts
- the active tab changes
- the PowerBrowser mode changes

The pill then returns to the PowerBrowser mode's default. This matches Firefox's `persistSearchMode = false`. Firefox keeps the mode per tab; resetting on tab switch is simpler and loses little.

**SMODE-05 Keyboard.** Firefox's keys, unchanged:
- Alt+Up/Down opens the dropdown
- Accel+Up/Down cycles modes
- Down on the button opens it
- Tab past the last result focuses the button
- Backspace at position 0 returns to the default mode
- Escape closes, then reverts

Ctrl+Up/Down must stop propagation so Theia does not see it. Access keys apply while the dropdown is open.

**SMODE-06 Prefix table.** The prefix meaning depends on the mode, because Firefox and Theia both claim `>`, `@`, `#` and `?`.

| Typed at start | In Command centre | In Address, engine, Bookmarks, Tabs, History or Actions |
|----------------|-------------------|---------------------------------------------------------|
| (no prefix) | Files (Theia `''`) | Address or search heuristic (BAR-) |
| `>` | All Theia commands. The `>` stays in the text, as in VS Code. | `> ` enters **Actions**, which is the Theia command list filtered to the "Browser" category. The token is consumed. |
| `@` | Symbols in the active editor, handed to the stock quick input | Engine alias list; `@alias ` enters that engine |
| `:` | Go to line, handed to the stock quick input | Plain text |
| `#` | Workspace symbols | Firefox title restrict (narrows results, no chip) |
| `?` | Theia help (lists the prefixes) | `? ` enters default-engine search mode |
| `edt `, `term `, `task `, `debug `, `view ` | The Theia provider | Plain text. These are ordinary search words ("view source", "task manager"), so they must not trigger outside Command centre. |
| `% `, `* `, `^ ` | Switch to Tabs, Bookmarks or History. Theia does not use these characters. | Same |

Two rules follow from the table:
- Firefox tokens are consumed into the chip; Theia prefixes stay in the text. Each rule matches the convention of the product it comes from.
- Actions and Theia commands are one registry. Every browser action PowerBrowser adds (print, downloads, clear history, settings and so on) is registered as a Theia command in a "Browser" category. That gives it a palette entry, a keybinding slot and an Actions row from one registration.

**SMODE-07 URL entry inside Command centre:**
- **Ctrl+L, Alt+D and F6 always focus the pill in Address mode**, with the current URL selected, even in Coding. They are the explicit "type an address" keys, and Ctrl+L already exists (`powerbrowser/shell/powerbrowser.js` reserved key, `chrome-bar-keybindings.ts:24`).
- When the text has no Theia prefix and is unambiguously a URL, the first row is a heuristic "Go to {url}" row, selected by default, so Enter visits. Unambiguous means a scheme, `localhost[:port]`, `host:port`, an IP address, a leading `www.`, or a trailing `/`.
- **A bare dotted name is not treated as a URL in Command centre.** `README.md`, `main.py`, `package.json` and `index.ts` are file names, and `.md` and `.py` are real TLDs. For these, file results come first and a "Go to {text}" row comes after them.
- The last row is always "Search {engine} for “{text}”", a one-off that falls back to search.
- Enter with no rows visits the text if it looks like any URL; otherwise it searches.

**SMODE-08 Result surface.** Every mode, Command centre included, renders in the existing `.pb-chrome-bar-dropdown` portal (`chrome-bar-widget.tsx:578-603`). Command-centre rows show the `QuickPickItem` label, description, detail and keybinding, and keep the provider's separators ("recently used", "other commands"). Enter or a click calls `execute()`.

The existing 8-row cap (`CHROME_SUGGESTION_LIMIT`, `chrome-bar-suggestion-service.ts`) must become per-mode. Command centre needs a scrolling list, as the stock quick input has.

The stock keys stay bound to the stock widget in v1.5: Ctrl+P, F1, Ctrl+Shift+P and Ctrl+O. Routing them into the pill is deferred.

**Complexity:** M for the dropdown and modes. M for the Command centre bridge (registry `getPicks`, `@`/`:` handoff, heuristic row). S for the prefix table, once both exist.

---

## Feature Landscape

### Table Stakes (Users Expect These)

A Firefox or Chrome user notices these in the first hour. "Deps" names the existing code each one builds on.

| REQ | Feature | Firefox behaviour (pinned source) | Complexity | Deps on existing pieces |
|-----|---------|-----------------------------------|------------|------------------------|
| BAR | Search fallback for non-URL text | Heuristic engine result (`UrlbarProviderHeuristicFallback.sys.mjs`); placeholder names the engine (`urlbar-placeholder-with-name`, `browser.ftl:594`) | S | New `searchSubmission` kind over `Services.search` in `PowerBrowserAPI.sys.mjs` and a row in `INTERNAL-APIS.md`. Re-rules 13-UI-SPEC "no new addressability scheme" (already lifted in PROJECT.md). |
| BAR | localhost, `host:port` and IP fixup (a current bug) | URIFixup | S | `typedAddressTargetOf` in `chrome-bar-widget.tsx`, or a `fixupUri` kind |
| BAR | Real Switch to Tab (it currently navigates the current tab and duplicates) | Switch-to-tab rows (`UrlbarProviderOpenTabs.sys.mjs`) | S | `activateWidget` on the existing web-tab widget; suggestion rows from `chrome-bar-places-suggestions.ts` |
| BAR | Engine search suggestions | `UrlbarProviderSearchSuggestions.sys.mjs` (on by default in Firefox) | M | Search area in PowerBrowserAPI. Sending keystrokes to an engine needs a privacy-default decision. |
| BAR | Inline autofill of origins | `UrlbarProviderAutofill.sys.mjs` | M | `autofill` kind (moz_origins) plus `setSelectionRange` |
| BAR | Default engine picker | `about:preferences#search` | M | `listSearchEngines` and `setDefaultSearchEngine`; feeds SMODE-01 |
| BAR | Alt+Enter, Ctrl+click and middle-click open in a new tab | `whereToOpenLink` | S | `WebTabOpenHandler.openUrl` `where` |
| BAR | Shift+Del removes a history row | `UrlbarController.sys.mjs:571-580` (`#dismissSelectedResult`) | S | First Places write; re-rules `INTERNAL-APIS.md:36` |
| BAR | Select all on first click; IME composition guard | `UrlbarInput.mjs:5976-6005` (composition) | S | Pill `onFocus`/`onCompositionStart` |
| BAR | Pill context menu with Paste & Go | — | M | MenuPath pattern in `layout-controls-widget.tsx:81-130`; `readClipboardText` kind |
| BAR | Row favicons and type icons | — | S | Favicon field (PAGE- groundwork) |
| NAV | Stop; Reload becomes Stop while loading; Esc stops | `toolbar-button-stop` (`browserContext.ftl:76`); `key_stop` Esc (`browser-sets.inc.xhtml`) | S | Existing `browser.stop()`; loading flag already pushed |
| NAV | Hard reload: Shift+click, Ctrl+Shift+R, Ctrl+F5 | `key_reload_skip_cache`, `key_reload_skip_cache2` | S | `bypassCache` on `webTabReload` |
| NAV | Back/Forward history menu (right-click or long-press) | session history menu | M | `webTabHistory` and `webTabGotoIndex` kinds over `sessionHistory`; `.lm-Menu` |
| NAV | Home button and Alt+Home | `navbar-home` (`browser.ftl:1289`), `goHome` Alt+Home | S | Theia preference plus `webTabNavigate` |
| NAV | Shortcut text in button tooltips | "Go back one page ({ $shortcut })" (`browserContext.ftl:15-18`) | S | `KeybindingRegistry` |
| KEY | Ctrl+T, Ctrl+W, Ctrl+R/F5, Alt+Left/Right, Alt+D, F6, Alt+1-9, Ctrl+Tab and Ctrl+PageUp/PageDown, all working with the page focused | `browser-sets.inc.xhtml` (`key_newNavigatorTab`, `key_close` reserved, `key_reload`, `goBackKb`, `focusURLBar2`, `key_selectTab1..`) | S each, M for the relay | Generalise the reserved-key block in `powerbrowser/shell/powerbrowser.js` (Ctrl+L at about :320-330) into one `{kind:'shortcut', id}` push; Theia keybindings need when-clauses |
| SITE | Real security state; "Not Secure" on http | `urlbar-trust-icon-notsecure-label = Not Secure` (`browser.ftl:1532`); `browser-siteIdentity.js` | M | `securityState` in `webTabPush` (`PowerBrowserAPI.sys.mjs` about :3385) and `WebTabState` (`web-tab.ts` about :150). Replaces the `startsWith('https://')` test at `chrome-bar-widget.tsx:648`, which is misleading today. |
| SITE | Site information panel: connection, permissions, clear cookies and site data | `identity-site-information`, `identity-connection-secure`/`not-secure`, `identity-clear-site-data`, `identity-permissions-*` (`browser.ftl:422-479`) | L | Popover primitive; `webTabSiteInfo`, `webTabSetPermission`, `webTabClearSiteData` kinds |
| MENU | Hamburger menu in every mode | Order from `appmenu-viewcache.inc.xhtml`: New Tab, New Window · Bookmarks, History, Downloads, Passwords, Extensions and Themes · Print, Save Page As, Find in Page, Zoom (− % +), Full Screen · Settings, More Tools, Help · Quit (`appmenu.ftl:22-77`) | S for the button, M for its contents | MenuPath/ContextMenuRenderer pattern; `openStockTab` allow-list (`PowerBrowserAPI.sys.mjs` about :1108) for `about:preferences`, `about:logins`, `about:addons`. Drop New Private Window, Tab groups, AI window, Report Broken Site and the account rows. |
| PAGE | Find in page: Ctrl+F, F3, highlight all, match case, whole words, match count | `findbar.ftl`: "Find in page", "Highlight All", "Match Case", "Match Diacritics", "Whole Words", "{ $current } of { $total } matches", "Phrase not found", wrap messages | L | `webTabFind`/`webTabFindClose` over `browser.finder` plus a result push. The bar must shrink the page rect, not hide the page. |
| PAGE | Zoom: Ctrl+plus/minus/0 and a % chip in the pill | `browser-fullZoom.js` (`browser/components/tabbrowser/content/`); `appmenuitem-zoom-*` | M | `webTabZoom` and a zoom field in the push |
| PAGE | Print (Ctrl+P on a web tab) | `navbar-print` "Print this page… ({ $shortcut })" | M | `webTabPrint`. **Ctrl+P is Theia's Go to File**, so it must be scoped to web-tab focus. |
| PAGE | Favicons on tab, strip and pill | — | M | Favicon field in the push (shared groundwork) |
| PAGE | Audio indicator and mute (Ctrl+M) | `key_toggleMute` (control+M) | M | `DOMAudioPlayback` listener plus `webTabMute` |
| PAGE | Downloads button and panel | `browser/components/downloads/content/downloads.js` | L | First a live check of what an overlay download does today; then a `Downloads.getList` push |
| PAGE | Window fullscreen (F11) and page (video) fullscreen | `key_fullScreen`; DOMFullscreen | M / L | **F11 is Theia debug Step Into** (`@theia/debug/.../debug-frontend-application-contribution.js:702`), so it needs scoping |
| BMK | Bookmark star, Ctrl+D, edit-bookmark popover | `urlbar-star-add-bookmark` "Bookmark this page ({ $shortcut })", `urlbar-star-edit-bookmark` (`browser.ftl:177-184`); `browser-places.js` | M + M | `addBookmark`/`removeBookmark` Places writes; popover primitive |
| BMK | Reopen closed tab (Ctrl+Shift+T) | `key_undoCloseTab` | M | Closed rows in `tabs.sqlite` plus `shellArmWebTabHistory` |
| BMK | Clear recent history (Ctrl+Shift+Del) | `key_sanitize` | M | Sanitizer kind that also clears `tabs.sqlite` closed rows |
| BMK | Bookmarks toolbar (Ctrl+Shift+B) | `viewBookmarksToolbarKb` | L | `listBookmarkFolder('toolbar')` plus a Places observer push |
| PROMPT | Permission requests: camera, mic, location, notifications | `browser/modules/PermissionUI.sys.mjs`. **Today it cancels silently** because the shell window has no `PopupNotifications` (`PermissionUI.sys.mjs:533-537`). | XL | PopupNotifications-compatible shim on the shell window, a doorhanger push and a `doorhangerAction` kind |
| PROMPT | alert, confirm, prompt, beforeunload, HTTP auth | `browser/actors/PromptParent.sys.mjs`. With no `gBrowser.getTabDialogBox` it falls back to a **window-modal** prompt (`PromptParent.sys.mjs:222, 294-298`). | L | Live check of the current behaviour first; then relay to Theia dialogs |
| PROMPT | Page right-click context menu | `browser/actors/ContextMenuParent.sys.mjs`, `browser/base/content/nsContextMenu.sys.mjs` | L | Forward the actor message to a Theia `.lm-Menu` |
| PROMPT | `target=_blank` and `window.open` open a web tab | `nsIBrowserDOMWindow` (`browser/modules/BrowserDOMWindow.sys.mjs`) | L | Must branch on the opener. GUI-01 (`browser-window-command.ts`) depends on the shell window having **no** `nsIBrowserDOMWindow` (CLAUDE.md rule 5). |
| PROMPT | Password and form autofill popup | `toolkit/components/passwordmgr/LoginManagerParent.sys.mjs`; PopupAutoComplete | M (popup) + L (save doorhanger) | `autocompletepopup` attribute and the element in `powerbrowser.xhtml`; the save prompt goes through the PROMPT shim |
| EXT | Extensions (puzzle) menu: list, open popup, Manage | `unifiedExtensions.ftl`: "Extensions", "Manage extensions", "Pin to Toolbar", "Manage Extension", "Remove Extension" | XL | See the Anti-Features and Pitfalls note: `ext-browserAction.js` is tied to CustomizableUI and to `navigator:browser` windows |

### Differentiators (Competitive Advantage)

These set PowerBrowser apart from Firefox and from VS Code, and they follow from the Core Value ("reshape its GUI through Theia extensions").

| REQ | Feature | Value Proposition | Complexity | Notes |
|-----|---------|-------------------|------------|-------|
| SMODE | One pill for both browser search modes and the Theia command centre | No other browser or IDE combines the address bar and the command centre in one input. Coding gets VS Code's Ctrl+P surface where the address bar is. | M | Built on the public `QuickAccessRegistry`, so any Theia extension's provider appears in the pill automatically |
| SMODE | Default mode set by the PowerBrowser mode | The pill does what the current mode is for: files in Coding, addresses in Browsing, tabs in Organising | S | Keyed on the three shipped mode ids; custom modes use Address |
| SMODE | Actions = Theia commands in a "Browser" category | One registration gives a palette entry, a keybinding and an Actions row. Downstreams add browser actions by contributing commands, with no fork. | S | Firefox's quick-action list (`QuickActionsLoaderDefault.sys.mjs`) is the checklist of which commands to register |
| SMODE | Command-centre rows that survive a URL-shaped query | Typing `localhost:4000` while coding visits the dev server; typing `README.md` opens the file | S | The SMODE-07 rule |
| BAR | One-off engine buttons and search-mode chip | Firefox parity that Chrome lacks | M | The dropdown engine rows are the one-off surface; separate one-off buttons under the results are optional |
| BAR | Restrict tokens `^ * % ? #` in every mode | Power-user parity with Firefox | S | `restrict` field on `searchPlaces`; SMODE-06 |
| NAV | Middle-click Back/Reload duplicates the tab | Firefox parity | M | `webTabDuplicate` |
| PAGE | Reader view (F9) | Firefox parity | M | `isArticle` in the push; `about:reader` chrome-side |
| MENU | Help submenu with `configuration.toml` help URLs | Rebrand-driven, so it supports Core Value | M | Generator surface |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Rebuild Firefox's full `UrlbarProvidersManager` stack in Theia | "Exact parity" | More than 40 providers (`browser/components/urlbar/UrlbarProvider*.sys.mjs`), many of them Mozilla services (Merino, Suggest, AI chat) | `Services.search` plus Places kinds, and spike one headless `urlbarQuery` kind only if parity gaps remain |
| Render Theia's stock quick-input widget inside the pill by moving DOM nodes | "Reuse what exists" | Breaks on every Theia re-pin, and fights monaco's focus handling | `QuickAccessRegistry.getPicks` into our own dropdown; stock widget only for `@` and `:` |
| Rebind Ctrl+P, F1 and Ctrl+Shift+P globally to the pill in v1.5 | "Command centre is the Coding default" | Loses monaco's `@`/`:` live preview and changes muscle memory for every Theia user | Keep the stock keys; the pill is an extra entry point. Revisit after live use. |
| Bind Firefox keys globally (Ctrl+P print, F5 reload, F11 fullscreen, Ctrl+K search, Ctrl+T) | Firefox muscle memory | Clashes with Theia: Ctrl+P Go to File, F5 debug start, F11 debug Step Into, `ctrlcmd+k` chord prefix, `ctrlcmd+t` workspace symbol in Electron, `alt+w` close | When-clauses scoped to web-tab focus or Browsing; the page-focus relay fires only when the page owns focus |
| Treat dotted names as URLs in Command centre | Consistent with Browsing | `README.md` and `main.py` would navigate to Moldova and Paraguay domains | SMODE-07 unambiguous-URL rule |
| Persist the picked search mode across submits | "Sticky engine" | Firefox chose not to (`persistSearchMode = false`), and it hides the default from the user | Reset after commit (SMODE-04); the default engine picker covers "always use X" |
| CustomizableUI: drag toolbar items | Firefox has it | It customises `browser.xhtml` chrome, which PowerBrowser does not author (gap list, Not applicable) | A Theia layout preference later (gap list: L) |
| Re-implement WebExtension `browserAction` inside Theia from scratch | "Extensions must work in web tabs" | `ext-browserAction.js` calls `CustomizableUI.createWidget` (:195), `gUnifiedExtensions` and `ViewPopup`. `windowTracker` and `tabTracker` only see `windowtype="navigator:browser"` (`toolkit/components/extensions/parent/ext-tabs-base.js:1739-1742`), and the shell is `powerbrowser:main` (`powerbrowser/shell/powerbrowser.xhtml:21`). Web tabs inside Theia are not tabs to the WebExtension API at all. | Spike before writing EXT requirements (see Gaps). The fallback is a puzzle menu that lists extensions and opens their options and popups, with per-tab actions working only in the stock window. |
| Mozilla account, Sync, Firefox Suggest, Report Broken Site, AI chat rows, private window | Present in Firefox's app menu and pill | Mozilla services or out of scope (PROJECT.md) | Omit from the menu and dropdown |
| Clipboard URL suggestion row | Firefox has `UrlbarProviderClipboard` | Reads the clipboard on focus, which is a privacy decision | Paste & Go in the pill context menu (explicit user action) |
| `about:` pages as web tabs | One click to Settings | Deliberate scheme wall | `openStockTab` allow-list decision, made once |

## Feature Dependencies

```
Search area in PowerBrowserAPI (Services.search kinds)
    ├──required by──> BAR search fallback ──> BAR suggestions, one-offs, placeholder engine name
    └──required by──> SMODE engine rows ──> SMODE-01 dropdown

SMODE-01 dropdown (popover primitive)
    ├──requires──> popover/menu primitive (.pb-chrome-bar-dropdown portal + MenuPath)
    ├──requires──> BAR listSearchEngines
    └──hosts──> SMODE Command centre (QuickAccessRegistry.getPicks)

SMODE Actions mode
    └──requires──> browser actions registered as Theia commands ("Browser" category)
                       └──each requires──> its own NAV/PAGE/BMK/MENU feature

KEY page-focus shortcut relay (generalised reserved-key table, powerbrowser.js)
    └──required by──> every KEY row, Ctrl+D, Ctrl+Shift+T, Ctrl+F/F3, zoom keys, print, F11, Ctrl+M

Wider webTabPush (securityState, zoom, favicon, audible, displaySpec, crashed)
    └──required by──> SITE lock/Not Secure, PAGE zoom chip, favicons, mute, BAR row favicons

Web-tab action kinds (handleGroupMutation + verify-web-tab-bridge.mjs)
    └──required by──> NAV stop/hard reload/history menu, PAGE find/zoom/print/mute

Places-write policy (re-rule INTERNAL-APIS.md:36)
    └──required by──> BMK star/editor/toolbar/clear history, BAR Shift+Del

openStockTab allow-list decision
    └──required by──> MENU Settings/Passwords/Add-ons, SMODE "Search Settings", EXT "Manage extensions"

Shell-window shims (PopupNotifications, nsIBrowserDOMWindow, prompt relay, context-menu forwarding)
    └──required by──> all PROMPT rows, password save doorhanger

PROMPT window.open-as-tab ──conflicts──> GUI-01 stock-window escape hatch (unless keyed by opener)
PAGE Print on Ctrl+P ──conflicts──> Theia Go to File on Ctrl+P (scope by focus)
PAGE F11 fullscreen ──conflicts──> Theia debug Step Into on F11 (scope by focus)
SMODE '>' Actions ──overlaps──> Theia '>' commands (resolved: one registry, category filter)
```

### Dependency Notes

- **SMODE requires the popover primitive and the engine list.** The dropdown is the first popover and should establish the primitive. The app menu, site panel and bookmark editor reuse it.
- **Actions mode requires the features it lists.** Each Firefox quick action becomes available only once its command exists. Ship Actions with whatever commands exist; each later phase adds rows.
- **The shortcut relay must come before any KEY, BMK or PAGE keyboard row.** Without it a focused page swallows every key except the reserved Ctrl+L.
- **window.open-as-tab conflicts with GUI-01.** A shell-window `nsIBrowserDOMWindow` would also catch the Theia frontend's own `window.open(url, '_blank')`, which is how the stock browser window opens today. The implementation must hand Theia-frame openers back to the stock-window path, and GUI-01's check must stay green.

## MVP Definition

### Launch With (v1.5)

Ordered so groundwork lands with its first consumer:

- [ ] BAR search fallback + localhost/host:port fixup + real Switch to Tab. The bar is labelled as a search box but cannot search, and it cannot open dev URLs.
- [ ] SMODE-01..08: dropdown, per-mode defaults, chip, prefix table, Command centre via `QuickAccessRegistry`. This is Chris's headline feature, and it builds the popover primitive.
- [ ] KEY relay + Ctrl+T/W/R, Alt+Left/Right, Alt+D, F6, Alt+1-9 (scoped when-clauses)
- [ ] NAV Stop, hard reload, history menu, Home
- [ ] SITE real security state + "Not Secure"; site information panel with permissions and clear site data
- [ ] MENU hamburger in every mode, with Settings, Passwords and Add-ons through the allow-list decision
- [ ] PAGE find, zoom, print, favicons, mute, fullscreen; downloads after its live check
- [ ] BMK star + Ctrl+D + editor, reopen closed tab, clear history, bookmarks toolbar
- [ ] PROMPT permission requests, alert/confirm/auth relay, page context menu, window.open as web tab, form/password autofill
- [ ] EXT puzzle menu, scoped by the spike result

### Add After Validation (v1.x)

- [ ] Route Ctrl+P, F1 and Ctrl+Shift+P into the pill's Command centre. Trigger: Chris uses the pill and prefers it.
- [ ] Per-site zoom memory. Trigger: zoom chip in use.
- [ ] Inline autofill and input-history ranking. Trigger: BAR basics stable.
- [ ] OpenSearch "Add {engine}" rows (SearchModeSwitcher `MAX_OPENSEARCH_ENGINES`). Trigger: engine picker exists.
- [ ] Tab strip parity (context menu, reorder, middle-click close). This was not in Chris's four areas; confirm.

### Future Consideration (v2+)

- [ ] Full WebExtension tab identity for in-Theia web tabs. Likely a patch-stack change in `browser/components/extensions`.
- [ ] Certificate viewer, protections panel, HTTPS-Only toggle, Picture-in-Picture, translations, screenshots.
- [ ] Toolbar item order and visibility preference (CustomizableUI substitute).

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| BAR search fallback + fixup + switch-to-tab | HIGH | LOW | P1 |
| SMODE dropdown + Command centre | HIGH | MEDIUM | P1 |
| KEY relay + core shortcuts | HIGH | LOW-MEDIUM | P1 |
| NAV stop / hard reload | HIGH | LOW | P1 |
| SITE security state + Not Secure | HIGH | MEDIUM | P1 |
| MENU hamburger | HIGH | LOW | P1 |
| PAGE find in page | HIGH | HIGH | P1 |
| PAGE zoom, print, favicons, mute | HIGH | MEDIUM | P1 |
| PROMPT permissions + dialogs | HIGH | HIGH | P1 (sites break without them) |
| PROMPT window.open as tab | HIGH | HIGH | P1 |
| BMK star, reopen closed tab, clear history | HIGH | MEDIUM | P1 |
| PROMPT context menu, autofill | MEDIUM | HIGH | P2 |
| SITE site info / permissions panel | MEDIUM | HIGH | P2 |
| BAR suggestions, autofill, one-offs, Paste & Go | MEDIUM | MEDIUM | P2 |
| BMK bookmarks toolbar | MEDIUM | HIGH | P2 |
| PAGE downloads panel | MEDIUM | HIGH | P2 |
| NAV history menu, Home | MEDIUM | LOW-MEDIUM | P2 |
| EXT puzzle menu | MEDIUM | HIGH (XL, unknown) | P2 after spike |
| PAGE reader view, devtools | LOW | MEDIUM | P3 |

## Competitor Feature Analysis

| Feature | Firefox 153 | VS Code / Theia | PowerBrowser approach |
|---------|-------------|-----------------|-----------------------|
| Mode picker in the input | Unified search button: engines, Bookmarks, Tabs, History, Actions, Search Settings | Command centre launches Quick Open; `?` lists providers | One dropdown with Firefox's rows plus a Command centre row |
| Default | Address + default engine | Files (no prefix) | Set by PowerBrowser mode: Coding = Command centre, Browsing = Address, Organising = Tabs (proposed) |
| Prefixes | `^ * % ? >` + space enter modes; `@alias`; `+ # $` restrict | `> @ : # ?` and word prefixes stay in the text | Table SMODE-06: Theia meanings in Command centre, Firefox meanings elsewhere, `% * ^` everywhere |
| Actions | Fixed quick-action list | Commands registry | Actions = Theia commands in the "Browser" category |
| Mode display | Icon; label + x in search mode; per-mode placeholder | Prefix visible in text; provider placeholder | Icon + chip; x only when not at the PowerBrowser-mode default; placeholder from the provider descriptor |
| Mode lifetime | Per tab, cleared after submit | Until the widget closes | Cleared on commit, revert, tab switch or mode switch |

## Sources

Pinned upstream (HIGH, primary source):
- `upstream/browser/components/urlbar/content/SearchModeSwitcher.mjs` (whole file)
- `upstream/browser/components/urlbar/content/UrlbarInput.mjs:124-151, 1420-1423, 2341-2356, 2725-2760, 2868-2882, 5976-6005`
- `upstream/browser/components/urlbar/UrlbarController.sys.mjs:313-580`
- `upstream/browser/components/urlbar/UrlbarUtils.sys.mjs:291-326`
- `upstream/browser/components/urlbar/content/UrlbarShared.mjs:46-72`
- `upstream/browser/components/urlbar/UrlbarProviderHeuristicFallback.sys.mjs:128-145, 235-270`
- `upstream/browser/components/urlbar/UrlbarProviderTokenAliasEngines.sys.mjs:63`
- `upstream/browser/components/urlbar/QuickActionsLoaderDefault.sys.mjs:80-335`
- `upstream/browser/components/urlbar/UrlbarPrefs.sys.mjs:442-450`; `upstream/browser/app/profile/firefox.js:451`
- `upstream/browser/locales/en-US/browser/browser.ftl:137-140, 177-184, 399-408, 422-479, 538-594, 860-920, 1277-1296, 1532`
- `upstream/browser/locales/en-US/browser/appmenu.ftl`, `browserContext.ftl`, `browserSets.ftl`, `unifiedExtensions.ftl`
- `upstream/toolkit/locales/en-US/toolkit/main-window/findbar.ftl`
- `upstream/browser/base/content/appmenu-viewcache.inc.xhtml` (menu order), `browser-sets.inc.xhtml` (keys)
- `upstream/browser/modules/PermissionUI.sys.mjs:533-537`; `upstream/browser/actors/PromptParent.sys.mjs:215-298`
- `upstream/browser/components/extensions/parent/ext-browserAction.js:9-40, 195`; `upstream/toolkit/components/extensions/parent/ext-tabs-base.js:1739-1742`
- `upstream/browser/modules/BrowserDOMWindow.sys.mjs`, `browser/actors/ContextMenuParent.sys.mjs`, `browser/base/content/browser-places.js`, `browser/base/content/browser-siteIdentity.js`, `browser/components/tabbrowser/content/browser-fullZoom.js`, `browser/components/downloads/content/downloads.js`, `toolkit/components/passwordmgr/LoginManagerParent.sys.mjs`

Installed Theia 1.76.0 (HIGH, primary source): `theia/node_modules/@theia/core/lib/browser/quick-input/{quick-access.d.ts, quick-command-service.js, quick-command-frontend-contribution.js, quick-help-service.js, quick-view-service.js}`, `@theia/file-search/lib/browser/{quick-file-open.js, quick-file-open-contribution.js}`, `@theia/monaco/lib/browser/{monaco-quick-access-registry.js, monaco-gotosymbol-quick-access.js, monaco-gotoline-quick-access.js, workspace-symbol-command.js}`, `@theia/editor/lib/browser/quick-editor-service.js`, `@theia/terminal/lib/browser/terminal-quick-open-service.js`, `@theia/task/lib/browser/quick-open-task.js`, `@theia/debug/lib/browser/{debug-prefix-configuration.js, debug-frontend-application-contribution.js}`, `@theia/core/lib/browser/common-frontend-contribution.js`.

This tree: `.planning/research/chrome-bar-firefox-gap.md`; `theia/extensions/chrome-bar/src/browser/{chrome-bar-widget.tsx, chrome-bar-suggestion-service.ts, chrome-bar-keybindings.ts, layout-controls-widget.tsx}`; `theia/extensions/tab-uris/src/browser/web-tab.ts:99`; `powerbrowser/shell/powerbrowser.js` (reserved keys); `powerbrowser/shell/powerbrowser.xhtml:21`.

Web (MEDIUM): [VS Code 1.69 release notes, Command Center](https://code.visualstudio.com/updates/v1_69); [VS Code user interface docs](https://code.visualstudio.com/docs/getstarted/userinterface) (Ctrl+P, Ctrl+Shift+P, Ctrl+Shift+O, Ctrl+G).

## Gaps

- **EXT feasibility.** WebExtension `tabs` and `browserAction` cannot see in-Theia web tabs (`ext-tabs-base.js:1742` versus `powerbrowser.xhtml:21`). A spike must decide between a puzzle menu over the stock window only, a tab adapter, and a patch, before EXT requirements are written. Content scripts probably still inject into overlay pages; this was not verified.
- **Organising default.** Tabs (recommended) or Address: Chris decides.
- **Coding pill with a web tab active.** Option one keeps the Command centre default (Chris's rule as stated). Option two switches to Address whenever the active widget is a web tab. This spec assumes option one, plus Ctrl+L/Alt+D/F6 and the heuristic row.
- **Current prompt behaviour is unverified live.** The source says alert() falls back to a window-modal dialog and permission requests are cancelled. Check both live before sizing PROMPT.
- **Tab strip rows** in the gap list are outside Chris's four named areas. Confirm whether they are in v1.5.
- **Search suggestions privacy default.** Firefox enables them. PowerBrowser's telemetry defaults to off, which suggests suggestions should default to off. This is a product decision.

---
*Feature research for: Firefox-toolbar parity in a Theia-hosted browser chrome bar*
*Researched: 2026-10-20*
