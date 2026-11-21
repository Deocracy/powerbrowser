# Result: H5-harness-live-security

Branch: worktree-agent-a25e0025912001381   Base: b5c4b182   Final: a15a9ffe (last fix; this record is the commit after it)

No live row was run. Each item was fixed by reading the code, by its `--self-test`, and by plants over the pure functions. The last column of the second table names the live run on the owner's desktop that would prove the item.

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| harness-live-security-01 | fixed | d1d98071, 3a940456 | verify-orca-browser-agent-live.mjs --self-test::decoy-launch wiring (red on the old liveEnv, checked by a temporary revert), ::decoy-home-replaced, ::decoy-gone | realHomes() is read once at module load, so a decoy HOME is kept; clause (f) requires orcad's /proc environ HOME to be the decoy folder, else detector blind |
| harness-driver-02 | fixed | d1d98071 | verify-live-harness-libs.mjs --self-test::prereq (11 cases) | absent AGENT_METHODS (any declaration form), orca-browser or orca-panes is FAIL |
| harness-live-security-02 | fixed | d1d98071, 3a940456, 5ea0af9e | verify-live-harness-libs.mjs::prereq; browser-agent self-test::decoy-skip | Orca build without pane/host bundle is FAIL; only absent binary, Theia build or orcad is SKIP 77; a skipped (f) makes the row SKIP 77, not PASS |
| harness-live-security-05 | fixed | d1d98071 and each script commit | verify-live-harness-libs.mjs::lock (13 cases, real flock); each self-test::lock wiring | rule below; mkdtemp repos in snapshot, status and service rows |
| harness-live-security-06 | fixed | 3a940456 | browser-agent self-test::cookie-read-failed, close-list-read-failed, close-page-never-listed, reload-list-read-failed, reload-page-never-listed, reload-after-reads-failed | failed tab list / cookie get is null, judged "instrument failed" |
| harness-live-security-03 | fixed | 31ae0e7f, 0cb3104b, c08b4c93, ae5c6efb, ea068614, 2c760fa6 | each self-test; snapshot self-test::no orca/ in CI | every SKIP path exits 77 via skip-verdict.mjs; tracked inputs (fixtures, copy table) FAIL; orca-snapshot-fixtures FAILs without orca/ in CI |
| harness-live-security-04 | fixed | c08b4c93, d1d98071 | failure-page self-test::a SIGTERM restores the host bundle / no signal guard; libs::host bundle left aside | signal guard restores before re-raise; stale aside restored at start under the lock; prerequisites FAIL naming the aside |
| harness-live-security-13 | fixed | d1d98071 | verify-live-harness-libs.mjs::signin (plant: re-read removed loses the owner's write) | writeBackSignIn re-reads before rename and re-merges; the sweep still writes back (live-scratch-home's self-test requires it) |
| harness-live-security-09 | fixed (in part) | 2c760fa6 | no-remote self-test::a sidecar bound to 0.0.0.0, tab-store on [::], listener after the first sample | loopback required, second sample after 10 s, reparented processes under the profile counted; no re-sample after an agent command |
| harness-live-security-07 | fixed | 3a940456, 5ea0af9e, ea068614, 0cb3104b | lib/verdict-coverage.mjs used by the four self-tests::coverage | every fail-message literal of every verdict must be reached by a plant (derived from the source); missing plants added |
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

Live-lock rule (for the other live lanes): a live row takes the lock itself. At entry it calls `holdLiveLock({ name, scriptUrl: import.meta.url, root })` from `scripts/lib/live-lock.mjs` and exits with any non-null value it returns.
- It proceeds only when PB_LIVE_LOCK_HELD=1 is set and `flock -n` finds the lock held (by the driver's holder or a flock ancestor).
- Otherwise it re-runs itself under `flock <git common dir>/pb-live.lock` and passes the status through, 77 included.
- PB_LIVE_LOCK_HELD=1 on a free lock is not trusted: the row takes the lock.
- If there is no git common dir or no flock, the row is a FAIL. It never runs unlocked and never SKIPs for this reason.
- `--self-test` modes do not lock unless they launch a browser (no-remote-agent-port-live's live control does).
- Each self-test asserts the wiring with `lockWiringFails`.

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
- scan-brand-residue and scan-brand-residue-self-test: the coincidental Orca rows count exact occurrences per listed file, and this lane changed comments and copy in listed files and added scripts/verify-live-harness-libs.mjs. Exact change, in inventory/brand-tokens.json after the merges: add scripts/verify-live-harness-libs.mjs to expected_files of the `Orca`, `orca`, `ORCA` and `orcad` coincidental rows, then set each expected_count to the scanner's observed value. At a15a9ffe the scanner reports: Orca 3617→3620, orca 6188→6150, ORCA 1398→1399, orcad 2220→2281, ORCAD 242→250, Orcad 152→147. Those numbers also include the base's own drift.

## Handoffs
- integration: inventory/brand-tokens.json, as under Red by design.
- H1 / integration: the gate driver's summary misattributed verdicts in my --quick run.
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
`nix develop .#theia --command scripts/verify-platform.sh --quick` at 768e82c2: 437 PASS, 8 FAIL, 0 SKIP. The one later commit, a15a9ffe, changes only a comment.

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
