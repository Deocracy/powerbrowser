---
phase: 43-release-train-skeleton-and-upstream-bump-automation-a
plan: 02
subsystem: infra
tags: [release-train, github-actions, reconciler, dry-run, trust-rules, zizmor]

requires:
  - phase: 43-release-train-skeleton-and-upstream-bump-automation-a
    provides: plan 43-01 detector (--listing, --pin added here) and the five-state table
  - phase: 40-release-identity-esr-pin-and-patch-regeneration-a
    provides: rebase-upstream.yml as the callable replay, the pin in configuration.toml
provides:
  - .github/workflows/release-train.yml: dispatch-started reconciler with five jobs (derive, detect, bump, bump-pr, report), one concurrency group, dry-run threaded through every write path
  - dry-run-gate rule in the workflows row, with 45 planted faults and 8 green controls
  - rebase-upstream.yml outputs.stage, the stage name the train reads to tell a patch conflict from a red gate
affects: [43-03 tracking issue and conflict path, 43-04 bump-pr App-token path and Node detector, 43-05 owner checkpoint, phase 50 release stages]

actuals:
  tokens: 6471
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Every dispatched value passes through env: and a shape check before any step acts"
    - "Write steps carry inputs.dry-run in their if:; the dry-run branch prints the would-write"
    - "Plants on a real workflow are structural edits (yaml load, mutate, dump), never text anchors"

key-files:
  created:
    - .github/workflows/release-train.yml
    - .planning/workstreams/deploy/phases/43-release-train-skeleton-and-upstream-bump-automation-a/BLOCKED.md
  modified:
    - .github/workflows/rebase-upstream.yml
    - scripts/verify-workflows.mjs
    - scripts/detect-upstreams.mjs

key-decisions:
  - "The workflow_run wake is held out of release-train.yml: zizmor's dangerous-triggers audit flags it and the repo forbids suppressing a finding to go green. The owner decides (BLOCKED.md)"
  - "The train starts from workflow_dispatch only; the hourly clock is the start, as the phase goal states"
  - "bump runs in a dry run too: the replay is read-only outside the runner, so a dry run still proves the replay"
  - "report declares only issues: write, with no checkout, because it writes nothing and reads no file"
  - "bump-pr and report refuse the live path until plans 43-04 and 43-03 wire the writes, so no run reports green while it has opened nothing"

patterns-established:
  - "Dry-run gate as a static trust rule: a write step without inputs.dry-run in its if: goes red naming file, job and step"
  - "Structural plants over the real file: yaml.load, mutate one path, yaml.dump, then require a named red"

requirements-completed: [TRAIN-01, TRAIN-08, AUTO-06]

metrics:
  duration: "single session"
  completed: "2026-10-31"

status: complete
---

# Phase 43 Plan 02: Release train reconciler skeleton Summary

**Dispatch-started reconciler skeleton with five least-privilege jobs, dry-run threaded through every write path and enforced by a new trust rule, and a stage output the train reads from the replay.**

## Performance

- **Tasks:** 3, each committed separately
- **Commits:** 3 (`2686369`, `48bcce4`, `b1916eb`)
- **Quick gate:** `scripts/verify-platform.sh --quick` exits 0 (462 PASS lines, unchanged row count)
- **zizmor:** PASS on all four workflows, after the workflow_run trigger was held out (see Deviations)
- **workflows:** PASS over 4 workflows, rules enforced include `dry-run-gate`
- **workflows-self-test:** 54 ok lines (1 baseline, 45 planted faults, 8 controls)
- **verify-upstream-pins and its self-test:** PASS on the edited replay workflow

## Accomplishments

- `release-train.yml` parses, has one concurrency group `release-train` with no cancel and no queue, top-level `permissions: {}`, and exactly the five jobs. Dispatch inputs are `reason`, `dry-run`, `release` and `tag`.
- `derive` validates the reason against tick, owner and self, rejects any tag containing `_BUILD` or failing the `*esr_RELEASE` shape, and shape-checks the release key. It then runs the train and detector self-tests before anything acts.
- `detect` reads the pin through `detect-upstreams.mjs --pin`, lists upstream ESR tags under the pinned major, reads the product-details advisory value, and decides through `--listing`. Each live fetch is skipped in a dry run, and the dry-run branch prints what it would fetch.
- `bump` calls `rebase-upstream.yml` through `workflow_call` with the candidate tag. It holds no secret and has `contents: read`.
- `bump-pr` runs in environment `bot` with `permissions: {}`. Its dry-run path prints the branch and PR it would write. Its live path refuses to act until plan 43-04.
- `report` holds the only `issues: write` in the file. Its dry-run path prints the tracking issue it would write. Its live path refuses to act with a candidate until plan 43-03.
- The workflows row gained `dry-run-gate`. It goes red on any write step (git push, gh api POST/PATCH/PUT/DELETE, gh pr create/merge/comment/edit, gh issue create/comment/edit/close/lock/reopen, gh workflow run, dispatches, or an App-token mint) without `inputs.dry-run` in its `if:`.
- `rebase-upstream.yml` gained one `workflow_call` output, `stage`. It is the first FAIL line the replay printed, or `replayed` on success.

## Task Commits

1. **Task 1: release-train.yml skeleton and the detector CLI modes** - `2686369` (feat)
2. **Task 2: dry-run-gate rule with structural plants** - `48bcce4` (feat)
3. **Task 3: outputs.stage on rebase-upstream** - `b1916eb` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] zizmor dangerous-triggers on the workflow_run trigger**
- **Found during:** Task 1, the `zizmor` row
- **Issue:** zizmor flags any `workflow_run` trigger as dangerous. The row fails on exit 14, and the row's own text forbids suppressing a finding to make it green.
- **Fix:** The trigger is held out of the file. The guards stay in every job, and the train starts from dispatch only, as the phase goal states. The owner decides whether to re-add the trigger with a reviewed suppression. Full detail and the one-line change are in `BLOCKED.md`.
- **Commit:** `2686369`

**2. [Rule 3 - Blocking] YAML plain scalars with colon-space**
- **Found during:** Task 1, first parse of the workflow
- **Issue:** Three single-line `run: echo "...: ..."` steps are invalid YAML.
- **Fix:** Converted to block scalars.

**3. [Rule 2 - Missing critical] Refusal on the live PR and tracking-issue paths**
- **Found during:** Task 1 design
- **Issue:** Plans 43-03 and 43-04 wire the writes, but until they land a live run would report green with nothing written.
- **Fix:** Live `bump-pr` and `report` steps exit 1 with a Next step naming the plan.

### Scope Notes

- **Detector CLI modes.** The detect job needs `--pin` and `--listing <file> [--firefox-esr <value>]`, which the 43-01 spec did not include. Unknown arguments still exit 2. The pure core is unchanged.
- **Stage carrier edit.** Plan 43-02 Task 3 asked for the output block only. The `stage` output needs the FAIL line from the replay, which exists only in the step's log. The replay step therefore pipes through `tee` to `$RUNNER_TEMP/rebase.log`. Its command, its tag input and its Nix wrapping are otherwise unchanged. The `verify-upstream-pins` sweep still passes.
- **No artifact upload.** Plan 43-02 named a `{diff, apply log, stage}` artifact. It is not uploaded in this plan. The stage line carries the FAIL text the conflict path needs. The diff and log upload is left for plan 43-03, where the conflict issue body needs it.
- **Live facts deferred.** `derive` validates inputs and runs the fixture self-tests. It does not yet read open PRs, check runs or the Release list. The plan describes this as fixture-backed now, with live facts in a later plan.

## Known Stubs

- `bump-pr` live path: refuses until plan 43-04 (`release-train.yml`, job `bump-pr`).
- `report` live tracking-issue write: refuses until plan 43-03 (`release-train.yml`, job `report`).
- `derive` live facts: fixture-backed; no open-PR, check-run or Release lookup yet (`release-train.yml`, job `derive`).

## Assumptions

- `.github/settings/labels.json` declares `release-train` (confirmed). It does not yet declare `state/<STATE>`; plan 43-03 must not apply those labels until Phase 42 declares them.
- The `bot` environment exists (`.github/settings/environment-bot.json`). Its secrets are not verified here.

## Self-Check: PASSED

- FOUND: `.github/workflows/release-train.yml`
- FOUND: `.github/workflows/rebase-upstream.yml` (edited)
- FOUND: `scripts/verify-workflows.mjs` (edited)
- FOUND: `BLOCKED.md`
- FOUND: commits `2686369`, `48bcce4`, `b1916eb`
- `scripts/verify-platform.sh --quick` exits 0
