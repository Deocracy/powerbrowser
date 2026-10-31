---
phase: 51-dependency-flow-and-train-supersede-f
plans: [51-02, 51-03-review-fixes]
review_path: .planning/workstreams/deploy/phases/51-dependency-flow-and-train-supersede-f/51-02-03-REVIEW.md
fixed_at: 2026-10-31
findings_in_scope: 11
fixed: 9
skipped: 0
partial: 2
status: partial
---

# Plans 51-02 and 51-03 review fixes (second pass)

Verification ran in the clone `dsh/phase-51` itself (no separate worktree, per the caller):
`node scripts/release-train.mjs --self-test` (18 states, 29 plants, 37 controls), `--only` workflows (126 plants, 11 controls),
workflows-self-test, zizmor, zizmor-self-test, triage-workflow, release-asset-set, repo-controls-self-test (70 plants) and the full
`scripts/verify-platform.sh --quick` (exit 0) all PASS. The new controls were mutation-checked (removing the revision test, the
provenance test, the expiry test, the failure ordering, the AWAITING_APPROVAL test and the exactly-one test each turned the
self-test red). The release-train logic fixes are marked "requires human verification".

BL-01, WR-01, WR-02, WR-03 and IN-03 all rewrite the same functions in `scripts/release-train.mjs` and share one commit, because
the tool cannot stage partial hunks. WR-04, WR-05 and BL-02 share one commit for the same reason (one `dependabot.yml`).

- BL-01 FIXED db1bb7c0 (requires human verification). `supersedeCause` tests that a train exists and has a well-formed key with revision exactly
  1 before any arm, the mark included. Controls: revision 2, missing revision, release key `-2`, malformed key, no train, and a
  candidate with no open PR each derive their ordinary state with no cancel target.
- BL-02 FIXED 41847515. `dependabot.yml` ignores `anthropics/claude-code-action`; the `dependabot` rule in the `workflows` row derives
  that name from the fixer pin and goes red without it.
- WR-01 FIXED db1bb7c0 (requires human verification). The mark needs provenance (`markHolds`): the issue is selected by title, tracking label and an
  owner or bot author through `selectTracked` (which `selectPinned` now wraps), exactly one such issue, and the `state/SUPERSEDED`
  labeled-event actor (`supersededLabelActor`) is the owner or the bot. The mark yields to BUMP_RED and CONFLICT. Facts contract in
  BLOCKED item 10; 8 provenance plants and 5 ordering cases.
- WR-02 FIXED db1bb7c0 (requires human verification). The mark expires unless `newerKey` is a valid strictly newer key on the same major and
  `supersederState` is open or published. A published superseder renders the issue closed with a note (superseded-done). Clearing is
  documented in RELEASING.md and BLOCKED item 10.
- WR-03 FIXED db1bb7c0. `supersedeTarget` returns a target only for AWAITING_APPROVAL; BUILDING is link-only. BLOCKED item 8 and RELEASING.md say so.
- WR-04 FIXED 41847515. `cooldown` (default-days 7, semver-major-days 14) on both entries; the `zizmor` row audits `.github/dependabot.yml` too, with
  a fixture pair (no cooldown red naming `dependabot-cooldown`, default-days 7 green). No suppression.
- WR-05 FIXED 41847515. The group's `update-types` are minor and patch; majors arrive as separate PRs. RELEASING.md records that a merged
  actions bump is exercised only by the next release.
- WR-06 FIXED 41847515 for the `dependabot.yml` half: the `dependabot` rule asserts the ignore, cooldown, no auto-merge key, npm
  `open-pull-requests-limit: 0`, group update-types without major, the exact ecosystem set and no `registries`, with 14 plants. NOT FIXED for the
  `automated-security-fixes` read-back: it needs a live read to prove the endpoint shape, so it stays BLOCKED item 12 (owner decision).
- IN-01 FIXED 47b37a43. The fixer-prompt guard set now requires `github.actor != 'dependabot[bot]'` (fixture `FIX_IF`, `FIX_GUARDS`, one plant). The real
  `release-train.yml` has no fixer job today, so this binds when the fixer returns.
- IN-02 FIXED 36a2373f for (b) (an empty or missing declared `languages` is now red, two plants). NOT FIXED for (a) (a 404 from an invisible
  repository is reported as "enabled is false", not as an auth problem): the status alone cannot tell the two apart without a second
  probe, which is a live-read design choice left to the owner.
- IN-03 FIXED db1bb7c0. The facts-shape, supersede and tracking-view header comments, the `render` mention comment, the SUPERSEDED state
  description and the `ACTIONS.SUPERSEDED` comment now match the code.

Not done: nothing was pushed, dispatched, applied or written to a live repository.

---

_Fixed: 2026-10-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
