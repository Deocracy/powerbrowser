---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
reviewed: 2026-11-20T22:48:36Z
depth: deep
files_reviewed: 28
files_reviewed_list:
  - .github/workflows/rebase-orca.yml
  - .github/workflows/release.yml
  - bundled-extensions/claude-agent-sdk/package.json
  - flatpak/org.debios.PowerBrowser.json
  - orca-overlay/patches/070-claude-agent-sdk-dir.patch
  - orca-overlay/patches/080-orcad-external-claude-agent-sdk.patch
  - orca-overlay/upstream/010-installed-electron-switch/src/main/orcad/orcad-browser-provider.installed-electron-switch.test.ts
  - orca-overlay/upstream/010-installed-electron-switch/upstream.json
  - powerbrowser/packaging/bundled-xpi.json
  - powerbrowser/packaging/package-linux.sh
  - powerbrowser/packaging/package-macos.sh
  - powerbrowser/packaging/package-windows.sh
  - powerbrowser/packaging/stage-bundled-xpi.sh
  - scripts/detect-upstreams.mjs
  - scripts/download-plugins.mjs
  - scripts/export-orca-seam-pr.mjs
  - scripts/rebase-orca.sh
  - scripts/release-train.mjs
  - scripts/win-sign-list.mjs
  - theia/extensions/bundled-extensions/package.json
  - theia/extensions/bundled-extensions/src/browser/bundled-extensions-frontend-module.ts
  - theia/extensions/bundled-extensions/src/browser/reinstall-command.ts
  - theia/extensions/bundled-extensions/src/common/bundled-extensions-copy.ts
  - theia/extensions/bundled-extensions/src/common/bundled-extensions-protocol.ts
  - theia/extensions/bundled-extensions/src/node/bundled-extensions-backend-module.ts
  - theia/extensions/bundled-extensions/src/node/bundled-extensions-seed.ts
  - theia/extensions/bundled-extensions/src/node/bundled-extensions-service.ts
  - theia/extensions/bundled-extensions/tsconfig.json
findings:
  critical: 3
  warning: 4
  info: 5
  total: 12
  necessity: 0
status: issues_found
---

# Phase 68: Code Review Report

**Reviewed:** 2026-11-20T22:48:36Z
**Depth:** deep
**Files Reviewed:** 28
**Status:** issues_found

## Summary

All 28 files in scope were read at HEAD e0c19c54. For the pre-existing files, the review concentrated on `git diff 2b5f4609..HEAD`. Calls were traced into the scripts these files invoke: `check-win-sidecar.sh`, `verify-licence-allowlist.mjs`, `generate-licensing.mjs` and `verify-platform.sh`'s row runner. They were also traced into Theia 1.76's plugin deployer (`plugin-deployer-impl.js`, `plugin-deployer-handler-impl.js`, `local-directory-plugin-deployer-resolver.js`, `plugin-vscode-deployer-participant.js`). Nothing was built or run. The 14 findings of 68-11-REVIEW.md are not repeated. WR-06 from that review (undo the copy on an install failure) is confirmed fixed in `bundled-extensions-service.ts:58-65`.

Owner decisions this review relies on, so the following are not reported:
- The `--rulings` guard that closes the Linux and Windows release while `terms_check` is pending. Ratified by D-30 / P68-38.
- `--filesystem=home` in the Flatpak manifest. Ratified by the 2026-11-04 platforms decision, P68-07.
- The SDK seams classed `pb-only`. Ratified by P68-38.
- The accepted risk that compromising legion amounts to compromising the Windows signing identity. Recorded in `release.yml`'s sign-windows header and docs/RELEASING.md. WR-01 is a hardening that the Orca SUMS makes cheap, not a contradiction of that ruling.

The three blockers:
1. The weekly re-pin cannot go green on its hosted runner. A SKIP that the uBlock pin added (68-08) is turned red by the replay's SKIP-is-red rule (68-02), and the fixture self-test cannot see it.
2. The Windows sidecar build now always runs `spawnSync('npm', …)`, which does not resolve on Windows.
3. The macOS Orca artifacts lose their executable bits in the artifact round trip, and the merge copies the lost mode.

## Critical Issues

### CR-01: Every hosted re-pin replay stops at "row licence-allowlist skipped" because the uBlock XPI is never cached on the runner

**File:** `scripts/rebase-orca.sh:55,67-69,218-227`; emitter `scripts/verify-licence-allowlist.mjs:273,303,508`; runner `.github/workflows/rebase-orca.yml:98-106`
**Issue:** `stage_rows` runs `verify-platform.sh --only licence-allowlist` and turns any SKIP line red unless it matches `SKIP_OUT_OF_SCOPE='^licence-allowlist: SKIP -- upstream/ absent'`. Since 68-08 (d8643e27), the default mode of `verify-licence-allowlist.mjs` also calls `bundledCheck` (`:508`). `cachedXpiFirstLine` (`:273`) looks for `.mozbuild/bundled-xpi/uBlock0@raymondhill.net-1.76.0.xpi`. When that file is absent it pushes `licence-allowlist: SKIP -- uBlock0@raymondhill.net 1.76.0 is not cached in .mozbuild/bundled-xpi/; ...` (`:303`), and the row still exits 0.

On the `rebase-orca.yml` runner, `.mozbuild/` is a fresh, git-ignored directory. Nothing in the workflow or in `rebase-orca.sh` runs `stage-bundled-xpi.sh`, so the XPI is never there. `skip_line` therefore returns that line every time, and the replay stops with `rebase-orca: FAIL -- row licence-allowlist skipped: ...`. The release train then opens a "stopped" tracking issue for every new Orca tag, and OVL-02 ("re-pins by itself") cannot be met.

The self-test stays green because its `verify-platform.sh` stand-in (`:416-425`) never emits the bundled-extension leg. Its only out-of-scope case (`upstreamskip`, `:462`) is the `upstream/` one.
**Fix:** Do not widen the exemption, because a SKIP really proves nothing there. Give the row what it needs: before `stage_rows`, stage the pinned XPI into the cache. The download is sha256-pinned and runs no code.
```bash
stage_xpi_cache() {
  say "xpi cache"
  local d; d="$(mktemp -d)"
  capture bash "$1/powerbrowser/packaging/stage-bundled-xpi.sh" "$d"
  rm -rf "$d"
  [ "$RC" -eq 0 ] || { red "xpi cache stage-bundled-xpi.sh exited $RC"; return 1; }
}
# run_replay, full mode: ... stage_coverage "$root" || return 1; stage_xpi_cache "$root" || return 1; stage_rows ...
```
Also make the fixture's `verify-platform.sh` stand-in print the real bundled-extension SKIP line when a fixture cache file is absent. Add a plant that must stop at `row licence-allowlist skipped`, and a control that stages the cache and must pass.

### CR-02: The Windows sidecar build always fails: download-plugins.mjs now runs spawnSync('npm', ...) on windows-latest

**File:** `scripts/download-plugins.mjs:127-128` (also `:241`); reached from `.github/workflows/release.yml:319-325` (windows-sidecar `yarn build` → `applications/browser` `download:plugins`)
**Issue:** The 68-09 assembly loop runs `npm ci` for every `bundled-extensions/<folder>/`, and `claude-agent-sdk` is always present. It calls `spawnSync('npm', [...], { cwd: scratch })` with no `shell`. On Windows, libuv resolves an extensionless command only as `<name>.com` and `<name>.exe`. setup-node installs npm as `npm.cmd`, `npm.ps1` and a POSIX `npm` script, none of which matches. The result is `r.status === null`, with `r.error` set to `ENOENT`. Since the Node CVE-2024-27980 fix, a `.cmd` cannot be spawned without `shell: true` either.

The code then calls `die('... npm ci failed: spawnSync npm ENOENT')`, so the `windows-sidecar` job fails at `yarn build`. `build-windows` and `sign-windows` never run, and PLAT-01's Windows artifact cannot be produced. Before 68-09, the only `npm` and `.bin/theia` spawns in this script ran only for declared `[[extensions]]`, and `configuration.toml` declares none, so the Windows path never reached them. The new spawn is unconditional.
**Fix:** Run npm's own JS entry through the running Node, which works on every OS and needs no shell:
```js
const npmCli = process.env.npm_execpath && /npm-cli\.js$/.test(process.env.npm_execpath)
    ? process.env.npm_execpath
    : join(dirname(process.execPath), process.platform === 'win32' ? '' : '../lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
const r = spawnSync(process.execPath, [npmCli, 'ci', '--ignore-scripts', /* ... */], { cwd: scratch, encoding: 'utf8' });
```
Apply the same change at `:241` (`pack`). Then add a `win32` assertion to the `bundled-extensions` row: the script must contain no bare `spawnSync('npm'`.

### CR-03: The macOS Orca trees lose their executable bits in the artifact round trip, and the universal merge copies the lost mode

**File:** `.github/workflows/release.yml:2181-2189,2296-2304` (upload), `:2397-2405` (merge); `powerbrowser/packaging/package-macos.sh:66-90` (`orca_universal`), `:403-408` (per-arch staging from `PB_MAC_ORCA_DIR`)
**Issue:** `macos-orca-arm64` and `macos-orca-x64` upload the staged directory itself with `actions/upload-artifact`. That action does not preserve Unix file modes; its README says "File permissions are not maintained during artifact upload". After `download-artifact`, every file in `macos-orca-*` has mode 0644, including:
- node-pty's `build/Release/spawn-helper`, which node-pty `posix_spawn`s for every terminal;
- the ripgrep binaries;
- `agent-browser-darwin-*`.

`orca_universal` then copies the lost mode onto the merged file: `chmod --reference="$arm/$a"` (`:75`) and `chmod --reference="$out/$a"` (`:81`). `cp -a` (`:70`) carries 0644 for every other file. The per-arch mode stages `PB_MAC_ORCA_DIR`, a downloaded artifact by its own usage text, with `cp -a` (`:406`), so the same thing happens there. No check catches it:
- `check-win-sidecar.sh check` compares content hashes only;
- `orca-packaged-tree` and `package-target-natives` judge names and magic.

The result is a bundle whose orcad cannot spawn a PTY, run ripgrep or start agent-browser on macOS. Nothing consumes the universal tree in this phase (P68-31 scope), but `package-macos.sh <arch>` is the code path the macOS bundle will take.
**Fix:** Carry the modes through the artifact. In each thin job, archive the tree, upload the tarball, and list the tarball (not the loose files) in SUMS:
```bash
(cd "$RUNNER_TEMP" && tar -cf macos-orca-arm64.tar -C macos-orca-arm64 .)
# upload macos-orca-arm64.tar; SHA256SUMS + its digest cover the tar; consumers: tar -xpf after admission
```
Alternatively, record `stat -f '%Lp %N'` modes in a `MODES` file listed in SUMS and re-apply them after admission. Then add an `orca-packaged-tree` clause, for the macOS and Linux targets, requiring every Mach-O/ELF executable (not `.node`/`.dylib`) to be mode 0755.

## Warnings

### WR-01: sign-windows signs Orca PE files by name only, although the admitted SUMS gives their exact hashes

**File:** `scripts/win-sign-list.mjs:137-169`; call site `.github/workflows/release.yml:910-912`
**Issue:** `orcaChecks` compares names only. A file under `orca/` in legion's zip whose name matches a SUMS entry is listed for Authenticode signing whatever its bytes are. The PE classification itself (`startsMz(join(root, r))`, `:146,161`) is read from the untrusted staged file, not from the admitted artifact that sign-windows has already downloaded and re-admitted (`:910`).

Two consequences:
- Legion can swap `orca/out/orcad/node_modules/node-pty/build/Release/pty.node` for any PE of the same name, and the job signs it.
- A `.node` PE addon listed in SUMS but absent from the staged tree is not "required" (`presentSet.has(r)` is false), so its absence is never reported.

For the Gecko half, names are all the tree can give (the accepted SEC-12 risk). For `orca/`, `package-windows.sh:83-84` copies the admitted files byte for byte, so hash equality is available at no cost and would close the gap for every Orca PE.
**Fix:** Pass the admitted directory and require hash equality:
```js
// --orca-sums windows-orca/SHA256SUMS --orca-dir windows-orca
const want = new Map(listed.map(l => [l.path, l.sha]));               // from the SUMS lines
const isPe = r => PE.test(r) || startsMz(join(orcaDir, r));             // classify from the admitted copy
const required = new Set([...want.keys()].filter(isPe));
for (const f of actual) if (sha256(join(root, f)) !== want.get(f)) failures.push(`changed: ${ORCA}${f} differs from the admitted windows-orca bytes`);
```
Add plants for a same-name PE with different bytes and for an absent `.node` PE.

### WR-02: The checkout-path greps treat a grep error as a pass

**File:** `powerbrowser/packaging/package-linux.sh:49-54`; `powerbrowser/packaging/package-macos.sh:268-270,460-462`
**Issue:** `host_root_grep` reads `grep -rlF "$PB_HOST_ROOT/" "$@" 2>/dev/null || true`. Exit status 2 (an unreadable file, a missing target such as a mistyped `$STAGE/orca`, or an I/O error) yields no lines, and the check passes silently. The macOS greps extended in this phase to `$RES/orca` and `$WORK/orca-merged` have the same form. `check-win-sidecar.sh purge` (`:72-75`), the gate these comments cite as the model, states the opposite rule explicitly: "a grep error is a failure, not a pass".
**Fix:**
```bash
host_root_grep() {
    local hits rc=0
    hits="$(grep -rlF -e "$PB_HOST_ROOT/" "$@")" || rc=$?
    [ "$rc" -le 1 ] || fail "grep could not read the stage while looking for $PB_HOST_ROOT/ (exit $rc)"
    [ -z "$hits" ] || fail "the staged tree still carries the host checkout path $PB_HOST_ROOT/: $(head -n1 <<<"$hits")"
}
```
Use the same form at the two macOS sites.

### WR-03: The PR body and test command are derived from the pinned tree, not from the main the PR targets

**File:** `scripts/export-orca-seam-pr.mjs:131-136`
**Issue:** `exportSeams` reads `.github/pull_request_template.md` and `AGENTS.md` from `orcaDir` (the pinned `orca/`) and then applies the seams to a fresh clone of Orca's `main` (`fetchMain`). The pin trails `main` by up to a week at best. When the hand-off is deferred to the end-of-milestone pass, the gap is much longer. If `main` changed its template headings or its Test line, then `pr.md` passes `checkHeadings` against the stale template, but the PR does not match the template Orca's maintainers enforce. P68-18 records that an outside contributor's PR that does not follow it is ignored. The self-test cannot catch this, because its fixture uses one directory as both the pinned tree and main.
**Fix:** Read both files from the `main` clone after `fetchMain`: `readFileSync(join(main, TEMPLATE_REL))` and `readFileSync(join(main, AGENTS_REL))`. Add a self-test plant in which the main fixture adds a heading the pinned fixture lacks, and require `pr.md` to carry it.

### WR-04: A crash during a seeded upgrade turns the extension into a permanent "user uninstall"

**File:** `theia/extensions/bundled-extensions/src/node/bundled-extensions-seed.ts:58-63,149-161`
**Issue:** `copyInto` runs `fs.rm(deploymentDir/<id>)` and then `fs.rename(tmp, deploymentDir/<id>)`. If the backend dies between the two, the profile is left with no `<id>` folder and the record still at the old version. Possible causes are a quit, a crash, or the sidecar being killed by `TheiaService` during startup. The record is written only after the whole seed returns (`:197`). On the next start, rule 2 (`record[id] !== undefined && !exists(...)`, `:60`) reads that state as the user's uninstall and skips the extension for good.

orcad then reports `ERR_MODULE_NOT_FOUND` for every Claude chat session. The only recovery is the reinstall command, and the user has no reason to know about it because they never removed anything. The window is short, but it is on the first start after every PowerBrowser update that bumps the SDK, which is exactly when the sidecar start is slowest.
**Fix:** Keep the old copy until the new one is in place, so no state ever shows an absent folder:
```ts
const dest = path.join(deploymentDir, id);
const old = await fs.mkdtemp(path.join(deploymentDir, `.${id}-old-`));
await fs.rm(old, { recursive: true, force: true });
if (await exists(fs, dest)) await fs.rename(dest, old);   // atomic: dest -> hidden sibling
await fs.rename(tmp, dest);                                // atomic: new copy in place
await fs.rm(old, { recursive: true, force: true });
```
At the start of `seedBundledExtensions`, restore any `.<id>-old-*` sibling as `<id>` when `<id>` is absent, before the rules run.

## Info

### IN-01: Leftover `.<id>-XXXXXX` folders in deployedPlugins are never removed

**File:** `theia/extensions/bundled-extensions/src/node/bundled-extensions-seed.ts:151,157-159`
**Issue:** `copyInto` creates its temporary folder inside `deploymentDir`. A process exit during `fs.cp` skips the `catch` cleanup and leaves a copy of the SDK (a few MB) as a dot-folder. Theia's resolver skips dot-entries (`local-directory-plugin-deployer-resolver.js` `isIgnored`), so the folder is harmless, but nothing reaps it and each interrupted seed or reinstall adds one.
**Fix:** At the start of `seedBundledExtensions`, remove `deploymentDir/.${id}-*` for every shipped id. This combines with the WR-04 restore step.

### IN-02: The reinstall command's absent list can be overwritten by an older response

**File:** `theia/extensions/bundled-extensions/src/browser/reinstall-command.ts:32-43,51`
**Issue:** `refresh()` is fired without serialisation from `onStart`, from every `onDidDeploy`, and after `execute`. Two overlapping calls can resolve out of order. The older `absent()` result then wins, and the command is shown or hidden wrongly until the next deploy event.
**Fix:** Tag each call with a sequence number and apply a result only if it is the latest: `const n = ++this.seq; const ids = await ...; if (n === this.seq) this.absent = new Set(ids);`.

### IN-03: Overlay imports are carried one level deep only

**File:** `scripts/export-orca-seam-pr.mjs:96-105,146-149`
**Issue:** `importedOverlayFiles` resolves the relative specifiers on a seam's added lines and copies those overlay files. It does not follow the copied files' own relative imports into other `orca-overlay/files/` paths. A seam whose helper imports a second overlay file would export a patch with a dangling import, and no check goes red. No `browser-provider` or `web-entry` seam imports an overlay file today (`orca-overlay/patches/010-*.patch`), so this is latent.
**Fix:** Iterate to a fixed point over `regexExtract` of each carried file. Alternatively, go red on any relative specifier in a carried file that resolves under `filesDir`.

### IN-04: The upstream token refusal does not catch lowercase `pb` path segments

**File:** `scripts/export-orca-seam-pr.mjs:47-48,107-112`
**Issue:** `TOKEN_PB` is case-sensitive `PB`. The overlay's own layout uses lowercase `pb/` and `pb-*` (`src/renderer/src/pb/…`, `vite.pb-*.config.ts`). A seam that carried any of these would name PowerBrowser in an upstream PR, against P68-18's "naming no PowerBrowser identifier", and stay green. This is latent today, for the same reason as IN-03.
**Fix:** Also refuse `(^|[^A-Za-z])pb([/-]|$)` on added and header lines of `seam.patch`.

### IN-05: The frontend proxy uses Theia's deprecated WebSocketConnectionProvider

**File:** `theia/extensions/bundled-extensions/src/browser/bundled-extensions-frontend-module.ts:8-10`
**Issue:** In `@theia/core` 1.76, `ws-connection-provider.d.ts:4` marks `WebSocketConnectionProvider` as `@deprecated ... keep API compatibility for a while`. A later Theia re-pin can remove it, and Rule 1 then forbids patching it back.
**Fix:** Use `ServiceConnectionProvider.createProxy<BundledExtensionsService>(ctx.container, BUNDLED_EXTENSIONS_SERVICE_PATH)` from `@theia/core/lib/browser/messaging/service-connection-provider`.

---

_Reviewed: 2026-11-20T22:48:36Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
