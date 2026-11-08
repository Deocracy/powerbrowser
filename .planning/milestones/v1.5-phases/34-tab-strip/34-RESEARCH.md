# Phase 34: Tab Strip — Research

**Status:** Ready for planning
**Gate rows this phase adds:** `tab-strip` (static, `--quick`), `tab-strip-live` (live, BiDi)

## Summary

Firefox parity for the strip is Theia-idiom work, not a Firefox port: the strip stays a dock reader (`TabStripWidget` over `ApplicationShell.mainPanel`), order is Lumino `TabBar` order, menus are `ContextMenuRenderer` + `CompoundMenuNode`, hovers are `HoverService`, persistence is the `ProfileStorageService` shell-state map, thumbnails are the GUI-08 settle-capture rows. Two small chrome additions only: a `titleChanged` flag on the existing state push (TAB-09) and no new store kind (pin lives frontend-side). Reorder needs no chrome kind (ROADMAP research note answered: drop index is computed in-strip; `setTabPosition` is the Panorama card position, not strip order — strip order is `TabBar` order and survives via the existing layout restore).

## Assumes from earlier phases

- **Phase 30 promised:** `AddressBar` split (`address-bar/address-bar.tsx`), `AddressBarModeContribution` point, Tabs/Bookmarks/History/Actions modes, `verify-address-bar-modes.mjs` live suite. Assumed present; List All Tabs reuses the Tabs-mode row shape.
- **Phase 31 promised:** `openStockPage` enum, security push, site panel. Assumed present; dropped-link navigation reuses its scheme wall.
- **Phase 31.1 promised:** chrome-side tab host + patch `050-extension-tab-host.patch`, `selectedTab`/`gBrowserInit`, reversed null-ruling (28 sign-off). Assumed present; state pushes and `webTab*` kinds route through it.
- **Phase 32 promised:** find/zoom/print/favicons via LinkHandler + tab host, `webTabMute` + `soundPlaying` tab-host members, downloads/source/reader/crash. Assumed present; Mute menu item calls `webTabMute`, favicons come from `placesFavicons`, preview never screenshots live.
- **Phase 33 promised:** star + `addBookmark`, bookmark editor popover, reopen-closed (Ctrl+Shift+T), bookmarks toolbar + Places observer push, clear-history fan-out, history menu, full app menu + Actions. Assumed present; Bookmark Tab / Bookmark All Tabs call `addBookmark`; bulk-close undo is reopen-closed.
- **Carried defects (not fixed here):** T-27-11 stand-in derivation gap → Phase 35; shared-process blank on reload/activation (27 deferred-items); Paste & Go focus flake (29 deferred-items); tooltip rule (c) Organising below-bar.

## Findings

### F-01: The strip has no tab model — keep it that way
`TabStripWidget.stripTabs()` filters `mainTabs()` by `GroupModel.showsInStrip`; `switchOrder()` already defines the key-switch order. Identity is `GroupModel.keyOf(widget)` (stable group key, cf. `tabKeyOf`). **Decision D-01/D-08:** extend the widget; pin/multiselect keyed by `keyOf`, never by `tabId`/`web:wt-N` (ephemeral across restarts) or URL (duplicates collide).

### F-02: Menu pattern is proven (NAV-03 history menu)
`chrome-bar-widget.tsx` builds a per-request `CompoundMenuNode` and shows it via `ContextMenuRenderer.render({menuNode, args})`. Occlusion is handled by the existing `BLOCKING_LAYER_SELECTOR` + body `MutationObserver` republish. **D-03** copies this; the new menu selector joins the occlusion list (D-11).

### F-03: Reorder is frontend-only
ROADMAP asked about "drop index + `setTabPosition`". `setTabPosition` writes Panorama card x/y (tab-store group layout), not strip order. Strip order = home pane `TabBar` title order; Lumino `TabBar.insertTab(index, ...)` (`theia/node_modules/@lumino/widgets/types/tabbar.d.ts:229`) + `update()` reorders with no chrome involvement. Drop index = first tab whose horizontal midpoint is past the pointer (Firefox feel, 4-line computation). No new `WEB_TAB_ACTION_KINDS` entry; privileged-kind rule untouched.

### F-04: Middle/double/drop reuse the opener
`WebTabWidget.openInBackground`, `CHROME_BAR_NEW_TAB_COMMAND_ID`, and the NAV-06 `^https?://` wall already exist. Middle-click consumes `auxclick` button-1 (else the shell pastes selection on Linux). `javascript:`/non-http(s) refused with the 27 copy sentence shape.

### F-05: Overflow = scroll + chevron menu, one component
`scrollWidth > clientWidth` gates the chevron; re-evaluated on `resize` + tab add/remove (existing `update()` path). List All Tabs is a second `CompoundMenuNode` (pinned-first, icon+label+attention dot); picking a tab activates + `scrollIntoView`.

### F-06: Pin without a schema change
`tabs.sqlite` gets no new column. `pinnedIds: Set<string>` (keyOf keys) persists in the `ProfileStorageService` shell-state map (JSON, debounced save, existing quit-flush; `theia/extensions/tab-uris/src/browser/profile-storage.ts:104-164,206-212`, `shellStateSave` in `powerbrowser/shell/PowerBrowserAPI.sys.mjs:295,2241`). Restore reopens pinned URL tabs with their stored `rowKey` through the existing rowKey-carrying open path — `WebTabOpenHandler.openUrl(url, rowKey)` → `createWidget(url, rowKey)` → `WebTabOptions { id, url, key: rowKey }` (`theia/extensions/tab-uris/src/browser/web-tab.ts:826-852`; the same NG-008/setup wave-A precedent `group-model.ts:1039-1047` + `setups-service.ts:563-568` uses to reopen a card on its own row) — so the reopened widget's `rowKey` (`web-tab.ts:411`) equals the stored key and `GroupModel.keyOf` (`group-model.ts:120-123,177-179`) matches the stored `pinnedIds` entry (W1 named place: this paragraph, this plan line). Stale keys dropped, bounded by open tabs. Pinned tabs render icon-only, sticky-left, excluded from Close Others/Left/Right + bulk close.

### F-07: Multiselect lives in the strip (Lumino has none)
Theia 1.76 `TabBar` has no multiselect and core cannot be patched. `selectedIds: Set<string>` + anchor for Shift-range; Ctrl/Cmd-toggle, Esc clears. Bulk actions delegate to single-tab command paths (Close/Move/Mute/Bookmark) so no second implementation exists to drift.

### F-08: Preview reuses settle thumbnails
Settled thumbnails ride the `tabs.thumbnail` column (`powerbrowser/shell/PowerBrowserAPI.sys.mjs:63-78`, written by `writeThumbnail` at `:1833-1859`, scheduled by `scheduleSettleCapture` on network STOP and overlay hide at `:3334-3342,3450-3458`) and reach the frontend through `projectSessionStoreTabs` rows plus per-tab `rememberThumbnail` session memory (`theia/extensions/modes/src/browser/group-model.ts:392-407,516,546`), never through `queryTabsWithPlaces` (whose `TabPlacesRow` in `theia/extensions/tab-uris/src/browser/chrome-store-client.ts:57-71` carries no thumbnail field). Preview shows the settled thumbnail when present, else title+URL text — never a live screenshot (remoteness race, PITFALLS-4). 400 ms dwell, below-tab anchor (`top: calc(100% + 4px)`, position top per layer rule (c)), in `BLOCKING_LAYER_SELECTOR` (`theia/extensions/tab-uris/src/browser/web-tab.ts:108-141`).

### F-09: Attention is chrome-computed
The state push (`webTabPush` via `scheduleWebTabState` coalescer) already carries url/title/loading/canGoBack/canGoForward. Adding `titleChanged: boolean` (title differs since last active, background-only, cleared on `webTabActivated`) is one field on an existing push — no polling, no frame-side sniffing. Strip clears the dot on activation.

### F-10: Mute/Bookmark are calls, not implementations
TAB-01 Mute item calls Phase 32 `webTabMute` (with `soundPlaying` gating the label); Bookmark items call Phase 33 `addBookmark`. If 32/33 slip, the items render disabled with the failure copy — this phase never writes Places or mutes audio itself (privileged-kind rule).

## Validation Architecture

One static gate + one live probe, both registered as single `verify-platform.sh` rows:

- `scripts/verify-tab-strip.mjs` (static, `--quick`-eligible): derives the menu item set from `chrome-bar-copy.ts` + command predicates and compares as set equality to the ROADMAP contract parsed at check time; asserts pin/multiselect/preview/attention selectors in `chrome-bar.css` layer; asserts occlusion selector lists both new layers; asserts no new `WEB_TAB_ACTION_KINDS`/`STORE_REQUEST_KINDS` entries (field-only `titleChanged` needs none); `--self-test` plants 5 faults (remove a menu item, remove a copy row, drop an occlusion selector, add an uncatalogued kind, delete a codicon) and requires each to go red naming the drift.
- `node scripts/verify-tab-strip-live.mjs` (live, BiDi on `pb-live-probe.mjs`): scenarios `menu, reorder, middle, double, drop, overflow, pin-restore, multi, preview, attention, bookmark-all, modes`; positive page-side assertions only (never absence-of-log); avoids >4 same-site tabs per session (shared-process defect).

## Threat model (STRIDE)

| ID | Category | Description | Severity | Mitigation | Owner |
|----|----------|-------------|----------|------------|-------|
| T-34-01 | Spoofing | Dropped link navigates to `javascript:`/file | high | reuse NAV-06 `^https?://` wall; refused with copy sentence | 34-02 |
| T-34-02 | Tampering | Reorder corrupts dock layout JSON | med | reorder via `insertTab`, never hand-edits layout; layout restore gate unchanged | 34-02 |
| T-34-03 | Repudiation | Bulk close destroys tabs silently | med | close via widget close path (Phase 33 reopen restores); no new dialog this phase (D-14) | 34-03 |
| T-34-04 | Information disclosure | Preview leaks page pixels/URL/title to logs | med | primitives only in pushes; no URL/title in log lines (27-08 rule); thumbnail never leaves the renderer | 34-04 |
| T-34-05 | DoS | Pin store bloat / thumbnail storm | low | pin set bounded by open tabs; thumbnail reuse, no live capture | 34-03/04 |
| T-34-06 | Elevation | Menu action reaches a non-selected tab | high | predicates resolve the event's own tab; multiselect acts only on `selectedIds` | 34-01 |
| T-34-07 | Spoofing | `titleChanged` spoofed from frame | med | flag minted chrome-side only; frame input never trusted | 34-04 |
| T-34-SC | Supply chain | npm installs | low | accept — no package installed in this phase | all |

## must_haves

- Menu lists exactly the ROADMAP contract items with copy from `chrome-bar-copy.ts`, each disabled exactly when its predicate says so.
- Reorder/drop-index, middle/double/drop, overflow+List All, pin+persist, multiselect+bulk, preview, attention, bookmark-all each behave per 34-UI-SPEC interaction contract.
- No new tab model, no Theia core edit, no Firefox internal outside `PowerBrowserAPI.sys.mjs`, no new store kind, no Places write.
- `verify-platform.sh --quick` green; new static gate + `--self-test` green after build; live suite green after build.

## verify

- `scripts/verify-platform.sh --quick`
- `node scripts/verify-tab-strip.mjs && node scripts/verify-tab-strip.mjs --self-test`
- After a Theia build: `node scripts/verify-tab-strip-live.mjs` (+ `--self-test`)

## fails_when

- Any menu item missing/mislabelled, or enabled when its predicate refuses.
- Reorder changes anything except home-pane `TabBar` order; order lost on mode switch.
- Pinned tab scrolls away, closes via Close Others, or is missing after restart.
- Preview screenshots live, covers the page rect, or shows for the active tab's visible overlay.
- Attention dot settable from the frame, or surviving activation.
- Any URL/title/id/scheme in a log line or user-facing string outside the labelled diagnostics row.
