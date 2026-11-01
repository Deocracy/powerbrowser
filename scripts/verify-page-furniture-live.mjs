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
 *
 * A self-test plant is a runtime mutation in its own session (a chrome-scope
 * or Theia-frame evaluate), never a file edit, and notes `PLANT <name>
 * applied` only after reading the mutation back.
 */
import {
    BROKEN,
    inChrome,
    loadedAt,
    makeCurrent,
    openWebTab,
    overlayVisibility,
    pushes,
    serveNavPages,
    waitForPush,
    withProbeShell,
} from './lib/pb-live-probe.mjs';
import { pollFor, probe, sourceConst } from './lib/pb-relaunch.mjs';

const MODES_ACTIVATE_COMMAND_ID = sourceConst('theia/extensions/modes/src/browser/modes-commands.ts', 'MODES_ACTIVATE_COMMAND_ID');

const NAME = 'verify-page-furniture-live';
const TOOLTIP_TEXT = 'Furniture tooltip';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const PAGES = {
    '/furniture': {
        title: 'Furniture',
        body: '<style>body { font: 24px sans-serif; margin: 40px; } p { margin: 48px 0; }</style>'
            + '<p><a id="link" href="/target">Target link</a></p>'
            + '<p id="plain">Plain text</p>'
            + `<p><span id="tip" title="${TOOLTIP_TEXT}">Has a tooltip</span></p>`,
    },
    '/target': { title: 'Target', body: '<p>target</p>' },
    '/ide-link': { title: 'IDE link', body: '<p>ide</p>' },
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

const SCENARIOS = {
    'tooltip-status': tooltipStatus,
    'theia-hover-silent': theiaHoverSilent,
    'pip-close': pipClose,
};

/** The scenario each absence scenario takes as its positive control. */
const CONTROL_OF = { 'theia-hover-silent': 'tooltip-status' };

/** One session over `names`; returns `[{ name, failures, notes, notScored }]` or throws. */
async function runSession(names, plant = '') {
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
