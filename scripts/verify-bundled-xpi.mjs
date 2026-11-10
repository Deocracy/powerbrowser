#!/usr/bin/env node
// scripts/verify-bundled-xpi.mjs
//
// The pre-installed Gecko add-on gate (68-08, BEXT-02, P68-39). uBlock Origin ships as
// <GreD>/distribution/extensions/<id>.xpi, the AMO-signed file byte for byte, pinned by version,
// url and sha256 in powerbrowser/packaging/bundled-xpi.json and staged by
// powerbrowser/packaging/stage-bundled-xpi.sh. Gecko installs it into the profile on first start
// with no network; the user can disable it and remove it, and a removal sticks
// (extensions.installedDistroAddon.<id>). There is no ExtensionSettings policy entry, because its
// install modes forbid removal.
//
// MODES AND TIERS.
//   (default, quick)  The pin file's shape: every id a valid Gecko add-on id, an https url, a
//                     64-hex sha256, an SPDX licence id and an https source. For each pin whose
//                     download is cached at .mozbuild/bundled-xpi/<id>-<version>.xpi: its sha256
//                     equals the pin, its manifest id and version equal the pin, and it is signed
//                     (META-INF/mozilla.rsa or META-INF/cose.sig). The endpoint leg (D-85): every
//                     host uBlock contacts with no user action for its default-on filter lists,
//                     derived from the XPI's assets/assets.json, has an allow row in
//                     powerbrowser/endpoint-allowlist.json; every other list host has a
//                     user-initiated (or allow) row; a row whose reason names BEXT-02 and whose host
//                     the asset table no longer names is stale. No cached XPI is one SKIP line.
//   --packaged (full) The extracted Linux package's distribution/extensions/ holds exactly the
//                     pinned ids as <id>.xpi, each hashing to its pin.
//   --live (full)     On the extracted package (PB_FIREFOX_BIN set to its binary), or with --dev
//                     on the dev objdir (the cached XPI placed in objdir/dist/bin/distribution/
//                     extensions/ for the run, refused when a file is already there, removed
//                     after): one fresh profile, three launches. First start: the add-on is active,
//                     not user-disabled, in the profile scope, installTelemetryInfo.source
//                     distribution, the distribution pref set, and the filtered request never
//                     reaches the loopback server while the control request does. Relaunch with
//                     zero stock windows: still active and filtering. Disabled: the request
//                     arrives. Removed, then relaunched: not reinstalled, the request arrives.
//   --self-test (quick) Hermetic: a fixture XPI zipped in mkdtemp from a fixture manifest,
//                     assets.json, list and LICENSE.txt; the control is green first, then eight
//                     plants (sha256 mismatch, wrong manifest id, missing signature, a default-on host
//                     with no allow row, a stale BEXT-02 row, a packaged tree with an extra XPI, a rule
//                     only inside !#if, an http url) each go red naming it; then the live plant audit.
//   --self-test --live [--dev]  the control session, then one session per plant
//                     (distro-pref-cleared, filter-unproven), each required red naming its text.
//   --self-test --static  the plant audit: each plant is read by its scenario, names text its red
//                     scenario emits, and its branch reports no red itself. No browser.
//
// Usage:
//   node scripts/verify-bundled-xpi.mjs [--packaged | --self-test | --self-test --static]
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-bundled-xpi.mjs --live [--dev]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entryFor } from './lib/endpoint-verdict.mjs';

const NAME = 'verify-bundled-xpi';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PIN_REL = 'powerbrowser/packaging/bundled-xpi.json';
const CACHE_REL = '.mozbuild/bundled-xpi';
const STAGE_CMD = 'bash powerbrowser/packaging/stage-bundled-xpi.sh <dir>';
// upstream/toolkit/mozapps/extensions/internal/XPIProvider.sys.mjs gIDTest: the ids Gecko accepts.
const GECKO_ID = /^(\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}|[a-z0-9-._]*@[a-z0-9-._]+)$/i;
const SPDX_ID = /^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9](\+)?$/;
const SIGNATURES = ['META-INF/mozilla.rsa', 'META-INF/cose.sig'];

// ---------------------------------------------------------------- XPI reading
// No unzip on every host; python3's zipfile is the house reader (verify-ng-072, -073).
const PY_ZIP = `import sys,zipfile
z=zipfile.ZipFile(sys.argv[1])
if sys.argv[2]=='--list': print('\\n'.join(z.namelist()))
else: sys.stdout.buffer.write(z.read(sys.argv[2]))`;
const zipNames = xpi => execFileSync('python3', ['-I', '-c', PY_ZIP, xpi, '--list'], { encoding: 'utf8', maxBuffer: 1 << 26 })
    .split('\n').filter(Boolean);
const zipText = (xpi, member) => execFileSync('python3', ['-I', '-c', PY_ZIP, xpi, member], { encoding: 'utf8', maxBuffer: 1 << 28 });
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');

function readPins(path = join(REPO_ROOT, PIN_REL)) {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('$')));
}
const cachedXpi = (id, pin, root = REPO_ROOT) => join(root, CACHE_REL, `${id}-${pin.version}.xpi`);

// ---------------------------------------------------------------- static legs

/** The pin file's shape. */
function checkPins(pins) {
    const out = [];
    if (Object.keys(pins).length === 0) out.push(`${PIN_REL} pins no add-on`);
    for (const [id, p] of Object.entries(pins)) {
        if (!GECKO_ID.test(id)) out.push(`${id}: not a valid Gecko add-on id`);
        for (const key of ['name', 'version', 'url', 'sha256', 'licence', 'source']) {
            if (typeof p[key] !== 'string' || !p[key]) out.push(`${id}: the pin has no ${key}`);
        }
        if (typeof p.url === 'string' && !p.url.startsWith('https://')) out.push(`${id}: the url is not https: ${p.url}`);
        if (typeof p.source === 'string' && !p.source.startsWith('https://')) out.push(`${id}: the source is not https: ${p.source}`);
        if (typeof p.sha256 === 'string' && !/^[0-9a-f]{64}$/.test(p.sha256)) out.push(`${id}: the sha256 is not 64 lowercase hex digits`);
        if (typeof p.licence === 'string' && !SPDX_ID.test(p.licence)) out.push(`${id}: the licence ${p.licence} is not an SPDX id`);
    }
    return out;
}

/** One cached XPI against its pin: digest, manifest id and version, signature present. */
function checkXpi(id, pin, xpi) {
    const out = [];
    const got = sha256(xpi);
    if (got !== pin.sha256) {
        out.push(`${id}: sha256 mismatch: ${xpi} hashes to ${got}, the pin is ${pin.sha256}`);
        return out;
    }
    const names = new Set(zipNames(xpi));
    const manifest = JSON.parse(zipText(xpi, 'manifest.json'));
    const mid = manifest.browser_specific_settings?.gecko?.id ?? manifest.applications?.gecko?.id;
    if (mid !== id) out.push(`${id}: wrong manifest id: the XPI's manifest names ${mid}`);
    if (manifest.version !== pin.version) out.push(`${id}: the XPI's manifest version ${manifest.version} is not the pinned ${pin.version}`);
    if (!SIGNATURES.some(s => names.has(s))) out.push(`${id}: missing signature: the XPI has neither ${SIGNATURES.join(' nor ')}`);
    return out;
}

/** A packaged distribution/extensions/ directory against the pins, as a set both ways. */
function checkPackagedDir(dir, pins) {
    if (!existsSync(dir)) return [`the package has no ${dir.split('/').slice(-2).join('/')}/ directory`];
    const out = [];
    const want = new Set(Object.keys(pins).map(id => `${id}.xpi`));
    const have = readdirSync(dir);
    for (const f of have) if (!want.has(f)) out.push(`the packaged distribution/extensions/ carries ${f}, which no pin names`);
    for (const f of want) {
        if (!have.includes(f)) { out.push(`the packaged distribution/extensions/ lacks ${f}`); continue; }
        const id = f.slice(0, -'.xpi'.length);
        const got = sha256(join(dir, f));
        if (got !== pins[id].sha256) out.push(`the packaged ${f} hashes to ${got}, the pin is ${pins[id].sha256}`);
    }
    return out;
}

// ---------------------------------------------------------------- endpoint leg (D-85)

const ALLOWLIST_REL = 'powerbrowser/endpoint-allowlist.json';
const ROW_TAG = 'BEXT-02';
const asList = v => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []);
const hostOf = u => { try { return new URL(u).hostname; } catch { return null; } };

/**
 * From uBlock's asset table: every http(s) host in contentURL, cdnURLs and patchURLs of the entries
 * on by default (no "off": true) is unattended (uBlock updates them with no user action); every host
 * of the other entries is user-initiated (fetched once the user turns that list on), minus the
 * unattended hosts.
 */
function deriveHosts(assets) {
    const unattended = new Set();
    const optIn = new Set();
    for (const [key, entry] of Object.entries(assets)) {
        if (!entry || typeof entry !== 'object' || key.startsWith('$')) continue;
        const into = entry.off === true ? optIn : unattended;
        for (const u of [...asList(entry.contentURL), ...asList(entry.cdnURLs), ...asList(entry.patchURLs)]) {
            if (/^https?:\/\//.test(u) && hostOf(u)) into.add(hostOf(u));
        }
    }
    for (const h of unattended) optIn.delete(h);
    return { unattended, optIn };
}

/** The allowlist against the derived hosts: an allow row per unattended host, a row per opt-in host, no stale BEXT-02 row. */
function checkEndpoints({ unattended, optIn }, allowlist, entryFor) {
    const out = [];
    const hosts = allowlist.hosts ?? [];
    for (const h of [...unattended].sort()) {
        const d = entryFor(hosts, h)?.disposition;
        if (d !== 'allow') out.push(`default-on filter list host ${h} has no allow row in ${ALLOWLIST_REL} (${d ? `its row is ${d}` : 'no row'})`);
    }
    for (const h of [...optIn].sort()) {
        const d = entryFor(hosts, h)?.disposition;
        if (d !== 'allow' && d !== 'user-initiated') out.push(`opt-in filter list host ${h} has no user-initiated row in ${ALLOWLIST_REL} (${d ? `its row is ${d}` : 'no row'})`);
    }
    for (const row of hosts.filter(r => String(r.reason ?? '').includes(ROW_TAG))) {
        if (!unattended.has(row.host) && !optIn.has(row.host)) out.push(`stale ${ROW_TAG} row: ${row.host} is named by no entry of the pinned XPI's assets/assets.json`);
    }
    return out;
}

// ---------------------------------------------------------------- the live row's filter rule

// A plain network filter: starts with "/" or "&", URL-safe characters only, not ending in "/" (that
// would read as a regex). No "||" or "|" anchor, no "$" options, no "@@", no wildcard or separator.
const PLAIN_RULE = /^[/&][A-Za-z0-9._\-/&=]*[A-Za-z0-9._\-&=]$/;

/**
 * The first plain generic filter in the first default-on filter list's bundled copy, skipping every
 * line inside a "!#if" block (it may not apply on Firefox). Returns { rule, list, file } or null.
 */
function deriveRule(assets, names, read) {
    for (const [key, entry] of Object.entries(assets)) {
        if (!entry || entry.off === true || entry.content !== 'filters') continue;
        const local = asList(entry.contentURL).find(u => !/^https?:/.test(u) && names.has(u));
        if (!local) continue;
        let depth = 0;
        for (const raw of read(local).split('\n')) {
            const line = raw.trim();
            if (line.startsWith('!#if')) { depth += 1; continue; }
            if (line.startsWith('!#endif')) { depth = Math.max(0, depth - 1); continue; }
            if (depth === 0 && PLAIN_RULE.test(line)) return { rule: line, list: key, file: local };
        }
    }
    return null;
}

function staticLeg(root = REPO_ROOT) {
    const pins = readPins(join(root, PIN_REL));
    const failures = checkPins(pins);
    const skips = [];
    const notes = [];
    for (const [id, pin] of Object.entries(pins)) {
        const xpi = cachedXpi(id, pin, root);
        if (!existsSync(xpi)) {
            skips.push(`${id}: no cached ${CACHE_REL}/${id}-${pin.version}.xpi, so its digest, manifest, signature and endpoint legs were not run (run ${STAGE_CMD})`);
            continue;
        }
        const bad = checkXpi(id, pin, xpi);
        failures.push(...bad);
        notes.push(`${id} ${pin.version}`);
        if (bad.length) continue;
        const assets = JSON.parse(zipText(xpi, 'assets/assets.json'));
        const derived = deriveHosts(assets);
        const allowlist = JSON.parse(readFileSync(join(root, ALLOWLIST_REL), 'utf8'));
        failures.push(...checkEndpoints(derived, allowlist, entryFor));
        notes.push(`${derived.unattended.size + derived.optIn.size} filter list hosts derived from its assets.json `
            + `(${derived.unattended.size} default-on allow, ${derived.optIn.size} opt-in user-initiated)`);
        const rule = deriveRule(assets, new Set(zipNames(xpi)), m => zipText(xpi, m));
        notes.push(rule ? `live filter rule ${rule.rule} from ${rule.list} (${rule.file})` : 'no plain generic filter in a default-on list (the live row cannot derive its fixture)');
        if (!rule) failures.push(`${id}: no plain generic network filter in any default-on filter list, so bundled-xpi-live has no fixture rule`);
    }
    return { failures, skips, notes };
}

async function packagedLeg() {
    const { extractPackage } = await import('./lib/built-tree.mjs');
    let prefix;
    try {
        prefix = extractPackage();
        return checkPackagedDir(join(prefix, 'distribution', 'extensions'), readPins());
    } catch (e) {
        return [`no Linux package to check (${e.message}); build it per docs/BUILD.md "Linux package": nix develop .#firefox --command bash powerbrowser/packaging/package-linux.sh`];
    } finally {
        if (prefix) rmSync(dirname(prefix), { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------- live leg (full)
//
// One fresh profile, three launches through pb-relaunch:
//   launch 1  first-start               the add-on is installed into the profile scope from the
//                                       distribution directory, enabled, and filters;
//   launch 2  relaunch, disable, remove zero stock windows, still active and filtering (a background
//                                       starts only on extensions-late-startup, patch 050); disabled,
//                                       the request arrives; then it is removed;
//   launch 3  removed-after-relaunch    it is not reinstalled and the request arrives.
// The fixture page on 127.0.0.1 requests a control image and an image whose path carries the
// plain generic filter derived from the XPI's own default-on list (deriveRule).

const sleep = ms => new Promise(r => setTimeout(r, ms));
const DISTRO_PREF = id => `extensions.installedDistroAddon.${id}`;
const htmlAttr = t => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** A loopback server recording every request path; page(k) carries the control and fixture images of load k. */
async function serveFixture(rule) {
    const { createServer } = await import('node:http');
    const seen = [];
    const control = k => `/bext02-control-${k}.gif`;
    const fixture = k => `/bext02-${k}${rule}`;
    const server = createServer((req, res) => {
        seen.push(req.url);
        const m = /^\/bext02-page-(\d+)$/.exec(req.url);
        if (m) {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(`<!doctype html><title>bext02 ${m[1]}</title><img src="${htmlAttr(control(m[1]))}"><img src="${htmlAttr(fixture(m[1]))}">`);
            return;
        }
        res.writeHead(200, { 'content-type': 'image/gif' });
        res.end(Buffer.from('R0lGODlhAQABAAAAACwAAAAAAQABAAA=', 'base64'));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    return { n: 0, origin, page: k => `${origin}/bext02-page-${k}`, control, fixture, arrived: path => seen.includes(path), close: () => new Promise(r => server.close(r)) };
}

/** Loads the fixture page once in a web tab; { fixture } is whether the filtered request reached the server. */
async function loadOnce(app, fx, deps, controlMs = 60000) {
    const k = (fx.n += 1);
    await deps.openWebTab(app, fx.page(k));
    try {
        await deps.pollFor(() => fx.arrived(fx.control(k)), controlMs, `the control request of load ${k}`);
    } catch (e) {
        throw new Error(`BROKEN INSTRUMENT: the fixture page's control request never arrived (${e.message})`);
    }
    await sleep(2000);
    return { fixture: fx.arrived(fx.fixture(k)) };
}

/** True when a load within `ms` showed the control request arriving and the fixture request not. */
async function filterHolds(app, fx, deps, ms = 90000) {
    const end = Date.now() + ms;
    do {
        if (!(await loadOnce(app, fx, deps)).fixture) return true;
    } while (Date.now() < end);
    return false;
}

/** The add-on as AddonManager reports it, read in the shell document. */
async function addonState(app, id) {
    return JSON.parse(await app.evaluateIn(app.chrome, `(async () => {
        const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
        const a = await AddonManager.getAddonByID(${JSON.stringify(id)});
        const distroPref = Services.prefs.getBoolPref(${JSON.stringify(DISTRO_PREF(id))}, false);
        return JSON.stringify(a ? { present: true, isActive: a.isActive, userDisabled: a.userDisabled,
            profileScope: a.scope === AddonManager.SCOPE_PROFILE, source: a.installTelemetryInfo?.source ?? null,
            version: a.version, distroPref } : { present: false, distroPref });
    })()`));
}

/** Calls addon.<method>() (disable, enable, uninstall) in the shell document. */
async function addonCall(app, id, method) {
    return app.evaluateIn(app.chrome, `(async () => {
        const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
        const a = await AddonManager.getAddonByID(${JSON.stringify(id)});
        if (!a) return false;
        await a.${method}();
        return true;
    })()`);
}

const stockWindowCount = async app => (await app.contexts('chrome')).filter(e => e.url.startsWith('chrome://browser/content/browser.xhtml')).length;

const LIVE_SCENARIOS = {
    'first-start': async ({ app, id, pin, fx, deps, plant, fail }) => {
        const st = await addonState(app, id);
        if (!st.present) return fail('first start: the pinned add-on was not installed from the distribution directory');
        if (!st.isActive || st.userDisabled) fail(`first start: the add-on is not enabled (isActive ${st.isActive}, userDisabled ${st.userDisabled})`);
        if (!st.profileScope) fail('first start: the add-on is not in the profile scope');
        if (st.source !== 'distribution') fail(`first start: installTelemetryInfo.source is ${st.source}, not distribution`);
        if (st.version !== pin.version) fail(`first start: the installed version is ${st.version}, not the pinned ${pin.version}`);
        if (!st.distroPref) fail(`first start: ${DISTRO_PREF(id)} is not set, so a removal would not stick`);
        if (plant === 'filter-unproven') {
            // The product without its filter: the add-on switched off before the first load.
            await addonCall(app, id, 'disable');
        }
        if (!(await filterHolds(app, fx, deps))) fail('first start: the filtered request reached the loopback server with uBlock Origin installed');
    },
    relaunch: async ({ app, id, fx, deps, fail }) => {
        if ((await stockWindowCount(app)) !== 0) throw new Error('BROKEN INSTRUMENT: the relaunch opened a stock window');
        const st = await addonState(app, id);
        if (!st.present || !st.isActive) return fail(`relaunch: the add-on is not active after a relaunch with no stock window (${JSON.stringify(st)})`);
        if (!(await filterHolds(app, fx, deps))) fail('relaunch: the filtered request reached the loopback server after a relaunch with no stock window');
    },
    disable: async ({ app, id, fx, deps, fail }) => {
        if ((await addonCall(app, id, 'disable')) !== true) return fail('disable: the add-on was not there to disable');
        if (!(await loadOnce(app, fx, deps)).fixture) fail('disable: with the add-on disabled the filtered request still never arrived');
        await addonCall(app, id, 'enable');
        if (!(await filterHolds(app, fx, deps))) fail('disable: re-enabled, the add-on no longer filters');
    },
    remove: async ({ app, id, plant, fail }) => {
        if ((await addonCall(app, id, 'uninstall')) !== true) return fail('remove: the add-on was not there to remove');
        const st = await addonState(app, id);
        if (st.present) fail('remove: the add-on is still listed after uninstall');
        if (plant === 'distro-pref-cleared') {
            // The product without the record that keeps a removal: the next start would reinstall.
            await app.evaluateIn(app.chrome, `(() => { Services.prefs.clearUserPref(${JSON.stringify(DISTRO_PREF(id))}); return true; })()`);
        }
    },
    'removed-after-relaunch': async ({ app, id, fx, deps, fail }) => {
        const st = await addonState(app, id);
        if (st.present) fail('removed after relaunch: the removed add-on was reinstalled after a relaunch');
        if (!(await loadOnce(app, fx, deps)).fixture) fail('removed after relaunch: the filtered request never arrived with the add-on removed');
    },
};
const LAUNCHES = [['first-start'], ['relaunch', 'disable', 'remove'], ['removed-after-relaunch']];

// Each plant: the scenario that applies it, and the scenario that must go red with `expect`.
const LIVE_PLANTS = {
    'distro-pref-cleared': { applies: 'remove', scenario: 'removed-after-relaunch', expect: 'the removed add-on was reinstalled' },
    'filter-unproven': { applies: 'first-start', scenario: 'first-start', expect: 'the filtered request reached the loopback server' },
};

/** The static audit: each plant is read by its applying scenario, names text its red scenario emits, and its branch emits no red itself. */
function liveAudit(plants = LIVE_PLANTS, scenarios = LIVE_SCENARIOS) {
    const out = [];
    for (const [name, p] of Object.entries(plants)) {
        const applies = scenarios[p.applies];
        const red = scenarios[p.scenario];
        if (!applies || !red) { out.push(`plant ${name} targets an unknown scenario (${p.applies}, ${p.scenario})`); continue; }
        const text = applies.toString();
        const at = text.indexOf(`plant === '${name}'`);
        if (at < 0) out.push(`plant ${name}: scenario ${p.applies} never reads it, so the plant would not apply`);
        if (!red.toString().includes(p.expect)) out.push(`plant ${name}: scenario ${p.scenario} emits no text '${p.expect}'`);
        if (at >= 0) {
            const open = text.indexOf('{', at);
            let depth = 0;
            let end = open;
            for (let i = open; i < text.length; i++) {
                depth += text[i] === '{' ? 1 : text[i] === '}' ? -1 : 0;
                if (depth === 0) { end = i; break; }
            }
            if (/\bfail\(|throw /.test(text.slice(open, end + 1))) out.push(`plant ${name}: its branch in ${p.applies} reports a red itself, so it is red whatever the product does`);
        }
    }
    for (const launch of LAUNCHES) for (const sc of launch) if (!scenarios[sc]) out.push(`launch order names the unknown scenario ${sc}`);
    return out;
}

/** One session: a fresh profile through the three launches. Returns the failures. */
async function liveSession({ id, pin, rule, plant }) {
    const relaunch = await import('./lib/pb-relaunch.mjs');
    const { openWebTab } = await import('./lib/pb-live-probe.mjs');
    const deps = { openWebTab, pollFor: relaunch.pollFor };
    const failures = [];
    const fail = t => { failures.push(t); };
    const fx = await serveFixture(rule.rule);
    const profile = await relaunch.makeProfile();
    // The remote agent's recommended preferences set extensions.installDistroAddons to false at runtime and that
    // value reaches prefs.js, so a relaunch would skip the distribution directory whatever the add-on's record says
    // and launch 3 would prove nothing. user.js is read at every start, before the add-on manager starts.
    appendFileSync(join(profile.profileDir, 'user.js'), 'user_pref("extensions.installDistroAddons", true);\n');
    process.env.MOZ_PURGE_CACHES = '1';
    try {
        for (const [i, launch] of LAUNCHES.entries()) {
            await relaunch.withShell(profile, async app => {
                for (const sc of launch) await LIVE_SCENARIOS[sc]({ app, id, pin, fx, deps, plant, fail });
                if (i < LAUNCHES.length - 1 && (await app.quit()) !== 'exited') throw new Error('BROKEN INSTRUMENT: the shell did not quit before the relaunch');
            });
        }
    } catch (e) {
        failures.push(e.message.startsWith('BROKEN INSTRUMENT') ? e.message : `harness: ${e.message}`);
    } finally {
        await profile.dispose();
        await fx.close();
    }
    return failures;
}

/** --live [--dev] [--self-test]: the target, then the control session and (self-test) one session per plant. */
async function liveLeg({ dev, selfTest }) {
    const pins = readPins();
    const [[id, pin], ...more] = Object.entries(pins);
    if (more.length) console.log(`${NAME} --live: NOTE -- the live row drives ${id} only; ${more.map(([k]) => k).join(', ')} are covered by the static and packaged legs`);
    const xpi = cachedXpi(id, pin);
    if (!existsSync(xpi)) return [`no cached ${CACHE_REL}/${id}-${pin.version}.xpi; run ${STAGE_CMD} first`];
    const bad = checkXpi(id, pin, xpi);
    if (bad.length) return bad;
    const rule = deriveRule(JSON.parse(zipText(xpi, 'assets/assets.json')), new Set(zipNames(xpi)), m => zipText(xpi, m));
    if (!rule) return [`${id}: no plain generic network filter in a default-on list, so there is no fixture rule`];
    console.log(`${NAME} --live: fixture rule ${rule.rule} (from ${rule.list}, ${rule.file})`);

    let placed = null;
    let prefix = null;
    const made = [];
    try {
        if (dev) {
            const { FIREFOX_BIN } = await import('./lib/firefox-bidi.mjs');
            const extDir = join(dirname(FIREFOX_BIN), 'distribution', 'extensions');
            const target = join(extDir, `${id}.xpi`);
            if (existsSync(target)) return [`${target} already exists and this check did not place it; remove it or run the packaged target`];
            for (const d of [dirname(extDir), extDir]) if (!existsSync(d)) { mkdirSync(d); made.unshift(d); }
            copyFileSync(xpi, target);
            placed = target;
        } else {
            const { extractPackage } = await import('./lib/built-tree.mjs');
            const { resolveConfig } = await import('./generate.mjs');
            try {
                prefix = extractPackage();
            } catch (e) {
                return [`no Linux package to run (${e.message}); build it per docs/BUILD.md "Linux package"`];
            }
            const bin = join(prefix, resolveConfig(join(REPO_ROOT, 'configuration.toml'), undefined).config.identity.binary_name);
            const packaged = checkPackagedDir(join(prefix, 'distribution', 'extensions'), pins);
            if (packaged.length) return packaged;
            process.env.PB_FIREFOX_BIN = bin;
        }
        const failures = [];
        const control = await liveSession({ id, pin, rule, plant: null });
        if (control.length) return control;
        console.log(`  ok  control: installed from the distribution directory, enabled and filtering; filtering after a relaunch with no stock window; disabled lets the request through; removed stays removed after a relaunch`);
        if (selfTest) {
            for (const [name, p] of Object.entries(LIVE_PLANTS)) {
                const got = await liveSession({ id, pin, rule, plant: name });
                const hit = got.find(f => f.includes(p.expect));
                if (hit) console.log(`  ok  plant ${name} -> red: ${hit}`);
                else failures.push(`plant ${name} did not go red naming '${p.expect}' (got: ${got.join(' | ') || 'green'})`);
            }
        }
        return failures;
    } finally {
        if (placed) rmSync(placed, { force: true });
        for (const d of made) { try { rmdirSync(d); } catch { /* not empty: leave it */ } }
        if (prefix) rmSync(dirname(prefix), { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------- --self-test (quick, hermetic)

const PY_ZIP_WRITE = `import os,sys,zipfile
z=zipfile.ZipFile(sys.argv[1],'w')
for r,_,fs in os.walk(sys.argv[2]):
    for f in fs:
        p=os.path.join(r,f); z.write(p, os.path.relpath(p, sys.argv[2]))
z.close()`;

/** A fixture root: pin file, cached XPI, allowlist. `o` varies one input. */
function fixtureRoot(base, name, o = {}) {
    const root = join(base, name);
    const src = join(root, 'src');
    const put = (rel, body) => { mkdirSync(dirname(join(src, rel)), { recursive: true }); writeFileSync(join(src, rel), body); };
    const id = 'fx@fixture.invalid';
    put('manifest.json', JSON.stringify({ manifest_version: 2, name: 'fx', version: '1.0.0', browser_specific_settings: { gecko: { id: o.manifestId ?? id } } }));
    put('LICENSE.txt', 'GNU GENERAL PUBLIC LICENSE\n');
    put('assets/assets.json', JSON.stringify({
        'list-on': { content: 'filters', contentURL: ['https://on.example.invalid/list.txt', 'assets/list-on.txt'], cdnURLs: ['https://cdn.example.invalid/list.txt'] },
        'list-off': { content: 'filters', off: true, contentURL: 'https://off.example.invalid/list.txt' },
    }));
    put('assets/list-on.txt', o.ruleOnlyInIf ? '!#if env_chromium\n/fx-ad.js\n!#endif\n' : '! comment\n||ads.example.invalid^\n/fx-ad.js\n');
    if (!o.unsigned) put('META-INF/cose.sig', 'sig');
    mkdirSync(join(root, CACHE_REL), { recursive: true });
    const xpi = join(root, CACHE_REL, `${id}-1.0.0.xpi`);
    execFileSync('python3', ['-I', '-c', PY_ZIP_WRITE, xpi, src]);
    const pin = { name: 'Fixture', version: '1.0.0', url: 'https://example.invalid/fx.xpi', sha256: o.sha256 ?? sha256(xpi), licence: 'GPL-3.0-or-later', source: 'https://example.invalid/src/1.0.0' };
    mkdirSync(join(root, dirname(PIN_REL)), { recursive: true });
    writeFileSync(join(root, PIN_REL), JSON.stringify({ $comment: 'fixture', [id]: pin }));
    const row = h => ({ host: h, disposition: h.startsWith('off') ? 'user-initiated' : 'allow', reason: `${ROW_TAG} fixture` });
    const hosts = (o.hosts ?? ['on.example.invalid', 'cdn.example.invalid', 'off.example.invalid']).map(row);
    writeFileSync(join(root, ALLOWLIST_REL), JSON.stringify({ hosts: [...hosts, { host: 'other.example.invalid', disposition: 'allow', reason: 'unrelated' }] }));
    return { root, id, pin, xpi };
}

function selfTest() {
    const base = mkdtempSync(join(tmpdir(), 'bundled-xpi-self-test-'));
    const failures = [];
    try {
        const control = fixtureRoot(base, 'control');
        const c = staticLeg(control.root);
        const pkg = join(base, 'pkg');
        mkdirSync(pkg);
        copyFileSync(control.xpi, join(pkg, `${control.id}.xpi`));
        const cp = checkPackagedDir(pkg, { [control.id]: control.pin });
        const rule = deriveRule(JSON.parse(zipText(control.xpi, 'assets/assets.json')), new Set(zipNames(control.xpi)), m => zipText(control.xpi, m));
        if (c.failures.length || c.skips.length || cp.length || rule?.rule !== '/fx-ad.js') {
            return [`the control is not green: ${[...c.failures, ...c.skips, ...cp].join(' | ') || `derived rule ${rule?.rule}`}`];
        }
        console.log('  ok  control: pins, cached XPI, endpoint rows and packaged tree green; derived rule /fx-ad.js');
        const plants = [
            ['sha256 mismatch', () => staticLeg(fixtureRoot(base, 'p1', { sha256: '0'.repeat(64) }).root).failures, 'sha256 mismatch'],
            ['wrong manifest id', () => staticLeg(fixtureRoot(base, 'p2', { manifestId: 'other@fixture.invalid' }).root).failures, 'wrong manifest id'],
            ['missing signature file', () => staticLeg(fixtureRoot(base, 'p3', { unsigned: true }).root).failures, 'missing signature'],
            ['default-on host with no allow row', () => staticLeg(fixtureRoot(base, 'p4', { hosts: ['on.example.invalid', 'off.example.invalid'] }).root).failures, 'default-on filter list host cdn.example.invalid has no allow row'],
            ['stale BEXT-02 row', () => staticLeg(fixtureRoot(base, 'p5', { hosts: ['on.example.invalid', 'cdn.example.invalid', 'off.example.invalid', 'gone.example.invalid'] }).root).failures, 'stale BEXT-02 row: gone.example.invalid'],
            ['packaged tree with an extra XPI', () => { copyFileSync(control.xpi, join(pkg, 'extra@fixture.invalid.xpi')); return checkPackagedDir(pkg, { [control.id]: control.pin }); }, 'carries extra@fixture.invalid.xpi'],
            ['rule only inside !#if', () => staticLeg(fixtureRoot(base, 'p7', { ruleOnlyInIf: true }).root).failures, 'no plain generic network filter'],
            ['pin url not https', () => checkPins({ [control.id]: { ...control.pin, url: 'http://example.invalid/fx.xpi' } }), 'the url is not https'],
        ];
        for (const [name, run, expect] of plants) {
            const got = run();
            const hit = got.find(f => f.includes(expect));
            if (hit) console.log(`  ok  plant ${name} -> red: ${hit}`);
            else failures.push(`plant ${name} did not go red naming '${expect}' (got: ${got.join(' | ') || 'green'})`);
        }
        failures.push(...liveAuditSelfTest());
        return failures;
    } finally {
        rmSync(base, { recursive: true, force: true });
    }
}

function usage(args) {
    console.error(`usage: node scripts/verify-bundled-xpi.mjs [--packaged | --live [--dev] | --self-test --static | --self-test --live [--dev]]  (got: ${args.join(' ')})`);
    process.exit(2);
}

// The live audit's own plants: each must make liveAudit report the named drift.
function liveAuditSelfTest() {
    const failures = liveAudit();
    const audits = [
        { name: 'unknown scenario', plants: { stray: { applies: 'nowhere', scenario: 'first-start', expect: 'x' } }, expect: 'targets an unknown scenario' },
        { name: 'unemitted expect', plants: { 'filter-unproven': { ...LIVE_PLANTS['filter-unproven'], expect: 'zz never printed' } }, expect: "emits no text 'zz never printed'" },
        { name: 'unread plant', plants: { 'never-read': { applies: 'disable', scenario: 'disable', expect: 'disable:' } }, expect: 'never reads it' },
        { name: 'plant reds itself', scenarios: { ...LIVE_SCENARIOS, remove: async ({ plant, fail }) => { if (plant === 'distro-pref-cleared') { fail('x'); } } }, expect: 'reports a red itself' },
    ];
    for (const a of audits) {
        const hit = liveAudit(a.plants ?? LIVE_PLANTS, a.scenarios ?? LIVE_SCENARIOS).find(f => f.includes(a.expect));
        if (hit) console.log(`  ok  audit plant ${a.name} -> red: ${hit}`);
        else failures.push(`audit plant ${a.name} did not go red naming '${a.expect}'`);
    }
    return failures;
}

function report(label, failures, skips = [], pass = '') {
    for (const s of skips) console.log(`${label}: SKIP -- ${s}`);
    if (failures.length) {
        console.error(`${label}: FAIL -- ${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
        process.exit(1);
    }
    console.log(`${label}: PASS -- ${pass}`);
    process.exit(0);
}

const args = process.argv.slice(2);
if (args.length === 0) {
    const r = staticLeg();
    report(NAME, r.failures, r.skips, `the pins are well formed${r.notes.length ? `; ${r.notes.join('; ')}` : ''}`);
} else if (args.length === 1 && args[0] === '--packaged') {
    report(`${NAME} --packaged`, await packagedLeg(), [], 'the package\'s distribution/extensions/ holds exactly the pinned XPIs, each equal to its pin');
} else if (args.length === 1 && args[0] === '--self-test') {
    report(`${NAME} --self-test`, selfTest(), [], 'the control is green and every plant went red naming its fault; the live plant audit holds');
} else if (args.length === 2 && args.includes('--self-test') && args.includes('--static')) {
    report(`${NAME} --self-test --static`, liveAuditSelfTest(), [], `${Object.keys(LIVE_PLANTS).length} live plant(s) each read by their scenario, naming text their red scenario emits; the live sessions were not run`);
} else if (args[0] === '--live' || (args[0] === '--self-test' && args[1] === '--live')) {
    const rest = new Set(args);
    const dev = rest.delete('--dev');
    const selfTest = rest.delete('--self-test');
    rest.delete('--live');
    if (rest.size) usage(args);
    const audit = liveAudit();
    if (audit.length) report(`${NAME} --live`, audit.map(a => `harness: ${a}`));
    const target = dev ? 'the dev objdir' : 'the extracted Linux package';
    report(`${NAME}${selfTest ? ' --self-test' : ''} --live${dev ? ' --dev' : ''}`, await liveLeg({ dev, selfTest }), [],
        `on ${target}: first start installed and enabled it in the profile scope and it blocked the fixture request; after a relaunch with no stock window it still filtered; disabled, the request arrived; removed, it stayed removed after a relaunch${selfTest ? `; ${Object.keys(LIVE_PLANTS).length} plant(s) went red` : ''}`);
} else {
    usage(args);
}
