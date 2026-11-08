---
phase: 30-address-bar-modes-and-command-centre
plan: 01
subsystem: ui
tags: [theia, chrome-bar, address-bar, inversify, refactor, verification]
status: complete

requires:
  - phase: 29-address-bar-search-and-fixup
    provides: the address pill, its rows module and the Phase 29 gate and live suite
provides:
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx (injectable AddressBar: attach, render, onCurrentWidgetChanged, syncAddressFromWidget, goHome)
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-rows.ts (moved byte-identical)
  - recursive chrome-bar scans with nested-file plants in verify-chrome-bar-suggestions and verify-web-tab-bridge
  - address-bar sources in the copy gate and the command-id gate
  - live probes and plants re-pointed to get('AddressBar')
affects: [30-02, 30-03, 30-04, 30-05, 30-06]

tech-stack:
  added: []
  patterns:
    - "A plain injectable rendered by a host ReactWidget through attach(host); moved code keeps this.update() through a delegator to host.update()"

key-files:
  created:
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
  modified:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-rows.ts (renamed, 100%)
    - scripts/verify-chrome-bar-suggestions.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-chrome-bar-commands.mjs
    - scripts/verify-address-bar-rows.mjs
    - scripts/verify-address-bar-live.mjs
    - scripts/verify-nav-keys-live.mjs
    - scripts/verify-web-tab-live.mjs
    - powerbrowser/INTERNAL-APIS.md

key-decisions:
  - "Stateless helpers both halves use (userPreference, joinActiveGroup, onDropTargetDragOver/Leave, droppedUrlOf, DropTargetDragEvent) live in address-bar.tsx; the widget calls them through this.addressBar instead of duplicating them or importing back into the widget (no import cycle)"
  - "AddressBar keeps the moved this.update() calls verbatim through a protected update() that calls host.update(); renderNow stays a synchronous MessageLoop.sendMessage(host, UpdateRequest)"
  - "ChromeBarContribution injects AddressBar for the resize repositionDropdown call; the shortcut relay's Home row injects AddressBar, so chrome-bar-shortcuts no longer imports the widget"

requirements-completed: [SMODE-01]

duration: ~2h across two sessions (one crash)
completed: 2026-10-22

actuals:
  tokens: 54000
  tasks: 3
  commits: 3
plan_head_before: ae63acb62b00e60330d59159779f6f5fa6daa24e
plan_head_after: 15c8c2940cc7d94a9f2398980c363e749f4d94da
---

# Phase 30 Plan 01: Address pill moved into address-bar/ Summary

The address pill (state, query, commit, keys, dropdown, one-offs, drafts, paste menu, drop handlers, Home path) now lives in the injectable `AddressBar` in `address-bar/address-bar.tsx`, rendered by `ChromeBarWidget` in the same slot. There is no behaviour change, and every Phase 29 gate, live scenario and plant reads and faults the moved code.

## What was done

- **Task 1 (a8e5581):** `verify-chrome-bar-suggestions.mjs` and `verify-web-tab-bridge.mjs` now scan the chrome-bar sources recursively, with nested-file plants (`nested/planted.tsx` committing `row.uri`, and `nested/planted.ts` calling `.readClipboardText(`). Each plant goes red and names its file. The `row.uri` key-feed check now applies to every chrome-bar source, not only the routing file. The copy gate derives widget copy from the widget plus `address-bar/*.tsx`, with a planted nested literal. The command-id gate holds every address-bar source to the rule against re-spelled ids, with a planted nested case. Each gate prints how many sources it read.
- **Task 2 (1ba359e, tracer):** `git mv` moved the rows module (rename 100%). A Python relocation script, which asserted every boundary line, moved the pill members verbatim. `onCurrentWidgetChanged` split in two: the widget keeps the state subscription and the reload guard, and `AddressBar.onCurrentWidgetChanged` takes the draft and address half. `bind(AddressBar).toSelf().inSingletonScope()` sits beside the widget bind. The same commit re-pointed four gates: rows `MODULE_REL`, the suggestions routing file, the sanctioned privileged caller, and the copy gate's brand plant. Widget: 2619 lines before, 1073 after; address-bar.tsx: 1648 lines.
- **Task 3 (15c8c29):** all 21 pill probes and plants in `verify-address-bar-live.mjs` now resolve `get('AddressBar')`. `verify-nav-keys-live.mjs` moves its `addressScope` probe to `AddressBar` and keeps the `reloadGuardUntil` probe on the widget. `verify-web-tab-live.mjs` derives the contribution class and `onDidChangeCurrent` from the widget file, and the `closeDropdown` owner class, the debounce and the dropdown class from `address-bar.tsx`. INTERNAL-APIS.md now names `address-bar/address-bar.tsx` in place, with the line count unchanged at 201.

## Source counts each Task 1 gate read (before move → after move)

| Gate | Before | After |
|------|--------|-------|
| verify-chrome-bar-suggestions (chrome-bar sources) | 13 | 14 |
| verify-web-tab-bridge (sources) | 32 | 33 |
| verify-shell-error-copy (widget-copy sources) | 1 | 2 |
| verify-chrome-bar-commands (call-site sources) | 2 | 4 |

## Verification

- `scripts/verify-platform.sh --quick`: PASS after every task. Final run: "all checks passed".
- `tsc --noEmit -p theia/extensions/chrome-bar`: clean. The Theia build (chrome-bar `tsc -b` plus the app's `theia build --mode development`) finished with 0 errors.
- `check-internals-boundary.sh` and `--catalogue`: PASS. `verify-ng-040-internals-catalogue-lines.mjs`: PASS. PowerBrowserAPI.sys.mjs was not edited.
- `verify-address-bar-live.mjs`: all 18 Phase 29 scenarios PASS.
- Tracer gate: before Task 3, the five scenarios search, rows, suggestions, one-off and drafts gave 2 PASS and 3 broken-instrument FAIL, because the probes still resolved `ChromeBarWidget`. After the re-point, all 5 PASS.
- `verify-address-bar-live.mjs --self-test`:
  - First run: all 14 plants applied and went red, but the clean control failed once on context-menu ("after Paste & Go chrome's focus must be in the tab's page; it is on undefined"). This is the known Phase 27 remoteness defect recorded in 29 deferred-items.md.
  - One re-run, as the standing rule allows: PASS, with the clean control green and all 14 planted faults red.
- `verify-nav-keys-live.mjs`: 31 scenarios PASS. `--self-test`: PASS with all 11 plants red, including `pill-scope-removed` on the re-pointed `AddressBar`.
- `verify-web-tab-live.mjs`: PASS. `--self-test`: PASS with all 12 plants red, including `dropdown-rearms` on `AddressBar.prototype.closeDropdown`.

## Deviations from Plan

1. **[Rule 3 - Blocking] Tracer verify ordering.** Task 2's `<automated>` live run (five scenarios) cannot pass before Task 3 re-points the probes, because the probes reach `get('ChromeBarWidget')`. Task 2 was committed with its static gates green and the product scenarios (search, suggestions) PASS. The tracer verify was then re-run end to end after the Task 3 re-point, and all 5 passed before the full suite ran. No product code changed between those runs.
2. **[Rule 2 - Critical] Stronger key-feed check.** The `row.uri` key-feed check in `verify-chrome-bar-suggestions.mjs` now covers every chrome-bar source. Without that, the required nested plant could not go red.
3. **[Rule 1 - Bug] Bridge self-test mutation detector.** The self-test's "did the plant modify a source" test only compared keys present in the clean tree, so a plant that adds a new file looked like a no-op. It now compares the union of keys.
4. **Discretion: placement of shared stateless helpers.** `userPreference`, `joinActiveGroup`, the drop-target handlers and `droppedUrlOf` moved to `AddressBar`, and the widget calls them through `this.addressBar`. The plan's default was "stays in the widget unless it reads pill state". Keeping them in the widget would have needed either duplicate code or `address-bar.tsx` importing back from the widget, which is a runtime import cycle.
5. **Copy gate brand plant re-targeted.** The plant "configured name in a JSX text node" moved its anchor (the dropdown footer) to `address-bar.tsx` in the Task 2 commit.
6. **No full `yarn build`.** The Theia rebuild used the narrower command the orchestrator gave (chrome-bar `tsc -b`, then the app's `theia build`). Task 3 changed no frontend source, so the Task 2 build served Task 3's live runs. The bundle mtime was checked against the source mtimes.

**Total deviations:** 3 auto-fixed (Rules 1-3), 3 discretionary or procedural. **Impact:** none on behaviour.

## Known Stubs

None. Moved code only.

## Risks for later plans

- `AddressBar.render()` returns a fragment (pill div plus portal). `publishDragRegions` reads `.pb-chrome-bar` children, so a new top-level element added inside the fragment (such as the 30-02 mode button) must go inside the pill div, or it becomes a drag-region item.
- The verbatim move kept stale doc comments in the widget's class header ("address pill with suggestions"). They are harmless but now describe the composition, not the owner.
- Live self-tests take more than 10 minutes. The context-menu Paste & Go focus flake can hit the clean control, and the standing rule allows one re-run.
- The live probes now depend on the class name `AddressBar` (`__getByName`). Renaming it breaks all 21 probes and 2 plants.

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
- FOUND: theia/extensions/chrome-bar/src/browser/address-bar/address-bar-rows.ts
- FOUND: a8e5581, 1ba359e, 15c8c29 (ancestors of HEAD)
