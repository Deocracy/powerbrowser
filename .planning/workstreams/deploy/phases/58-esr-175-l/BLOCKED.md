# Phase 58 BLOCKED items

Items that need the owner. Each names what is blocked, why, the owner steps, and what the
executor did instead. Plans continue around them where the plan allows.

## 1. The live uptake writers are not wired (58-01 Task 2 and Task 3, the 175 tracking and conflict issues)

**Plan:** 58-01 (the 175 transitions and the conflict issue shape), 58-02 (the rebase conflict path).

**Blocked piece:** the live writer for the 175 tracking issue (`release-train: v175.x-r`) and for
the conflict issue (`ESR <tag>: patch <NNN> did not apply`). The `report` job prints the
would-write view for both and writes neither.

**Why:** the writer needs a live facts source (the open `chore/esr-175*` PR, its check runs, the
latest published Release) and an approved exactly-one writer. This is the same decision as
Phase 43 BLOCKED.md item 3, which covers the 153 line. The 175 lane adds no new write path, so the
decision is made once, for both keys.

**Owner steps:** approve the read-only facts source and the exactly-one writer under
`.planning/workstreams/deploy/phases/43-*/BLOCKED.md` item 3. Then wire
`uptakeWouldWrite` (scripts/release-train.mjs) to a live writer, behind the negated dry-run gate.

**What was done instead:** the `report` job prints `release-train: would-write:` with the state, the
action, the exact title and the rendered body. Nothing is written. The `uptake-replay` job replays
the tag and its stage line feeds the view.

## 2. The uptake lane replays on every tick (owner decision on cost)

**Blocked piece:** the replay cadence for the 175 lane.

**Why:** the lane has no memory between runs (the tracking issue is a view, not an input). While a
175 `*esr_RELEASE` tag is listed, each hourly tick clones upstream (about 1.1 GB) and replays the
patch stack for up to 60 minutes.

**Options:**

- A. Keep the per-tick replay. This is what the code does now. Simple and always current, at
  about 24 replays a day for as long as the 175 tag is listed.
- B. Replay once per tag and record the result in the tracking issue. Needs item 1 first, because
  the result has to be read back from a live issue.

**Who decides:** the owner. Executor default: A. Nothing in 58-03 depends on the choice.

## 3. The lane keys on the release tag, not the beta (owner decision on the start date)

**Blocked piece:** the calendar start of the replay-only lane.

**Why:** the contract keys the lane on `FIREFOX_<major>_*esr_RELEASE` tags (the Phase 43 rule,
`_RELEASE` only). A tag of that form is cut when the ESR is released (2027-06-29), not at the
175 beta (2027-06-10). As built, the lane starts on that release tag. The plan's "replay-only from
the beta" needs a beta-stage tag form, which the detector does not list.

**Options:**

- A. Accept the release-day start. The conflict surfaces about three weeks later than the plan
  intends, and the 175.x ship window must absorb that.
- B. Approve a beta-stage tag form for the uptake lane only (a new listing rule and new fixtures),
  and record which Mozilla tag name it matches. The executor cannot confirm that name without a
  live 175 beta tag, which does not exist yet.

**Who decides:** the owner, before 2027-06-10. Executor default: A (the code as built).

## 4. The container image line records the OS codename, not the image digest (58-02 Task 3)

**Plan:** 58-02 Task 3, toolchain container set ("clang, rust, cbindgen, sysroot, glibc ceiling,
image digest").

**Blocked piece:** the compared `image` line of `toolchain-baseline.txt`. The container mode
(Phase 45) prints `image pb-gecko-build <VERSION_CODENAME>`, so the drift diff compares the OS
codename. The digest is not compared.

**Why:** a container cannot read its own image digest from inside. The digest has to be measured on
the host with podman. The file already records the pin as a host-measured comment
(`base debian:bookworm@sha256:...`), which the drift diff skips. Comparing the digest would change
the Phase 45 comparator contract and needs the host measurement wired into `build-linux`.

**Options:**

- A. Keep the codename line and the digest comment. The digest is recorded, not enforced. Executor
  default.
- B. Compare the digest: the host runs `podman image inspect` before the container build, and
  `build-linux` passes it in. This changes the drift contract, so it needs the owner's approval.

**Who decides:** the owner. Nothing in 58-03 depends on the choice, but the 175 re-record (RELEASING.md
"Rebase onto 175") records the digest either way.

## 5. A red uptake replay turns every tick red with no writer (58-REVIEW IN-04)

**Plan:** 58-01 (the uptake lane and its report view).

**Blocked piece:** the signal for a 175 replay that ends red. The review fixes WR-02 and IN-03 make any
uptake replay result other than success red in the report, so a patch conflict, a red gate or a
cancelled run fails the whole workflow run on every hourly tick. The conflict writer (item 1) is not
wired, so no issue is opened. The stage line is printed in the job log, and the run conclusion is the
only signal.

**Why:** the signal belongs with the writer decision (item 1). Until that is approved, the run
conclusion is the one place a red replay shows.

**Options:**

- A. Keep the red run as the interim signal, and name it in RELEASING.md as the signal to watch. This is
  the code as built.
- B. Mark the uptake job `continue-on-error`, so the run stays green and the stage line carries the
  signal. This hides a failed replay from the run conclusion and contradicts the WR-02 rule that a
  non-success result is red.

**Who decides:** the owner, with item 1. Executor default: A, unchanged by the review fix.

## 6. 153.x security trains after the 175 flip (owner decision, before 2027-06-29)

Blocked piece: detection of 153.x point releases once the pin moves to 175.

Why: the 58 review fix (WR-03) turns the uptake lane off when the uptake major is not newer than the pin. After the pin flips to 175 the detector follows the 175 line only, so 153.x point releases (which Mozilla keeps shipping while 153 is supported) are no longer detected for any build that still needs them. ROADMAP Phase 58 criterion 2 says 153.x security trains continue while the 175 train runs.

Options:
- A. Flip the pin only after the last 153.x point release the project will ship; 153.x detection ends with it. Simple; no parallel lines.
- B. Keep a second, 153-only lane after the flip until 153 end of life (a new detector lane and train key; follow-up plan).

Who decides: the owner, before the flip. Executor default: none (the flip is an owner action in 58-03).
