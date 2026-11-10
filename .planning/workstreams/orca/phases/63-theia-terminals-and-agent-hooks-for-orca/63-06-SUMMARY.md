---
phase: 63-theia-terminals-and-agent-hooks-for-orca
plan: 06
subsystem: shell
tags: [orca, orcad, bridge-folder, writePrivateFile, umask, boundary, EXT-02, verify-platform]
status: lane complete; the data-root literal join, the POWERBROWSER_ORCA_BRIDGE_DIR comparison and the brand rows are the coordinator's (63-04)

requires:
  - phase: 62-02
    provides: "OrcaEnv, OrcaService, PowerBrowserProcesses (spawnProcessExact, listProcessTree, addNamedReapBlocker), orca-service and its scenarios A to F"
provides:
  - "OrcaEnv: dataRootFor, nodePlatform, bridgeDirFor (<XDG_RUNTIME_DIR | HOME/.cache>/pb-orca-<12 hex>-bridge; <LOCALAPPDATA>\\pb-orca-<12 hex>-bridge), bridgeFileFor, ORCAD_DATA_ROOT_FILE = 'orcad-data-root'; ORCAD_FIXED_ENV_NAMES and buildOrcadEnv unchanged from Phase 62"
  - "PowerBrowserProcesses.writePrivateFile(dir, name, text) with the 67-RESEARCH A-11 order (no umask window) and PowerBrowserProcesses.platform(), nine INTERNAL-APIS.md rows"
  - "OrcaService: orcad-data-root written after ready and removed on stop; getState().bridgeDir; diagnostics row 'Orca bridge folder' ('not available' when null); a null folder is one log line, never a start failure"
  - "TheiaService: POWERBROWSER_ORCA_BRIDGE_DIR for the Theia backend (left out when the folder is null)"
  - "checks: orca-service scenario H, clause 10 (the key against orca-agents' backend) and 8 new plants; new quick rows orca-bridge-dir and orca-bridge-dir-self-test"
affects: [63-03, 63-04, 64, 67]

plan_head_before: 6861d390
actuals:
  tasks: 2
  commits: 3

key-files:
  created:
    - scripts/verify-orca-bridge-dir.mjs
  modified:
    - powerbrowser/shell/OrcaEnv.sys.mjs
    - powerbrowser/shell/OrcaService.sys.mjs
    - powerbrowser/shell/TheiaService.sys.mjs
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/verify-orca-service.mjs
    - scripts/verify-platform.sh

requirements-completed: []
---

# Phase 63 Plan 06: bridge folder and orcad-data-root (lane p63-06) Summary

PowerBrowser now hands chrome and the Theia backend one private bridge folder. OrcaService writes
`orcad-data-root` there after orcad is ready, through a boundary method that makes the file 0600
before it holds any byte, and removes it on stop. orcad's environment is still exactly what Phase 62
left it (D-31). Each of those facts is held by a check.

## Task Commits

1. **Task 1: tracer, orcad-data-root end to end on the chrome side.** `17105ba6`
   feat(63-06): bridge folder and orcad-data-root, writePrivateFile without the umask window, platform at the boundary
2. **Task 2: TheiaService key, orca-service clause 10, orca-bridge-dir, rows.** `ee7ebe1d`
   feat(63-06): TheiaService passes the bridge folder, orca-bridge-dir, orca-service key clause
3. **Lane summary.** This file, committed separately as docs(63-06).

## Carried from p63-05, and left behind (P63-34)

Read with `git show refs/heads/ServerDestroyer/p63-05:<path>` (commits fbf13072 and a251e808), then
written again on this lane's base. Nothing was merged or cherry-picked.

**Carried:**
- OrcaEnv's private `rootHashPrefix` helper shared with `aliasPathFor`, `isDrivePath`, `dataRootFor`,
  `nodePlatform`, `bridgeFileFor`, `ORCAD_DATA_ROOT_FILE`.
- `ptyBridgeDirFor`, renamed `bridgeDirFor`, with the suffix `-bridge` instead of `-pty` on every platform.
- `writePrivateFile`'s name check and `platform()`. The write body was replaced by the A-11 sequence.
- OrcaService's folder field, the write after ready, the removal in `_stopTree`, the getState field and the
  diagnostics row, renamed (`bridgeDir`, "Orca bridge folder").
- TheiaService's fault-tolerant helper (`_orcaBridgeDir()`), its conditional key and the header-comment line.
- orca-service's `readyLineDelivered` record, the stub `platform`/`writePrivateFile`, scenario A's write
  clauses, `backendEnvKeys` and clause 10, which now targets orca-agents.
- verify-orca-bridge-dir.mjs: its structure, platform and folder verdicts, and entry guard.

**Left behind (D-31):**
- `ORCAD_PTY_ENDPOINT_SWITCH` and its fixed-name entry, `PTY_BRIDGE_ENDPOINT_FILE`, `buildOrcadEnv`'s
  `ptyEndpoint` option and its absolute-path check, and `isAbsolutePath`.
- OrcaService's `ptyEndpoint` argument in `_spawnAndGate` and the fatal null-folder `_fail`.
- Scenario G (null daemon pid), the orca-hidden-electron `ptyEndpoint` edit, verify-orca-terminal-keys-live.mjs,
  the 63-05 full row, the darwin listen-path budget, and the endpoint.json cross-side join.

## Coordinator proof commands

After the 63-04 merge and builds, on the merged tree:

```sh
scripts/verify-platform.sh --only orca-service           # its PASS line must read "POWERBROWSER_ORCA_BRIDGE_DIR comparison compared"
scripts/verify-platform.sh --only orca-service-self-test
scripts/verify-platform.sh --only orca-bridge-dir        # its PASS line must read "data-root literal compared"
scripts/verify-platform.sh --only orca-bridge-dir-self-test
flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-agent-status-live   # lane p63-03's bridge-directory stage: mode 0700 folder, 0600 orcad-data-root, content
```

Read-only check run in this lane: `check()` from verify-orca-bridge-dir.mjs pointed at lane p63-03's
in-progress worktree (`../p63-03/theia/extensions/orca-agents`) returned `compared` with no failure. The
wrapper's `DATA_ROOT_FILE` and the protocol file's `ORCAD_DATA_ROOT_FILE` both read `orcad-data-root`, and
importing the wrapper printed nothing. The backend module did not exist there yet, so clause 10's
comparison was not tried against it.

## Merge note for the coordinator

- Merge this lane first. At the quick anchor (after the `orca-service-live-self-test|` row) this lane's
  `# NEW (63-06, ...)` block comes first, before p63-03's and the 63-04 block. This lane adds no full row.
- This lane also rewrote the orca-service comment block above the `orca-service|` row (scenario H, the
  bridge-folder clauses, 27 plants). If p63-03 edits the same comment, keep both statements.
- After any other edit to PowerBrowserAPI.sys.mjs, run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix`.
  This lane's nine rows cite lines 11026-11047, which are the last members of the end-of-file export. No
  existing catalogued line moved, because only the closing `});` line moved.
- No WINDOWS.md ids.
- `theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts` must read
  `POWERBROWSER_ENV['POWERBROWSER_ORCA_BRIDGE_DIR']`, either directly, through a dotted key, or through an
  identifier bound to that quoted string in the same file. Otherwise orca-service is red once the
  extension directory exists. The directory without that file is red, not a SKIP.
- **Brand rows needed** in `inventory/brand-tokens.json`. This lane did not edit it. Counts come from the
  scanner's own `claimOccurrences` over base versus lane, and they reconcile exactly with the scan's
  failures.
  - Add `powerbrowser/shell/TheiaService.sys.mjs` to `only_in` and `expected_files` of rows Orca, orca,
    ORCA and orcad.
  - Add `scripts/verify-orca-bridge-dir.mjs` to rows Orca, orca, ORCA, orcad and ORCAD.
  - Raise `expected_count` by this lane's deltas: Orca +63 (497 to 560), orca +93 (1050 to 1143),
    ORCA +18 (189 to 207), orcad +37 (684 to 721), ORCAD +24 (81 to 105), Orcad +6 (60 to 66).
  - p63-03's own deltas add on top of these.

  | File | Orca | orca | ORCA | orcad | ORCAD | Orcad |
  |---|---|---|---|---|---|---|
  | powerbrowser/shell/OrcaEnv.sys.mjs | | +2 | | +5 | +2 | |
  | powerbrowser/shell/OrcaService.sys.mjs | +10 | | | +3 | +1 | |
  | powerbrowser/shell/TheiaService.sys.mjs (new to the rows) | +10 | +5 | +1 | +1 | | |
  | powerbrowser/shell/PowerBrowserAPI.sys.mjs | +1 | | | +2 | | |
  | powerbrowser/INTERNAL-APIS.md | +3 | +3 | | +6 | | |
  | scripts/verify-orca-service.mjs | +24 | +30 | +11 | +9 | +12 | +6 |
  | scripts/verify-orca-bridge-dir.mjs (new file) | +13 | +46 | +5 | +8 | +9 | |
  | scripts/verify-platform.sh | +2 | +7 | +1 | +3 | | |
  | **Total** | **+63** | **+93** | **+18** | **+37** | **+24** | **+6** |

  Report: `.mozbuild/p63-06/brand-report.md` (ignored path). The scan reports 104 failures: 17
  condition-4 hits in TheiaService.sys.mjs, 81 in verify-orca-bridge-dir.mjs, and 6 held-back count
  mismatches. `scan-brand-residue-self-test` is red only because its clean-root control scans the tree;
  it goes green once the rows above land.

## Decisions Made

- **Null folder before resolve.** The "Orca bridge folder" row is left out until `_resolve` has set the
  data root, and reads "not available" after that when no folder could be chosen. Before a start, a
  "not available" row would have suggested a failure that did not happen.
- **"pty switch" clause.** orca-service fails when any fixed name matches `/PTY/i` or `buildOrcadEnv`'s
  source mentions `pty`. This is a pattern rule, not a hand-kept list of names. The Task 1 verify command
  also compares ORCAD_FIXED_ENV_NAMES with the base byte for byte.
- **Protocol literal read by regex, not by the TypeScript transpiler.** The literal is one
  `export const ORCAD_DATA_ROOT_FILE = '...'` line. A regex reads it without depending on
  theia/node_modules. The wrapper is imported, as the plan says.
- **writePrivateFile uses one `posix` constant** for both mode changes. AppConstants then appears on a
  single line, which needs one catalogue row instead of two.

## Deviations from Plan

1. **Separate summary commit.** The plan folds the SUMMARY into Task 2's commit. It is committed on its
   own so that it can name Task 2's hash.
2. **Two "pty switch" plants instead of one.** One plant adds a name to the fixed names and the other adds
   the option to `buildOrcadEnv`. The plan lists them together, and each one is now proven separately.
   orca-service now has 27 plants: 19 from Phase 62 and 8 from this lane.
3. **Setup 2.** upstream/ was cloned with `--depth 1 --branch FIREFOX_153_5_1esr_RELEASE` from the
   integration workspace's local upstream. `fetch-upstream.sh` then confirmed it pristine at the pin, and
   all 8 patches applied.

## Verification

- Task 1 rows green: orca-service, orca-service-self-test (27 plants), orca-hidden-electron-self-test,
  orca-service-live-self-test, internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines,
  ng-027-reader-callers. The fixed names equal the base, the folder is
  `/run/user/1000/pb-orca-<12 hex>-bridge`, and the literal is `orcad-data-root` (exit 0).
- Task 1 criteria: only the closing line of PowerBrowserAPI.sys.mjs moved (`cmp` exit 0).
  `--fix` followed by `git diff --quiet INTERNAL-APIS.md` exits 0 on the committed tree. OrcaEnv has 0
  non-comment PTY spellings. The PASS line names A, B, C, D, E, F, H.
- Task 2 rows green: orca-bridge-dir, orca-bridge-dir-self-test (10 `  ok` lines, last line
  `orca-bridge-dir self-test: PASS`), orca-service, orca-service-self-test, start-path-recovery(-self-test),
  shell-error-contract(-self-test), shell-error-copy-no-internals, sidecar-reap-blocker, internals-boundary.
  `--nope` exits 2. `grep -c '# NEW (63-06'` prints 1.
- In this lane, orca-service prints "POWERBROWSER_ORCA_BRIDGE_DIR comparison SKIP (lane p63-03 not
  merged)", and orca-bridge-dir prints "data-root literal SKIP (lane p63-03 not merged); writePrivateFile
  order ok".
- The lane diff against the base lists only files_modified paths.
- `scripts/verify-platform.sh --quick` had 6 red rows:
  - scan-brand-residue and scan-brand-residue-self-test: the brand rows above, which belong to the
    coordinator.
  - gui09-dependent-window-content, tab-uris-typecheck and chrome-bar-typecheck: they need built Theia
    `lib/` output, and this lane does no Theia build.

## Not verified

- Modes and content on disk (0700 folder, 0600 file, no readable byte during the write). Those belong to
  the live row orca-agent-status-live on the merged tree, built by lane p63-03. This lane checks the call
  order statically.
- Windows behaviour beyond path strings. No Windows build exists.

## Self-Check: PASSED
