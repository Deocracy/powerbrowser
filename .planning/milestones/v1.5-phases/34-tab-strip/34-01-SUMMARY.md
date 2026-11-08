---
phase: 34-tab-strip
plan: "01"
subsystem: chrome-bar
tags: [tab-strip, tab-menu, context-menu, bookmark-all, static-gate, live-harness]
requires:
  - phase: 32-page-tools
    provides: WebTabWidget.setMuted, audioMuted, soundPlaying (the Mute row's path and predicate)
  - phase: 33-bookmarks-history-and-the-full-menu (plan 01, concurrent lane, not in this tree)
    provides: ChromeStoreClient.bookmarkPage(url, title, folderGuid?) (the Bookmark rows' path, probed at startup)
provides:
  - TabStripWidget.tabMenuRows, the per-request tab-menu predicate table every later strip plan grows
  - TabStripWidget.moveInBar, the home-pane TabBar order helper 34-02's drop index reuses
  - ten labelless single-tab commands (powerbrowser.chrome-bar.tab-*) 34-03's bulk rows call per tab
  - ChromeBarWidget.tabBookmarker, the one Phase 33 bookmarkPage call site, handed to the strip
  - scripts/verify-tab-strip.mjs with six named --self-test plants
  - scripts/verify-tab-strip-live.mjs scaffold with the menu scenario and its plant
affects:
  - 34-02 (reuses moveInBar, grows both gates, adds live scenarios)
  - 34-03 (enables the Pin row, adds N-Tabs rows that call the tab commands per tab)
  - 34-05 (bookmark-all live scenario exercises tabBookmarker after the Phase 33 merge)
tech-stack:
  added: []
  patterns:
    - per-request CompoundMenuNode built from a predicate table, first group at the root (the app-menu shape)
    - command delegation through a one-way setter (setTabActions), so the command side never imports the strip
    - capability probe (typeof store.bookmarkPage === 'function') renders a cross-lane row disabled, never absent
key-files:
  created:
    - scripts/verify-tab-strip.mjs
    - scripts/verify-tab-strip-live.mjs
  modified:
    - theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-chrome-bar-commands.mjs
    - scripts/verify-platform.sh
key-decisions:
  - "Move shipped as two rows (Move to Start, Move to End), not a submenu: only separator groups (unlabelled CompoundMenuNode) are proven in-tree (site-identity/app-menu.ts); a labelled submenu is not."
  - "The tab commands are labelless and uncategorised, not Browser-category: each needs the tab as its argument, and a palette run would have to fall back to the current widget, which the plan's target prohibition forbids."
  - "The Bookmark rows have no command: Phase 33's privileged-caller fence admits bookmarkPage only from address-bar.tsx and chrome-bar-widget.tsx, never from commands, so the one call lives in ChromeBarWidget.tabBookmarker and reaches the strip as a callback set in ChromeBarContribution.onStart."
  - "Mute is enabled while the tab plays sound or is muted (the existing audio-mark rule), so a muted tab can be unmuted from the menu."
  - "Pin renders disabled until 34-03 lands pinnedIds; its copy row is Pin Tab only, Unpin Tab joins with 34-03."
  - "The no-uncatalogued-kind guard reads its baseline from verify-web-tab-bridge.mjs KIND_CLASSES / STORE_KIND_CLASSES at check time, not a literal list in the gate, so the Phase 33 merge (which adds classified kinds) stays green."
  - "Occlusion needs no web-tab.ts edit: the tab menu is a stock .lm-Menu rendered by ContextMenuRenderer, and .lm-Menu is already in BLOCKING_LAYER_SELECTOR; the gate asserts both halves."
  - "Close Tab is a row beyond the ROADMAP list (Firefox parity); it carries no contract name, so the set equality covers exactly the eleven ROADMAP items."
patterns-established:
  - "Tab-menu row = { id, contract?, label (CHROME_BAR_COPY.tabMenu), icon?, group, command?, enabled, failed?, run }; enabled is read when the menu opens; every row acts on the right-clicked tab."
  - "A failed tab action shows its per-verb sentence at the strip's end (.pb-tab-strip-notice) and logs the row id and error name only."
requirements-completed: [TAB-01, BMK-07]
duration: "about 25 minutes of execution"
completed: 2026-11-01
status: complete
commits: 3
plan_head_before: 23c08bb5dd176949f619cf8781cf34fb54c74f6d
plan_head_after: 0d7e37858570c9f788229a06a21bc4cdf42d5327
actuals:
  tokens: 13900
  tasks: 3
  commits: 3
---

# Phase 34 Plan 01: Tab context menu and Bookmark All Tabs Summary

**Right-clicking a strip tab opens a per-request stock menu with the full ROADMAP item set, each row enabled from a predicate read at open time and acting only on the right-clicked tab; Bookmark Tab and Bookmark All Tabs call the Phase 33 bookmarkPage path through one call site in chrome-bar-widget.tsx; a new static gate compares the menu to ROADMAP criterion 1 at check time with six plants.**

## Status

Complete for build work and every static check. The live menu scenario is written and parses but was not run (lane ruling: no Gecko build, no live browser). TAB-01 Pin is listed and disabled until 34-03. The Bookmark rows stay disabled in this tree until Phase 33's `bookmarkPage` merges in.

## Performance

- **Tasks:** 3 of 3 executed.
- **Commits:** 3 production commits (`75add5ad`, `cf58d1cb`, `0d7e3785`), then the SUMMARY commit.
- **Realized diff:** 893 insertions and 3 deletions over 10 files, about 13,900 tokens by chars/4 over the diff. The plan estimate was 90,000 on the same scale.

## Accomplishments

- **Tab menu (TAB-01, D-01/D-03).** `TabStripWidget` gains `onContextMenu` on each strip tab, `tabMenuRows(widget)` and `openTabMenu`. The menu is a fresh `CompoundMenuNode` per right-click, rendered through the injected `ContextMenuRenderer` and marked `.pb-tab-menu`. Rows, in groups: Reload, Mute Tab/Unmute Tab, Pin Tab, Duplicate Tab | Bookmark Tab, Bookmark All Tabs | Move to Start, Move to End | Close Other Tabs, Close Tabs to the Left, Close Tabs to the Right, Close Duplicate Tabs, Close Tab.
- **Predicates (D-04).** Reload: web tab with `canReload`. Mute: web tab with `soundPlaying` or `audioMuted`. Pin: disabled (34-03). Duplicate and Bookmark Tab: web tab on an http(s) URL. Bookmark All Tabs: at least one http(s) strip tab. Both Bookmark rows also need the Phase 33 method. Move to Start/End: the tab is not already first/last in the strip. Close Others/Left/Right: a closable strip tab exists on that side. Close Duplicate Tabs: another strip tab shares the URL. Close Tab: the title is closable.
- **Delegation.** Reload calls `WebTabWidget.reload()` (`webTabReload`), Mute calls `setMuted` (`webTabMute`, Phase 32), Duplicate calls `WebTabOpenHandler.openInBackground(url, tab)` then `GroupModel.joinActiveGroup`, Move calls `moveInBar` (`TabBar.insertTab` on the home pane), and the Close rows call `ApplicationShell.closeWidget`. No kind is sent from the strip.
- **Commands.** Ten labelless commands (`powerbrowser.chrome-bar.tab-reload`, `-mute`, `-duplicate`, `-move-start`, `-move-end`, `-close-others`, `-close-left`, `-close-right`, `-close-duplicates`, `-close`) registered in `ChromeBarCommandContribution`, which is already bound at module load. Each command runs the strip's row for the widget it is handed, through `setTabActions`, and is disabled without a widget. The menu rows that have a command run through `CommandRegistry.executeCommand(id, widget)`.
- **BMK-07.** `ChromeBarWidget.tabBookmarker()` returns the one `bookmarkPage` caller, or `undefined` when the store client lacks the method. `ChromeBarContribution.onStart` hands it to `TabStripWidget.bookmarkTabs`.
- **Copy (D-15).** `CHROME_BAR_COPY.tabMenu` holds 14 rows, and there are five per-verb failure sentences (`{App} couldn't reload/mute/duplicate/bookmark/close that tab. Try again.`). `EXPECTED_NAV_COPY` grows in the same commits.
- **Gate.** `scripts/verify-tab-strip.mjs` checks the following: menu contract names against ROADMAP Phase 34 criterion 1, parsed at check time (it searches `.planning/ROADMAP.md`, then archived milestone roadmaps); copy keys the rows read against `CHROME_BAR_COPY.tabMenu`; occlusion (`.lm-Menu` in `BLOCKING_LAYER_SELECTOR`, and the menu rendered through `this.menus.render`); kinds (every union member classified in verify-web-tab-bridge.mjs, and no `kind:` literal in the strip); codicons; target (no current-widget read in the menu code). Registered as `tab-strip` and `tab-strip-self-test` in the quick block. `tab-strip-live` and `tab-strip-live-self-test` are in the live block, after `page-tools-live-self-test`.

## Move shape shipped

**Two rows** (Move to Start, Move to End) in their own separator group. UI-SPEC allows a submenu only if `CompoundMenuNode` nesting is already proven in the tree. Only unlabelled separator groups are (`site-identity/app-menu.ts`); a labelled submenu is not.

## Predicates disabled pending another plan or phase

- **Pin Tab:** always disabled until 34-03 adds the pin state. The code comment is `shortcut: disabled until 34-03 lands the pin state`.
- **Bookmark Tab / Bookmark All Tabs:** disabled in this tree because `ChromeStoreClient.bookmarkPage` does not exist here yet (Phase 33 lane). They turn enabled after the merge with no edit in this lane.
- **Mute Tab / Unmute Tab:** live in this tree. Phase 32 is present.

## Cross-lane names assumed (Phase 33)

- `ChromeStoreClient.bookmarkPage(url: string, title: string, folderGuid?: string): Promise<unknown>`: the store client method, from 33-01. Called as `bookmarkPage(tab.url, tab.title.label)`. The return value is ignored; a rejection counts as a failure.
- Availability probe: `typeof store.bookmarkPage === 'function'` on the injected `ChromeStoreClient`, run once in `ChromeBarContribution.onStart`.
- Privileged-caller fence: the only literal `.bookmarkPage(` call is in `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` (`tabBookmarker`), one of the two sanctioned files. The strip calls only its `bookmarkTabs` callback. No command, keybinding or relay names the method.
- Not implemented here: the `bookmarkPage` store kind, its `STORE_KIND_CLASSES` entry, and the client method. No `STORE_REQUEST_KINDS` or `WEB_TAB_ACTION_KINDS` entry was added.
- The Phase 34 plans call this path `addBookmark`; the code uses Phase 33's real name, `bookmarkPage`.

## Merge reconciliation (Phase 33)

Done in the follow-up commit after the Phase 33 merge into main. `bookmarkPage` now exists on `ChromeStoreClient`, so the `typeof store.bookmarkPage === 'function'` probe, the local `TabBookmarkStore` interface and the `undefined` return of `tabBookmarker()` are removed, and the Bookmark Tab / Bookmark All Tabs rows are no longer disabled on the store method's absence (they stay disabled only with no http(s) page). `tabBookmarker()` in `chrome-bar-widget.tsx` remains the one `.bookmarkPage(` call site. Bookmark All Tabs calls it once per tab: Phase 33 has no bulk kind, and chrome queues each URL's call and makes it idempotent. The live scenario in `verify-tab-strip-live.mjs` still reads `typeof store.bookmarkPage` at run time; that is now always true.

## Task Commits

1. **Task 1 (tracer): Reload-only menu plus gate scaffold.** Commit `75add5ad`. Tracer gate: re-ran the verify chain (`verify-tab-strip` + `--self-test` + `tsc --noEmit -p theia/extensions/chrome-bar`), all green, then expanded.
2. **Task 2: full menu set, predicates, commands, copy, CSS, Bookmark callback, live scaffold.** Commit `cf58d1cb`.
3. **Task 3: gate set equality, menu-item-removed plant, registry rows.** Commit `0d7e3785`.

## Gate results

- Theia build: `nix develop .#theia --command bash -c 'cd theia && yarn build'` exited 0 with 0 `error TS`. The compiled `lib/browser/tab-strip-widget.js` carries `tabMenuRows`.
- `node scripts/verify-tab-strip.mjs`: PASS.
- `node scripts/verify-tab-strip.mjs --self-test`: PASS. The unmodified tree was green first, then 6 plants each went red naming their drift:
  - `menu-item-removed`: red naming Close Duplicates
  - `copy-row-removed`: red naming closeDuplicates
  - `occlusion-selector-dropped`: red naming .lm-Menu
  - `uncatalogued-kind-added`: red naming webTabPinTab
  - `codicon-deleted`: red naming pin
  - `current-widget-fallback` (the backstop plant): red naming currentWidget
- `node scripts/verify-shell-error-copy.mjs` and `--self-test`: PASS.
- `node scripts/verify-chrome-bar-commands.mjs` and `--self-test`: PASS (22 ids).
- `node scripts/verify-registry-shape.mjs`: PASS (GUI-04 shape unchanged).
- `node --check scripts/verify-tab-strip-live.mjs`: OK.
- `scripts/verify-platform.sh --quick`, run inside `nix develop .#theia` after staging: exit 0 after each task commit.

## Decisions Made

See `key-decisions` in the frontmatter. The two choices most likely to need a second look are the labelless tab commands and the Bookmark callback placement. Both follow the target prohibition and Phase 33's fence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] verify-chrome-bar-commands.mjs EXPECTED_IDS grown (file not in the plan's list)**
- **Found during:** Task 2.
- **Issue:** the command gate pins every `*_COMMAND_ID` by set equality, so the ten tab commands made it red.
- **Fix:** added the ten ids, with a comment, in the same commit.
- **Commit:** `cf58d1cb`

**2. [Rule 3 - Blocking] chrome-bar-widget.tsx edited (file not in the plan's list)**
- **Issue:** the lane brief and Phase 33's fence require the one `bookmarkPage` call to be in a sanctioned file. The strip is not one.
- **Fix:** `tabBookmarker()` on `ChromeBarWidget`, wired in `ChromeBarContribution.onStart`.
- **Commit:** `cf58d1cb`

**3. [Rule 1 - Bug] Brand-scan reconciliation**
- **Issue:** a code comment naming a plan file (`…-PLAN.md`) raised the held-back `-PLAN.md` literal count from 59 to 60, and `--quick` went red.
- **Fix:** the comment now says "Phase 33 plan 01". This was fixed before the Task 2 commit.

**4. [Plan inconsistency] Task 1 gate could not be equal to the ROADMAP set**
- **Issue:** Task 1 asks for a one-item tree compared equal to an eleven-item ROADMAP set.
- **Fix:** the Task 1 scaffold enforced only the addition half (no row may name a non-ROADMAP item). Task 3 added the removal half and the `menu-item-removed` plant, as its action says.

**5. [Design] Tab commands labelless and uncategorised, not "Browser-category"**
- **Reason:** see key-decisions. A labelled Browser command would appear in the palette and Actions mode with no tab to act on.

**6. [Design] No-new-kind baseline**
- **Issue:** the plan says to use a pre-phase baseline captured in the gate.
- **Fix:** the baseline is the classification maps in verify-web-tab-bridge.mjs, read at check time (see key-decisions).

**7. [Scope] chrome-bar-frontend-module.ts unchanged**
- **Reason:** the commands are registered by `ChromeBarCommandContribution`, which is already statically bound (D-50). No new binding was needed.

**8. [Extra plant] current-widget-fallback**
- **Reason:** the plan's backstop plant ("menu invoked with a different tab current still acts on the event target"). It sits beside the five named plants, making six.

## Deferred (end-of-milestone live pass)

- `nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-34-01-t2-build.log" 2>&1 && node scripts/verify-tab-strip-live.mjs --scenario menu`. The build half ran; the live half did not, because the lane has no objdir.
- `node scripts/verify-tab-strip-live.mjs --scenario menu --self-test` (plant `menu-acts-on-current`).
- Live check that the `.pb-tab-menu` rows are 32px, through the `--theia-private-menu-item-height` override.
- Visual check of the failure notice at the strip's end.
- Bookmark rows enabled and writing after the Phase 33 merge. This is covered by 34-05's bookmark-all scenario.

## Known Stubs

| File | Row | Reason | Resolved by |
|------|-----|--------|-------------|
| theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx | `pin` row in `tabMenuRows` (`enabled: false`, no-op run) | the pin state does not exist yet | 34-03 |

The broken-windows ledger (`.planning/WINDOWS.md`) was not appended. The lane brief keeps shared planning files with the orchestrator, and this stub closes within the same phase.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: command-surface | theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts | Ten new tab commands can be run through `CommandRegistry` by any in-tree contribution that passes a `Widget`. Each acts only on that widget, is disabled without one, has no label (it never appears in the palette), and sends no new kind. |

## Self-Check: PASSED

- FOUND: scripts/verify-tab-strip.mjs, scripts/verify-tab-strip-live.mjs, .planning/phases/34-tab-strip/34-01-SUMMARY.md
- FOUND commits: 75add5ad, cf58d1cb, 0d7e3785 (all ancestors of HEAD)
