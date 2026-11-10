---
phase: 63-theia-terminals-and-agent-hooks-for-orca
plan: 03
subsystem: orca-agents (Theia extension) and Orca agent-status checks
status: complete
tags: [TERM-02, EXT-02, orca, claude, hooks, lane]
requires:
  - "Built orca/ (orca/out/orcad/orcad.js, orca/out/cli/index.js) for orca-agent-hooks"
  - "Lane p63-06 bridge folder (orcad-data-root, OrcaService.getState().bridgeDir) for orca-agent-status-live"
provides:
  - "@powerbrowser/orca-agents: claude wrapper, launcher writer, claudeCode.claudeProcessWrapper default"
  - "orca-agent-hooks (full) and orca-agent-hooks-self-test (quick)"
  - "orca-agent-status-live (full) and orca-agent-status-live-self-test (quick)"
affects: [63-04]
tech-stack:
  added: []
  patterns:
    - "Entry guard on realpath(process.argv[1]) so a check module imports without side effects"
    - "Static clauses parsed with theia/node_modules/typescript, planted on fixture source copies"
key-files:
  created:
    - theia/extensions/orca-agents/package.json
    - theia/extensions/orca-agents/tsconfig.json
    - theia/extensions/orca-agents/bin/claude-wrapper.mjs
    - theia/extensions/orca-agents/src/common/orca-agents-protocol.ts
    - theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts
    - theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts
    - theia/extensions/orca-agents/src/browser/orca-agents-frontend-module.ts
    - scripts/verify-orca-agent-hooks.mjs
    - scripts/verify-orca-agent-status-live.mjs
  modified:
    - scripts/verify-platform.sh
decisions:
  - "The wrapper's placeholder pane command stays cat (A4): stage B read working, permission and idle back on a cat pane"
  - "A headless terminal create returns paneKey in its result (A6); show/list is a fallback only"
  - "orca-agent-status-live drives waiting with one AskUserQuestion answered by one Enter, because an idle Claude session emits no event Orca maps to waiting"
  - "The quit stage runs with the agent alive; terminal close is only for a run that aborted before the quit"
  - "Wrapper log lines carry only the wrapper's own reason or an error code, never an error message from the CLI"
metrics:
  duration: "12 min (this session; Task 1 files were started by an earlier agent at about 09:22)"
  completed: 2026-11-10
actuals:
  tokens: 25500
  tasks: 3
  commits: 3
plan_head_before: 5f8d641747a457cb99d5dfa21a78d8e25aee3bef
plan_head_after: 5f7fad91fcd57c7f1a96f0583850b171a527d625
---

# Phase 63 Plan 03: agent hooks and the EXT-02 Claude wrapper Summary

The @powerbrowser/orca-agents package delivers the EXT-02 wrapper. A 0700 per-profile launcher runs bin/claude-wrapper.mjs on PowerBrowser's Node. The wrapper reads orcad-data-root from the bridge folder, creates an Orca pane through Orca's own CLI, removes inherited ORCA_* names and gives claude the pane identity and the hook endpoint. The frontend registers the launcher as the default of claudeCode.claudeProcessWrapper. A hermetic orca-agent-hooks run proves Orca's managed hook script moves panes through working, waiting and done on Orca's own terminal engine.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 wrapper, launcher, stage B, full row | 6ce9f17a | orca-agents package.json, tsconfig.json, protocol, launcher, bin/claude-wrapper.mjs; verify-orca-agent-hooks.mjs; verify-platform.sh |
| 2 relay, PTY environment, degrade, static clauses, preference default, self-test, quick row | db627c81 | orca-agents-backend-module.ts, orca-agents-frontend-module.ts, claude-wrapper.mjs; verify-orca-agent-hooks.mjs; verify-platform.sh |
| 3 orca-agent-status-live, self-test, rows | 5f7fad91 | verify-orca-agent-status-live.mjs; verify-platform.sh |

## Check results (lane)

- `tsc -b` in theia/extensions/orca-agents inside `nix develop .#theia`: exit 0. lib/node and lib/browser modules built.
- Hermetic PASS line (run with every inherited ORCA_* unset):
  `orca-agent-hooks: PASS -- stage B (wrapper): the launcher as the backend writes it ran the wrapper with a stub claude; a "Claude Code" pane read back UserPromptSubmit->working, PermissionRequest->permission, Stop->idle; the stub got the pane identity and endpoint and not ORCA_PLANT_63 (present in the wrapper's own environment); stdout was the stub's marker only; the pane closed and the exit code 7 passed through; stage A (PTY environment): the CLI-created pane's process carries the 6 derived hook names and the pane identity, not ORCA_CLAUDE_AGENT_STATUS_SETTINGS; stage A (relay): Orca's managed hook script moved the pane through UserPromptSubmit->working, PermissionRequest->permission, Stop->idle in order; degrade stage: without orcad-data-root the stub ran and exited 7, one log line, no pane; static clauses: green`
- `orca-agent-hooks --self-test`: PASS, 21 planted faults plus 3 controls (24 lines starting "  ok ").
- `orca-agent-status-live --self-test`: PASS, 13 planted faults plus 2 controls (15 lines starting "  ok ").
- TERM-02 live outcome in the lane: `orca-agent-status-live: SKIP -- no built PowerBrowser (.../p63-03/objdir/dist/bin/powerbrowser missing; see docs/BUILD.md "Firefox half")`, exit 0, as planned. The real-agent proof is the coordinator's (63-04). No Claude prompt was spent in this lane.
- `verify-platform.sh --only` for orca-agent-hooks, orca-agent-hooks-self-test, orca-agent-status-live-self-test and orca-agent-status-live: each PASS (the last is its SKIP).
- Task 1 acceptance: launcher quoting with a single quote and a space in the path survives; `--nope` exits 2; the claudeEnv/parseWrapperArgs/exitCodeFor one-liner exits 0; theia/package.json, theia/applications/browser/package.json and theia/yarn.lock untouched.
- Importing scripts/verify-orca-agent-hooks.mjs prints nothing and exposes readAgentStatus and deriveClaudeHookEvents.
- Lane diff against the merge base lists only files_modified paths (the SUMMARY is the last one).

## Findings the plan asked for

- **Placeholder command (A4):** `cat`. On a cat pane in stage B, the hook statuses read back and were not cleared by status inference.
- **Pane key source (A6):** the `terminal create` result itself carries paneKey on a headless orcad ("came from create"). The show/list fallback stays in the wrapper. No BLOCKER.
- **Session id (P63-16):** no terminal.agentStatus read-back carried the synthetic session id the hook payloads sent. A resume id has to come from Claude's side (the session file name or `claude agents --json`). orca-agent-status-live records the newest session file name as a note.
- **Status names:** terminal.agentStatus reports the hook state waiting as `permission` and done as `idle` (derived from mapExplicitAgentStateToRuntimeTerminalStatus, not hand-kept).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrapper log could carry CLI output**
- **Found during:** Task 2
- **Issue:** a failed step logged `e.message`. For an execFileSync failure that message includes the CLI's stderr, and the interface forbids a CLI output line in claude-wrapper.log.
- **Fix:** the wrapper marks its own errors (`refuse`). `logReason` logs those messages, and otherwise only an error code, `exit <status>` or an error name.
- **Files modified:** theia/extensions/orca-agents/bin/claude-wrapper.mjs
- **Commit:** db627c81

**2. [Rule 1 - Bug] The live row's idle hold cannot produce waiting**
- **Found during:** Task 3
- **Issue:** the plan holds the session idle for up to 90 s and then requires waiting. claude-events.ts maps only PermissionRequest, Elicitation and an AskUserQuestion PreToolUse to waiting. Claude's idle Notification maps to nothing, so on a correct system the row would always be red "waiting required but absent".
- **Fix:** when the derivation names a waiting event, the one prompt asks claude to ask one AskUserQuestion question and then reply with a marker word. The check answers with a single Enter through `orca terminal send --text '\r'`, which is an answer, not a prompt. That is one prompt and at most two model turns. If waiting never shows, the 90 s hold after working remains, and the row is still red "waiting required but absent".
- **Files modified:** scripts/verify-orca-agent-status-live.mjs
- **Commit:** 5f7fad91

**3. [Rule 1 - Bug] Closing the terminal before the quit would make "survived quit" vacuous for the agent**
- **Found during:** Task 3
- **Issue:** the plan's teardown closes the agent's terminal before app.quit(), but the quit stage must show that the live agent ends on quit (D-07).
- **Fix:** the quit runs with the agent alive. `terminal close` runs only in the finally path of a run that aborted before the quit, and then SIGKILL goes to recorded identities with equal start ticks.
- **Commit:** 5f7fad91

### Other notes

- Task 1 files were started by an earlier agent in this worktree, which was stopped on a permission prompt. No process was writing to them (they were last modified at 09:28, and the stopped process had only MCP children). They matched the amended plan and were kept. The only Task 1 addition was the full registry row.
- Registry blocks sit directly after the anchors on this branch, because p63-06's blocks are not on it.
- orca-agent-hooks-self-test loads theia/node_modules/typescript for the static clauses, as verify-telemetry.mjs already does for tsc.
- The full `verify-platform.sh --quick` was not run. Only this lane's rows were run with `--only`. The residual-brand scan is red until the coordinator adds the rows listed below.

## Coordinator proof commands

1. Merge the lane. Wire orca-agents: add one `build:extensions` entry after orca-terminals in theia/package.json, and one dependency line `"@powerbrowser/orca-agents": "0.1.0"` in theia/applications/browser/package.json.
2. Audited install and build per docs/BUILD.md "Theia half" inside `nix develop .#theia` (yarn install --ignore-scripts --frozen-lockfile, the drivelist rebuild, yarn build).
3. With inherited ORCA_* unset, under the live lock:
   - `flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-agent-hooks`
   - `flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-agent-status-live` (its last line must start `orca-agent-status-live: PASS -- ` for TERM-02)

## Deferred to the end-of-milestone pass (D-18)

- The Claude Code extension's own claude through the launcher, with the session visible in Orca. This depends on EXT-01: research assumption A3 (the argv shape the extension passes to claudeProcessWrapper) and A5 (whether the registerOverride default reaches the extension's contributed property).
- Spike 006 "Blocked on EXT-01" steps 1 to 4.
- A Windows launcher. claude-wrapper is POSIX sh; a .cmd twin is a Phase 68 item. P63-30 covers only the bridge transport.
- A first live run of orca-agent-status-live's AskUserQuestion-and-Enter path (deviation 2). It is untested on a real claude because the lane has no objdir.

## Merge note for the coordinator

- Registry blocks go fourth, the last of the lanes, at both anchors: the quick block (orca-agent-hooks-self-test, orca-agent-status-live-self-test) after p63-06's block following "orca-service-live-self-test|...", and the full block (orca-agent-hooks, orca-agent-status-live) after "orca-service-live|...", before 63-04's.
- orca-agents wiring: one build:extensions entry after orca-terminals and one browser-app dependency line (above).
- Brand rows (inventory/brand-tokens.json, not edited here). Unclaimed "orca"-probe occurrences per file, from `scan-brand-residue.mjs --report` after staging this lane's files:
  - scripts/verify-orca-agent-hooks.mjs: 205
  - scripts/verify-orca-agent-status-live.mjs: 90
  - theia/extensions/orca-agents/bin/claude-wrapper.mjs: 31
  - theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts: 13
  - theia/extensions/orca-agents/src/common/orca-agents-protocol.ts: 10
  - theia/extensions/orca-agents/src/browser/orca-agents-frontend-module.ts: 9
  - theia/extensions/orca-agents/package.json: 3
  - theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts: 2
  - theia/extensions/orca-agents/tsconfig.json: 0
  - Held-back row counts move through scripts/verify-platform.sh: "Orca" 497 to 500 (+3), "orca" 1050 to 1066 (+16), "ORCA" 189 to 190 (+1), "orcad" 684 to 685 (+1). Recount after the merge, because p63-06 also adds rows to this file.
- No WINDOWS.md ids.

## Known Stubs

None.

## Self-Check: PASSED

All nine created files and scripts/verify-platform.sh exist. Commits 6ce9f17a, db627c81 and 5f7fad91 are on ServerDestroyer/p63-03.
