---
phase: 41-repository-controls-and-github-apps-a
plan: 01
subsystem: repository-governance
status: complete
tags: [github, rulesets, actions-policy, repo-controls, gh-api, self-test]
requires: []
provides:
  - ".github/settings/ with ten repository-scope bodies"
  - "scripts/verify-repo-controls.mjs: CONTROLS, repoSlug, ghGet, runChecks, planWrites, resolveActors, fnmatchRegex"
  - "scripts/apply-repo-controls.mjs: dry-run by default, --yes only from a terminal"
  - "registry rows repo-controls-self-test (quick) and repo-controls (full tier)"
affects: [41-02, 41-03, 41-04, 49]
tech-stack:
  added: []
  patterns:
    - "one CONTROLS table drives both apply (planWrites) and read-back (runChecks)"
    - "projection over declared keys, every array compared as a set, fail closed on any unreadable endpoint"
    - "control gate hook: a dependent read is reported as drift, not as unreadable, when its precondition is not live"
key-files:
  created:
    - .github/settings/actions-permissions.json
    - .github/settings/actions-selected.json
    - .github/settings/workflow-permissions.json
    - .github/settings/fork-pr-approval.json
    - .github/settings/repo.json
    - .github/settings/immutable-releases.json
    - .github/settings/private-vulnerability-reporting.json
    - .github/settings/ruleset-main-integrity.json
    - .github/settings/ruleset-main-review.json
    - .github/settings/ruleset-release-tags.json
    - scripts/verify-repo-controls.mjs
    - scripts/apply-repo-controls.mjs
  modified:
    - scripts/verify-platform.sh
decisions:
  - "actions-selected is gated on live allowed_actions == selected: GitHub answers GET selected-actions with 409 until then, which the row reports as drift rather than as an unreadable endpoint"
  - "The two-part release key is derived from the pinned ESR tag (same major, .0) through releaseIdentity(); the planned literal FIREFOX_175_0esr_RELEASE is refused by the verify-upstream-pins gate"
  - "current_user_can_bypass must be never on every ruleset whose declared bypass list names no person or owner role (main-integrity, release-tags), derived rather than listed by name"
  - "apply --yes refuses on any BLOCKED or read-error line, so release-tags cannot be written before the bot App is installed"
metrics:
  duration: 17min
  completed: 2026-10-22
  tasks: 3
  files: 13
estimate:
  tokens: 130000
  tasks: 3
actuals:
  tokens: 13600
  tasks: 3
  commits: 3
plan_head_before: c515d1fc1b891d2e277395dd70e21b33431b0a21
plan_head_after: b506245aefd4b05f543cb96cc51c1a093a5cb663
---

# Phase 41 Plan 01: Repository controls table, read-back row and apply script Summary

Ten tracked repository-scope settings bodies, one `CONTROLS` table that drives both the owner's apply (`planWrites`) and the read-only `repo-controls` row, the dry-run/`--yes` apply script, and a 28-plant in-memory self-test at the quick tier. Nothing was written to GitHub; every live call was a read-only GET.

## What was built

- **`.github/settings/`** (10 bodies, values verbatim from RESEARCH §Settings bodies): `actions-permissions`, `actions-selected`, `workflow-permissions`, `fork-pr-approval`, `repo`, `immutable-releases`, `private-vulnerability-reporting`, `ruleset-main-integrity`, `ruleset-main-review`, `ruleset-release-tags`.
- **`scripts/verify-repo-controls.mjs`**:
  - Owner and repo come from `configuration.toml [urls] release_notes` through `resolveConfig`. Neither script contains the org or repo literal (grep count 0).
  - `ghGet` pins `X-GitHub-Api-Version: 2022-11-28`. The `safeGetter` wrapper turns a throw, a malformed result, non-JSON output or a truncated list (`total_count` above the items returned, or a plain array at 100) into a FAIL naming the endpoint and the next step.
  - Settings-set equality: an orphan file, a missing file, and an absent or empty directory are each red, naming the file.
  - CONTROLS order: actions-permissions, actions-selected, workflow-permissions, fork-pr-approval, main-integrity, main-review, release-tags, `rulesets` (name-set assertion), immutable-releases, private-vulnerability-reporting, repo, `repository-secrets` (count must be 0).
  - Rulesets are compared on target, enforcement, conditions (as sets), the rule type set, and each declared rule's declared parameters. Bypass actors compare as a set of `(actor_type, actor_id, bypass_mode)` after `app:<slug>` resolves to the installation's `app_id`; `OrganizationAdmin` compares on type and mode only. Named assertions cover three things: no Integration bypass on a `refs/heads/main` ruleset, `required_approving_review_count` exactly 1, and `current_user_can_bypass` `never` wherever no person is a declared bypasser.
  - Static tag-pattern check (no network). The fnmatch-to-regex pattern must match `refs/tags/v153.5.1-1` (the current key) and `refs/tags/v153.0-1` (the two-part key, derived through `releaseIdentity()`). It must match no milestone tag (`git tag -l`; the fixture uses `v1.0`, `v1.4`) and must not match `refs/heads/main`.
  - `planWrites` looks rulesets up by name. A ruleset that exists is written with PUT by id, and POST is used only when it is absent. The immutable-releases PUT appears only when `GET releases?per_page=1` returns `[]`; otherwise a BLOCKED line names GH-09.
- **`scripts/apply-repo-controls.mjs`** defines no endpoint of its own. Run with no arguments it does a dry-run that prints the ordered writes and the `BLOCKED:` lines at column 0. With `--yes` it refuses before any `gh` call when stdin is not a TTY (exit 2; tested with a logging fake `gh`, whose log stayed empty). It also refuses when anything is blocked or unreadable, and it stops at the first failed write.
- **Registry**: `repo-controls-self-test` (quick, after `licensing-self-test`) and `repo-controls` (full tier, after `theia-fresh-clone-build-self-test`).

## Pre-apply baseline (2026-10-22, read-only)

Dry-run, `node scripts/apply-repo-controls.mjs` (exit 0):

```
1. PUT repos/DeBIOS-Foundation/powerbrowser/actions/permissions (body: .github/settings/actions-permissions.json)
2. PUT repos/DeBIOS-Foundation/powerbrowser/actions/permissions/selected-actions (body: .github/settings/actions-selected.json)
3. PUT repos/DeBIOS-Foundation/powerbrowser/actions/permissions/workflow (body: .github/settings/workflow-permissions.json)
4. PUT repos/DeBIOS-Foundation/powerbrowser/actions/permissions/fork-pr-contributor-approval (body: .github/settings/fork-pr-approval.json)
5. POST repos/DeBIOS-Foundation/powerbrowser/rulesets (body: .github/settings/ruleset-main-integrity.json)
6. POST repos/DeBIOS-Foundation/powerbrowser/rulesets (body: .github/settings/ruleset-main-review.json)
7. PUT repos/DeBIOS-Foundation/powerbrowser/immutable-releases (no body)
8. PUT repos/DeBIOS-Foundation/powerbrowser/private-vulnerability-reporting (no body)
9. PATCH repos/DeBIOS-Foundation/powerbrowser (body: .github/settings/repo.json)
BLOCKED: release-tags (.github/settings/ruleset-release-tags.json): powerbrowser-bot is not installed on the org; the owner creates and installs it at plan 41-04. Next step: install it, then re-run.
```

Live row, `node scripts/verify-repo-controls.mjs` (exit 1, 11 drift lines, no "could not be read"):

```
actions-permissions: allowed_actions is "all" live but "selected" declared
actions-permissions: sha_pinning_required is false live but true declared
actions-selected: the admission list does not apply, because allowed_actions is "all" live, not "selected" (GitHub answers 409 for this list until then)
fork-pr-approval: approval_policy is "first_time_contributors" live but "all_external_contributors" declared
main-integrity: ruleset main-integrity is missing from the live repo
main-review: ruleset main-review is missing from the live repo
release-tags: ruleset release-tags is missing from the live repo
immutable-releases: enabled is false live but true declared
private-vulnerability-reporting: enabled is false live but true declared
repo: has_discussions is false live but true declared
repo: allow_auto_merge is false live but true declared
```

`workflow-permissions` and `repository-secrets` are already green live (`read`/`false`, 0 secrets).

## Verification

- `scripts/verify-platform.sh --only repo-controls-self-test`: PASS. 28 plants went red naming the control and value; 2 controls stayed green (`enforced_by_owner` true; OrganizationAdmin `actor_id` 1); 3 planWrites assertions held (order and PUT-by-id with resolved `app_id` 900001, not installation 800001; one Release blocks GH-09; empty list plus no bot means POST for the main rulesets and BLOCKED for release-tags).
- `scripts/verify-platform.sh --quick`: exit 0 after each task, including the final tree.
- All acceptance criteria of the three tasks pass. The registry-row greps need `grep -F`, because `$REPO_ROOT` in the plan's pattern is read as a regex anchor. With `-F` each row counts 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GET selected-actions answers 409 while allowed_actions is all**
- **Found during:** Task 2 (read-only probe of the live endpoints)
- **Issue:** a plain fail-closed read printed "could not be read" against today's repo, which violates the Task 2 acceptance criterion (`grep -c 'could not be read'` = 0). RESEARCH did not record the 409.
- **Fix:** controls take an optional `gate` hook. `actions-selected` reads the (cached) actions-permissions response first. When `allowed_actions` is not `selected` live, the row reports a red drift line naming that cause and skips the GET. It still fails closed, and a planted `allowed_actions: all` is red on both controls.
- **Files modified:** scripts/verify-repo-controls.mjs
- **Commit:** e1def6a

**2. [Rule 3 - Blocking] the planned two-part ESR tag literal fails verify-upstream-pins**
- **Found during:** Task 3 (`--quick`)
- **Issue:** `verify-upstream-pins` refuses any `FIREFOX_<n>...` literal outside configuration.toml and its generated carrier, so the plan's `FIREFOX_175_0esr_RELEASE` turned `--quick` red.
- **Fix:** the x.0 tag is derived from the pinned tag (same major, `_0esr_RELEASE`), and the two-part key still comes from `releaseIdentity()`. It is `v153.0-1` on today's pin. The derivation is the same, and no pin literal is needed.
- **Files modified:** scripts/verify-repo-controls.mjs
- **Commit:** b506245

**3. [Rule 2 - Missing check] small additions to the self-test**
- Added plants: an empty settings directory, an unreadable fork-approval endpoint (edge SEC-11 empty), the bot App not installed, and `refs/**` matching `refs/heads/main` (edge GH-06 boundary; this also exercises the `**` conversion). An empty directory now also names each missing file.
- **Commits:** 2084f2a, b506245

## Notes for plan 41-04 (owner checkpoint)

- `apply --yes` refuses while any BLOCKED line exists, so the bot App must be installed before the apply. Otherwise the owner applies once now and again after the install.
- The `main-review` body sends `actor_id: null` for `OrganizationAdmin`, as RESEARCH prescribes. If the POST rejects null, GitHub's usual value for that role is 1, and the row ignores the id for that type either way.
- RESEARCH assumption A2 (`has_discussions` via PATCH) is untested; the repo PATCH is last for that reason.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: all 10 `.github/settings/*.json`, `scripts/verify-repo-controls.mjs`, `scripts/apply-repo-controls.mjs`
- FOUND: commits 2084f2a, e1def6a, b506245 (ancestors of HEAD)
