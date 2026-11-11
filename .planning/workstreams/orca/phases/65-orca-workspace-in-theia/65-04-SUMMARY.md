---
phase: 65-orca-workspace-in-theia
plan: 04
subsystem: orca-panes restore, route table, offer containment checks
status: complete
tags: [TAB-08, TAB-05, TAB-04, orca-panes, setups, pb-orca, offer-scan, lane]
requires: [Phase 64 merged at 26f72bff (C64-1..C64-5, C64-7 present)]
provides:
  - OrcaPaneNameMap (powerbrowser.orca.paneNames) with tombstones and launch prune
  - OrcaPaneRestoreOpenHandler (canHandle 1001, named pb-orca URIs, page singletons)
  - planPanes restore hold (held, hydrated) and name-map seeding (namesByKey, reservedNames)
  - ORCA_PAGE_ROUTES / PAGE_WORDS; editor, diff, conflict-review -> theia-editor
  - SetupsService.referencedTabUris() and referencedTabUrisOf
  - scripts/lib/orca-offer-scan.mjs (the shared scanner Phase 67 extends)
  - orca-offer-scan, orca-relaunch-restore-live (+ self-tests); orca-pane-routes clauses (h), (i); orca-tabs-live stages g, g2, g3, k
affects: [65-05 coordinator merge, Phase 66, Phase 67 RUN-07]
tech-stack:
  added: []
  patterns: [restore hold until a list holds the worktree or a 15 s bound; detector-first verdicts; in-memory transpile of the planner for pure fixtures]
key-files:
  created:
    - theia/extensions/orca-panes/src/browser/restore/orca-pane-name-map.ts
    - scripts/lib/orca-offer-scan.mjs
    - scripts/verify-orca-offer-scan.mjs
    - scripts/verify-orca-relaunch-restore-live.mjs
  modified:
    - theia/extensions/orca-panes/src/browser/orca-pane-routes.ts
    - theia/extensions/orca-panes/src/browser/orca-pane-observer.ts
    - theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts
    - theia/extensions/orca-panes/package.json
    - theia/extensions/modes/src/browser/setups-service.ts
    - docs/URI-SCHEMES.md
    - scripts/verify-orca-pane-routes.mjs
    - scripts/lib/orca-tabs-live.mjs
    - scripts/verify-orca-tabs-live.mjs
    - scripts/verify-platform.sh
decisions:
  - "Reload renumbering cause confirmed live: the first subscribePanes list after a frontend reload is empty (bundle booted, store not hydrated), planPanes disposed every restored key and the next list re-minted names in record order"
  - "ORCA_RESTORE_HOLD_MS = 15000, counted from the first pane list; at the bound the newest list is re-applied once"
  - "Tombstones follow the same hold rule; the launch prune drops a tombstone only when no Setup and no session snapshot names it"
  - "ORCA_PAGE_ROUTES landed in Task 1 because the restore opener needs PAGE_WORDS"
metrics:
  duration: about 3 h
  completed: 2026-11-11
estimate:
  tokens: 260000
  tasks: 3
actuals:
  tokens: 31477
  tasks: 3
  commits: 3
plan_head_before: 29e2021ef4d87ffc43c8111d0eefd8f7640b3673
plan_head_after: c03c24d66b71371e21c6fe067aba379ca9635196
---

# Phase 65 Plan 04: pb-orca name map, restore opener, reload hold, route table and offer containment Summary

pb-orca: names now persist per profile with tombstones and come back under the same name for the same Orca pane after a frontend reload or a relaunch. The defect behind the reload renumbering is fixed and checked live. The route table hands editor, diff and conflict-review tabs to Theia. A shared offer scanner and the relaunch row are written, self-tested and registered for the merged tree.

`commits: 3` counts the three task commits (29e2021e..c03c24d6). This SUMMARY is a fourth, docs-only commit on top of them.

## Setup

- C64 contract (step 0): C64-1..C64-5 and C64-7 were all present at 29e2021e. Every path, export, constant and row label in the C64 block was found. There is no BLOCKER.
- Path substitution: none. Every planned Phase 64 path exists under its planned name.
- `nix develop .#theia --command node scripts/generate.mjs` passed (72 files). `bash scripts/fetch-orca.sh` cloned v1.4.248 (965978bc). The audited Theia install (`yarn install --ignore-scripts --frozen-lockfile`, then the drivelist rebuild) ran next, followed by builds of branding, token-gate, tab-uris, modes and orca-panes. token-gate has to be built before tab-uris; the plan's list leaves it out. For the live probe, this lane's browser app was also built (`theia build --mode development`, ignored output).

## Confirmed renumbering cause (Task 1)

The side finding's mechanism is confirmed live. It is the empty first list. Method: a scratch probe (`scratchpad/reload-probe.mjs`, not tracked) ran under the live lock with ORCA_* unset, against the integration worktree's built PowerBrowser, orcad and pane bundle, on a stub agent. It created two CLI terminals, split the first, reloaded the frontend, and sampled `FrontendApplicationStateService.state`, the bundle's `state()` and the WidgetManager's orca-pane widgets every 50 ms.

| Build | initialized_layout | booted, first list | 0.8-0.9 s later | name -> pane after reload |
|-------|--------------------|--------------------|-----------------|---------------------------|
| base (Phase 64 observer) | widgets term3,term2,term1 restored | `booted: true, panes: 0`, widgets **none** (all disposed) | `panes: 3`, widgets re-created term1..3 | **term2 and term3 swapped panes** |
| this lane (PB_BACKEND_MAIN = lane build) | term3,term2,term1 restored | `booted: true, panes: 0`, widgets **term3,term2,term1 kept** | `panes: 3`, same widgets adopted | every name on its old pane |

The bundle boots with `unifiedTabsByWorktree` still empty. `subscribePanes` calls its listener immediately with `[]`. Phase 64's `planPanes` disposed every restored key missing from that list, and the observer cleared `restored`. The next list then created every pane again with names minted in record order. After a split, the leaves of tab A come before tab B, so the old term3 (A's second leaf) became term2. The fix sits in the two planned files. `planPanes` holds a restored key (`held`) until a list holds its worktree or `hydrated` is true. The observer recomputes its restored set from the WidgetManager at every list and sets `hydrated` after `ORCA_RESTORE_HOLD_MS` (15000 ms).

## Tasks and commits

| Task | Commit | Files |
|------|--------|-------|
| 1 tracer: name map, restore hold, tombstones, restore opener, Setups reader, worktree guard | 453a881c | restore/orca-pane-name-map.ts (new), orca-pane-routes.ts, orca-pane-observer.ts, orca-panes-frontend-module.ts, orca-panes/package.json, modes/setups-service.ts |
| 2 route table, observer branch, URI doc, clauses (c)+(h)+(i), orca-tabs-live g/g2/g3/k | 07be39a6 | orca-pane-routes.ts, orca-pane-observer.ts, docs/URI-SCHEMES.md, verify-orca-pane-routes.mjs, lib/orca-tabs-live.mjs, verify-orca-tabs-live.mjs |
| 3 offer scanner, orca-offer-scan, orca-relaunch-restore-live, registry rows | c03c24d6 | lib/orca-offer-scan.mjs, verify-orca-offer-scan.mjs, verify-orca-relaunch-restore-live.mjs (all new), verify-platform.sh |

## Check results

- Task 1 verify: both `planPanes` one-liners passed. The first gave stored name chat3 kept and mint chat2, skipping reserved chat1. The second covered the hold: an empty list gives `held` 2 and `dispose` 0; another worktree's list also holds; the list holding the worktree adopts term2/term3 by key; `hydrated` with an empty list disposes 2. `gui04-registry-shape: PASS`, `orca-pane-routes-self-test: PASS`.
- `orca-pane-routes: PASS -- 8 TabContentType members ... targets hosted-pane, theia-editor, pending, each with an observer branch; words term, chat, sim, checks equal the doc's; page words tasks, activity, automations, space, skills, artifacts, mobile, creating equal the doc's page table; placement 7/7; worktree guard 1/1; ...`
- `orca-pane-routes self-test: PASS -- 24 planted faults each went red naming the drift`. The new plants are: page word missing from the doc, extra doc page word, theia-editor with no observer branch, `placement case 1..7` (one plant each), and `without a worktreeId guard`.
- **Placement fixtures (clause h):** 7/7 green on the tree. Each of the seven plants goes red naming its own `placement case <n>`, so all seven case names appear.
- `orca-tabs-live self-test: PASS -- 53 planted faults each went red naming the drift`. It includes `conflict-review: merge editor not opened`, `conflict-review: hosted widget appeared`, `tab-groups: no Split Chat Right button in the hosted chat`, `tab-groups-cross-client: live group propagation`, `the pre-reload absence proves nothing` and `reload: pb-orca:term2 now addresses another pane`.
- **Stage k:** the extended `reloadVerdict` is self-tested: identity swap, key missing from the store, and a widget moved to another tab bar. The defect it guards is shown fixed live by the probe above (identity kept across a reload with a split). The full orca-tabs-live row was not run here.
- **Stages g2, g3:** pure verdicts are self-tested (`splitChatVerdict`, `crossClientVerdict`). The live drive was not run in the lane. It needs the real claude, the second client and the merged tree (p65-02's merge editor for stage g). This is a coordinator proof.
- `orca-offer-scan self-test: PASS -- 19 planted faults each went red naming the sink`. It includes `collector blind`, `zero sinks read`, `needle form not derivable` and the no-needle-in-output control.
- `orca-relaunch-restore-live self-test: PASS -- 13 planted faults each went red naming the clause`.
- Unknown argument exits 2 for both new scripts. Both live rows print a named SKIP in this lane: no built PowerBrowser here, and lane p65-01 is not merged.
- **Relaunch dry run (scratch copy, not tracked):** this ran against the integration builds plus this lane's Theia. The pairing wait and the editor step were stubbed out in the copy only, because p65-01 and p65-02 are not on this base. Results: no-input, dock, modes, chat, terminals, identity, pairing-ui (the detector moved on Orca's own web client page), not-gone and offer-scan PASS. The offer-scan PASS had both origins' markers found and the runtime key absent. **devices FAIL with "2 persisted keyed row(s)"**, which is expected on this base: without p65-01's session-no-ed25519 preset each launch persists a keyed row, and that is exactly the regression this clause guards. `orca file open` opened README. `orca file open-changed --mode diff` and `orca file diff` were both refused by headless orcad: "This Orca server has no app window, so it cannot open files as tabs." See Merge note item 7.
- `scripts/verify-platform.sh --quick` in this lane worktree: every orca-* row PASS (35) except `orca-mobile-skew-self-test`, which fails because `zod` is not installed in the fetched, unbuilt orca/. The other reds are environmental: this lane worktree has no upstream/ checkout (ext-*, crash-*, patches-regenerated, update-*, shell-*, group-channel, ...), plus `scan-brand-residue` (the brand rows, below). No red names a file this lane changed.

## Deviations from Plan

1. **[Rule 3] ORCA_PAGE_ROUTES and PAGE_WORDS landed in Task 1, not Task 2.** Task 1's restore opener resolves page words through them. Task 2 still added the doc's page table and its check.
2. **[Rule 1] The relaunch row's terminal step waits for the restored leaf's visible xterm, then types, and retries once.** The first dry run typed into term1 before its pane had mounted on first show, so the keys were lost. The second dry run passed.
3. **[Rule 1] The pairing-UI positive control runs on Orca's own web client page** (orcad's web-index.html without a fragment, in a PowerBrowser web tab). It does not run on the orca-pane-harness standalone page. WebConnect renders only on Orca's own page; the standalone page mounts the pane bundle and never shows WebConnect. Selectors are derived from WebConnect.tsx's ids.
4. **"Each mode's tabs" is read by activating each mode.** Modes share one main dock (D-15), so the clause activates Orca and then Coding and compares the main-area tab URIs as sets.
5. **"The chat rendered its transcript from the new orcad" is judged as store presence plus Orca's visible composer.** No prompt is sent (D-30 budget), so the chat has no transcript.
6. **The `no-input` clause is the harness's own input log.** It shows the ordering of the script, not a product observation (CLAUDE.md verification rule 1). The plan asks for it, and it is kept as a harness-ordering clause.
7. **The SUMMARY is a separate docs commit**, after Task 3's code commit, so `commits:` could be measured.
8. Phase 64 code observed and left alone: `newChat` in verify-orca-tabs-live.mjs writes `/\s+/g` inside a page template literal, which reaches the page as `/s+/g`. This is outside scope and is not fixed (deferred).

## Known Stubs

None. No stub, skipped test or placeholder was left in the lane's files.

## Owner items for the deferred list

- **CA-07:** each paired launch leaves one used runtime token row in `<profile>/powerbrowser-orca/orca-devices.json`. This goes to Phase 67 with two options: accept it (holder 5 is a same-user 0600 file), or have chrome remove PB-minted rows before spawning orcad. orca-relaunch-restore-live asserts the growth as exactly one, counted by credentialKind, ephemeral and lastSeenAt only.
- **P65-17:** session-only pairing goes through Orca's plain export `setWebDeviceKeySupportForTests`. The alternative is a declared seam.

## Corrections for Phase 67

- RUN-07 extends `scripts/lib/orca-offer-scan.mjs`: append sinks to `SINKS`, or add collectors beside `collectSinks` and `readOriginKeys`. It must not write a second scanner. `needlesFromOffer` already yields P67-10's set: the web-client URL, the raw code, the URL-encoded code and pairing URL, the `orca://pair?` form, the `#pairing=` fragment, the deviceToken, and its percent-encoded, base64 and base64url forms.
- The Theia document URL gains `#<path of powerbrowser.theia-workspace>` (lane p65-02). That internal path belongs in the copyable-surface check.

## Coordinator proof commands

After the merged builds (Theia app, Orca with `--panes-only` and `--standalone`, PowerBrowser), run under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with every ORCA_* unset:

```sh
scripts/verify-platform.sh --only orca-pane-routes
scripts/verify-platform.sh --only orca-tabs-live          # after p65-02 and p65-04 merge
scripts/verify-platform.sh --only orca-offer-scan
scripts/verify-platform.sh --only orca-relaunch-restore-live
scripts/verify-platform.sh --only uri-roundtrip           # p65-03's seven page rows open through this lane's opener
```

## Merge note for the coordinator

1. Registry: this lane's `# NEW (65-04, ...)` blocks are last at both anchors. The quick block (orca-offer-scan-self-test, orca-relaunch-restore-live-self-test) sits before `allowlist-schema`. The full block (orca-offer-scan, orca-relaunch-restore-live) sits before the closing `)`. Order at each anchor: 65-02, 65-03, 65-04.
2. orca-panes-frontend-module.ts: one import line (`bindOrcaRestore`, marked `// NEW (65-04)`) and the block `// NEW (65-04): pb-orca name map and restore (TAB-08, P65-18)` with `bindOrcaRestore(bind);`. Place it after 65-03's block. Phase 64's OrcaPaneOpenHandler is unchanged.
3. orca-tabs-live stage (g) now requires lane p65-02's merge editor for conflict-review. The merge-editor half is a named SKIP only while theia/extensions/orca-workspace is absent, and a FAIL when that directory exists but the built frontend does not name it. Run orca-tabs-live after both p65-02 and p65-04 are merged.
4. Stage (g2) clicks the hosted chat's own Split Chat Right in PowerBrowser's document. Sub-stage (g3) `tab-groups-cross-client` guards that another client's group split does not propagate. When both pass on the merged tree, they are the evidence for TAB-04's pending Phase 64 row under its re-worded clause (P65-37; the coordinator's tracking).
5. Stage (k) now requires name -> pane identity, store presence and unchanged Lumino tab bars across a reload. These close the 64-TAB-GROUPS side finding, fixed by this lane's restore hold.
6. Lane p65-03's seven page rows in verify-uri-roundtrip.mjs, and clause (f) of its orca-side-panel-live, open page tabs through this lane's `OrcaPaneRestoreOpenHandler`. They go green only after p65-03 and p65-04 are both merged. The observer no longer calls `setActiveWorktree` for a page tab (P65-38; clause (i)).
7. Likely first-run adjustment on the merged tree: on this base, headless orcad refused `orca file open-changed --mode diff` (and `orca file diff`) with "This Orca server has no app window". `orca file open` succeeded. If the merged tree, with p65-01's open-file subscription, still refuses the diff, drive the diff through `openPane('diff', ...)` (B-10) in orca-relaunch-restore-live's launch 1.
8. The restore opener outranks Phase 64's handler only for named URIs (1001 against 1000). The empty `pb-orca:` path stays Phase 64's.
9. Brand rows for the new files are the coordinator's. This lane did not edit inventory/brand-tokens.json. `node scripts/scan-brand-residue.mjs --report .mozbuild/p65-04/brand-report.md`, with every lane file staged, lists condition-4 lines per file: verify-orca-relaunch-restore-live.mjs 141, restore/orca-pane-name-map.ts 80, verify-orca-offer-scan.mjs 29, lib/orca-offer-scan.mjs 16, orca-panes-frontend-module.ts 2, setups-service.ts 2. The held-back coincidental rows observed against expected are: "Orca" 1626/1591 (+35), "orca" 3648/3582 (+66), "ORCA" 697/682 (+15).
10. No WINDOWS.md ids. No STATE.md, ROADMAP.md, REQUIREMENTS.md or ledger edits.

## Threat Flags

None beyond the plan's register. The scanner keeps offers in memory, and its output (sink names, form names, origins, counts) is checked to hold no needle. The device-row reader keeps only credentialKind, ephemeral and lastSeenAt.

## Self-Check: PASSED

- Files exist: restore/orca-pane-name-map.ts, lib/orca-offer-scan.mjs, verify-orca-offer-scan.mjs, verify-orca-relaunch-restore-live.mjs.
- Commits 453a881c, 07be39a6 and c03c24d6 are ancestors of HEAD.
- Lane diff against 29e2021e: 14 files, all in files_modified.
