# Phase 51: Dependency flow and train supersede (F) - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Theia, GitHub Actions and npm security updates arrive as grouped PRs on a fixed rhythm, a newer ESR supersedes an open train cleanly, and the maintenance issue reports every renewal, alert and mirror drift.

Requirements: AUTO-02, AUTO-03, DIST-05, UPS-02, TRAIN-04, TRAIN-11 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

**Depends on:** Phase 48 (maintenance sweep), Phase 50 (release states). Planned against ROADMAP.md and REQUIREMENTS.md as written.

</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding, especially:
  - 4: Theia bump automerge off.
  - 5: One release per ESR point release, plus out-of-band revision bumps.
  - 13: No version facts on the home page; no `release.json` committed by any workflow.
  - 16: Self-hosted `renovatebot/github-action`, dispatched by the train with the bot App token; Mend Renovate is not used.
  - 22: Cachix (INF-05) and Flathub (PKG-20) kept; Upptime (MON-02) added alongside the watchdog (MON-01).
- DIST-05 cadence text is two weeks per REQUIREMENTS.md DOC-03 note (two-week cadence), stated in `docs/RELEASING.md`; the ESR calendar in External Gates is authoritative for dates.
- TRAIN-04 supersede and chemspill priority follow REQUIREMENTS.md as written; the sign-job newer-Release exit is part of the same rule.
- TRAIN-11 rows extend the Phase 48 maintenance sweep; the Codeberg row renders its no-data state until Phase 53 creates the mirror.

### Owner gates in this phase (stop points for autonomous execution)
- Enabling CodeQL default setup, enabling Dependabot alerts, merging the first Renovate `@theia/**` PR, merging the first grouped Dependabot PR, and any live GitHub setting change are owner actions. Plans build everything locally — Renovate config, Dependabot config, train supersede logic with fixtures, sweep-row extensions, RELEASING.md/RENEWALS.md text — and end with exact owner merge/enable commands where a live change is needed; they do not apply live changes, push, or dispatch.
- Read-only `gh api` GETs are allowed for research and for read-back rows.

### Assumptions about unfinished dependencies (recorded per task instruction)
- Phase 41 waits on the owner (live apply, Apps, probes, drills). Plans assume the `.github/settings/*` bodies and the `repo-controls`, `workflows` and `zizmor` rows exist as built in plans 41-01 to 41-03; they do not re-declare them. If the live apply is still pending at execution, the new rows that read live state (repo-controls extension, Dependabot/CodeQL alert counts) render their no-data or red state rather than passing vacuously.
- Phases 43 (train skeleton, `detect-upstreams.mjs`, `release-train.mjs` with DETECTED/BUMPING/CONFLICT/BUMP_RED/BUMP_PR_GREEN, `release-train-logic-self-test`, scheduler Worker), 48 (maintenance sweep, TRAIN-07 pinned issue) and 50 (BUILDING/AWAITING_APPROVAL/PUBLISHED/DESCRIPTOR_WAIT/DESCRIPTOR_LIVE/LIVE_RED/WITHDRAWN/DONE, `release.yml` sign-publish) are unexecuted. Plans assume their artifacts exist exactly as ROADMAP/REQUIREMENTS describe them and extend them only: TRAIN-04 adds SUPERSEDED (+ NEEDS_OWNER already defined for the fixer) and the chemspill priority; TRAIN-11 adds rows to the sweep; AUTO-02 runs the licensing generator (PKG-08 upkeep) inside the Renovate flow. If any assumed file is absent at execution, the executor records the missing premise and stops rather than redefining the train.
- The Codeberg mirror does not exist until Phase 53. The TRAIN-11 Codeberg row is implemented now but asserts only its no-data render until the mirror exists.
- The `powerbrowser-updates` repo and the Homebrew tap repo are assumed created empty in Phase 41; no plan creates repos or Apps.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/SUMMARY.md` Phase F and `FEATURES.md` AUTO/TRAIN rows (Renovate self-hosted dispatched by the train, Dependabot grouped SHA-pin behaviour, supersede rule, maintenance issue), `ARCHITECTURE.md` (train as `release-train.mjs` derive/next/render + `release-train-logic-self-test` set-equality fixtures; `verify-workflows.mjs` trust boundary; `repo-controls` CONTROLS table), `PITFALLS.md`, `CRITIQUE.md`, plus the tree: `theia/package.json` resolutions (all `@theia/*` at 1.76.0 except `@theia/monaco-editor-core`), `configuration.toml [upstreams] theia_release`, `flake.lock`, `theia/yarn.lock`, `scripts/generate-licensing.mjs` (notices drift on every bump), `scripts/verify-workflows.mjs` (admission set equality against `.github/settings/actions-selected.json`), `scripts/verify-repo-controls.mjs` (CONTROLS table; code-security OPT-OUT notes Phase 51), `.github/workflows/verify.yml` + `rebase-upstream.yml` (SHA-pinned `uses:`, no `schedule:`, legion label rules), and `docs/RELEASING.md` (cadence, runner, secrets inventory).

</code_context>

<specifics>
## Specific Ideas

- Research flag F: whether a Theia `yarn.lock` regeneration fits the self-hosted Renovate run (time, RAM, disk on the legion runner vs GitHub-hosted; Mend 30-min/3 GB limits do not apply to self-hosted, but the run must still be measured; npm security-only updates to `theia/yarn.lock` are the Dependabot half, not the Renovate half).
- AUTO-02: one grouped `@theia/**` PR with `@theia/monaco-editor-core` separate, `rangeStrategy: pin`, customManager rewriting `theia_release` in `configuration.toml`, nix manager updating `flake.lock`, automerge off, dispatched by the maintenance sweep on the first tick after each last-Thursday Theia release and on owner dispatch, with the bot App token; the licensing generator must run in the same flow or the `licensing` drift row turns the PR red (Phase 40 Pitfall 7).
- AUTO-03: Dependabot weekly grouped github-actions updates keeping SHA pins with plain version comments (compound comments go stale), plus npm security-only updates to `theia/yarn.lock` (version updates off); Dependabot alerts on; CodeQL default setup covering `theia/extensions` and `scripts/`.
- TRAIN-04 fixtures land in `release-train-logic-self-test` as those states are added (SUPERSEDED, chemspill priority, sign-job newer-Release exit, cancelled pending `release` deployment).
- TRAIN-11 rows: `renewals-due`, `repo-controls`, open Dependabot PR count, open Dependabot and CodeQL alert counts, CodeQL last-push age, Codeberg `main` SHA vs GitHub `main`; `docs/RELEASING.md` cadence + npm-advisory response time; `docs/RENEWALS.md` Node 24 Maintenance-end row (2028-04-30).

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
