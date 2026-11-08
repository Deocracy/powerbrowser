---
phase: 30-address-bar-modes-and-command-centre
plan: 04
subsystem: ui
tags: [theia, chrome-bar, address-bar, command-centre, quick-access, privacy, verification]
status: complete

requires:
  - phase: 30-address-bar-modes-and-command-centre
    provides: 30-03's local-mode path (localMode, runLocalQuery, Row.run), the mode table's MODE_SENDS and the modes menu
provides:
  - "theia/extensions/chrome-bar/src/browser/address-bar/command-centre.ts: CommandCentreAddressBarMode (descriptorFor, handsOff, handOff, provide, acceptHelp, placeholder, footer, attach), bound to AddressBarModeContribution at load"
  - "AddressBar: commandCentre(), rawQueryText(), acceptText(), returnFocusAfterPick(), pickLabel(), debouncedLocalQuery; textEdited dispatches on modeSends(); runQuery begins with the this.modeSends().resolve guard"
  - "rows: RowSource pick and group; Row.detail, Row.iconClasses, Row.stays; RowIcon { classes }"
  - "copy: noRecentFiles, noMatchingResults, commandCentreFailed, commandCentreFooter"
  - "verify-address-bar-modes cases 7-9 with three plants; live scenarios command-centre, command-centre-handoff, command-centre-privacy; the workspace fixture; the ChromeStoreClient.request recorder; plants picks-dropped, help-row-executes, handoff-off, cc-sends"
affects: [30-05, 30-06]

tech-stack:
  added: []
  patterns:
    - "A mode whose MODE_SENDS row forbids the resolve never reaches runQuery: textEdited sends it to the contribution's provide on the same 150ms debounce"
    - "A row with stays: true is chosen without closing the dropdown or resetting the mode"
    - "address-bar.tsx imports command-centre.ts as a type only; command-centre.ts imports the shortcut table, which imports address-bar.tsx"

key-files:
  created:
    - theia/extensions/chrome-bar/src/browser/address-bar/command-centre.ts
  modified:
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-rows.ts
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-address-bar-rows.mjs
    - scripts/verify-address-bar-modes.mjs
    - scripts/verify-address-bar-live.mjs

key-decisions:
  - "Command centre is a LOCAL_MODE_COPY entry, so it uses 30-03's local-mode path; its placeholder and footer come from the contribution"
  - "The provider lookup uses the untrimmed text: a prefix such as 'debug ' ends in its space, and trimming would select the file provider"
  - "Help rows map their label to a prefix through the registry's own help entries; a label outside them (the default provider's '…' row) becomes empty text"
  - "In Command centre, Enter or Alt+Enter with no chosen row does nothing, so typed text never reaches commitText's resolve (D-26); 30-05's Go-to classifier is what will add an address commit"
  - "The D-25 placeholder is shown verbatim, including the runtime suffix '(Press Ctrl+P to show/hide excluded files)'; flagged for Chris at verify-work"
  - "Focus returns to the shell's current widget only after a pick row, not after an Actions row (New Tab focuses the pill on purpose)"

requirements-completed: [SMODE-01, SMODE-05]

duration: ~38m
completed: 2026-10-22

actuals:
  tokens: 20700
  tasks: 3
  commits: 3
plan_head_before: b2c07ce02d52baec214715417416fb71ee40a87a
plan_head_after: b7fb5f460746cddedaf266e1b12e695942e86dc0
---

# Phase 30 Plan 04: Command centre Summary

Command centre renders Theia's quick access under the pill. Typed text goes to the provider the registry selects, and that provider's picks show as rows. Enter or a click runs the pick. `@` and `:` have no Theia descriptor, so they open Theia's own picker, and the pill keeps its text. Typing in Command centre sends nothing to chrome or a search engine. A static gate and a live recorder with a positive control both prove this. Coding now starts in Command centre.

## What was done

- **Task 1 (dd4152d, tracer): picks under the pill, run on Enter.**
  - `CommandCentreAddressBarMode` takes `registry.getQuickAccessProvider(text)` and calls `getInstance().getPicks(filter, token)`. The filter is the stock rule: the text after the prefix, trimmed. Separators become `group` rows and items become `pick` rows that run `execute()`. It is bound at module load (D-50).
  - `handsOff(text)` is true exactly when the registry returns no descriptor. That rule is derived, not a prefix list. The pill then calls `quickInput.open(text)` and keeps its text.
  - `textEdited` dispatches on `modeSends()`. When `resolve` is false, the mode's `provide` runs on a 150ms debounce, with the previous token cancelled on each keystroke. `runQuery` starts with `if (!this.dropdownArmed || !this.modeSends().resolve) { return; }`.
  - Group headers and picks without `execute` can never be highlighted. With text typed, the first actionable row is highlighted.
  - Rows: 24px group headers with a rule above every group but the first, 48px two-line rows when a pick has a detail, and a pick's icon classes applied as given. Local lists show the shimmer row once a query has been outstanding for 150ms.
  - Copy: four strings, pinned in `EXPECTED_NAV_COPY`. The footer's address key is the `focusAddressL` row of `PAGE_SHORTCUTS`, using macLabel on macOS.
  - Live:
    - A workspace fixture: a temp folder with `README.md`, `src/main.py` and `.theia/launch.json`, opened through `location.hash` and a reload.
    - The scenario `command-centre`: "view exp" lists Explorer, and Enter opens the left panel with no centred quick input. "READ" lists a group header and README.md, and Enter makes that editor current.
    - The plant `picks-dropped`.
- **Task 2 (1a3cd68): every prefix, help rows, the hand-off.**
  - A `?` help row runs `acceptHelp(pick)`. It puts the prefix in the pill, re-runs the query, and keeps the mode and the dropdown (`Row.stays`). It never calls the pick's `execute()`.
  - Labels go through `LabelParser`: `$(name)` becomes a codicon span and the rest are text nodes. There is no `dangerouslySetInnerHTML`.
  - Keybinding badges come from `acceleratorForSequence`. The placeholder is the selected provider's own (D-25).
  - After a pick that leaves focus in the pill, focus moves on the next task to `shell.currentWidget`, or to the dock's current tab when there is no current widget (A5).
  - The live `command-centre` scenario now also checks:
    - every prefix `getQuickAccessProviders()` lists, against `getPicks` in the same probe, in order;
    - `debug ` lists the fixture's launch configuration;
    - choosing the `>` help row after `?` puts `>` in the pill and lists commands;
    - the `#` message row is skipped by ArrowDown;
    - the zero-query list equals the empty-text picks, and the placeholder and aria-label are correct;
    - `>toggle`, then Enter on View: Toggle Bottom Panel, toggles the bottom panel and leaves focus off the pill.
  - New scenario `command-centre-handoff`: `@` and `:12` each open Theia's picker holding that text, and Esc closes it.
  - New plants: `help-row-executes` and `handoff-off`.
- **Task 3 (b7fb5f4): the D-26 proof.**
  - Static cases in `verify-address-bar-modes`:
    - 7: the `runQuery` guard.
    - 8: `command-centre.ts` names no store client, typed-text kind or suggestion service. The positive control is that the same scan finds all six names in `address-bar.tsx` plus `address-bar-modes.ts`.
    - 9: the contribution id is the `MODE_SENDS` key whose row is all false.
    - Three new plants, each red by name.
  - New live scenario `command-centre-privacy`:
    - It wraps `ChromeStoreClient.request` to record every kind sent.
    - Positive control: "hello" in Address mode records a `resolveTypedAddress`, and the served engine sees a GET on `/one/suggest`.
    - Then, in every contributed mode whose `modeSends()` row is all false (derived from the instance: Command centre, Tabs and Actions), typing "hello", "README" and "localhost:4000" records none of the four kinds and makes no engine GET.
    - New plant: `cc-sends`.

## Verification

- `scripts/verify-platform.sh --quick`: PASS after every task. Its `address-bar-modes-self-test` row now runs 11 plants.
- Static checks:
  - `tsc --noEmit -p theia/extensions/chrome-bar` is clean.
  - `verify-address-bar-rows`: 23 cases, and its `--self-test` passes (6 plants, including the new `pick icon classes dropped`).
  - `verify-address-bar-modes`: 13 cases, and its `--self-test` passes (11 plants).
  - `verify-shell-error-copy`, `verify-chrome-bar-suggestions` and `verify-web-tab-bridge`: PASS.
- Theia was rebuilt with 0 errors before the Task 1 and Task 2 live runs. Task 3 changed no frontend source.
- Live checks:
  - Task 1: `--scenario search,modes-dropdown,command-centre` all PASS. The 30-03 regression run `search,switch-to-tab,local-modes,mode-chip` also passed, because local modes are now debounced.
  - Task 2: `--scenario search,command-centre,command-centre-handoff` all PASS.
  - Task 3: `--scenario search,command-centre,command-centre-privacy` all PASS.
  - Before the full self-test, a scratch runner applied each new plant (`picks-dropped`, `help-row-executes`, `handoff-off`, `cc-sends`). Each applied and went red with its expected text.
- `verify-address-bar-live.mjs --self-test`: PASS on the first run. The clean control (25 scenarios) was green, so the context-menu Paste & Go flake did not occur. All 24 plants went red.
- Neighbouring checks on the final build: `verify-nav-keys-live.mjs` passed 31/31 and `verify-web-tab-live.mjs` passed. Both walk into Coding, which now starts in Command centre.
- `PowerBrowserAPI.sys.mjs` was not edited, so the catalogue and boundary steps did not apply.

## Deviations from Plan

1. **Copy landed in Task 1, not Task 2.** Task 1's local-mode path needs Command centre's empty, no-match and failure rows, so the four strings and their `EXPECTED_NAV_COPY` pins were committed with Task 1 (dd4152d).
2. **[Rule 3 - Blocking] Avoided an import cycle.** `command-centre.ts` needs the shortcut table, and `chrome-bar-shortcuts.ts` imports `address-bar.tsx`. So `address-bar.tsx` imports Command centre as a type only and finds it among its contributions. Help rows reach the pill through a narrow `CommandCentrePill` interface that the address bar attaches.
3. **[Rule 2 - Correctness] Command centre never commits typed text to the resolve.** Enter with no highlighted row, and Alt+Enter with no row, now do nothing in Command centre. Before this change, both went to `commitText` or `urlForRow`, which send the text to `resolveTypedAddress`. That path is the one the brief said Command centre must never reach.
4. **[Rule 1 - Bug] Clicking a group header or a message pick chooses nothing.** Without this guard, `chooseRow` would have passed the row to `commitRow`, which opens the row's empty URL.
5. **Scope additions inside the plan's intent:**
   - Local lists show the shimmer row past 150ms.
   - All local modes now share the 150ms debounce, which the plan's dispatch rule implies.
   - Rows gate: a new case and a plant for the pick icon branch.
   - `typeInPill` takes `{ focused: false }` for the hand-off.
   - `localModeLabel` also searches the top group.
   - `runSession` keeps its shared state and cleanups outside the shell, so the fixture folder is removed afterwards.
6. **Live ordering.** `command-centre` reloads the Theia frame on the fixture. The three new scenarios therefore come last in the registry, the page-realm recorders are re-installed, and `shared.tabId` is cleared. Plants are applied after the reload.

**Total deviations:** 3 auto-fixed (Rules 1-3), 3 procedural or scope notes. **Impact:** limited to the address bar and its gates.

## Requirements

- **SMODE-01: Complete.** The menu now lists Command centre, the engines, Bookmarks, Tabs, History, Actions and Search Settings. `modes-dropdown` derives these entries from the contributions, and it passed.
- **SMODE-05: Complete.**
- **SMODE-02 stays Pending.** The tree now gives Coding Command centre, Browsing Address and Organising Tabs. The live proof is 30-05's `mode-defaults` scenario.

## Known Stubs

None.

## Threat surface

No new surface beyond the plan's threat model.

- T-30-02: the dispatch, the guard, static cases 7-9 and the live recorder.
- T-30-03: labels render as codicon spans and text nodes only.
- T-30-15: only the providers' own `execute()` runs.
- T-30-16: help rows stay in the pill, and the hand-off happens only when the registry has no descriptor.

## Risks for later plans

- **30-05 Go-to row.** Command centre's Enter with no highlighted row deliberately does nothing. The Go-to row (D-29) should be a highlighted row with `run`, or an explicit classifier branch in that Enter guard. It must not be a fall-through to `commitTyped`.
- **30-05 mode defaults.** In Coding the pill starts in Command centre. Focusing it opens the zero-query file list, which is a blocking dropdown layer (D-27). Typed URLs no longer navigate in Coding until 30-05 lands Ctrl+L, Alt+D and F6 as address keys and the Go-to row. The neighbouring live checks did not type URLs in Coding, so they stayed green.
- **Live checks after `command-centre`.** Any scenario added after `command-centre` runs in the reloaded frame, which has the fixture workspace and no session web tab. It must open its own tab, preferably on `localhost`, and stay within the four-tab limit on `127.0.0.1`.
- **Placeholder copy.** It shows the runtime suffix "(Press Ctrl+P to show/hide excluded files)". In the pill, Ctrl+P opens the stock widget instead. This copy needs Chris's judgement at verify-work.
- **Not screenshotted.** The visual geometry (24px headers, 48px detail rows, file icons in the 16px slot) is a manual-only check in 30-VALIDATION.

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/address-bar/command-centre.ts (`export class CommandCentreAddressBarMode`, `getInstance().getPicks(`, `QuickHelpService.PREFIX`, `acceleratorForSequence`, 0 × `dangerouslySetInnerHTML`)
- FOUND: `this.modeSends().resolve` in address-bar.tsx (runQuery guard and textEdited dispatch)
- FOUND: dd4152d, 1a3cd68, b7fb5f4 (ancestors of HEAD)
