---
phase: 64-orca-panes-as-powerbrowser-tabs
plan: 02
subsystem: theia-extensions
tags: [theia, orca, lumino, react, json-rpc, uri-scheme, keybindings]
status: complete

requires:
  - phase: 63-04 (coordinator merge)
    provides: "POWERBROWSER_ORCA_BRIDGE_DIR in POWERBROWSER_ENV, the bridge folder and writePrivateFile, @powerbrowser/orca-agents as the extension pattern"
provides:
  - "@powerbrowser/orca-panes: gated /orca-panes/ bundle route, OrcaPanesService.handOff over JSON-RPC, the React hand-off and module-script loader, OrcaPaneWidget, ORCA_PANE_ROUTES and planPanes, the observer, the pb-orca: opener, New Orca Chat / New Orca Terminal, the six hosted-terminal passthrough rows"
  - "tab-uris: ORCA_PANE_FACTORY_ID and orcaPaneUriOf (orca-scheme-coverage.ts), one uriOf branch"
  - "docs/URI-SCHEMES.md pb-orca: section"
  - "orca-pane-routes and orca-pane-routes-self-test (quick rows)"
affects: [64-01, 64-04, 64-05, 65, 66, 67]

actuals:
  tokens: 20000      # chars/4 over the realized diff (79,878 chars, 14 files)
  tasks: 3
  commits: 3         # task commits, measured before this SUMMARY's own commit
plan_head_before: 21ee66dc19e2199d132ee1876be336c26d9bde30
plan_head_after: fd2c3124715078a3486164d051d40ad56663895b

tech-stack:
  added: []
  patterns:
    - "Inline <script type=module> page text loads an ES entry from a commonjs-compiled Theia extension"
    - "Pure planner (planPanes) separated from the Lumino observer so Node can test it"

key-files:
  created:
    - theia/extensions/orca-panes/package.json
    - theia/extensions/orca-panes/tsconfig.json
    - theia/extensions/orca-panes/src/common/orca-panes-protocol.ts
    - theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts
    - theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts
    - theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts
    - theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx
    - theia/extensions/orca-panes/src/browser/orca-pane-routes.ts
    - theia/extensions/orca-panes/src/browser/orca-pane-observer.ts
    - theia/extensions/tab-uris/src/browser/orca-scheme-coverage.ts
    - scripts/verify-orca-pane-routes.mjs
  modified:
    - theia/extensions/tab-uris/src/browser/tab-uri-registry.ts
    - docs/URI-SCHEMES.md
    - scripts/verify-platform.sh

key-decisions:
  - "The module script uses import() inside page text, so a failed entry load dispatches a private failure event and the loader records the load step as failed instead of hanging"
  - "The bundle route is app.use(prefix) with a GET/HEAD filter (Express 5.2.1 changed wildcard syntax) and sendFile with root, so send's dotfile rule applies to the request part only"
  - "New Orca Chat / New Orca Terminal fall back to the first worktree of the last pane list when Orca reports no active worktree"
  - "The observer waits for initialized_layout before collecting restored widgets, so layout-restored pb-orca: tabs are adopted rather than duplicated"

requirements-completed: [TAB-02, TAB-04, TAB-06, TERM-01, TERM-04]  # lane half only; the coordinator (64-05) marks them after wiring and lane p64-04's live rows

duration: 55min
completed: 2026-11-10
---

# Phase 64 Plan 02: @powerbrowser/orca-panes and pb-orca: addressing Summary

The Theia half of Route A: a new `@powerbrowser/orca-panes` extension that serves the Orca pane bundle behind the token gate, hands the pairing offer to the frontend over JSON-RPC only, loads the bundle on Theia's React, and keeps one Lumino tab per hosted Orca pane, each with a `pb-orca:<word><n>` address resolved through an unchanged `TabUriRegistry`.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 (tracer) | 76cc7cbd | feat(64-02): orca-panes hand-off path, gated bundle route, offer RPC and loader |
| 2 | 460c40bd | feat(64-02): Orca pane widgets, route table, observer and pb-orca reverse lookup |
| 3 | fd2c3124 | feat(64-02): pb-orca opener, Orca commands, terminal key rows, URI doc, orca-pane-routes |

## How it works

- **Route prefix:** `/orca-panes/` (`ORCA_PANES_ROUTE_PREFIX`), registered in `configure(app)` behind token-gate's front-inserted check. The bundle directory is the path in the bridge folder's `orca-panes-dir` file; its realpath is cached per file mtime. A request resolves only through `resolveInside` (empty, absolute, backslash, NUL and `..` refused), then `realpath`, which must stay under the directory's realpath and be a regular file. Anything else is 404.
- **Offer hand-off:** `OrcaPanesService.handOff()` at `/services/powerbrowser-orca-panes` lstat-checks the bridge folder (owner, no group or other bit) and `web-pairing` (regular file, 0600, owner). It returns `{ pairing }` with the trailing newline removed, or undefined. It logs one line per distinct failure and never the value.
- **Loader:** `OrcaPaneBundle` stores `{ React, ReactDOM, ReactDOMClient, jsxRuntime }` from `@theia/core/shared/*` under `Symbol.for('powerbrowser.orca-panes.react')`. It then polls `handOff()` with a backoff from 1 s up to 5 s, links `/orca-panes/pb-panes.css` once, and appends one inline `<script type="module">` element. That script's text runs `import('<absolute /orca-panes/pb-panes.js>')`, stores the namespace under `Symbol.for('powerbrowser.orca-panes.module')` (`ORCA_PANES_MODULE_KEY`) and dispatches `powerbrowser-orca-panes-module` (`ORCA_PANES_BOOT_EVENT`) once. Because the import is page text and not TypeScript, the commonjs emit cannot rewrite it into `require()`; the compiled `lib/browser/orca-pane-bundle.js` contains no `require()` of the entry. The loader refuses to boot when `reactIdentity !== React`. It calls `bootstrap(offer)` once, and the offer goes out of scope when the call returns.
- **Widget and address:** `ORCA_PANE_FACTORY_ID = 'powerbrowser.orca-pane'` lives in `tab-uris/src/browser/orca-scheme-coverage.ts`, and orca-panes imports it from there. The widget id is `orca-pane:<name>` and the address is `pb-orca:<name>`. `OrcaPaneWidget` has `data-pb-orca-pane=<kind>` on its node. It mounts its own React root into a child host element on the first show, keeps the root while hidden and unmounts it on dispose. `onCloseRequest` only calls `closePane`, and `disposeFromStore()` performs the real dispose. Terminal widgets set the scoped `powerbrowser.orcaTerminalFocus` key.
- **Observer:** `planPanes` mints the lowest free name per word, reserving restored names first. It adopts restored widgets by key, places each new pane beside its nearest neighbour that already has a widget (including one created earlier in the same pass), disposes absent keys and logs each non-hosted kind once. New widgets are added with `addWidget({ area: 'main', mode, ref })` and are never activated. Activating a hosted tab calls `setActiveWorktree`.

## Check results (lane worktree)

- Task 1: orca-panes tsc build green; the 12-case private-folder, private-file and path Node run passed. In a fixture run of the compiled backend over real temp folders, `handOff` returned undefined for a missing file, a 0644 file and a 0750 folder, and `{ pairing }` for a private file. The route returned 200 for the entry and 404 for `%2e%2e`, for a symlink pointing outside the directory and for a missing file. No log line carried the value. The compiled loader holds no `require()` of the entry.
- Task 2: the planner Node run passed (eight route keys, `chat1,term1,term2`, editor pending, `mintName` lowest free, placement `split-right`). `orcaPaneUriOf` returns `pb-orca:term1` for the factory only. `gui04-registry-shape` and `gui04-registry-shape-self-test` are green with no edit to the shape check. The `tab-uri-registry.ts` diff is 5 added lines.
- Task 3: `orca-pane-routes` PASS, with clauses (d) and (g) SKIP (p64-01 entry and p64-04 `orca-tabs-live.mjs` absent). `orca-pane-routes-self-test` PASS, 13 planted faults each red naming the drift. `--nope` exits 2. The lane diff is within `files_modified`.
- `diff-theia-core` PASS, full, both stages, after the re-install described under Deviations.
- `ng-019-tab-store-doc` (reads `docs/URI-SCHEMES.md`) PASS.
- `--quick` tier: 61 rows red. One is caused by this lane: `theia-build-order` names `orca-panes` as absent from `build:extensions`, and the coordinator's wiring fixes it. `scan-brand-residue` and its self-test are red on this lane's unclaimed Orca tokens (rows below). Every other red row (ext-tab-host-*, crash-*, licensing, installer-schema, group-channel, patches-regenerated and the rest) reports `upstream/` absent or unreplayed in this lane worktree and reads no file this lane touched.

## Coordinator proof commands

1. Wiring: in `theia/package.json` `build:extensions`, append `&& yarn --cwd extensions/orca-panes build` after `orca-agents`. In `theia/applications/browser/package.json` dependencies, add `"@powerbrowser/orca-panes": "0.1.0"`.
2. `nix develop .#theia --command bash -c 'cd theia && yarn install --ignore-scripts --frozen-lockfile && (cd node_modules/drivelist && node-gyp rebuild) && yarn build'`. `git diff --exit-code theia/yarn.lock` must print nothing (the package depends only on locked packages).
3. `scripts/verify-platform.sh --only orca-pane-routes`: on the merged tree the PASS line must say "(d) bundle API and hand-off key compared" and "(g) module key and boot event compared". Then `--only orca-pane-routes-self-test`.
4. `scripts/verify-platform.sh --only gui04-registry-shape`, `--only theia-build-order`, and `nix develop .#theia --command bash scripts/diff-theia-core.sh`.
5. Lane p64-04's live rows (`orca-tabs-live`, the `pb-orca` rows of `verify-uri-roundtrip.mjs`, `orca-terminal-keys` and its live row, the mode-switch seeds), under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, with `orca-pane-css-live` green first (P64-15).

## Merge note for the coordinator

- Merge this lane second (after p64-01), by `refs/heads/ServerDestroyer/p64-02`. The registry block `# NEW (64-02, ...)` sits right after `orca-agent-status-live-self-test|` (no Phase 68 block was at that anchor), and this lane adds no full or live rows.
- No WINDOWS.md ids are opened or closed.
- Brand rows needed (inventory not edited; report at `.mozbuild/p64-02/brand-report.md` in the lane worktree). With every lane file staged, the scan's condition-4 failures by file and spelling (lower/title/upper) are:
  - `docs/URI-SCHEMES.md` 5/20/0
  - `scripts/verify-orca-pane-routes.mjs` 49/9/17
  - `theia/extensions/orca-panes/package.json` 3/0/0
  - `orca-panes/src/browser/orca-pane-bundle.ts` 5/13/19
  - `orca-panes/src/browser/orca-pane-observer.ts` 8/31/6
  - `orca-panes/src/browser/orca-pane-routes.ts` 4/19/8
  - `orca-panes/src/browser/orca-panes-frontend-module.ts` 15/43/8
  - `orca-panes/src/browser/orca-pane-widget.tsx` 6/16/4
  - `orca-panes/src/common/orca-panes-protocol.ts` 12/19/11
  - `orca-panes/src/node/orca-panes-backend-module.ts` 4/9/6
  - `tab-uris/src/browser/orca-scheme-coverage.ts` 5/2/2
  - `tab-uris/src/browser/tab-uri-registry.ts` 6/0/0

  The held-back coincidental rows move from Orca 637 to 638, orca 1287 to 1298 and ORCA 294 to 295. In total that is 384 condition-4 failures plus 3 held-back count mismatches, 387. The coordinator re-measures on the staged merged tree.

## Deviations from Plan

**1. [Rule 3 - Blocking] Re-ran the audited install after adding the workspace package**
- Found during: Task 1 verify (`diff-theia-core`)
- Issue: `yarn check --integrity` reported "Top level patterns don't match" because `extensions/orca-panes` is a new member of the `extensions/*` workspace glob. Removing the package's `package.json` turned it green, which confirmed the cause.
- Fix: `yarn install --ignore-scripts --frozen-lockfile` (yarn.lock unchanged), then the drivelist rebuild again. Only ignored paths changed (`theia/node_modules`).

**2. [Rule 1 - Correctness] The loader reports a failed entry load instead of waiting forever**
- The inline module script calls `import()` and dispatches a private `-failed` event when it rejects. The C3 boot event and module key are unchanged.

**3. [Rule 1 - Correctness] Bundle route under Express 5**
- Express 5.2.1 changed the `*` route syntax, so the route is `app.use('/orca-panes/', ...)` filtered to GET and HEAD. `sendFile` is given `root` so a dot directory in the install path (such as `~/.local`) is not refused.

## Not done in this lane, recorded

- P64-32: whether one widget per terminal leaf with `isolatedPaneKey` connects and renders only its own leaf is unproven. 64-CONTEXT expects the p64-02 lane's first live check to measure it. This plan runs no live row, so the measurement moves to lane p64-04 or the coordinator. If it fails, the D-15 deviation (one widget per terminal tab, with Orca's split inside) is an owner item.
- OWNER-ITEM: a layout-restored `pb-orca:` tab shows an empty title until the bundle boots and adopts it. The widget does not persist its title (the options are its identity, and a title in them would fork the widget).
- The commands' fallback "first worktree" comes from the last pane list, so a worktree with no Orca panes yet is not found when Orca reports no active worktree. In that case the command writes one log line.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-64-06 (path refusals, fixture-run), T-64-07 (route in `configure(app)`), T-64-08 (0600/0700 checks, value never logged) and T-64-11 (clause (f)) are implemented as specified.

## Self-Check: PASSED

- All 14 files in `files_modified` except this SUMMARY are present and committed. Commits 76cc7cbd, 460c40bd and fd2c3124 are ancestors of HEAD.
