---
phase: 30-address-bar-modes-and-command-centre
plan: 03
subsystem: ui
tags: [theia, chrome-bar, address-bar, modes, places, commands, verification]
status: complete

requires:
  - phase: 30-address-bar-modes-and-command-centre
    provides: 30-02's mode table, AddressBarModeContribution point, mode button, chip and modes menu
provides:
  - "TabsAddressBarMode, BookmarksAddressBarMode, HistoryAddressBarMode, ActionsAddressBarMode, each bound to AddressBarModeContribution at load"
  - "AddressBar local-mode path: localMode(), queryText(), runLocalQuery(), searchRowFor(), footerText(), scrollHighlightIntoView(); zero-query lists on focus"
  - "Row.widgetId, Row.badges, Row.run and the action row source; LOCAL_MODES.searchRow and cap"
  - "powerbrowser/shell/PowerBrowserAPI.sys.mjs searchPlacesRestricted behind the searchPlaces kind's restrict field"
  - "ChromeStoreClient.searchPlaces(text, limit, restrict?: 'bookmark' | 'history')"
  - "CHROME_BAR_COMMAND_CATEGORY = 'Browser' on Back, Forward, Reload, New Tab"
  - "live scenario local-modes; plants tabs-lists-active, restrict-dropped, actions-unfiltered"
affects: [30-04, 30-05, 30-06]

tech-stack:
  added: []
  patterns:
    - "A local mode is a contribution with provide(text, token); the AddressBar calls it in place of runQuery and keys its copy by mode id in LOCAL_MODE_COPY"
    - "A row that is not an address carries run(); chooseRow runs it after closing the dropdown and resetting the mode"

key-files:
  created:
    - .planning/phases/30-address-bar-modes-and-command-centre/deferred-items.md
  modified:
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-rows.ts
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-chrome-bar-commands.mjs
    - scripts/verify-address-bar-rows.mjs
    - scripts/verify-address-bar-modes.mjs
    - scripts/verify-address-bar-live.mjs

key-decisions:
  - "Tabs records its most-recently-used order from ApplicationShell.mainPanel.onDidChangeCurrent, not onDidChangeCurrentWidget: a web tab's node never takes DOM focus, so the focus-derived current widget never names it (the reason the chrome bar uses the same signal)"
  - "Local modes hide the one-off strip; the trailing search row is their way to the default engine"
  - "A History row for a bookmarked page is a bookmark row, so Shift+Delete keeps its Phase 29 rule (unbookmarked history only)"
  - "runQuery returns at once in a local mode, so a query debounced before a mode switch cannot replace the mode's list"

requirements-completed: []

duration: ~1h20m
completed: 2026-10-22

actuals:
  tokens: 21000
  tasks: 3
  commits: 4
plan_head_before: 1e7d5dd17f793f4be4d7820041fdfaf59a51221b
plan_head_after: 2f6fdfbfcda6824170076e7b6a3b06e6a6c9d25c
---

# Phase 30 Plan 03: Tabs, Bookmarks, History and Actions modes Summary

The modes menu now lists Bookmarks, Tabs, History and Actions after the engines, and Organising starts in Tabs. Each mode opens its own list when the pill gets focus and filters it as you type. Tabs switches to the chosen tab without reloading it. Bookmarks and History read Places through a new restricted reader on the existing searchPlaces kind. Actions runs the Back, Forward, Reload and New Tab commands. Command centre (30-04) is the only SMODE-01 entry still missing.

## What was done

- **Task 1 (1d98fc8, tracer): Tabs.**
  - `TabsAddressBarMode` lists every other in-shell web tab with a page, filtered on title and URL. Tabs used this session come first, most recent first; the rest follow in tab-strip order.
  - Each row carries its widget id. `liveTabFor` looks up that id before falling back to the URL, so two tabs on one URL each switch to their own tab.
  - In a local mode, `AddressBar` calls `provide(queryText, token)` instead of `runQuery`. One `CancellationTokenSource` per query is cancelled by the next keystroke or a close.
  - Focus, or text becoming empty, opens the zero-query list with no row highlighted. With typed text the first row is highlighted.
  - Rows past the mode's cap are dropped, and the arrow keys scroll the highlighted row into view.
  - Bookmarks, Tabs and History end with a trailing "Search with {engine}" row. It runs `runOneOff` only when chosen; Alt+Enter and Ctrl-click open the search in a new tab.
  - Placeholder, aria-label, footer and the empty, no-match and failure rows all follow the active mode.
  - 15 copy keys were added and pinned. `LOCAL_MODES` gained `searchRow` and `cap`, pinned in `verify-address-bar-modes` with an eighth plant. The rows gate gained a case for the action icon.
- **Task 2 (3f05f55): Bookmarks and History.**
  - Chrome side: an end-of-file `searchPlacesRestricted(text, limit, restrict)` accepts only `"bookmark"` or `"history"` and refuses anything else with fixed text. Like `searchPlaces`, it is SELECT only with bound `:pattern` and `:cap`, cuts text to 256 characters, clamps the cap to 1..50 and returns http(s) rows only. Unlike `searchPlaces`, it allows empty text.
  - Bookmarks are ordered by `MAX(b.dateAdded) DESC`, history by `h.last_visit_date DESC`.
  - The `case "searchPlaces"` arm was changed in place, on one line. The client sends `restrict` only when it is given.
  - INTERNAL-APIS row 57's prose now names the new reader and its schema reads. `--fix` moved no catalogued line.
- **Task 3 (c0b83d5): Actions.**
  - `CHROME_BAR_COMMAND_CATEGORY = 'Browser'` is set on the four labelled commands. The focus command stays labelless with no category.
  - `verify-chrome-bar-commands` derives every exported Command block and pins both rules, with two new plants.
  - `ActionsAddressBarMode` lists the visible, enabled commands in that category, with keybinding badges styled per the UI-SPEC.
- **Fix (2f6fdfb):** the Actions live step uses Forward as its disabled control. See Deviation 3.

## Verification

- `scripts/verify-platform.sh --quick`: PASS after every task, and on the final tree.
- Static checks: `tsc --noEmit -p theia/extensions/chrome-bar` and `tsc -b theia/extensions/tab-uris` are clean.
  - Pass: `verify-address-bar-rows` with its `--self-test` (5 plants), `verify-address-bar-modes` with its `--self-test` (8 plants), and `verify-chrome-bar-commands` with its `--self-test` (6 plants).
  - Also pass: `verify-shell-error-copy`, `verify-web-tab-bridge`, `verify-chrome-bar-suggestions` and `verify-ng-027-reader-callers`.
- Boundary: `verify-ng-040-internals-catalogue-lines --fix` changed nothing. `check-internals-boundary.sh` and its `--catalogue` mode both pass.
  - I hand-checked the rows that share a pattern and a function. The `IOUtils.remove` pair is correct: 4081 removes the previous copy and 4085 is the failure-path removal. So are `searchLazy` (4320) and `getFixupURIInfo` (4421 main, 4412 canonize).
- Theia was rebuilt before each task's live run with 0 errors.
- Live checks:
  - Task 1: `--scenario search,switch-to-tab,modes-dropdown,local-modes` all PASS, after the switch-to-tab fix (Deviation 1).
  - Task 2: `--scenario search,rows,shift-del,local-modes` all PASS.
  - Task 3: `--scenario search,modes-dropdown,local-modes` all PASS.
- `verify-address-bar-live.mjs --self-test`, three runs:
  1. The clean control had two reds: the context-menu Paste & Go focus flake, and a broken-instrument red in local-modes (Deviation 3). All 20 plants went red.
  2. After the fix, the flake was the only red.
  3. One re-run under the standing rule: PASS. The clean control was green and all 20 plants went red, including `tabs-lists-active`, `restrict-dropped` and `actions-unfiltered`.
- Neighbouring checks on the final build: `verify-nav-keys-live.mjs` passed all 31 scenarios with 0 FAIL. `verify-web-tab-live.mjs` passed, walking 5 mode hops with the tab attached. Organising now starts in Tabs, and neither check went red.

## Deviations from Plan

1. **[Rule 1 - Bug, instrument] The switch-to-tab Enter loop overshot.** After each ArrowDown, the loop read the rows before the re-render had landed. So it pressed once more onto the first one-off, which was a built-in engine, and Enter then sent a real search to a public engine. This reproduced twice on the 30-03 build. The loop now uses `highlightRow`, which waits for the highlight to move after each press. No assertion was weakened. Commit 1d98fc8.
2. **MRU signal.** The plan named `ApplicationShell.onDidChangeCurrentWidget`; Tabs uses `shell.mainPanel.onDidChangeCurrent` instead. The chrome bar's own comment records why: a web tab's node never takes DOM focus. The mode still subscribes itself and does not inject `AddressBar`.
3. **[Rule 3 - Blocking] Actions' disabled control is Forward, not Back.** In a session where `mode-lifetime` (Browsing, then Organising, then Browsing) ran first, a tab opened fresh on a one-page URL reported `canGoBack: true`. This reproduced twice. A tab opened on one page can never go forward, so Forward is the reliable disabled control. The observation is recorded in `deferred-items.md`; it is not root-caused and is outside this plan's scope. Commit 2f6fdfb.
4. **Scope additions inside the plan's intent:**
   - Local modes hide the one-off strip.
   - `runQuery` returns at once in a local mode.
   - History-mode Shift+Delete filters the mode's own list instead of recomposing the Address rows.
   - `requestIcons` keeps a local list instead of recomposing it.
   - The trailing search row's Alt+Enter and Ctrl-click open the search in a new tab.
   - In the live check, the Tabs step also covers no-match text: the "No matching tabs." row, the highlighted search row, no GET while typing, and a GET on /one/search when the row is chosen.
5. **Not built here:** the Go-to row the UI-SPEC lists for Tabs, Bookmarks and History. Its classifier is 30-05's.
6. **Requirement mark not set.** SMODE-01 still needs Command centre (30-04), so REQUIREMENTS.md keeps it Pending and `requirements-completed` is empty.

**Total deviations:** 2 auto-fixed (Rules 1 and 3), 4 procedural or scope notes. **Impact:** the address bar, its gates, and one chrome-side reader behind an existing kind.

## Known Stubs

None. The Actions mode's empty copy reuses the no-match string, because the Browser category always includes New Tab in this phase (UI-SPEC E4 "Actions is never empty").

## Threat surface

No new surface beyond the plan's threat model. The new field rides the `searchPlaces` kind (T-30-05, T-30-12). Actions rows run only Browser-category command ids (T-30-13). Tabs rows switch by widget id (T-30-14).

## Risks for later plans

- `localMode()` treats a contribution as a local list only when it has `provide` and an entry in `LOCAL_MODE_COPY`. If 30-04 gives Command centre a `provide`, it must either add an entry there or keep its own path.
- In Organising, focusing the pill now opens the Tabs list, a `.pb-chrome-bar-dropdown` blocking layer. Phase 29's dropdown did the same, but only once the user typed.
- The live self-test now takes about 25 minutes per run. The context-menu flake hit the clean control in 2 of 3 runs.
- The badge's appearance was not screenshotted. Visual geometry is a manual-only row in 30-VALIDATION.
- The live check does not assert keybinding badges: none of the four Browser commands has a chrome-bar keybinding today.

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts (`class TabsAddressBarMode`, `class ActionsAddressBarMode`)
- FOUND: powerbrowser/shell/PowerBrowserAPI.sys.mjs (`async function searchPlacesRestricted(`)
- FOUND: .planning/phases/30-address-bar-modes-and-command-centre/deferred-items.md
- FOUND: 1d98fc8, 3f05f55, c0b83d5, 2f6fdfb (ancestors of HEAD)
