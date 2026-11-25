# Spike 006: what the Claude Code extension's published package offers for an external session

Read 2026-11-09 from the published package. Nothing from the package is in this repository:
the three files below were extracted with `python3 -I` `zipfile` into a session scratch
directory outside the repo, and only identifiers and one-line fragments are quoted here. The
bundled native binary was never extracted. The extension was never installed or run; every
statement below is a source reading of minified code, not an observed behaviour.

## Package

| Field | Value |
|---|---|
| Extension | `Anthropic.claude-code` ("Claude Code for VS Code") |
| Version | 2.1.321 |
| Target | linux-x64 |
| Source URL | https://open-vsx.org/api/Anthropic/claude-code/linux-x64/2.1.321/file/Anthropic.claude-code-2.1.321@linux-x64.vsix |
| vsix sha256 | `bdfbd675d73ac2c4f372a2562a7144e2cfaeda71488052b4e3dc53cbdff5a5c0` (checked with `sha256sum` before reading) |
| Members | 49; read: `extension/package.json` (24,521 bytes), `extension/extension.js` (3,579,215 bytes), `extension/webview/index.js` (6,047,746 bytes) |
| sha256 of package.json | `e183aaac0b22ee77406ac0e26900a8900857637c64151a64e4be827c5bc917be` |
| sha256 of extension.js | `e1940637cb94e7a5f7b401073004067c31901ab60444bd45674f82df0ddbac74` |
| sha256 of webview/index.js | `54623748c31667e3958f2989bf976252d5268b6a051ea93e015dd7b44bc14f1b` |
| `engines.vscode` | `^1.94.0` (Theia 1.76 reports 1.139.0, 60-EXT01-RECORD) |
| Activation events | `onStartupFinished`, `onWebviewPanel:claudeVSCodePanel` |
| `main` | `./extension.js` |
| Licence | proprietary; installed at runtime by the user, never pinned or packaged by PowerBrowser |

## Commands and settings that concern sessions (identifiers only)

Commands (`contributes.commands`, 31 in total): `claude-vscode.editor.open`,
`claude-vscode.editor.openLast`, `claude-vscode.primaryEditor.open`, `claude-vscode.window.open`,
`claude-vscode.sidebar.open`, `claude-vscode.newConversation`,
`claude-vscode.reopenClosedSession`, `claude-vscode.terminal.open`,
`claude-vscode.createWorktree`, `claude-vscode.markSessionUnread`,
`claude-vscode.renameSessionTab`, `claude-vscode.addSessionTabToGroup`.

Settings (`contributes.configuration`, 23 in total): `claudeCode.useTerminal`,
`claudeCode.claudeProcessWrapper`, `claudeCode.environmentVariables`,
`claudeCode.preferredLocation`, `claudeCode.continueAfterReload`,
`claudeCode.initialPermissionMode`, `claudeCode.allowDangerouslySkipPermissions`,
`claudeCode.archiveInactiveSessions`.

## Session-id entry points

Three ways to hand the extension an existing session id, all of which **resume** it (start a
new `claude` process on the stored conversation):

1. **URI handler, path `/open`.** `registerUriHandler` has `case"/open":` which reads the query
   parameters `session` and `prompt`, returns without acting when `session` is present and fails
   the id validator (`if(x!==void 0&&!YC(x))return`), and otherwise runs
   `executeCommand("claude-vscode.primaryEditor.open",x,w)`. URI shape:
   `vscode://Anthropic.claude-code/open?session=<id>` (optionally `&prompt=<text>`). The scheme
   on Theia is whatever Theia registers for plugin URI handlers; that is part of the EXT-01 check.
2. **`claude-vscode.editor.open` and `claude-vscode.primaryEditor.open`.**
   `registerCommand("claude-vscode.primaryEditor.open",async(E,C)=>…createPanel(E,C,…))`:
   argument order is (session id, initial prompt).
   `registerCommand("claude-vscode.editor.open",async(E,C,x,w,k,R)=>…)`: first two arguments are
   again (session id, initial prompt); the remaining four select the view column and placement
   (`hasPanelForSession(E)`, `activateInSidebar(E,C)`). The webview request
   `new_conversation_tab` carries a `sessionId` (3 occurrences in extension.js).
3. **`claude-vscode.terminal.open`.**
   `registerCommand("claude-vscode.terminal.open",(o,i,s)=>…)` takes (command string, args
   array, location). The request validator next to it accepts `args` only when it is absent,
   empty, or exactly `--resume` plus a valid id:
   `n.length===0||n.length===2&&n[0]==="--resume"&&un(n[1])!==null`, and accepts `prompt` only
   when absent or a slash command (`/^\/[a-z][a-z-]{0,63}$/`). That validator guards the
   webview's open-in-terminal request (`openClaudeInTerminal`, 9 occurrences in
   webview/index.js); whether the directly executed command applies the same check was not
   traced, so the EXT-01 step uses exactly the accepted shape. The terminal is created with
   `window.createTerminal`, and the command line is sent through
   `onDidChangeTerminalShellIntegration` → `shellIntegration.executeCommand(…)`, with a
   3000 ms fallback to `sendText` when shell integration never arrives. On Theia this fallback
   is the path to expect if terminal shell integration is not implemented.

The extension's own SDK spawn of `claude` builds `--continue`, `--resume <id>`,
`--session-id <id>` and `--fork-session` from options
(`if(x)z.push(Qn("--resume",x))`, `Qn("--session-id",this.options.sessionId)`,
`z.push("--fork-session")`).

## Attach and background arguments: counts (assumption A8 checked)

Each count is `grep -oF -- '<quoted string>' <file> | wc -l`, run in the scratch directory;
dq, sq and bt are the double-quoted, single-quoted and backtick-quoted forms.

| String | extension.js dq / sq / bt | webview/index.js dq / sq / bt |
|---|---|---|
| `--resume` | 3 / 0 / 0 | 2 / 0 / 0 |
| `--session-id` | 1 / 0 / 0 | 0 / 0 / 0 |
| `--fork-session` | 1 / 0 / 0 | 0 / 0 / 0 |
| `--continue` | 1 / 0 / 0 | 0 / 0 / 0 |
| `--bg` | 0 / 0 / 1 | 0 / 0 / 0 |
| `--background` | 0 / 0 / 0 | 0 / 0 / 0 |
| `attach` | 0 / 0 / 0 | 2 / 0 / 0 |

Example commands: `grep -oF -- '"--resume"' extension.js | wc -l` → 3;
`grep -oF -- '"--bg"' extension.js | wc -l` → 0; `` grep -oF -- '`--bg`' extension.js | wc -l `` → 1;
`grep -oF -- '"attach"' webview/index.js | wc -l` → 2.

Unquoted phrases, `grep -oF -- '<phrase>' <file> | wc -l`:

| Phrase | extension.js | webview/index.js |
|---|---|---|
| `claude attach` | 0 | 0 |
| `claude agents` | 1 | 0 |
| `bg-pty-host` | 0 | 0 |
| `disableAgentView` | 2 | 0 |

What the non-zero rows are:

- The one backtick `--bg` and the one `claude agents` in extension.js are the same sentence: the
  description text of the `disableAgentView` setting in the settings schema bundled with the
  extension ("Disable agent view (`claude agents`, `--bg`, /background, the on-demand daemon)").
  It is documentation of a CLI setting, not an argument the extension passes.
- The two `"attach"` in webview/index.js are an icon name (`attach:M("attach",60468)`) and a
  keyword in a syntax-highlighting word list (next to `"detach"`, `"library"`, `"require"`).
- The two `"--resume"` in webview/index.js build `["--resume", <active session id>]` for
  `openClaudeInTerminal` in two internal actions (`/issue`, `/share`).

**Reading:** the extension has no code path that passes `--bg`, `--background` or `attach` to
the CLI, and none that names the background PTY host. It can open a stored session by id; it
cannot adopt a process that another program's PTY already owns, and it has no client for the
CLI's background service. This is an absence in minified code across the only two JavaScript
members of the package (the other code is the bundled CLI binary and one audio-capture native
module, neither read): "no attach found in 2.1.321", not "attach is impossible".
A8 holds: webview/index.js adds nothing.
