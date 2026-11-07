# Phase 33: Bookmarks, History and the Full Menu - Context

**Gathered:** 2026-10-22
**Status:** Ready for UI spec / planning
**Mode:** `--auto` (Chris's standing autonomous rule: every gray area takes the recommended option, recorded with a one-line reason)

**Autonomous run log (2026-10-22 revision):** took the recommended option on every B/W finding (extend fences/gates instead of adding fallback paths) — one-line reason: fallbacks hide missing prerequisites and blind the derive-and-compare gates.

**Autonomous run log (2026-10-23 round-3 revision):** took the recommended option on every N/W finding — one-line reason each: (N1) `fullScreen` gets the command-reachable `window-chrome` class because the rule-12 gate fails any privileged kind named by a command file while MENU-03/D-13/SMODE-07 require a `full-screen` command id; (N2) `fullScreen` kind+arm+class+method+plant all land in 33-05 because classifying it in 33-01 trips the rule-12 stale check in 33-01's own verify; (B3) extend the existing `command-centre-privacy` scenario because it already exists with its Address-mode "hello" control; (W3) create `bookmark-keys` in 33-02 T3 because the KEY-ruling both-paths proof needs its own scenario; (W4) derive the MENU-03 entry list from ROADMAP.md at check time because a hand-kept list can only agree with itself; (W1/W2) name the push target as the shell window's Theia frame because the observer fires chrome-side with no actor sender.

## Assumes from earlier phases (grep-first; missing = blocked, never a fallback build)

- Phase 31 landed: hamburger button const + Firefox-ordered skeleton + `openStockPage {page}` enum + `quitApplication` path + probe-13 planted-clear shape (token-cookie survival). If grep finds no skeleton, stop — do not build a local menu-path stand-in.
- Phase 31.1 landed: tab host behind `PowerBrowserAPI`, favicon/mute/zoom push fields for menu enablement. If absent, menu rows needing those fields stay absent, never stubbed.
- Phase 32 landed (partially): Find, Zoom, Print, Save Page As, Edit commands, downloads panel. Missing ids are absent rows, never disabled stubs.
- Phase 29/30 landed: `readBookmarkByUrl`/`listBookmarkFolder`/`searchPlacesRestricted`/`removeHistoryEntry`, `shellArmWebTabHistory` 27-02 path, Actions `Browser`-category enumeration, `MODE_SENDS` command-centre all-false, `.pb-chrome-bar-dropdown` portal, relay idiom.

<domain>
## Phase Boundary

The user bookmarks, reopens and clears from the chrome bar, and the app menu and
Actions mode reach every browser action v1.5 ships (ROADMAP.md Phase 33; requirements
BMK-01, BMK-02, BMK-03, BMK-04, BMK-05, BMK-06, MENU-03, SMODE-07).

In scope: the bookmark star (filled state, Ctrl+D), the star's editor popover
(name, folder, remove), reopen closed tab (Ctrl+Shift+T, with back/forward history),
the bookmarks toolbar (Ctrl+Shift+B, live refresh), clear recent history
(Ctrl+Shift+Del, time range, fan-out to PowerBrowser's own stores, token cookie
exempt), the history menu (recently closed tabs + recent pages), every MENU-03
app-menu entry in Firefox order, and every Actions-mode row for the browser actions
v1.5 ships (plus the Command-centre-never-sends half of SMODE-07).

Not in scope: BMK-07 (Phase 34 tab menu), MENU-01/02/04 (Phase 31: hamburger button,
Settings/Passwords/Add-ons, Quit — this phase fills entries into the button Phase 31
builds), PAGE-07 fullscreen (Phase 35 delivery; this phase carries only a same-id
`fullScreen` privileged store kind + widget-only call as the stable handoff), PROMPT rows, EXT rows, Library window,
import-from-browser, warn-on-close (gap-list rows with no v1.5 requirement).
</domain>

<decisions>
## Implementation Decisions

### Recorded rulings that apply (REQUIREMENTS.md header, ROADMAP Phase 33, research picks)
- Places writes go only through `PowerBrowserAPI`, never raw SQL and never a second
  writer in the Theia backend (ROADMAP Phase 33 notes; 29-CONTEXT Places ruling).
- The `127.0.0.1` token cookie is exempt from every clear-data kind (technical ruling
  2026-10-20; Phase 31 probe 13 carries the planted-clear check, this phase reuses it).
- Chrome-bar copy reads the configured application name, never a hard-coded brand
  (BAR-14 carries forward).
- Firefox keys that clash with Theia keys take the browser meaning only while a web
  page has focus (KEY ruling 2026-10-20); T-27-18/KEY-04 pattern carries forward.
- Actions that open UI are commands; actions that change state run only from that UI's
  event handlers, never as command ids (research D7 / Phase 27 privileged-kind rule).
- No Theia core patch; `@theia/*` consumed as dependencies only (hard rule 1).
- No Firefox internal outside `PowerBrowserAPI.sys.mjs` (hard rule 2); new touchpoints
  are end-of-file rows, append-only catalogue (Phase 27 rule).
- Command centre never sends typed text to a search engine (SMODE-07 second half;
  MODE_SENDS already `resolve:false` — this phase gates it, it does not re-decide it).

### Star and editor (BMK-01, BMK-02)
- **D-01:** The star is a button at the pill's right end, inside the pill, after the
  input: outline `codicon-star-empty` unbookmarked, filled `codicon-star-full`
  bookmarked, aria-label from copy. Reason: matches Firefox's in-pill star without
  touching the lock (Phase 31) or the mode button (Phase 30).
- **D-02:** The editor is a `.pb-chrome-bar-dropdown` portal panel anchored to the
  star (name field, folder picker, Remove button, Done), not a Theia dialog.
  Reason: the layer policy — a Theia DOM popup hides the page, the portal does not
  (Phase 27 overlay rule).
- **D-03:** A bookmarked visit shows as a bookmark row (never a history row), so
  Shift+Delete keeps its Phase 29 rule (history rows only). Reason: 30-03 already
  decided this; re-stating so no plan re-opens it.

### Bookmarks toolbar (BMK-04)
- **D-04:** The toolbar is a collapsible row rendered by the chrome bar below the
  pill row, in the top panel, shown in every PowerBrowser mode when
  `browser.showBookmarksToolbar` is true. Reason: bookmarks are mode-independent;
  mode-coupled visibility already caused one false-red invariant (27 deferred).
- **D-05:** Live refresh comes from a Places bookmark observer installed chrome-side
  that pushes a `bookmarks-changed` state update; the toolbar re-reads
  `listBookmarkFolder('toolbar')`. Reason: ROADMAP notes demand an observer push,
  and polling would race multi-window edits.
- **D-05b (round-3, autonomous, recommended):** the observer is
  `lazy.PlacesUtils.observers.addListener(["bookmark-added", "bookmark-removed",
  "bookmark-moved", "bookmark-url-changed"], fn)` beside `startTabStoreTriggers`
  (`powerbrowser/shell/PowerBrowserAPI.sys.mjs:3049`), and the push target is the
  shell window's own Theia frame — `findShellWindow()` (`PowerBrowserAPI.sys.mjs:1003-1004`,
  the `powerbrowser:main` windowtype) → its `#powerbrowser-content` frame
  (`powerbrowser/shell/powerbrowser.xhtml:58`) → `sendWebTabPush`-style
  `sendAsyncMessage("PowerBrowserWebTabState", {kind: "bookmarks-changed"})`.
  Reason: the observer fires chrome-side with no actor sender, so no
  `actorRef.browsingContext.top.embedderElement` exists to push back through; the
  shell window lookup is the only in-tree path from chrome to the frame.
  Verified: listener names from `BookmarkList.sys.mjs:81-87` + `browser-places.js:1783-1789`
  (add/move/remove/url-changed — bookmark-changed is not an event name upstream emits);
  shell frame id from `powerbrowser.xhtml:58`; lookup from `PowerBrowserAPI.sys.mjs:1003-1004`.

### Closed tabs and history menu (BMK-03, BMK-06)
- **D-06:** The closed-tab source is `tabs.sqlite` rows with `closed_at` non-null
  (NG-005/NG-010 write path exists); sessionstore `_closedTabs` merge at startup
  only. Reason: single writer — a second live source would disagree on order.
- **D-07:** Ctrl+Shift+T reopens the most-recently-closed row in a new web tab and
  restores its session history through `shellArmWebTabHistory` (the 27-02 path).
  Reason: that path is the only history-carrying reopen in the tree.
- **D-08:** BMK-06 is a History submenu inside the hamburger (Recent pages +
  Recently closed tabs sections), not a second chrome-bar button. Reason: MENU-03
  already requires a History entry; a submenu avoids a new button and its overflow
  cost.

### Clear history (BMK-05)
- **D-09:** One `clearHistory` privileged store kind fans out chrome-side to Places
  history, `tabs.sqlite` closed rows, thumbnails, saved pages and web-tab history;
  the range picker offers last hour / 2 hours / 4 hours / today / everything.
  Reason: ROADMAP notes require one kind and the fan-out list; five ranges match
  Firefox's set minus site-specific rows we do not have.
- **D-09b (round-3, autonomous, recommended):** the `clearHistory` fan-out uses
  `PlacesUtils.history.removeVisitsByFilter({beginDate,endDate})` range deletes, never `Sanitizer` at all.
  Reason: `Sanitizer` is unusable at all: `showUI` needs `gDialogBox`
  (`upstream/browser/modules/Sanitizer.sys.mjs:124-133`) and reads clear prefs the
  shell never sets — neither exists in the `powerbrowser:main` shell, which loads
  no `browser.js`/`browser-init.js`/stock popupsets; range deletes need only the
  already-catalogued `PlacesUtils` lazy import.
- **D-10:** The picker is the star-editor portal pattern (anchored panel), opened
  from the History submenu and from Ctrl+Shift+Del. Reason: reuses the one popover
  primitive instead of inventing a dialog.

### Full menu and Actions mode (MENU-03, SMODE-07)
- **D-11:** The hamburger button and Firefox-ordered skeleton come from Phase 31;
  this phase appends exactly the MENU-03 entries in ROADMAP order (New Tab, New
  Window, Bookmarks submenu, History submenu, Downloads, Print, Save Page As, Find
  in Page, Zoom submenu, Full Screen, More Tools submenu, Help submenu). Reason:
  MENU-01 order is Phase 31's contract; this phase fills it.
- **D-12:** New Window opens the stock window through the existing
  `openBrowserWindow`/`openStockTab` path; no second shell window. Reason: a second
  shell window is XL and explicitly out of scope (gap list).
- **D-13:** Every menu entry and every Actions row runs the same `Browser`-category
  command id; Actions lists whatever Browser commands exist at enumeration time
  (missing Phase 32 commands simply have no row yet). Reason: FEATURES dependency
  note — Actions ships with whatever exists, each later phase adds rows.
- **D-14:** Full Screen rows call the Phase 35 fullscreen path when it lands; until
  then the row runs `window.fullScreen` chrome-side behind the same command id, so
  the id is stable across the phase boundary. Reason: keeps MENU-03 shippable even
  though PAGE-07 lives in Phase 35.
- **D-14b (round-3, autonomous, recommended):** the `fullScreen` store kind is classed
  `window-chrome` (command-reachable, never relayed, widget-handler-called), not
  `privileged`. Reason: MENU-03/D-13/SMODE-07 require a `full-screen` command id that
  Actions also runs, but the rule-12 gate fails any file containing `registerCommand(`
  that names a privileged kind — and `chrome-bar-commands.ts` (the one command file)
  is nothing but `registerCommand(` calls; a `window-chrome` class (window chrome
  state, no Places write, no clipboard read, no off-machine send) is what command ids
  may reach. The kind's chrome arm, `STORE_REQUEST_KINDS` member, class, same-named
  `ChromeStoreClient` method and plant all land together in 33-05. Verified:
  toggle body `window.fullScreen = !window.fullScreen` at
  `upstream/browser/base/content/browser-commands.js:567-569`; gate fence at
  `scripts/verify-web-tab-bridge.mjs:491-497`; stale rule at `:455-456`.
- **D-15:** Ctrl+D, Ctrl+Shift+T, Ctrl+Shift+B, Ctrl+Shift+Del work Theia-focused
  via chrome-bar keybindings AND page-focused via page-focus relay rows (Phase 27
  pattern: Theia rows disabled while an overlay has focus, relay rows enabled only
  then). Reason: the KEY ruling — the browser meaning wins only while a page has
  focus.

### Claude's Discretion
- Exact portal geometry, submenu open delays, toolbar overflow behaviour (wrap vs
  scroll vs chevron), folder-picker depth, and plant names in the new gates — use
  the Phase 27/29/30 precedents (hover `top`, 500 ms hold, recursive scans).
- Whether `clearHistory` deletes open-tab rows: no — open rows (`closed_at` null)
  survive, matching `pruneClosedTabRows` semantics.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `address-bar/address-bar.tsx` + `address-bar-modes.ts` (Phase 30): the Actions mode
  already lists `Browser`-category commands — this phase adds the commands, not the
  listing path.
- `chrome-bar-widget.tsx` history menu + pill menu (NAV-03, BAR-10): the
  per-request `CompoundMenuNode` + `ContextMenuRenderer` pattern for the History
  submenu, editor popover anchor math and `onHide` focus restore.
- `PowerBrowserAPI.sys.mjs` store section + `searchPlacesRestricted` (Phases 29/30):
  the end-of-file privileged-kind pattern, `storeUrlArg`/`storeSenderInShellWindow`
  walls, `removeHistoryEntry` as the first Places-write precedent.
- `tabs.sqlite` closed rows (`closeTabRow`, `pruneClosedTabRows`, NG-005/NG-010) and
  `shellArmWebTabHistory` (27-02): the reopen path.
- `scripts/verify-web-tab-bridge.mjs` rule 12 (`STORE_KIND_CLASSES`): every new
  store kind is classified or the gate goes red.
- `scripts/verify-chrome-bar-commands.mjs` (`EXPECTED_IDS`/`EXPECTED_LABELS`):
  new command ids extend the contract in the same commit.
- `scripts/verify-shell-error-copy.mjs` (`EXPECTED_WIDGET_COPY`): every new sentence
  lives in `CHROME_BAR_COPY` with `appSubject()`.

### Established Patterns
- Privileged-kind rule (INTERNAL-APIS.md:32-37): state-changing kinds run only from
  widget event handlers, never get command ids or key-relay rows.
- Append-only catalogue: new `PowerBrowserAPI.sys.mjs` code at end of file; new
  INTERNAL-APIS rows appended; `--fix` renumbers after every edit.
- Recursive gate scans: every `chrome-bar/src/browser` scan recurses into
  `address-bar/` (30-01), or the gate goes silently blind.
- Live probes run with `-purgecaches` and assert positive page-side outcomes; every
  new live script has a `--self-test` of planted faults.

### Integration Points
- Phase 31 (assumed): hamburger button + menu skeleton, `openStockPage` enum,
  security-state push, Quit path.
- Phase 31.1 (assumed): tab host behind `PowerBrowserAPI`; favicon/mute/zoom push
  fields exist for menu enablement.
- Phase 32 (assumed): Find, Zoom, Print, Save Page As, Edit commands, downloads
  panel, favicons, mute, source/reader/devtools/crashed-tab — the commands MENU-03
  and Actions invoke.
- `listBookmarkFolder` already resolves GUIDs only (`PowerBrowserAPI.sys.mjs:2620`,
  `getFolderContents` + `containerOpen` per `upstream/.../PlacesUtils.sys.mjs:1390`);
  Phase 33 extends it to also accept the names `'toolbar'|'menu'|'unfiled'`,
  mapped to the `PlacesUtils.bookmarks` root GUID constants `toolbarGuid` /
  `menuGuid` / `unfiledGuid` (`upstream/toolkit/components/places/Bookmarks.sys.mjs:121-125`),
  with the existing 12-char GUID regex kept as the second accepted shape and a
  fixed-text refusal otherwise. Reason: the toolbar/submenu callers pass names,
  the boundary keeps one function. (Round-3 W1/W2.)
- Bookmark observer listener names are `bookmark-added` / `bookmark-removed` /
  `bookmark-moved` / `bookmark-url-changed` (no `bookmark-changed` event upstream —
  `bookmarks-changed` is only this phase's push-kind name), per
  `upstream/toolkit/components/places/BookmarkList.sys.mjs:81-87` and
  `upstream/browser/base/content/browser-places.js:1783-1789`. (Round-3 W1/W2.)
</code>

<specifics>
## Specific Ideas

- Firefox order is the contract: Back/Forward-less hamburger starting at New Tab, per
  `appmenu-viewcache.inc.html` (FEATURES MENU row); omit Sync/account/private/AI rows
  per the gap list.
- The star's filled state must be visible in all three modes (Coding included) —
  bookmarking a docs page while coding is the primary flow.
</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and requirements
- `.planning/REQUIREMENTS.md` — BMK-01..06, MENU-03, SMODE-07 definitions; header
  rulings (Places writes, token-cookie exemption, app-name copy, key ruling).
- `.planning/ROADMAP.md` § Phase 33 — goal, depends-on (Phase 32), notes
  (single-writer Places, observer push, one `clearHistory` kind, token exempt),
  success criteria 1–5.
- `.planning/PROJECT.md` — Key Decisions (append-only catalogue, privileged kinds,
  bridge design, hard rules 1/2/5).

### Research
- `.planning/research/SUMMARY.md` — the furniture/actor model, rules that hold
  (one boundary, privileged payloads, stock-window routing).
- `.planning/research/FEATURES.md` — BMK/SMODE-Actions/MENU rows, QuickActions
  list, feature dependencies (§ SMODE Actions requires the features it lists).
- `.planning/research/ARCHITECTURE.md` — actor/push model, `installShellFurniture`
  boundary (not this phase, but the push pattern).
- `.planning/research/STACK.md` — Places modules (`PlacesUtils.bookmarks`,
  `history`, observers), Sanitizer, sessionstore closed tabs.
- `.planning/research/PITFALLS.md` — Pits 6 (token cookie), 7 (privileged kinds),
  10 (Places/clear coverage), 11 (window.open vs GUI-01 — constrains D-12).
- `.planning/research/chrome-bar-firefox-gap.md` — BMK + app-menu gap rows and the
  recommended first batch (hamburger early).

### Prior phases (binding precedent)
- `.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-CONTEXT.md`,
  `27-RESEARCH.md`, `27-PATTERNS.md`, `27-VALIDATION.md` — push router, relay,
  privileged-kind rule, `27-SECURITY.md` open item T-27-11 (carried to Phase 35, not
  this phase), deferred-items (shared-process blank defect — live-flake context).
- `.planning/phases/29-address-bar-search-and-fixup/29-CONTEXT.md`,
  `29-RESEARCH.md`, `29-PATTERNS.md`, `29-VALIDATION.md`, `29-SECURITY.md`,
  `deferred-items.md` — Places reads/writes, token strip, Shift+Del precedent,
  clipboard rule, one-off flake context.
- `.planning/phases/30-address-bar-modes-and-command-centre/30-CONTEXT.md`,
  `30-RESEARCH.md`, `30-PATTERNS.md`, `30-VALIDATION.md`, `30-UI-SPEC.md` — pill in
  `address-bar/`, Actions mode listing, MODE_SENDS (Command centre sends nothing),
  default table; `deferred-items.md` (context-menu focus flake).
- `.planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md` — tab-host
  route (binds 31.1; this phase must not depend on extension behaviour).

### Code entry points
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` — the one boundary (store kinds,
  `openStockTab`, `openBrowserWindow`, `quitApplication`, tab-store methods).
- `powerbrowser/INTERNAL-APIS.md` — line-keyed catalogue + privileged-kind rule.
- `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx` — the pill.
- `theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts` — Actions listing.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` — nav buttons, menus.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts` — Browser category.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` — copy contract.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts` — prefs.
- `theia/extensions/tab-uris/src/browser/chrome-store-client.ts` — store client.
- `theia/extensions/tab-uris/src/browser/tab-store-access-protocol.ts` — relay kinds (read-only).
</canonical_refs>

<deferred>
## Deferred Ideas

- BMK-07 (bookmark one/all tabs from the tab menu) — Phase 34.
- Library window (`about:places`) — gap list, no v1.5 requirement.
- Import-from-browser, warn-on-close, update banner, profiles, containers — gap
  list, no v1.5 requirement.
- Per-site "forget this site" — beyond BMK-05's range clear; no requirement.
- Bookmarks/History side views (`queryHistory` kind) — gap list, no requirement.
- Screenshot/translate/PiP/page-info/unload-tab — gap list, no requirement.
</deferred>

---

*Phase: 33-bookmarks-history-and-the-full-menu*
*Context gathered: 2026-10-22 (`--auto`; all choices above are the recommended option)*
