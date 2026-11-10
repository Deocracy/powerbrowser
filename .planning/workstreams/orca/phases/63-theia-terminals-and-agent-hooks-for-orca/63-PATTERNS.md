# Phase 63: Theia terminals and agent hooks for Orca - Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 27 new or modified (file list from 63-RESEARCH "Recommended file layout", with Amendments A1-A9 applied)
**Analogs found:** 24 / 27 (3 partial or none: the node-pty facade, the EXT-02 wrapper, the TERM-04 key-policy frontend)

All analog paths below are git-tracked (checked with `git ls-files`). Line numbers are from this worktree. Orca-side facts (seam pre-images, blob ids, 22 required members, `IPty` members) are in 63-RESEARCH.md and are not repeated; this file only says what to copy from where.

**Amendments applied:** A1 (no PB provider class, so no `PowerBrowserTheiaPtyProvider` file), A2 (S2/S3 shapes; S3 returns an async `LocalPtySpawn`), A3 (no hidden-at-spawn), A5 (TERM-03 owner decision; lane p63-04 and `orca-remote-terminals-live` are conditional, not mapped beyond a registry row), A6 (`when: 'terminalFocus && powerbrowser.orcaTerminalActive'`), A7 (`terminal.create`, wrapper spawns claude as a child), A8 (parse with `theia/node_modules/typescript`), A9 (`OrcaTerminalProcess extends TerminalProcess`, `kind: 'orca'`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `orca-overlay/seams.json` (mod: +2 rows S2, S3) | config | n/a | its own row (lines 2-9) | exact |
| `orca-overlay/patches/020-pb-theia-pty-daemon-skip.patch` (new, S2) | patch | n/a | `orca-overlay/patches/010-installed-electron-switch.patch` | exact (regenerated, never typed) |
| `orca-overlay/patches/030-pb-theia-pty-runtime-spawn.patch` (new, S3) | patch | n/a | same | exact |
| `orca-overlay/files/src/main/providers/local-pty/pb-theia-pty-bridge.ts` (new) | client + adapter | streaming (socket, NDJSON) | none in tree for a node-pty facade; marker rule from `scripts/verify-orca-overlay.mjs:57` | partial (first real `files/` entry) |
| `orca-overlay/files/src/main/providers/local-pty/pb-theia-pty-protocol.ts` (new) | protocol constant set | n/a | `theia/extensions/tab-uris/src/browser/tab-store-access-protocol.ts` (shared contract imported by both sides) | role-match |
| `theia/extensions/orca-terminals/package.json`, `tsconfig.json` (new) | config | n/a | `theia/extensions/tab-uris/package.json`, `theia/extensions/token-gate/tsconfig.json` | exact |
| `theia/extensions/orca-terminals/src/common/orca-pty-protocol.ts` (new) | protocol | n/a | `tab-uris/src/browser/tab-store-access-protocol.ts` | role-match |
| `theia/extensions/orca-terminals/src/node/orca-pty-bridge-core.ts` (new, plain Node) | service | streaming (Unix socket server) | `token-gate/src/node/powerbrowser-env.ts` (env capture) + `OrcaService` state-file write pattern | partial |
| `theia/extensions/orca-terminals/src/node/orca-terminal-process.ts` (new) | subclass | streaming | `@theia/process/lib/node/task-terminal-process.js` (node_modules, reference only) | exact (upstream precedent named by A9) |
| `theia/extensions/orca-terminals/src/node/orca-terminals-backend-module.ts` (new) | DI module + contribution | event-driven / RPC | `tab-uris/src/node/tab-store-access-backend-module.ts`, `token-gate/src/node/token-gate-backend-module.ts` | exact |
| `theia/extensions/orca-terminals/src/browser/orca-terminals-frontend-module.ts` (+ opener, keybindings, context key) | frontend contribution | event-driven | `tab-uris/src/browser/terminal-naming-contribution.ts`, `chrome-bar/src/browser/chrome-bar-keybindings.ts:85-91`, `chrome-bar/src/browser/chrome-bar-shortcuts.ts:265-269` | role-match |
| `theia/extensions/tab-uris/src/browser/terminal-open-handler.ts` (mod: `o<n>` stale exemption) | open handler | request-response | itself, lines 46-77 | exact |
| `theia/extensions/orca-agents/package.json` + preference default contribution (new) | config (preference) | n/a | `theia/extensions/telemetry/src/browser/telemetry-preferences.ts:19-57` | partial (RESEARCH Open Question 2: default of a VS Code extension setting) |
| `theia/extensions/orca-agents/bin/claude-wrapper.mjs` (new) | CLI wrapper | process lifecycle | `scripts/lib/orca-run.mjs` (`startOrcad` 175, `stopOrcad` 255) for child spawn/stop | partial |
| `theia/applications/browser/package.json` (mod: 2 deps) | config | n/a | line 45 `"@powerbrowser/tab-uris": "0.1.0"` | exact |
| `theia/package.json` (mod: `build:extensions` line 69) | config | n/a | itself line 69 | exact |
| `powerbrowser/shell/OrcaEnv.sys.mjs` (mod: switch name, `ptyBridgeDirFor`) | utility (pure) | transform | itself: `ORCAD_HIDDEN_ELECTRON_SWITCH` 16, `ORCAD_FIXED_ENV_NAMES` 19-26, `aliasPathFor` 185-198 | exact |
| `powerbrowser/shell/TheiaService.sys.mjs` (mod: `POWERBROWSER_ORCA_PTY_DIR`) | service | env handshake | itself lines 866-873 (`POWERBROWSER_PROFILE_DIR`) | exact |
| `powerbrowser/shell/OrcaService.sys.mjs` (mod: endpoint env, `orcad-data-root` file, `daemonPid === null` accepted) | service | process lifecycle | itself lines 100-115 (`_resolve`), 170-180 (`_makeAlias`), 405-420 (state file) | exact |
| `docs/URI-SCHEMES.md` (mod: `o<n>` row) | doc | n/a | `## terminal:` section lines 144-170 | exact |
| `scripts/verify-orca-pty-contract.mjs` (new, + `--self-test`) | check (quick) | derive-compare | `scripts/verify-orca-overlay.mjs` | exact |
| `scripts/verify-orca-terminal-keys.mjs` (new, + `--self-test`) | check (quick) | derive-compare | `scripts/verify-orca-service.mjs` (static source derivation, SKIP at 514) | exact |
| `scripts/verify-orca-agent-hooks.mjs` (new, full + quick self-test) | check (hermetic full) | spawn and observe | `scripts/verify-orca-hidden-electron.mjs` + `scripts/lib/orca-run.mjs` | role-match |
| `scripts/verify-orca-pty-provider-live.mjs`, `verify-orca-terminal-keys-live.mjs`, `verify-orca-agent-status-live` (new, live) | check (live) | event-driven | `scripts/verify-orca-service-live.mjs` + `scripts/lib/firefox-bidi.mjs` | role-match |
| `scripts/verify-orca-service-live.mjs` (mod: P63-09 PTY survivors) | check (live) | event-driven | itself | exact (coordinator) |
| `scripts/verify-platform.sh` (mod: rows) | registry | n/a | quick Orca block 3828-3883, full block 6435-6466 | exact |
| `inventory/brand-tokens.json` (mod: re-measure `orca`/`orcad` rows) | config | n/a | row at 1053-1070 (`expected_count`, `expected_files`, reason text) | exact (coordinator only) |

## Pattern Assignments

### `orca-overlay/seams.json` (config)

**Analog:** its own single row, `orca-overlay/seams.json:2-9`:
```json
{
  "path": "src/main/orcad/orcad-browser-provider.ts",
  "upstream_blob": "90b79e505d8db41a8cf61cb45dd41f36658a6966",
  "patch": "patches/010-installed-electron-switch.patch",
  "reason": "RUN-04, D-10: no installed Orca desktop is launched ... (P62-14)"
}
```
Add two rows with exactly the keys `ROW_KEYS = ['patch', 'path', 'reason', 'upstream_blob']` (`verify-orca-overlay.mjs:53`). Blobs: S2 `bb10cf6a3fef69bae68477f41aecca1184597c27` (`src/main/orcad/orcad-daemon-supervision.ts`), S3 `baa546bc13fb8f3d218231a5b6ed315666314dbb` (`src/main/providers/local-pty/local-pty-runtime-spawn.ts`). Reason text cites TERM-01 and P63-02/A2. The cap is `[orca] seam_cap` in `configuration.toml` (self-test plant `cap-key-absent`, line ~401); 3 of 10.

### `orca-overlay/patches/020-*.patch`, `030-*.patch` (patch)

**Analog:** `orca-overlay/patches/010-installed-electron-switch.patch` (env-switched early return, 3 added lines):
```diff
@@ -73,6 +73,9 @@ export function installedElectronCandidates(
+  if (environment.ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER === '1') {
+    return []
+  }
```
Produce with `scripts/regenerate-patches.sh --upstream orca --patches orca-overlay/patches` from an edited `orca/` tree; never typed. Bound is `SEAM_LINE_BOUND = 20` (`verify-orca-overlay.mjs:52`). Deviation (A2, finding 4): S3 does NOT read `process.env`; it calls `pbTheiaPtyRuntimeSpawn()`, which asks module state that S2's `installPbTheiaPtyBridge()` filled. Exact post-images are in 63-RESEARCH "Seam S2"/"Seam S3".

### `orca-overlay/files/src/main/providers/local-pty/pb-theia-pty-bridge.ts` (client + `IPty` facade)

**Analog:** none for the facade. Mandatory rule from `scripts/verify-orca-overlay.mjs:57`:
```js
const MARKER = /pb-overlay:([A-Za-z0-9._/-]+)/g;
```
The file must contain the literal `pb-overlay:src/main/providers/local-pty/pb-theia-pty-bridge.ts` in reachable code (a string constant that the bundler keeps, e.g. used in a log line), else `orca-overlay-built` (`--built`, registry 6456) goes red `not compiled by build:web or build:orcad`. Path must not shadow an upstream path (plant `file-shadows-upstream-path`). Content per RESEARCH A2/A4: capture-and-delete `ORCA_PB_THEIA_PTY_ENDPOINT` (shape of `token-gate/src/node/powerbrowser-env.ts:66-72`, below), 13 `IPty` members + `destroy`, `ptsName`, `processNameIsSpawnFile: true`, queue events until first listener.

### `orca-overlay/files/.../pb-theia-pty-protocol.ts` and `theia/extensions/orca-terminals/src/common/orca-pty-protocol.ts`

**Analog:** `theia/extensions/tab-uris/src/browser/tab-store-access-protocol.ts` (lines 1-5: "imports nothing browser-only, so the backend imports it too"). Export one frozen array of message names plus a version constant in each copy, with identical literals, so `verify-orca-pty-contract.mjs` can extract both by regex/parse and compare as sets. The overlay copy carries its own `pb-overlay:` marker.

### `theia/extensions/orca-terminals/package.json`, `tsconfig.json`

**Analog:** `theia/extensions/tab-uris/package.json` (lines 1-37) and `theia/extensions/token-gate/tsconfig.json` (copy whole).
```json
{
  "private": true,
  "name": "@powerbrowser/tab-uris",
  "version": "0.1.0",
  "license": "MIT",
  "dependencies": { "@powerbrowser/token-gate": "0.1.0", "@theia/core": "1.76.0", "@theia/terminal": "1.76.0", ... },
  "theiaExtensions": [
    { "frontend": "lib/browser/tab-store-access-frontend-module",
      "backend": "lib/node/tab-store-access-backend-module" }
  ],
  "files": ["lib", "src"],
  "scripts": { "clean": "rm -rf lib *.tsbuildinfo", "build": "tsc -b" }
}
```
Deps for orca-terminals: `@theia/core`, `@theia/process`, `@theia/terminal` (all `1.76.0`, pinned exactly), `@powerbrowser/tab-uris` and `@powerbrowser/token-gate` (`0.1.0`, for `terminalIdentityOptions` and `POWERBROWSER_ENV`). Wiring: `theia/applications/browser/package.json` gets one line beside line 45 per package; `theia/package.json:69` `build:extensions` gets `&& yarn --cwd extensions/orca-terminals build` (and `orca-agents`) appended after `tab-uris` (dependency order). Workspaces glob `extensions/*` (theia/package.json:3-6) already includes them. Audited install per docs/BUILD.md; yarn.lock changes.

### `theia/extensions/orca-terminals/src/node/orca-pty-bridge-core.ts` (plain Node, no DI)

**Env receipt analog:** `theia/extensions/token-gate/src/node/powerbrowser-env.ts:66-72, 133` — do NOT add a second capture loop; import the captured map:
```ts
const captured: { [key: string]: string | undefined } = {};
for (const key of Object.keys(process.env)) {
    if (key.startsWith('POWERBROWSER_')) {
        captured[key] = process.env[key];
        delete process.env[key];
    }
}
export const POWERBROWSER_ENV: Readonly<{ [key: string]: string | undefined }> = captured;
```
Read `POWERBROWSER_ENV['POWERBROWSER_ORCA_PTY_DIR']` in the DI wrapper and pass it to the core as a constructor argument, so the core stays hostable by checks with a scratch dir. Inert when unset, the same way `parent-watchdog-backend-contribution.ts:24-35` returns when `POWERBROWSER_SUPERVISED !== '1'`.

Files: dir mode 0700, socket and `endpoint.json` 0600 (RESEARCH P63-03); token is 32 random bytes from `node:crypto`. No log line contains the token (RUN-07 floor, P62-13 rule).

### `theia/extensions/orca-terminals/src/node/orca-terminal-process.ts`

**Analog (reference, node_modules, not tracked; do not edit):** `theia/node_modules/@theia/process/lib/node/task-terminal-process.js` and its factory binding at `@theia/process/lib/node/process-backend-module.js:36-49` (child-container factory). Copy the binding shape into `orca-terminals-backend-module.ts`; subclass in this extension only (hard rule 1). Expose protected node-pty `terminal` for `pause/resume/ptsName` and tap `terminal.onData` (A9).

### `theia/extensions/orca-terminals/src/node/orca-terminals-backend-module.ts`

**Analog:** `theia/extensions/tab-uris/src/node/tab-store-access-backend-module.ts:7-24` (RPC + contribution) and `token-gate/src/node/token-gate-backend-module.ts` (contribution only):
```ts
import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common';
import { BackendApplicationContribution } from '@theia/core/lib/node';
...
export default new ContainerModule(bind => {
    bind(TabStoreRelayHub).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<TabStoreRelayClient>(TAB_STORE_RELAY_PATH, client => { ... }));
    bind(TabStoreAccessEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TabStoreAccessEndpoint);
});
```
The JSON-RPC client callback is the backend-to-frontend "open tab `o<n>` for process id" notification; the identity map lives in the backend singleton (P63-06 survives reload). `onStop` kills the bridge's PTYs (ProcessManager already does on stop; P63-09).

### `theia/extensions/orca-terminals/src/browser/*` (frontend: opener, context key, keybindings)

**Identity analog:** `tab-uris/src/browser/terminal-naming-contribution.ts:15, 25-27`:
```ts
export const TERMINAL_NAME_PATTERN = /^t(\d+)$/;
export function terminalIdentityOptions(name: string): TerminalWidgetOptions & Pick<TerminalWidgetFactoryOptions, 'created'> {
    return { created: name, id: name, title: name };
}
```
Reuse `terminalIdentityOptions('o<n>')` unchanged, spread `kind: 'orca'` (A9). Leave `TERMINAL_NAME_PATTERN` untouched; export a sibling `ORCA_TERMINAL_NAME_PATTERN = /^o(\d+)$/` from orca-terminals (tab-uris must import it from there or define it locally; keep one definition). Open without focus via `terminalContribution.open(widget, { mode: 'open' ... })` as in `terminal-open-handler.ts:73-75`, then `widget.start(processId)`.

**Keybinding analog:** `chrome-bar/src/browser/chrome-bar-keybindings.ts:85-91`:
```ts
for (const keybinding of ['f6', 'shift+f6', 'ctrlcmd+up', 'ctrlcmd+down', 'alt+up', 'alt+down']) {
    keybindings.registerKeybinding({
        command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
        keybinding,
        when: ADDRESS_FOCUSED_CONTEXT_KEY,
    });
}
```
Keys: `ctrl+w ctrl+t ctrl+tab ctrl+shift+tab ctrl+pageup ctrl+pagedown` (literal `ctrl`, never `ctrlcmd`); `when: 'terminalFocus && powerbrowser.orcaTerminalActive'` (A6). Export the key array and the `when` string as constants so `verify-orca-terminal-keys.mjs` reads them.

**Global context key analog:** `chrome-bar/src/browser/chrome-bar-shortcuts.ts:269`:
```ts
this.pageFocused = this.contextKeys.createKey<boolean>(PAGE_FOCUS_CONTEXT_KEY, false);
```
Set from `ApplicationShell.onDidChangeActiveWidget` (id matches `/^o\d+$/`). Do not create a scoped context on the widget node (A6).

### `theia/extensions/tab-uris/src/browser/terminal-open-handler.ts` (mod)

**Analog:** itself, lines 52-71:
```ts
let widget = name ? this.terminalContribution.getById(name) : this.terminalContribution.currentTerminal;
if (!widget) {
    // D-48: a stale name ... creates a fresh shell under that name
    widget = await this.terminalContribution.newTerminal(name ? terminalIdentityOptions(name) : {});
    widget.start();
}
```
Insert before `newTerminal`: when `name` matches `/^o\d+$/` and no widget exists, log and return without creating (P63-06). Keep the D-48 comment block; add one comment line naming P63-06. Return type: the method currently returns `Promise<TerminalWidget>`; the exemption needs `undefined` handling or a thrown error the opener service tolerates; pick and state it in the plan. `TabUriRegistry` shape unchanged (`scripts/verify-registry-shape.mjs`).

### `theia/extensions/orca-agents/*` (preference default + wrapper)

**Preference analog (partial):** `theia/extensions/telemetry/src/browser/telemetry-preferences.ts:19-57` (`PreferenceSchema` with `default`, `PreferenceContribution`). Deviation: the setting `claudeCode.claudeProcessWrapper` is owned by the VS Code extension's schema; whether a Theia `PreferenceContribution` default overrides a plugin-contributed default is RESEARCH Open Question 2. Never write user/workspace settings files.

**Wrapper analog (partial):** `scripts/lib/orca-run.mjs:175` (`startOrcad`, child spawn with inherited env) and `:255` (`stopOrcad`, grace then kill). Per A7: spawn `claude` with `stdio: 'inherit'`, forward SIGINT/SIGTERM/SIGHUP, await exit, run `<dataRoot>/cli/bin/orca terminal close`, `process.exit(code)`. Data root read from `<pty-bridge dir>/orcad-data-root`. Node built-ins only.

### `powerbrowser/shell/OrcaEnv.sys.mjs` (mod)

**Analog:** itself, lines 14-26:
```js
/** The switch the overlay seam in orcad's browser provider reads (lane p62-01, RUN-04). Value "1". */
export const ORCAD_HIDDEN_ELECTRON_SWITCH = "ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER";
export const ORCAD_FIXED_ENV_NAMES = Object.freeze([
  "ORCA_USER_DATA", ..., ORCAD_HIDDEN_ELECTRON_SWITCH,
]);
```
Add `ORCAD_PTY_ENDPOINT_SWITCH = "ORCA_PB_THEIA_PTY_ENDPOINT"` the same way and append it to `ORCAD_FIXED_ENV_NAMES` (this changes `expectedEnvNames` at 260-263, so `orca-service-live`'s environ comparison follows automatically). Set its value in `buildOrcadEnv` (86-115). Add `ptyBridgeDirFor(dataRoot, getEnv)` modelled on `aliasPathFor` (185-198): same `$XDG_RUNTIME_DIR` → `$HOME/.cache` order, same `underTmp` refusal, suffix `pb-orca-<12 hex>-pty` or a `pty-bridge/` child of the alias base; keep it pure (no `ChromeUtils`/`Services`). Also export the names `PTY_BRIDGE_ENDPOINT_FILE = "endpoint.json"` and `ORCAD_DATA_ROOT_FILE = "orcad-data-root"` so checks and services read one constant.

### `powerbrowser/shell/TheiaService.sys.mjs` (mod)

**Analog:** itself, lines 866-873 (`POWERBROWSER_PROFILE_DIR` with its "a path, not a credential" comment):
```js
// SQL-04 ...: the profile directory ... A path, not a credential, so environ visibility is irrelevant; the backend
// captures and deletes it at module load with every other POWERBROWSER_* key ...
POWERBROWSER_PROFILE_DIR: PowerBrowserAPI.getProfileDir(),
```
Add `POWERBROWSER_ORCA_PTY_DIR` the same way with a P63-03 comment. Importing `OrcaEnv` into TheiaService needs the same `ChromeUtils.importESModule("chrome://powerbrowser/content/OrcaEnv.sys.mjs")` line OrcaService uses. The directory path must equal what OrcaService computes; derive both from `OrcaEnv.ptyBridgeDirFor`. Re-run `shell-error-copy-no-internals` (surface derived from TheiaService).

### `powerbrowser/shell/OrcaService.sys.mjs` (mod)

**Analog:** itself. Directory creation, lines 108-113:
```js
try {
  await PowerBrowserAPI.ensureDirectory(this._dataRoot);
} catch (err) {
  return this._fail("creating the Orca data folder", [["Orca error", messageOf(err)]]);
}
```
State write, lines 409-420 (`PowerBrowserAPI.writeStateFile(...)` in try, `_pushLog` on failure): use the same call shape for `<bridge dir>/orcad-data-root` (if `writeStateFile` writes JSON only, add a sibling boundary method with an INTERNAL-APIS.md row; check before planning). P63-09: the reap and `stop()` must treat `ready.daemonPid === null` (line 405) as normal; `this._daemonTicks` is already guarded with a ternary at 406.

### `docs/URI-SCHEMES.md` (mod)

**Analog:** `## terminal:` section lines 144-170. Add a paragraph: `o<n>` names are minted by the Orca bridge, never by the user path; a stale `terminal:o<n>` opens nothing (exception to D-48's "creates a fresh shell").

### `scripts/verify-orca-pty-contract.mjs` (check, quick, derive-compare)

**Analog:** `scripts/verify-orca-overlay.mjs` (458 lines). Copy:
- Header tier comment (lines 30-36) and constants block (46-50): `REPO_ROOT`, `NAME`, `SELF_REL`.
- SKIP line when `orca/` absent (line 202 style): `` `${NAME}: SKIP -- orca/ is not a fetched git checkout ... (bash scripts/fetch-orca.sh)` ``; plus a second named SKIP when `theia/node_modules/typescript` is absent (A8).
- Self-test (305-435): control green first, then a `plants` table of `{ name, naming, apply }` against `mkdtemp` fixtures, each must go red and its text must include `naming`; re-run base after each plant to prove cleanup:
```js
if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; } else if (!text.includes(p.naming)) {
    console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++;
} else { console.log(`  ok ${p.name} -> red, naming '${p.naming}'`); }
```
- Entry-point guard and arg parse (443-457), exporting `check()` for reuse.
Plants (P63-17 + A8): added required member, stale override (non-empty override set), facade missing `resize`, message on one side only, zero members parsed ("source moved").

### `scripts/verify-orca-terminal-keys.mjs` (check, quick)

**Analog:** `scripts/verify-orca-service.mjs` (static derivation from PB source + `orca/`, self-test at 552, SKIP of pinned-source clauses at 514). Derive the D-09 set from `PAGE_KEYS` rows in `powerbrowser/shell/powerbrowser.js:433-449` and the passthrough constants exported by orca-terminals; compare as sets. Plants: missing key, wrong `when`, `ctrlcmd` spelling, extra key, changed `t<n>` binding.

### `scripts/verify-orca-agent-hooks.mjs` (hermetic full + quick self-test)

**Analog:** `scripts/verify-orca-hidden-electron.mjs` (built orcad run with a scratch HOME, detector proven first) using `scripts/lib/orca-run.mjs`: `ensurePbNode` (45), `orcaVersionFromPins` (68), `startOrcad` (175), `descendants` (201), `stopOrcad` (255), `redact` (147). Detector-first rule: the transport name must be proven present in orcad's own `/proc/<pid>/environ` before asserting its absence in the PTY's (CLAUDE.md verification rule 1).

### Live rows (`verify-orca-pty-provider-live.mjs`, `verify-orca-terminal-keys-live.mjs`, agent-status live; mod `verify-orca-service-live.mjs`)

**Analog:** `scripts/verify-orca-service-live.mjs` (pure verdict functions with a fixture `--self-test`, usage line 51 `flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/...`) and `scripts/lib/firefox-bidi.mjs` (`FIREFOX_BIN` line 44) for BiDi DOM reads and key dispatch. Each prints one named SKIP when no built `orca/` or no built PowerBrowser. Keep verdicts pure and exported so a quick `-self-test` row exists (registry 3880-3883 pattern).

### `scripts/verify-platform.sh` (registry)

**Quick block analog** (3876-3883):
```sh
    # NEW (62-02, RUN-03/RUN-04/RUN-05, P62-01..P62-19): orca-service, ... Quick. Derived at
    ...
    "orca-service|node $REPO_ROOT/scripts/verify-orca-service.mjs"
    "orca-service-self-test|node $REPO_ROOT/scripts/verify-orca-service.mjs --self-test"
```
**Full block analog** (6457-6466): `# NEW (62-02, ...)` comment naming tier, flock, SKIP behaviour, then `"name|node $REPO_ROOT/scripts/....mjs"`. Each lane appends its own `# NEW (63-0N, REQ, P63-xx)` block after line 3883 (quick) or 6466 (full); the coordinator resolves textual conflicts. Rows: `orca-pty-contract(-self-test)`, `orca-terminal-keys(-self-test)`, `orca-agent-hooks-self-test` (quick), `orca-agent-hooks`, `orca-pty-provider-live`, `orca-terminal-keys-live`, `orca-agent-status-live` (full); `orca-remote-terminals-live` only under A5 option (b).

### `inventory/brand-tokens.json` (coordinator only)

**Analog:** row at lines 1053-1070 (`token: "orca"`, `case_form`, `class: "coincidental"`, `expected_count`, `expected_files`) and the reason sentence at line ~1050 ending "Phase 62 (plan 62-03) re-measured this row ... adding <files>". Append a "Phase 63 (plan 63-05) re-measured ..." sentence; counts measured by `node scripts/scan-brand-residue.mjs` on the staged tree, never estimated. Lanes stage new files before scanning and record reports only.

## Shared Patterns

### Env handshake, no secret in environ
**Source:** `TheiaService.sys.mjs:820-836` (comment "NO SECRET GOES IN HERE") + `token-gate/src/node/powerbrowser-env.ts:66-72`. **Apply to:** TheiaService, OrcaEnv, bridge core, overlay bridge (`ORCA_PB_THEIA_PTY_ENDPOINT` captured and deleted at module load). Paths only; the token lives in a 0600 file.

### Overlay marker and regeneration
**Source:** `scripts/verify-orca-overlay.mjs:52-57`. **Apply to:** every `orca-overlay/files/**` source and both patches.

### Check shape
**Source:** `scripts/verify-orca-overlay.mjs:30-57, 305-457`. **Apply to:** every new `verify-orca-*.mjs`: named SKIP when inputs absent, derive at check time, set compare, `--self-test` with plant table, exported `check()`, `Next step:` line on usage error.

### Live-run discipline
**Source:** `verify-platform.sh:6457-6463` comment + `verify-orca-service-live.mjs:51`. **Apply to:** all live rows: flock lock, `-purgecaches`, detector proof before absence.

### Logging, no user copy
**Source:** `OrcaService` `_pushLog`/`_fail(..., [[label, value]])` (lines 104-112). **Apply to:** bridge failures (P63-18); no `USER_MESSAGE`, no `powerbrowserShowError`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `orca-overlay/files/.../pb-theia-pty-bridge.ts` (facade part) | adapter | streaming | No node-pty-compatible object exists in the tree; use RESEARCH A2/A4 and the facade member table |
| `theia/extensions/orca-agents/bin/claude-wrapper.mjs` | CLI wrapper | process lifecycle | No exec-wrapper exists; `orca-run.mjs` only covers spawn/stop |
| Preference default for `claudeCode.claudeProcessWrapper` | config | n/a | Overriding a plugin-owned default is unproven (RESEARCH Open Question 2) |

## Metadata

**Analog search scope:** `theia/extensions/*/src`, `theia/package.json`, `theia/applications/browser/package.json`, `orca-overlay/`, `powerbrowser/shell/Orca*.sys.mjs`, `TheiaService.sys.mjs`, `scripts/verify-orca-*.mjs`, `scripts/lib/`, `scripts/verify-platform.sh`, `inventory/brand-tokens.json`, `docs/URI-SCHEMES.md`
**Files scanned:** ~30
**Pattern extraction date:** 2026-11-09
