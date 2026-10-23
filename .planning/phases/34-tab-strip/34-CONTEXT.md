# Phase 34: Tab Strip - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** `--auto` (Chris's standing autonomous rule: every gray area takes the recommended option, recorded with a one-line reason)

<domain>
## Phase Boundary

The tab strip handles tabs the way Firefox's does: tab menu, drag, pin, overflow, multiselect, preview and attention (ROADMAP.md Phase 34; requirements TAB-01..TAB-09, BMK-07).

In scope: the one strip (the existing `TabStripWidget`), its context menu, in-strip drag reorder, middle-click/double-click/drop, overflow scroll + List All Tabs, pin with restart persistence, multiselect with bulk actions, hover preview card, background-title attention mark, and Bookmark Tab / Bookmark All Tabs wired to the Phase 33 bookmark path.

Not in scope: Mute audio plumbing (Phase 32 PAGE-05 owns `webTabMute`; this phase only calls it), bookmark storage and the star/editor/toolbar (Phase 33 owns `addBookmark`; this phase only calls it), toast/confirm dialogs for bulk close (no new dialog authored; the close path is the widget's existing close), the unified chrome+Theia strip GUI-05 (later milestone, hard rule 3), containers/private windows/Sync (not applicable, gap list).

</domain>

<decisions>
## Implementation Decisions

### Locked rulings that apply (REQUIREMENTS.md header, PROJECT.md Key Decisions, 28-SPIKE-DECISION)
- Firefox keys that clash with Theia keys take the browser meaning only while a web page has focus; KEY-04 keeps Theia's meaning in editors/terminals.
- Chrome-bar copy reads the configured application name, never a hard-coded brand (BAR-14 carries forward).
- Stock Firefox toolkit popups with stock strings in `powerbrowser.xhtml` are shell furniture (rule 5 clarified); this phase authors no popup, only Theia menus and hovers.
- Hard rule 1: no Theia core patch; `@theia/*` consumed as dependencies only (`scripts/diff-theia-core.sh`).
- Hard rule 2: Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, every touchpoint catalogued in `powerbrowser/INTERNAL-APIS.md`; append-only rule (Phase 27) and privileged-kind rule hold.
- Hard rule 3: nothing welds Theia to full-window presentation; no second tab model — the strip reads the shell's dock and the Phase 31.1 tab host, it never mints tab identity.
- The 28 sign-off binds 31.1 and 38: `getTabForBrowser` no longer returns null, the product tab host exists behind `PowerBrowserAPI`, the Theia frame never enters the tracker, extensions may not navigate an overlay to `moz-extension://` pages, and while the IDE has focus the last web tab stays the active tab for extensions.
- Verification: one driver `scripts/verify-platform.sh`; any new check is one registry row, derives expectations from the tree and compares, with a `--self-test` of planted faults.

### Decided (autonomous, recommended)
- **D-01: Extend the existing `TabStripWidget`, do not build a second strip.** Reason: it is already the strip-of-record with no tab model of its own, so extending it cannot become the second source of truth hard rule 3 forbids.
- **D-02: The strip stays the shell's dock reader in every mode (Coding, Browsing, Organising); visibility follows the existing mode-service contract.** Reason: per-mode strip variants would fork the menu/reorder/overflow behaviour three ways.
- **D-03: Tab menu is a per-request `CompoundMenuNode` through `ContextMenuRenderer`, same pattern as the Phase 27 history menu.** Reason: proven occlusion-safe menu path with no new transport.
- **D-04: Menu item availability derives from the tree at check time (command ids + capability predicates), never a hand-kept list.** Reason: a hand-kept list can only agree with the tree it was copied from and goes silently stale.
- **D-05: Reorder is an in-strip DOM-order change applied to the home pane's `TabBar` order (insert at drop index), frontend-only, no chrome kind.** Reason: order is Theia layout state, not docshell state, so no boundary crossing is needed.
- **D-06: Middle-click closes, double-click on empty strip opens a new tab, link drop opens via the existing opener/`openInBackground`; `javascript:` refused by the same `^https?://` wall as NAV-06.** Reason: reuses the Phase 27 drop/open path and its scheme wall instead of inventing a second one.
- **D-07: Overflow is horizontal scroll of the same row plus a List All Tabs chevron menu; the menu lists every strip tab with icon + label.** Reason: Firefox's two affordances (scroll + list) without a second overflow component.
- **D-08: Pin is strip-local state (`pinnedIds: Set<string>` keyed by `GroupModel.keyOf`) persisted in `ProfileStorageService` shell-state map, restored at startup by reopening the stored URL+rowKey pairs pinned-first (a restored web tab gets back the same key through `WebTabOpenHandler.openUrl(url, rowKey)` → `WebTabOptions.key`, web-tab.ts:826-852 — W1, else every stored pin drops); pinned tabs render icon-only and are excluded from Close Others/Left/Right and bulk close unless explicitly selected.** Reason: avoids a `tabs.sqlite` schema change and the ephemeral `web:wt-N` row-key problem by keying on the stable group key.
- **D-09: Multiselect is strip-local (`selectedIds: Set<string>`), Ctrl/Cmd-click toggles, Shift-click extends a range, click clears; bulk actions are Close, Move (to Start/End), Mute, Bookmark — each delegating to the same single-tab path.** Reason: Lumino `TabBar` has no multiselect, and a core change is forbidden, so selection lives in the strip.
- **D-10: Preview card reuses the settled GUI-08 thumbnail (tabs.thumbnail column via projectSessionStoreTabs rows plus GroupModel.rememberThumbnail session memory) when present, else a title+URL text card; it never screenshots live.** Reason: reuses the GUI-08 capture pipeline instead of adding a second capture path with remoteness races.
- **D-11: Preview card is a blocking layer: listed in `BLOCKING_LAYER_SELECTOR`, hides overlays while open, anchored below the tab, `position: top` hover never over the page rect.** Reason: the overlay paints above every Theia portal, so the card would otherwise vanish behind the page (ARCHITECTURE.md § System Overview).
- **D-12: Attention mark is chrome-computed: the state push carries `titleChanged` when a background tab's title differs since it was last active; the strip clears it on activation.** Reason: computed chrome-side from the overlay like the rest of the state push, no polling and no title sniffing in the frame.
- **D-13: Mute and Bookmark menu items call the Phase 32 `webTabMute`/mute-state and Phase 33 `addBookmark` paths; this phase adds no Places write and no second writer.** Reason: serial dependency — the capabilities exist by the time this phase runs, and the privileged-kind rule routes them through widget event handlers only.
- **D-14: No confirm dialog for Close Others/Left/Right/Duplicates or bulk close in this phase; the close path is the widget's existing close (undo is Phase 33 Ctrl+Shift+T).** Reason: avoids authoring a dialog one phase before the Phase 37 dialog system lands.
- **D-15: Copy for every menu item, preview state and attention label lives in `chrome-bar-copy.ts` under `appSubject()`; no internal identifier (tab id, row key, URL scheme, timeout) in user-facing text.** Reason: the shell-error-copy contract already pins this surface.
- **D-16: Strictly serial waves 1–5: every plan edits `tab-strip-widget.tsx` (+ `chrome-bar.css`), and `--quick` reads the whole tree.** Reason: the Phase 30 precedent — parallel waves would collide on the same files and the same gates.

### Claude's Discretion
All other choices (exact menu order within the ROADMAP contract, pixel geometry inside the UI-SPEC scale, plant names in the new gates) are at the executor's discretion, documented in the plan SUMMARYs.

### Autonomous choice log (this revision)
- Recommended option taken everywhere a choice was open: ROADMAP success criterion 1 parsed at check time as the menu source of truth (W1) — reason: a hand-kept list can only agree with the tree it was copied from.
- Middle-click proof uses a seeded page-realm `contenteditable` whose `input`/`paste` events are recorded, with a caught middle-click paste as the same-session positive control (N2) — reason: a clipboard read alone can never go red because a paste only reads the clipboard.
- Attention mark is a chrome-computed field on the existing state push, no new internal, no catalogue row (W3) — reason: a field cannot be addressed by extensions or commands, while a new kind would widen the privileged-kind surface.
- Pin rides the existing `shellStateSave` kind; no INTERNAL-APIS.md touch in 34-03 (W4) — reason: the kind is already catalogued, so a new row would be catalogue noise. W1 named place: a restored web tab gets back the same key through `WebTabOpenHandler.openUrl(url, rowKey)` → `WebTabOptions.key` (web-tab.ts:826-852) — reason: without key continuity every stored pin drops after restart.
- N1 fix placement: `verify-ng-040-internals-catalogue-lines.mjs --fix` runs in the implementing action only, verify runs the check without `--fix`, and `powerbrowser/INTERNAL-APIS.md` is in files_modified whenever boundary lines shift — reason: a check that repairs drift before reading it can never go red.
- `TabUriRegistry` shape asserted unchanged in every plan via `verify-registry-shape.mjs` (GUI-04) — reason: the bridge must stay landable without rework.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/ROADMAP.md` § Phase 34 — goal, depends-on (Phase 33), research note (reorder drop index + `setTabPosition`, pin persistence, title-change push, per-mode strip build), success criteria 1–4, UI hint yes.
- `.planning/REQUIREMENTS.md` — TAB-01..TAB-09, BMK-07 wordings; header rulings (search, Places-write, rule 5 furniture, engine set, key clash, no clipboard suggestion, app-name copy, mode defaults); mapping table (Phase 34 rows).
- `.planning/PROJECT.md` — Key Decisions (append-only internals, single chrome-side SQLite writer, sessionstore authority, no manifest flags, autonomous nonstop default).

### Research and gaps
- `.planning/research/SUMMARY.md` — the v1.5 build order, security risks (a)–(f), live-probe-first rule.
- `.planning/research/chrome-bar-firefox-gap.md` § Tab strip — the 15 strip rows this phase covers and their sizes.
- `.planning/research/FEATURES.md` — requirement prefixes, SMODE collision note, shared-groundwork rule.
- `.planning/research/ARCHITECTURE.md` § System Overview — overlay z-order vs Theia portals (why menus hide pages).
- `.planning/research/PITFALLS.md` — Pitfalls 2 (gBrowser stand-in growth), 3 (silent upstream fallbacks), 4 (reserved keys), GUI-02 remoteness defect.
- `.planning/research/STACK.md` — browser-element methods, Theia 1.76 APIs consumed.

### Binding prior phases
- `.planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md` — signed-off route binding 31.1/38 (D-74 amended, null-ruling reversed, http(s)-only navigation guard, Theia frame never tracked).
- `.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-CONTEXT.md`, `27-RESEARCH.md`, `27-UI-SPEC.md`, `27-SECURITY.md` (incl. open T-27-11 carried to Phase 35), `27-VALIDATION.md`, `27-PATTERNS.md`, `deferred-items.md` (shared-process blank defect).
- `.planning/phases/29-address-bar-search-and-fixup/29-CONTEXT.md`, `29-RESEARCH.md`, `29-SECURITY.md`, `29-VALIDATION.md`, `deferred-items.md` (one-off flake, Paste & Go focus vs remoteness defect).
- `.planning/phases/30-address-bar-modes-and-command-centre/30-CONTEXT.md`, `30-RESEARCH.md`, `30-UI-SPEC.md`, `30-VALIDATION.md`, `30-PATTERNS.md`, `30-MOCKUPS.html` (pill split, contribution point, D-03 default table, D-50 static binds).

### Code entry points
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` — the one boundary (web-tab action section, store section, push coalescer, `webTabOpen` overlay shape).
- `powerbrowser/INTERNAL-APIS.md` — append-only + privileged-kind rules (§26–46).
- `powerbrowser/shell/powerbrowser.js` — shell window, `window.gBrowser` stand-in, PAGE_KEYS rows, focus tracker.
- `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx` — the strip to extend.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` — bar composition, top-panel adds, current-widget subscription.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts` — Browser-category commands (mute/bookmark wire here).
- `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts` — PAGE_SHORTCUTS table + relay (menu items never invent keys).
- `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` — copy surface pinned by the copy gate.
- `theia/extensions/chrome-bar/src/browser/chrome-bar.css` — the one style layer (`@layer powerbrowser-chrome-bar`).
- `theia/extensions/tab-uris/src/browser/web-tab.ts` — `WebTabWidget`, `WebTabChannel`, `openInBackground`, occlusion selector.
- `theia/extensions/tab-uris/src/browser/chrome-store-client.ts` — `ChromeStoreClient` reader used by preview/pin restore.
- `theia/extensions/tab-uris/src/browser/profile-storage.ts` — shell-state map (pin persistence host).
- `theia/extensions/modes/src/browser/group-model.ts` — `keyOf`, `showsInStrip`, `joinActiveGroup` (stable tab identity).
- `scripts/verify-platform.sh` — the one driver; new rows land in its registry.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TabStripWidget` (`tab-strip-widget.tsx`): dock-reader strip with `primaryBar/homeWidgets/mainTabs/stripTabs/switchOrder`, stack fold, `Widget.MimeData` split-drag (`DRAG_THRESHOLD`, swallow-click) — extend, do not replace.
- `ContextMenuRenderer` + `CompoundMenuNode` history menu (`chrome-bar-widget.tsx` NAV-03): the per-request menu pattern D-03 copies.
- `HoverService` tooltips at `position: 'top'` (`chrome-bar-shortcuts.ts`, 27-08): the hover pattern D-11 copies; tooltips never cover the page.
- `WebTabChannel.onPush` + `scheduleWebTabState` coalescer: the push the `titleChanged` flag rides.
- `queryTabsWithPlaces` thumbnails is a FALSE lead: `TabPlacesRow` carries no thumbnail field; preview reads settled images from `projectSessionStoreTabs` rows plus `GroupModel.rememberThumbnail` session memory instead (D-10 corrected).
- `openInBackground` / opener (`web-tab.ts`, `chrome-bar-commands.ts`): the drop/double-click open path D-06 reuses.
- `queryTabsWithPlaces` thumbnails (`chrome-store-client.ts` + GUI-08 settle capture): the preview image source D-10 reuses.
- `ProfileStorageService` shell-state map (`profile-storage.ts`): the pin store D-08 reuses (via the existing `shellStateSave` kind — no new catalogue row, W4).
- `verify-web-tab-bridge.mjs` KIND_CLASSES set equality + TAB_STORE relay rules: the classification pattern the new gate copies.

### Established Patterns
- End-of-file boundary sections with own lazy-getter blocks; `verify-ng-040-internals-catalogue-lines.mjs --fix` after every boundary edit.
- Recursive `--quick` scans (30-01): any gate reading chrome-bar sources recurses into new subdirectories.
- Static binds at module load (D-50): contributions bound in `chrome-bar-frontend-module.ts`, never after enumeration.
- Copy in `chrome-bar-copy.ts` pinned by set equality in `verify-shell-error-copy.mjs`; tooltip/menu text derived from the action table.
- Occlusion policy (`BLOCKING_LAYER_SELECTOR`): every chrome-bar-anchored layer hiding the overlay is listed; body `MutationObserver` republishes.
- Live probes on `scripts/lib/pb-live-probe.mjs` with `-purgecaches`, push recorder, page-realm `probe()`; positive page-side assertions only.

### Integration Points
- Strip → shell: `ApplicationShell.mainPanel` bars/widgets, `activateWidget`, `closeWidget` paths.
- Strip → chrome: `WebTabChannel.request/send` (`webTabReload`, `webTabDuplicate`-class kinds), `ChromeStoreClient` reads, state pushes.
- Strip → modes: `GroupModel.showsInStrip/keyOf/joinActiveGroup` for membership and stable identity.
- Strip → commands: `CommandRegistry` Browser-category commands for menu/bulk/multiselect execution.
- Gates → registry: `scripts/verify-platform.sh` gains `tab-strip` + `tab-strip-live` rows; `verify-shell-error-copy.mjs` gains the new copy.

</code_context>

<specifics>
## Specific Ideas

Firefox is the reference for menu order, drag feel, pin shrink, overflow chevron, List All Tabs, icon-only pinned tabs, preview card (thumbnail + title + URL), and the background-title attention dot — implemented in Theia idioms (Lumino TabBar order, Theia menus/hovers, `--theia-*` theming), not by porting Firefox CSS.

</specifics>

<deferred>
## Deferred Ideas

- Confirm dialogs / undo for bulk close — Phase 33 reopen (Ctrl+Shift+T) is the undo; dialog system is Phase 37.
- Audible-tab plumbing, zoom chip, find bar, downloads panel — Phase 32 owns the capabilities; this phase only calls Mute.
- Bookmark storage, star popover, bookmarks toolbar, closed-tab restore, clear-history fan-out — Phase 33 owns them; this phase only calls `addBookmark`/open.
- Unified chrome+Theia strip (GUI-05), containers, private windows, synced tabs — out of milestone scope.
- Shared-process blank-reload/activation defect (27 deferred-items) and Paste & Go focus flake (29 deferred-items) — recorded, not fixed here; live scenarios avoid >4 same-site tabs per session.

</deferred>

---

*Phase: 34-tab-strip*
*Context gathered: 2026-10-22*
