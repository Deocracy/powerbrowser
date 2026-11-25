---
spike: 004
idea: orca-tabs-as-pb-tabs
name: orca-pane-hosting
type: comparison
validates: "Given one Orca pane component built from the pinned source by a PB-added Vite entry, when it is hosted in PowerBrowser's dock by Route A (same document, Theia ReactWidget), Route B (iframe in a Lumino widget) and Route B' (one PB web tab per pane page), then the cross-origin WebSocket result, the CSS leak counts, the memory per pane and the layout-observation latency decide the route Phase 64 builds"
verdict: YELLOW
related: [TAB-03, D-15, D-16, D-29, spike-003]
tags: [orca, orcad, lumino, react, panes, vite, css-isolation, memory, live-probe]
---

# Spike 004: Orca pane hosting in PowerBrowser's dock

One directory holds the three routes (A, B, B') with one results file each, instead of
`004a`/`004b`/`004c`: the routes share one build and one harness.

## What This Validates

Given Orca v1.4.248 built in this lane and its orcad on loopback, when one Orca terminal pane is
hosted in PowerBrowser's dock three ways, then:

1. **A1, extra web entry.** A PB-added Vite config that `mergeConfig`s `orca/vite.web.config.ts`
   builds a pane page and a library bundle beside Orca's untouched build, with zero edits to any
   file Orca's git tracks.
2. **A4, one React.** The Route A bundle carries no React of its own and runs on Theia's React
   19.2.8, proven by a two-copy control build and a run-time identity check.
3. **Mount.** The pane renders in a Lumino widget in the main area and shows live PTY output.
4. **The three numbers per route.** Cross-origin WebSocket to orcad (works, needs-change, fails);
   CSS leak counts in both directions, against a planted control rule; resident memory per added
   pane after three panes from `ChromeUtils.requestProcInfo`.
5. **Read-only layout observation (P61-11).** A pane opened on the Orca side appears as a new
   Lumino tab within one second, through the renderer store (A), a checked `postMessage` (B) or a
   second paired client (B'). Never through `orca.web.workspaceSession.v1`.
6. **The close.** What a Lumino-side close must call on the Orca side.

The terminal pane is the specimen (xterm, PTY RPC, the heaviest CSS). D-01 makes terminals Theia
terminals in the product, so the panes Phase 64 hosts are chat and the other Orca-only views; the
chat pane was not mounted here.

## Research

Source facts at the pin (61-RESEARCH.md has the full list):

- Tabs and layout live in the renderer's Zustand store (`unifiedTabsByWorktree`,
  `groupsByWorktree`, `layoutByWorktree`) and are host-owned: paired web clients receive them
  through `session.tabs` (`components/terminal/terminal-tab-create.ts:30`).
- Panes are mounted by worktree-level overlay layers and positioned by `RetainedPaneHost` over one
  registered body per tab group (`tab-group-body-geometry.ts`). Orca's own activity-terminal
  portal renders `TerminalPane` without it (`TerminalOverlaySlot.tsx`); the prototype does the
  same, because D-15 gives each pane its own Lumino widget.
- orcad's WebSocket server has no Origin check (`ws-transport.ts:212-215`) and its static handler
  sends no CORS, CSP or frame header (`static-web-client-handler.ts:92-100`).

## How to Run

Setup in the lane worktree:

    nix develop .#theia --command node scripts/generate.mjs
    bash scripts/fetch-orca.sh && nix develop .#orca --command bash scripts/build-orca.sh
    nix develop .#orca --command bash -c 'cd orca && ORCA_CLI_BUILD_COMPILER=tsrs node config/scripts/build-cli.mjs'
    nix develop .#theia --command bash -c 'cd theia && yarn install --ignore-scripts --frozen-lockfile && (cd node_modules/drivelist && node-gyp rebuild) && yarn build'

Route A needs Theia's React in the frame. Theia's frontend is one esbuild bundle with no module
registry, so the lane build publishes it: append this to the generated, git-ignored
`theia/applications/browser/src-gen/frontend/index.js` and re-bundle with
`nix develop .#theia --command bash -c 'cd theia/applications/browser && node esbuild.mjs --mode development'`:

    window.__pbReact = { React: require('react'), ReactDOM: require('react-dom'),
        ReactDOMClient: require('react-dom/client'), jsxRuntime: require('react/jsx-runtime'),
        ReactWidget: require('@theia/core/lib/browser/widgets/react-widget').ReactWidget,
        BaseWidget: require('@theia/core/lib/browser/widgets/widget').BaseWidget };

No tracked file under `theia/` changes (`git diff --name-only -- theia` stays empty). Every Orca
variable inherited from an Orca desktop session is scrubbed by the scripts themselves.

Build the pane entry, then run (headless, under the live lock):

    nix develop .#orca --command bash .planning/spikes/004-orca-pane-hosting/build-pb-entry.sh

    PB_FIREFOX_BIN=/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/objdir/dist/bin/powerbrowser \
      flock /home/chris/coding/Power-Browser/.git/pb-live.lock \
      node .planning/spikes/004-orca-pane-hosting/measure.mjs --route standalone --measure mount

    # --route a | b | b-prime    --measure mount | observe | ws | css | memory | all

`measure.mjs` points `PB_BACKEND_MAIN` at the lane's Theia build for routes a, b and b-prime.
orcad's profile lives in `.mozbuild/p61-01/powerbrowser-orca` behind the alias
`~/.cache/pb-p61-01-orca` (the Unix socket path limit); the throwaway repo is
`.mozbuild/p61-01/repo`. No `worktree create` is run, so nothing lands in `~/orca/workspaces`.

## What to Expect

`build-pb-entry.sh` ends with `build-pb-entry: PASS -- A1 tracked-dirty=0 ...; A4 marker=rendererPackageName control=1 externals=0; ...`.
`measure.mjs` ends with `measure: PASS -- route <r>, measure <m>, <results file>` and writes
`results-<route>.json`. Route B with `--measure all` ends with
`measure: FAIL -- css-leak-in: not measurable ...` (see Results); its `mount` and `observe` pass.

## Results

Numbers and the command behind each are in `results.md`. Summary:

| | Route A (same document) | Route B (iframe) | Route B' (PB web tab) |
|---|---|---|---|
| Mount in a main-area Lumino widget | yes, 1280 x 695 | yes, but the pane's box is 0 x 0 headless | yes, 1280 x 695 |
| React copies | 1 in the Theia document | 1 per pane document | 1 per pane page |
| Cross-origin WebSocket | works | works | works |
| Observation channel | `useAppStore.subscribe` | checked `postMessage` | second paired client |
| Latency to `addWidget` (1000 ms clock) | 91 ms | 106 ms | 74 ms |
| CSS out: rules added to Theia's document | 6,319 (845 global) + 78 at run time | 0 | 96 (78 global), from the observer script |
| CSS out: Theia computed values changed | 84 | 0 | 2 (on `html` only) |
| CSS in: pane computed values changed | 24 of 144 | not measured | 0 of 144 |
| Memory per pane, average of three | 43.0 MB | 121.0 MB | 197.9 MB |
| Memory, third pane alone | 6.1 MB | 75.8 MB | 177.4 MB |
| Memory, first pane | 112.4 MB | 205.8 MB | 146.3 MB |
| Close call | store `closeTerminalTab` in the Theia document | the same, inside a pane document; needs a command channel | the same, in any paired client |
| New Theia code | one widget class, one React hand-off | one widget class, one listener | none for hosting; an observer |
| Seam patches to Orca | 0 | 0 | 0 |

### Question 1: the view inventory

`TabContentType` has 8 members (`orca/src/shared/tab-types.ts:18-26`).

| Content type | Renderer path | orcad RPC it uses | Mount shape |
|---|---|---|---|
| terminal | `components/terminal-pane/TerminalPaneOverlayLayer.tsx` to `TerminalOverlaySlot.tsx` to `TerminalPane.tsx` | `session.tabs.*` (list, subscribe, createTerminal), `terminal.*` (list, send, split, multiplex, resolvePane), the PTY stream | overlay, keyed by tab id; hosted here |
| agent-session | `components/native-chat/StructuredAgentSessionPaneOverlayLayer.tsx` to `NativeChatView` | `nativeChat.subscribe`, `nativeChat.readSession`, `terminal.createAgentSession` | overlay, keyed by tab id |
| browser | `components/browser-pane/assemble-chrome/BrowserPaneOverlayLayer.tsx` (`RetainedBrowserPaneOverlayLayer`) | `browser.*` (92 definitions), `browser.clientHost.*` | overlay; becomes a PB web tab (Question 5) |
| simulator | `components/emulator-pane/EmulatorPaneOverlayLayer.tsx` | the emulator API of `web-browser-api.ts` | overlay, gated |
| editor | `EditorPanel` inside `components/tab-group/TabGroupPanel.tsx` | `files.*`, `git.*` | in the group body; Theia's editor per D-01 |
| diff | the same `EditorPanel` | `git.*` (branchDiff, status), `files.*` | in the group body; Theia's editor per D-01 |
| conflict-review | the same `EditorPanel` | `git.*` | in the group body |
| check-details | the same `EditorPanel` | hosted-review and `gh` namespaces | in the group body |

The RPC column for the four in-body types is read from the web preload API's namespaces, not
traced call by call.

The four overlay types are already detached from the group DOM and keyed by tab id, which is why
one of them mounts in a foreign widget. The four in-body types are not; D-01 sends editor and diff
to Theia, and conflict-review and check-details would need `EditorPanel` hosted the same way
(not tried).

### Question 2: the routes

| NOTE route | Here | Measured |
|---|---|---|
| (a) PB-written Theia widgets over orcad's RPC | not built. The observer reuses Orca's own client instead of reimplementing the private end-to-end encrypted RPC (ARCHITECTURE Q6) | the second-client observer: 74 ms, about 100 MB once, 96 injected style rules |
| (b) Orca's React components in Lumino widgets | Route A | 91 ms; 43.0 MB per pane (6.1 MB for the third); one React; 845 global rules and 84 changed Theia values out, 24 in |
| (c) separate web entry pages per view | Routes B and B'. No upstream Orca change is needed: the PB-added Vite config builds the page | B: 106 ms, 121.0 MB per pane, 0 out. B': 74 ms, 197.9 MB per pane, 0 in, 2 out |
| (d) hybrid | the recommended shape: Route A for Orca-only panes, PB web tabs for browser panes, Theia for terminals, editors and diffs (D-01) | the numbers above |

The NOTE's objection to (b), "importing Orca renderer code conflicts with never vendoring", does
not apply to the built form: PB adds an entry file that Orca's own toolchain compiles from the
pinned tree; nothing is copied into PB's tree. The NOTE's objection to (c), the shared
`orca.web.workspaceSession.v1` key, is real for B and B': every pane page on the orcad origin
writes `activeWorktreeId` to the same key (last writer wins).

### Question 3: size

- **PB files:** 11 in this directory, 1,512 lines including the harness. The hosted part is
  `pb-pane-mount.tsx` (271 lines), two Vite configs and the page entry.
- **Orca renderer reached:** `pb-pane-mount.tsx` imports 17 Orca modules by path (the store, five
  startup hooks, `TerminalPane`, four providers, the web bootstrap). Those pull the store's whole
  closure: the bundle is 42 MB and Vite transformed about 9,600 modules. The renderer is 1,093,113
  non-test lines; none is edited.
- **Orca files touched:** 0. **Seam patches:** 0.
- **Re-pin cost:** each of the 17 import paths, and the provider set a pane needs, can move in a
  release. Both failures are caught by the two commands of this spike: a moved path fails
  `build-pb-entry.sh`; a new required provider fails the standalone mount (that is how
  `LinkRoutingPreferenceDialogProvider` was found). Both are quick next to any other build step in the tree (three Vite builds and one headless launch).

### Question 4: hard-rule fit

- **No Theia core edit.** Route A adds a `ReactWidget` subclass and reads React from
  `@theia/core/shared/react`; B adds a `BaseWidget` subclass; B' adds nothing. `git diff
  --name-only -- theia` is empty for this lane.
- **Additive overlay (D-16).** Every route is files PB adds plus `--config`. Zero seam patches,
  against the cap of about ten. One optional seam exists: adding the pane page to
  `STATIC_WEB_ALLOWED_PATHS` (one line in `static-web-client-handler.ts`), needed only if the page
  must live outside `/assets/`.
- **`TabUriRegistry` shape unchanged** (rule 3). Route B' opens pages through the stock
  `WebTabOpenHandler`; A and B add widgets through `ApplicationShell.addWidget`.
- **What Route A costs against rule 5 and the token gate:** Orca's renderer code runs in the
  authenticated Theia document and stores its pairing under the Theia origin (T-61-04). Nothing in
  the hard rules forbids it; it is a cost for Phase 64 and for D-17 to weigh.

### Question 5: interaction with browser parity

Browser panes are the same question for one view type, with the opposite answer: a browser pane's
content is a web page, so it becomes a PB web tab (D-01), which is Route B' machinery with the
real page in place of a pane page. This spike adds two facts for spike 005: a second client on the
same orcad sees a tab another client opened in every route (FEATURES Q7), and an `orca terminal
create` from the CLI became a tab in the B' runs and not in the A and B runs, so a CLI-driven
`tab create` needs its own check there.

## Investigation Trail

All runs 2026-11-09 on legion. Failed runs included.

1. **Build, run 1.** `build-pb-entry.sh` built all three targets and then exited without its
   last line: `grep -o` exits 1 on zero matches and `pipefail` ended the script on the expected
   externals count. Fixed the counter; PASS since.
2. **Standalone, run 1: FAIL.** The page was blank. `/pb-pane.html` answered 404: orcad's static
   handler serves one HTML page and four asset subtrees. Moved the outputs under
   `out/web/assets/`.
3. **Standalone, run 2: FAIL.** The page loaded, paired (`persistent`) and hydrated, and listed no
   terminal: the terminal the CLI had created before any client attached is a background handle,
   not a tab. The page now creates its first terminal through the store's own action.
4. **Standalone, run 3: FAIL.** Mounted, nothing rendered:
   `useLinkRoutingPreferenceDialog must be used inside LinkRoutingPreferenceDialogProvider`.
   Added the provider.
5. **Standalone, run 4: FAIL (instrument).** The pane rendered a live prompt; the harness's marker
   (a start-up `command`) was never typed. The marker is now sent by `orca terminal send` from
   outside the page. Run 5: PASS, 3,227 ms.
6. **Route A, plan's assembly: not possible.** The plan reached Theia's React through a webpack
   chunk global. Theia's frontend is an esbuild bundle with no such global. Used the plan's
   fallback in its lightest form: the lane's own Theia build, one appended line in a generated
   file, no scratch extension and no tracked edit.
7. **Route A, run 1: FAIL.** `the library bundle loaded but defined no PbPane global`. A no-CORS
   script reports only "Script error.", so the bundle was loaded once from a CORS-enabled local
   server to read the message: `ReferenceError: require is not defined` (two `require("react")`
   call sites from CommonJS dependencies). Added a bundle-local `require` through the Rolldown
   `intro`. Run 2: PASS, one React.
8. **Route A observe, run 1: 2,322 ms (instrument).** 2,266 ms of it was the harness awaiting
   `activateWidget`, which waits for focus that a headless window never gets. The clock now stops
   at `addWidget`. Later runs: 53, 60, 90 and 91 ms.
9. **Route B observe:** 89, 111, 297 and 106 ms. **Route B' observe:** 51, 58 and 74 ms.
10. **Route A, first full run: memory invalid.** The CSS reference tab was opened between memory
    samples and counted as pane memory (113 MB per pane). Reordered. The next two runs: 45.7 MB
    and 43.0 MB per pane.
11. **Route B css-in: not measured, two attempts.** Both read 144 empty computed values. The
    second attempt re-activated the widget first, on the wrong diagnosis (a hidden tab). The cause
    is that the Route B pane has no layout box at all (0 x 0) from mount onward. Not fixed here
    (lane rule: two attempts); Route B's memory was therefore taken with an unpainted pane. Other
    Route B memory runs: 98.7 and 111.2 MB per pane.
12. **Route B' memory, other run:** 201.8 MB per pane.
13. **Not tried:** a shadow root around Route A's sheet (assumption A5); the chat pane; the orcad
    RPC `session.tabs.subscribeAll` / `layout.subscribe` as an observer with no renderer code
    (Open Question 4); `session.tabs.close` as the close call.

## VERDICT

YELLOW. Route A is chosen for Phase 64, on four conditions.

Why Route A: it is the only route where a pane costs megabytes instead of a process (6.1 MB for
the third pane, against 75.8 MB and 177.4 MB), it holds exactly one React copy per document
(run-time identity check, two-copy control), its observation is the store itself at 91 ms against
the one-second clock, its close is one store call in the same document, and it needs 0 seam
patches against the D-16 cap of about ten. It is also what D-29 says: Orca's pane components
hosted in Lumino widgets.

Conditions:

1. **CSS isolation is built first and measured with this harness.** Unscoped, Orca's sheet puts
   845 global rules into Theia's document and changes 84 probed Theia values; Theia changes 24 of
   the pane's. Phase 64 scopes the sheet to the pane root in PB's own build step (selectors
   prefixed, `:root`, `html` and `body` mapped to the pane root) or proves a shadow root (A5, not
   tried). Exit test: `--route a --measure css` reports 0 changed Theia values and 0 changed pane
   values, with both controls still registering.
2. **The chat pane is mounted the same way before the plan is fixed.** Only the terminal pane was
   proven, and D-01 makes terminals Theia terminals.
3. **A `@powerbrowser/*` extension hands Theia's React to the bundle** (an import of
   `@theia/core/shared/react`), replacing the lane build's appended line, and the bundle stops
   inlining assets (42 MB today).
4. **Every re-pin runs `build-pb-entry.sh` and the standalone mount** as its gate for the 17
   import paths and the provider set.

Fallback, already proven: Route B' (one PB web tab per pane page) needs no new Theia code for
hosting, leaks nothing into the pane and 2 values into Theia, and costs about 177 MB per pane.
Route B is not recommended: it sits between the two on memory and its pane did not lay out in the
headless dock.

For the owner at the end-of-milestone pass (D-18), not blocking: Route A runs Orca's renderer code
inside the authenticated Theia document and keeps the orcad pairing in the Theia origin's storage.

Route for Phase 64: Route A, Orca pane components in a Theia ReactWidget on Theia's own React with Orca's stylesheet scoped to the pane root; observation channel useAppStore.subscribe in the Theia document (read-only, close by the store's closeTerminalTab); seam patches 0 of about ten; fallback Route B' (one PB web tab per pane page), which is also the route for browser panes.
