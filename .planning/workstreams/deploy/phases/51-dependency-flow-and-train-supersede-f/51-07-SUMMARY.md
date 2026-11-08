---
phase: 51-dependency-flow-and-train-supersede-f
plan: 07
subsystem: planning
status: complete
gap_closure: true
tags: [rulings, auto-02, train-04]
requires:
  - 51-05
  - 51-06
provides:
  - AUTO-02, TRAIN-04 and ROADMAP Phase 51 criteria 1 and 3 amended
  - BLOCKED.md resolutions (items 1, 5, 6, 7, 8, 10, 12) and item 18
  - docs/RELEASING.md Theia inflow runbook
key-files:
  modified:
    - .planning/workstreams/deploy/REQUIREMENTS.md
    - .planning/workstreams/deploy/ROADMAP.md
    - .planning/workstreams/deploy/phases/51-dependency-flow-and-train-supersede-f/BLOCKED.md
    - .planning/workstreams/deploy/phases/51-dependency-flow-and-train-supersede-f/51-01-PLAN.md
    - .github/renovate.json5
    - docs/RELEASING.md
decisions:
  - "AUTO-02: the clause 'flake.lock updates through the nix manager' is removed; the sentence Stage C added (the Theia PR does not move flake.lock) is the requirement."
  - "TRAIN-04: 'the sign job exits' becomes 'fails closed'; release.yml is unchanged (BLOCKED item 7 option a)."
  - "TRAIN-04 live half: dated deferral 2026-11-03 in BLOCKED items 8 and 10; the requirement closes on the release-train-logic-self-test fixtures at the end pass. No box is ticked here."
  - "Renovate merges: gh pr merge --merge in BLOCKED item 3, 51-01-PLAN.md and RELEASING.md."
metrics:
  completed: 2026-11-03
actuals:
  tasks: 1
  commits: 2
plan_head_before: cf4e9d83
---

# Phase 51 Plan 07: the Phase 51 owner rulings Summary

The four Phase 51 rulings from FINISH-PLAN section 2 are now written into the requirement, roadmap, BLOCKED and runbook text that
still stated the old positions. The ESR calendar pointer ruling (stays in RENEWALS) needed no edit.

## Verification

- `grep 'flake.lock. updates through the nix manager' REQUIREMENTS.md`: no match.
- No `--squash` Renovate merge command is left in the phase 51 directory or in `docs/`.
- `scripts/verify-platform.sh --quick`: the only red is `fixer-isolate-self-test` (known).

## Self-Check: PASSED
