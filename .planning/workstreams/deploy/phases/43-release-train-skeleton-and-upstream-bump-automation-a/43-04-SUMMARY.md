---
phase: 43-release-train-skeleton-and-upstream-bump-automation-a
plan: 04
subsystem: infra
tags: [release-train, node-runtime, gpgv, app-token, bump-pr, provenance]

requires:
  - phase: 43-release-train-skeleton-and-upstream-bump-automation-a
    provides: plans 43-01 to 43-03 (detector, state table, reconciler skeleton, tracking protocol)
  - phase: 40-release-identity-esr-pin-and-patch-regeneration-a
    provides: rebase-upstream.yml as the callable replay, node-runtime.json pin, regenerate-patches.sh
provides:
  - Node 24 selection and SHASUMS parsing as pure functions, with index and SHASUMS fixtures in the detector self-test
  - release-train.yml detect job steps that select the Node line, verify its SHASUMS signature with gpgv against release-keys, and assert the tarball sha256 before any PR
  - release-train.yml bump-pr job that publishes chore/node-v24.x and chore/esr-<tag> through the bot App token, dry-run gated
  - docs/BUILD.md and docs/RELEASING.md with the manual gpg provenance step retired
affects: [43-05 owner checkpoint and calendar exit test, the first live bot PR, phase 50 release stages]

actuals:
  tokens: 6184
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "The Node provenance chain runs in the detect job on every bump: signature first, then the tarball hash against the signed entry"
    - "Every bump-pr step gates itself on the bump result or a non-empty output, so a skipped upstream job never publishes"
    - "The App token is scoped to one repository and minted only in the bot environment job"

key-files:
  created: []
  modified:
    - scripts/detect-upstreams.mjs
    - .github/workflows/release-train.yml
    - docs/BUILD.md
    - docs/RELEASING.md

key-decisions:
  - "The Node PR is published first, from the base commit, so the ESR branch never carries the Node edit"
  - "bump-pr replays the candidate itself rather than receiving the bump job's tree: no artifact carries the tree today, and the replay is the gate the publish depends on"
  - "Both branches are recomputed from the base on every run and pushed with --force; they are the job's own branches"
  - "bump-pr runs under always(), so a Node-only run is not skipped with a skipped bump"

patterns-established:
  - "Provenance as a job step with a named failure line: a missing signed entry or a sha mismatch exits 1 with a Next step"

requirements-completed: [AUTO-04, AUTO-06]

metrics:
  duration: "single session"
  completed: "2026-10-31"

status: complete
---

# Phase 43 Plan 04: Bump wiring and Node detector Summary

**Node 24 bumps are verified in the detect job (gpgv against release-keys, tarball sha equal to the signed entry) and published as a chore/node-v24.x PR; ESR bumps replay and publish a chore/esr-<tag> PR through the bot App token; the manual gpg provenance step is retired from the docs.**

## Performance

- **Tasks:** 3, each committed separately
- **Commits:** 3 (`91030bf`, `79feea4`, `024647c`)
- **Quick gate:** `scripts/verify-platform.sh --quick` exits 0 (462 PASS lines)
- **zizmor:** PASS (no findings; the offline audit covers the new steps)
- **workflows:** PASS over 4 workflows, 9 uses lines pinned and admitted
- **workflows-self-test:** 54 ok lines, 45 planted faults, 8 controls
- **detect-upstreams-self-test:** 8 ok lines (baseline, Node baseline, four ESR plants, two Node plants)
- **verify-node-major-agreement and verify-upstream-pins:** PASS

## Accomplishments

- `selectNode24` picks the newest v24 entry that ships linux-x64. `shasumsEntry` reads the sha for one exact filename and skips malformed lines. `decide` returns the ESR and Node decisions with notes. The detector gains `--node-select` and `--node-shasum` for the detect job.
- The detect job selects the Node line from `nodejs.org/dist/index.json`. It fetches `SHASUMS256.txt` and its `.sig`, imports the release-keys `*.asc` files into a private GNUPGHOME, verifies the signature with `gpgv`, and asserts that the downloaded tarball's sha256 equals the signed entry. Each failure exits 1 with a Next step. Dry-run prints the fetch it would make.
- `bump-pr` runs in environment `bot` with `permissions: {}`. It mints the App token in that job only, scoped to `powerbrowser`, with contents and pull-requests write. It checks out without persisting credentials and pushes with an explicit authorization header.
- The Node branch sets `node-runtime.json` (version, url, sha256), runs `verify-node-major-agreement.mjs`, and publishes `chore/node-v24.x`. The ESR branch replays the candidate, moves the pin with a validated tag, runs `generate.mjs`, `verify-release-identity.mjs`, `verify-upstream-pins.mjs` and `regenerate-patches.sh --check`, stages only the manifest, the powerbrowser tree and the patch stack, refuses any staged file under `.github/workflows/`, and publishes `chore/esr-<tag>`.
- Both publish steps open or edit the PR for their branch with the App token. The PR triggers `verify.yml` because the App, not `GITHUB_TOKEN`, opens it.
- `docs/BUILD.md` no longer tells the owner to run `gpg --verify SHASUMS256.txt`. It names the detect job as the provenance step and keeps `package-linux.sh`'s `sha256sum -c` as the build-time enforcement of the pin. `docs/RELEASING.md`'s provenance row and its sha sentence point at the same job.

## Task Commits

1. **Task 1: ESR bump wiring with App-token PR steps** - `79feea4` (in the workflow commit with Task 2, since both edit `release-train.yml`)
2. **Task 2: Node detector pure half and job steps** - `91030bf` (pure half and CLI modes), `79feea4` (job steps and node PR)
3. **Task 3: retire the manual provenance step** - `024647c`

## Files Created/Modified

- `scripts/detect-upstreams.mjs` - Node selection, SHASUMS lookup, decide, the `--node-select` and `--node-shasum` modes, and Node fixtures
- `.github/workflows/release-train.yml` - detect Node steps and the bump-pr publish paths
- `docs/BUILD.md` - provenance paragraph replaced by a pointer to the detector job; two bump references replaced
- `docs/RELEASING.md` - Node provenance row and sha sentence repointed

## Decisions Made

- **Node first, then ESR.** Both branches start from the same base commit, `${{ github.sha }}`, so the Node edit is never in the ESR branch.
- **bump-pr replays again.** The bump job's tree cannot reach bump-pr: `uses:` jobs have no steps, and no artifact carries the tree today. The second replay is the cost of publishing exactly what was gated. A run takes up to 120 minutes.
- **Force-push to own branches.** `chore/esr-*` and `chore/node-v24.x` are recomputed on every run, so `--force` is the correct write. `--force-with-lease` has no tracking ref in a fresh checkout.
- **Scope to one repository.** `repositories: powerbrowser` on the token; zizmor flagged the owner-wide form.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] bump-pr would be skipped on a Node-only run**
- **Found during:** review of the job conditions
- **Issue:** The default job `if` requires every `needs` to succeed. A skipped `bump` skips `bump-pr`, which is the Node-only case.
- **Fix:** `always()` at job level. Each step gates on its own inputs, so nothing publishes without a verified candidate or Node line.
- **Commit:** `79feea4`

**2. [Rule 1 - Bug] ESR publish could push the base commit**
- **Found during:** review of the publish step
- **Issue:** The first draft compared against `origin/main`, which a fresh checkout does not have. An empty replay could then push HEAD, which is the base.
- **Fix:** The publish step compares HEAD with the base SHA and exits 0 with a NOTE when they are equal.
- **Commit:** `79feea4`

**3. [Rule 3 - Blocking] zizmor flagged the owner-wide App token**
- **Found during:** `zizmor` row
- **Fix:** `repositories: powerbrowser`.

### Scope Notes

- **Post-replay checks in bump, not as steps.** The plan asked for `check-patch-surface`, the brand scan, identity and `--quick` as steps after the bump's `workflow_call`. A reusable-workflow job cannot have steps. `rebase-upstream.yml` already runs the surface check, the brand scan and the identity re-check after its replay, and bump-pr re-runs identity, pins and the patch regeneration check after moving the pin. The `--quick` gate over the replayed tree is not run in CI.
- **Node provenance in the detect job.** The plan said to run the Node chain "in-job". It runs in the detect job, which is where the job's outputs come from.
- **Detector CLI modes.** `--node-select` and `--node-shasum` are additions to the 43-01 CLI, the same extension 43-02 made for `--pin` and `--listing`.
- **Stage carrier.** `rebase-upstream.yml` uses `set -o pipefail` in the teed replay step, added by a concurrent session (see 43-03 SUMMARY). The bump does not read the stage output in this plan.
- **Tracking-issue writer.** The `report` job still refuses a live write with a candidate, as in 43-02 (BLOCKED.md item 3).

## Known Stubs

- `report` live tracking-issue write: refuses until wired (`release-train.yml`, job `report`; BLOCKED.md item 3).
- `derive` live facts: fixture-backed (`release-train.yml`, job `derive`).
- Live proof of the App-token path and the gpgv chain: not run here. Both need the owner's App, the `bot` environment, and a real Node release (BLOCKED.md item 2).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: credential | .github/workflows/release-train.yml | `BOT_APP_PRIVATE_KEY` is referenced in the bot environment job. The key is the App's signing material; the job mints a token and never prints it. |
| threat_flag: network | .github/workflows/release-train.yml | detect job clones `nodejs/release-keys` and downloads the Node tarball. Both are verified before use. |

## Assumptions

- The `bot` environment exists (`.github/settings/environment-bot.json`) and the App is installed on `powerbrowser` only.
- `vars.BOT_APP_ID` and `secrets.BOT_APP_PRIVATE_KEY` are created by the owner before a live run.
- `actions/create-github-app-token` at `fee1f7d63c2ff003460e3d139729b119787bc349` is the commit of tag `v2`, resolved read-only through `gh api`. The `v2` input names (`app-id`, `private-key`, `owner`, `repositories`, `permission-*`) are the ones the workflow uses.
- `nodejs/release-keys` keeps its public keys as `keys/*.asc` (observed read-only through `gh api`).

## Self-Check: PASSED

- FOUND: `scripts/detect-upstreams.mjs` (modified), commit `91030bf`
- FOUND: `.github/workflows/release-train.yml` (modified), commit `79feea4`
- FOUND: `docs/BUILD.md` and `docs/RELEASING.md` (modified), commit `024647c`
- `node scripts/detect-upstreams.mjs --self-test` exits 0 with 8 ok lines
- `scripts/verify-platform.sh --quick` exits 0
