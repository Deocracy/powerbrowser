#!/usr/bin/env node
// scripts/verify-extension-amo-live.mjs
//
// Phase 38 plan 05 (EXT-09, EXT-10): live proof, on the built shell with patch
// 050 and the last Theia build, that an extension installs from the add-ons
// site through the STOCK install prompt (D-04: the shell authors no install
// UI) and then works in web tabs, and that the D-07 extensions (an ad blocker,
// a password manager, a dark-mode extension) each have a page-side effect in
// a web tab.
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
//   fixtures    -- each D-07 listing installs signed from the add-ons site. Before
//                  any install the same session shows each baseline: the tracker image
//                  on /ad loads (its host resolved to this server by
//                  network.dns.localDomains), the login form on /login is empty, and
//                  /plain paints a light background. Then: the ad blocker makes that
//                  image fail AND sets a numeric badge above zero on /ad (the push);
//                  the password manager's toolbar action opens its own popup in the
//                  native panel on /login; the dark-mode extension turns /plain's
//                  painted background dark. The password manager FILL is scored by
//                  ext10-fill, on a local vault server (38 T31 option b). Plant
//                  fixtures-no-op disables the three after install and must go red
//                  naming each missing effect.
//   ext10-fill  -- EXT-10's fill, 38 T31 option (b): a local Vaultwarden (nixpkgs store paths resolved
//                  at check time, no repo dependency) on 127.0.0.1 only, a throwaway data folder, icon
//                  download off and every outbound request blocked, stopped after the scenario. The
//                  manager installs signed from the add-ons site; in a stock-window tab on its own popup
//                  page its own UI points it at the local server (https: the form refuses http, so the
//                  server serves the TLS fixture leaf), registers a run-time account and lands unlocked.
//                  On a web tab /login the fill key does nothing while the vault is empty; then a login
//                  saved through the same UI for /login's origin (Host match: host and port) fills both
//                  fields on the next press. The credentials live in memory only and are compared, never
//                  printed. Plant vault-uri-mismatch saves the login for another port of 127.0.0.1 and
//                  must go red naming the missing fill.
//
// Modes:
//   node scripts/verify-extension-amo-live.mjs [--scenario a,b]   live sessions (needs the network)
//   node scripts/verify-extension-amo-live.mjs --self-test --live  a clean control, then one session per plant
//   node scripts/verify-extension-amo-live.mjs --self-test         static: plants target scenarios and name text
//                                                                   they emit, no id literal; no browser
//   node scripts/verify-extension-amo-live.mjs --static            the same static audit
//
// Node built-ins plus ./lib/pb-relaunch.mjs and ./lib/pb-live-probe.mjs only (ext10-fill also runs nix and ss).

import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'verify-extension-amo-live';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const verdict = (ok, detail, fail) => (ok ? { ok: true, detail, fail: null } : { ok: false, detail: null, fail });

// D-07, by listing slug. The role is how a scenario reads each one.
const AMO_FIXTURES = { blocker: 'ublock-origin', manager: 'bitwarden-password-manager', dark: 'darkreader' };
// A tracker host the ad blocker's bundled lists block outright; resolved to this server for the session only.
const TRACKER_HOST = 'ad.doubleclick.net';
// ext10-fill: the vault server's name, the TLS fixture leaf's (scripts/fixtures/tls), resolved to 127.0.0.1.
const VAULT_HOST = 'pb-fixture.test';
// The manager checks passwords against this breach service; resolved to 127.0.0.1 (nothing listens) so the run sends nothing out.
const BREACH_HOST = 'api.pwnedpasswords.com';
// A 1x1 PNG, so the baseline image has a natural width.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

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

async function scenarioFixtures({ app, plant }) {
  const AD = await openTab(app, '/ad');
  const LOGIN = await openTab(app, '/login');
  const PLAIN = await openTab(app, '/plain');
  // Baselines, before any extension, by the same readers that score the effects.
  const adBase = await pollUntil(() => adImage(app), i => i && i.complete, 15000);
  if (!adBase || !(adBase.width > 0)) throw new Error(`BROKEN INSTRUMENT: the tracker image did not load before any extension (${JSON.stringify(adBase)}), so a later failure would prove nothing`);
  const loginBase = await pollUntil(() => loginValues(app), v => v !== null, 15000);
  if (!loginBase || loginBase.user !== '' || loginBase.pass !== '') throw new Error(`BROKEN INSTRUMENT: the login form is not empty before any extension: ${JSON.stringify(loginBase)}`);
  const plainBase = await pollUntil(() => paintedLuminance(app, '/plain'), l => l !== null, 15000);
  if (!(plainBase > 0.5)) throw new Error(`BROKEN INSTRUMENT: /plain does not paint light before any extension (luminance ${plainBase})`);
  const site = await siteUrl(app);
  const got = {};
  for (const [role, slug] of Object.entries(AMO_FIXTURES)) {
    const listing = await amoListing(site, slug);
    got[role] = { ...listing, ...(await installSigned(app, listing.fileUrl)) };
    if (!got[role].active || !got[role].signed) throw new Error(`BROKEN INSTRUMENT: ${slug} did not install signed and active: ${JSON.stringify(got[role])}`);
  }
  if (plant?.name === 'fixtures-no-op') {
    for (const role of Object.keys(got)) await setAddonEnabled(app, got[role].id, false);
  }
  const missing = [];
  // (a) the ad blocker: reload /ad until its lists are compiled, then the image fails and the badge counts it.
  await live.makeCurrent(app, AD);
  let blocked = null;
  for (let attempt = 0; attempt < 12 && !blocked; attempt++) {
    await live.inChrome(app, `overlayOf(${JSON.stringify(AD)}).reload(); return true;`);
    await sleep(5000);
    const image = await adImage(app);
    const badge = await badgeOf(app, got.blocker.id);
    if (image && image.complete && image.width === 0 && Number(badge) > 0) blocked = { badge };
  }
  if (!blocked) missing.push(`the ad blocker blocked nothing on /ad (image ${JSON.stringify(await adImage(app))}, badge ${JSON.stringify(await badgeOf(app, got.blocker.id))})`);
  // (b) the password manager: its own popup opens on /login in the native panel.
  await live.makeCurrent(app, LOGIN);
  const offered = await extensionPopupOn(app, LOGIN, got.manager);
  if (!offered.ok) missing.push(`the password manager offered nothing on /login: ${offered.fail}`);
  // (c) the dark-mode extension: /plain's painted background turns dark.
  await live.makeCurrent(app, PLAIN);
  await live.inChrome(app, `overlayOf(${JSON.stringify(PLAIN)}).reload(); return true;`);
  const dark = await pollUntil(() => paintedLuminance(app, '/plain'), l => l !== null && l < 0.3, 30000);
  if (dark === null) missing.push(`the dark-mode extension did not restyle /plain (luminance ${await paintedLuminance(app, '/plain')}, was ${plainBase.toFixed(2)})`);
  if (missing.length) return verdict(false, null, `missing effect: ${missing.join('; ')}`);
  const route = role => `${got[role].name} ${got[role].version} from ${got[role].fileUrl}`;
  return verdict(true, `signed installs: ${Object.keys(got).map(route).join('; ')}. The tracker image that loaded before failed on /ad with badge ${blocked.badge}; the password manager's popup opened on /login over the empty form (the fill is ext10-fill's); /plain went from luminance ${plainBase.toFixed(2)} to ${dark.toFixed(2)}`, null);
}

// EXT-10 fill (38 T31 option b). Registration, unlock and the saved login go through the manager's own UI only;
// no vault cryptography is done here.
async function scenarioExt10Fill({ app, plant }) {
  const vault = await startVaultwarden();
  try {
    await live.trustFixtureCA(app);
    const listing = await amoListing(await siteUrl(app), AMO_FIXTURES.manager);
    const manager = { ...listing, ...(await installSigned(app, listing.fileUrl)) };
    if (!manager.active || !manager.signed) throw new Error(`BROKEN INSTRUMENT: ${listing.slug} did not install signed and active: ${JSON.stringify(manager)}`);
    const ui = await extensionPageInStockTab(app, manager.id, 'popup/index.html?uilocation=tab');
    // Run-time throwaways, held in memory only. \x40 keeps an address literal out of the id-literal backstop.
    const email = `pb-${randomBytes(6).toString('hex')}\x40example.test`;
    const master = randomBytes(18).toString('base64url');
    const login = { user: `pb-user-${randomBytes(4).toString('hex')}`, pass: randomBytes(15).toString('base64url') };
    const a5 = JSON.parse(await app.evaluateIn(ui, `(async () => { ${UI_HELPERS}
      const r = { serverAccepted: false, registered: false, unlocked: false, at: '' };
      await wait(() => byText('Skip') || byText('Create account'));
      if (byText('Skip')) byText('Skip').click();
      (await wait(() => byText('Create account'))).click();
      (await wait(() => document.querySelector('ng-select .ng-select-container'))).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      (await wait(() => [...document.querySelectorAll('.ng-option')].find(o => o.innerText.trim() === 'self-hosted'))).click();
      setIn(await wait(() => document.getElementById('self_hosted_env_settings_form_input_base_url')), ${JSON.stringify(vault.origin)});
      submit('Save');
      r.serverAccepted = !!(await wait(() => !document.getElementById('self_hosted_env_settings_form_input_base_url')));
      if (!r.serverAccepted) return JSON.stringify({ ...r, at: location.hash.split('?')[0] });
      setIn(document.getElementById('register-start_form_input_email'), ${JSON.stringify(email)});
      setIn(document.getElementById('register-start_form_input_name'), 'PB check');
      submit('Continue');
      const pw = await wait(() => document.getElementById('input-password-form_new-password'));
      if (!pw) return JSON.stringify({ ...r, at: location.hash.split('?')[0] });
      // The breach check would send a hash prefix of the master password out.
      const breach = document.getElementById('input-password-form_check-for-breaches');
      if (breach && breach.checked) breach.click();
      setIn(pw, ${JSON.stringify(master)});
      setIn(document.getElementById('input-password-form_new-password-confirm'), ${JSON.stringify(master)});
      submit('Create account');
      r.registered = !!(await wait(() => !location.hash.startsWith('#/finish-signup'), 30000));
      r.unlocked = !!(await wait(() => location.hash.startsWith('#/tabs/vault') && byText('New login'), 30000));
      return JSON.stringify({ ...r, at: location.hash.split('?')[0] });
    })()`));
    if (!a5.serverAccepted || !a5.registered || !a5.unlocked) throw new Error(`BROKEN INSTRUMENT: the manager's own UI did not reach an unlocked vault on the local server (A5): ${JSON.stringify(a5)}`);
    const shortcut = await fillShortcut(app, manager.id);
    const L = await openTab(app, '/login');
    const press = async () => {
      await app.evaluateIn(app.chrome, 'window.focus(); true');
      await live.makeCurrent(app, L);
      if (!(await pollUntil(() => live.focusOverlay(app, L), f => f === true, 10000))) throw new Error('BROKEN INSTRUMENT: the web tab /login could not be focused');
      await live.pressKey(app, shortcut);
    };
    const base = await pollUntil(() => loginValues(app), v => v !== null, 15000);
    if (!base || base.user !== '' || base.pass !== '') throw new Error('BROKEN INSTRUMENT: the login form is not empty before the fill');
    await press();
    await sleep(4000);
    const empty = await loginValues(app);
    if (!empty || empty.user !== '' || empty.pass !== '') return verdict(false, null, 'with an empty vault the fill key changed the login form');
    // The saved login's website: /login's own origin, or (the plant) the same host on another port.
    const saved = new URL(`${ORIGIN}/login`);
    if (plant?.name === 'vault-uri-mismatch') saved.port = String(Number(saved.port) + 1);
    const added = await app.evaluateIn(ui, `(async () => { ${UI_HELPERS}
      byText('New login').click();
      const fc = n => document.querySelector('[formcontrolname=' + n + ']');
      await wait(() => fc('uri'));
      setIn(fc('name'), 'PB login'); setIn(fc('username'), ${JSON.stringify(login.user)}); setIn(fc('password'), ${JSON.stringify(login.pass)}); setIn(fc('uri'), ${JSON.stringify(saved.href)});
      // Host match (host and port): the default, base domain, ignores the port.
      document.querySelector('[aria-label="Show match detection"]').click();
      (await wait(() => document.querySelector('bit-select[formcontrolname=matchDetection] .ng-select-container'))).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      (await wait(() => [...document.querySelectorAll('.ng-option')].find(o => o.innerText.trim() === 'Host'))).click();
      submit('Save');
      return !!(await wait(() => location.hash.startsWith('#/view-cipher')));
    })()`);
    if (added !== true) throw new Error('BROKEN INSTRUMENT: the manager\'s own UI did not save the login');
    await press();
    const got = await pollUntil(() => loginValues(app), v => v && v.user === login.user && v.pass === login.pass, 10000);
    if (!got) {
      const v = (await loginValues(app)) ?? {};
      return verdict(false, null, `the password manager did not fill the login page (username filled: ${v.user === login.user}, password filled: ${v.pass === login.pass})`);
    }
    return verdict(true, `${manager.name} ${manager.version} from ${manager.fileUrl}; its own UI accepted the local server ${vault.origin}, registered a run-time account and unlocked (A5: ${JSON.stringify(a5)}); on web tab /login the fill key (${shortcut.label}) left the form empty with an empty vault, then filled both fields with the login saved for ${saved.origin} (compared in memory, not printed)`, null);
  } finally {
    await stopVaultwarden(vault);
  }
}

const SCENARIOS_TABLE = {
  'amo-install': scenarioAmoInstall,
  fixtures: scenarioFixtures,
  'ext10-fill': scenarioExt10Fill,
};

// Each plant names its scenario and the red text that scenario must print. A plant is a different driver, not a
// patched product: the scenario reads `plant.name`.
const PLANTS_TABLE = {
  'prompt-bypassed': { scenario: 'amo-install', expect: 'the stock install prompt never appeared' },
  'fixtures-no-op': { scenario: 'fixtures', expect: 'the ad blocker blocked nothing' },
  'vault-uri-mismatch': { scenario: 'ext10-fill', expect: 'the password manager did not fill the login page' },
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

// The vault server's listeners, from `ss -Hltnp`: a fault unless every socket of `pid` is 127.0.0.1:`port`.
function vaultListenFault(ssOut, pid, port) {
  const mine = ssOut.split('\n').filter(line => line.includes(`pid=${pid},`)).map(line => line.trim().split(/\s+/)[3]);
  if (!mine.length) return `the vault server (pid ${pid}) listens nowhere`;
  const wide = mine.filter(addr => addr !== `127.0.0.1:${port}`);
  return wide.length ? `the vault server listens beyond 127.0.0.1:${port}: ${wide.join(', ')}` : null;
}

// Its own plants: each ss listing must make vaultListenFault name the drift.
const LISTEN_PLANTS = [
  { name: 'all-address bind', ss: 'LISTEN 0 128 0.0.0.0:4100 0.0.0.0:* users:(("vaultwarden",pid=77,fd=22))', expect: 'listens beyond 127.0.0.1:4100: 0.0.0.0:4100' },
  { name: 'extra socket', ss: 'LISTEN 0 128 127.0.0.1:4100 0.0.0.0:* users:(("vaultwarden",pid=77,fd=22))\nLISTEN 0 128 [::]:3012 [::]:* users:(("vaultwarden",pid=77,fd=23))', expect: 'listens beyond 127.0.0.1:4100: [::]:3012' },
  { name: 'no listener', ss: 'LISTEN 0 128 127.0.0.1:4100 0.0.0.0:* users:(("other",pid=78,fd=3))', expect: 'listens nowhere' },
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
    '/ad': `<title>page /ad</title><body>an ad slot <img id="ad" alt="">`,
    '/login': '<title>page /login</title><body><form action="/login" method="post"><input id="user" name="username" autocomplete="username"><input id="pass" type="password" autocomplete="current-password"><button>Sign in</button></form>',
    '/plain': '<title>page /plain</title><body><p>An unstyled page.</p>',
  };
  server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/ddm/ad/pb.png') {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      res.end(PIXEL);
      return;
    }
    if (pages[path]) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      // The tracker URL carries this server's port, so the page is built per request.
      const port = server.address().port;
      res.end(`<!doctype html>${pages[path].replace('<img id="ad" alt="">', `<img id="ad" alt="" src="http://${TRACKER_HOST}:${port}/ddm/ad/pb.png">`)}`);
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

// Installs a signed XPI from its listing URL (no prompt: the fixtures prove the effects, amo-install the prompt).
async function installSigned(app, fileUrl) {
  return JSON.parse(await app.evaluateIn(app.chrome, `(async () => {
    try {
      const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      const install = await AddonManager.getInstallForURL(${JSON.stringify(fileUrl)}, { telemetryInfo: { source: 'amo' } });
      const addon = await install.install();
      return JSON.stringify({ id: addon.id, name: addon.name, version: addon.version, active: addon.isActive, signed: addon.signedState >= AddonManager.SIGNEDSTATE_SIGNED });
    } catch (e) { return JSON.stringify({ error: String(e) }); }
  })()`));
}

async function setAddonEnabled(app, id, enabled) {
  await app.evaluateIn(app.chrome, `(async () => {
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addon = await AddonManager.getAddonByID(${JSON.stringify(id)});
    await (${enabled} ? addon.enable() : addon.disable());
    return true;
  })()`);
}

// The last pushed badge text of the extension's row (the host's selected tab), or null.
async function badgeOf(app, id) {
  const rows = (await live.pushes(app)).filter(p => p.kind === 'extensionAction').pop()?.actions ?? [];
  return rows.find(r => r.extensionId === id)?.badgeText ?? null;
}

// A page-realm read in the web tab's own content context, found by its URL.
async function inPage(app, path, expr) {
  const ctx = (await app.contexts()).find(entry => entry.url === `${ORIGIN}${path}`);
  return ctx ? app.evaluateIn(ctx.context, expr) : null;
}

async function adImage(app) {
  const r = await inPage(app, '/ad', "JSON.stringify((() => { const i = document.getElementById('ad'); return i ? { complete: i.complete, width: i.naturalWidth } : null; })())");
  return r ? JSON.parse(r) : null;
}

async function loginValues(app) {
  const r = await inPage(app, '/login', "JSON.stringify({ user: document.getElementById('user').value, pass: document.getElementById('pass').value })");
  return r ? JSON.parse(r) : null;
}

// The relative luminance of what the page paints behind its text: the root's background, else the body's, else the
// canvas default (white).
async function paintedLuminance(app, path) {
  const r = await inPage(app, path, `(() => {
    const rgba = el => (getComputedStyle(el).backgroundColor.match(/[\\d.]+/g) || []).map(Number);
    let c = rgba(document.documentElement);
    if (!(c.length >= 3 && (c[3] ?? 1) > 0)) c = rgba(document.body);
    if (!(c.length >= 3 && (c[3] ?? 1) > 0)) c = [255, 255, 255];
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  })()`);
  return typeof r === 'number' ? r : null;
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

// The manager's UI is driven in its own page: find by visible text or label, set an Angular input, submit a form, wait.
const UI_HELPERS = `const byText = t => [...document.querySelectorAll('button, a, [role=button], [role=menuitem]')].find(e => e.innerText.trim() === t || e.getAttribute('aria-label') === t) || null;
  const setIn = (el, v) => { el.focus(); el.value = v; for (const k of ['input', 'change', 'blur']) el.dispatchEvent(new Event(k, { bubbles: true })); };
  const submit = t => [...document.querySelectorAll('button[type=submit]')].find(b => b.innerText.trim() === t).click();
  const wait = async (f, ms = 15000) => { const end = Date.now() + ms; for (;;) { const v = f(); if (v) return v; if (Date.now() > end) return null; await new Promise(r => setTimeout(r, 200)); } };`;

// A local Vaultwarden: 127.0.0.1 only (checked with ss), a fresh data folder, https on the TLS fixture leaf, no icon
// downloads, no push relay, every outbound request it would make blocked. The caller stops it in a finally.
async function startVaultwarden() {
  const bin = execFileSync('nix', ['build', '--print-out-paths', '--no-link', 'nixpkgs#vaultwarden'], { encoding: 'utf8' }).trim();
  const port = await new Promise(resolve => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const tls = join(live.REPO_ROOT, 'scripts/fixtures/tls');
  const data = mkdtempSync(join(tmpdir(), 'pb-vaultwarden-'));
  // stdio ignored: the server logs access tokens.
  const proc = spawn(join(bin, 'bin/vaultwarden'), [], { stdio: 'ignore', env: {
    PATH: process.env.PATH, ROCKET_ADDRESS: '127.0.0.1', ROCKET_PORT: String(port),
    ROCKET_TLS: `{certs="${join(tls, 'pb-fixture.pem')}",key="${join(tls, 'pb-fixture.key')}"}`,
    DATA_FOLDER: data, DOMAIN: `https://${VAULT_HOST}:${port}`, WEB_VAULT_ENABLED: 'false', SIGNUPS_ALLOWED: 'true',
    DISABLE_ICON_DOWNLOAD: 'true', PUSH_ENABLED: 'false', HTTP_REQUEST_BLOCK_REGEX: '.*',
  } });
  const vault = { proc, data, origin: `https://${VAULT_HOST}:${port}`, exited: new Promise(resolve => proc.once('exit', resolve)) };
  try {
    const ca = readFileSync(join(tls, 'test-ca.pem'));
    const alive = () => new Promise(resolve => {
      const req = httpsRequest({ host: '127.0.0.1', port, path: '/alive', servername: VAULT_HOST, ca }, res => { res.resume(); resolve(res.statusCode === 200); });
      req.on('error', () => resolve(false));
      req.end();
    });
    if (!(await pollUntil(alive, ok => ok === true, 30000))) throw new Error(`BROKEN INSTRUMENT: the local vault server never answered /alive (exit code ${proc.exitCode})`);
    const fault = vaultListenFault(execFileSync('ss', ['-Hltnp'], { encoding: 'utf8' }), proc.pid, port);
    if (fault) throw new Error(`BROKEN INSTRUMENT: ${fault}; refusing to continue`);
    return vault;
  } catch (error) {
    await stopVaultwarden(vault);
    throw error;
  }
}

async function stopVaultwarden(vault) {
  if (vault.proc.exitCode === null && vault.proc.signalCode === null) {
    vault.proc.kill('SIGTERM');
    if ((await Promise.race([vault.exited.then(() => 'exited'), sleep(10000)])) !== 'exited') vault.proc.kill('SIGKILL');
  }
  rmSync(vault.data, { recursive: true, force: true });
  if (existsSync(vault.data)) throw new Error(`BROKEN INSTRUMENT: the vault data folder ${vault.data} survived the run`);
}

// An extension page in a stock-window tab (a web tab refuses extension pages): its BiDi content context.
async function extensionPageInStockTab(app, id, path) {
  await app.evaluateIn(app.chrome, `ChromeUtils.importESModule('chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs').PowerBrowserAPI.openStockTab(${JSON.stringify(`${ORIGIN}/a`)})`);
  const win = await pollUntil(async () => {
    for (const w of (await app.contexts('chrome')).filter(entry => entry.url.startsWith('chrome://browser/content/browser.xhtml'))) {
      if ((await app.evaluateIn(w.context, `typeof gBrowser === 'object' && gBrowser.browsers.some(b => b.currentURI.spec === ${JSON.stringify(`${ORIGIN}/a`)})`)) === true) return w.context;
    }
    return null;
  }, c => c !== null, 30000);
  if (!win) throw new Error(`BROKEN INSTRUMENT: no stock window opened for the extension page (content contexts ${JSON.stringify((await app.contexts()).map(c => c.url))})`);
  const url = await app.evaluateIn(app.chrome, `WebExtensionPolicy.getByID(${JSON.stringify(id)}).getURL(${JSON.stringify(path)})`);
  await app.evaluateIn(win, `(async () => { await delayedStartupPromise; gBrowser.selectedTab = gBrowser.addTab(${JSON.stringify(url)}, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); return true; })()`);
  const page = await pollUntil(async () => (await app.contexts()).find(entry => entry.url.startsWith(url.split('?')[0])) ?? null, c => c !== null, 30000);
  if (!page) throw new Error(`BROKEN INSTRUMENT: the extension page ${path} did not load in the stock tab`);
  return page.context;
}

// The manager's fill command's key, read from its installed manifest (Ctrl+Shift+L style) into pressKey's shape.
async function fillShortcut(app, id) {
  const text = await app.evaluateIn(app.chrome, `WebExtensionPolicy.getByID(${JSON.stringify(id)}).extension.manifest.commands?.autofill_login?.suggested_key?.default ?? null`);
  if (typeof text !== 'string') throw new Error('BROKEN INSTRUMENT: the manager declares no autofill_login key');
  const parts = text.split('+');
  const key = parts.pop().toUpperCase();
  const mods = { Ctrl: 'control', Alt: 'alt', Shift: 'shift', Command: 'meta', MacCtrl: 'control' };
  return { key, code: `Key${key}`, keyCode: key.charCodeAt(0), modifiers: parts.map(p => mods[p]), label: text };
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
  'network.dns.localDomains': [TRACKER_HOST, VAULT_HOST, BREACH_HOST].join(','),
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
      for (const plant of LISTEN_PLANTS) {
        const hit = vaultListenFault(plant.ss, 77, 4100);
        if (hit && hit.includes(plant.expect)) console.log(`  ok  listen plant ${plant.name} -> red: ${hit}`);
        else failures.push(`listen plant ${plant.name} did not go red naming '${plant.expect}': ${hit}`);
      }
      const clean = vaultListenFault('LISTEN 0 128 127.0.0.1:4100 0.0.0.0:* users:(("vaultwarden",pid=77,fd=22))', 77, 4100);
      if (clean) failures.push(`listen control: a 127.0.0.1-only listener was faulted: ${clean}`);
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
