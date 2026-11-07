---
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
plan: 08
subsystem: chrome-bar nav-button tooltips (NAV-05), shortcut-table gate, copy gate, live harness
tags: [nav-05, tooltips, hover-service, aria-keyshortcuts, shortcut-relay, copy-gate]
status: complete

requires:
  - phase: 27-07
    provides: "PAGE_SHORTCUTS with 27 rows and formatter-checked labels, verify-shortcut-relay rules 1-9, the live harness"
  - phase: 27-04
    provides: "Home button, the chrome-bar-copy.ts copy surface"
provides:
  - "BUTTON_SHORTCUTS (verb, rows, aria) and tooltipFor in chrome-bar-shortcuts.ts"
  - "HoverService tooltips at position top with pb-chrome-bar-hover and aria-keyshortcuts on Back, Forward, Reload/Stop, Home, New Tab; title removed from all five"
  - "verify-shortcut-relay rule (10) with plants 'button aria drift' and 'button naming a missing row'; exported formatTooltip, formatAria, buttonShortcuts"
  - "verify-shell-error-copy: the chrome-bar-shortcuts.ts surface pinned by EXPECTED_SHORTCUT_COPY, plant 'shortcut label drifted'"
  - "Live scenarios tooltips and tooltips-all, plant hover-below"
affects: [27 verification, Phase 35 (nsIXULBrowserWindow shim: native title tooltips come back; nav buttons no longer carry title, so no double tooltip)]

actuals:
  tokens: 8950
  tasks: 2
  commits: 2
plan_head_before: 6ab9333e7851402a3ad0125200000426f84b4fd7
plan_head_after: cefb157c40be7e4c9858c6891fc342999dd77a16

tech-stack:
  added: []
  patterns:
    - "Tooltips on buttons that can be disabled use onPointerEnter: React drops onMouseEnter on a disabled button, input or select"
    - "Tooltip and aria text derived from the same table rows the chrome keys are created from, with the gate's exported formatter as the live check's expectation"

key-files:
  created: []
  modified:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-shortcut-relay.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-nav-keys-live.mjs

key-decisions:
  - "onPointerEnter, not onMouseEnter, requests the hover. React 19 filters onMouseEnter on disabled buttons (react-dom-client.development.js, the onClick/onMouseEnter switch), so a disabled Back would lose its tooltip. Gecko 153 dispatches pointer events to disabled controls (dom.forms.always_allow_pointer_events.enabled true)."
  - "In Organising the bar is at the window's top edge, so HoverService flips the hover below the bar onto the toolbar row. It stays clear of the page. tooltips-all requires 'above the bar' only where the bar has room above it."
  - "The widget imports chrome-bar-shortcuts, which imports the widget. The frontend module loads chrome-bar-shortcuts first and the widget reads the table only at render time, so the cycle is safe. A comment at the import records this."

requirements-completed: [NAV-05]

metrics:
  duration: "about 45 min"
  completed: 2026-10-20
---

# Phase 27 Plan 08: Nav-button tooltips name their shortcut Summary

Each nav button's tooltip now shows its keyboard shortcut, for example "Back (Alt+Left Arrow)" or "Stop (Esc)". The text is built from the one shortcut table and rendered by Theia's HoverService above the bar. `aria-keyshortcuts` carries the same keys, and the native `title` is gone from the five nav elements. Two gates go red on drift: the table gate checks rows, aria and length, and the copy gate checks the label and verb literals. The live check covers all three modes.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Back's tooltip reads Back (Alt+Left Arrow) from the table, above the bar (tracer) | d4e9179 |
| 2 | Every nav button, both Reload states, disabled buttons and three modes; gate and copy coverage | cefb157 |

Tracer gate: after Task 1, the full `<verify>` chain was re-run (copy gate, table gate, tsc, build, `--scenario tooltips`) and passed before Task 2 started.

## What the tooltips are

| Button | Tooltip (Linux/Windows) | aria-keyshortcuts |
| ------ | ----------------------- | ----------------- |
| Back | Back (Alt+Left Arrow) | Alt+ArrowLeft |
| Forward | Forward (Alt+Right Arrow) | Alt+ArrowRight |
| Reload | Reload (Ctrl+R) | Control+R F5 |
| Stop | Stop (Esc) | Escape |
| Home | Home (Alt+Home) | Alt+Home |
| New Tab | New Tab (Ctrl+T) | Control+T |

The macOS rendering comes from `macLabel` through `isOSX` (for example "Back (⌥←)"). Gate rule (10) checks both renderings against 26 characters.

## Verification

- `node scripts/verify-shortcut-relay.mjs`: PASS, including "6 nav buttons name table rows with derived aria and tooltips of at most 26 characters".
- `node scripts/verify-shortcut-relay.mjs --self-test`: PASS, 14 plants red, including `button aria drift` and `button naming a missing row`.
- `node scripts/verify-shell-error-copy.mjs` and `--self-test`: PASS. 9 modes-copy plants red, including `shortcut label drifted`.
- `theia/node_modules/.bin/tsc --noEmit -p theia/extensions/chrome-bar`: clean.
- `scripts/verify-platform.sh --quick`: PASS (after the last code commit).
- `node scripts/verify-nav-keys-live.mjs`: all 29 scenarios PASS in one full run, including `tooltips` and `tooltips-all`.
- `node scripts/verify-nav-keys-live.mjs --self-test`: PASS. The clean control (29 scenarios) is green and all 6 plants went red. `hover-below` went red in Browsing with "back's tooltip box intersects the page rect: tooltip {top 73.5, bottom 101.7}, page {top 73}".
- `scripts/verify-platform.sh --only gui02-web-tab-live`: PASS.
- Live geometry: the tooltip measures 28.2 px tall, one line at line-height 1.4, which matches the UI-SPEC's "about 28px". In Coding and Browsing it sits above the bar. In Organising it sits at 45-69 px on the toolbar row, and the page starts at 73 px.
- Acceptance greps: one `export function tooltipFor`; `BUTTON_SHORTCUTS` 6 times in the widget; `pb-chrome-bar-hover` once in the CSS, inside the `@layer powerbrowser-chrome-bar` block (checked by brace depth); `aria-keyshortcuts=` 5 times; `EXPECTED_SHORTCUT_COPY` 5 times. No `title=` remains on a nav button. The remaining `title=` uses are the suggestion rows and the custom-mode rows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] onMouseEnter never fires on a disabled button**
- **Found during:** Task 1, reading react-dom 19.2.8
- **Issue:** React suppresses `onMouseEnter` (and click/mouse down/up/move) on a disabled `button`, `input`, `select` or `textarea`. The plan's `onMouseEnter` would have dropped the tooltip from a disabled Back or Forward, which UI-SPEC forbids.
- **Fix:** request the hover from `onPointerEnter`. The live check dispatches `pointerover`, from which React builds `onPointerEnter`, instead of `mouseover`.
- **Files modified:** chrome-bar-widget.tsx, verify-nav-keys-live.mjs
- **Commit:** d4e9179

**2. [Rule 1 - Spec premise] Organising has no row above the bar**
- **Found during:** Task 2, first `tooltips-all` run
- **Issue:** UI-SPEC says the hover sits over "the toolbar in Organising" above the bar. Measured: the bar is at 0-40 px, the toolbar row is at 40-73 px below it, and the page starts at 73 px. HoverService flips the hover below the bar.
- **Fix:** no product change. Rule (c) holds: the tooltip does not cover the page. `checkTooltip` requires "above the button" when the bar has room above it, and otherwise requires "below the button and clear of the page". Recorded in deferred-items.md.
- **Commit:** cefb157

**3. [Rule 3 - Blocking] The shared-process blank defect enabled Back on a fresh tab**
- **Found during:** Task 2, the first full live run
- **Issue:** the fifth same-site tab was replaced by `about:blank` after it loaded. History read `[/tip-organising, about:blank]`. Back was then enabled and the disabled-keeps-tooltip evidence was lost. Organising also left `page-focus-reload`, the next scenario, unable to focus a page, because Organising opens a tab behind its own widget.
- **Fix:** `tooltips-all` closes every web tab before each mode and switches back to Coding in a `finally`. The defect itself is pre-existing and still open. The new trigger is recorded in deferred-items.md.
- **Commit:** cefb157

**4. [Process] Targeted Theia build instead of `yarn build`**
- Per the orchestrator's rules: `yarn --cwd extensions/chrome-bar build`, then `theia build --app-target=browser --mode development`.

**5. [Additions] Evidence the plan did not ask for**
- Each tooltip read also requires the `pb-chrome-bar-hover` class and exactly one line, measured from the line height.
- `tooltips-all` requires that Back and Forward were hovered while disabled at least once. It also notes each button's enabled state per mode.
- The gate exports `formatTooltip`, `formatAria` and `buttonShortcuts`. The live check takes its expected text from them and not from a hand-kept list.

## Human check (end of phase, not run here)

Raise the window with a KWin script and capture it with spectacle. Check that the tooltips read as one line above the bar in Coding and Browsing, and on the toolbar row below the bar in Organising. Check that hold-to-open on Back feels like Firefox's 500 ms.

## Deferred Issues

- Shared-process blank defect: a second trigger, activation (deferred-items.md, "From 27-08").
- UI-SPEC rule (c) wording for Organising (deferred-items.md, "From 27-08").

## Known Stubs

None.

## Threat Flags

None. T-27-25: tooltip and aria text derive from the rows the chrome keys are created from, and rules (3) and (10) compare them. T-27-26: labels and verbs are pinned under the internals patterns and the brand-literal rule. No package was installed, and no endpoint, chrome file or boundary file changed.

## Self-Check: PASSED

- FOUND: every modified file listed in key-files
- FOUND: d4e9179, cefb157 (ancestors of HEAD)
