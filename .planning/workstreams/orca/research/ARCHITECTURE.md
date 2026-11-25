# Architecture Research: v1.7 Orca integration

**Domain:** a second token-less loopback sidecar (orcad) and its web client hosted inside the existing Gecko shell + Theia sidecar architecture
**Researched:** 2026-11-04
**Overall confidence:** MEDIUM (PB side is read from source and HIGH; Orca side is read from the 3052dd79 clone, version 1.4.214, and the installed 1.4.245 build; Gecko behaviors marked "verify" were not run)

Scope: integration of the v1.7 features into the architecture that exists today. Paths are relative to the repo root unless prefixed `orca:`, which is `/home/chris/coding/orca-eval/src/`.

---

## Verdicts (answers first)

1. **orcad launcher:** a new sibling module `powerbrowser/shell/OrcaService.sys.mjs`, a consumer of `PowerBrowserAPI.sys.mjs` only, started lazily (first use of the Orca mode or `pb-orca:`), plus a small PB-owned Node supervisor script (`powerbrowser/orca/orca-supervisor.mjs`) that sits between chrome and orcad. Do not refactor `TheiaService.sys.mjs`; copy its orchestration pattern and reuse the same `PowerBrowserAPI` primitives. The supervisor supplies what orcad lacks and what Gecko `Subprocess` cannot do: a parent-death watchdog, a scrubbed environment, a pairing-line filter, and a cross-platform graceful stop.
2. **Pairing URL:** never give any PB component a URL that contains the pairing. Open the Orca tab on the clean URL `http://127.0.0.1:<pinned-port>/web-index.html`. A `PowerBrowserOrca` JSWindowActor pair delivers the offer into the page after the document is created. The offer lives in chrome memory only, and the ready line is parsed in a dedicated handler that bypasses `_pushLog` and `PowerBrowserAPI.log`.
3. **`pb-orca:`:** an alias address carried by a normal web tab. Add one optional field `address` to `WebTabOptions` and change one expression inside `TabUriRegistry.uriOf`. No export, no public member is added, so `scripts/verify-registry-shape.mjs` stays green. A new open handler for the `pb-orca` scheme resolves the alias to the current orcad origin and calls `WebTabOpenHandler`.
4. **Orca tab:** the whole Orca web client in one PB web tab, one tab per orcad (singleton). Per-view tabs are not buildable without an Orca change: the web bundle has exactly one entry page, and the persisted workspace session in localStorage is shared by every page on the origin. Reserve `pb-orca:<view>/<id>` path space; build nothing.
5. **JSWindowActor:** `PowerBrowserOrca`, registered from inside `registerGroupActor` through a new end-of-file function in `PowerBrowserAPI.sys.mjs`, child class appended to `GroupActorChild.sys.mjs`, one new row (two if `windowUtils` is used for the sheet) in `powerbrowser/INTERNAL-APIS.md`.
6. **Gecko browser provider:** orcad cannot load a provider from outside. `resolveOrcadBrowserProvider` is a closed function (`orca:main/orcad/orcad-browser-provider.ts:166-262`) and orcad ships as one minified bundle with a sha256 manifest (`orcad-template/orcad-server.js`, 12 MB). A provider needs an upstream Orca change. The upstream-friendly shape is a generic "external bridge" provider that forwards `RuntimeBrowserCommands` calls as JSON over a socket the host names. PB implements the other end: shim, then stdio pipes to chrome, then an automation actor in the target tab. Do not use a BiDi/Remote Agent socket in production: it has no authentication and exposes the Theia frame and every tab.

---

## Existing architecture the milestone attaches to

```
Gecko shell (chrome, parent process)                         Content processes
 ┌────────────────────────────────────────────────────┐      ┌──────────────────────────┐
 │ powerbrowser.js  ── starts ──> TheiaService.sys.mjs │      │ Theia frontend (shell    │
 │                                  │ spawn/ready/     │      │   <browser>, 127.0.0.1:T)│
 │                                  │ health/reap      │      │ web-tab overlays         │
 │ PowerBrowserAPI.sys.mjs  (ONLY file that touches    │◄────►│   (<browser> per web tab)│
 │   Services/Cc/Ci/actors; rows in INTERNAL-APIS.md)  │actors│ PowerBrowserGroup child  │
 │ GroupActorChild.sys.mjs  (actor children)           │      │   (matches 127.0.0.1)    │
 └───────┬────────────────────────────────────────────┘      └──────────────────────────┘
         │ Subprocess (stdin token line, stdout ready line)
         ▼
 Theia backend (Node, 127.0.0.1:T, token gate, parent watchdog on stdin EOF)
```

Facts that constrain the design:

| Fact | Source |
|------|--------|
| Chrome spawns Theia with `environmentAppend: true`, so the child inherits the browser's whole environment; the only tool is overriding keys, including to an empty string | `powerbrowser/shell/PowerBrowserAPI.sys.mjs:576-584`, `powerbrowser/shell/TheiaService.sys.mjs:838-887` |
| Secrets go over the stdin pipe, never `environment`; the pipe stays open because the child's watchdog reads EOF as parent death | `TheiaService.sys.mjs:820-828`, `:919-945`; `PowerBrowserAPI.sys.mjs:589-607` |
| Every stdout/stderr line from the sidecar is copied to the diagnostics ring buffer and to the browser's stdout; the buffer redacts only `this._token` | `TheiaService.sys.mjs:1503-1504`, `:1633-1651` |
| Teardown is `onQuitGranted` (synchronous, fire-and-forget kill bounded by `killGraceMs`), plus an async reap blocker, plus a state file `{pid, port, startTicks}` reaped on the next launch | `TheiaService.sys.mjs:257-274`, `:389-460`, `:476-496`, `:709` |
| The Theia token cookie is stripped from every `127.0.0.1` request that is not to the Theia port, and from overlay (web-tab) requests even on that port. An orcad on another loopback port never receives it. | `PowerBrowserAPI.sys.mjs:6274-6316` |
| Web tabs are a main-area placeholder widget plus a chrome-owned `<browser>` overlay; the widget is not `ExtractableWidget` and a web tab id from a previous session is refused at restore | `theia/extensions/tab-uris/src/browser/web-tab.ts:1-37`, `tab-uris-frontend-module.ts:112` |
| `TabUriRegistry` exports are frozen by `verify-registry-shape.mjs`: exports of `tab-uri-registry.ts` and `view-factory-table.ts`, and the public members `getViewContribution, parseName, createWidgetOptions, uriOf` | `scripts/verify-registry-shape.mjs:60-83` |
| A mode switch never unmounts main-area tabs; main-area layout is stripped from saved perspective layouts | `theia/extensions/modes/src/browser/main-area-exemption.ts:14-16` |
| Setups and Panorama identify tabs through `TabUriRegistry.uriOf` and restore through the opener | `modes/src/browser/setups-service.ts:917`, `group-model.ts:124` |
| The Group actor child already attaches to any loopback page, including a page in a web-tab overlay; the parent refuses non-Theia senders | `PowerBrowserAPI.sys.mjs:254`, `:317-329` |

---

## New and modified components

### New

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `OrcaService` | `powerbrowser/shell/OrcaService.sys.mjs` (+ `jar.mn` line beside `jar.mn:29`) | Chrome-side supervisor of the Orca supervisor process: resolve fetched Orca dir, spawn, parse ready line, hold the pairing offer in memory, health, restart policy, reap, quit hooks, diagnostics rows. Imports `PowerBrowserAPI` only (D-96). |
| `orca-supervisor.mjs` | `powerbrowser/orca/orca-supervisor.mjs` (shipped with PB, run by PB's staged Node) | Spawns orcad with orcad's own Node runtime and a scrubbed env; watchdog on its own stdin EOF; redacts and re-emits the ready line; performs graceful stop; runs `repo add`; later relays browser-bridge traffic. Plain Node, no Firefox internals, so it is outside the boundary script. |
| Pinned Orca fetch | `scripts/fetch-orca.sh` (+ `orca/pin.json`: version, per-OS URL, sha256) | Same role as `scripts/fetch-upstream.sh`. Extracts the orcad template (`orcad.js`, `orcad-server.js`, `daemon-entry.js`, `node-runtime`, `out/cli`, `ripgrep`, web client root). Verifies against `orcad-template.json` `commonSha256` plus the pin. Nothing in `orca/` is edited. |
| `@powerbrowser/orca` (frontend) | `theia/extensions/orca/` | `PbOrcaOpenHandler` (scheme `pb-orca`), Orca mode content (reveal-or-open of the Orca tab), Add-project command and dialog, status/error copy. |
| `PowerBrowserOrca` actor pair | parent in `PowerBrowserAPI.sys.mjs` (end of file); child in `GroupActorChild.sys.mjs` | Seeds the Orca client page (settings, stylesheet, pairing) and later hosts automation. |
| Orca browser bridge (phase 2) | `OrcaService` + supervisor + actor | Executes `RuntimeBrowserCommands` against Orca-created PB tabs. |
| `docs/URI-SCHEMES.md` section, checks | `scripts/verify-orca-*.mjs`, rows in `scripts/verify-platform.sh` | One row per check, each with `--self-test` that plants a fault (CLAUDE.md "Verification"). |

### Modified

| Component | Change | Size |
|-----------|--------|------|
| `theia/extensions/tab-uris/src/browser/web-tab.ts` | `WebTabOptions.address?: string` (`:160-180`); `WebTabWidget.address` readonly; `WebTabOpenHandler.openUrl(url, rowKey?, address?)` and `createWidget` pass it through (`:1711-1735`). | ~10 lines |
| `theia/extensions/tab-uris/src/browser/tab-uri-registry.ts` | Line `:173` becomes `new URI((widget as WebTabWidget).address ?? (widget as WebTabWidget).url)`. No new member, no new export. | 1 line |
| `docs/URI-SCHEMES.md` | New `pb-orca:` section; the "no discriminator in the address" rule is satisfied because the port is resolved at open time. | docs |
| `theia/extensions/modes/src/browser/mode-descriptors.ts` | Append `orca` descriptor to `SHIPPED_MODES` (`:49-50` says append, never reorder). `onActivate` reveals/opens the Orca tab, modeled on `organising` (`:45`). | ~15 lines |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | End-of-file section: `registerOrcaActor`, `PowerBrowserOrcaParent`, a clean-env spawn method, a loopback-origin sender wall for the Orca page; call `registerOrcaActor()` from `registerGroupActor` (`:2251-2283`). Regenerate catalogue lines with `scripts/verify-ng-040-internals-catalogue-lines.mjs --fix`. | ~150 lines |
| `powerbrowser/shell/GroupActorChild.sys.mjs` | Append `PowerBrowserOrcaChild` (the file already holds the EditState child at `:149`). | ~60 lines |
| `powerbrowser/INTERNAL-APIS.md` | Append rows (see actor section). Append-only rule at `:30-33`. | rows |
| `scripts/check-internals-boundary.sh` | Add `loadSheetUsingURIString` to the forbidden list only if the sheet route is chosen. | 1 line |
| `powerbrowser/shell/powerbrowser-sidecar.js` | New prefs: `powerbrowser.orca.dir`, `.port`, `.startupTimeoutMs`, `.killGraceMs`, `.enabled`. | prefs |
| `powerbrowser/shell/powerbrowser.js` (`:362-377` area) | Import `OrcaService` lazily; no startup call. | few lines |
| `inventory/brand-tokens.json` and the brand scan | "Orca" tokens classified; the scan walks `git ls-files` only, so stage new files first (CLAUDE.md). | data |

### Explicitly not modified

`TheiaService.sys.mjs`, `view-factory-table.ts`, Theia core, `upstream/`, anything under `patches/` (no new patch is needed for any item in this document; if the bridge phase finds one it must be a regenerated patch).

---

## Question 1: orcad launcher

### Where it lives

`OrcaService.sys.mjs` beside `TheiaService.sys.mjs`. It is a singleton object like `TheiaService` (`TheiaService.sys.mjs:91`), but not a subclass or a refactor. Reasons:

- The start-path-recovery check derives the quit-observer registration structurally from `TheiaService` (`:253-259`); touching that file risks forty-odd existing checks.
- Orca is optional. `TheiaService.start` runs for every launch; `OrcaService.start` runs on demand.
- Failure of orcad must never reach the Theia loading/error layer (`_showError`). It surfaces as a status row and a message in the Orca tab area only.

### Reuse map (TheiaService pattern to Orca equivalent)

| Concern | TheiaService | OrcaService |
|---------|--------------|-------------|
| Resolve runtime | `_resolveSidecar` staged node + backend main (`:536-600`) | Staged Node runs the supervisor. Supervisor runs orcad with **orcad's own** runtime from the fetch (`node-runtime`), because orcad's node-pty and other natives are built for that ABI and `orcad-template.json` pins them per target. |
| Spawn | `PowerBrowserAPI.spawnProcess` (`:891`) | Same call, command = staged Node, args = `[supervisor, --orca-dir, <dir>, --user-data, <dir>/powerbrowser-orca, --port, <pinned>]`. |
| Env scrub | explicit empty-string overrides for a few keys (`:865`) | Not workable for Orca: the inherited ORCA_* set is open-ended (`ORCA_TERMINAL_HANDLE`, `ORCA_PANE_KEY`, `ORCA_WORKTREE_ID`, `ORCA_AGENT_SESSION_ID`, `ORCA_USER_DATA_PATH`, and dozens more, per grep of `orca:main/orcad`, `orca:shared`, `orca:cli`). The supervisor builds orcad's env from an allowlist (see below). `spawnProcess` forces `environmentAppend: true`, so the supervisor itself is spawned with one explicit clearing of the few ORCA_* keys it could misread and nothing else. |
| Credential handshake | token on stdin (`:928`) | PB has no credential for orcad to receive. The reverse direction is the secret: the pairing offer. It goes supervisor to chrome on stdout through a filtered handler (Question 2). |
| Ready parse | `POWERBROWSER_BACKEND_READY {port,pid}` (`:1507-1519`) | orcad `--json` prints one line, `{"type":"orca_server_ready", boundEndpoint, advertisedEndpoint, pairing{...}, health{pid,...}}` (`orca:main/server/serve-readiness.ts:11-33`). The supervisor reads it, drops `pairing`, and emits `POWERBROWSER_ORCA_READY {"port":N,"pid":N,"endpoint":"ws://127.0.0.1:N","health":{...}}`. |
| Loopback assertion | n/a | The supervisor refuses to emit READY unless `boundEndpoint` starts with `ws://127.0.0.1:`; chrome checks it again. This is the one build assertion the hosting reference asks for (`orca-client-hosting.md` step 2). Bind is passed explicitly: `--bind 127.0.0.1`. Do not go through `orca serve` (hardcodes `0.0.0.0`). |
| Health | `HEALTH_PATH` probe (`:18`, `:1029-1045`) | orcad ready JSON carries `health`; for steady state the supervisor sends a periodic `pb_ping` line to chrome only if orcad's process is alive. Do not probe orcad over HTTP from chrome: the supervisor already knows whether the process is alive, and chrome gains nothing from a second signal. |
| Port | pinned after first spawn (D-104) because the loaded page's origin must hold | Same, for a stronger reason: the web client stores its pairing and device key per origin (IndexedDB `orca-web-device-keys`, `orca:renderer/src/web/web-device-key-store.ts:22-23`; localStorage keys `orca.web.*`, `.../preload-api/web-storage.ts:1-11`). A new port is a new origin and forces a new pairing. Persist the chosen port in `powerbrowser.orca.port`; first run passes `--port 0`, later runs pass the pref. If the pinned port is taken orcad falls back (`--port` help text, `orca:main/orcad/orcad-command-arguments.ts`): treat as "origin moved", re-pair, log a diagnostics row. |
| Restart / give up | `_restart` with backoff (`:1181`) | Same shape, smaller budget; never `_showError` on the Theia surface. |
| State file + reap | `sidecar-state-<key>.json` (`:709`) | `orca-state-<key>.json` with `{pid(supervisor), orcadPid, port, startTicks}`; `_reapLeftover` equivalent verifies identity with `readProcessStartTicks` / `signalBarePid` before signalling. |
| Quit | `onQuitGranted(() => stop())` + `addSidecarReapBlocker` (`:258`, `:270`) | Same two registrations from `OrcaService`, added only after the first start. |
| Log buffer | `_pushLog` redacts `this._token` | Redaction by line class (below), not by value. |

### orcad environment (allowlist, built in the supervisor)

Copy through: `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_*`, `TMPDIR`, `XDG_RUNTIME_DIR`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `DBUS_SESSION_BUS_ADDRESS` (keyring), `SSH_AUTH_SOCK` (agents running git over ssh), and on Windows the `SystemRoot`/`ComSpec`/`USERPROFILE`/`APPDATA`/`LOCALAPPDATA` group. Set: `ORCA_USER_DATA=<profile>/powerbrowser-orca` (orcad reads `ORCA_USER_DATA`, `orca:main/orcad/orcad-app-paths.ts:15`, then sets `ORCA_USER_DATA_PATH` itself, `orcad-entry.ts:46`; the hosting reference's `ORCA_USER_DATA_PATH` is the output, not the input), `ORCA_VERSION=<pin>`, `ORCA_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`. Telemetry opt-out is a recommendation, not an owner decision: `orca:shared/telemetry-event-registry.ts` shows `repo_added` and other events exist. Nothing else, so a PB launched from an Orca terminal cannot hand its parent's `ORCA_TERMINAL_HANDLE` to the new runtime.

Why the supervisor and not `Subprocess` env control: Gecko `Subprocess` with `environmentAppend: false` would also work for a direct spawn, but a direct spawn still lacks a watchdog, a graceful stop on Windows, and a place to filter stdout before it reaches `readPipeChunk`. The supervisor is about 150 lines and removes four separate problems.

### Teardown, including the terminal daemon

What orcad does: on SIGINT/SIGTERM it runs shutdown (`orca:main/orcad/orcad-lifecycle.ts:81-82`) and only **disconnects** from the terminal daemon (`orcad-daemon-supervision.ts:56-58`, "Disconnect only: shutdown would kill the daemon and its surviving PTYs"). The daemon is detached by design and keeps agent sessions alive across orcad restarts; the next orcad adopts it (`initDaemonPtyProvider`). Idle retirement exists only as an explicit option on a managed-stop request (`retireIdleDaemon`, `orca:shared/orcad-stop-request.ts:35-37`; `orcad-daemon-retirement.ts`).

orcad has no parent watchdog (no stdin or ppid monitoring in `orcad-lifecycle.ts` or `orcad-entry.ts`).

Recommended policy:

| Event | Action |
|-------|--------|
| Normal quit | `OrcaService.stop()` writes `stop\n` to the supervisor's stdin (fire-and-forget, same constraint as `TheiaService.stop`, which runs in a granted observer and cannot await). The supervisor writes orcad's plain stop file `.orcad-stop-request` into orcad's slot directory (graceful and cross-platform, `orca:main/orcad/orcad-stop-request-listener.ts:1-50`) and falls back to SIGTERM. `stopAndReap` waits on the supervisor handle with the existing `waitForExit` and `killGraceMs`. |
| PB crash | Supervisor sees stdin EOF, requests the same graceful stop, exits. Covers Windows, where Gecko's `proc.kill` is a hard termination that would skip orcad's shutdown and leave a stale instance lock (`orca:main/orcad/orcad-instance-lock.ts`). |
| Daemon | Leave it running by default. Agent sessions survive a PB restart and are re-adopted. This is also Orca's own behavior with the desktop app. **Product decision needed:** whether PB quits with live agents silently. If not, the policy is a pre-quit check, not a teardown: ask orcad for live session count (the `health` block and `countLiveOrcadDaemonSessions` exist, `orcad-daemon-retirement.ts:20-26`) at `quit-application-requested`, where a prompt is still possible, and offer "stop agents". The granted-quit observer cannot prompt. |
| "Stop Orca agents" action (optional) | Supervisor runs `orcad --complete-managed-stop` with `retireIdleDaemon: true` (`orcad-managed-stop-command.ts`). A busy daemon stays up and keeps terminals; report the verdict (`retired`/`live`/`unverifiable`) to the user. |
| Leftover from a crashed launch | `_reapLeftover` equivalent. If the lock is stale orcad offers `--reclaim-stale-lock --yes` (`orcad-command-arguments.ts`, usage text); the supervisor invokes it before spawning when the state file names a dead pid. |

Never SIGKILL the daemon from PB.

### Lazy start and the Orca profile

`OrcaService.ensureStarted()` is idempotent and called by `PbOrcaOpenHandler`, the Orca mode `onActivate`, and the Add-project command. Concurrent callers share one promise. The profile directory `<ProfD>/powerbrowser-orca` is created `0700` (orcad refuses a data root that is not private, `orca:main/orcad/orcad-data-root-privacy.ts:43-88`), and must never be the user's real Orca directory (locked by a running desktop app, hosting reference "What to Avoid").

---

## Question 2: keeping the pairing URL out of history, session restore and logs

The offer is a reusable bearer credential for the whole runtime: `createPairingOffer` reuses the pending device unless `rotate` is set (`orca:main/runtime/runtime-rpc/runtime-rpc-pairing.ts:179-202`), and the offer carries `deviceToken`, `publicKeyB64`, endpoint (`:212-221`). The web client itself removes the fragment after import ("Why: pairing payloads include the runtime auth token", `orca:renderer/src/web/web-pairing.ts` `clearPairingInputFromAddressBar`), which proves Orca treats it as a secret, but the removal happens after PB has already stored the URL.

### Where a URL passed to `WebTabOpenHandler.openUrl` ends up today

| Sink | Evidence |
|------|----------|
| Theia widget description options, persisted in the shell layout file in the profile | `web-tab.ts:160-166` (`WebTabOptions.url`), `ProfileStorageService` |
| Chrome message `webTabOpen {url}` then `fixupAndLoadURIString` | `web-tab.ts:943`, `PowerBrowserAPI.sys.mjs:4125` |
| Tab store row `url` column (`tabs.sqlite`) | `docs/URI-SCHEMES.md` http section, `docs/TAB-STORE.md` |
| Places global history (fragment URLs are distinct pages) | Gecko behavior, verify |
| SessionStore entries and the persisted web-tab history file | `PowerBrowserAPI.loadWebTabHistories` call at `TheiaService.sys.mjs:349`, NG-034 |
| Address field, suggestions, `uriOf` consumers (Setups, Panorama) | `tab-uri-registry.ts:166-174` returns the live URL |
| Sidecar stdout copy and ring buffer | `TheiaService.sys.mjs:1503-1504` pattern, if Orca output goes through the same pump |

Opening the spike's URL (`.../web-index.html#pairing=...`) therefore writes the secret to six persistent places. Do not do that.

### Design

1. **No URL carries the offer.** The tab opens `http://127.0.0.1:<port>/web-index.html`.
2. **Line classification at the source.** The supervisor consumes orcad's stdout. Rules: parse the `orca_server_ready` line, remove the `pairing` object (the same operation as Orca's own `redactReadyJson`, `orca:cli/runtime/serve-pairing-redaction.ts:32-43`), and also drop lines starting `Pairing URL: `, `Web client URL: ` and the `Mobile pairing QR:` block (`serve-pairing-redaction.ts:12-31`; human-mode output prints them, `orca:main/server/serve-readiness.ts:114-119`). Pass `--json` so human-mode lines are not produced at all; keep the filter as the second layer. Everything else is forwarded unchanged, so chrome may log every line it receives. The secret never exists on the pipe that chrome logs.
3. **Out-of-band hand-off.** The supervisor answers one request, `pairing\n` on its stdin, with one line `POWERBROWSER_ORCA_PAIRING <webClientUrl>`. `OrcaService` has a single handler for that sentinel that stores the string in a private closure variable and calls neither `_pushLog` nor `PowerBrowserAPI.log`. `getState()`, `getFailureDetails()` and `getRecentLog()` never include it. A check (below) greps the sources for the variable's use.
4. **Delivery into the page by the actor** (next section): parent holds the string, child asks once, the child writes the fragment into the document before the client reads its location, the client removes it. The secret exists in chrome memory, one IPC message, and one document for a few milliseconds.
5. **Pair once.** With the port pinned, the client keeps its pairing in its own origin storage, and later launches take Orca's `use-stored-environment` path (`web-pairing.ts` `decideWebPairingStartup`). The offer is requested only when the stored environment is missing. This shrinks the race and the number of devices in orcad's registry.
6. **Backstops.** After the child reports that the page cleared the fragment, chrome calls the existing Places removal for the exact fragment URL if the visit exists (`removeHistoryEntry`, `PowerBrowserAPI.sys.mjs:6335`, takes an http URL) and requests a SessionStore flush. This is defense in depth, not the design.
7. **Process visibility.** orcad's argv holds only `--bind --port --json --web-client-root`; its environment holds only paths and flags. Nothing secret enters `/proc/<pid>/cmdline` or `environ`, consistent with `TheiaService.sys.mjs:820-828`.

### Verification (new static checks)

- `verify-orca-pairing-containment.mjs`: derive from the tree every call that receives the pairing string and compare as set equality with the allowed set `{actor reply}`. `--self-test` plants a `_pushLog(pairing)` and a `openUrl(pairingUrl)` and requires red.
- Live: drive PB headless, open the Orca tab, then grep the profile (`places.sqlite`, `sessionstore-backups/*`, `tabs.sqlite`, shell-state file, the ring buffer, the browser stdout capture) for `deviceToken` and `%22deviceToken` and the `orca://pair` prefix. Requires zero hits. Absence assertions are only valid if the emitter under test is not our instrumentation (CLAUDE.md "Verification" rule 1): plant a known token via the supervisor's test hook and require the grep to find it in the supervisor's own raw capture, then to find it nowhere in chrome.

### Open item that needs a probe

The ordering between the child's asynchronous `sendQuery` and the client's first read of `location` (module script after `initWebDeviceKeySupport()`, `orca:renderer/src/web/main.tsx:105-111`). If the probe shows the client can win, fallbacks in order: (a) child blocks nothing but, on a late reply, performs the same-document hash change and dispatches the event the client listens to, if any; (b) parent publishes a short-lived one-shot ticket (not the offer) through `Services.ppmm.sharedData` so the child can learn "pairing needed" synchronously, and fetches the secret async; (c) a boundary method that loads the fragment URL with history bypass flags, with the Places and session backstops from step 6. (b) and (c) each add a catalogue row. Confidence on the whole delivery path: MEDIUM.

---

## Question 3: `pb-orca:` and the registry's asserted shape

What `verify-registry-shape.mjs` asserts (`:60-83`): the exported names of `tab-uri-registry.ts` (`TabUriRegistry`) and `view-factory-table.ts` (four names), and the public member set of the class. It reads source text and does not look inside method bodies. Adding a branch to `uriOf` or a field to `WebTabOptions` (in `web-tab.ts`, which the script does not read) is invisible to it. This is also the design intent: `GUI-04` requires the shape to stay stable for `@powerbrowser/browser-bridge`.

### Mapping

| Direction | Mechanism |
|-----------|-----------|
| `pb-orca:` to tab | `PbOrcaOpenHandler implements OpenHandler`, `canHandle(uri)` returns 1100 for scheme `pb-orca` (priority above `WebTabOpenHandler` at 1000, `web-tab.ts:1703-1705`). `open()` calls `OrcaService.ensureStarted()` through the chrome channel, finds an existing widget by `WidgetManager.getWidgets(WEB_TAB_FACTORY_ID)` filtered on `address === 'pb-orca:'`, activates it, else calls `WebTabOpenHandler.openUrl('http://127.0.0.1:<port>/web-index.html', undefined, 'pb-orca:')`. Registration follows the static-binding rule (D-50), same as `tab-uris-frontend-module.ts:44-48`. |
| Tab to `pb-orca:` | `uriOf` returns `new URI(widget.address ?? widget.url)` in the existing `WEB_TAB_FACTORY_ID` branch (`tab-uri-registry.ts:166-174`). Orca tab: `pb-orca:`. Every other web tab: unchanged. |
| Parse | `pb-orca:` with an empty path means "the Orca client". The path space `pb-orca:<name>` is reserved for views; the handler refuses unknown names with a copy string rather than guessing (same stance as `ViewUriOpenHandler`). Canonical form `scheme:path` per `docs/URI-SCHEMES.md` general rules. The port is not in the address (general rule 4) because it is resolved at open time. |
| Row key | Unchanged: `tabKeyOf` returns `widget.rowKey` for any `WebTabWidget` (`group-model.ts:122-125`). Panorama and the tab store hold the page URL as a column, so a Panorama reopen of an Orca card opens the old `http://127.0.0.1:<port>/...`. With the port pinned this is correct; the handler should also claim any `http:` URL whose origin equals the Orca origin (priority above 1000) so a reopen goes through `ensureStarted`. |
| Setups | A Setup that contains an Orca tab stores `pb-orca:` (via `uriOf`, `setups-service.ts:917`) and restores through the opener, which reaches `PbOrcaOpenHandler`. This is the reason the alias is needed: without it Setups would store a port that changes. |

Alternatives rejected: (a) a separate widget factory `powerbrowser.orca-tab` needs a new `uriOf` branch and an import from `tab-uris` into the new extension (cycle) and duplicates the whole web-tab lifecycle; (b) overriding `WebTabWidget.url` to return `pb-orca:` breaks the chrome bar, which reads `url` as the real page address (`WebTabState.url`, `web-tab.ts:182-186`).

Add `scripts/verify-orca-scheme.mjs`: derive the set of schemes any `OpenHandler.canHandle` claims and compare to the documented list in `docs/URI-SCHEMES.md` (set equality, self-test with a planted undocumented scheme). Run `verify-registry-shape.mjs --self-test` unchanged.

### Mode semantics (flag for the owner)

The main area is shared by every mode (`main-area-exemption.ts:14-16`; content tabs never unmount on a switch). "Orca tabs work in and move between all modes" is therefore already true for any web tab: the Orca tab stays in the main area when the user switches to Coding or Browsing. The Orca mode descriptor then means "side-panel and chrome presentation for Orca, and reveal the Orca tab on activation" (`organising.onActivate` precedent, `mode-descriptors.ts:45`). A context-menu "move" action has nothing to move unless the owner intends tab membership per mode. Ask before building one. Also: the web tab is not `ExtractableWidget` (`web-tab.ts:34-37`), so the Orca tab cannot go to a secondary window, as for all web tabs.

Appending to `SHIPPED_MODES` is consumed in seven places (`mode-service.ts:150,205,534,696`; `setups-service.ts:673,946`; `modes-frontend-module.ts:40`). Check any toggle that cycles "Coding, Browsing, Organising" before adding a fourth (comment at `mode-descriptors.ts:5-6` calls the order contracted).

---

## Question 4: what an "Orca tab" is

Evidence from Orca source:

- The web build has one entry: `vite.web.config.ts` `rollupOptions.input = src/renderer/web-index.html`. `popout.html` and `space.html` exist in `src/renderer/` but belong to the Electron build only.
- The client has no router; `readPairingInputFromLocation` reads only `search` and `hash` for pairing keys.
- Session layout is persisted in localStorage `orca.web.workspaceSession.v1` and `orca.web.ui.v1` (`web-storage.ts:1-11`). Two client pages on one origin share and overwrite it.
- Split layout is React + dnd-kit inside the page, with the split tree in the app store, per INPUTS.md.

### Whole-client tab (recommended for v1.7)

- **Needs from Orca:** nothing. Stock bundle, stock URL.
- **Cost:** one singleton `pb-orca:` tab. The second request activates the existing tab.
- **Limits, to state in user docs:** Orca panes cannot be dragged into Lumino and PB tabs cannot be dragged into Orca splits. Orca's own tab strip and PB's tab strip both show. Shortcut routing: a focused overlay receives keys first; PB's key-relay model for web tabs already handles this for other pages.
- **Why singleton:** two clients on one origin race on localStorage session state; both would also attach to the same terminals.

### Per-view tabs (reserve, do not build in v1.7)

Needs from Orca, upstream, in this order:

1. A second web entry (for example `web-view.html`) built by `vite.web.config.ts`, mounting a single pane component (terminal, chat, editor, browser) chosen by hash or search parameters, following the `popout.tsx` precedent.
2. A mode in which that page does not read or write `orca.web.workspaceSession.v1` and `orca.web.ui.v1` (or namespaces them by view id).
3. Pane components that do not require the whole app shell store. `TerminalPane` and friends read `useAppStore`; the amount of shell they assume is unknown and was not measured.
4. A stable view identifier scheme (`terminal/<handle>`) and a way for PB to list views, which means an RPC or a CLI listing (`orca terminal list` exists in the CLI; its mapping to pane ids was not checked).

PB side would then be small (`pb-orca:terminal/<id>` opens the view URL, same open handler). The cost is entirely Orca-side and the result would diverge from the stock client the milestone is built to host unmodified. Revisit after the milestone ships.

### The one place Orca content becomes PB-native

Pages that Orca's agents open are separate PB tabs (browser provider, Question 6). That is the sole case where an Orca object is a first-class Lumino tab, and it comes from the browser replacement, not from tab splitting.

### Also affected: Orca's managed browser tabs inside the client

In a web client Orca hides "managed browser tabs" unless the runtime advertises `browser.screencast.v1` (`orca:renderer/src/lib/client-creation-action-policy.ts:36-44,66-72`), and the web client never hosts pages itself (`browser-client-page-renderer-installation.ts` returns null when `__ORCA_WEB_CLIENT__`; `web-browser-api.ts` stubs: "A web client never hosts pages"). Whether the stock orcad advertises screencast with no provider was not determined (`BROWSER_SCREENCAST_RUNTIME_CAPABILITY` is in the static list `orca:shared/browser-runtime-capabilities.ts:23-34`, but the unavailable-notice comment says orcad "has no browser of its own"). The Orca-mode phase must observe what the client shows in a PB tab and decide whether the injected stylesheet hides Orca's browser entry points. That decision belongs with the provider phase.

---

## Question 5: the JSWindowActor

### Registration

Follow the EditState pair exactly (`PowerBrowserAPI.sys.mjs:9919-9925`): a function `registerOrcaActor()` in a new end-of-file section, called from `registerGroupActor` after `registerEditStateActor()` (`:2282`). The comment at `:9909` and the catalogue note say the group registration is the sole registration method; keep it that way.

```js
// PowerBrowserAPI.sys.mjs, end-of-file section
const ORCA_ACTOR_NAME = "PowerBrowserOrca";
export class PowerBrowserOrcaParent extends GroupActorBase {}   // receiveMessage walled below
function registerOrcaActor() {
  ChromeUtils.registerWindowActor(ORCA_ACTOR_NAME, {
    parent: { esModuleURI: GROUP_ACTOR_PARENT_MODULE },
    child: {
      esModuleURI: GROUP_ACTOR_CHILD_MODULE,
      events: { DOMWindowCreated: {} },
    },
    matches: ["http://127.0.0.1/*"],          // any loopback port; port is gated per message
    messageManagerGroups: ["browsers"],
    allFrames: false,                          // top document of the overlay only
  });
}
```

Match patterns do not carry a port, which is why `GROUP_ACTOR_THEIA_ORIGIN` is `http://127.0.0.1` (`:254`) and the parent re-checks the port (`groupSenderIsTheia`, `:317-329`). Write the mirror function `groupSenderIsOrca(actorRef)`:

- the document URI port equals `OrcaService`'s pinned port,
- the top browsing context is embedded by a web-tab overlay (`tabIdOfBrowser(...) !== null`, the inverse of the Theia wall at `:6285-6290`),
- the path is `/web-index.html`.

Every other message returns a fixed refusal with no echo. The child does nothing on a page that fails the origin test, which the parent publishes (non-secret) through `Services.ppmm.sharedData` so the child can decide synchronously at `DOMWindowCreated`; the Theia frame and every other loopback page get a child instance that immediately returns.

### Child behavior (in `GroupActorChild.sys.mjs`, appended)

1. Synchronous gate: origin equals `sharedData` Orca origin, else return.
2. Seed settings: `win.localStorage.setItem('orca.web.settings.v1', ...)` and `'orca.web.ui.v1'` (keys at `web-storage.ts:1-3`), merging with what exists, never clobbering user changes: write only keys PB owns, and only when absent or when a PB version stamp differs. This runs before the app script because `DOMWindowCreated` precedes script execution. No `wrappedJSObject` is needed (Xray access to `localStorage`).
3. Stylesheet: two options. (a) `windowUtils.loadSheetUsingURIString("data:text/css,...", USER_SHEET)`: invisible to page DOM, not subject to the page's CSP, survives React re-renders; adds a boundary pattern and a catalogue row. (b) a `<style>` element appended to `document.head`: no new privileged API, but visible to the page and subject to DOM replacement. Choose (a). The sheet content is the logo substitution (survey decision 2) and any hiding rules, kept as a literal string in the child file or a static `resource://` file (no generator, per the CLAUDE.md phase-1 rule on literals).
4. Pairing: `sendQuery("PowerBrowserOrca:Pairing")`; the parent runs `groupSenderIsOrca`, and only then returns the string held by `OrcaService` (only when `OrcaService` marks "pairing needed", otherwise `null`). The child sets the fragment with `win.history.replaceState` before the client reads it, then reports completion with `sendAsyncMessage("PowerBrowserOrca:PairingDone")`; the parent drops the stored string and triggers the backstops (Question 2 step 6).
5. Later: the same child hosts the automation handlers for Orca-created tabs (Question 6), reached only through `getActor` on a specific window global like `webTabEditEnabled` does (`:9928-9936`), never from page events.

The child must stay as small as the EditState child: no module imports, no privileged calls beyond `windowUtils`.

### INTERNAL-APIS.md rows (append at the end of the Touchpoints table)

| Internal | File:Line | Method | Purpose | Threat notes |
|---|---|---|---|---|
| `ChromeUtils.registerWindowActor` | `PowerBrowserAPI.sys.mjs:<n>` | `registerOrcaActor` | Registers the PowerBrowserOrca pair (parent in this file, child in `GroupActorChild.sys.mjs`), called only from `registerGroupActor`. Seeds the Orca client page. | Registration crosses the privilege boundary. `matches` is loopback-wide; the child decides on a published origin and the parent walls by port, overlay embedder and path. Page script cannot send it messages (no content-visible events). |
| `windowUtils.loadSheetUsingURIString` | `GroupActorChild.sys.mjs:<n>` | `PowerBrowserOrcaChild` | Loads one fixed user sheet into the Orca page. | Fixed string; no page-controlled input. |
| `Services.ppmm.sharedData` | `PowerBrowserAPI.sys.mjs:<n>` | `publishOrcaOrigin` | Publishes the non-secret Orca origin to content processes. | Origin only; the offer never goes here. |

Regenerate line numbers with `scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` and run `scripts/check-internals-boundary.sh --catalogue` and `--self-test`. Rows with a `file:line` cited only in prose do not count (`INTERNAL-APIS.md:25-29`).

The sender-wall check `scripts/verify-web-tab-bridge.mjs` classifies `webTab*` arms. The Add-project request and any `orca*` request kind are new privileged kinds (state change outside a tab's navigation, `INTERNAL-APIS.md:35-47` rule), so they run only from a widget event handler and are classified there.

---

## Question 6: how a Gecko provider for orcad reaches PB web tabs

### The seam as it exists

- Selection is a closed function. Order: installed Orca Electron (`ElectronServeBrowserProcess`), else `ORCA_BROWSER_EXECUTABLE` plus the bundled `agent-browser` native driver over CDP (`orca:main/orcad/orcad-browser-provider.ts:166-262`). `OrcadBrowserProvider.kind` is the literal union `'electron' | 'chromium'` (`:18-24`).
- The contract a provider fulfils is `RuntimeBrowserCommandsFactory = (host) => RuntimeBrowserCommands`, installed by `setRuntimeBrowserCommandsFactory` in `startOrcadBrowserProvider` with `headless: true, clientHostingWithoutEngine: true` (`orca:main/orcad/orcad-browser-startup.ts:24-48`, `runtime/runtime-browser-commands-factory.ts:11-49`). The chromium provider shows the smallest implementation: a Proxy that routes tab methods to a registry and the rest to the driver (`external-chromium-browser-process.ts:62-77`, `:94-200`).
- The command surface is large and enumerable: the page-level `browser.*` methods are 66 names (`orca:shared/browser-client-automation-protocol.ts:9-84`), plus `browserTab{Create,List,Show,Current,Switch,Close}`, profile, screencast and certificate commands.
- `orcad.js`/`orcad-server.js` are minified bundles checked by `orcad-template.json` `commonSha256`. A PB entry cannot import orcad internals and register its own factory. PB cannot supply a provider without an Orca-side change. A CDP-emulating "browser executable" given to `ORCA_BROWSER_EXECUTABLE` would work without an Orca change but means reimplementing the CDP subset `agent-browser` speaks and tracking both projects' releases; list it as a last resort.
- Orca has a second hosting model, client-hosted pages: a paired client holds a lease and executes automation commands for pages it owns (`runtime-browser-client-automation.ts`, `browser.clientHost.*` capabilities). PB could in principle be that client, but it would implement Orca's private runtime RPC with end-to-end encryption and lease semantics, with no version guarantee. Rejected for v1.7.

### Reaching PB tabs: three candidates

| Option | Path | Verdict |
|--------|------|---------|
| A. BiDi from orcad | orcad (Node) connects to the Remote Agent WebSocket and drives tabs | **Reject for production.** The Remote Agent has no authentication; any local process that finds the port controls the whole browser, including the Theia frame and all cookies. PB's own boundary exists to prevent this class of access. Fine as a spike and test harness (spike 003 used it). |
| B. PB-side bridge in chrome | provider to a socket owned by PB; PB executes commands in the target overlay | **Recommended.** Only Orca-created tabs are addressable. |
| C. Through the Theia backend | provider to a token-gated Theia route, relay to frontend, then to chrome | Rejected: three hops, couples the Theia backend to Orca, and orcad would need Theia's token. |

### Option B, concretely

```
orcad  --(1) forwarding provider-->  supervisor  --(2) stdio JSON lines-->  OrcaService (chrome)
                                                                              │ (3) actor messages
                                                                              ▼
                                                              PowerBrowserOrca child in the target overlay
```

1. **Provider to supervisor:** a Unix domain socket (named pipe on Windows) in the `0700` Orca data root, path passed by environment variable `ORCA_BROWSER_BRIDGE=<path>`. No TCP port, so no local-port exposure. The provider is an upstream contribution shaped as a generic "external bridge provider" that serializes `(method, params)` and returns the result; PB is the first client. A generic bridge is easier to land than a Firefox-specific provider and keeps Gecko code out of Orca. Required Orca changes: a new branch in `resolveOrcadBrowserProvider` selected by the env var; a forwarding class patterned on `ExternalChromiumBrowserProcess.createCommands`; `kind` union widened; capability reporting must keep `browser.screencast.v1` off for this provider (its `browserScreencast` stays unavailable, as the chromium provider does at `external-chromium-browser-process.ts:121-126`).
2. **Supervisor to chrome:** the existing child stdio pipes, which are already private to the two processes. Chrome reads with `readPipeChunk` and replies with `writeStdinLine`. Lines are bounded (cap at the 768 KiB result budget in `browser-client-automation-protocol.ts:6-7`).
3. **Chrome to page:** `OrcaService` keeps a map `browserPageId <-> web-tab id` and only addresses overlays it created for Orca (`browserTabCreate` opens a PB web tab through the existing `webTabOpen` path, via a frontend request so the tab appears in the Theia main area next to the Orca tab and gets PB chrome, history and bookmarks, which is the owner's replacement goal). Each command runs through the `PowerBrowserOrca` child of that overlay. The Edit-state actor shows the on-demand `getActor` pattern (`PowerBrowserAPI.sys.mjs:9928-9936`).

Command coverage is the content of the already planned spike (NOTE-orca-tab-parity-direction.md). The architecture should not assume BiDi covers it; each of the 66 methods maps to one of: (i) actor DOM work (snapshot with refs, click/fill/type/select/scroll/hover/eval/find/get/is), (ii) existing chrome capability (navigation, back/forward/reload, screenshot through `drawSnapshot` already used at `PowerBrowserAPI.sys.mjs:2169`, cookies, zoom, mute, find, PDF through the existing page-save path), (iii) new privileged API (synthetic mouse/keyboard events, network capture and interception, console capture, viewport emulation, geolocation, offline, headers, dialogs, downloads, clipboard, storage), or (iv) not possible in Gecko without a patch. Group (iii) each needs a boundary row; group (iv) must be declared unsupported with the exact `BrowserError` codes Orca already uses (`browser_command_unavailable`, `browser_screencast_unavailable`). Whether group (iii) can instead be satisfied by running Remote Agent's modules in-process for the single target browser, rather than hand-built, is a spike question: it would save most of the work, but those modules are internal and each import is a catalogue row.

### Where the Orca browser tools live in PB (from the direction note)

Orca's URL-bar behavior and agent controls become PB chrome-bar features, not Orca-drawn UI, which means the chrome-bar extension (`theia/extensions/chrome-bar/`) gets an "agent is controlling this tab" indicator and a stop control for tabs present in the OrcaService map. That is new frontend work in `chrome-bar` and is not in the nine items above; list it in the roadmap as part of the replacement phase.

### Timeline risk

An upstream change is on the critical path of the replacement goal. Orca releases about daily (seed research); a merged change reaches PB only when the pinned release is raised. Start the upstream conversation in the first phase, in parallel with everything else; the other v1.7 deliverables do not depend on it.

---

## Data flows

### Launch and first open

```
user opens Orca mode / pb-orca:
  PbOrcaOpenHandler ──request──> chrome (group actor channel) ──> OrcaService.ensureStarted()
  OrcaService ──spawn(node, supervisor, --orca-dir, --user-data, --port pref)──> supervisor
  supervisor ──spawn(orcad runtime, orcad-server.js, --json --bind 127.0.0.1 --port P --web-client-root R, env allowlist)──> orcad
  orcad ──stdout JSON──> supervisor  (reject unless boundEndpoint is ws://127.0.0.1:)
  supervisor ──"POWERBROWSER_ORCA_READY {port,pid,health}"──> OrcaService (logged freely)
  supervisor ──(on request "pairing")──"POWERBROWSER_ORCA_PAIRING <url>"──> OrcaService (private field, unlogged)
  OrcaService ──setOrcaOrigin(port)──> PowerBrowserAPI (sharedData + sender wall)
  frontend ──openUrl(http://127.0.0.1:P/web-index.html, address 'pb-orca:')──> webTabOpen ──> overlay
  overlay content process: DOMWindowCreated ──> PowerBrowserOrca child ──seed settings, sheet──> page
  child ──sendQuery Pairing──> parent (wall) ──> offer ──> child ──replaceState hash──> client pairs, clears hash
```

### Add project

```
Add-project command (Theia) ── FileDialogService (Theia backend FS) ── absolute path
  ── orcaAddProject {path} over the group channel (privileged kind, widget handler only) ──> chrome
  OrcaService validates (string, absolute, length-capped) ──"addProject <path>" on stdin──> supervisor
  supervisor runs the bundled CLI `repo add --path <p> --json` with ORCA_USER_DATA (CLI finds the runtime from metadata in that dir)
  ── result line ──> OrcaService ──> frontend (success / plain-language error with a next step)
```

Why through chrome and not the Theia backend: one owner of Orca lifecycle, no Orca paths in the Theia environment (which `TheiaService` builds, `:838-887`), and the backend's `POWERBROWSER_*` handling stays untouched. The stock client's behavior without an added project is "No workspaces found" (hosting reference step 5), so the UI is required. The RPC `repo.add` exists (`orca:main/runtime/rpc/methods/repo.ts:135`); using the CLI avoids re-implementing the E2EE client in the supervisor. Confirm the fetched artifact set contains `out/cli`.

### Agent opens a browser page (replacement, phase 2)

```
agent ── orca browser tab create ──> orcad ──> forwarding provider ──socket──> supervisor ──stdio──> OrcaService
OrcaService ── request frontend open (web tab, tagged agent-owned) ──> Theia main area, PB chrome
OrcaService ── browserPageId <-> tabId map; commands via PowerBrowserOrca child of that overlay
```

---

## Patterns to follow

1. **Sibling service, shared primitives.** New supervisor logic copies the TheiaService shape and calls only `PowerBrowserAPI` methods. Evidence this scales: `registerEditStateActor` and its parent class were added without touching the group actor.
2. **Append-only boundary.** New privileged code goes to the end of `PowerBrowserAPI.sys.mjs` with rows appended to `INTERNAL-APIS.md`; run `scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` after each edit (never writes a row).
3. **Derive and compare.** Every new check derives its expectation from the tree (schemes claimed by open handlers, pairing sinks, catalogue rows) and compares as set equality, with `--self-test` planting a fault per class. One registry row each in `scripts/verify-platform.sh`; no sibling driver.
4. **Fixed refusal text.** Sender-wall failures return fixed strings and never echo input, as the existing walls do.
5. **Alias, not fork.** One optional field on an existing options type generalizes "a tab whose address is not its page" and keeps Orca knowledge out of `tab-uris`.

## Anti-patterns to avoid

| Anti-pattern | Why | Instead |
|--------------|-----|---------|
| Open the spike's `#pairing=` URL in a web tab | Writes the bearer credential to layout, tab store, Places, session history | Clean URL plus actor delivery |
| `orca serve` as the launcher | Hardcodes `0.0.0.0` bind | Spawn orcad directly with `--bind 127.0.0.1`, assert `boundEndpoint` |
| Reuse the user's Orca profile | Instance lock conflict, SSH-target fallback to Electron serve | `<ProfD>/powerbrowser-orca` via `ORCA_USER_DATA` |
| Fix env by blanking known `ORCA_*` keys | The set is open-ended and changes per release | Allowlist in the supervisor |
| Edit `TheiaService.sys.mjs` to host orcad | Breaks structural start-path checks, couples failure surfaces | `OrcaService` sibling |
| BiDi socket as the production bridge | Unauthenticated whole-browser control | Chrome-owned bridge over private pipes |
| Per-mode Orca tabs | Main area is shared across modes by contract | Single main-area tab; mode only changes presentation |
| Quit-time prompt to decide about live agents | Granted quit cannot prompt | Decide at `quit-application-requested` or by setting |
| Hand-edit patches for any needed Gecko change | Silent no-op merge | Regenerate from a patched tree |

## Scalability

Single user, single machine; the relevant limits are per-launch rather than per-user.

| Concern | Now | Note |
|---------|-----|------|
| Processes | +2 (supervisor, orcad) + detached terminal daemon + per-agent processes | Lazy start keeps non-Orca users at zero |
| Memory | orcad idle budget has its own test (`orcad-idle-memory-budget.integration.test.ts`) | Measure in the spike; the Orca client page adds a normal web-tab content process |
| Devices in orcad's registry | One per pairing | Pair-once plus pinned port; re-pair only on origin change |
| Command payloads | 768 KiB result cap per command | Mirror the cap on the stdio line |

---

## Build order with dependencies

```
P0 pin+fetch ──► P1 launcher ──► P2 tab+scheme+mode ──► P3 actor ──► P5 replacement build ──► P7 integration, per-OS
        │             │                                      │
        │             └────────────► P4 add-project          │
        └────► P6a provider spike (parallel from day 1) ──► P6b upstream PR (parallel, long lead) ──┘
                        P8 credential check, brand/egress, packaging (parallel, finish before release)
```

| Phase | Content | Depends on | Notes |
|-------|---------|-----------|-------|
| P0 | `scripts/fetch-orca.sh`, `orca/pin.json`, per-OS artifacts, hash check against `orcad-template.json`, `--quick` check that the pin names an existing version and every OS has a hash; confirm which files the artifact contains (`out/cli`, web client root, `node-runtime`, `ripgrep`) | none | First, because every later phase needs a runnable orcad. Same discipline as `fetch-upstream.sh`. |
| P6a | Browser capability inventory and gap table over the 66 methods plus tab commands (BiDi/Marionette vs actor vs new API vs impossible); decide in-process Remote Agent modules vs hand-built | none | Start immediately and run alongside P0 to P4. Pure investigation, no product code. |
| P6b | Upstream Orca proposal and PR for the generic external bridge provider | P6a (needs the command list) | Longest lead time in the milestone. Open the conversation in week one. |
| P1 | `OrcaService`, supervisor, prefs, env allowlist, ready parse and loopback assertion, port pin, state file and reap, quit hooks, diagnostics rows, `--self-test` fault planting for each | P0 | Gate: PB quits and crashes leave no orcad; the daemon policy is decided and tested. |
| P2 | `address` option and one-line `uriOf` change; `PbOrcaOpenHandler`; `docs/URI-SCHEMES.md`; `orca` mode descriptor; scheme check; run registry-shape check unchanged | P1 (needs the origin) | Settle the "move between modes" semantics with the owner first; it may delete work. |
| P3 | `PowerBrowserOrca` actor pair, origin gate, settings and sheet seed, pairing delivery, catalogue rows, containment checks and the profile grep | P1, P2 | Contains the one timing probe; if it fails, take fallback (b) or (c) in the same phase. |
| P4 | Add-project UI and `orcaAddProject` request, validation, copy | P1 (P3 not required) | Can run alongside P3 once P1 lands. |
| P5 | Browser replacement: `OrcaService` bridge side, `browserPageId` map, automation handlers in the actor, agent-owned tab marking, chrome-bar indicator and stop control | P3, P6a, and P6b merged and pinned (or a local build of the Orca change for development only) | Ship P1 to P4 without waiting for this. |
| P7 | Per-OS verification (Linux first; macOS, Windows after), Windows stop path, Flatpak `--filesystem=home`, live checks (deferred to the end-of-milestone pass per the owner's standing preference) | all | The Windows graceful stop and the conpty breakaway behavior were not tested. |
| P8 | Credential-storage check on a persistent profile (orcad stores credentials unencrypted on a temp profile; persistent not yet checked, hosting reference "Constraints"), brand scan classification for "Orca" tokens, egress allowlist entry for any Orca-hosted endpoint orcad contacts, telemetry opt-out confirmation | P1 | Schedule the egress question early: it can force a PB-side network wall decision. |

Phase ordering rationale: P0 and P6a have no dependencies and unlock the others; P1 is the foundation for every item that touches the process; P2 before P3 because the actor needs a real tab to attach to and an origin to gate on; P5 last because it depends on an external merge.

## Compliance with the hard rules

| Rule | How this design complies |
|------|--------------------------|
| 1. Never fork or patch Theia core | All Theia work is a new extension plus edits to PB's own `tab-uris`/`modes` extensions. `scripts/diff-theia-core.sh` unaffected. |
| 2. Gecko only through the patch stack and the boundary | Zero new patches planned. All new Firefox API use is in `PowerBrowserAPI.sys.mjs` (and the existing actor-child file) with catalogue rows. `OrcaService` imports `PowerBrowserAPI` only. If the bridge spike finds a needed Gecko change it is a regenerated patch. |
| 3. Design for the bridge | `TabUriRegistry` exports and public members unchanged; the alias goes through `WebTabOptions`. `@powerbrowser/browser-bridge` keeps a stable surface. Orca tabs stay ordinary web tabs. |
| 4. No space in the repo path | Not affected; the Orca fetch dir is under the app dir, not the checkout. |
| 5. Theia default GUI, stock chrome reachable | Unchanged. Orca is a tab inside Theia. No custom browser chrome is authored; the agent-control indicator extends the existing chrome bar. |
| Phase-1 "no generator" rule | The injected sheet and seeds are literals. |
| Brand-residue gate | New files staged before running the scan; "Orca" classified in `inventory/brand-tokens.json` only. |
| User-facing copy | All Orca errors name "PowerBrowser", end with a next step that exists on screen, and keep ports, pids and exception text in the diagnostics rows (`OrcaService.getFailureDetails`-style). |

## Open questions and unverified items

| Item | Status |
|------|--------|
| Order of child `sendQuery` versus the client's first read of `location` | Not run; probe in P3 (MEDIUM) |
| Whether Places records a visit for `history.replaceState` and for a hash-bearing load, and whether bypass flags suppress it | Not run (LOW); only needed for fallback (c) |
| Whether PB clears site data on exit (would force re-pairing every launch and grow orcad's device list) | Not checked |
| Whether explicit `--port N` falls back or fails when N is taken | Help text says the default falls back; explicit behavior not read (`orcad-ws-port-policy.ts`, `loopback-port-reservation.ts` unread) |
| Whether orcad contacts Orca-operated hosts (updates, relay, telemetry) | Telemetry env names found; relay (`ORCA_RELAY_*`) and update paths not traced |
| Terminal daemon behavior under the Gecko `Subprocess` on Windows (job objects) | Not tested; `orcad-windows-conpty-breakaway.integration.test.ts` exists in Orca |
| Whether stock orcad advertises `browser.screencast.v1` and what the web client shows for browser actions with no provider | Not determined (Question 4 last section) |
| Whether Remote Agent modules can be driven in-process for one target browser | Not investigated; P6a |
| Owner decisions: daemon survival at quit; telemetry opt-out; meaning of "move between modes" given a shared main area; whether a fourth mode changes any toggle contract | Need answers before P1 and P2 plans |

## Sources

- PB: `powerbrowser/shell/TheiaService.sys.mjs`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/shell/GroupActorChild.sys.mjs`, `powerbrowser/INTERNAL-APIS.md`, `scripts/verify-registry-shape.mjs`, `scripts/check-internals-boundary.sh`, `theia/extensions/tab-uris/src/browser/{tab-uri-registry,web-tab,tab-uris-frontend-module}.ts`, `theia/extensions/modes/src/browser/{mode-descriptors,main-area-exemption,group-model,setups-service,mode-service}.ts`, `docs/URI-SCHEMES.md`, `CLAUDE.md`.
- Planning: `.planning/workstreams/orca/research/INPUTS.md`, `.planning/workstreams/orca/NOTE-orca-tab-parity-direction.md`, `.claude/skills/spike-findings-Power-Browser/references/orca-client-hosting.md`, `.planning/seeds/SEED-261103-o1g-orca-mode-milestone.md`.
- Orca (`/home/chris/coding/orca-eval`, 3052dd79, 1.4.214): `src/main/orcad/{orcad-browser-provider,orcad-browser-startup,orcad-client-page-commands,external-chromium-browser-process,orcad-daemon-supervision,orcad-daemon-retirement,orcad-stop-request-listener,orcad-command-arguments,orcad-app-paths,orcad-entry,orcad-lifecycle}.ts`, `src/main/runtime/runtime-browser-commands-factory.ts`, `src/main/runtime/runtime-rpc/runtime-rpc-pairing.ts`, `src/main/server/serve-readiness.ts`, `src/cli/runtime/{serve-orcad-launch,serve-pairing-redaction}.ts`, `src/shared/{orcad-stop-request,browser-client-automation-protocol,browser-runtime-capabilities}.ts`, `src/renderer/src/web/*`, `vite.web.config.ts`.
- Installed build 1.4.245: `resources/orcad-template/` (bundled orcad, manifest), `resources/app.asar.unpacked/out/`.
