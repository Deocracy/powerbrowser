# Phase 61: Spikes for pane hosting, browser parity and live sharing - Research

**Researched:** 2026-11-09
**Domain:** Orca v1.4.248 renderer / orcad internals read against PowerBrowser's Theia 1.76 + Gecko 153.5.1 tree; three throwaway spikes (004, 005, 006)
**Confidence:** MEDIUM overall. HIGH for what Orca's source and the extension package say (read this session). MEDIUM-LOW for anything that needs a run (CSS leak counts, memory, nav+title through the seam, resume transcript). Those are exactly what the spikes measure.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
(Claude's recommended picks made in auto mode; Chris may override at the end-of-milestone pass, D-18.)

- **P61-01:** prototype the same-document route first, iframe-per-pane second, and measure both. Route A mounts one Orca pane component inside a Theia `ReactWidget` in PowerBrowser's dock from a PB-added web entry (the `vite.web.config.ts` seam named in D-16), with exactly one React 19.2.8 copy; Route B loads one Orca web page per pane in an iframe inside a Lumino widget. Both are measured on the same three numbers: cross-origin WebSocket to orcad from the Theia origin (works, needs a token/Origin change, or fails), CSS isolation (count of Orca global styles that leak into Theia and the reverse), and resident memory per added pane after three panes. The decision record names the winner and the seam patches it needs against the D-16 cap of about ten. Reversible: the record can be re-decided before Phase 64 is planned.
- **P61-02:** the read-only layout observation (D-15) is prototyped as a listener on the client's persisted layout state (`orca.web.workspaceSession.v1` and the renderer's layout store events), not by patching Orca's layout code. A pane opened in Orca's client must appear as a new Lumino tab within one second in the prototype; the record states the mechanism and its latency.
- **P61-03:** the prototype is built from the pinned source already at `orca/` (Phase 60's `scripts/build-orca.sh`) and lives under `.planning/spikes/004-orca-pane-hosting/`; no tracked production file is added for it. Scratch builds and web entries stay gitignored or under the spike directory.
- **P61-04:** a tracked script `scripts/orca-browser-parity.mjs` derives the ability list from the pinned Orca tree at check time (the browser provider interface in `orcad/orcad-browser-provider.ts` and the agent/CLI browser tools that call it), prints each ability with the Orca component that uses it (agent, CLI, renderer or orcad), and fails when a hand-kept disposition row has no matching ability or an ability has no row (derive-and-compare). Dispositions (WebDriver BiDi, BiDi plus PB code, chrome actor, native, impossible) live in a tracked table `.planning/spikes/005-orca-browser-parity/DISPOSITIONS.md` that the script reads.
- **P61-05:** the provider seam is the browser provider kind in `orcad/orcad-browser-provider.ts` (D-16), implemented in Phase 66 as a PB provider that talks to Gecko through `PowerBrowserAPI.sys.mjs` and WebDriver BiDi; the spike proves one ability end to end (navigate + read title) through that seam to size it. `research/FEATURES.md` questions 1-8 are answered in the record with evidence lines.
- **P61-06:** the floor is proven first and without Chris: a stopped Orca agent session (created by PB's orcad from Phase 60) resumed with `claude --resume <session>` on this host's Claude CLI login, with the run's transcript as evidence. The live-share half needs the EXT-01 session, which is deferred (D-18, P60-R5); the record states what was proven, what is blocked on EXT-01, and what the extension's source says about attaching to an external session.
- **P61-07:** if the live share proves impossible from source reading, the record recommends the Phase 63 fallback now (agent sessions as Theia terminals with `--resume` on demand) so Phase 63 is not blocked on the deferred check.
- **P61-08:** three Orca lanes, one per spike (`p61-01` pane hosting, `p61-02` browser parity, `p61-03` live sharing), disjoint files, merged by the coordinator in that order (D-07/D-08 mechanics from Phase 59). The pane-hosting lane builds Orca itself with `scripts/build-orca.sh` in `.#orca`; the other two need only the fetched tree.
- **P61-09:** each spike ends with a VERDICT section (`GREEN`, `YELLOW` with conditions, or `RED` with the owner decision needed) and a "Route for Phase N" line; the coordinator copies those lines into ROADMAP Phases 63, 64 and 66 ("Route chosen by Phase 61: ...") so criterion 4 is met before any of them is planned. A RED verdict is an owner decision, asked in the box before that phase is planned, not before the spike ends.
- **P61-10:** spike records follow the `.planning/spikes/003-...` shape and are wrapped into `Skill("spike-findings-Power-Browser")` references at the end of the phase.

### Claude's Discretion
- Prototype code layout under each spike directory, measurement harness details, the exact BiDi commands for the parity proof, and the Claude CLI invocation for the resume floor.

### Deferred Ideas (OUT OF SCOPE)
- The live-share half that needs the Claude Code extension session: proven in the end-of-milestone pass with EXT-01 (D-18).
- Upstream pull requests for the seams (Phase 68); renames and palette (post-v1.7).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TAB-03 | A spike shows how PowerBrowser's dock observes the client's layout state (the renderer owns it in shipped builds) and how Orca's pane components mount inside Lumino widgets. (D-15) | Section "Spike 004": pane mount surface, store-based observation (correcting P61-02), cross-origin WS facts, CSS and memory measurement method, build seam |
| BRW-01 | A browser-parity spike reconciles Orca's browser inventory against Gecko, chooses the seam, and answers FEATURES.md questions 1-8. | Section "Spike 005": derivation rule with counts at the pin, S1 vs S2 evidence, Q1-Q8 answers as far as source allows, one-ability proof design |
| EXT-03 | A spike researches live sharing of a running Orca agent inside the extension; resuming a stopped session is the floor. (D-06.3) | Section "Spike 006": Orca agents are plain Claude sessions in `~/.claude/projects`, extension resume entry points from its package, `claude attach`/`--bg` finding, floor-run recipe |
</phase_requirements>

## Summary

Four premises in CONTEXT.md/ROADMAP do not survive a read of the pinned source, and the planner should reword the acceptance lines before they become task text:

1. **P61-02's observation channel is wrong.** The web client's persisted `orca.web.workspaceSession.v1` holds no tabs or layout. `sanitizeWebRuntimeWorkspaceSession` keeps only `activeRepoId`, `activeWorktreeId`, `browserUrlHistory`, `lastVisitedAtByWorktreeId` and the source comment says "Host supplies live tabs" [VERIFIED: orca/src/renderer/src/web/web-workspace-session.ts:4-17, comment at :10]. Tabs and layout live in the renderer's Zustand store (`unifiedTabsByWorktree`, `groupsByWorktree`, `layoutByWorktree`, `activeGroupIdByWorktree`) and are mirrored from orcad. Real observation options: (a) `useAppStore.subscribe` in the same document (Route A only), (b) a PB-added script in the pane page posting to the Theia parent (Route B), (c) a second E2EE RPC client calling orcad `session.tabs.subscribeAll` / `layout.subscribe` (read-only, `permission: 'workspace'`).
2. **A pane is not a standalone component.** Terminal, chat, browser and simulator panes are mounted by worktree-level overlay layers that read the global store and anchor themselves to tab-group body rectangles. The store is hydrated by `App`'s startup hooks and the `window.api` shim from `installWebPreloadApi()`. A one-pane mount needs that bootstrap, not just `<TerminalPane/>`.
3. **"One React 19.2.8 copy" is not free.** Theia and Orca both resolve React 19.2.8 today, but Orca's Vite build bundles its own copy into the page bundle. A single copy needs the Orca bundle to externalise `react`, `react-dom/client` and `react/jsx-runtime` to Theia's instance. Measure both the one-copy and two-copy forms.
4. **A PB web tab is not an iframe.** It is a chrome-owned `<xul:browser>` overlay aligned to a placeholder widget [VERIFIED: theia/extensions/tab-uris/src/browser/web-tab.ts header comment]. "Route B" in the notes (iframe in a Lumino widget) and "one PB web tab per pane page" are two different routes. The second uses machinery that already exists and proved the whole client in spike 003. Add it as a third measured column (Route B').

Browser parity is the most tractable spike: every ability is enumerable from three machine-readable sources at the pin (65 automation methods, 83 `RuntimeBrowserCommands` members, 80 CLI specs, 92 `browser.*` RPC definitions) and the `browser.clientHost.attach` permission gate shows a non-Electron client of kind `runtime` can attach with no Orca patch (S2), which is the zero-seam alternative to P61-05's provider-kind seam (S1). Live sharing: Orca's Claude sessions are ordinary Claude Code sessions in `~/.claude/projects`, the extension has first-class "open this session id" entry points, and `claude attach`/`--bg` exist in this host's CLI 2.1.321. The extension itself has no attach-to-running-process capability in its source.

**Primary recommendation:** Run the three spikes as three lanes exactly as P61-08 says. Make the pane-hosting lane's Wave 0 the PB Vite config plus a one-pane mount in a standalone page (no Theia yet), because every later measurement depends on it. Keep the parity script regex-based (TypeScript 7.0.2 is in `orca/node_modules` and its JS API cannot be assumed). Run the resume floor with a throwaway repo and the already-built Orca CLI.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pane rendering (terminal, chat, editor, browser, simulator) | Browser / Client (Orca renderer bundle, React) | Frontend Server (Theia hosts the widget) | Panes are React components reading Orca's Zustand store [VERIFIED: TerminalPaneOverlayLayer.tsx] |
| Layout state (tabs, groups, splits) | Browser / Client (renderer store owns it in shipped builds) | API / Backend (orcad mirrors it, `session.tabs.*`, `layout.subscribe`) | `ORCA_LAYOUT_OWNER_IS_MAIN` is off [VERIFIED: src/shared/layout-owner-switch.ts:6-9] |
| Layout observation for Lumino tabs | Browser / Client (Theia frontend widget) | API / Backend (RPC subscription fallback) | PB's dock owns the arrangement (D-15) |
| Orca web bundle serving | API / Backend (orcad static handler, `--web-client-root orca/out/web`) | — | [VERIFIED: scripts/lib/orca-run.mjs:177] |
| WebSocket RPC auth | API / Backend (device token + E2EE, application level) | — | No Origin check at upgrade [VERIFIED: ws-transport.ts:212-215] |
| Browser abilities (navigate, snapshot, input) | API / Backend (orcad `RuntimeBrowserCommands`) | Browser / Client (client-host lease, S2) | Provider factory is orcad-side [VERIFIED: orcad-browser-startup.ts:25] |
| Gecko page control | Gecko chrome (`PowerBrowserAPI.sys.mjs` web-tab methods) | WebDriver BiDi (tests/spike only, D-11) | CLAUDE.md rule 2 |
| Agent session store | OS filesystem (`~/.claude/projects/*.jsonl`) | Claude CLI / extension processes | [VERIFIED: orca/src/main/ai-vault/session-scanner-roots.ts:10] |
| Session resume in Theia | Theia plugin host (Claude Code extension) | Theia terminal | Extension commands take a session id (see Spike 006) |

## Standard Stack

No package is added to the product by this phase. Prototype tooling is what the tree already has.

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Orca source (pinned) | 1.4.248 @ 965978bc | The code under study; built at `orca/` | Pin in `configuration.toml`; [VERIFIED: orca/package.json "version"] |
| Vite | 8.3.5 | Builds the PB pane entry with Orca's own plugin chain | [VERIFIED: orca/node_modules/vite/package.json] |
| `@vitejs/plugin-react` / Tailwind | 6.1.2 / 4.3.3 | Same plugins Orca's web config uses | [VERIFIED: node_modules package.json reads] |
| React / react-dom | 19.2.8 in both `theia/` and `orca/` | Single-copy target | [VERIFIED: node_modules/react/package.json both trees] |
| zustand | 5.0.15 | Orca store; the observation subscription target | [VERIFIED: orca/node_modules/zustand] |
| `@theia/core` `ReactWidget` | 1.76.0 | Hosts Route A; used by `ChromeBarWidget` | [VERIFIED: chrome-bar-widget.tsx:389 `extends ReactWidget`, imports from `@theia/core/shared/react`] |
| `scripts/lib/pb-live-probe.mjs` + `firefox-bidi.mjs` | in tree | Headless PB probe: `withProbeShell`, `openWebTab`, `inChrome`, BiDi helpers | [VERIFIED: file exports read] |
| `scripts/lib/orca-run.mjs` | in tree (60-03) | `ensurePbNode`, `orcadEnv`, `startOrcad`, `stopOrcad`, redaction | [VERIFIED: 60-03-SUMMARY] |
| Claude CLI | 2.1.321, logged in (`claude.ai`) | Resume floor | [VERIFIED: `claude --version`, `claude auth status`] |
| `Anthropic.claude-code` (Open VSX) | 2.1.321, `linux-x64` target | Read-only study | [VERIFIED: open-vsx API; sha256 of the downloaded vsix `bdfbd675d73ac2c4f372a2562a7144e2cfaeda71488052b4e3dc53cbdff5a5c0`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex/line scan for the parity script | TypeScript compiler API | `orca/node_modules/typescript` is 7.0.2 [VERIFIED]; its JS API was not tested. Phase 60 already derives from TS source with regexes (`verify-orca-build-shape.mjs:55-59`). Use regex; add a count tripwire. |
| Importing Orca pane source into Theia's webpack | PB-added Vite entry built by Orca's own toolchain | Webpack would have to compile Orca's Tailwind/TS closure; contradicts D-04 (Orca built by its own `build:web`). |

**Installation:** none. Prototype build only: `nix develop .#orca --command bash scripts/build-orca.sh` (21 s warm, 60-02 record), then a Vite run with the PB config (below).

## Package Legitimacy Audit

No external package is installed or recommended by this phase. The only external artifact is the Open VSX `.vsix`, downloaded into the session scratch directory for read-only study (never into the project tree, never installed). Publisher `Anthropic`, namespace reported verified by the Open VSX API [VERIFIED: open-vsx.org/api/Anthropic/claude-code/2.1.321 `namespaceVerified: true`].

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 ORCA SIDE (no edits)                          PB SIDE (new files only)
 --------------------                          ------------------------
 orca/src/renderer/src  --Vite(PB cfg)-->  out/web/{web-index.html, pb-pane.html, pb-pane.js}
                                                   |  served by orcad static handler
 orcad (slot-less, Node 24.19.0)  <-- ws://127.0.0.1:<port>, device token + E2EE, no Origin check
   |  session.tabs.*, layout.subscribe, terminal.*      ^
   |  browser.* RPC (92), RuntimeBrowserCommands (83)   |
   v                                                    |
 PTY / agents ---> ~/.claude/projects/<cwd>/<id>.jsonl  |
                                                        |
 Theia frontend (127.0.0.1:<sidecar port>, React 19.2.8)|
   Route A : ReactWidget -> dynamic import(pb-pane.js) -> mountPane(el,{tabId}) -> useAppStore.subscribe -> Lumino tab opens/closes
   Route B : Lumino widget -> <iframe src=http://127.0.0.1:<orcad>/pb-pane.html?tab=..> -> postMessage layout events
   Route B': web tab overlay (chrome-owned xul:browser) -> same pb-pane.html (existing machinery)
   Observation: PB listener -> Lumino add/remove tab within 1 s (P61-02 clock)

 BROWSER PARITY (spike 005)
   orca/src tree --scripts/orca-browser-parity.mjs--> ability set {RPC name, users[agent|cli|renderer|orcad]}
        compare as set with DISPOSITIONS.md rows -> red on missing row or orphan row
   one-ability proof: browserGoto({url}) -> PowerBrowserAPI webTabNavigate -> PowerBrowserWebTabState {url,title} -> {url,title}

 LIVE SHARING (spike 006)
   orca agent launch (claude, throwaway repo) -> session id in ~/.claude/projects -> stop -> claude --resume <id> -> transcript
   extension: claude-vscode.editor.open(sessionId) / terminal.open(undefined,['--resume',id]) / vscode://Anthropic.claude-code/open?session=<id>
```

### Recommended Project Structure
```
.planning/spikes/004-orca-pane-hosting/   README.md, results.md, build-pb-entry.sh, vite.pb.config.ts, pb-pane.html, pb-pane.tsx, theia-route-a/, route-b.html, measure.mjs
.planning/spikes/005-orca-browser-parity/ README.md, DISPOSITIONS.md, results.md, provider-proof.mjs
.planning/spikes/006-orca-live-sharing/   README.md, results.md, floor-run.mjs, extension-notes.md
scripts/orca-browser-parity.mjs           tracked; rows orca-browser-parity (+ -self-test) in scripts/verify-platform.sh
.claude/skills/spike-findings-Power-Browser/references/   orca-pane-hosting.md, orca-browser-parity.md, orca-live-sharing.md (wrap-up)
```

### Pattern 1: PB-added Vite config merging Orca's, no Orca file edited
**What:** `build:web` runs `vite build --config vite.web.config.ts` [VERIFIED: config/scripts/run-vite-web-build.mjs]. The config sets `root: resolve('src/renderer')`, `base: './'`, `build.outDir: out/web`, `emptyOutDir: true`, `rollupOptions.input: src/renderer/web-index.html` [VERIFIED: vite.web.config.ts:11,14,34,37]. A second config that imports the first, `mergeConfig`s extra HTML inputs and sets `emptyOutDir: false` produces extra pages beside `web-index.html` with relative asset URLs, which is all `verify-web-build.mjs` checks [VERIFIED: config/scripts/verify-web-build.mjs]. Desktop Orca already ships several renderer entries (`index.html`, `popout.html`, `space.html`, `web-index.html` under `src/renderer/`), so a second entry is a precedent, not a novelty [VERIFIED: ls src/renderer].
**When to use:** all three routes. This is the "extra web entry" seam of D-16 with zero edits to Orca's config (a PB-added file passed by `--config`).
**Caveat:** HTML inputs should sit under Vite's `root`. For the spike the build script copies the spike's `pb-pane.html`/`pb-pane.tsx` into untracked paths under `orca/src/renderer/` (orca/ is gitignored; `orca-build-shape` counts modified TRACKED files only [VERIFIED: 60-02-SUMMARY]) and runs `vite build --config <spike>/vite.pb.config.ts`. Confirm in Wave 0 that the build leaves `git -C orca status --porcelain --untracked-files=no` empty. [ASSUMED: Vite accepts the merged multi-input build without further tweaks]
**Example:**
```ts
// Source: modelled on orca/vite.web.config.ts (read this session); mergeConfig is Vite's public API
import { mergeConfig, defineConfig } from 'vite'
import base from '../../../orca/vite.web.config'   // path is resolved by the spike build script
import { resolve } from 'node:path'
export default mergeConfig(base, defineConfig({
  build: { emptyOutDir: false, rollupOptions: { input: { pbPane: resolve('src/renderer/pb-pane.html') } } }
}))
```

### Pattern 2: What a one-pane mount needs (Route A and B share it)
**What:** the bootstrap in `src/web/main.tsx` is the template, with `<App/>` replaced by a single pane root.
- Providers and installs: `I18nProvider`, `RecoverableRenderErrorBoundary`, `installWebPreloadApi()` (creates `window.api`), `initWebDeviceKeySupport()`, `installAppKeyboardRouter()`, `installOsFileDropCancellationGuard()`, `installBodyOverlayAttributes()`, plus `TooltipProvider` and `ConfirmationDialogProvider` as in `App.tsx` [VERIFIED: web/main.tsx:1-100, App.tsx:90-110].
- Pairing: `readPairingInputFromLocation` / `saveStoredWebRuntimeEnvironment` store the environment in the page origin's localStorage; with no stored environment the page shows `WebConnect` [VERIFIED: web/main.tsx:45-85]. Route A therefore stores `orca.web.*` keys in the Theia origin; Route B/B' on the orcad origin share the stock client's stored pairing.
- Store hydration: `useAppStartupHydration` (326 lines), `useRuntimeGraphSync`, `useAppShellServices` run in `App`. A pane reads `tabsByWorktree`, `unifiedTabsByWorktree`, `groupsByWorktree`, `activeGroupIdByWorktree` from `useAppStore` [VERIFIED: TerminalPaneOverlayLayer.tsx:60-68].
- Pane props (terminal): `{ tabId, worktreeId, cwd?, isActive, isVisible?, isWorktreeActive?, onPtyExit, onCloseTab, ... }` [VERIFIED: terminal-pane-types.ts:4-19]; default export of `components/terminal-pane/TerminalPane.tsx`. Layers: `WorkspacePaneOverlayLayers` mounts Terminal, RetainedBrowser, Emulator and StructuredAgentSession layers [VERIFIED: components/WorkspacePaneOverlayLayers.tsx:44-70].
- Positioning: panes sit in `RetainedPaneHost`, which anchors to the tab-group body via CSS anchor positioning, except on the web client (`__ORCA_WEB_CLIENT__ === true`) where it measures the group body rectangle [VERIFIED: RetainedPaneHost.tsx:6-21]. A one-pane host must supply a body rectangle or bypass `RetainedPaneHost`.
- **Existing precedent for mounting outside the main shell:** `FloatingTerminalPanelSurface.tsx` mounts `WorkspacePaneOverlayLayers` outside `AppWorkspaceShell`, and `activity-terminal-portal` renders one `TerminalPane` with `isolatedPaneKey` into a portal target [VERIFIED: grep results above]. Read both first; the cheapest correct prototype copies the floating-panel mount.
**Recommended pane for the prototype:** terminal (`TerminalPane`), because it exercises xterm, WebGL (`primeTerminalWebglAddon` in `web/main.tsx`), PTY RPC and the CSS-heavy `terminal.css`. Do chat second only if time allows (needs `NativeChatView` and structured-agent providers).

### Pattern 3: Layout observation (replaces P61-02's localStorage listener)
Route A: `useAppStore.subscribe((s) => (s.unifiedTabsByWorktree, s.groupsByWorktree, s.layoutByWorktree))`, diff by tab id, call the Lumino add/close. The latency clock is store mutation to `DockPanel.addWidget`, expected sub-frame. The slice key names `unifiedTabsByWorktree`, `groupsByWorktree`, `layoutByWorktree` are verified [VERIFIED: TerminalPaneOverlayLayer.tsx:60-68; slices/content-tabs-from-main-frames.test.ts:59 uses `layoutByWorktree`].
Route B: the PB-added pane page runs the same subscription and `postMessage`s `{type:'pb-layout', ...}` to `window.parent`; the Theia widget validates `event.origin` equals the orcad origin. No Orca code is patched.
RPC alternative: `session.tabs.subscribeAll` and `layout.subscribe` stream the mirrored inventory (`permission: 'workspace'`) [VERIFIED: rpc/methods/session-tabs.ts:113,277; workspace-layout.ts:23]. Using it means speaking the private E2EE RPC (ARCHITECTURE Q6); reuse `src/renderer/src/web/web-runtime-client.ts` inside the PB bundle rather than reimplementing. Layout frames are served "only when the server offers layout.intents.v1" [VERIFIED: workspace-layout.ts:1 comment]; whether they carry data while the renderer owns layout is a measurement.
Also record what **closing** from the Lumino side must do: tab close in Lumino must call Orca's close path (store action or `session.tabs.close`) or the pane re-appears. Observation is read-only, close is a write. State this in the record.

### Anti-Patterns to Avoid
- **Listening to `orca.web.workspaceSession.v1` for panes.** It carries no tabs (see Summary item 1).
- **Importing Orca source into Theia's webpack build.** Use Orca's Vite toolchain only.
- **Sharing one Orca origin's localStorage across panes without noting `activeWorktreeId` last-writer-wins** (Route B/B': all pages on the orcad origin write the same session key [VERIFIED: web-storage.ts:5]).
- **Asserting on absence** (CLAUDE.md verification rule 1): the leak counter must count a planted global style first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| E2EE RPC client to orcad | A new client | Orca's `web-runtime-client.ts` + `web-runtime-connection-*.ts` bundled by the PB Vite entry | Private protocol with no version guarantee (Q6) [VERIFIED: files exist under src/renderer/src/web/] |
| Process memory per pane | Parsing `about:memory` | `ChromeUtils.requestProcInfo()` from chrome scope via `app.evaluateIn(app.chrome, ...)` | Returns per-process `memory` in bytes ("matches system monitors on Linux") plus `children[].windows[]` with `documentURI`/`documentTitle` [VERIFIED: upstream/dom/chrome-webidl/ChromeUtils.webidl:781,1139-1149,1045-1054] |
| Opening a PB web tab in a probe | New open path | `openWebTab(app, url)` and `withProbeShell` | [VERIFIED: pb-live-probe.mjs:51,177] |
| Page title / URL of a web tab | BiDi script reads | `PowerBrowserWebTabState` `kind:"state"` payload (`url`, `title`, `loading`) | [VERIFIED: PowerBrowserAPI.sys.mjs:3829-3836]; helpers `isState`, `loadedAt` in pb-live-probe.mjs:495-498 |
| Starting/stopping orcad | New spawner | `ensurePbNode`, `orcadEnv`, `startOrcad`, `stopOrcad`, `installOutputRedaction` | Pairing-offer redaction is already solved there |
| Session-id discovery | Parsing Orca internals | Newest `*.jsonl` under `~/.claude/projects/<encoded throwaway cwd>/` plus `orca terminal list --json` | Orca reads the same store [VERIFIED: session-scanner-roots.ts:10] |

**Key insight:** every hard piece (private RPC client, pairing, orcad lifecycle, tab opening, title events) already exists in Orca's or PB's tree. The spikes are measurements and glue, so keep prototype code small and out of tracked product paths except the parity script.

## Runtime State Inventory

Not a rename/refactor phase. Omitted.

## Spike 004: pane hosting (TAB-03)

### The 8 content types and where each renders
`TabContentType` = `'terminal' | 'editor' | 'diff' | 'conflict-review' | 'check-details' | 'agent-session' | 'browser' | 'simulator'` [VERIFIED: orca/src/shared/tab-types.ts:18-26]. `toVisibleTabType` collapses everything except `agent-session`, `browser`, `terminal`, `simulator` to `'editor'` [VERIFIED: tab-types.ts:36-47].

| Content type | Renders through | Mount shape | Evidence |
|---|---|---|---|
| terminal | `TerminalPaneOverlayLayer` -> `TerminalOverlaySlot` -> `TerminalPane` in `RetainedPaneHost` | worktree-level overlay anchored to group body | components/terminal-pane/*.tsx |
| agent-session (structured chat) | `StructuredAgentSessionPaneOverlayLayer` -> `NativeChatView` | worktree-level overlay | components/native-chat/StructuredAgentSessionPaneOverlayLayer.tsx:11,99 |
| browser | `RetainedBrowserPaneOverlayLayer` (client-hosted pages) and legacy `BrowserPane` | overlay; web client shows `RemoteBrowserPagePane`/`ClientHostedBrowserPagePane` | components/WorkspacePaneOverlayLayers.tsx:55; TerminalLegacyBrowserPanes.tsx |
| simulator | `EmulatorPaneOverlayLayer` | overlay, gated by `mountEmulatorOverlay` | WorkspacePaneOverlayLayers.tsx:61 |
| editor, diff, conflict-review, check-details | `EditorPanel` (lazy) inside the group body | in-body, drop owner for files | tab-group/TabGroupPanel.tsx:29,370 |

Consequence for D-15: one Orca pane = one Lumino tab means PB must render the overlay-layer contents per tab, not the group body. The terminal/chat/browser/simulator panes are already detached from the group DOM and keyed by tab id; editor-type panes are not (they are in-body). Per D-01 editor/diff go to Theia anyway (TAB-05), so the hosted set is terminal, agent-session, check-details/conflict-review (if kept) and simulator.

### Cross-origin WebSocket (answerable from source; confirm by run)
- orcad creates `new WebSocketServer({ server: httpServer, maxPayload })` with no `verifyClient` and no Origin handling [VERIFIED: orca/src/main/runtime/rpc/ws-transport.ts:212-215]. A browser does not apply CORS to WebSocket, so a page at the Theia origin can open `ws://127.0.0.1:<orcad port>`. Authentication is the device token plus E2EE at the application layer (`web-runtime-connection-auth.ts`).
- orcad's static handler sets only `Content-Type`, `Content-Length`, `Cache-Control` [VERIFIED: static-web-client-handler.ts:92-100]. There is no `X-Frame-Options`, `Content-Security-Policy` or CORS header, so an iframe of an orcad page from the Theia origin is not blocked by orcad.
- Web crypto: pairing keys need a secure context. `detectWebDeviceKeySupport` returns `'token-insecure-origin'` when `!isSecureContext` [VERIFIED: web-device-key.ts:23-31]. `http://127.0.0.1` is a potentially trustworthy origin in Gecko [ASSUMED], so both origins should report `persistent`; the spike must print `readWebDeviceKeySupport()` from each origin.
- What can still fail: Theia-side content security (the sidecar's own headers, PB shell policies) and `connect-src`. The grep over `theia/extensions/*/src` found no CSP code [VERIFIED: grep]; the sidecar headers themselves were not read. [ASSUMED: no CSP blocks `connect-src ws://127.0.0.1:*`]. Record the observed result per route as works / needs-change / fails.
- D-17 (Theia Origin check on the sidecar) is a PB change in the other direction (orcad page -> Theia sidecar). Route A/B must not need orcad to reach Theia; verify so.

### CSS isolation measurement
`assets/main.css` is 3,597 lines, imports `tailwindcss` (preflight), `tw-animate-css`, xterm/katex CSS and five local sheets, and defines `:root`, `.dark`, `#root`, `html.native-shell` and `:root[data-theme-background] body` rules [VERIFIED: main.css:1-12, 188, 315, 706 `@layer base`, 915, 930, 999]. In Route A all of that lands in Theia's document. Method:
1. Build the pane bundle; parse the emitted CSS with the Vite output or `CSSStyleSheet` in the page; count rules whose selector list contains `html`, `body`, `:root`, `*`, bare element selectors, `.dark`, or no class/id prefix. That is "leak out" (Orca -> Theia). Plant a known global rule first so the counter is proven (self-test discipline).
2. Compare Theia computed styles (button, input, a, h1, `body` font, scrollbar) before and after loading the sheet on a fixed set of Theia elements: "leak out" as observed diffs.
3. "Leak in" (Theia -> Orca): Theia's `.theia-*`/`--theia-*` globals applied to Orca's pane: compare the pane's computed styles with the pane on the stock page.
Shadow DOM is the standard mitigation but Tailwind v4 `@layer` rules and `:root` variables do not cross a shadow root (variables set on `:root` do not apply inside it). Treat as a candidate to test, not an assumption. [ASSUMED]

### Memory per pane
Procedure: `ChromeUtils.requestProcInfo()` in chrome scope before the first pane and after panes 1, 2, 3. Sum `memory` of the parent plus all `children` whose `windows[].documentURI` match the Theia origin (Route A) or the orcad origin (Route B/B'); record per-pane delta = (M3 - M0) / 3, and the first-pane delta separately (bundle load). Gecko may colocate same-site frames in one content process; report both total delta and per-process rows. Command to record in `results.md` is the exact `evaluateIn` expression. Run headless under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` per project convention [VERIFIED: CONTEXT "Established Patterns"].

### Single React copy
Both trees resolve React/react-dom 19.2.8 [VERIFIED]. Orca's Vite output includes its own React unless externalised. For a one-copy Route A: PB's Theia frontend sets `window.__pbReact = { React, ReactDOMClient, jsxRuntime }` from `@theia/core/shared/react`; the PB Vite config marks `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime` external and maps them to those globals (rollup `output.globals` with an IIFE/UMD library build, or an import map to blob modules). [ASSUMED: workable; Orca's `React.lazy` use and `react-dom` portals need the same instance]. Measure: (1) two copies, bundle size and memory; (2) one copy, whether panes render. Hooks across two React copies break only if components cross the boundary, which the mount function avoids.

### Seam patches the routes need (against the D-16 cap of about 10)
- Route A, B, B': extra web entry = zero patches if `--config <pb file>` is acceptable to `build:web`. PB's own build step would call Vite directly rather than `pnpm run build:web`'s hardcoded `vite.web.config.ts` [VERIFIED: run-vite-web-build.mjs]; if the overlay gate requires `build:web` itself to compile PB's files, one seam line (adding the input to `vite.web.config.ts`) is the fallback. Record which.
- Possible extra: pane-page needs an "ambient" mode to skip `WebConnect`/security notice; do it in the PB entry, not in Orca.
- Count: expected 0-1 seam patches for hosting. State the number in the record.

### Common pitfalls (spike 004)
- **Socket path length:** orcad's Unix socket lives directly in the profile directory and exceeds 108 bytes under this worktree path; the EXT-01 preparation used the short alias `/home/chris/.cache/pb-ext01-orca` [VERIFIED: 60-EXT01-RECORD.md note 1]. Use a short alias for the spike profile.
- **Profile defaults:** `worktree create` has no location flag and defaults to `~/orca/workspaces/<repo>` [VERIFIED: 60-EXT01-RECORD.md note 2]. Use a throwaway repo and remove the worktree afterwards.
- **Pairing offer in logs:** use `installOutputRedaction` for every orcad-adjacent process.
- **Stale session key:** a stored pairing under the Theia origin persists across runs; use a fresh profile (`makeProfile`) per run.
- **Tailwind preflight in Route A** will restyle Theia buttons; do not conclude "works" from a screenshot of the pane alone, check Theia chrome too.

## Spike 005: browser parity (BRW-01)

### Counts at the pin (1.4.248), all re-derived this session
| Source | Count | How counted |
|---|---|---|
| `BROWSER_CLIENT_AUTOMATION_METHODS` | 65 | `'browser.*'` strings inside the `as const` array [VERIFIED: orca/src/shared/browser-client-automation-protocol.ts:10-77] |
| `RuntimeBrowserCommands` members | 83 | lines `readonly browser...` in `class RuntimeBrowserCommands` [VERIFIED: main/runtime/browser/browser-commands.ts:17+] |
| CLI browser specs | 80 | `path: [` in `cli/specs/browser-basic.ts` (40) and `browser-advanced.ts` (40) [VERIFIED] |
| `browser.*` RPC definitions | 92 (incl. any in test files; exclude `*.test.ts`) | `name: 'browser.…'` under `main/runtime/rpc/methods/` |
| RPC names not in the automation list | 27 | clientHost.{attach,commandResult,fileChannel.{abort,read,write},pageMetadata}, identity.{get,set}, openUrl, profile* (6), screencast(+unsubscribe), tab{Close,Create,Current,List,Show,Switch}, tabProfile{Clone,Show}, tabSetProfile |
| Automation names missing an RPC definition | 0 | `comm` of the two sorted lists |

These match FEATURES.md (80 / 83 / 65) written against 1.4.214, so no ability set drift between 1.4.214 and 1.4.248. The 83 CDP-method scan in FEATURES A.2 was not re-run; keep it a note, not a derived row.

### Derivation rule for `scripts/orca-browser-parity.mjs`
Ability identity = the RPC method name (`browser.goto` etc.). Union of three derived sets, all by regex over source text (no TypeScript API):
1. **Automation set A:** body of `export const BROWSER_CLIENT_AUTOMATION_METHODS = [` ... `] as const` in `src/shared/browser-client-automation-protocol.ts`; each `'browser.<name>'`.
2. **RPC set R:** every `name: 'browser.<name>'` in non-test files under `src/main/runtime/rpc/methods/`. This is the full ability set (A is a subset of R).
3. **Provider members M:** `readonly browser<Name>` fields of `class RuntimeBrowserCommands` in `src/main/runtime/browser/browser-commands.ts` (assert count equals the RPC-derived count of non-clientHost, non-screencast methods plus helpers; mismatches are printed, not hidden).
4. **CLI map:** each `callRuntime`-style use of `'browser.<name>'` in `src/cli/**` identifies CLI/agent users; the `path:` arrays in `browser-basic.ts`/`browser-advanced.ts` give the user-visible command names.
Component user classification, per RPC name: `agent+CLI` if it appears under `src/cli/`; `renderer` if it appears under `src/renderer/` AND is in R (**intersect with R, because renderer i18n keys such as `browser.history.title` also match the pattern**: a raw grep of the renderer printed 207 names, mostly translation keys [VERIFIED: grep output]); `orcad` if under `src/main/orcad/` (14 names found: certificate.proceed, click, geolocation, goto, openUrl, profileClearGoogleCookies, profileImportFromBrowser, profileList, screencast.unsubscribe, screenshot, tabCreate, tabList, tabShow, viewport); `main`/desktop if under `src/main/browser/desktop-browser-bridge`.
Fail conditions (each needs a planted fault in `--self-test`): R member with no DISPOSITIONS row; DISPOSITIONS row with no R member; derived count of any of A/R/M/CLI equals 0 (tripwire for a moved file or renamed constant); a row whose component set disagrees with the derived users. The `--self-test` follows the 60-02 pattern (fixture constants named `.fixture-*` so a green run proves derivation rather than literals).
Data shape for DISPOSITIONS.md: one Markdown table row per RPC name with columns `ability | disposition | Gecko mechanism | tier | note`, where disposition is one of `BiDi`, `BiDi+`, `actor`, `native`, `impossible` (the five in P61-04). Pre-fill from FEATURES.md A.1/A.3 rows (A1-01..A1-26, U-01..U-30) but re-label from this session's evidence; their "guess" labels stay guesses until a run.

### Seam: S1 vs S2 (the P61-05 choice needs this evidence)
- **S1 (P61-05):** `OrcadBrowserProvider.kind` is the closed union `'electron' | 'chromium'` [VERIFIED: orcad-browser-provider.ts:18]; `resolveOrcadBrowserProvider` returns `declined({reason:'unconfigured'})` unless an installed Electron or `ORCA_BROWSER_EXECUTABLE` plus `agent-browser` binary exists [VERIFIED: orcad-browser-provider.ts:195-231]. A PB provider therefore needs at least a new kind and a branch: one to few seam lines in `orcad-browser-provider.ts` (plus the file adding the provider). `setRuntimeBrowserCommandsFactory` and the `Proxy` forwarding are in `orcad-browser-startup.ts:25-56`; the factory type is `(host: RuntimeBrowserCommandHost) => RuntimeBrowserCommands` [VERIFIED: runtime-browser-commands-factory.ts].
- **S2 (zero patch):** `browser.clientHost.attach` requires `clientKind === 'runtime'`, a connection id, a paired device id, and the client capability `browser.clientHost.v1`; otherwise it throws `authenticated_browser_client_host_required` / `browser_client_host_capability_required` [VERIFIED: rpc/methods/browser-client-host.ts:26-34; BROWSER_CLIENT_HOST_RUNTIME_CAPABILITY in shared/browser-runtime-capabilities.ts:10]. The pairing offer spike 003 used has `scope:"runtime"`; a PB-written client (reusing `web-runtime-client.ts`) could declare the capability and host pages. orcad already sets `clientHostingWithoutEngine: true` [VERIFIED: orcad-browser-startup.ts:46-51], so it serves client-hosted pages with no engine. Open: whether the lease registry accepts a non-desktop host; acceptance is a runtime question.
- **Recommendation to put in the plan:** the record chooses between S1 and S2 using one measured attach attempt (S2) and the seam-line count (S1), then states which Phase 66 builds. Keep P61-05's S1 as the default only if the S2 attach is refused at runtime. Flag this to Chris as a possible reversal of P61-05, because S2 removes the Orca patch.

### FEATURES.md questions 1-8: what source answers now, what needs a run
| Q | Answer from source | Still needs a run |
|---|---|---|
| 1 S1 vs S2, can a PB client attach with a web-client token | Gate: kind `runtime` + capability + paired device (above). | An actual attach by a PB client; whether leases accept it. |
| 2 Snapshot with stable `@eN` refs surviving delta | Orca keeps one `--delta` baseline per page, refs bound via CDP DOM node resolution (FEATURES A1-03). BiDi 153 has no AX-tree command (A.4, verified in tree per FEATURES). | Feasibility of a content-actor tree with stable refs; effort estimate. Likely `actor` disposition, YELLOW. |
| 3 Input/focus on a background web tab | Not answerable from source. | `input.performActions` on a background overlay, DPR/coordinate alignment. Spike item; can be a bounded probe. |
| 4 BiDi session ownership | `session.new` allows one session (FEATURES A.0 finding 4, MDN-sourced); PB harness owns it in tests. D-11 forbids a shipped BiDi port. | Whether an in-process transport exists; likely answered by choosing the chrome-side bridge (BRW-03), not BiDi. |
| 5 Prompt/popup handling on overlays | FEATURES cites `TabManager.getTabForBrowsingContext` null for overlays (spike 002c). | Re-test `handleUserPrompt` on a web tab. |
| 6 Link routing (http link clicked in an Orca terminal/chat) | Renderer stub `onOpenLinkInOrcaTab` in `web-browser-api.ts` (FEATURES U-23); setting UIs under `settings/browser/routing/`. | Observe what the web client does on a terminal link click; this decides how Orca-originated links reach PB tabs. |
| 7 Two client tabs on one orcad | Layout mirrored per device (`session.tabs.*` take `pairedDeviceId`) [VERIFIED: session-tabs.ts:40-50 context use]. | Run two pages; relevant to Route B/B' because panes ARE multiple client pages on one orcad. Cross-reference to spike 004. |
| 8 Re-pin changes that break injection selectors | Out of scope here (INJ-01, Phase 67). Record the derive-and-compare approach only. | — |
Mark Q3-Q7 `[ASSUMED]` in the record unless run.

### The one-ability proof (navigate + read title)
Target shape: an adapter `browserGoto({url}) => Promise<{url:string,title:string}>`, matching `BrowserGotoResult = { url: string; title: string }` [VERIFIED: src/shared/runtime-browser-contracts.ts:51]. PB side needs **no new `PowerBrowserAPI` code**: `webTabNavigate(tabId, url)` exists, scheme-walled, and the `PowerBrowserWebTabState` event already carries `url`, `title`, `loading` [VERIFIED: PowerBrowserAPI.sys.mjs:4122, 3829-3836]. The probe: `withProbeShell` -> `openWebTab(app, 'about:blank'-class fixture)` -> send navigate -> wait with `loadedAt(tabId, path)` -> read `title` from the state event. Serve the fixture page with `serveNavPages` (pb-live-probe.mjs:405). Report: wall time, and the adapter's return value. BiDi is not needed for this ability (consistent with D-11). Proving it "through the S1 seam" for real means loading a provider into orcad, which needs the S1 patch; the orcad bundle is `orca/out/orcad/orcad.js` (single 12.44 MB file [VERIFIED: 60-02-SUMMARY]), so injection without a patch is impossible. Carry the S1 patch as a `.patch` file in the spike directory, apply it to a scratch copy only (spike convention: Gecko-style, never applied to the live tree), and typecheck the adapter against the contract with Orca's `typecheck:node`. If that is too heavy for the lane, size S1 by the patch + typecheck and prove the PB half end to end; state exactly which half is unproven.

## Spike 006: live sharing (EXT-03)

### What Orca's agent sessions are
- Orca's Claude sessions are Claude Code sessions: transcript store `join(home,'.claude','projects')` [VERIFIED: orca/src/main/ai-vault/session-scanner-roots.ts:10; claude-cli-conversations.ts:11-19 uses `projects` under the account home with `~/.claude` as a candidate]. Managed Claude "accounts" can redirect `CLAUDE_CONFIG_DIR`; a fresh PB profile with no managed accounts should use `~/.claude`. [ASSUMED for the powerbrowser-orca profile; the floor run verifies by locating the transcript]
- Orca's own resume command is `claude [--effort X] --resume <id>` for terminal agents and `claude --resume <id> --fork-session` for forks [VERIFIED: shared/agent-resume-argv.ts:16-24, :97].
- Two launch surfaces: `--surface terminal` (the agent CLI in a PTY) and `--surface chat` (structured, Claude Agent SDK stream-json; `OWNED_FLAGS` includes `resume`, `session-id`, `dangerously-skip-permissions`) [VERIFIED: cli/specs/agent-launch.ts; main/claude/structured/launch/claude-structured-launch-args.ts:4-30]. Use `--surface terminal` for the floor so the resume is the plain CLI path.
- Default Orca agent flags include `--dangerously-skip-permissions` (D-12) [VERIFIED: tui-agent-launch-defaults.ts and shared/agent-permission-args.ts exist; value not re-read].

### The extension (Anthropic.claude-code 2.1.321, linux-x64), read from the published package
Read `extension/package.json` (24,521 bytes) and `extension/extension.js` (3.58 MB, minified); extracted only those two files from the downloaded vsix into the session scratch directory, never the 341 MB bundled `native-binary/claude`.
- `engines.vscode ^1.94.0`; activation `onStartupFinished`, `onWebviewPanel:claudeVSCodePanel`; `main ./extension.js` [VERIFIED: package.json].
- Settings include `claudeCode.useTerminal`, `claudeCode.claudeProcessWrapper`, `claudeCode.environmentVariables`, `claudeCode.preferredLocation`, `claudeCode.continueAfterReload` [VERIFIED: package.json contributes.configuration].
- Commands include `claude-vscode.editor.open`, `claude-vscode.primaryEditor.open`, `claude-vscode.terminal.open`, `claude-vscode.sidebar.open`, `claude-vscode.newConversation`, `claude-vscode.reopenClosedSession` [VERIFIED: package.json contributes.commands].
- **Open a given session id:** the URI handler `case"/open":` reads `session` and `prompt` query params, validates the id (`YC`), and runs `claude-vscode.primaryEditor.open(sessionId, prompt)` [VERIFIED: extension.js, text `registerUriHandler({handleUri(E){...case"/open":{let x=C.get("session")...executeCommand("claude-vscode.primaryEditor.open",x,w)`]. `claude-vscode.editor.open` takes `(sessionId, initialPrompt, viewColumn, ...)` and the webview request `new_conversation_tab` carries `sessionId` [VERIFIED: extension.js].
- **Terminal resume:** `claude-vscode.terminal.open(command?, args[], location)` validates `args` as `[]` or exactly `["--resume", <valid id>]` (`n.length===2&&n[0]==="--resume"&&un(n[1])!==null`) and runs `window.createTerminal(...)` then waits on `onDidChangeTerminalShellIntegration` [VERIFIED: extension.js]. That is the floor, as a first-class entry point.
- The SDK spawn the extension performs builds `--continue` / `--resume <id>` arguments for its own `claude` child [VERIFIED: extension.js argument-building text].
- **No attach capability found:** the strings `--bg`, `--background`, `attach` do not appear as CLI arguments in `extension.js`; only `--resume`, `--session-id`, `--fork-session` appear as quoted arguments [VERIFIED: grep counts 3, 1, 1]. This is an absence in minified code; treat as "no attach found", not "none exists". The extension therefore cannot adopt a process Orca's PTY already owns. [ASSUMED: nothing in webview/index.js changes this; not read]
- Theia compatibility risk (EXT-01, not this phase): the terminal path depends on `onDidChangeTerminalShellIntegration` and the extension needs VS Code API 1.94+ [VERIFIED: usage text]; Theia 1.76 reports 1.139.0 [VERIFIED: 60-EXT01-RECORD.md].

### Claude CLI on this host
`claude --version` -> `2.1.321 (Claude Code)` (same as the extension) [VERIFIED]. `claude auth status` -> `loggedIn: true`, `authMethod: claude.ai`, `apiProvider: firstParty` [VERIFIED]. `~/.claude/projects` holds 216 project directories [VERIFIED: ls | wc].
New finding from `claude --help`: `--bg/--background` starts a session in the background; `claude attach <id|name>` "Open[s] the background session in this terminal"; `claude agents` lists them; `--resume <id> --bg` "continues that session in the background under the same ID, or starts a copy and says so when the session is already running"; `--session-id <uuid>` fixes the id; `--fork-session` makes a new id on resume; `--ide` connects the CLI to an IDE; `--remote-control` exists [VERIFIED: claude --help output; behaviours not run]. Consequences for the record:
- Resuming a **running** session starts a copy (per help text), so "share the live agent" by `--resume` is a fork, not a share.
- A live share is conceptually possible only if the agent runs as a Claude background session that two clients attach to. Orca does not launch agents that way today (its terminal launch is a plain `claude` in a PTY). That would be an Orca launch-flag change or a PB-side launcher, a Phase 63 design option, not something the extension does by itself. Put this in the record as "possible with a changed launch; unproven; needs a run of `claude --bg` + `claude attach`".
- `--ide` is the opposite direction: a Claude CLI in a Theia terminal tab can connect to the IDE extension (diff and selection integration). Not session sharing; mention only.

### Floor-run recipe (autonomous, no Chris)
1. Short profile alias (e.g. `~/.cache/pb-p61-orca`) for both `ORCA_USER_DATA` and `ORCA_USER_DATA_PATH`; start orcad through `orca-run.mjs` (`ensurePbNode`, `orcadEnv`, `startOrcad`). [VERIFIED reuse: 60-EXT01-RECORD.md Preparation]
2. Throwaway git repo under `.mozbuild/`; `node orca/out/cli/index.js repo add --path <repo>` then `worktree create --name p61 --repo id:<id> --json` with env `orcadEnv(process.env, profile)`. The CLI is already built at `orca/out/cli/index.js`; its `--version` prints "Could not determine the Orca version" and that is expected [VERIFIED: 60-EXT01-RECORD.md note 3].
3. `orca agent launch --agent claude --surface terminal --worktree <selector> --prompt "Reply with the single token P61-MARKER-<nonce> and stop."`. This starts a real Claude session on Chris's login and costs tokens: acceptable (the phase's floor run), keep the prompt minimal. The "do not start sessions" restriction applied to this research pass only.
4. Capture the session id: newest `*.jsonl` under `~/.claude/projects/<encoded worktree cwd>/` (the encoded name is the worktree path with `/` -> `-`, matching the existing directory names such as `-home-chris-agent-red-exchange-...` [VERIFIED: ls]). Cross-check with `orca terminal list --json`. [ASSUMED: the field name carrying the provider session id; read `session.tabs.list` output in the run]
5. Stop the agent (`orca terminal ...` close or reap via `stopOrcad`), assert the process is gone.
6. Resume: `cd <worktree> && claude --resume <id> -p "Repeat the token from the earlier turn."` (non-interactive; `-p` exists [VERIFIED: help]). Evidence = the printed answer contains `P61-MARKER-<nonce>` and the same jsonl gained a second user turn. Also run the extension-shaped variant `claude --resume <id> --fork-session -p ...` only if time allows.
7. Extension-side proof of the floor is the deferred half (needs Theia + extension install = EXT-01). Record the exact commands to run then: `claude-vscode.terminal.open` with args `["--resume", id]`, and `vscode://Anthropic.claude-code/open?session=<id>`.
Redact any pairing offer from stdout (`installOutputRedaction`); never paste `~/.claude` transcript content beyond the marker lines into planning files.

### Verdict guidance for the record (P61-07)
Expected shape: floor GREEN (resume of a stopped Orca session works and the extension exposes a session-id entry point); live share YELLOW/RED for the extension alone (no attach; resume of a running session forks), with the conditional alternative "agent launched as a `--bg` Claude session, attached from both sides" marked unproven. Recommend now: Phase 63 builds agent sessions as Theia terminals with `--resume` on demand (the P61-07 fallback), and lists `--bg`/`attach` as an optional later investigation. Do not promise it in ROADMAP text.

## Common Pitfalls

### Pitfall 1: Treating `orca.web.workspaceSession.v1` as layout
**What goes wrong:** the observation prototype listens to localStorage and sees nothing change when a pane opens.
**Why:** the key stores only active repo/worktree and URL history [VERIFIED: web-workspace-session.ts].
**How to avoid:** subscribe to the Zustand store (A), post from the pane page (B), or use RPC. Reword P61-02's acceptance, keep the one-second clock.
**Warning signs:** `storage` events fire only for the active-worktree change.

### Pitfall 2: Panes rendered without hydrated store
**What goes wrong:** `TerminalPane` mounts with an unknown `tabId`, renders nothing or throws.
**How to avoid:** copy the `FloatingTerminalPanelSurface` mount and run the same startup hooks; prototype in a plain page before involving Theia.

### Pitfall 3: Measuring only the pane, not the host
**What goes wrong:** Route A looks cheap while its CSS has restyled Theia.
**How to avoid:** the CSS and memory columns are measured on Theia elements and the whole process tree, with a planted-leak control.

### Pitfall 4: Raw grep counts for renderer ability users
**What goes wrong:** 207 "renderer" names, mostly i18n keys.
**How to avoid:** intersect with the RPC set (above).

### Pitfall 5: The parity script silently passing on an empty derivation
**How to avoid:** count tripwire (zero members or a changed file path is red), `.fixture-*` constants in the self-test, and the rule "stage new files before trusting the brand scan".

### Pitfall 6: Brand probe drift
`.claude/skills/spike-findings-Power-Browser/references/*.md` and `scripts/` files are tracked and scanned. The `Orca` (title, 93), `orca` (lower, 420), `ORCA`, `orcad` (lower 179) and `Orcad` tokens are all `coincidental` with `expected_count` plus `expected_files`/`only_in` lists [VERIFIED: inventory/brand-tokens.json read this session; existing wrap-up files `orca-client-hosting.md` and `sources/003-.../*` are already listed]. Every new tracked file that spells these tokens (the three new reference files, `scripts/orca-browser-parity.mjs`, any new `verify-platform.sh` rows, `docs/BUILD.md` edits) changes the counts and file lists. Plan one explicit task: regenerate counts from the tree, update the rows, run `node scripts/scan-brand-residue.mjs` after staging. `.planning/` is excluded [per the Phase 60-04 rule in CONTEXT].

### Pitfall 7: Concurrency
Three lanes run live probes; use `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, headless only. Lanes never edit STATE.md, ROADMAP.md, WINDOWS.md or the ledger.

## Code Examples

### Count tripwire and derivation (regex over source text)
```js
// Source: pattern from scripts/verify-orca-build-shape.mjs:55-59 (regex on `export const NAME = ...`), applied to the automation list
import { readFileSync } from 'node:fs';
const src = readFileSync(`${orcaRoot}/src/shared/browser-client-automation-protocol.ts`, 'utf8');
const body = /export const BROWSER_CLIENT_AUTOMATION_METHODS = \[([\s\S]*?)\] as const/.exec(src)?.[1];
if (!body) throw new Error('automation constant not found');          // moved or renamed upstream: red, never green
const automation = new Set([...body.matchAll(/'(browser\.[A-Za-z.]+)'/g)].map(m => m[1]));
if (automation.size === 0) throw new Error('automation list empty');   // 65 at 1.4.248, printed not asserted
```

### Per-pane memory (chrome scope)
```js
// Source: ChromeUtils.requestProcInfo (upstream/dom/chrome-webidl/ChromeUtils.webidl:781); run via app.evaluateIn(app.chrome, ...)
const info = await ChromeUtils.requestProcInfo();
const rows = [info, ...info.children].map(p => ({ pid: p.pid, type: p.type ?? 'parent', memory: p.memory,
  urls: (p.windows ?? []).map(w => w.documentURI?.spec ?? String(w.documentURI)) }));
return JSON.stringify({ total: rows.reduce((a, r) => a + r.memory, 0), rows });
```

### Title through the existing state event
```js
// Source: pb-live-probe.mjs:177,495-498 helpers; state payload at PowerBrowserAPI.sys.mjs:3829-3836
const tabId = await openWebTab(app, fixtureUrl('/a'));
// navigate through the same channel the Theia widget uses, then wait for the matching state push
// loadedAt(tabId, '/b')(p) is true when { kind:'state', tabId, loading:false, url endsWith '/b' } arrives; p.title is the page title
```

### Resume floor
```sh
# Source: claude --help (2.1.321, this host); Orca resume argv shared/agent-resume-argv.ts:16-24
cd "$WORKTREE" && claude --resume "$SESSION_ID" -p "Repeat the token from the earlier turn."
```

## State of the Art

| Old approach (notes) | Current (pin 1.4.248) | Impact |
|---|---|---|
| FEATURES paths and line numbers from 1.4.214 | Counts equal (80/83/65); `OrcadBrowserProvider.kind` moved from :15 to :18 | Cite pin-time line numbers in the record |
| "Orca desktop installed" assumption for browser | `resolveOrcadBrowserProvider` declines with `unconfigured` when no desktop and no `ORCA_BROWSER_EXECUTABLE` | Browser capability is `browser_unavailable` for PB's orcad by default |
| Extension "attach" hope | Extension source: resume by id only; CLI has `--bg`/`attach` | Live share = launch-mode question, not an extension feature |

**Deprecated/outdated in the notes:** the localStorage-layout observation (P61-02); the "iframe" reading of a PB web tab.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vite builds the merged multi-input PB config without further tweaks and leaves tracked Orca files untouched | Pattern 1 | Wave 0 of the pane lane fails; fallback is one seam line in `vite.web.config.ts` |
| A2 | `http://127.0.0.1` is a secure context in Gecko so the device-key path is `persistent` on both origins | Spike 004 | Pairing falls back to token storage; Route A needs the offer injected differently |
| A3 | No CSP on the Theia sidecar blocks `connect-src ws://127.0.0.1:*` | Spike 004 | Route A/B WebSocket fails; would need a sidecar header change (PB code, allowed) |
| A4 | A single React copy via externals/globals works with Orca's lazy components | Spike 004 | Two copies remain; criterion 1's "single copy" needs an owner call or Route B |
| A5 | Shadow DOM does not contain Tailwind v4 `:root` variables (so cannot isolate Route A) | Spike 004 | Route A might be cheaper than predicted |
| A6 | powerbrowser-orca profile uses `~/.claude` (no managed Claude account) | Spike 006 | Transcript is elsewhere; floor run locates it by search |
| A7 | The provider-session id appears in `orca terminal list --json` / `session.tabs.list` | Spike 006 | Fall back to newest jsonl |
| A8 | Nothing in `webview/index.js` offers attach; only `extension.js` was read | Spike 006 | A live-share path exists; record would be too pessimistic |
| A9 | S2 lease registry accepts a non-desktop host | Spike 005 | S1 stays the seam (one to few patch lines) |
| A10 | FEATURES Gecko dispositions marked "guess" (snapshot actor, clipboard, emulation) remain guesses until run | Spike 005 | Phase 66 scope estimate wrong; mark rows `[ASSUMED]` in DISPOSITIONS |

## Open Questions

1. **S1 or S2 for Phase 66?**
   - Known: S2 gate permits a `runtime`-kind client with the capability; S1 needs a closed-union seam.
   - Unclear: whether leases accept a PB host; whether CDP-bound abilities (snapshot refs) can be served via the automation protocol.
   - Recommendation: one measured attach in spike 005; record both outcomes; flag as a possible P61-05 reversal.
2. **Can the Lumino-side close be a pure RPC (`session.tabs.close`) without desyncing the renderer?**
   - Recommendation: test in Route A and B; decide in the pane record.
3. **Is Route B' (PB web tab per pane page) viable for TAB-04's "one pane = one tab" alongside Theia's dock?**
   - Known: web tabs move between modes and appear in Organising today; spike 003 proved the client in one.
   - Unclear: process cost per overlay and the shared `orca.web.workspaceSession.v1` race.
   - Recommendation: measure it as the third column.
4. **Do `layout.subscribe` frames carry data while the renderer owns layout?** Measure (RPC alternative for observation).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Orca build at `orca/out` (orcad, web, cli) | 004, 006 | yes | v1.4.248 @ 965978bc | rebuild: `nix develop .#orca --command bash scripts/build-orca.sh` |
| Node for scripts | all | yes | v24.22.1 (host); probe Node 24.19.0 via `ensurePbNode` | — |
| `objdir/dist/bin/powerbrowser` | 004, 005 | yes (per the brief) | not re-run | — |
| Theia app build | 004 Route A/B | yes (per the brief) | 1.76.0 | — |
| Claude CLI, logged in | 006 | yes | 2.1.321, `claude.ai` | — |
| Open VSX reachability | 006 | yes | fetched this session | — |
| `unzip` | study | no | — | `python3 -I` zipfile (used) |
| codebase-memory-mcp / graph tools | exploration | no (connection closed this session) | — | grep/Read (used) |
| `pnpm` 12.14.0 in `.#orca` | rebuild | yes per 60-02 | — | — |

**Missing dependencies with no fallback:** none found.
**Missing dependencies with fallback:** `unzip` (python zipfile).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node ESM scripts with a built-in `--self-test`, registered as rows in `scripts/verify-platform.sh` (project rule: one driver, one registry) |
| Config file | `scripts/verify-platform.sh` registry arrays (quick tier near line 3837-3854, full tier near 6415-6432) |
| Quick run command | `scripts/verify-platform.sh --only orca-browser-parity-self-test` |
| Full suite command | `scripts/verify-platform.sh` (then `--quick` as the commit gate) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRW-01 | Ability set derived from the pinned tree equals DISPOSITIONS rows as a set; each fault plant red naming it | unit + derive-and-compare | `scripts/verify-platform.sh --only orca-browser-parity-self-test` and `--only orca-browser-parity` | Wave 0 (new) |
| BRW-01 | One ability navigate+title through PB web-tab path | live probe (headless, flock) | `flock /home/chris/coding/Power-Browser/.git/pb-live.lock node .planning/spikes/005-orca-browser-parity/provider-proof.mjs` | Wave 0 (new) |
| TAB-03 | Pane renders in a Lumino widget; Orca-side pane open appears as a Lumino tab < 1 s | live probe | `flock ... node .planning/spikes/004-orca-pane-hosting/measure.mjs --route a` (and `b`, `b-prime`) | Wave 0 (new) |
| TAB-03 | Cross-origin WS result, CSS leak counts (with planted control), memory deltas after 3 panes | live probe, numbers into `results.md` | same script, `--measure css|memory|ws` | Wave 0 |
| TAB-03 | Single React copy proven | in-page check `Object.keys` of React instances via a probe global | in `measure.mjs` | Wave 0 |
| EXT-03 | Stopped Orca Claude session resumed with `claude --resume`, marker echoed, jsonl grew | live (CLI + Claude login) | `node .planning/spikes/006-orca-live-sharing/floor-run.mjs` | Wave 0 (new) |
| EXT-03 | Extension source facts recorded | document review | record cites file/pattern; grep commands listed in `extension-notes.md` | Wave 0 |
| Criterion 4 | ROADMAP Phases 63/64/66 carry "Route chosen by Phase 61: ..." | doc check | `grep -c "Route chosen by Phase 61" .planning/workstreams/orca/ROADMAP.md` expecting 3 | coordinator step |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --quick` (includes the new self-test row) plus `node scripts/scan-brand-residue.mjs` after staging.
- **Per wave merge:** full registry minus live rows already run under flock.
- **Phase gate:** `--quick` green, parity row green against the built `orca/` tree, three records with VERDICT lines, ROADMAP lines present.

### Wave 0 Gaps
- [ ] `scripts/orca-browser-parity.mjs` with `--self-test` (fixture tree with `.fixture-*` names; plants: orphan row, missing row, empty derivation, moved constant, wrong component set).
- [ ] `.planning/spikes/005-orca-browser-parity/DISPOSITIONS.md` (one row per RPC name, 92 rows at the pin).
- [ ] Two rows in `scripts/verify-platform.sh` (`orca-browser-parity-self-test` quick; `orca-browser-parity` full, SKIP when `orca/` absent as `orca-build-shape` does).
- [ ] `inventory/brand-tokens.json` rows updated for every new tracked file that spells Orca/orca/orcad.
- [ ] PB Vite config + copy step + one-pane page (spike 004); measurement script.
- [ ] `floor-run.mjs` (spike 006).
- Automated: all of the above. **Needs Chris:** nothing in this phase except overrides of the auto-mode picks, and the deferred extension-session half (EXT-01, D-18). A RED verdict is asked in the box before the phase it affects is planned (P61-09).

## Security Domain

`security_enforcement` not set to false, so included. The phase is throwaway spikes, but it handles credentials and opens local network surfaces.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Orca device-token pairing; the pairing offer is a reusable bearer credential [VERIFIED: orca-client-hosting.md]. Never in logs, history, committed files: reuse `installOutputRedaction` and URL stripping |
| V3 Session Management | yes | Claude session transcripts under `~/.claude` are user data; reference by id only, never paste content beyond the marker |
| V4 Access Control | yes | Route A/B must not widen Theia's token gate; D-17 Origin check is Phase 67. S2 attach relies on orcad's `clientKind==='runtime'` gate |
| V5 Input Validation | yes | `postMessage` handler must check `event.origin`; scheme wall for any URL sent to `webTabNavigate` already exists |
| V6 Cryptography | no | Orca's E2EE is reused as-is, never reimplemented |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Pairing offer leak via logs/screenshots/results.md | Information disclosure | redaction at the process boundary; scan spike outputs for `pairing`/`orca://pair` before committing |
| Cross-origin page reaching orcad WS with a stolen offer | Spoofing/Elevation | orcad has no Origin check [VERIFIED]; mitigation is the token, so note it as the residual risk for Phase 67 |
| `postMessage` from an arbitrary frame to the Theia widget | Tampering | validate origin and a per-widget nonce |
| Real-profile contamination (`~/orca/workspaces`, user's Orca desktop) | Tampering | throwaway repo, dedicated profile, remove worktree afterwards |
| Spending the user's Claude login | Repudiation/cost | single minimal prompt, recorded |

## Spike mechanics and hand-off (criterion 4, P61-09, P61-10)

- **Record shape:** `.planning/spikes/003-…/README.md` frontmatter (`spike`, `idea`, `name`, `type`, `validates`, `verdict`, `related`, `tags`) with sections What This Validates, Research, How to Run, What to Expect, Results, Investigation Trail, plus `results.md` [VERIFIED: 003 README read]. Add a `## VERDICT` section (`GREEN | YELLOW (conditions) | RED (owner decision)`) and a `Route for Phase N:` line to each. Spike 004 answers the five questions in NOTE-orca-tabs-as-pb-tabs-spike.md (inventory, routes a-d, size/re-pin cost, hard-rule fit, interaction with browser parity).
- **CONVENTIONS** (Node ESM, repo harness, fresh profile per run, comparison spikes share a number with a letter): 004 is a comparison of routes A / B / B' so name the runs `004a`, `004b`, `004c` or keep one directory with three result files; pick one and say so in the manifest.
- **MANIFEST rows to add** (existing columns `# | Idea | Name | Type | Validates | Verdict | Tags`):
  - `004 | orca-tabs-as-pb-tabs | orca-pane-hosting | comparison | Given one Orca pane component, when mounted via Route A/B/B', then WS, CSS and memory numbers and a layout-observation latency decide the route | <verdict> | orca, lumino, react, panes`
  - `005 | orca-browser-parity | orca-browser-parity | standard | Given the pinned Orca tree, when the parity script derives abilities, then each ability has a Gecko disposition and one ability runs through a PB web tab | <verdict> | orca, browser, bidi, provider`
  - `006 | orca-live-sharing | orca-live-sharing | standard | Given a stopped Orca Claude session, when resumed with claude --resume, then the transcript continues; and the extension's attach capability is recorded | <verdict> | orca, claude-code, extension, resume`
  Add two `### idea` headings (as the manifest does for 001-003) with requirements copied from CONTEXT.
- **Wrap-up (P61-10):** `.planning/spikes/WRAP-UP-SUMMARY.md` and the skill index (`SKILL.md` Feature Areas table, `Processed Spikes`, `Spike sessions wrapped` line) are updated; add three references. The skill's `sources/` copies of spike scripts only resolve relative imports from the originals, so run from `.planning/spikes/` [VERIFIED: SKILL.md]. The wrap-up files are tracked, hence the brand rows (Pitfall 6).
- **ROADMAP hand-off:** coordinator adds "Route chosen by Phase 61: ..." lines under Phases 63, 64 and 66 (not the lanes). Lanes never touch ROADMAP/STATE/WINDOWS/ledger.
- **Lane/wave suggestion for the planner:** Wave 1 = three disjoint lanes (004 pane, 005 parity, 006 sharing; 005 and 006 need only the fetched tree, 004 builds Orca). Wave 2 = coordinator: merge in 004, 005, 006 order, brand-token rows, MANIFEST, ROADMAP lines, wrap-up skill references, `--quick`. 004 has the heaviest internal order: Wave 0 PB config + standalone one-pane page, then Route A in Theia, then Route B, then B', then measurements, then the record.

## Sources

### Primary (HIGH confidence, read this session)
- Orca 1.4.248 source at `orca/`: `vite.web.config.ts`, `config/scripts/run-vite-web-build.mjs`, `config/scripts/verify-web-build.mjs`, `src/renderer/web-index.html`, `src/renderer/src/web/{main.tsx,web-workspace-session.ts,web-device-key.ts,preload-api/web-storage.ts}`, `src/renderer/src/components/{WorkspacePaneOverlayLayers,tab-group/TabGroupPanel,tab-group/RetainedPaneHost,terminal-pane/*,native-chat/StructuredAgentSessionPaneOverlayLayer}.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/assets/main.css`, `src/shared/{tab-types,layout-owner-switch,browser-client-automation-protocol,runtime-browser-contracts,browser-runtime-capabilities,agent-resume-argv}.ts`, `src/main/runtime/rpc/{ws-transport,static-web-client-handler}.ts`, `src/main/runtime/rpc/methods/{session-tabs,workspace-layout,browser-client-host}.ts`, `src/main/orcad/{orcad-browser-provider,orcad-browser-startup}.ts`, `src/main/runtime/browser/browser-commands.ts`, `src/main/ai-vault/session-scanner-roots.ts`, `src/main/claude/**`, `src/cli/specs/{browser-*,agent-launch}.ts`.
- PB tree: `theia/package.json`, `theia/extensions/{tab-uris,chrome-bar}/src/browser/*`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/INTERNAL-APIS.md`, `scripts/lib/{pb-live-probe,firefox-bidi,orca-run}.mjs`, `inventory/brand-tokens.json`, `upstream/dom/chrome-webidl/ChromeUtils.webidl`.
- Planning: 61-CONTEXT, REQUIREMENTS, ROADMAP, DECISIONS, both NOTE files, FEATURES.md, spike 003 README, CONVENTIONS, MANIFEST, spike-findings skill + `orca-client-hosting.md`, 60-02/60-03 SUMMARY, 60-EXT01-RECORD.
- Open VSX registry API for `Anthropic/claude-code` 2.1.321 and the downloaded `linux-x64` vsix (package.json, extension.js read from the scratch copy).
- Local commands: `claude --version`, `claude --help`, `claude auth status`, `claude attach --help`.

### Secondary (MEDIUM)
- FEATURES.md Gecko dispositions (authored 2026-11-04 against 1.4.214; MDN BCD / Gecko tree facts there not re-verified this session).

### Tertiary (LOW)
- None used. No web search was run beyond the Open VSX package fetch.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, nothing new is installed and every version was read from `node_modules` or the CLI.
- Architecture (pane mount, observation, seams): MEDIUM, source-grounded but untested; the spikes are the test.
- Browser parity enumeration: HIGH for counts and derivation sources; LOW-MEDIUM for Gecko dispositions (guesses from FEATURES).
- Live sharing: MEDIUM, extension findings come from minified code plus the CLI help; no run yet.
- Pitfalls: HIGH for the four premise corrections.

**Research date:** 2026-11-09
**Valid until:** until the Orca pin moves (about daily upstream; the pin is fixed at 1.4.248, so valid for the phase) or the extension updates (2.1.321 is the same day's release).
