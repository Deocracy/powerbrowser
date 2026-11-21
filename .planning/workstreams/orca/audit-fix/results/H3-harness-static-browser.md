# Result: H3-harness-static-browser

Branch: worktree-agent-a4d378a590aea5194   Base: b5c4b182 (round 1), f8d798e4 (round 2), 10b970e1 (round 3), each a fast-forward   Final: 94803c8d (code; this record is the commit after it)

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| harness-static-browser-01 | fixed | 73cb07ce, ecf032a4 | verify-orca-agent-hooks.mjs::staticVerdict (processEnvReads); ::wrapperVerdict (stage B decoys) | The static clause is bound with the TypeScript checker and follows every env route the review named: baseEnv defaults, consts, spreads, Object.assign, call arguments, imports from node:process (default, namespace and named env), process destructuring (declaration and assignment), element access, Reflect.get, a local function returning the env, and an object property holding it. 11 source plants in the quick self-test, so the static half stands alone. Stage B (full tier) also plants decoy identity values. |
| harness-static-browser-03 | fixed | c7f9489c | verify-orca-browser-abilities.mjs::localFailures; verify-orca-browser-entry-points.mjs::localClauses | Unchanged in round 2. The PowerBrowser-only clauses run without orca/; without it the rows exit 77. |
| harness-static-browser-02 | fixed | 2c799a6e, da996f80 | verify-orca-browser-tab-scope.mjs::pageWorkCallers, ::childRunCallers | Round 2 gaps, now closed:<br>- getExistingActor, and literal, template and alias forms of the agent names.<br>- Section classes are seeded; one doing page work is red.<br>- Outside the section, page-work primitives must equal OUTSIDE_PAGE_WORK (16 contexts) and agent-name references must equal RATIFIED_AGENT_NAMES (webTabOpen), both as set equality.<br>- AGENT_RUN may be referenced only from PowerBrowserAgentChild.receiveMessage.<br>- webTabClose may only run `agentDialogWindow(entry)?.document.getElementById("commonDialog")?.cancelDialog();` on the entry it closes.<br>Plants: inline drawSnapshot, getExistingActor, template, alias, actor class, child dispatch, close accept/read/other tab. Not derived: see below. |
| harness-static-browser-04 | fixed | c7f9489c, 658bf6ab | verify-orca-browser-entry-points.mjs::judgeCaller, ::deriveCreateGate | Each reachable call is now judged on its own options. A createBrowserTab call is refused only when no runtime environment id can reach the gate; the gate must return unless paired and throw without that id. A session call arrives as createPage only without a server placement. 9 reachable callers cannot be proven statically (spreads, variable ids) and are ratified as set equality (store row only, clause 1). Plants: runtime id, spread, server placement, unrelated throw, inverted paired test, stale ratification. |
| harness-static-browser-05 | fixed | 0c626c09 | verify-orca-browser-host-bundle.mjs::redactionVerdict, ::captureChild | Unchanged in round 2 apart from fd 4 (extra 8). |
| harness-static-browser-07 | fixed | 0c626c09, 51b09480 | verify-orca-browser-host-bundle.mjs::stopAndSweep, ::attachVerdict | Record, stop and sweep are now one function. The self-test runs it on a detached stand-in that ignores SIGTERM and requires one survivor that is killed and gone. An empty record is a blind-instrument FAIL. |
| harness-static-browser-09 | fixed | 2c799a6e, da996f80 | verify-orca-browser-tab-scope.mjs::visibilityReads | Counts every non-assignment `visibility` member read whatever its object, every getPropertyValue("visibility") call, and every destructured `visibility` key, nested or not. New plants: a style alias, a computed-style alias, nested destructuring. |
| harness-static-browser-08 | fixed | 7eebd0f2, 48354eb1 | verify-orca-browser-tools.mjs::toolSources, ::sourceFailures | The derived set now includes non-test .ts modules and assemble-chrome subdirectories (103 sources, classified). Coverage is checked both ways: every U-row is carried by a source or is in UNSOURCED_ROWS (empty today). Plants: a .ts prompt module, a chrome subdirectory, a row losing its source, a stale unsourced row. Limit: the classification is hand-kept; the check proves it complete and consistent with the table, not correct. A control added inside an existing module is not detected. |
| handover G1a (cookie site and httpOnly) | fixed | 58a0b480, da996f80, 94803c8d | verify-orca-browser-tab-scope.mjs::runScenarios (cookies) | Round 3 asserts G1a's narrowed cookie.set rule as the product implements it.<br>- Detector: a plain host-only cookie on the current host at "/" writes exactly once, at "/", without httpOnly.<br>- 12 refusals, each with zero writes: another host, a subdomain, a sibling host, a parent domain attribute, a path other than "/", httpOnly true, a `__Host-` name, a `__Secure-` name, Secure on http, SameSite None without Secure, a name held as httpOnly, and one held as httpOnly in the partitioned jar.<br>- The fake jar now models origin attributes. getCookiesFromHost matches them exactly; getCookiesWithOriginAttributes matches only the fields its pattern names.<br>- Deleting an httpOnly name is refused in either jar; deleting the plain cookie writes.<br>One re-allowing plant per refusal (12). |
| handover H1 (page-table SKIP) | fixed | 58a0b480 | verify-orca-browser-tab-scope.mjs::pageTableClause | Unchanged. |
| review extra 8 (killed probe leak) | fixed | 51b09480 | verify-orca-browser-host-bundle.mjs::captureChild (fd 4), ::sweepIdentities | The probe names orcad's and the daemon's identities on fd 4 once orcad is ready. When the probe ends, or the row is signalled, the parent ends survivors by identity and fails the row. Self-test: a probe killed at its time limit leaves a detached process, which the parent ends. Not covered: a SIGKILL of the row itself. |
| review extra 9 (last FAIL line) | fixed | da996f80 | tab-scope --self-test | The tab-scope self-test prints its own FAIL line last. The other self-tests already did. |
| review extra 10 (pane inputs) | fixed | 658bf6ab | verify-orca-browser-entry-points.mjs::derivePaneInputs | Clause 1 walks from every rollupOptions.input of vite.pb-panes.config.ts, and pb-pane-mount.tsx must be one of them. Plant: a second input mounting BrowserPane. |
| H8 handoff 61-WR-02 | fixed | 99583f0a | no-check: no fixture verdict depends on an overlay-shadowed name | deriveAll gets `join(root, 'orca-overlay/files')`, and the fixture has an empty pb-browser-host.ts there. I used the tree's own overlay path rather than `<root>/overlay`, so the real tree's path is unchanged. |
| SKIP protocol (all 8 scripts) | fixed | 58a0b480, 73cb07ce, c7f9489c, 7eebd0f2, 0c626c09, 8ac12f81 | each script's SKIP path | Unchanged. Re-checked against the updated SKIP-PROTOCOL.md: SKIP lines go to stdout, names are in the allowed set, and every self-test prints its own verdict last. |

Not derived by harness-static-browser-02, by design or as a limit:
- Navigation calls outside the section; frontend arms navigate user tabs by design.
- Page work that is none of the listed primitives, such as a contentWindow or document read through a browsing context.
- The child's row helpers (agentPress and the like) called from another child actor without going through AGENT_RUN.
- Reads of an entry's agent flag. G1a's verify-agent-tab-walls covers those.

The hand-kept sets OUTSIDE_PAGE_WORK, RATIFIED_AGENT_NAMES, RATIFIED_PAGE_WORK, RATIFIED_UNPROVEN_CALLERS and ORCA_TOOL_SOURCES are each compared with a derived set as set equality. They go red on an addition and on a removal, but their contents are my classification.

## Registry requests
None.

## Red by design
- scan-brand-residue, scan-brand-residue-self-test: green on f8d798e4. I checked this by running the scan with f8d798e4's versions of the six changed scripts. This round's edits add Orca +9 (observed 3902, expected 3893), orca +19 (6705/6686), ORCA +17 (1523/1506) and orcad +7 (2573/2566). All of them are in files already listed in expected_files. Exact change: integration re-measures expected_count for those four coincidental rows in `inventory/brand-tokens.json` with the scanner after merging.

## Handoffs
- Integration: the plant anchors most likely to drift on a product change are:
  - the webTabAgent case arm and `async function handleWebTabAction(`;
  - the agentDialogWindow line in webTabClose;
  - `const wasVisible = overlayShownToUser(entry.browser);`;
  - the cookie-set and cookie-delete httpOnly guards;
  - `export class PowerBrowserAgentParent extends GroupActorBase {}`;
  - PowerBrowserGroupChild's first `receiveMessage(message) {`.

  OUTSIDE_PAGE_WORK and RATIFIED_AGENT_NAMES name product contexts. A product lane adding drawing, printing, cookie or window-mediator work outside the agent section must add its context there.
- Optional, owner of `scripts/lib/orca-run.mjs`: stopOrcad could include the daemon's descendants. host-bundle does this itself now.
- Callers: none needs a change. This was re-checked; the only references to these scripts are function imports.

## Behaviour changes
None. Every change is to a check; no product file was edited.

## Needs owner
- harness-static-browser-02: RATIFIED_PAGE_WORK holds one entry: webTabClose cancels the closing tab's prompt. RATIFIED_AGENT_NAMES holds one: webTabOpen uses agentContainerId and AGENT_MESSAGE_MANAGER_GROUP. OUTSIDE_PAGE_WORK lists 16 user-tab feature contexts. The owner should confirm these are the sanctioned sets.
- harness-static-browser-04: RATIFIED_UNPROVEN_CALLERS ratifies 9 reachable creator callers. Their options cannot be proven refused statically; they are accepted because clause 1 holds. The owner should confirm that store-row-only is an acceptable outcome for them.
- harness-static-browser-08: the U-row classification of the 103 Orca tool sources is mine. The owner may want it reviewed against spike 005.

## Quick gate
Round 3 log: `H3-quick-r3.log` at the worktree root, untracked. Result: 4 rows FAIL, 0 SKIP, 451 PASS. The brand scan, orca-browser-tab-scope and its self-test, and agent-tab-walls all pass. None of the four reds reads a file this lane changed in round 3:
- orca-service-self-test: 1 of 53 plants did not go red. This check is H2's / product's.
- orca-failure-classes, orca-failure-classes-self-test: not mine, the same cause as in round 2. The provisioned orca/ pin has orcad start-refusal codes that ORCA_CODE_CLASSES does not map; its self-test reports 4 of 16 plants.
- build-windows-shape-self-test: not mine; this lane did not touch it.

Round 2 (below) is kept for the record.

Log: `H3-quick.log` at the worktree root, untracked. Result: `nix develop .#theia --command scripts/verify-platform.sh --quick` reports 3 rows FAIL, 0 SKIP, and 444 PASS.
- scan-brand-residue, scan-brand-residue-self-test: red by design (token counts, above).
- orca-failure-classes: not caused by this lane. It reports eight orcad start-refusal codes in the pinned orca/ (OrcadBindAddressError, OrcadInstanceLockError, ProfileStateAccessError) with no class in ORCA_CODE_CLASSES. This lane touched neither OrcaService nor the check. The orca/ tree is the provisioned copy from the integration worktree, so its pin is likely ahead of the class table on this branch.
- Rule point: in round 1 I ran two full-tier rows that start a real scratch orcad, orca-agent-hooks and orca-browser-host-bundle, under the live lock. Those runs were outside the lane rules and must not be counted as lane evidence. In round 2 I ran neither. The round-2 main-mode changes to host-bundle (fd 4 identities, sweep on probe exit and signal) and agent-hooks are therefore exercised only through their quick self-tests, not end to end.
