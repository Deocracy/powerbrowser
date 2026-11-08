# Phase 59: Carry-forward from v1.5 and v1.6 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-08
**Phase:** 59-carry-forward-from-v1-5-and-v1-6
**Areas discussed:** Owner-step execution model, Plan grouping and order, Residue fix scope, v1.6 close-out and pushes

---

## Owner-step execution model

| Option | Description | Selected |
|--------|-------------|----------|
| Checkpoint per section, Claude verifies | Each plan shows the section's commands in the box, waits for "done", Claude probes and records; no credentials in chat | ✓ |
| You run OWNER-PASS alone, Claude records after | Chris works through OWNER-PASS.md outside the session; recording plans probe afterwards | |
| Claude runs them with your tokens | Scoped tokens handed to Claude; tokens pass through chat and need rotation | |

**User's choice:** Checkpoint per section, Claude verifies.

| Option | Description | Selected |
|--------|-------------|----------|
| Claude drives the browser, you watch and judge | gsd-browser plus the KWin real-input gate; pass/fail asked per item in the box | ✓ |
| You run the checklist alone, report results | Chris ticks the 41 items and pastes fails; verify-work runs afterwards | |
| Fold the checklist into verify-work 29/30/31 | The 41 items become extra UAT rows in the three sessions | |

**User's choice:** Claude drives the browser, you watch and judge.

**Notes:** A question on failure handling was interrupted by an Orca restart; Chris then chose "Next area", accepting the stated default: code reds get an in-phase gap-closure plan, owner reds are re-dated.

---

## Plan grouping and order

| Option | Description | Selected |
|--------|-------------|----------|
| By dependency chain | About 8 plans grouped by chain | |
| One plan per source row, as the note says | About 20 plans | |
| Two plans: Claude work, then owner pass | Least bookkeeping, coarsest resume point | |

**User's choice (free text):** "to be run in as many sessions in orca as fast as possible, and I need an explanation of how to use orca workspaces and orca agents (claude sessions) in parallel as fast as possible."
**Notes:** Explanation given: one Orca child workspace per lane, created from this workspace with `orca worktree create --parent-worktree active --base-branch ServerDestroyer/v1.7-Orca-integration --agent claude --prompt ...`; disjoint file sets; only the coordinating session writes STATE/ROADMAP/ledger; lanes merge one at a time; owner checkpoints, the GUI checklist, the gate and Gecko builds do not parallelize.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, use this cut | 7 plans: 59-01/02/03 lanes, 59-04 owner walk here, 59-05, 59-06, 59-07 | ✓ |
| More lanes: split 59-03 per backlog row | Four code lanes | |
| Fewer lanes: merge 59-01 into 59-02 | Two code lanes | |

**User's choice:** Yes, use this cut. (Asked twice: the first answer was lost in an Orca restart.)

| Option | Description | Selected |
|--------|-------------|----------|
| Date it, leave it out of Phase 59 | WINDOWS.md re-date with an owner date; Linux ships alone | ✓ |
| Inside 59-05, as a checkpoint | VM steps in the plan, re-dated if the ISO or licence is missing | |

**User's choice:** Date it, leave it out of Phase 59.

---

## Residue fix scope

| Option | Description | Selected |
|--------|-------------|----------|
| All 11 rows in 999.28-999.31 | Defects 27, 28; flakes 39, 42, 43; every-run defects 34, 36, 37, 38, 40, 41 fixed in 59-03; 25, 29, 26, 35 re-dated | ✓ |
| Only the six every-run defects (999.31) | 27, 28, 39, 42, 43 stay exclusions | |
| Everything, including 25, 26, 29 and 35 | Adds the deviations, PROMPT-03 and the UAT sheets | |

**User's choice:** All 11 rows in 999.28-999.31.

| Option | Description | Selected |
|--------|-------------|----------|
| One owner date for all, set at 59-07 | One date named when the gate runs; ids and exclusions kept | ✓ |
| Per entry, when it is parked | A date per item at parking time | |
| Target the next v1.7 phase instead of a date | Entries point at Phase 60 | |

**User's choice:** One owner date for all, set at 59-07.

---

## v1.6 close-out and pushes

| Option | Description | Selected |
|--------|-------------|----------|
| Close in 59-07, one push gate at the end | v1.6 closes after owner pass and gate; one push prompt for main, both tags, the v1.7 branch | ✓ |
| Close in 59-07, push per wave | Three push prompts | |
| Close v1.6 now, before the owner pass | Tag v1.6 at the start of Phase 59 | |

**User's choice:** Close in 59-07, one push gate at the end.

---

## Claude's Discretion

- Exact probe per OWNER-PASS section, SUMMARY wording, lane brief text, order of fixes inside 59-03, optional sub-lanes for 59-03.
- Open owner values are collected at the checkpoint that needs them.

## Deferred Ideas

- PROMPT-03 (backlog 999.3, WINDOWS.md 26), deviations WINDOWS.md 25 and 29, UAT sheets (35), Windows VM (CF-10): all re-dated at 59-07.
