#!/usr/bin/env node
// Phase 67 research probe (P67-14): records, at the sidecar, the Origin and Sec-Fetch-* headers Gecko
// sends for each request class of PowerBrowser's own pages and of a foreign loopback page, and whether
// the POWERBROWSER_TOKEN cookie arrived. Prints booleans and header values only, never a cookie value.
//
// Run from the repo root, under the live lock, with ORCA_* unset:
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock \
//     node .planning/workstreams/orca/phases/67-hosting-hardening/probes/record-sidecar-headers.mjs <outdir>
// <outdir> receives headers.jsonl (one row per request) and the upload-proof files, if any were written.
import { mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../../../..');
const OUT = resolve(process.argv[2] ?? join(HERE, 'out'));
mkdirSync(OUT, { recursive: true });
const LOG = join(OUT, 'headers.jsonl');
rmSync(LOG, { force: true });
for (const key of Object.keys(process.env)) {
    if (key.startsWith('ORCA_')) delete process.env[key];
}
process.env.PB67_HEADER_LOG = LOG;
process.env.NODE_OPTIONS = `--require ${join(HERE, 'header-recorder.cjs')}`;

const { pollFor, probe, servePages, sourceConst, stockTabOn } = await import(join(REPO, 'scripts/lib/pb-relaunch.mjs'));
const { withProbeShell, openWebTab } = await import(join(REPO, 'scripts/lib/pb-live-probe.mjs'));
const OPEN_BROWSER_WINDOW = sourceConst('theia/extensions/tab-uris/src/browser/browser-window-command.ts', 'OPEN_BROWSER_WINDOW_COMMAND_ID');

// Evaluated in a page realm: every request class a same-site page can make toward the sidecar.
const attack = (port, tag, uploadUri) => `(async () => {
    const base = 'http://127.0.0.1:${port}';
    const out = {};
    try { await fetch(base + '/powerbrowser/health?probe=${tag}-nocors', { mode: 'no-cors', credentials: 'include' }); out.nocors = 'sent'; } catch (e) { out.nocors = 'error'; }
    try { const r = await fetch(base + '/powerbrowser/health?probe=${tag}-cors', { credentials: 'include' }); out.cors = r.status; } catch (e) { out.cors = 'blocked'; }
    await new Promise(res => { const i = new Image(); i.onload = i.onerror = () => res(); i.src = base + '/powerbrowser/health?probe=${tag}-img'; setTimeout(res, 3000); });
    out.ws = await new Promise(res => { let w; try { w = new WebSocket('ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket&probe=${tag}-ws'); } catch (e) { return res('throw'); }
        w.onopen = () => { res('open'); w.close(); }; w.onerror = () => res('error'); setTimeout(() => res('timeout'), 5000); });
    const fd = new FormData(); fd.append('uri', ${JSON.stringify(uploadUri)}); fd.append('file', new Blob(['pb67 probe\\n']), 'proof.txt');
    try { await fetch(base + '/file-upload?probe=${tag}-upload', { method: 'POST', mode: 'no-cors', credentials: 'include', body: fd }); out.upload = 'sent'; } catch (e) { out.upload = 'error'; }
    const src = "fetch('" + base + "/powerbrowser/health?probe=${tag}-worker',{mode:'no-cors',credentials:'include'}).then(()=>postMessage('sent'),()=>postMessage('error'))";
    out.worker = await new Promise(res => { try { const w = new Worker(URL.createObjectURL(new Blob([src]))); w.onmessage = e => res(e.data); w.onerror = () => res('worker-error'); setTimeout(() => res('timeout'), 5000); } catch (e) { res('throw:' + e.name); } });
    return JSON.stringify(out);
})()`;

const pages = await servePages({ '/foreign': { title: 'PB67 foreign loopback page' } });
const results = {};
try {
    await withProbeShell(async app => {
        const port = app.port;
        // 1. The Theia frame's own requests (same-origin), on top of the boot traffic recorded automatically.
        results.theia = JSON.parse(await app.evaluate(attack(port, 'theia', `file://${OUT}/upload-theia.txt`)));
        // 2. A foreign loopback page (another port: same site as the sidecar) in a stock window.
        const stockUrl = pages.url('/foreign?ctx=stock');
        await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(OPEN_BROWSER_WINDOW)}, ${JSON.stringify(stockUrl)}); return {};`);
        const stock = await stockTabOn(app, stockUrl);
        results.stock = JSON.parse(await app.evaluateIn(stock.context, attack(port, 'stock', `file://${OUT}/upload-stock.txt`)));
        // 3. The same page in an in-shell web-tab overlay.
        const overlayUrl = pages.url('/foreign?ctx=overlay');
        await openWebTab(app, overlayUrl);
        const overlay = await pollFor(async () => (await app.contexts()).find(e => e.url === overlayUrl), 20000, 'the overlay context');
        results.overlay = JSON.parse(await app.evaluateIn(overlay.context, attack(port, 'overlay', `file://${OUT}/upload-overlay.txt`)));
        // 4. Top-level navigations to the sidecar: same-site from the stock page, cross-site from a localhost page.
        await app.evaluateIn(stock.context, `location.href = 'http://127.0.0.1:${port}/?probe=stock-samesite-nav'; true`).catch(() => undefined);
        await pollFor(async () => (await app.contexts()).find(e => e.url.includes('probe=stock-samesite-nav')), 20000, 'same-site navigation');
        const xsite = pages.url('/foreign?ctx=xsite').replace('127.0.0.1', 'localhost');
        await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(OPEN_BROWSER_WINDOW)}, ${JSON.stringify(xsite)}); return {};`);
        try {
            const x = await pollFor(async () => (await app.contexts()).find(e => e.url === xsite), 20000, 'the localhost page');
            await app.evaluateIn(x.context, `location.href = 'http://127.0.0.1:${port}/?probe=xsite-nav'; true`).catch(() => undefined);
            await pollFor(async () => (await app.contexts()).find(e => e.url.includes('probe=xsite-nav')), 20000, 'cross-site navigation');
        } catch (e) {
            results.xsite = `not reached: ${e.message}`;
        }
        // Let at least one steady-state chrome health probe land.
        await new Promise(r => setTimeout(r, 12000));
        await app.quit();
    });
} finally {
    await pages.close();
}

const rows = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const key = r => [r.kind, r.method, r.origin, r.sfs, r.sfm, r.sfd, r.sfu, r.pbCookie, r.theiaCookie, r.status].join(' | ');
const groups = new Map();
for (const r of rows) {
    const k = r.path.includes('probe=') ? `${r.path.replace(/^.*probe=/, 'probe=')} :: ${key(r)}` : key(r);
    const g = groups.get(k) ?? { n: 0, paths: new Set() };
    g.n++; if (g.paths.size < 4) g.paths.add(r.path.replace(/\?.*/, ''));
    groups.set(k, g);
}
console.log('page-side results:', JSON.stringify(results));
console.log('kind | method | origin | sec-fetch-site | mode | dest | user | pbCookie | theiaCookie | status  (count, sample paths)');
for (const [k, g] of [...groups].sort()) console.log(`${k}  (${g.n}; ${[...g.paths].join(', ')})`);
for (const tag of ['theia', 'stock', 'overlay']) {
    console.log(`upload-${tag}.txt written by the sidecar: ${existsSync(join(OUT, `upload-${tag}.txt`))}`);
}
