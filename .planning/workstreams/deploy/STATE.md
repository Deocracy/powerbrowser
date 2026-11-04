---
gsd_state_version: "1.0"
milestone: v1.6
current_phase_name: Owner live pass (Stage E)
status: executing
stopped_at: "Stage D Phase 57 gaps: 57-05 (autoSubmit2 locked in policies.json, gate crash-autosubmit-lock), 57-06 (layer-3 --crash-ping assertion and control, owner run pending), 57-07 (routes crash.powerbrowser.org) executed; 57-08 (AUTO_SUBMIT env clear) planned, blocked on PowerBrowserAPI.sys.mjs held by another session; 57-04 owner checkpoint untouched"
last_updated: "2026-11-04T10:07:11.890Z"
last_activity: 2026-11-03
state_head: 2940fa06bbc954f66efa1562933958a3b2778fe0
progress:
  total_phases: 19
  completed_phases: 13
  total_plans: 117
  completed_plans: 110
milestone_name: Deployment setup
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-20)

**Core value:** A stranger can clone Power Browser, edit `configuration.toml`, drop in a logo, and build their own branded, working web browser without touching any other file, then reshape its GUI through Theia extensions without forking the platform.
**Current focus:** Stage E owner live pass (OWNER-PASS.md), then Stage F builds and gate

## Current Position

Phase: all 19 phases (40-58) planned; 117 plans, 110 executed (a plan counts as executed when its `*-SUMMARY.md` exists, derived with `ls phases/*/*-PLAN.md | wc -l` and `ls phases/*/*-SUMMARY.md | wc -l` on 2026-11-03)
Current Plan: none; Stages A-D of FINISH-PLAN.md are done (Stage B and C docs, Stage D gap plans 41-05..07, 43-06..08, 46-05..06, 48-06..07, 49-06..09, 50-05, 51-05..07, 52-06..07, 53-05..07, 54-05..10, 57-05..08)
Status: Executing. Stage E (owner live pass) is next; the exact commands are in OWNER-PASS.md. Then Stage F (builds and gate), Stage G (verify, audit, complete-milestone), Stage H (tag, owner-approved push).
Last activity: 2026-11-03 - Stage C state reconciliation; authoritative plan is FINISH-PLAN.md (owner rulings R1-R17)

Plans and SUMMARYs per phase (PLAN/SUMMARY): 40 8/8, 41 7/6, 42 4/4, 43 8/8, 44 4/3, 45 4/4, 46 6/6, 47 4/3, 48 7/7, 49 9/9, 50 5/4, 51 7/7, 52 7/6, 53 7/7, 54 10/10, 55 4/4, 56 5/5, 57 8/6, 58 3/3.

Plans without a SUMMARY: 41-04, 44-01, 47-04, 50-04, 52-05, 57-04 and 57-08. These are owner checkpoints, except 57-08, which waits for the other session to commit powerbrowser/shell/PowerBrowserAPI.sys.mjs. A SUMMARY can record a partial plan (49-02 Task 3, 54-06 publish path, 57-01 Task 2 are open inside executed plans).

Progress: [█████████░] 94% (110 of 117 plans)

## Progress

**Phases with a SUMMARY for every plan:** 13 of 19 (40, 42, 43, 45, 46, 48, 49, 51, 53, 54, 55, 56, 58); none is owner-verified
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
- [Phase 46]: 46-05/46-06 (G-46): WebDriver hop driver scripts/drive-mar-update-hop.mjs records the UPD-24 transcript from observation (row mar-hop-driver-self-test); version-nplus1 bumped to 153.5.2; live hop and N+1 rebuild run in Stage F per docs/BUILD.md

### Pending Todos

- Owner, Stage E: create the Cloudflare account with 2FA and payment method (47-04). The D-U-N-S todo is dropped (SEC-12 out of scope, 2026-11-03).

### Blockers/Concerns

- Phase 43 exit test is calendar-bound: the first ESR 153 point release after the train lands (153.7 on 2026-11-10, else 153.8 on 2026-11-24, and so on); 153.6 (2026-10-27) is out of reach.
- FIX-10 (Phase 52) must be proven before 2027-05-27; ESR 175.x must ship before 153.27 (2027-09-07).

## Session Continuity

**Last session:** 2026-11-04T07:48:09.294Z

**Stopped At:** Stage D Phase 57 gaps: 57-05 (autoSubmit2 locked in policies.json, gate crash-autosubmit-lock), 57-06 (layer-3 --crash-ping assertion and control, owner run pending), 57-07 (routes crash.powerbrowser.org) executed; 57-08 (AUTO_SUBMIT env clear) planned, blocked on PowerBrowserAPI.sys.mjs held by another session; 57-04 owner checkpoint untouched
**Resume File:** .planning/workstreams/deploy/phases/57-native-crash-reporting-k/BLOCKED.md

## Milestone Context

- Scope: `.planning/seeds/SEED-002-deployment-setup.md` phases A–L, plus two additions approved 2026-10-20: a release-and-maintenance orchestrator (`release-train.yml` started by the Worker cron, one tracking issue per release) and Claude Code Action fixer steps that open PRs for review and never merge, approve, or touch signing keys.
- Runs as workstream `deploy` on branch `workspace/deploy`, created with `--no-migrate`; main's flat planning (v1.5 Chrome Bar Firefox Parity) is untouched.
- Research for this milestone lives in `.planning/research/v1.6-deploy/` (the research dir is shared with v1.5).
- Roadmap: `.planning/workstreams/deploy/ROADMAP.md` (Phases 40–58).
