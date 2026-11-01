---
phase: 40-release-identity-esr-pin-and-patch-regeneration-a
plan: 01
subsystem: infra
tags: [firefox-esr, upstream-pin, github-actions, workflow_call, nix, verify-upstream-pins]

requires:
  - phase: 18
    provides: "FIREFOX_153_5_0esr_BUILD1 pin, rebase-upstream.sh, verify-upstream-pins.mjs"
provides:
  - "Tree pinned to FIREFOX_153_5_1esr_RELEASE (commit 6cd88e7d45fe7a5b0b87b984fb32a8779151860e) with the four patches replayed unchanged"
  - "rebase-upstream.yml callable (workflow_call) and dispatchable, tag input required with no default, generator steps inside nix develop .#theia"
  - "verify-upstream-pins step 2: both triggers declare tag, no default under any tag input, generator steps Nix-wrapped; workflow swept for tag literals"
affects: [40-08 owner push and first dispatch, 43 AUTO-06 release train, 41 zizmor]

actuals:
  tokens: 7033
  tasks: 2
  commits: 2
plan_head_before: 2c8581d4e85b315e5acc6d3c829935ba52e2a110
plan_head_after: 05d282bdc8677223c93e16600c22da19c4f789e7

tech-stack:
  added: []
  patterns:
    - "Indentation-aware YAML line scan (no YAML library) for workflow structure assertions"
    - "Self-test plants carry an assertion-specific marker, so a plant cannot pass on another assertion's failure"

key-files:
  created: []
  modified:
    - configuration.toml
    - .github/workflows/rebase-upstream.yml
    - scripts/verify-upstream-pins.mjs
    - README.md
    - docs/BUILD.md
    - docs/REBRANDING.md

key-decisions:
  - "The rebase workflow carries no tag at all; it is swept by verify-upstream-pins step 4 like any other in-scope file (only the manifest and the checker itself are excluded)"
  - "Self-test default plants use a non-tag value (self-test-plant) so the default assertion, not the literal sweep, is what turns them red"

patterns-established:
  - "Workflow input defaults are forbidden on the rebase workflow; the caller (owner dispatch or release train) passes the tag"

requirements-completed: [DIST-06, AUTO-08]

coverage:
  - id: D1
    description: "Pin FIREFOX_153_5_1esr_RELEASE; upstream/ at 6cd88e7d with all four patches applied; --quick green; own commit before AUTO-08"
    requirement: DIST-06
    verification:
      - kind: integration
        ref: "test \"$(git -C upstream rev-parse HEAD)\" = 6cd88e7d45fe7a5b0b87b984fb32a8779151860e && scripts/verify-platform.sh --only verify-upstream-pins && scripts/verify-platform.sh --quick"
        status: pass
    human_judgment: false
  - id: D2
    description: "rebase-upstream.yml: workflow_call + workflow_dispatch, tag required/type string/no default, Install Nix, five Nix-wrapped generator/identity/rebase steps; enforced by verify-upstream-pins with five self-test plants"
    requirement: AUTO-08
    verification:
      - kind: unit
        ref: "scripts/verify-platform.sh --only verify-upstream-pins && scripts/verify-platform.sh --only verify-upstream-pins-self-test && scripts/verify-platform.sh --quick"
        status: pass
    human_judgment: false
  - id: D3
    description: "First dispatched rebase-upstream.yml run green on GitHub"
    requirement: DIST-06
    verification: []
    human_judgment: true
    rationale: "Owner action in plan 40-08 (push and dispatch); no task in this plan pushes"

duration: 15min
completed: 2026-10-20
status: complete
---

# Phase 40 Plan 01: ESR pin bump and callable Nix rebase workflow Summary

**Tree moved to FIREFOX_153_5_1esr_RELEASE (6cd88e7d, four patches replayed unchanged in 474 s), and rebase-upstream.yml became a callable, defaultless workflow whose generator steps run inside `nix develop .#theia`, enforced by verify-upstream-pins with five planted faults.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-10-20T23:28:26Z
- **Completed:** 2026-10-20T23:43:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- DIST-06: `configuration.toml:115` and the workflow default moved to `FIREFOX_153_5_1esr_RELEASE` together; `generated/upstream-pins.env` regenerated; `upstream/` re-materialised through `scripts/rebase-upstream.sh` at `6cd88e7d45fe7a5b0b87b984fb32a8779151860e` (`config/milestone.txt` = 153.5.1); all four patches applied cleanly to the same five files; check-patch-surface and the brand scan over 460828 upstream files passed.
- Measured rebase wall time: **474 s** (clone 370 s), versus 340 s / 279 s at the previous pin.
- AUTO-08: `rebase-upstream.yml` has `workflow_call` and `workflow_dispatch` triggers, each with `tag` required, `type: string`, no default. "Free disk space" moved ahead of a new "Install Nix" step (same SHA as verify.yml). generate, `--check`, both identity checks and the rebase run as `nix develop .#theia --command ...`. `REBASE_TAG` still reaches bash only through `env:` (T-40-01). `permissions: contents: read` and `persist-credentials: false` kept; no push step.
- `verify-upstream-pins.mjs` step 2 now asserts (a) both triggers declare `tag`, (b) no `default:` under any `tag` input, (c) every `run:` command naming generate.mjs / verify-generated-identity.mjs / rebase-upstream.sh starts with `nix develop .#theia --command`. The workflow is no longer excluded from the step 4 literal sweep. Self-test: 8 plants (5 new workflow plants), all red naming the drifted file.

## Task Commits

1. **Task 1: DIST-06 pin FIREFOX_153_5_1esr_RELEASE, replay, --quick green** - `ad9fc4d` (feat)
2. **Task 2: AUTO-08 callable workflow, no tag default, generators in Nix, enforced** - `05d282b` (feat)

## Files Created/Modified

- `configuration.toml` - pin line 115; [upstreams] comment says the workflow receives the tag as an input (it carries no copy)
- `.github/workflows/rebase-upstream.yml` - triggers, Install Nix, Nix-wrapped steps, rewritten header comment, no tag literal
- `scripts/verify-upstream-pins.mjs` - new step 2 (workflowFailures + indentation helpers), sweep exclusion dropped, five workflow plants
- `README.md` - Status pin
- `docs/BUILD.md` - "Pinned ESR (Phase 40, DIST-06)" paragraph with tag, SHA, ls-remote date, timing
- `docs/REBRANDING.md` - `upstreams.firefox_esr_tag` Reaches cell drops the workflow mirror

## Decisions Made

- The workflow is swept for tag literals like any other file (manifest and checker remain the only carriers).
- Default-under-tag plants insert `default: self-test-plant`, not a tag, and every plant checks an assertion-specific marker in the failure text, so each plant proves its own assertion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] WR-09 comment reworded so the acceptance greps count only the YAML keys**
- **Found during:** Task 2
- **Issue:** The WR-09 comment spelled `` `contents: read` `` and `` `persist-credentials: false` ``, so `grep -c` printed 2 for each, not the required 1.
- **Fix:** Reworded the comment to "a read-only contents scope plus a checkout that does not persist the credential"; meaning unchanged.
- **Files modified:** .github/workflows/rebase-upstream.yml
- **Committed in:** 05d282b

**2. [Rule 1 - Bug] [upstreams] comment re-wrapped to keep the pin on line 115**
- **Found during:** Task 2
- **Issue:** The longer replacement wording pushed `firefox_esr_tag` to line 116, while this plan and later ones cite `configuration.toml:115`.
- **Fix:** Re-wrapped the paragraph to its original 10 lines; the Theia wording is unchanged.
- **Files modified:** configuration.toml
- **Committed in:** 05d282b

**3. [Scope note] BUILD.md: dropped the old-pin dev-build timing sentence**
- **Found during:** Task 1
- **Issue:** The replaced paragraph ended with the 2388 s clobbered dev build at the previous pin. No build was run at the new pin.
- **Fix:** Removed the sentence from the pin paragraph. The same figure stays in attributed timing row #4, which was left untouched as the plan requires.
- **Committed in:** ad9fc4d

**Total deviations:** 2 auto-fixed (Rule 1), 1 scope note. **Impact:** none on behaviour; all keep the plan's acceptance greps exact.

## DIST-06 flagged-assumption outcome

The pin bump was atomic across the expected surfaces: the manifest line, the workflow default mirror, regenerated `generated/upstream-pins.env`, and re-cloned `upstream/` at `6cd88e7d`. Two docs (README Status and the BUILD.md pin paragraph) also changed, as the plan specified. Nothing else changed. `generate.mjs --check` passed over all 53 generated files, so no other generated output moved. No patch changed: `git -C upstream diff --cached --name-only` lists the same five files.

## Issues Encountered

- `grep -n 'firefox_esr_tag' configuration.toml` also matches the comment at line 104 (it was already there before this plan). The assignment line is exactly `115:firefox_esr_tag = "FIREFOX_153_5_1esr_RELEASE"`.

## User Setup Required

None.

## Next Phase Readiness

- Ready for 40-02. The owner's push and the first `gh workflow run rebase-upstream.yml --ref workspace/deploy -f tag=FIREFOX_153_5_1esr_RELEASE` belong to plan 40-08.
- Not verified locally: whether `nix develop .#theia` on a GitHub runner has the free disk to also hold the 5.6 GB clone. Disk is freed before Nix installs, so the first dispatch will show it.

## Self-Check: PASSED

- Files: all six modified files exist; `40-01-SUMMARY.md` written.
- Commits: `ad9fc4d` and `05d282b` are ancestors of HEAD; `git rev-list --count 2c8581d..HEAD` = 2.
- Re-run: Task 1 criteria (upstream HEAD 6cd88e7d, milestone 153.5.1, five cached paths, fragment, docs) and Task 2 criteria (workflow_call 1, type string 2, nix prefix 5, cachix SHA 1, persist-credentials 1, contents read 1, REBASE_TAG env 1, checker exit 0, self-test 5 workflow ok lines) all pass; `scripts/verify-platform.sh --quick` PASS.

---
*Phase: 40-release-identity-esr-pin-and-patch-regeneration-a*
*Completed: 2026-10-20*
