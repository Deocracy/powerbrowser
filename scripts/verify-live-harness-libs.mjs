#!/usr/bin/env node
// scripts/verify-live-harness-libs.mjs
//
// live-harness-libs (v1.7 audit, lane H5): the shared halves of the live rows, proven without a browser.
//
//   lock     scripts/lib/live-lock.mjs (harness-live-security-05). The pure rule, then a probe row run with the real
//            flock on a scratch checkout: with nothing set it takes the free lock and passes 0, 77 and 1 through; under
//            an outer flock it runs (no deadlock); while a non-ancestor holds the lock (flock -o, as the driver holds
//            it), PB_LIVE_LOCK_HELD=1 alone, or with a forged PB_LIVE_LOCK_HOLDER, FAILs by name, the true holder lets it
//            run, and with nothing set the bounded wait FAILs naming the holder; a SIGTERM to the outer pid alone ends
//            the locked re-run and frees the lock. Plant: the old rule that accepted any holder.
//   signin   writeBackSignIn in scripts/lib/firefox-bidi.mjs (harness-live-security-13). A write by the owner's own
//            claude between the harness's read and its rename (an MCP sign-in) survives, and the rotated token lands;
//            a changed refresh token is never overwritten. Plant: the helper with its re-read removed loses the write.
//   prereq   prerequisites in scripts/lib/orca-browser-live.mjs (harness-driver-02, harness-live-security-02/04) over
//            fixture trees: an absent AGENT_METHODS, orca-browser or orca-panes is FAIL; an Orca build without its pane
//            or host bundle is FAIL, naming a host bundle left aside; only absent build outputs are SKIP.
//
// Tier: quick (--self-test; the script has no other mode). Writes only under os.tmpdir().
//
// Usage:
//   node scripts/verify-live-harness-libs.mjs --self-test

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

import { holdLiveLock, lockDecision, lockHolders, parseHolder, startTicks } from './lib/live-lock.mjs';

const NAME = 'live-harness-libs';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

const results = [];
const want = (name, ok, detail = '') => results.push({ name, ok, detail });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (test, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await test()) return true; await sleep(50); } return false; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function lockCases(tmp) {
    // The pure rule first (harness-live-security-05 as corrected after review).
    const H = 4242;
    const base = { lock: '/x/pb-live.lock', holders: [], ancestors: [100, 1], holder: null, holderTicks: null, envHeld: false };
    const d = (over) => lockDecision({ ...base, ...over });
    want('lock rule: a free lock with nothing set is taken', d({}) === 'take');
    want('lock rule: no lock path is a FAIL', d({ lock: null }) === 'fail');
    want('lock rule: PB_LIVE_LOCK_HELD=1 with the lock held by a non-ancestor and no named holder is a FAIL', d({ holders: [H], envHeld: true }) === 'fail');
    want('lock rule: PB_LIVE_LOCK_HELD=1 on a free lock is a FAIL, not a silent take', d({ envHeld: true }) === 'fail');
    want('lock rule: the named holder with matching start ticks proceeds', d({ holders: [H], envHeld: true, holder: { pid: H, ticks: '77' }, holderTicks: '77' }) === 'proceed');
    want('lock rule: a named holder with other start ticks (a reused pid) is a FAIL', d({ holders: [H], envHeld: true, holder: { pid: H, ticks: '77' }, holderTicks: '78' }) === 'fail');
    want('lock rule: a named holder that does not hold the lock is a FAIL', d({ holders: [H], envHeld: true, holder: { pid: 555, ticks: '9' }, holderTicks: '9' }) === 'fail');
    want('lock rule: an ancestor holding the lock proceeds, with or without the variable', d({ holders: [100] }) === 'proceed' && d({ holders: [100], envHeld: true }) === 'proceed');
    const oldRule = ({ envHeld, holders }) => (envHeld && holders.length ? 'proceed' : 'take');
    want('lock plant: the old rule (any holder plus PB_LIVE_LOCK_HELD=1) is caught', oldRule({ holders: [H], envHeld: true }) !== d({ holders: [H], envHeld: true }));
    want('lock rule: the holder variable parses only <pid>:<ticks>', parseHolder('12:34')?.pid === 12 && parseHolder('12') === null && parseHolder('a:1') === null);

    // End to end with the real flock, on a scratch checkout so the row's lock is <scratch>/.git/pb-live.lock.
    spawnSync('git', ['init', '-q', tmp], { stdio: 'ignore' });
    const lock = join(tmp, '.git', 'pb-live.lock');
    writeFileSync(lock, '');
    const pidFile = join(tmp, 'row.pid');
    const row = join(tmp, 'row.mjs');
    writeFileSync(row, `import { writeFileSync } from 'node:fs';
import { holdLiveLock } from ${JSON.stringify(pathToFileURL(join(HERE, 'lib', 'live-lock.mjs')).href)};
const locked = await holdLiveLock({ name: 'probe-row', scriptUrl: import.meta.url, root: ${JSON.stringify(tmp)} });
if (locked !== null) process.exit(locked);
if (process.argv[2] === 'sleep') { writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1e6); }
else { console.log('probe-row: ran'); process.exit(Number(process.argv[2])); }\n`);
    const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PB_LIVE_LOCK')));
    const run = (args, extra = {}, cmd = process.execPath, pre = []) => spawnSync(cmd, [...pre, ...args], { env: { ...cleanEnv, ...extra }, encoding: 'utf8', timeout: 15000 });
    for (const status of [0, 77, 1]) {
        const r = run([row, String(status)]);
        want(`lock: with nothing set the row takes the free lock and passes exit ${status} through`, r.status === status && r.stdout.includes('probe-row: ran'), `exit ${r.status} ${r.signal ?? ''}`);
    }
    const outer = run([process.execPath, row, '0'], {}, 'flock', [lock]);
    want('lock: under an outer `flock <lock> node <row>` without the variable the row runs (an ancestor holds it; no deadlock)', outer.status === 0 && outer.stdout.includes('probe-row: ran'), `exit ${outer.status} ${outer.signal ?? ''}`);
    const outerHeld = run([process.execPath, row, '0'], { PB_LIVE_LOCK_HELD: '1' }, 'flock', [lock]);
    want('lock: under an outer flock with PB_LIVE_LOCK_HELD=1 the row runs', outerHeld.status === 0 && outerHeld.stdout.includes('probe-row: ran'), `exit ${outerHeld.status}`);

    // A holder that is not this row's ancestor, held the way the gate driver holds it (flock -o, its own group).
    const holder = spawn('flock', ['-o', lock, 'sleep', '30'], { stdio: 'ignore', detached: true });
    try {
        await until(() => lockHolders(lock).includes(holder.pid), 5000);
        const ticks = startTicks(holder.pid);
        want('lock: /proc/locks names the holder', lockHolders(lock).includes(holder.pid) && ticks !== null);
        const other = run([row, '0'], { PB_LIVE_LOCK_HELD: '1' });
        want('lock: PB_LIVE_LOCK_HELD=1 while another session holds the lock FAILs by name (not run alongside)', other.status === 1 && !other.stdout.includes('probe-row: ran') && other.stderr.includes(`pid ${holder.pid}`) && /neither the named holder nor an ancestor/.test(other.stderr), `exit ${other.status}`);
        const named = run([row, '0'], { PB_LIVE_LOCK_HELD: '1', PB_LIVE_LOCK_HOLDER: `${holder.pid}:${ticks}` });
        want('lock: the named holder with its start ticks lets the row run', named.status === 0 && named.stdout.includes('probe-row: ran'), `exit ${named.status}`);
        const forged = run([row, '0'], { PB_LIVE_LOCK_HELD: '1', PB_LIVE_LOCK_HOLDER: `${holder.pid}:${Number(ticks) + 1}` });
        want('lock: a forged holder (the right pid, other start ticks) FAILs', forged.status === 1 && !forged.stdout.includes('probe-row: ran'), `exit ${forged.status}`);
        const notHolding = run([row, '0'], { PB_LIVE_LOCK_HELD: '1', PB_LIVE_LOCK_HOLDER: `${process.pid}:${startTicks(process.pid)}` });
        want('lock: a forged holder (a live process that holds nothing) FAILs', notHolding.status === 1 && !notHolding.stdout.includes('probe-row: ran'), `exit ${notHolding.status}`);
        const t0 = Date.now();
        const waited = run([row, '0'], { PB_LIVE_LOCK_WAIT_S: '1' });
        want('lock: with nothing set the row waits a bounded time, names the holder and FAILs', waited.status === 1 && !waited.stdout.includes('probe-row: ran') && waited.stdout.includes(`held by pid ${holder.pid}`) && /still held after 1 s/.test(waited.stderr) && Date.now() - t0 < 8000, `exit ${waited.status}`);
    } finally {
        try { process.kill(-holder.pid, 'SIGKILL'); } catch { /* gone */ }
    }
    await until(() => lockHolders(lock).length === 0, 5000);

    // harness-live-security-05 (signals): a SIGTERM to the row's outer pid alone reaches the locked re-run.
    rmSync(pidFile, { force: true });
    const outerRow = spawn(process.execPath, [row, 'sleep'], { env: cleanEnv, stdio: 'ignore' });
    const exited = new Promise((r) => outerRow.once('exit', (code, signal) => r({ code, signal })));
    const started = await until(() => existsSync(pidFile), 8000);
    const inner = started ? Number(readFileSync(pidFile, 'utf8')) : 0;
    process.kill(outerRow.pid, 'SIGTERM');
    const end = await Promise.race([exited, sleep(8000).then(() => null)]);
    const innerGone = inner ? await until(() => !alive(inner), 5000) : false;
    const freed = await until(() => lockHolders(lock).length === 0, 5000);
    if (!end) try { outerRow.kill('SIGKILL'); } catch { /* gone */ }
    if (inner && alive(inner)) try { process.kill(inner, 'SIGKILL'); } catch { /* gone */ }
    want('lock: a SIGTERM to the outer pid ends the locked re-run and frees the lock, and the outer exits 143', started && innerGone && freed && end?.code === 143, `started ${started}, inner gone ${innerGone}, lock freed ${freed}, outer ${JSON.stringify(end)}`);
    const said = [];
    const ownError = console.error;
    console.error = (...a) => said.push(a.join(' ')); // the probe's FAIL line is the expected outcome, not this test's
    let outside;
    try { outside = await holdLiveLock({ name: 'probe', scriptUrl: pathToFileURL(row).href, args: ['0'], root: join(tmp, 'no-such-folder') }); } finally { console.error = ownError; }
    want('lock: holdLiveLock is a FAIL outside a checkout, naming it', outside === 1 && said.some((l) => l.includes('git names no common dir')));
}

async function signinCases(tmp) {
    const helperSrc = readFileSync(join(HERE, 'lib', 'firefox-bidi.mjs'), 'utf8');
    const { relocateHelper } = await import('./verify-live-scratch-home.mjs');
    const load = async (src, tag) => {
        const file = join(tmp, `firefox-bidi-${tag}.mjs`);
        writeFileSync(file, relocateHelper(src));
        return import(pathToFileURL(file).href);
    };
    const real = join(tmp, 'credentials.json');
    const seededToken = 'fixture-seeded';
    const rotated = { accessToken: 'fixture-access-2', refreshToken: 'fixture-rotated', expiresAt: 1 };
    const setReal = (token, extra = {}) => writeFileSync(real, JSON.stringify({ claudeAiOauth: { refreshToken: token }, ...extra }), { mode: 0o600 });
    const readReal = () => JSON.parse(readFileSync(real, 'utf8'));
    const ownerWrite = () => { const r = readReal(); r.mcpOAuth = { server: 'owner-added' }; writeFileSync(real, JSON.stringify(r)); };
    const race = (writeBack) => {
        setReal(seededToken);
        let once = false;
        const outcome = writeBack(real, rotated, sha256(seededToken), () => { if (!once) { once = true; ownerWrite(); } });
        return { outcome, after: readReal() };
    };
    const mod = await load(helperSrc, 'real');
    const r = race(mod.writeBackSignIn);
    want('signin: a write by the owner between read and rename survives the write-back', r.after.mcpOAuth?.server === 'owner-added', JSON.stringify(Object.keys(r.after)));
    want('signin: the rotated token is written back after the concurrent write', r.outcome === 'written' && r.after.claudeAiOauth?.refreshToken === rotated.refreshToken, r.outcome);
    setReal('fixture-owner-refreshed');
    const changed = mod.writeBackSignIn(real, rotated, sha256(seededToken));
    want('signin: a refresh token the owner changed is never overwritten', changed === 'changed' && readReal().claudeAiOauth.refreshToken === 'fixture-owner-refreshed', changed);
    const reread = "if (readFileSync(realFile, 'utf8') !== bytes) { rmSync(tmp, { force: true }); continue; } // written meanwhile: merge again";
    if (!helperSrc.includes(reread)) want('signin plant: the re-read line is in firefox-bidi.mjs', false, 'source moved');
    else {
        const planted = await load(helperSrc.replace(reread, ''), 'planted');
        const p = race(planted.writeBackSignIn);
        want('signin plant: without the re-read the owner\'s write is lost (the check sees it)', p.after.mcpOAuth?.server !== 'owner-added');
    }
}

async function prereqCases(tmp) {
    const { prerequisites, HOST_BUNDLE_REL, HOST_BUNDLE_ASIDE_REL, API_REL, ORCA_BROWSER_REL } = await import('./lib/orca-browser-live.mjs');
    const { ORCA_PANES_REL, ORCAD_REL, PANES_BUNDLE_REL, BACKEND_MAIN_REL } = await import('./lib/orca-tabs-live.mjs');
    const saved = { PB_FIREFOX_BIN: process.env.PB_FIREFOX_BIN, PB_BACKEND_MAIN: process.env.PB_BACKEND_MAIN };
    delete process.env.PB_FIREFOX_BIN;
    delete process.env.PB_BACKEND_MAIN;
    let n = 0;
    const tree = (files) => {
        const root = join(tmp, `tree-${n++}`);
        for (const [rel, body] of Object.entries(files)) {
            const p = join(root, rel);
            mkdirSync(body === null ? p : dirname(p), { recursive: true });
            if (body !== null) writeFileSync(p, body);
        }
        return root;
    };
    const merged = { [API_REL]: 'const AGENT_METHODS = Object.freeze(["browser.goto"]);\n', [ORCA_BROWSER_REL]: null, [ORCA_PANES_REL]: null };
    const orcaBuilt = { [ORCAD_REL]: '', [`${PANES_BUNDLE_REL}/pb-panes.js`]: '', [HOST_BUNDLE_REL]: '' };
    const appBuilt = { 'objdir/dist/bin/powerbrowser': '', [BACKEND_MAIN_REL]: '', 'theia/applications/browser/src-gen/backend/server.js': "require('@powerbrowser/orca-panes/lib/node/x');\n" };
    const cases = [
        ['a merged tree with no build is a SKIP', { ...merged }, 'skip', /no built PowerBrowser/],
        ['AGENT_METHODS declared with let still runs', { ...merged, [API_REL]: 'let AGENT_METHODS = new Set();\n' }, 'skip', /no built PowerBrowser/],
        ['a renamed AGENT_METHODS is a FAIL', { ...merged, [API_REL]: 'const AGENT_COMMANDS = [];\n' }, 'fail', /no AGENT_METHODS allowlist/],
        ['an absent PowerBrowserAPI.sys.mjs is a FAIL', { [ORCA_BROWSER_REL]: null, [ORCA_PANES_REL]: null }, 'fail', /is missing/],
        ['an absent orca-browser extension is a FAIL', { [API_REL]: merged[API_REL], [ORCA_PANES_REL]: null }, 'fail', /orca-browser is absent/],
        ['an absent orca-panes extension is a FAIL', { [API_REL]: merged[API_REL], [ORCA_BROWSER_REL]: null }, 'fail', /orca-panes is absent/],
        ['an Orca build without its pane bundle is a FAIL', { ...merged, [ORCAD_REL]: '' }, 'fail', /Orca build is incomplete.*pb-panes/],
        ['an Orca build without its host bundle is a FAIL', { ...merged, [ORCAD_REL]: '', [`${PANES_BUNDLE_REL}/pb-panes.js`]: '' }, 'fail', /pb-browser-host\.js is absent/],
        ['a host bundle left aside is a FAIL naming the aside', { ...merged, [ORCAD_REL]: '', [`${PANES_BUNDLE_REL}/pb-panes.js`]: '', [HOST_BUNDLE_ASIDE_REL]: '' }, 'fail', /moved aside/],
        ['orca-panes not wired into the built app is a FAIL', { ...merged, ...orcaBuilt, ...appBuilt, 'theia/applications/browser/src-gen/backend/server.js': '' }, 'fail', /not wired/],
        ['a merged, built tree runs', { ...merged, ...orcaBuilt, ...appBuilt }, 'run', null],
    ];
    try {
        for (const [name, files, wantKind, re] of cases) {
            const p = prerequisites(tree(files));
            const kind = p.fail ? 'fail' : p.skip ? 'skip' : 'run';
            want(`prereq: ${name}`, kind === wantKind && (!re || re.test(p.fail ?? p.skip ?? '')), `${kind}: ${p.fail ?? p.skip ?? 'runs'}`);
        }
    } finally {
        for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
    }
}

async function selfTest() {
    const tmp = mkdtempSync(join(tmpdir(), 'pb-live-harness-libs-'));
    try {
        mkdirSync(join(tmp, 'lock'));
        await lockCases(join(tmp, 'lock'));
        mkdirSync(join(tmp, 'signin'));
        await signinCases(join(tmp, 'signin'));
        mkdirSync(join(tmp, 'prereq'));
        await prereqCases(join(tmp, 'prereq'));
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
    for (const r of results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok || !r.detail ? '' : ` (${r.detail})`}`);
    const bad = results.filter((r) => !r.ok).length;
    if (bad) { console.error(`${NAME} self-test: FAIL -- ${bad} of ${results.length} case(s) did not behave`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${results.length} cases: the live lock, the sign-in write-back race and the agent rows' prerequisites`);
    return 0;
}

const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== '--self-test') {
    console.error(`${NAME}: FAIL -- usage: node scripts/verify-live-harness-libs.mjs --self-test`);
    process.exit(2);
}
process.exit(await selfTest());
