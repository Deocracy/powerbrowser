# Phase 64: the terminal mirror freeze (P64-31 owner item), diagnosed

Date: 2026-11-10. Measured on lane worktree p64-01 (branch ServerDestroyer/p64-01, head 70159c83),
Orca at the pin (release v1.4.248, tracked status unchanged: the one staged seam path), PowerBrowser
binary from the main checkout, every live run under `pb-live.lock` with every inherited ORCA_* unset.

## Result

**Root cause.** When the web client activates one of its tabs, orcad sends the frame for that
client through a delivery path that projects it a second time, so it arrives with the epoch
`<epoch>:client-navigation:client-navigation`. Every TerminalPane attach sends such an activation.
Orca's mirror records that epoch as a new publisher and retires the real epoch
`<epoch>:client-navigation`. After that it drops every later host frame. Orca's own repair, a
census through `session.tabs.listAll`, cannot revive the real epoch, because the browser web client
does not advertise the capability that makes the census authoritative.

**Fix.** The fix needs no seam. It is about 25 lines in PB's overlay entry
`orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx`. Bootstrap wraps
`window.api.runtimeEnvironments.subscribe` right after `installWebPreloadApi()` and before the
services root mounts. Each echo frame reaches the mirror rewritten as version 0 of the real epoch.
Orca's own freshness check then ignores the echo's tabs, and the echo's sender scopes and retirement
proofs are still read.

**Live proof.** In the same harness, after a TerminalPane mount, terminals created by the CLI and
by `terminal.create` became pane records in 172 and 37 ms. After a second mount they took 173 and
34 ms. Over five runs and three trigger variants, every one of the 23 creations was within 1 s.
The build without the fix (the revert) freezes in the same sequence.

**Lands in.** Plan 64-01's file, applied as a `fix(64-05)` commit under 64-05 merge rule (4) after
p64-01 merges, or as a follow-up commit on lane p64-01 before it merges. Details are under
"Where it lands" below.

## Mechanism, with evidence

### The trigger: every TerminalPane attach activates its pane

- `orca/src/renderer/src/components/terminal-pane/remote-runtime-pty-transport.ts:1166-1183`.
  `attachHostSessionMirror` runs for every mirrored `web-terminal-*` tab and always awaits
  `waitForHostSessionHandleWithRecovery`.
- `:819-830`. `waitForHostSessionHandle` first calls `activateHostSessionSurface(..., 'user')`.
- `:794-812`. That call is `session.tabs.activate` with `notifyClients: false` and
  `navigation: 'caller'`.
- Live call log (run 2, the RPCs the mount issued): `session.tabs.updatePaneLayout`,
  `terminal.resolvePane`, then `session.tabs.activate`. The activate reply itself is correct: its
  epoch is `X:client-navigation`, version 2.

### Host side: the frame sent to the caller is projected twice

- `orca/src/main/runtime/rpc/methods/session-tab-mutation-methods.ts:22-44`. The activate handler
  passes `clientNavigationId: pairedDeviceId`.
- `orca/src/main/runtime/session-lifecycle/projection/apply-mobile-session-tab-navigation.ts:64-76`.
  With a caller navigation id, `callerSnapshot = clientSessionTabSelections.activate(...)`.
  `activate` (`orca/src/main/runtime/client-session-tab-selection.ts:136-158`) raises the client's
  selection revision and calls `project`. `project` appends `:client-navigation` (`:131`) and
  adds the revision to the version (`:132`). `callerSnapshot` is then passed to
  `emitMobileSessionTabsSnapshotToClient`.
- `orca/src/main/runtime/session-tabs/session-tabs-change-publication.ts:234-245`. That function
  hands the already-projected frame to `deliver`. `deliver` (`:63-96`) projects every frame again
  for each listener (`:92-95`, via `projectMobileSessionTabsForClient`; see
  `session-lifecycle/projection/build-headless-mobile-session-browser-tabs.ts:283-291`). The
  result is a second `:client-navigation` and a version of `v + 2r` instead of `v + r`.
- Measured (run 1): after the mount the client received epoch `X:client-navigation:client-navigation`
  at version 3, while `session.tabs.list` on the host reported `X:client-navigation` at version 2.

### Client side: the echo retires the real publisher

- `orca/src/renderer/src/runtime/web-session-tabs-sync/tracking.ts:120-126`. At receipt, an epoch
  different from the current one is noted as the new publisher.
- `.../publisher-identity-fences.ts:170-183`. `noteSessionTabsPublicationEpoch` retires the
  previous current epoch. `:158-164`: two epochs count as one lineage only through
  `:headless-merge:`, never through `:client-navigation`.
- `tracking.ts:108-110` and `.../publisher-identity-fences.ts:142-152`. From then on, every host
  frame under `X:client-navigation` is a retired epoch. It is dropped at receipt, before any apply,
  in both the global `session.tabs.subscribeAll` path and the active-worktree
  `session.tabs.subscribe` path.
- Measured (run 2), as the epoch history after the mount:
  `{"current":"X:client-navigation:client-navigation","retired":["X:client-navigation"]}`. After
  each CLI create, the environment's received-frame counter advanced (4 → 5 → 7), so frames did
  arrive. The applied and received freshness stayed at the echo (version 3), and the host list grew
  from 1 to 2 to 3 terminals.

### Why Orca's own repair does not recover it

- `.../global-session-events.ts:87-109`. A dropped retired-epoch frame schedules
  `scheduleRetiredEpochCensus`, and the census does run (run 2 logged `session.tabs.listAll`).
- `.../retired-epoch-census.ts:69-80`. The census revives an epoch only when the reply has
  `authoritative: true`.
- `orca/src/main/runtime/rpc/methods/session-tabs-inventory.ts:21-27,56-58`. The host sets that
  flag only for clients that advertise `SESSION_TABS_AUTHORITATIVE_INVENTORY_RUNTIME_CAPABILITY`.
  The browser client's list, `orca/src/shared/web-runtime-client-capabilities.ts:20-36`, does not
  include it. The desktop's remote-runtime list does
  (`orca/src/shared/remote-runtime/remote-runtime-client-capabilities.ts:39`).
- Measured (run 2): the census reply carried no `authoritative` field.

The failure needs two conditions together: the host's double projection, and the census that the
browser client cannot make authoritative. Neither is a PB configuration or environment fault.

### The same mechanism explains research A4

Control run `a4`, without the fix, called Orca's `createNewTerminalTab` and no TerminalPane
mounted. The epoch history became `current X:client-navigation:client-navigation`, and the next
CLI terminal and `terminal.create` both missed 8 s. With the fix, the same sequence gave 178 and
33 ms. 64-RESEARCH A-1 ("mechanism not identified") is therefore answered: A4's freeze and this
one are the same echo. P64-31's rule ("create terminals only with `terminal.create`") remains the
chosen design, but it is no longer what prevents the freeze.

## The fix, exact code for `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx`

```diff
@@ imports
 import { makePaneKey } from '../../../shared/stable-pane-id'
+import { CLIENT_NAVIGATION_PUBLICATION_EPOCH_SUFFIX } from '../../../shared/runtime-session-contracts'
 import { resolveUnifiedTabLabel } from '../../../shared/tab-title-resolution'
@@ before "// Each step names itself on failure; ..."
+// 64-MIRROR-FREEZE.md: when this client activates or creates a tab (every TerminalPane attach
+// activates its pane), the pinned host projects the frame it sends back to this client twice, so its
+// epoch ends in ':client-navigation:client-navigation'. Orca's mirror reads that as a new publisher,
+// retires the real '<epoch>:client-navigation' and then drops every later host frame. Each echo is
+// passed on as version 0 of the real epoch instead: Orca's own freshness check ignores its tabs, and
+// its sender scopes and retirement proofs (delta-encoded per stream) are still read.
+const NAVIGATION_ECHO = CLIENT_NAVIGATION_PUBLICATION_EPOCH_SUFFIX.repeat(2)
+
+function staleNavigationEchoes(): void {
+  const environments = window.api.runtimeEnvironments
+  const subscribe = environments.subscribe.bind(environments)
+  environments.subscribe = (args, callbacks) =>
+    subscribe(args, {
+      ...callbacks,
+      onResponse: (response) => {
+        const frame = response.ok ? (response.result as { publicationEpoch?: unknown } | null) : null
+        const epoch = typeof frame?.publicationEpoch === 'string' ? frame.publicationEpoch : ''
+        if (!response.ok || !epoch.endsWith(NAVIGATION_ECHO)) {
+          callbacks.onResponse(response)
+          return
+        }
+        const publicationEpoch = epoch.slice(0, -CLIENT_NAVIGATION_PUBLICATION_EPOCH_SUFFIX.length)
+        callbacks.onResponse({ ...response, result: { ...frame, publicationEpoch, snapshotVersion: 0 } })
+      }
+    })
+}
+
@@ bootstrap()
     await step('installWebPreloadApi', () => installWebPreloadApi())
+    staleNavigationEchoes()
     await step('services root', () => {
```

Why each part is needed:

- **Placement.** The wrapper goes after `installWebPreloadApi`, which creates `window.api`. It goes
  before the services root, whose effects open the mirror subscriptions.
- **Matching.** The wrapper matches only frames whose epoch ends in the doubled suffix. No correct
  frame carries that suffix, because the host appends it once per projection.
- **The epoch suffix is removed.** If it were kept, the echo would still retire the real epoch.
- **The version is reset to 0.** This step is needed, as a mutant run showed. Removing only the
  suffix keeps the echo's inflated version `v + 2r`. The next real frame, `v + 1 + r`, is then
  equal or lower and is refused as stale. The mutant missed the CLI terminal after the mount
  (2/3 within 1 s).
- **The echo is not dropped.** The web client receives full tab lists, because it does not
  advertise the tab-delta capability. Retirement proofs and sender scopes are delta-encoded per
  stream, though (`orca/src/main/runtime/rpc/methods/session-tabs-retirement-proof-delta.ts`,
  `session-tabs-sender-delta.ts`), and the mirror reads both at receipt. A dropped echo could
  carry the only copy of one of them.

Contract checks that do not change:

- No new export is added, so the C3 export list stays exact.
- No client-side creation module and no `session.tabs.createTerminal` literal are imported, so
  orca-pane-routes clause (f) is unaffected.
- No Orca tracked file is touched and no seam is added.

Typecheck: `node config/scripts/run-typecheck-projects-in-parallel.mjs
--project=config/tsconfig.tc.web.json` exited 0 with the patched entry under
`src/renderer/src/pb/`. An error planted in the same file made it exit 1, naming that file, so
the typecheck does cover the entry.

## Live proof

**Method.** I built scratch standalone bundles with Orca's Vite from three entries. Each entry
re-exported the overlay entry plus read-only Orca internals for observation (store, epoch history,
receipt maps):

- **fixed:** the patched entry
- **control:** the unpatched entry, which is the revert
- **mutant:** the fix without the version reset

The driver ran each bundle in a PowerBrowser web tab against a scratch orcad, through a copy of
`scripts/lib/orca-pane-harness.mjs` with a configurable bundle directory. The driver ran this
sequence:

1. A CLI terminal is created.
2. TerminalPane is mounted for it.
3. A CLI terminal is created, then one with `terminal.create`.
4. TerminalPane is mounted for the second terminal.
5. A CLI terminal is created, then one with `terminal.create`.

The clock runs from the start of the create to the page-side timestamp at which `subscribePanes`
first lists the new record. The scratch files have been removed from `orca/`. Its tracked status
equals the starting state.

| Run | Before mount | After mount 1: CLI / terminal.create | After mount 2: CLI / terminal.create | Within 1 s |
|-----|------|------|------|------|
| fixed, no active worktree | 227 | 172 / 37 | 173 / 34 | 5/5 |
| fixed, repeat 2 | 238 | 178 / 35 | 170 / 34 | 5/5 |
| fixed, repeat 3 | 240 | 164 / 34 | 174 / 39 | 5/5 |
| fixed, active worktree set first (A8) | 220 | 177 / 35 | 191 / 35 | 5/5 |
| fixed, after `createNewTerminalTab` (A4), no mount | 239 | 178 / 33 (after createNewTerminalTab) | n/a | 3/3 |
| control (revert) | 228 | miss / miss (8 s each) | not reached | 1/3 |
| control, after `createNewTerminalTab` | 228 | miss / miss | n/a | 1/3 |
| mutant (no version reset) | 253 | miss / 57 | not reached | 2/3 |

Fence state with the fix, after both mounts:

```
{"current":"X:client-navigation","retired":[],"received":["X:client-navigation",0],"applied":["X:client-navigation",4]}
```

The `received ... 0` entry is the rewritten echo. No epoch was retired. The fixed runs recorded no
mount errors and no window errors.

**Adjacent check.** The lane's own `verify-orca-pane-standalone-live.mjs` passed against the fixed
bundle: isolated per-leaf mount PASS, and all five hosted kinds mount PASS. Its informational line
changed from the lane's recorded `no (15 s)` to `a CLI terminal created after TerminalPane mounts
became a tab in this client: yes`.

**Not covered by these runs:**

- Session-tabs subscriptions that resubscribe after a reconnect. They call the same wrapped
  `subscribe`, but no reconnect was exercised.
- A chat created by a second paired client.
- The real-widget mode in the Theia document. Lane p64-02's widget boots the bundle through the
  same `bootstrap()`, so the fix applies there unchanged.

## Where it lands

- **The code.** `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx` is in plan 64-01's
  files_modified, and lane p64-04 may not edit `orca-overlay/`. The coordinator applies it as one
  `fix(64-05): ...` commit under 64-05 merge rule (4), after merging p64-01 and before Task 2's
  live rows. Alternatively it is a follow-up commit on ServerDestroyer/p64-01 before the merge, if
  the lane is reopened. After the change, run `scripts/build-orca.sh --panes-only` so the built
  bundle carries it.
- **The check that proves it in the product.** This is orca-tabs-live stage (d), the freeze guard
  in 64-04-PLAN Task 2: "after (a) ... a CLI terminal becomes a tab within 1000 ms". Stage (a)
  mounts a hosted TerminalPane, so (d) measures exactly this trigger. No new row is needed.
- **Optional clean-up in 64-01's file `scripts/verify-orca-pane-standalone-live.mjs`.** The note
  line `lateCliTerminal` can become a judged clause with a 1 s limit. The comment on
  `preCreateTerminal` that describes the freeze as a measured limit can then point here. The
  ordering it imposes is harmless and can stay.
- **Brand rows.** The added comment adds "Orca" twice to the entry. 64-05 Task 3 re-measures the
  Orca-family rows on the staged merged tree in any case. This file is under `.planning/`, which
  the scan excludes.
- **Research correction for the record.** 64-RESEARCH A4, A-1 and Pitfall 1 attribute the freeze
  to `createNewTerminalTab` with the mechanism unidentified. The mechanism is the echo above.
  Pitfall 1's warning sign, "host count > store count", still holds.

## Upstream (not a PB seam; reported for Orca)

The defect is Orca's, on both sides. Either change upstream removes the need for PB's wrapper:

1. **Host.** `apply-mobile-session-tab-navigation.ts:59` and `:71-76` pass a frame that
   `ClientSessionTabSelectionStore.activate` has already projected to
   `emitMobileSessionTabsSnapshotToClient`, whose `deliver` projects it again
   (`session-tabs-change-publication.ts:92-95`). The fix is to emit the unprojected snapshot, or
   to skip projection in `deliver` for a frame addressed to one client. That is a one-line change
   in either place.
2. **Client.** Add `SESSION_TABS_AUTHORITATIVE_INVENTORY_RUNTIME_CAPABILITY` to
   `WEB_RUNTIME_CLIENT_CAPABILITIES`, so the browser client's retired-epoch census can revive the
   publisher, as the desktop's census can. This only bounds the outage (one census delay); it does
   not stop the echo.

Neither change is needed for Phase 64. PB adds no seam.

## Not checked

- Whether headless orcad's PTY census (`isCompleteSessionTabsPtyCensus`) would also mark the
  inventory authoritative if the capability were advertised. That matters only for upstream
  change 2.
- The exact host path by which `session.tabs.createTerminal` sends its echo. It was identified
  only by the same epoch signature (control `a4`) and by the fix curing it.
