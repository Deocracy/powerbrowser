---
gsd_state_version: "1.0"
milestone: v1.6
current_phase_name: Release pipeline and legion runner (E)
current_plan: 5
status: executing
stopped_at: Completed 43-06, 43-07, 43-08 gap plans (Stage D G-43, G-cmd scheduler half)
last_updated: "2026-11-04T02:30:03.310Z"
last_activity: 2026-10-31
last_activity_desc: 49-04 built, reviewed and fixed; six open items settled by the autonomous run
state_head: a96b9095acc8b930ca0aa59bad175d3b31360128
progress:
  total_phases: 19
  completed_phases: 4
  total_plans: 90
  completed_plans: 84
milestone_name: Deployment setup
current_phase: 49
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-20)

**Core value:** A stranger can clone Power Browser, edit `configuration.toml`, drop in a logo, and build their own branded, working web browser without touching any other file, then reshape its GUI through Theia extensions without forking the platform.
**Current focus:** pre-checkpoint tasks of the remaining plans (sibling worktrees), then the end-of-milestone owner pass

## Current Position

Phase: all 19 phases (40–58) planned; 84 plans, 66 executed (a plan counts as executed when its `*-SUMMARY.md` exists, derived with `ls phases/*/*-SUMMARY.md` on 2026-10-31)
Current Plan: none in this worktree; last built plan 49-04 (built, reviewed and fixed 2026-10-31, fixes af31517e..4de8a340)
Total Plans in Phase: 4–8 per phase; see the per-phase list below
Status: Executing. Remaining automatic work is the pre-checkpoint tasks of the unexecuted plans, now running in sibling worktrees. Everything else is owner-blocked: see HANDOFF.md "Blocked on the owner".
Last activity: 2026-10-31 — 49-04 built, reviewed and fixed; six open items settled by the autonomous run under the owner's instruction to decide items not needing owner input (org Deocracy; 43 item 1 option B; 50 item 2 confirmed; 44-03 WR-03 exemption stays; 57 B1 option (a); 49-04 item 2 publish release-manifest.json)

Executed plans (have a SUMMARY):

- 40: 40-01 .. 40-08 (all 8)
- 41: 41-01, 41-02, 41-03 — not executed: 41-04
- 42: 42-01, 42-02, 42-03 — not executed: 42-04
- 43: 43-01 .. 43-04 — not executed: 43-05
- 44: 44-02, 44-03 — not executed: 44-01, 44-04
- 45: 45-01 .. 45-04 (all 4)
- 46: 46-01 .. 46-04 (all 4)
- 47: 47-01, 47-02, 47-03 — not executed: 47-04
- 48: 48-01 .. 48-04 — not executed: 48-05
- 49: 49-01 .. 49-04 — not executed: 49-05
- 50: 50-01, 50-02 — not executed: 50-03, 50-04
- 51: 51-01 .. 51-04 (all 4)
- 52: 52-01 .. 52-04 — not executed: 52-05
- 53: 53-01, 53-02, 53-03 — not executed: 53-04
- 54: 54-01, 54-02, 54-03 — not executed: 54-04
- 55: 55-01, 55-02 — not executed: 55-03, 55-04
- 56: 56-01 .. 56-04 — not executed: 56-05
- 57: 57-01, 57-02, 57-03 — not executed: 57-04
- 58: 58-01, 58-02 — not executed: 58-03

A SUMMARY can record a partial plan: 49-02 Task 3 (runner registration) and 57-01 Task 1 (B1) are open inside executed plans.

Progress: [████████░░] 79% (66 of 84 plans)

## Progress

**Phases Complete:** 4 of 19 have a SUMMARY for every plan (40, 45, 46, 51); none is owner-verified
**Current Plan:** none (see Current Position)

## Performance Metrics

**Velocity:**

- Total plans completed: 66 (per-plan rows below were recorded only through 41-03)

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 40 P01 | 15min | 2 tasks | 6 files |
| Phase 40 P02 | 15min | 2 tasks | 3 files |
| Phase 40 P03 | 25min | 3 tasks | 23 files |
| Phase 40 P04 | 8min | 2 tasks | 14 files |
| Phase 40 P05 | 25min | 2 tasks | 11 files |
| Phase 40 P06 | 8min | 2 tasks | 6 files |
| Phase 40 P07 | 10min | 2 tasks | 7 files |
| Phase 40 P08 | 2824s build + owner checkpoint | 3 tasks | 0 files |
| Phase 41 P01 | 17min | 3 tasks | 13 files |
| Phase 41 P02 | 16min | 3 tasks | 12 files |
| Phase 41 P03 | 9min | 3 tasks | 5 files |
| Phase 41 P05 | 10min | 2 tasks | 3 files |
| Phase 41 P06 | 10min | 2 tasks | 3 files |
| Phase 41 P07 | 10min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Owner decisions 1–22 of 2026-10-20 are recorded in `.planning/workstreams/deploy/REQUIREMENTS.md` (Owner Decisions). Roadmap decisions:

- Phases follow SEED-002 letters A–L; A, C, D, E and F span several phases (A: 40–43, C: 45–46, D: 47–48, E: 49–50, F: 51–52).
- Backlog Phase 999.2 "Release and distribution" in main's ROADMAP.md is superseded by this milestone (main's file not edited from this workstream).
- AUTO-08 (generate inside `nix develop .#theia`, no `tag` default) is in Phase 40 after DIST-06, so the first dispatched `rebase-upstream.yml` run can go green (ARCHITECTURE R1; SUMMARY A1).
- GH-10: Phase 41 creates `powerbrowser-updates` and the Homebrew tap repo empty, so `repo-controls` can read back the bot App installation; Phases 47 and 56 fill them.
- Live observations that need a real GitHub Release (UPD-15 asset hosts; sweep runner, channel and download rows) are Phase 50 criterion 5.
- The kit plan gate runs as `python3 scripts/plan-gate.py --root . --phase N --plans <dir> --stream deploy` in this workstream (owner choice 2026-10-20, commit 8d9a429): main's ledger rows (e.g. NG-089, phase 26) use main's phase numbers and are not due against phases 40+. Any v1.6 ledger row must carry `"stream": "deploy"`.
- Phase 40: update channel stays `default` / `powerbrowser-default`; `product.revision` is a TOML integer; push and first `rebase-upstream.yml` dispatch are the owner's 40-08 Task 3 checkpoint, which also carries the About-dialog result.
- [Phase 40]: 40-01: rebase-upstream.yml carries no tag at all (no input default); verify-upstream-pins sweeps it like any other file and asserts both triggers, no default, and Nix-wrapped generator steps
- [Phase 40]: 40-02: regenerate-patches.sh write mode validates every regeneration before any rename, so a refusal leaves the whole stack byte-identical
- [Phase 40]: product.revision is a TOML integer (required, >=1); release key v<ESR>-<revision> via releaseIdentity(); version files are release metadata, never a Gecko build input
- [Phase 40]: Update channel default, MAR channel id powerbrowser-default, from one exported generator constant UPDATE_CHANNEL (UPD-11)
- [Phase 40]: configuration.toml [urls] update (MOZ_APPUPDATE_HOST) is the only update URL source; policies.json carries no AppUpdateURL (UPD-12)
- [Phase 40]: Third allowlist disposition user-initiated: reachable only after a user action; an unattended request fails exactly like deny, through one verdict module scripts/lib/endpoint-verdict.mjs (UPD-33)
- [Phase 40]: About-dialog link prefs derive from [urls] release_notes and homepage via releaseLinkPrefs, kept out of mozillaEndpointPrefs as click destinations (UPD-13)
- [Phase 40]: Language-pack updates are off in both variants (app.update.langpack.enabled=false as a base line); release is en-US only (PKG-09) (UPD-25)
- [Phase 40]: The five update cadence/prompting prefs are forbidden in branding output by exact name and fall through to Gecko code/manifest defaults; promptWaitTime then defaults to 12h, not official's 8 days (UPD-25)
- [Phase 40]: Release scope is en-US only; stated in README and PROJECT.md, repeated later on the /download page and in release notes (PKG-09)
- [Phase 40]: Licence notices are generated by scripts/generate-licensing.mjs (about:license via mozbuild preprocessor, Theia closure walk, pinned Node LICENSE); bump PRs must regenerate them (PKG-08)
- [Phase 40]: Phase 40 full mar-update-hop row not run; only its self-test ran. Live N to N+1 hop deferred to Phase 44/50
- [Phase 41]: 41-02: environment controls own an explicit file list; names derive from file names and the settings-set equality keeps the list equal to the tree
- [Phase 41]: 41-02: environment branch-policy POST is planned only when the environment is absent or lacks main/branch, so a re-apply never duplicates it
- [Phase 41]: 41-02: App permission maps compare exactly; any Workflows key on any org installation is red; owner UI steps print from the bodies and --yes never acts on them
- [Phase 57]: D-72/D-73 amended 2026-10-31 (owner ruling on 57 BLOCKED B1, option (a)): check-patch-surface.sh accepts a compiled target only at the exact paths toolkit/crashreporter/client/app/src/glean.rs and send_ping.rs (ALLOWED_COMPILED_PATHS); every other compiled path, any other .rs included, stays an offense
- [Phase 41]: 41-05 (R10): the apps control counts an undeclared org App only when it reaches powerbrowser, powerbrowser-updates or homebrew-tap (selection all, or a repository list touching the set derived from app-*.json); an unreadable list stays red; narrows the 41-02 rule
- [Phase 43]: Gap plans 43-06 (live facts in derive, exactly-one tracking writer), 43-07 (GH-15 known-issues issue), 43-08 (scheduler wrangler.toml) built — FINISH-PLAN.md Stage D G-43 and G-cmd scheduler half; facts source approved by the owner 2026-11-03

### Pending Todos

- Owner, now: request the D-U-N-S number; create the Cloudflare account with 2FA.

### Blockers/Concerns

- Phase 43 exit test is calendar-bound: the first ESR 153 point release after the train lands (153.7 on 2026-11-10, else 153.8 on 2026-11-24, and so on); 153.6 (2026-10-27) is out of reach.
- FIX-10 (Phase 52) must be proven before 2027-05-27; ESR 175.x must ship before 153.27 (2027-09-07).

## Session Continuity

**Last session:** 2026-11-04T02:29:57.432Z

**Stopped At:** Completed 43-06, 43-07, 43-08 gap plans (Stage D G-43, G-cmd scheduler half)
**Resume File:** None

## Milestone Context

- Scope: `.planning/seeds/SEED-002-deployment-setup.md` phases A–L, plus two additions approved 2026-10-20: a release-and-maintenance orchestrator (`release-train.yml` started by the Worker cron, one tracking issue per release) and Claude Code Action fixer steps that open PRs for review and never merge, approve, or touch signing keys.
- Runs as workstream `deploy` on branch `workspace/deploy`, created with `--no-migrate`; main's flat planning (v1.5 Chrome Bar Firefox Parity) is untouched.
- Research for this milestone lives in `.planning/research/v1.6-deploy/` (the research dir is shared with v1.5).
- Roadmap: `.planning/workstreams/deploy/ROADMAP.md` (Phases 40–58).
