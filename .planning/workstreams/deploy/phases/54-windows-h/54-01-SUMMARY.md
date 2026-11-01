---
phase: 54-windows-h
plan: 01
subsystem: packaging
status: complete
tags: [windows, mozconfig, node-runtime, release-workflow, registry-rows]
requires:
  - phase: 49-release-pipeline-and-legion-runner
    provides: release.yml with the gated build-linux and sign-publish shape; release-shape and workflows rows
  - phase: 55-macos-packaging
    provides: shared emitMozconfigFor builder and per-target TARGETS rows
provides:
  - emitMozconfigWindows (per-target Windows mozconfig, maintenance service disabled) and its TARGETS row
  - win32-x64 Node pin beside the Phase 55 darwin pins
  - build-windows job in release.yml (legion, contents read, no secret, no schedule)
  - windows-mozconfig, node-runtime-targets and build-windows-shape rows with self-tests
affects: [54-02, 54-03, 54-04, phase-50 release pipeline]
key-files:
  created:
    - scripts/verify-windows-mozconfig.mjs
    - scripts/verify-node-runtime-targets.mjs
    - scripts/verify-build-windows-shape.mjs
    - powerbrowser/packaging/mozconfig-windows-x86_64
  modified:
    - scripts/generate.mjs
    - scripts/verify-generated-identity.mjs
    - scripts/verify-platform.sh
    - powerbrowser/packaging/node-runtime.json
    - .github/workflows/release.yml
decisions:
  - "Windows mozconfig rides emitMozconfigFor with bootstrap:true and the release SB keyfile mount, plus the Windows tail (target triple, --disable-maintenance-service); the Nix-only lines are dropped as in the release row"
  - "Tracked path follows the Phase 55 convention (powerbrowser/packaging/mozconfig-<target>), not the root .mozconfig-windows named in the plan"
  - "node-runtime key set is derived from the packagers plus WINDOWS_TARGET.node: four keys (linux-x64, win32-x64, darwin-arm64, darwin-x64), not the plan's literal two"
  - "build-windows gates are copied byte for byte from build-linux and checked by their own row; release-shape keeps its build-linux gate rules and already applies its job-level rules to build-windows"
metrics:
  duration: "one session"
  completed: 2026-10-31
  tasks: 3
  files: 9
actuals:
  tokens: 13549
  tasks: 3
  commits: 4
  basis: chars/4 over the realized diff git diff 69659b44..HEAD (54198 bytes); the planned estimate was 120000 over the full work, so the plan-01 share is far below it
---

# Phase 54 Plan 01: Windows tracer slice (static) Summary

**Per-target Windows mozconfig from the shared emitter, a win32-x64 Node pin, and a build-windows job shape, each gated by a quick row with a planted self-test.**

## Commits

Plan head before: `69659b44`. Measured with `git rev-list --count 69659b44..HEAD` after the final commit: 4.

- `2267d0d3` feat(54): per-target Windows mozconfig through the shared emitter (PKG-11)
- `63ed4365` feat(54): win32-x64 Node pin and the node-runtime-targets row (PKG-13)
- `e7df70e9` feat(54): build-windows job and the build-windows-shape row (PKG-10 static half)
- `b351d88e` fix(54): keep the windows-mozconfig self-test plant out of the update-channel scan

Commit `2267d0d3` also carries `scripts/verify-node-runtime-targets.mjs` and `scripts/verify-build-windows-shape.mjs`, which were staged during the brand scan before their tasks. Their registry rows arrive in `63ed4365` and `e7df70e9`. Each file is final, and the tree was green at every commit's row set. This is a history-shape deviation; the rules forbid amending it.

## Verification

- `scripts/verify-platform.sh --quick`: exit 0, `verify-platform: PASS -- all checks passed`, 216 PASS rows, no FAIL row. The baseline before any change was exit 0 with 210 PASS rows.
- `node scripts/generate.mjs --check`: PASS, 69 generated files match.
- `node scripts/scan-brand-residue.mjs`: PASS over 484 files.
- `--only` runs, each exit 0: windows-mozconfig, windows-mozconfig-self-test, node-runtime-targets, node-runtime-targets-self-test, build-windows-shape, build-windows-shape-self-test, generated-byte-identity, generated-byte-identity-self-test, release-shape, release-shape-self-test, workflows, zizmor.

### Self-test outputs

```text
windows-mozconfig --self-test:
  ok  baseline -> green (15 emitter line(s) matched)
  ok  maintenance service inverted -> red, naming powerbrowser/packaging/mozconfig-windows-x86_64 [service] and 'enable-maintenance-service'
  ok  target line missing -> red, naming ... [target] and 'x86_64-pc-windows-msvc'
  ok  MAR channel id disagrees with updateChannel -> red, naming ... [channel] and 'powerbrowser-beta'
  ok  empty emission (zero lines parse) -> red, naming ... [vacuity] and 'zero mozconfig lines'
node-runtime-targets --self-test:
  ok  baseline -> green (4 key(s))
  ok  win32-x64 key missing / extra key / sha256 missing / url not embedding its version / empty set -> red, naming the key and cause
  ok  derived expectation without win32-x64 -> red, naming key win32-x64 [keys]
build-windows-shape --self-test:
  ok  baseline -> green (11 step(s) in build-windows)
  ok  11 planted faults (runner, secrets, write grant, schedule, unpinned uses, repackage removed, key gate if removed, sha gate drift, pipefail removed, retention raised, --no-cache removed) -> red, naming the job and cause
```

The `enable-maintenance-service` string appears 0 times in `scripts/generate.mjs`. `emitMozconfigWindows` appears 2 times.

### Registry-row grep note

The plan's acceptance greps use basic regex with `$REPO_ROOT`, which does not match the row text. The same strings match with `grep -F`, and the rows are present exactly as written.

## Deviations from Plan

### Adaptations

**1. [Adaptation - release.yml already existed] build-windows added beside build-linux, not a new file.** Plan 49 merged a hardened `release.yml`. The job was added to it, with the same label set, gates copied byte for byte, and no change to build-linux or sign-publish.

**2. [Adaptation - runner label] runs-on is `[self-hosted, powerbrowser-release]`, not `legion`.** The workflows row admits only that label set on `build-*` and `matrix-*` jobs, and release-shape requires it.

**3. [Adaptation - tracked path] `powerbrowser/packaging/mozconfig-windows-x86_64`, not root `.mozconfig-windows`.** Phase 55 placed its per-target comparands there.

**4. [Adaptation - shared builder shape] `emitMozconfigWindows` uses the release (bootstrap) shape.** The plan's line list included `--without-wasm-sandboxed-libraries` and `--with-libclang-path`, which are Nix-only lines dropped in the container bootstrap. The release SB keyfile mount is included, as the Linux release row does.

**5. [Adaptation - node key set] Expected key set derived as four keys.** The plan's literal `{linux-x64, win32-x64}` is red on the real tree because Phase 55 added `darwin-arm64` and `darwin-x64`, which `package-macos.sh` reads. The row derives the set from the packagers' Node key lookups plus `WINDOWS_TARGET.node`.

**6. [Adaptation - separate shape row] build-windows gate rules live in `build-windows-shape`.** `release-shape` keeps its build-linux gate rules. Its job-level rules (legion permissions, no secret, mount allow-list, retention) already apply to `build-windows`, since the job is on the label set. The plan's optional extension was therefore not needed.

**7. [Adaptation - sysroot tool] `get_vs.py` is not in the pinned Gecko tree.** `docs/RELEASING.md` names it, and the step invokes that name inside the container. The owner must confirm the path against the pinned tree before the first live run. Recorded in `BLOCKED.md`.

**8. [Adaptation - EXPECTED list] `scripts/verify-generated-identity.mjs` declares the new comparand.** The row's own rule requires a deliberate contract change to be listed in the same commit as its TARGETS row.

### Auto-fixed issues

**1. [Rule 1 - Bug] update-channel row reds on the self-test plant.** The update-channel row scans every tracked file for a literal MAR channel assignment. The plant in `verify-windows-mozconfig.mjs` spelled one out. Fixed in `b351d88e` by building the plant from parts.

### Authentication gates

None.

## Node pin verification

The win32-x64 digest `57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73` came from nodejs.org `SHASUMS256.txt` for v24.19.0. Verification:

- `SHASUMS256.txt.asc` is a clearsigned message. `gpg --batch --verify` with the keys imported from `nodejs/release-keys` reports `GOODSIG` from `Antoine du Hamel` and exits 0.
- `gpg --decrypt` of the clearsigned file yields cleartext byte-identical to the fetched `SHASUMS256.txt`.
- The linux-x64 digest in the same file equals the pre-existing linux-x64 pin.

gpg was run through `nix shell nixpkgs#gnupg`, with the keys in a scratch directory outside the repository.

## Self-Check: PASSED

- Commits `2267d0d3`, `63ed4365`, `e7df70e9`, `b351d88e` present in `git log`.
- Files named in the key-files list exist and are tracked.
