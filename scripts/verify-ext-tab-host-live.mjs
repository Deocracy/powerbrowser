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
//     objdir/.pb-050-build.sha256 (the binary carries the patch);
//   - after the install, chrome scope reports windowTracker.isTabHostWindow as a
//     function, windowTracker.isBrowserWindow(window) true, and tabTracker
//     getBrowserData as a function.
//
// Scenarios (31.1-02): query, sender, webrequest, events, active-tab, ide-retain,
// focus-follow, window-type, execute. Scenarios (31.1-04): adversarial-starts (the
// chrome-error recorder with its positive control, zero tabs, IDE current, first
// tab), toolbar-target, gui01 (the stock window with the shell admitted),
// scheme-wall and theia-never. The fixtures are written from the literals in this
// file into temporary directories, and removed when the session ends.
//
//   node scripts/verify-ext-tab-host-live.mjs [--scenario a,b] [--self-test]
//
// Node built-ins plus ./lib/pb-relaunch.mjs and ./lib/pb-live-probe.mjs only.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withProbeShell, openWebTab, makeCurrent, focusOverlay, focusTheiaFrame } from './lib/pb-live-probe.mjs';
import { REPO_ROOT, probe, stockTabOn } from './lib/pb-relaunch.mjs';

const NAME = 'verify-ext-tab-host-live';
const EXT_ID = 'pb-ext-tab-host-probe@powerbrowser.test';
const API_URL = 'chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs';
const PATCH_FILE = join(REPO_ROOT, 'patches/050-extension-tab-host.patch');
const STAMP_FILE = join(REPO_ROOT, 'objdir/.pb-050-build.sha256');
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
  permissions: ['tabs', 'webRequest', 'webNavigation', '<all_urls>'],
  background: { scripts: ['background.js'] },
  content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'], run_at: 'document_idle' }],
  browser_action: { default_title: 'PB tab host probe' },
  page_action: { default_title: 'PB tab host probe page', show_matches: ['<all_urls>'] },
  commands: { 'pb-probe-command': { suggested_key: { default: 'Ctrl+Shift+Y' }, description: 'PB tab host probe' } },
};

const PAGE = '<!doctype html><title>PB probe extension page</title><body>extension page</body>';

// Every record goes to the harness's /log endpoint. Commands arrive on /cmd.
const BACKGROUND = `
const ORIGIN = __ORIGIN__;
const post = rec => { fetch(ORIGIN + '/log', { method: 'POST', body: JSON.stringify(rec) }).catch(() => {}); };
const brief = t => t && { id: t.id, url: t.url, windowId: t.windowId, active: t.active, title: t.title, favIconUrl: t.favIconUrl, status: t.status };
post({ kind: 'started' });
browser.tabs.onZoomChange.addListener(z => post({ kind: 'zoom', tabId: z && z.tabId }));
browser.browserAction.onClicked.addListener(tab => post({ kind: 'clicked', tabId: tab.id, url: tab.url, windowId: tab.windowId }));
browser.tabs.onCreated.addListener(t => post({ kind: 'created', tab: brief(t) }));
browser.tabs.onActivated.addListener(i => post({ kind: 'activated', tabId: i.tabId, windowId: i.windowId, previousTabId: i.previousTabId }));
browser.tabs.onUpdated.addListener((id, change, t) => post({ kind: 'updated', tabId: id, change, url: t && t.url, title: t && t.title, windowId: t && t.windowId }));
browser.tabs.onRemoved.addListener((id, info) => post({ kind: 'removed', tabId: id, windowId: info.windowId, isWindowClosing: info.isWindowClosing }));
browser.webRequest.onBeforeRequest.addListener(d => post({ kind: 'request', tabId: d.tabId, url: d.url, type: d.type, frameId: d.frameId }), { urls: ['<all_urls>'], types: ['main_frame'] });
browser.webNavigation.onCommitted.addListener(d => post({ kind: 'committed', tabId: d.tabId, url: d.url, frameId: d.frameId }));
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
    else if (cmd.op === 'pageShown') result = await browser.pageAction.isShown({ tabId: cmd.tabId });
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
const PROBE = fixture(EXT_ID, 'probe', MANIFEST, { 'background.js': withOrigin(BACKGROUND), 'content.js': CONTENT, 'page.html': PAGE });

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
async function scenarioSender({ app }) {
  const { extId } = await openTab(app, '/b');
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
  if (String(seen.url).startsWith('moz-extension:') || String(overlay.spec).startsWith('moz-extension:')) {
    return verdict(false, null, `web tab navigated to an extension page: tabs.get ${seen.url}, overlay ${overlay.spec}`);
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
  const tabs = [];
  const absent = async where => {
    const info = await theiaInfo(app);
    if (info.extensionId !== -1) return `Theia frame visible to extensions: ${where}: getBrowserData(frame).tabId is ${info.extensionId}`;
    const listed = (await command('query', { info: {} })).filter(t => String(t.url).startsWith(theia.origin));
    if (listed.length) return `Theia frame visible to extensions: ${where}: tabs.query listed ${JSON.stringify(listed)}`;
    if (session.logs.some(r => JSON.stringify(r).includes(theia.origin))) {
      return `Theia frame visible to extensions: ${where}: an extension record names the Theia origin ${theia.origin}`;
    }
    const webIds = tabs.map(t => t.extId);
    for (const r of session.logs) {
      for (const id of tabIdsOf(r)) {
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
  return verdict(true, `four web tabs (${tabs.map(t => t.extId).join(', ')}), activated, B navigated to /c, C closed: no tabs.query row, event, request, sender report or record named the Theia origin, and every tab id was a web tab of this session; getBrowserData(frame).tabId stayed -1 at every step; WebDriver still reached the frame at both ends (${origin1}); every opened tab was reported`, null);
}

// tabs.update fields the shell cannot write are refused before the URL loads (WR-07), so a refused write applies
// nothing. A pinned write and an active: true write to an unselected tab are both refused; the selected tab still
// takes a URL and active: true together.
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
  const switched = await refuse({ url: url('/d'), active: true });
  if (switched === null) return verdict(false, null, 'tabs.update with active: true on a tab that is not selected was not refused');
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
  return verdict(true, `tabs.update with pinned: true (${pinned}) and with active: true on an unselected tab (${switched}) were refused before any navigation: tab A stayed /a; the selected tab B took url and active: true together and loaded /c`, null);
}

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
  'theia-never': scenarioTheiaNever,
};

// Each plant names its scenario, the expected red text, and the chrome-scope mutation.
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
  'theia-in-tabs-late': { scenario: 'theia-never', expect: 'Theia frame visible to extensions', late: () => PLANT_THEIA_IN_TABS },
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
