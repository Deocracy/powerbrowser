#!/usr/bin/env node
// scripts/verify-ext-tab-host-live.mjs
//
// Phase 31.1 plan 02 (EXT-05): live proof, on the rebuilt binary with patch 050
// applied, that an installed extension sees the shell's web tabs as real tabs.
// The Theia frame stays out of every extension-visible path, while WebDriver
// still reaches it through gBrowser.webDriverTabs.
//
// Each scenario runs in its own session: a fresh profile, one probe extension
// installed through AddonManager.installTemporaryAddon in chrome scope, and the
// shell. A session opens at most four web tabs, all on this script's own
// 127.0.0.1 origin. Every scenario has a PLANT that must go red naming its
// expected text. A plant that does not apply is a harness failure, not a pass.
//
// Preflight, BROKEN INSTRUMENT on failure:
//   - the sha256 of patches/050-extension-tab-host.patch equals the stamp in
//     objdir/.pb-050-build.sha256, and the sha256 of
//     patches/060-extension-network-wall.patch equals objdir/.pb-060-build.sha256
//     (the binary carries both patches);
//   - after the install, chrome scope reports windowTracker.isTabHostWindow as a
//     function, windowTracker.isBrowserWindow(window) true, and tabTracker
//     getBrowserData as a function.
//
// Scenarios (31.1-02): query, sender, webrequest, events, active-tab, ide-retain,
// focus-follow, window-type, execute. Scenarios (31.1-04): adversarial-starts (the
// chrome-error recorder with its positive control, zero tabs, IDE current, first
// tab), toolbar-target, gui01 (the stock window with the shell admitted),
// scheme-wall and theia-never. Scenarios (38-06): network-wall (UF-31.1-02: the Theia frame's requests and the
// token cookie stay out of webRequest and browser.cookies, with web-tab positive controls) and windows-refusal
// (UF-31.1-01: windows.remove and windows.update are refused on the shell, which stays up), and worker-wall
// (UF-31.1-02: a service worker on the Theia origin has no browser, and its loads stay hidden too). Scenario (38-07):
// webview-render (a Theia webview renders from its <uuid>.webview.localhost:<port> origin, and its service worker's
// loads stay hidden). The fixtures are written from the literals in this
// file into temporary directories, and removed when the session ends.
//
//   node scripts/verify-ext-tab-host-live.mjs [--scenario a,b] [--self-test]
//
// Node built-ins plus ./lib/pb-relaunch.mjs and ./lib/pb-live-probe.mjs only.

import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withProbeShell, openWebTab, makeCurrent, focusOverlay, focusTheiaFrame, installPushRecorder, pushes, waitForPush } from './lib/pb-live-probe.mjs';
import { GET_BY_NAME, REPO_ROOT, probe, stockTabOn } from './lib/pb-relaunch.mjs';

const NAME = 'verify-ext-tab-host-live';
const EXT_ID = 'pb-ext-tab-host-probe@powerbrowser.test';
const API_URL = 'chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs';
const PATCH_FILE = join(REPO_ROOT, 'patches/050-extension-tab-host.patch');
const STAMP_FILE = join(REPO_ROOT, 'objdir/.pb-050-build.sha256');
const PATCH_060_FILE = join(REPO_ROOT, 'patches/060-extension-network-wall.patch');
const STAMP_060_FILE = join(REPO_ROOT, 'objdir/.pb-060-build.sha256');
const TOKEN_COOKIE = 'POWERBROWSER_TOKEN';
const SW_PATH = '/pb-probe-sw.js';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 1x1 PNG served as every page's favicon, so LinkHandlerParent hands gBrowser.setIcon an icon.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// ---------------------------------------------------------------------------
// The probe extension. Literal source, written at run time.
// ---------------------------------------------------------------------------

const MANIFEST = {
  manifest_version: 2,
  name: 'PB tab host probe',
  version: '1.0',
  browser_specific_settings: { gecko: { id: EXT_ID } },
  permissions: ['tabs', 'webRequest', 'webRequestBlocking', 'webNavigation', 'cookies', '<all_urls>'],
  background: { scripts: ['background.js'] },
  content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'], run_at: 'document_idle' }],
  browser_action: { default_title: 'PB tab host probe' },
  web_accessible_resources: ['page.html'],
  // 39-13 (38 T30): an options page that opens in a tab, for runtime.openOptionsPage.
  options_ui: { page: 'options.html', open_in_tab: true },
  page_action: { default_title: 'PB tab host probe page', show_matches: ['<all_urls>'] },
  commands: { 'pb-probe-command': { suggested_key: { default: 'Ctrl+Shift+Y' }, description: 'PB tab host probe' } },
};

const PAGE = '<!doctype html><title>PB probe extension page</title><body>extension page</body>';

// Every record goes to the harness's /log endpoint. Commands arrive on /cmd.
const BACKGROUND = `
const ORIGIN = __ORIGIN__;
// A record of the probe's own channel is never posted: every post is a /log fetch, so recording one feeds back, and the
// two webRequest recorders below double the traffic on every hop until the browser stops answering.
const ownChannel = u => String(u).startsWith(ORIGIN + '/log') || String(u).startsWith(ORIGIN + '/cmd');
const post = rec => { if (!ownChannel(rec.url)) fetch(ORIGIN + '/log', { method: 'POST', body: JSON.stringify(rec) }).catch(() => {}); };
const brief = t => t && { id: t.id, url: t.url, windowId: t.windowId, active: t.active, title: t.title, favIconUrl: t.favIconUrl, status: t.status, mutedInfo: t.mutedInfo };
post({ kind: 'started' });
browser.tabs.onZoomChange.addListener(z => post({ kind: 'zoom', tabId: z && z.tabId, oldZoomFactor: z && z.oldZoomFactor, newZoomFactor: z && z.newZoomFactor, zoomSettings: z && z.zoomSettings }));
browser.browserAction.onClicked.addListener(tab => post({ kind: 'clicked', tabId: tab.id, url: tab.url, windowId: tab.windowId }));
browser.tabs.onCreated.addListener(t => post({ kind: 'created', tab: brief(t) }));
browser.tabs.onActivated.addListener(i => post({ kind: 'activated', tabId: i.tabId, windowId: i.windowId, previousTabId: i.previousTabId }));
browser.tabs.onUpdated.addListener((id, change, t) => post({ kind: 'updated', tabId: id, change, url: t && t.url, title: t && t.title, windowId: t && t.windowId }));
browser.tabs.onRemoved.addListener((id, info) => post({ kind: 'removed', tabId: id, windowId: info.windowId, isWindowClosing: info.isWindowClosing }));
browser.webRequest.onBeforeRequest.addListener(d => post({ kind: 'request', tabId: d.tabId, url: d.url, type: d.type, frameId: d.frameId }), { urls: ['<all_urls>'] }); // every type: the Theia frame's documents and subresources reach the recorder (WR-01)
browser.webRequest.onBeforeRequest.addListener(d => (d.url.endsWith('/redirect-me') ? { redirectUrl: browser.runtime.getURL('page.html') } : {}), { urls: ['<all_urls>'], types: ['main_frame'] }, ['blocking']);
browser.webNavigation.onCommitted.addListener(d => post({ kind: 'committed', tabId: d.tabId, url: d.url, frameId: d.frameId }));
// UF-31.1-02: whether a Cookie header carried the token is recorded as a boolean; the value is never posted.
browser.webRequest.onBeforeSendHeaders.addListener(d => post({ kind: 'headers', tabId: d.tabId, url: d.url, token: (d.requestHeaders || []).some(h => /^cookie$/i.test(h.name) && /(^|;\\s*)POWERBROWSER_TOKEN=/.test(h.value || '')) }), { urls: ['<all_urls>'] }, ['requestHeaders']);
browser.cookies.onChanged.addListener(c => post({ kind: 'cookie-changed', name: c.cookie.name, domain: c.cookie.domain, removed: c.removed }));
browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.kind === 'hello') {
    post({ kind: 'sender', tabId: sender.tab && sender.tab.id, url: sender.tab && sender.tab.url, frameId: sender.frameId, href: msg.href });
  }
  return undefined;
});
async function run(cmd) {
  try {
    let result;
    if (cmd.op === 'query') result = (await browser.tabs.query(cmd.info || {})).map(brief);
    else if (cmd.op === 'get') result = brief(await browser.tabs.get(cmd.tabId));
    else if (cmd.op === 'exec') result = await browser.tabs.executeScript(cmd.tabId, { code: cmd.code });
    else if (cmd.op === 'send') result = await browser.tabs.sendMessage(cmd.tabId, cmd.message);
    else if (cmd.op === 'update') result = brief(await browser.tabs.update(cmd.tabId, cmd.props));
    else if (cmd.op === 'updateExtPage') result = brief(await browser.tabs.update(cmd.tabId, { url: browser.runtime.getURL('page.html') }));
    else if (cmd.op === 'updateExtPagePinned') result = brief(await browser.tabs.update(cmd.tabId, { url: browser.runtime.getURL('page.html'), pinned: true }));
    else if (cmd.op === 'create') result = brief(await browser.tabs.create(cmd.props));
    else if (cmd.op === 'openOptions') { await browser.runtime.openOptionsPage(); result = true; }
    else if (cmd.op === 'ownUrl') result = browser.runtime.getURL(cmd.path);
    else if (cmd.op === 'pageShown') result = await browser.pageAction.isShown({ tabId: cmd.tabId });
    else if (cmd.op === 'getZoom') result = await browser.tabs.getZoom(cmd.tabId);
    else if (cmd.op === 'getZoomSettings') result = await browser.tabs.getZoomSettings(cmd.tabId);
    else if (cmd.op === 'capture') { const data = await browser.tabs.captureTab(cmd.tabId); result = { prefix: String(data).slice(0, 22), length: String(data).length }; }
    else if (cmd.op === 'windowsCall') {
      const w = await browser.windows[cmd.method](...(cmd.args || []));
      result = w && typeof w === 'object' ? { id: w.id, type: w.type, state: w.state } : (w === undefined ? null : w);
    }
    else if (cmd.op === 'cookieNames') result = (await browser.cookies.getAll({ domain: cmd.domain })).map(c => c.name);
    else if (cmd.op === 'cookieSet') result = !!(await browser.cookies.set(cmd.details));
    else if (cmd.op === 'windows') {
      const w = await browser.windows[cmd.method](cmd.info || {});
      result = Array.isArray(w) ? w.map(x => ({ id: x.id, type: x.type, focused: x.focused })) : { id: w.id, type: w.type };
    }
    else throw new Error('unknown op ' + cmd.op);
    post({ kind: 'result', opId: cmd.opId, ok: true, result });
  } catch (e) {
    post({ kind: 'result', opId: cmd.opId, ok: false, error: String((e && e.message) || e) });
  }
}
setInterval(() => {
  fetch(ORIGIN + '/cmd').then(r => r.json()).then(cmds => cmds.forEach(run)).catch(() => {});
}, 250);
`;

const CONTENT = `
browser.runtime.sendMessage({ kind: 'hello', href: location.href }).catch(() => {});
browser.runtime.onMessage.addListener(msg => (msg === 'ping' ? Promise.resolve(location.pathname) : undefined));
`;

// ---------------------------------------------------------------------------
// The served origin: /a, /b, /c and /d are pages with an icon link; /cmd and /log are the probe channel.
// ---------------------------------------------------------------------------

let session = { logs: [], queue: [], fuQueue: [] };
let opSeq = 0;
// Every add-on directory a session writes; removed when the session ends.
const sessionDirs = [];

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (req.method === 'POST' && path === '/log') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        session.logs.push(JSON.parse(body));
      } catch {
        session.logs.push({ kind: 'bad-log', body });
      }
      res.writeHead(204, { 'access-control-allow-origin': '*' });
      res.end();
    });
    return;
  }
  if (path === '/cmd') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(session.queue));
    session.queue = [];
    return;
  }
  if (path === '/fucmd') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(session.fuQueue));
    session.fuQueue = [];
    return;
  }
  if (path === '/icon.png') {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(PNG);
    return;
  }
  // 38-06 worker-wall: a page that registers a service worker, and the worker script.
  if (path === '/sw') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>page /sw</title><body>worker page<script>navigator.serviceWorker.register('${SW_PATH}').catch(() => {});</script></body>`);
    return;
  }
  if (path === SW_PATH) {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end("self.addEventListener('install', () => self.skipWaiting());");
    return;
  }
  if (path === '/plain') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>page /plain</title><body>live page /plain, no icon</body>');
    return;
  }
  if (/^\/[a-z]$/.test(path)) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>page ${path}</title><link rel="icon" href="/icon.png"><body>live page ${path}</body>`);
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const url = path => `${ORIGIN}${path}`;

// ---------------------------------------------------------------------------
// Fixtures: the probe (all scenarios), an activeTab-only action, and the GUI-01 furniture.
// ---------------------------------------------------------------------------

const fixture = (id, name, manifest, extra) => ({ id, name, files: { 'manifest.json': JSON.stringify(manifest), ...extra } });
const withOrigin = source => source.replace('__ORIGIN__', JSON.stringify(ORIGIN));
const PROBE = fixture(EXT_ID, 'probe', MANIFEST, { 'background.js': withOrigin(BACKGROUND), 'content.js': CONTENT, 'page.html': PAGE,
  'options.html': '<!doctype html><title>PB probe options</title><body>options</body>' });

const AT_ID = 'pb-ext-tab-host-activetab@powerbrowser.test';
const AT_MANIFEST = {
  manifest_version: 2,
  name: 'PB activeTab probe',
  version: '1.0',
  browser_specific_settings: { gecko: { id: AT_ID } },
  permissions: ['activeTab'],
  background: { scripts: ['background.js'] },
  browser_action: { default_title: 'PB activeTab probe' },
};
const AT_BACKGROUND = `
const ORIGIN = __ORIGIN__;
const post = rec => { fetch(ORIGIN + '/log', { method: 'POST', body: JSON.stringify(rec) }).catch(() => {}); };
browser.browserAction.onClicked.addListener(async tab => {
  let path = null;
  let err = null;
  try { path = (await browser.tabs.executeScript({ code: 'location.pathname' }))[0]; } catch (e) { err = String((e && e.message) || e); }
  post({ kind: 'at-clicked', tabId: tab.id, path, err });
});
`;
const ACTIVE = fixture(AT_ID, 'activeTab', AT_MANIFEST, { 'background.js': withOrigin(AT_BACKGROUND) });

const FURN_ID = 'pb-ext-tab-host-furniture@powerbrowser.test';
const FURN_MANIFEST = {
  manifest_version: 2,
  name: 'PB tab host furniture',
  version: '1.0',
  browser_specific_settings: { gecko: { id: FURN_ID } },
  permissions: ['tabs', 'menus', 'sessions', '<all_urls>'],
  background: { scripts: ['background.js'] },
  browser_action: { default_title: 'PB tab host furniture', default_area: 'navbar' },
  sidebar_action: { default_panel: 'sidebar.html', default_title: 'PB tab host furniture' },
  commands: { _execute_sidebar_action: { suggested_key: { default: 'Ctrl+Shift+U' }, description: 'PB sidebar' } },
};
const FURN_BACKGROUND = `
const ORIGIN = __ORIGIN__;
const post = rec => { fetch(ORIGIN + '/log', { method: 'POST', body: JSON.stringify(rec) }).catch(() => {}); };
post({ kind: 'fu.started' });
browser.tabs.onZoomChange.addListener(z => post({ kind: 'zoom', tabId: z && z.tabId }));
const ops = {
  setBadgeGlobal: ({ text }) => browser.browserAction.setBadgeText({ text }),
  menusCreate: async () => String(browser.menus.create({ id: 'pb-tab-host-furniture', title: 'PB furniture item', contexts: ['page'] })),
  recentlyClosed: () => browser.sessions.getRecentlyClosed().then(r => r.length),
  sidebarIsOpen: () => browser.sidebarAction.isOpen({}),
};
setInterval(async () => {
  let cmds;
  try { cmds = await (await fetch(ORIGIN + '/fucmd')).json(); } catch { return; }
  for (const c of cmds) {
    try {
      const r = await ops[c.op](c.args || {});
      post({ kind: 'fu-result', opId: c.opId, ok: true, result: r === undefined ? null : r });
    } catch (e) {
      post({ kind: 'fu-result', opId: c.opId, ok: false, error: String((e && e.message) || e) });
    }
  }
}, 150);
`;
const FURNITURE = fixture(FURN_ID, 'furniture', FURN_MANIFEST, {
  'background.js': withOrigin(FURN_BACKGROUND),
  'sidebar.html': '<!doctype html><title>PB sidebar</title><body>sidebar</body>',
});

function resetSession() {
  session = { logs: [], queue: [], fuQueue: [] };
}

// Records from index `from` onward that match pred, polled for up to timeoutMs. undefined on timeout.
async function waitSince(from, pred, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const hit = session.logs.slice(from).find(pred);
    if (hit) return hit;
    if (Date.now() > end) return undefined;
    await sleep(150);
  }
}

async function waitFor(pred, what, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const hit = session.logs.find(pred);
    if (hit) return hit;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(150);
  }
}

// Waits for a predicate for up to timeoutMs. undefined when it never matched: a verdict, not an error.
async function tryWait(pred, timeoutMs) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const hit = session.logs.find(pred);
    if (hit) return hit;
    if (Date.now() > end) return undefined;
    await sleep(150);
  }
}

// One probe command: queued for the background page, answered on /log.
async function command(op, args = {}) {
  const opId = `op${++opSeq}`;
  session.queue.push({ op, opId, ...args });
  const rec = await waitFor(r => r.kind === 'result' && r.opId === opId, `${op} answer`, 20000);
  if (!rec.ok) throw new Error(`${op} rejected by the extension: ${rec.error}`);
  return rec.result;
}

// ---------------------------------------------------------------------------
// Chrome-scope helpers, evaluated in the shell document.
// ---------------------------------------------------------------------------

const IMPORT_EXT = "const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');";

async function chromeJson(app, body) {
  const text = await app.evaluateIn(app.chrome, `JSON.stringify((() => { ${body} })())`);
  return JSON.parse(text);
}

// The same, in a named chrome context (a stock browser window).
async function chromeJsonIn(app, context, body) {
  return JSON.parse(await app.evaluateIn(context, `JSON.stringify((() => { ${body} })())`));
}

// One command for the furniture extension: queued on /fucmd, answered on /log.
async function fuCommand(app, op, args = {}) {
  const opId = `fu${++opSeq}`;
  session.fuQueue.push({ op, opId, args });
  return waitFor(r => r.kind === 'fu-result' && r.opId === opId, `furniture ${op} answer`, 20000);
}

// Writes a fixture into a fresh directory and installs it as a temporary add-on.
async function installFixture(app, fixture) {
  const dir = await mkdtemp(join(tmpdir(), 'pb-ext-tab-host-fixture-'));
  sessionDirs.push(dir);
  for (const [name, body] of Object.entries(fixture.files)) {
    await writeFile(join(dir, name), body);
  }
  const installed = JSON.parse(
    await app.evaluateIn(
      app.chrome,
      `(async () => {
        try {
          const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
          const f = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
          f.initWithPath(${JSON.stringify(dir)});
          const addon = await AddonManager.installTemporaryAddon(f);
          return JSON.stringify({ id: addon.id, isActive: addon.isActive });
        } catch (e) { return JSON.stringify({ error: String(e) }); }
      })()`
    )
  );
  if (installed.error || installed.id !== fixture.id) {
    throw new Error(`BROKEN INSTRUMENT: the ${fixture.name} extension did not install: ${JSON.stringify(installed)}`);
  }
  return dir;
}

async function installProbe(app) {
  const dir = await installFixture(app, PROBE);
  const pre = await chromeJson(
    app,
    `${IMPORT_EXT}
     const g = ExtensionParent.apiManager.global;
     return {
       isTabHost: typeof g.windowTracker.isTabHostWindow === 'function',
       isBrowser: g.windowTracker.isBrowserWindow(window) === true,
       tabTracker: typeof g.tabTracker.getBrowserData === 'function',
     };`
  );
  if (!pre.isTabHost || !pre.isBrowser || !pre.tabTracker) {
    throw new Error(`BROKEN INSTRUMENT: the running binary does not carry the tab host: ${JSON.stringify(pre)}`);
  }
  return dir;
}

// The extension id the trackers mint for an overlay, by its shell tab id.
async function extensionIdOf(app, webTabId) {
  return chromeJson(
    app,
    `${IMPORT_EXT}
     const W = ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs;
     const b = [...document.querySelectorAll('browser')].find(x => W.tabIdOfBrowser(x) === ${JSON.stringify(webTabId)});
     if (!b) return { found: false, id: null };
     return { found: true, id: ExtensionParent.apiManager.global.tabTracker.getBrowserData(b).tabId };`
  );
}

async function theiaInfo(app) {
  return chromeJson(
    app,
    `${IMPORT_EXT}
     const frame = document.getElementById('powerbrowser-content');
     const spec = frame.currentURI ? frame.currentURI.spec : 'about:blank';
     let origin = null;
     try { origin = new URL(spec).origin; } catch { origin = null; }
     return {
       origin,
       extensionId: ExtensionParent.apiManager.global.tabTracker.getBrowserData(frame).tabId,
       webDriverFirst: window.gBrowser.webDriverTabs[0].linkedBrowser.id,
     };`
  );
}

async function waitForTheiaOrigin(app) {
  const end = Date.now() + 90000;
  for (;;) {
    const info = await theiaInfo(app);
    if (info.origin && info.origin !== 'null') return info;
    if (Date.now() > end) throw new Error('BROKEN INSTRUMENT: the Theia frame never reported an origin');
    await sleep(500);
  }
}

// Reloads the Theia frame after the probe is installed, so its documents and requests pass the recorders (WR-01).
// Returns once the frame has been idle for about two seconds on the Theia origin.
async function reloadTheiaFrame(app, theia) {
  await chromeJson(app, `document.getElementById('powerbrowser-content').reload(); return { landed: true };`);
  const end = Date.now() + 90000;
  let idle = 0;
  for (;;) {
    await sleep(500);
    const info = await chromeJson(app, `const f = document.getElementById('powerbrowser-content');
      return { loading: f.webProgress.isLoadingDocument, origin: f.currentURI ? f.currentURI.spec : null };`);
    idle = info.loading ? 0 : idle + 1;
    if (idle >= 4 && info.origin && new URL(info.origin).origin === theia.origin) return;
    if (Date.now() > end) throw new Error('BROKEN INSTRUMENT: the Theia frame did not finish reloading');
  }
}

// Opens a web tab. extId is -1 when the trackers cannot name the overlay.
async function openTab(app, path) {
  const webTabId = await openWebTab(app, url(path));
  const ext = await extensionIdOf(app, webTabId);
  return { webTabId, extId: ext.found && typeof ext.id === 'number' ? ext.id : -1 };
}

// Opens a web tab and waits until the extension sees its page load (webNavigation.onCommitted).
async function openAndCommit(app, path) {
  const tab = await openTab(app, path);
  await waitFor(r => r.kind === 'committed' && String(r.url).endsWith(path), `committed ${path}`, 30000);
  if (tab.extId <= 0) {
    throw new Error(`the overlay for ${path} has no extension tab id`);
  }
  return tab;
}

// ---------------------------------------------------------------------------
// Plants. Each mutates the running shell so one scenario must go red naming its text.
// ---------------------------------------------------------------------------

// A real XUL node in the strip whose linkedBrowser is the Theia frame.
const PLANT_THEIA_IN_TABS = `
  const frame = document.getElementById('powerbrowser-content');
  const strip = document.getElementById('powerbrowser-tab-host');
  const node = document.createXULElement('hbox');
  Object.assign(node, { linkedBrowser: frame, linkedPanel: 'planted-theia', pinned: false, hidden: false,
    multiselected: false, muted: false, soundPlaying: false, undiscardable: false, openerTab: null,
    group: null, splitview: null, userContextId: 0, lastAccessed: 0, label: 'planted', image: null,
    successor: null, closing: false });
  Object.defineProperties(node, {
    _tPos: { get() { return Array.prototype.indexOf.call(strip.children, this); } },
    selected: { get() { return false; } },
  });
  strip.insertBefore(node, strip.firstChild);
  return { landed: window.gBrowser.tabs[0] === node };`;

const PLANT_NO_TAB_FOR_BROWSER = `
  window.gBrowser.getTabForBrowser = () => null;
  return { landed: window.gBrowser.getTabForBrowser(document.getElementById('powerbrowser-content')) === null };`;

// ---------------------------------------------------------------------------
// Scenarios. Each returns { ok, detail, fail }.
// ---------------------------------------------------------------------------

function verdict(ok, detail, fail) {
  return ok ? { ok: true, detail, fail: null } : { ok: false, detail: null, fail };
}

// Zero web tabs: tabs.query is []. One web tab: exactly that tab, with its real id; the Theia frame absent.
async function scenarioQuery({ app, theia }) {
  const zero = await command('query', { info: {} });
  // Absence first, at zero tabs too: a Theia tab in the list is named as such.
  if (zero.some(t => String(t.url).startsWith(theia.origin)) || theia.extensionId !== -1) {
    return verdict(false, null, `Theia frame visible to extensions: tabs.query at zero web tabs listed ${JSON.stringify(zero)}; frame id ${theia.extensionId}`);
  }
  const zeroActive = await command('query', { info: { active: true, currentWindow: true } });
  if (!Array.isArray(zero) || zero.length !== 0 || !Array.isArray(zeroActive) || zeroActive.length !== 0) {
    return verdict(false, null, `zero web tabs: tabs.query returned ${JSON.stringify(zero)} and ${JSON.stringify(zeroActive)}, not []`);
  }
  const { extId } = await openAndCommit(app, '/a');
  const all = await command('query', { info: {} });
  // Absence first, so a Theia tab in the list is named as such, then exactly one web tab.
  const theiaVisible = all.some(t => String(t.url).startsWith(theia.origin));
  if (theiaVisible || theia.extensionId !== -1) {
    return verdict(false, null, `Theia frame visible to extensions: tabs.query listed ${theia.origin} or the frame has id ${theia.extensionId}`);
  }
  const onlyA = all.length === 1 && all[0].url.endsWith('/a') && all[0].id > 0 && all[0].id === extId;
  if (!onlyA) {
    return verdict(false, null, `one web tab: tabs.query returned ${JSON.stringify(all)}, expected one tab ending /a with id ${extId}`);
  }
  // Positive controls in the same session: WebDriver still reaches the Theia frame.
  const origin = await app.evaluate('location.origin');
  const controls = { webDriverOrigin: origin, webDriverFirst: theia.webDriverFirst, overlayId: extId };
  if (origin !== theia.origin || theia.webDriverFirst !== 'powerbrowser-content' || extId <= 0) {
    return verdict(false, null, `positive controls failed: ${JSON.stringify(controls)}`);
  }
  return verdict(true, `zero tabs -> []; one tab /a with id ${extId}; Theia origin ${theia.origin} absent (frame id -1); WebDriver still reaches it (${origin}, webDriverTabs[0] powerbrowser-content)`, null);
}

// The content script in a web tab reports sender.tab with its real id, frameId 0 and the favicon.
async function scenarioSender({ app, theia, plant }) {
  if (plant && plant.record) session.logs.push(plant.record(theia));
  await reloadTheiaFrame(app, theia);
  const { webTabId, extId } = await openTab(app, '/b');
  const report = await tryWait(r => r.kind === 'sender' && String(r.href).endsWith('/b'), 30000);
  if (!report) {
    return verdict(false, null, `sender.tab missing: no content-script report for /b reached the extension (overlay tab id ${extId})`);
  }
  if (typeof report.tabId !== 'number' || report.tabId <= 0 || report.tabId !== extId) {
    return verdict(false, null, `sender.tab missing: the content script in /b reported tabId ${report.tabId}, expected ${extId}`);
  }
  if (!String(report.url).endsWith('/b') || report.frameId !== 0) {
    return verdict(false, null, `sender.tab missing: sender.tab.url ${report.url}, frameId ${report.frameId}`);
  }
  // WR-01: the frame reloaded after install, so a content script that reached it has reported by now.
  await sleep(2000);
  const theiaReports = session.logs.filter(r => r.kind === 'sender' && String(r.href).startsWith(theia.origin)).length;
  if (theiaReports !== 0) {
    return verdict(false, null, `Theia frame visible to extensions: ${theiaReports} content-script report(s) named the Theia origin ${theia.origin} after the frame reloaded`);
  }
  // Favicon: LinkHandlerParent -> gBrowser.setIcon -> gBrowser.getIcon -> tabs.get(...).favIconUrl.
  // Firefox hands the icon back re-encoded as a data: URL, so the served /icon.png shows as a PNG data URL.
  const end = Date.now() + 30000;
  let tab;
  for (;;) {
    tab = await command('get', { tabId: extId });
    if (tab.favIconUrl && String(tab.favIconUrl).startsWith('data:image/png;base64,')) break;
    if (Date.now() > end) return verdict(false, null, `favicon never reached tabs.get: favIconUrl ${tab.favIconUrl}`);
    await sleep(300);
  }
  // Positive control and absence: every sender report comes from this origin; the Theia origin has none.
  const reports = session.logs.filter(r => r.kind === 'sender');
  const fromServed = reports.filter(r => String(r.href).startsWith(ORIGIN)).length;
  const fromOther = reports.filter(r => !String(r.href).startsWith(ORIGIN)).length;
  if (fromServed === 0 || fromOther !== 0) {
    return verdict(false, null, `sender reports: ${fromServed} from the served origin, ${fromOther} from elsewhere`);
  }
  // Positive control, same session: reloading the overlay produces its own request and sender records.
  const mark = session.logs.length;
  await chromeJson(app, `const o = [...document.querySelectorAll('browser')].find(x => ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs.tabIdOfBrowser(x) === ${JSON.stringify(webTabId)});
    o.reload();
    return { landed: true };`);
  const reloadedRequest = await tryWait(r => session.logs.indexOf(r) >= mark && r.kind === 'request' && r.tabId === extId && String(r.url).endsWith('/b'), 20000);
  const reloadedSender = await tryWait(r => session.logs.indexOf(r) >= mark && r.kind === 'sender' && String(r.href).endsWith('/b'), 20000);
  if (!reloadedRequest || !reloadedSender) {
    return verdict(false, null, `positive control: reloading the /b overlay (tab id ${extId}) produced ${reloadedRequest ? 'its request' : 'no request'} and ${reloadedSender ? 'its sender report' : 'no sender report'}`);
  }
  return verdict(true, `content script in /b sent sender.tab id ${report.tabId} (url ends /b, frameId 0); favIconUrl reached tabs.get; ${fromServed} report(s) from the served origin, none from elsewhere`, null);
}

// webRequest and webNavigation carry the overlay's id; a main-frame request has frameId 0.
async function scenarioWebrequest({ app }) {
  const { extId } = await openTab(app, '/c');
  const request = await tryWait(r => r.kind === 'request' && String(r.url).endsWith('/c'), 30000);
  const committed = await tryWait(r => r.kind === 'committed' && String(r.url).endsWith('/c'), 30000);
  if (!request || !committed) {
    return verdict(false, null, `network event carried tabId -1: no ${!request ? 'webRequest' : 'webNavigation'} event for /c reached the extension (overlay tab id ${extId})`);
  }
  if (request.tabId === -1 || committed.tabId === -1) {
    return verdict(false, null, `network event carried tabId -1: webRequest ${request.tabId}, webNavigation ${committed.tabId}`);
  }
  if (request.tabId !== extId || committed.tabId !== extId || committed.frameId !== 0) {
    return verdict(false, null, `network event carried tabId ${request.tabId}/${committed.tabId}, expected ${extId}`);
  }
  return verdict(true, `webRequest.onBeforeRequest and webNavigation.onCommitted for /c both carry tabId ${extId}; committed frameId 0`, null);
}

const shellWindow = async () => command('windows', { method: 'getCurrent' });

// Events: created x2, activated (A, previousTabId B), updated for B (url /c, loading then complete, title), removed A (not window closing).
async function scenarioEvents({ app }) {
  const A = await openAndCommit(app, '/a');
  const B = await openAndCommit(app, '/b');
  await makeCurrent(app, B.webTabId);
  await makeCurrent(app, A.webTabId);
  const win = await shellWindow();
  // Navigate B to /c through the overlay's own load path (the same call webTabNavigate makes).
  await chromeJson(app, `const o = [...document.querySelectorAll('browser')].find(x => ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs.tabIdOfBrowser(x) === ${JSON.stringify(B.webTabId)});
    o.fixupAndLoadURIString(${JSON.stringify(url('/c'))}, { triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}) });
    return { landed: true };`);
  const navigated = await tryWait(r => r.kind === 'updated' && r.tabId === B.extId && r.change && r.change.status === 'complete' && String(r.url).endsWith('/c'), 30000);
  await chromeJson(app, `const API = ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserAPI;
    API.webTabClose(${JSON.stringify(A.webTabId)});
    return { landed: true };`);
  const removed = await tryWait(r => r.kind === 'removed' && r.tabId === A.extId, 15000);
  const created = [A.extId, B.extId].every(id => session.logs.some(r => r.kind === 'created' && r.tab && r.tab.id === id));
  const activated = session.logs.find(r => r.kind === 'activated' && r.tabId === A.extId && r.previousTabId === B.extId);
  if (!activated) {
    return verdict(false, null, `onActivated did not fire for tab A with previousTabId B: activated records ${JSON.stringify(session.logs.filter(r => r.kind === 'activated'))}`);
  }
  const loading = session.logs.some(r => r.kind === 'updated' && r.tabId === B.extId && r.change && r.change.status === 'loading');
  const titled = session.logs.some(r => r.kind === 'updated' && r.tabId === B.extId && r.change && r.change.title === 'page /c');
  if (!navigated || !loading || !titled) {
    return verdict(false, null, `onUpdated for B: navigated ${Boolean(navigated)}, loading ${loading}, title 'page /c' ${titled}`);
  }
  if (!removed || removed.isWindowClosing !== false || !created) {
    return verdict(false, null, `onRemoved for A ${JSON.stringify(removed)} or onCreated for both tabs missing (created ${created})`);
  }
  const windowIds = session.logs.filter(r => ['created', 'activated', 'updated', 'removed'].includes(r.kind)).map(r => (r.tab ? r.tab.windowId : r.windowId));
  if (windowIds.some(id => id !== win.id)) {
    return verdict(false, null, `event windowId ${JSON.stringify(windowIds)} differs from the shell ${win.id}`);
  }
  return verdict(true, `onCreated for A ${A.extId} and B ${B.extId}; onActivated A with previousTabId ${B.extId}; onUpdated B to /c with loading then complete and title; onRemoved A with isWindowClosing false; every windowId is the shell ${win.id}`, null);
}

// Active tab follows Theia's selection; windows.getAll/getCurrent/getLastFocused report the shell.
async function scenarioActiveTab({ app }) {
  const A = await openAndCommit(app, '/a');
  const B = await openAndCommit(app, '/b');
  const active = async () => command('query', { info: { active: true, currentWindow: true } });
  await makeCurrent(app, A.webTabId);
  const onA = await active();
  await makeCurrent(app, B.webTabId);
  const onB = await active();
  if (onA.length !== 1 || onA[0].id !== A.extId || onB.length !== 1 || onB[0].id !== B.extId) {
    return verdict(false, null, `active tab did not follow the selected web tab: A current gave ${JSON.stringify(onA)}, B current gave ${JSON.stringify(onB)}`);
  }
  const all = await command('windows', { method: 'getAll' });
  const current = await command('windows', { method: 'getCurrent' });
  const last = await command('windows', { method: 'getLastFocused' });
  if (!all.some(w => w.id === current.id) || last.id !== current.id) {
    return verdict(false, null, `windows.getAll ${JSON.stringify(all)}, getCurrent ${current.id}, getLastFocused ${last.id}`);
  }
  return verdict(true, `active tab is A (${A.extId}) while A is selected and B (${B.extId}) when B is selected; windows.getAll lists the shell ${current.id}, getCurrent and getLastFocused return it`, null);
}

// The IDE has focus: the last web tab stays the active tab, and chrome's selectedTab is that node.
async function scenarioIdeRetain({ app }) {
  const A = await openAndCommit(app, '/a');
  const B = await openAndCommit(app, '/b');
  await makeCurrent(app, B.webTabId);
  await probe(app, `await get('CommandRegistry').executeCommand('preferences:open'); await sleep(800); return true;`);
  await focusTheiaFrame(app);
  const onB = await command('query', { info: { active: true, currentWindow: true } });
  const chromeSelected = await chromeJson(app, `const o = [...document.querySelectorAll('browser')].find(x => ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs.tabIdOfBrowser(x) === ${JSON.stringify(B.webTabId)});
    const node = window.gBrowser.selectedTab;
    return { isNull: node === null, isB: Boolean(node) && node.linkedBrowser === o };`);
  if (onB.length !== 1 || onB[0].id !== B.extId || chromeSelected.isNull) {
    return verdict(false, null, `active tab cleared while the IDE has focus: active query ${JSON.stringify(onB)}, selectedTab null ${chromeSelected.isNull}`);
  }
  return verdict(true, `with the preferences editor current, the active tab is still B (${B.extId}) and chrome's selectedTab is B's node (${chromeSelected.isB})`, null);
}

// Page focus selects its overlay even when the other overlay is Theia's current (D-13, split view).
// The split leaves B current (Lumino makes an added widget current). Page focus goes to A. The
// assertion is that A is the active tab. Measured: Lumino moves Theia's current to A with the DOM
// focus, so this layout does not isolate page focus from Theia's current; the detail records both.
async function scenarioFocusFollow({ app }) {
  const A = await openAndCommit(app, '/a');
  const B = await openAndCommit(app, '/b');
  await makeCurrent(app, B.webTabId);
  await probe(app, `const shell = get('ApplicationShell');
    const wa = get('WebTabChannel').widgetOf(${JSON.stringify(A.webTabId)});
    const wb = get('WebTabChannel').widgetOf(${JSON.stringify(B.webTabId)});
    shell.addWidget(wb, { area: 'main', mode: 'split-right', ref: wa });
    await sleep(600);
    return true;`);
  const theiaOwner = () => probe(app, `const shell = get('ApplicationShell'); return shell.mainPanel.currentTitle?.owner?.id ?? null;`);
  const currentBefore = await theiaOwner();
  const focused = await focusOverlay(app, A.webTabId);
  await sleep(800);
  const active = await command('query', { info: { active: true, currentWindow: true } });
  const currentAfter = await theiaOwner();
  if (!focused || active.length !== 1 || active[0].id !== A.extId) {
    return verdict(false, null, `active tab did not follow page focus: focus ${focused}, active ${JSON.stringify(active)}, expected A ${A.extId} (Theia current before ${currentBefore}, after ${currentAfter})`);
  }
  return verdict(true, `page focus on A (${A.extId}), split beside B, makes A the active tab; Theia's current before ${currentBefore}, after ${currentAfter}`, null);
}

// The shell is a normal window: windows.getAll types it normal, and the normal filter includes it.
async function scenarioWindowType({ app }) {
  await openAndCommit(app, '/a');
  const current = await command('windows', { method: 'getCurrent' });
  const all = await command('windows', { method: 'getAll' });
  const normal = await command('windows', { method: 'getAll', info: { windowTypes: ['normal'] } });
  const shell = all.find(w => w.id === current.id);
  const toolbar = await chromeJson(app, `return { visible: window.toolbar.visible === true };`);
  if (!shell || shell.type !== 'normal' || !normal.some(w => w.id === current.id) || !toolbar.visible) {
    return verdict(false, null, `shell window reported as popup: type ${shell ? shell.type : 'missing'}, normal filter ${JSON.stringify(normal.map(w => w.id))}, toolbar visible ${toolbar.visible}`);
  }
  return verdict(true, `windows.getAll reports the shell ${current.id} as type normal; windowTypes ['normal'] includes it; window.toolbar.visible is true`, null);
}

// executeScript and sendMessage by id reach the page of that id, not the selected one.
async function scenarioExecute({ app, plant }) {
  const A = await openAndCommit(app, '/a');
  const B = await openAndCommit(app, '/b');
  await makeCurrent(app, B.webTabId);
  if (plant && plant.late) {
    const applied = await chromeJson(app, plant.late(A.webTabId, B.webTabId));
    if (!applied.landed) {
      throw new Error('BROKEN INSTRUMENT: plant swapped-browser did not land');
    }
  }
  const ran = await command('exec', { tabId: A.extId, code: 'location.pathname' });
  if (!Array.isArray(ran) || ran[0] !== '/a') {
    return verdict(false, null, `executeScript on tab A ran in ${Array.isArray(ran) ? ran[0] : JSON.stringify(ran)}, expected /a`);
  }
  const replied = await command('send', { tabId: A.extId, message: 'ping' });
  if (replied !== '/a') {
    return verdict(false, null, `sendMessage(A, ping) answered from ${replied}, expected /a`);
  }
  return verdict(true, `executeScript(A) returned ["/a"] with B current; sendMessage(A, 'ping') answered from /a`, null);
}

// ---- Task 3 plants (merged into PLANTS) ----
const PLANT_NO_TABSELECT = `
  window.addEventListener('TabSelect', event => event.stopImmediatePropagation(), true);
  return { landed: true };`;
const PLANT_STALE_ACTIVE = `
  const before = Object.getOwnPropertyDescriptor(window.gBrowser, 'selectedTab').get;
  Object.defineProperty(window.gBrowser, 'selectedTab', { configurable: true, get() { return window.gBrowser.tabs[0] ?? null; } });
  return { landed: Object.getOwnPropertyDescriptor(window.gBrowser, 'selectedTab').get !== before };`;
const PLANT_CLEAR_ON_IDE = `
  const before = Object.getOwnPropertyDescriptor(window.gBrowser, 'selectedTab').get;
  Object.defineProperty(window.gBrowser, 'selectedTab', { configurable: true, get() { return null; } });
  return { landed: Object.getOwnPropertyDescriptor(window.gBrowser, 'selectedTab').get !== before };`;
const PLANT_FOCUS_IGNORED = `
  const before = Object.getOwnPropertyDescriptor(window.gBrowser, 'selectedTab').get;
  Object.defineProperty(window.gBrowser, 'selectedTab', { configurable: true, get() { return window.gBrowser.tabs[1] ?? null; } });
  return { landed: Object.getOwnPropertyDescriptor(window.gBrowser, 'selectedTab').get !== before };`;
const PLANT_POPUP_TYPE = `
  const aw = window.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow);
  aw.chromeFlags &= ~Ci.nsIWebBrowserChrome.CHROME_TOOLBAR;
  return { landed: (aw.chromeFlags & Ci.nsIWebBrowserChrome.CHROME_TOOLBAR) === 0 };`;
const PLANT_SWAPPED_BROWSER = (aId, bId) => `
  const find = id => [...document.querySelectorAll('browser')].find(x => ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs.tabIdOfBrowser(x) === id);
  const nodeA = window.gBrowser.getTabForBrowser(find(${JSON.stringify(aId)}));
  nodeA.linkedBrowser = find(${JSON.stringify(bId)});
  return { landed: nodeA.linkedBrowser === find(${JSON.stringify(bId)}) };`;

// ---------------------------------------------------------------------------
// Phase 31.1 plan 04. The chrome-error recorder, the adversarial starts, the toolbar target, GUI-01
// with the shell admitted, the extension-path scheme wall and the session-wide Theia absence.
// ---------------------------------------------------------------------------

// The recorder is installed in every session before the first install. Its positive control is a planted
// nsIScriptError from a matching source; it must be captured before any absence counts, and it is removed
// from the record afterwards. A recorder that cannot see its own control is a broken instrument.
const RECORDER_CONTROL = 'pb-recorder-control';

async function installErrorRecorder(app) {
  const r = JSON.parse(await app.evaluateIn(app.chrome, `(async () => {
    const CONTROL = ${JSON.stringify(RECORDER_CONTROL)};
    if (!window.__pbErrs) {
      window.__pbErrs = [];
      window.__pbSeen = 0;
      window.__pbErrListener = { observe(m) {
        window.__pbSeen++;
        try {
          m.QueryInterface(Ci.nsIScriptError);
          if (/ext-|Extension|PageActions|CustomizableUI|SessionStore|Sidebar/i.test(m.sourceName + ' ' + m.errorMessage)) {
            window.__pbErrs.push({ msg: m.errorMessage, src: m.sourceName, line: m.lineNumber });
          }
        } catch (e) {}
      } };
      Services.console.registerListener(window.__pbErrListener);
    }
    const ctl = Cc['@mozilla.org/scripterror;1'].createInstance(Ci.nsIScriptError);
    ctl.init(CONTROL, 'resource://gre/modules/ext-recorder-control.js', 1, 0, Ci.nsIScriptError.errorFlag, 'pb-recorder', false, false);
    Services.console.logMessage(ctl);
    for (let i = 0; i < 20 && !window.__pbErrs.some(e => e.msg === CONTROL); i++) await new Promise(res => setTimeout(res, 100));
    const captured = window.__pbErrs.some(e => e.msg === CONTROL);
    window.__pbErrs = window.__pbErrs.filter(e => e.msg !== CONTROL);
    return JSON.stringify({ captured, seen: window.__pbSeen });
  })()`));
  if (!r.captured) {
    throw new Error(`BROKEN INSTRUMENT: the chrome-error recorder did not capture its planted nsIScriptError control (listener saw ${r.seen} console message(s))`);
  }
}

const recordedErrors = async app => JSON.parse(await app.evaluateIn(app.chrome, 'JSON.stringify(window.__pbErrs || [])'));
const describeErrors = errs => errs.map(e => `${e.msg} @ ${String(e.src).split('/').pop()}:${e.line}`).join('; ');
const startFailure = reason => `page_action extension failed to start: ${reason}`;
const startedCount = () => session.logs.filter(r => r.kind === 'started').length;

async function waitStarted(atLeast, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (startedCount() < atLeast) {
    if (Date.now() > end) return false;
    await sleep(150);
  }
  return true;
}

// Reloads the probe in chrome scope. Resolves { ok } or { error }.
async function reloadProbe(app) {
  return JSON.parse(await app.evaluateIn(app.chrome, `(async () => {
    try {
      const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      const addon = await AddonManager.getAddonByID(${JSON.stringify(EXT_ID)});
      await addon.reload();
      return JSON.stringify({ ok: true });
    } catch (e) { return JSON.stringify({ error: String(e) }); }
  })()`));
}

// Any framework error the recorder holds, as a start failure; null when none.
async function startErrorVerdict(app) {
  const errs = await recordedErrors(app);
  return errs.length ? startFailure(`the extension framework recorded ${errs.length} error(s): ${describeErrors(errs)}`) : null;
}

const PLANT_BAD_SELECTED_TAB = `
  const before = Object.getOwnPropertyDescriptor(window.gBrowser, 'selectedTab').get;
  Object.defineProperty(window.gBrowser, 'selectedTab', { configurable: true, get() { return {}; } });
  return { landed: Object.getOwnPropertyDescriptor(window.gBrowser, 'selectedTab').get !== before };`;

// Zero web tabs, the IDE current, then the first tab after zero: a reload starts the extension each time.
async function scenarioAdversarialStarts({ app, plant }) {
  if (!(await waitStarted(1))) return verdict(false, null, startFailure('no started report after the install'));
  if (plant) {
    const A = await openAndCommit(app, '/a');
    const applied = await chromeJson(app, plant.late());
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant bad-selected-tab did not land');
    const n = startedCount();
    const r = await reloadProbe(app);
    if (r.error) return verdict(false, null, startFailure(`reload with web tab ${A.extId} open rejected: ${r.error}`));
    if (!(await waitStarted(n + 1))) return verdict(false, null, startFailure(`no started report after a reload with web tab ${A.extId} open`));
    const e = await startErrorVerdict(app);
    return e ? verdict(false, null, e) : verdict(true, 'the planted selectedTab did not fail the start', null);
  }
  // (a) zero web tabs: reload and require a second started, with no framework error.
  let n = startedCount();
  let r = await reloadProbe(app);
  if (r.error) return verdict(false, null, startFailure(`reload at zero web tabs rejected: ${r.error}`));
  if (!(await waitStarted(n + 1))) return verdict(false, null, startFailure('no started report after a reload at zero web tabs'));
  const errA = await startErrorVerdict(app);
  if (errA) return verdict(false, null, errA);
  // (b) the IDE current with /a open: reload, then the active tab and chrome's selectedTab are still /a.
  const A = await openAndCommit(app, '/a');
  await probe(app, `await get('CommandRegistry').executeCommand('preferences:open'); await sleep(800); return true;`);
  await focusTheiaFrame(app);
  n = startedCount();
  r = await reloadProbe(app);
  if (r.error) return verdict(false, null, startFailure(`reload with the IDE current rejected: ${r.error}`));
  if (!(await waitStarted(n + 1))) return verdict(false, null, startFailure('no started report after a reload with the IDE current'));
  const errB = await startErrorVerdict(app);
  if (errB) return verdict(false, null, errB);
  await focusTheiaFrame(app);
  const activeOnA = await command('query', { info: { active: true, currentWindow: true } });
  const selected = await chromeJson(app, `const o = [...document.querySelectorAll('browser')].find(x => ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs.tabIdOfBrowser(x) === ${JSON.stringify(A.webTabId)});
    const node = window.gBrowser.selectedTab;
    return { isNull: node === null, isA: Boolean(node) && node.linkedBrowser === o };`);
  if (activeOnA.length !== 1 || activeOnA[0].id !== A.extId || selected.isNull || !selected.isA) {
    return verdict(false, null, `active tab moved off /a while the IDE was current: query ${JSON.stringify(activeOnA)}, selectedTab null ${selected.isNull}, selectedTab is /a ${selected.isA}`);
  }
  // (c) close /a (zero web tabs), then open /b: onCreated for /b and pageAction.isShown true for /b.
  await chromeJson(app, `const API = ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserAPI;
    API.webTabClose(${JSON.stringify(A.webTabId)});
    return { landed: true };`);
  if (!(await tryWait(x => x.kind === 'removed' && x.tabId === A.extId, 15000))) {
    return verdict(false, null, `onRemoved for /a never arrived after its close (tab ${A.extId})`);
  }
  const zero = await command('query', { info: {} });
  if (zero.length !== 0) return verdict(false, null, `zero web tabs after the close: tabs.query returned ${JSON.stringify(zero)}`);
  const B = await openAndCommit(app, '/b');
  const createdB = session.logs.some(x => x.kind === 'created' && x.tab && x.tab.id === B.extId);
  let shown = false;
  const endShown = Date.now() + 8000;
  while (!shown && Date.now() < endShown) {
    shown = (await command('pageShown', { tabId: B.extId })) === true;
    if (!shown) await sleep(300);
  }
  if (!createdB || !shown) {
    return verdict(false, null, `first tab after zero: onCreated for /b ${createdB}, pageAction.isShown for /b ${shown}`);
  }
  const errC = await startErrorVerdict(app);
  if (errC) return verdict(false, null, errC);
  return verdict(true, `zero web tabs: reload started it; IDE current: reload started it, active tab stayed /a (${A.extId}) and selectedTab is /a's node; after the close of /a, zero tabs; first tab /b (${B.extId}): onCreated and pageAction.isShown true. Recorder positive control captured before the install; no extension-framework error recorded`, null);
}

// Toolbar action target: the shell acts on the page on screen, for a page_action-owning probe and an activeTab-only action.
const PLANT_SELECTED_TO_FIRST = `
  const before = Object.getOwnPropertyDescriptor(window.gBrowser, 'selectedTab').get;
  Object.defineProperty(window.gBrowser, 'selectedTab', { configurable: true, get() { return window.gBrowser.tabs[0] ?? null; } });
  return { landed: Object.getOwnPropertyDescriptor(window.gBrowser, 'selectedTab').get !== before };`;

const pathOf = u => {
  try {
    return new URL(String(u)).pathname;
  } catch {
    return String(u);
  }
};

async function stockContext(app) {
  return (await app.contexts('chrome')).find(entry => entry.url.startsWith('chrome://browser/content/browser.xhtml'));
}

// Triggers the action through the parent entry point in a chrome context; resolves to the next matching record.
async function triggerAndWait(app, context, extId, kind) {
  const from = session.logs.length;
  const result = await app.evaluateIn(context, `(() => {
    try {
      const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
      const g = ExtensionParent.apiManager.global;
      g.browserActionFor(WebExtensionPolicy.getByID(${JSON.stringify(extId)}).extension).triggerAction(window);
      return 'returned';
    } catch (e) { return 'threw: ' + e; }
  })()`);
  if (result !== 'returned') return { result, record: undefined };
  return { result, record: await waitSince(from, r => r.kind === kind) };
}

async function scenarioToolbarTarget({ app }) {
  await installFixture(app, ACTIVE);
  const A = await openAndCommit(app, '/a');
  const C = await openAndCommit(app, '/c');
  if (!(await makeCurrent(app, C.webTabId))) {
    return verdict(false, null, `the page on screen did not become /c (tab ${C.extId})`);
  }
  const probeShell = await triggerAndWait(app, app.chrome, EXT_ID, 'clicked');
  if (!probeShell.record) return verdict(false, null, `toolbar action on the shell reached no onClicked (${probeShell.result})`);
  if (probeShell.record.tabId !== C.extId || pathOf(probeShell.record.url) !== '/c') {
    return verdict(false, null, `toolbar action acted on ${pathOf(probeShell.record.url)}, not the page on screen /c (tab ${probeShell.record.tabId}, expected ${C.extId}; /a is ${A.extId})`);
  }
  const atShell = await triggerAndWait(app, app.chrome, AT_ID, 'at-clicked');
  if (!atShell.record || atShell.record.tabId !== C.extId || atShell.record.path !== '/c') {
    return verdict(false, null, `activeTab action on the shell acted on ${atShell.record ? atShell.record.path : 'nothing'}, not the page on screen /c`);
  }
  // A GUI-01 stock window on /s takes the action on its own tab; the shell still acts on its page.
  await probe(app, `await get('CommandRegistry').executeCommand('powerbrowser.open-browser-window', ${JSON.stringify(url('/s'))}); return true;`);
  await stockTabOn(app, url('/s'), 30000);
  const stock = await stockContext(app);
  if (!stock) throw new Error('BROKEN INSTRUMENT: no stock browser window context after the GUI-01 open');
  const probeStock = await triggerAndWait(app, stock.context, EXT_ID, 'clicked');
  const atStock = await triggerAndWait(app, stock.context, AT_ID, 'at-clicked');
  if (!probeStock.record || pathOf(probeStock.record.url) !== '/s') {
    return verdict(false, null, `toolbar action in the stock window acted on ${probeStock.record ? pathOf(probeStock.record.url) : 'nothing'}, not /s`);
  }
  if (!atStock.record || atStock.record.path !== '/s') {
    return verdict(false, null, `activeTab action in the stock window acted on ${atStock.record ? atStock.record.path : 'nothing'}, not /s`);
  }
  await app.evaluateIn(app.chrome, 'window.focus(); true');
  if (!(await makeCurrent(app, C.webTabId))) return verdict(false, null, `after the shell focus, /c did not become current`);
  const again = await triggerAndWait(app, app.chrome, EXT_ID, 'clicked');
  if (!again.record || again.record.tabId !== C.extId) {
    return verdict(false, null, `after focusing the shell and making /c current, the toolbar action acted on ${again.record ? pathOf(again.record.url) : 'nothing'}, not /c`);
  }
  return verdict(true, `toolbar action on the shell acted on /c (${C.extId}), the page on screen; activeTab-only action acted on /c; with a stock window on /s, the stock action acted on /s and the shell still acted on /c (${again.record.tabId})`, null);
}

// GUI-01 with the shell admitted: badge, sessions, sidebarAction, menus and the commands keyset in the stock window.
const PLANT_STOCK_BADGE_MISSING = `
  const node = [...document.querySelectorAll('[data-extensionid]')].find(n => n.getAttribute('data-extensionid') === ${JSON.stringify(FURN_ID)});
  if (!node) return { landed: false };
  node.remove();
  return { landed: true };`;

async function stockBadgeWait(app, context) {
  const end = Date.now() + 8000;
  for (;;) {
    const b = JSON.parse(await app.evaluateIn(context, `JSON.stringify((() => {
      const n = [...document.querySelectorAll('[data-extensionid]')].find(x => x.getAttribute('data-extensionid') === ${JSON.stringify(FURN_ID)});
      return { node: Boolean(n), badge: n ? (n.getAttribute('badge') || (n.querySelector('.toolbarbutton-badge') || {}).textContent || '') : '' };
    })())`));
    if ((b.node && b.badge === 'X') || Date.now() > end) return b;
    await sleep(250);
  }
}

async function scenarioGui01({ app, plant }) {
  await probe(app, `await get('CommandRegistry').executeCommand('powerbrowser.open-browser-window', ${JSON.stringify(url('/s'))}); return true;`);
  await stockTabOn(app, url('/s'), 30000);
  const stock = await stockContext(app);
  if (!stock) throw new Error('BROKEN INSTRUMENT: no stock browser window context after the GUI-01 open');
  await installFixture(app, FURNITURE);
  if (!(await waitSince(0, r => r.kind === 'fu.started', 20000))) {
    return verdict(false, null, 'the furniture extension did not start with the stock window open');
  }
  if (plant) {
    const applied = await chromeJsonIn(app, stock.context, plant.late());
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant stock-badge-missing did not land');
  }
  const set = await fuCommand(app, 'setBadgeGlobal', { text: 'X' });
  if (!set.ok) return verdict(false, null, `browserAction.setBadgeText rejected: ${set.error}`);
  const badge = await stockBadgeWait(app, stock.context);
  if (!badge.node || badge.badge !== 'X') {
    return verdict(false, null, `stock window button has no badge 'X': node present ${badge.node}, badge '${badge.badge}'`);
  }
  const recent = await fuCommand(app, 'recentlyClosed');
  const menu = await fuCommand(app, 'menusCreate');
  const side = await fuCommand(app, 'sidebarIsOpen');
  const failed = [['sessions.getRecentlyClosed', recent], ['menus.create', menu], ['sidebarAction.isOpen', side]].find(([, r]) => !r.ok);
  if (failed) return verdict(false, null, `${failed[0]} rejected: ${failed[1].error}`);
  const keysetExpr = `const { ExtensionCommon } = ChromeUtils.importESModule('resource://gre/modules/ExtensionCommon.sys.mjs');
    const id = 'ext-keyset-id-' + ExtensionCommon.makeWidgetId(${JSON.stringify(FURN_ID)});
    return { id, present: document.getElementById(id) !== null };`;
  const keyset = await chromeJsonIn(app, stock.context, keysetExpr);
  // Informational only: the shell's keyset is not asserted here (Phase 38 owns the shell's command surface).
  const shellKeyset = await chromeJson(app, keysetExpr);
  if (!keyset.present) return verdict(false, null, `stock window has no keyset ${keyset.id} for the extension's commands`);
  const errs = await recordedErrors(app);
  if (errs.length) return verdict(false, null, `extension framework error recorded in the GUI-01 session: ${describeErrors(errs)}`);
  return verdict(true, `stock window badge 'X' shown; sessions.getRecentlyClosed resolved (${recent.result}); menus.create resolved (${menu.result}); sidebarAction.isOpen resolved (${side.result}); keyset ${keyset.id} present in the stock window (shell keyset present ${shellKeyset.present}, informational); no framework error`, null);
}

// The extension-path scheme wall: tabs.update to a moz-extension URL is refused; http(s) still loads.
const PLANT_WALL_UNKEYED = `
  const root = document.documentElement;
  const had = root.hasAttribute('extensiontabhost');
  root.removeAttribute('extensiontabhost');
  return { landed: had && !root.hasAttribute('extensiontabhost') };`;
const RESTORE_WALL_KEY = `document.documentElement.setAttribute('extensiontabhost', 'true'); return { restored: true };`;

async function scenarioSchemeWall({ app, plant }) {
  const A = await openAndCommit(app, '/a');
  if (plant && plant.late) {
    const applied = await chromeJson(app, plant.late());
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant wall-unkeyed did not land');
  }
  let refusal = null;
  try {
    await command(plant && plant.refusalOp ? plant.refusalOp : 'updateExtPage', { tabId: A.extId });
  } catch (e) {
    refusal = e.message;
  }
  if (plant && plant.late) await chromeJson(app, RESTORE_WALL_KEY);
  await sleep(1000);
  const seen = await command('get', { tabId: A.extId });
  const overlay = await chromeJson(app, `const o = [...document.querySelectorAll('browser')].find(x => ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs.tabIdOfBrowser(x) === ${JSON.stringify(A.webTabId)});
    return { spec: o ? o.currentURI.spec : null };`);
  // The T-31.1-20 guard replaces an extension-page load with about:blank, so the commit is read from webNavigation as well.
  const committedExt = session.logs.some(r => r.kind === 'committed' && r.tabId === A.extId && String(r.url).startsWith('moz-extension:'));
  if (committedExt || String(seen.url).startsWith('moz-extension:') || String(overlay.spec).startsWith('moz-extension:')) {
    return verdict(false, null, `web tab navigated to an extension page: tabs.get ${seen.url}, overlay ${overlay.spec}, committed to a moz-extension URL ${committedExt}`);
  }
  if (!String(seen.url).endsWith('/a') || !String(overlay.spec).endsWith('/a')) {
    return verdict(false, null, `web tab /a changed after the refused update: tabs.get ${seen.url}, overlay ${overlay.spec}`);
  }
  if (refusal === null) return verdict(false, null, 'tabs.update to a moz-extension URL was not refused');
  if (!refusal.includes('Illegal URL')) {
    return verdict(false, null, `the refusal was not the URL wall's Illegal URL rejection, so the wall is unproven: ${refusal}`);
  }
  // Positive control in the same session: an http update loads /d through the same onUpdated recorder.
  await command('update', { tabId: A.extId, props: { url: url('/d') } });
  const updated = await tryWait(r => r.kind === 'updated' && r.tabId === A.extId && String(r.url).endsWith('/d'), 20000);
  const after = await command('get', { tabId: A.extId });
  if (!updated || !String(after.url).endsWith('/d')) {
    return verdict(false, null, `positive control: tabs.update to http(s) did not load /d (onUpdated ${Boolean(updated)}, tabs.get ${after.url})`);
  }
  return verdict(true, `tabs.update to a moz-extension URL refused (${refusal}); the tab stayed /a in tabs.get and in chrome; tabs.update to http(s) loaded /d (onUpdated and tabs.get)`, null);
}

// Theia absence over a session of up to four web tabs. Every absence has the same-session controls below.
const tabIdsOf = r => {
  switch (r.kind) {
    case 'created':
      return r.tab ? [r.tab.id] : [];
    case 'updated':
    case 'removed':
    case 'activated':
    case 'request':
    case 'committed':
    case 'sender':
      return [r.tabId];
    default:
      return [];
  }
};

async function scenarioTheiaNever({ app, theia, plant }) {
  const origin0 = await app.evaluate('location.origin');
  if (origin0 !== theia.origin) {
    return verdict(false, null, `WebDriver origin at the start is ${origin0}, expected the Theia origin ${theia.origin}`);
  }
  await installTheiaWitness(app, theia);
  await reloadTheiaFrame(app, theia);
  // Positive control: chrome scope saw the reloaded frame open channels after the install, so the frame did make
  // requests the recorder could have seen. The recorder itself is proven live by each web tab's records below.
  const witnessed = await theiaWitnessCount(app);
  if (!witnessed) {
    return verdict(false, null, `positive control: after the Theia frame reloaded, chrome scope saw no http channel for the Theia origin ${theia.origin}, so the absence below cannot be trusted`);
  }
  const tabs = [];
  const absent = async where => {
    const info = await theiaInfo(app);
    if (info.extensionId !== -1) return `Theia frame visible to extensions: ${where}: getBrowserData(frame).tabId is ${info.extensionId}`;
    const listed = (await command('query', { info: {} })).filter(t => String(t.url).startsWith(theia.origin));
    if (listed.length) return `Theia frame visible to extensions: ${where}: tabs.query listed ${JSON.stringify(listed)}`;
    // Named records: none. Patch 060 hides the frame's own requests from network observers (UF-31.1-02), so no
    // record of any kind may name the Theia origin.
    const leaked = session.logs.find(r => JSON.stringify(r).includes(theia.origin));
    if (leaked) {
      return `Theia frame visible to extensions: ${where}: an extension record named the Theia origin ${theia.origin} (${leaked.kind}, tab id ${leaked.tabId})`;
    }
    const webIds = tabs.map(t => t.extId);
    for (const r of session.logs) {
      for (const id of tabIdsOf(r)) {
        if (r.kind === 'request' && id === -1) continue; // non-tab requests (the extension's own); none names the Theia origin (checked above)
        if (!webIds.includes(id)) return `a ${r.kind} record named tab id ${id}, which is no web tab of this session (${where})`;
      }
    }
    return null;
  };
  const step = async (where, opener) => {
    const tab = opener ? await opener() : null;
    if (tab) tabs.push(tab);
    return absent(where);
  };
  let v = await step('after tab A', () => openAndCommit(app, '/a'));
  if (v) return verdict(false, null, v);
  v = await step('after tab B', () => openAndCommit(app, '/b'));
  if (v) return verdict(false, null, v);
  await makeCurrent(app, tabs[0].webTabId);
  await makeCurrent(app, tabs[1].webTabId);
  v = await step('after activating A and B', null);
  if (v) return verdict(false, null, v);
  v = await step('after tab C', () => openAndCommit(app, '/c'));
  if (v) return verdict(false, null, v);
  if (plant) {
    const applied = await chromeJson(app, plant.late());
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant theia-in-tabs-late did not land');
    v = await absent('after the third web tab, with the planted node');
    return v ? verdict(false, null, v) : verdict(true, 'the planted Theia node was not seen', null);
  }
  v = await step('after tab D', () => openAndCommit(app, '/d'));
  if (v) return verdict(false, null, v);
  const [A, B, C] = tabs;
  await chromeJson(app, `const o = [...document.querySelectorAll('browser')].find(x => ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs.tabIdOfBrowser(x) === ${JSON.stringify(B.webTabId)});
    o.fixupAndLoadURIString(${JSON.stringify(url('/c'))}, { triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}) });
    return { landed: true };`);
  const navB = await tryWait(r => r.kind === 'committed' && r.tabId === B.extId && String(r.url).endsWith('/c'), 30000);
  if (!navB) return verdict(false, null, `navigation of tab B to /c was not reported by webNavigation.onCommitted for tab ${B.extId}`);
  v = await absent('after navigating B to /c');
  if (v) return verdict(false, null, v);
  await chromeJson(app, `const API = ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserAPI;
    API.webTabClose(${JSON.stringify(C.webTabId)});
    return { landed: true };`);
  if (!(await tryWait(r => r.kind === 'removed' && r.tabId === C.extId, 15000))) {
    return verdict(false, null, `onRemoved for closed tab C (${C.extId}) never arrived`);
  }
  v = await absent('after closing C');
  if (v) return verdict(false, null, v);
  // Positive controls, same session: WebDriver still reaches the frame at the end, and every tab was reported.
  const origin1 = await app.evaluate('location.origin');
  const first = await chromeJson(app, `return { frameFirst: window.gBrowser.webDriverTabs[0].linkedBrowser === document.getElementById('powerbrowser-content') };`);
  const reported = tabs.every(t => session.logs.some(r => r.kind === 'created' && r.tab && r.tab.id === t.extId));
  const committed = tabs.every(t => session.logs.some(r => r.kind === 'committed' && r.tabId === t.extId));
  if (origin1 !== theia.origin || !first.frameFirst || !reported || !committed) {
    return verdict(false, null, `positive controls failed: WebDriver origin ${origin1}, webDriverTabs[0] is the frame ${first.frameFirst}, every tab created ${reported}, every tab committed ${committed}`);
  }
  return verdict(true, `four web tabs (${tabs.map(t => t.extId).join(', ')}), activated, B navigated to /c, C closed: no tabs.query row, event, sender report, webRequest record or other record named the Theia origin after the reloaded frame opened ${witnessed} channel(s) seen in chrome scope, and every tab id was a web tab of this session; getBrowserData(frame).tabId stayed -1 at every step; WebDriver still reached the frame at both ends (${origin1}); every opened tab was reported`, null);
}

// tabs.update fields the shell cannot write are refused before the URL loads (WR-07), so a refused write applies
// nothing. A pinned write and a highlighted write are both refused; the selected tab still takes a URL and active: true
// together. active: true on an unselected tab is no longer refused: it selects the tab through the host (38-01, patch
// 050), and verify-extension-actions-live.mjs's tabs-bridge scenario proves that.
async function scenarioRefusedWrite({ app }) {
  const A = await openAndCommit(app, '/a');
  const B = await openAndCommit(app, '/b');
  await makeCurrent(app, B.webTabId);
  const refuse = async props => {
    try {
      await command('update', { tabId: A.extId, props });
      return null;
    } catch (e) {
      return e.message;
    }
  };
  const pinned = await refuse({ url: url('/d'), pinned: true });
  if (pinned === null) return verdict(false, null, 'tabs.update with pinned: true was not refused');
  const highlighted = await refuse({ url: url('/d'), highlighted: true });
  if (highlighted === null) return verdict(false, null, 'tabs.update with highlighted: true was not refused');
  await sleep(1500);
  const seen = await command('get', { tabId: A.extId });
  const navigated = session.logs.some(r => r.kind === 'committed' && r.tabId === A.extId && String(r.url).endsWith('/d'));
  if (navigated || !String(seen.url).endsWith('/a')) {
    return verdict(false, null, `a refused tabs.update still navigated tab A: tabs.get ${seen.url}, /d committed ${navigated}`);
  }
  // Positive control: the selected tab takes a URL and active: true in one update.
  await command('update', { tabId: B.extId, props: { url: url('/c'), active: true } });
  const loaded = await tryWait(r => r.kind === 'committed' && r.tabId === B.extId && String(r.url).endsWith('/c'), 30000);
  if (!loaded) return verdict(false, null, `positive control: tabs.update with url and active: true on the selected tab B (${B.extId}) did not load /c`);
  return verdict(true, `tabs.update with pinned: true (${pinned}) and with highlighted: true (${highlighted}) were refused before any navigation: tab A stayed /a; the selected tab B took url and active: true together and loaded /c`, null);
}

// T-31.1-20 (D-05, D-17): a webRequest listener that redirects a top-level overlay load to a web-accessible extension
// page never passes the tabs.update wall. The overlay must not end on that page: the shell stops the load and loads
// about:blank in its place.
async function scenarioExtensionRedirect({ app, plant }) {
  const A = await openAndCommit(app, '/a');
  if (plant && plant.late) {
    const applied = await chromeJson(app, plant.late(A));
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant redirect-guard-off did not land');
  }
  await command('update', { tabId: A.extId, props: { url: url('/redirect-me') } });
  await sleep(4000);
  const seen = await command('get', { tabId: A.extId });
  const overlay = await chromeJson(app, `const o = [...document.querySelectorAll('browser')].find(x => ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs.tabIdOfBrowser(x) === ${JSON.stringify(A.webTabId)});
    return { spec: o ? o.currentURI.spec : null };`);
  if (String(seen.url).startsWith('moz-extension:') || String(overlay.spec).startsWith('moz-extension:')) {
    return verdict(false, null, `web tab navigated to an extension page: tabs.get ${seen.url}, overlay ${overlay.spec}`);
  }
  if (overlay.spec !== 'about:blank') {
    return verdict(false, null, `the redirected load was not replaced with about:blank: tabs.get ${seen.url}, overlay ${overlay.spec}`);
  }
  // Positive control, same session: an http update still loads /d through the same recorder.
  await command('update', { tabId: A.extId, props: { url: url('/d') } });
  const updated = await tryWait(r => r.kind === 'updated' && r.tabId === A.extId && String(r.url).endsWith('/d'), 20000);
  if (!updated) return verdict(false, null, `positive control: tabs.update to http(s) after the redirect did not load /d (tab id ${A.extId})`);
  return verdict(true, `a blocking webRequest redirect of tabs.update to /redirect-me put an extension page in the overlay; the shell stopped it and the overlay ended on about:blank (tabs.get ${seen.url}); a later tabs.update to http(s) loaded /d`, null);
}

// WR-08 (tabbrowser.js:9650-9657): a top-level navigation clears the overlay's favicon until its own icon arrives, so
// tabs.get never reports the previous page's icon. /plain carries no icon link.
async function scenarioFaviconClear({ app, plant }) {
  const A = await openAndCommit(app, '/b');
  const iconOf = async () => (await command('get', { tabId: A.extId })).favIconUrl || null;
  const waitIcon = async () => {
    const end = Date.now() + 30000;
    for (;;) {
      const icon = await iconOf();
      if (icon && String(icon).startsWith('data:image/png;base64,')) return icon;
      if (Date.now() > end) return null;
      await sleep(300);
    }
  };
  if (!(await waitIcon())) return verdict(false, null, 'positive control: the favicon of /b never reached tabs.get');
  if (plant && plant.late) {
    const applied = await chromeJson(app, plant.late(A));
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant favicon-stale did not land');
  }
  await command('update', { tabId: A.extId, props: { url: url('/plain') } });
  if (!(await tryWait(r => r.kind === 'committed' && r.tabId === A.extId && String(r.url).endsWith('/plain'), 30000))) {
    return verdict(false, null, `the navigation of tab ${A.extId} to /plain was not reported by webNavigation.onCommitted`);
  }
  await sleep(2000);
  const stale = await iconOf();
  if (stale) return verdict(false, null, `favicon survived a top-level navigation: tabs.get reports ${String(stale).slice(0, 40)} on /plain, which has no icon`);
  // Positive control: the next page's own icon arrives after the clear.
  await command('update', { tabId: A.extId, props: { url: url('/c') } });
  if (!(await waitIcon())) return verdict(false, null, 'positive control: the favicon of /c did not arrive after the clear');
  return verdict(true, `the favicon of /b reached tabs.get; a top-level navigation to /plain (no icon link) cleared it; the favicon of /c arrived after the clear`, null);
}

// ---------------------------------------------------------------------------
// Phase 32 plan 09 (PAGE-05, PAGE-02): mute and zoom as an extension sees them.
// ---------------------------------------------------------------------------

// Theia's WebTabChannel request: the route the page-tools harness drives the arms through.
const channelRequest = (app, message) =>
  probe(app, `const channel = get('WebTabChannel'); return await channel.request(${JSON.stringify(message)});`);

// The chrome-scope view of one overlay, read from its own <browser>.
const overlayState = (app, tabId) =>
  chromeJson(
    app,
    `const W = ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs;
     const o = [...document.querySelectorAll('browser')].find(x => W.tabIdOfBrowser(x) === ${JSON.stringify(tabId)});
     if (!o) return { found: false };
     return { found: true, audioMuted: o.audioMuted === true, fullZoom: o.fullZoom };`
  );

// Audio playback is not asserted: soundPlaying is the open 32-01 defect, so the mute is judged on muted state only.
async function scenarioExtMute({ app, plant }) {
  const A = await openAndCommit(app, '/a');
  if (!(await tryWait(r => r.kind === 'updated' && r.tabId === A.extId && r.change && r.change.status === 'complete', 30000))) {
    return verdict(false, null, 'positive control: onUpdated did not report status complete for tab A');
  }
  if (plant && plant.late) {
    const applied = await chromeJson(app, plant.late(A));
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant mute-unsynced did not land');
  }
  await installPushRecorder(app);
  const from = (await pushes(app)).length;
  await command('update', { tabId: A.extId, props: { muted: true } });
  const overlay = await overlayState(app, A.webTabId);
  if (!overlay.found || !overlay.audioMuted) {
    return verdict(false, null, `tabs.update muted:true did not mute the overlay (${JSON.stringify(overlay)})`);
  }
  const extMuted = await command('get', { tabId: A.extId });
  const info = extMuted.mutedInfo || {};
  if (info.muted !== true || info.reason !== 'extension' || info.extensionId !== EXT_ID) {
    return verdict(false, null, `mutedInfo did not follow the overlay: the overlay is muted, tabs.get reports ${JSON.stringify(extMuted.mutedInfo)}`);
  }
  if (!(await tryWait(r => r.kind === 'updated' && r.tabId === A.extId && r.change && r.change.mutedInfo && r.change.mutedInfo.muted === true, 15000))) {
    return verdict(false, null, 'onUpdated mutedInfo did not fire for the extension mute of tab A');
  }
  if ((await waitForPush(app, p => p && p.kind === 'state' && p.tabId === A.webTabId && p.audioMuted === true, { from, timeoutMs: 10000 })) < 0) {
    return verdict(false, null, 'Theia state push carried no audioMuted true for tab A after the extension mute');
  }
  const reply = await channelRequest(app, { kind: 'webTabMute', tabId: A.webTabId, muted: false });
  if (reply?.audioMuted !== false) {
    return verdict(false, null, `the Theia unmute reply did not read audioMuted false (${JSON.stringify(reply)})`);
  }
  const after = await command('get', { tabId: A.extId });
  if (!after.mutedInfo || after.mutedInfo.muted !== false || after.mutedInfo.reason !== 'user') {
    return verdict(false, null, `the Theia unmute did not report mutedInfo {muted:false, reason:user} (tabs.get ${JSON.stringify(after.mutedInfo)})`);
  }
  if (!(await tryWait(r => r.kind === 'updated' && r.tabId === A.extId && r.change && r.change.mutedInfo && r.change.mutedInfo.muted === false, 15000))) {
    return verdict(false, null, 'onUpdated mutedInfo did not fire for the Theia unmute of tab A');
  }
  return verdict(true, `tabs.update muted:true muted the overlay; tabs.get mutedInfo was {muted:true, reason:extension, extensionId:${EXT_ID}}; onUpdated reported it; the Theia state push carried audioMuted true; the Theia unmute reported {muted:false, reason:user} and one more onUpdated`, null);
}

// PAGE-02: tabs.getZoom reports the overlay zoom that the webTabZoomIn arm moves, and the reset returns it to 1.
async function scenarioExtZoomGet({ app, plant }) {
  const A = await openAndCommit(app, '/a');
  if (plant && plant.late) {
    const applied = await chromeJson(app, plant.late(A));
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant zoom-shim-missing did not land');
  }
  const getZoom = () => command('getZoom', { tabId: A.extId });
  let initial;
  try {
    initial = await getZoom();
  } catch (error) {
    return verdict(false, null, `tabs.getZoom failed: ${error.message}`);
  }
  if (initial !== 1) {
    return verdict(false, null, `tabs.getZoom of a new tab is ${initial}, not 1`);
  }
  await channelRequest(app, { kind: 'webTabZoomIn', tabId: A.webTabId });
  const zoomed = await overlayState(app, A.webTabId);
  const reported = await getZoom();
  const rounded = Math.round(zoomed.fullZoom * 100) / 100;
  if (!zoomed.found || !(zoomed.fullZoom > 1) || reported !== rounded) {
    return verdict(false, null, `tabs.getZoom ${reported} does not report the overlay zoom ${zoomed.fullZoom} (rounded ${rounded})`);
  }
  await channelRequest(app, { kind: 'webTabZoomReset', tabId: A.webTabId });
  const back = await getZoom();
  if (back !== 1) {
    return verdict(false, null, `tabs.getZoom after the reset is ${back}, not 1`);
  }
  return verdict(true, `tabs.getZoom of a new tab is 1; after ZoomIn the overlay is at ${zoomed.fullZoom} and tabs.getZoom reports ${reported}; after the reset it is 1`, null);
}

// PAGE-02: tabs.onZoomChange fires once per web-tab zoom change with the shell's zoom settings. The probe registered
// the listener before any tab existed, so the registration loop walked the shell with zero web tabs.
async function scenarioExtZoomChange({ app }) {
  const A = await openAndCommit(app, '/a');
  const zoomsFor = (from, tabId) => session.logs.slice(from).filter(r => r.kind === 'zoom' && r.tabId === tabId);
  const up0 = session.logs.length;
  await channelRequest(app, { kind: 'webTabZoomIn', tabId: A.webTabId });
  await waitSince(up0, r => r.kind === 'zoom' && r.tabId === A.extId, 15000);
  await sleep(1000);
  const ins = zoomsFor(up0, A.extId);
  if (ins.length === 0) {
    return verdict(false, null, 'onZoomChange did not fire for tab A after ZoomIn');
  }
  if (ins.length !== 1) {
    return verdict(false, null, `onZoomChange fired ${ins.length} times for one zoom change of tab A`);
  }
  const overlay = await overlayState(app, A.webTabId);
  const [z] = ins;
  const settings = z.zoomSettings || {};
  if (z.oldZoomFactor !== 1 || !(z.newZoomFactor > 1) || z.newZoomFactor !== Math.round(overlay.fullZoom * 100) / 100) {
    return verdict(false, null, `onZoomChange factors ${z.oldZoomFactor} -> ${z.newZoomFactor} do not match the overlay zoom ${overlay.fullZoom}`);
  }
  if (settings.mode !== 'automatic' || settings.scope !== 'per-tab' || settings.defaultZoomFactor !== 1) {
    return verdict(false, null, `onZoomChange zoomSettings are ${JSON.stringify(settings)}, not automatic/per-tab/1`);
  }
  const down0 = session.logs.length;
  await channelRequest(app, { kind: 'webTabZoomReset', tabId: A.webTabId });
  await waitSince(down0, r => r.kind === 'zoom' && r.tabId === A.extId, 15000);
  await sleep(1000);
  const outs = zoomsFor(down0, A.extId);
  if (outs.length !== 1 || outs[0].newZoomFactor !== 1) {
    return verdict(false, null, `the reset fired ${outs.length} onZoomChange record(s), not one back to 1`);
  }
  const errs = await recordedErrors(app);
  if (errs.length) {
    return verdict(false, null, `the chrome-error recorder captured ${errs.length} error(s): ${describeErrors(errs)}`);
  }
  return verdict(true, `onZoomChange fired once for ZoomIn (${z.oldZoomFactor} -> ${z.newZoomFactor}, zoomSettings ${JSON.stringify(settings)}) and once for the reset back to 1; the chrome-error recorder captured nothing`, null);
}

// PAGE-02 (32-09 Pitfall 2): tabs.captureTab reads window.ZoomManager (ext-tabs.js:1034) through the shim and must resolve
// with an image of the tab. Not compared pixel for pixel with the overlay: that comparison is an end-of-milestone check.
async function scenarioExtCapture({ app }) {
  const A = await openAndCommit(app, '/a');
  let cap;
  try {
    cap = await command('capture', { tabId: A.extId });
  } catch (error) {
    return verdict(false, null, `tabs.captureTab failed: ${error.message}`);
  }
  if (!String(cap.prefix).startsWith('data:image/png;base64,') || !(cap.length > 1000)) {
    return verdict(false, null, `tabs.captureTab of tab A did not resolve with a PNG data URL (prefix ${cap.prefix}, length ${cap.length})`);
  }
  return verdict(true, `tabs.captureTab of tab A resolved with a PNG data URL of ${cap.length} characters; the ZoomManager read in captureTab no longer throws`, null);
}

// ---- 38-06: UF-31.1-02 (network wall) and UF-31.1-01 (windows refusal) ----

// Counts, in chrome scope, the http channels the Theia origin opens from now on. The witness is independent of the
// extension recorder, so an absence of extension records is not blind: the frame did make requests.
async function installTheiaWitness(app, theia) {
  await chromeJson(app, `if (!window.__pbTheiaWitness) {
      const w = { n: 0, observe(s) { try { if (s.QueryInterface(Ci.nsIHttpChannel).URI.prePath === ${JSON.stringify(theia.origin)}) w.n++; } catch {} } };
      Services.obs.addObserver(w, 'http-on-modify-request');
      window.__pbTheiaWitness = w;
    }
    window.__pbTheiaWitness.n = 0;
    return { landed: true };`);
}

async function theiaWitnessCount(app) {
  return (await chromeJson(app, `return { n: window.__pbTheiaWitness ? window.__pbTheiaWitness.n : 0 };`)).n;
}

// The Theia frame loses its marker, so patch 060 no longer hides its channels: network-wall must go red.
const PLANT_NETWORK_WALL_OFF = `
  const f = document.getElementById('powerbrowser-content');
  const had = f.hasAttribute('extensionnetworkhidden');
  f.removeAttribute('extensionnetworkhidden');
  return { landed: had && !f.hasAttribute('extensionnetworkhidden') };`;

// UF-31.1-02: a webRequest <all_urls> extension records nothing from the Theia frame while web-tab requests are still
// seen in the same session; browser.cookies neither lists, overwrites nor reports the token cookie.
async function scenarioNetworkWall({ app, theia, plant }) {
  await installTheiaWitness(app, theia);
  if (plant && plant.late) {
    const applied = await chromeJson(app, plant.late());
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant network-wall-off did not land');
  }
  await reloadTheiaFrame(app, theia);
  const witnessed = await theiaWitnessCount(app);
  if (!witnessed) {
    return verdict(false, null, `positive control: after the Theia frame reloaded, chrome scope saw no http channel for the Theia origin ${theia.origin}, so the absence below cannot be trusted`);
  }
  // Positive control, same session and same listeners: a web tab's request and headers are recorded with its tab id.
  const A = await openAndCommit(app, '/a');
  const req = await tryWait(r => r.kind === 'request' && String(r.url).endsWith('/a') && r.tabId === A.extId, 15000);
  const hdr = await tryWait(r => r.kind === 'headers' && String(r.url).endsWith('/a') && r.tabId === A.extId, 15000);
  if (!req || !hdr) {
    return verdict(false, null, `positive control: the web tab /a (${A.extId}) reached onBeforeRequest ${!!req} and onBeforeSendHeaders ${!!hdr}, so the recorder is blind`);
  }
  const theiaRecs = session.logs.filter(r => (r.kind === 'request' || r.kind === 'headers') && String(r.url).startsWith(theia.origin));
  const tokenSeen = session.logs.filter(r => r.kind === 'headers' && r.token).length;
  if (theiaRecs.length || tokenSeen) {
    return verdict(false, null, `Theia frame visible to network observers: ${theiaRecs.length} webRequest record(s) named the Theia origin ${theia.origin} after ${witnessed} Theia channel(s) in chrome scope, and ${tokenSeen} recorded Cookie header(s) carried the token`);
  }
  // browser.cookies: the probe's own loopback cookie is listed (positive control); the token is not, and cannot be set.
  await command('cookieSet', { details: { url: url('/'), name: 'pbprobe', value: '1' } });
  const names = await command('cookieNames', { domain: '127.0.0.1' });
  if (!names.includes('pbprobe')) return verdict(false, null, `positive control: cookies.getAll({ domain: '127.0.0.1' }) did not list the cookie the probe set (${JSON.stringify(names)})`);
  if (names.includes(TOKEN_COOKIE)) return verdict(false, null, 'token cookie visible to extensions: cookies.getAll listed the token cookie');
  let refused = null;
  try {
    await command('cookieSet', { details: { url: `${theia.origin}/`, name: TOKEN_COOKIE, value: 'planted' } });
  } catch (e) {
    refused = e.message;
  }
  // Booleans only: chrome scope compares the stored value and never returns it.
  const kept = await chromeJson(app, `const cs = Services.cookies.getCookiesFromHost('127.0.0.1', {}).filter(c => c.name === ${JSON.stringify(TOKEN_COOKIE)});
    return { present: cs.length > 0, planted: cs.some(c => c.value === 'planted') };`);
  if (refused === null || kept.planted || !kept.present) {
    return verdict(false, null, `token cookie writable by extensions: cookies.set refused ${refused !== null}, stored token present ${kept.present}, overwritten ${kept.planted}`);
  }
  await sleep(1000);
  const changed = session.logs.filter(r => r.kind === 'cookie-changed');
  if (changed.some(r => r.name === TOKEN_COOKIE)) return verdict(false, null, 'token cookie visible to extensions: cookies.onChanged reported the token cookie');
  if (!changed.some(r => r.name === 'pbprobe')) return verdict(false, null, 'positive control: cookies.onChanged did not report the cookie the probe set');
  return verdict(true, `the reloaded Theia frame opened ${witnessed} channel(s) seen in chrome scope and the probe recorded none of them, nor any Cookie header carrying the token; web tab /a (${A.extId}) reached onBeforeRequest and onBeforeSendHeaders in the same session; cookies.getAll listed pbprobe and not the token; cookies.set of the token was refused (${refused}) and the stored token was unchanged; cookies.onChanged reported pbprobe and not the token`, null);
}

// The extension framework no longer treats the shell as a tab host window, so a refusal, if any, is not patch 050's.
const PLANT_WINDOWS_GUARD_OFF = `
  ${IMPORT_EXT}
  const wt = ExtensionParent.apiManager.global.windowTracker;
  wt.isTabHostWindow = () => false;
  return { landed: wt.isTabHostWindow(window) === false };`;

// UF-31.1-01: windows.remove and the state-changing windows.update fields are refused on the shell with patch 050's
// own errors; the shell stays open, unresized and reachable; focus and the read-only calls still work.
async function scenarioWindowsRefusal({ app, plant }) {
  const A = await openAndCommit(app, '/a');
  const shell = await command('windows', { method: 'getCurrent' });
  const all = await command('windows', { method: 'getAll' });
  if (shell.type !== 'normal' || !all.some(w => w.id === shell.id)) {
    return verdict(false, null, `positive control: windows.getCurrent returned ${JSON.stringify(shell)}, windows.getAll ${JSON.stringify(all)}`);
  }
  const before = await chromeJson(app, `return { w: window.outerWidth, state: window.windowState };`);
  if (plant && plant.late) {
    const applied = await chromeJson(app, plant.late());
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant windows-guard-off did not land');
  }
  const call = async (method, ...args) => {
    try {
      await command('windowsCall', { method, args });
      return null;
    } catch (e) {
      return e.message;
    }
  };
  const minimize = await call('update', shell.id, { state: 'minimized' });
  const resize = await call('update', shell.id, { width: Math.max(400, before.w - 200) });
  const close = await call('remove', shell.id);
  await sleep(1500);
  const after = await chromeJson(app, `return { closed: window.closed, w: window.outerWidth, state: window.windowState };`);
  const origin = await app.evaluate('location.origin');
  if (after.closed || after.state === 2 || after.w !== before.w || !origin) {
    return verdict(false, null, `shell window changed by an extension: closed ${after.closed}, windowState ${before.state} -> ${after.state}, width ${before.w} -> ${after.w}, WebDriver origin ${origin}`);
  }
  if (minimize === null || resize === null || close === null) {
    return verdict(false, null, `windows call not refused on the shell: update state ${minimize}, update width ${resize}, remove ${close}`);
  }
  if (!/cannot be changed by an extension/.test(minimize) || !/cannot be changed by an extension/.test(resize) || !/cannot be closed by an extension/.test(close)) {
    return verdict(false, null, `not the tab host refusal: update state '${minimize}', update width '${resize}', remove '${close}'`);
  }
  // Positive controls: focus is allowed, the read-only calls still answer, and the tab model still works.
  const focus = await call('update', shell.id, { focused: true });
  const again = await command('windows', { method: 'getCurrent' });
  const tab = await command('get', { tabId: A.extId });
  if (focus !== null || again.id !== shell.id || !String(tab.url).endsWith('/a')) {
    return verdict(false, null, `positive control: update focused ${focus === null ? 'allowed' : `refused (${focus})`}, getCurrent ${again.id} (shell ${shell.id}), tabs.get ${tab.url}`);
  }
  return verdict(true, `on the shell window ${shell.id}: update state (${minimize}), update width (${resize}) and remove (${close}) were refused; the window stayed open at width ${after.w} and state ${after.state}; WebDriver still reached ${origin}; update focused, getCurrent and tabs.get still worked`, null);
}

// Counts, in chrome scope, the http channels for one exact URL from now on, and how many had no browsing context.
async function installUrlWitness(app, spec) {
  await chromeJson(app, `const w = { n: 0, browserless: 0, observe(s) { try { const c = s.QueryInterface(Ci.nsIHttpChannel);
        if (c.URI.spec !== ${JSON.stringify(spec)}) return;
        w.n++;
        if (!c.loadInfo.browsingContext) w.browserless++;
      } catch {} } };
    Services.obs.addObserver(w, 'http-on-modify-request');
    window.__pbUrlWitness = w;
    return { landed: true };`);
}

async function urlWitness(app) {
  return chromeJson(app, `const w = window.__pbUrlWitness; return { n: w ? w.n : 0, browserless: w ? w.browserless : 0 };`);
}

// The shell's hidden-origins list is emptied, so patch 060 no longer hides Theia-origin workers: worker-wall must go red.
const PLANT_WORKER_WALL_OFF = `
  Services.prefs.getDefaultBranch('').setStringPref('extensions.webRequest.hiddenOrigins', '');
  return { landed: Services.prefs.getStringPref('extensions.webRequest.hiddenOrigins', '') === '' };`;

// UF-31.1-02, worker branch: a service worker registered on the Theia origin has no browser element, so the frame's
// attribute cannot hide it; the shell's hidden-origins pref does. The scenario registers a worker on the sidecar origin
// from the Theia frame; Theia's own webview worker, on <uuid>.webview.localhost:<port> since 38-07, is webview-render's.
async function scenarioWorkerWall({ app, theia, plant }) {
  if (plant && plant.late) {
    const applied = await chromeJson(app, plant.late());
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant worker-wall-off did not land');
  }
  // Positive control, same session: a web page registers the same script, and its browserless load reaches the recorder.
  await openAndCommit(app, '/sw');
  const ctl = await tryWait(r => r.kind === 'request' && r.url === url(SW_PATH), 20000);
  if (!ctl) return verdict(false, null, `positive control: the web page's service worker script ${url(SW_PATH)} never reached onBeforeRequest`);
  if (ctl.tabId !== -1) {
    return verdict(false, null, `positive control: the web page's service worker script load carried tab id ${ctl.tabId}, not -1, so a browserless load is not what this scenario exercises`);
  }
  const theiaSw = `${theia.origin}${SW_PATH}`;
  await installUrlWitness(app, theiaSw);
  await app.evaluate(`(navigator.serviceWorker.register(${JSON.stringify(SW_PATH)}).catch(() => {}), true)`);
  await sleep(4000);
  const seen = await urlWitness(app);
  if (!seen.n) return verdict(false, null, `positive control: chrome scope saw no load of the Theia-origin worker script ${theiaSw}, so the absence below cannot be trusted`);
  const leaked = session.logs.filter(r => (r.kind === 'request' || r.kind === 'headers') && String(r.url).startsWith(theia.origin));
  if (leaked.length) {
    return verdict(false, null, `Theia worker visible to network observers: ${leaked.length} record(s) named the Theia origin (${leaked[0].kind} ${leaked[0].url}, tab id ${leaked[0].tabId}) after ${seen.n} load(s) of ${theiaSw}, ${seen.browserless} without a browsing context`);
  }
  return verdict(true, `the web page's worker script reached onBeforeRequest with tab id -1 (positive control); the Theia-origin worker script loaded ${seen.n} time(s) in chrome scope (${seen.browserless} without a browsing context) and the probe recorded none of them`, null);
}

// The shell's hidden-origins list loses its webview entry, so the webview's worker is no longer hidden: webview-render
// must go red.
const PLANT_WEBVIEW_WALL_OFF = `
  const pref = 'extensions.webRequest.hiddenOrigins';
  const before = Services.prefs.getStringPref(pref, '').split(',');
  const kept = before.filter(entry => !entry.includes('.webview.'));
  Services.prefs.getDefaultBranch('').setStringPref(pref, kept.join(','));
  return { landed: kept.length === before.length - 1 && kept.length > 0 };`;

const WEBVIEW_TEXT = 'PB webview probe rendered';

// Plan 38-07: a Theia webview (the plugin-webview widget a plugin's createWebviewPanel makes, opened here from the
// frontend because the app ships no plugin) renders from its own <uuid>.webview.localhost:<port> origin: its script
// posts the rendered text and its origin back. Its service worker loads in chrome scope without a browsing context,
// and the probe records none of the webview origin's requests (the frame's attribute covers the frame, the shell's
// hidden-origins pref the worker).
async function scenarioWebviewRender({ app, theia, plant }) {
  if (plant && plant.late) {
    const applied = await chromeJson(app, plant.late());
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant webview-wall-off did not land');
  }
  const id = randomUUID();
  const webviewOrigin = `http://${id}.webview.localhost:${new URL(theia.origin).port}`;
  const swUrl = `${webviewOrigin}/webview/service-worker.js`;
  await installUrlWitness(app, swUrl);
  const html = `<!doctype html><body><p id="m">${WEBVIEW_TEXT}</p><script>acquireVsCodeApi().postMessage({ text: document.getElementById('m').textContent, origin: location.origin });</script></body>`;
  const r = await probe(app, `
    // No viewId: Theia puts hashValue(viewId) in the origin in place of the id (webview-widget-factory.js), and the
    // service-worker witness above needs the origin before the widget exists.
    const widget = await get('WidgetManager').getOrCreateWidget('plugin-webview', { id: ${JSON.stringify(id)} });
    let message = null;
    widget.onMessage(m => { message = m; });
    widget.setContentOptions({ allowScripts: true });
    widget.setHTML(${JSON.stringify(html)});
    await get('ApplicationShell').addWidget(widget, { area: 'main' });
    await get('ApplicationShell').activateWidget(widget.id);
    await until(() => message !== null, 30000);
    return { message, endpoint: widget.externalEndpoint };`);
  if (r.error) return verdict(false, null, `webview did not render: ${r.error}`);
  if (!String(r.endpoint).startsWith(`${webviewOrigin}/`)) {
    return verdict(false, null, `webview not on its localhost origin: the widget's endpoint is ${r.endpoint}, expected ${webviewOrigin}/webview`);
  }
  if (!r.message || r.message.text !== WEBVIEW_TEXT || r.message.origin !== webviewOrigin) {
    return verdict(false, null, `webview did not render: after 30 s its script had posted ${JSON.stringify(r.message)}, expected the text '${WEBVIEW_TEXT}' from ${webviewOrigin}`);
  }
  await sleep(2000);
  const seen = await urlWitness(app);
  if (!seen.n || !seen.browserless) {
    return verdict(false, null, `positive control: chrome scope saw ${seen.n} load(s) of the webview's service worker ${swUrl} (${seen.browserless} without a browsing context), so the absence below cannot be trusted`);
  }
  const leaked = session.logs.filter(rec => (rec.kind === 'request' || rec.kind === 'headers') && String(rec.url).startsWith(webviewOrigin));
  if (leaked.length) {
    return verdict(false, null, `Theia webview visible to network observers: ${leaked.length} record(s) named the webview origin (${leaked[0].kind} ${leaked[0].url}, tab id ${leaked[0].tabId}) after ${seen.n} load(s) of ${swUrl}, ${seen.browserless} without a browsing context`);
  }
  return verdict(true, `the webview rendered '${WEBVIEW_TEXT}' from ${webviewOrigin}; its service worker loaded ${seen.n} time(s) in chrome scope (${seen.browserless} without a browsing context) and the probe recorded none of the webview origin's requests`, null);
}

// ---------------------------------------------------------------------------
// 39-13 (38-REVIEW CR-02, CR-03, WR-01, WR-06): the tabs bridge's refusals and stock-window routes. Every refusal copy
// is read from PowerBrowserAPI.sys.mjs at check time.
// ---------------------------------------------------------------------------

const API_SOURCE = readFileSync(join(REPO_ROOT, 'powerbrowser/shell/PowerBrowserAPI.sys.mjs'), 'utf8');
const refusalCopy = fragment => {
  const m = new RegExp(`"(PowerBrowser [^"]*${fragment}[^"]*)"`).exec(API_SOURCE);
  if (!m) throw new Error(`BROKEN INSTRUMENT: PowerBrowserAPI.sys.mjs no longer carries a refusal naming '${fragment}'`);
  return m[1];
};
const J = JSON.stringify;
const W_IMPORT = `const W = ChromeUtils.importESModule(${J(API_URL)}).PowerBrowserWebTabs;`;

async function contextsOn(app, spec) {
  return (await app.contexts()).filter(entry => entry.url === spec).length;
}

async function scenarioContainerRefused({ app, plant }) {
  const refused = refusalCopy('container tabs are not supported');
  await openAndCommit(app, '/a');
  await chromeJson(app, `Services.prefs.setBoolPref('privacy.userContext.enabled', true); return { landed: true };`);
  if (plant && plant.late) {
    const applied = await chromeJson(app, plant.late());
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant container-dropped did not land');
  }
  let refusal = null;
  try {
    await command('create', { props: { url: url('/c'), cookieStoreId: 'firefox-container-1' } });
  } catch (e) {
    refusal = e.message;
  }
  // Positive control, after the container call: the same call with the default store opens its tab.
  await command('create', { props: { url: url('/d'), cookieStoreId: 'firefox-default' } });
  await waitFor(r => r.kind === 'committed' && String(r.url).endsWith('/d'), 'committed /d', 30000);
  const all = (await command('query', { info: {} })).map(t => t.url);
  const onC = await contextsOn(app, url('/c'));
  if (refusal === null || onC || all.some(u => String(u).endsWith('/c'))) {
    return verdict(false, null, `a container tab was opened: tabs.create with firefox-container-1 ${refusal === null ? 'resolved' : `rejected (${refusal})`}; pages on /c ${onC}; tabs ${J(all)}`);
  }
  if (!refusal.includes(refused)) {
    return verdict(false, null, `not the container refusal: '${refusal}', want '${refused}'`);
  }
  if (!all.some(u => String(u).endsWith('/d'))) {
    return verdict(false, null, `positive control: firefox-default opened no tab (tabs ${J(all)})`);
  }
  return verdict(true, `firefox-container-1 refused with '${refused}' and nothing opened on /c; firefox-default opened /d (tabs ${J(all)})`, null);
}

// Whether the frontend shows `tabId` (attached and visible), read synchronously in the Theia frame.
const shownExpr = tabId => `(() => { ${GET_BY_NAME}
  const w = __getByName(window.theia.container, 'WebTabChannel').widgetOf(${J(tabId)});
  return !!(w && w.isAttached && w.isVisible); })()`;

async function scenarioActivateAfterAck({ app, plant }) {
  const A = await openAndCommit(app, '/a');
  // The CR-03 window, made deterministic: the frontend holds its webTabAdopt ack 2 s (a busy frontend), so the
  // extension's activation lands after the adoptTab push has gone and before the attach.
  await probe(app, `const ch = get('WebTabChannel'); const request = ch.request;
    ch.request = async function (msg) { if (msg.kind === 'webTabAdopt') await sleep(2000); return request.call(ch, msg); };
    return true;`);
  const pageApplied = plant && plant.page ? await probe(app, plant.page) : null;
  if (plant && plant.page && !pageApplied?.landed) throw new Error('BROKEN INSTRUMENT: plant activated-before-shown did not land');
  // The invariant, sampled for the whole create-then-activate: chrome's selection is read first, then the frontend, so
  // a selected tab the frontend does not show after the read was not shown before it either.
  const violations = [];
  let samples = 0;
  let done = false;
  const monitor = (async () => {
    while (!done) {
      const sel = await chromeJson(app, `${W_IMPORT} return { id: W.tabIdOfBrowser(window.gBrowser.selectedBrowser) };`);
      samples++;
      if (sel.id && sel.id !== A.webTabId && await app.evaluate(shownExpr(sel.id)) !== true) {
        violations.push(sel.id);
      }
      await sleep(40);
    }
  })();
  const mark = (await pushes(app)).length;
  let res;
  try {
    const created = await command('create', { props: { url: url('/d'), active: false } });
    if (await waitForPush(app, p => p && p.kind === 'adoptTab' && String(p.url).endsWith('/d'), { from: mark, timeoutMs: 10000 }) < 0) {
      throw new Error('BROKEN INSTRUMENT: no adoptTab push for /d, so the activation cannot land after it');
    }
    res = await command('update', { tabId: created.id, props: { active: true } });
  } finally {
    // Ends the monitor once /d is current in Theia (or 15 s pass), plus a short tail.
    await probe(app, `const shell = get('ApplicationShell');
      return await until(() => { const w = shell.mainPanel.currentTitle?.owner; return !!(w && String(w.url).endsWith('/d') && w.isAttached); }, 15000);`).catch(() => false);
    await sleep(600);
    done = true;
    await monitor;
  }
  const dId = (await pushes(app)).slice(mark).find(p => p && p.kind === 'selectTab')?.tabId ?? null;
  const current = await probe(app, `return get('ApplicationShell').mainPanel.currentTitle?.owner?.url ?? null;`);
  const selected = await chromeJson(app, `${W_IMPORT} return { id: W.tabIdOfBrowser(window.gBrowser.selectedBrowser) };`);
  if (violations.length) {
    return verdict(false, null, `the host selected a tab the frontend had not shown: chrome selected ${J([...new Set(violations)])} while the frontend did not show it (${samples} samples)`);
  }
  if (res.active !== false) {
    return verdict(false, null, `the host selected a tab the frontend had not shown: tabs.update answered active ${J(res.active)} before the attach`);
  }
  if (!dId || !String(current).endsWith('/d') || selected.id !== dId) {
    return verdict(false, null, `the activated tab was not shown: selectTab push ${J(dId)}, Theia current ${J(current)}, chrome selection ${J(selected.id)}`);
  }
  const active = await command('query', { info: { active: true, currentWindow: true } });
  if (active.length !== 1 || !String(active[0].url).endsWith('/d')) {
    return verdict(false, null, `the activated tab was not shown to extensions: active tabs ${J(active)}`);
  }
  return verdict(true, `tabs.update answered active false; selectTab pushed for ${dId}; /d current in Theia and in chrome; the selection never led the frontend over ${samples} samples`, null);
}

// The stock windows open now (chrome contexts on browser.xhtml).
async function stockContexts(app) {
  return (await app.contexts('chrome')).filter(entry => entry.url.startsWith('chrome://browser/content/browser.xhtml')).map(e => e.context);
}

// In a stock window: the tab index and principals of the one tab on `spec`, or null.
// Read through gBrowser.browsers, which the options-no-reuse plant leaves alone.
const STOCK_TAB_ON = spec => `const all = [...gBrowser.browsers];
  const i = all.findIndex(b => b.currentURI.spec === ${J(spec)});
  if (i < 0) return null;
  const p = all[i].contentPrincipal;
  return { index: i, count: all.filter(b => b.currentURI.spec === ${J(spec)}).length, system: p.isSystemPrincipal, origin: p.origin };`;

async function stockTabRead(app, spec, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    for (const ctx of await stockContexts(app)) {
      const r = await chromeJsonIn(app, ctx, STOCK_TAB_ON(spec)).catch(() => null);
      if (r) return { ctx, ...r };
    }
    if (Date.now() > end) return null;
    await sleep(250);
  }
}

// Records, in a stock window, what its addTab receives for a moz-extension URL (instrument, not a plant).
const ADD_TAB_RECORDER = `if (!window.__pbAddTabs) {
    window.__pbAddTabs = [];
    const add = gBrowser.addTab.bind(gBrowser);
    gBrowser.addTab = (u, o) => {
      const p = o && o.triggeringPrincipal;
      if (String(u).startsWith('moz-extension:')) window.__pbAddTabs.push({ url: String(u), system: !p || p.isSystemPrincipal, origin: p ? p.origin : null });
      return add(u, o);
    };
  }
  return { landed: true };`;

async function scenarioForeignPageRefused({ app, plant }) {
  const noOwner = refusalCopy('no extension owns it');
  const A = await openAndCommit(app, '/a');
  const shellWindowId = (await command('get', { tabId: A.extId })).windowId;
  await installFixture(app, FURNITURE);
  const furnUrl = await chromeJson(app, `return { u: WebExtensionPolicy.getByID(${J(FURN_ID)}).getURL('sidebar.html') };`);
  const ownUrl = await command('ownUrl', { path: 'page.html' });
  // Node's URL gives a non-special scheme the origin 'null'; the extension origin is scheme and host.
  const ownOrigin = ownUrl.split('/').slice(0, 3).join('/');
  if ((await stockContexts(app)).length) throw new Error('BROKEN INSTRUMENT: a stock window was open before the no-window leg');
  // Leg 1: a moz-extension URL no extension owns is refused and opens nothing.
  const unowned = `moz-extension://${randomUUID()}/page.html`;
  let refusal = null;
  try {
    await command('create', { props: { url: unowned } });
  } catch (e) {
    refusal = e.message;
  }
  if (refusal === null || !refusal.includes(noOwner)) {
    return verdict(false, null, `a foreign page opened or used the wrong principal: tabs.create of an unowned extension URL ${refusal === null ? 'resolved' : `rejected with '${refusal}'`}, want '${noOwner}'`);
  }
  // Leg 2: no stock window. An empty window opens, then the page is added to it (never loaded as its window argument).
  try {
    await command('create', { props: { url: ownUrl } });
  } catch {
    // the shortcut answer: the page opened in a new browser window
  }
  const noWin = await stockTabRead(app, ownUrl);
  if (!noWin || noWin.index < 1 || noWin.system || noWin.origin !== ownOrigin) {
    return verdict(false, null, `a foreign page opened or used the wrong principal: with no stock window the page read ${J(noWin)}, want an added tab (index >= 1) with the extension's principal ${ownOrigin}`);
  }
  // Leg 3: a started stock window gets addTab with the caller's principal, for another extension's page too.
  await chromeJsonIn(app, noWin.ctx, ADD_TAB_RECORDER);
  if (plant && plant.stock) {
    const applied = await chromeJsonIn(app, noWin.ctx, plant.stock);
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant foreign-system-principal did not land');
  }
  await command('create', { props: { url: furnUrl.u } });
  const foreign = await stockTabRead(app, furnUrl.u);
  const recorded = await chromeJsonIn(app, noWin.ctx, 'return window.__pbAddTabs;');
  const call = recorded.find(r => r.url === furnUrl.u);
  if (!foreign || !call || call.system || foreign.system) {
    return verdict(false, null, `a foreign page opened or used the wrong principal: another extension's page read ${J(foreign)}, addTab got ${J(call)}`);
  }
  // The stock tabs are listed too; an extension page must be in none of the shell window's tabs.
  const inShell = (await command('query', { info: { windowId: shellWindowId } })).map(t => t.url);
  if (!inShell.some(u => String(u).endsWith('/a')) || inShell.some(u => String(u).startsWith('moz-extension:'))) {
    return verdict(false, null, `a foreign page opened or used the wrong principal: the shell window's tabs are ${J(inShell)}`);
  }
  return verdict(true, `unowned URL refused ('${noOwner}'); with no stock window the page was added as tab ${noWin.index} under ${noWin.origin}; another extension's page went to the started window through addTab with principal ${call.origin}; no extension page in a web tab`, null);
}

async function scenarioOptionsPageSwitch({ app, plant }) {
  await openAndCommit(app, '/a');
  const optionsUrl = await command('ownUrl', { path: 'options.html' });
  if ((await stockContexts(app)).length) throw new Error('BROKEN INSTRUMENT: a stock window was open before the starting-window leg');
  // Leg 1: the first call starts a stock window; the second comes once that window exists and has not finished
  // starting (the state WR-06 waits on). One window, one tab. 39-REVIEW WR-08: the state is timing, so the leg is
  // retried (the window closed) up to three times until the second call meets a starting window, else it is SKIPPED.
  let wasStarting = null;
  let first = null;
  let settled = null;
  const attempts = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    await command('openOptions');
    let startingWin = null;
    const end = Date.now() + 20000;
    while (!startingWin && Date.now() < end) {
      startingWin = (await stockContexts(app))[0] ?? null;
      if (!startingWin) await sleep(20);
    }
    if (!startingWin) throw new Error('BROKEN INSTRUMENT: the first openOptionsPage started no stock window');
    wasStarting = await app.evaluateIn(startingWin, '!(window.gBrowserInit && window.gBrowserInit.delayedStartupFinished)').catch(() => null);
    attempts.push(wasStarting);
    await command('openOptions');
    first = await stockTabRead(app, optionsUrl);
    await sleep(2000);
    const windows = await stockContexts(app);
    settled = first && await chromeJsonIn(app, first.ctx, STOCK_TAB_ON(optionsUrl));
    if (!first || windows.length !== 1) {
      return verdict(false, null, `openOptionsPage opened a second window while the stock window was starting: ${windows.length} stock window(s)`);
    }
    if (wasStarting === true || settled.count !== 1 || attempt === 3) break;
    await app.evaluateIn(windows[0], '(() => { window.close(); return true; })()').catch(() => null);
    const gone = Date.now() + 10000;
    while ((await stockContexts(app)).length && Date.now() < gone) await sleep(100);
    if ((await stockContexts(app)).length) throw new Error('BROKEN INSTRUMENT: the stock window did not close for the starting-window retry');
  }
  const leg1 = wasStarting === true
    ? `a second call while the stock window was starting (attempt ${attempts.length}) gave one stock window and one options tab`
    : `leg 1 SKIPPED: the stock window had finished starting at the second call in ${attempts.length} attempt(s) (${J(attempts)}), so the starting-window state was not reached`;
  // Judged after leg 2 runs, so one session reports both legs.
  const startingFail = settled.count !== 1
    ? `openOptionsPage opened a second tab while the stock window was starting: ${settled.count} options tabs in the one stock window (window still starting at the second call: ${wasStarting})`
    : null;
  // Leg 2: the window has started. Move off the options tab, call again: it switches back and adds none.
  if (plant && plant.stock) {
    const applied = await chromeJsonIn(app, first.ctx, plant.stock(optionsUrl));
    if (!applied.landed) throw new Error('BROKEN INSTRUMENT: plant options-no-reuse did not land');
  }
  await chromeJsonIn(app, first.ctx, `gBrowser.selectedTab = gBrowser.tabs.find(t => t.linkedBrowser.currentURI.spec !== ${J(optionsUrl)}) || gBrowser.selectedTab; return { landed: true };`);
  await command('openOptions');
  await sleep(1500);
  const after = await chromeJsonIn(app, first.ctx, `const r = (() => { ${STOCK_TAB_ON(optionsUrl)} })();
    return { ...r, selected: gBrowser.selectedBrowser.currentURI.spec };`);
  // Pages are counted on the BiDi tree, which reads the documents, not chrome's view of the browsers.
  const onUrl = await contextsOn(app, optionsUrl);
  if (onUrl !== settled.count || (await stockContexts(app)).length !== 1) {
    return verdict(false, null, `openOptionsPage opened a second tab in the started window: ${settled.count} -> ${onUrl} page(s) on the options page`);
  }
  if (after.count !== settled.count || after.selected !== optionsUrl) {
    return verdict(false, null, `openOptionsPage did not switch to the open options tab (selected ${after.selected})`);
  }
  if (startingFail) {
    return verdict(false, null, `${startingFail}; the started-window leg passed (a third call switched to the options tab and added none)`);
  }
  return verdict(true, `${leg1}; a third call switched to it and added none`, null);
}

// CR-02's defect: the container is dropped on the way to the host, so the page loads in the default cookie jar.
const PLANT_CONTAINER_DROPPED = `
  const add = window.gBrowser.addTab;
  window.gBrowser.addTab = (u, o) => add.call(window.gBrowser, u, { ...o, userContextId: 0 });
  return { landed: true };`;

// CR-03's defect: the frontend's own activation reaches chrome at ack time, while the widget's attach waits 2.5 s.
const PLANT_ACTIVATED_BEFORE_SHOWN = `const ch = get('WebTabChannel'); const request = ch.request;
  ch.request = async function (msg) {
    const reply = await request.call(ch, msg);
    if (msg.kind === 'webTabAdopt' && reply.ok === true && !window.__pbPlantRan) {
      window.__pbPlantRan = true;
      ch.send({ kind: 'webTabActivated', tabId: msg.tabId });
      await sleep(2500);
    }
    return reply;
  };
  return { landed: true };`;

// WR-01's defect class: an extension page added to the stock window with the system principal.
const PLANT_FOREIGN_SYSTEM_PRINCIPAL = `
  const add = gBrowser.addTab;
  gBrowser.addTab = (u, o) => add.call(gBrowser, u, { ...o, triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
  return { landed: true };`;

// WR-06's defect: the switch-to lookup misses the tab already showing the page, so the call adds another. The open
// tab's browser reports about:blank to chrome; the BiDi page count still sees it.
const PLANT_OPTIONS_NO_REUSE = spec => `
  const b = [...gBrowser.browsers].find(x => x.currentURI.spec === ${J(spec)});
  if (!b) return { landed: false };
  Object.defineProperty(b, 'currentURI', { configurable: true, get: () => Services.io.newURI('about:blank') });
  return { landed: b.currentURI.spec === 'about:blank' };`;

const SCENARIOS = {
  query: scenarioQuery,
  sender: scenarioSender,
  webrequest: scenarioWebrequest,
  events: scenarioEvents,
  'active-tab': scenarioActiveTab,
  'ide-retain': scenarioIdeRetain,
  'focus-follow': scenarioFocusFollow,
  'window-type': scenarioWindowType,
  execute: scenarioExecute,
  'adversarial-starts': scenarioAdversarialStarts,
  'toolbar-target': scenarioToolbarTarget,
  gui01: scenarioGui01,
  'scheme-wall': scenarioSchemeWall,
  'refused-write': scenarioRefusedWrite,
  'extension-redirect': scenarioExtensionRedirect,
  'favicon-clear': scenarioFaviconClear,
  'theia-never': scenarioTheiaNever,
  'ext-mute': scenarioExtMute,
  'ext-zoom-get': scenarioExtZoomGet,
  'ext-zoom-change': scenarioExtZoomChange,
  'ext-capture': scenarioExtCapture,
  'network-wall': scenarioNetworkWall,
  'windows-refusal': scenarioWindowsRefusal,
  'worker-wall': scenarioWorkerWall,
  'webview-render': scenarioWebviewRender,
  'container-refused': scenarioContainerRefused,
  'activate-after-ack': scenarioActivateAfterAck,
  'foreign-page-refused': scenarioForeignPageRefused,
  'options-page-switch': scenarioOptionsPageSwitch,
};

// Each plant names its scenario, the expected red text, and the chrome-scope mutation.
// The shell's replacement load is suppressed on this overlay, so the extension page stays (T-31.1-20).
const PLANT_REDIRECT_GUARD_OFF = tabId => `
  const o = [...document.querySelectorAll('browser')].find(x => ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs.tabIdOfBrowser(x) === ${JSON.stringify(tabId)});
  if (!o) return { landed: false };
  const load = o.fixupAndLoadURIString.bind(o);
  o.fixupAndLoadURIString = (uri, options) => (uri === 'about:blank' ? undefined : load(uri, options));
  return { landed: true };`;

// The overlay's tab node keeps its icon, so the clear on navigation is ignored (WR-08).
const PLANT_FAVICON_STALE = tabId => `
  const node = [...window.gBrowser.tabs].find(t => ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs.tabIdOfBrowser(t.linkedBrowser) === ${JSON.stringify(tabId)});
  if (!node || !node.image) return { landed: false };
  const keep = node.image;
  Object.defineProperty(node, 'image', { configurable: true, get: () => keep, set: () => {} });
  return { landed: true };`;

// Mute and zoom plants (32-09). Each names its scenario and the red text the scenario must print.
const PLANT_MUTE_UNSYNCED = tabId => `
  const node = [...window.gBrowser.tabs].find(t => ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs.tabIdOfBrowser(t.linkedBrowser) === ${JSON.stringify(tabId)});
  if (!node) return { landed: false };
  Object.defineProperty(node, 'muted', { configurable: true, get: () => false, set: () => {} });
  return { landed: true };`;

// A window capture listener stops the TabAttrModified 'muted' event before any tracker hears it.
const PLANT_MUTE_EVENT_DROPPED = `
  window.addEventListener('TabAttrModified', e => {
    if (e.detail && Array.isArray(e.detail.changed) && e.detail.changed.includes('muted')) e.stopImmediatePropagation();
  }, true);
  return { landed: true };`;

const PLANT_ZOOM_SHIM_MISSING = `
  const had = 'ZoomManager' in window;
  delete window.ZoomManager;
  return { landed: had && !('ZoomManager' in window) };`;

const PLANT_ZOOM_SETTINGS_MISSING = `
  const had = typeof window.FullZoom === 'object';
  delete window.FullZoom;
  return { landed: had && typeof window.FullZoom === 'undefined' };`;

const PLANTS = {
  'theia-in-tabs': { scenario: 'query', expect: 'Theia frame visible to extensions', body: PLANT_THEIA_IN_TABS },
  'no-tab-for-browser': { scenario: 'sender', expect: 'sender.tab missing', body: PLANT_NO_TAB_FOR_BROWSER },
  'no-tab-for-browser-net': { scenario: 'webrequest', expect: 'network event carried tabId -1', body: PLANT_NO_TAB_FOR_BROWSER },
  'no-tabselect': { scenario: 'events', expect: 'onActivated did not fire', body: PLANT_NO_TABSELECT },
  'stale-active': { scenario: 'active-tab', expect: 'active tab did not follow the selected web tab', body: PLANT_STALE_ACTIVE },
  'clear-on-ide': { scenario: 'ide-retain', expect: 'active tab cleared while the IDE has focus', body: PLANT_CLEAR_ON_IDE },
  'focus-ignored': { scenario: 'focus-follow', expect: 'active tab did not follow page focus', body: PLANT_FOCUS_IGNORED },
  'popup-type': { scenario: 'window-type', expect: 'shell window reported as popup', body: PLANT_POPUP_TYPE },
  'swapped-browser': { scenario: 'execute', expect: 'executeScript on tab A ran in /b', late: PLANT_SWAPPED_BROWSER },
  'bad-selected-tab': { scenario: 'adversarial-starts', expect: 'page_action extension failed to start', late: () => PLANT_BAD_SELECTED_TAB },
  'selected-not-visible': { scenario: 'toolbar-target', expect: 'toolbar action acted on /a, not the page on screen /c', body: PLANT_SELECTED_TO_FIRST },
  'stock-badge-missing': { scenario: 'gui01', expect: 'stock window button has no badge', late: () => PLANT_STOCK_BADGE_MISSING },
  'wall-unkeyed': { scenario: 'scheme-wall', expect: 'web tab navigated to an extension page', late: () => PLANT_WALL_UNKEYED },
  'wall-elsewhere': { scenario: 'scheme-wall', expect: 'not the URL wall', refusalOp: 'updateExtPagePinned' },
  // A sender record naming the Theia origin gets through to the recorder; the sender scenario must go red on it.
  'theia-record': { scenario: 'sender', expect: 'Theia frame visible to extensions', record: theia => ({ kind: 'sender', tabId: -1, url: `${theia.origin}/`, href: `${theia.origin}/`, frameId: 0 }) },
  'redirect-guard-off': { scenario: 'extension-redirect', expect: 'web tab navigated to an extension page', late: A => PLANT_REDIRECT_GUARD_OFF(A.webTabId) },
  'favicon-stale': { scenario: 'favicon-clear', expect: 'favicon survived a top-level navigation', late: A => PLANT_FAVICON_STALE(A.webTabId) },
  'theia-in-tabs-late': { scenario: 'theia-never', expect: 'Theia frame visible to extensions', late: () => PLANT_THEIA_IN_TABS },
  'mute-unsynced': { scenario: 'ext-mute', expect: 'mutedInfo did not follow the overlay', late: A => PLANT_MUTE_UNSYNCED(A.webTabId) },
  'mute-event-dropped': { scenario: 'ext-mute', expect: 'onUpdated mutedInfo did not fire', body: PLANT_MUTE_EVENT_DROPPED },
  'zoom-shim-missing': { scenario: 'ext-zoom-get', expect: 'tabs.getZoom failed', late: () => PLANT_ZOOM_SHIM_MISSING },
  'zoom-settings-missing': { scenario: 'ext-zoom-change', expect: 'onZoomChange did not fire', body: PLANT_ZOOM_SETTINGS_MISSING },
  'network-wall-off': { scenario: 'network-wall', expect: 'Theia frame visible to network observers', late: () => PLANT_NETWORK_WALL_OFF },
  'windows-guard-off': { scenario: 'windows-refusal', expect: 'not the tab host refusal', late: () => PLANT_WINDOWS_GUARD_OFF },
  'worker-wall-off': { scenario: 'worker-wall', expect: 'Theia worker visible to network observers', late: () => PLANT_WORKER_WALL_OFF },
  'webview-wall-off': { scenario: 'webview-render', expect: 'Theia webview visible to network observers', late: () => PLANT_WEBVIEW_WALL_OFF },
  'container-dropped': { scenario: 'container-refused', expect: 'a container tab was opened', late: () => PLANT_CONTAINER_DROPPED },
  'activated-before-shown': { scenario: 'activate-after-ack', expect: 'the host selected a tab the frontend had not shown', page: PLANT_ACTIVATED_BEFORE_SHOWN },
  'foreign-system-principal': { scenario: 'foreign-page-refused', expect: 'a foreign page opened or used the wrong principal', stock: PLANT_FOREIGN_SYSTEM_PRINCIPAL },
  'options-no-reuse': { scenario: 'options-page-switch', expect: 'openOptionsPage opened a second tab', stock: spec => PLANT_OPTIONS_NO_REUSE(spec) },
};

// ---------------------------------------------------------------------------
// Sessions and the driver.
// ---------------------------------------------------------------------------

async function stampCheck() {
  const digest = createHash('sha256')
    .update(await readFile(PATCH_FILE))
    .digest('hex');
  const stamp = (await readFile(STAMP_FILE, 'utf8')).trim().split(/\s+/)[0];
  if (digest !== stamp) {
    throw new Error(`BROKEN INSTRUMENT: patches/050 hashes to ${digest}, the build stamp is ${stamp}; rebuild before a live run`);
  }
  const digest060 = createHash('sha256').update(await readFile(PATCH_060_FILE)).digest('hex');
  let stamp060 = null;
  try {
    stamp060 = (await readFile(STAMP_060_FILE, 'utf8')).trim().split(/\s+/)[0];
  } catch {
    stamp060 = null;
  }
  if (digest060 !== stamp060) {
    throw new Error(`BROKEN INSTRUMENT: patches/060 hashes to ${digest060}, the build stamp objdir/.pb-060-build.sha256 is ${stamp060}; rebuild with the full patch stack before a live run`);
  }
  return digest;
}

// One scenario in one session. A plant, when given, is applied after the install.
async function runSession(scenarioName, plantName = null) {
  resetSession();
  const plant = plantName ? PLANTS[plantName] : null;
  try {
    return await withProbeShell(
      async app => {
        await installErrorRecorder(app);
        await installProbe(app);
        const theia = await waitForTheiaOrigin(app);
        if (plant && plant.body) {
          const applied = await chromeJson(app, plant.body);
          if (!applied.landed) {
            throw new Error(`BROKEN INSTRUMENT: plant ${plantName} did not land`);
          }
        }
        return await SCENARIOS[scenarioName]({ app, theia, plant });
      },
      { extraPrefs: { 'xpinstall.signatures.required': false, 'extensions.logging.enabled': true } }
    );
  } catch (error) {
    const text = error && error.message ? error.message : String(error);
    if (text.startsWith('BROKEN INSTRUMENT')) return { broken: true, ok: false, detail: null, fail: text };
    return { ok: false, detail: null, fail: text };
  } finally {
    for (const dir of sessionDirs.splice(0)) await rm(dir, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const scenarioIndex = argv.indexOf('--scenario');
  const selected = scenarioIndex === -1 ? Object.keys(SCENARIOS) : argv[scenarioIndex + 1].split(',');
  for (const name of selected) {
    if (!SCENARIOS[name]) throw new Error(`unknown scenario ${name}; known: ${Object.keys(SCENARIOS).join(', ')}`);
  }
  return { selected, selfTest: argv.includes('--self-test') };
}

async function main() {
  const { selected, selfTest } = parseArgs(process.argv.slice(2));
  await stampCheck();
  let failed = 0;
  if (!selfTest) {
    for (const name of selected) {
      const r = await runSession(name);
      if (r.ok) {
        console.log(`${name}: PASS -- ${r.detail}`);
      } else {
        failed++;
        console.log(`${name}: FAIL -- ${r.fail}`);
        if (r.broken) break;
      }
    }
  } else {
    // A clean control for each plant's scenario, then one session per plant.
    for (const [plantName, plant] of Object.entries(PLANTS)) {
      if (!selected.includes(plant.scenario)) continue;
      const control = await runSession(plant.scenario);
      if (!control.ok) {
        failed++;
        console.log(`${NAME} --self-test: control ${plant.scenario} FAIL -- ${control.fail}`);
        continue;
      }
      console.log(`  control ${plant.scenario}: PASS -- the clean run is green before the plant`);
      const red = await runSession(plant.scenario, plantName);
      if (!red.ok && red.fail && red.fail.includes(plant.expect)) {
        console.log(`  ok  plant ${plantName} -> red, naming '${plant.expect}': ${red.fail}`);
      } else {
        failed++;
        console.log(`${NAME} --self-test: FAIL -- plant ${plantName} did not go red naming '${plant.expect}': ${red.fail}`);
      }
    }
    if (!failed) console.log(`${NAME} --self-test: PASS -- every control was green and every plant went red naming its drift`);
  }
  server.close();
  process.exit(failed ? 1 : 0);
}

await main();
