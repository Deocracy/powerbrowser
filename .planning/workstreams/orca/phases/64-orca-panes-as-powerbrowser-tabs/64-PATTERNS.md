# Phase 64: Orca panes as PowerBrowser tabs - Pattern Map

**Mapped:** 2026-11-10
**Files analyzed:** 38 new or modified (across lanes 64-01..64-04 and coordinator 64-05)
**Analogs found:** 36 / 38 (two partial: the pane bundle's observation snapshot and the derived html clause have no in-tree analog; their sources are the research probe and 64-RESEARCH A3)

Analog paths below are git-tracked in this worktree or readable with `git show` from the named branch. Line numbers are from this worktree at planning time; files merged by 63-04 (orca-agents, the 63-06 OrcaEnv and OrcaService changes) are named by role and read after that merge. Facts about Orca's renderer, the measured mounts, the CLI gap and the CSS measurements are in 64-RESEARCH.md and are not repeated here; this file only says what to copy from where. The shared contracts C1-C12 are in every plan's interfaces block.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx` (new, 64-01) | Orca-side entry (bundle API) | event-driven (store subscription), request-response (RPC) | `.planning/spikes/004-orca-pane-hosting/p64-probe/pb-probe-mount.tsx` + spike `pb-pane-mount.tsx` | exact (productise) |
| `orca-overlay/files/vite.pb-panes.config.ts` (new, 64-01) | build config | batch | `p64-probe/vite.pb-probe-esm.config.ts` | exact |
| `orca-overlay/files/pb-css-scope.mjs` (new, 64-01) | build transform | transform | `p64-probe/pb-css-scope.mjs` | exact (A3 rules) |
| `scripts/build-orca-panes.sh` (new, 64-01) | build script | batch | `p64-probe/build-probe.sh`, `scripts/build-orca.sh` | exact |
| `scripts/build-orca.sh` (mod, 64-01) | build script | batch | itself, `run_step` at :192-193 | exact |
| `docs/BUILD.md` (mod, 64-01) | doc | n/a | its "## Orca half" / "### Overlay (orca-overlay/)" | exact |
| `scripts/lib/orca-pane-harness.mjs` (new, 64-01) | live harness | event-driven | spike `measure.mjs`, `page-routes.mjs`, `p64-probe/probe-64.mjs`; `scripts/lib/orca-run.mjs` | exact |
| `scripts/verify-orca-pane-entry.mjs` (new, 64-01) | check (full + quick self-test) | derive-compare | `scripts/verify-orca-overlay.mjs`, `p64-probe/build-probe.sh` clauses | exact |
| `scripts/verify-orca-pane-standalone-live.mjs` (new, 64-01) | check (live) | event-driven | `p64-probe/probe-64.mjs` mounts; spike `page-routes.mjs` mount measure | role-match |
| `scripts/verify-orca-pane-css.mjs` (new, 64-01) | check (full + quick self-test) | derive-compare | `scripts/verify-orca-overlay.mjs` (shape); `p64-probe/css-variant.sh` | role-match |
| `scripts/verify-orca-pane-css-live.mjs` (new, 64-01) | check (live) | event-driven | spike `page-routes.mjs` CSS measure (:440-640) | exact, with A9 fixes and the derived html clause (partial: new) |
| `theia/extensions/orca-panes/package.json`, `tsconfig.json` (new, 64-02) | package config | n/a | `theia/extensions/tab-uris/package.json`, `tsconfig.json`; orca-agents' (merged by 63-04) | exact |
| `theia/extensions/orca-panes/src/common/orca-panes-protocol.ts` (new, 64-02) | contract | n/a | `theia/extensions/chrome-bar/src/browser/chrome-bar-suggestion-service.ts` (path + interface) | role-match |
| `theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts` (new, 64-02) | backend (route + RPC) | request-response, file I/O | `theia/extensions/chrome-bar/src/node/chrome-bar-backend-module.ts`; token-gate `configure(app)` rule | exact (RPC), role-match (route) |
| `theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts` (new, 64-02) | DI wiring + opener, commands, key rows | n/a | `theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts`; `view-open-handler.ts`; p63-02 `orca-terminal-keys.ts` | exact |
| `theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts` (new, 64-02) | loader | event-driven | research Pattern 1 (Theia side); spike README lane-build line | partial (module-script load is new) |
| `theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx` (new, 64-02) | widget | event-driven | `theia/extensions/branding/src/browser/powerbrowser-welcome-widget.tsx`; Theia `terminal-widget-impl.js:158-159` (scoped key) | role-match |
| `theia/extensions/orca-panes/src/browser/orca-pane-routes.ts` (new, 64-02) | data + pure planner | transform | `theia/extensions/tab-uris/src/browser/view-factory-table.ts` (table as data) | role-match |
| `theia/extensions/orca-panes/src/browser/orca-pane-observer.ts` (new, 64-02) | service | event-driven | spike `pb-pane-mount.tsx` `subscribeTabs`; `page-routes.mjs` observe measure | role-match |
| `theia/extensions/tab-uris/src/browser/orca-scheme-coverage.ts` (new, 64-02) | pure helper | transform | `existing-scheme-coverage.ts:32` `extensionDetailUriOf`, `:49` `webviewUriOf` | exact |
| `theia/extensions/tab-uris/src/browser/tab-uri-registry.ts` (mod, 64-02) | registry | request-response | itself, `uriOf` :124-170 (the webview branch) | exact |
| `docs/URI-SCHEMES.md` (mod, 64-02) | doc | n/a | its `## \`terminal:\`` section (:144) | exact |
| `scripts/verify-orca-pane-routes.mjs` (new, 64-02) | check (quick) | derive-compare | p63-02 `scripts/verify-orca-terminal-keys.mjs` (TypeScript parse, mkdtemp plants) | exact |
| `theia/extensions/modes/src/browser/mode-descriptors.ts` (mod, 64-03) | data | n/a | the `browsing` descriptor (:30-35) | exact |
| `theia/extensions/modes/src/browser/mode-service.ts` (mod, 64-03) | data | n/a | `SHIPPED_MODE_RULES` rows (:112-116) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` (mod, 64-03) | widget | event-driven | itself: `MODES` :394, `ideDress` :2083, `publishDragRegions` :2259 | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar.css` (mod, 64-03) | style | n/a | itself :1189 | exact |
| `scripts/verify-mode-toggle-commands.mjs` (mod, 64-03) | check | derive-compare | itself (derivations, cases :395-460) | exact |
| `powerbrowser/shell/OrcaEnv.sys.mjs` (mod, 64-03) | utility (pure) | transform | itself: `createOutputSink` :205-258, `parseReadyLine` :138; 63-06's `ORCAD_DATA_ROOT_FILE` | exact |
| `powerbrowser/shell/OrcaService.sys.mjs` (mod, 64-03) | service | event-driven | 63-06's orcad-data-root write after ready and its removal in `_stopTree` | exact |
| `scripts/verify-orca-service.mjs` (mod, 64-03) | check | derive-compare | 63-06's scenario A writePrivateFile record and scenario H | exact |
| `scripts/lib/orca-tabs-live.mjs` (new, 64-04) | live harness | event-driven | `scripts/lib/pb-live-probe.mjs` `withProbeShell`; p63-05 `withOrcaSession` | exact |
| `scripts/verify-orca-terminal-keys.mjs` (new, 64-04) | check (quick) | derive-compare | `git show refs/heads/ServerDestroyer/p63-02:scripts/verify-orca-terminal-keys.mjs` | exact (port, minus bridge clauses) |
| `scripts/verify-orca-terminal-keys-live.mjs` (new, 64-04) | check (live) | event-driven | `git show refs/heads/ServerDestroyer/p63-05:scripts/verify-orca-terminal-keys-live.mjs` | exact (port, minus runTabStage) |
| `scripts/verify-orca-tabs-live.mjs` (new, 64-04) | check (live) | event-driven | p63-05 keys-live structure; `p64-probe/probe-64.mjs` CLI trials | role-match |
| `scripts/verify-uri-roundtrip.mjs` (mod, 64-04) | check (live) | request-response | itself: `--scheme` :150, `PRELUDE` :155, `main` :362-401 | exact |
| `scripts/verify-mode-switch-tabs-live.mjs` (mod, 64-04) | check (live) | event-driven | itself: seed :457-480 | exact |
| `scripts/verify-platform.sh` (mod, 64-01, 64-02, 64-04, 64-05) | registry | n/a | the `# NEW (63-0N, …)` blocks after `orca-service-live-self-test` and `orca-service-live` | exact |
| `theia/package.json`, `theia/applications/browser/package.json`, `inventory/brand-tokens.json`, tracking files (mod, 64-05) | config / tracking | n/a | 63-04 Task 1 step (5) and Task 3 | exact (coordinator only) |

## Pattern Assignments

### `pb-pane-mount.tsx` (Orca-side entry)

**Analog:** `.planning/spikes/004-orca-pane-hosting/p64-probe/pb-probe-mount.tsx` (350 lines, measured in research) and the spike's `pb-pane-mount.tsx` (271 lines).

Copy: `bootstrap` (device key first, then `parseWebPairingInput` → `createStoredWebRuntimeEnvironment` → `saveStoredWebRuntimeEnvironment({ ...environment, sessionOnly: true })` → `installWebPreloadApi`, research Pattern 3), the `Providers` set (the four the spike needed, including `LinkRoutingPreferenceDialogProvider`), `KindBody` per content type, `mountKind`'s error capture:

```tsx
// p64-probe/pb-probe-mount.tsx:219-236
const root = ReactDOMClient.createRoot(element, {
  onCaughtError: record('caught'), onUncaughtError: record('uncaught'), onRecoverableError: record('recoverable')
})
```

Deviate: no `newTerminal` through the client store (A4; the probe's `hostCreateTerminal` at :340 is the shape `createTerminal` keeps); `closePane` without `force` or `skipRunningProcessConfirm` (P64-11); `subscribePanes` emits the C3 `OrcaPaneRecord` list, one record per terminal leaf with `makePaneKey` (`orca/src/shared/stable-pane-id.ts:20`) and `isolatedPaneKey` passed to `TerminalPane` (`terminal-pane-types.ts:15-16`); `ActiveWorkspaceSyncGate` in the hidden services root (A8). Carry the marker literal `pb-overlay:src/renderer/src/pb/pb-pane-mount.tsx` inside `PB_OVERLAY_BUILD`.

### `vite.pb-panes.config.ts` and `pb-css-scope.mjs`

**Analog:** `p64-probe/vite.pb-probe-esm.config.ts` (53 lines) and `p64-probe/pb-css-scope.mjs` (136 lines).

The host-React plugin (copy as is, key `powerbrowser.orca-panes.react`, research Pattern 1):

```ts
// vite.pb-probe-esm.config.ts:18-38
resolveId(id) { return Object.prototype.hasOwnProperty.call(MODULES, id) ? PREFIX + id : null },
load(id) { ... `const host = globalThis[Symbol.for(${JSON.stringify(KEY)})];` ... names.map((n) => `export const ${n} = m[${JSON.stringify(n)}];`) }
```

Add: a marker plugin serving a virtual module that exports `PB_OVERLAY_BUILD` from this file's own marker constant and the pass's imported `PB_OVERLAY_MARKER` (a file spelling another overlay file's marker is red in `verify-orca-overlay.mjs:195-197`); `base: './'`; `cssCodeSplit: false`; output `pb-panes.js` and `pb-panes.css` in `out/web/assets/pb-panes`; `PB_PANES_STANDALONE=1` drops the host-React plugin for the standalone variant. The pass keeps A3's rules (research Pattern 2) and renames keyframes; no unlayer step.

### `scripts/build-orca-panes.sh` and the `build-orca.sh` step

**Analog:** `p64-probe/build-probe.sh` (54 lines): `tracked()` before and after, the scrub of `ORCA_*` and the Node variables, the `eval "$(node … appendBuildOldSpaceOption … withRolldownThreadLimit …)"` environment, `step` logging, the marker and data-URL counts. `build-orca.sh`: add one `run_step panes bash "$REPO_ROOT/scripts/build-orca-panes.sh"` after step 8 (:192-193) and a `--panes-only` path that reuses `run_step fetch-verify` and `run_step overlay apply_overlay` (:130). Last line `build-orca-panes: PASS -- …` / `FAIL -- …`, the voice of `build-orca: PASS`.

### Live harnesses (`orca-pane-harness.mjs`, `orca-tabs-live.mjs`)

**Analogs:** `p64-probe/probe-64.mjs:15-40` (imports of `orca-run.mjs` and `pb-live-probe.mjs`, scrub, scratch profile with an alias under `~/.cache`, throwaway repo), `scripts/lib/orca-run.mjs` (`startOrcad` :175, `stopOrcad` :255, `installOutputRedaction` :157), `scripts/lib/pb-live-probe.mjs` (`withProbeShell` :51, `pressKey` :243, `openWebTab` :177), `scripts/lib/firefox-bidi.mjs` (`PB_FIREFOX_BIN`/`PB_BACKEND_MAIN` :39-44, `send()` :196 for BiDi network interception).

Rule copied from every Orca live script: install output redaction before the first write; delete inherited `ORCA_*` from `process.env`; signal only recorded identities.

### Check scripts (all new `verify-orca-pane-*`, `verify-orca-tabs-live`, the ports)

**Analog:** `scripts/verify-orca-overlay.mjs` (header voice :1-36; derive-at-check-time list; mkdtemp self-test with each plant red naming its drift; entry guard :443-446; unknown argument exits 2) and p63-02's `verify-orca-terminal-keys.mjs` (TypeScript parse through `theia/node_modules/typescript`, named SKIP when it is absent, `PLANTS` with `naming` strings, "plant did not apply" detection). Live checks: p63-05's `verify-orca-terminal-keys-live.mjs` (pure verdict functions exported, `importSilenceVerdict` with a child Node, stage lines).

Cross-lane SKIP rule (from 63-06's orca-service clause): SKIP a clause only while the other lane's file or directory is absent; present but missing the read item is red.

### `orca-panes-backend-module.ts`

**Analog (RPC):** `theia/extensions/chrome-bar/src/node/chrome-bar-backend-module.ts`:

```ts
bind(ConnectionHandler).toDynamicValue(ctx =>
    new JsonRpcConnectionHandler<ChromeBarSuggestionService>(CHROME_SUGGESTION_PATH, () =>
        ctx.container.get(ChromeBarSuggestionServiceImpl)));
```

**Route:** a `BackendApplicationContribution.configure(app)`; token-gate front-inserts its check in `initialize()` (`token-gate-backend-contribution.ts:80-90`, "Gated for free: this route is registered in configure()"). Environment: `POWERBROWSER_ENV` from `@powerbrowser/token-gate/lib/node/powerbrowser-env` (:133), the way orca-agents reads `POWERBROWSER_ORCA_BRIDGE_DIR` after 63-04. Private-file checks mirror 63-06's interfaces block (0700 folder owned by the user; refuse group or other bits).

### `orca-panes-frontend-module.ts` (opener, commands, key rows)

**Analogs:** `tab-uris-frontend-module.ts:44-45` (`bind(X).toSelf().inSingletonScope(); bind(OpenHandler).toService(X)`, static at module load, D-50), `view-open-handler.ts:49` (`canHandle` returns 1000 on scheme alone, comment on `Prioritizeable.isValid`), p63-02's `orca-terminal-keys.ts`:

```ts
for (const keybinding of ORCA_TERMINAL_PASSTHROUGH_KEYS) {
    keybindings.registerKeybinding({ command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND, keybinding, when: ORCA_TERMINAL_KEYS_WHEN });
}
```

Deviate from p63-02: the when clause is the scoped key `powerbrowser.orcaTerminalFocus` alone (no `terminalFocus`, no active-widget key); the constants live in `src/common/orca-panes-protocol.ts` (C10).

### `orca-pane-widget.tsx`

**Analogs:** `powerbrowser-welcome-widget.tsx:38` (`extends ReactWidget`, `@postConstruct init`, `render()` :114); Theia's terminal widget for the scoped key:

```js
// theia/node_modules/@theia/terminal/lib/browser/terminal-widget-impl.js:158-159
const localContext = this.contextKeyService.createScoped(this.node);
localContext.createKey('terminalFocus', true);
```

Deviate: `onCloseRequest` asks Orca's close and does not dispose (P64-11); the pane's own React root mounts on first show into a child host element; `this.node` carries `data-pb-orca-pane` (C4).

### `orca-scheme-coverage.ts` and the `uriOf` branch

**Analog:** `existing-scheme-coverage.ts:49-55`:

```ts
export function webviewUriOf(factoryId: string, options: unknown): URI | undefined {
    if (factoryId !== WebviewWidget.FACTORY_ID) { return undefined; }
    const { id, viewId } = (options as Partial<WebviewWidgetIdentifier> | undefined) ?? {};
    return id ? new URI(`webview:${viewId ?? ''}/${id}`) : undefined;
}
```

and its call site in `tab-uri-registry.ts` (`const webviewUri = webviewUriOf(factoryId, description.options); if (webviewUri) { return webviewUri; }`). One import, one branch; no export added (`verify-registry-shape.mjs` compares exports and public members only).

### Mode descriptor, rules row, chrome-bar dress

**Analogs:** the `browsing` descriptor (`mode-descriptors.ts:30-35`), its `SHIPPED_MODE_RULES` row (`mode-service.ts:114`), `MODES` (`chrome-bar-widget.tsx:394`), `ideDress` (:2083) with the rule comment (:2070-2082), the coding branch of `publishDragRegions` (:2259), `body[data-pb-mode="coding"] #theia-top-panel` (`chrome-bar.css:1189`). Toggle-check self-test anchors to refresh: `'= [coding, browsing, organising];'` and `"static readonly MODES = ['Coding', 'Browsing', 'Organising'];"` (`verify-mode-toggle-commands.mjs` cases near :409 and :442), built from the parsed clean sources instead.

### `OrcaEnv` / `OrcaService` hand-off files

**Analog:** 63-06's orcad-data-root path, as merged by 63-04: `PowerBrowserProcesses.writePrivateFile(this._bridgeDir, OrcaEnv.ORCAD_DATA_ROOT_FILE, root + "\n")` after the ready line, a failure being one log line; removal in `_stopTree` with `PowerBrowserAPI.removeStateFile(OrcaEnv.bridgeFileFor(...))`; a diagnostics row with a path or "not available". `OrcaEnv.createOutputSink` (:205-258) keeps stdout in memory until `parseReadyLine` parses; the offer callback reads the same buffer before it is dropped; `parseReadyLine` (:138) stays at three fields. The offer field is `pairing.webClientUrl` when `pairing.available` (`scripts/lib/orca-run.mjs:131-145`).

### `verify-uri-roundtrip.mjs` and `verify-mode-switch-tabs-live.mjs` extensions

**Analogs:** the terminal rows of `verify-uri-roundtrip.mjs` (`main` :390-400, DI by name through `PRELUDE` :155, the `__makeUri` shim) and the welcome seed of `verify-mode-switch-tabs-live.mjs` (:457-480: seed after the pre-walk snapshots, require it in the main area, non-vacuity). The Orca seeds use the same placement and are covered by the existing set-equality assertions.

## Shared Patterns

- **One registry, one row plus `-self-test`:** lanes append `# NEW (64-0N, …)` blocks after the Phase 63 rows at the two Orca anchors; 64-03 adds none.
- **Derive and compare, never a hand-kept list:** content types from `tab-types.ts`, keys from `PAGE_KEYS`, export names from the entry, dress sets from three chrome-bar sites and the rules table, html writes from the session itself.
- **Absence after a proven detector:** the CSS controls, the throwing child, the html clause's probe sheet, Orca's tab-bar selectors found first in Orca's own web client, the offer found first in its own file.
- **Secrets:** the offer only in a 0600 file and over JSON-RPC; redaction installed first in every live script; `sessionOnly` in the bundle.
- **Lane hygiene:** explicit-path commits; lane diff ⊆ `files_modified`; brand report copied, inventory untouched; `BLOCKER:` stops the coordinator, `OWNER-ITEM:` is carried to tracking.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `pb-pane-mount.tsx` `subscribePanes` neighbour derivation | Orca layout to Lumino placement | No prior code maps Orca's `TabGroupLayoutNode` and `TerminalPaneLayoutNode` to Lumino modes; build it from `orca/src/shared/terminal-tab-types.ts` and the tab-group layout types |
| `verify-orca-pane-css-live.mjs` derived html clause | CSSOM reader check | New with the Open Question 4 ruling (64-RESEARCH A3); the probe-sheet control is its detector |
