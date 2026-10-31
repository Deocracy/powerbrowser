---
phase: 50-release-train-stages-and-first-public-linux-release-e
reviewed: 2026-10-31T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - .github/workflows/release-train.yml
  - .github/workflows/release.yml
  - scripts/release-train.mjs
  - scripts/verify-release-sha-gate.mjs
  - scripts/verify-mar-update-hop.mjs
  - scripts/verify-platform.sh
  - scripts/verify-update-download-host.mjs
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Phase 50: Code Review Report

**Reviewed:** 2026-10-31
**Depth:** standard (range 69659b44..HEAD on dsh/phase-50)
**Status:** issues_found

## Summary

`scripts/verify-platform.sh --quick`, `release-train.mjs --self-test`, `verify-release-sha-gate.mjs`
(plain and `--self-test`) and `verify-mar-update-hop.mjs --self-test` all pass. Passing is not the
issue: the self-tests share the same wrong assumption as the code (CR-01), so they cannot catch it.

Checked and sound:

- `actions: write` is on the `dispatch-release` job only (top level is `permissions: {}`). The job has no
  environment, App key or contents write. The POST and the poll are gated by `!inputs.dry-run`.
- The dispatch step is guarded by a 40-hex check on the SHA before it reaches `printf`. `pipefail` is in
  force (`set -euo pipefail` plus `defaults.run.shell: bash`).
- The `release.yml` change is message text only. The gate is byte-identical in `build-linux` and
  `sign-publish` (enforced by the new row) and still exits 1 on every branch. The 49 review fixes are
  intact.
- The new `release-sha-gate` rows execute the shipped step text via js-yaml against scratch git repos
  with a local bare origin. One plant per rule goes red: not on main, no `configuration.toml`, workflows
  diverge, HEAD is not the requested SHA.
- The eight release states are derived from normalised facts, with the correct precedence. WITHDRAWN is
  first and the drift case is covered.

## Critical Issues

### CR-01: `head_sha` equality is the wrong key for a `workflow_dispatch` run; the train will re-dispatch every tick and cannot link or derive the right run

**File:** `.github/workflows/release-train.yml:480-484, 534` and `scripts/release-train.mjs` (`releaseFactsFromLive`, the `r.head_sha === live.mergeSHA` filter)

**Issue:** The job dispatches `release.yml` with `"ref":"main"` and `inputs.sha = <merge SHA>`. For a
`workflow_dispatch` run, `GITHUB_SHA` and the run's `head_sha` are the tip of the dispatched ref, which
is main's tip at dispatch time. They are not `inputs.sha`. `release.yml` explicitly supports a merge SHA
that is an ancestor of the tip (the whole `SHA != TIP` branch of the gate), so the normal case is
`head_sha != merge SHA` as soon as any other commit lands after the bump merge.

Failure scenarios:

1. Main has advanced past the bump merge. The "count runs already at that SHA" query returns 0 on every
   tick, forever, because the existing run carries `head_sha = tip`. The train POSTs a new `release.yml`
   dispatch every hour. Each is a 240-minute legion build queued in concurrency group `release`. The
   same happens if the newest merged `chore/esr-<pin>` PR was merged to a non-main base (see WR-01).
   "Once" is not enforced.
2. The poll (`select(.head_sha == env.SHA)`) finds nothing for 5 minutes. It prints "not yet visible" and
   the job goes green with no link.
3. If tip == SHA at dispatch, and the owner has dispatched an older ancestor, or any other run whose
   `head_sha` happens to equal SHA exists, that run is counted or linked as "the exact run" although its
   `inputs.sha` differs. This is the wrong-run-link race the focus asked about.
4. In `releaseFactsFromLive`, the same filter means BUILDING, AWAITING_APPROVAL and all run-dependent
   states never derive in production when tip != SHA. The fixtures set `head_sha = MERGE_SHA`
   (`liveRun(..., MERGE_SHA, ...)`), so the self-test encodes the false assumption. The "other SHA is
   newest" plant tests a run at a different `head_sha`, not the real shape (`head_sha = tip`,
   `inputs.sha = merge SHA`).

**Fix:** Correlate on something the dispatch controls. Add `run-name: Release ${{ inputs.sha }}` to
`release.yml` (the release-shape row pins triggers and inputs, not `run-name`). In the train, count and
resolve runs with
`select(.event == "workflow_dispatch" and .display_title == "Release " + env.SHA)`, so `head_sha` is not
used at all. Mirror it in `releaseFactsFromLive` (`r.display_title === \`Release ${mergeSHA}\``). Change
the fixtures so the run's `head_sha` is a tip SHA different from `MERGE_SHA`, and add a plant "main
advanced past the merge SHA". It must derive BUILDING and must report count 1, not 0. Update the
RELEASING.md wording ("resolved by head_sha equality"). Keep a poll-then-link guard so a different run is
never linked.

## Warnings

### WR-01: the `dispatch-release` merged-PR lookup lost the Phase 43 same-repository fix and has no base filter

**File:** `.github/workflows/release-train.yml:466` (`gh pr list ... --state merged --head "chore/esr-${PIN}"`)

**Issue:** Commit 23d53677 (not yet in this branch's base) made all four bump-PR lookups select
`isCrossRepository == false`. The new lookup is a fifth lookup by head branch name, with neither that
filter nor `--base main`. A merged fork PR whose head branch is named `chore/esr-<pin>` (a maintainer
merging an unrelated contribution is enough), or a bump branch merged into a non-main base, becomes "the
newest merged bump PR". Its merge SHA is dispatched. The gate then accepts it if it is on main and
touches `configuration.toml`. The dispatched commit then need not be the bot's bump.

**Fix:**
```
gh pr list --repo "$GITHUB_REPOSITORY" --state merged --base main --head "chore/esr-${PIN}" --limit 5 \
  --json number,mergeCommit,isCrossRepository \
  --jq '[.[] | select(.isCrossRepository == false)] | sort_by(.number) | reverse | .[0].mergeCommit.oid // empty'
```
Add a plant to the train or workflow row that a cross-repository merged PR is ignored.

### WR-02: attestation verification does not pin the signer workflow, and the self-test double cannot notice

**File:** `scripts/verify-mar-update-hop.mjs` (`realDeps().attest`; `attestOf(['attestation','verify', mar, '--repo', repo, ...])`)

**Issue:** `gh attestation verify --repo` only requires that an attestation for the MAR digest exists for
that repository. Any workflow in the repo with `attestations: write` and `id-token: write` satisfies it.
That includes a branch workflow or a non-release workflow, and the legion build job is not excluded. The
release attestation comes from one place: `actions/attest-build-provenance` in `sign-publish`
(release.yml:354). The hop proof of "this MAR was built and attested by the release pipeline" is
therefore weaker than documented. The repo is also derived from the `release_notes` link
(`github.com/<owner>/<repo>`), a proxy that can drift from the repo that releases. The fake `gh` in the
self-test checks only `--repo` and the MAR bytes. It ignores `--bundle` and any signer flags, so removing
the bundle argument or adding a pin would never turn a plant red.

**Fix:** Add
`'--signer-workflow', \`${repo}/.github/workflows/release.yml\``,
`'--source-ref', 'refs/heads/main'` and `'--deny-self-hosted-runners'` to both argv forms. `sign-publish`
is a hosted runner. Extend the fake gh to require `--signer-workflow` ending in `release.yml`, and require
`--bundle <file>` when a bundle is supplied. Add a plant that drops the signer flag. Update the
BUILD.md/RELEASING.md command line.

### WR-03: the real `signmar` paths of the release assertion set are never exercised by any check

**File:** `scripts/verify-mar-update-hop.mjs` (`realDeps().verifySignature`, `marChannel`; plants all use `fakeDeps`)

**Issue:** Every release plant and control injects `verifySignature` and `marChannel`. Only `attest` runs
through its real wiring (with a fake gh). So these are not exercised anywhere, in `--quick` or `--gate`,
until the owner's live drill: the `certutil -N/-A` argument forms, the `signmar -d ... -n ... -v` call,
the `signmar -T` output parse, and the SIGNMAR-unset branch. They fail closed (no false green), but the
first live drill can go red for tooling reasons that a test twin of the existing fake-gh pattern would
catch now. The `signmar -T` parse is also duplicated from release.yml:292 instead of shared.

**Fix:** Mirror the fake-gh pattern with a fake `signmar` script that prints a representative
`Product Information Block` / `MAR channel name:` output. Add plants: SIGNMAR unset (red naming SIGNMAR);
the channel line absent (red); channel parsed correctly (green). Use a fake `certutil` the same way, or
inject the `tool` runner.

### WR-04: BLOCKED item 5 is fix-worthy: the download-host guard sends the reader to a host the new hop check forbids

**File:** `scripts/verify-update-download-host.mjs:9-10, 104, 144, 164`

**Issue:** The failure text says "point patchURL and servedMarUrl at release-assets.githubusercontent.com
or the updates host". The owner ruling of 2026-10-29 and the new `verify-mar-update-hop.mjs`
(`RELEASE_FORBIDDEN_HOSTS`, UPD-15 layer 3) require `downloads.powerbrowser.org` and treat
`release-assets.githubusercontent.com` in the resolver log as red. Following the guard's advice
therefore produces a descriptor that the tree guard passes (its control fixture
`control/release-assets-patch.xml` is deliberately green) and the drill rejects. The guard's header
comment states the retired policy as the rule. It is a two-line text change, and the "rule still holds"
claim in BLOCKED.md is true only for the github.com half.

**Fix:** Change lines 9-10 and 104 to "point patchURL and servedMarUrl at the write-once MAR origin
(`mar_origin` in configuration.toml, `<origin>/<tag>/<asset>`)". Keep the github.com rule. Decide
separately whether the release-assets control should stay green or become a plant that goes red. The
`endpoint-allowlist.json` reasons (lines 104 and 109) carry the same stale sentence. Do this in 50-03 or
as a one-line follow-up. It does not need an owner decision.

## Info

### IN-01: a failed or cancelled `release.yml` run derives no state

**File:** `scripts/release-train.mjs` (`deriveRelease`, final `return null`)

**Issue:** A completed non-success run with no published Release derives null (recorded as a shortcut
in the SUMMARY). Run statuses `requested` and `pending` also derive null. Combined with
`dispatch-release` never retrying (count > 0), the owner gets no train signal that the first release
failed. With BLOCKED item 3 (`r2_gate` fails by design), this is the expected outcome of the first live
dispatch. A descriptor present with `channelLive === null` and `matchesServed` also derives null.

**Fix:** Add a fail-visible state, or at least a NOTE line in the report job when the dispatch result is
green but a run concludes failure. Treat `requested|pending` as BUILDING.

### IN-02: the run-link poll can fail the job after a successful dispatch

**File:** `.github/workflows/release-train.yml:529-535`

**Issue:** `URL="$(gh api ...)"` under `set -e` aborts on one transient API error. The dispatch has already
happened, so the job goes red although the release is dispatched. The "job still ends green" comment does
not hold for API errors.

**Fix:** `URL="$(gh api ... || true)"` inside the loop.

### IN-03: the descriptor URL scheme and path are not asserted in release mode

**File:** `scripts/verify-mar-update-hop.mjs` (`runReleaseChecks`, `r.eq('served descriptor host', ...)`)

**Issue:** Only the host of `servedUrl` is compared. `http://updates.powerbrowser.org/...` or any path
passes, while `servedMarUrl` is required to be https and `<origin>/<tag>/<asset>`. The tag and asset in
`servedMarUrl` are also not tied to `hop.mar` or a release key. The evidence files are owner-supplied and
nothing fetches the public URLs, so "served" is attested by the owner's capture plus the resolver log
only.

**Fix:** Compare `servedUrl` to the manifest `[urls] update` value exactly (it is already read by
`readManifestUpdateUrl`). Require that the asset segment of `servedMarUrl` is a known asset name.

### IN-04: plan assumption recorded in the SUMMARY deltas hides the dispatch design risk

**File:** `.planning/workstreams/deploy/phases/50-.../50-01-SUMMARY.md` ("Landed-skeleton deltas")

**Issue:** The plan's key link ("collectFacts polls runs?head_sha={mergeSHA}") was carried through
unchallenged, and the SUMMARY lists the run link by `head_sha` equality as delivered. The live dispatch is
plan 50-04, which an owner will run. Resolve CR-01 before 50-04, not after the first dispatch.

**Fix:** Record the correlation change in the 50-01 SUMMARY once CR-01 is fixed.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
