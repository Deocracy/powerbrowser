#!/usr/bin/env node
// scripts/verify-extension-actions-live.mjs
//
// Phase 38 plan 01 (EXT-06, EXT-07): live proof, on the built shell with patch
// 050 and the last Theia build, that the extension bridge reads action state
// for the selected web tab and runs a click on the page on screen.
//
// Each scenario runs in its own session: a fresh profile, the fixtures of
// scripts/lib/pb-extension-fixtures.mjs installed as temporary add-ons in
// chrome scope, and the shell. A session opens at most four web tabs on this
// script's 127.0.0.1 origin; a stock-window page comes from localhost. Every
// scenario has a PLANT that must go red naming its expected text, scored on
// the same recorder that showed the positive case in the clean session first.
//
// Scenarios:
//   popup-action -- with tab /a on screen and /b open, the subscribe pushes both
//                   fixtures' rows; a click on the action fixture (the store kind
//                   the 38-02 button sends) runs in /a: the extension's script
//                   retitles /a and its onClicked names /a. A click on the popup
//                   fixture answers 'popup'. Plant wrong-page fires the stock
//                   delegate path in a GUI-01 stock window on /c instead, and must
//                   go red naming the stock tab.
//
// Modes:
//   node scripts/verify-extension-actions-live.mjs [--scenario a,b]   live sessions
//   node scripts/verify-extension-actions-live.mjs --self-test --live  a clean control, then one session per plant
//   node scripts/verify-extension-actions-live.mjs --self-test         static: every plant targets a scenario and
//                                                                      names text that scenario emits; no browser
//   node scripts/verify-extension-actions-live.mjs --static            the same static audit
//
// Node built-ins plus ./lib/pb-relaunch.mjs, ./lib/pb-live-probe.mjs and
// ./lib/pb-extension-fixtures.mjs only.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXTENSION_FIXTURES, fixtureId } from './lib/pb-extension-fixtures.mjs';

const NAME = 'verify-extension-actions-live';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const verdict = (ok, detail, fail) => (ok ? { ok: true, detail, fail: null } : { ok: false, detail: null, fail });
const pathOf = u => {
  try {
    return new URL(String(u)).pathname;
  } catch {
    return String(u);
  }
};

// ---------------------------------------------------------------------------
// Scenarios. Each gets { app, plant } and returns a verdict.
// ---------------------------------------------------------------------------

async function scenarioPopupAction({ app, plant }) {
  const A = await openTab(app, '/a');
  await openTab(app, '/b');
  await live.makeCurrent(app, A);
  await waitForSelected(app, A, '/a');
  const from = (await live.pushes(app)).length;
  await live.probe(app, "await get('ChromeStoreClient').extensionActionsSubscribe(); return true;");
  const ids = Object.keys(EXTENSION_FIXTURES).map(fixtureId);
  const pushAt = await live.waitForPush(app, p => p.kind === 'extensionAction' && ids.every(id => p.actions.some(r => r.extensionId === id)), { from });
  if (pushAt < 0) {
    return verdict(false, null, 'no extensionAction push carried both fixtures after the subscribe');
  }
  const rows = (await live.pushes(app))[pushAt].actions;
  const actionRow = rows.find(r => r.extensionId === fixtureId('action'));
  const popupRow = rows.find(r => r.extensionId === fixtureId('popup'));
  if (actionRow.hasPopup || !popupRow.hasPopup || !actionRow.enabled || (actionRow.icon !== null && !actionRow.icon.startsWith('data:image/'))) {
    return verdict(false, null, `the pushed rows misreport the fixtures: ${JSON.stringify({ actionRow, popupRow })}`);
  }
  const logFrom = session.logs.length;
  if (plant?.name === 'wrong-page') {
    await stockActionClick(app, fixtureId('action'));
  } else {
    const where = await live.probe(app, `return { where: await get('ChromeStoreClient').extensionClick(${JSON.stringify(fixtureId('action'))}) };`);
    if (where.where !== 'action') {
      return verdict(false, null, `the action fixture's click answered ${JSON.stringify(where)}, not 'action'`);
    }
  }
  const clicked = await waitSince(logFrom, r => r.kind === 'clicked');
  if (!clicked) {
    return verdict(false, null, 'the action fixture never heard its click');
  }
  if (pathOf(clicked.url) !== '/a' || clicked.title !== 'pb-ext-acted /a') {
    const place = String(clicked.url).includes('localhost') ? `the stock tab ${pathOf(clicked.url)}` : pathOf(clicked.url);
    return verdict(false, null, `the action ran in ${place}, not the overlay on screen /a (title ${JSON.stringify(clicked.title)}, error ${clicked.err})`);
  }
  const overlayTitle = await live.inChrome(app, `const o = overlayOf(${JSON.stringify(A)}); return o ? o.contentTitle : null;`);
  if (overlayTitle !== 'pb-ext-acted /a') {
    return verdict(false, null, `overlay /a shows ${JSON.stringify(overlayTitle)} after the click, not the extension's title`);
  }
  const popup = await live.probe(app, `return { where: await get('ChromeStoreClient').extensionClick(${JSON.stringify(fixtureId('popup'))}) };`);
  if (popup.where !== 'popup') {
    return verdict(false, null, `the popup fixture's click answered ${JSON.stringify(popup)}, not 'popup'`);
  }
  return verdict(true, `the subscribe pushed both fixtures (popup flag, enabled, data: icon); the action click ran in the overlay on screen /a (retitled to ${overlayTitle}); the popup click answered 'popup'`, null);
}

const SCENARIOS_TABLE = {
  'popup-action': scenarioPopupAction,
};

// Each plant names its scenario and the red text that scenario must print. A plant is a different driver, not a
// patched product: the scenario reads `plant.name`.
const PLANTS_TABLE = {
  'wrong-page': { scenario: 'popup-action', expect: 'the action ran in the stock tab' },
};
const SCENARIOS = SCENARIOS_TABLE;
const PLANTS = PLANTS_TABLE;

// The static audit's own plants: each must make staticAudit report the named drift.
const AUDIT_PLANTS = [
  { name: 'unknown scenario', plants: { stray: { scenario: 'no-such-scenario', expect: 'x' } }, expect: 'targets the unknown scenario no-such-scenario' },
  { name: 'unemitted expect', plants: { ...PLANTS_TABLE, 'wrong-page': { ...PLANTS_TABLE['wrong-page'], expect: 'zz never printed' } }, expect: "emits no text starting 'zz never printed'" },
  { name: 'scenario without a plant', plants: {}, expect: 'has no plant' },
];

// ---------------------------------------------------------------------------
// The static audit (--static, --self-test): no browser.
// ---------------------------------------------------------------------------

function staticAudit(PLANTS = PLANTS_TABLE, SCENARIOS = SCENARIOS_TABLE) {
  const failures = [];
  for (const [name, plant] of Object.entries(PLANTS)) {
    const fn = SCENARIOS[plant.scenario];
    if (!fn) {
      failures.push(`plant ${name} targets the unknown scenario ${plant.scenario}`);
      continue;
    }
    if (!fn.toString().includes(plant.expect.split(' ').slice(0, 3).join(' '))) {
      failures.push(`plant ${name}: scenario ${plant.scenario} emits no text starting '${plant.expect}'`);
    }
    if (!fn.toString().includes(`'${name}'`)) {
      failures.push(`plant ${name}: scenario ${plant.scenario} never reads it, so the plant would not apply`);
    }
  }
  for (const name of Object.keys(SCENARIOS)) {
    if (!Object.values(PLANTS).some(p => p.scenario === name)) failures.push(`scenario ${name} has no plant`);
  }
  return failures;
}

// ---------------------------------------------------------------------------
// The live harness. Loaded only for a live run, so the static modes start no server and launch nothing.
// ---------------------------------------------------------------------------

let live = null;
let server = null;
let ORIGIN = '';
let STOCK_ORIGIN = '';
let session = { logs: [], queue: [] };
let opSeq = 0;
const sessionDirs = [];

async function startHarness() {
  live = { ...(await import('./lib/pb-live-probe.mjs')), ...(await import('./lib/pb-relaunch.mjs')) };
  server = createServer((req, res) => {
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
    if (/^\/[a-z]$/.test(path)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><title>page ${path}</title><body>live page ${path}</body>`);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  ORIGIN = `http://127.0.0.1:${server.address().port}`;
  STOCK_ORIGIN = `http://localhost:${server.address().port}`;
}

async function waitSince(from, pred, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const hit = session.logs.slice(from).find(pred);
    if (hit) return hit;
    if (Date.now() > end) return undefined;
    await sleep(150);
  }
}

// One command for the action fixture's background page: queued on /cmd, answered on /log.
async function command(op, args = {}) {
  const opId = `op${++opSeq}`;
  session.queue.push({ op, opId, ...args });
  const rec = await waitSince(0, r => r.kind === 'result' && r.opId === opId, 20000);
  if (!rec) throw new Error(`timed out waiting for the ${op} answer`);
  return rec;
}

async function openTab(app, path) {
  return live.openWebTab(app, `${ORIGIN}${path}`);
}

// Waits until the 31.1 host's selected tab is the overlay of `tabId` and has loaded `path`.
async function waitForSelected(app, tabId, path) {
  const end = Date.now() + 20000;
  for (;;) {
    const at = await live.inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); const s = window.gBrowser.selectedTab;
      return o && s && s.linkedBrowser === o ? o.currentURI.spec : null;`);
    if (at && pathOf(at) === path) return;
    if (Date.now() > end) throw new Error(`BROKEN INSTRUMENT: the host never selected ${path}`);
    await sleep(200);
  }
}

// Writes a fixture into a fresh directory and installs it as a temporary add-on.
async function installFixture(app, name) {
  const fixture = EXTENSION_FIXTURES[name];
  const dir = await mkdtemp(join(tmpdir(), 'pb-ext-actions-fixture-'));
  sessionDirs.push(dir);
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(fixture.manifest));
  for (const [file, body] of Object.entries(fixture.files)) {
    await writeFile(join(dir, file), body.replace('__ORIGIN__', JSON.stringify(ORIGIN)));
  }
  const installed = JSON.parse(await app.evaluateIn(app.chrome, `(async () => {
    try {
      const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      const f = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
      f.initWithPath(${JSON.stringify(dir)});
      const addon = await AddonManager.installTemporaryAddon(f);
      return JSON.stringify({ id: addon.id, isActive: addon.isActive });
    } catch (e) { return JSON.stringify({ error: String(e) }); }
  })()`));
  if (installed.error || installed.id !== fixtureId(name)) {
    throw new Error(`BROKEN INSTRUMENT: the ${name} fixture did not install: ${JSON.stringify(installed)}`);
  }
}

// The wrong-page plant's driver: the stock delegate path, fired in a GUI-01 stock window on a localhost page.
async function stockActionClick(app, extId) {
  const stockUrl = `${STOCK_ORIGIN}/c`;
  await live.probe(app, `await get('CommandRegistry').executeCommand('powerbrowser.open-browser-window', ${JSON.stringify(stockUrl)}); return true;`);
  await live.stockTabOn(app, stockUrl, 30000);
  const stock = (await app.contexts('chrome')).find(entry => entry.url.startsWith('chrome://browser/content/browser.xhtml'));
  if (!stock) throw new Error('BROKEN INSTRUMENT: no stock browser window context after the GUI-01 open');
  await app.evaluateIn(stock.context, `(() => {
    const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
    ExtensionParent.apiManager.global.browserActionFor(WebExtensionPolicy.getByID(${JSON.stringify(extId)}).extension).triggerAction(window);
    return true;
  })()`);
}

async function stampCheck() {
  const digest = createHash('sha256').update(await readFile(join(live.REPO_ROOT, 'patches/050-extension-tab-host.patch'))).digest('hex');
  const stamp = (await readFile(join(live.REPO_ROOT, 'objdir/.pb-050-build.sha256'), 'utf8')).trim().split(/\s+/)[0];
  if (digest !== stamp) {
    throw new Error(`BROKEN INSTRUMENT: patches/050 hashes to ${digest}, the build stamp is ${stamp}; rebuild before a live run`);
  }
}

// One scenario in one session, with every fixture installed and started first.
async function runSession(scenarioName, plantName = null) {
  session = { logs: [], queue: [] };
  try {
    return await live.withProbeShell(
      async app => {
        await installFixture(app, 'action');
        await installFixture(app, 'popup');
        if (!(await waitSince(0, r => r.kind === 'started')) || !(await waitSince(0, r => r.kind === 'popup-started'))) {
          throw new Error('BROKEN INSTRUMENT: a fixture background page never started');
        }
        return await SCENARIOS[scenarioName]({ app, plant: plantName ? { name: plantName, ...PLANTS[plantName] } : null, command });
      },
      { extraPrefs: { 'xpinstall.signatures.required': false } }
    );
  } catch (error) {
    const text = error && error.message ? error.message : String(error);
    return { ok: false, broken: text.startsWith('BROKEN INSTRUMENT'), detail: null, fail: text };
  } finally {
    for (const dir of sessionDirs.splice(0)) await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const failures = staticAudit();
  if (argv.includes('--static') || (argv.includes('--self-test') && !argv.includes('--live'))) {
    if (argv.includes('--self-test')) {
      for (const plant of AUDIT_PLANTS) {
        const hit = staticAudit(plant.plants).find(f => f.includes(plant.expect));
        if (hit) console.log(`  ok  audit plant ${plant.name} -> red: ${hit}`);
        else failures.push(`audit plant ${plant.name} did not go red naming '${plant.expect}'`);
      }
    }
    failures.forEach(f => console.log(`FAIL -- ${f}`));
    if (failures.length) process.exit(1);
    console.log(`${NAME} ${argv.includes('--self-test') ? '--self-test' : '--static'}: PASS -- ${Object.keys(PLANTS).length} plant(s) each target a scenario, name text it emits and are read by it; every scenario has a plant (the live control and plant sessions were not run)`);
    process.exit(0);
  }
  if (failures.length) {
    failures.forEach(f => console.log(`harness: ${f}`));
    process.exit(1);
  }
  const at = argv.indexOf('--scenario');
  const selected = at === -1 ? Object.keys(SCENARIOS) : argv[at + 1].split(',');
  for (const name of selected) {
    if (!SCENARIOS[name]) throw new Error(`unknown scenario ${name}; known: ${Object.keys(SCENARIOS).join(', ')}`);
  }
  await startHarness();
  await stampCheck();
  let failed = 0;
  if (!argv.includes('--self-test')) {
    for (const name of selected) {
      const r = await runSession(name);
      console.log(r.ok ? `${name}: PASS -- ${r.detail}` : `${name}: FAIL -- ${r.fail}`);
      if (!r.ok) failed++;
      if (r.broken) break;
    }
  } else {
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
      if (!red.ok && !red.broken && red.fail.includes(plant.expect)) {
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
