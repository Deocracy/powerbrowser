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
 *                       a title= span opens #remoteBrowserTooltip with its text,
 *                       compared exactly (a non-ASCII character included), and
 *                       a title="" span opens nothing over 1500 ms (39-05).
 *   link-status-clear   (39-07, 35 T19 WR-04) With the pointer resting on a link (the
 *                       status line shows it), Ctrl+Tab from the page to the next tab
 *                       clears the line though the pointer never moved; back on the
 *                       first tab, clicking the link and navigating clears it on the
 *                       new location, and it stays clear for 500 ms.
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
 *                       Stale dismissal (C11, 39-02): menu A's dismissal reply is held
 *                       800 ms, menu B opens inside it; 600 ms after A's reply lands
 *                       B is still open and keyboard focused, and when Escape closes
 *                       B (no pre-focus) the page takes focus only from B's own
 *                       dismissal, never earlier from A's. Then menu C's dismissal
 *                       is held until menu D's push and D renders 400 ms later: D
 *                       still opens keyboard focused (chrome drops a page focus
 *                       request while a page menu is pending).
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
 *   inspect-policy      (39-07, 35 T20 WR-06) With devtools.policy.disabled (the pref the
 *                       DisableDeveloperTools policy locks) set and read back, the element
 *                       menu has no Inspect row (control: the same menu offers it with
 *                       DevTools allowed). A menu that offered Inspect, picked after the
 *                       policy came on, is refused by chrome and shows
 *                       CHROME_BAR_COPY.pageMenuRowRefused, read from the tree. The pref
 *                       is restored at the end.
 *   menu-edit           (35-04) In a text field with a selected word: Undo, Cut, Copy,
 *                       Paste, Delete and Select All show with textActions.ftl labels;
 *                       Copy fills the clipboard, Paste into a second field sets it,
 *                       Undo removes the paste; on an image, Copy Image leaves an
 *                       image/png flavour on the clipboard.
 *   iframe-edit-rows    (39-06, 35 T17 CR-02) In a field inside a cross-origin iframe with a
 *                       selection: Cut, Copy, Paste, Delete and Select All are enabled; Copy
 *                       copies the frame's selection, Paste and Undo act on the frame's second
 *                       field, Select All selects the frame field's text, and Copy Image on the
 *                       frame's image leaves an image flavour on the clipboard.
 *   menu-spelling       (35-04) A spellcheck textarea holding "teh": the menu offers a
 *                       "the" suggestion row and picking it fixes the word; on "wrod",
 *                       Add to Dictionary drops it from the next menu's suggestions and
 *                       Undo Add brings them back.
 *   menu-save           (35-04) Save Link As on a link to a served file: Theia's save
 *                       dialog takes a path in a fresh temp directory; the file lands
 *                       with the served bytes, its GET carried the page's origin as
 *                       Referer, and a downloadsChanged row names it (Phase 32's panel).
 *   save-as-late        (39-06, 35 T16 CR-01) Save Link As answered 61 s after the pick lands the
 *                       file and a downloads row; a save whose dialog waits while a second page
 *                       menu opens (the dialog layer stepped aside for that right-click) still
 *                       lands; the same menu's save answered again (its one slot spent) writes
 *                       nothing and shows CHROME_BAR_COPY.saveTargetExpired.
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
 *   autocomplete        (35-06, PROMPT-06, D-03) A form-history entry seeded in chrome
 *                       scope for field name q; typing its first three characters into
 *                       a served q field with BiDi keys opens #PopupAutoComplete with a
 *                       row, anchored inside the overlay; ArrowDown and Enter commit the
 *                       entry; retyped, Escape closes the popup, leaves the value and
 *                       keeps focus in the page. Values are compared page-side only.
 *   saved-login         (35-06) One synthetic login (probe-user, a chrome-generated
 *                       password) for the served 127.0.0.1 origin in the disposable
 *                       profile; focusing the username field opens the popup with that
 *                       login's row; ArrowDown and Enter fill both fields (checked
 *                       page-side, never printed). It turns signon.rememberSignons back on:
 *                       the BiDi remote agent sets it false (39-06, C23).
 *   form-validation     (35-06, D-14) Submitting a form whose required field is empty
 *                       opens #invalid-form-popup with a non-empty message (needs
 *                       31.1's getTabForBrowser: FormValidationParent shows only for the
 *                       selected browser).
 *   paste-popup         (35-06, D-15, research probe 12) A page's
 *                       navigator.clipboard.readText() opens #clipboardReadPasteMenuPopup
 *                       whose item reads upstream's en-US text-action-paste label; once
 *                       security.dialog_enable_delay passes, doCommand on it resolves the
 *                       page's promise with the 15-character clipboard text.
 *   element-fullscreen  (35-07, PAGE-07, D-05, D-19) A served page's button calls
 *                       video.requestFullscreen(), clicked with BiDi input: the page's
 *                       fullscreenElement is the video, chrome's is the overlay and
 *                       window.fullScreen is true; #fullscreen-warning is :popover-open
 *                       with the domain text naming the served host and the exit button
 *                       reading upstream's en-US fullscreen-exit-button string. Esc
 *                       (chrome-scope key synthesis) clears the page's fullscreenElement,
 *                       closes the warning, drops the root inDOMFullscreen attribute and
 *                       returns the overlay to the widget placeholder's rect within 1 s.
 *                       Entered again, Ctrl+Tab from the page switches tabs and fullscreen
 *                       exits and stays off. The page menu's Full Screen row on the video
 *                       enters it; a right-click during fullscreen pushes no
 *                       pageContextMenu within 1500 ms (control: the row's own menu push
 *                       in this session); the warning's exit button leaves.
 *   pointer-lock-warning (39-06, 35 T18 WR-03) A page button's requestPointerLock opens
 *                       #pointerlock-warning reading upstream's en-US pointerlock-warning-domain
 *                       with the page's host; exitPointerLock closes it. Locked from fullscreen,
 *                       only #fullscreen-warning shows (1 s of reads; the first leg is the control).
 *   fullscreen-key      (35-07, D-07) With the overlay focused, F11 (chrome-scope key
 *                       synthesis) fires the fullscreen row and window.fullScreen becomes
 *                       true; F11 again restores it. Runs Phase 33's full-screen command.
 *   f11-keeps-debug     (35-07, KEY-04) With an untitled Theia editor focused, F11 fires
 *                       no fullscreen row and window.fullScreen stays false over 1500 ms.
 *                       Scored only when fullscreen-key passed (CONTROL_OF: the same fire
 *                       recorder).
 *
 * A self-test plant is a runtime mutation in its own session (a chrome-scope
 * or Theia-frame evaluate), never a file edit, and notes `PLANT <name>
 * applied` only after reading the mutation back.
 *
 * PB_CAPTURE_DIR=<dir> (39-07, 35 T12-T15): the session runs headed and
 * captureShell (scripts/lib/pb-kwin.mjs) writes 35-T12-menu.png (context-menu,
 * the link menu open), 35-T13-tooltip-edge.png and 35-T15-status-truncation.png
 * (tooltip-status: a title= element at the page's bottom-right corner, a long
 * link), and 35-T14-fullscreen-warning.png (element-fullscreen). Unset, nothing
 * is captured and nothing is scored differently. Needs the Bash sandbox off.
 */
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
    BROKEN,
    WEB_TAB_STATE_EVENT,
    chromeActiveTabId,
    firedRows,
    focusOverlay,
    focusTheiaFrame,
    installFireRecorder,
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
import { captureShell } from './lib/pb-kwin.mjs';

const MODES_ACTIVATE_COMMAND_ID = sourceConst('theia/extensions/modes/src/browser/modes-commands.ts', 'MODES_ACTIVATE_COMMAND_ID');

const NAME = 'verify-page-furniture-live';
// 39-05 (PROMPT-08 encoding): a non-ASCII character, compared exactly with the tooltip's label.
const TOOLTIP_TEXT = 'Furniture tooltip \u2014 caf\u00e9';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 39-07 (35 T12-T15): captures for the visual rows. A headless session has no window, so capturing runs headed.
const CAPTURE_DIR = process.env.PB_CAPTURE_DIR ? resolve(process.env.PB_CAPTURE_DIR) : '';
if (CAPTURE_DIR) {
    process.env.PB_LIVE_HEADED = '1';
}

/** PB_CAPTURE_DIR set: the PowerBrowser window (captureShell refuses any other active window) to <dir>/<file>. Unset: nothing. */
async function capture(note, file) {
    if (!CAPTURE_DIR) {
        return;
    }
    mkdirSync(CAPTURE_DIR, { recursive: true });
    const shot = await captureShell(join(CAPTURE_DIR, file));
    note(`capture ${file}: ${shot.resourceClass} ${shot.width}x${shot.height}`);
}

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
            + `<p><span id="tip" title="${TOOLTIP_TEXT}">Has a tooltip</span></p>`
            + '<p><span id="tip-empty" title="">Empty title</span></p>'
            // 39-07 captures (35 T13, T15): a long link for the status line, and a title= element in the page's bottom-right corner.
            + `<p><a id="longlink" href="/target?${'long-path-segment-'.repeat(24)}end">Long link</a></p>`
            + '<span id="tip-edge" title="Edge tooltip near the window corner" style="position: fixed; right: 2px; bottom: 2px">edge</span>',
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
    // 35-06: the form furniture targets.
    '/form': { title: 'Form', body: '<form action="/target"><input id="q" name="q" autocomplete="on"></form>' },
    '/login': {
        title: 'Login',
        body: '<form action="/target" method="post"><input id="user" name="username" autocomplete="username"> <input id="pass" type="password" name="password" autocomplete="current-password"> <button type="submit">Sign in</button></form>',
    },
    '/validate': { title: 'Validate', body: '<form action="/target"><input id="need" name="need" required> <button id="send" type="submit">Send</button></form>' },
    '/paste': {
        title: 'Paste',
        body: '<p><button id="read" type="button">Read clipboard</button></p>'
            + '<script>document.getElementById("read").addEventListener("click", () => navigator.clipboard.readText()'
            + '.then(text => { document.title = String(text.length); }, error => { document.title = "rejected: " + error.name; }));</script>',
    },
    // 35-07: element fullscreen from a page button (user activation) or the page menu's Full Screen row.
    '/fullscreen': {
        title: 'Fullscreen',
        body: '<style>body { font: 20px sans-serif; margin: 24px; }</style><p><button id="go" type="button">Full screen</button></p>'
            + '<canvas id="c" width="320" height="180" hidden></canvas><video id="v" width="320" height="180" muted autoplay></video>'
            + '<script>const c = document.getElementById("c"); const g = c.getContext("2d"); let n = 0;'
            + 'setInterval(() => { g.fillStyle = "hsl(" + (n++ % 360) + ",80%,50%)"; g.fillRect(0, 0, 320, 180); }, 33);'
            + 'const v = document.getElementById("v"); v.srcObject = c.captureStream(30); v.play();'
            + 'document.getElementById("go").addEventListener("click", () => v.requestFullscreen());</script>',
    },
    // 39-06 (35 T18 WR-03): pointer lock from a click, outside fullscreen and inside it.
    '/pointer': {
        title: 'Pointer',
        body: '<style>body { font: 20px sans-serif; margin: 24px; }</style><p><button id="lock" type="button">Lock</button> <button id="fs" type="button">Full screen and lock</button></p>'
            + '<script>document.getElementById("lock").addEventListener("click", () => document.body.requestPointerLock());'
            + 'document.getElementById("fs").addEventListener("click", () => document.documentElement.requestFullscreen().then(() => document.body.requestPointerLock()));</script>',
    },
    // 39-06 (35 T17 CR-02): an iframe from the asset server named as localhost: another site, so Fission puts it in another process.
    '/xframe': {
        title: 'Cross-origin frame',
        body: '<style>body { font: 20px sans-serif; margin: 24px; }</style><p id="outer">outer page</p>',
        extra: () => (assets ? `<iframe id="xf" src="${FRAME_EDIT_URL()}" width="420" height="220"></iframe>` : ''),
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

/**
 * Moves the pointer to the centre of `selector` in `context`, whose <browser> in the shell is the chrome
 * expression `frame`. The move is synthesised at the shell window, as real input arrives: chrome sees the
 * mouseover on that <browser> (what setOverLink reads), then the page does. BiDi input on `context` is
 * synthesised in the content process, so chrome never sees it (27-RESEARCH Pitfall P11), and BiDi refuses
 * pointer input on the chrome context.
 */
async function pointerOnto(app, context, selector, frame) {
    const box = JSON.parse(await app.evaluateIn(context, `JSON.stringify((() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })())`));
    if (!box) {
        throw new Error(`${BROKEN} no ${selector} in the page`);
    }
    const moved = await inChrome(app, `const b = ${frame}; if (!b) return 'no shell <browser>';
        try {
            const r = b.getBoundingClientRect();
            window.synthesizeMouseEvent('mousemove', r.left + ${box.x}, r.top + ${box.y});
            return true;
        } catch (e) {
            return String(e);
        }`);
    if (moved !== true) {
        throw new Error(`${BROKEN} the pointer could not be moved onto ${selector}: ${moved}`);
    }
}
const overlayFrame = tabId => `overlayOf(${JSON.stringify(tabId)})`;
const THEIA_FRAME = `document.getElementById('powerbrowser-content')`;

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
    if (plant === 'tooltip-drag-lookup-throws') {
        // C22 (39-05): restores upstream's unguarded drag-service lookup, which throws in a headless shell (no drag service).
        const read = await inChrome(app, `const X = window.XULBrowserWindow;
            const fixed = X.showTooltip;
            const planted = function () {
                Cc['@mozilla.org/widget/dragservice;1'].getService(Ci.nsIDragService).getCurrentSession();
                return fixed.apply(this, arguments);
            };
            planted.__pbPlanted = true;
            X.showTooltip = planted;
            return X.showTooltip.__pbPlanted === true;`);
        if (read === true) {
            note('PLANT tooltip-drag-lookup-throws applied');
        }
    }
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
            await pointerOnto(app, context, '#link', overlayFrame(tabId));
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
            await pointerOnto(app, context, '#plain', overlayFrame(tabId));
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
        await pointerOnto(app, context, '#tip', overlayFrame(tabId));
        const tip = await settle(() => tooltipState(app), t => !!t && t.state === 'open', 3000);
        if (!tip || tip.state !== 'open') {
            return fail(`page tooltip did not open with ${JSON.stringify(TOOLTIP_TEXT)} within 3 s; saw ${JSON.stringify(tip)}`);
        }
        if (tip.label !== TOOLTIP_TEXT) {
            return fail(`tooltip text differs from the page title: ${JSON.stringify(tip.label)}, want ${JSON.stringify(TOOLTIP_TEXT)}`);
        }
        await pointerOnto(app, context, '#plain', overlayFrame(tabId));
        if ((await settle(() => tooltipState(app), t => !!t && t.state === 'closed', 3000))?.state !== 'closed') {
            return fail(`${BROKEN} the page tooltip did not close off the title, so the empty-title leg would prove nothing`);
        }
        // PROMPT-08 empty: title="" opens nothing. The #tip leg above is this leg's positive control; 1500 ms covers ui.tooltip.delay_ms.
        await pointerOnto(app, context, '#tip-empty', overlayFrame(tabId));
        const deadline = Date.now() + 1500;
        while (Date.now() < deadline) {
            if ((await tooltipState(app))?.state === 'open') {
                return fail('an empty title opened the page tooltip');
            }
            await sleep(100);
        }
        await pointerOnto(app, context, '#plain', overlayFrame(tabId));
        if (CAPTURE_DIR) {
            // 35 T15, then T13, in Browsing, where the page takes the main area.
            await toMode(app, 'browsing');
            await makeCurrent(app, tabId);
            await settle(() => overlayVisibility(app, tabId), v => v === 'visible');
            await app.evaluateIn(context, `document.getElementById('longlink').scrollIntoView({ block: 'center' }); true`);
            await pointerOnto(app, context, '#longlink', overlayFrame(tabId));
            await settle(() => statusGeometry(app, tabId), g => !!g.status?.text, 3000);
            await capture(note, '35-T15-status-truncation.png');
            await pointerOnto(app, context, '#tip-edge', overlayFrame(tabId));
            await settle(() => tooltipState(app), t => t?.state === 'open', 3000);
            note(`tip-edge: the page's corner is ${await inChrome(app, `const r = overlayOf(${JSON.stringify(tabId)}).getBoundingClientRect(); return JSON.stringify({ right: Math.round(window.innerWidth - r.right), bottom: Math.round(window.innerHeight - r.bottom) });`)} px from the window's edges`);
            await capture(note, '35-T13-tooltip-edge.png');
            await app.evaluateIn(context, 'scrollTo(0, 0); true');
            await pointerOnto(app, context, '#plain', overlayFrame(tabId));
        }
    } finally {
        await toMode(app, 'coding');
    }
}

async function applyLinkStatusPlants(app, plant, note) {
    if (plant === 'status-clear-pointer-only') {
        // WR-04's defect: chrome cleared the line only when the pointer left a link (setOverLink('') or a mouseover off
        // every overlay). The tab-switch and location-change clears live in the boundary's private state, so the plant
        // drops, at the push, every overLink clear that no pointer event caused.
        const read = await inChrome(app, `const P = ChromeUtils.importESModule('chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs').PowerBrowserGroupParent;
            const X = window.XULBrowserWindow;
            let pointerClear = false;
            const setOverLink = X.setOverLink;
            X.setOverLink = function (url) { if (!url) { pointerClear = true; } return setOverLink.apply(this, arguments); };
            document.addEventListener('mouseover', event => { if (W.tabIdOfBrowser(event.target) === null) { pointerClear = true; } }, true);
            const send = P.prototype.sendAsyncMessage;
            const planted = function (name, data) {
                if (name === 'PowerBrowserWebTabState' && data && data.kind === 'overLink') {
                    const caused = pointerClear;
                    pointerClear = false;
                    if (data.url === '' && !caused) {
                        return undefined;
                    }
                }
                return send.apply(this, arguments);
            };
            planted.__pbPlanted = true;
            P.prototype.sendAsyncMessage = planted;
            return P.prototype.sendAsyncMessage.__pbPlanted === true;`);
        if (read === true) {
            note('PLANT status-clear-pointer-only applied');
        }
    }
}

const statusText = async (app, tabId) => (await statusGeometry(app, tabId)).status?.text ?? '';

async function linkStatusClear({ app, pages, plant, fail, note }) {
    await applyLinkStatusPlants(app, plant, note);
    // The page first, then the next tab after it in the strip, so Ctrl+Tab from the page lands on the plain page.
    const tab = await openPage(app, pages, '/furniture');
    if (typeof tab === 'string') {
        return fail(tab);
    }
    const next = await openPage(app, pages, '/frame');
    if (typeof next === 'string') {
        return fail(next);
    }
    const hoverLink = async () => {
        await makeCurrent(app, tab.tabId);
        await settle(() => overlayVisibility(app, tab.tabId), v => v === 'visible');
        await pointerOnto(app, tab.page, '#plain', overlayFrame(tab.tabId));
        await settle(() => statusText(app, tab.tabId), t => !t, 3000);
        await pointerOnto(app, tab.page, '#link', overlayFrame(tab.tabId));
        return settle(() => statusText(app, tab.tabId), t => t.endsWith('/target'));
    };

    // 1. A keyboard tab switch with the pointer resting on the link.
    const shown = await hoverLink();
    if (!shown.endsWith('/target')) {
        return fail(`${BROKEN} the status line never showed the link (${JSON.stringify(shown)}), so its clearing would prove nothing`);
    }
    if (!await focusOverlay(app, tab.tabId)) {
        return fail(`${BROKEN} the page could not be focused for the keyboard tab switch`);
    }
    await pressKey(app, CTRL_TAB);
    if (await settle(() => currentTabId(app), id => id === next.tabId, 5000) !== next.tabId) {
        return fail(`${BROKEN} Ctrl+Tab from the page did not switch to the next tab`);
    }
    const afterSwitch = await settle(() => statusText(app, tab.tabId), t => !t, 3000);
    if (afterSwitch) {
        return fail(`status line kept a link after a tab switch: it still reads ${JSON.stringify(afterSwitch)} over another tab`);
    }

    // 2. Back on the page, the pointer on the link again, a click navigates.
    if (!(await hoverLink()).endsWith('/target')) {
        return fail(`${BROKEN} the status line did not show the link again on the first tab`);
    }
    const mark = (await pushes(app)).length;
    const link = await centreOf(app, tab.page, '#link');
    await clickAt(app, tab.page, link.x, link.y);
    if (await waitForPush(app, loadedAt(tab.tabId, '/target'), { from: mark, timeoutMs: 10000 }) < 0) {
        return fail(`${BROKEN} clicking the link did not load /target`);
    }
    let afterNav = await settle(() => statusText(app, tab.tabId), t => !t, 3000);
    if (!afterNav) {
        await sleep(500);
        afterNav = await statusText(app, tab.tabId);
    }
    if (afterNav) {
        return fail(`status line kept a link after navigation: it reads ${JSON.stringify(afterNav)} on the new location`);
    }
    note('cleared on the keyboard tab switch and on the link\'s navigation');
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
            await pointerOnto(app, theia, selector, THEIA_FRAME);
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

const FRAME_EDIT_URL = () => assets.url('/frame-edit').replace('//127.0.0.1:', '//localhost:');
const FRAME_EDIT_HTML = '<!doctype html><title>Frame edit</title><body style="font: 20px sans-serif; margin: 8px">'
    + '<p><input id="f" value="gamma delta"> <input id="f2" value=""></p><p><img id="fimg" src="/pixel.png" width="64" height="64" alt="pixel"></p></body>';

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
        if (request.url === '/frame-edit') {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(FRAME_EDIT_HTML);
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

/** A CHROME_BAR_COPY `key: (subject: string) => ...` string with appSubject()'s subject (the name, else noAppName). */
function subjectCopy(key, appName) {
    const copy = readTree('theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts');
    const template = new RegExp(`${key}: \\(subject: string\\) => \`\\$\\{subject\\}([^\`]*)\``).exec(copy)?.[1];
    const noAppName = /noAppName: '([^']+)'/.exec(copy)?.[1];
    if (!template || !noAppName) {
        throw new Error(`${BROKEN} no ${key} or noAppName in chrome-bar-copy.ts`);
    }
    return `${appName || noAppName}${template}`;
}
const refusalLabel = appName => subjectCopy('pageMenuRefusedLink', appName);

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

/** The open root .lm-Menu's rows in the Theia frame, separators left out (Lumino renders one before the first group), or null when no menu is open. */
const menuRows = (app, level = 0) => app.evaluate(`JSON.stringify((() => {
    const menu = document.querySelectorAll('.lm-Menu')[${level}];
    if (!menu) return null;
    return [...menu.querySelectorAll('.lm-Menu-item:not([data-type="separator"])')].map(item => {
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
    // Scrolled into view first: Coding's main area (the mode tooltip-status ends in) is shorter than the /menu and /tools pages.
    const box = JSON.parse(await app.evaluateIn(context, `JSON.stringify((() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 20), y: r.top + r.height / 2 }; })())`));
    if (!box) {
        throw new Error(`${BROKEN} no ${selector} in the page`);
    }
    return box;
}

const ESCAPE = { key: 'Escape', code: 'Escape', keyCode: 27 };

/**
 * Closes whatever .lm-Menu is open and waits until none is. No pre-focus: the product ignores a stale dismissal
 * (C11, 39-02), so the open menu keeps keyboard focus and the Escape reaches it directly.
 */
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
// The main area's current tab, as makeCurrent waits for it; the shell's currentWidget is null while the page has focus.
const currentTabId = app => probe(app, `return get('ApplicationShell').mainPanel.currentTitle?.owner?.tabId ?? null;`);

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
        // The pref lets ContextMenuChild past Theia's own preventDefault on the right-click (ContextMenuChild.sys.mjs:556-569).
        const read = await inChrome(app, `const frame = document.getElementById('powerbrowser-content');
            Services.prefs.setBoolPref('dom.event.contextmenu.enabled', false);
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
    if (plant === 'stale-dismiss-focus') {
        // C11 (39-02): the latest-menu guard is gone, so every dismissal hands the page focus however late it lands.
        if (await probe(app, `const menu = get('PageContextMenuContribution');
            const planted = function (widget) { widget.focusPage(); };
            planted.__pbPlanted = true;
            menu.focusPageIfLatest = planted;
            return menu.focusPageIfLatest.__pbPlanted === true;`) === true) {
            note('PLANT stale-dismiss-focus applied');
        }
    }
    if (plant === 'stale-focus-unguarded') {
        // C11 (39-02): chrome focuses the page on every webTabFocus, even one sent before the newest menu rendered.
        if (await inChrome(app, `const P = ChromeUtils.importESModule('chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs').PowerBrowserGroupParent;
            const receive = P.prototype.receiveMessage;
            const planted = function (message) {
                const o = message && message.name === 'PowerBrowserGroupMutation' && message.data && message.data.kind === 'webTabFocus' ? overlayOf(message.data.tabId) : null;
                if (o) {
                    o.focus();
                    return Promise.resolve({ ok: true, kind: 'webTabFocus', where: 'done' });
                }
                return receive.call(this, message);
            };
            planted.__pbPlanted = true;
            P.prototype.receiveMessage = planted;
            return P.prototype.receiveMessage.__pbPlanted === true;`) === true) {
            note('PLANT stale-focus-unguarded applied');
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
    // The shim keeps only a shown overlay's menu, and chrome shows the page again a frame or more after the last menu closed.
    await settle(() => overlayVisibility(app, tabId), v => v === 'visible');
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

const STALE_DISMISSAL = 'a stale dismissal moved focus off the open menu';

/** True when chrome's focus is on the Theia frame and the Theia frame's focus is inside the open .lm-Menu. */
const menuFocused = async app => await inChrome(app, `return document.activeElement === ${THEIA_FRAME};`) === true
    && await app.evaluate(`!!document.activeElement && !!document.activeElement.closest('.lm-Menu')`) === true;

/**
 * Holds the dismissal reply of menu `menuId` for `ms` on the PageContextMenuContribution singleton; the request
 * itself leaves at once, so chrome closes the menu on time and only the frontend's reaction is late. Harness only:
 * restored by releaseDismissal.
 */
const holdDismissal = (app, menuId, ms) => probe(app, `const menu = get('PageContextMenuContribution');
    const send = window.__pbHeldSend ?? menu.send;
    window.__pbHeldSend = send;
    window.__pbHeldLanded = false;
    const held = function (tabId, id, itemId, path) {
        const sent = send.call(this, tabId, id, itemId, path);
        if (itemId !== null || id !== ${Number(menuId)}) {
            return sent;
        }
        const land = () => { window.__pbHeldLanded = true; };
        return sent.then(reply => sleep(${Number(ms)}).then(() => { land(); return reply; }), error => sleep(${Number(ms)}).then(() => { land(); throw error; }));
    };
    held.__pbHeld = true;
    menu.send = held;
    return menu.send.__pbHeld === true;`);

/**
 * Holds the dismissal reply of menu `menuId` until the next menu's push arrives, and renders that menu `ms` later:
 * the stale reply lands after chrome focused the Theia frame for the new menu but before the frontend shows it.
 */
const holdUntilNextMenu = (app, menuId, ms) => probe(app, `const menu = get('PageContextMenuContribution');
    const send = window.__pbHeldSend ?? menu.send;
    window.__pbHeldSend = send;
    window.__pbHeldLanded = false;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const held = function (tabId, id, itemId, path) {
        const sent = send.call(this, tabId, id, itemId, path);
        if (itemId !== null || id !== ${Number(menuId)}) {
            return sent;
        }
        const land = () => { window.__pbHeldLanded = true; };
        return sent.then(reply => gate.then(() => { land(); return reply; }), error => gate.then(() => { land(); throw error; }));
    };
    held.__pbHeld = true;
    menu.send = held;
    const late = function (detail) {
        delete menu.open;
        release();
        setTimeout(() => menu.open(detail), ${Number(ms)});
    };
    late.__pbHeld = true;
    menu.open = late;
    return menu.send.__pbHeld === true && menu.open.__pbHeld === true;`);

const releaseDismissal = app => probe(app, `const menu = get('PageContextMenuContribution');
    if (window.__pbHeldSend) { menu.send = window.__pbHeldSend; }
    delete window.__pbHeldSend;
    if (menu.open.__pbHeld) { delete menu.open; }
    return menu.send.__pbHeld !== true && menu.open.__pbHeld !== true;`);

const heldLanded = app => probe(app, 'return window.__pbHeldLanded === true;');

/**
 * C11 (39-02): menu B opened inside menu A's dismissal round trip keeps keyboard focus, and the page takes focus
 * when B closes only from B's own dismissal. Returns a failure reason, or null.
 */
async function staleDismissal(app, page, tabId) {
    const point = await centreOf(app, page, '#blank');
    const a = await openMenuAt(app, page, tabId, point);
    if (!a.push) {
        return `no pageContextMenu push for ${tabId} after a right-click on the blank area`;
    }
    if (!a.ms) {
        return 'the blank area\'s pageContextMenu push showed no .lm-Menu in the Theia frame';
    }
    try {
        if (await holdDismissal(app, a.push.menuId, 800) !== true) {
            return `${BROKEN} the dismissal hold could not be installed on PageContextMenuContribution`;
        }
        await pressKey(app, ESCAPE);
        if (await settle(() => menuRows(app), rows => rows === null, 3000) !== null) {
            return `${BROKEN} Escape did not close menu A`;
        }
        const b = await openMenuAt(app, page, tabId, point);
        if (!b.push || !b.ms) {
            return `${BROKEN} menu B for the stale-dismissal leg did not open`;
        }
        if (await heldLanded(app)) {
            return `${BROKEN} menu A's dismissal landed before menu B opened, so the race was not reproduced`;
        }
        if (await settle(() => heldLanded(app), v => v === true, 3000) !== true) {
            return `${BROKEN} menu A's held dismissal never landed`;
        }
        await sleep(600);
        if (await menuRows(app) === null || !await menuFocused(app)) {
            return `${STALE_DISMISSAL} (menu B is closed or unfocused 600 ms after menu A's dismissal landed)`;
        }
        // The widget holds a page focus until the menu hides; a stale one would fire when B closes, before B's own dismissal.
        if (await probe(app, `return get('WebTabChannel').widgetOf(${JSON.stringify(tabId)})?.focusWanted === true;`) === true) {
            return `${STALE_DISMISSAL} (menu A's dismissal queued a page focus while menu B is open)`;
        }
        // B's own dismissal is held too: the page may take focus only when it lands, never as A's leftover.
        if (await holdDismissal(app, b.push.menuId, 1500) !== true) {
            return `${BROKEN} the dismissal hold could not be re-armed for menu B`;
        }
        await pressKey(app, ESCAPE);
        if (await settle(() => menuRows(app), rows => rows === null, 3000) !== null) {
            return `${STALE_DISMISSAL} (Escape with no pre-focus did not reach menu B)`;
        }
        await sleep(500);
        if (await heldLanded(app) !== true && await chromeActiveTabId(app) === tabId) {
            return `${STALE_DISMISSAL} (the page took focus when menu B closed, before menu B's own dismissal landed)`;
        }
        if (await settle(() => heldLanded(app), v => v === true, 3000) !== true) {
            return `${BROKEN} menu B's held dismissal never landed`;
        }
        if (await settle(() => chromeActiveTabId(app), id => id === tabId, 3000) !== tabId) {
            return 'menu B closed with no row run and the page did not get focus back';
        }
    } finally {
        await releaseDismissal(app);
    }
    // Menu C's dismissal lands after chrome focused the Theia frame for menu D and before D renders: chrome drops it.
    const c = await openMenuAt(app, page, tabId, point);
    if (!c.push || !c.ms) {
        return `${BROKEN} menu C for the stale-dismissal leg did not open`;
    }
    try {
        if (await holdUntilNextMenu(app, c.push.menuId, 400) !== true) {
            return `${BROKEN} the pre-render hold could not be installed on PageContextMenuContribution`;
        }
        await pressKey(app, ESCAPE);
        if (await settle(() => menuRows(app), rows => rows === null, 3000) !== null) {
            return `${BROKEN} Escape did not close menu C`;
        }
        const d = await openMenuAt(app, page, tabId, point);
        if (!d.push || !d.ms) {
            return `${BROKEN} menu D for the stale-dismissal leg did not open`;
        }
        if (await settle(() => heldLanded(app), v => v === true, 3000) !== true) {
            return `${BROKEN} menu C's held dismissal never landed`;
        }
        await sleep(600);
        if (await menuRows(app) === null || !await menuFocused(app)) {
            return `${STALE_DISMISSAL} (menu D is closed or unfocused after menu C's dismissal landed before D rendered)`;
        }
        await pressKey(app, ESCAPE);
        if (await settle(() => menuRows(app), rows => rows === null, 3000) !== null) {
            return `${STALE_DISMISSAL} (Escape with no pre-focus did not reach menu D)`;
        }
        return null;
    } finally {
        await releaseDismissal(app);
    }
}

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
    // Inspect Accessibility Properties: upstream's showInspectA11Y (nsContextMenu.sys.mjs:846-854), read in the same session.
    if (inspect.length && await inChrome(app, `return Services.prefs.getBoolPref('devtools.accessibility.enabled', false) && Services.prefs.getBoolPref('devtools.enabled', true)
        && (Services.prefs.getBoolPref('devtools.everOpened', false) || ChromeUtils.importESModule('chrome://devtools-startup/content/DevToolsShim.sys.mjs').DevToolsShim.isDevToolsUser());`) === true) {
        inspect.push('inspectA11y');
    }
    const pageNames = ['navigation', 'reload', 'bookmarkPage', 'savePage', 'selectAll', 'viewSource', ...inspect];
    const linkNames = ['openLink', 'copyLink', ...(strip ? ['stripOnShare'] : []), 'search', ...inspect];
    const targets = [
        { name: 'link', selector: '#link', when: ['saveLink', ...linkNames] },
        { name: 'javascript link', selector: '#jslink', when: linkNames, refused: true },
        { name: 'image', selector: '#img', when: ['viewImage', 'saveImage', 'copyImageContents', 'copyImage', ...inspect] },
        { name: 'video', selector: '#v', when: ['mediaPause', 'mediaUnmute', 'onMedia', 'videoFullscreen', 'mediaShowControls', 'onVideo', ...inspect] },
        { name: 'selection', selector: '#words', when: ['search', 'copy', 'selectAll', ...inspect], select: true },
        { name: 'frame', selector: '#frame', when: [...pageNames, 'inFrame', 'frameTarget', 'frameSource'] },
        { name: 'blank', selector: '#blank', when: pageNames },
    ];
    // First, so a stale-dismissal plant goes red here and not by chance in the target loop's own menu changes.
    const stale = await staleDismissal(app, page, tabId);
    if (stale) {
        return fail(stale);
    }
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
        if (target.name === 'blank') {
            await capture(note, '35-T12-menu.png');
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
    // Coding shows the main area's own tab bar; Browsing hides it for the tab strip (Phase 36).
    if (await toMode(app, 'coding') !== true) {
        return fail(`${BROKEN} Coding could not be reached for the IDE tab bar`);
    }
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
async function openPage(app, pages, path) {
    const url = pages.url(path);
    const tabId = await openWebTab(app, url);
    if (await waitForPush(app, loadedAt(tabId, path)) < 0) {
        return `no loaded state push arrived for ${path}`;
    }
    await makeCurrent(app, tabId);
    if (await settle(() => overlayVisibility(app, tabId), v => v === 'visible') !== 'visible') {
        return `${BROKEN} the ${path} page is not shown`;
    }
    const page = (await app.contexts()).filter(c => c.url === url).at(-1)?.context;
    if (!page) {
        return `${BROKEN} no BiDi context for the ${path} page`;
    }
    return { tabId, page, theia: await contextOf(app, await app.evaluate('location.href')), url };
}
const openTools = (app, pages) => openPage(app, pages, '/tools');

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
        // The inspector's node selection is a no-op: the toolbox opens on the inspector, no node is selected.
        if (await inChrome(app, `const { require } = ChromeUtils.importESModule('resource://devtools/shared/loader/Loader.sys.mjs');
            const Selection = require('devtools/client/framework/selection');
            const noop = function () {};
            noop.__pbPlanted = true;
            Selection.prototype.setNodeFront = noop;
            return Selection.prototype.setNodeFront.__pbPlanted === true;`) === true) {
            note('PLANT inspect-no-select applied');
        }
    }
    if (plant === 'copy-row-unwired') {
        // The Copy row's pick never reaches chrome (runs: "chrome", so settle is too late to drop it): the frontend sends a dismiss.
        if (await probe(app, `const menu = get('PageContextMenuContribution');
            const send = menu.send;
            const planted = function (tabId, menuId, itemId, path) { return send.call(this, tabId, menuId, itemId === 'context-copy' ? null : itemId, path); };
            planted.__pbPlanted = true;
            menu.send = planted;
            return menu.send.__pbPlanted === true;`) === true) {
            note('PLANT copy-row-unwired applied');
        }
    }
    if (plant === 'copy-image-html-only') {
        // C24 (39-05): every Controllers actor sends Copy Image as Copy Image Link, so the pick writes text and no image.
        if (await inChrome(app, `const { ControllersParent } = ChromeUtils.importESModule('resource://gre/actors/ControllersParent.sys.mjs');
            const doCommand = ControllersParent.prototype.doCommand;
            const planted = function (cmd) { return doCommand.call(this, cmd === 'cmd_copyImage' ? 'cmd_copyImageLocation' : cmd); };
            planted.__pbPlanted = true;
            ControllersParent.prototype.doCommand = planted;
            return ControllersParent.prototype.doCommand.__pbPlanted === true;`) === true) {
            note('PLANT copy-image-html-only applied');
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
        // By browserId, as webTabCloseToolbox matches it: getToolboxForTab reads descriptorFront.localTab, never set for a host <hbox>.
        const toolbox = tab && DevToolsShim.isInitialized() ? DevToolsShim.getToolboxes().find(t => t.commands?.descriptorFront?.browserId === o.browserId) : null;
        const node = toolbox?.getPanel('inspector')?.selection?.nodeFront;
        return node ? node.getAttribute('id') : null;`), v => v === INSPECT_ID, 10000);
    if (selected !== INSPECT_ID) {
        return fail(`the inspector did not select the clicked node (selected id ${JSON.stringify(selected)})`);
    }
    // The toolbox is a window of its own and keeps the OS focus, which later scenarios need on the shell (the inline spell checker).
    await inChrome(app, `const o = overlayOf(${JSON.stringify(tools.tabId)});
        const { DevToolsShim } = ChromeUtils.importESModule('chrome://devtools-startup/content/DevToolsShim.sys.mjs');
        const toolbox = DevToolsShim.getToolboxes().find(t => t.commands?.descriptorFront?.browserId === o?.browserId);
        return (toolbox ? toolbox.destroy() : Promise.resolve()).then(() => { window.focus(); return true; });`);

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

async function applyInspectPolicyPlants(app, plant, note) {
    if (plant === 'inspect-offered-unchecked') {
        // WR-06's defect: the menu offered Inspect where the action (webTabDevtoolsReply) refuses it. The facts are the
        // boundary's private state, so the plant gives the menu that defect pushed: the Inspect row a menu pushed earlier
        // in this session is put back into any menu that lacks it.
        if (await probe(app, `const menu = get('PageContextMenuContribution');
            const open = menu.open;
            let inspect = null;
            const planted = function (detail) {
                const items = Array.isArray(detail && detail.items) ? detail.items : [];
                const found = items.find(item => item && item.id === 'context-inspect');
                if (found) {
                    inspect = found;
                } else if (inspect) {
                    detail = { ...detail, items: [...items, inspect] };
                }
                return open.call(this, detail);
            };
            planted.__pbPlanted = true;
            menu.open = planted;
            return menu.open.__pbPlanted === true;`) === true) {
            note('PLANT inspect-offered-unchecked applied');
        }
    }
}

const DEVTOOLS_POLICY_PREF = 'devtools.policy.disabled';

async function inspectPolicy({ app, pages, plant, fail, note }) {
    await applyInspectPolicyPlants(app, plant, note);
    const tools = await openTools(app, pages);
    if (typeof tools === 'string') {
        return fail(tools);
    }
    const inspect = ftlLabel('main-context-menu-inspect');
    const setPolicy = on => inChrome(app, `Services.prefs.setBoolPref(${JSON.stringify(DEVTOOLS_POLICY_PREF)}, ${on}); return Services.prefs.getBoolPref(${JSON.stringify(DEVTOOLS_POLICY_PREF)}) === ${on};`);
    const elementMenu = async () => {
        await settle(() => overlayVisibility(app, tools.tabId), v => v === 'visible');
        const opened = await openMenuAt(app, tools.page, tools.tabId, await centreOf(app, tools.page, `#${INSPECT_ID}`));
        return opened.push && opened.ms ? (await menuRows(app)) ?? [] : null;
    };
    const offers = rows => !!rows && rows.some(r => r.label === inspect);
    try {
        // Control: with DevTools allowed the same menu offers Inspect, so its absence below is the policy's doing.
        if (!offers(await elementMenu())) {
            return fail(`${BROKEN} the element menu offers no Inspect row with DevTools allowed`);
        }
        await closeMenu(app);

        // 1. The policy on: no Inspect row.
        if (await setPolicy(true) !== true) {
            return fail(`${BROKEN} ${DEVTOOLS_POLICY_PREF} did not read back true`);
        }
        const underPolicy = await elementMenu();
        if (!underPolicy) {
            return fail(`${BROKEN} no page menu opened on the element under the policy`);
        }
        if (offers(underPolicy)) {
            return fail(`Inspect row shown under the DevTools policy; rows ${JSON.stringify(underPolicy.map(r => r.label))}`);
        }
        await closeMenu(app);

        // 2. A row the menu offered, refused by chrome at the pick: the policy comes on while the menu is open.
        if (await setPolicy(false) !== true) {
            return fail(`${BROKEN} ${DEVTOOLS_POLICY_PREF} did not read back false`);
        }
        const refused = subjectCopy('pageMenuRowRefused', await app.evaluate(appNameExpr));
        const before = (await notificationTexts(app)).filter(t => t === refused).length;
        if (!offers(await elementMenu())) {
            return fail(`${BROKEN} the element menu offers no Inspect row once the policy is off again`);
        }
        if (await setPolicy(true) !== true) {
            return fail(`${BROKEN} ${DEVTOOLS_POLICY_PREF} did not read back true with the menu open`);
        }
        if (!await pickRow(app, tools.theia, inspect)) {
            return fail(`${BROKEN} the offered Inspect row could not be picked`);
        }
        const shown = await settle(() => notificationTexts(app), texts => texts.filter(t => t === refused).length > before, 5000);
        if (!shown || shown.filter(t => t === refused).length <= before) {
            return fail(`a refused row was silent: no ${JSON.stringify(refused)}; notifications ${JSON.stringify(shown)}`);
        }
        note('no Inspect row under the policy; the refused Inspect pick said so');
    } finally {
        await closeMenu(app).catch(() => {});
        await setPolicy(false);
    }
}

async function menuEdit({ app, pages, plant, fail, note }) {
    await applyPageToolPlants(app, plant, note);
    const tools = await openTools(app, pages);
    if (typeof tools === 'string') {
        return fail(tools);
    }
    // "alpha": centreOf's point (20 px in) lies inside it, and a right-click outside a field's selection collapses it to the caret.
    await app.evaluateIn(tools.page, `const f = document.getElementById('field'); f.focus(); f.setSelectionRange(0, 5); true`);
    const opened = await openMenuAt(app, tools.page, tools.tabId, await centreOf(app, tools.page, '#field'));
    if (!opened.push) {
        return fail('no pageContextMenu push for the text field');
    }
    const labels = (opened.rows ?? []).map(r => r.label);
    const missing = ['text-action-undo', 'text-action-cut', 'text-action-copy', 'text-action-paste', 'text-action-delete', 'text-action-select-all'].map(ftlLabel).filter(label => !labels.includes(label));
    if (missing.length) {
        return fail(`the text field menu lacks ${missing.join(', ')}; rows ${JSON.stringify(labels)}`);
    }
    // A sentinel first: the system clipboard outlives the session, so an earlier "alpha" cannot pass for this copy.
    await inChrome(app, `Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString('pb-sentinel'); return true;`);
    if (!await pickRow(app, tools.theia, ftlLabel('text-action-copy'))) {
        return fail('the text field menu has no Copy row to pick');
    }
    if (await settle(() => clipboardText(app), t => t === 'alpha', 3000) !== 'alpha') {
        return fail('copy did not reach the clipboard');
    }
    await app.evaluateIn(tools.page, `document.getElementById('field2').focus(); true`);
    if (!await pickFromMenu(app, tools, '#field2', ftlLabel('text-action-paste'))) {
        return fail('the second field has no Paste row to pick');
    }
    const fieldValue = () => app.evaluateIn(tools.page, `document.getElementById('field2').value`);
    if (await settle(fieldValue, v => v === 'alpha', 3000) !== 'alpha') {
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
    // C24 (39-05): ask for every image flavour Gecko writes. A headless widget keeps only text/plain and text/html
    // (widget/headless/HeadlessClipboard.cpp), so the read uses the clipboard cache: the transferable Copy Image handed over.
    await inChrome(app, `Services.prefs.setBoolPref('widget.clipboard.use-cached-data.enabled', true); return true;`);
    const image = await settle(() => inChrome(app, `return Services.clipboard.hasDataMatchingFlavors(${JSON.stringify(IMAGE_FLAVOURS)}, Services.clipboard.kGlobalClipboard);`), v => v === true, 3000);
    if (image !== true) {
        return fail('Copy Image left no image flavour on the clipboard');
    }
    note(`image flavours after Copy Image: ${await inChrome(app, `return ${JSON.stringify(IMAGE_FLAVOURS)}.filter(f => Services.clipboard.hasDataMatchingFlavors([f], Services.clipboard.kGlobalClipboard)).join(' ');`)}`);
    // Headed, the desktop clipboard itself must offer an image type.
    if (process.env.PB_LIVE_HEADED === '1' && process.env.WAYLAND_DISPLAY) {
        const listTypes = () => { try { return execFileSync('wl-paste', ['--list-types'], { encoding: 'utf8', timeout: 2000 }); } catch (error) { return `wl-paste: ${error.message}`; } };
        const types = await settle(async () => listTypes(), t => t.split('\n').some(type => type.startsWith('image/')), 3000);
        if (!types.split('\n').some(type => type.startsWith('image/'))) {
            return fail(`Copy Image left no image flavour on the clipboard (desktop types: ${types.trim().split('\n').join(' ')})`);
        }
        note(`desktop clipboard types after Copy Image: ${types.trim().split('\n').join(' ')}`);
    }
}
const IMAGE_FLAVOURS = ['application/x-moz-nativeimage', 'image/png', 'image/jpeg', 'image/gif'];

// 39-06 (35 T17, CR-02): the edit rows and Copy Image inside a cross-origin iframe.
async function applyIframeEditPlants(app, plant, note) {
    if (plant === 'edit-rows-top-document') {
        // CR-02's defect: every Controllers read and command goes to the top document, never the right-clicked frame.
        if (await inChrome(app, `const { ControllersParent } = ChromeUtils.importESModule('resource://gre/actors/ControllersParent.sys.mjs');
            const proto = ControllersParent.prototype;
            const topOf = actor => actor.browsingContext.top === actor.browsingContext ? actor : actor.browsingContext.top.currentWindowGlobal.getActor('Controllers');
            for (const name of ['isCommandEnabled', 'doCommand']) {
                const real = proto[name];
                const planted = function (cmd) { return real.call(topOf(this), cmd); };
                planted.__pbPlanted = true;
                proto[name] = planted;
            }
            return proto.isCommandEnabled.__pbPlanted === true && proto.doCommand.__pbPlanted === true;`) === true) {
            note('PLANT edit-rows-top-document applied');
        }
    }
}

async function iframeEditRows({ app, pages, plant, fail, note }) {
    await applyIframeEditPlants(app, plant, note);
    const tab = await openPage(app, pages, '/xframe');
    if (typeof tab === 'string') {
        return fail(tab);
    }
    const frame = await settle(async () => (await app.send('browsingContext.getTree', { root: tab.page })).contexts[0]?.children?.find(c => c.url === FRAME_EDIT_URL())?.context ?? null, v => !!v, 10000);
    if (!frame || await settle(() => app.evaluateIn(frame, `document.readyState === 'complete' && document.getElementById('fimg').complete`), v => v === true, 5000) !== true) {
        return fail(`${BROKEN} the cross-origin frame did not load`);
    }
    const pids = await inChrome(app, `const bc = overlayOf(${JSON.stringify(tab.tabId)}).browsingContext; return JSON.stringify([bc.currentWindowGlobal.osPid, bc.children[0]?.currentWindowGlobal?.osPid]);`).then(JSON.parse);
    note(`frame origin ${await app.evaluateIn(frame, 'location.origin')} in page origin ${new URL(tab.url).origin}; frame in ${pids[0] === pids[1] ? 'the same' : 'another'} process`);
    // The right-click goes to the frame's own context in frame coordinates: input synthesized in the page's
    // process stops at an out-of-process frame's <iframe> element. 20 px in, inside "gamma".
    const inFrame = selector => centreOf(app, frame, selector);
    const pickIn = async (selector, row) => {
        await settle(() => overlayVisibility(app, tab.tabId), v => v === 'visible');
        const opened = await openMenuAt(app, frame, tab.tabId, await inFrame(selector));
        return opened.push ? pickRow(app, tab.theia, row) : false;
    };
    const fieldValue = id => app.evaluateIn(frame, `document.getElementById(${JSON.stringify(id)}).value`);

    await app.evaluateIn(frame, `const f = document.getElementById('f'); f.focus(); f.setSelectionRange(0, 5); true`);
    const opened = await openMenuAt(app, frame, tab.tabId, await inFrame('#f'));
    if (!opened.push) {
        return fail('no pageContextMenu push for the field inside the frame');
    }
    const want = ['text-action-cut', 'text-action-copy', 'text-action-paste', 'text-action-delete', 'text-action-select-all'].map(ftlLabel);
    const off = want.filter(l => !(opened.rows ?? []).some(r => r.label === l && !r.disabled));
    if (off.length) {
        await closeMenu(app);
        return fail(`edit rows followed the outer page, not the iframe: ${off.join(', ')} not enabled for a selection in the frame's field; rows ${JSON.stringify((opened.rows ?? []).map(r => `${r.label}${r.disabled ? ' (off)' : ''}`))}`);
    }
    await inChrome(app, `Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString('pb-sentinel'); return true;`);
    if (!await pickRow(app, tab.theia, ftlLabel('text-action-copy'))) {
        return fail('the frame field menu has no Copy row to pick');
    }
    if (await settle(() => clipboardText(app), t => t === 'gamma', 3000) !== 'gamma') {
        return fail('edit rows followed the outer page, not the iframe: Copy did not copy the frame\'s selection');
    }
    await app.evaluateIn(frame, `document.getElementById('f2').focus(); true`);
    if (!await pickIn('#f2', ftlLabel('text-action-paste')) || await settle(() => fieldValue('f2'), v => v === 'gamma', 3000) !== 'gamma') {
        return fail('edit rows followed the outer page, not the iframe: Paste did not set the frame\'s second field');
    }
    await app.evaluateIn(frame, `document.getElementById('f2').focus(); true`);
    if (!await pickIn('#f2', ftlLabel('text-action-undo')) || await settle(() => fieldValue('f2'), v => v === '', 3000) !== '') {
        return fail('edit rows followed the outer page, not the iframe: Undo did not restore the frame\'s second field');
    }
    await app.evaluateIn(frame, `const f = document.getElementById('f'); f.focus(); f.setSelectionRange(1, 1); true`);
    const allSelected = () => app.evaluateIn(frame, `(f => f.selectionStart === 0 && f.selectionEnd === f.value.length)(document.getElementById('f'))`);
    if (!await pickIn('#f', ftlLabel('text-action-select-all')) || await settle(allSelected, v => v === true, 3000) !== true) {
        return fail('edit rows followed the outer page, not the iframe: Select All did not select the frame field\'s text');
    }
    await inChrome(app, `Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString('pb-sentinel'); return true;`);
    if (!await pickIn('#fimg', ftlLabel('main-context-menu-image-copy'))) {
        return fail('the frame image menu has no Copy Image row to pick');
    }
    // As menu-edit (C24, 39-05): the headless widget keeps only text, so the read uses the clipboard cache.
    await inChrome(app, `Services.prefs.setBoolPref('widget.clipboard.use-cached-data.enabled', true); return true;`);
    if (await settle(() => inChrome(app, `return Services.clipboard.hasDataMatchingFlavors(${JSON.stringify(IMAGE_FLAVOURS)}, Services.clipboard.kGlobalClipboard);`), v => v === true, 3000) !== true) {
        return fail('Copy Image ignored the iframe image: no image flavour on the clipboard');
    }
}

/**
 * The pushed menu's spelling suggestion labels (dynamic spell-suggestion rows) after a right-click on `selector`.
 * `misspelt` re-opens the menu for up to 5 s until suggestions arrive: the inline checker reports none until the
 * textarea's editor has run its first check after focus (enableRealTimeSpell false in the spellInfo).
 */
async function suggestionsAt(app, tools, selector, misspelt = true) {
    // 39-07: chrome focus on the overlay first. After menu-page-tools it rests on the Theia frame, and a focus() in a
    // document without focus fires no focus event, so the inline spell checker never starts (the 39-05 flake).
    if (!await focusOverlay(app, tools.tabId)) {
        throw new Error(`${BROKEN} the /tools page could not be focused for the spell check`);
    }
    await app.evaluateIn(tools.page, `document.querySelector(${JSON.stringify(selector)}).focus(); true`);
    await sleep(500); // the inline checker runs after focus
    // On the word: the textarea's first line, not centreOf's vertical middle (its empty second row).
    const box = JSON.parse(await app.evaluateIn(tools.page, `JSON.stringify((e => { e.scrollIntoView({ block: 'center' }); return e.getBoundingClientRect().toJSON(); })(document.querySelector(${JSON.stringify(selector)})))`));
    let read = null;
    await settle(async () => {
        if (read) {
            await closeMenu(app);
        }
        const opened = await openMenuAt(app, tools.page, tools.tabId, { x: box.left + 10, y: box.top + 10 });
        const items = opened.push ? opened.push.items : [];
        return (read = { opened, words: items.filter(item => /^spell-suggestion-\d+$/.test(item.id)).map(item => item.label), ids: flatIds(items) });
    }, r => !misspelt || r.words.length > 0, 5000);
    return read;
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
    const added = await suggestionsAt(app, tools, '#spell2', false);
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
// theia-SaveFileDialog is on the dialog's file tree (file-dialog.js:289); the location input, name field and buttons are in its dialogBlock.
const acceptSaveDialog = (app, dir, name) => probe(app, `const dialog = document.querySelector('.theia-SaveFileDialog')?.closest('.dialogBlock');
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

// 39-06 (35 T16, CR-01): a save answered late, a save with a second menu opened before its answer, and one that cannot land.
const SAVE_LATE_MS = 61000;
const notificationTexts = app => app.evaluate(`JSON.stringify([...document.querySelectorAll('.theia-notification-list-item .theia-notification-message')].map(m => m.textContent.trim()))`).then(JSON.parse);

async function applySavePlants(app, plant, note) {
    if (plant === 'save-reply-ttl') {
        // CR-01's defect: chrome measured the path reply against the right-click's minute and answered `stale`.
        // The minute lives in the boundary's private state, so the plant gives that answer at the frontend's send.
        if (await probe(app, `const menu = get('PageContextMenuContribution');
            const send = menu.send;
            const picks = new Map();
            const planted = async function (tabId, menuId, itemId, path) {
                if (path !== undefined && Date.now() - (picks.get(menuId) ?? Date.now()) > 60000) {
                    return { ok: true, kind: 'webTabPageMenuAction', where: 'stale' };
                }
                const reply = await send.call(this, tabId, menuId, itemId, path);
                if (reply && reply.where === 'save-pick') { picks.set(menuId, Date.now()); }
                return reply;
            };
            planted.__pbPlanted = true;
            menu.send = planted;
            return menu.send.__pbPlanted === true;`) === true) {
            note('PLANT save-reply-ttl applied');
        }
    }
}

async function saveAsLate({ app, pages, plant, fail, note }) {
    await applySavePlants(app, plant, note);
    const tools = await openTools(app, pages);
    if (typeof tools === 'string') {
        return fail(tools);
    }
    const subscribed = await probe(app, `return (await get('WebTabChannel').request({ kind: 'webTabDownloadsSubscribe', tabId: ${JSON.stringify(tools.tabId)} })).ok === true;`);
    if (subscribed !== true) {
        return fail(`${BROKEN} the downloads view could not be subscribed, so the panel row would prove nothing`);
    }
    const title = chromeBarCopy('saveLinkTitle');
    const label = ftlLabel('main-context-menu-save-link');
    const dir = await mkdtemp(join(tmpdir(), 'pb-39-06-save-'));
    const lands = async name => (await settle(async () => (await stat(join(dir, name)).then(info => info.isFile(), () => false)) && (await readFile(join(dir, name))).equals(FILE_BYTES), v => v === true, 10000)) === true;
    const listed = (name, mark) => waitForPush(app, p => p && p.kind === 'downloadsChanged' && (p.rows ?? []).some(r => r.filename === name), { from: mark, timeoutMs: 10000 }).then(at => at >= 0);
    // Opens Save Link As on the file link; returns the menu id of that menu, or a failure string.
    const pickSave = async () => {
        const mark = (await pushes(app)).length;
        if (!await pickFromMenu(app, tools, '#filelink', label)) {
            return 'the link menu has no Save Link As row to pick';
        }
        const menuId = (await pushes(app)).slice(mark).find(isMenuPush(tools.tabId))?.menuId;
        if (await settle(() => dialogOpen(app, title), v => v === true) !== true || !Number.isSafeInteger(menuId)) {
            return `${BROKEN} no "${title}" dialog opened for the save pick`;
        }
        return menuId;
    };
    const failedCopy = subjectCopy('saveTargetFailed', await app.evaluate(appNameExpr));
    const failedShown = async () => (await notificationTexts(app)).filter(t => t === failedCopy).length;
    const accept = async name => {
        const accepted = await acceptSaveDialog(app, dir, name);
        return accepted === 'accepted' ? null : `${BROKEN} the "${title}" dialog could not be driven (${accepted})`;
    };
    try {
        // 1. Answered after more than a minute.
        const late = await pickSave();
        if (typeof late === 'string') {
            return fail(late);
        }
        await sleep(SAVE_LATE_MS);
        let mark = (await pushes(app)).length;
        const lateAccepted = await accept('late.bin');
        if (lateAccepted) {
            return fail(lateAccepted);
        }
        if (!await lands('late.bin') || !await listed('late.bin', mark)) {
            return fail(`a late Save As did not land: answered ${SAVE_LATE_MS / 1000} s after the pick, no file or no downloads row (notifications ${JSON.stringify(await notificationTexts(app))})`);
        }
        if (await failedShown()) {
            return fail(`a late Save As landed but also said it failed (notifications ${JSON.stringify(await notificationTexts(app))})`);
        }
        // 2. A second menu opened while the first save's dialog waits. The dialog layer hides the page, so it is
        // stepped aside for the right-click, as a page reachable beside the dialog would be.
        const first = await pickSave();
        if (typeof first === 'string') {
            return fail(first);
        }
        await app.evaluate(`(document.querySelector('.lm-Widget.dialogOverlay').style.display = 'none', true)`);
        const second = await openMenuAt(app, tools.page, tools.tabId, await centreOf(app, tools.page, '#blank'));
        await closeMenu(app);
        await app.evaluate(`(document.querySelector('.lm-Widget.dialogOverlay').style.display = '', true)`);
        if (!second.push || second.push.menuId === first) {
            return fail(`${BROKEN} no second page menu opened while the save dialog waited`);
        }
        mark = (await pushes(app)).length;
        const firstAccepted = await accept('first.bin');
        if (firstAccepted) {
            return fail(firstAccepted);
        }
        if (!await lands('first.bin') || !await listed('first.bin', mark)) {
            return fail(`a second menu dropped the pending save (notifications ${JSON.stringify(await notificationTexts(app))})`);
        }
        if (await failedShown()) {
            return fail(`the save beside a second menu landed but also said it failed (notifications ${JSON.stringify(await notificationTexts(app))})`);
        }
        // 3. The same menu's save answered again: its one save slot is spent, so this save cannot land and must say so.
        const expired = subjectCopy('saveTargetExpired', await app.evaluate(appNameExpr));
        const before = (await notificationTexts(app)).filter(t => t === expired).length;
        await probe(app, `const menu = get('PageContextMenuContribution');
            menu.saveTarget(get('WebTabChannel').widgetOf(${JSON.stringify(tools.tabId)}), ${JSON.stringify(tools.tabId)}, ${first}, 'context-savelink', 'again.bin');
            return true;`);
        if (await settle(() => dialogOpen(app, title), v => v === true) !== true) {
            return fail(`${BROKEN} no "${title}" dialog opened for the spent save`);
        }
        const againAccepted = await accept('again.bin');
        if (againAccepted) {
            return fail(againAccepted);
        }
        const shown = await settle(() => notificationTexts(app), texts => texts.filter(t => t === expired).length > before, 5000);
        if (await stat(join(dir, 'again.bin')).then(() => true, () => false)) {
            return fail('a save whose menu had closed still wrote a file');
        }
        if ((shown ?? []).filter(t => t === expired).length <= before) {
            return fail(`an unlandable save was silent or did not say its menu had closed; notifications ${JSON.stringify(shown)}`);
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
    // openPage takes this tab's own context: tooltip-status's /furniture tab, earlier in the session, has the same URL.
    const opened0 = await openPage(app, pages, '/furniture');
    if (typeof opened0 === 'string') {
        return fail(opened0);
    }
    const { tabId, page, theia, url } = opened0;
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

// 35-06 (PROMPT-06): the form furniture. No field value, seeded entry or password is ever printed.
const AC_SEED = 'probe history entry';
const PROBE_USER = 'probe-user';
const PASTE_TEXT = 'pb-paste-probe!'; // 15 characters
// WebDriver key codes (written as escapes: editing tools must not turn them into literal characters).
const KEY = { down: '\uE015', enter: '\uE007', escape: '\uE00C' };

/** Trusted key presses of each of `values` in `context` (a page, so the content-side form fill controller sees them). */
async function keysIn(app, context, values) {
    await app.send('input.performActions', { context, actions: [{ type: 'key', id: 'pb-furniture-keys', actions: values.flatMap(value => [{ type: 'keyDown', value }, { type: 'keyUp', value }]) }] });
    await app.send('input.releaseActions', { context });
}

/** #PopupAutoComplete: open, its visible row count, whether its top-left lies inside the overlay, and whether a row names `needle`. Booleans and a count only. */
const autocompleteState = (app, tabId, needle = '') => inChrome(app, `const p = document.getElementById('PopupAutoComplete');
    const o = overlayOf(${JSON.stringify(tabId)});
    if (!p || !o) return JSON.stringify({ popup: !!p, open: false, rows: 0, inside: false, match: false });
    const items = [...p.querySelectorAll('richlistitem')].filter(i => !i.collapsed && !i.hidden);
    const r = p.getOuterScreenRect();
    const b = o.getBoundingClientRect();
    const left = window.mozInnerScreenX + b.left;
    const top = window.mozInnerScreenY + b.top;
    const needle = ${JSON.stringify(needle)};
    return JSON.stringify({
        popup: true,
        open: p.state === 'open',
        rows: items.length,
        inside: r.left >= left && r.left <= left + b.width && r.top >= top && r.top <= top + b.height,
        match: !!needle && items.some(i => [i.getAttribute('ac-value'), i.getAttribute('ac-label'), i.textContent].some(t => (t || '').includes(needle))),
    });`).then(JSON.parse);

async function applyFormPlants(app, plant, note, tabId) {
    const plants = {
        // W5: the element AutoCompleteParent resolves is gone before the field is focused.
        'autocomplete-element-removed': `document.getElementById('PopupAutoComplete')?.remove(); return document.getElementById('PopupAutoComplete') === null;`,
        'autocomplete-attr-removed': `const o = overlayOf(${JSON.stringify(tabId)}); if (!o) return false; o.removeAttribute('autocompletepopup'); return !o.hasAttribute('autocompletepopup') && o.autoCompletePopup === null;`,
        'validation-template-removed': `document.getElementById('invalidFormTemplate')?.remove(); return document.getElementById('invalidFormTemplate') === null && document.getElementById('invalid-form-popup') === null;`,
        // removeResourceIds returns how many resource ids remain: one fewer than the shell head links.
        // 39-06 (C23): the root cause, the remote agent's signon.rememberSignons=false, re-applied after savedLogin's setup.
        'login-manager-disabled': `Services.prefs.setBoolPref('signon.rememberSignons', false); return Services.prefs.getBoolPref('signon.rememberSignons') === false;`,
        'paste-l10n-removed': `const linked = document.querySelectorAll('link[rel="localization"]').length;
            return !!document.l10n && document.l10n.removeResourceIds(['toolkit/global/textActions.ftl']) === linked - 1;`,
    };
    if (plants[plant] && await inChrome(app, plants[plant]) === true) {
        note(`PLANT ${plant} applied`);
    }
}

async function autocomplete({ app, pages, plant, fail, note }) {
    const seeded = await inChrome(app, `const { FormHistory } = ChromeUtils.importESModule('resource://gre/modules/FormHistory.sys.mjs');
        return FormHistory.update({ op: 'add', fieldname: 'q', value: ${JSON.stringify(AC_SEED)} })
            .then(() => FormHistory.count({ fieldname: 'q' })).then(n => n > 0);`);
    if (seeded !== true) {
        return fail(`${BROKEN} the form-history entry for field q could not be seeded`);
    }
    const tab = await openPage(app, pages, '/form');
    if (typeof tab === 'string') {
        return fail(tab);
    }
    await applyFormPlants(app, plant, note, tab.tabId);
    await focusOverlay(app, tab.tabId);
    const typeStart = async () => {
        // A block: a top-level const persists in the page's global between evaluates, so the second would throw.
        await app.evaluateIn(tab.page, `{ const f = document.getElementById('q'); f.value = ''; f.focus(); } true`);
        await keysIn(app, tab.page, [...AC_SEED.slice(0, 3)]);
        return settle(() => autocompleteState(app, tab.tabId), st => st.open && st.rows > 0, 5000);
    };
    const shown = await typeStart();
    if (!shown?.open || !shown.rows) {
        return fail(`no autocomplete popup under the field after typing (element present: ${shown?.popup ?? false}, open: ${shown?.open ?? false}, rows: ${shown?.rows ?? 0})`);
    }
    if (!shown.inside) {
        return fail('the autocomplete popup is not anchored inside the page');
    }
    await keysIn(app, tab.page, [KEY.down, KEY.enter]);
    const committed = () => app.evaluateIn(tab.page, `document.getElementById('q').value === ${JSON.stringify(AC_SEED)}`);
    if (await settle(committed, v => v === true, 3000) !== true) {
        return fail('ArrowDown and Enter did not commit the form-history entry');
    }
    const again = await typeStart();
    if (!again?.open) {
        return fail('retyping did not reopen the autocomplete popup');
    }
    await app.evaluateIn(tab.page, `window.__pbBefore = document.getElementById('q').value; true`);
    await keysIn(app, tab.page, [KEY.escape]);
    const closed = await settle(() => autocompleteState(app, tab.tabId), st => !st.open, 3000);
    if (closed?.open) {
        return fail('Escape did not dismiss the autocomplete popup');
    }
    const kept = await app.evaluateIn(tab.page, `(f => f.value === window.__pbBefore && document.activeElement === f && document.hasFocus())(document.getElementById('q'))`);
    if (kept !== true) {
        return fail('Escape changed the field value or took focus out of the page');
    }
}

async function savedLogin({ app, pages, plant, fail, note }) {
    const origin = new URL(pages.url('/')).origin;
    // The password is generated in chrome scope and never leaves it; the profile is disposed with the session.
    // Autofill off and no insecure-field row, so the popup on focus lists exactly the saved login first.
    // 39-06 (C23): the BiDi remote agent's recommended prefs set signon.rememberSignons=false
    // (remote/shared/RecommendedPreferences.sys.mjs), which stops LoginManagerChild processing any form.
    const saved = await inChrome(app, `Services.prefs.setBoolPref('signon.rememberSignons', true);
        Services.prefs.setBoolPref('signon.autofillForms', false);
        Services.prefs.setBoolPref('security.insecure_field_warning.contextual.enabled', false);
        const info = Cc['@mozilla.org/login-manager/loginInfo;1'].createInstance(Ci.nsILoginInfo);
        info.init(${JSON.stringify(origin)}, ${JSON.stringify(origin)}, null, ${JSON.stringify(PROBE_USER)}, Services.uuid.generateUUID().toString(), 'username', 'password');
        return Services.logins.addLoginAsync(info)
            .then(() => Services.logins.getAllLogins())
            .then(all => all.filter(l => l.origin === ${JSON.stringify(origin)}).length === 1);`);
    if (saved !== true) {
        return fail(`${BROKEN} the synthetic login could not be saved for the served origin`);
    }
    // Before the page loads: LoginManagerChild reads the pref when the form is processed.
    await applyFormPlants(app, plant, note);
    const tab = await openPage(app, pages, '/login');
    if (typeof tab === 'string') {
        return fail(tab);
    }
    await focusOverlay(app, tab.tabId);
    await sleep(500); // LoginManagerChild marks the form's fields once the page's form is processed
    await app.evaluateIn(tab.page, `document.getElementById('user').focus(); true`);
    const shown = await settle(() => autocompleteState(app, tab.tabId, PROBE_USER), st => st.open && st.match, 5000);
    if (!shown?.open) {
        return fail('no autocomplete popup opened on the username field');
    }
    if (!shown.match) {
        return fail(`the login popup has no row for ${PROBE_USER}`);
    }
    await keysIn(app, tab.page, [KEY.down, KEY.enter]);
    const filled = () => app.evaluateIn(tab.page, `document.getElementById('user').value === ${JSON.stringify(PROBE_USER)} && document.getElementById('pass').value.length > 0`);
    if (await settle(filled, v => v === true, 3000) !== true) {
        return fail('picking the saved login did not fill the username and password fields');
    }
}

async function formValidation({ app, pages, plant, fail, note }) {
    const tab = await openPage(app, pages, '/validate');
    if (typeof tab === 'string') {
        return fail(tab);
    }
    await applyFormPlants(app, plant, note, tab.tabId);
    const send = await centreOf(app, tab.page, '#send');
    await clickAt(app, tab.page, send.x, send.y);
    const bubble = await settle(() => inChrome(app, `const p = document.getElementById('invalid-form-popup');
        return JSON.stringify({ open: !!p && p.state === 'open', message: !!p && !!(p.querySelector('description')?.textContent || '').trim() });`).then(JSON.parse), st => st.open && st.message, 5000);
    if (!bubble?.open) {
        return fail('no validation bubble opened for the required empty field');
    }
    if (!bubble.message) {
        return fail('the validation bubble carries no message');
    }
}

async function pastePopup({ app, pages, plant, fail, note }) {
    await inChrome(app, `Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(${JSON.stringify(PASTE_TEXT)}); return true;`);
    const tab = await openPage(app, pages, '/paste');
    if (typeof tab === 'string') {
        return fail(tab);
    }
    await applyFormPlants(app, plant, note, tab.tabId);
    const read = await centreOf(app, tab.page, '#read');
    // As a real click does: an unfocused document's readText() rejects with NotAllowedError before any popup.
    if (!await focusOverlay(app, tab.tabId)) {
        return fail(`${BROKEN} the page could not be focused before the button click`);
    }
    await clickAt(app, tab.page, read.x, read.y);
    const state = () => inChrome(app, `const p = document.getElementById('clipboardReadPasteMenuPopup');
        const i = document.getElementById('clipboardReadPasteMenuItem');
        return JSON.stringify({ open: !!p && p.state === 'open', label: i ? i.getAttribute('label') : null, disabled: !!i && i.disabled });`).then(JSON.parse);
    const shown = await settle(state, st => st.open, 5000);
    if (!shown?.open) {
        const title = await app.evaluateIn(tab.page, 'document.title');
        return fail(`no paste popup opened for navigator.clipboard.readText() (page title ${JSON.stringify(title)})`);
    }
    const want = ftlLabel('text-action-paste');
    const labelled = await settle(state, st => st.label === want, 3000);
    if (labelled?.label !== want) {
        return fail(`paste label not translated: the item reads ${JSON.stringify(labelled?.label ?? null)}, upstream's en-US label is ${JSON.stringify(want)}`);
    }
    const delay = await inChrome(app, `return Services.prefs.getIntPref('security.dialog_enable_delay');`);
    const enabled = await settle(state, st => st.open && !st.disabled, Number(delay) + 3000);
    if (!enabled?.open || enabled.disabled) {
        return fail(`the Paste item did not enable within security.dialog_enable_delay (${delay} ms) plus 3 s`);
    }
    // activateItem, as a click does: ClipboardContextMenu answers the page on popuphiding (:37-53), which doCommand never causes.
    await inChrome(app, `document.getElementById('clipboardReadPasteMenuPopup').activateItem(document.getElementById('clipboardReadPasteMenuItem')); return true;`);
    const want15 = String(PASTE_TEXT.length);
    const title = await settle(() => app.evaluateIn(tab.page, 'document.title'), t => t === want15, 5000);
    if (title !== want15) {
        return fail(`the page's readText() did not resolve with the ${want15}-character clipboard text after Paste (page title ${JSON.stringify(title)})`);
    }
    note(`research probe 12: the paste popup opened labelled ${JSON.stringify(want)} and readText() resolved with ${want15} characters after Paste`);
}

// 35-07 (PAGE-07): the fullscreen scenarios.
const F11 = { key: 'F11', code: 'F11', keyCode: 122 };
const CTRL_TAB = { key: 'Tab', code: 'Tab', keyCode: 9, modifiers: ['accel'] };

/** Upstream's en-US value of a browser.ftl message (`id = value`). */
function browserFtlValue(id) {
    const value = new RegExp(`^${id} = (.*)$`, 'm').exec(readTree('upstream/browser/locales/en-US/browser/browser.ftl'))?.[1];
    if (!value) {
        throw new Error(`${BROKEN} no ${id} value in upstream's browser.ftl`);
    }
    return value;
}

/** Chrome's fullscreen state for `tabId`'s overlay and the warning; booleans and the warning's two strings only. */
const fullscreenState = (app, tabId) => inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)});
    const w = document.getElementById('fullscreen-warning');
    const t = w ? w.querySelector('.pointerlockfswarning-domain-text') : null;
    const b = document.getElementById('fullscreen-exit-button');
    return JSON.stringify({
        chromeFull: !!document.fullscreenElement,
        overlayFull: !!o && document.fullscreenElement === o,
        windowFull: window.fullScreen,
        inDom: document.documentElement.hasAttribute('inDOMFullscreen'),
        warning: !!w,
        warningOpen: !!w && w.matches(':popover-open'),
        domain: t && !t.hidden ? t.textContent : '',
        button: b ? b.textContent.trim() : '',
    });`).then(JSON.parse);

const pageFullscreen = (app, page) => app.evaluateIn(page, `document.fullscreenElement ? document.fullscreenElement.id : ''`);

/** The overlay's rect relative to the Theia frame, and the web tab placeholder's rect in the frame. */
async function overlayMatchesPlaceholder(app, tabId) {
    const overlay = JSON.parse(await inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); if (!o) return 'null';
        const f = document.getElementById('powerbrowser-content').getBoundingClientRect(); const r = o.getBoundingClientRect();
        return JSON.stringify({ x: r.left - f.left, y: r.top - f.top, w: r.width, h: r.height });`));
    const holder = await probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}); if (!w) return null;
        const r = w.node.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height };`);
    return !!overlay && !!holder && ['x', 'y', 'w', 'h'].every(k => Math.abs(overlay[k] - holder[k]) <= 2);
}

async function applyFullscreenPlants(app, plant, note, names, tabId) {
    if (!names.includes(plant)) {
        return;
    }
    const plants = {
        'warning-removed': `document.getElementById('fullscreen-warning')?.remove(); return document.getElementById('fullscreen-warning') === null;`,
        'fullscreen-standin-missing': `delete window.FullScreen; return window.FullScreen === undefined;`,
        // The row loses its disabled attribute and the focus tracker's re-disable is undone at once.
        'f11-row-enabled-under-theia': `const k = document.getElementById('powerbrowser-page-key-fullscreen'); if (!k) return false;
            const keep = () => { if (k.hasAttribute('disabled')) k.removeAttribute('disabled'); };
            new MutationObserver(keep).observe(k, { attributes: true, attributeFilter: ['disabled'] }); keep();
            return !k.hasAttribute('disabled');`,
        'tab-switch-stays-fullscreen': `const o = overlayOf(${JSON.stringify(tabId)}); if (!o) return false;
            document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) o.requestFullscreen().catch(() => {}); });
            window.__pbFullscreenReentry = true; return window.__pbFullscreenReentry === true;`,
    };
    if (plants[plant] && await inChrome(app, plants[plant]) === true) {
        note(`PLANT ${plant} applied`);
    }
}

async function elementFullscreen({ app, pages, plant, fail, note }) {
    const other = await openPage(app, pages, '/target');
    if (typeof other === 'string') {
        return fail(other);
    }
    const tab = await openPage(app, pages, '/fullscreen');
    if (typeof tab === 'string') {
        return fail(tab);
    }
    await applyFullscreenPlants(app, plant, note, ['warning-removed', 'fullscreen-standin-missing'], tab.tabId);
    if (!(await settle(() => app.evaluateIn(tab.page, `document.getElementById('v').currentTime`), t => t > 0) > 0)) {
        return fail(`${BROKEN} the page's video never started playing`);
    }
    const host = new URL(tab.url).hostname;
    const enter = async how => {
        const inPage = await settle(() => pageFullscreen(app, tab.page), id => id === 'v', 5000);
        if (inPage !== 'v') {
            return `the page never entered fullscreen (${how}; page fullscreenElement ${JSON.stringify(inPage ?? null)})`;
        }
        const st = await settle(() => fullscreenState(app, tab.tabId), x => x.overlayFull && x.windowFull, 5000);
        if (!st?.overlayFull || !st.windowFull) {
            return `the page entered fullscreen (${how}) but chrome did not cover the window with the overlay: ${JSON.stringify(st)}`;
        }
        return null;
    };
    const left = async how => {
        const out = await settle(() => pageFullscreen(app, tab.page), id => id === '', 5000);
        const st = await settle(() => fullscreenState(app, tab.tabId), x => !x.chromeFull && !x.windowFull && !x.inDom && !x.warningOpen, 5000);
        if (out !== '' || st?.chromeFull || st?.windowFull || st?.inDom || st?.warningOpen) {
            return `${how} did not leave fullscreen: page fullscreenElement ${JSON.stringify(out ?? null)}, chrome ${JSON.stringify(st)}`;
        }
        return null;
    };

    // 1. A button click with BiDi input (a real user activation). BiDi input reaches only the page, so chrome
    // focus is moved to the overlay first, as a real click does; an unfocused tab's request is denied.
    const go = await centreOf(app, tab.page, '#go');
    if (!await focusOverlay(app, tab.tabId)) {
        return fail(`${BROKEN} the page could not be focused before the button click`);
    }
    await clickAt(app, tab.page, go.x, go.y);
    const entered = await enter('the page button');
    if (entered) {
        return fail(entered);
    }
    const exitLabel = browserFtlValue('fullscreen-exit-button');
    const warned = await settle(() => fullscreenState(app, tab.tabId), x => x.warningOpen && x.domain.includes(host) && x.button === exitLabel, 3000);
    if (!warned?.warning || !warned.warningOpen) {
        return fail(`no fullscreen warning was shown on entry: ${JSON.stringify(warned)}`);
    }
    if (!warned.domain.includes(host) || warned.button !== exitLabel) {
        return fail(`the fullscreen warning names ${JSON.stringify(warned.domain)} with a button reading ${JSON.stringify(warned.button)}; expected the host ${host} and upstream's ${JSON.stringify(exitLabel)}`);
    }
    note(`warning: ${JSON.stringify(warned.domain.replace(/[\u2068\u2069]/g, ''))}, button ${JSON.stringify(warned.button)}`);
    await capture(note, '35-T14-fullscreen-warning.png');

    // 2. Esc leaves, and the overlay goes back to its placeholder.
    await focusOverlay(app, tab.tabId);
    await pressKey(app, ESCAPE);
    const escaped = await left('Esc');
    if (escaped) {
        return fail(escaped);
    }
    if (await settle(() => overlayMatchesPlaceholder(app, tab.tabId), v => v === true, 1000) !== true) {
        return fail('after Esc the overlay did not return to the web tab placeholder\'s rect within 1 s');
    }

    // 3. Entered again, a tab switch from the page leaves fullscreen and it stays off.
    await clickAt(app, tab.page, go.x, go.y);
    const again = await enter('the page button, second time');
    if (again) {
        return fail(again);
    }
    await applyFullscreenPlants(app, plant, note, ['tab-switch-stays-fullscreen'], tab.tabId);
    await focusOverlay(app, tab.tabId);
    await pressKey(app, CTRL_TAB);
    // Ctrl+Tab takes the strip's next tab, which wraps from this last-opened one (verify-nav-keys-live), so any other tab.
    if (await settle(() => currentTabId(app), id => id !== tab.tabId, 5000) === tab.tabId) {
        return fail(`${BROKEN} Ctrl+Tab from the fullscreen page did not switch away from it`);
    }
    // Off, then off on every 100 ms read for one second: a re-entry inside that window is caught.
    let stuck = null;
    const off = await settle(() => fullscreenState(app, tab.tabId), x => !x.chromeFull && !x.windowFull, 5000);
    if (off?.chromeFull || off?.windowFull) {
        stuck = off;
    }
    for (let i = 0; i < 10 && !stuck; i++) {
        await sleep(100);
        const st = await fullscreenState(app, tab.tabId);
        if (st.chromeFull || st.windowFull) {
            stuck = st;
        }
    }
    if (stuck) {
        return fail(`the tab switch left fullscreen on: ${JSON.stringify(stuck)}`);
    }

    // 4. The page menu's Full Screen row on the video, then a right-click during fullscreen opens nothing.
    await makeCurrent(app, tab.tabId);
    const mark = (await pushes(app)).length;
    if (!await pickFromMenu(app, tab, '#v', ftlLabel('main-context-menu-media-video-fullscreen'))) {
        return fail('the video\'s page menu had no Full Screen row to pick');
    }
    const control = (await pushes(app)).slice(mark).some(isMenuPush(tab.tabId));
    const viaMenu = await enter('the page menu\'s Full Screen row');
    if (viaMenu) {
        return fail(viaMenu);
    }
    if (!control) {
        return fail(`${BROKEN} the Full Screen row's menu was not seen as a pageContextMenu push, so the absence below would prove nothing`);
    }
    const during = (await pushes(app)).length;
    const centre = await centreOf(app, tab.page, '#v');
    await clickAt(app, tab.page, centre.x, centre.y, 2);
    await sleep(1500);
    if ((await pushes(app)).slice(during).some(isMenuPush(tab.tabId))) {
        return fail('a right-click during element fullscreen pushed a page menu (D-19)');
    }
    await inChrome(app, `document.getElementById('fullscreen-exit-button').click(); return true;`);
    const exited = await left('the warning\'s exit button');
    if (exited) {
        return fail(exited);
    }
}

// 39-06 (35 T18, WR-03): the pointer-lock warning.
const pointerState = app => inChrome(app, `const p = document.getElementById('pointerlock-warning');
    const f = document.getElementById('fullscreen-warning');
    const t = p ? p.querySelector('.pointerlockfswarning-domain-text') : null;
    return JSON.stringify({
        pointer: !!p && p.matches(':popover-open'),
        fullscreen: !!f && f.matches(':popover-open'),
        text: t && !t.hidden ? t.textContent.replace(/[\\u2068\\u2069]/g, '') : '',
    });`).then(JSON.parse);
const pageLocked = (app, page) => app.evaluateIn(page, `document.pointerLockElement === document.body`);

async function pointerLockWarning({ app, pages, plant, fail, note }) {
    const tab = await openPage(app, pages, '/pointer');
    if (typeof tab === 'string') {
        return fail(tab);
    }
    if (plant === 'pointerlock-standin-missing' && await inChrome(app, `delete window.PointerLock; return window.PointerLock === undefined;`) === true) {
        note('PLANT pointerlock-standin-missing applied');
    }
    // Upstream's en-US sentence with the page's host where its domain placeable is. An IP host has no base
    // domain, so formatURIForDisplay keeps the port (BrowserUtils.sys.mjs), as upstream's warning does.
    const host = new URL(tab.url).host;
    const want = browserFtlValue('pointerlock-warning-domain').replace(/<span data-l10n-name="domain">\{ \$domain \}<\/span>/, host);
    if (want === browserFtlValue('pointerlock-warning-domain')) {
        return fail(`${BROKEN} no domain placeable in upstream's pointerlock-warning-domain`);
    }
    const click = async selector => {
        const at = await centreOf(app, tab.page, selector);
        if (!await focusOverlay(app, tab.tabId)) {
            return false;
        }
        await clickAt(app, tab.page, at.x, at.y);
        return true;
    };
    if (!await click('#lock') || await settle(() => pageLocked(app, tab.page), v => v === true, 5000) !== true) {
        return fail(`${BROKEN} the page never got pointer lock from its button`);
    }
    const shown = await settle(() => pointerState(app), st => st.pointer && st.text === want, 3000);
    if (!shown?.pointer) {
        return fail(`no pointer-lock warning while the page holds the pointer: ${JSON.stringify(shown)}`);
    }
    if (shown.text !== want) {
        return fail(`the pointer-lock warning reads ${JSON.stringify(shown.text)}, not upstream's ${JSON.stringify(want)}`);
    }
    note(`warning: ${JSON.stringify(shown.text)}`);
    await app.evaluateIn(tab.page, `document.exitPointerLock(); true`);
    const gone = await settle(() => pointerState(app), st => !st.pointer, 3000);
    if (gone?.pointer || await pageLocked(app, tab.page)) {
        return fail(`pointer-lock warning stayed after exit: ${JSON.stringify(gone)}`);
    }
    // In fullscreen only the fullscreen warning: the pointer-lock one is the positive control above.
    if (!await click('#fs') || await settle(() => pageLocked(app, tab.page), v => v === true, 5000) !== true) {
        return fail(`${BROKEN} the page never got pointer lock in fullscreen`);
    }
    const full = await settle(() => pointerState(app), st => st.fullscreen, 3000);
    if (!full?.fullscreen) {
        return fail(`${BROKEN} no fullscreen warning in fullscreen, so the pointer-lock absence would prove nothing: ${JSON.stringify(full)}`);
    }
    for (let i = 0; i < 10; i++) {
        const st = await pointerState(app);
        if (st.pointer) {
            return fail(`both warnings in fullscreen: ${JSON.stringify(st)}`);
        }
        await sleep(100);
    }
    await focusOverlay(app, tab.tabId);
    await pressKey(app, ESCAPE);
    const out = await settle(() => app.evaluateIn(tab.page, `!document.fullscreenElement && !document.pointerLockElement`), v => v === true, 5000);
    if (out !== true) {
        await inChrome(app, `document.getElementById('fullscreen-exit-button')?.click(); return true;`);
    }
}

async function fullscreenKey({ app, pages, fail }) {
    const tab = await openPage(app, pages, '/target');
    if (typeof tab === 'string') {
        return fail(tab);
    }
    await installFireRecorder(app);
    const windowFull = () => inChrome(app, 'return window.fullScreen;');
    for (const [want, step] of [[true, 'first'], [false, 'second']]) {
        if (!await focusOverlay(app, tab.tabId)) {
            return fail(`${BROKEN} the page could not be focused before the ${step} F11`);
        }
        const mark = (await firedRows(app)).length;
        await pressKey(app, F11);
        const fired = await settle(() => firedRows(app), rows => rows.slice(mark).includes('fullscreen'), 3000);
        if (!fired?.slice(mark).includes('fullscreen')) {
            return fail(`the ${step} F11 with the page focused fired no fullscreen row`);
        }
        if (await settle(windowFull, v => v === want, 5000) !== want) {
            return fail(`the ${step} F11 left window.fullScreen ${!want} (Phase 33's full-screen command toggles it)`);
        }
    }
}

async function f11KeepsDebug({ app, plant, results, fail, note }) {
    const control = results.find(r => r.name === 'fullscreen-key');
    if (!control || control.failures.length || control.notScored) {
        return 'not-scored';
    }
    await applyFullscreenPlants(app, plant, note, ['f11-row-enabled-under-theia']);
    if (await focusTheiaFrame(app) !== true) {
        return fail(`${BROKEN} the Theia frame could not be made chrome's active element`);
    }
    const opened = await probe(app, `await get('CommandRegistry').executeCommand('workbench.action.files.newUntitledFile');
        if (!await until(() => !!get('EditorManager').currentEditor, 10000)) return false;
        const ed = get('EditorManager').currentEditor;
        await get('ApplicationShell').activateWidget(ed.id); ed.editor.focus(); return true;`);
    if (opened !== true || await settle(() => probe(app, `return get('ContextKeyService').match('editorFocus');`), v => v === true) !== true) {
        return fail(`${BROKEN} no focused untitled editor`);
    }
    const mark = (await firedRows(app)).length;
    await pressKey(app, F11);
    await sleep(1500);
    if ((await firedRows(app)).slice(mark).includes('fullscreen')) {
        return fail('F11 fired a page key with the IDE focused');
    }
    if (await inChrome(app, 'return window.fullScreen;') !== false) {
        return fail('the window went full screen on F11 with the IDE focused');
    }
}

const SCENARIOS = {
    'tooltip-status': tooltipStatus,
    'link-status-clear': linkStatusClear,
    'theia-hover-silent': theiaHoverSilent,
    'pip-close': pipClose,
    'context-menu': contextMenu,
    'menu-not-in-ide': menuNotInIde,
    'background-menu': backgroundMenu,
    'menu-page-tools': menuPageTools,
    'inspect-policy': inspectPolicy,
    'menu-edit': menuEdit,
    'iframe-edit-rows': iframeEditRows,
    'menu-spelling': menuSpelling,
    'menu-save': menuSave,
    'save-as-late': saveAsLate,
    'extension-entry': extensionEntry,
    'freeze-frame': freezeFrame,
    'autocomplete': autocomplete,
    'saved-login': savedLogin,
    'form-validation': formValidation,
    'paste-popup': pastePopup,
    'element-fullscreen': elementFullscreen,
    'pointer-lock-warning': pointerLockWarning,
    'fullscreen-key': fullscreenKey,
    'f11-keeps-debug': f11KeepsDebug,
};

/** The scenario each absence scenario takes as its positive control. */
const CONTROL_OF = { 'theia-hover-silent': 'tooltip-status', 'menu-not-in-ide': 'context-menu', 'background-menu': 'context-menu', 'f11-keeps-debug': 'fullscreen-key' };

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
                // A scenario that failed with its menu open would hide every later page (BLOCKING_LAYER_SELECTOR).
                await closeMenu(app).catch(() => {});
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
    { plant: 'tooltip-drag-lookup-throws', target: 'tooltip-status', run: ['tooltip-status'], expect: 'page tooltip did not open' },
    { plant: 'overlink-unregistered', target: 'tooltip-status', run: ['tooltip-status'], expect: 'no overLink push' },
    { plant: 'theia-tooltip-leak', target: 'theia-hover-silent', run: ['tooltip-status', 'theia-hover-silent'], expect: 'the IDE hover opened the page tooltip' },
    { plant: 'status-over-page', target: 'tooltip-status', run: ['tooltip-status'], expect: 'status line intersects the page' },
    { plant: 'pip-shouldactivate-missing', target: 'pip-close', run: ['pip-close'], expect: 'Picture-in-Picture window is still open' },
    // 35-03 (PROMPT-04).
    { plant: 'stub-removed', target: 'context-menu', run: ['context-menu'], expect: 'no pageContextMenu push' },
    { plant: 'background-check-off', target: 'background-menu', run: ['context-menu', 'background-menu'], expect: 'a hidden tab opened a menu' },
    { plant: 'ide-menu-leak', target: 'menu-not-in-ide', run: ['context-menu', 'menu-not-in-ide'], expect: 'the IDE right-click pushed a page menu' },
    { plant: 'referrer-dropped', target: 'context-menu', run: ['context-menu'], expect: 'new tab request carried no Referer' },
    // 39-02 (C11, PROMPT-04).
    { plant: 'stale-dismiss-focus', target: 'context-menu', run: ['context-menu'], expect: 'a stale dismissal moved focus off the open menu' },
    { plant: 'stale-focus-unguarded', target: 'context-menu', run: ['context-menu'], expect: 'a stale dismissal moved focus off the open menu' },
    // 35-04 (PROMPT-04).
    { plant: 'inspect-no-select', target: 'menu-page-tools', run: ['menu-page-tools'], expect: 'inspector did not select the clicked node' },
    { plant: 'copy-row-unwired', target: 'menu-edit', run: ['menu-edit'], expect: 'copy did not reach the clipboard' },
    { plant: 'copy-image-html-only', target: 'menu-edit', run: ['menu-edit'], expect: 'Copy Image left no image flavour on the clipboard' },
    { plant: 'spellcheck-off', target: 'menu-spelling', run: ['menu-spelling'], expect: 'no suggestion row' },
    { plant: 'save-dialog-cancelled', target: 'menu-save', run: ['menu-save'], expect: 'no file at the chosen path' },
    // 35-05 (PROMPT-04, D-16, D-08).
    { plant: 'ext-cleanup-skipped', target: 'extension-entry', run: ['extension-entry'], expect: 'duplicate extension row' },
    { plant: 'ext-command-dropped', target: 'extension-entry', run: ['extension-entry'], expect: 'no onClicked request' },
    { plant: 'still-not-painted', target: 'freeze-frame', run: ['freeze-frame'], expect: 'a still arrived but was not painted' },
    // 35-06 (PROMPT-06, D-03, D-14, D-15).
    { plant: 'autocomplete-element-removed', target: 'autocomplete', run: ['autocomplete'], expect: 'no autocomplete popup' },
    { plant: 'autocomplete-attr-removed', target: 'autocomplete', run: ['autocomplete'], expect: 'no autocomplete popup' },
    // 39-06 (C23, PROMPT-06).
    { plant: 'login-manager-disabled', target: 'saved-login', run: ['saved-login'], expect: 'no autocomplete popup opened on the username field' },
    { plant: 'validation-template-removed', target: 'form-validation', run: ['form-validation'], expect: 'no validation bubble' },
    { plant: 'paste-l10n-removed', target: 'paste-popup', run: ['paste-popup'], expect: 'paste label not translated' },
    // 35-07 (PAGE-07, D-05, D-07).
    { plant: 'warning-removed', target: 'element-fullscreen', run: ['element-fullscreen'], expect: 'no fullscreen warning' },
    { plant: 'fullscreen-standin-missing', target: 'element-fullscreen', run: ['element-fullscreen'], expect: 'page never entered fullscreen' },
    { plant: 'f11-row-enabled-under-theia', target: 'f11-keeps-debug', run: ['fullscreen-key', 'f11-keeps-debug'], expect: 'F11 fired a page key with the IDE focused' },
    // 39-06 (35 T16 CR-01, T17 CR-02, T18 WR-03).
    { plant: 'save-reply-ttl', target: 'save-as-late', run: ['save-as-late'], expect: 'a late Save As did not land' },
    { plant: 'edit-rows-top-document', target: 'iframe-edit-rows', run: ['iframe-edit-rows'], expect: 'edit rows followed the outer page, not the iframe' },
    { plant: 'pointerlock-standin-missing', target: 'pointer-lock-warning', run: ['pointer-lock-warning'], expect: 'no pointer-lock warning' },
    { plant: 'tab-switch-stays-fullscreen', target: 'element-fullscreen', run: ['element-fullscreen'], expect: 'tab switch left fullscreen on' },
    // 39-07 (35 T19 WR-04, T20 WR-06).
    { plant: 'status-clear-pointer-only', target: 'link-status-clear', run: ['link-status-clear'], expect: 'status line kept a link after a tab switch' },
    { plant: 'inspect-offered-unchecked', target: 'inspect-policy', run: ['inspect-policy'], expect: 'Inspect row shown under the DevTools policy' },
];

/** --self-test --scenario a,b: only the plants targeting a or b, and a clean control over the scenarios they run. */
function selectedPlants(args) {
    if (!args.includes('--scenario')) {
        return { plants: PLANTS, control: Object.keys(SCENARIOS) };
    }
    const only = selectedScenarios(args);
    const plants = PLANTS.filter(c => only.includes(c.target));
    if (!plants.length) {
        throw new Error(`no plant targets ${only.join(', ')}`);
    }
    const run = new Set(plants.flatMap(c => c.run));
    return { plants, control: Object.keys(SCENARIOS).filter(n => run.has(n)) };
}

async function selfTest(args) {
    let failed = 0;
    let plants;
    let control;
    try {
        ({ plants, control } = selectedPlants(args));
    } catch (error) {
        console.error(`${NAME} --self-test: ${error.message}`);
        return 1;
    }
    try {
        const clean = await runSession(control);
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
    for (const c of plants) {
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
    const limited = plants.length < PLANTS.length ? ` (limited by --scenario; ${PLANTS.length - plants.length} plant(s) not run)` : '';
    console.log(`${NAME} --self-test: PASS -- the clean control is green and all ${plants.length} planted faults went red: ${plants.map(c => c.plant).join(', ')}${limited}`);
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
    console.log(`Usage: node scripts/${NAME}.mjs [--scenario ${Object.keys(SCENARIOS).join(',')}] | --self-test [--scenario a,b]`);
    process.exit(0);
}
process.exit(args.includes('--self-test') ? await selfTest(args) : await main(args));
