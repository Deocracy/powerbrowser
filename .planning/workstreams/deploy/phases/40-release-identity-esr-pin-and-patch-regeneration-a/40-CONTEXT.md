# Phase 40: Release identity, ESR pin and patch regeneration (A) - Context

**Gathered:** 2026-10-20
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

The tree is on the current ESR security release, every release identity fact (release key, update channel, version files, update and release-notes URLs, licence notices) derives from `configuration.toml`, a patch can change only through regeneration, and `rebase-upstream.yml` replays the pin green inside Nix as a callable workflow.

Requirements: DIST-06, AUTO-08, REL-01, UPD-11, UPD-12, UPD-13, UPD-33, UPD-25, PKG-08, PKG-09, AUTO-10 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions).
- UPD-33: `user-initiated` is a third allowlist disposition; an unattended request to such a host fails like `deny`.
- The update channel name is chosen once and derived everywhere (UPD-11); record the choice in PROJECT.md Key Decisions.

### Owner gates in this phase (stop points for autonomous execution)
- Pushing to GitHub and dispatching the first `rebase-upstream.yml` run against `FIREFOX_153_5_1esr_RELEASE` are owner actions. Plans prepare everything locally and end with the exact push/dispatch commands; they do not push.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research. Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` (file:line integration points, including R1: `rebase-upstream.yml:108-115` runs generate outside Nix) and `SUMMARY.md` Phase A1/A2/A4.

</code_context>

<specifics>
## Specific Ideas

- `scripts/regenerate-patches.sh` uses `git -C upstream diff --abbrev=10` over each patch's own `+++ b/` paths, never `--full-index`; `--check` byte-compares with the tracked patch (SUMMARY correction 7).
- Pin bump changes `configuration.toml:115` and the `rebase-upstream.yml:33` default together (DIST-06) before AUTO-08 deletes the default.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
