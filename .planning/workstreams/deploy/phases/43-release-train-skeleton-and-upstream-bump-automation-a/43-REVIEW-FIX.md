---
phase: 43-release-train-skeleton-and-upstream-bump-automation-a
review: 43-REVIEW.md
branch: dsh/phase-43
fixed_at: 2026-10-31
findings_in_scope: 14
fixed: 11
not_fixed: 3
---

# Phase 43: Review fix report

One line per finding in 43-REVIEW.md: `FIXED <commit>` or `NOT FIXED <reason>`. Each fix is its own commit on dsh/phase-43, with explicit paths.

- CR-01 FIXED 0978438 (follow-up 1433a72): detect and detect-node read the open PR heads and hold a candidate or Node line whose bump branch has an open PR (pr-open, no replay); bump-pr and bump-pr-node publish through scripts/publish-bump-branch.sh, which reads the remote branch by API GET, creates when absent, skips when the tree matches, refuses when a commit is not bot-authored, and otherwise force-with-lease pinned to the observed tip.
- WR-01 FIXED a829ea7: report no longer refuses a live candidate; it prints the would-write view (release-train.mjs --would-write) and exits 0; shortcut header recorded on the step.
- WR-02 FIXED 0b1852a: workflow defaults to shell bash (pipefail); pin, decision and Node select write to files so a node failure stops the step; ls-remote split; no pipe into grep -q.
- WR-03 FIXED 9304a89: reads (tag listing, advisory, decision, Node index and verification) run in dry-run; the bump replays the real candidate; report prints would-open lines with the actual values.
- WR-04 FIXED 475375f: tag and release dispatch inputs removed (shortcut recorded in the header); remaining value checks are whole-value bash [[ =~ ]].
- WR-05 FIXED 0870e5c: Node half split into detect-node and bump-pr-node with their own App token; FIREFOX_ESR advisory read is non-fatal; Node publish gated on detect-node success and a non-empty verified sha.
- WR-06 FIXED 9e7d20a: dry-run-gate matches git push and commit (git -c forms), gh api write methods and implicit POST, gh pr/issue/release/label/workflow writes, curl -X writes, and any uses: outside the read-only list; the gate must be a negated inputs.dry-run; one plant per new form.
- WR-07 FIXED 5ddefef: fixtures carry the expected action as a literal; ACTIONS is set-compared to STATES; the patch-directory plant runs the real conflictWriteFailures rule on renderConflict output. DROPPED plants (and their controls), each marked UNWIRED in release-train.mjs and in the registry row: findExactlyOne (duplicate tracking issue, live writer not wired, BLOCKED.md item 3); admitWakeRun (fork-head workflow_run, trigger held out, BLOCKED.md item 1); classifyRelease (draft Release, needs live Release list, Phase 50).
- WR-08 FIXED 2056b44: the firefox_esr_tag sed is asserted (file changed, line names the new tag); staging is git add -A over configuration.toml, powerbrowser and patches with a fail on any other change; the Node line is compared to the pin (nodeDecision, runtime manifest passed to --node-select) before the download, with a downgrade plant.
- WR-09 FIXED 2e7affe: bump-pr and bump-pr-node are gated at job level on a live run with something to publish, so dry-run and no-candidate runs never enter the bot environment; bot-job-gate rule with two plants.
- IN-01 FIXED 16c932c: the derived base64 credential is registered with ::add-mask:: in scripts/publish-bump-branch.sh immediately after it is computed.
- IN-02 NOT FIXED: left as recorded; the dead workflow_run guards stay until BLOCKED.md item 1 is decided (option B deletes them).
- IN-03 NOT FIXED: left as recorded; the nodejs/release-keys clone is unpinned and the signer is not printed, the accepted upstream trust model.
- IN-04 NOT FIXED: left as recorded; the replayed tree is not gated by --quick in CI, and renderConflict's fences are not escaped (not reachable while the live writer is unwired).

## Changes beyond the review text

- The tag and release inputs were removed rather than wired (WR-04 allowed either). A dispatch that still passes them now fails with an unknown-input error.
- report gained a read-only checkout and `contents: read` so the would-write view can run the module (WR-01).
- Two docs lines (RELEASING.md, BUILD.md) now name the detect-node job for Node provenance (WR-05).
- The publish logic is a new script, scripts/publish-bump-branch.sh; the decision is the pure publishPlan in scripts/release-train.mjs, reached through --publish-plan.
- Registry comments in scripts/verify-platform.sh were updated for the new plants and the UNWIRED markers. No rows were added or removed.

## Verification

Where it ran: the clone /home/chris/gsd-workspaces/deploy/dsh/phase-43 on branch dsh/phase-43 (not a worktree), with the project's node and gh on PATH.

- Rows, each PASS at its last run: workflows, workflows-self-test (56 planted faults, 10 controls), zizmor, detect-upstreams-self-test (9 plants, 2 controls), release-train-logic-self-test (12 plants, 7 controls).
- Every run: block in release-train.yml parses under bash -n (18 blocks at the last check).
- scripts/publish-bump-branch.sh was exercised with stubbed gh and git (no network write): absent creates, owner commit refuses, bot-only force-with-lease pinned to the read tip, same tree skips, HTTP 500 fails.
- scripts/verify-platform.sh --quick: exit 0, 462 PASS lines, final line `verify-platform: PASS -- all checks passed`, run on the final tree (after 1433a72). The FAIL-looking lines in that run are the group-channel row's own self-test plants, which print red by design.

## Not verified live

These need the owner's App, the bot environment, and a dispatch with dry-run: true (BLOCKED.md item 2).

- The GitHub API reads in publish-bump-branch.sh (branch, git/commits, compare with commit.author.email) against a real remote.
- The gh pr list reads under the job GITHUB_TOKEN with pull-requests: read.
- The git status unexpected-path check after the replay, which depends on the replay writing only ignored paths outside the bump surfaces.
- needs.bump.outputs.stage from the reusable rebase-upstream.yml, which the report step reads.
- The App token mint and both push paths on the bot environment.
