---
phase: 59-carry-forward-from-v1-5-and-v1-6
plan: 07prep
subsystem: verification-registry, planning-records
tags: [gate-exclusions, redate, d-09, cf-18, orca-lane, prep]
requires:
  - phase: 59-04
    provides: "WINDOWS ids 33, 34, 36-43 closed by the lane merges; the 'later sweep' note for their gate rows"
  - phase: 59-07 (plan)
    provides: "Task 4 re-date tool shape, Task 9 CF-18 record list"
provides:
  - "GATE_KNOWN_OPEN_EXCLUSIONS holds rows only for still-open WINDOWS ids (25, 28, 29, 30, 31, 32, 35)"
  - "scripts/redate-windows.mjs: the D-09 re-date tool with --dry-run and --self-test, through gsd-core's WINDOWS.md parser"
  - "Registry row redate-windows-self-test in the --quick set"
  - "59-07-CF18-RECORDS.md: per-plan paste text for 59-07 Task 9"
affects: [59-07 Tasks 4, 7 and 9, v1.6 close-out]
actuals:
  tokens: 9000
  tasks: 3
  commits: 4
plan_head_before: 69553670
plan_head_after: the commit that adds this file
key-files:
  created:
    - scripts/redate-windows.mjs
    - .planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-07-CF18-RECORDS.md
    - .planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-07prep-SUMMARY.md
  modified:
    - scripts/verify-platform.sh
key-decisions:
  - "The re-date tool lives at scripts/redate-windows.mjs (lane brief), not at the phase-directory path 59-07-PLAN.md names; 59-07 Task 4 and Task 7 should call this path"
  - "Re-date means a reason prefix 'Re-dated to <date> (Phase 59 D-09)'; a second re-date replaces the prefix instead of stacking"
  - "A fixed, waived or unknown id is refused before anything is written; the real WINDOWS.md was not re-dated"
requirements-completed: []
duration: ~1h
completed: 2026-11-09
status: partial
---

# Phase 59 Plan 07prep: Claude-only preparation for 59-07 Summary

**The gate exclusion list no longer carries rows for closed WINDOWS entries, the D-09 re-date
mechanism exists with a registered self-test and is proven on a copy of WINDOWS.md, and the CF-18
record text for the six unexecuted v1.6 owner plans is written for 59-07 Task 9 to paste. The
real re-date did not run; the date comes from Chris at 59-07.**

## Tasks

| # | Task | Commit | Outcome |
|---|------|--------|---------|
| 1 | Remove `GATE_KNOWN_OPEN_EXCLUSIONS` rows keyed to fixed ids | e2b767e6 | 11 rows removed (ids 33, 34, 36, 37, 38, 39, 40 x2, 41, 42, 43); 24 rows remain for ids 25, 28, 29, 30, 31, 32, 35; comment block updated |
| 2 | `scripts/redate-windows.mjs` and its registry row | 7944af68 | self-test 14 of 14 PASS; dry run and real run proven on a copy; `gsd-tools windows status` parses the result |
| 3 | `59-07-CF18-RECORDS.md` | ee7313dc | six plan sections, each "Recorded by Phase 59 so far" and "Waits on the owner log" |
| 4 | This SUMMARY | the commit that adds this file | |

## Task 1: exclusion rows

- `.planning/WINDOWS.md` state read first: 33, 34, 36, 37, 38, 39, 40, 41, 42, 43 are `fixed`;
  35 is `open` and its row stays. Open count 12 of 43.
- `bash -n scripts/verify-platform.sh` clean.
- No `verify-platform-self-test` row exists, so the proof was `--quick`. This lane has no
  `upstream/`, no `generated/` and no Theia install (D-07), so `--quick` is red here for
  environment reasons (119 FAIL, 214 PASS, 330 rows; every FAIL names a missing `upstream/` or a
  dependent artefact). To show the edit changed nothing, HEAD's script was run from a temp copy
  in the same environment: the sorted PASS/FAIL set is identical, 330 rows. The edit touches only
  the array `--gate` reads; `--gate` itself needs the full tree and runs in 59-07 Task 5.

## Task 2: the re-date tool

`node scripts/redate-windows.mjs --date YYYY-MM-DD [--file <project>/.planning/WINDOWS.md] [--dry-run] <id>...`

- Loads `broken-windows.cjs` from the gsd-core install with `createRequire` (override with
  `GSD_BROKEN_WINDOWS`), `parseLedger` then `renderLedger` under `withLedgerLock`, writes through
  a temp file and rename. The gsd-core round trip is byte-identical on the current WINDOWS.md
  (checked before writing the tool), so a run changes only the named reasons and `last_updated`.
- Each named entry must exist and be `open`; otherwise the run fails naming the id and writes
  nothing. Status, id and the gate row are untouched; a post-render re-parse asserts counts and
  statuses before the file is replaced.
- `--self-test` copies WINDOWS.md into a temp project, derives the open and non-open ids from the
  copy, and checks 14 points: the dry run writes nothing; a non-open id, an unknown id and a
  malformed date are refused with nothing written; the real run keeps counts, keeps the named
  entries open with only `reason` changed, leaves every other entry identical, moves
  `last_updated`; a second re-date replaces the prefix; the real WINDOWS.md is untouched.
- Registered as `redate-windows-self-test` directly after `scan-brand-residue-self-test` in the
  `--quick` set; `scripts/verify-platform.sh --only redate-windows-self-test` PASS.
- Proof on a copy (scratch dir, 2026-11-09): `--dry-run --date 2099-01-01 25 26` printed both
  planned reasons and `cmp` showed the copy unchanged; `gsd-tools windows status --cwd <copy>`
  reported open 12; the real run on the copy wrote `Re-dated to 2099-01-01 (Phase 59 D-09)` on 25
  and 26, status open, and `gsd-tools windows status` parsed it (ok true, open 12, total 43);
  `--date 2099-01-01 33` on the copy failed with `status is "fixed"`, exit 1.
  `git diff --quiet -- .planning/WINDOWS.md` held throughout.
- Brand scan with both files staged: PASS, 681 files.

## Task 3: CF-18 record text

`59-07-CF18-RECORDS.md` covers 41-04, 44-01, 47-04, 50-04, 52-05 and 57-04. Sources: the 59-01,
59-02 and 59-04 SUMMARYs (through the 59-08 and 59-09 merge records), 59-05-PLAN.md, the six
deploy PLAN.md files, the 41-04, 47-04 and 57-08 SUMMARYs, CARRY-FORWARD section 4, RENEWALS and
RELEASING, and `59-OWNER-LOG.md` at 520bd36e on `ServerDestroyer/p59-owner` (one entry, §3e
`GH_PAT`). Secret names only. The scan's residue probes were not applied to `.planning/`; the
file was checked directly for the originating-product form with zero hits.

## Deviations from the brief

- The brief asked for a proof with `gsd-tools windows list`; that subcommand does not exist
  (`status, append, waive, fixed`). `windows status --cwd <copy>` was used; it runs the same
  parser.
- 59-07-PLAN.md names the tool `redate-windows.cjs` in the phase directory. The brief's path
  `scripts/redate-windows.mjs` was used. 59-07 Tasks 4 and 7 should use this path.
- `--quick` is not green in this lane for environment reasons (above); the proof is the
  identical PASS/FAIL set against HEAD's script.

## Not done, by design

- The real re-date of WINDOWS.md (59-07 Task 7, after Chris names the date in Task 6).
- The deploy SUMMARY edits themselves (59-07 Task 9 pastes from the record file).
- STATE.md, ROADMAP.md, `.planning/WINDOWS.md` and the ledger directory are unchanged. Nothing
  was pushed.

## Merge note for the coordinator

Four commits on `ServerDestroyer/p59-07prep`, explicit paths: e2b767e6 (registry rows),
7944af68 (tool and registry row), ee7313dc (record text), and this file. The
`scripts/verify-platform.sh` edits are in the exclusion array and one new `CHECKS` row after
`scan-brand-residue-self-test`; both regions are ones 59-04's merges did not touch after
69553670. After merging, run `--quick` in the coordinating tree (330 rows plus
`redate-windows-self-test`, 331).
