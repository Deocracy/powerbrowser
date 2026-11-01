# Phase 45: Portable Linux release build (C) — Pattern Map

**Phase:** 45-portable-linux-release-build-c
**Sources:** `45-CONTEXT.md`, `45-RESEARCH.md` (both 2026-10-22)
**Repo root:** `/home/chris/gsd-workspaces/deploy/dsh/phase-45`
**Status:** `docs/RENEWALS.md` absent (confirmed by `ls` this session); no `Containerfile` outside `upstream/` (confirmed by research `find`); `configuration.toml` already declares `[[variants]]` `dev` + `release` (`:60-70`).

## 1. File inventory (create / modify)

| # | File | New / Mod | Role | Data flow |
|---|------|-----------|------|-----------|
| F1 | `powerbrowser/packaging/Containerfile` | NEW | Build environment definition | `upstream/taskcluster/docker/debian-build/Dockerfile:19-50` package list + `debian:bookworm` → `podman build -t pb-gecko-build` (legion, owner/local run) → `--enable-bootstrap` configure inside |
| F2 | `scripts/generate.mjs` (release `.mozconfig` variant) | MOD (new TARGETS row / variant-parameterised `emitMozconfig`) | Generator (only writer) | `configuration.toml` `[product]` + `[[variants]] release` → `emitMozconfig(config, release)` → tracked comparand → `MOZCONFIG=<release>` container configure |
| F3 | `powerbrowser/<release mozconfig comparand>` (tracked bytes, exact path per TARGETS convention) | NEW | Byte-identity comparand | `generate.mjs` emission → committed bytes → `verify-generated-identity` gate |
| F4 | `powerbrowser/packaging/package-linux.sh` | MOD (extend `patchelf` loop to portable-elf universe) | Staging (owns the bytes) | container `objdir-release/dist/bin` + staged Theia/Node/policies → precomplete refresh → rewritten `*-linux-x86_64.tar.xz` |
| F5 | `powerbrowser/shell/TheiaService.sys.mjs` (`_resolveConfigDir`) | MOD (one function) | Runtime state location | `PowerBrowserAPI.getProfileDir()` (ProfD) → `_configDir` → `THEIA_CONFIG_DIR` env + `_stateFilePath` + `ensureDirectory` |
| F6 | `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (`PowerBrowserSingleInstanceHandler.handle`) | MOD (read CLI URL arg, open stock window) | Boundary (only Gecko-touch file) | CLI url → `findShellWindow`/`openShellWindow`/`openBrowserWindow`/`openStockTab` → stock `BROWSER_CHROME_URL` window |
| F7 | `powerbrowser/INTERNAL-APIS.md` | MOD (one row per new touchpoint) | Catalogue (derived, not maintained beside) | `check-internals-boundary.sh --catalogue` ↔ table rows; red on uncatalogued `file:line` |
| F8 | `scripts/verify-portable-elf.mjs` | NEW (full-tier + `--self-test`) | Gate: PKG-22 | extracted tarball ELFs (+ `theia/**/native/*.node`, `node/bin/node`, `rg`) → `readelf -l/-d` + `strings` GLIBC max vs sysroot-derived ceiling → PASS/FAIL naming file |
| F9 | `scripts/verify-sidecar-no-symlinks.mjs` | NEW (full-tier + `--self-test`) | Gate: PKG-18 assertion | staged tree → `find <stage> -type l` empty → PASS/FAIL naming link |
| F10 | `scripts/verify-package-target-natives.mjs` | NEW (full-tier + `--self-test`, `--target` parameterised) | Gate: PKG-23 | staged `.node`/`rg`/`node` → `file -b` magic vs target (`linux-x64` now; PE32+/Mach-O later) |
| F11 | `scripts/verify-packaged-identity.mjs` | NEW (full-tier + `--self-test`) | Gate: PKG-04 half + PKG-05 | `releaseIdentity()` + release-variant emitters (derived) vs staged `application.ini` + staged `theia/package.json` `powerbrowserBranding` → field-by-field diff |
| F12 | `scripts/verify-platform.sh` | MOD (append 4–5 rows + self-test twins) | One driver, one registry | rows land in full block (`~4845` ng063 / `~4830` mar-update-hop neighbourhood); quick block (`~3571+`) gains only the `--self-test` twins |
| F13 | `scripts/verify-ng-063-packaged-launch.mjs` | MOD (re-point XDG isolation if it masks new path) | Gate: PKG-04 re-proof on container tarball | `built-tree.mjs` package → temp prefix → launch → `/proc` in-prefix proof |
| F14 | `docs/RENEWALS.md` | NEW-if-absent (single SB-key row, DOC-04 shape; else coordinate with Phase 42) | Renewal ledger | key name + rotation date + owner action (re-obtain, replace keyfile on legion) |
| F15 | `scripts/toolchain-baseline.sh` + `toolchain-baseline.txt` | MOD (container mode + new lines) | Baseline pin (decision 19) | container `pb-gecko-build` interior (clang/sysroot/image digest) → committed file → Phase 49 AUTO-05 drift gate |
| — | `release-manifest.json` + `*.tar.xz` + `complete.mar` | Build ARTIFACTS (not tracked) | Outputs measured, not kept | `package-linux.sh` → tarball; `make_full_update.sh` → MAR; PKG-21 weighs the MAR |

Out of scope for file changes: `upstream/` stays untouched (`git -C upstream diff` empty); no Theia-core change (`diff-theia-core.sh` green); PKG-05 needs no new Theia file (existing `legalNotices` channel); `docs/RELEASING.md:827-836` contracts are reused, not rewritten.

## 2. Analog map (closest existing analog + excerpts)

### F4 staging — `powerbrowser/packaging/package-linux.sh`
Closest analog is itself (extend, don't fork). Verified shape:
`powerbrowser/packaging/package-linux.sh:13-14` honours `POWERBROWSER_OBJDIR`; `:27-38` pins `node-runtime.json` download + `sha256sum -c`; `:40` runs `./mach package`; `:42-44` discovers `STAGE` via newest `precomplete`; `:47-61` stages `theia/lib`, `package.json`, `better-sqlite3` prebuilt, official node, `policies.json`; `:74-76` `patchelf --remove-rpath` natives loop; `:84-86` checkout-path `grep -rlF "$ROOT/"` assertion; `:87` `createprecomplete.py` refresh; `:89-95` deterministic `tar --sort-name` rewrite.
Phase 45 extends the `:74-76` loop to the portable-elf universe (every staged ELF) or proves it already covers it once Nix RUNPATHs vanish at the source.

### F8/F9/F10/F11 new rows — `scripts/verify-ng-063-packaged-launch.mjs` (contract + plant shapes)
Packaged-launch contract + plant shapes to copy:
```js
// scripts/verify-ng-063-packaged-launch.mjs:1-9 — tier + R13 contract
// ... launched from a temp prefix it reaches a ready workbench with the
// sidecar's backend entry AND its Node binary inside that prefix
// (/proc/<pid>/{cmdline,exe}) ... R13: the packaged node/bin/node is the official
// release pinned in powerbrowser/packaging/node-runtime.json.
```
```js
// :22-26 — locate + required-files gate
extractPackage(); const need = [config.identity.binary_name, 'theia/lib/backend/main.js',
  'theia/lib/frontend/index.html', 'theia/package.json', 'node/bin/node',
  'distribution/policies.json'];
// :42 — temp-prefix isolation (AUDIT for PKG-06: XDG no longer selects the state dir)
process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'ng063-cfg-'));
// :46-48 — in-prefix proof via /proc
const ours = backends().filter(b => b.main.startsWith(`${prefix}/`));
for (const b of ours) if (!b.exe.startsWith(`${prefix}/`)) failures.push(...)
// :52-59 — pin + no-/nix/store-bytes (R13 shape reused by portable-elf)
if (readFileSync(bin).includes('/nix/store/')) failures.push(...);
const version = execFileSync(bin, ['--version']...); if (version !== pin?.version) ...
// :61-73 — backends() /proc scan (cmdline main.js + --hostname, exe via readlink)
```
`scripts/lib/built-tree.mjs:15-19` `builtVersion()` reads built `application.ini` (never typed); `:22-30` `packagePath()` single-`*-linux-x86_64.tar.xz` or fail with rerun command; `:32-39` `extractPackage()` untar-to-mkdtemp + single-top-dir assert; `:44-57` `configStatus()` runs `objdir/config.status` under its own `#!` interpreter.

### Full-row + `--self-test` twin idiom — `scripts/verify-mar-update-hop.mjs`
Copy the twin structure verbatim:
```js
// scripts/verify-mar-update-hop.mjs:43-48 — Honestly --quick: node:crypto + text in mkdtemp only
// Usage: node scripts/verify-mar-update-hop.mjs / --self-test
const SELF_TEST = args.includes('--self-test'); // :66, unknown-arg guard :67-72
// :344+ — selfTest(): mkdtemp, mirror() builds mock proof, control GREEN first, then
// expectRed(label, mutate, needleFile, needleValue) requires each plant red naming file+value
// :386-398 expectRed harness; :401-409 control-must-be-green; plants: same-version loop,
// stale MAR bytes (hashValue), Mozilla host in resolver log, literal-IP carve-out.
```
New rows F8–F11 follow: full row needs container tarball/stage (emphatically not `--quick`); `--self-test` twin is text/bytes in `mkdtemp` (honestly `--quick`) and rides in the `--quick` array beside `mar-update-hop-self-test`.

### Derive-from-tree, never hand-kept lists — `scripts/verify-upstream-pins.mjs`
```js
// scripts/verify-upstream-pins.mjs:151-160 — listTracked via git ls-files (derived, not kept)
execFileSync('git', ['ls-files'], { cwd: root, ... }).split('\n')...
// :162-169 inScope() build-relevant tree; :174-180 sweepExcluded() generated/.planning/inventory + own fixture
// :603+ self-test plants eight faults IN MEMORY (workflow defaults, tag literal, @theia bump,
// lockfile drift) with unmutated-tree-green control; never edits a tracked file.
```
Apply to: GLIBC ceiling derived from the sysroot artifact at check time (never a `2.19` literal); MAR/channel rows derived from generator/manifest; identity rows derived from `releaseIdentity()`.

### Registry placement — `scripts/verify-platform.sh`
```sh
# scripts/verify-platform.sh:3571-3573 — --quick set: no build, no browser, no display, no network; runs in BOTH modes
# :4469 "mar-update-hop-self-test|node $REPO_ROOT/scripts/verify-mar-update-hop.mjs --self-test" (quick twin)
# :4830 "mar-update-hop|node $REPO_ROOT/scripts/verify-mar-update-hop.mjs" (full row, needs proof run, FAILs when evidence absent)
# :4845 "ng063-packaged-launch|node $REPO_ROOT/scripts/verify-ng-063-packaged-launch.mjs" (full wave-E block ~4842+)
```
New rows: full rows beside `:4845`; self-test twins beside `:4469`. One driver, no sibling driver; full-tier rows that cannot run without the container tarball FAIL naming the build procedure (mar-hop precedent), never skip green.

### F5 PKG-06 — `TheiaService.sys.mjs:522-527` + `PowerBrowserAPI.getProfileDir/getAppDir`
```js
// powerbrowser/shell/TheiaService.sys.mjs:522-527 — THE one function PKG-06 retargets
_resolveConfigDir() {
  const xdg = PowerBrowserAPI.getEnv("XDG_CONFIG_HOME");
  const home = PowerBrowserAPI.getEnv("HOME");
  const base = xdg || `${home}/.config`;
  return `${base}/powerbrowser`;
}
// :548-551 — keep suffixing (harmless under a profile base; preserves CR-01 two-instance reasoning)
_profileStateKey() { const profileDir = PowerBrowserAPI.getProfileDir();
  return profileDir ? profileDir.replace(/[^a-zA-Z0-9]+/g, "_") : "default"; }
// consumers that follow the one change — :180 _configDir derivation; :197
this._stateFilePath = `${this._configDir}/sidecar-state-${this._profileStateKey()}.json`;
// :241 ensureDirectory(this._configDir); :697 THEIA_CONFIG_DIR: this._configDir
// :459-493 staged-first _resolveSidecar (stagedMain/stagedNode under appDir preferred)
```
Boundary already catalogued:
```js
// powerbrowser/shell/PowerBrowserAPI.sys.mjs:427-433 getProfileDir() ProfD, never throws ("")
429: return Services.dirsvc.get("ProfD", Ci.nsIFile).path;
// :436-442 getAppDir() GreD — the install prefix of a packaged tree
```
Plan: `` `${getProfileDir()}/powerbrowser-theia` `` (leaf = planner's choice, single path join, no new pref); fallback to current XDG behaviour only when `getProfileDir()` resolves `""`. Audit the three XDG-assuming consumers (`THEIA_CONFIG_DIR`, state-file path, `_pluginsDir` `:517` verify-not-move; `grep` shows `_configDir` only at `:79,180,197,241,243,697`). No new internal touchpoint → `check-internals-boundary.sh` stays green.

### F6 PKG-07 — `PowerBrowserAPI.sys.mjs` handler + stock-chrome path
Current ignoring contract + stock path (both verified):
```js
// powerbrowser/shell/PowerBrowserAPI.sys.mjs:3636-3648 — handler reads NO argument today
handle(cmdLine) { const win = PowerBrowserAPI.findShellWindow();
  if (win) { PowerBrowserAPI.focusWindow(win); cmdLine.preventDefault = true; return; }
  if (!PowerBrowserAPI.isInitialLaunch(cmdLine)) return;
  PowerBrowserAPI.openShellWindow(); cmdLine.preventDefault = true; }
// :3590 isInitialLaunch STATE_INITIAL_LAUNCH; :1004 findShellWindow; :1008 focusWindow;
// :1021 openShellWindow (chrome://powerbrowser literal); :1049 openBrowserWindow(url);
// :1073-1128 openStockTab — http/https + about:newtab scheme wall before either branch
```
In-app URL precedent: `theia/extensions/tab-uris/src/browser/browser-window-command.ts:184` `window.open(target,'_blank')` with `:48-68` comment (no `nsIBrowserDOMWindow` on shell → `AppWindow::CreateNewContentWindow` stock chrome). `powerbrowser/INTERNAL-APIS.md:60-61` documents the never-reads-an-argument contract — the plan amends it; new `Services`/`ChromeUtils` reads get one catalogue row each. Message-kind discipline precedent: `PowerBrowserAPI.sys.mjs:295` `SHELL_MESSAGE_KINDS`, `:2217-2275` `handleShellMessage` sender wall + switch, `:2270` `unknown kind` rejection.

### F2/F3/F11 generator — `scripts/generate.mjs` TARGETS
```js
// scripts/generate.mjs:3540-3546 — TARGETS row shape (generated + tracked + variant + emit)
{ generated: '.mozconfig', tracked: '.mozconfig', variant: 'dev', emit: emitMozconfig }
// :1464-1495 emitMozconfig — channel/mar lines :1482-1484, Nix-only lines :1485-1486
'--without-wasm-sandboxed-libraries' / '--with-libclang-path="$LIBCLANG_PATH"'
// :1393 updateChannel(); :2796-2808 releaseIdentity() (esrVersion/revision/releaseKey)
// :1754-1776 emitLegalNotices() [own, `${base}${suffix} ${MOZILLA_NON_ASSOCIATION_TAIL}` (:1722), eclipse]
// :1832-1844 emitTheiaBranding (legalNotices channel); variants dev/release already in configuration.toml:60-70
```
Release variant: second TARGETS row (or variant-parameterised emit) that drops the two Nix-only lines, adds `ac_add_options --enable-bootstrap` and `ac_add_options --with-google-safebrowsing-api-keyfile=<mount>`, uses `objdir-release` + `POWERBROWSER_BRANDING=.../release`; byte-identity-gated like every TARGETS row; never hand-write the file (A3 rejects a forked hand-written mozconfig).

### Theia About channel (PKG-05, no new Theia file)
`theia/.../powerbrowser-branding-config.ts:24-56` `readBrandingConfig()` (sync try/catch, `stringArrayOrUndefined`); `powerbrowser-about-dialog.tsx:72-106` `get legalNotices()` → `{this.legalNotices.map(notice => <p>)}` (text nodes, never markup). Packaged row asserts staged `theia/package.json` fragment == release emission; `verify-branding-preflight.mjs:944-1046` already pins the source-tree half.

### F1 container — `upstream/taskcluster/docker/debian-build/Dockerfile:1-50`
`FROM $DOCKER_IMAGE_PARENT`, `VOLUME` build dirs, `apt-get install bash binutils bzip2 cpio curl file findutils gawk gnupg gzip jq ... make perl procps python3-dev rsync screen tar unzip uuid wget zip` (`:19-50`). Author `powerbrowser/packaging/Containerfile` `FROM debian:bookworm` + that set (adapt: keep curl/file/perl/python3/make/rsync; prefer staged official node over apt node), plus non-root build user (legion rootless). Bootstrap mechanism: `upstream/build/moz.configure/bootstrap.configure:28-33` `--enable-bootstrap`; `:77-117` `bootstrap_toolchain_tasks` `local-toolchain` filter (clang/rust/cbindgen/sccache); sysroot `upstream/taskcluster/kinds/toolchain/sysroot.yml:31-46` `local-toolchain:true` `sysroot-x86_64-linux-gnu.tar.zst`; `upstream/taskcluster/scripts/misc/build-sysroot.sh:19-22` `dist=jessie` for `i386|amd64` (glibc 2.19 floor; row derives it, never literals it).

### Safe Browsing keyfile (UPD-29) — `simple_keyfile` + Mozilla precedent
```python
# upstream/toolkit/moz.configure:1154 — one-line mechanism, not new code
simple_keyfile("Google Safebrowsing API")
# upstream/build/moz.configure/keyfiles.configure:7-38 — configure-time file read, strip, fatal on empty/missing, bakes MOZ_GOOGLE_SAFEBROWSING_API_KEY (:36-38)
# Mozilla precedent — upstream/browser/config/mozconfigs/linux64/common-opt:5
ac_add_options --with-google-safebrowsing-api-keyfile=/builds/sb-gapi.data
# (win64/mac variants use ${APIKEYDIR}/sb-gapi.data)
```
Chain: `AppConstants.MOZ_GOOGLE_SAFEBROWSING_API_KEY` (`toolkit/modules/moz.build:288` substitution) → `URLFormatter.sys.mjs:127-128` `%GOOGLE_SAFEBROWSING_API_KEY%` → provider prefs `modules/libpref/init/all.js:3389-3414`; allowlist already allows both SB hosts (`endpoint-allowlist.json:65-73`); dev keeps unbaked default. Mount `-v <legion keydir>:/keys:ro`, never `COPY`; one-line keyfile; live check observes list updates (never asserts an absent log line).

### `signmar` program — `upstream/modules/libmar/tool/moz.build:22-34`
```python
if CONFIG["MOZ_BUILD_APP"] != "tools/update-packaging":
    Program("signmar")  # SOURCES += HOST_SOURCES; USE_LIBS mar/nspr/nss/signmar/verifymar
```
Run form `LD_LIBRARY_PATH=<dist>/bin signmar -T/-s/-v` (ng065 precedent; `RELEASING.md:940-944`); Ubuntu `libnss3-tools` supplies `pk12util`/`certutil`. MAR production: `make_full_update.sh` with `MAR=<objdir>/dist/host/bin/mar MOZ_PRODUCT_VERSION=<ver> MAR_CHANNEL_ID=powerbrowser-default` (`docs/BUILD.md:881-885`); channel gate `ACCEPTED_MAR_CHANNEL_IDS == MAR_CHANNEL_ID` (ng065 `:33-36`).

### `packaged-identity` contract — `docs/RELEASING.md:827-836`
Row contracts reused (not rewritten): `packaged-launch` (extracted package launches, in-prefix) + `packaged-identity` (`application.ini` + staged `theia/package.json` carry release-variant identity; plant: dev suffix in staged notice → red). `install-matrix-linux` derives install/launch/no-residue paths from packaged `application.ini`.

### `toolchain-baseline` (decision 19) — Pattern G
Today `toolchain-baseline.txt` pins Nix flake (`rustc 1.97.1 / cargo 1.97.0 / cbindgen 0.29.4`); `scripts/toolchain-baseline.sh:7-9` regenerates inside `.#firefox`. Under decision 19 it pins the container bootstrap toolchain: add `clang` / `sysroot <dist+glibc>` / `image <digest>` lines + container mode (`-v` into `pb-gecko-build` or query resolved versions); Phase 49 AUTO-05 diffs with drift failing the build. Phase 45 establishes content + mode against the first container build.

## 3. Key patterns

1. **Generator owns every release-config byte.** New release `.mozconfig` is a TARGETS row / variant-parameterised `emitMozconfig` (drop two Nix-only lines, add `--enable-bootstrap` + keyfile line, `objdir-release`), byte-identity-gated; never hand-write a mozconfig.
2. **Derive the expectation from the tree at check time; compare as set equality.** GLIBC ceiling from the sysroot artifact, channels from `updateChannel()`/`config.status`, identity from `releaseIdentity()` — no hand-kept `2.19`, channel, or version literals.
3. **Every new check is one registry row plus its `--self-test` twin.** Full row needs the container tarball/stage; twin is `mkdtemp`/in-memory with control-green-first and each plant red naming file + drift (mar-hop `mirror()`/`expectRed`, upstream-pins in-memory plants).
4. **Staged-first resolution + in-prefix proof.** `TheiaService._resolveSidecar` prefers `<app>/theia` + `<app>/node` (`:459-493`); ng063 proves backend entry + exe inside the prefix via `/proc/<pid>/{cmdline,exe}` and node pin + no-`/nix/store`-bytes.
5. **Profile-scope state via ProfD with a never-throw fallback.** Retarget the one function `_resolveConfigDir()` under `getProfileDir()` (fallback to XDG only on `""`); keep `_profileStateKey()` suffixing; re-point any XDG-masking harness (ng063 `:42`) at temp profiles.
6. **One driver, one registry; quick stays cheap.** Full rows (`portable-elf`, `sidecar-no-symlinks`, `package-target-natives`, `packaged-launch/identity`, matrix) live in the full block; only their `--self-test` twins ride `--quick` (no build/browser/display/network).
7. **Secrets mount, never COPY.** SB keyfile path is the only thing the tree carries (`/keys/sb-gapi.data`-style mount, `-v …:ro`); the value never appears in repo, image layer, scan, or log; `docs/RENEWALS.md` carries the rotation row (create in DOC-04 shape if Phase 42 hasn't landed).
8. **Staging owns the bytes; rows inspect them.** Extend `package-linux.sh`'s `patchelf --remove-rpath` natives loop to the row's full ELF universe; the checkout-path `grep -rlF` assertion and `createprecomplete.py` refresh stay load-bearing; rows `find`/`readelf`/`file` the staged tree.
9. **Boundary catalogue discipline.** Every new `Services`/`ChromeUtils` read or request kind in the PKG-07 handler gets one `INTERNAL-APIS.md` row; `check-internals-boundary.sh` (incl. `--catalogue`) stays green; copy rule: "PowerBrowser" + plain problem + real on-screen affordance, identifiers to diagnostics.
10. **The container build is the portability fix; don't patchelf the Nix tree.** Nix `INTERP /nix/store` + `GLIBC_2.42` is red-by-design for `portable-elf`; only the jessie-sysroot bootstrap build turns it green. MAR channel mismatch (`MAR_CHANNEL_ID != ACCEPTED_MAR_CHANNEL_IDS`) fails with error 22 — keep the release variant's channel lines equal.

## 4. Validation map (plan must implement)

| Requirement | Row(s) | Tier | Plants (each red naming drift) | Evidence |
|---|---|---|---|---|
| PKG-22 | `portable-elf` | full (container tarball) | `patchelf --set-rpath /nix/store/…` fixture; newer-GLIBC-symbol fixture | `readelf -l/-d` excerpts; `strings` GLIBC-max vs ceiling line citing sysroot source |
| PKG-18 | `sidecar-no-symlinks` | full (staged) | one planted symlink | `find -type l` output (empty) or named link |
| PKG-23 | `package-target-natives --target linux-x64` | full (staged) | Linux `.node` in fixture Windows copy | `file -b` per native + target token |
| PKG-04 | `packaged-launch` (container re-proof) | full (launch) | remove staged backend; mismatch node | ng063 PASS + `/proc` excerpts; `--version` vs pin |
| PKG-04/05 | `packaged-identity` | full (tarball; derivation static) | dev suffix in staged notice | field-by-field derivation-vs-staged diff (empty) |
| PKG-06 | Theia-under-profile (+ matrix no-residue) | full behaviour | temp `XDG_CONFIG_HOME` no longer captures state | state-file abspaths from two profiles; paths derived from `application.ini` + ProfD |
| PKG-07 | CLI URL → stock window | full (launch w/ URL arg) | no stock window / in-Theia open | observed stock URL + `INTERNAL-APIS.md` row + boundary green |
| UPD-29 | SB live update | full + network (not `--quick`) | n/a (positive observation) | list-update transaction (`safebrowsing.googleapis.com` 200s) + refreshed classifier files; keyfile path outside repo; RENEWALS row |
| PKG-21 | MAR measured + partial decision | full (`make_full_update.sh` output) | n/a | `wc -c` + tree/host/toolchain attribution; complete-only unless measured too large |
| PKG-17 scaffolding | release-mozconfig byte-identity | quick | hand-edited release line | `generated-byte-identity` green on new TARGETS row |
| Regressions | `generated-byte-identity`, `release-identity`, `update-channel`, brand scan, `check-patch-surface`, `diff-theia-core.sh`, `check-internals-boundary.sh` | quick | existing plants | `--quick` green |

Nyquist note: a `VALIDATION.md` written from this table keeps the same rows/tiers/plants/evidence; rows that need the not-yet-built container tarball record blocked-behind-owner/local-build with exact commands, never green.

## 5. Pitfalls carried forward

- Hand-kept `2.19` ceiling; `cp -a` reintroducing symlinks; wrong-OS sidecar (write `--target` parameterised now for H/I reuse); keyfile in repo/image; XDG-masked tests after PKG-06; CLI-URL injection (scheme wall `http/https` mirroring `browser-window-command.ts`, never eval/shell); no Actions cache in release path; same-ESR `MOZ_BUILD_DATE` pinning (breaks descriptor-monotonic precondition); unstaged new files invisible to `scan-brand-residue` (`git ls-files` iteration — stage before trusting green).
