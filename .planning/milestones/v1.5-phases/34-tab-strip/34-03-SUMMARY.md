---
phase: 34-tab-strip
plan: "03"
subsystem: chrome-bar
tags: [tab-strip, pin, multiselect, bulk-actions, shell-state, static-gate, live-harness]
requires:
  - phase: 34-tab-strip (plan 01)
    provides: tabMenuRows predicate table, the ten labelless tab commands, the bookmarkTabs callback, showMenu, verify-tab-strip.mjs
  - phase: 34-tab-strip (plan 02)
    provides: moveInBar and reorderTo (the TabBar order helpers Pin, Unpin and Move reuse), the live harness runner
  - phase: 32-page-tools
    provides: WebTabWidget.setMuted / audioMuted / soundPlaying (bulk Mute runs the single Mute row per tab)
  - phase: 33-bookmarks-history-and-the-full-menu (plan 01, concurrent lane, not in this tree)
    provides: ChromeStoreClient.bookmarkPage (bulk Bookmark reaches it only through 34-01's one bookmarkTabs callback)
  - phase: 20 (NG-033/NG-034)
    provides: ProfileStorageService shell-state map, SetupsService launch restore on each tab's own rowKey
provides:
  - TabStripWidget.pinnedIds (keyOf keys), togglePin, savePins, restorePins, pinRestore promise, isPinned
  - TabStripWidget.selectedIds + anchorKey, onTabClick (Ctrl/Cmd toggle, Shift range, plain clear), Esc clear
  - TabStripWidget.bulkMenuRows, runOnEach, runTabRow (bulk delegation to the single-tab rows)
  - ProfileStorageService.readPinnedIds / writePinnedIds, PINNED_TABS_STORAGE_KEY, PinnedTab
  - SetupsService.sessionRestored (settles after the launch restore)
  - verify-tab-strip.mjs checks 8 (keys), 9 (delegation), 10 (pin store) and five plants
  - live scenarios pin-restore and multi, each with a --self-test plant
affects:
  - 34-04 (attention dot joins pinned tabs; the pinned tooltip/label is where ", updated" goes)
  - 34-05 (bookmark-all and modes scenarios run with pins and selection present)
tech-stack:
  added: []
  patterns:
    - strip-local state keyed only by GroupModel.keyOf through one tabKey() method, pruned on the widget's disposed signal
    - bulk row = runOnEach(tabs, '<single row id>'), each tab through its own row's command (or the row itself)
    - a restore that waits on the launch restore's settle promise, then re-pins by own-key equality
key-files:
  created: []
  modified:
    - theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - theia/extensions/tab-uris/src/browser/profile-storage.ts
    - theia/extensions/modes/src/browser/setups-service.ts
    - scripts/verify-tab-strip.mjs
    - scripts/verify-tab-strip-live.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-platform.sh
key-decisions:
  - "Pin restore waits on a new SetupsService.sessionRestored promise. The launch restore already reopens web tabs on their own rowKeys, so the pin restore first looks for an open tab carrying each stored key and reopens (openUrl(url, rowKey)) only the ones that restore did not bring back. Reopening before that restore finished would have opened a second widget on the same row."
  - "The stored list is [{ key, url? }] under one shell-state key (powerbrowser.tab-strip.pinnedIds). The key is the only identity; the URL is carried only so a web tab the launch restore skipped (restore_behaviour none, aged out) can reopen. Pinned tabs come back even when session restore is off, as in Firefox."
  - "Restore order: stored order, pins moved to the front of the home pane TabBar (moveInBar index 0..n-1); the tab current before the restore is re-activated after it."
  - "Pin puts the tab last in the pinned block and Unpin first after it (Firefox). stripTabs also partitions pinned-first, so a drag that puts an unpinned title among the pins in the bar still renders after them."
  - "Move to Start / Move to End act within the tab's own block (pinned or unpinned), through reorderTo, so Move to Start on an unpinned tab never jumps it over the pins."
  - "Pinned tabs hide the close button, the label and the audio mark (32px is icon only); the pinned tab keeps its full label as its tooltip and its accessible name is '{label}, pinned' (CHROME_BAR_COPY.pinnedTabLabel)."
  - "Ctrl/Cmd-click toggles only the clicked tab (the plan's wording). Firefox's implicit inclusion of the current tab was not added."
  - "The N-Tabs rows are an extra group at the end of the menu, offered when the right-clicked tab is in a selection of two or more; the single-tab rows stay. Right-clicking a tab outside the selection clears the selection."
  - "Mute N Tabs mutes the selected unmuted web tabs; when every selected web tab is muted the row reads Unmute N Tabs. Each tab goes through its own Mute row, so a silent tab (its single row disabled) is skipped."
  - "Move N Tabs to Start runs the tabs last-first and Move N Tabs to End first-first, so the selection keeps its relative order."
  - "Pin and selection keys leave the strip state on the widget's Lumino disposed signal, not on shell removal: a collapsed stack and a mode layout restore detach widgets without closing them."
  - "The .is-pinned and .is-selected rules are unlayered beside the .pb-tab rules they override: a layered rule loses to the unlayered .pb-tab min-width, padding and background whatever its specificity. The sticky .pb-tab-pinned-block is inside the layer (no unlayered competitor)."
patterns-established:
  - "Every pinnedIds/selectedIds argument is literally this.tabKey(x); the gate derives each call and goes red naming the expression otherwise."
requirements-completed: [TAB-05, TAB-06]
duration: "about 45 minutes of execution"
completed: 2026-11-01
status: complete
commits: 3
plan_head_before: e8e058ab1054d4fdb8f751362e38ea19622d8590
plan_head_after: 95307ffac5713fbb895243f4bfaaa52e671e9f0a
actuals:
  tokens: 12000
  tasks: 3
  commits: 3
---

# Phase 34 Plan 03: Pin with restart persistence and multiselect Summary

**Pinned tabs are strip-local state keyed only by GroupModel.keyOf, render as a 32px icon-only sticky block at the strip's start, stay out of the range closes, and persist as [{ key, url }] in the shell-state map; after the launch restore they re-pin by own-key equality, with missing web tabs reopened on their stored rowKey. Ctrl/Cmd-click, Shift-click and Esc drive a keyOf-keyed selection, and the Close/Move/Mute/Bookmark N Tabs rows run each selected tab's own single-tab row. No kind, no catalogue row and no tabs.sqlite change were added.**

## Status

Complete for build work and every static check. Both live scenarios are written and parse, but were not run. The lane ruling is no Gecko build and no live browser. Restart persistence of pins is therefore proven statically only until the end-of-milestone pass.

## Performance

- **Tasks:** 3 of 3 executed.
- **Commits:** 3 production commits (`c2c0cd0c`, `e2a25160`, `95307ffa`), then the SUMMARY commit.
- **Realized diff:** 781 insertions and 38 deletions over 9 files, about 12,000 tokens by chars/4 over the diff. The plan estimate was 95,000 on the same scale.

## Accomplishments

- **Pin (TAB-05, D-08).** `pinnedIds: Set<string>` holds `tabKey(widget)` values. `tabKey` is `this.groups.keyOf(widget)` and is the only way a key is made. The Pin row (34-01's disabled stub) now toggles: Pin Tab or Unpin Tab, with the `pin` or `pinned` codicon. It is enabled for any tab the strip shows.
- **Pinned rendering.** Pinned tabs render inside `.pb-tab-pinned-block` (`position: sticky; left: 0`, 1px separator, strip background), so they never scroll away. Each carries `.is-pinned`: 32px wide, no padding, label, audio mark and close button hidden. A non-web pinned tab shows its title icon, or `codicon-file`.
- **Range closes.** Close Other Tabs, Close Tabs to the Left and Close Tabs to the Right skip pinned tabs unless the pinned tab is in the selection.
- **Persistence.**
  - `ProfileStorageService.writePinnedIds` stores the list under `powerbrowser.tab-strip.pinnedIds` through `setData`, so it rides the existing debounced `shellStateSave`, the quit flush and the unload write.
  - `readPinnedIds` validates each entry: a string key and an optional string URL, at most 500 entries. Anything else is dropped.
  - `savePins` is the one writer. It builds the list from `openTabs()` filtered by `pinnedIds`, so the store holds only open tabs (T-34-05). It runs on toggle, on a pinned tab's disposal, and in an `onWillFlush` listener, which captures each web tab's current URL at quit. It writes nothing until the restore has finished, so an early quit cannot erase the stored list.
- **Restore (W1).** `restorePins` runs after `SetupsService.sessionRestored`. For each stored entry, in stored order:
  - It looks for an open tab whose `keyOf` is the stored key.
  - If none exists and the entry has an http(s) URL, it calls `WebTabOpenHandler.openUrl(url, key)`. That builds `WebTabOptions { key }`, so the new widget's `rowKey`, and so its `keyOf`, equal the stored key.
  - It re-pins only when the tab's own key equals the stored key. A stale key is dropped.
  - The re-pinned tabs move to the front of the TabBar in stored order, and the previously current tab is re-activated.
- **Multiselect (TAB-06, D-09).**
  - `selectedIds` holds keyOf keys, and `anchorKey` is the Shift-click anchor.
  - Ctrl/Cmd-click toggles the tab and makes it the anchor. Shift-click selects the strip-order range from the anchor, or from the current tab when there is no anchor. A plain click clears the selection and activates the tab. Esc on the window clears the selection and is not consumed.
  - Selected tabs get `.is-selected` (the sheet's accent wash) and `aria-selected`; the row has `aria-multiselectable`.
  - A closed tab leaves the selection, so the selection empties when every selected tab closes.
- **Bulk delegation (C-03).** `bulkMenuRows` adds Close N Tabs, Move N Tabs to Start, Move N Tabs to End, Mute/Unmute N Tabs and Bookmark N Tabs. Each row's `run` is `this.runOnEach(tabs, '<single row id>')`, and `runOnEach` rebuilds each tab's own row and runs it through `runTabRow`:
  - A row with a command goes through `CommandRegistry.executeCommand(<34-01 tab command>, tab)`.
  - The Bookmark row (no command, because of Phase 33's fence) runs itself, which calls the one `bookmarkTabs` callback with that tab.
  - The tab menu's own rows now run through the same `runTabRow`.
- **Copy (D-15).** New rows:
  - `tabMenu.unpin`, plus `closeN`, `moveNToStart`, `moveNToEnd`, `muteN`, `unmuteN` and `bookmarkN` (functions of the count).
  - `pinnedTabLabel`.
  - All of them were added to `EXPECTED_NAV_COPY` in the same commits.
- **Static gate.** `verify-tab-strip.mjs` changes:
  - **Check 8 (keys):** every `pinnedIds`/`selectedIds` `add`/`has`/`delete` argument, read up to its balanced paren, must be `this.tabKey(x)`. Every `Set` build and every anchor assignment must come from `tabKey`. `tabKey` must be exactly `return this.groups.keyOf(widget);`. No `web:` literal may appear in the strip.
  - **Check 9 (delegation):** every bulk arm must be exactly `runOnEach(<tabs>, '<id>')`, naming a `tabMenuRows` row that has a `CHROME_BAR_TAB_*_COMMAND_ID` or is the `bookmark!([page!])` row. The bulk body must make no direct close, move, mute, bookmark or command call. `runOnEach` must go through `runTabRow`, and `runTabRow` through the command or the row.
  - **Check 10 (pin store):** `savePins` must build from open tabs filtered by `pinnedIds` and must never spread `pinnedIds`. `writePinnedIds` must be called once, inside `savePins`. `restorePins` must guard the re-pin with own-key equality.
  - The target check now also covers `bulkMenuRows`. Check 2 reads copy keys from `bulkMenuRows` too.

## Bulk-action dependency gaps (Phase 32/33)

- **Mute (Phase 32): present.** Bulk Mute runs the single Mute row per tab, which is enabled only while that tab plays sound or is muted. With silent pages, Mute N Tabs is disabled.
- **Bookmark (Phase 33): absent in this tree.** `ChromeStoreClient.bookmarkPage` is not here, so `bookmarkTabs` is undefined. The single Bookmark row and Bookmark N Tabs are both rendered disabled, never absent, and nothing is reimplemented. They turn on after the Phase 33 merge with no edit here.

## Cross-lane names assumed (Phase 33)

- `ChromeStoreClient.bookmarkPage(url, title, folderGuid?)`: unchanged from 34-01. Probed by `typeof` in `ChromeBarContribution.onStart`.
- Bulk Bookmark reaches it only through `TabStripWidget.bookmarkTabs`, the callback set from `ChromeBarWidget.tabBookmarker()` in chrome-bar-widget.tsx. Phase 33 sanctions that file. No second `.bookmarkPage(` call site exists. The strip names `bookmarkPage` only in 34-01's doc comment on `bookmarkTabs`, and check 9 goes red on a `bookmarkTabs` or `bookmarkPage` call inside the bulk rows.
- No `STORE_REQUEST_KINDS` or `WEB_TAB_ACTION_KINDS` entry was added, and `verify-web-tab-bridge.mjs` was not touched.

## Task Commits

1. **Task 1 (tracer): pin toggle persisted through the shell-state map.** Commit `c2c0cd0c`. Tracer gate in auto mode: the automated half (Theia build, `verify-tab-strip` and `--self-test`, copy gate, registry shape, catalogue, `--quick`) was re-run green before expanding. The live half is deferred.
2. **Task 2: multiselect with anchor/range and bulk delegation.** Commit `e2a25160`.
3. **Task 3: keyOf-origin, delegation and pin-store guards; full pin-restore scenario.** Commit `95307ffa`.

## Gate results

- **Theia build:** `nix develop .#theia --command bash -c 'cd theia && yarn build'` exited 0 with 0 `error TS` after each task. The compiled `lib/browser/tab-strip-widget.js` carries `restorePins`, `togglePin`, `bulkMenuRows` and `runOnEach`.
- **`node scripts/verify-tab-strip.mjs`:** PASS (menu, copy, occlusion, kinds, codicons, target, overflow, keys, delegation, pin store).
- **`node scripts/verify-tab-strip.mjs --self-test`:** PASS. The unmodified tree was green first, then 13 plants each went red naming their drift. The five new ones:
  - `url-keyed-pin`: red naming `pinnedIds.add(widget.url)`
  - `tabid-keyed-selection`: red naming `selectedIds.add(widget.id)`
  - `second-close-path`: red naming bulk arm `close-n` running `this.closeTabs(selected)`
  - `unbounded-pin-store`: red naming `savePins`
  - `stale-key-repinned`: red naming `entry.key`
- **`node scripts/verify-shell-error-copy.mjs` and `--self-test`:** PASS. Nine new strings are pinned.
- **`bash scripts/check-internals-boundary.sh --catalogue`:** PASS. `git diff e8e058ab -- powerbrowser/` is empty: no boundary edit and no INTERNAL-APIS.md change (W4). The N1 `--fix` rule did not apply.
- **`node scripts/verify-registry-shape.mjs`:** PASS (GUI-04 shape unchanged).
- **`node --check scripts/verify-tab-strip-live.mjs`:** OK after each task.
- **`scripts/verify-platform.sh --quick`**, run inside `nix develop .#theia` after staging: exit 0 after each task commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] setups-service.ts edited (not in the plan's file list)**
- **Issue:** the plan says to restore "after layout restore". The web tabs, though, come back in `SetupsService.applyLastSession`, which runs after `ready` and signals nothing. A pin restore racing it would reopen a row that restore is about to reopen, giving two widgets on one rowKey.
- **Fix:** `readonly sessionRestored: Promise<void>`, a `Deferred` resolved in `.finally` of the existing ready-ordered `applyLastSession` call. Its behaviour is otherwise unchanged.
- **Commit:** `c2c0cd0c`

**2. [Rule 3 - Blocking] Copy gate and tab-strip copy check grown in Tasks 1 and 2, not only Task 3**
- **Issue:** `EXPECTED_NAV_COPY` and check 2 both compare by set equality, so `--quick` would have gone red at the Task 1 and Task 2 commits.
- **Fix:** each copy row was pinned in the commit that added it. Check 2 now unions the keys read by `tabMenuRows` and `bulkMenuRows`.

**3. [Rule 1 - Bug] Pinned and selected CSS unlayered**
- **Issue:** C-06 asks for new selectors inside the layer. The unlayered `.pb-tab` rules (min-width 120px, padding, background) beat any layered rule, so a layered `.is-pinned` could never be 32px. 34-02 found the same thing for opacity.
- **Fix:** `.pb-tab.is-pinned` and `.pb-tab.is-selected` sit unlayered next to the rules they override, each with a comment giving the cascade reason. `.pb-tab-pinned-block` is in the layer.

**4. [Design] Move rows now use reorderTo within the tab's block, instead of moveInBar(0 / Infinity)**
- **Reason:** with a pinned block, "start" for an unpinned tab is the first slot after the pins. `reorderTo` still ends in `moveInBar`.

**5. [Plan inconsistency] Live plants for the multi scenario**
- **Issue:** the plan's plant "selects A and asserts B untouched" needs the bulk row labels to keep working. A plant that widened the selection would change N and break the row lookup, which is a harness error, not a red.
- **Fix:** the plant `multi-touches-unselected` widens `runOnEach` in the running page to every shown tab. The scenario then goes red with "touched an unselected tab".

**6. [Scope] verify-platform.sh: comment only**
- **Reason:** `tab-strip-live` runs every SCENARIOS entry by default, and `internals-catalogue` is already a quick row. Only the `tab-strip` row comment changed.

**7. [Plan inconsistency] Tabs.sqlite and URL keys**
- **Note:** to reopen a web tab the launch restore skipped, the pin store needs the tab's URL, so each entry carries `url` next to its key. The URL is never used as an identity, and the static gate rejects it as a key.

## Deferred (end-of-milestone live pass)

These live checks were written but not run, because the lane has no objdir. Each runs after a Theia build:

- `node scripts/verify-tab-strip-live.mjs --scenario pin-restore`: restart persistence of pins. It needs a real quit (withShellQuit) and a relaunch on the same profile with `MOZ_PURGE_CACHES=1`. Self-test plant: `pin-not-stored`.
- `node scripts/verify-tab-strip-live.mjs --scenario multi` (plant `multi-touches-unselected`).
- `node scripts/verify-tab-strip-live.mjs --scenario pin-restore,multi --self-test`.
- The plan's Task 3 verify chain end to end: `node scripts/verify-tab-strip.mjs && node scripts/verify-tab-strip.mjs --self-test && node scripts/verify-shell-error-copy.mjs --self-test && bash scripts/check-internals-boundary.sh --catalogue && nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-34-03-t3-build.log" 2>&1 && node scripts/verify-tab-strip-live.mjs --scenario pin-restore,multi && node scripts/verify-tab-strip-live.mjs --self-test && node scripts/verify-registry-shape.mjs && scripts/verify-platform.sh --quick`. Only the two live steps were skipped.
- The Task 1 and Task 2 verify lines (`--scenario pin-restore`, `--scenario multi`) were skipped on their live halves for the same reason.

Live and owner checks:

- **Shutdown order.** Pins leave the store when a pinned widget is disposed. If Theia disposed main-area widgets during unload after the quit flush, the unload write would carry a pruned list. No such disposal is known, but only the pin-restore scenario's real quit can show it.
- **Bulk Bookmark after the Phase 33 merge.** The multi scenario exercises Bookmark 2 Tabs only when `bookmarkPage` exists. Before the merge it asserts the row is disabled.
- **Visual and feel checks:**
  - the sticky pinned block and its separator while the row scrolls;
  - the 32px icon-only tab with a favicon;
  - the selection wash on an active tab;
  - Ctrl-click on Linux not being taken by the desktop.
- **Screen reader:** the pinned tab's name ("…, pinned") and `aria-selected` on selected tabs (34-VALIDATION manual row).

## Known Stubs

None added. 34-01's disabled Pin row and 34-02's pinned-first stub are resolved: List All Tabs, reorder and the key-switch order all read `stripTabs`, which puts pins first. 34-02's List All Tabs attention-dot stub stays with 34-04.

The broken-windows ledger (`.planning/WINDOWS.md`) was not appended. The lane brief keeps shared planning files with the orchestrator.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: profile-file-input | theia/extensions/tab-uris/src/browser/profile-storage.ts | `readPinnedIds` parses an entry from `powerbrowser-shell-state.json` (a profile file). Entries are validated (string key, optional string URL, at most 500). The strip reopens only http(s) URLs, through the NAV-06 opener, and re-pins only by own-key equality. |

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx, theia/extensions/tab-uris/src/browser/profile-storage.ts, theia/extensions/modes/src/browser/setups-service.ts, scripts/verify-tab-strip.mjs, scripts/verify-tab-strip-live.mjs
- FOUND commits: c2c0cd0c, e2a25160, 95307ffa (all ancestors of HEAD)
