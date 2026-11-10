#!/usr/bin/env node
// scripts/verify-orca-agent-hooks.mjs
//
// Phase 63 (TERM-02 relay, EXT-02 PowerBrowser half; P63-15 as amended by
// P63-26, P63-16, P63-17, P63-18): agents report their status into
// PowerBrowser's orcad through Orca's own managed hook script, and a session
// started through PowerBrowser's claude wrapper appears in Orca as a pane with
// live status.
//
// One built orcad is started hermetically and driven through Orca's own CLI:
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
// "source moved" is red when any of them cannot be found.
//
// Scratch HOME (research Pitfall 6): Orca's managed hook scripts live in the
// user-wide <HOME>/.orca/agent-hooks and orcad writes Claude's hooks into
// <HOME>/.claude/settings.json, so orcad runs with a scratch HOME and never
// touches the user's ~/.orca or ~/.claude. No model turn is used: the stub
// stands in for claude.
//
// Provider independence: orcad runs without ORCA_EXTERNAL_PTY_ENDPOINT. The
// hook relay does not depend on where PTYs live; the environment half of
// TERM-02 through the Theia bridge is orca-pty-provider-live (lane p63-01) and
// the integrated real-agent run is orca-agent-status-live.
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
// no browser, no display). Prints a named SKIP and exits 0 when the build
// outputs are absent.
//
// Usage:
//   node scripts/verify-orca-agent-hooks.mjs

import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as OrcaEnv from '../powerbrowser/shell/OrcaEnv.sys.mjs';
import { descendants, ensurePbNode, installOutputRedaction, orcaVersionFromPins } from './lib/orca-run.mjs';
import { freePort, ppidMap, signalIdentity, startTicks } from './verify-orca-hidden-electron.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-agent-hooks';
const SELF_REL = 'scripts/verify-orca-agent-hooks.mjs';
const require = createRequire(import.meta.url);

export const CLAUDE_EVENTS_REL = 'src/shared/agent-hook-listener/providers/claude-events.ts';
export const STATUS_PROJECTION_REL = 'src/main/runtime/runtime-worktree-status-projection.ts';
export const HOOK_SETTINGS_REL = 'src/main/claude/hook-settings.ts';
export const AGENTS_REL = 'theia/extensions/orca-agents';
export const LAUNCHER_LIB_REL = `${AGENTS_REL}/lib/node/claude-wrapper-launcher.js`;
export const WRAPPER_REL = `${AGENTS_REL}/bin/claude-wrapper.mjs`;
export const HOOK_STATES = ['working', 'waiting', 'done'];
export const PLANT_NAME = 'ORCA_PLANT_63';
export const PANE_TITLE = 'Claude Code';
export const STUB_EXIT = 7;
const SYNTHETIC_SESSION = 'pb-synthetic-session-63';
const STATUS_WINDOW_MS = 5000;

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
        out = execFileSync(join(dataRoot, 'cli', 'bin', 'orca'), [...args, '--json'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout });
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
 * Stage B. obs: { pane: { handle, tabId, worktreeId, leafId } | null, steps, stubOrca: { NAME: value },
 * endpoint, wrapperEnvNames: [names], stdout, marker, exitCode, paneClosed }.
 */
export function wrapperVerdict(obs) {
    if (!obs.pane) return [`stage B: no pane titled "${PANE_TITLE}" appeared for the repository after the launcher started`];
    const fails = [...relayVerdict('stage B', obs.steps)];
    const env = obs.stubOrca ?? {};
    if (!obs.wrapperEnvNames?.includes(PLANT_NAME)) fails.push(`stage B: instrument blind: ${PLANT_NAME} is not in the wrapper's own environment, so its absence in the stub would prove nothing`);
    else if (PLANT_NAME in env) fails.push(`stage B: the planted ORCA_ name leaked: ${PLANT_NAME} reached the stub claude`);
    if (!env.ORCA_PANE_KEY || !env.ORCA_PANE_KEY.includes(obs.pane.leafId)) fails.push(`stage B: ORCA_PANE_KEY missing from the stub or not the pane's (leaf ${obs.pane.leafId})`);
    if (env.ORCA_TAB_ID !== obs.pane.tabId) fails.push('stage B: ORCA_TAB_ID missing from the stub or not the pane\'s tab');
    if (env.ORCA_WORKTREE_ID !== obs.pane.worktreeId) fails.push('stage B: ORCA_WORKTREE_ID missing from the stub or not the pane\'s worktree');
    if (env.ORCA_AGENT_HOOK_ENDPOINT !== obs.endpoint) fails.push('stage B: ORCA_AGENT_HOOK_ENDPOINT missing from the stub or not <dataRoot>/agent-hooks/endpoint.env');
    if (obs.stdout !== `${obs.marker}\n`) fails.push(`stage B: the launcher's stdout differs from the stub's (${JSON.stringify(String(obs.stdout).slice(0, 120))})`);
    if (obs.exitCode !== STUB_EXIT) fails.push(`stage B: wrong exit code: the launcher returned ${obs.exitCode}, the stub exited ${STUB_EXIT}`);
    if (!obs.paneClosed) fails.push('stage B: pane not closed: it was still in terminal list 10 s after the stub exited');
    return fails;
}

// --- the stub claude -------------------------------------------------------------

/** A Node stand-in for claude: records itself, prints a marker, runs hook steps on cue, exits 7. */
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

// --- stages -----------------------------------------------------------------------

async function stageB(ctx) {
    const { base, home, dataRoot, repo, nodeBin, plan, env } = ctx;
    const bridge = join(base, 'b1');
    mkdirSync(bridge, { mode: 0o700 });
    writeFileSync(join(bridge, 'orcad-data-root'), `${dataRoot}\n`, { mode: 0o600 });
    const { launcherText } = require(join(ctx.repoRoot, LAUNCHER_LIB_REL));
    const launcher = join(bridge, 'claude-wrapper');
    writeFileSync(launcher, launcherText({ nodePath: nodeBin, wrapperPath: join(ctx.repoRoot, WRAPPER_REL), bridgeDir: bridge }), { mode: 0o700 });

    const dir = join(base, 'steps-b');
    const stub = join(base, 'stub-b');
    const marker = 'pb-stub-marker-63';
    writeStub(stub, nodeBin, { report: join(base, 'report-b.json'), marker, dir, holdForRelease: true, exitCode: STUB_EXIT,
        steps: plan.map((p) => ({ command: p.command, payload: payload(p.event, repo, base) })) });

    const before = new Set(listTerminals(dataRoot, env).map((t) => t.handle));
    const child = spawn(launcher, [stub, '--print', 'hello'], { cwd: repo, env: { PATH: process.env.PATH ?? '', HOME: home, [PLANT_NAME]: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    ctx.track(child.pid);
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', () => { /* the wrapper writes nothing; claude's stderr is the stub's, also nothing */ });
    let exitCode = null;
    const exited = new Promise((r) => child.once('exit', (code, sig) => { exitCode = sig ? `signal ${sig}` : code; r(); }));

    const report = await waitFor(() => { try { return JSON.parse(readFileSync(join(base, 'report-b.json'), 'utf8')); } catch { return null; } }, 30000);
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
        pane, steps, stubOrca: report?.orca ?? {}, endpoint: join(dataRoot, 'agent-hooks', 'endpoint.env'), wrapperEnvNames,
        stdout, marker, exitCode, paneClosed, stubArgv: report?.argv ?? null,
    };
}

// --- the run -------------------------------------------------------------------------

async function startOrcad(ctx) {
    const { nodeBin, orcaDir, home, dataRoot } = ctx;
    const env = OrcaEnv.buildOrcadEnv((n) => ({ PATH: process.env.PATH ?? '', HOME: home })[n], { dataRoot, orcaVersion: orcaVersionFromPins(ctx.repoRoot) });
    const port = await freePort(OrcaEnv);
    const lines = [];
    const sink = OrcaEnv.createOutputSink({ pushLog: (l) => { lines.push(l); if (lines.length > 200) lines.shift(); } });
    const child = spawn(nodeBin, OrcaEnv.buildOrcadArgs({ orcadMain: join(orcaDir, 'out', 'orcad', 'orcad.js'), port, webClientRoot: join(orcaDir, 'out', 'web') }),
        { cwd: dataRoot, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    ctx.track(child.pid);
    child.stdout.on('data', (d) => sink.onStdout(String(d)));
    child.stderr.on('data', (d) => sink.onStderr(String(d)));
    let exited = null;
    child.once('exit', (code, sig) => { exited = sig ?? `code ${code}`; });
    const ready = await Promise.race([sink.ready(), sleep(90000).then(() => null)]);
    if (!ready) throw new Error(`orcad ${exited ? `exited (${exited})` : 'printed no ready line within 90 s'}; stderr: ${lines.slice(-4).join(' | ').slice(-400)}`);
    ctx.orcad = child;
    if (ready.daemonPid) ctx.track(ready.daemonPid);
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
    const derivedFails = [...ev.fails, ...sm.fails, ...sn.fails];
    if (derivedFails.length) return { fails: derivedFails, notes: [] };

    const node = typeof nodeBin === 'function' ? await nodeBin() : nodeBin;
    const base = mkdtempSync(join(process.env.XDG_RUNTIME_DIR || tmpdir(), 'pb-ah-'));
    const tracked = [];
    const ctx = {
        repoRoot, orcaDir, nodeBin: node, base, home: join(base, 'h'), dataRoot: join(base, 'd'), repo: join(base, 'r'),
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

        const b = await stageB(ctx);
        const fails = wrapperVerdict(b);
        const notes = [];
        if (fails.length) return { fails, notes };
        return { pass: { b, plan: ctx.plan }, notes };
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

// --- entry ---------------------------------------------------------------------------

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const unknown = args[0];
    if (unknown !== undefined) {
        console.error(`${NAME}: FAIL -- unknown argument '${unknown}' (usage: node ${SELF_REL})`);
        console.error(`  Next step: run: node ${SELF_REL}`);
        process.exit(2);
    }
    scrubOwnOrcaEnv();
    const restore = installOutputRedaction([]);
    let code = 0;
    try {
        const r = await run({ nodeBin: async () => (await ensurePbNode()).path });
        if (r.skip) console.log(`${NAME}: SKIP -- ${r.skip}`);
        else {
            for (const n of r.notes ?? []) console.log(`${NAME}: note -- ${n}`);
            if (r.fails) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); code = 1; }
            else {
                const { b, plan } = r.pass;
                const seq = plan.map((p) => `${p.event}->${p.expected}`).join(', ');
                console.log(`${NAME}: PASS -- stage B (wrapper): the launcher as the backend writes it ran the wrapper with a stub claude; a "${PANE_TITLE}" pane read back ${seq} through Orca's managed hook script; the stub got the pane identity and endpoint and not ${PLANT_NAME} (present in the wrapper's own environment); stdout was the stub's marker only; the pane closed and the exit code ${b.exitCode} passed through`);
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
