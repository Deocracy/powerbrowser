// scripts/lib/orca-browser-live.mjs
//
// Phase 66 (BRW-02, BRW-03, BRW-04; P66-30, P66-26, P66-29, A1, A3): the live session
// orca-browser-agent-live and orca-agent-mark-live share. It is Phase 64's
// withOrcaTabsSession (scratch profile, MOZ_PURGE_CACHES=1, inherited ORCA_* scrubbed,
// output redaction installed before anything is read, a throwaway repository registered
// with orcad, teardown by recorded pid) plus what the browser rows need:
//   - a loopback fixture server: /agent (a red 40x40 target at CSS (100, 80), a text
//     input, a checkbox, a button with a click counter), /user (an input and a focus/blur
//     log), /cookie (sets a cookie from the page), /stock;
//   - an Orca CLI runner that never throws and keeps error.code and error.message apart
//     (Pitfall 8: a host failure reaches the CLI as runtime_error with the code as message),
//     in an environment built from scratch (PATH, HOME, ORCA_USER_DATA, ORCA_USER_DATA_PATH);
//   - reads of the Theia frame (web tabs, the current widget, the addWidget clock, the
//     chrome bar, title classes, the page table, a raw webTabAgent through WebTabChannel),
//     of chrome (overlay entries, focus, elementFromPoint) and of page documents through
//     WebDriver BiDi contexts (the harness only; D-11);
//   - a store-activation recorder over the pane bundle's subscribePanes (Phase 64 C3).
// Nothing runs on import: every helper is a function.
//
// Pairing material never leaves memory: the CLI's stdout is parsed, and only error codes
// and messages are returned, under the session's redaction.

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { ORCA_PANES_MODULE_KEY, PANES_BUNDLE_REL, REPO_ROOT, firefoxBin, prerequisites as tabsPrerequisites } from './orca-tabs-live.mjs';

export const API_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
export const ORCA_BROWSER_REL = 'theia/extensions/orca-browser';
export const HOST_BUNDLE_REL = `${PANES_BUNDLE_REL}/pb-browser-host.js`;
export const ORCA_PANE_FACTORY_ID = 'powerbrowser.orca-pane';
export const LINK_KEY = 'powerbrowser.orca-browser.link';
export const DPR_PREF = 'layout.css.devPixelsPerPx';
/** The planted target, in CSS pixels of the agent page's viewport. */
export const TARGET = Object.freeze({ x: 100, y: 80, w: 40, h: 40 });
export const INSIDE = Object.freeze({ x: 120, y: 100 });
export const OUTSIDE = Object.freeze({ x: 60, y: 100 });
export const RED = [255, 0, 0];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The SKIP rule both live rows share, unmerged lane first: { skip, fail }, at most one set.
 */
export function prerequisites(root = REPO_ROOT) {
    let api = '';
    try { api = readFileSync(join(root, API_REL), 'utf8'); } catch { /* absent: skip below */ }
    if (!/\bconst AGENT_METHODS\s*=/.test(api)) return { skip: `lane p66-03 not merged (no AGENT_METHODS in ${API_REL})`, fail: null };
    if (!existsSync(join(root, ORCA_BROWSER_REL))) return { skip: `lane p66-02 not merged (${ORCA_BROWSER_REL} is absent)`, fail: null };
    const bin = firefoxBin(root);
    if (!existsSync(bin)) return { skip: `no built PowerBrowser (${bin} missing; see docs/BUILD.md "Firefox half")`, fail: null };
    if (!existsSync(join(root, HOST_BUNDLE_REL))) return { skip: `lane p66-01 not merged or Orca not built (${HOST_BUNDLE_REL} is absent)`, fail: null };
    const base = tabsPrerequisites({ root });
    return { skip: base.skip, fail: base.fail };
}

const LOGGER = `<script>window.__log=[];for(const t of ['focus','blur','click','input'])addEventListener(t,e=>__log.push({type:e.type,target:(e.target&&(e.target.id||e.target.nodeName))||'window'}),true);</script>`;

/** The fixture pages, in serveNavPages' spec form. */
export function fixturePages() {
    const t = TARGET;
    return {
        '/agent': {
            title: 'PB agent fixture',
            body: `<style>body{margin:0}#t{position:absolute;left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px;background:rgb(255,0,0)}#in{position:absolute;left:10px;top:200px}#cb{position:absolute;left:10px;top:240px}#btn{position:absolute;left:10px;top:280px}</style><div id="t"></div><input id="in" value=""><input id="cb" type="checkbox"><button id="btn" onclick="this.dataset.count=String(Number(this.dataset.count||0)+1)">Count</button>${LOGGER}`,
        },
        '/agent2': { title: 'PB agent fixture two', body: `<p>two</p>${LOGGER}` },
        '/user': { title: 'PB user fixture', body: `<input id="in" value="">${LOGGER}` },
        '/cookie': { title: 'PB cookie fixture', body: "<script>document.cookie='pbuser=1; path=/';</script><p>cookie</p>" },
        '/stock': { title: 'PB stock fixture', body: '<p>stock</p>' },
    };
}

/** Parses the Orca CLI's --json stdout into { ok, result, error: { code, message } | null }. */
export function cliOutcome(stdout) {
    let json = null;
    try { json = JSON.parse(stdout); } catch { /* not JSON */ }
    if (json && json.ok !== false && !json.error) return { ok: true, result: json.result ?? json, error: null };
    return { ok: false, result: null, error: { code: json?.error?.code ?? null, message: String(json?.error?.message ?? '') } };
}

/** Page-realm source: records every pane-list's browser records (key, browserPageId, active) with Date.now. */
export const PANE_RECORDER = `const m = globalThis[Symbol.for(${JSON.stringify(ORCA_PANES_MODULE_KEY)})];
    if (!m) return false;
    if (!window.__pbPaneLog) {
        window.__pbPaneLog = [];
        m.subscribePanes(list => window.__pbPaneLog.push({ t: Date.now(), browser: list.filter(r => r.browserPageId).map(r => ({ id: r.browserPageId, active: r.active })) }));
    }
    return true;`;

/** Page-realm source of the web tabs: id, tabId, agent, current, title, url and title classes. */
export const WEB_TABS = `const shell = get('ApplicationShell');
    const cur = shell.currentWidget;
    return webTabs().map(w => ({ id: w.id, tabId: w.tabId, agent: w.agent === true, current: w === cur, title: w.title.label, url: w.url, classes: w.title.className, control: w.agentControl ? { ...w.agentControl } : null }));`;

/**
 * One session; fn(ctx) gets withOrcaTabsSession's ctx extended with the helpers below. opts: { log, dpr, home }.
 * home (a scratch directory) becomes HOME for PowerBrowser and so for its orcad (ORCAD_ENV_ALLOWLIST passes HOME).
 */
export async function withBrowserSession({ log = () => {}, dpr = 1, home = null } = {}, fn) {
    const { withOrcaTabsSession } = await import('./orca-tabs-live.mjs');
    const live = await import('./pb-live-probe.mjs');
    const savedHome = process.env.HOME;
    if (home) process.env.HOME = home;
    const pages = await live.serveNavPages(fixturePages());
    try {
        return await withOrcaTabsSession({ log }, async (ctx) => {
            const { app } = ctx;
            const state = await ctx.orcaState();
            const basePath = (process.env.PATH ?? '').split(':').filter((p) => p !== ctx.stubDir).join(':');
            const cliEnv = { PATH: basePath, HOME: process.env.HOME ?? '', ORCA_USER_DATA: state.effectiveRoot, ORCA_USER_DATA_PATH: state.effectiveRoot };
            const cliBin = join(state.effectiveRoot, 'cli', 'bin', 'orca');
            Object.assign(ctx, {
                state, url: (path) => pages.url(path), dpr,
                /** Runs the Orca CLI; never throws. Resolves { ok, result, error, t0, ms }. */
                cli: (...args) => new Promise((resolve) => {
                    const t0 = Date.now();
                    execFile(cliBin, [...args, '--json'], { env: cliEnv, cwd: ctx.repo, timeout: 90000, encoding: 'utf8' }, (_e, stdout) => resolve({ ...cliOutcome(stdout), t0, ms: Date.now() - t0 }));
                }),
                webTabs: () => ctx.probe(WEB_TABS),
                currentId: () => ctx.probe(`const c = get('ApplicationShell').currentWidget; return c ? c.id : null;`),
                tabOfPage: (pageId) => ctx.probe(`return get('OrcaBrowserPages').tabOf(${JSON.stringify(pageId)}) ?? null;`),
                hostAttached: () => ctx.probe(`return await until(() => !!get('OrcaBrowserHost').session, 60000);`, 90000),
                linkPresent: () => ctx.probe(`return !!globalThis[Symbol.for(${JSON.stringify(LINK_KEY)})];`),
                paneWidgetCount: () => ctx.probe(`return get('WidgetManager').getWidgets(${JSON.stringify(ORCA_PANE_FACTORY_ID)}).length;`),
                /** A raw webTabAgent from the frontend, as the dispatcher sends it; resolves chrome's reply. */
                agentRaw: (tabId, method, params = {}) => ctx.probe(`return await get('WebTabChannel').request({ kind: 'webTabAgent', tabId: ${JSON.stringify(tabId)}, method: ${JSON.stringify(method)}, params: ${JSON.stringify(params)} });`),
                inChrome: (body) => live.inChrome(app, body),
                chromeActiveTabId: () => live.chromeActiveTabId(app),
                /** The BiDi context of the one page document whose URL ends with path. */
                contentOf: async (path) => {
                    const hits = (await app.contexts()).filter((e) => typeof e.url === 'string' && new URL(e.url, 'http://x').pathname === path);
                    return hits.length === 1 ? hits[0].context : null;
                },
                /** Evaluates expr (JSON-safe result) in the page at path; null when the page is not found. */
                inPage: async (path, expr) => {
                    const c = await ctx.contentOf(path);
                    return c ? JSON.parse(await app.evaluateIn(c, `JSON.stringify(${expr})`)) : null;
                },
                setDpr: (n) => app.evaluateIn(app.chrome, `(() => { Services.prefs.setCharPref(${JSON.stringify(DPR_PREF)}, ${JSON.stringify(String(n))}); return true; })()`),
                /** Decodes a PNG file in the Theia frame and reads RGBA at device-pixel points. The file is removed after. */
                pixels: async (file, points) => {
                    const b64 = readFileSync(file).toString('base64');
                    rmSync(file, { force: true });
                    return ctx.probe(`const img = new Image(); img.src = 'data:image/png;base64,${b64}'; await img.decode();
                        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
                        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
                        return { size: [c.width, c.height], px: ${JSON.stringify(points)}.map(p => [...g.getImageData(p.x, p.y, 1, 1).data].slice(0, 3)) };`);
                },
                installPaneRecorder: () => ctx.probe(PANE_RECORDER),
                paneLog: (since = 0) => ctx.probe(`return (window.__pbPaneLog || []).filter(e => e.t >= ${Number(since)});`),
                /** Opens a stock window through openStockTab (the GUI-01 command); resolves its chrome BiDi context. */
                openStock: async (except = []) => {
                    await ctx.command('powerbrowser.open-browser-window', pages.url('/stock'));
                    return ctx.pollFor(async () => {
                        for (const e of await app.contexts('chrome')) {
                            if (except.includes(e.context)) continue;
                            if (await app.evaluateIn(e.context, `typeof gBrowser === 'object' && gBrowser.browsers.some(b => b.currentURI.spec === ${JSON.stringify(pages.url('/stock'))})`) === true) return e.context;
                        }
                        return null;
                    }, 20000, 'a stock browser window on the fixture page');
                },
                /** A stock window's chrome: the id'd toolbar and tab strip nodes (sorted), the agent mark, its selected browser's id. */
                stockChrome: async (context) => JSON.parse(await app.evaluateIn(context, `JSON.stringify({
                    nodes: [...document.querySelectorAll('#navigator-toolbox [id], #TabsToolbar [id]')].filter(e => !e.closest('.tabbrowser-tab')).map(e => e.localName + '#' + e.id).sort(),
                    mark: !!document.querySelector('.pb-chrome-bar-agent, .pb-agent-controlled'),
                    browserId: gBrowser.selectedBrowser.browserId,
                })`)),
                /** The chrome bar's agent mark and the agent widget's title class, read from the Theia DOM. */
                markState: (widgetId) => ctx.probe(`const w = get('ApplicationShell').getWidgetById(${JSON.stringify(widgetId)});
                    return { mark: !!document.querySelector('.pb-chrome-bar-agent'), titleClass: !!w && w.title.className.split(/\\s+/).includes('pb-agent-controlled'),
                        domTitleClass: !!document.querySelector('.lm-TabBar-tab.pb-agent-controlled'), control: w && w.agentControl ? { ...w.agentControl } : null };`),
                clickStop: () => ctx.probe(`const b = document.querySelector('.pb-chrome-bar-agent-stop'); if (!b) return false; b.click(); return true;`),
                /** Waits for a new web tab (an id not in `before`), resolving { tab, addT } with the addWidget clock. */
                newWebTab: async (before, t0, ms = 5000) => {
                    try {
                        return await ctx.pollFor(async () => {
                            const fresh = (await ctx.webTabs()).filter((w) => !before.includes(w.id));
                            if (!fresh.length) return null;
                            const added = (await ctx.addedSince(t0)).filter((e) => fresh.some((w) => w.id === e.id));
                            return { tabs: fresh, addT: added[0]?.t ?? null };
                        }, ms, 'a new web tab');
                    } catch { return { tabs: [], addT: null }; }
                },
            });
            if (dpr !== 1) await ctx.setDpr(dpr);
            if (!(await ctx.installPaneRecorder())) throw new Error('harness: the pane-list recorder did not install (no bundle module)');
            log(`session: orcad ready, dpr ${dpr}${home ? ', scratch HOME' : ''}`);
            return fn(ctx);
        });
    } finally {
        await pages.close();
        if (home) { if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome; }
        await sleep(0);
    }
}

/** The decoy marker: Orca's sidecar profile record file name, derived from the pinned source. */
export function decoyRecordFile(root = REPO_ROOT) {
    const src = readFileSync(join(root, 'orca/src/main/orcad/electron-sidecar-profile.ts'), 'utf8');
    const m = /const PROFILE_RECORD_FILE = '([^']+)'/.exec(src);
    if (!m) throw new Error('source moved: no PROFILE_RECORD_FILE literal in electron-sidecar-profile.ts');
    return m[1];
}
