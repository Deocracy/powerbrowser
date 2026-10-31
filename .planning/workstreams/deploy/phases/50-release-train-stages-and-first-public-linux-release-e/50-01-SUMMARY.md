---
phase: 50-release-train-stages-and-first-public-linux-release-e
plan: 01
subsystem: release-train
status: complete
requirements: [TRAIN-10, REL-02, GH-15, UPD-16, REL-03]
tags: [release-train, state-table, dispatch, sha-gate, live-facts-deferred]
dependency_graph:
  requires:
    - Phase 43 release train (release-train.mjs five Phase-A states, release-train.yml)
    - Phase 49 release pipeline (release.yml build-linux, sign-publish, descriptor, channel-live)
  provides:
    - eight release-stage states in the train state table, derived from normalised release facts
    - dispatch-release job (release.yml dispatch at the merge SHA, exact run by head_sha equality)
    - release SHA gate proof (scratch-repository executor of the shipped gate text)
  affects:
    - scripts/release-train.mjs, .github/workflows/release-train.yml, .github/workflows/release.yml
    - scripts/verify-platform.sh (two rows), docs/RELEASING.md
key_files:
  created:
    - scripts/verify-release-sha-gate.mjs
  modified:
    - scripts/release-train.mjs
    - .github/workflows/release-train.yml
    - .github/workflows/release.yml
    - scripts/verify-platform.sh
    - docs/RELEASING.md
decisions:
  - "Dispatch token: GITHUB_TOKEN with actions: write on the dispatch-release job alone (bot App has no Actions scope; a clock App would add a second credential for one call)"
  - "Dispatched input stays sha (the input release.yml declares; release-shape pins it), not merge_sha"
  - "WITHDRAWN is evaluated first among release states (the mark is authoritative); DONE is returned only when the tracking issue is already closed"
  - "The SHA gate proof runs the shipped gate text from release.yml against scratch git repositories; it is not a JavaScript copy of the gate"
metrics:
  tasks: 3
  commits: 3
  duration: "single session"
  completed: 2026-10-31
actuals:
  tokens: 12569
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 69659b44
plan_head_after: 28dd4260
---

# Phase 50 Plan 01: Release train stages, dispatch, and the SHA gate Summary

Eight release-stage states derived from normalised GitHub facts, a dispatch of release.yml at the
merge SHA with exact-run linking, and the release SHA gate proven by executing its shipped text.
The live facts collector and the tracking-issue writer are not wired (BLOCKED.md item 3).

## Commits

- `1723a899` feat(50-01): TRAIN-10 release-stage states in the train state table
- `dd4976d6` feat(50-01): dispatch release.yml at the merge SHA and link the exact run
- `28dd4260` feat(50-01): SHA gate messages name the tip and the next step; gate row

## Task results

**Task 1, state table (TRAIN-10).** `scripts/release-train.mjs` gains BUILDING, AWAITING_APPROVAL,
PUBLISHED, DESCRIPTOR_WAIT, DESCRIPTOR_LIVE, LIVE_RED, WITHDRAWN and DONE with derivation, `next()`
actions and `render()` output. The Phase-A rows are untouched. `releaseFactsFromLive()` normalises
the live response shapes (runs filtered by `head_sha` equality and `event`, pending deployments,
the descriptor job, the Release, base64 descriptor contents, the channel-live conclusion, the
issue state). `render()` emits `Release run (<html_url>) SHA <mergeSHA>` for the run whose head_sha
equals the merge SHA. Self-test: 13 states set-equal to 13 fixtures; 14 planted faults go red naming
their drift; 11 controls stay green. The self-test covers a drifted descriptor under a green
channel-live (red naming `byte-equal`), a removed fixture (red naming the state), a newer run at
another SHA (never linked), the notes-marker and prerelease-flag withdrawal shapes, and a
double-advance fact set that derives one state.

**Task 2, dispatch (TRAIN-10 dispatch sentence).** `release-train.yml` gains `dispatch-release`,
which reads the newest merged PR for `chore/esr-<pin>`, counts the release.yml runs already at that
SHA, and POSTs the dispatch only when the count is zero and the run is live. The run is then polled
for up to five minutes, taking the newest run whose `head_sha` equals the merge SHA. The dry run
prints the would-dispatch line and posts nothing. `report` prints the release SHA and run link.
`verify-workflows` (and its self-test) and zizmor are green.

**Task 3, SHA gate (TRAIN-10 third sentence, SEC-10).** `release.yml`'s SHA gate was already
landed as "Validate the release SHA" in both build-linux and sign-publish. Its refusals now name
the SHA, the tip and the next step. The new `scripts/verify-release-sha-gate.mjs` reads the
shipped gate step with js-yaml and executes that text against scratch repositories with a local
bare origin. The default mode checks that both jobs carry identical gate text and runs two
controls (tip; configuration.toml ancestor with main's workflows). `--self-test` plants a side
commit not on main, an ancestor that does not change configuration.toml, an ancestor whose
`.github/workflows/` diverges from the tip, and a HEAD that is not the requested SHA. Each
must go red naming its drift and a next step. Rows: `release-sha-gate`, `release-sha-gate-self-test`.

## Correction after code review (CR-01, run correlation)

The run correlation recorded above ("exact run by `head_sha` equality") was wrong for a
`workflow_dispatch` run: its `head_sha` is the tip of the dispatched ref (main), not `inputs.sha`,
so the train would have re-dispatched every tick and never linked its run once main advanced past
the merge SHA. The plan's key link (`collectFacts polls runs?head_sha={mergeSHA}`) was carried
through unchallenged. Fixed before plan 50-04: `release.yml` sets `run-name: Release ${{ inputs.sha }}`
(pinned by the `release-shape` row), and both the workflow steps and `releaseFactsFromLive` identify
the run by that display title plus the `workflow_dispatch` event, the `release.yml` path and this
repository as head repository. The `dispatch-release` rows execute the shipped steps with main
advanced past the merge SHA; the release-train fixtures now carry `head_sha` = main's tip.

## Landed-skeleton deltas (plan assumed unlanded; code as it is now)

- **Input name.** The plan's `merge_sha` input does not exist. release.yml declares `sha`, the
  release-shape row pins `inputs.sha`, and sign-publish reads it. The dispatch passes `sha`.
- **SHA gate.** Already landed in both legion-facing and hosted jobs, so Task 3 edited messages and
  added the executor row instead of inserting a new step. The gate is after the 40-hex check and
  the checkout, which is required because it needs history.
- **release.yml publish path.** Still ends in `r2_gate` (fail closed until plan 49-05); the
  descriptor and channel-live jobs are still fail-closed placeholders. The release-stage derivation
  treats a published Release without these steps as PUBLISHED.
- **Train read path.** `derive` takes fixture facts; the live collector is not built. The
  decision on the live facts source is BLOCKED.md item 3 (Phase 43, still open). The release-stage
  states are derived from normalised live shapes in fixtures only.
- **Bump PR reads.** The dispatch reads merged PRs by head branch, not the open-PR list used by
  detect; a merged PR is the trigger, which the open-PR list cannot see.
- **Self-test home for the SHA plants.** The plan put the SHA plants in
  `release-train-logic-self-test`. The gate text lives in release.yml (bash), so its plants run
  against scratch git repositories in their own row. The release-train row keeps no git and no
  network.

## Shortcuts and limits (recorded)

- shortcut: the release states have no live collector and no tracking-issue writer; the run link is
  printed to the job summary, not into the issue body, upgrade when BLOCKED.md item 3 is approved.
- shortcut: a completed failing release.yml run with no Release derives no state (idle), so a
  failed build is visible in the run only; upgrade when a FAILED state is added in a later plan.
- The WITHDRAWN rule is the mark alone (prerelease flag or notes marker). The plan's
  "and descriptors are no-update" conjunct is not applied, because a marked Release must never fall
  through to a live state.
- The release-stage fixtures use fixture SHA and URL literals (`1` and `2` repeated, example.invalid).

## Verification

- Baseline: `scripts/verify-platform.sh --quick` exit 0, "all checks passed", before the first commit.
- After each task: `--quick` exit 0 (Task 1, Task 2, Task 3 runs all reported
  `verify-platform: PASS -- all checks passed`).
- `release-train-logic-self-test`: PASS (13 states set-equal to 13 fixtures; 14 plants; 11 controls).
- `workflows`, `workflows-self-test`, `zizmor`, `release-shape`, `release-shape-self-test`: PASS.
- `release-sha-gate`, `release-sha-gate-self-test`: PASS (2 controls; 4 plants).
- `node scripts/scan-brand-residue.mjs`: PASS on each staged set before commit.
- The live dispatch observation (the first real bump merge) is the owner gate in plan 50-04.

## Self-Check: PASSED

- Commits 1723a899, dd4976d6 and 28dd4260 exist on dsh/phase-50 after 69659b44.
- Created file scripts/verify-release-sha-gate.mjs is in commit 28dd4260.
