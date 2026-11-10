---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
plan: 06
subsystem: coordination
status: in-progress
tags: [merge, coordinator, brand-rows, licence, re-pin, live]
requires: ["68-01", "68-02", "68-03", "68-04", "68-07", "68-09", "68-10"]
provides: ["wave-1 lanes on ServerDestroyer/v1.7-Orca-integration", "identity re-pin PASS on the merged tree", "WINDOWS.md entry 44"]
affects: [scripts/verify-platform.sh, inventory/brand-tokens.json, inventory/licence-allowlist.json, orca-overlay/seams.json, .planning/WINDOWS.md]
key-files:
  created:
    - .planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-06-SUMMARY.md
  modified:
    - scripts/verify-platform.sh
    - inventory/brand-tokens.json
    - inventory/licence-allowlist.json
    - orca-overlay/seams.json
    - .planning/WINDOWS.md
    - THIRD-PARTY-NOTICES.txt
    - scripts/verify-macos-package-payload.mjs
    - scripts/rebase-orca.sh
    - scripts/verify-orca-mobile-protocol.mjs
decisions:
  - "P68-37: wave 1 (lanes 03, 04, 01, 10, 07, 09, 02) merged into v1.7 on 2026-11-10; 08 and 05 remain coordinator-launched"
  - "p68-10 merged despite its BLOCKER line, by the coordinator's instruction, with the lane's one-line rule-8 fix as fix(68-06)"
  - "The re-pin replay's pnpm run carries --config.verify-deps-before-run=false so it never re-installs orca/node_modules outside build-orca.sh's knobs"
  - "Open owner licence items (68-B, the 68-A terms check, the uBlock Origin GPL-3.0 s6 reading) are WINDOWS.md entry 44; the release guard stays closed"
plan_head_before: b37ad5b17fe84ae995970b1c0126fdd6dcfedc87
plan_head_task1_last_code: 7e31d172
metrics:
  completed: 2026-11-10
  tasks_done: "Task 1 without step 3b (1 of 3 tasks, partial)"
---

# Phase 68 Plan 06: Coordinator Summary (Task 1 of 3, in progress)

Task 1's wave-1 half is done. All seven wave-1 lanes are merged by full ref in the plan order. The
identity re-pin replays every stage on the merged tree. Orca-family brand rows were re-measured, and
the open owner licence items are recorded as WINDOWS.md entry 44 with their exclusion rows. The
three live rows the lanes could not run all pass, and `--quick` is green (365 PASS, 0 FAIL).

**Pending.** Task 1 step (3b), launching and merging lane p68-08, was not run: the caller excluded it
for this session. Tasks 2 and 3 wait for Phase 67. Lane p68-05 was not launched.

## Lanes

| Lane | Worktree | Branch (merged by full ref) | Tip |
|------|----------|-----------------------------|-----|
| p68-03 | /home/chris/orca/workspaces/Power-Browser/p68-03 | refs/heads/ServerDestroyer/p68-03 | e88e9854 |
| p68-04 | /home/chris/orca/workspaces/Power-Browser/p68-04 | refs/heads/ServerDestroyer/p68-04 | 8f24c7bc |
| p68-01 | /home/chris/orca/workspaces/Power-Browser/p68-01 | refs/heads/ServerDestroyer/p68-01 | 9f0ced7f |
| p68-10 | /home/chris/orca/workspaces/Power-Browser/p68-10 | refs/heads/ServerDestroyer/p68-10 | e4949db1 |
| p68-07 | /home/chris/orca/workspaces/Power-Browser/p68-07 | refs/heads/ServerDestroyer/p68-07 | 014398e4 |
| p68-09 | /home/chris/orca/workspaces/Power-Browser/p68-09 | refs/heads/ServerDestroyer/p68-09 | 6a61d70a |
| p68-02 | /home/chris/orca/workspaces/Power-Browser/p68-02 | refs/heads/ServerDestroyer/p68-02 | 9a553b88 |
| p68-08 | not launched (excluded this session) | — | — |
| p68-05 | not launched (Task 2, after Phase 67) | — | — |

## Pre-merge baseline

`nix develop .#theia --command scripts/verify-platform.sh --quick` was run on b37ad5b1 before the
first merge. Result: **351 PASS, 0 FAIL, 0 SKIP**, `verify-platform: PASS -- all checks passed`. The
red-row list is empty, so any red after a merge counts as new. Log:
.mozbuild/p68-06/baseline-quick.log.

## Merges and scope checks

Each lane passed two checks before its merge. The scope check compared
`git diff --name-only $(git merge-base HEAD BRANCH) BRANCH` against the lane plan's
`files_modified`, read from the frontmatter on the lane branch. The BLOCKER check grepped the lane
SUMMARY for a line that starts `BLOCKER:`.

| Order | Merge commit | Lane | Changed paths | Outside files_modified | Conflicts and resolution | Rows after merge |
|-------|--------------|------|---------------|------------------------|--------------------------|------------------|
| 1 | d5d2a605 | p68-03 | 6 | none | None. Its registry blocks were moved after the 63-06 and 63-03 blocks (rule 2) | orca-mobile-protocol, -self-test, orca-mobile-skew-self-test, orca-seam-export-self-test, orca-overlay, -self-test: PASS |
| 2 | 2efd5ded | p68-04 | 8 | none | verify-platform.sh at the full anchor: union, with 68-04 after 68-03 | licensing, -self-test, licence-allowlist-self-test: PASS; licence-allowlist red by design (5b, below) |
| 3 | 93457ca9 | p68-01 | 15 | none (accepted: 5edf17c3 also carries its Task 3 files, all inside files_modified) | verify-platform.sh at both anchors: union, with 68-01 after 68-04 and byte-identical to the lane's lines. release.yml merged without conflict | orca-packaged-tree-self-test, orca-macos-merge-self-test, build-orca-portable-self-test, orca-packaged-live-self-test, package-target-natives-self-test, release-shape, -self-test, win-sign-chain-self-test, workflows, flathub-manifest, -self-test: PASS |
| 4 | 8f770d0f (+ fix 15713704) | p68-10 | 8 | none | None. release.yml auto-merged and matches rule 2c's job ownership. The SUMMARY's BLOCKER line was resolved by fix(68-06) (below) | macos-package-payload-self-test (with the fix), build-windows-shape, -self-test, win-sign-list-self-test, win-sign-chain-self-test, win-sidecar-check-self-test, release-shape, -self-test, workflows, orca-service, -self-test, internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines, shell-error-copy-no-internals, start-path-recovery: PASS; `bash -n package-windows.sh` ok |
| 5 | e49a8693 | p68-07 | 12 | scripts/verify-orca-agent-hooks.mjs (accepted: `claudeAgentSdkDir: ''` for a third buildOrcadEnv caller) | seams.json, rule 4 (below). verify-platform.sh auto-merged; its blocks were reordered after 68-01. OrcaService.sys.mjs auto-merged (disjoint `_resolve` and `_spawnAndGate` hunks) | build-orca PASS; `generate-licensing.mjs --write-orca` dropped the SDK from the Orca notices (THIRD-PARTY-NOTICES.txt -5 lines). orca-claude-sdk, -self-test, orca-claude-sdk-built, orca-overlay, -self-test, orca-service, -self-test, orca-hidden-electron-self-test, orca-service-live-self-test, internals-boundary, orca-agent-hooks-self-test, licensing: PASS. licence-allowlist still red by design (5b) |
| 6 | 2074609e | p68-09 | 14 | theia/package.json (accepted: build:extensions entry for bundled-extensions) | verify-platform.sh auto-merged; its blocks were reordered after 68-07 | Audited Theia install plus yarn build (`powerbrowser.claude-agent-sdk (bundled) assembled`). bundled-extensions, -seed, -self-test, generate-check, licence-allowlist: PASS (5b closed) |
| 7 | b2204949 | p68-02 | 11 | none | verify-platform.sh at the quick anchor: union, with 68-02 after 68-09 | rebase-orca-self-test, verify-upstream-pins, -self-test, release-train-logic-self-test, detect-upstreams-self-test, orca-slotless-start-self-test, sweep-reads, workflows, -self-test: PASS |

Every merge was made with `git merge --no-ff --no-commit refs/heads/ServerDestroyer/p68-0N`. Lanes
insert their blocks directly after the anchor row, so the registry was put into rule-2 order before
each commit. At the quick anchor the order is 63-06, 63-03, then 68-03, 68-01, 68-07, 68-09 and
68-02. At the full anchor it is 63-03, then 68-03, 68-04, 68-01, 68-07 and 68-09. Each lane's added
lines were checked byte-identical against the lane diff, and no other line changed: every reorder
kept the same line multiset. 68-04's quick-tier change is a comment beside the existing
licence-allowlist row and stays there. No conflict occurred outside verify-platform.sh and
seams.json, and Phase 64 is not on the branch, so rule 2d did not apply.

**seams.json (rule 4).** p68-07's rows 070 (`src/main/claude/claude-stream-json-connection.ts`) and
080 (`config/scripts/orcad-entry-build.mjs`) took `"upstream": {"class": "pb-only", "pr": null}`
(P68-38). Row 010 keeps p68-03's `browser-provider`.

**Expected licence-allowlist reds (rule 5b).** After the p68-04 merge, licence-allowlist printed
exactly these two lines:
```
licence-allowlist: FAIL -- @anthropic-ai/claude-agent-sdk: ruled extension (68-A) but still ships in orcad
licence-allowlist: FAIL -- extension folder bundled-extensions/claude-agent-sdk absent or not carrying @anthropic-ai/claude-agent-sdk at an exact version in its package.json dependencies (68-A)
```
After p68-07 and the orca/ rebuild, only the second line remained. After p68-09 the row passed.

## fix(68-06) commits (rule 5)

1. **15713704**, scripts/verify-macos-package-payload.mjs: the p68-10 BLOCKER. Failing: `macos-package-payload-self-test` (quick). Rule 8 derived the Windows-only `${appDir}/node/node.exe` candidate (P68-32) as a path the macOS bundle must contain. The fix is the lane's one line: `.filter(p => !p.endsWith(".exe"))`, with a why-comment. The file was checked against the ledger's `check_locks` first and is not locked.
2. **554c66d7**, scripts/rebase-orca.sh (p68-02). The first identity re-pin stopped with:
   `rebase-orca: FAIL -- row licence-allowlist exited 1` and
   `licence-allowlist: FAIL -- licence text changed for khroma@2.1.0: license line 1 is null, the row records "The MIT License (MIT)"`.
   Root cause: `orca_pnpm_run` ran `corepack pnpm run typecheck:web`. pnpm 12's default
   verify-deps-before-run then re-installed without build-orca.sh's knobs (`--store-dir`,
   `ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0`, `--ignore-scripts`). That relinked orca/node_modules into
   ~/.local/share/pnpm's global virtual store and ran the native packages' lifecycle scripts. The
   shipped-set cache's package `dir`s, keyed on orca HEAD, the overlay and the lockfiles, then
   pointed at paths that no longer existed. A control proved the cause: `pnpm run <missing>` without
   the flag relinks khroma into ~/.local/share/pnpm, and with `--config.verify-deps-before-run=false`
   it does not. The layout was restored with build-orca.sh.
3. **7e31d172**, scripts/verify-orca-mobile-protocol.mjs (p68-03). The first final `--quick` failed:
   `orca-pin: FAIL -- scripts/verify-orca-mobile-protocol.mjs carries the pinned Orca tag or commit as a literal; configuration.toml is the one carrier.`
   orca-pin-self-test then reported `the unmutated tree is already red`. The literal was the tag in a
   header comment, and the comment now describes the pin without its value.

## Step (4): generate, rebuild, notices

- `nix develop .#theia --command node scripts/generate.mjs`: PASS, 72 files.
- `nix develop .#orca --command bash scripts/build-orca.sh` on the merged overlay (ORCA_* unset): PASS, v1.4.248 (965978bc78).
- `node scripts/generate-licensing.mjs --check-orca`: PASS, 1272 packages in 443 licence groups.

## Brand rows (rule 3)

Measured with scan-brand-residue.mjs's own exports (`scan`, `scopeFiles`, `claimOccurrences`) on the
staged merged tree. Each Orca-family row's `only_in` was widened to the whole scope, and observed
counts and files were written back. Every added file is in the diff b37ad5b1..HEAD, and no file was
dropped. No exclude entry was added. `node scripts/scan-brand-residue.mjs` exits 0, and so does its
`--self-test`. Report: .mozbuild/p68-06/brand-report.md.

| Row | Count | Files | Files added |
|-----|-------|-------|-------------|
| Orca (title) | 637 -> 1064 | 55 -> 88 | 33 (workflows, LICENSING.md, THIRD-PARTY-NOTICES.txt, docs/RELEASING.md, the 3 package scripts, the bundled extension, 22 scripts) |
| orca (lower) | 1287 -> 2667 | 55 -> 84 | 29. The count is 2662 after the merges, plus 5 from the 68-06 exclusion rows and the rebase-orca.sh fix comment |
| ORCA (upper) | 294 -> 441 | 37 -> 57 | 20 |
| orcad (lower) | 783 -> 1104 | 45 -> 66 | 21 |
| ORCAD (upper) | 107 -> 180 | 10 -> 18 | 8 |
| Orcad (literal) | 70 -> 93 | 14 -> 17 | 3 |
| \norca_ (literal) | 2 -> 4 | 1 -> 2 | scripts/rebase-orca.sh |

Under the 60-04 literal-row rule, 15 new coincidental literal rows cover camelCase joins that the
boundary matcher rejects: selectOrca (4), renderOrcaSection (5), compareOrcaSets (6),
replaceOrcaSection (2), deriveOrca (3), `runOrca(` (4), withOrca (10), repoOrca (3), orcadskip (3),
orcads (4), noOrcaCopy (2), hookOrcaResolution (3), hostedOrca (2), makeOrca (6), okOrca (4).
`runOrca(` keeps its parenthesis. As a bare `runOrca` row it took 3 claims from the existing
`runOrcad` helper in verify-orca-hidden-electron.mjs, which belong to the Orcad row; that version was
measured, rejected and redone.

## Identity re-pin

`flock /home/chris/coding/Power-Browser/.git/pb-live.lock nix develop .#orca --command bash scripts/rebase-orca.sh --tag v1.4.248 --commit 965978bc78bf03a6a43187c1ed28fcffe0e01bb5`,
run with ORCA_* unset and PB_LIVE_LOCK_HELD=1 (log .mozbuild/p68-06/identity-repin.log, 1m10s):

```
rebase-orca: pin-move / fetch / seam-apply (3 seams) / build / typecheck:web / typecheck:node /
typecheck coverage (0 overlay files at this pin, vacuous; the self-test proves the stage) /
row orca-build-shape / row orca-overlay / row orca-overlay-built / row orca-mobile-protocol /
row licence-allowlist / row orca-mobile-skew / orcad-only start / notices (unchanged) / brand scan
rebase-orca: PASS -- v1.4.248 (965978bc78) replayed: 3 seam(s) regenerated, typecheck clean, 6 rows green
```
`git status --porcelain --untracked-files=no` was empty afterwards. The first run, which stopped at
row licence-allowlist, is kept at .mozbuild/p68-06/identity-repin-1-stopped.log (fix 2 above).

## Open owner licence items (step 7)

- WINDOWS.md entry **44** (kind deviation, file inventory/licence-allowlist.json) was appended with gsd-tools `windows append`. It records ruling 68-B, the 68-A terms check (D-30) and the GPL-3.0 section 6 reading for uBlock Origin (P68-39).
- `inventory/licence-allowlist.json` `package_rulings[0].windows_id` = 44.
- GATE_KNOWN_OPEN_EXCLUSIONS gained, under a `# 68-06 (2026-11-10)` comment: `orca-licence-rulings|44|...`, `orca-packaged-tree|30|...` and `orca-packaged-live|30|...`.
- The `node scripts/verify-licence-allowlist.mjs` PENDING lines:
```
PENDING RULING -- allowed_package_spdx (68-B): 1271 packages pass by the proposed set, 1 exception rows
PENDING OWNER CHECK -- Anthropic's terms permit redistributing @anthropic-ai/claude-agent-sdk in the pre-installed extension (68-A, D-30)
```
- `orca-licence-rulings` (full tier) is red by design while entry 44 is open. `verify-licence-allowlist.mjs --rulings` exits 1 with the same two PENDING lines.

## Live and full rows the lanes could not run

All were run one at a time under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with
ORCA_* unset and PB_LIVE_LOCK_HELD=1. Before them, `./mach build faster` ran in
`nix develop .#firefox` (24 s; upstream/ diff empty), and the objdir's OrcaService, OrcaEnv and
TheiaService sys.mjs were byte-identical to the tree. The live scripts set MOZ_PURGE_CACHES=1. The
audited Theia install and yarn build came from the p68-09 merge.

- orca-service-live: **PASS**. 19 environment names equal the expected set (planted ORCA_PLANT_62 absent), the data root resolved through the alias, ws on 127.0.0.1, Node 24.19.0 shared with the Theia backend; quit ended a 5-process tree including an agent session; the SIGKILLed launch's orcad was replaced on the same port.
- orca-hidden-electron: **PASS**. Stock orcad launched the decoy, and with the switch set it did not within 10000 ms.
- bundled-extensions-live: **PASS**. `Theia deploys each bundled extension as a user plugin, never a built-in, and an uninstall is not undone`.
- orca-agent-hooks (full; exercises p68-07's `claudeAgentSdkDir: ''` deviation): **PASS**.
- orca-claude-sdk-built: **PASS** (after the rebuild).

## Final --quick

`nix develop .#theia --command scripts/verify-platform.sh --quick` on 7e31d172 gave **365 PASS,
0 FAIL, 0 SKIP**, `verify-platform: PASS -- all checks passed` (baseline: 351 PASS). Log:
.mozbuild/p68-06/final-quick-2.log. No row is red by design in `--quick`. The design-red rows are
full tier: orca-licence-rulings (entry 44), and orca-packaged-tree and orca-packaged-live (entry 30,
until Task 2 builds the container tarball).

## Deviations from Plan

1. **p68-10 merged despite a `BLOCKER:` line.** Rule 6 would hold the lane. The coordinator's instruction was to apply the lane's own one-line fix, after confirming the file is not ledger-locked. The fix is commit 15713704.
2. **Accepted scope deviations:** p68-07's scripts/verify-orca-agent-hooks.mjs and p68-09's theia/package.json. p68-01's 5edf17c3 also carries its Task 3 files, all inside files_modified.
3. **[Rule 1] rebase-orca.sh pnpm run re-install** (fix 554c66d7). This was found by the identity re-pin. The stale shipped-set cache key, which does not cover the install layout, stays as is: with the fix the replay no longer changes the layout, and a hand-run `pnpm run` in orca/ can still stale the cache until build-orca.sh restores the layout.
4. **[Rule 1] orca-pin literal** in p68-03's header comment (fix 7e31d172).
5. **Step (3b) not run.** By the caller's instruction, p68-08 was not launched, so the plan's automated check for 8 merges and at least 12 `# NEW (68-0` blocks (10 now) cannot pass until it is.
6. **Registry block order:** every lane inserted its blocks directly after the anchor. They were moved after the Phase 63 blocks in each merge resolution, per rule 2.

## Pending (Tasks 1(3b), 2, 3)

- Task 1 (3b): launch lane p68-08 (prerequisites p68-01, p68-10, p68-04 and p68-09 are merged), merge it last, run its rows plus `verify-bundled-xpi.mjs --live --dev` under the live lock.
- Task 1 (9): STATE.md decisions and the roadmap plan-progress refresh are recorded below under Tracking.
- Task 2 (after Phase 67): p68-05 launch and merge, container release package, packaged proofs, PLAT-02 Linux pass, removal of the two entry-30 rows.
- Task 3: WINDOWS.md entries for macOS, Windows and upstream PRs; the orca-upstream-prs exclusion; the deferred row; requirements; the final `--gate`.

## Tracking

- `gsd-tools roadmap update-plan-progress 68 --ws orca` checked the seven wave-1 lane lines. It also ticked 68-06, because this in-progress SUMMARY exists, and counted 8/10. That was corrected by hand: 68-06 is unchecked, and the Plans line and progress row read 7/10 with "68-06 in progress".
- STATE.md gained five Phase 68 decisions through `gsd-tools state add-decision --phase 68 --ws orca`: P68-37, A-P1, the --rulings release guard with entry 44, D-30/P68-38/P68-39, and the pnpm verify-deps fix. The tool also recomputed the progress counters. No state.advance-plan was run, and nothing was pushed or dispatched.
- REQUIREMENTS.md is untouched; Task 3 owns it.

## Self-Check: PASSED

- Commits d5d2a605, 2efd5ded, 93457ca9, 8f770d0f, 15713704, e49a8693, 2074609e, b2204949, 29a67f9f, 554c66d7, 316cb6f6 and 7e31d172 are ancestors of HEAD.
- The logs exist: .mozbuild/p68-06/identity-repin.log (with `rebase-orca: PASS`), brand-report.md, baseline-quick.log and final-quick-2.log.
- `grep -c '^  "orca-licence-rulings|' scripts/verify-platform.sh` = 1, and its id 44 equals `package_rulings[0].windows_id`.
- The merges are in the order p68-03, p68-04, p68-01, p68-10, p68-07, p68-09, p68-02. p68-08 is absent by instruction.
- 68-06 commits in this session: 12 on the first-parent line (7 merges, 3 fix, 2 docs) plus the commit that adds this SUMMARY. 58867a02 (docs(64)) is another session's commit and landed in between.
