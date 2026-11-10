# Spike 004 results — 2026-11-09

Orca v1.4.248 (commit 965978bc, built in this lane by `scripts/build-orca.sh`; orcad slot-less on
Node 24.19.0 from `powerbrowser/packaging/node-runtime.json`). PowerBrowser 153.5.1esr at
`/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/objdir/dist/bin/powerbrowser`
(coordinating workspace, HEAD cf7570d8), headless, fresh profile per run, token gate on. Theia
1.76.0, React 19.2.8 in both trees. Harness: `measure.mjs` and `page-routes.mjs` on
`scripts/lib/pb-live-probe.mjs`, `scripts/lib/firefox-bidi.mjs` and `scripts/lib/orca-run.mjs`.
Host: legion. Timestamps in the JSON files are UTC (2026-11-10).

Every live command has this prefix (abbreviated `LIVE` below):

    PB_FIREFOX_BIN=/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/objdir/dist/bin/powerbrowser \
      flock /home/chris/coding/Power-Browser/.git/pb-live.lock node .planning/spikes/004-orca-pane-hosting/measure.mjs

Routes A, B and B' ran on the lane's own Theia build (`PB_BACKEND_MAIN`, set by `measure.mjs`),
which publishes Theia's React to the frame (README, "How to Run"). Raw output:
`results-standalone.json`, `results-route-a.json`, `results-route-b.json`,
`results-route-b-prime.json`. Memory and latency are single runs; the Investigation Trail in the
README lists the other runs' values.

## Build (Wave 0)

Command: `nix develop .#orca --command bash .planning/spikes/004-orca-pane-hosting/build-pb-entry.sh`

| # | Sub-check | Result | Observed |
|---|-----------|--------|----------|
| A1 | PB-added Vite config builds beside Orca's build with zero Orca edits | PASS | `git -C orca status --porcelain --untracked-files=no` empty before and after; no copied input left; `out/web/web-index.html`, `out/web/assets/pb/pb-pane.html`, `out/web/assets/pb-lib/pb-pane-lib.{js,css}` produced; Orca's `verify-web-build.mjs` passes |
| A4 static | The library bundle carries no React of its own | PASS | marker `rendererPackageName` (derived from `theia/node_modules/react-dom/cjs/react-dom-client.production.js`): externals bundle 0, two-copy control bundle 1 |
| — | Bundle sizes | — | library bundle 42,279,207 bytes (externals) against 42,473,500 (two-copy): React is 194,293 bytes of it. Stylesheet 3,770,970 bytes. Library mode inlines assets, which is why the script is 42 MB |

## Standalone pane (no Theia hosting)

Command: `LIVE --route standalone --measure mount`

| # | Sub-check | Result | Observed |
|---|-----------|--------|----------|
| 1 | One terminal pane renders from orcad on the PB-added page | PASS | `promptSeen: true`; 1 xterm; the marker typed by the Orca CLI from outside shows twice (typed line, output); 3,227 ms from navigation to marker |
| 2 | Secure context and device key (A2) | PASS | `isSecureContext: true`, `readWebDeviceKeySupport()` = `persistent` on `http://127.0.0.1:<orcad port>` |

## Route A — same document (Theia ReactWidget, Theia's React)

Command: `LIVE --route a --measure all`

| # | Sub-check | Result | Observed |
|---|-----------|--------|----------|
| 1 | mount | PASS | Orca's `PaneRoot` rendered by `ReactWidget.nodeRoot` (Theia's `createRoot`) in a main-area widget, 1280 x 695; marker count 2 |
| 2 | React copies | PASS | 1. `PbPane.reactIdentity.useState === window.__pbReact.React.useState` is true; both report 19.2.8 |
| 3 | ws (Theia origin to orcad) | PASS | `works`. Device key `persistent` (A2). No CSP header or meta on the Theia document, no `connect-src` refusal (A3) |
| 4 | observe latency | PASS | 91 ms from the store's new-terminal action to `ApplicationShell.addWidget` for the new tab id (1000 ms clock). Channel: `useAppStore.subscribe`. 31 ms of it is store callback to widget added |
| 5 | css out (Orca to Theia) | FAIL (leak) | The Orca sheet adds 6,319 style rules to the Theia document, 845 of them global by the counter's definition; 78 more global rules are injected by script at run time. 84 probed computed values on Theia elements changed (the probe set is at most 219: 12 elements by 18 properties plus 3 document values) (`html` and `body` `box-sizing` and `line-height`, bare `button`, `input`, `a`, `h1`, `ul`: font, colour, padding, border, cursor) |
| 6 | css in (Theia to pane) | FAIL (leak) | 24 of 144 pane computed values differ from the standalone page: inherited `font-family` (Geist to system-ui), `font-size` 16px to 13px, `line-height`, `color` on the pane root, `.pane`, `.xterm`, viewport, helper textarea, title surface |
| 7 | memory per pane | — | 43,016,192 bytes average over three panes ((M3 - M0) / 3). First pane 112,398,336 (bundle load); third pane alone 6,053,888. One content process (`web`, Theia) holds all panes |
| 8 | close call | PASS | Closing the Lumino widget alone leaves the Orca tab listed. `closeTerminalTab(tabId)` (store action, in the Theia document) closes it and it stays closed; the channel reports the close |
| 9 | second client sees the tab | PASS | A second pane page on the same orcad listed the tab the first client opened |
| 10 | CLI-side open becomes a tab | FAIL (miss) | `orca terminal create` did not appear as a tab in this client within 10 s (it did in Route B', see below) |

## Route B — iframe per pane in a Lumino widget

Command: `LIVE --route b --measure all` (the run's verdict is FAIL on sub-check 6)

| # | Sub-check | Result | Observed |
|---|-----------|--------|----------|
| 1 | mount | PASS, with a defect | The pane page mounted in the iframe and the marker count is 2, but the pane's layout box is 0 x 0 in the headless dock in every run (not diagnosed) |
| 2 | React copies | — | 1 per pane document (each iframe bundles its own); Theia's document keeps its own |
| 3 | ws (orcad origin, framed by the Theia origin) | PASS | `works`. Device key `persistent`. orcad sends no frame or CSP header, so the iframe loads |
| 4 | observe latency | PASS | 106 ms from the new-terminal action in the first pane document to `addWidget` in the Theia frame. Channel: `postMessage` `{type:'pb-layout', nonce, ...}` with `targetOrigin` = Theia origin |
| 4b | postMessage control (T-61-03) | PASS | 2 forged messages rejected (wrong origin with a guessed nonce; right origin with a nonce nobody minted); no widget added for the forged tab |
| 5 | css out | PASS | 0 rules, 0 unreadable sheets, 0 probed computed values changed in the Theia document |
| 6 | css in | NOT MEASURED | The pane has no layout box (0 x 0), so its document reports empty computed styles (144 blanks). Two attempts; recorded as not measured, never as zero. By construction an iframe document does not inherit the parent's rules, but that is reasoning, not a run |
| 7 | memory per pane | — | 120,998,571 bytes average. First pane 205,758,464; third pane alone 75,816,960. The orcad-origin iframes share the Theia content process (`web: orcad+theia`, same site). Taken with the 0 x 0 pane, so likely an underestimate |
| 8 | close call | PASS | Lumino-only close leaves the Orca tab. `closeTerminalTab(tabId)` inside a pane document closes it for good. The Theia parent needs a parent-to-pane command (not built) or the orcad RPC `session.tabs.close`; the harness called it over BiDi |
| 9 | second client sees the tab | PASS | The second iframe is a second client and mounted the tab the first opened |
| 10 | CLI-side open becomes a tab | FAIL (miss) | not within 10 s |

## Route B' — one PB web tab per pane page

Command: `LIVE --route b-prime --measure all`

| # | Sub-check | Result | Observed |
|---|-----------|--------|----------|
| 1 | mount | PASS | `WebTabOpenHandler.openUrl` (spike 003 machinery, no new Theia code); pane 1280 x 695; marker count 2 |
| 2 | React copies | — | 1 per pane page; the observer in the Theia frame runs on Theia's React (same identity check, true) |
| 3 | ws | PASS | `works`. Device key `persistent` |
| 4 | observe latency | PASS | 74 ms from the new-terminal action in the first pane page to `ApplicationShell.onDidAddWidget` for the new web tab. Channel: a second paired client in the Theia frame (library bundle, script only, `subscribeTabs`) |
| 5 | css out | PARTIAL | The pane pages add nothing. The observer script injects 96 style rules (78 global) into the Theia document and changes 2 probed values (`html` class gains `light`; the `html` style attribute grows by 108 characters). No Theia element style changed |
| 6 | css in | PASS | 0 of 144 pane computed values differ from the standalone page; planted control registered 3 |
| 7 | memory per pane | — | 197,885,952 bytes average. First pane 146,329,600; third pane alone 177,393,664. Each pane page gets its own `webIsolated` content process of about 150 MB; the observer adds about 100 MB once to the Theia process (inside the second sample) |
| 8 | close call | PASS | Closing the web tab alone leaves the Orca tab. `closeTerminalTab(tabId)` in any paired client closes it for good |
| 9 | second client sees the tab | PASS | every pane page is its own client |
| 10 | CLI-side open becomes a tab | PASS | 165 ms from before the CLI process started to the web tab's widget |

## Controls

| Control | Result | Observed |
|---------|--------|----------|
| Planted global rule (`html { --pb-spike-control: 1 }`) in the Theia document | PASS in all three routes | counter rose by exactly 1 (54 to 55 global rules of 7,455) and returned to 54 after removal |
| Planted host rule on the pane (`[data-pb-pane-root] .xterm { letter-spacing: 3px !important }`) | PASS in A and B'; not reached in B | 3 more differences than the unplanted comparison |
| Two-copy library build | PASS | marker count 1, against 0 in the externals build |
| Forged postMessage (Route B) | PASS | 2 of 2 rejected |

## Memory method

`ChromeUtils.requestProcInfo()` through `app.evaluateIn(app.chrome, ...)`, 5 s after each pane
settled: before the first pane (M0) and after panes 1, 2 and 3. The number is the sum of the
parent process and every child whose windows are on the Theia or the orcad origin. Per-process rows
are in each `results-route-*.json` under `memory.samples`. The Theia backend (Node) and orcad are
not Gecko processes and are outside the number.

| Route | M0 | M1 | M2 | M3 | first pane | per pane (M3-M0)/3 | third pane alone |
|-------|----|----|----|----|-----------|--------------------|------------------|
| A | 546,918,400 | 659,316,736 | 669,913,088 | 675,966,976 | 112,398,336 | 43,016,192 | 6,053,888 |
| B | 566,468,608 | 772,227,072 | 853,647,360 | 929,464,320 | 205,758,464 | 120,998,571 | 75,816,960 |
| B' | 564,699,136 | 711,028,736 | 980,963,328 | 1,158,356,992 | 146,329,600 | 197,885,952 | 177,393,664 |

**Verdict: YELLOW.** Route A is the only route whose per-pane cost stays small and it holds the
single React copy, but it leaks CSS both ways and must be isolated before Phase 64 ships it. See
the README's VERDICT section.

## Findings the README did not predict

1. **orcad serves one HTML page.** Its static handler allows `/web-index.html` and the `/assets/`,
   `/cmaps/`, `/standard_fonts/` and `/wasm/` subtrees only
   (`orca/src/main/runtime/rpc/static-web-client-handler.ts:7-8`). A second page beside
   `web-index.html` is a 404. Under `/assets/` it is served with no Orca edit, at the price of
   `Cache-Control: public, max-age=31536000, immutable` on a file whose name carries no hash.
2. **Theia's frontend exposes no module registry.** It is one esbuild bundle, so Theia's React
   cannot be reached from outside at run time. The lane build publishes it with one line appended
   to the generated, git-ignored `src-gen/frontend/index.js`. A real `@powerbrowser/*` extension
   does the same with an import of `@theia/core/shared/react`.
3. **An iife bundle keeps `require("react")`.** CommonJS dependencies that require an external
   (two call sites) are left with a bare `require`, which threw at load. A bundle-local `require`
   in the Rolldown `intro` fixed it without touching the host document.
4. **A pane needs four providers**, not three: `I18nProvider`, `TooltipProvider`,
   `ConfirmationDialogProvider` and `LinkRoutingPreferenceDialogProvider` (the first mount threw
   without the last).
5. **A CLI-created terminal is not always a tab.** With no client attached it is a background
   handle and never appears in `tabsByWorktree`. With clients attached it became a tab in Route B'
   (165 ms, 181 ms and 209 ms over three runs) and did not within 10 s in Routes A and B. Not
   diagnosed.
6. **Tabs are host-owned and mirrored.** Paired web clients receive tabs through `session.tabs`;
   a second client saw the first client's new tab in every route.
7. **The observe-only client is not free.** Without Orca's stylesheet and without its
   document-appearance hook it still injects 96 style rules and a `light` class on `html`.
8. **Activation is not adding.** Awaiting `ApplicationShell.activateWidget` in a headless run adds
   about 2.2 s (Theia waits for focus). The first Route A latency (2,322 ms) measured that wait,
   not the mechanism.
