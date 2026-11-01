---
phase: 40-release-identity-esr-pin-and-patch-regeneration-a
plan: 02
subsystem: infra
tags: [patch-stack, git-apply-3way, regeneration, verify-platform, rebase-upstream]
status: complete

requires:
  - phase: 40-01
    provides: "upstream/ at FIREFOX_153_5_1esr_RELEASE (6cd88e7d) with the four patches applied and staged by --3way"
provides:
  - "scripts/regenerate-patches.sh: write mode, --check, --self-test, --upstream DIR, --patches DIR, one shared regenerate_one"
  - "Quick rows patches-regenerated and patches-regenerated-self-test"
  - "rebase-upstream.sh step 4a: regenerate-patches.sh --check after check-patch-surface, in the real run and the --dry-run listing"
affects: [40-08 first dispatch of rebase-upstream.yml, any future patch change]

actuals:
  tokens: 3300
  tasks: 2
  commits: 2
plan_head_before: ecaa9893ffe88c6b0c5b64121abc751df5ddc183
plan_head_after: 5a4badcfbbabeb8824d44045a12150e470294115

tech-stack:
  added: []
  patterns:
    - "Byte-pinned git diff: GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1, core.abbrev=10, --abbrev=10, myers, no ext-diff/textconv/color, diffed against HEAD because --3way stages its result"
    - "Write mode validates every regeneration into a temp file beside its patch before any rename, so a refusal changes no tracked byte"

key-files:
  created:
    - scripts/regenerate-patches.sh
  modified:
    - scripts/verify-platform.sh
    - scripts/rebase-upstream.sh

key-decisions:
  - "Write mode validates all patches first and renames only after every regeneration passed, so a refusal on a later patch cannot leave the stack half rewritten"
  - "The --dry-run 4a line is a single-quoted echo so its source text carries regenerate-patches.sh\" --check and the printed command pastes as a quoted path"

patterns-established:
  - "A patch changes only through bash scripts/regenerate-patches.sh from a correctly patched upstream/; --check is the gate"

duration: 15min
completed: 2026-10-20
---

# Phase 40 Plan 02: Patch Regeneration Gate Summary

**`regenerate-patches.sh --check` re-derives all four tracked patches from the applied 153.5.1 upstream/ with a byte-pinned `git diff HEAD` and `cmp`s them. It is registered as a quick row and runs inside every rebase replay. A hermetic six-case self-test proves that a hand-edited hunk goes red naming its patch.**

## Performance

- **Duration:** about 15 min
- **Completed:** 2026-10-20
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `bash scripts/regenerate-patches.sh --check` prints `PASS -- 4 patch(es) equal their regeneration from upstream/`. A planted `+` line edit in a copy of 020 goes red naming 020-powerbrowser-shell.patch.
- In write mode the script regenerates into temp files beside the patches, validates every one (non-empty, starts with `diff --git a/`), and only then renames. Run against the real tree it printed `unchanged` four times, and `git diff -- patches/` stayed empty.
- The script fails by name in these cases, and none of them is a skip:
  - upstream/ is absent
  - patches/ holds no patches
  - a patch has no `+++ b/` path
  - two patches name the same path (both are named)
  - a regeneration comes back empty (the message points to apply-patches.sh)
- `--self-test` passes all six cases: control, hand-edited hunk, pristine upstream, adjacency, refused write leaving the sha256 unchanged, and a stale patch rewritten so that --check then passes.
- rebase-upstream.sh runs the check after check-patch-surface, so the CI replay in rebase-upstream.yml carries the gate without a workflow edit.

## Task Commits

1. **Task 1: --check end to end, registered and wired into the replay** - `37da6f2` (feat)
2. **Task 2: safe write mode and hermetic --self-test** - `5a4badc` (feat)

## Files Created/Modified

- `scripts/regenerate-patches.sh` - new, mode 0755: regenerate_one, preflight, run_check, run_write, run_self_test
- `scripts/verify-platform.sh` - two quick CHECKS rows at the end of the quick array
- `scripts/rebase-upstream.sh` - step after check-patch-surface, plus the `4a.` --dry-run line

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] EXIT trap referenced a function-local temp dir**
- **Found during:** Task 1
- **Issue:** `trap 'rm -rf "$tmp"' EXIT` with `local tmp` fired after the local had gone out of scope, so `set -u` aborted with "tmp: unbound variable" after the PASS line, and the row failed.
- **Fix:** `tmp` is a global in run_check and run_self_test, and write mode's temp list is global as well.
- **Files modified:** scripts/regenerate-patches.sh
- **Commit:** 37da6f2

**2. [Plan text] Row placement and two acceptance greps**
- The quick array now ends with `plan-gate-streams-self-test`, added after the plan was written, so the rows went at the true end of the array rather than directly after `planning-paths-self-test`.
- The two registry acceptance greps (`grep -c 'patches-regenerated|bash $REPO_ROOT/...'`) print 0 as written, because GNU grep reads `$` in a basic regular expression as an anchor. With `grep -cF` each prints 1, which is the intended assertion.
- The rebase-upstream grep (`regenerate-patches.sh" --check`) prints 2 as the plan specifies.

**3. [Tracer gate]** Task 1's `<verify>` was re-run end to end after its commit and passed before Task 2 began.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None.

## Next Phase Readiness

- AUTO-10 is gated. Any later patch change must go through `bash scripts/regenerate-patches.sh`.
- The first real exercise of step 4a in CI is the 40-08 dispatch of rebase-upstream.yml.

## Self-Check: PASSED

- FOUND: scripts/regenerate-patches.sh (executable)
- FOUND: 37da6f2, 5a4badc (ancestors of HEAD)
- `scripts/verify-platform.sh --quick`: PASS, all checks passed at 5a4badc
