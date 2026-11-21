# Fix brief: H6-harness-live-tabs

Lane: harness. Items: 13. Files this group owns: `scripts/verify-orca-tabs-live.mjs`, `scripts/lib/orca-tabs-live.mjs`, `scripts/verify-orca-terminal-keys-live.mjs`, `scripts/verify-orca-relaunch-restore-live.mjs`, `scripts/verify-mode-switch-tabs-live.mjs`, `scripts/verify-tab-strip-live.mjs`.

Item IDs: harness-live-tabs-05; harness-live-tabs-01; harness-live-tabs-02; harness-live-tabs-03; harness-live-tabs-13; harness-live-tabs-06; harness-live-tabs-04; harness-live-tabs-07; harness-live-tabs-08; harness-live-tabs-09; harness-live-tabs-12; harness-live-tabs-10; harness-live-tabs-11.

## harness-live-tabs-05: relaunch-restore ignores the result of the Setup restore and mode-switch commands

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-relaunch-restore-live.mjs:462`

**What is wrong.** s.command swallows every error and returns false; restoreSetup(), mode() and the command ids (SAVE, RESTORE, ACTIVATE read by regex, null if the source moved) are never checked after launch 1's save. Launch 2 asserts dock, modes, identity and terminals against saved state, but Theia's own layout restore after a normal relaunch (the observer's restore hold exists for that) can reproduce the same state with Setups' restore command failing. If ACTIVATE is null every s.mode() is a no-op, so 'modes' compares the same main-area tab list under both mode names.

**Scenario.** setups-commands.ts renames its restore command id or the restore throws; restoreSetup returns false, nothing reads it, the dock, modes and identity clauses compare against Theia's own restored layout and PASS; criterion 4 (a saved Setup restores) is unproven.

**Preconditions.** The restore or activate command fails or its id constant moves.

**Evidence.** scripts/verify-orca-relaunch-restore-live.mjs:462 `await s.restoreSetup(SETUP_NAME);` (value dropped); 335-337 `async command(id, ...args) { return probe(`try { await ...executeCommand(...); return true; } catch (e) { return false; } `);}`; 338 `async mode(id) { await s.command(ACTIVATE, id); await sleep(800); }`; 275-277 `sourceConst(...)` may return null.

**Suggested fix.** Throw when sourceConst returns null, and require restoreSetup() and each mode() to return true; add a positive control that the restore changed something (e.g. close a tab before restoring and require it back only via the Setup).

**Verifier (CONFIRMED, medium).** launch 1's saveSetup result is checked and throws on failure (line 451). Launch 2's restoreSetup result is dropped at line 462. s.command returns false on any error. mode() ignores the result as well, and the ACTIVATE and RESTORE constants can be null if the source moves. The relaunch comparisons could then pass on Theia's own layout restore. Whether that restore reproduces the saved dock exactly is runtime-dependent, so the consequence is credible but not proven. *Checked at:* scripts/verify-orca-relaunch-restore-live.mjs:335-337, 338, 359, 451, 462

## harness-live-tabs-01: A SKIP (exit 0) from a live row is counted PASS by the driver and by --gate

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-tabs-live.mjs:943`
- **Owner decision cited:** D-60 (only for orca-agent-status-live's SKIP inside the gate; it does not cover these three rows)

**What is wrong.** orca-tabs-live, orca-terminal-keys-live and orca-relaunch-restore-live print 'SKIP -- <reason>' and exit 0 when the built PowerBrowser, the Theia app, orca/ or a lane is absent. verify-platform.sh decides PASS or FAIL from the exit status alone and never inspects output for SKIP, so the row is recorded 'PASS' and the gate prints 'every registered check is green'. Stages l (route containment) and m (pairing-offer containment) of orca-tabs-live guard security requirements and are never exercised on such a run.

**Scenario.** A CI runner or a developer checkout with no objdir/ and no orca/ build runs verify-platform.sh --gate. All three live rows exit 0 with a SKIP line; the summary lists them as PASS; the gate reports PASS. A regression in the pb-panes route or in offer containment is never seen. This is the same mechanism as the known agent-status-live SKIP counted PASS in gate run 4.

**Preconditions.** Gate or full run on a tree where any prerequisite (objdir binary, theia lib/backend/main.js, orca/out/orcad, pb-panes bundle) is absent.

**Evidence.** scripts/verify-orca-tabs-live.mjs:943 `if (pre.skip) { console.log(`${NAME}: SKIP -- ${pre.skip}`); return 0; }`; scripts/verify-orca-terminal-keys-live.mjs:939 `if (r.skip) { say(`SKIP -- ${r.skip}`); return 0; }`; scripts/verify-orca-relaunch-restore-live.mjs:536 `if (pre.skip) {... return 0; }`; scripts/verify-platform.sh:6975-6985 `setsid $cmd & ... wait "$CURRENT_CHECK_PID" || row_ok=0 ... SUMMARY+=("$label: PASS")` with no output inspection.

**Suggested fix.** Have the driver treat a row whose output contains a line matching '^<label>: SKIP' as SKIP, not PASS, and make --gate refuse (or list as NOT RUN) any SKIP not named in GATE_KNOWN_OPEN_EXCLUSIONS; or give the live rows a distinct exit code (e.g. 77) that the driver maps to a gate failure.

**Verifier (CONFIRMED, medium).** I traced the whole path myself. (1) The cited code exists and does what the finding says. verify-orca-tabs-live.mjs:943 prints "SKIP --" and returns 0 when lib.prerequisites() returns a skip. That function returns a skip, never a fail, in these cases: orca-panes is absent, the objdir firefox binary is absent, the Theia backend main.js is absent, orca/out/orcad is absent, or the panes bundle is absent (scripts/lib/orca-tabs-live.mjs:91-104). verify-orca-relaunch-restore-live.mjs:536 does the same through livePrerequisites() (lines 213-221), which also skips while lane p65-01 is unmerged. verify-orca-terminal-keys-live.mjs:939 returns 0 on r.skip, which run() sets from base.skip (line 810). (2) The driver's run loop (verify-platform.sh, about lines 6973-6990) runs `setsid $cmd &`, waits, and records "$label: PASS" whenever the exit status is 0 and the orcad leak check finds nothing. It never reads the row's output. (3) run_gate_mode (verify-platform.sh:7129-7206) only acts when rc is non-zero, and then only on labels that extract_failed_labels (7066-7067) finds as "  label: FAIL" lines. A SKIP row is recorded as PASS, so with no other red the gate prints "--gate PASS -- ... every registered check is green at this commit" (7200). The only SKIP-is-red logic in the tree is inside rebase-orca.sh's self-test (comment at 3962), not in the driver. (4) The precondition is real and cheap: any checkout or runner with no objdir build or no built orca/. I found no guard that turns SKIP into a failure under --gate. Why medium and not high: the check is not one that "cannot go red". On any tree where the build exists, stages l (route) and m (offer) run and can fail. The gap is a false-green gate summary on unbuilt trees, and the SKIP line still appears in the printed log. That is a concrete defence-in-depth and process gap. The tree accepts the same SKIP-passes pattern elsewhere and comments on it ("ON A TREE WITH NO generated/, THIS ROW SKIPS AND PASSES", around line 4754). I found nothing in DECISIONS.md that accepts this risk for the live rows. Even if an owner decision did accept it, the finding would still stand. *Checked at:* scripts/verify-orca-tabs-live.mjs:943 (SKIP returns 0); scripts/lib/orca-tabs-live.mjs:91-104 (missing prerequisites are a skip, not a fail); scripts/verify-platform.sh about 6973-6990 (PASS decided by exit status alone); scripts/verify-platform.sh:7066-7067 and 7199-7200 (gate only matches lines ending ": FAIL", then prints "every registered check is green")

## harness-live-tabs-02: no-tab-chrome and offer-storage absences go green when the page probe returns an error object

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-tabs-live.mjs:672`

**What is wrong.** ctx.probe returns `{ error: 'probe threw: ...' }` (pb-relaunch.probe) instead of throwing when the page body throws. Two absence judgments consume probe results without checking for that shape. theiaMatches = {error:'...'} yields entries [['error','probe threw...']]; the string is never > 0, so chromeVerdict reports no match and the stage is PASS. The storage probe feeding the offer places becomes `storage?.local ?? ''`, so the offer is judged absent from localStorage and sessionStorage.

**Scenario.** The Theia-side querySelectorAll probe (or the storage probe) throws (frontend mid-reload, a selector derived from Orca source that is not a valid CSS selector, page error). Stage i and the Theia-storage half of stage m report PASS having inspected nothing.

**Preconditions.** A page-side exception in those two probes.

**Evidence.** scripts/verify-orca-tabs-live.mjs:672 `const theiaMatches = await ctx.probe(`const out = {}; for (const s of ... out[s] = document.querySelectorAll(s).length ...`);` then chromeVerdict: `Object.entries(obs.theiaMatches ?? {}).filter(([, n]) => n > 0)`; line 743-744 `const storage = await ctx.probe(...)`, `'the Theia document\'s localStorage': storage?.local ?? ''`. scripts/lib/pb-relaunch.mjs:85-89 `result = { error: 'probe threw: ' + e }`.

**Suggested fix.** In chromeVerdict require every selector key to be a finite number in theiaMatches and fail otherwise; in stage m fail when storage is null or has .error; add self-test plants for both.

**Verifier (CONFIRMED, medium).** probeExpression turns a page throw into {error:'probe threw: ...'} and probe() returns it parsed. For the no-tab-chrome probe, theiaMatches={error:string}. chromeVerdict filters entries with n>0; a string compared to 0 is false, so no failure is reported. For the storage probe, storage?.local ?? '' yields '', so those two places are searched as empty. Neither consumer checks for .error. Mitigation: the detector count catches an invalid selector (count().catch(()=>0)), which makes chromeVerdict go red. Other page throws (reload in flight, etc.) still pass silently. *Checked at:* scripts/lib/pb-relaunch.mjs:85-89; scripts/verify-orca-tabs-live.mjs:342-346, 672, 743-744

## harness-live-tabs-03: Offer-containment check has a trivial detector, covers only the full offer string, and no control per searched place

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-tabs-live.mjs:745`

**What is wrong.** Stage m's detector is bridgeFile.includes(offer) where offer was itself read from that same file (ctx.offerFromFile), so it always holds and proves nothing about whether the log, state, diagnostics and storage dumps can display an offer. Each of those places is searched with text.includes(offer) for the full offer URL only. The pairing input actually used (pairingInputFromFile: the fragment or token) is a different string and is never searched, so a leak of just the token passes. orcad's own stdout and log files, the profile and bridge folder other files are not searched, although the header claims 'none of the services' logs'. Empty or capped ring buffers (getRecentLog returning []) also pass.

**Scenario.** OrcaService logs `pairing=<token>` or the URL fragment without the origin, or orcad logs the pairing code to its own log. includes(offer) is false in every place; stage m is PASS.

**Preconditions.** A secret-bearing log line that is not byte-identical to the full offer URL.

**Evidence.** scripts/verify-orca-tabs-live.mjs:745 `fail('offer', offerVerdict({ detector: !!offer && !!bridgeFile && bridgeFile.includes(offer), foundIn: offer ? Object.entries(places).filter(([, text]) => text.includes(offer)).map(([p]) => p) : [] }));` with `offer = await ctx.offerFromFile()` (lib line 276-282 reads the same web-pairing file).

**Suggested fix.** Search for the pairing input (ctx.pairingInputFromFile) and its parts as well as the offer; plant a known-secret control into each place (or prove each dump non-empty and able to carry a planted string) before judging absence; include orcad's log files and the profile scan.

**Verifier (CONFIRMED, medium).** offer comes from the web-pairing file and the detector tests bridgeFile.includes(offer) on that same file, so it is true whenever the file is non-empty and cannot show that the search would notice a leak. Each place is searched only with the full offer string, so a leaked token or fragment alone is not matched. Only the ring-buffer logs, state, diagnostics and the two storages are searched, not orcad's own stdout or log files, despite the claim in the header. *Checked at:* scripts/verify-orca-tabs-live.mjs:397-400, 741-745; scripts/lib/orca-tabs-live.mjs:276-282

## harness-live-tabs-13: Live rows run git against the real HOME and overwrite the desktop clipboard

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/orca-tabs-live.mjs:311`

**What is wrong.** The scratch repository's git calls get HOME = the developer's real HOME (cliEnv.HOME from savedEnv.HOME), so ~/.gitconfig (commit.gpgsign, core.hooksPath, hooks) applies to the fixture commits and to makeConflict's merge. relaunch-restore's addRepository runs git with no env at all. terminal-keys-live writes the 100 KiB code, line text and sentinels to Gecko's clipboard and selection clipboard (setClipboard/setSelection), which are the developer's own when the run is headed, and does not restore them. The recorder files in .mozbuild/orca-terminal-keys-live are never removed.

**Scenario.** A developer with commit.gpgsign=true or a global pre-commit hook runs the live row; the fixture commit blocks on a signing prompt or runs the hook. A headed run replaces the developer's clipboard contents.

**Preconditions.** developer git config with signing or hooks; a headed run

**Evidence.** scripts/lib/orca-tabs-live.mjs:311 `execFileSync('git', ['-C', repo, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', ...a], { env: { PATH: basePath, HOME: cliEnv.HOME }, ...)`; scripts/verify-orca-relaunch-restore-live.mjs:322; scripts/verify-orca-terminal-keys-live.mjs:441-450, 561.

**Suggested fix.** Pass GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1 and -c commit.gpgsign=false, core.hooksPath=/dev/null to fixture git; save and restore the clipboards or document that headed runs clobber them.

**Verifier (CONFIRMED, low).** CONFIRMED: orca-tabs-live.mjs:311 runs git with HOME set to the real HOME, so global gitconfig signing and hooks apply to the fixture commits. The relaunch-restore git helper at line 322 passes no env, so it inherits everything. terminal-keys-live sets the clipboard and selection clipboard through setClipboard and setSelection (441-450) with no restore. On a headed run these are the developer's real clipboards. This is a hygiene and robustness issue with local-only impact. *Checked at:* scripts/lib/orca-tabs-live.mjs:311; scripts/verify-orca-relaunch-restore-live.mjs:322; scripts/verify-orca-terminal-keys-live.mjs:441-450

## harness-live-tabs-06: not-gone clause waits for NaN when the restore-hold constant moves

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-relaunch-restore-live.mjs:496`

**What is wrong.** holdMs comes from sourceNumber(OBSERVER_REL, 'ORCA_RESTORE_HOLD_MS'), NaN if the constant is renamed. `await sleep(Math.max(0, connectedAt + holdMs + 2000 - Date.now()))` then sleeps about 1 ms, and not-gone is judged before the observer's restore bound has elapsed, so a widget disposed as gone later is not seen. Only the quick self-test row catches the rename; the live row does not fail.

**Scenario.** The observer constant is renamed and the self-test row is not run; not-gone is PASS without waiting.

**Preconditions.** Constant renamed or moved.

**Evidence.** scripts/verify-orca-relaunch-restore-live.mjs:410 `const holdMs = sourceNumber(OBSERVER_REL, 'ORCA_RESTORE_HOLD_MS');` and 496 `await sleep(Math.max(0, connectedAt + holdMs + 2000 - Date.now()));`

**Suggested fix.** In runLive throw unless Number.isFinite(holdMs).

**Verifier (CONFIRMED, low).** sourceNumber returns NaN when the constant is not found. Math.max(0, NaN) is NaN, so sleep(NaN) lasts about 1 ms and not-gone is judged early. The --self-test does catch the rename at line 611, but the live run does not fail on it. *Checked at:* scripts/verify-orca-relaunch-restore-live.mjs:91, 410, 496, 611

## harness-live-tabs-04: Reload stage does not prove that a reload happened

- **Severity:** low
- **Verdict:** PLAUSIBLE
- **Location:** `scripts/verify-orca-tabs-live.mjs:700`

**What is wrong.** The reload is `location.reload()` via setTimeout, a fixed 1000 ms sleep, then a poll for FrontendApplicationStateService.state === 'ready'. If the unload is slower than 1 s (Orca's unload checkpoint or a beforeunload prompt can delay it), the old document still reads 'ready', all names are present, localStorage is the old one, and reloadVerdict is green with ms near 0. Nothing checks for a reload marker (performance.timeOrigin change, window.__pbAddWidgetLog reset). g3's second.reload() has the same shape.

**Scenario.** Reload is delayed or blocked; the probe runs against the pre-reload document; identity, bars and stored-key checks compare the document with itself and PASS, while the following stages run racing a real reload.

**Preconditions.** Slow or deferred unload.

**Evidence.** scripts/verify-orca-tabs-live.mjs:700-704 `await ctx.app.evaluate('setTimeout(() => location.reload(), 0), true').catch(() => undefined); await sleep(1000); await ctx.pollFor(() => ctx.probe(`return get('FrontendApplicationStateService').state === 'ready';`, 5000).catch(() => false), 120000, ...)`.

**Suggested fix.** Record performance.timeOrigin (or set a window flag) before the reload and require a different value, and the absence of window.__pbAddWidgetLog, before treating the frontend as reloaded; fail the stage otherwise.

**Verifier (PLAUSIBLE, low).** The code path is as described: a setTimeout reload, a fixed 1000 ms sleep, then a poll for state==='ready'. No marker proves that the document changed. Whether the unload takes more than 1 s depends on runtime behaviour that I cannot settle statically. The reload is normally prompt, and the later identity and bar comparisons would be self-comparisons only if the reload were delayed. *Checked at:* scripts/verify-orca-tabs-live.mjs:700-704

## harness-live-tabs-07: Stage c (terminal-agent) claims the real claude TUI starts but only checks that a widget was added

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-tabs-live.mjs:502`

**What is wrong.** The header states the real claude's TUI starts in the agent-opened terminal. The code only runs creationVerdict (a hosted terminal widget added within 1000 ms). No terminal read, TUI marker or echo is checked, so a claude that exits at once, or a stub, still passes.

**Scenario.** orca agent launch creates a pane whose process dies immediately; the widget is still added; stage c is PASS.

**Preconditions.** none

**Evidence.** scripts/verify-orca-tabs-live.mjs:502-503 `const c = await viaCli(['agent', 'launch', '--agent', 'claude', '--surface', 'terminal', '--worktree', ctx.worktree]); fail('terminal-agent', creationVerdict({ label: 'terminal-agent', kind: 'terminal', ...c }));`

**Suggested fix.** Poll lib.terminalText for the TUI's banner (or at least a non-empty read) from c.handle and add it to the verdict, or reword the header.

**Verifier (CONFIRMED, low).** Stage c only calls creationVerdict on the CLI result, which checks for a widget added and its kind. It reads no terminal content and checks for no TUI marker, so a process that exits immediately still passes. The comment claims more than the check covers. *Checked at:* scripts/verify-orca-tabs-live.mjs:501-503

## harness-live-tabs-08: Prompt-budget verdict and no-tab-chrome detector cannot fail from the live path as written

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-tabs-live.mjs:576`

**What is wrong.** promptOnce returns false once promptsSent >= 1, so promptsSent never exceeds 1 and promptBudgetVerdict(promptsSent) is a constant-green assertion in the live run (only the self-test drives it red). Separately, chromeVerdict's detector is the total across all derived selectors (second.count sums matches), so one selector present in Orca's client makes every other derived selector's absence in Theia count as detected even if that selector never renders in the client.

**Scenario.** A second prompt path is added that bypasses promptOnce; the budget still reads 1. A derived tab-chrome attribute that Orca never renders in that state is checked in Theia with no positive control for it.

**Preconditions.** none

**Evidence.** scripts/verify-orca-tabs-live.mjs:558-562 `if (promptsSent >= 1) return false; promptsSent += 1;`; 671 `const detectorMatches = second.error ? 0 : await second.count(selectors);` with count = `reduce((n, s) => n + document.querySelectorAll(s).length, 0)`.

**Suggested fix.** Count prompts where the composer is written to rather than in the guard; compute detector matches per selector and require each judged selector to have matched in the client.

**Verifier (CONFIRMED, low).** promptOnce returns false once promptsSent>=1, so promptBudgetVerdict(promptsSent) cannot exceed 1 through that path and only guards against a bypass of promptOnce. chromeVerdict's detector is the summed count across all selectors, so a single matching selector satisfies it for every selector. Both points are as described. *Checked at:* scripts/verify-orca-tabs-live.mjs:558-562, 671, 935, 342-345

## harness-live-tabs-09: Self-tests leave several assertions without a planted fault

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-tabs-live.mjs:1074`

**What is wrong.** CLAUDE.md requires a plant per assertion. In orca-tabs-live no case plants routeVerdict's absolute-path or entry-200 branch, reloadVerdict's missing-names or late-ms branch, closeVerdict's disposedMs branch, creationVerdict's wrong kind or wrong name branch, any pbSplitVerdict branch except remounts, chromeVerdict's no-selector branch, or the Theia-side error shape. In orca-terminal-keys-live the readKeys passthrough-versus-shell-keys equality, click.tab missing and restore pty branches are not planted. The route verdict guards a security boundary.

**Scenario.** A refactor drops the `absolute !== 404` or `entry !== 200` branch; --self-test stays green.

**Preconditions.** none

**Evidence.** scripts/verify-orca-tabs-live.mjs:1074-1075 plant only noCookie 200 and traversal 200 for routeVerdict; 387-394 routeVerdict also asserts absolute and entry.

**Suggested fix.** Add one plant per remaining branch, each naming the drift text.

**Verifier (CONFIRMED, low).** The route plants at lines 1074-1075 cover only noCookie=200 and traversal=200. There is no plant for the absolute-path or entry-200 branches, nor for several branches of the other verdict functions listed in the finding. I did not enumerate the whole list in the finding, but the route case checked directly is accurate. This is a gap against the CLAUDE.md plant-per-assertion rule. *Checked at:* scripts/verify-orca-tabs-live.mjs:387-394, 1074-1075

## harness-live-tabs-12: Live output after teardown is not redacted; failure reasons carry page error text

- **Severity:** low
- **Verdict:** PLAUSIBLE
- **Location:** `scripts/verify-orca-tabs-live.mjs:945`

**What is wrong.** withOrcaTabsSession and withOrcaProfile install output redaction and call restoreOutput() in finally. main() then prints stage reasons and notes after that, unredacted. Reasons include `second client: ${second.error}` built from `evaluate failed: ${e.message}` of the paired second-client page and the harness error text. The offer and pairing input are only redacted while the session runs.

**Scenario.** A BiDi or page error message echoes script text or the page state containing the pairing input; it is printed to CI logs after redaction was removed.

**Preconditions.** an error message that contains the pairing input

**Evidence.** scripts/lib/orca-tabs-live.mjs:333-341 `restoreOutput();` in finally; scripts/verify-orca-tabs-live.mjs:945-957 print of `reasons.join('; ')` and `console.error(`${NAME}: FAIL -- harness: ${err.message}`)`; scripts/verify-orca-tabs-live.mjs:810-825 `evaluate failed: ${e.message}`.

**Suggested fix.** Apply redact(text, secrets) to everything printed after the session, or keep redaction installed until main() returns.

**Verifier (PLAUSIBLE, low).** The code path exists. orca-tabs-live.mjs:340 calls restoreOutput() in finally. main() at verify-orca-tabs-live.mjs:945-957 prints reasons and the harness error afterwards. The connect() helper at 810-825 builds 'evaluate failed: ${e.message}' from page errors. The step I cannot settle statically is whether a BiDi error message ever echoes the injected script, which contains the pairing input. The pairing offer is also minted for a throwaway scratch profile, which limits impact. The CLI error path is redacted at line 319, so only the page-error path is exposed. *Checked at:* scripts/lib/orca-tabs-live.mjs:340; scripts/verify-orca-tabs-live.mjs:810-825,945-957

## harness-live-tabs-10: Confirmation-dialog detector is broad and not baselined

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-terminal-keys-live.mjs:129`

**What is wrong.** CONFIRMATION_SELECTOR (also inlined in orca-tabs-live stage j) matches any `body > [role=dialog|alertdialog]` or `body > div [role=alertdialog]`, and the cancel step clicks the first dialog's cancel button found anywhere. A Theia or leftover dialog satisfies 'Orca's confirmation rendered'; the count is not compared with a pre-press baseline.

**Scenario.** Ctrl+Shift+W closes the wrong widget or does nothing while some other dialog is present; closed.dialog is true and the close-key clause passes.

**Preconditions.** another dialog in the Theia document

**Evidence.** scripts/verify-orca-terminal-keys-live.mjs:129 and 902-906 `return disposed || dialog ? { disposed, dialog } : null`; scripts/verify-orca-tabs-live.mjs:680-681.

**Suggested fix.** Scope to Orca's pane root and require the dialog count to rise from a recorded baseline; require its text to name the running terminal.

**Verifier (CONFIRMED, low).** CONFIRMED: terminal-keys-live:129 selector matches any body-level dialog or alertdialog. Line 904 only tests that some match exists, with no pre-press baseline. The cancel step at 906 clicks the first dialog's cancel button anywhere. Tabs-live stage j (680-681) inlines the same selector and does the same. A stray dialog could therefore satisfy 'dialog opened'. It is a test-precision weakness, and the precondition (a leftover dialog) is unlikely in a fresh scratch profile. *Checked at:* scripts/verify-orca-terminal-keys-live.mjs:129,904-906; scripts/verify-orca-tabs-live.mjs:680-681

## harness-live-tabs-11: tab-strip-live skips the Orca-bundle boot control silently when orca/ is not built

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-tab-strip-live.mjs:581`

**What is wrong.** The WINDOWS 62 fix requires the pb-panes bundle to have booted before the middle-click paste control, but only when orca/out/web/assets/pb-panes/pb-panes.js exists in this repo. When it is absent the check prints 'middle: PASS' with no note that Orca's document listeners were not covered. The test is on the repo path, not on the app under test (PB_BACKEND_MAIN can point elsewhere), so a built app with the bundle and a tree without it reproduces the original blind spot. A genuine boot failure is now correctly red 'NOT SCORED'.

**Scenario.** orca/ missing or PB_BACKEND_MAIN pointing at another tree; the paste control runs without Orca's listeners loaded and passes.

**Preconditions.** bundle absent or an overridden app tree

**Evidence.** scripts/verify-tab-strip-live.mjs:177 `const PANE_BUNDLE_ENTRY = join(REPO_ROOT, 'orca/out/web/assets/pb-panes/pb-panes.js');` and 581 `if (existsSync(PANE_BUNDLE_ENTRY)) { ... expect(booted === true, 'middle: NOT SCORED ...'`

**Suggested fix.** Decide from the frontend under test (is the orca-panes module key defined or the extension wired?) and print an explicit 'Orca listeners not covered' line when it is skipped.

**Verifier (CONFIRMED, low).** CONFIRMED: line 177 builds PANE_BUNDLE_ENTRY from REPO_ROOT, and 581 gates the boot wait on existsSync(PANE_BUNDLE_ENTRY). When the file is absent the boot step is skipped with no note. PB_BACKEND_MAIN is honoured by the shared libs (orca-tabs-live.mjs:67, orca-pane-harness.mjs:161), so the tree tested for the bundle and the app under test can differ. That mismatch is not shown in tab-strip-live's own code, but nothing prevents it. An unbuilt orca/ is the intended skip case, so the silent skip is largely by design. *Checked at:* scripts/verify-tab-strip-live.mjs:177,581

