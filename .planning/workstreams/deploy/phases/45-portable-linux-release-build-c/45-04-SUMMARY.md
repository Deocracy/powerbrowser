# 45-04 SUMMARY — UPD-29 mechanism + PKG-21 measure (Task 3 OWNER GATE OPEN)

**Phase:** 45-portable-linux-release-build-c, plan 04, wave 4
**Commits:** ecfd112 (UPD-29 RENEWALS + mount comment), 020bb0b (PKG-21 manifest emission)
**Date:** 2026-10-23

## Task 1: UPD-29 mechanism (ecfd112)

- Release-only keyfile line verified in place (landed in 45-01's release
  variant, re-verified here): `grep -c with-google-safebrowsing-api-keyfile`
  = 1 in `powerbrowser/packaging/mozconfig.release`, 0 in `.mozconfig`
  (dev unbaked). Generator source: `emitMozconfigRelease` with
  `SB_KEYFILE_MOUNT = '/keys/sb-gapi.data'`; `generated-byte-identity` PASS.
- Mount discipline: `grep -rE 'COPY.*sb-gapi|ADD.*sb-gapi'` over
  `powerbrowser/packaging/` + `scripts/generate.mjs` = clean (exit 1);
  Containerfile comment reworded so the discipline note itself no longer
  self-matches the acceptance grep. Key value nowhere in tree/image/scan/log.
- `docs/RENEWALS.md` (new): exactly one Safe Browsing row (no-expiry +
  legion-replace owner action) with the Phase-42 coordination assumption
  in-file. `grep -c 'Safe Browsing'` >= 1 with rotation note + owner action.
- Assumption outcomes: adjacency (release always carries the line; configure
  fatals naming the path without the mount; dev never carries it); empty
  (empty keyfile = same fatal); ordering (single row, chronological append,
  stable key name); concurrency (one launch's transaction observed; profiles
  converge independently). All four hold by mechanism + upstream
  `keyfiles.configure:20-30` precedent, pending the live mount.

## Task 2: PKG-21 measure (020bb0b)

- `package-linux.sh` now writes `objdir/dist/release-manifest.json` (built
  version, release key `v153.5.1-1`, update channel `default`, MAR channel
  `powerbrowser-default`, tree/host/toolchain attribution) and stages a copy
  beside the tarball. `bash -n` clean; `grep -c release-manifest` = 3.
- MAR measurement: BLOCKED behind the container build (no
  `make_full_update.sh` output exists yet). Reference points: 2026-10-17
  tarball 129529524 B; prior Gecko-only complete MAR 78654141 B; expected
  ~130 MB complete MAR. Decision text: complete-MARs-only unless the
  measurement shows a two-week cadence cannot carry the size (Out of Scope
  default stands; Phase 47 WEB-02 consumes the number).
- signmar record: run form `LD_LIBRARY_PATH=objdir-release/dist/bin
  objdir-release/dist/bin/signmar -T` (libnss3-tools on ubuntu-latest);
  output BLOCKED behind the same build. Phase 49 proves signing (SEC-07);
  this plan records the form.
- Concurrency assumption: single `make_full_update.sh` invocation; partial
  `.mar` deleted and re-run, never published; one build job at a time.

## Task 3: OWNER GATE (OPEN -- phase stops here)

Owner, from a space-free work dir on legion with the keyfile outside the repo:

1. Obtain the Google Safe Browsing API key; write the one-line keyfile to a
   legion path OUTSIDE any repo. Reply with the directory path only, never
   the value.
2. `podman build -t pb-gecko-build -f powerbrowser/packaging/Containerfile .`
3. `podman run --rm -v "$PWD:/src:rw" -v <legion-keydir>:/keys:ro -w /src/upstream pb-gecko-build bash -c 'MOZCONFIG=/src/powerbrowser/packaging/mozconfig.release ./mach build && bash /src/scripts/toolchain-baseline.sh --container'` (`./mach` is in `upstream/`; the release objdir is `objdir-release/` at the repo root)
4. `podman run --rm -v "$PWD:/src:rw" -v <legion-keydir>:/keys:ro -w /src pb-gecko-build bash powerbrowser/packaging/package-linux.sh`
5. `MAR=objdir-release/dist/host/bin/mar MOZ_PRODUCT_VERSION=<built-ver> MAR_CHANNEL_ID=powerbrowser-default bash upstream/tools/update-packaging/make_full_update.sh <out>.mar <stage-dir>` then `LD_LIBRARY_PATH=objdir-release/dist/bin objdir-release/dist/bin/signmar -T`
6. `scripts/verify-platform.sh --only portable-elf`, `--only sidecar-no-symlinks`, `--only package-target-natives`, `--only ng063-packaged-launch`, `--only packaged-identity` (all currently FAIL naming the missing tarball; see 45-02/45-03 SUMMARies for the exact red lines).

Gate passes only with: keyfile path outside the repo (path only), container
outputs with `wc -c` + attribution, every 45-02/45-03 full-tier row PASS
against them, the SB live check (`safebrowsing.googleapis.com` 200s +
refreshed classifiers), and the `toolchain-baseline.sh --container` output
beside the committed decision-19 seed. Resume signal: reply with exactly that
evidence; anything less keeps Phase 45 red at this gate with these rerun
commands. Key value anywhere (tree/SUMMARY/reply) is a defect to purge.
