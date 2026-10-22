---
phase: 30-address-bar-modes-and-command-centre
plan: 02
subsystem: ui
tags: [theia, chrome-bar, address-bar, modes, search-engines, inversify, verification]
status: complete

requires:
  - phase: 30-address-bar-modes-and-command-centre
    provides: 30-01's injectable AddressBar in address-bar/ and the re-pointed gates and live probes
provides:
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts (LocalModeId, ModeId, LOCAL_MODES, DEFAULT_MODE_BY_UI_MODE, defaultModeFor, MODE_SENDS, engineModeId, engineNameOf, modeKindOf)
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts (AddressBarMode, AddressBarModeContribution, bound with bindContributionProvider)
  - "AddressBar: mode, uiMode, defaultMode(), contributedIn(group), modeEngine(), modeSends(), resetMode(), onModeReset(), uiModeChanged(id), the mode button, the chip with its x, the modes menu"
  - "copy: modeLabels, addressModeLabel, searchSettings, chooseMode, modesMenuLabel, returnTo, engineFooter"
  - scripts/verify-address-bar-modes.mjs and registry rows address-bar-modes, address-bar-modes-self-test
  - live scenarios modes-dropdown, mode-chip, mode-lifetime; plants engine-mode-ignored, reset-ignored, mode-sticks
affects: [30-03, 30-04, 30-05, 30-06]

tech-stack:
  added: []
  patterns:
    - "A mode's chrome traffic is gated by its MODE_SENDS row in runQuery; a new mode kind adds a row and the gate checks it"
    - "Menus opened from a focusable control keep focus there and drive the menu with aria-activedescendant; items act on mousedown with preventDefault"

key-files:
  created:
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts
    - scripts/verify-address-bar-modes.mjs
  modified:
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-chrome-bar-suggestions.mjs
    - scripts/verify-address-bar-live.mjs
    - scripts/verify-platform.sh

key-decisions:
  - "commitText captures the engine and forceSearch before resetMode, and every failure row's retry repeats the commit with that engine (a retry after the mode reset would otherwise search the default engine)"
  - "uiModeChanged resets only when the PowerBrowser mode id actually changes, so a repeated perspective event cannot end a picked mode"
  - "The modes menu re-reads chrome's engines each time it opens (refreshEngines), as the pill's focus already does"
  - "The nav-copy derivation in verify-shell-error-copy skips quoted property keys, so the modeLabels key 'command-centre' (a mode id) is not treated as copy; a planted drift of its value still goes red"
  - "Alt+Enter and Ctrl-click rows in an engine mode force a search with that engine, and opening in a new tab also resets the mode"

requirements-completed: []

duration: ~1h30m
completed: 2026-10-22

actuals:
  tokens: 17000
  tasks: 3
  commits: 4
plan_head_before: 2928253ac62c5a1823d1483e218fa4f045cc93ba
plan_head_after: 4e35f27c17d9744d4f4fb5defbabb8b5d8b9656b
---

# Phase 30 Plan 02: Modes dropdown, chip and engine modes Summary

The pill now opens with a mode button. It opens a modes menu listing the contributed modes, one item per chrome engine, and Search Settings. Picking an engine shows a chip and searches only that engine. The chip's x returns to the PowerBrowser mode's default. A picked mode ends on a commit, the second Esc, a tab change or a PowerBrowser-mode change. A static gate pins the default table, the send policy and the menu order.

## What was done

- **Task 1 (2cb81e9, tracer):**
  - Added the import-free mode table and the `AddressBarModeContribution` point, bound at module load. No built-in mode is bound yet.
  - The mode button is the pill's first child, inside the pill div. The modes menu is a `.pb-chrome-bar-dropdown pb-address-modes` body portal.
  - Engine modes resolve and commit with that engine and `forceSearch`. Every chrome request in `runQuery` is gated by the mode's `MODE_SENDS` row.
  - Added five copy keys, pinned. Added the live scenario `modes-dropdown` and the plant `engine-mode-ignored`.
- **Task 2 (91c53e6):**
  - The chip's x (`.pb-address-mode-reset`) calls `onModeReset`.
  - `resetMode` runs on `commitText`, `commitRow`, `switchToTab`, `runOneOff`, `openUrlInNewTab`, Esc's restore step, `onCurrentWidgetChanged` and `uiModeChanged`. `ChromeBarWidget.syncModeFromPerspective` calls `uiModeChanged`.
  - Search Settings runs `CommonCommands.OPEN_PREFERENCES` with `DEFAULT_SEARCH_ENGINE_PREFERENCE`.
  - Menu keys: arrows with wrap, Home/End, access letters (one match picks, several cycle), Enter, Shift+Enter one-off, Esc, and Tab closes. An engine item opens a one-off on Shift+click or Ctrl/middle-click.
  - Added `returnTo` and `engineFooter`, the CSS per the UI-SPEC geometry, the live scenarios `mode-chip` and `mode-lifetime`, and the plants `reset-ignored` and `mode-sticks`.
- **Task 3 (574b6f9):** `verify-address-bar-modes.mjs` runs 9 cases derived from the widget's `MODES` and the copy's `modeLabels`. Its `--self-test` has seven plants, each red by name. Two registry rows were added after `address-bar-rows`.
- **Fix (4e35f27):** the menu re-reads chrome's engines when it opens. See Deviation 1.

## Verification

- `scripts/verify-platform.sh --quick`: PASS after every task and after the fix ("all checks passed"). It includes `address-bar-modes` and `address-bar-modes-self-test`.
- `scripts/verify-platform.sh --only address-bar-modes`: PASS.
- `tsc --noEmit -p theia/extensions/chrome-bar`: clean. Theia rebuild (chrome-bar `yarn build`, then the app's `theia build --mode development`): 0 errors before each live run.
- `verify-shell-error-copy.mjs`, `--self-test` (13 faults including the new modeLabels-value plant): PASS. `verify-chrome-bar-suggestions.mjs` and `--self-test`: PASS. `verify-mode-toggle-commands.mjs` and `verify-mode-switch-tabs-invariant.mjs`: PASS.
- Live, `--scenario search,suggestions,modes-dropdown`: all PASS (Task 1).
- Live, `--scenario search,modes-dropdown,mode-chip,mode-lifetime,drafts`: all PASS (Task 2, and again after the fix).
- Live, all 21 scenarios in one session: all PASS.
- `verify-address-bar-live.mjs --self-test`, three runs:
  1. Before the fix: `reset-ignored` never applied, and `mode-sticks` went red for a broken instrument (no engine item). The clean control also hit the context-menu Paste & Go focus flake.
  2. After the fix: all 17 plants red as named. The clean control hit the same flake again, and it was the only red.
  3. One re-run under the standing rule: PASS. The clean control is green and all 17 planted faults went red, including `engine-mode-ignored`, `reset-ignored` and `mode-sticks`.
- Neighbouring live checks on the final build: `verify-nav-keys-live.mjs` passed all 31 scenarios, and `verify-web-tab-live.mjs` passed. The new mode button precedes the input and the pill's left padding is now 4px; neither check went red.
- `PowerBrowserAPI.sys.mjs` was not edited, so the catalogue and boundary steps did not apply.

## Deviations from Plan

1. **[Rule 1 - Bug] The menu listed stale engines.** A menu opened before the pill was ever focused showed the engine list read at startup. Engines added since then were missing; live, that was the hermetic engines. `openModesMenu` now calls `refreshEngines`, and the scenarios wait for the engine items. Commit 4e35f27.
2. **[Rule 3 - Blocking] The suggestions gate's plant anchor moved.** Three engine-host plants in `verify-chrome-bar-suggestions.mjs` anchored on the old `commitText` resolve line. They now anchor on the new line, in the same commit, and their `--self-test` passes.
3. **[Rule 3 - Blocking] Copy-gate derivation.** The quoted `modeLabels` key `'command-centre'` was read as copy. `deriveNavCopyRaw` now skips quoted property keys. A plant proves that a drifted value under a quoted key still goes red.
4. **Live check adaptation, mode-chip access letters.** The built-in "Perplexity" engine shares the letter P with the probe engines. The scenario derives the press count from the menu (at least two presses, so cycling is still proven) instead of always pressing twice.
5. **Scope additions inside the plan's intent:**
   - Alt+Enter and Ctrl-click in an engine mode force a search with that engine, and `openUrlInNewTab` resets the mode.
   - Failure retries carry the commit's engine.
   - Esc's restore step also fires when only the mode is off its default.
   - Search Settings landed in Task 1's menu as a working item, so no commit had a dead menu row. Its live check is in Task 2.
6. **Requirement marks not set.** SMODE-01, 02 and 03 are only partly delivered by this plan:
   - SMODE-01 still needs the Command centre, Bookmarks, Tabs, History and Actions contributions (30-03, 30-04).
   - SMODE-02 still needs Command centre and Tabs to exist, so Coding and Organising still resolve to Address.
   - SMODE-03 still needs the Backspace reset (30-05).
   REQUIREMENTS.md keeps them Pending, and `requirements-completed` is empty.

**Total deviations:** 3 auto-fixed (Rules 1-3), 3 procedural or scope notes. **Impact:** no change outside the address bar and its gates.

## Known Stubs

None. Until 30-03 and 30-04 bind modes, the menu shows only engines and Search Settings, and every default resolves to Address. That is the plan's shipped fallback (UI-SPEC E1 error row), not a stub. `CHROME_BAR_COPY.modeLabels` has no reader until 30-03's contributions take their labels from it. The gate already pins its keys.

## Risks for later plans

- Once 30-03 and 30-04 bind Tabs and Command centre, Organising and Coding start in those modes. The pill's `mode` starts as `'address'` and takes the default at the first `syncModeFromPerspective` call (startup). Those plans should prove this live (30-05's mode-defaults scenario). The default stays correct only while the contributions are bound statically (D-50).
- `readPill` and other probes use `document.querySelector('.pb-chrome-bar-dropdown')`, which now also matches the open modes menu. Today the result dropdown always closes when the menu opens, so the two never coexist.
- `MODE_SENDS` gates only the three request sites in `runQuery`, plus suggestions in `fetchEngineRows`. Command centre (30-04) must not reach `commitText`'s resolve for non-URL text. The D-26 live recorder is the guard there.
- Live self-test: the context-menu Paste & Go focus flake hit the clean control twice in a row this session. One re-run passed.
- The visual geometry (chip, menu width, padding) was not screenshotted. It is a manual-only check in 30-VALIDATION.

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts
- FOUND: theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts
- FOUND: scripts/verify-address-bar-modes.mjs
- FOUND: 2cb81e9, 91c53e6, 574b6f9, 4e35f27 (ancestors of HEAD)
