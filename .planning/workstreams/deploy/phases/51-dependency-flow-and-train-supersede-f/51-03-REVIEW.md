---
phase: 51-dependency-flow-and-train-supersede-f
plan: 03
reviewed: 2026-10-31T00:00:00Z
depth: deep
base: c755d408
head: HEAD (dsh/phase-51)
files_reviewed: 5
files_reviewed_list:
  - scripts/release-train.mjs
  - docs/RELEASING.md
  - .github/workflows/release.yml (read only, not in the diff: the Task 1 premise)
  - scripts/release-key-newer.mjs (read only, not in the diff: the comparator)
  - .planning/workstreams/deploy/phases/51-dependency-flow-and-train-supersede-f/BLOCKED.md (items 7-10)
findings:
  critical: 2
  warning: 4
  info: 4
  total: 10
status: issues_found
---

# Plan 51-03 code review (TRAIN-04: SUPERSEDED, chemspill ordering, sign-guard fixtures)

Self-test run at HEAD: `node scripts/release-train.mjs --self-test` passes (18 states, 18 fixtures, 18 actions, set-equal;
27 plants; 25 controls). The set-equality claim holds: `runChecks` diffs states against fixtures and against ACTIONS keys in
both directions. Read-only probes of `derive()` were run from the scratchpad; results are quoted below.

## Answers to the review questions

- WITHDRAWN and the published stages are never superseded: true. `derive` returns `deriveRelease(f.release)` before either new
  arm, so any set of facts carrying `release` is immune. The same early return means AWAITING_APPROVAL and BUILDING are also
  never superseded, which defeats the action (see CR-02).
- Chemspill beats scheduled: only half true. Arm 1 supersedes the scheduled train, but arm 2 also supersedes the chemspill
  revision train when a newer ESR tag exists (CR-01).
- A newer ESR supersedes only what it should: tag comparison is sound (see "comparator" below), but the arm has no revision
  guard (CR-01) and no check that the superseded train is actually the older one for a revision train.
- Uptake lane unaffected: true. `deriveUptake` is a separate function, the baseline routes `UPTAKE_*` fixtures to it, and the
  175-vs-153 control is real (`newerTag` 175 against a 153 train derives BUMPING).
- Task 1 premise ("no newer-Release guard yet"): the premise is false and the executor's finding is correct. `newer_guard`
  (release.yml:268) runs before the MAR channel gate and before signing. `newer_guard_final` (release.yml:397) is the step
  directly before the token mint, and `verify-release-asset-set.mjs:254-257` enforces that position. Both use
  `set -euo pipefail`. The `gh api` call sits in an assignment, so a failed lookup aborts. Both treat every non-zero comparator
  exit (1 older/equal, 2 malformed) as a refusal. Both pass `steps.derive_key.outputs.tag`, which is validated against
  `^v[0-9]+(\.[0-9]+)*-[0-9]+$` and checked against the manifest key. Same key grammar as `releaseKey()` in the train.
  They are fail-closed, before the mint and use the same keys. Residual gaps are INFO-01 and INFO-02 and WR-04.

Comparator (`esrAfter` / `newerOnSameLine`), probed with candidate FIREFOX_153_6_0esr_RELEASE under an open PR:

| newerTag | derive |
|---|---|
| FIREFOX_153_23_0esr_RELEASE | SUPERSEDED |
| FIREFOX_153_7esr_RELEASE (two-group) | SUPERSEDED |
| equal tag, older tag, junk, null, number 5 | BUMPING |
| ..._BUILD1, ...^{} peeled | BUMPING |
| FIREFOX_154_0esr, FIREFOX_175_1_0esr (other major) | BUMPING |
| candidateTag null with an open PR | BUMPING |

Malformed, equal, build and 175 tags all fail closed to "not superseded". No finding there.

## Critical Issues

### CR-01: A newer ESR tag supersedes the chemspill revision train, so chemspill does not beat scheduled

**File:** `scripts/release-train.mjs:249-250` (derive arms), controls at `:889-896`
**Issue:** Arm 2 (`newerTag`) has no revision guard. A chemspill revision train is the same ESR with revision above 1
(`candidateTag` = the pin, `revision: 2`), and the pin is always older than any newer ESR tag. Probe:

```
chemspill revision (candidate=pin 153.5.1, revision 2, openPr) + newerTag=153.23.0   -> SUPERSEDED
same + chemspillOpen=true                                                            -> SUPERSEDED
```

The newer tag is a fact about the repository, not about one train, so any natural collector sets it for every open train.
The result is that the scheduled train is superseded by arm 1 (chemspill open), and the chemspill train is superseded by
arm 2 (newer ESR). Neither train ships, and a security revision is held back by the scheduled bump it was meant to preempt.
The comment "A chemspill revision train carries neither flag, so it falls through" is an assumption about a collector that
does not exist (BLOCKED item 10); nothing in `derive` enforces it. The control at `:889-896` passes only because its fixture
has no `newerTag`. Arm 1 has the same weakness: `chemspillOpen === true` supersedes any train with an open PR, including the
revision train itself if the collector computes the flag per repository rather than per sibling.
**Fix:**
```js
// a revision (chemspill) train is never preempted by a scheduled ESR or by itself
const isRevision = Number(f.revision) > 1;
if (f.openPr && !isRevision && f.chemspillOpen === true) return 'SUPERSEDED';
if (f.openPr && !isRevision && typeof f.newerTag === 'string' && newerOnSameLine(f.newerTag, f.candidateTag)) return 'SUPERSEDED';
```
Add a plant/control: revision 2 with `newerTag` and with `chemspillOpen` must derive BUMPING (or BUMP_PR_GREEN), not SUPERSEDED.

### CR-02: SUPERSEDED is unreachable for any train that has a pending release deployment, so its cancel action and the "race is closed" claim are wrong

**File:** `scripts/release-train.mjs:246` (`if (f.release) return deriveRelease(...)`), `:134-136` (action), BLOCKED.md item 7(a) and item 8
**Issue:** The new arms need `f.openPr` and run only when `f.release` is falsy. `release` facts exist once a release.yml
run exists at the merge SHA, which is after the bump PR merged, so `openPr` is null by then (the merged-PR fixture sets
`openPr: null`, `:766`). The two conditions cannot hold together. So SUPERSEDED fires only for an unmerged bump PR with no
release run, and such a train has no `release` environment deployment to cancel. The train that holds a pending approval
(AWAITING_APPROVAL, or BUILDING) never derives SUPERSEDED even when a newer ESR exists. The action name
`cancel-pending-and-link`, plan truth 4 and BLOCKED item 8 all describe cancelling a deployment the state can never
coincide with. Consequences:
- BLOCKED item 7(a) justifies "keep fail-closed" with "the race is closed by the guards plus supersede cancellation (item 8)".
  The cancellation cannot occur for a pending approval, so the owner is deciding on a false premise. The sign guards alone
  close the race, and they close it by failing the run red after the approval is spent.
- A future executor wired to `cancel-pending-and-link` receives a state carrying no run id and no deployment id for the old
  train. With nothing identifying the old train's deployment, an implementation that cancels "the pending release
  deployment" can only select the newest or the only pending one, which is the new train's or an unrelated one. This is the
  exact prohibition in the plan ("never the new train's").
**Fix:** Decide the intended domain before wiring. Either (a) add an explicit release-stage arm
(`AWAITING_APPROVAL`/`BUILDING` with `newerTag`/`chemspillOpen`) that carries the old run id and deployment id in the facts, and
keep `if (f.release)` from shadowing it; or (b) rename the action to what the reachable state does (link-only, for example
`link-superseder`) and move the cancel into a separate release-stage state. Correct BLOCKED items 7(a) and 8 and the SUMMARY
either way. Add a fixture with `live` facts (AWAITING_APPROVAL) plus `newerTag` that states the intended outcome.

## Warnings

### WR-01: SUPERSEDED is not terminal; it is re-derived each tick and can revert after an irreversible cancel

**File:** `scripts/release-train.mjs:103` (desc says "terminal"), `:247-248`
**Issue:** State is derived from facts only. Arm 1 depends on `chemspillOpen`, which goes false when the chemspill train
publishes or its PR closes. The scheduled train then derives BUMPING or BUMP_PR_GREEN again, and BUMP_PR_GREEN assigns and
mentions the owner. If the cancel executor had run in between, the run it cancelled does not come back. The same holds for
arm 2 if the newer PR is closed and the tag withdrawn. The description and RELEASING.md both say the scheduled train "is
superseded" as if permanent.
**Fix:** State in the description and RELEASING.md that SUPERSEDED holds only while the superseding fact holds. Gate any
cancel executor on a fact that does not revert (the superseding train's PR merged, or a stored mark), or make the cancel
idempotent and re-requestable. Add a control for the revert (chemspillOpen false returns the scheduled train to BUMPING).

### WR-02: The SUPERSEDED view can name the wrong superseder

**File:** `scripts/release-train.mjs:322-326`
**Issue:** `render` recomputes the cause from facts instead of using the arm that fired. With `chemspillOpen: true` and a
`newerTag` also present (the natural case, see CR-01) it prints "superseded by v153.23.0-1" although the chemspill arm fired.
With neither fact valid it prints "the open chemspill revision", which is then a false statement. Probe: facts with
`chemspillOpen` and `newerTag` render the ESR key.
**Fix:** Have `derive` (or a sibling `supersededBy(facts)`) return the reason, and have `render` consume it. Chemspill first,
to match arm order. Drop the unconditional fallback string.

### WR-03: RELEASING.md states unbuilt behaviour as live and omits the newer-ESR rule

**File:** `docs/RELEASING.md:1049`
**Issue:** "the revision train proceeds and the scheduled train is superseded" reads as shipped behaviour. No collector sets
`chemspillOpen` or `newerTag` (BLOCKED item 10), no executor handles the action (item 8), and `derive` does not make the
revision train "proceed" (it only does not mention it, and CR-01 shows it can be superseded too). The sentence also leaves
out the newer-ESR rule, which is the more common path. The sentence sits in the out-of-band security section, where a
reader will take it as an operating guarantee for a security release.
**Fix:** Qualify it ("The release-train logic encodes this; no live collector sets these facts yet, see BLOCKED.md") or state
it as the intended rule. Add the newer-ESR rule and the "holds only while the fact holds" caveat (WR-01).

### WR-04: The new sign-guard plants test the comparator, not the workflow, and are weaker than they read

**File:** `scripts/release-train.mjs:663-665` (`signGuardExit`), plants at `:794-810`, control at `:925-931`
**Issue:**
1. The cases duplicate `release-key-newer.mjs --self-test` and its `verify-platform.sh` row; no new coverage of the key logic.
2. They do not cover release.yml wiring. `verify-release-asset-set.mjs` only asserts `newer_guard_final` (position and
   fail-open faults). Nothing asserts that `newer_guard` exists before the MAR gate and signing; deleting it leaves every
   check green, and then the signing key is read for a stale approval. The plant names (`sign-job-*`) suggest the job is covered.
3. `sign-job-malformed-latest` accepts any non-zero `r.status`, including `null` (spawn failure, missing script, signal)
   and exit 1 (older). Its expected text "could not be compared" is the plant's own literal, so it would also "pass" if
   the comparator returned 1 rather than 2 for `latest`. The message interpolates the status but the plant never checks it equals 2.
4. The chemspill plant's expected string `superseded by the open chemspill revision` is emitted by the plant, not by `render`;
   the plant exercises `derive` only, and the chemspill render text is never asserted anywhere.
**Fix:** Assert `r.status === 2` for the malformed case and `r.error === undefined` for all. Add `newer_guard` to the
`verify-release-asset-set.mjs` order checks with a "stale-approval guard removed" plant beside the existing one at line 404.
Assert the chemspill render text from `render()`.

## Info

### IN-01: The guards compare against the head of the releases list, not the maximum key

**File:** `.github/workflows/release.yml:276,404`
**Issue:** `[.[] | select(.draft == false)][0].tag_name` takes the first published entry in API order (not guaranteed to be
highest key; includes prereleases and any non-key tag, which fails closed with exit 2 for every later run). Pre-existing
(Phase 49 WR-09), but it bears on "comparing the same keys". Fix: take the maximum key among `v*-*` tags with the comparator.

### IN-02: The final guard and the mint are unreachable today

**File:** `.github/workflows/release.yml:391-395`
**Issue:** `r2_gate` exits 1 unconditionally, so `newer_guard_final` and the mint never run. The final guard's behaviour is
therefore verified by structure only. Not a defect of 51-03; recorded because the plan relied on it.

### IN-03: Smaller test and doc gaps

- Only PUBLISHED is exercised by the "published release is never superseded" control (`:899-905`). One early return covers
  all, but WITHDRAWN, AWAITING_APPROVAL and BUILDING with supersede facts have no control, and CR-02 depends on that.
- A CONFLICT train with no open PR (the CONFLICT fixture has `openPr: null`) is not superseded by a newer tag and still
  opens a conflict issue for an obsolete tag.
- `newerKey` and `newerIssueUrl` are read by `render` (`:325-326`) but absent from the facts-shape header comment.
  `newerIssueUrl` is written into the issue body unsanitised; the collector should restrict it to the repository's own issue URLs.
- The `render` header comment (":Mention and assignment happen only on entering BUMP_PR_GREEN") is stale; four states are in NEEDS_OWNER.

### IN-04: BLOCKED.md item 7 miscounts the later steps

**File:** `BLOCKED.md` (item 7, option b)
**Issue:** sign-publish has 21 steps; a new first step would gate 21 later steps, not 20. Fix the number or say "every step".

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
