# Spike 006 results — 2026-11-09

Orca v1.4.248 (commit 965978bc, built in this lane by `scripts/build-orca.sh`, CLI by
`ORCA_CLI_BUILD_COMPILER=tsrs node config/scripts/build-cli.mjs`), orcad on PowerBrowser's
Node 24.19.0 through `scripts/lib/orca-run.mjs`, Claude CLI `2.1.321 (Claude Code)` logged in
through claude.ai, extension package `Anthropic.claude-code` 2.1.321 linux-x64. Host: legion.
Raw evidence: `results-floor.json` (floor), `extension-notes.md` (package reading). The floor
session id is `468b096a-bd9b-4a24-add3-d287c0da03bb`; its background-job id is the first eight
characters, `468b096a`.

| # | Sub-check | Result | Observed |
|---|-----------|--------|----------|
| 1 | Floor: a stopped Orca Claude session resumes with `claude --resume` | PASS | `node .planning/spikes/006-orca-live-sharing/floor-run.mjs` → `floor-run: PASS`. Agent launched by PB's orcad (`agent launch --agent claude --surface terminal`, outcome kind `terminal`), answered with the marker in 8.0 s, was stopped with `terminal close --worktree <selector> --all` (agent processes 1 → 0), then `claude --resume <id> -p "…"` exited 0 in 8.6 s with the marker in stdout; the same jsonl grew 57 → 86 lines. |
| 2 | Orca reports the provider session id (assumption A7) | FAIL (A7 false) | `orca terminal list --worktree <selector> --json` did not contain the session id (`sessionIdInTerminalList: false`). The id came from the session file name under `~/.claude/projects/<encoded cwd>/`. Phase 63 must take the id from Claude's side (hook payload or session file), not from `terminal list`. |
| 3 | Extension session-id entry point | PASS (source) | Three entry points take a session id: URI path `/open` with `session`, `claude-vscode.editor.open` / `claude-vscode.primaryEditor.open` (session id first), `claude-vscode.terminal.open` with `--resume <id>`. Source reading only (`extension-notes.md`); not run. |
| 4 | Extension attach capability | FAIL (none found) | `grep -oF -- '"attach"' extension.js \| wc -l` → 0; `'"--bg"'` → 0; `'"--background"'` → 0; `'claude attach'` → 0 in both files. The only `--bg` text is the description of the `disableAgentView` setting. The extension resumes; it does not attach. |
| 5 | Background resume of the floor session, no prompt | PASS | `claude --resume 468b096a-bd9b-4a24-add3-d287c0da03bb --bg` (in the session's cwd, scrubbed environment) exited 0 and printed `backgrounded · 468b096a (idle — send a prompt to start)`; it did not say it started a copy. No model turn: assistant records in the jsonl 3 before, 3 after; lines 86 → 86 while idle. |
| 6 | Listed in `claude agents` | PASS | `claude agents --json`, filtered to this session id: one row, `kind: background`, `status: idle`, `state: blocked`, `id: 468b096a`, `sessionId` the full floor id, `cwd` the floor repo. Row keys: `pid, id, cwd, kind, startedAt, sessionId, name, status, state`. Total rows 8 before, 9 after; no other row was read. |
| 7 | Stopped and gone | PASS | `claude stop 468b096a` → `stopped 468b096a`, exit 0. Then `claude agents --json`: 0 rows for the id (total back to 8); `claude agents --json --all`: 1 row, `state: stopped`; the job's pid no longer exists. jsonl 86 → 90 lines, assistant records still 3. The on-demand background service that `--bg` started ("Starting background service…") had exited by the next check. |
| 8 | Attach from a second client (`claude attach <id>`) | UNPROVEN | Not run. `claude attach --help`: "Open the background session in this terminal. ← returns to agent view, Ctrl+Z drops back to your shell. The session keeps running either way." It needs an interactive terminal and real input, which this lane does not use. Whether two terminals can attach to one background session at the same time is unknown. |
| — | Control: stop takes the job id, not the session id | observed | `claude stop 468b096a-bd9b-4a24-add3-d287c0da03bb` → exit 1, `No job matching '…'`. The first stop attempt in this study failed for that reason and the job stayed listed until the short id was used. |

**Verdict: floor proven; live share through the extension not available from source; the
background-session mechanism is half proven (start, list, stop) and its attach half is unproven.**

## CLI help lines the study relies on (`claude` 2.1.321)

- `claude --help`, `--bg, --background`: "Start the session in the background and return
  immediately. Prints the id that `claude attach`, `logs`, `stop` and `rm` take; `claude agents`
  lists them. With --resume <session-id>, continues that session in the background under the
  same ID, or starts a copy and says so when the session is already running".
- `claude --help`, `-r, --resume [value]`: "Resume a conversation by session ID or name, or open
  interactive picker with optional search term". `--fork-session`: "When resuming, create a new
  session ID". `--session-id <uuid>`: "Use a specific session ID for the conversation".
- `claude attach --help`: `Usage: claude attach <id|name>` (text quoted in row 8).
- `claude agents --help`: "Manage background agents"; `--json`: "Print active sessions
  (interactive and background) as a JSON array and exit (for scripting; does not require a
  TTY)"; `--all`: "With --json: also include completed background sessions"; `--cwd <path>`:
  "Show only background sessions started under <path>".
- `claude stop --help`: "Stop a background session. Its conversation is kept; resume it later
  with `claude attach <id>`."
- `claude rm --help`: "Delete a background session and its worktree." Not used.
- `claude daemon --help`: "Service install is disabled in this version — the daemon runs on
  demand and exits when the last client disconnects."

## Findings the plan did not predict

1. **A7 is false.** Orca's `terminal list --json` does not expose the Claude session id for a
   terminal-surface agent. Orca's resume argv is built from a `providerSession.id`
   (`orca/src/shared/agent-resume-argv.ts`); whether orcad had recorded one for this agent was
   not checked, only that the CLI listing does not print it.
2. **The repo's own checkout is a valid workspace.** `--worktree path:<repo>` resolved for the
   registered repo's main checkout, so no Orca worktree was created and nothing was written
   under `~/orca/workspaces/`.
3. **`claude agents --json` lists interactive sessions too**, with `kind` telling them apart.
   A session started by Orca in a PTY is therefore visible to any client that reads this list,
   with its `sessionId` and `cwd`, while it runs. That is a discovery channel for Phase 63
   (find the running agent's id) even though it is not a share channel.
4. **A background job is addressed by an eight-character job id**, the prefix of the session id
   on resume. `stop` and `attach` take that id or a name, not the full session id.
5. **A one-line prompt produced 57 jsonl records** before the resume. The owner's user-level
   hooks run in every session, including an agent launched by PB's orcad and a `-p` resume. Any
   Phase 63 check that counts records must compare before and after, never against a constant.
6. **`claude stop` appends records to the session file** (86 → 90 lines) without a model turn.
7. **orcad start and agent launch did not change `~/.claude/settings.json`**
   (`claudeSettingsChanged: false`, sha256 compared before orcad start and after the resume).
