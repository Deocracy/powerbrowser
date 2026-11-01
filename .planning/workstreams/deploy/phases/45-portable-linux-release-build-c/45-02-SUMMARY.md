# 45-02 SUMMARY — PKG-22/PKG-18/PKG-23 portability gates

**Phase:** 45-portable-linux-release-build-c, plan 02, wave 2
**Commits:** 11eeb05 (PKG-22 + strip + all 6 registry rows), d6cc4ee (PKG-18 + PKG-23 row files)
**Date:** 2026-10-23

## Rows and plants

- `scripts/verify-portable-elf.mjs` (PKG-22, new): full-tier row over every
  ELF in the extracted tarball incl. sidecar natives. Assertions: no
  PT_INTERP names /nix/store; no RUNPATH/RPATH names /nix/store; max required
  versioned symbol <= ceiling derived from `toolchain-baseline.txt` sysroot
  dist at check time (DIST keyed on the tree-read dist name, tuple compare,
  equal passes). Self-test: control probes + nix-RUNPATH plant (store-path
  patchelf, no `nix develop` evaluation) red naming `planted.elf` +
  `/nix/store`; newer-symbol plant red on live Nix-tree evidence
  (`BadCertAndPinningServer: requires versioned symbol 2.34.0, ceiling is
  2.19 from toolchain-baseline.txt sysroot line (dist jessie)`); EMPTY stage
  red; idempotency probe (two runs agree).
- `scripts/verify-sidecar-no-symlinks.mjs` (PKG-18, new): `find`-equivalent
  lstat walk over the extracted tarball; empty passes. Self-test: unplanted
  control GREEN, one planted symlink red naming `planted-link.node`.
- `scripts/verify-package-target-natives.mjs` (PKG-23, new): `--target`
  parameterised (`linux-x64` ELF x86-64 exact-bytes magic incl. machine
  `3e 00`; `win64` PE32+; `macos` Mach-O universal for H/I reuse). Sorted
  native paths (stable order); EMPTY native universe red naming `EMPTY native
  universe`. Self-test: single-native control GREEN (1 native); Linux .node
  in Windows fixture red naming `planted.node` + `PE32+`; ordering probe ok.
- Registry (`scripts/verify-platform.sh`): 3 full rows beside ng063 + 3
  `--self-test` twins in the quick set with honestly-quick comments. Counts:
  `portable-elf` x2, `sidecar-no-symlinks` x2, `package-target-natives` x2.

Note on commit split vs the plan text: Task 1's commit (11eeb05) carries all
six registry lines plus the portable-elf row and the strip extension; Task 2's
commit (d6cc4ee) carries the two remaining row files. The registry had to land
whole with the first row file (twins reference files committed in the second
commit only at read time, never at registry-parse time), and each commit's
`--quick` was green at its point. File sets per commit are recorded in
`git show --stat` for each hash above.

## Strip extension

`powerbrowser/packaging/package-linux.sh`: the `:74-76` natives-only glob is
now a `find "$STAGE/theia" "$STAGE/node" -type f` loop with per-file
`|| true` (T-45-05) and the idempotency note. `bash -n` clean.

## Full-tier blocked reds (never green-by-absence)

- `--only portable-elf`: FAIL naming the container-build procedure (no
  `objdir/dist/*-153.5.1.en-US.linux-x86_64.tar.xz`).
- `--only sidecar-no-symlinks`: FAIL, same missing-tarball line.
- `--only package-target-natives`: FAIL, same missing-tarball line.
- Rerun commands: `podman run --rm -v "$PWD:/src:rw" -w /src pb-gecko-build
  bash powerbrowser/packaging/package-linux.sh` (after the 45-01 container
  build), then the three `--only` rows. Full green waits on the 45-04 gate.

## Flagged assumptions (8/8 outcomes)

- PKG-22 boundary: row compares max-required <= ceiling (equal passes); the
  comparator unit probe asserts equal-green plus ceiling-plus-one red.
- PKG-22 precision: exact dotted-triple tuple compare, never floats; both
  versions printed verbatim on red.
- PKG-22 idempotency: row is read-only over the extracted tree; self-test
  re-runs twice and requires agreement; strip `--remove-rpath` is a no-op
  on clean ELFs.
- PKG-22 concurrency: rows extract to mkdtemp, never write the tree;
  parallel `--only` runs cannot corrupt each other.
- PKG-18: assertion-only confirmed sufficient; 0-symlink finding + file-copy
  staging agree; row guards future `cp -a` regressions.
- PKG-23 adjacency: magic compare is exact bytes; truncated magic red, never
  merged.
- PKG-23 empty: zero natives red naming EMPTY native universe, never green.
- PKG-23 ordering: natives sorted before comparing; ordering probe asserts
  stable output.

## Verification

- All three `--self-test` twins exit 0 (control-green-first + plants red
  naming file + drift).
- `--only portable-elf-self-test`, `--only sidecar-no-symlinks-self-test`,
  `--only package-target-natives-self-test` each PASS via the driver.
- `scripts/verify-platform.sh --quick` PASS after each commit (incl. the
  three new twins).
- `scan-brand-residue` PASS after staging (407 files).
- Prohibitions kept: no patchelfing the Nix tree (row fails red-by-design
  there); no hand-kept expectation (`grep -c '2\.19'` = 0 in
  verify-portable-elf.mjs; DIST keyed on tree-read dist); no secrets in rows.
