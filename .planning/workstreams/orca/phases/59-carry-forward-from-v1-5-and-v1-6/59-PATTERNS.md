# Phase 59: Carry-forward from v1.5 and v1.6 - Pattern Map

**Mapped:** 2026-11-08
**Files analyzed:** 14 groups
**Analogs found:** 14 / 14 (all analog paths verified git-tracked)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `scripts/verify-crash-autosubmit-env.mjs` (new) | verify script | transform (text reads) | `scripts/verify-crash-autosubmit-lock.mjs` | exact |
| `scripts/verify-platform.sh` (2 rows) | registry | config | rows at lines 3802-3805 | exact |
| `scripts/verify-repo-controls.mjs` (token input) | verify script | request-response (gh api) | itself: `ghGet` 67-79, `safeGetter` 85-104 | exact |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` `clearEnv` | boundary touchpoint | request-response | `getEnv` at 421-424 | exact |
| `powerbrowser/INTERNAL-APIS.md` row | catalogue | doc | `Services.env.get` row at line 80 | exact |
| 41-04 / 47-04 SUMMARY (new), 42-04 / 43-05 / 48-05 (append) | doc | n/a | `deploy/phases/42-community-surface-and-release-documentation-a/42-04-SUMMARY.md` | exact |
| WINDOWS 34, 36 (`verify-customize-inert.mjs`, `check_start_failure_shows_error`) | harness | file-I/O | `TheiaService.sys.mjs` `_resolveConfigDir` 615-624 | role |
| WINDOWS 27 (`chrome-bar-widget.tsx` `openHistoryMenu`) | component | event-driven | same file `onFindKeyDown` ~1532 | role |
| WINDOWS 41 (`side-panel-top-tabs.ts`) | component | event-driven | itself (62 lines) | exact |
| WINDOWS 28, 37, 38, 39, 40, 42, 43 (`scripts/verify-*-live.mjs`) | harness | request-response | sibling live harnesses; fix in place | role |
| Coordinator re-date helper (WINDOWS.md) | tooling | CRUD | `gsd_run windows fixed <id>`; `broken-windows.cjs` | exact |

## Pattern Assignments

### `scripts/verify-crash-autosubmit-env.mjs` (verify script)

**Analog:** `scripts/verify-crash-autosubmit-lock.mjs` (163 lines). Copy the whole skeleton.

**Header and arg parsing** (lines 1-2, 33-47): shebang, header comment (what is derived, honestly --quick), then:
```js
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-crash-autosubmit-lock';   // use verify-crash-autosubmit-env
const SELF_REL = 'scripts/verify-crash-autosubmit-lock.mjs';
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
}
```
**Read helper / injectable reads** (lines 54-60): `readText(root, rel)` returns null if missing; `runChecks(root, overrides = {})` uses `overrides.read ?? (rel => readText(root, rel))` and returns `{ failures, ...derived }`. Failure strings must contain the drifted file's relative path and a marker word, and never `REPO_ROOT`.

**PASS line** (112): `${NAME}: PASS -- <what holds> (derived from <file>)`. FAIL: `${NAME}: FAIL -- N problem(s) ...` then each failure indented two spaces.

**Self-test shape** (lines 115-160): run baseline first (red baseline => `--self-test FAIL -- the unmodified tree is already red`); `swap(file, text)` builds a `read` override; plants table `[name, file, marker, { read }]`; assert the plant changed the text (`planted no fault`), then require a failure containing both `file` and `marker`; final `--self-test PASS -- N planted faults went red naming the drifted file, with the unmodified tree green first`. Needs six plants per RESEARCH 57-08 (call removed, call moved after other work, different name, non-empty value, `config.rs` key renamed, `env_bool` treats any set value true). Derive `AUTO_SUBMIT` and the `env_bool` body from `upstream/toolkit/crashreporter/client/app/src/config.rs` (177, 679-681) at check time, no literal list.

**Main** (lines 105-112, 163): `if (args.includes('--self-test')) return selfTest();` then `process.exit(main())`.

### `scripts/verify-platform.sh` registry rows

**Analog:** lines 3797-3805. Array entries are `"label|command"` strings with a comment block above each explaining what is derived and the plants:
```bash
    "crash-autosubmit-lock|node $REPO_ROOT/scripts/verify-crash-autosubmit-lock.mjs"
    # Green first, then six plants (...), each red naming the drifted file.
    "crash-autosubmit-lock-self-test|node $REPO_ROOT/scripts/verify-crash-autosubmit-lock.mjs --self-test"
```
Append `crash-autosubmit-env` and `-self-test` adjacent; one `--quick` text check, no build. Never a sibling driver (CLAUDE.md). `withdraw` rows at 5221/5227 show the same pair shape.

### `scripts/verify-repo-controls.mjs` token input

**Analog (in place):**
```js
export function ghGet(path, exec = execFileSync) {            // 67
    out = exec('gh', ['api', '-H', API_VERSION_HEADER, path],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
...
function safeGetter(get) {                                       // 85
    const cache = new Map();
    return (path) => { if (cache.has(path)) return cache.get(path); ... r = get(path); ...
```
No script reads `REPO_CONTROLS_TOKEN_*` or `GH_TOKEN` today (grep over `verify-repo-controls.mjs`/`apply-repo-controls.mjs` finds no `process.env` token read), so this is new. Pattern to apply: add the token as a THIRD param (`ghGet(path, exec, token)`) or options object, because the self-test calls `ghGet(path, exec)` (about 1297-1323); pass `{ ...process.env, GH_TOKEN: token }` as `env` in that single `exec` call only; thread through `safeGetter` as `get(path, { token })` with cache key still `path`; add a `runChecks` `env` override defaulting to `process.env`; `<SLUG>` = slug upper-cased, `-` to `_`. Never print the token; `why:` strings keep `NEXT_AUTH` style ("Next step: ..."). Cover all five unreadable installations (slack, claude, powerbrowser-bot, powerbrowser-clock, cloudflare-workers-and-pages), not only two.

### `PowerBrowserAPI.sys.mjs` `clearEnv` and `INTERNAL-APIS.md` row

**Analog:** `getEnv`, lines 421-424:
```js
  /** Reads an environment variable. */
  getEnv(name) {
    return Services.env.get(name);
  },
```
Add `clearEnv(name) { Services.env.set(name, ""); }` directly after, same doc-comment style. Handler: `PowerBrowserSingleInstanceHandler` at ~4454, `handle(cmdLine) { try {`; call `PowerBrowserAPI.clearEnv("MOZ_CRASHREPORTER_AUTO_SUBMIT")` as the first statement. Do not call `Services.env` anywhere else (boundary rule).

**Catalogue row format** (INTERNAL-APIS.md:80):
```
| `Services.env.get` | `PowerBrowserAPI.sys.mjs:423` | `getEnv` | Reads an environment variable used to help resolve sidecar paths. | None — host-controlled, feeds only `spawnProcess`'s environment, no network input. |
```
New row: `Services.env.set`, the new line, `clearEnv`, purpose, and a trust note (constant name, no input). Then run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` (rewrites stale `<file>:<line>` to the nearest satisfying line; never writes a row), and `bash scripts/check-internals-boundary.sh`, `--catalogue`, `--self-test`. Re-run `--fix` after every merge touching the file (59-03 may also touch it). Needs `-purgecaches` for any live check.

### Deploy SUMMARY files

**Analog:** `.planning/workstreams/deploy/phases/42-community-surface-and-release-documentation-a/42-04-SUMMARY.md`. Frontmatter (lines 1-25):
```yaml
---
phase: 42-community-surface-and-release-documentation-a
plan: 04
subsystem: docs
tags: [...]
requires:
  - phase: 42-01..42-03
    provides: ...
provides:
  - ...
affects: [...]
status: partial
actuals:
  tokens: 1400
  tasks: 1
  commits: 2
plan_head_before: <sha>
plan_head_after: <sha>
key-files:
  modified: [docs/RELEASING.md]
key-decisions:
  - "..."
requirements-completed: []
---
```
Body: `# Phase NN Plan NN: <title> Summary`, "Deviations from Plan", "Not executed", "Self-Check". New for 41-04 and 47-04 (no SUMMARY exists); append a dated section for 42-04, 43-05, 48-05 and fill 48-05's "Operator record" table rows (`none yet | open`). Keep `requirements-completed: []` and `status: partial` unless live results close them. Other `status: partial` examples: `43-05-SUMMARY.md`, `49-02-SUMMARY.md`.

### WINDOWS 34 and 36 (config dir)

**Root cause and sibling pattern:** `TheiaService.sys.mjs:615-624`:
```js
  _resolveConfigDir() {
    const profileDir = PowerBrowserAPI.getProfileDir();
    if (profileDir) { return `${profileDir}/powerbrowser-theia`; }
    const xdg = PowerBrowserAPI.getEnv("XDG_CONFIG_HOME");
    const home = PowerBrowserAPI.getEnv("HOME");
    const base = xdg || `${home}/.config`;
    return `${base}/powerbrowser`;
  },
```
`scripts/verify-customize-inert.mjs:63-64` writes `join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'powerbrowser')`, which a profile-dir launch never reads. Fix in the harness: derive the dir from the launch's profile (`<profile>/powerbrowser-theia`), as `scripts/lib/firefox-bidi.mjs` does with its temp profile (`mkdtemp(... 'powerbrowser-firefox-bidi-')`, `applyProfileOverrides`). Same cause for 36 (`check_start_failure_shows_error`, `verify-platform.sh:1539-1690`): the plant at `$poison_home/powerbrowser` must poison `<profile>/powerbrowser-theia` instead. Do not change the product resolver.

### WINDOWS 27 (`chrome-bar-widget.tsx`)

`openHistoryMenu` (1074-1111) restores focus on hide: `onHide: () => setTimeout(() => { if (!chosen) { button.focus(); } })`. Escape handling sibling: `onFindKeyDown` (~1532): `if (e.key === 'Escape') { e.preventDefault(); this.closeFind(true); return; }`, and downloads at 1718. Put focus in the menu on open, or skip the refocus when the hide was caused by the release. No registry exclusion exists for 27; the proof is `PB_REAL_INPUT=1 PB_LIVE_HEADED=1 node scripts/verify-nav-keys-live.mjs --scenario long-press`.

### WINDOWS 41 (`side-panel-top-tabs.ts`)

`bar.orientation = 'horizontal'` in `createSideBar` with a `shortcut:` comment. Failure site `theia/node_modules/@theia/core/lib/browser/shell/tab-bars.js:1179` queries `.theia-additional-views-menu` and dereferences `offsetHeight`. Fix inside the extension (subclass/guard), never edit `@theia/core` (hard rule 1; `scripts/diff-theia-core.sh`).

### WINDOWS 28, 37, 38, 39, 40, 42, 43 (harness scripts)

Fix in place at the sites listed in RESEARCH §59-03 (28 `crashNavigate` 1930-1941; 37 re-resolve `org` inside the settle loop at 464; 38 trace `diCall(... 'ChromeBarSuggestionService')` against `chrome-bar-places-suggestions.ts:29-60`; 39 plant at 1336; 40 ~1293-1335; 42 `waitFor` at 58/69; 43 1365-1371). Proof: flakes green 3 runs in a row via `--only <label>`, plus the `-self-test` row, then `--quick`. Respect the "never assert on absence of a log line" rule.

### Coordinator re-date helper (WINDOWS.md)

**Analog:** `gsd_run windows fixed <id>` (lib `~/.claude/gsd-core/bin/lib/broken-windows.cjs`, manages `.planning/WINDOWS.md`; JSON block with `status`). Binding: `verify-platform.sh:6499` `GATE_KNOWN_OPEN_EXCLUSIONS`, rows `label|ledger_id|reason` (e.g. `"ng074-ci-green-on-main|31|live owner state not established ..."`); `ledger_entry_is_open <id>` requires `status === "open"`, else `FAIL (exclusion no longer applies)`. Lanes list closed ids in SUMMARY; coordinator runs `gsd_run windows fixed <id>` at merge, then re-runs the `--only` rows. No new helper script is needed beyond that verb.

## Shared Patterns

- **Verify scripts:** `NAME`, `SELF_REL`, exit 2 on bad args, `Next step:` suffix on every failure, relative paths only in failure text, injectable `read`/`exec`, `--self-test` with green baseline and named plants.
- **Registry:** append rows only; comment above each row; `-self-test` row adjacent.
- **Boundary:** Firefox internals only via `PowerBrowserAPI.sys.mjs` with a catalogue row; line numbers kept by `--fix`.
- **Gate:** stage new files before `node scripts/scan-brand-residue.mjs`; run `scripts/verify-platform.sh --quick`.

## No Analog Found

| File | Reason |
|---|---|
| Token-from-env read in `verify-repo-controls.mjs` | No existing script reads per-slug tokens from env; spec is in `41-04-PLAN.md` Task 3 (343-345). |
| `/etc/nixos` snippet (59-02c) | Not visible to agents; deliver a snippet file, see RESEARCH. |

## Metadata

**Analog search scope:** `scripts/`, `powerbrowser/`, `theia/extensions/chrome-bar`, deploy workstream phases, `~/.claude/gsd-core/bin`
**Pattern extraction date:** 2026-11-08
