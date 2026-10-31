---
phase: 48-error-telemetry-maintenance-sweep-and-watchdog-d
plan: 03
subsystem: release-train
tags: [train-07, maintenance-sweep, release-train, pinned-issue, workflow-trust, dry-run]

# Dependency graph
requires:
  - phase: 43-release-train-skeleton-and-upstream-bump-automation-a
    provides: release-train.mjs derive, next, render and --self-test; release-train.yml with report as the sole issues write; dry-run gates and the bot environment job-level gate
  - phase: 48-01
    provides: the telemetry producer whose endpoint the synthetic probe reaches
  - phase: 48-02
    provides: the events Worker synthetic flag (honoured only with the shared secret) and the bot environment copy of DOWNLOAD_COUNT_SECRET
provides:
  - Six TRAIN-07 maintenance rows derived from facts, with no-data branches, a byte-stable pinned body, an exactly-one write plan and a 06:00 UTC sweep gate
  - maintenance sweep jobs (sweep-clock, maintenance-probe, maintenance) and gated pinned-issue write steps in report
  - registry row release-train-maintenance-self-test
affects: [48-05 owner checkpoint (pins the issue, grants the App read permissions, sets the owner variable), 49 and 50 (live values for runner-online, channel-liveness and download-count)]

# Actuals (#2632) -- chars/4 over the post-plan content of the 3 files changed by this plan.
actuals:
  tokens: 96000
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Maintenance rows derive from facts in fixed order; null means not observed and renders no-data, never green"
    - "The pinned body is render output only; the one read back is the previous body's row statuses, used for the transition comment and never for a state"
    - "Live writes in report are gated on a plan output and on the negated dry-run input; the report job never creates the pinned issue"

key-files:
  created: []
  modified:
    - scripts/release-train.mjs
    - .github/workflows/release-train.yml
    - scripts/verify-platform.sh

key-decisions:
  - "Task 1 checkpoint (auto_select six-row-schema): taken. Six rows in fixed order with the named no-data sentences and comment-only-on-red. Recorded here; the decision is the plan's public contract for the pinned issue."
  - "The pinned title is release-train: maintenance; the body is the title, the six-row table and one debug snapshot comment of row statuses. No timestamp is rendered, so the body changes only when a row changes or its evidence changes."
  - "Watchdog-age with no watchdog run recorded is red, not no-data. Before the owner applies the watchdog workflow, a pinned issue that the owner has already pinned renders this row red and will comment once on the transition. The 48-05 owner steps must apply the watchdog before pinning, or accept that one comment."
  - "The sweep runs on every dispatch tick at or past 06:00 UTC (no once-per-day dedupe). Re-running is idempotent: the PATCH runs only on a byte diff and the comment only on a transition into red."

patterns-established:
  - "Adaptation record: each plan text change below is named in this summary with the reviewed code that forced it"

requirements-completed: [TRAIN-07]

# Metrics
duration: not recorded
completed: 2026-10-31
status: complete
---

# Phase 48 Plan 03: Maintenance sweep rows, pinned issue writer and watchdog-age row Summary

**The release-train core derives the six TRAIN-07 maintenance rows with no-data branches, renders the pinned body byte-stably, and plans at most one PATCH and one comment per run; the workflow runs the sweep on each tick at or past 06:00 UTC with reads only until the owner pins the issue.**

## Performance

- **Duration:** not recorded (no timer was started at plan start)
- **Tasks:** 3 of 3 (Task 1 checkpoint taken by auto_select)
- **Files modified:** 3

## Accomplishments

- `deriveMaintenance(facts)` returns the six rows in fixed order: runner-online, esr-pin-age, channel-liveness, watchdog-age, synthetic events POST, download-count. Each row carries a status (green, red or no-data) and an evidence string.
- No-data branches: runner-online and channel-liveness render `no data until Phase 49`, download-count renders `no data until Phase 50`. A value the sweep did not observe renders `not probed in this run`.
- esr-pin-age follows the reviewed tag rules: `classifyTag` with the pinned major guard ignores 175 tags, a tag newer than the pin that is more than 3 days old with no published Release is red, and a draft Release does not count. FIREFOX_ESR from product-details is evidence only and never changes the status.
- `renderMaintenance` is byte-stable: rows render in the fixed order regardless of the facts order, and the snapshot comment carries statuses only.
- `nextMaintenance(found, rendered, ownerLogin)` wraps the Phase 43 `findExactlyOne` and returns at most one PATCH and at most one comment. A comment is posted only for a row that is red now and was not red in the previous body. A staying-red re-run posts zero comments. Two rows turning red together post one comment naming both.
- `sweepDue(nowMs)` is true at or past 06:00 UTC.
- `release-train.yml` gains `sweep-clock` (no environment), `maintenance-probe` (bot environment, job-level dry-run gate, one synthetic POST marked synthetic), and `maintenance` (reads only, renders the body). `report` finds the pinned issue read-only and carries the two live writes, each gated on the negated dry-run input and on the plan output. The workflow has no schedule key.
- The self-test proves the six rows, the no-data branches, the transition rules, the row-list set equality, and the drift plants. The release-train self-test passes with 12 Phase 43 plants and 20 maintenance cases.

## Phase 43 contract re-verification

- `scripts/release-train.mjs` exists and exports `derive`, `next` and `render`. The contract holds.
- `.github/workflows/release-train.yml` exists with a `report` job that holds the only `issues: write`. The contract holds for report.
- The workflow has no `maintenance` job. Phase 43 states in its header that the maintenance sweep is Phase 48. This plan therefore adds the `maintenance` job as the Phase 48 part, instead of stopping as blocked-on-Phase-43. Nothing from Phase 43 is changed except the report steps that this plan adds after the existing would-write view.
- The Phase 43 `findExactlyOne` writer stays UNWIRED for the release-train tracking issue (BLOCKED.md item 3). The maintenance writer is the one that is wired.

## Six-row statuses on fixture facts

Control fixture (a 153.6.0 tag dated one day old, one published Release for 153.5.1, two runners online, watchdog started three hours ago, synthetic probe 200, no channel data, no download rows):

| Row | Status | Evidence |
| --- | --- | --- |
| runner-online | green | 2 runner(s) online |
| esr-pin-age | green | pin is the newest tag with one newer tag not yet older than 3 days |
| channel-liveness | no-data | no data until Phase 49 |
| watchdog-age | green | last watchdog run started 3 h ago |
| synthetic events POST | green | synthetic probe answered 200 |
| download-count | no-data | no data until Phase 50 |

Smoke run through the workflow's CLI path with a 153.6.0 tag four days old and no Release for it: esr-pin-age is red with the tag named, and the advisory 153.6.0 appears as evidence only.

## Flagged-assumption outcomes (TRAIN-07 group)

- **TRAIN-07 adjacency:** no seventh row is possible. The row-list drift check and its plant (`renewals-due`) go red naming the row. Phase 51 rows never render.
- **TRAIN-07 empty:** an empty facts response (no tags, no Releases, no probe) renders six no-data rows; the control proves it.
- **TRAIN-07 ordering:** the rendered body is byte-identical under shuffled tag and Release order; the control proves it.
- **TRAIN-07 concurrency:** one run plans at most one PATCH and at most one comment. Two rows turning red together post one comment naming both; the control proves it.
- **A48-1 contract:** the Phase 43 contract holds for the files and the report job. The `maintenance` job is added by this plan (see above).
- **A48-3 live values:** runner-online, channel-liveness and download-count render no-data now. Live values are the Phase 49 and 50 handoff.
- **RESEARCH Q1:** not assumed. The watchdog-age row is the second signal, and the 60-day question stays a probe recorded in 48-04.

## Adaptations to the plan text

Each change is forced by the reviewed Phase 43 code or by a 48-01/48-02 decision.

1. **No new CLI flags** (plan artifacts). Three flags are added: `--sweep-due`, `--maintenance` and `--maintenance-plan`. The workflow has no other way to call the pure functions. The reviewed Phase 43 code already uses the same pattern (`--would-write`, `--publish-plan`).
2. **Bot environment only on the runner-online step.** GitHub Actions enters an environment at job level, so the bot environment is confined to the one job, `maintenance-probe`. It also carries the watchdog read and the synthetic POST, which need the same job-level gate.
3. **Synthetic POST references the bot copy of the shared secret.** The 48-02 review (WR-04) honours the synthetic flag only with the secret, so an unauthenticated probe would be stored as a real event. The one step that references the secret is that POST.
4. **Sweep on every due tick, not once a day.** Deduplicating by run history needs the jobs API. Each due tick is idempotent: the PATCH runs only on a byte diff and the comment only on a transition into red. The synthetic rows number about 18 a day; they are marked synthetic, excluded from maintainer queries, and deleted after 30 days.
5. **Transition detection reads the previous body's row statuses.** This is the one read back of the pinned issue. The plan's "never read back as state" is honoured: no state is derived from the body, and the read decides only whether a comment is posted.
6. **Not-probed rows render no-data.** A dry run, or a tick whose probe did not run, leaves runner-online, watchdog-age and synthetic events POST unobserved. They render `not probed in this run`. This is beyond the three named no-data rows, and it is needed so a dry run never reports red.
7. **Owner mention through an optional variable.** The comment mentions `vars.OWNER_LOGIN` when it is set and a valid login. The repository holds no owner login, so the mention is an owner setting.
8. **The maintenance self-test row runs `--self-test`.** The plan asks for a separate half, but the plan also forbids new flags. The row therefore runs the same `--self-test` as `release-train-logic-self-test`, which now includes the maintenance half. The two rows overlap by design.
9. **tagDates come from the commit date of each tag under the pinned major.** The sweep reads it with `gh api` on `mozilla-firefox/firefox`, one call per tag. A tag with no date is not aged, and the evidence says nothing about it.

## Decisions Made

See key-decisions in the frontmatter. The owner checks at 48-05 are the watchdog-before-pin ordering, the `vars.OWNER_LOGIN` value, and the App permissions for the probe (administration read and actions read on `powerbrowser-updates`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Workflow YAML did not parse**
- **Found during:** Task 3 verification (`verify-workflows`)
- **Issue:** a `run:` value held an unquoted `: ` in a plain scalar.
- **Fix:** rewrote the step as a block scalar.
- **Files modified:** .github/workflows/release-train.yml
- **Commit:** d6fc16e4

**2. [Rule 1 - Bug] Annotated tag dates would have 404'd**
- **Found during:** Task 3 review
- **Issue:** the tag-date lookup read the plain ref line, which for an annotated tag names the tag object, not a commit.
- **Fix:** the lookup prefers the peeled `^{}` line.
- **Files modified:** .github/workflows/release-train.yml
- **Commit:** d6fc16e4

**3. [Rule 1 - Bug] Sweep clock was gated off in dry runs**
- **Found during:** Task 3 review
- **Issue:** a dry run would skip the render, so it could not print the would-write view.
- **Fix:** the clock step is a read-only decision and runs in a dry run too.
- **Files modified:** .github/workflows/release-train.yml
- **Commit:** d6fc16e4

**Total deviations:** 3 (all in the workflow's own code; no scope change).

## Issues Encountered

- Nothing live ran. The probe, the render against live facts, and the pinned-issue writes are owner actions at plan 48-05. The workflow cannot run in this session.
- The mozilla-firefox tag listing and commit-date reads are unverified against the live API from this host. The first live run is the check.

## Verification Evidence

- `node scripts/release-train.mjs --self-test`: PASS (12 Phase 43 plants, 7 controls, 20 maintenance cases).
- `node scripts/verify-workflows.mjs` and `--self-test`: PASS (106 planted faults).
- `scripts/verify-platform.sh --only zizmor`: PASS.
- `scripts/verify-platform.sh --only release-train-maintenance-self-test`, `--only release-train-logic-self-test`: PASS.
- `node scripts/scan-brand-residue.mjs` after staging: PASS (480 files).
- `scripts/verify-platform.sh --quick`: exit 0, "verify-platform: PASS -- all checks passed".

## Self-Check

- [x] scripts/release-train.mjs modified: deriveMaintenance, renderMaintenance, nextMaintenance, sweepDue exported
- [x] .github/workflows/release-train.yml modified: sweep-clock, maintenance-probe, maintenance jobs; no schedule key
- [x] scripts/verify-platform.sh modified: release-train-maintenance-self-test row
- [x] Commit 465d0c76 is in the branch history
- [x] Commit d6fc16e4 is in the branch history

## Self-Check: PASSED

## Next Phase Readiness

- Plan 48-05 (owner checkpoint) pins the `release-train: maintenance` issue, grants the bot App administration read and actions read on `powerbrowser-updates`, and sets `vars.OWNER_LOGIN`. Apply the watchdog (48-04) before pinning to avoid the first-day red row.
- Phases 49 and 50 supply live runner, channel and download-count values, which replace the no-data rows.
