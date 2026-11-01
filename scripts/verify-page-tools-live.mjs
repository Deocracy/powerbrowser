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
 *   remoteness-repro (32-07 Task 1, D-25a/D-25f): the shared-process blank reload, record-only. Eight
 *           sessions (reload and activation, four each), five same-origin tabs per session. Writes the
 *           verdict key only when named on the command line; the default run and --self-test never do.
 *           The isolation log is written with `sync` and must hold at least five navigation lines before the trigger (else NOT
 *           SCORED); a legacy-open control (the pre-afda7df1 open order) must read the phantom about:blank entry, so the
 *           product path's not-reproduced is read by an instrument that can see the defect.
 *   remoteness-activeness-probe (32-07 gap closure): record-only, own session, writes its verdict key only when named. One cross-site
 *           switch of a visible overlay; reads docShellIsActive, renderLayers, the browsing context's isActive and visibility.
 *   favicon  PAGE-04 (32-08, pill rows added in the gap closure): the page's data: icon reaches a state push, a strip row draws
 *            it as an <img> with that URL, and so does the tab's row in the Tabs-mode pill list.
 *   reader   PAGE-10 (32-08, 32-07 gap closure): an article page pushes isArticle true, the toggle enables, a click enters the
 *            reader in the same tab (about:reader? in chrome's read) and a click leaves it with Back and Forward as before; a
 *            short page never pushes isArticle true and keeps the toggle disabled. Plant: the signal never reaches a push.
 *   source   PAGE-10 (32-08): Ctrl+U loads the page's source in the same overlay (chrome-side positive control); Theia
 *            holds no view-source URL and no push carries one.
 *   crash    PAGE-11 (32-08): about:crashcontent in the scratch tab; the contracted crash copy and Reload tab button show,
 *            the overlay hides, Reload tab brings the page back with its history (kept by the shell, restored on the reopen).
 *   crash-reader  32-REVIEW CR-01, WR-01: the same crash with the tab in reader view. Theia holds the page URL, not the
 *            reader URL, and Reload tab brings the page back with its history, reader entry included. Plant: the widget
 *            holds the reader URL, which the reopen refuses.
 *   crash-switching  32-REVIEW WR-04: the same crash while the overlay is mid process switch (DidChangeBrowserRemoteness
 *            dispatched, nothing settled); the crashed push must still arrive and Reload tab must recover the tab.
 *   crash-navigate  32-REVIEW WR-08: Back and Forward are disabled on a crashed tab, and a URL sent to it loads there
 *            with the kept history behind it.
 *   remoteness-regression  (32-08, D-25a): five same-site tabs, the fifth reloaded and then activated; each must end on its
 *            page with docShellIsActive. Self-sessioned; writes no verdict.
 *   devtools  PAGE-10 (32-07 gap closure): F12 from a page opens one stock toolbox window for that tab; a second open keeps one;
 *            closing the tab closes it; a quit with a toolbox open exits. Plant: the open never reaches chrome.
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
import { REPO_ROOT, probe, sourceConst } from './lib/pb-relaunch.mjs';
import {
    BROKEN, focusOverlay, focusTheiaFrame, inChrome, loadedAt, makeCurrent, openWebTab, overlayVisibility, pageKeyDisabled, pressKey, pushes,
    serveNavPages, waitForPush, withProbeShell,
} from './lib/pb-live-probe.mjs';

const NAME = 'page-tools-live';
const VERDICTS = join(dirname(fileURLToPath(import.meta.url)), 'lib', 'pb-probe-verdicts.json');
const WEB_TAB_REL = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const CHROME_BAR_COPY_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts';

/** The crash copy and its button label, read from the source that declares them (D-25c). */
const CRASHED_COPY = sourceConst(WEB_TAB_REL, 'CRASHED_COPY');
const CRASHED_RELOAD_LABEL = sourceConst(WEB_TAB_REL, 'CRASHED_RELOAD_LABEL');

/** A `key: "<value>"` string of CHROME_BAR_COPY, read from the copy module (the reader tooltip is pinned there). */
function copyOf(rel, key) {
    const match = new RegExp(`${key}: (['"])((?:(?!\\1).)*)\\1`).exec(readFileSync(join(REPO_ROOT, rel), 'utf8'));
    if (!match) {
        throw new Error(`${BROKEN} ${key} is no longer a string in ${rel}`);
    }
    return match[2];
}
const READER_UNAVAILABLE = copyOf(CHROME_BAR_COPY_REL, 'readerUnavailable');
const READER_VIEW = copyOf(CHROME_BAR_COPY_REL, 'readerView');
const READER_EXIT = copyOf(CHROME_BAR_COPY_REL, 'exitReaderView');

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

/** A 1x1 PNG, carried as the /icon page's data: icon link. */
const ICON_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** The fixture origin: /find, /media, /tone.wav, /edit, /icon and an attachment at /download. Every GET is recorded. */
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
        } else if (path === '/icon') {
            // favicon: the page's own icon as a data: URL, so no icon is fetched over the network. The link is added from a
            // timer after load (32-REVIEW WR-03), so the icon lands after the load's last state push and must push itself.
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(`<!doctype html><html><head><title>Icon fixture</title></head><body><p>icon page</p><script>
addEventListener('load', () => setTimeout(() => {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = ${JSON.stringify(ICON_DATA)};
    document.head.appendChild(link);
}, 1500));
</script></body></html>`);
        } else if (path === '/article') {
            // reader: four long paragraphs pass Readerable's check (each sqrt(length - 140) adds to a score that must pass 20).
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            const paragraph = `<p>${'The quick brown fox jumps over the lazy dog while the reader considers the article text at length. '.repeat(6)}</p>`;
            response.end(html('Article fixture', `<h1>Article fixture</h1>${paragraph.repeat(4)}`));
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
    // 32-REVIEW WR-05: highlight-all on, then off. The page's Finder reports each highlight pass (onHighlightFinished,
    // FinderParent); the off pass must report highlight false, or the highlights stay on the page. A notification without
    // a highlight flag (another find's pass) is recorded as null and counts for neither.
    await inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)});
        window.__pbHighlights = [];
        const noop = () => {};
        o.finder.addResultListener({ onFindResult: noop, onMatchesCountResult: noop, onCurrentSelection: noop,
            onHighlightFinished: r => window.__pbHighlights.push(typeof r.highlight === 'boolean' ? r.highlight : null) });
        return true;`);
    const highlights = async () => JSON.parse(await inChrome(app, 'return JSON.stringify(window.__pbHighlights);'));
    await channelRequest(app, { kind, tabId, query: 'needle', highlightAll: true });
    if (!(await settleValue(highlights, v => Array.isArray(v) && v.includes(true))).includes(true)) {
        return 'highlight-all on never reported a highlight pass from the page';
    }
    const onCount = (await highlights()).length;
    await channelRequest(app, { kind, tabId, query: 'needle', highlightAll: false });
    const off = await settleValue(highlights, v => v.slice(onCount).includes(false));
    if (!off.slice(onCount).includes(false)) {
        return 'highlight-all off did not clear the highlights (no highlight-false pass from the page)';
    }
    // 32-REVIEW WR-06: a new page resets chrome's stored query, while Theia's tab still holds "needle" (the bar shows it).
    // A step from Theia must still find: the widget's findNext, the path Enter, F3 and the step buttons take.
    await probe(app, `await get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).find('needle', {}); return true;`);
    const navMark = (await pushes(app)).length;
    if ((await channelRequest(app, { kind: 'webTabNavigate', tabId, url: `${origin}/find?again` }))?.ok !== true
        || await waitForPush(app, loadedAt(tabId, '/find?again'), { from: navMark, timeoutMs: 30000 }) < 0) {
        throw new Error(`${BROKEN} the second find page never loaded`);
    }
    const stepMark = (await pushes(app)).length;
    await probe(app, `await get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).findNext(false); return true;`);
    if (await waitForPush(app, stateOf(tabId, p => p.findTotal >= 3 && p.findStatus === 'found'), { from: stepMark, timeoutMs: 10000 }) < 0) {
        return 'after a navigation, a find step from the bar did nothing (chrome had no query, and Theia did not re-run its own)';
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
 * favicon (PAGE-04, 32-08): the page's data: icon reaches a state push, and a strip row renders it as an <img> with
 * that exact URL. Showing it fetches nothing: the icon is the page's own data: URL. `plant` rewrites the rendered
 * img to an http URL, which the row must never show, so the check goes red.
 */
async function scenarioFavicon(app, origin, plant = false) {
    const { tabId, from } = await openLoaded(app, `${origin}/icon`, '/icon');
    const at = await waitForPush(app, stateOf(tabId, p => typeof p.favicon === 'string' && p.favicon.startsWith('data:image/')), { from, timeoutMs: 20000 });
    if (at < 0) {
        return 'no favicon push: the page icon never reached a state push as a data:image/ URL';
    }
    const favicon = (await pushes(app))[at].favicon;
    const rowSources = () => probe(app, "return [...document.querySelectorAll('img.pb-tab-favicon')].map(img => img.getAttribute('src'));");
    const drawn = await settleValue(rowSources, v => Array.isArray(v) && v.includes(favicon));
    if (!drawn.includes(favicon)) {
        return 'no strip row renders the pushed favicon as an img (the tab shows the globe instead)';
    }
    if (plant === true) {
        await probe(app, "document.querySelectorAll('img.pb-tab-favicon').forEach(img => img.setAttribute('src', 'http://127.0.0.1/planted.png')); return true;");
    }
    const after = await settleValue(rowSources, v => Array.isArray(v) && v.includes(favicon));
    if (!Array.isArray(after) || !after.includes(favicon)) {
        return 'no strip row carries the pushed favicon as its img src (a non-data URL is shown in its place)';
    }
    // The Tabs-mode pill rows: another tab becomes current, `% ` puts the pill in Tabs mode, and the icon tab is listed
    // with the pushed icon. The row is found by its title, so a list without the tab cannot pass (the positive control).
    const other = await openLoaded(app, `${origin}/find`, '/find');
    await makeCurrent(app, other.tabId);
    if (await focusTheiaFrame(app) !== true) {
        throw new Error(`${BROKEN} the Theia frame could not be focused to type into the pill`);
    }
    const typed = await probe(app, `const input = document.querySelector('.pb-chrome-bar-input');
        if (!input) return false;
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '% ');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;`);
    if (typed !== true) {
        throw new Error(`${BROKEN} the pill is not in the chrome bar`);
    }
    const pillRow = () => probe(app, `const row = [...document.querySelectorAll('.pb-chrome-bar-dropdown .pb-chrome-bar-row:not(.is-shimmer)')]
            .find(r => ((r.querySelector('.pb-chrome-bar-row-title') || {}).textContent || '') === 'Icon fixture');
        if (!row) return null;
        const img = row.querySelector('img.pb-chrome-bar-row-icon');
        return { img: img ? img.getAttribute('src') : null };`);
    const listed = await settleValue(pillRow, v => v !== null);
    if (listed === null) {
        throw new Error(`${BROKEN} Tabs mode lists no row for the icon tab, so its icon cannot be read`);
    }
    if (plant === 'pill') {
        await probe(app, "document.querySelectorAll('.pb-chrome-bar-dropdown img.pb-chrome-bar-row-icon').forEach(img => img.setAttribute('src', 'http://127.0.0.1/planted.png')); return true;");
    }
    const row = await settleValue(pillRow, v => v !== null && v.img === favicon);
    return row && row.img === favicon ? null : `the Tabs-mode pill row for the icon tab does not carry the pushed favicon (img ${JSON.stringify(row && row.img && row.img.slice(0, 40))})`;
}

/**
 * reader (PAGE-10, 32-08 and the 32-07 gap closure): the readability signal and the toggle.
 * An article page (four long paragraphs) pushes isArticle true; the toggle enables with the contracted copy; a click
 * enters the reader in the same tab (chrome's read of the overlay URI is about:reader?, not blank) and a click leaves it,
 * with Back and Forward as they were. A short page never pushes isArticle true (the article page is its positive control)
 * and its toggle stays disabled with the contracted non-article tooltip.
 * `plant` replaces the overlay's isArticle accessor with a plain property and reloads the article page, so the signal
 * never reaches a push, which must go red.
 */
async function scenarioReader(app, origin, plant = false) {
    const article = await openLoaded(app, `${origin}/article`, '/article');
    let signalFrom = 0;
    if (plant) {
        const reloadMark = (await pushes(app)).length;
        const planted = await inChrome(app, `const o = overlayOf(${JSON.stringify(article.tabId)});
            Object.defineProperty(o, 'isArticle', { configurable: true, writable: true, value: false });
            o.reload(); return true;`);
        if (planted !== true) {
            throw new Error(`${BROKEN} the overlay of ${article.tabId} was not found to plant on`);
        }
        // Only pushes after the reloaded page settled count: one scheduled before the plant may still carry the old signal.
        if (await waitForPush(app, loadedAt(article.tabId, '/article'), { from: reloadMark, timeoutMs: 20000 }) < 0) {
            throw new Error(`${BROKEN} the planted reload never settled`);
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
        signalFrom = (await pushes(app)).length;
    }
    const signal = await waitForPush(app, stateOf(article.tabId, p => p.isArticle === true), { from: signalFrom, timeoutMs: plant ? 8000 : 20000 });
    if (signal < 0) {
        return 'no isArticle push: the readability signal of an article page never reached Theia';
    }
    await makeCurrent(app, article.tabId);
    const toggle = () => probe(app, "const b = document.querySelector('.pb-chrome-bar-reader'); return b ? { disabled: b.disabled === true, title: b.getAttribute('title') } : null;");
    const enabled = await settleValue(toggle, v => v !== null && v.disabled === false);
    if (enabled === null || enabled.disabled !== false || enabled.title !== READER_VIEW) {
        return `the reader toggle is not enabled with the contracted copy on an article page (${JSON.stringify(enabled)})`;
    }
    const overlayUri = () => inChrome(app, `const o = overlayOf(${JSON.stringify(article.tabId)}); return o && o.currentURI ? o.currentURI.spec : '';`);
    const history = () => channelRequest(app, { kind: 'webTabHistory', tabId: article.tabId });
    const widgetNav = () => probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(article.tabId)}); return { back: w.canGoBack, forward: w.canGoForward };`);
    const before = await widgetNav();
    const click = () => probe(app, "const b = document.querySelector('.pb-chrome-bar-reader'); if (!b || b.disabled) return false; b.click(); return true;");
    const enterMark = (await pushes(app)).length;
    if (await click() !== true) {
        return 'the reader toggle could not be clicked on an article page';
    }
    if (await waitForPush(app, stateOf(article.tabId, p => p.isReaderMode === true), { from: enterMark, timeoutMs: 20000 }) < 0) {
        return 'entering reader view never pushed isReaderMode true';
    }
    const inReader = await overlayUri();
    if (!inReader.startsWith('about:reader?')) {
        return `the overlay is not on the reader page after entering (chrome reads ${JSON.stringify(inReader.slice(0, 40))})`;
    }
    const exitTitle = await settleValue(toggle, v => v !== null && v.title === READER_EXIT);
    if (exitTitle === null || exitTitle.title !== READER_EXIT || exitTitle.disabled !== false) {
        return `the toggle does not offer Exit reader view while in the reader (${JSON.stringify(exitTitle)})`;
    }
    const leaveMark = (await pushes(app)).length;
    if (await click() !== true) {
        return 'the reader toggle could not be clicked to leave the reader';
    }
    if (await waitForPush(app, stateOf(article.tabId, p => p.isReaderMode === false && p.loading === false && String(p.url).endsWith('/article')), { from: leaveMark, timeoutMs: 20000 }) < 0) {
        return 'leaving reader view did not return to the article page';
    }
    const after = await settleValue(widgetNav, v => v.forward === true);
    if (after.back !== before.back || after.forward !== true) {
        return `Back and Forward are wrong after leaving the reader (before ${JSON.stringify(before)}, after ${JSON.stringify(after)})`;
    }
    const entries = (await history()).entries;
    if (!Array.isArray(entries) || !entries.some(entry => String(entry.url).endsWith('/article'))) {
        return 'the history after leaving the reader has no article entry';
    }
    // The non-article half: a short page never pushes isArticle true, and its toggle stays disabled with the non-article tooltip.
    const short = await openLoaded(app, `${origin}/find`, '/find');
    const shortMark = (await pushes(app)).length;
    await makeCurrent(app, short.tabId);
    await new Promise(resolve => setTimeout(resolve, 3000));
    const early = (await pushes(app)).slice(shortMark).filter(p => p && p.kind === 'state' && p.tabId === short.tabId && p.isArticle === true);
    if (early.length > 0) {
        return 'a short page pushed isArticle true';
    }
    const state = await settleValue(toggle, v => v !== null && v.disabled === true);
    if (state === null || state.disabled !== true) {
        return `the reader toggle is enabled on a non-article page (disabled=${state && state.disabled})`;
    }
    return state.title === READER_UNAVAILABLE ? null : `the reader toggle's tooltip is not the contracted non-article copy (${JSON.stringify(state.title)})`;
}

/**
 * source (PAGE-10, 32-08): Ctrl+U in a focused page loads its source in the same overlay, minted chrome-side. The
 * positive control is chrome's own read of the overlay's URL (`view-source:`), so the Theia-side reads mean something.
 * Theia must hold no view-source URL: no push since the key carries one, and the widget's url is the page's own.
 * `plant` makes the widget hold the view-source URL, which must go red.
 */
async function scenarioSource(app, origin, plant = false) {
    const { tabId, from } = await openLoaded(app, `${origin}/find`, '/find');
    if (await focusOverlay(app, tabId) !== true) {
        throw new Error(`${BROKEN} the overlay of ${tabId} could not be focused`);
    }
    const browsersBefore = await inChrome(app, "return document.querySelectorAll('browser').length;");
    const pressed = await pressPageKey(app, tabId, 'viewSource', { key: 'u', code: 'KeyU', keyCode: 85, modifiers: ['accel'] });
    if (pressed < 0) {
        return 'Ctrl+U in a focused page produced no shortcut push: the viewSource row did not relay';
    }
    const minted = await settleValue(
        () => inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); return o && o.currentURI ? o.currentURI.spec : '';`),
        v => typeof v === 'string' && v.startsWith('view-source:'),
    );
    if (typeof minted !== 'string' || !minted.startsWith('view-source:')) {
        return 'Ctrl+U relayed, but the overlay never loaded a view-source: page (chrome-side read)';
    }
    const browsersAfter = await inChrome(app, "return document.querySelectorAll('browser').length;");
    if (browsersAfter !== browsersBefore) {
        return `Ctrl+U opened another browser element (${browsersBefore} to ${browsersAfter}): the source did not stay in the tab`;
    }
    if (plant === true) {
        await probe(app, `get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).url = 'view-source:' + ${JSON.stringify(origin)} + '/find'; return true;`);
    }
    const held = await probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}); return w ? w.url : null;`);
    if (typeof held === 'string' && held.includes('view-source:')) {
        return 'Theia holds a view-source: URL (its widget url names the source, not the page)';
    }
    const pushed = (await pushes(app)).slice(from).filter(p => JSON.stringify(p).includes('view-source:'));
    if (pushed.length > 0) {
        return `${pushed.length} push(es) carried a view-source: string into Theia`;
    }
    // 32-REVIEW WR-02: the history reply crosses the same wall. A view-source document's title is its view-source: URL.
    const reply = await channelRequest(app, { kind: 'webTabHistory', tabId });
    if (!Array.isArray(reply?.entries) || reply.entries.length < 2) {
        throw new Error(`${BROKEN} the history reply holds no source entry to read (${JSON.stringify(reply).slice(0, 80)})`);
    }
    if (plant === 'history-title') {
        reply.entries[reply.entries.length - 1].title = minted;
    }
    return JSON.stringify(reply).includes('view-source:') ? 'the history reply carried a view-source: string into Theia' : null;
}

/**
 * devtools (PAGE-10, 32-07 gap closure): F12 from a focused page opens the stock DevTools toolbox window for that tab's
 * overlay. Positive control: before any open there is no toolbox for the overlay, and chrome's own read of the toolbox
 * list (DevToolsShim) is what proves the window exists. Then: exactly one toolbox for the overlay; a second open (the
 * channel kind, the same arm F12's widget method sends) still leaves one; closing the tab closes its toolbox and window;
 * and a quit with a toolbox open exits. `plant` sends a kind chrome does not know instead of the open, which must go red.
 */
async function scenarioDevtools(app, origin, plant = false) {
    const { tabId } = await openLoaded(app, `${origin}/find`, '/find');
    const read = body => inChrome(app, `const { DevToolsShim } = ChromeUtils.importESModule('chrome://devtools-startup/content/DevToolsShim.sys.mjs');
        const o = overlayOf(${JSON.stringify(tabId)});
        const mine = o ? DevToolsShim.getToolboxes().filter(t => t.commands?.descriptorFront?.browserId === o.browserId) : [];
        ${body}`);
    const count = () => read('return mine.length;');
    const windowOpen = () => inChrome(app, "return Services.wm.getMostRecentWindow('devtools:toolbox') !== null;");
    /** Polls `readValue` every 200 ms for up to `ms` until it equals `want`; returns the last value read. */
    const until = async (readValue, want, ms = 15000) => {
        let value = await readValue();
        for (let waited = 0; value !== want && waited < ms; waited += 200) {
            await new Promise(resolve => setTimeout(resolve, 200));
            value = await readValue();
        }
        return value;
    };
    if (await count() !== 0 || await windowOpen() !== false) {
        throw new Error(`${BROKEN} a toolbox exists before F12 was pressed, so the read cannot show an open`);
    }
    if (plant) {
        // The planted fault: the open never reaches chrome (a kind it does not know), so F12 does nothing.
        await channelRequest(app, { kind: 'webTabDevtoolsDropped', tabId });
    } else if (await pressPageKey(app, tabId, 'devtoolsOpen', { key: 'F12', code: 'F12', keyCode: 123 }) < 0) {
        return 'F12 in a focused page produced no shortcut push: the devtoolsOpen row did not relay';
    }
    const opened = await until(count, 1);
    if (opened !== 1) {
        return `no DevTools toolbox for the tab after F12 (toolboxes for its overlay: ${opened})`;
    }
    if (await windowOpen() !== true) {
        return 'the toolbox exists but no devtools:toolbox window is open';
    }
    const again = await channelRequest(app, { kind: 'webTabDevtools', tabId });
    if (again?.ok !== true) {
        return `a second DevTools open was refused (${JSON.stringify(again)})`;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
    if (await count() !== 1) {
        return `a second DevTools open left ${await count()} toolboxes for the tab, want 1`;
    }
    const closed = await channelRequest(app, { kind: 'webTabClose', tabId });
    if (closed?.ok !== true) {
        return `closing the tab was refused (${JSON.stringify(closed)})`;
    }
    if (await until(windowOpen, false) !== false) {
        return 'closing the tab left its DevTools toolbox window open';
    }
    // A toolbox open at quit: a second tab, its toolbox, then the desktop close. The browser must exit.
    const second = await openLoaded(app, `${origin}/find`, '/find');
    const reply = await channelRequest(app, { kind: 'webTabDevtools', tabId: second.tabId });
    if (reply?.ok !== true || await until(windowOpen, true) !== true) {
        return `DevTools did not open on the second tab to quit over (${JSON.stringify(reply)})`;
    }
    const quitAt = Date.now();
    const exited = await app.quit({ how: 'desktop-close', timeoutMs: 25000 });
    console.log(`  quit with a toolbox open: ${exited} after ${Date.now() - quitAt} ms`);
    return exited === 'exited' ? null : 'the browser did not exit with a DevTools toolbox open';
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

// ---------------------------------------------------------------------------
// remoteness-repro (32-07 Task 1): the shared-process blank reload, reproduced on the tree as it is.
// Record-only: it prints PASS when every run ran with its observers proven, whatever the verdict. Each
// run is its own session, because five same-site tabs share a content process on purpose
// (dom.ipc.processCount.webIsolated=4). The parent's ProcessIsolation log is written under TMPDIR only.
// ---------------------------------------------------------------------------
const REPRO_RUNS = 4;
const REPRO_TRIGGERS = ['reload', 'activate'];

/** The five same-origin pages; each carries its own title, which the positive control waits for. */
function reproPages() {
    const pages = {};
    for (let n = 1; n <= 5; n += 1) {
        pages[`/rr${n}`] = { title: `RR ${n}`, body: `<p>repro page ${n}</p>` };
    }
    return pages;
}

/** A loaded state push for `tabId` at `path` that carries the served `title`. */
const sameTitled = (tabId, path, title) => p => p && p.kind === 'state' && p.tabId === tabId && p.loading === false
    && String(p.url).endsWith(path) && p.title === title;

/**
 * The overlay's state as primitives: URL classes, a remote-type prefix, counters and flags. Never a URL, title,
 * port or origin. `didChange` counts DidChangeBrowserRemoteness on the overlay (armReproOverlay).
 */
async function readReproState(app, tabId) {
    // The evaluate result is serialised in chrome: an object returned as-is loses its keys in the BiDi round trip.
    const text = await inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)});
        if (!o) return 'null';
        const bc = o.browsingContext;
        const cls = s => (s.startsWith('http://') || s.startsWith('https://')) ? 'http' : (s === 'about:blank' ? 'about:blank' : 'other');
        const hist = bc ? bc.sessionHistory : null;
        const entries = [];
        for (let i = 0; hist && i < hist.count; i += 1) entries.push(cls(hist.getEntryAtIndex(i).URI.spec));
        return JSON.stringify({
            url: cls(o.currentURI ? o.currentURI.spec : ''),
            remoteType: String(o.remoteType || '').split('=')[0],
            bcId: bc ? bc.id : -1,
            childId: o.frameLoader ? o.frameLoader.childID : -1,
            active: o.docShellIsActive === true ? 1 : 0,
            renderLayers: o.renderLayers === true ? 1 : 0,
            visible: o.style.visibility === 'visible' ? 1 : 0,
            history: entries.join(',') + '@' + (hist ? hist.index : -1),
            didChange: o.__pbRemoteChanges || 0,
        });`);
    return text === 'null' ? null : JSON.parse(text);
}

/** Counts DidChangeBrowserRemoteness on the overlay with the scenario's own listener, armed once. */
function armReproOverlay(app, tabId) {
    return inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)});
        if (!o) return false;
        if (o.__pbRemoteChanges === undefined) {
            o.__pbRemoteChanges = 0;
            o.addEventListener('DidChangeBrowserRemoteness', () => { o.__pbRemoteChanges += 1; });
        }
        return true;`);
}

/** The parent process's ProcessIsolation log. MOZ_LOG_FILE carries %PID, so the parent's name has '-main.'. */
async function parentLogOf(dir) {
    const name = (await readdir(dir)).find(file => file.includes('-main.'));
    return name ? join(dir, name) : null;
}

async function logBytes(path) {
    if (!path) {
        return 0;
    }
    try {
        return (await stat(path)).size;
    } catch {
        return 0;
    }
}

/**
 * The last CheckIsolationForNavigation line after `offset`, reduced to remote-type prefixes and the replace flag,
 * plus `compatible=1` when the switch was aborted as compatible. Null when the trigger logged no navigation.
 */
async function isolationSince(path, offset) {
    if (!path) {
        return null;
    }
    const lines = (await readFile(path)).subarray(offset).toString('utf8').split('\n');
    let last = -1;
    lines.forEach((line, i) => {
        if (line.includes('CheckIsolationForNavigation ->')) {
            last = i;
        }
    });
    if (last < 0) {
        return null;
    }
    const m = /current:\(([^=)]*)[^)]*\) remoteType:\(([^=)]*)[^)]*\) replace:(\d)/.exec(lines[last]);
    if (!m) {
        return 'unparsed';
    }
    const compatible = lines.slice(last + 1, last + 4).some(line => line.includes('is compatible'));
    return `current=${m[1]},target=${m[2]},replace=${m[3]}${compatible ? ' compatible=1' : ''}`;
}

/** The CheckIsolationForNavigation lines in the parent log so far (the log is written with `sync`, so a live read sees them). */
async function isolationLineCount(path) {
    return path ? (await readFile(path, 'utf8')).split('\n').filter(line => line.includes('CheckIsolationForNavigation ->')).length : 0;
}

/** Five navigations (the five tabs' loads) must be in the parent log before the trigger, else the isolation read means nothing. */
const ISOLATION_LINES_MIN = 5;

/** A page load's wait in the repro sessions: a loaded host (the sessions share a machine with builds) can take well over 30 s. */
const REPRO_LOAD_MS = 90000;

/**
 * The session body: positive controls first, then the trigger, then the reads. Returns { notScored } or { run, logOffset }.
 * `legacy` opens the fifth tab the way the pre-afda7df1 first load did: about:blank, then at once a plain navigation that
 * supersedes the replace-history first load. That is the phantom-about:blank-entry defect, the control the product path is read against.
 */
async function reproBody(app, pages, trigger, blind, dir, plantBlank = false, legacy = false) {
    // The blind plant disconnects the request log, so the observer behind getSeen and the initial-GET control cannot see anything.
    const observed = () => (blind ? [] : pages.requests);
    const tabs = [];
    for (let n = 1; n <= 4; n += 1) {
        const tabId = await openWebTab(app, pages.url(`/rr${n}`));
        await armReproOverlay(app, tabId);
        if (await waitForPush(app, sameTitled(tabId, `/rr${n}`, `RR ${n}`), { timeoutMs: REPRO_LOAD_MS }) < 0) {
            // What chrome reads for the overlay, so a lost load is told apart from a lost push.
            throw new Error(`${BROKEN} page /rr${n} never reached a loaded push with its title (${JSON.stringify(await readReproState(app, tabId))}, GETs ${pages.requests.filter(r => r.path === `/rr${n}`).length})`);
        }
        tabs.push(tabId);
        if (trigger === 'activate') {
            await makeCurrent(app, tabId);
        }
    }
    const fifth = await openWebTab(app, legacy ? 'about:blank' : pages.url('/rr5'));
    if (!await armReproOverlay(app, fifth)) {
        throw new Error(`${BROKEN} the fifth overlay is missing before the trigger`);
    }
    if (legacy) {
        await channelRequest(app, { kind: 'webTabNavigate', tabId: fifth, url: pages.url('/rr5') });
    }
    const loaded = await waitForPush(app, sameTitled(fifth, '/rr5', 'RR 5'), { timeoutMs: REPRO_LOAD_MS });
    if (!observed().some(r => r.path === '/rr5')) {
        return { notScored: 'no initial GET for the fifth tab' };
    }
    if (loaded < 0) {
        return { notScored: 'the fifth tab never loaded its served title' };
    }
    if (trigger === 'activate') {
        // The fifth overlay opened behind another widget: making tab 1 current hides it.
        await makeCurrent(app, tabs[0]);
    }
    const pre = await readReproState(app, fifth);
    if (!pre) {
        throw new Error(`${BROKEN} the fifth overlay is missing before the trigger`);
    }
    const path = await parentLogOf(dir);
    const lines = await isolationLineCount(path);
    if (lines < ISOLATION_LINES_MIN) {
        return { notScored: `the isolation log holds ${lines} navigation line(s) before the trigger, fewer than ${ISOLATION_LINES_MIN}: the capture is not working` };
    }
    const logOffset = await logBytes(path);
    const mark = (await pushes(app)).length;
    const start = Date.now();
    if (trigger === 'reload') {
        // The message verify-nav-keys-live.mjs sends for Reload.
        await channelRequest(app, { kind: 'webTabReload', tabId: fifth });
    } else {
        await makeCurrent(app, fifth);
    }
    if (plantBlank) {
        // The blank-reload plant: the fifth overlay ends on about:blank, the defect's own symptom.
        await inChrome(app, "overlayOf(" + JSON.stringify(fifth) + ").fixupAndLoadURIString('about:blank', { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); return true;");
    }
    await waitForPush(app, stateOf(fifth, p => p.loading === false), { from: mark, timeoutMs: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    const post = await readReproState(app, fifth);
    if (!post) {
        throw new Error(`${BROKEN} the fifth overlay is missing after the trigger`);
    }
    return { run: { trigger, pre, post, legacy, getSeen: observed().some(r => r.path === '/rr5' && r.at >= start) }, logOffset };
}

/** True when a page's history holds an about:blank entry after an http entry (a page replaced by about:blank). */
function blankAfterPage(history) {
    const entries = history.split('@')[0].split(',');
    return entries.some((entry, i) => entry === 'about:blank' && entries.slice(0, i).includes('http'));
}

/** One run's verdict record: blank, and the field list the verdict string quotes. */
function reproRecord({ trigger, pre, post, getSeen, legacy }, isolation) {
    const historyGained = blankAfterPage(post.history) && !blankAfterPage(pre.history);
    // The legacy control's symptom is the phantom about:blank entry the old open order leaves (live: `about:blank,http@1`,
    // the entry before the page, not after it), so it is read on the final history alone.
    const phantom = post.history.split('@')[0].split(',').includes('about:blank');
    const blank = legacy ? phantom : post.url === 'about:blank' || historyGained || (trigger === 'reload' && !getSeen);
    const pairs = [
        ['url', post.url],
        ['remoteType', post.remoteType],
        ['bcSame', pre.bcId === post.bcId ? 1 : 0],
        ['childSame', pre.childId === post.childId ? 1 : 0],
        ['active', post.active],
        ['renderLayers', post.renderLayers],
        ['visible', post.visible],
        ['history', post.history],
    ];
    if (trigger === 'reload') {
        pairs.push(['getSeen', getSeen ? 1 : 0]);
    }
    pairs.push(['didChange', post.didChange - pre.didChange], ['isolation', isolation ?? 'none']);
    return { trigger, blank, active: post.active, fields: pairs.map(([key, value]) => `${key}=${value}`).join(' ') };
}

/**
 * One record-only run in its own session. Returns { notScored } when the observers did not prove themselves
 * (a harness fault, never a verdict), else { run } with the primitives the verdict is built from.
 */
async function reproSession(trigger, blind, plantBlank = false, { legacy = false, unsynced = false } = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'pb-32-07-iso-'));
    const previous = { log: process.env.MOZ_LOG, file: process.env.MOZ_LOG_FILE };
    // `sync` writes each line as it is logged: without it the lines sit in a buffer a fast shutdown (_exit) or a kill never flushes.
    process.env.MOZ_LOG = unsynced ? 'ProcessIsolation:5' : 'sync,ProcessIsolation:5';
    process.env.MOZ_LOG_FILE = join(dir, 'iso-%PID.moz_log');
    const pages = await serveNavPages(reproPages());
    try {
        const outcome = await withProbeShell(app => reproBody(app, pages, trigger, blind, dir, plantBlank, legacy));
        if (outcome.notScored) {
            return { notScored: outcome.notScored };
        }
        // The browser has exited, so the parent log is complete.
        const isolation = await isolationSince(await parentLogOf(dir), outcome.logOffset);
        // A reload navigates, so its own line must be in the log: a missing tail is what an unsynced, killed browser loses.
        if (trigger === 'reload' && isolation === null) {
            return { notScored: 'the reload\'s own navigation line is not in the isolation log: the capture is not working' };
        }
        return { run: reproRecord(outcome.run, isolation) };
    } finally {
        if (previous.log === undefined) {
            delete process.env.MOZ_LOG;
        } else {
            process.env.MOZ_LOG = previous.log;
        }
        if (previous.file === undefined) {
            delete process.env.MOZ_LOG_FILE;
        } else {
            process.env.MOZ_LOG_FILE = previous.file;
        }
        await pages.close();
        await rm(dir, { recursive: true, force: true });
    }
}

/** The verdict: reproduced when any run was blank, then the counts, then the first blank run of each trigger. */
function reproVerdict(runs) {
    const blanks = list => list.filter(run => run.blank).length;
    const r = blanks(runs.reload);
    const a = blanks(runs.activate);
    const first = (label, list) => {
        const hit = list.find(run => run.blank);
        return hit ? `, ${label}: ${hit.fields}` : '';
    };
    return `${r + a > 0 ? 'reproduced' : 'not-reproduced'} R ${r}/${REPRO_RUNS} A ${a}/${REPRO_RUNS}`
        + first('R', runs.reload) + first('A', runs.activate);
}

/**
 * The legacy-open control: the pre-fix open order must read `reproduced` (a phantom about:blank entry after the page), or
 * this harness cannot show the defect it records as absent on the product path. Null when it does; else the reason.
 * `legacy` false is the plant: the product open order, which leaves no phantom entry, so the control must fail.
 */
async function legacyOpenControl(legacy) {
    const outcome = await reproSession('reload', false, false, { legacy });
    if (outcome.notScored) {
        return outcome.notScored;
    }
    console.log(`  legacy-open control (${legacy ? 'legacy order' : 'product order'}): blank=${outcome.run.blank ? 1 : 0} ${outcome.run.fields}`);
    return outcome.run.blank ? null : `the legacy-open control did not reproduce the phantom about:blank entry (${outcome.run.fields})`;
}

/** Eight sessions, four per trigger, then the legacy-open control. Writes the verdict key; a run that cannot score is a NOT SCORED failure, no verdict. */
async function scenarioRemotenessRepro() {
    const runs = { reload: [], activate: [] };
    for (const trigger of REPRO_TRIGGERS) {
        for (let i = 0; i < REPRO_RUNS; i += 1) {
            const outcome = await reproSession(trigger, false);
            if (outcome.notScored) {
                console.log(`harness: ${outcome.notScored}`);
                return `NOT SCORED: ${outcome.notScored}`;
            }
            runs[trigger].push(outcome.run);
            // Every run's fields, blank or clean: a clean verdict must show what the observers read, not only that nothing matched.
            console.log(`  run ${trigger} ${i + 1}/${REPRO_RUNS}: blank=${outcome.run.blank ? 1 : 0} ${outcome.run.fields}`);
        }
    }
    const control = await legacyOpenControl(true);
    if (control) {
        console.log(`harness: ${control}`);
        return `NOT SCORED: ${control}`;
    }
    const verdict = reproVerdict(runs);
    await recordVerdict('remoteness-repro', verdict);
    console.log(`  verdict remoteness-repro: ${verdict}`);
    return null;
}

/**
 * crash (PAGE-11, 32-08): about:crashcontent loaded into the session's one scratch tab crashes its content process
 * (the tab is the only web tab of the session, so no other overlay shares the process). The crashed push arrives; the
 * placeholder shows the contracted copy and the Reload tab button; the strip marks the tab; the overlay is hidden.
 * Reload tab runs the reload path: the page comes back at crashed false, with its history entries kept.
 * `plant` true removes the crash copy from the placeholder, so no crash UI is shown, which must go red; `plant` 'history'
 * recreates the overlay under another row key, so the history is not restored, which must go red.
 */
async function scenarioCrash(app, origin, plant = false, variant = null) {
    const { tabId, from } = await openLoaded(app, `${origin}/find`, '/find');
    const second = variant === 'reader' ? '/article' : '/edit';
    const moved = await channelRequest(app, { kind: 'webTabNavigate', tabId, url: `${origin}${second}` });
    if (moved?.ok !== true) {
        return `the navigation to ${second} was refused (${JSON.stringify(moved)})`;
    }
    if (await waitForPush(app, loadedAt(tabId, second), { from, timeoutMs: 30000 }) < 0) {
        return 'the second page never loaded, so the history has no entry to keep';
    }
    if (variant === 'reader') {
        // crash-reader (32-REVIEW CR-01, WR-01): the tab crashes in reader view, so its URL and its kept history hold
        // about:reader. Positive control: chrome's own read of the overlay URI is the reader page before the crash.
        if (await waitForPush(app, stateOf(tabId, p => p.isArticle === true), { from, timeoutMs: 20000 }) < 0) {
            return 'no isArticle push: the article page cannot enter reader view';
        }
        const readerMark = (await pushes(app)).length;
        const entered = await channelRequest(app, { kind: 'webTabReader', tabId, enter: true });
        if (entered?.where !== 'entered' || await waitForPush(app, stateOf(tabId, p => p.isReaderMode === true && p.loading === false), { from: readerMark, timeoutMs: 20000 }) < 0) {
            return `entering reader view never pushed isReaderMode true (${JSON.stringify(entered)})`;
        }
        const uri = await inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); return o && o.currentURI ? o.currentURI.spec : '';`);
        if (!String(uri).startsWith('about:reader?')) {
            throw new Error(`${BROKEN} the overlay is not on the reader page before the crash (${JSON.stringify(String(uri).slice(0, 40))})`);
        }
        const held = await probe(app, `return get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).url;`);
        if (!String(held).endsWith('/article')) {
            return `Theia holds ${JSON.stringify(String(held).slice(0, 40))} for a tab in reader view, not the page URL a reopen needs`;
        }
    }
    const historyOf = async () => {
        const reply = await channelRequest(app, { kind: 'webTabHistory', tabId });
        return Array.isArray(reply?.entries) ? reply.entries.length : -1;
    };
    const entriesBefore = await historyOf();
    const mark = (await pushes(app)).length;
    // crash-switching (32-REVIEW WR-04): the overlay is mid process switch (DidChangeBrowserRemoteness, no settle yet) when
    // its process dies. A dead process sends no location change or network stop, so the crash itself must push.
    const switching = variant === 'switching' ? "o.dispatchEvent(new Event('DidChangeBrowserRemoteness'));" : '';
    await inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); ${switching}
        o.fixupAndLoadURIString('about:crashcontent', { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); return true;`);
    if (await waitForPush(app, stateOf(tabId, p => p.crashed === true), { from: mark, timeoutMs: 30000 }) < 0) {
        return 'no crashed push: about:crashcontent did not crash the scratch tab';
    }
    if (plant === true) {
        await probe(app, `get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).node.querySelector('.pb-web-tab-state').replaceChildren(); return true;`);
    }
    const crashUi = () => probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});
        if (!w) return null;
        const state = w.node.querySelector('.pb-web-tab-state');
        const copy = state ? state.querySelector('.pb-web-tab-crash-copy') : null;
        const button = state ? state.querySelector('button.pb-web-tab-reload') : null;
        return { copy: copy ? copy.textContent : '', button: button ? button.textContent : '', mark: document.querySelector('.pb-tab-crashed') !== null };`);
    const ui = await settleValue(crashUi, v => v !== null && v.copy === CRASHED_COPY && v.button === CRASHED_RELOAD_LABEL);
    if (!ui || ui.copy !== CRASHED_COPY || ui.button !== CRASHED_RELOAD_LABEL) {
        return `the crashed tab shows no contracted crash copy and Reload button (copy=${JSON.stringify(ui && ui.copy)}, button=${JSON.stringify(ui && ui.button)})`;
    }
    if (!ui.mark) {
        return 'the strip shows no crashed mark on the crashed tab';
    }
    if (await settleValue(() => overlayVisibility(app, tabId), v => v !== 'visible') === 'visible') {
        return 'the crashed overlay is still visible over the crash UI';
    }
    if (plant === 'reader-url') {
        // The CR-01 symptom: the widget holds the reader URL, which webTabOpen refuses, so the reopen can never succeed.
        await probe(app, `get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).url = ${JSON.stringify(`about:reader?url=${encodeURIComponent(`${origin}/article`)}`)}; return true;`);
    }
    if (variant === 'navigate') {
        return crashNavigate(app, origin, tabId, entriesBefore, historyOf);
    }
    const clickMark = (await pushes(app)).length;
    // The history plant recreates the overlay under another row key, so the kept history is never taken (the loss the row exists to catch).
    const clicked = plant === 'history'
        ? (await channelRequest(app, { kind: 'webTabClose', tabId }), (await channelRequest(app, { kind: 'webTabOpen', tabId, url: `${origin}${second}`, key: 'web:planted' })).ok === true)
        : await probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}); const b = w.node.querySelector('button.pb-web-tab-reload'); if (!b) return false; b.click(); return true;`);
    if (clicked !== true) {
        return 'the crashed tab has no Reload tab button to click';
    }
    // A crashed overlay has no remote tab, so Reload recreates it at the same URL (the Theia side closes and reopens it).
    // The page must come back loaded with crashed cleared, and the history must still hold both entries.
    if (await waitForPush(app, stateOf(tabId, p => p.crashed === false && p.loading === false && String(p.url).endsWith(second)), { from: clickMark, timeoutMs: 30000 }) < 0) {
        return 'Reload tab did not bring the page back (no loaded push with crashed false)';
    }
    const entriesAfter = await historyOf();
    if (entriesAfter < entriesBefore) {
        return `history lost across Reload tab (${entriesBefore} entries before, ${entriesAfter} after)`;
    }
    // gotoIndex to the first entry proves the recovered history is live.
    const reply = await channelRequest(app, { kind: 'webTabHistory', tabId });
    const first = Array.isArray(reply?.entries) ? reply.entries.find(entry => String(entry.url).endsWith('/find')) : undefined;
    if (!first) {
        return 'the recovered history has no /find entry to return to';
    }
    const backMark = (await pushes(app)).length;
    const back = await channelRequest(app, { kind: 'webTabGotoIndex', tabId, index: first.index });
    if (back?.ok !== true) {
        return `gotoIndex after Reload tab was refused (${JSON.stringify(back)})`;
    }
    return await waitForPush(app, loadedAt(tabId, '/find'), { from: backMark, timeoutMs: 30000 }) < 0
        ? 'gotoIndex after Reload tab did not load /find'
        : null;
}

/**
 * crash-navigate (32-REVIEW WR-08): with the tab crashed, Back and Forward are disabled, and a URL sent through the
 * widget's navigate (the pill's path) recreates the overlay there: the page loads with crashed false, and the kept
 * history is still behind it (one more entry than before the crash).
 */
async function crashNavigate(app, origin, tabId, entriesBefore, historyOf) {
    const nav = await probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}); return { back: w.canGoBack, forward: w.canGoForward };`);
    if (nav.back !== false || nav.forward !== false) {
        return `Back or Forward stays enabled on a crashed tab (${JSON.stringify(nav)})`;
    }
    const mark = (await pushes(app)).length;
    await probe(app, `void get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).navigate(${JSON.stringify(`${origin}/article`)}); return true;`);
    if (await waitForPush(app, stateOf(tabId, p => p.crashed === false && p.loading === false && String(p.url).endsWith('/article')), { from: mark, timeoutMs: 30000 }) < 0) {
        return 'a URL sent to a crashed tab did not load it (no loaded push with crashed false)';
    }
    const entriesAfter = await settleValue(historyOf, n => n > entriesBefore);
    return entriesAfter > entriesBefore ? null : `the crashed tab's history was not kept behind the new page (${entriesBefore} entries before, ${entriesAfter} after)`;
}

/**
 * remoteness-regression (32-08, the D-25a regression row): one session per trigger, five same-site tabs, the fifth
 * reloaded or activated. It passes when the fifth tab is on its page with its docShell active. The plant replaces the
 * fifth tab's page with about:blank after the trigger, which must go red. Record-only apart from its verdict: no key.
 */
async function scenarioRemotenessRegression(plant = false) {
    for (const trigger of REPRO_TRIGGERS) {
        const outcome = await reproSession(trigger, false, plant);
        if (outcome.notScored) {
            console.log(`harness: ${outcome.notScored}`);
            return `NOT SCORED: ${outcome.notScored}`;
        }
        if (outcome.run.blank) {
            return `the fifth tab was left blank by ${trigger}: ${outcome.run.fields}`;
        }
        if (outcome.run.active !== 1) {
            return `the fifth tab's docShell is inactive after ${trigger}: ${outcome.run.fields}`;
        }
        console.log(`  ${trigger}: the fifth tab is on its page with its docShell active (${outcome.run.fields})`);
    }
    return null;
}

/**
 * remoteness-activeness-probe (32-07 gap closure, record-only): task 3 (f)'s separate hypothesis, that a process switch
 * leaves the new docShell inactive while the overlay is visible. One visible overlay navigates cross-site (a second
 * host that network.dns.localDomains resolves to loopback). The positive control is didChange above 0 (a remoteness switch
 * happened); the read is docShellIsActive, renderLayers, the browsing context's own isActive and the overlay's visibility.
 * Verdict `inactive-after-switch` only when active=0 with visible=1, else `active-after-switch`. Writes the key only when named.
 */
async function scenarioActivenessProbe() {
    const pages = await serveNavPages(reproPages());
    const port = new URL(pages.origin).port;
    try {
        return await withProbeShell(async app => {
            const tabId = await openWebTab(app, pages.url('/rr1'));
            if (await waitForPush(app, sameTitled(tabId, '/rr1', 'RR 1'), { timeoutMs: 30000 }) < 0) {
                throw new Error(`${BROKEN} the first page never loaded`);
            }
            await armReproOverlay(app, tabId);
            await makeCurrent(app, tabId);
            const before = await readReproState(app, tabId);
            const mark = (await pushes(app)).length;
            await channelRequest(app, { kind: 'webTabNavigate', tabId, url: `http://pb-other.test:${port}/rr2` });
            if (await waitForPush(app, sameTitled(tabId, '/rr2', 'RR 2'), { from: mark, timeoutMs: 30000 }) < 0) {
                return `NOT SCORED: the cross-site page never loaded (the second host did not resolve)`;
            }
            await new Promise(resolve => setTimeout(resolve, 1500));
            const after = await readReproState(app, tabId);
            const bcActive = await inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); return o && o.browsingContext ? o.browsingContext.isActive === true : null;`);
            const switched = after.didChange - before.didChange;
            if (switched < 1) {
                return `NOT SCORED: no process switch happened (didChange=${switched}), so activeness after a switch was not read`;
            }
            const verdict = after.active === 0 && after.visible === 1 ? 'inactive-after-switch' : 'active-after-switch';
            const fields = `didChange=${switched} remoteType=${after.remoteType} active=${after.active} renderLayers=${after.renderLayers} bcActive=${bcActive === true ? 1 : 0} visible=${after.visible}`;
            await recordVerdict('remoteness-activeness-probe', `${verdict} ${fields}`);
            console.log(`  verdict remoteness-activeness-probe: ${verdict} ${fields}`);
            return null;
        }, { extraPrefs: { 'network.dns.localDomains': 'pb-other.test' } });
    } finally {
        await pages.close();
    }
}

/** Scenarios that open their own sessions, so main runs them without the shared runSession wrapper. */
const SELF_SESSIONED = new Set(['remoteness-repro', 'remoteness-regression', 'remoteness-activeness-probe']);

const SCENARIOS = {
    'remoteness-repro': () => scenarioRemotenessRepro(),
    'remoteness-regression': () => scenarioRemotenessRegression(false),
    'remoteness-activeness-probe': () => scenarioActivenessProbe(),
    find: (app, fx) => scenarioFind(app, fx.origin),
    zoom: (app, fx) => scenarioZoom(app, fx.origin),
    audio: (app, fx) => scenarioAudio(app, fx.origin),
    'keys-theia': (app, fx) => scenarioKeysTheia(app, fx.origin),
    favicon: (app, fx) => scenarioFavicon(app, fx.origin),
    reader: (app, fx) => scenarioReader(app, fx.origin),
    source: (app, fx) => scenarioSource(app, fx.origin),
    crash: (app, fx) => scenarioCrash(app, fx.origin),
    'crash-reader': (app, fx) => scenarioCrash(app, fx.origin, false, 'reader'),
    'crash-switching': (app, fx) => scenarioCrash(app, fx.origin, false, 'switching'),
    'crash-navigate': (app, fx) => scenarioCrash(app, fx.origin, false, 'navigate'),
    devtools: (app, fx) => scenarioDevtools(app, fx.origin),
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
    {
        plant: 'favicon-http-src',
        target: 'favicon',
        run: (app, fx) => scenarioFavicon(app, fx.origin, true),
        expect: 'no strip row carries the pushed favicon',
    },
    {
        plant: 'favicon-pill-http-src',
        target: 'favicon',
        run: (app, fx) => scenarioFavicon(app, fx.origin, 'pill'),
        expect: 'pill row for the icon tab does not carry the pushed favicon',
    },
    {
        plant: 'reader-signal-dropped',
        target: 'reader',
        run: (app, fx) => scenarioReader(app, fx.origin, true),
        expect: 'no isArticle push',
    },
    {
        plant: 'source-url-in-theia',
        target: 'source',
        run: (app, fx) => scenarioSource(app, fx.origin, true),
        expect: 'Theia holds a view-source: URL',
    },
    {
        plant: 'source-history-title',
        target: 'source',
        run: (app, fx) => scenarioSource(app, fx.origin, 'history-title'),
        expect: 'the history reply carried a view-source: string',
    },
    {
        plant: 'crash-ui-absent',
        target: 'crash',
        run: (app, fx) => scenarioCrash(app, fx.origin, true),
        expect: 'shows no contracted crash copy',
    },
    {
        plant: 'devtools-open-dropped',
        target: 'devtools',
        run: (app, fx) => scenarioDevtools(app, fx.origin, true),
        expect: 'no DevTools toolbox for the tab after F12',
    },
    {
        plant: 'crash-history-dropped',
        target: 'crash',
        run: (app, fx) => scenarioCrash(app, fx.origin, 'history'),
        expect: 'history lost across Reload tab',
    },
    {
        plant: 'crash-reader-url-held',
        target: 'crash-reader',
        run: (app, fx) => scenarioCrash(app, fx.origin, 'reader-url', 'reader'),
        expect: 'Reload tab did not bring the page back',
    },
    {
        // Self-sessioned regression row: its clean control is the two-session pass, its plant puts the fifth tab on about:blank.
        plant: 'blank-reload',
        target: 'remoteness-regression',
        control: () => scenarioRemotenessRegression(false),
        session: () => scenarioRemotenessRegression(true),
        expect: 'left blank by',
    },
    {
        // Record-only scenario with its own sessions: the clean control is one green run (observers proven), no verdict.
        plant: 'repro-observer-blind',
        target: 'remoteness-repro',
        control: async () => (await reproSession('reload', false)).notScored ?? null,
        session: async () => (await reproSession('reload', true)).notScored ?? null,
        expect: 'no initial GET for the fifth tab',
    },
    {
        // The isolation log written without `sync` is lost buffered: the capture control must refuse to score it.
        plant: 'repro-log-unsynced',
        target: 'remoteness-repro',
        control: async () => (await reproSession('reload', false)).notScored ?? null,
        session: async () => (await reproSession('reload', false, false, { unsynced: true })).notScored ?? null,
        expect: 'the capture is not working',
    },
    {
        // The product open order leaves no phantom entry, so run as the control it must fail.
        plant: 'legacy-control-clean',
        target: 'remoteness-repro',
        control: async () => legacyOpenControl(true),
        session: async () => legacyOpenControl(false),
        expect: 'did not reproduce the phantom',
    },
];

async function selfTest() {
    const reason = preflight();
    if (reason) {
        console.error(`${NAME} --self-test: ${reason}`);
        return 1;
    }
    let failed = 0;
    // `--only a,b` runs the plants of those target scenarios alone (a diagnostic subset; the full self-test runs every plant).
    const only = process.argv.indexOf('--only');
    const selected = only === -1 ? PLANTS : PLANTS.filter(planted => process.argv[only + 1].split(',').includes(planted.target));
    // One clean control per target scenario: a planted fault is only meaningful against its own green run.
    for (const target of new Set(selected.map(planted => planted.target))) {
        const own = selected.find(planted => planted.target === target && planted.control);
        const control = own ? await own.control() : await runSession(`${target}-control`, (app, fx) => SCENARIOS[target](app, fx));
        if (control !== null) {
            console.error(`${NAME} --self-test: FAIL -- the clean control for ${target} is red: ${control}`);
            return 1;
        }
        console.log(`  ok  clean control for ${target} -> green`);
    }
    for (const planted of selected) {
        const got = planted.session ? await planted.session() : await runSession(planted.plant, planted.run);
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
    console.log(`${NAME} --self-test: PASS -- clean control green, ${selected.length} planted fault(s) went red`);
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
    // The default run excludes the self-sessioned record-only repro: only a named run may write its verdict key.
    const selected = flag === -1 ? Object.keys(SCENARIOS).filter(name => !SELF_SESSIONED.has(name)) : process.argv[flag + 1].split(',');
    const unknown = selected.filter(name => !(name in SCENARIOS));
    if (unknown.length) {
        console.error(`${NAME}: unknown scenario(s): ${unknown.join(', ')}`);
        return 1;
    }
    let failed = 0;
    for (const name of selected) {
        try {
            const reason = SELF_SESSIONED.has(name)
                ? await SCENARIOS[name]()
                : await runSession(name, (app, fx, downloadDir) => SCENARIOS[name](app, fx, downloadDir));
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
