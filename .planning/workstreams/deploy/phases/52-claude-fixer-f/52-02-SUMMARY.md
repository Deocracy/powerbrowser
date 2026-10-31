---
phase: 52-claude-fixer-f
plan: 02
subsystem: infra
tags: [workflows-row, claude-code-action, fixer, trust-boundary, verify-workflows, admission]

requires:
  - phase: 52-claude-fixer-f
    plan: 01
    provides: the fix-gate, its deny list and the quick registry row
provides:
  - four fixer rules in the workflows row: fixer-pin, fixer-debug, fixer-tools, fixer-prompt
  - no-cache extended to the release-train.yml fixer jobs fix, fix-gate and fix-pr
  - a good fixer triple fixture and 23 new planted faults, all red naming file, job, rule and value
affects: [52-04 fixer workflow, admission of anthropics/claude-code-action]

actuals:
  tokens: 4999
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Fixer rules scoped by file and job name, so the existing claude-code-action fixtures stay green"
    - "Fixture edits by anchor: fixerEdit(from, to) fails closed when the anchor is absent"

key-files:
  created: []
  modified:
    - scripts/verify-workflows.mjs

key-decisions:
  - "fixer-pin applies to every claude-code-action step in release-train.yml; fixer-debug to fixer jobs and any job that runs Claude"
  - "fixer-tools and fixer-prompt apply to the fix job only; flag values are read from claude_args (double, single or unquoted)"
  - "WebFetch and WebSearch denial is asserted in --disallowedTools, the claude_args equivalent of a deny list"
  - "The Edit/Write patches deny is required only when Edit(work/**) or Write(work/**) is granted, as the plan states"

patterns-established:
  - "Plant table gains a fixerPlants array pushed onto plants, so the existing loop and its red-naming check run unchanged"

requirements-completed: [FIX-08, FIX-09, FIX-04]

duration: one session
completed: 2026-10-31
status: complete
---

# Phase 52 Plan 02: Fixer rules in the workflows row

**The workflows row now refuses a fixer job that is unpinned, unscoped, unguarded, widely permissioned or cached, and proves each fault by name against a good fixer triple.**

## Performance

- **Tasks:** 3 (Task 3's admission half is deferred; see Deviations)
- **Files modified:** 1 (`scripts/verify-workflows.mjs`)

## Accomplishments

- `RULES` gains `fixer-pin`, `fixer-debug`, `fixer-tools` and `fixer-prompt`. The header documents each one.
- `fixer-pin`: every claude-code-action step in `release-train.yml` is exactly `anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c`. The tag object `c335fd6d` and any one-digit change are refused. The step must set `path_to_claude_code_executable`, and `show_full_output` or `display_report` set true is refused.
- `fixer-debug`: `ACTIONS_STEP_DEBUG` is refused in the workflow, job or step env of a fixer job or of any job that runs Claude.
- `fixer-tools`: the fix job's `claude_args` needs `--max-turns` and an explicit `--allowedTools`. A bare `Bash` and an `Edit` or `Write` grant that reaches `patches/` are refused. A granted `Edit(work/**)` or `Write(work/**)` needs `--disallowedTools` to deny `Edit(work/**/patches/**)` and `Write(work/**/patches/**)`.
- `fixer-prompt`: the fix job's `if:` must hold the `head_repository` guard, the `claude-fix/` head exclusion and the bot-actor exclusion. `--disallowedTools` must deny `WebFetch` and `WebSearch`. `allowed_bots` must equal `renovate[bot],powerbrowser-bot[bot]`.
- `no-cache` covers `release-train.yml` jobs `fix`, `fix-gate` and `fix-pr` as well as `release.yml`.
- FIX-04: the existing `runner` and `legion` rules are proven for the fixer by a legion plant on `fix` (refused, naming `build-* or matrix-*`) and a bare `self-hosted` plant (refused, naming `"self-hosted"`).

## Verification

- `scripts/verify-platform.sh --only workflows`: PASS, 3 workflows, 4 uses lines pinned and admitted, all 18 rules enforced.
- `scripts/verify-platform.sh --only workflows-self-test`: PASS, 61 planted faults went red naming file, job and rule, 7 controls stayed green. Earlier runs gave the same output (checked by diff).
- Acceptance: `grep -c fixer-pin` = 10; ok lines = 69 (plan minimum 46).
- `scripts/verify-platform.sh --quick` (run after the final code of this plan and of plan 52-01): `verify-platform: PASS -- all checks passed`, exit 0. No new reds.

## Task Commits

1. **Task 1: FIX-08 pin, executable, output flags, debug variable** - `fb98638` (feat, with Tasks 2 and 3 code; see Deviations)
2. **Task 2: FIX-09 tool allowlist and prompt hygiene** - in `fb98638`
3. **Task 3: hosted-only proof, no-cache scope, admission plants** - in `fb98638`; the admission half is not committed (see Deviations)

**Plan metadata:** the `docs(52-02)` commit that adds this file

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The good fixer fixture doubled a pinned-uses prefix**
- **Found during:** the workflows self-test after the first edit
- **Issue:** the fixture interpolated `actions/checkout@` in front of a constant that already contained it, so the `uses-pinned` rule saw a malformed `uses:`
- **Fix:** the fixture now uses the constant directly
- **Committed in:** `fb98638`

### Deferred

**2. [Plan conflict - admissions] `actions-selected.json` is not changed in this plan**
- **Found during:** Task 3, while checking the admission set equality the plan relies on
- **Issue:** `admission-used` refuses any admitted repo that no tree workflow uses, and the tree has no fixer workflow yet. Adding `anthropics/claude-code-action@*` now would turn the tree red. Adding `actions/create-github-app-token@*` is wrong in any case: the admission check skips `actions/*` under `github_owned_allowed` (the `used` set collects only non-GitHub-owned repos), so that entry could never be used and would always be red.
- **Fix:** the only correct admission is `anthropics/claude-code-action@*`. It lands with plan 52-04's fixer workflow, in the same commit as its first use. `actions/*` actions need no entry. The same applies to the `actions/upload-artifact@*` and `actions/download-artifact@*` entries plan 52-04 lists; they should be dropped there.
- **Effect:** the plan's acceptance check for the five-entry admission list (`need=[...]` in 52-04) and this plan's `patterns_allowed` check will fail until 52-04 lands. The admission rules themselves are exercised by the `admitted claude-code-action used by no workflow` plant and by the good fixer triple control.
- **Committed in:** not committed here.

**Total deviations:** 1 auto-fixed, 1 deferred on a plan conflict. **Impact:** the trust-boundary rules are complete and proven; the admission entry for the Claude action moves to plan 52-04.

## Issues Encountered

- The commit message of `fb98638` says "31 planted faults". The correct count of new plants is 23 (the self-test total is 61, of which 38 predate this plan). The commit cannot be amended under the rules of this run, so the count is corrected here.
- The `workflows` row's admission rule, read as the plan asks ("admitted set is a superset of the used set"), does not match the code, which checks set equality. The code was kept; the plan text was not followed where it contradicts `admission-used`.

## Threat Flags

None. The rules reduce the surface named in the threat register (T-52-04, T-52-05, T-52-06); no new network endpoint, credential path or schema is introduced.

## Next Phase Readiness

- Plan 52-04 adds the fixer workflow and the claude-code-action admission. It must drop `actions/create-github-app-token@*`, `actions/upload-artifact@*` and `actions/download-artifact@*` from its admission list, since those actions are GitHub-owned.
- The transitive-execution flag from 52-01 is still open for 52-04.

---
*Phase: 52-claude-fixer-f*
*Completed: 2026-10-31*
