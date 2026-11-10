// theia/extensions/orca-agents/bin/claude-wrapper.mjs
//
// Phase 63 (EXT-02, P63-26 amending P63-15; spike 006 "Note for EXT-02"): the
// process wrapper the Claude Code extension runs through its
// claudeCode.claudeProcessWrapper setting, so a session it starts appears in
// PowerBrowser's Orca as a pane with live hook status.
//
// The extension runs `<wrapper> <claude path> <args...>` (research assumption
// A3, verified with EXT-01 in the end-of-milestone pass). The wrapper is the
// per-profile launcher <bridge dir>/claude-wrapper, which execs PowerBrowser's
// Node on this file with `--bridge-dir <dir>` in front of those arguments.
//
// For each session:
//   1. read <bridge dir>/orcad-data-root (written by OrcaService): a regular
//      0600 file in a 0700 directory, both owned by this uid, one line naming
//      orcad's data root, which must hold Orca's CLI at cli/bin/orca. Never
//      read from an environment variable.
//   2. create a pane through Orca's own CLI: terminal create --worktree
//      path:<cwd> --title "Claude Code" --command cat --json (terminal.create,
//      not terminal.createAgentSession, which launches an Orca preset itself).
//      Presence is proven by the hook sender's parent process, so a placeholder
//      foreground in the pane is accepted.
//   3. spawn claude as a child with inherited stdio and an environment that
//      drops every inherited ORCA_* name and adds ORCA_PANE_KEY, ORCA_TAB_ID,
//      ORCA_WORKTREE_ID and ORCA_AGENT_HOOK_ENDPOINT; forward SIGINT, SIGTERM
//      and SIGHUP; on exit close the pane and exit with claude's code.
//
// Nothing is written to stdout (claude's protocol stream passes through
// untouched) or stderr, and there is no user-facing copy (P63-18). When the
// data root, the CLI or the pane cannot be had, one line naming the failed
// step goes to <bridge dir>/claude-wrapper.log (0600) and claude runs
// unwrapped, still without inherited ORCA_* names, with the same signal
// forwarding and exit-code passthrough. Node built-ins only.

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_ROOT_FILE = 'orcad-data-root';
export const LOG_FILE = 'claude-wrapper.log';
export const PANE_TITLE = 'Claude Code';
// shortcut: cat holds the pane open without drawing a prompt (research A4); the hermetic row decides if it must change.
export const PLACEHOLDER_COMMAND = 'cat';
const CLI_TIMEOUT_MS = 20000;
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const POSIX = process.platform === 'linux' || process.platform === 'darwin';

/** argv as the launcher passes it: --bridge-dir <dir>, then the claude path, then claude's arguments. */
export function parseWrapperArgs(argv) {
    let rest = argv;
    let bridgeDir = null;
    if (rest[0] === '--bridge-dir' && typeof rest[1] === 'string' && rest[1] !== '') {
        bridgeDir = rest[1];
        rest = rest.slice(2);
    }
    return { bridgeDir, claude: rest[0] ?? null, args: rest.slice(1) };
}

/** An error the wrapper raised itself; only these messages reach the log (a CLI error could carry its output). */
function refuse(message, extra = {}) {
    return Object.assign(new Error(message), { wrapper: true }, extra);
}

/** Pure: the log's reason for an error: the wrapper's own message, else only a code or a name. */
export function logReason(e) {
    if (e?.wrapper) return e.message;
    if (typeof e?.code === 'string') return e.code;
    if (Number.isInteger(e?.status)) return `exit ${e.status}`;
    return e?.name ?? 'error';
}

function assertPrivate(path, kind) {
    const st = lstatSync(path);
    if (kind === 'directory' ? !st.isDirectory() : !st.isFile()) throw refuse(`${kind} is not a regular ${kind}`);
    if (POSIX) {
        if (st.uid !== process.getuid()) throw refuse(`${kind} is owned by another user`);
        if ((st.mode & 0o077) !== 0) throw refuse(`${kind} grants group or other access`);
    }
}

/** The effective data root from <bridgeDir>/orcad-data-root; throws naming what was refused. */
export function readDataRoot(bridgeDir) {
    assertPrivate(bridgeDir, 'directory');
    const file = join(bridgeDir, DATA_ROOT_FILE);
    assertPrivate(file, 'file');
    const dataRoot = readFileSync(file, 'utf8').split('\n')[0];
    if (!isAbsolute(dataRoot)) throw refuse('data root is not an absolute path');
    if (!existsSync(join(dataRoot, 'cli', 'bin', 'orca'))) throw refuse('data root has no Orca CLI');
    return dataRoot;
}

/** claude's environment: the base with every ORCA_* name removed, plus the pane identity and endpoint when a pane exists. */
export function claudeEnv(baseEnv, pane, dataRoot) {
    const env = {};
    for (const [k, v] of Object.entries(baseEnv)) if (!k.startsWith('ORCA_')) env[k] = v;
    if (pane) {
        env.ORCA_PANE_KEY = pane.paneKey;
        env.ORCA_TAB_ID = pane.tabId;
        env.ORCA_WORKTREE_ID = pane.worktreeId;
        env.ORCA_AGENT_HOOK_ENDPOINT = join(dataRoot, 'agent-hooks', 'endpoint.env');
    }
    return env;
}

/** The wrapper's exit code for claude's exit: its code, or 128 plus the signal number. */
export function exitCodeFor(code, signal) {
    if (signal) return 128 + (osConstants.signals[signal] ?? 0);
    return Number.isInteger(code) ? code : 1;
}

/** The CLI's environment, built from scratch: PATH and HOME from the base, the data root for Orca's two names. */
export function cliEnv(baseEnv, dataRoot) {
    return { PATH: baseEnv.PATH ?? '', HOME: baseEnv.HOME ?? '', ORCA_USER_DATA: dataRoot, ORCA_USER_DATA_PATH: dataRoot };
}

function runCli(dataRoot, args, env, timeout = CLI_TIMEOUT_MS) {
    const out = execFileSync(join(dataRoot, 'cli', 'bin', 'orca'), [...args, '--json'], {
        env, stdio: ['ignore', 'pipe', 'pipe'], timeout, encoding: 'utf8',
    });
    const parsed = JSON.parse(out);
    return parsed && typeof parsed === 'object' && 'result' in parsed ? parsed.result : parsed;
}

/** Pure: the first non-empty string among the named fields of the given objects. */
export function firstString(objects, names) {
    for (const o of objects) for (const n of names) if (o && typeof o[n] === 'string' && o[n]) return o[n];
    return null;
}

/** Creates the pane; resolves its identity, reading the pane key from show or list when create omits it. */
export function createPane(dataRoot, cwd, env) {
    const created = runCli(dataRoot, ['terminal', 'create', '--worktree', `path:${cwd}`, '--title', PANE_TITLE, '--command', PLACEHOLDER_COMMAND], env);
    const handle = firstString([created, created?.terminal], ['handle']);
    if (!handle) throw refuse('create returned no handle', { pane: null });
    const pane = {
        handle,
        paneKey: firstString([created, created?.terminal], ['paneKey']),
        tabId: firstString([created, created?.terminal], ['tabId']),
        worktreeId: firstString([created, created?.terminal], ['worktreeId']),
        paneKeyFrom: 'create',
    };
    if (!pane.paneKey) {
        try {
            const shown = runCli(dataRoot, ['terminal', 'show', '--terminal', handle], env);
            pane.paneKey = firstString([shown, shown?.terminal], ['paneKey', 'recordedPaneKey']);
            pane.paneKeyFrom = 'show';
        } catch { /* fall through to list */ }
    }
    if (!pane.paneKey) {
        const listed = runCli(dataRoot, ['terminal', 'list'], env);
        const rows = Array.isArray(listed) ? listed : listed?.terminals ?? [];
        const row = rows.find((r) => r && r.handle === handle);
        pane.paneKey = firstString([row], ['paneKey', 'recordedPaneKey']);
        pane.tabId ??= firstString([row], ['tabId']);
        pane.paneKeyFrom = 'list';
    }
    if (!pane.paneKey || !pane.tabId || !pane.worktreeId) throw refuse('pane identity incomplete', { pane });
    return pane;
}

function logStep(bridgeDir, step) {
    if (!bridgeDir) return;
    try { appendFileSync(join(bridgeDir, LOG_FILE), `${new Date().toISOString()} ${step}\n`, { mode: 0o600 }); } catch { /* nowhere left to report */ }
}

function closePane(dataRoot, pane, env, bridgeDir) {
    try { runCli(dataRoot, ['terminal', 'close', '--terminal', pane.handle], env, 10000); } catch { logStep(bridgeDir, 'terminal close failed'); }
}

/** Runs one session; resolves the wrapper's exit code. */
export function main(argv, baseEnv = process.env, cwd = process.cwd()) {
    const { bridgeDir, claude, args } = parseWrapperArgs(argv);
    if (!claude) {
        logStep(bridgeDir, 'no claude path in the arguments');
        return Promise.resolve(2);
    }
    let dataRoot = null;
    let pane = null;
    let env;
    let step = 'bridge directory argument missing';
    try {
        if (!bridgeDir) throw refuse('no --bridge-dir');
        step = 'read orcad-data-root';
        dataRoot = readDataRoot(bridgeDir);
        step = 'terminal create';
        const cli = cliEnv(baseEnv, dataRoot);
        try {
            pane = createPane(dataRoot, resolve(cwd), cli);
        } catch (e) {
            if (e?.pane?.handle) closePane(dataRoot, e.pane, cli, bridgeDir);
            throw e;
        }
        env = claudeEnv(baseEnv, pane, dataRoot);
    } catch (e) {
        logStep(bridgeDir, `${step} failed (${logReason(e)}); running claude without an Orca pane`);
        pane = null;
        env = claudeEnv(baseEnv, null, null);
    }

    return new Promise((done) => {
        const child = spawn(claude, args, { stdio: 'inherit', env });
        const forward = (sig) => { try { child.kill(sig); } catch { /* already gone */ } };
        for (const sig of FORWARDED_SIGNALS) process.on(sig, forward);
        let settled = false;
        const finish = (code) => {
            if (settled) return;
            settled = true;
            if (pane) closePane(dataRoot, pane, cliEnv(baseEnv, dataRoot), bridgeDir);
            done(code);
        };
        child.once('error', () => { logStep(bridgeDir, 'spawn claude failed'); finish(127); });
        child.once('exit', (code, signal) => finish(exitCodeFor(code, signal)));
    });
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) process.exit(await main(process.argv.slice(2)));
