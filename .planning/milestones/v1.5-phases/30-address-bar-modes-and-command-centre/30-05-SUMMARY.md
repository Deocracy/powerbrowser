---
phase: 30-address-bar-modes-and-command-centre
plan: 05
subsystem: ui
tags: [theia, chrome-bar, address-bar, modes, tokens, keybindings, verification]
status: complete

requires:
  - phase: 30-address-bar-modes-and-command-centre
    provides: 30-02's mode table and resetMode, 30-03's local modes, 30-04's Command centre and workspace fixture
provides:
  - "address-bar-mode-table.ts: tokenise(text, mode, context), TokenContext, cycleOrder(engineNames, contributed), nextMode(order, current, step)"
  - "AddressBar: Backspace-at-start reset; applyToken(), engineAliases(), aliasRows(), cycleMode(step); Accel+Up/Down and Alt+Up/Down in onInputKeyDown"
  - "chrome-bar-keybindings.ts: ctrlcmd+up/down and alt+up/down in the pill-scoped passthrough loop"
  - "PowerBrowserAPI.sys.mjs listSearchEngines: aliases (Gecko engine.aliases, at most 8 of at most 64 characters); SearchEngineInfo.aliases: string[]"
  - "verify-address-bar-modes cases 10-14 with two plants; live scenarios mode-defaults, mode-tokens, mode-keys with plants default-ignored, token-kept, cycle-off"
affects: [30-06]

tech-stack:
  added: []
  patterns:
    - "A live check imports the pure mode table under Node type stripping, so expected defaults and the cycle order are the tree's own values"
    - "Mode keys are pill-scoped passthrough bindings handled in the input's React keydown (WR-02 F6 pattern)"

key-files:
  created: []
  modified:
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/verify-address-bar-modes.mjs
    - scripts/verify-address-bar-live.mjs

key-decisions:
  - "Command centre keeps a token exactly when the registry's descriptor for it has that token as its prefix (> and ? today); every @ token stays text there"
  - "@alias matching is case-insensitive and needs the leading @; a bare alias word is plain text"
  - "Accel+Up/Down re-runs the query only when the result list is open; a closed list stays closed (Firefox re-queries only an open view)"
  - "The @ alias list disarms pending debounced queries, so a late reply cannot replace it"
  - "SearchEngineInfo.aliases is normalised to [] client-side when chrome sends none"

requirements-completed: [SMODE-02, SMODE-03, SMODE-04]

duration: ~56m
completed: 2026-10-22

actuals:
  tokens: 12300
  tasks: 3
  commits: 3
plan_head_before: 0b6980ce68f0cdd12f24ff7face22103ecd150a8
plan_head_after: 8ee4f674f728ee51a1867411ef7c3cde7d1d0caa
---

# Phase 30 Plan 05: Mode defaults, tokens and keys Summary

Each PowerBrowser mode now opens the pill in its table default, and the live check proves it by reading the table itself. Backspace at the start of the pill leaves a picked mode. Typing `* `, `% `, `^ `, `> `, `? ` or `@alias ` switches mode, and engine aliases come from Gecko. Ctrl+Up/Down cycles modes and Alt+Up/Down opens the modes menu, only while the pill has focus. Monaco keeps both key pairs in an editor.

## What was done

- **Task 1 (c0af6da, tracer): defaults and Backspace.**
  - Backspace with no modifier, the caret at 0, no selection and a non-default mode calls `resetMode({ requery: true })`. In the default mode Backspace deletes as usual. The IME guard still runs first.
  - No change to the default rules was needed: the 30-02 resolution held end to end.
  - Live `mode-defaults` imports `address-bar-mode-table.ts` and checks every `DEFAULT_MODE_BY_UI_MODE` row through a trusted click on the toggle segment:
    - Coding shows the Command centre chip, no x, and the empty-prefix provider's placeholder.
    - Browsing shows the Address form.
    - Organising shows the Tabs chip, an empty pill and "Search tabs".
  - It then checks four more cases:
    - D-16: Coding with a localhost web tab current stays in Command centre.
    - D-14: Tabs with an empty pill, then Backspace, returns to Command centre.
    - D-14: "ab" then Backspace leaves "a" in the same mode.
    - D-17: a custom mode saved through `saveCurrentAsMode` starts in `defaultModeFor`'s fallback.
  - Plant: `default-ignored`.
- **Task 2 (a2de754): tokens and aliases.**
  - `tokenise` is pure. Its tokens are the `LOCAL_MODES` restrict tokens, derived, plus `?` and `@alias`, each followed by a space.
  - `AddressBar.applyToken` runs in `textEdited` before the dispatch and puts the caret at the end of the remaining text.
  - Typed alone outside Command centre, `@` lists the aliased engines. Each row shows the alias, the engine name and the engine icon. Choosing a row enters that engine's mode with empty text.
  - `listSearchEngines`' `engines.push` line now also sends bounded `aliases`. The catalogue was re-pointed by `--fix`. Both boundary modes pass.
  - Static cases 10-12, including a derived comparison over printable ASCII, plus the plant "tokenise accepts a token without a space".
  - Live `mode-tokens`: `@two` is set on Probe Engine Two from chrome, and every token row in the UI-SPEC table is checked. Plant: `token-kept`.
- **Task 3 (8ee4f67): mode keys.**
  - Four passthrough keybindings are added to the F6 loop under `ADDRESS_FOCUSED_CONTEXT_KEY`.
  - `cycleOrder` and `nextMode` are pure. `cycleMode(step)` is an instance method, so a plant can replace it. Alt+Up/Down calls `openModesMenu`. Both stop propagation.
  - Static cases 13-14 (the cycle order is a pinned UI-SPEC contract), plus the plant "nextMode does not wrap".
  - Live `mode-keys` derives the cycle order now (13 entries in the probe profile), steps it with Ctrl+Down, wraps, and steps back with Ctrl+Up. Alt+Down opens the modes menu and Esc closes it.
  - In the README.md editor, Alt+Up and Alt+Down swap lines, and Ctrl+Down leaves the pill's mode unchanged. Plant: `cycle-off`.

## Verification

- `scripts/verify-platform.sh --quick`: PASS after every task and at the end. `scan-brand-residue`: PASS.
- `verify-address-bar-modes`: 18 cases. `--self-test`: 13 plants red.
- Also PASS: `verify-chrome-bar-commands`, `verify-web-tab-bridge` and `verify-ng-040-internals-catalogue-lines`, plus `check-internals-boundary.sh` in plain and `--catalogue` mode. The `IOUtils.remove`, `searchLazy` and `getFixupURIInfo` rows were checked by hand: all sit above the edit and were not moved.
- `tsc` is clean for chrome-bar and tab-uris. Theia was rebuilt (0 errors) before each live run.
- Live checks:
  - `search,mode-lifetime,mode-defaults`: PASS, three runs in a row after the harness fixes.
  - `search,default-engine,modes-dropdown,mode-tokens`: PASS.
  - `search,command-centre,mode-keys`: PASS.
  - `verify-nav-keys-live.mjs`: 31/31 PASS, exit 0.
- A scratch runner applied each new plant on its own (`default-ignored`, `token-kept`, `cycle-off`). Each went red with its expected text.
- `verify-address-bar-live.mjs --self-test`: PASS on the first run. The clean control ran 28 scenarios green, and the context-menu Paste & Go flake did not occur. All 27 plants went red.

## Deviations from Plan

1. **[Rule 3 - Blocking] The live modes-menu opener clicks again.** `search,mode-lifetime` failed 2 times in 6 with "the modes menu did not open". Cause: a page focus still landing from an earlier tab activation blurs the mode button, and that blur closes the menu. `openModesMenu` in the harness now clicks a second time only when the first click opened nothing. No product code changed. (c0af6da)
2. **[Rule 3 - Blocking] The Save as Mode prompt is retried in the live check.** The prompt sometimes closed itself after a focus loss, so `saveCurrentAsMode` returned with nothing saved. The probe now blurs the pill first and retries up to three times. A note records it whenever more than one attempt was needed. (c0af6da)
3. **Interpretation: re-running the query.** Accel+Up/Down re-runs the query only when the result list is open. "Without opening the dropdown" is read as "a closed list stays closed".
4. **Normalisation.** The client fills `aliases: []` when chrome sends none.

**Total deviations:** 2 auto-fixed harness issues (Rule 3) and 2 recorded readings. **Impact:** the two harness fixes touch only the live check.

## Requirements

- **SMODE-02: Complete.** The live mode defaults are proven by `mode-defaults`.
- **SMODE-03: Complete.** The chip and x landed in 30-02, and Backspace landed here.
- **SMODE-04: Complete.** Tokens, aliases and both key pairs.
- SMODE-06 remains Pending (30-06).

## Known Stubs

None. `@alias` does nothing in the shipped tree because no engine has an alias configured. That follows decision A6: aliases come only from Gecko, and no `configuration.toml` key was added.

## Threat surface

No surface beyond the plan's threat model.

- T-30-18: aliases are bounded chrome-side and rendered as text nodes.
- T-30-19: the four keys are passthroughs only under the pill's context key, and the editor control proves Monaco still gets them.
- T-30-20: tokens only switch modes, and MODE_SENDS still governs what each mode sends.

## Risks for later plans

- **30-06 Go-to row.** With no row chosen, Command centre's Enter still does nothing. Until 30-06 lands, typed URLs do not navigate in Coding.
- **30-06 F6.** In the pill's keydown, Accel/Alt+Up/Down now sit before the F6 branch. F6 in a non-Address mode is 30-06's change, and the F6 branch can take it directly.
- **Live ordering.**
  - `mode-defaults` and `mode-tokens` run before `command-centre`, so they need no workspace.
  - `mode-keys` runs last and opens the workspace fixture itself (cached in `shared`).
  - `mode-defaults` leaves a custom mode called "Probe Custom Mode" in the session profile. A later scenario that counts toggle segments must allow for it.
- **The cycle includes every Gecko engine.** The probe profile has Google, Bing and other default engines, and the cycle visits them all. The UI-SPEC's "each engine" is chrome's visible set; if that set is narrowed, the cycle follows it.
- **Node warning.** Importing the `.ts` table prints `MODULE_TYPELESS_PACKAGE_JSON` on stderr. This is harmless and the same as the static gate.

## Self-Check: PASSED

- FOUND: `export function tokenise(`, `export function cycleOrder(` in address-bar-mode-table.ts
- FOUND: `aliases: string[]` in chrome-store-client.ts; `aliases` on the `engines.push` line in listSearchEngines
- FOUND: `ctrlcmd+up` in the passthrough loop of chrome-bar-keybindings.ts
- FOUND: `address-bar-mode-table.ts` import in verify-address-bar-live.mjs
- FOUND: c0af6da, a2de754, 8ee4f67 (ancestors of HEAD)
