---
phase: 61-spikes-for-pane-hosting-browser-parity-and-live-sharing
plan: 04
subsystem: spikes
tags: [orca, coordinator, merge, roadmap, manifest, spike-findings, brand-tokens]
status: complete
requires:
  - phase: 61-01
    provides: "spike 004 orca-pane-hosting, VERDICT YELLOW, Route for Phase 64"
  - phase: 61-02
    provides: "spike 005 orca-browser-parity, VERDICT YELLOW, Route for Phase 66; orca-browser-parity rows"
  - phase: 61-03
    provides: "spike 006 orca-live-sharing, VERDICT YELLOW, Route for Phase 63"
provides:
  - "Three lanes merged in order 004, 005, 006 by full ref"
  - "ROADMAP 'Route chosen by Phase 61:' lines under Phases 63, 64 and 66 (criterion 4)"
  - "MANIFEST rows 004-006 and idea headings orca-tabs-as-pb-tabs, orca-browser-parity, orca-live-sharing"
  - "spike-findings skill: references orca-pane-hosting.md, orca-browser-parity.md, orca-live-sharing.md; sources/004-006"
  - "STATE.md Deferred Verification row for Phase 61 (EXT-03 extension half, with EXT-01)"
affects: [63, 64, 66, end-of-milestone pass]
tech-stack:
  added: []
  patterns:
    - "Brand rows re-measured with the scan's own exported matcher (claimOccurrences over scopeFiles), never hand-counted"
key-files:
  created:
    - .claude/skills/spike-findings-Power-Browser/references/orca-pane-hosting.md
    - .claude/skills/spike-findings-Power-Browser/references/orca-browser-parity.md
    - .claude/skills/spike-findings-Power-Browser/references/orca-live-sharing.md
    - .claude/skills/spike-findings-Power-Browser/sources/004-orca-pane-hosting/ (README.md, results.md, measure.mjs)
    - .claude/skills/spike-findings-Power-Browser/sources/005-orca-browser-parity/ (README.md, results.md, provider-proof.mjs)
    - .claude/skills/spike-findings-Power-Browser/sources/006-orca-live-sharing/ (README.md, results.md, floor-run.mjs)
  modified:
    - .claude/skills/spike-findings-Power-Browser/SKILL.md
    - .planning/spikes/MANIFEST.md
    - .planning/spikes/WRAP-UP-SUMMARY.md
    - .planning/spikes/005-orca-browser-parity/README.md
    - .planning/workstreams/orca/ROADMAP.md
    - .planning/workstreams/orca/STATE.md
    - .planning/workstreams/orca/REQUIREMENTS.md
    - inventory/brand-tokens.json
    - scripts/verify-platform.sh (merge resolution only)
key-decisions:
  - "Phase 63 route line states what 63-CONTEXT P63-16 adopted (no live share, no --bg/attach) instead of the 006 README route verbatim, per the coordinating session"
  - "MANIFEST Verdict column carries each README's frontmatter verdict plus the VERDICT-section colour where they differ (005 VALIDATED, 006 PARTIAL; both VERDICT YELLOW)"
  - "The in-word join onOpenLinkInOrcaTab in the 005 source copy gets its own scoped literal row, following installedOrcaPaths and RealOrcaEnv"
requirements-completed: [TAB-03, BRW-01, EXT-03]
duration: about 35 min of coordinator work over 2026-11-10T16:43Z to 17:20Z (four --quick runs of about 8 min each)
completed: 2026-11-10
actuals:
  tasks: 2
  commits: 18
  coordinator_commits: 6
plan_head_before: faf059914a07ce5e4b39630d6781ebcbfca3cea2
plan_head_after: the commit that adds this file
---

# Phase 61 Plan 04: coordinator merges, routes and wrap-up Summary

**The three spike lanes are merged in order (004, 005, 006), the tree is green after each merge
(345 `--quick` rows PASS at the end), ROADMAP Phases 63, 64 and 66 each name the route Phase 61
chose, and the findings load through `spike-findings-Power-Browser`. All three verdicts are
YELLOW, so Task 3 was not reached.**

RED verdicts: none. Task 3 (owner decision per RED spike) was not reached.

## Lanes

| Lane | Worktree | Branch (merged by full ref) | Lane HEAD | SUMMARY commit | Scope check vs its PLAN files_modified |
|---|---|---|---|---|---|
| p61-01 | /home/chris/orca/workspaces/Power-Browser/p61-01 | refs/heads/ServerDestroyer/p61-01 | 204dc4ae | 204dc4ae | 15 paths, 0 outside |
| p61-02 | /home/chris/orca/workspaces/Power-Browser/p61-02 | refs/heads/ServerDestroyer/p61-02 | 7748afc2 | 7748afc2 | 13 paths, 0 outside |
| p61-03 | /home/chris/orca/workspaces/Power-Browser/p61-03 | refs/heads/ServerDestroyer/p61-03 | 0649cfe1 | 0649cfe1 | 6 paths, 0 outside |

The lane list was read from `git worktree list` (the Orca CLI was not used). The scope check
derived each plan's `files_modified` from its frontmatter and compared it with
`git diff --name-only $(git merge-base HEAD <ref>) <ref>`.

**p61-02 coherence (two agents wrote in this lane for a while):** the branch has three commits in
plan order (31a7db10 Task 1, f30e2525 Task 2, 7748afc2 Task 3 with the SUMMARY), no duplicate or
interleaved commits, and a clean worktree. Two oddities, recorded and not changed:
1. 61-02-SUMMARY.md names Task 3's commit as "this commit" and has no `plan_head_after`.
2. The 005 README frontmatter and its Results heading say `VALIDATED`, while its `## VERDICT`
   section and the SUMMARY say YELLOW. The same split is in 006 (`PARTIAL` versus YELLOW). Spike
   004 uses YELLOW in both places. The frontmatter field is the MANIFEST vocabulary
   (VALIDATED/PARTIAL), and the VERDICT section carries the colour, so both are recorded in
   MANIFEST and WRAP-UP-SUMMARY.

## Pre-merge baseline

`nix develop .#theia --command scripts/verify-platform.sh --quick` at faf05991: exit 0,
344 rows PASS, red rows: none.

## Merge commits

| Order | Merge | Lane | Conflicts |
|---|---|---|---|
| 1 | c67ae2cf | p61-01 (spike 004) | none |
| 2 | 939b69e6 | p61-02 (spike 005) | `scripts/verify-platform.sh` (both sides kept: `orca-browser-parity` after `orca-slotless-start`, then the Phase 62 rows) and `inventory/brand-tokens.json` (coordinator side kept, the lane's COUNT MOVED sentences appended to Orca, orca, orcad, counts re-measured) |
| 3 | 13b81e62 | p61-03 (spike 006) | none |

Coordinator commits: 781082d2 (Task 1: 004 wrap-up, Phase 64 route), 8321865b (Task 2: 005 and
006 wrap-up, Phase 66 and 63 routes, STATE row), and the commit that adds this file.

## Verdicts and route lines

| Spike | VERDICT | ROADMAP line |
|---|---|---|
| 004 orca-pane-hosting | YELLOW | Phase 64: Route chosen by Phase 61: Route A, Orca pane components in a Theia ReactWidget on Theia's own React with Orca's stylesheet scoped to the pane root; observation channel useAppStore.subscribe in the Theia document (read-only, close by the store's closeTerminalTab); seam patches 0 of about ten; fallback Route B' (one PB web tab per pane page), which is also the route for browser panes. (spike 004, verdict YELLOW) |
| 005 orca-browser-parity | YELLOW (frontmatter VALIDATED) | Phase 66: Route chosen by Phase 61: S2, a PB runtime client that attaches through browser.clientHost.attach with no Orca patch, building the tier-1 set of 50 abilities (25 BiDi, 9 BiDi+, 14 native, 1 actor for snapshot, exec as a documented subset); S1 (a 13-line provider-kind patch) stays the fallback. (spike 005, verdict YELLOW) |
| 006 orca-live-sharing | YELLOW (frontmatter PARTIAL) | Phase 63: Route chosen by Phase 61: agent sessions are Theia terminals running the plain `claude` CLI, reopened on demand with `claude --resume <session id>` (the P61-07 fallback), with the session id taken from Claude's side (`claude agents --json` or the session file name; `orca terminal list --json` does not expose it); no live share inside the extension and no `--bg`/`claude attach` launch is built, as 63-CONTEXT P63-16 adopted (spike 006, verdict YELLOW) |

The 64 and 66 lines are the README `Route for Phase N:` text verbatim. The 63 line is adapted (see
Deviations 1).

## Checks

| When | Check | Result |
|---|---|---|
| Before merges (faf05991) | `--quick` in `nix develop .#theia` | PASS, 344 rows, 0 red |
| After 004 merge (c67ae2cf) | brand scan; `--quick` | PASS (696 files); PASS, 344 rows |
| After Task 1 commit (781082d2), tracer gate | Task 1 awk + MANIFEST grep; brand scan; `--quick` | ok; PASS (700 files); PASS, 344 rows |
| After 005 merge (939b69e6) | brand scan; `--only orca-browser-parity-self-test`; `--only orca-browser-parity`; `--quick` | PASS (701 files); PASS; PASS, not SKIP: 65 automation, 92 RPC, 83 provider members, 80 CLI specs, 92 rows; PASS, 345 rows |
| After 006 merge (13b81e62) | brand scan | PASS (701 files) |
| Final (8321865b) | Task 2 awk + MANIFEST + STATE greps; `--only orca-browser-parity`; brand scan; `--quick` | ok; PASS; PASS (709 files); PASS, 345 rows, 0 red |
| Final | `grep -c "Route chosen by Phase 61" .planning/workstreams/orca/ROADMAP.md` | 3 (one each under 63, 64, 66) |
| Final | credential grep over `.claude/skills/spike-findings-Power-Browser/` | no match |

The `--quick` count rose from 344 to 345 with the lane's `orca-browser-parity-self-test` row.

## Brand rows moved (inventory/brand-tokens.json)

Every count comes from the scan's own matcher (`claimOccurrences` over `scopeFiles`) on the staged
tree; each moved row carries a COUNT MOVED sentence naming plan 61-04.

| Row | Start | After 004 wrap-up | After p61-02 merge | After 005/006 wrap-up |
|---|---|---|---|---|
| Orca (title) | 313 | 381 | 393 (lane +12) | 497 |
| orca (lower) | 797 | 861 | 907 (lane +46) | 1050 |
| ORCA (upper) | 158 | 165 | 165 | 189 |
| orcad (lower) | 535 | 583 | 591 (lane +8) | 684 |
| Orcad (literal) | 47 | 51 | 51 | 60 |
| onOpenLinkInOrcaTab (literal, new row) | - | - | - | 1 |
| ORCAD and the other Orca-family rows | unchanged | | | |

The lane's increments (+12, +46, +8) equal the lane SUMMARY's own figures (93->105, 420->466,
179->187), measured on a different base.

## Deviations from Plan

1. **[Coordinator instruction] Phase 63 route line is not verbatim.** The 006 README's route keeps
   `--bg` plus `claude attach` "open as an unproven optional investigation". 63-CONTEXT P63-16
   has since adopted "no live share and no `--bg`/`attach` launch is built", and the coordinating
   session asked for the line to state that. The 63 line keeps the README's route and replaces
   the optional-investigation clause with P63-16's ruling.
2. **[Rule 3 - blocking] New literal brand row `onOpenLinkInOrcaTab`.** The 005 README copied
   into the skill quotes Orca's camelCase stub name, an in-word join the boundary matcher
   rejects, so condition 4 went red. Added a scoped coincidental literal row (count 1, one file),
   following `installedOrcaPaths`. No check was weakened.
3. **[Rule 3] `roadmap.update-plan-progress` reverted.** The GSD tool re-flowed the whole
   ROADMAP (blank lines in every phase section), which would have touched sections another
   session is editing. Reverted; the Phase 61 `**Plans**` list and progress-table row were
   written by hand. `requirements.mark-complete` also added one blank line in the Coverage
   block; removed.
4. **`--quick` after the p61-03 merge was folded into the final run.** The lane added only
   `.planning/` paths (outside the scan and every quick row's inputs); the brand scan ran right
   after the merge and `--quick` ran once after the wrap-up commit.
5. **61-04-SUMMARY.md written once at the end** instead of being started in Task 1; its Lanes
   and baseline sections hold the values recorded at the time.
6. **Lane list from `git worktree list`**, not `$ORCA_CLI_COMMAND worktree list --json`
   (inherited Orca variables are kept out of this run).
7. **`state.advance-plan` not run** (STATE position belongs to open Phase 59, per the
   coordinating session). STATE.md was edited only in the Deferred Verification table.
8. **MANIFEST Verdict column** carries `VALIDATED (VERDICT YELLOW)` and `PARTIAL (VERDICT YELLOW)`
   for 005 and 006 (frontmatter value plus VERDICT colour); 004 is `YELLOW` in both places.

## Not done or left as found

- The SKILL.md orca-client-in-pb requirement now carries the D-04/D-16 additive-overlay rule;
  the same "never patched" sentence in `references/orca-client-hosting.md` and in MANIFEST's
  orca-client-in-pb idea was not changed (outside the plan's list).
- No WINDOWS.md ids were named by any lane SUMMARY; nothing to close.
- Lane worktrees and branches are left in place; lane-created symlinks
  `~/.cache/pb-p61-0{1,2,3}-orca` and the floor session `468b096a` (stopped background job,
  `claude rm 468b096a` not run) are untouched, as the lane SUMMARYs list.
- Phase 61 is not marked complete: verification is the next step.

## Self-Check: PASSED

- Files: the three references, nine source copies, SKILL.md rows, MANIFEST rows 004-006, three
  route lines and the STATE row exist (checked by the Task 1 and Task 2 verify commands).
- Commits: c67ae2cf, 781082d2, 939b69e6, 13b81e62 and 8321865b are ancestors of HEAD.
