#!/usr/bin/env node
// scripts/verify-live-harness-libs.mjs
//
// live-harness-libs (v1.7 audit, lane H5): the shared halves of the live rows, proven without a browser.
//
//   lock     scripts/lib/live-lock.mjs (harness-live-security-05). On a scratch lock file with the real flock: a free lock
//            is 'take' with or without PB_LIVE_LOCK_HELD=1, a held lock with PB_LIVE_LOCK_HELD=1 is 'proceed', and no
//            lock path is 'fail'. holdLiveLock re-runs a probe under the lock (the probe sees the lock held and
//            PB_LIVE_LOCK_HELD=1) and passes its exit status through unchanged, 77 included. Plants: the old rule that
//            trusted PB_LIVE_LOCK_HELD=1 alone, and a holdLiveLock that drops the status.
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

import { holdLiveLock, lockDecision, lockState } from './lib/live-lock.mjs';

const NAME = 'live-harness-libs';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

const results = [];
const want = (name, ok, detail = '') => results.push({ name, ok, detail });

async function lockCases(tmp) {
    // A scratch checkout, so holdLiveLock below resolves <git common dir>/pb-live.lock to this folder's own lock.
    spawnSync('git', ['init', '-q', tmp], { stdio: 'ignore' });
    const lock = join(tmp, '.git', 'pb-live.lock');
    writeFileSync(lock, '');
    want('lock: a free lock is taken, PB_LIVE_LOCK_HELD unset', lockDecision({ envHeld: false, state: lockState(lock), lock }) === 'take');
    want('lock: a free lock is taken although PB_LIVE_LOCK_HELD=1', lockDecision({ envHeld: true, state: lockState(lock), lock }) === 'take');
    want('lock: no lock path is a FAIL, never an unlocked run', lockDecision({ envHeld: true, state: 'held', lock: null }) === 'fail');
    want('lock: flock that did not run is a FAIL', lockDecision({ envHeld: false, state: 'error', lock }) === 'fail');
    const holder = spawn('flock', [lock, 'sleep', '30'], { stdio: 'ignore' });
    try {
        for (let i = 0; i < 50 && lockState(lock) !== 'held'; i++) await new Promise((r) => setTimeout(r, 100));
        want('lock: a held lock reads held', lockState(lock) === 'held');
        want('lock: a held lock with PB_LIVE_LOCK_HELD=1 proceeds', lockDecision({ envHeld: true, state: lockState(lock), lock }) === 'proceed');
        want('lock: a held lock without PB_LIVE_LOCK_HELD waits for it (take)', lockDecision({ envHeld: false, state: lockState(lock), lock }) === 'take');
    } finally {
        holder.kill('SIGKILL');
    }
    // The old rule (PB_LIVE_LOCK_HELD=1 alone) must be caught by the case above: a planted decision trusting the variable.
    const oldRule = ({ envHeld, lock: l }) => (!l ? 'fail' : envHeld ? 'proceed' : 'take');
    want('lock plant: trusting PB_LIVE_LOCK_HELD=1 on a free lock is caught', oldRule({ envHeld: true, state: 'free', lock }) !== lockDecision({ envHeld: true, state: 'free', lock }));

    // holdLiveLock end to end on a probe: it re-runs the probe under flock and passes 77 through.
    for (let i = 0; i < 50 && lockState(lock) !== 'free'; i++) await new Promise((r) => setTimeout(r, 100));
    const probe = join(tmp, 'probe.mjs');
    writeFileSync(probe, `import { lockState } from ${JSON.stringify(pathToFileURL(join(HERE, 'lib', 'live-lock.mjs')).href)};
const held = lockState(${JSON.stringify(lock)}) === 'held' && process.env.PB_LIVE_LOCK_HELD === '1';
process.exit(held ? Number(process.argv[2]) : 3);\n`);
    const runner = join(tmp, 'runner.mjs');
    // The runner stands in for a live row: holdLiveLock with a root whose git common dir is the scratch folder.
    writeFileSync(runner, `import { holdLiveLock } from ${JSON.stringify(pathToFileURL(join(HERE, 'lib', 'live-lock.mjs')).href)};
process.exit(holdLiveLock({ name: 'probe', scriptUrl: ${JSON.stringify(pathToFileURL(probe).href)}, args: [process.argv[2]], root: ${JSON.stringify(tmp)} }) ?? 0);\n`);
    for (const status of [0, 77, 1]) {
        const r = spawnSync(process.execPath, [runner, String(status)], { env: { ...process.env, PB_LIVE_LOCK_HELD: '' }, encoding: 'utf8' });
        want(`lock: holdLiveLock ran the row under the lock and passed exit ${status} through`, r.status === status, `exit ${r.status}${r.stderr ? `; ${r.stderr.trim()}` : ''}`);
    }
    const free = spawnSync(process.execPath, [runner, '0'], { env: { ...process.env, PB_LIVE_LOCK_HELD: '1' }, encoding: 'utf8' });
    want('lock: PB_LIVE_LOCK_HELD=1 on a free lock still takes it (the probe saw the lock held)', free.status === 0 && /is free; taking the lock/.test(free.stdout), `exit ${free.status}`);
    want('lock: holdLiveLock is a FAIL outside a checkout', holdLiveLock({ name: 'probe', scriptUrl: pathToFileURL(probe).href, args: ['0'], root: join(tmp, 'no-such-folder') }) === 1);
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
