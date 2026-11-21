# Result: H1-harness-driver

Branch: worktree-agent-af1e134a3e7cb0ea4   Base: 0f9f2735401a08132a479c95c09c53f03015fa19, fast-forwarded to 1dd2cbfc for the review round and to f8d798e4 for the lock round   Final: c1e214a2 (last fix; this record is the commit after it)

The SKIP protocol the other harness lanes follow is `.planning/workstreams/orca/audit-fix/SKIP-PROTOCOL.md`. It was corrected in 834bd116, committed on its own, and updated for the new exclusion modes after abb798b6.

Review round, 2026-11-21:
- An independent review found four driver defects, two status corrections, two extra defects and three protocol errors.
- Lane G5a handed over orca-artifacts' import of pinned source, and lane H8 handed over the XPI staging in CI.
- Each is answered in the table and the sections below.

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| harness-driver-03 | fixed | 64675503 | scripts/verify-ci-fetches.mjs::fetch-before-table (+ --self-test) | verify.yml runs fetch-orca.sh before the table; the check derives every scripts/fetch-*.sh and requires each before --quick. Not run on a hosted runner here (no network installs in lanes). |
| harness-other-05 (from H8) | fixed | 52f5120b | scripts/verify-ci-fetches.mjs --self-test::the powerbrowser/packaging/stage-bundled-xpi.sh step removed; a quick row that starts reading a stager's cache makes it required | verify.yml stages the pinned XPI cache (SHA-256-checked download, nothing executed, no secret, token unchanged) before the table. ci-fetches now also derives every powerbrowser/packaging/stage-*.sh whose CACHE folder a quick-row script reads. |
| harness-driver-06 = 59-CR-03 | fixed | d47ea24e | scripts/redate-windows.mjs --self-test::a missing parser makes the self-test a named SKIP / the tool FAIL | Parser loaded on first use; row moved from --quick to the full tier; missing parser = SKIP 77 (self-test) / FAIL (tool), naming the path. |
| harness-driver-01 | fixed | 3a67fd9a, abb798b6 | scripts/verify-platform-driver.mjs --self-test::a SKIP last line with no trailing newline is SKIP; a PASS last line with no trailing newline after a SKIP note is PASS | Review point 1 confirmed at verify-platform.sh:7305 (before the fix): the `read` loop dropped an unterminated last line. Fixed with `\|\| [ -n "$line" ]`, planted both ways. |
| harness-driver-05 | partial | 3a67fd9a, abb798b6 | scripts/verify-platform-driver.mjs --self-test::--gate keeps an undescribed item under a tally line red (mode only); --gate keeps a self-test row's second, undescribed control red (mode any) | Review point 2 confirmed: `only` skipped item lines under a tally, and `any` judged nothing. Now `only` judges item lines and `any` judges the self-test's own verdict lines. extension-actions-live-self-test is now `only`. Nine exclusions are keyed to an entry that does not name their row: Needs owner. |
| harness-static-structure-02 | partial | 3a67fd9a | scripts/verify-platform-driver.mjs --self-test::exit 0 with a SKIP last line is SKIP | Status corrected (review point 5). The driver half is done. A partial SKIP printed before a PASS line still reads PASS until the script owners convert their scripts: Handoffs. |
| 59-WR-04 | fixed | d47ea24e | scripts/redate-windows.mjs --self-test::synthetic fixture has two open, one fixed and one waived entry | Fixture built with gsd-core's emptyLedger/appendWindow/markFixed/markWaived; WINDOWS.md is only read to prove it unchanged. |
| harness-driver-11 | fixed | 8975d53d | scripts/lib/orca-artifacts.mjs --self-test::symlink in one tree only / targets differ / outside the packaged tree | Links are judged: same in-tree target in both trees is a `same` line, anything else is red naming it. |
| G5a handoff: orca-artifacts runs pinned code | fixed | 406c2087 | scripts/lib/orca-artifacts.mjs --self-test::reading the tables ran nothing; plant: the old loader (import) runs the side effect | Confirmed: the loader imported orca/src/shared/*.ts. The tables are now parsed from the source text: string literals, literal lists, and the agent-browser template with its two alias forms. Values are equal on the pinned source. |
| harness-driver-04 | fixed | e7f8f3d1 | scripts/verify-orcad-leak.mjs --self-test::orca-run plants; scripts/verify-platform-driver.mjs --self-test::a row that leaves a daemon in a session of its own is FAIL; an interrupted run stops what its row left in a session of its own | orca-run kills orcad on a failed start, on exit and on a signal. Every row carries PB_VERIFY_ROW_TOKEN, and cleanup() sweeps by that token on interrupt, now planted (review point 4). |
| H1-review-7: sweep reaches older processes | fixed | abb798b6 | scripts/verify-orcad-leak.mjs --self-test::a process older than the row is not of the row | Confirmed at verify-orcad-leak.mjs:62: there was no lower bound. The driver now passes the row leader's start ticks as `--since`, and no process older than the row is judged or swept. |
| harness-driver-09 | fixed | 142669a9, e7f8f3d1 | scripts/verify-live-scratch-home.mjs --self-test::a probe folder inside scripts/lib | Probes go to a temp folder with imports relocated to the real helper; orcad-leak plants are stopped on exit and signal. |
| harness-driver-10 | needs-owner | - | (proposed) verify-ng-027-reader-callers.mjs self-test plant: a dead PowerBrowserAPI reader named like a called PowerBrowserProcesses method | Ledger-locked file; diff under Needs owner. Latent today (no shared name). |
| harness-driver-08 | fixed | 3a67fd9a, e7f8f3d1, 336fe4ae, abb798b6 | scripts/verify-platform-driver.mjs --self-test (41 cases, 21 planted driver faults) | Review point 4 confirmed: seven faults were unplanted. All seven are now planted. |
| H1-review-6: stray fixture variable | fixed | abb798b6 | scripts/verify-platform-driver.mjs --self-test::the tracked driver refuses a stray fixture variable; a driver copy outside the staged path refuses it too | Confirmed at verify-platform.sh:108-123 (before the fix). Fixture mode is now honoured only when the driver is the self-test's staged copy; otherwise PB_VERIFY_FIXTURE_REGISTRY is a FAIL with exit 1. |
| harness-driver-07 | fixed | e7f8f3d1 | scripts/verify-platform-driver.mjs --self-test::--gate fails a row that leaves a process behind; nothing a row left is still running | --sweep stops every other survivor of the row's group or token (2 s grace, TERM, KILL) and names it on a NOTE; FAIL under --gate. |
| harness-live-tabs-14 | fixed | 336fe4ae, abb798b6, c1e214a2 | scripts/verify-platform-driver.mjs --self-test::a driver killed by SIGKILL releases the live lock; a lock wait is bounded and names the holder; a forged PB_LIVE_LOCK_HELD=1 while another process holds the lock is a FAIL; a PB_LIVE_LOCK_HOLDER naming the holder with wrong start ticks is a FAIL; an ancestor holder goes on | Review point 3: the holder now ends with the driver, and the wait is bounded and names the holder. Lock round (c1e214a2), confirmed: the driver trusted an inherited PB_LIVE_LOCK_HELD=1, and its wait message told the user to set it. It now follows the live-lock contract in SKIP-PROTOCOL.md: it exports PB_LIVE_LOCK_HOLDER=<pid>:<start ticks>, goes on only for that holder or an ancestor flock shown in /proc/locks, and FAILs a forged variable by name. The two row comments on `flock <lock> node <row>` now say that form is the contract's ancestor case. |
| harness-static-browser-06 | partial | 3a67fd9a | scripts/verify-platform-driver.mjs --self-test::exit 0 with a SKIP last line is SKIP | Status corrected (review point 5). The driver half is done; the per-script exit-77 conversion and the page-table SKIP branch deletion remain: Handoffs. |

## Registry requests
None. This lane owns scripts/verify-platform.sh and registered its own rows:
- quick: `verify-platform-driver-self-test`, `ci-fetches`, `ci-fetches-self-test`.
- full: `bundled-xpi-live-dev|node $REPO_ROOT/scripts/verify-bundled-xpi.mjs --live --dev`; `redate-windows-self-test` moved here from --quick.

## Red by design
None.

## Handoffs
- Harness lanes H2-H8, the owners of each SKIP-printing script. This is the remaining half of harness-driver-01, harness-static-structure-02 and harness-static-browser-06.
  - Convert every `SKIP --` path that exits 0 to exit 77, per SKIP-PROTOCOL.md; partial skips go through `verdictExit`.
  - Run self-test controls as captured children, expect 77 from them, and print the self-test's own verdict line last.
  - Until then a partial SKIP printed before a PASS line still reads PASS.
- Owner of scripts/verify-orca-browser-tab-scope.mjs: delete the page-table clause's SKIP branch at :1134; lane p66-02 is merged (harness-static-browser-06).
- Direct callers of SKIP-capable scripts (review point 8a; the full list with the treatment of 77 at each call site is in SKIP-PROTOCOL.md under "Known direct callers"). Each needs a deliberate 77 when its script is converted:
  - owner of .github/workflows/release.yml: :1623 (verify-descriptor-monotonic), :160 and :627 (verify-licence-allowlist; H8 reports its `--rulings` mode has no skip path), :1594, :1628, :1730, :1743, :2086, :2213 and :2223 (verify-channel-live), :2323, :2453 and :2599 (verify-orca-packaged-tree);
  - owner of .github/workflows/release-train.yml: :534 (verify-release-identity) and :535 (verify-upstream-pins);
  - owner of powerbrowser/packaging/package-macos.sh:263 and package-windows.sh:85: verify-orca-packaged-tree;
  - owner of scripts/rebase-orca.sh: :257-258 and the fixture at :469 (verify-orca-slotless-start).
- Integration, inventory/brand-tokens.json: the held-back counts were reconciled again at abb798b6 (`Orca` 3632, `orca` 6130, `orcad` 2220). After merging, run `node scripts/scan-brand-residue.mjs` and set each count to the observed value.
- Integration, quick-tier duration (review point 10): the rows to move to the full tier are listed under Quick gate. None of them is this lane's to move.

## Behaviour changes
- harness-driver-01 (D-60): `--gate` now fails every SKIP no exclusion excuses.
  - D-60 (2) is kept: orca-agent-status-live's SKIP on a sign-in under 60 minutes is excused under WINDOWS 69, and only that SKIP.
  - Replaying gate run 5 (da97a4e9), descriptor-monotonic (0 published Releases) is now an unexcused SKIP and red. On a host with an installed Orca, orca-hidden-electron and orca-slotless-start are red too.
  - `--quick` and the full run still exit 0 on a SKIP. Their summary prints `<label>: SKIP` plus a skipped list, and the verdict line reads `PASS -- every check that ran passed; N SKIPPED`.
  - Revert with 3a67fd9a.
- harness-driver-01: exit 77 was a FAIL (exit 1) in every mode before this lane. It is now SKIP, and `--quick` exits 0 when nothing else failed. Revert with 3a67fd9a.
- harness-driver-01: every script row now writes to pipes (tee), not to the caller's terminal or file. A row no longer sees a terminal, so colour, progress output and stdio buffering may change. Node writes to pipes synchronously on Linux, so no output is lost at process.exit. Revert with 3a67fd9a.
- harness-driver-05 (D-127, D-59): an exclusion now needs its described failure in the row's output.
  - After abb798b6, replaying gate run 5 with the driver's own functions turns five rows the old gate excused red:
    - ng074-ci-green-on-main: the CI run "concluded failure", not "no run";
    - extension-actions-live and extension-actions-live-self-test: policies-shell-only failed, which entry 29 does not describe;
    - repo-controls: the live labels "dependencies" and "javascript" are extra, which entry 31 does not describe;
    - descriptor-monotonic: an unexcused SKIP.
  - Every other row the old gate excused is still excused.
  - Revert with 3a67fd9a and abb798b6.
- harness-driver-07: a row that leaves any process behind has it stopped. That is a NOTE in --quick and the full run, and FAIL under --gate. Revert with e7f8f3d1.
- harness-driver-04: lib/orca-run.mjs now SIGKILLs an orcad whose start rejected, and every orcad still running when its process exits or gets SIGINT, SIGTERM or SIGHUP. Revert with e7f8f3d1.
- harness-live-tabs-14 (lock round): an inherited PB_LIVE_LOCK_HELD=1 or PB_LIVE_LOCK_HOLDER that /proc/locks does not confirm now makes the first full-tier row FAIL by name. It no longer skips the lock. Full-tier rows also see PB_LIVE_LOCK_HOLDER=<pid>:<start ticks>, and the wait message no longer suggests setting a variable. Revert with c1e214a2.
- harness-live-tabs-14: a run with a full-tier row now takes pb-live.lock and holds it to the end.
  - A second session's live run waits for it, at most PB_LIVE_LOCK_WAIT_S (default 21600 s). Past that bound it is a FAIL naming the holder.
  - The lock is released even when the driver is SIGKILLed.
  - `PB_LIVE_LOCK_HELD=1`, or a `flock <lock>` ancestor, skips the wait.
  - Revert with 336fe4ae and abb798b6.
- H1-review-6: a PB_VERIFY_FIXTURE_REGISTRY exported into the environment now makes the tracked driver FAIL with exit 1 in every mode, instead of being honoured. Revert with abb798b6.
- Point 10: every summary now ends with a "slowest rows (seconds)" block of 20 rows. Revert with abb798b6.
- harness-driver-06: redate-windows-self-test no longer runs in --quick or CI. Revert with d47ea24e.
- harness-driver-03 and harness-other-05: hosted CI now clones the pinned orca/ and downloads the pinned XPI before the table. Neither was verified on a hosted runner. Revert with 64675503 and 52f5120b.
- harness-driver-05: the full tier gains bundled-xpi-live-dev, which launches the dev objdir three times. Revert with 3a67fd9a.

## Needs owner
- harness-driver-10: proposed diff for the ledger-locked scripts/verify-ng-027-reader-callers.mjs. After it, re-lock the hash.
  ```diff
  @@ function deriveReaders(sources) {
       const readers = [];
  -    (sources[PBA_REL] ?? '').split('\n').forEach((line, i) => {
  +    let owner = null;
  +    (sources[PBA_REL] ?? '').split('\n').forEach((line, i) => {
  +        const obj = /^export const ([A-Za-z_$][\w$]*) = Object\.freeze\(\{/.exec(line);
  +        if (obj) owner = obj[1];
  +        else if (/^\}\);?\s*$/.test(line)) owner = null;
           const method = /^ {2}(?:async )?([A-Za-z_$][\w$]*)\([^)]*\)\s*\{\s*$/.exec(line);
           const fn = /^(?:export )?(?:async )?function ([A-Za-z_$][\w$]*)\(/.exec(line);
  -        if (method && READER.test(method[1])) readers.push({ kind: 'method', name: method[1], file: PBA_REL, line: i });
  +        if (method && READER.test(method[1])) readers.push({ kind: 'method', owner: owner ?? 'PowerBrowserAPI', name: method[1], file: PBA_REL, line: i });
  @@ function callPattern(reader) {
  -    if (reader.kind === 'method') return new RegExp(`(?:PowerBrowserAPI|PowerBrowserProcesses)\\.${reader.name}\\(`);
  +    if (reader.kind === 'method') return new RegExp(`(?<![\\w$])${reader.owner}\\.${reader.name}\\(`);
  @@ function selfTest() {
       if (!(names(analyze(filterSources(noProcCaller))) ?? []).includes('listUsedByProcesses')) problems.push('removing the only PowerBrowserProcesses call site did not turn its reader red');
  +    // A dead PowerBrowserAPI reader named like a called PowerBrowserProcesses method (audit harness-driver-10).
  +    const twin = { ...FIXTURE, [PBA_REL]: FIXTURE[PBA_REL].replace('Object.freeze({', 'Object.freeze({\n  listUsedByProcesses() {\n    return 0;\n  },') };
  +    if (!(names(analyze(filterSources(twin))) ?? []).includes('listUsedByProcesses')) problems.push('a dead PowerBrowserAPI reader was kept alive by a same-named PowerBrowserProcesses call');
  ```
  The `twin` plant assumes the fixture's first `Object.freeze({` opens PowerBrowserAPI. If the owner of a reader is not found, the fallback is `PowerBrowserAPI`.
- harness-driver-05: WINDOWS.md could not be edited here. Five ledger changes are needed:
  - Give their own entries, or name in their entry's description, the nine rows whose exclusion is keyed to an entry that does not name them:
    - seven on entry 30: orca-packaged-tree, orca-packaged-live, branding-variant-divergence, verify-branding-identity-release, build-update-xml, bundled-xpi-packaged and bundled-xpi-live;
    - two on entry 29: extension-actions-live and extension-actions-live-self-test. Entry 29 describes the private-access scenario, not either row.

    Then re-key their exclusion rows to those entries.
  - Correct entry 69's text: it says its rows have "no GATE_KNOWN_OPEN_EXCLUSIONS row", but D-60 (1) and (2) gave real-input-gate-self-test and orca-agent-status-live one each.
  - Record or decide the newly red gate rows:
    - descriptor-monotonic's SKIP (no published Release);
    - extension-actions-live's and its self-test's policies-shell-only failure;
    - repo-controls' two extra live labels ("dependencies", "javascript").
  - Re-run the gate after a push whose verify.yml run is green, so that ng074-ci-green-on-main returns to entry 31's "no run" state or passes.

## Quick gate
Lock round: `nix develop .#theia --command scripts/verify-platform.sh --quick` at c1e214a2 exited 1 in 10 min 23 s. The log is in the worktree at .mozbuild/quick-H1.log (git-ignored).

Counts: 444 PASS, 3 FAIL, 0 SKIP. None of the three is caused by this round, which touched only the driver's full-tier lock path, its self-test and the protocol:
- orca-pane-css-self-test: the provisioned orca/ predates the overlay, as in the review round below.
- orca-failure-classes: unmapped orcad codes (orcad_invalid_bind_address, orcad_data_root_shared, orcad_data_root_unusable, orcad_data_root_wrong_owner) between the provisioned orca/ and ORCA_CODE_CLASSES. That is product mapping, not this lane's files.
- fixer-isolate-self-test: "could not make /run/user/1000/cc-socks/<pid>.sock read-only". That is a socket of this agent session's sandbox, so it is the host environment.

The six red-by-design rows of the review round are PASS here. verify-platform-driver-self-test (46 cases, 23 plants) is PASS in 15.2 s.

Review round:
`nix develop .#theia --command scripts/verify-platform.sh --quick` at abb798b6 exited 1 in 11 min 18 s, at load average 9-11 from other lanes' gates.

Counts: 438 PASS, 7 FAIL, 0 SKIP. Each FAIL row:
- orca-service and orca-service-self-test: red by design, with lane H2 (the coordinator named it).
- orca-browser-tab-scope and orca-browser-tab-scope-self-test: red by design, with lane H3.
- shell-error-copy-no-internals and shell-error-copy-no-internals-self-test: red by design, with lane H8.
- orca-pane-css-self-test: not caused by this lane. It reports "orca/pb-css-scope.mjs differs from orca-overlay/files/pb-css-scope.mjs (run scripts/build-orca.sh --panes-only)". The orca/ that provision-lane.sh copied from the integration worktree predates 1dd2cbfc's overlay. Lanes may not write orca/, so it was not rebuilt here.

No row left a process behind, and no row was SKIP.

Review point 10, duration. The twenty slowest quick rows in this run, in seconds:

| Row | s | Row | s |
|---|---|---|---|
| claude-wrapper-pane-self-test | 69.9 | dispatch-release-self-test | 14.2 |
| agent-tab-walls-self-test | 34.2 | withdraw-self-test | 13.3 |
| licence-allowlist | 25.3 | verify-downstream-fixtures | 11.7 |
| rebase-orca-self-test | 24.4 | rebase-orca-coverage | 11.6 |
| shell-gbrowser-standin-self-test | 23.6 | fixer-isolate-self-test | 10.9 |
| sweep-reads-self-test | 23.2 | triage-workflow-self-test | 10.9 |
| orcad-lifecycle | 21.6 | site-identity | 10.4 |
| site-identity-self-test | 17.1 | orca-browser-entry-points | 9.9 |
| verify-platform-driver-self-test | 15.7 | update-channel-self-test | 9.1 |
| orca-git-sides-self-test | 15.4 | install-matrix-self-test | 8.9 |

These twenty take 381 s of the run's 677 s. Proposal, as a Handoff to integration, since no row on it is this lane's:
- Move these self-test rows to the full tier: claude-wrapper-pane-self-test, agent-tab-walls-self-test, rebase-orca-self-test, shell-gbrowser-standin-self-test, sweep-reads-self-test, orca-git-sides-self-test, dispatch-release-self-test, withdraw-self-test, fixer-isolate-self-test, triage-workflow-self-test, update-channel-self-test and install-matrix-self-test. They take 258 s together, which would bring this loaded run to about 420 s.
- Keep their checks (the rows without `-self-test`) in --quick, so the commit gate still asserts the tree.
- Keep site-identity-self-test in --quick: D-60 (3) made it fit the 480 s limit rather than move it.
- The moved rows no longer run in hosted CI, which runs --quick only. Owners should accept that before the move.

This lane's own row, verify-platform-driver-self-test (15.7 s under load, about 13 s idle), stays in --quick. It is the commit gate's and CI's only proof of the driver's verdicts. It already runs its fixtures six at a time.

Other checks run against the touched files, all green:
- verify-platform-driver --self-test (41 cases, 21 plants)
- verify-orcad-leak --self-test
- orca-macos-merge --self-test
- orca-packaged-tree --self-test
- ci-fetches and its --self-test
- workflows and its --self-test
- fix-gate --self-test
- release-shape (locked; read only)
- tab-strip
- scan-brand-residue
- the bash replay of gate run 5 through the driver's own exclusion functions

Not run: any live row (lane rule), and verify.yml on a hosted runner.
