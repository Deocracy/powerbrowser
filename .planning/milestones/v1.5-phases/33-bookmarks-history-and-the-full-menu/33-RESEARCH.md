# Phase 33: Bookmarks, History and the Full Menu - Research

**Researched:** 2026-10-22
**Domain:** Firefox Places (bookmarks/history) writes, closed-tab reopen, clear-history fan-out, bookmarks toolbar + observer push, hamburger History submenu, full MENU-03 entries, Actions-mode rows — all inside Theia chrome-bar driving chrome-owned overlay web tabs
**Confidence:** HIGH for integration points and contracts (read in-session in this tree + pinned research); MEDIUM for upstream runtime behaviour (not run live); LOW for Phase 31/31.1/32 assumed outputs (do not exist yet)

<objective>
"What are the exact integration points, constraints, and recommended approaches for the bookmark/history/menu work?"
</objective>

<user_constraints>
## User Constraints (from 33-CONTEXT.md)

**CRITICAL:** These are NON-NEGOTIABLE. Planner must honour them.

### Locked Decisions
- Places writes go only through `PowerBrowserAPI`, never raw SQL and never a second writer in the Theia backend (ROADMAP Phase 33 notes; 29-CONTEXT Places ruling).
- The `127.0.0.1` token cookie is exempt from every clear-data kind (technical ruling 2026-10-20; Phase 31 probe 13 carries the planted-clear check, this phase reuses it).
- Chrome-bar copy reads the configured application name, never a hard-coded brand (BAR-14 carries forward).
- Firefox keys that clash with Theia keys take the browser meaning only while a web page has focus (KEY ruling 2026-10-20); T-27-18/KEY-04 pattern carries forward.
- Actions that open UI are commands; actions that change state run only from that UI's event handlers, never as command ids (research D7 / Phase 27 privileged-kind rule).
- No Theia core patch; `@theia/*` consumed as dependencies only (hard rule 1).
- No Firefox internal outside `PowerBrowserAPI.sys.mjs` (hard rule 2); new touchpoints are end-of-file rows, append-only catalogue (Phase 27 rule).
- Command centre never sends typed text to a search engine (SMODE-07 second half; MODE_SENDS already `resolve:false` — this phase gates it, it does not re-decide it).
- D-01: star is a button at the pill's right end, inside the pill, after the input: outline `codicon-star-empty` unbookmarked, filled `codicon-star-full` bookmarked, aria-label from copy.
- D-02: editor is a `.pb-chrome-bar-dropdown` portal panel anchored to the star (name field, folder picker, Remove button, Done), not a Theia dialog.
- D-03: a bookmarked visit shows as a bookmark row (never a history row); Shift+Delete keeps its Phase 29 rule (history rows only).
- D-04: toolbar is a collapsible row rendered by the chrome bar below the pill row, in the top panel, shown in every PowerBrowser mode when `browser.showBookmarksToolbar` is true.
- D-05: live refresh comes from a Places bookmark observer installed chrome-side that pushes a `bookmarks-changed` state update; the toolbar re-reads `listBookmarkFolder('toolbar')`.
- D-06: closed-tab source is `tabs.sqlite` rows with `closed_at` non-null (NG-005/NG-010 write path exists); sessionstore `_closedTabs` merge at startup only.
- D-07: Ctrl+Shift+T reopens the most-recently-closed row in a new web tab and restores its session history through `shellArmWebTabHistory` (the 27-02 path).
- D-08: BMK-06 is a History submenu inside the hamburger (Recent pages + Recently closed tabs sections), not a second chrome-bar button.
- D-09: one `clearHistory` privileged store kind fans out chrome-side to Places history, `tabs.sqlite` closed rows, thumbnails, saved pages and web-tab history; ranges: last hour / 2 hours / 4 hours / today / everything.
- D-10: picker is the star-editor portal pattern (anchored panel), opened from the History submenu and from Ctrl+Shift+Del.
- D-11: hamburger button + Firefox-ordered skeleton come from Phase 31; this phase appends exactly the MENU-03 entries in ROADMAP order (New Tab, New Window, Bookmarks submenu, History submenu, Downloads, Print, Save Page As, Find in Page, Zoom submenu, Full Screen, More Tools submenu, Help submenu).
- D-12: New Window opens the stock window through the existing `openBrowserWindow`/`openStockTab` path; no second shell window.
- D-13: every menu entry and every Actions row runs the same `Browser`-category command id; Actions lists whatever Browser commands exist at enumeration time.
- D-14: Full Screen rows call the Phase 35 fullscreen path when it lands; until then the row runs `window.fullScreen` chrome-side behind the same command id.
- D-15: Ctrl+D, Ctrl+Shift+T, Ctrl+Shift+B, Ctrl+Shift+Del work Theia-focused via chrome-bar keybindings AND page-focused via page-focus relay rows (Phase 27 pattern).

### Claude's Discretion
- Exact portal geometry, submenu open delays, toolbar overflow behaviour (wrap vs scroll vs chevron), folder-picker depth, and plant names in the new gates — use Phase 27/29/30 precedents.
- Whether `clearHistory` deletes open-tab rows: no — open rows (`closed_at` null) survive, matching `pruneClosedTabRows` semantics.

### Deferred Ideas (OUT OF SCOPE — do NOT research or plan)
- BMK-07 (bookmark one/all tabs from the tab menu) — Phase 34.
- Library window (`about:places`), import-from-browser, warn-on-close, update banner, profiles, containers.
- Per-site "forget this site"; Bookmarks/History side views (`queryHistory`); screenshot/translate/PiP/page-info/unload-tab.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Places reads/writes, history range clear, sessionstore projection, token-cookie strip, closed-tab rows | Gecko chrome (`PowerBrowserAPI.sys.mjs` — the ONE boundary) | — | Hard rule 2: no Firefox internal outside the boundary; Places single-writer rule |
| Toolbar, star + editor popover, history menu, hamburger + submenus, clear picker, keybindings, Actions listing, copy | Theia frontend (`@powerbrowser/chrome-bar` `address-bar/` + `chrome-bar-widget.tsx`) | — | Theia is the default GUI; all user-operated chrome-bar UI is Theia DOM (portal `.pb-chrome-bar-dropdown` / `.lm-Menu`) |
| Store transport (actor request/reply, relay allow-list, client methods) | Bridge (`GroupActorChild/Parent` pair + `ChromeStoreClient` + `tab-store-access-protocol.ts`) | — | One channel, one boundary file; store kinds dispatch in `handleStoreRequest`, never `handleGroupMutation` |
| Closed-tab persistence (`tabs.sqlite` open/closed rows, sweep, prune) | Gecko chrome + SQLite file | Theia triggers reopen via existing `webTabOpen` + `shellArmWebTabHistory` | D-06/D-07: `tabs.sqlite` is the live source; sessionstore merge at startup only |
| Verification (derived gates, set-equality, `--self-test`) | Scripts (`scripts/verify-*.mjs` + `verify-platform.sh` registry) | — | Every new contract extends a derived gate in the same commit, never a hand-kept list |
</architectural_responsibility_map>

<research_summary>
## Summary

Researched how to deliver BMK-01..BMK-06 + MENU-03 + SMODE-07 without breaking the four load-bearing invariants: (1) Places single writer, (2) privileged-kind rule, (3) append-only boundary catalogue, (4) token-cookie exemption.

What was researched: the exact chrome-side touchpoints that already exist (`readHistoryEntry`, `readBookmarkByUrl`, `listBookmarkFolder`, `searchPlacesRestricted`, `removeHistoryEntry`, `projectSessionStoreTabs`/`parseSessionStoreClosedRows`, `shellArmWebTabHistory`/`takeWebTabHistory`, `openStockTab`/`openBrowserWindow`, `quitApplication`, token-cookie strip), the upstream Firefox modules they wrap (`PlacesUtils.bookmarks`/`history`/`observers` — never `Sanitizer`, D-09b — `SessionStore.getBrowserState`/`_closedTabs`), the Theia-side listing paths that already exist (Actions mode enumerates `Browser`-category commands; `CompoundMenuNode` + `ContextMenuRenderer` for history menus), and the gate pattern every plan must extend.

Standard approach: everything new is a **store kind** (`handleStoreRequest` end-of-file function + `STORE_REQUEST_KINDS` entry + `ChromeStoreClient` method) or a **command id** (`chrome-bar-commands.ts` + `Browser` category), classified in `verify-web-tab-bridge.mjs` rule 12, copy in `CHROME_BAR_COPY`, with derived set-equality gates. No new npm package, no Gecko patch, no Theia core edit, no second Places writer, no second shell window.

Key recommendations:
1. Add `addBookmark` / `updateBookmark` / `removeBookmark` (+ `moveBookmark` if folder picker needs it) as **privileged** store kinds over `PlacesUtils.bookmarks.insert/update/remove`; reads keep using `readBookmarkByUrl`/`listBookmarkFolder`/`searchPlacesRestricted`.
2. Reopen = `tabs.sqlite` closed rows (ordered by `closed_at` desc) + `webTabOpen` + `armWebTabHistory`; sessionstore `_closedTabs` only merges at startup via the existing sweep.
3. `clearHistory` = one privileged kind fanning out chrome-side to `PlacesUtils.history.removeVisitsByFilter` range-clear (D-09b, never `Sanitizer`) + `tabs.sqlite` closed rows + thumbnails + `saved-pages` + web-tab history file; token cookie explicitly exempt with a planted-clear check.
4. Toolbar refresh = `PlacesUtils.observers` `bookmark-added/removed/moved/url-changed` listener chrome-side (D-05b quartet) → `bookmarks-changed` push to the shell window's own Theia frame → toolbar re-reads toolbar folder; star filled state follows the same push filtered to the active tab URL.
5. MENU-03 = append entries into the Phase 31 hamburger skeleton in Firefox order; every entry and every Actions row runs the same `Browser` command id (D-13); Phase 32 commands are invoked, never duplicated.

**Primary recommendation:** One privileged `clearHistory` kind + three privileged bookmark-write kinds + observer-push state update, all end-of-file in `PowerBrowserAPI.sys.mjs`, bookmark/clear kinds classified `privileged` and `fullScreen` classed `window-chrome` (D-14b/N1 — the `full-screen` command id Actions also runs would trip the privileged command-named fence) in the bridge gate, all copy in `CHROME_BAR_COPY`, with the Actions/menus as thin command-id enumerations over the Phase 31/32 command surface.
</research_summary>

<standard_stack>
## Standard Stack

### Core (pinned — nothing moves this milestone)

| Library / Module | Version / Path | Purpose | Why Standard |
|------------------|----------------|---------|--------------|
| Gecko / Firefox ESR | `FIREFOX_153_5_0esr_BUILD1` (153.5.0) | Every browser capability below | Already pinned and built; all upstream line citations below were checked at this tag [CITED: .planning/research/STACK.md] |
| Eclipse Theia | 1.76.0 (`@theia/core`, `@theia/monaco`, `@theia/file-search`, `@theia/workspace`) | Chrome-bar UI, menus, dialogs, quick access | Every Theia API needed is already composed; **no new npm dependency** [CITED: .planning/research/SUMMARY.md] |
| `PowerBrowserAPI.sys.mjs` lazy-getter block | `powerbrowser/shell/PowerBrowserAPI.sys.mjs:14-38` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:14-38] | The only route to every Firefox module | CLAUDE.md rule 2 / D-96; each new import is one line in `ChromeUtils.defineESModuleGetters(lazy,{...})` plus a catalogue row |
| Group actor channel | `handleGroupMutation` + `handleStoreRequest` + push `webTabPush` | Theia→chrome requests, chrome→Theia pushes | All new kinds go beside existing `webTab*`/`store` cases behind `webTabIdIsValid` + `groupSenderIsTheia` + `storeSenderInShellWindow` |

Quoted discrete values (in-repo provenance — read this session, verbatim):

```js
// [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:3697-3713]
const STORE_REQUEST_KINDS = new Set([
  "readHistoryEntry",
  "readBookmarkByUrl",
  "listBookmarkFolder",
  "projectSessionStoreTabs",
  "queryTabsWithPlaces",
  "searchPlaces",
  "setSetting",
  "savePageCopy",
  "resolveTypedAddress",
  "listSearchEngines",
  "placesFavicons",
  "searchSuggestions",
  "autofillOrigin",
  "removeHistoryEntry",
  "readClipboardText",
]);
```

```ts
// [VERIFIED: theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts:13]
export type LocalModeId = 'address' | 'command-centre' | 'bookmarks' | 'tabs' | 'history' | 'actions';
// [VERIFIED: theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts:65-73]
'command-centre': { resolve: false, suggestions: false, autofill: false, places: false },
'bookmarks': { resolve: false, suggestions: false, autofill: false, places: true },
'history': { resolve: false, suggestions: false, autofill: false, places: true },
'actions': { resolve: false, suggestions: false, autofill: false, places: false },
```

```ts
// [VERIFIED: theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts:30]
export const CHROME_BAR_COMMAND_CATEGORY = 'Browser';
```

### Gecko modules, by feature (all consumed only from `PowerBrowserAPI`)

| Need | Upstream module + API | Chrome-side precedent in tree | Confidence |
|------|----------------------|-------------------------------|------------|
| Bookmark point read | `PlacesUtils.bookmarks.fetch({url})` (`toolkit/components/places/Bookmarks.sys.mjs:fetch :1510`) | `readBookmarkByUrl` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:2597-2612] | HIGH |
| Bookmark folder list | `PlacesUtils.getFolderContents(guid,false,false).root` + `root.containerOpen=true` iteration | `listBookmarkFolder` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:2620-2645] | HIGH |
| Bookmark write (NEW) | `PlacesUtils.bookmarks.insert(info)` :230, `.update(info)` :687, `.remove(guid)` :1265; roots `toolbarGuid/menuGuid/unfiledGuid` :123-125 | None yet — follow `removeHistoryEntry` end-of-file pattern [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:4617-4629] | HIGH for API shape [CITED: .planning/research/STACK.md]; MEDIUM for exact `insert` info fields until plan re-reads `:230` |
| History point read | `PlacesUtils.history.fetch(url)` | `readHistoryEntry` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:2577-2590] | HIGH |
| History range clear (NEW, D-09b) | `PlacesUtils.history.removeVisitsByFilter({beginDate,endDate})` (`toolkit/components/places/History.sys.mjs:429-448`; verified filter shape this session) | None yet — follow the `removeHistoryEntry` end-of-file pattern; never `Sanitizer` at all (`showUI` needs `gDialogBox` at `browser/modules/Sanitizer.sys.mjs:124-133`, absent in the `powerbrowser:main` shell which loads no `browser.js`/`browser-init.js`/stock popupsets, and its item prefs are never set there) | HIGH (verified upstream/ this session) |
| Single-row history remove | `PlacesUtils.history.remove(url)` (also clears visits/frecency/`moz_origins`) | `removeHistoryEntry` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:4623-4629] | HIGH |
| Live bookmark refresh (NEW, D-05b) | `PlacesUtils.observers`: `addListener(["bookmark-added","bookmark-removed","bookmark-moved","bookmark-url-changed"], fn)` — the quartet stock chrome registers at `browser/base/content/browser-places.js:1783-1789` (verified upstream/ this session; `BookmarkList.sys.mjs:81-87` re-registers the trio minus `bookmark-moved`); remove on shell unload; push target is the shell window's own Theia frame (`findShellWindow()` at `PowerBrowserAPI.sys.mjs:1003-1004` → `#powerbrowser-content` at `powerbrowser.xhtml:58` / `SHELL_CONTENT_BROWSER_ID` at `:287-288`) because the observer fires chrome-side with no actor sender | None yet — STACK prescribes this as the toolbar/star push | HIGH (verified upstream/ + tree this session) |
| Closed tabs at startup | `SessionStore.getBrowserState()` JSON + per-window `_closedTabs` (`SessionStore.sys.mjs`) | `parseSessionStoreClosedRows` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:2766-2788] | HIGH |
| History-carrying reopen | `SessionHistory.collectFromParent` / `SessionStoreUtils.restoreDocShellState` + `shellArmWebTabHistory`/`takeWebTabHistory` | `saveWebTabHistories`/`takeWebTabHistory` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:763-810]; arm path [VERIFIED: theia/extensions/tab-uris/src/browser/profile-storage.ts:175-179] | HIGH |
| Restricted Places lists | `PlacesUtils.promiseDBConnection()` + `executeCached` with bound `:pattern`/`:cap` | `searchPlacesRestricted` bookmark/history SQL [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:4668-4707] | HIGH |
| Favicon per URL | `PlacesUtils.favicons.getFaviconForPage(uri,16)` | `placesFavicons` helper [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:4453-4467] | HIGH |
| Stock-window open | `Services.ww.openWindow(..., AppConstants.BROWSER_CHROME_URL, ...)`; `gBrowser.addWebTab(spec)` | `openBrowserWindow` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:1049-1059]; `openStockTab` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:1107-1130] | HIGH |
| Quit | `Services.obs.notifyObservers(cancelQuit,"quit-application-requested")` + `Services.startup.quit(eAttemptQuit)` | `quitApplication` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:701-715] | HIGH |
| Token-cookie strip | `http-on-modify-request` observer removing `POWERBROWSER_TOKEN=` from `Cookie` header unless `tokenCookieAllowed(channel)` | `tokenCookieStrip`/`installTokenCookieStrip` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:4549-4611] | HIGH |

### Supporting (Theia-side, already in tree)

| Piece | Path | What Phase 33 reuses | Confidence |
|-------|------|---------------------|------------|
| Actions listing | `address-bar/address-bar-modes.ts:150-172` (`ActionsAddressBarMode.provide`) [VERIFIED] | Enumerates `category===CHROME_BAR_COMMAND_CATEGORY`, visible+enabled, `matches(text,label)`, `run: executeCommand(id)` — Phase 33 adds commands, not the listing path | HIGH |
| Tabs/Bookmarks/History modes | `address-bar-modes.ts:71-141` [VERIFIED] | `PlacesAddressBarMode` calls `store.searchPlaces(text,cap,restrict)`; bookmarked visit → `bookmark` source (D-03) | HIGH |
| Store client | `chrome-store-client.ts:160-207` (`searchPlaces`, `resolveTypedAddress`, `removeHistoryEntry`, `readClipboardText`) [VERIFIED] | Add `addBookmark/updateBookmark/removeBookmark/clearHistory/...` methods in same `field<T>(msg,name)` shape | HIGH |
| Relay allow-list (read-only today) | `tab-store-access-protocol.ts:58-65` (`TAB_STORE_RELAY_KINDS`) [VERIFIED: theia/extensions/tab-uris/src/browser/tab-store-access-protocol.ts:58-65] | Privileged/network kinds **never enter** the relay (rule 12); bookmark-write + `clearHistory` stay actor-only | HIGH |
| History back/forward menu | `chrome-bar-widget.tsx:334-384` (`openHistoryMenu`: `tab.history()` → `CompoundMenuNode` + `ContextMenuRenderer`, `HISTORY_MENU_PATH`) [VERIFIED: theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:330-384] | Pattern for the BMK-06 History submenu (sections for recent pages + closed tabs) and editor popover anchor math + `onHide` focus restore | HIGH |
| Keybindings | `chrome-bar-keybindings.ts` (Ctrl+L `when: '!editorFocus && !terminalFocus'`; pill-scoped F6/passthrough) [VERIFIED] | Add Ctrl+D / Ctrl+Shift+T / Ctrl+Shift+B / Ctrl+Shift+Del in the same file + page-focus relay rows (D-15) | HIGH |
| Copy contract | `chrome-bar-copy.ts` (`CHROME_BAR_COPY` frozen object + `appSubject()`) [VERIFIED: theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts:11-79] | Every new sentence lives here; `verify-shell-error-copy.mjs` pins it by set equality | HIGH |
| Preferences | `chrome-bar-preferences.ts` (`browser.showHomeButton`, `browser.homePage`, `browser.defaultSearchEngine`, `browser.searchSuggestions`) [VERIFIED] | Add `browser.showBookmarksToolbar` (User scope, boolean, default per UI spec) in the same schema | HIGH |
| Closed-row SQL | `closeTabRow`/`pruneClosedTabRows` (`closed_at` null = open; `pruneClosedTabRows` deletes only `closed_at IS NOT NULL AND closed_at < cutoff`) [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:2658-2665] | `clearHistory` deletes only closed rows in range; open rows survive (Claude's discretion) | HIGH |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Sanitizer` for history range | Hand-rolled `DELETE FROM moz_places WHERE last_visit_date ...` | **Rejected:** raw Places SQL breaks Places invariants (frecency, origins, observers); `history.remove` precedent already proves the API path [CITED: .planning/research/PITFALLS.md] |
| `tabs.sqlite` closed rows as reopen source | Live `sessionstore _closedTabs` merge every Ctrl+Shift+T | **Rejected (D-06):** second live source disagrees on order; sessionstore merge at startup only via existing sweep |
| Theia dialog for editor/clear picker | `.pb-chrome-bar-dropdown` portal panel | **Rejected (D-02/D-10):** Theia DOM dialog hides the page via blocking layer; portal does not (Phase 27 overlay rule) |
| Second hamburger-adjacent button for History | History submenu inside the hamburger | **Rejected (D-08):** MENU-03 already requires a History entry; avoids a new button + overflow cost |
| Theia-backend `better-sqlite3` writing `places.sqlite` | `PlacesUtils.bookmarks/history` from `PowerBrowserAPI` only | **Rejected:** second writer corrupts Places connection invariants [CITED: .planning/research/STACK.md:169] |
| `PlacesTransactions.NewBookmark().transact()` | `bookmarks.insert/update/remove` | Use transactions only if bookmark undo is in scope (it is not); otherwise `insert` [CITED: .planning/research/STACK.md] |
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
User intent (star, Ctrl+D/T/B/Del, menu click, Actions row, toolbar click)
  │
  ▼
Theia chrome-bar (address-bar/ + chrome-bar-widget.tsx + keybindings)
  │  UI-opening intents ──► CommandRegistry `Browser`-category command id
  │  state-changing intents ──► widget event handler ──► ChromeStoreClient method
  ▼
PowerBrowserGroup actor pair (GroupActorChild ⇄ Parent)
  │  walls: groupSenderIsTheia + storeSenderInShellWindow (windowtype powerbrowser:main)
  ▼
handleStoreRequest (end-of-file section, PowerBrowserAPI.sys.mjs)
  ├── bookmark writes ──► PlacesUtils.bookmarks.insert/update/remove (+ observers notify)
  ├── history clear ──► removeVisitsByFilter({beginDate,endDate}) range clear (D-09b, never Sanitizer) + tabs.sqlite closed-rows delete
  │                      + thumbnails + saved-pages + web-tab-history file
  ├── reads ──► PlacesUtils.history.fetch / bookmarks.fetch / getFolderContents
  │             / searchPlacesRestricted / SessionStore.getBrowserState
  └── token-cookie strip (http-on-modify-request) exempts POWERBROWSER_TOKEN everywhere
  │
  ▼
Pushes back to Theia (webTabPush / state channel)
  ├── `bookmarks-changed` ──► star re-read + toolbar re-read listBookmarkFolder('toolbar')
  └── reopened tab ──► webTabOpen + shellArmWebTabHistory ──► history-carrying tab
```

A reader traces BMK-01 end to end by following the arrows: star click → handler → `addBookmark` kind → `bookmarks.insert` → observer fires → `bookmarks-changed` push → star fills + toolbar refreshes.

### Recommended Project Structure (files touched, none created outside these)

```
powerbrowser/shell/PowerBrowserAPI.sys.mjs   # end-of-file: addBookmark/updateBookmark/removeBookmark/clearHistory/
                                             #   bookmarks-changed observer + push, clearHistory fan-out helpers
powerbrowser/INTERNAL-APIS.md                # append-only rows for each new touchpoint
theia/extensions/chrome-bar/src/browser/
  address-bar/address-bar.tsx                # star button (D-01), pill wiring
  address-bar/address-bar-modes.ts           # Actions listing unchanged; Bookmark/History modes unchanged
  chrome-bar-widget.tsx                      # toolbar row, hamburger + History submenu, clear picker anchor
  chrome-bar-commands.ts                     # every MENU-03 / Actions command id (Browser category)
  chrome-bar-keybindings.ts                  # Ctrl+D/T/B/Del Theia rows + page-focus relay rows
  chrome-bar-copy.ts                         # every new sentence via appSubject()
  chrome-bar-preferences.ts                  # browser.showBookmarksToolbar
theia/extensions/tab-uris/src/browser/
  chrome-store-client.ts                     # same-named methods for each new privileged kind
scripts/verify-*.mjs                         # extend gates in the same commit (see Validation Architecture)
```

### Pattern 1: Privileged store kind (bookmark writes, clearHistory, clipboard precedent)
**What:** State-changing kind that runs only from a widget event handler, never gets a command id or key-relay row, never enters `TAB_STORE_RELAY_KINDS`. Classified `privileged` in `verify-web-tab-bridge.mjs` rule 12.
**When to use:** Every BMK-01/02/05 write in this phase.
**Example:**
```js
// Source: PowerBrowserAPI.sys.mjs:4617-4629 (removeHistoryEntry — the first Places-write precedent, read this session)
async function removeHistoryEntry(url) {
  const target = storeUrlArg(url);
  if (!/^https?:\/\//i.test(target)) {
    throw new Error("removeHistoryEntry: refusing a non-http(s) url");
  }
  return Boolean(await lazy.PlacesUtils.history.remove(target));
}
```
```ts
// Source: chrome-store-client.ts:199-202 (same-named client method, read this session)
removeHistoryEntry(url: string): Promise<boolean> {
    return this.field<boolean>({ kind: 'removeHistoryEntry', url }, 'removed');
}
```

### Pattern 2: Actions row = command id, nothing else (research D7)
**What:** `ActionsAddressBarMode.provide` enumerates visible+enabled `Browser`-category commands; each row's `run` is `executeCommand(id)`. No store kind is reachable from a command.
**When to use:** SMODE-07 rows and every MENU-03 entry (D-13: same id in both surfaces).
**Example:**
```ts
// Source: address-bar-modes.ts:160-170 (read this session)
return this.commands.commands
    .filter(command => command.category === CHROME_BAR_COMMAND_CATEGORY && !!command.label
        && this.commands.isVisible(command.id) && this.commands.isEnabled(command.id) && matches(text, command.label))
    .map((command): Row => ({
        key: 'action:' + command.id, source: 'action', title: command.label ?? '', caption: '', url: '',
        badges: this.keybindings.getKeybindingsForCommand(command.id).map(binding => this.keybindings.acceleratorFor(binding, '+').join(' ')),
        run: async () => { await this.commands.executeCommand(command.id); },
    }));
```

### Pattern 3: Observer push → re-read (toolbar + star, D-05)
**What:** Chrome installs one `PlacesUtils.observers.addListener([...], fn)`; on fire it pushes `bookmarks-changed`; Theia re-reads (`readBookmarkByUrl` for the star, `listBookmarkFolder('toolbar')` for the toolbar). Filter chrome-side to the active tab's URL for the star to avoid push floods on bulk ops [CITED: .planning/research/PITFALLS.md:479].
**When to use:** BMK-01 filled state + BMK-04 live refresh.
**Upstream anchor:** `PlacesUtils.observers` (`PlacesUtils.sys.mjs:464`), `addListener(["bookmark-added","bookmark-removed","bookmark-moved","page-removed"], fn)` [CITED: .planning/research/STACK.md]. Remove the listener on shell unload (same discipline as `startTabStoreTriggers`).

### Pattern 4: History-carrying reopen (D-07)
**What:** Ctrl+Shift+T reads the most-recently-closed `tabs.sqlite` row (`closed_at` max, non-null), calls the existing `webTabOpen` path, then `armWebTabHistory(rowKey)` so chrome restores via `takeWebTabHistory` on next open.
**When to use:** BMK-03.
**Precedents:** `closeTabRow`/`pruneClosedTabRows` write path [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:1595-1665 region]; arm path `armWebTabHistory(rowKey)` [VERIFIED: theia/extensions/tab-uris/src/browser/profile-storage.ts:175-179]; restore path `takeWebTabHistory` + `SessionHistory` collect/restore [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:763-836].

### Pattern 5: CompoundMenu + ContextMenuRenderer submenu (history menu precedent)
**What:** Build a `CompoundMenuNode` with section children, render via `ContextMenuRenderer` anchored to the button rect, `onHide` restoring focus unless a choice was made.
**When to use:** BMK-06 History submenu (Recent pages + Recently closed tabs) and the hamburger skeleton fill.
**Example:** `openHistoryMenu` [VERIFIED: theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:334-384] — per-request `CompoundMenuNode`, `HISTORY_MENU_PATH = ['powerbrowser-chrome-bar-history']`, anchor `{x: rect.left, y: rect.bottom}`, `onHide: setTimeout(...)` focus restore.

### Pattern 6: Token-cookie exemption (binding constraint)
**What:** Every clear-data path must leave `POWERBROWSER_TOKEN` (host-only `127.0.0.1`) intact. The strip observer already withholds it from non-sidecar requests; `clearHistory` must additionally filter it out of any cookie/site-data clear it fans out to.
**When to use:** BMK-05 design + verification (planted-clear check: plant the cookie, run clear, require survival).
**Precedent:** `tokenCookieStrip` removes `POWERBROWSER_TOKEN=` from the `Cookie` header unless `tokenCookieAllowed(channel)` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:4579-4602]; `TOKEN_COOKIE_NAME = "POWERBROWSER_TOKEN"` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:4561].

### Anti-Patterns to Avoid
- **Raw SQL against `places.sqlite`:** breaks frecency/origins/observer invariants; use `PlacesUtils.bookmarks/history` only.
- **A second writer in the Theia backend:** Places has one connection + invariants; all writes ride the actor through the one chrome writer.
- **Privileged kind with a command id or key row:** any code in the Theia origin (extensions, AI tools) can invoke commands; state changes stay behind widget event handlers (rule 12).
- **Star read only at navigation time:** goes stale on stock-window/Library edits; needs the observer push (Pitfall: PITFALLS:320).
- **Shift+Delete on bookmark/tab rows:** Firefox removes history-sourced rows only; keep the Phase 29 source gate (D-03).
- **Giving the shell an `nsIBrowserDOMWindow` to open tabs:** breaks GUI-01 and every Theia `window.open` (PITFALLS Pit 1); D-12 uses `openBrowserWindow`/`openStockTab`, never a shim.
- **Hand-kept expectation lists in gates:** derive at check time, compare as set equality, `--self-test` with planted faults (Phase 27 rule).
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bookmark CRUD + folder roots | Own GUID scheme / own toolbar store | `PlacesUtils.bookmarks.insert/update/remove`, roots `toolbarGuid/menuGuid/unfiledGuid`, `getFolderContents` listing | GUIDs, roots, observers, frecency joins and Library interop are upstream invariants; a parallel store desyncs on every stock-window edit |
| History range delete | `DELETE FROM moz_places ...` | `PlacesUtils.history.removeVisitsByFilter({beginDate,endDate})` (D-09b) | The platform API owns frecency/origins/observer coupling; raw SQL leaves orphans and skips observers; `Sanitizer` is unusable in the shell (no `gDialogBox`, prefs unset) |
| Bookmark-change notification | Polling `listBookmarkFolder` on a timer | `PlacesUtils.observers.addListener` + `bookmarks-changed` push | Polling races multi-window edits and floods; observers are the stock push path |
| Closed-tab history restore | Serialising `entries[]` yourself | `shellArmWebTabHistory` → `takeWebTabHistory` → `SessionStoreUtils.restoreDocShellState` | Triggering principals + subframe trees + index are already handled by the 27-02 path |
| Search-engine submission | String-concat engine URLs | Existing `resolveTypedAddress` (fixup → engine submission → http(s) wall, chrome-minted) | Chrome mints the only search URL; content never builds one (BAR-01 precedent) |
| Menus/popovers | Custom absolutely-positioned divs | `.pb-chrome-bar-dropdown` portal + `CompoundMenuNode`/`ContextMenuRenderer` | Occlusion, anchor math, focus restore and theme already solved there |
| Key dispatch while page focused | Global Theia keybindings alone | Theia rows + page-focus relay rows (Phase 27 pattern; Theia rows disabled while overlay has focus) | Reserved keys must keep Monaco/Theia meaning everywhere except with a page focused (KEY ruling) |
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Second Places writer (PITFALLS Pit 10 / STACK:169)
**What goes wrong:** Theia backend writes `places.sqlite` directly (or a second chrome path bypasses `PlacesUtils`); Places invariants break, Library/stock-window edits desync.
**Why it happens:** SQL familiarity; the tab-store precedent makes raw SQLite look normal — but `tabs.sqlite` is ours, `places.sqlite` is upstream's.
**How to avoid:** All bookmark/history writes are `PlacesUtils.bookmarks/history` calls in `PowerBrowserAPI.sys.mjs` end-of-file functions behind privileged store kinds. Gate: no new `better-sqlite3` Places path.
**Warning signs:** A plan mentions `places.sqlite` file path, `ATTACH DATABASE`, or Theia-backend SQL for bookmarks.

### Pitfall 2: Privileged kind reachable from a command/key/relay (PITFALLS Pit 7)
**What goes wrong:** Any Theia-origin code (extensions, AI tools) invokes the state-changing kind; clipboard/history/bookmark writes fire without a user gesture.
**Why it happens:** Convenience — wiring a command id is easier than a widget handler.
**How to avoid:** Rule 12: privileged kinds run only from `address-bar.tsx`/widget event handlers through same-named `ChromeStoreClient` methods; never a command id, key row, or `TAB_STORE_RELAY_KINDS` entry. Gate `verify-web-tab-bridge.mjs` classifies every kind or goes red.
**Warning signs:** A plan adds `registerCommand` or a keybinding whose handler sends `addBookmark`/`clearHistory`/`removeHistoryEntry`.

### Pitfall 3: Token-cookie logout on clear (PITFALLS Pit 6)
**What goes wrong:** `clearHistory` (or site-data clear) deletes the port-less `127.0.0.1` token cookie; backend answers 403; IDE disconnects.
**Why it happens:** Cookies are not port-scoped; Sanitizer/SiteDataManager clear by host, and `127.0.0.1` matches the sidecar.
**How to avoid:** Exempt `POWERBROWSER_TOKEN` by name chrome-side in every clear path; reuse the Phase 31 probe-13 planted-clear check (plant cookie → clear → require survival). Never log cookie values.
**Warning signs:** A clear plan that does not name the exemption, or that clears "cookies" without a carve-out.

### Pitfall 4: Stale star / Shift+Delete on the wrong source (PITFALLS:320-321)
**What goes wrong:** Star shows outline on a bookmarked page (edited in Library/stock window); Shift+Delete deletes a bookmark or open-tab row.
**Why it happens:** Star read once at navigation; row source not carried.
**How to avoid:** Observer push refreshes star + toolbar (D-05); every row carries `source`, and the Shift+Delete gate admits `history` only (D-03 carries 30-03 forward).
**Warning signs:** A plan re-reads bookmark state only in `onCurrentWidgetChanged`.

### Pitfall 5: Observer push flood (PITFALLS:479)
**What goes wrong:** Bookmark import/sync fires hundreds of notifications; every push triggers full re-reads.
**Why it happens:** Unfiltered listener forwards everything.
**How to avoid:** Filter chrome-side to the active tab's URL for the star; toolbar re-read is already a single `listBookmarkFolder('toolbar')`. Live check includes a bulk-operation case.

### Pitfall 6: `nsIBrowserDOMWindow` vs GUI-01 (PITFALLS Pit 1 — constrains D-12)
**What goes wrong:** Adding the shim to open page links as tabs breaks the reachable stock window; Theia `window.open` calls stop falling through to `AppWindow::CreateNewContentWindow`.
**Why it happens:** The object is per-window; overlays and the Theia frame share one chrome window.
**How to avoid:** D-12: New Window uses existing `openBrowserWindow`/`openStockTab`; no shim, no second shell window in this phase.

### Pitfall 7: Silent upstream fallbacks (PITFALLS Pit 3)
**What goes wrong:** A feature appears to work but the actor bailed silently (e.g. a `Sanitizer` path wanting `parentWindow.gDialogBox`, absent in the shell — D-09b uses `removeVisitsByFilter` instead).
**Why it happens:** Shell lacks `browser.xhtml` furniture; stock code falls back to window-modal or throws.
**How to avoid:** Use `removeVisitsByFilter` range deletes (D-09b), never `Sanitizer` at all; every new live script runs with `-purgecaches` and asserts a positive page-side outcome (deleted rows gone, cookie survives, reopened tab has history).

### Pitfall 8: Hand-kept gate lists (Phase 27 rule)
**What goes wrong:** A gate compares against a literal copied from the tree; additions and removals both pass silently.
**Why it happens:** Copy-paste of ids/labels/kinds into the script.
**How to avoid:** Derive at check time, compare as set equality, `--self-test` plants faults each of which must go red naming the drift. See Validation Architecture.

<threat_model>
## Threat Model

| Threat | Surface | Mitigation (binding) | Verification |
|--------|---------|---------------------|--------------|
| Malicious/buggy Theia-origin code invokes privileged kinds | Actor channel (`PowerBrowserGroupRequest`) | Walls `groupSenderIsTheia` + `storeSenderInShellWindow` (windowtype `powerbrowser:main`) [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:3743-3747]; privileged kinds only from widget event handlers; never in `TAB_STORE_RELAY_KINDS` | Bridge gate rule 12 + sender-wall live probe |
| URL smuggling into Places writes / reopen / stock tabs | `storeUrlArg` + scheme gates | `storeUrlArg` refuses missing/oversized urls [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:3736-3741]; `removeHistoryEntry` refuses non-http(s) [VERIFIED: :4623-4629]; `openStockTab` admits `about:newtab` + http(s) only [VERIFIED: :1107-1130]; `takeWebTabHistory` admits http(s) entries only [VERIFIED: :794-810] | Negative live cases (file:/chrome:/javascript:) refused |
| Token theft / forced logout | Cookie header on loopback; clear-data fan-out | Strip observer withholds token off sidecar port [VERIFIED: :4579-4602]; `clearHistory` exempts it by name; never logged (no log line carries URL/title/cookie) | Planted-clear check (Phase 31 probe 13 reused) |
| Reflected PII in logs/replies | Error paths, push logs | Fixed-text errors; `handleStoreRequest` withholds Places errors; `sendWebTabPush` logs kind+error only [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:4206-4214] | `verify-shell-error-copy` + log-grep live check |
| Profile-path leak in errors | IOUtils/SQLite rejections | `tabStoreFailureClass` fixed classes; history-file write logs `err.name` only [VERIFIED: :776-782] | Error-copy gate |
| Quit held by flush | `runQuitFlushSync` | Bounded spin (`quitFlushTimeoutMs`), never throws [VERIFIED: :729-746] | Existing quit gates (NG-032/33) stay green |
</threat_model>
</common_pitfalls>

<code_examples>
## Code Examples

### Bookmark point read (existing — the write kinds mirror this shape)
```js
// Source: PowerBrowserAPI.sys.mjs:2597-2612 (read this session)
async readBookmarkByUrl(url) {
  try {
    const found = await lazy.PlacesUtils.bookmarks.fetch({ url });
    const item = Array.isArray(found) ? found[0] : found;
    if (!item) { return null; }
    return { guid: item.guid ?? "", title: item.title ?? "", url: item.url ?? url };
  } catch { return null; }
}
```

### Folder listing with container discipline (existing)
```js
// Source: PowerBrowserAPI.sys.mjs:2620-2645 (read this session)
listBookmarkFolder(folderGuid) {
  try {
    const root = lazy.PlacesUtils.getFolderContents(folderGuid, false, false).root;
    root.containerOpen = true;   // upstream opens it first: PlacesUtils.sys.mjs:1390
    const rows = [];
    try {
      const count = root.childCount;
      for (let i = 0; i < count; i++) {
        const node = root.getChild(i);
        rows.push({ guid: node.bookmarkGuid ?? "", title: node.title ?? "", url: node.uri ?? "" });
      }
    } finally { root.containerOpen = false; }
    return rows;
  } catch { return []; }
}
```

### Store dispatch arm (where each new kind lands)
```js
// Source: PowerBrowserAPI.sys.mjs:3805-3810 (read this session)
case "removeHistoryEntry": {
  return { ok: true, kind, removed: await removeHistoryEntry(data.url) };
}
case "readClipboardText": {
  return { ok: true, kind, text: readClipboardText() };
}
```

### Client method shape (every new kind gets one)
```ts
// Source: chrome-store-client.ts:199-207 (read this session)
removeHistoryEntry(url: string): Promise<boolean> {
    return this.field<boolean>({ kind: 'removeHistoryEntry', url }, 'removed');
}
readClipboardText(): Promise<string> {
    return this.field<string>({ kind: 'readClipboardText' }, 'text');
}
```

### Reopen arm (existing — BMK-03 reuses it, does not rebuild it)
```ts
// Source: profile-storage.ts:175-179 (read this session)
async armWebTabHistory(rowKey: string): Promise<boolean> {
    const reply = await this.request({ kind: 'shellArmWebTabHistory', key: rowKey });
    return reply !== NO_CHROME && reply.ok;
}
```

### Command contract (every MENU-03/Actions id joins this)
```ts
// Source: chrome-bar-commands.ts:19-36 (read this session)
export const CHROME_BAR_BACK_COMMAND_ID = 'powerbrowser.chrome-bar.back';
export const CHROME_BAR_COMMAND_CATEGORY = 'Browser';
export const CHROME_BAR_BACK: Command = { id: CHROME_BAR_BACK_COMMAND_ID, category: CHROME_BAR_COMMAND_CATEGORY, label: 'Back' };
```
</code_examples>

<sota_updates>
## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Read-only Places row (`INTERNAL-APIS.md:33-37`) | Re-rule once to admit `bookmarks.insert/update/remove`, `history.removeVisitsByFilter`, `PlacesUtils.observers` (never `Sanitizer`, D-09b) — all behind `PowerBrowserAPI` | 2026-10-20 (Chris ruling: chrome bar may write to Places) | This phase performs the re-rule; no other file touches Firefox internals |
| Suggest-only `searchPlaces` | `searchPlaces` + `restrict: 'bookmark'\|'history'` (newest-first, empty-text lists) | Phase 30 (`searchPlacesRestricted`) | BMK toolbar/modes already read through it; writes are the only new chrome surface |
| Per-feature ad-hoc checks | Derive-from-tree + set-equality + `--self-test` gates in `verify-platform.sh` | Phases 27/29/30 | Phase 33 extends gates, never invents a sibling driver |

**New tools/patterns to consider:** none — no new npm package, no Gecko patch, no Theia core edit for any recommended item [CITED: .planning/research/SUMMARY.md].

**Deprecated/outdated:** showing `about:places` Library or `Sanitizer.showUI` in-shell — both want `browser.xhtml` furniture (`gDialogBox`) the shell lacks; use direct `removeVisitsByFilter` + Theia portal UI instead (D-09b).
</sota_updates>

<validation_architecture>
## Validation Architecture (binding — planner must turn each row into plan checks)

Rules that hold for every gate in this phase (Phase 27 precedent, carried by 33-CONTEXT Established Patterns):
1. **Derive from the tree and compare** — never a hand-kept expectation list. `verify-registry-shape.mjs` and `verify-shell-error-copy.mjs` derive at check time and compare as set equality so additions AND removals go red.
2. **Every new live script gets a `--self-test`** that plants faults and requires each one to go red naming the drift.
3. **Live probes run with `-purgecaches`** and assert positive page-side outcomes (rows gone, cookie survives, reopened tab has history, toolbar updated), never the absence of a log line.
4. **Recursive scans cover `address-bar/`** — every `chrome-bar/src/browser` scan recurses into `address-bar/` (30-01 precedent) or goes silently blind.

| Gate (create / extend) | What it derives | Set-equality assertion | `--self-test` plants |
|------------------------|-----------------|------------------------|----------------------|
| Extend `verify-web-tab-bridge.mjs` rule 12 (`STORE_KIND_CLASSES`) | Store kinds from `PowerBrowserAPI.sys.mjs` `case "…"` arms vs `WebTabMessage` union vs `ChromeStoreClient` methods vs `TAB_STORE_RELAY_KINDS` | New kinds `addBookmark`/`updateBookmark`/`removeBookmark`/`clearHistory` (+ `bookmarksChanged` push kind if a new push name is minted) each classified `privileged`; unclassified kind fails naming it [VERIFIED: scripts/verify-web-tab-bridge.mjs:88-104] | Unclassified planted kind; stale entry; planted relay leak |
| Extend `verify-chrome-bar-commands.mjs` (`EXPECTED_IDS`/`EXPECTED_LABELS`) | `*_COMMAND_ID` assignments + `label:` literals derived from `chrome-bar-commands.ts` + call-site imports | Every MENU-03/Actions command id + contracted label matches; surplus/missing names the drift [VERIFIED: scripts/verify-chrome-bar-commands.mjs:60-69] | Re-spelled id; missing label; command without const |
| Extend `verify-shell-error-copy.mjs` (`EXPECTED_WIDGET_COPY`) | Widget copy derived from `chrome-bar/src/browser` sources (incl. `address-bar/`) | Every new sentence in `CHROME_BAR_COPY` with `appSubject()`; no internal identifier reaches the error layer | Internal token/pref key in copy; sentence outside `CHROME_BAR_COPY` |
| Extend `verify-ng-040-internals-catalogue-lines.mjs` + `INTERNAL-APIS.md` | `check-internals-boundary.sh --catalogue` forbidden-pattern occurrences in `PowerBrowserAPI.sys.mjs` | One appended end-of-file row per new touchpoint (`bookmarks.insert/update/remove`, `observers.addListener`, `history.removeVisitsByFilter`, favicon reuse); line numbers renumbered via `--fix` | Uncatalogued occurrence; edited-in-place line |
| New/extend token-exemption live check (reuse Phase 31 probe 13) | Live browser: plant `POWERBROWSER_TOKEN` cookie + marker data in every `clearHistory` store | After clear over each of the 5 ranges: marker data gone everywhere, token cookie survives, backend still authed | Strip observer removed via `PowerBrowserTokenCookie` (self-test export [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:4613-4615]) must go red |
| New observer-push live check (star + toolbar) | Live browser: bookmark add/remove/move in stock-window Library + in chrome bar | Star fills/unfills without navigation; toolbar row appears/disappears; bulk-op case does not flood | Listener removed / push name changed must go red |
| New reopen live check (BMK-03) | Live browser: close 2+ tabs, Ctrl+Shift+T | Most-recently-closed reopens first with back/forward history intact (via armed row key); sessionstore-only entry from stock window appears after restart sweep | Armed key deleted / history file removed must go red |
| New clear-fan-out live check (BMK-05) | Plant URL in Places + closed rows + thumbnails + saved-pages + web-tab history + shell state URL entries | After `clearHistory` in range: all planted rows gone; open rows (`closed_at` null) survive; out-of-range rows survive | Each store un-cleared must go red naming the store |
| New menu/Actions coverage check | Derived `Browser`-category command enumeration vs MENU-03 list vs Actions rows | MENU-03 order = Firefox order (D-11); Actions rows = enumeration at runtime (missing Phase 32 commands simply absent, D-13); Command-centre `MODE_SENDS.resolve=false` asserted (SMODE-07 second half) | Removed command / reordered menu / resolve:true must go red |
| Keybinding gate (extend chrome-bar keybinding check) | Derived keybindings for Ctrl+D/T/B/Del (Theia rows + page-focus relay rows) | Both focus states bound; Theia rows disabled while overlay focused, relay rows enabled only then (KEY ruling) | Single-sided binding must go red |

All gates run under `scripts/verify-platform.sh --quick` (commit gate) or `--only <label>`; adding a check means appending one row to that registry, never a sibling driver.
</validation_architecture>

<assumes_from_earlier_phases>
## Assumes From Earlier Phases (code does not exist yet — plans may rely on these outputs)

| Assumed output | Producing phase | What Phase 33 plans may rely on | If it slips |
|----------------|-----------------|---------------------------------|-------------|
| Hamburger button + Firefox-ordered skeleton + `openStockPage` enum + security-state push + Quit path | Phase 31 | D-11 appends MENU-03 entries into the skeleton; Quit row reuses the Phase 31 path (MENU-04 is Phase 31, not this phase) | Blocked: no menu-path scaffolding is built; menu work proceeds with command ids only when the skeleton lands |
| Tab host behind `PowerBrowserAPI`; favicon/mute/zoom push fields for menu enablement | Phase 31.1 | Menu enablement (`isEnabled`) reads push state; mute/zoom rows reflect live state | Rows missing the field stay absent, never built as enabled-by-default; same ids |
| Find, Zoom, Print, Save Page As, Edit commands, downloads panel + commands, favicons, mute, source/reader/devtools/crashed-tab | Phase 32 | D-13: MENU-03 entries and Actions rows invoke these command ids; missing ones simply have no row yet (FEATURES dependency note) | Phase 33 registers its own BMK/clear/history/bookmark commands; Phase 32 ids appear as rows when they land — no Phase 33 rework |
| `Browser`-category convention + Actions enumeration + `MODE_SENDS` (`command-centre.resolve=false`) + default-mode table | Phase 30 (exists) | SMODE-07 second half is a gate (`resolve:false` asserted), not a re-decision; Actions listing path unchanged | — (already in tree [VERIFIED: address-bar-mode-table.ts:65-73; address-bar-modes.ts:150-172]) |
| Push router, page-focus relay rows, privileged-kind rule, popover primitive, Places-write policy re-rule intent | Phase 27/29 (exist) | D-15 keybinding pattern; D-02/D-10 portal pattern; `removeHistoryEntry`/`storeUrlArg` walls | — (already in tree) |
| Tab-strip mute/bookmark rows | Phase 34 (later) | Nothing — BMK-07 is explicitly deferred; Phase 34 depends on Phase 33, not vice versa | N/A |

Contract stability promise: command ids minted in Phase 33 (`Browser` category) are stable across the Phase 35 fullscreen handoff (D-14: same id, chrome-side implementation swaps to the Phase 35 path when it lands).
</assumes_from_earlier_phases>

<open_questions>
## Open Questions (RESOLVED — 33-01-T1 re-reads the upstream signatures at 153.5.0esr and pastes them into the implementation commit; Q4 grep-first per Minor findings SLIP-01/SLIP-02; Q5 decided by 33-UI-SPEC)

1. **Bookmark `insert` info-field exactness**
   - What we know: `PlacesUtils.bookmarks.insert(info)` at `Bookmarks.sys.mjs:230` (verified `insert(info)` :230-236), `update` at `:687` (verified `guid`-required :687-694), `remove` at `:1265` (verified GUID-or-info form :1266-1273), roots at `:121-125` (verified `rootGuid/menuGuid/toolbarGuid/unfiledGuid/mobileGuid`) [CITED: .planning/research/STACK.md]. Folder-guid validation shape already exists (`/^[A-Za-z0-9_-]{12}$/` [VERIFIED this session: powerbrowser/shell/PowerBrowserAPI.sys.mjs:4020]).
   - What's unclear: exact `insert` info fields (parentGuid/url/title) and `update` id-vs-guid form at 153.5.0esr without re-reading `:230`/`:687` in `upstream/`.
   - Recommendation: first plan task re-reads those two functions in `upstream/` and pastes the signatures into the plan; no code until then. Confidence: MEDIUM.

2. **`Sanitizer.sanitize` items + range shape — RESOLVED round-3: DO NOT USE**
   - What we know: `sanitize(items,{range})` at `:314`, `getClearRange` at `:250`, `TIMESPAN_*` at `:75-93` (`browser/modules/Sanitizer.sys.mjs`) [CITED: .planning/research/STACK.md]; never `showUI` (`:124` wants `gDialogBox`).
   - Resolution (verified 2026-10-23 against `upstream/`): the `powerbrowser:main` shell loads no `browser.js`, `browser-init.js` or stock popupsets, so no `gDialogBox` exists and the clear prefs Sanitizer reads are never set. The fan-out uses `PlacesUtils.history.removeVisitsByFilter({beginDate,endDate})` range deletes behind the one `clearHistory` kind instead — same five D-09 ranges, same exemption, no new internal (the `PlacesUtils` lazy import is already catalogued). D-09b records this.
   - Confidence: HIGH (mechanism replaced, not deferred).

3. **Observer notification names + payload — RESOLVED round-3**
   - What we know: `PlacesUtils.observers` at `PlacesUtils.sys.mjs:464` with `addListener([...], fn)` [CITED: .planning/research/STACK.md].
   - Resolution (verified 2026-10-23 against `upstream/`): subscribe to `["bookmark-added", "bookmark-removed", "bookmark-moved", "bookmark-url-changed"]` — the exact quartet stock chrome registers at `upstream/browser/base/content/browser-places.js:1783-1789` (`BookmarkList.sys.mjs:81-87` re-registers the same trio minus `bookmark-moved`; `TaggingService.sys.mjs:20,334,426` consumes `bookmark-moved`, so the move case is a real emitted name). There is no `bookmark-changed` event upstream; `bookmarks-changed` is only this phase's push-kind name. Push target is the shell window's own Theia frame — `findShellWindow()` at `powerbrowser/shell/PowerBrowserAPI.sys.mjs:1003-1004` → `#powerbrowser-content` at `powerbrowser/shell/powerbrowser.xhtml:58` (`SHELL_CONTENT_BROWSER_ID` at `PowerBrowserAPI.sys.mjs:287-288`) — because the observer fires chrome-side with no actor sender. Push payload carries only kind+folder (never title/url bulk). D-05b records this.
   - Confidence: HIGH.

4. **Phase 31/31.1/32 arrival order**
   - What we know: ROADMAP chains 31 → 31.1 → 32 → 33; CONTEXT D-11/D-13/D-14 assume their outputs.
   - What's unclear: which of the three actually landed and with what ids, at plan time.
   - Recommendation: first plan step greps the tree for the hamburger skeleton, `openStockPage`, and each Phase 32 command id; missing ones become absent-rows, never stubs. Confidence: LOW (code does not exist yet).

5. **Toolbar overflow + folder-picker depth (UI spec territory)**
   - What we know: CONTEXT leaves geometry, submenu delays, overflow (wrap/scroll/chevron) and picker depth to Claude's discretion via 27/29/30 precedents.
   - What's unclear: visual decisions needing the UI spec (this research does not decide them).
   - Recommendation: UI spec decides; research recommendation is wrap-avoiding horizontal scroll + chevron overflow, single-level folder picker (toolbar/menu/unfiled) first. Confidence: LOW (product call, not technical).
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence — read this session in this tree)
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` — lazy getters `:14-38`; `quitApplication` `:701-715`; `openBrowserWindow` `:1049-1059`; `openStockTab` `:1107-1130`; `readHistoryEntry` `:2577-2590`; `readBookmarkByUrl` `:2597-2612`; `listBookmarkFolder` `:2620-2645`; `parseSessionStoreClosedRows` `:2766-2788`; `STORE_REQUEST_KINDS` `:3697-3713`; `handleStoreRequest` `:3743-3818`; token strip `:4549-4615`; `removeHistoryEntry` `:4617-4629`; `readClipboardText` `:4638-4651`; `searchPlacesRestricted` `:4653-4707`
- `powerbrowser/INTERNAL-APIS.md:1-46` — one-boundary rule, append-only rule, privileged-kind rule
- `theia/extensions/tab-uris/src/browser/chrome-store-client.ts:160-207` — `searchPlaces`/`resolveTypedAddress`/`removeHistoryEntry`/`readClipboardText` client shapes
- `theia/extensions/tab-uris/src/browser/tab-store-access-protocol.ts:58-65` — `TAB_STORE_RELAY_KINDS` (read-only)
- `theia/extensions/tab-uris/src/browser/profile-storage.ts:175-179` — `armWebTabHistory`
- `theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts` — `LocalModeId:13`, `LOCAL_MODES:31-38`, `DEFAULT_MODE_BY_UI_MODE:41-45`, `MODE_SENDS:65-73`
- `theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts:71-172` — Tabs/Places/Actions providers
- `theia/extensions/chrome-bar/src/browser/address-bar/address-bar-rows.ts` — `RowSource:13`, `Row:16-36`, `composeRows`, `iconFor`, `classifyAddress`
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:330-384` — `openHistoryMenu` (`HISTORY_MENU_PATH`, `CompoundMenuNode`, anchor, `onHide`)
- `theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts:19-66` — `Browser` category + five command ids
- `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts:11-87` — `CHROME_BAR_COPY` + `appSubject()` + `historyLabel`
- `theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts` — Ctrl+L + pill-scoped passthrough pattern
- `theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts` — `browser.*` preference schema
- `scripts/verify-web-tab-bridge.mjs:88-104` — `STORE_KIND_CLASSES` classification
- `scripts/verify-chrome-bar-commands.mjs:60-69` — `EXPECTED_IDS`/`EXPECTED_LABELS` contract
- `.planning/PROJECT.md`, `.planning/ROADMAP.md` (Phase 33:366-381), `.planning/REQUIREMENTS.md` (BMK-01..07, MENU-03, SMODE-07 + header rulings), `.planning/phases/33-bookmarks-history-and-the-full-menu/33-CONTEXT.md`

### Secondary (MEDIUM confidence — pinned research, line numbers re-read by its authors at `FIREFOX_153_5_0esr_BUILD1`)
- `.planning/research/SUMMARY.md`, `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `chrome-bar-firefox-gap.md` — Places modules (never `Sanitizer`, D-09b), sessionstore `_closedTabs`, QuickActions list, menu order (`appmenu-viewcache.inc.html`), gap-list effort sizes
- Upstream paths named therein for plan-time re-read: `toolkit/components/places/Bookmarks.sys.mjs:123-125,230,687,1265,1510,1857`; `PlacesUtils.sys.mjs:464,1390`; `toolkit/components/places/History.sys.mjs:340,429-448` (D-09b; `browser/modules/Sanitizer.sys.mjs:124-133` cited only for why `Sanitizer` is unusable); `browser/components/urlbar/UrlbarUtils.sys.mjs:1073`; `browser/components/urlbar/QuickActionsLoaderDefault.sys.mjs:80-335`; `browser/components/urlbar/content/SearchModeSwitcher.mjs`; `resource:///modules/sessionstore/SessionStore.sys.mjs`

### Tertiary (LOW confidence — needs live validation)
- Runtime behaviour of `removeVisitsByFilter` range deletes in a `powerbrowser:main` shell window; observer notification volume on bulk ops; exact stock-window Library edit propagation timing — all covered by the live probes in Validation Architecture.
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Firefox Places writes + history range clear + sessionstore closed tabs through the one `PowerBrowserAPI` boundary
- Ecosystem: Theia chrome-bar (modes, menus, popovers, keybindings, copy, prefs), group-actor store channel, `verify-platform.sh` gate registry
- Patterns: privileged store kinds, command-id Actions/menus, observer-push refresh, history-carrying reopen, CompoundMenu submenus, token exemption
- Pitfalls: second writer, privileged reachability, token logout, stale star, push flood, GUI-01 shim, silent fallbacks, hand-kept lists

**Confidence breakdown:**
- Standard stack: HIGH — every cited in-tree symbol read this session; upstream signatures via pinned research
- Architecture: HIGH — all five patterns have in-tree precedents with file:line citations
- Pitfalls: HIGH — carried from PITFALLS pits 1/3/6/7/10/11 with in-tree mitigations
- Code examples: HIGH — verbatim from files read this session
- Upstream runtime behaviour: MEDIUM — not run live; live probes specified
- Assumed Phase 31/31.1/32 outputs: LOW — code does not exist yet; plans must grep-first

**Research date:** 2026-10-22
**Valid until:** 2026-11-21 (30 days — pinned ESR + Theia; upstream tags do not move this milestone)

**Requirement coverage:** BMK-01 (star+fill+Ctrl+D) §Patterns 1/3; BMK-02 (editor popover) §Patterns 1/5+D-02; BMK-03 (reopen+history) §Pattern 4; BMK-04 (toolbar+push) §Pattern 3+D-04/D-05; BMK-05 (clear fan-out+token exempt) §Pattern 6+D-09/D-10; BMK-06 (history menu) §Pattern 5+D-08; MENU-03 (full menu) §Pattern 2+D-11/D-12/D-14; SMODE-07 (Actions rows + Command-centre-never-sends) §Pattern 2 + MODE_SENDS gate.
</metadata>

---
*Phase: 33-bookmarks-history-and-the-full-menu*
*Research completed: 2026-10-22*
*Ready for planning: yes*
