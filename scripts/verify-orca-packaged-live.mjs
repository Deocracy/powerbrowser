#!/usr/bin/env node
// scripts/verify-orca-packaged-live.mjs
//
// orca-packaged-live (Phase 68, PLAT-01 and PLAT-02, P68-20, P68-37): the container-built Linux package runs
// Orca from its own <GreD>/orca on its own staged Node, never from the checkout, and a quit ends it.
//
// One headless launch of the extracted release tarball's binary on a fresh profile (pb-relaunch.mjs):
//   - OrcaService.getState() reaches ready (read in chrome);
//   - orcad is found among PowerBrowser's descendants by its --web-client-root argument (exactly one);
//   - exe:  realpath(/proc/<orcad>/exe) equals <prefix>/node/bin/node, the Node the package staged (D-14);
//   - root: the --web-client-root argument lies under <prefix>/orca/out/web, so the client is the packaged one;
//   - quit: app.quit() exits, and within 25 s neither orcad nor its terminal daemon (recorded with their start
//     ticks while PowerBrowser ran) is alive.
// Then pairing against the packaged root: an orcad started from <prefix>/orca on <prefix>/node/bin/node through
// lib/orca-run.mjs startOrcad, and a PowerBrowser web tab paired from its web client URL by pairWebTab, which
// the slotless-start check exports with deriveMarker (lane p68-02). The service never exposes a pairing
// offer (OrcaService.getState carries no credential), so the pairing orcad is a second one on the same packaged
// tree. Both are imported dynamically, in the live path only, after their export is confirmed in the module's
// text: importing the module before it has an entry-point guard would run its own check.
//
// Signals: only identities this script recorded (pid plus start ticks). orcad's ready line, pairing URLs and
// tokens never reach the output: startOrcad redacts, and installOutputRedaction covers the pairing step.
//
// Tier: full. Needs the container-built tarball (packagePath in lib/built-tree.mjs); without it the row FAILs
// naming the container build, never SKIPs. Run under the live lock, headless, with ORCA_* unset (the script also
// removes every ORCA_* name from its own environment before the launch):
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-orca-packaged-live.mjs
// Runs in 68-06, after the merges that bring pairWebTab's export and the container tarball.
//
// --self-test is quick and pure: the four verdicts over fixtures (a Node from elsewhere, a web root outside
// GreD, a survivor after quit, an unpaired tab), controls green first. It never imports the slotless module.
//
// Usage:
//   node scripts/verify-orca-packaged-live.mjs
//   node scripts/verify-orca-packaged-live.mjs --self-test

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-packaged-live';
const SELF_REL = 'scripts/verify-orca-packaged-live.mjs';
const SERVICE_URL = 'chrome://powerbrowser/content/OrcaService.sys.mjs';
const BUILD_CMD = 'podman run --rm -v "$PWD:/src:rw" -e PB_HOST_ROOT="$PWD" -w /src pb-gecko-build bash powerbrowser/packaging/package-linux.sh (after the plan 45-01 container build; docs/BUILD.md "Linux package")';

const real = (p) => { try { return realpathSync(p); } catch { return null; } };
const under = (p, dir) => p === dir || p.startsWith(`${dir}/`);

// --- pure verdicts (the self-test's subject) ---------------------------------

/** orcad's Node must be the package's own: realpath(exe) equals <prefix>/node/bin/node. */
export function exeVerdict({ exe, prefix }) {
    const want = real(join(prefix, 'node', 'bin', 'node')) ?? join(prefix, 'node', 'bin', 'node');
    const got = real(exe) ?? exe;
    return got === want ? [] : [`orcad runs on ${got}, not the packaged Node ${want}`];
}

/** orcad's --web-client-root must lie under <prefix>/orca/out/web. */
export function rootVerdict({ cmdline, prefix }) {
    const i = cmdline.indexOf('--web-client-root');
    const root = i >= 0 ? cmdline[i + 1] : cmdline.find((a) => a.startsWith('--web-client-root='))?.slice('--web-client-root='.length);
    if (!root) return ['orcad has no --web-client-root argument, so the web client it serves is unknown'];
    const want = join(prefix, 'orca', 'out', 'web');
    return under(resolve(root), want) ? [] : [`orcad serves the web client from ${root}, not from the packaged ${want}`];
}

/** before: [{ pid, ticks, what }] recorded while PowerBrowser ran; now: Map pid -> current start ticks. */
export function survivorVerdict(before, now) {
    if (!before.length) return ['vacuous: no orcad process was recorded before the quit'];
    return before.filter((p) => now.get(p.pid) === p.ticks).map((p) => `${p.what} pid ${p.pid} survived the quit`);
}

/** The packaged web client must pair in a PowerBrowser web tab. */
export function pairVerdict({ paired }) {
    return paired === true ? [] : ['the web tab did not pair with orcad from the packaged root'];
}

// --- self-test ---------------------------------------------------------------

function selfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-selftest-`));
    let misses = 0;
    const ok = (label) => console.log(`  ok ${label}`);
    const check = (label, fails, naming) => {
        const text = fails.join(' | ');
        if (naming === null) { if (fails.length) { misses++; console.error(`  MISS ${label}: expected green, got ${text}`); } else ok(`${label} -> green`); return; }
        if (fails.length && text.includes(naming)) ok(`${label} -> red, naming '${naming}'`);
        else { misses++; console.error(`  MISS ${label}: ${fails.length ? `red without naming '${naming}': ${text}` : 'stayed green'}`); }
    };
    try {
        const prefix = join(tmp, 'powerbrowser');
        const put = (rel) => { mkdirSync(dirname(join(prefix, rel)), { recursive: true }); writeFileSync(join(prefix, rel), ''); };
        put('node/bin/node');
        put('orca/out/web/web-index.html');
        const other = join(tmp, 'elsewhere', 'node');
        mkdirSync(dirname(other), { recursive: true });
        writeFileSync(other, '');
        const argv = (root) => ['node', join(prefix, 'orca/out/orcad/orcad.js'), '--bind', '127.0.0.1', '--port', '0', '--json', '--web-client-root', root];
        check('control exe is the packaged Node', exeVerdict({ exe: join(prefix, 'node/bin/node'), prefix }), null);
        check('exe from another Node', exeVerdict({ exe: other, prefix }), 'not the packaged Node');
        check('control web root under GreD', rootVerdict({ cmdline: argv(join(prefix, 'orca/out/web')), prefix }), null);
        check('web root not under GreD', rootVerdict({ cmdline: argv(join(REPO_ROOT, 'orca/out/web')), prefix }), 'not from the packaged');
        check('web root a sibling with the GreD prefix', rootVerdict({ cmdline: argv(join(prefix, 'orca/out/web-old')), prefix }), 'not from the packaged');
        check('no --web-client-root', rootVerdict({ cmdline: ['node', 'orcad.js'], prefix }), 'no --web-client-root');
        const before = [{ pid: 101, ticks: '5', what: 'orcad' }, { pid: 102, ticks: '6', what: 'terminal daemon' }];
        check('control nothing alive after quit', survivorVerdict(before, new Map([[101, '9']])), null);
        check('survivor after quit', survivorVerdict(before, new Map([[102, '6']])), 'terminal daemon pid 102 survived');
        check('nothing recorded before quit', survivorVerdict([], new Map()), 'vacuous');
        check('control paired', pairVerdict({ paired: true }), null);
        check('paired=false', pairVerdict({ paired: false }), 'did not pair');
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
    if (misses) { console.error(`${NAME} self-test: FAIL -- ${misses} case(s) missed`); return 1; }
    console.log(`${NAME} self-test: PASS -- every control green and every planted fault went red naming the drift`);
    return 0;
}

// --- live run ----------------------------------------------------------------

const argvOf = (pid) => { try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean); } catch { return []; } };

async function chromeJson(app, expr) {
    return JSON.parse(await app.evaluateIn(app.chrome, `(() => { try { return JSON.stringify(${expr}); } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`));
}

async function live() {
    const { extractPackage } = await import('./lib/built-tree.mjs');
    let prefix;
    try {
        prefix = extractPackage();
    } catch (e) {
        console.error(`${NAME}: FAIL -- no container-built tarball: ${e.message}. Next step: run: ${BUILD_CMD}`);
        return 1;
    }
    const fails = [];
    try {
        await runPackaged(prefix, fails);
    } catch (e) {
        fails.push(`harness: ${e.message}`);
    } finally {
        rmSync(dirname(prefix), { recursive: true, force: true });
    }
    if (fails.length) { for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`); return 1; }
    console.log(`${NAME}: PASS -- the packaged PowerBrowser ran orcad on its own node/bin/node with the web client from <GreD>/orca/out/web, a quit left no orcad or terminal daemon, and the packaged web client paired in a web tab`);
    return 0;
}

async function runPackaged(prefix, fails) {
    const { resolveConfig } = await import('./generate.mjs');
    const { config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'));
    const bin = join(prefix, config.identity.binary_name);
    for (const rel of [config.identity.binary_name, 'node/bin/node', 'orca/package.json', 'orca/out/orcad/orcad.js', 'orca/out/web']) {
        if (!existsSync(join(prefix, rel))) fails.push(`the package lacks ${rel}. Next step: rebuild it: ${BUILD_CMD}`);
    }
    if (fails.length) return;
    // The launch must use the install's own resolution and a clean Orca environment.
    delete process.env.PB_BACKEND_MAIN;
    for (const k of Object.keys(process.env)) if (k.startsWith('ORCA_')) delete process.env[k];
    process.env.PB_FIREFOX_BIN = bin;
    process.env.MOZ_PURGE_CACHES = '1';

    const { makeProfile, withShell, pollFor } = await import('./lib/pb-relaunch.mjs');
    const { launchedBrowserPids } = await import('./lib/firefox-bidi.mjs');
    const { descendants, orcadEnv, orcaVersionFromPins, startOrcad, stopOrcad, installOutputRedaction, redact } = await import('./lib/orca-run.mjs');
    const { ppidMap, startTicks } = await import('./verify-orca-hidden-electron.mjs');

    // 1. Launch, find orcad, judge its Node and web root, quit, judge the survivors.
    const profile = await makeProfile();
    const recorded = [];
    try {
        await withShell(profile, async (app) => {
            const state = await pollFor(async () => {
                const s = await chromeJson(app, `ChromeUtils.importESModule(${JSON.stringify(SERVICE_URL)}).OrcaService.getState()`);
                if (s.chromeError) throw new Error(`chrome could not load OrcaService.sys.mjs (${s.chromeError})`);
                if (s.state === 'failed') throw new Error(`OrcaService failed to start orcad: ${JSON.stringify(await chromeJson(app, `ChromeUtils.importESModule(${JSON.stringify(SERVICE_URL)}).OrcaService.getDiagnosticRows()`))}`);
                return s.state === 'ready' ? s : null;
            }, 90000, 'OrcaService to reach ready');
            const orcads = [...descendants(ppidMap(), launchedBrowserPids())].filter((pid) => argvOf(pid).includes('--web-client-root'));
            if (orcads.length !== 1) {
                fails.push(`found ${orcads.length} orcad processes (by --web-client-root) under the packaged PowerBrowser, not one`);
            } else {
                const [pid] = orcads;
                fails.push(...exeVerdict({ exe: `/proc/${pid}/exe`, prefix }), ...rootVerdict({ cmdline: argvOf(pid), prefix }));
                for (const [p, what] of [[pid, 'orcad'], [state.daemonPid, 'terminal daemon']]) {
                    const ticks = Number.isInteger(p) ? startTicks(p) : null;
                    if (ticks !== null) recorded.push({ pid: p, ticks, what });
                }
            }
            if (await app.quit({ timeoutMs: 30000 }) !== 'exited') fails.push('the packaged PowerBrowser did not exit within 30 s of the quit');
        });
    } finally {
        await profile.dispose();
    }
    const until = Date.now() + 25000;
    const alive = () => new Map(recorded.map((p) => [p.pid, startTicks(p.pid)]).filter(([, t]) => t !== null));
    while (Date.now() < until && survivorVerdict(recorded, alive()).length) await new Promise((r) => setTimeout(r, 500));
    fails.push(...survivorVerdict(recorded, alive()));

    // 2. Pair a web tab against the packaged root. The export is confirmed in the text before the import.
    // The one line naming the module: its text is read for the export check, and the import is dynamic.
    const [slotless, loadSlotless] = [readFileSync(new URL('./verify-orca-slotless-start.mjs', import.meta.url), 'utf8'), () => import('./verify-orca-slotless-start.mjs')];
    if (!['pairWebTab', 'deriveMarker'].every((n) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b`).test(slotless))) {
        fails.push(`the slotless-start check does not export pairWebTab and deriveMarker. Next step: merge lane p68-02 (it exports both behind an entry-point guard), then re-run.`);
        return;
    }
    const { pairWebTab, deriveMarker } = await loadSlotless();
    const profileDir = mkdtempSync(join(tmpdir(), `${NAME}-orcad-`));
    const run = { child: null, ready: null, restore: () => {} };
    const pairFails = [];
    try {
        Object.assign(run, await startOrcad({ nodeBin: join(prefix, 'node', 'bin', 'node'), orcaDir: join(prefix, 'orca'), profileDir, env: orcadEnv(process.env, { profileDir, orcaVersion: orcaVersionFromPins() }) }));
        run.restore = installOutputRedaction(run.ready.secrets);
        await pairWebTab(run, { marker: deriveMarker(join(REPO_ROOT, 'orca')), fails: pairFails });
    } catch (e) {
        if (e.child) run.child = e.child;
        pairFails.push(`the packaged orcad could not be started for pairing: ${redact(e.message)}`);
    } finally {
        if (run.child) await stopOrcad(run.child, run.ready?.daemonPid ?? null);
        run.restore();
        rmSync(profileDir, { recursive: true, force: true });
    }
    fails.push(...pairFails, ...pairVerdict({ paired: pairFails.length === 0 }));
}

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}' (usage: node ${SELF_REL} [--self-test])`);
        console.error(`  Next step: run node ${SELF_REL} --self-test`);
        process.exit(2);
    }
}
process.exit(args.includes('--self-test') ? selfTest() : await live());
