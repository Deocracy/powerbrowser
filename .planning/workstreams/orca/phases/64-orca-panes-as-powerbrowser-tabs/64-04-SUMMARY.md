---
phase: 64-orca-panes-as-powerbrowser-tabs
plan: 04
subsystem: verification
tags: [orca, live-checks, term-04, pb-orca, mode-switch, bidi]
status: complete

requires:
  - phase: 63-04 (coordinator merge)
    provides: "orca-agents, the bridge folder, the Orca CLI wrapper at <dataRoot>/cli/bin/orca"
provides:
  - "scripts/lib/orca-tabs-live.mjs: prerequisites() and withOrcaTabsSession, the shared Phase 64 live session; ORCA_PANES_MODULE_KEY and ORCA_PANES_BOOT_EVENT literals for orca-pane-routes (g)"
  - "orca-terminal-keys (quick) and its self-test, ported from p63-02"
  - "orca-terminal-keys-live (full) and its self-test, ported from p63-05"
  - "orca-tabs-live (full) and its self-test"
  - "pb-orca rows in verify-uri-roundtrip.mjs; Orca seeds and the orca-vanish plant in verify-mode-switch-tabs-live.mjs"
affects: [64-05, 66]

actuals:
  tokens: 33400      # chars/4 over the realized diff (133,609 added chars, 7 script files)
  tasks: 3
  commits: 3         # d67fd2c4, a02dbf78, and the Task 3 commit that carries this SUMMARY
plan_head_before: b37ad5b17fe84ae995970b1c0126fdd6dcfedc87
plan_head_after: a02dbf78   # head before this SUMMARY's own commit

tech-stack:
  added: []
  patterns:
    - "Live rows read another lane only through the C1-C12 contracts; a SKIP is named only while that lane's directory is absent"
    - "The unmerged lane is the first prerequisite named, ahead of build artefacts"

key-files:
  created:
    - scripts/lib/orca-tabs-live.mjs
    - scripts/verify-orca-terminal-keys.mjs
    - scripts/verify-orca-terminal-keys-live.mjs
    - scripts/verify-orca-tabs-live.mjs
  modified:
    - scripts/verify-uri-roundtrip.mjs
    - scripts/verify-mode-switch-tabs-live.mjs
    - scripts/verify-platform.sh

decisions:
  - "prerequisites() names 'lane p64-02 not merged' before 'no built PowerBrowser', so the Task 2 verify (run without PB_FIREFOX_BIN) prints the lane SKIP the plan names"
  - "Theia's t<n> terminals open in the bottom area: the TERM-04 tab count covers the main and bottom areas, and the control's recorder is started through TerminalWidget.sendText (fixture setup, not a key under test)"
  - "verify-uri-roundtrip --scheme pb-orca exits 0 with its named SKIP and launches no browser when the rows can only SKIP"
  - "The mode-switch walk imports writeStubAgentDir from scripts/lib/orca-tabs-live.mjs, a relative lib import, only when orca-panes is present (recorded in the file header beside D-69)"

metrics:
  duration: "about 35 minutes"
  completed: 2026-11-10
---

# Phase 64 Plan 04: live proofs and TERM-04 key checks for hosted Orca tabs Summary

The lane wrote the instruments for Phase 64's live proof against the C1-C12 contracts. These are the shared Orca tabs session, orca-tabs-live with 15 stages, the TERM-04 static and live pair ported from the dropped p63 branches, the `pb-orca:` round-trip rows, and Orca seeds in the mode-switch walk. In this lane every live control and verdict is green or SKIP-named, and the coordinator runs the final proof on the merged tree.

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 | d67fd2c4 | feat(64-04): shared Orca tabs live session, orca-terminal-keys and orca-terminal-keys-live ported for hosted terminals |
| 2 | a02dbf78 | feat(64-04): orca-tabs-live for hosted Orca tabs |
| 3 | (this commit) | feat(64-04): pb-orca round-trip rows, Orca seeds in the mode-switch walk, lane summary |

## What was ported, and what was left

Every port below was done by reading the branch with `git show` and writing the code again. Nothing was merged or cherry-picked.

- From `refs/heads/ServerDestroyer/p63-02:scripts/verify-orca-terminal-keys.mjs`, kept:
  - the PAGE_KEYS derivation with TypeScript
  - the both-ways comparison
  - the literal-ctrl clause
  - the passthrough-only `registerKeybinding` clause
  - the plant runner
- New clauses for C10:
  - the constants come from `orca-panes-protocol.ts`
  - the when clause must equal the scoped key exactly
  - the focus key must be created on `createScoped(<widget>.node)` inside a `kind === 'terminal'` branch of `orca-pane-widget.tsx`
  - no orca-panes string may name `terminalFocus`
- Left out, because they belong to the dropped bridge (D-31): the `o<n>` pattern and its single-definition clause, kind `'orca'` on `newTerminal`, the stale-`o<n>` open-handler branch, and the `terminal:` URI doc clause.
- From `refs/heads/ServerDestroyer/p63-05:scripts/verify-orca-terminal-keys-live.mjs`, kept: the in-session control, `keySpecFor`, `visibleFormFor`, `segmentsOf`, the raw-mode `cat -v` probe and the import-silence self-test.
- Left out (D-31): `runTabStage`, the backend-parent chain, the kind `'orca'` restore stage and the `o<n>` name pattern.
- Cross-lane sanity check: I ran `orca-terminal-keys` on a scratch tree holding p64-02's real `orca-panes/src`, extracted with `git archive`. It printed PASS with "orca-panes rows compared". Nothing in this worktree changed.

## In-lane outputs

- `orca-terminal-keys`: PASS. It derived 6 keys from the PAGE_KEYS reserved rows (ctrl+t, ctrl+w, ctrl+tab, ctrl+shift+tab, ctrl+pagedown, ctrl+pageup) and printed "orca-panes rows SKIP -- lane p64-02 not merged".
- `orca-terminal-keys-self-test`: PASS. It has a pre-merge control (derivation only, named SKIP) and a control on a fixture orca-panes tree, and all 11 plants went red naming their drift.
- `orca-terminal-keys-live-self-test`: PASS, with 4 controls and 11 plants.
- `orca-terminal-keys-live` (run under the lock with `ORCA_*` unset, PB_FIREFOX_BIN from the integration objdir, PB_BACKEND_MAIN from this lane's build): exit 0.
  - "control: 6 keys measured in a t<n> terminal and a web tab"
  - "stage 2: SKIP -- lane p64-02 not merged"
  - "stage 3: equal to the control"
  - PASS
- `orca-tabs-live-self-test`: PASS, with 16 controls and 26 plants. Running `orca-tabs-live` with no arguments prints "orca-tabs-live: SKIP -- lane p64-02 not merged (theia/extensions/orca-panes is absent)". `--nope` exits 2.
- `verify-uri-roundtrip.mjs --scheme pb-orca`: "SKIP pb-orca -- lane p64-02 not merged", exit 0. `--help` names pb-orca.
- `gui07-mode-switch-tabs-live-self-test`: PASS. The clean control and all 6 plants went red, including the new "Orca seed vanishes after a hop". In this lane the welcome seed stands in for the Orca seed.
- `verify-mode-switch-tabs-live.mjs`: PASS. It printed "Orca seeds: SKIP -- lane p64-02 not merged", and 1 main-area and 2 bottom-area tabs survived every second-visit switch. The walk derived modes [coding, browsing, organising] only. The Orca hop joins once lane p64-03's `mode-descriptors.ts` row is merged, because the walk derives its modes from that file.
- Lane diff: only the `files_modified` paths. Nothing under theia/, powerbrowser/, orca-overlay/ or tracked orca/ files, and no state files.

## Observations from the control (recorded, not asserted)

- In this build a Theia `t<n>` terminal already passes ctrl+w and ctrl+t to the shell (the recorder saw `^W` and `^T`, and the tab count did not change). ctrl+tab and ctrl+shift+tab switch the active widget, and ctrl+pageup and ctrl+pagedown reach the PTY.
- In a web tab, ctrl+t opens a tab and ctrl+w closes one.
- The live check compares these effects against themselves within the session, as designed. This contradicts the plan's note that "Theia terminals keep PowerBrowser's bindings": for ctrl+w and ctrl+t, Theia's terminal currently gets the key, not PowerBrowser's tab command. See owner items.

## Deviations from Plan

1. [Rule 3 - Blocking] **TERM-04 control harness.** The ported harness looked for `t<n>` in the main area and typed the recorder command key by key. Theia opens terminals in the bottom panel, and `ApplicationShell` has no `getWidget`. The fix:
   - tab counts now cover the main and bottom areas;
   - the session's starting tabs are kept;
   - the recorder starts through `TerminalWidget.sendText`;
   - lookups use `getWidgetById`.

   Found during Task 1. Commit d67fd2c4.
2. [Rule 3 - Blocking] **Prerequisite order.** Task 2's verify runs `orca-tabs-live` without PB_FIREFOX_BIN, and this lane has no objdir, so the first SKIP printed was "no built PowerBrowser". prerequisites() now names the unmerged lane first. A present-but-unwired orca-panes is still a FAIL. Commit a02dbf78.
3. **orca-tabs-live clock.** For CLI-created panes, hosted adds are collected from the CLI's start and the 1 s clock runs from its exit, so a tab added before the CLI returns counts as in time. Commit a02dbf78.
4. **The plan's Task 3 verify assumes an objdir.** It runs `scripts/verify-platform.sh --only gui07-mode-switch-tabs-live-self-test` without PB_FIREFOX_BIN, and this lane has no objdir. I ran it under the lock with PB_FIREFOX_BIN and PB_BACKEND_MAIN set, as Setup step 4 specifies for live runs.

## Owner items (end-of-milestone pass)

- OWNER-REVIEW P64-33: the in-session control replaces P63-25's control, which was taken before the extension loads. The argument is in the header of `scripts/verify-orca-terminal-keys-live.mjs`: outside a hosted terminal the passthrough rows are inert, because their when clause is the scoped key.
- OWNER-REVIEW TERM-04: the control shows Theia `t<n>` terminals already take ctrl+w and ctrl+t (see Observations). Decide whether that is intended, or whether Theia terminals should keep PowerBrowser's tab commands for those two keys.
- "busy-chat close not exercised": the stub agent cannot hold a chat busy, so orca-tabs-live stage (j) records this note for the end-of-milestone pass.
- The `orca-tabs-live` stages that drive Orca's own web client (f second client, g2 tab groups, i detector) find Orca's controls by role, aria-label and text at run time: the pairing field `#web-runtime-pairing-code`, a Connect button, `[aria-label="New tab"]`, a chat menu item, and a context-menu "Split right/down" item. They have never run against a live Orca web client. If the pinned client labels a control differently, the stage fails naming the missing control, and the coordinator adjusts the lookup in this lane's file.

## Coordinator proof commands

Run these on the merged, wired, built tree, after `orca-pane-css-live` is green (P64-15). Run each under the lock with inherited `ORCA_*` unset:

```sh
L="flock /home/chris/coding/Power-Browser/.git/pb-live.lock env $(env | sed -n 's/^\(ORCA_[A-Za-z0-9_]*\)=.*/-u \1/p')"
$L scripts/verify-platform.sh --only orca-tabs-live
$L scripts/verify-platform.sh --only orca-terminal-keys
$L scripts/verify-platform.sh --only orca-terminal-keys-live
$L node scripts/verify-uri-roundtrip.mjs --scheme pb-orca
$L scripts/verify-platform.sh --only gui07-mode-switch-tabs-live
```

Expected on the merged tree:

- orca-tabs-live: the last line is "orca-tabs-live: PASS -- terminal-user, ..., offer".
- orca-terminal-keys: "orca-panes rows compared".
- orca-terminal-keys-live: "stage 2: PASS".
- pb-orca: four PASS rows.
- The mode-switch walk: a note "Orca seeds: orca-pane:chat1, orca-pane:term<n>", and an orca hop among the derived modes.

A SKIP on the merged tree means a prerequisite is missing: an orca build, the pane bundle, or the wiring. It does not count as a pass.

## Merge note for the coordinator

- Merge this lane fourth (after p64-01, p64-02, p64-03), by `refs/heads/ServerDestroyer/p64-04`.
- Registry: two `# NEW (64-04, ...)` blocks.
  - Quick: `orca-terminal-keys`, `orca-terminal-keys-self-test`, `orca-terminal-keys-live-self-test` and `orca-tabs-live-self-test`. They sit right after `orca-agent-status-live-self-test|` (no Phase 68 block was at that anchor in this lane). Order them after the 64-02 block.
  - Full: `orca-terminal-keys-live` and `orca-tabs-live`, right after `orca-agent-status-live|`.
- `orca-pane-routes` (g) reads `ORCA_PANES_MODULE_KEY = 'powerbrowser.orca-panes.module'` and `ORCA_PANES_BOOT_EVENT = 'powerbrowser-orca-panes-module'` as literals of `scripts/lib/orca-tabs-live.mjs`. They match p64-02's loader.
- No WINDOWS.md ids.
- Brand rows needed. I did not edit the inventory; the report is at `.mozbuild/p64-04/brand-report.md` in the lane worktree. With every lane file staged, the scan's condition-4 failures by file and spelling (lower/title/upper) are:
  - `scripts/lib/orca-tabs-live.mjs` 56/27/20
  - `scripts/verify-orca-tabs-live.mjs` 67/39/8
  - `scripts/verify-orca-terminal-keys-live.mjs` 66/13/13
  - `scripts/verify-orca-terminal-keys.mjs` 44/5/29
  - `scripts/verify-uri-roundtrip.mjs` 55/9/4
  - `scripts/verify-mode-switch-tabs-live.mjs` 26/14/8
  - The held-back coincidental rows rise from the registry comments in `scripts/verify-platform.sh`: "Orca" 637 to 641, "orca" 1287 to 1312, "ORCA" 294 to 296.

## Known Stubs

None. Every live stage that cannot run in this lane prints a named SKIP and has a coordinator proof command above.

## Threat Flags

None. The checks add no product surface. The offer is kept in memory, redaction is installed first, the stub agent sits in a scratch directory on the launched PowerBrowser's PATH only, and signals go only to recorded identities.

## Self-Check: PASSED

- All four created files and three modified files exist on the branch.
- d67fd2c4 and a02dbf78 are ancestors of HEAD.
- The quick rows `orca-terminal-keys`, `orca-terminal-keys-self-test`, `orca-terminal-keys-live-self-test` and `orca-tabs-live-self-test` are green.
