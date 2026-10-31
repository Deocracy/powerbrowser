---
phase: 55-macos-i
plan: 02
subsystem: infra
tags: [macos, mozconfig, nix, node, dmg, branding, pkg-14, pkg-15]

requires:
  - phase: 55-macos-i (plan 55-01)
    provides: the shared mozconfig builder path, the aarch64 comparand and the mac-entitlements gate
provides:
  - x86_64 macOS mozconfig through the same shared builder, with its tracked comparand
  - firefox-macos devShell beside firefox and theia; flake.lock unchanged
  - darwin-arm64 and darwin-x64 Node pins, enforced by package-macos.sh
  - package-macos.sh, the per-architecture macOS staging script
  - five generated DMG and cocoa branding inputs per variant, with honest placeholders
affects: [55-03 universal unify and DMG, 55-04 owner checkpoint, Phase 50 release.yml build-macos]

actuals:
  tokens: 6484
  tasks: 3
  commits: 4
plan_head_before: d2a4635240410a9f91817d74471c0b2d4b9c0dac
plan_head_after: 0e09e593ef453a16a2cfe4703814cb45dc824af9

key-files:
  created:
    - powerbrowser/packaging/mozconfig-macos-x86_64
    - powerbrowser/packaging/package-macos.sh
  modified:
    - scripts/generate.mjs
    - scripts/verify-generated-identity.mjs
    - flake.nix
    - powerbrowser/packaging/node-runtime.json
    - docs/BUILD.md
    - docs/RELEASING.md
    - .planning/WINDOWS.md

key-decisions:
  - "The darwin Node pins take the .tar.gz sha256 from SHASUMS256.txt for v24.19.0, the same Node line as the linux-x64 pin. The linux-x64 sha256 was cross-checked against the same file and matches."
  - "package-macos.sh stages the thin better-sqlite3 prebuild of its own architecture. It does not lipo two prebuilds here. mozpack's UnifiedExecutableFile takes non-fat Mach-O inputs, so a pre-merged fat binary cannot pass through unify. The universal merge of the sidecar natives is plan 55-03's unify step."
  - "The five branding inputs are generated with no tracked comparand. Assets.car and dsstore are empty; background.png is the 128-pixel raster; document.icns and disk.icns are the application icon set."
  - "A Mac-only risk is recorded, not hidden: an empty Assets.car is expected to degrade the Dock and Finder icon, because Info.plist prefers CFBundleIconName out of Assets.car."
  - "One broken-windows stub entry (23) records the placeholders, so /gsd-ship stays blocked until the owner replaces them."

patterns-established:
  - "Per-target mozconfig = one shared builder (emitMozconfigFor) plus a Darwin tail. The tail is empty for every existing row, so their bytes do not move."
  - "Honest placeholder emitters: a labelled empty or placeholder file, a stated risk, an upgrade path, and a WINDOWS.md stub entry."

requirements-completed: []

duration: about 1h 30m (includes the read-only Node SHASUMS fetch and one quick run per plan-level change)
completed: 2026-10-31
status: complete
---

# Phase 55 Plan 02: macOS build inputs Summary

**Both macOS mozconfigs through one shared builder, a firefox-macos devShell that evaluates, darwin Node pins with a staging script, and five generated DMG branding inputs. Nothing here runs a Mac build; the static, fixture and evaluation proofs are green.**

## Performance

- **Tasks:** 3 (Task 2 was split into two commits: the shell and pins, then the comment split)
- **Commits:** 4 task commits (`142afc8`, `d53cf57`, `df3598e`, `0e09e59`) plus this summary
- **Quick registry:** PASS, 189 PASS rows, zero FAIL rows. No new rows in this plan.

## Accomplishments

- `powerbrowser/packaging/mozconfig-macos-x86_64`: tracked comparand from the same builder as the aarch64 row, with `--target=x86_64-apple-darwin`, objdir `objdir-macos-x86_64`, and the shared update-channel and MAR lines.
- `flake.nix`: `devShells.x86_64-linux.firefox-macos` with the firefox stdenv override, MOZBUILD anchor and bintools unset line, plus `llvm`, `lld`, `rcodesign`, `rsync`, `cmake`, `openssl`, `zlib`, `gnupatch`, each with a why-comment. `flake.lock` is unchanged.
- `powerbrowser/packaging/node-runtime.json`: `darwin-arm64` and `darwin-x64` pins for v24.19.0.
- `powerbrowser/packaging/package-macos.sh <arch>`: per-arch staging: pin read, `sha256sum -c` with delete-and-fail, `mach package` into the target's objdir, Theia sidecar staging, thin prebuild, Node arch check with `lipo -archs`, a non-darwin native guard, a checkout-path guard, and precomplete refresh.
- `scripts/generate.mjs`: five branding emitters and ten `TARGETS` rows (five per variant), no tracked comparands.
- `docs/BUILD.md` packaging hosts: the firefox-macos cross host row; the DMG note corrected to the Linux branch of `dmg.py`, verified against `is_linux` and `rsync` in the tree.
- `docs/RELEASING.md`: a "Phase 55 macOS build inputs" record; the ad-hoc posture sentences are unchanged.

## Evidence

Generator:

```
generate: --check PASS -- all 68 generated file(s) match configuration.toml
```

Flake (evaluation only, no build):

```
checking derivation devShells.x86_64-linux.firefox-macos...
derivation evaluated to /nix/store/srlna0hq3j3kpd0r0dlkaw85zhkmq7ks-nix-shell.drv
all checks passed!
```

Node pins (checked against `SHASUMS256.txt` for v24.19.0):

```
darwin-arm64  8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d  node-v24.19.0-darwin-arm64.tar.gz
darwin-x64    d1b5e999db158c62fe8f7267a4476b035d8bd93b1a605bac24a3f0dd166e3316  node-v24.19.0-darwin-x64.tar.gz
linux-x64     14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647  (unchanged; matches its SHASUMS entry)
```

Five emitted inputs per variant (`generated/branding/<variant>/`, git-ignored):
`document.icns`, `disk.icns`, `background.png`, `dsstore`, `Assets.car`. The `document.icns` bytes equal `firefox.icns`.

Brand scan: `scan-brand-residue: PASS -- no residual brand occurrence in 448 scanned file(s)`.

Upstream clean: `git -C upstream diff --quiet` exits 0. `git status --porcelain brand` prints nothing.

## Deviations from Plan

### Auto-fixed / resolved

**1. [Plan text conflict, resolved by the unify constraint] The sidecar prebuild is not lipo-merged in `package-macos.sh`**
- **Found during:** Task 2
- **Issue:** The plan asks for per-arch better-sqlite3 prebuilds "merged by lipo" in the per-arch script. `upstream/python/mozbuild/mozpack/unify.py` (`UnifiedExecutableFile`) states its inputs "are expected to be non-fat Mach-O executables". A pre-merged fat binary staged per tree would therefore fail the universal unify.
- **Resolution:** The script stages this architecture's thin prebuild only. The universal merge of the sidecar natives belongs to the unify step in plan 55-03.

**2. [Verification scope] `nix flake check --no-build` instead of a full `nix flake check`**
- **Reason:** The full check builds the devShells, which is heavy and not needed to prove that the new attribute evaluates. `--no-build` evaluates all three shells, and it passes. The lock file is unchanged.

**3. [Owner step recorded] The Node signature was not verified**
- The darwin pins come from the `SHASUMS256.txt` on nodejs.org, which was read. The `.sig` file was fetched, but this shell has no `gpg` and no Node release keyring, so the signature was not verified. Recorded in `BLOCKED.md` item 5.

**4. [Grouped comment, then split] `cmake`, `openssl`, `zlib`, `gnupatch`** had one grouped comment in the first commit. The later commit gives each its own why-comment, as the plan asks.

### Recorded risks (not fixed in this plan)

- The Darwin mozconfigs inherit the shared lines `--with-libclang-path="$LIBCLANG_PATH"` and `--without-wasm-sandboxed-libraries` from the Linux dev row (plan text). Both must be confirmed at the first cross configure (`BLOCKED.md` item 8).
- The SDK and DMG-tool paths use `$MOZ_FETCHES_DIR`, the convention in upstream `cross-mozconfig.common`. A local shell may not set it. The first cross configure confirms it.

## Known Stubs

| File | Line(s) | Reason |
|---|---|---|
| `scripts/generate.mjs` | `emitAssetsCarPlaceholder` | Empty `Assets.car`. The icon degrades until an `actool` catalog replaces it. WINDOWS.md entry 23. |
| `scripts/generate.mjs` | `emitDmgDsStorePlaceholder` | Empty `dsstore`. Finder uses its default window layout. WINDOWS.md entry 23. |
| `scripts/generate.mjs` | `emitDmgBackgroundPng` | The 128-pixel application raster stands in for designed DMG artwork. WINDOWS.md entry 23. |

These stubs do not prevent this plan's goal. The plan asks for placeholders that are labelled, and they are labelled. The replacement is owner-side (`BLOCKED.md` item 6).

## Threat Flags

None. No new network endpoint, auth path or schema change. The only network reads were read-only GETs of `nodejs.org/dist/v24.19.0/` and Apple's public pages during the SEC-13 record.

## Self-Check: PASSED

- Files exist: `powerbrowser/packaging/mozconfig-macos-x86_64`, `powerbrowser/packaging/package-macos.sh`, `flake.nix`, `powerbrowser/packaging/node-runtime.json`, `docs/BUILD.md`, `docs/RELEASING.md`, `55-02-SUMMARY.md` (this file).
- Commits exist: `142afc8`, `d53cf57`, `df3598e`, `0e09e59`.
