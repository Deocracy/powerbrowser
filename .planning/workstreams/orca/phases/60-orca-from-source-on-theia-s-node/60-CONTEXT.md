# Phase 60: Orca from source on Theia's Node - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

PowerBrowser fetches Orca's source at the pinned tag and builds orcad and the Orca web client
with Orca's own `build:orcad` and `build:web`. orcad starts slot-less on Theia's Node 24.19.0
with no second runtime, and the source-built web client pairs with it in a PB web tab. "Orca" is
classified in the brand inventory and Orca's MIT licence is recorded. The Claude Code VS Code
extension is checked live on Theia 1.76 against an Orca-created worktree.

Requirements: RUN-01, RUN-02, OVL-04, EXT-01. Not in this phase: the overlay and seam gate,
OrcaService supervision (Phase 62), packaging orcad into PB artifacts (Phase 68).

Milestone decisions D-01..D-29 in `.planning/workstreams/orca/DECISIONS.md` hold. The decisions
below are numbered P59-nn so they do not collide with them.

</domain>

<decisions>
## Implementation Decisions

### Pin and source location
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

### Slot-less start
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

### Claude Code extension check (EXT-01)
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

### Build shell and Electron
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and decisions
- `.planning/workstreams/orca/ROADMAP.md` §Phase 60 — goal and the four success criteria
- `.planning/workstreams/orca/REQUIREMENTS.md` — RUN-01, RUN-02, OVL-04, EXT-01
- `.planning/workstreams/orca/DECISIONS.md` — D-04 (source build, pin, fallback), D-14 (slot-less on Theia's Node), D-06 (extension goals), D-16 (overlay cap)
- `.planning/workstreams/orca/ADVERSARIAL-orca-ownership.md` — why the overlay is additive
- `CLAUDE.md` — hard rules, one verification driver, brand scan, derive-don't-hand-keep checks

### Research (read with care: written before D-04/D-14 replaced the release-artifact fetch and the second Node)
- `.planning/workstreams/orca/research/STACK.md` — §3 the orcad slot and identity formula (what slot-less avoids), §4 launch argv/env, the installed-Orca hidden Electron side effect
- `.planning/workstreams/orca/research/PITFALLS.md` — build and runtime pitfalls
- `.planning/workstreams/orca/ORCA-REBRAND-SURVEY.md` — where "Orca" appears

### Spike 003 (orcad headless + client in a PB web tab)
- `.claude/skills/spike-findings-Power-Browser/references/orca-client-hosting.md` — launch shape, ready JSON, pairing URL as a bearer credential, env scrubbing, `repo add`
- `.claude/skills/spike-findings-Power-Browser/sources/003-orca-headless-client-in-pb/probe.mjs` — probe pattern to reuse for P59-04 (run from `.planning/spikes/` originals)

### Orca source (reference checkout `/home/chris/coding/orca-eval`; the build uses `orca/` at the pin)
- `src/main/orcad/orcad-bundled-runtime.ts:18-26,61-77` — slot-less = none of `.runtime-node`, target file, `.version`; then only Node >= 24 is required
- `package.json` — `packageManager: pnpm@12.14.0+sha512…`, `engines.node: 24`, scripts `build:orcad`, `build:web`, `postinstall`, `rebuild:node`
- `config/scripts/rebuild-native-deps.mjs` — the Electron rebuild P59-11 skips
- `config/scripts/ensure-native-runtime.mjs`, `config/scripts/build-orcad-node.mjs` — Node-target native build and orcad build

### PB tree
- `configuration.toml` `[upstreams]` — where the pin goes
- `scripts/fetch-upstream.sh` — model for `fetch-orca.sh`
- `scripts/verify-upstream-pins.mjs`, `scripts/detect-upstreams.mjs` — existing pin checks to extend or mirror
- `scripts/generate.mjs` — emits `generated/upstream-pins.env`
- `scripts/verify-platform.sh` — the one registry for new rows
- `powerbrowser/packaging/node-runtime.json` — Theia's Node 24.19.0 per OS (the runtime the probe must use)
- `flake.nix` — devShells (`.#firefox`, `.#theia`); `.#orca` is added here
- `inventory/brand-tokens.json` — the only file that may classify "Orca"
- `scripts/generate-licensing.mjs` — LICENSING.md / THIRD-PARTY-NOTICES derivation (see open item on the licence allow-list)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/fetch-upstream.sh`: pin from `generated/upstream-pins.env`, `TAG=` override, re-runnable verify-instead-of-reclone. Copy its shape for `fetch-orca.sh`.
- `scripts/verify-upstream-pins.mjs`: existing upstream pin check; the Orca tag+commit row should follow or extend it.
- Spike 003 probe (`withProbeShell`, `openWebTab`, BiDi `evaluateIn`): proven way to open the pairing URL in a PB web tab and read the DOM.
- `theia/applications/browser/package.json` start script: `VSX_REGISTRY_URL=https://open-vsx.org`, the install path for EXT-01.

### Established Patterns
- Pins live once in `configuration.toml` and reach consumers only through `generate.mjs`; no literal fallback in scripts.
- Gitignored upstream checkout at repo root (`upstream/`), never hand-edited.
- Each new check is one `verify-platform.sh` row with a `--self-test` that plants each fault.
- The brand scan iterates `git ls-files`: stage new files before trusting a green scan. A gitignored `orca/` is outside the scan by design.

### Integration Points
- `configuration.toml` `[upstreams]` → `generate.mjs` → `generated/upstream-pins.env` → `fetch-orca.sh` and the pin row.
- `flake.nix` devShells: add `orca`.
- `.gitignore`: add `orca/`.
- `verify-platform.sh`: a `--quick` pin row, a full-run start-probe row, a Node-runtime-count check and a no-Electron check.

### Open items for research
- **Licence allow-list location.** SC3 and OVL-04 name "the licence allow-list", but `scripts/generate-licensing.mjs` has no allow-list. Find what the requirement refers to (or which file should hold Orca's MIT row) before planning; do not invent a new list.
- **Does `build:orcad` write slot files into its output?** If its output carries `.runtime-node`, the target file or `.version`, the exact-24.22.1 check turns back on. The probe must start orcad from a directory without them, and this must not require a seam patch.
- **Which Node binary the probe uses.** The probe must run orcad on the 24.19.0 binary from `node-runtime.json` (what PB ships), not whatever `nodejs_24` version nixpkgs provides in the dev shell. Record both versions.
- **`orca serve` binds 0.0.0.0.** Spawn orcad directly with `--bind 127.0.0.1` and `--web-client-root <build:web output>` (spike 003 finding).
- **Hidden Electron side effect.** orcad launches an installed Orca desktop as a hidden browser engine (RUN-04, Phase 62). The probe runs on a host where this cannot occur, or records that it did.

</code_context>

<specifics>
## Specific Ideas

- Run mode is interactive per phase (D-25). EXT-01 is a human checkpoint for Chris; the slot-less double failure is a stop-and-ask.
- The pin 1.4.248 is already several releases behind on 2026-11-05. That is accepted (D-04); the weekly re-pin is Phase 68.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Packaging orcad into PB artifacts and the weekly re-pin remain Phase 68 as already planned.

</deferred>

---

*Phase: 60-orca-from-source-on-theia-s-node*
*Context gathered: 2026-11-05*
