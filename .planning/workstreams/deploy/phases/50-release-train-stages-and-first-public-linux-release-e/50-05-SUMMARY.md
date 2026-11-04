---
phase: 50-release-train-stages-and-first-public-linux-release-e
plan: 05
subsystem: release-pipeline
status: complete
gap_closure: true
tags: [release, withdraw, probe, rel-02, g-50]
requires:
  - 50-03 Task 2 (scripts/verify-channel-live.mjs --withdrawn)
provides:
  - docs/withdraw.yml (withdraw workflow for powerbrowser-updates)
  - docs/release-probe.yml (immutable-release probe workflow for powerbrowser-updates)
  - docs/RELEASING.md withdraw runbook, probe procedure, verdict line (pending)
  - scripts/verify-withdraw.mjs, rows withdraw and withdraw-self-test (--quick)
key-files:
  created:
    - docs/withdraw.yml
    - docs/release-probe.yml
    - scripts/verify-withdraw.mjs
  modified:
    - docs/RELEASING.md
    - scripts/verify-descriptor-monotonic.mjs
    - scripts/verify-platform.sh
decisions:
  - "The probe creates probe-1 as a draft and then publishes it (make_latest false). Immutability applies only to a published Release, so a draft-only probe would test nothing."
  - "Both marking branches append the <!-- release-withdrawn --> block, the mark release-train.mjs derives WITHDRAWN from. The flag verdict also sets prerelease=true. pending marks by the notes alone."
  - "withdraw.yml reads the verdict from docs/RELEASING.md at the withdrawn tag. Zero lines, two lines, or a value outside pending/flag/notes-only stop the job before any write."
  - "Both files are staged in docs/ (the docs/watchdog.yml precedent) and derive the product repository from their own <product>-updates name, so they carry no owner literal."
  - "verify-descriptor-monotonic ignores Releases whose tag is not a release key. Without that, the published probe-1 Release (no manifest) would fail the descriptor job of the first release."
metrics:
  completed: 2026-11-03
actuals:
  tasks: 3
  commits: 4
plan_head_before: c17390ad1e7afac59a68b3b032e6ae0e7501cf70
---

# Phase 50 Plan 05: withdraw.yml and the immutable-release probe (G-50) Summary

This plan carries 50-03 Task 1 into code and builds the probe that R13 needs. Plan 50-03 stays
open: its Task 3 (the live probe run) is an owner step, listed in BLOCKED.md item 6.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| plan | 99eacb55 | 50-05-PLAN.md |
| 1 | 2cb03dfb | docs/withdraw.yml, docs/release-probe.yml, RELEASING.md runbook and verdict line |
| 2 | a2e9b914 | descriptor-monotonic ignores non-release-key tags, with a probe-1 control |
| 3 | b0b9e148 | scripts/verify-withdraw.mjs, two quick rows; the jq `false // "absent"` fix in release-probe.yml |

## What withdraw.yml does

It runs only on `workflow_dispatch`, with two inputs: `tag` and `reason`. Its steps, in order:

1. Validate the inputs and derive the product repository.
2. Check out the product repository at the tag.
3. Read `build_target` and `update_channel` from the Release's `release-manifest.json` asset, and read the verdict line.
4. Mint the bot App token (updates and product repositories, contents write only).
5. Write the no-update document to each `<channel>/<target>/update.xml`, with the message `Withdraw <tag>: no-update descriptors (<reason>)`. Then re-read every path and set-compare the blob ids.
6. Append the withdrawal block once. Set the pre-release flag only on the `flag` verdict.
7. Run `verify-channel-live.mjs --withdrawn "$TAG"` up to ten times, 60 s apart.

The workflow never deletes anything.

## Results

- `node scripts/verify-withdraw.mjs`: PASS.
- `node scripts/verify-withdraw.mjs --self-test`: PASS. The control is green first and all 28 plants go red; it takes about 7 s.
- `node scripts/verify-descriptor-monotonic.mjs --self-test`: PASS, including the new probe-1 control.
- `scripts/verify-platform.sh --quick`: the only red is the known `fixer-isolate-self-test` (the sandbox has no /tmp/.X11-unix). `withdraw` and `withdraw-self-test` PASS.
- `node scripts/scan-brand-residue.mjs` after staging: PASS. The owner commands derive the repository with `gh repo view`, so the held-back `Deocracy/powerbrowser` count is unchanged.
- `node scripts/generate.mjs`: no change under generated/.

## Deviations

1. **Bug found by the new row.** In docs/release-probe.yml, `jq '.immutable // "absent"'` treated `false` as missing, so a non-immutable probe Release did not fail the probe. Fixed in b0b9e148.
2. **Monotonic filter (Task 2).** Not in 50-03. It is needed because the probe must publish a Release that carries no manifest.
3. **Self-test scope.** Each plant runs only the check family and scenario that catch it, which cut the self-test from 96 s to 7 s. The control still runs everything.

## Owner steps (BLOCKED.md item 6)

1. Set `BOT_APP_CLIENT_ID` and `BOT_APP_PRIVATE_KEY` in powerbrowser-updates.
2. Land both files in powerbrowser-updates.
3. Dispatch `release-probe.yml`.
4. Reply with the five `release-probe:` lines. Claude then records the verdict.

## Self-Check: PASSED

- All four commits are on main (`git log --oneline -5`).
- `git -C upstream diff` was not touched; no upstream/ or objdir path was changed.
