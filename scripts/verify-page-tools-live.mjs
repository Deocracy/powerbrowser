#!/usr/bin/env node
/**
 * Phase 32 plan 01 (PAGE-01, PAGE-02, PAGE-05): the live skeleton for the page
 * tools, driven in the built shell over WebDriver BiDi.
 *
 * One session per scenario prints one line: `<scenario>: PASS` or
 * `<scenario>: FAIL -- <reason>`. A thrown error is `harness: <message>` (the
 * check could not drive the product, so it is not a product verdict).
 *
 * The arms are first driven through the Theia frame's WebTabChannel, the same
 * path the find bar and the zoom chip use. Plan 32-02 then adds the key path:
 * a key pressed from a focused page reaches the page relay, and the scenario
 * waits for the relay's `shortcut` push and the state push that follows.
 *
 * Scenarios:
 *   find    webTabFind of "needle" on a page that holds three, reports
 *           findTotal 3 with a current index in a state push; FindNext moves
 *           the index; F3 from the page steps it through the relay; Ctrl+F
 *           opens the Theia find bar; FindClose resets the counts to 0.
 *   zoom    ZoomIn raises the pushed zoom above 1; ZoomReset returns it to 1;
 *           Ctrl+= and Ctrl+0 from the page do the same through the relay.
 *   audio   A tone that plays from a served page reports soundPlaying; Mute
 *           reports audioMuted true, Unmute reports it false; Ctrl+M from the
 *           page toggles the mute through the relay.
 *   keys-theia  A page-scoped row is disabled while the Theia frame has focus
 *           (the positive control reads it enabled with the page focused).
 *   downloads  Phase 32 plan 04 (PAGE-06): a page-started slow download becomes a
 *           row with bytes in a downloadsChanged push; Cancel stops it; Retry
 *           finishes it.
 *   downloads-today  PROBE (record only): a page-started download of an
 *           attachment. The verdict is what it does today, written to
 *           scripts/lib/pb-probe-verdicts.json; it is never pass or fail.
 *
 *   print   PAGE-03, headless part: the arm refuses a non-boolean option, an
 *           unknown tab replies unknown-tab, the printOpen row is enabled while the
 *           page has focus, and no tab-modal box exists in chrome. The system dialog
 *           is an OS window this harness cannot close, so its open and cancel are
 *           deferred to the end-of-milestone pass. Plant: a tab-modal box in chrome.
 *   print-today  PROBE (record only): the completion half of the system-dialog
 *           print path on the overlay's own browsing context, silent to a PDF
 *           file, plus whether the print-dialog service is instantiable. No
 *           dialog window is opened (an OS window cannot be closed headlessly),
 *           so the on-screen half is deferred. Verdict written to
 *           scripts/lib/pb-probe-verdicts.json.
 *
 *   save    PAGE-08, headless part: Ctrl+S from a focused page opens the Theia "Save page as"
 *           dialog, which Cancel closes; the Theia frame keeps Ctrl+S. The copy is then driven through
 *           the channel to a scratch destination: the file carries the page and its stylesheet folder,
 *           and a relative, non-html, oversized or unknown-tab request is refused. Plant: the export is
 *           skipped, so no file lands.
 *
 *   edit    PAGE-09 (32-06): Copy, Cut and Paste run through their Edit commands and the page reports each
 *           event; Delete and Undo go through the frozen kind; Cut greys on a collapsed selection; typing in
 *           the page sends no Theia request, checked after the kind is seen on the wire (positive control).
 *           Plant: the Copy item sends a check-only request, so no copy event arrives.
 *   edit-today  PROBE (record only, 32-06 Task 0): per frozen edit command, whether the chrome
 *           route (the Controllers actor, the route a Theia-initiated Edit item takes) reaches the
 *           page editor and performs the command, and whether the page's own key does the same with
 *           the page focused. The page reports selection, length and the copy, cut and paste events
 *           through its title and cancels those events, so the probe reads no page text and writes
 *           no clipboard data. Verdict written to scripts/lib/pb-probe-verdicts.json.
 *
 * Preflight: the binary must carry the current patch 050. The sha256 of
 * patches/050-extension-tab-host.patch must equal the stamp in
 * objdir/.pb-050-build.sha256; otherwise the run is a broken instrument.
 *
 * Usage: verify-page-tools-live.mjs [--scenario a,b] [--self-test] [--help]
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, probe } from './lib/pb-relaunch.mjs';
import {
    BROKEN, focusOverlay, focusTheiaFrame, inChrome, loadedAt, openWebTab, pageKeyDisabled, pressKey, pushes, waitForPush, withProbeShell,
} from './lib/pb-live-probe.mjs';

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

/**
 * The edit-today page. The title carries `ed s<selStart> e<selEnd> n<length> c<copies> x<cuts> p<pastes>`,
 * refreshed by a poll so a chrome-driven selection change also shows. copy, cut and paste are cancelled.
 */
const EDIT_PAGE = `<!doctype html><html><head><title>Edit fixture</title></head><body><textarea id="t">alpha beta gamma</textarea><script>
const t = document.getElementById('t');
let c = 0, x = 0, p = 0, last = '';
document.addEventListener('copy', e => { c++; e.preventDefault(); });
document.addEventListener('cut', e => { x++; e.preventDefault(); });
document.addEventListener('paste', e => { p++; e.preventDefault(); });
// The overlay is shown in the background until chrome focuses it: refocus the editor when the window gets focus.
window.addEventListener('focus', () => t.focus());
t.focus(); t.setSelectionRange(6, 10);
setInterval(() => {
  const s = 'ed s' + t.selectionStart + ' e' + t.selectionEnd + ' n' + t.value.length + ' c' + c + ' x' + x + ' p' + p;
  if (s !== last) { last = s; document.title = s; }
}, 50);
</script></body></html>`;

/** The fixture origin: /find, /media, /tone.wav, /edit and an attachment at /download. Every GET is recorded. */
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
        } else if (path === '/save') {
            // A stylesheet link, so the persisted copy has a page_files folder for the export to carry.
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end('<!doctype html><html><head><title>Save fixture</title><link rel="stylesheet" href="/save.css"></head><body><p>needle one needle two</p></body></html>');
        } else if (path === '/save.css') {
            response.writeHead(200, { 'content-type': 'text/css' });
            response.end('p { color: rgb(18, 52, 86); }');
        } else if (path === '/edit') {
            // edit-today: the page reports its selection, length and the copy/cut/paste events through its title.
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(EDIT_PAGE);
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

/**
 * Focuses the overlay of `tabId`, presses `spec` at the parent, and returns the
 * index of the relay's `shortcut` push for row `id` (-1 when none arrives). A
 * focus failure is a broken instrument, not a product verdict.
 */
async function pressPageKey(app, tabId, id, spec) {
    if (await focusOverlay(app, tabId) !== true) {
        throw new Error(`${BROKEN} the overlay of ${tabId} could not be focused to press ${id}`);
    }
    const mark = (await pushes(app)).length;
    await pressKey(app, spec);
    return waitForPush(app, p => p && p.kind === 'shortcut' && p.id === id && p.tabId === tabId, { from: mark, timeoutMs: 5000 });
}

/** Polls `read` until `pred` holds or about 3 s pass; returns the last value read. */
async function settleValue(read, pred) {
    let value;
    for (let i = 0; i < 30; i++) {
        value = await read();
        if (pred(value)) {
            return value;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return value;
}

/**
 * find: a count, FindNext (channel, then F3 from a focused page), Ctrl+F opens
 * the Theia find bar, and a reset on close. Returns a failure reason, or null.
 */
async function scenarioFind(app, origin, kind = 'webTabFind') {
    const { tabId, from } = await openLoaded(app, `${origin}/find`, '/find');
    await channelRequest(app, { kind, tabId, query: 'needle' });
    const hit = await waitForPush(app, stateOf(tabId, p => p.findTotal >= 3 && p.findCurrent >= 1 && p.findStatus === 'found'), { from, timeoutMs: 15000 });
    if (hit < 0) {
        return 'no findMatches push: a find of "needle" never reported three matches with a current index in a state push';
    }
    await channelRequest(app, { kind: 'webTabFindNext', tabId });
    // from: hit + 1. The hit push already matches this predicate, and `from` is inclusive, so `hit` could never fail.
    const next = await waitForPush(app, stateOf(tabId, p => p.findTotal >= 3 && p.findCurrent >= 1 && p.findStatus !== null), { from: hit + 1, timeoutMs: 10000 });
    if (next < 0) {
        return 'FindNext produced no state push carrying a find status';
    }
    const f3 = await pressPageKey(app, tabId, 'findNext', { key: 'F3', code: 'F3', keyCode: 114 });
    if (f3 < 0) {
        return 'F3 in a focused page produced no shortcut push: the findNext row did not relay';
    }
    const stepped = await waitForPush(app, stateOf(tabId, p => p.findTotal >= 3 && p.findCurrent >= 1 && p.findStatus !== null), { from: f3 + 1, timeoutMs: 10000 });
    if (stepped < 0) {
        return 'F3 relayed, but no state push carried a find status after the step';
    }
    const ctrlF = await pressPageKey(app, tabId, 'findOpen', { key: 'f', code: 'KeyF', keyCode: 70, modifiers: ['accel'] });
    if (ctrlF < 0) {
        return 'Ctrl+F in a focused page produced no shortcut push: the findOpen row did not relay';
    }
    const bar = await settleValue(() => probe(app, "return !!document.getElementById('pb-chrome-bar-find-input');"), v => v === true);
    if (bar !== true) {
        return 'Ctrl+F relayed, but the Theia find bar did not open (no #pb-chrome-bar-find-input in the Theia frame)';
    }
    await channelRequest(app, { kind: 'webTabFindClose', tabId });
    const closed = await waitForPush(app, stateOf(tabId, p => p.findTotal === 0 && p.findStatus === null), { from: stepped, timeoutMs: 10000 });
    return closed < 0 ? 'FindClose did not reset the counts and status in a state push' : null;
}

/**
 * zoom: ZoomIn above 100 %, ZoomReset back to 100 %, both in pushes; then
 * Ctrl+= and Ctrl+0 from a focused page make the same two steps through the relay.
 */
async function scenarioZoom(app, origin) {
    const { tabId, from } = await openLoaded(app, `${origin}/find`, '/find');
    await channelRequest(app, { kind: 'webTabZoomIn', tabId });
    const zoomed = await waitForPush(app, stateOf(tabId, p => p.zoom > 1), { from, timeoutMs: 15000 });
    if (zoomed < 0) {
        return 'no zoom push: ZoomIn never reached a state push above 100%';
    }
    await channelRequest(app, { kind: 'webTabZoomReset', tabId });
    const reset = await waitForPush(app, stateOf(tabId, p => p.zoom === 1), { from: zoomed, timeoutMs: 10000 });
    if (reset < 0) {
        return 'ZoomReset did not return the pushed zoom to 100%';
    }
    const zin = await pressPageKey(app, tabId, 'zoomIn', { key: '=', code: 'Equal', keyCode: 187, modifiers: ['accel'] });
    if (zin < 0) {
        return 'Ctrl+= in a focused page produced no shortcut push: the zoomIn row did not relay';
    }
    const keyZoomed = await waitForPush(app, stateOf(tabId, p => p.zoom > 1), { from: zin, timeoutMs: 15000 });
    if (keyZoomed < 0) {
        return 'Ctrl+= relayed, but no state push carried a zoom above 100%';
    }
    const z0 = await pressPageKey(app, tabId, 'zoomReset', { key: '0', code: 'Digit0', keyCode: 48, modifiers: ['accel'] });
    if (z0 < 0) {
        return 'Ctrl+0 in a focused page produced no shortcut push: the zoomReset row did not relay';
    }
    const keyReset = await waitForPush(app, stateOf(tabId, p => p.zoom === 1), { from: z0, timeoutMs: 10000 });
    return keyReset < 0 ? 'Ctrl+0 relayed, but no state push returned the zoom to 100%' : null;
}

/**
 * audio: Mute and Unmute round-trip through the reply and the state push
 * (PAGE-05's arm), then the tone must report soundPlaying in a push. The
 * round trip is checked first because it does not depend on playback.
 */
async function scenarioAudio(app, origin, page = '/media') {
    const { tabId, from } = await openLoaded(app, `${origin}${page}`, page);
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
    if (playing < 0) {
        return 'mute round trip passed, but no soundPlaying push: no DOMAudioPlaybackStarted reached the overlay element within 20 s (MOZ_LOG=cubeb:5 shows "libpulse not found" when the binary cannot open an audio stream)';
    }
    // Ctrl+M from a focused page toggles the mute through the relay; the unmute above left the tab unmuted, so this mutes it.
    const toggled = await pressPageKey(app, tabId, 'muteToggle', { key: 'm', code: 'KeyM', keyCode: 77, modifiers: ['accel'] });
    if (toggled < 0) {
        return 'Ctrl+M in a focused page produced no shortcut push: the muteToggle row did not relay';
    }
    const keyMuted = await waitForPush(app, stateOf(tabId, p => p.audioMuted === true), { from: toggled, timeoutMs: 10000 });
    return keyMuted < 0 ? 'Ctrl+M relayed, but no audioMuted push followed' : null;
}

/**
 * keys-theia: a page-scoped row is enabled only while an overlay has focus.
 * The positive control reads the zoomIn row enabled with the page focused;
 * the check then reads it disabled with the Theia frame focused, so a key
 * there never reaches the page relay. `plant` enables the row while the Theia
 * frame has focus, which must go red.
 */
async function scenarioKeysTheia(app, origin, plant = false) {
    const { tabId } = await openLoaded(app, `${origin}/find`, '/find');
    if (await focusOverlay(app, tabId) !== true) {
        throw new Error(`${BROKEN} the overlay of ${tabId} could not be focused`);
    }
    const onPage = await settleValue(() => pageKeyDisabled(app, 'zoomIn'), v => v === false);
    if (onPage !== false) {
        return `the zoomIn row did not enable while the page had focus (disabled=${onPage})`;
    }
    if (await focusTheiaFrame(app) !== true) {
        throw new Error(`${BROKEN} the Theia frame could not be focused`);
    }
    if (plant) {
        await inChrome(app, "document.getElementById('powerbrowser-page-key-zoomIn').removeAttribute('disabled'); return true;");
    }
    const onTheia = await settleValue(() => pageKeyDisabled(app, 'zoomIn'), v => v === true);
    return onTheia === true
        ? null
        : 'the zoomIn row is enabled while the Theia frame has focus, so a key there would take the page meaning';
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

/**
 * print (PAGE-03), headless part. `plant` adds a tab-modal box to chrome, which the
 * absence check must catch. Nothing here opens a dialog.
 */
async function scenarioPrint(app, origin, plant = false) {
    const { tabId } = await openLoaded(app, `${origin}/find`, '/find');
    const refused = await channelRequest(app, { kind: 'webTabPrint', tabId, selectionOnly: 'yes' });
    if (refused?.ok !== false || refused?.reason !== 'validation') {
        return `the print arm did not refuse a non-boolean selectionOnly (${JSON.stringify(refused)})`;
    }
    const unknown = await channelRequest(app, { kind: 'webTabPrint', tabId: 'unknownprinttab' });
    if (unknown?.where !== 'unknown-tab') {
        return `the print arm did not reply unknown-tab for an unknown tab (${JSON.stringify(unknown)})`;
    }
    if (await focusOverlay(app, tabId) !== true) {
        throw new Error(`${BROKEN} the overlay of ${tabId} could not be focused`);
    }
    const enabled = await settleValue(() => pageKeyDisabled(app, 'printOpen'), v => v === false);
    if (enabled !== false) {
        return `the printOpen row is disabled while the page has focus (disabled=${enabled})`;
    }
    if (plant) {
        await inChrome(app, "const box = document.createElement('div'); box.className = 'dialogbox'; document.body.appendChild(box); return true;");
    }
    const tabModal = await inChrome(app, "return document.querySelectorAll('tabmodalprompt, .dialogbox').length;");
    return tabModal === 0 ? null : 'a tab-modal box is in chrome: the print path reached the tab-modal preview (D-08)';
}

/** True while the Theia frame shows a dialog titled "Save page as". */
function saveDialogOpen(app) {
    return probe(app, "return [...document.querySelectorAll('.dialogTitle')].some(node => node.textContent.trim() === 'Save page as');");
}

/** Clicks the Cancel button of the open dialog; resolves true when a button was clicked. */
function closeSaveDialog(app) {
    return probe(app, "const button = [...document.querySelectorAll('.dialogControl button')].find(node => node.textContent.trim() === 'Cancel'); if (!button) { return false; } button.click(); return true;");
}

/** True when `path` is an existing regular file. */
async function isFile(path) {
    return stat(path).then(info => info.isFile(), () => false);
}

/**
 * save (PAGE-08), headless part. Ctrl+S from a focused page relays through the saveOpen row and opens the Theia
 * "Save page as" dialog; the Theia frame keeps Ctrl+S (the row is disabled there). Cancel closes the dialog, so none
 * is left open. The copy is then driven through the channel, because the picker is a Theia dialog this harness does
 * not drive: pick proposes a name, and export writes the minted copy to a scratch destination. The file must carry
 * the page text and link its stylesheet from the copied saved-page_files folder. Refusals: a relative path, a
 * non-.html name and an oversized path are refused with validation, and none of them writes a file; an unknown tab
 * replies unknown-tab. Private tabs are not driven live (no private window here); the static gate checks their guards.
 * Plant: the export is skipped, so no file lands, and the check must go red naming "was not written".
 */
async function scenarioSave(app, origin, plant = false) {
    const { tabId } = await openLoaded(app, `${origin}/save`, '/save');
    if (await focusOverlay(app, tabId) !== true) {
        throw new Error(`${BROKEN} the overlay of ${tabId} could not be focused`);
    }
    const onPage = await settleValue(() => pageKeyDisabled(app, 'saveOpen'), v => v === false);
    if (onPage !== false) {
        return `the saveOpen row did not enable while the page had focus (disabled=${onPage})`;
    }
    const mark = (await pushes(app)).length;
    await pressKey(app, { key: 's', code: 'KeyS', keyCode: 83, modifiers: ['accel'] });
    const relayed = await waitForPush(app, p => p && p.kind === 'shortcut' && p.id === 'saveOpen' && p.tabId === tabId, { from: mark, timeoutMs: 5000 });
    if (relayed < 0) {
        return 'Ctrl+S in a focused page produced no shortcut push: the saveOpen row did not relay';
    }
    const opened = await settleValue(() => saveDialogOpen(app), v => v === true);
    if (opened !== true) {
        return 'Ctrl+S relayed, but no "Save page as" dialog opened in the Theia frame';
    }
    if (await closeSaveDialog(app) !== true) {
        return 'the "Save page as" dialog has no Cancel button, so it cannot be closed from the harness';
    }
    const closed = await settleValue(() => saveDialogOpen(app), v => v === false);
    if (closed !== false) {
        return 'the "Save page as" dialog stayed open after Cancel';
    }
    if (await focusTheiaFrame(app) !== true) {
        throw new Error(`${BROKEN} the Theia frame could not be focused`);
    }
    const onTheia = await settleValue(() => pageKeyDisabled(app, 'saveOpen'), v => v === true);
    if (onTheia !== true) {
        return 'the saveOpen row is enabled while the Theia frame has focus, so Ctrl+S there would take the page meaning';
    }
    const picked = await channelRequest(app, { kind: 'webTabSavePick', tabId });
    if (picked?.where !== 'ready' || !String(picked.suggestedName ?? '').endsWith('.html')) {
        return `the save pick did not propose a file name (${JSON.stringify(picked)})`;
    }
    const dir = await mkdtemp(join(tmpdir(), 'pb-32-05-save-'));
    try {
        const destination = join(dir, 'saved-page.html');
        if (!plant) {
            const exported = await channelRequest(app, { kind: 'webTabSaveExport', tabId, path: destination });
            if (exported?.where !== 'exported') {
                return `the export did not report a written copy (${JSON.stringify(exported)})`;
            }
        }
        let html;
        try {
            html = await readFile(destination, 'utf8');
        } catch {
            return 'the picked destination was not written: the export did not land a file';
        }
        if (!html.includes('needle one')) {
            return 'the exported file does not carry the page text';
        }
        // The persisted stylesheet keeps a unique name (save_<suffix>.css), so the check follows the href rather than a fixed name.
        const href = (/<link[^>]*href="([^"]+)"/.exec(html) ?? [])[1] ?? '';
        if (!href.startsWith('saved-page_files/') || !(await isFile(join(dir, href)))) {
            const listing = await readdir(dir).catch(() => ['(unreadable)']);
            return `the exported stylesheet link does not resolve to a file in the copied saved-page_files folder (href: ${href || '(none)'}; destination directory: ${listing.join(', ')})`;
        }
        const refusals = [
            ['a relative path', { kind: 'webTabSaveExport', tabId, path: 'saved-page.html' }],
            ['a non-html name', { kind: 'webTabSaveExport', tabId, path: join(dir, 'notes.txt') }],
            ['an oversized path', { kind: 'webTabSaveExport', tabId, path: `${dir}/${'a'.repeat(4096)}.html` }],
        ];
        for (const [label, message] of refusals) {
            const reply = await channelRequest(app, message);
            if (reply?.ok !== false || reply?.reason !== 'validation') {
                return `the export did not refuse ${label} (${JSON.stringify(reply)})`;
            }
        }
        if (await isFile(join(dir, 'notes.txt'))) {
            return 'a refused non-html destination was written';
        }
        const unknown = await channelRequest(app, { kind: 'webTabSavePick', tabId: 'unknownsavetab' });
        if (unknown?.where !== 'unknown-tab') {
            return `the save pick did not reply unknown-tab for an unknown tab (${JSON.stringify(unknown)})`;
        }
        return null;
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

/**
 * PROBE print-today: the overlay's browsing context prints silently to a PDF,
 * and the print-dialog service is instantiable. Returns the verdict string.
 */
async function probePrintToday(app, origin, printDir) {
    const { tabId } = await openLoaded(app, `${origin}/find`, '/find');
    const pdf = join(printDir, 'probe-print.pdf');
    const raw = await inChrome(app, `
        const o = overlayOf(${JSON.stringify(tabId)});
        if (!o) return JSON.stringify({ step: 'overlay' });
        const dialog = Cc['@mozilla.org/widget/printdialog-service;1'].getService(Ci.nsIPrintDialogService);
        const dialogService = typeof dialog.showPrintDialog === 'function';
        return (async () => {
            const settings = Cc['@mozilla.org/gfx/printsettings-service;1'].getService(Ci.nsIPrintSettingsService).createNewPrintSettings();
            settings.printerName = 'Mozilla Save to PDF';
            settings.outputDestination = Ci.nsIPrintSettings.kOutputDestinationFile;
            settings.outputFormat = Ci.nsIPrintSettings.kOutputFormatPDF;
            settings.toFileName = ${JSON.stringify(pdf)};
            settings.printSilent = true;
            try {
                await o.browsingContext.print(settings);
                return JSON.stringify({ step: 'printed', dialogService });
            } catch (err) {
                return JSON.stringify({ step: 'print-rejected', dialogService, name: String(err && err.name), result: err && err.result });
            }
        })();
    `);
    const result = JSON.parse(raw);
    if (result.step === 'overlay') {
        throw new Error(`${BROKEN} the overlay of ${tabId} was not found in chrome`);
    }
    if (result.step !== 'printed') {
        return `fails-${result.step}-${result.result ?? result.name ?? 'unknown'}`;
    }
    const size = await stat(pdf).then(s => s.size, () => 0);
    if (size === 0) {
        return 'fails-no-pdf-written';
    }
    return result.dialogService ? 'completes-silent-pdf-dialog-service-present' : 'completes-silent-pdf-dialog-service-missing';
}

/**
 * Wraps the Theia frame's WebTabChannel.request once, so each request's kind lands in window.__pbEditRequests.
 * Returns the count so far. The wrap is the only instrument: it sees every Theia-initiated request.
 */
function installRequestRecorder(app) {
    return probe(app, `const channel = get('WebTabChannel');
        if (!window.__pbEditRequests) {
            window.__pbEditRequests = [];
            const original = channel.request.bind(channel);
            channel.request = message => { window.__pbEditRequests.push(message && message.kind); return original(message); };
        }
        return window.__pbEditRequests.length;`);
}

const requestKinds = app => probe(app, 'return window.__pbEditRequests.slice();');

/** Runs an Edit item's command through the Theia command registry, as the menu does. */
function runEditCommand(app, id) {
    return probe(app, `return await get('CommandRegistry').executeCommand(${JSON.stringify(id)});`);
}

/**
 * edit (PAGE-09): the Edit items reach the page through the frozen kind. Copy, Cut and Paste run through
 * their commands and the page reports each event; Delete and Undo go through the kind, and Cut greys once
 * the selection is collapsed. Typing in the page sends no Theia request: the recorder first shows the kind
 * on the wire (the positive control), then typing must add none while the page's text changes.
 * Plant: the Copy item sends a check-only request, so no copy event arrives and the scenario goes red.
 */
async function scenarioEdit(app, origin, plant = false) {
    await installRequestRecorder(app);
    const { tabId, from } = await openLoaded(app, `${origin}/edit`, '/edit');
    const initial = await waitForPush(app, editTitle(tabId, /^ed s6 e10 n16 c0 x0 p0$/), { from, timeoutMs: 15000 });
    if (initial < 0) {
        return 'the edit page never reported its selection in its title';
    }
    if (await focusOverlay(app, tabId) !== true) {
        throw new Error(`${BROKEN} the overlay of ${tabId} could not be focused for the edit items`);
    }
    const step = async (name, re, send) => {
        const mark = (await pushes(app)).length;
        await send();
        return await waitForPush(app, editTitle(tabId, re), { from: mark, timeoutMs: 6000 }) >= 0 ? null : name;
    };
    const copyFailure = await step('copy', /^ed s6 e10 n16 c1 x0 p0$/, () => (plant
        ? channelRequest(app, { kind: 'webTabEdit', tabId, cmd: 'cmd_copy', checkOnly: true })
        : runEditCommand(app, 'powerbrowser.chrome-bar.edit-copy')));
    if (copyFailure) {
        const kinds = await requestKinds(app);
        if (!kinds.includes('webTabEdit')) {
            return 'the Copy command sent no webTabEdit request, so the Theia side never reached the channel';
        }
        return 'the Copy item did not reach the page: no copy event arrived after the Copy command';
    }
    if (await step('cut', /^ed s6 e10 n16 c1 x1 p0$/, () => runEditCommand(app, 'powerbrowser.chrome-bar.edit-cut'))) {
        return 'the Cut item did not reach the page: no cut event arrived';
    }
    if (await step('paste', /^ed s6 e10 n16 c1 x1 p1$/, () => runEditCommand(app, 'powerbrowser.chrome-bar.edit-paste'))) {
        return 'the Paste item did not reach the page: no paste event arrived';
    }
    const enabledWithSelection = await channelRequest(app, { kind: 'webTabEdit', tabId, cmd: 'cmd_cut', checkOnly: true });
    if (enabledWithSelection?.enabled !== true) {
        return `Cut reads disabled with "beta" selected (${JSON.stringify(enabledWithSelection)}), so a live selection would grey the item`;
    }
    if (await step('delete', /^ed s6 e6 n12 c1 x1 p1$/, () => channelRequest(app, { kind: 'webTabEdit', tabId, cmd: 'cmd_delete' }))) {
        return 'the delete through the kind did not reach the page';
    }
    // Not asserted here: a collapsed selection does not refresh the page's command enablement (Gecko's
    // TextInputListener::OnSelectionChange updates commands only for a non-empty selection), so the cached
    // enabled reply stays true after a collapse. Greying on a collapsed selection is a deferred finding.
    if (await step('undo', /^ed s\d+ e\d+ n16 c1 x1 p1$/, () => runEditCommand(app, 'powerbrowser.chrome-bar.edit-undo'))) {
        return 'the Undo item did not reach the page: the deleted text was not restored';
    }
    // Typing in the page sends no Theia request. The positive control above already put webTabEdit on the wire.
    // Positive control: the recorder has already seen Theia-initiated webTabEdit requests in this session.
    const seen = await requestKinds(app);
    if (!seen.includes('webTabEdit')) {
        return 'the recorder shows no webTabEdit request, so the no-traffic check below would prove nothing';
    }
    const before = seen.length;
    const titles =(await pushes(app)).filter(p => p && p.kind === 'state' && p.tabId === tabId);
    const titleBefore = String(titles[titles.length - 1]?.title);
    const typedMark = (await pushes(app)).length;
    await pressKey(app, { key: 'x', code: 'KeyX', keyCode: 88 });
    const typed = await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && String(p.title) !== titleBefore, { from: typedMark, timeoutMs: 6000 });
    await new Promise(resolve => setTimeout(resolve, 500));
    const after = (await requestKinds(app)).length;
    if (typed < 0) {
        return 'typing in the page produced no title change, so the key did not reach the editor';
    }
    if (after !== before) {
        return `typing in the page sent ${after - before} Theia request(s); key-driven editing must send none`;
    }
    return null;
}

/** The frozen edit command set (32-06): the boundary accepts exactly these, and the probe asks about each. */
const EDIT_CMDS = ['cmd_undo', 'cmd_redo', 'cmd_cut', 'cmd_copy', 'cmd_paste', 'cmd_pasteNoFormatting', 'cmd_selectAll', 'cmd_delete'];

/** A state push of `tabId` whose title matches `re`; the predicate runs in node over the pushes. */
const editTitle = (tabId, re) => p => p && p.kind === 'state' && p.tabId === tabId && re.test(String(p.title));

/**
 * PROBE edit-today: the chrome route (the Controllers actor, which a Theia-initiated Edit item
 * would use) and the page's own key, each checked against the title the edit page reports.
 * Records a verdict; never pass or fail. A missing page report or actor is a broken instrument.
 */
async function probeEditToday(app, origin) {
    const keyTab = await openLoaded(app, `${origin}/edit`, '/edit');
    if (await waitForPush(app, editTitle(keyTab.tabId, /^ed s6 e10 n16 c0 x0 p0$/), { from: keyTab.from, timeoutMs: 15000 }) < 0) {
        throw new Error(`${BROKEN} the edit page never reported its selection in its title`);
    }
    if (await focusOverlay(app, keyTab.tabId) !== true) {
        throw new Error(`${BROKEN} the overlay of ${keyTab.tabId} could not be focused for the key path`);
    }
    const keys = {};
    const keyRun = async (name, spec, re) => {
        const mark = (await pushes(app)).length;
        await pressKey(app, spec);
        keys[name] = await waitForPush(app, editTitle(keyTab.tabId, re), { from: mark, timeoutMs: 6000 }) >= 0;
    };
    await keyRun('cmd_selectAll', { key: 'a', code: 'KeyA', keyCode: 65, modifiers: ['accel'] }, /^ed s0 e16 n16 c0 x0 p0$/);
    await keyRun('cmd_copy', { key: 'c', code: 'KeyC', keyCode: 67, modifiers: ['accel'] }, /^ed s0 e16 n16 c1 x0 p0$/);
    await keyRun('cmd_cut', { key: 'x', code: 'KeyX', keyCode: 88, modifiers: ['accel'] }, /^ed s0 e16 n16 c1 x1 p0$/);
    await keyRun('cmd_paste', { key: 'v', code: 'KeyV', keyCode: 86, modifiers: ['accel'] }, /^ed s0 e16 n16 c1 x1 p1$/);
    await keyRun('cmd_delete', { key: 'Delete', code: 'Delete', keyCode: 46 }, /^ed s0 e0 n0 c1 x1 p1$/);
    await keyRun('cmd_undo', { key: 'z', code: 'KeyZ', keyCode: 90, modifiers: ['accel'] }, /^ed s\d+ e\d+ n16 c1 x1 p1$/);
    await keyRun('cmd_redo', { key: 'Z', code: 'KeyZ', keyCode: 90, modifiers: ['accel', 'shift'] }, /^ed s\d+ e\d+ n0 c1 x1 p1$/);

    const chromeTab = await openLoaded(app, `${origin}/edit`, '/edit');
    if (await waitForPush(app, editTitle(chromeTab.tabId, /^ed s6 e10 n16 c0 x0 p0$/), { from: chromeTab.from, timeoutMs: 15000 }) < 0) {
        throw new Error(`${BROKEN} the second edit page never reported its selection in its title`);
    }
    if (await focusOverlay(app, chromeTab.tabId) !== true) {
        throw new Error(`${BROKEN} the overlay of ${chromeTab.tabId} could not be focused for the chrome path`);
    }
    const chrome = {};
    const chromeRun = async (name, re) => {
        const mark = (await pushes(app)).length;
        const sent = await inChrome(app, `const o = overlayOf(${JSON.stringify(chromeTab.tabId)});
            if (!o) return 'no-overlay';
            try { o.browsingContext.currentWindowGlobal.getActor('Controllers').doCommand(${JSON.stringify(name)}); return 'sent'; }
            catch (err) { return 'no-actor'; }`);
        if (sent !== 'sent') {
            throw new Error(`${BROKEN} the chrome path could not send ${name} (${sent})`);
        }
        chrome[name] = await waitForPush(app, editTitle(chromeTab.tabId, re), { from: mark, timeoutMs: 6000 }) >= 0;
    };
    // The selection is "beta" (s6 e10) until cmd_delete; the event counters are cumulative.
    await chromeRun('cmd_copy', /^ed s6 e10 n16 c1 x0 p0$/);
    await chromeRun('cmd_cut', /^ed s6 e10 n16 c1 x1 p0$/);
    await chromeRun('cmd_paste', /^ed s6 e10 n16 c1 x1 p1$/);
    await chromeRun('cmd_pasteNoFormatting', /^ed s6 e10 n16 c1 x1 p2$/);
    await chromeRun('cmd_delete', /^ed s6 e6 n12 c1 x1 p\d+$/);
    await chromeRun('cmd_undo', /^ed s\d+ e\d+ n16 c1 x1 p\d+$/);
    await chromeRun('cmd_redo', /^ed s\d+ e\d+ n12 c1 x1 p\d+$/);
    await chromeRun('cmd_selectAll', /^ed s0 e12 n12 c1 x1 p\d+$/);

    const names = list => EDIT_CMDS.filter(name => list[name] === true);
    const failed = list => EDIT_CMDS.filter(name => list[name] === false);
    return [
        `chrome-help=${names(chrome).join(',')}`,
        `chrome-no-effect=${failed(chrome).join(',')}`,
        `content-native=${names(keys).join(',')}`,
        `key-no-effect=${failed(keys).join(',')}`,
        `keys-not-probed=${EDIT_CMDS.filter(name => !(name in keys)).join(',')}`,
    ].join(';');
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
    'keys-theia': (app, fx) => scenarioKeysTheia(app, fx.origin),
    downloads: (app, fx) => scenarioDownloads(app, fx),
    'downloads-today': async (app, fx, downloadDir) => {
        const verdict = await probeDownloadsToday(app, fx.origin, fx.requests, downloadDir);
        await recordVerdict('downloads-today', verdict);
        console.log(`  verdict downloads-today: ${verdict}`);
        return null;
    },
    print: (app, fx) => scenarioPrint(app, fx.origin),
    save: (app, fx) => scenarioSave(app, fx.origin),
    edit: (app, fx) => scenarioEdit(app, fx.origin),
    'edit-today': async (app, fx) => {
        const verdict = await probeEditToday(app, fx.origin);
        await recordVerdict('edit-today', verdict);
        console.log(`  verdict edit-today: ${verdict}`);
        return null;
    },
    'print-today': async (app, fx) => {
        const printDir = await mkdtemp(join(tmpdir(), 'pb-32-03-print-'));
        try {
            const verdict = await probePrintToday(app, fx.origin, printDir);
            await recordVerdict('print-today', verdict);
            console.log(`  verdict print-today: ${verdict}`);
            return null;
        } finally {
            await rm(printDir, { recursive: true, force: true });
        }
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
    {
        plant: 'audio-page-silent',
        target: 'audio',
        run: (app, fx) => scenarioAudio(app, fx.origin, '/find'),
        expect: 'no soundPlaying push',
    },
    {
        plant: 'print-tab-modal',
        target: 'print',
        run: (app, fx) => scenarioPrint(app, fx.origin, true),
        expect: 'tab-modal box is in chrome',
    },
    {
        plant: 'row-enabled-while-theia-focused',
        target: 'keys-theia',
        run: (app, fx) => scenarioKeysTheia(app, fx.origin, true),
        expect: 'is enabled while the Theia frame has focus',
    },
    {
        plant: 'edit-copy-skipped',
        target: 'edit',
        run: (app, fx) => scenarioEdit(app, fx.origin, true),
        expect: 'no copy event',
    },
    {
        plant: 'save-export-skipped',
        target: 'save',
        run: (app, fx) => scenarioSave(app, fx.origin, true),
        expect: 'was not written',
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
