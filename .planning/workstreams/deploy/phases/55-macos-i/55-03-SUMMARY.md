---
phase: 55-macos-i
plan: 03
subsystem: infra
tags: [macos, universal, lipo, dmg, mar, descriptors, ad-hoc-signing, pkg-14, pkg-15, upd-21]

requires:
  - phase: 55-macos-i (plan 55-02)
    provides: both per-target mozconfigs, the darwin Node pins, package-macos.sh per-architecture mode
provides:
  - scripts/verify-macos-package-payload.mjs, the full-tier macos-package-payload row and its quick self-test twin
  - package-macos.sh universal, the unify, lipo sidecar merge, ad-hoc sign, DMG, MAR and Darwin descriptor step
  - update-copy checks for the UPD-21 macOS variant and the download page's macOS signing claims
affects: [55-03 Task 2 (Team-ID patch, signing wiring, release.yml build-macos), 55-04 owner checkpoint, Phase 50 release.yml]

actuals:
  tokens: 20900
  tasks: 2
  commits: 2
plan_head_before: 9c777bc0deb5e38715a0f60a2337fa0707202ee7
plan_head_after: 6ffae2b387d3dfa92ae9d26470abd4e95bb198b7

key-files:
  created:
    - scripts/verify-macos-package-payload.mjs
  modified:
    - powerbrowser/packaging/package-macos.sh
    - scripts/verify-platform.sh
    - scripts/verify-update-copy.mjs
    - docs/BUILD.md
    - docs/RELEASING.md

key-decisions:
  - "The darwin sidecar is lifted out of both per-target bundles before unify.py and merged with lipo in package-macos.sh universal. unify.py refuses a file found in one tree only, and the two better-sqlite3 prebuilds carry different names."
  - "The better-sqlite3 prebuild pair becomes one fat file staged under both names, so every staged Mach-O is universal and the gate needs no exception list."
  - "No tracked file names the build-date variable. The no-build-date-pin row (UPD-26) refuses it. The gate asserts one shared BuildID across both per-target application.ini files, the bundle and every descriptor, and the mechanism that shares one date across the two builds is left to the release.yml build-macos job (Task 2)."
  - "The UPD-21 macOS string already existed as cannotUpdateMacBody in powerbrowser-update-copy.ts, the single update-copy site, rendered by update-client.ts. No second copy was added to powerbrowser-welcome-widget.tsx. The shape test was extended instead."
  - "The download page's macOS signing claim is compared, as a set, with the posture release.yml implements: Developer ID only when a macos-sign step passes a p12 file, notarized only when a notarization step exists."

requirements-completed: []

duration: about 2h
completed: 2026-10-31
status: partial
---

# Phase 55 Plan 03: macOS universal payload Summary

**Tasks 1 and 3 are done. Task 1 is the macos-package-payload gate: it derives every expectation from the tree, its evidence contract fails closed, and its self-test has 18 plants. Task 3 is the `package-macos.sh universal` step, which merges the darwin sidecar with lipo, signs ad hoc, and writes the DMG, the MAR and both Darwin descriptors, plus two macOS copy checks in update-copy. Task 2 (the Team-ID patch and the signing wiring) was not executed. It is blocked on the owner's Apple Team ID.**

## Performance

- **Tasks:** 2 of 3 executed (Tasks 1 and 3). Task 2 not executed.
- **Commits:** `80cf6705` (Task 1), `6ffae2b3` (Task 3), plus this summary.

## Accomplishments

- `scripts/verify-macos-package-payload.mjs`:
  - Targets are derived from the `--target` line of each `powerbrowser/packaging/mozconfig-macos-<arch>`, formatted as `Darwin_<cpu>-gcc3`.
  - The generic-certs switch is read from `upstream/build/moz.configure/update-programs.configure`.
  - The sidecar paths are read from `TheiaService.sys.mjs` (`${appDir}/...`).
  - The DMG install symlink is read from `mozpack/dmg.py`.
  - What it asserts:
    - one shared fourteen-digit BuildID;
    - the full derived slice set in every Mach-O;
    - per slice, an ad-hoc signature whose CodeDirectory page hashes verify, with no Team ID, no CMS certificate chain and no stapled ticket;
    - the same bundle inside the DMG (extracted with the Linux `dmg` and `hfsplus` tools) plus the Applications symlink;
    - each descriptor re-emitted byte-identical through the shared `buildUpdateXml` over the MAR bytes;
    - one descriptor per derived target under `UPDATE_CHANNEL`, both identical;
    - no generic-certs switch in either `config.status` or any macOS mozconfig;
    - no ELF and no non-Mach-O native in the sidecar, and no checkout path;
    - the argv spawn, so that a spaced bundle path reaches node as one argument.
  - With no evidence the row FAILs and names the `docs/BUILD.md` procedure.
- Registry: the twin `macos-package-payload-self-test` is in `--quick` after `mac-entitlements-self-test`. The full row `macos-package-payload` comes after `theia-fresh-clone-build-self-test`. `grep -c macos-package-payload scripts/verify-platform.sh` prints 2.
- `powerbrowser/packaging/package-macos.sh universal`, steps 1 to 8 as its header lists them:
  - re-checks each staged node's pin byte for byte;
  - refuses differing BuildIDs;
  - runs `unify.py` with x86_64 first;
  - merges with `lipo -create`;
  - deletes absolute `LC_RPATH` entries with `llvm-install-name-tool`;
  - asserts Mach-O universal and runs `package-target-natives --target macos`;
  - refuses checkout paths and refreshes precomplete;
  - signs with `./mach macos-sign --use_rcodesign -e developer` (ad hoc);
  - runs `make_dmg` with configure's `MOZ_PACKAGE_EXTRA_ARGS`, then `make_full_update.sh`;
  - writes the descriptors through `buildUpdateXml`, replaces `.mozbuild/macos-package/` and runs the row.
  The per-architecture mode behaves as before. Its pin fetch is now a shared `fetch_pin` function.
- `scripts/verify-update-copy.mjs`, two new checks:
  - Section 7: the body the client renders on a Mac must name the folder the DMG installs into.
  - Section 8: the macOS line on `website-staging/download.html` must claim exactly the posture in `release.yml`.

## Evidence

Payload self-test (`node scripts/verify-macos-package-payload.mjs --self-test`): 19 ok lines (control plus 18 plants).

```
  ok  baseline -> green (4 Mach-O, 2 descriptors, targets Darwin_aarch64-gcc3, Darwin_x86_64-gcc3)
  ok  single-slice binary -> red naming 'single-slice'
  ok  divergent BuildIDs -> red naming 'divergent BuildIDs'
  ok  stripped signature -> red naming 'stripped signature'
  ok  cert-chain signature -> red naming 'certificate chain'
  ok  Team ID in the signature -> red naming 'Team ID'
  ok  non-ad-hoc signature -> red naming 'not ad hoc'
  ok  byte changed after signing -> red naming 'page hashes do not verify'
  ok  stapled notarization ticket -> red naming 'notarization ticket'
  ok  hash-mismatched descriptor -> red naming 'hashValue'
  ok  same-target descriptor pair -> red naming 'same-target pair'
  ok  generic-certs config.status -> red naming 'generic-certs'
  ok  missing evidence -> red naming 'docs/BUILD.md'
  ok  ELF node under a darwin name -> red naming 'ELF'
  ok  backend entry missing -> red naming 'theia/lib/backend/main.js'
  ok  checkout path in the sidecar -> red naming 'checkout path'
  ok  file missing from the DMG -> red naming 'missing from the DMG'
  ok  no Applications symlink in the DMG -> red naming 'Applications'
  ok  spawn through a shell string -> red naming 'argv spawn'
macos-package-payload: --self-test PASS -- 18 planted faults went red naming their drift, and the control stayed green
```

The full row on this tree, as designed with no evidence:

```
macos-package-payload: FAIL -- 1 problem(s) with the universal macOS payload
  - .mozbuild/macos-package is absent, so the universal macOS payload is unproven (no evidence is not a pass). Next step: docs/BUILD.md, "macOS universal package (plan 55-03)": run bash powerbrowser/packaging/package-macos.sh universal after both per-target runs
```

update-copy self-test: `update-copy: --self-test PASS -- 14 planted faults went red naming their drift, and the control stayed green`. The new plants:

```
  ok  pref key in the macOS cannot-update body -> red naming 'cannotUpdateMacBody'
  ok  macOS body drops the Applications folder -> red naming 'Applications folder'
  ok  notarization overclaim on the download page -> red naming 'overclaim: notarized'
  ok  Developer ID overclaim on the download page -> red naming 'overclaim: Developer ID signed'
```

Lipo merge evidence. The real merge section of `package-macos.sh` (lines `# 5 (first half)` through `# 6`) was extracted and run against synthetic thin Mach-O pairs, using `/nix/store/...-llvm-21.1.8/bin/llvm-lipo`:

```
verify-package-target-natives: PASS -- 5 native(s) match --target macos (Mach-O universal), sorted and stable
node/bin/node fat x86_64 arm64
theia/lib/backend/main.js other
theia/lib/backend/native/keytar.node fat x86_64 arm64
theia/lib/backend/native/rg fat x86_64 arm64
theia/node_modules/better-sqlite3/prebuilds/darwin-arm64.node fat x86_64 arm64
theia/node_modules/better-sqlite3/prebuilds/darwin-x64.node fat x86_64 arm64
```

The failure paths were exercised the same way. Each one went red naming its file:

- a differing non-binary file;
- an ELF `rg` under a darwin name;
- a file present in one tree only;
- a checkout path in a staged file.

The gate's own Mach-O reader parses an `llvm-lipo`-produced fat file: both slices read `adhoc:true, teamId:null, cmsLength:0, hashesVerify:true`.

check-patch-surface: `check-patch-surface: PASS -- no compiled-file target paths and no brand values in 4 patch(es)`. No Team-ID patch exists. Slot 050 is unused (`patches/` holds 010, 020, 030 and 040).

Upstream clean: `git -C upstream diff --quiet` exits 0. Brand scan: `scan-brand-residue: PASS -- no residual brand occurrence in 550 scanned file(s)`. Generator: `generate: --check PASS -- all 69 generated file(s) match configuration.toml`.

`scripts/verify-platform.sh --only macos-package-payload-self-test`: `verify-platform: PASS -- all checks passed`.

`scripts/verify-platform.sh --quick`: 253 PASS rows. The last line is `verify-platform: FAIL -- see summary above`. Six rows are red, and each one is caused by the worktree environment, not by this plan. The same set was red after Task 1 and after Task 3:

- `gui07-strip-spike-verdict` and its self-test: `diff-theia-core.sh` runs `yarn check --integrity`. In `nix develop .#theia` that reports "Some module folders are missing", because only `theia/node_modules` is symlinked into this worktree.
- `gui09-dependent-window-content` and its self-test: `theia/applications/browser/lib/frontend/secondary-window.html` is absent. This worktree has no Theia build output.
- `single-copy-deps` and `ng086-theia-react-node`: both refuse a symlinked `theia/node_modules` (`isRealDir`).

The first run also showed eleven reds from a missing `generated/` directory. `node scripts/generate.mjs` (git-ignored output) cleared them.

## Task 2: not executed

Task 2 (the hook-only Team-ID patch `patches/050-powerbrowser-macos-team-id.patch`, the SEC-04 signing-order and invocation assertions, the notarize and staple record, and the `release.yml` `build-macos` and `matrix-macos` legs) was not executed. No patch was created and `release.yml` was not edited.

**Why:** the Team ID comes from the owner's Apple Developer account, which does not exist yet (Owner Decision 10: enrolment after the Phase 47 site is live and a D-U-N-S number exists). The patch cannot be regenerated without it.

**Owner unblock steps (copied from `BLOCKED.md` item 2):**

  1. Complete D-U-N-S and Apple Developer Program enrolment (owner action, Decision 10).
  2. Record the Team ID in the owner's secret store. Do not commit it to the repository before the
     hook-only patch exists.
  3. The executor (or the owner) adds the hook-only patch and regenerates it with
     `scripts/regenerate-patches.sh`. It is never text-edited.
  4. Mark `.planning/WINDOWS.md` entry 22 `fixed` and remove the ten `KNOWN_OPEN_HITS` from
     `scripts/verify-mac-entitlements.mjs` in the same commit. The gate then proves the production
     plists are clean.

**Task 3 dependencies on Task 2, recorded:**

- **Signing:** `package-macos.sh universal` signs ad hoc only (`-e developer`, no p12). The Developer ID invocation (`--rcodesign-p12-file`, `--rcodesign-p12-password-file`, production entitlements, explicit channel) and the payload gate's flip from "ad hoc, no Team ID" to "Developer ID, the PowerBrowser Team ID" both belong to Task 2.
- **Shared build date:** the shared build date for both per-target builds belongs to the `build-macos` job (Task 2). The `no-build-date-pin` row (UPD-26, T-44-13) refuses any tracked file that names the build-date variable. Its own instruction is that a value derived per build may be admitted only after the row records why. That narrowing has to be made where the date is set, so it is not made here.
- **Download page:** the signing line has to change when Task 2 lands. The new update-copy section 8 goes red as soon as `release.yml` gains a `macos-sign` step with a p12 file or a notarization step and the page still says "ad-hoc signed and not notarized".

## Deviations from Plan

**1. [Plan text conflict] The UPD-21 string is not in `powerbrowser-welcome-widget.tsx`.**
- **Found during:** Task 3 (the read_first entry asks for an `ls` check before writing).
- **Issue:** the macOS text already exists as `cannotUpdateMacBody` in `powerbrowser-update-copy.ts`, and `update-client.ts` renders it on a Mac with the Open download page affordance. `update-copy` enforces one site for every update string, so a second copy would break that rule.
- **Resolution:** no new string. The copy shape test (`scripts/verify-update-copy.mjs`) was extended with the macOS checks and plants. The welcome widget is unchanged.

**2. [Cross-gate conflict, Rule 3] No build-date variable in the evidence contract.**
- **Issue:** the plan's evidence contract records the build-date variable, and `no-build-date-pin` failed on every line that named it (the first `--quick` run).
- **Fix:** the gate compares the per-target BuildIDs, the bundle's BuildID and every descriptor's buildID as one value, with the same divergent-BuildID plant. `build-date.txt` was dropped from the contract.
- **Files:** `scripts/verify-macos-package-payload.mjs`, `docs/BUILD.md`. **Commit:** `80cf6705`.

**3. [Ordering] The sidecar assertions landed with the gate in Task 1.**
- The backend entry, node, the ELF and native shape, the checkout path and the argv spawn were planned for Task 3 but were committed with the gate in `80cf6705`. Task 3's commit adds the shell side and fixes the fixtures' CPU subtypes so that `llvm-lipo` reads them.

**4. [Scope] The DMG and MAR extension of `package-macos.sh` landed with Task 3's universal mode.**
- The plan lists it under artifacts, not under a task, so it went in with the universal mode.

**5. [State files] STATE.md, ROADMAP.md and REQUIREMENTS.md were not updated.**
- The plan is partial (Task 2 blocked), and this ran in a parallel worktree, so updating them here could conflict on merge. The caller owns those updates.

## Known Stubs

None added. The universal mode emits real artifacts or fails.

## Not run

- `package-macos.sh universal` end to end. It needs both built objdirs, and the cross configure stops before the Gecko compile until the Darwin `rust-std` route is chosen (`BLOCKED.md` items 8 and 9). Only `bash -n`, the argument guard and the extracted merge section ran.
- The `LC_RPATH` deletion path. The synthetic slices carry no `LC_RPATH`, so `llvm-install-name-tool -delete_rpath` did not run.
- The stapled-ticket location (`Contents/CodeResources`) is a commented shortcut in the gate, to be confirmed at the plan 55-04 Mac session.

## Threat Flags

None. No new network endpoint, auth path or schema change. The universal mode downloads only the pinned Node archives that the per-architecture mode already fetches.

## Self-Check: PASSED

- Files exist: `scripts/verify-macos-package-payload.mjs`, `powerbrowser/packaging/package-macos.sh`, `scripts/verify-update-copy.mjs`, `docs/BUILD.md`, `docs/RELEASING.md`, this summary.
- Commits exist on HEAD: `80cf6705`, `6ffae2b3`.
