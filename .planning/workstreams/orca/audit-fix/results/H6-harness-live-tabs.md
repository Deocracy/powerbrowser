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
