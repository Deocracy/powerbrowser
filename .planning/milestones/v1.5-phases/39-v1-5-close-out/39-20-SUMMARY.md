---
phase: 39-v1-5-close-out
plan: 20
subsystem: verification
tags: [requirements, roadmap, human-checklist, close-out, owner-rulings]
status: complete
requires: [39-19]
provides:
  - "REQUIREMENTS.md ticks by the stated rule: 41 requirements Complete (9 newly ticked, 13 unticked), traceability in step"
  - "39-HUMAN-CHECKLIST.md: 41 items across phases 27, 31.1 and 32-38, derived from the UAT files, status deferred"
  - "39-20-DECISIONS.md: the 55-row tick table, Chris's three Task 3 rulings, and the re-tick-after-the-checklist list"
  - "ROADMAP progress rows for 27 and 29-38 set to Executed, verification deferred; backlog 999.30 and 999.31 targeted at v1.6"
  - "STATE.md Deferred Verification row for Phase 39"
affects: [v1.5 milestone close, /gsd-verify-work 27 31.1 32-38, v1.6 deploy workstream]
requirements-completed: [EXT-04, EXT-05]
plan_head_before: 075cc719
plan_head_after: 64ab649f  # the last commit before this SUMMARY's own docs commit
actuals:
  tokens: 11000
  tasks: 3
  commits: 3
duration: one session, 2026-11-07
completed: 2026-11-07
---

# Phase 39 Plan 20: Requirement ticks, human checklist and owner rulings Summary

**Requirements and roadmap now match the evidence by one stated rule (41 ticked), the 41 human-only checks are listed in one file, and Chris deferred them all on 2026-11-07, so 12 requirements stay unticked until the checklist is worked and PAGE-05 until backlog 999.19.**

## Accomplishments

- Applied the tick rule to every row of phases 27, 31.1 and 32-38 (55 rows), including rows ticked before phase 39. Nine were newly ticked (EXT-05, BMK-03, BMK-07, TAB-01..TAB-04, TAB-07, TAB-09); thirteen were unticked because a UAT row for them is `[pending]` or `issue`. The full table, with the blocking UAT row or ledger entry per requirement, is in [39-20-DECISIONS.md](39-20-DECISIONS.md) and is not repeated here.
- Wrote [39-HUMAN-CHECKLIST.md](39-HUMAN-CHECKLIST.md) from the `[pending]` rows of the nine UAT files (set equality checked at verify time), plus the portal and cross-application items, the backstop truths, and the not-in-this-pass note for phases 29, 30 and 31.
- Set ROADMAP phase lines 27-38 to `[x]` and progress rows 27 and 29-38 to "Executed, verification deferred". None reads `Complete`, because every phase in the pass still has pending checklist rows.
- Recorded Chris's Task 3 answers (below) in the UAT, DECISIONS, STATE and ROADMAP files.

## Owner rulings (Chris, 2026-11-07, via AskUserQuestion), verbatim

1. Checklist: "Defer: record all as pending, continue".
   Every checklist item stays open; the 28 pending UAT rows stay `[pending]`. A `Status: deferred ...` line is at the top of the checklist. The 12 requirements blocked only by checklist items stay unticked and are listed under "Re-tick after the checklist" in 39-20-DECISIONS.md. STATE.md has a new "Deferred Verification" row for Phase 39.
2. PAGE-05: "Keep unticked until 999.19 (Recommended)".
   Recorded as the `owner:` line of 32-UAT row 8: `Chris 2026-11-07 via AskUserQuestion: Keep unticked until 999.19 (Recommended)`. It supersedes the 2026-11-05 ruling (box 32, "keep PAGE-05 standing and log the packaging follow-up"); 39-20-DECISIONS.md says so.
3. The eight new defects from 39-19 (ledger 34 and 36-41; backlog 999.30 and 999.31): "Carry to v1.6 (Recommended)".
   ROADMAP 999.30 and 999.31 had no target field, so each got one line, `**Target:** v1.6 (Chris 2026-11-07)`. Ledger entries 34 and 36-41 are the rows listed under those two backlog items; entries 39, 42 and 43 sit in 999.30 and 34, 36, 37, 38, 40, 41 in 999.31.

## Milestone close-out state

- Gate: `scripts/verify-platform.sh --gate` is PASS-WITH-EXCLUSIONS at 77e5d037 (456 PASS, 32 excluded, each exclusion keyed to an open ledger entry; 39-BASELINE.md `## Final run`).
- Requirements: 41 ticked (REQUIREMENTS.md), 13 unticked by this plan, PROMPT-03 deliberately open (deferred to 999.3).
- Human checklist: deferred, 41 items; resume with `/gsd-verify-work 27`, `31.1`, `32` through `38`. Phases 29, 30 and 31 were outside this pass and keep their own deferred rows.
- Open WINDOWS.md ledger entries: 11, 19, 24-43.
- Open backlog: 999.17-999.32.
- Targeted at v1.6: 999.30 and 999.31 (Chris's ruling 3). 999.32 (release-artifact, live-owner-state and macOS rows) is already owned by the v1.6 deploy workstream and v1.7.

## Task Commits

1. **Task 1: Requirement ticks and ROADMAP progress** - `429cd590` (docs)
2. **Task 2: Human-only checklist** - `64ab649f` (docs)
3. **Task 3: Owner rulings and this SUMMARY** - the docs commit that carries this file (checkpoint answered, no code)

## Files Created/Modified

- `.planning/phases/39-v1-5-close-out/39-20-SUMMARY.md` - this file
- `.planning/phases/39-v1-5-close-out/39-20-DECISIONS.md` - tick table kept; Task 3 rulings and re-tick list added
- `.planning/phases/39-v1-5-close-out/39-HUMAN-CHECKLIST.md` - created in Task 2; deferred status line added
- `.planning/phases/32-page-tools/32-UAT.md` - row 8 `owner:` line
- `.planning/STATE.md` - one Deferred Verification row (progress fields and `stopped_at` untouched)
- `.planning/ROADMAP.md` - Task 1 progress rows; Target line under 999.30 and 999.31 (progress counts untouched in Task 3)
- `.planning/REQUIREMENTS.md` - Task 1 ticks and traceability

## Decisions Made

- The tick rule matches on behaviour, not only on the literal id, because most UAT rows do not name one (details in DECISIONS).
- `requirements.mark-complete` was not run on the plan's list; the table decides, and only EXT-05 of the plan's ids became newly Complete (EXT-04 was already).
- The `owner:` line of 32-UAT row 8 was replaced, not duplicated; the superseded 2026-11-05 text is quoted in DECISIONS.

## Deviations from Plan

None - plan executed as written. Task 3 was a blocking human-verify; Chris chose to defer rather than work the checklist, which the plan's checkpoint allows, and the consequences are recorded above. The plan's own `<verify>` for Task 1 and 2 are re-run below.

## Verification

- Task 2 verify (the plan's `<automated>` node script, run after Task 3's edits): `checklist complete`, exit 0.
- `node scripts/scan-brand-residue.mjs` after staging: `scan-brand-residue: PASS -- no residual brand occurrence in 678 scanned file(s)`, exit 0.
- `[pending]` result rows across the nine UAT files: 28 (unchanged by the deferral).
- Checklist items (`- [ ]`): 41. Requirement ticks in REQUIREMENTS.md: 41.

## Known Stubs

None.

## Threat Flags

None - documentation and planning files only.

## Self-Check

See the end of the hand-back for the post-commit check (files present, commit ancestry, commit count).
