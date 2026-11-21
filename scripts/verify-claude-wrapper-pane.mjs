#!/usr/bin/env node
// scripts/verify-claude-wrapper-pane.mjs
//
// claude-wrapper-pane (v1.7 audit-fix lane G4; items 63-WR-01, 63-WR-02, 63-WR-03,
// agents-extensions-01, -02, -03): the Claude Code process wrapper
// (theia/extensions/orca-agents/bin/claude-wrapper.mjs) never leaves an Orca pane behind, never
// holds claude's start for long on a slow orcad, and the orca-agents backend
// (src/node/orca-agents-backend-module.ts) registers no POSIX launcher on win32.
//
// The wrapper runs for real (node on the tree's file, or on a planted copy) against a fake Orca
// CLI at <data root>/cli/bin/orca that records every call, and a stub claude that records its
// start and exits 7. No orcad, no browser, no display.
//
// Clauses (the scenarios run in parallel):
//  S1 63-WR-01: create returns a handle and no pane key, show gives none, list fails: the pane is
//     closed, and claude still runs (unwrapped) and its exit code passes through.
//  S2 63-WR-02: list hangs: claude starts within MAX_START_DELAY_MS of the wrapper, and the pane
//     is closed.
//  S3 63-WR-02: create replies only after the deadline: claude starts within MAX_START_DELAY_MS,
//     and the pane that create made is closed before the wrapper exits.
//  S4 agents-extensions-01: SIGTERM while create is still running: claude never starts, the pane
//     is closed and the wrapper exits 143.
//  S6 63-WR-02: orcad makes the pane but the create CLI never hands back a handle (it fails after
//     the deadline, as when killed at its cap): claude starts within MAX_START_DELAY_MS, the sweep
//     closes the new "Claude Code" pane, and a pane listed before the create (another session's)
//     is left alone.
//  S5 control: a create with the full identity: claude gets ORCA_PANE_KEY and the endpoint, and
//     the pane is closed after claude exits.
//  W  63-WR-03: the wrapper's CLI and endpoint names on win32 equal the names Orca's own source
//     writes there (orcad-cli-launcher.ts, endpoint-publication.ts; derived, SKIP when orca/ is
//     not fetched), and stay orca and endpoint.env elsewhere.
//  B  agents-extensions-03: with a bridge directory set, the backend writes no launcher and offers
//     no wrapper path on win32, and does on this platform.
//
// Tier: quick (about ten seconds). SKIP when theia/node_modules/typescript is absent (clause B)
// or on win32. --self-test plants each pre-fix fault in a copy of the source and requires red
// naming the drift, then re-runs the control green.
//
// Usage:
//   node scripts/verify-claude-wrapper-pane.mjs
//   node scripts/verify-claude-wrapper-pane.mjs --self-test

import { spawn } from 'node:child_process';
import * as nodeFs from 'node:fs';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'claude-wrapper-pane';
const SELF_REL = 'scripts/verify-claude-wrapper-pane.mjs';
const TS_DIR = join(REPO_ROOT, 'theia', 'node_modules', 'typescript');
const REL = {
    wrapper: 'theia/extensions/orca-agents/bin/claude-wrapper.mjs',
    backend: 'theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts',
    orcaCliLauncher: 'orca/src/main/orcad/orcad-cli-launcher.ts',
    orcaEndpoint: 'orca/src/shared/agent-hook-listener/endpoint-publication.ts',
};
/** The requirement: a wedged orcad holds claude's start by a few seconds at most, never the old 20 s per call. */
const MAX_START_DELAY_MS = 8000;

let ts;

const FAKE_CLI = `#!${process.execPath}
const fs = require('fs');
const path = require('path');
const root = process.env.ORCA_USER_DATA;
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'fake.json'), 'utf8'));
const args = process.argv.slice(2);
const cmd = args[1];
fs.appendFileSync(path.join(root, 'calls.log'), cmd + '\\n');
const c = cfg[cmd] || {};
const reply = (result) => { process.stdout.write(JSON.stringify({ ok: true, result })); process.exit(0); };
setTimeout(() => {
    if (c.fail) process.exit(1);
    if (cmd === 'create') {
        const handle = 'h-' + process.pid;
        fs.appendFileSync(path.join(root, 'created.log'), handle + '\\n');
        const terminal = { handle, tabId: 'tab-1', worktreeId: 'wt-1' };
        if (c.paneKey !== false) terminal.paneKey = 'tab-1:leaf-1';
        // failAfterMs: orcad made the pane, but the CLI never hands its handle back (killed at its cap, or failed).
        if (c.failAfterMs) { setTimeout(() => process.exit(1), c.failAfterMs); return; }
        setTimeout(() => reply({ terminal }), c.replyDelayMs || 0);
        return;
    }
    if (cmd === 'close') { fs.appendFileSync(path.join(root, 'closed.log'), args[args.indexOf('--terminal') + 1] + '\\n'); reply({ closed: true }); return; }
    if (cmd === 'show') { reply({ terminal: {} }); return; }
    const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8').split('\\n').filter(Boolean); } catch { return []; } };
    const closed = read('closed.log');
    const rows = [...(cfg.existing || []), ...read('created.log').map((handle) => ({ handle, title: 'Claude Code' }))];
    reply({ terminals: rows.filter((r) => !closed.includes(r.handle)) });
}, c.hangMs || 0);
`;

const STUB_CLAUDE = `#!${process.execPath}
require('fs').writeFileSync(process.env.PB_STUB_MARK, JSON.stringify({ at: Date.now(), pane: process.env.ORCA_PANE_KEY || null, endpoint: process.env.ORCA_AGENT_HOOK_ENDPOINT || null }));
process.exit(7);
`;

const lines = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []);
const exe = (file, text) => { writeFileSync(file, text); chmodSync(file, 0o700); };

/** One wrapper run: resolves { code, signal, startedAt, mark, created, closed, calls }. */
async function runScenario(wrapperFile, base, name, fake, { signalAfterMs } = {}) {
    const dir = join(base, name);
    const bridge = join(dir, 'bridge');
    const dataRoot = join(dir, 'data');
    mkdirSync(bridge, { recursive: true, mode: 0o700 });
    chmodSync(bridge, 0o700);
    mkdirSync(join(dataRoot, 'cli', 'bin'), { recursive: true });
    exe(join(dataRoot, 'cli', 'bin', 'orca'), FAKE_CLI);
    writeFileSync(join(dataRoot, 'fake.json'), JSON.stringify(fake));
    writeFileSync(join(bridge, 'orcad-data-root'), `${dataRoot}\n`, { mode: 0o600 });
    chmodSync(join(bridge, 'orcad-data-root'), 0o600);
    const claude = join(dir, 'claude');
    exe(claude, STUB_CLAUDE);
    const mark = join(dir, 'claude.json');
    const env = { PATH: process.env.PATH ?? '', HOME: dir, PB_STUB_MARK: mark };
    const startedAt = Date.now();
    const child = spawn(process.execPath, [wrapperFile, '--bridge-dir', bridge, claude], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    if (signalAfterMs !== undefined) setTimeout(() => { try { child.kill('SIGTERM'); } catch { /* gone */ } }, signalAfterMs);
    const hardStop = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 40000);
    const [code, signal] = await new Promise((done) => child.once('exit', (c, s) => done([c, s])));
    clearTimeout(hardStop);
    let claudeRun = null;
    try { claudeRun = JSON.parse(readFileSync(mark, 'utf8')); } catch { /* claude never started */ }
    return { code, signal, startedAt, claude: claudeRun, created: lines(join(dataRoot, 'created.log')), closed: lines(join(dataRoot, 'closed.log')), calls: lines(join(dataRoot, 'calls.log')), dataRoot };
}

function loadBackend(text, platform, bridgeDir, wrapperFile) {
    const out = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true, esModuleInterop: false } }).outputText;
    const written = [];
    const deps = {
        fs: nodeFs,
        '@theia/core/shared/inversify': { ContainerModule: class { constructor(fn) { this.fn = fn; } }, injectable: () => (t) => t },
        '@theia/core/lib/common': { ConnectionHandler: Symbol('ConnectionHandler'), JsonRpcConnectionHandler: class {} },
        '@theia/core/lib/node': { BackendApplicationContribution: Symbol('BackendApplicationContribution') },
        '@powerbrowser/token-gate/lib/node/powerbrowser-env': { POWERBROWSER_ENV: { POWERBROWSER_ORCA_BRIDGE_DIR: bridgeDir } },
        '../common/orca-agents-protocol': { ORCA_AGENTS_SERVICE_PATH: '/services/orca-agents' },
        './claude-wrapper-launcher': { writeLauncher: (dir) => { written.push(dir); return join(dir, 'claude-wrapper'); } },
    };
    const requireFn = (id) => { if (id in deps) return deps[id]; throw new Error(`unexpected import ${id}`); };
    requireFn.resolve = () => wrapperFile;
    const saved = Object.getOwnPropertyDescriptor(process, 'platform');
    const info = console.info;
    const warn = console.warn;
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    console.info = () => undefined;
    console.warn = () => undefined;
    try {
        const mod = { exports: {} };
        new Function('require', 'module', 'exports', out)(requireFn, mod, mod.exports);
        const backend = new mod.exports.OrcaAgentsBackend();
        backend.onStart();
        return { written, path: backend.launcherPath };
    } finally {
        Object.defineProperty(process, 'platform', saved);
        console.info = info;
        console.warn = warn;
    }
}

async function check(texts) {
    const fails = [];
    const notes = [];
    const base = realpathSync(mkdtempSync(join(tmpdir(), `${NAME}-`)));
    try {
        const wrapperFile = join(base, 'claude-wrapper.mjs');
        writeFileSync(wrapperFile, texts.wrapper);
        const wrapper = await import(`${pathToFileURL(wrapperFile).href}?t=${Date.now()}`);

        const [s1, s2, s3, s4, s5, s6] = await Promise.all([
            runScenario(wrapperFile, base, 's1', { create: { paneKey: false }, list: { fail: true } }),
            runScenario(wrapperFile, base, 's2', { create: { paneKey: false }, list: { hangMs: 12000 } }),
            runScenario(wrapperFile, base, 's3', { create: { replyDelayMs: 7000 } }),
            runScenario(wrapperFile, base, 's4', { create: { replyDelayMs: 2500 } }, { signalAfterMs: 700 }),
            runScenario(wrapperFile, base, 's5', {}),
            runScenario(wrapperFile, base, 's6', { create: { failAfterMs: 6500 }, existing: [{ handle: 'h-other-session', title: 'Claude Code' }] }),
        ]);
        const closedAll = (r) => r.created.length > 0 && r.created.every((h) => r.closed.includes(h));
        if (!s1.created.length) fails.push('S1: the fake CLI saw no create (the scenario did not run)');
        else if (!closedAll(s1)) fails.push(`S1: a pane created before a failed list was left open in Orca (created ${s1.created.join(',')}, closed ${s1.closed.join(',') || 'none'})`);
        if (s1.code !== 7 || !s1.claude || s1.claude.pane) fails.push(`S1: claude did not run unwrapped with its exit code passed through (exit ${s1.code}, ${JSON.stringify(s1.claude)})`);

        if (!s2.claude) fails.push('S2: claude never started while list hung');
        else if (s2.claude.at - s2.startedAt > MAX_START_DELAY_MS) fails.push(`S2: claude started after ${s2.claude.at - s2.startedAt} ms while list hung, more than ${MAX_START_DELAY_MS} ms`);
        if (!closedAll(s2)) fails.push(`S2: the pane of a hung list was left open in Orca (created ${s2.created.join(',')}, closed ${s2.closed.join(',') || 'none'})`);

        if (!s3.claude) fails.push('S3: claude never started while create was slow');
        else if (s3.claude.at - s3.startedAt > MAX_START_DELAY_MS) fails.push(`S3: claude started after ${s3.claude.at - s3.startedAt} ms while create was slow, more than ${MAX_START_DELAY_MS} ms`);
        if (!s3.created.length) fails.push('S3: the fake CLI saw no create');
        else if (!closedAll(s3)) fails.push(`S3: a create that replied after the deadline left its pane open in Orca (created ${s3.created.join(',')}, closed ${s3.closed.join(',') || 'none'})`);
        if (s3.code !== 7) fails.push(`S3: the wrapper exited ${s3.code}, not claude's 7`);

        if (s4.claude) fails.push('S4: claude started after the session was signalled during the CLI phase');
        if (s4.code !== 143) fails.push(`S4: a signal before claude started ended the wrapper with ${s4.code === null ? `signal ${s4.signal}` : `exit ${s4.code}`}, not exit 143`);
        if (!closedAll(s4)) fails.push(`S4: a signal before claude started left the created pane open in Orca (created ${s4.created.join(',') || 'none'}, closed ${s4.closed.join(',') || 'none'})`);

        if (!s5.claude || s5.claude.pane !== 'tab-1:leaf-1' || !String(s5.claude.endpoint).endsWith(join('agent-hooks', 'endpoint.env'))) fails.push(`S5: a healthy create did not hand claude its pane identity and endpoint (${JSON.stringify(s5.claude)})`);
        if (!closedAll(s5) || s5.code !== 7) fails.push(`S5: the healthy pane was not closed after claude, or the exit code was lost (exit ${s5.code})`);

        if (!s6.claude) fails.push('S6: claude never started while create hung');
        else if (s6.claude.at - s6.startedAt > MAX_START_DELAY_MS) fails.push(`S6: claude started after ${s6.claude.at - s6.startedAt} ms while create hung, more than ${MAX_START_DELAY_MS} ms`);
        if (!s6.created.length) fails.push('S6: the fake CLI saw no create');
        else if (!closedAll(s6)) fails.push(`S6: a create that orcad completed but whose CLI never returned a handle left its pane open in Orca (created ${s6.created.join(',')}, closed ${s6.closed.join(',') || 'none'})`);
        if (s6.closed.includes('h-other-session')) fails.push('S6: the orphan sweep closed a pane that existed before the create (another session\'s pane)');
        if (s6.code !== 7) fails.push(`S6: the wrapper exited ${s6.code}, not claude's 7`);

        // W. platform names.
        if (typeof wrapper.cliPath !== 'function' || typeof wrapper.hookEndpointPath !== 'function') fails.push('W: the wrapper exports no cliPath or hookEndpointPath');
        else {
            const cliWin = wrapper.cliPath('/d', 'win32').split('/').pop();
            const epWin = wrapper.hookEndpointPath('/d', 'win32').split('/').pop();
            if (wrapper.cliPath('/d', 'linux') !== '/d/cli/bin/orca') fails.push(`W: the CLI path off win32 is ${wrapper.cliPath('/d', 'linux')}, not <data root>/cli/bin/orca`);
            if (wrapper.hookEndpointPath('/d', 'linux') !== '/d/agent-hooks/endpoint.env') fails.push('W: the endpoint off win32 is not <data root>/agent-hooks/endpoint.env');
            const orcaExe = existsSync(join(REPO_ROOT, REL.orcaCliLauncher)) ? /join\(binDir, '([^']+\.exe)'\)/.exec(readFileSync(join(REPO_ROOT, REL.orcaCliLauncher), 'utf8'))?.[1] : undefined;
            const orcaEp = existsSync(join(REPO_ROOT, REL.orcaEndpoint)) ? /process\.platform === 'win32' \? '([^']+)' : '([^']+)'/.exec(readFileSync(join(REPO_ROOT, REL.orcaEndpoint), 'utf8')) : undefined;
            if (!existsSync(join(REPO_ROOT, REL.orcaCliLauncher))) notes.push('W SKIP of the Orca comparison (orca/ is not fetched)');
            else {
                if (!orcaExe || !orcaEp) fails.push(`W: source moved: the win32 CLI or endpoint name is no longer derivable from ${REL.orcaCliLauncher} / ${REL.orcaEndpoint}`);
                else {
                    if (cliWin !== orcaExe) fails.push(`W: the wrapper looks for ${cliWin} on win32, but orcad writes ${orcaExe}`);
                    if (epWin !== orcaEp[1]) fails.push(`W: the wrapper names ${epWin} as the win32 endpoint, but Orca publishes ${orcaEp[1]}`);
                    if (orcaEp[2] !== 'endpoint.env') fails.push(`W: Orca's POSIX endpoint is now ${orcaEp[2]}`);
                }
                notes.push('W compared with Orca');
            }
        }

        // B. backend inert on win32.
        if (ts) {
            const bridge = join(base, 'backend-bridge');
            mkdirSync(bridge, { mode: 0o700 });
            chmodSync(bridge, 0o700);
            const here = loadBackend(texts.backend, process.platform, bridge, wrapperFile);
            if (!here.written.length || !here.path) fails.push(`B: the control did not write the launcher on ${process.platform}, so the win32 clause proves nothing`);
            const win = loadBackend(texts.backend, 'win32', bridge, wrapperFile);
            if (win.written.length || win.path) fails.push('B: on win32 the backend writes the POSIX sh launcher and offers it as the Claude Code process wrapper');
            notes.push('B compared');
        } else notes.push('B SKIP (theia/node_modules/typescript absent)');
    } catch (e) {
        fails.push(`the check could not run: ${e?.stack ?? e}`);
    } finally {
        rmSync(base, { recursive: true, force: true });
    }
    return { fails, notes };
}

// ---------------------------------------------------------------- self-test

const PLANTS = [
    { name: 'no-orphan-sweep', naming: 'S6: a create that orcad completed but whose CLI never returned a handle left its pane open', file: 'wrapper', edit: (s) => s.replace("}, () => sweepOrphans(dataRoot, cli, bridgeDir, e.sweep));", '}, () => undefined);') },
    { name: 'sweep-ignores-earlier-list', naming: "S6: the orphan sweep closed a pane that existed before the create", file: 'wrapper', edit: (s) => s.replace('row.title === PANE_TITLE && !sweep.before.has(row.handle)', 'row.title === PANE_TITLE') },
    { name: 'list-error-without-pane', naming: 'S1: a pane created before a failed list was left open', file: 'wrapper', edit: (s) => s.replace("throw Object.assign(e && typeof e === 'object' ? e : refuse('pane lookup failed'), { pane });", 'throw e;') },
    { name: 'twenty-second-budget', naming: 'S2: claude started after', file: 'wrapper', edit: (s) => s.replace('export const PANE_BUDGET_MS = 5000;', 'export const PANE_BUDGET_MS = 20000;') },
    { name: 'late-create-forgotten', naming: 'S3: a create that replied after the deadline left its pane open', file: 'wrapper', edit: (s) => s.replace('    if (e?.late) {', '    if (false) {') },
    { name: 'no-early-signal-handlers', naming: 'S4: a signal before claude started ended the wrapper with signal', file: 'wrapper', edit: (s) => s.replace('for (const sig of FORWARDED_SIGNALS) process.on(sig, onSignal);', '') },
    { name: 'posix-cli-name-on-win32', naming: 'W: the wrapper looks for orca on win32', file: 'wrapper', edit: (s) => s.replace("platform === 'win32' ? 'orca.exe' : 'orca'", "'orca'") },
    { name: 'backend-not-inert-on-win32', naming: 'B: on win32 the backend writes the POSIX sh launcher', file: 'backend', edit: (s) => s.replace("if (process.platform === 'win32') {", 'if (false) {') },
];

async function runSelfTest(texts) {
    const control = await check(texts);
    if (control.fails.length) { console.error(`${NAME} self-test: FAIL -- the control is not green: ${control.fails.join(' | ')}`); return 1; }
    console.log(`${NAME} self-test: control green (${control.notes.join('; ')})`);
    let failures = 0;
    for (const p of PLANTS) {
        const planted = p.edit(texts[p.file]);
        if (planted === texts[p.file]) { console.error(`  FAIL ${p.name} -> the plant did not apply (its anchor text moved in ${REL[p.file]})`); failures++; continue; }
        const r = await check({ ...texts, [p.file]: planted });
        const all = r.fails.join('\n');
        if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; }
        else if (!all.includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${all}`); failures++; }
        else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
    }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} problem(s) across ${PLANTS.length} plants`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift`);
    return 0;
}

// ---------------------------------------------------------------- entry

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--self-test')) {
        console.error(`${NAME}: unknown argument ${args[0]} (usage: node ${SELF_REL} [--self-test])`);
        console.error(`Next step: run node ${SELF_REL} for the check or add --self-test for the planted-fault run.`);
        process.exit(2);
    }
    if (process.platform === 'win32') { console.log(`${NAME}: SKIP -- the wrapper scenarios use POSIX executables`); process.exit(0); }
    if (existsSync(TS_DIR) && statSync(TS_DIR).isDirectory()) ts = createRequire(import.meta.url)(TS_DIR);
    const texts = { wrapper: readFileSync(join(REPO_ROOT, REL.wrapper), 'utf8'), backend: readFileSync(join(REPO_ROOT, REL.backend), 'utf8') };
    if (args[0] === '--self-test') {
        if (!ts) { console.log(`${NAME} self-test: SKIP -- theia/node_modules/typescript is absent; run the audited Theia install (docs/BUILD.md "Theia half")`); process.exit(0); }
        process.exit(await runSelfTest(texts));
    }
    const r = await check(texts);
    if (r.fails.length) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); process.exit(1); }
    console.log(`${NAME}: PASS -- no pane left behind on a failed lookup, a late create or an early signal; claude starts within ${MAX_START_DELAY_MS} ms on a hung orcad; win32 names match Orca; the backend is inert on win32 (${r.notes.join('; ')})`);
    process.exit(0);
}
