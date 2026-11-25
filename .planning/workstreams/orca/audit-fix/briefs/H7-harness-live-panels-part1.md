# Fix brief: H7-harness-live-panels-part1

Lane: harness. Items: 12. Files this group owns: `scripts/verify-orca-side-panel-live.mjs`, `scripts/verify-orca-pane-css-live.mjs`, `scripts/verify-orca-pane-standalone-live.mjs`, `scripts/verify-orca-workspace-live.mjs`, `scripts/verify-orca-add-project-live.mjs`, `scripts/verify-orca-landing-logo-live.mjs`, `scripts/lib/orca-pane-harness.mjs`, `scripts/verify-page-furniture-live.mjs`.

Item IDs: harness-live-panels-01; harness-live-panels-03; harness-live-panels-04; harness-live-panels-10; harness-live-panels-02; harness-live-panels-09; harness-live-panels-16; harness-live-panels-17; harness-live-panels-07; harness-live-panels-08; harness-live-panels-13; harness-live-panels-05.

## harness-live-panels-01: Every live row in this shard prints SKIP and exits 0, which the driver counts as PASS

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-pane-css-live.mjs:421`

**What is wrong.** Each live script returns 0 after printing a SKIP line when an artifact is absent. verify-platform.sh does not parse output for SKIP; exit 0 is PASS. The same pattern is in all six live rows. This is the known agent-status-live defect, repeated here. Several of these rows guard security-relevant requirements: landing-logo (origin gate for the injected mark, INJ-01) and pane-standalone (session-only pairing, API clauses).

**Scenario.** A --gate run on a tree where orca/out/web/assets/pb-panes, the Orca CLI, or theia/node_modules/typescript is missing or stale. skipReasons() or prerequisites() returns a reason, the script prints 'SKIP -- ...' and exits 0, and the registry row is recorded PASS. Nothing was measured.

**Evidence.** css-live:421 `if (skips.length) { console.log(`${NAME}: SKIP -- ...`); return 0; }`; standalone-live:439 same; add-project-live:210-212 (three SKIPs, return 0); workspace-live:254 `if (ready.skip) {... return 0; }`; side-panel-live:493,495; landing-logo-live:152. grep of scripts/verify-platform.sh finds no SKIP handling beyond comments.

**Suggested fix.** Make the driver treat a row whose output contains a SKIP line as not-green under --gate (a named exclusion list like the WINDOWS.md one), or exit with a distinct code that the driver maps to 'skipped, not passed'. Under --gate every live row must have measured.

**Verifier (CONFIRMED, medium).** css-live:421 prints SKIP and returns 0 when harness.skipReasons() is non-empty. verify-platform.sh has no SKIP parsing; its SKIP mentions are only comments. Registry rows are plain 'node script' commands (e.g. :6811, :6828), so exit 0 is recorded as PASS. A --gate run on a tree missing the built bundle or the CLI records PASS having measured nothing. Severity is medium rather than high because the prerequisites are build artifacts that a gate run normally has, and the rows do go red on real failures once they run. *Checked at:* scripts/verify-orca-pane-css-live.mjs:421; scripts/verify-platform.sh:6811 (no SKIP handling)

## harness-live-panels-03: Side-panel egress clause judges nearly the whole run under the lenient user-action verdict

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-side-panel-live.mjs:820`

**What is wrong.** The user-action marker is fetched immediately before activateMode('orca'), and every clause (a to m) runs after it. hostsAfterMarker therefore returns almost every host first resolved during the run, and egressVerdict judges those with userAction:true. A host whose allowlist disposition is user-initiated passes even if the Orca panels resolved it unattended. The unattended verdict applies only to hosts first resolved before the marker, i.e. boot-time hosts.

**Scenario.** Orca's sidebar or Landing starts an automatic request to github.com or a .onorca.dev host while rendering. Both are user-initiated in endpoint-allowlist.json. The host first resolves after the marker, so violations(..., {userAction:true}) skips it and clause i passes, although the requirement (P65-24) is that rendering the panels makes no unattended call.

**Evidence.** side-panel:518-519 marker fetch then `activateMode('orca')`; :820 `const afterAction = hostsAfterMarker(logBase, ACTION_HOST);` :351-352 `violations(allowlist, observed.filter(h => after.has(h)), { userAction: true })`; endpoint-verdict.mjs:21-27 `d === 'user-initiated' && userAction` continues.

**Suggested fix.** Place the user-action marker only around a real user action (the mode switch click) and take a second marker after it; judge everything resolved after the action settles with the unattended verdict.

**Verifier (CONFIRMED, medium).** The marker fetch happens at side-panel:517-518, immediately before activateMode('orca'). Every Orca panel render therefore falls after the marker. egressVerdict (:340-352) applies the user-action verdict to all hosts first resolved after the marker, so a user-initiated host such as github.com passes even if the panels resolved it unattended. The unattended verdict covers only boot-time hosts. The comment shows this is intended, but it weakens the P65-24 unattended-call check. An unlisted host still goes red. *Checked at:* scripts/verify-orca-side-panel-live.mjs:517-518,820; egressVerdict :340-352

## harness-live-panels-04: Width clause m can pass with zero web tabs added

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-side-panel-live.mjs:772`

**What is wrong.** The loop that adds WEB_TABS web tabs with the '+' button does `if (!at) break;` when the button is not found and ignores the result of `until(...)` after each click. widthVerdict only compares before and after widths. If no tab was added, before equals after and the 'after 3 web tabs' pass is vacuous. This is exactly the owner's reported regression path.

**Scenario.** The New Tab button's aria-label changes or the button is hidden in the Orca mode. `at` is null on the first iteration, the loop breaks, widths are unchanged, and keep[0] is green. Any tab-driven width regression is invisible.

**Evidence.** side-panel:772-779 `if (!at) break; ... await until(() => ...getWidgets('main').length > window.__pbMainCount, 5000)` with no check of the count; :779 `mObs.keep.push({ when: `after ${WEB_TABS} web tabs...` ...})`; widthVerdict :304-311 has no tabs-added field.

**Suggested fix.** Record the main-area widget count before and after, put tabsAdded in the observation, and make widthVerdict red (blind) when it is less than WEB_TABS.

**Verifier (CONFIRMED, medium).** The loop at :765-775 breaks when the New Tab button is not found. It does not check that the main widget count increased after the click. widthVerdict (:304-311) compares only before and after widths, with no tabs-added field. If no tab is added, before equals after and keep[0] passes without testing a tab-driven width change. WEB_TABS=3 (:148). *Checked at:* scripts/verify-orca-side-panel-live.mjs:765-779, widthVerdict :304-311

## harness-live-panels-10: workspace-live leaks orcad processes and real-home worktree directories when the run throws

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-workspace-live.mjs:456`

**What is wrong.** The SIGKILL of the recorded orcad/daemon pids runs after withProbeShell returns normally, inside the try but not in the finally. Any throw (a failed pollFor, orca CLI error, bundle boot failure) skips it. Separately the 'ws-live' and 'ws-live-2' worktrees are created by Orca under its workspaceDir, which the script itself notes is the host's ~/orca/workspaces/<repo>/; cleanup runs only at the end of the success path and rmdirSync removes only empty directories.

**Scenario.** orca('worktree','create') succeeds, then (b) throws. The harness error is recorded, the scratch repo is deleted, the orcad and daemon processes stay running and bound to their ports, and ~/orca/workspaces/repo/ws-live remains on the user's disk with a dangling git worktree.

**Evidence.** workspace-live:439 comment 'Orca creates worktrees under its workspaceDir (the host's ~/orca/workspaces/<repo>/)'; :456 `for (const [pid, ticks] of recorded) signalIdentity(pid, ticks, 'SIGKILL');` placed after `await live.withProbeShell(...)` and before `} catch (e)`; :459-465 finally has no kill and removes only empty parents.

**Suggested fix.** Move the signalIdentity loop into the finally block; give orcad a scratch workspaceDir so no worktree lands under the real HOME; remove created worktrees through Orca in the finally.

**Verifier (CONFIRMED, medium).** The SIGKILL loop at workspace-live:456 sits after await withProbeShell(...) in the try body. The finally at 459-465 has no kill, so any throw skips it. withProbeShell's own finally only disposes the profile and does not signal orcad. Worktree cleanup (orca worktree rm and the rmdirSync of empty parents) runs only on the success path inside the callback, and the script's own comment says worktrees are created under the host's ~/orca/workspaces/<repo>/. A throw after worktree create leaves the worktree directory and the orcad/daemon processes behind. Whether withShell's browser kill ends orcad on its own is the only runtime-dependent point, and the script's explicit SIGKILL suggests it does not. *Checked at:* scripts/verify-orca-workspace-live.mjs:439,456,459-465; scripts/lib/pb-live-probe.mjs:57-67

## harness-live-panels-02: Live harness rows share one fixed scratch tree and symlink but only landing-logo takes the live lock

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/orca-pane-harness.mjs:75`

**What is wrong.** withOrcaPaneSession deletes and recreates .mozbuild/orca-pane-harness/repo and orca-profile and re-points the fixed alias pb-orca-pane-harness on every run. The headers say to run under flock pb-live.lock, but the registry rows are plain `node script` commands. Only verify-orca-landing-logo-live.mjs re-execs itself under flock; css-live, pane-standalone, add-project, workspace and side-panel do not.

**Scenario.** A developer runs scripts/verify-orca-pane-css-live.mjs while verify-platform.sh runs orca-pane-standalone-live (or two gate runs overlap). The second run's makeProfile rmSync's PROFILE_REAL and replaces the alias under the first run's live orcad, and makeRepo deletes the repo that run has registered. The first run then fails or passes on corrupted state.

**Evidence.** harness:89-96 `rmSync(PROFILE_REAL, { recursive: true, force: true }); ... rmSync(alias); symlinkSync(PROFILE_REAL, alias);` and :75-76 `rmSync(REPO_DIR, ...)`; no flock call in these scripts or in verify-platform.sh (grep 'flock' finds only comments).

**Suggested fix.** Make withOrcaPaneSession (and the other live entry points) acquire the pb-live.lock itself, as landing-logo does, or use a per-process mkdtemp work dir and alias name.

**Verifier (CONFIRMED, low).** makeRepo and makeProfile in lib/orca-pane-harness.mjs rmSync fixed directories (lines 75 and 89) and re-point the alias (lines 91-96). Flock appears in the live scripts only in header comments, except landing-logo (:145) and a few other rows, which re-exec under the lock. The cited rows do not take the lock. The collision needs two overlapping runs. The driver runs rows serially, so it needs a second concurrent invocation by a developer, which makes this a hardening gap. *Checked at:* scripts/lib/orca-pane-harness.mjs:75-96; flock grep shows no re-exec in css-live, standalone-live, add-project-live, workspace-live or side-panel-live

## harness-live-panels-09: gateRow counts a loading skeleton as mounted and hand-lists two kinds as empty by design

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/orca-pane-harness.mjs:283`

**What is wrong.** gateMount counts every descendant of [data-pb-orca-pane-root]; a spinner or skeleton satisfies descendantCount > 0 (stage 1's mountOne rejects the 'waiting' state, the gate does not). EMPTY_BY_DESIGN is a hand-kept two-entry list: a mount of orchestration or page:creation that renders nothing because it is broken is recorded as mounted, with no check that Orca's own state (setting off, nothing pending) is the cause.

**Scenario.** The orchestration mount fails silently and renders no elements. gateRow returns mounted true with empty set from the hand-kept reason, and gate PASS names 'empty by Orca's own state'.

**Evidence.** harness:268-271 EMPTY_BY_DESIGN; :282-283 `const empty = o.descendantCount === 0 && !first && EMPTY_BY_DESIGN[o.kind] ? ... ; const mounted = !first && (o.descendantCount > 0 || !!empty);`; :309 `descendantCount: host ? host.querySelectorAll('[data-pb-orca-pane-root] *').length : 0`.

**Suggested fix.** Reject the waiting marker as stage 1 does, and for empty-by-design kinds read the setting or state that justifies emptiness and fail when it does not hold.

**Verifier (CONFIRMED, low).** gateRow sets mounted = !first && (descendantCount > 0 || !!empty). descendantCount counts every element under [data-pb-orca-pane-root], so a spinner or skeleton passes. For orchestration and page:creation, a zero-element mount with no error is recorded as mounted with a hand-kept reason, and nothing checks Orca's state. Narrow impact: errors, React mount errors and the error-boundary fallback are still caught. *Checked at:* scripts/lib/orca-pane-harness.mjs:268-271, 282-283, 309

## harness-live-panels-16: Harness static server crashes on a malformed URL and fixture git calls read the user's global git config

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/orca-pane-harness.mjs:126`

**What is wrong.** The request handler calls decodeURIComponent on the raw path with no try/catch; a request to /%zz throws URIError inside the handler and terminates the verification process. Any local process can send it to the loopback port. Separately makeRepo (and workspace-live's buildFixtureRepo) run git with the real HOME, so the user's global config (commit.gpgsign, core.hooksPath, hooks) applies to the fixture commits.

**Scenario.** A local process requests http://127.0.0.1:<port>/%zz while a live row runs; the harness dies mid-run and the orcad survives. Or a global commit.gpgsign=true makes the fixture commit prompt or fail.

**Evidence.** harness:126 `const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));` no guard; :69 `spawnSync('git', ['-c','user.name=pb-orca-pane', ...], { cwd: REPO_DIR, encoding: 'utf8' })` with inherited env; workspace-live:277 `gitEnv = { PATH, HOME: savedEnv.HOME }`.

**Suggested fix.** Wrap the handler body in try/catch returning 400; run fixture git with GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1 and -c commit.gpgsign=false -c core.hooksPath=/dev/null.

**Verifier (CONFIRMED, low).** serve() calls decodeURIComponent on the raw pathname inside the request handler with no try/catch. A request to /%zz throws URIError synchronously in the handler, which is an uncaught exception that kills the process. The server binds loopback, so any local process can send it. The fixture git calls use the inherited env in orca-pane-harness and HOME from the real environment in workspace-live, so a global commit.gpgsign or hooksPath would apply. This is a local test-harness robustness issue only. *Checked at:* scripts/lib/orca-pane-harness.mjs:126, 69; scripts/verify-orca-workspace-live.mjs:277

## harness-live-panels-17: Self-tests cover only the pure verdicts, not the live collectors that feed them

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-add-project-live.mjs:281`

**What is wrong.** add-project, workspace, landing-logo, side-panel and css-live self-tests exercise comparator functions on fixtures. None plants a fault into the collection code (the add-project steps, the width-tab loop, the Theia snapshot key set, the pane scan set), so a collector that stops measuring cannot make the self-test red. The vacuous loops found above (web tabs, side probe compared count) are not reachable by any self-test case.

**Scenario.** A selector derivation returns a stale label so the drive step does nothing; the comparator self-test still passes and the live row's reliability depends on the verdict's own blind checks.

**Evidence.** add-project:284-292 cases call addProjectVerdict only; workspace-live:130-170 comparators and root-sync only; landing-logo:92-107 verdicts only; side-panel:880-935 comparator fixtures only.

**Suggested fix.** For each live collector add a fixture-driven or planted-fault self-test (an observation with zero compared items or zero actions executed must be red), and give each verdict an explicit 'nothing measured' clause.

**Verifier (CONFIRMED, low).** I read the self-tests. add-project selfTest (verify-orca-add-project-live.mjs:283-300) loops over cases and calls addProjectVerdict only. workspace-live selfTest (~125-170) calls only blobVerdict, rootsVerdict, closeVerdict, migrationVerdict and the root-sync pure functions. landing-logo selfTest (88-110) calls only markVerdict, controlVerdict, theiaVerdict and remountVerdict. side-panel selfTest (878-947) plants comparator fixtures. None of them plants a fault in the drive or collection code, so a collector that measures nothing cannot turn a self-test red. Mitigating, as the finding concedes: several verdicts have blind-input cases, such as count 0 giving 'selector blind' and a Theia query that finds nothing giving 'proves nothing'. These guard the live row only when the collector reports a zero count. A collector that drives nothing and returns plausible data is not covered. This is a hardening gap in the harness, not a security issue. *Checked at:* scripts/verify-orca-add-project-live.mjs:283-300 (addProjectVerdict only); scripts/verify-orca-landing-logo-live.mjs:88-110 (verdict functions only); scripts/verify-orca-workspace-live.mjs:125-170 (comparators and pure root-sync functions only)

## harness-live-panels-07: css-live side-panel and portal probes can pass having compared nothing

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-pane-css-live.mjs:95`

**What is wrong.** probeVerdict checks controlDelta, theiaChanged, paneChanged and portalChanged but never that anything was compared. In sideProbes, side.measured is set true as soon as both sidebar roots exist, even if the Add-project button is absent in both documents (the addReady poll failure is swallowed); the tooltip step then compares the keys common to both documents, which can be none, giving portalChanged [] with portalCompared 0. Missing Theia elements record 'absent' in both snapshots and compare equal. The portal probe has no planted control at all.

**Scenario.** Orca's Add-project button label changes. addReady times out silently, __pbSideStyles records 'side-add|present: absent' for both documents, the tooltip never opens, tipKeys is empty, and the side-panel probe prints PASS with 'portal 0 of 0'. A leak of Theia CSS into Orca's tooltip would equally be unmeasured.

**Evidence.** css-live:356 `try { await lib.pollFor(...) } catch { /* measured below */ }`; :364 `side.measured = true;` :379-381 `tipKeys = ...; side.portalChanged = diffMaps(...); side.portalCompared = tipKeys.length;` :95-102 probeVerdict has no compared check; cssVerdict :115 requires popper and a non-popper kind but plants no portal control (pane :113 and probes have controls, portal does not).

**Suggested fix.** Require portalCompared >= 1 and that side-add exists in both documents; add a planted portal control that must register; require a minimum count of non-'absent' Theia snapshot keys.

**Verifier (CONFIRMED, low).** probeVerdict (:95-102) has no check that anything was compared. addReady failure is swallowed (:356). side.measured is set true whenever both sidebar roots exist (:364). tipKeys can be empty, which gives portalCompared 0 and portalChanged []. The side-panel probe then passes. The main portal probe in cssVerdict does require popper and non-popper kinds (:115), so the Add-project/side tooltip comparison is the unmeasured part. The path needs Orca's Add-project label to change, which is a plausible re-pin drift. *Checked at:* scripts/verify-orca-pane-css-live.mjs:95-102,356,364,379-381

## harness-live-panels-08: Pairing containment clauses read the subject's own state and one hand-named localStorage key

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-pane-standalone-live.mjs:145`

**What is wrong.** apiVerdict accepts 'session-only pairing' when window.PbPanes.state().pairing reports sessionOnly true and deviceKeySupport 'session-no-ed25519' (the bundle's own report), and checks only that localStorage key orca.web.runtimeEnvironment.v1 is absent. No scan covers other localStorage keys, sessionStorage or IndexedDB for the pairing material. The control (marker read-back) proves only that the key reader works.

**Scenario.** A re-pin or overlay change persists the pairing or a device key under a different key or in IndexedDB. state().pairing still reports sessionOnly and the named key is absent, so the API clause stays green while a credential persists in the page origin's storage.

**Evidence.** standalone-live:361 `obs.pairing = JSON.parse(await ev('JSON.stringify(window.PbPanes.state().pairing)'))`; :364 `obs.envKeyPresent = await ev(`localStorage.getItem('orca.web.runtimeEnvironment.v1') !== null`)`; :145-146 verdicts. Other rows (orca-offer-scan) cover the profile, not this page origin.

**Suggested fix.** Enumerate localStorage, sessionStorage and IndexedDB names and values on the page and assert the pairing string (read from the harness's in-memory copy) appears in none, with a planted control that writes it.

**Verifier (CONFIRMED, low).** apiVerdict (:145-146) judges pairing from the bundle's own state().pairing report, read at :361. It checks only the single localStorage key orca.web.runtimeEnvironment.v1 (:364). Other localStorage keys, sessionStorage and IndexedDB are not scanned. The marker read-back proves only that the key reader works. The gap is real, but it needs a future change to Orca's persistence. A separate profile-level offer scan (orca-offer-scan) covers other storage, which I did not re-read. *Checked at:* scripts/verify-orca-pane-standalone-live.mjs:145-146,361-364

## harness-live-panels-13: pane-standalone-live degrades files.open failure to a log line and retries stage 0 once

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-pane-standalone-live.mjs:383`

**What is wrong.** If the CLI's files.open produces no record within 5 s, the check prints 'unreachable from the paired client' and switches to openPane('editor'); apiVerdict accepts either driver, and the 1 s bound applies only to files.open. Stage 0 (isolated per-leaf mount) is rerun once after a failure and passes if the second attempt is green.

**Scenario.** files.open regresses so the paired client never receives the tab, or the isolated mount fails intermittently with 50% frequency. Both runs report PASS.

**Evidence.** standalone-live:382-388 `if (!record) { console.log(`${NAME}: files.open: unreachable ...`); driver = "openPane('editor')"; ...}`; :460-465 `if (verdict) { const first = verdict; obs = await stage0(...); verdict = isolatedVerdict(obs); ...`; :152 limit applies only when driver === 'files.open'.

**Suggested fix.** Fail on a files.open miss (record the driver as a red clause), and report a stage 0 first-attempt failure as a flaky failure rather than green.

**Verifier (CONFIRMED, low).** If no files.open record appears within 5 s, the script logs 'unreachable' and falls back to openPane('editor'). The files.open driver is printed. Stage 0 is rerun once after a failure, and the first attempt's failure text is appended to the verdict only when the second also fails. A files.open regression is therefore masked as a log line and a green result. This is deliberate resilience that weakens the check. *Checked at:* scripts/verify-orca-pane-standalone-live.mjs:382-388, 455-463

## harness-live-panels-05: Squeeze assertion has only a lower bound, so 'stops at Orca's minimum' is not checked

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-side-panel-live.mjs:325`

**What is wrong.** widthVerdict requires the squeezed width to have narrowed and to be no less than min - tolerance. It never checks that the width reached Orca's minimum. A squeeze that stops at any larger width (for example a wrong clamp at 300) passes although the drag goes to the window edge.

**Scenario.** A Lumino or Theia clamp stops the left panel at 300 px while Orca's MIN_WIDTH is 220. sq.after 300 < sq.before 320 - 2 is true and 300 >= 218, so the clause is green.

**Evidence.** side-panel:324-325 `else if (!(sq.after < sq.before - tol)) ...; else if (sq.after < min - tol) ...` - no upper bound on sq.after.

**Suggested fix.** Also fail when sq.after > min + tol, because the squeeze drag travels to the window edge.

**Verifier (CONFIRMED, low).** widthVerdict (:324-325) requires only that the squeezed width narrowed and is at least min minus tolerance. There is no upper bound, so a clamp at 300 px passes against an Orca minimum of 220 px. This is a weaker assertion than the clause name 'stops at Orca's minimum' implies. *Checked at:* scripts/verify-orca-side-panel-live.mjs:324-325

