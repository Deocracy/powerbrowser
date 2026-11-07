# Phase 34: Tab Strip — Patterns

**Status:** Ready for planning
**Sources:** `tab-strip-widget.tsx`, `chrome-bar-widget.tsx` (NAV-03 menu), `chrome-bar-shortcuts.ts` (hover + relay), `web-tab.ts` (channel + opener), `group-model.ts` (identity), `profile-storage.ts` (shell-state), `PowerBrowserAPI.sys.mjs` (push coalescer), prior `27/29/30-PATTERNS.md`.

## Reusable implementations (copy, do not reinvent)

### P-01: Per-request menu via ContextMenuRenderer (from NAV-03)
`chrome-bar-widget.tsx` builds a `CompoundMenuNode` fresh per right-click and shows it with `ContextMenuRenderer.render({ menuNode, args })`. Copy for TAB-01 menu and TAB-04 List All Tabs. Never cache the node (predicates are check-time).

### P-02: Hover below the bar (from 27-08 + NAV-05)
`HoverService.requestHover({ content, target, position: 'top' })`; tooltip short enough to sit above the bar per layer policy (c). Copy for preview anchor (`top: calc(100% + 4px)`); preview is a blocking layer so it additionally joins `BLOCKING_LAYER_SELECTOR`.

### P-03: State push rides the coalescer (from GUI-02)
`scheduleWebTabState` → `webTabPush` per animation frame, latest-wins per tab. `titleChanged` is one more primitive field on that payload, read in `WebTabChannel.onPush` alongside `loading`/`canGoBack`. No new channel, no new kind.

### P-04: Drop/open via opener (from NAV-06)
`openInBackground(url)` / `CHROME_BAR_NEW_TAB_COMMAND_ID`; scheme wall `^https?://` before any load, `javascript:` refused with the 27 copy sentence. Copy for double-click-empty, link/file drop, move-to-new-position opens.

### P-05: Pin persistence via shell-state map (from Phase 20 / NG-033)
`ProfileStorageService` JSON map (`powerbrowser-shell-state.json` over the group actor, debounced save, quit-flush; NG-033 proved the mode/layout half of this map survives relaunch). Pin stores `pinnedIds: string[]` (keyOf keys). Restore on startup after layout restore reopens each stored URL **with its stored `rowKey`** through the existing rowKey-carrying open path (W1: `WebTabOpenHandler.openUrl(url, rowKey)` in `theia/extensions/tab-uris/src/browser/web-tab.ts:826-852`, the NG-008/setup wave-A precedent at `group-model.ts:1039-1047` + `setups-service.ts:563-568`), so the reopened widget's `rowKey` (`web-tab.ts:411`) equals the stored key and `keyOf` matches.

### P-06: Thumbnail reuse (from GUI-08)
Settled thumbnails ride the `tabs.thumbnail` column (written by `writeThumbnail`, scheduled by `scheduleSettleCapture` on network STOP and overlay hide) and reach the frontend through `projectSessionStoreTabs` rows plus per-tab `rememberThumbnail` session memory; never through `queryTabsWithPlaces` (its `TabPlacesRow` carries no thumbnail field). Preview reads the cached data URL; never calls capture, never screenshots live.

## Conventions to follow

- **C-01 identity:** `GroupModel.keyOf(widget)` is the only tab identity in strip state (pin, selection, attention). Never `tabId`, never URL.
- **C-02 predicates:** every menu item = `{ id, label(COPY), enabledWhen(widget, selection), run }`; enabled evaluated at open time from the tree. Static gate derives the same set.
- **C-03 delegation:** bulk actions call the single-tab command (`CommandRegistry.executeCommand`) per selected tab; no second implementation.
- **C-04 occlusion:** any element that must cover the overlay joins `BLOCKING_LAYER_SELECTOR` in `web-tab.ts` and the `MutationObserver` republish keeps working; static gate asserts membership.
- **C-05 logging:** log lines carry kind + error text only; never URL/title/id/scheme (27-08 rule, copy gate enforces).
- **C-06 CSS:** one layer `@layer powerbrowser-chrome-bar`; new selectors (`.pb-tab.is-pinned`, `.is-selected`, `.pb-tab-preview`, `.pb-tab-attention`, chevron) live there; no literal typeface; accent only for active/attention/focus/highlight.
- **C-07 boundary:** end-of-file sections with own lazy-getter blocks; run `verify-ng-040-internals-catalogue-lines.mjs --fix` in <action> after any boundary edit (N1 — never in <verify>, where repair-before-read can never go red; any plan whose edit shifts catalogue lines lists `powerbrowser/INTERNAL-APIS.md` in files_modified) and assert zero new-row diff via `check-internals-boundary.sh --catalogue`; no new `STORE_REQUEST_KINDS` (pin is frontend state riding the already-catalogued `shellStateSave` kind — no new catalogue row, W4) and no new `WEB_TAB_ACTION_KINDS` (`titleChanged` is a field on the existing push, W3); the `KIND_CLASSES` / `STORE_KIND_CLASSES` maps in `scripts/verify-web-tab-bridge.mjs` stay unchanged (read-only confirmation, never edited).

## Anti-patterns (pitfalls carried forward)

- **A-01:** No second tab model — do not mirror dock order in a strip array; read `TabBar` order live (hard rule 3, PITFALLS-2).
- **A-02:** No hand-kept lists — menu sets, dropdown entries, kind unions derived at check time and compared as set equality (verification rule 2).
- **A-03:** No absence assertions — live scenarios assert positive page-side state (probe sees X), never "no log line" (verification rule 1). Middle-click no-paste (N2) proves via a seeded `contenteditable` in the page whose `input`/`paste` events are recorded in the page realm: a real middle-click paste into it is caught first (positive control, same session, same recorder — a detector that cannot fire fails the scenario as NOT SCORED, never a pass), then middle-click on a tab must leave that same detector silent; a clipboard read alone can never go red because a paste only reads the clipboard.
- **A-04:** No silent fallbacks — disabled items explain via copy; refused drops show the failure sentence (PITFALLS-3).
- **A-05:** No frame-trusted identity — `webTabActivated` keys by embedder element; `titleChanged` minted chrome-side (PITFALLS-4 key discipline).
- **A-06:** No `javascript:`/non-http(s) navigation — the NAV-06 wall guards every new open path.
- **A-07:** No >4 same-site tabs per live session — shared-process blank defect still open; scenarios use distinct hosts.
