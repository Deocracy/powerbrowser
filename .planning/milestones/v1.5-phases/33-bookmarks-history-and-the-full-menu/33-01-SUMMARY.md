---
phase: 33-bookmarks-history-and-the-full-menu
plan: "01"
subsystem: chrome-boundary
tags: [bookmarks, places, clear-history, closed-tabs, observer-push, rule-12, static-gate]
status: complete
requires:
  - phase: 29-address-bar-search-and-fixup
    provides: removeHistoryEntry privileged-kind precedent, storeUrlArg wall, token-cookie strip
  - phase: 30-address-bar-modes-and-command-centre
    provides: rule-12 caller fence pointed at address-bar/address-bar.tsx
  - phase: 31-site-identity-and-app-menu
    provides: store-write/lifecycle classes, MENU kinds
provides:
  - "Store kinds (STORE_REQUEST_KINDS + arms): bookmarkPage, updateBookmark, removeBookmark, clearHistory (privileged); listClosedTabs, reopenClosedTab (read)"
  - "listBookmarkFolder accepts 'toolbar' | 'menu' | 'unfiled' (Places root GUIDs) or a 12-char GUID"
  - "Push kind bookmarks-changed (chrome -> shell window's Theia frame); WebTabChannel.onDidChangeBookmarks"
  - "ChromeStoreClient.bookmarkPage/updateBookmark/removeBookmark/listClosedTabs/reopenClosedTab/clearHistory + ClosedTabRow, ReopenableTab, ClearHistoryRange types"
  - "Closed web overlays keep their back/forward history unarmed (cap 25) for reopen"
  - "scripts/verify-clear-history.mjs (+ --self-test) and the clear-history / clear-history-self-test quick rows"
affects:
  - 33-02 (star + editor call bookmarkPage/updateBookmark/removeBookmark from address-bar.tsx; star re-reads on onDidChangeBookmarks)
  - 33-03 (toolbar re-reads listBookmarkFolder('toolbar') on onDidChangeBookmarks; reopen uses reopenClosedTab + armWebTabHistory; History submenu uses listClosedTabs)
  - 33-04 (clear panel confirm calls clearHistory from chrome-bar-widget.tsx)
  - 33-05 (fullScreen kind + window-chrome class land there, not here)
  - 34 (BMK-07 tab-menu bookmark rows reuse bookmarkPage)
tech-stack:
  added: []
  patterns:
    - "Fan-out as a named table (CLEAR_HISTORY_FANOUT) so the gate derives targets by name"
    - "Expected fan-out derived from the boundary's own store declarations (DDL markers, *_FILE_NAME constants), never a hand-kept list"
    - "Privileged-caller fence with exactly two sanctioned files (pill + widget)"
key-files:
  created:
    - scripts/verify-clear-history.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-platform.sh
key-decisions:
  - "The push kind keeps the plan's literal name bookmarks-changed; rule 9's push/subscription regexes widened to [A-Za-z][A-Za-z-]* so the hyphenated kind is derived on both sides instead of silently skipped."
  - "The bookmarks-changed subscriber lives in WebTabChannel (web-tab.ts) next to downloadsChanged and is exposed as onDidChangeBookmarks, so rule 9 parity is green in 33-01 and 33-02/33-03 consume one event."
  - "The bookmark observer install is a second guarded line in setGroupSenderPort beside installTokenCookieStrip; a failed install is logged and retried, never thrown into the sender-wall setter."
  - "Closed overlays keep their history unarmed via keepCrashedWebTabHistory(entry, false), capped at 25 (browser.sessionstore.max_tabs_undo); without it an in-session closed tab would reopen with no back/forward history."
  - "clearHistory runs every fan-out target even when one fails, then fails the kind naming targets only; thumbnails clear for rows seen in range, saved pages by saved_at plus copies of deleted closed rows, web-tab histories with their deleted rows (all of them for everything)."
  - "bookmarkPage is idempotent (an already-bookmarked page returns its first bookmark) and defaults to Firefox's browser.bookmarks.defaultLocation (toolbar), read through the catalogued getStringPref."
  - "removeBookmark takes one target: a 12-char GUID removes that bookmark, an http(s) URL removes every bookmark of the page; 0 when none."
patterns-established:
  - "A store-history fan-out target must be derivable from a store declaration in the boundary, or verify-clear-history goes red on the surplus/missing name."
requirements-completed: []
duration: "approx. 75 min"
completed: "2026-10-31"
commits: 3
plan_head_before: 23c08bb5dd176949f619cf8781cf34fb54c74f6d
plan_head_after: 7256f2c2d385040cdf9a743bd9debf865deb5694
actuals:
  tokens: 63602
  tasks: 3
  commits: 3
---

# Phase 33 Plan 01: Bookmark, closed-tab and clearHistory boundary kinds Summary

**Chrome now serves bookmark insert/update/remove, the closed-tab list and reopen lookup, and a single `clearHistory` fan-out (Places `removeVisitsByFilter`, closed tab rows, thumbnails, saved pages, web-tab histories; token cookie never reached). A Places observer pushes `bookmarks-changed` to the Theia frame. Rule 12 classifies every new kind, and the new `verify-clear-history` gate pins the fan-out against the boundary's own store declarations.**

## Status

Complete for the static scope. No live run was possible (no objdir, no Gecko build). The live checks are listed under "Deferred to end-of-milestone live pass".

## Performance

- Tasks: 3/3
- Commits: 3 (measured from the plan ledger)
- Files: 1 created, 6 modified

## Accomplishments

- Six new store kinds in `STORE_REQUEST_KINDS`, each with one `handleStoreRequest` arm and its function in an end-of-file `Phase 33: bookmarks and clear-history` section.
- `listBookmarkFolder` resolves the names `toolbar`/`menu`/`unfiled` to the `PlacesUtils.bookmarks` root GUID constants. A 12-char GUID is still accepted. Anything else is refused with fixed text.
- A single once-guarded `PlacesUtils.observers` listener on stock chrome's four events. It pushes `bookmarks-changed` through `findShellWindow()` → `#powerbrowser-content` → `sendWebTabPush`.
- `webTabClose` keeps a closed overlay's session history unarmed, so `reopenClosedTab` can report `withHistory`.
- Rule 12 (`verify-web-tab-bridge.mjs`): 6 new class entries. The privileged fence now admits exactly `address-bar/address-bar.tsx` and `chrome-bar-widget.tsx`. Push parity now derives hyphenated kinds. The self-test went from 31 to 40 plants, plus a positive control for a sanctioned caller.
- `verify-clear-history.mjs`: covers fan-out set equality, the token exemption (with a positive control), the exact range set, and the BMK-04 observer install. Its self-test has 10 plants, and each one goes red naming its drift.
- INTERNAL-APIS.md: 10 appended Touchpoints rows. The privileged-kind paragraph and the PlacesUtils row prose were updated in place. Catalogue lines were renumbered.

## Exported names later plans and Phase 34 consume

**Chrome store kinds** (`powerbrowser/shell/PowerBrowserAPI.sys.mjs`, rule-12 class in brackets):
- `bookmarkPage {url, title?, folderGuid?}` → `{bookmark: {guid, title, url}}` [privileged]
- `updateBookmark {guid, title?, folderGuid?}` → `{bookmark: {guid, title, url}}` [privileged]
- `removeBookmark {target}` (GUID or http(s) URL) → `{removed: number}` [privileged]
- `listClosedTabs {limit?}` (1..25, default 10) → `{rows: [{uri, url, title, closedAt}]}` [read]
- `reopenClosedTab {uri?}` → `{tab: {uri, url, title, key, withHistory} | null}` [read]
- `clearHistory {range}` (`last-hour|last-2-hours|last-4-hours|today|everything`) → `{cleared: range}` [privileged]
- `listBookmarkFolder {folderGuid}` now also accepts `'toolbar'|'menu'|'unfiled'`
- Push: `{kind: "bookmarks-changed"}` (no payload)

**Boundary functions (end-of-file, module-level):** `resolveBookmarkFolder`, `defaultBookmarkFolder`, `bookmarkPage`, `updateBookmark`, `removeBookmark`, `pushBookmarksChanged`, `installBookmarkObserver`, `keepClosedWebTabHistory`, `listClosedTabs`, `reopenClosedTab`, `clearHistory`, plus the fan-out targets `clearPlacesHistory`, `clearClosedTabRows`, `clearTabThumbnails`, `clearSavedPages`, `clearWebTabHistories`. Constants: `CLEAR_HISTORY_RANGES`, `CLEAR_HISTORY_FANOUT`, `BOOKMARK_OBSERVER_EVENTS`. The `PowerBrowserAPI.keepCrashedWebTabHistory(entry, arm = true)` method gained an `arm` parameter.

**ChromeStoreClient** (`theia/extensions/tab-uris/src/browser/chrome-store-client.ts`):
- `bookmarkPage(url, title, folderGuid?): Promise<BookmarkEntry>`
- `updateBookmark(guid, title?, folderGuid?): Promise<BookmarkEntry>`
- `removeBookmark(guidOrUrl): Promise<number>`
- `listClosedTabs(limit?): Promise<ClosedTabRow[]>`
- `reopenClosedTab(uri?): Promise<ReopenableTab | null>`
- `clearHistory(range: ClearHistoryRange): Promise<string>`
- New exported types: `ClosedTabRow`, `ReopenableTab`, `ClearHistoryRange`

**WebTabChannel** (`theia/extensions/tab-uris/src/browser/web-tab.ts`): `onDidChangeBookmarks: Event<void>`.

Reopen recipe for 33-03: call `reopenClosedTab()`. When `withHistory` is true, call `armWebTabHistory(key)` first. Then open a web tab with `key` (null for a stock row) and `url`, as `setups-service.ts` `restoreWebTab` does.

## Task Commits

1. Task 2 (committed first, see Deviations): `453635dc` feat(33-01): same-named ChromeStoreClient methods for the Phase 33 store kinds
2. Task 1: `000f3a07` feat(33-01): boundary kinds for bookmarks, closed tabs and clearHistory (commit message carries the upstream signatures)
3. Task 3: `7256f2c2` test(33-01): verify-clear-history gate plus registry rows

## Files Created or Modified

- `scripts/verify-clear-history.mjs` (new): the fan-out, token-exempt, range and observer gate, with a self-test
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs`: kinds, arms, the end-of-file section, the observer install line, keeping history on close
- `powerbrowser/INTERNAL-APIS.md`: 10 rows, the privileged-kind paragraph, renumbering
- `theia/extensions/tab-uris/src/browser/chrome-store-client.ts`: six methods and three types
- `theia/extensions/tab-uris/src/browser/web-tab.ts`: the `bookmarks-changed` subscription and `onDidChangeBookmarks`
- `scripts/verify-web-tab-bridge.mjs`: classes, the two-file fence, hyphenated push kinds, plants
- `scripts/verify-platform.sh`: the `clear-history` and `clear-history-self-test` quick rows

## Decisions Made

See the `key-decisions` frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2 committed before Task 1**
- Found during: Task 1 verify
- Issue: rule 12 requires a same-named `ChromeStoreClient` method for every privileged kind. A Task-1-only commit fails `verify-web-tab-bridge`.
- Fix: committed the client methods first, so every commit stays green.
- Commits: 453635dc, 000f3a07

**2. [Rule 3 - Blocking] `bookmarks-changed` subscriber added in `web-tab.ts` (outside the plan's file list)**
- Issue: rule 9 push-kind parity fails on a chrome push with no frontend subscriber. The `[A-Za-z]+` regex would also have skipped the hyphenated name silently.
- Fix: widened the rule 9 regexes, and added `onPush('bookmarks-changed')` plus `onDidChangeBookmarks` in `WebTabChannel`, the `downloadsChanged` precedent.
- Commit: 000f3a07

**3. [Rule 2 - Missing critical] Closed overlays keep their history for reopen**
- Issue: in-session closes saved no back/forward history. `reopenClosedTab` could never report `withHistory`, so the BMK-03 truth "restores the closed tab with its history" would fail.
- Fix: `webTabClose` calls `keepClosedWebTabHistory` (unarmed, cap 25). `keepCrashedWebTabHistory` gained an `arm` parameter. Side effect: a frontend reload that re-arms a restored tab now restores its current history, not the file's.
- Commit: 000f3a07

**4. [Rule 1 - Bug] Guarded the observer install**
- Found during: the `--quick` run (`tab-store-offline`, `ng-087`, `ng-088` went red: the offline fakes have no `PlacesUtils.observers`)
- Issue: an install throw inside `setGroupSenderPort` would break the sender-wall setter.
- Fix: try/catch with a fixed-text warn, and a retry on the next call.
- Commit: 000f3a07

**5. [Rule 3 - Tooling] Catalogue renumbering done deterministically**
- Issue: `verify-ng-040 --fix` uses a nearest-free-line search. Several boundary edits at different offsets made it misassign rows, leaving 12 occurrences uncatalogued.
- Fix: rebuilt the File:Line cells from the `git diff -U0` hunk offsets, a deterministic shift. `ng-040` and `--catalogue` both PASS.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-33-01 (rule 12 plus the two-file fence plus plants) and T-33-04 (fan-out set equality plus the token detector with a positive control) are both mitigated statically.

## Deferred to end-of-milestone live pass

- The live run of each new client method against a live shell. The plan states live proof runs at execution time, but there is no objdir here.
- BMK-05 live: plant a URL in Places, closed rows, thumbnails, saved pages and the web-tab history file. Run `clearHistory` per range. Require the planted rows gone, open rows (closed_at NULL) kept, out-of-range rows kept, the `POWERBROWSER_TOKEN` cookie surviving, and the backend still authorised (the Phase 31 probe-13 shape).
- BMK-04 live: a bookmark added or removed in a stock window pushes `bookmarks-changed` into the Theia frame (`onDidChangeBookmarks` fires).
- BMK-03 live: close a web tab after a navigation, then confirm `reopenClosedTab()` returns `withHistory: true` and the reopened tab walks back.
- Chrome-side `.js` edits need `-purgecaches` at runtime.

## Issues Encountered

`verify-ng-040 --fix` heuristic misassignment (Deviation 5).

## Next Phase Readiness

33-02 through 33-04 can call every kind through `ChromeStoreClient`. Privileged calls are admitted only from `address-bar/address-bar.tsx` and `chrome-bar-widget.tsx`. `fullScreen` is still for 33-05.

Final `nix develop .#theia --command scripts/verify-platform.sh --quick`: exit 0, "verify-platform: PASS -- all checks passed".

## Self-Check: PASSED

- FOUND: scripts/verify-clear-history.mjs
- FOUND: 453635dc, 000f3a07, 7256f2c2 (ancestors of HEAD)
- `node scripts/verify-clear-history.mjs --self-test`: PASS (10 plants)
- `node scripts/verify-web-tab-bridge.mjs --self-test`: PASS (40 plants)
- `bash scripts/check-internals-boundary.sh --catalogue` / `verify-ng-040`: PASS
