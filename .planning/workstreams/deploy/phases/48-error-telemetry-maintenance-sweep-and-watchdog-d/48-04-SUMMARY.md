---
phase: 48-error-telemetry-maintenance-sweep-and-watchdog-d
plan: 04
subsystem: telemetry-and-monitoring
tags: [tel-06, mon-01, live-delivery, watchdog, loopback-drill, cors, registry]

# Dependency graph
requires:
  - phase: 48-01
    provides: the producer's ADMITTED_KEYS, shapes and the sender's {kind, name, data, at} envelope the analyzer checks
  - phase: 48-02
    provides: the events Worker's corsHeaders (imported by the loopback stand-in) and the no-schedule product rule
  - phase: 48-03
    provides: the sweep whose watchdog-age row reads the watchdog's run start
provides:
  - scripts/verify-telemetry-live-delivery.mjs, the TEL-06 analyzer (pure) and the full-tier loopback drill
  - docs/watchdog.yml, the MON-01 watchdog source (owner applies it to powerbrowser-updates)
  - scripts/verify-watchdog.mjs, the watchdog decision and source gate with plants
  - registry rows tel06-error-delivery-live (full), tel06-error-delivery-live-self-test, watchdog, watchdog-self-test
affects: [48-05 owner checkpoint (runs the live drill, applies the watchdog, pins the maintenance issue)]

# Actuals (#2632) -- chars/4 over the post-plan content of the 4 files changed by this plan.
actuals:
  tokens: 84000
  tasks: 2
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The analyzer is pure over captured requests; the drill only captures and calls it"
    - "The loopback stand-in reuses the Worker's zero-dependency corsHeaders, so the preflight matches the real route"
    - "The watchdog decision is pure; the gate parses the source with the repo's js-yaml and checks the threshold against the decision constant"

key-files:
  created:
    - scripts/verify-telemetry-live-delivery.mjs
    - docs/watchdog.yml
    - scripts/verify-watchdog.mjs
  modified:
    - scripts/verify-platform.sh

key-decisions:
  - "Both tasks land in one commit: scripts/verify-platform.sh is the one registry file, and splitting its rows would leave a row pointing at a missing script between commits."
  - "The watchdog reads with the job's GITHUB_TOKEN. The product repository is public (checked read-only), so that read is expected to work without a credential. The plan's BLOCKED path is not needed for the read, only for the apply (BLOCKED.md item 3)."
  - "The watchdog dedupes: when an open issue carries the title, it opens no second one. A daily silence would otherwise open one issue per day."

patterns-established:
  - "Full-tier drill rows sit in the not-quick block of the registry and say so in their comment"

requirements-completed: [TEL-06, MON-01]  # the local halves are complete; the live drill and the apply are plan 48-05

# Metrics
duration: not recorded
completed: 2026-10-31
status: complete
---

# Phase 48 Plan 04: Live-delivery drill, analyzer and watchdog source Summary

**The TEL-06 analyzer is green on its control and on six planted faults, and the watchdog decision and source gate are green with seven red plants; the full loopback drill and the watchdog apply are built and registered but run at plan 48-05.**

## Performance

- **Duration:** not recorded (no timer was started at plan start)
- **Tasks:** 2 of 2
- **Files modified:** 4

## Accomplishments

- `analyzeCapture(captures)` checks a captured run: a CORS preflight before each POST, the application/json content type, a JSON events array, error events only, the admitted keys and no forbidden field (message, stack, path, URL, cookie, account, identifier text), the admitted shape of every value, no full path in source, and the required keys of the uncaught error (source, line, column, version, buildID, os) and of the unhandled rejection (type, version, buildID, os). It fails on any capture at level off, and on an empty capture.
- `--self-test` proves the control green and six plants red, each naming its drift: no POST, a stack field, an unadmitted key, a full path in source, an empty capture, a request at level off.
- `driveLiveDelivery` (the full drill, run by `scripts/verify-telemetry-live-delivery.mjs` with no argument) is written but not executed in this session. It binds a loopback server on a free port, answers the preflight with the Worker's `corsHeaders`, rewrites only the one production endpoint in the tracked package.json, rebuilds the frontend in the nix theia shell, launches through `withFirefoxPage`, sends one uncaught error and one rejection at level error with `maxBatchSize` set to 2, waits for the POST, sets level off and sends the same errors, and waits five seconds. It restores package.json byte-identical in `finally`, rebuilds, and greps the bundle for `pb-drill-events`.
- `docs/watchdog.yml` is the watchdog source: triggers `schedule` (`17 6 * * *`) and `workflow_dispatch` only; one job on ubuntu-latest; `contents: read` and `issues: write`; the runs read `repos/<owner>/powerbrowser/actions/workflows/release-train.yml/runs?per_page=1`; a 93600-second threshold (26 hours); an open-issue dedupe; a fixed title; an issue body with the run link and both timestamps, or the missing-run line; SHA-pinned uses; no secret and no App token.
- `scripts/verify-watchdog.mjs` drives `decideWatchdog` over an in-memory run table: a 25-hour silence opens nothing, a 27-hour silence opens one issue carrying the run link, a missing run opens one issue naming it, and an open same-title issue suppresses a second. The source gate parses the YAML with the repo's js-yaml and checks the triggers, the cron, the job, the permissions, the secret, the App token, the runs path, the threshold, the title, the uses pins and the github.event text. The product repository's `.github/workflows` carries no schedule key.
- Registry rows: `tel06-error-delivery-live` (full tier, in the not-quick block with a Full tier comment), `tel06-error-delivery-live-self-test`, `watchdog` and `watchdog-self-test` (quick), each with a NEW Phase 48 comment.

## Task outcomes

- **Task 1 (drill and analyzer):** the analyzer self-test is PASS (control plus 6 plants). The full drill was not executed; its positive and negative halves, and the restore plus marker grep, are unproven until the owner's run at 48-05.
- **Task 2 (watchdog):** `watchdog: PASS` and `watchdog --self-test` PASS (control plus 7 plants). The 25-hour silence, 27-hour issue with link, and missing-run cases are proven in fixture.

## Plant outcomes

Analyzer: no POST red naming "no POST from the running sidecar"; stack field red naming "forbidden field stack"; unadmitted key red naming "unadmitted key extra"; full path red naming "full path in source"; empty capture red naming "no capture at all"; request at level off red naming "captured at level off".

Watchdog: unguarded workflow_run red; event text in a run step red; secret reference red; drifted cron red; 25-hour threshold red; product-repository schedule key red; a 25-hour window opening an issue red.

## Flagged-assumption outcomes

- **TEL-06 live negative half:** the drill runs positive then negative in one invocation, and the analyzer fails when the positive half sends nothing. Ordering stated; not executed.
- **TEL-06 live restore:** the drill restores package.json in `finally`, checks byte identity, rebuilds, and greps. Not executed.
- **MON-01 adjacency:** the watchdog reads only run `started_at` values for its age, and the fixtures drive only run start times. No conclusion-time read.
- **MON-01 empty:** a missing run opens one issue naming the missing run; the fixture proves it.
- **MON-01 ordering:** the 26-hour window measures from `run_started_at`, so a failing-but-running train counts as alive; the 25h and 27h fixtures use start times.
- **RESEARCH Q1 (60-day rule) probe:** read-only dates observed at 2026-10-31T20:06Z:
  - `powerbrowser` (product) default branch `main`, last commit 2026-10-29T21:07:10Z; no `release-train.yml` on `main` (404), so no release-train run exists on the default branch.
  - `powerbrowser-updates` is an empty repository (HTTP 409), `updated_at` 2026-10-19T23:15:52Z.
  - The 60-day question is not assumed. The watchdog-age row remains the second signal, and the probe stays open for 48-05.

## Adaptations to the plan text

1. **One commit for two tasks.** Both tasks register rows in the same `scripts/verify-platform.sh`, so one commit carries both.
2. **Dedupe on the watchdog.** Not in the plan. Without it, a long silence opens one issue a day. The gate proves the dedupe with the control.
3. **The drill arms the level through the live PreferenceService, not a drill config directory.** NG-067's idiom is proven; a drill config file is not verified against Theia's preference loader.
4. **The rejection event carries no position.** The plan's "exactly the admitted keys" is read as: the uncaught error carries all seven keys; the rejection carries type, version, buildID and os, since the reporter never sends a position for a rejection.
5. **Batch flush by size is forced through the DI-bound sender's `maxBatchSize`** (set to 2), the same handle NG-067 uses, not by a page-side loop of errors.

## Deviations from Plan

None in the code beyond the adaptations above. The first analyzer run and the first watchdog run passed without a fix.

## Issues Encountered

- The full drill cannot run here: it needs the nix theia shell, a frontend rebuild and the built binary. It is registered and waits for 48-05.
- `main` of `powerbrowser` has no `release-train.yml`, and `powerbrowser-updates` is empty. Both are owner items (BLOCKED.md items 3 and 4).

## Verification Evidence

- `node scripts/verify-telemetry-live-delivery.mjs --self-test`: PASS (control plus 6 plants).
- `node scripts/verify-telemetry-live-delivery.mjs --bogus`: exit 2.
- `node scripts/verify-watchdog.mjs`: `watchdog: PASS`, exit 0.
- `node scripts/verify-watchdog.mjs --self-test`: PASS (control plus 7 plants).
- `scripts/verify-platform.sh --only tel06-error-delivery-live-self-test`, `--only watchdog`, `--only watchdog-self-test`: PASS.
- `scripts/verify-platform.sh --quick`: exit 0 (run after the rows were added).
- `node scripts/scan-brand-residue.mjs` after staging: PASS.

## Self-Check

- [x] scripts/verify-telemetry-live-delivery.mjs exists
- [x] docs/watchdog.yml exists
- [x] scripts/verify-watchdog.mjs exists
- [x] scripts/verify-platform.sh carries the four rows

## Next Phase Readiness

- Plan 48-05 (owner checkpoint) runs the full drill, applies `docs/watchdog.yml` to `powerbrowser-updates` (BLOCKED.md item 3), runs the 26-hour drill, grants the probe App its permissions (item 2), sets `OWNER_LOGIN` and pins the maintenance issue (item 1). The release train must first reach `main` (item 4).
