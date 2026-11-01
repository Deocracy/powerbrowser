#!/usr/bin/env node
/**
 * Phase 35 (PROMPT-08 first; 35-03 to 35-07 add rows): the live check for the
 * shell furniture, driven in the built shell over WebDriver BiDi.
 *
 * One session runs the selected scenarios in order and prints one line per
 * scenario: `<scenario>: PASS` or `<scenario>: FAIL -- <reason>`. A thrown
 * error is `harness: <message>` (the check could not drive the product).
 * withProbeShell purges the startup cache and prints the `purgecaches:` line
 * every run requires: edits to powerbrowser/shell/* do not run without it.
 *
 * Scenarios:
 *   tooltip-status      In a web tab, pointer over a link pushes overLink for
 *                       that tab with a url ending /target and the bar shows
 *                       it as .pb-page-status, clear of the page rect in
 *                       Coding, Browsing and Organising; pointer over plain
 *                       text pushes the clear and the line goes; pointer over
 *                       a title= span opens #remoteBrowserTooltip with its text.
 *   theia-hover-silent  An element with a title and a link in the IDE, hovered
 *                       with trusted input, push no overLink and open no page
 *                       tooltip over 1500 ms. Scored only when tooltip-status
 *                       passed in the same session (CONTROL_OF).
 *   pip-close           A Picture-in-Picture window opened from a web-tab video
 *                       closes, and the overlay still renders and plays
 *                       (gBrowser.shouldActivateDocShell, 35-01).
 *   context-menu        (35-03, PROMPT-04) Right-clicking a link, a javascript:
 *                       link, an image, a video, a selection, a frame and a blank
 *                       area pushes pageContextMenu for that tab whose item ids are
 *                       the boundary's PAGE_MENU_ROWS for that target (ids and
 *                       order proven upstream's by verify-shell-furniture.mjs rule 5),
 *                       and shows a .lm-Menu whose first link row reads upstream's
 *                       en-US Open Link in New Tab label. Picks: Copy Link and Copy
 *                       Image Link fill the clipboard; Open Link in New Tab opens a
 *                       tab after the opener, the opener still current, whose
 *                       /target GET carries the opener's URL as Referer; the
 *                       javascript: link shows the disabled refusal row, opens no
 *                       tab and serves nothing; Open Image in New Tab loads the
 *                       image; Pause then Play flip video.paused; Reload Frame
 *                       fetches the frame again; the search row opens /search?q=
 *                       with the selection on a served engine. Prints
 *                       `context-menu timing: p50 <ms> p95 <ms> n=<n>` and, per
 *                       target, the context flags the shim captured (probe 35-1).
 *   menu-not-in-ide     A right-click on the IDE's main-area tab opens Theia's own
 *                       .lm-Menu and pushes no pageContextMenu within 1500 ms.
 *                       Scored only when context-menu passed (CONTROL_OF).
 *   background-menu     With a second web tab current, a right-click on the hidden
 *                       first tab pushes nothing within 1500 ms; made current, the
 *                       same right-click pushes a menu. Scored only when
 *                       context-menu passed (CONTROL_OF).
 *   menu-page-tools     (35-04) On a blank area: Bookmark Page opens Phase 33's star
 *                       editor (.pb-bookmark-editor) and the page is in Places; Save
 *                       Page As opens Theia's "Save page as" dialog (cancelled: no
 *                       error); View Page Source loads view-source:<page> in the tab
 *                       (Phase 32's same-tab route). On an element with an id:
 *                       Inspect opens the tab's toolbox and the inspector selects that
 *                       element within 10 s. In the frame: This Frame > View Frame
 *                       Source loads view-source:<frame document>.
 *   menu-edit           (35-04) In a text field with a selected word: Undo, Cut, Copy,
 *                       Paste, Delete and Select All show with textActions.ftl labels;
 *                       Copy fills the clipboard, Paste into a second field sets it,
 *                       Undo removes the paste; on an image, Copy Image leaves an
 *                       image/png flavour on the clipboard.
 *   menu-spelling       (35-04) A spellcheck textarea holding "teh": the menu offers a
 *                       "the" suggestion row and picking it fixes the word; on "wrod",
 *                       Add to Dictionary drops it from the next menu's suggestions and
 *                       Undo Add brings them back.
 *   menu-save           (35-04) Save Link As on a link to a served file: Theia's save
 *                       dialog takes a path in a fresh temp directory; the file lands
 *                       with the served bytes, its GET carried the page's origin as
 *                       Referer, and a downloadsChanged row names it (Phase 32's panel).
 *   extension-entry     (35-05, D-16) A test extension written to a fresh temp
 *                       directory at run time (no fixture in the tree) and installed
 *                       with BiDi webExtension.install creates "Furniture test entry"
 *                       for the page and link contexts. A right-click on a served page
 *                       pushes it as an extension-entry row after the stock rows;
 *                       picking it makes the extension's menus.onClicked request
 *                       /ext-clicked with that page's URL and a non-negative tab id
 *                       within 5 s; the next menu shows exactly one such row (the
 *                       last menu's items were cleaned up). Uninstalled at the end.
 *   freeze-frame        (35-05, D-08, G4b) 20 right-click and Escape cycles on a
 *                       1280x720 page, timed by this script's own recorder (Date.now
 *                       at each pageStill and pageContextMenu push, and when a .lm-Menu
 *                       becomes visible). FAIL above 200 ms p95 right-click to visible
 *                       menu. Each still that arrived must be painted as
 *                       img.pb-web-tab-still in that tab's widget while the menu is open
 *                       and the overlay hidden, and gone once the menu closes. Prints
 *                       `freeze-frame timing: menu p50 <ms> p95 <ms>, still <k>/20 within 50 ms`
 *                       (chrome pushes only stills that made the 50 ms deadline).
 *
 * A self-test plant is a runtime mutation in its own session (a chrome-scope
 * or Theia-frame evaluate), never a file edit, and notes `PLANT <name>
 * applied` only after reading the mutation back.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    BROKEN,
    WEB_TAB_STATE_EVENT,
    appNameExpr,
    inChrome,
    loadedAt,
    makeCurrent,
    openWebTab,
    overlayVisibility,
    pressKey,
    pushes,
    serveNavPages,
    waitForPush,
    withProbeShell,
} from './lib/pb-live-probe.mjs';
import { REPO_ROOT, pollFor, probe, sourceConst } from './lib/pb-relaunch.mjs';

const MODES_ACTIVATE_COMMAND_ID = sourceConst('theia/extensions/modes/src/browser/modes-commands.ts', 'MODES_ACTIVATE_COMMAND_ID');

const NAME = 'verify-page-furniture-live';
const TOOLTIP_TEXT = 'Furniture tooltip';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** 35-03: the Referer header of each /target and /search GET, recorded by this script's own pages. */
const referers = [];
const recordReferer = path => request => {
    referers.push({ path, referer: request.headers.referer ?? null });
    return '';
};
const MENU_WORDS = 'menu words';
const INSPECT_ID = 'inspect-me';

const PAGES = {
    '/furniture': {
        title: 'Furniture',
        body: '<style>body { font: 24px sans-serif; margin: 40px; } p { margin: 48px 0; }</style>'
            + '<p><a id="link" href="/target">Target link</a></p>'
            + '<p id="plain">Plain text</p>'
            + `<p><span id="tip" title="${TOOLTIP_TEXT}">Has a tooltip</span></p>`,
    },
    '/target': { title: 'Target', body: '<p>target</p>', extra: recordReferer('/target') },
    '/menu': {
        title: 'Menu',
        body: '<style>body { font: 20px sans-serif; margin: 24px; } p, div { margin: 18px 0; }</style>'
            + '<p><a id="link" href="/target">Target link</a></p>'
            + '<p><a id="jslink" href="javascript:void(0)">Script link</a></p>'
            + `<p id="words">${MENU_WORDS}</p>`
            + '<canvas id="c" width="160" height="90" hidden></canvas><video id="v" width="160" height="90" muted autoplay></video>'
            + '<iframe id="frame" src="/frame" width="200" height="80"></iframe>'
            + '<div id="blank" style="height: 80px"></div>'
            + '<script>const c = document.getElementById("c"); const g = c.getContext("2d"); let n = 0;'
            + 'setInterval(() => { g.fillStyle = "hsl(" + (n++ % 360) + ",80%,50%)"; g.fillRect(0, 0, 160, 90); }, 33);'
            + 'const v = document.getElementById("v"); v.srcObject = c.captureStream(30); v.play();</script>',
        // The image comes from this script's asset server (serveNavPages serves HTML only), at a port known per session.
        extra: () => (assets ? `<p><img id="img" src="${assets.url('/pixel.png')}" width="64" height="64" alt="pixel"></p>` : ''),
    },
    '/frame': { title: 'Frame', body: '<p style="height: 60px">frame</p>' },
    '/search': { title: 'Search', body: '<p>search</p>', extra: recordReferer('/search') },
    '/ide-link': { title: 'IDE link', body: '<p>ide</p>' },
    // 35-04: the page-tool, edit, spelling and save targets.
    '/tools': {
        title: 'Tools',
        body: '<style>body { font: 20px sans-serif; margin: 24px; } p, div { margin: 18px 0; }</style>'
            + `<p id="${INSPECT_ID}">Inspect me</p>`
            + '<p><input id="field" value="alpha beta"> <input id="field2" value=""></p>'
            + '<p><textarea id="spell" spellcheck="true" rows="2" cols="24">teh</textarea> <textarea id="spell2" spellcheck="true" rows="2" cols="24">wrod</textarea></p>'
            + '<iframe id="frame" src="/frame" width="200" height="80"></iframe>'
            + '<div id="blank" style="height: 80px"></div>',
        extra: () => (assets ? `<p><a id="filelink" href="${assets.url('/file.bin')}">File link</a> <img id="img" src="${assets.url('/pixel.png')}" width="64" height="64" alt="pixel"></p>` : ''),
    },
    // 35-05: the freeze-frame page, 1280x720 of colour so a still is never blank.
    '/still': {
        title: 'Still',
        body: '<style>body { margin: 0; } #art { width: 1280px; height: 720px; background: linear-gradient(135deg, #c33, #36c); }</style><div id="art"></div>',
    },
    '/pip': {
        title: 'Picture in Picture',
        body: '<canvas id="c" width="320" height="180"></canvas><video id="v" width="320" height="180" muted autoplay></video>'
            + '<script>const c = document.getElementById("c"); const g = c.getContext("2d"); let n = 0;'
            + 'setInterval(() => { g.fillStyle = "hsl(" + (n++ % 360) + ",80%,50%)"; g.fillRect(0, 0, 320, 180); }, 33);'
            + 'const v = document.getElementById("v"); v.srcObject = c.captureStream(30); v.play();</script>',
    },
};

async function settle(read, ok, timeoutMs = 5000) {
    let seen;
    try {
        await pollFor(async () => ok(seen = await read()), timeoutMs, 'a settled read');
    } catch {
        // judged by the caller on `seen`
    }
    return seen;
}

/** The BiDi context whose url is `url` (an overlay's page or the Theia frame). */
async function contextOf(app, url) {
    const found = await pollFor(async () => (await app.contexts()).find(c => c.url === url) ?? null, 10000, `a BiDi context at ${url}`).catch(() => null);
    if (!found) {
        throw new Error(`${BROKEN} no BiDi context at ${url}`);
    }
    return found.context;
}

/** Trusted pointer move to (x, y) in `context`'s viewport. */
async function pointerTo(app, context, x, y) {
    await app.send('input.performActions', { context, actions: [{ type: 'pointer', id: 'pb-furniture-mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', x: Math.round(x), y: Math.round(y), duration: 0 }] }] });
    await app.send('input.releaseActions', { context });
}

/** Moves the pointer to the centre of `selector` in `context`. */
async function pointerOnto(app, context, selector) {
    const box = JSON.parse(await app.evaluateIn(context, `JSON.stringify((() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })())`));
    if (!box) {
        throw new Error(`${BROKEN} no ${selector} in the page`);
    }
    await pointerTo(app, context, box.x, box.y);
}

async function toMode(app, mode) {
    return probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(MODES_ACTIVATE_COMMAND_ID)}, ${JSON.stringify(mode)});
        return await until(() => document.body.getAttribute('data-pb-mode') === ${JSON.stringify(mode)}, 10000);`);
}

/** The status line's text and its box in shell-document coordinates, with the overlay's box; null fields when absent. */
async function statusGeometry(app, tabId) {
    const status = JSON.parse(await app.evaluate(`JSON.stringify((() => {
        const e = document.querySelector('.pb-page-status');
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { text: e.textContent, label: e.getAttribute('aria-label'), left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    })())`));
    const chrome = await inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)});
        const f = document.getElementById('powerbrowser-content').getBoundingClientRect();
        const r = o ? o.getBoundingClientRect() : null;
        return JSON.stringify({ frame: { left: f.left, top: f.top }, page: r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });`);
    const { frame, page } = JSON.parse(chrome);
    const box = status && { left: status.left + frame.left, top: status.top + frame.top, right: status.right + frame.left, bottom: status.bottom + frame.top };
    return { status, box, page };
}

const intersects = (a, b) => !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right);

const tooltipState = app => inChrome(app, `const t = document.getElementById('remoteBrowserTooltip'); return t ? JSON.stringify({ state: t.state, label: t.label }) : 'null';`).then(JSON.parse);

const overLinkFor = (tabId, test) => p => p && p.kind === 'overLink' && p.tabId === tabId && test(String(p.url));

async function applyTooltipStatusPlants(app, plant, note) {
    if (plant === 'tooltip-element-removed') {
        if (await inChrome(app, `document.getElementById('remoteBrowserTooltip')?.remove(); return document.getElementById('remoteBrowserTooltip') === null;`) === true) {
            note('PLANT tooltip-element-removed applied');
        }
    }
    if (plant === 'overlink-unregistered') {
        const read = await inChrome(app, `const appWindow = window.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow);
            appWindow.XULBrowserWindow = null;
            return appWindow.XULBrowserWindow === null;`);
        if (read === true) {
            note('PLANT overlink-unregistered applied');
        }
    }
    if (plant === 'status-over-page') {
        // Moves the line to the window's middle, where the page sits in every mode; applied when the computed position changed.
        const moved = await app.evaluate(`(() => {
            const style = document.createElement('style');
            style.id = 'pb-plant-status-over-page';
            style.textContent = '.pb-page-status { position: fixed !important; left: 40vw !important; top: 50vh !important; }';
            document.head.appendChild(style);
            const probe = document.createElement('span');
            probe.className = 'pb-page-status';
            document.body.appendChild(probe);
            const fixed = getComputedStyle(probe).position === 'fixed';
            probe.remove();
            return fixed;
        })()`);
        if (moved === true) {
            note('PLANT status-over-page applied');
        }
    }
}

async function tooltipStatus({ app, pages, plant, fail, note }) {
    await applyTooltipStatusPlants(app, plant, note);
    if (await inChrome(app, 'window.focus(); return document.hasFocus();') !== true) {
        throw new Error('shell window not focused');
    }
    const url = pages.url('/furniture');
    const tabId = await openWebTab(app, url);
    if (await waitForPush(app, loadedAt(tabId, '/furniture')) < 0) {
        return fail('no loaded state push arrived for /furniture');
    }
    try {
        for (const mode of ['coding', 'browsing', 'organising']) {
            if (await toMode(app, mode) !== true) {
                return fail(`${BROKEN} mode ${mode} could not be reached`);
            }
            // Organising opens a web tab behind its own widget; make it current in every mode.
            if (await makeCurrent(app, tabId) !== true) {
                return fail(`${BROKEN} ${mode}: the web tab could not be made current`);
            }
            if (await settle(() => overlayVisibility(app, tabId), v => v === 'visible') !== 'visible') {
                return fail(`${BROKEN} ${mode}: the page is not shown, so the page-rect check would prove nothing`);
            }
            const context = await contextOf(app, url);
            let mark = (await pushes(app)).length;
            await pointerOnto(app, context, '#link');
            if (await waitForPush(app, overLinkFor(tabId, u => u.endsWith('/target')), { from: mark, timeoutMs: 5000 }) < 0) {
                return fail(`${mode}: no overLink push for ${tabId} ending /target after the pointer moved onto the link`);
            }
            const shown = await settle(() => statusGeometry(app, tabId), g => !!g.status && g.status.text.endsWith('/target'));
            if (!shown?.status || !shown.status.text.endsWith('/target')) {
                return fail(`${mode}: the bar shows no .pb-page-status ending /target; saw ${JSON.stringify(shown?.status ?? null)}`);
            }
            if (!shown.page) {
                return fail(`${BROKEN} ${mode}: chrome has no overlay for ${tabId}`);
            }
            if (intersects(shown.box, shown.page)) {
                return fail(`${mode}: status line intersects the page: status ${JSON.stringify(shown.box)}, page ${JSON.stringify(shown.page)}`);
            }
            mark = (await pushes(app)).length;
            await pointerOnto(app, context, '#plain');
            if (await waitForPush(app, overLinkFor(tabId, u => u === ''), { from: mark, timeoutMs: 5000 }) < 0) {
                return fail(`${mode}: no clearing overLink push after the pointer left the link`);
            }
            const cleared = await settle(() => statusGeometry(app, tabId), g => !g.status || !g.status.text);
            if (cleared?.status?.text) {
                return fail(`${mode}: the status line still reads ${JSON.stringify(cleared.status.text)} after the clear`);
            }
            note(`${mode}: status line shown and cleared, clear of the page rect`);
        }
        if (await toMode(app, 'coding') !== true) {
            return fail(`${BROKEN} Coding could not be reached for the tooltip step`);
        }
        await makeCurrent(app, tabId);
        const context = await contextOf(app, url);
        await pointerOnto(app, context, '#tip');
        const tip = await settle(() => tooltipState(app), t => !!t && t.state === 'open' && t.label === TOOLTIP_TEXT, 3000);
        if (!tip || tip.state !== 'open' || tip.label !== TOOLTIP_TEXT) {
            return fail(`page tooltip did not open with ${JSON.stringify(TOOLTIP_TEXT)} within 3 s; saw ${JSON.stringify(tip)}`);
        }
        await pointerOnto(app, context, '#plain');
    } finally {
        await toMode(app, 'coding');
    }
}

async function theiaHoverSilent({ app, pages, plant, results, fail, note }) {
    const control = results.find(r => r.name === 'tooltip-status');
    if (!control || control.failures.length || control.notScored) {
        return 'not-scored';
    }
    if (plant === 'theia-tooltip-leak') {
        const read = await inChrome(app, `const leak = function (x, y, text, direction) {
                const t = document.getElementById('remoteBrowserTooltip');
                t.label = text;
                t.style.direction = direction;
                t.openPopupAtScreen(x / window.devicePixelRatio, y / window.devicePixelRatio, false, null);
            };
            leak.__pbPlanted = true;
            window.XULBrowserWindow.showTooltip = leak;
            return window.XULBrowserWindow.showTooltip.__pbPlanted === true;`);
        if (read === true) {
            note('PLANT theia-tooltip-leak applied');
        }
    }
    const added = await app.evaluate(`(() => {
        for (const id of ['pb-ide-hover', 'pb-ide-link']) document.getElementById(id)?.remove();
        const tip = document.createElement('div');
        tip.id = 'pb-ide-hover';
        tip.title = 'IDE tooltip';
        tip.textContent = 'IDE hover';
        tip.style.cssText = 'position: fixed; left: 8px; bottom: 8px; padding: 8px; z-index: 2147483647; background: #333; color: #fff;';
        const link = document.createElement('a');
        link.id = 'pb-ide-link';
        link.href = ${JSON.stringify(pages.url('/ide-link'))};
        link.textContent = 'IDE link';
        link.style.cssText = 'position: fixed; left: 160px; bottom: 8px; padding: 8px; z-index: 2147483647; background: #333; color: #fff;';
        document.body.append(tip, link);
        return true;
    })()`);
    if (added !== true) {
        return fail(`${BROKEN} the IDE hover targets could not be added`);
    }
    try {
        const theia = await contextOf(app, await app.evaluate('location.href'));
        const covered = await inChrome(app, `const f = document.getElementById('powerbrowser-content').getBoundingClientRect();
            const bottom = f.bottom - 60;
            return [...document.querySelectorAll('browser')].some(b => W.tabIdOfBrowser(b) !== null && b.style.visibility === 'visible' && b.getBoundingClientRect().bottom > bottom && b.getBoundingClientRect().left < f.left + 320);`);
        if (covered !== false) {
            return fail(`${BROKEN} a shown overlay covers the IDE hover targets, so the absence would prove nothing`);
        }
        for (const selector of ['#pb-ide-hover', '#pb-ide-link']) {
            const mark = (await pushes(app)).length;
            await pointerOnto(app, theia, selector);
            const deadline = Date.now() + 1500;
            while (Date.now() < deadline) {
                const t = await tooltipState(app);
                if (t && t.state === 'open') {
                    return fail(`the IDE hover opened the page tooltip (${selector}, label ${JSON.stringify(t.label)})`);
                }
                await sleep(150);
            }
            const leaked = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'overLink');
            if (leaked.length) {
                return fail(`the IDE hover pushed overLink (${selector}): ${leaked.length} push(es)`);
            }
        }
    } finally {
        await app.evaluate(`(() => { for (const id of ['pb-ide-hover', 'pb-ide-link']) document.getElementById(id)?.remove(); return true; })()`);
    }
}

const pipWindowCount = app => inChrome(app, `let n = 0; for (const w of Services.wm.getEnumerator('Toolkit:PictureInPicture')) { if (!w.closed) n++; } return n;`);

async function pipClose({ app, pages, plant, fail, note }) {
    if (plant === 'pip-shouldactivate-missing') {
        if (await inChrome(app, `delete window.gBrowser.shouldActivateDocShell; return typeof window.gBrowser.shouldActivateDocShell === 'undefined';`) === true) {
            note('PLANT pip-shouldactivate-missing applied');
        }
    }
    const url = pages.url('/pip');
    const tabId = await openWebTab(app, url);
    if (await waitForPush(app, loadedAt(tabId, '/pip')) < 0) {
        return fail('no loaded state push arrived for /pip');
    }
    await makeCurrent(app, tabId);
    const context = await contextOf(app, url);
    const playing = () => app.evaluateIn(context, `document.getElementById('v').currentTime`);
    if (!(await settle(playing, t => t > 0) > 0)) {
        return fail(`${BROKEN} the page's video never started playing`);
    }
    const sent = await inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); if (!o) return false;
        o.browsingContext.currentWindowGlobal.getActor('PictureInPictureLauncher').sendAsyncMessage('PictureInPicture:KeyToggle');
        return true;`);
    if (sent !== true) {
        return fail(`${BROKEN} chrome has no overlay for ${tabId} to toggle Picture-in-Picture on`);
    }
    if (await settle(() => pipWindowCount(app), n => n === 1, 10000) !== 1) {
        return fail('no Picture-in-Picture window opened from the web-tab video');
    }
    await inChrome(app, `for (const w of Services.wm.getEnumerator('Toolkit:PictureInPicture')) { w.document.getElementById('close').click(); } return true;`);
    if (await settle(() => pipWindowCount(app), n => n === 0, 5000) !== 0) {
        return fail('the Picture-in-Picture window is still open after its close button');
    }
    if (await settle(() => overlayVisibility(app, tabId), v => v === 'visible') !== 'visible') {
        return fail('the overlay is not shown after the Picture-in-Picture window closed');
    }
    const before = await playing();
    await sleep(600);
    const after = await playing();
    if (!(after > before)) {
        return fail(`the overlay's video stopped after the Picture-in-Picture window closed (currentTime ${before} then ${after})`);
    }
    note('Picture-in-Picture opened and closed; the overlay still plays');
}

// ---------------------------------------------------------------------------
// 35-03 (PROMPT-04): the page context menu.
// ---------------------------------------------------------------------------

/** A one-pixel PNG; serveNavPages serves HTML only, so the image has its own loopback server. */
const PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let assets = null;
/** 35-04: the bytes Save Link As must land (the asset server serves them at /file.bin). */
const FILE_BYTES = Buffer.from('page menu save check\n');

async function serveAssets() {
    const requests = [];
    const server = createServer((request, response) => {
        const parsed = new URL(request.url, 'http://127.0.0.1');
        requests.push({ path: parsed.pathname, search: parsed.search, at: Date.now(), referer: request.headers.referer ?? null });
        if (parsed.pathname === '/ext-clicked') {
            response.writeHead(204);
            response.end();
            return;
        }
        if (request.url === '/file.bin') {
            response.writeHead(200, { 'content-type': 'application/octet-stream' });
            response.end(FILE_BYTES);
            return;
        }
        if (request.url === '/pixel.png') {
            response.writeHead(200, { 'content-type': 'image/png' });
            response.end(PIXEL_PNG);
            return;
        }
        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end('not found');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    return { origin, url: path => `${origin}${path}`, requests, close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); }) };
}

const readTree = rel => readFileSync(join(REPO_ROOT, rel), 'utf8');

/** Upstream's en-US label for a browserContext.ftl (or, for text-action-*, textActions.ftl) message: its .label, else its .aria-label. */
function ftlLabel(id) {
    const text = readTree(id.startsWith('text-action-') ? 'upstream/toolkit/locales/en-US/toolkit/global/textActions.ftl' : 'upstream/browser/locales/en-US/browser/browserContext.ftl');
    const block = new RegExp(`^${id} =\\n((?:[ \\t]+\\..*\\n)+)`, 'm').exec(text);
    const attr = name => block && new RegExp(`^\\s+\\.${name} = (.*)$`, 'm').exec(block[1])?.[1];
    const label = attr('label') ?? attr('aria-label');
    if (!label) {
        throw new Error(`${BROKEN} no label for ${id} in upstream's ftl`);
    }
    return label;
}

/** The search row's label: upstream's browser.properties contextMenuSearch with the engine and the selection. */
function searchLabel(engine, terms) {
    const template = /^contextMenuSearch=(.*)$/m.exec(readTree('upstream/browser/locales/en-US/chrome/browser/browser.properties'))?.[1];
    if (!template) {
        throw new Error(`${BROKEN} no contextMenuSearch in upstream browser.properties`);
    }
    return template.replace('%1$S', engine).replace('%2$S', terms);
}

/** The refusal row's text from CHROME_BAR_COPY.pageMenuRefusedLink, with appSubject()'s subject (the name, else noAppName). */
function refusalLabel(appName) {
    const copy = readTree('theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts');
    const template = /pageMenuRefusedLink: \(subject: string\) => `\$\{subject\}([^`]*)`/.exec(copy)?.[1];
    const noAppName = /noAppName: '([^']+)'/.exec(copy)?.[1];
    if (!template || !noAppName) {
        throw new Error(`${BROKEN} no pageMenuRefusedLink or noAppName in chrome-bar-copy.ts`);
    }
    return `${appName || noAppName}${template}`;
}

/**
 * The page menu rows the boundary declares, in order: `{ id, when, child }`. Their ids, strings and
 * order are upstream's (verify-shell-furniture.mjs rule 5), so the expectation below is derived, not typed.
 */
function pageMenuRows() {
    const text = readTree('powerbrowser/shell/PowerBrowserAPI.sys.mjs');
    const at = text.indexOf('const PAGE_MENU_ROWS = Object.freeze([');
    if (at < 0) {
        throw new Error(`${BROKEN} no PAGE_MENU_ROWS in the boundary file`);
    }
    return text.slice(at, text.indexOf('\n]);', at)).split('\n').filter(line => /^\s*\{ id: "/.test(line))
        .map(line => ({ id: /id: "([^"]+)"/.exec(line)[1], when: /when: "([^"]+)"/.exec(line)[1], child: /^ {4}\{/.test(line) }));
}

/** The row ids a target whose context satisfies the `when` names should show, children under a shown parent. */
function expectedIds(rows, names) {
    const ids = [];
    let parentShown = false;
    for (const row of rows) {
        if (!row.child) {
            parentShown = names.includes(row.when);
            if (parentShown) {
                ids.push(row.id);
            }
        } else if (parentShown && (row.when === 'always' || names.includes(row.when))) {
            ids.push(row.id);
        }
    }
    return ids;
}

const flatIds = items => (Array.isArray(items) ? items.flatMap(item => [item.id, ...flatIds(item.children)]) : []);
const isMenuPush = tabId => p => p && p.kind === 'pageContextMenu' && (tabId === undefined || p.tabId === tabId);

/** The open root .lm-Menu's rows in the Theia frame, or null when no menu is open. */
const menuRows = (app, level = 0) => app.evaluate(`JSON.stringify((() => {
    const menu = document.querySelectorAll('.lm-Menu')[${level}];
    if (!menu) return null;
    return [...menu.querySelectorAll('.lm-Menu-item')].map(item => {
        const r = item.getBoundingClientRect();
        return { label: item.querySelector('.lm-Menu-itemLabel')?.textContent ?? '', type: item.getAttribute('data-type'), disabled: item.classList.contains('lm-mod-disabled'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
})())`).then(JSON.parse);

/** A trusted mouse click with `button` at (x, y) in `context`. */
async function clickAt(app, context, x, y, button = 0) {
    await app.send('input.performActions', { context, actions: [{ type: 'pointer', id: 'pb-furniture-mouse', parameters: { pointerType: 'mouse' }, actions: [
        { type: 'pointerMove', x: Math.round(x), y: Math.round(y), duration: 0 },
        { type: 'pointerDown', button },
        { type: 'pointerUp', button },
    ] }] });
    await app.send('input.releaseActions', { context });
}

async function centreOf(app, context, selector) {
    const box = JSON.parse(await app.evaluateIn(context, `JSON.stringify((() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 20), y: r.top + r.height / 2 }; })())`));
    if (!box) {
        throw new Error(`${BROKEN} no ${selector} in the page`);
    }
    return box;
}

const ESCAPE = { key: 'Escape', code: 'Escape', keyCode: 27 };

/** Closes whatever .lm-Menu is open and waits until none is. */
async function closeMenu(app) {
    if (await menuRows(app)) {
        await pressKey(app, ESCAPE);
        await settle(() => menuRows(app), rows => rows === null, 3000);
    }
}

/** Clicks the row labelled `label` in the open menu at `level`; false when there is none. */
async function pickRow(app, theia, label, level = 0) {
    const row = (await menuRows(app, level) ?? []).find(r => r.label === label);
    if (!row) {
        return false;
    }
    await clickAt(app, theia, row.x, row.y);
    return true;
}

const clipboardText = app => inChrome(app, `try {
    const trans = Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);
    trans.init(null);
    trans.addDataFlavor('text/plain');
    Services.clipboard.getData(trans, Services.clipboard.kGlobalClipboard);
    const data = {};
    try { trans.getTransferData('text/plain', data); } catch { return ''; }
    return String(data.value.QueryInterface(Ci.nsISupportsString).data);
} catch (e) {
    return 'error: ' + e;
}`);

const mainTabIds = app => probe(app, `return get('ApplicationShell').getWidgets('main').map(w => w.tabId ?? null);`);
const currentTabId = app => probe(app, `return get('ApplicationShell').currentWidget?.tabId ?? null;`);

const MENU_ENGINE = 'Furniture Engine';

/** Chrome scope: a served user engine as the default, so the search row never leaves loopback. */
async function installMenuEngine(app, pages) {
    const reply = await inChrome(app, `return (async () => {
        try {
            const { SearchService } = ChromeUtils.importESModule('moz-src:///toolkit/components/search/SearchService.sys.mjs');
            await SearchService.init();
            const engine = SearchService.getEngineByName(${JSON.stringify(MENU_ENGINE)})
                ?? await SearchService.addUserEngine({ name: ${JSON.stringify(MENU_ENGINE)}, url: ${JSON.stringify(`${pages.origin}/search?q={searchTerms}`)} });
            await SearchService.setDefault(engine, SearchService.CHANGE_REASON.USER);
            return (await SearchService.getDefault()).name;
        } catch (e) {
            return 'error: ' + e;
        }
    })();`);
    if (reply !== MENU_ENGINE) {
        throw new Error(`${BROKEN} the served search engine could not be installed (${String(reply)})`);
    }
}

/** Probe 35-1: records the true flags and the protocol of every context the shim captures. */
const installContextRecorder = app => inChrome(app, `const shim = window.nsContextMenu;
    const desc = Object.getOwnPropertyDescriptor(shim, 'contentData');
    if (!desc || !desc.set) return false;
    window.__pbMenuContexts = [];
    Object.defineProperty(shim, 'contentData', { configurable: true, get: desc.get, set(data) {
        if (data && data.context) {
            window.__pbMenuContexts.push(Object.keys(data.context).filter(k => data.context[k] === true).sort().join(',') + (data.context.linkProtocol ? ' linkProtocol=' + data.context.linkProtocol : ''));
        }
        desc.set.call(this, data);
    } });
    return true;`);

async function applyMenuPlants(app, plant, note) {
    if (plant === 'stub-removed') {
        if (await inChrome(app, `document.getElementById('contentAreaContextMenu')?.remove(); return document.getElementById('contentAreaContextMenu') === null;`) === true) {
            note('PLANT stub-removed applied');
        }
    }
    if (plant === 'background-check-off') {
        // Keeps every capture: the overlay reads as visible for the duration of the real setter's check.
        const read = await inChrome(app, `const shim = window.nsContextMenu;
            const desc = Object.getOwnPropertyDescriptor(shim, 'contentData');
            const set = function (data) {
                const b = data && data.browser;
                const was = b ? b.style.visibility : '';
                if (b) b.style.visibility = 'visible';
                try { desc.set.call(this, data); } finally { if (b) b.style.visibility = was; }
            };
            set.__pbPlanted = true;
            Object.defineProperty(shim, 'contentData', { configurable: true, get: desc.get, set });
            return Object.getOwnPropertyDescriptor(shim, 'contentData').set.__pbPlanted === true;`);
        if (read === true) {
            note('PLANT background-check-off applied');
        }
    }
    if (plant === 'ide-menu-leak') {
        // The IDE frame reaches the actor again, and a shim that keeps any browser turns its capture into a page menu push.
        const read = await inChrome(app, `const frame = document.getElementById('powerbrowser-content');
            frame.removeAttribute('disablecontextmenu');
            const shim = window.nsContextMenu;
            const desc = Object.getOwnPropertyDescriptor(shim, 'contentData');
            const set = function (data) {
                if (data && data.browser === frame) {
                    frame.browsingContext.currentWindowGlobal.getActor('PowerBrowserGroup').sendAsyncMessage('PowerBrowserWebTabState', { kind: 'pageContextMenu', tabId: 'planted', menuId: -1, x: 0, y: 0, items: [] });
                    return;
                }
                desc.set.call(this, data);
            };
            set.__pbPlanted = true;
            Object.defineProperty(shim, 'contentData', { configurable: true, get: desc.get, set });
            return !frame.hasAttribute('disablecontextmenu') && Object.getOwnPropertyDescriptor(shim, 'contentData').set.__pbPlanted === true;`);
        if (read === true) {
            note('PLANT ide-menu-leak applied');
        }
    }
    if (plant === 'referrer-dropped') {
        if (await inChrome(app, `Services.prefs.setIntPref('network.http.sendRefererHeader', 0); return Services.prefs.getIntPref('network.http.sendRefererHeader') === 0;`) === true) {
            note('PLANT referrer-dropped applied');
        }
    }
}

/** Right-clicks (x, y) in `context` and waits for this tab's menu push and a visible .lm-Menu; returns { push, ms }. */
async function openMenuAt(app, context, tabId, point) {
    const mark = (await pushes(app)).length;
    const started = Date.now();
    await clickAt(app, context, point.x, point.y, 2);
    const at = await waitForPush(app, isMenuPush(tabId), { from: mark, timeoutMs: 5000 });
    if (at < 0) {
        return { push: null, ms: 0 };
    }
    const rows = await settle(() => menuRows(app), r => Array.isArray(r) && r.length > 0, 3000);
    return { push: (await pushes(app))[at], ms: Array.isArray(rows) ? Date.now() - started : 0, rows };
}

const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

async function contextMenu({ app, pages, plant, fail, note }) {
    await applyMenuPlants(app, plant, note);
    if (!plant && await installContextRecorder(app) !== true) {
        return fail(`${BROKEN} the probe 35-1 context recorder could not be installed on the shim`);
    }
    await installMenuEngine(app, pages);
    const url = pages.url('/menu');
    const tabId = await openWebTab(app, url);
    if (await waitForPush(app, loadedAt(tabId, '/menu')) < 0) {
        return fail('no loaded state push arrived for /menu');
    }
    await makeCurrent(app, tabId);
    if (await settle(() => overlayVisibility(app, tabId), v => v === 'visible') !== 'visible') {
        return fail(`${BROKEN} the page is not shown`);
    }
    const page = await contextOf(app, url);
    const theia = await contextOf(app, await app.evaluate('location.href'));
    if (!(await settle(() => app.evaluateIn(page, `document.getElementById('v').currentTime`), t => t > 0) > 0)) {
        return fail(`${BROKEN} the page's video never started playing`);
    }
    if (await settle(() => app.evaluateIn(page, `document.getElementById('img')?.complete === true && document.getElementById('img').naturalWidth > 0`), v => v === true) !== true) {
        return fail(`${BROKEN} the served image never loaded`);
    }
    const strip = await inChrome(app, `return Services.prefs.getBoolPref('privacy.query_stripping.strip_on_share.enabled', false);`) === true;
    const rows = pageMenuRows();
    const appName = await app.evaluate(appNameExpr);
    // 35-04: Inspect shows on every target (default prefs); the page rows on a blank area and in the frame.
    const inspect = await inChrome(app, `return Services.prefs.getBoolPref('devtools.inspector.enabled', true) && !Services.prefs.getBoolPref('devtools.policy.disabled', false);`) === true ? ['inspect'] : [];
    const pageNames = ['navigation', 'reload', 'bookmarkPage', 'savePage', 'selectAll', 'viewSource', ...inspect];
    const linkNames = ['openLink', 'copyLink', ...(strip ? ['stripOnShare'] : []), 'search', ...inspect];
    const targets = [
        { name: 'link', selector: '#link', when: ['saveLink', ...linkNames] },
        { name: 'javascript link', selector: '#jslink', when: linkNames, refused: true },
        { name: 'image', selector: '#img', when: ['viewImage', 'saveImage', 'copyImageContents', 'copyImage', ...inspect] },
        { name: 'video', selector: '#v', when: ['mediaPause', 'mediaUnmute', 'onMedia', 'mediaShowControls', 'onVideo', ...inspect] },
        { name: 'selection', selector: '#words', when: ['search', 'copy', 'selectAll', ...inspect], select: true },
        { name: 'frame', selector: '#frame', when: [...pageNames, 'inFrame', 'frameTarget', 'frameSource'] },
        { name: 'blank', selector: '#blank', when: pageNames },
    ];
    const times = [];
    for (const target of targets) {
        if (target.select) {
            await app.evaluateIn(page, `getSelection().selectAllChildren(document.getElementById('words')); true`);
        }
        const opened = await openMenuAt(app, page, tabId, await centreOf(app, page, target.selector));
        if (!opened.push) {
            return fail(`no pageContextMenu push for ${tabId} after a right-click on the ${target.name}`);
        }
        if (!opened.ms) {
            return fail(`the ${target.name}'s pageContextMenu push showed no .lm-Menu in the Theia frame`);
        }
        times.push(opened.ms);
        const want = expectedIds(rows, target.when);
        const got = flatIds(opened.push.items);
        if (JSON.stringify(got) !== JSON.stringify(want)) {
            return fail(`the ${target.name}'s menu rows are ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
        }
        if (target.name === 'link' && opened.rows[0]?.label !== ftlLabel('main-context-menu-open-link-new-tab')) {
            return fail(`the link menu's first row reads ${JSON.stringify(opened.rows[0]?.label)}, not upstream's ${JSON.stringify(ftlLabel('main-context-menu-open-link-new-tab'))}`);
        }
        if (target.refused) {
            const row = opened.rows.find(r => r.label === refusalLabel(appName));
            if (!row || !row.disabled) {
                return fail(`the javascript: link shows no disabled refusal row reading ${JSON.stringify(refusalLabel(appName))}; rows ${JSON.stringify(opened.rows.map(r => r.label))}`);
            }
        }
        if (!plant) {
            const seen = JSON.parse(await inChrome(app, 'return JSON.stringify(window.__pbMenuContexts || []);'));
            note(`probe 35-1 ${target.name}: ${seen[seen.length - 1] ?? '(no capture)'}`);
        }
        await closeMenu(app);
        if (target.select) {
            await app.evaluateIn(page, `getSelection().removeAllRanges(); true`);
        }
    }

    // Copy Link.
    await openMenuAt(app, page, tabId, await centreOf(app, page, '#link'));
    if (!await pickRow(app, theia, ftlLabel('main-context-menu-copy-link-simple'))) {
        return fail('the link menu has no Copy Link row to pick');
    }
    if (await settle(() => clipboardText(app), t => t === pages.url('/target'), 3000) !== pages.url('/target')) {
        return fail(`Copy Link did not put ${pages.url('/target')} on the clipboard`);
    }

    // Open Link in New Tab: after the opener, the opener still current, with the page's referrer.
    await makeCurrent(app, tabId);
    let mark = (await pushes(app)).length;
    referers.length = 0;
    await openMenuAt(app, page, tabId, await centreOf(app, page, '#link'));
    if (!await pickRow(app, theia, ftlLabel('main-context-menu-open-link-new-tab'))) {
        return fail('the link menu has no Open Link in New Tab row to pick');
    }
    const openedAt = await waitForPush(app, p => p && p.kind === 'state' && p.tabId !== tabId && p.loading === false && String(p.url).endsWith('/target'), { from: mark, timeoutMs: 10000 });
    if (openedAt < 0) {
        return fail('Open Link in New Tab opened no web tab that loaded /target');
    }
    const newTab = (await pushes(app))[openedAt].tabId;
    const order = await mainTabIds(app);
    if (order.indexOf(newTab) !== order.indexOf(tabId) + 1) {
        return fail(`the new tab is not directly after its opener: ${JSON.stringify(order)}`);
    }
    if (await currentTabId(app) !== tabId) {
        return fail('the opener is no longer the current tab after Open Link in New Tab (browser.tabs.loadInBackground is true)');
    }
    const targetGet = referers.find(r => r.path === '/target');
    if (!targetGet?.referer) {
        return fail('new tab request carried no Referer');
    }
    if (targetGet.referer !== url) {
        return fail(`the new tab's /target GET carried Referer ${JSON.stringify(targetGet.referer)}, not the opener's ${JSON.stringify(url)}`);
    }

    // The javascript: link: refusal only.
    mark = (await pushes(app)).length;
    const served = pages.requests.length;
    await openMenuAt(app, page, tabId, await centreOf(app, page, '#jslink'));
    await closeMenu(app);
    await sleep(1000);
    if (pages.requests.length !== served || (await pushes(app)).slice(mark).some(p => p && p.kind === 'state' && p.tabId !== tabId)) {
        return fail('the javascript: link menu opened a tab or served a request');
    }

    // Image: Copy Image Link, then Open Image in New Tab.
    await openMenuAt(app, page, tabId, await centreOf(app, page, '#img'));
    if (!await pickRow(app, theia, ftlLabel('main-context-menu-image-copy-link'))) {
        return fail('the image menu has no Copy Image Link row to pick');
    }
    if (await settle(() => clipboardText(app), t => t === assets.url('/pixel.png'), 3000) !== assets.url('/pixel.png')) {
        return fail('Copy Image Link did not put the image URL on the clipboard');
    }
    mark = (await pushes(app)).length;
    await openMenuAt(app, page, tabId, await centreOf(app, page, '#img'));
    if (!await pickRow(app, theia, ftlLabel('main-context-menu-image-view-new-tab'))) {
        return fail('the image menu has no Open Image in New Tab row to pick');
    }
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId !== tabId && String(p.url) === assets.url('/pixel.png'), { from: mark, timeoutMs: 10000 }) < 0) {
        return fail('Open Image in New Tab opened no tab on the image URL');
    }
    await makeCurrent(app, tabId);

    // Video: Pause, then Play.
    for (const [id, paused] of [['main-context-menu-media-pause', true], ['main-context-menu-media-play', false]]) {
        await settle(() => overlayVisibility(app, tabId), v => v === 'visible');
        await openMenuAt(app, page, tabId, await centreOf(app, page, '#v'));
        if (!await pickRow(app, theia, ftlLabel(id))) {
            return fail(`the video menu has no ${ftlLabel(id)} row to pick`);
        }
        if (await settle(() => app.evaluateIn(page, `document.getElementById('v').paused`), v => v === paused, 3000) !== paused) {
            return fail(`${ftlLabel(id)} did not leave video.paused ${paused}`);
        }
    }

    // Frame: This Frame > Reload Frame fetches the frame document once more.
    const frameGets = () => pages.requests.filter(r => r.path === '/frame').length;
    const before = frameGets();
    await settle(() => overlayVisibility(app, tabId), v => v === 'visible');
    await openMenuAt(app, page, tabId, await centreOf(app, page, '#frame'));
    if (!await pickRow(app, theia, ftlLabel('main-context-menu-frame'))) {
        return fail('the frame menu has no This Frame submenu');
    }
    await settle(() => menuRows(app, 1), r => Array.isArray(r) && r.length > 0, 3000);
    if (!await pickRow(app, theia, ftlLabel('main-context-menu-frame-reload'), 1)) {
        return fail('the This Frame submenu has no Reload Frame row to pick');
    }
    if (await settle(async () => frameGets(), n => n === before + 1, 5000) !== before + 1) {
        return fail(`Reload Frame did not fetch the frame document once more (${before} then ${frameGets()})`);
    }

    // Search: the selection on the served engine.
    await settle(() => overlayVisibility(app, tabId), v => v === 'visible');
    await app.evaluateIn(page, `getSelection().selectAllChildren(document.getElementById('words')); true`);
    mark = (await pushes(app)).length;
    await openMenuAt(app, page, tabId, await centreOf(app, page, '#words'));
    if (!await pickRow(app, theia, searchLabel(MENU_ENGINE, MENU_WORDS))) {
        return fail(`the selection menu has no row reading ${JSON.stringify(searchLabel(MENU_ENGINE, MENU_WORDS))}`);
    }
    const searched = p => p && p.kind === 'state' && p.tabId !== tabId && new URL(String(p.url), pages.origin).pathname === '/search'
        && new URL(String(p.url), pages.origin).searchParams.get('q') === MENU_WORDS;
    if (await waitForPush(app, searched, { from: mark, timeoutMs: 10000 }) < 0) {
        return fail('the search row opened no tab on /search?q= with the selection');
    }
    console.log(`context-menu timing: p50 ${percentile(times, 50)} p95 ${percentile(times, 95)} n=${times.length}`);
}

async function menuNotInIde({ app, results, fail }) {
    const control = results.find(r => r.name === 'context-menu');
    if (!control || control.failures.length || control.notScored) {
        return 'not-scored';
    }
    await closeMenu(app);
    const theia = await contextOf(app, await app.evaluate('location.href'));
    const tab = JSON.parse(await app.evaluate(`JSON.stringify((() => { const t = document.querySelector('#theia-main-content-panel .lm-TabBar-tab'); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })())`));
    if (!tab) {
        return fail(`${BROKEN} no main-area tab to right-click in the IDE`);
    }
    const mark = (await pushes(app)).length;
    await clickAt(app, theia, tab.x, tab.y, 2);
    const own = await settle(() => menuRows(app), r => Array.isArray(r) && r.length > 0, 3000);
    if (!Array.isArray(own) || !own.length) {
        return fail(`${BROKEN} the IDE right-click opened no Theia menu, so the absence would prove nothing`);
    }
    await sleep(1500);
    await closeMenu(app);
    if ((await pushes(app)).slice(mark).some(isMenuPush())) {
        return fail('the IDE right-click pushed a page menu');
    }
}

async function backgroundMenu({ app, pages, results, fail }) {
    const control = results.find(r => r.name === 'context-menu');
    if (!control || control.failures.length || control.notScored) {
        return 'not-scored';
    }
    await closeMenu(app);
    const url = pages.url('/menu');
    const first = await openWebTab(app, url);
    if (await waitForPush(app, loadedAt(first, '/menu')) < 0) {
        return fail('no loaded state push arrived for the first tab');
    }
    const firstContext = (await app.contexts()).filter(c => c.url === url).at(-1)?.context;
    const second = await openWebTab(app, pages.url('/frame'));
    if (await waitForPush(app, loadedAt(second, '/frame')) < 0) {
        return fail('no loaded state push arrived for the second tab');
    }
    await makeCurrent(app, second);
    if (await settle(() => overlayVisibility(app, first), v => v === 'hidden') !== 'hidden' || !firstContext) {
        return fail(`${BROKEN} the first tab is not hidden behind the second, so the absence would prove nothing`);
    }
    let mark = (await pushes(app)).length;
    try {
        await clickAt(app, firstContext, 40, 40, 2);
    } catch {
        // input on a hidden context may be refused; the absence below is judged the same either way
    }
    await sleep(1500);
    if ((await pushes(app)).slice(mark).some(isMenuPush(first))) {
        await closeMenu(app);
        return fail('a hidden tab opened a menu');
    }
    await makeCurrent(app, first);
    if (await settle(() => overlayVisibility(app, first), v => v === 'visible') !== 'visible') {
        return fail(`${BROKEN} the first tab could not be shown again`);
    }
    mark = (await pushes(app)).length;
    await clickAt(app, firstContext, 40, 40, 2);
    if (await waitForPush(app, isMenuPush(first), { from: mark, timeoutMs: 5000 }) < 0) {
        return fail('the same right-click on the shown tab pushed no menu (the in-scenario positive control)');
    }
    await closeMenu(app);
}

// ---------------------------------------------------------------------------
// 35-04 (PROMPT-04): the rows that run on Phase 32's and Phase 33's mechanisms.
// ---------------------------------------------------------------------------

/** Opens /tools in a new current web tab; returns { tabId, page, theia, url } or a failure string. */
async function openTools(app, pages) {
    const url = pages.url('/tools');
    const tabId = await openWebTab(app, url);
    if (await waitForPush(app, loadedAt(tabId, '/tools')) < 0) {
        return 'no loaded state push arrived for /tools';
    }
    await makeCurrent(app, tabId);
    if (await settle(() => overlayVisibility(app, tabId), v => v === 'visible') !== 'visible') {
        return `${BROKEN} the /tools page is not shown`;
    }
    const page = (await app.contexts()).filter(c => c.url === url).at(-1)?.context;
    if (!page) {
        return `${BROKEN} no BiDi context for the /tools page`;
    }
    return { tabId, page, theia: await contextOf(app, await app.evaluate('location.href')), url };
}

/** Right-clicks `selector` in the page and picks the row labelled `label` (a submenu row when `parent` names one). */
async function pickFromMenu(app, tools, selector, label, parent) {
    await settle(() => overlayVisibility(app, tools.tabId), v => v === 'visible');
    const opened = await openMenuAt(app, tools.page, tools.tabId, await centreOf(app, tools.page, selector));
    if (!opened.push) {
        return false;
    }
    if (parent) {
        if (!await pickRow(app, tools.theia, parent)) {
            return false;
        }
        await settle(() => menuRows(app, 1), r => Array.isArray(r) && r.length > 0, 3000);
        return pickRow(app, tools.theia, label, 1);
    }
    return pickRow(app, tools.theia, label);
}

const overlayUri = (app, tabId) => inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); return o && o.currentURI ? o.currentURI.spec : '';`);

/** True while the Theia frame shows a dialog titled `title`. */
const dialogOpen = (app, title) => probe(app, `return [...document.querySelectorAll('.dialogTitle')].some(node => node.textContent.trim() === ${JSON.stringify(title)});`);

/** Clicks the open dialog's Cancel button; true when one was clicked. */
const cancelDialog = app => probe(app, "const button = [...document.querySelectorAll('.dialogControl button')].find(node => node.textContent.trim() === 'Cancel'); if (!button) { return false; } button.click(); return true;");

/** A CHROME_BAR_COPY string literal (`key: '...'`), read from the tree so the dialog title is never typed here. */
function chromeBarCopy(key) {
    const value = new RegExp(`\\b${key}: '([^']+)'`).exec(readTree('theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts'))?.[1];
    if (!value) {
        throw new Error(`${BROKEN} no ${key} in chrome-bar-copy.ts`);
    }
    return value;
}

async function applyPageToolPlants(app, plant, note) {
    if (plant === 'inspect-no-select') {
        if (await inChrome(app, `const { DevToolsShim } = ChromeUtils.importESModule('chrome://devtools-startup/content/DevToolsShim.sys.mjs');
            const noop = () => Promise.resolve();
            noop.__pbPlanted = true;
            DevToolsShim.inspectNode = noop;
            return DevToolsShim.inspectNode.__pbPlanted === true;`) === true) {
            note('PLANT inspect-no-select applied');
        }
    }
    if (plant === 'copy-row-unwired') {
        // The Copy row's frontend handler is a no-op: the pick reaches chrome, nothing reaches the clipboard.
        if (await probe(app, `const menu = get('PageContextMenuContribution');
            const settle = menu.settle;
            const planted = function (widget, tabId, menuId, itemId, reply) { return itemId === 'context-copy' ? Promise.resolve() : settle.apply(this, arguments); };
            planted.__pbPlanted = true;
            menu.settle = planted;
            return menu.settle.__pbPlanted === true;`) === true) {
            note('PLANT copy-row-unwired applied');
        }
    }
    if (plant === 'spellcheck-off') {
        if (await inChrome(app, `Services.prefs.setIntPref('layout.spellcheckDefault', 0); return Services.prefs.getIntPref('layout.spellcheckDefault') === 0;`) === true) {
            note('PLANT spellcheck-off applied');
        }
    }
    if (plant === 'save-dialog-cancelled') {
        if (await probe(app, `const dialogs = get('FileDialogService');
            const planted = async () => undefined;
            planted.__pbPlanted = true;
            dialogs.showSaveDialog = planted;
            return dialogs.showSaveDialog.__pbPlanted === true;`) === true) {
            note('PLANT save-dialog-cancelled applied');
        }
    }
}

async function menuPageTools({ app, pages, plant, fail, note }) {
    await applyPageToolPlants(app, plant, note);
    let tools = await openTools(app, pages);
    if (typeof tools === 'string') {
        return fail(tools);
    }

    // Bookmark Page: Phase 33's star editor opens and the page is bookmarked.
    if (!await pickFromMenu(app, tools, '#blank', ftlLabel('main-context-menu-bookmark-page'))) {
        return fail('the blank-area menu has no Bookmark Page row to pick');
    }
    if (await settle(() => probe(app, "const e = document.querySelector('.pb-bookmark-editor'); return !!e && e.getBoundingClientRect().height > 0;"), v => v === true) !== true) {
        return fail('Bookmark Page opened no .pb-bookmark-editor');
    }
    const bookmarked = await settle(() => inChrome(app, `const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        return (async () => !!(await PlacesUtils.bookmarks.fetch({ url: ${JSON.stringify(tools.url)} })))();`), v => v === true);
    if (bookmarked !== true) {
        return fail('Bookmark Page left the page out of Places');
    }
    await pressKey(app, ESCAPE);

    // Save Page As: Phase 32's dialog opens; Cancel leaves no error.
    const savePageTitle = chromeBarCopy('savePageTitle');
    if (!await pickFromMenu(app, tools, '#blank', ftlLabel('main-context-menu-page-save'))) {
        return fail('the blank-area menu has no Save Page As row to pick');
    }
    if (await settle(() => dialogOpen(app, savePageTitle), v => v === true) !== true) {
        return fail(`Save Page As opened no "${savePageTitle}" dialog`);
    }
    if (await cancelDialog(app) !== true || await settle(() => dialogOpen(app, savePageTitle), v => v === false) !== false) {
        return fail(`the "${savePageTitle}" dialog did not close on Cancel`);
    }

    // Inspect: the toolbox for this tab selects the right-clicked element.
    if (!await pickFromMenu(app, tools, `#${INSPECT_ID}`, ftlLabel('main-context-menu-inspect'))) {
        return fail('the element menu has no Inspect row to pick');
    }
    const selected = await settle(() => inChrome(app, `const o = overlayOf(${JSON.stringify(tools.tabId)});
        const tab = o && window.gBrowser.getTabForBrowser(o);
        const { DevToolsShim } = ChromeUtils.importESModule('chrome://devtools-startup/content/DevToolsShim.sys.mjs');
        const toolbox = tab && DevToolsShim.isInitialized() ? DevToolsShim.getToolboxForTab(tab) : null;
        const node = toolbox?.getPanel('inspector')?.selection?.nodeFront;
        return node ? node.getAttribute('id') : null;`), v => v === INSPECT_ID, 10000);
    if (selected !== INSPECT_ID) {
        return fail(`the inspector did not select the clicked node (selected id ${JSON.stringify(selected)})`);
    }

    // View Frame Source: the frame document's source in the tab.
    if (!await pickFromMenu(app, tools, '#frame', ftlLabel('main-context-menu-frame-view-source'), ftlLabel('main-context-menu-frame'))) {
        return fail('the frame menu has no This Frame > View Frame Source row to pick');
    }
    if (await settle(() => overlayUri(app, tools.tabId), v => v === `view-source:${pages.url('/frame')}`) !== `view-source:${pages.url('/frame')}`) {
        return fail('View Frame Source did not load the frame document\'s source');
    }

    // View Page Source, in a fresh tab of the page.
    tools = await openTools(app, pages);
    if (typeof tools === 'string') {
        return fail(tools);
    }
    if (!await pickFromMenu(app, tools, '#blank', ftlLabel('main-context-menu-view-page-source'))) {
        return fail('the blank-area menu has no View Page Source row to pick');
    }
    if (await settle(() => overlayUri(app, tools.tabId), v => v === `view-source:${tools.url}`) !== `view-source:${tools.url}`) {
        return fail('View Page Source did not load view-source: plus the page URL');
    }
}

async function menuEdit({ app, pages, plant, fail, note }) {
    await applyPageToolPlants(app, plant, note);
    const tools = await openTools(app, pages);
    if (typeof tools === 'string') {
        return fail(tools);
    }
    await app.evaluateIn(tools.page, `const f = document.getElementById('field'); f.focus(); f.setSelectionRange(6, 10); true`);
    const opened = await openMenuAt(app, tools.page, tools.tabId, await centreOf(app, tools.page, '#field'));
    if (!opened.push) {
        return fail('no pageContextMenu push for the text field');
    }
    const labels = (opened.rows ?? []).map(r => r.label);
    const missing = ['text-action-undo', 'text-action-cut', 'text-action-copy', 'text-action-paste', 'text-action-delete', 'text-action-select-all'].map(ftlLabel).filter(label => !labels.includes(label));
    if (missing.length) {
        return fail(`the text field menu lacks ${missing.join(', ')}; rows ${JSON.stringify(labels)}`);
    }
    // A sentinel first: the system clipboard outlives the session, so an earlier "beta" cannot pass for this copy.
    await inChrome(app, `Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString('pb-sentinel'); return true;`);
    if (!await pickRow(app, tools.theia, ftlLabel('text-action-copy'))) {
        return fail('the text field menu has no Copy row to pick');
    }
    if (await settle(() => clipboardText(app), t => t === 'beta', 3000) !== 'beta') {
        return fail('copy did not reach the clipboard');
    }
    await app.evaluateIn(tools.page, `document.getElementById('field2').focus(); true`);
    if (!await pickFromMenu(app, tools, '#field2', ftlLabel('text-action-paste'))) {
        return fail('the second field has no Paste row to pick');
    }
    const fieldValue = () => app.evaluateIn(tools.page, `document.getElementById('field2').value`);
    if (await settle(fieldValue, v => v === 'beta', 3000) !== 'beta') {
        return fail('Paste did not set the second field');
    }
    await app.evaluateIn(tools.page, `document.getElementById('field2').focus(); true`);
    if (!await pickFromMenu(app, tools, '#field2', ftlLabel('text-action-undo'))) {
        return fail('the second field has no Undo row to pick');
    }
    if (await settle(fieldValue, v => v === '', 3000) !== '') {
        return fail('Undo did not restore the second field\'s previous value');
    }
    await inChrome(app, `Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString('pb-sentinel'); return true;`);
    if (!await pickFromMenu(app, tools, '#img', ftlLabel('main-context-menu-image-copy'))) {
        return fail('the image menu has no Copy Image row to pick');
    }
    const png = await settle(() => inChrome(app, `return Services.clipboard.hasDataMatchingFlavors(['image/png'], Services.clipboard.kGlobalClipboard);`), v => v === true, 3000);
    if (png !== true) {
        return fail('Copy Image left no image/png flavour on the clipboard');
    }
}

/** The pushed menu's spelling suggestion labels (dynamic spell-suggestion rows) after a right-click on `selector`. */
async function suggestionsAt(app, tools, selector) {
    await app.evaluateIn(tools.page, `document.querySelector(${JSON.stringify(selector)}).focus(); true`);
    await sleep(500); // the inline checker runs after focus
    const opened = await openMenuAt(app, tools.page, tools.tabId, await centreOf(app, tools.page, selector));
    const items = opened.push ? opened.push.items : [];
    return { opened, words: items.filter(item => /^spell-suggestion-\d+$/.test(item.id)).map(item => item.label), ids: flatIds(items) };
}

async function menuSpelling({ app, pages, plant, fail, note }) {
    await applyPageToolPlants(app, plant, note);
    const tools = await openTools(app, pages);
    if (typeof tools === 'string') {
        return fail(tools);
    }
    const first = await suggestionsAt(app, tools, '#spell');
    if (!first.opened.push) {
        return fail('no pageContextMenu push for the misspelt textarea');
    }
    if (!first.words.includes('the')) {
        await closeMenu(app);
        return fail(`no suggestion row "the" for "teh" (suggestions ${JSON.stringify(first.words)})`);
    }
    if (!await pickRow(app, tools.theia, 'the')) {
        return fail('the suggestion row "the" could not be picked');
    }
    const fixed = await settle(() => app.evaluateIn(tools.page, `document.getElementById('spell').value`), v => /\bthe\b/.test(v), 3000);
    if (!/\bthe\b/.test(String(fixed))) {
        return fail(`picking "the" did not replace the misspelling (value ${JSON.stringify(fixed)})`);
    }
    const before = await suggestionsAt(app, tools, '#spell2');
    if (!before.words.length) {
        await closeMenu(app);
        return fail(`no suggestion row for "wrod" (rows ${JSON.stringify(before.ids)})`);
    }
    if (!await pickRow(app, tools.theia, ftlLabel('text-action-spell-add-to-dictionary'))) {
        return fail('the misspelling menu has no Add to Dictionary row to pick');
    }
    const added = await suggestionsAt(app, tools, '#spell2');
    if (added.words.length || added.ids.includes('spell-add-to-dictionary')) {
        await closeMenu(app);
        return fail('Add to Dictionary left "wrod" misspelt in the next menu');
    }
    if (!await pickRow(app, tools.theia, ftlLabel('text-action-spell-undo-add-to-dictionary'))) {
        return fail('the next menu has no Undo Add to Dictionary row to pick');
    }
    const undone = await suggestionsAt(app, tools, '#spell2');
    await closeMenu(app);
    if (!undone.words.length) {
        return fail('Undo Add to Dictionary did not restore the suggestions for "wrod"');
    }
}

/** Accepts the open save dialog with `dir`/`name`: the location text input, the file name field, then Save. */
const acceptSaveDialog = (app, dir, name) => probe(app, `const dialog = document.querySelector('.theia-SaveFileDialog');
    if (!dialog) { return 'no save dialog'; }
    const fire = (node, type) => node.dispatchEvent(new Event(type, { bubbles: true }));
    const setValue = (input, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); fire(input, 'input'); fire(input, 'change'); };
    const enter = node => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    if (!dialog.querySelector('.theia-LocationTextInput')) {
        dialog.querySelector('.theia-LocationInputToggle')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    }
    if (!await until(() => dialog.querySelector('.theia-LocationTextInput'), 2000)) { return 'no location text input'; }
    const location = dialog.querySelector('.theia-LocationTextInput');
    setValue(location, ${JSON.stringify(dir)});
    enter(location);
    await sleep(500);
    const field = dialog.querySelector('.theia-FileNameTextField');
    if (!field) { return 'no file name field'; }
    setValue(field, ${JSON.stringify(name)});
    const save = [...dialog.querySelectorAll('.dialogControl button')].find(node => node.classList.contains('main'));
    if (!save) { return 'no Save button'; }
    save.click();
    return 'accepted';`);

async function menuSave({ app, pages, plant, fail, note }) {
    await applyPageToolPlants(app, plant, note);
    const tools = await openTools(app, pages);
    if (typeof tools === 'string') {
        return fail(tools);
    }
    const subscribed = await probe(app, `return (await get('WebTabChannel').request({ kind: 'webTabDownloadsSubscribe', tabId: ${JSON.stringify(tools.tabId)} })).ok === true;`);
    if (subscribed !== true) {
        return fail(`${BROKEN} the downloads view could not be subscribed, so the panel row would prove nothing`);
    }
    const dir = await mkdtemp(join(tmpdir(), 'pb-35-04-save-'));
    try {
        const name = 'saved-link.bin';
        const path = join(dir, name);
        const mark = (await pushes(app)).length;
        const served = assets.requests.length;
        if (!await pickFromMenu(app, tools, '#filelink', ftlLabel('main-context-menu-save-link'))) {
            return fail('the link menu has no Save Link As row to pick');
        }
        const title = chromeBarCopy('saveLinkTitle');
        // No dialog (a cancelled pick) leaves nothing to accept; the file check below then scores it.
        if (await settle(() => dialogOpen(app, title), v => v === true) === true) {
            const accepted = await acceptSaveDialog(app, dir, name);
            if (accepted !== 'accepted') {
                return fail(`${BROKEN} the "${title}" dialog could not be driven (${accepted})`);
            }
        } else {
            note(`no "${title}" dialog opened`);
        }
        const landed = await settle(async () => (await stat(path).then(info => info.isFile(), () => false)) && (await readFile(path)).equals(FILE_BYTES), v => v === true, 10000);
        if (landed !== true) {
            return fail('no file at the chosen path with the served bytes');
        }
        const get = assets.requests.slice(served).find(r => r.path === '/file.bin');
        if (!get?.referer || !get.referer.startsWith(pages.origin)) {
            return fail(`the save GET carried Referer ${JSON.stringify(get?.referer ?? null)}, not the page's origin ${pages.origin}`);
        }
        if (await waitForPush(app, p => p && p.kind === 'downloadsChanged' && (p.rows ?? []).some(r => r.filename === name), { from: mark, timeoutMs: 10000 }) < 0) {
            return fail('the downloads panel lists no row for the saved file');
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

// 35-05 (D-16): extension entries.
const EXT_LABEL = 'Furniture test entry';
const isExtRow = item => !!item && item.label === EXT_LABEL && String(item.id).startsWith('extension-entry-');

async function applyExtensionPlants(app, plant, note) {
    if (plant === 'ext-cleanup-skipped') {
        // ext-menus never hears the close, so its items stay in the stub and the next build appends a second set.
        if (await inChrome(app, `const stub = document.getElementById('contentAreaContextMenu');
            stub.addEventListener('popuphidden', event => event.stopImmediatePropagation(), true);
            let reached = false;
            const after = () => { reached = true; };
            stub.addEventListener('popuphidden', after);
            stub.dispatchEvent(new Event('popuphidden'));
            stub.removeEventListener('popuphidden', after);
            return reached === false;`) === true) {
            note('PLANT ext-cleanup-skipped applied');
        }
    }
    if (plant === 'ext-command-dropped') {
        // A pick reaches chrome, but doCommand on a stub item does nothing, so ext-menus never sees the command.
        if (await inChrome(app, `const proto = window.XULElement.prototype;
            const original = proto.doCommand;
            const planted = function () { return this.closest && this.closest('#contentAreaContextMenu') ? undefined : original.call(this); };
            planted.__pbPlanted = true;
            proto.doCommand = planted;
            const stub = document.getElementById('contentAreaContextMenu');
            const item = document.createXULElement('menuitem');
            stub.append(item);
            const read = item.doCommand.__pbPlanted === true;
            item.remove();
            return read;`) === true) {
            note('PLANT ext-command-dropped applied');
        }
    }
}

async function extensionEntry({ app, pages, plant, fail, note }) {
    await applyExtensionPlants(app, plant, note);
    const url = pages.url('/furniture');
    const tabId = await openWebTab(app, url);
    if (await waitForPush(app, loadedAt(tabId, '/furniture')) < 0) {
        return fail('no loaded state push arrived for /furniture');
    }
    await makeCurrent(app, tabId);
    if (await settle(() => overlayVisibility(app, tabId), v => v === 'visible') !== 'visible') {
        return fail(`${BROKEN} the page is not shown`);
    }
    const page = await contextOf(app, url);
    const theia = await contextOf(app, await app.evaluate('location.href'));
    const dir = await mkdtemp(join(tmpdir(), 'pb-35-05-ext-'));
    let extension = null;
    try {
        await writeFile(join(dir, 'manifest.json'), JSON.stringify({
            manifest_version: 2,
            name: 'Furniture test extension',
            version: '1.0',
            permissions: ['menus', 'http://127.0.0.1/*'],
            background: { scripts: ['background.js'] },
            browser_specific_settings: { gecko: { id: 'furniture-test@powerbrowser.invalid' } },
        }));
        await writeFile(join(dir, 'background.js'), `browser.menus.create({ id: 'furniture-test', title: ${JSON.stringify(EXT_LABEL)}, contexts: ['page', 'link'] });
browser.menus.onClicked.addListener((info, tab) => {
    fetch(${JSON.stringify(assets.url('/ext-clicked'))} + '?page=' + encodeURIComponent(info.pageUrl) + '&tab=' + (tab ? tab.id : -1));
});
`);
        extension = (await app.send('webExtension.install', { extensionData: { type: 'path', path: dir } }))?.extension ?? null;
        if (!extension) {
            return fail(`${BROKEN} the test extension could not be installed over BiDi`);
        }
        const point = await centreOf(app, page, '#plain');
        // The entry exists once the background script has run, which can be after the first menus.
        let opened = null;
        for (let attempt = 0; attempt < 10; attempt++) {
            opened = await openMenuAt(app, page, tabId, point);
            if (!opened.push || opened.push.items.some(isExtRow)) {
                break;
            }
            await closeMenu(app);
            await sleep(500);
        }
        if (!opened.push) {
            return fail(`no pageContextMenu push for ${tabId} after a right-click on the page`);
        }
        const items = opened.push.items;
        const at = items.findIndex(isExtRow);
        if (at < 0) {
            return fail(`the page menu shows no extension row labelled ${JSON.stringify(EXT_LABEL)}; rows ${JSON.stringify(items.map(item => item.label))}`);
        }
        if (items.filter(isExtRow).length > 1) {
            return fail(`duplicate extension row: one menu shows ${items.filter(isExtRow).length}`);
        }
        if (at === 0 || items.slice(at + 1).some(item => !String(item.id).startsWith('extension-entry-'))) {
            return fail(`the extension row is not after the stock rows: ${JSON.stringify(flatIds(items))}`);
        }
        const served = assets.requests.length;
        if (!await pickRow(app, theia, EXT_LABEL)) {
            return fail(`the open menu has no row reading ${JSON.stringify(EXT_LABEL)}`);
        }
        const clicked = await settle(async () => assets.requests.slice(served).find(r => r.path === '/ext-clicked') ?? null, r => r !== null, 5000);
        if (!clicked) {
            return fail('no onClicked request reached the server within 5 s of the pick');
        }
        const query = new URLSearchParams(clicked.search);
        if (query.get('page') !== url) {
            return fail(`menus.onClicked reported page ${JSON.stringify(query.get('page'))}, not ${url}`);
        }
        if (!(Number(query.get('tab')) >= 0)) {
            return fail(`menus.onClicked reported tab id ${JSON.stringify(query.get('tab'))}, not a tab`);
        }
        await settle(() => overlayVisibility(app, tabId), v => v === 'visible');
        const again = await openMenuAt(app, page, tabId, point);
        const count = (again.push?.items ?? []).filter(isExtRow).length;
        await closeMenu(app);
        if (count !== 1) {
            return fail(count > 1 ? `duplicate extension row: the next menu shows ${count}` : 'the next menu shows no extension row');
        }
    } finally {
        await closeMenu(app).catch(() => {});
        if (extension) {
            await app.send('webExtension.uninstall', { extension }).catch(() => {});
        }
        await rm(dir, { recursive: true, force: true });
    }
}

// 35-05 (D-08, G4b): the freeze-frame and its budgets.
const FREEZE_OPENS = 20;
const FREEZE_MENU_P95_MS = 200;

/** Theia frame: Date.now at each pageStill and pageContextMenu push, and each time a .lm-Menu becomes visible. */
const installFreezeRecorder = app => app.evaluate(`(() => {
    window.__pbFreeze = { pushes: [], shown: [] };
    window.addEventListener(${JSON.stringify(WEB_TAB_STATE_EVENT)}, event => {
        const d = event.detail;
        if (d && (d.kind === 'pageStill' || d.kind === 'pageContextMenu')) {
            window.__pbFreeze.pushes.push({ kind: d.kind, tabId: d.tabId, menuId: d.menuId, dataUrl: d.kind === 'pageStill' ? d.dataUrl : null, at: Date.now() });
        }
    });
    let open = false;
    new MutationObserver(() => {
        const now = [...document.querySelectorAll('.lm-Menu')].some(menu => menu.getClientRects().length > 0);
        if (now && !open) {
            window.__pbFreeze.shown.push(Date.now());
        }
        open = now;
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
    return true;
})()`);

/** The recorder's state with each data URL replaced by its length. */
const freezeState = app => app.evaluate(`JSON.stringify(window.__pbFreeze, (key, value) => key === 'dataUrl' ? (value ? value.length : null) : value)`).then(JSON.parse);

/** True when the tab's widget shows img.pb-web-tab-still whose src is the still pushed for `menuId`. */
const stillPainted = (app, tabId, menuId) => probe(app, `const widget = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});
    const img = widget && widget.node.querySelector('img.pb-web-tab-still');
    const pushed = window.__pbFreeze.pushes.filter(p => p.kind === 'pageStill' && p.menuId === ${JSON.stringify(menuId)}).pop();
    return !!img && !!pushed && img.src === pushed.dataUrl;`);
const stillShown = (app, tabId) => probe(app, `const widget = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});
    return !!(widget && widget.node.querySelector('img.pb-web-tab-still'));`);

async function freezeFrame({ app, pages, plant, fail, note }) {
    const url = pages.url('/still');
    const tabId = await openWebTab(app, url);
    if (await waitForPush(app, loadedAt(tabId, '/still')) < 0) {
        return fail('no loaded state push arrived for /still');
    }
    await makeCurrent(app, tabId);
    if (await settle(() => overlayVisibility(app, tabId), v => v === 'visible') !== 'visible') {
        return fail(`${BROKEN} the page is not shown`);
    }
    if (await installFreezeRecorder(app) !== true) {
        return fail(`${BROKEN} the freeze-frame recorder could not be installed in the Theia frame`);
    }
    let planted = false;
    if (plant === 'still-not-painted') {
        // The widget never paints a still; applied only once a still made its deadline in this session (noted below).
        planted = await probe(app, `let proto = Object.getPrototypeOf(get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}));
            while (proto && !Object.prototype.hasOwnProperty.call(proto, 'showStill')) proto = Object.getPrototypeOf(proto);
            if (!proto) return false;
            const neutral = function () {};
            neutral.__pbPlanted = true;
            proto.showStill = neutral;
            return get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).showStill.__pbPlanted === true;`) === true;
    }
    const page = await contextOf(app, url);
    const point = await centreOf(app, page, '#art');
    const menuMs = [];
    const stillMs = [];
    let noted = false;
    for (let i = 1; i <= FREEZE_OPENS; i++) {
        const where = `(open ${i} of ${FREEZE_OPENS})`;
        await settle(() => overlayVisibility(app, tabId), v => v === 'visible', 3000);
        const before = await freezeState(app);
        const started = Date.now();
        await clickAt(app, page, point.x, point.y, 2);
        const after = await settle(() => freezeState(app), s => s.shown.length > before.shown.length && s.pushes.slice(before.pushes.length).some(p => p.kind === 'pageContextMenu' && p.tabId === tabId), 5000);
        const menuPush = after?.pushes.slice(before.pushes.length).find(p => p.kind === 'pageContextMenu' && p.tabId === tabId);
        if (!menuPush || !(after.shown.length > before.shown.length)) {
            await closeMenu(app);
            return fail(`no pageContextMenu push with a visible .lm-Menu within 5 s ${where}`);
        }
        menuMs.push(after.shown[before.shown.length] - started);
        const still = after.pushes.slice(before.pushes.length).find(p => p.kind === 'pageStill' && p.tabId === tabId && p.menuId === menuPush.menuId);
        if (still) {
            stillMs.push(still.at - started);
            if (planted && !noted) {
                noted = true;
                note('PLANT still-not-painted applied');
            }
            if (await settle(() => overlayVisibility(app, tabId), v => v === 'hidden', 2000) !== 'hidden') {
                await closeMenu(app);
                return fail(`the overlay did not hide under the menu ${where}`);
            }
            if (await settle(() => stillPainted(app, tabId, menuPush.menuId), v => v === true, 1000) !== true) {
                await closeMenu(app);
                return fail(`a still arrived but was not painted on the placeholder while the menu was open ${where}`);
            }
        }
        await closeMenu(app);
        if (still && await settle(() => stillShown(app, tabId), v => v === false, 3000) !== false) {
            return fail(`the still stayed on the placeholder after the menu closed ${where}`);
        }
    }
    const p95 = percentile(menuMs, 95);
    console.log(`freeze-frame timing: menu p50 ${percentile(menuMs, 50)} p95 ${p95}, still ${stillMs.length}/${FREEZE_OPENS} within 50 ms`);
    if (stillMs.length) {
        note(`still arrival after the right-click: p50 ${percentile(stillMs, 50)} p95 ${percentile(stillMs, 95)} ms (n=${stillMs.length})`);
    }
    if (p95 > FREEZE_MENU_P95_MS) {
        return fail(`right-click to visible menu is ${p95} ms at p95 over ${FREEZE_OPENS} opens, above the ${FREEZE_MENU_P95_MS} ms budget`);
    }
}

const SCENARIOS = {
    'tooltip-status': tooltipStatus,
    'theia-hover-silent': theiaHoverSilent,
    'pip-close': pipClose,
    'context-menu': contextMenu,
    'menu-not-in-ide': menuNotInIde,
    'background-menu': backgroundMenu,
    'menu-page-tools': menuPageTools,
    'menu-edit': menuEdit,
    'menu-spelling': menuSpelling,
    'menu-save': menuSave,
    'extension-entry': extensionEntry,
    'freeze-frame': freezeFrame,
};

/** The scenario each absence scenario takes as its positive control. */
const CONTROL_OF = { 'theia-hover-silent': 'tooltip-status', 'menu-not-in-ide': 'context-menu', 'background-menu': 'context-menu' };

/** One session over `names`; returns `[{ name, failures, notes, notScored }]` or throws. */
async function runSession(names, plant = '') {
    assets = await serveAssets();
    referers.length = 0;
    const pages = await serveNavPages(PAGES);
    try {
        return await withProbeShell(async app => {
            const results = [];
            for (const name of names) {
                const result = { name, failures: [], notes: [], notScored: false };
                const ctx = {
                    app, pages, plant, results,
                    fail: reason => { result.failures.push(reason); },
                    note: text => { result.notes.push(text); },
                };
                try {
                    if (await SCENARIOS[name](ctx) === 'not-scored') {
                        result.notScored = true;
                    }
                } catch (error) {
                    result.failures.push(`harness: ${error.message}`);
                }
                results.push(result);
            }
            return results;
        });
    } finally {
        await pages.close();
        await assets.close();
        assets = null;
    }
}

function report(results) {
    let failed = 0;
    for (const r of results) {
        for (const n of r.notes) {
            console.log(`  ${r.name}: ${n}`);
        }
        if (r.notScored) {
            failed++;
            console.log(`${r.name}: NOT SCORED -- its positive control (${CONTROL_OF[r.name]}) did not pass in this session`);
        } else if (r.failures.length) {
            failed++;
            for (const f of r.failures) {
                console.error(f.startsWith('harness:') ? f : `${r.name}: FAIL -- ${f}`);
            }
        } else {
            console.log(`${r.name}: PASS`);
        }
    }
    return failed ? 1 : 0;
}

function selectedScenarios(args) {
    const i = args.indexOf('--scenario');
    if (i < 0) {
        return Object.keys(SCENARIOS);
    }
    const names = String(args[i + 1] ?? '').split(',').filter(Boolean);
    const unknown = names.filter(n => !SCENARIOS[n]);
    if (!names.length || unknown.length) {
        throw new Error(`unknown or empty --scenario list (${unknown.join(', ') || 'none given'}); known: ${Object.keys(SCENARIOS).join(', ')}`);
    }
    // Registry order, whatever order was asked for: a control runs before its absence scenario.
    return Object.keys(SCENARIOS).filter(n => names.includes(n));
}

const PLANTS = [
    { plant: 'tooltip-element-removed', target: 'tooltip-status', run: ['tooltip-status'], expect: 'page tooltip did not open' },
    { plant: 'overlink-unregistered', target: 'tooltip-status', run: ['tooltip-status'], expect: 'no overLink push' },
    { plant: 'theia-tooltip-leak', target: 'theia-hover-silent', run: ['tooltip-status', 'theia-hover-silent'], expect: 'the IDE hover opened the page tooltip' },
    { plant: 'status-over-page', target: 'tooltip-status', run: ['tooltip-status'], expect: 'status line intersects the page' },
    { plant: 'pip-shouldactivate-missing', target: 'pip-close', run: ['pip-close'], expect: 'Picture-in-Picture window is still open' },
    // 35-03 (PROMPT-04).
    { plant: 'stub-removed', target: 'context-menu', run: ['context-menu'], expect: 'no pageContextMenu push' },
    { plant: 'background-check-off', target: 'background-menu', run: ['context-menu', 'background-menu'], expect: 'a hidden tab opened a menu' },
    { plant: 'ide-menu-leak', target: 'menu-not-in-ide', run: ['context-menu', 'menu-not-in-ide'], expect: 'the IDE right-click pushed a page menu' },
    { plant: 'referrer-dropped', target: 'context-menu', run: ['context-menu'], expect: 'new tab request carried no Referer' },
    // 35-04 (PROMPT-04).
    { plant: 'inspect-no-select', target: 'menu-page-tools', run: ['menu-page-tools'], expect: 'inspector did not select the clicked node' },
    { plant: 'copy-row-unwired', target: 'menu-edit', run: ['menu-edit'], expect: 'copy did not reach the clipboard' },
    { plant: 'spellcheck-off', target: 'menu-spelling', run: ['menu-spelling'], expect: 'no suggestion row' },
    { plant: 'save-dialog-cancelled', target: 'menu-save', run: ['menu-save'], expect: 'no file at the chosen path' },
    // 35-05 (PROMPT-04, D-16, D-08).
    { plant: 'ext-cleanup-skipped', target: 'extension-entry', run: ['extension-entry'], expect: 'duplicate extension row' },
    { plant: 'ext-command-dropped', target: 'extension-entry', run: ['extension-entry'], expect: 'no onClicked request' },
    { plant: 'still-not-painted', target: 'freeze-frame', run: ['freeze-frame'], expect: 'a still arrived but was not painted' },
];

async function selfTest() {
    let failed = 0;
    try {
        const clean = await runSession(Object.keys(SCENARIOS));
        const red = clean.filter(r => r.failures.length || r.notScored);
        if (red.length) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- the clean control is not green: ${red.map(r => `${r.name}: ${r.failures.join(' | ') || 'not scored'}`).join('; ')}`);
        } else {
            console.log('  ok  clean control (no plant) -> green');
        }
    } catch (error) {
        console.error(`${NAME} --self-test: FAIL -- harness: the clean control could not be driven: ${error.message}`);
        return 1;
    }
    for (const c of PLANTS) {
        let results;
        try {
            results = await runSession(c.run, c.plant);
        } catch (error) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- harness: '${c.plant}' could not be driven: ${error.message}`);
            continue;
        }
        const target = results.find(r => r.name === c.target);
        const planted = results.some(r => r.notes.some(n => n === `PLANT ${c.plant} applied`));
        if (!target || !planted) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- '${c.plant}' never applied its fault (the plant site drifted), so a red or green here would mean nothing`);
            continue;
        }
        const scored = target.failures.filter(f => f.includes(c.expect) && !f.includes(BROKEN) && !f.startsWith('harness:'));
        if (scored.length) {
            console.log(`  ok  ${c.plant} -> red on ${c.target}, naming '${c.expect}'`);
            console.log(`      ${c.target}: FAIL -- ${scored[0]}`);
        } else {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- '${c.plant}' stayed green on ${c.target} or went red for another reason; got: ${target.failures.join(' | ') || (target.notScored ? 'not scored' : '(no failures at all)')}`);
        }
    }
    if (failed) {
        console.error(`${NAME} --self-test: FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- the clean control is green and all ${PLANTS.length} planted faults went red: ${PLANTS.map(c => c.plant).join(', ')}`);
    return 0;
}

async function main(args) {
    try {
        return report(await runSession(selectedScenarios(args)));
    } catch (error) {
        console.error(`harness: ${error.message}`);
        return 1;
    }
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(`Usage: node scripts/${NAME}.mjs [--scenario ${Object.keys(SCENARIOS).join(',')}] | --self-test`);
    process.exit(0);
}
process.exit(args.includes('--self-test') ? await selfTest() : await main(args));
