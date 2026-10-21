// Spike 002a driver: proves the patch route live on the built binary.
// tabhost.js installs the patch's exact logic on the live extension/WebDriver
// singletons plus a prototype shell tab host, then two test extensions
// (spike 001's probe, widened; and an activeTab-only one) are driven through
// overlay create/activate/navigate/close and a GUI-01 stock window.
// Throwaway; imports the repo harness, modifies nothing.
//
//   node .planning/spikes/002a-ext-route-patch/run.mjs [--control]
//   --control: same run WITHOUT tabhost.js (today's behaviour, for comparison)
import { createServer } from 'node:http';
import { cp, mkdtemp, writeFile, readFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeProfile, withShell, probe, pollFor, stockTabOn } from '../../../scripts/lib/pb-relaunch.mjs';
import { openWebTab, inChrome } from '../../../scripts/lib/pb-live-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT_ID = 'spike002a-tab-visibility@powerbrowser.test';
const AT_ID = 'spike002a-activetab@powerbrowser.test';
const CONTROL = process.argv.includes('--control');
// --no-guards: emulate only the window gate (hunks 1-3), not the zero-tab and browserAction guards.
const NO_GUARDS = process.argv.includes('--no-guards');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 1x1 PNG, served as the pages' favicon so LinkHandlerParent has an icon to hand gBrowser.setIcon.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const log = [];
const steps = [];
let queue = [];
let fuQueue = [];
let cmdSeq = 0;
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (req.method === 'POST' && path === '/log') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { try { log.push({ step: steps.length, ...JSON.parse(body) }); } catch { log.push({ bad: body }); } res.writeHead(204, { 'access-control-allow-origin': '*' }); res.end(); });
    return;
  }
  if (path === '/cmd') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(queue));
    queue = [];
    return;
  }
  if (path === '/fucmd') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(fuQueue));
    fuQueue = [];
    return;
  }
  if (path === '/icon.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(PNG); return; }
  if (/^\/[a-z]$/.test(path)) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>page ${path}</title><link rel="icon" href="/icon.png"><body>spike page ${path}</body>`);
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const url = p => `${ORIGIN}${p}`;

async function bg(op, args = {}, timeoutMs = 10000) {
  const id = ++cmdSeq;
  queue.push({ id, op, args });
  const hit = await pollFor(() => log.find(e => e.kind === 'cmd-result' && e.data.id === id), timeoutMs, `bg op ${op}`);
  return hit.data.r;
}

async function fu(op, args = {}, timeoutMs = 10000) {
  const id = ++cmdSeq;
  fuQueue.push({ id, op, args });
  const hit = await pollFor(() => log.find(e => e.kind === 'fu-result' && e.data.id === id), timeoutMs, `fu op ${op}`);
  return hit.data.r;
}

// Every chrome-side script error from the extension framework or CustomizableUI, in order.
const CONSOLE_RECORDER = `(() => {
  if (!window.__spikeErrors) {
    window.__spikeErrors = [];
    const l = { observe(m) { try { m.QueryInterface(Ci.nsIScriptError);
      if (/extensions|customizableui|ext-|sessionstore|Sidebar/i.test(m.sourceName + ' ' + m.errorMessage)) window.__spikeErrors.push(m.errorMessage + ' @ ' + m.sourceName.split('/').pop() + ':' + m.lineNumber); } catch (e) {} } };
    Services.console.registerListener(l);
  }
  return true;
})()`;

// The real exception behind a sanitised "An unexpected error occurred" for an active-tab query.
const QUERY_STACKS = `(() => {
  const ext = WebExtensionPolicy.getByID(${JSON.stringify(EXT_ID)}).extension;
  const ctx = [...ext.views].find(v => v.viewType === 'background') || null;
  const q = o => new Proxy(o, { get: (t, k) => (k in t ? t[k] : null), has: () => true });
  const run = fn => { try { return { ok: JSON.stringify(fn()) }; } catch (e) { return { err: String(e), stack: (e.stack || '').split('\\n').slice(0, 4) }; } };
  return JSON.stringify({ activeCurrent: run(() => [...ext.tabManager.query(q({ active: true, currentWindow: true }), ctx)].length) });
})()`;

// Chrome-side ground truth for every step.
const GROUND = `
  const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
  const { TabManager: WD } = ChromeUtils.importESModule('chrome://remote/content/shared/TabManager.sys.mjs');
  const g = ExtensionParent.apiManager.global;
  const overlays = [...document.querySelectorAll('browser')].filter(b => W.tabIdOfBrowser(b) !== null);
  const theia = document.getElementById('powerbrowser-content');
  const bd = b => { try { return g.tabTracker.getBrowserData(b); } catch (e) { return { err: String(e) }; } };
  const top = g.windowTracker.topWindow;
  return JSON.stringify({
    shellIsBrowserWindow: g.windowTracker.isBrowserWindow(window),
    topWindow: top ? top.document.documentElement.getAttribute('windowtype') : null,
    activeTabUrl: g.tabTracker.activeTab ? g.tabTracker.activeTab.linkedBrowser.currentURI.spec : null,
    extTabsUrls: (window.gBrowser.tabs || []).map(t => t.linkedBrowser.currentURI.spec),
    webDriverBrowsers: WD.getBrowsers().map(b => b === theia ? 'THEIA-FRAME' : b.currentURI.spec),
    theiaFrame: { mmGroup: theia.getAttribute('messagemanagergroup'), getBrowserData: bd(theia) },
    overlays: overlays.map(b => ({ pbTabId: W.tabIdOfBrowser(b), url: b.currentURI.spec, visible: b.style.visibility, getBrowserData: bd(b) })),
    chromeErrors: window.__spikeErrors ? window.__spikeErrors.splice(0) : null,
    stockBadges: [...Services.wm.getEnumerator('navigator:browser')].map(w => [...w.document.querySelectorAll('[data-extensionid]')].map(n => ({ ext: n.getAttribute('data-extensionid'), tag: n.localName, badge: n.getAttribute('badge') || n.querySelector('.toolbarbutton-badge')?.textContent || '' }))),
    hostTrace: window.__spike002a ? { events: window.__spike002a.events.splice(0), setIcon: window.__spike002a.setIcon.splice(0), unsupported: window.__spike002a.unsupported.splice(0) } : null,
  });`;

async function step(name, action, { settle = 1500 } = {}) {
  steps.push(name);
  const record = { name, index: steps.length };
  try { record.action = action ? await action() : null; } catch (e) { record.actionError = String(e && e.message || e); }
  await sleep(settle);
  record.ground = JSON.parse(await inChrome(app, GROUND));
  record.snapshot = await bg('snapshot', { label: name });
  results.steps.push(record);
  console.log(`step ${record.index}: ${name}${record.actionError ? ` (action error: ${record.actionError})` : ''}`);
  return record;
}

const results = { mode: CONTROL ? 'control (no tab host)' : NO_GUARDS ? 'window gate only (no guard hunks) + tab host' : 'patch emulated + tab host', origin: ORIGIN, startedAt: new Date().toISOString(), tabhost: null, install: [], steps: [], log };
let app;

async function stage(src) {
  const dir = await mkdtemp(join(tmpdir(), 'pb-spike002a-ext-'));
  await cp(join(HERE, src), dir, { recursive: true });
  await writeFile(join(dir, 'config.js'), `var ORIGIN = ${JSON.stringify(ORIGIN)};\n`);
  return dir;
}
const extDirs = [await stage('extension'), await stage('extension-activetab'), await stage('extension-furniture')];

async function install(dir) {
  return JSON.parse(await app.evaluateIn(app.chrome, `(async () => {
    try {
      const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      const f = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
      f.initWithPath(${JSON.stringify(dir)});
      const addon = await AddonManager.installTemporaryAddon(f);
      return JSON.stringify({ id: addon.id, isActive: addon.isActive });
    } catch (e) { return JSON.stringify({ error: String(e) }); }
  })()`));
}

async function triggerAction(target, id) {
  const expr = `(() => {
    try {
      const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
      const g = ExtensionParent.apiManager.global;
      g.browserActionFor(WebExtensionPolicy.getByID(${JSON.stringify(id)}).extension).triggerAction(window);
      return 'returned';
    } catch (e) { return 'threw: ' + e + ' @ ' + (e.stack || '').split('\\n').slice(0, 3).join(' | '); }
  })()`;
  const ctx = target === 'shell' ? app.chrome : target;
  if (!ctx) return 'no stock chrome context';
  const r = await app.evaluateIn(ctx, expr);
  await sleep(1000);
  return r;
}

const profile = await makeProfile();
await appendFile(join(profile.profileDir, 'user.js'), 'user_pref("xpinstall.signatures.required", false);\nuser_pref("extensions.logging.enabled", true);\n');

try {
  await withShell(profile, async a => {
    app = a;
    // The extension framework's tab modules load with the first extension, so install first,
    // then emulate the patch (tabhost.js re-runs the window-open path for listeners already registered).
    for (const d of extDirs.slice(0, 2)) results.install.push(await install(d));
    console.log('install:', JSON.stringify(results.install));
    await app.evaluateIn(app.chrome, CONSOLE_RECORDER);
    await pollFor(() => log.find(e => e.kind === 'started'), 15000, 'probe background started');
    if (!CONTROL) {
      let src = await readFile(join(HERE, 'tabhost.js'), 'utf8');
      if (NO_GUARDS) src = src.replace('const EMULATE_GUARDS = true;', 'const EMULATE_GUARDS = false;');
      results.tabhost = JSON.parse(await app.evaluateIn(app.chrome, src));
      console.log('tabhost:', JSON.stringify(results.tabhost));
      results.webDriverStillReachesTheia = await app.evaluate('location.origin');
    }

    await step('baseline: shell only, no overlay, no stock window', async () => JSON.parse(await app.evaluateIn(app.chrome, QUERY_STACKS)));
    const A = (await step('open overlay A on /a', async () => ({ tabId: await openWebTab(app, url('/a')) }), { settle: 2500 })).action.tabId;
    const B = (await step('open overlay B on /b', async () => ({ tabId: await openWebTab(app, url('/b')) }), { settle: 2500 })).action.tabId;
    const activate = id => probe(app, `await get('ApplicationShell').activateWidget(get('WebTabChannel').widgetOf(${JSON.stringify(id)}).id); return true;`);
    await step('activate overlay A', () => activate(A));
    await step('activate overlay B', () => activate(B));
    await step('navigate overlay B to /c', () => probe(app, `return await get('WebTabChannel').widgetOf(${JSON.stringify(B)}).navigate(${JSON.stringify(url('/c'))});`), { settle: 2500 });

    await step('show a Theia (non-web) widget: preferences:open', () => probe(app, `await get('CommandRegistry').executeCommand('preferences:open'); await sleep(800); return { current: get('ApplicationShell').currentWidget?.id || null };`), { settle: 2000 });
    await step('reactivate overlay B', () => activate(B));
    const extTabs = () => results.steps.at(-1).snapshot.ok?.queryAll?.ok || results.steps.at(-1).snapshot.queryAll?.ok || [];
    const idOf = path => (extTabs().find(t => t.url === url(path)) || {}).id ?? -1;
    const idA = idOf('/a');
    const idB = idOf('/c');
    results.ids = { A: idA, B: idB };
    await step('bg: tabs.executeScript on the active tab', () => bg('executeScriptActive'));
    await step('bg: tabs.executeScript on background tab A by id', () => bg('executeScriptTab', { tabId: idA }));
    await step('bg: tabs.sendMessage to tab A by id', () => bg('sendMessageTab', { tabId: idA }));
    await step('bg: tabs.get(A)', () => bg('getTab', { tabId: idA }));
    await step('bg: tabs.update(A, {active:true}) (chrome -> Theia direction)', () => bg('updateTab', { tabId: idA, props: { active: true } }));
    await step('bg: tabs.create (chrome -> Theia direction)', () => bg('createTab', { url: url('/d') }));
    await step('bg: ping every content-script port', () => bg('pingPorts'));
    await step('browserAction triggerAction(shell) [probe ext]', () => triggerAction('shell', EXT_ID));
    await step('browserAction triggerAction(shell) [activeTab-only ext]', () => triggerAction('shell', AT_ID));

    await step('open stock window (GUI-01) on /s', async () => {
      await probe(app, `await get('CommandRegistry').executeCommand('powerbrowser.open-browser-window', ${JSON.stringify(url('/s'))}); return true;`);
      return stockTabOn(app, url('/s'), 30000);
    }, { settle: 3000 });
    const stockChrome = (await app.contexts('chrome')).find(c => c.url.startsWith('chrome://browser/content/browser.xhtml'));
    await step('install furniture ext (sidebar/pageAction/menus/browserAction) with shell admitted', async () => {
      const r = await install(extDirs[2]);
      await pollFor(() => log.find(e => e.kind === 'fu.started'), 15000, 'furniture background started');
      return r;
    }, { settle: 2500 });
    await step('fu: browserAction.setBadgeText global "X" (stock button must show it)', () => fu('setBadgeGlobal', { text: 'X' }));
    await step('fu: menus.create', () => fu('menusCreate'));
    await step('fu: sessions.getRecentlyClosed', () => fu('recentlyClosed'));
    await step('fu: pageAction.show(overlay B)', () => fu('pageActionShow', { tabId: idB }));
    await step('fu: tabs.getZoom(overlay B)', () => fu('getZoom', { tabId: idB }));
    await step('fu: sidebarAction.isOpen', () => fu('sidebarIsOpen'));
    await step('fu: tabs.onZoomChange.addListener', () => fu('zoomListen'));
    await step('fu: browserAction.setBadgeText global "Y" (again, after the zoom listener)', () => fu('setBadgeGlobal', { text: 'Y' }));
    await step('browserAction triggerAction(stock) [activeTab-only ext]', () => triggerAction(stockChrome && stockChrome.context, AT_ID));
    await step('focus shell window, activate overlay B', async () => { await app.evaluateIn(app.chrome, 'window.focus(); true'); return activate(B); });
    await step('browserAction triggerAction(shell) with stock window open [activeTab-only ext]', () => triggerAction('shell', AT_ID));
    await step('bg: tabs.executeScript on the active tab (stock window open, shell focused)', () => bg('executeScriptActive'));
    await step('close overlay A', () => probe(app, `get('WebTabChannel').widgetOf(${JSON.stringify(A)}).close(); return true;`), { settle: 2500 });
    await step('close overlay B', () => probe(app, `get('WebTabChannel').widgetOf(${JSON.stringify(B)}).close(); return true;`), { settle: 2500 });
    await step('after last overlay closed: active-tab query stack', async () => JSON.parse(await app.evaluateIn(app.chrome, QUERY_STACKS)));
  });
} finally {
  results.finishedAt = new Date().toISOString();
  const out = join(HERE, CONTROL ? 'results-control.json' : NO_GUARDS ? 'results-noguards.json' : 'results.json');
  await writeFile(out, JSON.stringify(results, null, 2));
  console.log(`wrote ${out} (${log.length} log entries, ${results.steps.length} steps)`);
  await profile.dispose();
  for (const d of extDirs) await rm(d, { recursive: true, force: true });
  server.close();
}
