# DSH-BLOCKED: Phase 45 Task 3 owner gate (blocking-human)

**Phase:** 45-portable-linux-release-build-c, plan 45-04 Task 3
(`checkpoint:human-action`, gate `blocking-human`)
**What:** Safe Browsing keyfile + first container bootstrap build on legion.
**Why blocked:** Obtaining the Google Safe Browsing API key, writing the
keyfile to a legion path outside the repo, and running the multi-hour
container bootstrap build (podman + tier-3 Gecko build + MAR + live-update
observation) are owner actions per CONTEXT owner gates and REQUIREMENTS
External Gates. Autonomous execution must stop here per the skill's
checkpoint handling and the plan's `autonomous: false`.

## Owner steps (exact)

From a space-free work dir on legion with the keyfile outside the repo:

1. Obtain the Google Safe Browsing API key in the Google Cloud console; write
   the one-line keyfile to a legion path OUTSIDE any repo (e.g.
   `/var/lib/powerbrowser-release/sb-gapi.key`). Record only the directory
   path in your reply, never the key value.
2. `podman build -t pb-gecko-build -f powerbrowser/packaging/Containerfile .`
3. `podman run --rm -v "$PWD:/src:rw" -v <legion-keydir>:/keys:ro -w /src/upstream pb-gecko-build bash -c 'MOZCONFIG=/src/powerbrowser/packaging/mozconfig.release ./mach build && bash /src/scripts/toolchain-baseline.sh --container'`
   (`./mach` lives in `upstream/`, so the working directory is `/src/upstream`. The release objdir lands at the repo root as `objdir-release/`, which is the mozconfig's `@TOPSRCDIR@/..` resolved from `/src/upstream`. The baseline step runs in the same container so it reads the bootstrap toolchain this build used.)
4. `podman run --rm -v "$PWD:/src:rw" -v <legion-keydir>:/keys:ro -w /src pb-gecko-build bash powerbrowser/packaging/package-linux.sh` (the keyfile mount is repeated because the release mozconfig names `/keys/sb-gapi.data`; `package-linux.sh` runs `mach package` from `upstream/` itself)
5. `MAR=objdir-release/dist/host/bin/mar MOZ_PRODUCT_VERSION=<built-ver> MAR_CHANNEL_ID=powerbrowser-default bash upstream/tools/update-packaging/make_full_update.sh <out>.mar <stage-dir>` then `LD_LIBRARY_PATH=objdir-release/dist/bin objdir-release/dist/bin/signmar -T`
6. Prove every staged gate: `scripts/verify-platform.sh --only portable-elf`,
   `--only sidecar-no-symlinks`, `--only package-target-natives`, `--only
   ng063-packaged-launch`, `--only packaged-identity`.

## Resume signal

Reply with: keyfile directory (path only), build commands run, tarball + MAR
sizes with tree/host/toolchain attribution, each full-tier row PASS line, the
SB live-update observation (`safebrowsing.googleapis.com` 200s + refreshed
classifier files), and the `toolchain-baseline.sh --container` output. A reply
without the evidence does not resume the plan. Do not paste the key value
into the tree, the SUMMARY, or the reply — path only.

## Staged state (all committed on branch dsh/phase-45)

- Plans 45-01/45-02/45-03 complete with SUMMARies; 45-04 Tasks 1-2 complete
  with SUMMARY (`45-04-SUMMARY.md` records the MAR/signmar blocked lines).
- `scripts/verify-platform.sh --quick` PASS (commit gate green after every
  commit). Full-tier rows FAIL naming the missing container tarball by
  design; full green waits on this gate.

## Blocker: pinned Node runtime exceeds the 2.19 glibc ceiling (WR-09)

**RESOLVED 2026-10-22 by owner ruling (option 2).** The shipped Linux floor is
raised from glibc 2.19 to glibc 2.28, declared once in
`powerbrowser/packaging/portability-floor.json`. The pinned official Node
v24.19.0 (GLIBC_2.28) now passes the floor. `portable-elf` reads the declared
floor and also fails if the measured sysroot glibc is above it. The
unofficial glibc-2.17 build (option 1) and the from-source build (option 3)
are not taken. Commit: `940e880` (`fix(45): glibc floor 2.28 for the bundled
official Node (owner ruling)`).

This section is kept as the measurement record. The owner gate in the sections
above (steps 1-6, the container bootstrap build) is still open and is not
affected by this ruling.

Measured 2026-10-22 with `readelf -V` on the Node binaries (the official
tarball is the sha256-verified cache at `.mozbuild/node-dist/`, matching the
pin in `powerbrowser/packaging/node-runtime.json`):

| Binary | Max GLIBC_ | Max GLIBCXX_ | libstdc++ NEEDED |
|---|---|---|---|
| Official `node-v24.19.0-linux-x64.tar.xz` (the pin) | GLIBC_2.28 | GLIBCXX_3.4.21 | yes |
| Official v18.20.8 (not pinned, measured for options) | GLIBC_2.28 | GLIBCXX_3.4.21 | yes |
| Official v20.20.2 (not pinned, measured for options) | GLIBC_2.28 | GLIBCXX_3.4.21 | yes |
| Unofficial `node-v24.19.0-linux-x64-glibc-217.tar.xz` (unofficial-builds.nodejs.org, not pinned) | GLIBC_2.17 | none | no |

Before the ruling, the GLIBC ceiling was the jessie sysroot glibc 2.19, and
`portable-elf` applied it to `node/bin/node`, so the official pin failed. The
ruling replaces that ceiling with the declared 2.28 floor. The check was not
weakened by either change: the floor is a single declared value, and the
sysroot must still measure at or below it.

Options (owner decision):

1. Pin the unofficial glibc-2.17 build of v24.19.0. Measured: GLIBC_2.17,
   no libstdc++ dependency, sha256
   `0f4d977d7e0b25266f7bfe1fbfa3940aeb328fcb25e3d9a19fdbaac56669047a`
   (not yet pinned, not verified against any signed SHASUMS). It fits the
   ceiling as built. The cost is provenance: it is not the nodejs.org release
   that RELEASING.md "Node provenance" names. Needs owner acceptance of that
   source and a release-key check of its SHASUMS.
2. Raise the portability floor for the whole package to glibc 2.28 (Debian
   buster, RHEL 8, Ubuntu 18.10). Official Node cannot be built against the
   jessie sysroot, so this is the only way to keep the official binary. It
   changes the claim in PKG-22 and the DIST_GLIBC ceiling source.
3. Build Node from source on a newer sysroot. Not feasible here: Node 24
   needs a C++20 compiler the jessie sysroot does not carry, and a newer
   sysroot changes the floor (see option 2).

Resolved by the 2026-10-22 ruling (option 2, commit `940e880`). `package-linux.sh`
keeps staging the official pin. `portable-elf` no longer fails on `node/bin/node`
for the GLIBC floor. It stays red only until the container build runs and
measures the sysroot (owner steps 2-6 above).
