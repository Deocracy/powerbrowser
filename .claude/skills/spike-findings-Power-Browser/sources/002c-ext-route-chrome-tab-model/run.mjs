// Spike 002c driver: installs the throwaway chrome-side tab model
// (tab-model.js) into a PowerBrowser it launched, installs extension/ as a
// temporary add-on, and records what the extension sees at each layer of the
// model. Reuses the repo harness without modifying it.
//
//   node .planning/spikes/002c-ext-route-chrome-tab-model/run.mjs           # layers added one at a time, late
//   node .planning/spikes/002c-ext-route-chrome-tab-model/run.mjs --early   # full model before the extension starts
import { createServer } from 'node:http';
import { cp, mkdtemp, writeFile, readFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeProfile, withShell, probe, pollFor, stockTabOn } from '../../../scripts/lib/pb-relaunch.mjs';
import { openWebTab, inChrome } from '../../../scripts/lib/pb-live-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT_ID = 'spike002c-tab-model@powerbrowser.test';
const EARLY = process.argv.includes('--early');
const OUT = join(HERE, EARLY ? (process.argv.includes('--gate-always') ? 'results-early-gate-always.json' : process.argv.includes('--rebackfill') ? 'results-early-rebackfill.json' : 'results-early.json') : 'results-incremental.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGklEQVQ4T2NkYPj/n4GBgYGJgUIwasCoAQMBAH7tAiFq0a4fAAAAAElFTkSuQmCC', 'base64');

const log = [];
const steps = [];
let queue = [];
let cmdSeq = 0;
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (req.method === 'POST' && path === '/log') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { try { log.push({ step: steps.length, ...JSON.parse(body) }); } catch { log.push({ bad: body }); } res.writeHead(204, { 'access-control-allow-origin': '*' }); res.end(); });
    return;
  }
  if (path === '/cmd') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(queue)); queue = []; return; }
  if (path === '/icon.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(PNG); return; }
  if (path === '/os.xml') {
    res.writeHead(200, { 'content-type': 'application/opensearchdescription+xml' });
    res.end('<?xml version="1.0"?><OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"><ShortName>Spike</ShortName><Url type="text/html" template="http://127.0.0.1/?q={searchTerms}"/></OpenSearchDescription>');
    return;
  }
  if (path === '/f') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>page /f</title><link rel="icon" type="image/png" href="/icon.png"><link rel="search" type="application/opensearchdescription+xml" title="Spike" href="/os.xml"><body>favicon page</body>');
    return;
  }
  if (/^\/[a-z]$/.test(path)) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><title>page ${path}</title><body>spike page ${path}</body>`); return; }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const url = p => `${ORIGIN}${p}`;

async function bg(op, args = {}, timeoutMs = 10000) {
  const id = ++cmdSeq;
  queue.push({ id, op, args });
  try {
    const hit = await pollFor(() => log.find(e => e.kind === 'cmd-result' && e.data.id === id), timeoutMs, `bg op ${op}`);
    return hit.data.r;
  } catch (e) { return { driverTimeout: String(e.message) }; }
}

const GROUND = `
  const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
  const g = ExtensionParent.apiManager.global;
  const wt = g.windowTracker, tt = g.tabTracker;
  const theia = document.getElementById('powerbrowser-content');
  const overlays = [...document.querySelectorAll('browser')].filter(b => W.tabIdOfBrowser(b) !== null);
  const bd = b => { try { return tt.getBrowserData(b); } catch (e) { return { err: String(e) }; } };
  const top = (() => { try { const w = wt.topWindow; return w ? w.document.documentElement.getAttribute('windowtype') : null; } catch (e) { return 'threw ' + e; } })();
  let active = null; try { active = tt.activeTab ? tt.activeTab.linkedBrowser.currentURI.spec : null; } catch (e) { active = 'threw ' + e; }
  return JSON.stringify({
    flags: window.__spike002c ? window.__spike002c.flags() : null,
    shellIsBrowserWindow: wt.isBrowserWindow(window),
    shellWindowId: wt.getId(window),
    topWindow: top, activeTabUrl: active,
    theia: bd(theia),
    overlays: overlays.map(b => ({ pbTabId: W.tabIdOfBrowser(b), url: b.currentURI.spec, visible: b.style.visibility,
      tabNode: !!(window.__spike002c && window.__spike002c.nodeOf(b)), getBrowserData: bd(b) })),
  });`;

const results = { mode: EARLY ? 'early' : 'incremental', origin: ORIGIN, extId: EXT_ID, startedAt: new Date().toISOString(), steps: [], log };
let app;

async function step(name, action, { settle = 1500 } = {}) {
  steps.push(name);
  const rec = { name, index: steps.length, stage: currentStage };
  try { rec.action = action ? await action() : null; } catch (e) { rec.actionError = String(e && e.message || e); }
  await sleep(settle);
  try { rec.ground = JSON.parse(await inChrome(app, GROUND)); } catch (e) { rec.groundError = String(e.message || e); }
  rec.snapshot = await bg('snapshot', { label: name });
  results.steps.push(rec);
  console.log(`step ${rec.index} [${currentStage}]: ${name}${rec.actionError ? ` (action error: ${rec.actionError})` : ''}`);
  return rec;
}
let currentStage = 'none';
const chromeEval = expr => app.evaluateIn(app.chrome, expr);
const setStage = async (label, layer) => {
  currentStage = label;
  return JSON.parse(await chromeEval(`(() => { window.__spike002cStage = ${JSON.stringify(label)}; return JSON.stringify(${layer ? `window.__spike002c.enable(${JSON.stringify(layer)})` : 'null'}); })()`));
};
const openTab = async p => { let id; await step(`open overlay on ${p}`, async () => (id = await openWebTab(app, url(p))), { settle: 3000 }); return id; };
const closeTab = id => step(`close overlay ${id}`, () => probe(app, `get('WebTabChannel').widgetOf(${JSON.stringify(id)}).close(); return true;`), { settle: 2000 });
const activate = id => step(`activate overlay ${id}`, () => probe(app, `await get('ApplicationShell').activateWidget(get('WebTabChannel').widgetOf(${JSON.stringify(id)}).id); return true;`));
const navigate = (id, p) => step(`navigate overlay ${id} to ${p}`, () => probe(app, `return await get('WebTabChannel').widgetOf(${JSON.stringify(id)}).navigate(${JSON.stringify(url(p))});`), { settle: 2500 });
// The extension tab id the tracker assigned to the overlay of Theia tab `pbTabId` (from the last step's ground truth).
const extIdOf = pbTabId => results.steps.at(-1).ground?.overlays?.find(o => o.pbTabId === pbTabId)?.getBrowserData?.tabId ?? -1;
const bgStep = (name, op, args) => step(`bg: ${name}`, () => bg(op, typeof args === 'function' ? args() : args));

async function triggerAction(target) {
  const ctx = target === 'shell' ? app.chrome : target;
  if (!ctx) return 'no chrome context';
  const r = await app.evaluateIn(ctx, `(() => { try {
      const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
      const ext = WebExtensionPolicy.getByID(${JSON.stringify(EXT_ID)}).extension;
      ExtensionParent.apiManager.global.browserActionFor(ext).triggerAction(window);
      return 'returned';
    } catch (e) { return 'threw: ' + e + ' @ ' + (e.stack || '').split('\\n').slice(0, 3).join(' | '); } })()`);
  await sleep(1200);
  return r;
}

const extDir = await mkdtemp(join(tmpdir(), 'pb-spike002c-ext-'));
await cp(join(HERE, 'extension'), extDir, { recursive: true });
await writeFile(join(extDir, 'config.js'), `var ORIGIN = ${JSON.stringify(ORIGIN)};\n`);
const MODEL = await readFile(join(HERE, 'tab-model.js'), 'utf8');

const profile = await makeProfile();
await appendFile(join(profile.profileDir, 'user.js'), 'user_pref("xpinstall.signatures.required", false);\n');

try {
  await withShell(profile, async a => {
    app = a;
    // What the extension framework looks like before any spike code runs.
    results.startupState = JSON.parse(await chromeEval(`(() => {
      const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
      const g = ExtensionParent.apiManager.global;
      const wt = g.windowTracker;
      return JSON.stringify({
        windowTrackerLoaded: !!wt,
        listenerTypes: wt ? [...wt._listeners.keys()] : null,
        openListeners: wt ? wt._openListeners.size : null,
        activePolicies: WebExtensionPolicy.getActiveExtensions().map(p => p.id),
        shellHasGBrowserInit: typeof window.gBrowserInit,
      });
    })()`));
    console.log('startup:', JSON.stringify(results.startupState));
    results.modelInstall = JSON.parse(await chromeEval(`(${MODEL})()`));

    if (EARLY) {
      results.registerReport = { node: await setStage('pre-install', 'node'), init: await setStage('pre-install', 'init'), register: await setStage('pre-install', 'register') };
      // Gate 'always' with no web tab made the extension fail to start (recorded in
      // results-early-gate-always.json); install under 'whenSelected'.
      if (!process.argv.includes('--gate-always')) await chromeEval(`window.__spike002c.setGate('whenSelected'); window.__spike002c.setRebackfill(${process.argv.includes('--rebackfill')})`);
    }
    results.install = JSON.parse(await chromeEval(`(async () => {
      try {
        const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
        const f = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
        f.initWithPath(${JSON.stringify(extDir)});
        const addon = await AddonManager.installTemporaryAddon(f);
        return JSON.stringify({ id: addon.id, isActive: addon.isActive });
      } catch (e) { return JSON.stringify({ error: String(e) }); }
    })()`));
    console.log('install:', JSON.stringify(results.install));
    if (results.install.error) throw new Error(`install failed: ${results.install.error}`);
    try {
      await pollFor(() => log.find(e => e.kind === 'started'), 15000, 'background started');
    } catch (e) {
      // Record why, chrome-side, before giving up.
      results.backgroundStartFailure = JSON.parse(await chromeEval(`(() => {
        const ext = WebExtensionPolicy.getByID(${JSON.stringify(EXT_ID)})?.extension;
        return JSON.stringify({ policyActive: !!ext, views: ext ? [...ext.views].map(v => v.viewType) : null,
          backgroundState: ext?.backgroundState ?? null, errors: window.__spike002c.errors });
      })()`));
      throw e;
    }

    if (!EARLY) {
      // Stage 0: model present (records calls/errors) but every layer off = today's behaviour.
      await setStage('0-today');
      let f = await openTab('/f'); let x = await openTab('/a');
      await closeTab(f); await closeTab(x);

      results.stageA = await setStage('A-node', 'node');
      f = await openTab('/f'); x = await openTab('/a');
      await bgStep('tabs.sendMessage(overlay id)', 'sendMessageTab', () => ({ tabId: extIdOf(x) }));
      await bgStep('tabs.executeScript(overlay id)', 'executeScriptTab', () => ({ tabId: extIdOf(x) }));
      await closeTab(f); await closeTab(x);

      results.stageA2 = await setStage('A2-node+init', 'init');
      f = await openTab('/f'); x = await openTab('/a');
      const idA2 = extIdOf(x);
      await bgStep('tabs.sendMessage(overlay id)', 'sendMessageTab', { tabId: idA2 });
      await bgStep('tabs.executeScript(overlay id)', 'executeScriptTab', { tabId: idA2 });
      await bgStep('tabs.get(overlay id)', 'get', { tabId: idA2 });
      await bgStep('browserAction.setBadgeText global (control: shell not registered)', 'setBadgeText', { text: 'c' });
      await bgStep('tabs.update(overlay id, {url: moz-extension page}) without registration', 'update', { tabId: idA2, props: { url: 'popup.html' } });
      await bgStep('tabs.update(overlay id, {active:true}) without registration', 'update', { tabId: idA2, props: { active: true } });
      await bgStep('tabs.remove(overlay id) without registration', 'remove', { tabId: idA2 });
      await closeTab(f); await closeTab(x);

      results.registerReport = await setStage('B-late-register', 'register');
      await step('after late registration (no overlay)', null);
      await setStage('B-late-register/theia-hidden');
      await chromeEval(`window.__spike002c.setTheiaMode('hidden')`);
      await step('Theia record hidden from getWrapper', null);
      f = await openTab('/f'); x = await openTab('/a');
      await activate(x); await activate(f);
      await navigate(x, '/c');
      await bgStep('tabs.executeScript on the active tab', 'executeScriptActive');
      await step('browserAction triggerAction(shell)', () => triggerAction('shell'));
      await closeTab(x); await closeTab(f);
    } else {
      currentStage = 'early/theia-plain';
      await chromeEval(`window.__spike002c.setGate('always')`);
      await step('baseline: shell only, Theia record plain, gate always', null);
      await chromeEval(`window.__spike002c.setTheiaMode('hidden'); window.__spike002c.setGate('whenSelected')`);
      currentStage = 'early/theia-hidden';
      await step('baseline: Theia record hidden, gate whenSelected, no web tab', null);
      await chromeEval(`window.__spike002c.setTheiaMode('plain')`);
      currentStage = 'early/theia-plain';
      const A = await openTab('/a'); const B = await openTab('/f');
      await chromeEval(`window.__spike002c.setTheiaMode('hidden')`);
      currentStage = 'early/theia-hidden';
      await step('Theia record hidden from getWrapper', null);
      await bgStep('tabs.query({windowType:normal}) + windows.getAll({windowTypes:[normal]})', 'queryNormal');
      await activate(A); await activate(B);
      await navigate(B, '/c');
      const idA = extIdOf(A); const idB = extIdOf(B);
      await bgStep('tabs.executeScript on the active tab', 'executeScriptActive');
      await bgStep('tabs.sendMessage(A)', 'sendMessageTab', { tabId: idA });
      await bgStep('tabs.executeScript(A)', 'executeScriptTab', { tabId: idA });
      await bgStep('tabs.get(A)', 'get', { tabId: idA });
      await bgStep('tabs.update(A, {active:true})', 'update', { tabId: idA, props: { active: true } });
      await bgStep('tabs.update(A, {url:/b})', 'update', { tabId: idA, props: { url: url('/b') } });
      await bgStep('tabs.update(A, {url: moz-extension page})', 'update', { tabId: idA, props: { url: 'popup.html' } });
      await bgStep('pageAction.show(A)', 'pageActionShow', { tabId: idA });
      await bgStep('tabs.create({url:/d})', 'create', { props: { url: url('/d') } });
      await step('browserAction triggerAction(shell), overlay B selected', () => triggerAction('shell'));
      await step('direct action click (action.triggerClickOrPopup on the selected overlay)', () => chromeEval(`JSON.stringify(window.__spike002c.clickAction(${JSON.stringify(EXT_ID)}))`).then(JSON.parse));
      await bgStep('browserAction.setPopup(popup.html)', 'setPopup', { popup: 'popup.html' });
      await step('browserAction triggerAction(shell) with a popup set', () => triggerAction('shell'));
      await step('direct action click with a popup set', () => chromeEval(`JSON.stringify(window.__spike002c.clickAction(${JSON.stringify(EXT_ID)}))`).then(JSON.parse));
      await bgStep('browserAction.setPopup(none)', 'setPopup', { popup: '' });

      // Edge case: what the Theia frame becomes if its record is an exposed tab.
      await chromeEval(`window.__spike002c.setTheiaMode('node')`);
      currentStage = 'early/theia-node';
      const tr = await step('Theia record exposed as a tab node', null);
      const theiaId = tr.ground?.theia?.tabId ?? -1;
      await bgStep('tabs.executeScript(Theia frame tab id)', 'executeScriptTab', { tabId: theiaId });
      await chromeEval(`window.__spike002c.setTheiaMode('hidden')`);
      currentStage = 'early/theia-hidden';

      await step('open stock window (GUI-01) on /s', async () => {
        await probe(app, `await get('CommandRegistry').executeCommand('powerbrowser.open-browser-window', ${JSON.stringify(url('/s'))}); return true;`);
        return stockTabOn(app, url('/s'), 30000);
      }, { settle: 3000 });
      const stockChrome = (await app.contexts('chrome')).find(c => c.url.startsWith('chrome://browser/content/browser.xhtml'));
      await step('focus shell window, activate overlay A', async () => { await chromeEval('window.focus(); true'); return probe(app, `await get('ApplicationShell').activateWidget(get('WebTabChannel').widgetOf(${JSON.stringify(A)}).id); return true;`); });
      await step('browserAction triggerAction(shell), stock window open', () => triggerAction('shell'));
      await step('browserAction triggerAction(stock window) while overlay A is on screen', () => triggerAction(stockChrome && stockChrome.context));
      await bgStep('browserAction.setBadgeText global (shell registered, stock window open)', 'setBadgeText', { text: 'g' });
      await bgStep('browserAction.setBadgeText on the stock tab', 'setBadgeText', () => ({ text: 's', tabId: results.steps.at(-1).snapshot?.ok?.queryAll?.ok?.find(t => t.windowId !== 1)?.id ?? -1 }));
      await step('stock window badge text', () => stockChrome ? app.evaluateIn(stockChrome.context, `(() => { const n = document.querySelector('[data-extensionid=${JSON.stringify(EXT_ID)}]'); return n ? n.getAttribute('badge') : 'no widget'; })()`) : 'no stock chrome');
      await bgStep('tabs.remove(B)', 'remove', { tabId: idB });
      await closeTab(A);
      await step('stock window still open, no web tab, gate whenSelected', null);
      results.idMap = { A, B, idA, idB, theiaId };
    }
    results.model = JSON.parse(await chromeEval(`JSON.stringify({ calls: window.__spike002c.calls, errors: window.__spike002c.errors })`));
  });
} finally {
  results.finishedAt = new Date().toISOString();
  await writeFile(OUT, JSON.stringify(results, null, 2));
  console.log(`wrote ${OUT} (${log.length} log entries, ${results.steps.length} steps)`);
  await profile.dispose();
  await rm(extDir, { recursive: true, force: true });
  server.close();
}
