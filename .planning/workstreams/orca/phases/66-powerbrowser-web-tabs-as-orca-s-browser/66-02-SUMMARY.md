---
phase: 66-powerbrowser-web-tabs-as-orca-s-browser
plan: 02
subsystem: theia-extensions
tags: [theia, orca, browser-host, web-tab, page-table, typescript-derivation]
status: complete

requires:
  - phase: 64 (merged by 64-05/64-06)
    provides: "@powerbrowser/orca-panes route table, observer, /orca-panes/ bundle route, eager pane-bundle loader, C3 records with browserPageId and active, ORCA_PANE_FACTORY_ID"
  - phase: 65 (merged by 65-05)
    provides: "N-2 route rows (theia-editor, ORCA_PAGE_ROUTES), name-map seeding, orca-workspace build entry"
provides:
  - "@powerbrowser/orca-browser: the S2 host's Theia half (link wait, host bundle import, attach, page table, dispatcher, user close, stale-tab close, metadata, placement)"
  - "OrcaBrowserPages (injectable): tabOf and reveal(records), used by orca-panes' pb-web-tab route"
  - "web-tab.ts: WebTabOptions.agent, webTabOpen agent field, webTabAgent/webTabAgentStop, openAgentTab, parked box (A1), agentControlChanged push, title class, agentStop()"
  - "orca-browser-abilities and orca-browser-entry-points quick rows, each with a self-test"
affects: [66-01, 66-03, 66-04, 66-05, 66-06]

actuals:
  tokens: 33000      # chars/4 over the realized diff (about 132,000 chars, 15 files)
  tasks: 3
  commits: 3         # git rev-list --count 5a13abab..HEAD is 2 at write time; the third is the commit that carries this SUMMARY
plan_head_before: 5a13ababec05b58beefbc7acff5c4463288cb859
plan_head_after: 36ad5a017bd818affe17148274c9e71fa15faeb5   # HEAD when this SUMMARY was written (before its own commit)

tech-stack:
  added: []
  patterns:
    - "Pure dispatcher and reveal tracker in src/common with no imports beyond the abilities table, transpiled by the checks with theia/node_modules/typescript"
    - "Host bundle imported by an inline module script (the orca-panes loader idiom), so the commonjs emit cannot rewrite import()"

key-files:
  created:
    - theia/extensions/orca-browser/package.json
    - theia/extensions/orca-browser/tsconfig.json
    - theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts
    - theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts
    - theia/extensions/orca-browser/src/common/orca-browser-abilities.ts
    - scripts/verify-orca-browser-abilities.mjs
    - scripts/verify-orca-browser-entry-points.mjs
  modified:
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/orca-panes/src/browser/orca-pane-routes.ts
    - theia/extensions/orca-panes/src/browser/orca-pane-observer.ts
    - theia/extensions/orca-panes/package.json
    - theia/package.json
    - theia/applications/browser/package.json
    - scripts/verify-platform.sh

key-decisions:
  - "Duplicate createPage answers failed browser_error and opens nothing; closePage for an id a user close already dropped answers completed, for a never-bound id browser_tab_not_found (the table remembers dropped ids through an added wasDropped member)"
  - "An unshown agent tab publishes the box of the shown widget of its own tab bar: Lumino's DockPanel has no per-area stacked panel, and only the current widget of an area is laid out"
  - "The reveal tracker runs on every subscribePanes list (not only the drained ones), so no activation is coalesced away"
  - "The served-prefix clause of orca-browser-entry-points is compared on every run (it reads only orca-panes and orca-browser), not only after p66-01 merges"

requirements-completed: []  # BRW-02/BRW-03 lane half only; the coordinator marks them after the merge and the live rows

duration: 75min
completed: 2026-11-11
---

# Phase 66 Plan 02: @powerbrowser/orca-browser, the Theia half of Orca's browser Summary

A new Theia extension, `@powerbrowser/orca-browser`, attaches PowerBrowser's browser host for Orca at frontend start through the pane bundle's link. It turns each Orca `createPage` into one background agent web tab, sends served automation methods to chrome as `webTabAgent`, and reports user closes. orca-panes' `browser` route now reveals bound web tabs and mounts nothing. Two derived checks pin the 92-ability table and the browser entry points to the Orca pin.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 (tracer) | 9a0225b7 | feat(66-02): orca-browser extension, page table and the createPage-to-agent-tab path |
| 2 | 36ad5a01 | feat(66-02): client host complete, browser route, parking box, mark state and the 92-row ability table |
| 3 | the commit carrying this file | feat(66-02): entry-point derivation and lane summary |

## Setup records

- Setup 1-3 ran in the lane worktree: `node scripts/generate.mjs` (72 files), the audited install from docs/BUILD.md (re-run after each package change, `theia/yarn.lock` unchanged), and `bash scripts/fetch-orca.sh` (v1.4.248, 965978bc).
- No path substitution. The merged Phase 64 names equal the planned ones: `theia/extensions/orca-panes/src/browser/orca-pane-routes.ts` and `theia/extensions/orca-panes/src/browser/orca-pane-observer.ts`.
- Served URL prefix: `/orca-panes/` (`ORCA_PANES_ROUTE_PREFIX`, `theia/extensions/orca-panes/src/common/orca-panes-protocol.ts`), served by `app.use(ORCA_PANES_ROUTE_PREFIX, ...)` in `theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts:164`. The host bundle URL is therefore `/orca-panes/pb-browser-host.js` (`HOST_PREFIX` + `HOST_ENTRY`).
- Orca-pane widget factory id: `powerbrowser.orca-pane` (`ORCA_PANE_FACTORY_ID`, `theia/extensions/tab-uris/src/browser/orca-scheme-coverage.ts`).
- Merged pane entry: `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx`.
- Pane bundle import: frontend start
  (`OrcaPaneBundle.onStart`, `theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts:49-51`, P64-05). Task 1 (5) therefore imports nothing extra.
- C3: every merged `OrcaPaneRecord` carries `browserPageId?: string | null` and `active: boolean` (`orca-panes-protocol.ts:59-60`). No BLOCKER.
- C65 items on the base: `ORCA_PAGE_ROUTES`, the theia-editor rows and branch, the name-map seeding, the orca-workspace build entry and app row are all present. Every line Phase 65 added to the six shared files (`git diff f4e050cc^1 5a13abab`) is still present, byte for byte.

## How it works

- **Attach (P66-01, P66-03, A3):** `OrcaBrowserHost.onStart` waits for `initialized_layout`, closes stale agent tabs (P66-08), then waits for `globalThis[Symbol.for('powerbrowser.orca-browser.link')]` or the `powerbrowser-orca-browser-link` event. It calls `link.connection()` and imports `/orca-panes/pb-browser-host.js` with an inline module script. It checks `PB_BROWSER_HOST_API === 1` and `HOST_EXPORTS`, attaches with `pb-host-<uuid>`, and then calls `link.setPlacement(id)`. `onDetached` restores the placement to null and logs the code only. Every failure logs one line that names the step and no value.
- **Dispatch (P66-05, P66-12, P66-17, P66-18, A6, A8):** the pure `dispatchCommand` resolves every command through the one-to-one table:
  - `createPage` opens one tab through `WebTabOpenHandler.openAgentTab` (about:blank, `agent: true`, added after a ref and never activated).
  - `closePage` drops the pair, then closes the tab.
  - `navigate` uses the widget's own `navigate` (`webTabNavigate`).
  - `reclaimPage` and `restorePage` are answered only from the table.
  - `automation` sends `webTabAgent` for a served method; any other method answers `browser_command_unavailable` without reaching chrome.
  - `outcomeOf` follows the contract's outcome table. `browser.snapshot` results gain `browserPageId`, `url` and `title`.
- **User close (A7):** each bound widget's `disposed` signal drops the pair and calls `session.userClosedPage('id:<workspaceId>', pageId)`, the selector form of Orca's `toRuntimeWorktreeSelector`. A close caused by `closePage` finds the pair already dropped and sends nothing.
- **Metadata:** a bound tab's `state` push sends `pageMetadata(pageId, { url, title })` only when either value changed.
- **Placement (P66-07):** the new tab goes after the most recently active main-area Orca-pane widget of the page's `workspaceId`, else after the current main-area widget, else at the end.
- **web-tab.ts:**
  - `publish()` handles an unshown agent widget by sending `visible: false` with the box of the shown widget of its own tab bar, falling back to the dock's box (A1).
  - The `agentControlChanged` subscription stores `{ active, stopped }`, toggles the `pb-agent-controlled` title class and fires `tabStatusEmitter`.
  - `agentStop()` is the only sender of `webTabAgentStop`.
- **orca-panes (P66-09, D-01):** the `browser` row is `{ target: 'pb-web-tab' }`. On every pane list, `revealBrowserTabs` passes the browser records to `OrcaBrowserPages.reveal`, which runs the reveal tracker. It activates only the tabs the tracker returns, logs one line per page that has no web tab, and creates nothing.

## P66-09 activation rule (for STATE.md, coordinator)

The browser route never activates a tab when it is created. It reveals the bound web tab only when the page's Orca store record turns active while the same record was present and inactive in the previous list, the page was bound before that list, and the activation is not the one that follows this host's own `createPage`. The `noteCreated` mark is cleared, without a reveal, by the page's first active record or by two consecutive inactive lists. `createRevealTracker` in `orca-browser-dispatch.ts` implements this, and five trace steps and two plants of orca-browser-abilities prove it.

## Derived sets (orca-browser-entry-points, at the pin)

- Page-mounting components (13), all under `components/browser-pane/`: `BrowserPane.tsx`, `ClientHostedBrowserPagePane.tsx`, `annotate/MarkupOverlay.tsx`, `annotate/browser-guest-annotate-overlays.tsx`, `annotate/use-client-hosted-browser-markup.tsx`, `assemble-chrome/BrowserPaneOverlayLayer.tsx`, `assemble-chrome/browser-page-pane.tsx`, `assemble-chrome/browser-page-viewport-overlays.tsx`, `assemble-chrome/browser-workspace-pane.tsx`, `stream-remote/remote-browser-page-pane.tsx`, `stream-remote/remote-browser-page-viewport.tsx`, `workspace-doc/HtmlDocPreview.tsx`, `workspace-doc/workspace-doc-page-pane.tsx`. The pane entry's graph has 8665 modules and reaches none of them.
- `createBrowserTab` callers (17):
  - Reachable (12): `lib/browser-link-open.ts`, `lib/browser-page-tab-opening.ts`, `lib/file-preview.ts`, `lib/floating-workspace-tab-creation.ts`, `lib/http-link-browser-placement.ts`, `lib/workspace-browser-tab-open.ts`, `runtime/web-runtime-browser-tab-staging.ts`, `components/terminal-pane/terminal-file-link-browser-open.ts`, `hooks/ipc-events/browser-request-ipc-bridge.ts`, `lib/workspace-ports/workspace-port-actions.ts`, `store/slices/browser/browser-tab-actions.ts`, `store/slices/browser/browser-tab-focus-actions.ts`. (`browser-tab-actions.ts` defines the action and also calls it.)
  - Dead (5): `components/use-terminal-create-actions.ts` (importer `use-terminal-controller.ts`), `components/floating-terminal/FloatingTerminalPanelSurface.tsx`, `components/floating-terminal/use-floating-terminal-create-actions.ts`, `components/tab-group/useTabGroupCreationCommands.ts`, `components/terminal-pane/terminal-html-file-browser-open.ts` (no importer). No import path from the entry reaches any of them.
  - The check prints the exact per-caller lines. Its PASS line reads "13 reachable, 8 dead" over both creators combined.
- `createWebRuntimeSessionBrowserTab` callers (4):
  - Reachable: `lib/workspace-browser-tab-open.ts`.
  - Dead: `components/use-terminal-create-actions.ts`, `components/browser-pane/browser-reopen-on-server.ts`, `components/tab-group/useTabGroupCreationCommands.ts`.
- Every reachable caller "arrives as createPage through the client placement, proven live by orca-browser-agent-live" (lane p66-05's live row).

## Check results (lane worktree)

- Theia build: `yarn build` exit 0 after each task, `[build/browser] Finished with 0 errors`. `lib/browser/orca-browser-frontend-module.js` is emitted, and `src-gen/frontend/index.js` loads `@powerbrowser/orca-browser`.
- `orca-browser-abilities` PASS: "trace scenario green; 92 rows equal the 92 derived abilities, tiers equal DISPOSITIONS.md's, no tier-1 row unavailable, no BiDi mechanism, dialogs native; 40 tier-1 automation methods equal the 40-method served set; chrome AGENT_METHODS SKIP ("lane p66-03 not merged")".
- `orca-browser-abilities-self-test` PASS: 16 plants plus the clause (g) SKIP case. Mechanism counts: native 15, actor 25, client 3, orcad 7, unavailable 42.
- `orca-browser-entry-points` PASS: cross-lane clauses SKIP ("lane p66-01 not merged"); served prefix compared.
- `orca-browser-entry-points-self-test` PASS: 11 plants plus the cross-lane SKIP case.
- `orca-pane-routes` PASS; `theia-build-order`, `gui04-registry-shape`, `orca-editor-routes` PASS; `verify-registry-shape.mjs` PASS; `diff-theia-core` PASS (full, after the re-install).
- `node scripts/verify-web-tab-bridge.mjs` reports exactly the two expected cross-lane lines:
  - `kinds: the frontend sends kinds chrome has no case arm for: webTabAgent, webTabAgentStop`
  - `push-kinds: the frontend subscribes to kinds chrome never pushes: agentControlChanged`
- Acceptance greps: `kind: 'webTabAgent'` appears once in the frontend module; `agent?: boolean` appears once, inside `WebTabOptions`; `onPush('agentControlChanged'` appears once; `^    agentStop(` appears once. No orca-browser or orca-panes file imports `components/browser-pane/`.
- `--quick` in the lane: 63 red rows.
  - Caused by this lane, and expected:
    - `scan-brand-residue` and its self-test (brand rows below).
    - `gui02-web-tab-bridge` and its self-test (the two cross-lane lines).
    - `page-tools-reader-crash` and its self-test (`webTabAgent` and `webTabAgentStop` are WebTabMessage members with no case arm in the shell; these clear when p66-03 adds the arms).
    - `orca-pane-routes-self-test` (see the merge note).
  - Environment only: `orca-mobile-skew-self-test` (`zod` unresolvable: no `orca/node_modules` in this lane). Every other red row reports `upstream/` absent ("broken instrument", `ENOENT upstream/...`) and reads no file this lane touched.

## Coordinator proof commands

After merging p66-01, then p66-02, then p66-03:
1. `scripts/verify-platform.sh --only orca-browser-abilities`: the PASS line must end "chrome AGENT_METHODS compared", not SKIP. Then run `--only orca-browser-abilities-self-test`.
2. `scripts/verify-platform.sh --only orca-browser-entry-points`: the PASS line must end "cross-lane clauses compared", not SKIP. Then run `--only orca-browser-entry-points-self-test`.
3. `scripts/verify-platform.sh --only gui02-web-tab-bridge` and `--only page-tools-reader-crash`: both must be green once p66-03's arms and classification land.
4. `nix develop .#theia --command bash -c 'cd theia && yarn install --ignore-scripts --frozen-lockfile && (cd node_modules/drivelist && node-gyp rebuild) && yarn build'`, then `git diff --exit-code theia/yarn.lock`, `nix develop .#theia --command bash scripts/diff-theia-core.sh`, `node scripts/verify-registry-shape.mjs`, and `--only orca-pane-routes`, `--only theia-build-order`.

## Merge note for the coordinator

- Merge by `refs/heads/ServerDestroyer/p66-02`, second, after p66-01. Lane p66-05 builds on this branch.
- Registry: this lane adds quick rows only (`orca-browser-abilities`, `orca-browser-entry-points`, each with `-self-test`). They sit in one `# NEW (66-02, ...)` block immediately before `"allowlist-schema|check_allowlist_schema"`, and go second at that anchor. There is no full-tier block.
- **orca-pane-routes-self-test goes red on this branch.** Three of its plants (`unknown-target`, `pending-without-requirement`, `target-without-observer-branch`) anchor on the retired `'browser': { target: 'pending', requirement: 'BRW-02' }` row. `scripts/verify-orca-pane-routes.mjs` is outside this lane's files, so it was not edited.
  - A tested patch is at `/home/chris/orca/workspaces/Power-Browser/p66-02/.mozbuild/p66-02/verify-orca-pane-routes.plants.patch` (ignored path). With it applied, the self-test passes 24/24.
  - The two route plants anchor on `'browser': { target: 'pb-web-tab' }`. The third removes the observer's branch with `s.replaceAll(".target === 'pb-web-tab'", ".kind === 'pb-web-tab'")` on `REL.observer`.
  - 66-06 merge rule (6) requires `orca-pane-routes-self-test` green after the p66-02 merge, so the coordinator applies that patch at the merge.
- The observer's Phase 64 pending log line changed from `route?.target === 'pending' ? ...` to `route && 'requirement' in route ? ...`. With no pending row left, the `'pending'` literal would make clause (e) red ("observer branches on target pending that no table row uses"). The log text is unchanged, and no Phase 65 line was touched.
- Host bundle outcome shape: this lane passes `{ status: 'completed', result? }` or `{ status: 'failed', errorCode }` to `session.commandResult`, as the host bundle interface states. Orca's `BrowserClientAutomationResult` names the completed payload `value`, so lane p66-01's `commandResult` must map `result` to `value`. Check it at the merge.
- No WINDOWS.md ids are opened or closed. inventory/brand-tokens.json is not edited.
- Brand rows needed. The report is at `.mozbuild/p66-02/brand-report.md` in the lane worktree, scanned with every lane file staged. Condition-4 failures by file (lower/title/upper):
  - `scripts/verify-orca-browser-abilities.mjs` 48/5/4
  - `scripts/verify-orca-browser-entry-points.mjs` 61/4/6
  - `theia/extensions/orca-browser/package.json` 2/0/0
  - `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts` 16/16/2
  - `theia/extensions/orca-browser/src/common/orca-browser-abilities.ts` 56/6/2
  - `theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts` 6/5/0
  - `theia/extensions/tab-uris/src/browser/web-tab.ts` 3/8/0

  Held-back coincidental rows move: Orca 2108 to 2115, orca 4199 to 4218, ORCA 846 to 847 (the orca-panes, package.json and registry edits). The total is 250 condition-4 failures plus 3 held-back count mismatches, 253. The coordinator re-measures on the staged merged tree.

## Deviations from Plan

**1. [Rule 1 - Correctness] Parked box from the tab bar's shown widget**
- Found during: Task 2 (3).
- Issue: the plan names "its parent stacked panel's node rect". In Lumino 2.7.5, a DockPanel's widgets have the dock itself as parent, and `TabLayoutNode.update` lays out only the current widget of each area, so no per-area panel exists.
- Fix: `WebTabWidget.tabAreaBox()` finds the tab bar whose titles hold this widget's title and uses the shown widget's rect. Outside a dock it falls back to the dock's rect. Other widgets are unchanged.

**2. [Rule 2 - Correctness] `wasDropped` on the page table**
- Found during: Task 1.
- Issue: the plan requires both of these: "a closePage for an id already dropped by a user close answers completed (A7)", and every command for an unbound id answers `browser_tab_not_found`. The fixed table interface cannot tell those two cases apart.
- Fix: the table records dropped ids, and `wasDropped(pageId)` is an added member. The fixed names are unchanged.

**3. [Rule 3 - Blocking] Observer pending log without a `'pending'` literal** (see the merge note). This was needed for `orca-pane-routes` clause (e) to stay green.

**4. [Rule 3 - Blocking] Audited install re-run** after adding the workspace package (Task 1) and the orca-panes dependency (Task 2). `yarn check --integrity` reported "Top level patterns don't match" both times, as in 64-02. `theia/yarn.lock` is unchanged.

**5. [Rule 1] createWidget's agent parameter is named `asAgent`.** This keeps `agent?: boolean` to one line, inside `WebTabOptions`, as the acceptance grep requires.

## Not done in this lane, recorded

- No live run, because the plan has none for this lane. The attach path, placement, reveal and parking are proven only by the trace and the build. Lane p66-05's `orca-browser-agent-live` and `orca-agent-mark-live` prove them live.
- The host does not re-attach after `onDetached` (for example, when orcad restarts). It logs the code and restores the placement to `{ kind: 'server' }`. A later plan could add re-attach.
- `orca-pane-routes-self-test`: the coordinator patch above.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register:
- T-66-05: page table, unbound refusal, no adoption; trace plants.
- T-66-06: `agent` is set only through `openAgentTab` and sent on the first `webTabOpen` only.
- T-66-07: stale agent tabs are closed before attach.
- T-66-08: `openAgentTab` never activates, and reveal follows the P66-09 rule.

## Self-Check: PASSED

- Every `files_modified` path is present. The lane diff against the merge base holds only `files_modified` paths and this SUMMARY.
- Commits 9a0225b7 and 36ad5a01 are ancestors of HEAD.
