# Result: H5-harness-live-security

Branch: worktree-agent-a25e0025912001381   Base: b5c4b182 (review follow-up on f8d798e4)   Final: 2b0d65e9 (last fix; this record is the commit after it)

No live row was run. Each item was fixed by reading the code, by its `--self-test`, and by plants over the pure functions. The last column of the second table names the live run on the owner's desktop that would prove the item.

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| harness-live-security-01 | fixed | d1d98071, 3a940456 | verify-orca-browser-agent-live.mjs --self-test::decoy-launch wiring (red on the old liveEnv, checked by a temporary revert), ::decoy-home-replaced, ::decoy-gone | realHomes() is read once at module load, so a decoy HOME is kept; clause (f) requires orcad's /proc environ HOME to be the decoy folder, else detector blind |
| harness-driver-02 | fixed | d1d98071 | verify-live-harness-libs.mjs --self-test::prereq (11 cases) | absent AGENT_METHODS (any declaration form), orca-browser or orca-panes is FAIL |
| harness-live-security-02 | fixed | d1d98071, 3a940456, 5ea0af9e | verify-live-harness-libs.mjs::prereq; browser-agent self-test::decoy-skip | Orca build without pane/host bundle is FAIL; only absent binary, Theia build or orcad is SKIP 77; a skipped (f) makes the row SKIP 77, not PASS |
| harness-live-security-05 | fixed | d1d98071, each script commit; review follow-up 47997f17, 2b0d65e9 | verify-live-harness-libs.mjs::lock (23 cases, real flock: non-ancestor holder refused, ancestor accepted, forged holder refused, bounded wait, SIGTERM forwarded); each self-test::lock wiring | proceeds only for the named holder (pid plus start ticks) or an ancestor; a bare PB_LIVE_LOCK_HELD=1 FAILs; mkdtemp repos in snapshot, status and service rows |
| harness-live-security-06 | fixed | 3a940456 | browser-agent self-test::cookie-read-failed, close-list-read-failed, close-page-never-listed, reload-list-read-failed, reload-page-never-listed, reload-after-reads-failed | failed tab list / cookie get is null, judged "instrument failed" |
| harness-live-security-03 | fixed | 31ae0e7f, 0cb3104b, c08b4c93, ae5c6efb, ea068614, 2c760fa6 | each self-test; snapshot self-test::no orca/ in CI | every SKIP path exits 77 via skip-verdict.mjs; tracked inputs (fixtures, copy table) FAIL; orca-snapshot-fixtures FAILs without orca/ in CI |
| harness-live-security-04 | fixed | c08b4c93, d1d98071 | failure-page self-test::a SIGTERM restores the host bundle / no signal guard; libs::host bundle left aside | signal guard restores before re-raise; stale aside restored at start under the lock; prerequisites FAIL naming the aside |
| harness-live-security-13 | fixed | d1d98071 | verify-live-harness-libs.mjs::signin (plant: re-read removed loses the owner's write) | writeBackSignIn re-reads before rename and re-merges; the sweep still writes back (live-scratch-home's self-test requires it) |
| harness-live-security-09 | fixed (in part) | 2c760fa6 | no-remote self-test::a sidecar bound to 0.0.0.0, tab-store on [::], listener after the first sample | loopback required, second sample after 10 s, reparented processes under the profile counted; no re-sample after an agent command |
| harness-live-security-07 | fixed | 3a940456, 5ea0af9e, ea068614, 0cb3104b; review follow-up f16ef6be | lib/verdict-coverage.mjs used by the four self-tests::coverage, ::coverage plant (three removed-plant cases) | every fail-message literal, by place and full skeleton, must be matched by one plant's own fail line |
| harness-live-security-08 | fixed | 3a940456, ea068614 | browser-agent self-test::agent-submit-captured, capture-detector-blind | (l) counts passwordmgr-form-submission-detected, proven on a user submit; status-live's unreachable branch removed |
| harness-live-security-14 | fixed | 3a940456 | no-check: an env refusal at entry, the same form as credential-store-live | browser-agent-live FAILs under PB_LIVE_HEADED or PB_REAL_INPUT |
| harness-live-security-10 | fixed | 31ae0e7f | credential-store self-test::a report written / a key written under a refused start | walker sampled every 100 ms across the launch; report in data root or key-folder change is red |
| harness-live-security-12 | fixed | c08b4c93 | failure-page self-test::a recovery judged over no view | empty id list is collector blind; an unreached induction 3 is a named SKIP (77), not a note |
| harness-live-security-11 | fixed | 0cb3104b | service-live self-test::GH_TOKEN added to the allowlist, ANTHROPIC_API_KEY / AWS_SECRET_ACCESS_KEY planted, shipped allowlist clean | credential-shaped name rule independent of ORCAD_ENV_ALLOWLIST |

Live run that would prove each item on the owner's desktop:
- 01: `--only orca-browser-agent-live`. Clause (f) must report orcad HOME equal to the decoy folder. To see it go red, revert the realHomes() cache and require "detector blind" for (f).
- driver-02, 02: `--only orca-browser-agent-live` and `--only orca-agent-mark-live` on a built tree (both must run, not SKIP); rename AGENT_METHODS in a scratch copy and require FAIL.
- 05: run `--only orca-agent-status-live` in two sessions at once; the second must wait for the lock.
- 06, 08, 14: `--only orca-browser-agent-live`. Clause (l) must show user submit notifications ≥ 1 and agent 0.
- 03: a full run on a tree without typescript or claude must show SKIP, not PASS, for those rows.
- 04: start `--only orca-failure-page-live`, send SIGTERM during launch 3, then confirm that pb-browser-host.js is back.
- 13: no live proof beyond the libs race test; it would need the owner's claude to write during a disposal.
- 09: `--only no-remote-agent-port-live`. Socket lines are printed for both samples.
- 10: `--only orca-credential-store-live`.
- 12: `--only orca-failure-page-live`. Watch whether induction 3 is reached.
- 11: `--only orca-service-live`.
- G2 reversal: `--only orca-service-live`. Launch 2 must show the crash tree gone within 25 s.

Live-lock rule, after the review follow-up. `scripts/lib/live-lock.mjs` is the single helper for every live row, and its header documents the interface:
- At entry a row runs `const locked = await holdLiveLock({ name, scriptUrl: import.meta.url, root }); if (locked !== null) process.exit(locked);`.
- It proceeds only when /proc/locks shows the lock file's inode held by one of two processes:
  - (i) the process PB_LIVE_LOCK_HOLDER names as `<pid>:<start ticks>`, with matching start ticks;
  - (ii) an ancestor of the row, which covers `flock <lock> node <row>` with or without the variable.
- PB_LIVE_LOCK_HELD=1 without (i) or (ii) is a FAIL naming the holders. The row does not run and does not silently take the lock.
- With nothing set it takes the lock itself:
  - it re-runs under `flock -w <PB_LIVE_LOCK_WAIT_S, default 21600>` in its own process group;
  - it forwards SIGINT, SIGTERM and SIGHUP to that group;
  - it names the holder's pid while it waits, and FAILs naming the holder when the wait runs out;
  - it returns the re-run's status: 77 passes through, and a signal gives 128 + its number.
- No git common dir, or no flock: FAIL.
- The lock is always `<git common dir>/pb-live.lock`. There is no lock-file override; the self-test uses a scratch checkout of its own.
- `--self-test` modes do not lock unless they launch something. Each self-test asserts the wiring with `lockWiringFails` (an awaited call).

Coverage rule, after the review follow-up (07): verdict-coverage.mjs keeps every literal at its own place, with its full static skeleton (holes as wildcards). A message counts as planted only if one plant's own fail line matches the whole skeleton. The browser-agent self-test removes the inside-pixel plant and the dialog-count plant, and the service-live self-test removes the daemon still-alive case; each removal must leave its message uncovered.

Rows changed to the product's new behaviour (G1a/G2), each still able to fail:
- orca-agent-mark-live (agent-browser-04):
  - At idle the mark stays and reads "Agent tab". Only control clears; the old "mark cleared" rule is now plant `mark-cleared-at-idle`.
  - Stop on tab A stops a second agent tab B, and a new `tab create` is refused, each with browser_owner_unavailable. The old one-tab behaviour is now plant `stop-on-one-tab-only`.
  - Resume gives control back.
  - The labels are read from chrome-bar-copy.ts.
- orca-service-live (G2 orcad-hosting-01, 013fa4bd):
  - Launch 2 starts an agent session and then SIGKILLs PowerBrowser.
  - orcad, the terminal daemon and every descendant must be gone within 25 s, checked by pid plus start ticks.
  - Plants: orcad survives, the daemon survives, the agent survives, no orcad recorded, no agent recorded.
  - Launch 3 checks the relaunch: new lock pid, same port, old identities gone. The "vacuous: nothing to reap" rule is gone.

Callers: the only caller of each converted script is `scripts/verify-platform.sh`. Workflows, hooks, docs and other scripts do not run them. Self-tests do not call their main mode, and each self-test prints its own verdict line last.

## Registry requests
- scripts/verify-live-harness-libs.mjs: quick, `"live-harness-libs-self-test|node $REPO_ROOT/scripts/verify-live-harness-libs.mjs --self-test"`

## Red by design
- Every H5 live row in the full tier, until lane H1 exports PB_LIVE_LOCK_HOLDER. The driver today exports PB_LIVE_LOCK_HELD=1 alone, and its holder (`setsid flock -o`) is not an ancestor of the rows. Each row therefore FAILs by name: "PB_LIVE_LOCK_HELD=1 is set (no PB_LIVE_LOCK_HOLDER), but ... is held by pid N". That is the contract the coordinator set. Exact change, in scripts/verify-platform.sh acquire_live_lock, after the holder takes the lock: `export PB_LIVE_LOCK_HOLDER="$LIVE_LOCK_HOLDER_PID:$(awk '{ sub(/^.*\) /, ""); print $20 }' /proc/$LIVE_LOCK_HOLDER_PID/stat)"`. `$!` there is the flock pid that /proc/locks names, because setsid execs flock. Its start ticks are field 22, which is the 20th field after the comm. The branch that trusts a caller's PB_LIVE_LOCK_HELD=1 must pass the caller's PB_LIVE_LOCK_HOLDER through; the ancestor branch needs nothing.
- scan-brand-residue: green at 2b0d65e9 against f8d798e4's recounted inventory. The earlier request is settled by the integration recount.

## Handoffs
- H1: scripts/verify-platform.sh, export PB_LIVE_LOCK_HOLDER as under Red by design (harness-live-security-05).
- H6, H7: switch your rows to `await holdLiveLock({ name, scriptUrl: import.meta.url, root })` from scripts/lib/live-lock.mjs and delete your own helpers.
- H1 / integration (first round, still open): the gate driver's summary misattributed verdicts in my first --quick run.
  - It listed orca-service and orca-service-self-test as PASS, although both printed FAIL lines; `--only orca-service` is FAIL, which is red by design for H2.
  - It listed orca-failure-classes as FAIL, although that row printed PASS and `--only orca-failure-classes` is PASS.
  - Please check the row-to-verdict bookkeeping in scripts/verify-platform.sh. Not my file.

## Behaviour changes
None to the product. Harness behaviour that changed:
- Live rows refuse to run unlocked; a full-tier SKIP is now exit 77.
- orca-snapshot-fixtures fails in CI without orca/.
- orca-failure-page-live is a SKIP when induction 3 is not reached.
- browser-agent-live refuses headed runs.
- service-live now expects orcad to die with a killed PowerBrowser.
- Revert with the commit named in the table.

## Needs owner
- harness-live-security-12: orca-failure-page-live now ends SKIP (77) whenever the revoked-device induction (A-7) is not reached. Its header said that happens at the pin. Under --gate it is red until the owner records a ledger exclusion keyed to a WINDOWS entry naming it, or the induction is made to work. Proposed exclusion form: `orca-failure-page-live|<id>|SKIP|any|SKIP -- induction 3 (auth refusal through a revoked device|...`.
- harness-live-security-13: the sweep in liveHome() still writes a rotated token back for a stale folder. Limiting the write-back to seeding rows would break the live-scratch-home self-test (not my file), which requires it. The owner or H-lane owner of verify-live-scratch-home.mjs decides whether to change it.

## Quick gate
Review follow-up: `nix develop .#theia --command scripts/verify-platform.sh --quick` at f16ef6be on f8d798e4, logged to .mozbuild/h5-gate/quick.log in this worktree. Result: 444 PASS, 3 FAIL, 0 SKIP.
- scan-brand-residue and its self-test: caused by two follow-up comments, one `orca` and one `orcad` token each. Reworded in 2b0d65e9; `node scripts/scan-brand-residue.mjs` and its `--self-test` are PASS there.
- orca-failure-classes: not caused by this lane. It names four orcad exit codes of the pinned Orca that ORCA_CODE_CLASSES does not map (orcad_invalid_bind_address and orcad_data_root_*). That is product or pin state; this lane touches neither file.
- live-harness-libs-self-test runs in about 2 s (it was 31 s).

First round, at 768e82c2: 437 PASS, 8 FAIL, 0 SKIP. The one later commit, a15a9ffe, changes only a comment.

Each non-PASS row:
- orca-browser-tab-scope and its self-test, shell-error-copy-no-internals and its self-test: red on the base by design (lanes H3 and H8).
- scan-brand-residue and its self-test: red by design (inventory counts, above).
- orca-failure-classes: not caused by this lane. The summary marked it FAIL, but the row printed PASS and passes alone (`--only`); see Handoffs. orca-service and its self-test were shown PASS in the same summary, but `--only orca-service` is FAIL, red by design (lane H2).
- fixer-isolate-self-test: not caused by this lane. "could not make /run/user/1000/pb-g2o-.../o-...sock read-only" names a socket of another lane's process; G1a recorded the same.

Other checks run against the touched files, all green:
- the --self-test of every owned script
- live-harness-libs --self-test
- live-scratch-home and its self-test (33/33)
- orca-snapshot-fixtures
