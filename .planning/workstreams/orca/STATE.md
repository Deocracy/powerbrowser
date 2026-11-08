---
gsd_state_version: "1.0"
milestone: v1.7
current_phase: 59
current_phase_name: Carry-forward from v1.5 and v1.6
status: Ready to discuss Phase 59 (carry-forward). Run mode is interactive per phase (D-25); `/gsd-autonomous --ws orca --interactive` keeps it.
stopped_at: Phase 59 context gathered
last_updated: "2026-11-08T23:53:39.456Z"
last_activity: 2026-11-08
last_activity_desc: Phase 59 planning complete
state_head: a314db85367222586279b292e8fea0fbaccc5c8d
progress:
  total_phases: 10
  completed_phases: 0
  total_plans: 7
  completed_plans: 0
milestone_name: Orca integration
---

# Project State

## Project Reference

See: .planning/PROJECT.md (shared project file; its "Current Milestone" section is v1.5, not this milestone)
Scope: .planning/workstreams/orca/REQUIREMENTS.md. Owner decisions: .planning/workstreams/orca/DECISIONS.md (D-01..D-29). Roadmap: .planning/workstreams/orca/ROADMAP.md.

**Core value (this milestone):** Theia is the default GUI; Orca's agent workflow runs inside PowerBrowser as real PowerBrowser tabs, with PowerBrowser's own engine and chrome as the agents' browser.
**Current focus:** Phase 59 — Carry-forward from v1.5 and v1.6 (`.planning/CARRY-FORWARD-v1.7.md`)

## Current Position

Phase: 59 (Carry-forward from v1.5 and v1.6) — READY TO EXECUTE
Plan: none yet
Status: Ready to discuss Phase 59 (carry-forward). Run mode is interactive per phase (D-25); `/gsd-autonomous --ws orca --interactive` keeps it.
Last activity: 2026-11-08 — Phase 59 planning complete

Progress: [░░░░░░░░░░] 0%

## Phases

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 59 | Carry-forward from v1.5 and v1.6 | CF-01..CF-19 (`.planning/CARRY-FORWARD-v1.7.md`) | Not started |
| 60 | Orca from source on Theia's Node | RUN-01, RUN-02, OVL-04, EXT-01 | Not started |
| 61 | Spikes for pane hosting, browser parity and live sharing | TAB-03, BRW-01, EXT-03 | Not started |
| 62 | Overlay gate and PowerBrowser-run orcad | OVL-01, OVL-05, RUN-03, RUN-04, RUN-05 | Not started |
| 63 | Theia terminals and agent hooks for Orca | TERM-01, TERM-02, TERM-03, TERM-04, EXT-02 | Not started |
| 64 | Orca panes as PowerBrowser tabs | TAB-01, TAB-02, TAB-04, TAB-06 | Not started |
| 65 | Orca workspace in Theia | TAB-05, TAB-07, TAB-08, TAB-09 | Not started |
| 66 | PowerBrowser web tabs as Orca's browser | BRW-02, BRW-03, BRW-04, BRW-05 | Not started |
| 67 | Hosting hardening | RUN-06, RUN-07, RUN-08, RUN-09, INJ-01 | Not started |
| 68 | Three-OS artifacts, weekly re-pin and upstream seams | OVL-02, OVL-03, OVL-06, PLAT-01, PLAT-02 | Not started |

## Performance Metrics

**Velocity:**

- Total plans completed: 0

*Updated after each plan completion*

## Accumulated Context

### Decisions

Owner decisions are in DECISIONS.md. The ones that shape the phase order:

- D-05: spikes and the tab remake come before the hosting basics finish. The order is: build and probe (60), spikes (61), minimum hosting (62), remake (63-66), hosting hardening (67), then ship and re-pin (68).
- D-04/D-16/D-29, after the adversarial review: an additive overlay. PB-added files come first, then about ten or fewer regenerated seam patches. Whole-file swaps are forbidden.
- D-15: one Orca pane equals one Lumino tab. Orca's in-tab splits and tab groups are flattened, and the renderer owns layout in shipped builds.
- D-14: orcad runs slot-less on Theia's Node 24.19.0, proven by Phase 60's probe. The fallback pin is 1.4.245.
- D-24: live checks pass on Linux only. D-25: the run mode is interactive per phase.

### Pending Todos

None yet.

### Blockers/Concerns

- **Resumed 2026-11-07.** v1.5 is tagged (`v1.5`) and v1.6 is parked with its live items carried forward; main merged into this branch at 0c717487 (no conflicts, ESR pin unchanged at 153.5.1, legal name now "Deocracy Institute"). Chris ruled the carry-forward phase is Phase 59 and the Orca phases moved to 60-68.
- In this worktree `--quick` passes except `fixer-isolate-self-test`, which fails the same way on main (pre-existing; "PATH changed inside the isolation"). Run it inside `nix develop .#theia` after the audited Theia install in `docs/BUILD.md` (`--ignore-scripts`). A plain `yarn install` breaks `diff-theia-core`.
- The EXT-01 outcome (Phase 60) may reshape EXT-02 (Phase 63) before that phase is planned.
- Phase 61's spike results may split or descope Phases 64 and 65. The roadmap must name each chosen route before those phases are planned.
- The macOS half of PLAT-01 (Phase 68) needs a macOS PowerBrowser build, which v1.6 deferred (workstream `deploy`, Phase 55).
- The weekly re-pin (OVL-02) must be dispatched by the release-train clock. D-77 forbids a `schedule:` key, and the clock belongs to v1.6.
- OVL-06 has an open owner question: who opens the upstream pull requests. The GitHub org is moving to `deocracy`, so ask before writing org names.
- OVL-03's live pairing of the stock mobile app needs an Android device. Protocol skew between a newer stock app and the pinned orcad is a recorded risk (D-29).
- Pin lag: the first pin, 1.4.248, was already one release behind (1.4.249) on 2026-11-04. Orca ships about 5 releases a week.

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-11-08T22:31:10.710Z
Stopped at: Phase 59 context gathered
Resume file: .planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-CONTEXT.md
