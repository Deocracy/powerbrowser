#!/usr/bin/env node
/**
 * Phase 32 plan 01 (PAGE-01, PAGE-02, PAGE-05): the live skeleton for the page
 * tools, driven in the built shell over WebDriver BiDi.
 *
 * One session per scenario prints one line: `<scenario>: PASS` or
 * `<scenario>: FAIL -- <reason>`. A thrown error is `harness: <message>` (the
 * check could not drive the product, so it is not a product verdict).
 *
 * The scenarios drive the chrome arms through the Theia frame's WebTabChannel,
 * which is the same path the find bar and the zoom chip use. Keys are not
 * relayed in this plan (the page-focus shortcut rows land in plan 32-02), so
 * no scenario here depends on a key.
 *
 * Scenarios:
 *   find    webTabFind of "needle" on a page that holds three, reports
 *           findTotal 3 with a current index in a state push; FindNext moves
 *           the index; FindClose resets the counts to 0 and status to null.
 *   zoom    ZoomIn raises the pushed zoom above 1; ZoomReset returns it to 1.
 *   audio   A tone that plays from a served page reports soundPlaying; Mute
 *           reports audioMuted true, Unmute reports it false.
 *   downloads  Phase 32 plan 04 (PAGE-06): a page-started slow download becomes a
 *           row with bytes in a downloadsChanged push; Cancel stops it; Retry
 *           finishes it.
 *   downloads-today  PROBE (record only): a page-started download of an
 *           attachment. The verdict is what it does today, written to
 *           scripts/lib/pb-probe-verdicts.json; it is never pass or fail.
 *
 * Not in this file, by design: the print-today and edit-today probes. Each
 * needs a command route (Ctrl+P, the edit commands) that plan 32-02 and the
 * print and edit plans own. They are NOT run here and record no verdict, so a
 * build plan that reads the verdict file reports a blocker instead of assuming.
 *
 * Preflight: the binary must carry the current patch 050. The sha256 of
 * patches/050-extension-tab-host.patch must equal the stamp in
 * objdir/.pb-050-build.sha256; otherwise the run is a broken instrument.
 *
 * Usage: verify-page-tools-live.mjs [--scenario a,b] [--self-test] [--help]
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, probe } from './lib/pb-relaunch.mjs';
import { loadedAt, openWebTab, pushes, waitForPush, withProbeShell } from './lib/pb-live-probe.mjs';

const NAME = 'page-tools-live';
const VERDICTS = join(dirname(fileURLToPath(import.meta.url)), 'lib', 'pb-probe-verdicts.json');

/** A ~2 s 440 Hz tone, 8 kHz 16-bit mono, as a WAV (the audio fixture's source). */
function toneWav() {
    const rate = 8000;
    const samples = rate * 2;
    const data = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i += 1) {
        data.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(rate, 24);
    header.writeUInt32LE(rate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

/** The fixture origin: /find, /media, /tone.wav and an attachment at /download. Every GET is recorded. */
async function serveFixtures(downloadBody) {
    const requests = [];
    const wav = toneWav();
    const html = (title, body) => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
    const server = createServer((request, response) => {
        const path = new URL(request.url, 'http://127.0.0.1').pathname;
        requests.push({ path, at: Date.now() });
        if (path === '/find') {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(html('Find fixture', '<p>needle one needle two needle three</p>'));
        } else if (path === '/media') {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(html('Media fixture', '<audio src="/tone.wav" autoplay loop></audio>'));
        } else if (path === '/tone.wav') {
            response.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length });
            response.end(wav);
        } else if (path === '/download') {
            response.writeHead(200, {
                'content-type': 'application/octet-stream',
                'content-disposition': 'attachment; filename="probe.bin"',
            });
            response.end(downloadBody);
        } else if (path === '/slow-download') {
            // Three 64 KiB chunks one second apart: long enough to cancel mid-transfer, short enough to finish on retry.
            const chunk = Buffer.alloc(65536, 0x61);
            response.writeHead(200, {
                'content-type': 'application/octet-stream',
                'content-length': chunk.length * 3,
                'content-disposition': 'attachment; filename="probe-slow.bin"',
            });
            response.write(chunk);
            let sent = 1;
            const timer = setInterval(() => {
                if (response.destroyed) {
                    clearInterval(timer);
                    return;
                }
                response.write(chunk);
                sent += 1;
                if (sent === 3) {
                    clearInterval(timer);
                    response.end();
                }
            }, 1000);
            response.on('close', () => clearInterval(timer));
        } else {
            response.writeHead(404, { 'content-type': 'text/plain' });
            response.end('not found');
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return {
        origin: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise(resolve => server.close(() => resolve())),
    };
}

/** BROKEN INSTRUMENT when the binary's patch 050 stamp does not match the patch file; null when it does. */
function preflight() {
    const patch = readFileSync(join(REPO_ROOT, 'patches/050-extension-tab-host.patch'));
    const stamp = readFileSync(join(REPO_ROOT, 'objdir/.pb-050-build.sha256'), 'utf8').trim().split(/\s+/)[0];
    const actual = createHash('sha256').update(patch).digest('hex');
    return actual === stamp
        ? null
        : `BROKEN INSTRUMENT: patches/050-extension-tab-host.patch (${actual.slice(0, 12)}) does not match the binary stamp objdir/.pb-050-build.sha256 (${stamp.slice(0, 12)}); rebuild 050 first (31.1-01 Task 3)`;
}

/** One WebTabChannel request from the Theia frame; resolves to the chrome reply. */
function channelRequest(app, message) {
    return probe(app, `const channel = get('WebTabChannel'); return await channel.request(${JSON.stringify(message)});`);
}

/** Opens `url` as a web tab and waits for its loaded state push; returns the tab id and the push index to search from. */
async function openLoaded(app, url, path) {
    const tabId = await openWebTab(app, url);
    const at = await waitForPush(app, loadedAt(tabId, path), { timeoutMs: 30000 });
    if (at < 0) {
        throw new Error(`the page ${path} never reached a loaded state push`);
    }
    return { tabId, from: at };
}

const stateOf = (tabId, pred) => p => p && p.kind === 'state' && p.tabId === tabId && pred(p);

/** find: a count, FindNext, then a reset on close. Returns a failure reason, or null. */
async function scenarioFind(app, origin, kind = 'webTabFind') {
    const { tabId, from } = await openLoaded(app, `${origin}/find`, '/find');
    await channelRequest(app, { kind, tabId, query: 'needle' });
    const hit = await waitForPush(app, stateOf(tabId, p => p.findTotal >= 3 && p.findCurrent >= 1 && p.findStatus === 'found'), { from, timeoutMs: 15000 });
    if (hit < 0) {
        return 'no findMatches push: a find of "needle" never reported three matches with a current index in a state push';
    }
    await channelRequest(app, { kind: 'webTabFindNext', tabId });
    const next = await waitForPush(app, stateOf(tabId, p => p.findTotal >= 3 && p.findCurrent >= 1 && p.findStatus !== null), { from: hit, timeoutMs: 10000 });
    if (next < 0) {
        return 'FindNext produced no state push carrying a find status';
    }
    await channelRequest(app, { kind: 'webTabFindClose', tabId });
    const closed = await waitForPush(app, stateOf(tabId, p => p.findTotal === 0 && p.findStatus === null), { from: next, timeoutMs: 10000 });
    return closed < 0 ? 'FindClose did not reset the counts and status in a state push' : null;
}

/** zoom: ZoomIn above 100 %, ZoomReset back to 100 %, both in pushes. */
async function scenarioZoom(app, origin) {
    const { tabId, from } = await openLoaded(app, `${origin}/find`, '/find');
    await channelRequest(app, { kind: 'webTabZoomIn', tabId });
    const zoomed = await waitForPush(app, stateOf(tabId, p => p.zoom > 1), { from, timeoutMs: 15000 });
    if (zoomed < 0) {
        return 'no zoom push: ZoomIn never reached a state push above 100%';
    }
    await channelRequest(app, { kind: 'webTabZoomReset', tabId });
    const reset = await waitForPush(app, stateOf(tabId, p => p.zoom === 1), { from: zoomed, timeoutMs: 10000 });
    return reset < 0 ? 'ZoomReset did not return the pushed zoom to 100%' : null;
}

/**
 * audio: Mute and Unmute round-trip through the reply and the state push
 * (PAGE-05's arm), then the tone must report soundPlaying in a push. The
 * round trip is checked first because it does not depend on playback.
 */
async function scenarioAudio(app, origin) {
    const { tabId, from } = await openLoaded(app, `${origin}/media`, '/media');
    const muteReply = await channelRequest(app, { kind: 'webTabMute', tabId, muted: true });
    if (muteReply?.audioMuted !== true) {
        return `the mute reply did not read audioMuted back as true (${JSON.stringify(muteReply)})`;
    }
    const muted = await waitForPush(app, stateOf(tabId, p => p.audioMuted === true), { from, timeoutMs: 10000 });
    if (muted < 0) {
        return 'no audioMuted push after the mute request';
    }
    await channelRequest(app, { kind: 'webTabMute', tabId, muted: false });
    const unmuted = await waitForPush(app, stateOf(tabId, p => p.audioMuted === false), { from: muted, timeoutMs: 10000 });
    if (unmuted < 0) {
        return 'no audioMuted false push after the unmute request';
    }
    const playing = await waitForPush(app, stateOf(tabId, p => p.soundPlaying === true), { from: unmuted, timeoutMs: 20000 });
    return playing < 0
        ? 'mute round trip passed, but no soundPlaying push: no DOMAudioPlaybackStarted reached the overlay element within 20 s, though the tone plays in content (play() resolves)'
        : null;
}

/**
 * downloads (PAGE-06): a page-started download becomes a row with bytes in a
 * downloadsChanged push; Cancel stops it; Retry restarts it to a finished row.
 * The served request log must show the page's own request (no silent save).
 * Open and Show in folder are not driven: they launch OS applications. No
 * planted fault removes the view: the widget subscribes on every tab
 * activation, so a live session always holds the view.
 */
async function scenarioDownloads(app, fx) {
    const { tabId, from } = await openLoaded(app, `${fx.origin}/find`, '/find');
    const reply = await channelRequest(app, { kind: 'webTabDownloadsSubscribe', tabId });
    if (reply?.ok !== true) {
        return `the subscribe reply was not ok (${JSON.stringify(reply)})`;
    }
    const rowIn = async (pred, after, timeoutMs) => {
        const at = await waitForPush(app, p => p && p.kind === 'downloadsChanged' && (p.rows ?? []).some(pred), { from: after, timeoutMs });
        return at < 0 ? { at } : { at, row: (await pushes(app))[at].rows.find(pred) };
    };
    await channelRequest(app, { kind: 'webTabNavigate', tabId, url: `${fx.origin}/slow-download` });
    const started = await rowIn(r => r.filename === 'probe-slow.bin' && r.state === 'in-progress' && r.bytesReceived > 0, from, 15000);
    if (started.at < 0) {
        return 'row missing: no downloadsChanged push carried an in-progress probe-slow.bin row with bytes within 15 s';
    }
    if (!fx.requests.some(r => r.path === '/slow-download')) {
        return 'the served request log holds no /slow-download request, so the download was not page-started';
    }
    const { id } = started.row;
    const canceledReply = await channelRequest(app, { kind: 'webTabDownloadsAction', tabId, id, action: 'cancel' });
    if (canceledReply?.where !== 'done') {
        return `Cancel did not run (${JSON.stringify(canceledReply)})`;
    }
    const canceled = await rowIn(r => r.id === id && r.state === 'canceled', started.at, 10000);
    if (canceled.at < 0) {
        return 'Cancel did not reach a canceled row in a push within 10 s';
    }
    const retriedReply = await channelRequest(app, { kind: 'webTabDownloadsAction', tabId, id, action: 'retry' });
    if (retriedReply?.where !== 'done') {
        return `Retry did not run (${JSON.stringify(retriedReply)})`;
    }
    const finished = await rowIn(r => r.id === id && r.state === 'finished' && r.succeeded === true, canceled.at, 20000);
    if (finished.at >= 0) {
        return null;
    }
    const last = (await pushes(app)).filter(p => p.kind === 'downloadsChanged').flatMap(p => p.rows).filter(r => r.id === id).pop();
    return `Retry did not restart the transfer to a finished row within 20 s (last row: ${JSON.stringify(last ?? null)})`;
}

/**
 * PROBE downloads-today: a page-started download of an attachment, observed
 * for 15 s. Records what happens today as a verdict; never a pass or fail.
 */
async function probeDownloadsToday(app, origin, requests, downloadDir) {
    const { tabId, from } = await openLoaded(app, `${origin}/find`, '/find');
    const before = requests.length;
    await channelRequest(app, { kind: 'webTabNavigate', tabId, url: `${origin}/download` });
    await waitForPush(app, stateOf(tabId, p => p.loading === false && String(p.url).endsWith('/download')), { from, timeoutMs: 5000 });
    await new Promise(resolve => setTimeout(resolve, 15000));
    const fetched = requests.slice(before).some(r => r.path === '/download');
    const saved = (await readdir(downloadDir)).filter(name => name === 'probe.bin');
    if (saved.length > 0) {
        return 'saved-to-download-dir-without-prompt';
    }
    return fetched ? 'requested-no-file-saved-within-15s' : 'never-requested';
}

/** The verdict file's key for each probe, merged into the file in place. */
async function recordVerdict(key, verdict) {
    let current = {};
    try {
        current = JSON.parse(await readFile(VERDICTS, 'utf8'));
    } catch {
        current = {};
    }
    current[key] = verdict;
    await writeFile(VERDICTS, `${JSON.stringify(current, null, 2)}\n`);
}

/** Runs one scenario in its own session; returns null (pass), a failure reason, or throws for the harness. */
async function runSession(name, body, extraPrefs = {}) {
    let fixtures = null;
    let downloadDir = null;
    try {
        downloadDir = await mkdtemp(join(tmpdir(), 'pb-32-01-dl-'));
        fixtures = await serveFixtures(Buffer.from('probe-bytes\n'));
        const prefs = {
            'media.autoplay.default': 0,
            'media.autoplay.blocking_policy': 0,
            'browser.download.folderList': 2,
            'browser.download.dir': downloadDir,
            'browser.download.useDownloadDir': true,
            ...extraPrefs,
        };
        return await withProbeShell(app => body(app, fixtures, downloadDir), { extraPrefs: prefs });
    } finally {
        await fixtures?.close();
        if (downloadDir) {
            await rm(downloadDir, { recursive: true, force: true });
        }
    }
}

const SCENARIOS = {
    find: (app, fx) => scenarioFind(app, fx.origin),
    zoom: (app, fx) => scenarioZoom(app, fx.origin),
    audio: (app, fx) => scenarioAudio(app, fx.origin),
    downloads: (app, fx) => scenarioDownloads(app, fx),
    'downloads-today': async (app, fx, downloadDir) => {
        const verdict = await probeDownloadsToday(app, fx.origin, fx.requests, downloadDir);
        await recordVerdict('downloads-today', verdict);
        console.log(`  verdict downloads-today: ${verdict}`);
        return null;
    },
};

/**
 * The planted faults. Each runs a scenario with one thing wrong and must go red
 * naming `expect`; the clean control for the same scenario must be green.
 */
const PLANTS = [
    {
        plant: 'find-kind-dropped',
        target: 'find',
        run: (app, fx) => scenarioFind(app, fx.origin, 'webTabFindDropped'),
        expect: 'no findMatches push',
    },
];

async function selfTest() {
    const reason = preflight();
    if (reason) {
        console.error(`${NAME} --self-test: ${reason}`);
        return 1;
    }
    let failed = 0;
    // One clean control per target scenario: a planted fault is only meaningful against its own green run.
    for (const target of new Set(PLANTS.map(planted => planted.target))) {
        const control = await runSession(`${target}-control`, (app, fx) => SCENARIOS[target](app, fx));
        if (control !== null) {
            console.error(`${NAME} --self-test: FAIL -- the clean control for ${target} is red: ${control}`);
            return 1;
        }
        console.log(`  ok  clean control for ${target} -> green`);
    }
    for (const planted of PLANTS) {
        const got = await runSession(planted.plant, planted.run);
        if (!got || !got.includes(planted.expect)) {
            console.error(`${NAME} --self-test: FAIL -- '${planted.plant}' did not go red naming '${planted.expect}'; got: ${got ?? '(green)'}`);
            failed++;
        } else {
            console.log(`  ok  ${planted.plant} -> red, naming '${planted.expect}'`);
        }
    }
    if (failed) {
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- clean control green, ${PLANTS.length} planted fault(s) went red`);
    return 0;
}

async function main() {
    if (process.argv.includes('--help')) {
        console.log(`usage: verify-page-tools-live.mjs [--scenario a,b] [--self-test]\nscenarios: ${Object.keys(SCENARIOS).join(', ')}`);
        return 0;
    }
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const reason = preflight();
    if (reason) {
        console.error(`${NAME}: ${reason}`);
        return 1;
    }
    const flag = process.argv.indexOf('--scenario');
    const selected = flag === -1 ? Object.keys(SCENARIOS) : process.argv[flag + 1].split(',');
    const unknown = selected.filter(name => !(name in SCENARIOS));
    if (unknown.length) {
        console.error(`${NAME}: unknown scenario(s): ${unknown.join(', ')}`);
        return 1;
    }
    let failed = 0;
    for (const name of selected) {
        try {
            const reason = await runSession(name, (app, fx, downloadDir) => SCENARIOS[name](app, fx, downloadDir));
            if (reason) {
                failed++;
                console.log(`${name}: FAIL -- ${reason}`);
            } else {
                console.log(`${name}: PASS`);
            }
        } catch (err) {
            failed++;
            console.log(`harness: ${err && err.message ? err.message : err}`);
        }
    }
    return failed ? 1 : 0;
}

process.exit(await main());
