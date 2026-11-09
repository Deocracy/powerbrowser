---
phase: 59-carry-forward-from-v1-5-and-v1-6
plan: 08
subsystem: testing
tags: [github-actions, actionlint, verify-workflows, telemetry, tel06, live-drill]

requires:
  - phase: 59-carry-forward-from-v1-5-and-v1-6
    provides: 59-04 Gap closure items 1 and 2 (the two code reds)
provides:
  - release-train.yml that GitHub accepts (FIX_DIFF set per step in fix-pr)
  - verify-workflows rule job-env-context, plus per-step FIX_DIFF assertions and plants
  - tel06-error-delivery-live green on a clean tree
affects: [59-04 Task 4 section 3a release-train dry run, D-12 push, WINDOWS.md 33]

actuals:
  tokens: 4470
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "A Theia PreferenceService.set from a live harness passes scope 1 (User); an unscoped set targets Workspace settings and rejects when no workspace is open"
    - "A live drill that needs an error source throws from served bundle code, not from BiDi-evaluated code"

key-files:
  created:
    - .planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-08-PLAN.md
    - .planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-08-SUMMARY.md
  modified:
    - .github/workflows/release-train.yml
    - scripts/verify-workflows.mjs
    - scripts/verify-telemetry-live-delivery.mjs

key-decisions:
  - "FIX_DIFF moves to the env of each of the three steps that read it, not to a GITHUB_ENV write: per-step env is checkable statically, and a GITHUB_ENV write depends on step order"
  - "The new job-env-context rule covers every workflow, not only fix-pr, so the same mistake in another job goes red at commit time"
  - "tel06 was fixed in the harness; the product was correct both times (Workspace-scope rejection without a workspace, and no source admitted for a script with no URL)"

patterns-established:
  - "job-env-context: a job-level env may name only github, needs, strategy, matrix, vars, secrets and inputs"

requirements-completed: [CF-19]

coverage:
  - id: D1
    description: "release-train.yml is a valid workflow file; FIX_DIFF behaviour unchanged"
    requirement: CF-19
    verification:
      - kind: other
        ref: "actionlint -shellcheck= .github/workflows/release-train.yml (HEAD before: context \"runner\" is not allowed here at 1968:21; after: exit 0)"
        status: pass
      - kind: unit
        ref: "scripts/verify-platform.sh --only workflows; --only workflows-self-test"
        status: pass
    human_judgment: false
  - id: D2
    description: "tel06-error-delivery-live delivers both corrected events at level error and nothing at level off on a clean tree"
    requirement: CF-19
    verification:
      - kind: e2e
        ref: "flock pb-live.lock scripts/verify-platform.sh --only tel06-error-delivery-live (PB_FIREFOX_BIN dev objdir, PB_BACKEND_MAIN this worktree)"
        status: pass
      - kind: unit
        ref: "scripts/verify-platform.sh --only tel06-error-delivery-live-self-test"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-11-08
status: complete
---

# Phase 59 Plan 08: gap closure for the 59-04 code reds — Summary

**release-train.yml now passes actionlint with FIX_DIFF set per step, verify-workflows reds a runner context in any job env, and tel06-error-delivery-live is green on a clean tree after two harness fixes.**

## Performance

- **Duration:** about 40 min
- **Started:** 2026-11-08T20:25-08:00
- **Completed:** 2026-11-08T21:10-08:00
- **Tasks:** 2
- **Files modified:** 3 code files and 2 planning files

## Closes

| Source | Id | Closed by | Evidence |
|--------|----|-----------|----------|
| 59-04-SUMMARY.md Gap closure | item 1 (release-train.yml invalid on GitHub) | 03b5f9b3 | actionlint exit 0 on the file; workflows and workflows-self-test PASS |
| 59-04-SUMMARY.md Gap closure | item 2 (tel06 levelSet timeout) | 4fb2771e, 93af17ee | tel06-error-delivery-live PASS, tree clean after the run |
| .planning/WINDOWS.md | 33 | 4fb2771e, 93af17ee | as item 2. The recorded cause (a dirty tree) was not the cause on a clean tree; see Task 2 |

WINDOWS.md is not edited by this lane. The coordinator sets entry 33 to fixed at merge.

## Task Commits

1. **Task 1: release-train.yml valid; verify-workflows asserts the valid form**: `03b5f9b3` (fix)
2. **Task 2: tel06 green on a clean tree**: `4fb2771e` (fix: User scope), `93af17ee` (fix: error built in bundle code)

**Plan metadata:** the commit that adds this file and 59-08-PLAN.md (docs)

## Task 1 detail

- The job-level `env: FIX_DIFF: ${{ runner.temp }}/fix-diff/work.diff` is removed from fix-pr. The
  three steps that read the variable (hash and re-gate, apply, open the PR) each set it to the same
  value. A comment on the job records why it is set per step.
- verify-workflows.mjs:
  - The job-env assertion is replaced by a per-step assertion on those three steps. It goes red
    naming the step and the value it found.
  - The new rule `job-env-context` (registered in RULES and documented in the header) reds a
    `runner.`, `env.`, `steps.` or `job.` context in any job-level env of any workflow.
  - The fixture GOOD_TRAIN uses the per-step form.
  - New plants: "fix-pr opener without FIX_DIFF in its env" (red as fixer-gate, `(absent)`) and
    "fix-pr FIX_DIFF back on the job env" (red as job-env-context, `runner context`). The
    other-path plant and the ANTHROPIC_API_KEY plant are re-anchored.
- Proof:
  - actionlint on the HEAD-before copy reports `1968:21: context "runner" is not allowed here`. On
    the fixed file it exits 0 (with `-shellcheck=`; shellcheck info and warning notes in other
    steps predate this plan).
  - Across all workflows, the only actionlint finding left is the custom self-hosted label
    `powerbrowser-release` in release.yml. GitHub accepts that label; actionlint needs a config
    file to recognise it.
  - `workflows` PASS, `workflows-self-test` PASS, `--quick` PASS.

## Task 2 detail

Two causes, one under the other:

1. **The level never armed.** `prefs.set(key, level)` with no scope writes Workspace settings. The
   shell opens with no workspace, so Theia rejects the write with `Unable to write to Workspace
   Settings.` The drill's `.then` had no rejection handler, so this showed up as the 10 s
   `levelSet` timeout and, with the level never armed, no capture at all. Confirmed by a
   diagnostic run with a rejection handler and no scope change, which printed that exact message.
   Fix: scope `1` (User), as scripts/lib/pb-live-probe.mjs and verify-ng-067-frontend-errors.mjs
   already do. A rejected set now fails naming its message.
2. **The uncaught error had no source.** With the level armed, the row went red as
   `frontend.uncaught-error lacks source`. The drill threw from BiDi-evaluated code, which has no
   script URL. The producer (telemetry-error-report.ts `baseName`) correctly admits a source only
   from an http(s) or file script URL. Fix: the drill calls
   `window.theia.container.get(Symbol('pb-drill-uncaught'))`, so inversify throws from the served
   bundle and the error carries a real basename, line and column. The `pb-drill-` text still sits
   in the error message, so the analyzer's drill-text check still proves that message text does
   not ride the wire.

Proof: `tel06-error-delivery-live: PASS -- 1 positive POST(s) carried both corrected events, zero
requests at level off, and the marker is absent from the restored bundle`. Also
`tel06-error-delivery-live-self-test` PASS (26 analyzer plants, 2 drill-safety plants). Run under
`flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, headless, with
`PB_FIREFOX_BIN=.../v1.7-Orca-integration/objdir/dist/bin/powerbrowser` and
`PB_BACKEND_MAIN=<this worktree>/theia/applications/browser/lib/backend/main.js`. Logs are in
$HOME/.cache/powerbrowser-59/tel06-p59-08*.log.

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

- **Fix 2 took two commits, not one.** The brief asked for one commit per fix. The second cause
  only appeared once the first was fixed, and each commit is green on its own terms, so they were
  kept apart instead of amended (amend is not allowed).
- **Commit 03b5f9b3's message says "the four steps".** The correct number is three, because the
  hash and the re-gate share one step. The code and this summary are correct; the message was
  not amended.
- **Diagnostic runs used an untracked copy of the harness** (scripts/tel06-probe.tmp.mjs, since
  deleted). The drill refuses a tree with tracked changes, and untracked files do not count. Each
  official row run was made on the committed tree.

## Issues Encountered

None beyond the two causes above.

## User Setup Required

None.

## Next Phase Readiness

- release-train.yml is valid, so the 59-04 section 3a dry run and the scheduler clock can dispatch it
  after the D-12 push.
- The coordinator merges ServerDestroyer/p59-08 and sets WINDOWS.md 33 to fixed. No registry row
  is added or changed (`job-env-context` lives inside the existing `workflows` row).
- Hand-off: scripts/verify-platform.sh still carries the `--gate` known-open exclusion
  `"tel06-error-delivery-live|33|refuses a dirty tree; ..."` (line 6523). It is tied to WINDOWS.md
  33, so the coordinator removes it in the same change that sets entry 33 to fixed. This lane
  left it in place, because removing it alone would leave the exclusion list and WINDOWS.md out of
  step.
