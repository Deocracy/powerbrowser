# Phase 60: Orca from source on Theia's Node - Research

**Researched:** 2026-11-09
**Domain:** Pinned third-party source build (pnpm/Node), slot-less Node daemon start, repo pin/fetch/verify conventions, brand/licence classification, VS Code extension on Theia
**Confidence:** MEDIUM overall. HIGH on the Orca source reading and the PB-tree conventions. MEDIUM on the build itself: the full `pnpm install` + `build:orcad` run was NOT executed here (the auto-mode classifier denied running third-party install scripts), so every build-time claim below rests on reading Orca's scripts, not on a run.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Pin and source location**
- **P59-01:** The pin is the tag **and** its commit SHA: `[upstreams] orca_tag = "v1.4.248"`
  and `orca_commit = "<sha>"` in `configuration.toml`, emitted through `node scripts/generate.mjs`
  into `generated/upstream-pins.env` like `firefox_esr_tag`. The fetch refuses a tag that
  resolves to any other commit. The `--quick` row derives both values from `configuration.toml`
  and goes red when the generated files or a fetched `orca/` tree name a different tag or commit;
  its `--self-test` plants a mismatched tag and a mismatched commit.
- **P59-02:** The source is a gitignored `orca/` checkout at the repo root, fetched by a new
  `scripts/fetch-orca.sh` modelled on `scripts/fetch-upstream.sh`: pin read from
  `generated/upstream-pins.env`, an explicit `TAG=` export may override it (for the Phase 68
  re-pin job), no literal fallback, and safe to re-run (an existing `orca/` is verified against
  the pin, not re-cloned).

**Slot-less start**
- **P59-03:** If orcad refuses to start slot-less on Theia's Node 24.19.0 on 1.4.248, fall back
  to 1.4.245 (D-04) and record it. If it also fails on 1.4.245, **stop and ask the owner**.
  Record the exit code, the message, and which slot file (`.runtime-node`, the target file,
  `.version`) orcad found. Do not raise PB's Node to 24.22.1 or ship a second Node without an
  owner decision: either one changes D-14.
- **P59-04:** The probe passes when orcad prints its `orca_server_ready` JSON with a
  `boundEndpoint` starting `ws://127.0.0.1:` **and** the source-built web client
  (`build:web` output) opens in a PB web tab from `pairing.webClientUrl` and pairs with no prompt.
  Reuse the spike 003 probe pattern (`withProbeShell` + `openWebTab`, DOM read over BiDi). The
  pairing URL is a bearer credential: keep it out of logs and probe output.
- **P59-05:** The start probe is a **permanent full-run `verify-platform.sh` row** (not
  `--quick`). It runs when a built `orca/` exists and prints one named SKIP line otherwise, so the
  Phase 68 re-pin job re-proves slot-less start on every new tag. The "exactly one Node runtime
  in the build output" check derives the runtimes from the tree at check time.

**Claude Code extension check (EXT-01)**
- **P59-06:** The extension is installed from Open VSX through PB's Extensions view (PB already
  ships `@theia/vsx-registry` pointed at open-vsx.org). Record the extension version. If it is
  not published on Open VSX, that is the finding; do not sideload a Marketplace VSIX.
- **P59-07:** Pass bar: the extension's **chat panel** starts a session on the Orca worktree,
  answers a prompt and edits a file. If only the CLI-in-terminal mode works, EXT-01 is recorded
  as failed-partial and EXT-02 (Phase 63) is reshaped before that phase is planned.
- **P59-08:** Chris runs the check live with his own Claude login. Execution prepares PB and the
  worktree and hands him a short step list. It is a human checkpoint in the plan, not an
  automated row.
- **P59-09:** The worktree comes from a throwaway scratch git repo added to PB's orcad profile
  (`powerbrowser-orca`, set through both `ORCA_USER_DATA` and `ORCA_USER_DATA_PATH`). Orca
  creates the worktree. Power-Browser itself is not used.

**Build shell and Electron**
- **P59-10:** A new dev shell `nix develop .#orca` with `nodejs_24` and `corepack_24`. pnpm
  12.14.0 is resolved by corepack from Orca's `packageManager` field, which carries its sha512.
  nixpkgs has no pnpm 12 (highest is 10.33.0). `.#theia` stays unchanged.
- **P59-11:** No Electron. Install with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` and lifecycle scripts
  off, then run Orca's own `config/scripts/build-workspace-packages.mjs` and `rebuild:node`
  (`ensure-native-runtime.mjs --runtime=node`), so node-pty and the other natives are built for
  Node 24 only. Orca's stock `postinstall` (`rebuild-native-deps.mjs`, `@electron/rebuild`) is
  not run. A check proves no Electron binary exists in the build tree.
- **P59-12:** The Orca build stays a separate script in this phase, run by hand or by the probe
  row. It does not join the Theia build or `mach build`. Packaging orcad into PB artifacts is
  PLAT-01 (Phase 68).

### Claude's Discretion
- Clone depth and fetch mechanics for `fetch-orca.sh`, as long as the commit check holds.
- The names of the build script, the new rows and the generated variables.
- The brand-token class for "Orca": it is a third-party product name that appears in user-facing
  copy as the mode name, not a residue of the originating product. Classify it only in
  `inventory/brand-tokens.json`.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Packaging orcad into PB artifacts and the weekly re-pin remain Phase 68 as already planned.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RUN-01 | PowerBrowser builds orcad and the Orca web client from source at a pinned Orca tag (first pin 1.4.248, fallback 1.4.245) with Orca's own `build:orcad` and `build:web` from a Nix dev shell with pnpm 12.14.0 | Pin values and the peeled-commit trap (Standard Stack); build chain and what `build:orcad` actually does (Build chain findings 1-5); corepack resolves pnpm 12.14.0 on this host (verified run); `.#orca` shell contents; `orca-pin` row |
| RUN-02 | orcad runs slot-less on Theia's Node 24.19.0; no second Node runtime is shipped | **Key finding: `build:orcad` output is NOT slot-less** (writes all three slot files and places a Node 24.22.1 beside it); required de-slot step; ready-line and handshake from source; `orca-slotless-start` and `orca-build-shape` rows |
| OVL-04 | "Orca" is classified only in `inventory/brand-tokens.json`; Orca's licence has a row in the licence allow-list; the brand scan stays green over the overlay | The scan does not look for "orca" today; how to make the classification real (probe + `coincidental` rows); **no licence allow-list exists in the tree** (Open Question 1) |
| EXT-01 | The Claude Code VS Code extension runs on Theia 1.76 on Orca worktrees; outcome recorded | Extension is on Open VSX (2.1.319, `^1.94.0`, proprietary licence); Theia 1.76 reports VS Code API 1.139.0; install path, settings and risks; human checkpoint step list |
</phase_requirements>

## Summary

The build chain is straightforward on paper: clone the pinned tag, `corepack pnpm install --frozen-lockfile --ignore-scripts`, `pnpm build:orcad`, `pnpm build:web`. Corepack 0.35.0 from the locked nixpkgs resolves and runs pnpm 12.14.0 on this host (I ran it). `build:web` writes `out/web/web-index.html`, needs no Electron, and is what orcad serves with `--web-client-root`. The pin plumbing, row shapes and self-test conventions all have close in-tree analogs (`verify-upstream-pins.mjs`, `fetch-upstream.sh`).

**The load-bearing surprise is RUN-02.** Orca's own `build:orcad` always writes the three slot files (`.server-target`, `.runtime-node`, `.version`) into `out/orcad/` and always downloads and places a hash-pinned Node 24.22.1 at `out/runtimes/node-<sha256>/bin/node`. Started as built on Theia's Node 24.19.0, `orcad.js` does not fail: its launcher sees the markers and **hands off to the bundled 24.22.1 runtime**, so a naive start probe would print a ready line and pass while running on a second Node. D-14 is only satisfied after a PB post-build step removes the three marker files and the `out/runtimes/` directory (no Orca source edit, no seam patch). The probe must therefore assert `health.nodeVersion == "24.19.0"` from the ready line, not just that orcad answered.

Three further findings change the plan: (1) there is no licence allow-list anywhere in the tree, so OVL-04's "row in the licence allow-list" names something that does not exist (Open Question 1, needs an owner call); (2) the brand scan does not look for "orca" at all today, so "classified only in brand-tokens.json" is unenforced unless `orca` is added as a residue probe with `coincidental` rows (counts are exact per row, so every future Orca-naming file edits that file); (3) the annotated tag object SHA (`c2f3bb65…`) differs from the commit SHA (`965978bc…`), and P59-01's `orca_commit` must be the latter.

**Primary recommendation:** Wave 0 is a real `.#orca` build attempt with the exact commands below, logged, because the one thing I could not test (node-pty prebuild passing Orca's glibc-2.28 floor check under NixOS glibc 2.42) can stop the phase. Then add a de-slot step to `scripts/build-orca.sh`, and make the start probe assert the Node version and the Node-runtime count from the tree.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pin declaration and derivation | Build tooling (`configuration.toml` + `generate.mjs`) | `scripts/verify-orca-pin.mjs` | Pins live once in the manifest and reach consumers only through the generator (CLAUDE.md pattern) |
| Source fetch and commit verification | Build tooling (`scripts/fetch-orca.sh`) | — | Same role as `fetch-upstream.sh`; gitignored checkout outside the scan |
| Compile orcad and web client | Build tooling (Nix `.#orca` shell, Orca's pnpm scripts) | — | Not part of Theia build or `mach build` (P59-12) |
| De-slotting the orcad output | Build tooling (PB script, post-build) | — | Pure file removal on build output; keeps Orca source untouched (D-04) |
| Run orcad (Node daemon, loopback WS + HTTP) | Backend process (Theia's Node 24.19.0, spawned by the probe in this phase) | — | Phase 62's `OrcaService` takes over supervision; Phase 60 only proves the start |
| Serve the web client | orcad HTTP (`--web-client-root`) | PB web tab (Gecko content) | Client pairs from the URL fragment and talks to orcad over WS |
| Run the Claude Code extension | Theia backend (plugin host) + Theia frontend (webview) | Extension's bundled CLI subprocess | Extension host is a Node process; the chat panel is a webview |
| Brand/licence classification | Repo inventory (`inventory/brand-tokens.json`) | Scan script | Scan reads only the inventory |
| Verification | `scripts/verify-platform.sh` registry | `scripts/lib/pb-live-probe.mjs` | One driver, one registry |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Orca (stablyai/orca) | tag `v1.4.248`, commit `965978bc78bf03a6a43187c1ed28fcffe0e01bb5` | Source of orcad and web client | Owner decision D-04. Commit verified two ways: `git ls-remote` peeled entry `965978bc78bf03a6a43187c1ed28fcffe0e01bb5 refs/tags/v1.4.248^{}` and `git -C orca-src rev-parse HEAD` after a `--depth 1 --branch v1.4.248` clone [VERIFIED: git ls-remote + local clone, 2026-11-09] |
| Orca fallback | tag `v1.4.245`, commit `1c6ac8c3c4d2c3dec2cb5966d225ca2a0e0471d3` | D-04 fallback if 1.4.248 fails the probe | Peeled SHA from `git ls-remote` (`1c6ac8c3c4d2c3dec2cb5966d225ca2a0e0471d3 refs/tags/v1.4.245^{}`); not cloned [VERIFIED: git ls-remote] |
| Node.js | 24.19.0 (nixpkgs `nodejs_24` in the locked flake) and the official 24.19.0 tarball from `powerbrowser/packaging/node-runtime.json` | Runtime for build and for orcad | `nix eval --inputs-from . nixpkgs#nodejs_24.version` printed `"24.19.0"`. The pinned official tarball hashes to `14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647` and `bin/node --version` printed `v24.19.0` here [VERIFIED: nix eval + sha256sum + run] |
| pnpm | 12.14.0 via corepack | Orca's package manager | Orca `package.json`: `"packageManager": "pnpm@12.14.0+sha512.c18ba6d8…"`. `corepack pnpm --version` printed `12.14.0` (corepack downloaded "the pnpm 12.14.0 binary for linux-x64") [VERIFIED: run, 2026-11-09] |
| corepack | nixpkgs `corepack_24` (package 24.19.0, tool `corepack --version` = 0.35.0) | Resolve pnpm from `packageManager` | Attribute exists in the locked nixpkgs [VERIFIED: nix eval + run]. Host nixpkgs `pnpm` is 11.21.0 / user `pnpm` 11.28.5, neither is 12 [VERIFIED: nix eval, `pnpm --version`] |
| Claude Code VS Code extension | `Anthropic.claude-code` 2.1.319 (published 2026-11-06), `engines.vscode ^1.94.0` | EXT-01 subject | Open VSX API response [CITED: open-vsx.org/api/anthropic/claude-code] |
| Eclipse Theia | 1.76.0, reports VS Code API 1.139.0 | Extension host | `theia/node_modules/@theia/application-package/lib/api.js:23`: `exports.DEFAULT_SUPPORTED_API_VERSION = '1.139.0';` [VERIFIED: read] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vscode/ripgrep-universal` | 1.18.0 (Orca-locked) | Bundled into orcad output; copied unconditionally by `build-orcad.mjs` | Has no install script, so `--ignore-scripts` is safe for it [VERIFIED: `npm view` printed no `scripts.postinstall`/`install`] |
| node-pty | 1.1.0 (Orca-patched) | Terminal PTY native | Built from source by `build:orcad` itself (see Build chain finding 3); `scripts.install = 'node scripts/prebuild.js || node-gyp rebuild'` is skipped by `--ignore-scripts` [VERIFIED: npm view] |
| `scripts/lib/pb-live-probe.mjs` | in-tree | `withProbeShell`, `openWebTab`, `pollFor`, BiDi `evaluateIn` | The web-tab pairing half of the probe [VERIFIED: file read, exports at lines 51 and 177] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| De-slot by deleting the three marker files and `out/runtimes/` in place | Copy `out/orcad` to a second directory minus the markers | In-place is fewer moving parts; `build:orcad` wipes its output dir on every run (`rmSync(OUT_DIR…)`, build-orcad.mjs) so it is idempotent. Pick in-place. |
| New script `scripts/verify-orca-pin.mjs` | Extend `verify-upstream-pins.mjs` | That file already carries ~150 lines of header and 8 steps with eight self-test plants. A sibling with the same row shape is smaller and cannot regress the ESR/Theia half. CONTEXT allows "follow or extend". |
| `ORCA_*`-prefixed generated variable names | `UPSTREAM_ORCA_TAG` / `UPSTREAM_ORCA_COMMIT` | `ORCA_*` is Orca's own env namespace (PITFALLS: PB scrubs inherited `ORCA_*`). Do not mint variables in it. |

**Installation (inside `nix develop .#orca`):**
```bash
export COREPACK_HOME="$PWD/.mozbuild/corepack" COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
cd orca
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm build:orcad      # writes out/orcad + out/runtimes (24.22.1) -> then de-slot
corepack pnpm build:web        # writes out/web/web-index.html
```
(`.mozbuild/` is already gitignored.) Network is required at build time: github.com (clone), registry.npmjs.org (corepack + install), and nodejs.org (`build:orcad` downloads Node 24.22.1 headers and executable, hash-verified against Orca's pin). `ORCA_NODE_RUNTIME_CACHE_DIR` redirects that cache (default `out/node-runtime-cache`) [VERIFIED: pinned-node-downloads.mjs read].

**Version verification:** `npm view pnpm@12.14.0 version` returned `12.14.0`, `time.modified` 2026-11-06. `npm view corepack version` returned `0.36.0` (the nixpkgs shell carries 0.35.0, which worked).

## Package Legitimacy Audit

PB adds no npm package to its own tree. Orca's dependency closure is consumed from Orca's own frozen lockfile. The tool seam was run on the only npm packages this phase names:

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| pnpm | npm | long-established; 12.14.0 published 2026-11-05 | ~326M/wk | github.com/pnpm/pnpm | SUS (reason `too-new`: the newest version is 4 days old; the package is not new) | Approved by owner decision P59-10 (Orca pins the exact version and a sha512). Per protocol the plan still carries one `checkpoint:human-verify` before the first corepack download. |
| @vscode/ripgrep-universal | npm | 2026-05 | ~265K/wk | github.com/microsoft/vscode-ripgrep | OK | Orca-locked transitive; no install script |
| node-pty | npm | long-established | (not queried) | — | not run through the seam | Orca-locked, patched by Orca (`config/patches/node-pty@1.1.0.patch`) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** pnpm (version age only; see disposition)

The Claude Code extension is an Open VSX artifact, not an npm package; it is installed by the user through PB's Extensions view and is not redistributed by PB.

## Architecture Patterns

### System Architecture Diagram

```
configuration.toml [upstreams] orca_tag + orca_commit
        |
        v   node scripts/generate.mjs
generated/upstream-pins.env  (UPSTREAM_ORCA_TAG, UPSTREAM_ORCA_COMMIT)
        |
        v   scripts/fetch-orca.sh   (clone to orca.partial, verify HEAD == commit, mv to orca/)
   /orca/  (gitignored, shallow clone at the tag)
        |
        v   nix develop .#orca   (node 24.19.0 + corepack 0.35.0)
   corepack pnpm install --frozen-lockfile --ignore-scripts
        |
        +--> pnpm build:orcad ---> orca/out/orcad/{orcad.js, orcad-server.js, node_modules/node-pty/..., .server-target, .runtime-node, .version}
        |                          orca/out/runtimes/node-<sha>/bin/node   (Node 24.22.1, downloaded)
        |                                     |
        |                                     v   PB de-slot step: rm the 3 marker files, rm -rf orca/out/runtimes
        |                          orca/out/orcad  (slot-less, no Node inside)
        +--> pnpm build:web   ---> orca/out/web/web-index.html
                                              |
        official Node 24.19.0 (node-runtime.json, sha256-checked)
                |  spawns, scrubbed env, ORCA_USER_DATA=<scratch profile>
                v
   orcad.js --bind 127.0.0.1 --port 0 --json --web-client-root orca/out/web
                |  stdout: ONE JSON line {"type":"orca_server_ready", boundEndpoint, health{nodeVersion,terminalDaemon.pid}, pairing{webClientUrl}}
                v
   probe: assert ws://127.0.0.1: prefix, health.nodeVersion == 24.19.0, runtimes-in-tree == 1
                |  pairing.webClientUrl (bearer credential, never printed)
                v
   withProbeShell -> openWebTab(url) -> BiDi DOM read: client rendered, no pairing prompt
                |
                v  finally: kill orcad AND health.terminalDaemon.pid (the daemon outlives orcad)
```

### Recommended Project Structure
```
configuration.toml                       # + orca_tag, orca_commit under [upstreams]
scripts/lib/config-schema.json           # + upstreams.orca_tag / upstreams.orca_commit rows (optional keys)
scripts/generate.mjs                     # emitUpstreamPins: emit the pair; banner text names both
scripts/fetch-orca.sh                    # modelled on fetch-upstream.sh, with --self-test
scripts/build-orca.sh                    # shell-entry check, install, build:orcad, de-slot, build:web
scripts/verify-orca-pin.mjs              # quick: pin derivation + --self-test
scripts/verify-orca-build-shape.mjs      # build-tree shape (no slot files, node count, no Electron) + --self-test
scripts/verify-orca-slotless-start.mjs   # full: spawn orcad, parse ready line, web-tab pairing
scripts/lib/orca-run.mjs                 # shared: scrubbed env, spawn, ready-line parse, redaction, teardown
flake.nix                                # + devShells.orca
.gitignore                               # + /orca/   (ANCHORED, see Pitfall 3)
docs/REBRANDING.md                       # + two rows (verify-rebranding-docs derives them from the schema)
docs/BUILD.md                            # + "Orca build" section, timings naming tree/host/toolchain
inventory/brand-tokens.json              # + "orca" probe and Orca rows
```

### Pattern 1: Fetch script (verify, never trust the tag)
**What:** Clone into a temp sibling, check `HEAD` against the pinned commit, then rename. A tag that was force-moved never lands as `orca/`.
**When to use:** `scripts/fetch-orca.sh`.
```bash
# Source shape: scripts/fetch-upstream.sh (TAG from env, else the generated fragment, no literal fallback)
if [ -z "${TAG:-}" ] && [ -f "$PINS_FRAGMENT" ]; then . "$PINS_FRAGMENT"; TAG="${UPSTREAM_ORCA_TAG:-}"; COMMIT="${UPSTREAM_ORCA_COMMIT:-}"; fi
# An explicit TAG= override must not be checked against the manifest commit: the re-pin job
# supplies its own COMMIT= (resolve with `git ls-remote <remote> "refs/tags/$TAG^{}"`).
git clone --depth 1 --branch "$TAG" https://github.com/stablyai/orca.git "$ORCA_DIR.partial"
HEAD_SHA="$(git -C "$ORCA_DIR.partial" rev-parse HEAD)"
[ "$HEAD_SHA" = "$COMMIT" ] || { echo "fetch-orca: FAIL -- $TAG resolves to $HEAD_SHA, the pin names $COMMIT" >&2; exit 1; }
mv "$ORCA_DIR.partial" "$ORCA_DIR"
```
Re-run path: `rev-parse HEAD` of an existing `orca/` against the commit, exactly like `fetch-upstream.sh`'s `HEAD_SHA` vs `TAG_SHA` compare. Use `refs/tags/$TAG^{commit}` never the bare ref (Pitfall 1).

### Pattern 2: De-slot the orcad output
```bash
# after `pnpm build:orcad`, inside orca/
rm -f  out/orcad/.runtime-node out/orcad/.server-target out/orcad/.version
rm -rf out/runtimes
```
Source for why each removal is required: `orcad-bundled-runtime.ts:24-25` returns "no slot" only when none of the three exist (quoted in Build chain finding 1).

### Pattern 3: Ready-line handshake (from source)
Launch argv and env (all names verified by reading the files cited):
```
<node 24.19.0> orca/out/orcad/orcad.js --bind 127.0.0.1 --port 0 --json --web-client-root orca/out/web
env: ORCA_USER_DATA=<scratch>  ORCA_USER_DATA_PATH=<scratch>  ORCA_VERSION=1.4.248
     ORCA_TELEMETRY_DISABLED=1  DO_NOT_TRACK=1      (every other ORCA_* removed)
```
- `--json` is required for the machine-readable line; without it orcad prints the human text starting `Orca server ready` (`serve-readiness.ts`, `renderServeReadiness` / `renderHumanReadiness`).
- The line is `JSON.stringify({ type: 'orca_server_ready', schemaVersion: 1, runtimeId, endpoint, boundEndpoint, advertisedEndpoint, managedWslCliReconciliation, pairing, health? })` (serve-readiness.ts:76-86). `pairing.webClientUrl` is `string | null` (serve-readiness.ts:11).
- `--port 0` "picks a free port" (orcad `ORCAD_USAGE`); default is `DEFAULT_WS_PORT` with fallback. Always read the port from `boundEndpoint`.
- `--bind` default is `127.0.0.1` (`orcad-bind-address.ts:4`: `export const ORCAD_LOOPBACK_BIND_HOST = '127.0.0.1'`); hostnames are refused, only literal IPs.
- `health.nodeVersion` is `process.versions.node` (`orcad-health.ts:141`: `nodeVersion: process.versions.node,`), so it reads `24.19.0` with no leading `v`.
- `health.terminalDaemon.pid` is `number | null` (`orcad-health.ts`, type `TerminalDaemonHealth`).
- stdout is reserved for readiness (`reserveServeStdoutForReadiness()` in `main.ts`), so one JSON line on stdout and diagnostics on stderr.
- Orca's own CLI redacts this line (`src/cli/runtime/serve-pairing-redaction.ts:12`: `if (line.startsWith('{') && line.includes('"orca_server_ready"'))`). The probe must redact `pairing` itself before any print.
- orcad overwrites `ORCA_USER_DATA_PATH` with what it resolved from `ORCA_USER_DATA` (`orcad-entry.ts` `startOrcad`: `process.env.ORCA_USER_DATA_PATH = userDataPath`), so for orcad the variable that selects the profile is `ORCA_USER_DATA` (`orcad-app-paths.ts:14-21`, `const explicit = env('ORCA_USER_DATA')`). The Orca CLI reads `ORCA_USER_DATA_PATH` (`src/cli/runtime/launch-user-data-path.ts:12-13`). Set both, as DECISIONS says.

### Anti-Patterns to Avoid
- **Starting orcad from the raw `out/orcad` and calling a ready line a pass.** It hands off to Node 24.22.1 (see Summary). Assert `health.nodeVersion`.
- **Running the probe with the host `node`.** This host's `node --version` is `v24.22.1` (the Orca pin), which would hide the D-14 question entirely. Use the extracted official 24.19.0.
- **Editing Orca's scripts to skip the Node download or the markers.** That is a patch outside the D-16 seam list; do the post-build removal instead.
- **A hand-kept expected-count in the build-shape check.** Derive: walk the tree, find executables named `node`/`node.exe`, count distinct hashes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOML parse of the manifest | A regex over `configuration.toml` | `scripts/lib/toml.cjs` (`parse`) and `resolveConfig` from `generate.mjs` | Every pin check does this (verify-upstream-pins.mjs imports `parse`) |
| Row output and self-test harness | A new PASS/FAIL format | `<name>: PASS -- …` / `<name>: FAIL -- … Next step: …` / `<name>: SKIP -- …`; self-test lines `  ok  <case> -> red, naming '<x>'` | Format seen in `verify-generated-identity.mjs`, `generate-licensing.mjs:392`, `detect-upstreams.mjs:446` |
| Web-tab drive and DOM read | Own BiDi client | `withProbeShell`, `openWebTab`, `pollFor`, `app.evaluateIn(ctx, js)` from `pb-live-probe.mjs` | Proven in spike 003 |
| pnpm resolution | Download pnpm by hand | corepack from Orca's `packageManager` | The field carries the sha512 |
| Node download for the probe | Fetch 24.19.0 yourself | The archive and sha256 already in `node-runtime.json`, cached at `.mozbuild/node-dist` (`NODE_ARCHIVE_DIR` in `generate-licensing.mjs:55`) | Same pin, same hash check as the licence generator |
| Detecting native-module ABI mismatches | Own checks | orcad's own native preflight (`--orcad-smoke-load-check` runs during `build:orcad`) | Orca already smoke-tests the bundle on the build Node |

**Key insight:** Orca's build already verifies a lot (zero Electron imports in the bundle, load checks, watcher/daemon smoke). PB's rows should check only what PB adds: the pin, the de-slot post-condition, the Node count, and the start under PB's Node.

## Runtime State Inventory

Not a rename/refactor/migration phase. Omitted. (The new `/orca/` checkout, `.mozbuild/corepack` and the scratch orcad profile are build/test artifacts, all gitignored or under the probe's temp directory.)

## Common Pitfalls

### Pitfall 1: The pinned "commit" is the tag object
**What goes wrong:** `v1.4.248` is an annotated tag. `git ls-remote --tags` lists two lines: `c2f3bb6574e17805c9c41a5d488fa24fb1d27306 refs/tags/v1.4.248` (the tag object) and `965978bc78bf03a6a43187c1ed28fcffe0e01bb5 refs/tags/v1.4.248^{}` (the commit). `git rev-parse refs/tags/v1.4.248` also returns the tag object [VERIFIED: ran both in the scratch clone]. `git rev-parse HEAD` in the clone returns `965978bc…`.
**How to avoid:** `orca_commit = "965978bc78bf03a6a43187c1ed28fcffe0e01bb5"`; compare with `rev-parse HEAD` and `rev-parse "refs/tags/$TAG^{commit}"`. The self-test plants the tag-object SHA as the pin and requires red when an `orca/` fixture exists.
**Warning signs:** a fresh fetch fails its own verify.

### Pitfall 2: Stock `build:orcad` output is slotted, and the failure is silent
**What goes wrong:** see Build chain finding 1. Launching `out/orcad/orcad.js` on Node 24.19.0 does not error; the launcher spawns the bundled 24.22.1 child (`orcad-bundled-runtime.ts:99`, `program: runtime`). A start probe that checks only "ready line printed" passes on the wrong Node.
**How to avoid:** de-slot, then assert `health.nodeVersion === '24.19.0'` and that no `node`/`node.exe` file exists under `orca/out/`.

### Pitfall 3: Unanchored `.gitignore` entry swallows the workstream directory
**What goes wrong:** `orca/` (no leading slash) matches every directory named `orca`, including `.planning/workstreams/orca/`, so new planning files there stop being stageable. Currently not ignored: `git check-ignore -v .planning/workstreams/orca/foo.md` exits 1 [VERIFIED: ran].
**How to avoid:** `/orca/`, anchored, matching the file's existing `/generated/` convention. Add `git ls-files -- orca` returns nothing to the `orca-pin` row (pathspec `orca` is root-relative, so it does not match the workstream dir).

### Pitfall 4: node-pty prebuild floor check on NixOS (UNVERIFIED, can stop the phase)
**What goes wrong:** `build:orcad` builds the host's node-pty slot itself (`build-orcad-node.mjs:ensurePrebuildSlot` runs `build-orcad-prebuilds.mjs --slot=<target>`), then `linuxSlotRecord` calls `floor.verifyLinuxGlibcFloor(slotDir, { targetArch, glibcFloor: slotGlibcFloor(slot) })` and shells out to `objdump` (`process.env.OBJDUMP || 'objdump'`). The glibc slots are designed for a 2.28 floor; NixOS here has glibc 2.42 (`/lib64/ld-linux-x86-64.so.2 -> …glibc-2.42-103…`). Whether Orca's patched node-pty passes that floor under a nix toolchain was not tested.
**How to avoid / respond:** Wave 0 task 1 runs the build and keeps the log. If the floor check fails, do not patch Orca's scripts (outside the D-16 seam list). Stop and put the options to the owner: build in an old-glibc environment, supply prebuilds from elsewhere, or accept 1.4.245 if it differs. Add `pkgs.binutils` to the shell explicitly so `objdump` is certain.

### Pitfall 5: Hidden Electron on a host with Orca desktop installed
**What goes wrong:** orcad probes `~/.local/bin/orca-ide`, `/usr/local/bin/orca-ide`, `/usr/bin/orca-ide`, `/opt/Orca/orca-ide` (`orcad-browser-provider.ts:92-95`) and starts a hidden Electron if found (STACK.md §4; no env var disables it).
**State on this host:** none of the four exists [VERIFIED: `ls`], so the probe is safe here. The probe row should derive these four paths from the same source list and print a named SKIP (not a pass) if any exists.

### Pitfall 6: Terminal daemon outlives orcad
**What goes wrong:** spike finding 8. A probe that only kills orcad leaves `terminal-host` and agent sessions running.
**How to avoid:** read `health.terminalDaemon.pid` from the ready line and kill it in `finally`, plus kill the process group (the registry already runs rows under `setsid`).

### Pitfall 7: Pairing URL leaks through failure output
**What goes wrong:** a thrown `Error` that includes the ready line, a `console.log(ready)`, or a BiDi error echoing the URL prints a reusable credential. `openWebTab(app, url)` may also record the URL in tab/history stores in the throwaway profile.
**How to avoid:** `orca-run.mjs` exposes `redact(readyLine)` and the probe never logs the URL; the test profile is deleted by `withProbeShell`. Add a self-test plant: feed a fixture ready line containing a sentinel pairing code and require the sentinel to be absent from all captured output.

### Pitfall 8: The brand scan is green today for the wrong reason
See Brand scan findings. Green over Orca files proves nothing until `orca` is a probe.

### Pitfall 9: ORCA_VERSION unset
`orcad-host-adapters.ts:39` `getVersion: () => process.env.ORCA_VERSION ?? '0.0.0-orcad'`. Spike 003 set it. Derive it from the pin (`orca_tag` minus the `v`), never hand-type it.

## Code Examples

### Ready-line reader (no URL ever leaves this module)
```javascript
// scripts/lib/orca-run.mjs (sketch). Source facts: serve-readiness.ts:76-86, orcad-health.ts:141.
export function parseReady(stdoutText) {
  const line = stdoutText.split('\n').find(l => l.startsWith('{') && l.includes('"orca_server_ready"'));
  if (!line) throw new Error('orca-run: no orca_server_ready line on stdout');
  const r = JSON.parse(line);
  return {
    boundEndpoint: r.boundEndpoint,          // must start with ws://127.0.0.1:
    nodeVersion: r.health?.nodeVersion,      // "24.19.0", no leading v
    daemonPid: r.health?.terminalDaemon?.pid ?? null,
    webClientUrl: r.pairing?.available ? r.pairing.webClientUrl : null, // callers must not log this
  };
}
```

### Tree-derived Node-runtime count (build-shape check)
```javascript
// Derive, don't keep a list. Executables named node/node.exe under orca/out/, hashed.
// Expected: zero inside the tree; the single runtime is the PB Node the probe used.
// Self-test plants: a second node binary, a .runtime-node, an electron binary.
```

### Registry rows (shape from verify-platform.sh)
```bash
# quick array (near "extension-pins"):
"orca-pin|node $REPO_ROOT/scripts/verify-orca-pin.mjs"
"orca-pin-self-test|node $REPO_ROOT/scripts/verify-orca-pin.mjs --self-test"
"orca-build-shape-self-test|node $REPO_ROOT/scripts/verify-orca-build-shape.mjs --self-test"
# full tier, inside `if [ "$QUICK" -eq 0 ]; then CHECKS+=( … )`:
"orca-build-shape|node $REPO_ROOT/scripts/verify-orca-build-shape.mjs"
"orca-slotless-start|node $REPO_ROOT/scripts/verify-orca-slotless-start.mjs"
```
Commands must be `node <path> [args]` or `bash <path> [args]` or a bare function name; the runner `setsid`s them and records only PASS/FAIL, so a SKIP is a printed line plus exit 0 [VERIFIED: verify-platform.sh run loop, ~lines 6405-6440].

## Build chain findings (Orca 1.4.248, read from source)

1. **Slot files and the second Node are written by `build:orcad`.** `package.json`: `"build:orcad": "pnpm run build:packages && node config/scripts/build-orcad-node.mjs"`. `build-orcad.mjs:163` `writeFileSync(join(OUT_DIR, ORCAD_SERVER_TARGET_FILENAME), …)`, `:168-171` writes `ORCAD_NODE_RUNTIME_MARKER_FILENAME` with `runtimeAsset.executableSha256`, `:410` `writeFileSync(join(OUT_DIR, ORCAD_VERSION_FILENAME), fullVersion)` (only when the build succeeded). Values: `ORCAD_SERVER_TARGET_FILENAME = '.server-target'` (orcad-artifacts.ts:22), `ORCAD_NODE_RUNTIME_MARKER_FILENAME = '.runtime-node'` (:26), `ORCAD_VERSION_FILENAME = '.version'` (:260). `build-orcad-node.mjs:34` `const source = await ensurePinnedNodeExecutable({ target })` copies a hash-checked Node into `<outDir>/../runtimes/node-<sha256>/bin/node` and `:61` verifies it prints `v${NODE_RUNTIME_PIN.version}`; `src/shared/node-runtime-pin.ts` pins `version: '24.22.1'`. Default `--out-dir` is `out/orcad`, so the runtime lands at `out/runtimes/…`. **This answers CONTEXT's open item: yes, it writes all three slot files, and a second Node.**
2. **Slot detection** (`orcad-bundled-runtime.ts:24-25`): `if (!hasMarker && !hasTarget && !existsSync(join(directory, ORCAD_VERSION_FILENAME))) { return null }`. With any of the three present, it requires the target and marker, validates the sha, and needs the runtime file at `../runtimes/node-<sha>/bin/node`. Then `assertOrcadServerRuntime` (`:63-77`): requires `Number(process.versions.node.split('.')[0]) >= 24` (`'The Orca server requires Node.js 24 or newer'`); if a runtime resolves and the process is not it, throws `'Start the Orca server with its bundled Node.js runtime'`; if it is it but the version is not the pin, throws. `launcher.ts` (the `orcad.js` entry) calls `handoffToBundledOrcad()` first, which for a slotted dir spawns `program: runtime` (`:99`) with `ORCA_BUNDLED_LAUNCHER_CHANNEL=1` and returns true. Slot-less: `resolveBundledOrcadRuntime` returns null, `handoffToBundledOrcad` returns false, `assertOrcadServerRuntime` reduces to the `>= 24` test, and `preflightBundledOrcadStartup` (`orcad-profile-preflight.ts:38-42`) returns false at `isRunningAsBundledOrcadRuntime` before ever reading `.version`. No other file in `src/main` reads `.version` on the local start path (`orcad-local-serve-selection.ts:115` is the desktop-CLI serve selection, not used when PB spawns orcad).
3. **node-pty is built by `build:orcad`, not by `rebuild:node`.** `ensurePrebuildSlot` runs `build-orcad-prebuilds.mjs --slot=…` against pinned, hash-verified Node 24.22.1 *headers* at N-API 8 (`SLOT_NAPI_VERSION`), then `stageNodePty` copies the result into `out/orcad/node_modules/node-pty/build/Release`. A N-API-8 addon loads on 24.19.0 (`process.versions.napi` is checked by `native-host-abi.ts:62` against a floor). P59-11's `rebuild:node` (`ensure-native-runtime.mjs --runtime=node --force`) builds node-pty for the dev `node`; the shipped orcad output does not use it. Keep it only if a smoke needs it (`smoke:orcad-terminal` runs it first). Do not make it a prerequisite of RUN-02 without evidence.
4. **Install hygiene.** `pnpm-workspace.yaml` has `allowBuilds` (esbuild, node-pty, bun, cpu-features, `@parcel/watcher`, `@ast-grep/cli` true; `electron` absent) and a `minimumReleaseAge: 4320`. The root `postinstall` is `node config/scripts/build-workspace-packages.mjs && node config/scripts/rebuild-native-deps.mjs`; `--ignore-scripts` skips it, and `build:orcad` re-runs `build:packages` itself. `@xterm/*`, `node-pty@1.1.0` and others are `patchedDependencies`, applied at link time. `config/pnpmfile.cjs` turns on pnpm's global virtual store outside CI (`ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0` opts out). Use `--store-dir` under `.mozbuild/` so the install does not touch `~/.local/share/pnpm`.
5. **`build:web`** = `pnpm run build:packages && node config/scripts/run-vite-web-build.mjs && node config/scripts/verify-web-build.mjs`. `vite.web.config.ts` sets `outDir: resolve('out/web')`, `base: './'`; `verify-web-build.mjs` fails on absolute `/assets/` references and reads `out/web/web-index.html`. `findBundledWebClientRoot` looks at `out/web` first. `resolveOrcadWebClientRoot` warns and serves without the client if `web-index.html` is missing, so the probe must assert the file exists (`WEB_CLIENT_INDEX_FILENAME = 'web-index.html'`). The spike used the installed app's `out/mobile-web`; source-built `out/web` is a different bundle, so the web-tab half must be re-proven (it is P59-04's second clause).
6. **Not run, so unverified:** `pnpm install`, `build:orcad`, `build:web` end to end on Node 24.19.0; the glibc floor; pnpm 12 binary on a host without nix-ld (this host has nix-ld: `NIX_LD=/run/current-system/sw/share/nix-ld/lib/ld.so`, which is why the corepack-downloaded binary ran).

## Repo conventions findings

### Pin plumbing (`generate.mjs`, schema, docs)
- `configuration.toml` `[upstreams]` today holds `firefox_esr_tag = "FIREFOX_153_5_1esr_RELEASE"` and `theia_release = "1.76.0"` (read, lines 155-157).
- `emitUpstreamPins` (`generate.mjs` ~3111-3129) returns `[...UPSTREAM_PINS_BANNER, \`FIREFOX_ESR_TAG=${tag}\`, ''].join('\n')`, guarded by `TAG_NAME_PATTERN = /^[A-Za-z0-9._-]+$/` and `assertEmittable`. The fragment is **one fragment sourced whole** by `fetch-upstream.sh`, so adding variables there is safe as long as the names differ from `TAG`. The banner text says "Sourced by scripts/fetch-upstream.sh as its TAG default" and "([upstreams] firefox_esr_tag)"; update it.
- The generator rejects unknown keys using `scripts/lib/config-schema.json` only. Add `upstreams.orca_tag` (`^v[0-9]+\.[0-9]+\.[0-9]+$`) and `upstreams.orca_commit` (`^[0-9a-f]{40}$`). **Recommend `"required": false`** on both: `required: true` is the downstream mask list, so every downstream manifest and the `.planning/milestones/**/fixtures/*/configuration.toml` fixtures would have to state an Orca pin they have no use for. With optional keys, emit the two lines only when both are present and refuse one-without-the-other, naming the key. `fetch-orca.sh` already fails loudly when the variables are absent.
- `verify-rebranding-docs.mjs` derives its field list from `config-schema.json` and requires every dotted path as an exact backtick span in `docs/REBRANDING.md`. Two new rows in the `[upstreams]` table (REBRANDING.md ~line 305-310) are mandatory or that quick row goes red.
- `generated/` is gitignored; after the edit the executor must run `node scripts/generate.mjs` and `node scripts/generate.mjs --check`, and `generated-byte-identity` must stay green (the `upstream-pins.env` row has no tracked comparand).

### Analog 1: `scripts/verify-upstream-pins.mjs`
Derives expected pins from the manifest via the vendored parser; fragment absent is a SKIP of that step only (fresh clones have no `generated/`), present-but-unreadable is a FAIL; a literal-sweep over `git ls-files` scoped to `scripts/`, `theia/`, `.github/`, root toml/nix/mk with the allowed carriers excluded by path; `--self-test` plants faults **in memory** and requires red naming the file, with the unmutated tree as clean control. Usage and arg handling: unknown arg exits 2 with `FAIL -- unknown argument` and a `Next step:` line.
### Analog 2: `scripts/verify-generated-identity.mjs`
Emits its own comparand into `mkdtempSync` removed in `finally` (reads nothing under `generated/`); derives the emitter set from the generator and compares as set equality both ways; `--self-test` first proves the unmutated tree is green ("so the planted-fault results below would be meaningless" otherwise), then each case prints `ok <case> -> red, naming '<x>'`, and a vacuous case (anchor occurs nowhere) is itself a FAIL.
### Registry mechanics (`verify-platform.sh`)
- One array `CHECKS=( "label|command" … )` in `run_own_checks()`; the first block is the `--quick` set (no build, browser, display, network); the full tier is appended inside `if [ "$QUICK" -eq 0 ]`. `--only <label>` filters; unknown label is a named error. Rows run under `setsid`; only exit code maps to PASS/FAIL. Self-test rows are quick rows (`extension-pins-self-test`, `scan-brand-residue-self-test`). An empty set is itself a failure.
- Existing neighbours to place rows next to: `verify-upstream-pins` at ~line 3820 (quick), `extension-pins` at ~4633.

### `fetch-upstream.sh` features worth copying
`TAG` from env else fragment, no literal fallback, error naming `node scripts/generate.mjs`; compares commit hashes (`rev-parse HEAD` vs `rev-parse "refs/tags/$TAG^{commit}"`) rather than `describe`; has `--self-test` over a throwaway git repo; a clone with `--depth 1 --branch "$TAG"`. Copy the self-test idea: a fixture repo with an annotated tag, plant (a) wrong commit, (b) tag-object SHA, (c) `orca/` present at a different tag.

### Brand scan findings (OVL-04)
- `node scripts/scan-brand-residue.mjs` currently prints `PASS -- no residual brand occurrence in 680 scanned file(s)` [VERIFIED: ran].
- Scan scope = `git ls-files` minus `.planning/`, `inventory/`, `scripts/scan-brand-residue.mjs`, `scripts/rename-brand.mjs` minus binary extensions; `.claude/` IS in scope. A gitignored `/orca/` is out of scope by construction.
- It only knows `scope.residue_probes = ["sourcerer", "deocracy"]` plus the `tokens[]` rows. "orca" is in neither, so any Orca mention anywhere is invisible, and a green scan says nothing about Orca. Files that already mention "orca" outside the excluded paths: `.claude/hooks/ledger-session-check.py:200` ("Orca abandons a session…"), `systemd/legion-pb.nix:25` (a path under `.planning/workstreams/orca/`), the spike-findings skill files under `.claude/skills/spike-findings-Power-Browser/`. (The other grep hits were `…ErrorCapture` substrings, which a probe `orca` would also hit: `TelemetryErrorCapture`, `displayLoadErrorCalls`; a raw case-insensitive substring probe flags those, so see below.)
- Row model: `class` is one of `brand-identifier`, `brand-display`, `identity`, `frozen`, `coincidental` (`CLASSES` in the scan). `coincidental` rows are not renameable, are excluded from the `--extra-root` row set, are accepted by `assertNoProbeSwallowingRow`, and are the established pattern for a name that stays: the `Deocracy` rows use `class: coincidental`, `target` equal to `token`, `expected_count`, `expected_files`, `only_in`. Matching is boundary-based per case form (`lower`/`title` allow a camelCase join on the right; `upper` allows UPPER_SNAKE; `literal` is raw substring); `expected_count` is **exact** and every observed file must be in `expected_files` (condition 3).
- **Recommended implementation (default for the planner):** add `"orca"` to `scope.residue_probes` and add `coincidental` rows for each form actually present (`Orca` title, `orca` lower, `orcad` lower, `ORCA` upper, plus any `literal` such as `ORCA_USER_DATA`-adjacent strings the report shows), each with `only_in` and exact counts taken from `node scripts/scan-brand-residue.mjs --report <path>` on the staged tree. Then an Orca mention in an unlisted file fails condition 4 (probe hit outside any claimed span). Cost: every later edit that adds or removes an Orca mention in a listed file changes a count, the same maintenance the `Deocracy/powerbrowser` row (count 36) already carries. The probe is a case-insensitive raw substring, so it also hits words that merely contain `orca`, such as `ErrorCapture` and `ErrorCalls` (`Err` + `orCa` + `pture`). A grep of the tracked tree found these files: `theia/extensions/telemetry/src/browser/telemetry-error-capture.ts`, `theia/extensions/telemetry/src/browser/telemetry-frontend-module.ts`, `scripts/verify-page-tools-reader-crash.mjs`, `docs/non-gui/plans/wave-e-PLAN.md`. Each needs a claimed span or the probe fires. **Decide before implementing**: either accept those rows, or probe with a boundary-aware pattern (needs a change to the scan's probe code, which is a bigger edit), or skip the probe and classify only with token rows (then "only in brand-tokens.json" is advisory and not enforced). Present this as an owner-visible choice; the minimum honest version is rows + probe + the coincidental `orCa` rows.
- The scan has its own `--self-test`; add a plant that an unclaimed `Orca` in a fixture file goes red naming the file:line.
- Trap carried from CLAUDE.md: stage new files before trusting a green scan.

### Licence allow-list finding (OVL-04) — NOT FOUND
- I searched the tracked tree (`git ls-files | grep` for `spdx`, `dependency-review`, `allow-licenses`, `license-checker`, "licen[cs]e allow") and `scripts/generate-licensing.mjs` (549 lines; `grep -i allow` returns nothing). `inventory/` contains only `brand-tokens.json`. No allow-list of licences exists.
- What exists: `scripts/generate-licensing.mjs` renders `LICENSING.md` and `THIRD-PARTY-NOTICES.txt` from `configuration.toml`, `upstream/` (about:license), the Theia production closure (`theiaClosure`, walks `theia/applications/browser/package.json` dependencies through `node_modules`), and the pinned Node archive's LICENSE (`NODE_PIN_REL = 'powerbrowser/packaging/node-runtime.json'`). Sections today: PowerBrowser, Gecko, Theia application dependencies, Node.js runtime. No Orca section.
- Where the phrase comes from: milestone research PITFALLS.md Pitfall 12 proposes a `--quick` row `orca-licence-inventory` that "fails on non-allow-listed" SPDX ids and a fetch step that fails "on any SPDX id outside an allow-list or on 'NONE'/'SEE LICENSE' unless a ruling is recorded". REQUIREMENTS OVL-04 and ROADMAP SC3 repeat "the licence allow-list" as if it existed. It does not; PITFALLS describes a list to be created.
- Facts for whoever decides: Orca's own licence is MIT, `Copyright (c) 2026 Lovecast Inc.` (`orca-src/LICENSE`, first lines read). PITFALLS (from the installed 1.4.245 bundle, not re-run) lists no GPL/LGPL/AGPL in the bundle's `node_modules`, and two exceptions needing a ruling: `@anthropic-ai/claude-agent-sdk` declares "SEE LICENSE IN README.md" (Anthropic Commercial Terms, not open source) and `@orca/process-host` declares none. That is Phase 68/release territory (nothing ships in Phase 60), but a Phase 60 allow-list that silently admits "SEE LICENSE" would hide it.
- See Open Question 1 for the recommendation and why it needs an owner decision. CONTEXT says "do not invent a new list"; the finding is that the list has to be created or the requirement reinterpreted.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fetch orcad from a release artifact with a second Node 24.22.1 (STACK.md, written before D-04/D-14) | Build from source at a pinned commit, run slot-less on PB's Node | 2026-11-04 (D-04, D-14) | `build:orcad` still emits the slot; the de-slot step is the new work |
| `orca serve` (binds 0.0.0.0) | Spawn `orcad.js` directly with `--bind 127.0.0.1` | spike 003 | Verified from source this session; spike did not run it |
| Spike used `out/mobile-web` from the installed app | Source-built `out/web` | this phase | Different bundle; re-prove pairing |

**Deprecated/outdated in the milestone research:** STACK.md's "Node 24.22.1 for orcad" and "release-artifact fetch"; the spike skill's `ORCA_USER_DATA_PATH` for orcad (ORCA-REBRAND-SURVEY.md already corrects this; orcad reads `ORCA_USER_DATA`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pkgs.mkShell`'s stdenv puts `objdump` on PATH, and adding `pkgs.binutils` explicitly is harmless | Pitfall 4, `.#orca` shell | The glibc-floor step errors "objdump not found"; fix is one line |
| A2 | The corepack-downloaded pnpm 12 binary needs nix-ld or equivalent; hosts without it (CI runners) may fail to run it | Build chain 6 | The Phase 68 weekly job fails on a non-NixOS or no-nix-ld runner |
| A3 | `orca worktree create --name <n> --repo <selector> --json` creates the worktree and prints its path; its default location is the profile's workspaces directory (likely `~/orca/workspaces/<repo>/<name>`) | EXT-01 step list | Executor must read the `--json` output for the path instead of assuming it |
| A4 | Theia's `ovsx-client` picks the `linux-x64` target of a platform-specific Claude Code vsix | EXT-01 | If it picks the universal/none build the extension has no bundled CLI and falls back to `claudeProcessWrapper`; this is part of what EXT-01 measures |
| A5 | The Claude Code login (browser OAuth) can complete from a Theia-hosted plugin host in PB | EXT-01 | Login may need the stock browser window (GUI-01) or a manual flow; counts as the finding if it fails |
| A6 | A `v1.4.2xx` shape regex over `scripts/`, `.github/`, `flake.nix`, `nix/` is a usable "no second tag literal" sweep without false positives | Pin row | If it hits unrelated version strings, narrow the scope or sweep only the pinned value |
| A7 | The N-API-8 node-pty slot built against 24.22.1 headers loads under Node 24.19.0 | Build chain 3 | If not, orcad's native preflight reports degraded/blocked at start and the probe goes red; that is exactly what the probe exists to find |

## Open Questions

1. **What is "the licence allow-list" (OVL-04, SC3)?**
   - What we know: no such list exists in the tree (searched). `generate-licensing.mjs` is a notice generator, not an allow-list. PITFALLS Pitfall 12 proposes creating one with an `orca-licence-inventory` row.
   - What's unclear: whether OVL-04 means (a) a new SPDX allow-list file plus a derived row, (b) an Orca section in `LICENSING.md`/`THIRD-PARTY-NOTICES.txt` via the generator, or both.
   - Recommendation: ask the owner in one box question before planning task detail. Default if no answer: (a) `inventory/licence-allowlist.json` with one entry `{ "spdx": "MIT", "holder": "Lovecast Inc.", "source": "stablyai/orca", "licence_file_sha256": "<of orca/LICENSE at the pin>" }`, plus quick row `orca-licence` that, when `orca/` exists, derives the root `LICENSE` text and compares its SPDX/sha to the row (SKIP line when `orca/` is absent) and fails on any other id. Defer the (b) notice section and the lockfile-wide SPDX scan, including the Claude Agent SDK ruling, to Phase 68 where Orca first ships.
2. **Does stock orcad `build:orcad` pass the node-pty glibc floor on NixOS?** Unknown. Wave 0 build attempt answers it. If not, owner decision (do not patch Orca's build scripts).
3. **Does `health.terminalDaemon` need to be healthy for the ready line?** The ready JSON carries `health` as optional (`health?: OrcadHealth`), so the probe must not assume it exists; if absent, record that and fail RUN-02 only if `nodeVersion` cannot be established another way (`/proc/<pid>/exe`).
4. **Probe form for the "exactly one Node runtime" criterion.** SC2 says "finds exactly one", while a de-slotted build output holds zero. Resolve as: runtimes = distinct-by-hash set of {the Node binary the probe launched} union {every `node`/`node.exe` found under `orca/out/`}; assert size 1 and version 24.19.0. This is what makes the leftover `out/runtimes/` go red.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| nix (flakes) | `.#orca` shell | yes | on PATH at `/run/current-system/sw/bin/nix` | — |
| nixpkgs `nodejs_24` (locked) | build + dev Node | yes | 24.19.0 | — |
| nixpkgs `corepack_24` | pnpm 12.14.0 | yes | package 24.19.0, corepack 0.35.0 | — |
| pnpm 12.14.0 | Orca build | yes via corepack (ran) | 12.14.0 | none; nixpkgs has 11.21.0 only |
| nix-ld | running the corepack pnpm binary and the official Node tarball binary | yes (`NIX_LD` set) | — | `steam-run`/FHS env (not tested) |
| Host Node | not for the probe | v24.22.1 | trap, see Anti-Patterns | use extracted official 24.19.0 |
| Official Node 24.19.0 tarball | probe runtime | yes, cached in the main checkout's `.mozbuild/node-dist` (sha256 matches `node-runtime.json`) | v24.19.0 | refetch from the pinned URL; this worktree has no `.mozbuild/node-dist` yet |
| gcc, make, python3 | node-gyp for node-pty prebuild | present on host profile; the shell must supply them (`pkgs.python3 pkgs.gnumake pkgs.pkg-config` as in `.#theia`, stdenv gcc via mkShell) | — | — |
| `objdump` | Orca's glibc-floor check | assumed via binutils | — | add `pkgs.binutils` |
| Network: github.com, registry.npmjs.org, nodejs.org | clone, install, `build:orcad` Node download | yes | — | `ORCA_NODE_RUNTIME_CACHE_DIR` cache for repeat builds |
| Built PB (`objdir/dist/bin/powerbrowser`) | web-tab half | yes (exists in this worktree) | — | SKIP the web-tab half with a named line |
| Installed Orca desktop at the four probed paths | must be ABSENT | absent (verified) | — | probe prints SKIP if any appears |
| `orca` CLI shim | worktree creation for EXT-01 | yes, `/home/chris/.config/orca/linux-orca-cli-shim/orca` (1.4.245) | 1.4.245 vs orcad 1.4.248 | `pnpm build:cli` in the tree builds the matching CLI |
| Disk | clone ~525 MB plus `node_modules` and store | 861 GB free on /home | — | — |

**Missing dependencies with no fallback:** none found. Unknown: pnpm 12 on a non-nix-ld host (A2).

## Validation Architecture

> `workflow.nyquist_validation` was not read as false (no override seen); section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `scripts/verify-platform.sh` registry of `node`/`bash` scripts, each with `--self-test` |
| Config file | none (the registry is the config) |
| Quick run command | `scripts/verify-platform.sh --quick` (seconds; no build, browser, display, network) |
| Single row | `scripts/verify-platform.sh --only <label>` |
| Full suite command | `scripts/verify-platform.sh` (adds the full-tier rows below) |

### Phase Requirements → Test Map
| Success criterion / Req | Behavior | Row(s) | Tier | `--self-test` plants (each must go red naming the drift) | Human? |
|---|---|---|---|---|---|
| SC1 / RUN-01 | Tag and commit derived from `configuration.toml`; generated env, fetch script and a fetched `orca/` agree; no tracked file under `orca/` | `orca-pin`, `orca-pin-self-test` | quick | (1) mismatched tag in the env fragment; (2) mismatched commit in the fragment; (3) tag-object SHA as the pin vs a fixture `orca/` whose HEAD is the commit; (4) fixture `orca/` at a different tag; (5) tag or commit literal in `scripts/fetch-orca.sh`; (6) one key present without the other; (7) a tracked path under `orca/` | no |
| SC1 / RUN-01 | Build scripts exist and are wired: `fetch-orca.sh` verify-instead-of-reclone; `flake.nix` has `devShells.orca` with `nodejs_24` and `corepack_24` | `orca-pin` (static half) and `fetch-orca.sh --self-test` as a quick row `fetch-orca-self-test` | quick | planted wrong commit rejected before `mv`; planted dirty/partial dir | no |
| SC2 / RUN-02 | De-slotted tree has none of `.runtime-node`, `.server-target`, `.version`; exactly the Node runtimes derived from the tree; no Electron binary | `orca-build-shape` (full, SKIP named line if no built `orca/`), `orca-build-shape-self-test` (quick) | full + quick | planted: each of the 3 marker files; a second `node` binary under `out/`; an `out/runtimes/node-<sha>/bin/node`; a file named `electron` (ELF/`electron` dist dir) under `node_modules`; and the clean control green first | no |
| SC2 / RUN-02 | orcad starts on Node 24.19.0 slot-less, ready line, loopback, answers; `health.nodeVersion == 24.19.0`; source web client pairs in a PB web tab with no prompt; pairing URL absent from output; daemon reaped | `orca-slotless-start` (full) | full | in `--self-test` (quick-capable, no orcad): a fixture ready line with `boundEndpoint: ws://0.0.0.0:…` goes red; with `nodeVersion: 24.22.1` red; with `ws://127.0.0.1:` and `24.19.0` green; a sentinel pairing code in the fixture must not appear in captured output | no |
| SC2 fallback | If 1.4.248 fails, repin to 1.4.245 and record exit code, message, slot file found | recorded in the phase summary; `orca-pin` re-run after changing both keys | — | covered by `orca-pin` plants (1)(2) | yes: a recorded decision, and the double-failure stop-and-ask |
| SC3 / OVL-04 | Brand scan exits 0 over the staged tree including every Orca-related file; "Orca" classified only in the inventory | existing `scan-brand-residue` and `scan-brand-residue-self-test` (extend the self-test) | quick | plant: an unclaimed `Orca` in a fixture file goes red naming file:line (requires the `orca` probe); plant: an Orca row whose `expected_count` is wrong | no |
| SC3 / OVL-04 | Orca's MIT licence has a row in the allow-list (per Open Question 1) | `orca-licence`, `orca-licence-self-test` | quick | plant: licence text altered; plant: SPDX id not in the list; plant: "SEE LICENSE IN" id | owner decision on the list's form |
| SC1-3 | Manifest schema and docs stay coherent | existing `verify-rebranding-docs`, `generated-byte-identity`, `generate-check`, `upstream-pins` | quick | existing plants | no |
| SC4 / EXT-01 | Claude Code extension starts a session in an Orca worktree in Theia 1.76, answers, edits a file | none (manual) | — | — | **Yes.** Needs Chris's Claude login and a live Theia; not automatable by design (P59-08). The only derivable assertions are preconditions (open-vsx.org and openvsx.eclipsecontent.org allowed in `endpoint-allowlist.json`, already so). Record: extension version, whether the chat panel or only `claudeCode.useTerminal` worked, the failure message. |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --quick` (stage new files first, brand scan sees only `git ls-files`)
- **Per wave merge:** `--quick` plus `--only orca-build-shape` once an `orca/` is built
- **Phase gate:** `scripts/verify-platform.sh --quick` green, then `--only orca-slotless-start` and `--only orca-build-shape` green on a built tree, plus the EXT-01 record present

### Wave 0 Gaps
- [ ] `scripts/verify-orca-pin.mjs` (+ `--self-test`) — SC1
- [ ] `scripts/fetch-orca.sh` (+ `--self-test`) — SC1
- [ ] `scripts/build-orca.sh` — de-slot step is the whole of RUN-02's build side
- [ ] `scripts/verify-orca-build-shape.mjs` (+ `--self-test`) — SC2
- [ ] `scripts/lib/orca-run.mjs` and `scripts/verify-orca-slotless-start.mjs` (+ `--self-test`) — SC2
- [ ] `flake.nix` `devShells.orca`; `.gitignore` `/orca/`
- [ ] `config-schema.json` rows; `generate.mjs` emitter and banner; `docs/REBRANDING.md` rows; `docs/BUILD.md` section
- [ ] `inventory/brand-tokens.json` rows and `orca` probe; scan self-test plant
- [ ] Licence row and check per Open Question 1
- [ ] **Wave 0 task 1, before everything above is trusted:** run the build in `.#orca` and capture the log (Pitfall 4)

## Security Domain

> `security_enforcement` not seen as false; included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (pairing) | Pairing URL is a bearer credential: never printed, never persisted (Pitfall 7); orcad binds loopback only (`--bind 127.0.0.1`), asserted via `boundEndpoint` |
| V3 Session Management | no | — |
| V4 Access Control | yes | Origin/token gating is Phase 62+ (D-17); the probe runs against a scratch profile only |
| V5 Input Validation | yes | Manifest values are validated twice before reaching a shell-sourced file: schema regex and the emitter's pattern (`TAG_NAME_PATTERN` model); `orca_commit` `^[0-9a-f]{40}$`, `orca_tag` `^v[0-9]+\.[0-9]+\.[0-9]+$` |
| V6 Cryptography | yes (integrity) | Hash-verified artifacts only: corepack uses the sha512 in `packageManager`; `build:orcad` hash-checks its Node download; the probe's Node comes from the sha256 in `node-runtime.json`. No hand-rolled hashing beyond comparing digests |
| V10/V14 Supply chain | yes | Pin the commit not the tag (retargetable); `pnpm install --frozen-lockfile`; `--ignore-scripts` (no dependency lifecycle code runs at install); `minimumReleaseAge` is Orca's own |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Retargeted upstream tag | Tampering | `orca_commit` + clone-to-temp-then-verify-then-`mv` |
| Malicious dependency lifecycle script | Elevation | `--ignore-scripts`; build via Orca's own audited scripts only |
| Pairing URL reused or leaked from logs | Information disclosure | Redaction in `orca-run.mjs`, sentinel self-test, scratch profile deleted |
| Inherited `ORCA_*` pointing the child at the user's real profile or hook ports | Tampering / disclosure | Allowlisted child env: remove every `ORCA_*`, `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, `NODE_REPL_EXTERNAL_MODULE`; set only the listed variables (STACK.md §5 list) |
| Telemetry to Orca cloud | Disclosure | `ORCA_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1` (read in `observability/index.ts:64-65`, `telemetry/consent.ts:53-56`) |
| Hidden Electron launched from an installed Orca | Tampering | Probe SKIPs if any of the four paths exists (Pitfall 5) |
| Credentials stored unencrypted on a temp profile | Disclosure | Probe profile holds no credentials; EXT-01's profile is persistent (`powerbrowser-orca` under the user's config, not `/tmp`) |
| orcad bound beyond loopback | Information disclosure | Assert `boundEndpoint` prefix; never use `orca serve` (hardcodes 0.0.0.0 per spike 003) |

## Claude Code extension (EXT-01) findings

- **Published on Open VSX** as `Anthropic.claude-code`, verified publisher, version **2.1.319**, timestamp 2026-11-06T17:04:01Z, `engines.vscode ^1.94.0`, 65,251,519 downloads, 101 versions. Anthropic's docs state they submit to both the Visual Studio Marketplace and Open VSX. [CITED: open-vsx.org/api/anthropic/claude-code; code.claude.com/docs/en/vs-code]
- **Licence consequence:** the licence field is "© Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance." It is proprietary. PB neither bundles nor redistributes it (the user installs it at runtime from the registry through the Extensions view, P59-06), so PB takes on no redistribution licence. Do **not** add it as a pinned `[[extensions]]` entry or package it without a ruling. It also must not be added to the licence allow-list as if PB shipped it.
- **Theia fit:** Theia 1.76.0 reports VS Code API `1.139.0` (`api.js:23`), above `^1.94.0`. PB's `applications/browser/package.json` already ships `@theia/plugin-ext-vscode`, `@theia/vsx-registry`, `@theia/ovsx-client` and the start script sets `VSX_REGISTRY_URL=https://open-vsx.org`. `endpoint-allowlist.json` already allows `open-vsx.org`, `openvsx.eclipsecontent.org` (and `api.anthropic.com`, listed for `@theia/ai-anthropic`); the extension's own bundled CLI will also contact Anthropic/claude.ai hosts for login and API from the plugin host, which the endpoint wall may or may not cover (not tested; note what happens).
- **Workspace trust:** the extension does not work in Restricted Mode. PB sets `"security.workspace.trust.enabled": false` (`theia/applications/browser/package.json:22`), which should avoid it [CITED for the extension's restriction; the PB setting VERIFIED by read, the interaction not tested].
- **Modes:** graphical chat panel by default; `claudeCode.useTerminal` (default `false`) switches to terminal mode; `claudeProcessWrapper` points at a separately installed `claude` if the platform build has no bundled binary; login is a browser flow, "complete authorization in your browser" [CITED: code.claude.com/docs/en/vs-code]. Per P59-07 only the chat panel counts as a pass; terminal mode working alone is failed-partial.
- **Platform vsix:** the Open VSX download URL for the API's returned file carries a platform target (`alpine-arm64` in the sample). Theia's `ovsx-client` has target-platform logic (`ovsx-api-filter.js:29-37`: `const targetPlatform = query.targetPlatform; if (!targetPlatform) {…}` and a `universal` fallback); that it selects `linux-x64` here is untested (A4).

### Step list for Chris (EXT-01 checkpoint; execution prepares, he runs)
Execution prepares: a built `objdir`, `orca/` built and de-slotted, orcad started on the scratch profile, a scratch git repo registered, an Orca worktree created, PB started with its sidecar. Record the worktree path from the CLI's `--json` output.
1. Create the worktree (prepared by execution): `ORCA_USER_DATA_PATH=<profile> orca repo add --path <scratch repo>` then `orca worktree create --name ext01 --repo <selector> --json` (flags verified in `src/cli/root-help-text-secondary.ts`; the shim is 1.4.245, `pnpm build:cli` in the tree gives a matching CLI).
2. In PB's Theia, open that worktree folder (File > Open Folder).
3. Open the Extensions view, search "Claude Code", install `Anthropic.claude-code`; note the version shown.
4. Open the Claude Code panel (chat panel, not terminal), sign in with the browser flow, ask it a question, then ask it to edit a named file; confirm the file changed on disk.
5. If the panel fails, set `claudeCode.useTerminal` and try again to tell failed-partial from failed.
6. Record: extension version, chat-panel pass/fail, terminal-mode pass/fail, exact error text, whether login completed. A failure reshapes EXT-02 (Phase 63) before it is planned.

Live GUI loop from project memory (not re-verified): run the sidecar standalone with `POWERBROWSER_TOKEN_DISABLE=1` on a free port and drive with gsd-browser; `PB_LIVE_HEADED=1` makes probe sessions headed (`pb-live-probe.mjs` sets it when `PB_REAL_INPUT=1`).

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core; never modify Gecko outside the patch stack; Phase 60 adds no Gecko or Theia code. The probe uses the existing `pb-live-probe.mjs`; nothing imports a Firefox internal (`check-internals-boundary.sh` unaffected).
- Design for the bridge: `TabUriRegistry` shape untouched; this phase adds no tab type.
- Repo path must have no space: the worktree is `/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration` (no space). The new shell must not set anything that reintroduces a space-bearing path into `NIX_LDFLAGS`.
- One verification driver and one registry: append rows to `scripts/verify-platform.sh`; no sibling driver.
- Registry checks: no absence-assertions on log lines you also emit (the probe's "no pairing prompt" assertion must read the rendered DOM, not a log); derive expectations from the tree and compare as set equality; every new check gets a `--self-test` that plants faults, each going red naming the drift.
- Brand scan is permanent (`node scripts/scan-brand-residue.mjs` exit 0); stage new files before trusting a green scan; "Orca" classified only in `inventory/brand-tokens.json`; the originating product may be named only there.
- Patches regenerated never text-edited: no patch is created in this phase.
- No generator in Phase 1 rule is a Phase 1 rule; here the generator (`generate.mjs`) is the normal route for pins.
- User-facing copy: no internal identifiers; N/A this phase (no user-facing strings added), but the build/probe scripts' messages are developer-facing and may name paths.
- Builds inside Nix dev shells; `node` outside is fine, `yarn`/`pnpm` are not. Timings in `docs/BUILD.md` must each name tree, host and toolchain.
- Memory notes that bind: stage with explicit paths and never `-a`/`--amend`/bare stash (another session may commit); Phase 59 runs in parallel, do not touch its files; questions go through the AskUserQuestion box (Open Question 1); subagent model tiers per project memory.

## Sources

### Primary (HIGH confidence)
- Orca source at `v1.4.248` (commit `965978bc78bf03a6a43187c1ed28fcffe0e01bb5`), shallow clone in the research scratch directory: `package.json`, `pnpm-workspace.yaml`, `config/scripts/build-orcad-node.mjs`, `build-orcad.mjs`, `build-orcad-prebuilds.mjs`, `pinned-node-downloads.mjs`, `ensure-native-runtime.mjs`, `src/main/orcad/{orcad-bundled-runtime,launcher,main,orcad-command-arguments,orcad-health,orcad-app-paths,orcad-entry,orcad-bind-address,orcad-profile-preflight,orcad-browser-provider}.ts`, `src/main/server/serve-readiness.ts`, `src/shared/{orcad-artifacts,node-runtime-pin,bundled-web-client-root}.ts`, `vite.web.config.ts`, `LICENSE`
- `git ls-remote --tags https://github.com/stablyai/orca.git` (tags through v1.4.255 at research time)
- PB tree reads: `configuration.toml`, `scripts/{fetch-upstream.sh,generate.mjs,verify-upstream-pins.mjs,verify-extension-pins.mjs,verify-generated-identity.mjs,verify-platform.sh,scan-brand-residue.mjs,generate-licensing.mjs,lib/pb-live-probe.mjs,lib/config-schema.json}`, `inventory/brand-tokens.json`, `flake.nix`, `powerbrowser/packaging/node-runtime.json`, `powerbrowser/endpoint-allowlist.json`, `theia/applications/browser/package.json`, `.gitignore`, `docs/REBRANDING.md`
- Commands run: `nix eval --inputs-from . nixpkgs#{nodejs_24,corepack_24,pnpm}.version`; `corepack pnpm --version` inside `nix shell nixpkgs#nodejs_24 nixpkgs#corepack_24`; `sha256sum` of the cached Node tarball; `bin/node --version` of the extracted official binary; `node scripts/scan-brand-residue.mjs`; `npm view pnpm@12.14.0`, `npm view @vscode/ripgrep-universal`, `npm view node-pty`; `gsd-tools query package-legitimacy check`

### Secondary (MEDIUM confidence)
- open-vsx.org/api/anthropic/claude-code (fetched, summarised by the fetch tool)
- code.claude.com/docs/en/vs-code (fetched, first 100,000 of 101,497 characters read)

### Tertiary (LOW confidence)
- Milestone research (`STACK.md`, `PITFALLS.md`, `ORCA-REBRAND-SURVEY.md`) for host-path lists and the licence scan of the 1.4.245 bundle; written against 1.4.214/1.4.245 and before D-04/D-14, not re-run here
- Spike 003 results (1.4.245 behaviour; `orca serve` bind finding is from source, not run)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for pins, commit, Node and pnpm resolution (each run or read this session); MEDIUM for the extension (registry metadata only, no run)
- Architecture: HIGH for the slot/de-slot mechanics and ready-line handshake (read in source, line-cited); MEDIUM for the full-build behaviour on NixOS (not run)
- Pitfalls: HIGH for 1, 2, 3, 5, 6, 7 (source or command evidence); MEDIUM for 4 (the glibc floor is read, its outcome on NixOS is not known)

**Not done:** `pnpm install`, `build:orcad`, `build:web` and the actual orcad start were not run (permission denied for third-party install scripts in this session); the 1.4.245 fallback tree was not cloned or compared; no Open VSX vsix was downloaded or run; Theia was not started.

**Research date:** 2026-11-09
**Valid until:** 2026-11-16 for pin values and "newest tag" statements (Orca ships about five releases a week; v1.4.255 exists today); the source-reading findings hold for the pinned commit regardless of newer tags.
