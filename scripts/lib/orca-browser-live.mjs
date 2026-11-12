// scripts/lib/orca-browser-live.mjs
//
// Phase 66 (BRW-02, BRW-03, BRW-04; P66-30, P66-26, P66-29, A1, A3): the live session
// orca-browser-agent-live and orca-agent-mark-live share. It is Phase 64's
// withOrcaTabsSession (scratch profile, MOZ_PURGE_CACHES=1, inherited ORCA_* scrubbed,
// output redaction installed before anything is read, a throwaway repository registered
// with orcad, teardown by recorded pid) plus what the browser rows need:
//   - a loopback fixture server: /agent (a red 40x40 target at CSS (100, 80), a text
//     input, a checkbox, a button with a click counter), /user (an input and a focus/blur
//     log), /cookie (sets a cookie from the page), /stock, /opener (66-08: a target=_blank link,
//     a plain link and a target=_blank form), and (66-09) /dlpage with PDF attachments, /proto with protocol links and
//     /slow, whose response headers are held, (66-10) /clip (clipboard writes and reads on a click, an input, a
//     same-origin frame) and /perm, and its request log;
//   - an Orca CLI runner that never throws and keeps error.code and error.message apart
//     (Pitfall 8: a host failure reaches the CLI as runtime_error with the code as message),
//     in an environment built from scratch (PATH, HOME, ORCA_USER_DATA, ORCA_USER_DATA_PATH);
//   - reads of the Theia frame (web tabs, the current widget, the addWidget clock, the
//     chrome bar, title classes, the page table, a raw webTabAgent through WebTabChannel),
//     of chrome (overlay entries, focus, elementFromPoint) and of page documents through
//     WebDriver BiDi contexts (the harness only; D-11). Agent tabs are not BiDi contexts: their message manager
//     group has no BiDi frame actor (MessageHandlerFrameActor is registered for "browsers" only), so an agent
//     document is read through the bridge's own browser.eval (inAgent), a page-world read (66-06);
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

/** 66-09: the external-protocol fixture: a scheme whose handler runs without asking, one that asks, and a probe word. */
export const PROTOCOL_RUN = 'pbrun';
export const PROTOCOL_ASK = 'pbask';
export const PROTOCOL_PROBE = 'pb-protocol-probe';
/** 66-09: how long /slow holds its response headers (the first-document clause runs inside this window). */
export const SLOW_HEADERS_MS = 10000;
// A one-page PDF served as an attachment: Gecko saves it and, its preferred action being handleInternally, opens it.
const PDF = '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
function pdfAttachment(res, name) {
    res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${name}"` });
    res.end(PDF);
}

/**
 * 66-10 (D-38): the clipboard markers, random per run so a stale clipboard never matches. Only these words, never
 * clipboard text, leave the browser: chrome compares the clipboard with them and answers the matching name.
 */
const CLIP_RUN = Math.random().toString(36).slice(2, 10);
export const CLIP_MARKERS = Object.freeze({
    user: `pb-clip-user-${CLIP_RUN}`, write: `pb-clip-agent-write-${CLIP_RUN}`, copy: `pb-clip-agent-copy-${CLIP_RUN}`, frame: `pb-clip-agent-frame-${CLIP_RUN}`,
});
// The /clip button: execCommand copy of the textarea, writeText from the page and from its same-origin frame, then
// readText (raced against 3 s, so a paste prompt cannot hold the clause); each outcome recorded as a word, the read as
// whether it equals the user's marker.
const CLIP_SCRIPT = `<script>
const M = ${JSON.stringify(CLIP_MARKERS)};
const settle = p => Promise.race([p.then(v => 'resolved' + (typeof v === 'string' ? (v === M.user ? ' user-marker' : ' other') : ''), e => 'rejected ' + (e && e.name)), new Promise(r => setTimeout(() => r('pending'), 3000))]);
document.getElementById('go').addEventListener('click', async () => {
  const r = { clicked: true, active: navigator.userActivation ? navigator.userActivation.isActive : null };
  const t = document.getElementById('src'); t.focus(); t.select();
  try { r.execCopy = String(document.execCommand('copy')); } catch (e) { r.execCopy = 'threw ' + e.name; }
  r.writeText = await settle(navigator.clipboard.writeText(M.write));
  const f = document.getElementById('f').contentWindow;
  r.frameWrite = f && f.navigator.clipboard ? await settle(f.navigator.clipboard.writeText(M.frame)) : 'no frame clipboard';
  r.readText = await settle(navigator.clipboard.readText());
  window.__clip = r;
});
</script>`;

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
        // 66-08 (D-35): the opens clause (n). A target=_blank link, a plain link and a target=_blank form, each tagged
        // with a via= query so the server log tells which open loaded a page.
        '/opener': {
            title: 'PB opener fixture',
            body: '<style>body{margin:0}a,button{position:absolute;left:10px;font-size:20px}</style><a id="blank" href="/agent2?via=blank" target="_blank" style="top:10px">blank</a><a id="plain" href="/agent2?via=plain" style="top:60px">plain</a><form id="f" action="/agent2" target="_blank"><input type="hidden" name="via" value="form"><button id="fs" type="submit" style="top:110px">form</button></form>',
        },
        // 66-09 (D-37): clause (o) downloads (two links to PDF attachments), (p) external protocols (mailto:, a scheme
        // with a granted handler, a scheme that asks) and (q) a first load whose headers are held, so the overlay stays
        // on its initial about:blank.
        '/dlpage': {
            title: 'PB download fixture',
            body: '<style>a{position:absolute;left:10px;font-size:20px}</style><a id="user" href="/pb-user.pdf" style="top:10px">user</a><a id="agent" href="/pb-agent.pdf" style="top:60px">agent</a>',
        },
        '/pb-user.pdf': { raw: (req, res) => pdfAttachment(res, 'pb-user.pdf') },
        '/pb-agent.pdf': { raw: (req, res) => pdfAttachment(res, 'pb-agent.pdf') },
        '/pb-agent-goto.pdf': { raw: (req, res) => pdfAttachment(res, 'pb-agent-goto.pdf') },
        '/proto': {
            title: 'PB protocol fixture',
            body: `<style>a{position:absolute;left:10px;font-size:20px}</style><a id="mailto" href="mailto:${PROTOCOL_PROBE}" style="top:10px">mail</a><a id="run" href="${PROTOCOL_RUN}:${PROTOCOL_PROBE}" style="top:60px">run</a><a id="ask" href="${PROTOCOL_ASK}:${PROTOCOL_PROBE}" style="top:110px">ask</a>`,
        },
        '/slow': { raw: (req, res) => setTimeout(() => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>PB slow fixture</title><p>slow</p>'); }, SLOW_HEADERS_MS) },
        // 66-10 (D-38, D-39): clause (r), the clipboard (a button, a textarea holding the copy marker, an input, a
        // same-origin frame), and clause (s), a page that reads its notification permission.
        '/clip': {
            title: 'PB clipboard fixture',
            body: `<style>body{margin:0}#go{position:absolute;left:10px;top:10px}#src{position:absolute;left:10px;top:60px}#in{position:absolute;left:10px;top:140px}</style><button id="go">go</button><textarea id="src">${CLIP_MARKERS.copy}</textarea><input id="in" value=""><iframe id="f" srcdoc="<p>frame</p>" style="position:absolute;left:10px;top:200px;width:100px;height:40px"></iframe>${CLIP_SCRIPT}`,
        },
        '/perm': { title: 'PB permission fixture', body: '<p>perm</p>' },
        // 66-06: a login form for the saved-login clause (l); it posts to a page that exists.
        '/login': { title: 'PB login fixture', body: '<form id="f" method="post" action="/agent2"><input id="u" name="u" autocomplete="username"><input id="p" name="p" type="password" autocomplete="current-password"><button id="go" type="submit">Sign in</button></form>' },
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
                /** The fixture server's GET log ({ path, search, at, ... }), live. */
                requests: () => pages.requests,
                /** Runs the Orca CLI; never throws. Resolves { ok, result, error, t0, ms }. */
                cli: (...args) => new Promise((resolve) => {
                    const t0 = Date.now();
                    execFile(cliBin, [...args, '--json'], { env: cliEnv, cwd: ctx.repo, timeout: 90000, encoding: 'utf8' }, (_e, stdout) => resolve({ ...cliOutcome(stdout), t0, ms: Date.now() - t0 }));
                }),
                webTabs: () => ctx.probe(WEB_TABS),
                // The main area's current tab (66-07): the focus tracker's currentWidget stays null when no Theia node takes
                // DOM focus (a web tab's page is a chrome overlay), so it cannot see a tab brought forward.
                currentId: () => ctx.probe(`const c = get('ApplicationShell').getCurrentWidget('main'); return c ? c.id : null;`),
                tabOfPage: (pageId) => ctx.probe(`return get('OrcaBrowserPages').tabOf(${JSON.stringify(pageId)}) ?? null;`),
                hostAttached: () => ctx.probe(`return await until(() => !!get('OrcaBrowserHost').session, 60000);`, 90000),
                linkPresent: () => ctx.probe(`return !!globalThis[Symbol.for(${JSON.stringify(LINK_KEY)})];`),
                paneWidgetCount: () => ctx.probe(`return get('WidgetManager').getWidgets(${JSON.stringify(ORCA_PANE_FACTORY_ID)}).length;`),
                /** A raw webTabAgent from the frontend, as the dispatcher sends it; resolves chrome's reply. */
                agentRaw: (tabId, method, params = {}) => ctx.probe(`return await get('WebTabChannel').request({ kind: 'webTabAgent', tabId: ${JSON.stringify(tabId)}, method: ${JSON.stringify(method)}, params: ${JSON.stringify(params)} });`),
                inChrome: (body) => live.inChrome(app, body),
                /** Evaluates expr (JSON-safe result) in an agent tab's page through the bridge's browser.eval; null on a refusal. */
                inAgent: async (tabId, expr) => {
                    const r = await ctx.agentRaw(tabId, 'browser.eval', { expression: `JSON.stringify((${expr}) ?? null)` });
                    return r?.where === 'done' && typeof r.result?.result === 'string' ? JSON.parse(r.result.result) : null;
                },
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
