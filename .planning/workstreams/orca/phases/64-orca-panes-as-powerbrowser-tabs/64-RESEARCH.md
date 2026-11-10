# Phase 64: Orca panes as PowerBrowser tabs - Research

**Researched:** 2026-11-10
**Domain:** Hosting Orca v1.4.248 renderer components in Theia 1.76 Lumino widgets (Route A), CSS isolation, observation of Orca's tab mirror, pairing hand-off
**Confidence:** HIGH for the measured items (mounts, CLI gap, CSS, ESM build, session-only pairing); MEDIUM for source-only items (remote stream, PTY spawn call); LOW items are listed in the Assumptions Log

<user_constraints>
## User Constraints (from 64-CONTEXT.md)

### Locked Decisions (Claude's auto-mode picks P64-01..P64-29; Chris may override; research amendments are in "Context amendments" below)

### Which pane goes where (TAB-04, TAB-06, criterion 4)
- **P64-01 (Claude's pick): one route table, keyed by Orca's `TabContentType`, decides every pane.** `orca/src/shared/tab-types.ts:18-26` has 8 members at v1.4.248. The table is one exported constant in the new Theia extension (P64-08) and is the only place a content type is routed:

  | Content type | Route | Delivered by |
  |---|---|---|
  | `terminal`, local host | Theia terminal `o<n>` (already opened by Phase 63's bridge) | Phase 63; Phase 64 maps it |
  | `terminal`, remote host (`Tab.executionHostId` not local) | hosted pane: Orca's `TerminalPane` (P64-20) | Phase 64 |
  | `agent-session` (chat) | hosted pane: `NativeChatView` as `StructuredAgentSessionPaneOverlayLayer.tsx` mounts it | Phase 64 |
  | `simulator` | hosted pane: `EmulatorPane` (`components/emulator-pane/EmulatorPane.tsx`) | Phase 64 |
  | `conflict-review`, `check-details` | hosted pane: Orca's `EditorPanel` for that tab alone | Phase 64, subject to P64-03 |
  | `editor`, `diff` | Theia editor / diff editor | target pending, TAB-05 (Phase 65) |
  | `browser` | PB web tab | target pending, BRW-02 (Phase 66) |

  A route whose target belongs to a later phase opens nothing and logs one line naming the content type, never Orca's own component. Reason: the ROADMAP note under Phase 64 states that editor, diff and browser panes reach the dock through this phase's mapping while their targets come from TAB-05 and BRW-02; mounting Orca's editor or screencast pane meanwhile would contradict D-01.
- **P64-02 (Claude's pick): a local Orca terminal keeps its Phase 63 widget and its `terminal:o<n>` address; PB never mounts Orca's `TerminalPane` for a local terminal.** The join between an Orca terminal leaf and its `o<n>` widget is Orca's own pane key: orcad stamps `ORCA_PANE_KEY = makePaneKey(tabId, leafId)` into every spawn env (`orca/src/main/ipc/pty/spawn-pane-env.ts:56`, `orca/src/shared/stable-pane-id.ts:20`), the bridge already receives that env unchanged (P63-04), so the Theia backend reads that one name and adds `paneKey` to Phase 63's `OrcaTerminalEntry` (`63-02-PLAN.md` interfaces: `{ name, processId }` today). The value is an identifier, not a credential, and is still never logged. A spawn with no pane key (a CLI-created background handle, `spawn-pane-env.ts:47-54`) stays a stand-alone `o<n>` tab with no Orca row, as Phase 63 opens it. Reasons: one address per widget (`docs/URI-SCHEMES.md` general rule: exactly one form comes back out of the reverse lookup); not mounting `TerminalPane` removes the second xterm and ends P63-07's two-resizer limit.

### Gate before the plan is fixed (spike 004 condition 2)
- **P64-03 (Claude's pick): `/gsd-plan-phase 64` research runs the spike harness on every hosted type before any plan is written, and the result decides each type's route.** Using `.planning/spikes/004-orca-pane-hosting/` (`build-pb-entry.sh`, `measure.mjs --route standalone` and `--route a`, under the live lock), research mounts: the chat pane (`agent-session`), `EditorPanel` alone for `conflict-review` and `check-details` (the four in-body types were not tried, spike README Question 1), `EmulatorPane` with no device, and a remote `TerminalPane`. For each it records the providers the mount needs (the spike found the fourth one, `LinkRoutingPreferenceDialogProvider`, only when the first mount threw) and the 17-path import list it adds. A type that does not mount under Route A after two attempts moves to Route B' for that type only, and the route table records it. Research also answers P64-14 (portals), P64-17 (inlined assets), P64-22 (renderer-created terminal tabs) and P64-23 (the CLI gap). Reason: the VERDICT says the chat pane must be mounted "before the plan is fixed"; doing it in research keeps the lanes on a known route.

### The hosted widget (Route A)
- **P64-04 (Claude's pick): one Orca pane bundle per document, built by Orca's own Vite from a PB-added config, with one `mountPane` entry that switches on content type.** One bundle means one `useAppStore` instance shared by every pane, which the observation and the close (P64-10, P64-11) need. The bundle's global API is fixed in the plan's interfaces block, taken from the spike's `pb-pane-mount.tsx`: `bootstrap({ pairing })`, `mountPane(element, { kind, worktreeId, tabId }) -> unmount`, `subscribeTabs(callback) -> unsubscribe`, `closeTab(worktreeId, tabId)`, `state()`. The entry and the Vite config are overlay files (`orca-overlay/files/`, P62-09), compiled by Orca's toolchain, carrying the `pb-overlay:` marker literal (P62-20), so `orca-overlay-built` proves they were compiled. The output goes under `orca/out/web/assets/` with the rest of Orca's web output.
- **P64-05 (Claude's pick): `OrcaPaneWidget extends ReactWidget`; each widget owns a separate React root (`createRoot`) on Theia's React, created on first show and kept while hidden, unmounted on dispose.** This is the spike's measured shape (`mountPane` in `pb-pane-mount.tsx`: one root per pane on the same React). Keeping the root while the tab is hidden keeps chat scroll and composer state across tab and mode switches. The bundle boots once, at frontend start after orcad is ready, so that panes an agent opens are observed in every mode; the first-pane cost (112.4 MB, spike results) is paid once, later panes cost about 6 MB (third pane 6.1 MB). — **Reversibility:** cheap; a lazy boot on first Orca-mode entry is a one-line change, at the cost of not observing agent-opened panes before then.
- **P64-06 (Claude's pick): the bundle is served by the Theia backend, same origin as the Theia document and behind the token gate, never loaded from orcad's port.** A `BackendApplicationContribution` in the new extension serves the pane bundle directory (JS, CSS, fonts as files). The directory reaches the backend as a path through the `pty-bridge` directory file pattern (P63-03, P63-26), never a secret. Reasons: a script fetched from a loopback port that another process could bind (the RUN-06 "port taken" case) would run inside the authenticated Theia document; serving it from Theia also removes the one optional seam the spike named (`STATIC_WEB_ALLOWED_PATHS`, `orca/src/main/runtime/rpc/static-web-client-handler.ts:7`). The pane's own WebSocket to orcad stays cross-origin, which the spike measured as working on every route.
- **P64-07 (Claude's pick): the hosted client pairs with the offer orcad issued at its current start, handed over as a file, never in a URL, environment variable, log or user-visible text.** `OrcaService` already parses the ready line in memory and logs none of it (`powerbrowser/shell/OrcaService.sys.mjs:12-13`). It writes the offer to a 0600 file in the 0700 `pty-bridge` directory (the folder Phase 63's `OrcaService` change already creates); the Theia backend reads it and returns it to the frontend over Theia's authenticated JSON-RPC, and the bundle passes it to Orca's own `parseWebPairingInput` / `saveStoredWebRuntimeEnvironment` as the spike did (`pb-pane-mount.tsx:86-104`). Re-pairing after a relaunch with a new orcad is Phase 65 (TAB-08); containment checks over every sink are Phase 67 (RUN-07). The spike's owner item stands: Orca's renderer code runs in the authenticated Theia document and Orca stores the pairing in the Theia origin's storage (T-61-04, D-18 pass).

### React hand-off (spike 004 condition 3)
- **P64-08 (Claude's pick): one new extension `@powerbrowser/orca-panes` (`theia/extensions/orca-panes`) holds the React hand-off, the bundle loader, the widget, the route table, the observer, the opener and the backend file route; there is no separate hand-off extension.** The hand-off module imports `@theia/core/shared/react`, `@theia/core/shared/react-dom`, `@theia/core/shared/react-dom/client` and `@theia/core/shared/react/jsx-runtime` (all four exist in `theia/node_modules/@theia/core/shared/`) and stores them under one `Symbol.for(...)` key on `globalThis` before it loads the bundle; the bundle's Rolldown `intro` `require` reads that key (the spike's `vite.pb-lib.config.ts` mechanism, with the global renamed). This replaces the lane-build line appended to the generated `src-gen/frontend/index.js`. No Theia core file changes (`scripts/diff-theia-core.sh` stays green). Reason: only the loader consumes the hand-off, so a second package adds a dependency edge and no function.
- **P64-09 (Claude's pick): React identity is checked at build time and at run time.** `orca/package.json` pins `react` and `react-dom` at `~19.2.8`; Theia's installed React is 19.2.8. The entry check (P64-25) compares Orca's resolved React version (from Orca's lockfile) with Theia's installed one and goes red on a different major or minor, naming both; the bundle must contain no React of its own (the spike's `rendererPackageName` marker count with the two-copy control build). Reason: the weekly re-pin (D-26) can move Orca's React while Theia stays put, and a second React breaks hooks silently.

### Observation and close
- **P64-10 (Claude's pick): observation is read-only, from `useAppStore.subscribe` in the Theia document, diffing `unifiedTabsByWorktree`, `groupsByWorktree`, `layoutByWorktree` and the terminal leaf lists, as the spike's `subscribeTabs` does.** An opened tab creates (or for a local terminal, maps, P64-02) one widget; a closed tab disposes it; a label change updates the widget title (Orca's own label precedence: `customLabel`, then generated/AI-vault names, then `label`; for chat, Orca's `readStructuredChatTabName`). PB writes to Orca only two things: close requests (P64-11) and the active worktree selection the subscription needs (P64-23). It never writes tab order, group membership, layout or activation. Reason: D-15, the renderer owns Orca's layout and PB's dock owns the arrangement; the spike measured 91 ms from Orca-side open to `addWidget` against the one-second clock.
- **P64-11 (Claude's pick): a Lumino close is a request; the widget disposes only when the store drops the tab.** `OrcaPaneWidget.onCloseRequest` calls Orca's own per-type close, `createWorkspaceTabCloseCommands({ worktreeId, groupTabs }).closeItem(tabId)` (`orca/src/renderer/src/components/tab-group/workspace-tab-close-commands.ts`), which dispatches to `closeTerminalTab`, `closeUnifiedTab`, the browser close and the editor close with Orca's own running-agent confirmation. Orca's confirmation components (`RunningTerminalCloseDialog.tsx`, the `ConfirmationDialogProvider`) are mounted once in the bundle's hidden services root, so a cancel leaves the tab open. A close of an `o<n>` widget keeps Phase 63's behaviour (the PTY ends; the store drops the leaf). Reasons: the spike's close call (`closeTerminalTab(..., { force: true, skipRunningProcessConfirm: true })`) bypasses Orca's confirmation, which would end a running agent without the prompt Orca shows; one entry point covers every type.

### Splits and arrangement (criterion 2)
- **P64-12 (Claude's pick): Orca's splits are applied once, when a pane first appears; afterwards PB's dock owns the arrangement.** On first appearance the mapper finds the nearest existing Orca widget in the Orca layout tree (`TabGroupLayoutNode` for groups, the terminal tab's `TerminalPaneLayoutNode` for in-tab splits, `orca/src/shared/terminal-tab-types.ts`) and adds the widget with `ApplicationShell.addWidget(widget, { area: 'main', mode, ref })`: `split-right` or `split-bottom` from the split direction, `tab-after` for a sibling tab in the same Orca group. A pane with no Orca neighbour already open is added to the main area without a `ref`. Later Orca-side layout changes are not mirrored, and PB-side drags are never written back. Reasons: D-15 gives the arrangement to PB's dock; continuous mirroring would move a tab the user had just placed. Orca's tab bar and `TabGroupPanel` are never mounted (D-29), so no Orca tab chrome renders.
- **P64-13 (Claude's pick): every worktree's panes become tabs, not only the active worktree's.** A widget exists for every observed Orca pane; its React root mounts on first show (P64-05), so an unseen pane costs a Lumino widget and no render. The tab tooltip names the worktree. Reason: D-01, every Orca tab is a PB tab; hiding tabs of inactive worktrees would close and reopen PB tabs on every worktree switch, which breaks Organising rows and the main-area exemption contract (`theia/extensions/modes/src/browser/main-area-exemption.ts`: tabs never unmount on a mode switch).

### CSS isolation (spike 004 condition 1, built first)
- **P64-14 (Claude's pick): scope Orca's stylesheet in PB's build step by selector prefixing, with `:root`, `html` and `body` mapped to the pane root; Radix portals are the scoped exception.** A PostCSS step in the PB Vite config (PostCSS is in Orca's `node_modules`) prefixes every selector with the pane-root attribute and rewrites `:root`/`html`/`body` to it, so Orca's custom properties, Tailwind preflight and fonts apply only inside a pane. Orca's dialogs, menus, tooltips and popovers portal to `document.body` through Radix (`orca/src/renderer/src/components/ui/{dialog,tooltip,dropdown-menu,popover,...}.tsx`); the scope list therefore also matches body-level Radix portal nodes (`[data-radix-popper-content-wrapper]`, the `data-slot="*-portal"` wrappers Orca's shadcn components pass). Theia 1.76 ships no Radix (`theia/node_modules` has no `@radix-ui`), which research re-confirms by check. The extra attribute in every Orca selector raises its specificity over Theia's element-level rules, which is the inbound half; any pane value still changed gets a reset block at the pane root. A shadow root (assumption A5) is not pursued: portals render to `document.body`, outside any shadow root, so Orca's dialogs would lose their styles. Exit test, unchanged from the VERDICT: the measure reports 0 changed Theia values and 0 changed pane values with both planted controls registering, plus a portal probe (an open Orca tooltip and dialog) added to the harness. — **Reversibility:** cheap until the lanes start; the shadow-root alternative changes only the build step and the widget host.
- **P64-15 (Claude's pick): the CSS lane builds and measures first; the Theia widget lane does not wait for it, but the coordinator does not merge the widget lane's live rows as green until the CSS live row is green on the merged tree.** Reason: condition 1 says "built first and measured with this harness"; the lane cut (P64-29) lets the CSS work run in parallel while keeping the order of proof.

### URI scheme (TAB-02, criterion 5)
- **P64-16 (Claude's pick): `pb-orca:<name>`, where the name is a short, lowercase, minted identity: a content-type word plus the lowest free index (`chat1`, `sim1`, `conflicts1`, `checks1`, `remote1`).** The Orca tab id (a UUID, `Tab.id` in `tab-types.ts`) and worktree id live in the widget's construction options, never in the address (`docs/URI-SCHEMES.md` general rules: the path is identity only, no uuid; non-user-chosen discriminators stay in options). The name is stored in the options and replays on layout restore, exactly as `t<n>`/`o<n>` do. An empty path (`pb-orca:`) focuses the most recently active hosted Orca tab and creates nothing when none exists; a stale name opens nothing and logs one line (the `o<n>` rule of P63-06). Local terminals keep `terminal:o<n>` (P64-02); editor, diff and browser panes take their target's address in Phases 65 and 66.
- **P64-17 (Claude's pick): the reverse lookup is a pure helper in a new tab-uris file, called from one new branch inside `TabUriRegistry.uriOf`; the registry's exported shape does not change.** `theia/extensions/tab-uris/src/browser/orca-scheme-coverage.ts` exports the pane factory id and `orcaPaneUriOf(factoryId, options)`, the same pattern as `extensionDetailUriOf`/`webviewUriOf` in `existing-scheme-coverage.ts`. `@powerbrowser/orca-panes` imports the factory id from tab-uris, the direction Phase 63 already uses for `ORCA_TERMINAL_NAME_PATTERN` (the reverse import would be a cycle). `scripts/verify-registry-shape.mjs` compares only `tab-uri-registry.ts` and `view-factory-table.ts` exports and `TabUriRegistry`'s public members, so it stays green with no edit. The `pb-orca:` opener is a bare `OpenHandler` in orca-panes (`canHandle` on scheme alone, priority 1000, as `ViewUriOpenHandler` does). Reason: Organising rows (`tabKeyOf`, `theia/extensions/modes/src/browser/group-model.ts:124`) and Setups capture (`setups-service.ts:917`) both key on `uriOf`; without the branch a hosted tab becomes `widget:<id>` in Organising and is skipped by Setups.

### Moving between modes and organising (TAB-01, criterion 1 and 2)
- **P64-18 (Claude's pick): the Orca mode is a fourth shipped descriptor appended to `SHIPPED_MODES` (`id: 'orca'`, `label: 'Orca'`), with a `SHIPPED_MODE_RULES` row `{ left: 'closed', right: 'closed', bottom: 'closed', furniture: true, organising: false, views: empty }` and `'Orca'` appended to the chrome bar's `MODES` literal; no `onActivate` hook.** Order is appended, never reordered (`mode-descriptors.ts:49`). `scripts/verify-mode-toggle-commands.mjs` already derives descriptor order, ids, labels and rules and compares them with the chrome bar's literal and `SHIPPED_MODE_RULES`, so it covers criterion 1 statically with no new row. The Orca mode shows Orca's work because the main area is shared across modes (main-area exemption) and every Orca pane is a main-area tab; Phase 65 adds the Orca side panel to this descriptor's left area. Reason for no hook: the switch path is an allowlisted surface (`verify-mode-switch-tabs-invariant.mjs`), and a hook that activates or opens a tab on a mode switch would be a new shell mutation there; a mode switch must also never start an agent session or a PTY.
- **P64-19 (Claude's pick): the Orca mode wears the IDE dress in the chrome bar: `ideDress` becomes `modeId === 'coding' || modeId === 'orca'` in `applyStripHome` (`chrome-bar-widget.tsx:2083`).** With the browser dress, the strip is hidden outside Browsing (`:2089`) and the dock's home tab bar is hidden while unsplit (`:2128-2133`), so an unsplit Orca mode would show no tab list at all; the IDE dress keeps every dock tab bar, which Orca's splits need. The comment at `:2070-2076` states the rule: a future mode gets the browser shell "unless it asks for the IDE". Moving tabs between modes needs no new code: the main-area exemption keeps every main-area widget across switches. The existing live row `verify-mode-switch-tabs-live.mjs` derives its hops from the shipped modes, so the Orca mode is measured once the descriptor exists; its seed set gains one hosted `pb-orca:` tab and one `o<n>` tab (P64-27).

### Remote panes (P63-24)
- **P64-20 (Claude's pick): a terminal tab on a non-local execution host is a hosted pane that mounts Orca's own `TerminalPane`, the component spike 004 mounted and measured.** It streams through Orca's remote transport in the hosted client (`components/terminal-pane/remote-runtime-pty-transport.ts`), so the Theia backend holds no new credential (P63-24's option (a)). Its address is `pb-orca:remote<n>`. TERM-04's key policy applies to it: orca-panes registers the same six `PASSTHROUGH_PSEUDO_COMMAND` rows with a `when` clause on its own context key, true while a hosted terminal pane has focus (Theia's `terminalFocus` is set only by Theia terminal widgets), and `scripts/verify-orca-terminal-keys.mjs` is extended to derive and compare the rows of both extensions. The live proof uses P63-24's harness: a second PB-run orcad added through `environment add`, a terminal created with `--environment`, which must show as a `pb-orca:remote<n>` tab and echo typed input. Whether the hosted client paired only with PB's orcad receives that stream is unproven; research answers it before the plan (P64-03). If it does not, P63-24's owner item reopens with options (b) and (c), and this phase records TERM-03's display as not delivered rather than adding a credential holder.

### The two open terminal questions
- **P64-21 (Claude's pick): PB-initiated Orca panes are created only through Orca's own actions; two Theia commands, "New Orca Chat" and "New Orca Terminal", are the user's way to open a pane until Phase 65 brings Orca's sidebar.** "New Orca Chat" calls the store action Orca's own new-chat path uses for the active Orca worktree (named by research). "New Orca Terminal" uses the runtime `terminal.create` RPC (the CLI's path, host-spawned), so Phase 63's bridge opens the `o<n>` tab and P64-02 joins it to the store row. They are command-palette entries only: no toolbar button, no tab-strip change, no Add-project control (D-18). Command labels follow the copy rule (product named, no internal identifier). Reason: criterion 2 says "opened by the user or an agent", and Orca's tab bar, the only Orca creation surface inside a pane, is not rendered (D-29).
- **P64-22 (Claude's pick, unsure): a renderer-created terminal tab that has no PTY is spawned by the same host path, not by mounting `TerminalPane`.** In Orca the renderer spawns a terminal's PTY when `TerminalPane` connects (`components/terminal-pane/ipc-pty-connect.ts` → `ipc-pty-spawn-request.ts:99`, `window.api.pty.spawn`). PB never mounts it for local terminals (P64-02), so a terminal tab created inside a hosted view (for example, by an agent-session action) could exist with no PTY. Research determines whether such tabs occur in the web build and, if so, which host call spawns for an existing tab; the mapper then issues it once per leaf. If no host call exists, the fallback is to call Orca's connect function from the mapper without rendering, recorded as a research outcome.
- **P64-23 (Claude's pick): diagnose the spike's CLI gap before planning, starting from Orca's subscription scope.** Spike 004 measured that `orca terminal create` became a tab in Route B' runs (165-209 ms) and not within 10 s in Routes A and B, undiagnosed. The pinned web client subscribes to `session.tabs.subscribe` for the active worktree only (`runtime/web-session-tabs-sync/active-session-subscription.ts:226-227`), with a global `session.tabs.subscribeAll` for inventory (`global-session-subscription.ts:142`) and warm subscriptions for other worktrees (`warm-worktree-subscriptions.ts`); the spike page set an active worktree itself because "a pane page has no sidebar to activate one" (`pb-pane-mount.tsx`, `waitForTerminal`). Hypotheses in order: (h1) the CLI's worktree was not the page's active worktree; (h2) a CLI terminal is a background handle until a client subscribed to its worktree adopts it; (h3) timing. For local terminals the gap no longer blocks TAB-04: every PTY spawn becomes an `o<n>` tab through Phase 63's bridge regardless of the store. It matters for CLI- and agent-created chat panes. The fix follows the diagnosis: PB sets the store's active worktree when an Orca tab is activated in PB and at boot restores Orca's own persisted active worktree; if (h1) holds, PB also keeps warm subscriptions for every worktree that has an open Orca tab. The live row requires a CLI- or agent-created chat pane to become a tab within 1 s (P64-27).

### Seams and overlay
- **P64-24 (Claude's pick): zero new seam patches.** The pane entry, the Vite config and the PostCSS step are PB-added overlay files compiled by Orca's toolchain through `--config` (spike 004: 0 tracked edits, A1); the bundle is served by Theia (P64-06), so `STATIC_WEB_ALLOWED_PATHS` stays untouched. The overlay keeps 3 of 10 seams (010 from Phase 62, 020 and 030 from Phase 63; 070 and 080 are planned in Phase 68). `orca-overlay` and `orca-overlay-built` stay green with the new files. — **Coordinator note:** P68-19 expects a "web-entry" class row from Phase 64; with no seam there is no `seams.json` row to classify (see Corrections).

### Checks (one registry, derive and compare)
- **P64-25 (Claude's pick): every check is one row plus a `-self-test` row in `scripts/verify-platform.sh`, expectations derived from the pinned Orca source or the tree and compared as sets.** Quick rows print a named SKIP and exit 0 when `orca/` or the build they read is absent (P62-10). Live rows run under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with caches purged. New rows:
  - `orca-pane-routes` and its self-test (quick, criterion 4): parse `orca/src/shared/tab-types.ts` with `theia/node_modules/typescript` (P63-27's parser rule; named SKIP when absent) to derive the `TabContentType` members; compare as a set with the route table's keys, and require every route value to be one of the four target kinds (Theia terminal, Theia editor, PB web tab, hosted pane) or a "pending" value naming its delivering requirement. It also compares the `pb-orca:` name words in the route table with the words documented in `docs/URI-SCHEMES.md`'s `pb-orca:` section. Plants: an added content type, a removed one, an unknown target kind, a pending route with no requirement id, a name word missing from the doc, and a parse yielding zero members ("source moved").
  - `orca-pane-entry` and its self-test (full, needs the Orca build): productises spike `build-pb-entry.sh` as `scripts/build-orca-panes.sh` called from `scripts/build-orca.sh`. Clauses: `git -C orca status --porcelain` lists no tracked change after the build (A1); the bundle's React marker count is 0 with the two-copy control build at 1 or more (A4); Orca's resolved React major.minor equals Theia's installed React (P64-09); no file that Orca's own `build:web` emits as an asset (fonts, wasm, images, derived from `out/web/assets/`) is inlined into the pane bundle as a `data:` URL (condition 3, the 42 MB bundle); the entry's own import specifiers reach no module under `components/tab-bar/` or `components/tab-group/TabGroupPanel` (D-29). A moved import path fails the build step itself, which is the re-pin signal (condition 4). Plants: a tracked edit, a planted React copy, a version skew, an inlined font, a tab-bar import.
  - `orca-pane-standalone-live` (live): mounts each hosted type through the standalone page as the spike's `--route standalone` did; a mount that throws (for example, a newly required provider) goes red naming the type and the thrown message. This is the second re-pin gate (condition 4); Phase 68's re-pin job runs this row and `orca-pane-entry` (coordinator note).
  - `orca-pane-css-live` and its self-test (live): the spike's CSS measure against the real orca-panes widget: Theia computed values changed = 0, pane values changed = 0, portal probe changed = 0, both planted controls registering (the control proves the counter before an absence is judged, CLAUDE.md verification rule 1). Self-test feeds fixture measurements: control green, then a nonzero count in each direction, a control that did not register, and an unmeasured value written as zero ("measured:false" must stay red, spike "What to Avoid").
  - `orca-tabs-live` (live, criteria 2 and 3): a chat pane opened through "New Orca Chat" and one created by the CLI or an agent each become exactly one tab within 1 s (clock stops at `addWidget`, spike Investigation 8); each appears as an Organising row keyed `pb-orca:<name>`; an Orca in-tab terminal split produces two `o<n>` widgets in two Lumino tab bars split in the recorded direction; no Orca tab-bar or tab-group DOM exists in the Theia document (selectors derived from Orca's tab-bar component source at check time); a Lumino close of a hosted chat whose agent is busy shows Orca's confirmation and a cancel keeps both the tab and the store row; an Orca-side close disposes the widget; the remote terminal of P64-20 shows and echoes.
  - Extended, not new: `verify-uri-roundtrip.mjs` gains `pb-orca` rows (`--scheme pb-orca`: `uriOf(widget).toString(true)` equals the input and the factory holds exactly one widget, D-53), including the empty-path and stale-name behaviours; `verify-mode-switch-tabs-live.mjs` gains the two seed tabs (P64-19); `verify-orca-terminal-keys.mjs` covers orca-panes' passthrough rows (P64-20); `verify-orca-pty-bridge.mjs` gains a `paneKey` clause (P64-02); `verify-mode-toggle-commands.mjs` and `gui04-registry-shape` run unchanged and must stay green.
- **P64-26 (Claude's pick): no new user-facing copy beyond the two command labels, Orca's own tab titles and Orca's own components.** A hosted pane that is waiting for the store or whose tab vanished shows nothing PB-authored; failure states are log lines and diagnostics rows until Phase 67's page (P62-13's rule continues). `shell-error-copy-no-internals` stays unchanged.
- **P64-27 (Claude's pick): the measured second-visit protocol is reused, not rewritten.** The Orca seed tabs ride in `verify-mode-switch-tabs-live.mjs`'s existing hop sequence, so "dragged to any other mode and back" is proven by the same set-equality assertion over the main-area widget ids that already guards Coding, Browsing and Organising.

### Restore boundary with Phase 65
- **P64-28 (Claude's pick): Phase 64 delivers restore within one orcad lifetime; Phase 65 delivers restore across a relaunch.** Within a session, Theia's own layout restorer recreates an `OrcaPaneWidget` from its stored options (name, worktree id, Orca tab id) after a frontend reload; the widget shows Orca's waiting state until the store hydrates and disposes itself if the tab is gone, and the `pb-orca:` opener resolves a Setups entry only while the Orca tab exists. Re-pairing with a new orcad after a relaunch, reopening Setups' Orca tabs in their modes and splits, and the offer scan of the stored Setup are TAB-08 (Phase 65). Reason: D-07 ends PTYs on quit, so a relaunch restore needs Phase 65's new-session work, while a frontend reload keeps orcad and its tabs alive.

### Mechanics and lane cut
- **P64-29 (Claude's pick): three wave-1 lanes with disjoint files, then a coordinator plan; the research gate (P64-03) runs first, inside plan-phase.**
  - **p64-01 (Orca side: bundle and CSS):** `orca-overlay/files/**` (pane entry, the PB Vite config, the PostCSS scoping step), `scripts/build-orca-panes.sh` and its call in `scripts/build-orca.sh`, `scripts/verify-orca-pane-entry.mjs`, `scripts/verify-orca-pane-css-live.mjs`, `scripts/verify-orca-pane-standalone-live.mjs`, the productised harness under `scripts/lib/` (from the spike's `measure.mjs` and `page-routes.mjs`), and its own `# NEW (64-01, …)` registry blocks. It measures CSS with the spike's lane-build React hand-off until p64-02 merges; the coordinator re-runs the row on the real extension.
  - **p64-02 (Theia side):** `theia/extensions/orca-panes/**` (hand-off, loader, widget, route table, observer and mapper, split placement, close, `pb-orca:` opener and name minting, the two commands, the hosted-terminal key rows, the backend file route and offer RPC), `theia/extensions/tab-uris/src/browser/orca-scheme-coverage.ts` and the one `uriOf` branch in `tab-uri-registry.ts`, the `paneKey` addition in `theia/extensions/orca-terminals` (protocol, core, entry), `docs/URI-SCHEMES.md` (`pb-orca:` section), `theia/package.json` and `theia/applications/browser/package.json` for orca-panes, `scripts/verify-orca-pane-routes.mjs`, `scripts/verify-orca-tabs-live.mjs`, the extensions to `verify-uri-roundtrip.mjs`, `verify-orca-terminal-keys.mjs` and `verify-orca-pty-bridge.mjs`, and its registry blocks.
  - **p64-03 (modes and chrome):** `theia/extensions/modes/src/browser/mode-descriptors.ts`, `mode-service.ts` (`SHIPPED_MODE_RULES` row), `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` (`MODES` literal and `ideDress`), `powerbrowser/shell/OrcaService.sys.mjs` and `OrcaEnv.sys.mjs` (the offer file and the bundle-directory file in the `pty-bridge` directory), the seed extension of `verify-mode-switch-tabs-live.mjs`, and its registry blocks.
  - **p64-04 (coordinator):** merges 01, 02 and 03 in that order, each by `refs/heads/<branch>`; rebuilds Orca (the pane bundle), Theia (audited install, new workspace package) and PowerBrowser (chrome JS edits need `-purgecaches`; no new chrome file, so no `jar.mn` change); re-runs `orca-pane-css-live` on the merged tree before any other live row is judged (P64-15); runs the live rows; re-measures brand rows; updates tracking; records the Deferred Verification table.

  The expected conflicts are textual: the lanes' registry blocks and the Theia `package.json`/`yarn.lock` lines. Only the coordinator edits `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md` tracking, `WINDOWS.md` and `inventory/brand-tokens.json`; nobody edits the ledger. Lanes stage their files and record their brand-scan report for the coordinator. Lanes that build Theia use the audited install from `docs/BUILD.md` (59-CONTEXT D-07). Each lane runs in its own worktree. No human checks (D-18).

### Claude's Discretion

- File layout inside `orca-panes` and the overlay entry; the `Symbol.for` key text; the PostCSS step's implementation; the exact name words in P64-16; the bundle directory name under `out/web/assets/`; the harness layout under `scripts/lib/`; the widget's waiting-state rendering (Orca's own, P64-26).

### Deferred Ideas (OUT OF SCOPE)

- Theia editor and diff editor as targets, worktrees as workspace folders (TAB-05, Phase 65).
- Orca's sidebar, settings and orchestration panel in a side panel, and with it Orca's own create affordances (TAB-07, Phase 65); the two P64-21 commands may then be removed.
- Restore across a relaunch, re-pairing and the offer scan of a stored Setup (TAB-08, Phase 65).
- Browser panes as PB web tabs (BRW-02, Phase 66).
- An agent-status mark in the tab title (working, waiting, done): not built; Orca's own status renders inside the hosted chat.
- A terminal tab's chat view mode (`viewMode: 'chat'`, `NativeChatPaneCover` inside `TerminalPane`): not built for local terminals, because PB does not mount `TerminalPane` for them; a structured `agent-session` tab is the chat route.
- Packaging the pane bundle into the artifacts and adding `orca-pane-entry` and `orca-pane-standalone-live` to the weekly re-pin job (Phase 68, OVL-02).

### Owner decisions open (auto-mode picks Chris may override)
| Pick | What was decided | What an override changes |
|------|------------------|--------------------------|
| P64-05 | The hosted Orca client boots at frontend start (about 112 MB once) so agent-opened panes are observed in every mode | A lazy boot saves the memory until first use and misses panes opened before it |
| P64-07 | Orca's renderer runs in the authenticated Theia document and Orca stores its pairing in the Theia origin's storage (spike T-61-04) | Route B' (one PB web tab per pane, about 177 MB per pane) keeps Orca's code and pairing on orcad's origin |
| P64-18 | The Orca mode has no activation hook; it shows the shared main area and, from Phase 65, the Orca side panel | A hook that focuses the last Orca tab adds a shell mutation to the allowlisted switch path |
| P64-20 | Remote terminal display through the hosted client, no new credential holder; if the stream does not reach it, TERM-03 display is recorded as not delivered | Reopens P63-24 options (b) and (c) |

### Corrections for the coordinator
- P64-24: Phase 64 lands no seam, so P68-19's expected "web-entry" class row has nothing to classify. Phase 68 either offers the PB Vite config upstream as a documentation pull request or records the web-entry class as not needed under D-27.
- Route A shows no Orca landing page in PowerBrowser: Orca's app shell is never mounted in the Theia document, and INJ-01's actor is gated on the orcad origin. Phase 67's INJ-01 then applies only where an orcad-origin page is loaded (the Route B' fallback, or a user opening orcad's address in a web tab); its plan should state which.
- Phase 67's RUN-06 failure page for "each open Orca tab" renders inside `OrcaPaneWidget` under Route A, not as a separate web page.

### Deferred Verification (59-CONTEXT D-18)
| Item | Why deferred | Runs in |
|------|--------------|---------|
| The hosted chat pane looks and behaves like Orca's own chat (layout, fonts, dialogs, menus) | Computed-value counts prove isolation, not visual parity | End-of-milestone pass |
| Orca's running-agent close confirmation is readable and its buttons work in the Theia document | Visual and interaction check | Same |
| Owner item T-61-04 (P64-07) | Owner decision | Same |
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TAB-01 | An "Orca" mode appears beside Coding in `SHIPPED_MODES` and the chrome bar. | P64-18/P64-19 line references re-checked: `SHIPPED_MODES` at `mode-descriptors.ts:50`, `SHIPPED_MODE_RULES` at `mode-service.ts:112`, chrome-bar `MODES` at `chrome-bar-widget.tsx:394`, `ideDress` at `:2083`. Row `gui07-mode-toggle-commands` already derives and compares them. |
| TAB-02 | `pb-orca:` URIs follow `docs/URI-SCHEMES.md`, round-trip in `verify-uri-roundtrip.mjs`, and leave `TabUriRegistry`'s exported shape unchanged. | `uriOf` at `tab-uri-registry.ts:124`; helper pattern `extensionDetailUriOf`/`webviewUriOf` at `existing-scheme-coverage.ts:32`/`:49`; `tabKeyOf` at `group-model.ts:120`. Name words lose `remote` (amendment A1). |
| TAB-04 | One Orca pane equals one Lumino tab; moves between modes; Organising row; in-tab splits and groups flattened. | Measured: every hosted type mounts in its own widget and React root (Answer 1); observation via `useAppStore.subscribe` sees host-created tabs in 326-402 ms (Answer 2); the CLI gap and its no-seam fix (A4). |
| TAB-06 | Chat and the other Orca-only views each open as their own PowerBrowser tab. | Measured mounts of chat (`NativeChatView`), `EmulatorPane`, and `EditorPanel` for `conflict-review` and `check-details` under Route A with no new provider (Answer 1); remote terminal display is not deliverable through the hosted client (A1). |
</phase_requirements>

## Summary

Every Orca-only view the spike inventoried mounts under Route A. Research built a probe entry with Orca's own Vite (0 tracked Orca edits) and mounted it in PowerBrowser's headless dock under the live lock. Chat, `EmulatorPane`, `EditorPanel` for `conflict-review` and for `check-details`, and a local `TerminalPane` control each rendered in their own Lumino widget and their own React root on Theia's React 19.2.8. All used the spike's four providers, and none threw. No content type needs Route B'. One route cannot be built: the remote terminal (P64-20). A web client paired only with PowerBrowser's orcad stores one environment and stamps every mirrored tab `runtime:<that environment>`, and orcad has no paired-server relay, so remote terminals never reach it.

The spike's CLI gap is not caused by the active worktree. A CLI-created terminal became a tab in 368-402 ms with no active worktree set, and in 363 ms with one set. The gap starts after the hosting client creates a terminal through Orca's own renderer action `createNewTerminalTab`, which goes through `session.tabs.createTerminal`. From then on the host lists each new CLI terminal as a tab, but the client store does not apply it for at least 30 s. This holds with session persistence on or off, and re-selecting the worktree does not recover it. The spike's Routes A and B created their first terminals exactly that way; the B' observer never did. A terminal created from the same client through the host RPC `terminal.create` does not trigger the gap (next CLI terminal: 326 ms). The no-seam fix is therefore a rule: PowerBrowser never calls Orca's client-side terminal creation, and it creates terminals with `terminal.create`.

Two build findings change the plan's mechanics. Vite 8.3.5 inlines every asset in library mode, so the spike's 42 MB came from the build mode, not from Orca. An app-mode ES build of the same entry emits assets as files (890 files, a 344-byte entry module, about 230 KB still inlined, all under the default limit) and loads in 728 ms. It runs on one React through a virtual-module plugin that reads one `Symbol.for` key. The CSS scoping pass was measured against the spike harness: Theia computed property values changed 0, pane values changed 0 of 144 with the planted control registering 3. Two raw `<html>` attribute keys still differ, `class` gaining `light` and the inline `style` growing, both written by Orca's appearance hook. The exit test needs a ruling on those two keys (amendment A3).

**Primary recommendation:** Build the pane bundle as an app-mode ES build with a host-React virtual-module plugin and the PostCSS scoping pass. Serve it from Theia. Bootstrap it with a session-only pairing read from a 0600 file. Create Orca terminals only through `terminal.create`, never through Orca's renderer creation action.

### Research answers (one line each, evidence below)

1. **P64-03:** chat, `EmulatorPane`, `EditorPanel` (conflict-review, check-details) and a local `TerminalPane` all mount standalone under Route A with the four spike providers and 0 React errors. No Route B' is needed. A remote `TerminalPane` has no tab to mount, because the PowerBrowser-paired client never receives one (A1).
2. **P64-23:** the active-worktree hypothesis is refuted. The gap follows the client's own `createNewTerminalTab`. The fix is to create terminals only through `terminal.create` and never through Orca's renderer creation path (A4).
3. **P64-22:** the host call is `terminal.create` with `{ worktree: 'id:<worktreeId>', tabId, leafId, presentation: 'background' }`, the call Orca's web PTY transport makes. The web build has no local spawn (A5).
4. **P64-20:** no. The client stamps every tab with its single paired environment, and orcad relays no paired-server terminals. TERM-03 display is not delivered by the hosted client, and P63-24's owner item reopens (A1).
5. **P64-14:** a PostCSS pass over the emitted sheet scopes the stylesheet. The first measurement: Theia property values 0 changed, pane 0 of 144 changed (control 3), and 2 `<html>` attribute keys written by Orca's appearance hook (A3).
6. **P64-07:** `OrcaEnv`'s sink hands the offer to a one-shot callback. `OrcaService` writes `web-pairing` 0600 through Phase 63's `writePrivateFile` and the Theia backend returns it over JSON-RPC. The bundle saves it `sessionOnly`, which was measured to leave no credential in localStorage and to re-pair after a reload (A6).
7. **P64-08/P64-09:** the `Symbol.for` hand-off works (1 React, 19.2.8 on both sides). Use ESM virtual modules, not the iife intro, because iife `globals` cannot read an intro-local. Orca's `~19.2.8` resolves to 19.2.8, which equals Theia's 19.2.8 (A2).

## Context amendments

Each amendment says which pick it changes, why, and the evidence. Picks not listed stand as written.

**D-31 amendment (coordinator, 2026-11-10; owner ruling).** Orca terminals run on Orca's own engine and view, side by side with Theia terminals; Phase 63's bridge is dropped. Read A1 and A5 with this change: the `terminal` content type's one route is a hosted `TerminalPane` (the local `TerminalPane` control this research mounted, answer 1), not a Phase 63 `o<n>` tab; A5's host call is what the mounted `TerminalPane`'s transport issues, so the mapper issues none. A4's rule stands unchanged: PB creates terminals with `terminal.create` only, never with `createNewTerminalTab`. A1's finding stands and is now the recorded reason TERM-03 is v2. Every `pty-bridge` directory reference means lane p63-06's bridge folder. Picks: 64-CONTEXT P64-30..P64-36.

| # | Pick(s) | Amendment | Evidence |
|---|---------|-----------|----------|
| A1 | P64-01 (remote row), P64-16 (`remote<n>`), P64-20, P64-25 (`verify-orca-terminal-keys` extension, remote clause of `orca-tabs-live`) | **Drop the hosted remote-terminal route.** The `terminal` content type has one route, the Phase 63 Theia terminal `o<n>`. The `executionHostId`-not-local discriminator cannot work in the web client, because every tab carries `runtime:<paired env>`. The hosted-terminal passthrough key rows and the `remote` name word go. As P64-20 itself prescribes, TERM-03 display is recorded as not delivered by Phase 64, and P63-24's owner item reopens with options (b) and (c). | The web client stores one environment (`readStoredWebRuntimeEnvironment(): StoredWebRuntimeEnvironment \| null`, `web/web-runtime-environment.ts:39`). Every mirrored terminal tab gets `executionHostId: toRuntimeExecutionHostId(environmentId)` (`runtime/web-session-tabs-sync/tab-builders.ts:28`, also `:56`, `:91`). The relay is installed only by Electron main (`setMobileDesktopRelayHosts`, `main/startup/main-process-runtime-launch.ts:122`; defined `main/runtime/runtime-rpc/runtime-rpc-pairing.ts:94`). Measured: all 9 tabs of the probe client carried `runtime:<env>` (`results-p64-esm.json` `final.tabs`). [VERIFIED: source read + live probe] The claim that no remote stream reaches the client was not falsified live with a second orcad (Open Question 1). |
| A2 | P64-04 (bundle form), P64-08 (intro `require`), P64-25 (`orca-pane-entry` clauses), spike condition 3 | **Build the pane bundle in Vite app mode as ES output, not `build.lib` iife.** A PB plugin resolves `react`, `react-dom`, `react-dom/client` and `react/jsx-runtime` to virtual modules that read `globalThis[Symbol.for(KEY)]`, with named exports derived at build time from Theia's installed React. The loader imports the entry as a module and links the emitted stylesheet. The global API of P64-04 becomes the entry's named exports. | Vite `shouldInline`: `if (environment.config.build.lib) return true;` (`orca/node_modules/vite/dist/node/chunks/node.js:32812`, Vite 8.3.5). The lib probe bundle measured 50,741,945 bytes, with 56 data URLs in the JS and 69 in the CSS (about 28 MB inlined, including 18.9 MB of JSON, 3 MB of WebP and a 1.7 MB worker). The ESM build of the same entry: 344-byte entry module, 890 files, 0 React markers, inlined data about 230 KB (every inlined asset is under 4 KB except one 162 KB TTF). It loaded in 728 ms, fetched 132 files at boot, and passed the identity check (`useState` identical, 19.2.8 on both sides). The iife form failed when its `globals` named the intro-local (`'defined no PbPane global'`): the iife arguments are evaluated outside the wrapper. [VERIFIED: probe build `build-probe.sh` + live `probe-64.mjs --bundle esm`] |
| A3 | P64-14, VERDICT exit test, P64-25 `orca-pane-css-live` | **The scoping method is fixed by measurement** (pattern below). (a) Radix portals have no `data-slot="*-portal"` wrapper, so the portal roots are `body > [data-radix-popper-content-wrapper]` and `body > [data-slot]`, and each selector also gets a portal-self variant. (b) The scope attribute goes on the widget's host node, not on the React root, and that node gets `font-size: medium !important`. (c) Custom properties declared by root and theme rules stay on `:root`, because Orca's appearance code writes theme tokens to `<html>`'s inline style and a scoped copy would shadow them. (d) Orca's keyframes are renamed, because `spin` is defined by both stylesheets. **Exit-test ruling needed:** 0 Theia property values and 0 pane values were measured, but `html\|class` (+`light`) and `html\|style-attribute-length` (+108 characters) still differ. Both are writes by Orca's `useDocumentAppearance`. Recommended: keep "0 changed" strict for every element property value, and replace the two `<html>` attribute keys with a derived clause. That clause takes the class names and custom-property names Orca writes and requires that no Theia rule's selector reads those classes and no Theia declaration reads those properties. | Radix `DialogPortal` renders `PortalPrimitive asChild` (`@radix-ui/react-dialog/dist/index.mjs:84-88`), and the popper wrapper is `"data-radix-popper-content-wrapper"` (`@radix-ui/react-popper/dist/index.mjs:200`). Theia's bundle contains 0 `data-slot` and 0 popper wrappers, and `theia/node_modules` has 0 Radix entries. The keyframe intersection of Theia's `bundle.css` and Orca's sheet is `spin`. There is no `@font-face` family overlap, and Theia uses 0 `--tw-` properties. Measurement history: unscoped 84 out / 24 in; prefix only 2 out / 21 in; widget-node root 2 / 17; with the `!important` reset 2 out / **0 in**, control 3 (`results-p64-css-layered-2.json`, `-3.json`). [VERIFIED: live measure] |
| A4 | P64-23, P64-21, P64-27 | **The CLI gap is caused by the client's own `createNewTerminalTab`.** Rule: `@powerbrowser/orca-panes` never imports `createNewTerminalTab`, `createWebRuntimeSessionTerminal` or any path that issues `session.tabs.createTerminal`. "New Orca Terminal" uses `terminal.create`, as P64-21 already says. Setting the active worktree and keeping warm subscriptions are not needed for observation. Setting the active worktree when an Orca pane is activated is still recommended, for git-status polling (A8). The P64-27 live row cannot use "a chat created by the CLI": the pinned CLI has no structured-chat command (no `agentSession.create` under `orca/src/cli`). Use a chat created by a second paired client or by an agent, and re-run the CLI-terminal clause after a PB-created chat (Open Question 3). | Live runs (`results-p64-esm.json`, `-cli.json`, `-cli-nopersist.json`): T1, no active worktree: tab in 402, 360, 397 and 368 ms. T2, active set: 363 ms. T3a, after a client-issued `terminal.create`: 326 ms. T3/T3b, after `createNewTerminalTab`: miss in 8 s and in 30 s, with persistence on and off. T4/T5, with a web tab current and after it closed: miss. T6, after re-selecting the worktree: miss. Around T3, the host's `session.tabs.list` went from 2 to 3 tabs while the client stayed at 2. Every CLI handle was listed by `orca terminal list`. [VERIFIED: live probe] The internal mechanism in Orca's mirror is not identified [ASSUMED]. |
| A5 | P64-22 | **The premise is corrected.** In the web build the renderer never spawns locally: `window.api.pty.spawn` rejects with "Local PTYs are unavailable in the web client." A hosted terminal's PTY is created by the transport's `terminal.create` call, carrying the tab and leaf identity. For a leaf whose row has no terminal handle, the mapper issues that same call once per leaf from the Theia document: `terminal.create` with `{ worktree: 'id:<worktreeId>', tabId, leafId, presentation: 'background', clientMutationId }`. Phase 63's bridge then opens the `o<n>` tab. `TerminalPane` is never mounted. | `orca/src/renderer/src/web/preload-api/web-terminal-api.ts:9-11`; `components/terminal-pane/remote-runtime-pty-transport.ts:3509-3544` (`legacyCreateParams` with `tabId`, `leafId`, `presentation: 'background' as const`, then `'terminal.create'`); handler `main/runtime/rpc/methods/terminal/terminal-lifecycle-methods.ts:37`, with `tabId: params.tabId, leafId: params.leafId` at `:117-118` and `reopensPane` for runtime clients at `:121`. Tabs from Orca's host path are host-spawned: `createMobileSessionTerminal` returns `created.tab.terminal` (`main/runtime/terminal/launch/mobile-terminal-create.ts:95-160`). [VERIFIED: source] When a handle-less leaf actually occurs was not observed live [ASSUMED]. |
| A6 | P64-07, T-61-04, P64-28 | **Save the environment `sessionOnly`.** The bundle's bootstrap saves `{ ...createStoredWebRuntimeEnvironment(...), sessionOnly: true }`, so the device token stays in page memory. The offer file is re-read at every frontend start, which also gives P64-28 its reload path. `parseReadyLine` stays credential-free. A separate one-shot offer callback in `createOutputSink` feeds the writer, so the offer never enters `getState`, a log line or a diagnostics row. | `sessionOnly?: true` (`web-runtime-environment.ts:23`); in-memory `sessionEnvironment` (`:37`); `if (environment.sessionOnly) { sessionEnvironment = environment; window.localStorage.removeItem(...) }` (`:85-90`); credential storage `environment.sessionOnly ? 'session' : 'persisted'` (`web/preload-api/web-runtime-credentials.ts:50`). Measured (`results-p64-esm-reload.json`): after pairing, the localStorage keys include no `orca.web.runtimeEnvironment.v1`. After `location.reload()` (time origin moved 6.9 s), the same offer paired again, the store was ready, and a CLI terminal became a tab. Cost, also measured: each reload minted a new environment id (`web-5edc…` then `web-6109…`), which Orca's own comment says strands host-identity state (`web-runtime-environment.ts:147`) (Open Question 2). [VERIFIED: live probe] |
| A7 | P64-01 (`conflict-review` row), boundary with TAB-05 | **Keep `conflict-review` and `check-details` on the hosted `EditorPanel`** (both mounted), and **record the TAB-05 collision for Phase 65.** In conflict review, opening a conflicted file renders `MonacoEditor`, Orca's own editor, inside the pane. Phase 65 criterion 1 says Orca's own editor is never mounted. Phase 64 hosts the review; Phase 65 decides where a conflicted file opens. | `components/editor/EditorConflictReviewSurface.tsx:9` (`import { ImageViewer, MonacoEditor } from './editor-lazy-views'`); ROADMAP Phase 65 criterion 1. [VERIFIED: source] |
| A8 | P64-04/P64-05 (services root) | **Mount Orca's `ActiveWorkspaceSyncGate` in the hidden services root** in place of the spike's bare `useWebSessionTabsSync()`. It adds git-status polling and the editor external watch, without which the hosted conflict review shows stale state. Mounting the whole `AppBackgroundServices`, which adds title sync and the background-chat status and attention bridges, is recommended but was not mounted in research. | Measured: with `UU README.md` in the probe repo, the hosted conflict review read "All conflicts resolved ... no longer has any live unresolved conflicts" (`results-p64-esm.json` mount `conflict-review`). `useGitStatusPolling({ enabled: workspaceSessionReady })` lives only in `app-shell/ActiveWorkspaceSyncGate.tsx:13` and polls the store's `activeWorktreeId` (`components/right-sidebar/useGitStatusPolling.ts:45-48`). `AppBackgroundServices.tsx:17-44`. [VERIFIED: source + live]; the `AppBackgroundServices` mount is [ASSUMED] mountable. |
| A9 | P64-25 `orca-pane-css-live` harness | The spike harness's global-rule counter calls every scoped rule "global", because the first compound `:where(` has no class or id (measured: 6,336 of 6,336 rules counted global in the scoped sheet). It must be replaced for scoped sheets. The planted leak-in control must target a property that does not already differ: while the pane leaked, the `.xterm letter-spacing` control showed delta 0 and the run failed on the control, not on the leak. | `page-routes.mjs:467-482` (`isGlobal`) and `:596-601` (the control); runs `results-p64-css-layered-2.json` (control 0) and `-3.json` (control 3). [VERIFIED: live] |
| A10 | P64-17 (citation) | `tabKeyOf` is at `theia/extensions/modes/src/browser/group-model.ts:120` (context said `:124`). | [VERIFIED: grep] |

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core; `@theia/*` are dependencies; `scripts/diff-theia-core.sh` is the check. The React hand-off imports `@theia/core/shared/*` (all four paths exist: `shared/react`, `shared/react/jsx-runtime`, `shared/react-dom`, `shared/react-dom/client`).
- Never modify Gecko outside the patch stack; Firefox internals only through `PowerBrowserAPI.sys.mjs` with `INTERNAL-APIS.md` rows. `OrcaService` writes the offer file through Phase 63's catalogued `PowerBrowserProcesses.writePrivateFile`.
- Design for the bridge: `TabUriRegistry`'s exported shape stays (asserted by `scripts/verify-registry-shape.mjs`).
- The repo path has no space; builds run in `nix develop .#orca` / `.#theia`.
- Theia is the default GUI; no custom browser chrome is authored.
- The residual-brand scan must exit 0. Stage new files before trusting it, and spell the originating product only in `inventory/brand-tokens.json`.
- Patches are regenerated, never text-edited (Phase 64 adds none).
- One driver, one registry (`scripts/verify-platform.sh`). A new check is one row plus `-self-test`. Never assert an absence unless its detector is proven. Derive from the tree and compare as sets.
- No internal identifier in user-facing text. The only new copy is the two command labels.
- Builds in Nix dev shells. A full `./mach build` takes about 50 min; use `--quick` first. Chrome JS edits need `-purgecaches` (memory).
- Concurrent sessions: commit with explicit paths; no `-a`, no amend, no stash.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pane bundle build and CSS scoping | Orca toolchain (overlay files, `scripts/build-orca-panes.sh`) | — | Orca's own Vite compiles Orca's source; PB adds a config and a PostCSS pass, 0 tracked edits (A1 of spike). |
| Serving the bundle | Theia backend (`BackendApplicationContribution` in orca-panes, behind the token gate) | — | Same origin as the document; never loaded from orcad's port (P64-06). |
| Pairing offer capture | Chrome (`OrcaEnv` sink, `OrcaService`) | Theia backend (read file, JSON-RPC) | Only the chrome sees orcad's stdout; the backend is the only reader of the 0600 file; the frontend gets it over authenticated JSON-RPC. |
| React hand-off, loader, widgets, observer, mapper, close, opener | Theia frontend (`@powerbrowser/orca-panes`) | — | Runs in the Theia document; Route A. |
| Tab and layout state | orcad (host) mirrored into the renderer store | Theia frontend observes read-only | D-15; host owns tabs, PB's dock owns arrangement. |
| Terminal PTYs | orcad → Phase 63 bridge → Theia backend | — | `terminal.create` (A5); never `TerminalPane`. |
| `pb-orca:` reverse lookup | Theia frontend (`tab-uris`) | — | Registry shape unchanged (P64-17). |
| Mode descriptor and chrome-bar dress | Theia frontend (modes, chrome-bar) | — | P64-18/P64-19. |

## Standard Stack

### Core (all already in the trees; nothing is installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Orca's Vite | 8.3.5 (`orca/node_modules/vite`) | Builds the pane bundle through `--config` | Orca's own toolchain; Rolldown underneath. [VERIFIED: package.json read] |
| PostCSS | 8.5.30 (`orca/node_modules/postcss`) | The scoping pass in `generateBundle` | Already Orca's dependency; operates on Tailwind's final output. [VERIFIED] |
| React / react-dom | 19.2.8 in both `orca/` (`~19.2.8`, `orca/package.json:350,352`; lock `pnpm-lock.yaml:7045,7130`) and `theia/node_modules` | One React, Theia's | Identity check passed live. [VERIFIED] |
| `@theia/core/shared/react*` | Theia 1.76 | The hand-off source | The supported way to reach Theia's React from an extension. [VERIFIED: paths exist] |
| Orca renderer modules (by path) | v1.4.248 | Store, providers, `NativeChatView`, `EmulatorPane`, `EditorPanel`, `structured-agent-session-owner`, web bootstrap, `ActiveWorkspaceSyncGate`, `workspace-tab-close-commands` | The hosted components themselves. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ESM app build + virtual React modules | Spike lib iife + intro `require` | Lib mode inlines every asset (about 28 MB of data URLs); iife `globals` cannot read the `Symbol.for` key through an intro-local. Rejected (A2). |
| PostCSS prefix scoping | Shadow root (A5 of spike) | Radix portals render to `document.body`, outside any shadow root; not pursued (P64-14 stands). |
| Unlayering Orca's `@layer` blocks | Keeping layers | Measured 0 inbound with layers kept; unlayering is unnecessary (the `unlayerPlugin` in the probe stays unused). |

**Installation:** none. **Version verification:** versions above were read from the installed `package.json` files and the lockfile this session.

## Package Legitimacy Audit

No external package is installed by this phase. PostCSS, Vite and React are consumed from `orca/node_modules` and `theia/node_modules` as already locked; `@powerbrowser/orca-panes` is a new workspace package with no new third-party dependency.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none new) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none. **Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
 orcad stdout ──ready line──► OrcaEnv sink ──(3 non-secret fields)──► OrcaService state / diagnostics
                                   │
                                   └─(offer, one shot)──► writePrivateFile(<bridge dir>, web-pairing, 0600)
                                                                     │
 Theia backend (orca-panes) ◄── read on request, mode-checked ───────┘
   │  JSON-RPC (token-gated)                    static route /orca-panes/* (token-gated, same origin)
   ▼                                                          │
 Theia frontend: hand-off module sets globalThis[Symbol.for(KEY)] = Theia React
   │  import(entry.js) + <link> sheet  ◄───────────────────────┘
   ▼
 Orca pane bundle (ESM): bootstrap({ pairing, sessionOnly })
   │  hidden services root: providers + startup hooks + ActiveWorkspaceSyncGate
   │  WebSocket (cross-origin, E2EE) ◄──────► orcad: session.tabs.subscribe / subscribeAll
   ▼
 renderer store (useAppStore) ──subscribe (read-only diff)──► orca-panes observer
   │                                                             │
   │                                         route table (TabContentType → target)
   │             ┌───────────────────────────────┼───────────────────────────────┐
   │      terminal: join paneKey ↔ o<n>    agent-session / simulator /     editor, diff, browser:
   │      (Phase 63 widget; leaf without   conflict-review / check-details  log one line (TAB-05,
   │       handle → terminal.create)       → OrcaPaneWidget (own React root) BRW-02 pending)
   ▼                                                             ▼
 Lumino close request ──► createWorkspaceTabCloseCommands(...).closeItem(tabId) ──► store drops tab ──► widget disposes
 "New Orca Terminal" ──► terminal.create (host)      "New Orca Chat" ──► agentSession.create path (Open Question 3)
```

### Recommended Project Structure
```
orca-overlay/files/src/renderer/src/pb/          # pane entry (mountPane, subscribeTabs, closeTab, bootstrap, state)
orca-overlay/files/vite.pb-panes.config.ts       # app-mode ES build, host-React plugin, scoping pass
orca-overlay/files/pb-css-scope.mjs              # PostCSS plugin (testable from Node)
theia/extensions/orca-panes/src/browser/         # hand-off, loader, widget, route table, observer, mapper, opener, commands, keys
theia/extensions/orca-panes/src/node/            # static route, offer JSON-RPC
theia/extensions/tab-uris/src/browser/orca-scheme-coverage.ts
scripts/build-orca-panes.sh, scripts/verify-orca-pane-*.mjs, scripts/lib/orca-pane-harness.mjs
```
Orca's `vite.web.config.ts` sets `root: src/renderer`, so overlay files must land at paths that config resolves; the probe copied the config beside `vite.web.config.ts` and the entry under `src/renderer/src/pb/` (`build-probe.sh`).

### Pattern 1: host-React virtual modules (ESM, one hand-off key)
**What:** resolve the four React specifiers to virtual modules that read the hand-off key; derive the export list from the host's React at build time.
**Example (measured working):**
```ts
// Source: .planning/spikes/004-orca-pane-hosting/p64-probe/vite.pb-probe-esm.config.ts
const KEY = 'powerbrowser.orca-panes.react'
const MODULES = { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOMClient', 'react/jsx-runtime': 'jsxRuntime' }
resolveId(id) { return id in MODULES ? '\0pb-host-react:' + id : null },
load(id) {                                    // names from hostRequire(spec), i.e. Theia's node_modules
  return [`const host = globalThis[Symbol.for(${JSON.stringify(KEY)})];`,
          `if (!host) throw new Error('orca pane bundle: no React hand-off');`,
          `const m = host.${MODULES[spec]};`, `export default m;`,
          ...names.map((n) => `export const ${n} = m[${JSON.stringify(n)}];`)].join('\n')
}
// build: { rollupOptions: { input: { 'pb-probe': <entry> }, preserveEntrySignatures: 'exports-only',
//          output: { format: 'es', entryFileNames: '[name].js' } } }
```
Theia side (P64-08): `globalThis[Symbol.for(KEY)] = { React, ReactDOM, ReactDOMClient, jsxRuntime }` from `@theia/core/shared/react`, `.../react-dom`, `.../react-dom/client`, `.../react/jsx-runtime`, set before `import(entryUrl)`.

### Pattern 2: scope Orca's emitted sheet
```js
// Source: .planning/spikes/004-orca-pane-hosting/p64-probe/pb-css-scope.mjs (measured 0 in, 0 property values out)
// S = :where(<widget node attr>, body > [data-radix-popper-content-wrapper], body > [data-slot])
// html | :root | body | :host            -> S
// :root.dark / body[x] (qualified root)  -> <qualified root> S        (Orca's own <html>/<body> state)
// .dark / .light leading compound        -> .dark S ...
// X                                      -> S X, X:where(<portal roots>)   (pseudo-element kept last)
// @keyframes                             -> untouched by the prefixer; names must be prefixed (spin collides)
// root/theme rules: --custom-properties  -> stay on the original selector (unscoped)
// prepend: <widget node attr> { font-size: medium !important }  and  :where(<portal roots>) { font-size: medium }
```

### Pattern 3: session-only bootstrap
```ts
// Source: p64-probe/pb-probe-mount.tsx (measured: no localStorage credential; re-pair after reload)
const offer = parseWebPairingInput(pairing)              // orca/src/renderer/src/web/web-pairing.ts:26
const environment = createStoredWebRuntimeEnvironment({ name: 'Orca Server', offer, previousEnvironment: readStoredWebRuntimeEnvironment() })
saveStoredWebRuntimeEnvironment({ ...environment, sessionOnly: true })
installWebPreloadApi()
```

### Anti-Patterns to Avoid
- **Calling Orca's renderer creation actions** (`createNewTerminalTab`, anything reaching `session.tabs.createTerminal`) from PB: freezes the client's mirror of later host tabs (A4).
- **`build.lib` for the pane bundle:** inlines every asset (A2).
- **Mapping `:root` custom properties into the scope:** shadows Orca's runtime theme writes on `<html>`.
- **Scope attribute on the React root:** the pane root then differs from standalone (background, border, box-sizing measured); put it on the widget's host node.
- **Mounting `TerminalPane` to get a PTY:** the web build spawns through `terminal.create` anyway; call it directly (A5).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pairing parse and storage | A PB parser of the offer | `parseWebPairingInput`, `createStoredWebRuntimeEnvironment`, `saveStoredWebRuntimeEnvironment` with `sessionOnly` | E2EE keys, re-pair classification, device-key migration live there. |
| Tab close semantics | Per-type close calls | `createWorkspaceTabCloseCommands({ worktreeId, groupTabs }).closeItem(tabId)` (`components/tab-group/workspace-tab-close-commands.ts:14`) | Includes Orca's running-agent confirmation (P64-11). |
| Chat tab target resolution | Host lookup | `structuredAgentSessionOwnerForTab` + `structuredAgentSessionTargetForHost` (`runtime/structured-agent-session-owner.ts:65`, `:25`) | Measured working in the chat mount. |
| Simulator tab creation (tests) | Store writes | `ensureSimulatorTab(worktreeId, opts)` (`lib/ensure-simulator-tab.ts:97`) | Respects `mobileEmulatorEnabled`. |
| Background services | Picking hooks one by one | `ActiveWorkspaceSyncGate` (at least), `AppBackgroundServices` (recommended) | Git status, external watch, title and chat-status bridges (A8). |
| CSS selector rewriting | Regex over the sheet | PostCSS AST pass on the emitted asset | 906 `@supports`, 73 `@media`, 35 `@container`, 5 layers in the sheet. |

## Common Pitfalls

### Pitfall 1: the mirror freeze after a client-side terminal create
**What goes wrong:** CLI or agent terminals stop becoming tabs. **Why:** the client's own `createNewTerminalTab` (A4). **How to avoid:** never call it; `terminal.create` only; a static clause in `orca-pane-routes` that the orca-panes sources and the overlay entry import none of those modules. **Warning signs:** host `session.tabs.list` count > store count for the worktree.

### Pitfall 2: lib-mode inlining
**What goes wrong:** 42-50 MB single file. **How to avoid:** app-mode ES build; the entry check derives Orca's `build:web` asset names and requires none inlined.

### Pitfall 3: iife globals evaluated outside the wrapper
**What goes wrong:** "defined no PbPane global" with an intro-local `globals` value (measured). **How to avoid:** ESM virtual modules (A2).

### Pitfall 4: CSS control confounded by an existing leak
**What goes wrong:** control delta 0 while the pane is leaking (measured). **How to avoid:** plant on a property not among current diffs, and first require the control to move from a 0-diff baseline (A9).

### Pitfall 5: keyframe name collision
**What goes wrong:** Orca's `@keyframes spin` (loaded after Theia's) redefines Theia's `spin` document-wide. **How to avoid:** prefix every Orca keyframe name and rewrite `animation`/`animation-name` in the pass; the CSS check compares the two keyframe name sets as disjoint.

### Pitfall 6: conflict review without git polling
**What goes wrong:** the hosted review reports "All conflicts resolved" with a live `UU` file. **How to avoid:** `ActiveWorkspaceSyncGate` in the services root and set the store's active worktree when an Orca pane activates (A8).

### Pitfall 7: environment id churn under `sessionOnly`
**What goes wrong:** each reload mints `web-<uuid>`; host-identity-keyed state may strand (A6). **How to avoid:** live-check chat tab ownership across a reload; if it strands, keep the non-secret parts of the previous environment (id, public key, host descriptor) in memory-independent storage and pass them as `previousEnvironment` (Open Question 2).

### Pitfall 8: a remote route nobody can feed
**What goes wrong:** a route and a live clause for remote terminals that never appear. **How to avoid:** A1.

### Pitfall 9: lane worktrees and the live lock
Research ran the probes in the spike lane's tree (`p61-01`, which holds the lane Theia build with `window.__pbReact`) and restored its spike outputs afterwards; v1.7's `orca/` keeps its one pre-existing staged change (`src/main/orcad/orcad-browser-provider.ts`, seam 010), which is the baseline the A1 clause must compare against, not an empty status.

## Code Examples

The probe sources are kept, runnable, under `.planning/spikes/004-orca-pane-hosting/p64-probe/`:
- `pb-probe-mount.tsx`: the entry (`mountKind` per content type, `hostTabs`, `hostCreateTerminal`, `sessionOnly` bootstrap).
- `vite.pb-probe-esm.config.ts` (ESM build), `vite.pb-probe-lib.config.ts` (lib build, for comparison and for the spike CSS measure).
- `pb-css-scope.mjs`: the scoping pass, plus `unlayerPlugin`, which was not needed.
- `build-probe.sh <repo-root>` and `css-variant.sh <repo-root>`: the build checks, with tracked status compared before and after.
- `probe-64.mjs --bundle esm|lib [--cli-only] [--no-persistence] [--reload-pair]`: the live harness.
- `results-p64-*.json`: the measured outputs. The secret scan passed, and every pairing value was redacted by the harness.

Mount call shape (measured):
```ts
// Source: p64-probe/pb-probe-mount.tsx
const root = ReactDOMClient.createRoot(element, { onCaughtError, onUncaughtError, onRecoverableError })
root.render(<Providers><div data-pb-pane-root={tabId}>{body}</div></Providers>)
// agent-session: <NativeChatView mode="structured" tabId sessionId agent target isVisible isFocusedGroup />
// simulator:     <EmulatorPane tab={tab} worktreeId isActive />
// conflict-review / check-details: <EditorPanel activeFileId={fileId} activeViewStateId={fileId} isVisible isCmdSaveOwner />
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Spike lib iife + `window.__pbReact` + intro `require` | ESM app build + `Symbol.for` virtual modules | This research | No inlined assets; lazy chunks; one hand-off key |
| Spike harness unscoped sheet (84 out / 24 in) | Scoped pass (0 property values out, 0 in; 2 `<html>` attribute keys) | This research | Exit test near; one ruling needed (A3) |
| Spike `waitForTerminal(create=1)` via store action | `terminal.create` RPC | This research | Removes the CLI gap (A4) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A-1 | Orca's mirror freeze is internal to the client after its own `session.tabs.createTerminal` (mechanism not identified) | A4 | The rule still holds empirically. If an agent-driven or chat-launch path triggers the same freeze, the live clause in Open Question 3 catches it. |
| A-2 | Handle-less terminal leaves occur, for example after host restarts, and `terminal.create` with `tabId`/`leafId` spawns them for a non-mounting client | A5 | The mapper could issue a create that the host refuses. The lane's live row must plant one. |
| A-3 | `AppBackgroundServices` mounts in the hidden services root without extra providers | A8 | The standalone row goes red naming it, and `ActiveWorkspaceSyncGate` alone stays the floor. |
| A-4 | A `Symbol.for` hand-off read from inside Theia's esbuild iife and a runtime `import(url)` behave as in the BiDi-evaluated probe | A2 | Low. Fallback: insert `<script type="module">`. |
| A-5 | Rolldown fails the build when Orca imports a React name the virtual module does not export | P64-09 | If it does not fail, a missing React API would be `undefined` at run time. Add an explicit clause to the entry check that compares import names with the host export set. |
| A-6 | No remote terminal stream reaches the PB-paired client (source reasoning, not falsified with two orcads) | A1 | If a relay exists, a hosted remote route could be restored. The 63-04 `orca-remote-regression` harness can run the falsification. |

## Open Questions

1. **Remote stream, live falsification.**
   - What we know: the client stores one environment and every tab is stamped with it; Electron main holds the only relay.
   - What's unclear: no run with two orcads and `environment add` was made.
   - Recommendation: the 63-04 coordinator's `orca-remote-regression` harness adds one clause: a hosted client paired with orcad A lists no tab for a terminal created with `--environment B`. This runs before TERM-03 is recorded as not delivered.
2. **Environment id churn under `sessionOnly`.**
   - What we know: re-pairing works, and the id changes at every reload.
   - What's unclear: whether chat tabs and host-identity state survive a reload.
   - Recommendation: the `orca-tabs-live` reload clause opens a chat, reloads the frontend, and requires the chat tab to remount with the same `pb-orca:` name.
3. **Chat creation without a real agent, and the freeze.**
   - What we know: the CLI cannot create a structured chat. Chat launch goes through `agentSession.create` (`lib/agent-session/launch/structured-agent-session-launch-create-call.ts:174`; handler `main/runtime/rpc/methods/structured-agent-session.ts:129`), not `session.tabs.createTerminal`.
   - What's unclear: whether a launch with a stub provider creates a tab, and whether it triggers the freeze.
   - Recommendation: the lane plants a stub provider on orcad's PATH, as Phase 63's hook row does with a stub `claude`. The live row creates a chat through "New Orca Chat", then requires a CLI terminal to become a tab within 1 s.
4. **Exit-test ruling for the two `<html>` attribute keys (A3).** The coordinator or Chris accepts the derived clause, or the CSS lane re-implements the appearance writes on scope roots instead.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Nix dev shells `.#orca`, `.#theia` | builds | ✓ | — | — |
| Orca built at the pin (`orca/out`) | bundle, live rows | ✓ (v1.7 tree and p61-01) | v1.4.248 / 965978bc | — |
| PowerBrowser binary | live rows | ✓ `objdir/dist/bin/powerbrowser` (built 2026-11-08) | 153.5.1esr | — |
| Theia build with orca-terminals | live rows | ✗ in v1.7 (Phase 63 not merged; `theia/extensions` has no `orca-terminals`) | — | Lanes branch after the 63-04 merge (context) |
| Live lock `/home/chris/coding/Power-Browser/.git/pb-live.lock` | live rows | ✓ | — | — |
| Agent provider for a real chat | chat live clause | not used (cost, owner credentials) | — | Stub provider (Open Question 3) |

**Missing dependencies with no fallback:** Phase 63 merged tree, which the context already makes a precondition.

## Validation Architecture

(`workflow.nyquist_validation` is `true`.) Everything is automated, and no human check is created (D-18). Framework: Node scripts under `scripts/verify-platform.sh`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node 24 scripts, `scripts/verify-platform.sh` rows |
| Config file | none (registry rows) |
| Quick run command | `scripts/verify-platform.sh --quick` / `--only <label>` |
| Full suite command | `scripts/verify-platform.sh` (live rows under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, `ORCA_*` unset, `MOZ_PURGE_CACHES=1`) |

### Phase Requirements → Test Map
| Req / Criterion | Behavior | Row(s) | Tier | `--self-test` plants (each red naming it) | Needs |
|---|---|---|---|---|---|
| TAB-01 / SC1 | Orca descriptor, rules row, chrome `MODES`, `ideDress` for `orca` | `gui07-mode-toggle-commands` (+ self-test, unchanged); `verify-mode-switch-tabs-live` (extended seeds) | quick / live | existing plants; seeds: the `pb-orca:` tab and the `o<n>` tab missing after a hop | tree; live: built PB + Theia |
| TAB-02 / SC5 | `pb-orca:<word><n>` round-trips; empty path focuses the last; a stale name opens nothing; one widget per factory | `verify-uri-roundtrip` (`--scheme pb-orca`), `gui04-registry-shape` (unchanged) | live / quick | — / existing | built Theia |
| TAB-02 doc | route-table name words = `docs/URI-SCHEMES.md` `pb-orca:` words (`chat`, `sim`, `conflicts`, `checks`; no `remote`, A1) | `orca-pane-routes` (+ self-test) | quick | word missing from the doc; extra doc word | tree |
| SC4 | `TabContentType` members derived by TypeScript parse of `orca/src/shared/tab-types.ts` = route-table keys; values ∈ {theia-terminal, theia-editor, pb-web-tab, hosted-pane, pending:<REQ>} | `orca-pane-routes` (+ self-test) | quick (named SKIP without `orca/`) | added type; removed type; unknown target; pending without requirement id; zero members ("source moved") | `orca/`, `theia/node_modules/typescript` |
| A4 guard | orca-panes and the overlay entry import none of `components/terminal/terminal-tab-create`, `runtime/web-runtime-terminal-creation`, `runtime/web-runtime-terminal-create-operation`; no `session.tabs.createTerminal` literal | `orca-pane-routes` (static clause) | quick | a planted import of `createNewTerminalTab` | tree |
| Condition 3/4, P64-09 | build passes (moved path fails it); tracked status of `orca/` equals the pre-build baseline (A1 clause); React marker 0 against a two-copy control ≥1; Orca resolved React major.minor = Theia's; no asset name emitted by Orca's own `build:web` appears inlined as `data:` in the pane output; the entry's own imports reach no `components/tab-bar/` or `TabGroupPanel` | `orca-pane-entry` (+ self-test) | full (SKIP without build) | tracked edit; React copy; version skew; inlined font; tab-bar import | `orca/out` |
| P64-14 static | scoping pass self-test on fixture selectors (root, qualified root, theme, `*`, pseudo-element, portal self, keyframes renamed, custom properties left on `:root`); Orca keyframe names after prefixing ∩ Theia keyframe names = ∅ (derived from both sheets) | `orca-pane-css` (+ self-test) | quick on fixtures / full on the built sheet | invalid pseudo-element order; unprefixed keyframe; scoped `--` property | built sheet for the set clause |
| P64-14 live | Theia element property values changed 0; pane values changed 0 (vs standalone); both controls register from a 0-diff baseline; portal probe (open tooltip and dialog) 0; the `<html>` attribute clause per the A3 ruling | `orca-pane-css-live` (+ self-test on fixture measurements: nonzero each way, control not registering, `measured:false`) | live | as P64-25 | built PB, Theia, bundle |
| SC3 / TAB-06 | each hosted type mounts in the standalone page and in the widget with no thrown error; a newly required provider goes red naming type and message | `orca-pane-standalone-live` | live | — (live only; the error capture is `createRoot` `onCaughtError`/`onUncaughtError`, proven by a planted throwing child) | built bundle |
| SC2 / TAB-04 | "New Orca Chat" and "New Orca Terminal" tabs within 1 s (clock at `addWidget`); after each, a CLI terminal still becomes a tab within 1 s (A4); Organising row keyed `pb-orca:`; in-tab split → two `o<n>` in two bars in the recorded direction; no Orca tab-bar DOM (selectors derived from source, proven present on the standalone page first); hosted close with a busy agent shows Orca's confirmation and cancel keeps tab and row; Orca-side close disposes; frontend reload restores within one orcad lifetime (A6) | `orca-tabs-live` | live | — | merged tree; stub provider (Open Question 3) |
| P64-02 | `paneKey` in `OrcaTerminalEntry` | `verify-orca-pty-bridge` (extended) | as Phase 63 | spawn without pane key stays standalone | Phase 63 merged |
| P64-07 | offer reaches the bundle; never in log, state, diagnostics, localStorage (`orca.web.runtimeEnvironment.v1` absent) | `orca-service` scenario (offer sink writes once after ready; log has no offer form) + clause in `orca-tabs-live` | quick / live | offer copied to `pushLog`; offer written before ready; file mode 0644 | tree; live |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --only <the lane's quick rows>`, plus `node scripts/scan-brand-residue.mjs` after staging.
- **Per wave merge:** `scripts/verify-platform.sh --quick`.
- **Phase gate:** `--quick` green. Then, under the lock: `orca-pane-entry`, `orca-pane-css-live` (first, on the merged tree, P64-15), `orca-pane-standalone-live`, `orca-tabs-live`, `verify-uri-roundtrip`, `verify-mode-switch-tabs-live`. Then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `scripts/lib/` productised harness (from `measure.mjs`, `page-routes.mjs`, `p64-probe/probe-64.mjs`) with the A9 control fix and a scope-aware rule counter.
- [ ] Stub agent provider for the chat live clause (Open Question 3).
- [ ] Portal probe in the CSS harness (open an Orca tooltip and dialog).

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | orcad device token / E2EE through Orca's own pairing code; Theia token gate cookie on the backend route |
| V3 Session Management | yes | `sessionOnly` environment: no device token in Theia-origin localStorage (A6) |
| V4 Access Control | yes | static route and offer RPC behind the token gate; offer file 0600 in a 0700 directory, mode-checked on read |
| V5 Input Validation | yes | static route resolves only inside the bundle directory (reject `..`, absolute, symlink escape); offer parsed only by `parseWebPairingInput` |
| V6 Cryptography | yes | never hand-rolled: Orca's E2EE and device keys |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Offer in logs, diagnostics, history, or session restore (RUN-07) | Information disclosure | one-shot sink, never `pushLog`/`getState`; Phase 67 RUN-07 adds the bridge directory's `web-pairing` file name and the offer RPC response to its containment scan |
| Script loaded from a port another process can bind | Tampering / elevation | bundle served by Theia, same origin (P64-06) |
| Path traversal in the static route | Tampering | resolved-path prefix check + realpath |
| Orca CSS restyling Theia UI | Tampering (UI) | scoping pass + `orca-pane-css-live` |
| Credential persistence in Theia origin storage (T-61-04) | Information disclosure | `sessionOnly` (measured); the workspace-session keys (`orca.web.workspaceSession.v1*`) carry no credential |

## Sources

### Primary (HIGH confidence)
- Live probes this session, under the lock, in the spike lane tree: `p64-probe/results-p64-esm.json` (mounts, CLI trials), `results-p64-esm-cli.json` and `-cli-nopersist.json` (CLI gap isolation), `results-p64-esm-reload.json` (session-only re-pair), `results-p64-css-layered-2.json` and `-3.json` (CSS measure through the spike's `measure.mjs --route a --measure css`); builds via `build-probe.sh` and `css-variant.sh` (tracked status unchanged).
- Orca v1.4.248 source as cited inline (file:line), read this session.
- `orca/node_modules/vite/dist/node/chunks/node.js:32808-32827` (`shouldInline`), Radix dist files cited in A3.
- PB tree: `mode-descriptors.ts:50`, `mode-service.ts:112`, `chrome-bar-widget.tsx:394,2083`, `tab-uri-registry.ts:124`, `existing-scheme-coverage.ts:32,49`, `group-model.ts:120`, `OrcaEnv.sys.mjs:135-158,198-258`, `OrcaService.sys.mjs:536`, `63-05-PLAN.md` (bridge directory, `writePrivateFile`).

### Secondary (MEDIUM)
- `63-RESEARCH.md` finding 1 (no SSH stack and no relay in orcad), cross-checked against `runtime-rpc-pairing.ts:94` and `main-process-runtime-launch.ts:122`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (installed versions read; builds run).
- Architecture: HIGH for mounts, observation, build and pairing (measured); MEDIUM for remote and PTY-spawn items (source).
- Pitfalls: HIGH (each observed in a run, except Pitfall 7's consequence).

**Research date:** 2026-11-10
**Valid until:** the next Orca re-pin (weekly per D-26), or 30 days.
