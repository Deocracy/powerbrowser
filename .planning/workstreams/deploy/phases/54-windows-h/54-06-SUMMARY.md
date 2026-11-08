---
phase: 54-windows-h
plan: 06
gap_closure: true
gap: G-54b (unsigned Windows publish path never a Linux dependency; win-sign-chain green)
status: partial
requirements: [DIST-10, SEC-03]
key-files:
  modified:
    - scripts/verify-win-sign-chain.mjs
    - scripts/verify-platform.sh
    - .planning/workstreams/deploy/phases/54-windows-h/BLOCKED.md
commits: [fb3aefe9, b5a189a2]
---

# 54-06 summary: independence over every Windows job; the publish mechanism goes to the owner

## Done

- `scripts/verify-win-sign-chain.mjs`, rule `independence`:
  - Windows jobs are every `release.yml` job that uploads or downloads an artifact whose name contains `windows`.
    Today that is `windows-sidecar`, `build-windows` and `sign-windows`.
  - The Linux path is every other job that moves a `linux` artifact, plus `sign-publish` and every job after it.
    Today that is `build-linux`, `sign-publish`, `purge-artifacts`, `descriptor` and `channel-live`.
  - Any Windows job among a Linux job's transitive needs is red, naming both.
  - The rule used to name only `sign-windows`, so the new `windows-sidecar` job and `build-windows` were unguarded.
- New green control: a `publish-windows` job that needs `build-windows` and `sign-publish` and that no Linux job
  needs. That is the shape every option in BLOCKED.md item 10 uses.
- Six new plants, each red naming job and cause:
  - descriptor needs build-windows
  - channel-live needs windows-sidecar
  - build-linux needs windows-sidecar
  - sign-publish reaches build-windows through a job that moves no artifact
  - descriptor needs a new publish-windows
  - the sign job moves no Windows artifact (vacuity)
- The self-test now reports 3 controls and 39 plants.
- `BLOCKED.md` item 10 holds the publish-mechanism decision, with options (a), (b) and (c), the recommendation and
  the proposed Windows asset names.

## Not done, and why

The publish, descriptor and channel-live jobs for Windows are not written. `docs/RELEASING.md`, "Immutable releases
consequence", says an asset cannot be added to a published immutable Release. `sign-publish` publishes once, with
every asset in the draft. So "Windows assets joined to the Release" (R2) and "never a dependency of the Linux path"
(R2, "Linux ships alone") cannot both hold. Building one variant (about 300 lines of workflow plus three widened
rows) before the owner picks would be wasted if the pick differs. The owner question is in item 10. The follow-up is
gap plan 54-07 for the chosen option.

## Verification

- `node scripts/verify-win-sign-chain.mjs --self-test`: PASS (3 controls, 39 plants).
- `node scripts/verify-win-sign-chain.mjs`: every structural rule green. The only failure is the pre-existing
  `[vacuity]` fetch of the unpublished `https://powerbrowser.org/download.html` (full tier, network). It was the same
  before this change.
- `node scripts/generate.mjs` made no generated/ change. `--quick` is green except `fixer-isolate-self-test`, a
  known sandbox red.
