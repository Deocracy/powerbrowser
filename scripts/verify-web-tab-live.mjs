#!/usr/bin/env node
/**
 * GUI-02's in-shell web tab, PROVEN BY OBSERVATION in the built shell
 * (14.1-01 tracer; 14.1-03 v2: the whole contract).
 *
 * The overlay bridge has no bare-Node observable: the placeholder is a Theia
 * widget in a live frontend, the page is a chrome-owned <xul:browser> in the
 * shell window, and the only thing that joins them is the PowerBrowserGroup
 * actor channel inside the built binary. Every static gate in the tree reads
 * text; this file drives the real product and looks at the real contexts.
 *
 * WHAT IT DRIVES -- Chris's own sequence, through the product's own paths:
 *   1. the chrome bar's New Tab command ("+");
 *   2. a typed address committed with Enter in the pill (React-compatible
 *      value write + `input` event, then a `keydown` Enter);
 *   3. a second typed address, which must navigate the SAME overlay;
 *   3b. the overlay dropped from under the widget (chrome asked to close the
 *      tab while the placeholder stays open, which is what a chrome-side
 *      restart leaves behind), then ONE Reload;
 *   4. the mode walk Coding -> Browsing -> Organising -> Browsing -> Coding,
 *      derived from mode-descriptors.ts in source order, through the modes
 *      activate command (second visits included);
 *   5. the chrome-side tab store, read through the frontend's own
 *      ChromeBarSuggestionService (a reader independent of the writer);
 *   5b. thumbnail attribution: the overlay navigated to a THIRD served page
 *      whose response is written but never ended -- the document commits and
 *      paints while the network never reaches STOP, so the on-load capture arm
 *      cannot fire for it -- and then hidden through the product's own
 *      geometry message, leaving the last-view arm of `webTabGeometry`
 *      (PowerBrowserAPI.sys.mjs:2358-2365) as the only site that can account
 *      for the snapshot the row ends up carrying;
 *   6. the tab's close glyph (`widget.close()`).
 *
 * WHAT IT ASSERTS, each a named failure: zero `window.open` calls; exactly
 * one new main-area title from the web-tab factory, focused pill, "New Tab"
 * label; the overlay is a SECOND top-level BiDi context carrying the served
 * URL whose screen rect (`mozInnerScreenX/Y`, `innerWidth/Height`, read
 * INSIDE the overlay with `evaluateIn`) equals the placeholder's screen rect
 * within 1 CSS px on all four edges; the second commit changes that same
 * context's URL (id unchanged); the pill equals chrome's canonical URL and
 * `uriOf(widget)` equals the overlay's live URL; Back is disabled after the
 * first commit and enabled after the second; the tab stays attached and in
 * the main area across every hop, realigned wherever it is current and
 * hidden (`document.hidden` in the overlay) wherever it is not; a store row
 * a dropped overlay puts the shipped lost-view copy in the tab body with no
 * user action and ONE Reload brings the page back aligned (G-14.1.1-4 -- made
 * non-vacuous by the clean control passing all three while the
 * `lost-view-ignored` plant, which restores the discarded geometry reply,
 * fails them); a web tab described under a FOREIGN session's id is refused by
 * the same `WidgetFactory` seam the stock layout restorer calls, and a second
 * "+" mints an id distinct from the first (G-14.1.1-5); a store row
 * for the served URL is readable after navigation and gone after close; three
 * thumbnail assertions in the order the attribution runs -- after the hide the
 * tab's row (NG-001: one row per tab, `web:<tabId>`) carries a snapshot that
 * replaced the one it held before, that snapshot is a PNG data URL, and its
 * length is inside the capture cap derived from the boundary file
 * (G-14.1.1-6); that evidence is ATTRIBUTABLE because the hanging page never
 * reaches network STOP and the baseline is read after the settle window, so
 * the hide is the only capture opportunity on that page. The residual limitation, stated rather than
 * implied: no plant in this file can edit chrome-side source -- every plant
 * runs in the page realm -- so `hide-not-published` removes the FRONTEND half
 * of that one causal chain, and deleting the chrome-side last-view arm at
 * PowerBrowserAPI.sys.mjs:2358-2365 produces the same three reds, which is the
 * property G-14.1.1-6 asks for. Also: no
 * context carries a served URL after close; the main-area id set after close
 * equals the set before "+"; the shell's own POWERBROWSER_SHELL_READY line
 * is PRESENT in the launched binary's stdout (never an absence assertion).
 *
 * NO HEADLESS COMPENSATION (G-14.1.1-20): nothing in this check helps the
 * chrome bar learn which tab is selected, and that is deliberate. The pill
 * assertion stands on the strip-selection binding alone --
 * `shell.mainPanel.onDidChangeCurrent` in chrome-bar-widget.tsx -- so a
 * regression that re-keys the pill on DOM focus of the placeholder goes red
 * here rather than being propped up into looking correct. The
 * `focus-keyed-pill` plant is what proves that red is reachable. Per-hop
 * currency is read from the main dock's `currentTitle` (Lumino state), as v1
 * did.
 *
 * WHAT IT DERIVES, never hand-keeps: factory id, empty-page URL, state event
 * name, the three class names and the DI binding line from web-tab.ts and
 * the frontend module; the New Tab command id and the pill input class from
 * chrome-bar-commands.ts; the shipped mode ids (exactly three), the activate
 * command id and the organising widget id from the modes extension. A zero
 * derivation is a named FAIL (broken instrument), never a skip.
 *
 * The served pages come from a `node:http` server this script starts on an
 * ephemeral loopback port, so no fixture host on the network is involved and
 * the URL the overlay must carry is known exactly.
 *
 * HONESTLY TIERED -- THIS CANNOT BE `--quick`. It launches the built
 * `objdir/dist/bin/powerbrowser` headless over WebDriver BiDi and needs the
 * last Theia app build (fresh profile, so chrome-side edits are live, but the
 * frontend bundle is whatever `theia build` last wrote). Register it in the
 * full set, never the commit gate. One clean run is roughly a minute;
 * `--self-test` boots thirteen sessions (the clean control plus twelve plants).
 *
 * Usage:
 *   node scripts/verify-web-tab-live.mjs
 *   node scripts/verify-web-tab-live.mjs --self-test
 *   node scripts/verify-web-tab-live.mjs --help
 *
 * No import of any package name -- Node built-ins and scripts/lib/firefox-bidi.mjs
 * only (D-69).
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withFirefoxPage } from './lib/firefox-bidi.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-web-tab-live';

const WEB_TAB_REL = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const MODULE_REL = 'theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts';
const CHROME_BAR_COMMANDS_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts';
const CHROME_BAR_WIDGET_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx';
/** The pill (30-01, D-04): closeDropdown, the debounce and the dropdown class live here. */
const ADDRESS_BAR_REL = 'theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx';
const DESCRIPTORS_REL = 'theia/extensions/modes/src/browser/mode-descriptors.ts';
const MODES_COMMANDS_REL = 'theia/extensions/modes/src/browser/modes-commands.ts';
const ORGANISING_REL = 'theia/extensions/modes/src/browser/organising-widget.ts';
const SHELL_API_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';

/** The shell's own readiness sentinel (powerbrowser.js dump channel). */
const SHELL_READY_SENTINEL = 'POWERBROWSER_SHELL_READY';

/** Alignment tolerance, CSS px, on each of sx / sy / w / h. */
const ALIGN_TOLERANCE_PX = 1;

/**
 * The session discriminator the restore probe pretends a persisted layout was
 * written under. Deliberately longer than the six base-36 characters
 * `WEB_TAB_SESSION` can ever be, so it cannot collide with a live session by
 * accident -- the probe must be foreign every single run, not usually.
 */
const FOREIGN_SESSION = 'notthissession';

const HELP = `Usage: node scripts/${NAME}.mjs [--self-test]

GUI-02: drives the built shell through "+", a typed address, a second typed
address, the five-hop mode walk, the tab store and close, and asserts the
in-shell web tab's overlay is aligned, persistent, navigated in place and
cleaned up -- with zero window.open calls. Needs the built browser and the
last Theia app build; not a --quick check.

  --self-test  Re-run the protocol with planted faults; each must go red
  --help       Print this message and exit 0
`;

// --------------------------------------------------------------------------
// Tree derivations. Every expectation the live half compares against is read
// off a source here; nothing below is spelled twice.
// --------------------------------------------------------------------------

function read(rel) {
    return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

function derive() {
    const failures = [];
    const webTab = read(WEB_TAB_REL);
    const factoryId = /WEB_TAB_FACTORY_ID\s*=\s*'([^']+)'/.exec(webTab)?.[1];
    if (!factoryId) {
        failures.push(`${WEB_TAB_REL}: derived NO web-tab factory id -- the check cannot tell a web tab from any other main-area widget`);
    }
    const emptyUrl = /EMPTY_PAGE_URL\s*=\s*'([^']+)'/.exec(webTab)?.[1];
    if (!emptyUrl) {
        failures.push(`${WEB_TAB_REL}: derived NO empty-page URL -- "+" opens it and the New Tab plant needs it`);
    }
    const stateEvent = /WEB_TAB_STATE_EVENT\s*=\s*'([^']+)'/.exec(webTab)?.[1];
    if (!stateEvent) {
        failures.push(`${WEB_TAB_REL}: derived NO state event name -- the state-ignored plant has no listener to remove`);
    }
    const requestEvent = /GROUP_REQUEST_EVENT\s*=\s*'([^']+)'/.exec(webTab)?.[1];
    if (!requestEvent) {
        failures.push(`${WEB_TAB_REL}: derived NO group request event name -- the swallow plant has nothing to drop`);
    }
    const blockingSelector = /BLOCKING_LAYER_SELECTOR\s*=\s*'([^']+)'/.exec(webTab)?.[1];
    if (!blockingSelector) {
        failures.push(`${WEB_TAB_REL}: derived NO blocking-layer selector -- a hidden overlay could not be explained by the layer that hid it`);
    }
    // Double-quoted in source (the copy carries an apostrophe). Read here so
    // the lost-view assertion compares against the shipped literal rather
    // than a second hand-typed copy of it.
    const lostViewCopy = /LOST_VIEW_COPY\s*=\s*"([^"]+)"/.exec(webTab)?.[1];
    if (!lostViewCopy) {
        failures.push(`${WEB_TAB_REL}: derived NO lost-view copy -- the lost-view assertion has no shipped string to compare the tab body against`);
    }
    const handlerClass = /export class (\w+)\s+implements OpenHandler/.exec(webTab)?.[1];
    if (!handlerClass) {
        failures.push(`${WEB_TAB_REL}: derived NO open-handler class -- the protocol resolves the handler by its class name and cannot invent one`);
    }
    const widgetClass = /export class (\w+)\s+extends BaseWidget/.exec(webTab)?.[1];
    if (!widgetClass) {
        failures.push(`${WEB_TAB_REL}: derived NO widget class -- the geometry plant has no publisher to silence`);
    }
    const channelClass = /export class (\w+)\s*\{/.exec(webTab)?.[1];
    if (!channelClass) {
        failures.push(`${WEB_TAB_REL}: derived NO channel class -- the state-ignored plant has no listener to remove`);
    }
    const bound = handlerClass ? new RegExp(`toService\\(${handlerClass}\\)`).test(read(MODULE_REL)) : false;
    if (handlerClass && !bound) {
        failures.push(`${MODULE_REL}: no 'toService(${handlerClass})' binding -- the handler is not registered with OpenerService, so nothing in the product can reach it`);
    }

    const chromeBar = read(CHROME_BAR_COMMANDS_REL);
    const newTabCommandId = /CHROME_BAR_NEW_TAB_COMMAND_ID\s*=\s*'([^']+)'/.exec(chromeBar)?.[1];
    if (!newTabCommandId) {
        failures.push(`${CHROME_BAR_COMMANDS_REL}: derived NO New Tab command id -- "+" cannot be driven`);
    }
    const inputClass = /CHROME_BAR_INPUT_CLASS\s*=\s*'([^']+)'/.exec(chromeBar)?.[1];
    if (!inputClass) {
        failures.push(`${CHROME_BAR_COMMANDS_REL}: derived NO pill input class -- the typed commit has no input to type into`);
    }

    // The binding the pill assertion now stands on, alone (G-14.1.1-20), and
    // the class the focus-keyed-pill plant re-keys.
    const chromeBarWidget = read(CHROME_BAR_WIDGET_REL);
    const chromeBarContributionClass = /export class (\w+)\s+implements FrontendApplicationContribution/.exec(chromeBarWidget)?.[1];
    if (!chromeBarContributionClass) {
        failures.push(`${CHROME_BAR_WIDGET_REL}: derived NO chrome-bar contribution class -- the focus-keyed-pill plant has no strip-selection binding to re-key`);
    }
    if (!/mainPanel\.onDidChangeCurrent\(/.test(chromeBarWidget)) {
        failures.push(`${CHROME_BAR_WIDGET_REL}: the pill no longer follows 'mainPanel.onDidChangeCurrent' -- the strip-selection binding the pill assertion stands on is gone, so a green pill here would mean nothing`);
    }
    // G-14.1.1-7: the dropdownAfterEnter phase must commit STRICTLY INSIDE the
    // suggestion debounce, which is the whole timing the guard exists for. The
    // interval is read off the source that sets it -- a hand-typed 150 here
    // would silently stop exercising the race the day the debounce changes.
    const addressBar = read(ADDRESS_BAR_REL);
    const addressBarClass = /protected closeDropdown\(/.test(addressBar) ? /export class (\w+)[^{]*\{/.exec(addressBar)?.[1] : undefined;
    if (!addressBarClass) {
        failures.push(`${ADDRESS_BAR_REL}: derived NO address-bar class owning closeDropdown -- the dropdown-rearms plant has no closeDropdown to disarm`);
    }
    const debounceMs = Number(/pDebounce\([\s\S]*?,\s*(\d+)\s*\)/.exec(addressBar)?.[1]);
    if (!debounceMs) {
        failures.push(`${ADDRESS_BAR_REL}: derived NO suggestion debounce interval -- the commit-inside-the-debounce phase would be timed by a guess, so a green there could not mean the late query was outrun`);
    }
    const dropdownClass = /className='(pb-chrome-bar-dropdown)' role='listbox'/.exec(addressBar)?.[1];
    if (!dropdownClass) {
        failures.push(`${ADDRESS_BAR_REL}: derived NO suggestion dropdown class -- a re-opened dropdown over the committed page would be unfindable, so its absence would assert nothing`);
    }

    // G-14.1.1-6: the capture cap the stored snapshot must fit inside. Read
    // off the boundary file that enforces it so the number is never typed
    // twice -- raising the cap there raises it here, and nowhere else.
    const shellApi = read(SHELL_API_REL);
    const thumbnailMaxChars = Number(/TAB_THUMBNAIL_CAPTURE_MAX_CHARS\s*=\s*(\d+)/.exec(shellApi)?.[1]);
    if (!thumbnailMaxChars) {
        failures.push(`${SHELL_API_REL}: derived NO thumbnail capture cap -- the stored snapshot's length could only be checked against a hand-typed number`);
    }
    // The settle window the thumbnail phase must outwait before it reads its
    // baseline: a baseline read inside the window would be a race, not an
    // absence, and the attribution would rest on timing rather than on the
    // hanging page. Read off the same boundary file, never hand-typed.
    const thumbnailSettleMs = Number(/TAB_THUMBNAIL_SETTLE_MS\s*=\s*(\d+)/.exec(shellApi)?.[1]);
    if (!thumbnailSettleMs) {
        failures.push(`${SHELL_API_REL}: derived NO thumbnail settle window -- the baseline read could only be timed by a guess, so its absence would prove nothing`);
    }

    const shipped = [...read(DESCRIPTORS_REL).matchAll(/^\s*id:\s*'([^']+)'/gm)].map(m => m[1]);
    if (shipped.length !== 3) {
        failures.push(`${DESCRIPTORS_REL}: derived ${shipped.length} shipped mode ids, expected exactly three (coding, browsing, organising) -- the walk cannot be built from a set of any other size`);
    }
    const activateCommandId = /MODES_ACTIVATE_COMMAND_ID\s*=\s*'([^']+)'/.exec(read(MODES_COMMANDS_REL))?.[1];
    if (!activateCommandId) {
        failures.push(`${MODES_COMMANDS_REL}: derived NO mode activate command id -- the walk drives the product's own switch path through that command`);
    }
    const organisingWidgetId = /static readonly ID = '([^']+)'/.exec(read(ORGANISING_REL))?.[1];
    if (!organisingWidgetId) {
        failures.push(`${ORGANISING_REL}: derived NO organising widget id -- the one contracted main-area mutation on a switch cannot be excluded from the id sets`);
    }
    // Chris's sequence, from the derived source order (Coding, Browsing,
    // Organising): every mode is visited twice, so second visits are covered.
    const walk = shipped.length === 3 ? [shipped[0], shipped[1], shipped[2], shipped[1], shipped[0]] : [];

    return {
        failures, factoryId, emptyUrl, stateEvent, requestEvent, blockingSelector, lostViewCopy,
        handlerClass, widgetClass, channelClass, chromeBarContributionClass,
        newTabCommandId, inputClass, shipped, activateCommandId, organisingWidgetId, walk,
        thumbnailMaxChars, thumbnailSettleMs, addressBarClass, debounceMs, dropdownClass,
    };
}

// --------------------------------------------------------------------------
// The served pages. Two titled documents on an ephemeral loopback port.
// --------------------------------------------------------------------------

const PAGES = {
    '/a': { title: 'Web tab A' },
    '/b': { title: 'Web tab B' },
    // G-14.1.1-6 thumbnail attribution. This response is written and NEVER
    // ended, so the document commits and paints while the network never
    // reaches STOP -- which takes the onStateChange capture arm
    // (PowerBrowserAPI.sys.mjs:2263) out of the set of sites that could have
    // filled this page's row. Its held socket is destroyed at teardown by
    // closeAllConnections, or server.close() would never resolve.
    '/c': { title: 'Web tab C', hang: true },
};

function servePages() {
    const server = createServer((req, res) => {
        const page = PAGES[req.url];
        if (!page) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end('not found');
            return;
        }
        // The padding is not decoration: the HTML parser flushes on byte count
        // as well as on end-of-stream, so a hanging page that is too short
        // could sit unparsed in a buffer and never paint at all.
        const padding = page.hang ? `<!--${'x'.repeat(4096)}-->` : '';
        const html = `<!doctype html><html><head><title>${page.title}</title></head><body><h1>${page.title}</h1>${padding}</body></html>`;
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        if (page.hang) {
            // Written, never ended: chunked, so the document commits and paints
            // while the load never completes and no network STOP is reached.
            res.write(html);
            return;
        }
        res.end(html);
    });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            const origin = `http://127.0.0.1:${port}`;
            resolve({
                origin,
                urls: { a: `${origin}/a`, b: `${origin}/b`, c: `${origin}/c` },
                // closeAllConnections FIRST: the hanging page holds its socket
                // open for the life of the run, and server.close() alone would
                // wait for it forever.
                close: () => new Promise(done => {
                    server.closeAllConnections();
                    server.close(() => done());
                }),
            });
        });
    });
}

// --------------------------------------------------------------------------
// The live half.
// --------------------------------------------------------------------------

/**
 * Inversify identifier lookup by NAME -- the same walk verify-mode-switch-
 * tabs-live.mjs and verify-gui01-command.mjs use, for the same reason: BiDi
 * `script.evaluate` runs a bare expression in the page realm with no module
 * resolution, so DI identifier VALUES are unreachable. Pinned against
 * inversify 6.2.2's `_bindingDictionary`.
 */
const GET_BY_NAME = `
function __getByName(container, name) {
    let found;
    container._bindingDictionary.traverse(key => {
        if (found) return;
        const keyStr = typeof key === 'symbol' ? key.toString() : (key && key.name) || String(key);
        if (keyStr === 'Symbol(' + name + ')' || keyStr === name) found = key;
    });
    if (!found) throw new Error('DI binding not found for identifier name: ' + name);
    return container.get(found);
}`;

/**
 * Page-realm helpers shared by every phase, installed once by the 'setup'
 * phase on `window.__pbWebTabProbe` (the probe) so later phases -- which run
 * as separate evaluations, because the Node side must read the overlay
 * context between them -- find the widget and the counters again.
 */
const PROBE_HELPERS = `
    P.settle = () => new Promise(resolve => setTimeout(resolve, 600));
    P.until = async (predicate, timeoutMs) => {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            let value;
            try { value = await predicate(); } catch (e) { value = false; }
            if (value) return true;
            if (Date.now() >= deadline) return false;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    };
    P.mainIds = () => P.shell.mainAreaTabBars
        .flatMap(bar => Array.from(bar.titles).map(title => title.owner.id))
        .filter(id => id !== P.cfg.organisingWidgetId);
    P.currentTitleIds = () => P.shell.mainAreaTabBars
        .map(bar => bar.currentTitle && bar.currentTitle.owner.id)
        .filter(id => typeof id === 'string');
    P.input = () => document.querySelector('.' + P.cfg.inputClass);
    P.backDisabled = () => {
        const button = document.querySelector('.pb-chrome-bar-button[aria-label="Back"]');
        return button ? button.disabled : undefined;
    };
    P.placeholderRect = () => {
        const r = P.widget.node.getBoundingClientRect();
        return { sx: window.mozInnerScreenX + r.left, sy: window.mozInnerScreenY + r.top, w: r.width, h: r.height };
    };
    P.uriOf = () => {
        const uri = P.registry.uriOf(P.widget);
        return uri ? uri.toString(true) : undefined;
    };
    P.lastSentVisible = () => {
        try { return JSON.parse(P.widget.lastSent).visible; } catch (e) { return undefined; }
    };
    // The widget's own visibility term, taken apart, so a hidden overlay is
    // explained by the factor that hid it (diagnostic record, not an assertion).
    P.visibility = () => ({
        attached: P.widget.isAttached,
        visible: P.widget.isVisible,
        hasPage: P.widget.hasPage,
        blocking: Array.from(document.querySelectorAll(P.cfg.blockingSelector))
            .filter(el => el.getClientRects().length > 0)
            .map(el => el.className || el.tagName),
    });
    // The React-compatible typed commit, split into its two halves so a phase
    // can put time between them -- or, for G-14.1.1-7, prove there was none.
    // Typing is the native value setter (so React's change tracker sees a
    // change) plus an input event (onChange, which arms the dropdown and
    // schedules the debounced query); the commit is Enter (onKeyDown).
    P.type = text => {
        const input = P.input();
        if (!input) throw new Error('no pill input to type into');
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    P.pressEnter = () => {
        const input = P.input();
        if (!input) throw new Error('no pill input to commit from');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    };
    P.commit = text => { P.type(text); P.pressEnter(); };
`;

/**
 * One phase of the protocol as a page-realm expression. `plant` is '' for
 * the real check; the self-test passes one of six fault names, each applied
 * in the 'setup' phase through the SAME code path the real run takes, so a
 * plant can only go red by the assertions actually working.
 */
function phaseExpression(cfg, phase, arg) {
    const body = {
        setup: `
        // FIRST, before anything else: count every window.open. A "+" or a
        // commit that falls back to the GUI-01 popup path is caught by count.
        window.__pbWebTabProbe = P;
        P.cfg = cfg;
        P.windowOpenCalls = 0;
        const realOpen = window.open;
        window.open = function (...args) {
            P.windowOpenCalls += 1;
            return realOpen.apply(window, args);
        };
        // Diagnostic record only, never an assertion: every state push chrome
        // delivers, as the raw event detail, so a red above can be read
        // against what chrome actually said.
        P.pushes = [];
        window.addEventListener(cfg.stateEvent, event => {
            try { P.pushes.push(JSON.stringify(event.detail)); } catch (e) { P.pushes.push('(unserialisable)'); }
        });
        ${PROBE_HELPERS}
        const container = window.theia.container;
        P.shell = __getByName(container, 'ApplicationShell');
        P.widgets = __getByName(container, 'WidgetManager');
        P.commands = __getByName(container, 'CommandRegistry');
        P.registry = __getByName(container, 'TabUriRegistry');
        P.channel = __getByName(container, cfg.channelClass);
        const handler = __getByName(container, cfg.handlerClass);
        // Tab rows only (NG-023): the address bar's own service also suggests
        // history, which outlives a closed tab, and this check reads the store.
        const suggestions = __getByName(container, 'ChromeBarTabSuggestions');
        // The store reader the check polls. Wrapped here so the store-unread
        // plant can replace the reader through one seam.
        P.search = (prefix, limit) => suggestions.searchByPrefix(prefix, limit);
        // G-14.1.1-6: the last-view snapshot reader. NOT ChromeBarSuggestionService
        // -- its row projection drops the thumbnail column, so the only frontend
        // reader that can see one is GroupQueryService, the same backend handle
        // (TabQueryService) behind one more RPC method. Wrapped here so every
        // phase reads a snapshot through one seam; no plant strips this reader
        // any more -- stripping the READ scored the thumbnail assertions without
        // touching any capture site, which is the defect 14.1.1-06 removed.
        const groups = __getByName(container, 'GroupQueryService');
        // NG-027 deleted the point read; the row readers carry the same column.
        P.thumbnailOf = async uri => {
            const loose = (await groups.listUngroupedTabs()).find(row => row.uri === uri);
            if (loose) return loose.thumbnail ?? undefined;
            for (const group of await groups.listGroups()) {
                const row = (await groups.getGroupTabs(group.id)).find(r => r.uri === uri);
                if (row) return row.thumbnail ?? undefined;
            }
            return undefined;
        };
        // G-14.1.1-6: the ONE geometry message that tells chrome the overlay
        // stopped being visible, behind a named seam so a plant can remove this
        // hide alone -- the mode walk's own hides must keep working or the walk
        // assertions would go red for an unrelated reason.
        // send, NOT request: the geometry reply is deliberately withheld by the
        // lost-view-ignored plant, and a phase that awaited it would hang that
        // whole session rather than let the plant go red on its own assertion.
        P.hideOverlay = async () => {
            P.channel.send({ kind: 'webTabGeometry', tabId: P.widget.tabId, x: 0, y: 0, w: 0, h: 0, visible: false });
        };

        if (cfg.plant === 'swallow') {
            const realDispatch = document.dispatchEvent.bind(document);
            document.dispatchEvent = event => (event && event.type === cfg.requestEvent) ? true : realDispatch(event);
            report.notes.push('PLANT swallow: document.dispatchEvent drops every ' + cfg.requestEvent + ' event, so nothing reaches the actor child');
        } else if (cfg.plant === 'popup') {
            Object.getPrototypeOf(handler).openUrl = function (url) {
                window.open(url, '_blank');
                return undefined;
            };
            report.notes.push('PLANT popup: ' + cfg.handlerClass + '.openUrl replaced by a window.open fallback');
        } else if (cfg.plant === 'no-geometry') {
            const proto = Object.getPrototypeOf(__getByName(container, cfg.widgetClass));
            if (typeof proto.publish !== 'function') {
                fail('plant no-geometry could not be applied: ' + cfg.widgetClass + '.prototype.publish is not a function');
            } else {
                proto.publish = function () {};
                report.notes.push('PLANT no-geometry: ' + cfg.widgetClass + '.prototype.publish is a no-op, so chrome never receives a rect');
            }
        } else if (cfg.plant === 'lost-view-ignored') {
            const proto = Object.getPrototypeOf(__getByName(container, cfg.widgetClass));
            if (typeof proto.publish !== 'function') {
                fail('plant lost-view-ignored could not be applied: ' + cfg.widgetClass + '.prototype.publish is not a function');
            } else {
                // The pre-fix behaviour, restored without re-implementing the
                // rect computation: the real publish still runs, but its
                // geometry request is dispatched through the channel's
                // fire-and-forget path and its reply is discarded, exactly as
                // it was before G-14.1.1-4 was closed.
                const realPublish = proto.publish;
                proto.publish = function () {
                    const channel = this.channel;
                    if (channel && !channel.__pbGeometryReplyDiscarded) {
                        channel.__pbGeometryReplyDiscarded = true;
                        const realRequest = channel.request.bind(channel);
                        channel.request = msg => {
                            if (msg && msg.kind === 'webTabGeometry') {
                                channel.send(msg);
                                return new Promise(() => {});
                            }
                            return realRequest(msg);
                        };
                    }
                    return realPublish.call(this);
                };
                report.notes.push('PLANT lost-view-ignored: the geometry publish dispatches fire-and-forget, so the unknown-tab outcome of its reply is discarded');
            }
        } else if (cfg.plant === 'focus-keyed-pill') {
            // The regression G-14.1.1-20 says must be catchable: the pill is
            // re-keyed off DOM focus of the placeholder instead of the strip's
            // selection. Reached through the DI container, like the channel and
            // handler plants above.
            const barContribution = __getByName(container, cfg.chromeBarContributionClass);
            const barProto = Object.getPrototypeOf(barContribution);
            if (typeof barProto.syncCurrentWidget !== 'function') {
                fail('plant focus-keyed-pill could not be applied: ' + cfg.chromeBarContributionClass + '.prototype.syncCurrentWidget is not a function');
            } else {
                const realSync = barProto.syncCurrentWidget;
                // The strip-selection subscription is already live and its
                // Disposable was never handed out, so it is disconnected by
                // making the method it calls a no-op...
                barProto.syncCurrentWidget = function () { };
                // ...and the SAME call is re-keyed on a focus landing anywhere
                // inside a main-area widget's node.
                document.addEventListener('focus', event => {
                    const owner = P.shell.mainAreaTabBars
                        .flatMap(tabBar => Array.from(tabBar.titles).map(title => title.owner))
                        .find(candidate => candidate.node.contains(event.target));
                    if (owner) {
                        realSync.call(barContribution, owner);
                    }
                }, true);
                report.notes.push('PLANT focus-keyed-pill: ' + cfg.chromeBarContributionClass + '.syncCurrentWidget no longer follows the strip selection and is re-keyed on DOM focus of the widget node');
            }
        } else if (cfg.plant === 'restore-recreates') {
            // The pre-fix behaviour: the WidgetFactory admits any id, so a
            // persisted layout re-creates last session's web tabs. Reached
            // through the WidgetManager's own factory table -- the same seam
            // ShellLayoutRestorer goes through -- not through the DI binding,
            // which is already resolved by now.
            const factory = P.widgets.factories && P.widgets.factories.get(cfg.webTabFactoryId);
            if (!factory || typeof factory.createWidget !== 'function') {
                fail('plant restore-recreates could not be applied: no createWidget on the registered factory for ' + cfg.webTabFactoryId);
            } else {
                const widgetCtor = __getByName(container, cfg.widgetClass).constructor;
                factory.createWidget = options => {
                    const widget = container.get(widgetCtor);
                    widget.init(options);
                    return widget;
                };
                report.notes.push('PLANT restore-recreates: the ' + cfg.webTabFactoryId + ' factory admits any construction id again, so a persisted layout can re-create last session\\'s web tabs');
            }
        } else if (cfg.plant === 'state-ignored') {
            if (typeof P.channel.onState !== 'function') {
                fail('plant state-ignored could not be applied: ' + cfg.channelClass + '.onState is not a function');
            } else {
                window.removeEventListener(cfg.stateEvent, P.channel.onState);
                report.notes.push('PLANT state-ignored: the ' + cfg.stateEvent + ' listener was removed, so chrome pushes never reach the widget');
            }
        } else if (cfg.plant === 'dropdown-rearms') {
            // The pre-fix behaviour of G-14.1.1-7, restored at the real seam:
            // closing the dropdown on user intent no longer disarms the bar, so
            // the query the last keystroke scheduled passes runQuery's armed
            // guard after the commit and re-opens the dropdown over the page.
            // The querySeq bump is deliberately LEFT IN PLACE -- it never
            // caught that query anyway (runQuery takes its sequence after the
            // guard), and removing it too would plant a second fault.
            const bar = __getByName(container, cfg.addressBarClass);
            const barProto = Object.getPrototypeOf(bar);
            if (typeof barProto.closeDropdown !== 'function') {
                fail('plant dropdown-rearms could not be applied: ' + cfg.addressBarClass + '.prototype.closeDropdown is not a function');
            } else {
                const realClose = barProto.closeDropdown;
                barProto.closeDropdown = function () {
                    realClose.call(this);
                    this.dropdownArmed = true;
                };
                report.notes.push('PLANT dropdown-rearms: ' + cfg.addressBarClass + '.prototype.closeDropdown leaves the bar armed, so a query still in flight at Enter re-opens the dropdown over the committed page');
            }
        } else if (cfg.plant === 'hide-not-published') {
            // WHAT THE RED PROVES: that the stored snapshot exists only because
            // the overlay was hidden. The thumbnail phase runs on a page whose
            // response is never ended, so the network-STOP arm never fires for
            // it and the hide is the ONLY site that can fill its row; removing
            // the hide therefore empties the row and the same three assertions
            // that a deletion of the chrome-side last-view arm at
            // PowerBrowserAPI.sys.mjs:2358-2365 would empty go red here. That is
            // the attribution G-14.1.1-6 asks for.
            //
            // WHAT IT DOES NOT PROVE, plainly: no plant in this file can edit
            // chrome-side source -- every plant runs in the page realm -- so
            // this removes the FRONTEND half of that one causal chain rather
            // than the chrome half. The two halves are the same chain: with no
            // geometry message saying visible=false, webTabGeometry's last-view
            // arm is never reached at all.
            //
            // No landing guard here, deliberately: P.hideOverlay is assigned
            // unconditionally above in this same phase, so a typeof test on it
            // could never be false (review IN-02). The PLANT note below is the
            // landing evidence the self-test actually reads.
            P.hideOverlay = async () => { };
            report.notes.push('PLANT hide-not-published: the frontend never tells chrome the overlay stopped being visible, so the last-view arm of webTabGeometry is never reached and no capture is ever scheduled for the hanging page');
        } else if (cfg.plant === 'store-unread') {
            P.search = async () => [];
            report.notes.push('PLANT store-unread: the store reader returns no rows');
        } else if (cfg.plant === 'newtab-noop') {
            // Deliberately NOT a window.open reroute: the New Tab command routes
            // handler.open(uri), which delegates straight to openUrl, so a
            // popup here would drive the identical red set the 'popup' plant
            // drives and neither red would name its own fault. A handler that
            // does nothing proves 'newtab:' reachable with zero window.open
            // calls, which leaves 'popup:' red under exactly one plant.
            // (No backticks in this block: it lives inside a template literal.)
            const handlers = P.commands._handlers && P.commands._handlers[cfg.newTabCommandId];
            if (!handlers || !handlers.length) {
                fail('plant newtab-noop could not be applied: no handler registered for ' + cfg.newTabCommandId);
            } else {
                handlers.splice(0, handlers.length, { execute: () => { } });
                report.notes.push('PLANT newtab-noop: ' + cfg.newTabCommandId + ' opens nothing at all');
            }
        } else if (cfg.plant === 'close-ignored') {
            // The three 'close:' assertions are ABSENCE assertions (no store row
            // for a served URL, no browsing context carrying one, no main-area
            // id residue), and until this plant nothing in the file showed any
            // of them could go red. Patched on the same widget prototype the
            // no-geometry plant reaches; the widget "+" creates inherits it.
            const proto = Object.getPrototypeOf(__getByName(container, cfg.widgetClass));
            if (typeof proto.close !== 'function') {
                fail('plant close-ignored could not be applied: ' + cfg.widgetClass + '.prototype.close is not a function');
            } else {
                proto.close = function () { };
                report.notes.push('PLANT close-ignored: ' + cfg.widgetClass + '.prototype.close is a no-op, so the widget never closes and the overlay context, the store row and the main-area id all survive the close phase');
            }
        }

        report.mainIdsBefore = P.mainIds();
        P.mainIdsBefore = report.mainIdsBefore;

        // --- NEW TAB ("+") ---------------------------------------------------
        report.steps.push('new tab');
        await P.commands.executeCommand(cfg.newTabCommandId);
        await P.settle();
        const after = P.mainIds();
        const added = after.filter(id => !report.mainIdsBefore.includes(id));
        report.addedIds = added;
        if (added.length !== 1) {
            fail('newtab: "+" added ' + added.length + ' main-area title(s) [' + added.join(', ') + '], expected exactly one');
        }
        const owners = P.shell.mainAreaTabBars
            .flatMap(bar => Array.from(bar.titles).map(title => title.owner))
            .filter(owner => added.includes(owner.id));
        P.widget = owners[0];
        if (!P.widget) {
            // Thrown, not returned: the phase must still hand back its report
            // (window.open count included) for the assertions to read.
            throw new Error('"+" produced no web-tab widget in the main area');
        }
        report.widgetId = P.widget.id;
        report.widgetFactoryId = (P.widgets.getDescription(P.widget) || {}).factoryId;
        report.newTabLabel = P.widget.title.label;
        report.pillFocused = document.activeElement === P.input();
        report.pillValueAfterNewTab = P.input() ? P.input().value : undefined;
        report.currentAfterNewTab = P.currentTitleIds().includes(P.widget.id);

        // No headless compensation (G-14.1.1-20, file header): measured as the
        // product leaves it, with nothing dispatched to help it along.
        await P.settle();
        report.isShellCurrentWidget = P.shell.currentWidget === P.widget;
        report.notes.push('shell.currentWidget is the tab: ' + report.isShellCurrentWidget + ' -- RECORDED, not asserted: it follows Lumino FocusTracker, which a headless window never feeds. Selection is asserted through the dock currentTitle instead (Lumino state, no focus needed)');

        // --- TYPED COMMIT A ---------------------------------------------------
        report.steps.push('commit ' + cfg.typedA);
        P.commit(cfg.typedA);
        // The strip label is waited on beside the pill, and asserted below: the
        // wait bounds a green run, it cannot manufacture one -- a label that
        // never arrives times out here exactly as the pill already did.
        await P.until(() => P.widget.hasPage && P.input() && P.input().value === cfg.servedA
            && P.widget.title.label === cfg.servedATitle, 8000);
        await P.settle();
        report.afterA = {
            widgetUrl: P.widget.url,
            hasPage: P.widget.hasPage,
            lostView: P.widget.lostView,
            placeholderRect: P.placeholderRect(),
            uriOf: P.uriOf(),
            pill: P.input() ? P.input().value : undefined,
            // Only a chrome state push can put the served page's <title> here
            // (WebTabWidget.refreshTitle falls back to the URL, then to "New
            // Tab"), so this reads the push itself rather than the bar binding.
            titleLabel: P.widget.title.label,
            backDisabled: P.backDisabled(),
            mainIds: P.mainIds(),
        };`,

        commitB: `
        report.steps.push('commit ' + cfg.servedB);
        P.commit(cfg.servedB);
        await P.until(() => P.input() && P.input().value === cfg.servedB && P.widget.canGoBack, 8000);
        await P.settle();
        report.afterB = {
            widgetUrl: P.widget.url,
            placeholderRect: P.placeholderRect(),
            uriOf: P.uriOf(),
            pill: P.input() ? P.input().value : undefined,
            backDisabled: P.backDisabled(),
            canGoBack: P.widget.canGoBack,
            canGoForward: P.widget.canGoForward,
            mainIds: P.mainIds(),
            pushes: P.pushes.slice(),
            visibility: P.visibility(),
            lastSent: P.widget.lastSent,
        };`,

        // G-14.1.1-7. The fix is already in tree (closeDropdown disarms the bar,
        // runQuery refuses to open while disarmed) but nothing exercised its
        // timing, so a regression would have stayed green. The race is: the
        // LAST keystroke before Enter schedules a debounced query, and that
        // query lands AFTER the commit. Reproduce it by pressing Enter with no
        // time at all between the two -- P.type then P.pressEnter back to back,
        // which is why P.commit was split -- then wait past the derived
        // debounce so the late query has certainly run.
        //
        // The typed text is the served URL with an upper-case scheme, exactly
        // as the first commit types it: it must DIFFER from what the pill
        // already shows or React's change tracker sees no change, no onChange
        // fires, nothing arms the bar and the phase would prove nothing. Chrome
        // canonicalises it back to the same page, so no other phase is
        // disturbed.
        dropdownAfterEnter: `
        report.steps.push('type a prefix and commit inside the ' + cfg.debounceMs + 'ms debounce');
        P.type(cfg.typedB);
        P.pressEnter();
        await new Promise(resolve => setTimeout(resolve, cfg.debounceMs));
        await P.settle();
        report.dropdownAfterEnter = {
            typed: cfg.typedB,
            dropdownPresent: !!document.querySelector('.' + cfg.dropdownClass),
            pill: P.input() ? P.input().value : undefined,
            rect: P.placeholderRect(),
            visibility: P.visibility(),
        };`,

        // G-14.1.1-4. The overlay is dropped from under a widget that does not
        // know it: chrome is asked to close the tab while the placeholder stays
        // open, which is what a chrome-side restart leaves behind. From there
        // the contract is two things -- the body must read the lost-view line
        // with no user action, and ONE Reload must bring the page back.
        lostView: `
        report.steps.push('drop the overlay from under the widget');
        report.lostView = { closeWhere: undefined, stateText: undefined, lostView: undefined };
        // The widget's own body node, not a hand-kept CSS class: a rename is a
        // named lost-view red rather than a silently unreadable body.
        const stateText = () => {
            const node = P.widget.stateNode;
            if (!node) {
                fail('lost-view: the widget exposes no state node, so the body copy cannot be read at all (broken instrument, never a clean pass)');
                return undefined;
            }
            return node.textContent;
        };
        const closeReply = await P.channel.request({ kind: 'webTabClose', tabId: P.widget.tabId });
        report.lostView.closeWhere = closeReply && closeReply.where;
        // One geometry publish that the dedupe cannot skip: this is the message
        // chrome answers while the user is idle, and the only one it answers.
        P.widget.lastSent = '';
        P.widget.publish();
        await P.settle();
        report.lostView.stateText = stateText();
        report.lostView.lostView = P.widget.lostView;

        report.steps.push('one Reload');
        const reloadReply = await P.widget.reload();
        report.lostView.reloadReplyWhere = reloadReply && reloadReply.where;
        await P.settle();
        report.lostView.afterOneReload = {
            lostView: P.widget.lostView,
            hasPage: P.widget.hasPage,
            stateText: stateText(),
            rect: P.placeholderRect(),
        };`,

        hop: `
        const hop = ${JSON.stringify(arg)};
        report.steps.push('activate ' + hop);
        await P.commands.executeCommand(cfg.activateCommandId, hop);
        await P.settle();
        report.hop = {
            hop,
            attached: P.widget.isAttached,
            inMain: P.mainIds().includes(P.widget.id),
            isCurrent: P.currentTitleIds().includes(P.widget.id),
            currentTitleIds: P.currentTitleIds(),
            placeholderRect: P.placeholderRect(),
            lastSentVisible: P.lastSentVisible(),
            lastSent: P.widget.lastSent,
            visibility: P.visibility(),
        };`,

        store: `
        report.steps.push('store rows for ' + cfg.servedOrigin);
        let rows = [];
        await P.until(async () => {
            rows = await P.search(cfg.servedOrigin, 8);
            return rows.some(row => row.url === cfg.servedB);
        }, 5000);
        report.rowsAfterNavigation = rows.map(row => ({ url: row.url, title: row.title }));`,

        // G-14.1.1-6 -- thumbnail attribution. Since 14.1 every tab Chris opens
        // is an overlay, so if the capture path can only see stock tabs every
        // Panorama card falls to the no-thumbnail state. Proving the LAST-VIEW
        // arm is what fills the row needs a page whose row nothing else can
        // fill, which is what servedC is: its response is written and never
        // ended, so the document commits and paints while the network never
        // reaches STOP and the onStateChange arm at PowerBrowserAPI.sys.mjs:2263
        // never fires for it. The overlay is navigated there through the
        // widget's own navigate() (the same webTabNavigate the pill commit
        // issues), the row written by chrome's onLocationChange is waited for,
        // the derived settle window is outwaited twice over, the baseline is
        // read -- and only then is the overlay hidden. NG-001: the row is the
        // TAB's (web:<tabId>, WebTabWidget.rowKey), so the baseline may be the
        // snapshot an earlier page of this tab left; nothing can change it
        // once the settle window is outwaited, so a snapshot that REPLACES it
        // after the hide is attributable to webTabGeometry's last-view arm and
        // to nothing else. The bytes themselves NEVER enter the report:
        // presence, replacement, prefix and length only.
        thumbnail: `
        report.steps.push('navigate the overlay to the hanging page ' + cfg.servedC);
        report.thumbnail = { hasThumbnail: false, prefixOk: false, length: 0, rowPresent: false, baseline: { absent: undefined, length: 0 } };
        await P.widget.navigate(cfg.servedC);
        // The row is updated by the overlay's own onLocationChange, so a row on
        // servedC is the proof that chrome took servedC as the tab's page --
        // the page any capture keyed on the tab's row would photograph.
        report.thumbnail.rowPresent = await P.until(async () => {
            const rows = await P.search(cfg.servedOrigin, 8);
            return rows.some(row => row.url === cfg.servedC);
        }, 6000);
        // Bail rather than wait out the two polls below when the row never
        // arrived: without it there is nothing to attribute a snapshot to, and
        // in a session where every actor request times out (the swallow plant)
        // the waits would push this phase past the BiDi evaluate budget and the
        // plant would report 'could not be driven' instead of its own red.
        if (!report.thumbnail.rowPresent) {
            fail('thumbnail: no store row for the hanging page ' + cfg.servedC + ' appeared after the overlay was navigated there, so chrome never took it as the overlay current URI and no capture could be keyed on it (broken instrument, never a clean pass)');
        } else {
        // Longer than twice the derived settle window: whatever any other arm
        // might have scheduled for this tab has certainly fired by now, so the
        // baseline below is settled rather than a race.
        await new Promise(resolve => setTimeout(resolve, cfg.thumbnailSettleMs * 2 + 500));
        const baseline = await P.thumbnailOf(P.widget.rowKey);
        report.thumbnail.baseline = {
            absent: !(typeof baseline === 'string' && baseline.length > 0),
            length: typeof baseline === 'string' ? baseline.length : 0,
        };

        report.steps.push('hide the overlay, then read its last-view snapshot');
        await P.hideOverlay();
        let snapshot;
        const fresh = () => typeof snapshot === 'string' && snapshot.length > 0 && snapshot !== baseline;
        await P.until(async () => {
            snapshot = await P.thumbnailOf(P.widget.rowKey);
            return fresh();
        }, 8000);
        // Only a snapshot that replaced the baseline is the hide's evidence.
        const taken = fresh() ? snapshot : undefined;
        report.thumbnail.hasThumbnail = typeof taken === 'string';
        report.thumbnail.prefixOk = typeof taken === 'string' && taken.startsWith('data:image/png;base64,');
        report.thumbnail.length = typeof taken === 'string' ? taken.length : 0;
        // Put the overlay back where the run found it, through the widget's own
        // publisher, so the phases after this one see the product's state and
        // not this phase's leftovers.
        P.widget.lastSent = '';
        P.widget.publish();
        await P.settle();
        }`,

        // G-14.1.1-5. Both halves of the gap, one mechanism. The stock layout
        // restorer describes every widget that has a WidgetManager description
        // and re-creates it through `getOrCreateWidget(factoryId, options)` --
        // the same public seam this phase calls, so no Theia-core code is
        // touched here and none is needed. A construction option whose id was
        // not minted this session must be refused; the restorer's own catch
        // turns that refusal into a dropped widget.
        restoreRepeat: `
        report.steps.push('construct a web tab from a foreign session id');
        report.restoreRepeat = { mintedId: P.widget.tabId };
        const idParts = P.widget.tabId.split('-');
        report.restoreRepeat.mintedIdPrefix = idParts.length >= 3 ? idParts[1] : undefined;
        const foreignId = 'wt-' + cfg.foreignSession + '-1';
        report.restoreRepeat.foreignId = foreignId;
        let foreignWidget;
        try {
            foreignWidget = await P.widgets.getOrCreateWidget(cfg.webTabFactoryId, { id: foreignId, url: cfg.emptyUrl });
            report.restoreRepeat.refusedForeignId = false;
        } catch (e) {
            report.restoreRepeat.refusedForeignId = true;
            report.restoreRepeat.refusalMessage = String((e && e.message) || e);
        }
        if (foreignWidget && typeof foreignWidget.dispose === 'function') {
            foreignWidget.dispose();
        }
        report.restoreRepeat.mainIdsAfter = P.mainIds();

        report.steps.push('a second "+"');
        const beforeSecond = P.mainIds();
        await P.commands.executeCommand(cfg.newTabCommandId);
        await P.settle();
        const addedSecond = P.mainIds().filter(id => !beforeSecond.includes(id));
        const ownersSecond = P.shell.mainAreaTabBars
            .flatMap(bar => Array.from(bar.titles).map(title => title.owner))
            .filter(owner => addedSecond.includes(owner.id));
        report.restoreRepeat.secondMintedId = ownersSecond[0] && ownersSecond[0].tabId;
        // Closed again straight away: the residue assertion at the end of the
        // run compares the main-area id set against the set before the first
        // "+", and this second tab is scaffolding for the distinctness half,
        // not a subject of the run.
        for (const owner of ownersSecond) {
            owner.close();
        }
        await P.settle();
        report.restoreRepeat.mainIdsAfterSecondClose = P.mainIds();`,

        close: `
        report.steps.push('close');
        P.widget.close();
        await P.settle();
        let rows = [];
        await P.until(async () => {
            rows = await P.search(cfg.servedOrigin, 8);
            return !rows.some(row => row.url === cfg.servedA || row.url === cfg.servedB || row.url === cfg.servedC);
        }, 5000);
        report.rowsAfterClose = rows.map(row => ({ url: row.url, title: row.title }));
        report.mainIdsAfterClose = P.mainIds();
        report.widgetDisposed = P.widget.isDisposed;
        report.windowOpenCalls = P.windowOpenCalls;`,
    }[phase];

    return `(async () => { ${GET_BY_NAME}
    const cfg = ${JSON.stringify(cfg)};
    const report = { phase: ${JSON.stringify(phase)}, failures: [], notes: [], steps: [] };
    const fail = message => report.failures.push(message);
    const P = ${phase === 'setup' ? '{}' : 'window.__pbWebTabProbe'};
    try {
        if (!P) throw new Error('the probe from the setup phase is gone');
        ${body}
    } catch (e) {
        fail('the ' + report.phase + ' phase threw at step [' + report.steps.join(' -> ') + ']: ' + String(e));
    }
    report.windowOpenCalls = P && P.windowOpenCalls;
    return JSON.stringify(report);
})()`;
}

/** Read inside the overlay: its screen rect and hidden state, as JSON. */
const OVERLAY_RECT_EXPR = 'JSON.stringify({ sx: window.mozInnerScreenX, sy: window.mozInnerScreenY, w: window.innerWidth, h: window.innerHeight, hidden: document.hidden })';

/** Poll the live context tree until `predicate(contexts)` holds, or the deadline passes. */
async function awaitContexts(topLevelContexts, predicate, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    let seen = [];
    for (;;) {
        seen = await topLevelContexts();
        if (predicate(seen)) {
            break;
        }
        if (Date.now() >= deadline) {
            break;
        }
        await new Promise(r => setTimeout(r, 250));
    }
    return seen;
}

function delta(a, b) {
    return Math.max(...['sx', 'sy', 'w', 'h'].map(key => Math.abs(Number(a[key]) - Number(b[key]))));
}

function rectString(r) {
    return r ? `(sx ${Number(r.sx).toFixed(1)}, sy ${Number(r.sy).toFixed(1)}, w ${Number(r.w).toFixed(1)}, h ${Number(r.h).toFixed(1)})` : '(none)';
}

async function runProtocol(derived, plant) {
    try {
        return await drive(derived, plant);
    } catch (error) {
        return { driveError: String(error), failures: [], notes: [], steps: [] };
    }
}

async function drive(derived, plant) {
    const pages = await servePages();
    // Removed in the finally below (review IN-03): the stdout log is read
    // inside the session callback, before that finally runs.
    const scratchDir = mkdtempSync(join(tmpdir(), 'powerbrowser-web-tab-live-'));
    const stdoutPath = join(scratchDir, 'shell-stdout.log');
    const cfg = {
        plant,
        handlerClass: derived.handlerClass,
        widgetClass: derived.widgetClass,
        channelClass: derived.channelClass,
        chromeBarContributionClass: derived.chromeBarContributionClass,
        requestEvent: derived.requestEvent,
        stateEvent: derived.stateEvent,
        blockingSelector: derived.blockingSelector,
        emptyUrl: derived.emptyUrl,
        webTabFactoryId: derived.factoryId,
        foreignSession: FOREIGN_SESSION,
        newTabCommandId: derived.newTabCommandId,
        inputClass: derived.inputClass,
        activateCommandId: derived.activateCommandId,
        organisingWidgetId: derived.organisingWidgetId,
        // Typed with an upper-case scheme: chrome canonicalises it, and the
        // pill must show the CANONICAL URL from the state push, not the typed
        // text -- which is what makes the pill assertion depend on the push.
        typedA: pages.urls.a.replace(/^http:/, 'HTTP:'),
        // Same trick for the dropdownAfterEnter phase's re-commit: it must
        // differ from what the pill already reads, or React's change tracker
        // fires no onChange and no query is ever scheduled to outrun.
        typedB: pages.urls.b.replace(/^http:/, 'HTTP:'),
        servedA: pages.urls.a,
        servedB: pages.urls.b,
        // The <title> this script itself serves at /a. The widget's strip label
        // can only carry it once chrome's state push has delivered it
        // (WebTabWidget.applyState -> pageTitle -> refreshTitle), which is what
        // makes the `push:` assertion separate a missing push from a missing
        // strip binding.
        servedATitle: PAGES['/a'].title,
        // The hanging page the thumbnail phase attributes its evidence to.
        servedC: pages.urls.c,
        servedOrigin: pages.origin,
        thumbnailSettleMs: derived.thumbnailSettleMs,
        debounceMs: derived.debounceMs,
        dropdownClass: derived.dropdownClass,
        addressBarClass: derived.addressBarClass,
    };
    try {
        // Empty URL: the shell's own supervised frontend is the app under
        // test, and a URL on the command line would open a stock window
        // beside it (WINDOWS 14).
        return await withFirefoxPage('', async ({ evaluate, evaluateIn, send, waitFor, topLevelContexts }) => {
            await waitFor('window.theia && window.theia.container ? true : false', { timeoutMs: 60000 });
            await waitFor('!!document.querySelector("#theia-app-shell")', { timeoutMs: 60000 });
            await waitFor(`(() => { try { ${GET_BY_NAME}
                return __getByName(window.theia.container, 'FrontendApplicationStateService').state === 'ready';
            } catch (e) { return false; } })()`, { timeoutMs: 60000 });

            const report = { failures: [], notes: [], steps: [], alignments: [], hops: [], servedA: cfg.servedA, servedB: cfg.servedB, servedC: cfg.servedC, servedATitle: cfg.servedATitle };
            const phase = async (name, arg) => {
                const part = JSON.parse(await evaluate(phaseExpression(cfg, name, arg)));
                report.failures.push(...part.failures);
                report.notes.push(...part.notes);
                report.steps.push(...part.steps);
                return part;
            };
            const overlayRect = async context => JSON.parse(await evaluateIn(context, OVERLAY_RECT_EXPR));
            const align = async (label, context, placeholderRect) => {
                const overlay = await overlayRect(context);
                const d = delta(overlay, placeholderRect);
                report.alignments.push({ label, delta: d, overlay, placeholderRect });
                if (!(d <= ALIGN_TOLERANCE_PX)) {
                    report.failures.push(`align: ${label}: the overlay rect ${rectString(overlay)} is not aligned with the placeholder rect ${rectString(placeholderRect)} (max delta ${d.toFixed(2)} CSS px, tolerance ${ALIGN_TOLERANCE_PX})`);
                }
                return overlay;
            };

            const setup = await phase('setup');
            Object.assign(report, {
                mainIdsBefore: setup.mainIdsBefore, addedIds: setup.addedIds, widgetId: setup.widgetId,
                widgetFactoryId: setup.widgetFactoryId, newTabLabel: setup.newTabLabel, pillFocused: setup.pillFocused,
                pillValueAfterNewTab: setup.pillValueAfterNewTab, currentAfterNewTab: setup.currentAfterNewTab,
                isShellCurrentWidget: setup.isShellCurrentWidget, afterA: setup.afterA, windowOpenCalls: setup.windowOpenCalls,
            });

            if (setup.widgetId && setup.afterA) {
                // The overlay: exactly one context carrying servedA.
                let contexts = await awaitContexts(topLevelContexts, seen => seen.some(c => c.url === cfg.servedA));
                report.contextsAfterA = contexts.map(c => c.url);
                const carrying = contexts.filter(c => c.url === cfg.servedA);
                let overlay;
                if (carrying.length !== 1) {
                    report.failures.push(`context: expected exactly one top-level browsing context carrying ${cfg.servedA} (the overlay), saw ${carrying.length} in ${JSON.stringify(report.contextsAfterA)}`);
                } else {
                    overlay = carrying[0].context;
                    report.overlayContext = overlay;
                    report.overlayUrlAfterA = carrying[0].url;
                    await align('after the first commit', overlay, setup.afterA.placeholderRect);
                    // One TRUSTED click inside the first page. Session history
                    // only offers Back to an earlier entry the user interacted
                    // with (nsSHistory::CanGoBackFromEntryAtIndex under the
                    // default browser.navigation.requireUserInteraction), so
                    // a page nobody touched would leave Back disabled after the
                    // second commit on a correct product. This is what Chris's
                    // hand on the page does; a script-dispatched event is not it.
                    try {
                        await send('input.performActions', {
                            context: overlay,
                            actions: [{
                                type: 'pointer', id: 'pb-mouse', parameters: { pointerType: 'mouse' },
                                actions: [
                                    { type: 'pointerMove', x: 20, y: 20 },
                                    { type: 'pointerDown', button: 0 },
                                    { type: 'pointerUp', button: 0 },
                                ],
                            }],
                        });
                        await send('input.releaseActions', { context: overlay });
                        report.notes.push('one trusted pointer click delivered inside the first page before the second commit (session-history user interaction)');
                    } catch (error) {
                        // An overlay with no viewport (geometry never applied)
                        // cannot take a click; the alignment read above has
                        // already named that, so this only records why Back
                        // will stay disabled.
                        report.notes.push(`the click inside the first page could not be delivered: ${error.message}`);
                    }
                }

                // The second commit navigates the SAME context in place.
                const b = await phase('commitB');
                report.afterB = b.afterB;
                if (overlay) {
                    contexts = await awaitContexts(topLevelContexts, seen => seen.some(c => c.context === overlay && c.url === cfg.servedB));
                    const same = contexts.find(c => c.context === overlay);
                    report.overlayUrlAfterB = same ? same.url : undefined;
                    report.contextsAfterB = contexts.map(c => c.url);
                    if (!same || same.url !== cfg.servedB) {
                        report.failures.push(`nav: the second commit did not navigate the same overlay context in place: context ${overlay} now carries ${JSON.stringify(same ? same.url : '(gone)')}, expected ${cfg.servedB}; contexts: ${JSON.stringify(report.contextsAfterB)}`);
                    }
                    if (b.afterB) {
                        await align('after the second commit', overlay, b.afterB.placeholderRect);
                    }
                }

                // G-14.1.1-7: a commit issued inside the debounce window must
                // leave no dropdown over the page. The overlay's own visibility
                // is read through the SAME OVERLAY_RECT_EXPR path every other
                // occlusion read here uses -- a dropdown that re-opened would
                // count as a blocking layer and the page would go hidden.
                const late = await phase('dropdownAfterEnter');
                report.dropdownAfterEnter = late.dropdownAfterEnter;
                if (report.dropdownAfterEnter) {
                    if (overlay) {
                        const o = await overlayRect(overlay);
                        report.dropdownAfterEnter.overlayVisible = o.hidden === false;
                        report.dropdownAfterEnter.overlayRect = o;
                    }
                    if (report.dropdownAfterEnter.overlayVisible === undefined) {
                        report.dropdownAfterEnter.overlayVisible = false;
                    }
                }

                // G-14.1.1-4: drop the overlay from under the widget, then read
                // the body and recover in ONE Reload. The recovery re-opens the
                // overlay, so the context id changes here and every read below
                // must use the re-acquired one -- the walk realigns against it.
                const lost = await phase('lostView');
                report.lostView = lost.lostView;
                if (lost.lostView) {
                    contexts = await awaitContexts(topLevelContexts, seen => seen.some(c => c.url === cfg.servedB));
                    report.contextsAfterLostView = contexts.map(c => c.url);
                    const recovered = contexts.filter(c => c.url === cfg.servedB);
                    if (recovered.length !== 1) {
                        report.failures.push(`lost-view: after one Reload exactly one top-level browsing context should carry ${cfg.servedB} (the re-created overlay), saw ${recovered.length} in ${JSON.stringify(report.contextsAfterLostView)}`);
                        overlay = undefined;
                    } else {
                        overlay = recovered[0].context;
                        report.overlayContextAfterLostView = overlay;
                        if (lost.lostView.afterOneReload) {
                            await align('after the lost-view reload', overlay, lost.lostView.afterOneReload.rect);
                        }
                    }
                }

                // The mode walk: every hop a second visit somewhere.
                for (const id of derived.walk) {
                    const h = (await phase('hop', id)).hop;
                    if (!h) {
                        report.failures.push(`walk: the hop into '${id}' produced no record`);
                        continue;
                    }
                    report.hops.push(h);
                    if (!overlay) {
                        continue;
                    }
                    if (h.isCurrent) {
                        await align(`after the hop into '${id}'`, overlay, h.placeholderRect);
                    } else {
                        const o = await overlayRect(overlay);
                        h.overlayHidden = o.hidden;
                        if (o.hidden !== true) {
                            // Assumption A4 fallback -- stated, never silent.
                            if (h.lastSentVisible === false) {
                                report.notes.push(`FALLBACK after the hop into '${id}': document.hidden read ${JSON.stringify(o.hidden)} in the overlay while the tab was not current; the frontend's last published visible=false is the observable used instead`);
                            } else {
                                report.failures.push(`walk: after the hop into '${id}' the web tab is not current (current: [${h.currentTitleIds.join(', ')}]) but the overlay is not hidden: document.hidden=${JSON.stringify(o.hidden)}, last published visible=${JSON.stringify(h.lastSentVisible)}`);
                            }
                        }
                    }
                }

                const store = await phase('store');
                report.rowsAfterNavigation = store.rowsAfterNavigation;
                report.thumbnail = (await phase('thumbnail')).thumbnail;
                report.restoreRepeat = (await phase('restoreRepeat')).restoreRepeat;
                const closed = await phase('close');
                Object.assign(report, {
                    rowsAfterClose: closed.rowsAfterClose, mainIdsAfterClose: closed.mainIdsAfterClose,
                    widgetDisposed: closed.widgetDisposed, windowOpenCalls: closed.windowOpenCalls,
                });
                contexts = await awaitContexts(topLevelContexts, seen => !seen.some(c => c.url === cfg.servedA || c.url === cfg.servedB || c.url === cfg.servedC));
                report.contextsAfterClose = contexts.map(c => c.url);
            }

            let stdout = '';
            try {
                stdout = readFileSync(stdoutPath, 'utf8');
            } catch {
                stdout = '';
            }
            report.shellReadyLines = stdout.split('\n').filter(line => line.includes(SHELL_READY_SENTINEL)).length;
            return report;
        }, { stdoutPath });
    } finally {
        await pages.close();
        rmSync(scratchDir, { recursive: true, force: true });
    }
}

/**
 * FAILURE-MESSAGE FAMILIES (G-14.1.1-20). Every assertion message -- both the
 * ones pushed inside `runProtocol`'s phases and the ones pushed here -- begins
 * with exactly one of these fifteen tokens, and the token is the FIRST thing in
 * the message:
 *
 *   newtab:     what "+" added -- title count, factory id, label, pill focus,
 *               pill emptiness, dock currency, and the no-widget case
 *   popup:      the window.open call count
 *   context:    top-level browsing-context identity and count for the overlay
 *   align:      the overlay-versus-placeholder rect comparison (the contract
 *               assertion); its no-pair-measured guard is a broken-instrument
 *               report, which the scorer will not credit
 *   nav:        navigating the same context in place, uriOf vs the live URL,
 *               Back enablement after each commit
 *   pill:       the pill's value after each commit (the chrome bar's binding)
 *   push:       state only a chrome push can supply (the widget's own strip label)
 *   dropdown:   the commit issued inside the suggestion debounce window
 *   lost-view:  the overlay dropped from under the widget, and the one Reload
 *   walk:       the mode walk -- hop records, attachment, main-area membership,
 *               the no-realignment guard, the organising slot
 *   restore:    the foreign-id construction and the minted-id distinctness
 *   store:      the store row readable after navigation
 *   thumbnail:  the last-view snapshot attribution
 *   close:      rows, contexts and main-area id residue after close
 *   shell:      the POWERBROWSER_SHELL_READY line in the binary's stdout
 *
 * WHY: `--self-test` scores each plant by an ANCHORED PREFIX (startsWith), so a
 * plant can only ever be credited with the family it names. A bare-substring
 * expect could be satisfied by any message that happened to contain the word --
 * which is exactly the defect this closed set exists to make impossible.
 *
 * NOT in the set, deliberately: the derivation failures (they lead with the file
 * path they name and run before any plant), a plant that could not be applied,
 * and a phase that threw. Those three report a BROKEN INSTRUMENT rather than a
 * contract, they are caught by their own checks in `selfTest`, and no plant may
 * be scored on them.
 *
 * The same rule covers the four in-family guards that begin with a scoring
 * prefix (`lost-view:`, `thumbnail:`, `walk:`, `align:`) and end with
 * BROKEN_INSTRUMENT_MARKER: they say the instrument could not assert, not that
 * the contract failed. Since 14.1.1-14 this is ENFORCED by the scorer rather
 * than only asserted here -- a message carrying the marker scores nothing, and
 * a case whose only messages in its family carry it fails naming that fact.
 *
 * UNPLANTED FAMILIES, stated rather than left to derive (14.1.1-14). Each is a
 * known limitation with its reason, not an omission:
 *   nav:, walk:  a plant would have to be keyed on the modes extension's
 *                runtime shape, and mode-service.ts, group-actor-client.ts and
 *                main-area-exemption.ts were held uncommitted by a concurrent
 *                session when the other plants were added, so such a plant
 *                would have been scored against code that pass could not see.
 *                Plant them from a quiet tree.
 *   shell:       asserts that the LAUNCHED BINARY printed its ready sentinel
 *                to stdout. Every plant in this file runs in the page realm,
 *                so no plant here can suppress it.
 *
 * Tree-side assertions over one live report. @returns {string[]}
 */
const BROKEN_INSTRUMENT_MARKER = 'broken instrument, never a clean pass';

function assertReport(derived, report) {
    if (report.driveError) {
        return [`could not drive the live frontend: ${report.driveError}`];
    }
    const failures = [...report.failures];
    if (report.windowOpenCalls !== 0) {
        failures.push(`popup: window.open was called ${report.windowOpenCalls} time(s) -- "+" or a commit fell back to the popup path instead of an in-shell web tab`);
    }
    if (!report.widgetId) {
        failures.push('newtab: "+" produced no web-tab widget in the main area, so nothing below it could be exercised');
        if (!(report.shellReadyLines > 0)) {
            failures.push(`shell: the launched binary's stdout carried no ${SHELL_READY_SENTINEL} line -- this session never reached a real shell`);
        }
        return failures;
    }
    if (report.widgetFactoryId !== derived.factoryId) {
        failures.push(`newtab: the tab "+" added was created by factory '${report.widgetFactoryId}', not the web-tab factory '${derived.factoryId}'`);
    }
    if (report.newTabLabel !== 'New Tab') {
        failures.push(`newtab: the new tab's label is ${JSON.stringify(report.newTabLabel)}, expected "New Tab"`);
    }
    if (report.pillFocused !== true) {
        failures.push('newtab: the address pill does not have focus after "+"');
    }
    if (report.pillValueAfterNewTab !== '') {
        failures.push(`newtab: the address pill reads ${JSON.stringify(report.pillValueAfterNewTab)} after "+", expected empty`);
    }
    if (report.currentAfterNewTab !== true) {
        failures.push(`newtab: the new tab '${report.widgetId}' is not the current title of its dock after "+" -- the tab was added without being activated`);
    }
    // `shell.currentWidget` is NOT asserted (G-14.1.1-20). It is derived from
    // Lumino's FocusTracker, which a headless window never feeds, so the only
    // way this check could ever assert it was by dispatching the focus event
    // itself -- an assertion over an observable the instrument manufactures,
    // which is exactly what CLAUDE.md's Verification rule 1 forbids. Selection
    // IS asserted, one line above, through the dock's own `currentTitle`.
    // Whether the real window keeps `shell.currentWidget` on the web tab is
    // recorded as test 43 in 14.1.1-UAT.md for Chris's screen to settle.
    const a = report.afterA ?? {};
    if (a.pill !== report.servedA) {
        failures.push(`pill: after the first commit the pill reads ${JSON.stringify(a.pill)}, expected the canonical URL ${report.servedA} from chrome's state push`);
    }
    // The observable that separates a missing PUSH from a missing BINDING
    // (G-14.1.1-20). The pill above is written by the chrome bar, which learns
    // its tab from the strip selection; the strip label below is written by the
    // widget itself, and `WebTabWidget.refreshTitle` can only put the served
    // page's <title> there once `applyState` -- the state push -- has delivered
    // it, falling back to the URL and then to "New Tab" when it has not. So
    // `focus-keyed-pill` (binding broken, pushes still arriving) fails the pill
    // assertion and passes this one, while `state-ignored` fails both.
    if (a.titleLabel !== report.servedATitle) {
        failures.push(`push: the tab's strip label reads ${JSON.stringify(a.titleLabel)} after the first commit, expected the served page title ${JSON.stringify(report.servedATitle)} -- only chrome's state push can supply a page title to the widget, so the widget is not receiving state pushes at all`);
    }
    if (report.overlayUrlAfterA && a.uriOf !== report.overlayUrlAfterA) {
        failures.push(`nav: after the first commit uriOf(widget) is ${JSON.stringify(a.uriOf)} but the overlay's live URL is ${report.overlayUrlAfterA}`);
    }
    if (a.backDisabled !== true) {
        failures.push(`nav: Back is ${a.backDisabled === false ? 'enabled' : 'unreadable'} after the first commit, expected disabled (no history behind)`);
    }
    const b = report.afterB ?? {};
    if (b.pill !== report.servedB) {
        failures.push(`pill: after the second commit the pill reads ${JSON.stringify(b.pill)}, expected ${report.servedB}`);
    }
    if (report.overlayUrlAfterB && b.uriOf !== report.overlayUrlAfterB) {
        failures.push(`nav: after the second commit uriOf(widget) is ${JSON.stringify(b.uriOf)} but the overlay's live URL is ${report.overlayUrlAfterB}`);
    }
    if (b.backDisabled !== false) {
        failures.push(`nav: Back is ${b.backDisabled === true ? 'disabled' : 'unreadable'} after the second commit, expected enabled (one entry behind)`);
    }
    // G-14.1.1-7. The fix is in tree; these three are what make a regression to
    // the pre-fix behaviour -- a query the last keystroke scheduled re-opening
    // the dropdown over the committed page -- go red instead of green.
    const late = report.dropdownAfterEnter ?? {};
    if (late.dropdownPresent !== false) {
        failures.push(`dropdown: a suggestion dropdown is in the document ${derived.debounceMs}ms after a commit issued inside the debounce window -- a query scheduled by the last keystroke re-opened it over the committed page (typed ${JSON.stringify(late.typed)})`);
    }
    if (late.overlayVisible !== true) {
        failures.push(`dropdown: the overlay is not visible after the commit inside the debounce window (document.hidden read ${JSON.stringify(late.overlayRect && late.overlayRect.hidden)}) -- a re-opened dropdown counts as a blocking layer and occludes the page (widget visibility ${JSON.stringify(late.visibility)})`);
    }
    if (late.pill !== report.servedB) {
        failures.push(`dropdown: after the commit inside the debounce window the pill reads ${JSON.stringify(late.pill)}, expected the committed URL ${report.servedB} rather than the typed prefix ${JSON.stringify(late.typed)}`);
    }
    // G-14.1.1-4. Non-vacuous by construction: the clean control must satisfy
    // all three, and the `lost-view-ignored` plant -- which restores the
    // fire-and-forget geometry publish whose reply the widget used to discard
    // -- must fail (a) and (b).
    const lost = report.lostView ?? {};
    if (lost.stateText !== derived.lostViewCopy) {
        failures.push(`lost-view: after chrome dropped the overlay the tab body reads ${JSON.stringify(lost.stateText)}, expected the shipped lost-view copy ${JSON.stringify(derived.lostViewCopy)} with no user action (chrome answered the close with ${JSON.stringify(lost.closeWhere)})`);
    }
    if (lost.lostView !== true) {
        failures.push(`lost-view: the widget did not mark the view lost after one geometry publish to a chrome that no longer holds the tab (lostView=${JSON.stringify(lost.lostView)}) -- the unknown-tab outcome of the geometry reply was discarded`);
    }
    const recovered = lost.afterOneReload ?? {};
    if (recovered.lostView !== false || recovered.hasPage !== true) {
        failures.push(`lost-view: one Reload did not bring the page back (lostView=${JSON.stringify(recovered.lostView)}, hasPage=${JSON.stringify(recovered.hasPage)}, body ${JSON.stringify(recovered.stateText)}, reload reply where ${JSON.stringify(lost.reloadReplyWhere)}) -- the contract is one click, not two`);
    }
    const hops = report.hops ?? [];
    if (hops.length !== derived.walk.length) {
        failures.push(`walk: walked ${hops.length} hop(s), expected ${derived.walk.length}: ${derived.walk.join(' -> ')}`);
    }
    for (const h of hops) {
        if (!h.attached) {
            failures.push(`walk: the web tab is no longer attached after the hop into '${h.hop}'`);
        }
        if (!h.inMain) {
            failures.push(`walk: the web tab is not in the main area after the hop into '${h.hop}'`);
        }
    }
    const walkAlignments = (report.alignments ?? []).filter(x => x.label.startsWith('after the hop'));
    if (hops.length && walkAlignments.length === 0) {
        failures.push('walk: the web tab was current after none of the hops, so the walk asserted no realignment at all (broken instrument, never a clean pass)');
    }
    const organisingHops = hops.filter(h => h.hop === derived.shipped[2]);
    if (organisingHops.some(h => h.isCurrent)) {
        failures.push(`walk: the web tab stayed the current title while '${derived.shipped[2]}' was active -- the organising slot did not take the main area`);
    }
    // The alignment message is pushed only where a rect PAIR was measured, so a
    // fault that stops the overlay from existing at all leaves the alignment
    // contract silently unasserted rather than red. Zero reads is a broken
    // instrument, never a clean pass -- the same shape as the walk guard above.
    if ((report.alignments ?? []).length === 0) {
        failures.push('align: no overlay/placeholder rect pair could be measured in this run, so the alignment contract was not asserted at all (broken instrument, never a clean pass)');
    }
    // G-14.1.1-5.
    const restore = report.restoreRepeat ?? {};
    if (restore.refusedForeignId !== true) {
        failures.push(`restore: constructing a web tab from a foreign session's id ${JSON.stringify(restore.foreignId)} through the same WidgetFactory seam the stock layout restorer calls was ACCEPTED -- a persisted layout can still re-create last session's web tabs at startup`);
    }
    if (!restore.secondMintedId || restore.secondMintedId === restore.mintedId) {
        failures.push(`restore: the two ids minted in this session are ${JSON.stringify(restore.mintedId)} and ${JSON.stringify(restore.secondMintedId)} -- a second "+" must never reuse an id, or two widgets drive one overlay`);
    }
    // WR-13: a third assertion here read `restore.mainIdsAfter` for the refused
    // id and has been DELETED. `getOrCreateWidget` never adds to the shell, so
    // its condition could not be false under any product behaviour -- an
    // assertion that cannot go red is not evidence, and a check may not carry
    // one. The ids stay on the report as a recorded observation and are printed
    // by `printReport`, the same demotion 14.1.1-01 applied to
    // `shell.currentWidget`.
    if (!(report.rowsAfterNavigation ?? []).some(row => row.url === report.servedB)) {
        failures.push(`store: no store row for ${report.servedB} was readable through ChromeBarSuggestionService.searchByPrefix after the navigation (rows: ${JSON.stringify(report.rowsAfterNavigation ?? [])})`);
    }
    // G-14.1.1-6. The card's `tab.thumbnail` branch has always rendered; what
    // it never had since 14.1 was a row to render, because the capture path
    // could only find a stock tab. The three assertions below are ordered as the
    // attribution runs: a snapshot replacing the settled baseline after the
    // hide (NG-001: the row is the tab's, so an earlier page's snapshot may be
    // the baseline), a PNG, inside the cap.
    const thumb = report.thumbnail ?? {};
    if (thumb.hasThumbnail !== true) {
        failures.push(`thumbnail: the tab's store row (on ${report.servedC}) carries no new last-view snapshot after the overlay was hidden -- an in-shell web tab captured nothing on its last view, so its Panorama card keeps an older page's picture or the text fallback`);
    }
    if (thumb.prefixOk !== true) {
        failures.push(`thumbnail: the stored snapshot for ${report.servedC} is not a PNG data URL (length ${thumb.length}) -- GUI-08 contracts a PNG last-view snapshot`);
    }
    if (!(thumb.length > 0 && thumb.length <= derived.thumbnailMaxChars)) {
        failures.push(`thumbnail: the stored snapshot is ${thumb.length} chars, outside the capture cap TAB_THUMBNAIL_CAPTURE_MAX_CHARS=${derived.thumbnailMaxChars} derived from ${SHELL_API_REL} -- over the cap the row must clear to NULL rather than store`);
    }
    if ((report.rowsAfterClose ?? []).some(row => row.url === report.servedA || row.url === report.servedB || row.url === report.servedC)) {
        failures.push(`close: a store row for a served URL is still readable after the tab was closed (rows: ${JSON.stringify(report.rowsAfterClose)})`);
    }
    const leftover = (report.contextsAfterClose ?? []).filter(url => url === report.servedA || url === report.servedB || url === report.servedC);
    if (leftover.length) {
        failures.push(`close: a top-level browsing context still carries a served URL after close: ${JSON.stringify(report.contextsAfterClose)} -- the overlay context was not removed`);
    }
    const before = [...(report.mainIdsBefore ?? [])].sort();
    const after = [...(report.mainIdsAfterClose ?? [])].sort();
    if (JSON.stringify(before) !== JSON.stringify(after)) {
        failures.push(`close: the main-area id set after close [${after.join(', ')}] differs from the set before "+" [${before.join(', ')}] -- residue`);
    }
    if (!(report.shellReadyLines > 0)) {
        failures.push(`shell: the launched binary's stdout carried no ${SHELL_READY_SENTINEL} line -- this session never reached a real shell, so nothing it reported is about the product`);
    }
    return failures;
}

function printReport(report) {
    if (report.driveError) {
        return;
    }
    console.log(`${NAME}: served ${report.servedA}, ${report.servedB} and ${report.servedC} (the last one never ended); "+" added [${(report.addedIds ?? []).join(', ')}] from factory '${report.widgetFactoryId}' labelled ${JSON.stringify(report.newTabLabel)}; pill focused: ${report.pillFocused}; shell.currentWidget is the tab: ${report.isShellCurrentWidget}`);
    const a = report.afterA ?? {};
    const b = report.afterB ?? {};
    console.log(`${NAME}: after A: pill ${JSON.stringify(a.pill)}, uriOf ${JSON.stringify(a.uriOf)}, strip label ${JSON.stringify(a.titleLabel)} (served title ${JSON.stringify(report.servedATitle)}), overlay ${JSON.stringify(report.overlayUrlAfterA)}, Back disabled ${a.backDisabled}; after B: pill ${JSON.stringify(b.pill)}, uriOf ${JSON.stringify(b.uriOf)}, overlay ${JSON.stringify(report.overlayUrlAfterB)} (context ${report.overlayContext}), Back disabled ${b.backDisabled}`);
    for (const x of report.alignments ?? []) {
        console.log(`${NAME}: ${x.label}: overlay ${rectString(x.overlay)} vs placeholder ${rectString(x.placeholderRect)} -> delta ${x.delta.toFixed(2)} px`);
    }
    for (const h of report.hops ?? []) {
        console.log(`${NAME}: hop '${h.hop}': attached ${h.attached}, in main ${h.inMain}, current ${h.isCurrent}${h.isCurrent ? '' : `, overlay hidden ${h.overlayHidden}`}; last published ${h.lastSent}; visibility ${JSON.stringify(h.visibility)}`);
    }
    if (b.pushes) {
        console.log(`${NAME}: state pushes received (${b.pushes.length}); last: ${b.pushes.slice(-3).join(' | ')}`);
        console.log(`${NAME}: after B: last published ${b.lastSent}; visibility ${JSON.stringify(b.visibility)}`);
    }
    const lost = report.lostView ?? {};
    console.log(`${NAME}: lostView: chrome answered the close with ${JSON.stringify(lost.closeWhere)}; body after the drop ${JSON.stringify(lost.stateText)}, lostView ${JSON.stringify(lost.lostView)}; after one Reload: lostView ${JSON.stringify((lost.afterOneReload ?? {}).lostView)}, hasPage ${JSON.stringify((lost.afterOneReload ?? {}).hasPage)}, reload reply where ${JSON.stringify(lost.reloadReplyWhere)}, re-acquired overlay context ${report.overlayContextAfterLostView}`);
    const restore = report.restoreRepeat ?? {};
    console.log(`${NAME}: restoreRepeat: minted ${JSON.stringify(restore.mintedId)} (session segment ${JSON.stringify(restore.mintedIdPrefix)}), second "+" minted ${JSON.stringify(restore.secondMintedId)}; foreign id ${JSON.stringify(restore.foreignId)} refused: ${restore.refusedForeignId}${restore.refusalMessage ? ` (${restore.refusalMessage})` : ''}; main-area ids after: [${(restore.mainIdsAfter ?? []).join(', ')}]`);
    console.log(`${NAME}: rows after navigation: ${JSON.stringify((report.rowsAfterNavigation ?? []).map(r => r.url))}; rows after close: ${JSON.stringify((report.rowsAfterClose ?? []).map(r => r.url))}`);
    const thumb = report.thumbnail ?? {};
    const baseline = thumb.baseline ?? {};
    console.log(`${NAME}: thumbnail attribution on ${report.servedC}: row present ${thumb.rowPresent}; baseline before the hide: absent ${baseline.absent} (length ${baseline.length}); after the hide: hasThumbnail ${thumb.hasThumbnail}, prefixOk ${thumb.prefixOk}, length ${thumb.length} -- bytes deliberately not printed`);
    const late = report.dropdownAfterEnter ?? {};
    console.log(`${NAME}: dropdownAfterEnter: typed ${JSON.stringify(late.typed)}, dropdownPresent ${late.dropdownPresent}, overlayVisible ${late.overlayVisible}, pill ${JSON.stringify(late.pill)}, overlay ${JSON.stringify(late.overlayRect)}`);
    console.log(`${NAME}: contexts after close: ${JSON.stringify(report.contextsAfterClose ?? [])}; main-area ids before/after: [${(report.mainIdsBefore ?? []).join(', ')}] / [${(report.mainIdsAfterClose ?? []).join(', ')}]; window.open calls: ${report.windowOpenCalls}; ${SHELL_READY_SENTINEL} lines: ${report.shellReadyLines}`);
    for (const note of report.notes ?? []) {
        console.log(`${NAME}: ${note}`);
    }
}

async function main() {
    const derived = derive();
    if (derived.failures.length) {
        for (const message of derived.failures) {
            console.error(`${NAME}: FAIL -- ${message}`);
        }
        return 1;
    }
    console.log(`${NAME}: derived factory '${derived.factoryId}', handler '${derived.handlerClass}', new-tab command '${derived.newTabCommandId}', walk ${derived.walk.join(' -> ')}`);
    const report = await runProtocol(derived, '');
    printReport(report);
    const failures = assertReport(derived, report);
    if (failures.length) {
        for (const message of failures) {
            console.error(`${NAME}: FAIL -- ${message}`);
        }
        console.error(`${NAME}: FAIL -- ${failures.length} assertion(s) failed`);
        return 1;
    }
    const maxDelta = Math.max(0, ...(report.alignments ?? []).map(x => x.delta));
    console.log(`${NAME}: PASS -- "+" opened an in-shell web tab, two typed commits navigated one overlay context, ${report.hops.length} mode hops walked with the tab attached (${report.alignments.length} alignment reads, max delta ${maxDelta.toFixed(2)} CSS px), store row present then absent, overlay removed on close, zero window.open calls`);
    return 0;
}

/**
 * The rule the self-test case table must satisfy, as a PURE function so it can
 * be exercised without booting anything (G-14.1.1-20). Two ways a plant expect
 * stops being evidence, both of which this file shipped before:
 *   - a BARE WORD expect ('pill', 'row', 'rect') is satisfied by any failure
 *     message that merely contains it, so a plant can be credited with a red it
 *     did not cause;
 *   - a SHARED expect makes two plants indistinguishable, so neither one's red
 *     says anything about the fault it planted.
 * @param {{plant?: string, expect?: string, expectClean?: boolean}[]} cases
 * @returns {string[]} one message per fault; empty when the table is well formed
 */
function expectTableFaults(cases) {
    const faults = [];
    const plants = cases.filter(testCase => !testCase.expectClean);
    for (const testCase of plants) {
        if (typeof testCase.expect !== 'string' || !testCase.expect.endsWith(':')) {
            faults.push(`plant '${testCase.plant}' carries the unanchored expect ${JSON.stringify(testCase.expect)} -- an expect must be a message-family prefix ending in ':', or any message merely containing the word can satisfy it`);
        }
    }
    const sharers = new Map();
    for (const testCase of plants) {
        sharers.set(testCase.expect, [...(sharers.get(testCase.expect) ?? []), testCase.plant]);
    }
    for (const [expect, plantNames] of sharers) {
        if (plantNames.length > 1) {
            faults.push(`the expect ${JSON.stringify(expect)} is shared by ${plantNames.length} plants (${plantNames.join(', ')}) -- two plants scored on one prefix cannot be told apart, so a red there names neither fault`);
        }
    }
    return faults;
}

/**
 * The guard's OWN planted faults, declared beside it and run every time. Three
 * literal tables: a duplicate must be rejected naming the prefix and both
 * plants, a bare word must be rejected naming the word, and a well-formed table
 * must be ACCEPTED -- the third is what stops "red on everything" from passing
 * for a working guard. This is the standing, re-runnable record CLAUDE.md's
 * Verification section requires of a new check, rather than a dev-time edit
 * reverted before commit.
 */
const EXPECT_TABLE_FIXTURES = [
    {
        what: 'a duplicated expect is rejected, naming the prefix and both plants',
        cases: [{ plant: 'x', expect: 'a:' }, { plant: 'y', expect: 'a:' }],
        holds: faults => faults.length === 1 && faults[0].includes('"a:"') && faults[0].includes('(x, y)'),
    },
    {
        what: 'an unanchored expect is rejected, naming the bare word',
        cases: [{ plant: 'x', expect: 'pill' }],
        holds: faults => faults.length === 1 && faults[0].includes('"pill"'),
    },
    {
        what: 'a well-formed table is accepted (the guard is not red on everything)',
        cases: [{ plant: 'x', expect: 'a:' }, { plant: 'y', expect: 'b:' }],
        holds: faults => faults.length === 0,
    },
];

/**
 * Fault plants. The clean control runs FIRST: a plant harness whose clean
 * pass is already red proves nothing about the plants that follow. Each
 * plant runs in its OWN browser session so no plant inherits another's
 * damage, and each must report that it was applied.
 */
async function selfTest() {
    const derived = derive();
    if (derived.failures.length) {
        for (const message of derived.failures) {
            console.error(`${NAME} --self-test: FAIL -- derivation is broken before any plant: ${message}`);
        }
        return 1;
    }

    const cases = [
        { name: 'clean control (no plant)', plant: '', expectClean: true },
        // The frontend never reaches chrome: no overlay is ever created, so
        // the served URL appears in no context.
        { name: 'requests swallowed before the actor child', plant: 'swallow', expect: 'context:' },
        // The open handler regresses to the GUI-01 popup path.
        { name: 'handler falls back to a popup', plant: 'popup', expect: 'popup:' },
        // Geometry is never published, so the overlay never reaches the placeholder.
        { name: 'geometry never published', plant: 'no-geometry', expect: 'align:' },
        // The geometry reply is discarded again (G-14.1.1-4's pre-fix
        // behaviour), so a dropped overlay leaves the body blank until the
        // user clicks Reload.
        { name: 'the geometry reply is discarded', plant: 'lost-view-ignored', expect: 'lost-view:' },
        // The factory admits any construction id again (G-14.1.1-5's pre-fix
        // behaviour), so a persisted layout re-creates last session's tabs.
        { name: 'the factory re-creates a described web tab', plant: 'restore-recreates', expect: 'restore:' },
        // The pill is re-keyed on DOM focus of the placeholder instead of the
        // strip's selection (G-14.1.1-20). A placeholder covered by the chrome
        // overlay never receives DOM focus in real use, so the pill stays on
        // the typed text -- and nothing in this check props it up any more. The
        // widget itself keeps receiving chrome's pushes here, so `push:` stays
        // GREEN and only the bar's own family goes red.
        { name: 'the pill is keyed on focus, not on the strip selection', plant: 'focus-keyed-pill', expect: 'pill:' },
        // Chrome's pushes never reach the WIDGET, so nothing can put the served
        // page's <title> in its strip label. Scored on `push:` rather than on
        // the pill: the pill also goes red here, but it goes red under
        // focus-keyed-pill too, and one prefix per family is what tells the two
        // apart.
        { name: 'state pushes ignored', plant: 'state-ignored', expect: 'push:' },
        // The bar stays armed across the commit (G-14.1.1-7's pre-fix
        // behaviour), so the query the last keystroke scheduled re-opens the
        // dropdown over the committed page and occludes the overlay.
        { name: 'the dropdown re-arms across the commit', plant: 'dropdown-rearms', expect: 'dropdown:' },
        // The overlay hide is never published (G-14.1.1-6), so webTabGeometry's
        // last-view arm is never reached and the hanging page -- whose network
        // never reaches STOP, so nothing else can fill its row -- ends the run
        // with no snapshot at all. This is the attribution plant: it removes the
        // frontend half of the very causal chain the chrome-side arm completes.
        { name: 'the overlay hide is never published', plant: 'hide-not-published', expect: 'thumbnail:' },
        // The store reader returns nothing.
        { name: 'store rows unread', plant: 'store-unread', expect: 'store:' },
        // "+" opens nothing at all. Proves `newtab:` reachable with ZERO
        // window.open calls, so `popup:` is red under exactly one plant in this
        // table (the `popup` plant above) and its scored red is caused by no
        // other entry. What remains true and is not a defect: `newtab:` is also
        // red under `popup`, because a fault deep enough to stop openUrl also
        // stops "+" producing a widget -- a strict superset, not an ambiguity.
        { name: 'New Tab opens nothing', plant: 'newtab-noop', expect: 'newtab:' },
        // The widget never closes. Demonstrates that the three consecutive
        // `close:` ABSENCE assertions -- no store row for a served URL, no
        // browsing context carrying one, no main-area id residue -- are all
        // reachable, which nothing in this file showed before. Honestly: this
        // plant also disturbs the second-tab cleanup in the restoreRepeat phase
        // (those owners call the same close), which is harmless because the
        // `restore:` assertions read the foreign-id refusal and the minted-id
        // distinctness, neither of which depends on a close.
        { name: 'the widget never closes', plant: 'close-ignored', expect: 'close:' },
    ];

    // PRE-FLIGHT, before any session is booted: prove the guard on its own three
    // fixtures, then run it against the real table. A malformed case table is a
    // hard stop, not a silent ambiguity -- which is what makes the defect this
    // task fixed impossible to re-introduce.
    let preflightFailed = 0;
    for (const fixture of EXPECT_TABLE_FIXTURES) {
        const faults = expectTableFaults(fixture.cases);
        if (fixture.holds(faults)) {
            console.log(`  ok  pre-flight: ${fixture.what}`);
        } else {
            console.error(`${NAME} --self-test: FAIL -- the expect-table guard misbehaved on its own fixture (${fixture.what}); it returned: ${faults.join(' | ') || '(nothing)'}`);
            preflightFailed++;
        }
    }
    if (preflightFailed) {
        console.error(`${NAME} --self-test: FAIL -- ${preflightFailed} pre-flight fixture(s) failed, so the case-table guard cannot be trusted and no plant was run`);
        return 1;
    }
    const tableFaults = expectTableFaults(cases);
    if (tableFaults.length) {
        for (const message of tableFaults) {
            console.error(`${NAME} --self-test: FAIL -- the case table is malformed: ${message}`);
        }
        return 1;
    }

    let failed = 0;
    for (const testCase of cases) {
        const report = await runProtocol(derived, testCase.plant);
        const failures = assertReport(derived, report);
        if (report.driveError) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' could not be driven at all: ${report.driveError}`);
            failed++;
            continue;
        }
        if (testCase.expectClean) {
            if (failures.length) {
                console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' is red before any fault is planted: ${failures.join(' | ')}`);
                failed++;
            } else {
                console.log(`  ok  ${testCase.name} -> green`);
            }
            continue;
        }
        if (!(report.notes ?? []).some(note => note.startsWith('PLANT'))) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' never applied its fault (the plant site drifted), so a red or green here would mean nothing`);
            failed++;
            continue;
        }
        // ANCHORED, not substring: the expect is the first thing in the message
        // or it scores nothing, so a plant can only ever be credited with the
        // family it names. And CONTRACT, not instrument: a message carrying
        // BROKEN_INSTRUMENT_MARKER says the phase could not assert, so it is
        // never credit for the plant -- see the failure-family block above.
        const named = failures.filter(f => f.startsWith(testCase.expect));
        const scored = named.filter(f => !f.includes(BROKEN_INSTRUMENT_MARKER));
        if (scored.length) {
            console.log(`  ok  ${testCase.name} -> red, naming '${testCase.expect}'`);
            for (const message of scored.slice(0, 2)) {
                console.log(`      ${message}`);
            }
        } else if (named.length) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' named '${testCase.expect}' only through broken-instrument reports; no plant may be scored on one, so the '${testCase.expect}' family has no demonstrated contract red under this plant. The guard that fired: ${named[0]}`);
            failed++;
        } else {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not go red naming '${testCase.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed++;
        }
    }

    if (failed) {
        console.error(`${NAME} --self-test: FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    const plants = cases.filter(c => !c.expectClean);
    console.log(`${NAME} --self-test: PASS -- the clean control is green and all ${plants.length} planted faults went red: ${plants.map(c => c.plant).join(', ')}`);
    return 0;
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(HELP.trimEnd());
    process.exit(0);
}
process.exit(args.includes('--self-test') ? await selfTest() : await main());
