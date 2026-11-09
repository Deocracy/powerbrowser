---
phase: 59-carry-forward-from-v1-5-and-v1-6
plan: 03
subsystem: testing
tags: [verify-platform, live-harness, chrome-bar, flake]
requires: []
provides:
  - Fixes for WINDOWS 27, 34, 36, 37, 38, 39, 40, 41, 42, 43 (10 of 11)
  - WINDOWS 28 not reproduced, so no fix; recorded under Remaining for the coordinator
affects: [59-04 merge, 59-06 headed proofs]
actuals:
  tasks: 10 of 11 fixed (Task 7 / WINDOWS 28 remaining)
  commits: 9 fix commits + this summary
key-files:
  created: []
  modified:
    - scripts/verify-customize-inert.mjs
    - scripts/verify-platform.sh
    - theia/extensions/chrome-bar/src/browser/side-panel-top-tabs.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - scripts/verify-nav-keys-live.mjs
    - scripts/verify-pan04-undo-close-group-live.mjs
    - scripts/verify-site-identity-live.mjs
    - scripts/verify-ng-023-suggestions-places.mjs
    - scripts/verify-prompts-live.mjs
    - scripts/verify-ng-067-frontend-errors.mjs
    - scripts/verify-page-furniture-live.mjs
key-decisions:
  - "37, 38, 40: harness drift, not product defects (the probes predate e6a2a279, b9bdc702 and phase 33's menu shape)"
  - "No file outside files_modified was touched; no hand-off is needed for a file owned by 59-01 or 59-02"
---

# 59-03 Summary: v1.5 close-out defects (lane p59-03)

Ten of the eleven WINDOWS entries have a fix commit. WINDOWS 28 never reproduced in six runs, so it has no
fix and is listed under Remaining. All live runs used this lane's Theia build. Rows 37, 27, 40, 38, 42 and 43
used the dev binary `/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/objdir/dist/bin/powerbrowser`.
Rows 28 and 39 used main's binary with main's patch-050/060 stamps, copied per the lane brief after `cmp`
showed the patches equal. The dev objdir has no stamps. The lane-local objdir was removed before the gates.

## Closes

| id | fix commit | lane proof | coordinator proof command | status |
|----|-----------|------------|---------------------------|--------|
| 27 | ea7201fc | `scripts/verify-platform.sh --only nav-keys-live` PASS (non-real-input scenarios). Real-input leg not provable in lane (drives the display) | `PB_REAL_INPUT=1 PB_LIVE_HEADED=1 node scripts/verify-nav-keys-live.mjs --scenario long-press` (59-06, sandbox off) | fixed, headed proof pending |
| 28 | none | `node scripts/verify-page-tools-live.mjs --scenario crash-navigate` PASS 5 of 5 alone; `scripts/verify-platform.sh --only page-tools-live` PASS 1 of 1 (241 s, crash-navigate PASS) | `scripts/verify-platform.sh --only page-tools-live` three times | remaining (not reproduced; see Remaining) |
| 34 | dde3d2c6 | `scripts/verify-platform.sh --only verify-customize-inert` PASS 2 of 2 | `scripts/verify-platform.sh --only verify-customize-inert` | fixed |
| 36 | dde3d2c6 | not provable in lane: start_shell hardcodes `$REPO_ROOT/objdir`; one smoke PASS through a temporary objdir symlink (Failed step = creating the settings folder) | `scripts/verify-platform.sh --only start-failure-shows-error` | fixed, coordinator proof pending |
| 37 | 6c13d3a9 | `scripts/verify-platform.sh --only pan04-undo-close-group-live` PASS | same | fixed |
| 38 | 17d36026 | `scripts/verify-platform.sh --only ng-023-suggestions-history-bookmarks` PASS | same | fixed |
| 39 | 863edd46 | `scripts/verify-platform.sh --only prompts-live-self-test` PASS 3 of 3; allow-loads-frame-url red on 'Allow opened a frame-supplied URL' each run | same, three times | fixed |
| 40 | 266a8243 | `--only site-identity-live` PASS; `--only site-identity-live-self-test` PASS (clean control green, 10 of 10 plants red) | `scripts/verify-platform.sh --only site-identity-live && scripts/verify-platform.sh --only site-identity-live-self-test` | fixed |
| 41 | 8a3b6e76 | `bash scripts/diff-theia-core.sh` PASS; `scripts/verify-platform.sh --only first-boot-surface-fresh` PASS (0 boot errors) | `scripts/verify-platform.sh --only first-boot-surface-fresh` | fixed |
| 42 | 4773189f | `scripts/verify-platform.sh --only ng067-frontend-errors-reach-telemetry` PASS 3 of 3 executed (runs 1, 3, 5; runs 2 and 4 never started: `timeout 900` expired in the lock wait, empty log) | same, three times | fixed |
| 43 | 457680cf | `scripts/verify-platform.sh --only page-furniture-live-self-test` PASS 3 of 3 (clean control green, 34 of 34 plants red) | same, three times | fixed |

## Causes, one line each

- 27: Lumino's Menu focuses itself on open, but a real release on the pill moved focus to the pill, so a real Escape missed the menu. After the hold's release, the menu is re-activated if focus left it. realLongPress now fails on that case instead of noting it.
- 34, 36: the harnesses planted under `$XDG_CONFIG_HOME/powerbrowser`, while `_resolveConfigDir` reads `<profile>/powerbrowser-theia`. Both now plant in the launch profile, and the product resolver is unchanged.
- 37: New Group sits in the Organising toolbar, a shell top-panel row (e6a2a279), not inside `org.node`. The probe now re-resolves it from the live widget and asserts exactly one button exists. There is no second widget instance, so this is not a product finding.
- 38: the launch URL loads in a stock tab, and since b9bdc702 (29 WR-06) an open-tab row is kept only for a shell web tab with a page. The check now opens the address through WebTabOpenHandler, polls for its `source: 'tab'` row, and fails if the address comes back as another source. The ranking assertion is unchanged.
- 39: the Allow leg read the tab order a second time after its poll. A planted openLinkIn tab passes through about:blank, so the second read could miss `/e`. The order is now the poll's own snapshot. This cause is inferred: the pre-fix failure was not reproduced in the lane.
- 40: phase 33 drift. In Organising, Downloads, Print, Save Page and Find in Page dim because their commands are `isEnabled: () => !!currentWebTab()` (MENU-03). The expectation now derives those rows from APP_MENU_COMMANDS and chrome-bar-commands.ts and throws on an isEnabled shape it cannot read. Help became a submenu, so the check clicks its Get Help leaf.
- 41: the top side-panel row ran the stock rail overflow pass, which reads `.theia-additional-views-menu`, an element PB's header never places. The fix overrides this in the PB SideTabBar subclass, and Theia core is untouched.
- 42: the at-error wait counted uncaught-error entries for the whole session (`>= 2`), and the at-off throw was one of them. One other frontend error could therefore end the wait before the at-error throw was queued. The wait now reads only entries after a mark taken at the throw, and the 10 s budget is unchanged. This cause is inferred: the logged list printed in the five runs showed no extra error, so the flake did not recur.
- 43: the bounded clipboard poll was already in place. The read now waits for the image menu to close, which proves the coordinate click ran the command, and a missed click fails with its own text. This cause is not isolated: no failure occurred in the runs made.

## Remaining

| id | last repro output | cause so far |
|----|-------------------|--------------|
| 28 | No failure in this lane. `crash-navigate` alone: PASS 5 of 5 (about 10 s each). Full `page-tools-live` row: PASS 1 of 1, 241 s. Original: 'a URL sent to a crashed tab did not load it (no loaded push with crashed false)', 1 of 3 registry runs on 2026-11-06 | Not isolated. Reading rules out the listener race the plan suggested: `crashNavigate` takes its push mark before sending the URL, and waits for the exact push (`crashed === false && loading === false && url ends /article`) with 30 s. The remaining candidate is the product's overlay-recreate path under registry load, which this lane could not trigger. Suggested gap closure: run the full registry several times with the push log dumped on failure. |

## Hand-offs

None. No fix needed PowerBrowserAPI.sys.mjs, INTERNAL-APIS.md, docs/RELEASING.md or any file of 59-01 or 59-02.

## Ledger note for the coordinator

The lane edited two ledger-locked test files that this plan lists in files_modified:
`scripts/verify-ng-023-suggestions-places.mjs` (WINDOWS 38) and `scripts/verify-ng-067-frontend-errors.mjs`
(WINDOWS 42). The ledger stop gate reports their hashes as changed. The lane may not edit the ledger, so the
coordinator must review and re-lock both at merge. The other edited harnesses were not flagged.

## Static gates (lane tree, objdir stamps removed)

- `node scripts/scan-brand-residue.mjs`: exit 0
- `bash scripts/diff-theia-core.sh` (inside `nix develop .#theia`): PASS, zero changes inside @theia/*
- `scripts/verify-platform.sh --quick`: exit 0
- `git diff --stat ServerDestroyer/v1.7-Orca-integration...HEAD`: 11 files, all in this plan's files_modified. None belongs to 59-01 or 59-02, and STATE.md, ROADMAP.md and WINDOWS.md are untouched.

## Merge note for the coordinator

Run `yarn build` in `nix develop .#theia` after the merge, because 27 and 41 change chrome-bar sources. Close
an id with `gsd_run windows fixed <id>` only after its coordinator proof is green on the merged tree. Leave 28
open.
