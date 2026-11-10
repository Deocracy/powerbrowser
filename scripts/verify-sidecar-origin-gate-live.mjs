#!/usr/bin/env node
// scripts/verify-sidecar-origin-gate-live.mjs
//
// RUN-08 hotfix, live (67-RESEARCH P67-13/P67-14). Boots the built shell, serves a page from a second 127.0.0.1
// port, opens it in a stock browser window, and proves the sidecar answers that page's no-cors GET, cors GET,
// <img>, multipart POST to /file-upload and top-level navigation with 403 while the token cookie still arrives
// (so the refusal is the origin rule, not a missing cookie). Positive control first: the Theia frame's own
// requests get 200 before and after, and Theia booted to 'ready'.
//
// Instrument: scripts/lib/sidecar-status-recorder.cjs, required into the sidecar through NODE_OPTIONS, records
// the status the sidecar itself answered for each probe-tagged request. Every leg asserts a recorded row is
// present, never an absence. Uploads target a fresh scratch folder only; GETs target /powerbrowser/health.
//
// Runs under flock <git common dir>/pb-live.lock (re-execs itself under it). PB_FIREFOX_BIN and PB_BACKEND_MAIN
// point a tree without an objdir at another checkout's binary and this tree's Theia build (firefox-bidi.mjs).

import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'sidecar-origin-gate-live';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

if (process.env.PB_LIVE_LOCK_HELD !== '1') {
    const common = execFileSync('git', ['-C', REPO, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    const r = spawnSync('flock', [join(common, 'pb-live.lock'), process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
        { stdio: 'inherit', env: { ...process.env, PB_LIVE_LOCK_HELD: '1' } });
    process.exit(r.status ?? 1);
}

const scratch = mkdtempSync(join(tmpdir(), 'pb-origin-gate-'));
const LOG = join(scratch, 'status.jsonl');
for (const key of Object.keys(process.env)) {
    if (key.startsWith('ORCA_')) delete process.env[key];
}
process.env.PB_SIDECAR_STATUS_LOG = LOG;
process.env.NODE_OPTIONS = `--require ${join(HERE, 'lib', 'sidecar-status-recorder.cjs')}`;

const { pollFor, probe, servePages, sourceConst, stockTabOn } = await import(join(REPO, 'scripts/lib/pb-relaunch.mjs'));
const { withProbeShell } = await import(join(REPO, 'scripts/lib/pb-live-probe.mjs'));
const OPEN_BROWSER_WINDOW = sourceConst('theia/extensions/tab-uris/src/browser/browser-window-command.ts', 'OPEN_BROWSER_WINDOW_COMMAND_ID');

const rows = () => existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const rowFor = tag => pollFor(async () => rows().find(r => r.tag === tag), 20000, `the sidecar's answer to probe=${tag}`);

// Evaluated in a page realm: the request classes a loopback page can send toward the sidecar.
const requests = (port, tag, uploadUri) => `(async () => {
    const base = 'http://127.0.0.1:${port}';
    const out = {};
    try { await fetch(base + '/powerbrowser/health?probe=${tag}-nocors', { mode: 'no-cors', credentials: 'include' }); out.nocors = 'sent'; } catch (e) { out.nocors = 'error'; }
    try { const r = await fetch(base + '/powerbrowser/health?probe=${tag}-cors', { credentials: 'include' }); out.cors = r.status; } catch (e) { out.cors = 'blocked'; }
    await new Promise(res => { const i = new Image(); i.onload = i.onerror = () => res(); i.src = base + '/powerbrowser/health?probe=${tag}-img'; setTimeout(res, 3000); });
    const fd = new FormData(); fd.append('uri', ${JSON.stringify(uploadUri)}); fd.append('file', new Blob(['origin gate probe\\n']), 'proof.txt');
    try { await fetch(base + '/file-upload?probe=${tag}-upload', { method: 'POST', mode: 'no-cors', credentials: 'include', body: fd }); out.upload = 'sent'; } catch (e) { out.upload = 'error'; }
    return JSON.stringify(out);
})()`;

const failures = [];
const expect = async (tag, status, { cookie } = {}) => {
    let row;
    try {
        row = await rowFor(tag);
    } catch (e) {
        failures.push(`${tag}: no recorded answer (${e.message})`);
        return;
    }
    const line = `${tag}: ${row.method} Origin=${row.origin ?? '-'} Sec-Fetch-Site=${row.sfs ?? '-'} token=${row.pbCookie} -> ${row.status}`;
    if (row.status !== status) failures.push(`${line}, expected ${status}`);
    else if (cookie && !row.pbCookie) failures.push(`${line}: the token did not arrive, so this 403 does not prove the origin rule`);
    else console.log(`  ok  ${line}`);
};

const pages = await servePages({ '/foreign': { title: 'Origin gate foreign loopback page' } });
try {
    await withProbeShell(async app => {
        const port = app.port;
        console.log(`  ok  Theia reached 'ready' on 127.0.0.1:${port} (positive control: boot, its WebSocket included)`);
        // 1. Positive control: the Theia frame's own requests, same-origin.
        const theiaUpload = join(scratch, 'upload-theia.txt');
        const theia = JSON.parse(await app.evaluate(requests(port, 'theia', `file://${theiaUpload}`)));
        if (theia.cors !== 200) failures.push(`theia-cors: the Theia frame read ${theia.cors}, expected 200`);
        for (const leg of ['nocors', 'cors', 'img', 'upload']) await expect(`theia-${leg}`, 200);
        if (!existsSync(theiaUpload)) failures.push('theia-upload: the scratch file was not written; the upload positive control did not hold');
        // 2. A page on another 127.0.0.1 port (same site) in a stock browser window.
        const stockUrl = pages.url('/foreign');
        await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(OPEN_BROWSER_WINDOW)}, ${JSON.stringify(stockUrl)}); return {};`);
        const stock = await stockTabOn(app, stockUrl);
        const stockUpload = join(scratch, 'upload-stock.txt');
        await app.evaluateIn(stock.context, requests(port, 'stock', `file://${stockUpload}`));
        for (const leg of ['nocors', 'cors', 'img', 'upload']) await expect(`stock-${leg}`, 403, { cookie: true });
        await app.evaluateIn(stock.context, `location.href = 'http://127.0.0.1:${port}/powerbrowser/health?probe=stock-nav'; true`).catch(() => undefined);
        await expect('stock-nav', 403, { cookie: true });
        if (existsSync(stockUpload)) failures.push('stock-upload: the sidecar wrote the file the foreign page chose');
        // 3. The positive control again, after the refusals.
        const after = await app.evaluate(`fetch('/powerbrowser/health?probe=theia-after', { credentials: 'include' }).then(r => r.status)`);
        if (after !== 200) failures.push(`theia-after: the Theia frame read ${after}, expected 200`);
        await expect('theia-after', 200);
        await app.quit();
    });
} catch (e) {
    failures.push(`harness: ${e.message}`);
} finally {
    await pages.close();
    rmSync(scratch, { recursive: true, force: true });
}

for (const f of failures) console.error(`${LABEL}: FAIL -- ${f}`);
console.log(failures.length ? `${LABEL}: FAIL -- ${failures.length} leg(s)` : `${LABEL}: PASS -- the Theia frame is served; a same-site loopback page in a stock window gets 403 for GET, img, navigation and the upload POST`);
process.exit(failures.length ? 1 : 0);
