---
phase: 64-orca-panes-as-powerbrowser-tabs
plan: 05
subsystem: orca-panes-coordinator
status: complete
tags: [orca, coordinator, merge, live-proofs, brand-rows, tracking]
requires:
  - "Phase 68 wave 1 merged first (86d211c0); 63-04 coordinator merge"
provides:
  - "lanes p64-01..p64-04 merged into ServerDestroyer/v1.7-Orca-integration"
  - "@powerbrowser/orca-panes wired into the browser app"
  - "orca-pane-css-live PASS in real-widget mode on the merged tree (P64-15)"
  - "Orca-family brand rows re-measured"
affects: [65, 66, 67, 68]
tech-stack:
  added: []
  patterns:
    - "live rows that need hosted Orca panes run in PowerBrowser's own orcad session (withOrcaTabsSession or orca-pane-harness pbOrcad)"
key-files:
  created:
    - .planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-05-SUMMARY.md
  modified:
    - theia/package.json
    - theia/applications/browser/package.json
    - inventory/brand-tokens.json
    - orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx
    - theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx
    - powerbrowser/shell/OrcaService.sys.mjs
    - scripts/lib/orca-pane-harness.mjs
    - scripts/lib/orca-tabs-live.mjs
    - scripts/verify-orca-pane-css-live.mjs
    - scripts/verify-orca-pane-standalone-live.mjs
    - scripts/verify-orca-tabs-live.mjs
    - scripts/verify-uri-roundtrip.mjs
    - scripts/verify-mode-switch-tabs-live.mjs
    - scripts/verify-platform.sh
    - scripts/build-orca.sh
    - docs/BUILD.md
    - scripts/verify-orca-service.mjs
    - .planning/workstreams/orca/ROADMAP.md
    - .planning/workstreams/orca/REQUIREMENTS.md
    - .planning/workstreams/orca/STATE.md
decisions:
  - "Phase 64 merged second: build-orca.sh, docs/BUILD.md and verify-orca-service.mjs keep both sides; 64-03's scenarios I and I-b re-lettered J and J-b because 68-07 owns I"
  - "TAB-01 and TAB-02 complete on recorded PASS lines; TAB-04, TAB-06, TERM-01 and TERM-04 stay pending with traceability notes and a Deferred Verification row"
  - "Two owner decisions recorded, not chosen: which terminal keys stay PowerBrowser's (TERM-04), and the New Orca Terminal/Chat worktree fallback with no hosted pane (C9 vs C3)"
metrics:
  duration: "about 4 h"
  completed: 2026-11-10
actuals:
  tokens: 60000
  tasks: 3
  commits: 32
plan_head_before: 86d211c0463d637b0a30dda458ef3220b3c2f061
plan_head_after: see the docs(64-05) SUMMARY commit
---

# Phase 64 Plan 05: coordinator — lanes merged, panes wired, live proofs and tracking Summary

The four Phase 64 lanes are merged into v1.7 after Phase 68 wave 1. The hosted Orca panes are wired and built, and Orca's stylesheet is proven isolated in a real hosted pane first. Ten fix(64-05) commits repair what the first merged runs exposed: the mirror freeze, the pairing hand-off, widget mounting, focus, offer cleanup on stop, and five instruments that had never run against a live merged tree. TAB-01 and TAB-02 are complete. TAB-04, TAB-06, TERM-01 and TERM-04 stay pending on two owner decisions and one environment limit.

`commits: 32` is the measured `git rev-list --count 86d211c0..HEAD` after the SUMMARY commit. It includes the lanes' own commits. This plan's own first-parent commits are 17: 4 merges, 1 wiring, 10 fixes, 1 brand-row commit and the SUMMARY/tracking commit.

## Lanes

| Lane | Branch (full ref) | Head | Worktree |
|------|-------------------|------|----------|
| p64-01 | refs/heads/ServerDestroyer/p64-01 | 70159c83 | /home/chris/orca/workspaces/Power-Browser/p64-01 |
| p64-02 | refs/heads/ServerDestroyer/p64-02 | dfd75c6e | /home/chris/orca/workspaces/Power-Browser/p64-02 |
| p64-03 | refs/heads/ServerDestroyer/p64-03 | f29bf18b | /home/chris/orca/workspaces/Power-Browser/p64-03 |
| p64-04 | refs/heads/ServerDestroyer/p64-04 | 910749bf | /home/chris/orca/workspaces/Power-Browser/p64-04 |

No lane SUMMARY holds a `BLOCKER:` line.

## Pre-merge baseline

`nix develop .#theia --command scripts/verify-platform.sh --quick` at 86d211c0: `verify-platform: PASS -- all checks passed`, exit 0. **Red rows: none.**

## Owner items from lanes

Copied verbatim (the one `OWNER-ITEM:` line):

OWNER-ITEM: P64-31 mirror freeze after a TerminalPane mount: once any TerminalPane (isolated or not) has mounted in a paired web client, later host terminals created by the CLI or by terminal.create stop becoming tabs in that client (measured: miss within 8 s, 30 s and 15 s in three sessions; host handle count grows, client pane records do not). Research A4 attributed the freeze to createNewTerminalTab only. This breaks orca-tabs-live's "New Orca Terminal / CLI terminal becomes a hosted tab within 1 s" clause after the first terminal widget mounts; needs a cause in Orca's web-session-tabs-sync (or a seam) before p64-04's TERM-01 rows can go green.

Resolved: 64-MIRROR-FREEZE.md found the cause, and the seam-free fix is f0910bfa. orca-tabs-live `freeze-guard: PASS`, and orca-pane-standalone-live `late CLI terminal PASS -- a tab in 2 ms`.

The lanes record these other owner items (not as `OWNER-ITEM:` lines). They are carried into STATE.md's Deferred Verification row:
- p64-01: P64-32 isolated per-leaf mount PASS, so no D-15 terminal-split deviation is open.
- p64-02: a layout-restored `pb-orca:` tab shows an empty title until the bundle boots.
- p64-02: the commands' "first worktree" fallback comes from the pane list, so with no hosted pane and no active worktree, New Orca Terminal and New Orca Chat do nothing.
- p64-03: a stored custom mode named "Orca" is hidden by the shipped Orca mode; the Orca address-bar default is Address (D-17 fallback); T-61-04/P64-07 stands.
- p64-04: P64-33 in-session key control; TERM-04: Theia `t<n>` terminals pass Ctrl+W and Ctrl+T to the shell; busy-chat close not exercisable with the stub agent.

## Merges and scope checks

The scope check reads each plan's frontmatter `files_modified` with node and compares it with `git diff --name-only $(git merge-base HEAD ref) ref`:

| Lane | Paths | Outside files_modified | Merge commit | Conflicts and resolution |
|------|-------|------------------------|--------------|--------------------------|
| p64-01 | 13 | none | 277cceb6 | build-orca.sh: 64-01's `--panes-only` block kept before 68-01's step-2 shell-entry text (both kept). docs/BUILD.md: 68-01's "### Packaged Orca" then 64-01's "### Pane bundle (Phase 64)". verify-platform.sh: both anchors, the 64-01 block after every 68 block |
| p64-02 | 15 | none | 0ce4107e | verify-platform.sh quick anchor: the 64-02 block after the 68 blocks and the 64-01 block |
| p64-03 | 10 | theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts (the accepted deviation) | d1d04e4b | verify-orca-service.mjs, merge rule (6): 68-07's scenario I kept; 64-03's I and I-b re-lettered **J** and **J-b** (functions, fail labels, header clause 11, PASS-line label map). OrcaEnv/OrcaService auto-merged function by function |
| p64-04 | 8 | none | 36527207 | verify-platform.sh: the 64-04 blocks after 64-02 (quick) and after 64-01 (full) |

Registry order (`grep -n '# NEW (6[48]-0'`) at the quick anchor is 68-03, 68-01, 68-07, 68-09, 68-02, 64-01, 64-02, 64-04. At the full anchor it is 68-03, 68-04, 68-01, 68-07, 68-09, 64-01, 64-04.

Post-merge checks (all exit 0 unless noted):
- After p64-01: orca-overlay, orca-overlay-self-test, orca-pane-entry-self-test, orca-pane-css-self-test, orca-pane-css-live-self-test, orca-pane-standalone-live-self-test, build-orca-portable-self-test.
- After p64-02: gui04-registry-shape and orca-pane-routes-self-test passed. orca-pane-routes was red; fixed by 09af4a1d. diff-theia-core was red until the audited install (`Top level patterns don't match`, the new workspace member, as in lane p64-02).
- After p64-03: gui07-mode-toggle-commands (+self-test), gui07-mode-switch-tabs-invariant, orca-service, orca-service-self-test (34 plants), internals-boundary, internals-catalogue, shell-error-copy-no-internals, ng-040-internals-catalogue-lines, address-bar-modes (+self-test), orca-claude-sdk (+self-test), orca-overlay.
- After p64-04: orca-terminal-keys, orca-terminal-keys-self-test, orca-terminal-keys-live-self-test and orca-tabs-live-self-test passed. gui07-mode-switch-tabs-live-self-test was red until the build (the built app predated orca-panes), then PASS: "the clean control is green and all 6 planted faults went red".
- generate.mjs: `generate: PASS -- 72 file(s) written`.

`orca-service: PASS -- ... stub-boundary scenarios A, B, C, D, E, F, H, I, J (hand-off files), J-b (no bundle folder) (... SDK extension disabled, offer and bundle folder after ready); orca-panes file names compared; bundle folder compared`

## Wiring

828ad888 `build(64-05): wire @powerbrowser/orca-panes into the browser app`. build:extensions gains `yarn --cwd extensions/orca-panes build` after orca-agents, and the browser app depends on `"@powerbrowser/orca-panes": "0.1.0"`. `theia-build-order: PASS`.

## Builds

All builds ran with every inherited ORCA_* name unset.
- Theia: `yarn install --ignore-scripts --frozen-lockfile`, the drivelist rebuild, `yarn build`, exit 0. `theia/yarn.lock` is unchanged, and src-gen server.js and frontend index.js name orca-panes. `diff-theia-core: PASS -- zero changes inside @theia/*`. gui04-registry-shape PASS. Rebuilt twice after the widget fixes; the frontend bundle carries both.
- Orca: `nix develop .#orca --command bash scripts/build-orca.sh`. Log build-20261110T224810Z: "overlay applied" for the 3 seams now on the branch (010, 070 and 080 from Phase 68), "overlay copied" for pb-css-scope.mjs, src/renderer/src/pb/pb-pane-mount.tsx and vite.pb-panes.config.ts, `build-orca-panes: PASS -- 893 files, entry 350 bytes, css 3102110 bytes` and `build-orca: PASS -- built v1.4.248`. orca/out/cli/index.js is present. `--panes-only` reran after the pairing fix (`build-orca: PASS -- panes only in 8s`), as did `build-orca-panes.sh --standalone`.
- PowerBrowser: `./mach build faster` exit 0. The packaged OrcaService.sys.mjs and OrcaEnv.sys.mjs equal the tree's copies; OrcaEnv defines `ORCA_WEB_PAIRING_FILE = "web-pairing"`. Rebuilt with faster after 8e590e08, and the packaged copy equals the tree. No tier-3 build was needed.

## CSS-first proof (P64-15)

`orca-pane-css-live: measured -- Theia 0 of 217 changed (control 1 from a 0-diff baseline); pane 0 of 126 changed (control letter-spacing 3); portal 0 of 72 changed [popper, slot-dialog-overlay, slot-dialog-content], Theia while open 0; tooltip/dialog opened theia tooltip=1 standalone tooltip=1 theia dialog=2 standalone dialog=2; html classes added [light] (now [notranslate light], 597 inline), 2 inline propert(y/ies) added or changed [--app-font-family --ui-zoom-factor] (0 non-custom), readers 0 over 8364 rule(s), probe true/true`

`orca-pane-css-live: PASS -- real-widget mode; Theia 0 of 217 and pane 0 of 126 values changed with both controls registered; portal probe 0 of 72; Orca's <html> writes (1 class(es), 2 custom propert(y/ies)) read by no Theia rule`

That PASS came first; it reran on the final build with the same PASS. The cross-lane clauses then compared:
- `orca-pane-routes: PASS -- 8 TabContentType members ... equal ORCA_PANE_ROUTES' keys; ...; no client-side terminal creation; (d) bundle API and hand-off key compared; (g) module key and boot event compared`
- `orca-service: PASS -- ...; orca-panes file names compared; bundle folder compared`
- `orca-terminal-keys: PASS -- 6 keys derived from PAGE_KEYS reserved rows (ctrl+t, ctrl+w, ctrl+tab, ctrl+shift+tab, ctrl+pagedown, ctrl+pageup); orca-panes rows compared`

## fix(64-05) commits, with the failing lines

1. **f0910bfa** — the mirror freeze (lane OWNER-ITEM P64-31). The exact seam-free fix from 64-MIRROR-FREEZE.md: bootstrap wraps `window.api.runtimeEnvironments.subscribe`, and an echo reaches the mirror as version 0 of the real epoch.
2. **0efb0787** — optional clean-up. orca-pane-standalone-live's late-CLI note becomes a judged clause: a tab within 1000 ms of the CLI's exit. The self-test gains 6 cases.
3. **09af4a1d** — `orca-pane-routes: FAIL -- client-side terminal creation: orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx holds the session.tabs.createTerminal method string`. The string sat only in the entry's rule comment, which now names the method without spelling it.
4. **1444e9fa** — `explicit bootstrap: rejected: orca pane bootstrap: parseWebPairingInput failed (not a runtime pairing offer)`. The hand-off file holds orcad's web-client URL (C5). bootstrap now reads the offer with Orca's own `readPairingInputFromLocation`.
5. **7232f1ee** — orca-pane-css-live real-widget mode had never run before. Failing lines in order:
   - `harness: BiDi error: invalid argument -- URL pattern contained an unescaped forbidden character *`
   - `timed out after 60000 ms waiting for the orca-panes bundle to boot` (no PowerBrowser orcad in the probe shell)
   - 46 of 126 pane values differing: a BiDi-held stylesheet request stays pending across the reload and cannot be released
   - `timed out after 30000 ms waiting for the hosted terminal widget`
   - the Theia tooltip trigger measured 0x0

   The harness gains `pbOrcad`. The baseline is held by setting the offer file aside inside the 0700 bridge folder, always restored, with an assertion that the baseline document holds no Orca link or module. Other changes: a seed terminal, the xterm-holding pane measured, the chat docked split-right, and both widgets re-activated as in lane-build mode. The verdicts are unchanged.
6. **1f46dba0** — `split: orca-pane:term4 holds 0 xterm elements, want 1; split: orca-pane:term4's marker missing from its own leaf; ... reached the other leaf`.
   - OrcaPaneWidget mounted only on after-show, which a widget attached already visible never receives; onAfterAttach now mounts it.
   - onActivateRequest focused a hidden leaf's textarea; it now focuses the first element with client rects.
7. **505330be** — orca-tabs-live against the pinned web client:
   - `pairing in page memory did not complete (evaluate failed: BiDi request 'script.evaluate' timed out after 20000ms)`: a 40 s in-page wait, and the http URL typed into Orca's pairing field. Now the offer is read from the URL, the submit returns at once, and the paired screen is polled.
   - "Select a workspace from the sidebar to begin": the worktree is now selected through Orca's sidebar row.
   - `split: orca-pane:term2 holds 2 xterm elements, want 1`: visible xterms are now counted, as orca-pane-standalone-live judges them, with the total shown.
   - Lookups added for the chat row aria-label/title and the chat-header "Split Chat Right".
   - An escaped apostrophe inside a page-script template.
8. **43252e5e** — `verify-uri-roundtrip: FAIL pb-orca rows -- BiDi request 'script.evaluate' timed out after 20000ms` (no orcad), then `FAIL pb-orca: with term1 open -- focused nothing, active none`. The rows now run in withOrcaTabsSession, with the worktree selected through setActiveWorktree (P64-23) and the Theia frame focused.
9. **60e5afe4** — `verify-mode-switch-tabs-live: FAIL -- could not drive the live frontend: Error: BiDi request 'script.evaluate' timed out after 20000ms`. The Orca seeds now run in withOrcaTabsSession.
10. **8e590e08** — after the live rows, 22 bridge folders under /run/user still held `web-pairing` (C5: removed on stop). On quit, `_stopTree` ended before the Phase 64 removal loop. It now removes web-pairing and orca-panes-dir first. Afterwards orca-service-live and the final live batch left no offer file. The 38 leftover files from this session's runs were removed by hand; their orcads were dead.

No fix touched a ledger-locked file; ledger/REQUIREMENTS.json locks none of them. No seam was added, and no tracked orca/, upstream/ or Theia core file was edited.

## Live, full and guard results (final build)

All live and full rows ran under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with ORCA_* unset and MOZ_PURGE_CACHES=1.

- `orca-pane-entry: PASS -- tracked status at baseline; React marker 1 file(s) in the standalone variant, 0 in pb-panes/; React 19.2.8/19.2.8; 75 build:web asset(s), none newly inlined; 1 overlay source(s) import no tab bar, TabGroupPanel or client-side terminal creation; C3 exports exact`
- `orca-pane-css: PASS -- 8417 rule(s) scoped; 52 Orca keyframe name(s) disjoint from Theia's 21; 362 root custom propert(y/ies) read by no Theia sheet`
- `orca-overlay-built: PASS -- 3 overlay file(s), each with its marker literal in a .js file under out/web or out/orcad`
- `orca-build-shape: PASS -- 0 slot markers, 0 Node runtimes in out/, 0 Electron binaries, 3 modified tracked file(s), equal to the declared seams of orca-overlay/seams.json`
- orca-pane-standalone-live, isolated stage: `orca-pane-standalone-live: isolated per-leaf mount PASS -- 2 leaf records (split-left/split-right), 1 visible xterm per root (totals 2/2), markers own-leaf only, 4 handle(s) unchanged`; `mounts PASS -- terminal, agent-session, simulator, conflict-review, check-details (agent-session from createChat)`; `late CLI terminal PASS -- a tab in 2 ms (limit 1000 ms)`; `PASS -- isolated per-leaf mount, 5 hosted type(s) mounted, late CLI terminal in 2 ms`
- orca-tabs-live stage lines (FAIL overall, 11 of 15 stages PASS). The script prints verdicts only and no clock values; the 1 s clocks are judged inside each PASS.
  - `terminal-user: FAIL -- terminal-user: no hosted terminal widget was added`
  - `terminal-cli: PASS`
  - `terminal-agent: PASS`
  - `freeze-guard: PASS`
  - `split: PASS`
  - `pb-split: FAIL -- pb-split: no hosted terminal from (a) to move`
  - `chat: FAIL -- chat: second client: Orca's own new-chat control not found in its page; chat (second client): no hosted agent-session widget was added`
  - `other-views: PASS`
  - `tab-groups: FAIL -- tab-groups: tab-group split not observed (no store record of the second group's tab with a first-group neighbour in the recorded direction)`
  - `organising: PASS`
  - `no-tab-chrome: PASS`
  - `close: PASS`
  - `reload: PASS`
  - `route: PASS`
  - `offer: PASS`
  - note: busy-chat close not exercised (the stub agent cannot hold a chat busy)
  - `orca-tabs-live: FAIL -- terminal-user, pb-split, chat, tab-groups`
- orca-terminal-keys-live:
  - `control: 6 keys measured in a t<n> terminal and a web tab`
  - `stage 2: FAIL -- ^W missing: ctrl+w pressed in the hosted Orca terminal did not reach the PTY (read ""); ctrl+w closed or switched a tab in the hosted Orca terminal (tab count change 0, active widget changed true); no sequence for ctrl+tab: it did not reach the PTY from the hosted Orca terminal`
  - `stage 3: equal to the control`
  - `FAIL`
- `verify-uri-roundtrip --scheme pb-orca`: `PASS pb-orca: before any hosted tab`, `PASS pb-orca:term1`, `PASS pb-orca: with term1 open`, `PASS pb-orca:term99`; 4/4 rows PASS.
- gui07-mode-switch-tabs-live: `derived modes [coding, browsing, organising, orca]`; `Orca seeds: orca-pane:chat1, orca-pane:term2`; `PASS -- 4 main-area and 2 bottom-area tab(s) survived every second-visit mode switch, attached`. Its self-test PASS (6 plants).
- `orca-service-live: PASS -- 19 environment names equal the expected set (planted ORCA_PLANT_62 absent), data root through the alias, ..., Node 24.19.0 shared with the Theia backend; quit ended a tree of 5 processes including an agent session; orcad pid ... survived the SIGKILL and was replaced ...`
- Phase 63 and 68 rows on the shared chrome files:
  - `orca-hidden-electron: PASS`
  - `orca-agent-hooks: PASS -- stage B (wrapper) ...`
  - `verify-bundled-extensions: PASS` (bundled-extensions-live)
  - `orca-claude-sdk: PASS -- ... S1 loaded, S2 rejected, S3 rejected, S4 rejected, S5 loaded ...`
  - `orca-claude-sdk-built: PASS`
  - orca-service and orca-service-self-test PASS (above)
- Guards, all exit 0: diff-theia-core, gui04-registry-shape, gui07-mode-toggle-commands, gui07-mode-switch-tabs-invariant, shell-error-copy-no-internals, internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines, start-path-recovery, orca-overlay, orca-bridge-dir, orca-service, generated-byte-identity, orca-pane-routes, orca-terminal-keys, orca-pane-entry, orca-pane-css, address-bar-modes, theia-build-order. yarn.lock is unchanged.

Why the four orca-tabs-live stages and keys-live stage 2 are red:
- **(a) terminal-user**: the lane p64-02 owner item. With no hosted pane and no active worktree, New Orca Terminal finds no worktree, because C9's "first worktree" is read from the pane list and C3 has no worktree list. A fix changes a shared contract, so it is an owner decision. Evidence: with one seeded pane the same command works (orca-pane-css-live, and the pb-orca rows with setActiveWorktree).
- **(e2) pb-split**: follows from (a).
- **(f) chat, second-client half**, and **(g2) tab-groups**: with the stub agent, the pinned client's New tab menu offers no chat row; "Claude" opens a terminal (measured), and the group split exists only on a chat pane header. This is an environment limit of the scratch session, like the busy-chat note. The lookups for the chat row and the chat-header split are in place but have not been exercised live.
- **orca-terminal-keys-live stage 2**: Orca's own TerminalPane installs window-capture keyboard shortcuts ("configurable Orca actions", terminal-keyboard-hook.ts) that run before xterm. Ctrl+W and Ctrl+Tab are consumed there. This is an inference from the source and the measured symptom, not traced line by line. Whether hosted terminals give those keys to the program means overriding Orca's shortcut policy: an owner decision under D-09.

## Requirement outcomes

TAB-01: PASS (gui07-mode-toggle-commands, gui07-mode-switch-tabs-live)
TAB-02: PASS (verify-uri-roundtrip --scheme pb-orca 4/4, gui04-registry-shape, orca-pane-routes)
TAB-04: PENDING (orca-tabs-live stages (a) terminal-user, (e2) pb-split, (g2) tab-groups: the command-fallback owner item and the stub-agent session offering no chat-header group split; (b)-(e), (h)-(k) and gui07-mode-switch-tabs-live PASS)
TAB-06: PENDING (orca-tabs-live stage (f) chat: second client offers no chat row with the stub agent; orca-pane-standalone-live and stage (g) other-views PASS)
TERM-01: PENDING (orca-tabs-live stage (a) terminal-user: New Orca Terminal with no hosted pane finds no worktree, owner item; stages (b)-(e) PASS)
TERM-04: PENDING (orca-terminal-keys-live stage 2: Orca's TerminalPane shortcuts take ctrl+w and ctrl+tab, owner decision under D-09; orca-terminal-keys PASS)

## Brand rows changed

Measured with the scanner's own exports (`loadInventory`, `scopeFiles`, `claimOccurrences`) over its scope on the committed merged tree, with the Orca-family rows widened to every scope file. No exclude entry was added, no file was removed from a row, and orca-panes, orca-overlay/files and the new scripts are scanned.

| Row | Old | New | Files added |
|-----|-----|-----|-------------|
| Orca (title) | 1064 | 1499 | 27: the orca-panes and overlay files, docs/URI-SCHEMES.md, the new checks and libs, chrome-bar-widget.tsx, mode-descriptors.ts, orca-scheme-coverage.ts |
| orca (lower) | 2667 | 3511 | 33: the above plus verify-mode-toggle-commands.mjs, address-bar-mode-table.ts, chrome-bar.css, mode-service.ts, orca-panes package.json, tab-uri-registry.ts |
| ORCA (upper) | 441 | 670 | 21, OrcaService.sys.mjs among them |
| orcad (lower) | 1104 | 1169 | 12 |
| ORCAD (upper) | 180 | 185 | scripts/lib/orca-tabs-live.mjs |
| -PLAN.md (literal) | 66 | 67 | orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx (expected_files; the row stays tree-wide) |
| pbOrca (new literal) | - | 15 | orca-pane-harness.mjs, verify-orca-pane-css-live.mjs, verify-uri-roundtrip.mjs |
| PbOrca (new literal) | - | 8 | the same three |
| needOrca (new literal) | - | 10 | orca-tabs-live.mjs, verify-orca-tabs-live.mjs, verify-orca-terminal-keys-live.mjs |
| withOrca (literal) | 10 | 19 | the Phase 64 checks and libs that call withOrcaPaneSession/withOrcaTabsSession |
| Orcad (literal) | 93 | 97 | scripts/lib/orca-pane-harness.mjs (startOrcad/stopOrcad) |

Result: `scan-brand-residue: PASS -- no residual brand occurrence in 768 scanned file(s)`, and `--self-test PASS`. `grep -c verify-orca-tabs-live.mjs inventory/brand-tokens.json` gives 18. Commit 2e30f508.

## --quick against the baseline

`nix develop .#theia --command scripts/verify-platform.sh --quick` at 2e30f508 (all brand rows committed): `verify-platform: PASS -- all checks passed`, exit 0; 375 rows PASS (baseline 365, the difference being rows the lanes added). No red row; the baseline had none.

## Tracking

- `roadmap update-plan-progress 64 --ws orca`: 64-01..64-04 are ticked. 64-05 ticks once this SUMMARY exists (rerun after the commit).
- `requirements mark-complete TAB-01 TAB-02 --ws orca`.
- TAB-04, TAB-06, TERM-01 and TERM-04 stay unchecked, each with a "Pending: ... did not PASS on the merged tree (...); re-run in the end-of-milestone pass" traceability status.
- STATE.md:
  - the Phase 64 table row lists TAB-01, TAB-02, TAB-04, TAB-06, TERM-01, TERM-04;
  - one Phase 64 outcome line under Decisions;
  - a Phase 64 Deferred Verification row naming the pending stages, the end-of-milestone items and the two owner decisions.
- state.advance-plan was not run. Nothing was pushed.

## Corrections for later phases

- P68-19 has no web-entry seam to classify (Phase 64 added no seam).
- Route A shows no orcad landing page, so Phase 67's INJ-01 applies only where an orcad-origin page loads. Phase 67's RUN-06 failure page renders inside OrcaPaneWidget.
- 64-RESEARCH A7: conflict review mounts Orca's own editor for a conflicted file, which Phase 65 criterion 1 must settle.
- Re-pairing after an orcad restart within one PowerBrowser session is Phase 65/67 work.
- 64-RESEARCH A4, A-1 and Pitfall 1: the freeze mechanism is the doubled client-navigation echo (64-MIRROR-FREEZE.md).
- Live rows that need hosted panes must run PowerBrowser's own orcad (withOrcaTabsSession, or orca-pane-harness `pbOrcad`). A plain probe shell boots no bundle, and any command awaiting it hits the 20 s BiDi limit.
- Phase 63's `orcad-data-root` is still removed only after the kill waits in `_stopTree`, so a quit can leave it behind. It holds no credential; it is recorded here, not changed.

## Deferred to the end-of-milestone pass (D-18)

- The hosted chat's look and behaviour against Orca's own.
- Orca's running-agent close confirmation readable with working buttons, and the busy-chat close (orca-tabs-live recorded it as not exercised).
- Owner item T-61-04 (P64-07).
- Auto-mode picks for owner review: P64-05 (boot at frontend start), P64-18 (no activation hook), and the Open Question 4 ruling (the derived html clause).
- The in-session key control replacing P63-25's pre-extension control (P64-33).
- The EXT-02 wrapper's placeholder pane as a hosted terminal tab (P64-36).
- A stored custom mode named "Orca" now hidden by the shipped Orca mode (mode-service.ts load rule).
- The Orca mode's address-bar default (Address).
- A layout-restored pb-orca: tab's empty title until boot.
- Owner decision, TERM-04: Orca's TerminalPane shortcuts take Ctrl+W and Ctrl+Tab in hosted terminals. Theia `t<n>` terminals pass Ctrl+W and Ctrl+T to the shell. Decide which keys stay PowerBrowser's.
- Owner decision, TERM-01/TAB-04: New Orca Terminal/Chat with no hosted pane and no active worktree does nothing (C9 vs C3).
- Re-run orca-tabs-live stages (a), (e2), (f) second client and (g2), and orca-terminal-keys-live, after those decisions and with an agent that offers chat rows.
- Ledger re-lock items: none.

## Deviations from Plan

- [Rule 1] The ten fix(64-05) commits above, each inside a 64-0N lane plan's files_modified.
- [Rule 1] 8e590e08 changes 64-03's OrcaService stop order (security: the offer left on disk).
- [Rule 3] The plan's Task 1 automated check pipes verify-platform's last line, which is always the driver's own summary. The row's own PASS line is recorded above.
- [Rule 3] Leftover offer files from this session's probe-shell runs were removed by hand. Every one belonged to a stopped orcad of this session.
- The verify-orca-service scenario letter change (I/I-b to J/J-b) follows merge rule (6).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: credential-at-rest | powerbrowser/shell/OrcaService.sys.mjs | Before 8e590e08, a quit left `web-pairing` (orcad's pairing offer) in the 0700 bridge folder under /run/user. Fixed by removing it first on stop. The offer is worthless once its orcad ends, and the folder stays private |

## Self-Check: PASSED

- Commits 277cceb6, 0ce4107e, d1d04e4b, 36527207, 828ad888, f0910bfa, 0efb0787, 09af4a1d, 1444e9fa, 7232f1ee, 1f46dba0, 505330be, 43252e5e, 60e5afe4, 8e590e08 and 2e30f508 are ancestors of HEAD.
- theia/applications/browser/package.json contains `@powerbrowser/orca-panes`.
- The Requirement outcomes section holds six lines.
