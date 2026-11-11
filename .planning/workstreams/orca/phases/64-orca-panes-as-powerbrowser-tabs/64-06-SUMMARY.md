---
phase: 64-orca-panes-as-powerbrowser-tabs
plan: 06
subsystem: orca-panes-gap-closure
status: complete
tags: [orca, terminal-keys, D-32, P64-37, real-agent, orcaservice, gap-closure]
requires:
  - "64-05 (lanes merged, panes wired; b775f938) and D-32 (fd0a4b3a)"
provides:
  - "D-32 terminal keys: shell keys to the shell, switch keys and Ctrl+Shift+W PowerBrowser's, Orca's terminal-first policy in hosted terminals (C10', C13)"
  - "P64-37 worktree quick pick for New Orca Terminal and New Orca Chat (C3', C9')"
  - "orca-tabs-live on the real claude and the pre-installed SDK extension, one-prompt budget"
  - "OrcaService removes orcad-data-root, web-pairing and orca-panes-dir before signalling orcad"
affects: [65, 66, 67]
tech-stack:
  added: []
  patterns:
    - "an Orca behaviour PowerBrowser needs only in its hosted document is set with useAppStore.setState plus a re-applying subscribe, never through Orca's settings or keybinding write actions"
key-files:
  created:
    - .planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-06-SUMMARY.md
  modified:
    - orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx
    - theia/extensions/orca-panes/src/common/orca-panes-protocol.ts
    - theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts
    - theia/extensions/orca-panes/src/browser/orca-pane-observer.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts
    - scripts/verify-orca-terminal-keys.mjs
    - scripts/verify-orca-terminal-keys-live.mjs
    - scripts/lib/orca-tabs-live.mjs
    - scripts/lib/orca-pane-harness.mjs
    - scripts/verify-orca-tabs-live.mjs
    - scripts/verify-orca-pane-css-live.mjs
    - powerbrowser/shell/OrcaService.sys.mjs
    - scripts/verify-orca-service.mjs
    - scripts/verify-platform.sh
    - inventory/brand-tokens.json
    - .planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-CONTEXT.md
    - .planning/workstreams/orca/ROADMAP.md
    - .planning/workstreams/orca/REQUIREMENTS.md
    - .planning/workstreams/orca/STATE.md
decisions:
  - "D-32 implemented as written; hosted Orca terminals run Orca's own 'terminal-first' policy in memory only"
  - "Ctrl+[ and Ctrl+] (Orca's split-pane focus actions) released in memory in hosted terminals; Ctrl+V and Ctrl+C-with-selection stay Orca's (its xterm bypass policy hard-codes them), recorded as owner items"
  - "P64-37: the worktree quick pick in Orca's empty-query order, first preselected"
  - "TERM-01, TERM-04 and TAB-06 complete on recorded PASS lines; TAB-04 stays pending on orca-tabs-live stage g2"
metrics:
  duration: "about 45 min"
  completed: 2026-11-11
actuals:
  tokens: 49400
  tasks: 3
  commits: 6
plan_head_before: fd0a4b3a4fae23c2f3962fba0326152bebf3a28a
plan_head_after: see the docs(64-06) SUMMARY commit
---

# Phase 64 Plan 06: D-32 terminal keys, worktree pick, real-agent chat stages, stop order Summary

Hosted Orca terminals now give Ctrl+W and Ctrl+T to the shell, run Orca's own 'terminal-first' shortcut policy set in PowerBrowser's document only, and leave Ctrl+Tab, Ctrl+PageUp/PageDown and Ctrl+Shift+W to PowerBrowser's tab commands; New Orca Terminal/Chat ask for a worktree through a quick pick in Orca's recency order; orca-tabs-live runs on the real claude with the pre-installed SDK extension and spent no prompt; OrcaService removes all three bridge files before it signals orcad. TERM-01, TERM-04 and TAB-06 are complete; TAB-04 stays pending on stage g2.

`commits: 6` is `git rev-list --count fd0a4b3a..HEAD` after the docs(64-06) commit: five code/brand commits measured at SUMMARY time plus the SUMMARY/tracking commit.

## Commits

| Task | Commit | What |
|------|--------|------|
| 1 | f0f2b99c | fix(64-06): D-32 terminal keys, terminal-first in hosted Orca terminals, tab-switch and close keys from Theia focus |
| 2 | d4665636 | fix(64-06): worktree pick for the Orca commands (P64-37); orca-tabs-live on the real claude and the pre-installed SDK |
| 3 | 8657ce0e | fix(64-06): OrcaService removes orcad-data-root first on stop |
| 3 | 610c82fe | fix(64-06): orca-pane-css-live selects Orca's worktree before the Orca commands (P64-37) |
| 3 | 63da170c | chore(64-06): Orca-family brand rows re-measured over the 64-06 tree |
| 3 | docs(64-06) | live proofs, requirement outcomes and tracking recorded (this SUMMARY) |

## Task 1: D-32 (C10', C13)

- **Orca side, no seam.** `pb-pane-mount.tsx` gains `hostedTerminalKeys()`, called from `bootstrap()` right after `staleNavigationEchoes()` and before the services root. It sets `settings.terminalShortcutPolicy = 'terminal-first'` with `useAppStore.setState` and re-applies it from a `useAppStore.subscribe` whenever a settings object arrives with another value. Verified before writing: Orca's host writes carry explicit updates only (`persistSettingsUpdates` → `window.api.settings.set(normalizedUpdates)`; `setWorktreeCardMode` sends `updates.settings`; `setActiveRuntimeEnvironmentPreference` sends one id), so a `setState` of `settings` never reaches orcad. The same function sets empty bindings for `terminal.focusPreviousPane` (Ctrl+[) and `terminal.focusNextPane` (Ctrl+]) in the store's `keybindings` object; Orca writes keybindings only through `window.api.keybindings.setAction` per action, so this too stays in memory.
- `ORCA_TERMINAL_PASSTHROUGH_KEYS` is `['ctrl+w', 'ctrl+t']`.
- `chrome-bar-keybindings.ts`: `ctrl+pagedown` → `CommonCommands.NEXT_TAB.id`, `ctrl+pageup` → `CommonCommands.PREVIOUS_TAB.id`, `ctrl+shift+w` → `CommonCommands.CLOSE_TAB.id`, literal ctrl, no when clause.
- `verify-orca-terminal-keys.mjs` rewritten around the derivation (shell keys = reserved letter rows, switch keys = reserved keycode rows, close key = closeTab + shift, twins from PAGE_SHORTCUTS' action bodies), collisions over `theia/extensions/*/src`, `@theia/*/lib/browser` and plugin manifests, and the Orca half (policy literal vs TerminalShortcutPolicy and normalizeTerminalShortcutPolicy's fallback, TUI_CONFLICT_ACTIONS, Linux default bindings, every `matches('id')`/`keybindingMatchesAction('id', ...)` literal under `components/terminal-pane`, the released actions, and the chords Orca's xterm bypass policy hard-codes). 23 plants, the 10 the plan names plus 3 for the released control chords and the no-write rule.
- `verify-orca-terminal-keys-live.mjs` judges D-32 in t<n>, the web tab and the hosted terminal; 18 plants including the six the plan names. Stage 2 types a ready marker until cat -v echoes it before the first separator (fix for the first live run's `separators around ctrl+t are missing from orcad's terminal read`: the first separator landed on the shell's command line before the probe command ran).
- `verify-platform.sh`: only the comments above the two rows.

### Orca terminal shortcuts still active in hosted terminals (owner review)

Printed by the check (`orca-terminal-keys: note -- ...`), derived from the pinned source:

`terminal.paste ctrl+v/ctrl+shift+v/shift+insert, terminal.copySelection ctrl+shift+c/ctrl+c, terminal.expandPane ctrl+shift+enter` (released in memory: terminal.focusPreviousPane Ctrl+[, terminal.focusNextPane Ctrl+]).

- **Released:** Ctrl+[ (Escape; vim) and Ctrl+] — Orca's split-pane focus actions, active under terminal-first, and acting only when the tab has two or more panes. Released with empty bindings in the hosted store; the static check goes red if either comes back (plant "Ctrl+[ no longer released by the entry").
- **Owner item, Ctrl+V** — `terminal.paste` (Orca's paste; `terminal-pane-paste-listeners.ts`). Releasing the binding is not enough: `xterm-bypass-policy.ts:285-289` hard-codes Ctrl+V as a clipboard chord that xterm never encodes, so without a seam the shell can never receive ^V (bash quoted-insert, vim visual block).
- **Owner item, Ctrl+C with a selection** — `terminal.copySelection` (copy instead of interrupt while text is selected). Without a selection Ctrl+C reaches the shell as ^C. `xterm-bypass-policy.ts:282` hard-codes the selection case.
- Ctrl+Shift+C, Ctrl+Shift+V, Shift+Insert and Ctrl+Shift+Enter send no control character and stay Orca's.

## Task 2: P64-37 and the real agent (C3', C9', D-30)

- `state().worktrees` is the C3' list from Orca's own `orderEmptyQueryWorktrees` (`activeWorktreeId: null`, the store's `lastVisitedAtByWorktreeId`), mapped to `{ id, label, path }`. `OrcaPaneBundleApi` declares `state()`.
- `OrcaPaneCommands.create`: with no active worktree, `QuickInputService.showQuickPick` (label = name, description = path, `activeItem` = first, placeholders "Choose the Orca worktree for the new terminal" / "Choose the Orca worktree for the new chat"); accepting calls `setActiveWorktree` then creates. `OrcaPaneObserver.worktreeIds` deleted.
- `orca-pane-harness.mjs`: the standalone wait reads `state().worktrees.length`.
- `withOrcaTabsSession({ agent: 'stub' | 'real' })`, default stub; with 'real', no stub dir, `claude --version` must name Claude Code, and orcad's `/proc/<pid>/environ` is read for the SDK variable's presence and its package.json, never printed.
- `verify-orca-tabs-live.mjs` runs `agent: 'real'`; stage a judges the pick (precondition, rows in Orca's order, first focused, add ≤ 1000 ms after Enter); second-client chats go through Orca's own "Configure Claude" → "Launch chat" panel after the agent rows settle (fix for live lines `chat: second client: Orca offers no chat row; its New tab menu reads ["Claude","claude-agent-team","Agent  etting …"]` and, once, the menu still reading "Loading agents"); g2 takes the chat Orca's "Split Chat Right" opens as the second group's tab; at most one fixed prompt; a g2 observation note on failure. 38 self-test plants. Other `withOrcaTabsSession` callers untouched (still stub).

## Task 3: stop order, builds, live batch

- `_stopTree`: `ORCAD_DATA_ROOT_FILE` joins the first-removal loop; the later block is gone. orca-service scenario J: every bridge-file removal during stop precedes orcad's `killProcess`; new plant "bridge files removed after orcad is signalled" red naming `orcad-data-root at stop call ...`; the two not-removed plants re-anchored. `orca-service self-test: PASS -- 35 planted faults each went red naming the drift`. internals-boundary and internals-catalogue PASS.
- css-live fix (610c82fe): `orca-pane-css-live: FAIL -- harness: timed out after 30000 ms waiting for the hosted terminal widget` — its real-widget setup relied on the removed pane-list fallback; it now selects Orca's first worktree through `setActiveWorktree` before the commands.
- The standalone variant needed `build-orca-panes.sh --standalone` (first batch: `orca-pane-standalone-live: FAIL -- harness: timed out after 45000 ms waiting for the store to list the throwaway worktree`, the old bundle's numeric `worktrees`).

## Builds

All with every inherited ORCA_* unset.
- Theia: `yarn build` twice (after Task 1 and Task 2), `[build/browser] Finished with 0 errors`, `theia/yarn.lock` unchanged.
- Orca: `build-orca.sh --panes-only` twice (`build-orca: PASS -- panes only in 10s` / `in 6s`), then `build-orca-panes.sh --standalone` (`build-orca-panes: PASS -- 893 files, entry 350 bytes, css 3102110 bytes, standalone 893 files`). Orca's web typecheck (`run-typecheck-projects-in-parallel.mjs --project=config/tsconfig.tc.web.json`) exit 0 after each entry change.
- PowerBrowser: `./mach build faster` exit 0; the packaged OrcaService.sys.mjs equals the tree's copy (`cmp`).

## Live lines (final batch, under pb-live.lock, ORCA_* unset, MOZ_PURGE_CACHES=1)

CSS first:
- `orca-pane-css-live: PASS -- real-widget mode; Theia 0 of 217 and pane 0 of 126 values changed with both controls registered; portal probe 0 of 72; Orca's <html> writes (1 class(es), 2 custom propert(y/ies)) read by no Theia rule`

Then:
- `orca-pane-standalone-live: PASS -- isolated per-leaf mount, 5 hosted type(s) mounted, late CLI terminal in 2 ms`
- orca-tabs-live: `terminal-user: PASS`, `terminal-cli: PASS`, `terminal-agent: PASS`, `freeze-guard: PASS`, `split: PASS`, `pb-split: PASS`, `chat: PASS`, `other-views: PASS`, `tab-groups: FAIL -- tab-groups: tab-group split not observed (no store record of the second group's tab with a first-group neighbour in the recorded direction)`, `organising: PASS`, `no-tab-chrome: PASS`, `close: PASS`, `reload: PASS`, `route: PASS`, `offer: PASS`; `note -- prompts sent: 0 (budget 1)`; `orca-tabs-live: FAIL -- tab-groups`
- orca-terminal-keys-live: `control: PASS -- in t<n> the shell keys reached the shell, the switch keys switched with no PTY bytes and the close key closed the tab; in the web tab the switch keys switched`; `note -- the close key in the hosted terminal opened Orca's running-terminal confirmation`; `stage 2: PASS -- the shell keys reached the hosted terminal's PTY with nothing switched; the switch keys switched the tab and reached no PTY; the close key requested Orca's close`; `stage 3: equal to the control`; `orca-terminal-keys-live: PASS -- D-32 control in t<n> and the web tab; stage 2 PASS; the t<n> and web tab effects equal the in-session control`
- verify-uri-roundtrip --scheme pb-orca: `4/4 rows PASS`
- `verify-mode-switch-tabs-live: PASS -- 4 main-area and 2 bottom-area tab(s) survived every second-visit mode switch, attached`
- `orca-service-live: PASS -- 19 environment names equal the expected set (planted ORCA_PLANT_62 absent), ...; quit ended a tree of 5 processes including an agent session; ...`

`.mozbuild/p64-06-live-reds.txt` holds `red: orca-tabs-live` (stage g2).

Why g2 is red: the g2 observation note shows Orca's own web client's "Split Chat Right" opened a new chat in the same tab group (every neighbour of the new chat's store record is `tab-after`). In the pinned client a tab-group split comes from a tab drop on a group edge (`splitGroup` layout message with the drop direction, tab-group drop handling), which the check does not drive. Recorded, not fixed by a seam.

## Requirement outcomes

TERM-04: PASS (orca-terminal-keys, orca-terminal-keys-live)
TERM-01: PASS (orca-tabs-live stages a-e: terminal-user, terminal-cli, terminal-agent, freeze-guard, split)
TAB-04: PENDING (orca-tabs-live stage (g2) tab-groups: Orca's own web client's "Split Chat Right" opened a chat in the same tab group, so no tab-group split was observed; stages a-e2, h-k and gui07-mode-switch-tabs-live PASS)
TAB-06: PASS (orca-pane-standalone-live, orca-tabs-live stages f chat and g other-views)

## Quick and guards

- `orca-terminal-keys: PASS -- shell keys ctrl+t, ctrl+w; switch keys ctrl+tab, ctrl+shift+tab, ctrl+pagedown, ctrl+pageup; close key ctrl+shift+w; derived from PAGE_KEYS reserved rows; orca-panes rows compared; switch and close bindings, twins and collisions compared; Orca terminal-first half compared`
- `orca-terminal-keys self-test: PASS -- 23 planted faults each went red naming the drift`; `orca-terminal-keys-live self-test: PASS -- 18 ...`; `orca-tabs-live self-test: PASS -- 38 ...`
- verify-shortcut-relay, verify-chrome-bar-commands, orca-pane-routes (+ self-test 13 plants), orca-pane-standalone-live self-test, orca-pane-css-live self-test, verify-uri-roundtrip self-test (27/27): PASS.
- `scan-brand-residue: PASS -- no residual brand occurrence in 768 scanned file(s)`; `--self-test PASS`.
- `nix develop .#theia --command scripts/verify-platform.sh --quick` with every change staged: `verify-platform: PASS -- all checks passed`, exit 0, 376 rows PASS (64-05: 375).

## Brand rows changed

Measured with the scanner's own exports over its scope on the staged tree, the rows widened to every scope file as 64-05 did; no exclude entry; one reason sentence naming plan 64-06 per row.

| Row | Old | New | Files added |
|-----|-----|-----|-------------|
| Orca (title) | 1499 | 1591 | none |
| orca (lower) | 3511 | 3582 | none |
| ORCA (upper) | 670 | 682 | none |
| orcad (lower) | 1169 | 1184 | scripts/verify-orca-terminal-keys.mjs |
| ORCAD (upper) | 185 | 190 | none |
| withOrca (literal) | 19 | 21 | none |

## Bridge folders before and after

Before the final batch, 55 bridge files sat in pb-orca-*-bridge folders under /run/user/1000 (53 orcad-data-root, 1 web-pairing, 1 orca-panes-dir), all from runs before this plan's chrome rebuild. After the batch: the same 55 entries; no folder outside the before-set holds any of the three files. The aborted first batch (four rows on the rebuilt chrome) also added none. The 55 leftovers were not removed (not this plan's files; their orcads are gone).

## Tracking

- REQUIREMENTS.md: TERM-01, TERM-04, TAB-06 ticked with traceability "Complete" (by scoped edit: `requirements mark-complete ... --ws orca` reported all three `not_found` although it found TAB-01 as already complete); TAB-04 traceability set to the g2 pending note.
- ROADMAP.md: criterion 7 restated to D-32; Plans 6/6; Wave 3 (gap closure) lists 64-06; `roadmap update-plan-progress 64 --ws orca` run after this SUMMARY.
- 64-CONTEXT.md: P64-37 under "Amendments after D-31", the line "P64-33 amended by D-32 (64-06)", and a P64-37 row in "Owner decisions open".
- STATE.md: D-32/P64-37 decision line, the 64-06 outcome line, the phase table, and the Phase 64 Deferred Verification row (owner decisions marked answered; owner-review items added).
- No state.advance-plan, no phase complete, nothing pushed.

## Owner-review notes (end-of-milestone pass)

- The residual Orca chords listed above; Ctrl+V and Ctrl+C-with-selection as owner items (a seam would be needed to give them to the shell).
- Ctrl+Shift+W from a focused web page goes to the page (no PAGE_KEYS row added; D-32 is about terminals).
- The two quick-pick placeholder strings (P64-37 adds them; P64-26 allowed only the two command labels).
- P64-37 itself; override: the first worktree in Orca's order with no prompt.
- "Orca's window shortcuts" read in Orca's vocabulary (the plan's interpretation).

## Deferred

- TAB-04 stage g2: drive a real Orca tab-group split (tab drop on a group edge) in the second client.
- Busy-chat close: not exercised (no prompt keeps a chat busy).
- Ctrl+[/Ctrl+] release is proven statically only; in a single-pane hosted terminal Orca's focus action already does nothing, so a live probe would not discriminate.

## Deviations from Plan

- [Rule 1] 610c82fe edits `scripts/verify-orca-pane-css-live.mjs`, outside files_modified: this plan's C9' removed the pane-list fallback its setup relied on (failing line quoted above).
- [Rule 1] keys-live stage 2 gained a readiness wait (failing line quoted in Task 1).
- [Rule 1] tabs-live's second-client chat lookup and g2 split handling adapted to the pinned client's agent picker and "Split Chat Right" (failing lines quoted in Task 2).
- [Rule 2, user instruction] Ctrl+[ and Ctrl+] released in memory, with static clauses and plants.
- [Rule 3] `build-orca-panes.sh --standalone` rerun: the standalone variant is not rebuilt by `--panes-only`.
- [Rule 3] `requirements mark-complete` found none of the three ids; ticked by scoped edit.
- Acceptance "git -C orca status --porcelain prints nothing" does not hold, as at the plan's start: the build's overlay state (3 staged seams from orca-overlay/seams.json, the copied overlay files) is in orca/; no tracked orca/ file was edited by this plan, and `git diff --name-only b775f938 -- orca-overlay/seams.json orca-overlay/patches` prints nothing.
- An unlocked `node scripts/verify-mode-switch-tabs-live.mjs --self-test` started a live PowerBrowser during Task 2's checks; it was stopped by PID (its self-test launches the app; it ran later in the locked batch as gui07-mode-switch-tabs-live). Its scratch profile /tmp/pb-ng-c-profile-OiI0uP was left (a hook blocked deleting outside the project).

## Threat Flags

None beyond the plan's register: T-64-23 (in-memory policy, no write action, statically checked), T-64-24 (no prompt spent; SDK presence only), T-64-27 (stop order, plant, bridge comparison).

## Self-Check: PASSED

- Commits f0f2b99c, d4665636, 8657ce0e, 610c82fe and 63da170c are ancestors of HEAD.
- The Requirement outcomes section holds four lines; the one red row (orca-tabs-live) is named on the TAB-04 PENDING line.
- REQUIREMENTS.md ticks exactly the PASS requirements; TAB-04 is unchecked with a Pending traceability note and in STATE.md's Phase 64 Deferred Verification row; ROADMAP names D-32 and 64-06-PLAN.md; 64-CONTEXT names P64-37.
- `--quick` green (above). No pairing value, offer, token, ready line or SDK path appears in this file.
