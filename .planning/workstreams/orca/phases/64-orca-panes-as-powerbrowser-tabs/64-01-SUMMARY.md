---
phase: 64-orca-panes-as-powerbrowser-tabs
plan: 01
subsystem: orca-pane-bundle
status: complete
tags: [orca, overlay, vite, react-hand-off, css-scoping, live-checks]
requires:
  - "63-04 coordinator merge (p63-06 bridge folder, p63-03 orca-agents)"
provides:
  - "orca/out/web/assets/pb-panes/ (pb-panes.js ES entry, pb-panes.css, relative-URL assets) built by build-orca.sh step 9"
  - "the C3 bundle API in orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx"
  - "the A3 scoping pass orca-overlay/files/pb-css-scope.mjs"
  - "rows orca-pane-entry, orca-pane-standalone-live, orca-pane-css, orca-pane-css-live and their self-tests"
affects: [64-02, 64-04, 64-05, 66, 68-01, 68-10]
tech-stack:
  added: []
  patterns:
    - "host-React virtual modules reading globalThis[Symbol.for('powerbrowser.orca-panes.react')], export names from Orca's own React"
    - "PostCSS pass in generateBundle over the emitted sheet"
key-files:
  created:
    - orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx
    - orca-overlay/files/vite.pb-panes.config.ts
    - orca-overlay/files/pb-css-scope.mjs
    - scripts/build-orca-panes.sh
    - scripts/lib/orca-pane-harness.mjs
    - scripts/verify-orca-pane-entry.mjs
    - scripts/verify-orca-pane-standalone-live.mjs
    - scripts/verify-orca-pane-css.mjs
    - scripts/verify-orca-pane-css-live.mjs
  modified:
    - scripts/build-orca.sh
    - scripts/verify-platform.sh
    - docs/BUILD.md
decisions:
  - "Isolated per-leaf terminal mount (P64-32) measured PASS on the first attempt: D-15's one widget per leaf holds for terminals; no OWNER-ITEM P64-32"
  - "reactIdentity is React's default export (the host React object); a namespace import is a fresh object and never equals Theia's React"
  - "Custom properties in the host-owned namespaces --vscode-* and --theia-* are scoped, not kept on :root (Theia reads --vscode-sash-size)"
  - "The derived <html> class clause judges the leftmost compound only: <html> has no ancestor or sibling"
metrics:
  duration: "55m"
  completed: 2026-11-10
actuals:
  tokens: 41000
  tasks: 3
  commits: 3
plan_head_before: 21ee66dc19e2199d132ee1876be336c26d9bde30
plan_head_after: 084af8ddff3968b6352f92e863119ee0d75bf3ad
---

# Phase 64 Plan 01: Orca pane bundle and CSS isolation Summary

Orca's pane components built by Orca's own Vite into one ES bundle that runs on the host's React, with Orca's stylesheet scoped to the pane; the isolated per-leaf terminal mount measured PASS, every hosted type mounts standalone, and the scoped sheet changed 0 Theia and 0 pane values in lane-build mode.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 8e04bb01 | feat(64-01): Orca pane bundle built by Orca's Vite on Theia's React |
| 2 | 784cbfc1 | feat(64-01): standalone mounts with the isolated per-leaf stage, orca-pane-entry build gate |
| 3 | 084af8dd | feat(64-01): CSS scoping with the derived html clause, orca-pane-css and orca-pane-css-live |

## Outcomes

orca-pane-standalone-live: isolated per-leaf mount PASS -- 2 leaf records (split-left/split-right), 1 visible xterm per root (totals 2/2), markers own-leaf only, 4 handle(s) unchanged

- **Isolated stage (P64-32):** PASS on the first attempt, in 4 of 4 runs. Two React roots, each with `TerminalPane` and one leaf's `isolatedPaneKey`. Each root shows exactly one visible xterm. A marker typed into each root through BiDi key input reaches only its own leaf's PTY (`orca terminal read`). The CLI handle count is unchanged and `mountErrors` stays empty. Measured cost: each isolated root holds both leaves' xterms in its DOM (2 in total, 1 visible), because Orca isolates a leaf by applying its expanded layout to a full `TerminalPane`.
- **AppBackgroundServices:** it mounted in the hidden services root with no `services` mount error, so research assumption A-3 holds and it was kept. The check now has a clause for this and goes red on any services-root error.
- **Chat stage source:** `createChat` (Orca's own structured launch) produced the chat tab. No synthetic id was needed.
- **Mounts:** terminal, agent-session, simulator, conflict-review and check-details all mounted after the planted throwing child was recorded. The conflict review shows the live conflict ("1 unresolved conflict") once `setActiveWorktree` is called, which confirms A8 and Pitfall 6. The product widget should set the active worktree when it activates.
- **Bundle:** 893 files, entry 350 bytes, css 3,102,110 bytes. No React copy in `pb-panes/` (the standalone detector finds 1 file). React is 19.2.8 on both sides. Of 75 build:web assets, none is newly inlined. Orca's tracked status equals the baseline (the one staged seam). `orca-overlay` reports 1 seam and 3 overlay files.
- **CSS, lane-build mode:** `orca-pane-css-live: measured -- Theia 0 of 217 changed (control 1 from a 0-diff baseline); pane 0 of 126 changed (control letter-spacing 3); portal 0 of 72 changed [popper, slot-dialog-overlay, slot-dialog-content], Theia while open 0; ... html classes added [light] ..., 2 inline propert(y/ies) added or changed [--app-font-family --ui-zoom-factor] (0 non-custom), readers 0 over 8364 rule(s), probe true/true`, then `orca-pane-css-live: PASS -- lane-build mode`.
- **orca-pane-css:** `PASS -- 8417 rule(s) scoped; 52 Orca keyframe name(s) disjoint from Theia's 21; 362 root custom propert(y/ies) read by no Theia sheet`.

Orca typecheck: 0 -- $ node config/scripts/build-workspace-packages.mjs && node config/scripts/run-typecheck-projects-in-parallel.mjs --project=config/tsconfig.tc.web.json

That typecheck is a real check, not a pass by default. A type error planted in the copied entry made it exit 1, naming `src/renderer/src/pb/pb-pane-mount.tsx(566,14)`. It covers the entry, which lives under `src/renderer/src/**`. It does not cover `vite.pb-panes.config.ts` or `pb-css-scope.mjs`, which sit at the Orca root outside the web project.

## Findings for the coordinator

OWNER-ITEM: P64-31 mirror freeze after a TerminalPane mount: once any TerminalPane (isolated or not) has mounted in a paired web client, later host terminals created by the CLI or by terminal.create stop becoming tabs in that client (measured: miss within 8 s, 30 s and 15 s in three sessions; host handle count grows, client pane records do not). Research A4 attributed the freeze to createNewTerminalTab only. This breaks orca-tabs-live's "New Orca Terminal / CLI terminal becomes a hosted tab within 1 s" clause after the first terminal widget mounts; needs a cause in Orca's web-session-tabs-sync (or a seam) before p64-04's TERM-01 rows can go green.

The standalone check works around the freeze in two places. It creates its single-leaf terminal with `createTerminal` before any pane mounts. A fresh client with nothing mounted gets that tab, which proves that `createTerminal` itself works. The check also prints the freeze as a note line (`a CLI terminal created after TerminalPane mounts became a tab in this client: no (15 s)`). The freeze also limits stage 0's retry: a fresh split after the first attempt's mounts would not become records. That has not mattered so far, because the first attempt passes.

## Coordinator proof commands

Run these after the merged builds (Orca with `build-orca.sh`, Theia with the audited install, PowerBrowser). Each live row runs under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with every inherited ORCA_* variable unset. Run them in this order:

1. `scripts/verify-platform.sh --only orca-pane-css-live`. It must report `real-widget mode` (P64-15), because `theia/extensions/orca-panes` exists on the merged tree. The real-widget mode is untested in this lane, since that extension is absent here. It relies on `powerbrowser.orca.newTerminal`, `powerbrowser.orca.newChat`, the module key `Symbol.for('powerbrowser.orca-panes.module')` and `[data-pb-orca-pane]` on `OrcaPaneWidget.node`. It holds the baseline load with a BiDi `network.addIntercept` on `/orca-panes/` and then reloads.
2. `scripts/verify-platform.sh --only orca-pane-entry`
3. `scripts/verify-platform.sh --only orca-pane-css`
4. `scripts/verify-platform.sh --only orca-pane-standalone-live`
5. `scripts/verify-platform.sh --only orca-overlay-built`

## Merge note for the coordinator

- Merge this lane first. It edits `scripts/build-orca.sh` in three places only: the argument parse, the header's step 9 and `--panes-only` text, and step 9 itself. In `docs/BUILD.md` it adds one subsection, "### Pane bundle (Phase 64)". Phase 68's lane p68-01 also edits both files, so a conflict there follows 64-05 merge rule (6). `build-orca.sh` runs the pane step after build:web, and `--panes-only` reruns fetch-verify, the overlay copy and the pane step. Phase 66's browser-host step must go after it on both paths.
- No seam is added. No WINDOWS.md ids are touched. Registry: two `# NEW (64-01, ...)` blocks, at the quick anchor and at the full anchor. No 68 block is present at either anchor in this lane.
- The lane-build React hand-off line lives only in the git-ignored `theia/applications/browser/src-gen/frontend/index.js` of this lane. `git diff --name-only -- theia` is empty.
- Brand rows needed (`inventory/brand-tokens.json` not edited). The counts come from `scan-brand-residue --report`. Condition 4, unclaimed occurrences per new file:
  - orca-overlay/files/pb-css-scope.mjs: orca 9, Orca 8
  - orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx: orca 16, Orca 17
  - orca-overlay/files/vite.pb-panes.config.ts: orca 7, Orca 4
  - scripts/build-orca-panes.sh: orca 43, Orca 11, ORCA 10
  - scripts/lib/orca-pane-harness.mjs: orca 47, Orca 9, ORCA 8
  - scripts/verify-orca-pane-css-live.mjs: orca 52, Orca 34, ORCA 3
  - scripts/verify-orca-pane-css.mjs: orca 32, Orca 7, ORCA 5
  - scripts/verify-orca-pane-entry.mjs: orca 58, Orca 5
  - scripts/verify-orca-pane-standalone-live.mjs: orca 31, Orca 5, ORCA 2

  The held-back rows drifted (expected → observed) in files they already cover, from the edits to `docs/BUILD.md`, `scripts/build-orca.sh` and `scripts/verify-platform.sh`. The `-PLAN.md` row drifted because the entry's header names `64-01-PLAN.md`.
  - "Orca" title: 637 → 645
  - "orca" lower: 1287 → 1337
  - "ORCA" upper: 294 → 296
  - "orcad" lower: 783 → 784
  - "-PLAN.md" literal: 66 → 67

  The full report is .mozbuild/p64-01/brand-report.md (424 condition-4 lines).

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 1] The entry's marker in pb-panes.js.** Rolldown makes `pb-panes.js` a re-export facade, so the code that holds the marker literals sits in a chunk under `assets/`. The config's marker plugin now also prepends a `/* PB_OVERLAY_BUILD [...] */` comment, carrying only the config's own markers plus the scoping pass's imported one. It does this in `generateBundle`, after minification. Task 1 commit.
2. **[Rule 1] reactIdentity.** `import * as React` is a namespace object, so it never equals the hand-off's React. The entry now exports React's default export. Found by the lane-build run's identity check. Task 3 commit.
3. **[Rule 1] C3 exports exact.** `paneRecords` was exported by mistake; orca-pane-entry's exact-export clause found it, and it is no longer exported. Task 2 commit.
4. **[Rule 1] pnpm 12 lockfile.** `orca/pnpm-lock.yaml` is two YAML documents, and the first `importers:` section holds only pnpm itself. The React-version parser reads every document, and the self-test fixture has both.
5. **[Rule 1] Inlined-asset clause.** Orca's own build:web already inlines `codicon-*.ttf` as a data: URL (in `use-monaco-theme-*.css`), and also emits it as a file. A literal "no build:web asset is inlined" clause would therefore go red on Orca's own behaviour. The clause now flags an asset only when `pb-panes/` inlines it and build:web does not. The match is derived from each file's first 48 bytes in base64.
6. **[Rule 1] Host-owned custom properties.** orca-pane-css found `:root{--vscode-sash-size;--vscode-sash-hover-size}` (Monaco) in the pane sheet, and Theia reads both through var(). The pass now scopes custom properties in the `--vscode-*` and `--theia-*` namespaces. Orca never writes those on `<html>`. A fixture covers the change.
7. **[Rule 1] The html class reader.** A raw `.light` match flagged Monaco's `.colorpicker-header .picked-color.light`, where the class sits on another element. The clause now judges only the leftmost compound of each selector, and only when every other class in that compound is on `<html>`. Self-test cases cover both directions. The probe sheet is still detected first.
8. **[Rule 1] The lane-build baseline.** The first CSS run took the Theia baseline after the bundle had booted, so Orca's `<html>` writes were already in the baseline. The bundle now loads after the baseline. Measured result: Orca adds the class `light` and the custom properties `--app-font-family` and `--ui-zoom-factor`. The other 595 inline properties are Theia's own.
9. **[Rule 2] Benign window error.** The HTML spec's "ResizeObserver loop completed with undelivered notifications" is not counted as a mount error; any other window error is. A self-test case covers this.
10. **Interpretation, "exactly one xterm" (isolated stage).** The stage judges visible xterms, as the must-have says ("each root shows exactly one xterm"). The total per root (2) is recorded in the PASS line.
11. **Portal probe tooltip.** The terminal pane shows no tooltip trigger, so the tooltip comes from a chat pane. The lane-build widget runs split-right beside the terminal, and the same chat is mounted on the standalone page. The dialog is Orca's own running-process close confirmation for the terminal, which runs `sleep 600`; Escape dismisses it.
12. **`pnpm run typecheck:web` side effect.** pnpm's pre-run install executed `node-gyp rebuild` for Orca's own first-party workspace packages `native/windows-registry` and `native/windows-security`. Orca's tracked status was unchanged, and no third-party script ran.

## Known Stubs

None. `Waiting` renders Orca's own empty surface (`bg-background`) while the store has no tab, per C3.

## Threat Flags

None beyond the plan's register. The harness server is loopback-only, and it sends CORS `*` for the cross-origin module import in lane-build mode. The pairing value never leaves memory: a secret scan of standalone.txt and css-live*.txt finds 0 matches.

## Left undone / not verified

- orca-pane-css-live's real-widget mode was not run here, because the extension is absent. The coordinator's first run is its first execution.
- `verify-platform.sh --quick` in this lane: all 6 new quick rows pass, and so do `orca-overlay` and its self-test. The other reds are environmental: there is no `upstream/` Gecko checkout in the lane worktree (ext-tab-host-*, ext-network-wall, crash-*, shell-*, licensing and others), and the brand-residue rows above have not been added yet. This lane touches none of those rows.
- One stray scratch output (/tmp/claude-1000/pbtmp-split) could not be removed from this session.

## Self-Check: PASSED

- Files: all 12 lane files exist on ServerDestroyer/p64-01. The lane diff lists only files_modified (verified before this SUMMARY).
- Commits 8e04bb01, 784cbfc1 and 084af8dd are ancestors of HEAD.
- `grep -c '# NEW (64-01' scripts/verify-platform.sh` gives 2.
- The self-tests print "  ok " lines as follows: orca-pane-entry 12, standalone 17, css 10, css-live 20.
