# Hosting Orca panes as PowerBrowser dock tabs

One Orca pane component, built from the pinned source (Orca 1.4.248) by a PB-added Vite entry,
hosted in PowerBrowser's Lumino dock three ways: Route A (same document, Theia `ReactWidget`),
Route B (iframe in a Lumino widget) and Route B' (one PB web tab per pane page). Requirement
TAB-03; decisions D-15, D-16, D-29. Blueprint for Phase 64.

## Requirements

- Orca is consumed by version. PB adds files and passes `--config`; it edits no file Orca's git
  tracks (D-16 additive overlay, cap of about ten seam patches).
- Exactly one React 19.2.8 copy per document.
- PB observes Orca's layout read-only; the renderer owns layout (D-15). Never through
  `orca.web.workspaceSession.v1`, which holds no tab or layout state.
- Each Orca pane is its own Lumino widget (D-15). Terminals, editors and diffs are Theia's (D-01),
  so the panes Phase 64 hosts are chat and the other Orca-only views.
- No Theia core edit, no `TabUriRegistry` shape change (hard rules 1 and 3).

## How to Build It

Chosen route: **Route A**, VERDICT YELLOW. Orca pane components in a Theia `ReactWidget` on
Theia's own React, with Orca's stylesheet scoped to the pane root. Fallback: **Route B'**, which
is also the route for browser panes.

1. **Build the pane entry with a PB-added Vite config.** `vite.pb.config.ts` `mergeConfig`s
   `orca/vite.web.config.ts` with `emptyOutDir:false`; the library form
   (`vite.pb-lib.config.ts`) externalises React. Inputs are copied into `orca/` untracked and
   removed on exit. Outputs must live under `orca/out/web/assets/`: orcad's static handler
   serves only `/web-index.html` and four asset subtrees.
2. **Give the bundle a local `require`** through the Rolldown `intro`. Two CommonJS dependencies
   call `require("react")`; without it the bundle throws `require is not defined` at load and
   defines no global.
3. **Hand Theia's React to the bundle from a `@powerbrowser/*` extension** that imports
   `@theia/core/shared/react`. The spike used a line appended to the generated, git-ignored
   `src-gen/frontend/index.js` (`window.__pbReact`); Phase 64 replaces it. Theia's frontend is
   one esbuild bundle with no module registry or chunk global.
4. **Mount a bare pane, not `RetainedPaneHost`.** Render `TerminalPane` (or the chat view)
   directly, as Orca's activity-terminal portal does (`TerminalOverlaySlot.tsx`).
   `RetainedPaneHost` positions over one body per tab group. The pane needs four providers; the
   fourth, `LinkRoutingPreferenceDialogProvider`, was found when the first mount threw.
5. **Observe with `useAppStore.subscribe`** in the Theia document. A pane opened on the Orca side
   became a Lumino tab in 91 ms against the one-second clock (clock stops at `addWidget`, not
   `activateWidget`, which waits for focus a headless window never gets).
6. **Close through the store's `closeTerminalTab`** in the same document. One call.
7. **Scope the stylesheet first.** Prefix selectors and map `:root`, `html` and `body` to the
   pane root in PB's build step, or prove a shadow root (assumption A5, not tried). Exit test:
   `measure.mjs --route a --measure css` reports 0 changed Theia values and 0 changed pane values
   with both planted controls still registering.
8. **Stop inlining assets.** The spike bundle is 42 MB (about 9,600 modules transformed; 17
   Orca modules imported by path pull the store's whole closure).
9. **Gate every re-pin** on `build-pb-entry.sh` (a moved import path fails the build) and the
   standalone mount (a new required provider fails the mount).

Harness: `sources/004-orca-pane-hosting/measure.mjs`
(`--route standalone|a|b|b-prime --measure mount|observe|ws|css|memory|all`), run headless under
`flock /home/chris/coding/Power-Browser/.git/pb-live.lock`. It needs `page-routes.mjs`,
`build-pb-entry.sh` and the Vite configs from `.planning/spikes/004-orca-pane-hosting/`.

## Measured

| | Route A | Route B | Route B' |
|---|---|---|---|
| Cross-origin WebSocket to orcad | works | works | works |
| Latency, Orca-side open to `addWidget` | 91 ms | 106 ms | 74 ms |
| React copies | 1 (identity check, two-copy control) | 1 per pane document | 1 per pane page |
| CSS out: Theia computed values changed | 84 (845 global rules added) | 0 | 2 (on `html`, observer script) |
| CSS in: pane computed values changed | 24 of 144 | not measured (0 x 0 box) | 0 of 144 |
| Memory per pane, average of three | 43.0 MB | 121.0 MB | 197.9 MB |
| Memory, third pane alone | 6.1 MB | 75.8 MB | 177.4 MB |
| Seam patches to Orca | 0 | 0 | 0 |

## What to Avoid

- **Shipping Route A unscoped.** 845 global rules and 84 changed Theia values out, 24 changed
  pane values in.
- **Planning the chat pane on the terminal result.** Only the terminal pane was mounted. Mount
  the chat pane the same way before the Phase 64 plan is fixed.
- **Route B.** Between A and B' on memory, and its pane had no layout box (0 x 0) in the
  headless dock, so its CSS-in count could not be taken.
- **Relying on `orca.web.workspaceSession.v1` across pane pages** (B, B'): every page on the
  orcad origin writes `activeWorktreeId` to the same key; last writer wins.
- **Expecting a CLI-created terminal to be a tab.** A terminal created before any client
  attaches is a background handle. `orca terminal create` became a tab in B' runs (165 to
  209 ms) and not within 10 s in A and B; not diagnosed.
- **Writing an unmeasured number as zero.** A measurement that cannot be taken is
  `measured:false` with the reason, and the run stays red.

## Constraints

- Route A runs Orca's renderer code inside the authenticated Theia document and stores the
  orcad pairing under the Theia origin (T-61-04). Not forbidden by the hard rules; an owner
  item for the end-of-milestone pass (D-18).
- `TabContentType` has 8 members. The four overlay types (terminal, agent-session, browser,
  simulator) are keyed by tab id and detached from group DOM, so they mount in a foreign widget.
  The four in-body types (editor, diff, conflict-review, check-details) render in `EditorPanel`
  and were not tried.
- orcad's WebSocket server has no Origin check and its static handler sends no CORS, CSP or
  frame header, at the pin.
- One optional seam: adding a page to `STATIC_WEB_ALLOWED_PATHS` (one line), only if a page must
  live outside `/assets/`.
- Not tried: shadow root (A5), the orcad RPC `session.tabs.subscribeAll` / `layout.subscribe`
  as a renderer-free observer, `session.tabs.close` as the close call.

## Origin

Synthesized from spike 004 (VERDICT YELLOW, 2026-11-09, plan 61-01). Routes A, B and B' share
one directory rather than letter suffixes.
Sources: `sources/004-orca-pane-hosting/` (README.md, results.md, measure.mjs). Results JSON and
the build files stay in `.planning/spikes/004-orca-pane-hosting/`.
