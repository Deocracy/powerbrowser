---
status: awaiting_human_verify
trigger: "TAB-04: orca-tabs-live stage tab-groups-cross-client (g3) red since Phase 64/65: 'the second client shows no tab for T (web-terminal-...)'. WINDOWS entry 55. D-49: attempt a fix now."
created: 2026-11-16T00:00:00Z
updated: 2026-11-16T00:00:00Z
audit_acknowledged:
  milestone: v1.7
  at: 2026-11-25
  status: awaiting_human_verify
---

## Current Focus

bug_class: Bohrbug (deterministic, every tree since Phase 64/65)
hypothesis: H1 -- the second client (stock Orca web client in a PB web tab) stops applying host session.tabs frames once it navigates itself (stage f's Configure Claude > Launch chat); the pinned host's double-projected ':client-navigation:client-navigation' echo retires the real epoch (64-MIRROR-FREEZE.md). T is created later, so the frozen client never shows it. Product (PB) not involved: T is a CLI terminal published by orcad.
candidate_causes: [code/check: second client frozen by its own navigation (H1)] [code/product: orcad or PB never publishes T to other clients (H2)] [environment: new scratch-HOME harness breaks pairing/second client (H3)]
test: scratch probe on lib/orca-tabs-live.mjs: second client sees T1 (CLI, before its own chat launch)? then launches a chat; sees T2 (CLI, after)? then reload+re-pair; sees T2? sees T3? then Move Tab to Split on T, PB store before/after reload
expecting: H1 -> T1 seen, T2 not seen until re-pair, T3 seen after re-pair. H2 -> T1 not seen either.
next_action: edit openSecondClient (add reload(): reload the page, pair only if Orca shows its field, reopen the worktree) and call it in g3 after T's hosted widget exists; then run orca-tabs-live x3 and the self-test

reasoning_checkpoint:
  hypothesis: "g3 is red because its second client (stock Orca web client, opened in stage f) applies no host session-tabs frame after it opened the worktree, so T, created later by the CLI, never appears in it; the product publishes T and the split correctly"
  confirming_evidence:
    - "probe: T0 (before load) shown; T1/T2/T3 (after load) never shown, with or without the client's own chat launch"
    - "probe: page reload -> T1, T2 shown; Move Tab to Split 1->2; PB record no split before PB reload, split-right after"
    - "probe 5: the client's own terminal create on opening the worktree precedes the freeze (64-MIRROR-FREEZE echo path)"
  falsification_test: "after a second-client reload that follows T's creation, the client still shows no T, or the split never reaches PB's store after the PB reload"
  fix_rationale: "g3 tests PB's store against another client's group split; it needs a client that holds T. Loading the client after T exists gives that through Orca's first adoption without touching any assertion"
  blind_spots: "the stock client's epochs were not observed directly; reconnect by stored pairing assumed stable (3/3 probe runs)"
  candidate_causes: ["code (check drive): second client frozen before T exists", "code (product): orcad/PB not publishing -- eliminated", "environment (harness): eliminated by baseline"]
  and_gate: "yes: the pinned host's double-projected echo AND the check reusing a client loaded before T; product fix not possible without a seam (the echo is Orca's), check fix removes the second condition"

## Symptoms

expected: stage g3 (tab-groups-cross-client) passes: a second Orca client shows a tab for terminal T
actual: "the second client shows no tab for T (web-terminal-...)"
errors: orca-tabs-live stage g3 red
reproduction: flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-tabs-live with ORCA_* unset
started: every tree since Phase 64/65

## Eliminated

- hypothesis: H2 -- orcad/PB never publish T or the split to other clients
  evidence: PB's hosted client gets T (hosted widget); a second client loaded after T shows it; the second client's split reaches PB's store at the PB reload (split-right)
  timestamp: 2026-11-16T07:20
- hypothesis: H3 -- the new scratch-HOME harness broke the second client
  evidence: baseline a..g2 all PASS; pairing and stored reconnect work in four probe runs
  timestamp: 2026-11-16T07:20
- hypothesis: (c) g3 asserts something D-15 makes impossible
  evidence: with the second client loaded after T, strips 1->2, no split before PB reload, split-right after it (probe 2)
  timestamp: 2026-11-16T07:20

## Evidence

- timestamp: 2026-11-16
  checked: .planning/debug/knowledge-base.md
  found: no knowledge base file / no matching entry
  implication: no known-pattern candidate

- timestamp: 2026-11-16T07:06
  checked: baseline orca-tabs-live under the new harness (04fe4400), 45 s
  found: every stage PASS except g3, same message; second client's tab list holds 7 tabs = 5 terminals (a, freeze-after-a, b, c, freeze-after-chat) and 2 chats (chat1, the second client's own chat). Missing: the freeze probe terminal created after the second client's chat, and T. No orcad/powerbrowser left; scratch HOME removed.
  implication: harness OK (H3 eliminated for a..g2). The second client stops showing tabs exactly after its own chat launch -- consistent with H1.

- timestamp: 2026-11-16T07:10
  checked: 64-MIRROR-FREEZE.md, 64-TAB-GROUPS.md, 65-05-SUMMARY "Still red"
  found: pinned host double-projects the frame for a client's own activation/creation; stock client retires the real epoch and drops all later host frames; PB's hosted client has staleNavigationEchoes, the stock second client does not. 64-TAB-GROUPS runs 1-2 (second client that never navigated) saw a later CLI T3 ([2,1]).
  implication: H1 predicted; g3's drive reuses a second client that already navigated in stage f.

- timestamp: 2026-11-16T07:20
  checked: scratch probe 1-2 (g3-probe.mjs): T0 before pairing, pair, T1 (CLI), second-client chat launch, T2 (CLI), page reload, T3 (CLI), Move Tab to Split on T2, PB store before/after PB reload
  found: second client shows T0 (true), T1 (false, before any chat launch), T2 (false). After a page reload it reconnects by itself (stored pairing; no pairing field, worktree rows) and shows T1 and T2 (true), but not T3 created after the reload (false). Move Tab to Split > Right on T2: strips 1 -> 2. PB record of T2: no split mode for 5000 ms before a PB reload; split-right after the PB reload.
  implication: the stage-f chat launch is not the trigger (H1 as worded refuted in detail, mechanism kept); the stock client applies no host frame once it has opened the worktree. A client loaded after T exists holds T at first adoption and every g3 detector and the absence pass.

- timestamp: 2026-11-16T07:30
  checked: probe 5: no terminal before pairing
  found: on opening the worktree the stock client itself creates a terminal tab (web-terminal-..., 1 xterm); T1 and T2 created by the CLI afterwards are never shown.
  implication: the trigger is the client's own first terminal create/attach on opening the worktree -- the session.tabs.activate / createTerminal echo diagnosed in 64-MIRROR-FREEZE.md (host double projection, client retires the real epoch). PB's hosted client carries staleNavigationEchoes; the stock client in the check does not. Every stock web client freezes this way at the pin.

- timestamp: 2026-11-16T07:32
  checked: epoch recorder (BiDi preload wrapping window.api.runtimeEnvironments.subscribe)
  found: the wrapper installed but recorded no subscribe call (withFallback proxy path); no epoch observed directly
  implication: mechanism is inferred from 64-MIRROR-FREEZE plus the differential, not observed on the stock client's frames (blind spot)

- timestamp: 2026-11-16T07:45
  checked: orca-tabs-live run 1 with the reload drive (second.reload() after T exists)
  found: T shown, strips grew, no split before PB reload, split-right after it; red only on the peers clause: "T's tab-bar peers chat1,chat2,checks1,sim1,term2..term8 -> chat1,chat2,term2..term8". sim1 and checks1 are the panes Orca's store drops on a frontend reload (stage k's note; reloadVerdict filters them through keptNames since 65-05 fix 13).
  implication: second defect in the same verdict, hidden until now behind the first: crossClientVerdict compares peers without the keptNames filter reloadVerdict applies. T was not re-placed (its other 8 peers are unchanged).

## Resolution

root_cause: "(a) check drive: g3 reused the stage-f second client (stock Orca web client), which at the pin applies no host session-tabs frame after it opens the worktree (own terminal attach/create -> host double-projected echo, 64-MIRROR-FREEZE.md); T is created later and never reaches it; plus a second check defect behind it: crossClientVerdict compared T's peers without the keptNames filter reloadVerdict uses, so sim1/checks1 (dropped by Orca's store at the reload) read as a re-placement"
fix: "2ce581f2 openSecondClient.reload() and g3 calls it after T exists; 3ad91d13 crossClientVerdict filters before-peers by keptNames (1 control, 2 plants)"
verification:
  target_test: { result: pass, runs: "run2..run5 orca-tabs-live PASS, four in a row; run5 on the committed bytes" }
  mutation_check: { result: pass, mutant_killed: "peers filter removed -> control red, one plant green" }
  no_op_deletion: { result: flagged, deletion_justified_by_rca: true, note: "filter relaxes before-peers only for panes the store no longer holds, same rule as reloadVerdict; after-peers unfiltered" }
  adjacent_tests: { result: pass, note: "orca-tabs-live-self-test PASS (57 plants); no other importer" }
  revert_reconfirm: { result: pass, note: "HEAD baseline red 'no tab for T'; drive-only run1 red on peers; both green" }
  guardrail_verdict: accepted
files_changed: [scripts/verify-orca-tabs-live.mjs]
