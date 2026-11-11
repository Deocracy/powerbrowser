// scripts/lib/orca-pane-harness.mjs
//
// Phase 64 (TAB-04, TAB-06, TERM-01; P64-03, P64-25, P64-32): the live harness the Orca pane
// checks share. withOrcaPaneSession({ log }, fn):
//   - installs output redaction before anything else and removes every inherited ORCA_* and
//     Node-steering variable from process.env (this tree is worked on from inside Orca desktop);
//   - starts a scratch orcad through orca-run.mjs on a scratch profile under
//     .mozbuild/orca-pane-harness, behind an alias under ~/.cache (the socket path limit);
//   - creates a throwaway git repo (one live merge conflict, UU README.md) and registers it;
//   - serves, from a loopback HTTP server: the pane bundle (/pb-panes/), the React-bundled
//     standalone variant (/standalone/) and a generated standalone page (/standalone.html);
//   - launches PowerBrowser through pb-live-probe.mjs (firefox-bidi.mjs: PB_FIREFOX_BIN and
//     PB_BACKEND_MAIN honoured, MOZ_PURGE_CACHES=1) and hands fn a context.
// With { pbOrcad: true } PowerBrowser also runs its own orcad (OrcaService, on this tree's orca/,
// a free port and the PB Node), so the real orca-panes widgets get a hand-off: ctx.startPbOrcad()
// waits for it, registers the throwaway repo there and returns its CLI as ctx.pbOrca(...argv).
// The pairing offer stays in memory: it reaches a page only inside a BiDi expression and is never
// printed, logged or written. Teardown stops only the processes this session started.
//
// Node built-ins and the repo's lib modules only.

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, normalize, sep } from 'node:path';

import { REPO_ROOT, ensurePbNode, installOutputRedaction, orcaVersionFromPins, orcadEnv, redact, startOrcad, stopOrcad } from './orca-run.mjs';
import { openWebTab, pollFor, withProbeShell } from './pb-live-probe.mjs';

export const ORCA_DIR = join(REPO_ROOT, 'orca');
export const PANES_DIR = join(ORCA_DIR, 'out', 'web', 'assets', 'pb-panes');
export const STANDALONE_DIR = join(REPO_ROOT, '.mozbuild', 'orca-panes-standalone');
export const CLI_JS = join(ORCA_DIR, 'out', 'cli', 'index.js');
export const BUNDLE_KEY = 'powerbrowser.orca-panes.react';
const WORK = join(REPO_ROOT, '.mozbuild', 'orca-pane-harness');
const PROFILE_REAL = join(WORK, 'orca-profile');
const PROFILE_ALIAS = join(homedir(), '.cache', 'pb-orca-pane-harness');
const REPO_DIR = join(WORK, 'repo');
const J = JSON.stringify;
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Scrubs inherited ORCA_* and Node-steering names from this process's environment. */
export function scrubEnv(env = process.env) {
    for (const name of Object.keys(env)) {
        if (name.startsWith('ORCA_') || ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_REPL_EXTERNAL_MODULE'].includes(name)) delete env[name];
    }
}

/** The named SKIP reasons of a live pane check, derived from the tree; empty when it can run. */
export function skipReasons({ needStandalone = false } = {}) {
    const bin = process.env.PB_FIREFOX_BIN || join(REPO_ROOT, 'objdir', 'dist', 'bin', 'powerbrowser');
    const out = [];
    if (!existsSync(bin)) out.push(`no built PowerBrowser (${bin})`);
    if (!existsSync(join(PANES_DIR, 'pb-panes.js'))) out.push('no orca/out/web/assets/pb-panes (run nix develop .#orca --command bash scripts/build-orca.sh)');
    if (!existsSync(CLI_JS)) out.push('no Orca CLI (orca/out/cli/index.js; build it as 60-EXT01-RECORD.md records)');
    if (!existsSync(join(ORCA_DIR, 'out', 'orcad', 'orcad.js'))) out.push('no built orcad (orca/out/orcad/orcad.js)');
    if (needStandalone && !existsSync(join(STANDALONE_DIR, 'pb-panes.js'))) out.push('no standalone variant (bash scripts/build-orca-panes.sh --standalone)');
    return out;
}

function git(...argv) {
    const r = spawnSync('git', ['-c', 'user.name=pb-orca-pane', '-c', 'user.email=pb-orca-pane@invalid', ...argv], { cwd: REPO_DIR, encoding: 'utf8' });
    if (r.status !== 0 && argv[0] !== 'merge') throw new Error(`git ${argv[0]}: ${r.stderr.trim().split('\n').pop()}`);
    return r.stdout.trim();
}

/** A throwaway repo whose worktree holds one live merge conflict (README.md, both modified). */
function makeRepo() {
    rmSync(REPO_DIR, { recursive: true, force: true });
    mkdirSync(REPO_DIR, { recursive: true });
    git('init', '-q', '-b', 'main');
    writeFileSync(join(REPO_DIR, 'README.md'), 'orca pane harness\nline\n');
    git('add', 'README.md'); git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'side');
    writeFileSync(join(REPO_DIR, 'README.md'), 'orca pane harness\nside\n'); git('commit', '-qam', 'side');
    git('checkout', '-q', 'main');
    writeFileSync(join(REPO_DIR, 'README.md'), 'orca pane harness\nmain\n'); git('commit', '-qam', 'main');
    git('merge', '-q', 'side');
    return git('status', '--porcelain');
}

function makeProfile() {
    rmSync(PROFILE_REAL, { recursive: true, force: true });
    mkdirSync(PROFILE_REAL, { recursive: true });
    mkdirSync(dirname(PROFILE_ALIAS), { recursive: true });
    try { if (lstatSync(PROFILE_ALIAS).isSymbolicLink()) rmSync(PROFILE_ALIAS); } catch { /* absent */ }
    symlinkSync(PROFILE_REAL, PROFILE_ALIAS);
}

/** The standalone page: each mount host carries data-pb-orca-pane (C4); window errors recorded. */
export const STANDALONE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>orca pane standalone</title>
<link rel="stylesheet" href="./standalone/pb-panes.css">
<script>window.__pbErrors = []; addEventListener('error', e => window.__pbErrors.push(String(e.error && e.error.message || e.message).slice(0, 300)));
addEventListener('unhandledrejection', e => window.__pbErrors.push('rejection: ' + String(e.reason && e.reason.message || e.reason).slice(0, 300)));</script>
<script type="module">import * as m from './standalone/pb-panes.js'; window.PbPanes = m; window.__pbLoaded = true;</script>
</head><body style="margin:0;width:100vw;height:100vh;position:relative;overflow:hidden"></body></html>`;

/** Page-realm helper: a host (data-pb-orca-pane=kind) at the given box, with a React-root child. */
export const HOST_HELPER = `window.__pbHost = (kind, id, box) => {
    const host = document.createElement('div');
    host.setAttribute('data-pb-orca-pane', kind);
    host.id = 'pb-host-' + id;
    host.style.cssText = 'position:absolute;overflow:hidden;display:flex;left:' + box[0] + 'px;top:' + box[1] + 'px;width:' + box[2] + 'px;height:' + box[3] + 'px';
    const root = document.createElement('div');
    root.style.cssText = 'display:flex;flex:1;min-width:0;min-height:0';
    host.appendChild(root);
    document.body.appendChild(host);
    return root;
};`;

function serve(extraRoutes = {}) {
    const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
        '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.html': 'text/html', '.webp': 'image/webp',
        '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream' };
    const mounts = [['/pb-panes/', PANES_DIR], ['/standalone/', STANDALONE_DIR]];
    const server = createServer((req, res) => {
        const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        // Cross-origin module import from the Theia document (lane-build CSS mode).
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (path === '/standalone.html') { res.setHeader('Content-Type', 'text/html'); res.end(STANDALONE_HTML); return; }
        if (extraRoutes[path]) { res.setHeader('Content-Type', 'text/html'); res.end(extraRoutes[path]); return; }
        for (const [prefix, dir] of mounts) {
            if (!path.startsWith(prefix)) continue;
            const file = join(dir, path.slice(prefix.length));
            if (!(file + sep).startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) break;
            res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
            res.end(readFileSync(file));
            return;
        }
        res.statusCode = 404; res.end();
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

/** Every browsing context of the session, with whether it is top-level. */
export async function allContexts(app) {
    const tree = await app.send('browsingContext.getTree', {});
    const out = [];
    const walk = (node, top) => { out.push({ context: node.context, url: node.url, top }); for (const child of node.children ?? []) walk(child, false); };
    for (const node of tree.contexts) walk(node, true);
    return out;
}

/**
 * Runs fn(ctx) with a scratch orcad, a throwaway repo, the bundle server and a launched
 * PowerBrowser. ctx: { app, origin, repoDir, repoStatus, orca(...argv), withPairing(f),
 * openStandalone(), evalIn(context, expression), typeIn(context, text), log }.
 */
export async function withOrcaPaneSession({ log = () => {}, pbOrcad = false } = {}, fn) {
    let restoreOutput = installOutputRedaction([]);
    scrubEnv();
    process.env.PB_BACKEND_MAIN ??= join(REPO_ROOT, 'theia', 'applications', 'browser', 'lib', 'backend', 'main.js');
    let child = null, ready = null, web = null;
    const recorded = new Map();
    try {
        const node = await ensurePbNode();
        makeProfile();
        const repoStatus = makeRepo();
        const env = orcadEnv(process.env, { profileDir: PROFILE_ALIAS, orcaVersion: orcaVersionFromPins() });
        ({ child, ready } = await startOrcad({ nodeBin: node.path, orcaDir: ORCA_DIR, profileDir: PROFILE_ALIAS, env }));
        restoreOutput(); restoreOutput = installOutputRedaction(ready.secrets);
        if (!ready.webClientUrl) throw new Error('the ready line offers no web-client pairing');
        const client = new URL(ready.webClientUrl);
        if (client.hostname !== '127.0.0.1') throw new Error('the web client is not on loopback');
        const pairing = decodeURIComponent(client.hash.replace(/^#/, '').replace(/^pairing=/, ''));
        const orca = (...argv) => {
            const r = spawnSync(node.path, [CLI_JS, ...argv, '--json'], { cwd: REPO_DIR, env, encoding: 'utf8', timeout: 60000 });
            const text = redact(`${r.stdout ?? ''}`, ready.secrets);
            if (r.status !== 0) throw new Error(`orca ${argv.slice(0, 2).join(' ')} exited ${r.status}: ${redact(`${r.stderr ?? ''}${text}`, ready.secrets).trim().split('\n').pop()}`);
            try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300) }; }
        };
        orca('repo', 'add', '--path', REPO_DIR);
        web = await serve();
        const electron = await import('../verify-orca-hidden-electron.mjs');
        const extraPrefs = pbOrcad ? {
            'powerbrowser.orca.root': ORCA_DIR,
            'powerbrowser.orca.port': await electron.freePort(await import('../../powerbrowser/shell/OrcaEnv.sys.mjs')),
            'powerbrowser.sidecar.nodePath': node.path,
        } : {};
        await withProbeShell(async app => {
            const evalIn = (context, expression) => app.evaluateIn(context, expression);
            const ctx = {
                app, log, origin: web.origin, repoDir: REPO_DIR, repoStatus, orca, evalIn,
                /** Calls f(pairing) and returns its result; the value is never returned or logged. */
                withPairing: f => f(pairing),
                /** Opens the standalone page as a PB web tab, loads the bundle and boots it; returns its context. */
                async openStandalone() {
                    const url = `${web.origin}/standalone.html`;
                    const before = new Set((await allContexts(app)).map(c => c.context));
                    await openWebTab(app, url);
                    const context = (await pollFor(async () => (await allContexts(app)).find(c => c.url === url && !before.has(c.context)), 30000, 'the standalone page context')).context;
                    await pollFor(async () => (await evalIn(context, 'window.__pbLoaded === true')) === true, 30000, 'the standalone bundle to load');
                    await evalIn(context, `(() => { ${HOST_HELPER} window.__pbBoot = null; window.PbPanes.bootstrap({ pairing: ${J(pairing)} })
                        .then(() => { window.__pbBoot = 'ok'; }, e => { window.__pbBoot = 'failed: ' + String(e && e.message || e).slice(0, 300); }); return true; })()`);
                    const boot = await pollFor(async () => evalIn(context, 'window.__pbBoot'), 45000, 'bootstrap to settle');
                    if (boot !== 'ok') throw new Error(`standalone bootstrap ${boot}`);
                    await pollFor(async () => (await evalIn(context, 'window.PbPanes.state().worktrees.length')) > 0, 45000, 'the store to list the throwaway worktree');
                    return context;
                },
                /** PowerBrowser's own orcad ready (pbOrcad only): the throwaway repo registered there, ctx.pbOrca set. */
                async startPbOrcad() {
                    const state = await pollFor(async () => {
                        const st = JSON.parse(await app.evaluateIn(app.chrome, `(() => { try { return JSON.stringify(ChromeUtils.importESModule('chrome://powerbrowser/content/OrcaService.sys.mjs').OrcaService.getState()); } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`));
                        if (st.chromeError || st.state === 'failed') throw new Error(`PowerBrowser's OrcaService: ${st.chromeError ?? st.state}`);
                        return st.state === 'ready' ? st : null;
                    }, 90000, "PowerBrowser's orcad to be ready");
                    for (const pid of [state.pid, state.daemonPid]) { const t = Number.isInteger(pid) && pid > 0 ? electron.startTicks(pid) : null; if (t !== null) recorded.set(pid, t); }
                    const cli = join(state.effectiveRoot, 'cli', 'bin', 'orca');
                    const cliEnv = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ORCA_USER_DATA: state.effectiveRoot, ORCA_USER_DATA_PATH: state.effectiveRoot };
                    ctx.pbOrca = (...argv) => {
                        const r = spawnSync(cli, [...argv, '--json'], { cwd: REPO_DIR, env: cliEnv, encoding: 'utf8', timeout: 60000 });
                        const text = redact(`${r.stdout ?? ''}`, ready.secrets);
                        if (r.status !== 0) throw new Error(`PowerBrowser's orca ${argv.slice(0, 2).join(' ')} exited ${r.status}: ${redact(`${r.stderr ?? ''}${text}`, ready.secrets).trim().split('\n').pop()}`);
                        try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300) }; }
                    };
                    ctx.pbOrca('repo', 'add', '--path', REPO_DIR);
                    return state;
                },
                /** Types text then Enter into the focused element of `context` through BiDi key input. */
                async typeIn(context, text) {
                    const actions = [];
                    for (const ch of text) actions.push({ type: 'keyDown', value: ch }, { type: 'keyUp', value: ch });
                    actions.push({ type: 'keyDown', value: '' }, { type: 'keyUp', value: '' });
                    await app.send('input.performActions', { context, actions: [{ type: 'key', id: 'pb-orca-pane-keys', actions }] });
                    await app.send('input.releaseActions', { context }).catch(() => undefined);
                },
            };
            try {
                await fn(ctx);
            } finally {
                // A graceful quit runs OrcaService's stop, which removes the bridge folder's hand-off files.
                if (pbOrcad) await app.quit().catch(() => undefined);
            }
        }, { extraPrefs });
    } finally {
        if (recorded.size) {
            await sleep(500);
            const { signalIdentity } = await import('../verify-orca-hidden-electron.mjs');
            for (const [pid, ticks] of recorded) signalIdentity(pid, ticks, 'SIGKILL');
        }
        web?.server.close();
        if (child) {
            const { survivors } = await stopOrcad(child, ready?.daemonPid ?? null);
            if (survivors.length) log(`orca-pane-harness: ${survivors.length} orcad process(es) survived teardown`);
        }
        restoreOutput();
    }
}

/** The terminal handles `orca terminal list` reports, as a sorted array. */
export function handlesOf(listed) {
    return [...new Set(JSON.stringify(listed).match(/term_[A-Za-z0-9_-]+/g) ?? [])].sort();
}
