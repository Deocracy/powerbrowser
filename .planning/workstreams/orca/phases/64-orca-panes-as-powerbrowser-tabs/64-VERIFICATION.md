---
phase: 64-orca-panes-as-powerbrowser-tabs
verified: 2026-11-11T01:41:10Z
status: gaps_found
score: 9/10 must-haves verified
covered_files:
  - ".planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-01-PLAN.md"
  - ".planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-01-SUMMARY.md"
  - ".planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-02-PLAN.md"
  - ".planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-02-SUMMARY.md"
  - ".planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-03-PLAN.md"
  - ".planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-03-SUMMARY.md"
  - ".planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-04-PLAN.md"
  - ".planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-04-SUMMARY.md"
  - ".planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-05-PLAN.md"
  - ".planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-05-SUMMARY.md"
  - ".planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-06-PLAN.md"
  - ".planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-06-SUMMARY.md"
  - "docs/URI-SCHEMES.md"
  - "orca-overlay/files/pb-css-scope.mjs"
  - "orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx"
  - "orca-overlay/files/vite.pb-panes.config.ts"
  - "orca-overlay/seams.json"
  - "powerbrowser/shell/OrcaEnv.sys.mjs"
  - "powerbrowser/shell/OrcaService.sys.mjs"
  - "scripts/build-orca-panes.sh"
  - "scripts/lib/orca-tabs-live.mjs"
  - "scripts/verify-mode-switch-tabs-live.mjs"
  - "scripts/verify-orca-pane-css-live.mjs"
  - "scripts/verify-orca-pane-css.mjs"
  - "scripts/verify-orca-pane-entry.mjs"
  - "scripts/verify-orca-pane-routes.mjs"
  - "scripts/verify-orca-pane-standalone-live.mjs"
  - "scripts/verify-orca-tabs-live.mjs"
  - "scripts/verify-orca-terminal-keys-live.mjs"
  - "scripts/verify-orca-terminal-keys.mjs"
  - "scripts/verify-uri-roundtrip.mjs"
  - "theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts"
  - "theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx"
  - "theia/extensions/modes/src/browser/mode-descriptors.ts"
  - "theia/extensions/modes/src/browser/mode-service.ts"
  - "theia/extensions/orca-panes/package.json"
  - "theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts"
  - "theia/extensions/orca-panes/src/browser/orca-pane-observer.ts"
  - "theia/extensions/orca-panes/src/browser/orca-pane-routes.ts"
  - "theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx"
  - "theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts"
  - "theia/extensions/orca-panes/src/common/orca-panes-protocol.ts"
  - "theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts"
  - "theia/extensions/tab-uris/src/browser/orca-scheme-coverage.ts"
  - "theia/extensions/tab-uris/src/browser/tab-uri-registry.ts"
covered_digest: "v3:sha256:e5aa8a71535e94c8fdf8044b9fe391bd2cdeee2acc69615e37fcc97d9551af3c"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "SC2 / TAB-04: Orca's tab groups appear as Lumino splits"
    status: partial
    reason: >-
      The rest of SC2 holds (one tab per pane, Organising rows, PB-side split, mode moves, in-tab terminal splits as
      Lumino splits, no Orca tab chrome). The tab-group half is implemented only as placement at a pane's first
      appearance (P64-12) and no check has ever observed it: orca-tabs-live stage g2 is red on the 64-06 tree, and no
      self-test or fixture exercises the group branch of paneRecords, planPanes or placementFor. The coordinator's
      stated cause ("Split Chat Right opened a chat in the same tab group") is not settled by its own observation:
      the second client reported groupIndex 1 (two [data-tab-group-strip-id] strips after the click) while PB's store
      held every pane of the worktree in one group with only tab-after neighbours. That is equally consistent with
      group layout made in another client never reaching PB's store at this pin, in which case a drag-driven g2 would
      also stay red.
    artifacts:
      - path: "orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:359-381"
        issue: "groupNeighbours derives split modes from the document's own layoutByWorktree; untested, never observed live"
      - path: "theia/extensions/orca-panes/src/browser/orca-pane-routes.ts:57-66,121-124"
        issue: "placementFor is applied only to new keys; a known key whose group changes is only retitled (P64-12 by design), so a tab moved into a new Orca group never becomes a Lumino split"
      - path: "theia/extensions/orca-panes/src/browser/orca-pane-observer.ts:132-141"
        issue: "addWidget with mode/ref only on create"
      - path: "scripts/verify-orca-tabs-live.mjs:486-511,694-716"
        issue: "stage g2 red: tab-group split not observed (.mozbuild/p64-06/batch-orca-tabs-live.txt)"
    missing:
      - "Establish whether the pinned orcad publishes one client's tab-group layout to another web client's store at all (layout frames vs client-local groupsByWorktree); if not, record TAB-04's group clause as unreachable at this pin as an owner decision rather than a check-driving problem"
      - "A pure fixture test for paneRecords' group branch plus planPanes/placementFor (a two-group layout gives split-right/split-bottom placement on the first-group widget); orca-pane-routes.ts is Node-loadable by design"
      - "A green orca-tabs-live stage g2 on the merged tree, or an owner override of the group clause"
deferred:
  - truth: "orca-tabs-live stage g2 re-run (drag-driven Orca tab-group split in the second client)"
    addressed_in: "end-of-milestone verification pass (not a roadmap phase; recorded in REQUIREMENTS.md TAB-04 traceability and STATE.md Phase 64 Deferred Verification)"
    evidence: "REQUIREMENTS.md:230 TAB-04 Pending ... re-run in the end-of-milestone pass"
  - truth: "EXT-02 wrapper terminal shown as a hosted terminal tab (SC6 creator list)"
    addressed_in: "end-of-milestone verification pass (EXT-01 extension half)"
    evidence: "ROADMAP Phase 63 SC3: the extension half runs with EXT-01 in the end-of-milestone pass; P64-36 owner item on its look"
  - truth: "Busy-chat close shows Orca's running-agent confirmation"
    addressed_in: "end-of-milestone verification pass"
    evidence: "orca-tabs-live note: busy-chat close not exercised"
  - truth: "Owner items from 64-06: Ctrl+V and Ctrl+C-with-selection stay Orca's in hosted terminals (xterm bypass policy); Ctrl+Shift+W from a focused web page goes to the page; the two quick-pick placeholder strings; P64-37 itself; Ctrl+[ / Ctrl+] release proven statically only"
    addressed_in: "end-of-milestone owner review"
    evidence: "64-06-SUMMARY Owner-review notes; orca-terminal-keys notes"
---

# Phase 64: Orca panes as PowerBrowser tabs Verification Report

**Phase Goal:** The Orca mode shows Orca's work as PowerBrowser tabs. Each Orca pane is one Lumino tab that moves between modes and can be organised like any Theia or browser tab.
**Verified:** 2026-11-11T01:41:10Z
**Status:** gaps_found
**Re-verification:** No (initial verification)

Method: code read on HEAD 26f72bff; quick rows re-run by this verifier inside `nix develop .#theia`; live rows taken from the coordinators' raw outputs in `.mozbuild/p64-05` and `.mozbuild/p64-06` (no live run or build here).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 / TAB-01: an "Orca" mode appears beside Coding in `SHIPPED_MODES` and the chrome bar, and selecting it shows Orca's work | VERIFIED | `mode-descriptors.ts` appends `orca` (no hook); `SHIPPED_MODE_RULES.orca` in `mode-service.ts`; `ChromeBarWidget.MODES` gains 'Orca'; IDE dress for orca in `chrome-bar-widget.tsx`. `gui07-mode-toggle-commands` (+self-test) PASS here. Live walk derived `[coding, browsing, organising, orca]` and kept hosted tabs across 14 switches (batch-gui07-mode-switch-tabs-live.txt) |
| 2 | SC2 / TAB-04: each pane is its own tab and Organising row, can be split and moved to any mode and back; Orca in-tab splits **and tab groups** appear as Lumino splits; Orca tab bar/groups not rendered | FAILED (partial) | Everything but tab groups: stages a-c, f, g (one tab per pane), h organising, e split, e2 pb-split, i no-tab-chrome PASS; mode-switch walk PASS with seeds chat1, term2. Tab groups: stage g2 FAIL; no other test exercises the group branch. See Gaps |
| 3 | SC3 / TAB-06: chat and every other Orca-only view of the Phase 61 inventory opens as its own tab | VERIFIED | Spike 004 Q1 inventory: agent-session, simulator, conflict-review, check-details are the Orca-only types; all four are `hosted-pane` in `ORCA_PANE_ROUTES` and have a `PaneBody` branch. standalone-live "mounts PASS -- terminal, agent-session, simulator, conflict-review, check-details"; tabs-live f chat and g other-views PASS |
| 4 | SC4: a check derives Orca's tab content types from the pinned source and compares them as a set with PB's mapping | VERIFIED | `verify-orca-pane-routes.mjs` parses `TabContentType` with the TypeScript AST, set-diffs both ways against `ORCA_PANE_ROUTES` keys; plants `content-type-added`, `content-type-removed`, `empty-union` among 13. `orca-pane-routes` and self-test PASS here ("8 TabContentType members ... equal") |
| 5 | SC5 / TAB-02: `pb-orca:` documented, round-trips, registry shape unchanged | VERIFIED | `docs/URI-SCHEMES.md:182-` section; `orcaPaneUriOf` + one branch in `TabUriRegistry.uriOf` (tab-uri-registry.ts:167-170); `verify-registry-shape.mjs` untouched since 04d37a87 and `gui04-registry-shape` (+self-test) PASS here; batch-verify-uri-roundtrip.txt "4/4 rows PASS" (empty path, term1, empty with term1, stale term99) |
| 6 | SC6 / TERM-01: every Orca terminal is a PB tab showing Orca's `TerminalPane` on Orca's engine, accepts input, shows output; in-tab split as Lumino splits; Theia terminals stay plain | VERIFIED | `PaneBody` mounts `TerminalPane` with `isolatedPaneKey`; creation only through `callRuntimeResult('terminal.create')` (orca-pane-entry asserts no client-side creation import). tabs-live a terminal-user, b terminal-cli, c terminal-agent, d freeze-guard, e split PASS; keys-live control in a Theia t<n> unchanged. EXT-02 wrapper path is the same `terminal.create` as (b); its own run is deferred |
| 7 | SC7 / TERM-04 (D-32): Ctrl+W/T to the shell, switch keys switch from every tab, Orca window shortcuts off in hosted terminals, Ctrl+Shift+W closes; measured live in one session; a derive-and-compare check | VERIFIED | `ORCA_TERMINAL_PASSTHROUGH_KEYS = ['ctrl+w','ctrl+t']` with a scoped `when`; chrome-bar binds ctrl+pagedown/pageup/ctrl+shift+w to NEXT_TAB/PREVIOUS_TAB/CLOSE_TAB; entry sets `terminalShortcutPolicy = 'terminal-first'` in-memory and releases Ctrl+[ / Ctrl+]. `orca-terminal-keys` PASS here (derived from PAGE_KEYS reserved rows) and self-test 23 plants PASS; batch-orca-terminal-keys-live.txt PASS (control, stage 2, stage 3 equal) |
| 8 | No new seam (overlay seams 010, 070, 080 only), no Theia core edit, no tracked orca/ edit | VERIFIED | `seams.json` lists exactly 010, 070, 080; 070/080 came from 68-07/68-03 commits, none from a 64 commit. `orca/` is gitignored with 0 tracked files; `git -C orca status` shows only the 3 staged seams and overlay copies. `diff-theia-core: PASS -- zero changes inside @theia/*` (run here). `orca-overlay` (+self-test) PASS |
| 9 | OrcaService hand-off files (web-pairing, orca-panes-dir, orcad-data-root) written 0600 after ready and removed before orcad is signalled | VERIFIED | `_writeHandOff` via `writePrivateFile`; `_stopTree` (OrcaService.sys.mjs:549-560) removes all three before `killProcess`. orca-service self-test scenario J plant "bridge files removed after orcad is signalled" PASS here; orca-service-live PASS |
| 10 | Mirror freeze fixed: a CLI terminal still becomes a tab after PB-side activation/creation | VERIFIED | `staleNavigationEchoes()` in pb-pane-mount.tsx re-labels the doubled `:client-navigation` echo; tabs-live d freeze-guard PASS; standalone-live late CLI terminal in 2 ms |

**Score:** 9/10 truths verified (0 present, behavior-unverified)

### Is the tab-group behaviour implemented in code?

Partly. `paneRecords` (pb-pane-mount.tsx:343-) gives each tab its other-group neighbours with a split mode read from `layoutByWorktree` ('horizontal' = side by side, which matches Orca's `TabGroupSplitNodeTree` flex row), `placementFor` takes the first neighbour that already has a widget, and the observer calls `addWidget(widget, { area: 'main', mode, ref })`. So a pane that first appears in a second group, when PB's own store records that group split, would be placed as a Lumino split. Two limits follow from the code:

- Placement happens only when a pane first appears (P64-12). An existing tab that Orca moves into a new group (the pinned client's tab drop on a group edge) is a known key, which only gets a new title. It does not move in Lumino.
- PB's own document never makes groups (no Orca tab bar, D-29), so the branch depends on another client's groups reaching PB's store. g2's observation does not show that this happens.

No test has ever exercised this branch.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | orca-tabs-live g2 re-run | end-of-milestone pass | REQUIREMENTS.md:230 |
| 2 | EXT-02 wrapper terminal as a hosted tab | end-of-milestone pass (EXT-01) | ROADMAP Phase 63 SC3, P64-36 |
| 3 | Busy-chat close confirmation | end-of-milestone pass | tabs-live note |
| 4 | Owner items: Ctrl+V, Ctrl+C with selection, Ctrl+Shift+W in a web page, quick-pick placeholders, P64-37, Ctrl+[ / Ctrl+] live | end-of-milestone owner review | 64-06-SUMMARY |

The end-of-milestone pass is not a roadmap phase. Step 9b therefore cannot move the g2 gap out of `gaps`.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `theia/extensions/orca-panes/` | widget, observer, routes, bundle loader, gated route, commands, key rows | VERIFIED | 1088 lines, substantive; in `applications/browser/package.json` and `build:extensions` |
| `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx` | bundle API, mirror-freeze fix, D-32 in-memory policy, worktree list | VERIFIED | C3 exports exact (orca-pane-entry PASS) |
| `orca-overlay/files/vite.pb-panes.config.ts`, `pb-css-scope.mjs` | Orca's Vite build on host React; scoped CSS | VERIFIED | orca-pane-css PASS (8417 rules scoped); css-live PASS 0/217, 0/126, portal 0/72 |
| `theia/extensions/tab-uris/src/browser/orca-scheme-coverage.ts` | reverse lookup | VERIFIED | wired at tab-uri-registry.ts:167 |
| modes / chrome-bar edits | Orca mode, D-32 keys | VERIFIED | see truths 1, 7 |
| `powerbrowser/shell/OrcaEnv.sys.mjs`, `OrcaService.sys.mjs` | offer and bundle hand-off, stop order | VERIFIED | internals-boundary and catalogue PASS |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| OrcaService ready line | web-pairing file | `createOutputSink({ onOffer })` -> `_writeHandOff` | WIRED |
| orca-panes backend | bridge files | `POWERBROWSER_ENV.POWERBROWSER_ORCA_BRIDGE_DIR`, 0700/0600 verdicts | WIRED (tabs-live l route, m offer PASS) |
| OrcaPaneObserver | Lumino | `subscribePanes` -> `planPanes` -> `addWidget` | WIRED |
| OrcaPaneWidget close | Orca close | `closePane` -> `createWorkspaceTabCloseCommands().closeItem` | WIRED (tabs-live j close PASS) |
| TabUriRegistry.uriOf | pb-orca: | `orcaPaneUriOf` | WIRED (organising h PASS) |
| tab-group layout | Lumino split | `groupNeighbours` -> `placementFor` | NOT OBSERVED (g2 red) |

### Can each check go red?

| Check | Derives and compares | Self-test / control | Verdict |
|-------|---------------------|---------------------|---------|
| orca-pane-routes | TabContentType AST vs route keys, doc words, bundle API, keys | 13 plants incl. added/removed type | can go red |
| orca-terminal-keys | PAGE_KEYS reserved rows vs passthrough rows and tab bindings, Orca policy literal | 23 plants | can go red |
| orca-terminal-keys-live | in-session control in t<n> and web tab before the hosted terminal | 18 plants | can go red |
| orca-tabs-live | creation clock, neighbour record, tab-chrome selectors derived from Orca source with a detector in Orca's own client | 38 plants; absences judged after a detector | can go red (it is red at g2) |
| orca-pane-entry | React marker vs a two-copy control, tracked status, inlined assets, forbidden imports | self-test PASS | can go red |
| orca-pane-css / -live | built sheet vs Theia CSS; both planted controls must register | self-tests PASS | can go red |
| orca-pane-standalone-live | mount errors through `onCaughtError` (planted throwing child) | self-test PASS | can go red |
| verify-uri-roundtrip pb-orca | uriOf equals input, one widget per factory | self-test not run here (it launched the app; timed out at 60 s) | from 64-06 SUMMARY: 27/27 |
| gui04-registry-shape | exports and members derived and compared | self-test PASS | can go red |
| gui07-mode-switch-tabs-live | modes derived from shipped descriptors | self-test (launches the app) | not run here |
| placement logic (planPanes/placementFor/group branch) | none | none | **no static coverage** |

### Behavioral Spot-Checks (run by this verifier)

All of these were run with `scripts/verify-platform.sh --only <label>` inside `nix develop .#theia`, and every one passed: orca-pane-routes(+self-test), orca-terminal-keys(+self-test), orca-terminal-keys-live-self-test, orca-tabs-live-self-test, orca-pane-entry-self-test, orca-pane-standalone-live-self-test, orca-pane-css-self-test, orca-pane-css-live-self-test, gui04-registry-shape(+self-test), gui07-mode-toggle-commands(+self-test), gui07-mode-switch-tabs-invariant, orca-service(+self-test), orca-overlay(+self-test), orca-bridge-dir, internals-boundary, internals-catalogue, scan-brand-residue. Run directly: diff-theia-core PASS, orca-pane-entry PASS, orca-pane-css PASS.

### Live rows (coordinator raw output, .mozbuild/p64-06)

orca-pane-css-live PASS; orca-pane-standalone-live PASS; orca-tabs-live FAIL (tab-groups only; 14 other stages PASS, 0 prompts); orca-terminal-keys-live PASS; verify-uri-roundtrip pb-orca 4/4; gui07-mode-switch-tabs-live PASS; orca-service-live PASS. `.mozbuild/p64-06-live-reds.txt`: `red: orca-tabs-live`.

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| TAB-01 | SATISFIED | truth 1 |
| TAB-02 | SATISFIED | truth 5 |
| TAB-04 | BLOCKED (partial) | truth 2, tab-group clause |
| TAB-06 | SATISFIED | truth 3 |
| TERM-01 | SATISFIED | truth 6 |
| TERM-04 | SATISFIED | truth 7 |

No orphaned requirement: REQUIREMENTS.md maps exactly these six to Phase 64.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase files) | - | no TBD/FIXME/XXX | - | - |
| docs/URI-SCHEMES.md | 209 | "Every Orca terminal, local or not" while remote terminals are v2 (D-31) | Info | outdated wording |
| verify-orca-pane-routes.mjs | - | checks an observer branch per hosted target, not a `PaneBody` mount branch per hosted kind | Info | an unmounted new hosted kind would be caught only live (PaneBody throws) |

### Gaps Summary

One gap, with one root cause. The TAB-04 / SC2 clause "Orca's tab groups appear as Lumino splits" has never been observed, and nothing exercises it except the red g2 stage. The code places a pane that first appears in another group as a split. It does not re-place a tab Orca later moves into a new group, and that is how the pinned client makes a group split. The g2 observation also suggests the second client's group split did not reach PB's store at all: two strips there, one group in PB. So the recorded cause ("a drag the check does not drive") is not established. Find out whether group layout crosses clients at this pin before a re-run, and add a fixture test for the group placement branch. Everything else in the phase goal is delivered and checked: the six other criteria, D-32 keys, the hand-off and stop order, no new seam, no Theia core edit, no tracked orca/ edit.

---

_Verified: 2026-11-11T01:41:10Z_
_Verifier: Claude (gsd-verifier)_
