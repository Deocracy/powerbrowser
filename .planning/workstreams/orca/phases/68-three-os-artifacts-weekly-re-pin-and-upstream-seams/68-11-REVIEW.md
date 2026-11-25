---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
reviewed: 2026-11-16T14:39:57Z
depth: deep
scope: "git diff e4509877..32f47718, non-.planning paths (plan 68-11: 4c265724, d3ca3f23; Scratch HOME: ac5aa95b, 32f47718)"
files_reviewed: 35
files_reviewed_list:
  - bundled-extensions/claude-agent-sdk/README.md
  - inventory/brand-tokens.json
  - scripts/lib/firefox-bidi.mjs
  - scripts/lib/orca-browser-live.mjs
  - scripts/lib/orca-pane-harness.mjs
  - scripts/lib/orca-run.mjs
  - scripts/lib/orca-tabs-live.mjs
  - scripts/verify-branding-identity.mjs
  - scripts/verify-bundled-extensions.mjs
  - scripts/verify-install-matrix.mjs
  - scripts/verify-live-scratch-home.mjs
  - scripts/verify-ng-072-policies-webextension.mjs
  - scripts/verify-no-remote-agent-port-live.mjs
  - scripts/verify-orca-agent-hooks.mjs
  - scripts/verify-orca-agent-status-live.mjs
  - scripts/verify-orca-browser-host-bundle.mjs
  - scripts/verify-orca-browser-snapshot-live.mjs
  - scripts/verify-orca-credential-store-live.mjs
  - scripts/verify-orca-failure-page-live.mjs
  - scripts/verify-orca-hidden-electron.mjs
  - scripts/verify-orca-relaunch-restore-live.mjs
  - scripts/verify-orca-service-live.mjs
  - scripts/verify-orca-workspace-live.mjs
  - scripts/verify-platform.sh
  - scripts/verify-shell-error-copy.mjs
  - scripts/verify-sql-store-absence.mjs
  - scripts/verify-sql-store-soak.mjs
  - theia/extensions/bundled-extensions/package.json
  - theia/extensions/bundled-extensions/src/browser/bundled-extensions-frontend-module.ts
  - theia/extensions/bundled-extensions/src/browser/reinstall-command.ts
  - theia/extensions/bundled-extensions/src/common/bundled-extensions-copy.ts
  - theia/extensions/bundled-extensions/src/common/bundled-extensions-protocol.ts
  - theia/extensions/bundled-extensions/src/node/bundled-extensions-backend-module.ts
  - theia/extensions/bundled-extensions/src/node/bundled-extensions-seed.ts
  - theia/extensions/bundled-extensions/src/node/bundled-extensions-service.ts
findings:
  critical: 2
  warning: 8
  info: 4
  total: 14
status: issues_found
---

# Phase 68 (plan 68-11 + Scratch HOME): Code Review Report

**Reviewed:** 2026-11-16T14:39:57Z
**Depth:** deep
**Files Reviewed:** 35
**Status:** issues_found

## Summary

Two changes were reviewed: (1) the 68-11 reinstall affordance for the bundled Claude extension and its
check legs, and (2) the per-run scratch HOME for every live launch, including `seedClaudeLogin`.

Static rows run (allowed by the brief): `bundled-extensions`, `bundled-extensions-seed`,
`bundled-extensions-self-test`, `shell-error-copy-no-internals`, `live-scratch-home-self-test`, plus
`node scripts/verify-live-scratch-home.mjs` directly. All PASS. No live row, build or full gate was run.

The Theia side holds up. No `@theia/*` file is edited. Ids are restricted to shipped folders.
`PluginServer.install` with a `local-dir:` user entry calls `markAsInstalled`, which clears Theia's
in-memory uninstalled set (checked in `@theia/plugin-ext` 1.76.0, `plugin-deployer-handler-impl.js:136-177`).
An uninstall fires `onDidDeploy` through `onDidChangeUninstalledPlugins` (`plugin-service.js:50-59`), so the
comment in the frontend is correct.

The weak point is the credential handling in the scratch HOME. The refresh token it copies is left on disk
when the process gets SIGTERM, which is how `verify-platform.sh` itself stops a check. A refresh inside the
scratch copy is detected but cannot be undone: the only valid rotated token is then deleted. Three checks
added in scope stay green on plants that break the promise they exist for. Each case was demonstrated
against the real check functions with a scratch script.

## Critical Issues

### CR-01: The scratch HOME and its copied OAuth refresh token survive SIGTERM/SIGHUP, and nothing ever removes them

**File:** `scripts/lib/firefox-bidi.mjs:84`, `scripts/lib/firefox-bidi.mjs:147-152`; trigger at `scripts/verify-platform.sh:136,176`
**Issue:** `liveHome()` removes the folder only from `process.once('exit', ...)`. Node does not emit
`exit` on a default-disposition signal. This was checked: `node -e "process.on('exit',()=>console.error('exit fired')); process.kill(process.pid,'SIGTERM')"`
prints nothing and exits 143. No live row in scope installs a SIGTERM or SIGHUP handler. Only `lib/ng-a-live.mjs` does, and it is out of scope.
`withFirefoxPage` handles SIGINT only. On Ctrl-C or a timeout, `verify-platform.sh` runs `trap 'cleanup; exit 130' INT TERM`
and `cleanup()` sends `kill -- -$CURRENT_CHECK_PID`, which is SIGTERM to the setsid group. Every interrupted
`orca-tabs-live` or `orca-agent-status-live` run therefore leaves
`<repo>/.mozbuild/pb-live-profiles/pb-home-XXXXXX/.claude/.credentials.json` behind. That file holds the
owner's live `accessToken` and `refreshToken`. The `.claude.json` beside it holds `oauthAccount` and `userID`.
The refresh-changed exit check (`:147-152`) is skipped too, so a rotation in that run goes unreported.
Nothing sweeps old `pb-home-*` folders: there is no reaper in `liveHome()`, `liveProfileDir()` or
`verify-platform.sh`. The copies therefore pile up inside a worktree, outside `~/.claude`, where any later
tar, rsync, worktree copy or archive of the checkout carries them along.
**Fix:** Remove the folder synchronously on the fatal signals, then die with the original signal. Also reap
the folders of dead runs when a new one is made:
```js
export function liveHome() {
    if (scratchHome) return scratchHome;
    mkdirSync(LIVE_PROFILE_BASE, { recursive: true });
    for (const n of readdirSync(LIVE_PROFILE_BASE).filter(n => n.startsWith('pb-home-'))) {   // reap dead runs
        const pid = Number(readFileSync(join(LIVE_PROFILE_BASE, n, '.pid'), 'utf8').trim() || 0) || 0;
        let alive = false; try { if (pid) { process.kill(pid, 0); alive = true; } } catch {}
        if (!alive) rmSync(join(LIVE_PROFILE_BASE, n), { recursive: true, force: true });
    }
    const home = mkdtempSync(join(LIVE_PROFILE_BASE, 'pb-home-'));
    writeFileSync(join(home, '.pid'), String(process.pid), { mode: 0o600 });
    const remove = () => rmSync(home, { recursive: true, force: true });
    process.once('exit', remove);
    for (const sig of ['SIGTERM', 'SIGHUP']) process.once(sig, () => { remove(); process.kill(process.pid, sig); });
    return (scratchHome = home);
}
```
The `.pid` read needs a try/catch so that a folder without one is treated as dead. Leave SIGINT alone: the
CR-03 design in `withFirefoxPage` needs it to unwind naturally, and a natural exit fires `exit`. Add a
`live-scratch-home` plant that removes the signal listener and must go red.

### CR-02: A token refresh inside the scratch HOME destroys the only valid refresh token. The exit check reports it but cannot prevent it.

**File:** `scripts/lib/firefox-bidi.mjs:131-155` (seed at `:142`, check at `:148-152`, deletion at `:84`)
**Issue:** The seed writes the whole `claudeAiOauth`, including `refreshToken`, into the scratch copy. The
docblock states the failure itself: a refresh rotates the refresh token and leaves the real
`~/.claude/.credentials.json` holding a spent one. The guard is a single margin test at seed time,
`minutesLeft >= 60`. After that:
- A process that runs longer than `minutesLeft - (claude's own pre-expiry refresh window)` refreshes inside
  the copy. For example, a token with 61 minutes left plus an `orca-tabs-live` run of about an hour.
- When the refresh happens, the prepended exit listener prints a FAIL and sets the exit code. The
  `liveHome` listener then runs immediately and `rmSync`s the folder holding the newly rotated, still valid
  refresh token. The owner's real sign-in is left with a spent token, which is exactly what the ruling
  forbids, and the one credential that could fix it has been deleted.
- Concurrency: the owner's own `claude` sessions (including the one driving this work) can rotate the real
  token during a run. The scratch copy then holds a spent refresh token. If it is replayed, an OAuth server
  that detects refresh-token reuse may revoke the whole grant, and the real sign-in with it. Whether
  Anthropic's server does this was not verified, but the design gives it the opportunity.
**Fix:** Do not give the scratch copy anything it can refresh with. Seed the access token only:
```js
const { refreshToken, ...accessOnly } = oauth;           // never seeded: claude cannot rotate the owner's sign-in
writeFileSync(creds, JSON.stringify({ claudeAiOauth: accessOnly }), { mode: 0o600 });
```
Keep the 60-minute margin, so the access token outlives the run. The exit listener then has nothing to
detect, and its job becomes asserting that the copy still has no `refreshToken`. Before relying on it,
confirm in one live run that `claude` accepts a credential without `refreshToken` and fails closed at expiry.
If it does not, the fallback is a compare-and-swap write-back in the exit listener, before `liveHome`'s
removal: if the real file's `refreshToken` still equals the seeded one, atomically write the scratch
`claudeAiOauth` into the real file, keeping its other keys and mode 0600. Add a `live-scratch-home` plant
that seeds `refreshToken` and must go red.

## Warnings

### WR-01: live-scratch-home cannot see several launch forms, yet its PASS line claims every live launch

**File:** `scripts/verify-live-scratch-home.mjs:33-34,79-95,141-150`; uncovered launches at `scripts/verify-platform.sh:406,572` (`start_shell`, `start_shell_display`) and `scripts/verify-endpoints.sh:329`
**Issue:** The derivation scans only `scripts/**/*.mjs`, only `spawn|spawnSync|execFile|execFileSync`, and
only single-quoted marks in the first two arguments, resolving a bare identifier to its `const`
definition. Fed to `launchesIn()` directly, each of these returned `[]` (no launch found, so green):
- `spawn(FIREFOX_BIN, ["--headless", "--profile", dir], …)` (double quotes)
- `const args = ['--headless']; args.push('--profile', dir); spawn(FIREFOX_BIN, args, …)`
- ``execSync(`${FIREFOX_BIN} --headless --profile ${dir}`)``
- `spawn(nodeBin, [orcadMain, '--port', '0'], { env: process.env })` (orcad through a variable main path)

The `.sh` launchers run PowerBrowser with the real `HOME`; only `XDG_CONFIG_HOME` is overridden. Their temp
profiles keep orcad off today, so this is not a `~/.orca` write now. But the row's PASS text ("every live
launch") is stronger than what the row derives. Of these gaps, the self-test plants only the forms it
already matches.
**Fix:** Widen `LAUNCH_MARK` to both quote styles and add `FIREFOX_BIN|binPath|dist/bin/powerbrowser`
(for a pushed `--profile`). Add `exec|execSync|fork` to `CALL_RE`. Scan `scripts/*.sh` for
`"$bin" … --profile` lines that are not prefixed with `HOME=`. Add one plant for each form listed above.
`verify-endpoints.sh`, which deliberately uses the real `HOME`, should be an explicit named exemption,
not a blind spot.

### WR-02: liveEnv relocates HOME and XDG only, so CLAUDE_CONFIG_DIR and CODEX_HOME still point the live run at the real config

**File:** `scripts/lib/firefox-bidi.mjs:64,101-110`; `scripts/lib/orca-run.mjs:82-93`; callers `scripts/lib/orca-pane-harness.mjs:165`, `scripts/verify-orca-browser-host-bundle.mjs:399`, `scripts/verify-orca-credential-store-live.mjs:146`, `scripts/verify-orca-packaged-live.mjs:229`, `scripts/verify-orca-slotless-start.mjs:192`
**Issue:** `orcadEnv(process.env, …)` strips only `ORCA_*` and Node-steering names. `liveEnv` then moves
HOME and XDG and passes everything else through. If `CLAUDE_CONFIG_DIR=/home/<user>/.claude` or
`CODEX_HOME` is set (the owner's global setup reads `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`), a directly
launched orcad and any agent under it read and write the real Claude or Codex config.
`orca/src/main/ai-vault/session-scanner-roots.ts:26` and `orca/src/main/claude-accounts/runtime-paths.ts:14`
read `process.env.CLAUDE_CONFIG_DIR`. `assertScratchHome` does not look at these names, so the runtime
guard stays silent. Orcad launched by PowerBrowser is safe, because `buildOrcadEnv` allowlists.
**Fix:** In `liveEnv`, delete the config-relocating names `CLAUDE_CONFIG_DIR`, `CODEX_HOME` and
`GEMINI_HOME` when their value is `inRealHome`. In `assertScratchHome`, refuse any variable whose value is
an absolute path inside a real home, except an allowlist (`PATH`, `XAUTHORITY`). That is derive-and-compare
rather than a name list. Add a plant with `CLAUDE_CONFIG_DIR: join(homedir(), '.claude')`.

### WR-03: The seeded home and the launched HOME can be different folders

**File:** `scripts/lib/firefox-bidi.mjs:103,139`; `scripts/verify-orca-agent-status-live.mjs:145`
**Issue:** `liveEnv` keeps a `HOME` that is already outside the real home. `seedClaudeLogin()` always seeds
`liveHome()`, and `encodedProjectDir` reads from `liveHome()`. Consider a container or CI job whose `HOME`
differs from the passwd home, or a harness started under some other scratch `HOME`. PowerBrowser, orcad and
claude then run with that `HOME`, unseeded, while the row looks for session records under `liveHome()`.
The row goes red for the wrong reason, or claude stops at onboarding.
**Fix:** Seed into the HOME the launch will actually get, and read from the same place:
`const home = liveEnv().HOME;` in `seedClaudeLogin`, and `join(liveEnv().HOME, '.claude', 'projects', …)` in
`encodedProjectDir`.

### WR-04: The harness derives the bridge folder from its own environment, not the launch environment

**File:** `scripts/lib/orca-tabs-live.mjs:276`, `scripts/verify-orca-relaunch-restore-live.mjs:275`, `scripts/verify-orca-failure-page-live.mjs:306`
**Issue:** `bridgeDirFor(dataRoot, (n) => process.env[n], 'linux')` reads the harness's real `HOME`.
`aliasPathFor` (`powerbrowser/shell/OrcaEnv.sys.mjs:262-274`) falls back to `<HOME>/.cache` when
`XDG_RUNTIME_DIR` is unset, for example over ssh or in a minimal CI session. PowerBrowser then writes the
offer under `<scratch HOME>/.cache/pb-orca-*-bridge` while the harness reads `<real HOME>/.cache/...`, so
the offer is never found. `removeOrcaPathsFor` already uses `liveEnv()` for this reason (`firefox-bidi.mjs:162`).
These three sites were not updated to match.
**Fix:** `OrcaEnv.bridgeDirFor(dataRoot, (n) => liveEnv()[n], 'linux')` at all three sites.

### WR-05: checkReinstall stays green on plants that break both of its promises

**File:** `scripts/verify-bundled-extensions.mjs:184-209`; subject `theia/extensions/bundled-extensions/src/browser/reinstall-command.ts:31-47`
**Issue:** Each of these was run through `checkReinstall(…)` and returned `[]` (green):
- `isVisible: () => !this.absent.has(CLAUDE_EXTENSION_ID)` and the same change to `isEnabled`. The command
  is then offered only while the extension is present. The gate regex is unanchored and its deny list
  covers `||` and `true` but not `!`.
- `onStart() { this.cmds.executeCommand(REINSTALL_CLAUDE.id); … }`. This is an automatic reinstall at
  every start, which undoes the user's uninstall. Only `.reinstall(` call sites are attributed, so running
  the command programmatically is not seen.
- `this.absent = new Set([CLAUDE_EXTENSION_ID])` in `refresh()`. The command is then always offered. The
  check never ties `this.absent` to `service.absent()`.
**Fix:** Anchor the gate: `^this\.absent\.has\(CLAUDE_EXTENSION_ID\)$` on the trimmed body. Require every
assignment to `this.absent` to be `new Set(await this.service.absent())` or `new Set()`. Go red on any
`executeCommand(` whose argument is `REINSTALL_CLAUDE.id` or the literal command id, in any `src/**` file.
Add the three cases above as plants.

### WR-06: An install failure after the copy hides the command, so the "Try the command again" step does not exist

**File:** `theia/extensions/bundled-extensions/src/node/bundled-extensions-service.ts:52-60`; copy at `src/common/bundled-extensions-copy.ts:15`
**Issue:** `doReinstall` copies the folder and stores the record before `pluginServer.install(...)`. If
`install` throws, which it does on zero successful deployments (`plugin-server-impl.js:26-33`), the user
sees `failed`: "Try the command again, or restart PowerBrowser…". But `refresh()` now finds the folder
present, `absent()` no longer lists the id, and the command is hidden from both the palette and Help.
The first next step is not an affordance that exists on screen, which breaks the CLAUDE.md copy rule. The
record also claims a reinstall that did not happen.
**Fix:** Undo the copy when deployment fails, so a retry is really available:
```ts
try {
    await this.pluginServer.install(FileUri.create(deploymentDir).withScheme('local-dir').toString(), PluginType.User);
} catch (err) {
    await fs.promises.rm(path.join(deploymentDir, id), { recursive: true, force: true });
    throw err;
}
record[id] = outcome.version;
await this.settings.set(SEED_RECORD_KEY, JSON.stringify(record));
```
Write the record after the install, and add a `--seed` scenario that stubs a throwing install.

### WR-07: The reinstall copy's literal-only scan misses non-literal notification text

**File:** `scripts/verify-shell-error-copy.mjs:1585-1587`
**Issue:** The leg flags a notification only when its first argument is a string literal.
`this.messages.error(String(err))`, `this.messages.error(err.message)` or `this.messages.error(text)`
passes. That is the exact path by which a raw exception message reaches the user, which
`shell-error-copy-no-internals` exists to prevent. The current tree is clean, but the check cannot go red
on this drift.
**Fix:** Turn it into a positive rule. Every `.info|.warn|.error(` first argument in the command file must
match `^REINSTALL_MESSAGES\.\w+$`, and anything else is red. Add a plant using `String(err)`.

### WR-08: README tells users to use the Help menu, which shows the entry only in Coding mode

**File:** `bundled-extensions/claude-agent-sdk/README.md:12`
**Issue:** The README says "choose Reinstall the Claude Extension from the Help menu or the command
palette". 68-11-SUMMARY (commit f6d291a0) records that Theia's menu bar is hidden outside Coding mode, so
in Browsing, Organising and Orca modes the Help route does not exist. The instruction is wrong in three
of four modes. This is already an open owner decision and is listed here only so it is not lost.
**Fix:** Either add the row to the Application menu's Help submenu (the `chrome-bar-widget.tsx`
hand-built menu, which is PowerBrowser code and not Theia core), or change the README to "from the command
palette (or Help, in Coding mode)".

## Info

### IN-01: The pane harness still writes a link into the real ~/.cache

**File:** `scripts/lib/orca-pane-harness.mjs:42,165-166`
**Issue:** `PROFILE_ALIAS = join(homedir(), '.cache', 'pb-orca-pane-harness')` is orcad's
`ORCA_USER_DATA`, so a live run creates an entry in the real home. The data itself lives under
`.mozbuild`. This is outside the ruling's literal list (`~/.orca`, `~/.config/orca`, `~/.claude`), but it
is a real-home write by a live harness.
**Fix:** Put the alias under `liveEnv().HOME + '/.cache'`, or under the repo-local scratch base.

### IN-02: `claude --version` probe runs with the real HOME

**File:** `scripts/lib/orca-tabs-live.mjs:125`
**Issue:** `realClaudeOn` runs `execFileSync('claude', ['--version'], { env: { PATH, HOME: <real> } })`.
It is read-only in practice, but it is a launch of the real agent outside `liveEnv`. live-scratch-home
does not see it, because `claude` is not a launch mark.
**Fix:** `env: liveEnv({ PATH: path })`.

### IN-03: removeOrcaPathsFor creates a scratch HOME in processes that never launched anything

**File:** `scripts/lib/firefox-bidi.mjs:162`
**Issue:** `liveEnv()` calls `liveHome()`, which creates a folder and an exit listener just to compute a
path. It is harmless today. With the CR-01 fix it would also install signal handlers in such processes.
**Fix:** Compute the path from `scratchHome ?? process.env.HOME`-derived values without creating anything,
or accept it knowingly.

### IN-04: Each seedClaudeLogin call adds its own exit comparison

**File:** `scripts/lib/firefox-bidi.mjs:147-152`
**Issue:** A second `seedClaudeLogin()` in the same process overwrites the credentials with the then-current
real token, and the first listener still compares against the first token. If the owner's real claude
refreshed in between, the run reports a false FAIL. Today there is one real-agent session per process
(`verify-orca-tabs-live.mjs:435`, `verify-orca-agent-status-live.mjs:253`), so this cannot happen yet.
**Fix:** Seed once per process: return early when `scratchHome` already holds a seeded `.credentials.json`.
CR-02's access-only seed removes the comparison entirely.

---

_Reviewed: 2026-11-16T14:39:57Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
