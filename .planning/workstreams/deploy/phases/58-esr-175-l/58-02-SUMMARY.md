---
phase: 58-esr-175-l
plan: 02
subsystem: infra
status: complete
tags: [esr-175, rebase, regeneration, patch-stack, pin-sweep, toolchain-baseline, replay-only, control-run]

requires:
  - phase: 58-esr-175-l
    plan: 01
    provides: uptake-replay lane, UPTAKE_* states, the uptake candidate output the pin sweep checks
  - phase: 45-container-toolchain (Phase 45 PKG-17)
    provides: toolchain-baseline.sh --container mode and the container line order in toolchain-baseline.txt
provides:
  - docs/RELEASING.md "Rebase onto 175 (UPS-01)": replay steps, drift-risk order with invariants, NOTE and FAIL rules, no-hand-edit rule, toolchain re-record rule
  - apply-patches.sh --upstream and --patches overrides (defaults unchanged)
  - verify-upstream-pins.mjs step 8: the uptake-replay tag must come from the detector listing; three plants
  - BLOCKED.md item 4: the container image digest decision
affects: [58-03 (owner checkpoint: ship checklist), phase-52 fixer (175 conflict branches), phase-49 toolchain drift gate]

actuals:
  tokens: 3261     # chars/4 over the realized diff (13044 chars, base 4aa3b71b to 9b3ae16e)
  tasks: 3
  commits: 4       # MEASURED before this summary commit: git rev-list --count 4aa3b71b..HEAD

plan_head_before: 4aa3b71b924572182cbc67f0171a8e852af04748
plan_head_after: 9b3ae16e3a689d14acfb5506d2cd15d9267c3670

key-files:
  created:
    - .planning/workstreams/deploy/phases/58-esr-175-l/58-02-SUMMARY.md
  modified:
    - scripts/apply-patches.sh
    - scripts/verify-upstream-pins.mjs
    - docs/RELEASING.md
    - .planning/workstreams/deploy/phases/58-esr-175-l/BLOCKED.md
  unchanged:
    - toolchain-baseline.txt (byte-identical to HEAD, as the plan requires before the real 175 image exists)
    - scripts/toolchain-baseline.sh (container mode already present from Phase 45)
    - scripts/regenerate-patches.sh, scripts/check-patch-surface.sh, patches/*.patch

key-decisions:
  - "A-58-6 executor choice: no second [upstreams] key and no per-train parameter. The 175 tag is the detector's uptake candidate, passed as a train input into uptake-replay. configuration.toml keeps one pin, and the literal sweep finds nothing outside the carriers."
  - "The pin sweep gains step 8 (uptake tag source) rather than a new literal rule: the job's tag input must be sourced from needs.detect.outputs.uptake-candidate and from nothing else."
  - "apply-patches.sh gains --upstream and --patches. The plan assumed these flags existed. The script had hard-coded upstream/ and patches/, so the control could not run on a scratch tree without them. Defaults are unchanged."
  - "The control run is a scratch clone at the pinned commit 6cd88e7d, not the live upstream/. The live tree is not reset."
  - "toolchain-baseline.sh needs no change: the container mode (Phase 45) already measures the clang, rust, cargo, cbindgen, sysroot, glibc-ceiling and image lines in the file's line order."

patterns-established:
  - "A control run on a scratch clone at the pinned commit proves the replay chain before a new tag exists. The conflict path is proven by planting a context change in a second scratch copy."

metrics:
  duration: "single session"
  completed: "2026-10-31"

self-check: PASSED
---

# Phase 58 Plan 02: Rebase onto 175 and the 175 toolchain baseline Summary

**The 175 rebase procedure is recorded and proven on the pinned 153.5.1 tree: the replay, regeneration check, surface check and brand scan are green on a scratch clone, and a planted conflict is named by its patch number. The uptake tag source is checked by the pin sweep, and the toolchain container line is recorded with its digest gap sent to the owner.**

## Performance

- **Tasks:** 3 (Task 1 rebase procedure and control run, Task 2 pin sweep, Task 3 toolchain baseline)
- **Commits:** 4 code and doc commits, plus this summary commit
- **Quick gate:** `scripts/verify-platform.sh --quick` exit 0, `verify-platform: PASS -- all checks passed`, 210 rows (run on the tree at `9b3ae16e`).

## Task Commits

1. **Task 1: scratch-target overrides for the replay** - `4b15b4eb` (feat). `apply-patches.sh --upstream` and `--patches`.
2. **Task 1: rebase procedure in RELEASING.md and the toolchain re-record rule** - `c9e6ec6f` (docs).
3. **Task 2: uptake tag-source step in the pin sweep** - `6263eb90` (feat). Step 8 and three plants.
4. **Task 3: image digest decision for the owner** - `9b3ae16e` (docs). BLOCKED.md item 4.

## Task 1: the rebase procedure and its control run

The control runs the replay chain on a scratch clone at the pinned commit `6cd88e7d` (153.5.1). The live `upstream/` is not touched. Each line below is quoted from the run.

- Replay: `apply-patches: all 4 patches applied and verified non-vacuous` (each of `browser/moz.configure`, `browser/moz.build`, `toolkit/mozapps/update/updater/moz.build`, and the two NSIS files applied cleanly).
- Regeneration check: `regenerate-patches: PASS -- 4 patch(es) equal their regeneration from upstream/ (0 on moved upstream files, compared on their added and removed lines)`.
- Surface: `check-patch-surface: PASS -- no compiled-file target paths and no brand values in 4 patch(es)`.
- Brand scan: `scan-brand-residue: PASS -- no residual brand occurrence in 480 scanned file(s), plus 460828 file(s) under --extra-root` (the scratch tree).

**Conflict control.** A second scratch clone had one context line of `toolkit/mozapps/update/updater/moz.build` changed, the line patch 030 adds to. The replay printed:

`apply-patches: FAIL -- 030-powerbrowser-mar-certificates.patch did not apply (real conflict, not silent)`

The train's `PATCH_NUMBER` rule reads that line as patch `030`, so the conflict issue title is `ESR <tag>: patch 030 did not apply`. The stage line and the title agree.

**NOTE path.** A moved file with matching `+` and `-` lines is not exercised on a real 175 tree, because no 175 tag exists yet. It is covered by the hermetic moved-file fixture in `regenerate-patches.sh --self-test`, which the `patches-regenerated-self-test` row runs. The live NOTE waits for the 175 replay (BLOCKED.md item 3 of 58-01 sets the start).

**Invariants.** Each patch's invariant line was checked in its `+` lines before it was written into the docs: 030 (fork certificate in both slots), 040 (AppName, CERTIFICATE_NAME, the blank TELEMETRY_BASE_URL, the ping early return), 010 (`include("../identity.configure")`), 020 (the `DIRS` entry).

**Deviation.** The plan assumed `apply-patches.sh --upstream <scratch>` existed. It did not. Adding the flags is a Rule 3 fix (the control could not run without them), and the defaults are unchanged. `apply-patches.sh --self-test` stays green (three PASS lines), and an unknown argument is refused with exit 2.

## Task 2: the two-pin shape and the sweep

**Executor choice (A-58-6).** The 175 tag is not a second manifest key and not a per-train parameter. It is the detector's uptake candidate, a train input that the `uptake-replay` job receives. `configuration.toml` keeps one `firefox_esr_tag`, so `generate.mjs`, the fragment and `fetch-upstream.sh` are unchanged.

**The sweep.** Step 4 (the literal sweep) already covers `.github/` text, so a tag literal in the uptake job is red. Step 8 is new: the uptake job's `tag:` input must be `${{ needs.detect.outputs.uptake-candidate }}` and nothing else. Three plants go red naming `.github/workflows/release-train.yml`: a literal tag, a tag from `needs.detect.outputs.candidate` (the 153 candidate), and a renamed job.

**Evidence.**
- `verify-upstream-pins: PASS` (the manifest pin agrees, with no second literal, and the Theia pin agrees across 8 member files and the lockfile)
- `verify-upstream-pins: --self-test PASS -- 11 planted faults went red naming the drifted file (8 pin plants and 3 uptake-source plants)`
- `git grep 'FIREFOX_[0-9]' -- scripts .github` finds no tag literal outside the carriers (the manifest, the checker and the fixtures).

## Task 3: the 175 toolchain baseline

- `scripts/toolchain-baseline.sh` already has a container mode (`--container`, Phase 45). It measures the clang, rust, cargo, cbindgen, sysroot, glibc-ceiling and image lines in the file's line order, refuses to run on a host, and drifts on any line that differs. No code change was needed.
- `toolchain-baseline.txt` is byte-identical to HEAD (`git diff --exit-code` is clean). The plan requires this until the 175 image exists. The file's comment says so: `UNMEASURED` lines never match, so the drift diff fails.
- `toolchain-baseline-self-test: PASS` (matching baseline green, planted sysroot mismatch red naming sysroot, planted UNMEASURED line red).
- **Gap.** The plan's container set names an image digest. The compared `image` line records the OS codename (`image pb-gecko-build <VERSION_CODENAME>`), and the digest is a host-measured comment that the drift diff skips. A container cannot read its own digest, so comparing it needs a host measurement and a change to the drift contract. Recorded as BLOCKED.md item 4, with the executor default kept.
- **Re-record rule** is in RELEASING.md under "Rebase onto 175": the file is re-recorded once, against the 175 release container that `build-linux` uses, with `toolchain-baseline.sh --container` run inside it after its bootstrap build. Each measured line is copied, never typed. The D-73 tuple (tree, host, container image, date) goes beside the new baseline, and the 153 baseline is never reused for a 175 build.

## Deviations from Plan

1. **Rule 3, blocking: `apply-patches.sh` had no scratch-tree override.** Added `--upstream` and `--patches` with unchanged defaults (see Task 1).
2. **Task 3 needed no code change.** The container mode already exists from Phase 45. The shape is proven by the existing self-test and by the file's comment, not by a new edit.
3. **The image digest is not in the drift comparison.** Recorded as BLOCKED.md item 4 (owner decision, executor default kept).

## Calendar pointer for the live 175 work

- The live 175 replay and the conflict path run on the first 175 tag (BLOCKED.md item 3 of 58-01 sets the start; release-day 2027-06-29 unless the owner decides otherwise).
- The toolchain re-record happens once the 175 container image exists, after its bootstrap build, before the first 175 build (2027-06-29 at the earliest on the current calendar).
- The 175 ship checklist and its owner checkpoint are plan 58-03, which this run did not execute.

## Known Stubs

None. The control run and the sweep plants run on the real files, and every new check has a plant or a green control.

## Threat Flags

None. The new sweep step reads one workflow file and adds no endpoint, secret or write path. The `apply-patches.sh` overrides change only the directory the script reads, with defaults unchanged.

## Self-Check: PASSED

- FOUND: `scripts/apply-patches.sh` (commit `4b15b4eb`)
- FOUND: `docs/RELEASING.md` (commit `c9e6ec6f`)
- FOUND: `scripts/verify-upstream-pins.mjs` (commit `6263eb90`)
- FOUND: `BLOCKED.md` item 4 (commit `9b3ae16e`)
- `toolchain-baseline.txt` byte-identical to HEAD
- `scripts/verify-platform.sh --quick` exit 0 on the tree at `9b3ae16e`
