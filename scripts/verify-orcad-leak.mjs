#!/usr/bin/env node
// scripts/verify-orcad-leak.mjs
//
// A row must leave no orcad running. verify-platform.sh starts every script row in its own session (setsid) with
// a per-row PB_VERIFY_ROW_TOKEN in its environment and, when a process of that row's process group outlives it or
// any process still carries the token, runs this over the row: a process in the row's session, or carrying its
// token, whose arguments name the orcad entry OrcaService spawns is a leak. It is named, stopped by identity (pid
// and start ticks, scripts/verify-orca-hidden-electron.mjs signalIdentity), and the row goes red.
//
// orcad stays in the session of the PowerBrowser that spawned it (Subprocess does not setsid). scripts/lib/orca-run.mjs
// starts orcad detached, in a session of its own, which the session match cannot see; the token, inherited through
// orcadEnv(process.env), finds it (audit harness-driver-04). Another run's orcad and a desktop Orca carry neither.
// Found by the 2026-11-16 v1.7 gate: tel06-error-delivery-live's harness SIGTERM killed PowerBrowser outright, and its
// orcad held port 26768 for four hours after the row.
//
// --sweep (the driver passes it) then stops every other process the row left (audit harness-driver-07): each is
// given 2 s to end by itself, then SIGTERM, then SIGKILL after 5 s, and named on a NOTE line. The driver keeps the
// row's verdict on a NOTE and makes it FAIL under --gate.
//
// Derived at check time, never hand-kept: the orcad entry is the suffix of OrcaService.sys.mjs's `_orcadMain`
// assignment. That the driver runs this leg over each row, and acts on its status, is proven by running the driver
// itself: scripts/verify-platform-driver.mjs --self-test (audit harness-driver-08; this file's own self-test used to
// check only that the call's text was present).
//
// withFirefoxPage's named opt-out, keepStrays (orca-service-live's reap, the quit verdicts), leaves what outlives the
// browser to the row; the leg is unchanged by it. The self-test runs a planted row through firefox-bidi.mjs's own
// teardown step (stopRunStrays) with the opt-out (its orcad must go red here) and without it (green: the teardown
// stopped it), and reads firefox-bidi.mjs for that step's call in withFirefoxPage.
//
// Exit: 0 nothing left, 1 an orcad leaked (stopped), 3 only non-orcad survivors (--sweep, stopped), 2 usage.
//
//   node scripts/verify-orcad-leak.mjs --session <sid> [--token <row token>] [--since <leader start ticks>] --label <row> [--sweep]
//   node scripts/verify-orcad-leak.mjs --self-test

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { signalIdentity, startTicks } from './verify-orca-hidden-electron.mjs';

const NAME = 'verify-orcad-leak';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE = 'powerbrowser/shell/OrcaService.sys.mjs';
const TOKEN_VAR = 'PB_VERIFY_ROW_TOKEN';
// withFirefoxPage's teardown and its named opt-out (keepStrays): the plant row below runs this same step.
const BIDI = 'scripts/lib/firefox-bidi.mjs';
const TEARDOWN_CALL = 'await stopRunStrays([pkgRoot, profileDir], launchTicks, { keepStrays });';

/** The orcad entry OrcaService spawns, as the path suffix after its Orca root; null when the assignment is gone. */
export function orcadEntry(serviceSource) {
    return /this\._orcadMain = `\$\{orcaRoot\}(\/[^`$]+)`/.exec(serviceSource)?.[1] ?? null;
}

/** The entry derived from this tree's OrcaService (null when the assignment is gone). */
export function legEntry() {
    return orcadEntry(readFileSync(join(REPO_ROOT, SERVICE), 'utf8'));
}

/**
 * procs: [{ pid, sid, ticks, argv, token }]. True for a process of the row: in session `sid` or carrying `token`,
 * and, when `since` (the row leader's start ticks) is given, started no earlier than the row (review point 7: the
 * leader has exited by now, so a bare session number must not reach a process older than the row).
 */
export function ofRow(p, sid, token = null, since = null) {
    if (since !== null && !(Number(p.ticks) >= since)) return false;
    return p.sid === sid || (token !== null && p.token === token);
}

/** Those of the row (ofRow) whose arguments name the orcad entry. */
export function leaksIn(sid, procs, entry, token = null, since = null) {
    return procs.filter((p) => ofRow(p, sid, token, since) && p.argv.some((a) => a.endsWith(entry)));
}

function rowToken(pid) {
    try {
        const env = readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0');
        const hit = env.find((kv) => kv.startsWith(`${TOKEN_VAR}=`));
        return hit ? hit.slice(TOKEN_VAR.length + 1) : null;
    } catch {
        return null; // another user's process, or exited
    }
}

function processes() {
    const out = [];
    for (const name of readdirSync('/proc')) {
        if (!/^\d+$/.test(name) || Number(name) === process.pid || Number(name) === process.ppid) continue;
        try {
            const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
            const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
            const argv = readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0').filter(Boolean);
            out.push({ pid: Number(name), sid: Number(fields[3]), ticks: startTicks(Number(name)), argv, token: rowToken(name) });
        } catch {
            // exited while listed
        }
    }
    return out.filter((p) => p.ticks !== null);
}

const alive = (p) => startTicks(p.pid) === p.ticks;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Signals `found` with SIGTERM, waits up to `graceMs`, then SIGKILLs what is left. */
async function stopAll(found, graceMs) {
    for (const p of found) signalIdentity(p.pid, p.ticks, 'SIGTERM');
    const until = Date.now() + graceMs;
    while (Date.now() < until && found.some(alive)) await pause(250);
    for (const p of found) signalIdentity(p.pid, p.ticks, 'SIGKILL');
}

/** Names and stops every leaked orcad of the row: SIGTERM, up to 10 s, then SIGKILL. Returns the failure lines. */
export async function judgeSession(sid, label, entry, procs = processes(), token = null, since = null) {
    const found = leaksIn(sid, procs, entry, token, since);
    await stopAll(found, 10000);
    return found.map((p) => `${label} left orcad pid ${p.pid} running after it exited (session ${sid}${p.sid === sid ? '' : `, found by its row token in session ${p.sid}`}): ${p.argv.join(' ')}; stopped it`);
}

/**
 * Every other process of the row still running after a 2 s grace (a child mid-exit is not a survivor), stopped:
 * SIGTERM, up to 5 s, then SIGKILL. Returns the NOTE lines.
 */
export async function sweepRow(sid, label, token = null, { graceMs = 2000, since = null } = {}) {
    let found = processes().filter((p) => ofRow(p, sid, token, since));
    const until = Date.now() + graceMs;
    while (found.length && Date.now() < until) {
        await pause(100);
        found = found.filter(alive);
    }
    await stopAll(found, 5000);
    return found.map((p) => `${label} left pid ${p.pid} running after it exited (session ${p.sid}): ${p.argv.join(' ').slice(0, 300)}; stopped it`);
}

// The self-test's planted processes, stopped on any exit or interruption of the self-test, not only in its finally
// (audit harness-driver-09: an interrupted self-test left them running, each in a session of its own).
const planted = [];
let plantHooked = false;
function stopPlants() {
    for (const p of planted) if (p.ticks !== null) signalIdentity(p.pid, p.ticks, 'SIGKILL');
}
function hookPlants() {
    if (plantHooked) return;
    plantHooked = true;
    process.on('exit', stopPlants);
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        const onSignal = () => {
            stopPlants();
            process.off(sig, onSignal);
            if (process.listenerCount(sig) === 0) process.kill(process.pid, sig);
        };
        process.prependListener(sig, onSignal);
    }
}

// orca-run.mjs fixes, each with the edit that removes it from a copy of the module.
const RUN_LIB = 'scripts/lib/orca-run.mjs';
const RUN_LIB_PLANTS = [
    ['reject', 'the start no longer kills orcad when it rejects', "if (child.pid) { signal(child.pid, 'SIGKILL', true); started.delete(child.pid); }", ''],
    ['exit', 'no exit hook', "process.on('exit', stopStartedDaemons);", ''],
    ['signal', 'no signal hook', 'process.prependListener(sig, onSignal);', ''],
];

/** [name, why | null]: why is null for a green control, and names the survivor for a planted fault. */
async function runLibCases() {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'orcad-leak-run-')));
    const fake = (name, body) => {
        const root = join(dir, name);
        mkdirSync(join(root, 'out', 'orcad'), { recursive: true });
        mkdirSync(join(root, 'profile'));
        writeFileSync(join(root, 'out', 'orcad', 'orcad.js'), body);
        return root;
    };
    const silent = fake('never-ready', 'setInterval(() => {}, 1e9);\n');
    const ready = fake('ready', `console.log(JSON.stringify({ type: 'orca_server_ready', boundEndpoint: '127.0.0.1:1', health: { nodeVersion: process.versions.node, terminalDaemon: { pid: null } } })); setInterval(() => {}, 1e9);\n`);
    const libSource = readFileSync(join(REPO_ROOT, RUN_LIB), 'utf8')
        .replace("from './firefox-bidi.mjs'", `from ${JSON.stringify(pathToFileURL(join(REPO_ROOT, 'scripts/lib/firefox-bidi.mjs')).href)}`)
        .replace("from '../generate-licensing.mjs'", `from ${JSON.stringify(pathToFileURL(join(REPO_ROOT, 'scripts/generate-licensing.mjs')).href)}`);
    const copy = (edit) => {
        const file = join(dir, `lib-${Math.random().toString(36).slice(2)}.mjs`);
        writeFileSync(file, edit ? libSource.split(edit[0]).join(edit[1]) : libSource);
        return pathToFileURL(file).href;
    };
    // One child per case. It starts the fake orcad through the module and prints its pid; "reject" also reports
    // whether it survived the rejection, before exiting by SIGKILL so no exit hook can hide a missing kill.
    const runCase = async (libUrl, mode) => {
        const body = [
            `import * as runLib from ${JSON.stringify(libUrl)};`,
            `const start = runLib[Object.keys(runLib).find((k) => /^start\\wrcad$/.test(k))];`,
            `const mode = ${JSON.stringify(mode)};`,
            `const root = mode === 'reject' ? ${JSON.stringify(silent)} : ${JSON.stringify(ready)};`,
            `const opts = { nodeBin: process.execPath, orcaDir: root, profileDir: root + '/profile', env: process.env, timeoutMs: mode === 'reject' ? 400 : 20000 };`,
            `if (mode === 'reject') {`,
            `  let pid = null; try { await start(opts); } catch (e) { pid = e.child?.pid ?? null; }`,
            `  await new Promise((r) => setTimeout(r, 300));`,
            `  let alive = false; try { process.kill(pid, 0); alive = !/^\\S+ \\(.*\\) Z/.test((await import('node:fs')).readFileSync('/proc/' + pid + '/stat', 'utf8')); } catch {}`,
            `  console.log('pid ' + pid + ' alive ' + alive); process.kill(process.pid, 'SIGKILL');`,
            `}`,
            `const { child } = await start(opts);`,
            `console.log('pid ' + child.pid);`,
            `if (mode === 'exit') process.exit(0);`,
            `setInterval(() => {}, 1e9);`,
        ].join('\n');
        const c = spawn(process.execPath, ['--input-type=module', '-e', body], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let err = '';
        c.stdout.on('data', (d) => { out += d; if (mode === 'signal' && /pid \d+/.test(out)) c.kill('SIGTERM'); });
        c.stderr.on('data', (d) => { err += d; });
        const killer = setTimeout(() => c.kill('SIGKILL'), 30000);
        const [code, sig] = await new Promise((r) => c.once('exit', (...a) => r(a)));
        clearTimeout(killer);
        const pid = Number(/pid (\d+)/.exec(out)?.[1]);
        if (!Number.isInteger(pid)) return `no orcad pid printed (exit ${code ?? sig}): ${err.trim().split('\n').pop()}`;
        await pause(300);
        const proc = { pid, ticks: startTicks(pid) };
        if (proc.ticks !== null) planted.push(proc);
        const survived = mode === 'reject' ? / alive true/.test(out) : proc.ticks !== null;
        if (mode === 'signal' && sig !== 'SIGTERM') return `the signalled process ended with ${sig ?? `exit ${code}`}, not SIGTERM: the hook kept it alive`;
        return survived ? `orcad pid ${pid} survived the ${mode}` : null;
    };
    const results = [];
    try {
        const real = copy(null);
        for (const [mode] of RUN_LIB_PLANTS) results.push([`orca-run: no orcad left running after the ${mode} case`, await runCase(real, mode)]);
        for (const [mode, name, from, to] of RUN_LIB_PLANTS) {
            if (libSource.split(from).length !== 2) { results.push([`orca-run plant ${name}`, `${RUN_LIB} no longer contains the planted text; update this plant`]); continue; }
            results.push([`orca-run plant ${name}`, await runCase(copy([from, to]), mode)]);
        }
    } finally {
        stopPlants();
        rmSync(dir, { recursive: true, force: true });
    }
    return results;
}

async function selfTest() {
    let misses = 0;
    const check = (name, got, want) => {
        const text = got.join('; ');
        const ok = want === null ? got.length === 0 : text.includes(want);
        if (!ok) misses++;
        console.log(`  ${ok ? 'ok ' : 'MISS'} ${want === null ? 'control' : 'plant'} ${name} -> ${got.length ? `red: ${text}` : 'green'}`);
    };
    const service = readFileSync(join(REPO_ROOT, SERVICE), 'utf8');
    const entry = orcadEntry(service);
    check('orcad entry derived from OrcaService', entry ? [] : [`no _orcadMain assignment in ${SERVICE}`], null);
    check('OrcaService without its _orcadMain assignment', orcadEntry(service.replace('this._orcadMain =', 'this._main =')) ? [] : [`no _orcadMain assignment in ${SERVICE}`], 'no _orcadMain assignment');
    if (!entry) return 1;

    const orcad = (pid, sid, path = `/w/upstream/../orca${entry}`, token = null) => ({ pid, sid, ticks: '1', argv: ['node', path, '--bind', '127.0.0.1', '--port', '26768'], token });
    const names = (list) => list.map((p) => `leak ${p.pid}`);
    check('nothing left in the session', names(leaksIn(700, [orcad(1, 900)], entry)), null);
    check('an orcad of another session is left alone', names(leaksIn(700, [orcad(2, 701)], entry)), null);
    check('a non-orcad survivor of the session is not an orcad leak', names(leaksIn(700, [{ pid: 3, sid: 700, ticks: '1', argv: ['node', '/w/orca/out/orcad/orcad.js.map'], token: null }], entry)), null);
    check('orcad left in the session', names(leaksIn(700, [orcad(1, 900), orcad(4, 700)], entry)), 'leak 4');
    check('packaged orcad left in the session', names(leaksIn(700, [orcad(5, 700, `/tmp/pb-pkg-x/powerbrowser/orca${entry}`)], entry)), 'leak 5');
    check('a detached orcad of another run (another token) is left alone', names(leaksIn(700, [orcad(6, 702, undefined, 'tok-other')], entry, 'tok-row')), null);
    check('a detached orcad carrying the row token', names(leaksIn(700, [orcad(7, 703, undefined, 'tok-row')], entry, 'tok-row')), 'leak 7');
    check('a row token with no token given is not matched', names(leaksIn(700, [orcad(8, 703, undefined, 'tok-row')], entry)), null);
    // Review point 7: an orcad in the row's session number but started before the row (ticks 1 < since 50).
    check('a process older than the row is not of the row', names(leaksIn(700, [orcad(9, 700)], entry, null, 50)), null);
    check('a process started with the row is', names(leaksIn(700, [{ ...orcad(10, 700), ticks: '60' }], entry, null, 50)), 'leak 10');

    // Live: planted processes in sessions of their own (detached: setsid), judged through the CLI as the driver runs
    // it. An orcad-shaped one must go red naming the pid and be gone after; a non-orcad survivor must stay green and
    // alive without --sweep; with the row's token, a detached orcad is a leak and --sweep stops a non-orcad survivor.
    hookPlants();
    const plant = (argv, env = process.env) => {
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)', ...argv], { detached: true, stdio: 'ignore', env });
        child.unref();
        const p = { pid: child.pid, ticks: null };
        planted.push(p);
        return p;
    };
    const settle = async (p) => { for (let i = 0; i < 40 && !(p.ticks = startTicks(p.pid)); i++) await pause(25); return p; };
    const cli = (sid, extra = []) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--session', String(sid), '--label', 'planted-row', ...extra], { encoding: 'utf8' });
    const token = `selftest-${process.pid}-${Date.now()}`;
    const leaked = await settle(plant([join(REPO_ROOT, `upstream/../orca${entry}`), '--port', '0']));
    const bystander = await settle(plant([join(REPO_ROOT, 'orca/out/web/index.html')]));
    const detached = await settle(plant([join(REPO_ROOT, `upstream/../orca${entry}`), '--port', '0'], { ...process.env, [TOKEN_VAR]: token }));
    const straggler = await settle(plant([join(REPO_ROOT, 'orca/out/web/index.html')], { ...process.env, [TOKEN_VAR]: token }));
    try {
        const red = cli(leaked.pid);
        check('live: a planted orcad left in its session', red.status === 1 ? [red.stderr.trim()] : [`exit ${red.status}: ${red.stderr.trim()}`], `planted-row left orcad pid ${leaked.pid}`);
        check('live: the planted orcad is stopped', alive(leaked) ? [`pid ${leaked.pid} still running`] : [], null);
        const green = cli(bystander.pid);
        check('live: a non-orcad survivor', green.status === 0 ? [] : [`exit ${green.status}: ${green.stderr.trim()}`], null);
        check('live: the non-orcad survivor is left running', alive(bystander) ? [] : [`pid ${bystander.pid} was stopped`], null);
        // The session given is the bystander's, so only the token can find the detached orcad (another session).
        const byToken = cli(bystander.pid, ['--token', token]);
        check('live: a detached orcad found only by the row token', byToken.status === 1 ? [byToken.stderr.trim()] : [`exit ${byToken.status}: ${byToken.stderr.trim()}`], `planted-row left orcad pid ${detached.pid}`);
        check('live: the detached orcad is stopped', alive(detached) ? [`pid ${detached.pid} still running`] : [], null);
        // The stopped orcad plant's session is empty now, so only the token can find the straggler. Never this
        // process's own session: under the driver that is the row's, and the sweep would stop this self-test.
        const swept = cli(leaked.pid, ['--token', token, '--sweep']);
        check('live: --sweep stops a token-carrying non-orcad survivor and names it', swept.status === 3 ? [swept.stderr.trim()] : [`exit ${swept.status}: ${swept.stderr.trim()}`], `planted-row left pid ${straggler.pid} running`);
        check('live: the swept survivor is stopped', alive(straggler) ? [`pid ${straggler.pid} still running`] : [], null);
    } finally {
        stopPlants();
    }

    // scripts/lib/orca-run.mjs starts orcad in a session of its own, so it must stop what it started itself (audit
    // harness-driver-04): when its start rejects, when the process exits without stopping it, and when it is signalled
    // (with firefox-bidi.mjs's liveHome handler also listening, as in every live row). A fake orcad.js that never prints
    // its ready line, or prints one and stays, runs in each case; then each fix is planted out of a copy of the module
    // (its relative imports made absolute) and its case must go red.
    for (const [name, why] of await runLibCases()) check(name, why ? [why] : [], name.startsWith('orca-run plant') ? 'survived' : null);

    // The harness's named opt-out (withFirefoxPage keepStrays) must not blind the leg. A planted row in a session of its
    // own (as the driver's setsid) leaves an orcad-shaped child working under its profile, runs withFirefoxPage's own
    // teardown step with or without the opt-out, and exits; the leg then judges its session as the driver runs it.
    const bidi = readFileSync(join(REPO_ROOT, BIDI), 'utf8');
    const teardown = (text) => (text.includes(TEARDOWN_CALL) ? [] : [`${BIDI}'s withFirefoxPage teardown does not run stopRunStrays with the caller's keepStrays`]);
    check('withFirefoxPage tears down through stopRunStrays with keepStrays', teardown(bidi), null);
    check('withFirefoxPage with that teardown call removed', teardown(bidi.split(TEARDOWN_CALL).join('')), 'does not run stopRunStrays');
    const lib = (rel) => JSON.stringify(pathToFileURL(join(REPO_ROOT, rel)).href);
    const plantRow = async (keepStrays) => {
        const profile = realpathSync(mkdtempSync(join(tmpdir(), 'orcad-leak-row-')));
        mkdirSync(join(profile, 'powerbrowser-orca'));
        const body = [
            `import { spawn } from 'node:child_process';`,
            `import { stopRunStrays } from ${lib(BIDI)};`,
            `import { startTicks } from ${lib('scripts/verify-orca-hidden-electron.mjs')};`,
            `const since = startTicks(process.pid);`,
            `const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)', ${JSON.stringify(join(REPO_ROOT, `upstream/../orca${entry}`))}], { cwd: ${JSON.stringify(join(profile, 'powerbrowser-orca'))}, stdio: 'ignore' });`,
            `await new Promise((r) => setTimeout(r, 300));`,
            `await stopRunStrays([${JSON.stringify(profile)}], since, { keepStrays: ${keepStrays} });`,
            `console.log(c.pid);`,
            `process.exit(0);`,
        ].join('\n');
        const row = spawn(process.execPath, ['--input-type=module', '-e', body], { detached: true, stdio: ['ignore', 'pipe', 'inherit'] });
        let out = '';
        row.stdout.on('data', (d) => { out += d; });
        await new Promise((r) => row.once('exit', r));
        const pid = Number(out.trim().split('\n').pop());
        const orcadProc = { pid, ticks: Number.isInteger(pid) ? startTicks(pid) : null };
        planted.push(orcadProc);
        return { sid: row.pid, profile, orcad: orcadProc };
    };
    for (const keepStrays of [true, false]) {
        const { sid, profile, orcad: orcadProc } = await plantRow(keepStrays);
        try {
            const leg = cli(sid);
            if (keepStrays) {
                check('live: a keepStrays row that leaves its orcad', orcadProc.ticks === null ? [`vacuous: the row's orcad pid ${orcadProc.pid} was not running when the leg ran`]
                    : leg.status === 1 ? [leg.stderr.trim()] : [`exit ${leg.status}: ${leg.stderr.trim()}`], `planted-row left orcad pid ${orcadProc.pid}`);
                check('live: the keepStrays row\'s orcad is stopped by the leg', orcadProc.ticks !== null && alive(orcadProc) ? [`pid ${orcadProc.pid} still running`] : [], null);
            } else {
                check('live: the same row without keepStrays (its teardown stops the orcad)', orcadProc.ticks !== null ? [`the teardown left pid ${orcadProc.pid} running`]
                    : leg.status === 0 ? [] : [`exit ${leg.status}: ${leg.stderr.trim()}`], null);
            }
        } finally {
            if (orcadProc.ticks !== null) signalIdentity(orcadProc.pid, orcadProc.ticks, 'SIGKILL');
            rmSync(profile, { recursive: true, force: true });
        }
    }
    if (misses) {
        console.error(`${NAME} --self-test: FAIL -- ${misses} case(s) missed`);
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- every control stayed green and every planted leak went red naming its pid`);
    return 0;
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args[0] === '--self-test') process.exit(await selfTest());
    const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
    const sid = Number(opt('--session'));
    const label = opt('--label') ?? 'the row';
    const token = opt('--token') || null;
    const sinceArg = opt('--since');
    const since = sinceArg !== undefined && /^\d+$/.test(sinceArg) ? Number(sinceArg) : null;
    const entry = orcadEntry(readFileSync(join(REPO_ROOT, SERVICE), 'utf8'));
    if (!args.includes('--session') || !Number.isInteger(sid) || sid <= 0 || !entry) {
        console.error(`${NAME}: FAIL -- ${entry ? 'usage: --session <sid> [--token <row token>] --label <row> [--sweep], or --self-test' : `no _orcadMain assignment in ${SERVICE}, so the orcad entry cannot be derived`}`);
        process.exit(2);
    }
    const lines = await judgeSession(sid, label, entry, processes(), token, since);
    for (const line of lines) console.error(`${NAME}: FAIL -- ${line}`);
    const notes = args.includes('--sweep') ? await sweepRow(sid, label, token, { since }) : [];
    for (const line of notes) console.error(`${NAME}: NOTE -- ${line}`);
    process.exit(lines.length ? 1 : notes.length ? 3 : 0);
}
