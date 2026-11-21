# Result: H6-harness-live-tabs

Branch: worktree-agent-a22d8d1d280a39845   Base: b5c4b182   Final: 5de1e94b (last code commit; this record is committed on top of it)

No live row was launched and no browser was started. Every fix was proven by the rows' `--self-test` modes (the three quick ones:
orca-tabs-live 107 cases, orca-terminal-keys-live 67, orca-relaunch-restore-live 31; all need no browser), by unit plants over the pure
functions, and by `tsc --checkJs` over the six files (no undefined name). The `--self-test` of `verify-mode-switch-tabs-live.mjs` and
`verify-tab-strip-live.mjs` boots browsers by design (it plants each fault in the running page): they stay full-tier rows and were not run.

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| harness-live-tabs-05 | fixed | 39f986bb | verify-orca-relaunch-restore-live.mjs --self-test::source ids / command result / restore-effect plants | ids moved or command not run stops the row; mode() proves data-pb-mode changed; editors closed before the restore must return only via it (`restore-effect`). Live proof: the relaunch row on the owner's desktop |
| harness-live-tabs-01 | fixed | 543b787e, 39f986bb, dc76b092, 9af999a1, 0cea0cb5 | each row's `--self-test` "real main with no built PowerBrowser exits 77 with the one SKIP line" + verdictExit plants | tabs-live (absent input and the skipped merge-editor half), terminal-keys (absent input and a stage 2 that did not run), relaunch-restore, tab-strip-live (middle clause), mode-switch-tabs-live (Orca seeds) all exit 77; FAIL wins. No caller other than the driver reads their exit status (grep of .github/workflows, scripts, docs, .claude: only importers of relaunch-restore's helpers, which never run its main) |
| harness-live-tabs-02 | fixed | 543b787e | verify-orca-tabs-live.mjs --self-test::the Theia probe returning an error object / null / missing selector / string count; the storage probe is judged by a planted marker | chromeVerdict needs a count for every selector from both probes; a storage dump that fails or lacks the planted marker is a blind place. Live proof: orca-tabs-live stages i and m |
| harness-live-tabs-03 | fixed | 543b787e | verify-orca-tabs-live.mjs --self-test::a place found with a form name / blind dump / token alone in a log / pairing input alone in the state / stray bridge-folder file | all forms of Orca's own encoders (needlesFromOffer) plus the pairing input are searched; per-place controls: planted marker in both storages, non-empty and below-cap log buffers, state ready, an Orca port row, a fixture-file search control; bridge folder's other files and orcad `*.log` files added. orcad's stdout is not a place: OrcaService routes it to a sink only |
| harness-live-tabs-13 | fixed | 543b787e, 39f986bb, dc76b092 | verify-orca-tabs-live.mjs --self-test::fixture git ignores a developer config with signing and hooks; without the hygiene is hit | fixtureGit (no global/system config, no signing, no hooks, scratch HOME) used by the tabs session, makeConflict and relaunch-restore; terminal-keys saves both clipboards and writes them back (`withClipboardsRestored`, plants: restore, restore after a throw, unreadable named and left, no-text emptied) and removes its recorder folder. The Gecko clipboard read (`nsIClipboard.getData`) is unproven live: if it fails the run names it and does not restore |
| harness-live-tabs-06 | fixed | 39f986bb | verify-orca-relaunch-restore-live.mjs --self-test::a hold bound that reads NaN | runLive throws unless ORCA_RESTORE_HOLD_MS is a positive number |
| harness-live-tabs-04 | fixed | 543b787e | verify-orca-tabs-live.mjs --self-test::reloaded plants (never reloaded, same time origin, old recorder, not ready) | the reload is proven by a changed performance.timeOrigin and a gone add recorder; the second client's reload (g3) by a changed time origin. Live proof: orca-tabs-live stage k and g3 |
| harness-live-tabs-07 | fixed | 543b787e | verify-orca-tabs-live.mjs --self-test::an agent terminal that read empty / no handle | stage c requires a non-empty orcad read of the agent terminal; the header no longer claims the TUI is judged |
| harness-live-tabs-08 | fixed | 543b787e | verify-orca-tabs-live.mjs --self-test::prompt budget counts composer writes; a chrome selector present in Theia that was never detected is still red; chromeProven | budget counted where the composer is written (`countComposerWrites`); chrome detector is per selector. Deviation from the suggested fix: a selector the client never rendered is not required to match (a false red on a state Orca does not draw); its absence is not claimed proven, it is listed in a stage note, and any selector present in Theia is red whether or not it was detected |
| harness-live-tabs-09 | fixed | 543b787e, dc76b092 | verify-orca-tabs-live.mjs and verify-orca-terminal-keys-live.mjs --self-test | plants added for route absolute/entry/no answer, reload missing/late/never, close disposedMs null/late/no store row, creation no widget/wrong kind/wrong name, every pbSplit branch, the chrome no-selector and error shapes; terminal-keys: passthrough-vs-shell equality (extracted to passthroughVerdict), click.tab missing, restore pty/text/mounted |
| harness-live-tabs-12 | fixed | 543b787e, 39f986bb, dc76b092 | verify-orca-tabs-live.mjs --self-test::output after the session is redacted | the session's redact function and secret list are kept (`retainForOutput`); tabs-live, terminal-keys and relaunch-restore print their verdicts and harness errors through `redactAfterSession`. Plausible item (a BiDi error echoing the pairing input is unproven) fixed as defence in depth |
| harness-live-tabs-10 | fixed | 543b787e, dc76b092 | verify-orca-tabs-live.mjs --self-test::confirmation plants (no new dialog, another dialog, the real titles read from CloseTerminalDialog.tsx) | existing dialogs are marked first; only a new dialog whose text carries an Orca close-terminal title counts; Cancel is clicked inside it. Used by tabs-live stage j and terminal-keys stage 2 |
| harness-live-tabs-11 | fixed | 9af999a1 | verify-orca-tabs-live.mjs --self-test::listener coverage plants (booted / not wired / built not booted is red / wired but unbuilt is a named skip) + app wiring read from a fixture frontend | decided from the generated frontend of the app under test (PB_BACKEND_MAIN honoured); "Orca listeners not covered" is printed and the row exits 77. Live proof: tab-strip-live --scenario middle |

harness-live-tabs-14 (the live lock, H1) is not in this brief; the lock rule of the lane notes is applied in all five rows (see Behaviour changes).

Product-change clauses updated (G3a, G3b): the terminal keeps its tab, name and place when its layout first appears: orca-tabs-live stages a and b
(`keptVerdict`: widget still hosted, one add) and stage e (`splitVerdict.original` and `splitAdds`: the split tab's widget stays, is re-keyed
to a leaf, and only the new leaf is added; the widget options are re-read after the split, the creation-time copy predates the leaf);
orca-relaunch-restore-live launch 1 `terminal-keeps-tab`. A custom mode named like a shipped mode: none of these rows asserts it; mode-switch-tabs-live
reads custom ids from the live ModeService and is unaffected. Closing one split leaf closes only that leaf: no clause of these rows closed a split leaf, none added.

## Registry requests
None. No new script or row (one new flag, `--lock-probe`, on the five live rows; it launches nothing and is used only by their self-tests).

## Red by design
- scan-brand-residue and scan-brand-residue-self-test: the live rows and the lib mention Orca's own names. On my tree the scan reports Orca 3617 -> 3655,
  orca 6188 -> 6219, ORCA 1398 -> 1409, orcad 2220 -> 2218 (these four are expected_count values in inventory/brand-tokens.json and include nothing from
  other lanes: the base was green), and condition 4 names scripts/lib/orca-tabs-live.mjs, scripts/verify-orca-tabs-live.mjs and scripts/verify-tab-strip-live.mjs
  as unclaimed for the "Orca" title row (add them to its expected_files, sorted). Integration must recount after all lanes merge.

## Handoffs
- Integration: `scripts/verify-platform.sh` rows `orca-tabs-live`, `orca-terminal-keys-live`, `orca-relaunch-restore-live`, `gui07-mode-switch-tabs-live`, `tab-strip-live` (and their self-test rows) need no change: the driver reads exit 77. If the gate should excuse none of their SKIPs, add nothing.
- Callers of the five scripts that read an exit status: none besides the driver (grep of .github/workflows, scripts, docs, .claude). scripts/verify-orca-offer-scan.mjs and scripts/verify-orca-pairing-containment.mjs import withOrcaProfile from relaunch-restore and never run its main.
- Owner of docs/ (not mine): nothing.

## Behaviour changes
- harness-live-tabs-14 lock rule (all five rows): a live row started outside the driver now takes `<git common dir>/pb-live.lock` itself with `flock -o` before launching anything, and exports PB_LIVE_LOCK_HELD=1; the old header lines telling the user to wrap the row in flock on that file were removed (wrapping it would wait on its own parent). Revert with 543b787e and the per-row commits.
- harness-live-tabs-05: orca-relaunch-restore-live now switches to the Coding mode and closes every Theia editor in launch 2 before restoring the Setup. A restore that does not bring them back is red. Revert with 39f986bb.
- harness-live-tabs-13: orca-terminal-keys-live writes the developer's clipboard and selection back when it can read them (headed runs) and deletes `.mozbuild/orca-terminal-keys-live` at the end. Revert with dc76b092.
- harness-live-tabs-01: the five rows can now be SKIP where they were PASS: tabs-live and mode-switch-tabs-live without orca-workspace / orca-panes halves, terminal-keys without stage 2, tab-strip-live without a built pane bundle in an app that wires orca-panes. Under `--gate` any such SKIP is red.

## Needs owner
None.

## Quick gate
`nix develop .#theia --command bash scripts/verify-platform.sh --quick` at 0cea0cb5 (the later commit only adds `-o` to flock; the three quick self-tests were re-run after it): 8 rows not PASS, 0 SKIP. All were PASS in BASE-QUICK.txt.
- scan-brand-residue, scan-brand-residue-self-test: FAIL, caused by this lane, Red by design (counts above).
- orca-service, orca-service-self-test: FAIL, not caused by me (H2: TheiaService sets POWERBROWSER_ORCA_PORT, status reply carries `generation`).
- orca-browser-tab-scope, orca-browser-tab-scope-self-test: FAIL, not caused by me (H3).
- shell-error-copy-no-internals, shell-error-copy-no-internals-self-test: FAIL, not caused by me (H8, the renamed-mode notice).

## Follow-up round (review of the H6 commits; base 7a266476, final code commit 7d27556a)

Quick gate log: `.mozbuild/h6-quick2.log` in this worktree. Still no live row and no browser. The three quick self-tests: orca-tabs-live 121 cases,
orca-terminal-keys-live 67, orca-relaunch-restore-live 32. Callers of the five scripts that read an exit status: none besides the driver.

| Review point | Status | Commit | Check | Note |
|---|---|---|---|---|
| 1a harness-live-tabs-03 (real offer written to /tmp) | fixed | 5e4cc138 | orca-tabs-live --self-test::the file search control writes only its own synthetic needle; a control handed a real needle is caught by the recorder | `fileSearchControl()` plants `pb-offer-control-...`; the harness never writes a form of the real offer |
| 1b harness-live-tabs-03 (orcad logs over an empty buffer) | fixed | 5e4cc138 | ::no orcad log file exists; only an unrelated log file exists | the place needs `logs/daemon.log` (Orca's daemon-file-log) under orcad's data root among the files read, else it is blind (red). A live run must therefore show that file; if orcad writes it elsewhere the row goes red naming it, and `ORCAD_KNOWN_LOG` is the one constant to change |
| 1c harness-live-tabs-03 (sidecar ring at its 500 cap) | fixed | 5e4cc138 | ::a TheiaService ring at its cap is a note, not a blind place; an OrcaService ring at its cap is blind | The TheiaService ring carries the sidecar's stdout, which never carries the offer (it goes to the bridge folder only), so at its cap the retained tail is searched and a note says so. OrcaService's ring (cap 200) logs the hand-off events: it must be non-empty and below its cap, else the place is blind. A live run on a fresh scratch profile must show OrcaService under 200 lines |
| 1d profile scan | not done, reason recorded | - | - | the whole profile is scanned by orca-offer-scan / orca-pairing-containment with their holder exclusions (the token store legitimately holds the device token, session-only state); a plain byte scan here would report that holder as a leak. This row scans the bridge folder's other files and orcad's `*.log` files |
| 2 harness-live-tabs-07 | fixed | 5e4cc138 | ::an agent that exited at once with output on screen; died after its widget appeared; missing from the list; a shell that stayed alive but could not find the agent | orcad's terminal list must show the handle with no `exitCause` and `connected` not false, at appearance and 4 s later; the read must be non-empty and carry no shell/OS error text. Not claimed: a marker proving the TUI is Claude's |
| 3a harness-live-tabs-14 lock trust | fixed | 5e4cc138 | ::the live lock behaves (hand-set flag, ancestor flock, signals) | `PB_LIVE_LOCK_HELD=1` is accepted only when the lock is held (the driver's holder is not an ancestor, so ancestry cannot be required there); a free lock is a thrown error naming it. A flag set by hand while another session holds the lock is indistinguishable from the driver's and is accepted: known limit. `PB_LIVE_LOCK_FILE` counts only with `--lock-probe`; the helper's `lockFile`, `ancestorCheck`, `forward` options exist for the self-test and no row passes them |
| 3b flock <lock> node <row> | fixed | 5e4cc138 | ::the live lock behaves (a row under flock <lock> runs; the same call without the check hangs) | `lockHeldByAncestor` mirrors `lock_held_by_ancestor` (/proc/locks by inode, then the parent chain) |
| 3c signals | fixed | 5e4cc138 | ::the live lock behaves (SIGTERM reaches the re-run, its child and frees the lock; the no-forward plant leaves it running) | the re-run is async, in its own process group, with SIGINT/SIGTERM/SIGHUP (and the parent's exit) forwarded; the five rows now `await` it (7d27556a). A SIGKILL of the parent cannot be forwarded |
| 4 harness-live-tabs-08 | fixed | 5e4cc138 | ::unproven selectors: a partial run ...; make the row exit 77 and a failure still wins | `unprovenSelectorsSkip`: a selector whose detector never matched is listed as a skip reason through the existing halfSkips path (exit 77 when nothing failed) |
| 5 harness-live-tabs-11 | fixed | 5e4cc138, 7d27556a | ::an unreadable generated frontend is not "not wired" | `appWiresOrcaPanes` returns null for an unreadable index and `listenerCoverage` makes that red; tab-strip-live no longer waits for a boot in that case |
| 6 harness-live-tabs-10 | fixed | 5e4cc138 | ::close dialog titles are required when the checkout is present / the dialog file is gone; no orca checkout gives no titles | `closeDialogTitles` throws when orca/src exists and no title is read |
| 7 relaunch ids | fixed | 7d27556a | verify-orca-relaunch-restore-live.mjs --self-test::the save id alone is enough; this row requires all three ids up front | ids are required where used (`needId`) in the shared launch context; the row's own run requires all three at the start. offer-scan and pairing-containment (which only save a Setup) are unaffected by a moved restore or activate id |
| 8 fixture git and CLI HOME | fixed | 5e4cc138, 7d27556a | ::fixture git (the pane harness's) ignores a developer config...; the same without the hygiene is hit | the session and relaunch-restore use `fixtureGit` from scripts/lib/orca-pane-harness.mjs (loaded dynamically: that file imports this lib); my own copies were removed. Both the tabs session and relaunch-restore pass the scratch HOME to the Orca CLI. The CLI reads its endpoint from ORCA_USER_DATA; it uses homedir() only as a default, in serve-service and bundled-skill install code, none reached by these calls. Not proven live |
| 9 clipboard header vs code | fixed | 7d27556a | orca-terminal-keys-live --self-test::a clipboard that held no text is named and left as the run set it, never overwritten | code and header agree: unreadable or no-text (empty and non-text cannot be told apart) is left and named; the global clipboard then keeps the run's 100 KiB text, which is what "do not destroy what you could not read" costs |

Extra changes in this round: rows with nothing to launch (a prerequisite absent) print their SKIP without taking the lock (tabs-live, terminal-keys,
relaunch-restore), so the SKIP self-test control needs no lock; the headers that said "do not wrap it in flock" were corrected (they were wrong once the
ancestor check existed).

Which lock helper to keep: three exist (`reexecUnderLiveLock` here, `scripts/lib/live-lock.mjs` from H5, `scripts/lib/live-lock-reexec.mjs` from H7).
H5's checks the lock is held when the flag is set but trusts any holder only through `flock` without an ancestor check (a row under `flock <lock> node <row>`
without the flag takes the lock again and waits on its own parent) and forwards no signal. H7's trusts the flag blindly, has no ancestor check and no signal
forwarding. Mine has all three properties and a self-test that plants each. Recommendation: keep mine (move it to a shared `scripts/lib/live-lock.mjs`
at integration) and point H5's and H7's rows at it; until then H5's and H7's rows keep points 3a to 3c open.

Red by design (updated counts, tree at 7d27556a): scan-brand-residue and its self-test: Orca 3847 -> 3854, orca 6603 -> 6631, ORCA 1489 -> 1492, orcad
2552 -> 2566, needOrca 13 -> 14, appWiresOrcaPanes 4 -> 5 (inventory expected_count values; the tree before this round was green at those numbers only
after other lanes' recount, so recount at integration), and scripts/verify-orca-tabs-live.mjs is unclaimed at lines 598 and 605 for the "ORCA" row (add
it to that row's expected_files).

Quick gate at 7d27556a: 5 rows not PASS, 0 SKIP. scan-brand-residue and -self-test: mine, red by design (above). shell-error-copy-no-internals and -self-test:
not mine (H8, the renamed-mode notice). orca-failure-classes: not mine (the pinned orcad exit codes orcad_invalid_bind_address, orcad_data_root_* and
orcad_instance_lock_foreign_identity have no class in ORCA_CODE_CLASSES; owner of powerbrowser/shell/OrcaEnv.sys.mjs).

## Third round: one live-lock helper (base f79672d7, code commit a3d82df2)

All five rows now `await holdLiveLock({ name, scriptUrl: import.meta.url, root: REPO_ROOT })` from `scripts/lib/live-lock.mjs` (H5's) before anything
launches. `reexecUnderLiveLock`, `liveLockFile`, `lockState`, `lockHeldByAncestor`, `lockProbeVerdict`, `lockProbeLine` and `lockBehaviourVerdict` are deleted from
`scripts/lib/orca-tabs-live.mjs` (which keeps only `lockWiringPlantFails`, the plant for `lockWiringFails`). Each row's self-test asserts the call is still there
(`lockWiringFails`) and that a script without it is caught; the self-tests still print their own verdict last (orca-tabs-live 121 cases, terminal-keys 68,
relaunch-restore 33; the mode-switch and tab-strip self-tests boot browsers and were not run). The headers describe the contract.

Comparison of my helper's tested properties with H5's (checked by reading it and by running a row under `flock <lock> node <row>` with it):
- ancestor case (`flock <lock> node <row>` runs instead of waiting on itself): H5 has it (holder pid in the ancestor chain; the row ran).
- signal forwarding (SIGINT, SIGTERM, SIGHUP to the re-run's process group): H5 has it.
- a hand-set PB_LIVE_LOCK_HELD=1: H5 closes the limit my helper had (the holder pid and start ticks must match, or an ancestor holds).
- nothing to launch prints its SKIP without the lock: a property of each row's entry (the lock call is made only when the prerequisites hold), not of the helper; kept in the rows.
- `--lock-probe` with a private lock file: removed. The shared helper takes the lock only from `<git common dir>/pb-live.lock` (root) and has no file override, so a probe
  on top of it would take the real lock. The helper's behaviour is covered by verify-live-harness-libs.mjs (38 cases).
- One property of mine H5's lacks, minor and with no test of mine: my re-run also forwarded SIGTERM to its group from the parent's `exit` event, so a parent that died of an
  uncaught error took the re-run with it. H5's forwards signals only. Handoff for H5 (scripts/lib/live-lock.mjs, holdLiveLock): add `process.on('exit', forward('SIGTERM'))`
  beside the three signal handlers, remove it when the child ends; test: a parent that throws after spawning must leave no running re-run. A SIGKILL of the parent cannot be forwarded by either.

Red by design (tree at a3d82df2): scan-brand-residue and its self-test: this round removed text, so the Orca-token counts fall from the integration's recount: Orca 3962 -> 3961,
orca 6766 -> 6761, ORCA 1518 -> 1513, orcad 2812 -> 2811; recount at integration.

Quick gate at a3d82df2, log `.mozbuild/h6-quick3.log` in this worktree: 6 rows not PASS, 0 SKIP. scan-brand-residue and its self-test: mine, as above. Not mine: orca-service-self-test
(1 of 53 plants), orca-failure-classes and its self-test (unmapped orcad exit codes), build-windows-shape-self-test; none reads these scripts.
