#!/usr/bin/env node
// scripts/drive-mar-update-hop.mjs
//
// The WebDriver hop driver (46-05, UPD-24, 46-VERIFICATION.md G2). It produces
// the evidence scripts/verify-mar-update-hop.mjs (row mar-update-hop) verifies:
// one N to N+1 update over loopback, with the in-app experience driven and
// observed rather than typed into hop.json by hand.
//
// What it does, in order:
//   1. Reads N and N+1 identity from the two packaged trees' application.ini and
//      platform.ini, and refuses when N+1 does not compare above N or the build
//      IDs are equal (a same-version loop is plumbing, never the proof).
//   2. Serves update.xml (emitted by the verifier's own buildUpdateXml) and the
//      signed N+1 MAR on 127.0.0.1, writing a python-http.server-shaped access log.
//   3. Stages a copy of the N tree with distribution/policies.json AppUpdateURL
//      at the loopback descriptor (docs/BUILD.md step 5), and a test profile.
//   4. Launch 1 over WebDriver BiDi, shell stdout captured to client-update.log:
//      opens a marker web tab, records a layout fingerprint, waits for the
//      notification carrying the contracted Restart now button, records its
//      text, and clicks it. Then polls the staged application.ini for the N+1
//      flip. The restarted process runs outside the launcher's handle (08-04,
//      the updater relaunches the app), so it is found by its --profile argument
//      in /proc and stopped with SIGTERM, which Gecko handles as a normal quit.
//   5. Launch 2 on the same profile: Services.appinfo version and appBuildID, and
//      the layout fingerprint again (the marker tab must have survived).
//   6. A read-only copy of N (write bits removed) on a fresh profile: records the
//      notification carrying the Open download page button, and whether any
//      Restart now notification appeared.
//   7. Writes hop.json and the logs under .mozbuild/mar-hop/ and runs the
//      verifier's runChecks over them.
//
// An existing .mozbuild/mar-hop/ holding a hop.json is moved to
// .mozbuild/mar-hop.prev-<stamp>/ first; nothing is deleted.
//
// Needs tier-3 N and N+1 builds (docs/BUILD.md "MAR build and serve loop"). No
// network beyond loopback. --self-test needs no build, browser or network.
//
// Usage:
//   node scripts/drive-mar-update-hop.mjs --n <N app dir> --nplus1 <N+1 app dir> \
//     [--mar <signed nplus1.mar>] [--display-version <N+1 display version>]
//   node scripts/drive-mar-update-hop.mjs --self-test

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
    appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
    renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildUpdateXml, compareDotted, contractedUpdateStrings, runChecks } from './verify-mar-update-hop.mjs';

const NAME = 'drive-mar-update-hop';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_REL = join('.mozbuild', 'mar-hop');
const COPY_REL = 'theia/extensions/branding/src/browser/powerbrowser-update-copy.ts';
const NPLUS1_VERSION_DIR = 'powerbrowser/packaging/version-nplus1';
const MARKER_PATH = '/layout-marker.html';
const MARKER_TITLE = 'hop layout marker';
// Side view containers persist across a restart; the main area is judged by the marker tab only
// (a terminal or the welcome page need not come back, and is not the layout under test).
const LAYOUT_AREAS = ['left', 'right'];

// --- pure helpers (exercised by --self-test) -------------------------------------

/** The `key=value` lines of an ini file (first occurrence wins). */
export function parseIni(text) {
    const out = {};
    for (const line of text.split('\n')) {
        const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line.trim());
        if (m && !(m[1] in out)) out[m[1]] = m[2];
    }
    return out;
}

/** Version, buildID and platform version of a packaged app dir. */
export function appIdentity(appDir) {
    const app = parseIni(readFileSync(join(appDir, 'application.ini'), 'utf8'));
    const platformIni = join(appDir, 'platform.ini');
    const platform = existsSync(platformIni) ? parseIni(readFileSync(platformIni, 'utf8')) : {};
    return { version: app.Version, buildID: app.BuildID, platformVersion: platform.Milestone ?? app.Version };
}

/** Null when N+1 is a real upgrade over N, else the refusal text. */
export function versionRefusal(n, nplus1) {
    const cmp = compareDotted(nplus1.version, n.version);
    if (cmp === null) return `N ${n.version} or N+1 ${nplus1.version} is not a dotted version (read from application.ini)`;
    if (cmp <= 0) {
        return `N+1 ${nplus1.version} does not compare above N ${n.version}. Next step: bump ${NPLUS1_VERSION_DIR}/ above N and rebuild N+1 per docs/BUILD.md`;
    }
    if (n.buildID === nplus1.buildID) return `N and N+1 share buildID ${n.buildID}; they are the same build. Next step: build N+1 in its own objdir`;
    return null;
}

/** A button label (or body) from the update copy contribution, by key. */
export function copyValue(copySrc, key) {
    const m = copySrc.match(new RegExp(`${key}\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'`));
    return m ? m[1].replace(/\\'/g, "'") : null;
}

/** One access-log line in the shape python3 -m http.server writes (the verifier greps GET and the path). */
export function accessLine(method, path, status, when = new Date()) {
    return `127.0.0.1 - - [${when.toISOString()}] "${method} ${path} HTTP/1.1" ${status} -\n`;
}

/** True when every pre-restart layout entry is back after the restart and the marker tab is among them. */
export function layoutSurvived(before, after) {
    if (!Array.isArray(before) || !Array.isArray(after)) return false;
    if (!before.some(entry => entry.includes(MARKER_TITLE))) return false;
    return before.every(entry => after.includes(entry));
}

/**
 * Pick the notification carrying `label` from a DOM read ({ text, actions }[]). Null when none.
 */
export function notificationWith(items, label) {
    return (items ?? []).find(item => Array.isArray(item.actions) && item.actions.includes(label)) ?? null;
}

/** hop.json from what the run observed. Every transcript field is an observation; nothing is defaulted to a pass. */
export function composeHop({ n, nplus1, displayVersion, port, captureText, launch1, postHop, launch2, readOnly }) {
    const base = `http://127.0.0.1:${port}`;
    return {
        served: 'loopback',
        n: { version: n.version, buildID: n.buildID },
        nplus1: { version: nplus1.version, buildID: nplus1.buildID, platformVersion: nplus1.platformVersion, displayVersion },
        mar: 'nplus1.mar',
        descriptor: 'update.xml',
        servedUrl: `${base}/update.xml`,
        servedMarUrl: `${base}/nplus1.mar`,
        result: postHop.version === nplus1.version && postHop.buildID === nplus1.buildID ? 'applied' : 'not-applied',
        postHop: { version: postHop.version, buildID: postHop.buildID },
        transcript: {
            readyNotification: launch1.ready ? launch1.ready.text : null,
            evidence: { file: 'client-update.log', sha256: createHash('sha256').update(captureText).digest('hex') },
            restartClicked: launch1.clicked === true,
            postVersion: launch2.version ?? null,
            postBuildID: launch2.buildID ?? null,
            layoutRestored: layoutSurvived(launch1.layout, launch2.layout),
        },
        readOnly: {
            cannotUpdate: readOnly.cannotUpdate ? readOnly.cannotUpdate.text : null,
            recordedReady: readOnly.ready !== null,
        },
    };
}

/** Writes the evidence files the verifier reads into `evDir`. The MAR is copied by the caller. */
export function writeEvidence(evDir, { hop, descriptor, captureText, resolverText }) {
    mkdirSync(evDir, { recursive: true });
    writeFileSync(join(evDir, 'update.xml'), descriptor);
    writeFileSync(join(evDir, 'client-update.log'), captureText);
    writeFileSync(join(evDir, 'client-resolver.log'), resolverText);
    writeFileSync(join(evDir, 'hop.json'), JSON.stringify(hop, null, 2) + '\n');
}

// --- live run --------------------------------------------------------------------

function parseArgs(argv) {
    const known = new Set(['--n', '--nplus1', '--mar', '--display-version']);
    const out = {};
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--self-test') { out.selfTest = true; continue; }
        if (!known.has(argv[i]) || argv[i + 1] === undefined) {
            console.error(`${NAME}: FAIL -- unknown or incomplete argument '${argv[i]}'`);
            process.exit(2);
        }
        out[argv[i].slice(2)] = argv[i + 1];
        i += 1;
    }
    return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function until(fn, timeoutMs, what) {
    const end = Date.now() + timeoutMs;
    for (;;) {
        let value;
        try { value = await fn(); } catch { value = undefined; }
        if (value) return value;
        if (Date.now() > end) throw new Error(`timed out after ${Math.round(timeoutMs / 1000)} s waiting for ${what}`);
        await sleep(500);
    }
}

/** Pids whose command line names `profileDir` (the restarted instance carries the same --profile argument). */
function pidsOnProfile(profileDir) {
    const pids = [];
    for (const entry of readdirSync('/proc')) {
        if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue;
        try {
            const argv = readFileSync(`/proc/${entry}/cmdline`, 'utf8').split('\0');
            if (argv.includes(profileDir)) pids.push(Number(entry));
        } catch { /* exited */ }
    }
    return pids;
}

async function stopProfileInstances(profileDir, settleMs) {
    // shortcut: a fixed settle lets the relaunched instance finish startup before SIGTERM; raise it if layout restore is slow on the host.
    const pids = await until(() => { const p = pidsOnProfile(profileDir); return p.length ? p : null; }, 120000, 'the restarted instance')
        .catch(() => []);
    if (pids.length) await sleep(settleMs);
    for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
    try {
        await until(() => pidsOnProfile(profileDir).length === 0, 60000, 'the restarted instance to exit');
    } catch {
        for (const pid of pidsOnProfile(profileDir)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
    }
    return pids.length;
}

function setWritable(root, writable) {
    const walk = p => {
        const st = statSync(p, { throwIfNoEntry: false });
        if (!st || st.isSymbolicLink()) return;
        if (st.isDirectory() && writable) chmodSync(p, st.mode | 0o200);
        if (st.isDirectory()) for (const e of readdirSync(p)) walk(join(p, e));
        chmodSync(p, writable ? st.mode | 0o200 : st.mode & ~0o222);
    };
    walk(root);
}

function stageInstall(nDir, dest, servedUrl) {
    cpSync(nDir, dest, { recursive: true, verbatimSymlinks: true });
    const policiesPath = join(dest, 'distribution', 'policies.json');
    const doc = existsSync(policiesPath) ? JSON.parse(readFileSync(policiesPath, 'utf8')) : {};
    doc.policies = { ...(doc.policies ?? {}), AppUpdateURL: servedUrl };
    mkdirSync(dirname(policiesPath), { recursive: true });
    writeFileSync(policiesPath, JSON.stringify(doc, null, 2) + '\n');
}

function startServer(files, logPath) {
    const server = createServer((req, res) => {
        const path = new URL(req.url, 'http://127.0.0.1').pathname;
        const body = files[path];
        const status = body === undefined ? 404 : 200;
        appendFileSync(logPath, accessLine(req.method, req.url, status));
        if (body === undefined) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'content-type': path.endsWith('.html') ? 'text/html' : path.endsWith('.xml') ? 'text/xml' : 'application/octet-stream' });
        res.end(typeof body === 'function' ? body() : body);
    });
    return new Promise((ok, fail) => {
        server.on('error', fail);
        server.listen(0, '127.0.0.1', () => ok({ port: server.address().port, close: () => new Promise(r => server.close(r)) }));
    });
}

const NOTIFICATIONS_EXPR = `JSON.stringify([...document.querySelectorAll('.theia-notification-list-item')].map(item => ({
    text: (item.querySelector('.theia-notification-message')?.textContent ?? '').trim(),
    actions: [...item.querySelectorAll('button.theia-button')].map(b => b.dataset.action),
})))`;

const clickExpr = (label, text) => `(() => {
    const button = [...document.querySelectorAll('button.theia-button')].find(b => b.dataset.action === ${JSON.stringify(label)}
        && (b.closest('.theia-notification-list-item')?.querySelector('.theia-notification-message')?.textContent ?? '').trim() === ${JSON.stringify(text)});
    if (!button) return false;
    button.click();
    return true;
})()`;

const LAYOUT_BODY = `const shell = get('ApplicationShell');
    const side = ${JSON.stringify(LAYOUT_AREAS)}.flatMap(area => shell.getWidgets(area).map(w => area + ':' + w.title.label));
    const marker = shell.getWidgets('main').map(w => 'main:' + w.title.label).filter(e => e.includes(${JSON.stringify(MARKER_TITLE)}));
    return [...side, ...marker].sort();`;

async function live(opts) {
    const { withFirefoxPage } = await import('./lib/firefox-bidi.mjs');
    const { makeProfile, probe, GET_BY_NAME, SHELL_DOCUMENT_URL } = await import('./lib/pb-relaunch.mjs');
    const { openWebTab } = await import('./lib/pb-live-probe.mjs');

    if (!opts.n || !opts.nplus1) {
        console.error(`${NAME}: FAIL -- --n <N app dir> and --nplus1 <N+1 app dir> are required (the packaged dist/powerbrowser trees)`);
        process.exit(2);
    }
    const nDir = resolve(opts.n);
    const evDir = join(REPO_ROOT, EVIDENCE_REL);
    let marPath = resolve(opts.mar ?? join(evDir, 'nplus1.mar'));
    for (const p of [join(nDir, 'application.ini'), join(resolve(opts.nplus1), 'application.ini'), marPath]) {
        if (!existsSync(p)) { console.error(`${NAME}: FAIL -- ${p} does not exist`); process.exit(2); }
    }
    const n = appIdentity(nDir);
    const nplus1 = appIdentity(resolve(opts.nplus1));
    const refusal = versionRefusal(n, nplus1);
    if (refusal) { console.error(`${NAME}: FAIL -- ${refusal}`); process.exit(1); }
    const displayVersion = opts['display-version']
        ?? readFileSync(join(REPO_ROOT, NPLUS1_VERSION_DIR, 'version_display.txt'), 'utf8').trim();
    const copySrc = readFileSync(join(REPO_ROOT, COPY_REL), 'utf8');
    const restartNow = copyValue(copySrc, 'restartNowLabel');
    const openDownload = copyValue(copySrc, 'openDownloadPageLabel');

    if (existsSync(join(evDir, 'hop.json'))) {
        const prev = `${evDir}.prev-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        renameSync(evDir, prev);
        if (marPath.startsWith(evDir + '/')) marPath = join(prev, marPath.slice(evDir.length + 1));
        console.log(`${NAME}: previous evidence moved to ${prev}`);
    }
    mkdirSync(evDir, { recursive: true });
    const marBytes = readFileSync(marPath);
    if (marPath !== join(evDir, 'nplus1.mar')) writeFileSync(join(evDir, 'nplus1.mar'), marBytes);
    const accessLog = join(evDir, 'server-access.log');
    writeFileSync(accessLog, '');

    let descriptor = '';
    const server = await startServer({
        '/update.xml': () => descriptor,
        '/nplus1.mar': marBytes,
        [MARKER_PATH]: `<!doctype html><title>${MARKER_TITLE}</title><p>${MARKER_TITLE}</p>`,
    }, accessLog);
    const base = `http://127.0.0.1:${server.port}`;
    descriptor = buildUpdateXml({
        marBytes, marUrl: `${base}/nplus1.mar`, appVersion: nplus1.version,
        platformVersion: nplus1.platformVersion, buildID: nplus1.buildID, displayVersion,
    });

    const work = mkdtempSync(join(tmpdir(), 'pb-mar-hop-'));
    const installN = join(work, 'install-n');
    const installRo = join(work, 'install-ro');
    const capture = join(work, 'client-update.log');
    const prefs = {
        'app.update.log': true,
        'app.update.interval': 60,
        'app.update.timerMinimumDelay': 5,
        'app.update.background.force': true,
        'services.settings.server': '',
    };
    Object.assign(process.env, {
        MOZ_REMOTE_SETTINGS_DEVTOOLS: '1',
        MOZ_LOG: 'append,nsHostResolver:5',
        MOZ_LOG_FILE: join(work, 'client'),
    });
    const profiles = [];
    try {
        stageInstall(nDir, installN, `${base}/update.xml`);
        process.env.LD_LIBRARY_PATH = [installN, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
        const bin = join(installN, 'powerbrowser');
        const profile = await makeProfile(prefs);
        profiles.push(profile);
        const readyShell = async waitFor => {
            await waitFor('window.theia && window.theia.container ? true : false', { timeoutMs: 120000 });
            await waitFor(`(() => { try { ${GET_BY_NAME}
                return __getByName(window.theia.container, 'FrontendApplicationStateService').state === 'ready';
            } catch (e) { return false; } })()`, { timeoutMs: 120000 });
        };
        const notifications = async evaluate => JSON.parse(await evaluate(NOTIFICATIONS_EXPR));

        // Launch 1: marker tab, layout, ready notification, Restart now.
        console.log(`${NAME}: launch 1 (N ${n.version}) -- waiting for the update to stage`);
        const launch1 = await withFirefoxPage('', async ({ evaluate, waitFor }) => {
            await readyShell(waitFor);
            const app = { evaluate };
            await openWebTab(app, `${base}${MARKER_PATH}`);
            const layout = await until(async () => {
                const l = await probe(app, LAYOUT_BODY);
                return Array.isArray(l) && l.some(e => e.includes(MARKER_TITLE)) ? l : null;
            }, 60000, 'the marker tab in the layout');
            const ready = await until(async () => notificationWith(await notifications(evaluate), restartNow), 1800000, `a notification with ${restartNow}`);
            const clicked = await evaluate(clickExpr(restartNow, ready.text)).catch(() => false);
            // The click quits this process; nothing below may use the BiDi session.
            await until(() => appIdentity(installN).version === nplus1.version, 600000, 'the staged application.ini to read N+1').catch(() => undefined);
            return { layout, ready, clicked };
        }, { binPath: bin, stdoutPath: capture, profileDir: profile.profileDir });
        const relaunched = await stopProfileInstances(profile.profileDir, 30000);
        const postHop = appIdentity(installN);
        console.log(`${NAME}: post-hop application.ini ${postHop.version}/${postHop.buildID}; restarted instances stopped: ${relaunched}`);

        // Launch 2: what the running app reports, and the layout.
        const launch2 = await withFirefoxPage('', async ({ evaluate, evaluateIn, send, waitFor }) => {
            await readyShell(waitFor);
            const tree = await send('browsingContext.getTree', { 'moz:scope': 'chrome' });
            const chrome = tree.contexts.find(c => c.url === SHELL_DOCUMENT_URL)?.context;
            const info = chrome
                ? JSON.parse(await evaluateIn(chrome, 'JSON.stringify({ version: Services.appinfo.version, buildID: Services.appinfo.appBuildID })'))
                : {};
            const layout = await until(async () => {
                const l = await probe({ evaluate }, LAYOUT_BODY);
                return Array.isArray(l) && l.some(e => e.includes(MARKER_TITLE)) ? l : null;
            }, 30000, 'the restored marker tab').catch(() => probe({ evaluate }, LAYOUT_BODY));
            return { ...info, layout };
        }, { binPath: bin, profileDir: profile.profileDir });

        // Read-only variant: a fresh copy of N with write bits removed.
        console.log(`${NAME}: read-only launch (N ${n.version})`);
        stageInstall(nDir, installRo, `${base}/update.xml`);
        setWritable(installRo, false);
        process.env.LD_LIBRARY_PATH = [installRo, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
        const roProfile = await makeProfile(prefs);
        profiles.push(roProfile);
        const readOnly = await withFirefoxPage('', async ({ evaluate, waitFor }) => {
            await readyShell(waitFor);
            const seen = await until(async () => {
                const items = await notifications(evaluate);
                return notificationWith(items, openDownload) || notificationWith(items, restartNow) ? items : null;
            }, 1800000, `a notification with ${openDownload} or ${restartNow}`);
            return { cannotUpdate: notificationWith(seen, openDownload), ready: notificationWith(seen, restartNow) };
        }, { binPath: join(installRo, 'powerbrowser'), stdoutPath: join(work, 'client-readonly.log'), profileDir: roProfile.profileDir });
        await stopProfileInstances(roProfile.profileDir, 0);

        const captureText = readFileSync(capture, 'utf8');
        const resolverText = readdirSync(work).filter(f => f.startsWith('client') && f.endsWith('.moz_log')).sort()
            .map(f => readFileSync(join(work, f), 'utf8')).join('');
        const hop = composeHop({ n, nplus1, displayVersion, port: server.port, captureText, launch1, postHop, launch2, readOnly });
        writeEvidence(evDir, { hop, descriptor, captureText, resolverText });
        console.log(`${NAME}: evidence written to ${EVIDENCE_REL}/`);
    } finally {
        await server.close();
        if (existsSync(installRo)) setWritable(installRo, true);
        for (const p of profiles) await p.dispose();
        rmSync(work, { recursive: true, force: true });
    }

    const result = runChecks(REPO_ROOT);
    if (result.failures.length) {
        console.error(`${NAME}: FAIL -- the evidence does not verify (${result.failures.length} problem(s)):`);
        for (const f of result.failures) console.error(`  - ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- hop driven and verified; scripts/verify-platform.sh --only mar-update-hop reads the same evidence`);
}

// --- --self-test -----------------------------------------------------------------
//
// Fixture observations go through composeHop and writeEvidence (the live run's
// writer) into a mkdtemp tree, and the verifier's runChecks judges them: control
// green first, then one plant per observation the driver owns, each red naming
// its field. No build, browser, display or network.
function selfTest() {
    const dir = mkdtempSync(join(tmpdir(), `${NAME}-selftest-`));
    let ok = true;
    const copySrc = readFileSync(join(REPO_ROOT, COPY_REL), 'utf8');
    const contracted = contractedUpdateStrings(copySrc);
    const restartNow = copyValue(copySrc, 'restartNowLabel');
    const openDownload = copyValue(copySrc, 'openDownloadPageLabel');
    const n = { version: '153.5.1', buildID: '20261101000000', platformVersion: '153.5.1' };
    const nplus1 = { version: '153.5.2', buildID: '20261102000000', platformVersion: '153.5.1' };
    const port = 41234;
    const marBytes = randomBytes(4096);
    const layout = [`main:${MARKER_TITLE}`, 'left:Explorer'];
    const observed = () => ({
        launch1: { layout: [...layout], ready: { text: contracted.readyBody.replace('<version>', nplus1.version), actions: [restartNow, 'Later'] }, clicked: true },
        postHop: { version: nplus1.version, buildID: nplus1.buildID },
        launch2: { version: nplus1.version, buildID: nplus1.buildID, layout: [...layout, 'bottom:Problems'] },
        readOnly: { cannotUpdate: { text: contracted.cannotUpdateBody, actions: [openDownload] }, ready: null },
    });
    const judge = (obs) => {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(join(dir, dirname(COPY_REL)), { recursive: true });
        writeFileSync(join(dir, 'configuration.toml'), readFileSync(join(REPO_ROOT, 'configuration.toml')));
        writeFileSync(join(dir, COPY_REL), copySrc);
        const evDir = join(dir, EVIDENCE_REL);
        const captureText = `[PowerBrowserAPI] info: [update-observer] appUpdate status=ready version=${nplus1.version}\n`;
        const hop = composeHop({ n, nplus1, displayVersion: `${nplus1.version}esr`, port, captureText, ...obs });
        const descriptor = buildUpdateXml({
            marBytes, marUrl: hop.servedMarUrl, appVersion: nplus1.version,
            platformVersion: nplus1.platformVersion, buildID: nplus1.buildID, displayVersion: `${nplus1.version}esr`,
        });
        writeEvidence(evDir, { hop, descriptor, captureText, resolverText: 'D/nsHostResolver Resolving host [127.0.0.1]\n' });
        writeFileSync(join(evDir, 'nplus1.mar'), marBytes);
        writeFileSync(join(evDir, 'server-access.log'), accessLine('GET', '/update.xml', 200) + accessLine('GET', '/nplus1.mar', 200));
        return runChecks(dir).failures;
    };
    const expectRed = (label, mutate, needle) => {
        const obs = observed();
        mutate(obs);
        const failures = judge(obs);
        if (failures.some(f => f.includes(needle))) {
            console.log(`${NAME}: --self-test -- ${label}: red naming ${needle}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- ${label} was not rejected naming ${needle}; got: ${failures.join(' | ') || '(no failures)'}`);
            ok = false;
        }
    };
    try {
        const control = judge(observed());
        if (control.length) {
            console.error(`${NAME}: --self-test FAIL -- control evidence did not verify:`);
            for (const f of control) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- control: driver evidence verifies through runChecks (GREEN)`);
        }
        expectRed('ready notification observed for N, not N+1', o => { o.launch1.ready.text = contracted.readyBody.replace('<version>', n.version); }, 'ready notification text');
        expectRed('no ready notification observed', o => { o.launch1.ready = null; }, 'ready notification text');
        expectRed('Restart now click did not happen', o => { o.launch1.clicked = false; }, 'Restart-now click');
        expectRed('relaunch still reports N', o => { o.launch2.version = n.version; }, 'transcript post-restart version');
        expectRed('marker tab lost across the restart', o => { o.launch2.layout = ['left:Explorer']; }, 'layout restored');
        expectRed('application.ini never flipped', o => { o.postHop = { version: n.version, buildID: n.buildID }; }, 'hop result');
        expectRed('read-only run showed a ready notification', o => { o.readOnly = { cannotUpdate: null, ready: o.launch1.ready }; }, 'read-only cannot-update text');
        for (const [label, a, b, want] of [
            ['N+1 equal to N', n, { ...nplus1, version: n.version }, NPLUS1_VERSION_DIR],
            ['N+1 below N', n, { ...nplus1, version: '153.1.1' }, NPLUS1_VERSION_DIR],
            ['shared buildID', n, { ...nplus1, buildID: n.buildID }, 'same build'],
        ]) {
            const msg = versionRefusal(a, b);
            if (msg && msg.includes(want)) console.log(`${NAME}: --self-test -- version guard refuses ${label}`);
            else { console.error(`${NAME}: --self-test FAIL -- version guard let ${label} through (${msg})`); ok = false; }
        }
        if (versionRefusal(n, nplus1) !== null) { console.error(`${NAME}: --self-test FAIL -- version guard refused a real upgrade`); ok = false; }
        if (restartNow === null || openDownload === null) { console.error(`${NAME}: --self-test FAIL -- button labels not derivable from ${COPY_REL}`); ok = false; }
        const noArgs = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8' });
        if (noArgs.status === 2 && noArgs.stderr.includes('--nplus1')) console.log(`${NAME}: --self-test -- a run without --n/--nplus1 exits 2 naming them`);
        else { console.error(`${NAME}: --self-test FAIL -- a run without arguments exited ${noArgs.status}: ${noArgs.stderr.trim()}`); ok = false; }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    if (!ok) { console.error(`${NAME}: --self-test FAIL`); process.exit(1); }
    console.log(`${NAME}: --self-test PASS -- control green, every plant red`);
}

const opts = parseArgs(process.argv.slice(2));
if (opts.selfTest) selfTest();
else await live(opts);
