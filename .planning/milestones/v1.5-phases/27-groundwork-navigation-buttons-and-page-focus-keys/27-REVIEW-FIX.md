---
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
fixed_at: 2026-10-21T06:25:38Z
review_path: .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-REVIEW.md
iteration: 2
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 27: Code Review Fix Report

**Fixed at:** 2026-10-21T06:25:38Z
**Source review:** .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-REVIEW.md
**Iteration:** 2 (iteration 1 fixed WR-01..WR-06 at 2026-10-21T06:05:03Z; those rows are kept below)

**Summary:**
- Findings in scope: 8. Iteration 1 covered WR-01..WR-06. Iteration 2 covers WR-07 and IN-25 from the re-review. IN-01..IN-24 are outside scope.
- Fixed: 8
- Skipped: 0

## Fixed Issues

### WR-01: suppressNavClick stays set after a hold released off the button (THEIA-02)

**Files modified:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`
**Commit:** 17ff572
**Status:** fixed: requires human verification
**Applied fix:** When the hold timer sets `suppressNavClick`, it now adds a one-shot capture `pointerup` listener on window. That listener clears the flag in a `setTimeout` after the release's click has been dispatched, wherever the release lands. The release that ends a hold is still swallowed. A later keyboard Enter or Space on Back or Forward is no longer eaten. The live `long-press` scenario still passes. No live scenario covers "release off the button, then press Enter", so that path has not been checked live.

### WR-02: Pill F6 is pre-empted by Theia's capture-phase F6 binding while debugging (THEIA-03)

**Files modified:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`, `theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts`, `scripts/verify-nav-keys-live.mjs`
**Commit:** ec3776c
**Applied fix:** The pill input carries an element-scoped context key, `powerbrowser.addressFocused`, created with `ContextKeyService.createScoped` from a stable ref callback. `ChromeBarKeybindingContribution` registers `f6` and `shift+f6` to Theia's `passthrough` pseudo-command with `when: powerbrowser.addressFocused`. `selectBindingByLocalContext` in KeybindingRegistry prefers a binding that uses an element-local key, so this binding beats @theia/debug's global `inDebugMode` F6 whatever the registration order. Passthrough skips preventDefault and stopPropagation, so the pill's own keydown handler runs. F6 everywhere else in Theia is unchanged, and F6 is not reserved globally.

Correction to the review: Pause has `isEnabled: state === Running` (`debug-frontend-application-contribution.js:236-239`). The defect therefore needs a running session, not just `inDebugMode`.

New live scenario `focus-keys-debug` stands in for a running session: it sets `inDebugMode` and makes the manager's `state` read Running. Its plant `pill-scope-removed` disposes the scoped key, which is the same as reverting the fix, and the scenario goes red ("the debugger's F6 took it").

### WR-03: Ctrl+W on the only tab of a split pane leaves no current tab (THEIA-04)

**Files modified:** `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts`, `scripts/verify-nav-keys-live.mjs`
**Commit:** b022216
**Status:** fixed (live-verified)
**Applied fix:** Before closing, `closeTab` captures a neighbour in `switchOrder`. After `closeWidget` it uses the first of these that exists:
1. the dock's current title
2. that neighbour, if it is not disposed
3. the current tab of any main-area tab bar

New live scenario `close-split`: Coding mode, B moved alone into a split-right pane and never Theia's active widget, then Ctrl+W in B's page. The scenario requires A to become current and focus to land in A's page. Its plant `close-fallback-removed` swaps in the old `closeTab` and goes red with `current {"tabId":null}`, which reproduces the reported defect.

### WR-04: stop-guard passes whether or not the 650 ms Reload guard exists (GATES-01)

**Files modified:** `scripts/verify-nav-keys-live.mjs`
**Commit:** dd716f7
**Applied fix:** The early click no longer runs inside the dispatch of the loaded push, where the Reload button does not exist yet. It polls in requestAnimationFrame for up to 200 ms until the bar renders Reload, then clicks it and records `earlyHit` and `earlyAfterMs`. The late click records `lateHit`. A missing hit, or an early click 600 ms or more after the push, fails as `broken instrument:`. In live runs the early click lands 8-15 ms after the push. New plant `guard-disabled` zeroes `ChromeBarWidget.reloadGuardUntil` just before the early click and goes red with "must be ignored".

### WR-05: "No shortcut push with the Theia frame focused" assertions can never go red (GATES-02)

**Files modified:** `scripts/lib/pb-live-probe.mjs`, `scripts/verify-nav-keys-live.mjs`
**Commit:** df0e82b
**Applied fix:** `installFireRecorder` (run from `withProbeShell`) adds a chrome-side `command` listener to every `powerbrowser-page-key-*` row and logs each firing. `firedRows` reads the log. That firing is what a leaking row actually does, and it is emitted by the product's own `<key>` element, not by the check.

Changes to the scenarios:
- **theia-keeps-esc, theia-keeps-keys, pill-esc:** each now requires zero firings in place of the push-absence assertion that could never go red. pill-esc had the same pattern, so it was converted too.
- **esc-stop:** now requires that the recorder saw the stop row fire. That is the positive control for the recorder.
- **theia-keeps-esc:** presses Esc before it reads the attribute. The existing plant `row-enabled-under-theia` now goes red on the firing (`["stop"]`), so the Esc half has been shown red for the first time.
- **New plant `rows-enabled-in-editor`:** removes `disabled` from every row just before each editor key press, with no attribute check. It goes red naming `nextTab` on Ctrl+Tab.

### WR-06: The reservation rule is checked in one direction only (GATES-03)

**Files modified:** `scripts/verify-shortcut-relay.mjs`
**Commit:** 1a54610
**Applied fix:** In the mirrored-Firefox-key branch, a row whose upstream key is `reserved="true"` but which is not itself reserved now fails. New self-test plant `newTab unreserved` goes red naming key_newNavigatorTab. Before committing, both gates were run against the same planted tree: the HEAD gate's `check()` returned `[]` and the new gate returned the failure.

### WR-07: theia-keeps-keys' F6 firing check cannot go red (iteration 2)

**Files modified:** `scripts/lib/pb-live-probe.mjs`, `scripts/verify-nav-keys-live.mjs`
**Commit:** 4447528
**Applied fix:** This is option 1 from the review, a test-only recorder. No shipped code changed. `installFireRecorder` adds a bubble-phase chrome `keydown` listener on window. It logs `focusAddressF6` or `focusAddressShiftF6` for each F6 keydown that chrome prevented.

Correction to the review's suggested condition: `e.isReplyEventFromRemoteContent && e.defaultPrevented` can never be true at the point the recorder runs. Chrome's `preventDefault()` calls `StopCrossProcessForwarding` (BasicEvents.h:191-205, 231-235). That clears `mWantReplyFromContentProcess`, so a reply that chrome prevented no longer reads as a reply. A reply chrome has not touched arrives with `defaultPrevented` already true, because BrowserChild prevents it for ESM's F6 consumption (BrowserChild.cpp:2600-2608). The first live run showed both of these. The recorder therefore logs an F6 keydown when all of these hold:
- `defaultPrevented` is true
- `defaultPreventedByContent` is false
- `isReplyEventFromRemoteContent` is false
- `isWaitingReplyFromRemoteContent` is false

That combination means chrome itself prevented the event.

Changes to the scenarios:
- **Positive control:** focus-keys now requires the recorder to log `focusAddressF6` and `focusAddressShiftF6` for the F6 press in the page. A miss fails as `broken instrument:`.
- **New plant `reply-listener-ungated`:** it adds, beside the real listener, a copy of the reply listener with its `tabIdOfBrowser` gate removed. `relayShortcut` is left out because it would refuse with 'no-page', and `PowerBrowserWebTabs` is frozen. The plant goes red on theia-keeps-keys: `F6 in an editor ... fired ["focusAddressF6"]`.
- **Scenario header:** the theia-keeps-keys entry now says what the F6 check reads and names its control.

### IN-25: A hold ended by pointercancel leaves suppressNavClick set (iteration 2)

**Files modified:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`
**Commit:** 79738ce
**Status:** fixed: requires human verification
**Applied fix:** The one-shot clear is now a named `done` handler, registered in the capture phase on window for both `pointerup` and `pointercancel`. Whichever event fires first removes both listeners and clears the flag in a `setTimeout`. The `long-press` scenario still passes. No live scenario drives a pointercancel, so the cancel path has not been checked live.

## Verification

### Iteration 2

All gates ran in the **main checkout** (`workflow.use_worktrees` is `false`). The Theia app was rebuilt after the IN-25 edit with the documented `nix develop .#theia` command. These results can be reproduced from the main checkout.

- `node scripts/verify-nav-keys-live.mjs --scenario page-keys,theia-keeps-keys,focus-keys,long-press`: PASS
- `node scripts/verify-nav-keys-live.mjs --self-test`: PASS. The clean control over every scenario is green, and all 11 planted faults went red, including the new `reply-listener-ungated`.
- `scripts/verify-platform.sh --quick`: PASS
- `node scripts/scan-brand-residue.mjs`: PASS

No PowerBrowser was running beforehand. Every instance was launched by the live harness and had exited by the end.

### Iteration 1

All gates ran in the **main checkout** (`workflow.use_worktrees` is `false`, so no worktree was created). The Theia app was rebuilt after each frontend edit with the documented `nix develop .#theia` command. These results can be reproduced from the main checkout.

- `node scripts/verify-nav-keys-live.mjs --self-test`: PASS. The clean control over every scenario is green (this includes the full run plus the new `close-split` and `focus-keys-debug`), and all 10 planted faults went red, 4 of them new: `guard-disabled`, `close-fallback-removed`, `pill-scope-removed` and `rows-enabled-in-editor`.
- `node scripts/verify-shortcut-relay.mjs --self-test`: PASS. All 15 plants went red.
- `scripts/verify-platform.sh --quick`: PASS.
- `node scripts/scan-brand-residue.mjs`: PASS.

Every PowerBrowser process launched during verification was started by the live harness and had exited by the end. None was running beforehand.

---

_Fixed: 2026-10-21T06:25:38Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
