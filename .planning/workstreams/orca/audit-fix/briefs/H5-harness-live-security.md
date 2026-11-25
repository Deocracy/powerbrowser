# Fix brief: H5-harness-live-security

Lane: harness. Items: 15. Files this group owns: `scripts/verify-orca-credential-store-live.mjs`, `scripts/verify-orca-browser-agent-live.mjs`, `scripts/verify-orca-browser-snapshot-live.mjs`, `scripts/verify-orca-agent-mark-live.mjs`, `scripts/verify-orca-agent-status-live.mjs`, `scripts/verify-no-remote-agent-port-live.mjs`, `scripts/verify-sidecar-origin-gate-live.mjs`, `scripts/verify-orca-failure-page-live.mjs`, `scripts/verify-orca-service-live.mjs`, `scripts/verify-orca-packaged-live.mjs`, `scripts/lib/orca-browser-live.mjs`, `scripts/lib/firefox-bidi.mjs`.

Item IDs: harness-live-security-01; harness-driver-02; harness-live-security-02; harness-live-security-05; harness-live-security-06; harness-live-security-03; harness-live-security-04; harness-live-security-13; harness-live-security-09; harness-live-security-07; harness-live-security-08; harness-live-security-14; harness-live-security-10; harness-live-security-12; harness-live-security-11.

## harness-live-security-01: Decoy clause (f) of orca-browser-agent-live cannot go red: liveEnv replaces the decoy HOME, so PB's orcad never sees ~/.local/bin/orca-ide

- **Severity:** high
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/firefox-bidi.mjs:194`

**What is wrong.** Clause (f) (P66-29) is meant to prove that PB's orcad does not launch an installed Orca. The check plants a decoy at <scratch HOME>/.local/bin/orca-ide and sets process.env.HOME to that folder before the launch. Every launch then passes through liveEnv(). liveEnv() treats realHomes() as the real home, and realHomes() includes os.homedir(), which on POSIX returns the current $HOME. At launch time $HOME is the decoy folder, so inRealHome(decoyHome) is true and HOME is replaced with liveHome() (.mozbuild/pb-live-profiles/pb-home-*). That folder has no decoy. PowerBrowser, orcad (HOME is on ORCAD_ENV_ALLOWLIST) and the CLI all run without the decoy. markerPresent can only be false. No assertion compares orcad's /proc environ HOME with the decoy folder, so nothing catches this.

**Scenario.** A regression drops ORCAD_HIDDEN_ELECTRON_SWITCH from buildOrcadEnv, so PB's orcad would start an installed Orca desktop. In orca-browser-agent-live the stock half still passes in its own process tree (its HOME is under XDG_RUNTIME_DIR, so it is kept). The PB half runs with HOME=pb-home-*, which holds no orca-ide, so no PROFILE_RECORD_FILE appears and clause (f) prints 'no decoy'. The row PASSes.

**Preconditions.** None beyond running the row. It happens on every run that reaches clause (f) with the stock half passing.

**Evidence.** scripts/lib/orca-browser-live.mjs:181 `if (home) process.env.HOME = home;`
scripts/lib/firefox-bidi.mjs:67-71 `return [...new Set([homedir(), pw]...` (homedir() reads $HOME)
scripts/lib/firefox-bidi.mjs:73-76 `return homes.some(h => within(p, h)) && !within(p, HARNESS_SCRATCH);`
scripts/lib/firefox-bidi.mjs:194 `if (inRealHome(out.HOME)) out.HOME = liveHome();`
scripts/lib/firefox-bidi.mjs:698 spawn `{ env: liveEnv(env) }` with env = process.env
scripts/verify-orca-browser-agent-live.mjs:820-824 decoy home made with mkdtempSync(tmpdir()) and passed as withBrowserSession({ home })
scripts/verify-orca-browser-agent-live.mjs:920 `markerPresent: roots.some((r) => existsSync(join(r, recordFile)))`; verdictDecoy (228-236) has no HOME positive read.

**Suggested fix.** Compute realHomes() once at module load from the passwd entry and the original $HOME, before any row changes process.env.HOME. Alternatively, have withBrowserSession pass the decoy HOME through an explicit env override that liveEnv keeps. In clause (f), add a positive read: /proc/<orcad>/environ HOME must equal the decoy folder, or the clause is 'detector blind'. Add a self-test plant for that.

**Verifier (CONFIRMED, high).** I traced the whole path myself.

1. The decoy setup is as described. liveRun (scripts/verify-orca-browser-agent-live.mjs:820-822) makes `home = mkdtempSync(join(tmpdir(), 'pb-agent-home-'))`, puts the decoy at home/.local/bin/orca-ide, and calls withBrowserSession({ log, home }).

2. withBrowserSession sets `process.env.HOME = home` (scripts/lib/orca-browser-live.mjs:181) before withOrcaTabsSession -> withProbeShell -> withFirefoxPage launches PowerBrowser. withFirefoxPage builds `env` from process.env and spawns with `{ env: liveEnv(env) }` (scripts/lib/firefox-bidi.mjs:686-698).

3. liveEnv (firefox-bidi.mjs:192-203) runs `if (inRealHome(out.HOME)) out.HOME = liveHome();`. inRealHome (73-77) defaults to `homes = realHomes()`, and realHomes (67-71) includes Node's os.homedir(). On POSIX, os.homedir() reads the current $HOME, which is now the decoy folder. So `within(decoy, decoy)` is true. The decoy is under tmpdir(), not under <repo>/.mozbuild, so the HARNESS_SCRATCH exemption does not apply. HOME becomes liveHome(), a fresh .mozbuild/pb-live-profiles/pb-home-* folder (144-166) with no .local/bin/orca-ide. The CLI is affected the same way: its cliEnv takes HOME from process.env.HOME (orca-browser-live.mjs:192), and liveEnv(cliEnv) at line 197 replaces it too. So PowerBrowser, and the orcad it spawns, never see the decoy.

4. Nothing checks this. verdictDecoy (verify-orca-browser-agent-live.mjs:228-236) looks at stock.pass, createOk, the title, the quiet window and markerPresent. markerPresent (920) only checks whether the record file exists under orcad's data roots. Nothing reads orcad's real HOME or confirms that the decoy was on its search path. The self-test only plants `markerPresent: true` into the observation object (1078), so it tests the verdict function, not the live wiring. The stock half runs in a separate process tree (hiddenElectronRun), so it still passes.

5. Result: if the hidden-Electron switch regresses, PB's orcad launches no decoy, because there is no decoy in its HOME. Clause (f) prints 'no decoy' and the row passes.

This is a security regression check that cannot go red in its intended case, so high under the rubric. Nothing I found in DECISIONS.md accepts this. The scratch-HOME ruling explains why liveEnv exists, but it does not exempt this check. *Checked at:* scripts/lib/firefox-bidi.mjs:194 (HOME replaced because realHomes() at :67-71 includes homedir(), which equals the decoy set at scripts/lib/orca-browser-live.mjs:181); scripts/verify-orca-browser-agent-live.mjs:920 and :228-236 (markerPresent is the only decoy read, with no positive HOME check)

## harness-driver-02: Lane-merge SKIP conditions stay in the shared prerequisites, so removing or renaming the agent allowlist turns the agent live rows into SKIP rather than FAIL

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/orca-browser-live.mjs:56`

**What is wrong.** prerequisites() was written for a period when lanes p66-01..p66-03 were unmerged. After the merge it still treats the absence of the subject under test as a SKIP: no `const AGENT_METHODS =` in PowerBrowserAPI.sys.mjs, no theia/extensions/orca-browser, no pb-browser-host.js. orca-tabs-live's prerequisites do the same for theia/extensions/orca-panes. On a merged and built tree, a refactor that renames, moves or deletes AGENT_METHODS (the agent ability allowlist) or the orca-browser extension makes orca-browser-agent-live and orca-agent-mark-live print SKIP and exit 0. The driver counts that as PASS. The quick rows orca-browser-abilities and orca-browser-tab-scope still cover an empty AGENT_METHODS, so this is defence in depth rather than total loss.

**Scenario.** A change rewrites `const AGENT_METHODS = Object.freeze([` (PowerBrowserAPI.sys.mjs:11113) as `const AGENT_METHODS = new Set(...)` declared through a helper, or as `let`, or moves it to another module. The regex `/\bconst AGENT_METHODS\s*=/` no longer matches. orca-browser-agent-live then prints 'SKIP -- lane p66-03 not merged' and the gate records PASS, so the live proof of tab scope, the refusals and the agent container is never run.

**Evidence.** scripts/lib/orca-browser-live.mjs:55-57: `try { api = readFileSync(join(root, API_REL), 'utf8'); } catch {} if (!/\bconst AGENT_METHODS\s*=/.test(api)) return { skip: `lane p66-03 not merged (no AGENT_METHODS in ${API_REL})`, fail: null }; if (!existsSync(join(root, ORCA_BROWSER_REL))) return { skip: `lane p66-02 not merged ...` }`; scripts/lib/orca-tabs-live.mjs:91 `if (needPanes && !existsSync(join(root, ORCA_PANES_REL))) return { skip: 'lane p64-02 not merged ...' }`; verify-orca-browser-agent-live.mjs:1001 `if (pre.skip) { console.log(`${NAME}: SKIP -- ${pre.skip}`); return 0; }`.

**Suggested fix.** Now that the lanes are merged, make an absent AGENT_METHODS, an absent orca-browser or orca-panes extension, or an absent host bundle a FAIL in the shared prerequisites. Keep SKIP only for a missing build artefact (and see the driver SKIP finding).

**Verifier (CONFIRMED, medium).** scripts/lib/orca-browser-live.mjs:53-63 prerequisites() returns skip when `/\bconst AGENT_METHODS\s*=/` fails to match PowerBrowserAPI.sys.mjs, when theia/extensions/orca-browser is absent, or when pb-browser-host.js is absent. orca-tabs-live.mjs:91 does the same for orca-panes. verify-orca-browser-agent-live.mjs:1001 prints SKIP and returns 0. verify-orca-agent-mark-live.mjs:114 uses the same prerequisites. The driver loop (verify-platform.sh:6976-6990) judges only the exit status, so SKIP is recorded as PASS. Nothing in the driver turns a SKIP line red for these rows. The quick row orca-browser-abilities.mjs:212 uses a looser regex (`\bAGENT_METHODS\s*=`, accepting Object.freeze or new Set), and tab-scope checks the exported value. So a rename or deletion turns those quick rows red. A change from `const` to `let`, or a declaration through a helper, still passes the quick rows while the live security proof is skipped and counted PASS. This is a concrete defence-in-depth gap, not a total loss of coverage. *Checked at:* scripts/lib/orca-browser-live.mjs:57; scripts/verify-orca-browser-agent-live.mjs:1001; scripts/verify-platform.sh:6976-6990 (exit status only). The partial guard is scripts/verify-orca-browser-abilities.mjs:212,252, which goes red on an absent or empty AGENT_METHODS, but its regex does not require `const`.

## harness-live-security-02: orca-browser-agent-live and orca-agent-mark-live exit 0 (counted PASS) when tree markers or build outputs are missing, and when the decoy clause skips

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/orca-browser-live.mjs:56`

**What is wrong.** The driver counts a row as PASS on exit status 0 alone (verify-platform.sh:6978-6986). prerequisites() returns a SKIP, and both rows then exit 0, when any of these hold: a regex `const AGENT_METHODS =` does not match PowerBrowserAPI.sys.mjs; theia/extensions/orca-browser does not exist; the built host bundle orca/out/web/assets/pb-panes/pb-browser-host.js is missing; or any tabsPrerequisites condition holds (no orca-panes dir, no Theia build, no orcad.js, no panes bundle). These are no longer lane-merge states. A rename of the constant, or an Orca build that fails to emit the host bundle, turns the agent-ability rows green. Clause (f) has a separate skip: when an installed Orca exists at /usr/bin, /usr/local/bin or /opt/Orca, the row prints 'PASS -- ... (f) SKIP' and exits 0. The self-test even asserts that a skipped (f) yields no failures.

**Scenario.** A refactor renames AGENT_METHODS to AGENT_COMMANDS in PowerBrowserAPI.sys.mjs, or scripts/build-orca.sh stops copying pb-browser-host.js. The full run or --gate runs orca-browser-agent-live and orca-agent-mark-live. Both print 'SKIP -- lane p66-03 not merged' or 'lane p66-01 not merged or Orca not built' and exit 0. The summary shows PASS. The checks covering tab scope, container isolation, downloads, protocols, clipboard and the agent mark do not run.

**Preconditions.** A rename of AGENT_METHODS or of the extension folder, a missing host bundle (see the failure-page finding), or a system-wide Orca install for clause (f).

**Evidence.** scripts/lib/orca-browser-live.mjs:56 `if (!/\bconst AGENT_METHODS\s*=/.test(api)) return { skip: ... }`
:57 `if (!existsSync(join(root, ORCA_BROWSER_REL))) return { skip: ...`
:60 `if (!existsSync(join(root, HOST_BUNDLE_REL))) return { skip: ...`
scripts/verify-orca-browser-agent-live.mjs:1001 `if (pre.skip) { console.log(`${NAME}: SKIP -- ${pre.skip}`); return 0; }`
scripts/verify-orca-agent-mark-live.mjs:115 same
scripts/verify-orca-browser-agent-live.mjs:911 `if (stock.skip) obs.f = { skip: stock.skip };` and 1012-1016 exit 0 with '(f) SKIP'
scripts/verify-orca-hidden-electron.mjs:225 skip when an installed Orca exists
scripts/verify-platform.sh:6978 `wait "$CURRENT_CHECK_PID" || row_ok=0`

**Suggested fix.** Remove the lane-merge skips, since the lanes are merged. When a merged-tree marker or build output is missing, return FAIL with a next step. Give a skip a distinct exit status (for example 77) and make the driver record it as SKIP, not PASS, so --gate requires an exclusion entry. When the decoy stock half skips, report clause (f) as FAIL or as a distinct non-PASS state.

**Verifier (CONFIRMED, medium).** I traced each step myself.

1. prerequisites() in scripts/lib/orca-browser-live.mjs:53-64 returns a skip in four cases: the regex /\bconst AGENT_METHODS\s*=/ does not match, theia/extensions/orca-browser is absent, the Firefox binary is absent, or orca/out/web/assets/pb-panes/pb-browser-host.js is absent. It then defers to orca-tabs-live.mjs's prerequisites(), which also skips when orca-panes, the Theia build, orcad.js or the panes bundle is missing.
2. verify-orca-browser-agent-live.mjs:1001 and verify-orca-agent-mark-live.mjs:115 print SKIP and return 0 when that happens.
3. verify-platform.sh:6976-6986 decides a row only by its wait status, plus the leak leg. Nothing after line 7000 treats SKIP output differently, and --gate adds only the WINDOWS.md exclusions. So a skipped row shows as "PASS" in the summary. Both rows are registered at verify-platform.sh:6894-6895.
4. Clause (f): at line 911, when the stock half skipped (verify-orca-hidden-electron.mjs:225 skips if an installed Orca exists at the derived system paths), obs.f is set to a skip. The row then prints the SKIP line and still exits 0 with "(f) SKIP" in its PASS line. The self-test at line 1177 checks that a skipped (f) gives zero failures and exactly one named skip.

All of this matches the finding.

Two points lower the severity from high.

First, the AGENT_METHODS rename scenario does not turn the whole run green. Two rows in the --quick set (which starts at verify-platform.sh:3659) fail on it:
- orca-browser-abilities (registered at 4060) fails at verify-orca-browser-abilities.mjs:252 when AGENT_METHODS is missing while the tab-scope file exists.
- orca-browser-tab-scope (registered at 4079) reports a broken instrument at verify-orca-browser-tab-scope.mjs:387.
The two live rows still show PASS, but the run as a whole goes red.

Second, a host bundle that fails to build does not produce this state. build-orca.sh and build-orca-browser-host.sh both run under set -euo pipefail (build-orca.sh:39, build-orca-browser-host.sh:22), so a failed build stops the script. The state appears only if step 10 is removed from build-orca.sh or its output stops being written. In that case orca-browser-host-bundle also skips with exit 0 (header lines 35-36), so the path to an all-green run is real.

The checks can go red when their prerequisites hold. That rules out "a security check that cannot go red". This is a harness gap: a named SKIP counts as PASS in full and --gate runs, and nothing requires these rows to actually run on a tree that is merged and built. That is a gap with a concrete path (removing build step 10), which puts it at medium. The installed-Orca skip of (f) is deliberate and printed by name, but it still counts as a pass on hosts with a system-wide Orca install. No such install exists on this host. *Checked at:* scripts/lib/orca-browser-live.mjs:56-63 (skip conditions); scripts/verify-orca-browser-agent-live.mjs:1001 and :911/:1015 (exit 0, (f) SKIP inside PASS); scripts/verify-orca-agent-mark-live.mjs:115; scripts/verify-platform.sh:6978-6986 (exit status alone decides PASS). Partial mitigation of the rename case: scripts/verify-orca-browser-abilities.mjs:252 and scripts/verify-orca-browser-tab-scope.mjs:387 (quick rows at verify-platform.sh:4060/4079). The host bundle is not otherwise guarded: scripts/verify-orca-browser-host-bundle.mjs:35 also skips.

## harness-live-security-05: Seven live rows claim to run 'under flock pb-live.lock' but neither they nor the driver take the lock

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-browser-agent-live.mjs:1184`

**What is wrong.** verify-orca-credential-store-live, verify-sidecar-origin-gate-live and verify-orca-failure-page-live re-exec themselves under flock <git common dir>/pb-live.lock. Seven assigned rows do not, although their headers say they run under it: browser-agent-live, agent-mark-live, browser-snapshot-live, agent-status-live, no-remote-agent-port-live, service-live and packaged-live. The registry invokes them as plain `node ...`, and verify-platform.sh contains no flock call. Concurrent sessions on one checkout are a documented condition of this project. Without the lock these rows interleave with the locking rows. Two cases: failure-page's host-bundle rename (the finding above) and its SIGSTOP of an orcad. The rows also wipe fixed scratch paths: snapshot-live runs `rmSync(work)` on .mozbuild/orca-browser-snapshot-live, status-live removes the fixed .mozbuild/orca-agent-status-live/repo, and service-live removes .mozbuild/orca-service-live/repo. A second run of the same row deletes the first run's repository while orcad is using it.

**Scenario.** Session A runs `--only orca-failure-page-live` (locked). Session B runs `--only orca-browser-agent-live` at the same time. B is not blocked. If B starts during A's induction 5, B SKIPs and passes. Or two sessions run orca-agent-status-live together: the second removes the shared repo folder under the first's live claude, and the first run fails or measures the wrong session records.

**Preconditions.** Two live runs on the same checkout at the same time.

**Evidence.** grep: no spawnSync('flock'/PB_LIVE_LOCK_HELD in verify-orca-browser-agent-live.mjs, verify-orca-agent-mark-live.mjs, verify-orca-browser-snapshot-live.mjs, verify-orca-agent-status-live.mjs, verify-no-remote-agent-port-live.mjs, verify-orca-service-live.mjs, verify-orca-packaged-live.mjs; none in verify-platform.sh or scripts/lib.
scripts/verify-orca-agent-status-live.mjs:45-46 'Run under the live lock'
scripts/verify-orca-browser-snapshot-live.mjs:335 `rmSync(work, { recursive: true, force: true });`
scripts/verify-orca-agent-status-live.mjs:215 fixed `repo` path, 317 `rmSync(repo, ...)`
scripts/verify-platform.sh:6894-6895 `"orca-browser-agent-live|node $REPO_ROOT/scripts/verify-orca-browser-agent-live.mjs"`

**Suggested fix.** Take the lock in one place: a shared helper in scripts/lib that every live row calls at entry (re-exec under flock unless PB_LIVE_LOCK_HELD=1), or have verify-platform.sh wrap every full-tier live row in flock. Use mkdtemp scratch repositories instead of fixed paths.

**Verifier (CONFIRMED, medium).** A grep for flock and PB_LIVE_LOCK_HELD finds the re-exec only in credential-store-live (293-297), failure-page-live (539-543), sidecar-origin-gate-live (36-39) and landing-logo-live. browser-agent-live, agent-mark-live, browser-snapshot-live, agent-status-live, no-remote-agent-port-live, service-live and packaged-live mention flock only in header comments. Every flock occurrence in verify-platform.sh is a comment, and the registry rows are plain `node ...` (6766, 6777, 6791, 6877, 6884, 6894, 6895). Fixed scratch paths are confirmed: browser-snapshot-live runs `rmSync(work, recursive)` on .mozbuild/orca-browser-snapshot-live. agent-status-live uses the fixed repo path `join(work,'repo')` and removes it in its finally. service-live removes .mozbuild/orca-service-live/repo at line 296. Two concurrent unlocked runs therefore interfere. The only bar is the stated precondition of two concurrent sessions, which project memory documents as a real condition. *Checked at:* No guard: `grep -n flock scripts/verify-platform.sh | grep -v '#'` is empty; scripts/verify-orca-agent-status-live.mjs finally `rmSync(repo, { recursive: true, force: true })`; scripts/verify-orca-service-live.mjs:295-296

## harness-live-security-06: Clauses (h), (i) and (e) of orca-browser-agent-live turn a failed CLI read into 'not listed' or 'not visible', which passes

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-browser-agent-live.mjs:395`

**What is wrong.** listIds() and cookieNames() return [] when the CLI call fails (r.ok false). Clause (h), user close (A7): listedAfter becomes false on the first failed `tab list`, and the clause passes. Clause (i), reload: oldPages is read through listIds before the reload. If that call fails, oldPages is [] and oldListed stays [], so the 'old pages still listed' assertion checks nothing. Clause (e), container: userVisible comes from a second `cookie get` on the agent page. If that call fails, the user cookie counts as not visible. The earlier ownRead positive read used a different call. These clauses guard tab scope and container isolation: a closed or reloaded tab must not remain addressable, and an agent must not read the user's cookies.

**Scenario.** After the reload in (i), orcad answers `tab list --worktree W` with runtime_error, for example because the host session is mid re-attach. oldPages=[] (or now=[] on every poll), oldListed=[], and verdictReload reports no old pages. In (h), a stale page that is still listed passes whenever `tab list` fails at that moment. In (e), if the agent's second cookie get is refused with an error, userVisible=false and the clause passes.

**Preconditions.** An orcad or CLI error at the moment of the read. A regression that fails the read and leaves the page listed passes.

**Evidence.** scripts/verify-orca-browser-agent-live.mjs:395 `const listIds = (r) => (r.ok ? (r.result?.tabs ?? []).map((t) => t.browserPageId) : []);`
:396 `const cookieNames = (r) => (r.ok ? ... : []);`
:938 `for (let i = 0; i < 20 && listedAfter; i++) { ... listedAfter = listIds(await ctx.cli('tab', 'list', '--worktree', W)).includes(page); }`
:969 `const oldPages = listIds(await ctx.cli('tab', 'list', '--worktree', W));`
:975 `oldListed = oldPages.filter((p) => now.includes(p));`
:882 `userVisible: cookieNames(await ctx.cli('cookie', 'get', '--page', page)).includes('pbuser')`

**Suggested fix.** Record the CLI outcome alongside the list. Make a failed `tab list` or `cookie get` red ('instrument failed'). Require oldPages to be non-empty and to contain the (a)/(j) page ids before the reload. Require the user-close poll to have seen the page listed once before the close. Add self-test plants for each case.

**Verifier (CONFIRMED, medium).** At line 395, listIds maps a failed CLI result (r.ok false) to [], and cookieNames at 396 does the same. Clause (h), line 937-938: the loop stops at the first failed `tab list`, listedAfter becomes false, and verdictUserClose (248-251) passes. Clause (i): oldPages (969) comes from listIds. If that call fails, oldListed starts as [] and the loop never runs. If any later poll returns [] from an error, oldListed becomes []. verdictReload (253-259) checks only oldListed.length and has no 'oldPages was read' positive control. Clause (e): userVisible (882) is a separate cookie get. A failure counts as not visible, and verdictContainer (182-186) passes, because ownRead is an earlier, independent call. No caller validates r.ok for these reads. The only runtime element is the CLI error itself, which is the stated precondition, not an unresolved step in the code path. *Checked at:* scripts/verify-orca-browser-agent-live.mjs:395-396, 882, 937-938, 969-975; verdictReload/verdictUserClose/verdictContainer have no read-succeeded control

## harness-live-security-03: Other live rows exit 0 on SKIP and the driver counts them PASS (credential store, no remote port, service, failure page, snapshot, agent status)

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-credential-store-live.mjs:120`

**What is wrong.** Apart from the known agent-status sign-in case, these exit-0 SKIP paths exist in the assigned rows. verify-orca-credential-store-live skips with no binary, no orcad.js, or no theia/node_modules/typescript; the last is plausible when PB_FIREFOX_BIN points at another checkout. verify-no-remote-agent-port-live skips the live row, and its --self-test skips the live half but prints PASS, both with no binary or orcad. verify-orca-service-live and verify-orca-failure-page-live skip with no binary or Orca build; failure-page also skips when the orca-failure-copy.ts path moves. verify-orca-browser-snapshot-live skips with no binary, orcad or fixture manifest. The quick row orca-snapshot-fixtures skips without orca/package.json, which is every CI job that does not fetch orca/. verify-orca-agent-status-live skips with no claude on PATH, and with any seedClaudeLogin refusal: no sign-in, an API-key setup, or under 60 min to expiry. All of these print SKIP and exit 0, and verify-platform.sh records PASS. Three of these rows guard security requirements: the credential store (RUN-09), no remote agent port (D-11) and the failure classes.

**Scenario.** A developer runs `scripts/verify-platform.sh --gate` from a worktree whose theia/node_modules is not installed, with PB_FIREFOX_BIN pointing at the main checkout's binary. orca-credential-store-live prints 'SKIP -- theia/node_modules/typescript is not installed' and the summary shows 'orca-credential-store-live: PASS'. The plaintext-override and temporary-profile refusals are never exercised. In CI without orca/, orca-snapshot-fixtures is always PASS.

**Preconditions.** The named precondition holds at run time: no typescript, no claude on PATH, a sign-in near expiry, no orca/ in CI, and so on.

**Evidence.** scripts/verify-orca-credential-store-live.mjs:116-120 three `console.log(...SKIP...); return 0;`
scripts/verify-no-remote-agent-port-live.mjs:286 `if (skip) { console.log(`${NAME}: SKIP -- ${skip}`); return 0; }` and 349-352 self-test 'PASS -- ... live half skipped' exit 0
scripts/verify-orca-service-live.mjs:208-209
scripts/verify-orca-failure-page-live.mjs:522,535-537
scripts/verify-orca-browser-snapshot-live.mjs:238,318-321,487 (skip leaves code 0)
scripts/verify-orca-agent-status-live.mjs:198-200,395 (skip leaves code 0)
scripts/verify-platform.sh:6985 `SUMMARY+=("$label: PASS")` on exit 0

**Suggested fix.** Use one skip protocol everywhere: a distinct exit code that the driver records as SKIP, and that --gate refuses unless a ledger exclusion names it. In the full tier, which runs after the build, turn 'not built' into FAIL. The orca-snapshot-fixtures quick row should FAIL, not SKIP, wherever orca/ is expected.

**Verifier (CONFIRMED, medium).** Every cited SKIP path exists and exits 0. credential-store-live returns 0 at lines 116, 117 and 120 (loadTypescript at verify-orca-credential-store.mjs:77-78 returns undefined when require fails). no-remote-agent-port-live returns 0 at 286, and its self-test prints 'PASS ... live half skipped' and returns 0 at 349-352. service-live returns 0 at 208-209. failure-page-live exits 0 at 534-537, and skipReason (518-523) also skips when COPY_REL is missing. browser-snapshot-live's live() returns {skip} at 304-307 and the entry point at 487 leaves code 0. The --fixtures mode skips without orca/package.json (runFixtures). CI's verify.yml runs --quick with no fetch-orca.sh step (only fetch-upstream and the Theia build at lines 79-93), so orca-snapshot-fixtures always passes there. agent-status-live skips with no claude on PATH and on any seedClaudeLogin refusal (firefox-bidi.mjs:228, 231, 233, 238), and 395 leaves code 0. In verify-platform.sh, a node row that exits 0 is recorded as '$label: PASS' unless the leak leg fires. Gate mode only reads ': FAIL' summary lines (extract_failed_labels), so a SKIP is never seen. No guard turns a SKIP into a red. *Checked at:* scripts/verify-platform.sh run loop: `wait "$CURRENT_CHECK_PID" || row_ok=0` ... `SUMMARY+=("$label: PASS")`; .github/workflows/verify.yml:79-93 has no fetch-orca step before `verify-platform.sh --quick`; scripts/verify-orca-browser-snapshot-live.mjs runFixtures `if (!existsSync(join(REPO_ROOT, 'orca', 'package.json'))) return { skip: ... }`

## harness-live-security-04: failure-page-live moves the built pb-browser-host.js aside and does not restore it when ended by SIGTERM, which makes the agent-browser rows SKIP and PASS

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-failure-page-live.mjs:486`

**What is wrong.** Induction 5 renames the shared build output orca/out/web/assets/pb-panes/pb-browser-host.js to *.pb-aside and restores it in a finally block. The script calls liveEnv(), which installs liveHome()'s SIGTERM and SIGHUP handlers. Those handlers dispose the scratch HOME and re-raise the signal with the default disposition, so the finally block never runs. verify-platform.sh stops a running check with SIGTERM to its process group (setsid row, cleanup). The host bundle stays moved aside. The next orca-browser-agent-live and orca-agent-mark-live runs then hit prerequisites()' `HOST_BUNDLE_REL is absent` SKIP and pass. They run before failure-page in registry order (lines 6894-6895 against 6907). The next failure-page run then fails on ENOENT and only after that restores the file. A concurrent unlocked run (see the lock finding) also sees the file missing during induction 5.

**Scenario.** The owner interrupts a --gate run (Ctrl-C, or the driver's group SIGTERM) during failure-page launch 3. pb-browser-host.js is left as pb-browser-host.js.pb-aside. On the re-run, orca-browser-agent-live prints 'SKIP -- lane p66-01 not merged or Orca not built (...pb-browser-host.js is absent)' and exits 0, so it counts as PASS. The live browser host is also broken for manual use until the next failure-page run restores the file.

**Preconditions.** The row is ended by a signal during induction 5, or another live row runs at the same time.

**Evidence.** scripts/verify-orca-failure-page-live.mjs:486 `renameSync(join(REPO_ROOT, HOST_BUNDLE_REL), hostAside);`
:509 `if (existsSync(hostAside)) renameSync(hostAside, join(REPO_ROOT, HOST_BUNDLE_REL));` (finally only)
scripts/lib/firefox-bidi.mjs:155-163 signal handler: `disposeHome(home); process.off(sig, onSignal); process.kill(process.pid, sig);`
scripts/lib/orca-browser-live.mjs:60 skip on missing host bundle

**Suggested fix.** Do not mutate the shared build tree. Induce browser-not-attached by pointing a pref or the orca root at a scratch copy of out/web without the host bundle. Otherwise register a synchronous restore in the SIGTERM, SIGINT and SIGHUP path, and restore any stale *.pb-aside at the start of every row that reads HOST_BUNDLE_REL. In any case, make a missing host bundle FAIL in prerequisites().

**Verifier (CONFIRMED, medium).** Line 486 renames orca/out/web/assets/pb-panes/pb-browser-host.js to *.pb-aside. It is restored only at 495 (inside the session) or in the finally at 509. failure-page calls liveEnv (lines 306, 322, and through withShell/withFirefoxPage), so liveHome() installs handlers for SIGINT, SIGTERM and SIGHUP (firefox-bidi.mjs:155-163). No other SIGTERM listener exists in pb-relaunch or firefox-bidi: the only other process.on calls are SIGINT at firefox-bidi.mjs:585 and 764, and that handler also ends with process.exit(130), which skips finally blocks. On SIGTERM the liveHome handler disposes the HOME, removes itself and re-raises with the default disposition, so the process dies without running the finally. verify-platform.sh cleanup() sends `kill -- -$CURRENT_CHECK_PID` to the setsid group, and that group includes the flock child and the re-exec'd node (spawnSync children share the group). prerequisites() in orca-browser-live.mjs:60 then skips on the same HOST_BUNDLE_REL, and browser-agent-live:1001 and agent-mark-live:115 return 0 for that skip. Registry order 6894-6895 runs before 6907. On the next run, failure-page's skipReason checks only that the pb-panes directory exists, so the run proceeds, fails at the rename, and the finally restores the file. *Checked at:* scripts/lib/firefox-bidi.mjs:156-162 `if (process.listenerCount(sig) > 1) return; disposeHome(home); process.off(sig, onSignal); process.kill(process.pid, sig);`; scripts/verify-platform.sh:139-143 group SIGTERM; scripts/lib/orca-browser-live.mjs:60 skip on missing host bundle

## harness-live-security-13: The harness rewrites the owner's real ~/.claude/.credentials.json with a read-then-rename that can lose a concurrent write

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/firefox-bidi.mjs:119`

**What is wrong.** scratchSignInSettled() reads the real credentials file, compares hashes, writes a temp file and renames it over the real file, keeping the other keys from the earlier read. Nothing locks against the owner's own claude processes, which write the same file (token refresh, MCP OAuth entries) between the read and the rename. A write that lands in that window is overwritten. The sweep in liveHome() also runs this write-back for every stale pb-home-* folder at the start of any live row. So rows that never seed a sign-in (credential-store, service, browser-agent) can also write the real credential store.

**Scenario.** During a live run, the owner's interactive claude session adds an MCP server OAuth token to ~/.claude/.credentials.json. The harness then disposes a scratch HOME whose token rotated: it read `real` before that write and renames {...real, claudeAiOauth: rotated} over the file. The MCP token is lost, and the owner must re-authenticate that server.

**Preconditions.** A rotated token in a scratch HOME and a concurrent write to the real credentials file.

**Evidence.** scripts/lib/firefox-bidi.mjs:108-119 `const real = realFile ? readJson(realFile) : {}; ... writeFileSync(tmp, JSON.stringify({ ...real, claudeAiOauth: rotated }), ...); renameSync(tmp, realFile);`
:144-147 sweep `if (name.startsWith('pb-home-') && !homeInUse(dir)) disposeHome(dir);`

**Suggested fix.** Re-read the real file immediately before the rename and abort if its mtime or contents changed. Better, never write the real store: keep the scratch folder and print the instruction (the existing fallback). Limit the sweep's write-back to rows that seeded a sign-in.

**Verifier (CONFIRMED, low).** In scratchSignInSettled (scripts/lib/firefox-bidi.mjs:103-129), the real ~/.claude/.credentials.json is read at :109. The compare-and-swap at :112 checks only that claudeAiOauth.refreshToken still hashes to the seeded value. Then {...real, claudeAiOauth: rotated} is written to a temp file and renamed over the real file (:116-117). No lock is held, and the file is not re-read before the rename. A concurrent write by the owner's own claude process (an MCP OAuth entry, or any key other than the refresh token) that lands between the read at :109 and the rename at :117 is lost. The window is short: it is all synchronous calls, on the order of milliseconds. Claude's own writers use the same read-modify-write pattern. The sweep in liveHome (:144-147) calls disposeHome, and so this write-back, for every stale pb-home-* folder whose .pid is dead. So any row that calls liveHome can write the real file, but only when a folder left by an earlier SIGKILLed seeded run holds a rotated token. The preconditions (a rotated token in a scratch HOME plus a concurrent write inside a millisecond window) make this low. *Checked at:* A partial guard exists: the compare-and-swap on the refresh-token hash at scripts/lib/firefox-bidi.mjs:112 blocks overwriting a token the owner's claude rotated itself. It does not protect other keys written between the :109 read and the :117 rename.

## harness-live-security-09: no-remote-agent-port-live accepts a listener by port number only, at one startup snapshot

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-no-remote-agent-port-live.mjs:107`

**What is wrong.** treeSockets() labels a listening socket 'sidecar', 'orcad', 'tab-store' or 'orcad-agent-hooks' when its port equals an accepted port, whatever the bound address. A sidecar or tab-store endpoint bound to 0.0.0.0 or :: is accepted and the row passes. orca-service-live checks loopback only for orcad's own pid. The shipped launch is sampled once, as soon as accounting is satisfied after the state files appear, so a debugging or agent listener opened later in the session is never observed. Processes that leave the descendant tree (reparented to init) are also not inspected.

**Scenario.** A regression binds the Theia sidecar or the tab-store endpoint to 0.0.0.0, which makes a token-gated, agent-reachable endpoint reachable from the LAN. The shipped launch's socket line shows 0.0.0.0:<port> labelled 'sidecar', and the row prints PASS.

**Preconditions.** A regression in a bind address, or a listener opened after startup.

**Evidence.** scripts/verify-no-remote-agent-port-live.mjs:107 `const owner = Object.entries(accepted).find(([, port]) => port === row.port)?.[0] ?? 'unaccounted';`
:134-136 shippedVerdict only filters 'unaccounted'
:258-264 single sampling loop that breaks once accounting is green

**Suggested fix.** Also require each accepted socket's local address to be loopback (127.0.0.0/8, ::1, ::ffff:127.x), and plant a 0.0.0.0 sidecar row in the self-test. Re-sample after a fixed settle and after one agent command.

**Verifier (CONFIRMED, low).** treeSockets (100-112) labels a socket's owner by `port === row.port` alone, and the address is decoded only for printing. shippedVerdict (134-136) filters only 'unaccounted'. accountingVerdict checks port presence only. A sidecar or tab-store listener on 0.0.0.0 or [::] at an accepted port is therefore labelled and passes. The sampling loop at 258-264 breaks as soon as accounting is green, a single launch is judged, and the process is then stopped, so later listeners are never seen. treeProcs walks descendants of mainPid from ppidMap, so a process reparented to init is not inspected. The self-test fixtures plant only loopback rows for accepted ports. service-live's loopback check (nonLoopback) covers only orcad's own pid and inodes. *Checked at:* scripts/verify-no-remote-agent-port-live.mjs:107 `Object.entries(accepted).find(([, port]) => port === row.port)`; 134-136; 258-264

## harness-live-security-07: Self-tests leave many live-row assertions without a planted fault

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-browser-agent-live.mjs:1066`

**What is wrong.** The project rule requires a planted fault per assertion. The following assertions have none. orca-browser-agent-live: verdictActs (b) has no plant at all (title, click count, typed value). verdictRenderer is planted only for lease_stale (not placement kind, createPage not arrived, or missing credential). verdictReload is planted only for agentWidgetsAfter (not reattached, oldListed). verdictScreenshot: deviceDpr mismatch, outside pixel red. verdictDecoy: createOk, title, quietMs. verdictAuth: authorized. verdictLogins: agentSubmitted. verdictCreate: !agent, boundTab. verdictNoPane: newTabs>1, ms>CREATE_MS. verdictTyping: chrome focus moved. verdictActivation: user focus changed, !bound. verdictFirstDocument: !created. verdictContainer: userCookieSet. verdictRefusals: missing error.code. orca-agent-mark-live: Stop button missing, empty baseline, stopped.mark and stopped.stopped. orca-agent-status-live: bridgeDir empty, launcher not naming the bridge folder, wrapper missing, engine 'does not descend from the terminal daemon', 'no agent process', quit 'vacuous'. orca-service-live: reap 'old daemon alive', 'state not ready'.

**Scenario.** An edit inverts `if (o.authorized)` in verdictAuth, or deletes the verdictActs title comparison. The self-test still prints PASS, because no plant reaches those lines.

**Preconditions.** A regression in an unplanted assertion.

**Evidence.** scripts/verify-orca-browser-agent-live.mjs:1066-1165 PLANTS has no 'b' entry and no plant naming 'credential path', 'host did not re-attach', 'old pages are still listed', 'server received credentials', 'device check'.
scripts/verify-orca-agent-mark-live.mjs:137-146
scripts/verify-orca-agent-status-live.mjs:337-351
scripts/verify-orca-service-live.mjs:435-439

**Suggested fix.** Add one plant per fail string, and derive coverage instead of hand-keeping it: run every verdict over CONTROL with each field mutated in turn, or check that every literal fail message in the verdict source is named by at least one plant.

**Verifier (CONFIRMED, low).** I checked the PLANTS arrays directly. browser-agent-live (1066-1165) has no plant for 'b' (verdictActs). verdictRenderer is planted only for lease_stale. verdictReload is planted only for agentWidgetsAfter. verdictScreenshot has plants for size and inside, but none for deviceDpr or outside. verdictDecoy has plants for stock and markerPresent, but none for createOk, title or quietMs. verdictAuth has no authorized plant. verdictLogins has no agentSubmitted plant. verdictCreate has no plant for !agent or boundTab. verdictNoPane has no plant for newTabs>1 or a slow ms. verdictTyping has no plant for chromeBefore!==chromeAfter. verdictActivation has no plant for userFocusAfter or !bound. verdictFirstDocument has no plant for !created. verdictContainer has no plant for userCookieSet. verdictRefusals has no plant for a missing code. agent-mark-live's PLANTS (137-146) lack stopped.clicked, an empty baseline, stopped.mark and stopped.stopped. agent-status-live lacks plants for an empty bridgeDir, a launcher not naming the bridge, a missing wrapper, the 'does not descend from the terminal daemon' branch, no agent process, and quit 'vacuous'. service-live's reap plants lack the old daemon and the state not ready cases. An inversion in any of these lines leaves each self-test green. *Checked at:* scripts/verify-orca-browser-agent-live.mjs:1066-1165; scripts/verify-orca-agent-mark-live.mjs PLANTS; scripts/verify-orca-agent-status-live.mjs PLANTS; scripts/verify-orca-service-live.mjs:435-439

## harness-live-security-08: Assertions that cannot fire in a live run: (l) capturedAfter and status-live waitingNotDerivable

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-browser-agent-live.mjs:203`

**What is wrong.** verdictLogins reds on capturedAfter > 0, a count of stored logins for 'pbagent' after the agent submit. Gecko's form-submit capture only offers a save doorhanger. A login is stored only if a user accepts it, so the count stays 0 even when the agent tab has a working LoginManager actor. The agentActor assertion is the only effective one. In orca-agent-status-live, agentVerdict reds when waitingNotDerivable is set while derivedWaitingEvent names an event. The live caller passes waitingNotDerivable: !derivedWaitingEvent, so the condition is always false.

**Scenario.** The agent container wall regresses so that an agent-typed submit triggers capture. No login is stored without an accepted doorhanger, so capturedAfter stays 0 and only agentActor can catch it. The status-live branch is unreachable in any live run.

**Preconditions.** None for status-live. For (l), Gecko's capture behaviour in the PB shell window.

**Evidence.** scripts/verify-orca-browser-agent-live.mjs:203 `if (o.capturedAfter > 0) ...`; 455 `capturedAfter: await countLogins(ctx, 'pbagent')`
scripts/verify-orca-agent-status-live.mjs:124 `if (obs.waitingNotDerivable) fails.push(...)` and 281 `waitingNotDerivable: !derivedWaitingEvent`

**Suggested fix.** For (l), observe the capture attempt directly, for example a password-save doorhanger or a PasswordManager:onFormSubmit message for the agent browser. For status-live, record whether the 'waiting not derivable' note path was taken as a separate observation, or drop the assertion.

**Verifier (CONFIRMED, low).** The status-live half is proven statically. agentVerdict checks `obs.waitingNotDerivable` only inside `if (obs.derivedWaitingEvent)`, and the live caller passes `waitingNotDerivable: !derivedWaitingEvent`, so inside that branch the value is always false. The branch can never fire live and is reached only through the self-test plant that sets both values artificially. In the (l) half, capturedAfter counts stored logins with username 'pbagent' after the agent submit (455). The harness never accepts a save doorhanger. Gecko's form-submit capture stores a non-generated login only from the doorhanger's Save callback, so the count stays 0 whatever the capture actor does, and agentActor remains the effective assertion. That half rests on Gecko runtime behaviour, which I cannot execute here. The finding stands on the status-live half alone. *Checked at:* scripts/verify-orca-agent-status-live.mjs agentVerdict `if (obs.derivedWaitingEvent) { if (obs.waitingNotDerivable) ...` and live call `waitingNotDerivable: !derivedWaitingEvent`; scripts/verify-orca-browser-agent-live.mjs:203, 455

## harness-live-security-14: Clipboard clause (r) overwrites the real system clipboard on a headed run and restores text only

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-browser-agent-live.mjs:740`

**What is wrong.** orca-browser-agent-live does not refuse PB_LIVE_HEADED=1 or PB_REAL_INPUT=1, unlike the credential-store and service rows. withProbeShell forces headed mode under PB_REAL_INPUT. In a headed session, Services.clipboard is the desktop clipboard. Clause (r) saves only a text/plain reading, sets marker strings, and in finally restores only a non-empty text value. Non-text content (an image, files) and an empty clipboard end up replaced by a marker, and the restore is skipped if the process is ended by a signal.

**Scenario.** The owner runs the row with PB_REAL_INPUT=1 to exercise real typing while an image is on the clipboard. After the run the clipboard holds 'pb-clip-user-<run>' and the image is gone.

**Preconditions.** A headed or real-input run.

**Evidence.** scripts/verify-orca-browser-agent-live.mjs:740 `window.__pbClipSaved = clip.read(); clip.set('pb-clip-start');`
:779 `if (typeof window.__pbClipSaved === 'string' && window.__pbClipSaved) clip.set(window.__pbClipSaved);`
scripts/lib/pb-live-probe.mjs:40-42 PB_REAL_INPUT forces PB_LIVE_HEADED=1.

**Suggested fix.** Refuse headed or real-input mode in this row, as orca-credential-store-live does at lines 121-124, or skip clause (r) with a FAIL-class 'headless required' result when headed.

**Verifier (CONFIRMED, low).** verify-orca-browser-agent-live.mjs has no PB_LIVE_HEADED/PB_REAL_INPUT refusal (grep finds none). credential-store-live (:121) and service-live (:210) both refuse headed runs. pb-live-probe.mjs:40-42 sets PB_LIVE_HEADED=1 under PB_REAL_INPUT, and firefox-bidi.mjs:692 then omits --headless. Headed Gecko's Services.clipboard is the desktop (GTK) clipboard, not the headless in-memory clipboard. clipboardObserved saves only a text/plain reading (:730, :740, returning null on non-text or empty) and overwrites the clipboard with markers. The finally block at :779 restores only a non-empty string. Image or file content, or an empty clipboard, ends up holding a marker. A signal or kill that skips the finally also skips the restore. The precondition is an owner-chosen headed run, and the harm is clipboard contents lost on the developer's machine, so low. *Checked at:* No guard in this row. The headed-mode refusal exists only in scripts/verify-orca-credential-store-live.mjs:121 and scripts/verify-orca-service-live.mjs:210.

## harness-live-security-10: credential-store-live judges refused starts with one process walk, so an orcad that started and exited is not detected

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-credential-store-live.mjs:213`

**What is wrong.** Steps 3 and 4 (temporary profile, plaintext override) assert 'no orcad' with a single /proc walk taken immediately after failureClass reaches the refusal class. The protected outcome is that orcad never ran with a disposable profile or plaintext storage, and so wrote no key or report. A regression that spawns orcad first and then classifies and stops it leaves nothing running at walk time, so the step passes. The row does not check for <dataRoot>/orca-secret-protection.json, which it already reads in step 2, or for a key under <scratch HOME>/.orca after a refused start.

**Scenario.** OrcaService is changed to start orcad, read its protection report, and stop it when the report shows the plaintext gap. Step 4 sees failureClass plaintext-setting and no live orcad, and passes, although orcad ran with plaintext credential storage.

**Preconditions.** A product regression that spawns orcad before the refusal classification.

**Evidence.** scripts/verify-orca-credential-store-live.mjs:212-213 `await pollFor(... last.failureClass === wantClass ...)` then `orcadPids: orcadInTree(pbPid)` once.
refusalVerdict (75-81) uses only the instantaneous pid list.

**Suggested fix.** In each refusal step, also assert that no protection report exists in the profile's data root and that no credential key file exists under the run's scratch HOME/.orca. Poll the walker across the whole refusal window, not once.

**Verifier (CONFIRMED, low).** In steps 3 and 4, refusal() (209-215) polls until failureClass equals wantClass, then calls orcadInTree(pbPid) once. refusalVerdict (75-81) uses only that instantaneous pid list. Steps 3 and 4 neither read readReport(dataRoot) (used in steps 1-2) nor check for a key under the scratch HOME's .orca, so an orcad that was spawned and then stopped before the walk leaves no trace the row looks for. walkerVerdict proves only that the walker can see a running orcad, not that none ever ran. The regression is hypothetical, as stated, but the blind spot is real. *Checked at:* scripts/verify-orca-credential-store-live.mjs:212-213 single `orcadPids: orcadInTree(pbPid)` after the class poll; 75-81 refusalVerdict uses only orcadPids

## harness-live-security-12: failure-page-live recovery can pass over an empty id set, and the auth-refusal induction is a note, not red

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-failure-page-live.mjs:498`

**What is wrong.** recovered() polls `ids.every(...)`, which is true at once for an empty list. The offer-refusal and browser-not-attached recoveries pass `ids.filter(id => hostedIds().includes(id))`. If the views after the reload or relaunch carry different ids than chatId and termId, the filter is empty and the recovery passes without looking at any pane. Induction 3 (pairing-lost through a revoked device, A-7) records 'not achieved' as a note and never goes red, so the revoked-device path to the pairing-lost page is not asserted on any run.

**Scenario.** A layout-restore change gives the restored hosted tabs new widget ids. In induction 5, pageVerdict passes on the new ids, then recovered('browser-not-attached Reconnect', []) passes immediately although no pane came back. Only the OrcaBrowserHost state check remains. Separately, a regression in which a revoked device keeps its session is reported only as a note.

**Preconditions.** Widget ids change across a reload or relaunch, or the revoked-device path regresses.

**Evidence.** scripts/verify-orca-failure-page-live.mjs:290 `return ids.every(id => v.some(x => x.id === id && !x.page && x.content));`
:456 `ids.filter(id => hostedIds().includes(id))`
:498 same
:413-414 `notes.push(`auth-refusal induction not achieved at the pin: ...`)`

**Suggested fix.** Make recovered() red on an empty id list ('collector blind'). Judge recovery over the ids read after the relaunch. Turn the induction-3 note into a FAIL, or into a ledger-tracked exclusion that --gate surfaces.

**Verifier (CONFIRMED, low).** recovered() (scripts/verify-orca-failure-page-live.mjs:287-293) polls showEach(ids) and then ids.every(...). With ids = [], every() is true on the first poll and recoveryVerdict returns []. Inductions 4 and 5 pass ids.filter(id => hostedIds().includes(id)) (:456, :498), and hostedIds is [chatId, termId] (:265). If the post-reload or post-relaunch view ids share nothing with chatId/termId, the recovery passes vacuously. pageVerdict refuses an empty view list (:108) but checks whatever ids it was given, so it would pass on new ids. One correction to the stated scenario: a restore change that renumbers widget ids across relaunches would also redden launch 2 at :466-468 ('collector blind -- the hosted tabs were not restored'), because that step requires every hostedIds() id among the restored views. So the row as a whole would most likely go red. The vacuous pass needs ids that diverge only on a reload (induction 4) or only on launch 3. The second half is accurate: at :412-414, the auth-refusal (revoked device, A-7) induction that is not achieved is recorded as a note and never fails. The file header (:32-33) states this is deliberate ('not a red: induction 4 proves the class'). Induction 4 proves the pairing-lost page class through an offer refusal, not the revoked-device path. A regression in which a revoked device keeps its session is therefore not asserted. *Checked at:* Partial mitigation: scripts/verify-orca-failure-page-live.mjs:466-468 (launch 2 requires the restored views to carry chatId/termId) catches an id change across relaunches. Nothing guards the empty filter at :456/:498. The A-7 path is note-only by documented design (:32-33, :414).

## harness-live-security-11: orca-service-live's environment set equality takes its expectation from the same allowlist that builds orcad's environment

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-service-live.mjs:100`

**What is wrong.** envVerdict compares orcad's /proc environ names with OrcaEnv.expectedEnvNames(pbNames), which is ORCAD_FIXED_ENV_NAMES plus ORCAD_ENV_ALLOWLIST. buildOrcadEnv copies exactly that same ORCAD_ENV_ALLOWLIST. Adding a credential-bearing name to the allowlist (GH_TOKEN, ANTHROPIC_API_KEY, AWS_SECRET_ACCESS_KEY) changes the subject and the expectation together, so the live row stays green. The static guard in verify-orca-service.mjs keeps a hand-kept list of Node and loader steering names only. The GH_TOKEN self-test plant goes red only because the fixture's allowlist does not list it.

**Scenario.** A change appends "GH_TOKEN" to ORCAD_ENV_ALLOWLIST so that agents can push. orca-service-live passes: orcad's environment equals the expected set, which now includes GH_TOKEN, and every agent under orcad inherits the token.

**Preconditions.** A change to ORCAD_ENV_ALLOWLIST.

**Evidence.** scripts/verify-orca-service-live.mjs:100 `OrcaEnv.compareEnvNames(Object.keys(orcad), OrcaEnv.expectedEnvNames(Object.keys(pb)))`
powerbrowser/shell/OrcaEnv.sys.mjs:113 `for (const name of ORCAD_ENV_ALLOWLIST)` (subject) and :387 `ORCAD_ENV_ALLOWLIST.filter(name => present.has(name))` (expectation)
scripts/verify-orca-service.mjs:165 STEERING list only.

**Suggested fix.** Keep one independent statement of the allowed set: a reviewed fixture with a hash pinned in DECISIONS, or a deny pattern for secret-like names (TOKEN, KEY, SECRET, PASSWORD, CREDENTIAL). Make the static row fail when the allowlist drifts from it.

**Verifier (CONFIRMED, low).** I traced the whole path. envVerdict (scripts/verify-orca-service-live.mjs:100) compares orcad's names with OrcaEnv.expectedEnvNames, and that function (OrcaEnv.sys.mjs:385-387) is ORCAD_FIXED_ENV_NAMES plus ORCAD_ENV_ALLOWLIST filtered by what PB has. buildOrcadEnv (OrcaEnv.sys.mjs:113) copies the same ORCAD_ENV_ALLOWLIST. Adding a name to the allowlist therefore moves the subject and the expectation together, and the live row stays green. The live check is a conformance check (orcad's environment matches the allowlist), not a policy check on what the allowlist may contain. The only static policy guard is scripts/verify-orca-service.mjs:933-934: the hand-kept STEERING list plus /^(ORCA|CLAUDE|NODE|ELECTRON)_/. GH_TOKEN, ANTHROPIC_API_KEY and AWS_SECRET_ACCESS_KEY match neither. verify-orca-credential-store.mjs:192-193 bans only the plaintext-override name. The GH_TOKEN self-test plant (verify-orca-service-live.mjs:397,422) goes red only because the fixture's allowlist is the real one, which lacks GH_TOKEN. The precondition is a code change to a frozen literal, which goes through review, so low is the right severity. *Checked at:* No guard found. The static allowlist guard at scripts/verify-orca-service.mjs:165 and :933-934 covers only steering names and the ORCA_/CLAUDE_/NODE_/ELECTRON_ prefixes. Credential-named variables are not covered.

