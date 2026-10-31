---
phase: 58-esr-175-l
reviewed: 2026-10-31T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - .github/workflows/release-train.yml
  - scripts/detect-upstreams.mjs
  - scripts/release-train.mjs
  - scripts/apply-patches.sh
  - scripts/verify-upstream-pins.mjs
  - scripts/verify-workflows.mjs
  - docs/RELEASING.md
  - .planning/workstreams/deploy/phases/58-esr-175-l/BLOCKED.md
findings:
  critical: 0
  warning: 7
  info: 4
  total: 11
status: issues_found
---

# Phase 58: Code Review Report

**Reviewed:** 2026-10-31
**Depth:** standard (cross-file on the uptake lane, detector to workflow to report)
**Base:** `69659b44..HEAD` on `dsh/phase-58`

## Summary

The primary question holds: the 175 lane cannot publish. `uptake-replay` is a `uses:` call to
`rebase-upstream.yml` with `contents: read`, no `environment`, no `secrets`, and the callee runs
`rebase-upstream.sh` inside the runner only (it removes and re-clones the runner-local `upstream/`
and runs `regenerate-patches.sh --check`, never write mode). No bump job, branch, PR, Release or
dispatch consumes `uptake-candidate`. The live 153 pin (`configuration.toml`) and `patches/` are not
written by any new step. The tag reaches the callee as `with: tag:` then `env: REBASE_TAG`, never
interpolated into `run:`, and `rebase-upstream.sh` re-validates it as `[A-Za-z0-9._-]+`. The
detector accepts only `^[A-Za-z]+_N_N(_N)?esr_RELEASE$` after the workflow's anchored `FIREFOX_` grep,
so a hostile tag name cannot reach a path or shell. No Phase 43 fix regressed in behaviour (all four
`--self-test` drivers and `verify-platform.sh --quick` are green here).

No BLOCKER. The defects are: one self-test plant that proves only an unwired helper (the pattern
Phase 43 WR-07 removed), result masking in the report view, the lane never retiring after the flip,
an untested detector-to-job wiring, two documentation claims the code does not meet, and an
unvalidated relative-path hazard in the new `apply-patches.sh` flags.

## Warnings

### WR-01: `branchTagFailure` plant proves an unwired helper (Phase 43 WR-07 pattern returns)

**File:** `scripts/release-train.mjs:155-163`, `scripts/release-train.mjs:662-668`
**Issue:** `branchTagFailure` is marked UNWIRED in its own doc comment and has no caller outside the
self-test (`grep -rn branchTagFailure scripts` finds only its definition and the one plant). The
plant `a bump branch named for a 175 tag while its tag is 153` calls the helper directly with a
hand-built branch string and requires it to go red. It therefore passes whether or not any publish
path can produce a mismatched branch; it proves the helper's own string compare, not a rule on the
train. Phase 43 WR-07 (43-REVIEW-FIX.md) dropped exactly this class of plant for `findExactlyOne`,
`admitWakeRun` and `classifyRelease` and marked them UNWIRED "with no plant". The count line
("17 planted faults went red") includes it, so the number overstates the enforced rules.
**Failure scenario:** `publish-bump-branch.sh` or the workflow builds `chore/esr-${CANDIDATE}` from
the wrong output; nothing goes red, yet the self-test claims a 153/175 branch-agreement plant.
**Fix:** Either delete the plant (and its mention in the count) and leave the helper UNWIRED as the
other three are, or wire it: make `publishPlan` / `publish-bump-branch.sh` call `branchTagFailure`
on the branch it is about to push and plant against that caller.

### WR-02: Uptake report view reads a timeout, cancel or post-replay failure as "replay due"

**File:** `.github/workflows/release-train.yml:533-539`, `.github/workflows/rebase-upstream.yml` (stage step), `scripts/release-train.mjs` `deriveUptake`
**Issue:** The report step builds `STAGE` from `needs.uptake-replay.outputs.stage` and
`REPLAYED=true` only when the job result is `success`. `rebase-upstream.yml` sets `stage=replayed`
whenever the `rebase` step succeeded, then runs a later `Re-check byte-identity after the replay`
step. If that later step fails, the job result is `failure`, `STAGE=replayed` (non-empty, so the
`-z "$STAGE"` override does not fire), `REPLAYED=false`, and `deriveUptake` returns
`UPTAKE_DETECTED` ("replay due"). Verified:
`node scripts/release-train.mjs --uptake-would-write FIREFOX_175_0_0esr_RELEASE replayed false` prints
`state=UPTAKE_DETECTED`. A `cancelled` job (the 60-minute timeout) with an empty stage also derives
`UPTAKE_DETECTED`, because only `failure` is handled. A replay that failed is reported as one that
has not run. No self-test covers the `replayed` + not-success or `cancelled` combinations.
**Fix:** Pass the job result into the CLI and treat any result other than `success` or `skipped`
as red: in the step, `if [ "$UPTAKE_RESULT" != "success" ] && [ "$UPTAKE_RESULT" != "skipped" ]; then
case "$STAGE" in replayed|'') STAGE="FAIL -- the uptake replay job ended $UPTAKE_RESULT after stage ${STAGE:-none}";; esac; fi`.
Add a `deriveUptake` plant for `{ stage: 'replayed', replayed: false }`.

### WR-03: The uptake lane never retires; after the flip the same tag runs as both bump and uptake

**File:** `scripts/detect-upstreams.mjs:73` (`UPTAKE_MAJOR = 175`), `scripts/detect-upstreams.mjs:154-172` (`decideUptake`), `scripts/detect-upstreams.mjs:287-288`
**Issue:** `UPTAKE_MAJOR` is a literal independent of the pinned major. Once `firefox_esr_tag` moves
to 175 (the whole purpose of this phase), `decide()` names a 175 candidate as a `bump` and
`decideUptake` names the same tag as `replay-only`. Reproduced:
`decide({pin: FIREFOX_175_0_0esr_RELEASE, tags:[175_0_0, 175_1_0, 153_27_0]})` gives
`esr.decision=bump` candidate `FIREFOX_175_1_0esr_RELEASE` and `uptake.candidate=FIREFOX_175_1_0esr_RELEASE`.
Result: two hourly 60-minute, 1.1 GB replays of the same tag (BLOCKED.md item 2 already calls the
per-tick cost an owner concern), with the "replay-only, writes nothing" note contradicting the
bump path the same tag is on. The 153 tags then become "foreign" to both lanes' guards and are
silently refused. Nothing in the self-test or the sweep asserts `UPTAKE_MAJOR !== pinned major`.
**Fix:** In `decideUptake`/`decide`, return `decision: 'none'` with a note when `uptakeMajor === pinned
major`, and add a plant for the pin-at-175 case. Alternatively derive the uptake major as "pinned
major + the next listed ESR major" so no literal has to be edited at the flip.

### WR-04: The detector-to-job wiring (`uptake-candidate` output) has no check

**File:** `scripts/detect-upstreams.mjs:436`, `.github/workflows/release-train.yml:128` and `:192`
**Issue:** The lane has three links: `main()` printing `uptake-candidate=`, the `grep -E '^(candidate|
...|uptake-candidate)='` allowlist in the Decide step, and the job output mapping. The self-test
exercises `decide()` and `decideUptake()` only. `verify-upstream-pins.mjs` step 8 checks only the
consumer end (the job's `tag:` source). Deleting the `console.log` line, the allowlist alternative
or the output mapping leaves every self-test and `--quick` green and silently disables the lane:
`uptake-candidate` is empty, `uptake-replay` is skipped, and the report prints
`uptake idle; no uptake-major tag is listed` while a 175 tag exists. This is a check that cannot go
red for the property it is named for.
**Fix:** In `verify-upstream-pins.mjs` step 8 (or a `verify-workflows` rule) require the
`uptake-candidate` token in the detect job's `outputs:` and in the Decide step's grep allowlist, and
add `main()`-level self-test that runs `--listing` against a fixture and asserts the
`uptake-candidate=<tag>` line. Plant each removal.

### WR-05: RELEASING.md says the first replay is at the beta; the lane as built starts on release day

**File:** `docs/RELEASING.md` (subsection "ESR 175 uptake", Calendar paragraph) versus `BLOCKED.md` item 3
**Issue:** The doc states "Beta 2027-06-10: the first replay-only run against a 175 tag" and the
subsection opening says "replay-only from the 175 beta". The lane keys on `*esr_RELEASE` tags, which
the BLOCKED item itself says are cut at release (2027-06-29), about three weeks later. The plan's
must_have ("replay-only from the beta") is not met, and the operator-facing doc asserts the opposite
of the disclosed limitation. An operator reading the doc waits for a beta replay that will not run.
**Fix:** Change the doc to "first replay on the first 175 `*esr_RELEASE` tag (release day,
2027-06-29) until BLOCKED.md item 3 is decided", or approve and implement the beta-stage tag form.

### WR-06: RELEASING.md describes behaviour the report view does not implement

**File:** `docs/RELEASING.md` ("Two keys" and Replay-only procedure step 4); `scripts/release-train.mjs:312` and `uptakeWouldWrite`
**Issue:** Two present-tense claims are false for this build. (1) "Each release key owns one tracking
issue, found by label and title on every run ... The body is rewritten only when its rendered bytes
differ": `findExactlyOne` is UNWIRED, no 175 writer exists (BLOCKED.md item 1), and `uptakeWouldWrite`
prints the body and writes nothing. (2) "Its tracking view ... carries the apply log and the upstream
diff": the conflict view calls `renderConflict(tag, nnn, facts.stage, '')`, so the log is the single
stage line and the diff is empty. The ship plan (58-03) and the owner will treat these as delivered.
**Fix:** Reword both as "when the writer is approved (BLOCKED.md item 1) the lane will ..." and state
that today the report job only prints the stage line and a would-write title.

### WR-07: `apply-patches.sh --patches` / `--upstream` mis-resolve relative paths and take no validation

**File:** `scripts/apply-patches.sh:27-37` (flag parse) versus the `cd "$UPSTREAM_DIR"` before the `"$PATCHES_DIR"/*.patch` glob in the real run
**Issue:** The new flags store the value verbatim. The real run does `cd "$UPSTREAM_DIR"` and only
then expands `"$PATCHES_DIR"/*.patch`, so a relative `--patches` resolves against the upstream tree.
Reproduced with a scratch repo: `apply-patches.sh --upstream up --patches pp` exits 1 with
`apply-patches: FAIL -- pp contains no *.patch files` although `pp/` holds the patch. The failure is
loud, but the message names the wrong cause. There is also no check that `--upstream` exists, is the
top level of its own git repository, or differs from `$REPO_ROOT`: pointed at a directory inside the
repository, `git apply --3way` operates on the enclosing repository with a path prefix (the blob-hash
assertion happens to catch the no-op, but only by accident of the touched paths being missing), and a
value beginning with `--` (e.g. `--upstream --patches p`) is accepted as the directory. Defaults are
unchanged, and `rebase-upstream.sh` passes no arguments, so the live path is unaffected; the
risk is the documented scratch-tree procedure in RELEASING.md used by an operator.
**Fix:** After parsing, resolve and validate before any `cd`:
```bash
UPSTREAM_DIR="$(cd -- "$UPSTREAM_DIR" 2>/dev/null && pwd)" || { echo "apply-patches: FAIL -- --upstream is not a directory" >&2; exit 2; }
PATCHES_DIR="$(cd -- "$PATCHES_DIR" 2>/dev/null && pwd)" || { echo "apply-patches: FAIL -- --patches is not a directory" >&2; exit 2; }
[ "$(git -C "$UPSTREAM_DIR" rev-parse --show-toplevel 2>/dev/null)" = "$UPSTREAM_DIR" ] || { echo "apply-patches: FAIL -- --upstream is not the top of its own git repository" >&2; exit 2; }
```
Reject a value starting with `-` in the `case`. Add a `--self-test` plant for a relative `--patches`.

## Info

### IN-01: `uptake-lane` rule does not forbid `secrets:` on the job

**File:** `scripts/verify-workflows.mjs` (uptake-lane block, near the `bot-job-gate` code)
**Issue:** The rule checks write scopes, `environment`, and the callee. It does not check
`job.secrets`. `secrets: inherit` on `uptake-replay` would pass every plant while handing the callee
workflow every repository secret, against the "no App token" intent. Today the callee reads none.
**Fix:** Fail when `job.secrets !== undefined`, with one plant (`secrets: inherit`).

### IN-02: Uptake conflict view has no green control and the write-under-patches plant is injected

**File:** `scripts/release-train.mjs:648-653`
**Issue:** The plant `a uptake conflict decision that writes under the patch directory` hand-adds a
`writes` entry to a real `renderConflict` result and checks the rule fires. There is no control that
the real `uptakeWouldWrite` conflict path yields zero `failures` (the 153 side has one: "the real
conflict decision writes nothing under the patch directory"). A future change making
`uptakeWouldWrite` list a patch path would not be caught by the uptake side.
**Fix:** Add a control asserting `uptakeWouldWrite({tag: UPTAKE_TAG, stage: <apply FAIL line>, replayed:false}).failures` is empty.

### IN-03: A skipped uptake job after a failed detect prints a false "idle" statement

**File:** `.github/workflows/release-train.yml:533-539`, `scripts/release-train.mjs` `uptakeWouldWrite`
**Issue:** If `detect` fails, `uptake-candidate` is empty and the report says `uptake idle; no
uptake-major tag is listed, so nothing is replayed`, which is untrue (the listing never ran). Also
the uptake step has no `if: always()`, so a failing earlier would-write step in `report` suppresses it.
**Fix:** Pass `needs.detect.result` and print "detect did not run" when it is not `success`.

### IN-04: A red `uptake-replay` turns the whole run red hourly with no writer

**File:** `.github/workflows/release-train.yml:277-291`, `BLOCKED.md` items 1 and 2
**Issue:** While a 175 patch conflicts and the conflict writer is unwired, every tick ends with a
failed `uptake-replay` job and no issue. This is the "red job with nobody watching" shape D-77
warns about. It is disclosed in BLOCKED.md but the only signal is the run conclusion.
**Fix:** Either `continue-on-error` the uptake job (the report already prints its stage) or accept
and record the red run as the interim signal in RELEASING.md.

## Checked and found sound

- Replay-only: no `environment`, App token, `bump-pr`, `needs` edge from any publishing job, or dispatch consumes `uptake-candidate`/`uptake-replay`; `report` is its only consumer. `uptake-lane` plants (contents write, pull-requests write, environment, wrong callee) each go red.
- Tag trust boundary: grep-anchored `FIREFOX_(major|uptake)_...esr_(RELEASE|BUILDn)$`, then `ESR_RELEASE_TAG` anchored, then `rebase-upstream.sh` `[A-Za-z0-9._-]+`; stage text reaches `release-train.mjs` through `env:` and quoted args only.
- Phase 43 fixes (CR-01, WR-02, WR-03, WR-06, WR-07, WR-09) are intact: no new write step lacks a gate, `bot-job-gate` and `dry-run-gate` rows green, FIREFOX_ESR stays advisory (`175.0esr` fixture dispatches 153.23).
- `apply-patches.sh` defaults and `--self-test` are unchanged; no caller passes arguments.
- Set equality: `ALL_STATES` vs `FIXTURES` vs `ACTIONS` is compared by `setDiff` in both directions.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
