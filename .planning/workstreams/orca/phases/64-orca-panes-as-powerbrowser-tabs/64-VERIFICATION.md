---
phase: 64-orca-panes-as-powerbrowser-tabs
verified: 2026-11-18T04:51:11Z
status: human_needed
score: 11/11 must-haves verified
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
  - "powerbrowser/shell/OrcaService.sys.mjs"
  - "scripts/lib/orca-tabs-live.mjs"
  - "scripts/verify-orca-pane-entry.mjs"
  - "scripts/verify-orca-pane-groups.mjs"
  - "scripts/verify-orca-pane-routes.mjs"
  - "scripts/verify-orca-tabs-live.mjs"
  - "scripts/verify-orca-terminal-keys-live.mjs"
  - "scripts/verify-orca-terminal-keys.mjs"
  - "scripts/verify-uri-roundtrip.mjs"
  - "theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts"
  - "theia/extensions/modes/src/browser/mode-descriptors.ts"
  - "theia/extensions/modes/src/browser/mode-service.ts"
  - "theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts"
  - "theia/extensions/orca-panes/src/browser/orca-pane-observer.ts"
  - "theia/extensions/orca-panes/src/browser/orca-pane-routes.ts"
  - "theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx"
  - "theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts"
  - "theia/extensions/orca-panes/src/common/orca-panes-protocol.ts"
  - "theia/extensions/tab-uris/src/browser/orca-scheme-coverage.ts"
  - "theia/extensions/tab-uris/src/browser/tab-uri-registry.ts"
covered_digest: "v4:sha256:c803467bac7be383699422a68b8bb29c4ccd56b7b1cfa542247b317c27e1a64b"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 9/10
  gaps_closed:
    - "SC2 / TAB-04: Orca tab groups held in PowerBrowser's hosted client appear as Lumino splits at a pane's first appearance (TAB-04 re-worded per 64-TAB-GROUPS.md / P65-37; g2 and g3 green; orca-pane-groups fixture check added; D-49, WINDOWS 55 fixed)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Refresh the Claude sign-in (run claude once), then scripts/verify-platform.sh --only orca-tabs-live on the current head (WINDOWS 69)"
    expected: "orca-tabs-live: PASS with all 16 stages, including tab-groups and tab-groups-cross-client"
    why_human: "Gate run 4 at 080814fd did not exercise this row: the harness refused because the Claude sign-in was 38 min from expiry. The last real green is a single run at 2026-11-17 16:09 -0800, after 7d730b00, on product code identical to HEAD. Refreshing the sign-in needs the owner"
  - test: "With a Theia editor focused, let an agent or the Orca CLI create a terminal and open a chat in the background; then click each new tab"
    expected: "Typing stays in the editor until the tab is clicked. After the click the terminal or chat takes keys. In the terminal, Ctrl+W and Ctrl+T reach the shell, and Ctrl+Tab and Ctrl+PageUp/PageDown switch tabs"
    why_human: "The debug record .planning/debug/orca-first-show-focus-and-paste-choice.md is status awaiting_human_verify. D-57 records that Orca's settings and tasks pages were not checked. The live legs cover terminals, and chats only statically"
  - test: "EXT-02 wrapper: start a Claude Code extension session on an Orca worktree"
    expected: "Its terminal appears as a hosted pb-orca:term<n> tab showing Orca's TerminalPane (SC6 creator list; P64-36 look)"
    why_human: "Needs the Claude extension and the owner's sign-in. Phase 63 SC3 runs it with EXT-01 in the end-of-milestone pass"
  - test: "Close a chat tab while its agent is busy"
    expected: "Orca's own running-agent confirmation appears, and the tab stays until the user confirms"
    why_human: "orca-tabs-live notes 'busy-chat close not exercised: no prompt keeps a chat busy' (prompt budget 1)"
  - test: "Owner review of the 64-06 key items: Ctrl+V and Ctrl+C-with-selection stay Orca's in hosted terminals; Ctrl+Shift+W from a focused web page goes to the page; the two quick-pick placeholder strings; P64-37; Ctrl+[ / Ctrl+] released (proven statically only)"
    expected: "Owner accepts each item or files a ruling"
    why_human: "Owner decisions. orca-terminal-keys prints them as 'owner item' notes, and no check can decide them"
---

# Phase 64: Orca panes as PowerBrowser tabs Verification Report

**Phase Goal:** The Orca mode shows Orca's work as PowerBrowser tabs. Each Orca pane is one Lumino tab that moves between modes and can be organised like any Theia or browser tab.
**Verified:** 2026-11-18T04:51:11Z
**Status:** human_needed
**Re-verification:** Yes. The previous report was gaps_found 9/10, and its one gap was TAB-04, orca-tabs-live stage g2/g3, WINDOWS 55.

Method: the code was read at HEAD f826f3df. Product code at f826f3df is identical to 080814fd and 7d730b00: the later commits change only docs and checks (`git diff --stat 7d730b00 080814fd` lists one debug record and three check scripts, and 080814fd..f826f3df touches only `.planning`). This verifier ran the static rows one at a time with `scripts/verify-platform.sh --only <label>`. Live evidence comes from gate run 4 at 080814fd (log grepped, not re-run) and from the coordinator's raw orca-tabs-live logs dated 2026-11-17. This verifier ran no live row, build or gate.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 / TAB-01: an "Orca" mode appears beside Coding in `SHIPPED_MODES` and the chrome bar, and selecting it shows Orca's work | VERIFIED | `gui07-mode-toggle-commands` PASS here ("4 shipped modes agree ... IDE dress is [coding, orca]"). Gate run 4 `gui07-mode-switch-tabs-live` PASS: derived modes [coding, browsing, organising, orca], Orca seeds chat1 and term2, and 4 main-area tabs survived 14 switches |
| 2 | SC2 / TAB-04 (re-worded): each pane is its own tab and Organising row, can be split and moved to any mode and back; in-tab splits and tab groups held in PB's client appear as Lumino splits at first appearance (PB-made at once, other-client after PB's client adopts orcad's layout); later regrouping not mirrored; Orca tab bar/groups not rendered | VERIFIED | One pane = one tab: `planPanes` dedupes by key (`seen`, orca-pane-routes.ts:165-168), and the observer creates one widget per key through `getOrCreateWidget` (orca-pane-observer.ts:238). Group placement: `groupNeighbours` (pb-pane-mount.tsx:795-818) → `placementFor` (orca-pane-routes.ts:91-99) → `addWidget(..., {mode, ref})` (observer:243). New fixture check `orca-pane-groups` PASS here (4 two-group layouts) with a self-test of 6 plants. Live: orca-tabs-live PASS with all 16 stages, including tab-groups and tab-groups-cross-client (coordinator log at 2026-11-17 16:09 -0800, after 7d730b00, rc=0; also at 14:34). D-49: g3 was fixed in the check by 2ce581f2 and 3ad91d13, with four runs green. **Gate run 4 at 080814fd did not exercise this row** (harness refusal: sign-in 38 min from expiry; WINDOWS 69). |
| 3 | SC3 / TAB-06: chat and every other Orca-only view of the Phase 61 inventory opens as its own tab | VERIFIED | `ORCA_PANE_ROUTES`: agent-session, simulator and check-details are `hosted-pane`. conflict-review is `theia-editor` (P65-01, TAB-05), so it opens as its own Theia merge-editor tab (`orca-editor-routes` PASS here). Gate run 4 `orca-pane-standalone-live`: "mounts PASS -- terminal, agent-session, simulator", and check-details mounted in both routes. orca-tabs-live chat and other-views stages were green in the 2026-11-17 run |
| 4 | SC4: a check derives Orca's tab content types from the pinned source and set-compares with PB's mapping | VERIFIED | `orca-pane-routes` PASS here ("8 TabContentType members ... equal ORCA_PANE_ROUTES' keys"), and its self-test reports 24 plants red |
| 5 | SC5 / TAB-02: `pb-orca:` documented, round-trips, registry shape unchanged | VERIFIED | `gui04-registry-shape` PASS here, with self-test (4 plants). Gate run 4 `verify-uri-roundtrip`: `pb-orca:` before any hosted tab, term1, with term1 open, term99, and seven page words all PASS |
| 6 | SC6 / TERM-01: every Orca terminal is a PB tab showing Orca's own `TerminalPane` on Orca's engine, accepts input, shows output; in-tab splits as Lumino splits; Theia terminals plain | VERIFIED | `HostedPaneBody` still mounts Orca's own `TerminalPane` (pb-pane-mount.tsx:925-936, `isolatedPaneKey`), `NativeChatView` (944-953) and `EmulatorPane` (957). Today's change only replaced `isActive` with the pane's activity. Terminals are created only through `callRuntimeResult('terminal.create')` (1007-1009). `orca-pane-entry` PASS here: no client-side terminal creation, no tab bar or TabGroupPanel import, C3 exports exact. Gate run 4: standalone-live "isolated per-leaf mount PASS"; keys-live stage 2 shows the shell keys reaching the hosted PTY |
| 7 | SC7 / TERM-04 (D-32): Ctrl+W/T to the shell in hosted and Theia terminals, switch keys switch from every tab, Orca window shortcuts off in hosted terminals, Ctrl+Shift+W closes; measured live in one session; derive-and-compare check | VERIFIED | `orca-terminal-keys` PASS here (derived from PAGE_KEYS reserved rows; terminal-first half and Linux preset compared), with a self-test of 44 plants. Gate run 4 at 080814fd, on the activity-gated bundle: `orca-terminal-keys-live` PASS. Control in t<n> and the web tab; "stage 2: PASS -- the shell keys reached the hosted terminal's PTY with nothing switched; the switch keys switched the tab and reached no PTY; the close key requested Orca's close"; stage 3 equal to the control. Focus-gate leg: `click {tab:true, focused:true, reached:true}` and `command {focused:true, reached:true}` |
| 8 | No new seam beyond the overlay's own, no Theia core edit, no tracked orca/ edit | VERIFIED | `orca-overlay` PASS here: 3 seams (browser-provider, claude-stream-json, orcad-entry-build) and 9 overlay files. The 2026-11-17 fixes are all in the overlay file pb-pane-mount.tsx and in orca-panes. `diff-theia-core` PASS here ("zero changes inside @theia/*") |
| 9 | OrcaService hand-off files written 0600 after ready and removed before orcad is signalled | VERIFIED | Gate run 4 `orca-service` PASS ("J (hand-off files) ... stop order"), with a self-test of 44 plants |
| 10 | Mirror freeze fixed: a CLI terminal still becomes a tab after PB-side activation | VERIFIED | `staleNavigationEchoes` is unchanged (pb-pane-mount.tsx:452-471). Gate run 4 standalone-live "late CLI terminal PASS -- a tab in 1 ms" |
| 11 | The 2026-11-17 changes keep the pane contract: the services root runs Orca's full app-shell and session-persistence call lists, with only the selection-paste, large-paste and unload-veto behaviour scoped to pane roots (D-54, D-55, D-56). A hosted pane takes focus only while its tab is Theia's active widget (D-57) | VERIFIED | `useHostedAppShellServices` (pb-pane-mount.tsx:337-365) calls the same 21 hooks as Orca's `useAppShellServices` (orca/src/renderer/src/app-shell/use-app-shell-services.ts:35-55), in the same order; this verifier compared the two lists by hand. `orca-pane-entry` PASS here reports "23 app-shell call(s) and 7 selection listener type(s) equal to Orca's; 13 session-persistence call(s) equal to Orca's less its unload veto". `OrcaPaneWidget.activity` is `shell.activeWidget === this` (orca-pane-widget.tsx:63-69), passed as `TerminalPane.isActive` and `NativeChatView.isFocusedGroup`; `orca-terminal-keys` statically requires this wiring. Gate run 4 keys-live: background and restore legs keep typing in the editor (`text:"abcxyz"`, `pty:""`), and stage 2 shows Theia's large pastes and selection paste stayed Theia's |

**Score:** 11/11 truths verified (0 present, behavior-unverified)

### Does the activity gate cost hosted terminals their keys?

No. Orca's `useTerminalKeyboardShortcuts` installs its window-level key handlers only while `isActive` (orca/src/renderer/src/components/terminal-pane/terminal-keyboard-hook.ts:47). A hosted terminal therefore runs Orca's key handling, including the terminal-first policy that lets Ctrl+W and Ctrl+T through to the shell, only while its tab is Theia's active widget. A click or command inside the pane makes Theia activate that widget. Gate run 4 measured this path: click and command legs reached the PTY, and stage 2's shell keys reached the PTY. Before 7d730b00 every mounted terminal installed those handlers whether or not it was active. Under the gate, a background terminal also hides Orca's error toast and save-failure dialog until its tab is activated (TerminalPaneSurface.tsx:209,240). Orca's inactive groups behave the same way.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx` | bundle API, Orca's own pane components, mirror-freeze fix, D-32 in-memory policy, scoped hooks | VERIFIED | 1229 lines; C3 exports exact (orca-pane-entry PASS) |
| `theia/extensions/orca-panes/` | widget, observer, routes, bundle loader, key rows | VERIFIED | Widget passes its activity, and the bundle passes the remembered paste choice (7d730b00) |
| `orca-overlay/files/vite.pb-panes.config.ts` | Orca's Vite build on host React | VERIFIED | `modulePreload: false` (41229f23, WINDOWS 61); orca-pane-entry reads the built bundle: React 19.2.8/19.2.8, 0 React markers in pb-panes/ |
| `scripts/verify-orca-pane-groups.mjs` | fixture test of the group branch (previous gap's "missing" item) | VERIFIED | PASS, self-test 6 plants |
| `scripts/verify-orca-tabs-live.mjs` | g3 reload of the second client, dropped-pane filter | VERIFIED | self-test PASS here (57 plants) |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| OrcaPaneObserver | Lumino | `subscribePanes` → `planPanes` → `addWidget` | WIRED |
| tab-group layout | Lumino split | `groupNeighbours` → `placementFor` → `addWidget(mode, ref)` | WIRED (orca-pane-groups PASS; tabs-live g2/g3 green 2026-11-17) |
| OrcaPaneWidget.activity | TerminalPane.isActive / NativeChatView.isFocusedGroup | `mountPane(host, pick, this.activity)` → `useSyncExternalStore` | WIRED (orca-terminal-keys static; keys-live 2d) |
| OrcaPaneWidget close | Orca close | `closePane` → `createWorkspaceTabCloseCommands().closeItem` | WIRED (keys-live: "the close key requested Orca's close") |
| TabUriRegistry.uriOf | pb-orca: | `orcaPaneUriOf` | WIRED (uri-roundtrip, registry-shape) |
| OrcaPaneBundle | profile | `powerbrowser.orca.primarySelectionPaste` → `bootstrap({rememberedPrimarySelectionPaste})` | WIRED (orca-terminal-keys clause g) |

### Behavioral Spot-Checks (run by this verifier, one at a time, `scripts/verify-platform.sh --only <label>`)

| Row | Result |
|-----|--------|
| orca-pane-entry, orca-pane-entry-self-test | PASS, PASS |
| orca-pane-groups, orca-pane-groups-self-test | PASS, PASS (6 plants) |
| orca-pane-routes, orca-pane-routes-self-test | PASS, PASS (24 plants) |
| orca-terminal-keys, orca-terminal-keys-self-test | PASS, PASS (44 plants) |
| orca-terminal-keys-live-self-test | PASS (58 plants) |
| orca-tabs-live-self-test | PASS (57 plants) |
| orca-editor-routes | PASS |
| gui04-registry-shape, gui04-registry-shape-self-test | PASS, PASS |
| gui07-mode-toggle-commands | PASS |
| orca-overlay | PASS |
| diff-theia-core | PASS |

All 16 rows returned rc=0.

### Live rows (not run here)

| Row | Source | Result |
|-----|--------|--------|
| orca-terminal-keys-live | gate run 4 at 080814fd | PASS (control, stage 2, focus gate, stage 3 equal) |
| orca-pane-standalone-live | gate run 4 | PASS |
| orca-pane-css-live | gate run 4 | PASS (Theia 0/217, pane 0/126, portal 0/72) |
| gui07-mode-switch-tabs-live | gate run 4 | PASS |
| verify-uri-roundtrip pb-orca | gate run 4 | PASS (4 rows + 7 page words) |
| orca-tabs-live | gate run 4 | **not exercised**: "FAIL -- harness: ... the Claude sign-in expires in 38 min". This is not a product red (WINDOWS 69) |
| orca-tabs-live | coordinator log at 2026-11-17 16:09 -0800, after 7d730b00 | PASS, 16/16 stages, rc=0 |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| TAB-01 | SATISFIED | truth 1 |
| TAB-02 | SATISFIED | truth 5 |
| TAB-04 | SATISFIED | truth 2 (re-worded clause; last live green 2026-11-17, not at this head's gate) |
| TAB-06 | SATISFIED | truth 3 |
| TERM-01 | SATISFIED | truths 6, 11 |
| TERM-04 | SATISFIED | truths 7, 11 |

Decisions: D-15 (one pane = one tab, splits and groups flattened at first appearance) holds by truth 2. D-31 (Orca's own engine and `TerminalPane`, created only by `terminal.create`) holds by truth 6. D-32 holds by truth 7. D-34 holds: `addBrowserPage` carries `browserPageId`, and the observer resolves browser records through the page table and creates no second widget (orca-pane-observer.ts:253-265); its live proof belongs to Phase 66. No orphaned requirement: REQUIREMENTS.md maps exactly these six to Phase 64.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| phase files | - | no TBD/FIXME/XXX/TODO/HACK | - | - |
| docs/URI-SCHEMES.md | 226 | "Every Orca terminal, local or not" while remote terminals are v2 (D-31) | Info | outdated wording, carried from the previous report |
| pb-pane-mount.tsx | 241-319 | `usePanePrimarySelectionPaste` re-implements Orca's hook body in the overlay; clause l compares call lists and listener types, not the body | Info | a re-pin that changes Orca's hook logic is seen only by the live paste legs |
| pb-pane-mount.tsx | 957 | `EmulatorPane ... isActive` is still hard-wired true | Info | the simulator pane is outside the D-57 focus gate; D-57 names only terminals and chats |
| gate run 4 keys-live | - | focus-gate `command.editorText` probe threw (`getModel() is null`) while `focused`/`reached` were true | Info | that probe value is unscored; the leg's verdict rests on focus and PTY bytes |

### Human Verification Required

1. **orca-tabs-live at this head.** Refresh the Claude sign-in, then run `--only orca-tabs-live`; expect 16/16 PASS. Gate run 4 did not exercise this row.
2. **First-show focus.** With a background-created terminal and chat, typing should stay in the editor until a tab is clicked, and D-32 keys should work after the click. The debug record is awaiting_human_verify.
3. **EXT-02 wrapper terminal shown as a hosted tab.** Deferred to the end-of-milestone pass with EXT-01.
4. **Busy-chat close.** Orca's running-agent confirmation should appear.
5. **Owner key items from 64-06.** Ctrl+V and Ctrl+C with a selection, Ctrl+Shift+W in a web page, quick-pick placeholders, P64-37, and Ctrl+[ / Ctrl+].

### Gaps Summary

No gaps. The TAB-04 gap of the previous report is closed. TAB-04 was re-worded so that the group clause covers groups PB's client holds at a pane's first appearance, and it no longer claims to mirror later regrouping. The orca-pane-groups fixture check now covers the group branch, and both group stages (g2, g3) were green live on 2026-11-17 after the check fix of D-49. The 2026-11-17 pane-mount changes keep every Phase 64 truth. Each hosted pane still mounts Orca's own `TerminalPane`, `NativeChatView` or `EmulatorPane`, and the services root runs Orca's full hook list with three behaviours scoped to pane roots. Keys reach hosted terminals per D-32 once the tab is active: gate run 4 measured this at 080814fd. The one-pane-one-tab rule is unchanged. The status is human_needed and not passed for two reasons: the head's gate did not exercise orca-tabs-live, and owner-only checks remain.

---

_Verified: 2026-11-18T04:51:11Z_
_Verifier: Claude (gsd-verifier)_
