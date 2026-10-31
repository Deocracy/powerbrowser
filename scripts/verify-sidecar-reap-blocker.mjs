#!/usr/bin/env node
// scripts/verify-sidecar-reap-blocker.mjs
//
// The sidecar-reap-blocker row (Phase 54, UPD-30). The Windows updater renames files that a live
// node.exe may hold, so quit and restart must reap the sidecar first. The row PARSES the three tree
// files with acorn (comments and strings are not code, so a comment cannot satisfy a rule) and, for
// the three methods whose behaviour matters, EVALUATES their source against stub boundaries:
//
//  1. registration  PowerBrowserAPI.addSidecarReapBlocker calls AsyncShutdown.quitApplicationGranted
//                   .addBlocker with the name "PowerBrowser: reap sidecar", and TheiaService.start()
//                   calls PowerBrowserAPI.addSidecarReapBlocker. Quit and restart both reach
//                   quit-application-granted (restartToUpdate quits with eRestart).
//  2. reap          TheiaService.stopAndReap, run against a stub boundary, (a) waits on a live
//                   Subprocess handle for killGraceMs + 500 ms through PowerBrowserAPI.waitForExit,
//                   (b) never waits on a handle that was not live (a stale pid is never touched),
//                   (c) resolves, never rejects, when the wait times out, throws, or stop() throws,
//                   (d) logs loudly on timeout, and (e) reads the same killGraceMs default as stop()
//                   (derived from stop()'s own getIntPref call, not hand-kept).
//  3. wait          PowerBrowserAPI.waitForExit resolves true on exit, false on timeout, and true when
//                   the handle's wait() rejects.
//  4. platform      PowerBrowserAPI.signalBarePid never opens ctypes off Linux and never throws on any
//                   platform (ctypes.open throwing yields false).
//  5. catalogue     powerbrowser/INTERNAL-APIS.md has a table row naming "reap sidecar" whose File:Line
//                   cell is PowerBrowserAPI.sys.mjs:<the line of the AsyncShutdown addBlocker call>.
//  6. vacuity       an unreadable file, an unparsable file or an absent method is FAIL, never green.
//
// Honestly --quick: it reads three tree files and evaluates method source in a vm sandbox with stubs.
// Its self-test plants each fault in memory and writes nothing. It does not build, open a browser or
// display, or reach the network. The live reap (the version flip with the sidecar running at apply
// time) is the matrix's update cell, not this row.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'sidecar-reap-blocker';
const SELF_REL = 'scripts/verify-sidecar-reap-blocker.mjs';
const API_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const THEIA_REL = 'powerbrowser/shell/TheiaService.sys.mjs';
const CATALOGUE_REL = 'powerbrowser/INTERNAL-APIS.md';
const BLOCKER_NAME = 'PowerBrowser: reap sidecar';
const REGISTER_FN = 'addSidecarReapBlocker';
const GRACE_PREF = 'powerbrowser.sidecar.killGraceMs';
const API_BASE = API_REL.split('/').pop();

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the rule discriminates.`);
        process.exit(2);
    }
}

let acorn;
try {
    acorn = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('acorn');
} catch {
    console.error(`${NAME}: FAIL -- broken instrument: acorn is not installed in theia/. Next step: run yarn install in theia/ first.`);
    process.exit(1);
}

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

function parse(text) {
    try {
        return acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    } catch {
        return null;
    }
}

function walk(node, visit) {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(n => walk(n, visit)); return; }
    if (typeof node.type === 'string') visit(node);
    for (const key of Object.keys(node)) {
        if (key !== 'loc') walk(node[key], visit);
    }
}

// The first object-literal method called `name`: { text, node, line }.
function methodOf(parsed, name) {
    let found = null;
    walk(parsed.ast, n => {
        if (found === null && n.type === 'Property' && n.key?.name === name && n.value?.type === 'FunctionExpression') {
            found = { node: n, text: parsed.text.slice(n.start, n.end), line: n.loc.start.line };
        }
    });
    return found;
}

// Call expressions inside a method whose callee ends in `.a.b` (member names only).
function callsOf(method, names) {
    const out = [];
    walk(method.node, n => {
        if (n.type !== 'CallExpression') return;
        let c = n.callee;
        const chain = [];
        while (c?.type === 'MemberExpression' && !c.computed) { chain.unshift(c.property.name); c = c.object; }
        if (c?.type === 'Identifier') chain.unshift(c.name);
        if (chain.length >= names.length && names.every((nm, i) => chain[chain.length - names.length + i] === nm)) out.push(n);
    });
    return out;
}

// The second argument of the getIntPref(GRACE_PREF, default) call inside a method, or null.
function graceDefault(method) {
    for (const c of callsOf(method, ['getIntPref'])) {
        if (c.arguments[0]?.type === 'Literal' && c.arguments[0].value === GRACE_PREF && c.arguments[1]?.type === 'Literal') return c.arguments[1].value;
    }
    return null;
}

// Evaluates a method's source as `({ <method> })` in a sandbox holding only `globals`.
function instantiate(method, globals) {
    return vm.runInNewContext(`({ ${method.text} })`, { ...globals });
}

const hangs = (promise, ms = 400) => Promise.race([promise.then(v => ({ v }), e => ({ e })), new Promise(r => setTimeout(() => r({ hang: true }), ms))]);

async function reapScenarios(method, fail, graceFromStop) {
    const GRACE = graceFromStop ?? 3000;
    const run = async ({ proc, waitResult = true, waitThrows = false, stopThrows = false }) => {
        const calls = { stop: 0, waits: [], logs: [], probed: false };
        const self = { _proc: proc, _pid: 4242, stop() { calls.stop += 1; if (stopThrows) throw new Error('stop failed'); } };
        const boundary = {
            getIntPref: (k, d) => d,
            waitForExit: async (p, ms) => { calls.waits.push([p, ms]); if (waitThrows) throw new Error('wait failed'); return waitResult; },
            log: (level, msg) => calls.logs.push([level, msg]),
            sleep: () => Promise.resolve(),
            signalBarePid: () => { calls.probed = true; return true; },
        };
        let fn;
        try { fn = instantiate(method, { PowerBrowserAPI: boundary, Date, Promise }).stopAndReap; } catch (err) { return { err: `could not be evaluated (${err.message})` }; }
        const out = await hangs(fn.call(self));
        return { out, calls, self };
    };
    const live = { exitCode: null };
    const cases = [
        ['live handle that exits', { proc: live }, r => {
            if (r.calls.waits.length !== 1) return `waits on a live handle ${r.calls.waits.length} time(s), not once through PowerBrowserAPI.waitForExit`;
            if (r.calls.waits[0][0] !== live) return 'waits on something other than the live Subprocess handle';
            if (!(r.calls.waits[0][1] > GRACE)) return `waits ${r.calls.waits[0][1]} ms, which does not exceed the ${GRACE} ms kill grace stop() uses`;
            if (r.calls.probed) return 'probes a bare pid with signalBarePid';
            if (r.calls.logs.some(l => l[0] === 'error')) return 'logs an error although the sidecar exited';
            if (r.self._pid !== null) return 'leaves _pid set after a confirmed exit';
            return null;
        }],
        ['wait times out', { proc: live, waitResult: false }, r => (r.calls.logs.some(l => l[0] === 'error' && l[1].includes('4242')) ? null : 'does not log the live pid at error level on timeout')],
        ['wait throws', { proc: live, waitThrows: true }, () => null],
        ['stop throws', { proc: live, stopThrows: true }, () => null],
        ['no handle was held', { proc: null }, r => (r.calls.waits.length === 0 && !r.calls.probed ? null : 'waits or probes although no handle was live')],
        ['handle already exited (stale pid)', { proc: { exitCode: 0 } }, r => (r.calls.waits.length === 0 && !r.calls.probed ? null : 'waits or probes a pid that nothing signalled (stale pid)')],
    ];
    for (const [label, input, extra] of cases) {
        const r = await run(input);
        if (r.err) { fail(THEIA_REL, 'reap', `stopAndReap ${r.err}. Next step: keep it a self-contained async method over PowerBrowserAPI.`); return; }
        if (r.out.hang) fail(THEIA_REL, 'reap', `stopAndReap never settles when: ${label}, so shutdown could hang. Next step: bound every wait.`);
        else if (r.out.e) fail(THEIA_REL, 'reap', `stopAndReap rejects when: ${label} (${r.out.e.message}), so the blocker would reject instead of resolve. Next step: catch every failure and resolve.`);
        else {
            if (r.calls.stop !== 1) fail(THEIA_REL, 'reap', `stopAndReap calls stop() ${r.calls.stop} time(s) when: ${label}, not once. Next step: call this.stop() exactly once.`);
            const why = extra(r);
            if (why !== null) fail(THEIA_REL, 'reap', `stopAndReap when: ${label}: ${why}. Next step: restore the handle-based bounded reap.`);
        }
    }
}

async function waitScenarios(method, fail) {
    let waitForExit;
    try {
        waitForExit = instantiate(method, { PowerBrowserAPI: { sleep: ms => new Promise(r => setTimeout(r, ms)) }, Promise }).waitForExit;
    } catch (err) {
        fail(API_REL, 'wait', `waitForExit could not be evaluated (${err.message}). Next step: keep it a self-contained async method.`);
        return;
    }
    const cases = [
        ['exits', { wait: () => Promise.resolve({ exitCode: 0 }) }, true],
        ['does not exit within the grace', { wait: () => new Promise(() => {}) }, false],
        ['wait() rejects', { wait: () => Promise.reject(new Error('dead handle')) }, true],
    ];
    for (const [label, proc, want] of cases) {
        const r = await hangs(waitForExit.call({}, proc, 15));
        if (r.hang) fail(API_REL, 'wait', `waitForExit never settles when the handle ${label}. Next step: race wait() against the grace timer.`);
        else if (r.e) fail(API_REL, 'wait', `waitForExit rejects when the handle ${label}. Next step: never reject.`);
        else if (r.v !== want) fail(API_REL, 'wait', `waitForExit resolves ${r.v} when the handle ${label}, not ${want}. Next step: resolve true on exit and false on timeout.`);
    }
}

function signalScenarios(method, fail) {
    const make = (platform, open) => instantiate(method, { lazy: { AppConstants: { platform }, ctypes: { open, default_abi: 0, int: 0 } } }).signalBarePid;
    const lib = rc => ({ declare: () => () => rc, close() {} });
    const cases = [
        ['win', () => { throw new Error('libc.so.6 does not exist here'); }, false, 'on win ctypes.open is never called'],
        ['linux', () => { throw new Error('open failed'); }, false, 'a throwing ctypes.open yields false'],
        ['linux', () => lib(0), true, 'a zero kill() yields true on linux'],
        ['linux', () => lib(-1), false, 'a failing kill() yields false'],
    ];
    for (const [platform, open, want, label] of cases) {
        let opened = 0;
        let r;
        try {
            r = make(platform, (...a) => { opened += 1; return open(...a); }).call({}, 4242, 0);
        } catch (err) {
            fail(API_REL, 'platform', `signalBarePid throws on ${platform} (${err.message}); ${label}. Next step: keep ctypes.open inside the try and gate it to Linux.`);
            continue;
        }
        if (platform !== 'linux' && opened > 0) fail(API_REL, 'platform', `signalBarePid opens ctypes on ${platform}; ${label}. Next step: gate the libc call to Linux.`);
        if (r !== want) fail(API_REL, 'platform', `signalBarePid returned ${r} on ${platform}, not ${want}; ${label}. Next step: restore the contract.`);
    }
}

async function runChecks(root, overrides = {}) {
    const failures = [];
    const fail = (file, rule, msg) => failures.push({ file, rule, msg });

    const texts = {
        api: overrides.api !== undefined ? overrides.api : readText(root, API_REL),
        theia: overrides.theia !== undefined ? overrides.theia : readText(root, THEIA_REL),
        catalogue: overrides.catalogue !== undefined ? overrides.catalogue : readText(root, CATALOGUE_REL),
    };
    const rels = { api: API_REL, theia: THEIA_REL, catalogue: CATALOGUE_REL };
    for (const k of Object.keys(texts)) {
        if (texts[k] === null) { fail(rels[k], 'vacuity', `could not be read. Next step: restore ${rels[k]}.`); return { failures, line: 0 }; }
    }
    const api = { text: texts.api, ast: parse(texts.api) };
    const theia = { text: texts.theia, ast: parse(texts.theia) };
    for (const [rel, p] of [[API_REL, api], [THEIA_REL, theia]]) {
        if (p.ast === null) { fail(rel, 'vacuity', 'does not parse as an ES module (parse error). Next step: fix the syntax error.'); return { failures, line: 0 }; }
    }

    // 1a. the registration on the boundary
    const reg = methodOf(api, REGISTER_FN);
    let addBlockerLine = 0;
    if (reg === null) {
        fail(API_REL, 'registration', `has no ${REGISTER_FN} method. Next step: add the boundary method that registers the reap blocker on AsyncShutdown.quitApplicationGranted.`);
    } else {
        const call = callsOf(reg, ['quitApplicationGranted', 'addBlocker'])[0];
        if (call === undefined || call.arguments[0]?.type !== 'Literal' || call.arguments[0].value !== BLOCKER_NAME) {
            fail(API_REL, 'registration', `${REGISTER_FN} does not call quitApplicationGranted.addBlocker with the name '${BLOCKER_NAME}'. Next step: restore the addBlocker call with that name.`);
        } else {
            addBlockerLine = call.loc.start.line;
        }
    }

    // 1b. TheiaService.start() calls the boundary registration (code, not a comment)
    const start = methodOf(theia, 'start');
    if (start === null || callsOf(start, ['PowerBrowserAPI', REGISTER_FN]).length === 0) {
        fail(THEIA_REL, 'registration', `start() does not call PowerBrowserAPI.${REGISTER_FN}, so no quit or restart waits on the sidecar reap. Next step: register the blocker once in start().`);
    }

    // 2. the reap, derived from code and evaluated
    const reap = methodOf(theia, 'stopAndReap');
    const stop = methodOf(theia, 'stop');
    if (reap === null) {
        fail(THEIA_REL, 'reap', 'has no stopAndReap method. Next step: add the bounded reap the blocker awaits.');
    } else {
        const stopGrace = stop === null ? null : graceDefault(stop);
        const reapGrace = graceDefault(reap);
        if (stopGrace === null) fail(THEIA_REL, 'reap', `stop() does not read ${GRACE_PREF} with a literal default, so the grace cannot be compared. Next step: restore stop()'s getIntPref call.`);
        else if (reapGrace === null) fail(THEIA_REL, 'reap', `stopAndReap does not read ${GRACE_PREF} with a literal default. Next step: bound the wait by that pref.`);
        else if (reapGrace !== stopGrace) fail(THEIA_REL, 'reap', `stopAndReap defaults ${GRACE_PREF} to ${reapGrace} ms but stop() defaults it to ${stopGrace} ms, so the reap deadline and the SIGKILL escalation disagree. Next step: use the same default.`);
        if (callsOf(reap, ['PowerBrowserAPI', 'signalBarePid']).length > 0) fail(THEIA_REL, 'reap', 'stopAndReap calls signalBarePid, a Linux-only bare-pid probe. Next step: wait on the Subprocess handle through PowerBrowserAPI.waitForExit.');
        if (callsOf(reap, ['PowerBrowserAPI', 'waitForExit']).length === 0) fail(THEIA_REL, 'reap', 'stopAndReap does not call PowerBrowserAPI.waitForExit. Next step: wait on the handle stop() signals.');
        await reapScenarios(reap, fail, stopGrace);
    }

    // 3. waitForExit, 4. signalBarePid
    const wait = methodOf(api, 'waitForExit');
    if (wait === null) fail(API_REL, 'wait', 'has no waitForExit method. Next step: add the boundary method that awaits a Subprocess handle with a bound.');
    else await waitScenarios(wait, fail);
    const sig = methodOf(api, 'signalBarePid');
    if (sig === null) fail(API_REL, 'platform', 'has no signalBarePid method. Next step: restore it.');
    else signalScenarios(sig, fail);

    // 5. catalogue row
    const rows = texts.catalogue.split('\n').filter(l => l.startsWith('|') && /reap sidecar/.test(l));
    if (rows.length === 0 || addBlockerLine === 0 || !rows.some(r => r.includes(`${API_BASE}:${addBlockerLine}`))) {
        fail(CATALOGUE_REL, 'catalogue', `has no table row naming "reap sidecar" with File:Line ${API_BASE}:${addBlockerLine}. Next step: add the row for the AsyncShutdown addBlocker call.`);
    }
    return { failures, line: addBlockerLine };
}

const fmt = f => `${f.file} [${f.rule}]: ${f.msg}`;

async function selfTest() {
    const api = readText(REPO_ROOT, API_REL);
    const theia = readText(REPO_ROOT, THEIA_REL);
    const cat = readText(REPO_ROOT, CATALOGUE_REL);
    if (api === null || theia === null || cat === null) {
        console.error(`${NAME}: --self-test FAIL -- a tree file could not be read. Next step: restore the shell and catalogue files.`);
        return 1;
    }
    const baseline = await runChecks(REPO_ROOT, { api, theia, catalogue: cat });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`  ok  baseline -> green (blocker addBlocker at ${API_BASE} line ${baseline.line})`);

    const once = (text, from, to, what) => {
        if (!text.includes(from)) throw new Error(`self-test anchor for '${what}' is absent: ${from.split('\n')[0]}`);
        return text.replace(from, to);
    };
    const regex = (text, re, to, what) => {
        if (!re.test(text)) throw new Error(`self-test anchor for '${what}' is absent: ${re}`);
        return text.replace(re, to);
    };
    const REAP_CALL = 'await PowerBrowserAPI.waitForExit(proc, graceMs + 500)';
    const LIVE_TEST = 'this._proc && this._proc.exitCode == null ? this._proc : null';
    const plants = [
        ['registration call missing from start()', { theia: once(theia, `PowerBrowserAPI.${REGISTER_FN}(`, 'PowerBrowserAPI.noopRegistration(', 'registration') }, 'registration', REGISTER_FN],
        ['registration only named in a comment', { theia: once(theia, `PowerBrowserAPI.${REGISTER_FN}(reapBlocker);`, `// PowerBrowserAPI.${REGISTER_FN}(reapBlocker);`, 'comment') }, 'registration', REGISTER_FN],
        ['blocker renamed', { api: once(api, `"${BLOCKER_NAME}"`, '"PowerBrowser: other"', 'name') }, 'registration', BLOCKER_NAME],
        ['reap polls a bare pid instead of waiting on the handle', { theia: once(theia, REAP_CALL, 'PowerBrowserAPI.signalBarePid(pid, 0)', 'poll') }, 'reap', 'signalBarePid'],
        ['reap wait call only in a comment', { theia: once(theia, REAP_CALL, `false /* ${REAP_CALL} */`, 'wait comment') }, 'reap', 'waitForExit'],
        ['reap waits on a stale handle', { theia: once(theia, LIVE_TEST, 'this._proc', 'live test') }, 'reap', 'stale pid'],
        ['reap rejects when the wait throws', { theia: regex(theia, /(async stopAndReap\(\)[\s\S]*?)\} catch \(err\) \{[\s\S]*?\n    \}\n  \},/, '$1} finally {\n    }\n  },', 'catch') }, 'reap', 'rejects'],
        ['reap grace default differs from stop()', { theia: regex(theia, /(async stopAndReap\(\)[\s\S]*?"powerbrowser\.sidecar\.killGraceMs", )3000/, '$15000', 'default') }, 'reap', '5000'],
        ['reap deadline equals the kill grace', { theia: once(theia, REAP_CALL, 'await PowerBrowserAPI.waitForExit(proc, graceMs)', 'deadline') }, 'reap', 'does not exceed'],
        ['reap never logs a timeout', { theia: once(theia, 'PowerBrowserAPI.log("error", `Sidecar pid', 'void (`Sidecar pid', 'log') }, 'reap', 'log the live pid'],
        ['waitForExit without the grace race', { api: once(api, ', PowerBrowserAPI.sleep(graceMs).then(() => false)', '', 'race') }, 'wait', 'never settles'],
        ['waitForExit lets a dead handle reject', { api: regex(api, /(async waitForExit\(proc, graceMs\) \{[\s\S]*?)\} catch \{\n      return true;\n    \}/, '$1} finally {\n    }', 'catch') }, 'wait', 'rejects'],
        ['signalBarePid opens ctypes off Linux', { api: once(api, 'lazy.AppConstants.platform !== "linux"', 'false', 'gate') }, 'platform', 'ctypes'],
        ['signalBarePid opens ctypes outside its try', { api: regex(api, /let libc = null;\n    try \{\n      if \(lazy\.AppConstants\.platform !== "linux"\) \{\n        return false;\n      \}\n      libc = lazy\.ctypes\.open\("libc\.so\.6"\);/, 'const libc = lazy.ctypes.open("libc.so.6");\n    try {', 'hoist') }, 'platform', 'throws'],
        ['missing catalogue row', { catalogue: cat.split('\n').filter(l => !/reap sidecar/.test(l)).join('\n') }, 'catalogue', 'reap sidecar'],
        ['catalogue row cites the wrong line', { catalogue: cat.split('\n').map(l => (/reap sidecar/.test(l) ? l.replace(`${API_BASE}:${baseline.line}`, `${API_BASE}:1`) : l)).join('\n') }, 'catalogue', String(baseline.line)],
        ['TheiaService no longer parses', { theia: `${theia}\n}}}` }, 'vacuity', 'parse'],
    ];
    let failed = 0;
    for (const [name, o, rule, value] of plants) {
        const { failures } = await runChecks(REPO_ROOT, { api, theia, catalogue: cat, ...o });
        const hit = failures.some(f => f.rule === rule && f.msg.includes(value));
        if (hit) {
            console.log(`  ok  ${name} -> red, naming [${rule}] and '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming [${rule}] and '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified blocker is green and ${plants.length} planted faults each went red naming the rule and the value. It writes nothing.`);
    return 0;
}

async function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, line } = await runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the sidecar reap blocker.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${REGISTER_FN} registers '${BLOCKER_NAME}' on AsyncShutdown.quitApplicationGranted at ${API_REL}:${line}, which quit and restart both reach; TheiaService.start() registers it; stopAndReap (evaluated against stubs) waits on the live Subprocess handle for the kill grace plus 500 ms, never waits on a stale one and never rejects; waitForExit and signalBarePid keep their contracts; ${CATALOGUE_REL} cites the registration.`);
    return 0;
}

process.exit(await main());
