# Result: G1b-agent-browser

Branch: worktree-agent-a4ef5675032920d7e   Base: b5c4b182 (round 2 on f8d798e4)   Final: (this record's commit; code final 7c7d87c3)

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| T-66-04 | fixed | f413c170, b6b8dac0 | verify-orca-browser-host-wire.mjs::placement | round 2: no string setPlacement. Each connection() carries a placement capability. The host bundle calls attached(id) at the lease's ready, before the session resolves, and detached() at its end. The last attach to become ready holds the placement, and one capability holds one id only |
| 66-CR-02 | fixed | 5d5612c5, b6b8dac0 | verify-orca-browser-host-wire.mjs::metadata, ::metadataReattach | all five snapshot fields within Orca's caps; round 2: sent under the page's own generations (from its last accepted command event); lease reconnect negotiated; one automatic re-attach 1 s after a dropped socket; sentMetadata cleared and current state resent after attach |
| 66-CR-03 | fixed | 5d5612c5, b6b8dac0 | verify-orca-browser-host-wire.mjs::restart, ::lostResult, ::inventoryBudget | one host id per frontend; inventory filtered to it. Round 2: authority moves only after the result is delivered; the inventory stays inside Orca's byte budget, and pages left out are logged and their tabs closed; restorePage of an unbound id opens a new agent tab, which is how Orca's close-then-restore after an orcad restart works |
| 66-CR-04 | fixed | 5d5612c5, b6b8dac0 | verify-orca-browser-host-wire.mjs::timeout | own bridge request, deadline max(35 s, timeout + 5 s); local timeout -> browser_timeout. Round 2: an agent timeout is capped at 10 minutes before chrome sees it; navigate's long deadline now has a plant |
| 66-WR-01 | fixed | f413c170 | verify-orca-browser-host-wire.mjs::credential | readiness re-armed when the credential cache key changes |
| 66-WR-02 | fixed | 5d5612c5 | verify-orca-browser-host-wire.mjs::startDeadline | 60 s deadline on the link and connection steps |
| 66-WR-03 | fixed | 5d5612c5, b6b8dac0 | verify-orca-browser-host-wire.mjs::detachedClose | a close entry is kept until orcad takes it. Round 2: it is dropped on a refusal from orcad, or after 3 attempts that fail for transport reasons. createPage is refused for a page the user closed (its close may be pending) |
| 66-WR-04 | fixed | 5d5612c5 | verify-orca-browser-host-wire.mjs::budget | over-budget value answers failed; a refused automation result is retried once as failed |
| 66-WR-07 | fixed | 5d5612c5 | no-check: dead code removed | closeStaleAgentTabs removed. G1a's round 2 makes restored agent rows real (they come back as agent tabs, with no Orca page). A sweep at prepare would miss rows restored later (Reopen Closed Tab), and an unbound agent tab drives nothing, so it was not re-added |
| 66-WR-05 | fixed | 5d5612c5, b6b8dac0 | verify-orca-browser-host-wire.mjs::duplicate, ::closeBeforeBind | records written only after the bind. Round 2: a tab closed between chrome's reply and the bind now fails createPage and sends no user close, so no pane row is left |
| G1a round 2 handover | fixed | b6b8dac0 | verify-orca-browser-host-wire.mjs::chromeStatus | agentsStopped reads chrome's `agentControl.agent && agentControl.stopped`, not the widget's own flag |

Round 2 (independent review), per point:
1. T-66-04: confirmed. The early foreign call is planted ('the first placement holds and refuses the host'). This is still not a wall: same-realm script can call connection() and place an id, as it can assign prepareBrowserClientHostPlacement directly (T-66-01). The only real boundary is the separate origin G1a recorded for chrome-actor-03 (Needs owner).
2. 66-CR-02: confirmed, and one part goes further than the reviewer's sequence. Without lease reconnect, orcad fences the lease at the socket close (browser-host-lease-reconnect.ts disconnect -> fenceLease 'released'), and the next attach takes a new generation (browser-host-lease-registry.ts attach). A page it retains (runtime-browser-client-page-recovery.ts isActiveExactPage) keeps the old generation, which requireBrowserHostLeaseState (browser-host-lease-state-resolution.ts:15-19) refuses for metadata. Sending the page's own generations is therefore needed but not enough, so the host also negotiates leaseReconnectProtocolVersion 1, as Orca's desktop host does (paired-runtime-browser-client-host.ts:59), and re-attaches once 1 s after a dropped socket, inside the 15 s grace. A Reconnect after the grace still leaves retained pages that cannot take metadata; that is orcad's own rule.
3. 66-CR-04: confirmed. The cap is AGENT_CALL_MAX_TIMEOUT_MS = 600000, applied in orca-browser-host-wire.ts agentParams. Chrome itself has no maximum (Handoff below).
4. 66-CR-03 ordering: confirmed and fixed. The new check runs the pinned BROWSER_CLIENT_HOST_METHODS handlers with the real lease and page registries, adoption, recovery and reconciliation; nothing is transcribed. That showed reclaimPage is used only across epochs of one runtime (browser-host-page-reconciliation-plan.ts canReclaimPage). After an orcad restart, Orca closes the old guest and restores the page instead. Before this round the host answered that restorePage with browser_tab_not_found, so the page was lost. The ordering clause (lostResult) injects a reclaim, because the pinned orcad does not produce one in these flows.
5. 66-WR-03: (a) confirmed and fixed. (b) applied to pages the user closed, but not to every id the table dropped. orcad's own recovery closes a page and then creates or restores it under the same id (runtime-browser-client-page-recovery.ts recoverPage: closeUnavailablePage then createClientPage), so refusing dropped ids would break that.
6. Confirmed, fixed. 7. Confirmed, fixed; the budget comes from the pinned BROWSER_CLIENT_HOST_PAGE_INVENTORY_MAX_BYTES. The host is not put into a failed state when pages are left out: a failed state with a live session would wedge Reconnect, which is point 1's fault. The pages left out are ended instead (log line and tab closed). 8. Both closed: the real link and placement path run in every frontend world, and real orcad checks each page's generations against its placement. 9. Header comments and Behaviour changes corrected.

## Registry requests
None. Both rows are registered (scripts/verify-platform.sh:4252-4253); the self-test now has 25 plants.

## Red by design
- scan-brand-residue and scan-brand-residue-self-test: this round's edits move the coincidental counts. On this branch the scanner reports Orca expected 3893, observed 3904; orca 6686, 6692; orcad 2566, 2649. Exact change for integration in `inventory/brand-tokens.json`: set those three expected_count values to the observed values, after re-measuring with the scanner on the merged tree.

## Handoffs
- G1a-chrome-shell: `powerbrowser/shell/GroupActorChild.sys.mjs:613`, `const timeout = params.timeout > 0 ? Math.min(params.timeout, 600000) : 30000;`, and `powerbrowser/shell/PowerBrowserAPI.sys.mjs:11297`, in the `browser.wait` row's timeout test, `v => agentNumber(v) && v > 0 && v <= 600000`, so chrome enforces the same 10-minute maximum (AGENT_CALL_MAX_TIMEOUT_MS) for callers other than this host. This is for 66-CR-04.
- G1a-chrome-shell (optional): `WebTabChannel.request` has no timeout argument on this base, so orca-browser keeps its own `shellRequest`.
- integration: the inventory counts above.

## Behaviour changes
- 66-CR-04: Orca agent commands and Orca's navigate wait for chrome up to max(35 s, timeout + 5 s), where before every call was cut at 5 s. A timeout above 10 minutes is lowered to 10 minutes before chrome sees it. No reply in time fails `browser_timeout`, not `browser_error`. Revert with 5d5612c5 and b6b8dac0.
- 66-CR-03:
  - One frontend keeps one browser host id. Revert with 5d5612c5.
  - After an orcad restart, Orca closes each agent tab and PowerBrowser reopens the page in a new agent tab at its url. The new tab gets its pane row; the old tab's page state is lost. Revert with b6b8dac0.
  - A reclaim or restore moves the page's recorded authority only once its result is delivered. Revert with b6b8dac0.
  - When the bound pages do not fit Orca's page inventory (more than 256, or over its byte budget), the pages left out have their tabs closed with one log line. Revert with b6b8dac0.
- 66-CR-02: orcad learns an agent tab's url and title. After a dropped socket, the host re-attaches by itself after 1 s (once per successful attach), keeps its pages through orcad's 15 s reconnect grace, and resends each tab's state. Revert with 5d5612c5 and b6b8dac0.
- 66-WR-02: an attach that cannot reach the link fails after 60 s; the failure page and Reconnect show. Revert with 5d5612c5.
- 66-WR-03: a user close made while detached is sent after the next attach. A close orcad refuses is dropped, and one that fails for transport reasons is given up after 3 attempts. orcad's createPage for a page the user closed answers `browser_tab_not_found` and opens nothing. Revert with 5d5612c5 and b6b8dac0.
- 66-WR-04: a result over 768 KiB answers `browser_error` at once. Revert with 5d5612c5.
- 66-WR-05: a tab closed between chrome's reply and the bind fails createPage. No user close is sent and no pane row is added. Revert with b6b8dac0.
- T-66-04: a placement made before the host attaches is replaced when the host's attach becomes ready, and the host ends attached. A detach puts placement back on the server, unless a later attach holds it. A refused placement can no longer leave a live session in the failed state, because placement is set before the session exists. The link object no longer has setPlacement. Revert with b6b8dac0.
- G1a round 2: Stop is read from chrome's agent status, so a restored agent row (no local flag) that chrome reports as stopped refuses createPage before any tab opens. Revert with b6b8dac0.
- 66-WR-01: after a re-pair the connection waits for the pane client's first status call. Revert with f413c170.

## Needs owner
- T-66-04: in-document placement is bound to an attach, but it is not a boundary against same-realm script. A real wall needs the separate origin or frame G1a recorded for chrome-actor-03 (Route B').
- 66-CR-02: a Reconnect made after orcad's 15 s grace still leaves retained pages unable to take metadata (orcad's lease rule, above). Making that path work would need a re-pin or an upstream change.

## Quick gate
Run after 7c7d87c3, inside `nix develop .#theia`, log at `.mozbuild/g1b/quick-round2.txt` in this worktree: 447 rows, 444 PASS, 3 FAIL.
- scan-brand-residue, scan-brand-residue-self-test: red by design (counts, above).
- orca-failure-classes: not caused by this lane. H2 recorded this row as red by design: 8 unmapped orcad codes, with the change for G2 in `powerbrowser/shell/`.
- Run by hand after the last change: orca-browser-host-wire PASS (14 clauses) and its self-test PASS (25 plants); orca-browser-abilities, -tools, -entry-points, -host-bundle, -tab-scope, agent-tab-walls and web-tab-bridge each PASS with its self-test. The host bundle was rebuilt (PASS, 309376 bytes). orca-browser `tsc -b` passes. tsc reports no error in the two overlay files.
