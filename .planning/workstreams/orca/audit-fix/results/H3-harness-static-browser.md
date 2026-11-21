# Result: H3-harness-static-browser

Branch: worktree-agent-a4d378a590aea5194   Base: b5c4b182   Final: 8ac12f81 (code; this record is the commit after it)

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| harness-static-browser-01 | fixed | 73cb07ce | verify-orca-agent-hooks.mjs::static (process.env aliases), ::stage B decoys | The checker-bound alias tracking now flags `baseEnv.ORCA_USER_DATA_PATH`. Stage B's launcher inherits decoy identity values. Three source plants and three observation plants. The live row passed. |
| harness-static-browser-03 | fixed | c7f9489c | verify-orca-browser-abilities.mjs::localFailures; verify-orca-browser-entry-points.mjs::localClauses | The PowerBrowser-only clauses run without orca/. Without orca/ the rows exit 77, not PASS. The self-tests rerun the local plants with the fixture's orca/ removed. |
| harness-static-browser-02 | fixed | 2c799a6e | verify-orca-browser-tab-scope.mjs::pageWorkCallers | The page-work set is derived from the source and closed over references. Its entry points must equal {handleWebTabAgent} plus one ratified entry (webTabClose). Six plants. |
| harness-static-browser-04 | fixed | c7f9489c | verify-orca-browser-entry-points.mjs::deriveCreatorReasons | A reachable caller is green only while its creator's reason holds, and that reason is derived from the pin: createBrowserTab's gate, or the session creator's placement call. Three plants and a gated detector. |
| harness-static-browser-05 | fixed | 0c626c09 | verify-orca-browser-host-bundle.mjs::redactionVerdict, ::captureChild | The child probe's raw fds 1 and 2 are captured, and its secrets and the raw URL arrive on fd 3. The detector is proven on the raw URL first. The stale build-log term is removed. Four plants. The live row passed. |
| harness-static-browser-07 | fixed | 0c626c09 | verify-orca-browser-host-bundle.mjs::attachVerdict (survived teardown) | The orcad and daemon trees are recorded by start ticks before the stop. A survivor is killed by identity and fails the row. One plant. |
| harness-static-browser-09 | fixed | 2c799a6e | verify-orca-browser-tab-scope.mjs::visibilityReads | An AST walk catches every read form: ==, switch, bracket, getComputedStyle, getPropertyValue and destructuring. Six new plants. |
| harness-static-browser-08 | fixed | 7eebd0f2 | verify-orca-browser-tools.mjs::sourceFailures | The tool sources at the pin (50) must equal ORCA_TOOL_SOURCES' keys, each mapped to U-rows or marked internal. Six plants. Limit: a control added inside an existing module is not detected. |
| handover G1a (cookie site) | fixed | 58a0b480 | verify-orca-browser-tab-scope.mjs::runScenarios (cookies: site) | fakeBrowser gets currentURI. A cookie read or write for another site or a bare suffix is refused before the cookie service, and an httpOnly value is withheld. Two plants. |
| handover H1 (page-table SKIP) | fixed | 58a0b480 | verify-orca-browser-tab-scope.mjs::pageTableClause | The SKIP branch is deleted, so an absent dispatch module is red. Plant: 'the dispatch module absent'. |
| SKIP protocol (all 8 scripts) | fixed | 58a0b480, 73cb07ce, c7f9489c, 7eebd0f2, 0c626c09, 8ac12f81 | each script's SKIP path | Every script exits 77 with one `<name>: SKIP -- <reason>` line. Each self-test prints its own verdict last. I exercised each SKIP path in a scratch tree with no upstream/ or orca/. |

Also converted, beyond the items: two stale lane-waiting SKIPs are now red, following H1's page-table ruling. These are orca-browser-abilities clause (g), which waited for the tab-scope file, and the entry-points cross-lane clauses, which waited for the host link. The pin-dependent tab-scope self-test plants (D-37 download bit, D-38 tables) now run only with upstream/. Before this, without upstream/, those plants failed rather than being skipped.

## Registry requests
None.

## Red by design
- scan-brand-residue, scan-brand-residue-self-test: this row was already red on b5c4b182 in this worktree. With the base versions of the eight scripts the scan reports 4 reconciliation failures: Orca 3603/3617, orca 6123/6188, ORCA 1396/1398, orcad 2207/2220. This lane's edits add Orca +14, orca +32, ORCA +36, orcad +7 and stubOrca +2, all in files already listed in expected_files, and no token in a new file. Observed with this lane: Orca 3617, orca 6155, ORCA 1432, orcad 2214, stubOrca 8. Exact change: integration re-measures expected_count in `inventory/brand-tokens.json` for those five coincidental rows with the scanner after merging this lane together with G1b and the other lanes.
- orca-service, orca-service-self-test, shell-error-copy-no-internals, shell-error-copy-no-internals-self-test: red on the base by design. They are owned by H2 and H8, and this lane did not touch them.

## Handoffs
- Integration: re-run orca-browser-tab-scope, its self-test, orca-browser-abilities, orca-browser-entry-points and agent-tab-walls against G1b's `theia/extensions/orca-browser/**` and browser-host overlay changes. Three plant anchors are the most likely to drift: the webTabAgent case-arm text in handleWebTabAction, the agentDialogWindow line in webTabClose (the RATIFIED_PAGE_WORK entry), and `const wasVisible = overlayShownToUser(entry.browser);` in webTabGeometry.
- Optional, owner of `scripts/lib/orca-run.mjs`: stopOrcad could include the daemon's descendants in its own pid set, so other rows get what host-bundle now does locally. host-bundle does not need it.
- Callers: none needs a change. I grepped .github/workflows, scripts, .claude/hooks and docs for every converted script. The only references are function imports (makeWorld, sliceSource, run, freePort, ppidMap, startTicks, signalIdentity, deriveClaudeHookEvents, readAgentStatus), and none of them reads an exit status.

## Behaviour changes
None. Every change is to a check; no product file was edited.

## Needs owner
- harness-static-browser-02: RATIFIED_PAGE_WORK holds one entry: `PowerBrowserAPI.webTabClose` may reach `agentDialogWindow`, to cancel the page prompt of the tab being closed (66-06). The owner should confirm that this is the only sanctioned page work outside handleWebTabAgent.
- harness-static-browser-08: the U-row mapping of the 50 Orca tool sources in ORCA_TOOL_SOURCES is my classification. Examples are link-status-bubble on U-23 and toolbar-menu-dropdown on U-20 and U-22. The owner may want it reviewed against spike 005.

## Quick gate
`nix develop .#theia --command scripts/verify-platform.sh --quick`: 6 rows FAIL, 0 SKIP, the rest PASS.
- orca-service, orca-service-self-test: red by design on the base (H2).
- shell-error-copy-no-internals, shell-error-copy-no-internals-self-test: red by design on the base (H8).
- scan-brand-residue, scan-brand-residue-self-test: already red on the base in this worktree, and this lane adds token deltas. See Red by design.
- orca-browser-tab-scope and its self-test: red on the base, PASS now (79 plants).
- I ran two full-tier rows under the live lock, outside the quick gate: orca-agent-hooks PASS (stage B with decoys) and orca-browser-host-bundle PASS (raw-output redaction, no survivors).
