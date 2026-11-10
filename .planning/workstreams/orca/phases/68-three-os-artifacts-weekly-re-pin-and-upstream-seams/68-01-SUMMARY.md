---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
plan: 01
subsystem: packaging, release workflow, checks
tags: [orca, packaging, release.yml, macos, linux, flatpak, PLAT-01, PLAT-02]
status: complete
requires:
  - "orca/ built at the pin (fetch-orca.sh, build-orca.sh)"
  - "lane p68-04 verify-licence-allowlist.mjs --rulings (called from release.yml only)"
  - "lane p68-02 pairWebTab/deriveMarker exports (orca-packaged-live live path only)"
provides:
  - "<GreD>/orca staging in package-linux.sh and package-macos.sh"
  - "orca-packaged-tree, orca-packaged-live, build-orca-portable, orca-macos-merge checks"
  - "macos-orca-arm64, macos-orca-x64, macos-orca-universal release.yml jobs"
  - "build-linux Orca build, --rulings guard, PB_HOST_ROOT"
  - "magic-based package-target-natives universe"
  - "Flatpak --filesystem=home"
affects: [68-06, 68-10, 68-02, 68-04]
tech-stack:
  added: []
  patterns:
    - "hosted native build admitted by an out-of-band SHA256SUMS digest (windows-sidecar shape)"
    - "merge plan derived from Orca's own TypeScript tables by Node type stripping"
    - "native universe judged by magic bytes, not names"
key-files:
  created:
    - scripts/verify-orca-packaged-tree.mjs
    - scripts/verify-orca-packaged-live.mjs
    - scripts/verify-build-orca-portable.mjs
    - scripts/lib/orca-artifacts.mjs
  modified:
    - .github/workflows/release.yml
    - powerbrowser/packaging/package-linux.sh
    - powerbrowser/packaging/package-macos.sh
    - scripts/build-orca.sh
    - scripts/verify-package-target-natives.mjs
    - scripts/verify-release-shape.mjs
    - scripts/verify-flathub-manifest.mjs
    - flatpak/org.debios.PowerBrowser.json
    - docs/BUILD.md
    - scripts/verify-platform.sh
decisions:
  - "Linux-independence rule exempts every job whose name contains 'windows' (not only windows-* and build-windows), so sign-windows and publish-windows may wait on windows-orca after p68-10 merges"
  - "The corepack step is a gate only: the pinned Node v24.19.0 bundles corepack 0.35.0, and zizmor refuses an npm install outside a lockfile"
  - "In a win64 stage an i386 .exe outside orca/ (the NSIS installer helper) is not examined; under orca/ every PE must be PE32+ x86-64"
  - "orca-packaged-live pairs against a second orcad started from the packaged tree, because OrcaService.getState exposes no pairing offer"
metrics:
  duration: "about 3 h across two agents (lane agent 09:00-09:51 for Task 1, then 11:28-12:05 for Tasks 2 and 3)"
  completed: 2026-11-10
actuals:
  tokens: 35500
  tasks: 3
  commits: 3
plan_head_before: 142d6212a3b0026d4ea8b66276164fb61d28218e
plan_head_after: 5edf17c3229a80d610edf4c99a7be5599ccda9c6
---

# Phase 68 Plan 01: Linux and macOS artifacts with Orca Summary

Linux and macOS packages carry orcad and the overlaid web client at `<GreD>/orca`. Each target's
node-pty slot is built on that target's own runner and proven by Orca's prebuild manifest. Three
hosted macOS jobs build, admit and lipo-merge the Orca trees, and no Linux-path job waits on them.
Every artifact check is one registry row with a planted-fault self-test.

`commits: 3` counts the code commits before this SUMMARY's own commit (measured with
`git rev-list --count 142d6212..5edf17c3`). No plan ledger file existed when this agent took over,
so `plan_head_before` is the lane's base commit.

## Commits

| Task | Commit | Content |
|------|--------|---------|
| 1 | 071d6f67 | package-linux.sh Orca staging, RUNPATH strip, PB_HOST_ROOT grep, `--orca-stage-only`; orca-artifacts.mjs tables; verify-orca-packaged-tree.mjs; build-linux steps; release-shape rule 12 (`orca-steps`); registry quick and full rows (lane agent) |
| 2 | 8f315533 | build-orca.sh portability and verify-build-orca-portable.mjs; macosMergePlan and its CLI and self-test; package-macos.sh `orca-universal` and per-arch Orca staging; the three macOS jobs; release-shape rules 13 (`macos-orca`) and 14 (`linux-independence`); magic natives; two quick rows |
| fix + 3 | 5edf17c3 | corepack gate without an ad-hoc install (zizmor). Because those files were already staged, this commit also carries Task 3's Flatpak grant and plant, verify-orca-packaged-live.mjs, BUILD.md and the packaged-live rows. See Deviations 4 |
| 3 | (this commit) | 68-01-SUMMARY.md |

## The three macOS jobs (appended after channel-live-windows)

- `macos-orca-arm64` (macos-15, node-runtime.json key darwin-arm64) and `macos-orca-x64`
  (macos-15-intel, darwin-x64). These are two named jobs, not a matrix. Each has timeout 90,
  `contents: read`, no secret, no environment, `persist-credentials: false`, the ref/event refusal
  and the full-SHA gate, and Node from the pin through setup-node. They also run a bash >= 4 gate,
  a corepack >= 0.34.5 gate, the pins fragment via `emitUpstreamPins`, `fetch-orca.sh` and
  `build-orca.sh`. Each stages the hosted layout and runs `orca-packaged-tree --target macos-<arch>
  --prebuild-manifest` before adding the manifest copy, BUILD_ROOT and SHA256SUMS (`shasum -a 256`).
  The `sums_sha256` output carries the digest, and the upload uses retention 1.
- `macos-orca-universal` (ubuntu-latest) needs both thin jobs. It runs Node from the linux-x64 pin
  and fetches Orca's source for the tables only. It resolves llvm-lipo and installs `llvm` only when
  no llvm-lipo exists. It downloads both artifacts, admits each with `check-win-sidecar.sh check`,
  runs `package-macos.sh orca-universal` and purges both BUILD_ROOTs. It then runs
  `orca-packaged-tree --target macos --built/--also-built` and `package-target-natives --target
  macos`. It has no upload and no consumer.
- build-linux's `needs` is unchanged (none). No existing job's `needs` changed.

## Rows and their PASS lines (this host, lane tree)

| Row | Tier | Result |
|-----|------|--------|
| orca-packaged-tree-self-test | quick | PASS (12 `ok` lines, 8+ planted faults) |
| build-orca-portable-self-test | quick | PASS -- the real script is green and 4 planted faults each went red naming scripts/build-orca.sh and the line |
| orca-macos-merge-self-test | quick | PASS -- 4 planted faults each went red naming the drift (2 pairs from the real orca/ tables: ripgrep/darwin-arm64/rg, agent-browser-darwin-arm64) |
| orca-packaged-live-self-test | quick | PASS -- every control green and every planted fault went red naming the drift |
| package-target-natives-self-test | quick | PASS (new: unnamed thin Mach-O under orca/ for macos, unnamed ELF spawn-helper and PE32 helper.exe under orca/ for win64; universal control green) |
| release-shape / release-shape-self-test | quick | PASS / PASS (78 workflow faults, 6 new for 68-01 Task 2) |
| workflows, zizmor, win-sign-chain-self-test | quick | PASS |
| flathub-manifest / -self-test | quick | PASS / PASS (new plant "home filesystem grant removed" red naming "lacks --filesystem=home") |
| win-sign-chain | full | PASS |
| orca-packaged-tree | full | FAILs naming the container build (no tarball on this host, expected until 68-06) |
| orca-packaged-live | full | FAILs naming the container build (no tarball), expected until 68-06 |
| mar-update-hop | full | FAIL: no MAR-hop evidence under .mozbuild/mar-hop (environmental, unrelated to this lane) |
| channel-live | full | FAIL: no published Release (environmental, unrelated to this lane) |

Stage proof (Task 1 verify, re-run after the magic natives change):
`PB_HOST_ROOT="$PWD" nix shell --inputs-from . nixpkgs#patchelf --command bash powerbrowser/packaging/package-linux.sh --orca-stage-only "$T"`
gave `orca-packaged-tree: PASS -- 1590 files equal the built tree (linux-x64), node-pty slot
linux-x64-glibc built on linux-x64` and `verify-package-target-natives: PASS -- 4 native(s) match
--target linux-x64`. That is 4 natives now, because the magic universe adds the unnamed
`agent-browser-linux-x64`. readelf on the staged pty.node shows no RUNPATH or RPATH.

`--quick` compared with the Setup baseline. The baseline's red rows were gui09-dependent-window-content,
its self-test, tab-uris-typecheck and chrome-bar-typecheck, and they are unchanged. New reds:
scan-brand-residue and scan-brand-residue-self-test. Both are expected: the self-test also runs the
gate over the tree, and that gate is red only on the unmeasured Orca tokens in this lane's files.
343 rows PASS.

Lane scope check (Task 3 verify 2): the diff from the merge base is exactly the 14 code paths in
files_modified, so it exits 0.

## Fixture lipo merge (Task 2 acceptance)

The fixture builder is the scratch script `mkfix.mjs`. It writes two synthetic thin Mach-O trees.
Each holds `package.json`, `out/web/index.html` (identical in both), one arch-named pair from the
real tables (`out/orcad/ripgrep/darwin-arm64/rg` and `darwin-x64/rg`) and one same-name native
(`out/orcad/node_modules/node-pty/build/Release/pty.node`). It was then run with:

```
nix develop .#firefox-macos --command bash -c 'LIPO=llvm-lipo bash powerbrowser/packaging/package-macos.sh orca-universal <fix>/arm <fix>/x64 <fix>/out; node scripts/verify-package-target-natives.mjs --target macos --stage <fix>/out'
```

Result: `package-macos: orca-universal wrote <fix>/out (1 arch-named pair(s), 1 in-place merge(s))`.
llvm-lipo reports `x86_64 arm64` for both rg names and for pty.node.
`verify-package-target-natives: PASS -- 3 native(s) match --target macos (Mach-O universal)`.
After an orcad.js was added to the fixture, `orca-packaged-tree --target macos --built arm
--also-built x64 --stage out` printed `PASS -- 6 files equal the built tree (macos)`.
`bash -n powerbrowser/packaging/package-macos.sh` exits 0.

## Brand report excerpt

The report is at `.mozbuild/p68-01/brand-report.md`, produced by
`node scripts/scan-brand-residue.mjs --report`, which exits 1. All 665 failures are condition 4
("matched probe orca but no inventory row claimed it") in this lane's files, plus four held-back row
totals. inventory/brand-tokens.json was not edited.

Held-back totals (expected -> observed): `Orca` 497 -> 515, `orca` 1050 -> 1111, `ORCA` 189 -> 192,
`orcad` 684 -> 696.

Unclaimed occurrences per file and token:

| File | orca | Orca | ORCA |
|------|------|------|------|
| .github/workflows/release.yml | 105 | 24 | 0 |
| powerbrowser/packaging/package-linux.sh | 42 | 6 | 0 |
| powerbrowser/packaging/package-macos.sh | 68 | 17 | 18 |
| scripts/lib/orca-artifacts.mjs | 55 | 12 | 13 |
| scripts/verify-orca-packaged-tree.mjs | 69 | 4 | 8 |
| scripts/verify-orca-packaged-live.mjs | 65 | 16 | 3 |
| scripts/verify-release-shape.mjs | 74 | 27 | 0 |
| scripts/verify-package-target-natives.mjs | 18 | 1 | 0 |
| scripts/verify-build-orca-portable.mjs | 11 | 3 | 0 |
| scripts/verify-flathub-manifest.mjs | 0 | 1 | 0 |
| docs/BUILD.md | 0 | 0 | 1 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Linux-independence rule scope**
- **Found during:** Task 2 (6)
- **Issue:** As worded, the rule exempts only jobs starting with windows- or macos- and build-windows, and it follows needs transitively. Once p68-10 makes build-windows need windows-orca, sign-windows (needs build-windows) and publish-windows would go red, which contradicts "holds with or without windows-orca".
- **Fix:** A Linux-path job is any job whose name neither contains "windows" nor starts with "macos-". The closure over the parsed needs graph must reach no windows-orca or macos-orca-*. Plants: "build-linux needs windows-orca" (direct) and "sign-publish needs macos-orca-universal" (transitive, naming all three macOS jobs).
- **Files:** scripts/verify-release-shape.mjs. **Commit:** 8f315533

**2. [Rule 2 - Missing critical] macOS job trust shape asserted, not only matrix and digest**
- **Found during:** Task 2 (6)
- **Fix:** Rule 13 (`macos-orca`) also reds on an environment, permissions other than {contents: read}, a secrets reference, continue-on-error at job or step level, and a checkout without persist-credentials: false. This covers the plan's prohibitions. Plants were added for continue-on-error and for a secret.
- **Commit:** 8f315533

**3. [Rule 1 - Bug] corepack install refused by zizmor**
- **Found during:** Task 3 wrap-up (`--quick`)
- **Issue:** zizmor `adhoc-packages` reds `npm install ... corepack@0.35.0` outside a lockfile, and the row says never to suppress it.
- **Fix:** The pinned Node v24.19.0 bundles corepack 0.35.0 (read from the pinned linux-x64 archive), so the install branch could never run. The step is now a gate that fails with a Next step naming the Node pin.
- **Commit:** 5edf17c3

**4. [Process] Task 3 files landed in the fix commit**
- Task 3's files were staged when the corepack fix was committed, so commit 5edf17c3 carries them with a message that names only the fix. No amend was made, because the lane rules forbid it. This SUMMARY's commit is Task 3's remaining part.

**5. [Rule 3 - Blocking] package-target-natives magic universe versus the NSIS helper**
- The existing self-test pins that a 32-bit installer helper .exe is not examined, and the real win64 Gecko stage carries an i386 `uninstall/helper.exe`. A pure magic universe would red every Windows stage. Fix: in a win64 stage, an i386 .exe outside `orca/` (other than node.exe and rg.exe) is skipped. Under `orca/` every PE is judged, which is the plan's PE32 plant. The universe is magic files plus native-named files, so a truncated or text `.node` stays red.
- **Commit:** 8f315533

**6. [Rule 3 - Blocking] orca-packaged-live pairing source**
- OrcaService.getState carries no pairing offer, so a web tab cannot pair with the PowerBrowser-spawned orcad. The live path checks exe, root and survivors on the spawned orcad. It then pairs through a second orcad that `lib/orca-run.mjs startOrcad` starts on the packaged `node/bin/node` and `<prefix>/orca`. The export of pairWebTab and deriveMarker is confirmed in the module text before the dynamic import, because importing the current module, which has no entry-point guard, would run its own check.
- **Commit:** 5edf17c3

**7. [Minor] universal job additions**
- macos-orca-universal sets up Node from the linux-x64 pin, because type stripping needs Node 24 and the runner default is older. It also purges both BUILD_ROOTs from the merged tree (threat T-68-04). In `universal()`, the per-arch Orca trees go through the absolute-LC_RPATH deletion, the merged tree is checked by orca-packaged-tree and package-target-natives, and the checkout-path grep covers it.

## Known Stubs

None. The `orca-packaged-live` live path has never run here. It needs the container tarball (68-06) and lane p68-02's exports.

## Threat Flags

None beyond the plan's register. `macos-orca-universal` may run `sudo apt-get install -y llvm` on the hosted runner when no llvm-lipo exists, as the plan specifies.

## Not run, deferred

- Hosted macOS jobs: shape-checked only (release-shape, workflows, zizmor). Their first real run is deferred to the end-of-milestone pass after main is pushed.
- package-macos.sh per-arch and `universal` paths: `bash -n` and the fixture merge only (BLOCKED.md items 8 and 9).
- orca-packaged-tree (full) and orca-packaged-live (full): need the container-built tarball (68-06).

Merge note for the coordinator: merge after 68-04 (release.yml calls verify-licence-allowlist.mjs --rulings) and before 68-10 (its package-windows.sh calls verify-orca-packaged-tree.mjs and its windows-orca runs the portable build-orca.sh); release.yml: this lane edits build-linux and appends the macOS jobs after the last job, and p68-10 owns windows-orca, build-windows and sign-windows (merge rule (2c)); registry blocks at both anchors go after 68-04's; brand rows for the new scripts, release.yml and docs/BUILD.md are the coordinator's to measure; orca-packaged-tree and orca-packaged-live need exclusion rows keyed to WINDOWS.md entry 30 until 68-06 builds the container tarball; hosted macOS jobs are shape-checked only, first real run deferred.

Additional merge notes:
- p68-10's windows-orca job should copy this lane's corepack gate (no `npm install`) or zizmor goes red.
- The p68-01 quick block now holds four rows after the `orca-service-live-self-test` anchor, and the full block holds two rows after `orca-service-live`. The block comments carry the "# NEW (68-01, ...)" header on the first row only.

## Self-Check: PASSED

- Files exist: scripts/verify-orca-packaged-tree.mjs, scripts/verify-orca-packaged-live.mjs, scripts/verify-build-orca-portable.mjs, scripts/lib/orca-artifacts.mjs.
- Commits 071d6f67, 8f315533 and 5edf17c3 are on HEAD.
