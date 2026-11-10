---
phase: 62-overlay-gate-and-powerbrowser-run-orcad
plan: 03
subsystem: coordination
tags: [orca, orcad, overlay, merge, live-proof, brand-scan]
status: complete

requires:
  - phase: 62-01
    provides: orca-overlay/ seam, build-orca.sh step 1b, overlay gate and rows
  - phase: 62-02
    provides: OrcaService, OrcaEnv, PowerBrowserProcesses, live checks and rows
provides:
  - both lanes merged into ServerDestroyer/v1.7-Orca-integration
  - ROADMAP Phase 62 criteria 1-5 proven on the merged, built tree
  - Orca-family brand rows re-measured; two new literal rows (onorca, RealOrcaEnv)
affects: [63, 64, 65, 66, 67, 68]

requirements-completed: [RUN-03, RUN-04, RUN-05, OVL-01, OVL-05]

key-files:
  created:
    - .planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-03-SUMMARY.md
  modified:
    - scripts/verify-platform.sh (merge resolution only)
    - scripts/verify-ng-027-reader-callers.mjs
    - inventory/brand-tokens.json
    - .planning/workstreams/orca/ROADMAP.md
    - .planning/workstreams/orca/REQUIREMENTS.md
    - .planning/workstreams/orca/STATE.md

key-decisions:
  - "ng-027-reader-callers fixed in the check (call shape accepts PowerBrowserProcesses.<reader>(), not by renaming the boundary method; the file is ledger-locked and needs the owner's re-lock"
  - "In-word Orca joins introduced by 62-02 get literal rows onorca and RealOrcaEnv (60-04 rule)"

actuals:
  tokens: 9900
  tasks: 3
  commits: 15
plan_head_before: b6a3e2ce7d8c477d1f408d479282a6d53bde2770
plan_head_after: fcb2a1ab
duration: ~25 min (2026-11-10T06:22Z to 06:47Z)
completed: 2026-11-10
---

# Phase 62 Plan 03: coordinator Summary

Both lanes merged in order; Orca rebuilt with the seam and PowerBrowser rebuilt with `./mach build faster`; every live and full row of Phase 62 passed on the first run; the brand gate is green with measured rows; `--quick` matches the baseline (345 PASS, 0 FAIL).

`commits: 15` is `git rev-list --count b6a3e2ce..fcb2a1ab`, which counts the ten lane commits brought in by the merges and two foreign `docs(63)`/`docs(68)` context commits made in this worktree during the run. This plan's own commits on the first-parent line are four before this SUMMARY's final commit: 791eb926, bf05b8c5, dc800b31, fcb2a1ab. `plan_head_after` is the head before the final docs commit.

## Lanes

| Lane | Worktree | Branch | Head | SUMMARY commit |
|------|----------|--------|------|----------------|
| 62-01 | /home/chris/orca/workspaces/Power-Browser/p62-01 | ServerDestroyer/p62-01 | ea9ac29f | ea9ac29f |
| 62-02 | /home/chris/orca/workspaces/Power-Browser/p62-02 | ServerDestroyer/p62-02 | 58199082 | 58199082 |

Neither lane SUMMARY holds a line starting "BLOCKER:".

## Pre-merge baseline

`nix develop .#theia --command scripts/verify-platform.sh --quick` at 45f8429c: exit 0, 339 PASS, red rows: none.

## Merges

| Commit | Ref | Scope check |
|--------|-----|-------------|
| 791eb926 | refs/heads/ServerDestroyer/p62-01 (ea9ac29f) | 11 changed paths, all in 62-01-PLAN.md files_modified |
| bf05b8c5 | refs/heads/ServerDestroyer/p62-02 (58199082) | 14 changed paths, all in 62-02-PLAN.md files_modified |

The scope check read each plan's frontmatter `files_modified` with node and compared it with `git diff --name-only $(git merge-base HEAD <ref>) <ref>`; no extra path.

Registry conflict (merge rule 2): two conflict hunks in `scripts/verify-platform.sh`, resolved as the 62-01 block then the 62-02 block at both anchors. Against each parent the resolved file deletes 0 lines; against the base it adds 34 lines (10 from 62-01, 24 from 62-02). `grep -n '# NEW (62-0'` prints 3864 (62-01), 3870 (62-02), 6453 (62-01), 6457 (62-02). No other file conflicted.

After the p62-01 merge: orca-overlay, orca-overlay-self-test, verify-rebranding-docs, generate-check PASS. After the p62-02 merge and `node scripts/generate.mjs` (72 files written, no tracked change): orca-service, orca-service-self-test, orca-hidden-electron-self-test, orca-service-live-self-test, internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines, sidecar-reap-blocker, start-path-recovery, shell-error-contract PASS; ng-027-reader-callers FAIL (below). Brand scan after both merges: FAIL, 1037 reconciliation failures, all Orca-family (fixed in Task 3).

## fix(62-03) commits

**dc800b31, `scripts/verify-ng-027-reader-callers.mjs`.** The failing line after the p62-02 merge:

```
powerbrowser/shell/PowerBrowserAPI.sys.mjs:10955 listProcessTree -- no caller on the runtime path (give it a consumer or delete it)
```

`listProcessTree` has two callers in `OrcaService.sys.mjs` (`PowerBrowserProcesses.listProcessTree(`); the check's method call pattern only knew `PowerBrowserAPI.<name>(`. The pattern now accepts either boundary object. The self-test fixture gains a `PowerBrowserProcesses` reader with one shell caller, plus a plant that removes the caller and must go red. With the pattern reverted, the self-test control goes red naming `listUsedByProcesses`. The row now reports 32 readers, all called.

## Build record

- Orca: `nix develop .#orca --command bash scripts/build-orca.sh` (inherited `ORCA_*` variables unset) exit 0. Log `.mozbuild/orca-build/build-20261110T063142Z.log` holds `build-orca: overlay applied src/main/orcad/orcad-browser-provider.ts` and `build-orca: PASS -- built v1.4.248 (965978bc78bf03a6a43187c1ed28fcffe0e01bb5) in 22s`.
- PowerBrowser: `nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build faster'` exit 0 in 19 s. Tier 3 was not needed: `objdir/dist/bin/browser/chrome/browser/content/powerbrowser/OrcaService.sys.mjs` and `OrcaEnv.sys.mjs` exist, and `objdir/dist/bin/browser/defaults/preferences/powerbrowser-sidecar.js` holds `pref("powerbrowser.orca.port", 26768);`.

## Live and full proofs (all under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, `ORCA_*` unset)

- orca-service-live: `orca-service-live: PASS -- 18 environment names equal the expected set (planted ORCA_PLANT_62 absent), data root through the alias, ws://127.0.0.1:22637, Node 24.19.0 shared with the Theia backend; quit ended a tree of 5 processes including an agent session; orcad pid 3071717 survived the SIGKILL and was replaced by pid 3074140 on port 22637. Recorded: orcad shares PowerBrowser's process group; idle non-loopback peers: none`
- orca-hidden-electron: `orca-hidden-electron: PASS -- stock orcad launched the decoy (browser-sidecar-profile.json and the provider warning after 0 ms); with ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER=1 neither appeared in 10000 ms and orcad kept running`
- orca-overlay-built: `orca-overlay-built: PASS -- 0 overlay file(s): vacuous until the first PB-added file lands (P62-20); the self-test fixtures carry the proof`
- orca-build-shape: `orca-build-shape: PASS -- 0 slot markers, 0 Node runtimes in out/, 0 Electron binaries, 1 modified tracked file(s), equal to the declared seams of orca-overlay/seams.json (src/main/orcad/orcad-browser-provider.ts)`
- orca-slotless-start: `orca-slotless-start: PASS -- orcad 1.4.248 ready on ws://127.0.0.1:36335, Node 24.19.0 (node-runtime.json), 1 Node runtime, web tab paired (status bar '1 host' ...), orcad and terminal daemon reaped (11.1s)`
- verify-endpoints: layer 1 PASS; layer 2 PASS (zero touches to `$HOME/.mozilla/firefox`); layer 3 PASS (all resolved hosts allowlisted, so no unattended `.onorca.dev` contact).
- verify-branding-identity-dev: PASS.
- orca-browser-parity: not in the merged registry (Phase 61 has not added it on this branch), so not run.

Records:

- Alias path shape: `<XDG_RUNTIME_DIR>/pb-orca-<12 hex of SHA-256 of the data root>`, here under `/run/user/1000`. The live row makes the profile path too long for orcad's socket on purpose, so the alias was exercised.
- Process group (assumption A2): orcad shares PowerBrowser's process group. This is recorded, not asserted. Stop and reap signal by pid plus start ticks, never by group.
- Idle egress (P62-15): idle non-loopback peers of the orcad tree after 20 s: none (0). No STATE.md concern line.
- The live row overrides the port pref with a free port (22637). The shipped default 26768 is proven by the packaged pref, not by the live run.

## Task 2

Task 2: not reached. No lane BLOCKER line, and the reap was identity-safe (pid plus start ticks; orcad of the SIGKILLed session replaced on the same port).

## Brand rows changed

Measured on the staged merged tree with the scan's own matcher (`scopeFiles`, `scan`, every Orca-family row widened to all scope files, then narrowed to the files it claimed). Each changed row's reason gained one sentence naming Phase 62 and the files added. No exclude entry was added; `orca-overlay/` is scanned.

| Row | Old count | New count | Files old to new | Files added |
|-----|----------:|----------:|------------------|-------------|
| Orca (title) | 93 | 313 | 19 to 34 | docs/REBRANDING.md, orca-overlay/seams.json, powerbrowser/INTERNAL-APIS.md, powerbrowser/endpoint-allowlist.json, powerbrowser/shell/{OrcaEnv.sys.mjs, OrcaService.sys.mjs, PowerBrowserAPI.sys.mjs, jar.mn, powerbrowser-sidecar.js, powerbrowser.js}, scripts/verify-orca-{hidden-electron, overlay, service-live, service}.mjs, scripts/verify-shell-error-contract.mjs |
| orca (lower) | 420 | 797 | 20 to 30 | powerbrowser/INTERNAL-APIS.md, powerbrowser/endpoint-allowlist.json, powerbrowser/shell/{OrcaEnv.sys.mjs, OrcaService.sys.mjs, powerbrowser-sidecar.js}, scripts/verify-orca-{hidden-electron, overlay, service-live, service}.mjs, scripts/verify-shell-error-contract.mjs |
| ORCA (upper) | 100 | 158 | 13 to 19 | orca-overlay/patches/010-installed-electron-switch.patch, orca-overlay/seams.json, powerbrowser/shell/OrcaEnv.sys.mjs, scripts/verify-orca-{hidden-electron, service-live, service}.mjs |
| orcad (lower) | 179 | 535 | 12 to 25 | orca-overlay/patches/010-installed-electron-switch.patch, orca-overlay/seams.json, powerbrowser/INTERNAL-APIS.md, powerbrowser/endpoint-allowlist.json, powerbrowser/shell/{OrcaEnv.sys.mjs, OrcaService.sys.mjs, PowerBrowserAPI.sys.mjs, powerbrowser-sidecar.js, powerbrowser.js}, scripts/verify-orca-{hidden-electron, overlay, service-live, service}.mjs |
| ORCAD (upper) | 9 | 81 | 2 to 8 | powerbrowser/INTERNAL-APIS.md, powerbrowser/shell/{OrcaEnv.sys.mjs, OrcaService.sys.mjs}, scripts/verify-orca-{hidden-electron, service-live, service}.mjs |
| Orcad (literal) | 11 | 47 | 4 to 9 | powerbrowser/shell/{OrcaEnv.sys.mjs, OrcaService.sys.mjs}, scripts/verify-orca-{hidden-electron, service-live, service}.mjs |
| installedOrcaPaths (literal) | 5 | 8 | 2 to 3 | scripts/verify-orca-hidden-electron.mjs |
| onorca (literal, new) | - | 17 | 0 to 2 | powerbrowser/endpoint-allowlist.json (2), scripts/verify-orca-service.mjs (15) |
| RealOrcaEnv (literal, new) | - | 5 | 0 to 1 | scripts/verify-orca-hidden-electron.mjs (5) |

Unchanged: `\borca` 1, `\norca_` 2, `ErrorCapture` 10, `ErrorCalls` 3. Before the two literal rows, the scan reported 22 unclaimed probe hits, all in-word joins (`.onorca.dev`, `RealOrcaEnv`); after them, 0. `node scripts/scan-brand-residue.mjs`: `PASS -- no residual brand occurrence in 696 scanned file(s)`; `--self-test` PASS. `grep -c 'orca-overlay/seams.json' inventory/brand-tokens.json` prints 9.

## Quick gate against the baseline

`nix develop .#theia --command scripts/verify-platform.sh --quick` on the merged tree with the inventory staged: exit 0, 345 PASS, 0 FAIL (baseline 339 PASS plus the 6 new quick rows). Then each `--only` row PASS: start-path-recovery, shell-error-contract, shell-error-copy-no-internals, sidecar-reap-blocker, internals-boundary, internals-catalogue, theia-endpoints, privacy-hosts, generated-byte-identity, ng-027-reader-callers.

## Tracking

- `roadmap.update-plan-progress 62 --ws orca`: Phase 62 plans 3/3 ticked, progress row `3/3 | In Progress`. The three plan lines were already present. The phase is not marked complete; verify-work follows.
- `requirements.mark-complete RUN-03 RUN-04 RUN-05 OVL-01 OVL-05 --ws orca`: checkboxes and traceability rows set to Complete.
- STATE.md Decisions: P62-14, P62-16 and P62-19 lines. No Blockers/Concerns line, because idle egress was 0. `state.advance-plan` was not run, because the position fields belong to Phase 59.
- Nothing pushed.

## Deviations from Plan

1. **[Rule 3 - Blocking] ng-027-reader-callers fixed outside this plan's files_modified (dc800b31).** Merge rule (4) limits a fix to this plan's files. The one-line root cause is in the check, which 62-02's merge note named. The in-scope alternative was renaming `listProcessTree`, which P62-19, the plan's STATE line and the INTERNAL-APIS rows all name, so it was rejected. **Owner item:** `scripts/verify-ng-027-reader-callers.mjs` is ledger-locked (NG-027). Its hash changed, so the session ledger gate will now report a third changed locked test file until the owner re-locks it. The ledger was not touched.
2. **Two new literal brand rows** (`onorca`, `RealOrcaEnv`). The plan expected only count and file-set changes. The 60-04 rule requires a literal row for an in-word join, and the scan reported 22 such hits.
3. Inherited `ORCA_*` variables of this session (13 names) were unset for the Orca build, the faster build and every live row, per the plan's prohibition on passing them to an Orca process.

## Owner decisions

None asked. Recorded for the owner: re-lock of `scripts/verify-ng-027-reader-callers.mjs` (deviation 1).

## Deferred Verification: none (D-18; Phase 62 creates no human check)

## Self-Check: PASSED

The merge commits 791eb926 and bf05b8c5, the fix dc800b31 and the draft fcb2a1ab are ancestors of HEAD. The newest Orca build log holds both required lines. `OrcaService.sys.mjs` is packaged under `objdir/dist/bin`. `grep -c '# NEW (62-0' scripts/verify-platform.sh` prints 4.
