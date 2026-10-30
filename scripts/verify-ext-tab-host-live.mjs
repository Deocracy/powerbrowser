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
// Scenarios (Task 2): query, sender, webrequest.
// Scenarios (Task 3): events, active-tab, ide-retain, focus-follow, window-type,
// execute. The probe extension is written from the literals in this file into a
// temporary directory, and removed when the run ends.
//
//   node scripts/verify-ext-tab-host-live.mjs [--scenario a,b] [--self-test]
//
// Node built-ins plus ./lib/pb-relaunch.mjs and ./lib/pb-live-probe.mjs only.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withProbeShell, openWebTab } from './lib/pb-live-probe.mjs';
import { REPO_ROOT } from './lib/pb-relaunch.mjs';

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
};

// Every record goes to the harness's /log endpoint. Commands arrive on /cmd.
const BACKGROUND = `
const ORIGIN = __ORIGIN__;
const post = rec => fetch(ORIGIN + '/log', { method: 'POST', body: JSON.stringify(rec) }).catch(() => {});
const brief = t => t && { id: t.id, url: t.url, windowId: t.windowId, active: t.active, title: t.title, favIconUrl: t.favIconUrl, status: t.status };
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
`;

// ---------------------------------------------------------------------------
// The served origin: /a, /b, /c and /d are pages with an icon link; /cmd and /log are the probe channel.
// ---------------------------------------------------------------------------

let session = { logs: [], queue: [] };
let opSeq = 0;

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

function resetSession() {
  session = { logs: [], queue: [] };
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

async function installProbe(app) {
  const dir = await mkdtemp(join(tmpdir(), 'pb-ext-tab-host-probe-'));
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(MANIFEST));
  await writeFile(join(dir, 'background.js'), BACKGROUND.replace('__ORIGIN__', JSON.stringify(ORIGIN)));
  await writeFile(join(dir, 'content.js'), CONTENT);
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
  if (installed.error || installed.id !== EXT_ID) {
    throw new Error(`BROKEN INSTRUMENT: the probe extension did not install: ${JSON.stringify(installed)}`);
  }
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

const SCENARIOS = {
  query: scenarioQuery,
  sender: scenarioSender,
  webrequest: scenarioWebrequest,
};

// Each plant names its scenario, the expected red text, and the chrome-scope mutation.
const PLANTS = {
  'theia-in-tabs': { scenario: 'query', expect: 'Theia frame visible to extensions', body: PLANT_THEIA_IN_TABS },
  'no-tab-for-browser': { scenario: 'sender', expect: 'sender.tab missing', body: PLANT_NO_TAB_FOR_BROWSER },
  'no-tab-for-browser-net': { scenario: 'webrequest', expect: 'network event carried tabId -1', body: PLANT_NO_TAB_FOR_BROWSER },
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
  const probeDir = { value: null };
  try {
    return await withProbeShell(
      async app => {
        probeDir.value = await installProbe(app);
        const theia = await waitForTheiaOrigin(app);
        if (plant) {
          const applied = await chromeJson(app, plant.body);
          if (!applied.landed) {
            throw new Error(`BROKEN INSTRUMENT: plant ${plantName} did not land`);
          }
        }
        return await SCENARIOS[scenarioName]({ app, theia });
      },
      { extraPrefs: { 'xpinstall.signatures.required': false, 'extensions.logging.enabled': true } }
    );
  } catch (error) {
    const text = error && error.message ? error.message : String(error);
    if (text.startsWith('BROKEN INSTRUMENT')) return { broken: true, ok: false, detail: null, fail: text };
    return { ok: false, detail: null, fail: text };
  } finally {
    if (probeDir.value) await rm(probeDir.value, { recursive: true, force: true });
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
        console.log(`  ok  plant ${plantName} -> red, naming '${plant.expect}'`);
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
