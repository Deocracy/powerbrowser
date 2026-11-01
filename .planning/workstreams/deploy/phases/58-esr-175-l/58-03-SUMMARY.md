---
phase: 58-esr-175-l
plan: 03
subsystem: infra
status: partial
tags: [esr-175, dual-build, disk-budget, ups-03, measurement-table, doc-gate, owner-checkpoint]

requires:
  - phase: 58-esr-175-l
    plan: 02
    provides: the 175 rebase block in docs/RELEASING.md and the toolchain re-record rule the table's tuple cites
provides:
  - docs/BUILD.md "Dual-build window (UPS-03)": table shell with two empty data rows (153 live, 175 in objdir-175), pre-flight and no-clobber rules
  - scripts/verify-dual-build-table.mjs plus registry rows dual-build-table and dual-build-table-self-test
affects: [58-03 Tasks 2 to 4 (owner measurement, table fill, ship checklist, ship record)]

actuals:
  tokens: 3647     # chars/4 over the realized diff (14587 chars, base a5f93b41 to dafa897f)
  tasks: 1         # of 4; Task 1 only, Tasks 2 and 3 not executed by instruction, Task 4 owner-gated
  commits: 1       # MEASURED before this summary commit: git rev-list --count a5f93b41..HEAD

plan_head_before: a5f93b418e0632bbdb044f9341588594232facf6
plan_head_after: dafa897f

requirements: [UPS-01, UPS-03]   # neither is met by Task 1; neither is marked complete
---

# Phase 58 Plan 03: Dual-build table shape and pre-flight (Task 1 only) Summary

The UPS-03 table shell and a shape gate that derives its columns from the table itself are in; the pre-flight recorder ran on the live 153 line; no measurement, no 175 build and no ship record exist yet, and none is invented.

## Status

| Task | Name | State | Commit |
|---|---|---|---|
| 1 | UPS-03 table shape plus pre-flight on the live 153 line | done | dafa897f |
| 2 | Owner runs the dual-objdir measurement on legion, or records the hosted spill | NOT EXECUTED (owner checkpoint, blocking-human) | n/a |
| 3 | Record the owner's measurement, fill the table, write the Ship 175 checklist | NOT EXECUTED (depends on the Task 2 reply) | n/a |
| 4 | Owner ships 175.x before 153.27 | NOT EXECUTED (owner checkpoint, blocking-human) | n/a |

Plan-level truths UPS-01 criterion 3 and UPS-03 criterion 4 are therefore open. `docs/RELEASING.md` is untouched, so the `### Ship 175 (UPS-01)` heading does not exist yet (Task 3).

## What Task 1 delivered

- `docs/BUILD.md`: `### Dual-build window (UPS-03)`, placed before "Crash symbols per target". Columns `line | objdir | du before | du after | df before | df after | mach wall time | D-73 tuple | verdict`. Two data rows, `153 line (live)` on `objdir/` and `175 line (objdir-175)` on `objdir-175/`, every measurement cell empty. The prose gives the pre-flight command (more than 30 GB free), the `POWERBROWSER_OBJDIR=objdir-175` build command, the never-clobber rule, the fill-completely-or-not-at-all rule and the hosted-spill verdict form.
- `scripts/verify-dual-build-table.mjs`, registered as `dual-build-table` and `dual-build-table-self-test`. Nothing is hand-kept: the tuple and verdict columns are found in the table header, the identity columns are the first two, everything else is a measurement column. An empty row is green (honest "not measured yet"). A filled row needs a 40-hex tree commit, a `toolchain-baseline` cite, an ISO date and a verdict; unless the verdict is `spills to hosted`, every measurement cell must be filled; a spill verdict needs the INF-04 link. At least two rows, one on `objdir-175`, and no two rows may share an objdir.
- Self-test: 12 planted faults (heading removed, tuple column removed, verdict column removed, objdir-175 row missing, single row, live objdir reused, no tree commit, no baseline cite, no date, no verdict, half-filled row, spill without link), each required to go red naming the cause, plus 4 clean controls (empty shell, both filled, one filled, hosted spill). Failure text names the next step and carries no pref key, sentinel or dotted identifier.

Limits, stated plainly: the gate checks shape only and cannot tell a real number from an invented one (that stays the verbatim-copy rule in Task 3). It does not check that the tuple names a host, and does not check that the tree commit exists in this clone (the owner's measured tree may be a branch head not yet merged).

## Pre-flight record (live 153 line, no build run)

Taken 2026-11-01T05:40:31Z on host `legion`, in the `deploy-w2-58-03` worktree (branch `deploy/w2-58-03`). In this worktree `upstream/` is a symlink to the main deploy worktree's checkout and there is no objdir of its own, so the live objdir was read with `du` (read only) at the main deploy worktree path.

```
$ df -h .
Filesystem      Size  Used Avail Use% Mounted on
/dev/dm-0       1.9T  1.5T  418G  78% /home

$ du -sh upstream/ objdir*          # in the worktree
5.6G	upstream/
du: cannot access 'objdir*': No such file or directory

$ du -sh /home/chris/gsd-workspaces/deploy/Power-Browser/objdir*     # live 153 objdir, read only
13G	/home/chris/gsd-workspaces/deploy/Power-Browser/objdir

$ git rev-parse HEAD                # before the Task 1 commit
a5f93b418e0632bbdb044f9341588594232facf6

$ grep -v '^#' toolchain-baseline.txt
clang UNMEASURED
rustc 1.97.1
cargo 1.97.0
cbindgen 0.29.4
sysroot UNMEASURED
sysroot-glibcxx UNMEASURED
image pb-gecko-build UNMEASURED
```

Reading for the owner: 418G free on `/home` is far above the 30 GB pre-flight floor, and the live 153 `objdir/` is 13G, so the first-order fit looks comfortable, but this is a pre-window baseline and not the UPS-03 measurement (no 175 objdir exists). The baseline file still carries `UNMEASURED` lines (clang, sysroot, sysroot-glibcxx, image); that is the existing Phase 45 state and is why the tuple's toolchain cite cannot yet be a measured container value. No `gh api` read was needed for Task 1.

## Gate results from this worktree

`scripts/verify-platform.sh --quick` after the Task 1 changes: 423 PASS lines, and exactly six reds, all known worktree-environment reds:

- `single-copy-deps` and `ng086-theia-react-node`: `theia/node_modules` is absent in the worktree (a symlinked, uninstalled tree proves nothing).
- `gui07-strip-spike-verdict` and `gui07-strip-spike-verdict-self-test`.
- `gui09-dependent-window-content` and `gui09-dependent-window-content-self-test`.

These are not plan regressions; the authoritative green run is on the merged head in the main deploy worktree. The new `dual-build-table` and `dual-build-table-self-test` rows are green, and `scan-brand-residue` (with the new file staged) is green. Plan verify for Task 1 (`grep` of the heading and `objdir-175`, `df -h`, `du -sh upstream/`, then `--quick`) ran as above.

## Deviations from Plan

None to the plan's tasks. Notes on how the plan's optional branch was taken: the plan allowed either a doc-grep row or "shape proven by review, no row"; a row was added because the shape is derivable from the table header, with a self-test as the plan requires.

Commit safety: the branch `deploy/w2-58-03` is not in the `agent-*` namespace the generic pre-commit allow-list expects; it is the branch this task was explicitly run on, and it is not a protected/default branch, so the commit proceeded.

## Owner steps still open

Task 2 (legion hardware, about 40 to 60 minutes per build, run at or after the 175 beta when a real 175 tree exists), at the worktree root:

1. Pre-flight: `df -h; du -sh upstream/ objdir*` (more than 30 GB free; record both).
2. Keep the live 153 `objdir/` untouched. First 175 build: `POWERBROWSER_OBJDIR=objdir-175 MOZCONFIG=../.mozconfig ./mach build` (record the mach wall time). Never `clobber` or reuse the live objdir.
3. Post: `df -h; du -sh upstream/ objdir*` (record both).
4. Fill both table rows plus the tuple (tree HEAD, `legion`, a cite of `toolchain-baseline.txt`, date). If `legion` cannot hold both objdirs, do not force it: reply `spills to hosted` with the INF-04 evidence link (Phase 49).
5. Reply with: (1) the filled rows or the spill verdict with link; (2) the D-73 tuple; (3) `objdir-153 untouched: yes` or the difference.

Task 3 then copies that reply verbatim into the table, runs the row and its self-test, appends `### Ship 175 (UPS-01)` to `docs/RELEASING.md` (rebase green at the tag, baseline re-recorded, same `release.yml` with the 175 merge SHA, `release` approval, the owner's own N-1 to N hop, `descriptor` approval, per-target descriptors committed, `channel-live` green, DONE; 175.x before 153.27 on 2027-09-07; immutable releases hold) and quotes the owner's reply here.

Task 4: per 175 release, the owner replies with the release key, descriptor commit, both approval dates and the `channel-live` line verbatim. Ship record: pending (no 175 release exists; ship must reach DONE before 2027-09-07).

## Self-Check: PASSED

- FOUND: docs/BUILD.md (section present), scripts/verify-dual-build-table.mjs, scripts/verify-platform.sh (two rows)
- FOUND: commit dafa897f (ancestor of HEAD)
- `node scripts/verify-dual-build-table.mjs` PASS; `--self-test` PASS (12 faults, 4 controls)
