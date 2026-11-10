# Phase 62: Overlay gate and PowerBrowser-run orcad - Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 22 new or modified
**Analogs found:** 21 / 22 (one partial)

All analog paths below are git-tracked (checked with `git ls-files`: jar.mn, moz.build, endpoint-allowlist.json, orca-run.mjs, pb-live-probe.mjs, regenerate-patches.sh, verify-orca-pin.mjs, toml.cjs, the verify scripts, build-orca.sh, apply-patches.sh). Line numbers are from this worktree. Facts about orcad behaviour, ports, lock files and the overlay derivations are in 62-RESEARCH.md and are not repeated here; this file only says what to copy from where.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `powerbrowser/shell/OrcaService.sys.mjs` (new) | service (supervisor) | event-driven, process lifecycle | `powerbrowser/shell/TheiaService.sys.mjs` | exact (role), with stdout/env/stop deviations |
| `powerbrowser/shell/OrcaEnv.sys.mjs` (new) | utility (pure) | transform | `scripts/lib/orca-run.mjs` (`orcadEnv`, `parseReady`, `redact`) | role-match; chrome-free |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (mod: `spawnProcessExact`, `listProcessTree`, `addNamedReapBlocker`) | boundary | request-response | `spawnProcess` (587), `addSidecarReapBlocker` (730), `readProcessStartTicks` (1021), `signalBarePid` (1061) | exact |
| `powerbrowser/INTERNAL-APIS.md` (mod: new rows) | doc/catalogue | n/a | rows at lines 66, 85, 96, 153 | exact |
| `powerbrowser/shell/jar.mn` (mod: 2 lines) | config | n/a | `jar.mn:29` TheiaService line | exact |
| `powerbrowser/shell/moz.build` (mod only if a new prefs file) | config | n/a | `JS_PREFERENCE_PP_FILES` block | exact |
| `powerbrowser/shell/powerbrowser-sidecar.js` or new `powerbrowser-orca.js` (mod/new: `powerbrowser.orca.port` 26768 and grace/backoff prefs) | config (prefs) | n/a | `powerbrowser-sidecar.js:17-26` | exact |
| `powerbrowser/shell/powerbrowser.js` (mod: chained start, diagnostics rows) | wiring | event-driven | `powerbrowser.js:365-380`, `:267-313` | exact |
| `powerbrowser/shell/components.conf` | none | n/a | Not touched (holds only the single-instance handler); do not edit | n/a |
| `powerbrowser/endpoint-allowlist.json` (mod: `.onorca.dev`) | config | n/a | row `powerbrowser.org` (line 127-131), `github.com` (133-137) | exact |
| `orca-overlay/seams.json`, `patches/010-*.patch`, `files/` (new) | config + patch | batch | `patches/*.patch` + `scripts/regenerate-patches.sh --upstream orca --patches orca-overlay/patches` | exact mechanism |
| `scripts/build-orca.sh` (mod: overlay hook after step 1) | build script | batch | `build-orca.sh:51` (`run_step fetch-verify`), `apply-patches.sh` | exact |
| `scripts/verify-orca-overlay.mjs` (new, + `--self-test`) | check | batch/derive-compare | `scripts/verify-orca-build-shape.mjs` | exact |
| `scripts/verify-orca-service.mjs` (new, + `--self-test`) | check (static) | derive-compare | `scripts/verify-crash-autosubmit-env.mjs` | exact |
| `scripts/verify-orca-hidden-electron.mjs` (new, + `--self-test`) | check (full + quick self-test) | request-response (spawn, observe) | `scripts/verify-orca-slotless-start.mjs` (+ `orca-run.mjs`) | role-match |
| `scripts/verify-orca-service-live.mjs` (new) | check (live) | event-driven | `scripts/verify-orca-slotless-start.mjs` + `scripts/lib/pb-relaunch.mjs`/`firefox-bidi.mjs` | role-match |
| `scripts/verify-orca-build-shape.mjs` (mod: modified set == seams) | check | derive-compare | itself, lines 128-139 | exact |
| `scripts/verify-platform.sh` (mod: rows) | registry | n/a | Orca block 3828-3863, full tier ~6415-6432 | exact |
| `inventory/brand-tokens.json` (mod: rows) | config | n/a | row `orca` lower (line 1023+) | exact (coordinator only) |
| `scripts/lib/orca-run.mjs` (optional mod: import `OrcaEnv`) | utility | transform | itself | exact |

## Pattern Assignments

### `powerbrowser/shell/OrcaService.sys.mjs` (service, event-driven)

**Analog:** `powerbrowser/shell/TheiaService.sys.mjs` (1651 lines; do not copy `_reapLeftover` helpers, they are private to that object).

**Boundary import** (line 16, copy byte for byte):
```js
const { PowerBrowserAPI } = ChromeUtils.importESModule("chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs");
```
Add the same style import for `OrcaEnv.sys.mjs` (`chrome://powerbrowser/content/OrcaEnv.sys.mjs`). `OrcaService` may use none of the forbidden tokens (`Services.`, `Cc[`, `Ci.`, `IOUtils`, `AppConstants`); every one goes through `PowerBrowserAPI`.

**start(): observer first, blocker once** (lines 257-274; register before any branch that can spawn; copy the "bound to a local" detail because `start-path-recovery` derives one inline quit-observer registration):
```js
try {
  this._quitObserverOff = PowerBrowserAPI.onQuitGranted(() => this.stop());
} catch (err) {
  this._pushLog(`Quit flush not registered: ${err && err.message ? err.message : err}`);
}
if (!this._reapBlockerAdded) {
  this._reapBlockerAdded = true;
  try {
    const reapBlocker = () => this.stopAndReap();
    PowerBrowserAPI.addSidecarReapBlocker(reapBlocker);   // OrcaService: addNamedReapBlocker("PowerBrowser: reap orcad", reapBlocker)
  } catch (err) {
    this._pushLog(`Reap blocker not registered: ${err && err.message ? err.message : err}`);
  }
}
```
Then `await PowerBrowserAPI.ensureDirectory(...)` in a guarded try (lines ~277-285 pattern, recoverable class). Also copy: `_started` re-entry guard set first (192-196), `_shuttingDown` (91-113), restart backoff 500 ms / 5000 ms cap (87-89) with own pref names.

**Reap leftover by identity** (lines 701-758; copy the shape, apply to both PB's state file and `orcad.lock`, and to the daemon pid):
```js
const record = await PowerBrowserAPI.readStateFile(path);
if (!record || typeof record.pid !== "number") return;
const alive = PowerBrowserAPI.signalBarePid(record.pid, 0);
...
const observedTicks = await PowerBrowserAPI.readProcessStartTicks(record.pid);
if (observedTicks === null || observedTicks !== record.startTicks) { /* recycled pid: never signal */ ... }
const SIGTERM = 15;
PowerBrowserAPI.signalBarePid(record.pid, SIGTERM);
const deadline = Date.now() + 3000;   // OrcaService: 16000 for orcad (its own deadline is 15 s)
while (stillAlive && Date.now() < deadline) { await PowerBrowserAPI.sleep(100); ... }
```
Deviation (P62-18): `orcad.lock` field is `linuxStartTicks`, PB's own record uses its own key; never delete orcad's lock or sockets; remove only PB's state file.

**Spawn** (TheiaService `_spawnAndGate` 817-1027, `PowerBrowserAPI.spawnProcess({command,args,environment})` at ~838-891): replace with `PowerBrowserAPI.spawnProcessExact(...)`; re-check `_shuttingDown` after spawn; race readiness against a startup timeout; write the state file after ready. Do NOT copy the stdin credential write (`writeStdinLine`): orcad takes none.

**Output pump deviation** (`_pumpOutput`, 1493-1571, mirrors every line to `_pushLog` and `PowerBrowserAPI.log`): do not copy for stdout. Read stdout with `PowerBrowserAPI.readPipeChunk`, accumulate in memory, call `OrcaEnv.parseReadyLine`, log nothing. stderr lines go to the ring buffer only through `OrcaEnv.redact`.

**stop()** (lines 389-466):
```js
if (this._shuttingDown) return;
this._shuttingDown = true;
if (this._proc && this._proc.exitCode == null) {
  const graceMs = PowerBrowserAPI.getIntPref("powerbrowser.sidecar.killGraceMs", 3000);
  try { void PowerBrowserAPI.killProcess(this._proc, graceMs).catch(() => {}); } catch { /* already exited */ }
}
```
Drop the `runQuitFlushSync` block (Theia-only). Use `powerbrowser.orca.killGraceMs` >= 16000. After orcad: `signalBarePid(daemonPid, 15)`, then `listProcessTree([daemonPid])` backstop, then remove the state file; remove the observer last.

**stopAndReap()** (lines 476-493; copy including "never rejects" and the loud timeout log, rename text to orcad).

**Node resolution** (`_resolveSidecar`, lines 570-574): mirror with the same `powerbrowser.sidecar.nodePath` pref and `<GreD>/node/bin/node` (`getAppDir`), then `pathSearch("node")`.

**Error handling:** unrecoverable class for `pinned_port_unavailable`, logged plus diagnostics rows; no user sentence (P62-13). Do not define a `USER_MESSAGE` table and do not call `window.powerbrowserShowError` (`shell-error-copy-no-internals` derives its surface from TheiaService only; re-run it).

---

### `powerbrowser/shell/OrcaEnv.sys.mjs` (utility, transform)

**Analog:** `scripts/lib/orca-run.mjs` (Node-only, so it cannot be imported by chrome; `OrcaEnv` is the chrome-and-Node shared form). No `ChromeUtils`, `Services`, `Cc`, `Ci` anywhere (boundary scan covers all of `powerbrowser/shell`).

**Fixed names already defined there** (line 77):
```js
export const ORCAD_ENV_NAMES = ['ORCA_USER_DATA', 'ORCA_USER_DATA_PATH', 'ORCA_VERSION', 'ORCA_TELEMETRY_DISABLED'];
```
Allowlist model: `orcadEnv` (lines 81-93, inherit-and-scrub, to be replaced by names-only allowlist) and `assertEnv` (95+) for the value checks.

**Ready-line parse** (lines 131-145; copy but return NO pairing fields, so `webClientUrl` and `secrets` are dropped):
```js
const line = stdoutText.split('\n').find((l) => l.startsWith('{') && l.includes('"orca_server_ready"'));
...
return { boundEndpoint: typeof r.boundEndpoint === 'string' ? r.boundEndpoint : null,
         nodeVersion: r.health?.nodeVersion ?? null,
         daemonPid: r.health?.terminalDaemon?.pid ?? null };
```
**redact** (lines 147-154, copy the three regex replacements verbatim):
```js
.replace(/#pairing=[^\s"'<>]*/g, `#${REDACTED}`)
.replace(/orca:\/\/pair\?[^\s"'<>]*/g, REDACTED)
.replace(/pair%3F[^\s"'<>]*/gi, REDACTED);
```
Argv shape (lines 175-178 of `startOrcad`): `[orcad.js, '--bind', '127.0.0.1', '--port', <N>, '--json', '--web-client-root', <root>]`; `buildOrcadArgs` must throw on port 0.

---

### `powerbrowser/shell/PowerBrowserAPI.sys.mjs` new methods (boundary)

**Placement caveat for the planner:** `export const PowerBrowserAPI = Object.freeze({` opens at line 396 and closes at line 4395; later exported objects (`PowerBrowserWebTabs` at 5993, etc.) are the "end-of-file section" the Append-only rule refers to (INTERNAL-APIS.md lines 26-28). OrcaService calls these as `PowerBrowserAPI.<name>` per RESEARCH, so insert the three methods as the last members before line 4395 (a mid-file insertion shifts every later catalogue line; `--fix` repairs the numbers) or put them in a new exported `Object.freeze` at the file end and import that; pick one and say so in the plan. Appending the methods at the end of the `PowerBrowserAPI` object keeps the existing rows' text valid.

**`spawnProcessExact` analog: `spawnProcess` (lines 587-595)**:
```js
spawnProcess({ command, args, environment }) {
  return lazy.Subprocess.call({
    command,
    arguments: args,
    environment,
    environmentAppend: true,
    stderr: "pipe",
  });
},
```
Copy, drop `environmentAppend`, add optional `workdir`. Do not edit `spawnProcess`.

**`addNamedReapBlocker` analog: `addSidecarReapBlocker` (lines 730-733)**:
```js
addSidecarReapBlocker(fn) {
  const { AsyncShutdown } = ChromeUtils.importESModule("resource://gre/modules/AsyncShutdown.sys.mjs");
  AsyncShutdown.quitApplicationGranted.addBlocker("PowerBrowser: reap sidecar", fn);
},
```
New method takes `name`. Leave the old one untouched (`verify-sidecar-reap-blocker.mjs` pins its name, row and line). Word the new INTERNAL-APIS row with "reap orcad", never "reap sidecar" (that check finds the row by the phrase; row 96 is the only match today).

**`listProcessTree` analog: `readProcessStartTicks` (lines 1021-1043)**: use `IOUtils.read(`/proc/${pid}/stat`, { maxBytes: 4096 })`, never `readUTF8` (procfs st_size is 0); parse after the LAST `)`:
```js
const bytes = await IOUtils.read(`/proc/${pid}/stat`, { maxBytes: 4096 });
const text = new TextDecoder().decode(bytes);
const afterComm = text.slice(text.lastIndexOf(")") + 2);
const fields = afterComm.split(" ");   // fields[0]=state, fields[1]=ppid, fields[19]=starttime
```
Add `IOUtils.getChildren("/proc")` for the walk. Wrap in try/catch returning the roots (the method contract is never to throw, as `readProcessStartTicks` and `signalBarePid` do). Non-Linux: return the roots (`signalBarePid` gates on `lazy.AppConstants.platform !== "linux"`, line ~1064).

**Catalogue rows** (`powerbrowser/INTERNAL-APIS.md`): append at the END of the Touchpoints table, one row per new forbidden-pattern occurrence, column order `| internal | file:line | method | why | bound |`. Copy the row-153 style for `IOUtils.read` (new line, method `listProcessTree`) and row-96 style for `AsyncShutdown...addBlocker` (method `addNamedReapBlocker`). Then run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` (never writes a row), `bash scripts/check-internals-boundary.sh --catalogue`, and `bash scripts/check-internals-boundary.sh`.

---

### `powerbrowser/shell/jar.mn`, `moz.build`, prefs (config)

**jar.mn** (line 29; copy the exact column format, add two lines after it):
```
   content/powerbrowser/TheiaService.sys.mjs    (TheiaService.sys.mjs)
   content/powerbrowser/OrcaService.sys.mjs     (OrcaService.sys.mjs)
   content/powerbrowser/OrcaEnv.sys.mjs         (OrcaEnv.sys.mjs)
```
`moz.build` lists `jar.mn` (`JAR_MANIFESTS += ["jar.mn"]`), not files, so it is untouched unless a new prefs file is added: then append to
```python
JS_PREFERENCE_PP_FILES += [
    "powerbrowser-sidecar.js",
]
```
**Prefs analog** (`powerbrowser-sidecar.js:17-26`; cheapest is to add lines to this file):
```js
pref("powerbrowser.sidecar.nodePath", "");
pref("powerbrowser.sidecar.killGraceMs", 3000);
pref("powerbrowser.sidecar.logBufferLines", 500);
```
New: `pref("powerbrowser.orca.port", 26768);` (P62-16, no manifest key), `powerbrowser.orca.killGraceMs` 16000, startup timeout, log lines. A new `.sys.mjs` needs `MOZCONFIG=../.mozconfig ./mach build faster` before live runs; add a quick derived clause "every `powerbrowser/shell/*.sys.mjs` appears in `jar.mn`, both directions" to `verify-orca-service.mjs`.

---

### `powerbrowser/shell/powerbrowser.js` (wiring)

**Analog:** `powerbrowser.js:365` and `:380`:
```js
const { TheiaService } = ChromeUtils.importESModule("chrome://powerbrowser/content/TheiaService.sys.mjs");
...
TheiaService.start(browserElement).catch(err => TheiaService.reportUnexpectedFailure(err));
```
Keep the `TheiaService.start(` text intact (read by `verify-branding-identity.mjs`, `verify-shell-error-contract.mjs`, `verify-start-path-recovery.mjs`); extend with `.finally(() => OrcaService.start().catch(err => OrcaService.reportUnexpectedFailure(err)))` as in RESEARCH lines 191-198. Diagnostics: add `...OrcaService.getDiagnosticRows()` to the `rows` array built around `powerbrowser.js:267-313` and leave the `POWERBROWSER_DIAGNOSTICS` sentinel object unchanged.

---

### `powerbrowser/endpoint-allowlist.json` (config)

**Analog rows** (lines 127-131, `user-initiated`, no `manifest` key unless the host is derived from `configuration.toml`):
```json
{
  "host": "powerbrowser.org",
  "disposition": "user-initiated",
  "reason": "UPD-33: click destinations only. ..."
},
```
New row: `{ "host": ".onorca.dev", "disposition": "user-initiated", "reason": "P62-05/P62-15: Orca pairing relay (D-23). ..." }`. Leading-dot suffix form is the matcher's convention (`scripts/lib/endpoint-verdict.mjs:17`, `.webview.localhost` precedent). This is the file `generated/endpoint-hosts.json` is built from; do not hand-edit the generated file, regenerate it (and run `verify-privacy-hosts`, `theia-endpoints`, `generated-byte-identity`).

---

### `orca-overlay/` + `scripts/build-orca.sh` hook (batch)

**Patch mechanism analogs** (all take `--upstream <dir> --patches <dir>`):
- `scripts/apply-patches.sh:31-42` argument parse; `:85-92` is the silent-no-op guard (`git hash-object` before/after per touched file). Refuses an empty patch dir: guard the call with `ls orca-overlay/patches/*.patch`.
- `scripts/regenerate-patches.sh` usage (line 37): `regenerate-patches.sh [--check | --self-test] [--upstream <dir>] [--patches <dir>]`. The seam patch is produced by editing `orca/src/main/orcad/orcad-browser-provider.ts` in the fetched tree, then `bash scripts/regenerate-patches.sh --upstream orca --patches orca-overlay/patches`; never hand-edit a hunk.
- `scripts/check-patch-surface.sh` guards `patches/` only; do not extend it, the overlay gate is its own script.

**build-orca.sh insertion point** (after line 51, `run_step fetch-verify bash "$REPO_ROOT/scripts/fetch-orca.sh"`, before step 2 "Shell entry"). Use the same helpers: `run_step <name> <cmd>` (lines 43-48), `fail "<msg>"` (line 38), and the `build-orca: ...` echo prefix. The step order in RESEARCH lines 282-287 (undeclared-modification refusal, checkout of declared seam paths, apply, copy `files/`, record copied list) is the spec; print `build-orca: overlay applied <path>` per item.

**seams.json shape:** RESEARCH lines 263-269. Read the manifest cap from `configuration.toml` through `scripts/lib/toml.cjs` the way `scripts/verify-orca-pin.mjs` does (copy its require/parse lines; do not regex the TOML). Per-seam changed-lines bound 20 (P62-17), cap 10 (D-16).

---

### `scripts/verify-orca-overlay.mjs` (check, derive-compare)

**Analog:** `scripts/verify-orca-build-shape.mjs`. Copy these structural elements:

**Header comment style** (lines 1-34): purpose, "Derived at check time, never hand-kept", Tier line, Usage block.
**Imports and constants** (lines 36-52):
```js
import { execFileSync } from 'node:child_process';
...
import { fileURLToPath } from 'node:url';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-build-shape';
```
**SKIP / render convention** (line 63+ `render`): `if (r.skip) return { code: 0, lines: [`${NAME}: SKIP -- ${r.skip}`] }`; failures `${NAME}: FAIL -- <what>` on stderr; tracked-only steps always run, steps needing `orca/` SKIP with a printed line.
**Self-test shape** (lines 150-226): mkdtemp fixture git repo (`git -c user.name=fixture -c user.email=fixture@invalid commit`), clean control first, then a `plants` array of `{ name, naming, apply }` where each plant must go red and the output must contain `naming`; each plant is undone and the re-run must be green (line 219). Fixture names use a `.fixture-` prefix so a pass proves derivation.
**Entry-point guard and arg handling** (lines 231-247): `isEntryPoint` via `realpathSync`, unknown argument prints usage and `process.exit(2)`.

Plants required by CONTEXT P62-10/P62-14/P62-17/P62-20: whole-file replacement, deleted-file patch, undeclared patched path, orphan `seams.json` row, count over cap, recorded blob drift, edited `index` line, over-20-line seam, `files/` shadow (exact, case-only, under an upstream file, equal to an upstream directory), missing marker literal, marker owned by another file; built-row fixtures: marker absent, marker only in `node_modules`, unclassified extension, web-only green.

---

### `scripts/verify-orca-build-shape.mjs` (mod, the `orca-build-shape` rule)

**Edit target** lines 128-139 (currently red on any porcelain line):
```js
const status = execFileSync('git', ['-C', orcaRoot, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
for (const line of status.split('\n').filter(Boolean)) { modified++; fails.push(`modified tracked file in orca/: ${line.trim()}`); }
```
Change to set equality against `orca-overlay/seams.json` paths (last whitespace token of each line; `M  path` is the staged `--3way` form). Extra modified keeps the current message; declared-but-unmodified adds `seam not applied: <path>`. At zero seams behaviour is unchanged. Add two plants to its self-test (existing plant list at ~189-215, e.g. the existing "modified tracked file" plant; copy its `plantFile`/`naming` shape) and update the header comment item d. Run `orca-build-shape-self-test` and `orca-slotless-start-self-test` after (orca-run.mjs imports `walk` from this file, line ~231 comment).

---

### `scripts/verify-orca-service.mjs` (static, derive-compare)

**Analog:** `scripts/verify-crash-autosubmit-env.mjs` (210 lines, `--quick`, text reads, `NAME` constant, derived name then source-shape assertions, `--self-test` with plants). Copy: header with numbered steps and "Limit" paragraph; the `REPO_ROOT`/`NAME` lines (37-40); structural source reads of `PowerBrowserAPI.sys.mjs` (it matches `clearEnv(<param>)` as exactly `Services.env.set(<param>, "")` by regex). For this check the derived facts are: the env allowlist constant in `OrcaEnv.sys.mjs` is the one `OrcaService` imports; no `port 0`/non-loopback bind in `buildOrcadArgs`; `jar.mn` has both files; the endpoint row exists; the pref default is in range and not in the ephemeral range; no stdout line reaches the log (sentinel plant: feed a fixture ready line containing a sentinel code and require it absent from the ring buffer).

---

### `scripts/verify-orca-hidden-electron.mjs` and `verify-orca-service-live.mjs`

**Analog:** `scripts/verify-orca-slotless-start.mjs` (377 lines): header derivation list (lines 1-50), `ensurePbNode`, `installedOrcaPaths` (SKIP when an installed Orca exists), `startOrcad`, `stopOrcad`, `descendants`, `redact` from `scripts/lib/orca-run.mjs` (exports at lines 45, 68, 131, 147, 175, 201, 255, 275). The quick self-test follows the same fixture-with-synthetic-names pattern as `verify-orca-build-shape.mjs`.

**Live helpers to reuse** (not to rewrite):
- `scripts/lib/pb-relaunch.mjs`: `makeProfile(extraPrefs)` (249), `withShell(profile, fn, { capabilities })` (277), `pollFor(fn, timeoutMs, what)` (126), `REPO_ROOT` (27).
- `scripts/lib/pb-live-probe.mjs`: `withProbeShell(fn, opts)` (51), `inChrome(app, body)` (186).
- `scripts/lib/firefox-bidi.mjs`: `launchedBrowserPids()` (50), `FIREFOX_BIN` (44).
Live rows run under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` and set `extraPrefs: { "powerbrowser.sidecar.nodePath": <ensurePbNode()>, "powerbrowser.orca.port": <free port> }`.

Detectors for the hidden-launch check, the instrument-proof order (stock run must trip both orcad-emitted detectors before the PB run's absence assertion counts) and the quit/reap fixtures are specified in RESEARCH Pitfalls 2-5 and the Validation table; follow CLAUDE.md verification rule 1.

---

### `scripts/verify-platform.sh` (registry rows)

**Quick rows**, append after `licence-allowlist-self-test` (line 3863), in the same comment-then-rows style:
```bash
    # NEW (62-xx, ...): <what is derived, what is planted>
    "licence-allowlist|node $REPO_ROOT/scripts/verify-licence-allowlist.mjs"
    "licence-allowlist-self-test|node $REPO_ROOT/scripts/verify-licence-allowlist.mjs --self-test"
```
New labels: `orca-overlay`, `orca-overlay-self-test`, `orca-service`, `orca-service-self-test`, `orca-hidden-electron-self-test`. **Full rows** go inside the `if [ "$QUICK" -eq 0 ]` block after `orca-slotless-start` (the last entry, before the closing `)`; the existing line is `"orca-slotless-start|node $REPO_ROOT/scripts/verify-orca-slotless-start.mjs"`), indented six spaces: `orca-overlay-built`, `orca-hidden-electron`, `orca-service-live`. Printed SKIP + exit 0 is the SKIP mechanism; only exit codes map to PASS/FAIL. Two lanes append at the same anchors: give each lane block its own leading `# NEW (62-0N, ...)` comment so the coordinator can order them.

---

### `inventory/brand-tokens.json` (config, coordinator only)

**Analog:** the `orca` lower row (line 1023+): `{ "token", "case_form", "class": "coincidental", "target", "expected_count", "expected_files": [...], "only_in": [...], "reason" }`. Eleven Orca rows exist. Lanes must not hand-edit counts: after merge run `git add -A <new files>` then `node scripts/scan-brand-residue.mjs --report <path>.md` (markdown output), update `expected_count`, `expected_files` and `only_in` for every row a new file adds hits to, and re-run to exit 0. Patch files quoting upstream Orca source add many hits; an in-word join needs a `literal` row. Never add `orca-overlay/` to an exclude list (P62-11).

## Shared Patterns

### Boundary rule (hard rule 2)
**Source:** `scripts/check-internals-boundary.sh` (default scans all of `powerbrowser/shell`; `--self-test`, `--catalogue`), `powerbrowser/INTERNAL-APIS.md` append-only rule (lines 26-30).
**Apply to:** `OrcaService.sys.mjs`, `OrcaEnv.sys.mjs`, `PowerBrowserAPI.sys.mjs`, `INTERNAL-APIS.md`. Order of edits: write methods, `--fix`, add rows, run all three boundary modes plus `ng-040-internals-catalogue-lines` and `sidecar-reap-blocker`.

### Derive-and-compare checks with plants
**Source:** `scripts/verify-orca-build-shape.mjs` (self-test structure) and `scripts/verify-crash-autosubmit-env.mjs`.
**Apply to:** every new `verify-orca-*.mjs`. Each has `--self-test`; each plant names the drift; `exit 2` with a usage line on an unknown argument; absence assertions only after the detector has fired in a control.

### Credential hygiene
**Source:** `scripts/lib/orca-run.mjs:147-154` (`redact`), `:131-145` (`parseReady`).
**Apply to:** `OrcaService` (stderr only, stdout parse-only), `OrcaEnv`, every script printing orcad output.

### Process identity before signalling
**Source:** `TheiaService.sys.mjs:701-758` using `PowerBrowserAPI.signalBarePid` (1061) and `readProcessStartTicks` (1021).
**Apply to:** reap-before-spawn, `stop()` of the daemon, the respawn path.

### Stage before the brand scan
**Source:** CLAUDE.md. `node scripts/scan-brand-residue.mjs` iterates `git ls-files`; new files must be staged first.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| exact-environment spawn plus `/proc` process-tree walk inside the chrome boundary | boundary method | process listing | No existing method lists a process tree; `readProcessStartTicks` and `IOUtils.getChildren` are the building blocks (partial). Use RESEARCH lines 218-224. |
| `orca-overlay/files/` marker-literal check (OVL-05 built row) | check | derive-compare over build output | No existing check reads a minified bundle; copy the walk/SKIP structure of `verify-orca-build-shape.mjs` and use the RESEARCH marker rule. |

## Metadata

**Analog search scope:** `powerbrowser/shell/`, `powerbrowser/INTERNAL-APIS.md`, `powerbrowser/endpoint-allowlist.json`, `scripts/`, `scripts/lib/`, `inventory/brand-tokens.json`.
**Files read:** about 14 (large files by targeted ranges: TheiaService 10-20, 255-285, 389-420, 476-493, 701-758; PowerBrowserAPI 575-640, 712-740, 1015-1085, 420-432).
**Pattern extraction date:** 2026-11-09
