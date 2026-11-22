# Result: R7-pane-hosting

Branch: worktree-agent-a3d7a3e1637413695   Base: 08e6f64393f5cc8e54319341079da22657e99bd2   Final: 7ffd5247 (this record is committed on top)

| # | Type | Commit | Files | What and why it is safe |
|---|---|---|---|---|
| 1 | refactor | 028bbd9b | theia/extensions/orca-panes/src/browser/orca-pane-routes.ts | NAME_WORDS removed: exported, never imported or read in theia/, scripts/, orca-overlay/ or .planning; planPanes mints from each route's own word |
| 2 | perf | ed55e70a | theia/extensions/orca-panes/src/browser/side-panel/orca-right-sidebar-toggle.ts | keepRoom (run on every main-panel layoutModified, per frame of a split drag) reads the host's box only while shown; hidden, the bar was undefined whatever the width |
| 3 | perf | 645e30fe | theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts | checkStuckOffer shared while in flight, as poll() is; before, every 1 s poll after the sixth stuck one started another handOff RPC |
| 4 | fix | c8901ae6 | theia/extensions/orca-panes/src/browser/orca-pane-observer.ts | drain() catches each apply() on its own, so a failed list no longer strands a newer one queued during it |
| 5 | fix | 7a36360b | theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts | connectionWhenReady's one-second wait removes its LINK_EVENT listener when the timer wins |
| 6 | refactor | 7ffd5247 | theia/extensions/orca-agents/bin/claude-wrapper.mjs | createPane's list fallback calls listRows instead of re-spelling its expression |

Evidence: `tsc -b` of orca-browser, orca-panes and orca-workspace (compiled lib/ checked for each edit); `node --check` of claude-wrapper.mjs; orca-pane-routes, orca-pane-groups, orca-pane-hosting, claude-wrapper-pane, agent-tab-walls, orca-browser-entry-points (each with --self-test), orca-editor-routes, orca-browser-host-wire, orca-agent-hooks --self-test, orca-bridge-dir, packaging-staging, gui02-web-tab-bridge and orca-pairing-containment --self-test all PASS.

## Bugs fixed
- theia/extensions/orca-panes/src/browser/orca-pane-observer.ts:156-166 (base): the try/catch sat outside drain()'s loop, so an apply() that rejected (a name-map write, a widget creation) ended the loop and the list that arrived during it stayed in `latest` unapplied until the next store change, leaving a new Orca pane without its tab. Fixed in c8901ae6. no-check: the fault needs an apply() that rejects mid-drain, which only the live observer produces; a text check would only pin the loop's shape.
- theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:400-403 (base): each link_not_ready retry whose one-second timer won left a `{ once: true }` LINK_EVENT listener registered, up to 60 per attach (START_STEP_DEADLINE_MS / 1000) until the event fired. Fixed in 7a36360b. no-check: a listener count is observable only in a live document; a text check would pin the wait's shape.

## Registry requests
None.

## Red by design
- scan-brand-residue: commit 1 removes one lower-case "orca" (the `pb-orca:` comment) and two upper-case "ORCA" (`ORCA_PANE_ROUTES` twice) from orca-pane-routes.ts. Integration must recount `inventory/brand-tokens.json`: held-back row "orca" (lower/coincidental) expected_count 7561 -> 7560, row "ORCA" (upper/coincidental) 1583 -> 1581, combined with the other lanes' moves.
- scan-brand-residue-self-test: its clean-root control reruns the tracked scan, so it goes red only through the same two counts; the recount above clears it.

## Blocked by check
None.

## Handoffs
None. No Firefox touchpoint was added, removed or moved.

## Needs owner
None.

## Not done
- orca-overlay/files/: no change. Its only type check without a network install would be Orca's web program run over orca/src/renderer/src/pb/, which needs the edited files copied into the read-only orca/ checkout. Candidates seen there were Orca-store projections (subscribeProjection re-projects and stringifies on every store change; readStoredWebRuntimeEnvironment is read per projection). A reference guard would miss the storage-read input, so none is provable by reading.
- pb-pane-mount.tsx: every React root, listener, interval and store subscription it adds is released on unmount or is installed once per document (installedSteps); no effect has a dependency list that runs it on every render.
- CLAUDE_WRAPPER_LOG_FILE (orca-agents-protocol.ts) is unused, but it documents the bridge-folder file contract next to ORCAD_DATA_ROOT_FILE, which a check pins. Left in place.
- The duplicate sessionStorage read/write helpers in orca-browser-frontend-module.ts were left alone (taste), as was the shared mount-once logic of OrcaPaneWidget and OrcaSideViewWidget, which would need a new base class.
- OrcaBrowserHost.run: when an attach fails before its session resolves, setState('failed') runs twice (once from onDetached, once from the catch). That is idempotent, so it was not changed.

## Quick gate
454 PASS, 2 FAIL, 0 SKIP (456 rows). FAIL: scan-brand-residue and scan-brand-residue-self-test, both Red by design (token recount, above). Log: quick-gate-r7.log in the worktree, untracked.
