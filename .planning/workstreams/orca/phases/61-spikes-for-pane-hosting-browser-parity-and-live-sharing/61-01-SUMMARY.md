---
phase: 61-spikes-for-pane-hosting-browser-parity-and-live-sharing
plan: 01
subsystem: spike
tags: [orca, orcad, lumino, react, panes, vite, css-isolation, memory, live-probe]

requires:
  - phase: 60-02
    provides: "scripts/build-orca.sh: built, de-slotted orca/out/orcad and orca/out/web"
  - phase: 60-03
    provides: "scripts/lib/orca-run.mjs: PB Node, scrubbed orcad env, loopback spawn, pairing redaction, teardown"
provides:
  - "Spike 004 record: .planning/spikes/004-orca-pane-hosting/README.md (five NOTE answers, route comparison, seam count, VERDICT, Route for Phase 64)"
  - "results.md and results-{standalone,route-a,route-b,route-b-prime}.json: per-route numbers with the producing command"
  - "build-pb-entry.sh: PB-added Vite builds with the A1 and A4 assertions"
  - "measure.mjs and page-routes.mjs: live harness, --route standalone|a|b|b-prime, --measure mount|observe|ws|css|memory|all"
  - "pb-pane-mount.tsx, pb-pane.tsx, pb-pane.html, vite.pb.config.ts, vite.pb-lib.config.ts: the pane entry and Route A library bundle"
affects: [61-04, 63, 64, 66]

plan_head_before: 132f2f53732f8d54626317e71ceab6ae045f12d9
plan_head_after: 7c6ff105c054aae53b87d2ef5163cc70307c5d03

tech-stack:
  added: []
  patterns:
    - "A PB-added Vite config mergeConfigs Orca's and is passed with --config; inputs are copied into orca/ untracked and removed on exit"
    - "A library bundle that externalises React needs a bundle-local require (Rolldown intro) for its CommonJS dependencies"
    - "A measurement that cannot be taken is written as measured:false with the reason and keeps the run red; it is never written as zero"

key-files:
  created:
    - .planning/spikes/004-orca-pane-hosting/README.md
    - .planning/spikes/004-orca-pane-hosting/results.md
    - .planning/spikes/004-orca-pane-hosting/build-pb-entry.sh
    - .planning/spikes/004-orca-pane-hosting/vite.pb.config.ts
    - .planning/spikes/004-orca-pane-hosting/vite.pb-lib.config.ts
    - .planning/spikes/004-orca-pane-hosting/pb-pane.html
    - .planning/spikes/004-orca-pane-hosting/pb-pane.tsx
    - .planning/spikes/004-orca-pane-hosting/pb-pane-mount.tsx
    - .planning/spikes/004-orca-pane-hosting/measure.mjs
    - .planning/spikes/004-orca-pane-hosting/page-routes.mjs
    - .planning/spikes/004-orca-pane-hosting/results-standalone.json
    - .planning/spikes/004-orca-pane-hosting/results-route-a.json
    - .planning/spikes/004-orca-pane-hosting/results-route-b.json
    - .planning/spikes/004-orca-pane-hosting/results-route-b-prime.json
  modified: []

key-decisions:
  - "Route A (same document, Theia ReactWidget, Theia's React) is the route for Phase 64, conditional on CSS scoping; Route B' is the fallback and the route for browser panes"
  - "The pane is rendered as a bare TerminalPane (Orca's activity-portal precedent), not through RetainedPaneHost, which positions over one body per tab group"
  - "PB outputs are emitted under orca/out/web/assets/ because orcad serves one HTML page and four asset subtrees"

requirements-completed: [TAB-03]
---

# Phase 61 Plan 01: pane-hosting spike (004) Summary

**One Orca terminal pane hosted in PowerBrowser's dock three ways from a PB-added Vite entry with zero Orca edits; Route A wins on memory, React copies and latency and is held to YELLOW by CSS leakage in both directions.**

## VERDICT

YELLOW. Route A is chosen for Phase 64, on four conditions (README, `## VERDICT`): CSS isolation
built first and measured with this harness; the chat pane mounted the same way before the plan is
fixed; a `@powerbrowser/*` extension handing Theia's React to the bundle; `build-pb-entry.sh` and
the standalone mount as the re-pin gate.

Route for Phase 64: Route A, Orca pane components in a Theia ReactWidget on Theia's own React with Orca's stylesheet scoped to the pane root; observation channel useAppStore.subscribe in the Theia document (read-only, close by the store's closeTerminalTab); seam patches 0 of about ten; fallback Route B' (one PB web tab per pane page), which is also the route for browser panes.

## The numbers

| | Route A | Route B | Route B' |
|---|---|---|---|
| Cross-origin WebSocket | works | works | works |
| Latency, Orca-side open to `addWidget` (1000 ms clock) | 91 ms | 106 ms | 74 ms |
| React copies | 1 (identity check, two-copy control) | 1 per pane document | 1 per pane page |
| CSS out: Theia computed values changed | 84 (845 global rules added) | 0 | 2 (observer script) |
| CSS in: pane computed values changed | 24 of 144 | not measured | 0 of 144 |
| Memory per pane, average of three | 43.0 MB | 121.0 MB | 197.9 MB |
| Memory, third pane alone | 6.1 MB | 75.8 MB | 177.4 MB |
| Seam patches | 0 | 0 | 0 |

A1 PASS (zero tracked Orca edits). A4 PASS (externals bundle 0 react-dom markers, control 1; run
time `useState` identity true). A2 confirmed (`persistent` on both origins). A3 confirmed (no CSP
on the Theia document). A5 (shadow root) not tried.

## Task Commits

1. **Task 1: PB-added Vite entry, A1/A4, standalone pane** — `38e02b88`
2. **Task 2: Routes A, B, B' mount and layout observation** — `a84a252a`
3. **Task 3: CSS and memory numbers, results.md, README record** — `7c6ff105`

## Remaining (not green)

| Item | State | Why |
|---|---|---|
| Route B, CSS leak-in | NOT MEASURED; `measure.mjs --route b --measure all` ends FAIL on it | The Route B pane has no layout box (0 x 0) in the headless dock from mount onward, so its document reports empty computed styles. Two attempts (the second on a wrong diagnosis); stopped per the lane rule. `--route b --measure mount` and `observe` pass. Route B's memory was taken with that unpainted pane |
| CLI-created terminal as a tab | Inconsistent | Became a tab in Route B' (165 to 209 ms, three runs), not within 10 s in Routes A and B. Not diagnosed |
| Chat pane, shadow root (A5), RPC-only observer, `session.tabs.close` | Not tried | Outside what the runs reached; listed in the README trail |

## Deviations from Plan

1. **[Rule 3 - blocking] Outputs under `out/web/assets/`.** The plan names
   `out/web/pb-pane.html` and `out/web/pb-lib/`. orcad's static handler answers 404 for anything
   but `/web-index.html` and four asset subtrees, so the page is `out/web/assets/pb/pb-pane.html`
   and the bundle `out/web/assets/pb-lib/`. Still zero Orca edits.
2. **[Rule 3 - blocking] Route A assembly.** The plan reaches Theia's React through a webpack
   chunk global; Theia's frontend is an esbuild bundle without one. Used the plan's named fallback
   in a lighter form: the lane's own Theia build with one line appended to the generated,
   git-ignored `src-gen/frontend/index.js`. No scratch extension, no tracked edit;
   `git diff --name-only -- theia` is empty. `measure.mjs` therefore sets `PB_BACKEND_MAIN` to the
   lane build for routes a, b and b-prime (the brief leaves it unset); the standalone row keeps
   the coordinating workspace's sidecar.
3. **[Rule 1 - bug] Bundle-local `require`.** The externals bundle threw `require is not defined`
   at load; fixed with a Rolldown `intro` in `vite.pb-lib.config.ts`.
4. **[Rule 2 - missing] Fourth provider.** `LinkRoutingPreferenceDialogProvider` added to the
   pane's providers after the first mount threw.
5. **Vite is started with `node node_modules/vite/bin/vite.js`**, as Orca's own
   `run-vite-web-build.mjs` does, not `pnpm exec vite`: no corepack step is needed.
6. **The first terminal is created by the hosting page**, not the CLI: a CLI-created terminal
   with no client attached is not a tab. The CLI is used for `repo add`, the marker
   (`terminal send`) and the CLI-side open.
7. **Standalone launch** passes the page URL without the pairing fragment and hands the fragment
   over BiDi, so the credential is never on a command line.
8. **Setup addition:** the Orca CLI is not built by `build-orca.sh`; it was built with
   `ORCA_CLI_BUILD_COMPILER=tsrs node config/scripts/build-cli.mjs` (60-EXT01-RECORD note 3).

## Verification

- `build-pb-entry.sh`: `PASS -- A1 tracked-dirty=0 ...; A4 marker=rendererPackageName control=1 externals=0`.
- `measure.mjs --route standalone --measure mount`: PASS, `promptSeen: true`.
- `measure.mjs --route a|b|b-prime --measure observe`: PASS for all three.
- `measure.mjs --measure all`: PASS for a and b-prime, FAIL for b (see Remaining).
- README: 5 question headings, `## VERDICT` first line YELLOW, exactly one `Route for Phase 64:` line; `results.md` names `requestProcInfo`.
- Credential grep over the spike directory: no match. `node scripts/scan-brand-residue.mjs` with the files staged: PASS, 688 files.
- Lane diff against the merge base: only `.planning/` paths. `git -C orca status --porcelain --untracked-files=no`: empty.
- No headed run, no real input; every live run held the pb-live lock; orcad on 127.0.0.1 port 0, never `orca serve`; inherited Orca variables scrubbed in both scripts.

## For the owner (D-18, not blocking)

Route A runs Orca's renderer code inside the authenticated Theia document and stores the orcad
pairing under the Theia origin. Recorded as a Route A cost in the README; Chris may override the
route at the end-of-milestone pass.

## Merge note for the coordinator

Merge note for the coordinator: spike directory only; no registry rows; no brand-token rows; no WINDOWS.md ids.

Left outside git by this lane, all ignored: `orca/` (build outputs, including
`out/web/assets/pb*`), `theia/` build outputs with the appended line in
`applications/browser/src-gen/frontend/index.js`, `.mozbuild/p61-01/`, and the symlink
`~/.cache/pb-p61-01-orca`. The lane's Theia bundle carries `window.__pbReact`; rebuild Theia
(`yarn build`) before using this worktree's sidecar for anything else.

## Self-Check: PASSED

All 14 spike files exist and are committed (38e02b88, a84a252a, 7c6ff105); the SUMMARY's Route
line is the README's line verbatim.
