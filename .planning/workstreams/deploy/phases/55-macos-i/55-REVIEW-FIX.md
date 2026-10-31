---
phase: 55-macos-i
fixed_at: 2026-10-31
review_path: .planning/workstreams/deploy/phases/55-macos-i/55-REVIEW.md
branch: dsh/phase-55
iteration: 1
findings_in_scope: 10
fixed: 9
skipped: 1
status: partial
---

# Phase 55: Code Review Fix Report

**Fixed at:** 2026-10-31
**Source review:** .planning/workstreams/deploy/phases/55-macos-i/55-REVIEW.md
**Iteration:** 1

**Scope:** CR-01, CR-02, WR-01 to WR-06, IN-03, IN-04 (the ten findings requested). IN-01 and IN-02 were not requested and are recorded as NOT FIXED.

## Per-finding status

- CR-01: FIXED 90d5f8e. createprecomplete.py runs from `Contents/Resources`, the stale root copy is removed first, and the run fails if a root `precomplete` exists or the staged `theia/` files are not listed.
- CR-02: FIXED abf055f. The `node-file:` keys in `main.js` and `parcel-watcher.js` are rewritten as package-linux.sh does, before the checkout assertion. Mach-O RUNPATH is still a hard failure, not a rewrite: no Mac is available to prove an `install_name_tool` step.
- WR-01: FIXED fdb937c. Every `.node`, `.dylib`, `.so` and executable under `theia/` and `node/` is classified by its magic bytes. ELF fails by name, and each Mach-O must report exactly the target arch to lipo. The sqlite prebuild and the Node binary are checked by name.
- WR-02: FIXED ad3277e. `MOZ_FETCHES_DIR` and its four SDK and DMG tool paths are checked before the Node download and the Gecko build. `docs/BUILD.md` (macOS section) documents them.
- WR-03: FIXED 609f22d. `POWERBROWSER_BRANDING` defaults to the release directory, as the Linux release mozconfig does. The Gecko configure must record the selected `--with-branding` in `objdir-macos-<arch>/config.status`, or the run fails.
- WR-04: NOT FIXED. The locked nixpkgs rustc (1.97.1) has no `aarch64-apple-darwin` or `x86_64-apple-darwin` std, and the nixpkgs rustc derivation exposes no option to add one. A fix needs a new toolchain flake input (a lock change that cannot be verified offline) or a network fetch at build time. Recorded with the evidence and three routes in BLOCKED.md item 9 (508dcf8).
- WR-05: FIXED e251c9d. `objdir-macos-aarch64/` and `objdir-macos-x86_64/` are git-ignored, confirmed with `git check-ignore`.
- WR-06: FIXED cc7f405. The self-test plants the stale-exclusion rule and the derived-zero case. The control plants forbidden text in the WINDOWS.md prose, which the gate reads for status. Disabling the stale loop or the signing-group check each turns the self-test red on its own plant.
- IN-03: FIXED c724122. `TMP_OUT` is removed. A failed pin read fails loudly with the pin key named. A missing `llvm-lipo` fails with the shell to enter, not a Mach-O message.
- IN-04: FIXED 2318c9e and 52bfbc1. Staging runs in a full `.app` copy, and the objdir bundle is replaced only after every check passes. An EXIT trap removes the working copy and any partial download. The stale counts in the `verify-generated-identity.mjs` header are corrected. The tautological spelling guard in `emitMozconfigMacos` is removed; the byte-identity row is the gate for those spellings.
- IN-01: NOT FIXED. Not in the requested fix set. The plist facts are still regex-scraped and `RESTRICTED_KEYS` is still a hand-kept copy.
- IN-02: NOT FIXED. Not in the requested fix set. The sidecar Node and native entitlement file is a plan 55-03 item.

## Verification

- `bash -n powerbrowser/packaging/package-macos.sh`: pass.
- `shellcheck` 0.11.0 (from the nixpkgs store; not installed on the host): no findings on `package-macos.sh`.
- Scratch end-to-end runs of `package-macos.sh` with a stub `mach`, a stub `llvm-lipo`, fake Theia output and a fake pinned Node archive (the harness is in the session scratchpad, outside the repository):
  - CR-01: the HEAD script leaves `precomplete` at the bundle root and a stub in `Contents/Resources`. The fixed script lists 7 staged `theia/` entries in `Contents/Resources/precomplete` and leaves only `Contents` at the root.
  - CR-02: the node-file keys are rewritten to `<buildhost>`. A checkout path in an unrelated file still fails the run and names the file.
  - WR-01: a clean arm64 tree passes. An ELF `.node`, an x86_64 `.node` and a non-Mach-O `.node` each fail, named.
  - WR-02: unset `MOZ_FETCHES_DIR` and an incomplete one fail before the Gecko build. A complete one proceeds.
  - WR-03: a bare run records `powerbrowser/branding-generated/release`. An explicit dev run records dev. A Gecko build that ignores the selection fails.
  - IN-03: a missing lipo and a missing pin key each fail with a named message.
  - IN-04: a clean run leaves no working copy and no stale file survives a rerun. An ELF failure leaves the Gecko stub bundle unchanged and no `theia/` directory.
- `node scripts/generate.mjs --check`: PASS (68 files).
- `node scripts/verify-generated-identity.mjs`: PASS (39 files).
- `node scripts/verify-mac-entitlements.mjs`: PASS (10 known-open hits excluded). `--self-test`: PASS (10 planted faults).
- `nix flake check --no-build --no-write-lock-file`: all checks passed. `flake.nix` and `flake.lock` are unchanged by this pass.
- `git -C upstream diff --quiet`: clean.
- `scripts/verify-platform.sh --quick`: exit 0, all checks passed.

The gates ran in the clone at `/home/chris/gsd-workspaces/deploy/dsh/phase-55`. The scratch runs used a copy of the script, not the clone.

Not verified: a real Gecko Darwin build, the Theia darwin natives, and a run against a real objdir. These need a macOS host or the rust-std decision in BLOCKED.md item 9.
