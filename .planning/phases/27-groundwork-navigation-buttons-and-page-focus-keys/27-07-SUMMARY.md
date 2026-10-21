---
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
plan: 07
subsystem: page-scoped keys (chrome bootstrap, chrome-bar relay and pill), static gate, live harness
tags: [page-keys, key-02, key-04, key-05, nav-01, f6, appcommand, shortcut-relay]
status: complete

requires:
  - phase: 27-06
    provides: "The 25-row page-key table on both sides, ChromeBarShortcutRelay actions, verify-shortcut-relay.mjs, page-keys live scenario"
  - phase: 27-01
    provides: "relayShortcut, tabIdOfBrowser, pushPageFocus, the live-probe harness"
provides:
  - "F6 and Shift+F6 from a page to the pill on Firefox's reply path (requestReplyFromRemoteContent, defaultPreventedByContent), and from the pill back to the page"
  - "Mouse buttons 4 and 5 (AppCommand Back/Forward) acting on the hovered overlay only"
  - "Esc in the pill: close suggestions, restore the address, then stop a loading page"
  - "verify-shortcut-relay rules (8) reply-listener rows and (9) relayed literal ids, with plants"
  - "Live scenarios focus-keys, focus-keys-prevented, mouse-buttons, pill-esc, theia-keeps-keys, page-focus-reload; plant hover-elsewhere"
  - "The pre-Phase-27 focus-address path removed (boundary method, push kind, channel event, subscriber)"
  - "pushPageFocus dedupe keyed by the frontend WindowGlobal"
affects: [27-08 (tooltips: F6 and Shift+F6 rows now exist in PAGE_SHORTCUTS with formatter labels)]

actuals:
  tokens: 16300
  tasks: 3
  commits: 5
plan_head_before: 49afc12c9283311d2ae337c692adb9440d1efde2
plan_head_after: 57fd34d526f1a6c02c847c9adb81d8749e594e0e

tech-stack:
  added: []
  patterns:
    - "A page-blockable chrome key that a <key> row cannot serve: capture keydown, requestReplyFromRemoteContent on the first pass, act on the reply only when !defaultPreventedByContent"
    - "Widget AppCommand events targeted by a tracked mouseover target, with the focused element only as the never-hovered fallback"

key-files:
  created: []
  modified:
    - powerbrowser/shell/powerbrowser.js
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - scripts/verify-shortcut-relay.mjs
    - scripts/verify-nav-keys-live.mjs
    - scripts/verify-shell-error-contract.mjs

key-decisions:
  - "A2 held: defaultPreventedByContent is false when only the page's document navigation consumed F6 and true when the page called preventDefault(), so F6 stays on the reply path. The reserved-row fallback was not taken."
  - "pushPageFocus dedupes on (frontend WindowGlobal, tab id). Tab ids are minted per frontend load, so the stale-dedupe case cannot be reproduced today. The keying removes cross-frontend dedupe state, which is cheaper than proving it can never matter."
  - "Esc in the pill stops a load only when the input already shows the committed address (nothing to restore) and no dropdown is open."

metrics:
  duration: "about 50 min"
  completed: 2026-10-21
---

# Phase 27 Plan 07: F6, mouse buttons 4/5, Esc in the pill, Theia keeps its keys Summary

F6 and Shift+F6 move focus from a page to the pill on Firefox's own reply path, and from the pill back to the page. Mouse buttons 4 and 5 go back and forward in the page under the pointer. Esc in the pill stops a loading page. A live scenario shows that every clashing key reaches the Theia frame in an editor and a terminal. The old focus-address route is removed.

## Assumptions checked live

- **A2 (defaultPreventedByContent):** held. `focus-keys` receives a `focusAddressF6` / `focusAddressShiftF6` shortcut push from the reply listener. `focus-keys-prevented` shows that a page calling `preventDefault()` on F6 keeps it: no push within 1500 ms, and focus stays on its overlay. The reserved-row fallback was not taken. `RESERVED_EXCEPTIONS` is unchanged.
- **A5 (chrome sees overlay mouseover):** held for trusted input. `mouse-buttons` synthesises a `mousemove` at the overlay's centre through `window.synthesizeMouseEvent`, and a capture listener in chrome records a trusted `mouseover` whose target is an overlay (`A5 trusted mouseover on an overlay: true`). `windowUtils.sendMouseEvent` no longer exists at this tag.
- **A6 (AppCommand reaches a window capture listener):** held for a chrome-dispatched `CommandEvent('AppCommand')`. A real button 8/9 press is still UAT (see Human check).

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | F6 from the page to the pill and back (tracer) | 962d2d2 |
| 2 | Mouse buttons 4 and 5, Esc in the pill, the Theia frame keeping its keys | b50c764 |
| - | Fix: contract stub window gains an inert addEventListener (Task 1 regression) | e8d9abc |
| 3 | Remove the replaced focus-address path; hover-elsewhere plant | 4936517 |
| - | Carry-over 1: page-focus dedupe per frontend WindowGlobal, page-focus-reload scenario | 57fd34d |

The tracer gate passed after Task 1: `<verify>` was re-run end to end (`focus-keys`, `focus-keys-prevented`, `page-keys` PASS) before Task 2 started.

## Verification

- `node scripts/verify-shortcut-relay.mjs`: PASS. 27 rows and 27 relay actions; 6 reserved; 2 reply-listener rows, unreserved; 2 literal relayed ids are table ids.
- `node scripts/verify-shortcut-relay.mjs --self-test`: PASS. All 12 plants went red, including `reply row marked reserved` and `AppCommand id not in the table`.
- `node scripts/verify-web-tab-bridge.mjs` and `--self-test` (14 plants): PASS.
- `check-internals-boundary.sh` and `--catalogue`, and `verify-ng-040-internals-catalogue-lines.mjs`: PASS.
- tsc `--noEmit` on tab-uris and chrome-bar, and `tsc -b` on tab-uris: clean.
- `scripts/verify-platform.sh --quick`: PASS (final run after the last commit).
- `scripts/verify-platform.sh --only ng-033-layout-survives-relaunch`: PASS.
- `node scripts/verify-nav-keys-live.mjs`: all 26 scenarios PASS in the full run after Task 3. `page-focus-reload` was added afterwards and passed in two solo runs.
- `node scripts/verify-nav-keys-live.mjs --self-test`: PASS. The clean control (all 27 scenarios) is green, and all 5 plants went red, including `hover-elsewhere` ("AppCommand Back over the page produced no push ending /m1").
- Acceptance greps: `via: "replyListener"` x2; one `requestReplyFromRemoteContent()`; one `addEventListener("AppCommand"`; one `id: 'focusAddressShiftF6'`; no `webTabFocusAddress` or `onDidRequestFocusAddress` remains under powerbrowser/shell, tab-uris/src or chrome-bar/src.
- Every key was synthesised through the TIP route (`keys: tip`).

## Carry-overs

1. **Page-focus dedupe after a frontend reload (27-01).** `pushPageFocus` now compares the frame's current WindowGlobal as well as the tab id. I could not reproduce the reported stale key. Tab ids are `wt-<per-load random>-<n>`, so an id from a previous frontend never repeats. The pushes after a reload were `null` and then the new tab's id. The keying removes the cross-frontend dedupe state anyway. `page-focus-reload` checks the key in four states: true with a page focused, false after the reload, true when a new frontend's page is focused, false on the Theia frame.
2. **Dead focus-address path (27-06).** Removed (Task 3). The deferred item is marked resolved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 1 broke `shell-error-contract` in --quick**
- **Found during:** Task 3 verification (`verify-platform.sh --quick`)
- **Issue:** the contract runs `powerbrowser.js` in a Node VM sandbox whose `window` had no `addEventListener`. The new window-level keydown listener threw before the scenario reached the error state.
- **Fix:** give the sandbox window an inert `addEventListener`, the same as its stub elements already have.
- **Files modified:** scripts/verify-shell-error-contract.mjs
- **Commit:** e8d9abc

**2. [Rule 1 - Bug] `verify-ng-040 --fix` swapped two catalogue rows**
- **Found during:** Task 3
- **Issue:** after the 18-line deletion, `--fix` assigned the two `savePageCopy` `IOUtils.remove` rows to 4050 and 4054 in table order, which swapped their descriptions. The check cannot detect this.
- **Fix:** corrected both rows by hand. The tool defect is logged in deferred-items.md.
- **Commit:** 4936517

**3. [Rule 3 - Blocking] page-prevented passed before only because of timing**
- **Found during:** Task 3 full live run (it failed in every run from then on)
- **Issue:** after Ctrl+T the new empty tab is current, so the preventing page's overlay is hidden and cannot take focus for the Ctrl+W press.
- **Fix:** re-activate the preventing tab and focus its page before Ctrl+W, as `tab-keys` already does. Product behaviour is unchanged.
- **Commit:** 4936517

**4. [Rule 3 - Blocking] history-channel title race (deferred from 27-05)**
- **Found during:** Task 3 `--self-test`. The clean control went red on the race, which blocked the plan's verification.
- **Fix:** each navigation waits for a state push that carries the served title.
- **Commit:** 4936517

**5. [Process] Targeted Theia build instead of `yarn build`**
- Per the orchestrator's rules, I rebuilt only the changed extensions (chrome-bar, tab-uris) and the browser app in development mode.

**6. [Additions] Evidence the plan did not ask for**
- `focus-keys` also requires the relayed shortcut push, so a pass proves the reply listener ran.
- `pill-esc` also requires that no shortcut push arrives, so the stop comes from the pill and not from the chrome row.
- `mouse-buttons` records A5 with a trusted synthesised mouse move.

## Human check (end of phase, not run here)

On KDE Wayland with a real mouse and keyboard: the back and forward mouse buttons over a page navigate it, and every key in the UI-SPEC key table behaves as listed with a page focused, and keeps Theia's meaning in an editor and a terminal. The scripted passes are evidence, not UAT.

## Deferred Issues

- `verify-ng-040 --fix` table-order reassignment (see Deviation 2 and deferred-items.md).
- Two single, unreproduced live failures (`hard-reload-click` once in the full run, `page-keys` Alt+Home once). Both are recorded in deferred-items.md.

## Known Stubs

None.

## Threat Flags

None. The F6 listener acts only when the event is trusted and its target is an overlay the boundary holds (T-27-22). AppCommand acts only on the hovered overlay, or on the focused one when no mouseover has ever been seen, and uses table ids enforced by gate rule 9 (T-27-23). `theia-keeps-keys` covers T-27-24. No new kind, endpoint or privileged path. One push kind (`focusAddress`) and one boundary method were removed.

## Self-Check: PASSED

- FOUND: every modified file listed in key-files
- FOUND: 962d2d2, b50c764, e8d9abc, 4936517, 57fd34d (ancestors of HEAD)
