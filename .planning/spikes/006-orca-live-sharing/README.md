---
spike: 006
idea: orca-live-sharing
name: orca-live-sharing
type: standard
validates: "Given a Claude agent session started by PowerBrowser's orcad and then stopped, when it is resumed with claude --resume <id>, then the conversation continues in the same session file; and the Claude Code extension's capability to attach to a running external session is recorded from its published package"
verdict: YELLOW
related: [EXT-03, EXT-01, EXT-02, D-06, D-18]
tags: [orca, orcad, claude-code, extension, resume, background-session, attach, live-sharing]
---

# Spike 006: live sharing of an Orca agent session

## What This Validates

Requirement EXT-03 (D-06.3) and ROADMAP Phase 61 criterion 3, as far as a run without the owner
can go (P61-06):

1. **Floor.** An agent that PowerBrowser's own orcad started (Orca v1.4.248 from source, PB's
   Node, loopback, scrubbed environment) and that was then stopped can be resumed with
   `claude --resume <session id>` on this host's Claude CLI login. Pass: the resumed answer
   repeats a nonce marker from the first turn and the same session file grew.
2. **Extension entry points.** What the published `Anthropic.claude-code` 2.1.321 package
   offers for opening an existing session by id, read from source.
3. **Extension attach capability.** Whether that package can attach to a session that another
   program is running, read from source as argument counts.
4. **CLI launch modes (P61-14).** `--bg`, `claude agents`, `claude stop` and `claude attach` as
   the candidate mechanism for a live share, run where no real input, no new model turn and no
   other session is involved.

Not tested here: the extension running on Theia (EXT-01, deferred to the end-of-milestone pass
under D-18), and therefore the extension half of the floor.

## Research

- Orca's Claude agents are ordinary Claude Code sessions stored under `~/.claude/projects`
  (`orca/src/main/ai-vault/session-scanner-roots.ts:10`). Orca resumes one with
  `claude [--effort X] --resume <id>` (`orca/src/shared/agent-resume-argv.ts:16-24`).
- `orca agent launch --surface terminal` runs the agent CLI in a PTY
  (`orca/src/cli/specs/agent-launch.ts`); the floor uses it so the resume is the plain CLI path.
- The lane runs inside the owner's Orca, so its environment carries that Orca's variables and
  this Claude session's own markers. The floor removes both sets (names in
  `results-floor.json` → `removedEnvNames`, 28 names) and keeps `HOME`, so the login is the
  owner's and no CLI call can reach the owner's running Orca.
- Package reading and argument counts: `extension-notes.md`.
- CLI help lines: `results.md`, "CLI help lines the study relies on".

## How to Run

Preparation (61-03-PLAN lane_brief Setup): `node scripts/generate.mjs`, `bash scripts/fetch-orca.sh`,
`nix develop .#orca --command bash scripts/build-orca.sh`, then the Orca CLI:
`ORCA_CLI_BUILD_COMPILER=tsrs node config/scripts/build-cli.mjs` inside `orca/` in the same
shell (never `pnpm run build:cli`, which rewrites `orca/package.json`).

```sh
# Harness only: orcad, repo registration, workspace selection, cleanup. No model turn.
node .planning/spikes/006-orca-live-sharing/floor-run.mjs --dry-run

# The floor. Two model turns on this host's Claude login (one launch prompt, one resume prompt).
node .planning/spikes/006-orca-live-sharing/floor-run.mjs
```

The driver creates its own profile (`.mozbuild/p61-03/powerbrowser-orca`, reached through the
short alias `~/.cache/pb-p61-03-orca`) and its own throwaway repo
(`.mozbuild/p61-03/floor-<nonce>`), and removes the repo afterwards. It leaves the session
directory under `~/.claude/projects` in place and prints its name.

## What to Expect

- Last line `floor-run: PASS -- session <uuid> stopped, resumed with claude --resume, marker echoed, jsonl N -> M lines`, exit 0.
- `results-floor.json` rewritten with `resumeOutputHasMarker: true`, `jsonlLinesAfter` greater
  than `jsonlLinesBefore`, a UUID `sessionId`, and `agentProcessesAfterStop: 0`.
- No orcad or terminal daemon left running from this tree's `orca/out`.

## Results

**YELLOW** (2026-11-09; see VERDICT): the floor is proven on the CLI, the extension's capability is recorded
from source, and two parts are not proven: the extension half of the floor (blocked on EXT-01)
and attach from a second client. Table: `results.md` (8 numbered rows).

### Proven

The floor, on this host, in one run (`results-floor.json`):

| Evidence key | Value |
|---|---|
| `sessionId` | `468b096a-bd9b-4a24-add3-d287c0da03bb` |
| `markerNonce` | `f529c335` |
| `launchOutcomeKind` | `terminal` |
| `agentProcessesBeforeStop` → `agentProcessesAfterStop` | 1 → 0 |
| `jsonlLinesBefore` → `jsonlLinesAfter` | 57 → 86 |
| `resumeExitCode` | 0 |
| `resumeOutputHasMarker` | `true` |
| `sessionIdInTerminalList` | `false` (assumption A7 is false) |
| `claudeSettingsChanged` | `false` |
| `timings` | orcad ready 1.1 s, launch to answer 8.0 s, resume 8.6 s |
| `claudeVersion` | `2.1.321 (Claude Code)` |

Also proven by run (`results.md` rows 5 to 7): the stopped floor session resumed as a background
session with `claude --resume <id> --bg` under the same id, with no prompt and no model turn;
`claude agents --json` listed it (`kind: background`, `status: idle`); `claude stop <job id>`
stopped it and it was no longer listed.

Proven by source reading only (`extension-notes.md`): the extension takes a session id through
three entry points, all of which resume.

### Blocked on EXT-01

The extension half of the floor: a stopped Orca session resumed **inside the extension**. It
needs the extension installed and running on PowerBrowser's Theia, which is the EXT-01 check,
deferred to the end-of-milestone pass (D-18, P60-R5). Steps to run in that session, each against
a session created that day:

1. Create the session: run `node .planning/spikes/006-orca-live-sharing/floor-run.mjs` and take
   `sessionId` from `results-floor.json`; or start an agent in the EXT-01 Orca worktree, stop
   it, and take the id from the newest `.jsonl` name under
   `~/.claude/projects/<worktree path with every non-alphanumeric character replaced by ->/`.
   Open in Theia the directory the session was created in: session files are stored per
   working directory, and resuming from another directory was not tried. `floor-run.mjs`
   deletes its throwaway repo, so for this step either recreate that directory path or use the
   EXT-01 worktree.
2. Terminal entry point: execute the command `claude-vscode.terminal.open` with the arguments
   `(undefined, ["--resume", "<session id>"])`. Pass: a Theia terminal opens running
   `claude --resume <session id>` and shows the earlier turn. Note whether the command line
   arrived through shell integration or through the 3000 ms `sendText` fallback.
3. URI entry point: open `vscode://Anthropic.claude-code/open?session=<session id>` (with the
   scheme Theia registers for plugin URI handlers). Pass: the extension's panel opens on that
   session with the earlier turn visible.
4. Record which of 2 and 3 work on Theia 1.76, and append the result to this record and to
   `60-EXT01-RECORD.md`.

### Live share

- **What the extension source shows.** No attach path. In `extension.js` and
  `webview/index.js` (the only JavaScript in the package) the quoted arguments `"--bg"`,
  `"--background"` and `"attach"` occur 0, 0 and 0 times as CLI arguments, and the phrase
  `claude attach` occurs 0 times; `"--resume"` occurs 3 and 2 times. The extension starts its
  own `claude` process on a stored conversation. It has no client for a process that Orca's PTY
  owns and none for the CLI's background service.
- **What resuming a running session does.** Per `claude --help`, `--resume <id> --bg`
  "continues that session in the background under the same ID, or starts a copy and says so when
  the session is already running". Resuming a session that is still running is therefore a
  copy, not a share. The copy case was not run (it would need a second running session and a
  model turn); the same-id case for a stopped session was run and holds.
- **The `--bg` plus `attach` mechanism.** Proven: a session can be moved into Claude's
  background service under its own id, listed and stopped without a terminal
  (`results.md` rows 5 to 7). Unproven: `claude attach <id>` from one client, and from two
  clients at once, because attach needs an interactive terminal and real input (row 8). If two
  terminals can attach to one background session, an agent launched with `--bg` and attached
  from both an Orca pane and a Theia terminal would be a live share that needs no extension
  support. Orca does not launch agents that way: its terminal surface runs plain `claude` in a
  PTY. Using it would mean a changed launch command (an Orca launch-flag seam or a PB-side
  launcher) and a rule for the eight-character job id. This is a Phase 63 design option, not a
  promise, and it shares the session with a terminal, not with the extension's panel.
- **A discovery channel that does exist.** `claude agents --json` lists interactive sessions as
  well as background ones, with `sessionId`, `cwd`, `kind` and `status`. A PB component can find
  a running Orca agent's session id that way, which Orca's own `terminal list --json` does not
  provide.

### Recommendation for Phase 63 (P61-07)

Build agent sessions as **Theia terminals running the plain `claude` CLI, with `--resume` on
demand**:

- An agent Orca starts runs `claude` in a Theia terminal tab (Phase 63 criteria 1 and 2). When
  it has stopped, any client reopens it with `claude --resume <id>`: a Theia terminal directly,
  or the extension through `claude-vscode.terminal.open` or its `/open` URI once EXT-01 passes.
- The session id comes from Claude's side: the session file name under `~/.claude/projects`
  (used by this spike) or the `sessionId` column of `claude agents --json` (observed in
  `results.md` row 6). It does not come from `orca terminal list`. Claude Code hook payloads
  also carry a session id; whether Orca's `ORCA_AGENT_HOOK_*` relay retains it at this pin was
  not traced and is a Phase 63 research item.
- Do not resume a session that is still running: that produces a copy. "Open in the extension"
  for a running agent is either refused or offered as stop-then-resume.

Note for EXT-02 ("Extension sessions are visible in Orca: PowerBrowser registers a pane per
session and passes the `ORCA_AGENT_HOOK_*` variables"): this spike does not change it. The
extension's settings `claudeCode.environmentVariables` and `claudeCode.claudeProcessWrapper`
are the two places PB can inject the hook variables into the `claude` process the extension
starts; which one works on Theia is an EXT-01-session check. If EXT-01 fails on Theia, EXT-02
reduces to "Claude sessions started in Theia terminals are visible in Orca", which the route
above already delivers, and the extension-pane half needs an owner decision at that point.

## Investigation Trail

- 2026-11-09: lane setup. `scripts/build-orca.sh` built v1.4.248 in 115 s (warm store); the CLI
  was built separately with the two steps from 60-EXT01-RECORD note 3. `git -C orca status`
  stayed clean.
- Dry run 1 (`--dry-run`): orcad, `repo add` and workspace selection worked, cleanup reaped
  everything, but the driver printed no verdict line: the dry run's early `return` skipped the
  final print. Fixed by printing from `finally`. Dry run 2: PASS line printed. Neither dry run
  launched an agent.
- Floor run 1 (the only one): PASS. Session `468b096a-…`, marker echoed on resume, jsonl
  57 → 86. No rerun was needed, so the login was spent on exactly one exchange.
- The plan's Task 1 verify command re-executes `floor-run.mjs`, which would be a second
  exchange. It was not re-executed; the PASS line was checked from the captured output of
  run 1 and the JSON assertions were run against `results-floor.json`.
- Package: sha256 matched; three files extracted outside the repo; counts taken with
  `grep -oF` (the host's `grep` is ugrep, whose regex engine refused `.{0,N}` context patterns
  on the minified files, so fragments were cut with `python3 -I`).
- Background study, attempt 1: `claude --resume <id> --bg` backgrounded the session as job
  `468b096a`; `claude stop <full session id>` failed with "No job matching", and the job stayed
  listed. Attempt 2: `claude stop 468b096a` stopped it; `claude agents --json` no longer listed
  it and its pid was gone. The study's working directory (the recreated floor repo path, not a
  git repo) was removed. No model turn in either attempt (assistant records 3 throughout).
- `claude attach` was not run (interactive, real input).

## VERDICT

YELLOW — the floor is proven on the CLI and Phase 63 has a route; three conditions apply.

1. The extension half of the floor (a stopped Orca session resumed inside the Claude Code
   extension on Theia) is not run. It waits for the EXT-01 session in the end-of-milestone pass
   (D-18); the steps are in "Blocked on EXT-01".
2. A running Orca agent cannot be shared live inside the extension at 2.1.321 as far as its
   source shows: it resumes by id and has no attach. Phase 63 must not plan on an extension
   live share.
3. The background-session option is open and half proven: start, list and stop work without a
   terminal; attach from a second client is unproven. It may be investigated in Phase 63 as an
   option and must not be promised in ROADMAP text.

No owner decision is needed for Phase 63 to be planned.

Route for Phase 63: agent sessions are Theia terminals running the plain `claude` CLI, reopened on demand with `claude --resume <session id>` (the P61-07 fallback), with the session id taken from Claude's side; the background-attach option (`claude --bg` plus `claude attach`) stays open as an unproven optional investigation and is not promised.
