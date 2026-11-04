---
phase: 41-repository-controls-and-github-apps-a
plan: 07
subsystem: channels
gap_closure: true
status: complete
tags: [DIST-11, R6, homebrew]
key-files:
  modified:
    - .github/workflows/channel-manifests.yml
    - scripts/lib/channel-workflow-rules.mjs
    - docs/RELEASING.md
    - .planning/workstreams/deploy/phases/56-package-channels-j/BLOCKED.md
commits: [a5b4ccc5]
---

# 41-07 Summary: tap repository name homebrew-tap (G-ctl)

`homebrew-powerbrowser` became `homebrew-tap` in channel-manifests.yml (App token
`repositories:` and the tap checkout, lines 286 and 297), in the channel workflow rules
(`APP_TOKEN['tap-commit']` and the tap-job needle), in docs/RELEASING.md item 8, and in the
Phase 56 BLOCKED.md items 10 and 13. Those docs now say the repository exists and the cask
is deferred to v1.7 (R6). `git grep homebrew-powerbrowser -- ':!.planning'` is empty.

## Verification

- `--quick`: green except the known reds; workflows, zizmor, homebrew-cask,
  channel-release-jobs and their self-tests PASS; scan-brand-residue PASS.

## Deviations

- Two sites outside the plan's two named lines also carried the old name and were changed:
  scripts/lib/channel-workflow-rules.mjs:46,264 (the rule asserting the name) and
  docs/RELEASING.md:2321.
- A first draft wrote the organisation name into docs/RELEASING.md and the brand scan went red;
  the organisation name was removed.
- 56-05-SUMMARY.md:129 still says "confirm Deocracy/homebrew-powerbrowser exists". It is a
  historical record and was not edited; BLOCKED.md is the owner's source.
