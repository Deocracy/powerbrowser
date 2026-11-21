#!/usr/bin/env node
// scripts/verify-orca-agent-hooks.mjs
//
// Phase 63 (TERM-02 relay, EXT-02 PowerBrowser half; P63-15 as amended by
// P63-26, P63-16, P63-17, P63-18, P63-38): agents report their status into
// PowerBrowser's orcad through Orca's own managed hook script, and a session
// started through PowerBrowser's claude wrapper appears in Orca as a pane with
// live status.
//
// One built orcad is started hermetically and driven through Orca's own CLI:
//   stage A (PTY env)  a pane created with terminal create; its process's
//                      /proc/<pid>/environ names, intersected with the names
//                      spawn-env-keys.ts declares, must equal
//                      AGENT_HOOK_RUNTIME_ENV_KEYS minus the deletion key
//                      ORCA_CLAUDE_AGENT_STATUS_SETTINGS, and must hold the
//                      pane identity names hook-stdin-contract.ts reads.
//                      Values are never printed (P63-38).
//   stage A (relay)    on that pane, a stub agent process (alive throughout)
//                      runs Orca's managed Claude hook command for the
//                      working, waiting and done events with the pane's
//                      identity and the endpoint, each payload carrying a
//                      synthetic session id; terminal.agentStatus must read
//                      each back within 5 s, in order. Whether a read-back
//                      carries the synthetic session id is a note (P63-16).
//   stage B (wrapper)  the launcher built exactly as the orca-agents backend
//                      builds it (launcherText from the built lib) runs
//                      bin/claude-wrapper.mjs with a stub claude, exactly as
//                      the Claude Code extension would run it. The stub runs
//                      the managed hook command for the working, waiting and
//                      done events in turn; the pane's status must read back
//                      each one. The stub's environment must hold the pane
//                      identity and the endpoint and must not hold the planted
//                      ORCA_PLANT_63 (the control: the name is in the wrapper's
//                      own /proc/<pid>/environ first); the launcher's stdout
//                      must equal the stub's marker line; the pane must close
//                      and the launcher must return the stub's exit code 7.
//   degrade            the launcher against a second bridge directory without
//                      orcad-data-root: the stub still runs and exits 7
//                      through it, one log line names the failed step, and no
//                      pane appears for the repository (P63-18).
//   static clauses     over the tracked sources, parsed with TypeScript: the
//                      wrapper reads no data root or pane identity name from
//                      process.env and has no stdout write; the frontend calls
//                      registerOverride with CLAUDE_PROCESS_WRAPPER_PREFERENCE;
//                      no orca-agents source calls a preference setter or
//                      names a settings.json file; the backend calls
//                      writeLauncher and reads POWERBROWSER_ENV, not
//                      process.env.
//
// Derived at check time from the pinned orca/ source, never hand-kept:
//  1. The Claude events Orca maps to working, waiting and done: the
//     reportedStateName expression of shared/agent-hook-listener/providers/
//     claude-events.ts (deriveClaudeHookEvents, also imported by
//     verify-orca-agent-status-live.mjs).
//  2. The status terminal.agentStatus reports for each hook state:
//     mapExplicitAgentStateToRuntimeTerminalStatus in main/runtime/
//     runtime-worktree-status-projection.ts.
//  3. The managed script's name: CLAUDE_HOOK_SETTINGS.scriptBaseName in
//     main/claude/hook-settings.ts. The command each event runs is read from
//     the Claude settings orcad installed into the scratch HOME.
//  4. The hook names a PTY carries: AGENT_HOOK_RUNTIME_ENV_KEYS in
//     main/ipc/pty/host-env/spawn-env-keys.ts; the pane identity names: the
//     variables the spool record line of main/agent-hooks/
//     hook-stdin-contract.ts reads for paneKey, tabId and worktreeId.
// "source moved" is red when any of them cannot be found.
//
// Scratch HOME (research Pitfall 6): Orca's managed hook scripts live in the
// user-wide <HOME>/.orca/agent-hooks and orcad writes Claude's hooks into
// <HOME>/.claude/settings.json, so orcad runs with a scratch HOME and never
// touches the user's ~/.orca or ~/.claude. No model turn is used: the stub
// stands in for claude.
//
// Terminal engine (D-31): orcad runs on Orca's own terminal engine, the stock
// local PTY provider and terminal daemon, with no ORCA_EXTERNAL_PTY_ENDPOINT.
// After D-31 that is also PowerBrowser's engine, so stage A's PTY environment
// is the environment half of TERM-02 (moved here from the dropped lane
// p63-01). The integrated real-agent run is orca-agent-status-live.
//
// Every orcad, CLI and stub environment is built from scratch, and this
// process drops its own inherited ORCA_* names first, so nothing from the
// shell that runs the check reaches Orca. orcad's stdout is parsed in memory
// by OrcaEnv's sink and never printed. Status is read with Orca's own built
// CLI runtime client (terminal.agentStatus). Teardown signals only recorded
// identities.
//
// The main runs only behind an entry guard comparing the realpath of
// process.argv[1] with this file: verify-orca-agent-status-live.mjs imports
// readAgentStatus and deriveClaudeHookEvents, so an import starts nothing.
//
// Tier: full (needs a built orca/ and the orca-agents lib; starts one orcad,
// no browser, no display). Prints a named SKIP and exits 77 when the build
// outputs are absent. --self-test is quick and pure: fixture observations and
// fixture source copies; each planted fault must go red naming the drift (SKIP,
// 77, when typescript is absent and the static plants cannot run).
//
// harness-static-browser-01: the static env clause follows aliases of
// process.env (the wrapper reads only through main's baseEnv default), and
// stage B's launcher inherits decoy ORCA_USER_DATA_PATH, ORCA_USER_DATA,
// ORCA_PANE_KEY, ORCA_TAB_ID and ORCA_WORKTREE_ID values (a second scratch data
// root, a fake pane): the pane must appear in PowerBrowser's data root and the
// stub must carry that pane's identity, never a decoy value.
//
// Usage:
//   node scripts/verify-orca-agent-hooks.mjs
//   node scripts/verify-orca-agent-hooks.mjs --self-test

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as OrcaEnv from '../powerbrowser/shell/OrcaEnv.sys.mjs';
import { descendants, ensurePbNode, installOutputRedaction, orcaVersionFromPins } from './lib/orca-run.mjs';
import { liveEnv } from './lib/firefox-bidi.mjs';
import { freePort, ppidMap, signalIdentity, startTicks } from './verify-orca-hidden-electron.mjs';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-agent-hooks';
const SELF_REL = 'scripts/verify-orca-agent-hooks.mjs';
const require = createRequire(import.meta.url);

export const CLAUDE_EVENTS_REL = 'src/shared/agent-hook-listener/providers/claude-events.ts';
export const STATUS_PROJECTION_REL = 'src/main/runtime/runtime-worktree-status-projection.ts';
export const HOOK_SETTINGS_REL = 'src/main/claude/hook-settings.ts';
export const SPAWN_ENV_KEYS_REL = 'src/main/ipc/pty/host-env/spawn-env-keys.ts';
export const HOOK_STDIN_REL = 'src/main/agent-hooks/hook-stdin-contract.ts';
export const AGENTS_REL = 'theia/extensions/orca-agents';
export const LAUNCHER_LIB_REL = `${AGENTS_REL}/lib/node/claude-wrapper-launcher.js`;
export const WRAPPER_REL = `${AGENTS_REL}/bin/claude-wrapper.mjs`;
export const FRONTEND_REL = `${AGENTS_REL}/src/browser/orca-agents-frontend-module.ts`;
export const BACKEND_REL = `${AGENTS_REL}/src/node/orca-agents-backend-module.ts`;
export const HOOK_STATES = ['working', 'waiting', 'done'];
/** The reverted key spawn-env-keys.ts lists only so older PTYs drop it; a fresh PTY must not carry it. */
export const DELETION_KEY = 'ORCA_CLAUDE_AGENT_STATUS_SETTINGS';
export const PLANT_NAME = 'ORCA_PLANT_63';
/** Stage B's inherited Orca identity (harness-static-browser-01): a second data root and a fake pane the wrapper must ignore. */
export const DECOYS = Object.freeze({
    ORCA_USER_DATA_PATH: '/nonexistent/pb-decoy-63/data', ORCA_USER_DATA: '/nonexistent/pb-decoy-63/data',
    ORCA_PANE_KEY: 'pb-decoy-tab-63:pb-decoy-leaf-63', ORCA_TAB_ID: 'pb-decoy-tab-63', ORCA_WORKTREE_ID: 'pb-decoy-worktree-63',
});
export const PANE_TITLE = 'Claude Code';
export const RELAY_TITLE = 'pb-relay-63';
export const STUB_EXIT = 7;
export const SYNTHETIC_SESSION = 'pb-synthetic-session-63';
const STATUS_WINDOW_MS = 5000;
const IMPORT_WINDOW_MS = 10000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

// --- derivations from the pinned source ---------------------------------------

/**
 * The Claude hook events Orca maps to working, waiting and done, from the reportedStateName
 * expression of claude-events.ts: the first eventName literal of the branch before each state
 * (an identifier such as isTurnBoundary is resolved through its const). Returns
 * { events: { working, waiting, done }, fails }; a state with no event is null and named.
 */
export function deriveClaudeHookEvents(orcaDir) {
    const text = read(join(orcaDir, CLAUDE_EVENTS_REL)) ?? '';
    const start = text.indexOf('const reportedStateName =');
    const events = { working: null, waiting: null, done: null };
    if (start < 0) return { events, fails: [`source moved: orca/${CLAUDE_EVENTS_REL} has no reportedStateName expression`] };
    const expr = text.slice(start, text.indexOf('\n\n', start) > 0 ? text.indexOf('\n\n', start) : undefined);
    let from = 0;
    for (const state of HOOK_STATES) {
        const at = expr.indexOf(`? '${state}'`, from);
        if (at < 0) continue;
        const branch = expr.slice(from, at);
        const lit = /eventName === '([A-Za-z]+)'/.exec(branch);
        if (lit) events[state] = lit[1];
        else {
            for (const id of branch.match(/\b(is[A-Z]\w*)\b/g) ?? []) {
                const def = new RegExp(`const ${id} =\\s*eventName === '([A-Za-z]+)'`).exec(text);
                if (def) { events[state] = def[1]; break; }
            }
        }
        from = at + state.length + 4;
    }
    const fails = HOOK_STATES.filter((s) => !events[s]).map((s) => `source moved: orca/${CLAUDE_EVENTS_REL} names no Claude event Orca maps to ${s}`);
    return { events, fails };
}

/** hook state -> the status terminal.agentStatus reports, from mapExplicitAgentStateToRuntimeTerminalStatus. */
export function deriveStatusMap(orcaDir) {
    const text = read(join(orcaDir, STATUS_PROJECTION_REL)) ?? '';
    const start = text.indexOf('function mapExplicitAgentStateToRuntimeTerminalStatus');
    const map = {};
    if (start >= 0) {
        const body = text.slice(start, text.indexOf('\n}\n', start));
        let pending = [];
        for (const m of body.matchAll(/case '([a-z]+)':|return '([a-z]+)'/g)) {
            if (m[1]) pending.push(m[1]);
            else { for (const s of pending) map[s] = m[2]; pending = []; }
        }
    }
    const fails = HOOK_STATES.filter((s) => !map[s]).map((s) => `source moved: orca/${STATUS_PROJECTION_REL} maps no terminal status for the hook state ${s}`);
    return { map, fails };
}

/** The managed Claude hook script's file name, from CLAUDE_HOOK_SETTINGS.scriptBaseName. */
export function deriveHookScriptName(orcaDir) {
    const text = read(join(orcaDir, HOOK_SETTINGS_REL)) ?? '';
    const m = /CLAUDE_HOOK_SETTINGS[^=]*=\s*\{[^}]*scriptBaseName:\s*'([A-Za-z0-9_-]+)'/.exec(text);
    return m ? { name: `${m[1]}.sh`, fails: [] } : { name: null, fails: [`source moved: orca/${HOOK_SETTINGS_REL} declares no CLAUDE_HOOK_SETTINGS.scriptBaseName`] };
}

/**
 * The PTY environment names: { declared, hookNames, identityNames, fails }. declared is
 * AGENT_HOOK_RUNTIME_ENV_KEYS, hookNames that minus DELETION_KEY; identityNames the variables
 * the hook script's spool record reads for paneKey, tabId and worktreeId, paired by position.
 */
export function derivePtyEnvNames(orcaDir) {
    const keys = read(join(orcaDir, SPAWN_ENV_KEYS_REL)) ?? '';
    const m = /AGENT_HOOK_RUNTIME_ENV_KEYS\s*=\s*\[([\s\S]*?)\]/.exec(keys);
    const declared = m ? [...m[1].replace(/\/\/.*$/gm, '').matchAll(/'([A-Z0-9_]+)'/g)].map((x) => x[1]) : [];
    const hookNames = declared.filter((n) => n !== DELETION_KEY);
    const stdin = read(join(orcaDir, HOOK_STDIN_REL)) ?? '';
    const start = stdin.indexOf('const spoolRecordLine');
    const block = start >= 0 ? stdin.slice(start, stdin.indexOf('return [', start)) : '';
    const fields = [...block.matchAll(/"(\w+)":"%s"/g)].map((x) => x[1]);
    const args = [...block.matchAll(/spool_json_escape "\$\{(ORCA_[A-Z0-9_]+):-\}"/g)].map((x) => x[1]);
    const byField = Object.fromEntries(fields.slice(0, args.length).map((f, i) => [f, args[i]]));
    const identityNames = ['paneKey', 'tabId', 'worktreeId'].map((f) => byField[f]).filter(Boolean);
    const fails = [];
    if (!hookNames.length) fails.push(`stage A (PTY environment): source moved: orca/${SPAWN_ENV_KEYS_REL} yields an empty AGENT_HOOK_RUNTIME_ENV_KEYS set`);
    if (identityNames.length !== 3) fails.push(`stage A (PTY environment): source moved: orca/${HOOK_STDIN_REL} names no ORCA_ variable for each of paneKey, tabId and worktreeId`);
    return { declared, hookNames, identityNames, fails };
}

// --- Orca's own CLI and runtime client ----------------------------------------

/** Removes this process's inherited ORCA_* names, so Orca's client code reads none of them. */
export function scrubOwnOrcaEnv() {
    for (const k of Object.keys(process.env)) if (k.startsWith('ORCA_')) delete process.env[k];
}

const clients = new Map();
/**
 * The agentStatus object ({ handle, isRunningAgent, status }) terminal.agentStatus returns for
 * `handle`, read through the runtime client Orca's built CLI uses; null on any error.
 */
export async function readAgentStatus(orcaDir, dataRoot, handle, timeoutMs = 10000) {
    const key = `${orcaDir}\0${dataRoot}`;
    if (!clients.has(key)) {
        scrubOwnOrcaEnv();
        const { RuntimeClient } = require(join(orcaDir, 'out', 'cli', 'runtime-client.js'));
        clients.set(key, new RuntimeClient(dataRoot, timeoutMs, null, null));
    }
    try {
        const r = await clients.get(key).call('terminal.agentStatus', { terminal: handle });
        return r?.result?.agentStatus ?? null;
    } catch { return null; }
}

/** The Orca CLI environment, built from scratch. */
export function cliEnv(home, dataRoot) {
    return { PATH: process.env.PATH ?? '', HOME: home, ORCA_USER_DATA: dataRoot, ORCA_USER_DATA_PATH: dataRoot };
}

/** Runs <dataRoot>/cli/bin/orca with --json; resolves its result, or throws with the CLI's own message. */
export function orcaCli(dataRoot, env, args, timeout = 30000) {
    let out;
    try {
        out = execFileSync(join(dataRoot, 'cli', 'bin', 'orca'), [...args, '--json'], { env: liveEnv(env), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout });
    } catch (e) {
        const msg = (() => { try { return JSON.parse(e.stdout).error?.message; } catch { return null; } })();
        throw new Error(`orca ${args.slice(0, 2).join(' ')} failed: ${msg ?? String(e.stderr ?? e.message).trim().split('\n').pop()}`);
    }
    const parsed = JSON.parse(out);
    if (parsed?.ok === false) throw new Error(`orca ${args.slice(0, 2).join(' ')} failed: ${parsed.error?.message ?? 'not ok'}`);
    return parsed?.result ?? parsed;
}

const listTerminals = (dataRoot, env) => orcaCli(dataRoot, env, ['terminal', 'list']).terminals ?? [];

// --- verdicts (pure) -----------------------------------------------------------

/**
 * steps: [{ state, event, expected, observed }] in the order the events were sent. Red names
 * "status step missing" for a step that never read back, "status sequence out of order" when
 * the observed statuses are the expected ones in another order.
 */
export function relayVerdict(label, steps) {
    const fails = [];
    const observed = steps.map((s) => s.observed ?? null);
    const expected = steps.map((s) => s.expected);
    if (steps.length !== HOOK_STATES.length) fails.push(`${label}: status step missing (${steps.length} of ${HOOK_STATES.length} steps observed)`);
    const sameSet = observed.every((o) => o !== null) && [...observed].sort().join() === [...expected].sort().join();
    if (sameSet && observed.join() !== expected.join()) {
        fails.push(`${label}: status sequence out of order: read ${observed.join(', ')}, expected ${expected.join(', ')}`);
        return fails;
    }
    for (const s of steps) {
        if (s.observed !== s.expected) fails.push(`${label}: status step missing: ${s.event} (${s.state}) did not read back as ${s.expected} within ${STATUS_WINDOW_MS} ms (last read ${s.observed ?? 'none'})`);
    }
    return fails;
}

/**
 * Stage A, PTY environment. obs: { envNames: [names] | null }; derived: derivePtyEnvNames().
 * Names only; values never enter the observation.
 */
export function ptyEnvVerdict(obs, derived) {
    if (!derived.hookNames.length) return ['stage A (PTY environment): source moved: the derived hook-name set is empty, so a match would prove nothing'];
    if (!obs.envNames) return ['stage A (PTY environment): no pane process was found under orcad\'s terminal daemon to read /proc/<pid>/environ from'];
    const fails = [];
    const names = new Set(obs.envNames);
    for (const n of derived.hookNames) if (!names.has(n)) fails.push(`stage A (PTY environment): hook name missing: ${n} is not in the pane process's environment`);
    if (derived.declared.includes(DELETION_KEY) && names.has(DELETION_KEY)) fails.push(`stage A (PTY environment): the deletion key ${DELETION_KEY} is present in the pane process's environment`);
    for (const n of derived.identityNames) if (!names.has(n)) fails.push(`stage A (PTY environment): pane identity name missing: ${n}`);
    return fails;
}

/** Stage A, relay. obs: { pane: { handle, paneKey, paneKeyFrom } | null, steps }. */
export function stageAVerdict(obs) {
    if (!obs.pane?.handle) return ['stage A (relay): terminal create returned no handle'];
    if (!obs.pane.paneKey) return ['stage A (relay): ORCA_PANE_KEY unavailable from a headless create (A6): neither the create result nor terminal show or list named the pane key'];
    return relayVerdict('stage A (relay)', obs.steps);
}

/**
 * Stage B. obs: { pane: { handle, tabId, worktreeId, leafId } | null, steps, stubOrca: { NAME: value },
 * endpoint, wrapperEnvNames: [names], stdout, marker, exitCode, paneClosed }.
 */
export function wrapperVerdict(obs) {
    if (!obs.pane) return [`stage B: no pane titled "${PANE_TITLE}" appeared for the repository after the launcher started`];
    const fails = [...relayVerdict('stage B', obs.steps)];
    const env = obs.stubOrca ?? {};
    if (!obs.wrapperEnvNames?.includes(PLANT_NAME)) fails.push(`stage B: instrument blind: ${PLANT_NAME} is not in the wrapper's own environment, so its absence in the stub would prove nothing`);
    else if (PLANT_NAME in env) fails.push(`stage B: the planted ORCA_ name leaked: ${PLANT_NAME} reached the stub claude`);
    const decoys = obs.decoys ?? DECOYS;
    const blind = Object.keys(decoys).filter((n) => !obs.wrapperEnvNames?.includes(n));
    if (blind.length) fails.push(`stage B: decoy instrument blind: ${blind.join(', ')} not in the wrapper's own environment, so the stub's identity proves nothing about an inherited one`);
    for (const [n, v] of Object.entries(decoys)) if (env[n] === v) fails.push(`stage B: a decoy reached the stub: ${n} carries the inherited decoy value, not the PowerBrowser pane's`);
    for (const n of ['ORCA_USER_DATA_PATH', 'ORCA_USER_DATA']) if (n in env) fails.push(`stage B: ${n} reached the stub claude (claude gets the pane identity and the endpoint only)`);
    if (!env.ORCA_PANE_KEY || !env.ORCA_PANE_KEY.includes(obs.pane.leafId)) fails.push(`stage B: ORCA_PANE_KEY missing from the stub or not the pane's (leaf ${obs.pane.leafId})`);
    if (env.ORCA_TAB_ID !== obs.pane.tabId) fails.push('stage B: ORCA_TAB_ID missing from the stub or not the pane\'s tab');
    if (env.ORCA_WORKTREE_ID !== obs.pane.worktreeId) fails.push('stage B: ORCA_WORKTREE_ID missing from the stub or not the pane\'s worktree');
    if (env.ORCA_AGENT_HOOK_ENDPOINT !== obs.endpoint) fails.push('stage B: ORCA_AGENT_HOOK_ENDPOINT missing from the stub or not <dataRoot>/agent-hooks/endpoint.env');
    if (obs.stdout !== `${obs.marker}\n`) fails.push(`stage B: the launcher's stdout differs from the stub's (${JSON.stringify(String(obs.stdout).slice(0, 120))})`);
    if (obs.exitCode !== STUB_EXIT) fails.push(`stage B: wrong exit code: the launcher returned ${obs.exitCode}, the stub exited ${STUB_EXIT}`);
    if (!obs.paneClosed) fails.push('stage B: pane not closed: it was still in terminal list 10 s after the stub exited');
    return fails;
}

/** Degrade. obs: { stubRan, exitCode, logLines: [lines], newPanes }. */
export function degradeVerdict(obs) {
    const fails = [];
    if (!obs.stubRan) fails.push('degrade: the stub claude did not run through the launcher without orcad-data-root');
    if (obs.exitCode !== STUB_EXIT) fails.push(`degrade: wrong exit code: the launcher returned ${obs.exitCode}, the stub exited ${STUB_EXIT}`);
    if (obs.logLines.length !== 1 || !/orcad-data-root/.test(obs.logLines[0] ?? '')) fails.push(`degrade: degrade log line missing: claude-wrapper.log holds ${obs.logLines.length} line(s), expected one naming the orcad-data-root step`);
    if (obs.newPanes > 0) fails.push(`degrade: degrade created a pane (${obs.newPanes} new pane(s) for the repository)`);
    return fails;
}

/** An import observation: { status, stdout, stderr, timedOut }. A started process keeps the loop alive past the window. */
export function importVerdict(obs) {
    if (obs.timedOut || obs.status !== 0 || obs.stdout || obs.stderr) {
        return [`side effect on import: importing ${SELF_REL} ${obs.timedOut ? `did not exit within ${IMPORT_WINDOW_MS / 1000} s (a started process or timer)` : `exited ${obs.status} with ${obs.stdout ? 'stdout' : ''}${obs.stdout && obs.stderr ? ' and ' : ''}${obs.stderr ? 'stderr' : ''} output`.trim()}`];
    }
    return [];
}

// --- static clauses -------------------------------------------------------------------

let ts = null;
function typescript(repoRoot) {
    ts ??= require(join(repoRoot, 'theia', 'node_modules', 'typescript'));
    return ts;
}

function walk(node, fn) { fn(node); ts.forEachChild(node, (c) => walk(c, fn)); }
const isProcessEnv = (n) => n && ts.isPropertyAccessExpression(n) && n.name.text === 'env' && ts.isIdentifier(n.expression) && n.expression.text === 'process';

/**
 * Every name read from process.env or from an alias of it (property, element or destructuring), excluding delete and
 * assignment targets (harness-static-browser-01). The source is bound with the TypeScript checker, so an alias is a
 * symbol, not a spelling: a parameter whose default is an env object (`main(argv, baseEnv = process.env)`), a variable
 * or assignment bound to one, an object spread of one (`{ ...process.env }`), an Object.assign(...) of one, a `??` or
 * `||` of one, and a parameter of a function declared in the same file that a call passes one to; closed to a fixpoint.
 */
function processEnvReads(file, text) {
    const host = ts.createCompilerHost({ allowJs: true, noLib: true, noResolve: true });
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
    const getSourceFile = host.getSourceFile;
    host.getSourceFile = (name, ...rest) => (name === file ? sf : getSourceFile(name, ...rest));
    const program = ts.createProgram([file], { allowJs: true, noLib: true, noResolve: true, types: [] }, host);
    const checker = program.getTypeChecker();
    const symbolOf = (n) => { const sym = checker.getSymbolAtLocation(n); return sym && sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym; };
    const aliases = new Set();
    const isEnv = (e) => {
        if (!e) return false;
        if (ts.isParenthesizedExpression(e) || ts.isAsExpression?.(e) || ts.isNonNullExpression?.(e)) return isEnv(e.expression);
        if (isProcessEnv(e)) return true;
        if (ts.isIdentifier(e)) { const sym = symbolOf(e); return !!sym && aliases.has(sym); }
        if (ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind)) return isEnv(e.left) || isEnv(e.right);
        if (ts.isConditionalExpression(e)) return isEnv(e.whenTrue) || isEnv(e.whenFalse);
        if (ts.isObjectLiteralExpression(e)) return e.properties.some((p) => ts.isSpreadAssignment(p) && isEnv(p.expression));
        if (ts.isCallExpression(e) && e.expression.getText(sf) === 'Object.assign') return e.arguments.some(isEnv);
        return false;
    };
    const taint = (nameNode) => { const sym = nameNode && symbolOf(nameNode); if (sym && !aliases.has(sym)) { aliases.add(sym); return true; } return false; };
    for (let grew = true; grew;) {
        grew = false;
        walk(sf, (n) => {
            if ((ts.isParameter(n) || ts.isVariableDeclaration(n)) && ts.isIdentifier(n.name) && n.initializer && isEnv(n.initializer)) grew = taint(n.name) || grew;
            if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left) && isEnv(n.right)) grew = taint(n.left) || grew;
            if (ts.isCallExpression(n)) {
                const decl = symbolOf(n.expression)?.valueDeclaration;
                const fn = decl && (ts.isFunctionDeclaration(decl) || ts.isFunctionExpression(decl) || ts.isArrowFunction(decl) ? decl
                    : ts.isVariableDeclaration(decl) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) ? decl.initializer : null);
                if (fn) n.arguments.forEach((a, i) => { const param = fn.parameters[i]; if (param && ts.isIdentifier(param.name) && isEnv(a)) grew = taint(param.name) || grew; });
            }
        });
    }
    const out = [];
    walk(sf, (n) => {
        let name = null;
        if (ts.isPropertyAccessExpression(n) && isEnv(n.expression)) name = n.name.text;
        else if (ts.isElementAccessExpression(n) && isEnv(n.expression) && ts.isStringLiteralLike(n.argumentExpression)) name = n.argumentExpression.text;
        else if ((ts.isVariableDeclaration(n) || ts.isParameter(n)) && n.initializer && isEnv(n.initializer) && ts.isObjectBindingPattern(n.name)) {
            for (const el of n.name.elements) out.push((el.propertyName ?? el.name).getText(sf));
            return;
        }
        if (!name) return;
        const p = n.parent;
        if (ts.isDeleteExpression(p)) return;
        if (ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind === ts.SyntaxKind.EqualsToken) return;
        out.push(name);
    });
    return out;
}

function calls(sf) {
    const out = [];
    walk(sf, (n) => {
        if (!ts.isCallExpression(n)) return;
        const e = n.expression;
        if (ts.isPropertyAccessExpression(e)) out.push({ method: e.name.text, receiver: e.expression.getText(sf), args: n.arguments.map((a) => a.getText(sf)) });
        else if (ts.isIdentifier(e)) out.push({ method: e.text, receiver: null, args: n.arguments.map((a) => a.getText(sf)) });
    });
    return out;
}

function agentSources(root) {
    const out = [];
    const visit = (dir) => {
        for (const ent of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, ent.name);
            if (ent.isDirectory()) visit(p);
            else if (/\.(ts|mjs)$/.test(ent.name) && !ent.name.endsWith('.d.ts')) out.push(p);
        }
    };
    for (const sub of ['src', 'bin']) if (existsSync(join(root, AGENTS_REL, sub))) visit(join(root, AGENTS_REL, sub));
    return out;
}

/** The static clauses over the orca-agents sources under `root`; red lines naming each drift. */
export function staticVerdict(root, repoRoot = REPO_ROOT) {
    typescript(repoRoot);
    const parse = (rel) => {
        const text = read(join(root, rel));
        return text === null ? null : ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
    };
    const fails = [];
    const forbidden = new Set(['ORCA_USER_DATA', 'ORCA_USER_DATA_PATH', ...derivePtyEnvNames(join(repoRoot, 'orca')).identityNames, 'ORCA_PANE_KEY', 'ORCA_TAB_ID', 'ORCA_WORKTREE_ID']);
    const wrapper = parse(WRAPPER_REL);
    if (!wrapper) fails.push(`static: ${WRAPPER_REL} is missing`);
    else {
        for (const n of processEnvReads(join(root, WRAPPER_REL), wrapper.text)) if (forbidden.has(n)) fails.push(`static: the wrapper source reads ${n} from process.env or an alias of it (the data root and the pane identity come from the bridge directory and the CLI)`);
        let stdoutWrite = false;
        walk(wrapper, (n) => {
            if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'process' && n.name.text === 'stdout') stdoutWrite = true;
            if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'console') stdoutWrite = true;
        });
        if (stdoutWrite) fails.push('static: a stdout write in the wrapper source (process.stdout or console): claude\'s protocol stream must pass through untouched');
    }
    const frontend = parse(FRONTEND_REL);
    if (!frontend || !calls(frontend).some((c) => c.method === 'registerOverride' && c.args[0] === 'CLAUDE_PROCESS_WRAPPER_PREFERENCE')) {
        fails.push('static: registerOverride removed: the frontend module registers no default for CLAUDE_PROCESS_WRAPPER_PREFERENCE');
    }
    const backend = parse(BACKEND_REL);
    if (!backend) fails.push(`static: ${BACKEND_REL} is missing`);
    else {
        const bc = calls(backend);
        if (!bc.some((c) => c.method === 'writeLauncher')) fails.push('static: the backend never calls writeLauncher');
        let readsEnv = false;
        let usesPbEnv = false;
        walk(backend, (n) => {
            if (isProcessEnv(n)) readsEnv = true;
            if (ts.isIdentifier(n) && n.text === 'POWERBROWSER_ENV' && !ts.isImportSpecifier(n.parent)) usesPbEnv = true;
        });
        if (readsEnv) fails.push('static: the backend reads process.env; the bridge directory comes from POWERBROWSER_ENV');
        if (!usesPbEnv) fails.push('static: the backend does not read POWERBROWSER_ENV');
    }
    for (const file of agentSources(root)) {
        const rel = file.slice(root.length + 1);
        const text = readFileSync(file, 'utf8');
        if (/settings\.json/.test(text)) fails.push(`static: ${rel} names a settings.json file`);
        const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
        for (const c of calls(sf)) {
            if (/^(set|updateValue|setPreference)$/.test(c.method) && /preference/i.test(c.receiver ?? '')) fails.push(`static: ${rel} calls a preference setter (${c.receiver}.${c.method})`);
        }
    }
    return fails;
}

/** Imports this module in a child Node and observes it: exit, output, and whether it outlived the window. */
export function observeImport(file = fileURLToPath(import.meta.url), nodeBin = process.execPath) {
    const r = spawnSync(nodeBin, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(file).href)});`],
        { encoding: 'utf8', timeout: IMPORT_WINDOW_MS, env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut: r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM' };
}

// --- the stub claude -------------------------------------------------------------

/** A Node stand-in for claude: records itself, prints a marker, runs hook steps on cue, exits as configured. */
const STUB = (nodeBin) => `#!${nodeBin}
// Stub claude for ${SELF_REL}. Config: <this file>.json.
const { spawnSync } = require('child_process');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.argv[1] + '.json', 'utf8'));
const orca = {};
for (const [k, v] of Object.entries(process.env)) if (k.startsWith('ORCA_')) orca[k] = v;
fs.writeFileSync(cfg.report, JSON.stringify({ pid: process.pid, argv: process.argv.slice(2), orca }));
if (cfg.marker) process.stdout.write(cfg.marker + '\\n');
const wait = (f) => { while (!fs.existsSync(f)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); };
cfg.steps.forEach((step, i) => {
  wait(cfg.dir + '/go-' + i);
  spawnSync('/bin/sh', ['-c', step.command], { input: JSON.stringify(step.payload), stdio: ['pipe', 'ignore', 'ignore'], env: process.env, timeout: 20000 });
  fs.writeFileSync(cfg.dir + '/ran-' + i, '');
});
if (cfg.holdForRelease) wait(cfg.dir + '/release');
process.exit(cfg.exitCode);
`;

function writeStub(path, nodeBin, cfg) {
    writeFileSync(path, STUB(nodeBin), { mode: 0o755 });
    writeFileSync(`${path}.json`, JSON.stringify(cfg));
    mkdirSync(cfg.dir, { recursive: true });
}

/** The synthetic Claude hook payload for one event. */
function payload(event, cwd, base) {
    return { hook_event_name: event, session_id: SYNTHETIC_SESSION, cwd, transcript_path: join(base, 'transcript.jsonl'), permission_mode: 'default',
        prompt: 'synthetic prompt', tool_name: 'Bash', tool_input: { command: 'true' } };
}

async function waitFor(fn, timeoutMs, everyMs = 100) {
    const until = Date.now() + timeoutMs;
    for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() >= until) return null;
        await sleep(everyMs);
    }
}

/** Sends step i to a stub and polls the pane's status until it equals the expected one or 5 s pass. */
async function driveStep(ctx, dir, i, handle, expected) {
    writeFileSync(join(dir, `go-${i}`), '');
    if (!(await waitFor(() => existsSync(join(dir, `ran-${i}`)), 25000))) return { observed: null, raw: null };
    let last = null;
    const got = await waitFor(async () => { last = await readAgentStatus(ctx.orcaDir, ctx.dataRoot, handle); return last?.status === expected; }, STATUS_WINDOW_MS, 150);
    return { observed: got ? expected : (last?.status ?? null), raw: last };
}

const readJson = (path) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };

function writeBridge(ctx, name, withDataRoot) {
    const bridge = join(ctx.base, name);
    mkdirSync(bridge, { mode: 0o700 });
    if (withDataRoot) writeFileSync(join(bridge, 'orcad-data-root'), `${ctx.dataRoot}\n`, { mode: 0o600 });
    const { launcherText } = require(join(ctx.repoRoot, LAUNCHER_LIB_REL));
    const launcher = join(bridge, 'claude-wrapper');
    writeFileSync(launcher, launcherText({ nodePath: ctx.nodeBin, wrapperPath: join(ctx.repoRoot, WRAPPER_REL), bridgeDir: bridge }), { mode: 0o700 });
    return { bridge, launcher };
}

// --- stages -----------------------------------------------------------------------

/** The names (never values) in the environment of the pane process running `sleep 600` under orcad's tree. */
function paneEnvNames(roots) {
    for (const pid of descendants(ppidMap(), roots)) {
        const cmd = read(`/proc/${pid}/cmdline`);
        if (cmd === 'sleep\u0000600\u0000') return (read(`/proc/${pid}/environ`) ?? '').split('\0').filter(Boolean).map((kv) => kv.slice(0, kv.indexOf('=')));
    }
    return null;
}

async function stageA(ctx) {
    const { base, home, dataRoot, repo, nodeBin, plan, env } = ctx;
    const created = orcaCli(dataRoot, env, ['terminal', 'create', '--worktree', `path:${repo}`, '--title', RELAY_TITLE, '--command', 'sleep 600']);
    const c = created?.terminal ?? created;
    const pane = { handle: c?.handle ?? null, paneKey: c?.paneKey ?? null, tabId: c?.tabId ?? null, worktreeId: c?.worktreeId ?? null, paneKeyFrom: c?.paneKey ? 'create' : null };
    if (!pane.handle) return { pane: null, steps: [], envNames: null };
    ctx.relayHandle = pane.handle;
    if (!pane.paneKey) {
        try {
            const s = orcaCli(dataRoot, env, ['terminal', 'show', '--terminal', pane.handle]);
            const t = s?.terminal ?? s;
            pane.paneKey = t?.paneKey ?? t?.recordedPaneKey ?? null;
            if (pane.paneKey) pane.paneKeyFrom = 'show';
        } catch { /* list next */ }
    }
    const row = listTerminals(dataRoot, env).find((t) => t.handle === pane.handle);
    if (!pane.paneKey && row?.recordedPaneKey) { pane.paneKey = row.recordedPaneKey; pane.paneKeyFrom = 'list'; }
    pane.tabId ??= row?.tabId ?? null;
    pane.worktreeId ??= row?.worktreeId ?? null;

    const envNames = await waitFor(() => paneEnvNames(ctx.roots), 15000, 200);
    if (!pane.paneKey) return { pane, steps: [], envNames };

    const dir = join(base, 'steps-a');
    const stub = join(base, 'stub-a');
    writeStub(stub, nodeBin, { report: join(base, 'report-a.json'), marker: null, dir, holdForRelease: true, exitCode: 0,
        steps: plan.map((p) => ({ command: p.command, payload: payload(p.event, repo, base) })) });
    const child = spawn(stub, [], { cwd: repo, stdio: 'ignore', env: { PATH: process.env.PATH ?? '', HOME: home, ORCA_PANE_KEY: pane.paneKey,
        ORCA_TAB_ID: pane.tabId ?? '', ORCA_WORKTREE_ID: pane.worktreeId ?? '', ORCA_AGENT_HOOK_ENDPOINT: join(dataRoot, 'agent-hooks', 'endpoint.env') } });
    ctx.track(child.pid);
    const exited = new Promise((r) => child.once('exit', r));
    const steps = [];
    let sessionSeen = false;
    for (const [i, p] of plan.entries()) {
        const r = await driveStep(ctx, dir, i, pane.handle, p.expected);
        if (JSON.stringify(r.raw ?? {}).includes(SYNTHETIC_SESSION)) sessionSeen = true;
        steps.push({ state: p.state, event: p.event, expected: p.expected, observed: r.observed });
    }
    writeFileSync(join(dir, 'release'), '');
    await Promise.race([exited, sleep(10000)]);
    try { orcaCli(dataRoot, env, ['terminal', 'close', '--terminal', pane.handle]); } catch { /* teardown kills the tree */ }
    return { pane, steps, envNames, sessionSeen };
}

async function stageB(ctx) {
    const { base, home, dataRoot, repo, nodeBin, plan, env } = ctx;
    const { launcher } = writeBridge(ctx, 'b1', true);
    const dir = join(base, 'steps-b');
    const stub = join(base, 'stub-b');
    const marker = 'pb-stub-marker-63';
    writeStub(stub, nodeBin, { report: join(base, 'report-b.json'), marker, dir, holdForRelease: true, exitCode: STUB_EXIT,
        steps: plan.map((p) => ({ command: p.command, payload: payload(p.event, repo, base) })) });

    const before = new Set(listTerminals(dataRoot, env).map((t) => t.handle));
    // The launcher inherits a decoy Orca identity, as from a shell inside desktop Orca: the pane must still appear in
    // PowerBrowser's data root, and the stub must get that pane's identity, never a decoy value.
    const decoyRoot = join(base, 'decoy-data');
    mkdirSync(decoyRoot, { mode: 0o700 });
    const decoys = { ...DECOYS, ORCA_USER_DATA_PATH: decoyRoot, ORCA_USER_DATA: decoyRoot };
    const child = spawn(launcher, [stub, '--print', 'hello'], { cwd: repo, env: { PATH: process.env.PATH ?? '', HOME: home, [PLANT_NAME]: '1', ...decoys }, stdio: ['ignore', 'pipe', 'pipe'] });
    ctx.track(child.pid);
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', () => { /* the wrapper writes nothing; claude's stderr is the stub's, also nothing */ });
    let exitCode = null;
    const exited = new Promise((r) => child.once('exit', (code, sig) => { exitCode = sig ? `signal ${sig}` : code; r(); }));

    const report = await waitFor(() => readJson(join(base, 'report-b.json')), 30000);
    const wrapperEnvNames = (read(`/proc/${child.pid}/environ`) ?? '').split('\0').map((kv) => kv.split('=')[0]);
    if (report?.pid) ctx.track(report.pid);
    const row = await waitFor(() => listTerminals(dataRoot, env).find((t) => !before.has(t.handle) && t.title === PANE_TITLE && t.worktreePath === repo), 15000);
    const pane = row ? { handle: row.handle, tabId: row.tabId, worktreeId: row.worktreeId, leafId: row.leafId } : null;
    const steps = [];
    if (pane && report) {
        for (const [i, p] of plan.entries()) {
            const r = await driveStep(ctx, dir, i, pane.handle, p.expected);
            steps.push({ state: p.state, event: p.event, expected: p.expected, observed: r.observed });
        }
    }
    writeFileSync(join(dir, 'release'), '');
    await Promise.race([exited, sleep(30000)]);
    const paneClosed = pane ? Boolean(await waitFor(() => !listTerminals(dataRoot, env).some((t) => t.handle === pane.handle), 10000, 250)) : false;
    return {
        pane, steps, stubOrca: report?.orca ?? {}, endpoint: join(dataRoot, 'agent-hooks', 'endpoint.env'), wrapperEnvNames, decoys,
        stdout, marker, exitCode, paneClosed, stubArgv: report?.argv ?? null,
    };
}

async function stageDegrade(ctx) {
    const { base, home, dataRoot, repo, nodeBin, env } = ctx;
    const { bridge, launcher } = writeBridge(ctx, 'b2', false);
    const stub = join(base, 'stub-d');
    writeStub(stub, nodeBin, { report: join(base, 'report-d.json'), marker: null, dir: join(base, 'steps-d'), holdForRelease: false, exitCode: STUB_EXIT, steps: [] });
    const before = new Set(listTerminals(dataRoot, env).map((t) => t.handle));
    const child = spawn(launcher, [stub], { cwd: repo, env: { PATH: process.env.PATH ?? '', HOME: home }, stdio: 'ignore' });
    ctx.track(child.pid);
    const exitCode = await Promise.race([new Promise((r) => child.once('exit', (code, sig) => r(sig ? `signal ${sig}` : code))), sleep(30000).then(() => 'no exit within 30 s')]);
    const logLines = (read(join(bridge, 'claude-wrapper.log')) ?? '').split('\n').filter(Boolean);
    const newPanes = listTerminals(dataRoot, env).filter((t) => !before.has(t.handle) && t.worktreePath === repo).length;
    return { stubRan: Boolean(readJson(join(base, 'report-d.json'))), exitCode, logLines, newPanes };
}

// --- the run -------------------------------------------------------------------------

async function startOrcad(ctx) {
    const { nodeBin, orcaDir, home, dataRoot } = ctx;
    const env = OrcaEnv.buildOrcadEnv((n) => ({ PATH: process.env.PATH ?? '', HOME: home })[n], { dataRoot, orcaVersion: orcaVersionFromPins(ctx.repoRoot), claudeAgentSdkDir: '' });
    const port = await freePort(OrcaEnv);
    const lines = [];
    const sink = OrcaEnv.createOutputSink({ pushLog: (l) => { lines.push(l); if (lines.length > 200) lines.shift(); } });
    const child = spawn(nodeBin, OrcaEnv.buildOrcadArgs({ orcadMain: join(orcaDir, 'out', 'orcad', 'orcad.js'), port, webClientRoot: join(orcaDir, 'out', 'web') }),
        { cwd: dataRoot, env: liveEnv(env), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    ctx.track(child.pid);
    child.stdout.on('data', (d) => sink.onStdout(String(d)));
    child.stderr.on('data', (d) => sink.onStderr(String(d)));
    let exited = null;
    child.once('exit', (code, sig) => { exited = sig ?? `code ${code}`; });
    const ready = await Promise.race([sink.ready(), sleep(90000).then(() => null)]);
    if (!ready) throw new Error(`orcad ${exited ? `exited (${exited})` : 'printed no ready line within 90 s'}; stderr: ${lines.slice(-4).join(' | ').slice(-400)}`);
    ctx.orcad = child;
    ctx.roots = [child.pid];
    if (ready.daemonPid) { ctx.track(ready.daemonPid); ctx.roots.push(ready.daemonPid); }
}

/** Resolves { skip } | { fails, notes } | { pass, notes }. */
export async function run({ repoRoot = REPO_ROOT, orcaDir = join(repoRoot, 'orca'), nodeBin } = {}) {
    for (const [rel, next] of [['orca/out/orcad/orcad.js', 'nix develop .#orca --command bash scripts/build-orca.sh'], ['orca/out/cli/index.js', 'build the Orca CLI as 60-EXT01-RECORD.md records it'],
        [LAUNCHER_LIB_REL, `cd ${AGENTS_REL} && ../../node_modules/.bin/tsc -b (inside nix develop .#theia)`]]) {
        if (!existsSync(join(repoRoot, rel))) return { skip: `${rel} is absent (${next})` };
    }
    const ev = deriveClaudeHookEvents(orcaDir);
    const sm = deriveStatusMap(orcaDir);
    const sn = deriveHookScriptName(orcaDir);
    const pe = derivePtyEnvNames(orcaDir);
    const derivedFails = [...ev.fails, ...sm.fails, ...sn.fails, ...pe.fails];
    if (derivedFails.length) return { fails: derivedFails, notes: [] };
    const staticFails = staticVerdict(repoRoot, repoRoot);
    if (staticFails.length) return { fails: staticFails, notes: [] };

    const node = typeof nodeBin === 'function' ? await nodeBin() : nodeBin;
    const base = mkdtempSync(join(process.env.XDG_RUNTIME_DIR || tmpdir(), 'pb-ah-'));
    const tracked = [];
    const ctx = {
        repoRoot, orcaDir, nodeBin: node, base, home: join(base, 'h'), dataRoot: join(base, 'd'), repo: join(base, 'r'), roots: [],
        track: (pid) => { if (Number.isInteger(pid) && pid > 0) tracked.push([pid, startTicks(pid)]); },
    };
    try {
        if (!OrcaEnv.socketPathFits(ctx.dataRoot)) return { fails: [`the scratch data root ${ctx.dataRoot} is too long for orcad's socket path; set XDG_RUNTIME_DIR to a short directory`], notes: [] };
        mkdirSync(ctx.home, { mode: 0o700 });
        mkdirSync(ctx.dataRoot, { mode: 0o700 });
        mkdirSync(ctx.repo);
        const gitEnv = { PATH: process.env.PATH ?? '', HOME: ctx.home, GIT_AUTHOR_NAME: 'pb', GIT_AUTHOR_EMAIL: 'pb@invalid', GIT_COMMITTER_NAME: 'pb', GIT_COMMITTER_EMAIL: 'pb@invalid' };
        for (const a of [['init', '-q'], ['add', 'README'], ['commit', '-qm', 'scratch']]) {
            if (a[0] === 'add') writeFileSync(join(ctx.repo, 'README'), 'scratch\n');
            execFileSync('git', a, { cwd: ctx.repo, env: gitEnv, stdio: 'ignore' });
        }
        await startOrcad(ctx);
        ctx.env = cliEnv(ctx.home, ctx.dataRoot);
        const script = join(ctx.home, '.orca', 'agent-hooks', sn.name);
        const settingsPath = join(ctx.home, '.claude', 'settings.json');
        const endpoint = join(ctx.dataRoot, 'agent-hooks', 'endpoint.env');
        const okFiles = await waitFor(() => existsSync(script) && existsSync(endpoint) && existsSync(settingsPath) && existsSync(join(ctx.dataRoot, 'cli', 'bin', 'orca')), 60000, 200);
        if (!okFiles) return { fails: [`orcad did not install ${sn.name}, its hook endpoint file, Claude's hooks or its CLI within 60 s under the scratch HOME and data root`], notes: [] };
        let settings = null;
        await waitFor(() => { try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); return HOOK_STATES.every((s) => settings.hooks?.[ev.events[s]]); } catch { return false; } }, 20000, 200);
        ctx.plan = [];
        for (const state of HOOK_STATES) {
            const event = ev.events[state];
            const command = settings?.hooks?.[event]?.flatMap((m) => m.hooks ?? []).find((h) => typeof h.command === 'string' && h.command.includes(sn.name))?.command;
            if (!command) return { fails: [`orcad installed no Claude hook for ${event} that runs ${sn.name} in the scratch HOME's Claude settings`], notes: [] };
            ctx.plan.push({ state, event, command, expected: sm.map[state] });
        }
        orcaCli(ctx.dataRoot, ctx.env, ['repo', 'add', '--path', ctx.repo]);

        const a = await stageA(ctx);
        const b = await stageB(ctx);
        const d = await stageDegrade(ctx);
        const fails = [...ptyEnvVerdict(a, pe), ...stageAVerdict(a), ...wrapperVerdict(b), ...degradeVerdict(d)];
        const notes = [
            `session id: ${a.sessionSeen ? 'a terminal.agentStatus read-back carried' : 'no terminal.agentStatus read-back carried'} the synthetic session id the hook payloads sent (P63-16); a resume id comes from Claude's side`,
            `pane key for a headless terminal create came from ${a.pane?.paneKeyFrom ?? 'nowhere'} (A6); the wrapper's placeholder command is cat (A4)`,
        ];
        if (fails.length) return { fails, notes };
        return { pass: { a, b, d, plan: ctx.plan, pe }, notes };
    } finally {
        await teardown(ctx, tracked);
        rmSync(base, { recursive: true, force: true });
    }
}

async function teardown(ctx, tracked) {
    const tree = [...descendants(ppidMap(), tracked.map(([p]) => p))].map((pid) => [pid, startTicks(pid)]);
    if (ctx.orcad) {
        const [, ticks] = tracked.find(([p]) => p === ctx.orcad.pid) ?? [];
        signalIdentity(ctx.orcad.pid, ticks ?? null, 'SIGTERM');
        await waitFor(() => startTicks(ctx.orcad.pid) === null, 15000, 200);
    }
    for (const [pid, ticks] of [...tracked, ...tree]) signalIdentity(pid, ticks, 'SIGTERM');
    await sleep(500);
    for (const [pid, ticks] of [...tracked, ...tree]) signalIdentity(pid, ticks, 'SIGKILL');
}

// --- self-test (quick, pure) -------------------------------------------------------

/** Fixture observations every verdict reads green on. */
function controlObservations() {
    const steps = [
        { state: 'working', event: 'UserPromptSubmit', expected: 'working', observed: 'working' },
        { state: 'waiting', event: 'PermissionRequest', expected: 'permission', observed: 'permission' },
        { state: 'done', event: 'Stop', expected: 'idle', observed: 'idle' },
    ];
    const derived = { declared: ['ORCA_AGENT_HOOK_PORT', 'ORCA_AGENT_HOOK_ENDPOINT', DELETION_KEY], hookNames: ['ORCA_AGENT_HOOK_PORT', 'ORCA_AGENT_HOOK_ENDPOINT'], identityNames: ['ORCA_PANE_KEY', 'ORCA_TAB_ID', 'ORCA_WORKTREE_ID'] };
    return {
        derived,
        ptyEnv: { envNames: ['PATH', 'HOME', 'ORCA_AGENT_HOOK_PORT', 'ORCA_AGENT_HOOK_ENDPOINT', 'ORCA_PANE_KEY', 'ORCA_TAB_ID', 'ORCA_WORKTREE_ID'] },
        a: { pane: { handle: 'h1', paneKey: 'tab-1:leaf-1', paneKeyFrom: 'create' }, steps: structuredClone(steps) },
        b: {
            pane: { handle: 'h2', tabId: 'tab-2', worktreeId: 'wt-1', leafId: 'leaf-2' }, steps: structuredClone(steps),
            stubOrca: { ORCA_PANE_KEY: 'tab-2:leaf-2', ORCA_TAB_ID: 'tab-2', ORCA_WORKTREE_ID: 'wt-1', ORCA_AGENT_HOOK_ENDPOINT: '/d/agent-hooks/endpoint.env' },
            endpoint: '/d/agent-hooks/endpoint.env', wrapperEnvNames: ['PATH', 'HOME', PLANT_NAME, ...Object.keys(DECOYS)], decoys: { ...DECOYS }, stdout: 'm\n', marker: 'm', exitCode: STUB_EXIT, paneClosed: true,
        },
        d: { stubRan: true, exitCode: STUB_EXIT, logLines: ['2026-11-10T00:00:00.000Z read orcad-data-root failed (ENOENT); running claude without an Orca pane'], newPanes: 0 },
        imp: { status: 0, stdout: '', stderr: '', timedOut: false },
    };
}

function allObservationFails(o) {
    return [...ptyEnvVerdict(o.ptyEnv, o.derived), ...stageAVerdict(o.a), ...wrapperVerdict(o.b), ...degradeVerdict(o.d), ...importVerdict(o.imp)];
}

const OBS_PLANTS = [
    ['a decoy reached the stub', (o) => { o.b.stubOrca.ORCA_PANE_KEY = DECOYS.ORCA_PANE_KEY; }],
    ['a decoy reached the stub', (o) => { o.b.stubOrca.ORCA_USER_DATA_PATH = DECOYS.ORCA_USER_DATA_PATH; }],
    ['decoy instrument blind', (o) => { o.b.wrapperEnvNames = o.b.wrapperEnvNames.filter((n) => n !== 'ORCA_WORKTREE_ID'); }],
    ['status sequence out of order', (o) => { o.b.steps[0].observed = 'idle'; o.b.steps[2].observed = 'working'; }],
    ['status step missing', (o) => { o.a.steps[1].observed = null; }],
    ['pane not closed', (o) => { o.b.paneClosed = false; }],
    ['wrong exit code', (o) => { o.b.exitCode = 0; }],
    ['ORCA_PANE_KEY missing', (o) => { delete o.b.stubOrca.ORCA_PANE_KEY; }],
    ['the planted ORCA_ name leaked', (o) => { o.b.stubOrca[PLANT_NAME] = '1'; }],
    ['instrument blind', (o) => { o.b.wrapperEnvNames = ['PATH']; }],
    ['stdout differs', (o) => { o.b.stdout = 'wrapper says hi\nm\n'; }],
    ['degrade created a pane', (o) => { o.d.newPanes = 1; }],
    ['degrade log line missing', (o) => { o.d.logLines = []; }],
    ['ORCA_PANE_KEY unavailable from a headless create (A6)', (o) => { o.a.pane.paneKey = null; }],
    ['hook name missing', (o) => { o.ptyEnv.envNames = o.ptyEnv.envNames.filter((n) => n !== 'ORCA_AGENT_HOOK_ENDPOINT'); }],
    [`deletion key ${DELETION_KEY} is present`, (o) => { o.ptyEnv.envNames.push(DELETION_KEY); }],
    ['source moved', (o) => { o.derived.hookNames = []; }],
    ['side effect on import', (o) => { o.imp.stdout = 'orca-agent-hooks: started\n'; }],
];

const SOURCE_PLANTS = [
    ['reads ORCA_USER_DATA_PATH from process.env', WRAPPER_REL, (t) => t.replace('export function parseWrapperArgs(argv) {', 'export function parseWrapperArgs(argv) {\n    const planted = process.env.ORCA_USER_DATA_PATH;')],
    // harness-static-browser-01: the forms the wrapper actually reads env through.
    ['reads ORCA_USER_DATA_PATH from process.env or an alias of it', WRAPPER_REL, (t) => t.replace('ORCA_USER_DATA: dataRoot, ORCA_USER_DATA_PATH: dataRoot };', 'ORCA_USER_DATA: baseEnv.ORCA_USER_DATA_PATH ?? dataRoot, ORCA_USER_DATA_PATH: dataRoot };')],
    ['reads ORCA_PANE_KEY from process.env or an alias of it', WRAPPER_REL, (t) => t.replace("    const { bridgeDir, claude, args } = parseWrapperArgs(argv);", "    const { bridgeDir, claude, args } = parseWrapperArgs(argv);\n    const inherited = baseEnv['ORCA_PANE_KEY'];")],
    ['reads ORCA_TAB_ID from process.env or an alias of it', WRAPPER_REL, (t) => t.replace("export function parseWrapperArgs(argv) {", "export function parseWrapperArgs(argv) {\n    const copy = { ...process.env };\n    const { ORCA_TAB_ID: tab } = copy;")],
    ['a stdout write in the wrapper source', WRAPPER_REL, (t) => t.replace('export function parseWrapperArgs(argv) {', 'export function parseWrapperArgs(argv) {\n    process.stdout.write("planted\\n");')],
    ['registerOverride removed', FRONTEND_REL, (t) => t.replace(/this\.schema\.registerOverride\([^;]*;/, 'undefined;')],
    ['calls a preference setter', FRONTEND_REL, (t) => t.replace('onStop(): void {', 'onStop(): void {\n        (this as any).preferenceService.set(CLAUDE_PROCESS_WRAPPER_PREFERENCE, "x");')],
    ['names a settings.json file', BACKEND_REL, (t) => t.replace('const LOG_PREFIX', "const PLANTED = 'settings.json';\nconst LOG_PREFIX")],
    ['the backend reads process.env', BACKEND_REL, (t) => t.replace('const dir = POWERBROWSER_ENV.POWERBROWSER_ORCA_BRIDGE_DIR;', 'const dir = process.env.POWERBROWSER_ORCA_BRIDGE_DIR;')],
];

export function selfTest(repoRoot = REPO_ROOT) {
    const lines = [];
    let failures = 0;
    const check = (label, fails, needle) => {
        const ok = needle === null ? fails.length === 0 : fails.some((f) => f.includes(needle));
        if (ok) lines.push(`  ok ${label}`);
        else { failures++; lines.push(`  FAIL ${label}: ${needle === null ? `control went red: ${fails.join(' | ')}` : `stayed green or did not name "${needle}" (${fails.join(' | ') || 'no fails'})`}`); }
    };
    check('control: fixture observations green', allObservationFails(controlObservations()), null);
    for (const [needle, plant] of OBS_PLANTS) {
        const o = controlObservations();
        plant(o);
        check(`plant: ${needle}`, allObservationFails(o), needle);
    }
    check('control: importing the real module prints nothing and starts nothing', importVerdict(observeImport()), null);

    const skips = [];
    try { typescript(repoRoot); } catch {
        skips.push('theia/node_modules/typescript is not installed, so the static-clause plants did not run. Next step: run the audited yarn install in theia/');
        return { lines, failures, planted: OBS_PLANTS.length, skips };
    }
    const tmp = mkdtempSync(join(tmpdir(), 'pb-ah-self-'));
    try {
        const copy = () => {
            const dir = mkdtempSync(join(tmp, 'src-'));
            for (const sub of ['src', 'bin']) cpSync(join(repoRoot, AGENTS_REL, sub), join(dir, AGENTS_REL, sub), { recursive: true });
            return dir;
        };
        check('control: static clauses green on a copy of the tracked sources', staticVerdict(copy(), repoRoot), null);
        for (const [needle, rel, plant] of SOURCE_PLANTS) {
            const dir = copy();
            const before = readFileSync(join(dir, rel), 'utf8');
            const after = plant(before);
            if (after === before) { failures++; lines.push(`  FAIL plant: ${needle}: the plant did not apply to ${rel} (the source moved; update the plant)`); continue; }
            writeFileSync(join(dir, rel), after);
            check(`plant: ${needle}`, staticVerdict(dir, repoRoot), needle);
        }
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
    const planted = OBS_PLANTS.length + SOURCE_PLANTS.length;
    return { lines, failures, planted, skips };
}

// --- entry ---------------------------------------------------------------------------

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args[0] === '--self-test' && args.length === 1) {
        const { lines, failures, planted, skips } = selfTest();
        for (const l of lines) console.log(l);
        if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); process.exit(1); }
        if (skips.length) { console.log(skipLine(`${NAME} self-test`, skips.join('; '))); process.exit(SKIP_EXIT); }
        console.log(`${NAME} self-test: PASS -- ${planted} planted faults each went red naming the drift`);
        process.exit(0);
    }
    if (args.length) {
        console.error(`${NAME}: FAIL -- unknown argument '${args[0]}' (usage: node ${SELF_REL} [--self-test])`);
        console.error(`  Next step: run: node ${SELF_REL}`);
        process.exit(2);
    }
    scrubOwnOrcaEnv();
    const restore = installOutputRedaction([]);
    let code = 0;
    try {
        const r = await run({ nodeBin: async () => (await ensurePbNode()).path });
        if (r.skip) { console.log(skipLine(NAME, r.skip)); code = SKIP_EXIT; } else {
            for (const n of r.notes ?? []) console.log(`${NAME}: note -- ${n}`);
            if (r.fails) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); code = 1; }
            else {
                const { b, plan, pe } = r.pass;
                const seq = plan.map((p) => `${p.event}->${p.expected}`).join(', ');
                console.log(`${NAME}: PASS -- stage B (wrapper): the launcher as the backend writes it ran the wrapper with a stub claude; a "${PANE_TITLE}" pane read back ${seq}; the stub got the pane identity and endpoint, not ${PLANT_NAME} and none of the ${Object.keys(DECOYS).length} inherited decoy identity values (all present in the wrapper's own environment); stdout was the stub's marker only; the pane closed and the exit code ${b.exitCode} passed through; stage A (PTY environment): the CLI-created pane's process carries the ${pe.hookNames.length} derived hook names and the pane identity, not ${DELETION_KEY}; stage A (relay): Orca's managed hook script moved the pane through ${seq} in order; degrade stage: without orcad-data-root the stub ran and exited ${STUB_EXIT}, one log line, no pane; static clauses: green`);
            }
        }
    } catch (e) {
        console.error(`${NAME}: FAIL -- ${OrcaEnv.redact(String(e?.message ?? e))}`);
        code = 1;
    } finally {
        restore();
    }
    process.exit(code);
}
