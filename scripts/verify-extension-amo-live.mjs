#!/usr/bin/env node
// scripts/verify-extension-amo-live.mjs
//
// Phase 38 plan 05 (EXT-09, EXT-10): live proof, on the built shell with patch
// 050 and the last Theia build, that an extension installs from the add-ons
// site through the STOCK install prompt (D-04: the shell authors no install
// UI) and then works in web tabs, and that the D-07 extensions (an ad blocker,
// a password manager, a dark-mode extension) each have a page-side effect in
// a web tab (the fixtures scenario, 38-05 Task 2).
//
// The add-ons site is upstream's own extensions.getAddons.link.url, read in the
// running shell; its origin is the listing API's origin. The D-07 extensions
// are named here by their listing slug, the one name a listing is reached by;
// every id, name, version and XPI URL is read at check time from the listing
// and from the installed add-on (Pitfall 7: nothing hand-kept). Each session
// runs on a fresh profile with xpinstall.signatures.required=true, so every
// install is the signed path, never a temporary add-on. A session opens at
// most four web tabs on this script's 127.0.0.1 origin.
//
// Scenarios:
//   amo-install -- with web tab /a on screen and no extension installed, the puzzle
//                  menu's install footer (the empty state's only action) opens the
//                  add-ons site in the stock browser window (D-11 network kind
//                  extensionInstallSite), never in a web tab. From that stock tab the
//                  smallest D-07 listing (by its XPI size, read from the listing) starts
//                  through AddonManager.installAddonFromWebpage with the page's own
//                  principal, the path the site's install button takes. The stock
//                  addon-webext-permissions prompt then opens in the stock window,
//                  naming the add-on the download carries, with the stock element's
//                  own Add button; the scenario presses it. The add-on installs signed
//                  and active, its puzzle row arrives in the extensionAction push under
//                  its installed name, and a click on that row on /a opens its popup in
//                  chrome's native panel. Plant prompt-bypassed starts the same install
//                  with no prompt handler and must go red naming the prompt.
//
// Modes:
//   node scripts/verify-extension-amo-live.mjs [--scenario a,b]   live sessions (needs the network)
//   node scripts/verify-extension-amo-live.mjs --self-test --live  a clean control, then one session per plant
//   node scripts/verify-extension-amo-live.mjs --self-test         static: plants target scenarios and name text
//                                                                   they emit, no id literal; no browser
//   node scripts/verify-extension-amo-live.mjs --static            the same static audit
//
// Node built-ins plus ./lib/pb-relaunch.mjs and ./lib/pb-live-probe.mjs only.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'verify-extension-amo-live';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const verdict = (ok, detail, fail) => (ok ? { ok: true, detail, fail: null } : { ok: false, detail: null, fail });

// D-07, by listing slug. The role is how a scenario reads each one.
const AMO_FIXTURES = { blocker: 'ublock-origin', manager: 'bitwarden-password-manager', dark: 'darkreader' };

// ---------------------------------------------------------------------------
// Scenarios. Each gets { app, plant } and returns a verdict.
// ---------------------------------------------------------------------------

async function scenarioAmoInstall({ app, plant }) {
  const A = await openTab(app, '/a');
  await live.makeCurrent(app, A);
  await live.probe(app, "await get('ChromeStoreClient').extensionActionsSubscribe(); return true;");
  await clickInFrame(app, '.pb-ext-puzzle');
  if (!(await pollUntil(() => app.evaluate("!!document.querySelector('.pb-ext-menu .pb-ext-menu-footer')"), hit => hit === true, 10000))) {
    return verdict(false, null, 'the puzzle menu with no extension installed shows no install footer');
  }
  const site = await siteUrl(app);
  await clickInFrame(app, '.pb-ext-menu .pb-ext-menu-footer');
  const stock = await stockWindowOnHost(app, new URL(site).host, 30000);
  if (!stock) {
    return verdict(false, null, `the install footer did not open the add-ons site ${new URL(site).host} in a stock browser window`);
  }
  const listings = await Promise.all(Object.values(AMO_FIXTURES).map(slug => amoListing(site, slug)));
  const smallest = listings.sort((x, y) => x.size - y.size)[0];
  const started = await app.evaluateIn(stock, `(async () => {
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const browser = gBrowser.selectedBrowser;
    const install = await AddonManager.getInstallForURL(${JSON.stringify(smallest.fileUrl)}, { browser, triggeringPrincipal: browser.contentPrincipal, telemetryInfo: { source: 'amo' } });
    window.__pbAmoInstall = install;
    if (${JSON.stringify(plant?.name === 'prompt-bypassed')}) install.install().catch(() => {});
    else AddonManager.installAddonFromWebpage('application/x-xpinstall', browser, browser.contentPrincipal, install);
    return true;
  })()`);
  if (started !== true) throw new Error(`BROKEN INSTRUMENT: the install of ${smallest.slug} did not start: ${JSON.stringify(started)}`);
  // The stock panel opens only in the active window (PopupNotifications _update), so a found notification focuses it.
  const prompt = await pollUntil(() => app.evaluateIn(stock, `JSON.stringify((() => {
    const n = PopupNotifications.getNotification('addon-webext-permissions', gBrowser.selectedBrowser);
    const el = n && [...PopupNotifications.panel.children].find(e => e.notification === n);
    if (n && PopupNotifications.panel.state !== 'open') window.focus();
    const install = window.__pbAmoInstall;
    return { open: !!el && PopupNotifications.panel.state === 'open', named: n ? n.options.name : null, addon: install ? install.name : null,
      main: n ? n.mainAction.label : null, button: el && el.button ? el.button.label : null };
  })())`).then(JSON.parse), p => p && p.open && p.button, 60000);
  if (!prompt) {
    return verdict(false, null, `the stock install prompt never appeared in the stock window for ${smallest.slug}`);
  }
  if (prompt.named !== prompt.addon || prompt.button !== prompt.main) {
    return verdict(false, null, `the stock install prompt does not name the downloaded add-on with the stock Add button: ${JSON.stringify(prompt)}`);
  }
  // The stock Add button ignores a click inside security.notification_enable_delay of timeShown, so wait it out.
  await app.evaluateIn(stock, `new Promise(resolve => {
    const n = PopupNotifications.getNotification('addon-webext-permissions', gBrowser.selectedBrowser);
    const el = [...PopupNotifications.panel.children].find(e => e.notification === n);
    const wait = Math.max(0, Services.prefs.getIntPref('security.notification_enable_delay', 500) + 100 - (ChromeUtils.now() - n.timeShown));
    setTimeout(() => { el.button.click(); resolve(true); }, wait);
  })`);
  const installed = await pollUntil(() => app.evaluateIn(stock, `(async () => {
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const install = window.__pbAmoInstall;
    const addon = install && install.addon && (await AddonManager.getAddonByID(install.addon.id));
    return JSON.stringify(addon ? { id: addon.id, name: addon.name, version: addon.version, active: addon.isActive, signed: addon.signedState >= AddonManager.SIGNEDSTATE_SIGNED } : null);
  })()`).then(JSON.parse), a => a && a.active, 60000);
  if (!installed || !installed.signed) {
    return verdict(false, null, `accepting the stock prompt did not leave ${smallest.slug} installed, signed and active: ${JSON.stringify(installed)}`);
  }
  const works = await extensionPopupOn(app, A, installed);
  if (!works.ok) return verdict(false, null, works.fail);
  return verdict(true, `the install footer opened ${new URL(site).host} in the stock window; ${smallest.slug} (${installed.name} ${installed.version}, ${smallest.fileUrl}) raised the stock prompt "${prompt.named}" with its Add button "${prompt.button}"; accepted, it installed signed and its popup opened on /a in the native panel`, null);
}

const SCENARIOS_TABLE = {
  'amo-install': scenarioAmoInstall,
};

// Each plant names its scenario and the red text that scenario must print. A plant is a different driver, not a
// patched product: the scenario reads `plant.name`.
const PLANTS_TABLE = {
  'prompt-bypassed': { scenario: 'amo-install', expect: 'the stock install prompt never appeared' },
};

// ---------------------------------------------------------------------------
// The static audit (--static, --self-test): no browser.
// ---------------------------------------------------------------------------

// Pitfall 7 backstop: a quoted add-on id (name@domain or a {uuid}) in this file would be a hand-kept pin.
// The quote characters are escapes (\x22 \x27 \x60) so this pattern's own source never matches itself.
const idLiterals = text => [...text.matchAll(/[\x22\x27\x60][^\x22\x27\x60\s]*@[^\x22\x27\x60\s]+[\x22\x27\x60]|\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}/gi)].map(m => m[0]);

function staticAudit(PLANTS = PLANTS_TABLE, SCENARIOS = SCENARIOS_TABLE, source = readFileSync(fileURLToPath(import.meta.url), 'utf8')) {
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
  for (const hit of idLiterals(source)) failures.push(`a hand-kept add-on id literal ${hit}: read ids from the installed add-on (Pitfall 7)`);
  return failures;
}

// The static audit's own plants: each must make staticAudit report the named drift.
const AUDIT_PLANTS = [
  { name: 'unknown scenario', plants: { stray: { scenario: 'no-such-scenario', expect: 'x' } }, expect: 'targets the unknown scenario no-such-scenario' },
  { name: 'unemitted expect', plants: { ...PLANTS_TABLE, 'prompt-bypassed': { ...PLANTS_TABLE['prompt-bypassed'], expect: 'zz never printed' } }, expect: "emits no text starting 'zz never printed'" },
  { name: 'scenario without a plant', plants: {}, expect: 'has no plant' },
  { name: 'hand-kept id', plants: PLANTS_TABLE, source: `const pin = '${'planted' + '@' + 'example.org'}';`, expect: 'a hand-kept add-on id literal' },
];

// ---------------------------------------------------------------------------
// The live harness. Loaded only for a live run, so the static modes start no server and launch nothing.
// ---------------------------------------------------------------------------

let live = null;
let server = null;
let ORIGIN = '';

async function startHarness() {
  live = { ...(await import('./lib/pb-live-probe.mjs')), ...(await import('./lib/pb-relaunch.mjs')) };
  const pages = {
    '/a': '<title>page /a</title><body>live page /a',
  };
  server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (pages[path]) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(`<!doctype html>${pages[path]}`);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  ORIGIN = `http://127.0.0.1:${server.address().port}`;
}

async function openTab(app, path) {
  return live.openWebTab(app, `${ORIGIN}${path}`);
}

// Polls `read` until `pred` holds; the last value, or null on timeout.
async function pollUntil(read, pred, timeoutMs) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await read().catch(() => null);
    if (pred(value)) return value;
    if (Date.now() > end) return null;
    await sleep(300);
  }
}

// A click on the first element matching `selector` in the Theia frame; a missing element is a broken instrument.
async function clickInFrame(app, selector) {
  const hit = await app.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  if (hit !== true) throw new Error(`BROKEN INSTRUMENT: no ${selector} in the Theia frame`);
}

// The add-ons site the shell opens: upstream's pref, formatted as upstream formats it.
async function siteUrl(app) {
  const url = await app.evaluateIn(app.chrome, "Services.urlFormatter.formatURLPref('extensions.getAddons.link.url')");
  if (!/^https:\/\//.test(String(url))) throw new Error(`BROKEN INSTRUMENT: the add-ons site pref names no https page (${url})`);
  return String(url);
}

// One listing, read from the site's own listing API at check time: its current signed XPI and that file's size.
async function amoListing(site, slug) {
  const res = await fetch(`${new URL(site).origin}/api/v5/addons/addon/${slug}/`);
  if (!res.ok) throw new Error(`BROKEN INSTRUMENT: the listing ${slug} answered ${res.status}`);
  const file = (await res.json())?.current_version?.file;
  if (!file || !/^https:\/\//.test(file.url)) throw new Error(`BROKEN INSTRUMENT: the listing ${slug} names no https XPI`);
  return { slug, fileUrl: file.url, size: Number(file.size) || Infinity };
}

// A stock browser window whose selected tab is on `host`: its BiDi chrome context, or null on timeout.
async function stockWindowOnHost(app, host, timeoutMs) {
  return pollUntil(async () => {
    for (const w of (await app.contexts('chrome')).filter(entry => entry.url.startsWith('chrome://browser/content/browser.xhtml'))) {
      const on = await app.evaluateIn(w.context, `typeof gBrowser === 'object' && gBrowser.selectedBrowser.currentURI.host === ${JSON.stringify(host)}`);
      if (on === true) return w.context;
    }
    return null;
  }, c => c !== null, timeoutMs);
}

// A click on the extension's puzzle row with web tab `tabId` on screen opens its own popup in chrome's native panel.
async function extensionPopupOn(app, tabId, addon) {
  await live.makeCurrent(app, tabId);
  // The row's title is the action's own title, which may differ from the add-on name, so the row is matched by id.
  const row = await pollUntil(async () => (await live.pushes(app)).filter(p => p.kind === 'extensionAction').pop()?.actions.find(r => r.extensionId === addon.id) ?? null, r => r !== null, 30000);
  if (!row) {
    return { ok: false, fail: `no extensionAction row for ${addon.name} was pushed` };
  }
  const rowMain = `.pb-ext-menu .pb-ext-row[data-extension-id=${JSON.stringify(addon.id)}] .pb-ext-row-main`;
  await clickInFrame(app, '.pb-ext-puzzle');
  await pollUntil(() => app.evaluate(`!!document.querySelector(${JSON.stringify(rowMain)})`), hit => hit === true, 10000);
  await clickInFrame(app, rowMain);
  const panel = await pollUntil(() => live.inChrome(app, `const p = document.querySelector('panel.browser-extension-panel');
    const b = p && p.querySelector('browser');
    const base = WebExtensionPolicy.getByID(${JSON.stringify(addon.id)})?.getURL('') ?? null;
    return JSON.stringify({ state: p ? p.state : 'none', ours: !!(base && b && b.currentURI && b.currentURI.spec.startsWith(base)) });`).then(JSON.parse), p => p.state === 'open' && p.ours, 15000);
  if (!panel) return { ok: false, fail: `a click on ${addon.name}'s puzzle row did not open its popup in the native panel` };
  await live.inChrome(app, "document.querySelector('panel.browser-extension-panel')?.hidePopup(); return true;");
  return { ok: true };
}

async function stampCheck() {
  const digest = createHash('sha256').update(await readFileAsync(join(live.REPO_ROOT, 'patches/050-extension-tab-host.patch'))).digest('hex');
  const stamp = (await readFileAsync(join(live.REPO_ROOT, 'objdir/.pb-050-build.sha256'), 'utf8')).trim().split(/\s+/)[0];
  if (digest !== stamp) {
    throw new Error(`BROKEN INSTRUMENT: patches/050 hashes to ${digest}, the build stamp is ${stamp}; rebuild before a live run`);
  }
}

const SESSION_PREFS = {
  // The signed path: no unsigned add-on may install in these sessions.
  'xpinstall.signatures.required': true,
};

async function runSession(scenarioName, plantName = null) {
  try {
    return await live.withProbeShell(
      async app => SCENARIOS_TABLE[scenarioName]({ app, plant: plantName ? { name: plantName, ...PLANTS_TABLE[plantName] } : null }),
      { extraPrefs: SESSION_PREFS }
    );
  } catch (error) {
    const text = error && error.message ? error.message : String(error);
    return { ok: false, broken: text.startsWith('BROKEN INSTRUMENT'), detail: null, fail: text };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const failures = staticAudit();
  if (argv.includes('--static') || (argv.includes('--self-test') && !argv.includes('--live'))) {
    if (argv.includes('--self-test')) {
      for (const plant of AUDIT_PLANTS) {
        const hit = staticAudit(plant.plants, SCENARIOS_TABLE, plant.source ?? '').find(f => f.includes(plant.expect));
        if (hit) console.log(`  ok  audit plant ${plant.name} -> red: ${hit}`);
        else failures.push(`audit plant ${plant.name} did not go red naming '${plant.expect}'`);
      }
    }
    failures.forEach(f => console.log(`FAIL -- ${f}`));
    if (failures.length) process.exit(1);
    console.log(`${NAME} ${argv.includes('--self-test') ? '--self-test' : '--static'}: PASS -- ${Object.keys(PLANTS_TABLE).length} plant(s) each target a scenario, name text it emits and are read by it; every scenario has a plant; no hand-kept add-on id (the live control and plant sessions were not run)`);
    process.exit(0);
  }
  if (failures.length) {
    failures.forEach(f => console.log(`harness: ${f}`));
    process.exit(1);
  }
  const at = argv.indexOf('--scenario');
  const selected = at === -1 ? Object.keys(SCENARIOS_TABLE) : argv[at + 1].split(',');
  for (const name of selected) {
    if (!SCENARIOS_TABLE[name]) throw new Error(`unknown scenario ${name}; known: ${Object.keys(SCENARIOS_TABLE).join(', ')}`);
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
    for (const [plantName, plant] of Object.entries(PLANTS_TABLE)) {
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
