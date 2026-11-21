# Result: G5a-ci-release

Branch: worktree-agent-a4248cceff60dccb9   Base: 0f9f2735401a08132a479c95c09c53f03015fa19   Final: 047d34c9 (last fix commit; this record is committed on top of it)

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| ci-supply-chain-04 | fixed | 11214c24, 070ff48f, 4d521260 | scripts/verify-ci-release-integrity.mjs::artifact-digest; scripts/release-train.mjs --self-test::plant (ci-supply-chain-04) and plant (ci-supply-chain-04 review) | renovate-licensing exports notices-sha256 and the publish job refuses other bytes; rebase-orca-notices bound the same way; the maintenance state is used only when it agrees with the pinned body, and a carried red only with the body's carried-red marker |
| 68-CR-03 | fixed | a7ebb381, 30d71e7b | scripts/verify-ci-release-integrity.mjs::mode-carry | macOS thin jobs upload tree.tar + BUILD_ROOT; universal job and package-macos.sh unpack with tar -xpf after admission (edits package-macos.sh, a G5b file) |
| ci-supply-chain-01 | fixed | 11214c24, 070ff48f | scripts/verify-ci-release-integrity.mjs::artifact-digest | build-linux, build-windows, descriptor-windows export SHA256SUMS digests for every artifact a credential-holding job downloads (release-linux, -identity, -manifest; release-windows, -identity, -manifest); each consumer admits right after the download |
| ci-supply-chain-02 | fixed | 047d34c9 | scripts/verify-ci-release-integrity.mjs::orca-off-legion | new hosted linux-orca job builds Orca; build-linux admits its tar by digest; release-shape goes red by design (below); the orca-packaged-tree TS import on legion is a handoff |
| 68-CR-02 | fixed | 359be0ef | scripts/verify-win-spawn.mjs | npm ci / npm pack run npm-cli.js under process.execPath on win32; POSIX unchanged. Not exercisable on this host |
| 68-CR-01 | fixed | 71cad425 | scripts/rebase-orca.sh --self-test::XPI cache not staged, XPI stage fails | new xpi cache stage runs stage-bundled-xpi.sh before the rows; the SKIP exemption is not widened |
| 64-WR-05 | fixed | df927e35 | scripts/verify-orca-build-scripts.mjs::eval of a command substitution | capture then eval |
| 60-WR-01 | fixed | df927e35 | scripts/verify-orca-build-scripts.mjs::fetch without env -u, pins sourced after the build | pin read once before the fetch, fetch under env -u TAG -u COMMIT, PASS line reports it |
| 60-WR-03 | fixed | df927e35 | scripts/verify-orca-build-scripts.mjs::scrub after the fetch | scrub moved before step 1 |
| 68-WR-03 | fixed | 9fbd9138 | scripts/export-orca-seam-pr.mjs --self-test::template-from-main | template and Test command read from the main clone; fixture's pinned tree is stale |
| 68-WR-01 | fixed | 8f3969c0 | scripts/win-sign-list.mjs --self-test::same-name PE with other bytes, absent .node PE, SUMS without --orca-dir | --orca-dir windows-orca; PE set classified from the admitted copy, hash equality required. Not exercisable on this host |
| ci-supply-chain-06 | fixed | 60e0b2d9 | scripts/verify-ci-release-integrity.mjs::stage-line; scripts/rebase-orca.sh --self-test::forged stage line | rebase-orca.sh writes its own FAIL line to --stage-file; stage step and report job cut it to 300 chars of a backtick-free set |
| ci-supply-chain-03 | fixed | 51f37d62 | scripts/verify-ci-release-integrity.mjs::orca-automerge | PR body says the green replay is a compatibility signal and carries the compare link; auto-merge withheld when any *-lock.yaml moved in the pin range |

## Registry requests
- scripts/verify-orca-build-scripts.mjs: quick, `"orca-build-scripts|node $REPO_ROOT/scripts/verify-orca-build-scripts.mjs"` and `"orca-build-scripts-self-test|node $REPO_ROOT/scripts/verify-orca-build-scripts.mjs --self-test"`
- scripts/verify-ci-release-integrity.mjs: quick, `"ci-release-integrity|node $REPO_ROOT/scripts/verify-ci-release-integrity.mjs"` and `"ci-release-integrity-self-test|node $REPO_ROOT/scripts/verify-ci-release-integrity.mjs --self-test"`
- scripts/verify-win-spawn.mjs: quick, `"win-spawn|node $REPO_ROOT/scripts/verify-win-spawn.mjs"` and `"win-spawn-self-test|node $REPO_ROOT/scripts/verify-win-spawn.mjs --self-test"`

## Red by design
- release-shape (and release-shape-self-test, whose baseline is then red): ci-supply-chain-02 moves Orca's build off legion, so build-linux has no step running scripts/build-orca.sh, and the new admission step's check-win-sidecar.sh call is the first powerbrowser/packaging/*.sh step, which the row takes as the packaging step. verify-release-shape.mjs is ledger-locked; the rule change it needs is under Needs owner.
- scan-brand-residue: the held-back coincidental rows reconcile by exact count, and this lane adds two files that name Orca and edits others. Integration must re-measure with the scanner's own matcher on the merged tree. Measured on this branch: "Orca" 3281 -> 3309, "orca" 5679 -> 5790, "ORCA" 1270 -> 1290, "orcad" 1786 -> 1801, "makeOrca" 6 -> 9; add scripts/verify-ci-release-integrity.mjs and scripts/verify-orca-build-scripts.mjs to the only_in lists of the "orca", "Orca" and "ORCA" rows in inventory/brand-tokens.json (not a lane-owned file; other lanes move the same counts).

## Handoffs
- G5b-packaging-docs: docs/RELEASING.md "Orca re-pin (OVL-02)" stage table, add a row for the new `xpi cache` stage (stage-bundled-xpi.sh failed: a changed AMO download needs a re-pin of powerbrowser/packaging/bundled-xpi.json), for 68-CR-01.
- G5b-packaging-docs: docs/RELEASING.md and docs/BUILD.md, say Orca for Linux is built by the hosted linux-orca job and admitted on legion by digest (no Orca build code runs on legion's host), for ci-supply-chain-02; and that the macOS and Linux Orca artifacts are tree.tar + BUILD_ROOT, for 68-CR-03.
- owner of scripts/lib/orca-artifacts.mjs: replace the dynamic import() of orca/src/shared/*.ts (importTs, :55) with a parse that does not execute the module, so the orca-packaged-tree row on legion no longer runs Orca code on the host, for ci-supply-chain-02.
- owner of scripts/verify-orca-packaged-tree.mjs: add the 68-CR-03 clause for the macOS and Linux targets: every Mach-O/ELF executable in the stage (not .node, not .dylib/.so) is mode 0755, for 68-CR-03.

## Behaviour changes
- ci-supply-chain-02 (D-26): the Linux release now waits on a GitHub-hosted job (linux-orca, about 90 minutes) and builds Orca there instead of on legion; a hosted-runner outage now stops the Linux release. Revert with 047d34c9.
- ci-supply-chain-03 (D-26): a green Orca re-pin no longer arms auto-merge when any *-lock.yaml changed between the old and new pin (most upstream releases), and its PR body now carries the compare link and says the replay is not a review of upstream. Revert with 51f37d62.
- ci-supply-chain-04: the maintenance issue body gains a `<!-- release-train:maintenance-carried-red [...] -->` line on a no-data day that carries a red; a stored state that disagrees with the pinned body (including a carried red with no marker) is discarded, so a red row may be notified again. Revert with 4d521260 and the release-train.mjs half of 11214c24.
- ci-supply-chain-01: every release run's descriptor, channel-live, sign and publish jobs refuse an artifact whose digest differs from its producer's job output (descriptor and channel-live now also need build-linux, descriptor-windows needs build-windows). Revert with 11214c24 and 070ff48f.
- 68-CR-01: the re-pin replay now downloads the pinned uBlock XPI (sha256-checked) on the runner. Revert with 71cad425.

## Needs owner
- ci-supply-chain-02: verify-release-shape.mjs (ledger-locked) rule 12, orca-steps. Proposed change: replace the one-build-orca.sh-step requirement with "build-linux needs linux-orca; a step after the Theia sidecar build and before the packaging step runs `check-win-sidecar.sh check linux-orca-artifact "$LINUX_ORCA_SUMS_SHA256"` with that env taken from needs.linux-orca.outputs.sums_sha256; no build-linux step runs scripts/build-orca.sh"; keep the rulings-guard ordering against that admission step; and in the packAt derivation (line 499) match `powerbrowser/packaging/package-linux.sh` rather than any powerbrowser/packaging/*.sh, so the admission tool is not taken for the packaging step. Update its self-test plants that anchor on "Build Orca from source at the pin" in build-linux.
- Windows and macOS items (68-CR-02, 68-CR-03, 68-WR-01, the Windows half of ci-supply-chain-01) are fixed but D-40 moved those builds to the next version and none can be exercised on this host; a first hosted run is owed.

## Quick gate
`nix develop .#theia --command bash scripts/verify-platform.sh --quick` at 047d34c9: 418 rows, 412 PASS, 6 FAIL, 0 SKIP (the base record has 419 rows at ad2f901a; this lane registers and removes no row).

- scan-brand-residue, scan-brand-residue-self-test: FAIL, caused by this lane, red by design (count re-measure at integration, above).
- orca-service, orca-service-self-test, live-scratch-home, live-scratch-home-self-test: FAIL during the full run, not caused by this lane. Their messages name content that is not in this branch (a scripts/verify-orcad-lifecycle.mjs, which does not exist here, and a TheiaService.sys.mjs that sets POWERBROWSER_ORCA_PORT; this lane edits neither file), so the tree they read changed under the run. Each passes when rerun alone with `--only` on 047d34c9, and `git status` is clean apart from this record.
- release-shape, release-shape-self-test: PASS during the full run but FAIL when rerun alone with `--only` on 047d34c9 (the expected orca-steps red from ci-supply-chain-02), so they read the same changing tree. Their real state on this branch is FAIL, red by design (Needs owner).
