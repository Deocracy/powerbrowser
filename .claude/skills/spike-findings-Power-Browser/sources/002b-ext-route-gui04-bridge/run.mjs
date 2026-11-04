// Spike 002b driver: the GUI-04 mirror/proxy bridge route for WebExtension tab visibility.
// Opens a stock navigator:browser window from the shell (hidden where the platform allows),
// gives each overlay web tab a "twin" tab in that window, keeps the twin selected when its
// overlay is active, and records what a test extension sees and what breaks.
// Throwaway; reuses the repo harness without modifying it. Product files are not edited:
// the shell gBrowser stand-in is patched at runtime only, inside this run's own browser.
//
//   node .planning/spikes/002b-ext-route-gui04-bridge/run.mjs --mode eager   # twin loads the URL itself
//   node .planning/spikes/002b-ext-route-gui04-bridge/run.mjs --mode lazy    # lazy twin + stand-in maps overlay -> twin
//   node .planning/spikes/002b-ext-route-gui04-bridge/run.mjs --mode rewire  # lazy twin whose linkedBrowser IS the overlay
//   node .planning/spikes/002b-ext-route-gui04-bridge/run.mjs --mode rewire-panel  # rewire, plus a fake linkedPanel so selection skips _insertBrowser
import { createServer } from 'node:http';
import { cp, mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeProfile, withShell, probe, pollFor } from '../../../scripts/lib/pb-relaunch.mjs';
import { openWebTab, inChrome } from '../../../scripts/lib/pb-live-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT_ID = 'spike002b-bridge@powerbrowser.test';
const MODE = process.argv[process.argv.indexOf('--mode') + 1];
if (!['eager', 'lazy', 'rewire', 'rewire-panel'].includes(MODE)) throw new Error('--mode eager|lazy|rewire|rewire-panel');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- local server: nonce pages (title = per-request nonce), /log sink, /cmd queue ------------
const log = [];
const steps = [];
const hits = {};
let queue = [];
let cmdSeq = 0;
let nonce = 0;
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'POST' && u.pathname === '/log') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { try { log.push({ step: steps.length, ...JSON.parse(body) }); } catch { log.push({ bad: body }); } res.writeHead(204); res.end(); });
    return;
  }
  if (u.pathname === '/cmd') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(queue));
    queue = [];
    return;
  }
  if (u.pathname === '/r') {
    const key = u.search || '?';
    hits[key] = (hits[key] || 0) + 1;
    const n = `nonce-${++nonce}`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(`<!doctype html><title>${n}</title><body>page ${key} load ${n}</body>`);
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const url = q => `${ORIGIN}/r?${q}`;

// inChrome (pb-live-probe.mjs) with an async body, for steps that must wait chrome-side.
const inChromeAsync = (a, body) => a.evaluateIn(a.chrome, `(async () => {
  const W = ChromeUtils.importESModule('chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs').PowerBrowserWebTabs;
  const overlayOf = tabId => [...document.querySelectorAll('browser')].find(b => W.tabIdOfBrowser(b) === tabId) || null;
  ${body}
})()`);

async function bg(op, args = {}, timeoutMs = 10000) {
  const id = ++cmdSeq;
  queue.push({ id, op, args });
  const hit = await pollFor(() => log.find(e => e.kind === 'cmd-result' && e.data.id === id), timeoutMs, `bg op ${op}`);
  return hit.data.r;
}

// --- the mirror: chrome-side, in the shell window (window.__m) --------------------------------
const MIRROR_INIT = `
  const { AppConstants } = ChromeUtils.importESModule('resource://gre/modules/AppConstants.sys.mjs');
  const args = Cc['@mozilla.org/supports-string;1'].createInstance(Ci.nsISupportsString);
  args.data = 'about:blank';
  const w = Services.ww.openWindow(null, AppConstants.BROWSER_CHROME_URL, '_blank', 'chrome,all,dialog=no', args);
  await new Promise(r => { const o = s => { if (s === w) { Services.obs.removeObserver(o, 'browser-delayed-startup-finished'); r(); } }; Services.obs.addObserver(o, 'browser-delayed-startup-finished'); });
  const base = w.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow);
  let hideErr = null;
  try { base.visibility = false; } catch (e) { hideErr = String(e); }
  window.__m = { w, mode: ${JSON.stringify(MODE)}, twins: new Map(), errors: [] };
  if (window.__m.mode !== 'eager') {
    // Runtime-only patch of the stand-in (powerbrowser.js:84-91): overlay -> its twin tab.
    window.__m.origGetTab = window.gBrowser.getTabForBrowser;
    window.gBrowser.getTabForBrowser = b => { for (const t of window.__m.twins.values()) if (t.overlay === b) return t.tab; return null; };
  }
  return JSON.stringify({ windowtype: w.document.documentElement.getAttribute('windowtype'), chromeUrl: AppConstants.BROWSER_CHROME_URL,
    visibilityAfterHide: base.visibility, hideErr, headless: Cc['@mozilla.org/gfx/info;1'].getService(Ci.nsIGfxInfo).isHeadless ?? null });`;

const mirrorAdd = tabId => `
  const m = window.__m; const o = overlayOf(${JSON.stringify(tabId)});
  const sys = Services.scriptSecurityManager.getSystemPrincipal();
  const tab = m.w.gBrowser.addTab(o.currentURI.spec, { triggeringPrincipal: sys, createLazyBrowser: m.mode !== 'eager', skipAnimation: true });
  const r = { lazyBrowserReplaced: false };
  if (m.mode.startsWith('rewire')) { try { tab.linkedBrowser = o; r.lazyBrowserReplaced = tab.linkedBrowser === o; } catch (e) { r.rewireErr = String(e); } }
  // _insertBrowser returns early when linkedPanel is set (tabbrowser.js:2948); it would otherwise append getPanel(overlay).
  if (m.mode === 'rewire-panel') tab.linkedPanel = 'pb-spike-fake-panel-' + ${JSON.stringify(tabId)};
  m.twins.set(${JSON.stringify(tabId)}, { tab, overlay: o });
  return r;`;

const mirrorSelect = tabId => `
  const m = window.__m; const t = m.twins.get(${JSON.stringify(tabId)});
  try { m.w.gBrowser.selectedTab = t.tab; return { selected: m.w.gBrowser.selectedTab === t.tab }; }
  catch (e) { m.errors.push(String(e)); return { selectErr: String(e), stack: e.stack }; }`;

const mirrorRemove = tabId => `
  const m = window.__m; const t = m.twins.get(${JSON.stringify(tabId)});
  try { m.w.gBrowser.removeTab(t.tab, { animate: false }); } catch (e) { return { removeErr: String(e) }; }
  m.twins.delete(${JSON.stringify(tabId)});
  await new Promise(r => setTimeout(r, 500));
  return { overlayStillConnected: t.overlay.isConnected, overlayInShell: t.overlay.ownerDocument === document,
    overlayUrl: t.overlay.isConnected ? t.overlay.currentURI.spec : null, overlayHasFrameLoader: !!t.overlay.frameLoader };`;

// Chrome-side ground truth per step.
const GROUND = `
  const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
  const { BrowserWindowTracker } = ChromeUtils.importESModule('resource:///modules/BrowserWindowTracker.sys.mjs');
  const g = ExtensionParent.apiManager.global;
  const m = window.__m;
  const bd = b => { try { return g.tabTracker.getBrowserData(b); } catch (e) { return { err: String(e) }; } };
  const overlays = [...document.querySelectorAll('browser')].filter(b => W.tabIdOfBrowser(b) !== null);
  const twinOf = b => m ? [...m.twins.values()].find(t => t.overlay === b) : null;
  return JSON.stringify({
    topWindowIsHidden: m ? g.windowTracker.topWindow === m.w : null,
    browserWindowTrackerTopIsHidden: m ? BrowserWindowTracker.getTopWindow() === m.w : null,
    hiddenSelected: m ? { url: m.w.gBrowser.selectedBrowser?.currentURI?.spec ?? null, isOverlay: overlays.includes(m.w.gBrowser.selectedBrowser) } : null,
    hiddenTabCount: m ? m.w.gBrowser.tabs.length : null,
    mirrorErrors: m ? m.errors : null,
    overlays: overlays.map(b => {
      const t = twinOf(b);
      const tw = t && t.tab;
      const twb = tw && tw.linkedBrowser;
      return {
        pbTabId: W.tabIdOfBrowser(b), url: b.currentURI.spec, nonce: b.contentTitle, visible: b.style.visibility,
        docShellIsActive: b.docShellIsActive, renderLayers: b.renderLayers, inShell: b.ownerDocument === document,
        parentIds: [b.parentNode && b.parentNode.id, b.parentNode && b.parentNode.parentNode && b.parentNode.parentNode.id],
        getBrowserData: bd(b),
        twin: tw ? { extTabId: g.tabTracker.getId(tw), selected: tw.selected, linkedPanel: tw.linkedPanel || null,
          linkedBrowserIsOverlay: twb === b, url: twb && twb.currentURI ? twb.currentURI.spec : null,
          nonce: twb && twb !== b ? (twb.contentTitle ?? null) : null, label: tw.label,
          lazy: !twb || !twb.isConnected } : null,
      };
    }),
  });`;

async function step(name, action, { settle = 1500, snap = true } = {}) {
  steps.push(name);
  const record = { name, index: steps.length };
  try { record.action = action ? await action() : null; } catch (e) { record.actionError = String(e && e.message || e); }
  await sleep(settle);
  record.ground = JSON.parse(await inChrome(app, GROUND));
  if (snap) record.snapshot = await bg('snapshot', { label: name });
  record.hits = { ...hits };
  results.steps.push(record);
  console.log(`step ${record.index}: ${name}${record.actionError ? ` (action error: ${record.actionError})` : ''}`);
  return record;
}

const results = { mode: MODE, origin: ORIGIN, extId: EXT_ID, startedAt: new Date().toISOString(), steps: [], log, hits };
let app;
const extDir = await mkdtemp(join(tmpdir(), 'pb-spike002b-ext-'));
await cp(join(HERE, 'extension'), extDir, { recursive: true });
await writeFile(join(extDir, 'config.js'), `var ORIGIN = ${JSON.stringify(ORIGIN)};\n`);
const profile = await makeProfile();
await appendFile(join(profile.profileDir, 'user.js'), 'user_pref("xpinstall.signatures.required", false);\n');

// Asks the extension, for its active tab, what page it reaches (executeScript + sendMessage).
async function reach(label) {
  return step(`ext reaches active tab: ${label}`, async () => {
    const active = await bg('activeTab');
    const id = active.ok && active.ok[0] && active.ok[0].id;
    return { active, executeScript: id != null ? await bg('executeScriptTab', { tabId: id }) : 'no active tab',
      sendMessage: id != null ? await bg('sendMessageTab', { tabId: id }) : 'no active tab' };
  }, { snap: false });
}

try {
  await withShell(profile, async a => {
    app = a;
    results.install = JSON.parse(await app.evaluateIn(app.chrome, `(async () => {
      try {
        const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
        const f = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
        f.initWithPath(${JSON.stringify(extDir)});
        const addon = await AddonManager.installTemporaryAddon(f);
        return JSON.stringify({ id: addon.id, isActive: addon.isActive });
      } catch (e) { return JSON.stringify({ error: String(e) }); }
    })()`));
    if (results.install.error) throw new Error(`install failed: ${results.install.error}`);
    await pollFor(() => log.find(e => e.kind === 'started'), 15000, 'background started');

    await step('open hidden stock window (the bridge host)', async () => JSON.parse(await app.evaluateIn(app.chrome, `(async () => { ${MIRROR_INIT} })()`)), { settle: 2000 });
    const A = await openWebTab(app, url('a'));
    await step('open overlay A', null, { settle: 2500 });
    await step('mirror: add twin for A', () => inChrome(app, mirrorAdd(A)), { settle: 2500 });
    const B = await openWebTab(app, url('b'));
    await step('open overlay B', null, { settle: 2500 });
    await step('mirror: add twin for B', () => inChrome(app, mirrorAdd(B)), { settle: 2500 });
    await step('ext reaches each twin by id (no selection involved)', async () => {
      const all = await bg('snapshot', { label: 'ids' });
      const ids = (all.ok?.queryAll?.ok || []).map(t => t.id);
      const out = {};
      for (const id of ids) out[id] = { executeScript: await bg('executeScriptTab', { tabId: id }), sendMessage: await bg('sendMessageTab', { tabId: id }) };
      return out;
    }, { snap: false });
    const activate = id => probe(app, `await get('ApplicationShell').activateWidget(get('WebTabChannel').widgetOf(${JSON.stringify(id)}).id); return true;`);
    await step('activate overlay A + mirror select twin A', async () => ({ theia: await activate(A), mirror: await inChrome(app, mirrorSelect(A)) }), { settle: 2500 });
    await reach('A active');
    await step('activate overlay B + mirror select twin B', async () => ({ theia: await activate(B), mirror: await inChrome(app, mirrorSelect(B)) }), { settle: 2500 });
    await reach('B active');
    await step('navigate overlay B to ?b2 (no mirror propagation)', () => probe(app, `return await get('WebTabChannel').widgetOf(${JSON.stringify(B)}).navigate(${JSON.stringify(url('b2'))});`), { settle: 2500 });
    if (MODE === 'eager') {
      await step('mirror: propagate B navigation to its twin (eager: twin loads it again)', () => inChrome(app, `
        const t = window.__m.twins.get(${JSON.stringify(B)});
        t.tab.linkedBrowser.fixupAndLoadURIString(t.overlay.currentURI.spec, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); return true;`), { settle: 2500 });
    }
    await reach('B active after navigation');
    await step('browserAction triggerAction(hidden window)', () => app.evaluateIn(app.chrome, `(() => {
      try {
        const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
        const ext = WebExtensionPolicy.getByID(${JSON.stringify(EXT_ID)}).extension;
        ExtensionParent.apiManager.global.browserActionFor(ext).triggerAction(window.__m.w);
        const node = window.__m.w.document.querySelector('[data-extensionid=${JSON.stringify(EXT_ID)}]');
        return { returned: true, buttonInHiddenWindow: !!node, buttonInShell: !!document.querySelector('[data-extensionid=${JSON.stringify(EXT_ID)}]') };
      } catch (e) { return 'threw: ' + e; }
    })()`), { settle: 1500 });
    await step('side effects: session store, external-link target', () => app.evaluateIn(app.chrome, `(() => {
      const { SessionStore } = ChromeUtils.importESModule('resource:///modules/sessionstore/SessionStore.sys.mjs');
      let ss; try { const s = JSON.parse(SessionStore.getBrowserState()); ss = { windows: s.windows.length, tabsPerWindow: s.windows.map(w => w.tabs.length), urls: s.windows.flatMap(w => w.tabs.map(t => t.entries.at(-1)?.url)) }; } catch (e) { ss = String(e); }
      const { BrowserWindowTracker } = ChromeUtils.importESModule('resource:///modules/BrowserWindowTracker.sys.mjs');
      return { sessionStore: ss, externalLinkTargetIsHidden: BrowserWindowTracker.getTopWindow() === window.__m.w,
        mostRecentNavigatorBrowserIsHidden: Services.wm.getMostRecentWindow('navigator:browser') === window.__m.w };
    })()`), { snap: false });
    await step('mirror: remove twin B (before closing overlay B)', () => inChromeAsync(app, mirrorRemove(B)), { settle: 2000 });
    await step('close overlay B', () => probe(app, `get('WebTabChannel').widgetOf(${JSON.stringify(B)}).close(); return true;`), { settle: 2500 });
  });
} finally {
  results.finishedAt = new Date().toISOString();
  const out = join(HERE, `results-${MODE}.json`);
  await writeFile(out, JSON.stringify(results, null, 2));
  console.log(`wrote ${out} (${log.length} log entries, ${results.steps.length} steps)`);
  await profile.dispose();
  await rm(extDir, { recursive: true, force: true });
  server.close();
}
