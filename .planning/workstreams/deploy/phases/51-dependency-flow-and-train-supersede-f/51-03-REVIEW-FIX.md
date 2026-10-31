---
phase: 51-dependency-flow-and-train-supersede-f
plan: 03
review_path: .planning/workstreams/deploy/phases/51-dependency-flow-and-train-supersede-f/51-03-REVIEW.md
fixed_at: 2026-10-31
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Plan 51-03 review fixes

Verification ran in the main checkout of branch `dsh/phase-51`, not a separate worktree: `node scripts/release-train.mjs --self-test`
(18 states set-equal, 29 plants, 32 controls), `--only` workflows, workflows-self-test, zizmor, release-asset-set and
release-asset-set-self-test all PASS. `release-train-maintenance-self-test` does not exist on this branch yet (Phase 48 is merged in Job B).
The logic-level fixes (CR-01, CR-02, WR-01) are marked "requires human verification" per the fixer rules.

- CR-01 FIXED fee87d36 (requires human verification). `supersedeCause` applies both arms to a scheduled train only (revision exactly 1; a missing
  revision fails safe as a revision). Control: a chemspill revision train with a newer ESR tag and `chemspillOpen` derives BUMP_PR_GREEN, and the
  scheduled train beside it derives SUPERSEDED.
- CR-02 FIXED 0c946ca7 (requires human verification). Option (a): a BUILDING / AWAITING_APPROVAL train (or one whose run was cancelled) derives SUPERSEDED
  under the same arms, identified by its release key. `releaseFactsFromLive` now carries `run.id` and `releaseEnvId` (the pending `release`
  entry's environment id; GitHub's pending-deployments entry has no deployment id). `supersedeTarget(facts)` returns `{key, runId, environmentId}`
  or null (link-only). Published and withdrawn releases are never superseded (controls over six states plus a wrong-asset published Release;
  mutation-checked). BLOCKED 7(a), 8 and 10 now say the sign guards alone close the race and the executor and collector are unwired.
- WR-01 FIXED bd28c4ed (requires human verification). `supersededMark` (the tracking issue already carries `state/SUPERSEDED`, which render writes) keeps
  a key SUPERSEDED after the transient fact is gone; unmarked, it reverts to BUMP_PR_GREEN (both proven by a control), and a marked key pages nobody.
- WR-02 FIXED 9dd6827d. `supersedeCause` is the one decision; `derive` and `render` both read it. A view with chemspill and newerTag names the chemspill
  revision, and rendering SUPERSEDED over facts that supersede nothing throws.
- WR-03 FIXED d483b17d. RELEASING.md states the chemspill and newer-ESR rules, the exemptions, stickiness, and that no collector or executor exists.
- WR-04 FIXED 7a7ada27 (item 4 landed in 9dd6827d). `verify-release-asset-set.mjs` requires `newer_guard` before the MAR channel gate and signing,
  fail-closed and on the tree-derived tag, with three plants (removed, moved after signing, continue-on-error). The comparator plants assert exit 1
  and exit 2 exactly and throw on a spawn failure. The chemspill text is asserted from `render()`.
- IN-04 FIXED b8c61690. BLOCKED item 7 says 21 steps gated.

Not in scope and left: IN-01, IN-02, IN-03 (the stale render header comment and the CONFLICT-with-no-PR case).
