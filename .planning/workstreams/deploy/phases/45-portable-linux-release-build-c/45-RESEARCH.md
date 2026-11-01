# Phase 45: Portable Linux release build (C) - Research

**Researched:** 2026-10-22
**Domain:** Portable Gecko+Theia Linux release: container bootstrap build, ELF portability gates, profile-scoped Theia state, packaged identity/launch proof, Safe Browsing keyfile, MAR sizing
**Confidence:** HIGH for in-tree mechanics (every load-bearing claim was read or executed this session: `package-linux.sh`, `generate.mjs`, `TheiaService.sys.mjs`, `PowerBrowserAPI.sys.mjs`, verify scripts, upstream configure/sysroot/signmar sources, live `readelf`/`ldd`/`ls` output). MEDIUM for the container build itself and the jessie-`signmar`-on-`ubuntu-latest` run (documented and present in the tree, no build was run here per research rules).

## Summary

Everything Phase 45 needs exists in the tree in a nearby form. The phase is assembly and gating, not invention: a release `.mozconfig` variant from the generator, a `Containerfile` modeled on the upstream `debian-build` image, profile-scoping one function, four new registry rows plus one missing `packaged-identity` row, and a keyfile mount. The container build is the longest single item and the only thing that fixes the portability facts this session measured on the Nix-built tree.

Five facts change the plan's shape:

1. **The Nix-built tree is provably non-portable today, which is exactly what the container build fixes.** `readelf` on this worktree's `objdir/dist/bin/powerbrowser` shows `INTERP /nix/store/...-glibc-2.42-67/lib/ld-linux-x86-64.so.2`, a RUNPATH naming `/nix/store/...-glibc-2.42-67`, `gcc-15.3.0-lib`, freetype/fontconfig/gtk and more, and `libxul.so` requires up to `GLIBC_2.42`. The `signmar` in `objdir/dist/bin` resolves `libc.so.6`, `libm.so.6`, `libstdc++.so.6` to `/nix/store/...` paths (`ldd`). A `portable-elf` row written against this tree goes red on day one by design; it goes green only on the container build.
2. **PKG-06 is one function.** `TheiaService.sys.mjs:522-527` `_resolveConfigDir()` reads `XDG_CONFIG_HOME`/`HOME` and returns `<base>/powerbrowser`. The profile directory is already available read-only through `PowerBrowserAPI.getProfileDir()` (`PowerBrowserAPI.sys.mjs:427-433`, `ProfD`), and `getAppDir()` (`GreD`, `:436-442`) already exists. Move the base under the profile; everything downstream (`THEIA_CONFIG_DIR` env at `TheiaService.sys.mjs:697`, `ensureDirectory` at `:241`, `_stateFilePath` at `:197`) follows the one change. Do it first: the matrix no-residue rows inspect the new paths.
3. **The Safe Browsing keyfile is a one-line mozconfig mechanism, not new code.** Upstream declares `simple_keyfile("Google Safebrowsing API")` (`upstream/toolkit/moz.configure:1154`), which implements `--with-google-safebrowsing-api-keyfile=<path>` via `keyfiles.configure:7-32` (reads the file at configure time, bakes `MOZ_GOOGLE_SAFEBROWSING_API_KEY`). Mozilla's own release mozconfigs use it (`upstream/browser/config/mozconfigs/linux64/common-opt:5` → `/builds/sb-gapi.data`; win64/macosx variants use `${APIKEYDIR}/sb-gapi.data`). The generator emits the release mozconfig, so the plan adds the line to the release variant only, pointing at the container-mounted keyfile path, and changes nothing in Gecko.
4. **`packaged-identity` and the three portability rows do not exist yet; `packaged-launch` does.** The registry's full tier today has `ng063-packaged-launch` (`scripts/verify-platform.sh:4845`) backed by `verify-ng-063-packaged-launch.mjs` + `scripts/lib/built-tree.mjs` (`packagePath`/`extractPackage`). There is no `packaged-identity`, `portable-elf`, `sidecar-no-symlinks`, `package-target-natives`, or `install-matrix`/`no-residue` row in the tree. `docs/RELEASING.md:833-835` already specifies the first three rows' contracts (from the old probe stage) — the plan implements them, it does not re-derive the contracts.
5. **`docs/RENEWALS.md` does not exist and no `Containerfile` exists.** `ls docs/` shows no `RENEWALS.md` (Phase 42 DOC-04 owns it). `powerbrowser/packaging/` holds only `mar/`, `node-runtime.json`, `package-linux.sh`, `version*/`. The plan must state the assumption (create the one RENEWALS row here if Phase 42 has not landed, or coordinate), and must author the `Containerfile` from the upstream package list.

**Primary recommendation:** Run in this order (SUMMARY phase-C order, confirmed by the tree):

1. **PKG-06 first** — retarget `_resolveConfigDir()` under `getProfileDir()`; keep `_profileStateKey()` suffixing; update `ng063`'s `XDG_CONFIG_HOME` isolation if it masks the new path; matrix no-residue rows derive the real paths from `application.ini` + `getProfileDir`.
2. **PKG-17 container work** — author `powerbrowser/packaging/Containerfile` (bookworm base + upstream `debian-build` package list); add the generator's release `.mozconfig` variant (drop the two Nix-only lines, add `--enable-bootstrap` + `--with-google-safebrowsing-api-keyfile=<mount>`); mount the keyfile (never `COPY`); build on legion via podman; run `package-linux.sh` inside against the container objdir; emit the tarball + complete MAR (`make_full_update.sh`) + `release-manifest.json`. End with exact build commands; do not invoke podman here.
3. **PKG-18 assertion** — `sidecar-no-symlinks` row: `find <stage> -type l` empty; self-test plants a symlink. Assertion only (the 2026-10-17 0-symlink finding plus this tree's staging shape agree).
4. **RUNPATH strip** — extend the existing `package-linux.sh:74-76` `patchelf --remove-rpath` natives loop to every staged ELF (or prove the loop covers the row's universe); the `portable-elf` row checks interpreter + RUNPATH + GLIBC ceiling.
5. **PKG-04 / PKG-05 / PKG-07** — re-proof `packaged-launch` on the container tarball (it already resolves `backendMain`/`nodePath` relative to the app dir); add the missing `packaged-identity` row (release-variant identity); extend the single-instance command-line handler to open a CLI URL in the stock browser window (new `INTERNAL-APIS.md` row, `check-internals-boundary.sh` stays green).
6. **UPD-29** — keyfile outside the repo mounted into the container; one `docs/RENEWALS.md` row (assumption noted); live check shows Safe Browsing lists updating.
7. **PKG-21 measure** — weigh the complete MAR from `make_full_update.sh` output; state it for /download (WEB-02, Phase 47); record the partial-MAR decision (complete-only unless too large for a two-week cadence; Out of Scope already defaults to complete-only).

Every new check is one registry row plus its `--self-test` sibling. Full-tier rows need the container-built tarball/MAR; quick rows stay build/browser/display/network-free.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Release vs dev build configuration | Generator (`scripts/generate.mjs`, new release `.mozconfig` variant) | Tracked comparand (release mozconfig under `powerbrowser/` or `generated/` per TARGETS convention) | CFG-01: `configuration.toml` + `brand/` are the only rebrand inputs; the generator is the only writer; `generated-byte-identity` byte-compares |
| Portable build environment | `powerbrowser/packaging/Containerfile` (bookworm + upstream `debian-build` package list) + `--enable-bootstrap` | `scripts/toolchain-baseline.sh` + `toolchain-baseline.txt` (decision 19: pins the container's Mozilla bootstrap toolchain) | Replaces the Nix-shell build for releases; fixes `/nix/store` interpreter + GLIBC_2.42 at its source (STACK row 19) |
| Staging, RUNPATH strip, precomplete, tarball rewrite | `powerbrowser/packaging/package-linux.sh` (extend the natives loop) | `portable-elf` / `sidecar-no-symlinks` / `package-target-natives` rows | One staging script owns the bytes; rows derive from the staged tree and compare, never hand-keep lists |
| Theia state location | `TheiaService.sys.mjs:_resolveConfigDir()` → under `PowerBrowserAPI.getProfileDir()` | `PowerBrowserAPI.sys.mjs:getProfileDir/getAppDir/ensureDirectory` (boundary, already catalogued) | PKG-06: state lives under the Gecko profile; matrix rows inspect the real paths |
| Packaged proof | `scripts/verify-ng-063-packaged-launch.mjs` (exists) + new `packaged-identity` row | `scripts/lib/built-tree.mjs` (`packagePath`/`extractPackage`, version from built `application.ini`) | Re-proof on the container tarball; relative `backendMain`/`nodePath` resolution is already the staged-first logic |
| CLI URL → stock window | `PowerBrowserSingleInstanceHandler.handle()` (`PowerBrowserAPI.sys.mjs:3595-3648`) + `openShellWindow`/stock chrome path | `theia/extensions/tab-uris/.../browser-window-command.ts` (already opens stock chrome for in-app URLs) | PKG-07: the handler reads the URL arg today it ignores; chrome re-applies its own scheme validation |
| Safe Browsing key | Release mozconfig line `--with-google-safebrowsing-api-keyfile=<mount>` (generator-emitted) | Keyfile outside the repo on legion, mounted with `podman -v`; `docs/RENEWALS.md` row; live list-update check | UPD-29 + decision 7: configure-time file read, baked `MOZ_GOOGLE_SAFEBROWSING_API_KEY`; never commit the key, never `COPY` it into the image |
| MAR production + channel gate | `upstream/tools/update-packaging/make_full_update.sh` (`MAR=.../mar`, `MOZ_PRODUCT_VERSION`, `MAR_CHANNEL_ID=powerbrowser-default`) + container `signmar` | SEC-07 sign gate (Phase 49) reads the MAR product-info block vs `ACCEPTED_MAR_CHANNEL_IDS` before `signmar -s` | PKG-17 produces tar.xz + complete MAR; PKG-21 measures it; Phase 49 signs it |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus research additions): Apps only, no PATs; non-ephemeral legion runner later (Phase 49); one release per ESR point release.
- Safe Browsing (decision 7): obtain an API key; keyfile outside the repo; RENEWALS row; live list-update check. The keyfile is stored on legion.
- Toolchain baseline (decision 19): `toolchain-baseline.txt` pins the release container's Mozilla bootstrap toolchain.
- Product named PowerBrowser; plain language; next step is a real on-screen affordance; identifiers go in the diagnostics layer (applies to PKG-07/UPD-20..22 copy paths and any new user-facing string).

#### Owner gates in this phase (stop points for autonomous execution)
- Obtaining the Google Safe Browsing API key and storing the keyfile on legion (path outside the repo) are owner actions.
- The container bootstrap build itself (PKG-17, the longest single item) executes in Phase 49's legion `build-linux` job or as an owner/local run; Phase 45 plans prepare the Containerfile, the release `.mozconfig` variant, the staging changes and every registry row, and end with the exact local/legion build commands rather than invoking podman here (no legion podman run during planning).
- Read-only `gh api` calls are allowed for research.
- Research-flag-C open items are answered from tree reading, not from running the container build.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase skipped per setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Specific Ideas (from CONTEXT.md)
- SUMMARY phase-C order: PKG-06 first (blocks the matrix rows), then the PKG-17 container build (longest single item — start the rebuild early), PKG-18 as assertion only, the RUNPATH strip, PKG-04/05/07, PKG-21 measure, and the `package-target-natives` row.
- UPD-29: keyfile outside the repo mounted into the container build; a `docs/RENEWALS.md` row (note: `docs/RENEWALS.md` does not exist yet — Phase 40 DOC scope created it or it lands here per DOC-04); a live check shows the Safe Browsing lists updating.
- PKG-21: measure the complete MAR size, state it for /download (WEB-02); record the partial-MAR decision (complete MARs only unless too large for a two-week cadence).

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (abridged from REQUIREMENTS.md) | Research Support |
|----|-------------|------------------|
| PKG-06 | Theia state lives under the Gecko profile directory instead of `XDG_CONFIG_HOME`/`HOME`; matrix no-residue checks inspect the real paths. (C) | `_resolveConfigDir()` at `TheiaService.sys.mjs:522-527` is the one function; `getProfileDir()` (`PowerBrowserAPI.sys.mjs:427-433`) + `getAppDir()` (`:436-442`) already exist; `THEIA_CONFIG_DIR` (`:697`), `ensureDirectory` (`:241`), `_stateFilePath` (`:197`) follow. Pattern A. Full-tier proof; quick shape row optional. |
| PKG-17 | Release Gecko builds run in a Debian bookworm container under podman on legion with `--enable-bootstrap` (Mozilla clang, rust, cbindgen, jessie sysroot) and produce the Linux tar.xz + complete MAR. (C) | `debian-build/Dockerfile:19-50` package list; `bootstrap.configure:28-58` `--enable-bootstrap`; `sysroot.yml:31-46` `local-toolchain:true` linux64 sysroot; `build-sysroot.sh:19-22` `dist=jessie` for amd64; `make_full_update.sh` + `MAR_CHANNEL_ID=powerbrowser-default` (DOCS `BUILD.md:881-885`). Pattern B. Owner/local run gate. |
| PKG-22 | Full-tier `portable-elf`: no ELF in the Linux tarball (sidecar natives included) carries a `/nix/store` interpreter or RUNPATH; max required GLIBC symbol ≤ release sysroot glibc (2.19), ceiling derived from the sysroot at check time. RUNPATH stripped at staging; self-test plants a `/nix/store` RUNPATH + a newer-GLIBC binary. (C) | Current tree red by measurement: `INTERP /nix/store/...-glibc-2.42-67/...`, RUNPATH with glibc-2.42 + gcc-15.3.0-lib, `libxul.so` needs `GLIBC_2.42` (executed `readelf`/`strings` this session). Strip precedent `package-linux.sh:74-76`. Pattern C. |
| PKG-18 | Full-tier `sidecar-no-symlinks`: `find <stage> -type l` empty; self-test plants a symlink. (C) | Assertion only: 2026-10-17 tarball holds 0 symlinks (ARCHITECTURE §8); staging copies (`package-linux.sh:47-61`) are file copies + archive extraction. Pattern C. |
| PKG-23 | Full-tier `package-target-natives`: every `.node`, `rg`, `node` binary in a staged package matches the target (ELF x86-64, PE32+, Mach-O universal); self-test plants a Linux `.node` into a Windows staging copy. (C) | PITFALLS pitfall 6 + `ng063` R13 node check (`verify-ng-063-packaged-launch.mjs:52-59`) are the shape precedent; natives observed `theia/.../native/*.node` + `rg` + `node/bin/node`. Pattern C. Write in C for Linux; H/I reuse. |
| PKG-04 | `packaged-launch` + `packaged-identity` pass on the container-built tarball; sidecar resolves `backendMain`/`nodePath` relative to the app directory. (C) | `ng063` row exists (`verify-platform.sh:4845`) and already asserts in-prefix resolution via `/proc/<pid>/{cmdline,exe}` (`verify-ng-063-packaged-launch.mjs:43-73`); staged-first logic `TheiaService.sys.mjs:459-493` (`<app>/theia/lib/backend/main.js`, `<app>/node/bin/node`); `built-tree.mjs:22-39` locates/extracts the package. `packaged-identity` is new (contract at `RELEASING.md:834`). Pattern D. |
| PKG-05 | Release package's Theia About dialog carries the release-variant legal notices. (C) | `emitLegalNotices()` (`generate.mjs:1754-1776`: own trademark + `MOZILLA_NON_ASSOCIATION_TAIL` `:1722` + Eclipse sentence); Theia channel `legalNotices` (`branding-config.ts`, `powerbrowser-about-dialog.tsx:72-103`); release variant `name_suffix ""` (`configuration.toml:66-70`) changes the Mozilla sentence. Assert staged `theia/package.json` fragment == release emission. Pattern D. |
| PKG-07 | A URL given on the command line opens in the stock browser window. (C) | Handler ignores every arg today (`PowerBrowserAPI.sys.mjs:3595-3648`; `INTERNAL-APIS.md:60-61` documents the never-reads-an-argument contract — the plan amends it); stock-chrome path proven by GUI-01 (`browser-window-command.ts:48-68,174-192`: `window.open(url,'_blank')` → `AppWindow::CreateNewContentWindow`, patch 020 keeps `BROWSER_CHROME_URL` stock). New `INTERNAL-APIS.md` row + `check-internals-boundary.sh` green. Pattern D. |
| PKG-21 | Complete MAR size measured and stated on /download; partial-MAR decision recorded (complete-only unless too large for a two-week cadence). (C) | Tarball 129,529,524 bytes (SUMMARY §8, 2026-10-17 artifact); this worktree's `objdir/dist` tarball 129,551,024 bytes (`ls` this session); prior Gecko-only complete MAR 78,654,141; expect ~130 MB complete MAR (both xz). Out of Scope already defaults complete-only. Pattern E. |
| UPD-29 | Release build uses a Google Safe Browsing API key from a keyfile outside the repo mounted into the container build; `docs/RENEWALS.md` row; live check shows Safe Browsing lists updating. (C) | `upstream/toolkit/moz.configure:1154` `simple_keyfile("Google Safebrowsing API")` → `--with-google-safebrowsing-api-keyfile` (`keyfiles.configure:7-38`); Mozilla precedent `linux64/common-opt:5` (`/builds/sb-gapi.data`); `%GOOGLE_SAFEBROWSING_API_KEY%` substitution (`URLFormatter.sys.mjs:127-128`, `AppConstants.sys.mjs:185`); provider prefs (`all.js:3389-3414`); `SafeBrowsing.sys.mjs:536-559` key check; allowlist already `allow`s both SB hosts (`endpoint-allowlist.json:65-73`). `docs/RENEWALS.md` absent (`ls` this session) — assumption logged. Pattern F. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core. PKG-05/07 Theia-side work stays in `@powerbrowser/*` extensions; `scripts/diff-theia-core.sh` stays green.
- Never modify Gecko outside the patch stack. `git -C upstream diff` stays empty; any Gecko change (none expected in Phase 45) goes through `scripts/regenerate-patches.sh`, never a text edit. `check-patch-surface.sh` stays green.
- Design for the bridge. Nothing in PKG-06/07 welds Theia to full-window presentation; `verify-registry-shape.mjs` untouched.
- Repo path contains no space. New files (Containerfile, row scripts) get space-free names; legion work dir stays space-free (runner `workDir` free of spaces is also a SEC-08 control).
- Theia is the default GUI; stock browser chrome is reachable; no custom browser chrome is authored. PKG-07 routes a CLI URL to the existing stock window path — no new chrome UI.
- The residual-brand scan is a permanent gate. **Stage new files before trusting a green scan** (`git ls-files` iteration). Only `inventory/brand-tokens.json` may name the originating product.
- Patches are regenerated, never text-edited. (No patch change expected in Phase 45.)
- One driver, one registry: `scripts/verify-platform.sh`. Every new check is one row + `--self-test`. No sibling driver.
- Derive from the tree and compare; do not hand-keep expectation lists. The GLIBC ceiling derives from the sysroot at check time; the MAR/channel rows derive from the generator/manifest; the identity rows derive from `releaseIdentity()`.
- Never assert on the absence of a log line unless the line is proven emitted by the code under test.
- No internal identifier in user-facing text. Product is "PowerBrowser"; PKG-07 error/edge copy and any new Theia string end with a real on-screen affordance; identifiers live in the diagnostics layer (`shell-error-copy-no-internals` shape).
- Builds run inside `nix develop .#firefox` / `.#theia` for dev work; **release builds run in the container**, never the Nix shell. `yarn` only inside `.#theia`; a `--quick` row must not call `yarn`.
- `verify-platform.sh --quick` is the commit gate. Full-tier rows (`portable-elf`, `sidecar-no-symlinks`, `package-target-natives`, `packaged-launch`, `packaged-identity`, no-residue/matrix) need the container-built tarball and do not run in `--quick`.

## Standard Stack

No new packages. Everything Phase 45 needs is the tree, the container base image, Mozilla's bootstrap toolchains, and host tools already present.

| Tool | Version (verified) | Purpose | Note |
|------|--------------------|---------|------|
| `debian:bookworm` (+ taskcluster `debian-build` package list) | bookworm; list at `upstream/taskcluster/docker/debian-build/Dockerfile:19-50` | Release build container base | Author `powerbrowser/packaging/Containerfile` `FROM debian:bookworm` + that `apt-get install` set; podman 5.8.6 already on legion (`/etc/nixos/configuration.nix:657` per STACK) |
| Mozilla bootstrap toolchains via `--enable-bootstrap` | Pinned by the ESR tree at build time (`bootstrap.configure:28-117`, `local-toolchain` filter) | clang, rust, cbindgen, nasm, sccache + jessie sysroot (glibc 2.19) | `sysroot.yml:31-46` linux64 sysroot is `local-toolchain:true`; `build-sysroot.sh:19-22` builds it from jessie for amd64 |
| jessie sysroot (glibc 2.19) | glibc 2.19 | Portability floor; `portable-elf` ceiling source | Row derives the ceiling from the sysroot at check time (unpack the toolchain artifact or read the sysroot's `libc.so.6`), never a `2.19` literal |
| `signmar` from the container build | tree (`upstream/modules/libmar/tool/moz.build:22-34` `Program("signmar")`) | Complete-MAR signing/verification on `ubuntu-latest` (Phase 49; Phase 45 proves it runs) | Run form `LD_LIBRARY_PATH=<dist>/bin signmar -T/-s/-v` (`ng065:25,76`; `RELEASING.md:940-944`); `libnss3-tools` (Ubuntu) supplies `pk12util`/`certutil` |
| `patchelf` | firefox dev shell today; container image thereafter | `--remove-rpath` at staging | Existing loop `package-linux.sh:74-76`; extend to the row's full ELF universe |
| `readelf` / `file` / `find` | host coreutils | `portable-elf` (INTERP, RUNPATH/RPATH, `GLIBC_X.Y` symbols), `package-target-natives` (`file` magic), `sidecar-no-symlinks` (`find -type l`) | Row scripts are `node` drivers spawning these, same shape as `ng063` |
| Official Node release | pinned `powerbrowser/packaging/node-runtime.json` (`linux-x64` v24.19.0, sha256 pin) | Staged `node/bin/node`; `ng063:52-59` already pins version + rejects `/nix/store` bytes | Container build keeps staging the official binary, not a container-built node |
| `upstream/tools/update-packaging/make_full_update.sh` | tree | Complete MAR from the staged dir (`MAR=<objdir>/dist/host/bin/mar MOZ_PRODUCT_VERSION=<ver> MAR_CHANNEL_ID=powerbrowser-default`, cf. `BUILD.md:881-882`) | Produces the MAR PKG-21 measures |
| `node` (host or `.#theia`) | v24.21.0 (host) | All new row scripts | No `yarn` in any quick row |

**Installation:** none beyond the container image build (`podman build -t pb-gecko-build -f powerbrowser/packaging/Containerfile .`, cf. STACK §Installation) and the Ubuntu `libnss3-tools` apt install in the sign/probe job. No `npm install`, no cargo crate, no new flake input.

## Package Legitimacy Audit

No external packages are installed by this phase. No new `npm`, `cargo`, `pip`, or `nix` dependency is introduced: the Containerfile consumes the Debian archive + Mozilla's bootstrap toolchain fetches (the same sources Mozilla ships Firefox with), and every new check script uses the existing `node` runtime plus host `readelf`/`file`/`find`/`patchelf`. Nothing in `theia/node_modules` is imported by `scripts/` (keep the 40-RESEARCH pattern-7 rule: never import Theia dependencies from check scripts). The Node runtime stays the pinned official binary verified by SHA256 (`node-runtime.json`), downloaded the way `package-linux.sh:27-38` already does.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
configuration.toml ──resolveConfig──> generate.mjs ──┬─> release .mozconfig ──> container configure+build
 [product].revision                                    │   (--enable-bootstrap, no Nix-only lines,
 [upstreams].firefox_esr_tag                           │    SB-keyfile line, POWERBROWSER_BRANDING=release)
 [urls].* (update/release_notes/homepage)              ├─> branding/release/** (About legal notices, release prefs)
                                                       └─> version/release.txt (release metadata, never a build input)

powerbrowser/packaging/Containerfile (bookworm + debian-build pkg list)
   └─> podman build (legion) ──> --enable-bootstrap configure (clang/rust/cbindgen + jessie sysroot 2.19)
        └─> ./mach build ──> package-linux.sh (stage theia+node+policies, patchelf strip,
                                              checkout-path assert, precomplete refresh, tarball rewrite)
             ├─> powerbrowser-*.en-US.linux-x86_64.tar.xz
             └─> make_full_update.sh ──> complete.mar (+ release-manifest.json)

TheiaService._resolveConfigDir() ──> ${ProfD}/… (was ${XDG_CONFIG_HOME|~/.config}/powerbrowser)
   ├─> THEIA_CONFIG_DIR env (backend) ──> backend state
   └─> sidecar-state-<profileKey>.json (already profile-suffixed; base moves too)

CLI url ──> PowerBrowserSingleInstanceHandler.handle() ──> stock browser window (BROWSER_CHROME_URL path)
Staged theia/package.json powerbrowserBranding.legalNotices == release-emission (PKG-05)
SB keyfile (outside repo) ──podman -v──> container path ──configure──> MOZ_GOOGLE_SAFEBROWSING_API_KEY
```

### Recommended file layout (new or changed)

```
powerbrowser/packaging/Containerfile              # NEW: bookworm + debian-build package list + bootstrap prereqs
scripts/generate.mjs                               # release mozconfig emitter (new TARGETS row or variant parameter)
powerbrowser/<release mozconfig comparand>         # NEW tracked bytes for the release variant (byte-identity gated)
powerbrowser/packaging/package-linux.sh            # extend patchelf loop to the portable-elf universe
powerbrowser/shell/TheiaService.sys.mjs            # PKG-06: _resolveConfigDir() under getProfileDir()
powerbrowser/shell/PowerBrowserAPI.sys.mjs        # PKG-07: handler opens CLI URL in stock window (+INTERNAL-APIS.md row)
scripts/verify-portable-elf.mjs                    # NEW full-tier row + --self-test (PKG-22)
scripts/verify-sidecar-no-symlinks.mjs             # NEW full-tier row + --self-test (PKG-18)
scripts/verify-package-target-natives.mjs          # NEW full-tier row + --self-test (PKG-23)
scripts/verify-packaged-identity.mjs               # NEW full-tier row + --self-test (PKG-04 half)
scripts/verify-platform.sh                         # append 4-5 rows + self-tests (full tier; quick stays build-free)
docs/RENEWALS.md                                   # one Safe Browsing key row (or the Phase-42-coordinated equivalent)
```

### Pattern A: PKG-06, Theia state under the profile

**Verified state:**
- `TheiaService.sys.mjs:522-527`:
  ```
  _resolveConfigDir() {
    const xdg = PowerBrowserAPI.getEnv("XDG_CONFIG_HOME");
    const home = PowerBrowserAPI.getEnv("HOME");
    const base = xdg || `${home}/.config`;
    return `${base}/powerbrowser`;
  }
  ```
- `PowerBrowserAPI.sys.mjs:427-433` `getProfileDir()` returns `ProfD` off the directory service, never throwing (`""` on failure); `:436-442` `getAppDir()` returns `GreD`.
- The state file is already profile-suffixed: `_profileStateKey()` (`TheiaService.sys.mjs:548-551`) sanitises `getProfileDir()`, and `_stateFilePath` (`:197`) is `${_configDir}/sidecar-state-${key}.json`. The CR-01 comment (`:529-551`) explains why the suffix exists (shared-file reap killed a live backend). PKG-06 moves the *base*, keeping the suffix.
- `THEIA_CONFIG_DIR: this._configDir` (`:697`) is the backend's config dir; `ensureDirectory(this._configDir)` (`:241`) creates it.

**Do:**
1. Retarget `_resolveConfigDir()` to the profile: e.g. `` `${PowerBrowserAPI.getProfileDir()}/powerbrowser-theia` `` (exact leaf is planner's choice; keep it a single path join, never a new pref). Fall back to the current XDG behaviour only when `getProfileDir()` resolves `""` (same never-throw convention as `_profileStateKey`'s `"default"` fallback).
2. Keep `_profileStateKey()` suffixing (harmless under a profile base; preserves the two-instances reasoning and the CR-01 evidence).
3. Audit the three consumers that assumed XDG: the `THEIA_CONFIG_DIR` env, the state-file path, and `_pluginsDir` (`:517`, derived from `_backendMain`, unaffected — verify, do not move). Nothing else reads `_configDir` (`grep` this session: `:79,180,197,241,243,697` only).
4. Update `ng063`'s isolation (`verify-ng-063-packaged-launch.mjs:42` sets `XDG_CONFIG_HOME` to a temp dir): under the new resolution that variable no longer selects the state dir, so the row's "fresh prefix" reasoning must set a temp *profile* (or assert the profile-scoped path) rather than relying on XDG. The matrix no-residue rows derive the inspected paths from the packaged `application.ini` + the profile dir at check time (REQUIREMENTS: "inspect the real paths").
5. `check-internals-boundary.sh` stays green: `getProfileDir`/`getEnv`/`ensureDirectory` are already catalogued (`INTERNAL-APIS.md:45,99`); no new internal touchpoint is added by PKG-06.

### Pattern B: PKG-17, the container bootstrap build

**Verified state:**
- No `Containerfile` exists anywhere outside `upstream/` (`find` this session). The model is `upstream/taskcluster/docker/debian-build/Dockerfile:1-50` (`FROM $DOCKER_IMAGE_PARENT`, `VOLUME` build dirs, `apt-get install` bash/binutils/curl/file/perl/python3-dev/rsync/make/gcc-multilib-adjacent libs/gtk deps…).
- `--enable-bootstrap` is declared at `upstream/build/moz.configure/bootstrap.configure:28-33`; `bootstrap_toolchain_tasks` (`:77-117`) resolves `local-toolchain`-annotated toolchain tasks per host triple — the mechanism that fetches Mozilla's clang/rust/cbindgen/sccache.
- The linux64 sysroot task is `local-toolchain: true` (`sysroot.yml:31-46`, `toolchain-artifact public/build/sysroot-x86_64-linux-gnu.tar.zst`); `build-sysroot.sh:19-22` builds it from **jessie** for `i386|amd64` (gcc 4.9 line, glibc 2.19 baseline per STACK/SUMMARY research).
- The release mozconfig emitter today is single-variant dev (`generate.mjs:3542-3546` TARGETS `.mozconfig`, `emitMozconfig` `:1464-1495`, dev objdir fallback). The tracked `.mozconfig:11-12` carries the two Nix-only lines STACK row 78 names: `--without-wasm-sandboxed-libraries` (`:11`) and `--with-libclang-path="$LIBCLANG_PATH"` (`:12`), plus `--with-ccache=sccache` (`:16`).
- MAR production is `make_full_update.sh` with `MAR=<objdir>/dist/host/bin/mar MOZ_PRODUCT_VERSION=<builtVersion> MAR_CHANNEL_ID=powerbrowser-default` (ng065 `:68-72` drives exactly this; `BUILD.md:881-885` documents the same form; channel gate `config.status` `MAR_CHANNEL_ID == ACCEPTED_MAR_CHANNEL_IDS` at ng065 `:33-36`).

**Do:**
1. Author `powerbrowser/packaging/Containerfile`: `FROM debian:bookworm`, the `debian-build` `apt-get install` set (adapted: keep curl/file/perl/python3/make/rsync; add `nodejs` only if the build needs it for `mach` — prefer the staged official node, not apt node), plus a non-root build user (legion rootless podman; runner user owns the work dir per SEC-08 shape).
2. Add the release mozconfig variant in the generator: second TARGETS row or a variant-parameterised `emitMozconfig` that (a) drops `--with-libclang-path` and `--without-wasm-sandboxed-libraries`, (b) adds `ac_add_options --enable-bootstrap`, (c) adds `ac_add_options --with-google-safebrowsing-api-keyfile=<container mount path>` (Pattern F), (d) uses the release objdir (`objdir-release`, `configuration.toml:70`) and `POWERBROWSER_BRANDING=.../release`. Byte-identity-gate the new bytes like every other TARGETS row; never hand-write the file.
3. Mount, never copy, the SB keyfile: `podman run -v <legion keyfile dir>:<container path>:ro`. The keyfile path lives outside the repo (owner gate) and outside the image (no layer ever contains it).
4. Build sequence on legion (plans end with these exact commands; research does not run them):
   ```sh
   podman build -t pb-gecko-build -f powerbrowser/packaging/Containerfile .
   podman run --rm -v "$PWD:/src:rw" -v <keydir>:/keys:ro -w /src pb-gecko-build \
     bash -c 'MOZCONFIG=/src/<release-mozconfig> ./mach build'
   podman run --rm -v "$PWD:/src:rw" -w /src pb-gecko-build \
     bash powerbrowser/packaging/package-linux.sh
   MAR=objdir-release/dist/host/bin/mar MOZ_PRODUCT_VERSION=<ver> MAR_CHANNEL_ID=powerbrowser-default \
     bash upstream/tools/update-packaging/make_full_update.sh <out>.mar <stage-dir>
   ```
   (Exact mozconfig path/objdir names follow the generator's release-variant decision; `package-linux.sh` honours `POWERBROWSER_OBJDIR` already at `:14`.)
5. Prove `signmar` runs where Phase 49 needs it: from the container build, run `LD_LIBRARY_PATH=<dist>/bin <dist>/bin/signmar -T` (or `-v` against the tracked `mar-primary.der`) on `ubuntu-latest` as the plan's evidence for research-flag (b). Record `toolchain-baseline.sh` output inside the container as the seed of the decision-19 baseline (Pattern G).

### Pattern C: the three portability rows (PKG-22, PKG-18, PKG-23)

All three are full-tier (need the staged tree / container tarball), derive from the tree at check time, compare as set equality, and ship `--self-test` plants per the Verification rules.

- **`portable-elf` (PKG-22).** Universe: every ELF in the extracted tarball **including** `theia/**/native/*.node`, `node/bin/node`, and `rg` if staged (REQUIREMENTS: "the sidecar natives included"). Assertions: (1) no `PT_INTERP` names `/nix/store` (parse `readelf -l`); (2) no `RUNPATH`/`RPATH` names `/nix/store` (parse `readelf -d`); (3) the maximum `GLIBC_X.Y` / `GLIBCXX_X.Y` version symbol required by any ELF (`strings` + `readelf --version-info` or `objdump -T`) is ≤ the sysroot glibc ceiling **derived from the sysroot at check time** (read the sysroot artifact's `libc.so.6`/`VERSION` — never a hand-kept `2.19` literal; the expected floor today is 2.19 from the jessie sysroot, but the row reads it). Staging counterpart: extend `package-linux.sh:74-76` beyond the natives loop to every staged ELF (`find "$STAGE" -type f` + `patchelf --remove-rpath`, or prove the loop already covers the row's universe after the container build drops Nix RUNPATHs at the source). Self-test plants: (a) a copy of a staged ELF with `patchelf --set-rpath /nix/store/...` (or a fixture ELF carrying the string) → red naming the file; (b) a fixture binary requiring a newer GLIBC symbol than the derived ceiling → red naming the symbol and the ceiling source.
- **`sidecar-no-symlinks` (PKG-18).** `test -z "$(find "$STAGE" -type l)"` (ARCHITECTURE §3.6 names exactly this line, before `:87`). Self-test plants one symlink in a fixture stage → red naming the link. Assertion only on the real tree.
- **`package-target-natives` (PKG-23).** For the Linux package: every `.node`, `rg`, and `node` binary is ELF x86-64 (`file -b` / magic `7f 45 4c 46 ... 3e 00`). Structure the checker as target-parameterised from day one (`--target linux-x64` now; `win64` → `PE32+`, `macos` → `Mach-O universal` later) so H/I reuse it without a rewrite. Self-test plants a Linux `.node` into a fixture Windows staging copy → red naming the file and the expected magic. (PITFALLS pitfall 6 is why this row lands in C even though the cross-OS consumers land in H/I.)

### Pattern D: packaged proof (PKG-04), release identity in the package (PKG-05), CLI URL (PKG-07)

- **PKG-04.** `ng063-packaged-launch` already proves: required files (`binary_name`, `theia/lib/backend/main.js`, `theia/lib/frontend/index.html`, `theia/package.json`, `node/bin/node`, `distribution/policies.json`), node pin + no-`/nix/store`-bytes, launch to a ready workbench, backend entry + exe inside the prefix. PKG-04 re-runs it against the **container-built** tarball (the `built-tree.mjs` helpers read the built `application.ini` version and the single `*-linux-x86_64.tar.xz`, so they follow the container objdir with `POWERBROWSER_OBJDIR`). The staged-first resolution under test is `TheiaService.sys.mjs:459-493` (`stagedMain = <app>/theia/lib/backend/main.js`, `stagedNode = <app>/node/bin/node`, preferred whenever the corresponding pref has no user value). No product-code change expected; plan records the green run + its evidence.
- **`packaged-identity` (new row, contract at `RELEASING.md:834`).** Derive the expected release-variant identity from `releaseIdentity()` (`generate.mjs:2796-2808`) + the release-variant emitters, and compare against the staged package: `application.ini` (`Name`/`Version`/`BuildID`/`Vendor`), the staged `theia/package.json` `powerbrowserBranding` block (name/about/legal notices — release `name_suffix ""` vs dev `" Dev"`), and the absence of dev-variant markers. Self-test plants a dev suffix in the staged notice → red naming the file (the contract's own plant).
- **PKG-05.** The release About dialog's notices are `emitLegalNotices()` (`generate.mjs:1754-1776`): `[legal.trademark_notice, "<display><suffix> is not officially associated with Mozilla or its products.", "This product (<repo host>) includes Eclipse Theia, …"]`. The dev/release emitters both carry them; the release variant's Mozilla sentence differs by the empty suffix. The row (fold into `packaged-identity` or a sibling assertion — planner's choice, one row either way) extracts the staged `theia/package.json` fragment and requires equality with the release emission; `verify-branding-preflight.mjs:944-1046` already pins the same channel in the source tree, so the packaged row is the install-closure half. `verify-about-dialog-suppression.mjs` + `verify-branding.mjs` stay green (About dialog still exists; only its legal-notice content is release-variant).
- **PKG-07.** Today's handler (`PowerBrowserAPI.sys.mjs:3636-3648`) sets `preventDefault = true`, opens the shell window on initial launch, focuses it on remote handoff, and **reads no argument** (the documented contract at `INTERNAL-APIS.md:60-61`). The stock-window open path is proven: `browser-window-command.ts:174-192` `window.open(target,'_blank')` falls through `nsWindowWatcher` (no `nsIBrowserDOMWindow` on the shell window) to `AppWindow::CreateNewContentWindow` → stock `BROWSER_CHROME_URL` (`:48-68`). The plan adds URL-argument handling to the handler (first-launch case: after opening the shell window, open the URL in the stock window; remote-handoff case: route to the existing window's stock-tab path), catalogues the new touchpoint in `INTERNAL-APIS.md` (one row per new `Services`/`ChromeUtils` read + the request kind if one is added), and keeps `check-internals-boundary.sh` green. Copy rule: any new user-facing string names "PowerBrowser", states the problem in plain words, and ends with a real on-screen affordance; identifiers go to the diagnostics layer.

### Pattern E: PKG-21, measure and decide

Run `make_full_update.sh` from the staged container tree and weigh the output MAR. Reference points for the plan: tarball 129,529,524 bytes (2026-10-17, SUMMARY §8) and 129,551,024 bytes (this worktree's `objdir/dist` tarball, `ls` this session); prior Gecko-only complete MAR 78,654,141 bytes; expected complete MAR ≈ 130 MB (both xz). Record: exact byte count, MAR filename, producing tree/host/toolchain (BUILD.md attribution rule), and the decision — complete MARs only, per Out of Scope ("Partial MARs: Complete MARs only … unless PKG-21 measures them necessary"), unless the measurement shows a two-week cadence cannot carry the size. The `/download` statement itself is WEB-02 (Phase 47), which consumes this number.

### Pattern F: UPD-29, Safe Browsing keyfile + RENEWALS + live check

**Verified mechanism chain:**
1. `upstream/toolkit/moz.configure:1154` → `simple_keyfile("Google Safebrowsing API")` → option `--with-google-safebrowsing-api-keyfile` → `set_config("MOZ_GOOGLE_SAFEBROWSING_API_KEY", …)` (`keyfiles.configure:36-38`); file read at configure time (`:20-30`, empty/missing is a fatal configure error naming the path).
2. `AppConstants.MOZ_GOOGLE_SAFEBROWSING_API_KEY` (`AppConstants.sys.mjs:185`, substituted via `toolkit/modules/moz.build:288`) feeds `URLFormatter._defaults.GOOGLE_SAFEBROWSING_API_KEY` (`URLFormatter.sys.mjs:127-128`), which expands `%GOOGLE_SAFEBROWSING_API_KEY%` in the provider prefs (`all.js:3389-3414`: v2 `updateURL`/`gethashURL`, v4 `updateURL`/`gethashURL`/`dataSharingURL`, v5 `updateURL`/`gethashURL`).
3. Without a key the build bakes `no-google-safebrowsing-api-key`, and `SafeBrowsing.sys.mjs:551-558` treats that as no-key (list updates cannot authenticate). With the key, the existing `allow` rows (`endpoint-allowlist.json:65-73`) already cover both hosts — no allowlist change.
4. Mozilla precedent for the mount path shape: `/builds/sb-gapi.data` (`linux64/common-opt:5`); win/mac use `${APIKEYDIR}/sb-gapi.data` (`win64/common-opt:8-13`, `macosx64-aarch64/common-opt:8-14`).

**Do:** generator emits `--with-google-safebrowsing-api-keyfile=/keys/sb-gapi.data` (exact container path is planner's choice) in the **release variant only**; dev keeps the unbaked default. Container runs with `-v <legion key dir>:/keys:ro`. Keyfile content is one line (the key; `keyfiles.configure:24` strips whitespace). `docs/RENEWALS.md` gains one row (key name, rotation/renewal date, owner action "re-obtain in Google Cloud console, replace keyfile on legion") — if Phase 42 has not landed `RENEWALS.md`, the plan creates the file with this single row in the DOC-04 shape and notes the merge point. Live check: after first launch of the container build, show the Safe Browsing lists updating (e.g. `safebrowsing/` profile files refreshing / `about:url-classifier` or update log entries naming `safebrowsing.googleapis.com` list downloads with 200s); the check observes the update, it does not assert on any absent log line.

### Pattern G: research-flag-C (c) — what `toolchain-baseline.txt` means under a container build

Today `toolchain-baseline.txt` pins the **Nix flake** toolchain (`rustc 1.97.1 / cargo 1.97.0 / cbindgen 0.29.4`, read this session) and `toolchain-baseline.sh` regenerates those three lines inside `.#firefox`. Under decision 19 it pins the **release container's Mozilla bootstrap toolchain** instead: clang, rust, cbindgen, the sysroot, and the container image digest (STACK row 78: "Drops `--with-libclang-path` … and adds `--enable-bootstrap`; it is a new generator target"). Concretely the plan extends the baseline file (new lines for `clang`, `sysroot <dist+glibc>`, `image <digest>`) and extends the script with a container mode (run inside `pb-gecko-build`, or query the pinned toolchain versions the bootstrap resolved), and the release build job (Phase 49, AUTO-05) diffs its output against the committed file with drift failing the build. Phase 45 establishes the file content + the script mode against the first container build; Phase 49 wires the failing gate.

## Validation Architecture

One driver, one registry. Quick = no build, no browser, no display, no network. Full = needs the built tree, the staged/container package, a launch, or the network. Every row below derives its expectation from the tree at check time and compares as set equality; every row ships a `--self-test` that plants each named fault and must go red naming the drift. "Evidence counts" means the cited artifact or log line a reviewer re-runs or re-reads — never the absence of a log line from the plan's own instrumentation.

| Plan must verify | Tier | Self-test plants (each must go red naming the drift) | Evidence that counts |
|---|---|---|---|
| `portable-elf` (PKG-22): no `/nix/store` INTERP/RUNPATH in any tarball ELF incl. natives; max required GLIBC ≤ sysroot-derived ceiling | full (needs container tarball; runs on the extracted tree, no browser) | (a) `patchelf --set-rpath /nix/store/…` on a fixture ELF; (b) fixture binary requiring a GLIBC symbol newer than the derived ceiling | `readelf -l/-d` excerpts naming the offender; `strings` GLIBC max vs ceiling line citing the sysroot source file |
| `sidecar-no-symlinks` (PKG-18): `find <stage> -type l` empty | full (needs staged tree) | one planted symlink in a fixture stage | the `find` output (empty) or the named link |
| `package-target-natives` (PKG-23): every `.node`/`rg`/`node` matches `--target linux-x86-64` (ELF x86-64) | full (needs staged tree) | a Linux `.node` planted into a fixture Windows staging copy | `file -b` lines per native + target token |
| `packaged-launch` (PKG-04): container tarball reaches a ready workbench with backend entry + exe inside the prefix; node == pin, no `/nix/store` bytes | full (needs container tarball + browser launch) | remove the staged backend (existing plant); mismatch node version | `ng063` PASS line + `/proc` cmdline/exe excerpts; `--version` vs pin |
| `packaged-identity` (PKG-04/05): staged `application.ini` + `theia/package.json` branding == release-variant derivation | full (needs container tarball; derivation is static) | dev suffix planted in the staged notice (contract's own plant) | field-by-field derivation-vs-staged diff (empty) |
| About-dialog release notices (PKG-05, folded into the row above or a sibling) | full (same inputs) | drop one notice from the staged fragment | staged `legalNotices` array == `emitLegalNotices(release)` |
| CLI URL opens stock window (PKG-07) | full (needs built binary; launch with a URL arg) | launch with URL opens no stock window / opens in-Theia instead | observed stock window URL + handler `INTERNAL-APIS.md` row + `check-internals-boundary.sh` green |
| Theia state under profile (PKG-06) | full for the behaviour (launch writes state under ProfD); static shape may ride a quick row if one is added | temp `XDG_CONFIG_HOME` no longer captures state; state file appears under the profile path | state-file absolute path excerpts from two profiles differing; no-residue matrix inspecting the real paths |
| Safe Browsing live update (UPD-29) | full + network (live check, not `--quick`) | n/a (positive observation, not a gate on absence) | list-update transaction naming `safebrowsing.googleapis.com` with 200s + refreshed classifier files; keyfile path documented as outside the repo; `RENEWALS.md` row present |
| MAR measured + partial decision (PKG-21) | full (needs `make_full_update.sh` output) | n/a (measurement + recorded decision) | `wc -c` of the complete MAR + producing tree/host/toolchain attribution; decision text in the plan/commit (complete-only unless measured too large) |
| Release mozconfig byte-identity (PKG-17 scaffolding) | quick (text derivation) | hand-edited release mozconfig line | `generated-byte-identity` green on the new TARGETS row |
| `generated-byte-identity`, `release-identity`, `update-channel`, brand scan, `check-patch-surface`, `diff-theia-core.sh`, `check-internals-boundary.sh` | quick (as today) | existing plants | `--quick` green |

Nyquist note: `docs/VALIDATION.md` (if the phase writes one) is derived from this table — same rows, same tiers, same plants, same evidence. If a row cannot be run (no container tarball yet), the plan records it as blocked-behind-the-owner/local-build gate with the exact commands to run, not as green.

## Pitfalls

1. **The container build is the fix; do not "fix" portability in the Nix tree.** `patchelf`ing the Nix-built `INTERP`/`RUNPATH` or hand-editing the GLIBC requirement cannot produce a supported portable build (libxul genuinely needs GLIBC_2.42 symbols from the Nix toolchain). The staging strip (Pattern C) removes *staged-native* RUNPATHs; the *Gecko* portability comes only from the jessie-sysroot bootstrap build. (STACK Alternatives: patchelf-after-Nix rejected.)
2. **A hand-kept `2.19` literal in the row.** The GLIBC ceiling must be derived from the sysroot at check time (read the sysroot artifact), or the row silently passes a future sysroot bump. Same rule as every derived-not-hand-kept gate.
3. **Staging `cp -a` reintroducing symlinks.** `package-linux.sh:47,60` copies real files today, but any future `cp -a node_modules` of a package dir brings symlinks back — the `sidecar-no-symlinks` row is the permanent guard (PITFALLS "Looks Done" checklist).
4. **Wrong-OS sidecar.** The Linux container build stages the Linux Theia tree only. Cross-OS staging (Windows/macOS sidecars on hosted runners + `node-runtime.json` per-target entries) is Phase H/I; `package-target-natives` is written target-parameterised now so it is reused, not rewritten.
5. **Keyfile in the repo or the image.** `--with-…-keyfile` reads a *path*; the path must be a mount (`-v …:ro`), never a `COPY`/`ADD` line and never a committed file. `scan-brand-residue`/secret-scan the Containerfile and the release mozconfig for the key value in CI-shaped review (the value itself never appears; only the mount path does).
6. **XDG-masked tests after PKG-06.** Any harness that sets `XDG_CONFIG_HOME` to isolate state (ng063 today) must be re-pointed at profiles, or it passes while asserting about a directory the product no longer uses. The no-residue matrix rows must derive paths from `application.ini` + ProfD, not from XDG.
7. **CLI-URL injection.** The handler must treat the argument as an untrusted URL: hand it to the stock-window path that re-validates the scheme (http/https, mirroring `browser-window-command.ts:180`'s gate), never `eval`/shell it, never persist it except through the normal history path.
8. **No Actions cache in the release path.** The container build on legion uses local disk/sccache owned by the runner user; any hosted fallback or sign job restores no cache (PITFALLS pitfall 5; Out of Scope "Actions cache in the release path").
9. **MAR channel mismatch after the mozconfig variant lands.** The release variant must keep `MAR_CHANNEL_ID == ACCEPTED_MAR_CHANNEL_IDS == <app>-default` (`emitMozconfig` today at `:1482-1484`); `update-channel` + ng065 catch drift. A MAR stamped with any other channel fails with error 22 (`updatererrors.h:45`) after download.
10. **Same-ESR buildID discipline.** Do not pin `MOZ_BUILD_DATE` to the ESR tag (PITFALLS pitfall 7): two revisions on one ESR need distinct buildIDs or revision -2 is never offered. `descriptor-monotonic` (Phase 44) is the later gate; Phase 45 must not break its precondition.
11. **Unstaged new files invisible to the brand scan.** `Containerfile`, new row scripts, new fixtures: `git add` (or `git stage`) before trusting `scan-brand-residue` green.

## Open Items

| # | Question | Status | Owner-gate label |
|---|---|---|---|
| 1 | Obtain the Google Safe Browsing API key; store the keyfile on legion outside the repo | Open — owner action, blocks UPD-29 live check and any keyed release build | **OWNER GATE** (this phase): key + keyfile path |
| 2 | Run the first container bootstrap build on legion (podman) and produce tar.xz + complete MAR | Open — longest single item; plans prepare everything and end with exact commands | **OWNER/LOCAL RUN GATE** (this phase; executes in Phase 49 `build-linux` or owner/local run) |
| 3 | (a) First-container-build contents — answered from the tree (§Pattern B): bookworm + `debian-build` package list; bootstrap fetches clang/rust/cbindgen + jessie sysroot (glibc 2.19); release mozconfig variant drops Nix-only lines, adds `--enable-bootstrap` | Answered (HIGH for mechanism; build itself unrun) | none — planning input |
| 4 | (b) Jessie-built `signmar` on `ubuntu-latest` — answered from the tree: `Program("signmar")` (`moz.build:22-34`), `LD_LIBRARY_PATH=dist/bin` run form, `libnss3-tools` for `pk12util`; low glibc floor (2.19) runs on ubuntu-latest's 2.39. Still unproven until the first container build runs `signmar -v` there | Mechanism answered; live proof is Open, rides item 2 | **RUN GATE** (same as 2) |
| 5 | (c) `toolchain-baseline.txt` under a container build — answered: pins the container's Mozilla bootstrap toolchain (decision 19); file gains clang/sysroot/image-digest lines, script gains a container mode, drift fails the build (AUTO-05, Phase 49) | Answered (convention); content lands with the first container build | **RUN GATE** (same as 2) for the measured values |
| 6 | Phase 41 still executing — `repo-controls`, `workflows`/`zizmor` live rows, environments, Apps | Assumption: do not depend on their live outputs; Phase 45 rows must pass/fail independent of Phase 41 state | none — record the assumption in the plan |
| 7 | `docs/RENEWALS.md` absent — Phase 42 DOC-04 owns the file | Assumption: Phase 45 adds the single Safe Browsing row in DOC-04 shape if the file is still absent, and notes the merge point; or defers the row to Phase 42 with a pointer — planner's choice, recorded | none — cross-phase assumption |
| 8 | Partial-MAR decision threshold | Open until PKG-21 measures; default stays complete-only (Out of Scope) | none — decided from the measurement |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Jessie sysroot ⇒ glibc 2.19 floor for the release build (STACK/SUMMARY research; `build-sysroot.sh` jessie baseline). The row derives the ceiling from the sysroot artifact, so a different floor is handled. | Pattern B/C | If the bootstrap resolves a newer sysroot, the row follows it; no hardcoded `2.19` anywhere in a gate |
| A2 | Ubuntu-latest glibc (2.39 per STACK live facts) runs a jessie-linked `signmar` via `LD_LIBRARY_PATH=dist/bin`. Proven by running `signmar -v` there, not by reasoning. | Pattern B, Open 4 | If it does not run, Phase 49 sign job needs the documented fallback (container `signmar` static link or hosted-build `signmar`); plan records the probe |
| A3 | The release mozconfig is a second generator TARGETS row (or variant parameter) with its own tracked comparand, following the `TARGETS`/`generated-byte-identity` convention. | Pattern B | If the planner instead forks a hand-written mozconfig, `generated-byte-identity` cannot cover it and UPD-11's derivation breaks — reject that shape in review |
| A4 | `docs/RENEWALS.md` single-row creation in DOC-04 shape is an acceptable merge point if Phase 42 has not landed it. | Pattern F, Open 7 | Phase 42 overwrites/merges; keep the row's columns exactly in DOC-04 shape to make the merge trivial |
| A5 | Phase 41's in-flight outputs are not prerequisites: container work, staging, and all Phase 45 rows are verifiable without live `repo-controls`. | Open 6 | If a plan step shells out to a Phase-41-owned script that does not exist yet, that step is re-scoped to this phase |
| A6 | The ~130 MB complete-MAR estimate (tarball 129.5 MB + prior Gecko-only MAR 78.6 MB) holds within a factor that keeps the two-week cadence viable; the decision is recorded from the actual weighing. | Pattern E | If the MAR measures pathologically large, the partial-MAR question reopens per PKG-21's own clause |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Nix-shell Gecko build (`nix develop .#firefox`, `/nix/store` INTERP + GLIBC_2.42) | Debian bookworm container + `--enable-bootstrap` (jessie sysroot, glibc 2.19) | This phase (PKG-17) | Portable tarball + complete MAR; Nix shell stays for dev only |
| Theia state under `XDG_CONFIG_HOME`/`HOME` (`_resolveConfigDir`) | Theia state under the Gecko profile dir (`ProfD`) | This phase (PKG-06) | Profile-scoped state; matrix rows inspect real paths |
| Single dev `.mozconfig` from the generator | Dev + release `.mozconfig` variants (release: no Nix lines, `+--enable-bootstrap`, +SB-keyfile line) | This phase (PKG-17/UPD-29) | Release configuration is generated bytes, byte-identity gated |
| `ng063-packaged-launch` only | + `packaged-identity` + `portable-elf` + `sidecar-no-symlinks` + `package-target-natives` rows | This phase | Every success-criterion row exists and is proven against the container tarball |
| `toolchain-baseline.txt` pins the Nix toolchain (rustc/cargo/cbindgen) | Pins the container's Mozilla bootstrap toolchain (+clang/sysroot/image digest) | This phase establishes, Phase 49 gates (decision 19, AUTO-05) | Drift in the release toolchain fails the build |
| No Safe Browsing key (`no-google-safebrowsing-api-key` baked) | Key from keyfile outside the repo, mounted into the container | This phase (UPD-29, owner gate) | Authenticated list updates; RENEWALS row; live check |

**Deprecated / superseded:** the old `docs/RELEASING.md` probe-stage names (`packaged-product-correctness-linux`, `stage-sidecar.sh`, `patches/050-*`, `run-install-matrix.sh`, `objdir-release` rebuild notes at `:225,235,988`) describe the pre-workstream probe and are not the Phase 45 implementation — cite `ROADMAP.md` Phase 45 success criteria and this research instead. `powerbrowser/packaging/version-nplus1/` fixtures are older than the pin (per 40-RESEARCH deprecation) and are not release tooling.
