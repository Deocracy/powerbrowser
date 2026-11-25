---
phase: 60-orca-from-source-on-theia-s-node
plan: 04
subsystem: infra
tags: [orca, licence, brand-scan, inventory, verify-platform]
status: complete

requires:
  - phase: 60-03
    provides: "every Orca-mentioning file of 60-01..60-03 committed, so the brand counts are taken from the final tree"
provides:
  - "inventory/licence-allowlist.json: orca (MIT, Lovecast Inc.) and upstream (MPL-2.0) rows with LICENSE digests; allowed_spdx [MIT, MPL-2.0]"
  - "scripts/verify-licence-allowlist.mjs: derived tree set from scripts/fetch-*.sh, six-plant --self-test"
  - "quick rows licence-allowlist and licence-allowlist-self-test"
  - "inventory/brand-tokens.json scope.tracked_residue_probes [orca] and eleven Orca coincidental rows"
  - "scripts/scan-brand-residue.mjs: allProbes(), scan() probes option, scanExtraRoot(), three self-test cases"
affects: [60-05, 68]

actuals:
  tokens: 10750
  tasks: 2
  commits: 2
plan_head_before: b517d1ecbd606f4768565e67e36851648190aeca
plan_head_after: 1b0021f411fb73668d6d402b4c3533cce332e0d6

tech-stack:
  added: []
  patterns:
    - "A probe list scoped to the tracked tree (tracked_residue_probes) for a third-party name that is legitimately everywhere in Gecko; the extra-root pass keeps the brand probes only"
    - "Coincidental row counts emitted from the scanner's own claims over the staged tree, never estimated"

key-files:
  created:
    - inventory/licence-allowlist.json
    - scripts/verify-licence-allowlist.mjs
  modified:
    - inventory/brand-tokens.json
    - scripts/scan-brand-residue.mjs
    - scripts/verify-platform.sh

key-decisions:
  - "The orca probe is tracked-tree only (scope.tracked_residue_probes); the --extra-root pass calls scanExtraRoot(), which probes with residue_probes (sourcerer, deocracy) and nothing else"
  - "Orca rows: one per case form (Orca, orca, ORCA, orcad, ORCAD) plus literal rows only for in-word joins the boundary matcher rejects; ErrorCapture and ErrorCalls are claimed as NOT-Orca substring hits"
  - "The licence allow-list covers each fetched tree's root licence; the per-package SPDX scan of orca/ (including the mobile/ Expo / React Native closure from P60-R3/P60-R4 and the agent SDK's SEE LICENSE IN README.md) is recorded in the orca row's licence_surface_note and left to Phase 68"

requirements-completed: [OVL-04]

metrics:
  duration: 15min
  completed: 2026-11-09
---

# Phase 60 Plan 04: Licence allow-list and strict Orca brand probe Summary

**inventory/licence-allowlist.json with a derived quick check (tree set from scripts/fetch-*.sh, LICENSE sha256 per tree, SPDX refusal of NONE/UNLICENSED/SEE LICENSE), and a tracked-tree-only orca probe in the brand scan with eleven exact-count coincidental rows, green over the tracked tree and over upstream/.**

## Performance

- Tasks: 2 of 2
- Files: 2 created, 3 modified
- Brand scan: 688 tracked files; with `--extra-root upstream`, plus 461493 files, 52.8 s

## Accomplishments

- Licence allow-list (P60-R1). Two rows: `orca` (MIT, Lovecast Inc., pinned by `upstreams.orca_tag`/`orca_commit`, LICENSE sha256 `ff1b611f...`) and `upstream` (MPL-2.0, root LICENSE is the pointer to toolkit/content/license.html, sha256 `a799adf1...`). The Claude Code extension is not a row: PowerBrowser does not redistribute it and no fetch script materialises it.
- `licence-allowlist` derives the fetched-tree set from `git ls-files scripts/fetch-*.sh` and compares it with the rows both ways; an absent tree is a SKIP of that row only. Self-test: clean control and an absent-tree SKIP, then six plants each red naming the drift (altered LICENSE, GPL-3.0-only, SEE LICENSE IN README.md, NONE in allowed_spdx, an unrowed scripts/fetch-extra.sh, a row whose fetch script does not exist).
- Strict orca probe (P60-R2). `scope.tracked_residue_probes: ["orca"]` feeds condition 4 of the tracked scan only. A stray `Orca planted` in a scratch tracked file failed condition 4 naming `zz-orca-plant.txt:1`; one extra `Orca` in docs/BUILD.md failed the `Orca` title row (expected 93, observed 94). Both plants were removed.
- `--extra-root upstream` stays green: `scanExtraRoot()` is the one call main() makes, and it probes with `residue_probes` only.
- Three scan self-test cases on fixture inventories: (a) a claimed Orca is green and an unclaimed one in b.txt fails naming `b.txt:1` and probe "orca"; (b) expected_count 2 over one occurrence is red naming the row; (c) the extra-root scan raises no orca hit over "Orca screen reader" and ErrorCallback (the tracked scan raises 2 there), while a planted `Sourcerers` in the same fixture is still red.

## Orca rows (inventory/brand-tokens.json)

All `class: coincidental`, `target` equal to `token`, `expected_files` equal to `only_in`, reason cites file:line and P60-R2. Counts measured by the scanner over the staged tree.

| Token | Case form | Files | expected_count |
|-------|-----------|-------|----------------|
| `Orca` | title | 19 | 93 |
| `orca` | lower | 20 | 420 |
| `ORCA` | upper | 13 | 100 |
| `orcad` | lower | 12 | 179 |
| `ORCAD` | upper | 2 | 9 |
| `Orcad` | literal | 4 | 11 |
| `installedOrcaPaths` | literal | 2 | 5 |
| `\borca` | literal | 1 | 1 |
| `\norca_` | literal | 1 | 2 |
| `ErrorCapture` | literal | 3 | 10 |
| `ErrorCalls` | literal | 1 | 3 |

Total claimed: 833, which equals the unclaimed-probe count before the rows were added.

## Task Commits

1. **Task 1: licence allow-list, derived check, two quick rows** - `c7bb728a` (feat)
2. **Task 2: strict orca probe, eleven rows, three scan self-test cases** - `1b0021f4` (feat)

## Files Created/Modified

- [/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/inventory/licence-allowlist.json](inventory/licence-allowlist.json) - the allow-list
- [/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/scripts/verify-licence-allowlist.mjs](scripts/verify-licence-allowlist.mjs) - the derived check and self-test
- [/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/scripts/verify-platform.sh](scripts/verify-platform.sh) - two quick rows after orca-slotless-start-self-test
- [/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/inventory/brand-tokens.json](inventory/brand-tokens.json) - tracked_residue_probes and eleven Orca rows
- [/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/scripts/scan-brand-residue.mjs](scripts/scan-brand-residue.mjs) - allProbes, scan probes option, scanExtraRoot, header and extra-root comments, three self-test cases

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Self-test fixture digest re-pinned itself**
- **Found during:** Task 1
- **Issue:** the fixture row computed the LICENSE digest on every call, so the altered-licence plant would have re-pinned the altered text, and the absent-tree case threw ENOENT.
- **Fix:** digest computed once before the plants. The altered-licence plant now names `alpha/LICENSE sha256` rather than any message containing the tree name.
- **Commit:** c7bb728a

**2. [Rule 1 - Acceptance] Licence note named the SDK package**
- **Found during:** Task 1
- **Issue:** the acceptance check `trees.some(t => /claude/i.test(...))` was true because the mobile-closure note named the agent SDK package by its npm name.
- **Fix:** reworded to "the Anthropic agent SDK dependency".
- **Commit:** c7bb728a

**3. Row set beyond the plan's list**
- The plan named Orca/orca/ORCA/orcad plus the ErrorCapture/ErrorCalls literals. The scan also needed `ORCAD` (upper, ORCAD_*_FILENAME and ORCAD_ENV_NAMES) and four literal rows for in-word joins: `Orcad` (startOrcad, stopOrcad, probeOrcad, serveWithOrcad, stageOrcadMobileWebBundle), `installedOrcaPaths`, `\borca` (a regex in verify-orca-pin.mjs:203) and `\norca_` (a TOML fixture string in verify-orca-pin.mjs:253). The plan allows literal rows for camelCase joins.

## Known Stubs

None.

## Maintenance this plan introduces

Any change that adds or removes Orca text in a scanned file must update the matching `expected_count` in inventory/brand-tokens.json; a new file with Orca text must be added to the matching row's `only_in` and `expected_files`. 60-05 adds no scanned file. Phase 59 files that mention Orca (systemd/legion-pb.nix, .claude/hooks/ledger-session-check.py) are counted as they stand at 1b0021f4.

## Verification

- `scripts/verify-platform.sh --only` licence-allowlist, licence-allowlist-self-test, scan-brand-residue, scan-brand-residue-self-test: PASS
- `node scripts/scan-brand-residue.mjs --extra-root upstream`: exit 0
- `git ls-files -- orca`: empty
- `scripts/verify-platform.sh --quick`: PASS, all 338 checks

## Self-Check: PASSED

- FOUND inventory/licence-allowlist.json, scripts/verify-licence-allowlist.mjs
- FOUND commits c7bb728a, 1b0021f4 (ancestors of HEAD)
