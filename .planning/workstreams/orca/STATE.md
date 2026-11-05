---
gsd_state_version: "1.0"
milestone: v1.7
current_phase: 59
current_phase_name: first of 9 phases, 59–67
status: "Ready to discuss Phase 59. Run mode is interactive per phase (D-25): Chris answers each discuss step, execution runs between; not `/gsd-autonomous`."
stopped_at: Phase 59 context gathered
last_updated: "2026-11-05T21:05:26.676Z"
last_activity: 2026-11-04
state_head: 5f2fc07b4f8d864afae42aa1752ad5864c6347ce
progress:
  total_phases: 9
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
milestone_name: Orca integration
last_activity_desc: Roadmap created; 9 phases (59-67), 39/39 v1 requirements mapped
---

# Project State

## Project Reference

See: .planning/PROJECT.md (shared project file; its "Current Milestone" section is v1.5, not this milestone)
Scope: .planning/workstreams/orca/REQUIREMENTS.md. Owner decisions: .planning/workstreams/orca/DECISIONS.md (D-01..D-29). Roadmap: .planning/workstreams/orca/ROADMAP.md.

**Core value (this milestone):** Theia is the default GUI; Orca's agent workflow runs inside PowerBrowser as real PowerBrowser tabs, with PowerBrowser's own engine and chrome as the agents' browser.
**Current focus:** Phase 59 — Orca from source on Theia's Node

## Current Position

Phase: 59 (first of 9 phases, 59–67) — not started
Plan: none yet
Status: Ready to discuss Phase 59. Run mode is interactive per phase (D-25): Chris answers each discuss step, execution runs between; not `/gsd-autonomous`.
Last activity: 2026-11-04

Progress: [░░░░░░░░░░] 0%

## Phases

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 59 | Orca from source on Theia's Node | RUN-01, RUN-02, OVL-04, EXT-01 | Not started |
| 60 | Spikes for pane hosting, browser parity and live sharing | TAB-03, BRW-01, EXT-03 | Not started |
| 61 | Overlay gate and PowerBrowser-run orcad | OVL-01, OVL-05, RUN-03, RUN-04, RUN-05 | Not started |
| 62 | Theia terminals and agent hooks for Orca | TERM-01, TERM-02, TERM-03, TERM-04, EXT-02 | Not started |
| 63 | Orca panes as PowerBrowser tabs | TAB-01, TAB-02, TAB-04, TAB-06 | Not started |
| 64 | Orca workspace in Theia | TAB-05, TAB-07, TAB-08, TAB-09 | Not started |
| 65 | PowerBrowser web tabs as Orca's browser | BRW-02, BRW-03, BRW-04, BRW-05 | Not started |
| 66 | Hosting hardening | RUN-06, RUN-07, RUN-08, RUN-09, INJ-01 | Not started |
| 67 | Three-OS artifacts, weekly re-pin and upstream seams | OVL-02, OVL-03, OVL-06, PLAT-01, PLAT-02 | Not started |

## Performance Metrics

**Velocity:**

- Total plans completed: 0

*Updated after each plan completion*

## Accumulated Context

### Decisions

Owner decisions are in DECISIONS.md. The ones that shape the phase order:

- D-05: spikes and the tab remake come before the hosting basics finish. The order is: build and probe (59), spikes (60), minimum hosting (61), remake (62-65), hosting hardening (66), then ship and re-pin (67).
- D-04/D-16/D-29, after the adversarial review: an additive overlay. PB-added files come first, then about ten or fewer regenerated seam patches. Whole-file swaps are forbidden.
- D-15: one Orca pane equals one Lumino tab. Orca's in-tab splits and tab groups are flattened, and the renderer owns layout in shipped builds.
- D-14: orcad runs slot-less on Theia's Node 24.19.0, proven by Phase 59's probe. The fallback pin is 1.4.245.
- D-24: live checks pass on Linux only. D-25: the run mode is interactive per phase.

### Pending Todos

None yet.

### Blockers/Concerns

- **Paused 2026-11-05 (Chris): v1.7 waits until v1.5 and v1.6 land on main.** Phase 59 context is committed and planning has not started. To resume, merge main into this branch, re-run `scripts/fetch-upstream.sh` if the ESR pin moved, and run `/gsd-autonomous --ws orca --interactive`. On 2026-11-05, main was 112 commits ahead and had changed `configuration.toml`, `inventory/brand-tokens.json` and `scripts/verify-platform.sh`, all files Phase 59 edits.
- In this worktree `--quick` passes except `fixer-isolate-self-test`, which fails the same way on main (pre-existing; "PATH changed inside the isolation"). Run it inside `nix develop .#theia` after the audited Theia install in `docs/BUILD.md` (`--ignore-scripts`). A plain `yarn install` breaks `diff-theia-core`.
- The EXT-01 outcome (Phase 59) may reshape EXT-02 (Phase 62) before that phase is planned.
- Phase 60's spike results may split or descope Phases 63 and 65. The roadmap must name each chosen route before those phases are planned.
- The macOS half of PLAT-01 (Phase 67) needs a macOS PowerBrowser build, which v1.6 deferred (workstream `deploy`, Phase 55).
- The weekly re-pin (OVL-02) must be dispatched by the release-train clock. D-77 forbids a `schedule:` key, and the clock belongs to v1.6.
- OVL-06 has an open owner question: who opens the upstream pull requests. The GitHub org is moving to `deocracy`, so ask before writing org names.
- OVL-03's live pairing of the stock mobile app needs an Android device. Protocol skew between a newer stock app and the pinned orcad is a recorded risk (D-29).
- Pin lag: the first pin, 1.4.248, was already one release behind (1.4.249) on 2026-11-04. Orca ships about 5 releases a week.

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-11-05T21:05:26.652Z
Stopped at: Phase 59 context gathered
Resume file: .planning/workstreams/orca/phases/59-orca-from-source-on-theia-s-node/59-CONTEXT.md
