// scripts/lib/orca-tabs-live.mjs
//
// Phase 64 (P64-25, P64-27, P64-33, P64-35; interfaces C3, C5, C7, C9, C10): the
// one live session the Phase 64 rows share. PowerBrowser on a scratch profile
// with orcad and the booted Orca pane bundle, inherited ORCA_* scrubbed, output
// redaction installed before anything else, and a stub `claude` on the launched
// PowerBrowser's PATH only.
//
// Lane p64-02's code (theia/extensions/orca-panes) and lane p64-01's bundle
// (orca/out/web/assets/pb-panes) are read only through the C1-C12 contracts.
// prerequisites() names a SKIP only while one of those is absent; the directory
// present but the built app lacking orca-panes is a FAIL, never a SKIP.
//
// The bundle is reached only through C3's boot handle: the namespace stored
// under globalThis[Symbol.for(ORCA_PANES_MODULE_KEY)] and the window event
// ORCA_PANES_BOOT_EVENT. The two literals are spelled once, here, so
// orca-pane-routes clause (g) can compare them with the loader's.
//
// The addWidget recorder on ApplicationShell is instrumentation this harness
// owns. It is used only to stop the 1 s clock, never to judge an absence
// (CLAUDE.md verification rule 1).
//
// The pairing offer: offerFromFile() reads the bridge folder's web-pairing file
// and keeps the value in memory; it is never printed, logged or written. Every
// stdout and stderr write goes through orca-run.mjs's redact, which also
// replaces the offer itself once it has been read.
//
// Node built-ins and the repo's lib modules only.

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** C3 boot handle. orca-pane-routes (g) requires both to be literals of this file. */
export const ORCA_PANES_MODULE_KEY = 'powerbrowser.orca-panes.module';
export const ORCA_PANES_BOOT_EVENT = 'powerbrowser-orca-panes-module';

export const ORCA_PANES_REL = 'theia/extensions/orca-panes';
export const PROTOCOL_REL = 'theia/extensions/orca-panes/src/common/orca-panes-protocol.ts';
export const PANES_BUNDLE_REL = 'orca/out/web/assets/pb-panes';
export const ORCAD_REL = 'orca/out/orcad/orcad.js';
export const BACKEND_MAIN_REL = 'theia/applications/browser/lib/backend/main.js';
/** C5: the bridge-folder file OrcaService writes after orcad's ready line. */
export const WEB_PAIRING_FILE = 'web-pairing';
/** C7 */
export const ORCA_PANE_WIDGET_PREFIX = 'orca-pane:';
export const ORCA_SCHEME = 'pb-orca';

const SERVICE_URL = 'chrome://powerbrowser/content/OrcaService.sys.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

/** The built PowerBrowser this run launches. */
export const firefoxBin = (root = REPO_ROOT) => process.env.PB_FIREFOX_BIN || join(root, 'objdir', 'dist', 'bin', 'powerbrowser');
/** The Theia backend this run launches: PB_BACKEND_MAIN, else this tree's. */
export const backendMain = (root = REPO_ROOT) => process.env.PB_BACKEND_MAIN || join(root, BACKEND_MAIN_REL);

/**
 * What the live rows need, in order. Resolves { skip, fail } with at most one set: a skip names the
 * absent prerequisite (an unmerged lane first), a fail names a present lane whose code the built app does not carry.
 * needOrca false stops after the orca-panes clauses (the TERM-04 control runs without orcad).
 */
export function prerequisites({ root = REPO_ROOT, needOrca = true, needPanes = true } = {}) {
    // The unmerged lane is named first: it is the absence a lane run expects, whatever else is built.
    if (needPanes && !existsSync(join(root, ORCA_PANES_REL))) return { skip: 'lane p64-02 not merged (theia/extensions/orca-panes is absent)', fail: null };
    const bin = firefoxBin(root);
    if (!existsSync(bin)) return { skip: `no built PowerBrowser (${bin} missing; see docs/BUILD.md "Firefox half")`, fail: null };
    const main = backendMain(root);
    if (!existsSync(main)) return { skip: `no built Theia app (${main} missing; see docs/BUILD.md "Theia half")`, fail: null };
    if (!needPanes) return { skip: null, fail: null };
    // The generated server of the app being launched names every composed backend module.
    const server = join(dirname(main), '..', '..', 'src-gen', 'backend', 'server.js');
    if (!/@powerbrowser\/orca-panes\//.test(read(server) ?? '')) {
        return { skip: null, fail: `orca-panes not wired into the built app (${server} names no @powerbrowser/orca-panes module; add it to theia/applications/browser/package.json and rebuild)` };
    }
    if (!needOrca) return { skip: null, fail: null };
    if (!existsSync(join(root, ORCAD_REL))) return { skip: `no built orca/ (${ORCAD_REL} missing; run: nix develop .#orca --command bash scripts/build-orca.sh)`, fail: null };
    if (!existsSync(join(root, PANES_BUNDLE_REL))) return { skip: `lane p64-01 not merged or Orca not built (${PANES_BUNDLE_REL} is absent)`, fail: null };
    return { skip: null, fail: null };
}

/** The stub agent: one line, then stdin echoed until it closes. Never a model. */
export const STUB_AGENT = '#!/bin/sh\necho "stub claude: ready"\nexec cat\n';

/** Writes the stub agent into a fresh scratch directory; returns the directory (prepend it to PATH). */
export function writeStubAgentDir() {
    const dir = mkdtempSync(join(tmpdir(), 'pb-orca-stub-agent-'));
    writeFileSync(join(dir, 'claude'), STUB_AGENT);
    chmodSync(join(dir, 'claude'), 0o755);
    return dir;
}

/** The environment names a session removes from this process before it launches anything. */
export function scrubbedNames(env = process.env) {
    return Object.keys(env).filter((k) => /^ORCA_/.test(k) || k === 'NODE_OPTIONS' || k === 'NODE_PATH');
}

/** Page-realm source: wraps ApplicationShell.addWidget once, recording { id, t } (Date.now) per call. */
export const ADD_WIDGET_RECORDER = `const shell = get('ApplicationShell');
    if (!window.__pbAddWidgetLog) {
        window.__pbAddWidgetLog = [];
        const original = shell.addWidget.bind(shell);
        shell.addWidget = function (widget, options) { window.__pbAddWidgetLog.push({ id: widget.id, t: Date.now() }); return original(widget, options); };
    }
    return true;`;

/** Page-realm source of hostedWidgets(): every attached widget whose node carries data-pb-orca-pane. */
export const HOSTED_WIDGETS = `const shell = get('ApplicationShell');
    const registry = get('TabUriRegistry');
    const bars = shell.mainPanel.tabBars ? [...shell.mainPanel.tabBars()] : [];
    const out = [];
    // Visible xterms, as orca-pane-standalone-live judges them: an isolated leaf's root also holds its tab's other leaves' xterms, hidden.
    const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && el.offsetParent !== null; };
    for (const area of ['main', 'bottom', 'left', 'right']) {
        for (const w of shell.getWidgets(area)) {
            if (!w.node || !w.node.hasAttribute('data-pb-orca-pane')) continue;
            const r = w.node.getBoundingClientRect();
            const uri = registry.uriOf(w);
            out.push({
                id: w.id, area, options: w.options ? { ...w.options } : null, kind: w.node.getAttribute('data-pb-orca-pane'),
                title: w.title.label, tabBar: bars.findIndex(b => b.titles.includes(w.title)),
                rect: { x: r.x, y: r.y, w: r.width, h: r.height }, xterms: [...w.node.querySelectorAll('.xterm')].filter(visible).length, xtermsTotal: w.node.querySelectorAll('.xterm').length,
                attached: w.isAttached, organising: uri ? uri.toString(true) : 'widget:' + w.id,
            });
        }
    }
    return out;`;

/** Page-realm source: waits for the bundle through C3's boot handle; resolves its state() (no credential). */
export const BOOT_WAIT = `const key = Symbol.for(${JSON.stringify(ORCA_PANES_MODULE_KEY)});
    if (!globalThis[key]) await new Promise(r => { window.addEventListener(${JSON.stringify(ORCA_PANES_BOOT_EVENT)}, r, { once: true }); setTimeout(r, 90000); });
    const m = globalThis[key];
    if (!m) return { error: 'the boot event never fired and no module namespace is stored' };
    const booted = await until(() => m.state().booted, 90000);
    return { booted, state: m.state() };`;

/**
 * One PowerBrowser session; calls fn(ctx) and always tears down (quit, then SIGKILL of each recorded identity
 * still alive, the scratch repository, the stub directory, the profile). needOrca: wait for OrcaService ready and
 * the booted bundle, register a throwaway repository with orcad. ctx: { app, log, record, pollFor, probe(body, ms),
 * command(id, ...args), orca(...args), orcaState(), bundle(expr), hostedWidgets(), organisingKeys(), uriOf(id),
 * luminoClose(id), activate(id), sendText(id, text), typeInto(id, text), typeText(text), pressKey(spec), focusTheiaFrame(),
 * focusOverlay(tabId), openWebTab(url), addedSince(t), tabState(), offerFromFile(), repo, worktree, stubDir }.
 */
export async function withOrcaTabsSession({ log = () => {}, needOrca = true } = {}, fn) {
    const { installOutputRedaction, ensurePbNode, redact } = await import('./orca-run.mjs');
    const secrets = [];
    // Redaction first: nothing below may print before it is in place. The offer joins the list once read.
    const restoreOutput = installOutputRedaction(secrets);
    const savedEnv = {};
    for (const k of [...scrubbedNames(), 'PATH', 'MOZ_PURGE_CACHES', 'XDG_CONFIG_HOME']) savedEnv[k] = process.env[k];
    const recorded = new Map();
    const scratch = mkdtempSync(join(tmpdir(), 'pb-orca-tabs-'));
    const repo = join(scratch, 'repo');
    let stubDir = null;
    try {
        for (const k of scrubbedNames()) delete process.env[k];
        const live = await import('./pb-live-probe.mjs');
        const { pollFor, probe } = await import('./pb-relaunch.mjs');
        const { freePort, signalIdentity, startTicks } = await import('../verify-orca-hidden-electron.mjs');
        const OrcaEnv = await import('../../powerbrowser/shell/OrcaEnv.sys.mjs');
        const record = (pid) => { const t = Number.isInteger(pid) && pid > 0 ? startTicks(pid) : null; if (t !== null) recorded.set(pid, t); return t; };
        const basePath = savedEnv.PATH ?? '';
        stubDir = writeStubAgentDir();
        // The stub is on the launched PowerBrowser's PATH (and so orcad's), never on the Orca CLI's.
        process.env.PATH = `${stubDir}:${basePath}`;
        const prefs = { 'powerbrowser.orca.root': join(REPO_ROOT, 'orca'), 'powerbrowser.orca.port': await freePort(OrcaEnv) };
        if (needOrca) prefs['powerbrowser.sidecar.nodePath'] = (await ensurePbNode()).path;
        return await live.withProbeShell(async (app) => {
            const chromeJson = async (expr) => JSON.parse(await app.evaluateIn(app.chrome, `(() => { try { return JSON.stringify(${expr}); } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`));
            const orcaState = () => chromeJson(`ChromeUtils.importESModule(${JSON.stringify(SERVICE_URL)}).OrcaService.getState()`);
            const ctx = {
                app, log, record, pollFor, repo, stubDir, worktree: null, scratch,
                probe: (body, ms) => probe(app, body, ms),
                orcaState,
                pressKey: (spec) => live.pressKey(app, spec),
                focusTheiaFrame: () => live.focusTheiaFrame(app),
                focusOverlay: (tabId) => live.focusOverlay(app, tabId),
                openWebTab: (url) => live.openWebTab(app, url),
                serveNavPages: live.serveNavPages,
            };
            /** The tabs of the main and bottom areas (Theia's terminals open in the bottom panel) and the active widget. */
            ctx.tabState = () => ctx.probe(`const shell = get('ApplicationShell');
                return { ids: [...shell.getWidgets('main'), ...shell.getWidgets('bottom')].map(w => w.id), active: shell.activeWidget ? shell.activeWidget.id : null };`);
            ctx.activate = (id) => ctx.probe(`const shell = get('ApplicationShell');
                await shell.activateWidget(${JSON.stringify(id)});
                return await until(() => shell.activeWidget && shell.activeWidget.id === ${JSON.stringify(id)}, 5000);`);
            /** Executes a command; resolves { t0 } (Date.now before the call) or { error }. */
            ctx.command = (id, ...args) => ctx.probe(`const t0 = Date.now();
                try { await get('CommandService').executeCommand(${[JSON.stringify(id), ...args.map((a) => JSON.stringify(a))].join(', ')}); } catch (e) { return { t0, error: String(e && e.message || e) }; }
                return { t0 };`);
            ctx.bundle = (expr) => ctx.probe(`const m = globalThis[Symbol.for(${JSON.stringify(ORCA_PANES_MODULE_KEY)})];
                if (!m) return { error: 'no bundle module' };
                return await (${expr});`);
            ctx.hostedWidgets = () => ctx.probe(HOSTED_WIDGETS);
            ctx.organisingKeys = async () => Object.fromEntries((await ctx.hostedWidgets()).map((w) => [w.id, w.organising]));
            ctx.uriOf = (id) => ctx.probe(`const w = get('ApplicationShell').getWidgetById(${JSON.stringify(id)}) || get('WidgetManager').getWidgets('powerbrowser.orca-pane').find(x => x.id === ${JSON.stringify(id)});
                const u = w && get('TabUriRegistry').uriOf(w); return u ? u.toString(true) : null;`);
            /** A Lumino close (the tab's x), which orca-panes turns into Orca's own close (P64-11). */
            ctx.luminoClose = (id) => ctx.probe(`const w = get('ApplicationShell').getWidgetById(${JSON.stringify(id)}); if (!w) return false; w.close(); return true;`);
            ctx.addedSince = (t) => ctx.probe(`return (window.__pbAddWidgetLog || []).filter(e => e.t >= ${Number(t)});`);
            ctx.typeText = async (text) => {
                for (const ch of text) await ctx.pressKey(ch === '\n' ? { key: 'Enter', code: 'Enter', keyCode: 13 } : { key: ch });
            };
            /** Sends text to a Theia terminal widget's PTY once its process has started (fixture setup, not a key under test). */
            ctx.sendText = (id, text) => ctx.probe(`const w = get('ApplicationShell').getWidgetById(${JSON.stringify(id)});
                if (!w || typeof w.sendText !== 'function') return false;
                await Promise.race([w.processId, sleep(15000)]);
                w.sendText(${JSON.stringify(text)});
                return true;`);
            ctx.typeInto = async (id, text) => { await ctx.focusTheiaFrame(); await ctx.activate(id); await ctx.typeText(text); };
            ctx.offerFromFile = async () => {
                const s = await orcaState();
                const dir = s.dataRoot ? await OrcaEnv.bridgeDirFor(s.dataRoot, (n) => process.env[n], 'linux') : null;
                const offer = dir ? (read(OrcaEnv.bridgeFileFor(dir, WEB_PAIRING_FILE, 'linux')) ?? '').trim() : '';
                if (offer && !secrets.includes(offer)) secrets.push(offer);
                return offer || null;
            };
            /** The pairing input Orca's own pairing field parses: the offer read from the web-client URL's fragment or query, as Orca's web client reads it. */
            ctx.pairingInputFromFile = async () => {
                const offer = await ctx.offerFromFile();
                if (!offer) return null;
                let input = null;
                try {
                    const u = new URL(offer);
                    const keys = ['pairing', 'pair', 'code', 'token'];
                    const fromSearch = keys.map((k) => u.searchParams.get(k)).find((v) => v?.trim());
                    const hash = u.hash.replace(/^#/, '').trim();
                    input = fromSearch ?? keys.map((k) => new URLSearchParams(hash).get(k)).find((v) => v?.trim()) ?? (hash || null);
                } catch { /* not a URL: the offer itself */ input = offer; }
                if (input && !secrets.includes(input)) secrets.push(input);
                return input;
            };
            if (!(await ctx.probe(ADD_WIDGET_RECORDER))) throw new Error('harness: the addWidget recorder did not install');
            if (needOrca) {
                const state = await pollFor(async () => { const s = await orcaState(); if (s.chromeError || s.state === 'failed') throw new Error(`OrcaService: ${s.chromeError ?? s.state}`); return s.state === 'ready' ? s : null; }, 90000, 'OrcaService to reach ready');
                record(state.pid);
                record(state.daemonPid);
                await ctx.offerFromFile();
                const boot = await ctx.probe(BOOT_WAIT, 200000);
                if (!boot?.booted) throw new Error(`the Orca pane bundle did not boot: ${JSON.stringify(boot?.error ?? boot?.state ?? boot)}`);
                // The Orca CLI's environment, built from scratch: never this session's ORCA_* values, never the stub.
                const cliEnv = { PATH: basePath, HOME: savedEnv.HOME ?? process.env.HOME ?? '', ORCA_USER_DATA: state.effectiveRoot, ORCA_USER_DATA_PATH: state.effectiveRoot };
                mkdirSync(repo, { recursive: true });
                writeFileSync(join(repo, 'README'), 'orca-tabs-live scratch repository\n');
                const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', ...a], { env: { PATH: basePath, HOME: cliEnv.HOME }, stdio: ['ignore', 'pipe', 'pipe'] });
                git('init', '-q');
                git('add', '.');
                git('commit', '-q', '-m', 'fixture');
                ctx.git = git;
                const cli = join(state.effectiveRoot, 'cli', 'bin', 'orca');
                ctx.orca = (...a) => {
                    try { return JSON.parse(execFileSync(cli, [...a, '--json'], { env: cliEnv, cwd: repo, timeout: 60000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) {
                        throw new Error(`the Orca CLI call '${a.slice(0, 2).join(' ')}' failed: ${redact(String(e.stderr ?? e.message), secrets).trim().split('\n').pop()}`);
                    }
                };
                ctx.orca('repo', 'add', '--path', repo);
                ctx.worktree = `path:${repo}`;
            }
            try {
                return await fn(ctx);
            } finally {
                await app.quit().catch(() => undefined);
            }
        }, { extraPrefs: prefs });
    } finally {
        await sleep(500);
        const { signalIdentity } = await import('../verify-orca-hidden-electron.mjs');
        for (const [pid, ticks] of recorded) signalIdentity(pid, ticks, 'SIGKILL');
        rmSync(scratch, { recursive: true, force: true });
        if (stubDir) rmSync(stubDir, { recursive: true, force: true });
        for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        restoreOutput();
    }
}

/** Polls the addWidget log for a hosted widget added at or after t0 that is not in `except`; resolves { id, t } or null. */
export async function waitForHostedAdd(ctx, t0, except = [], ms = 5000) {
    try {
        return await ctx.pollFor(async () => {
            const added = (await ctx.addedSince(t0)).filter((e) => e.id.startsWith(ORCA_PANE_WIDGET_PREFIX) && !except.includes(e.id));
            return added[0] ?? null;
        }, ms, 'a hosted Orca widget');
    } catch {
        return null;
    }
}

/** The hosted widget ids now. */
export const hostedIds = async (ctx) => (await ctx.hostedWidgets()).map((w) => w.id);

/** The text orcad's terminal read returns for a handle. */
export const terminalText = (ctx, handle) => {
    const r = ctx.orca('terminal', 'read', '--terminal', handle);
    const tail = r?.result?.terminal?.tail;
    return Array.isArray(tail) ? tail.join('\n') : String(tail ?? '');
};
