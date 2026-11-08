---
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
plan: 01
subsystem: chrome-bar, shell keys, web-tab channel
tags: [gecko-keyset, page-focus, webTabStop, onPush, react, bidi-live, tracer]
status: complete

requires:
  - phase: 14.1 (GUI-02)
    provides: web-tab overlays, PowerBrowserGroup actor channel, chrome bar Reload button
provides:
  - "End-of-file web-tab action section in PowerBrowserAPI.sys.mjs (WEB_TAB_ACTION_KINDS, handleWebTabAction, sendWebTabPush, tabIdOfBrowser, export PowerBrowserWebTabs)"
  - "PAGE_KEYS page-scoped key rows (created disabled) and the chrome focus tracker in powerbrowser.js"
  - "WebTabChannel.onPush router, widgetOf, WebTabWidget.stop, webTabStop kind"
  - "chrome-bar-shortcuts.ts: PAGE_SHORTCUTS table and ChromeBarShortcutRelay (shortcut + pageFocus pushes, powerbrowser.webPageFocused context key)"
  - "Single Reload/Stop element in the chrome bar"
  - "scripts/lib/pb-live-probe.mjs live harness and scripts/verify-nav-keys-live.mjs (esc-stop, theia-keeps-esc, stop-button, --self-test)"
  - "Registry rows chrome-bar-typecheck (--quick), nav-keys-live, nav-keys-live-self-test (full run)"
affects: [27-02, 27-03, 27-04, 27-05, 27-06, 27-07, 27-08, later v1.5 phases using the push channel]

actuals:
  tokens: 15494
  tasks: 3
  commits: 3
plan_head_before: 24a7ba0f463479f8f32bdefc0aa3bd4152f44045
plan_head_after: 505bd3dba5988efb70ea71d56a468c8d658ea75c

tech-stack:
  added: []
  patterns:
    - "Second frozen export from the boundary file (PowerBrowserWebTabs) for powerbrowser.js; new kinds routed by one receiveMessage line to an end-of-file handler"
    - "Page-scoped <key> rows: created disabled, enabled only while chrome's active element is an overlay"
    - "Frontend push subscription by kind through WebTabChannel.onPush"
    - "Live key synthesis at the parent through nsITextInputProcessor in a chrome-scope BiDi evaluate"

key-files:
  created:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
    - scripts/lib/pb-live-probe.mjs
    - scripts/verify-nav-keys-live.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/powerbrowser.js
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-platform.sh

key-decisions:
  - "Live keys are driven through nsITextInputProcessor in a chrome-scope evaluate (Assumptions A3/A4 held: the TIP route was accepted on every run; the BiDi chrome-context fallback never ran)"
  - "The blur-deferred focus tracker holds (A1): focusing an overlay enables the stop row and focusing the Theia frame disables it again, both proven live"
  - "pushPageFocus dedupes per Theia frame <browser> element through a WeakMap"
  - "The pre-existing reserved accel+L row and the diagnostics chord are unchanged in this plan (Ctrl+L moves to the page-scoped mechanism in a later plan)"

patterns-established:
  - "verify-nav-keys-live scenario shape: one session, ordered scenarios, PASS/FAIL lines, NOT SCORED when the positive control failed, plants scored on their target scenario only"

requirements-completed: [NAV-01, KEY-04]

coverage:
  - id: D1
    description: "Esc with a loading page focused stops it through key row -> shortcut push -> relay -> webTabStop -> browser.stop()"
    requirement: NAV-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario esc-stop"
        status: pass
  - id: D2
    description: "With the Theia frame focused the stop row is disabled and Esc produces no shortcut push"
    requirement: KEY-04
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario theia-keeps-esc"
        status: pass
  - id: D3
    description: "Reload is one element that shows Stop (close glyph) while loading, stops on click, returns to Reload on the same node; disabled on the empty page"
    requirement: NAV-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario stop-button"
        status: pass
      - kind: other
        ref: "node scripts/verify-shell-error-copy.mjs --self-test (Stop pinned, braced-ternary plant)"
        status: pass
  - id: D4
    description: "Live check discriminates: three planted faults each go red on their target scenario"
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --self-test"
        status: pass

duration: 13min
completed: 2026-10-20
---

# Phase 27 Plan 01: Esc stops a loading page, and Reload becomes Stop Summary

**A page-scoped chrome `<key>` row for Esc relays a `shortcut` push to the Theia frame. There the new `onPush` router and the one shortcut table send `webTabStop` back to chrome, which calls the overlay's `stop()`. The chrome bar's Reload button is the same React node showing Stop while the pushed `loading` flag is true.**

## Performance

- **Duration:** about 13 min
- **Started:** 2026-10-20T22:34:25Z
- **Completed:** 2026-10-20T22:47:16Z
- **Tasks:** 3
- **Files modified:** 11 (3 created)

## Accomplishments

- Tracer chain proven on the first commit, live: Esc in a focused, loading page produced `{kind:'shortcut', id:'stop', tabId}` and then a `loading: false` state push.
- KEY-04 holds by construction for the new mechanism: with the Theia frame focused, the row carries `disabled` and Esc produces no push. That is measured after a positive control in the same session.
- NAV-01 button: a single `<button>` flips between Reload and Stop, and the live check confirms node identity across the flip by an expando on the DOM node.
- The live harness (`pb-live-probe.mjs`) is reusable for the later Phase 27 plans. It provides purge-cache launch, a push recorder, chrome-scope focus and row reads, parent-level key synthesis, and slow served pages with header capture.

## Task Commits

1. **Task 1: Esc inside a loading page stops it, end to end** - `5cd5772` (feat), tracer gate re-ran `<verify>` green before expanding
2. **Task 2: Reload turns into Stop on the same element** - `f94bc96` (feat)
3. **Task 3: Register the live check and the chrome-bar typecheck; live self-test** - `505bd3d` (test)

## Assumptions resolved (requested by the plan's output section)

- **A3/A4 (key route):** the `nsITextInputProcessor` route in a chrome-scope `script.evaluate` worked on every run (`esc-stop: keys: tip`). `Cc`/`Ci` were reachable in the shell document's realm. The BiDi chrome-context fallback is in the harness but did not run.
- **A1 (focus tracker):** the capture-phase `focus` listener plus the one-microtask-deferred `blur` listener held in both directions. `overlay.focus()` cleared `disabled` on the stop row, and focusing the Theia frame `<browser>` set it again.

## Verification run

- `scripts/verify-platform.sh --quick`: PASS (after each task; includes the new `chrome-bar-typecheck` row).
- `node scripts/verify-nav-keys-live.mjs`: `esc-stop: PASS`, `theia-keeps-esc: PASS`, `stop-button: PASS`, plus a `purgecaches: MOZ_PURGE_CACHES=1` line.
- `node scripts/verify-nav-keys-live.mjs --self-test`: PASS. The clean control is green, and `second-stop-element`, `row-enabled-under-theia` and `relay-row-removed` each go red naming the expected text.
- `scripts/verify-platform.sh --only gui02-web-tab-live`: PASS (the `onPush` router replaced the old state ladder without regressing it).
- `verify-web-tab-bridge` (+ self-test), `check-internals-boundary` (+ `--catalogue`), `ng-040-internals-catalogue-lines`, `verify-shell-error-copy` (+ self-test), `verify-chrome-bar-commands`, `scan-brand-residue`: PASS.

## Deviations from Plan

- **Theia build command:** I used the plan's `nix develop .#theia --command bash -c 'cd theia && yarn build'`, about 17 s. It builds every extension and then the app. The bundle was confirmed to contain the relay's context key before the live run.
- **`pb-live-probe.mjs` imports only `./pb-relaunch.mjs`:** `./firefox-bidi.mjs` was allowed but not needed, because `withShell` already wraps it.
- **Self-test session composition:** each plant session runs its target scenario plus that scenario's prerequisite. `row-enabled-under-theia` runs `esc-stop` then `theia-keeps-esc`, because the latter is scored only after its positive control. The plants are still scored only on their target scenario.

None of these changes behaviour the plan specified. No Rule 1-4 deviation was needed.

## Known Stubs

None.

## Issues Encountered

- One self-inflicted fault while adding the self-test: `escStop` did not destructure `plant`, so the first run reported `esc-stop: FAIL -- harness: plant is not defined`. I fixed the signature and reran. The clean control and all three plants then behaved as required. That defect was in the check, not the product.

## Notes for later Phase 27 plans

- `profile-storage.ts` still keeps its own `WEB_TAB_STATE_EVENT` listener for `flushShellState`. RESEARCH moves it onto `channel.onPush`, but this plan's file list did not include it.
- `onDidRequestFocusAddress` is kept and is now fed by `onPush('focusAddress', ...)`.
- The 650 ms post-Stop guard is plan 27-04's (Task 2), not this plan's.
- KEY-04 is marked complete per the plan's frontmatter. Later plans add more page rows under the same disabled-while-Theia-focused rule, and each of those rows must keep it.

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts, scripts/lib/pb-live-probe.mjs, scripts/verify-nav-keys-live.mjs
- FOUND commits: 5cd5772, f94bc96, 505bd3d (ancestors of HEAD)
