# Phase 43: Release train skeleton and upstream bump automation (A) - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

A new ESR point release or Node 24 release arrives as a green bot PR with one tracking issue, started by the hourly clock, with no owner dispatch.

Requirements: INF-03, TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-08, TRAIN-09, AUTO-01, AUTO-06, AUTO-07, AUTO-04 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

**Depends on:** Phase 40 (pin at `FIREFOX_153_5_1esr_RELEASE`, callable `rebase-upstream.yml` with no `tag` default, `scripts/regenerate-patches.sh`), Phase 41 (Apps, `bot` environment, `workflows` row), Phase 42 (labels).

**Assumption about unfinished dependencies (recorded per workstream rule):** Phase 41 is still executing — its owner checkpoint (plan 41-04: creating and installing both GitHub Apps, creating the empty `powerbrowser-updates` and tap repos, second owner, 2FA, apply, probes and drills) is pending, so the `bot` environment, the clock-App installation, and the live-green `repo-controls` row are ASSUMED present by Phase 43 plans, never asserted. Phase 42 is unplanned, so the tracking-issue labels (`release-train`, `state/<STATE>`) are ASSUMED names that Phase 42 declares in `labels.json`; Phase 43 plans use them verbatim and never create a second label source. If either assumption breaks, the affected plan goes red at its assumption citation, not silently green.

</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; bot App without the Workflows permission; the Worker is a clock only (decision 15, amending SEED-002 automation rows 1, 4, 7, 13 — detection, liveness, pin age and descriptor delay run in Actions, never in the Worker); self-hosted Renovate dispatched by the train (decision 16); fixer opens PRs only, never merges/approves/touches signing keys, spend-limited, patches only through `regenerate-patches.sh` (decisions 20–21).
- No schedule key in the product repo (decision 77 in SEED-002). No App holds the Workflows permission.
- The kit plan gate runs as `python3 scripts/plan-gate.py --root . --phase N --plans <dir> --stream deploy`; main's ledger rows use main's phase numbers and are not due against phases 40+.

### Owner gates in this phase (stop points for autonomous execution)
- Creating the Cloudflare account with 2FA (owner step now, no cost), creating the `powerbrowser-scheduler` repo, creating and installing the clock App (Actions read/write only, on `powerbrowser`), storing the clock-App PKCS#8 key as a Worker secret, and the calendar-bound exit test (the first ESR 153 point release after the train lands: 153.7 on 2026-11-10, else 153.8 on 2026-11-24) are owner actions. Plans build everything locally — `scripts/detect-upstreams.mjs` with its fixture self-test, `scripts/release-train.mjs` with its derive/next/render trio and logic self-test, `release-train.yml` skeleton jobs, the scheduler Worker source scaffold, the `docs/RELEASING.md` records (JWT-mint CPU time, clock record, Node-detector record replacing the BUILD.md gpg step) — and end with one `checkpoint:human-action` listing the exact commands, after which the live exit test runs on the calendar.
- Read-only `gh api` GETs against the live org/repo are allowed for research and for read-back rows. Any write to GitHub (dispatch, PR, issue, comment, lock) is forbidden in every plan except through `dry-run`-proven paths at the owner checkpoint.
- Every train stage takes a `dry-run` input that validates and renders but commits, opens, comments and dispatches nothing (TRAIN-08); the `workflows` row asserts every write step is gated by it.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` §4 (orchestrator: triggers, the per-release state machine, tracking-issue protocol, maintenance sweep — Phase A delivers DETECTED, BUMPING, CONFLICT, BUMP_RED, BUMP_PR_GREEN only) and SUMMARY.md Phase A5/A6 (report protocol and Node detector are standard patterns; open item: whether the RS256 JWT mint fits the Workers Free 10 ms CPU limit, which INF-03 measures), `.github/workflows/rebase-upstream.yml` (the `workflow_call` callee with no `tag` default, Nix-wrapped generate steps, `contents: read` + `persist-credentials: false`), `scripts/verify-workflows.mjs` (every rule `release-train.yml` must satisfy: no `schedule:`, legion label only in `release.yml` build-*/matrix-* jobs, SHA-pinned admitted `uses:`, guarded `workflow_run`, no event text in `run:`/`prompt:`, no cache in the release path), `scripts/regenerate-patches.sh` + `scripts/rebase-upstream.sh` (how a replay failure surfaces: which `FAIL --` line names patch NNN), `scripts/verify-release-identity.mjs` (release key `v<ESR>-<revision>` derivation the train reuses, never a literal), `configuration.toml` `[product]` (`revision`) and `[upstreams]` (`firefox_esr_tag`), `powerbrowser/packaging/node-runtime.json` (the Node pin AUTO-04 bumps), and `docs/BUILD.md:1041-1049` (the manual gpg step AUTO-04 removes once the job verifies SHASUMS inside itself).

</code>

<specifics>
## Specific Ideas

- Research flag (partial): SUMMARY marks the A5 report protocol and A6 as standard; the open item is the INF-03 JWT-mint CPU measurement against the 10 ms Workers Free limit, recorded in `docs/RELEASING.md`.
- The `detect-upstreams-self-test` row covers the tag mapping and the major guard from fixtures, including the fixture where `FIREFOX_ESR` is `175.0esr` and a `FIREFOX_153_23_0esr_RELEASE` tag exists, which must yield a 153.23 detection (AUTO-01).
- The `release-train-logic-self-test` row runs `derive`/`next`/`render` over fixture API JSON with one fixture per state in the state table compared as set equality, plus five fault plants (merged PR with unchanged pin, draft Release, fork-head `workflow_run`, duplicate tracking issue, 175.x ESR under the 153 guard), each going red naming the drift (TRAIN-09). Release-stage fixtures land with Phase 50 and supersede with Phase 52 as those states are added.
- The bump job calls `rebase-upstream.yml` through `workflow_call` with `contents: read` and `persist-credentials: false`; the `bump-pr` job (env `bot`) mints the App token and opens or updates `chore/esr-<tag>`, so `verify.yml` runs on it without an approval click (AUTO-06). The bump edits `configuration.toml` + patches only — never workflow files, because an App without the Workflows permission cannot push a commit that touches `.github/workflows/` (Phase 41 RESEARCH Pitfall 2).
- A replay failure opens or updates exactly one issue titled `ESR <tag>: patch <NNN> did not apply`, carrying the apply log and `git -C upstream diff`, assigned to the owner; the automation never hand-edits a patch (AUTO-07).
- The scheduler Worker lives in its OWN repo (on workers.dev first); this tree produces the dispatch contract in `release-train.yml`, a Worker source scaffold, and the `docs/RELEASING.md` records — not the deployed Worker.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
