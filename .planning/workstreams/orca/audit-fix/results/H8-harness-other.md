# Result: H8-harness-other

Branch: worktree-agent-ae66c6a97874bfca3   Base: b5c4b182   Final: 3347b903 (the last code commit; this record is committed after it)

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| harness-other-03 | fixed | ae997cbf, 3347b903 | verify-workflows::orca-repin (6 new plants, 1 new control) | Bump and detect jobs are found by what they do (mints an App token and names Orca; names fetch-orca.sh or --orca-select). With scripts/fetch-orca.sh in the tree, none found is red. The no-Orca-code scan now covers every token-minting job of release-train.yml. |
| 61-WR-01 | fixed | ffdc91cc | orca-browser-parity --self-test (bad-header, duplicate-row, bad-disposition, short-row, moved-methods-dir, empty-rpc, empty-members, no-cli-names) | 33 checks now (was 9 plants). |
| 61-WR-02 | fixed | ffdc91cc | orca-browser-parity --self-test::overlay-root-is-an-input | `deriveAll` and `check` take the overlay root (default unchanged, so verify-orca-browser-abilities is untouched); the self-test builds its own overlay and reads nothing of the live repository. |
| 61-WR-03 | fixed | ffdc91cc | orca-browser-parity --self-test (13 test-support forms stay ignored, 2 product-name plants still derived) | NOT_SOURCE and NOT_SOURCE_DIR as the review proposed; the derived counts on the real pin are unchanged (92 abilities). |
| harness-other-08 | fixed | 90a74efa | check-internals-boundary --self-test (control, swapped-contract, swapped-interface, dynamic-contract, extra-interface, catalogued Services. line, plus the same four through --catalogue) | Red on the real tree until the catalogue rows name their contracts: see Red by design. |
| harness-other-11 | fixed | 1fec10f8 | gen-orca-snapshot-fixtures --self-test (new) | Allowlisted child environment, scratch HOME/XDG/TMPDIR/cwd removed afterwards. The live run (Chromium, agent-browser) was not run. |
| harness-other-05 | fixed | a2deed7b | verify-bundled-xpi --self-test (3 entry-point verdicts), verify-bundled-extensions --self-test (--seed entry point), verify-licence-allowlist --self-test (verdict) | The three checks exit 77 with one SKIP line when a leg did not run; FAIL wins. Staging the XPI in verify.yml so CI runs the legs is not done (see Handoffs). |
| harness-other-09 | fixed | 9c9b511c | verify-package-target-natives --self-test (positive control at uninstall/helper.exe, five i386 negatives) | Exemption is the path upstream's package-manifest.in gives the NSIS uninstaller. |
| harness-other-04 | needs-owner | c5988012 (Windows half) | verify-build-windows-shape --self-test (5 plants: removed, moved after build, continue-on-error, `|| true`, changed `if:`) | Windows half fixed. The Linux half (fail-open on the --rulings step) is in verify-release-shape.mjs, ledger-locked: diff under Needs owner. |
| harness-other-06 | fixed | 82723b54 | verify-shell-error-copy::Orca scope (FAIL when failure/ is absent while orca-panes exists); self-test asserts both answers | A tree without orca-panes is SKIP, exit 77. Verified by moving the directory in the worktree and moving it back. |
| harness-other-01 | fixed | 2fb52ca6 | verify-web-tab-bridge --self-test (orca-panes sender, modes agentStop caller) | Fences read every theia/extensions/*/src (tests excluded), 135 sources; no false positive on the real tree. |
| harness-other-07 | fixed | 2fb52ca6 | verify-web-tab-bridge --self-test::orca-browser/src is gone | Skip removed; red naming the owner file. |

Handover from G3b and G1a (commit 82723b54):
- The two expectation lists stay hand-kept. They are the review gate for a deliberate copy change; the check already derives the actual copy from the tree, and a list derived from the same sources could only agree with it.
- Admitted: the G3b rename notice (EXPECTED_MODES_COPY) and the eight G1a agent strings (EXPECTED_NAV_COPY), the two old agent strings removed. None leaks an identifier (the leak rules pass); the nav strings use the interpolated name; the four "Select X to" sentences name Stop and Resume, which the widget renders (chrome-bar-widget.tsx:1704-1712).
- New derived rule: every "Select <X> to ..." sentence in CHROME_BAR_COPY must name a label the same object defines (plants: Continue, and a reworded Stop label).
- Judgement call to review: the rename notice ("PowerBrowser now has its own "X" mode, so your "X" mode is now called "X (custom)".") carries no next step. I admitted it because it reports a completed change and is a notice, not an error; if the owner wants a next step, lane G3b must reword it and the list entry changes with it.

## Registry requests
- gen-orca-snapshot-fixtures-self-test: quick, `"gen-orca-snapshot-fixtures-self-test|node $REPO_ROOT/scripts/gen-orca-snapshot-fixtures.mjs --self-test"`, next to the `orca-snapshot-fixtures` row.
- Comment only, scripts/verify-platform.sh around 3872-3874 and 3869-3870: orca-browser-parity's self-test now runs 33 checks (20 plants, 13 test-support controls) and no longer reads the live repository; update the plant count and drop "hermetic" caveats (lane H1 owns the file).

## Red by design
- internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines, site-identity, site-identity-self-test: the new rule needs each actor-child `Cc[`/`Ci.` catalogue row to name the contract ID and interface on its line. Exact change, in powerbrowser/INTERNAL-APIS.md (owner: the group owning powerbrowser/, or integration), first cell only; I applied it in the worktree, confirmed all five rows green, then reverted it:
  - row `GroupActorChild.sys.mjs:294`: `` `Cc["@mozilla.org/text-input-processor;1"]` / `Ci.nsITextInputProcessor` ``
  - row `GroupActorChild.sys.mjs:675`: `` `Cc["@mozilla.org/consoleAPI-storage;1"]` / `Ci.nsIConsoleAPIStorage` ``
  - row `GroupActorChild.sys.mjs:676`: `` `Cc["@mozilla.org/systemprincipal;1"]` / `Ci.nsIPrincipal` ``
  Rows move with their lines if GroupActorChild.sys.mjs changes first.
- scan-brand-residue, scan-brand-residue-self-test: red on the base by design (counts moved by earlier lanes). My edits add Orca tokens to scripts already counted; integration must recount all four coincidental rows (Orca, orca, ORCA, orcad) after all lanes merge. I removed the one unclaimed hit I introduced (condition 4, verify-workflows.mjs).
- orca-service, orca-browser-tab-scope and their self-tests: red by design on the base (lanes H2, H3), unchanged by me.

## Handoffs
- G5a (.github/workflows/verify.yml): for harness-other-05, stage the sha256-pinned XPI (bash powerbrowser/packaging/stage-bundled-xpi.sh) and fetch Orca before `--quick`, so the XPI, endpoint and Orca lock/licence legs run in CI instead of skipping. Until then they show as SKIP in the --quick summary.
- Callers of the converted scripts (grep of .github/workflows, scripts, .claude/hooks, docs): the only direct callers are release.yml:160 and :627, which run `verify-licence-allowlist.mjs --rulings`. That mode has no skip path (exit 0 or 1), so no call site sees 77 and no change is needed. All other references are rows run through the gate driver or prose.
- H1: scripts/verify-platform.sh comment counts, as under Registry requests.

## Behaviour changes
None.

## Needs owner
- harness-other-04 (Linux half): scripts/verify-release-shape.mjs is ledger-locked. Proposed diff (tested on a scratch copy: check PASS, self-test PASS with 79 workflow faults):
  - after the `if (orcaAt.length !== 1) { ... } else { ... }` block (line 567), before the `if (packAt >= 0 && !/podman run ...` check, add:
    ```
    for (const f of rulingsAt.length > 0 ? failOpenFaults(buildSteps[rulingsAt[0]], KEY_IF) : []) {
        fail(BUILD_JOB, 'orca-steps', `licence-rulings step ${f}, so a pending ruling cannot stop the build (P68-21). Next step: remove it.`);
    }
    ```
  - before the existing `['rulings guard removed', ...]` plant (line 726), add:
    ```
    ['rulings guard with continue-on-error', edit('nix develop .#theia --command node scripts/verify-licence-allowlist.mjs --rulings', 'nix develop .#theia --command node scripts/verify-licence-allowlist.mjs --rulings || true'), 'orca-steps', '|| true'],
    ```

## Quick gate
Run inside `nix develop .#theia`: 434 PASS, 11 FAIL, no SKIP row reached the summary, against 419 PASS on the base. Failing rows: scan-brand-residue(+self-test) and the five internals rows (all under Red by design), orca-service and orca-browser-tab-scope with their self-tests (not mine). shell-error-copy-no-internals and its self-test, red on the base by design, are now PASS. Rows I touched that run in --quick (workflows, orca-browser-parity-self-test, licence-allowlist(+st), bundled-extensions(+seed, +st), bundled-xpi(+st), package-target-natives-self-test, build-windows-shape(+st), web-tab-bridge, shell-error-copy) are PASS. The count of 11 FAIL was taken before the 3347b903 tweak; that tweak only removes one scan-brand-residue condition-4 line.
