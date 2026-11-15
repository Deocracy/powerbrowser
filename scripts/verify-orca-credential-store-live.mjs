#!/usr/bin/env node
// scripts/verify-orca-credential-store-live.mjs
//
// RUN-09 on the running product (Phase 67, plan 67-01; ROADMAP Phase 67 criterion 4; P67-16, P67-17,
// P67-20, P67-29). orcad's own report, <data root>/orca-secret-protection.json (A-5), is compared with
// strings got by evaluating the pinned describe functions of
// orca/src/main/orcad/orcad-secret-protection-gap.ts, transpiled with theia/node_modules/typescript
// (P63-27); no Orca prose is copied here.
//
//  Step 1, positive control. The built orcad, run through scripts/lib/orca-run.mjs with a data root
//   under os.tmpdir(), reports lastReportedGap equal to describeOrcadDisposableProfile(). This proves
//   the report is read from the right place and that the pin's string is what orcad writes.
//  Step 2, a normal profile under .mozbuild/orca-credential-store-live/. OrcaService reaches ready
//   within 90 s; lastReportedGap is one of describeOrcadHostKeyGap(true) and (false) (hostBound
//   depends on the machine ID being readable); a pending or unavailable string, or no file, is red.
//   The /proc walk from PowerBrowser's pid finds a process whose argv holds the orcad entry file:
//   this proves the walker sees orcad before steps 3 and 4 judge its absence (CLAUDE.md
//   verification rule 1).
//  Step 3, a profile under os.tmpdir(). Within 30 s getState().failureClass is temporary-profile,
//   the "Orca temporary folder" row exists (labels only are printed), and the same walker finds no
//   orcad process.
//  Step 4, a normal profile with this process's environment holding the derived override name at
//   its derived trigger value (set for PowerBrowser only, removed after): failureClass
//   plaintext-setting, the "Orca setting" row, no orcad process.
// Every step quits PowerBrowser and removes its profile, and the alias and bridge folder OrcaEnv
// derives for it.
//
// HOME is a per-run scratch folder (owner ruling 2026-11-15, Scratch HOME; lib/firefox-bidi.mjs liveEnv): orcad keeps its credential
// key in <HOME>/.orca (orcadCredentialRoot), so step 2 writes a key file that is removed when the run exits.
//
// Run under flock /home/chris/coding/Power-Browser/.git/pb-live.lock: the script re-execs itself
// under <git common dir>/pb-live.lock unless PB_LIVE_LOCK_HELD=1. It removes every ORCA_* name from
// its own environment first, sets MOZ_PURGE_CACHES=1 so edited chrome JS is what runs, prints through
// installOutputRedaction, signals only identities it recorded (pid plus start ticks), and never
// prints a pairing value.
//
// SKIP (one named line, exit 0): no built PowerBrowser (objdir/dist/bin/powerbrowser or
// PB_FIREFOX_BIN), no built orca/ (orca/out/orcad/orcad.js), or no theia/node_modules/typescript.
//
// Tier: full. --self-test is quick and pure: the verdict functions over fixtures.
//
// Usage:
//   node scripts/verify-orca-credential-store-live.mjs
//   node scripts/verify-orca-credential-store-live.mjs --self-test

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as OrcaEnv from '../powerbrowser/shell/OrcaEnv.sys.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-credential-store-live';
const SELF_REL = 'scripts/verify-orca-credential-store-live.mjs';
const WORK_REL = '.mozbuild/orca-credential-store-live';
const SERVICE_URL = 'chrome://powerbrowser/content/OrcaService.sys.mjs';
const REPORT_FILE = 'orca-secret-protection.json';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

// --- pure verdicts (the self-test's subject) ---------------------------------

/** report: the parsed report file or null; expected: the strings it may hold. Returns red reasons. */
export function reportVerdict(what, report, expected) {
    if (!report) return [`${what}: orcad wrote no ${REPORT_FILE} report`];
    const gap = report.lastReportedGap;
    if (!expected.includes(gap)) return [`${what}: lastReportedGap is ${JSON.stringify(gap)}, not one of the ${expected.length} expected pinned strings`];
    return [];
}

/** A refusal: the class, the row (labels only) and no orcad in PowerBrowser's tree. Returns red reasons. */
export function refusalVerdict(what, { failureClass, rowLabels, orcadPids }, { wantClass, wantRow }) {
    const fails = [];
    if (failureClass !== wantClass) fails.push(`${what}: failureClass is ${JSON.stringify(failureClass)}, not ${wantClass}`);
    if (!rowLabels.includes(wantRow)) fails.push(`${what}: refusal without its row -- no "${wantRow}" diagnostics row`);
    if (orcadPids.length) fails.push(`${what}: an orcad process (${orcadPids.length}) runs under PowerBrowser although the start was refused`);
    return fails;
}

/** The absence claims of steps 3 and 4 count only after step 2's walker saw orcad. */
export function walkerVerdict({ sawOrcad }) {
    return sawOrcad ? [] : ['walker blind: the /proc walk never found the orcad entry file under PowerBrowser in step 2, so "no orcad" in steps 3 and 4 proves nothing'];
}

// --- live helpers ---------------------------------------------------------------

/** The pinned describe strings, by transpiling the pinned file and calling its functions. */
async function pinnedStrings(ts) {
    const src = read(join(REPO_ROOT, 'orca', 'src', 'main', 'orcad', 'orcad-secret-protection-gap.ts'));
    if (src === null) throw new Error('orca/src/main/orcad/orcad-secret-protection-gap.ts is missing (source moved)');
    const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
    for (const fn of ['describeOrcadDisposableProfile', 'describeOrcadHostKeyGap']) {
        if (typeof mod[fn] !== 'function') throw new Error(`the pinned gap file exports no ${fn} (source moved)`);
    }
    return { disposable: mod.describeOrcadDisposableProfile(), hostKey: [mod.describeOrcadHostKeyGap(true), mod.describeOrcadHostKeyGap(false)] };
}

function readReport(dataRoot) {
    try { return JSON.parse(readFileSync(join(dataRoot, REPORT_FILE), 'utf8')); } catch { return null; }
}

async function chromeJson(app, expr) {
    const text = await app.evaluateIn(app.chrome, `(() => { try { return JSON.stringify(${expr}); } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`);
    return JSON.parse(text);
}
const service = (member) => `ChromeUtils.importESModule(${JSON.stringify(SERVICE_URL)}).OrcaService.${member}`;

async function live() {
    const { FIREFOX_BIN, launchedBrowserPids } = await import('./lib/firefox-bidi.mjs');
    const orcaDir = join(REPO_ROOT, 'orca');
    const orcadEntry = join(orcaDir, 'out', 'orcad', 'orcad.js');
    if (!existsSync(FIREFOX_BIN)) { console.log(`${NAME}: SKIP -- no built PowerBrowser (${FIREFOX_BIN} missing; see docs/BUILD.md "Firefox half")`); return 0; }
    if (!existsSync(orcadEntry)) { console.log(`${NAME}: SKIP -- no built orca/ (orca/out/orcad/orcad.js missing; run: nix develop .#orca --command bash scripts/build-orca.sh)`); return 0; }
    const { loadTypescript, derivePinned, pathsFor } = await import('./verify-orca-credential-store.mjs');
    const ts = loadTypescript();
    if (!ts) { console.log(`${NAME}: SKIP -- theia/node_modules/typescript is not installed`); return 0; }
    if (process.env.PB_LIVE_HEADED === '1' || process.env.PB_REAL_INPUT === '1') {
        console.error(`${NAME}: FAIL -- this row runs headless only; unset PB_LIVE_HEADED and PB_REAL_INPUT`);
        return 1;
    }
    const { descendants, ensurePbNode, installOutputRedaction, orcadEnv, orcaVersionFromPins, startOrcad, stopOrcad } = await import('./lib/orca-run.mjs');
    const { freePort, ppidMap, signalIdentity, startTicks } = await import('./verify-orca-hidden-electron.mjs');
    const { pollFor, withShell } = await import('./lib/pb-relaunch.mjs');

    const restoreOutput = installOutputRedaction([]);
    const savedEnv = { MOZ_PURGE_CACHES: process.env.MOZ_PURGE_CACHES, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME };
    const fails = [];
    const recorded = new Map();
    const cleanups = [];
    const notes = {};
    try {
        process.env.MOZ_PURGE_CACHES = '1';
        const expected = await pinnedStrings(ts);
        const pin = derivePinned(pathsFor(REPO_ROOT), ts);
        if (pin.problems.length) throw new Error(pin.problems.join('; '));
        const node = await ensurePbNode();
        const orcaVersion = orcaVersionFromPins();

        // ---- Step 1: positive control through orca-run.mjs.
        const controlRoot = mkdtempSync(join(tmpdir(), 'pb-orca-credential-control-'));
        cleanups.push(() => rmSync(controlRoot, { recursive: true, force: true }));
        const started = await startOrcad({ nodeBin: node.path, orcaDir, profileDir: controlRoot, env: orcadEnv(process.env, { profileDir: controlRoot, orcaVersion }) });
        let controlReport = null;
        try {
            controlReport = await pollFor(async () => readReport(controlRoot), 15000, 'orcad to write its protection report').catch(() => null);
        } finally {
            await stopOrcad(started.child, started.ready.daemonPid);
        }
        fails.push(...reportVerdict('step 1 (orcad on a temporary data root)', controlReport, [expected.disposable]));

        // PowerBrowser launches share one shape: a profile, prefs, withShell, a quit, a disposal.
        const work = join(REPO_ROOT, WORK_REL);
        mkdirSync(work, { recursive: true });
        const orcadInTree = (pbPid) => {
            const map = ppidMap();
            return [...descendants(map, [pbPid])].filter((pid) => pid !== pbPid && (read(`/proc/${pid}/cmdline`) ?? '').split('\0').includes(orcadEntry));
        };
        const launch = async (parent, label, body) => {
            const profileDir = mkdtempSync(join(parent, `pb-credential-${label}-`));
            const configHome = mkdtempSync(join(work, `config-${label}-`));
            process.env.XDG_CONFIG_HOME = configHome;
            const port = await freePort(OrcaEnv);
            const prefs = { 'browser.sessionstore.resume_from_crash': false, 'powerbrowser.sidecar.nodePath': node.path, 'powerbrowser.orca.port': port, 'powerbrowser.orca.root': orcaDir };
            writeFileSync(join(profileDir, 'user.js'), `${Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n')}\n`);
            const dataRoot = OrcaEnv.dataRootFor(profileDir);
            const getEnv = (n) => process.env[n] ?? '';
            const alias = await OrcaEnv.aliasPathFor(dataRoot, getEnv);
            const bridge = await OrcaEnv.bridgeDirFor(dataRoot, getEnv, 'linux');
            cleanups.push(() => {
                try { if (alias && lstatSync(alias).isSymbolicLink()) unlinkSync(alias); } catch { /* already gone */ }
                if (bridge) rmSync(bridge, { recursive: true, force: true });
                rmSync(profileDir, { recursive: true, force: true });
                rmSync(configHome, { recursive: true, force: true });
            });
            await withShell({ profileDir, configHome }, async (app) => {
                const pids = launchedBrowserPids();
                if (pids.length !== 1) throw new Error(`harness: expected one launched PowerBrowser, found ${pids.length}`);
                await body(app, { pbPid: pids[0], dataRoot });
                const how = await app.quit();
                if (how !== 'exited') fails.push(`${label}: app.quit() returned '${how}', not exited`);
            });
        };
        const stateOf = (app) => chromeJson(app, service('getState()'));
        const rowLabels = async (app) => (await chromeJson(app, service('getDiagnosticRows()'))).map(([label]) => label);

        // ---- Step 2: a normal profile; the walker sees orcad.
        let sawOrcad = false;
        await launch(work, 'normal', async (app, { pbPid, dataRoot }) => {
            let last = null;
            await pollFor(async () => {
                last = await stateOf(app);
                if (last.chromeError) throw new Error(`chrome could not load OrcaService.sys.mjs (${last.chromeError})`);
                return last.state === 'ready' || last.state === 'failed' ? last : null;
            }, 90000, 'step 2: OrcaService to reach ready');
            if (last.state !== 'ready') { fails.push(`step 2: OrcaService is ${last.state} (class ${last.failureClass}) on a normal profile; row labels: ${(await rowLabels(app)).join(', ')}`); return; }
            if (last.pid) recorded.set(last.pid, startTicks(last.pid));
            const report = await pollFor(async () => readReport(dataRoot), 15000, 'step 2: the protection report').catch(() => null);
            fails.push(...reportVerdict('step 2 (PowerBrowser, normal profile)', report, expected.hostKey));
            sawOrcad = orcadInTree(pbPid).length > 0;
            notes.normal = `orcad pid ${last.pid} found by the walker: ${sawOrcad}`;
        });
        fails.push(...walkerVerdict({ sawOrcad }));

        // ---- Steps 3 and 4: refusals, judged with the same walker.
        const refusal = async (parent, label, wantClass, wantRow) => {
            await launch(parent, label, async (app, { pbPid }) => {
                let last = null;
                await pollFor(async () => { last = await stateOf(app); return last.failureClass === wantClass ? last : null; }, 30000, `${label}: failureClass ${wantClass}`).catch(() => null);
                fails.push(...refusalVerdict(label, { failureClass: last?.failureClass ?? null, rowLabels: await rowLabels(app), orcadPids: orcadInTree(pbPid) }, { wantClass, wantRow }));
            });
        };
        await refusal(tmpdir(), 'step 3 (profile under the temporary folder)', 'temporary-profile', 'Orca temporary folder');
        process.env[pin.name] = pin.value;
        try {
            await refusal(work, 'step 4 (plaintext override set)', 'plaintext-setting', 'Orca setting');
        } finally {
            delete process.env[pin.name];
        }

        if (fails.length) {
            for (const f of fails) console.error(`${NAME}: FAIL -- ${OrcaEnv.redact(f)}`);
            return 1;
        }
        console.log(`${NAME}: PASS -- orcad on a temporary data root reports the pinned disposable-profile string; PowerBrowser on a normal profile reports a pinned host-key string (${notes.normal}); a temporary profile and the plaintext override are refused with their class and row and no orcad process`);
        return 0;
    } catch (e) {
        for (const f of fails) console.error(`${NAME}: FAIL -- ${OrcaEnv.redact(f)}`);
        console.error(`${NAME}: FAIL -- ${OrcaEnv.redact(e.message)}`);
        return 1;
    } finally {
        await sleep(500);
        for (const [pid, ticks] of recorded) signalIdentity(pid, ticks, 'SIGKILL');
        for (const fn of cleanups.reverse()) { try { fn(); } catch { /* best effort */ } }
        for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        restoreOutput();
    }
}

// --- self-test ---------------------------------------------------------------

function runSelfTest() {
    const host = ['host-key gap, bound', 'host-key gap, unbound'];
    const disposable = 'disposable profile';
    const refused = { failureClass: 'temporary-profile', rowLabels: ['Orca state', 'Orca temporary folder'], orcadPids: [] };
    const want = { wantClass: 'temporary-profile', wantRow: 'Orca temporary folder' };
    const cases = [
        ['report control (host key)', null, () => reportVerdict('s', { lastReportedGap: host[1] }, host)],
        ['report control (disposable)', null, () => reportVerdict('s', { lastReportedGap: disposable }, [disposable])],
        ['a null report', 'wrote no', () => reportVerdict('s', null, host)],
        ['a pending string', 'not one of the', () => reportVerdict('s', { lastReportedGap: 'pending' }, host)],
        ['a host-key string where the disposable one is due', 'not one of the', () => reportVerdict('s', { lastReportedGap: host[0] }, [disposable])],
        ['refusal control', null, () => refusalVerdict('s', refused, want)],
        ['a refusal without its row', 'refusal without its row', () => refusalVerdict('s', { ...refused, rowLabels: ['Orca state'] }, want)],
        ['a refusal with the wrong class', 'not temporary-profile', () => refusalVerdict('s', { ...refused, failureClass: 'could-not-start' }, want)],
        ['an orcad under a refused start', 'although the start was refused', () => refusalVerdict('s', { ...refused, orcadPids: [4242] }, want)],
        ['walker control', null, () => walkerVerdict({ sawOrcad: true })],
        ['a no-orcad claim with a blind walker', 'walker blind', () => walkerVerdict({ sawOrcad: false })],
    ];
    let failures = 0;
    for (const [name, naming, go] of cases) {
        const fails = go();
        const text = fails.join('\n');
        if (naming === null) {
            if (fails.length) { console.error(`  FAIL ${name} -> red: ${text}`); failures++; } else console.log(`  ok ${name} -> green`);
        } else if (!fails.length) { console.error(`  FAIL ${name} -> stayed green`); failures++; }
        else if (!text.includes(naming)) { console.error(`  FAIL ${name} -> red, but not naming '${naming}': ${text}`); failures++; }
        else console.log(`  ok ${name} -> red, naming '${naming}'`);
    }
    if (failures) {
        console.error(`${NAME} self-test: FAIL -- ${failures} of ${cases.length} case(s) did not behave`);
        return 1;
    }
    console.log(`${NAME} self-test: PASS -- ${cases.length} verdict cases: controls green, each fault red naming the drift`);
    return 0;
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const unknown = args.find((a) => a !== '--self-test');
    if (unknown !== undefined) {
        console.error(`${NAME}: FAIL -- unknown argument '${unknown}' (usage: node ${SELF_REL} [--self-test])`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
    if (args.includes('--self-test')) process.exit(runSelfTest());
    if (process.env.PB_LIVE_LOCK_HELD !== '1') {
        const common = execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
        const r = spawnSync('flock', [join(common, 'pb-live.lock'), process.execPath, fileURLToPath(import.meta.url), ...args],
            { stdio: 'inherit', env: { ...process.env, PB_LIVE_LOCK_HELD: '1' } });
        process.exit(r.status ?? 1);
    }
    for (const key of Object.keys(process.env)) if (key.startsWith('ORCA_')) delete process.env[key];
    process.exit(await live());
}
