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
// The CLI phase (create, then show or list when create omits the pane key) runs
// asynchronously under one deadline, PANE_BUDGET_MS, so a wedged orcad delays
// claude by at most that (63-WR-02, agents-extensions-02). Every error after a
// create returned a handle carries the pane, so it is closed (63-WR-01,
// agents-extensions-01). A create still running at the deadline is not killed:
// claude starts unwrapped, and the pane that create returns is closed before
// the wrapper exits. A create that never returns a handle (killed at the CLI's
// hard cap, or failed after orcad made the pane) is followed by a best-effort
// sweep: the worktree's "Claude Code" panes that were not listed just before
// the create are closed. The sweep can also catch a pane another session
// created in this worktree in that same window; it runs only on this failure
// path. The signal handlers are installed before the CLI phase: a
// signal before claude starts closes what was created and exits 128 plus the
// signal number. The CLI and the hook endpoint carry Orca's win32 names there
// (orca.exe, endpoint.cmd; 63-WR-03).
//
// Nothing is written to stdout (claude's protocol stream passes through
// untouched) or stderr, and there is no user-facing copy (P63-18). When the
// data root, the CLI or the pane cannot be had, one line naming the failed
// step goes to <bridge dir>/claude-wrapper.log (0600) and claude runs
// unwrapped, still without inherited ORCA_* names, with the same signal
// forwarding and exit-code passthrough. Node built-ins only.

import { execFile, spawn } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_ROOT_FILE = 'orcad-data-root';
export const LOG_FILE = 'claude-wrapper.log';
export const PANE_TITLE = 'Claude Code';
// shortcut: cat holds the pane open without drawing a prompt (research A4); the hermetic row decides if it must change.
export const PLACEHOLDER_COMMAND = 'cat';
/** One deadline for the whole pane phase before claude is spawned. */
export const PANE_BUDGET_MS = 5000;
/** The hard cap of any one CLI process (a late create runs on to this in the background). */
const CLI_TIMEOUT_MS = 20000;
const CLOSE_TIMEOUT_MS = 10000;
/** The listing taken before create, so a sweep knows which panes are new; part of the pane budget. */
const BEFORE_LIST_MS = 1500;
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

/** 63-WR-03: Orca's CLI in a data root; orcad writes orca.exe on win32. */
export function cliPath(dataRoot, platform = process.platform) {
    return join(dataRoot, 'cli', 'bin', platform === 'win32' ? 'orca.exe' : 'orca');
}

/** 63-WR-03: the hook endpoint Orca publishes; endpoint.cmd on win32. */
export function hookEndpointPath(dataRoot, platform = process.platform) {
    return join(dataRoot, 'agent-hooks', platform === 'win32' ? 'endpoint.cmd' : 'endpoint.env');
}

/** The effective data root from <bridgeDir>/orcad-data-root; throws naming what was refused. */
export function readDataRoot(bridgeDir) {
    assertPrivate(bridgeDir, 'directory');
    const file = join(bridgeDir, DATA_ROOT_FILE);
    assertPrivate(file, 'file');
    const dataRoot = readFileSync(file, 'utf8').split('\n')[0];
    if (!isAbsolute(dataRoot)) throw refuse('data root is not an absolute path');
    if (!existsSync(cliPath(dataRoot))) throw refuse('data root has no Orca CLI');
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
        env.ORCA_AGENT_HOOK_ENDPOINT = hookEndpointPath(dataRoot);
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

/** One CLI call, asynchronous so the event loop (and the signal handlers) keep running; resolves its result. */
function runCli(dataRoot, args, env, timeout = CLI_TIMEOUT_MS) {
    return new Promise((resolveCall, rejectCall) => {
        const child = execFile(cliPath(dataRoot), [...args, '--json'], {
            env, timeout: Math.max(1, Math.min(timeout, CLI_TIMEOUT_MS)), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true,
        }, (err, out) => {
            if (err) return rejectCall(err);
            try {
                const parsed = JSON.parse(out);
                resolveCall(parsed && typeof parsed === 'object' && 'result' in parsed ? parsed.result : parsed);
            } catch (e) {
                rejectCall(e);
            }
        });
        child.stdin?.end();
    });
}

/** Rejects with a wrapper error once the deadline passes; the call itself is left running. */
function beforeDeadline(promise, deadline) {
    let timer;
    const expired = new Promise((_, rejectLate) => {
        timer = setTimeout(() => rejectLate(refuse('pane budget spent', { budget: true })), Math.max(0, deadline - Date.now()));
    });
    return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

/** Pure: the first non-empty string among the named fields of the given objects. */
export function firstString(objects, names) {
    for (const o of objects) for (const n of names) if (o && typeof o[n] === 'string' && o[n]) return o[n];
    return null;
}

const handleOf = (created) => firstString([created, created?.terminal], ['handle']);
const listArgs = (cwd) => ['terminal', 'list', '--worktree', `path:${cwd}`];
const listRows = (listed) => (Array.isArray(listed) ? listed : listed?.terminals ?? []);

/**
 * Creates the pane; resolves its identity, reading the pane key from show or list when create omits it.
 * Rejects with { pane } once a handle is known, and with { late } (the create still running) at the deadline.
 */
export async function createPane(dataRoot, cwd, env, deadline = Date.now() + PANE_BUDGET_MS) {
    // 63-WR-02: the worktree's panes before the create, for the sweep; null (no sweep) when the listing fails.
    let before = null;
    try {
        before = new Set(listRows(await runCli(dataRoot, listArgs(cwd), env, Math.min(BEFORE_LIST_MS, deadline - Date.now()))).map((r) => r?.handle).filter(Boolean));
    } catch { /* the create still runs; a sweep is not possible */ }
    const creating = runCli(dataRoot, ['terminal', 'create', '--worktree', `path:${cwd}`, '--title', PANE_TITLE, '--command', PLACEHOLDER_COMMAND], env);
    const sweep = { cwd, before };
    let created;
    try {
        created = await beforeDeadline(creating, deadline);
    } catch (e) {
        if (e?.budget) throw refuse('terminal create timed out', { late: creating, sweep });
        throw e;
    }
    const handle = handleOf(created);
    if (!handle) throw refuse('create returned no handle', { pane: null });
    const pane = {
        handle,
        paneKey: firstString([created, created?.terminal], ['paneKey']),
        tabId: firstString([created, created?.terminal], ['tabId']),
        worktreeId: firstString([created, created?.terminal], ['worktreeId']),
        paneKeyFrom: 'create',
    };
    try {
        if (!pane.paneKey) {
            try {
                const shown = await runCli(dataRoot, ['terminal', 'show', '--terminal', handle], env, deadline - Date.now());
                pane.paneKey = firstString([shown, shown?.terminal], ['paneKey', 'recordedPaneKey']);
                pane.paneKeyFrom = 'show';
            } catch { /* fall through to list */ }
        }
        if (!pane.paneKey) {
            const listed = await runCli(dataRoot, ['terminal', 'list'], env, deadline - Date.now());
            const rows = Array.isArray(listed) ? listed : listed?.terminals ?? [];
            const row = rows.find((r) => r && r.handle === handle);
            pane.paneKey = firstString([row], ['paneKey', 'recordedPaneKey']);
            pane.tabId ??= firstString([row], ['tabId']);
            pane.paneKeyFrom = 'list';
        }
        if (!pane.paneKey || !pane.tabId || !pane.worktreeId) throw refuse('pane identity incomplete');
    } catch (e) {
        // The pane exists in orcad from here on: whatever failed, the caller must be able to close it.
        throw Object.assign(e && typeof e === 'object' ? e : refuse('pane lookup failed'), { pane });
    }
    return pane;
}

function logStep(bridgeDir, step) {
    if (!bridgeDir) return;
    try { appendFileSync(join(bridgeDir, LOG_FILE), `${new Date().toISOString()} ${step}\n`, { mode: 0o600 }); } catch { /* nowhere left to report */ }
}

async function closePane(dataRoot, pane, env, bridgeDir) {
    try { await runCli(dataRoot, ['terminal', 'close', '--terminal', pane.handle], env, CLOSE_TIMEOUT_MS); } catch { logStep(bridgeDir, 'terminal close failed'); }
}

/**
 * 63-WR-02: after a create that outlived the deadline and then gave no handle (killed at the CLI's cap, or failed after
 * orcad made the pane), closes the worktree's "Claude Code" panes that the listing before the create did not hold.
 * Best effort: nothing is swept without that listing, and a failure is one log line.
 */
async function sweepOrphans(dataRoot, cli, bridgeDir, sweep) {
    if (!sweep?.before) {
        logStep(bridgeDir, 'terminal create gave no handle and no earlier pane list exists; nothing swept');
        return;
    }
    let rows;
    try {
        rows = listRows(await runCli(dataRoot, listArgs(sweep.cwd), cli, CLOSE_TIMEOUT_MS));
    } catch {
        logStep(bridgeDir, 'terminal list for the orphan sweep failed');
        return;
    }
    for (const row of rows) {
        if (row && typeof row.handle === 'string' && row.title === PANE_TITLE && !sweep.before.has(row.handle)) {
            await closePane(dataRoot, { handle: row.handle }, cli, bridgeDir);
        }
    }
}

/** Closes whatever a failed or abandoned createPane left in orcad: a known pane now, a late create once it settles. */
function cleanupAfter(e, dataRoot, cli, bridgeDir) {
    if (e?.pane?.handle) return closePane(dataRoot, e.pane, cli, bridgeDir);
    if (e?.late) {
        return e.late.then((created) => {
            const handle = handleOf(created);
            return handle ? closePane(dataRoot, { handle }, cli, bridgeDir) : sweepOrphans(dataRoot, cli, bridgeDir, e.sweep);
        }, () => sweepOrphans(dataRoot, cli, bridgeDir, e.sweep));
    }
    return Promise.resolve();
}

/** Runs one session; resolves the wrapper's exit code. */
export async function main(argv, baseEnv = process.env, cwd = process.cwd()) {
    const { bridgeDir, claude, args } = parseWrapperArgs(argv);
    if (!claude) {
        logStep(bridgeDir, 'no claude path in the arguments');
        return 2;
    }
    // agents-extensions-01: the handlers are in place before the CLI phase; before claude runs, a signal ends the session.
    let child = null;
    let onEarlySignal;
    const earlySignal = new Promise((resolveSignal) => { onEarlySignal = resolveSignal; });
    const onSignal = (sig) => {
        if (child) {
            try { child.kill(sig); } catch { /* already gone */ }
        } else {
            onEarlySignal(sig);
        }
    };
    for (const sig of FORWARDED_SIGNALS) process.on(sig, onSignal);
    const cleanups = [];

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
        const creating = createPane(dataRoot, resolve(cwd), cli);
        const first = await Promise.race([
            creating.then((p) => ({ pane: p }), (e) => ({ error: e })),
            earlySignal.then((sig) => ({ sig })),
        ]);
        if (first.sig) {
            // Stopped before claude started: close what the create makes, then exit as signalled.
            await creating.then((p) => closePane(dataRoot, p, cli, bridgeDir), (e) => cleanupAfter(e, dataRoot, cli, bridgeDir));
            return exitCodeFor(null, first.sig);
        }
        if (first.error) {
            cleanups.push(cleanupAfter(first.error, dataRoot, cli, bridgeDir));
            throw first.error;
        }
        pane = first.pane;
        env = claudeEnv(baseEnv, pane, dataRoot);
    } catch (e) {
        logStep(bridgeDir, `${step} failed (${logReason(e)}); running claude without an Orca pane`);
        pane = null;
        env = claudeEnv(baseEnv, null, null);
    }

    const code = await new Promise((done) => {
        child = spawn(claude, args, { stdio: 'inherit', env });
        let settled = false;
        const finish = (c) => {
            if (settled) return;
            settled = true;
            done(c);
        };
        child.once('error', () => { logStep(bridgeDir, 'spawn claude failed'); finish(127); });
        child.once('exit', (c, signal) => finish(exitCodeFor(c, signal)));
    });
    if (pane) cleanups.push(closePane(dataRoot, pane, cliEnv(baseEnv, dataRoot), bridgeDir));
    await Promise.all(cleanups);
    return code;
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) process.exit(await main(process.argv.slice(2)));
