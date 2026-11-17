#!/usr/bin/env node
// scripts/verify-orcad-leak.mjs
//
// A row must leave no orcad running. verify-platform.sh starts every script row in its own session (setsid) and,
// when a process of that row's process group outlives it, runs this over the row's session: a process still in the
// session whose arguments name the orcad entry OrcaService spawns is a leak. It is named, stopped by identity (pid and
// start ticks, scripts/verify-orca-hidden-electron.mjs signalIdentity), and the row goes red.
//
// orcad stays in the session of the PowerBrowser that spawned it (Subprocess does not setsid), so the session is the
// row's own identity: another run's orcad, a desktop Orca, and Orca's terminal daemon (which setsids) are never in it.
// Found by the 2026-11-16 v1.7 gate: tel06-error-delivery-live's harness SIGTERM killed PowerBrowser outright, and its
// orcad held port 26768 for four hours after the row.
//
// Derived at check time, never hand-kept: the orcad entry is the suffix of OrcaService.sys.mjs's `_orcadMain`
// assignment, and the self-test reads verify-platform.sh for the leg's invocation.
//
//   node scripts/verify-orcad-leak.mjs --session <sid> --label <row>
//   node scripts/verify-orcad-leak.mjs --self-test

import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signalIdentity, startTicks } from './verify-orca-hidden-electron.mjs';

const NAME = 'verify-orcad-leak';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE = 'powerbrowser/shell/OrcaService.sys.mjs';
const DRIVER = 'scripts/verify-platform.sh';
const LEG_CALL = 'scripts/verify-orcad-leak.mjs" --session "$CURRENT_CHECK_PID"';

/** The orcad entry OrcaService spawns, as the path suffix after its Orca root; null when the assignment is gone. */
export function orcadEntry(serviceSource) {
    return /this\._orcadMain = `\$\{orcaRoot\}(\/[^`$]+)`/.exec(serviceSource)?.[1] ?? null;
}

/** procs: [{ pid, sid, ticks, argv }]. Those in session `sid` whose arguments name the orcad entry. */
export function leaksIn(sid, procs, entry) {
    return procs.filter((p) => p.sid === sid && p.argv.some((a) => a.endsWith(entry)));
}

function processes() {
    const out = [];
    for (const name of readdirSync('/proc')) {
        if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
        try {
            const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
            const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
            const argv = readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0').filter(Boolean);
            out.push({ pid: Number(name), sid: Number(fields[3]), ticks: startTicks(Number(name)), argv });
        } catch {
            // exited while listed
        }
    }
    return out.filter((p) => p.ticks !== null);
}

/** Names and stops every leaked orcad in session `sid`: SIGTERM, up to 10 s, then SIGKILL. Returns the failure lines. */
export async function judgeSession(sid, label, entry, procs = processes()) {
    const found = leaksIn(sid, procs, entry);
    for (const p of found) signalIdentity(p.pid, p.ticks, 'SIGTERM');
    const until = Date.now() + 10000;
    while (Date.now() < until && found.some((p) => startTicks(p.pid) === p.ticks)) await new Promise((r) => setTimeout(r, 250));
    for (const p of found) signalIdentity(p.pid, p.ticks, 'SIGKILL');
    return found.map((p) => `${label} left orcad pid ${p.pid} running after it exited (session ${sid}): ${p.argv.join(' ')}; stopped it`);
}

const alive = (p) => startTicks(p.pid) === p.ticks;

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
    const driver = readFileSync(join(REPO_ROOT, DRIVER), 'utf8');
    const wired = (text) => (text.includes(LEG_CALL) ? [] : [`${DRIVER} never runs the leak leg over a row's session`]);
    check('verify-platform.sh runs the leg over each row', wired(driver), null);
    check('verify-platform.sh with the leg removed', wired(driver.split(LEG_CALL).join('scripts/verify-orcad-leak.mjs" --label "$label"')), 'never runs the leak leg');
    if (!entry) return 1;

    const orcad = (pid, sid, path = `/w/upstream/../orca${entry}`) => ({ pid, sid, ticks: '1', argv: ['node', path, '--bind', '127.0.0.1', '--port', '26768'] });
    const names = (list) => list.map((p) => `leak ${p.pid}`);
    check('nothing left in the session', names(leaksIn(700, [orcad(1, 900)], entry)), null);
    check('an orcad of another session is left alone', names(leaksIn(700, [orcad(2, 701)], entry)), null);
    check('a non-orcad survivor of the session is not an orcad leak', names(leaksIn(700, [{ pid: 3, sid: 700, ticks: '1', argv: ['node', '/w/orca/out/orcad/orcad.js.map'] }], entry)), null);
    check('orcad left in the session', names(leaksIn(700, [orcad(1, 900), orcad(4, 700)], entry)), 'leak 4');
    check('packaged orcad left in the session', names(leaksIn(700, [orcad(5, 700, `/tmp/pb-pkg-x/powerbrowser/orca${entry}`)], entry)), 'leak 5');

    // Live: a planted orcad-shaped process in a session of its own (detached: setsid), judged through the CLI as the
    // driver runs it. It must go red naming the pid and be gone after; a non-orcad survivor must stay green and alive.
    const plant = (argv) => {
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)', ...argv], { detached: true, stdio: 'ignore' });
        child.unref();
        return { pid: child.pid, ticks: null };
    };
    const settle = async (p) => { for (let i = 0; i < 40 && !(p.ticks = startTicks(p.pid)); i++) await new Promise((r) => setTimeout(r, 25)); return p; };
    const cli = (sid) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--session', String(sid), '--label', 'planted-row'], { encoding: 'utf8' });
    const leaked = await settle(plant([join(REPO_ROOT, `upstream/../orca${entry}`), '--port', '0']));
    const bystander = await settle(plant([join(REPO_ROOT, 'orca/out/web/index.html')]));
    try {
        const red = cli(leaked.pid);
        check('live: a planted orcad left in its session', red.status === 1 ? [red.stderr.trim()] : [`exit ${red.status}: ${red.stderr.trim()}`], `planted-row left orcad pid ${leaked.pid}`);
        check('live: the planted orcad is stopped', alive(leaked) ? [`pid ${leaked.pid} still running`] : [], null);
        const green = cli(bystander.pid);
        check('live: a non-orcad survivor', green.status === 0 ? [] : [`exit ${green.status}: ${green.stderr.trim()}`], null);
        check('live: the non-orcad survivor is left running', alive(bystander) ? [] : [`pid ${bystander.pid} was stopped`], null);
    } finally {
        for (const p of [leaked, bystander]) signalIdentity(p.pid, p.ticks, 'SIGKILL');
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
    const sid = Number(args[args.indexOf('--session') + 1]);
    const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : 'the row';
    const entry = orcadEntry(readFileSync(join(REPO_ROOT, SERVICE), 'utf8'));
    if (!args.includes('--session') || !Number.isInteger(sid) || sid <= 0 || !entry) {
        console.error(`${NAME}: FAIL -- ${entry ? 'usage: --session <sid> --label <row>, or --self-test' : `no _orcadMain assignment in ${SERVICE}, so the orcad entry cannot be derived`}`);
        process.exit(2);
    }
    const lines = await judgeSession(sid, label, entry);
    for (const line of lines) console.error(`${NAME}: FAIL -- ${line}`);
    process.exit(lines.length ? 1 : 0);
}
