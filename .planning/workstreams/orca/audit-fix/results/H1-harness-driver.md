# Result: H1-harness-driver

Branch: worktree-agent-af1e134a3e7cb0ea4   Base: 0f9f2735401a08132a479c95c09c53f03015fa19   Final: 142669a9 (last fix; this record is the commit after it)

The SKIP protocol the other harness lanes follow is `.planning/workstreams/orca/audit-fix/SKIP-PROTOCOL.md`.

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| harness-driver-03 | fixed | 64675503 | scripts/verify-ci-fetches.mjs::fetch-before-table (+ --self-test) | verify.yml runs fetch-orca.sh before the table; the check derives every scripts/fetch-*.sh and requires each before --quick. Not run on a hosted runner here (no network installs in lanes). |
| harness-driver-06 = 59-CR-03 | fixed | d47ea24e | scripts/redate-windows.mjs --self-test::a missing parser makes the self-test a named SKIP / the tool FAIL | Parser loaded on first use; row moved from --quick to the full tier; missing parser = SKIP 77 (self-test) / FAIL (tool), naming the path. |
| harness-driver-01 | fixed | 3a67fd9a | scripts/verify-platform-driver.mjs --self-test::exit 0 with a SKIP last line is SKIP, not PASS; --gate fails an unexcused SKIP | Driver records SKIP (exit 77, or exit 0 with a SKIP last line); --gate fails any SKIP no keyed exclusion excuses. D-60 (2) kept as a SKIP exclusion keyed to WINDOWS 69. |
| harness-driver-05 | fixed | 3a67fd9a | scripts/verify-platform-driver.mjs --self-test::--gate keeps a different FAIL / a second FAIL in an excluded row red | Exclusions now `label\|id\|verdict\|mode\|patterns\|reason`; each pattern was read off gate run 5. bundled-xpi-live-dev (--live --dev) added. New ledger entries for the unnamed rows: Needs owner. |
| harness-static-structure-02 | fixed | 3a67fd9a | scripts/verify-platform-driver.mjs --self-test::exit 0 with a SKIP last line is SKIP | Same driver fix as harness-driver-01; the listed scripts keep exit 0 until H2-H8 convert them (the last-line rule already records them SKIP). |
| 59-WR-04 | fixed | d47ea24e | scripts/redate-windows.mjs --self-test::synthetic fixture has two open, one fixed and one waived entry | Fixture built with gsd-core's emptyLedger/appendWindow/markFixed/markWaived; WINDOWS.md is only read to prove it unchanged. |
| harness-driver-11 | fixed | 8975d53d | scripts/lib/orca-artifacts.mjs --self-test::symlink in one tree only / targets differ / outside the packaged tree | Links are judged: same in-tree target in both trees is a `same` line, anything else is red naming it. |
| harness-driver-04 | fixed | e7f8f3d1 | scripts/verify-orcad-leak.mjs --self-test::orca-run plants; scripts/verify-platform-driver.mjs --self-test::a row that leaves a daemon in a session of its own is FAIL | orca-run kills orcad when startOrcad rejects, on exit and on a signal; every row carries PB_VERIFY_ROW_TOKEN and the leak leg runs whenever the group or the token is alive; cleanup() sweeps by token on interrupt. Callers not edited: the rejection kill covers them. |
| harness-driver-09 | fixed | 142669a9, e7f8f3d1 | scripts/verify-live-scratch-home.mjs --self-test::a probe folder inside scripts/lib | Probes go to a temp folder with imports relocated to the real helper; orcad-leak plants are stopped on exit and signal. |
| harness-driver-10 | needs-owner | - | (proposed) verify-ng-027-reader-callers.mjs self-test plant: a dead PowerBrowserAPI reader named like a called PowerBrowserProcesses method | Ledger-locked file; diff under Needs owner. Latent today (no shared name). |
| harness-driver-08 | fixed | 3a67fd9a, e7f8f3d1, 336fe4ae | scripts/verify-platform-driver.mjs --self-test (28 cases, 12 planted driver faults) | The driver is run on fixture registries (PB_VERIFY_FIXTURE_*); plants include the `\|\| true` leak leg, the gate's SKIP pass, the pattern, mode only and the ledger check. orcad-leak's substring wiring check removed in favour of it. |
| harness-driver-07 | fixed | e7f8f3d1 | scripts/verify-platform-driver.mjs --self-test::--gate fails a row that leaves a process behind; nothing a row left is still running | --sweep stops every other survivor of the row's group or token (2 s grace, TERM, KILL) and names it on a NOTE; FAIL under --gate. |
| harness-live-tabs-14 | fixed | 336fe4ae | scripts/verify-platform-driver.mjs --self-test::a full-tier row runs under the live lock; a run under flock <lock> by its caller does not wait | The driver takes <git common dir>/pb-live.lock before the first full-tier row (holder process, flock -o) and exports PB_LIVE_LOCK_HELD=1. |
| harness-static-browser-06 | fixed | 3a67fd9a | scripts/verify-platform-driver.mjs --self-test::exit 0 with a SKIP last line is SKIP | Driver half fixed. The per-script exit-77 conversion and the page-table SKIP branch deletion are other lanes' files: Handoffs. |

## Registry requests
None. This lane owns scripts/verify-platform.sh and registered its own rows:
- quick: `verify-platform-driver-self-test`, `ci-fetches`, `ci-fetches-self-test`.
- full: `bundled-xpi-live-dev|node $REPO_ROOT/scripts/verify-bundled-xpi.mjs --live --dev`; `redate-windows-self-test` moved here from --quick.

## Red by design
None.

## Handoffs
- Harness lanes H2-H8 (the owners of each SKIP-printing script): convert every `SKIP --` path that exits 0 to exit 77 per SKIP-PROTOCOL.md (partial skips through `verdictExit`), and change self-test controls that expect exit 0 on a SKIP to expect 77. Until then the driver's last-line rule records a script whose last line is a SKIP as SKIP; a partial skip followed by a PASS line still reads PASS. This is for harness-driver-01, harness-static-structure-02 and harness-static-browser-06.
- Owner of scripts/verify-orca-browser-tab-scope.mjs: delete the page-table clause's SKIP branch (orca-browser-dispatch.ts absent, :1134); lane p66-02 is merged (harness-static-browser-06).
- Integration: inventory/brand-tokens.json held-back counts changed here: `orca` 5679 -> 5696, with .github/workflows/verify.yml added to its expected_files and only_in; `orcad` 1786 -> 1831. Other lanes will change the same two numbers. After merging, run `node scripts/scan-brand-residue.mjs` and set each count to the observed value.

## Behaviour changes
- harness-driver-01 (D-60): `--gate` now fails every SKIP no exclusion excuses. D-60 (2) is kept: orca-agent-status-live's SKIP on a sign-in under 60 minutes is excused under WINDOWS 69, and only that SKIP. Replaying gate run 5 (da97a4e9) under the new rules, descriptor-monotonic (0 published Releases) is now an unexcused SKIP and red. On a host with an installed Orca, orca-hidden-electron and orca-slotless-start are red too. `--quick` and the full run still exit 0 on a SKIP; their summary prints `<label>: SKIP` plus a skipped list, and the verdict line reads `PASS -- every check that ran passed; N SKIPPED`. Revert with 3a67fd9a.
- harness-driver-05 (D-127, D-59): an exclusion now needs its described failure in the row's output. Replaying gate run 5, two rows that the old gate excused are now red. ng074-ci-green-on-main is red because the verify.yml run "concluded failure"; that was the redate-windows CI red fixed here, and entry 31 describes "no run". extension-actions-live is red because it also failed policies-shell-only, which entry 29 does not describe. Revert with 3a67fd9a.
- harness-driver-07: a row that leaves any process behind has it stopped. That is a NOTE in --quick and the full run, and FAIL under --gate. Revert with e7f8f3d1.
- harness-driver-04: lib/orca-run.mjs now SIGKILLs an orcad whose start rejected, and every orcad still running when its process exits or gets SIGINT, SIGTERM or SIGHUP. Revert with e7f8f3d1.
- harness-live-tabs-14: a run with a full-tier row now takes pb-live.lock and holds it to the end. A second session's live run waits for it, and the driver prints "waiting for the live lock". `PB_LIVE_LOCK_HELD=1` or a `flock <lock>` ancestor skips the wait. Revert with 336fe4ae.
- harness-driver-06: redate-windows-self-test no longer runs in --quick or CI. Revert with d47ea24e.
- harness-driver-03: hosted CI now clones the pinned orca/ before the table. If an Orca-derived quick row cannot pass on a fresh fetch without a build, CI turns red there; that was not verifiable here. Revert with 64675503.
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
- harness-driver-05: WINDOWS.md could not be edited here. Four ledger changes are needed:
  - Give their own entries (or name in entry 30's description) the seven rows keyed to 30 that its text omits: orca-packaged-tree, orca-packaged-live, branding-variant-divergence, verify-branding-identity-release, build-update-xml, bundled-xpi-packaged and bundled-xpi-live. Then re-key their exclusion rows to those entries.
  - Correct entry 69's text: it says its rows have "no GATE_KNOWN_OPEN_EXCLUSIONS row", but D-60 (1) and (2) gave real-input-gate-self-test and orca-agent-status-live one each.
  - Record or decide descriptor-monotonic's SKIP (no published Release) and extension-actions-live's policies-shell-only failure, both newly red in the gate.
  - Re-run the gate after a push whose verify.yml run is green, so that ng074-ci-green-on-main returns to entry 31's "no run" state or passes.

## Quick gate
`nix develop .#theia --command scripts/verify-platform.sh --quick` at 142669a9 exited 0 in 8 min 37 s, on a host shared with other lanes' gates.
- Counts: 420 PASS, 0 FAIL, 0 SKIP. No row left a process for the new sweep to stop.
- Against BASE-QUICK.txt (418 labels): every base row is still PASS. redate-windows-self-test has moved to the full tier (harness-driver-06). Three rows are new: verify-platform-driver-self-test, ci-fetches and ci-fetches-self-test.
- No row is non-PASS, so none needs a classification.
- The 26 SKIP lines the base listed were self-test notes, not last lines, so the new rule leaves them PASS.

Other checks run against the touched files, all green:
- verify-orcad-leak --self-test
- live-scratch-home and its --self-test (33/33)
- orca-macos-merge --self-test
- redate-windows --self-test
- release-shape (locked; read only)
- tab-strip
- fix-gate --self-test
- workflows and its --self-test
- watchdog
- dispatch-release
- manifest-literals
- scan-brand-residue
- the --self-test of each of orca-slotless-start, orca-hidden-electron, orca-credential-store-live, orca-pairing-containment, orca-packaged-tree and macos-package-payload

Not run: any live row (lane rule), and verify.yml on a hosted runner.
