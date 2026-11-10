# Live sharing of an Orca agent session

Whether a running Orca agent can be shared inside the Claude Code extension, and the floor: an
agent started by PB's own orcad, stopped, then resumed with `claude --resume`. Requirement
EXT-03 (D-06.3); EXT-01 and EXT-02 related; D-18 for the deferred half. Blueprint for Phase 63.

## Requirements

- The floor runs without the owner: PB's orcad (Orca 1.4.248 from source, PB's Node, loopback,
  scrubbed environment) starts the agent; the resume uses this host's Claude CLI login.
- No transcript text in any tracked file; evidence is counts, names and booleans.
- No call may reach the owner's running Orca: every inherited `ORCA_*` variable and the Claude
  session markers are removed from launch and resume.

## How to Build It

Route for Phase 63 (VERDICT YELLOW): **agent sessions are Theia terminals running the plain
`claude` CLI, reopened on demand with `claude --resume <session id>`** (the P61-07 fallback). As
adopted in 63-CONTEXT P63-16, no live share and no `--bg`/`attach` launch is built.

1. **Run the agent in a Theia terminal.** Orca resumes a session with
   `claude [--effort X] --resume <id>` (`orca/src/shared/agent-resume-argv.ts:16-24`); Orca's
   Claude agents are ordinary sessions under `~/.claude/projects`
   (`orca/src/main/ai-vault/session-scanner-roots.ts:10`).
2. **Take the session id from Claude's side**: the `.jsonl` name under
   `~/.claude/projects/<cwd with every non-alphanumeric character replaced by ->/`, or the
   `sessionId` column of `claude agents --json`, which lists interactive sessions as well as
   background ones (with `cwd`, `kind`, `status`). `orca terminal list --json` does not expose it
   (assumption A7 is false). Whether Orca's `ORCA_AGENT_HOOK_*` relay keeps the hook payload's
   session id is a Phase 63 research item.
3. **Never resume a session that is still running.** Per `claude --help`, that starts a copy.
   "Open in the extension" for a running agent is refused or offered as stop-then-resume.
4. **Extension entry points, once EXT-01 passes** (from the 2.1.321 package, source only): the
   command `claude-vscode.terminal.open` with `(undefined, ["--resume", "<id>"])`, and the URI
   `vscode://Anthropic.claude-code/open?session=<id>` (with Theia's plugin URI scheme). All three
   entry points resume by id.
5. **EXT-02 injection points** for the hook variables in a process the extension starts:
   `claudeCode.environmentVariables` and `claudeCode.claudeProcessWrapper`; which works on Theia
   is an EXT-01-session check.

Floor driver: `sources/006-orca-live-sharing/floor-run.mjs` (`--dry-run` stops before the
launch, no model turn). A real run is two model turns on the owner's login; run it once.

## Measured

| Evidence key (`results-floor.json`) | Value |
|---|---|
| `launchOutcomeKind` | `terminal` |
| `agentProcessesBeforeStop` -> `agentProcessesAfterStop` | 1 -> 0 |
| `jsonlLinesBefore` -> `jsonlLinesAfter` | 57 -> 86 |
| `resumeExitCode` / `resumeOutputHasMarker` | 0 / `true` |
| `sessionIdInTerminalList` | `false` |
| `claudeSettingsChanged` | `false` |
| timings | orcad ready 1.1 s, launch to answer 8.0 s, resume 8.6 s |
| `claudeVersion` | 2.1.321 |

Extension package (`extension.js`, `webview/index.js`): `"--resume"` 3 and 2 occurrences;
`"--bg"`, `"--background"`, `"attach"` as a CLI argument and `claude attach` 0 each.
Launch modes: `claude --resume <id> --bg` backgrounded the stopped session under the same id with
no model turn; `claude agents --json` listed it; `claude stop <8-character job id>` stopped it
(the full session id fails with "No job matching").

## What to Avoid

- **Planning an extension live share.** At 2.1.321 the extension resumes by id and has no attach;
  it starts its own `claude` on a stored conversation.
- **Promising `--bg` plus `claude attach`.** Start, list and stop are proven; attach from one or
  two clients is not (it needs an interactive terminal and real input). Orca's terminal surface
  runs plain `claude` in a PTY, so using it needs a changed launch command.
- **Asserting hook-driven counts against a constant.** The owner's user-level hooks run in every
  launched and resumed session (57 jsonl records for a one-line prompt); compare before and after.
- **Resuming from another directory.** Session files are stored per working directory; resuming
  elsewhere was not tried.

## Constraints

- Blocked on EXT-01 (D-18, end-of-milestone pass): the extension half of the floor, a stopped
  Orca session resumed inside the extension on Theia. Steps: spike 006 README, section
  "Blocked on EXT-01".
- If EXT-01 fails on Theia, EXT-02 reduces to "Claude sessions started in Theia terminals are
  visible in Orca", which this route delivers; the extension-pane half then needs an owner
  decision.
- The floor session `468b096a` remains in `claude agents --json --all` as a stopped background
  job until `claude rm 468b096a`.

## Origin

Synthesized from spike 006 (frontmatter PARTIAL, VERDICT YELLOW, 2026-11-09, plan 61-03).
Sources: `sources/006-orca-live-sharing/` (README.md, results.md, floor-run.mjs).
`results-floor.json` and `extension-notes.md` stay in `.planning/spikes/006-orca-live-sharing/`.
