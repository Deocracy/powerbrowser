# Phase 62: Overlay gate and PowerBrowser-run orcad - Research

**Researched:** 2026-11-09
**Domain:** Gecko-chrome process supervision (a second sidecar beside Theia), a third-party Node daemon's environment/lifecycle, and a git-patch overlay gate over a pinned source tree
**Confidence:** HIGH on tree facts and on the orcad behaviour I ran on this host. MEDIUM on the PowerBrowser live proofs (not run: they need chrome code that does not exist yet). One locked decision (P62-06) is contradicted by the pinned source; see Summary item 1.

<user_constraints>
## User Constraints (from 62-CONTEXT.md)

### Locked Decisions (Claude's auto-mode picks P62-01..P62-13; Chris may override)

**OrcaService (RUN-03, criterion 1)**
- **P62-01:** a new `powerbrowser/shell/OrcaService.sys.mjs`, modelled on `TheiaService.sys.mjs`'s spawn / ready-sentinel / supervise / stop shape, is the only owner of the orcad process. It is a *consumer* of `PowerBrowserAPI.sys.mjs`: every Firefox internal it needs (subprocess spawn, env, profile dir, quit observers) goes through a `PowerBrowserAPI` method with a row in `powerbrowser/INTERNAL-APIS.md`; no second file imports a Firefox internal (hard rule 2).
- **P62-02:** orcad starts eagerly at launch, after the Theia sidecar reports ready, not lazily on first use of an Orca mode. A start failure never blocks Theia: it is logged and surfaced as a diagnostics row (the failure page is Phase 67).
- **P62-03:** orcad runs on the same Node binary the Theia sidecar uses (D-14), started with `--bind 127.0.0.1 --port <fixed> --json`, the port taken from one manifest key in `configuration.toml` (default chosen by research from the free loopback range the project already reserves; never 0 in the product). The ready line is parsed as in Phase 60's `scripts/lib/orca-run.mjs`; `health.nodeVersion` and a loopback `boundEndpoint` are asserted at start.
- **P62-04:** the child environment is built from an allowlist, never inherited-minus-scrub. The allowlist is one tracked constant (names only) that both `OrcaService` and the check read: `ORCA_USER_DATA` and `ORCA_USER_DATA_PATH` both set to the `powerbrowser-orca` data root under the PowerBrowser profile, `ORCA_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`, `ORCA_VERSION` from the pin, plus the minimal process variables (PATH, HOME, LANG, XDG runtime). The check reads `/proc/<pid>/environ` of the running orcad and compares names as a set against the allowlist, so an inherited `ORCA_*` or a missing profile variable goes red. The socket-path length limit found in Phase 60 (108 bytes) is handled by a short runtime directory for the socket, recorded in the plan.
- **P62-05:** `*.onorca.dev` gets its row in the endpoint allowlist source that `generated/endpoint-hosts.json` is built from, with the reason "Orca pairing relay (D-23)"; no other Orca host is added.

**Hidden Electron prevention (RUN-04, criterion 2)**
- **P62-06:** prevention is by environment and lookup-path control, not by patching Orca. The four installed-Orca lookup paths orcad checks (from Phase 60 research) are derived from the pinned source at check time; `OrcaService` gives orcad a HOME/XDG view in which none resolves, and the self-test plants a decoy executable at each path in a scratch root: first it proves stock orcad (plain environment) launches the decoy on a browser request, then that PowerBrowser's orcad completes the same request without launching it (decoy writes a marker file when run; the marker must be absent). An absence assertion is used only after the stock run has proven the detector fires (CLAUDE.md rule 1).

**Quit and reap (RUN-05, criterion 3)**
- **P62-07:** on quit, `OrcaService.stop()` asks orcad to shut down, then terminates orcad, its terminal daemon and every descendant by process group, with the same `_shuttingDown` guard and quit-observer shape `TheiaService` uses; agents end with PowerBrowser (D-07 revised). The check records the process tree (orcad pid, `health.terminalDaemon.pid`, descendants) before quit and requires none of those PIDs alive after.
- **P62-08:** on launch, before spawning, `OrcaService` reaps stale state from a killed session: a pid/lock file in the `powerbrowser-orca` data root naming the previous orcad and daemon; if those PIDs are alive and are orcad processes of this profile they are terminated, the lock and stale socket are removed, and orcad starts on the same fixed port. The check kills PowerBrowser with SIGKILL, relaunches, and requires a ready orcad on the same port.

**Overlay gate (OVL-01, OVL-05, criteria 4 and 5)**
- **P62-09:** the overlay lives in one tracked directory `orca-overlay/` with `seams.json` (declared seams: upstream path, upstream blob sha at the pin, patch file, one-line reason), `patches/` (regenerated seam patches) and `files/` (PB-added files at the path they take inside the Orca tree). `scripts/build-orca.sh` applies it after the fetch-verify and before Orca's build: copy `files/` in, apply `patches/` with the same blob-hash check `apply-patches.sh` uses (a silent no-op is a failure). Phase 62 ships it empty of seams and files; later phases add to it.
- **P62-10:** one gate script `scripts/verify-orca-overlay.mjs` covers criteria 4 and 5 and registers one row plus one `-self-test` row (quick) and one built-tree row (full, SKIP with a printed line when `orca/` is absent). It derives everything at check time: the seam list from `seams.json`, each seam's upstream blob from the fetched tree at the pin, the PB-added file list from `orca-overlay/files/`, the upstream path set from `git -C orca ls-tree`. Red on: a patch that replaces a whole upstream file, a patched upstream path with no `seams.json` row, a seam count over the cap (the cap is one manifest value, default 10, D-16), a `files/` entry that shadows an upstream path at the pin, and (built-tree row) a `files/` entry that neither `build:web` nor `build:orcad` compiled (derived from the build's module graph or output map, method chosen by research). The self-test plants each fault and requires each to go red naming it.
- **P62-11:** `orca-overlay/` is a tracked PowerBrowser directory that names Orca, so its files get rows under the strict brand probe (Phase 60 P60-R2) and the directory is never added to the scan's exclude list.

**Mechanics**
- **P62-12:** two plans that can run as Orca lanes with disjoint files (the overlay gate: scripts, `orca-overlay/`, build-orca.sh hook; and OrcaService: chrome-side service, PowerBrowserAPI methods, INTERNAL-APIS rows, the env/decoy/quit checks) plus the coordinator merge. The OrcaService lane adds chrome code, so its live proofs need this workspace's objdir rebuilt with `./mach build faster` after merge (new `.sys.mjs` files are registered in `moz.build`/`jar.mn`); the lane proves what it can with the built tree it has and names the coordinator proof commands for the rest. No human checks (D-18).
- **P62-13:** no user-facing copy is added in this phase. Start, stop and reap events are log lines and diagnostics rows only; any string a user could see waits for Phase 67's page and follows the copy rule there.

### Claude's Discretion
- Internal structure of `OrcaService`, the exact lock-file format, the module-graph method for criterion 5, the default port number, and test harness layout.

### Deferred Ideas (OUT OF SCOPE)
- Failure page, pairing-offer containment, Origin check, credential-storage check (Phase 67).
- Packaging orcad and its Node into installers (Phase 68).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RUN-03 | `OrcaService` spawns orcad through the `PowerBrowserAPI` boundary and a supervisor: loopback bind, fixed port, data root `powerbrowser-orca` via both `ORCA_USER_DATA` and `ORCA_USER_DATA_PATH`, allowlisted environment, telemetry off, `*.onorca.dev` on the egress allowlist | TheiaService lifecycle map (Architecture Patterns); the six new boundary methods; orcad env facts; socket-length alias; port recommendation; endpoint-allowlist and privacy-page findings |
| RUN-04 | PB's orcad never finds and launches an installed Orca desktop as a hidden Electron engine | Summary item 1 (the lookup is at orcad start, three of four paths are absolute, HOME cannot be repointed); seam option A; decoy detectors proven on this host |
| RUN-05 | Quit stops orcad and every agent it started; stale state is reaped on next launch | Observed shutdown/reap behaviour (daemon outlives orcad; SIGKILLed PB leaves orcad holding the lock, exit 78); reap design; process-tree check |
| OVL-01 | Additive overlay; a check goes red on whole-file replacement, undeclared seam, seam count over cap | `orca-overlay/` shape; reuse of `apply-patches.sh`/`regenerate-patches.sh` with `--upstream orca`; blob and replacement derivations |
| OVL-05 | PB pane entry and providers are new files only, compiled by Orca's own builds | Shadow derivation; compiled-input method (marker literal in the build output), with the rejected alternatives and why |
</phase_requirements>

## Summary

Phase 62 is mostly assembly of parts that already exist in the tree: `TheiaService.sys.mjs` is the supervisor template, `scripts/lib/orca-run.mjs` already holds the ready-line parser, redaction, `/proc` walk, teardown and the installed-Orca path derivation, and `apply-patches.sh` / `regenerate-patches.sh` already accept `--upstream <dir> --patches <dir>`, so the overlay can reuse them against `orca/` unchanged. The new work is six small `PowerBrowserAPI` methods, one service file, one pure env/argv module, one gate script and four to five check rows. I ran orcad from `orca/out` on this host (scratch profile, minimal environment, fixed port) to settle the lifecycle questions by observation.

**Findings the planner must act on (ordered by consequence):**

1. **P62-06 cannot be met by environment control, and its trigger is misdescribed.** The four installed-Orca paths are `~/.local/bin/orca-ide` plus three absolute paths (`/usr/local/bin/orca-ide`, `/usr/bin/orca-ide`, `/opt/Orca/orca-ide`); only the first moves with `HOME`, and `HOME` must stay the user's (agents read `~/.claude`, git config, ssh keys). The lookup runs **once at every orcad start**, in the background (`startOrcadBrowserProvider` from `startOrcadWithHost`), not on a browser request. A user with the Orca `.deb` installed has `/opt/Orca/orca-ide`, so a PB orcad would launch it. The smallest honest fix is a one-line additive seam in `src/main/orcad/orcad-browser-provider.ts` (a file D-16 already names as a seam) that makes `installedElectronCandidates` return `[]` when an env switch is set. That gives the overlay gate its first real seam and lets one built orcad serve as both the stock control and the PB run. This conflicts with the "zero seams" allowance in the phase boundary; it needs the planner's (or Chris's) call. Option B (no seam) is described in Open Question 1 with what it cannot prove.
2. **A SIGKILLed PowerBrowser leaves orcad and its daemon alive**, and the relaunch then fails: orcad has no parent-death watchdog (only a bundled-launcher IPC disconnect, unused slot-less), and a live holder of `orcad.lock` makes a second orcad exit 78 with `orcad_instance_lock_held` [VERIFIED: run]. Reap-before-spawn is therefore mandatory, not a nicety. orcad writes the identity record itself (`<dataRoot>/orcad.lock`: `pid`, `linuxStartTicks`), but it does not name the daemon in a place PB can find without the ready line, so `OrcaService` keeps its own state file (the `sidecar-state-*.json` pattern).
3. **SIGTERM to orcad does not stop its terminal daemon or the PTYs under it.** Observed: orcad gone, daemon and `bash`/`sleep` children alive. SIGTERM to the daemon then removed the daemon and its PTY children. An idle daemon retires itself; a daemon holding sessions does not. `stop()` must signal orcad, wait, then signal the daemon pid (and walk descendants as a backstop).
4. **`PowerBrowserAPI.spawnProcess` hard-codes `environmentAppend: true`**, so it inherits the whole browser environment; an allowlist needs a new method (`environmentAppend` unset makes `environment` the entire set [CITED: upstream/toolkit/modules/subprocess/Subprocess.sys.mjs:70-76]). `TheiaService`'s stdout pump logs every line; copied as-is it would put orcad's pairing URL (a bearer credential) in the log buffer and console.
5. **Criterion 5's "compiled" cannot be read from Orca's build output as shipped.** Both builds set `sourcemap: false`; orcad's esbuild `metafile: true` stays in memory; Vite writes no manifest of modules. Recommended method: every PB-added overlay source file carries a path-derived marker string literal that must survive into the minified bundle; the gate greps `out/web` and `out/orcad` for it (a tree-shaken, unimported or unregistered file loses its marker, so it goes red).
6. **Privacy-page copy is forced by an `allow` allowlist row.** `verify-privacy-hosts` requires every non-loopback `allow` host to appear in `website-staging/privacy.html`, which is user-facing copy and collides with P62-13. Use disposition `user-initiated` for `.onorca.dev` (no privacy entry, strict: any unattended contact fails) or add one reviewed privacy line. Recommended: `user-initiated`.
7. **Brand rows will churn.** `orca-overlay/**` and every new Orca-naming file change the exact counts in `inventory/brand-tokens.json` (11 Orca rows, `expected_files` sets). Counts must be re-measured once, after the lanes merge.

**Primary recommendation:** Build OrcaService on a pure `OrcaEnv.sys.mjs` (allowlist, argv, ready-line parse, socket-fit, redaction) that both chrome code and the verify scripts import; reap by verified identity (pid plus `/proc` start ticks) before spawn; stop orcad then the daemon then the tree; adopt seam option A for RUN-04; build the overlay gate on `apply-patches.sh --upstream orca`; use marker literals for criterion 5; remeasure brand counts at the coordinator.

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core; `scripts/diff-theia-core.sh` is the check. Nothing in this phase touches Theia.
- Never modify Gecko outside the patch stack; all Firefox internals go through `powerbrowser/shell/PowerBrowserAPI.sys.mjs` with a row in `powerbrowser/INTERNAL-APIS.md`; `scripts/check-internals-boundary.sh` (modes default, `--self-test`, `--catalogue`) enforces it. `OrcaService.sys.mjs` is a consumer and may carry none of the forbidden patterns (`Services.`, `Cc[`, `Ci.`, `IOUtils`, `AppConstants`, `ChromeUtils.import*` of anything not `chrome://powerbrowser/`, etc.).
- Design for the bridge: `TabUriRegistry`'s exported shape is untouched (`verify-registry-shape.mjs`). Not touched here.
- Repo path contains no space (`pkgs.mkShell` rpath). Builds run in `nix develop .#firefox|.#theia|.#orca`.
- Theia is the default GUI; no custom browser chrome is authored. Not touched here.
- No generator in the Phase-1 sense does not apply any more (Phase 2 shipped it), but byte-identity of generated output with the hand-written comparands still does: any manifest-driven pref needs both.
- The residual-brand scan is a permanent gate: `node scripts/scan-brand-residue.mjs` exits 0 with no class excluded; it iterates `git ls-files`, so **stage new files before trusting a green scan**; token classification lives only in `inventory/brand-tokens.json`.
- Patches are regenerated, never text-edited (`check-patch-surface.sh`, `apply-patches.sh --self-test`, `regenerate-patches.sh --check`).
- One driver, one registry: `scripts/verify-platform.sh`; adding a check appends rows, never a sibling driver. Never assert on the absence of a log line unless the line is proven to be emitted by the code under test; derive expectations from the tree and compare as sets; give each check a `--self-test` that plants faults and requires red naming the drift.
- User-facing copy: no internal identifier in user-visible text. This phase adds none (P62-13).
- Live runs take `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` (shared across worktrees; this worktree's `.git` is a file, so use that absolute path as Phase 60 did). Edits to chrome JS need `-purgecaches` (the live harness sets `MOZ_PURGE_CACHES=1`).
- A PreToolUse hook rejects Bash commands containing the ledger directory name; use Read for ledger files.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Spawn, supervise, stop orcad | Chrome (Gecko privileged) `OrcaService.sys.mjs` | `PowerBrowserAPI` boundary | Same tier as `TheiaService`; PB's Node child of the browser process |
| Env allowlist, argv, ready-line parse, socket-fit | Pure shared module `OrcaEnv.sys.mjs` | verify scripts (Node) | One constant read by both service and check (P62-04); pure so Node can import it |
| Identity-verified reap of a previous session | Chrome `OrcaService` + `/proc` reads via boundary | orcad's own `orcad.lock` | PB state file names orcad and daemon; orcad's lock is the cross-check |
| Egress allowlist for `*.onorca.dev` | Tracked config `powerbrowser/endpoint-allowlist.json` | `verify-endpoints.sh`, `verify-privacy-hosts.mjs` | The allowlist is the single source; nothing generated |
| Overlay application | Build tooling `scripts/build-orca.sh` | `apply-patches.sh --upstream orca` | Before Orca's install/build; no runtime role |
| Overlay gate (seams, shadowing, compiled inputs) | Verification script `verify-orca-overlay.mjs` | `git -C orca` | Derives from `seams.json`, `files/`, the pinned tree and the build output |
| Hidden-Electron prevention | orcad process (Orca source, seam option A) | `OrcaService` sets the env switch | The lookup lives in orcad; PB can only switch it |
| Diagnostics rows for orcad | Chrome `OrcaService.getState()/getDiagnosticRows()` | `powerbrowser.js` diagnostics layer | Rows only; no user-facing sentence (P62-13) |

## Standard Stack

No external package is installed or added by this phase. Everything below is already in the tree.

### Core (reuse, do not rebuild)
| Asset | Where | Purpose |
|-------|-------|---------|
| `TheiaService.sys.mjs` | `powerbrowser/shell/` | Supervisor template (spawn, ready sentinel, health, respawn backoff, `_shuttingDown`, quit observer, reap, state file) |
| `PowerBrowserAPI.sys.mjs` | `powerbrowser/shell/` | The only Firefox-internals file; new methods go in its end-of-file section (append-only rule) |
| `scripts/lib/orca-run.mjs` | Phase 60 | `ensurePbNode`, `orcaVersionFromPins`, `orcadEnv`, `parseReady`, `redact`, `descendants`, `stopOrcad`, `installedOrcaPaths` |
| `scripts/apply-patches.sh`, `scripts/regenerate-patches.sh` | existing | Take `--upstream <dir> --patches <dir>`; run unchanged against `orca/` and `orca-overlay/patches/` (both refuse an empty patch dir, so the gate and `build-orca.sh` must skip them at zero patches) |
| `scripts/lib/pb-relaunch.mjs`, `pb-live-probe.mjs`, `firefox-bidi.mjs` | existing | `makeProfile(extraPrefs)`, `withShell`, `app.quit({how})` returning `'exited'`, `probe(app, body)` chrome evaluation, `launchedBrowserPids()` |
| `inventory/brand-tokens.json`, `scan-brand-residue.mjs --report` | Phase 60 | Brand rows with exact counts; `--report` writes **markdown**, not JSON |
| `powerbrowser/endpoint-allowlist.json` | existing | Suffix hosts are written with a leading dot (`.webview.localhost`); the matcher is `h.host === host || (h.host.startsWith('.') && host.endsWith(h.host))` [VERIFIED: scripts/lib/endpoint-verdict.mjs:17] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `PowerBrowserAPI.spawnProcessExact` | Change `spawnProcess` in place | In-place edit shifts every later catalogue line and weakens `TheiaService`'s deliberate append semantics; append a new method |
| Own state file for daemon pid | Parse `<dataRoot>/daemon/daemon-v55.pid` | The version suffix (`daemon-v<PROTOCOL_VERSION>`) changes per pin and needs a directory listing method; the ready line already carries `health.terminalDaemon.pid` |
| Seam option A (env switch in `orcad-browser-provider.ts`) | Option B: no seam, env only | B covers only `~/.local/bin/orca-ide`; see Open Question 1 |
| Marker literal for "compiled" | Second `vite build --sourcemap` into a scratch dir | Covers only `build:web`; orcad's esbuild call has no flag to emit a metafile without editing Orca's script or injecting a preload |
| Manifest key `[orca] port` (CONTEXT default) | Pref default `pref("powerbrowser.orca.port", 26768)` in a preprocessed prefs file | Manifest route is ~7 touch points (below); the pref route is one line. CONTEXT chose the manifest; cost is stated so the planner can confirm |

**Installation:** none. **Package Legitimacy Audit:** not applicable (no package added; Orca's own dependency closure is untouched and already audited in Phase 60). Nothing in this research is `[ASSUMED]` on a package-name basis.

## Architecture Patterns

### System Architecture Diagram

```
 launch ──> powerbrowser.js ──> TheiaService.start(el) ──resolves──> OrcaService.start()
                                  (Theia sidecar, token, :0)            |
                                                                        | 1. register onQuitGranted(stop) + named reap blocker  (before any branch that can spawn)
                                                                        | 2. resolve Node (same rule as sidecar: staged <GreD>/node/bin/node > pref > PATH)
                                                                        | 3. data root = <ProfD>/powerbrowser-orca; alias if socket path would not fit
                                                                        | 4. reap previous session (state file + orcad.lock; pid + start ticks must match)
                                                                        | 5. spawnProcessExact({command: node, args: [orcad.js --bind 127.0.0.1 --port N --json --web-client-root ..],
                                                                        |      environment: OrcaEnv.build(allowlist, PB env)})
                                                                        v
                         orcad (Node 24, own pid) ──stdout──> ONE JSON line orca_server_ready  (parse-only; never logged)
                            |   `-- stderr ──> log ring buffer (redacted)
                            |   `-- spawns terminal daemon (detached: own pgid+sid) ──> PTYs ──> agent CLIs
                            |   `-- at start, in background: looks for installed Orca desktop (4 paths)  <== RUN-04 seam
                            |   `-- writes <dataRoot>/orcad.lock, daemon/daemon-v55.{pid,sock,token}, o-<pid>-<x>.sock
                            v
              asserts: boundEndpoint ws://127.0.0.1:<N>, health.nodeVersion major 24; write state file
                            |                        {orcadPid, orcadTicks, daemonPid, daemonTicks, port}
                            v
        supervise: proc.wait() -> unexpected exit -> bounded respawn on the SAME port, reaping first; give-up -> state "failed" + log + diag rows
        quit: quit-application-granted -> stop(): SIGTERM orcad (grace >= 16 s: orcad's own deadline is 15 s)
                -> signalBarePid(daemonPid, TERM) -> descendants of daemon -> remove state file
              AsyncShutdown blocker "PowerBrowser: reap orcad" awaits stopAndReap()
 SIGKILL of PowerBrowser: orcad + daemon survive (no watchdog) -> next launch step 4 kills them by verified identity, orcad starts on the same port.
```

### Recommended Project Structure
```
powerbrowser/shell/OrcaService.sys.mjs     # consumer; imports PowerBrowserAPI + OrcaEnv via ChromeUtils.importESModule("chrome://powerbrowser/content/...")
powerbrowser/shell/OrcaEnv.sys.mjs         # PURE: no ChromeUtils, no Services; importable by Node verify scripts
powerbrowser/shell/jar.mn                  # + 2 content lines (this is the only registration; moz.build lists jar.mn, not files)
powerbrowser/shell/PowerBrowserAPI.sys.mjs # + end-of-file section: spawnProcessExact, listProcessTree, addNamedReapBlocker
powerbrowser/shell/powerbrowser.js         # + import and chained start; + OrcaService rows in the diagnostics layer
powerbrowser/shell/powerbrowser-orca.js    # NEW prefs file (add to moz.build JS_PREFERENCE_PP_FILES) OR lines in powerbrowser-sidecar.js
powerbrowser/INTERNAL-APIS.md              # + rows for each new forbidden-pattern occurrence (end of Touchpoints table)
powerbrowser/endpoint-allowlist.json       # + { "host": ".onorca.dev", "disposition": "user-initiated", ... }
orca-overlay/seams.json                    # { "cap": from manifest, "seams": [ ... ] }  -- shape below
orca-overlay/patches/NNN-<slug>.patch      # regenerated; option A ships 010-installed-electron-switch.patch
orca-overlay/files/                        # PB-added files at their in-tree path (empty in Phase 62)
scripts/verify-orca-overlay.mjs            # criteria 4+5 (+ --self-test)
scripts/verify-orca-service.mjs            # static/derived (+ --self-test)
scripts/verify-orca-hidden-electron.mjs    # decoy (+ --self-test)
scripts/verify-orca-service-live.mjs       # env set, same Node, port, quit tree, SIGKILL reap
```

### TheiaService lifecycle map (what OrcaService copies, what it must not)
All in `powerbrowser/shell/TheiaService.sys.mjs` [VERIFIED: read this session]:

| Concern | Lines | Copy? |
|---|---|---|
| Boundary import `const { PowerBrowserAPI } = ChromeUtils.importESModule("chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs")` | 16 | copy |
| Restart backoff constants (500 ms initial, 5000 ms cap), `giveUpAttempts`, `giveUpWallclockMs` prefs | 87-89, 1192-1193 | copy shape, own pref names |
| Per-launch state, `_started` re-entry guard set before any other work, `_shuttingDown` | 91-113, 192-196 | copy |
| `start()`: observer registered **before every branch that can spawn** (01-12 lesson), reap blocker registered once per process | 257-274 | copy exactly; blocker needs a **new unique name** |
| `ensureDirectory(configDir)`, state-file path keyed on profile | 211-228, 285 | copy |
| `_reapLeftover` / `_reapLeftoverAt`: state file -> `signalBarePid(pid,0)` -> `readProcessStartTicks` equality -> SIGTERM -> bounded poll -> remove file | 701-758 | copy shape (the TheiaService methods are private to that object; do not refactor them) |
| `_resolveSidecar`: staged `<GreD>/node/bin/node` unless the user set `powerbrowser.sidecar.nodePath`, else the pref, else `pathSearch("node")` | 570-574 | mirror with the **same pref**, so the sidecar and orcad cannot diverge |
| `_spawnAndGate`: `PowerBrowserAPI.spawnProcess({command,args,environment})`, `_shuttingDown` re-check after spawn, readiness race against `startupTimeoutMs`, state file written after ready | 817-1027 | copy shape; **replace** `spawnProcess` with the exact-env method; **no** stdin credential (orcad takes none) |
| `_pumpOutput`: pushes every stdout/stderr line to `_pushLog` and `PowerBrowserAPI.log` | 1493-1571 | **do not copy for stdout**: orcad's one stdout line holds `pairing.webClientUrl` (a reusable bearer credential, spike 003). Parse the ready line in memory, log nothing from stdout, log stderr only through `OrcaEnv.redact` |
| `stop()`: `_shuttingDown` guard, flush (Theia only), `killProcess(proc, graceMs)` fire-and-forget, detach observers, remove state file, observer removed last | 389-466 | copy minus the frontend flush; kill orcad, then daemon |
| `stopAndReap()`: awaits `waitForExit(proc, graceMs + 500)`, logs loudly on timeout, never rejects | 476-493 | copy |

**Wiring point:** `powerbrowser.js:380` is `TheiaService.start(browserElement).catch(err => TheiaService.reportUnexpectedFailure(err));`. `TheiaService.start()` resolves when `_restart()` returns (success or give-up), so chain Orca after it:
```js
const { OrcaService } = ChromeUtils.importESModule("chrome://powerbrowser/content/OrcaService.sys.mjs");
TheiaService.start(browserElement)
  .catch(err => TheiaService.reportUnexpectedFailure(err))
  .finally(() => OrcaService.start().catch(err => OrcaService.reportUnexpectedFailure(err)));
```
`verify-branding-identity.mjs`, `verify-shell-error-contract.mjs` and `verify-start-path-recovery.mjs` all read `TheiaService.start(`; keep that call text byte-identical and run those rows after the edit (they were not run here). The diagnostics layer renders `TheiaService.getState()/getRecentLog()/getFailureDetails()` (`powerbrowser.js:267-313`); add `...OrcaService.getDiagnosticRows()` to the `rows` array only, leave the `POWERBROWSER_DIAGNOSTICS` sentinel object unchanged.

### `PowerBrowserAPI` methods OrcaService consumes (existing) and the rows that cover them

| Method (line in PowerBrowserAPI.sys.mjs) | Use | Catalogue row (INTERNAL-APIS.md) |
|---|---|---|
| `getStringPref` 401, `getIntPref` 413, `prefHasUserValue` 457 | prefs, Node resolution | prefs rows (no forbidden pattern needed beyond `Services.prefs`) |
| `getEnv` 422 | read the allowlisted names from the browser's environment | `Services.env.get` `:423` (row 80) |
| `getProfileDir` 439 | `<ProfD>/powerbrowser-orca` | `Services.dirsvc.get` `:441` (row 82) |
| `getAppDir` 448 | staged `<GreD>/node/bin/node` | `Services.dirsvc.get` `:450` (row 201) |
| `ensureDirectory` 466, `pathExists` 476 | data root, existence | `IOUtils.makeDirectory` `:467` (row 144), `IOUtils.exists` `:477` (row 145) |
| `pathSearch` 517 | `node`, `ln` | Subprocess row `:15` (row 66) |
| `readStateFile` 992 / `writeStateFile` 983 / `removeStateFile` 1006 | OrcaService state file and orcad's `orcad.lock` (JSON) | rows 150-152 |
| `readProcessStartTicks` 1021 | identity (field 22 of `/proc/<pid>/stat`) | row 153 |
| `signalBarePid` 1061 | liveness (signal 0) and TERM/KILL on a pid PB did not spawn; negative pid is not needed | row 85 and row 66 (ctypes) |
| `killProcess` 620, `waitForExit` 629, `readPipeChunk` 641, `sleep` 655, `log` 928 | handle control, pumps | no new internals |
| `onQuitGranted` 718 | quit hook | rows 93-94 |

`getProfileDir`'s path is the Gecko profile; PB's temp-profile harness uses `/tmp/pb-ng-c-profile-XXXXXX` [VERIFIED: scripts/lib/pb-relaunch.mjs, `mkdtemp(join(tmpdir(), 'pb-ng-c-profile-'))`].

### New `PowerBrowserAPI` methods (append to the end-of-file section; one INTERNAL-APIS row per new forbidden-pattern occurrence; run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` after, it never writes a row)

1. `spawnProcessExact({ command, args, environment, workdir })` returning `lazy.Subprocess.call({ command, arguments: args, environment, workdir, stderr: "pipe" })` with **no** `environmentAppend`. Verified semantics: "Otherwise, the values in 'environment' constitute the entire set of environment variables passed to the new process" [CITED: upstream/toolkit/modules/subprocess/Subprocess.sys.mjs:70-76]; the code path is `if (!options.environment || options.environmentAppend) environment = this.getEnvironment()` (`:117`). No new forbidden pattern; still add a row mentioning it so the Subprocess row's method list stays honest (append, do not edit row 66).
2. `listProcessTree(rootPids)` returning every descendant pid: `IOUtils.getChildren("/proc")` plus `IOUtils.read("/proc/<n>/stat", { maxBytes: 4096 })`, parsing ppid after the last `)` exactly like `readProcessStartTicks` (field index 1 of the remainder). Two `IOUtils` rows. Linux only; other platforms return the roots.
3. `addNamedReapBlocker(name, fn)`: `AsyncShutdown.quitApplicationGranted.addBlocker(name, fn)`; a second blocker under the same name is rejected, so the existing hard-coded `"PowerBrowser: reap sidecar"` cannot be reused. Leave `addSidecarReapBlocker` untouched: `verify-sidecar-reap-blocker.mjs` pins its name, its catalogue row (found by the phrase "reap sidecar") and its line. **Word the new row without the phrase "reap sidecar"** (use "reap orcad").
4. (only if the alias is created without `ln`) a `symlink` via ctypes. Not recommended: spawn `ln -sfn <target> <alias>` through `pathSearch("ln")` + `spawnProcessExact` instead (no new libc code).

### Pattern: pure `OrcaEnv.sys.mjs`
**What:** a plain ES module with no Gecko globals, registered in `jar.mn` for chrome and imported by file path from Node verify scripts.
**Exports:** `ORCAD_ENV_ALLOWLIST` (names only), `ORCAD_FIXED_ENV_NAMES` (`ORCA_USER_DATA`, `ORCA_USER_DATA_PATH`, `ORCA_VERSION`, `ORCA_TELEMETRY_DISABLED`, `DO_NOT_TRACK`, plus the option-A switch), `buildOrcadEnv(getEnv, { dataRoot, orcaVersion })`, `buildOrcadArgs({ orcadMain, port, webClientRoot })`, `parseReadyLine(text)` (returns `{ boundEndpoint, nodeVersion, daemonPid, ok }` and **never** the pairing fields), `redact(text)`, `socketPathFits(dataRoot, platform)`, `compareEnvNames(observed, pbNames)`.
**Why:** P62-04 wants "one tracked constant that both `OrcaService` and the check read"; `TheiaService.sys.mjs` cannot be imported by Node (top-level `ChromeUtils`), which is why its `migrateLegacyStateFile` helper is exported but never imported by a script.

Starting allowlist (names only; values come from `PowerBrowserAPI.getEnv`, absent names are simply not set; **[ASSUMED]**, the planner confirms, Linux/macOS only, Windows names are Phase 68): `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMPDIR`, `XDG_RUNTIME_DIR`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME`, `DBUS_SESSION_BUS_ADDRESS`, `SSH_AUTH_SOCK`, `DISPLAY`, `WAYLAND_DISPLAY`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` (and lowercase forms). Do **not** include `XDG_DATA_HOME` (orcad reads it only when `ORCA_USER_DATA` is unset, `orcad-app-paths.ts:14-21`), `NODE_OPTIONS`, `ELECTRON_RUN_AS_NODE`, or any `ORCA_*`/`CLAUDE_*` beyond the fixed set. Evidence for what orcad reads: PATH, HOME, SHELL, DBUS_SESSION_BUS_ADDRESS, XDG_RUNTIME_DIR, TERM, LANG appear in `src/main/orcad`, `daemon`, `ipc/pty` [VERIFIED: grep counts, this session]. **Proven minimal:** orcad plus its terminal daemon started and served with only `PATH`, `HOME` and the five fixed names [VERIFIED: run, ready line parsed, `/proc/<pid>/environ` names printed: `PATH HOME ORCA_USER_DATA ORCA_USER_DATA_PATH ORCA_VERSION ORCA_TELEMETRY_DISABLED DO_NOT_TRACK`].

### Pattern: environment check by set equality
`/proc/<pid>/environ` of a same-uid process is readable [VERIFIED: read for orcad this session]. Find the pids without a name heuristic: orcad's pid is `JSON.parse(<dataRoot>/orcad.lock).pid` (fields `pid`, `linuxStartTicks`, `bootId`, `identity`, `version`, ... [VERIFIED: run, record printed]); PowerBrowser's pid is `launchedBrowserPids()[0]` from `firefox-bidi.mjs`. Expected name set = `ORCAD_FIXED_ENV_NAMES ∪ (ORCAD_ENV_ALLOWLIST ∩ names in /proc/<pb>/environ)`; red on either difference, naming the name. Instrument proof: the harness sets a planted `ORCA_PLANT_62=1` in its own `process.env` before launching PB (the launch spawns with `env = process.env`, `firefox-bidi.mjs`), and the check first requires that name to be present in PB's environ and absent in orcad's. The exec-time snapshot is what is read; orcad's later `process.env.ORCA_USER_DATA_PATH = userDataPath` assignment (`orcad-entry.ts:44`) does not alter it.

### Pattern: data-root alias for the socket-length limit
orcad's runtime RPC socket is `join(userDataPath, \`o-${pid}-${endpointSuffix}.sock\`)` [VERIFIED: orca/src/main/runtime/runtime-rpc/runtime-rpc-socket-metadata.ts:60], and the limit is `const SUN_PATH_SIZE: Record<'linux' | 'darwin', number> = { linux: 108, darwin: 104 }` [VERIFIED: orca/src/shared/unix-socket-path-limit.ts:2], so the longest fitting path is 107 bytes (Linux) / 103 (macOS), measured in UTF-8 bytes. The suffix `/o-` + up to 7 pid digits (`pid_max` 4194304) + `-xxxx.sock` adds 19 bytes, so the data root must be at most 88 bytes on Linux and 84 on macOS (use the macOS figure everywhere: Phase 68 inherits it). The terminal daemon's socket is relocated by Orca itself to `/tmp/.orca-daemon-<uid>/<hash>/` when too long [VERIFIED: orca/src/main/daemon/daemon-socket-endpoint-path.ts, `SHORT_DAEMON_SOCKET_DIR_PREFIX = '/tmp/.orca-daemon-'`], so only the `o-*.sock` matters. A long profile path (macOS `~/Library/Application Support/...`, Flatpak `~/.var/app/...`) will exceed it. Phase 60 hit this live (60-EXT01-RECORD note 1: `listen` fails with EINVAL; a short symlink fixed it).
**Do:** `dataRoot = <ProfD>/powerbrowser-orca` (created with `ensureDirectory`); if `socketPathFits(dataRoot)` use it for both env names; else create a short alias (`$XDG_RUNTIME_DIR/pb-orca-<12 hex of sha256(dataRoot)>` when that variable is set, else `~/.cache/pb-orca-<hash>`) with `ln -sfn <dataRoot> <alias>` each launch and use the alias in both names. Do **not** use `/tmp`. orcad resolves the real path when classifying a "temporary profile" (it printed "running from a temporary profile" when the alias target was under `/tmp`) [VERIFIED: run], so an alias to a profile directory is judged by its target; RUN-09 (Phase 67) therefore sees the true location. The check compares `realpath(ORCA_USER_DATA)` with `realpath(<profile>/powerbrowser-orca)` and requires `ORCA_USER_DATA === ORCA_USER_DATA_PATH`.

### The fixed port
- Orca's default is `export const DEFAULT_WS_PORT = 6768` [VERIFIED: orca/src/main/runtime/runtime-rpc/runtime-rpc-pairing-types.ts:20]; without `--port`, orcad falls back to the next free port. This host has a real Orca desktop listening on 6768, and 6769 is registered to another service in `/etc/services` (`adi-gxp-srvprt`). Do not use 6768 or its neighbours.
- The project reserves **no** loopback range or port: a grep of `docs`, `configuration.toml`, `config-schema.json`, `CLAUDE.md` and `powerbrowser/*.md` for reserved ports found none; the Theia sidecar uses `--port 0` and pins the chosen port per session (`TheiaService.sys.mjs:818-819, 947`). The endpoint allowlist admits `127.0.0.1` as an exact host, any port.
- Linux's default ephemeral range is 32768-60999 [VERIFIED: /proc/sys/net/ipv4/ip_local_port_range on this host], so a fixed port above 32767 can collide with an outgoing connection's source port.
- **Recommend 26768** (below the ephemeral range, adjacent to Orca's number so it is recognisable, absent from this host's `/etc/services` and not listening). **[ASSUMED]** that no common software claims it; the IANA registry was not consulted. Constrain the key to 1024-32767.
- A busy fixed port makes orcad exit 1 with `PinnedPortUnavailableError` (`code: 'pinned_port_unavailable'`, "Port 47321 on 127.0.0.1 is unavailable (EADDRINUSE)") [VERIFIED: run]; `orcadWsPortOptions` sets `requirePinnedWsPort` unless the managed-activation env is set. `OrcaService` classifies that as unrecoverable (like `TheiaService`'s D-112), logs it and records diagnostics rows; the failure page is Phase 67.
- Tests must be able to pick a free port: read the port from a **pref** `powerbrowser.orca.port` so a profile `user.js` (`makeProfile(extraPrefs)`) overrides it; the product default is the manifest value.

Where the manifest key goes (CONTEXT default, Route M). Touch points: (1) `scripts/lib/config-schema.json` rows `orca.port` (integer, minimum 1024, maximum 32767, `required: false`) and `orca.seam_cap` (integer, minimum 1, `required: false`); (2) `configuration.toml` `[orca]` table with both values and a comment; (3) `scripts/generate.mjs`: splice `pref("powerbrowser.orca.port", N);` into `emitFirefoxBrandingJs` at a new anchor, the way `RELEASE_LINK_ANCHOR` ("UPD-13: About-dialog release-notes and manual-update links, derived from configuration.toml [urls].") splices four prefs; (4) the tracked hand-written comparands `powerbrowser/branding/dev/pref/firefox-branding.js` and `.../release/...` (byte-identity rule); (5) `docs/REBRANDING.md`, two rows (`verify-rebranding-docs` requires every schema path as a backtick span); (6) `generated/` regeneration plus `generate --check` and `generated-byte-identity`; (7) `seam_cap` is read only by Node scripts (no emission needed). `required: true` is the downstream mask list, so keep both `false`. Route P (one `pref(...)` line in a preprocessed prefs file, no schema change) is the cheap alternative; it contradicts "port taken from one manifest key" and is only a fallback.

### Pattern: reap before spawn (RUN-05 / P62-08), with observed behaviour
Observed on this host with orcad 1.4.248 from `orca/out/orcad` (scratch profile, `env -i` minimal environment, `setsid` for isolation) [VERIFIED: runs]:
- **Stale live orcad:** a second orcad on the same data root exits **78** with `[OrcadInstanceLockError]: Another orcad (pid N, started ...) already owns the data root ... code: 'orcad_instance_lock_held'` (`orcad-instance-lock.ts:233`).
- **Both processes SIGKILLed:** relaunch succeeded on the same fixed port; orcad reclaimed the dead lock and swept the dead `o-<oldpid>-*.sock` itself. PB must never delete these files itself; it only kills **live** leftovers.
- **SIGTERM to orcad alone:** orcad exited within 3 s and removed `orcad.lock`; the daemon (own pgid and sid, child of orcad until orcad dies) and `bash` -> `sleep 900` under it stayed alive; `daemon-v55.pid/.token` remained.
- **SIGTERM to the daemon:** it, its `sh` watcher, `bash` and `sleep 900` were gone within 3 s.
- **Idle daemon:** with no session, SIGTERM to orcad took the daemon with it (`onIdleShutdown` -> `process.exit(0)`, `daemon-entry.ts`). A daemon with a session survives orcad by design ("Detached terminal daemons must outlive orcad", `orcad-daemon-supervision.ts:1`) and is spawned `detached: true` (`daemon-launched-child-spawn.ts:106`).
- orcad's graceful stop is SIGTERM/SIGINT: `process.on('SIGTERM', () => shutdown('SIGTERM'))` (`orcad-lifecycle.ts:82`) with `export const ORCAD_SHUTDOWN_DEADLINE_MS = 15_000` (`orcad-stop-deadlines.ts:2`). `PowerBrowserAPI.killProcess(proc, graceMs)` sends SIGTERM, waits, then SIGKILLs: give orcad a grace of at least 16 000 ms (own pref `powerbrowser.orca.killGraceMs`), not the sidecar's 3000, or a slow flush is cut off.
- Process groups: `Subprocess` has no `setsid`/`setpgid` anywhere in `subprocess_unix.worker.js` (grep: none), so a Subprocess child very likely shares PB's process group. That is an absence, so **[ASSUMED]**; settle it with one measurement in the lifecycle row (read `/proc/<orcad>/stat` pgid against PB's). Consequence either way: **kill by pid and descendants, never by group** (a group kill from the harness would kill the harness too). P62-07's "by process group" is not usable; use `listProcessTree`.

Design: `OrcaService` writes `<dataRoot>/pb-orca-state.json` (via `writeStateFile`) after the ready line with `{ orcadPid, orcadTicks, daemonPid, daemonTicks, port }` (ticks from `readProcessStartTicks`). On launch, for each of {state file, `orcad.lock` (`pid`, `linuxStartTicks`)}: `signalBarePid(pid, 0)`; if alive and `readProcessStartTicks(pid)` equals the recorded ticks (string equality, as `TheiaService._reapLeftoverAt`), SIGTERM, poll up to the grace, then SIGKILL; remove only PB's own state file. Never act on a pid whose ticks differ. `orcad.lock` pids belong to a different writer (orcad), so verify `/proc/<pid>/comm` is not needed: the ticks equality is the identity proof, and the lock is in PB's own data root.

### Overlay: `orca-overlay/` shape and the gate
`seams.json`:
```json
{ "cap": 10,
  "seams": [ { "path": "src/main/orcad/orcad-browser-provider.ts",
               "upstream_blob": "<40 hex = git -C orca rev-parse HEAD:<path>>",
               "patch": "patches/010-installed-electron-switch.patch",
               "reason": "RUN-04: no hidden Electron from an installed Orca (D-10); a D-16 named seam" } ] }
```
`cap` may live here as a mirror of the manifest value only if the gate also compares it to `configuration.toml [orca] seam_cap` (derive, then compare; a hand-kept second copy would be a hand-kept expectation). Reading the manifest from Node uses the vendored parser (`scripts/lib/toml.cjs`), as `verify-orca-pin.mjs` does. Simpler: no `cap` in `seams.json`, the manifest value only.

Derivations the gate makes (all verified to work on this tree):
- **Upstream blob at the pin:** `git -C orca rev-parse HEAD:<path>` (e.g. `90b79e505d8db41a8cf61cb45dd41f36658a6966` for `src/main/orcad/orcad-browser-provider.ts`) [VERIFIED: run]. `orca/` is a shallow clone (`rev-parse --is-shallow-repository` prints `true`); `rev-parse HEAD:<path>`, `ls-tree`, `cat-file -p HEAD:<path>` and `diff HEAD` all work shallow.
- **Upstream path set:** `git -C orca ls-tree -r --name-only HEAD` (42 314 paths in 29 ms) [VERIFIED: run].
- **Undeclared seam / patch-vs-row set equality:** patch target paths from `diff --git a/X b/X` headers (the `patch_paths` awk in `regenerate-patches.sh`) compared both ways with `seams.json` paths. The pre-image blob in each patch (`index <abbrev>..<abbrev>`, 10 characters, `core.abbrev=10`) must be a prefix of the recorded `upstream_blob`, and the recorded blob must equal the derived one.
- **Whole-file replacement:** per path, `git apply --numstat <patch>` gives added/deleted counts without applying; upstream line count from `git -C orca cat-file -p HEAD:<path> | wc -l`. Red if the patch has `deleted file mode`, `new file mode` or `rename` on an upstream path, or if deleted lines >= half the upstream lines (rounded up, minimum 1). Add a "few-line" bound: added plus deleted per seam <= a named constant (suggest 20; **[ASSUMED]**, D-16 says "one-to-few-line" without a number) so a rewrite of a 3000-line file is also caught. `git apply --numstat` is per file, so a patch that touches two upstream paths counts as two seams.
- **Seam count:** distinct patched upstream paths, compared with the cap (default 10, D-16).
- **Shadowing:** every `orca-overlay/files/**` path (relative to `files/`) must be absent from the `ls-tree` set. Also red on a case-only collision (lower-case both sides; macOS and Windows file systems are case-insensitive) and on a file whose parent path is an upstream *file*, or whose own path is an upstream *directory*.
- **Regenerated, never hand-edited:** when at least one patch exists, run `bash scripts/regenerate-patches.sh --check --upstream orca --patches orca-overlay/patches` against the overlay-applied tree (it diffs `HEAD`, which is how `--3way` staging is seen). That script and `apply-patches.sh` both refuse an empty patch directory ("contains no *.patch files"), so the gate and `build-orca.sh` guard on `ls orca-overlay/patches/*.patch`.
- **Reuse for apply:** `bash scripts/apply-patches.sh --upstream orca --patches orca-overlay/patches` works (it requires the upstream dir to be its own git top level and not this checkout; `orca/` is). It carries the before/after `git hash-object` silent-no-op assertion, which is exactly what P62-09 asks for.

`scripts/build-orca.sh` hook (after step 1 `fetch-verify`, before step 2 shell checks/install). It is **not idempotent as written**: re-running `apply-patches.sh` over an applied tree fails by patch name. So:
1. `modified=$(git -C orca status --porcelain --untracked-files=no)`; every modified path must be a declared seam path, else `fail "undeclared modification in orca/: ..."` (do not erase evidence of an edit).
2. `git -C orca checkout HEAD -- <declared seam paths>` and `git -C orca reset -q -- <same>` (also clears the `--3way` staging).
3. If patches exist: `bash scripts/apply-patches.sh --upstream orca --patches orca-overlay/patches`.
4. Copy `orca-overlay/files/**` into `orca/` with `cp --parents`/`rsync -a`. Untracked files are invisible to `git status --untracked-files=no`. To remove files deleted from `files/` since the last build, write the copied list to `orca/.pb-overlay-copied` (inside the gitignored checkout) and delete entries no longer present before copying.
5. Print one line per applied patch and copied file (the Phase 60 convention: `build-orca: overlay applied <path>`).

Coexistence with `verify-orca-build-shape` (currently red on any `git status --porcelain --untracked-files=no` line, `verify-orca-build-shape.mjs:132-138`): change that one rule to **set equality** between the modified tracked paths and `seams.json` paths (parse the last token of each porcelain line; `M  path` is the staged `--3way` form). Extra modified -> `modified tracked file in orca/` (as today); declared but unmodified -> `seam not applied (the build predates the overlay)`. At zero seams it behaves as today. Add two plants to its self-test (an undeclared extra, a declared-but-unmodified seam) and keep its derive-from-fixture convention (`.fixture-*` names).

### Criterion 5: how "compiled" is derived (recommendation and rejected options)
Facts [VERIFIED: read]: `build-orcad.mjs` esbuild calls set `sourcemap: false` (lines 126, 233) and `metafile: true` (231) but the metafile is only inspected in memory (`collectImporters`); `build:web` is `pnpm run build:packages && node config/scripts/run-vite-web-build.mjs && node config/scripts/verify-web-build.mjs`, `vite.web.config.ts` sets `outDir: resolve('out/web')`, and `run-vite-web-build.mjs` forwards `process.argv.slice(2)` to `vite build`, but `pnpm run build:web -- --sourcemap` appends to the **last** command in the script (`verify-web-build.mjs`), not to Vite. `orca/out/web` contains no `.map` files [VERIFIED: ls].
- **Chosen: marker literals.** Rule: every PB-added overlay source file (`.ts .tsx .js .mjs .cjs`) contains the literal string `pb-overlay:<path relative to the Orca root>` in code that is reachable when the file is used (a provider id, a registration name, a log tag). Source half (quick, no build): the gate derives the expected literal from each `files/` path and requires the file to contain it, and requires no other overlay file to contain it. Built half (full): after `build:web`/`build:orcad`, require the literal in at least one `.js` under `orca/out/web` or `orca/out/orcad` (excluding `node_modules`). Minifiers keep string-literal contents; an unimported file, an unused export (tree-shaken) or a file nothing registers leaves no literal. A file of any other extension is red as "unclassified overlay file kind" until the gate learns it (CSS/JSON need their own rule when the first one lands; none exists in Phase 62).
- Rejected: **second `vite build --sourcemap --outDir <scratch>`** (web only, doubles build time, orcad still unanswered); **injecting a `--require` preload to dump esbuild's metafile** (puts `NODE_OPTIONS` in the build process and can leak to children; fragile on ESM named imports); **own import-graph walk** (reimplements tsconfig path aliases `@/` and `@orca/`; drifts at every re-pin).
- Limitation (state it in the gate header): a marker proves the file is in the bundle, not that its code runs. That matches "compiled by Orca's own build:web and build:orcad" (OVL-05).
- With zero overlay files in Phase 62 the real-tree built row passes with "0 overlay files"; its value is carried by the self-test fixtures. Say so in the PASS line.

### Registry rows (shape and placement in `scripts/verify-platform.sh`)
Rows are `"label|command"` entries; commands are `node <path> [args]`, `bash <path> [args]` or a bare function name; each runs under `setsid`; only the exit code maps to PASS/FAIL, so a SKIP is a printed line plus exit 0.
- Quick rows go after the existing Orca block, **after `licence-allowlist-self-test` at line 3863**: `orca-overlay`, `orca-overlay-self-test`, `orca-service`, `orca-service-self-test`, `orca-hidden-electron-self-test`.
- Full rows go inside the `if [ "$QUICK" -eq 0 ]; then CHECKS+=( ... )` block after `orca-slotless-start` at line 6432 (the last entry): `orca-overlay-built`, `orca-hidden-electron`, `orca-service-live`.
- Two lanes appending at the same two anchors will conflict textually; give each lane's block a distinct leading comment and let the coordinator order them. The coordinator already reconciles "stub rows" this way (memory: `v15-parallel-lanes-run`).

### Brand rows
`inventory/brand-tokens.json` has `scope.tracked_residue_probes: ["orca"]` and 11 `class: "coincidental"` Orca rows with exact `expected_count` and `expected_files` equal to `only_in`. Row shape (the `Orca` title row, abridged) [VERIFIED: read]:
```json
{ "token": "Orca", "case_form": "title", "class": "coincidental", "target": "Orca",
  "expected_count": 93, "expected_files": ["...19 files..."], "only_in": ["...same 19..."],
  "reason": "P60-R2 (OVL-04, plan 60-04): the product name of the third-party agent workspace ... Count measured by the scan itself on the staged tree, never estimated." }
```
Other rows: `orca` lower (420, 20 files), `ORCA` upper (100, 13), `orcad` lower (179, 12), `ORCAD` upper (9, 2), `Orcad` literal, `installedOrcaPaths` literal, `\borca` literal, `\norca_` literal, `ErrorCapture`, `ErrorCalls`. Every new tracked file that spells these tokens (`orca-overlay/seams.json` and patches, `OrcaService.sys.mjs`, `OrcaEnv.sys.mjs`, the four verify scripts, `INTERNAL-APIS.md`, `endpoint-allowlist.json`, `config-schema.json`, `configuration.toml`, `REBRANDING.md`, `BUILD.md`) must be added to the matching rows' `only_in` and `expected_files` and the counts bumped. Procedure (once, at the coordinator, on the merged staged tree): `git add -A <new files>`, `node scripts/scan-brand-residue.mjs --report <path>.md` (markdown, not JSON), read the per-row counts, edit the rows, re-run until exit 0. A patch's context lines quote upstream Orca source, so patch files can add dozens of hits; a new in-word join (for example `PbOrca...`) needs a `literal` row. Lanes should not each hand-edit counts (they will collide in the same JSON array); each lane proves its own tree green, the coordinator remeasures. Keep the 60-04 self-test intact.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Applying seam patches with a silent-no-op guard | A new patch applier | `apply-patches.sh --upstream orca --patches orca-overlay/patches` | Already carries the blob before/after assertion and `--3way` |
| Regenerating / checking patches are not hand-edited | New diff tooling | `regenerate-patches.sh [--check] --upstream orca --patches orca-overlay/patches` | Pinned diff flags; handles upstream-moved files |
| Parsing orcad's ready line, redacting the pairing credential, walking descendants, deriving the installed-Orca paths | New parsers in the verify scripts | `scripts/lib/orca-run.mjs` (`parseReady`, `redact`, `descendants`, `installedOrcaPaths`) | Phase 60 already tested these; duplicating `redact` is acceptable only inside the chrome module that cannot import it |
| Reading a TOML manifest value in a script | A regex | the vendored `scripts/lib/toml.cjs` | Every pin check does |
| Driving PowerBrowser live | A new launcher | `makeProfile(extraPrefs)`, `withShell`, `app.quit()`, `probe(app, body)`, `launchedBrowserPids()` | Handles profile lock, purge-caches, stale-lock after SIGKILL |
| Creating a terminal/agent process inside orcad for the quit check | Speaking orcad's encrypted RPC | `<dataRoot>/cli/bin/orca terminal create --worktree path:<repo> --command "sleep N" --json` (orcad writes this launcher; it execs PB's Node with orcad's bundled CLI) | Works against the running orcad [VERIFIED: run, returned `processId`]; the scratch repo from Phase 60 (`.mozbuild/ext01/scratch-repo`) was already registered |
| Identity of a leftover pid | Port- or name-based kill | pid + `/proc` start ticks equality (`readProcessStartTicks`) | D-111: the only identity PB trusts before signalling a process it did not spawn |

**Key insight:** every hard part has an in-tree precedent; the phase is largely about not diverging from those precedents (append-only boundary, derive-and-compare checks, a self-test that plants each fault).

## Common Pitfalls

### Pitfall 1: Believing the HOME view hides the installed Orca
**What goes wrong:** the check "passes" in the harness because the decoy is under a scratch `HOME`, while a real `.deb` install at `/opt/Orca/orca-ide` is still launched.
**Why:** `installedElectronCandidates` on Linux returns `joinPath(homePath, '.local', 'bin', 'orca-ide'), '/usr/local/bin/orca-ide', '/usr/bin/orca-ide', '/opt/Orca/orca-ide'` [VERIFIED: orca/src/main/orcad/orcad-browser-provider.ts:91-96]; darwin returns `/Applications/Orca.app/Contents/MacOS/Orca` and `~/Applications/...` (`:77-82`); win32 uses `LOCALAPPDATA`/`ProgramFiles` (`:83-90`). Changing `HOME` would also hide `~/.claude`, git identity and ssh keys from agents.
**How to avoid:** seam option A, or accept option B knowingly (Open Question 1). The decoy test can plant only the `HOME`-relative path (the others need root), so the self-test proves the detector on that one path and the seam covers all four by construction (the whole function returns `[]`).
**Warning sign:** `orca-slotless-start` SKIPs on a host with an installed Orca (it uses the same derivation).

### Pitfall 2: The decoy must be a real executable, not a script
`resolveInstalledElectronExecutable` accepts a candidate only if `access(path, X_OK)` succeeds **and** `!isScriptShim` (`:99-112`: realpath, read two bytes, `#!` means script; any read error also means script) [VERIFIED: read]. A shell-script decoy is skipped silently, so a stock control would "prove" nothing. A symlink to an ELF works: `~/.local/bin/orca-ide -> .mozbuild/orca-probe-node/node` was launched by stock orcad [VERIFIED: run]. It exits at once ("bad option: --serve"), which is fine; the detectors below do not need it to stay alive.

### Pitfall 3: Detectors for the hidden launch
Proven on the stock run: orcad wrote `browser-sidecar-profile.json` into the data root (`const PROFILE_RECORD_FILE = 'browser-sidecar-profile.json'`, `electron-sidecar-profile.ts:17`, written inside `ElectronServeBrowserProcess.start` before the spawn) **and** printed `[orcad] Installed Electron browser provider unavailable: Error: Installed Electron browser provider did not become ready: no runtime metadata` (the `console.warn` at `orcad-browser-provider.ts:218`) [VERIFIED: run, stderr tail]. Both are emitted by orcad, not by the harness, which is what CLAUDE.md rule 1 demands. Derive both strings from the pinned source (regex over those two files), assert them **present** on the stock run (else FAIL "detector blind"), then assert both **absent** on the PB-configured run. Delete the data root between runs: the record file persists after orcad exits. The launch arguments a stock orcad gives the decoy are `--serve --serve-port <port> --serve-json --serve-no-pairing ... --user-data-dir=<tmp>` with `ORCA_ORCAD_SIDECAR=1` in its environment (`electron-serve-browser-process.ts`, `electron-serve-browser-environment.ts:27`); that is enough for a decoy that stays alive to be identified by `/proc/<pid>/environ`, but it is not needed.
Note the trigger correction: this happens at orcad start. No browser request is needed, and no marker-writing decoy is needed.

### Pitfall 4: A killed PowerBrowser leaves orcad holding the data root and the port
See Pattern: reap. Any plan that only handles clean quit fails the SIGKILL row at the relaunch with exit 78, and orcad's stdout never produces a ready line.

### Pitfall 5: The daemon outlives orcad
Stopping orcad is not stopping agents. `stop()` and the quit row must cover the daemon pid and the process tree under it; the row must create a session first (a `sleep` terminal through the bundled CLI), otherwise the idle daemon retires itself and the row is vacuous (record, in the row output, that a session existed and that the daemon was alive after a SIGTERM to orcad alone in the self-test fixture).

### Pitfall 6: Leaking the pairing credential through the supervisor's own logging
`TheiaService._pumpOutput` mirrors every line to the log buffer and console. Copying it would publish `pairing.webClientUrl`. Parse stdout in memory; keep only `boundEndpoint`, `health.nodeVersion`, `health.terminalDaemon.pid`; `redact` every stderr line (strip `#pairing=...`, `orca://pair?...`, `pair%3F...`). Add a self-test plant: feed a fixture ready line containing a sentinel code and require the sentinel absent from the ring buffer. (RUN-07's full containment is Phase 67; this is the floor.)

### Pitfall 7: New chrome files need registration and a faster build
`powerbrowser/shell/moz.build` lists `jar.mn` and the prefs file, not individual modules; a new `.sys.mjs` is loadable only after a `content/powerbrowser/<File> (<File>)` line in `jar.mn` **and** `MOZCONFIG=../.mozconfig ./mach build faster` (docs/BUILD.md tier 2, 1.84 s warm). Forgetting it fails at runtime with "Failed to load chrome://powerbrowser/content/OrcaService.sys.mjs" and no static check notices. Add a quick derived row clause: every `powerbrowser/shell/*.sys.mjs` appears in `jar.mn`, both directions. A new prefs file also goes into `moz.build` `JS_PREFERENCE_PP_FILES`. Edited chrome JS needs `-purgecaches` (the live harness sets `MOZ_PURGE_CACHES=1`).

### Pitfall 8: Boundary and catalogue rows
`check-internals-boundary.sh` scans all of `powerbrowser/shell` (default scan dir) so `OrcaService.sys.mjs` and `OrcaEnv.sys.mjs` are covered with no registration; `IOUtils`, `Services.`, `Ci.` and `AppConstants` inside them are offenses. Put the `/proc` reads in `PowerBrowserAPI`. `check-internals-boundary.sh --catalogue` fails on any `PowerBrowserAPI` occurrence without a row, and `verify-ng-040-internals-catalogue-lines.mjs` fails on a row whose line drifted. Edit order: write the methods, run `--fix`, then add rows for the new occurrences.

### Pitfall 9: Respawn without reap
A mid-session orcad crash leaves the daemon (and possibly the lock until orcad's own reclaim). The respawn path must run the same reap, on the same port, with the same bounded budget; adopting a surviving daemon is acceptable there (terminals survive an orcad crash; only a PB quit ends agents, D-07).

### Pitfall 10: Dev-tree Node is the host's Node
`TheiaService` falls back to `pathSearch("node")` when the dev pref is empty (`powerbrowser-sidecar.js`: `pref("powerbrowser.sidecar.nodePath", "")`); this host's `node` is 24.22.1, a packaged build stages 24.19.0 from `node-runtime.json` (`package-linux.sh:29,48,64`). Live rows set `extraPrefs: { "powerbrowser.sidecar.nodePath": <.mozbuild/orca-probe-node/node> }` (from `ensurePbNode`) so orcad and the sidecar both run the pinned 24.19.0, then assert (a) `realpath(/proc/<orcad>/exe) === realpath(/proc/<theia backend>/exe)` (D-14 "same Node") and (b) `health.nodeVersion` equals the `node-runtime.json` version. In the product `OrcaService` itself asserts only the major (`24`), the requirement orcad enforces.

### Pitfall 11: Brand scan ordering, unlisted files, privacy page
See Brand rows and Summary item 6. Stage first. A tracked file spelling an Orca token that is not in the row's `only_in` fails condition 4 naming `file:line`.

### Pitfall 12: Shell-error-copy check
`shell-error-copy-no-internals` derives its surface from `TheiaService`'s `USER_MESSAGE` table. `OrcaService` must not define user-facing sentences (P62-13), and must not feed any string into `window.powerbrowserShowError`; run `--only shell-error-copy-no-internals` after the change to confirm it neither widens nor goes red.

## Code Examples

### Spawn with an exact environment (chrome, `OrcaService`)
```js
// Source shape: TheiaService._spawnAndGate (powerbrowser/shell/TheiaService.sys.mjs:838-891), env now exact.
const environment = OrcaEnv.buildOrcadEnv(name => PowerBrowserAPI.getEnv(name), { dataRoot: this._dataRoot, orcaVersion });
const args = OrcaEnv.buildOrcadArgs({ orcadMain: this._orcadMain, port: this._port, webClientRoot: this._webClientRoot });
const proc = await PowerBrowserAPI.spawnProcessExact({ command: this._nodePath, args, environment });
// OrcaEnv.buildOrcadArgs returns ["<orcad.js>", "--bind", "127.0.0.1", "--port", String(port), "--json", "--web-client-root", root];
// it throws on port 0 or a non-integer port (the product never uses 0, P62-03).
```

### Ready-line read that never exposes the credential
```js
// Stdout: accumulate in memory only. Source facts: serve-readiness.ts one JSON line starting '{' and containing "orca_server_ready"
// (Phase 60 research, scripts/lib/orca-run.mjs parseReady).
const ready = OrcaEnv.parseReadyLine(stdoutText);   // { boundEndpoint, nodeVersion, daemonPid } -- no pairing fields exist on the result
if (!ready.boundEndpoint.startsWith("ws://127.0.0.1:")) throw loopbackViolation;
```

### Set comparison for the environment row (Node, `verify-orca-service-live.mjs`)
```js
// expected = fixed ∪ (allowlist ∩ names present in the PowerBrowser process); both directions are red.
const names = pid => readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean).map(s => s.slice(0, s.indexOf('=')));
const pb = new Set(names(pbPid)); const got = new Set(names(orcadPid));
const want = new Set([...FIXED, ...ALLOWLIST.filter(n => pb.has(n))]);
const extra = [...got].filter(n => !want.has(n)), missing = [...want].filter(n => !got.has(n));
```

### Shape-check reconciliation (Node)
```js
// orca/ status vs seams.json: set equality, both directions.
const modified = new Set(porcelain.split('\n').filter(Boolean).map(l => l.trim().split(/\s+/).pop()));
const declared = new Set(seams.map(s => s.path));
// extra  -> `modified tracked file in orca/: <path>`; absent -> `seam not applied: <path>`
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 60-03's `orcadEnv`: inherit everything, delete `ORCA_*` and three Node-steering names | Allowlist built from names, exact `Subprocess` environment | This phase (P62-04) | An unknown inherited variable can no longer reach orcad or the agents under it |
| Probe teardown by `detached` process group (`stopOrcad` signals `-pid`) | Pid + descendants by identity | This phase | The chrome child does not own a group of its own (assumed); the group kill only worked because the Node probe spawned `detached: true` |
| `build-orca.sh` leaves `orca/` untouched | Overlay applied between fetch-verify and install | This phase | `verify-orca-build-shape` changes from "no modified file" to "modified set == declared seams" |

**Deprecated/outdated in this repo:** `spawnProcess` for anything that must not inherit the browser's environment; `orca-run.mjs`'s `orcadEnv` once `OrcaEnv.buildOrcadEnv` exists (update `orca-run.mjs` to import it so the Phase 60 probe and the product share one definition; this is a small edit but touches a file the Phase 60 rows depend on, so run `orca-slotless-start-self-test` after).

## Runtime State Inventory

Not a rename/refactor/migration phase. Omitted, with one exception worth stating: orcad's data root (`powerbrowser-orca`) is new persistent state under each PB profile (credentials, worktree registry, `orcad.lock`, `daemon/`, `logs/`); nothing existing is renamed, and nothing in a pre-existing profile needs migration.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Default port 26768 is not claimed by common software and is outside the ephemeral range on all target Linux hosts | The fixed port | A collision at launch; mitigated by the pref override and the unrecoverable classification, but a user sees orcad not start |
| A2 | `Subprocess` children share PowerBrowser's process group (no `setsid` found in `subprocess_unix.worker.js`) | Reap pattern | If wrong, nothing breaks (the design never uses groups); only the "do not group-kill" rationale changes. One measured line in the lifecycle row settles it |
| A3 | The starting env allowlist (names) is sufficient for agents (git, ssh, GUI tools, proxies) | Pattern: OrcaEnv | An agent missing a variable the user expects (for example a proxy or `GH_TOKEN`); extend the constant, no code change |
| A4 | `*.onorca.dev` is never contacted unattended by orcad with telemetry off (so `user-initiated` is accurate) | Egress | `verify-endpoints` layer 3 could go red if it observes orcad's traffic; orcad constructs a push service with `gatewayUrl: push.onorca.dev` at start (`orcad-entry.ts:317`) and the relay/profile-cloud services exist. Unverified whether any of them dial out idle |
| A5 | Few-line seam bound of 20 changed lines per seam | Overlay gate | Too tight blocks Phase 63/66 seams; too loose weakens D-04. Owner may set it |
| A6 | Marker-literal evidence survives Orca's minifiers for string literals inside reachable code | Criterion 5 | A bundler that inlines or dedups strings could drop it; the self-test cannot prove the real bundlers, so the first real overlay file (Phase 63/66) is the proof; until then the built row passes vacuously and says so |
| A7 | The orcad-bundled CLI launcher (`<dataRoot>/cli/bin/orca`) is acceptable for the quit row's "agent process" | Don't Hand-Roll | It ran `terminal create` successfully this session; if a re-pin changes it, the row breaks loudly |
| A8 | `restartToUpdate` and the AsyncShutdown path await a second named blocker like the first | Pattern: reap | An update restart could race orcad's 15 s stop; the existing sidecar blocker has the same shape |

## Open Questions

1. **RUN-04 mechanism (needs the planner's, or Chris's, decision).**
   - What we know: environment cannot hide three of four paths; `HOME` must stay the user's; the lookup runs at every orcad start; a seam in `orcad-browser-provider.ts` is within D-16's named seams.
   - Option A (recommended): seam S1, patch `installedElectronCandidates` (or the default argument of `resolveInstalledElectronExecutable`) to return `[]` when `POWERBROWSER_ORCA_NO_INSTALLED_ELECTRON === '1'` in the passed environment. One added line. The env name is deliberately outside `ORCA_*`, which the allowlist scrubs. One built orcad serves as stock control (switch unset) and PB run (switch set). Costs: Phase 62 ships one seam (the gate gets a real positive control), `build-orca.sh` rebuild (21 s warm), and Phase 66 may touch the same file (one seam per path).
   - Option B: no seam. Criterion 2 then proves only the `HOME`-relative path, and a user with a system-wide Orca install keeps the hole. State that limitation in the check header and in `docs/BUILD.md`.
   - Recommendation: A. It is the only option under which criterion 2 is true as written.
2. **`.onorca.dev` disposition.** `user-initiated` (recommended; no privacy-page copy; strict) versus `allow` + `trigger: user-feature` (requires a reviewed line in `website-staging/privacy.html` because `verify-privacy-hosts` compares every non-loopback `allow` host with that page, both directions) versus bare `allow` (unattended list; inaccurate). P62-13 forbids new user-visible copy, which rules out the last two unless Chris approves one sentence. Also decide whether bare `onorca.dev` (changelog, docs) is wanted: the leading-dot suffix `.onorca.dev` does not match it (`host.endsWith('.onorca.dev')` only), and P62-05 says "no other Orca host".
3. **Manifest route for the port** (Route M cost above) versus pref-only (Route P). CONTEXT says manifest; confirm the ~7 touch points are acceptable for one lane.
4. **Cap and bound values.** The cap default 10 is decided (D-16); the changed-lines-per-seam bound is not.
5. **Does orcad dial out unattended at idle?** Not established. A cheap, optional row: after ready, wait N seconds and list orcad's established sockets from `/proc/<pid>/net/tcp` for non-loopback peers. Not required by any criterion; flagged because A4 rests on it.
6. **Windows/macOS.** Allowlist names, `/proc` reads and `signalBarePid` are Linux-only (`signalBarePid` returns false off Linux, `PowerBrowserAPI.sys.mjs:1064`); D-24 limits live checks to Linux; Phase 68 owns the rest. The plan should say so rather than imply coverage.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Built `orca/out` (orcad, web) at 965978bc | all full rows | yes | `out/orcad/orcad.js`, `out/web/web-index.html`, `out/cli` present | rebuild: `nix develop .#orca --command bash scripts/build-orca.sh` (21 s warm); required again after option A |
| PB Node 24.19.0 | live rows, decoy row | yes | `.mozbuild/orca-probe-node/node` (from `ensurePbNode`) | `ensurePbNode()` re-extracts from the cached archive |
| Host Node | dev sidecar fallback | yes | 24.22.1 | set the pref as in Pitfall 10 |
| Built PowerBrowser | `orca-service-live` | yes, but stale | `objdir/dist/bin/powerbrowser` dated Nov 8 21:08, before `OrcaService` exists | `MOZCONFIG=../.mozconfig ./mach build faster` after `jar.mn`/prefs edits (docs/BUILD.md tier 2); a full `./mach build` is only needed for compiled changes, which this phase has none of |
| `git` | overlay gate, build hook | yes | any | none |
| `ln` | alias creation | yes | coreutils | none (core utility) |
| `flock` | live rows | yes | util-linux | none |
| Scratch git repo | quit row (terminal create) | yes | `.mozbuild/ext01/scratch-repo` (registered earlier in a scratch profile) | recreate with `git init` + one commit |
| Installed Orca desktop paths | `orca-slotless-start`, decoy row | none of the four exist on this host | n/a | the decoy row plants its own under a scratch `HOME` |
| Real Orca desktop running on this host | port choice | yes | listening on 6768, Orca 1.4.255 from the Nix store | pick 26768; the live rows must not stop it (never `pkill -f orcad`: kill only pids read from the profile's own `orcad.lock`) |

**Missing with no fallback:** none. **Note for lane agents:** this session ran as a descendant of the real Orca desktop (13 inherited `ORCA_*` variables in its shell). That is exactly the case P62-04 exists for; the live rows must not assume a clean shell.

## Validation Architecture

(`workflow.nyquist_validation` is `true` in `.planning/config.json`.) Everything below is automated; **nothing needs a human** (D-18: human checks wait for the end-of-milestone pass; none are created by this phase). Frameworks: plain Node scripts under the `verify-platform.sh` registry, no unit framework (matches the repo).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node 24 scripts, `scripts/verify-platform.sh` rows |
| Config file | none (registry rows in `scripts/verify-platform.sh`) |
| Quick run command | `scripts/verify-platform.sh --quick` (or `--only <label>`) |
| Full suite command | `scripts/verify-platform.sh` (live rows under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`) |

### Phase Requirements -> Test Map
| Criterion / Req | Behavior | Row(s) | Tier | `--self-test` plants (each must go red naming it) | Needs |
|---|---|---|---|---|---|
| SC1 / RUN-03 (service wired) | OrcaService + OrcaEnv registered in jar.mn; pure builders; boundary clean; no `port 0`/non-loopback bind; env constant is the one the service uses; endpoint row present; port pref/manifest agree and sit outside 1024-32767 violations | `orca-service`, `orca-service-self-test` | quick | allowlist name missing from `OrcaService` use; `jar.mn` line removed; port 0; bind `0.0.0.0`; hostname bind; port in ephemeral range; `.onorca.dev` row removed; socket path 89+ bytes not aliased; stdout line copied into the log (sentinel code) | tree only |
| SC1 / RUN-03 (running) | orcad's `/proc/<pid>/environ` names equal fixed ∪ (allowlist ∩ PB env); inherited `ORCA_*` absent (planted `ORCA_PLANT_62`); data root real path = `<profile>/powerbrowser-orca`; both `ORCA_*_DATA` equal; telemetry values; `boundEndpoint` loopback on the configured port; orcad Node == sidecar Node; `health.nodeVersion` == `node-runtime.json` | `orca-service-live` | full | pure `compareEnvNames` fed fixtures: inherited `ORCA_X`, missing `ORCA_USER_DATA_PATH`, extra non-allowlisted name, wrong value, instrument-blind (planted name absent from PB's own environ) | built PB (after `faster`), built `orca/out`, PB Node |
| SC2 / RUN-04 | stock orcad launches the decoy (detectors fire); PB-configured orcad does not | `orca-hidden-electron` (full), `orca-hidden-electron-self-test` (quick) | full / quick | self-test uses a fixture stand-in orcad that probes the fixture's derived candidate list and spawns a found executable: (a) stock run must trip the detector (if not: "detector blind"), (b) PB run with the switch must not, (c) switch spelled wrong must trip, (d) script-shaped decoy must not be launched (proves the ELF requirement is encoded), (e) derived path list empty -> red "source moved" | built `orca/out` with seam S1 applied (option A) |
| SC3 / RUN-05 (quit) | with a live session (terminal `sleep`), tree {orcad, daemon, descendants} recorded before `app.quit()`; every pid dead after; daemon alive after SIGTERM to orcad alone is recorded as precondition | `orca-service-live` (second phase of the same row) | full | pure `survivors(before, after)` fixtures: one survivor named; empty before-set -> red "vacuous"; session never created -> red | built PB, scratch repo, CLI launcher |
| SC3 / RUN-05 (reap) | SIGKILL PB: orcad survives (precondition proven), relaunch on the same profile; old pids gone; ready orcad on the same port; new `orcad.lock` pid differs | `orca-service-live` (third phase) | full | fixtures: orcad did not survive the kill (red "vacuous: nothing to reap"), old pid still alive after relaunch, different port after relaunch | same |
| SC4 / OVL-01 | seam blob recorded vs derived; whole-file replacement; undeclared seam; row without patch; count over cap; blob drift; pre-image mismatch; few-line bound | `orca-overlay`, `orca-overlay-self-test` | quick (steps needing `orca/` print a named SKIP when absent; tracked-only steps always run) | hermetic fixture "orca" git repo + fixture `orca-overlay`: control green at 0 and at 1 seam; plant each of: full rewrite patch, deleted-file patch, undeclared patch, orphan row, cap 1 with 2 seams, blob changed in `seams.json`, edited `index` line, 40-line patch | `git`; `orca/` for the real-tree steps |
| SC5 / OVL-05 (shadow) | no `files/` path exists at the pin | `orca-overlay`, `orca-overlay-self-test` | quick | exact shadow, case-only collision, file under an upstream file path, file equal to an upstream directory, file missing its marker literal, marker owned by a different file | `orca/` |
| SC5 / OVL-05 (compiled) | each overlay source file's marker appears in `out/web` or `out/orcad` | `orca-overlay-built` | full (SKIP when `orca/out` absent) | fixture `out/` trees: marker absent (red naming file), marker only in `node_modules`, unclassified extension, file compiled into web only (green) | built `orca/out` |
| Shape coexistence | modified set == declared seams | `orca-build-shape` (+ `-self-test`, existing rows edited) | full / quick | extra undeclared modification; declared seam unmodified | built `orca/` |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --only <the lane's quick rows>` plus `node scripts/scan-brand-residue.mjs` (after staging).
- **Per wave merge:** `scripts/verify-platform.sh --quick`.
- **Phase gate:** `--quick` green, plus after `./mach build faster`: `--only orca-service-live`, `--only orca-hidden-electron`, `--only orca-overlay-built`, `--only orca-build-shape` under the live lock; then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `scripts/verify-orca-overlay.mjs`, `scripts/verify-orca-service.mjs`, `scripts/verify-orca-hidden-electron.mjs`, `scripts/verify-orca-service-live.mjs` (all new), each with `--self-test` and `--help`-less argument handling that exits 2 on an unknown argument with a `Next step:` line (house style).
- [ ] `powerbrowser/shell/OrcaEnv.sys.mjs` before any check that imports it.
- [ ] Rows appended at the two anchors; `orca-build-shape` rule and its self-test edited.
- [ ] Brand rows (coordinator, after merge).
- [ ] Re-run `shell-error-copy-no-internals`, `internals-boundary`, `internals-catalogue`, `ng-040-internals-catalogue-lines`, `sidecar-reap-blocker`, `start-path-recovery`, `privacy-hosts`, `theia-endpoints`, `generated-byte-identity` (if the manifest route is taken) because the lane touches their inputs.

## Security Domain

(`security_enforcement` is not set in config: treated as enabled.)

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | orcad's own pairing is unchanged (D-23); PB adds none in this phase |
| V3 Session Management | no | n/a |
| V4 Access Control | yes | loopback-only bind asserted from the ready line; pid-identity before any signal; data root `0700` is enforced by orcad itself (`assertOrcadDataRootIsPrivate`, `orcad-instance-lock.ts`) |
| V5 Input Validation | yes | `buildOrcadArgs` rejects port 0 / non-integer / out-of-range; ready-line fields type-checked; seam paths from `seams.json` validated as in-tree relative paths before any `git checkout`/`cp` |
| V6 Cryptography | no | none added |
| V8 Data Protection | yes | the pairing offer is a reusable bearer credential: never logged, never in the ring buffer, not in diagnostics rows |
| V12 Files | yes | alias creation uses `ln -sfn` into a per-user directory only; never write under `/tmp` for a data root alias |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Inherited secret or steering variable reaches orcad and every agent (`NODE_OPTIONS`, `ELECTRON_RUN_AS_NODE`, `ORCA_*`, tokens) | Information disclosure / Tampering | allowlist environment, exact `Subprocess` env, set-equality check with a planted variable |
| Signalling a recycled pid | Tampering / DoS | pid plus `/proc` start-ticks equality before any signal, as `TheiaService._reapLeftoverAt` |
| Another local user binds the fixed port first | Spoofing | assert `boundEndpoint` and the pid that owns it comes from our own spawn (ready line from our child); a busy port is fatal-for-this-launch, never "adopt whatever answers" |
| Hidden launch of a user-installed Electron app as a browser engine | Elevation / unexpected code execution | seam option A; derived decoy check |
| Pairing URL in logs/diagnostics | Information disclosure | parse-only stdout, `redact` on stderr, sentinel plant |
| Overlay smuggles a whole-file replacement of an upstream path | Tampering (supply chain) | the gate: blob record, replacement ratio, shadowing, cap |
| Stale or foreign overlay files copied into `orca/` | Tampering | copied-list record, `files/` derived set, undeclared-modification refusal in `build-orca.sh` |

## Sources

### Primary (HIGH confidence; read or run this session)
- `powerbrowser/shell/TheiaService.sys.mjs` (lines 16, 86-113, 186-466, 476-493, 536-601, 615-780, 817-1027, 1462-1571), `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (395-735, 920-1085), `powerbrowser/shell/{jar.mn,moz.build,powerbrowser.js,powerbrowser-sidecar.js}`, `powerbrowser/INTERNAL-APIS.md`, `scripts/check-internals-boundary.sh`.
- `scripts/{apply-patches.sh,regenerate-patches.sh,check-patch-surface.sh,build-orca.sh,verify-orca-build-shape.mjs,verify-privacy-hosts.mjs,verify-sidecar-reap-blocker.mjs,verify-crash-autosubmit-env.mjs}`, `scripts/lib/{orca-run.mjs,pb-relaunch.mjs,pb-live-probe.mjs,firefox-bidi.mjs,endpoint-verdict.mjs}`, `scripts/verify-platform.sh` (rows at 3828-3863, 6415-6432), `inventory/brand-tokens.json`, `powerbrowser/endpoint-allowlist.json`, `scripts/generate.mjs` (2715-2810, 3060-3110), `upstream/toolkit/modules/subprocess/Subprocess.sys.mjs`.
- Orca source at the pin (`orca/`, commit 965978bc): `src/main/orcad/{orcad-browser-provider.ts,orcad-browser-startup.ts,orcad-lifecycle.ts,orcad-entry.ts,orcad-instance-lock.ts,orcad-app-paths.ts,orcad-daemon-supervision.ts,electron-serve-browser-process.ts,electron-serve-browser-environment.ts,electron-sidecar-profile.ts,orcad-stop-deadlines.ts,orcad-ws-port-policy.ts}`, `src/main/runtime/runtime-rpc/{runtime-rpc-socket-metadata.ts,runtime-rpc-pairing-types.ts}`, `src/shared/unix-socket-path-limit.ts`, `src/main/daemon/{daemon-socket-endpoint-path.ts,daemon-spawner.ts,daemon-entry.ts,daemon-launched-child-spawn.ts,daemon-protocol-version.ts}`, `config/scripts/{build-orcad.mjs,run-vite-web-build.mjs}`, `vite.web.config.ts`, `package.json` scripts.
- Phase 60: `60-RESEARCH.md`, `60-02/03/04-SUMMARY.md`, `60-EXT01-RECORD.md`.
- Runs on this host, 2026-11-09 (orcad from `orca/out/orcad`, PB Node 24.19.0, scratch profile reached through a short alias that was removed afterwards; no foreign process was signalled): minimal-env start, `/proc/<pid>/environ` names, `orcad.lock` and daemon pid file contents, decoy launch via `~/.local/bin/orca-ide`, lock-held exit 78, busy-port exit 1, SIGTERM/SIGKILL/relaunch sequences, bundled-CLI `terminal create`.

### Secondary (MEDIUM)
- `docs/BUILD.md` tier-2 `faster` timings (cited, not re-run).

### Tertiary (LOW)
- None used. Items marked `[ASSUMED]` above are the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack / reuse map: HIGH, every asset opened this session.
- OrcaService lifecycle and boundary additions: HIGH on facts, MEDIUM on the unbuilt integration (the chrome path was not run; `start-path-recovery`, `shell-error-contract` and `branding-identity` rows must be re-run after the `powerbrowser.js` edit).
- orcad behaviour (lock, daemon, reap, decoy, env, port): HIGH, observed.
- Overlay gate derivations: HIGH for blob/ls-tree/numstat/shadow (run or read); MEDIUM for the marker method until a real overlay file exists (A6).
- Pitfalls: HIGH.

**Research date:** 2026-11-09
**Valid until:** until the Orca pin moves (any re-pin re-reads `orcad-browser-provider.ts`, the lock/daemon files and the build scripts); Phase 68's weekly re-pin job re-proves these through the rows above.
