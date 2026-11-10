---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
plan: 10
subsystem: release workflow, Windows packaging, signing list, shell services
tags: [orca, windows, release.yml, packaging, signing, PLAT-01]
status: complete
requires:
  - "lane p68-01 scripts/verify-orca-packaged-tree.mjs (called from package-windows.sh) and its portable build-orca.sh (run by windows-orca)"
  - "lane p68-04 verify-licence-allowlist.mjs --rulings (called from build-windows)"
provides:
  - "windows-orca hosted job and its sums_sha256 output"
  - "build-windows Orca needs edge, --rulings guard, Orca download, source fetch and container env"
  - "package-windows.sh <GreD>/orca admission, staging, packaged-tree check and purge"
  - "build-windows-shape rule 11 over a producer list, with the producer-to-script admission join"
  - "win-sign-list.mjs Orca PE set from the admitted SHA256SUMS (--orca-sums); @ admitted"
  - "Windows staged Node (<appDir>/node/node.exe) in OrcaService and TheiaService"
affects: [68-06, 68-01, 68-07]
tech-stack:
  added: []
  patterns:
    - "hosted native build admitted by an out-of-band SHA256SUMS digest (windows-sidecar shape), now a producer list"
    - "derived join between the job graph and the packaging script's admission order"
key-files:
  created: []
  modified:
    - .github/workflows/release.yml
    - powerbrowser/packaging/package-windows.sh
    - scripts/verify-build-windows-shape.mjs
    - scripts/win-sign-list.mjs
    - scripts/verify-win-sign-chain.mjs
    - powerbrowser/shell/OrcaService.sys.mjs
    - powerbrowser/shell/TheiaService.sys.mjs
decisions:
  - "sign-windows needs windows-orca and admits its SHA256SUMS itself, because the stage carries no SHA256SUMS and the sign list must read an admitted one"
  - "build-windows fetches the pinned Orca source (no build) because orca-packaged-tree reads Orca's artifact tables from orca/src"
  - "The windows-orca corepack step is a gate only (no npm install), as lane p68-01 found zizmor requires"
  - "Orca PE files are .exe/.dll names plus MZ-magic files, so orcad's .node addons are signed"
metrics:
  duration: "about 1 h 25 min (setup including the Firefox clone, three tasks, wrap-up)"
  completed: 2026-11-10
actuals:
  tokens: 19200
  tasks: 3
  commits: 3
plan_head_before: 21ee66dc19e2199d132ee1876be336c26d9bde30
plan_head_after: 1e64de5d6a16eb236fb51a7963cf3b4362de13fa
---

# Phase 68 Plan 10: Windows artifact with Orca Summary

Windows releases now carry orcad and the overlaid web client at `<GreD>/orca`. A hosted windows-latest
job builds the tree, so node-pty is compiled on its own target. build-windows admits that tree by an
out-of-band digest before staging it. Its PE files are signed from the admitted SHA256SUMS, and both
services find the staged `node/node.exe`. No Linux-path job waits on any of it.

`commits: 3` counts the three code commits before this SUMMARY's own commit, measured with
`git rev-list --count 21ee66dc..1e64de5d`.

BLOCKER: macos-package-payload-self-test (quick) goes red on this lane. scripts/verify-macos-package-payload.mjs
rule 8 derives every `${appDir}/...` literal in TheiaService.sys.mjs as a path that must exist in the
macOS bundle. It now finds the Windows-only `node/node.exe` candidate that P68-32 requires. That file
is outside this lane's files_modified, so the fix is the coordinator's. The one-line fix was proven on
this tree and then reverted: with it, `node scripts/verify-macos-package-payload.mjs --self-test` prints
`PASS -- 18 planted faults went red naming their drift, and the control stayed green`. The fix:

```diff
-    const staged = [...new Set([...svc.matchAll(/\$\{appDir\}\/([A-Za-z0-9_./-]+)`/g)].map(m => m[1]))].sort();
+    // A .exe candidate is the Windows staged layout (package-windows.sh), never part of a macOS bundle.
+    const staged = [...new Set([...svc.matchAll(/\$\{appDir\}\/([A-Za-z0-9_./-]+)`/g)].map(m => m[1]).filter(p => !p.endsWith(".exe")))].sort();
```

Every task was completed before this blocker was recorded. Nothing else is held back.

## Commits

| Task | Commit | Content |
|------|--------|---------|
| 1 | d2e7e4a7 | windows-orca job; build-windows needs, --rulings guard, Orca download, Orca source fetch, container env; package-windows.sh Orca admission, staging, packaged-tree check, purge; build-windows-shape rule 11 over the producer list |
| 2 | 30d6c9b4 | sign-windows zip filter admits @; sign-windows downloads and admits windows-orca and passes `--orca-sums`; win-sign-list.mjs Orca PE set; win-sign-chain pinned filter and refusal checks |
| 3 | 1e64de5d | staged Windows Node in OrcaService._resolve and TheiaService._resolveSidecar |
| 3 | (this commit) | 68-10-SUMMARY.md |

## windows-orca (release.yml, directly after windows-sidecar)

- Runs on windows-latest with timeout-minutes 90, `contents: read`, no secret, no environment and no
  needs. Its default shell is bash, and it exposes `outputs.sums_sha256` from `steps.sums`.
- Its gates are copied from windows-sidecar: the ref/event refusal, the full-SHA gate, checkout with
  `persist-credentials: false`, and the node-runtime.json win32-x64 read with `actions/setup-node`
  (same SHA pins).
- The pre-build steps run in this order. `git config --global core.longpaths true` and
  `core.autocrlf false`. A corepack 0.34.5 or later gate, which is a check only: the pinned Node
  bundles corepack 0.35.0, and lane p68-01 found that zizmor refuses an ad-hoc npm install.
  `rustup target add x86_64-pc-windows-msvc`. The pins fragment through `emitUpstreamPins`. Then
  `fetch-orca.sh` and `build-orca.sh`.
- The job stages `$RUNNER_TEMP/windows-orca` in the hosted Orca artifact layout: package.json,
  out/orcad, out/web, orcad-prebuilds-manifest.json, BUILD_ROOT, and a SHA256SUMS written with the
  windows-sidecar command. It admits that tree with `check-win-sidecar.sh check`, purges package.json
  and out/ with `check-win-sidecar.sh purge`, and writes `sha256=` to GITHUB_OUTPUT. It uploads the
  artifact `windows-orca` with include-hidden-files, if-no-files-found error, retention-days 1 and
  overwrite true.
- Only build-windows and sign-windows need it. win-sign-chain's independence rule classifies it as a
  Windows job by derivation, because its artifact name matches /windows/.

## build-windows-shape: rules and plants

Rule 11 now holds a producer list: windows-sidecar (PB_WIN_SIDECAR_SUMS_SHA256, PB_WIN_SIDECAR_DIR) and
windows-orca (PB_WIN_ORCA_SUMS_SHA256, PB_WIN_ORCA_DIR). It checks the following, and every red carries
the producer's name as its rule:

- build-windows needs exactly the producer list, and reads no `needs.<x>` from a job outside it.
- The staging step reads each digest only from `needs.<producer>.outputs.sums_sha256`, never from
  `vars.`, and no other value is read from that producer.
- The staging step passes `-e <DIR>=/src/<producer>` and `-e <DIGEST>` into the container.
- The download lands in a path equal to the producer name, before the staging step.
- The producer job has the trust shape: windows-latest, `contents: read`, no environment, secret or
  needs, the sums_sha256 output, a sums step that runs check, purge and GITHUB_OUTPUT, BUILD_ROOT, the
  ref guard first, one upload with retention 1, pinned actions, and no fail-open step.
- **Join:** in package-windows.sh, the variable assigned from `${<DIR>:-}` must be admitted by a
  `check-win-sidecar.sh check "$VAR"` line naming `<DIGEST>`. That line must come before the first `cp`
  from that variable, and a script with no such `cp` is red as vacuous.

Self-test: 64 planted faults, each red naming the producer or the rule. The plants added in this lane:

- Needs: "a third needs edge", "needs removed" and "needs drops windows-orca".
- For each producer:
  - the digest route: digest from `vars.`, another needs value read, download removed, downloaded
    elsewhere, directory not passed into the container;
  - the job's trust shape: moved to legion, holds a secret, holds an environment, granted contents
    write, waits on a legion job, digest output removed;
  - the job's steps: skips its own admission check, writes no BUILD_ROOT, upload retention raised,
    action unpinned, job removed.
- Against package-windows.sh:
  - "copies from the Orca directory before admitting it";
  - "copies from the sidecar directory before admitting it";
  - "admits the Orca directory against the sidecar digest";
  - "never copies from the Orca directory (vacuous admission order)".

PASS lines:
- `build-windows-shape: PASS -- ... the needs edges are exactly the hosted producers windows-sidecar and windows-orca, each digest output is the only value read from its producer and reaches the container beside the producer's directory, and package-windows.sh admits each producer's directory against that digest before its first copy from it; uploads keep retention-days 1 (17 step(s) checked).`
- `build-windows-shape: --self-test PASS -- the unmodified build-windows job is green and 64 planted faults each went red naming the file, the job and the cause.`

## package-windows.sh

- `ORCA_DIR` is read from `PB_WIN_ORCA_DIR`. When it is unset, the script fails with "PB_WIN_ORCA_DIR is
  unset; point it at the windows-latest windows-orca artifact (never a legion build)". It also requires
  `out/orcad/orcad.js`.
- `check-win-sidecar.sh check "$ORCA_DIR" "${PB_WIN_ORCA_SUMS_SHA256:-}"` runs right after the
  sidecar's check (line 45), before any staging. The first copy from `$ORCA_DIR` is at line 82.
- After the node staging, `$STAGE/orca` is recreated and receives package.json, out/orcad and out/web.
  The script then runs `verify-orca-packaged-tree.mjs --target win64 --built "$ORCA_DIR" --stage
  "$STAGE/orca" --prebuild-manifest "$ORCA_DIR/orcad-prebuilds-manifest.json"` and fails the stage
  when it exits non-zero. Last, it runs `check-win-sidecar.sh purge "$ORCA_DIR" "$STAGE/orca"`. The
  manifest, BUILD_ROOT and SHA256SUMS are never copied into the stage.
- The existing natives gate walks `$STAGE`, so `orca/` is inside its universe.

## Sign list

- sign-windows zip filter: `r'^[A-Za-z0-9@._/-]+$'`. The `..`, leading-slash and symlink refusals are
  unchanged, and win-sign-chain now requires all three.
- win-sign-list.mjs: NAME_RE admits @, and a `..` segment or a leading slash is still refused. A new
  `--orca-sums FILE` argument supplies the admitted SHA256SUMS. Under `orca/`, the required set is every
  SUMS path ending .exe or .dll, plus every SUMS path whose staged file starts with MZ. The actual set is
  every file under orca/ that has one of those names or starts with MZ. The two sets are compared:
  each extra file and each missing file is red, naming it. PE files under orca/ with no `--orca-sums`
  are red. The theia/ and node/ rules are unchanged.
- Self-test plants:
  - an Orca PE file not in the SUMS (`extra: orca/out/orcad/implant.dll`);
  - a SUMS PE file absent from the tree (`missing: orca/out/orcad/bin/orca.exe`);
  - a `..` path in the SUMS (refused);
  - Orca PE files with no SUMS (refused);
  - the @ control: `orca/out/orcad/node_modules/@parcel/watcher/watcher.node` is listed;
  - the name rule (`..` and a leading slash refused, @ admitted).
  The self-test prints 14 lines starting "  ok ".
- verify-win-sign-chain.mjs: pins the new filter text. Its header names the @ admission and the reason
  for it. New plants: "zip entry name check back to the filter that refuses @" and "zip entry ..
  refusal removed". The self-test reports `PASS -- three controls green ... and 48 planted faults`.

## Service change (P68-32)

OrcaService._resolve and TheiaService._resolveSidecar each try `<appDir>/node/bin/node` first, then
`<appDir>/node/node.exe`, both through the existing `PowerBrowserAPI.pathExists`, before the existing
pref-or-PATH fallback. The `powerbrowser.sidecar.nodePath` user-value override is unchanged. One comment
line in each service states the Windows layout, and the D-14 comment in OrcaService is kept. The
OrcaService hunk lies inside `_resolve` only. No new boundary method was added, `ng-040` passed without
`--fix`, and INTERNAL-APIS.md is unchanged.

## Check results (this host, lane tree)

| Row | Result |
|-----|--------|
| build-windows-shape, build-windows-shape-self-test | PASS, PASS |
| win-sidecar-check-self-test | PASS |
| workflows, zizmor, release-shape | PASS |
| win-sign-list-self-test, win-sign-chain-self-test | PASS, PASS |
| win-sign-chain (full) | PASS; the failure set is empty, equal to the baseline's |
| orca-service, orca-service-self-test | PASS, PASS (the pinned-source clauses ran; orca/ was fetched) |
| internals-boundary, ng-040-internals-catalogue-lines | PASS, PASS |
| shell-error-copy-no-internals, start-path-recovery | PASS, PASS |
| bash -n package-windows.sh | exits 0 |

`--quick` was compared with the Setup baseline. The baseline's reds are unchanged:
gui09-dependent-window-content and its self-test, ng086-theia-react-node, and single-copy-deps. The
last two are environmental, because theia/node_modules in this worktree is a symlink to the
integration worktree's copy. There are three new reds:
- scan-brand-residue and scan-brand-residue-self-test. These are expected: every failure is condition
  4 in this lane's files, and the coordinator re-measures.
- macos-package-payload-self-test. This is the BLOCKER above.

344 rows PASS.

## Brand report excerpt

The report is at `.mozbuild/p68-10/brand-report.md` (`node scripts/scan-brand-residue.mjs --report`,
which exits 1 with 278 reconciliation failures). Every failure is condition 4 ("matched probe orca
but no inventory row claimed it") in this lane's files. The report states that the held-back rows are
intact (34 rows checked). inventory/brand-tokens.json was not edited.

| File | orca | Orca | ORCA |
|------|------|------|------|
| .github/workflows/release.yml | 56 | 24 | 5 |
| powerbrowser/packaging/package-windows.sh | 28 | 6 | 19 |
| scripts/verify-build-windows-shape.mjs | 4 | 6 | 19 |
| scripts/verify-win-sign-chain.mjs | 0 | 1 | 0 |
| scripts/win-sign-list.mjs | 78 | 23 | 9 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] build-windows fetches the pinned Orca source**
- **Found during:** Task 1
- **Issue:** verify-orca-packaged-tree.mjs (lane p68-01) imports Orca's artifact tables from
  `orca/src/shared/orcad-artifacts.ts` through `scripts/lib/orca-artifacts.mjs`, and throws when the file
  is absent. build-windows never had an orca/ checkout, so the staging check would fail in every release.
- **Fix:** build-windows gained a step "Fetch the pinned Orca source for the artifact tables the staging
  check reads" (`bash scripts/fetch-orca.sh`, under the key gate). It sits after the downloads and before
  staging, and nothing is built from it.
- **Commit:** d2e7e4a7

**2. [Rule 2 - Missing critical] sign-windows reads an admitted Orca SHA256SUMS**
- **Found during:** Task 2
- **Issue:** The plan's Task 2 edits only the zip regex in release.yml. However, the stage carries no
  SHA256SUMS, so win-sign-list.mjs cannot read an admitted SUMS unless sign-windows supplies one.
  Without one, every signing run would refuse the Orca PE files as extra.
- **Fix:** sign-windows now needs `[build-windows, windows-orca]`. It downloads windows-orca (under the
  signing gate) and runs `check-win-sidecar.sh check windows-orca "$PB_WIN_ORCA_SUMS_SHA256"` with the
  digest from `needs.windows-orca.outputs.sums_sha256`. It then passes `--orca-sums
  windows-orca/SHA256SUMS`. Merge rule (2c) assigns sign-windows to this lane. win-sign-chain stays
  green: no GITHUB_OUTPUT write was added and independence still holds.
- **Commit:** 30d6c9b4

**3. [Rule 2] win-sign-chain asserts the traversal and symlink refusals**
- The plan requires that the @ admission keep the `..`, leading-slash and symlink refusals. win-sign-chain
  now requires all three strings in the admission step, with a plant for a removed `..` refusal.
- **Commit:** 30d6c9b4

**4. [Process] Commit split for Task 3**
- The service change (1e64de5d) and this SUMMARY are separate commits rather than one, so that the code
  commit exists before the SUMMARY measures it.

**5. [Process] Setup order**
- The first release.yml edit was made before the baseline. It was set aside in the scratchpad and the
  file restored, so the baseline ran on the unmodified tree. The first baseline run went red on js-yaml
  because theia/node_modules was absent, so theia/node_modules and
  theia/applications/browser/node_modules were symlinked from the integration worktree (an ignored
  path, same lockfile) and the baseline was re-run.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-needs-edge | .github/workflows/release.yml | sign-windows (environment release, id-token write) now needs windows-orca and reads its artifact as data. The artifact is admitted by digest and nothing in it is executed; its SHA256SUMS only selects which staged files are signed |

## Not run, deferred

- Hosted windows-orca and every hosted step are shape-checked only (build-windows-shape, release-shape,
  workflows, zizmor, win-sign-chain). Their first real run is deferred to the end-of-milestone pass,
  after main is pushed. Unproven assumptions:
  - Git Bash handles `$RUNNER_TEMP` paths.
  - Orca's Windows bundles carry no `$GITHUB_WORKSPACE` string that the purge would refuse.
  - build-orca.sh needs p68-01's portability fixes, which are absent from this lane's base.
- package-windows.sh's Orca path was checked only with `bash -n` and the shape row. A run needs
  `mach package` and the hosted artifact.

Merge note for the coordinator: merge after p68-01 and before p68-07 (package-windows.sh calls p68-01's verify-orca-packaged-tree.mjs; windows-orca runs p68-01's portable build-orca.sh; OrcaService._resolve here, OrcaService._spawnAndGate in p68-07, merge rule (2b)); release.yml carries windows-orca after windows-sidecar and the build-windows and sign-windows edits, while p68-01 owns build-linux and the appended macOS jobs (merge rule (2c)); this lane adds no registry block; brand rows for release.yml and the changed scripts are the coordinator's to measure; hosted Windows runs are shape-checked only, first real run deferred.

Additional merge notes:
- Apply the BLOCKER's one-line fix to scripts/verify-macos-package-payload.mjs when merging, or
  macos-package-payload-self-test stays red.
- After p68-01 merges, re-run release-shape: its linux-independence rule exempts every job whose name
  contains "windows", so sign-windows' new needs on windows-orca is admitted.

## Self-Check: PASSED

- Modified files exist; commits d2e7e4a7, 30d6c9b4 and 1e64de5d are on HEAD.
