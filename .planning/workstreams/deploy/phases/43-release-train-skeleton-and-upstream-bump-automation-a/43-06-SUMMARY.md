---
phase: 43-release-train-skeleton-and-upstream-bump-automation-a
plan: 06
status: complete
gap_closure: true
subsystem: infra
tags: [release-train, tracking-issue, live-facts, exactly-one, dry-run]
requirements-completed: []
requirements-advanced: [TRAIN-02, TRAIN-03, TRAIN-09, AUTO-07]
key-files:
  modified: [scripts/release-train.mjs, .github/workflows/release-train.yml, .planning/workstreams/deploy/phases/43-release-train-skeleton-and-upstream-bump-automation-a/BLOCKED.md]
commits: [89ccae4a]
---

# 43-06 summary: live facts collector and exactly-one tracking-issue writer

Gap G-43 (FINISH-PLAN.md section 4 Stage D), first half. Resolves Phase 43 BLOCKED.md item 3
under the owner's 2026-11-03 approval of the read-only facts source (section 2 default).

## What was built

- `derive` job: new step "Collect the live release-train facts (read)". It uses read-only GETs only:
  open `chore/esr-*` PRs with their `verify` check rollup, merged `chore/esr-*` PRs, the merge
  SHA of the pin's bump PR, release.yml runs titled `Release <sha>` (same filter as
  dispatch-release), the newest run's pending deployments and jobs, the Release at the pin's
  release key (404 is none) and the expected asset set from its `release-manifest.json` asset. The
  job gains `pull-requests: read`. Output `facts-b64`.
- `scripts/release-train.mjs`: `verifyCheckOf`, `releaseTrainFacts`, `trackingPlan`,
  `trackingMention`, and the CLI `--tracking-plan`. It plans one issue per release key (the bump
  train and the pin's release train) through `selectTracked`, `derive`, `render` and
  `findExactlyOne`, and returns the writes: create+labels+assign+lock, PATCH on a byte diff,
  label sync, one mention on entering an owner state, close, reopen.
- `report` job: the would-write print is replaced by a find step (read), a plan step (runs in a
  dry run too), a dry-run print, and one write step gated `!inputs.dry-run`.
- Self-test: the duplicate tracking issue and draft Release plants that WR-07 dropped are back,
  plus three new plants (failing verify check, merged PR with the pin unchanged, failed
  channel-live job). Six controls were added. `findExactlyOne` and `classifyRelease` are no
  longer marked UNWIRED.

## Decisions

- The descriptor leg is read from the release run's `channel-live` job conclusion, not from the
  updates host (a code comment names this shortcut): a per-tick `verify-channel-live.mjs` run
  would download the MAR. Drift after that job ran is caught by the daily maintenance channel row.
- Any planner failure (duplicates) writes nothing in that run, for every key.
- Issue authors accepted besides the owner: `app/github-actions`, `github-actions` and
  `github-actions[bot]`. Whether `gh issue list --json author` spells the job-token bot as
  `app/github-actions` has not been checked against a live run.

## Not built (follow-ups)

- The conflict issue (AUTO-07, `renderConflict`) and the uptake-lane issue are still printed,
  not written.
- Supersede facts (`newerTag`, `chemspillOpen`, mark provenance) have no collector (BLOCKED.md item 10).

## Verification

- `node scripts/release-train.mjs --self-test`: PASS, 68 plants red naming their drift, 67 controls green.
- `--only workflows`, `workflows-self-test`, `zizmor`, `release-train-logic-self-test`: PASS.
- The live write step and the plan CLI were run once by hand under a fake `gh`. The update path
  ran edit body, edit labels/assignee and comment. The create path ran create with labels and
  assignee, then lock, then comment.
- `node scripts/generate.mjs` (no generated/ change), then `scripts/verify-platform.sh --quick`:
  only the known reds permission-prompts, permission-prompts-self-test, fixer-isolate-self-test.
