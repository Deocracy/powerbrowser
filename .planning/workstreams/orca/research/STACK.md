# Technology Stack: v1.7 Orca integration (additions only)

**Project:** Power Browser v1.7 (workstream `orca`)
**Researched:** 2026-11-04
**Scope:** new capabilities only. The Theia sidecar spawn and token gate, web tabs, modes, the patch stack, the brand scan and the release pipeline are not re-researched.
**Overall confidence:** MEDIUM-HIGH. Linux launch contract: HIGH (run and observed). macOS and Windows: MEDIUM (artifact contents extracted and read, launch not run). Gecko APIs: HIGH from source, MEDIUM live (nothing here was run inside PB).

Evidence labels: **[RAN]** executed on this host (Linux x64, NixOS) in this session. **[READ]** read from source or an extracted artifact. **[UNVERIFIED]** not checked. Orca source = `/home/chris/coding/orca-eval` (HEAD 3052dd79). Installed build = `/nix/store/zqzrjgzy297m4b7pgr0k2165l3wmhix8-orca-ide-1.4.245-extracted/resources/`. Gecko source = `/home/chris/coding/Power-Browser/upstream` (153.5.1esr).

## 0. Headline findings (read these first)

1. **One Orca artifact per OS is enough, and the JS is identical across OSes.** `orcad.js`, `orcad-server.js`, `daemon-entry.js`, all 1295 renderer files and the `commonSha256` map are byte-identical in the 1.4.248 deb, mac zip and Windows installer [RAN: sha256 compare of extracted trees]. Only the native add-ons differ, because the mac artifact carries signed Mach-O files and the Windows artifact carries SignPath-signed PE files. So fetch each OS's own artifact, to get that OS's signed natives.
2. **Only the Linux AppImage ships a Node runtime.** deb and rpm exclude it (`APPIMAGE_NODE_RUNTIME_FPM_EXCLUDE`), and the mac and Windows installers have none [READ: `src/shared/appimage-node-runtime.ts:1-10`; extracted deb has no `node-runtime/`; Windows `app-64.7z` listing has none]. PB must fetch Node itself, from nodejs.org, at Orca's pinned version and hash.
3. **orcad refuses any Node except its pin (24.22.1).** PB ships 24.19.0 for Theia (`powerbrowser/packaging/node-runtime.json`). orcad needs its own Node 24.22.1 at an exact relative path, or it exits 78 [RAN-adjacent, READ: `orcad-bundled-runtime.ts:63-76`].
4. **The slot has an identity check.** The slot's `.version` must equal a sha256 over the slot's files. Removing one file without recomputing `.version` makes orcad exit 78 with "invalid readiness identity" [RAN]. I reproduced the formula (section 3).
5. **orcad ignores stdin EOF.** It kept running 30 s after its stdin closed [RAN]. PB needs its own supervision and reaping (the Theia watchdog does not exist in orcad).
6. **Two different env vars name the profile.** orcad reads `ORCA_USER_DATA`; the bundled CLI reads `ORCA_USER_DATA_PATH` [RAN]. Setting only the first makes `orca repo add` talk to the user's real Orca desktop (see the incident note in the handoff).
7. **Firefox has no CDP.** `upstream/remote/` contains `webdriver-bidi/` and `marionette/` only [RAN: `ls`]. Orca's browser driver (`agent-browser` 0.39.4) is CDP-only [RAN: `--help`]. A Gecko browser provider cannot reuse it.

## 1. Orca release artifacts

Repository: `stablyai/orca`, tags `vX.Y.Z`. Latest stable on 2026-11-04 is **v1.4.248** (published 2026-11-04T02:36:20Z). The spike ran 1.4.245 (2026-10-30). Release assets are not signed with a detached signature; two integrity sources exist and agree (below). The `mobile-android-v*` tags are unrelated pre-releases; ignore them.

### 1.1 Assets (sha256 = GitHub API `digest`; items marked * I also computed locally with `sha256sum`)

| OS / arch | Asset (v1.4.248) | Size | sha256 |
|-----------|------------------|------|--------|
| Linux x64 | `orca-ide_1.4.248_amd64.deb` * | 188,226,460 | `3dee1b7d597b5a2914539dc995d9e4e1547e3bafb1e679295d5884f439cb4082` |
| Linux arm64 | `orca-ide_1.4.248_arm64.deb` | 184,094,732 | `40260b31917ae17e73226b278e1a4d5ae569f20037cf08b4d06e276743c7c5d2` |
| Linux x64 (alt) | `orca-linux.AppImage` | 251,665,131 | `c703c986646f4a7c336907bdf159327f997437e4790ee30a415df437b5982e43` |
| macOS arm64 | `Orca-1.4.248-arm64-mac.zip` * | 278,921,094 | `ccf61abe483747bf805c2e685cc39e8e09f55fccd404a6e8bd187fb393c695d6` |
| macOS x64 | `Orca-1.4.248-mac.zip` | 288,866,791 | `33434b4cd55a42d5c2ec895963d98c39be1bfe65391ac01134c0c2bfa97ea3b9` |
| Windows x64 | `orca-windows-setup.exe` * | 209,178,656 | `57afde556925d9e599d1a2572161a2b813a2b8f7152467a73ef7f31f7aae1f1a` |

Spike-validated fallback v1.4.245: deb amd64 `54420e22d49dda9df66ed4e943b62844c955d4fd9d5c1059bf8f7702b760bc89`, mac arm64 zip `e9455d0ac741bf116ae4071f756dab53ad58daa02d7aa8d778030873181abb92`, mac x64 zip `4e1f126d9db41dd369a5fd59e80b7228b4f4b0182e9fb8885846fc5558b2052a`, Windows `e1c96fd574878fa57257ca28cdf7298c586639153fb25ebe6253c47b1cb07803` (all from the API digest, not recomputed).

Independent second source: `latest-linux.yml` and `latest.yml` carry a sha512 (base64) per artifact. For the deb and the Windows exe I recomputed sha512 and it matched the YAML exactly [RAN]. Use sha256 from the API as the pin and cross-check against the YAML at pin time. The release is not marked immutable (`gh api` returned no `immutable` field) and GitHub release assets can be replaced or deleted after publish, so the pin file with its sha256, not the tag, is the authority. I saw no sign that Orca replaces assets; this is a precaution.

**Recommended pin for the first plan:** v1.4.248, with 1.4.245 as the recorded fallback. Only 1.4.245 has been launched. 1.4.248 was checked statically (artifact hashes, extraction, `.runtime-node` markers equal to the same Node pin, identical JS across OSes). The first task of the fetch phase must relaunch the spike-003 probe against the slot built from 1.4.248.

### 1.2 What each artifact contains (extracted and listed)

| Needed file | Linux deb | macOS zip | Windows exe | AppImage |
|-------------|-----------|-----------|-------------|----------|
| orcad template (`orcad.js`, `orcad-server.js`, workers, `out/cli/index.js`, `out/mobile-web`, `targets/<9 targets>`, `orcad-template.json`) | `opt/Orca/resources/orcad-template/` | `Orca.app/Contents/Resources/orcad-template/` | `resources/orcad-template/` inside `$PLUGINSDIR/app-64.7z` | yes (not extracted) |
| Web client (`web-index.html` + `.orca-web-client-files.json`) | `opt/Orca/resources/app.asar.unpacked/out/renderer/` | `Orca.app/Contents/Resources/app.asar.unpacked/out/renderer/` | `resources/app.asar.unpacked/out/renderer/` | yes |
| `ripgrep/<os>-<arch>/rg` | `opt/Orca/resources/ripgrep/` | `.../Resources/ripgrep/` | `resources/ripgrep/` | yes |
| `agent-browser-<os>-<arch>` (18.4 MB, CDP driver) | `opt/Orca/resources/agent-browser-linux-x64` | `.../Resources/agent-browser-darwin-<arch>` | `resources/agent-browser-win32-x64.exe` | yes |
| Pinned Node runtime | **absent** | **absent** | **absent** | `resources/node-runtime/bin/node` |
| Selection/provisioning entry `app.asar.unpacked/out/main/orcad/orcad-local-serve-selection-entry.js` | present | not checked | not checked | present |

Corrections to the spike notes: the web client directory is `out/renderer` (INPUTS.md already says so). `orcad-template/out/mobile-web` is the mobile page bundle and is not what `--web-client-root` serves.

The web client directory is 1295 files / 73.4 MB in 1.4.248. `.orca-web-client-files.json` lists the 1286 files orcad will serve (73.3 MB); everything else (`index.html`, `popout.html`, `space.html`) returns 404 [RAN]. Shipping only the listed files plus the manifest works [RAN on 1.4.245: 1225 listed files, `web-index.html` 200, an asset 200, `popout.html` 404]. The orcad template is 60.6 MB; only the host target's directory (0.6 MB Linux, about 5 MB mac and Windows) is needed at run time.

### 1.3 Fetch, verify, extract without running Orca desktop

All three extraction recipes were run [RAN] for the `orcad-template` and `renderer` paths. `resources/ripgrep` and the agent-browser path are listed in the archives but were not extracted separately.

```bash
# Linux (any host with ar + tar): selective extract, no install
ar p orca-ide_1.4.248_amd64.deb data.tar.xz | tar -xJ -C "$OUT" \
  ./opt/Orca/resources/orcad-template \
  ./opt/Orca/resources/app.asar.unpacked/out/renderer \
  ./opt/Orca/resources/ripgrep

# macOS (bsdtar ships with macOS; also works on Linux)
bsdtar -xf Orca-1.4.248-arm64-mac.zip -C "$OUT" \
  'Orca.app/Contents/Resources/orcad-template' \
  'Orca.app/Contents/Resources/app.asar.unpacked/out/renderer' \
  'Orca.app/Contents/Resources/ripgrep'

# Windows (7-Zip): NSIS installer, two steps
7z x -o"$TMP" orca-windows-setup.exe '$PLUGINSDIR/app-64.7z'
7z x -o"$OUT" "$TMP/\$PLUGINSDIR/app-64.7z" resources/orcad-template \
  resources/app.asar.unpacked/out/renderer resources/ripgrep
```

Rules for the fetch script (modelled on `scripts/fetch-upstream.sh`): pin file holds `{version, per-OS asset name, sha256}`; refuse to extract unless sha256 matches; extract into a new empty directory; verify every extracted template file against `orcad-template.json` (`commonSha256`, `targets.<t>.files`) before use; reject archive members with absolute paths or `..`. After the macOS and Windows natives are re-signed by Orca, `orcad-template.json` already holds the post-signing hashes (`resealOrcadTemplateManifest`, `packaged-orcad-template.cjs`), so the manifest check is valid for each OS's own artifact and invalid across OSes. Do not mix.

- Windows installer is x64 only. The `win32-arm64` target is inside it, so a Windows arm64 PB can use the same installer. There is no Windows arm64 Orca installer.
- The macOS x64 and arm64 zips both carry both darwin targets. Use the zip matching the PB build arch. Whether the two zips' template trees are identical was not checked.
- macOS: Orca's `.runtime-node`/signing relies on Node's `disable-library-validation` entitlement so that natives signed by another team load; Node's official binary has it [READ: nodejs/node `tools/osx-entitlements.plist`, six keys including `com.apple.security.cs.disable-library-validation`]. Not exercised on a Mac.

## 2. Node runtime pin and the conflict with PB's Node

| Item | Value | Source |
|------|-------|--------|
| Orca's pin | Node **24.22.1** (Electron 43.8.6 tracked, N-API 10) | `src/shared/node-runtime-pin.ts` `NODE_RUNTIME_PIN` [READ] |
| `.runtime-node` in 1.4.245 and 1.4.248 templates | same executable sha256 per target | [RAN: compared] |
| PB's Theia Node | **24.19.0** | `powerbrowser/packaging/node-runtime.json` [READ] |

Archive hashes for 24.22.1 (match both Orca's pin table and `https://nodejs.org/dist/v24.22.1/SHASUMS256.txt`; I downloaded the linux-x64, darwin-arm64 and win-x64 archives and hashed them [RAN]):

| Target (Orca name) | Archive | Archive sha256 | Executable sha256 (= `.runtime-node`) |
|---|---|---|---|
| linux-x64-glibc | `node-v24.22.1-linux-x64.tar.gz` | `eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c` | `e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb` |
| darwin-arm64 | `node-v24.22.1-darwin-arm64.tar.gz` | `89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7` | `6f32069480ec14d52b6d7b1f3c7124cfbbc46203abf5ddf5c65b127435f3f329` |
| darwin-x64 | `node-v24.22.1-darwin-x64.tar.gz` | `d132557e7ee2b85af08b0c8c34338e65c6430f2238d01f727728ef42dc83b035` | `cc6f41f72e3eb4460154952e56a35afdd96b6995cea51cd25e637355a2955a51` |
| win32-x64 | `node-v24.22.1-win-x64.zip` | `d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5` | `d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5` |
| linux-arm64-glibc | `node-v24.22.1-linux-arm64.tar.gz` | `33c37be234ba8bee041961047b19160f4d7d0f164e8e246f78bdd10feff148b3` | `c8c5721679d8d1a09e9987e345d5f9a64899bb85f7a384783ba8a93e6e62348a` |

Orca uses the `.tar.gz` for Linux; PB's `node-runtime.json` uses `.tar.xz` (nodejs.org `.tar.xz` x64 sha256 `6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6`). Verify the extracted executable against the executable sha256 in the last column regardless of archive format.

**Recommendation:** ship Orca's pinned Node as its own file inside the orcad slot for v1.7. Do not change PB's Theia Node in this milestone. A later size optimisation is to bump `node-runtime.json` to 24.22.1 and point the slot's runtime path at the same bytes: orcad compares `realpath(process.execPath)` with `realpath(<slot>/../runtimes/node-<sha>/bin/node)`, so a symlink to PB's Node would satisfy it on POSIX; Windows needs a copy [READ: `orcad-bundled-runtime.ts:37-45,63-76`]. Cost of not deduplicating: about 94 MB (Windows) to 127 MB (Linux) per OS.

## 3. The orcad slot (what PB must assemble)

orcad is not run from the template directly. Orca composes a **slot**: template common files plus `targets/<host>/` files plus `ripgrep/...` and the agent-browser binary from the app's `resources/`, then writes `.version` [READ: `orcad-artifact-materializer.ts:assembleOrcadArtifact, artifactSources`; slot listing at `/tmp/orca-spike/data/orcad-artifacts/linux-x64-glibc/0.1.0+17ab00fcbb7f/`].

Layout (relative to a PB-owned root `R`):

```
R/<target>/<fullVersion>/            slot: orcad.js, orcad-server.js, daemon-entry.js, workers,
                                     out/cli/index.js, out/package.json, out/mobile-web/**,
                                     node_modules/{node-pty,@parcel/watcher,emojibase-data,@linear},
                                     ripgrep/<os>-<arch>/rg, [agent-browser-*], .server-target,
                                     .runtime-node, .version
R/<target>/runtimes/node-<exeSha256>/bin/node          (win32: node.exe, no bin/)
```

`<target>` is `linux-x64-glibc`, `darwin-arm64`, `darwin-x64`, `win32-x64` (also `linux-arm64-glibc`, `win32-arm64`). On a musl or old-glibc Linux (`linux-x64-musl`, `linux-x64-glibc217`) the targets exist in the template but their Node is a different (unofficial for arm64-musl) build; out of scope for PB's Linux package unless PB targets those hosts.

`fullVersion` = `0.1.0+` + first 12 hex of sha256 over the **concatenated bytes** of the slot files in the order returned by `orcadArtifactFilenames(target, mobileWebAssets)`, plus the agent-browser binary last if present [READ: `orcad-artifact-identity.ts:readOrcadArtifactIdentity`]. I reproduced it on the spike slot: it printed `0.1.0+17ab00fcbb7f` for 211 files, matching `.version` [RAN, script outside the repo]. With agent-browser removed it printed `0.1.0+9e4fc7c6495b`; after writing that into `.version` and `ORCA_VERSION`, orcad started and reported `health.buildVersion` `0.1.0+9e4fc7c6495b` [RAN].

Two ways to produce the slot at PB build time. Choose A.

- **A (recommended): run Orca's own provisioning entry at build time, on a host of the target OS.** Unpack the artifact into a `resources/`-shaped directory (template, renderer, ripgrep, agent-browser, `app.asar.unpacked/out/main/**`), then run `node app.asar.unpacked/out/main/orcad/orcad-local-serve-selection-entry.js --user-data <scratch> --app-root <resources>/app.asar.unpacked` with `process.resourcesPath` set through a `-r` preload. It printed `ORCA_SERVE_RUNTIME {"kind":"orcad","runtime":"…/runtimes/node-<sha>/bin/node","entry":"…/<fullVersion>/orcad-server.js","version":"<fullVersion>"}` under plain Node 24.22.1 and produced the slot [RAN on the 1.4.245 installed build, AppImage-style resources so the Node came from `node-runtime/`]. It then ran Orca's hash-verified assembly, Node placement and a native node-pty preflight. Any fallback prints `{"kind":"electron",...}`; the PB script must treat that as failure. **Not run:** the deb/mac/Windows path (Node downloaded from nodejs.org by Orca's code) and anything on 1.4.248; the sandbox policy refused to execute a freshly downloaded artifact's JavaScript with a network download in this session. This is the first thing the fetch phase must prove on each OS. It is also why this milestone needs the file set to match Orca's identity formula exactly: the maintained code owns that formula.
- **B (fallback): PB assembles the slot itself.** Needs the ordered file list from `ORCAD_ARTIFACTS` in Orca's source (`src/shared/orcad-artifacts.ts`), which is not in the release artifact; PB would copy it and re-sync at every re-pin. Use only if A fails on an OS. The formula and hashes above let it be self-checked against A's output.

The slot is read-only at run time. orcad checks `orcad-server.js` against a hash compiled into `orcad.js` (`launcher.ts: ORCAD_SERVER_SHA256`) and refuses to start on mismatch, so patching orcad is impossible by design, consistent with the "never patch Orca" rule.

## 4. orcad launch contract

Verified on Linux x64 with the 1.4.245 slot and the 1.4.245 web client [RAN, four launches]. The same argument vector is what `orca serve` uses minus its `--bind 0.0.0.0` default [READ: `serve-orcad-launch.js:serveWithOrcad`, `orcad-serve-argv.js:orcadServeArgs`].

| Item | Value |
|------|-------|
| Program | `R/<target>/runtimes/node-<sha>/bin/node` (win32: `...\node.exe`). Must be this exact file or its realpath. |
| Entry (argv[1]) | `R/<target>/<fullVersion>/orcad-server.js`. `orcad.js` also works [RAN] and checks the server hash first. `serve` uses `orcad-server.js` directly. |
| Args | `--bind 127.0.0.1 --port 0 --json --web-client-root <dir containing web-index.html>`. `--port 0` picks a free port (observed 33125, 43667). Default 6768 falls forward when taken (observed 6770 while the desktop held 6768). `--json` prints the ready line. Do not pass `--no-pairing` (automatic pairing needs the offer), `--mobile-pairing`, `--grant-desktop-control` or `--recipe-json`. |
| Env set by PB | `ORCA_USER_DATA=<profile dir>` (the profile; decision: `powerbrowser-orca`), `ORCA_VERSION=<fullVersion>`, `ORCA_SPEECH_RECOGNIZER_DIR=` (empty, as `serve` does), `ORCA_TELEMETRY_DISABLED=1`. |
| Env removed by PB | Every inherited `ORCA_*` (a PB started from an Orca terminal carries about 12: `ORCA_USER_DATA_PATH`, `ORCA_AGENT_SESSION_SPAWN_TOKEN`, `ORCA_PAIRING_CODE`, `ORCA_REMOTE_PAIRING`, `ORCA_CLI_COMMAND` and others, seen in this session's own environment), `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, `NODE_REPL_EXTERNAL_MODULE` (`bin/orca-ide` stashes and unsets the last two). Keep `HOME`/`USERPROFILE`: the credential key and agent configs live under it. |
| cwd | `dirname(entry)` (as `serve` does). |
| Stdout | One JSON line, `type":"orca_server_ready"`. Fields used: `boundEndpoint` (assert it starts with `ws://127.0.0.1:`), `pairing.webClientUrl` (`http://127.0.0.1:<port>/web-index.html#pairing=…`), `runtimeId`, `health.buildVersion`, `health.nodeVersion`, `health.terminalDaemon.state`. [RAN] |
| Stderr | Diagnostics, including the `[secrets]` line (section 6) and `[agent-state-rules] download failed: HTTP 404` (observed; orcad makes an outbound fetch at start). |
| Shutdown | SIGTERM exits it [RAN: `timeout -s TERM`]. Closing stdin does **not** [RAN: still running 30 s after stdin EOF]. With zero agent sessions no terminal daemon was left after exit [RAN]; the spike reports daemon and agent sessions outliving the server when sessions exist [spike 003]. |
| Exit codes | 78 = configuration refusal (wrong Node, wrong runtime path, identity mismatch) [RAN]. Supervisors must not restart-loop on 78 (`orcad-exit-code.ts`). |
| Lock | `<profile>/orcad.lock`; stale lock recovery via `orcad-server.js --reclaim-stale-lock [--yes]` [READ: `orcad-command-arguments.ts`]. |

**Response headers:** `GET /web-index.html` returns 200 with `Content-Type`, `Cache-Control: no-cache`, no `Content-Security-Policy` header, and the page has no CSP meta tag [RAN]. So inline `<style>` injection would also work; the sheet route in section 7 does not depend on it.

### 4.1 Per-OS differences

| Concern | Linux x64 | macOS | Windows x64 |
|---------|-----------|-------|-------------|
| Node file | `runtimes/node-<sha>/bin/node` | same | `runtimes\node-<sha>\node.exe` |
| Native add-ons in slot | `pty.node`, `watcher.node`, `rg` | adds `spawn-helper`; Mach-O signed in the mac artifact | `conpty.node`, `conpty/OpenConsole.exe`, `winpty-agent.exe`, `windows-process-tree.node`, `windows-security.node`, `bin/orca.exe`; SignPath-signed in the Windows artifact |
| Launch verified | **Yes [RAN]** | **No.** Orca's own CLI keeps packaged macOS on Electron serve only so paired clients can update the app, "orcad has no app updater" [READ: `serve-orcad-launch.js:resolveLocalServeRuntime`]; that is an update reason, not a technical limit. Darwin targets are built, hashed and signed in the template. | **No.** CI job `.github/workflows/win-orcad-serve-switch-e2e.yml` exercises packaged Windows orcad serve (windows-2022). Windows process breakaway handling exists (`main.ts` `WINDOWS_BREAKAWAY_LAUNCH_FLAG`). |
| Process spawn from PB chrome | `Subprocess` | `Subprocess` | `Subprocess`; the Theia reap path is Linux-only (`signalBarePid`, INTERNAL-APIS.md row at `PowerBrowserAPI.sys.mjs:1053`), so Windows orcad reap needs its own answer |
| Credential key location | `~/.orca/` | `~/.orca/` | `%USERPROFILE%\.orca\` [UNVERIFIED on mac/Windows; `orcadCredentialRoot()` at `orcad-plaintext-credential-migration.ts:42`] |
| Installed-Orca side effect | probes `/usr/bin/orca-ide`, `/usr/local/bin/orca-ide`, `/opt/Orca/orca-ide`, `~/.local/bin/orca-ide` | `/Applications/Orca.app`, `~/Applications/Orca.app` | `%LOCALAPPDATA%\Programs\Orca\Orca.exe`, `%ProgramFiles%\Orca\Orca.exe` |

**Installed-Orca side effect (important):** at startup orcad checks those paths. If an Orca desktop is installed there, orcad starts it as a hidden `--serve` Electron browser engine on an isolated temp profile (`orcad-browser-provider.ts:resolveOrcadBrowserProvider`, `electron-serve-browser-process.ts:start`). No environment variable or flag disables this: `orcad-lifecycle.ts:149` calls it unconditionally. The `/usr/*` and `/opt` paths are absolute; overriding `HOME` would only move the home-relative ones and would break credentials. On this NixOS host the desktop is in `/nix/store`, so the effect was not observed [UNVERIFIED live]. Plan for it: a user with Orca installed gets a second, hidden Electron process, and it conflicts with the milestone goal that the browser is PB's. Raise it as a requested upstream option, or accept and document.

## 5. How PB spawns and supervises it (integration with existing code)

- Spawn through `PowerBrowserAPI.spawnProcess({command, args, environment})` like `TheiaService.sys.mjs:891`. It wraps `Subprocess.call` with `environmentAppend: true`, so the child inherits PB's whole environment and `environment` can only add or blank variables (`PowerBrowserAPI.sys.mjs:570-583`). orcad needs inherited `ORCA_*` **removed**, and blanking is not proven equivalent to unset. Add an `environmentAppend` parameter to `spawnProcess` (default `true`, so Theia is unchanged) and pass a built environment for orcad. This is a boundary-file change and needs the `Subprocess` INTERNAL-APIS row to stay accurate.
- The new service is a sibling consumer of the boundary, like `TheiaService.sys.mjs`. It must not import a Firefox internal itself.
- Parent-death: Theia's backend has a stdin watchdog (`TheiaService.sys.mjs:846-860`); orcad has none (section 4). Reuse the D-111 pattern: state file with pid and start ticks, reap leftovers on next launch only on exact start-tick match (`INTERNAL-APIS.md:66`).
- Read the port from the ready line, never assume 6768.
- The token gate "needs no allowlist entry": it guards inbound requests to PB's own sidecar [spike 003 finding]. orcad's own outbound traffic (agent-state-rules fetch; PostHog code exists in the bundle) is separate from PB's `endpoint-allowlist.json` verification [UNVERIFIED whether PB's endpoint checks cover spawned sidecars]. `ORCA_TELEMETRY_DISABLED=1` makes consent resolve to disabled before any stored setting (`src/main/telemetry/consent.ts:53-58`) [READ]. Without it the consent state defaults to a pending banner, which does not transmit; the variable is a fail-safe.
- Flatpak: orcad and its agents need `--filesystem=home` (owner decision); the sandbox must also let the child run the extracted Node and see `~/.orca`.

## 6. Add-project and credential-storage check

**Add project:** use the CLI shipped in the slot, with the **CLI's** profile variable. [RAN]

```bash
env ORCA_USER_DATA_PATH=<profile> <slot-node> <slot>/out/cli/index.js repo add --path <abs path> --json
# -> {"ok":true,"result":{"repo":{"id":…,"path":…,"displayName":…,"kind":"git",…}},"_meta":{"runtimeId":"<orcad runtimeId>"}}
```

The returned `_meta.runtimeId` equaled the ready line's `runtimeId`, which proves the call reached PB's orcad. `repo list --json` returned `[]` before and the added path after. Commands available under `orca repo`: `list, add, show, set, set-base-ref, search-refs`. **There is no `remove`.** An Add-project UI therefore cannot offer undo through the CLI. Without `ORCA_USER_DATA_PATH` the CLI talks to whatever Orca runtime is registered under the user's default `~/.config/orca`, including a running desktop. Always set it, and check `_meta.runtimeId` against the ready line before trusting a result. The alternative, speaking orcad's WebSocket RPC directly, needs the end-to-end encrypted device-key protocol (`web-e2ee.ts`, `web-device-key.ts`); do not reimplement it.

**Credential-storage check:** orcad seals credentials with a key file kept **outside** the profile at `~/.orca/orcad-secret-store-<machine tag>.json`, created on first start of a persistent profile [RAN: appeared at first launch; I deleted the test copy]. A profile under `/tmp`, `/var/tmp` or `os.tmpdir()` is treated as disposable and stores credentials **unencrypted** (`isTemporaryKeyDir` in `orcad-secret-key-record.ts:101`). Observed stderr:

- persistent profile: `[secrets] Orca's headless server seals credentials with a key kept beside them in its private credential directory, mixed with this machine ID. Anyone who can read this account's files on this host, or a backup of them, can unseal them.` [RAN]
- temporary profile: `[secrets] Orca's headless server is running from a temporary profile, so it stores credentials unencrypted…` [RAN]

The same sentence is persisted as `lastReportedGap` in `<profile>/orca-secret-protection.json` [RAN]. A check can therefore (a) assert the profile is not under a temp root, (b) read that JSON, and (c) report that protection is a same-user key file, not an OS keyring. `ORCA_HEADLESS_SECRET_STORE=plaintext` forces plaintext (`orcad-secret-protection-gap.ts:1`); PB must not set it. The OS-keyring path exists only as a legacy read (`orcad-legacy-keyring-key.ts`).

## 7. Gecko-side APIs

All paths relative to `/home/chris/coding/Power-Browser/upstream` (Firefox 153.5.1esr) unless stated.

### 7.1 Injection actor (JSWindowActor + `windowUtils.loadSheet`)

| API | Detail | Source |
|-----|--------|--------|
| `ChromeUtils.registerWindowActor(name, {parent, child, matches, events, allFrames, messageManagerGroups})` | `matches` is a MatchPattern list; if given, a document that does not match gets no actor. | `dom/chrome-webidl/JSWindowActor.webidl:95-102`; `dom/ipc/jsactor/JSWindowActorProtocol.cpp:320-360` |
| Event option `wantUntrusted` | Defaults to **false**; page-dispatched events never reach the child without it. Not needed for a stylesheet/seed actor that listens to browser-fired events. | `JSWindowActorProtocol.cpp:130-133` |
| `nsIDOMWindowUtils.loadSheetUsingURIString(uri, type)` / `removeSheetUsingURIString` | `AGENT_SHEET=0`, `USER_SHEET=1`, `AUTHOR_SHEET=2`. Applies to this window's document only, takes effect immediately, no CSP involvement. Used by upstream from privileged JS (`FeatureCallout.sys.mjs:524`, `devtools/shared/layout/utils.js:611`). | `dom/interfaces/base/nsIDOMWindowUtils.idl:1725-1763` |

How it fits PB's existing code:

1. **Register inside `registerGroupActor`** (`PowerBrowserAPI.sys.mjs:2256-2282`). It is "the SOLE actor-registration method"; `check-internals-boundary.sh` fails any other `ChromeUtils.registerWindowActor`. Add a catalogue row to `powerbrowser/INTERNAL-APIS.md` in the same commit (append-only rule), and widen the "no DOM write" wording of the child row (survey decision 4 already records this).
2. **Child module** goes in `powerbrowser/shell/GroupActorChild.sys.mjs`, reached through `resource://powerbrowser/` (the content process cannot load `chrome://`; `jar.mn` comment). The stylesheet needs its own `jar.mn` line under `content/powerbrowser/` and loads as `resource://powerbrowser/<file>.css`. No new alias is needed.
3. **The port problem.** `matches` ignores ports (PB comment at `PowerBrowserAPI.sys.mjs:289`: "MatchPattern compares hosts only"). The existing `PowerBrowserGroup` actor already matches `http://127.0.0.1/*` (line 2280), so it also instantiates in an Orca tab at `http://127.0.0.1:<orcaPort>` today [UNVERIFIED live; follows from the pattern]; its parent refuses by port (`groupSenderPort`, lines 285-297). A branding actor on the same host pattern would also load in the Theia frame and in any other loopback page. Mirror NG-038: the parent records the orcad port, the child asks the parent (or is told) and acts only when `location.port` equals it. Do not rely on the pattern for isolation.
4. **Timing.** Use the early event for localStorage seeding (the survey's `orca.web.settings.v1`, `orca.web.runtimeEnvironment.v1` records) and `DOMContentLoaded` or the same early event for the sheet. `DOMWindowCreated` is used by upstream (`toolkit/components/extensions/ext-browser-content.js`). Whether the seed lands before the client reads storage, and whether the sheet avoids a flash of the Orca logo, are [UNVERIFIED live]; spike 003's probe harness (`withProbeShell`, `evaluateIn`) can test both.
5. **Sheet type.** Use `USER_SHEET` with `!important` declarations, or `AUTHOR_SHEET` at equal specificity; normal `USER_SHEET` rules lose to the page's author rules in the CSS cascade [general CSS, not tested in Gecko here].
6. **Selectors are not a stable Orca API.** The survey notes localized alt text and unstable classes (`ORCA-REBRAND-SURVEY.md:44`). Pin a selector list per Orca version and re-check at every re-pin.

Not recommended for injection: a WebExtension content script (patches 050/060 exist for an extension tab host and a network wall; adding an extension adds policy and install surface for something a 20-line actor does), `userContent.css` (static, cannot seed storage, host-only match), editing Orca's served files (the web client root is a verified read-only upstream copy).

### 7.2 Driving tabs: WebDriver BiDi and Marionette

Present in 153.5.1esr: `remote/webdriver-bidi/`, `remote/marionette/`; **no `remote/cdp/`** [RAN: `ls upstream/remote`].

BiDi commands in `remote/webdriver-bidi/modules/root/` [RAN: grep of command methods]:

- `browsingContext`: `activate captureScreenshot close create getTree handleUserPrompt locateNodes navigate print reload setViewport traverseHistory`; events include `contextCreated contextDestroyed domContentLoaded downloadWillBegin downloadEnd fragmentNavigated historyUpdated load navigationCommitted navigationFailed navigationStarted`.
- `script`: `addPreloadScript callFunction disown evaluate getRealms removePreloadScript`; events `message realmCreated realmDestroyed`.
- `input`: `performActions releaseActions setFiles`; `network`: `addDataCollector addIntercept continueRequest continueResponse continueWithAuth disownData getData failRequest provideResponse removeDataCollector removeIntercept setCacheBehavior setExtraHeaders`; events `authRequired beforeRequestSent fetchError responseCompleted responseStarted`.
- `emulation`: `setGeolocationOverride setLocaleOverride setNetworkConditions setScreenOrientationOverride setScreenSettingsOverride setTimezoneOverride setUserAgentOverride`; `storage`: `deleteCookies getCookies setCookie`; `browser`: `createUserContext setDownloadBehavior removeUserContext setClientWindowState`; `log.entryAdded`; `permissions.setPermission`; `session.subscribe/unsubscribe`; `webExtension.install/uninstall`.

PB already uses BiDi for its own probes: `scripts/lib/firefox-bidi.mjs:360-368` launches `powerbrowser --headless --profile <dir> --remote-debugging-port=<port> --remote-allow-hosts 127.0.0.1 --remote-allow-system-access`, and spike 003's `probe.mjs` drove an Orca web tab with `evaluateIn`, `browsingContext.captureScreenshot` and `input.performActions` against a PB web tab [READ]. `--remote-allow-system-access` is required to evaluate in parent-process contexts (`script.sys.mjs:844` per the comment in `firefox-bidi.mjs:330`).

Facts that bear on replacing Orca's CDP browser:

- Orca's browser seam is a closed union: `OrcadBrowserProvider.kind: 'electron' | 'chromium'` (`orcad-browser-provider.ts:18`). Resolution order is installed Orca Electron, then `ORCA_BROWSER_EXECUTABLE` driven through the bundled `agent-browser`, otherwise unavailable (`{reason:'unconfigured'}`, lines 181-231). There is no plugin loader for a third provider.
- `agent-browser` 0.39.4 (`~0.39.4` in Orca `package.json`) speaks CDP only: engines `chrome|lightpanda|obscura`, providers `ios|browserbase|kernel|browseruse|browserless|agentcore|<plugin>` [RAN: `--help`]. Pointing `ORCA_BROWSER_EXECUTABLE` at PB will not work.
- The provider contract is `RuntimeBrowserCommands`, about 80 methods (`browserSnapshot, Click, Goto, Fill, Type, Screenshot, Pdf, ConsoleLog, NetworkLog, Cookie*, Intercept*, Storage*, Tab*, Profile*, Screencast, Dialog*, …`, `src/main/runtime/browser/browser-commands.ts`). First-glance BiDi coverage: navigate/reload/back/forward (`navigate`, `reload`, `traverseHistory`), screenshot/pdf (`captureScreenshot`, `print`), eval (`script.evaluate/callFunction`), input and upload (`performActions`, `setFiles`), dialogs (`handleUserPrompt`), cookies (`storage.*`), viewport and geolocation and offline and headers (`setViewport`, `emulation.*`, `network.setExtraHeaders`), intercept and network log (`network.*`), console (`log.entryAdded`), downloads (`downloadWillBegin/End`, `browser.setDownloadBehavior`). The accessibility snapshot with element refs has no direct BiDi command (`browsingContext.locateNodes` can search by accessibility role/name but is not a tree dump) [UNVERIFIED]. This list is a pointer for the inventory spike, not the inventory.
- When no engine resolves, orcad still lists "client-hosted" pages from a paired desktop (`orcad-browser-startup.ts:50-51`, `clientHostingWithoutEngine: true`). Whether a web client inside a PB tab can act as a page host is [UNVERIFIED].
- Whether production PB may start the Remote Agent is a product and security decision: it opens a local control port over the whole browser, and `--remote-allow-system-access` extends that to chrome. Keep BiDi as a test and spike tool; for shipped Orca browser tools prefer an in-process transport (actor to chrome) so no debugging port exists. [Opinion; PB policy files not checked for `DisableRemoteDebugging`-style settings.]

Marionette (`--marionette`, WebDriver Classic plus chrome-context scripting) adds nothing BiDi lacks for this use and is not used by any PB code today (`scripts/verify-platform.sh:1719` notes `firefox-marionette.mjs` does not exist).

## 8. Recommended stack additions (table)

### Core technologies

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Orca release artifacts (per OS) | v1.4.248 (fallback v1.4.245) | Source of orcad, web client, natives | Pinned upstream, never patched or vendored; same rule as Theia and Gecko. |
| Node.js (orcad runtime) | 24.22.1 exactly | Runs orcad and the slot CLI | orcad refuses any other version and any other path (`orcad-bundled-runtime.ts`). |
| orcad (`orcad-server.js` from the template) | build `0.1.0+<identity>` | Headless Orca runtime, second token-gated sidecar | Spike 003 VALIDATED; run as in section 4. |
| Orca slot CLI (`out/cli/index.js`) | same slot | Add-project, project list | Avoids reimplementing the encrypted RPC. |
| JSWindowActor pair + `windowUtils.loadSheetUsingURIString` | Gecko 153.5.1esr | Brand injection, setting seeding | Already the PB pattern; no patch needed. |

### Supporting

| Item | Version | Purpose | When |
|------|---------|---------|------|
| `ar`, `tar`, `bsdtar`, `7z` | system | Archive extraction in the fetch script | Per-OS CI job; 7-Zip on the Windows runner. |
| WebDriver BiDi (existing `scripts/lib/firefox-bidi.mjs`, `pb-live-probe.mjs`) | Gecko 153 | Live probes of the Orca tab, browser-parity spike | Tests and spike only. |
| `ORCA_TELEMETRY_DISABLED=1` | n/a | Fail-safe against Orca telemetry | Always, in the orcad environment. |

## 9. What NOT to add

| Do not add | Why | Instead |
|------------|-----|---------|
| Any requirement for Orca desktop, Electron, or `ELECTRON_RUN_AS_NODE` | Owner decision; orcad is Electron-free | Pinned artifact fetch |
| `orca serve` as the launcher | Hardcodes `--bind 0.0.0.0` (`orcad-serve-argv.js`); orcad then warns anyone reaching the port can pair | Spawn the node + `orcad-server.js` vector in section 4 |
| Patching or vendoring Orca source or `orcad-server.js` | Launcher hash check makes it fail; violates the pinned-upstream rule | Re-pin a version |
| A second Node for general PB use, or bumping PB's Theia Node in this milestone | Out of scope; orcad needs only its own 24.22.1 | Ship the slot's Node; optional dedupe later |
| `ORCA_ORCAD_MANAGED_ACTIVATION_ROOT` | Switches orcad into managed mode: idle exit and an activation fence (`orcad-managed-launch-env.ts`) | Leave unset; supervise from PB |
| `--no-pairing`, `--mobile-pairing`, `--grant-desktop-control` | Break automatic pairing or widen scope without a decision | Default pairing offer only |
| `ORCA_HEADLESS_SECRET_STORE=plaintext`, or a profile under `/tmp` | Disables credential sealing | Persistent profile `powerbrowser-orca` under PB's profile area |
| A reimplementation of Orca's WebSocket RPC or E2EE pairing in Theia | Large, fragile, security-sensitive | The slot CLI, plus the pairing URL for the client |
| Playwright, Puppeteer, Selenium, a CDP-to-BiDi shim, `agent-browser`, or any Chromium | Firefox has no CDP; Playwright-Firefox needs its own patched build | BiDi for tests; an upstream Orca provider kind implementing `RuntimeBrowserCommands` for the product |
| Marionette for new work | Duplicates BiDi, unused in PB | BiDi |
| A WebExtension or `userContent.css` for Orca branding | More surface for less capability | The actor |
| Shipping non-host targets, `popout.html`/`index.html`/`space.html`, or `orca-sourcemaps-*.zip` | Dead weight; orcad serves only the manifest list | Host target dir plus the manifest-listed client files |
| Mixing artifacts across OSes | `orcad-template.json` hashes are per-OS after signing | One artifact per OS build |

## 10. Alternatives considered

| Category | Recommended | Alternative | Why not |
|----------|-------------|-------------|---------|
| Linux source artifact | deb (`ar`+`tar`, no root, 188 MB) | AppImage (251 MB, includes Node) | AppImage includes Node, but needs squashfs offset handling or running the AppImage runtime to extract; the same Node is available hash-verified from nodejs.org. Choose the AppImage only if Node must not be fetched separately. |
| Slot provisioning | Orca's own selection entry (A) | PB reimplementation (B) | B copies Orca's internal file-order list and must follow every re-pin. |
| Node source | nodejs.org archive, verified by executable sha256 | Orca's AppImage `node-runtime` | Linux only. |
| Profile var for CLI | `ORCA_USER_DATA_PATH` on every CLI call | Rely on orcad's env | Wrong runtime gets the command. |
| Browser engine for agents | Upstream Orca provider kind over BiDi (decided by the spike) | Keep Orca's Electron/Chromium | Contradicts the milestone direction; also launches a second browser. |

## 11. Version compatibility

| Pair | Constraint | Evidence |
|------|------------|----------|
| orcad slot + Node | Exactly 24.22.1; `process.versions.node` is compared | `orcad-bundled-runtime.ts:70-76` |
| Slot Node path + `.runtime-node` | `.runtime-node` = executable sha256 of the pinned asset, path `../runtimes/node-<sha>/...` | same file lines 25-45 |
| `.version` + file set | Recomputed identity must equal `.version`; `ORCA_VERSION` should equal it | [RAN] both directions |
| orcad Node major vs PB sidecar | PB `verify-node-major-agreement.mjs` checks only PB's own `node-runtime.json` against flake and engines, so a separate slot Node does not trip it | script header [READ] |
| Web client vs orcad | Same artifact only. The client and orcad ship together and speak a versioned RPC; never pair a client from one release with orcad from another | [READ: single artifact; not tested across versions] |
| Gecko actor APIs | 153.5.1esr tree; `upstream/` in this worktree is absent, and the main checkout pins 153.5.1 while older notes mention 153.5.0 | `version.txt` in main checkout [RAN] |

## 12. Open items for phase-level research (ordered by risk)

1. Slot provisioning on deb, mac and Windows with Orca's selection entry, including the nodejs.org Node download, on 1.4.248 (section 3 A). Not executed here.
2. Launch of the mac and Windows slots (section 4.1).
3. The hidden Electron browser engine when Orca desktop is installed (section 4.1).
4. Port-scoped branding actor and its interaction with the existing `PowerBrowserGroup` actor on `127.0.0.1` (section 7.1).
5. Windows reaping of a leftover orcad; Linux-only `signalBarePid` today.
6. Whether a web client in a PB tab can host browser pages for orcad (section 7.2).
7. Remote Agent exposure policy for any product use of BiDi.

## Sources

- Orca releases and assets: `gh release view v1.4.248 -R stablyai/orca` and `v1.4.245` (digests, sizes); `latest-linux.yml`, `latest.yml`, `latest-mac.yml` from the v1.4.248 release (sha512). HIGH.
- Extracted artifacts (own download and extraction, `/tmp/pb-orca-fetch-test/`): deb, mac arm64 zip, Windows exe, all three sha256 matched the API. HIGH.
- Orca source `/home/chris/coding/orca-eval`: `src/shared/node-runtime-pin.ts`, `src/shared/orcad-artifacts.ts`, `src/shared/appimage-node-runtime.ts`, `src/main/orcad/{orcad-bundled-runtime,orcad-artifact-materializer,orcad-artifact-identity,orcad-local-serve-selection,orcad-command-arguments,orcad-browser-provider,orcad-browser-startup,orcad-lifecycle,electron-serve-browser-process,orcad-secret-key-resolution,orcad-secret-key-record,orcad-secret-protection-gap,launcher,main}.ts`, `src/main/telemetry/consent.ts`, `src/main/runtime/browser/browser-commands.ts`, `config/electron-builder.config.cjs`, `config/scripts/packaged-orcad-template.cjs`. HIGH (source of the shipped build lineage; HEAD is later than 1.4.245).
- Installed build `…orca-ide-1.4.245-extracted/resources/app.asar.unpacked/out/{cli,shared,main}` (compiled launch path, `serve-orcad-launch.js`, `orcad-serve-argv.js`, `bundled-web-client-root.js`). HIGH.
- Runs on this host: orcad launches (orcad.js and orcad-server.js), stdin-EOF test, SIGTERM test, subset web client, persistent vs temp profile, slot identity recomputation, selection entry under plain Node, CLI `repo add/list`. HIGH for Linux x64 / 1.4.245.
- Node: `https://nodejs.org/dist/v24.22.1/SHASUMS256.txt` and local hashing of three archives; `nodejs/node` `tools/osx-entitlements.plist`. HIGH.
- Gecko: `upstream/dom/interfaces/base/nsIDOMWindowUtils.idl`, `dom/chrome-webidl/JSWindowActor.webidl`, `dom/ipc/jsactor/JSWindowActorProtocol.cpp`, `remote/webdriver-bidi/modules/root/*.sys.mjs`, `browser/components/asrouter/modules/FeatureCallout.sys.mjs`. HIGH.
- PB: `powerbrowser/shell/{PowerBrowserAPI,TheiaService,GroupActorChild}.sys.mjs`, `jar.mn`, `powerbrowser/INTERNAL-APIS.md`, `scripts/check-internals-boundary.sh`, `scripts/lib/{firefox-bidi,pb-live-probe}.mjs`, `powerbrowser/packaging/node-runtime.json`, `scripts/verify-node-major-agreement.mjs`, spike 003 README/probe, `ORCA-REBRAND-SURVEY.md`, `NOTE-orca-tab-parity-direction.md`. HIGH.
- Not consulted: Mozilla docs pages (the firefox-source-docs JSWindowActor page does not cover `matches`, ports or `DOMWindowCreated`; the in-tree source was used instead).

---
*Stack research for: PB v1.7 Orca integration. Researched 2026-11-04.*
