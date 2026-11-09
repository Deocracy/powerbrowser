---
phase: 60-orca-from-source-on-theia-s-node
plan: 02
subsystem: infra
tags: [orca, build, pnpm, corepack, de-slot, electron, verify-platform]

requires:
  - phase: 60-01
    provides: "[upstreams] orca pin, fetch-orca.sh, .#orca dev shell, pnpm 12.14.0 approval"
provides:
  - "scripts/build-orca.sh: scrubbed-environment Orca build from orca/ with Orca's own scripts, de-slot after build:orcad, kept log"
  - "a built, de-slotted orca/out/orcad and orca/out/web at 965978bc (no slot markers, no out/runtimes, no Electron)"
  - "scripts/verify-orca-build-shape.mjs: orca-build-shape check derived from orcad-artifacts.ts with a nine-plant --self-test"
  - "rows orca-build-shape (full) and orca-build-shape-self-test (quick)"
  - "docs/BUILD.md '## Orca half'"
affects: [60-03, 60-04, 60-05]

actuals:
  tokens: 6200
  tasks: 3
  commits: 4
plan_head_before: 2e0e46d41c691a702058a3cf43982e9f794921a7
plan_head_after: b2ebaf9154a2b2049433a2d04ba711ed2d8adf97

tech-stack:
  added: []
  patterns:
    - "Third-party builds run with lifecycle scripts off; a first-party generator a skipped postinstall would have run is invoked directly, by name, in its order"
    - "Build-output shape checks derive their expectations from the third-party source at check time and prove derivation with synthetic fixture values"

key-files:
  created:
    - scripts/build-orca.sh
    - scripts/verify-orca-build-shape.mjs
  modified:
    - scripts/verify-platform.sh
    - docs/BUILD.md

key-decisions:
  - "P60-R3 (Chris, 2026-11-09, option a): install Orca's mobile/ pnpm workspace with --frozen-lockfile --ignore-scripts before build:mobile-web, because build:orcad stages out/mobile-web unconditionally"
  - "P60-R4 (Chris, 2026-11-09, option a): run mobile/'s three postinstall generators directly, in order (build-terminal-webview-engine, build-mermaid-page-engine, build-terminal-document-script), between the mobile install and build:mobile-web; third-party lifecycle scripts stay off and no Orca file is edited"
  - "orca-build-shape's Electron rule matches ELF/PE files named electron(.exe) or a node_modules/electron/dist directory, not pnpm .bin/electron shims or scoped packages' electron/dist"

patterns-established:
  - "verify-orca-build-shape fixture constants carry .fixture-* names so a green self-test proves the marker names were derived, not written"

requirements-completed: [RUN-01]

coverage:
  - id: D1
    description: "Orca's own build:orcad and build:web run at the pin from the .#orca shell with corepack pnpm, scrubbed env, scripts off, kept log"
    requirement: RUN-01
    verification:
      - kind: integration
        ref: "nix develop .#orca --command bash scripts/build-orca.sh (PASS, .mozbuild/orca-build/build-20261109T234314Z.log)"
        status: pass
    human_judgment: false
  - id: D2
    description: "De-slot removes the three markers and out/runtimes after build:orcad"
    requirement: RUN-02
    verification:
      - kind: integration
        ref: "four 'build-orca: de-slot removed' lines in the newest log; test ! -e on all four paths"
        status: pass
    human_judgment: false
  - id: D3
    description: "orca-build-shape derived check green on the built tree; nine plants red"
    requirement: RUN-02
    verification:
      - kind: unit
        ref: "scripts/verify-platform.sh --only orca-build-shape-self-test; --only orca-build-shape"
        status: pass
    human_judgment: false

duration: 143min
completed: 2026-11-09
status: complete
---

# Phase 60 Plan 02: Orca build from source with de-slot and build-shape check Summary

**scripts/build-orca.sh builds Orca's orcad and web client at the pin with corepack pnpm 12.14.0, every third-party lifecycle script off, mobile/'s three generators run directly, and the bundled-Node slot removed; orca-build-shape proves the output carries no marker, no second Node and no Electron.**

## Performance

- **Duration:** about 143 min (plan base 2e0e46d4 at 21:30Z to Task 3 commit at 23:53Z), including two owner decisions at Task 2
- **Started:** 2026-11-09T21:30:25Z
- **Completed:** 2026-11-09T23:53:44Z
- **Tasks:** 3 (tracer, owner decision taken twice, auto)
- **Files modified:** 4

## Build record (Task 1)

- **Result:** `build-orca: PASS -- built v1.4.248 (965978bc78bf03a6a43187c1ed28fcffe0e01bb5) in 21s`
- **Elapsed:** 21 s wall, warm (pnpm store, Node runtime cache and orca/node_modules left by the earlier attempts). First root install into the empty store took 15.5 s and the first mobile/ install 9.6 s. A cold end-to-end run was not measured.
- **Host:** legion, Linux 6.18.60 x86_64, glibc `ldd (GNU libc) 2.42`
- **Toolchain:** node v24.19.0, corepack 0.35.0, pnpm 12.14.0 (from `.#orca`)
- **Tree:** 0cc2c129
- **Log:** `.mozbuild/orca-build/build-20261109T234314Z.log`
- **De-slot lines:**
  - `build-orca: de-slot removed out/orcad/.server-target`
  - `build-orca: de-slot removed out/orcad/.runtime-node`
  - `build-orca: de-slot removed out/orcad/.version`
  - `build-orca: de-slot removed out/runtimes`
- `git -C orca diff --quiet HEAD` exits 0; `git -C orca status --porcelain --untracked-files=no` is empty; `git ls-files -- orca` is empty.
- build:orcad's own report: `[build-orcad] ok -- 0.1.0+93e135cb5097, 12.44 MB, 8009 modules, zero electron and node:sqlite imports, Node 24.22.1 referenced.` The node-pty glibc floor check feared by research did not fail on glibc 2.42.

Earlier attempts, all logs kept under `.mozbuild/orca-build/`:

1. `build-20261109T213222Z.log`: corepack-enable failed (install directory missing; fixed with `mkdir -p`).
2. `build-20261109T213252Z.log`: build:orcad failed in Orca's `stageOrcadMobileWebBundle` (out/mobile-web absent).
3. `build-20261109T213351Z.log`: build:mobile-web added; failed with "mobile/ dependencies are not installed". Owner decision 1 (P60-R3).
4. `build-20261109T221627Z.log`: mobile install added; build:mobile-web failed with `./mermaid-page-engine.generated` and `./terminal-webview-engine-css.generated` unresolved. Owner decision 2 (P60-R4).
5. `build-20261109T234314Z.log`: PASS.

Task 2: option a, taken twice. First decision (P60-R3), Chris 2026-11-09: install Orca's mobile/ workspace scripts-off before build:mobile-web. Second decision (P60-R4), Chris 2026-11-09: "run Orca's three mobile generators directly, in order, between the mobile install and build:mobile-web ... pnpm lifecycle scripts stay off for every third-party package; no Orca file is edited."

## Task Commits

1. **Task 1: tracer, build-orca.sh and first real build** - `faa0f1c9` (feat)
2. **Task 2, decision 1 (P60-R3): scripts-off mobile/ install before build:mobile-web** - `1172b0bb` (fix)
3. **Task 2, decision 2 (P60-R4): three mobile generators before build:mobile-web** - `0cc2c129` (fix)
4. **Task 3: orca-build-shape check, two rows, BUILD.md Orca half** - `b2ebaf91` (feat)

## Files Created/Modified

- [scripts/build-orca.sh](scripts/build-orca.sh) - scrubbed env, corepack pnpm, scripts-off installs, mobile generators, build:mobile-web, build:orcad, de-slot, build:web, kept log
- [scripts/verify-orca-build-shape.mjs](scripts/verify-orca-build-shape.mjs) - derived build-tree shape check with nine-plant `--self-test`
- [scripts/verify-platform.sh](scripts/verify-platform.sh) - `orca-build-shape-self-test` (quick, after the 60-01 orca rows) and `orca-build-shape` (last full-tier entry)
- [docs/BUILD.md](docs/BUILD.md) - `## Orca half`

## Decisions Made

- **P60-R3:** mobile/ is its own pnpm workspace with its own lockfile; it is installed `--frozen-lockfile --ignore-scripts` into the same store.
- **P60-R4:** mobile/'s postinstall is exactly the three first-party generators; they are run directly in its order from inside orca/ (they resolve paths from `import.meta.dirname`, so the cwd does not matter).
- **Note for 60-04:** the mobile/ install brings the Expo / React Native closure (mobile/'s lockfile) into orca/. It is a build input of build:mobile-web, whose output build:orcad stages into out/mobile-web, so that closure enters the licence surface the allowlist must cover.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `${!ORCA_@}` scrub instead of `compgen -e`**
- **Found during:** Task 1
- **Issue:** the `.#orca` shell's non-interactive bash is built without the completion builtins; `compgen` does not exist there.
- **Fix:** `for name in "${!ORCA_@}"; do unset "$name"; done`, followed by an `env | grep '^ORCA_'` assertion. The comment names `compgen -e` and why it is not used.
- **Commit:** faa0f1c9

**2. [Rule 3 - Blocking] `mkdir -p` before `corepack enable --install-directory`**
- **Found during:** Task 1 (first log)
- **Fix:** create `.mozbuild/corepack/bin` first.
- **Commit:** faa0f1c9

**3. [Rule 3 - Blocking] `build:mobile-web` added before `build:orcad`**
- **Found during:** Task 1 (second log)
- **Issue:** build:orcad stages out/mobile-web unconditionally (`build-orcad.mjs` `stageOrcadMobileWebBundle`); Orca's own build:desktop and build:release run build:mobile-web first. This is an Orca script, not an added flag.
- **Commit:** faa0f1c9

**4. Owner decision P60-R3: mobile/ install (scripts off)** - commit 1172b0bb

**5. Owner decision P60-R4: three mobile generators run directly** - commit 0cc2c129

**6. [Rule 1 - Bug] orca-build-shape Electron rule narrowed**
- **Found during:** Task 3
- **Issue:** the plan's rule (a file named electron, or any `electron/dist` path segment) matches pnpm's `.bin/electron` shell shims in orca/node_modules and scoped packages' `electron/dist` directories, so it would be red on a tree with no Electron.
- **Fix:** red on a regular file named electron/electron.exe with an ELF or PE header, or a `node_modules/electron/dist` directory. The self-test's clean control carries a `.bin/electron` shim and a `@scope/electron/dist`; two separate plants cover the ELF half and the dist half, which is why there are nine plants as the plan's verify requires.
- **Files modified:** scripts/verify-orca-build-shape.mjs
- **Commit:** b2ebaf91

**7. Acceptance-count drift:** `grep -c 'ignore-scripts' scripts/build-orca.sh` prints 4, not 1: the mobile install (P60-R3) carries the flag too, plus header and comment lines. Every install in the script is scripts-off.

### Out of scope

- The build ran warm, so the BUILD.md timing is a warm figure and says so. A cold-from-empty `.mozbuild/` timing is still unmeasured.

## Verification

- `nix develop .#orca --command bash scripts/build-orca.sh` exit 0; orcad.js and web-index.html present; four de-slot lines; no marker or out/runtimes.
- `scripts/verify-platform.sh --only orca-build-shape-self-test` PASS (nine `  ok` lines); `--only orca-build-shape` PASS: `0 slot markers, 0 Node runtimes in out/, 0 Electron binaries, 0 modified tracked files`.
- With orca/out renamed away, the check prints one `orca-build-shape: SKIP` line and exits 0; an unknown argument exits 2.
- `grep -v '^\s*//' scripts/verify-orca-build-shape.mjs | grep -c 'runtime-node\|server-target'` prints 0.
- `node scripts/scan-brand-residue.mjs` PASS (685 files, new files staged); `scripts/verify-platform.sh --quick` PASS.

## Issues Encountered

None beyond the deviations above.

## Next Phase Readiness

- 60-03 can start orcad from orca/out/orcad on PowerBrowser's Node: the slot and out/runtimes are gone.
- 60-04 must cover the mobile/ Expo / React Native closure in the licence allowlist.
- RUN-02 stays open until 60-03's slot-less start proves the runtime side.

## Self-Check: PASSED

- FOUND: scripts/build-orca.sh, scripts/verify-orca-build-shape.mjs, docs/BUILD.md `## Orca half`
- FOUND commits: faa0f1c9, 1172b0bb, 0cc2c129, b2ebaf91
