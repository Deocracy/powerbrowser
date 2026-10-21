---
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
plan: 06
subsystem: page-scoped keys (chrome keyset, chrome-bar relay, tab strip), static gate, live harness
tags: [page-keys, key-01, key-03, key-04, nav-02, nav-04, shortcut-relay]
status: complete

requires:
  - phase: 27-01
    provides: "PAGE_KEYS / PAGE_SHORTCUTS with the stop row, ChromeBarShortcutRelay, relayShortcut, the page-focus probe"
  - phase: 27-05
    provides: "ChromeBarWidget.goHome(tab) returning 'opened' | 'empty' | 'failed'"
provides:
  - "The full 25-row page-key table on both sides (Ctrl+T/W reserved, Ctrl+Tab family reserved, every other row reply-path)"
  - "Relay actions for every row: New Tab, close-and-refocus, reload, hard reload, back/forward, home, pill focus, tab step with wrap, Alt+1..8 and Alt+9"
  - "TabStripWidget.switchOrder(anchor): the strip's order in Browsing, the anchor's tab bar otherwise; render() shares stripTabs()"
  - "Theia's Ctrl+L binding scoped by !editorFocus && !terminalFocus"
  - "scripts/verify-shortcut-relay.mjs with exported formatLabel/formatMacLabel/check/RESERVED_EXCEPTIONS, and --self-test (10 plants)"
  - "Registry rows shortcut-relay and shortcut-relay-self-test (--quick)"
  - "Live scenarios page-keys, page-prevented, tab-keys; self-test plant tab-order-reversed"
affects: [27-07 (F6, Shift+F6, mouse 4/5, theia-keeps-keys), 27-08 (tooltip text derived from the exported formatters)]

actuals:
  tokens: 15500
  tasks: 2
  commits: 2
plan_head_before: 21ca438be2f3ee8b3374798cf6380c405903581a
plan_head_after: 603f9fa53305b71dc9235d9bfc5cb8e9892c7509

tech-stack:
  added: []
  patterns:
    - "A static gate that evaluates Firefox's #ifdef/#define/#expand preprocessor for one platform to derive upstream key rows"
    - "Gate exports its formatters and runs main() only as the entry script, so a live check can import them"

key-files:
  created:
    - scripts/verify-shortcut-relay.mjs
  modified:
    - powerbrowser/shell/powerbrowser.js
    - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
    - theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts
    - scripts/verify-platform.sh
    - scripts/verify-nav-keys-live.mjs

key-decisions:
  - "14.1-UI-SPEC A13 superseded: Ctrl+L is no longer an always-reserved chrome key; it is the page-scoped reply-path row focusAddressL. The guaranteed exits from a page are the reserved rows (Ctrl+T, Ctrl+W, Ctrl+Tab family), as in Firefox."
  - "Ctrl+W's close action activates the next current widget through the same switchTo path as a tab switch (activateWidget, then focusPage for a web tab). Calling focusPage alone left chrome's focus off the page."

metrics:
  duration: "about 45 min (resume run)"
  completed: 2026-10-20
---

# Phase 27 Plan 06: Page-focus browser keys Summary

Firefox's browser keys now work while a web page has focus: 25 rows on both sides, with Ctrl+T, Ctrl+W and the Ctrl+Tab family reserved and every other row on the reply path. The Ctrl+L chrome reservation is retired. A derived gate checks the table against Firefox's own Linux key rows.

## Crash resume

A previous executor died during Task 1 and left uncommitted edits in all five Task 1 files. No 27-06 commit existed. I read the diff and checked it against the plan:

- **Kept as written:** the `PAGE_KEYS` rows and the replacement for the A13 comment in `powerbrowser.js`; the `PAGE_SHORTCUTS` rows and labels; the relay actions; `stripTabs()` and `switchOrder()`; the Ctrl+L when-clause; the `page-keys`, `page-prevented` and `tab-keys` scenarios. The scenarios already contained the `tab-order-reversed` plant site.
- **Fixed:** `closeTab`. The first live run failed: "after Ctrl+W focus must land in A's page; chrome's active overlay is undefined". `closeTab` now calls `switchTo(next)`, which activates the widget and then focuses its page. With that change `page-keys` and `page-prevented` pass.
- **Written new (none of it existed):** `verify-shortcut-relay.mjs`, the two registry rows, and the `PLANTS` entry for `tab-order-reversed`.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Full page-key table, relay actions, visible tab order, Ctrl+L when-clause, three live scenarios | 8ba0866 |
| 2 | verify-shortcut-relay.mjs and its self-test, registry rows, tab-order-reversed live plant | 603f9fa |

## Verification

- `node scripts/verify-shortcut-relay.mjs`: PASS. 25 rows and 25 relay actions; 6 reserved rows; Firefox ids matched against 78 Linux keys.
- `--self-test`: PASS. All 10 plants went red, each naming its id.
- `scripts/verify-platform.sh --only shortcut-relay` and `--quick`: PASS.
- `node scripts/verify-nav-keys-live.mjs`: all 21 scenarios PASS, including page-keys, page-prevented and tab-keys.
- `node scripts/verify-nav-keys-live.mjs --self-test`: PASS. Clean control green; 4 plants red, among them `tab-order-reversed` ("Ctrl+Tab from T1: expected T2, got current T3").
- tsc on chrome-bar, verify-web-tab-bridge, verify-chrome-bar-commands and check-internals-boundary: all PASS.
- Key route: every key was synthesised through the TIP route (`keys: tip`). No key needed another route.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ctrl+W left focus outside the next tab's page**
- **Found during:** Task 1, first live run
- **Issue:** `closeTab` called `focusPage()` on the new current web tab without activating it, and chrome's active element did not end up on its overlay.
- **Fix:** route through `switchTo(next, tab)`. This is the same activate-then-focus path the tab-switch keys use, and it also covers non-web widgets.
- **Files modified:** theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
- **Commit:** 8ba0866

**2. [Process] Targeted Theia build instead of `yarn build`**
- Per the orchestrator's concurrency rules, I rebuilt only the chrome-bar extension and the browser app (development mode), not the full `yarn build`.

## Deferred Issues

- The accel+L focus path is now dead: `PowerBrowserAPI.webTabFocusAddress`, the `focusAddress` push kind, `onDidRequestFocusAddress` and its listener. A stale comment remains at web-tab.ts:405. All are outside this plan's files and are logged in deferred-items.md.

## Known Stubs

None.

## Threat Flags

None. No new kind, endpoint or privileged path was added. The relay's action map holds only the actions the threat model allows (T-27-19), and `page-prevented` shows the reserved rows still act on a page that consumes every key (T-27-18).

## Self-Check: PASSED

- FOUND: scripts/verify-shortcut-relay.mjs
- FOUND: 8ba0866, 603f9fa (ancestors of HEAD)
