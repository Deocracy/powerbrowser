// Spike 001 driver: installs extension/ as a temporary add-on in a fresh
// PowerBrowser profile, drives overlay web tabs and one stock window, and
// writes every extension-side event plus chrome-side ground truth to
// results.json. Throwaway; reuses the repo harness without modifying it.
//
//   node .planning/spikes/001-ext-visibility-today/run.mjs
import { createServer } from 'node:http';
import { cp, mkdtemp, writeFile, readFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeProfile, withShell, probe, pollFor, stockTabOn } from '../../../scripts/lib/pb-relaunch.mjs';
import { openWebTab, inChrome } from '../../../scripts/lib/pb-live-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT_ID = 'spike001-tab-visibility@powerbrowser.test';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- local server: pages, /log sink, /cmd queue --------------------------------
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
  if (path === '/cmd') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(queue));
    queue = [];
    return;
  }
  if (/^\/[a-z]$/.test(path)) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>page ${path}</title><body>spike page ${path}</body>`);
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

// Chrome-side ground truth: what the extension trackers themselves answer for each overlay.
const GROUND = `
  const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
  const g = ExtensionParent.apiManager.global;
  const overlays = [...document.querySelectorAll('browser')].filter(b => W.tabIdOfBrowser(b) !== null);
  const theia = document.getElementById('powerbrowser-content');
  const mr = Services.wm.getMostRecentWindow(null);
  const bd = b => { try { return g.tabTracker.getBrowserData(b); } catch (e) { return { err: String(e) }; } };
  return JSON.stringify({
    shellIsBrowserWindow: g.windowTracker.isBrowserWindow(window),
    shellWindowTrackerId: g.windowTracker.getId(window) ?? null,
    topWindow: g.windowTracker.topWindow ? g.windowTracker.topWindow.document.documentElement.getAttribute('windowtype') : null,
    mostRecentAnyWindowtype: mr && mr.document.documentElement.getAttribute('windowtype'),
    activeTabUrl: g.tabTracker.activeTab ? g.tabTracker.activeTab.linkedBrowser.currentURI.spec : null,
    theiaFrame: { mmGroup: theia.getAttribute('messagemanagergroup'), getBrowserData: bd(theia), url: theia.currentURI.spec },
    overlays: overlays.map(b => ({
      pbTabId: W.tabIdOfBrowser(b), url: b.currentURI.spec, visible: b.style.visibility,
      mmGroup: b.getAttribute('messagemanagergroup'), bcId: b.browsingContext.id,
      getTabForBrowser: g.tabTracker.getTabForBrowser(b), getBrowserData: bd(b),
    })),
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
}

const results = { origin: ORIGIN, extId: EXT_ID, startedAt: new Date().toISOString(), install: null, steps: [], log };
let app;

const extDir = await mkdtemp(join(tmpdir(), 'pb-spike001-ext-'));
await cp(join(HERE, 'extension'), extDir, { recursive: true });
const MV3 = process.argv.includes('--mv3');
if (MV3) {
  // Same scripts; only the manifest changes (Firefox MV3 keeps background.scripts as an event page).
  const m = JSON.parse(await readFile(join(extDir, 'manifest.json'), 'utf8'));
  m.manifest_version = 3;
  m.permissions = ['tabs', 'webNavigation', 'webRequest', 'scripting'];
  m.host_permissions = ['<all_urls>'];
  m.background = { scripts: m.background.scripts };
  m.action = m.browser_action; delete m.browser_action;
  await writeFile(join(extDir, 'manifest.json'), JSON.stringify(m, null, 2));
}
await writeFile(join(extDir, 'config.js'), `var ORIGIN = ${JSON.stringify(ORIGIN)};\n`);

const profile = await makeProfile();
// Belt and braces for a temporary install; recorded either way in results.install.
await appendFile(join(profile.profileDir, 'user.js'), 'user_pref("xpinstall.signatures.required", false);\nuser_pref("extensions.logging.enabled", true);\n'
  // MV3 event page: keep it alive for the whole run so the /cmd poll keeps answering.
  + 'user_pref("extensions.background.idle.timeout", 600000);\n');

try {
  await withShell(profile, async a => {
    app = a;
    // Install: temporary add-on via the chrome-scope AddonManager.
    results.install = JSON.parse(await app.evaluateIn(app.chrome, `(async () => {
      try {
        const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
        const f = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
        f.initWithPath(${JSON.stringify(extDir)});
        const addon = await AddonManager.installTemporaryAddon(f);
        return JSON.stringify({ route: 'AddonManager.installTemporaryAddon', id: addon.id, isActive: addon.isActive, temporarilyInstalled: addon.temporarilyInstalled,
          signaturesRequiredPref: Services.prefs.getBoolPref('xpinstall.signatures.required', true),
          requireSigningBuild: ChromeUtils.importESModule("resource://gre/modules/AppConstants.sys.mjs").AppConstants.MOZ_REQUIRE_SIGNING });
      } catch (e) { return JSON.stringify({ route: 'AddonManager.installTemporaryAddon', error: String(e) }); }
    })()`));
    console.log('install:', JSON.stringify(results.install));
    if (results.install.error) throw new Error(`install failed: ${results.install.error}`);
    await pollFor(() => log.find(e => e.kind === 'started'), 15000, 'background started');

    await step('baseline: shell only, no overlay, no stock window', null);
    results.noBrowserWindowStacks = await chromeStacks();
    const A = await step0('open overlay A on /a', () => openWebTab(app, url('/a')));
    const B = await step0('open overlay B on /b', () => openWebTab(app, url('/b')));
    const activate = id => probe(app, `await get('ApplicationShell').activateWidget(get('WebTabChannel').widgetOf(${JSON.stringify(id)}).id); return true;`);
    await step('activate overlay A', () => activate(A));
    await step('activate overlay B', () => activate(B));
    await step('navigate overlay B to /c', () => probe(app, `return await get('WebTabChannel').widgetOf(${JSON.stringify(B)}).navigate(${JSON.stringify(url('/c'))});`), { settle: 2500 });
    await step('bg: tabs.executeScript on the active tab (no stock window)', async () => bg('executeScriptActive'));
    await step('bg: ping every content-script port', async () => bg('pingPorts'));
    await step('browserAction triggerAction(shell window)', () => triggerAction('window'));
    await step('close overlay A', () => probe(app, `get('WebTabChannel').widgetOf(${JSON.stringify(A)}).close(); return true;`), { settle: 2500 });

    // GUI-01 stock window via the Theia command.
    await step('open stock window (GUI-01) on /s', async () => {
      await probe(app, `await get('CommandRegistry').executeCommand('powerbrowser.open-browser-window', ${JSON.stringify(url('/s'))}); return true;`);
      return stockTabOn(app, url('/s'), 30000);
    }, { settle: 3000 });
    const stockChrome = (await app.contexts('chrome')).find(c => c.url.startsWith('chrome://browser/content/browser.xhtml'));
    results.stockChromeContext = stockChrome || null;
    await step('browserAction: widget node presence per window', async () => ({
      shell: await app.evaluateIn(app.chrome, `!!document.querySelector('[data-extensionid=${JSON.stringify(EXT_ID)}]')`),
      stock: stockChrome ? await app.evaluateIn(stockChrome.context, `(() => { const n = document.querySelector('[data-extensionid=${JSON.stringify(EXT_ID)}]'); return n ? { id: n.id, area: n.closest('toolbar,panelview,#unified-extensions-area')?.id || null } : null; })()`) : 'no stock chrome context',
    }));
    await step('browserAction triggerAction(stock window)', () => triggerAction(stockChrome && stockChrome.context));
    await step('browserAction triggerAction(shell window) with a stock window open', () => triggerAction('window'));
    await step('focus shell window, activate overlay B (user is looking at an overlay)', async () => {
      await app.evaluateIn(app.chrome, 'window.focus(); true');
      return activate(B);
    });
    await step('browserAction triggerAction(stock window) while overlay B is what the user sees', () => triggerAction(stockChrome && stockChrome.context));
    await step('bg: tabs.executeScript on the active tab (stock window open)', async () => bg('executeScriptActive'));
    const stockTabId = results.steps.at(-1).snapshot.ok?.queryAll?.ok?.[0]?.id;
    await step('bg: tabs.sendMessage to stock tab id', async () => bg('sendMessageTab', { tabId: stockTabId ?? -1 }));
    await step('bg: tabs.sendMessage to -1 (overlay id)', async () => bg('sendMessageTab', { tabId: -1 }));
    await step('close overlay B', () => probe(app, `get('WebTabChannel').widgetOf(${JSON.stringify(B)}).close(); return true;`), { settle: 2500 });
  });
} finally {
  results.finishedAt = new Date().toISOString();
  await writeFile(join(HERE, MV3 ? 'results-mv3.json' : 'results.json'), JSON.stringify(results, null, 2));
  console.log(`wrote ${join(HERE, MV3 ? 'results-mv3.json' : 'results.json')} (${log.length} log entries, ${results.steps.length} steps)`);
  await profile.dispose();
  await rm(extDir, { recursive: true, force: true });
  server.close();
}

// The real exception behind the background's sanitised "An unexpected error occurred":
// the same calls, made chrome-side with the extension's own background context.
async function chromeStacks() {
  return JSON.parse(await app.evaluateIn(app.chrome, `(() => {
    const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
    const g = ExtensionParent.apiManager.global;
    const ext = WebExtensionPolicy.getByID(${JSON.stringify(EXT_ID)}).extension;
    const ctx = [...ext.views].find(v => v.viewType === 'background') || null;
    // Schema normalisation hands the parent every absent queryInfo key as null; mimic it.
    const q = o => new Proxy(o, { get: (t, k) => (k in t ? t[k] : null), has: () => true });
    const run = fn => { try { return { ok: JSON.stringify(fn()) }; } catch (e) { return { err: String(e), stack: e.stack }; } };
    return JSON.stringify({
      haveBackgroundContext: !!ctx,
      tabsQueryActiveCurrent: run(() => [...ext.tabManager.query(q({ active: true, currentWindow: true }), ctx)].length),
      tabsQueryActiveLastFocused: run(() => [...ext.tabManager.query(q({ active: true, lastFocusedWindow: true }), ctx)].length),
      canAccessWindowTop: run(() => ctx.canAccessWindow(g.windowTracker.topWindow)),
    });
  })()`));
}

// step0: a step whose action's return value (a Theia tab id) the caller needs.
async function step0(name, action) {
  let value;
  await step(name, async () => (value = await action()), { settle: 2500 });
  return value;
}

// Runs the extension's own click path (ext-browserAction.js triggerAction) in `target`:
// 'window' = the shell document, or a BiDi chrome context id for the stock window.
async function triggerAction(target) {
  const expr = `(() => {
    try {
      const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
      const g = ExtensionParent.apiManager.global;
      const ext = WebExtensionPolicy.getByID(${JSON.stringify(EXT_ID)}).extension;
      g.browserActionFor(ext).triggerAction(window);
      return 'returned';
    } catch (e) { return 'threw: ' + e; }
  })()`;
  const ctx = target === 'window' ? app.chrome : target;
  if (!ctx) return 'no stock chrome context';
  const r = await app.evaluateIn(ctx, expr);
  await sleep(800);
  return r;
}
