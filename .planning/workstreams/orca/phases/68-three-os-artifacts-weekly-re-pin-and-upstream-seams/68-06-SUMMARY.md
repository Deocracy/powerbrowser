---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
plan: 06
subsystem: coordination
status: complete
tags: [merge, coordinator, brand-rows, licence, re-pin, live]
requires: ["68-01", "68-02", "68-03", "68-04", "68-05", "68-07", "68-08", "68-09", "68-10"]
provides: ["all nine Phase 68 lanes on ServerDestroyer/v1.7-Orca-integration", "identity re-pin PASS on the merged tree", "Linux package with <GreD>/orca (dev objdir) and its packaged and live proofs", "PLAT-02 Linux pass", "WINDOWS.md entries 44 and 48-55"]
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
    - powerbrowser/shell/OrcaService.sys.mjs
    - scripts/verify-orca-packaged-live.mjs
    - powerbrowser/endpoint-allowlist.json
    - website-staging/privacy.html
    - .planning/workstreams/orca/REQUIREMENTS.md
    - .planning/workstreams/orca/STATE.md
    - .planning/workstreams/orca/ROADMAP.md
decisions:
  - "P68-37: wave 1 (lanes 03, 04, 01, 10, 07, 09, 02) merged into v1.7 on 2026-11-10; 08 and 05 remain coordinator-launched"
  - "p68-10 merged despite its BLOCKER line, by the coordinator's instruction, with the lane's one-line rule-8 fix as fix(68-06)"
  - "The re-pin replay's pnpm run carries --config.verify-deps-before-run=false so it never re-installs orca/node_modules outside build-orca.sh's knobs"
  - "Open owner licence items (68-B, the 68-A terms check, the uBlock Origin GPL-3.0 s6 reading) are WINDOWS.md entry 44; the release guard stays closed"
  - "Task 2's package is the dev-objdir fallback: no Safe Browsing key directory exists on this host; entry 30 and the two orca-packaged rows' exclusions stay"
  - "OrcaService falls back to port 26768: a package carries no powerbrowser-sidecar.js, so the 0 fallback failed every packaged Orca start (fix 21898a67)"
  - "PLAT-02 stays Pending: the Linux pass is 35/38 (orca-tabs-live g3, WINDOWS 55; two owner-gated rows); BEXT-01 and BEXT-02 complete on recorded PASS"
plan_head_before: b37ad5b17fe84ae995970b1c0126fdd6dcfedc87
plan_head_after: 0458c0e2
commits: 216
commits_note: "git rev-list --count b37ad5b1..0458c0e2 = 216 (116 first-parent); the range also holds Phases 64-67's merges and other sessions' commits. 68-06's own: 7 wave-1 merges, p68-08 and p68-05 merges, 6 fix(68-06), 0458c0e2, 3 docs(68-06) including the one adding this file"
plan_head_task1_last_code: 7e31d172
metrics:
  completed: 2026-11-11
  tasks_done: "3 of 3"
---

# Phase 68 Plan 06: Coordinator Summary

Task 1's wave-1 half is done. All seven wave-1 lanes are merged by full ref in the plan order. The
identity re-pin replays every stage on the merged tree. Orca-family brand rows were re-measured, and
the open owner licence items are recorded as WINDOWS.md entry 44 with their exclusion rows. The
three live rows the lanes could not run all pass, and `--quick` is green (365 PASS, 0 FAIL).

**Completed 2026-11-11 (Task 1 step 3b, Tasks 2 and 3).** Lane p68-08 was merged (6d3c32c4) with
its privacy-page coordinator items (28124115). Lane p68-05 ran in its own Orca worktree, executed
by the coordinator with no Orca agent, and was merged (8f766a69). The Linux package was built from
the dev objdir, because this host has no Safe Browsing key directory. orca-packaged-tree,
orca-packaged-live and the BEXT packaged rows pass on it. The packaged live run found that the
package never started Orca; fix 21898a67 corrects that. The PLAT-02 Linux pass ran 38 derived rows:
35 PASS and 3 red, none of them caused by Phase 68 code. Entries 48-55 record what this host cannot
prove. BEXT-01 and BEXT-02 are complete. OVL-02, OVL-03, OVL-06, PLAT-01 and PLAT-02 stay Pending,
each with its deferred items named.

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
| p68-08 | /home/chris/orca/workspaces/Power-Browser/p68-08 | refs/heads/ServerDestroyer/p68-08 | 455db0d1 |
| p68-05 | /home/chris/orca/workspaces/Power-Browser/p68-05 (created without an Orca agent; the coordinator executed 68-05) | refs/heads/ServerDestroyer/p68-05 | d3a32bc7 |

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
5. **Step (3b) was deferred in the first session** by the caller's instruction. It was done on 2026-11-11, so the merge record now has all nine lanes (below).
6. **Registry block order:** every lane inserted its blocks directly after the anchor. They were moved after the Phase 63 blocks in each merge resolution, per rule 2.

## Task 1 step (3b): lane p68-08

- Merge 6d3c32c4 by `refs/heads/ServerDestroyer/p68-08` (tip 455db0d1). Scope check: 15 changed paths, all inside 68-08-PLAN.md files_modified. No BLOCKER line. The verify-platform.sh conflicts at the quick and full anchors were resolved by rule (2): the branch's 64-01 and 67-05 blocks stay where they are, and the 68-08 blocks follow them byte for byte.
- Coordinator items, fix 28124115: website-staging/privacy.html gains the unattended `<li>` for uBlock Origin's eight default-on filter-list hosts. The versioncheck-bg allow row's reason and the privacy sentence no longer say "only once you have installed one". The disposition stays `allow`.
- Rows after the merge (previous session, logs .mozbuild/p68-06/m8-*.log), re-run in this session (step1-*.log): bundled-xpi, bundled-xpi-self-test, licensing, licensing-self-test, licence-allowlist, licence-allowlist-self-test, allowlist-schema, allowlist-doc-consistency (+ self-test), privacy-hosts: all PASS. `verify-bundled-xpi --live --dev` PASS (bundled-xpi-live-dev.log), and `verify-bundled-extensions --live` PASS.

## Task 2

### Lane p68-05 (upstream seam export)

The Orca worktree p68-05 was created with `worktree create ... --name p68-05 --parent-worktree active --base-branch ServerDestroyer/v1.7-Orca-integration`, without `--agent`. The session before the restart created it and wrote the upstream material and the export but committed nothing. This session reviewed that material and re-ran everything, then committed it. Lane commits: ef8eba40, 6e74c0c6, d3a32bc7. Merge 8f766a69: 5 changed paths, all inside 68-05 files_modified except `.gitignore` (accepted, below). There was no BLOCKER line and no conflict. seams.json is unchanged, and the 68-05 block follows the 68-08 block at the full anchor (rule 7). Afterwards orca-overlay, orca-overlay-self-test and orca-seam-export-self-test: PASS.

Seam classification (seams.json, unchanged): 010-installed-electron-switch is `browser-provider`, the offer. 070-claude-agent-sdk-dir and 080-orcad-external-claude-agent-sdk are `pb-only` (68-07, P68-38). Every `pr` is null. No web-entry seam exists, because Phase 64 added none.

- Export browser-provider: `export-orca-seam-pr: PASS -- 010-installed-electron-switch exported to .mozbuild/orca-upstream/browser-provider/ (seam.patch, issue.md, pr.md with 12 template headings, test-command.txt); nothing was opened upstream`. The seam applies to Orca main 21c8fdc0.
- Export web-entry: refused, `no seam of class web-entry (classes present: browser-provider, pb-only)`. Recorded as WINDOWS 52.
- Upstream test `orca-overlay/upstream/010-installed-electron-switch/src/main/orcad/orcad-browser-provider.installed-electron-switch.test.ts`: 2 files and 17 tests passed on the seamed orca/. With the seam reverted, 1 of 3 tests fails. Orca's `pnpm test` needs bun 1.4.4, which is absent from `.#orca`, so vitest ran under node (deviation in 68-05-SUMMARY.md).
- Orca issue texts prepared from 64-MIRROR-FREEZE.md, in 68-05-SUMMARY.md "Orca issue texts". Issue A, the host double projection, is already fixed on Orca main; it is not to be filed, and the overlay's echo wrapper can go at the first re-pin that carries the fix. Issue B, the web client's missing authoritative-inventory capability, is still present on main and is to be filed.

### Release package (dev-objdir fallback)

The container release build was not run, for two reasons. The release mozconfig needs `--with-google-safebrowsing-api-keyfile=/keys/sb-gapi.data`, and there is no `/keys` directory and no `PB_KEYDIR` on this host. Also, `podman` in this sandbox fails with "cannot re-exec process to join the existing user namespace". Under the plan's fallback the dev objdir was packaged instead. Tree a625378d, host legion (NixOS, Linux 6.18.60), toolchain `nix develop .#firefox`:

| Step | Command | Wall time |
|------|---------|-----------|
| Orca | `nix develop .#orca --command bash scripts/build-orca.sh` (ORCA_* unset) | 34 s (`build-orca: PASS -- built v1.4.248 (965978bc78…) in 33s`) |
| Theia | `nix develop .#theia --command bash -c 'cd theia && yarn build'` | about 1 min |
| Gecko chrome JS | `cd upstream && MOZCONFIG=../.mozconfig nix develop ..#firefox --command ./mach build faster` | 4 s (libxul from 2026-11-08; patches last changed 2026-11-06) |
| Package | `POWERBROWSER_OBJDIR=objdir PB_HOST_ROOT=$PWD nix develop .#firefox --command bash powerbrowser/packaging/package-linux.sh` | 310 s, then 313 s after the fix |

Output: objdir/dist/powerbrowser-153.5.1.en-US.linux-x86_64.tar.xz (189 MB), the complete MAR, and release-manifest.json (release v153.5.1-1, channel default). objdir/config.status is unchanged by the package step (sha256 prefix b16c05a10edf051d before and after). Every packaged row below ran on this package with `POWERBROWSER_OBJDIR=objdir`.

A first `./mach build faster` without `MOZCONFIG` started a configure in `upstream/obj-x86_64-pc-linux-gnu` and failed at libclang. That directory (364 KB, ignored by upstream's .gitignore) is left behind, because the sandbox denied its removal. It is an owner clean-up item. `git -C upstream diff` is unchanged.

### Packaged proofs

| Row | Result |
|-----|--------|
| ng063-packaged-launch | PASS -- the packaged tree reached a ready workbench on its own Theia and Node |
| portable-elf | FAIL -- `toolchain-baseline.txt sysroot line is missing or UNMEASURED -- measure it in the release container` (release-only; entry 30, excluded) |
| sidecar-no-symlinks | PASS -- find <stage> -type l is EMPTY over the staged tree |
| package-target-natives | PASS -- 38 native(s) match --target linux-x64 (ELF x86-64), sorted and stable |
| orca-packaged-tree | PASS -- 2894 files equal the built tree (linux-x64), node-pty slot linux-x64-glibc built on linux-x64 |
| bundled-xpi-packaged (`verify-bundled-xpi --packaged`) | PASS -- the package's distribution/extensions/ holds exactly the pinned XPIs, each equal to its pin |
| orca-claude-sdk-built | PASS -- ORCAD_EXTERNAL_MODULES lists @anthropic-ai/claude-agent-sdk; the needle CLAUDE_AGENT_SDK_VERSION="0.3.284" is in the installed SDK's sdk.mjs and in none of 9705 files under orca/out |
| orca-packaged-live (lock) | first run FAIL (fix 1 below); after the fix PASS -- the packaged PowerBrowser ran orcad on its own node/bin/node with the web client from <GreD>/orca/out/web, a quit left no orcad or terminal daemon, and the packaged web client paired in a web tab |
| bundled-xpi-live (`verify-bundled-xpi --live`, lock) | PASS -- on the extracted Linux package: first start installed and enabled it in the profile scope and it blocked the fixture request; after a relaunch with no stock window it still filtered; disabled, the request arrived; removed, it stayed removed after a relaunch |
| bundled-extensions-live (lock) | PASS -- Theia deploys each bundled extension as a user plugin, never a built-in, and an uninstall is not undone |

Every row was re-run on the final package (after both fixes): all PASS except portable-elf. The
entry-30 exclusion rows for orca-packaged-tree and orca-packaged-live stay: both rows pass with
`POWERBROWSER_OBJDIR=objdir`, but a default run still looks for objdir-release, and no container
release tarball exists. A comment line above the exclusion rows records this.

### fix(68-06) commits in Task 2 (rule 5)

4. **21898a67**, powerbrowser/shell/OrcaService.sys.mjs (in 68-07's and 68-10's files_modified; not ledger-locked). Failing:
   `["Orca failed step","reading the Orca port"],["Orca port",0],["Orca error","buildOrcadArgs: port 0 is not an integer from 1024 to 32767"]`.
   powerbrowser-sidecar.js is a dev-tree prefs file (`JS_PREFERENCE_PP_FILES`, not in the package manifest; the packaged browser/omni.ja has no `powerbrowser.orca.*` default), so `getIntPref("powerbrowser.orca.port", 0)` gave 0 in every package, and the packaged Orca never started. The fallback is now 26768, the default, as every other Orca and sidecar pref falls back to its default. Afterwards orca-service, -self-test, internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines, shell-error-copy-no-internals, start-path-recovery, orca-hidden-electron-self-test and orca-service-live-self-test: PASS.
5. **a625378d**, scripts/verify-orca-packaged-live.mjs (68-01's file; not ledger-locked). After fix 4, the row passed, but the pairing step's PowerBrowser (pairWebTab, which the harness ends with a signal, not a quit) left its OrcaService's orcad and terminal daemon running from the deleted extraction root. live() now stops every process with an argument under that root, by recorded pid and start ticks, before removing it. The pure selector `strayUnder` gained self-test cases: a planted stray goes red, and a sibling prefix stays green. orca-packaged-live and orca-packaged-live-self-test: PASS. The same leak in other packaged rows is WINDOWS 54.

### PLAT-02 Linux pass

The labels are the full-tier rows inside every `# NEW (6N-0M, ...)` block, N = 0..8, in registry
order: 38 labels (.mozbuild/p68-06/plat02-labels.txt). Each row ran alone with `--only` under
`flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, with ORCA_* unset,
`PB_LIVE_LOCK_HELD=1` and `POWERBROWSER_OBJDIR=objdir`. Logs: .mozbuild/p68-06/plat02/.

| Block | Label | Result | Time |
|-------|-------|--------|------|
| 60-02 | orca-build-shape | PASS | 0 s |
| 60-03 | orca-slotless-start | PASS | 12 s |
| 61-02 | orca-browser-parity | PASS | 1 s |
| 62-01 | orca-overlay-built | PASS | 1 s |
| 62-02 | orca-hidden-electron | PASS | 13 s |
| 62-02 | orca-service-live | PASS | 43 s |
| 63-03 | orca-agent-hooks | PASS | 5 s |
| 63-03 | orca-agent-status-live | PASS (a real claude, 1 prompt; idle, working, permission, working, idle) | 18 s |
| 68-03 | orca-mobile-skew | PASS (pin 8 tags behind v1.4.256; stock app 0.0.64; verdict ok) | 2 s |
| 68-04 | orca-licence-rulings | FAIL by design: PENDING RULING 68-B, PENDING OWNER CHECK 68-A (WINDOWS 44, excluded) | 0 s |
| 68-01 | orca-packaged-tree | PASS | 2 s |
| 68-01 | orca-packaged-live | PASS | 20 s |
| 68-07 | orca-claude-sdk-built | PASS | 1 s |
| 68-09 | bundled-extensions-live | PASS | 9 s |
| 64-01 | orca-pane-entry | PASS | 5 s |
| 64-01 | orca-pane-standalone-live | PASS | 89 s |
| 64-01 | orca-pane-css | PASS | 1 s |
| 64-01 | orca-pane-css-live | PASS | 66 s |
| 64-04 | orca-terminal-keys-live | PASS | 137 s |
| 64-04 | orca-tabs-live | FAIL: stage tab-groups-cross-client (g3), "the second client shows no tab for T", red since Phase 64 (TAB-04), not caused by Phase 68 code; WINDOWS 55, excluded | 113 s |
| 65-02 | orca-workspace-live | PASS | 39 s |
| 65-03 | orca-side-panel-live | PASS | 19 s |
| 65-03 | orca-add-project-live | PASS | 27 s |
| 65-04 | orca-offer-scan | PASS | 12 s |
| 65-04 | orca-relaunch-restore-live | PASS | 54 s |
| 66-01 | orca-browser-host-bundle | PASS | 20 s |
| 66-03 | no-remote-agent-port-live | PASS | 58 s |
| 66-03 | no-remote-agent-port-live-self-test | PASS | 29 s |
| 66-04 | orca-browser-snapshot-live | PASS | 78 s |
| 66-05 | orca-browser-agent-live | PASS | 127 s |
| 66-05 | orca-agent-mark-live | PASS | 197 s |
| 67-01 | orca-credential-store-live | PASS | 33 s |
| 67-03 | orca-failure-page-live | PASS | 177 s |
| 67-04 | orca-pairing-containment-live | PASS | 33 s |
| 67-05 | orca-landing-logo-live | PASS | 33 s |
| 68-08 | bundled-xpi-packaged | PASS | 1 s |
| 68-08 | bundled-xpi-live | PASS | 43 s |
| 68-05 | orca-upstream-prs | FAIL by design: no PR URL for browser-provider or web-entry (WINDOWS 51, 52, excluded) | 164 s (lock wait) |

Result: 35 PASS and 3 FAIL. Two FAILs are owner-gated by design, and one is a Phase 64 stage that was already red. PLAT-02 stays Pending (its macOS and Windows half is WINDOWS 49 and 50).

**Process hygiene during the pass.** After each row, the pass script stopped every orcad.js or
daemon-entry.js process younger than that row's duration plus 5 s, by pid. Ten rows left their
own orcad behind, in the same signal-ended-browser pattern as WINDOWS 54: orca-slotless-start,
orca-terminal-keys-live, orca-relaunch-restore-live, no-remote-agent-port-live-self-test,
orca-browser-snapshot-live, orca-browser-agent-live, orca-agent-mark-live,
orca-credential-store-live, orca-failure-page-live and bundled-xpi-live. **Deviation:**
orca-upstream-prs waited 164 s for the live lock, which another session held. The age window
therefore covered that session's run, and pid 2791392 was stopped. A session in the gap-66-09
worktree took the lock at 13:36:32 for `node scripts/verify-orca-failure-page-live.mjs`, so
2791392 was most likely that run's orcad. That run may have gone red because of this. The two
orcad processes from other sessions that were running before the pass (1690681, 2155244) were
not touched.

## Task 3

### WINDOWS.md entries (gsd-tools windows append --phase 68 --ws orca)

| id | kind | file | subject | exclusion row |
|----|------|------|---------|---------------|
| 48 | unrun-verify | powerbrowser/packaging/package-macos.sh | macOS release artifact with Orca (Phase 55 BLOCKED items 8, 9) | — |
| 49 | unrun-verify | powerbrowser/packaging/package-macos.sh | macOS smoke test (D-24) | — |
| 50 | unrun-verify | powerbrowser/packaging/package-windows.sh | Windows smoke test (CF-10) | — |
| 51 | unrun-verify | orca-overlay/seams.json | upstream issue and PR for seam 010 (owner) | `orca-upstream-prs|51|owner opens the upstream issues and PRs (OVL-06, D-27)` |
| 52 | deviation | orca-overlay/seams.json | web-entry export refused: no seam (owner ruling on the class) | covered by the orca-upstream-prs row |
| 53 | unmet-truth | theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts | Windows twin of the POSIX sh claude-wrapper launcher | — |
| 54 | deviation | scripts/lib/firefox-bidi.mjs | packaged live rows ended by a signal leave orcad running | — |
| 55 | unmet-truth | scripts/verify-orca-tabs-live.mjs | orca-tabs-live g3 red (Phase 64, TAB-04) | `orca-tabs-live|55|stage tab-groups-cross-client (g3) red since Phase 64 (TAB-04)` |

Entry 44 (the owner licence items) and entry 30 (the container release tarball) stay open with their rows. D-31 dropped the PTY transport, so no Windows named-pipe or macOS PTY transport entry was written.

### Brand rows (rule 3, second measurement)

The rows were measured with the scanner's own matcher on the staged tree after the p68-08 and p68-05 merges, the fixes and the exclusion rows (.mozbuild/p68-06/brand-measure-t2.mjs, report .mozbuild/p68-06/brand-report-t2.md). No exclude entry was added. `node scripts/scan-brand-residue.mjs`: PASS over 835 files; `--self-test`: PASS.

| Row | Count | Files added |
|-----|-------|-------------|
| Orca (title) | 2841 -> 2852 | orca-overlay/upstream/010-installed-electron-switch/upstream.json |
| orca (lower) | 5330 -> 5345 | none |
| ORCA (upper) | 1220 -> 1225 | the upstream test file, upstream.json |
| orcad (lower) | 1639 -> 1651 | the upstream test file, upstream.json |
| renderOrcaSection (literal) | 5 -> 6 | none |
| runOrca( (literal) | 4 -> 5 | none |
| resolveOrca (literal) | 4 -> 5 | upstream.json |

### Requirements

- BEXT-01 Complete (recorded PASS: orca-claude-sdk, orca-claude-sdk-built, bundled-extensions, bundled-extensions-live, licence-allowlist); the 68-A terms check stays an owner item (WINDOWS 44).
- BEXT-02 Complete (recorded PASS on the package: bundled-xpi-packaged, bundled-xpi-live); the GPL-3.0 section 6 reading stays an owner item (WINDOWS 44).
- OVL-02 Pending: first live weekly tick, bump PR with auto-merge, owner review.
- OVL-03 Pending: stock Android app pairing.
- OVL-06 Pending: owner opens the issue and PR (WINDOWS 51); web-entry ruling (WINDOWS 52).
- PLAT-01 Pending: container release tarball (30), windows-orca and build-windows first run, macOS artifact (48), licence rulings (44).
- PLAT-02 Pending: Linux pass 35/38 (orca-tabs-live g3, WINDOWS 55); macOS and Windows smoke (49, 50).

### Deferred Verification (STATE.md row for Phase 68)

- Pair the stock Android app beside the orca-mobile-skew output (P68-17).
- Open the upstream issue and then the PR for seam 010, record the URL, and rule on the web-entry class (WINDOWS 51, 52).
- The first live weekly re-pin tick, the bump PR with auto-merge armed, and the owner's approving review.
- A release.yml dispatch that produces Linux and Windows artifacts with Orca: the first real runs of windows-orca and the macOS jobs, and the container release tarball (WINDOWS 30).
- macOS and Windows smoke tests, and the macOS artifact (WINDOWS 48, 49, 50).
- Ruling 68-B, the 68-A terms check (D-30) and the GPL-3.0 section 6 reading for uBlock Origin (P68-39) (WINDOWS 44).
- Reinstalling the SDK extension after an uninstall (no affordance in v1.7, 68-09).
- A-P1 confirmation.
- The Windows claude-wrapper launcher (WINDOWS 53).
- Packaged live rows that end PowerBrowser by a signal leave orcad running (WINDOWS 54).
- Clean-up of `upstream/obj-x86_64-pc-linux-gnu`.
- Orca issue B (68-05-SUMMARY.md).

### Final --quick (Task 3)

`nix develop .#theia --command scripts/verify-platform.sh --quick`, run on the staged final tree,
gave **412 PASS, 0 FAIL, 0 SKIP**: `verify-platform: PASS -- all checks passed` (baseline 351 PASS,
empty red list). The run took 663 s, and its log is .mozbuild/p68-06/t3-final-quick.log. Among the
passing rows are scan-brand-residue, licence-allowlist, orca-overlay, orca-mobile-protocol,
orca-claude-sdk and bundled-extensions.


### Deviations in Tasks 2 and 3

7. **Dev-objdir package** instead of the container release build: no Safe Browsing key directory, and podman is unusable in this sandbox. Recorded above. Entry 30 stays.
8. **Phase 67 precondition.** Task 2 requires Phase 67 complete with its ROADMAP entry checked. Its plans are executed and verified (docs(67) 82b093c4), but the ROADMAP checkbox is still unchecked. Task 2 ran on the caller's instruction.
9. **Lane p68-05 ran without an Orca agent**, executed by the coordinator. Its `.gitignore` negation line is outside its files_modified (accepted at the merge).
10. **`--gate` not run.** The caller's step list ends with `--quick`. A full `--gate` repeats every live row of the registry, and other sessions hold the live lock throughout. The PLAT-02 pass and the packaged rows are the full-tier evidence. Every Orca red found is keyed to an open entry.
11. **Process stopped outside this run** (PLAT-02 pass, orca-upstream-prs window): see "Process hygiene" above.
12. **Stray `upstream/obj-x86_64-pc-linux-gnu`** from a mach call without MOZCONFIG; its removal was denied.

## Tracking

- `gsd-tools roadmap update-plan-progress 68 --ws orca` checked the seven wave-1 lane lines. It also ticked 68-06, because this in-progress SUMMARY exists, and counted 8/10. That was corrected by hand: 68-06 is unchecked, and the Plans line and progress row read 7/10 with "68-06 in progress".
- STATE.md gained five Phase 68 decisions through `gsd-tools state add-decision --phase 68 --ws orca`: P68-37, A-P1, the --rulings release guard with entry 44, D-30/P68-38/P68-39, and the pnpm verify-deps fix. The tool also recomputed the progress counters. No state.advance-plan was run, and nothing was pushed or dispatched.
- REQUIREMENTS.md is untouched; Task 3 owns it.
- 2026-11-11 (Tasks 2 and 3): three more decisions through `gsd-tools state add-decision --phase 68 --ws orca`: the dev-objdir package, the OrcaService port fallback, and seam 010 as the only upstream offer. STATE.md gained the Phase 68 Deferred Verification row and one Blockers/Concerns line naming entries 48-55. `requirements mark-complete BEXT-01 BEXT-02 --ws orca`. The traceability cells of OVL-02, OVL-03, OVL-06, PLAT-01 and PLAT-02 are Pending with their deferred items, and BEXT-01 and BEXT-02 name their owner items. `roadmap update-plan-progress 68 --ws orca` ticked 68-08, 68-05 and 68-06 (10/10), and the Plans line text was corrected by hand. The Phase 68 checkbox stays unchecked, because verify-work follows. No state.advance-plan or phase complete was run, and nothing was pushed or dispatched.

## Self-Check: PASSED

2026-11-11 (Tasks 2 and 3):
- 6d3c32c4, 28124115, 8f766a69, 21898a67, a625378d and 0458c0e2 are ancestors of HEAD; lane commits ef8eba40, 6e74c0c6 and d3a32bc7 are on refs/heads/ServerDestroyer/p68-05.
- `git log --merges` names p68-03, p68-04, p68-01, p68-10, p68-07, p68-09, p68-02, p68-08 and p68-05; `grep -c '# NEW (68-0' scripts/verify-platform.sh` = 13.
- The plan's Task 3 exclusion check exits 0: ids 44, 30, 30, 51 and 55 are all open in WINDOWS.md.
- Logs exist: .mozbuild/p68-06/t2-package-linux-2.log, t2-final-*.log, plat02/results.txt, t3-final-quick.log and brand-report-t2.md.

2026-11-10 (Task 1):

- Commits d5d2a605, 2efd5ded, 93457ca9, 8f770d0f, 15713704, e49a8693, 2074609e, b2204949, 29a67f9f, 554c66d7, 316cb6f6 and 7e31d172 are ancestors of HEAD.
- The logs exist: .mozbuild/p68-06/identity-repin.log (with `rebase-orca: PASS`), brand-report.md, baseline-quick.log and final-quick-2.log.
- `grep -c '^  "orca-licence-rulings|' scripts/verify-platform.sh` = 1, and its id 44 equals `package_rulings[0].windows_id`.
- The merges are in the order p68-03, p68-04, p68-01, p68-10, p68-07, p68-09, p68-02. p68-08 is absent by instruction.
- 68-06 commits in this session: 12 on the first-parent line (7 merges, 3 fix, 2 docs) plus the commit that adds this SUMMARY. 58867a02 (docs(64)) is another session's commit and landed in between.
