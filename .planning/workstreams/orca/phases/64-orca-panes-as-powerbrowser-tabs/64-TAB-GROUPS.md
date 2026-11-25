# Phase 64: TAB-04 tab-group clause, propagation finding

**Question:** does the clause "Orca's tab groups appear as Lumino splits" (TAB-04, SC2) describe anything
reachable at the pin, and if so, what drive produces it? Raised by the gap in `64-VERIFICATION.md`.
**Pin:** Orca v1.4.248 (`orca/` at 965978bc). PB tree: 6b58d5fa.
**Method:** source trace of the pinned Orca (file:line below, paths under `orca/`) and three live runs on the
built integration worktree, under `flock .../pb-live.lock`, inherited `ORCA_*` unset, with scratch probes built on
`scripts/lib/orca-tabs-live.mjs`. Nothing tracked was edited and no prompt was sent.

## Answers

1. **Cross-client propagation: yes, but the receiving client takes the layout only at first adoption.** A
   group split made in a paired web client through Orca's split commands is sent to orcad, applied, persisted and
   published in `session.tabs` frames (`tabGroups` + `tabGroupLayout`). A client that already holds groups for
   that worktree keeps its own groups and layout. It takes orcad's groups and layout only when it has no group
   for the worktree, which in a web client happens on every load and reload. "Split Chat Right" and the CLI never
   reach orcad as a group at all.
2. **Yes, a PB user can make an Orca tab group inside PowerBrowser.** A hosted chat renders Orca's own chat pane
   header, which has a visible "Split Chat Right" button. Clicking it creates a group in PB's own store and opens
   a new chat in that group, and the existing group branch places that chat as a Lumino split (run 3: second tab
   bar, x=640, 28 ms). The tab strip actions ("Move Tab to Split", tab drop on a group edge) are not reachable,
   because PB renders no Orca tab strip (D-29).
3. **Three actions put a multi-group layout in PB's store.** (i) A hosted chat's Split Chat Right in PB, which is
   client-local and applies at once. (ii) Another web client's "Move Tab to Split ▸ Right/Left/Down/Up" or a tab
   drop on a group edge, which sends `session.tabs.move` kind `split`; PB's store shows it only after PB's hosted
   client next adopts orcad's layout (a frontend reload, or a start against a persisted orcad session). (iii) An
   existing orcad session that already holds a split when PB starts. Four things never produce one: the second
   client's Split Chat Right, the CLI, mobile, and orcad's layout-intents stream (dark switch off).

**Recommendation: (b), groups do propagate.** Case (i) is the intended PB behaviour and already works. Case
(ii) works only because of a reload defect (see Side finding), and live regrouping of panes PB already shows is
not mirrored, by Orca's design and by P64-12. Re-word the clause, re-drive g2 in PB's own document, and add the
fixture and the cross-client sub-stage below.

## 1. Where group layout lives at this pin

**The orcad layout-intents stream is off.** `server-layout-frames.ts` would let orcad draw a client's layout, but
a client opens that stream only for a server that advertises `layout.intents.v1`
(`src/renderer/src/runtime/server-layout-frames.ts:268-279`). orcad advertises it only when
`ORCA_LAYOUT_OWNER_IS_MAIN` (`src/main/runtime/dark-switch-runtime-capabilities.ts:16-19`). That switch is off
unless the build environment sets `ORCA_LAYOUT_OWNER=main` (`src/shared/layout-owner-switch.ts:5-9`,
`config/dark-build-switches.cjs` `turnedOnDarkBuildDefines`, `config/scripts/orcad-entry-build.mjs:44-48`). The
capability's own note: "Without this capability desktops retain session.tabs mirrors, which hosts still serve"
(`src/shared/workspace-layout/layout-intents-capability.ts:3`). This matches D-15.

**`session.tabs` frames carry groups.** `RuntimeMobileSessionTabsSnapshot` and `...TabsResult` both have
`tabGroups` and `tabGroupLayout` (`src/shared/runtime-session-contracts.ts:260-261, 285-286`). The move contract
has `kind: 'split'` with a `splitDirection` (`:218-224`).

**A web client's group split is sent to orcad:**

- "Move Tab to Split ▸ Right/Left/Down/Up" is a submenu of the terminal tab context menu
  (`src/renderer/src/components/tab-bar/TerminalTabSplitMenuSection.tsx:45`,
  `TabWorkspaceLayoutMenuSection.tsx:55-90`). It is shown when the group holds more than one server tab
  (`tab-move-to-pane-column.ts:32-36`).
- `moveTabToNewPaneColumn` runs a local `dropUnifiedTab`, then `mirrorWebRuntimeTabMove({ kind: 'split' })`
  (`tab-move-to-pane-column.ts:70-83`). A tab drop on a group edge goes through the same mirror
  (`src/renderer/src/components/tab-group/tab-group-layout-owner-commands.ts:124-130`).
- The mirror sends `session.tabs.move` (`web-runtime-tab-move-mirror.ts:28-31`,
  `src/renderer/src/runtime/web-runtime-session-tab-move.ts:88-104`).

**Headless orcad applies, persists and publishes the split:**

- The RPC handler is at `src/main/runtime/rpc/methods/session-tab-mutation-methods.ts:53-84`.
- With no window notifier it takes the headless path (`src/main/runtime/session-tabs/headless-terminal-tab-close.ts:161-167`).
  `moveTabInMainLayout` returns null unless the dark switch is on (`main-layout-session-tab-move.ts:56-61`).
- `splitHeadlessMobileSessionTabGroup` builds a new group with a random UUID, then calls
  `persistHeadlessTabGroups`, `storeMobileSessionSnapshot` and `emitMobileSessionTabsSnapshot`
  (`headless-tab-group-moves.ts:93-129`; builder at `src/shared/workspace-layout/tab-group-moves.ts:100-152`).
- `persistHeadlessTabGroups` writes `tabGroups` and `tabGroupLayouts` into orcad's workspace session
  (`headless-tab-group-moves.ts:184-222`). The split therefore survives an orcad restart on PB's per-profile data
  root.
- `buildHeadlessTabGroupSplit` is the only builder that makes a host group (no other caller in `src/main`).
  Moving a pane to a new tab puts it in an existing group (`headless-pane-move-to-new-tab.ts:85-133`).

**A client that already holds groups ignores the host's groups:**

- "Existing client groups own placement: append unseen tabs, drop vanished tabs and honor explicit focus. Only
  first adoption takes host order/actives/layout." `clientOwnedPlacement` is used unless the client has no group
  for the worktree (`src/renderer/src/runtime/web-session-tabs-sync/apply-preparation-groups.ts:46-49`).
- Host groups are used only on that first adoption (`:117-137` → `buildMirroredHostGroups`, `layout-groups.ts:122-218`).
  The same holds for the host layout (`apply-active-state.ts:62-81` keeps the client layout; `:85-124` takes
  `snapshot.tabGroupLayout` only without client placement).
- In client-owned mode an already-placed tab keeps its group. A new tab whose host group the client does not
  know goes to the active group (`src/renderer/src/runtime/web-session-client-owned-tab-placement.ts:135-146, 168-180`).
  A host split's new group is a fresh UUID, so the client never knows it.
- A mirrored tab's group hint is the host group id (`apply-preparation-unified.ts:41`). After a first adoption
  with two host groups, a later tab in host group 2 does join group 2.

**Every web-client boot is a first adoption.** With a paired runtime active, the web session read returns a
default session with no tab groups ("mirror host session-tabs instead";
`src/renderer/src/web/preload-api/web-workspace-session-api.ts:54-61`).

**"Split Chat Right" is client-local.** `runNativeChatSplitTarget` calls `createEmptySplitGroup` and then
launches a chat into that group (`src/renderer/src/components/native-chat/native-chat-layout-actions.ts:80-100`).
`createEmptySplitGroup` only sets the store (`src/renderer/src/store/slices/tabs/tabs-group-actions.ts:219-231`).
No `session.tabs.move` is sent, so other clients never see the group.

**The CLI and mobile cannot make a group.** Neither `src/cli` nor `mobile/` calls `session.tabs.move` (grep).
`orca terminal split` is an in-tab pane split, not a group split.

## 2. Inside PowerBrowser

- PB mounts a hosted chat as `NativeChatView` with `isVisible`, the tab's `groupId` and no
  `contextMenuActions` (`orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:487-500`).
- Under those props Orca renders `NativeChatPaneHeader` (`orca/src/renderer/src/components/native-chat/NativeChatPaneHeader.tsx:127-157`,
  `NativeChatStructuredSession.tsx:277`). The header's "Split Chat Right" button is at `NativeChatPaneHeader.tsx:86-97`.
- No PB stylesheet or overlay hides `.pane-title-bar` (grep over `orca-overlay`, `theia/extensions/orca-panes`).
- The chat menu items "Split Chat Right/Down" (`NativeChatStructuredPaneMenuItems.tsx:40-47`) and the
  `terminal.splitRight` key in a focused chat (`native-chat-split-shortcut.ts`) may also be reachable in PB.
  Neither was tested live.

## 3. Live runs

| Run | Drive | Observation |
|-----|-------|-------------|
| 1, 2 (stub agent) | Two CLI terminals T1, T2. The second client (Orca's web client in a PB web tab, paired in page memory) right-clicks T2 and picks Move Tab to Split ▸ Right. | The second client's strips go `[2]` → `[1,1]`. PB records: T1 and T2 still `tab-after` only, both in Lumino tab bar 0. |
| | A CLI terminal T3 is created before any reload. | The second client shows `[2,1]`. PB: T3 is `tab-after`, tab bar 0. Still one group in PB. |
| | PB frontend reload (`location.reload()`). | PB records now hold both groups: T2 `split-right`; T1 and T3 `tab-after` + `split-left`. T2's widget is in tab bar 1 at x=640; T1 and T3 are in tab bar 0. orcad published the split, and PB's first adoption took it. |
| | A CLI terminal T4 is created after the reload. | It goes into host group 1: `tab-after` + `split-left`, tab bar 0. |
| 3 (real claude, no prompt) | One CLI terminal, then `createChat`, giving chat1. The probe clicks chat1's own `button[aria-label="Split Chat Right"]` inside the hosted widget, in the Theia document. | The button is found and visible. chat2 is added 28 ms after the click. chat2's record is `split-right`; term1 and chat1 gain `split-left`. chat2 is in Lumino tab bar 1 at x=640; chat1 is in tab bar 0. |

Runs 1 and 2 gave the same result. The reload in each run shows that the probe does see group split modes, so it
also serves as the detector for the absence of split modes before the reload (CLAUDE.md verification rule 1).

## 4. Corrections to the 64-06 record

- **The g2 note "Split Chat Right opened a chat in the same tab group" (64-06-SUMMARY, REQUIREMENTS.md:230) is
  wrong.** The second client did make a second group (its `groupIndex` 1). The group was client-local and was
  never sent to orcad, so PB's store could not hold it.
- **"The pinned client's tab menu offers only Split terminal" (`verify-orca-tabs-live.mjs:705-706`) is wrong.**
  The menu also has a "Move Tab to Split" submenu. The driver's regex required "split" and "right|down" in a
  single item's text, so it missed the submenu trigger.
- **A drag-driven g2 in the second client would also stay red** before a PB reload, because PB's store is in
  client-owned placement (section 1). The recorded deferral ("drive a real Orca tab-group split (tab drop on a
  group edge) in the second client") would therefore not turn g2 green.

## 5. Side finding (outside TAB-04's group clause, reported for follow-up)

**After a frontend reload, hosted widgets are re-created with names re-minted in record order. They are not
adopted under their stored names.**

- In runs 1 and 2, `term2` and `term3` swapped panes across the reload. Run 1: `term2` was pane …8666e8c9
  before the reload and pane …fe077412 after it.
- So a `pb-orca:term2` held from before a reload opens a different pane afterwards.
- `reloadVerdict` compares only the sets of names (`verify-orca-tabs-live.mjs:267-276`), so stage k passes anyway.
- Likely mechanism (not instrumented): `subscribePanes` calls the listener at once
  (`pb-pane-mount.tsx:421-423`). If Orca's store has not hydrated by then, the first list is empty. `planPanes`
  then disposes every restored key missing from that list (`orca-pane-routes.ts:134-138`), and the observer
  clears `restored` (`orca-pane-observer.ts:117-123`). Everything is then created again with placement
  (`:141`). This runs against P64-28 ("shows Orca's waiting state until the store hydrates").
- **Dependency:** the reload path in answer 3(ii) shows Orca groups as Lumino splits only because of this
  re-creation. Once restored widgets are adopted, a cross-client group appears in PB's store but not as a Lumino
  split, unless it reaches PB at a pane's first appearance.

## Recommendation

**Requirement wording.** Replace the TAB-04 / SC2 clause "Orca's in-tab splits and tab groups are flattened into
Lumino splits" with:

> Orca's in-tab splits, and Orca tab groups held in PowerBrowser's hosted Orca client, are flattened into Lumino
> splits at a pane's first appearance, in the direction Orca records: a group made in PowerBrowser (a hosted
> chat's Split Chat Right) at once, and a group another paired client made when PowerBrowser's client next adopts
> orcad's layout (start or frontend reload). Later regrouping of panes PowerBrowser already shows is not mirrored
> (D-15, P64-12).

**g2 re-drive (one row change in `verify-orca-tabs-live.mjs`, no new driver):**

- Drive it in PB's own document. Click stage f's chat1's `button[aria-label="Split Chat Right"]` inside its
  hosted widget node, and wait for one hosted add.
- Detector first: the new chat's store record has a `split-right` neighbour that is a key of the first group.
- Then: the new chat's widget sits in a different Lumino tab bar from chat1 and lies to its right
  (`liesInDirection`).
- No prompt is needed, and the second client is not used.

**Cross-client sub-stage g3, the derived non-propagation guard:**

- In the second client, choose Move Tab to Split ▸ Right on a tab of a group that holds at least two server tabs.
  The detector is that the second client's strip counts gain a group.
- Before any reload, PB's records for that worktree hold no split mode from groups. Its detector is the same
  probe after a PB frontend reload, which must show the `split-right` record.
- If a future re-pin starts mirroring live group changes into an already-adopted client (or turns on
  `layout.intents.v1`), the pre-reload observation will show the split. The sub-stage then goes red naming "live
  group propagation", which is the signal to revisit P64-12 re-placement.
- The Lumino half of g3, a second tab bar after the reload, should be asserted only once the side finding is
  settled, because today it depends on that defect.

**Pure fixture for placement.** Extend the existing `orca-pane-routes` row and its self-test, without adding a
driver; `orca-pane-routes.ts` loads in Node. Cases:

1. Both panes new in one plan: A has no ref; B is placed `split-right` with `ref` equal to A's minted widget id.
2. A is known: B is placed `split-right` against A's widget.
3. A `split-bottom` neighbour gives mode `split-bottom`.
4. A `tab-after` neighbour that has a widget wins over a split neighbour.
5. A known key whose neighbours change gets no placement, only a retitle (P64-12).
6. A restored key is adopted, not placed.

`paneRecords`' `groupNeighbours` is not exported. Covering it needs either an export plus an Orca-side vitest in
the overlay (a two-group `groupsByWorktree` / `layoutByWorktree` fixture giving `split-right` / `split-left`), or
reliance on g2's live store record.

Not checked: Split Chat Down and the chat key shortcut in PB, a PB restart against a persisted orcad split, and
the side finding's mechanism, which was not instrumented.
