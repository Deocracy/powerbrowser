# Phase 41: Repository controls and GitHub Apps (A) - Context

**Gathered:** 2026-10-21
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Before any App token, bot workflow or self-hosted runner exists, the org and repo enforce every control the pipeline relies on, and each setting is declared in the tree and read back by a row.

Requirements: GH-02, SEC-06, SEC-11, GH-05, GH-06, GH-07, GH-08, GH-09, GH-10, GH-11, GH-12, AUTO-09, GH-18 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; bot App without the Workflows permission; non-ephemeral legion runner later (Phase 49); fork approval for all external contributors; tags created only by the bot App after `release` approval.

### Owner gates in this phase (stop points for autonomous execution)
- Every change to the LIVE GitHub org or repo (applying rulesets, environments, Actions policy, repo settings, org 2FA), creating and installing the two GitHub Apps, creating the empty `powerbrowser-updates` and Homebrew tap repos, adding the second org owner and storing recovery codes, the runner-group probe as org admin, and the phone-notification test are owner actions. Plans build everything locally — declared settings under `.github/settings/`, an apply script that reads them, the `repo-controls` full-tier row and its self-test, the `workflows` and zizmor quick rows — and end with one `checkpoint:human-action` listing the exact commands, after which the live `repo-controls` row is run.
- Read-only `gh api` calls against the live org/repo are allowed for research and for the read-back row.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` and `SUMMARY.md` Phase A3 (settings bodies, rulesets, environments, Actions allow-list plus `sha_pinning_required`, Apps without Workflows, runner-group probe, `repo-controls` row), `docs/RELEASING.md:305-322, 437-467` (existing settings text), and `.github/workflows/` (inputs to the `workflows` row and zizmor).

</code_context>

<specifics>
## Specific Ideas

- Research flag A3: whether runner-group "selected workflows" exists on the Free plan; whether an App without the Workflows permission can push commits that touch workflow files.
- The `workflows` row is the trust-boundary check reused by later phases (train, fixer): no `schedule:` key, legion label only in `release.yml` build-*/matrix-* jobs, SHA-pinned admitted `uses:`, guarded `workflow_run`, no event text interpolated into `run:` or `prompt:`.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
