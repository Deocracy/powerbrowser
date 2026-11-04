---
phase: 51-dependency-flow-and-train-supersede-f
plan: 05
subsystem: dependency-flow
status: complete
gap_closure: true
tags: [renovate, theia, auto-02, g-51]
requires:
  - 48-03 (maintenance sweep tick)
  - 51-01 (.github/renovate.json5, renovate-config row)
provides:
  - release-train.yml job renovate-theia and dispatch input renovate-theia
  - sweep-clock output theia-due, from release-train.mjs theiaDue / --theia-due
  - renovatebot/github-action@* admission in actions-selected.json
  - workflows rule renovate-job (hook allow-list equals renovate.json5 postUpgradeTasks.commands)
key-files:
  modified:
    - .github/workflows/release-train.yml
    - .github/settings/actions-selected.json
    - scripts/release-train.mjs
    - scripts/verify-workflows.mjs
    - scripts/verify-renovate-config.mjs
decisions:
  - "Pin: renovatebot/github-action v46.3.12 = 1c0cf989c02653fba0efe7ca5772338860ca71dc (lightweight tag on a commit, read-only gh 2026-11-03); input names token and renovate-version checked against its action.yml. renovate-version 44.198.3, the version the config was validated with, instead of the action's floating default '44'."
  - "Tick: the first accepted sweep after the most recent last Thursday of a month. An unknown last sweep leaves it due (the sweepDue fail-safe; a repeated Renovate run is idempotent)."
  - "RENOVATE_ONBOARDING false and RENOVATE_REQUIRE_CONFIG required, so a missing config cannot open an onboarding PR; RENOVATE_GIT_AUTHOR is the release-train bot address the bump jobs commit as."
  - "No runner-side yarn install: the action runs Renovate in its own container on its own clone, so nothing in the job workspace reaches the hook. Recorded as BLOCKED.md item 18 with options."
metrics:
  completed: 2026-11-03
actuals:
  tasks: 2
  commits: 3
plan_head_before: d775b00f
---

# Phase 51 Plan 05: the renovate-theia job (G-51) Summary

The Theia inflow job that 51-01 withheld is now in `release-train.yml`. Plan 48-03 landed the sweep, so the premise is met.

## What was built

- `renovate-theia` job: `needs: [derive, sweep-clock]`, job-level `!inputs.dry-run`, not on `reason=fix`, runs when
  `inputs.renovate-theia` is true or `sweep-clock` reports `theia-due=true`. Its steps are checkout (`persist-credentials: false`),
  `node scripts/verify-renovate-config.mjs`, the bot App token (contents and pull-requests write), and Renovate with
  `RENOVATE_PLATFORM`, `RENOVATE_REPOSITORIES`, and `RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS`. The token and Renovate steps are
  gated on dry-run.
- `derive` validates `renovate-theia` as `true|false`.
- `theiaDue` and `--theia-due` in `scripts/release-train.mjs`, with a self-test control covering the Thursday, the Friday after it,
  a second sweep, a missed Friday, the November boundary, an unknown last sweep, and the CLI.
- The `workflows` rule `renovate-job` has 7 plants: allow-list dropped, a command dropped, an extra catch-all, an unanchored
  entry, a non-JSON value, a third config command, and a config with no commands array. Two existing controls that replace
  `release-train.yml` with a fixture now set the Renovate admission aside.

## Verification

- `node scripts/verify-workflows.mjs --self-test`: PASS, 215 plants red, 11 controls green.
- `node scripts/release-train.mjs --self-test`: PASS.
- `scripts/verify-platform.sh --quick`: the only red is `fixer-isolate-self-test` (known, no `/tmp/.X11-unix` in the sandbox).

## Open (owner, live)

- BLOCKED.md item 1 step 4: apply the admission (`node scripts/apply-repo-controls.mjs --yes` after 41-04) and read it back.
- BLOCKED.md item 3: the first dispatch and review, merged with `gh pr merge <PR> --merge`.
- BLOCKED.md item 18: the licensing hook cannot run inside Renovate's container clone (no `upstream/`). Owner picks an option.

## Self-Check: PASSED
