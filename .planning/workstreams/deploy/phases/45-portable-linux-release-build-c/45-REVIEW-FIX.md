---
phase: 45-portable-linux-release-build-c
fixed_at: 2026-10-23T04:30:00Z
review_path: .planning/workstreams/deploy/phases/45-portable-linux-release-build-c/45-REVIEW.md
iteration: 1
branch: dsh/phase-45
base: workspace/deploy
findings_in_scope: 14
fixed: 14
skipped: 0
partial: 3
status: all_fixed_partial_evidence
---

# Phase 45: Code Review Fix Report

**Source review:** 45-REVIEW.md (deep, 21 findings)
**Scope:** all 5 critical (CR-01..05), all 9 warnings (WR-01..09), and the
7 info items as ruled: IN-02 and IN-03 fixed; IN-01, IN-04, IN-05, IN-06,
IN-07 left listed.
**Working tree:** the `dsh/phase-45` clone only. Commits made with the
user's identity; no worktree was created (the user named the clone).

## Gate

`scripts/verify-platform.sh --quick` on the fixed tree (commit 5e3a545): exit 0,
`verify-platform: PASS -- all checks passed`, about 90 seconds. Before the fixes
the same gate exited 1 on `portable-elf-self-test` (CR-01).

## Fixed findings

Each commit is `fix(45): <ID> ...` and lists its files. Where one commit
covers two IDs, both are named because the hunks share a file.

| ID | Commit | Files | Applied fix |
|---|---|---|---|
| WR-02 | ab74c39 | scripts/verify-ng-063-packaged-launch.mjs | Restored byte-for-byte from workspace/deploy (owner-locked). No profile-state row was added; see Partial. |
| CR-01 | 6e1bafb | scripts/verify-portable-elf.mjs | Plant copied with copyFileSync and chmod 0755 (store binary was 0555, patchelf could not write). A plant that cannot be built prints a labelled FAIL. |
| CR-02 WR-01 WR-08 | 8dbe67c | scripts/verify-portable-elf.mjs | GLIBC_* compared to the glibc floor only; GLIBCXX_* to a libstdc++ floor read from the measured `sysroot-glibcxx` baseline line. Self-test plants are synthetic ELFs with a real .gnu.version_r section (GLIBC_2.99, GLIBCXX_3.4.99) plus an at-ceiling control (GLIBC 2.19, GLIBCXX 3.4.20) that must stay green. Missing patchelf is FAIL, not skip. The live-objdir probe is gone; the self-test uses a fixed fixture ceiling. |
| CR-05 | 00cd6cf | scripts/toolchain-baseline.sh, toolchain-baseline.txt, scripts/verify-portable-elf.mjs, scripts/verify-platform.sh | `--container` refuses outside the container and names the chained command. It measures clang, rustc, cargo, cbindgen, the sysroot dist and glibc (from the sysroot libc.so.6), the sysroot libstdc++ GLIBCXX ceiling, and the image codename. Nothing is a literal. Committed file carries UNMEASURED for every container-derived value. New quick row `toolchain-baseline-self-test`: planted sysroot mismatch and UNMEASURED line must go red. |
| CR-03 | 58615b5 | scripts/lib/release-objdir.mjs (new), powerbrowser/packaging/package-linux.sh, scripts/lib/built-tree.mjs, scripts/verify-platform.sh | Objdir name read from mozconfig.release (`${POWERBROWSER_OBJDIR:-<default>}`, empty falls back as bash does). Packager uses it and passes the release mozconfig to `mach package` (the dev `.mozconfig` defaulted to `objdir`). built-tree.mjs packages from RELEASE_OBJDIR; OBJDIR stays the dev tree. New quick row `release-objdir-self-test` plants mozconfig text. |
| CR-04 | 4bcb599 | powerbrowser/packaging/Containerfile, DSH-BLOCKED.md, 45-04-SUMMARY.md, 45-04-PLAN.md | Every `./mach build` runbook line runs from `/src/upstream` with the release mozconfig, chained with the baseline measurement. Package steps mount the keyfile too. |
| WR-06 | 15ddc67 | powerbrowser/packaging/package-linux.sh | Manifest written beside the tarball only; the `$STAGE` copy is removed. Written through JSON.stringify (escaping verified with a quote-bearing value). |
| WR-07 | 3274e4a | powerbrowser/packaging/Containerfile, toolchain-baseline.txt | `FROM debian:bookworm@sha256:854dd8ab51d62866dbd8f5431d15ce77b12983a2a4a1e1fe43a2395dc7ef9f61` (pulled with podman). `dist-upgrade` removed; apt reads snapshot.debian.org `20261019T000000Z` for debian and debian-security, both verified to return 200 today. |
| WR-09 | 4ce4822 | DSH-BLOCKED.md | Measured, not weakened. Official v24.19.0 (sha256-verified against the pin): GLIBC_2.28, GLIBCXX_3.4.21, libstdc++ NEEDED. Recorded as a blocker with three owner options. See Measured floor. |
| WR-03 | 5850585, 5e3a545 | powerbrowser/shell/TheiaService.sys.mjs, scripts/verify-sidecar-state-migration.mjs (new), scripts/verify-platform.sh | Pure `migrateLegacyStateFile` at module scope: copy the legacy record to the ProfD path, then remove the legacy file; a failed copy keeps the legacy file. The reap now reads both paths. New rows `sidecar-state-migration` and its self-test: the shipped function runs against a fake store; mutants (remove-before-copy, no existing-record guard) must go red. |
| WR-04 WR-05 | 6498c9e | powerbrowser/shell/PowerBrowserAPI.sys.mjs, scripts/verify-cli-url.mjs (new), scripts/verify-platform.sh | WR-04: admission predicate moved to module scope as `admitCliUrlSpec`; `verify-cli-url.mjs` reads it from the file and probes 14 refused and 4 admitted shapes. Self-test plants two mutants (admit every scheme; no non-string guard). WR-05: `openStockTab(url).catch(...)` logs the rejection. |
| IN-02 | 4e305e6 | powerbrowser/INTERNAL-APIS.md | Phase 45 rows now cite the lines that hold their touchpoints (cmdLine three-part row 3609/3612/3621; QueryInterface 3692; savePageCopy and writePersistedDocument rows; JSWindowActorParent 3740). A prose cross-reference that pointed at a comment line now names the row it means. Boundary check passes. |
| IN-03 | 7efa62c | scripts/verify-generated-identity.mjs | Accepted and documented (reviewer's alternative). Not a string duplicate: the EXPECTED entry is the declared contract, and deriving it from TARGETS would compare the generator with itself. |

## Partial

- **CR-05 / CR-02 (container evidence):** the committed baseline is UNMEASURED
  on purpose. The `sysroot`, `sysroot-glibcxx`, `clang`, and `image` lines
  need one run of the chained command in the release container (DSH-BLOCKED.md
  step 3). Until then `portable-elf` cannot resolve its ceiling and reports
  that, and `toolchain-baseline.sh --container` was not run in a container
  (the host refuses, as designed). The container-mode measurement code is not
  exercised here.
- **WR-02 (profile-state assertion):** the ng063 file is restored as ruled. No
  new profile-state row was added. The move itself is covered by the WR-03
  migration row, not by a ProfD-path assertion against a real launch.
- **WR-07 (image build):** the digest was resolved and the snapshot URLs
  return 200, but the image was not built here. The apt snapshot date is a
  choice that the first build will prove or disprove.

## Measured floor (WR-09)

Measured with `readelf -V` on the sha256-verified pinned tarball
(`.mozbuild/node-dist/node-v24.19.0-linux-x64.tar.xz`):

- Max GLIBC_ token: **GLIBC_2.28** (ceiling 2.19 is exceeded).
- Max GLIBCXX_ token: **GLIBCXX_3.4.21**; libstdc++.so.6 is NEEDED.
- Official v18.20.8 and v20.20.2 measure the same (GLIBC_2.28, GLIBCXX_3.4.21).
- Unofficial glibc-2.17 build of v24.19.0 (not pinned): GLIBC_2.17, no libstdc++
  dependency, sha256 `0f4d977d7e0b25266f7bfe1fbfa3940aeb328fcb25e3d9a19fdbaac56669047a`.

Recorded as a blocker in DSH-BLOCKED.md with options (pin the glibc-2.17
build with a provenance decision; raise the package floor to glibc 2.28; build
Node on a newer sysroot, not feasible here). The `portable-elf` full row stays
red naming `node/bin/node`; the check was not weakened.

## Not fixed (ruled as info, left listed)

- IN-01: full-tier FAIL text prints the Nix build command next to the container command.
- IN-04: five staged files in `upstream/` index (predates phase; confirm with check-patch-surface).
- IN-05: DIST_GLIBC is a hand-kept Debian-release table (noted, no change).
- IN-06: `sidecar-no-symlinks` row name covers the whole tarball.
- IN-07: 45-03 SUMMARY names `--only packaged-launch`; the label is `ng063-packaged-launch`.

## Changes that affect other rows (review before merge)

- `extractPackage()` now defaults to the release objdir (`objdir-release`).
  The wave-E full rows that call it (ng063, ng065, ng072) verify the release
  package, not the dev Nix package. A dev-only run that relied on
  `objdir/dist` now goes red on purpose.
- `toolchain-baseline.txt` has seven lines in container output order. The
  dev-shell diff in `scripts/rebase-upstream.sh` (operator follow-up, not run
  here) compares only the dev lines and was already non-empty before this fix.
- `scripts/verify-cli-url.mjs` and `scripts/verify-sidecar-state-migration.mjs`
  evaluate function source taken from committed repo files, through
  `new Function`. The input is the repo's own shell module, not external input.

---

_Fixed: 2026-10-23T04:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
