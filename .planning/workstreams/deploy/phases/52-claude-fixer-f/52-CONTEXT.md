# Phase 52: Claude fixer (F) - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped per autonomous mode; recommended option "Continue without context" taken, enriched from ROADMAP + REQUIREMENTS + research SUMMARY)

<domain>
## Phase Boundary

When a bump PR goes red, a patch fails to replay or `main` goes red, a Claude-written fix arrives as a gated PR for the owner to review, and the fixer can never merge, approve, sign or weaken a gate.

Requirements: FIX-01, FIX-02, FIX-03, FIX-04, FIX-05, FIX-06, FIX-07, FIX-08, FIX-09, FIX-10, FIX-11, FIX-12, TRAIN-06 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

Depends on: Phase 50 (release states), Phase 51 (Renovate Theia branch is a fixer class).
External gate: Anthropic Console fixer workspace with a monthly limit; OIDC federation or the `fixer` environment key; FIX-10 deadline 2027-05-27 (ESR 175 nightly).
Research flag: Yes (F): whether passing `github_token` suppresses the action's own OIDC App-token exchange, which decides OIDC versus `ANTHROPIC_API_KEY`.
</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; bot App without the Workflows permission; fixer opens PRs only, never merges, never approves environments, never touches signing keys; spend-limited; patches only through `scripts/regenerate-patches.sh` (decisions 20, 21).
- Fixer authentication: GitHub OIDC workload identity federation, with an `ANTHROPIC_API_KEY` in the `fixer` environment as fallback (decision 17). The F research flag decides between them by reading the pinned action source at `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` for whether passing `github_token` suppresses the action's own App-token exchange.
- No `schedule:` in the product repo (decision 1); the train, not the fixer, owns cadence. One `release-train` concurrency group; the fixer has its own `claude-fixer` group.
- Theia bump automerge is off (decision 4); the Renovate Theia branch is a fixer class like `chore/esr-*` and `chore/node-*`.
- Fixer limits (decision 21) and TRAIN-06 routing (red stage labels `train:blocked`, assigns owner, links log; fixer starts only for the three FIX-01 classes; `release.yml` failures open an issue only) are load-bearing.

### Owner gates in this phase (stop points for autonomous execution)
- Creating the Anthropic Console fixer workspace with a monthly limit, setting up OIDC federation or storing the `fixer`-environment key, creating/installing any GitHub App, applying any live repo/org setting, and the FIX-10 live proof (a real red PR reviewed and merged by the owner before 2027-05-27) are owner actions. Plans build everything locally — workflow files, `scripts/release-train.mjs` routing additions, `fix-gate` logic, `.github/fix-gate-deny.json`, `scripts/verify-fix-gate.mjs` + registry row, `docs/RELEASING.md` sections — and end with one `checkpoint:human-action` listing the exact owner commands, after which the live proof runs.
- Read-only `gh api` calls against the live org/repo are allowed for research and for read-back rows. No network writes: no push, no dispatch, no App creation.

### Assumptions about unfinished dependencies (recorded per autonomous rules)
- A1: Phase 41 (repository controls and GitHub Apps) waits on the owner for live apply. These plans assume the declared controls exist as specified in Phase 41's plans: `fixer`/`bot`/`release`/`descriptor`/`triage` environments branch-restricted to `main`, the bot App without Workflows permission, `actions-selected.json` admitting `anthropics/claude-code-action@*` + `actions/create-github-app-token@*` + `attest-build-provenance`, and the `workflows` row trust rules. If Phase 41 lands differently, the fixer workflow's permissions/env/runner assertions must be re-pinned.
- A2: Phases 43 (train skeleton), 49 (release pipeline), 50 (release states) and 51 (Renovate/supersede) are not finished. These plans assume `release-train.yml` + `scripts/release-train.mjs` exist per ARCHITECTURE.md §4/§5 (report job owns issue writes, `fix`/`fix-gate`/`fix-pr` job names, NEEDS_OWNER in the TRAIN-03 state table, attempt counting from `fix` job `run-name`s carrying release key + class). Where the train does not yet exist, plans specify the contract + fixtures first and touch `release-train.mjs` only to add the NEEDS_OWNER row and the FIX-01 dispatch rule, leaving the rest to Phase 43/50.
- A3: Theia 1.77 + TypeScript 6.0 red PR (FIX-10's expected live proof) does not exist yet. Plans prove the chain on fixtures + a staged red branch and leave the live merge to the owner before 2027-05-27.

### Claude's Discretion
All other implementation choices are at Claude's discretion. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.
</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` §5 (fixer three-job split, credential choice, `work/` checkout, `claude-fixer` group, NEEDS_OWNER) and `SUMMARY.md` Phase F + corrections C2/C4 (three jobs, not two; `github_token`-suppresses-exchange is the open OIDC question), `scripts/verify-workflows.mjs` (the `workflows` row: SHA pinning, admission set-equality, hosted-or-legion runner, legion no-env/no-secrets, claude-code-action hosted + no App-token sibling + contents-not-write, issues-write admission, event-text, no-cache; extend it, do not fork it), `.github/workflows/verify.yml` + `rebase-upstream.yml` (Nix-wrapped generator steps, pinned `uses:` anchors for the self-test), `.github/settings/` (environment files, `actions-selected.json`), `scripts/regenerate-patches.sh` + `scripts/check-patch-surface.sh` (the only legal patch path; fixer never text-edits hunks), and `docs/RELEASING.md` (where the auth outcome, spend limits and support sections land).
</code_context>

<specifics>
## Specific Ideas

- Research flag F: read the pinned `anthropics/claude-code-action` source at `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` for whether passing explicit `github_token` suppresses its own App-token OIDC exchange; the answer selects FIX-12's `id-token: write`-only path versus the `fixer`-environment `ANTHROPIC_API_KEY` path (CRITIQUE.md C4).
- The `workflows` row is the trust-boundary check reused by the fixer: no `schedule:`, hosted-only fixer jobs, SHA pin `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` + pinned Claude Code version via `path_to_claude_code_executable`, `show_full_output`/`display_report` false, no `ACTIONS_STEP_DEBUG`, no bare `Bash`, WebFetch/WebSearch denied, never on `claude-fix/*` heads or for the bot actor, `allowed_bots` explicit.
- `fix-gate` deny list lives in `.github/fix-gate-deny.json` and is read by both the gate and its self-test; the registry row `verify-fix-gate` derives its plant list from that file plus every file a registry row names (parsed at gate time), then runs apply non-vacuity, check-patch-surface, scan-brand-residue, `diff-theia-core.sh` and `--quick`.
- Attempt counting comes from `fix` job runs whose `run-name` carries the release key and class, so a `fix-gate`-rejected attempt still counts; the third failure moves the release to NEEDS_OWNER (a TRAIN-03 state-table row this phase adds).

</specifics>

<deferred>
## Deferred Ideas

None — discuss skipped.
</deferred>
