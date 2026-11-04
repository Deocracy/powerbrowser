---
phase: 41-repository-controls-and-github-apps-a
plan: 06
subsystem: labels
gap_closure: true
status: complete
tags: [GH-13, labels, release-train]
key-files:
  modified:
    - .github/settings/labels.json
    - scripts/verify-labels.mjs
    - scripts/release-train.mjs
commits: [d6ac1216]
---

# 41-06 Summary: state/* labels declared and derived (G-ctl)

`labels.json` now declares `state/<STATE>` for all 19 `ALL_STATES` keys (48 labels total),
one colour, one plain description with no identifier. `release-train.mjs` exports `LABELS`
and its comment no longer says the state labels are undeclared. The labels row imports
`LABELS` and `ALL_STATES` and adds release-train, train:blocked and every state label as
references from `scripts/release-train.mjs`, so the expectation comes from the train.

## Verification

- `node scripts/verify-labels.mjs`: PASS, 25 references.
- `node scripts/verify-labels.mjs --self-test`: PASS, 25 plants red, 2 controls green; new plant
  "a train state label removed from labels.json" red naming scripts/release-train.mjs and
  state/SUPERSEDED.
- `--quick`: green except the known reds. `generate.mjs` changed nothing.

## Owner impact

The 42-04 label apply now creates 19 more labels; `node scripts/apply-repo-controls.mjs`
prints their `gh label create` lines from labels.json, no change to the owner steps.
