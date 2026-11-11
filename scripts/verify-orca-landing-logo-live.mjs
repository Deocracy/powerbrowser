#!/usr/bin/env node
// scripts/verify-orca-landing-logo-live.mjs
//
// orca-landing-logo-live (full; Phase 67 plan 05, INJ-01, P67-22..P67-27, P67-29, A-9). ROADMAP Phase 67 criterion 5:
// Orca's landing page shows the PowerBrowser mark, only on orcad's own origin.
//
// One built PowerBrowser on a repo-local profile (makeProfile: a fresh data root, so no workspace exists) with orcad
// on a free port, every inherited ORCA_* removed, MOZ_PURGE_CACHES=1, all output through installOutputRedaction. The
// pairing offer is read from the bridge folder into memory and entered only into Orca's connect form field through the
// page, never put in a URL, a log line or this output. A scratch bin folder first on PATH holds a gh stub that appends
// one line to a scratch counter file and exits 1 (P67-27: orcad inherits PATH through its allowlist).
//   1. Positive control first: a Node HTTP proxy on a second 127.0.0.1 port forwards every request to orcad; its page
//      in a PB web tab is paired through the form and Landing's tile must hold exactly one element matched by the
//      version's selectors whose src is not the PB mark ("selector blind" when none match): the actor is port-gated.
//   2. orcad's own address in a PB web tab, paired the same way: exactly one matched element, its src decoding to the
//      bytes of brand/mark.svg and its alt equal to OrcaEnv.ORCA_LOGO_ALT, within 15 s.
//   3. The same in a stock window opened on orcad's address.
//   4. The Theia document untouched: the query that finds the mark in the orcad page finds nothing in the Theia frame.
//   5. Remount (A-9): a scratch repository added through Orca's CLI (environment built from scratch), a worktree
//      created and activated so Landing unmounts in the web tab (the matched element gone), its tabs closed so Orca
//      leaves the emptied worktree and Landing mounts again, and the new element must carry the PB mark.
//   Recorded, not asserted: how many times Landing asked gh for the GitHub star state.
// Every absence follows a positive read by the same query (CLAUDE.md verification rule 1).
//
// --self-test: the pure verdicts over planted observations (quick).
// Runs under flock <git common dir>/pb-live.lock (re-execs itself under it unless PB_LIVE_LOCK_HELD=1).

import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LABEL = 'orca-landing-logo-live';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const MARK_REL = 'brand/mark.svg';
const ORCA_LOGO_ALT = 'PowerBrowser logo';

/** The decoded text of a data: URI, or null. */
export function decodeDataUri(src) {
    const m = /^data:([^,]*),(.*)$/s.exec(String(src ?? ''));
    if (!m) return null;
    try {
        return /;base64$/i.test(m[1]) ? Buffer.from(m[2], 'base64').toString('utf8') : decodeURIComponent(m[2]);
    } catch {
        return null;
    }
}

/** A page's tile: exactly one matched element, src decoding to the mark's bytes, alt equal to the text. */
export function markVerdict({ count, src, alt }, markText, where) {
    if (count === 0) return [`${where}: no element matched the version's selectors (the PB mark was not applied)`];
    if (count !== 1) return [`${where}: ${count} elements matched the selectors, expected exactly one`];
    if (decodeDataUri(src) !== markText) return [`${where}: the matched element's src is not the PB mark (foreign src)`];
    if (alt !== ORCA_LOGO_ALT) return [`${where}: the matched element's alt is not '${ORCA_LOGO_ALT}' (wrong alt)`];
    return [];
}

/** The proxy page (another port): exactly one matched element still holding Orca's own logo. */
export function controlVerdict({ count, src }, markText) {
    if (count === 0) return ['proxy control: no element matched the version\'s selectors (selector blind)'];
    if (count !== 1) return [`proxy control: ${count} elements matched the selectors, expected exactly one`];
    if (decodeDataUri(src) === markText) return ['proxy control: the PB mark was applied on a port that is not orcad\'s'];
    return [];
}

/** The Theia document holds no injected attribute, judged only after the same query found one in the orcad page. */
export function theiaVerdict({ theia, orcad }) {
    if (!(orcad > 0)) return ['theia: the injected-attribute query found nothing in the orcad page, so its absence in Theia proves nothing'];
    if (theia !== 0) return [`theia: ${theia} injected attribute(s) in the Theia document`];
    return [];
}

/** Landing unmounted (the element gone after activation) and remounted carrying the PB mark. */
export function remountVerdict({ unmounted, after }, markText) {
    if (!unmounted) return ['remount: Landing did not unmount when a worktree was activated'];
    return markVerdict(after, markText, 'remount').map((f) => f.replace(/^remount: /, 'remount: after Landing mounted again, '));
}

function selfTest() {
    const mark = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>';
    const ours = `data:image/svg+xml,${encodeURIComponent(mark)}`;
    const foreign = `data:image/svg+xml,${encodeURIComponent('<svg>Orca</svg>')}`;
    const good = { count: 1, src: ours, alt: ORCA_LOGO_ALT };
    const cases = [
        ['control: orcad page with the PB mark', null, () => markVerdict(good, mark, 'orcad web tab')],
        ['control: base64 form of the mark', null, () => markVerdict({ ...good, src: `data:image/svg+xml;base64,${Buffer.from(mark).toString('base64')}` }, mark, 'x')],
        ['control: proxy page with Orca\'s logo', null, () => controlVerdict({ count: 1, src: foreign }, mark)],
        ['control: Theia untouched after a positive read', null, () => theiaVerdict({ theia: 0, orcad: 1 })],
        ['control: remount carrying the mark', null, () => remountVerdict({ unmounted: true, after: good }, mark)],
        ['a foreign src', 'foreign src', () => markVerdict({ ...good, src: foreign }, mark, 'orcad web tab')],
        ['a wrong alt', 'wrong alt', () => markVerdict({ ...good, alt: 'Orca logo' }, mark, 'orcad web tab')],
        ['no match on orcad\'s page', 'not applied', () => markVerdict({ count: 0 }, mark, 'orcad web tab')],
        ['zero matches on the proxy', 'selector blind', () => controlVerdict({ count: 0 }, mark)],
        ['the mark on the proxy port', 'not orcad\'s', () => controlVerdict({ count: 1, src: ours }, mark)],
        ['an injected attribute in the Theia DOM', 'injected attribute', () => theiaVerdict({ theia: 1, orcad: 1 })],
        ['a blind Theia query', 'proves nothing', () => theiaVerdict({ theia: 0, orcad: 0 })],
        ['a remount showing Orca\'s logo', 'foreign src', () => remountVerdict({ unmounted: true, after: { count: 1, src: foreign, alt: 'Orca logo' } }, mark)],
        ['Landing never unmounted', 'did not unmount', () => remountVerdict({ unmounted: false, after: good }, mark)],
    ];
    let bad = 0;
    for (const [label, naming, run] of cases) {
        const got = run();
        const ok = naming === null ? got.length === 0 : got.some((f) => f.includes(naming));
        if (ok) console.log(`  ok  ${label}${naming ? ` -> red, naming '${got.find((f) => f.includes(naming))}'` : ' -> green'}`);
        else { console.log(`  FAIL ${label}: ${got.join(' | ') || 'green'}`); bad += 1; }
    }
    console.log(bad ? `${LABEL} self-test: FAIL -- ${bad} of ${cases.length} case(s)` : `${LABEL} self-test: PASS -- ${cases.length} cases, controls green and each planted fault red by name`);
    return bad ? 1 : 0;
}

/** A forwarding proxy on a free 127.0.0.1 port: HTTP requests and upgrades go to orcad's port unchanged. */
async function startProxy(targetPort) {
    const server = createServer((req, res) => {
        const up = httpRequest({ host: '127.0.0.1', port: targetPort, method: req.method, path: req.url, headers: req.headers }, (r) => {
            res.writeHead(r.statusCode ?? 502, r.headers);
            r.pipe(res);
        });
        up.on('error', () => { res.writeHead(502); res.end(); });
        req.pipe(up);
    });
    server.on('upgrade', (req, socket, head) => {
        const up = connect(targetPort, '127.0.0.1', () => {
            up.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
            if (head?.length) up.write(head);
            socket.pipe(up).pipe(socket);
        });
        up.on('error', () => socket.destroy());
        socket.on('error', () => up.destroy());
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return { port: server.address().port, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) };
}

async function live() {
    if (process.env.PB_LIVE_LOCK_HELD !== '1') {
        const common = execFileSync('git', ['-C', REPO, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
        const r = spawnSync('flock', [join(common, 'pb-live.lock'), process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
            { stdio: 'inherit', env: { ...process.env, PB_LIVE_LOCK_HELD: '1' } });
        return r.status ?? 1;
    }
    for (const key of Object.keys(process.env)) if (key.startsWith('ORCA_')) delete process.env[key];
    const { prerequisites, withOrcaTabsSession } = await import(join(REPO, 'scripts/lib/orca-tabs-live.mjs'));
    const pre = prerequisites({ root: REPO });
    if (pre.skip) { console.log(`${LABEL}: SKIP -- ${pre.skip}`); return 0; }
    if (pre.fail) { console.log(`${LABEL}: FAIL -- ${pre.fail}`); return 1; }
    const OrcaEnv = await import(pathToFileURL(join(REPO, 'powerbrowser/shell/OrcaEnv.sys.mjs')).href);
    const { sourceConst } = await import(join(REPO, 'scripts/lib/pb-relaunch.mjs'));
    const OPEN_BROWSER_WINDOW = sourceConst('theia/extensions/tab-uris/src/browser/browser-window-command.ts', 'OPEN_BROWSER_WINDOW_COMMAND_ID');
    const markText = readFileSync(join(REPO, MARK_REL), 'utf8');

    // The gh stub, first on PATH for PowerBrowser and so for orcad; it counts calls and answers nothing.
    mkdirSync(join(REPO, '.mozbuild'), { recursive: true });
    const ghDir = mkdtempSync(join(REPO, '.mozbuild', 'pb-landing-gh-'));
    const ghCount = join(ghDir, 'calls');
    writeFileSync(join(ghDir, 'gh'), `#!/bin/sh\necho call >> '${ghCount}'\nexit 1\n`);
    chmodSync(join(ghDir, 'gh'), 0o755);
    const savedPath = process.env.PATH;
    process.env.PATH = `${ghDir}:${savedPath ?? ''}`;

    const failures = [];
    const passes = [];
    let proxy = null;
    try {
        await withOrcaTabsSession({ log: (l) => console.log(l) }, async (ctx) => {
            const { app, pollFor } = ctx;
            const state = await ctx.orcaState();
            const selectors = OrcaEnv.logoSelectorsFor(state.orcaVersion);
            if (!selectors) { failures.push(`no selector entry for the running Orca ${state.orcaVersion}`); return; }
            const input = await ctx.pairingInputFromFile();
            if (!input) { failures.push('no pairing offer in the bridge folder'); return; }
            const S = JSON.stringify(selectors);
            const tileRead = `JSON.stringify((() => { const els = ${S}.flatMap(s => [...document.querySelectorAll(s)]);
                return { count: els.length, src: els[0] ? els[0].getAttribute('src') : null, alt: els[0] ? els[0].getAttribute('alt') : null }; })())`;
            const injectedCount = (src) => `[...document.querySelectorAll('[src], [alt]')].filter(e => e.getAttribute('src') === ${JSON.stringify(src)} || e.getAttribute('alt') === ${JSON.stringify(ORCA_LOGO_ALT)}).length`;
            const pageOn = async (prefix, where, exclude = []) => {
                const page = await pollFor(async () => (await app.contexts()).find((e) => e.url.startsWith(prefix) && !exclude.includes(e.context)), 20000, `the page in ${where}`);
                await pollFor(async () => (await app.evaluateIn(page.context, `document.readyState === 'complete' && document.getElementById('root') !== null`).catch(() => false)) || undefined, 30000, `the document in ${where}`);
                return page;
            };
            // The offer goes only into the connect form's field, through the page.
            // A page on an origin that is already paired (a stock window after the web tab: one origin, one storage)
            // boots straight to the client and shows no form; that page needs no pairing.
            const pair = async (page, where) => {
                const seen = await pollFor(async () => (await app.evaluateIn(page.context, `document.getElementById('web-runtime-pairing-code') !== null ? 'form' : (${S}.some(s => document.querySelector(s)) ? 'paired' : '')`).catch(() => '')) || undefined, 30000, `Orca's connect form or its landing tile in ${where}`);
                if (seen === 'paired') return;
                const done = await app.evaluateIn(page.context, `(() => {
                    const el = document.getElementById('web-runtime-pairing-code');
                    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(input)});
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    return true; })()`);
                if (done !== true) throw new Error(`the pairing field in ${where} could not be filled`);
                await pollFor(async () => (await app.evaluateIn(page.context, `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Connect'); if (!b || b.disabled) return false; b.click(); return true; })()`).catch(() => false)) || undefined, 15000, `the Connect button in ${where}`);
            };
            const tile = async (page, where, wantMark, ms) => {
                let last = { count: 0, src: null, alt: null };
                await pollFor(async () => {
                    last = JSON.parse(await app.evaluateIn(page.context, tileRead).catch(() => '{"count":0}'));
                    return last.count > 0 && (decodeDataUri(last.src) === markText) === wantMark ? true : undefined;
                }, ms, `the landing tile in ${where}`).catch(() => undefined);
                return last;
            };

            // 1. Positive control: Orca's own logo on a page served from another port.
            proxy = await startProxy(state.port);
            const proxyPrefix = `http://127.0.0.1:${proxy.port}/`;
            await ctx.openWebTab(proxyPrefix);
            const proxyPage = await pageOn(proxyPrefix, 'the proxy web tab');
            await pair(proxyPage, 'the proxy web tab');
            const control = await tile(proxyPage, 'the proxy web tab', false, 30000);
            const c = controlVerdict(control, markText);
            if (c.length) { failures.push(...c); return; }
            passes.push(`ok  proxy control: Orca's own logo on port ${proxy.port} (1 element matched, src not the PB mark)`);

            // 2. orcad's own address in a PB web tab.
            const orcadPrefix = `http://127.0.0.1:${state.port}/`;
            await ctx.openWebTab(orcadPrefix);
            const tabPage = await pageOn(orcadPrefix, 'the orcad web tab');
            await pair(tabPage, 'the orcad web tab');
            const inTab = await tile(tabPage, 'the orcad web tab', true, 30000);
            const t = markVerdict(inTab, markText, 'orcad web tab');
            failures.push(...t);
            if (!t.length) passes.push(`ok  orcad web tab: the PB mark (brand/mark.svg bytes) and alt '${ORCA_LOGO_ALT}' on port ${state.port}`);

            // 3. A stock window on orcad's address.
            await ctx.probe(`await get('CommandRegistry').executeCommand(${JSON.stringify(OPEN_BROWSER_WINDOW)}, ${JSON.stringify(orcadPrefix)}); return {};`);
            const stockPage = await pageOn(orcadPrefix, 'the stock window', [tabPage.context]);
            await pair(stockPage, 'the stock window');
            const inStock = await tile(stockPage, 'the stock window', true, 30000);
            const s = markVerdict(inStock, markText, 'stock window');
            failures.push(...s);
            if (!s.length) passes.push('ok  stock window: the PB mark and its alt on orcad\'s address');

            // 4. The Theia document untouched, after the same query found the mark in the orcad page.
            const markSrc = inTab.src ?? '';
            const orcad = await app.evaluateIn(tabPage.context, injectedCount(markSrc));
            const theia = await app.evaluate(injectedCount(markSrc));
            const th = theiaVerdict({ theia, orcad });
            failures.push(...th);
            if (!th.length) passes.push(`ok  Theia document: 0 injected attributes (the same query found ${orcad} in the orcad page)`);

            // 5. Remount (A-9): a worktree activated, then removed.
            const created = ctx.orca('worktree', 'create', '--repo', `path:${ctx.repo}`, '--name', 'landing-remount', '--activate');
            const createdPath = (created?.result ?? created)?.worktree?.path;
            let unmounted = await pollFor(async () => (JSON.parse(await app.evaluateIn(tabPage.context, tileRead)).count === 0) || undefined, 15000, 'Landing to unmount').then(() => true, () => false);
            if (!unmounted) {
                // The CLI's activation targets the host; a user activates it in the page's sidebar.
                await app.evaluateIn(tabPage.context, `(() => { const el = [...document.querySelectorAll('button, [role="button"], [role="treeitem"], a, div')].reverse().find(e => e.textContent.trim() === 'landing-remount'); if (el) el.click(); return !!el; })()`);
                unmounted = await pollFor(async () => (JSON.parse(await app.evaluateIn(tabPage.context, tileRead)).count === 0) || undefined, 15000, 'Landing to unmount').then(() => true, () => false);
            }
            let after = { count: 0 };
            if (unmounted) {
                // Orca leaves an emptied worktree and lands (workspace-emptied-reaction.ts); removing the worktree would
                // activate the repository's main worktree instead (measured live), so its tabs are closed.
                ctx.orca('terminal', 'close', '--worktree', createdPath ? `path:${createdPath}` : 'landing-remount', '--all');
                after = await tile(tabPage, 'the orcad web tab after the remount', true, 30000);
            }
            const r = remountVerdict({ unmounted, after }, markText);
            failures.push(...r);
            if (!r.length) passes.push('ok  remount: Landing unmounted on activation and mounted again carrying the PB mark');
        });
    } catch (e) {
        failures.push(`harness: ${e.message}`);
    } finally {
        if (proxy) await proxy.close();
        process.env.PATH = savedPath;
        const calls = existsSync(ghCount) ? readFileSync(ghCount, 'utf8').split('\n').filter(Boolean).length : 0;
        passes.push(`recorded: Landing's GitHub star query called gh ${calls} time(s) (stub answered nothing)`);
        rmSync(ghDir, { recursive: true, force: true });
    }
    for (const p of passes) console.log(`  ${p}`);
    for (const f of failures) console.log(`${LABEL}: FAIL -- ${f}`);
    console.log(failures.length
        ? `${LABEL}: FAIL -- ${failures.length} leg(s)`
        : `${LABEL}: PASS -- Orca's own logo on another port; the PB mark and its alt on orcad's origin in a web tab and a stock window, never in the Theia document, and again after Landing remounts`);
    return failures.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    if (args.some((a) => a !== '--self-test')) {
        console.log(`${LABEL}: FAIL -- unknown argument ${args.find((a) => a !== '--self-test')}. Usage: node scripts/verify-orca-landing-logo-live.mjs [--self-test]`);
        process.exit(2);
    }
    process.exit(args.includes('--self-test') ? selfTest() : await live());
}
