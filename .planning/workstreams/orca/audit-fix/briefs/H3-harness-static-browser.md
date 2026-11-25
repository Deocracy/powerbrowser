# Fix brief: H3-harness-static-browser

Lane: harness. Items: 8. Files this group owns: `scripts/verify-orca-browser-tab-scope.mjs`, `scripts/verify-orca-browser-abilities.mjs`, `scripts/verify-orca-browser-tools.mjs`, `scripts/verify-orca-browser-entry-points.mjs`, `scripts/verify-orca-browser-host-bundle.mjs`, `scripts/verify-orca-agent-hooks.mjs`, `scripts/verify-orca-claude-sdk.mjs`, `scripts/verify-orca-hidden-electron.mjs`.

Item IDs: harness-static-browser-01; harness-static-browser-03; harness-static-browser-02; harness-static-browser-04; harness-static-browser-05; harness-static-browser-07; harness-static-browser-09; harness-static-browser-08.

## harness-static-browser-01: Agent-hooks static clause misses process.env read through an alias, and the wrapper reads env only through an alias

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-agent-hooks.mjs:361`

**What is wrong.** The only guard for 'the wrapper reads no data root or pane identity name from process.env' is processEnvReads(). It matches only syntactic `process.env.X`, `process.env['X']` and `const {X} = process.env`. The shipped wrapper never reads `process.env.X` directly. It takes `main(argv, baseEnv = process.env, ...)` and reads `baseEnv.PATH` / `baseEnv.HOME`. A regression that reads `baseEnv.ORCA_USER_DATA_PATH` or `baseEnv.ORCA_PANE_KEY` is invisible to the static clause. The live stage B plants only ORCA_PLANT_63 in the launcher's environment, never a decoy ORCA_USER_DATA_PATH or ORCA_PANE_KEY, so the live row cannot catch it either. The self-test plant uses the literal `process.env.ORCA_USER_DATA_PATH`, so it passes without modelling the idiom the codebase actually uses.

**Scenario.** A developer edits claude-wrapper.mjs line 115 to `ORCA_USER_DATA: baseEnv.ORCA_USER_DATA_PATH ?? dataRoot`. VS Code was started from an Orca desktop terminal, so it inherits ORCA_USER_DATA_PATH=~/.config/orca. The wrapper then registers the Claude pane, and routes its hook relay, into the user's desktop Orca instead of PowerBrowser's orcad. orca-agent-hooks-self-test (quick) and orca-agent-hooks (full) both stay green.

**Evidence.** scripts/verify-orca-agent-hooks.mjs:358 `const isProcessEnv = (n) => ... n.name.text === 'env' && ... n.expression.text === 'process';` and :365-369 (only direct property/element/destructure of process.env). theia/extensions/orca-agents/bin/claude-wrapper.mjs:173 `export function main(argv, baseEnv = process.env, cwd = process.cwd())`, :115 `return { PATH: baseEnv.PATH ?? '', HOME: baseEnv.HOME ?? '', ORCA_USER_DATA: dataRoot, ...}`. Stage B env at :591 `{ PATH, HOME: home, [PLANT_NAME]: '1' }`. No ORCA_USER_DATA_PATH or ORCA_PANE_KEY decoy is planted.

**Suggested fix.** Make the live stage B plant decoy ORCA_USER_DATA_PATH, ORCA_USER_DATA, ORCA_PANE_KEY, ORCA_TAB_ID and ORCA_WORKTREE_ID pointing at a second scratch data root and a fake pane. Require that the pane appears in the PB data root and that the stub's identity is the real pane's. Statically, track identifiers bound to process.env (default parameters, const aliases, spreads) and flag forbidden member reads on them. Add a self-test plant in the `baseEnv.ORCA_USER_DATA_PATH` form.

**Verifier (CONFIRMED, medium).** processEnvReads (scripts/verify-orca-agent-hooks.mjs:361-379) matches only process.env.X, process.env['X'] and `const {..} = process.env`, through isProcessEnv at :358. The forbidden-name clause at :412-416 depends on that function alone. The shipped wrapper never names process.env except as the default parameter `main(argv, baseEnv = process.env, ...)` (claude-wrapper.mjs:173). It reads everything through baseEnv: cliEnv at :115 and claudeEnv at :97. A regression such as `baseEnv.ORCA_USER_DATA_PATH ?? dataRoot` is therefore invisible to the static clause. Stage B spawns the launcher with only PATH, HOME and ORCA_PLANT_63 (:591), so a fallback read finds nothing and still resolves to dataRoot, and the live stage stays green. The self-test plant at :781 uses the literal `process.env.ORCA_USER_DATA_PATH`, which models the idiom the wrapper does not use. No other guard covers this. The clause is vacuous against the code it exists to guard. Today the product is correct: claudeEnv strips every ORCA_ name and cliEnv uses dataRoot. *Checked at:* scripts/verify-orca-agent-hooks.mjs:358,361-379,412-416,591,781; theia/extensions/orca-agents/bin/claude-wrapper.mjs:97,115,173

## harness-static-browser-03: orca-browser-abilities (a)-(g) and the whole of orca-browser-entry-points SKIP in CI and the driver counts the SKIP as PASS

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-browser-entry-points.mjs:422`

**What is wrong.** Both rows are --quick. The CI quick job fetches upstream/ but never fetches orca/. orca-browser-entry-points returns a single SKIP for everything when orca/src is absent. That includes clause 2 (the browser route targets pb-web-tab) and clause 5 (HOST_PREFIX equals ORCA_PANES_ROUTE_PREFIX), which read only PowerBrowser files. orca-browser-abilities runs only the trace without orca/src and skips clauses (a)-(g). That includes (f)/(g), the SERVED_AUTOMATION_METHODS versus chrome AGENT_METHODS comparison. Both exit 0, and verify-platform.sh records any exit 0 as PASS. On every push and pull request the BRW-02/BRW-03 ability and entry-point gates report PASS without comparing anything.

**Scenario.** A PR adds 'browser.upload' to chrome's AGENT_METHODS (with a child arm, so tab-scope's mechanism clause is green) but not to ORCA_BROWSER_ABILITIES' served set or DISPOSITIONS. Alternatively, it retargets the orca-panes 'browser' route to 'hosted-pane'. The CI 'Run the static verification table' job prints `orca-browser-abilities: PASS -- trace scenario green; SKIP -- abilities: no fetched Orca tree` and `orca-browser-entry-points: SKIP -- no fetched Orca tree`, and the summary lists both as PASS.

**Evidence.** scripts/verify-orca-browser-entry-points.mjs:422 `if (!existsSync(join(root, REL.orca, 'src'))) return { fails, skips: ['no fetched Orca tree ...'] ... }` (before clauses 2 and 5 at :443-468); :659 `if (r.skips.length) { console.log(`${NAME}: SKIP -- ...`); return 0; }`. scripts/verify-orca-browser-abilities.mjs:277 `if (!existsSync(join(root, REL.orca, 'src'))) return { fails, skips: [...] }` and :409 PASS with SKIP, exit 0. scripts/verify-platform.sh:6985-6986 `if [ "$row_ok" -eq 1 ]; then SUMMARY+=("$label: PASS")`. .github/workflows/verify.yml:80 fetches only upstream, :93 runs `--quick`.

**Suggested fix.** Move the orca-independent clauses (route row, served prefix, AGENT_METHODS equal to SERVED_AUTOMATION_METHODS) ahead of the orca/src gate so they always run. Have the driver recognise a SKIP line (or a distinct exit code such as 77) and report it as SKIP, failing --gate on any SKIP not on a known-open list. Alternatively, fetch orca/ (source only) in verify.yml.

**Verifier (CONFIRMED, medium).** Both rows are in run_own_checks' CHECKS array, the --quick set (verify-platform.sh:3659, rows at :4060 and :4072). verify.yml runs fetch-upstream.sh and apply-patches.sh (:80) and then `verify-platform.sh --quick` (:93). No step runs fetch-orca.sh. Only release.yml does, and orca/ is gitignored (/orca/ in .gitignore:44). The entry-points check returns a SKIP at :422 when orca/src is absent. That return comes before clause 2 (route targets pb-web-tab) and clause 5 (HOST_PREFIX equals ORCA_PANES_ROUTE_PREFIX), and both read only PowerBrowser files. main at :659 prints SKIP and returns 0. The abilities check runs the trace and then returns a SKIP at :277 before (a)-(g), including the chrome AGENT_METHODS comparison, and main at :409 returns 0. The driver records any exit 0 as PASS (:6985-6986) and never inspects SKIP output. The CI summary therefore shows PASS for both rows without comparing anything. Locally, with orca/ fetched, the rows do compare. *Checked at:* scripts/verify-orca-browser-entry-points.mjs:422,443-468,659; scripts/verify-orca-browser-abilities.mjs:277,409; scripts/verify-platform.sh:6985-6986; .github/workflows/verify.yml:80,93

## harness-static-browser-02: Tab-scope wall is exercised only through the webTabAgent arm; no derived caller set for the page-work entry points

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-browser-tab-scope.mjs:326`

**What is wrong.** The check proves the wall only for requests that enter through the two sliced case arms of handleWebTabAction (webTabAgent, webTabAgentStop) and the webTabOpen arm. Nothing derives the set of call sites of the functions that do agent page work: agentRunInChild, AGENT_NATIVE_ROWS[...], getActor(AGENT_ACTOR_NAME), agentCookie*, agentScreenshot, agentAnswerDialog. Nothing requires that set to equal {handleWebTabAgent, AGENT_NATIVE_ROWS bodies}. A second entry point that calls any of them without agentWallVerdict is not detected. That includes a new action kind, a group-mutation arm, or a handler outside the agent section. Today there is exactly one caller (PowerBrowserAPI.sys.mjs:11774), so the gap is in the check, not yet in the product.

**Scenario.** A later change adds `case "webTabAgentScreenshot": return AGENT_NATIVE_ROWS['browser.screenshot'](webTabs.get(data.tabId), {}, data.tabId);` to handleWebTabAction, classified 'privileged' in KIND_CLASSES. A prompt-injected agent, or any frontend sender, can then screenshot a user tab. orca-browser-tab-scope and its self-test stay green, because the vm program only builds __actionArms from the webTabAgent and webTabAgentStop arms.

**Evidence.** scripts/verify-orca-browser-tab-scope.mjs:156 `const arms = ['webTabAgent', 'webTabAgentStop'].map(kind => caseText(functions.handleWebTabAction, kind));` and :328 `async function __actionArms(data, actorRef) { ... switch (kind) { ${sliced.arms} default: return null; } }`. Product: powerbrowser/shell/PowerBrowserAPI.sys.mjs:11714 `async function agentRunInChild(...)` (getActor at :11716), :11774 the only call `outcome = native ? await native(...) : await agentRunInChild(...)` behind the verdict at :11758-11761.

**Suggested fix.** Add a structural clause that parses PowerBrowserAPI.sys.mjs with acorn and derives every reference to agentRunInChild, AGENT_NATIVE_ROWS, the agent* page-work helpers and the AGENT_ACTOR_NAME/AGENT_RUN_MESSAGE constants. Require each to sit inside handleWebTabAgent or the AGENT_NATIVE_ROWS object, as set equality. Add a self-test plant that adds a second caller.

**Verifier (CONFIRMED, medium).** The vm program slices only the webTabAgent and webTabAgentStop arms of handleWebTabAction (:156) and the webTabOpen arm of handleGroupMutation (:159). __actionArms switches over just those arms (:328). The mechanism clause (:398-409) compares AGENT_NATIVE_ROWS keys with AGENT_METHODS and the child's keys. It does not compare call sites. No clause collects the references to agentRunInChild, AGENT_NATIVE_ROWS[...], getActor(AGENT_ACTOR_NAME), agentScreenshot, agentCookie* or agentAnswerDialog, or requires that set to equal the walled handler. In the product, the only page-work dispatch is at PowerBrowserAPI.sys.mjs:11773-11774, behind agentWallVerdict at :11758. That handler is reached from the case arm at :5592. The gap is in the check only. A new arm that calls AGENT_NATIVE_ROWS directly would not be detected. This breaks CLAUDE.md's derive-and-compare rule for a security wall. *Checked at:* scripts/verify-orca-browser-tab-scope.mjs:156,159,328,398-409; powerbrowser/shell/PowerBrowserAPI.sys.mjs:5592,11758,11773-11774 (only caller today)

## harness-static-browser-04: Entry-points clause 3 accepts every reachable creator call with a hard-coded claim and cannot go red

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-browser-entry-points.mjs:453`

**What is wrong.** Clause 3 is documented as 'each caller is listed reachable (arrives as createPage through the client placement, proven live by orca-browser-agent-live) or dead with its derived reason'. In code, a caller of createBrowserTab or createWebRuntimeSessionBrowserTab that the pane entry's import graph reaches is pushed to `lines` with the constant REACHABLE text and never to `fails`. The claim is not checked. For createBrowserTab it contradicts the check's own clause 10 comment (D-34: createBrowserTab's managed-browser gate refuses a paired web client, so it does not arrive as createPage). A new reachable caller of a page-creating path is mislabelled and stays green. The clause asserts on a constant.

**Scenario.** An Orca re-pin, or an overlay edit, makes the pane entry import a module that calls createBrowserTab, for example a new '+' button component outside components/browser-pane/. The check prints `createBrowserTab: reachable <file> -- arrives as createPage through the client placement, proven live by orca-browser-agent-live` and PASS. No live row was ever run for that caller.

**Evidence.** scripts/verify-orca-browser-entry-points.mjs:101 `const REACHABLE = 'arrives as createPage through the client placement, proven live by orca-browser-agent-live';` and :452-453 `for (const f of callers[c]) { if (graph.has(f)) lines.push(`${c}: reachable ${rel(f)} -- ${REACHABLE}`);` (no fails.push on either branch). :56-57 comment: 'except createBrowserTab (its managed-browser gate refuses a paired web client without screencast, D-34)'.

**Suggested fix.** Make the reachable set an explicit derived-and-compared allowlist. createWebRuntimeSessionBrowserTab callers may be reachable; a reachable createBrowserTab caller is red, or must be named in a ratified list that is compared as set equality. Add a self-test plant that makes a createBrowserTab caller reachable and requires red.

**Verifier (CONFIRMED, low).** At :449-458, every caller of each CREATORS entry goes to `lines`. A caller the graph reaches gets the constant REACHABLE text (:101), and an unreached caller gets a dead line. No branch calls fails.push. The only fail in that loop is the zero-callers 'source moved' check. The main path has no clause that requires createBrowserTab to be unreachable. The self-test control (:622-623) requires createBrowserTab dead and createWebRuntimeSessionBrowserTab reachable, but only in the fixture tree, so it does not constrain the real tree. The header comment at :56 says createBrowserTab is refused for a paired web client (D-34), so a reachable createBrowserTab line carries a false claim and stays green. Clause 1 (no page-mounting component reachable) still guards actual page mounting. The likely effect is a mislabelled caller that does not work, not a boundary crossing, so I lowered the severity to low. *Checked at:* scripts/verify-orca-browser-entry-points.mjs:56,101,449-458,622-623

## harness-static-browser-05: Host-bundle redaction clause scans only the script's own pre-redacted lines and an older build log, so it cannot go red

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-browser-host-bundle.mjs:552`

**What is wrong.** The PASS line claims 'redaction 0 matches'. The count runs over `lines`, which the script builds itself from verdict strings, a notes JSON and already-redact()ed error text, plus the newest .mozbuild/orca-build log. The secrets are the fresh token, key and endpoint of a scratch orcad started in this run, so they cannot appear in a build log written before the run. The real process output already passes through installOutputRedaction and is never inspected. This is an absence assertion over the script's own instrumentation (CLAUDE.md verification rule 1) and has no positive control.

**Scenario.** A change makes the attach path print the offer, for example a debug console.log of the pairing URL inside the bundle, written via a path that bypasses process.stdout.write such as fs.writeSync(1, ...). The row still prints 'redaction 0 matches'. An expected non-match against a stale build log is also reported as evidence.

**Evidence.** scripts/verify-orca-browser-host-bundle.mjs:549-553 `const lines = fails.map(...); ... const matches = redactionMatches(lines.join('\n'), obs.secrets) + (log ? redactionMatches(readFileSync(log, 'utf8'), obs.secrets) : 0);` and :513-519 newestBuildLog() reads a pre-existing build log. Secrets are created at :412 from this run's ready line.

**Suggested fix.** Capture the row's real stdout and stderr (spawn the probe as a child, or tee the raw writes before redaction) and count secrets there. Prove the detector first by counting at least one match in the raw unredacted orcad ready line. Drop the stale build-log term or restrict it to logs written during the run.

**Verifier (CONFIRMED, low).** The secrets are built at :412 from this run's orcad ready line and offer. `lines` (:549-550) comes from stat.fails plus attachVerdict fails. attachVerdict (:89-104) emits only fixed strings, numbers and o.attach, so a secret cannot appear there. The notes JSON holds counts. The build log from newestBuildLog (:513-519) predates the fresh secrets. redactionMatches (:552) therefore scans text that cannot contain a secret. Real process output passes through installOutputRedaction (orca-run.mjs:158-169) and is never scanned. Output written with fs.writeSync(1, ...) bypasses both. The clause has no positive control. 'redaction 0 matches' is an absence assertion over the script's own instrumentation (CLAUDE.md verification rule 1). *Checked at:* scripts/verify-orca-browser-host-bundle.mjs:89-104,412-414,513-519,549-556; scripts/lib/orca-run.mjs:158-169

## harness-static-browser-07: Orcad survivors after host-bundle teardown are only a note, and the driver leak leg cannot see them

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-browser-host-bundle.mjs:503`

**What is wrong.** stopOrcad returns orcad and terminal-daemon pids still alive after SIGTERM/SIGKILL. The row stores the count in notes and still passes. The driver's leak leg only inspects the row's own session, but startOrcad spawns orcad with `detached: true`, which calls setsid. Orcad and its terminal daemon, which also setsids, are therefore outside the row's session. A leaked orcad or daemon from this row is never turned red.

**Scenario.** orcad ignores SIGTERM during a slow shutdown, and the terminal daemon is left in D-state or reparented. stopOrcad reports survivors: 1. The row prints `note -- {"survivors":1}` followed by PASS. The next live row under the lock finds an extra orcad holding a port or socket.

**Evidence.** scripts/verify-orca-browser-host-bundle.mjs:502-503 `const { survivors } = await stopOrcad(...); if (survivors?.length) notes.survivors = survivors.length;` (attachVerdict never reads it). scripts/lib/orca-run.mjs:179 `spawn(nodeBin, args, { ..., detached: true, ... })`. scripts/verify-orcad-leak.mjs:9-10 'orcad stays in the session of the PowerBrowser that spawned it ... the session is the row's own identity'.

**Suggested fix.** Make survivors a FAIL in attachVerdict. Include the daemon's descendants in stopOrcad's pid set.

**Verifier (CONFIRMED, low).** stopOrcad (orca-run.mjs:256-269) sends SIGTERM and then SIGKILL, waits up to 2 s more, and returns the pids still alive. The host bundle stores only the count in notes.survivors (:502-503). main prints that as a 'note' line (:551), and attachVerdict never reads it, so the row passes. startOrcad spawns with detached: true (orca-run.mjs:179), which calls setsid on POSIX. The driver's leak leg first tests the row's process group with `kill -0 -- -$PID` and then searches the row's session (verify-platform.sh:6979-6982; verify-orcad-leak.mjs:9-10). A detached orcad is in neither. The leak leg's own header says the terminal daemon setsids and is never in the session. A survivor after SIGKILL needs a D-state or similar condition, which is uncommon, so I kept the severity at low. *Checked at:* scripts/verify-orca-browser-host-bundle.mjs:502-503,550-556; scripts/lib/orca-run.mjs:179,256-269; scripts/verify-platform.sh:6979-6982; scripts/verify-orcad-leak.mjs:9-10

## harness-static-browser-09: Raw-visibility structural clause matches only === and !== comparisons

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-browser-tab-scope.mjs:889`

**What is wrong.** The clause 'every overlay visibility read goes through overlayShownToUser' (A1) counts only `.style.visibility ===` or `!==`. A loose `==`/`!=`, a `switch (b.style.visibility)`, `b.style['visibility']`, `getPropertyValue('visibility')` or getComputedStyle(...).visibility read outside the predicate is not counted. Such a read misjudges a parked agent overlay (visible under the Theia frame) as shown to the user.

**Scenario.** A new handler writes `if (entry.browser.style.visibility == 'visible') { focusOverlay(entry) }`. A parked agent overlay is treated as user-visible and receives focus or input routing. The visibility clause stays green.

**Evidence.** scripts/verify-orca-browser-tab-scope.mjs:889 `for (const m of src.matchAll(/\.style\.visibility\s*[!=]==/g)) {`

**Suggested fix.** Match every read of the visibility property: `\.style(\.visibility|\[\s*['"]visibility)` not on an assignment's left-hand side, plus getComputedStyle/getPropertyValue('visibility'). Better, walk the acorn AST for MemberExpressions named visibility. Add self-test plants for the `==` and switch forms.

**Verifier (CONFIRMED, low).** I checked the code at the cited line and it does what the finding says. visibilityReads (scripts/verify-orca-browser-tab-scope.mjs:879-895) comment-strips the whole PowerBrowserAPI.sys.mjs source (checkSource at :1199). It then flags only matches of /\.style\.visibility\s*[!=]==/ that fall outside the overlayShownToUser body (:889). The following reads are not matched, so they pass silently: a loose `==`/`!=`, `switch (x.style.visibility)`, `style['visibility']`, `getPropertyValue('visibility')`, `getComputedStyle(b).visibility`, destructuring `const { visibility } = b.style`, and a bare truthiness or assignment read such as `const v = b.style.visibility`. The self-test plants only the strict `===` form (:1253), so nothing shows the clause covers anything wider. The header comment (:16-18) limits the clause to `===`/`!==`. The summary string (:1384) claims more: 'every visibility read goes through overlayShownToUser'. So the gate's stated guarantee is broader than what it checks. The shipped source today has only one comparison read, inside the predicate (PowerBrowserAPI.sys.mjs:11226), so there is no live bug. The finding concerns a future regression the clause would not catch. The behavioural parking scenarios (:542-548) test overlayShownToUser and the sliced methods only. A new handler outside the sliced set that reads visibility with `==` is not run by them either. Nothing elsewhere in the harness closes this gap. This is a harness hardening gap for a hypothetical future edit, not a check that fails to go red on its documented case, so I rate it low. *Checked at:* scripts/verify-orca-browser-tab-scope.mjs:889 `src.matchAll(/\.style\.visibility\s*[!=]==/g)`; the self-test plant at :1253 uses the strict `===` form only; the summary claim at :1384 says 'every visibility read goes through overlayShownToUser'; the only current comparison read is at powerbrowser/shell/PowerBrowserAPI.sys.mjs:11226, inside the predicate.

## harness-static-browser-08: orca-browser-tools compares two hand-kept lists; new Orca browser tools at a re-pin are never detected

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-browser-tools.mjs:76`

**What is wrong.** The expectation, the U-rows, is parsed from the spike README table, which is hand-written. It is compared with the hand-written ORCA_BROWSER_TOOLS map. Neither side is derived from the pinned Orca source, so a re-pin that adds a user-facing browser tool (a new toolbar control or command in components/browser-pane) leaves both lists unchanged and green. A `skip` entry also passes with any non-empty reason.

**Scenario.** Orca vX adds a 'Record page' tool to the browser chrome. After the re-pin, orca-browser-tools still reports '30 U-rows equal the map's 30 entries', and BRW-05 ('every user-facing tool has a home') is silently incomplete.

**Evidence.** scripts/verify-orca-browser-tools.mjs:76-78 `export function parseURows(readme) { return readme.split('\n').map((l) => /^\|\s*(U-\d+)\s*\|/.exec(l)?.[1]).filter(Boolean); }` with :40 readme '.planning/spikes/005-orca-browser-parity/README.md'; :145-146 compare with ORCA_BROWSER_TOOLS keys.

**Suggested fix.** Derive the tool set from the pinned source, for example the command ids and toolbar components under orca/src/renderer/src/components/browser-pane, the way orca-browser-parity derives RPC abilities. Compare it as set equality with the U-row table, so a new upstream tool goes red until it is mapped.

**Verifier (CONFIRMED, low).** The rows come from parseURows over the tracked spike README (:40, :76-78). The map is the hand-written ORCA_BROWSER_TOOLS. judge (:140-145) compares the two sets with each other. The check reads no file under orca/, so neither side comes from the pinned Orca browser-pane source. A re-pin that adds a toolbar control changes neither list and stays green. A skip entry passes with any non-blank string (:156). The header's 'derived at check time' applies only to parsing the hand-written README. scripts/orca-browser-parity.mjs has no U-row derivation either. *Checked at:* scripts/verify-orca-browser-tools.mjs:40,76-78,140-145,156,198-210

