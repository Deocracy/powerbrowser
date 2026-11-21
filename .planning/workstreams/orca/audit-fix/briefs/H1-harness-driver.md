# Fix brief: H1-harness-driver

Lane: harness. Items: 14. Files this group owns: `scripts/verify-platform.sh`, `scripts/redate-windows.mjs`, `scripts/verify-live-scratch-home.mjs`, `scripts/verify-orcad-leak.mjs`, `scripts/lib/orca-run.mjs`, `scripts/lib/orca-artifacts.mjs`, `scripts/lib/pb-live-probe.mjs`, `scripts/lib/pb-relaunch.mjs`, `scripts/lib/sidecar-status-recorder.cjs`, `^scripts/verify-ng-` (pattern), `.github/workflows/verify.yml`, `.planning/WINDOWS.md`.

Item IDs: harness-driver-03; harness-driver-06 = 59-CR-03; harness-driver-01; harness-driver-05; harness-static-structure-02; 59-WR-04; harness-driver-11; harness-driver-04; harness-driver-09; harness-driver-10; harness-driver-08; harness-driver-07; harness-live-tabs-14; harness-static-browser-06.

## harness-driver-03: CI never fetches orca/, so the Orca-derived clauses of the quick security rows print SKIP and pass on every push and fork PR

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `.github/workflows/verify.yml:93`

**What is wrong.** verify.yml fetches upstream/ and builds Theia, then runs the --quick table. It never runs scripts/fetch-orca.sh. Every quick v1.7 row that derives its expectation from the pinned Orca source therefore skips those clauses and exits 0: orca-credential-store (clauses 1-3, the plaintext override and temporary-key roots), orca-failure-classes (Orca's PairingOfferUnavailableReason and WebRuntimeAuthFailureReason), orca-browser-entry-points (the whole row SKIPs without orca/src), orca-mobile-protocol, orca-overlay's pinned-blob and replay steps, orca-pane-routes and orca-claude-sdk. The CI check that outside contributors see goes green without any Orca-side assertion, while the workflow header says it runs 'the whole --quick table'.

**Scenario.** A fork PR edits orca-overlay/seams.json or a PB file so that the credential-store override no longer matches Orca's pinned trigger value, or so that a new Orca failure reason is unmapped. In verify.yml, orca-credential-store and orca-failure-classes print 'SKIP of the pinned-source clauses only -- orca/ is not fetched' and pass, and the PR shows a green 'Verify static layers' check.

**Evidence.** .github/workflows/verify.yml:79-93: steps are generate, generate --check, `bash scripts/fetch-upstream.sh && bash scripts/apply-patches.sh`, Theia build, then `scripts/verify-platform.sh --quick`. No fetch-orca step. verify-orca-credential-store.mjs:170 `notes.push(`SKIP of the pinned-source clauses only -- ... 'orca/ is not fetched (bash scripts/fetch-orca.sh)'`)`; verify-orca-failure-classes.mjs:182 (same); verify-orca-browser-entry-points.mjs:659 `if (r.skips.length) { console.log(`${NAME}: SKIP -- ...`); return 0; }`; verify-orca-mobile-protocol.mjs:186 `if (r.skip) return { code: 0, ... SKIP ...}`.

**Suggested fix.** Add a `bash scripts/fetch-orca.sh` step to verify.yml before the table. It is pinned by commit, and the job's token is already read-only with persist-credentials false. Alternatively, fail a quick row in CI (CI=true) when orca/ is absent instead of skipping it.

**Verifier (CONFIRMED, medium).** verify.yml runs generate, generate --check, fetch-upstream plus apply-patches, the Theia build, then `verify-platform.sh --quick`. No step runs fetch-orca.sh; it appears only in release.yml and release-train.yml. orca/ is gitignored (.gitignore:44 `/orca/`) and no file under it is tracked, so a fresh CI checkout has no orca/. verify-orca-credential-store.mjs:170 and verify-orca-failure-classes.mjs:182 then add 'SKIP of the pinned-source clauses only -- orca/ is not fetched' and continue. verify-orca-browser-entry-points.mjs:659 exits 0 on any skip. The Orca-derived assertions therefore never run in push or fork-PR CI, and the check still shows green. The quick table runs in full; its Orca clauses SKIP by design. The gap is in CI coverage, and the local gate does run these clauses. *Checked at:* .github/workflows/verify.yml:79-93 (no fetch-orca step); .gitignore:44; scripts/verify-orca-credential-store.mjs:170; scripts/verify-orca-failure-classes.mjs:182; scripts/verify-orca-browser-entry-points.mjs:659

## harness-driver-06 = 59-CR-03: redate-windows-self-test in --quick loads unpinned code from the developer's ~/.claude and cannot run in CI

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/redate-windows.mjs:15`

**What is wrong.** At import time the script requires broken-windows.cjs from GSD_BROKEN_WINDOWS or from ~/.claude/gsd-core/bin/lib/. Neither is in the repository or pinned. The row is registered in the --quick tier, which is the commit gate and the verify.yml CI table. In CI no gsd-core is installed, so require() throws and the row fails on every push: a permanent non-defect red that teaches readers to ignore the CI table. On a developer machine the commit gate executes whatever code sits at that home path, or at the path an inherited GSD_BROKEN_WINDOWS names, under the repo's verification authority.

**Scenario.** A fork PR or any push runs verify.yml. `node scripts/redate-windows.mjs --self-test` throws MODULE_NOT_FOUND for /home/runner/.claude/gsd-core/bin/lib/broken-windows.cjs and the --quick table is red for a reason unrelated to the change. Locally, a different gsd-core version with a changed renderLedger shape makes the gate depend on the developer's tool install, not the tree.

**Evidence.** scripts/redate-windows.mjs:15-17 `const BW_PATH = process.env.GSD_BROKEN_WINDOWS ?? path.join(os.homedir(), '.claude', 'gsd-core', 'bin', 'lib', 'broken-windows.cjs'); const bw = require(BW_PATH);`; scripts/verify-platform.sh:3680 `"redate-windows-self-test|node $REPO_ROOT/scripts/redate-windows.mjs --self-test"` inside the quick CHECKS; .github/workflows/verify.yml:93 runs `--quick`; no workflow references gsd-core.

**Suggested fix.** Move the row out of --quick, or vendor a pinned copy of the parser into the tree. Otherwise the row should print a named SKIP (with the SKIP verdict proposed above) when the tool is absent, and never require from an environment-supplied path in the commit gate.

**Verifier (CONFIRMED, medium).** redate-windows.mjs:15-17 runs require() at module top level on GSD_BROKEN_WINDOWS or ~/.claude/gsd-core/bin/lib/broken-windows.cjs. Neither is in the repository. The row redate-windows-self-test is registered at verify-platform.sh:3680 inside the base CHECKS array (:3659), which is the --quick tier, and verify.yml:93 runs --quick. No workflow references gsd-core or GSD_BROKEN_WINDOWS. On a GitHub runner, require throws MODULE_NOT_FOUND before any self-test code runs, so the row is red for a reason unrelated to any change. Locally the result depends on whatever gsd-core version is installed. The 'executes untrusted code' angle needs control of the developer's own home or environment, which is already full control, so it adds no severity. The severity rests on the permanent non-defect red in CI. *Checked at:* scripts/redate-windows.mjs:15-17; scripts/verify-platform.sh:3659,3680; .github/workflows/verify.yml:93; grep of .github/ finds no gsd-core reference

---

**Per-phase review report of the same defect (59-CR-03).**

*Section CR-03 of `.planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-REVIEW.md`, verbatim:*

**File:** `scripts/redate-windows.mjs:15-17`
**Issue:** `require(BW_PATH)` runs at module top level, with the default path `~/.claude/gsd-core/bin/lib/broken-windows.cjs`. The row `redate-windows-self-test` sits inside `run_own_checks`'s base `CHECKS` array (`scripts/verify-platform.sh:3680`). That array is the `--quick` set, not the `QUICK -eq 0` extension at `:6082`. `.github/workflows/verify.yml:93` runs `scripts/verify-platform.sh --quick` on `ubuntu-latest`, and no step installs gsd-core or sets `GSD_BROKEN_WINDOWS`. The script throws `MODULE_NOT_FOUND` before `main` runs, so the commit gate fails on every PR whose base carries this row. That includes the bot bump PRs whose auto-merge waits on that check. Per CLAUDE.md, `--quick` is the commit gate, so a row that cannot run in CI cannot sit in it.
**Fix:** Do one of the following:
- Vendor the two functions the tool needs (`parseLedger` and `renderLedger`) into `scripts/lib/` with a drift check against gsd-core.
- Move the row into the full tier (`CHECKS+=` under `QUICK -eq 0`) and make a missing parser an explicit, named FAIL:

```js
let bw;
try { bw = require(BW_PATH); }
catch { console.error(`redate-windows: FAIL -- gsd-core broken-windows parser not found at ${BW_PATH}; set GSD_BROKEN_WINDOWS`); process.exit(1); }
```

## Warnings

## harness-driver-01: Driver has no SKIP verdict: a row that prints SKIP and exits 0 is recorded PASS, and --gate reports every check green

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-platform.sh:6985`
- **Owner decision cited:** D-60

**What is wrong.** The run loop decides a row only from the exit status of the row process and the leak leg. It has no SKIP state and does not read the row's output. Every v1.7 live row that guards a security requirement returns 0 after printing 'SKIP --' when one of its preconditions is missing, so the summary prints '<label>: PASS'. run_gate_mode only looks at '<label>: FAIL' lines, so --gate prints 'every registered check is green at this commit' while those rows asserted nothing. The project already treats this as a defect elsewhere: scripts/rebase-orca.sh makes any SKIP line red inside the replay, and WINDOWS 69 records that orca-agent-status-live was counted PASS on a SKIP in gate runs 4 and 5.

**Scenario.** A gate run on a host where theia/node_modules/typescript is missing, where orca/out/orcad/orcad.js was not rebuilt, or where the Claude sign-in expires in under 60 minutes. orca-credential-store-live (credential store) prints 'SKIP -- theia/node_modules/typescript is not installed' and exits 0. no-remote-agent-port-live (D-11) and orca-pairing-containment-live (pairing containment) print SKIP with no built orcad. orca-agent-status-live prints SKIP on the sign-in margin. orca-slotless-start, the permanent re-pin proof, prints SKIP on any host where installedOrcaPaths(orcaDir, homedir()) finds ~/.local/bin/orca-ide or /opt/Orca/orca-ide. Each row is summarised as PASS, and the gate exits 0 with 'PASS' or 'PASS-WITH-EXCLUSIONS'.

**Evidence.** scripts/verify-platform.sh:6975-6990: `setsid $cmd & ... wait "$CURRENT_CHECK_PID" || row_ok=0 ... if [ "$row_ok" -eq 1 ]; then SUMMARY+=("$label: PASS")`. Gate :7066-7067 `extract_failed_labels` greps only `': FAIL$'`, and :7199-7200 prints `--gate PASS -- ... every registered check is green`. Row exits: verify-orca-credential-store-live.mjs:120 `if (!ts) { console.log(`${NAME}: SKIP -- theia/node_modules/typescript is not installed`); return 0; }`; verify-no-remote-agent-port-live.mjs:286 `if (skip) { console.log(`${NAME}: SKIP -- ${skip}`); return 0; }`; verify-orca-pairing-containment.mjs:257 `if (pre.skip) {...; return 0; }`; verify-orca-agent-status-live.mjs:199-200 `const unseeded = seedClaudeLogin(); if (unseeded) return { skip: unseeded };`; verify-orca-slotless-start.mjs:130-131 (installedOrcaPaths default home = os.homedir(), lib/orca-run.mjs:276). Contrast: scripts/rebase-orca.sh:25 `SKIP is red inside the replay`.

**Suggested fix.** Give the driver a SKIP verdict. Have rows exit with a distinct code (for example 3) or print a fixed last line, record '<label>: SKIP', and make --gate fail on any SKIP that is not keyed to an open ledger entry, the same way FAIL exclusions are keyed. Under --gate, turn a missing typescript, a missing orcad build or an installed Orca into a FAIL.

**Verifier (CONFIRMED, medium).** I traced the full path. In run_own_checks (scripts/verify-platform.sh:6974-6991), a bash or node row gets PASS or FAIL from two things only: `wait "$CURRENT_CHECK_PID" || row_ok=0` and the orcad leak leg. The row's stdout is never read, and there is no SKIP state. run_gate_mode (7128-7171) only checks exclusions when rc is non-zero, and it reads failures through extract_failed_labels (7066-7068), which matches only `^  <label>: FAIL$`. With no failures it prints "--gate PASS ... every registered check is green at this commit" (7199-7200). I found no environment variable or strict mode that turns a row's SKIP into a non-zero exit. I checked every cited row exit:
- verify-orca-credential-store-live.mjs:120 prints SKIP and returns 0 when typescript is missing. Lines 116-117 do the same with no built PowerBrowser or no orcad.js.
- verify-no-remote-agent-port-live.mjs:286 prints SKIP and returns 0.
- verify-orca-pairing-containment.mjs:257 prints SKIP and returns 0 on pre.skip.
- verify-orca-agent-status-live.mjs:196-200 returns {skip} on a missing build, a missing claude, or an unseeded sign-in. At 395, code stays 0.
- verify-orca-slotless-start.mjs:179 returns 0 on skipReason. scripts/lib/orca-run.mjs:125-133 includes the installed-Orca case, using installedOrcaPaths with home = homedir() (orca-run.mjs:276). Neither path exists on this host now.

The contrast the finding draws is real. rebase-orca.sh:25-28 treats any SKIP line as red in the replay. WINDOWS.md entry 69, still open, records that orca-agent-status-live was counted PASS on a SKIP in gate runs 4 and 5, so TERM-02's real-agent leg did not run in those gates. This has happened in practice.

I lowered the severity from high to medium for two reasons:
1. The rows still go red when their preconditions hold, so they are not checks that can never go red.
2. The input is host or build state, not something an attacker controls.

The effect is a defence-in-depth gap in the harness: --gate can claim every check is green while several security rows asserted nothing. Skip-and-pass on absent trees is a documented convention in the registry comments (for example 4754 and 4824), but no owner decision accepts it for the --gate green claim. WINDOWS 69 records the agent-status case as an open issue, not as an accepted risk. *Checked at:* scripts/verify-platform.sh:6977-6984 (exit-status-only PASS), :7066-7068 (FAIL-only extraction), :7199-7200 (green claim); scripts/verify-orca-credential-store-live.mjs:120; scripts/verify-no-remote-agent-port-live.mjs:286; scripts/verify-orca-pairing-containment.mjs:257; scripts/verify-orca-agent-status-live.mjs:200,395; scripts/verify-orca-slotless-start.mjs:179; .planning/WINDOWS.md:86 (entry 69)

## harness-driver-05: Gate exclusions keyed to WINDOWS 30 excuse seven rows the entry does not name, for any failure reason, until 'next version'

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-platform.sh:7116`
- **Owner decision cited:** D-59

**What is wrong.** Exclusions match on the label alone and accept any red reason while the ledger entry is open. WINDOWS 30 describes ten packaged rows that are red because no container release tarball exists, and it is re-dated to 'next version'. v1.7 keys seven more rows to it that its description does not list: orca-packaged-tree, orca-packaged-live, branding-variant-divergence, verify-branding-identity-release, build-update-xml, bundled-xpi-packaged and bundled-xpi-live. The 39-19 comment above the list says branding-variant-divergence and verify-branding-identity-release were removed because they pass. Entry 30 also already covers ng065-mar-signature-enforced (update integrity). Any new failure in these rows is printed as 'EXCLUDED (known-open)' and the gate exits 0, for example uBlock not blocking, a release identity regression, or MAR signatures not enforced once a tarball exists. bundled-xpi-live has a --dev mode on the dev objdir, so it could be run instead of excluded. real-input-gate-self-test is keyed to WINDOWS 69, whose own text says the rows 'have no GATE_KNOWN_OPEN_EXCLUSIONS row'.

**Scenario.** After the container tarball is built, bundled-xpi-live goes red because the distribution-directory XPI no longer blocks the derived rule, or ng065-mar-signature-enforced goes red because an unsigned MAR is applied. Both labels match an entry-30 exclusion, entry 30 is still 'open' (re-dated to next version), and --gate prints PASS-WITH-EXCLUSIONS.

**Evidence.** scripts/verify-platform.sh:7172-7176 `if [ "$label" = "$excl_label" ]; then ... if ledger_entry_is_open "$excl_ledger_id"; then echo "  EXCLUDED (known-open): ..."; excused=1`; :7108-7109 `"orca-packaged-tree|30|..."`, `"orca-packaged-live|30|..."`; :7116-7120 `"branding-variant-divergence|30|..."` ... `"bundled-xpi-live|30|..."`; :7089 `"ng065-mar-signature-enforced|30|..."`. WINDOWS.md entry 30 description lists only ng063-packaged-launch ... mar-update-hop. Entry 69: 'They are re-run, not excluded, and have no GATE_KNOWN_OPEN_EXCLUSIONS row'.

**Suggested fix.** Key each exclusion to the failure line it excuses (for example a required substring such as 'no container-built release tarball' or 'objdir-release absent'), so a different red in the same row stays red. Record the added rows in their own ledger entries rather than widening entry 30. Run bundled-xpi-live as --live --dev in the gate until the release objdir exists.

**Verifier (CONFIRMED, medium).** run_gate_mode (verify-platform.sh:7167-7180) matches a failing label against GATE_KNOWN_OPEN_EXCLUSIONS by exact label alone. If ledger_entry_is_open(id) holds, the row is excused whatever the failure reason. WINDOWS.md entry 30 (line 47) names exactly ten rows (ng063-packaged-launch ... mar-update-hop) and has status open, 'Re-dated to next version'. The list also keys orca-packaged-tree, orca-packaged-live (:7108-7109), branding-variant-divergence, verify-branding-identity-release, build-update-xml, bundled-xpi-packaged and bundled-xpi-live (:7116-7120) to entry 30, and none of these appear in its description. The 39-19 comment at the top of the list says branding-variant-divergence and verify-branding-identity-release were removed because they pass, yet they are listed again. real-input-gate-self-test is keyed to entry 69 (:7115), whose text says these rows 'are re-run, not excluded, and have no GATE_KNOWN_OPEN_EXCLUSIONS row'. verify-bundled-xpi.mjs supports `--live --dev` (:25,39), so the dev run is available. Any new red in these rows, including a security regression such as a bundled uBlock not blocking or the MAR signature check, is printed as EXCLUDED and the gate exits 0. The design keys on the ledger by intent (D-127), but the keying here is broader than what the ledger entries describe. *Checked at:* scripts/verify-platform.sh:7073-7121 (list), 7167-7180 (label-only match); .planning/WINDOWS.md line 47 (entry 30's ten rows), line 86 (entry 69 'no GATE_KNOWN_OPEN_EXCLUSIONS row')

## harness-static-structure-02: verify-platform.sh counts every exit-0 SKIP as PASS, so a check that did not run is reported as green

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-platform.sh:6986`

**What is wrong.** The driver derives a row's result only from the exit status of the check, and SUMMARY records "$label: PASS". No row output is inspected for SKIP. Every named SKIP in the assigned shard therefore reads as PASS in the summary and in --gate.
SKIP exits exist in: orca-build-shape (no built tree), orca-slotless-start (no built orca/ or PowerBrowser, or an installed Orca), orca-pane-entry (no pb-panes bundle), orca-pane-css, orca-overlay-built, orca-pane-groups, orca-pane-routes, orca-editor-routes, orca-no-pb-add-project, orca-terminal-keys (typescript absent) and orca-pin (both pin keys absent).
The known orca-agent-status-live instance is the same defect.

**Scenario.** On a machine or CI job without a built orca/ or without theia/node_modules/typescript, every one of these rows prints SKIP and exits 0. The summary shows PASS, and --gate reports "every registered check is green".

**Preconditions.** Any run where an input of a SKIP-capable row is absent.

**Evidence.** verify-platform.sh ~6972-6990: `wait "$CURRENT_CHECK_PID" || row_ok=0` ... `if [ "$row_ok" -eq 1 ]; then SUMMARY+=("$label: PASS")`. verify-orca-build-shape.mjs:157 `if (r.skip) return { code: 0, lines: [`SKIP -- ...`] }`.

**Suggested fix.** Let the driver capture each row's output and report SKIP when it contains a line matching `^<label>: SKIP`. Have --gate refuse any SKIP not on the WINDOWS.md known-open list. Alternatively give SKIP-capable checks a distinct exit code (for example 77) that the driver maps to SKIP.

**Verifier (CONFIRMED, medium).** verify-platform.sh ~6972-6990 sets row_ok only from the wait exit status (and the orcad leak check) and records '$label: PASS'. Output is not inspected for SKIP. SKIP paths exit 0 (e.g. verify-orca-build-shape.mjs:157, pane-routes:547-548, no-pb-add-project:339). So a not-run row reads PASS in the summary and in --gate. *Checked at:* scripts/verify-platform.sh:6972-6990 has no SKIP handling; scripts/verify-orca-build-shape.mjs:157

## 59-WR-04: The redate self-test fixture is the live WINDOWS.md, so the row goes red once fewer than two entries are open

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `scripts/redate-windows.mjs`

*Section WR-04 of `.planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-REVIEW.md`, verbatim:*

**File:** `scripts/redate-windows.mjs:84-93`, `:111`
**Issue:** `selfTest` copies `.planning/WINDOWS.md` and needs at least two open entries and one non-open entry. Phase 59's own goal is a gate with no exclusions, which means closing open entries. With one or zero open entries, line 92 records a FAIL. Line 111 then calls `redate({ ids: [a, undefined] })`, which throws an uncaught `id undefined: no such WINDOWS.md entry` out of the `try`/`finally`. The self-test therefore goes red, with a stack trace, on a tree that has no defect. A self-test's fixture must not depend on project progress.
**Fix:** Build a synthetic ledger in the temp directory with gsd-core's own `emptyLedger` and `appendWindow`, with two open entries, one fixed and one waived. Then the plants and controls run against a fixed shape.

## harness-driver-11: macOS Orca merge plan skips symlinks, so they ship from the arm64 tree unchecked

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/orca-artifacts.mjs:96`

**What is wrong.** packagedFiles walks out/orcad and out/web with readdirSync(withFileTypes) and keeps only e.isFile(). Symbolic links (files or directories) are neither paired, compared nor reported. package-macos.sh orca-universal then does `cp -a "$arm/out/orcad" "$arm/out/web"`, so every symlink and its target come from the arm64 tree, and an x64-only or differing link disappears from the universal package without a FAIL. The self-test plants no symlink.

**Scenario.** An Orca re-pin ships out/orcad/node_modules as a pnpm-style tree whose native module paths are symlinks to arch-specific stores. The merge plan reports green with no pair for them, and the universal package carries only the arm64 binary behind the link, so orcad fails to load it on an x64 Mac.

**Evidence.** scripts/lib/orca-artifacts.mjs:95-96 `if (e.isDirectory()) walkDir(p); else if (e.isFile()) out.push(relative(root, p)...)`; powerbrowser/packaging/package-macos.sh:70 `cp -a "$arm/out/orcad" "$arm/out/web" "$out/out/"`.

**Suggested fix.** Treat a symlink as a planned item: require identical link targets in both trees, or refuse with FAIL naming it. Add a symlink plant to the self-test.

**Verifier (CONFIRMED, low).** At scripts/lib/orca-artifacts.mjs:92-96, packagedFiles calls readdirSync(dir,{withFileTypes:true}). Those Dirent types come from lstat, so a symlink is neither isDirectory() nor isFile() and is skipped. It is never paired, compared, or reported as present in one tree only. macosMergePlan (:118-145) therefore cannot FAIL on a symlink that exists only in the x64 tree, or on links whose targets differ between the trees. package-macos.sh orca_universal then runs `cp -a "$arm/out/orcad" "$arm/out/web" "$out/out/"`, so every link comes from the arm64 tree only. The x64 tree's links are never consulted. The self-test (:182-206) plants no symlink. One part of the scenario is overstated. With a pnpm-style layout whose links point into node_modules/.pnpm inside the same out/orcad tree, the real target files are still walked and in-place lipo-merged in $out, and the copied arm link then resolves to the merged file. The silent loss applies only to links that are x64-only, that differ between the trees, or that point outside out/orcad or out/web. I found no symlink, dereference or node-linker handling in orca's scripts or .npmrc, so nothing shows Orca's tree carries links today. This is a hardening gap in a packaging check, so low. *Checked at:* scripts/lib/orca-artifacts.mjs:95-96 is `if (e.isDirectory()) walkDir(p); else if (e.isFile()) out.push(...)`, and Dirent from readdirSync withFileTypes is lstat-based, so symlinks are skipped. powerbrowser/packaging/package-macos.sh orca_universal has `cp -a "$arm/out/orcad" "$arm/out/web" "$out/out/"`. Neither file contains isSymbolicLink or any symlink handling.

## harness-driver-04: orcad started through orca-run.mjs leaks when startOrcad rejects or the row is interrupted, and the leak leg cannot see it

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/orca-run.mjs:179`

**What is wrong.** startOrcad spawns orcad with detached: true, which puts it in its own session and process group. On its timeout or ready-line parse failure it rejects without killing the child, and attaches the child only as error.child. Three callers ignore error.child: verify-orca-credential-store-live.mjs:146 (const started = await startOrcad(...)), verify-orca-browser-host-bundle.mjs:406 (run stays null, so the finally skips stopOrcad), and lib/orca-pane-harness.mjs:169 (child stays null). Only slotless-start and packaged-live recover it. When the driver interrupts a row, cleanup() sends `kill -- -$CURRENT_CHECK_PID`, which never reaches a detached orcad. The row's node then dies on SIGTERM without running its finally (liveHome's handler re-raises the signal), so orcad and its terminal daemon survive. The 2026-11-16 leak leg cannot catch any of this: it runs only while the row's own process group still has a member (`kill -0 -- -PGID`), and it only lists orcads whose session id equals the row's session.

**Scenario.** orca-credential-store-live on a slow host: the control orcad needs more than 60 s to print orca_server_ready. startOrcad rejects, the row prints FAIL and exits, and orcad keeps running on a loopback port with its data root under /tmp until reboot. A Ctrl-C during orca-browser-host-bundle or orca-pane-standalone-live has the same effect. Repeated gate runs accumulate orcad and terminal-daemon processes, and the driver's leak leg reports nothing, because nothing remains in the row's process group.

**Evidence.** lib/orca-run.mjs:179 `spawn(nodeBin, args, { cwd: profileDir, env: liveEnv(env), detached: true, ... })`; :186-187 `const fail = (msg) => finish(rejectP, Object.assign(new Error(redact(msg)), { child, ... })); const timer = setTimeout(() => fail(`orcad printed no orca_server_ready line within ${timeoutMs} ms...`), timeoutMs);` (child is not killed). verify-orca-credential-store-live.mjs:146-151 `const started = await startOrcad(...); ... finally { await stopOrcad(started.child, ...) }`, so nothing is stopped on rejection. verify-orca-browser-host-bundle.mjs:406 `run = await startOrcad(...)` and :501 `if (run) { await stopOrcad(...) }`. Driver :6981 `if kill -0 -- "-$CURRENT_CHECK_PID" 2>/dev/null && ! node .../verify-orcad-leak.mjs --session "$CURRENT_CHECK_PID"`; verify-orcad-leak.mjs:48 `procs.filter((p) => p.sid === sid && ...)`.

**Suggested fix.** In startOrcad, kill the child's process group (and the daemon pid if known) before rejecting. Register a process 'exit' and signal handler in orca-run.mjs that stops every orcad it started. Have the driver record the row's start ticks and run the leak leg unconditionally, matching orcad by an argument or working directory under the row's scratch roots (as stopStrays does) instead of by session, and also stop Orca's terminal daemon.

**Verifier (CONFIRMED, low).** orca-run.mjs:179 spawns orcad with detached:true, which calls setsid. On timeout, parse error or exit, fail() at :186-187 rejects with error.child attached and never kills the child. verify-orca-credential-store-live.mjs:146 awaits startOrcad outside the try whose finally calls stopOrcad. verify-orca-browser-host-bundle.mjs:406 leaves run null, so the `if (run)` guard at :501 skips stopOrcad. orca-pane-harness.mjs:169 leaves child null. All three entry points call process.exit(...), so the parent ends while the detached orcad keeps running. The driver's leak leg (verify-platform.sh:6981) runs only if `kill -0 -- -PGID` finds a survivor in the row's group, and verify-orcad-leak.mjs:48 filters on sid === row session. A setsid'd orcad matches neither, so the leak is not seen. cleanup() at :139-143 signals only the row's group. On interrupt, firefox-bidi.mjs liveHome re-raises the signal after disposing HOME, so a finally may not run; that part depends on listener counts at runtime, but the timeout path is fully static. The impact is a leaked loopback test daemon and temp data on a failure path, which is harness hardening rather than a product defect. *Checked at:* scripts/lib/orca-run.mjs:179,186-187; scripts/verify-orca-credential-store-live.mjs:146-151; scripts/verify-orca-browser-host-bundle.mjs:406,501; scripts/lib/orca-pane-harness.mjs:169; scripts/verify-orcad-leak.mjs:48; scripts/verify-platform.sh:6981

## harness-driver-09: live-scratch-home writes probe modules into scripts/lib, which is tracked and not ignored, during the quick gate

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-live-scratch-home.mjs:212`

**What is wrong.** runHelperChild writes a copy (sometimes a planted variant) of firefox-bidi.mjs to scripts/lib/.scratch-home-probe-<pid>-<n>.mjs and deletes it only when the child exits. If the parent is killed (the completion hook's 480 s limit, a driver SIGINT that reaches the group, or OOM), the file stays in a tracked source directory that is not gitignored. Later treeFiles() scans and any `git add -A` by an agent will pick it up. In the same way, an interrupted orcad-leak self-test leaves its detached orcad-shaped plants running (`setInterval(() => {}, 1e9)`, own session), because they are killed only in its finally.

**Scenario.** The quick gate is stopped during live-scratch-home-self-test. scripts/lib/.scratch-home-probe-12345-7.mjs remains as an untracked copy of firefox-bidi.mjs with, for example, the signal listener removed. An autonomous commit with -A stages it.

**Evidence.** scripts/verify-live-scratch-home.mjs:212-213 `const probe = join(SCRIPTS, 'lib', `.scratch-home-probe-${process.pid}-${probeSeq++}.mjs`); writeFileSync(probe, src);` and :222 `rmSync(probe, ...)` only in the child's exit handler. `git check-ignore scripts/lib/.scratch-home-probe-1-0.mjs` reports no match. verify-orcad-leak.mjs:108 `spawn(..., { detached: true, stdio: 'ignore' })`.

**Suggested fix.** Write probes to a mkdtemp folder and import the helper there through a file URL with an import map. Alternatively add the probe pattern to .gitignore and sweep stale probes at start. Kill the orcad-leak plants from a process 'exit' and signal handler.

**Verifier (CONFIRMED, low).** verify-live-scratch-home.mjs:212-213 writes scripts/lib/.scratch-home-probe-<pid>-<n>.mjs, and the only rmSync is inside the child's 'exit' listener (:222) in the parent. If the parent dies first (SIGKILL, OOM, or a group signal before the listener runs), the file stays. `git check-ignore` returns no match (rc=1), so the file is untracked and not ignored, and `git add -A` would stage it. The row is in --quick (verify-platform.sh:4127). The orcad-leak self-test plants are spawned detached and unref'd with setInterval forever, and are killed only in its finally, so an interrupted run leaves them running. Both need an interruption to occur. This is hardening. *Checked at:* scripts/verify-live-scratch-home.mjs:212-213,222; git check-ignore scripts/lib/.scratch-home-probe-1-0.mjs -> no match; scripts/verify-orcad-leak.mjs plant() detached+unref, killed only in finally

## harness-driver-10: ng-027 change lets a reader on one boundary object be satisfied by a call through the other

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-ng-027-reader-callers.mjs:96`

**What is wrong.** v1.7 widened the method call pattern to `(PowerBrowserAPI|PowerBrowserProcesses)\.name\(`. deriveReaders does not record which object a two-space-indented method belongs to. A dead PowerBrowserAPI reader is therefore counted as called when a same-named method is called on PowerBrowserProcesses, and the reverse. Today the PowerBrowserProcesses methods (spawnProcessExact, listProcessTree, addNamedReapBlocker, writePrivateFile, platform) share no reader name with PowerBrowserAPI, so the drift risk is low. This is the only one of the five hash-locked ng files whose v1.7 change loosens an assertion. ng-018 adds a wait (the following expects are unchanged), ng-023 and ng-067 tighten their checks, and ng-072 only wraps env in liveEnv.

**Scenario.** A later change adds `listProcessTree` to PowerBrowserAPI as a dead duplicate. Its only call site is `PowerBrowserProcesses.listProcessTree(`, which matches the widened pattern, and ng-027 stays green.

**Evidence.** scripts/verify-ng-027-reader-callers.mjs:75-77 `const method = /^ {2}(?:async )?([A-Za-z_$][\w$]*)\(...` then `readers.push({ kind: 'method', name: method[1], file: PBA_REL, line: i })` (no owner object); :96 `if (reader.kind === 'method') return new RegExp(`(?:PowerBrowserAPI|PowerBrowserProcesses)\\.${reader.name}\\(`);`

**Suggested fix.** Record each method's owning object from the enclosing `export const X = Object.freeze({` span and build the call pattern from that object only. Add a self-test plant with the same name on both objects.

**Verifier (CONFIRMED, low).** At scripts/verify-ng-027-reader-callers.mjs:75-77, deriveReaders records every two-space-indented reader method in PowerBrowserAPI.sys.mjs as {kind:'method', name, file, line}. It does not record which exported object the method belongs to. The same file also exports PowerBrowserAPI (line 398), PowerBrowserWebTabs, PowerBrowserTabHost, PowerBrowserProcesses (line 10990) and PowerBrowserOrcaHosting. At :96, callPattern accepts `PowerBrowserAPI.name(` or `PowerBrowserProcesses.name(` for any method reader. git log shows this widening came in dc800b31 (62-03); before it the pattern was `PowerBrowserAPI\.name\(` only. So a dead reader on one object is counted as called when a same-named method is called on the other object. The self-test covers a removed PowerBrowserProcesses call site (:211-212) and a planted PowerBrowserAPI reader with no caller (:213-215). It never plants the same name on both objects, so this drift is not covered. Today's state matches the finding: the only PowerBrowserProcesses reader-named method is listProcessTree (:11004), and PowerBrowserAPI has no reader with that name. Its callers are in OrcaService.sys.mjs:335 and :644. The widening was needed, because without it listProcessTree would be falsely red. The defect is only that the match does not check the owning object. Today this is latent hardening, so low. *Checked at:* scripts/verify-ng-027-reader-callers.mjs:77 pushes {kind:'method', name, file, line} with no owner field. :96 is `new RegExp(`(?:PowerBrowserAPI|PowerBrowserProcesses)\\.${reader.name}\\(`)`. Commit dc800b31 changed it from `PowerBrowserAPI\\.` only. No self-test case plants a same name on both objects.

## harness-driver-08: orcad-leak self-test proves the driver wiring by substring only; the gate and row verdict logic has no self-test

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orcad-leak.mjs:92`

**What is wrong.** The self-test confirms only that verify-platform.sh contains the text `scripts/verify-orcad-leak.mjs" --session "$CURRENT_CHECK_PID"`. It never runs the driver loop. A fault that keeps the substring but drops its effect stays green: `|| true`, removing `row_ok=0`, inverting the `kill -0` guard, or placing the line in a comment. Its live plants call the CLI directly with the plant's own pid as session, so the driver's `kill -0 -- -PGID` gate is never exercised. No check covers run_gate_mode, extract_failed_labels or ledger_entry_is_open.

**Scenario.** An edit changes the line to `&& ! node .../verify-orcad-leak.mjs --session "$CURRENT_CHECK_PID" --label "$label" || true; then`. orcad-leak-self-test still passes, and every leaked orcad is stopped silently while its row stays PASS.

**Evidence.** scripts/verify-orcad-leak.mjs:36 `const LEG_CALL = 'scripts/verify-orcad-leak.mjs" --session "$CURRENT_CHECK_PID"';` and :92-94 `const wired = (text) => (text.includes(LEG_CALL) ? [] : [...])`. :113 `const cli = (sid) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--session', String(sid), ...])`, which bypasses the driver.

**Suggested fix.** Add a self-test that runs verify-platform.sh against a fixture registry (an env-selected CHECKS file) with a planted row that leaks an orcad-shaped child, one that prints SKIP, and one that fails under a closed and an open ledger entry. Require the summary lines and the exit status for each.

**Verifier (CONFIRMED, low).** verify-orcad-leak.mjs:36 defines LEG_CALL as a substring, and the self-test's `wired` check (:92-94) only tests driver.includes(LEG_CALL). Its only plant replaces the substring outright. An edit that keeps the substring but neutralises it (an appended `|| true`, a dropped `row_ok=0`, an inverted guard, or the line moved into a comment) stays green. The live plants call the CLI directly (`cli(sid)` spawnSync with --session), so the driver's kill -0 gate and the row_ok handling are never exercised. A grep of scripts/ finds no other test of run_gate_mode, extract_failed_labels or ledger_entry_is_open; verify-release-shape.mjs:519 only mentions the list format. This is a test-coverage gap. *Checked at:* scripts/verify-orcad-leak.mjs:36,92-94,113; no other script references run_gate_mode/extract_failed_labels/ledger_entry_is_open

## harness-driver-07: Survivors of a row's process group other than orcad are neither failed nor stopped

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-platform.sh:6991`

**What is wrong.** When `kill -0 -- -PGID` shows that something of the row outlived it, the driver runs only the orcad leg. Any other survivor (a PowerBrowser, a Theia sidecar, a stub agent, an HTTP fixture server) is left running, the row is PASS, and CURRENT_CHECK_PID is cleared right away, so cleanup() on EXIT never signals that group. Survivors accumulate across a multi-hour gate and can hold ports or profile locks that later rows meet.

**Scenario.** A node live row whose withFirefoxPage teardown is skipped by a thrown error leaves its PowerBrowser and sidecar alive in its group. The leak leg finds no orcad argv and exits 0. The row is PASS, and the browser keeps running after the gate ends.

**Evidence.** scripts/verify-platform.sh:6981-6991 `if kill -0 -- "-$CURRENT_CHECK_PID" 2>/dev/null && ! node "$REPO_ROOT/scripts/verify-orcad-leak.mjs" ...; then row_ok=0; fi ... CURRENT_CHECK_PID=""`; verify-orcad-leak.mjs:68-74 signals only `leaksIn(sid, procs, entry)`.

**Suggested fix.** After the leak leg, send SIGTERM and then SIGKILL to the row's process group (`kill -- -$PGID`). Report the survivors' argv as a row note, or as a FAIL under --gate.

**Verifier (CONFIRMED, low).** At verify-platform.sh:6979-6990, when `kill -0 -- -PGID` succeeds, the only action is verify-orcad-leak.mjs, and leaksIn (:47-49) signals only processes whose argv names the orcad entry. Any other survivor of the row's group is left alone. The self-test explicitly requires a non-orcad bystander to be left running (verify-orcad-leak.mjs 'live: the non-orcad survivor is left running'). row_ok stays 1 and CURRENT_CHECK_PID is cleared at :6990, so cleanup() never signals that group. The stated trigger, a withFirefoxPage teardown skipped by a throw, is speculative because that helper uses finally, but the driver behaviour is as described. This is harness hardening. *Checked at:* scripts/verify-platform.sh:6979-6990; scripts/verify-orcad-leak.mjs:47-49,68-74 and the bystander check in selfTest

## harness-live-tabs-14: The documented live lock is never taken by the rows or the driver

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-platform.sh:6840`

**What is wrong.** Every live row's header says to run under flock on .git/pb-live.lock with ORCA_* unset, but neither the scripts nor the registry rows take the lock (no flock in the registry). Two sessions on the same machine (the project runs concurrent Claude sessions) can run live rows at once, and a leaked orcad on a shared port masked a real defect once (WINDOWS 62). ORCA_* scrubbing is done by the scripts, the lock is not.

**Scenario.** Two gate runs overlap; one session's orcad or port is reaped or contended by the other, producing a false red or a masked result.

**Preconditions.** concurrent live runs

**Evidence.** scripts/verify-platform.sh:6840 `"orca-tabs-live|node $REPO_ROOT/scripts/verify-orca-tabs-live.mjs"` (no flock); scripts/verify-orca-tabs-live.mjs:102-103 documents `flock ... pb-live.lock node ...`.

**Suggested fix.** Have the live rows (or the driver for live-tier rows) take the pb-live.lock themselves.

**Verifier (CONFIRMED, low).** CONFIRMED: the registry rows and the scripts take no lock. verify-orca-tabs-live.mjs:103 and the verify-platform.sh comments only document running under flock, so the lock is a manual convention. The driver does not enforce it. Concurrent runs by two sessions are a real scenario given the project's concurrent-sessions note. The result would be flaky or masked results, not a security issue. *Checked at:* scripts/verify-platform.sh:6763-6906 (comments only, no flock call); scripts/verify-orca-tabs-live.mjs:102-103

## harness-static-browser-06: Every named SKIP in these rows exits 0 and is recorded as PASS (complete list)

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-platform.sh:6985`

**What is wrong.** The driver has no SKIP state: a script row passes on exit 0. Every SKIP path in the assigned scripts exits 0. orca-browser-tab-scope: page-table clause SKIP when orca-browser-dispatch.ts is absent (:1134) and LoginManager-group clause SKIP without upstream/ (:1181). orca-browser-abilities, orca-browser-tools and orca-browser-entry-points, main and --self-test: SKIP when theia/node_modules/typescript is absent (abilities :268/:368, tools :222/:238, entry-points :421/:617). orca-browser-host-bundle: SKIP of both the static clauses and the attach probe when the bundle, orcad or the CLI is absent (:528-531). orca-agent-hooks: SKIP of the live stages and static clauses when orcad, the CLI or the launcher lib is absent (:658-661). orca-claude-sdk: loader-scenario SKIP without orca/, without the applied overlay or without esbuild (:291-294, :448-450), --built SKIP without out/orcad (:311), self-test SKIP without esbuild (:344-346). orca-hidden-electron: SKIP without a built orca/ (:218) and permanently on any host where an installed Orca exists at /usr/local/bin, /usr/bin or /opt/Orca (:225).

**Scenario.** On a developer host with Orca installed at /usr/bin/orca-ide, the full gate prints `orca-hidden-electron: SKIP -- an installed Orca exists` on every run and the summary records `orca-hidden-electron: PASS`. RUN-04 (no hidden Electron) has then never been proven on that host, yet the gate reads green. This is the same pattern as the known orca-agent-status-live case.

**Evidence.** scripts/verify-platform.sh:6977-6987 `wait "$CURRENT_CHECK_PID" || row_ok=0 ... if [ "$row_ok" -eq 1 ]; then SUMMARY+=("$label: PASS")`. scripts/verify-orca-hidden-electron.mjs:225 `if (installed.length) return { skip: ... }` -> :366 `console.log(`${NAME}: SKIP -- ${r.skip}`)` with code 0.

**Suggested fix.** Give SKIP its own exit code (for example 77) across these scripts. Have the driver record it as SKIP in the summary and fail --gate for any SKIP not on the WINDOWS.md known-open list. Delete the page-table SKIP branch now that lane p66-02 is merged.

**Verifier (CONFIRMED, low).** The driver's script-row branch (verify-platform.sh:6977-6987) sets PASS on exit 0. The file has no SKIP handling: every SKIP occurrence is in comments. I spot-checked the listed SKIP paths and each returns or exits 0. They are orca-hidden-electron :218 and :225 with main :366; tab-scope pageTableClause :1134 and loginManagerClause :1181; tools :222 and :238; agent-hooks :658-661; claude-sdk :291-294, :311, :344-346 and :448-450; host-bundle :528-531; entry-points :421 and :617; abilities :268. The hidden-electron installed-Orca probe filters out home paths and skips whenever an absolute orca-ide path derived from orcad-browser-provider.ts exists, so the row is a permanent PASS on such a host. DECISIONS.md D-60 accepts SKIP-counted-as-PASS only for orca-agent-status-live. That is a narrow owner ruling and does not refute the general pattern. *Checked at:* scripts/verify-platform.sh:6977-6987; scripts/verify-orca-hidden-electron.mjs:218-225,366; .planning/workstreams/orca/DECISIONS.md:518 (D-60, scoped to one row)

