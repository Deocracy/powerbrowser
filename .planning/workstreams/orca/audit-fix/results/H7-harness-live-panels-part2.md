# Result: H7-harness-live-panels-part2

Branch: worktree-agent-aad599240a94e1a18   Base: 7a266476   Final: 91e1f687 (last fix; this record is the commit after it)

No live row was run and no browser was launched. Each item names the live run that proves it on the desktop. The same worktree held part 1 (record `H7-harness-live-panels-part1.md`).

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| harness-live-panels-06 | fixed | 88371c7d | verify-orca-side-panel-live.mjs --self-test::one of six derived entries shown; an entry hidden although Orca shows it by default; control: the entries Orca hides by default may be absent; the default-hidden views of the real SidebarNav.tsx | `pagesVerdict` compares the shown set with the derived set and names each missing entry. The allowance is read from Orca's own `shouldShow<Name>Button` functions (`=== true` means hidden until a setting is on): artifacts and skills. Live proof: orca-side-panel-live clause f. |
| harness-live-panels-14 | fixed (defence in depth; the finding is PLAUSIBLE) | 88371c7d | verify-orca-side-panel-live.mjs --self-test::a hard-coded callout to 203.0.113.9; the control connection absent from the socket log; an IPv6 literal callout; control: loopback and a name-explained address ignored | MOZ_LOG now also has nsSocketTransport:5. A connection ("trying address: <ip>") that no `CompleteLookup: <host> has <ip>` line explains is red, naming the address; a control fetch to 192.0.2.1 must show up first, else "collector blind". Both log formats were read from upstream/netwerk (nsSocketTransport2.cpp:1543, nsHostResolver.cpp:1563), not observed in a run: the first live run is the proof, and a "collector blind" there means the control line differs from the source. |
| harness-live-panels-11 | fixed | 0e42cd1f | verify-orca-workspace-live.mjs --self-test::an entry that lost subscribeOpenFiles is a FAIL, not a SKIP | `entryFails`; the lane that added the exports is merged, so a missing name is a moved source (FAIL), as the other source-moved cases already were. |
| harness-live-panels-12 | fixed | 0e42cd1f | verify-orca-workspace-live.mjs --self-test::a merge base Orca chose wrongly; a wrong parent on a commit diff; no root at all; roots without the terminal the scan opened | The ids Orca's records carry (merge base, head, commit, parent) are compared with `git merge-base` / `rev-parse` on the fixture. The Monaco scan is a pure verdict over every pane root present (clause b's diff and conflict tabs included) and requires the terminal it opened. A mounted editor pane as a positive case was not added: in PowerBrowser Orca's editor tabs go to Theia by design, so a hosted editor root is exactly what must not exist; clause (a)'s Theia editor stays the positive control. Live proof: orca-workspace-live clauses b and c. |
| harness-live-panels-15 | fixed | 91e1f687 | verify-page-furniture-live.mjs --redaction-self-test::a secret the user copied is described by length only; the failure message prints no clipboard content | `describeClipboard` prints length and whether the value is one of the check's own values. |
| overlay-renderer-04 (G3a handoff) | fixed | 98c2b92c, 88371c7d | verify-orca-pane-standalone-live.mjs --self-test::cursor: 60 errors since a cursor of 0 return the 50 kept; the length-based slice returns none; a build without mountErrorsTotal | Gate (harness) and standalone stage 0/1 use `mountErrorsTotal` as the cursor over `newMountErrorsExpr` (run in the self-test over a fake bundle that kept 50 of 60); a build without the field is a FAIL. Side-panel clause a also fails on a missing field or errors past the 50 kept. |
| 65-CR-01 (G4 handoff) | fixed | 0e42cd1f | verify-orca-workspace-live.mjs --self-test::an added file whose left side shows text; a deleted file with both sides empty; the fixture holds an added, a deleted and an untracked file | The fixture gains staged-added `added.txt`, staged-deleted `del.txt` and untracked `untracked.txt`; each is opened through the bundle and must open with exactly one empty side (git has no blob there, the Theia diff editor reads '' there and the text on the other side). A diff tab for each must be observed. Live proof: orca-workspace-live clause b. |
| live-lock review (coordinator item 4) | fixed in my helper; H5's and H6's helpers need the same change | 0e42cd1f | verify-orca-workspace-live.mjs --self-test (decision plants, and real processes: SIGTERM forwarded, SIGKILL of the parent, run under `flock <lock> node <row>`, hand-set PB_LIVE_LOCK_HELD=1 on a free and on a held lock) | See "Lock helper" below. |

## Lock helper
All three defects applied to `scripts/lib/live-lock-reexec.mjs` as written in part 1, and are fixed in 0e42cd1f:
1. A hand-set PB_LIVE_LOCK_HELD=1 was trusted. Now the lock's holders are read from /proc/locks. A hand-set variable is trusted only together with the driver's `PB_VERIFY_ROW_TOKEN` and a held lock; otherwise the row takes the lock (free) or waits for it (held by another session). There is no lock-file environment override (tests pass the path as an argument).
2. A row under `flock <lock> node <row>` waited on its own lock. Now an ancestor that holds the lock means go on in this process.
3. Termination was not forwarded. `takeLiveLock` is now async: it forwards SIGINT, SIGTERM and SIGHUP to the re-run's process group, and a re-run whose parent vanishes (SIGKILL cannot be forwarded) ends itself within two seconds (PB_LIVE_LOCK_PARENT carries the parent's pid and start time).
Each has a plant: pure decision cases for the old rules, and real processes in a scratch checkout (verified red when the forwarding, the parent watch or the ancestor check is removed).

Comparison with H5's `scripts/lib/live-lock.mjs`: it has none of the three properties (it trusts PB_LIVE_LOCK_HELD=1 when anyone holds the lock, has no ancestor check, and its `spawnSync` re-run is not signalled or watched), so I did not switch to it and did not delete mine. Mine is the superset; the integration step should point H5's rows (and H6's `reexecUnderLiveLock` in `lib/orca-tabs-live.mjs`) at `takeLiveLock` (call it with `await`) and delete the other two, or port the three properties into one of them.

## Registry requests
- page-furniture-live-redaction-self-test: quick, `"page-furniture-live-redaction-self-test|node $REPO_ROOT/scripts/verify-page-furniture-live.mjs --redaction-self-test"` (hermetic; the existing `page-furniture-live-self-test` row launches a browser).

## Red by design
None known (the two product-driven reds named in the part 1 record still apply; socket log: a connection to an address no name explains is now also red there).

## Handoffs
- Integration / H5 / H6: unify the three live-lock helpers on `scripts/lib/live-lock-reexec.mjs` (see above); H5's `lockWiringFails` and `verify-live-harness-libs.mjs` read `holdLiveLock`, so they need the matching change if H5's helper is deleted.
- Integration: `inventory/brand-tokens.json` held-back counts after this part: `Orca` observed 3866 (expected 3847), `orca` 6605 (6603). Set them after merging.
- G3a/G3b: the part 1 handoff on `state()` exposing the pending creation still stands (page:creation stays `unverified`).

## Behaviour changes
- harness-live-panels-06: orca-side-panel-live clause f is red when a page entry Orca shows by default is missing from the hosted sidebar. Revert with 88371c7d.
- harness-live-panels-14: clause i is red on a connection to an address no resolved name explains. Revert with 88371c7d.
- harness-live-panels-11: orca-workspace-live FAILs, instead of SKIPping, when the pane entry no longer exports the two subscriptions. Revert with 0e42cd1f.
- Live lock: a row started with a hand-set PB_LIVE_LOCK_HELD=1 now takes or waits for the lock; a row started by Ctrl-C or SIGTERM to its launcher ends with its browser. Revert with 0e42cd1f.

## Needs owner
None.

## Quick gate
`nix develop .#theia --command scripts/verify-platform.sh --quick` at 91e1f687, log `.mozbuild/h7p2-quick.txt` in this worktree: exit 1, 441 PASS, 5 FAIL, 0 SKIP.
- shell-error-copy-no-internals and its self-test row: not mine, owned by lane H8 (red by design on the base).
- orca-failure-classes: not caused by this lane. It reads OrcaService and the pinned orca/ sources (the pinned Orca has orcad codes `ORCA_CODE_CLASSES` does not map); no file of mine is involved. Owner: the group that owns `powerbrowser/shell/OrcaService.sys.mjs`.
- scan-brand-residue and its self-test row: held-back counts only (this part added `Orca` and `orca` mentions in the scripts and the record); no unclaimed hit. Integration sets the counts (above).
