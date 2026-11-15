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
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, normalize, relative, sep } from 'node:path';

import { createRequire } from 'node:module';

import { ORCA_PANES_MODULE_KEY } from './orca-tabs-live.mjs';
import { REPO_ROOT, ensurePbNode, installOutputRedaction, orcaVersionFromPins, orcadEnv, redact, startOrcad, stopOrcad } from './orca-run.mjs';
import { openWebTab, pollFor, withProbeShell } from './pb-live-probe.mjs';
import { liveEnv } from './firefox-bidi.mjs';

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
            const r = spawnSync(node.path, [CLI_JS, ...argv, '--json'], { cwd: REPO_DIR, env: liveEnv(env), encoding: 'utf8', timeout: 60000 });
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
                        const r = spawnSync(cli, [...argv, '--json'], { cwd: REPO_DIR, env: liveEnv(cliEnv), encoding: 'utf8', timeout: 60000 });
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

// ---------------------------------------------------------------- Phase 65 mount gate (P65-04)

/** The entry expression of each route: the standalone page's own import, or C64-1's boot handle in the Theia document. */
export const ROUTE_ENTRY = Object.freeze({
    standalone: 'window.PbPanes',
    'route-a': `globalThis[Symbol.for(${J(ORCA_PANES_MODULE_KEY)})]`,
});

/** Kinds whose body Orca renders empty in a state the gate cannot set without writing Orca's settings (recorded, not hidden). */
export const EMPTY_BY_DESIGN = Object.freeze({
    orchestration: 'Orca mounts no crew panel while experimentalOrchestrationPanel is off or nothing is focused',
    'page:creation': 'Orca renders no creation surface while no worktree creation is pending',
});

/**
 * One gate row from a mount observation: mounted means no throw, no React error recorded by the root, no
 * window error, no Orca error-boundary fallback in the host and at least one element (or a recorded empty state).
 */
export function gateRow(o, benign = /^ResizeObserver loop/) {
    const windowErrors = (o.windowErrors ?? []).filter(e => !benign.test(e));
    const reactErrors = o.reactErrors ?? [];
    const threw = o.threw ?? null;
    const first = threw ?? reactErrors[0]?.message ?? windowErrors[0] ?? (o.fallback ? 'Orca error-boundary fallback in the host' : null);
    const empty = o.descendantCount === 0 && !first && EMPTY_BY_DESIGN[o.kind] ? EMPTY_BY_DESIGN[o.kind] : null;
    const mounted = !first && (o.descendantCount > 0 || !!empty);
    return {
        kind: o.kind, route: o.route, attempt: o.attempt ?? 1, mounted, threw: threw !== null || reactErrors.length > 0,
        errorClass: first ? (/(\w*Error)\b/.exec(first)?.[1] ?? first.replace(/\s+/g, ' ').slice(0, 80)) : null,
        message: first ? first.slice(0, 200) : null,
        providersAdded: o.providersAdded ?? [], importsAdded: o.importsAdded ?? [], descendantCount: o.descendantCount ?? 0,
        ...(empty ? { empty } : {}),
    };
}

/**
 * Mounts `pick` through the route's entry into a fresh host (data-pb-orca-pane=kind) and observes it for up to
 * waitMs (early when elements appear and the count holds). Returns the raw observation for gateRow.
 */
export async function gateMount(ev, route, pick, { waitMs = 5000, box = [0, 0, 900, 700] } = {}) {
    const M = ROUTE_ENTRY[route];
    const id = `gate-${pick.kind.replace(/[^\w-]/g, '-')}-${Date.now().toString(36)}`;
    const started = await ev(`(() => { const m = ${M};
        if (!window.__pbGateErrors) { window.__pbGateErrors = []; addEventListener('error', e => window.__pbGateErrors.push(String(e.error && e.error.message || e.message).slice(0, 300)));
            addEventListener('unhandledrejection', e => window.__pbGateErrors.push('rejection: ' + String(e.reason && e.reason.message || e.reason).slice(0, 300))); }
        window.__pbGateBefore = [m.state().mountErrors.length, window.__pbGateErrors.length];
        const host = document.createElement('div'); host.setAttribute('data-pb-orca-pane', ${J(pick.kind)}); host.id = ${J(id)};
        host.style.cssText = 'position:fixed;overflow:hidden;display:flex;z-index:2147483000;left:${box[0]}px;top:${box[1]}px;width:${box[2]}px;height:${box[3]}px';
        const root = document.createElement('div'); root.style.cssText = 'display:flex;flex:1;min-width:0;min-height:0'; host.appendChild(root); document.body.appendChild(host);
        try { window.__pbGateUnmount = m.mountPane(root, ${J(pick)}); return 'ok'; } catch (e) { return 'threw: ' + String(e && e.message || e).slice(0, 300); } })()`);
    const read = async () => JSON.parse(await ev(`JSON.stringify((() => { const host = document.getElementById(${J(id)}); const m = ${M};
        return { descendantCount: host ? host.querySelectorAll('[data-pb-orca-pane-root] *').length : 0,
            fallback: !!(host && host.querySelector('[role="alert"] .text-destructive')),
            reactErrors: m.state().mountErrors.slice(window.__pbGateBefore[0]), windowErrors: window.__pbGateErrors.slice(window.__pbGateBefore[1]) }; })())`));
    let obs = await read();
    const t0 = Date.now();
    let lastCount = -1;
    while (Date.now() - t0 < waitMs) {
        await sleep(400);
        obs = await read();
        if (obs.descendantCount > 0 && obs.descendantCount === lastCount) break;
        lastCount = obs.descendantCount;
    }
    return { ...obs, kind: pick.kind, route, hostId: id, threw: started === 'ok' ? null : started.slice('threw: '.length) };
}

/** Unmounts and removes a gate host. */
export async function gateUnmount(ev, hostId) {
    await ev(`(() => { try { window.__pbGateUnmount && window.__pbGateUnmount(); } catch (e) {} document.getElementById(${J(hostId)})?.remove(); return true; })()`);
}

/**
 * The narrowest host width at which nothing in the mounted host scrolls horizontally: the host and every element
 * whose overflow-x is auto or scroll keep scrollWidth <= clientWidth + 1. Steps down from `from` by `step`; when
 * `from` already overflows it steps up by `step` (to `ceiling`) to the first width without overflow. null when none.
 */
export async function widthProbe(ev, hostId, { from = 640, step = 20, floor = 200, ceiling = 1600, settleMs = 350 } = {}) {
    let narrowest = null;
    const steps = [];
    const measure = async w => {
        await ev(`(() => { document.getElementById(${J(hostId)}).style.width = '${w}px'; return true; })()`);
        await sleep(settleMs);
        const offenders = JSON.parse(await ev(`JSON.stringify((() => { const host = document.getElementById(${J(hostId)});
            const els = [host, ...host.querySelectorAll('*')].filter(e => e === host || /^(auto|scroll)$/.test(getComputedStyle(e).overflowX));
            return els.filter(e => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1).slice(0, 4)
                .map(e => [e === host ? 'host' : e.tagName.toLowerCase() + (e.getAttribute('data-slot') ? '[' + e.getAttribute('data-slot') + ']' : '') + '.' + String(e.className || '').split(/\\s+/).slice(0, 4).join('.'), e.scrollWidth, e.clientWidth]); })())`));
        steps.push(offenders.length ? [w, true, offenders] : [w, false]);
        return offenders.length > 0;
    };
    if (await measure(from)) {
        for (let w = from + step; w <= ceiling; w += step) if (!(await measure(w))) return { narrowest: w, direction: 'up', steps };
        return { narrowest: null, direction: 'up', steps };
    }
    narrowest = from;
    for (let w = from - step; w >= floor; w -= step) {
        if (await measure(w)) break;
        narrowest = w;
    }
    return { narrowest, direction: 'down', steps };
}

function overlayTs() {
    const pkg = join(REPO_ROOT, 'theia', 'package.json');
    try { return createRequire(pkg)('typescript'); } catch { return null; }
}

const RENDERER_SRC = join(ORCA_DIR, 'src', 'renderer', 'src');
const PB_DIR = join(RENDERER_SRC, 'pb');

/** Resolves an import specifier of a file under orca/src the way Orca's Vite config does ('@/' and relative); null for packages. */
export function resolveOrcaImport(from, spec, exists = existsSync, rendererSrc = RENDERER_SRC) {
    let base;
    if (spec.startsWith('@/')) base = join(rendererSrc, spec.slice(2));
    else if (spec.startsWith('.')) base = join(dirname(from), spec);
    else return null;
    for (const ext of ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js']) {
        const p = normalize(base + ext);
        if (exists(p) && (ext !== '' || /\.(m?[jt]sx?)$/.test(p))) return p;
    }
    return null;
}

/** Value import specifiers of one source (static, re-export and dynamic import()), with typescript. */
export function importSpecifiers(ts, fileName, text) {
    const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const specs = [];
    const visit = n => {
        if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
            if (!n.importClause?.isTypeOnly && !n.isTypeOnly) specs.push(n.moduleSpecifier.text);
        } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
            specs.push(n.arguments[0].text);
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return specs;
}

/**
 * The pane bundle's module graph from its source: every orca/src module reachable from `starts` through value
 * imports (static, re-export, dynamic). `overrides` maps an orca path to replacement text (an overlay file not
 * yet copied). Returns Map<absolute path, importer or null>; packages are not followed.
 */
export function moduleGraph(ts, starts, overrides = new Map(), rendererSrc = RENDERER_SRC) {
    const graph = new Map();
    const queue = [];
    for (const s of starts) { graph.set(s, null); queue.push(s); }
    while (queue.length) {
        const file = queue.pop();
        if (!/\.(m?[jt]sx?)$/.test(file)) continue;
        const text = overrides.get(file) ?? (existsSync(file) ? readFileSync(file, 'utf8') : null);
        if (text === null) continue;
        for (const spec of importSpecifiers(ts, file, text)) {
            const r = resolveOrcaImport(file, spec, p => overrides.has(p) || existsSync(p), rendererSrc);
            if (r && !graph.has(r)) { graph.set(r, file); queue.push(r); }
        }
    }
    return graph;
}

/** The overlay's pb/ files as overrides at their orca/ paths (the graph reads the overlay, never a stale copy). */
export function overlayOverrides(overlayFilesDir = join(REPO_ROOT, 'orca-overlay', 'files'), orcaDir = ORCA_DIR) {
    const dir = join(overlayFilesDir, 'src', 'renderer', 'src', 'pb');
    const out = new Map();
    if (!existsSync(dir)) return out;
    // Recursive: pb/browser-host/ (Phase 66) is a subdirectory.
    for (const e of readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (!e.isFile()) continue;
        const name = relative(dir, join(e.parentPath, e.name));
        out.set(join(orcaDir, 'src', 'renderer', 'src', 'pb', name), readFileSync(join(dir, name), 'utf8'));
    }
    return out;
}

/**
 * Spike 004 Question 3's import list per kind: the Orca modules pb-side-mounts.tsx imports for each kind's surface
 * (the closure of the declarations its SideMountBody branch renders), minus the modules the entry already imports.
 * Derived from the overlay source with typescript; {} when typescript is absent.
 */
export function kindImports(kinds) {
    const ts = overlayTs();
    if (!ts) return {};
    const overrides = overlayOverrides();
    const sideFile = join(PB_DIR, 'pb-side-mounts.tsx'), entryFile = join(PB_DIR, 'pb-pane-mount.tsx');
    const text = overrides.get(sideFile);
    if (!text) return {};
    const rel = p => p.slice(ORCA_DIR.length + 1);
    const entrySpecs = new Set(importSpecifiers(ts, entryFile, overrides.get(entryFile) ?? '').map(s => resolveOrcaImport(entryFile, s, p => overrides.has(p) || existsSync(p)) ?? s));
    const sf = ts.createSourceFile(sideFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imports = new Map(), decls = new Map();
    for (const st of sf.statements) {
        if (ts.isImportDeclaration(st) && st.importClause && !st.importClause.isTypeOnly) {
            const spec = st.moduleSpecifier.text, c = st.importClause;
            if (c.name) imports.set(c.name.text, spec);
            if (c.namedBindings && ts.isNamedImports(c.namedBindings)) for (const e of c.namedBindings.elements) { if (!e.isTypeOnly) imports.set(e.name.text, spec); }
            else if (c.namedBindings) imports.set(c.namedBindings.name.text, spec);
        } else if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
        else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) decls.set(d.name.text, d);
    }
    const objectOf = name => { const d = decls.get(name); const init = d?.initializer?.arguments?.[0] ?? d?.initializer; const out = {};
        if (init && ts.isObjectLiteralExpression(init)) for (const p of init.properties) if (ts.isPropertyAssignment(p)) out[(p.name.text ?? p.name.getText(sf))] = ts.isIdentifier(p.initializer) ? p.initializer.text : p.initializer.text ?? p.initializer.getText(sf);
        return out; };
    const pageViews = objectOf('PAGE_VIEWS'), pages = objectOf('PAGES');
    // SideMountBody's `if (kind === 'x') return <Component ...>` branches.
    const branches = {};
    const body = decls.get('SideMountBody');
    const visit = n => {
        if (ts.isIfStatement(n) && ts.isBinaryExpression(n.expression) && ts.isStringLiteral(n.expression.right) && n.expression.left.getText(sf) === 'kind') {
            let el = null; const find = x => { if (!el && (ts.isJsxSelfClosingElement(x) || ts.isJsxOpeningElement(x))) el = x.tagName.getText(sf); ts.forEachChild(x, find); }; find(n.thenStatement);
            if (el) branches[n.expression.right.text] = [el];
        }
        ts.forEachChild(n, visit);
    };
    if (body) visit(body);
    const closure = starts => {
        const seen = new Set(), specs = new Set(), queue = [...starts];
        while (queue.length) {
            const name = queue.pop();
            if (seen.has(name)) continue;
            seen.add(name);
            if (imports.has(name)) { specs.add(imports.get(name)); continue; }
            const d = decls.get(name);
            if (!d) continue;
            const v = n => { if (ts.isIdentifier(n)) queue.push(n.text);
                if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(n.arguments[0])) specs.add(n.arguments[0].text);
                ts.forEachChild(n, v); };
            v(d.initializer ?? d.body ?? d);
        }
        return [...specs].map(s => resolveOrcaImport(sideFile, s, p => overrides.has(p) || existsSync(p)) ?? s).filter(p => !entrySpecs.has(p)).map(p => p.startsWith(ORCA_DIR) ? rel(p) : p).sort();
    };
    const out = {};
    for (const kind of kinds) {
        const view = kind === 'settings' ? 'settings' : pageViews[kind];
        const starts = branches[kind] ?? (view && pages[view] ? [pages[view], 'PageBoundary'] : null);
        out[kind] = starts ? closure(starts) : [];
    }
    return out;
}

/** The terminal handles `orca terminal list` reports, as a sorted array. */
export function handlesOf(listed) {
    return [...new Set(JSON.stringify(listed).match(/term_[A-Za-z0-9_-]+/g) ?? [])].sort();
}
