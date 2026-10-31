---
phase: 58-esr-175-l
plan: 01
subsystem: infra
status: complete
tags: [release-train, esr-175, uptake, replay-only, detector, state-machine, self-test, fixtures]

requires:
  - phase: 43-release-train-skeleton-and-upstream-bump-automation-a
    provides: detect-upstreams.mjs (153 guard), release-train.mjs (five-state table, derive/next/render), the two quick self-test rows, the chore/esr-<tag> bump path
provides:
  - detect-upstreams.mjs two-major detection: pinned 153 lane unchanged, uptake 175 lane replay-only, mirror fault plants and a mirror control
  - release-train.mjs UPTAKE_* states with per-key tracking titles, uptake would-write view, branch/tag agreement guard (UNWIRED)
  - release-train.yml uptake-replay job (read-only, one replay definition) and the uptake would-write step in report
  - verify-workflows.mjs uptake-lane rule with four plants (T-58-01 mitigation)
  - docs/RELEASING.md ### ESR 175 uptake (UPS-01, TRAIN-05) subsection
affects: [58-02, 58-03, phase-52 fixer (175 conflict branches), phase-50 release stages]

actuals:
  tokens: 12455    # chars/4 over the realized diff (49820 chars, base 69659b44 to 12cbc67a)
  tasks: 3
  commits: 4       # MEASURED before this summary commit: git rev-list --count 69659b44..HEAD

plan_head_before: 69659b446e1c91aa2654dbc59f5b5123f30b9e07
plan_head_after: 12cbc67ae69194819349ad25e855a768a87a82f0

key-files:
  created:
    - .planning/workstreams/deploy/phases/58-esr-175-l/BLOCKED.md
    - .planning/workstreams/deploy/phases/58-esr-175-l/58-01-SUMMARY.md
  modified:
    - scripts/detect-upstreams.mjs
    - scripts/release-train.mjs
    - scripts/verify-workflows.mjs
    - .github/workflows/release-train.yml
    - docs/RELEASING.md

key-decisions:
  - "The uptake major is a number, UPTAKE_MAJOR = 175, in detect-upstreams.mjs. Every 175 tag is derived from the listing, and no 175 tag literal is written anywhere (the pin sweep stays green)."
  - "The 175 lane has no pin of its own. Its candidate is the newest *esr_RELEASE tag under 175, and the replay runs against it. The manifest keeps the single firefox_esr_tag (A-58-6 choice: train input, not a second manifest key)."
  - "The uptake lane never sets the bump candidate, so bump-pr (gated on candidate) cannot publish a 175 branch. The publish path is unchanged."
  - "The uptake replay reuses rebase-upstream.yml, the one replay definition, with contents: read and no environment. It runs in dry-run too, since it writes nothing."
  - "The uptake lane's refusal reasons name their lane: 'major 153 is not the uptake major 175' and 'major 175 is not the pinned major 153'."
  - "The 153 line's decision logic is unchanged. Its listing now also carries 175 tags, which the 153 guard refuses, so its notes gain only the uptake note."

patterns-established:
  - "A second lane is a second state set (UPTAKE_*), derived by its own function and checked by the same set-equality table. A fixture never derives through the other lane's table."
  - "The uptake view prints the state, the action and the exact title, and writes nothing, until the live writer is approved."

metrics:
  duration: "single session"
  completed: "2026-10-31"

self-check: PASSED
---

# Phase 58 Plan 01: ESR 175 uptake detection and train Summary

**Two-major detector and train: the 175 uptake lane detects the newest 175 tag, replays it read-only through the one replay definition, and keeps its states, its release key and its branch naming apart from the 153 line, with each guard refusing the other major and fixtures proving it.**

## Performance

- **Tasks:** 3 (Task 1 detector, Task 2 train states and the workflow job, Task 3 trust rule, docs and blocks)
- **Commits:** 4 code and doc commits, plus this summary commit
- **Quick gate:** `scripts/verify-platform.sh --quick` exit 0, 210 rows PASS (`verify-platform: PASS -- all checks passed`). The run was on the tree after `12cbc67a`.
- **Baseline:** `scripts/verify-platform.sh --quick` on the clean tree before any edit, exit 0, `verify-platform: PASS -- all checks passed`.

## Accomplishments

- `detect-upstreams.mjs`: `UPTAKE_MAJOR = 175`, `decideUptake` (newest 175 `*esr_RELEASE`, replay-only, never a branch), `classifyTag(tag, major, role)` so refusals name their lane, `--uptake-major` mode, and `uptake-candidate=` output for the workflow.
- `release-train.mjs`: four `UPTAKE_*` states (`UPTAKE_DETECTED` replay-only, `UPTAKE_CONFLICT` conflict-issue, `UPTAKE_RED` wait-owner, `UPTAKE_REPLAYED` note), `deriveUptake`, `uptakeGuard`, `uptakeWouldWrite` and the `--uptake-would-write` CLI. `ALL_STATES` is the set-equality table: 9 states, 9 fixtures with literal actions.
- `release-train.yml`: the detect listing matches both majors (the uptake number comes from `--uptake-major`, so it lives in one place), a read-only `uptake-replay` job calls `rebase-upstream.yml`, and the report job prints the uptake would-write view.
- `verify-workflows.mjs`: `uptake-lane` rule (no write scope, no environment, one replay definition), with four plants.
- `docs/RELEASING.md`: `### ESR 175 uptake (UPS-01, TRAIN-05)`.

## Task Commits

1. **Task 1: two-major detection** - `da840c27` (feat). Detector: 175 lane, refusal roles, mirror control, two uptake plants.
2. **Task 2: parallel train states** - `e3b1727f` (feat). Train: UPTAKE_* states, fixtures, set-equal table, uptake would-write view, branch/tag guard (UNWIRED).
3. **Task 2 and 3: the workflow lane and its trust rule** - `80a11fd2` (feat). Workflow: detect listing, `uptake-replay`, report view. Verify-workflows: `uptake-lane` rule with four plants.
4. **Task 3: docs and owner blocks** - `12cbc67a` (docs). RELEASING.md uptake subsection; BLOCKED.md.

## Verification (quoted from the `--quick` run)

- `detect-upstreams: --self-test PASS -- the 175.0esr fixture yields FIREFOX_153_23_0esr_RELEASE as a bump, 11 planted faults went red naming their drift, and 4 controls stayed green (the 153 line and the 175 uptake lane each guard the other)`
- `release-train-logic: --self-test PASS -- 9 states set-equal to 9 fixtures, 17 planted faults went red naming their drift, and 10 controls stayed green`
- `workflows: PASS -- 6 workflow(s), 22 uses: line(s) pinned and admitted, rules enforced: ... dry-run-gate, bot-job-gate, uptake-lane`
- `workflows-self-test: PASS` (the four `uptake-lane` plants each went red naming `.github/workflows/release-train.yml job uptake-replay [uptake-lane]`)
- `zizmor: PASS -- zizmor 1.29.0 --offline ... No findings to report.`
- `verify-upstream-pins: PASS`, `verify-upstream-pins-self-test: PASS`
- Brand scan: `scan-brand-residue: PASS -- no residual brand occurrence in 480 scanned file(s)` (after staging BLOCKED.md)

**Would-write evidence (the 153 and 175 keys differ):** a 153 candidate renders `release-train: v153.23.0-1`; a 175 candidate renders `release-train: v175.0.0-1`. A 175 conflict renders `ESR FIREFOX_175_0_0esr_RELEASE: patch 030 did not apply` from the real stage line `apply-patches: FAIL -- 030-powerbrowser-mar-certificates.patch did not apply (real conflict, not silent)`. The 153 would-write output is unchanged.

## Reuse-versus-change verdicts

- **Replay job shape: changed.** A new `uptake-replay` job was added. It reuses the bump job's shape (job-level `uses:` of `rebase-upstream.yml`, `contents: read`, no environment, no App token, no publish step). Because the job is new, the `uptake-lane` rule and four plants were added (T-58-01).
- **Detect listing: changed.** The grep matches the pinned major and the uptake major. The uptake major is read from the detector, so no literal is written.
- **Publish path (`bump-pr`, `bump-pr-node`): unchanged.** The uptake lane never sets `candidate`, so the bump job and its branch cannot run for a 175 tag.
- **`scripts/verify-platform.sh`: unchanged.** The two existing rows (`detect-upstreams-self-test`, `release-train-logic-self-test`) carry the extended fixtures. No row was added, per the plan's "registry rows for the extended self-tests".
- **Dry-run: unchanged contract.** `uptake-replay` runs in a dry run, since it writes nothing. The report prints the view.
- **153 bump logic: unchanged.** `decide()` gained only the uptake result and one note line. The 153 guard refuses 175 tags as before.

## Deviations from Plan

### Auto-added

**1. [Rule 2 - Missing critical] `uptake-lane` rule and four plants.** The plan asked for a write-scope plant if the replay job's shape changed (T-58-01). The new job is a shape change, so the rule holds it to read-only scope, no environment and one replay definition. Four plants each go red.

### Not delivered live (BLOCKED, see `BLOCKED.md`)

**2. The live 175 tracking issue and the conflict issue are not written.** The plan's must-have "a conflict opens or updates exactly one `ESR <tag>: patch <NNN> did not apply` issue" is met only as the would-write view. The live writer is the same unwired decision as Phase 43 BLOCKED.md item 3. Owner decision: BLOCKED.md item 1.

**3. Replay cadence is per tick.** While a 175 tag is listed, each hourly tick replays it (about 1.1 GB clone, up to 60 minutes). Owner decision: BLOCKED.md item 2. Executor default: per tick, as built.

**4. Lane start is the release tag, not the beta.** The lane keys on `*esr_RELEASE` tags, as the Phase 43 contract does. Such a tag is cut at the ESR release (2027-06-29), not at the beta (2027-06-10). Owner decision: BLOCKED.md item 3.

### Shortcuts (coded, recorded)

- `branchTagFailure` (release-train.mjs) is UNWIRED. Publish derives the branch from the tag (`esrBranch`), so the guard can only ever see a branch the code named. It is kept, with its plant, for any future writer that takes a branch name from elsewhere. The same convention as the Phase 43 UNWIRED rows.
- The live `dry-run: true` dispatch was not run. A dispatch is a GitHub write, so it is an owner action (Phase 43 BLOCKED.md item 2). The dry-run contract is proven statically: the `uptake-lane` rule, the dry-run-gate rule and the `uptake-replay` job's read-only shape.

## Calendar pointer for the live replay

- Nightly 2027-05-27, beta 2027-06-10, release 2027-06-29 (`175.0esr` is published and `FIREFOX_ESR` moves). ESR 153 ends with 153.27 on 2027-09-07.
- The first live uptake replay runs on the first listed `FIREFOX_175_*esr_RELEASE` tag. Unless BLOCKED.md item 3 is decided otherwise, that is 2027-06-29.

## Known Stubs

None. Every new state, guard and plant is wired to a fixture, a test or a workflow step. The UNWIRED `branchTagFailure` is recorded above as a shortcut, not a stub.

## Threat Flags

None. The new job calls the existing reusable replay with read scope and no secret. It adds no new endpoint, auth path or write surface.

## Self-Check: PASSED

- FOUND: `scripts/detect-upstreams.mjs` (commit `da840c27`)
- FOUND: `scripts/release-train.mjs` (commit `e3b1727f`)
- FOUND: `.github/workflows/release-train.yml`, `scripts/verify-workflows.mjs` (commit `80a11fd2`)
- FOUND: `docs/RELEASING.md`, `.planning/workstreams/deploy/phases/58-esr-175-l/BLOCKED.md` (commit `12cbc67a`)
- `scripts/verify-platform.sh --quick` exit 0 on the tree after `12cbc67a`
