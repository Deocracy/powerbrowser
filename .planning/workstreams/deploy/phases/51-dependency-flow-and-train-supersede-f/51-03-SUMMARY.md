---
phase: 51-dependency-flow-and-train-supersede-f
plan: 03
subsystem: infra
tags: [release-train, supersede, chemspill, sign-publish, stale-approval, fixtures, derive]

requires:
  - phase: 43-release-train-skeleton-and-upstream-bump-automation-a
    provides: scripts/release-train.mjs derive/next/render, the --self-test host, the release-train-logic-self-test row
  - phase: 50-release-train-stages-and-first-public-linux-release-e
    provides: release-stage states, release.yml sign-publish with newer_guard and newer_guard_final
provides:
  - SUPERSEDED terminal state, with the chemspill-first and newer-ESR derive arms in scripts/release-train.mjs
  - SUPERSEDED render: names the new key and link, no assign, no mention
  - Three TRAIN-09 fixtures and two planted faults added to the existing self-test host
  - One chemspill-ordering sentence in docs/RELEASING.md
affects: [51-02, 51-04, owner decisions in 51 BLOCKED.md items 7-10]

key-files:
  created:
    - .planning/workstreams/deploy/phases/51-dependency-flow-and-train-supersede-f/51-03-SUMMARY.md
  modified:
    - scripts/release-train.mjs
    - docs/RELEASING.md
    - .planning/workstreams/deploy/phases/51-dependency-flow-and-train-supersede-f/BLOCKED.md

key-decisions:
  - "The self-test host is scripts/release-train.mjs --self-test, as the plan's Task 1 pinned. scripts/release-train-logic-self-test.mjs does not exist and is not created."
  - "The sign-publish guard is not changed. release.yml already has two fail-closed stale-approval guards (newer_guard, newer_guard_final). Exit 0 in a first step does not end a GitHub Actions job, so the plan's exit-0 variant needs every later step gated. Red versus green is an owner decision (BLOCKED.md item 7)."
  - "SUPERSEDED renders with no assign and no mention, since it is not a NEEDS_OWNER state. The TRAIN-02 lock protocol is reused unchanged."
  - "The derive arms run after the release-stage check. A published release is never superseded, and every Phase 43/50 arm keeps its order."
  - "The SUPERSEDED cancel action (cancel-pending-and-link) is a name only. No executor is wired, because the release-stage actions have no live collector (Phase 43 BLOCKED item 3)."
  - "The inherited draft-Release, fork-head and duplicate-issue plants stay dropped. Their helpers are UNWIRED, as recorded in 43's WR-07 fix."

patterns-established:
  - "Supersede facts (newerTag, chemspillOpen) are pure inputs to derive. A fixture proves each arm, and a planted fault goes red naming the drift."
  - "The sign-guard fixture runs the shipped comparator (scripts/release-key-newer.mjs) as a child process, so the predicate tested is the one release.yml calls."

requirements-completed: []
requirements-partial: [TRAIN-04]  # derive, render and fixtures land; live supersede cancel and facts collector are unwired (BLOCKED items 8-10); sign-guard exit is fail-closed, not exit 0 (BLOCKED item 7)

duration: not recorded (start-time capture was skipped at executor start)
completed: 2026-10-31
status: partial
commits: 3
plan_head_before: c755d408410863e98ad853188d37b2e4dddba119
plan_head_after: 10a5723e334d582facaa44a32f652e253b8a9da4

actuals:
  tokens: 5298
  tasks: 3
  commits: 3
---

# Phase 51 Plan 03: SUPERSEDED state and supersede fixtures Summary

SUPERSEDED terminal state with chemspill-first and newer-ESR derive arms, a routine render with no owner page, three new TRAIN-09 fixtures in the existing self-test host, and one RELEASING.md ordering sentence. The sign-publish stale-approval guard already existed as fail-closed, so it is not changed; the exit-0 variant and the live supersede cancel are recorded as owner or unwired items.

## Outcome

- Done: `SUPERSEDED` in `STATES`, its derive arms, its action name, and its render. Commit `44f59803`.
- Done: three new fixtures with planted faults (`supersede-newer-esr-while-open`, `chemspill-beats-scheduled`, `sign-job-newer-release-exit`), an extra malformed-tag plant, and five new green controls. Commit `44f59803`.
- Done: one chemspill-ordering sentence in `docs/RELEASING.md`, appended once. Commit `9f35ce27`.
- Not done (adapted, see Deviations): the sign-publish first step with exit 0 and a note. The existing guards stay.
- Not done (unwired or owner-gated): the live cancel of the superseded train's pending `release` deployment, the duplicate-issue fixture, and the fork-head fixture. See BLOCKED.md items 7 to 10 (added in `10a5723e`).
- Status is `partial`, not `complete`. TRAIN-04 holds on fixtures for derive, render, and the sign comparator. The live half is still owner-gated.

## Missing-premise record (Task 1)

Assertions run against the tree at `c755d408`:

- `scripts/release-train.mjs`: present. `STATES` holds the 13 Phase 43/50 states verbatim: DETECTED, BUMPING, CONFLICT, BUMP_RED, BUMP_PR_GREEN, BUILDING, AWAITING_APPROVAL, PUBLISHED, DESCRIPTOR_WAIT, DESCRIPTOR_LIVE, LIVE_RED, WITHDRAWN, DONE. The four Phase 58 uptake states sit in a separate `UPTAKE_STATES` table. `NEEDS_OWNER` is present. SUPERSEDED was absent before the change.
- Self-test host: present as `--self-test` inside `scripts/release-train.mjs`. As the plan's Task 1 anticipated, the second `files_modified` entry (`scripts/release-train-logic-self-test.mjs`) collapses into the first, and no second file is created.
- Inherited plants: "merged PR with an unchanged pin" and "175.x ESR under the 153 guard" are live. "Draft Release", "fork-head workflow_run" and "duplicate tracking issue" were dropped in 43's WR-07 fix, because `classifyRelease`, `admitWakeRun` and `findExactlyOne` are UNWIRED. They are not reinstated.
- `.github/workflows/release.yml` sign-publish: present, with the contents, id-token and attestations write trio. The premise "no newer-Release guard yet" is false. `newer_guard` (line 268, "Refuse a stale approval") and `newer_guard_final` (line 397, directly before the bot token mint) already exist and fail closed on the same comparator. This is the premise mismatch the plan's Task 1 would stop on. The executor recorded it and continued, because the protection it asks for already holds. This is a judgment call, and the owner should review it (BLOCKED.md item 7).
- `docs/RELEASING.md`: present. The baseline count of `chemspill|supersed` was 0. The out-of-band section is at line 1041 in this checkout, not the plan's 724-751.
- Baseline `--quick` at `c755d408`: `verify-platform: PASS -- all checks passed`, exit 0. The 15 FAIL-looking lines in that output are plant lines from self-tests, as 43's fix report notes.

## Tasks and commits

| Task | Result | Commit |
|---|---|---|
| 1. Missing-premise gate | Recorded above. Continued, with the sign-guard premise adapted | none (assert only) |
| 2. SUPERSEDED state, derive arms, render, cancel name, fixtures | Done | `44f59803` |
| 3. Sign-publish guard, RELEASING.md sentence, green tree | Sentence done. Guard not applied (adapted). `workflows` and `--quick` green | `9f35ce27` |
| Owner items | BLOCKED.md items 7 to 10 | `10a5723e` |

## Fixtures and planted faults

The self-test host is `scripts/release-train.mjs --self-test`. The final run output:

```
release-train-logic: --self-test PASS -- 18 states set-equal to 18 fixtures, 27 planted faults went red naming their drift, and 25 controls stayed green
```

Before the change: 17 states, 23 plants, 20 controls.

Delivered fixtures and the red-naming lines from the run:

- `supersede-newer-esr-while-open`: `ok  supersede-newer-esr-while-open: an open older train with a newer ESR tag -> red, naming 'superseded by v153.23.0-1'`
- `chemspill-beats-scheduled`: `ok  chemspill-beats-scheduled: a scheduled train with an open same-ESR chemspill revision -> red, naming 'superseded by the open chemspill revision'`
- `sign-job-newer-release-exit`: `ok  sign-job-newer-release-exit: a stale approval whose key is not newer than the latest published Release -> red, naming 'is not older than v153.23.0-1'`
- Extra plant, `sign-job-malformed-latest`: `ok  sign-job-malformed-latest: ... -> red, naming 'could not be compared'`

Not delivered: `supersede-duplicate-tracking-issue` and `supersede-fork-head-workflow-run`. Their helpers are UNWIRED (BLOCKED.md item 9).

Controls added, all green: a chemspill revision train proceeds on the Phase 43 ladder; a 175 tag never supersedes a 153 train; a published release is never superseded; the SUPERSEDED render names the key and link with no assign and no mention; the sign comparator proceeds on the newest key and refuses an equal key.

Mutation checks, run on scratch copies (not in the tree). Each one turned the self-test red and named the drift:

- M1, chemspill arm removed: `chemspill-beats-scheduled ... did not go red naming 'superseded by the open chemspill revision'`
- M2, newer-ESR arm removed: the baseline went red, because the SUPERSEDED fixture needs that arm
- M3, 175 accepted as a newer tag: `control: a 175 tag never supersedes a 153 train ... went red`
- M4, SUPERSEDED gets an assign: `control: the SUPERSEDED render ... went red: SUPERSEDED view had mention ..., assign ...`
- M5, SUPERSEDED action changed to `gate`: the baseline went red on the action literal
- M6, comparator proceeds on an equal key: `control: the sign guard proceeds on the newest key and refuses an equal key ... went red`

## Sign-publish stale-approval guard (plan Task 3, step 1): adapted, not applied

The plan asks for a first step in `sign-publish` that exits 0 with a note, with the later steps gated. This is not applied, for three reasons:

1. The guard already exists, fail closed, at two points: `newer_guard` (release.yml line 268, after the derive_key step and before the MAR channel gate) and `newer_guard_final` (line 397, directly before the mint at line 411). The `verify-release-asset-set` rule requires `newer_guard_final` to sit directly before the mint.
2. In GitHub Actions a step that exits 0 does not stop the job. Without an `if:` gate on each of the 20 later steps, an exit-0 first step does nothing.
3. Red versus green on a stale approval is a policy choice. The plan's own wording is "strictly greater", but the existing guards also refuse an equal key, which is correct. Option (b) would have to keep that refusal. The owner decides (BLOCKED.md item 7).

The sign-guard fixtures test the same comparator the existing guards call.

## Deviations from Plan

- Self-test host: the plan's Task 1 fallback applied. The fixtures live in `scripts/release-train.mjs`.
- Sign-publish guard: adapted (see above). No change to `.github/workflows/release.yml`.
- Derive placement: the plan said "first match wins" for all arms. The new arms run after the release-stage check. This keeps release-stage precedence, and the Phase 43/50 ordering stays byte-unchanged after the new arms.
- Two of the five plan fixtures were not delivered, because their helpers are UNWIRED (see above).
- Cancel action: `cancel-pending-and-link` is the action name only. No executor is wired, and no `gh` cancel call exists in `release-train.yml`. The endpoint probe was not run, because no collector can supply the run ID and pending-deployment ID yet.
- The RELEASING.md sentence is at line 1049 in the out-of-band section, not 724-751 as the plan said. The file has grown since the plan was written.
- Plan commit count: the plan's ledger protocol 0c was not run at start. The base is written now as `c755d408`, the HEAD at start.

## Verification

- Self-test: exit 0, the PASS line quoted above.
- `scripts/verify-platform.sh --only workflows`: `workflows: PASS`, `verify-platform: PASS -- all checks passed`, exit 0.
- `grep -c 'takes priority over a scheduled' docs/RELEASING.md`: `1`.
- Acceptance greps: `grep -c SUPERSEDED scripts/release-train.mjs` = 19. The only `assign` and `mention` hits in the SUPERSEDED path are a comment and a test assertion. No added line carries a token, secret, permission or scope string.
- `scripts/verify-platform.sh --quick`: run after the SUMMARY commit. The line is in the final message.

## Known Stubs

- `scripts/release-train.mjs`, `ACTIONS.SUPERSEDED` (`cancel-pending-and-link`): the action is named, and nothing executes it. Tracked in BLOCKED.md item 8.
- `derive()` reads `newerTag` and `chemspillOpen`, but no collector sets them. Tracked in BLOCKED.md item 10.

## Threat Flags

None. No new endpoint, credential, scope, workflow trigger or write path was added. The self-test spawns the shipped comparator (`node scripts/release-key-newer.mjs`), which is a local read.

## Owner merge commands

No pull request was opened, because this run makes no network writes. When the owner reviews the branch `dsh/phase-51`, the commands are:

```
gh pr view <PR-NUMBER> --json checks,state
gh pr merge <PR-NUMBER> --merge
```

Review the SUPERSEDED diff in `scripts/release-train.mjs`, the three fixtures, the RELEASING.md sentence, and BLOCKED.md items 7 to 10. Nothing in this plan enables CodeQL, enables Dependabot alerts, merges a Renovate or Dependabot PR, or applies a live setting.

## Self-Check

- Commits exist on `dsh/phase-51`: `44f59803`, `9f35ce27`, `10a5723e`.
- Files exist: `scripts/release-train.mjs` (modified), `docs/RELEASING.md` (modified), `BLOCKED.md` (appended), this SUMMARY.
- Self-test and `workflows` row passed at the commit state recorded above.

## Self-Check: PASSED
