---
phase: 43-release-train-skeleton-and-upstream-bump-automation-a
plan: 03
subsystem: infra
tags: [release-train, tracking-issue, conflict-issue, state-machine, self-test, fixtures]

requires:
  - phase: 43-release-train-skeleton-and-upstream-bump-automation-a
    provides: plan 43-01 five-state table and pure derive/next/render; plan 43-02 stage output from rebase-upstream.yml
provides:
  - scripts/release-train.mjs: derive over the replay split (CONFLICT from a patch-named FAIL, BUMP_RED from any other), render with owner mention only on BUMP_PR_GREEN, findExactlyOne (exactly-one with byte-compare PATCH), renderConflict (tag and patch number title, log and diff excerpts, no patch write), admitWakeRun, classifyRelease, conflictStageReason
  - a self-test with nine planted faults (the five TRAIN-09 faults, a conflict without a patch number, a conflict write under the patch directory, and two set-equality drifts) and four green controls
affects: [43-04 bump-pr publishes the branch the conflict path names, 43-05 owner checkpoint, phase 50 release stages, the live tracking-issue writer (not wired, see BLOCKED.md)]

actuals:
  tokens: 5356
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Exactly-one over a label-and-title find: zero creates, one updates with PATCH only on differing bytes, two or more fail naming every number"
    - "Conflict title built from the patch number parsed from the apply-patches FAIL line, never guessed"
    - "A plant whose correct behaviour is refusal is red when the refusal names its drift; a control whose correct behaviour is success is green"

key-files:
  created: []
  modified:
    - scripts/release-train.mjs
    - scripts/verify-platform.sh

key-decisions:
  - "The CONFLICT split keys on the apply-patches FAIL line, which names the patch (NNN-name.patch did not apply), not on the rebase script's own line that names no patch"
  - "The pin itself is never reported as a candidate (carried over from 43-01)"
  - "Owner mention and assignment take the owner login from the facts passed in by the workflow; the module holds no login literal"
  - "The conflict decision carries an explicit writes array that is always empty; the self-test plants a write under the patch directory and requires it to go red"
  - "The fixture stage text is the real apply-patches line shape, with no patch-directory path, so the module source keeps no patch-directory literal"

patterns-established:
  - "Plants that are refusals are red by naming; plants that are successes are controls and stay green"

requirements-completed: [TRAIN-02, AUTO-07]

metrics:
  duration: "single session"
  completed: "2026-10-31"

status: complete
---

# Phase 43 Plan 03: Tracking-issue protocol and conflict path Summary

**Pure tracking-issue protocol with an exactly-one find, byte-compare PATCH, gate-only owner signals, a conflict issue titled by tag and patch number, and the five TRAIN-09 faults, all green in the release-train row.**

## Performance

- **Tasks:** 3, landed in one commit (`289fc72`) because all three edit the same module
- **Commits:** 1 from this plan. The plan range also contains `da0b7a6`, a concurrent session's fix to the replay step (see Deviations); the measured count is 2
- **Quick gate:** `scripts/verify-platform.sh --quick` exits 0 (462 PASS lines)
- **Self-test:** 14 ok lines, nine planted faults red naming their drift, four controls green

## Accomplishments

- `derive` splits the replay stage. A patch-named FAIL (`FAIL -- <NNN>-<name>.patch did not apply`, or the rebase script's own apply-patches line) derives CONFLICT. Any other FAIL derives BUMP_RED. A merged PR with the pin unchanged derives BUMP_RED naming the pin.
- `conflictPatchNumber` reads the three-digit patch number from the FAIL line. A conflict line that names no number is refused by `conflictStageReason`, so no issue is titled by a guess.
- `render` builds the view with the release key title, one state row, and the snapshot comment that no run reads back. Mention and assignment are set only for BUMP_PR_GREEN, from `ownerLogin` passed in by the workflow.
- `findExactlyOne` implements the exactly-one rule. Zero issues create. One issue updates, and PATCHes only when the stored body differs from the rendered body. Two or more fail, naming every number, with no PATCH.
- `renderConflict` titles the issue `ESR <tag>: patch <NNN> did not apply`, carries the apply log and the upstream diff (each capped at 2000 characters with a truncation marker), assigns the owner, and carries an empty `writes` list.
- `admitWakeRun` refuses a fork-head run by naming the fork repository. `classifyRelease` refuses a draft or prerelease by naming the draft flag.

## Task Commits

1. **Task 1: full derive and next with the replay split** - in `289fc72`
2. **Task 2: tracking-issue protocol with exactly-one and byte-compare PATCH** - in `289fc72`
3. **Task 3: conflict-issue path and the TRAIN-09 plant matrix** - in `289fc72`

## Files Created/Modified

- `scripts/release-train.mjs` - the protocol, conflict path, admission and release classifiers, and the extended self-test
- `scripts/verify-platform.sh` - the release-train row comment names the plant matrix; the row label is unchanged

## Decisions Made

- The conflict title uses the patch number from the apply-patches line. The rebase script's line names no patch, so reading the number there would be a guess.
- `render` reads `ownerLogin` from its facts, so the module holds no login literal and the owner handle lives in the workflow.
- `derive` returns null with no reason. The plan asked for a named reason; the workflow reports idleness through its own step output.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The patch number is on the apply-patches line, not the rebase line**
- **Found during:** Task 3 design, against `scripts/apply-patches.sh:49`
- **Issue:** The stage capture takes the first `FAIL -- ` line of the replay log. That is apply-patches' own line, `FAIL -- <name>.patch did not apply`, which precedes the rebase script's `apply-patches.sh failed replaying` line. The planned regex matched only the rebase form.
- **Fix:** `APPLY_FAIL` matches both forms, and `PATCH_NUMBER` reads the three-digit prefix of the patch name.

**2. [Rule 3 - Blocking] Patch-directory literal in the module**
- **Found during:** Task 1 acceptance check (`grep -c 'patches/'` must be 0)
- **Fix:** The fixture stage text names a patch by its file name only, and the plant builds its path from a constant.

### Scope Notes

- **One commit for three tasks.** The plan split the work into three tasks over one file. The three tasks are not separable without staging intermediate file contents, so they land in `289fc72`.
- **Labels.** `release-train` is declared in `.github/settings/labels.json`. `state/<STATE>` is not. `render` returns both, and the workflow must apply only the declared one until Phase 42 declares the state labels.
- **Live tracking-issue writer not wired.** The `report` job in `release-train.yml` still refuses a live write with a candidate. Wiring it needs live facts, which `derive` does not yet read. BLOCKED.md item 3 records the skipped piece.
- **`derive` returns no reason on null.** The plan asked for a named reason. Not done.

### Concurrent Commit on This Branch

- `da0b7a6 fix(43-02): pipefail on the teed replay step` is authored by the owner and was made by another session on this branch while this plan ran. It sets `set -o pipefail` in the replay step. It is correct: the default `run:` shell on Linux is `bash -e` without pipefail, so my teed replay would have read a failed rebase as success. I did not alter it.

## Known Stubs

- `report` live tracking-issue write: refuses until wired (`release-train.yml`, job `report`; BLOCKED.md item 3).
- `derive` live facts: fixture-backed (`release-train.yml`, job `derive`).

## Assumptions

- `release-train` is the declared label (confirmed in `labels.json`).
- `state/<STATE>` will be declared by Phase 42; until then the workflow does not apply it.

## Self-Check: PASSED

- FOUND: `scripts/release-train.mjs` (modified)
- FOUND: commit `289fc72`
- `node scripts/release-train.mjs --self-test` exits 0 with 14 ok lines
- `grep -c 'patches/' scripts/release-train.mjs` is 0
- `scripts/verify-platform.sh --quick` exits 0
