#!/usr/bin/env node
/**
 * Phase 38 (EXT-06, EXT-07; D-03, D-06, D-11): the extension bridge gate.
 *
 * Toolbar buttons and the puzzle menu are Theia-rendered, and a click is
 * dispatched by chrome on the Phase 31.1 tab host's selected tab. The
 * wrong-page bug (Pitfall 12) comes back the moment a click goes through
 * the stock delegate path, which re-reads the selected tab of whatever
 * window it is handed. This gate holds the bridge to its contract:
 *
 *   1. fixtures   -- the extension set the live check installs is DERIVED
 *                    from the manifests in scripts/lib/pb-extension-fixtures.mjs
 *                    (ids and versions); ids are unique and in the throwaway
 *                    @powerbrowser.test namespace, and every fixture the live
 *                    file installs exists (set equality, once it has landed).
 *   2. literals   -- no derived fixture id appears in a product source
 *                    (powerbrowser/, theia/extensions/<pkg>/src), comments
 *                    included: product code never names an extension.
 *   3. stock path -- no product source contains the stock delegate's
 *                    trigger-action call (the forbidden path; only this gate's
 *                    plant spells it).
 *   4. group      -- `messagemanagergroup` appears in code only inside the
 *                    31.1 host sites: webTabOpen (the overlay attribute) and
 *                    tabHostAddTab (the group guard). A new one anywhere else
 *                    is red by file and line.
 *   5. kinds      -- every extension* store kind and tabsBridge* action kind
 *                    chrome routes is classified in verify-web-tab-bridge.mjs;
 *                    click, pin and remove are store kinds classed privileged
 *                    (D-11), a tabsBridge* kind is tab-lifecycle, and no
 *                    extension* kind rides the webTab action channel.
 *   6. click path -- the extension section of PowerBrowserAPI.sys.mjs holds
 *                    exactly one triggerClickOrPopup( call, spelled
 *                    triggerClickOrPopup(selectedTab), and reads tab identity
 *                    only from the 31.1 host (no tabTracker, no
 *                    getTabForBrowser of its own). 38-REVIEW CR-03: the host
 *                    selection moves only to a tab the frontend shows:
 *                    tabsBridgeActivate selects an adopted tab, or a pending
 *                    one whose adoptTab push has not gone; after the push the
 *                    request rides the entry to webTabOpen's already-open
 *                    branch, which pushes selectTab once the widget attaches.
 *   7. signal     -- every event patch 050 dispatches (its updateWindow skip
 *                    fires one on setBadgeText/setIcon) is one the extension
 *                    section listens for in EXTENSION_TAB_EVENTS, so a badge
 *                    change reaches Theia without waiting for a tab event.
 *   8. widget     -- (38-02, D-02) the chrome-bar extensions/ sources exist
 *                    (derived from the tree: the buttons widget and the anchor
 *                    reporter among them), and no chrome-bar source draws
 *                    extension content in Theia DOM: no <iframe, no
 *                    dangerouslySetInnerHTML (an icon is an <img src> only) and
 *                    no moz-extension: string. The popup is the native panel.
 *   9. page action -- (38-03, EXT-08 SC3, B2) the pill icon shows what chrome
 *                    pushed: the extension section reads isShownForTab on the
 *                    host's selected tab, the row validator requires
 *                    pageActionShown, the widget's renderPageActions filters
 *                    on it and reads no page URL or pattern, and no other
 *                    chrome-bar source draws a page-action icon.
 *  10. menus      -- (38-03, EXT-08, D-05) extension menus entries reach the
 *                    menu only through the Phase 35 relay: the one
 *                    on-build-contextmenu notify in the product is in
 *                    pageMenuExtensionEntries, whose one caller is
 *                    openPageMenu, reached only from the #contentAreaContextMenu
 *                    stub's popupshowing listener; and the only Theia source
 *                    that takes the page menu's rows (the pageContextMenu push,
 *                    an extension-entry id) is page-context-menu.ts, never an
 *                    IDE menu contribution. The live proof is Phase 35's
 *                    verify-page-furniture-live.mjs --scenario extension-entry.
 *  11. sidebar    -- (38-04, B5) patch 050's ext-sidebarAction.js still skips
 *                    the shell window in createMenuItem and updateWindow (the
 *                    ruling moves the sidebar into a Theia view, it does not
 *                    revert 050); the page loads only through the stock panel
 *                    document's loadPanel in a chrome browser, never through an
 *                    overlay opener; the row validator requires sidebarOpen,
 *                    and only the extensions/ widget shows the sidebar view.
 *  12. tab pages  -- (38-04, B5) tabsBridgeCreate sends an extension page to
 *                    extensionOpenTabPage (the stock window) before any overlay
 *                    exists, and still refuses every other non-http(s) URL;
 *                    extensionOpenTabPage opens no overlay and admits only the
 *                    caller's own pages; a container request (userContextId)
 *                    is refused before either branch (38-REVIEW CR-02); the overlay location wall
 *                    (OVERLAY_LOCATION) names no extension scheme.
 *  13. commands   -- (38-04, B5 + the 2026-10-20 keys ruling) the section's
 *                    EXTENSION_EXECUTE_COMMANDS equals the _execute_* names
 *                    upstream ExtensionShortcuts.buildKey dispatches, and its
 *                    keyset prefix equals the id registerKeysToDocument gives
 *                    each keyset (both derived from upstream); pushPageFocus
 *                    scopes the extension keys before its early return; the
 *                    tab host install installs the receivers once, whose
 *                    capture command listener stops the stock _execute_* path;
 *                    and the boundary creates no <key> of its own and names no
 *                    Phase 27 row id (the key table owns Theia's keys).
 *  14. private    -- (38-04 security fix) every function in the extension
 *      browsing      section that reaches a private-browsing sink (one of
 *                    PB_SINKS: loads a sidebar page, runs a click, opens a
 *                    popup, reads an extension's action or sidebar for a
 *                    window, resolves a stock window for a tab page, creates
 *                    a tab in the shell window) contains an extension
 *                    canAccessWindow check, as stock ext-sidebarAction.js,
 *                    ext-browserAction.js and ext-tabs.js create do;
 *                    the function set is derived from the section, and a
 *                    guarded function taking `win` is called with `win`.
 *                    The self-test derives one plant per guarded function.
 *
 * Everything is derived at check time and compared; a derivation that finds
 * nothing is a broken instrument, never a pass. --self-test first requires
 * the unmutated tree to be green, then plants one fault per rule in memory
 * and requires each to go red naming its drift.
 *
 * Static: text reads and one module import, no build, no browser -- --quick.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTENSION_FIXTURES } from './lib/pb-extension-fixtures.mjs';

const NAME = 'verify-extension-actions';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const BRIDGE_GATE = 'scripts/verify-web-tab-bridge.mjs';
const LIVE = 'scripts/verify-extension-actions-live.mjs';
const PATCH_050 = 'patches/050-extension-tab-host.patch';
const UPSTREAM_SHORTCUTS = 'upstream/toolkit/components/extensions/ExtensionShortcuts.sys.mjs';
const PRODUCT_DIRS = ['powerbrowser', 'theia/extensions'];
const SECTION_MARK = '// Phase 38 (EXT-06, EXT-07): the extension bridge.';
const CHROME_BAR_SRC = 'theia/extensions/chrome-bar/src/';
const EXTENSIONS_DIR = `${CHROME_BAR_SRC}browser/extensions/`;
const EXTENSIONS_WIDGET = `${EXTENSIONS_DIR}extension-actions-widget.tsx`;
const EXTENSIONS_ANCHOR = `${EXTENSIONS_DIR}extension-popup-anchor.ts`;
const WEB_TAB = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const EXTENSIONS_SIDEBAR_VIEW = `${EXTENSIONS_DIR}extension-sidebar-view.ts`;
// Rule 11: what putting a page into a web tab looks like in chrome (the overlay factories and the tabs bridge).
const OVERLAY_OPENERS = ['createPendingOverlay(', 'webTabOpen(', 'tabsBridgeCreate(', 'tabHostAddTab('];
const PAGE_MENU = 'theia/extensions/chrome-bar/src/browser/page-context-menu.ts';
// Rule 9: what computing a page action's visibility Theia-side would read (the page's address or the extension's patterns).
const PAGE_MATCH = /url|uri\b|href|location|match/i;
// D-02: what drawing extension content in Theia DOM looks like; the first two would host a popup page, the last names one.
const THEIA_DOM_POPUP = [['<iframe', 'an <iframe'], ['dangerouslySetInnerHTML', 'dangerouslySetInnerHTML'], [['moz', 'extension:'].join('-'), 'an extension-scheme URL']];
// The stock delegate's call, assembled so this file's own text never matches rule 3's scan of the tree.
const STOCK_TRIGGER = ['trigger', 'Action('].join('');
const FIXTURE_NAMESPACE = /@powerbrowser\.test$/;
// Rule 14: what reaching a window for an extension looks like in the section (the sink markers; the functions are derived).
const PB_SINKS = ['.loadPanel(', 'triggerClickOrPopup(', 'shellPanelPopup(', 'actionFor(extension)', 'sidebarFor(extension)', 'getMostRecentWindow(', 'createPendingOverlay('];

// D-11, the one hand-kept table: the classes a ruling fixed, not a derivation.
const REQUIRED_STORE_CLASS = new Map([
    ['extensionClick', 'privileged'],
    ['extensionPin', 'privileged'],
    ['extensionRemove', 'privileged'],
    ['extensionSidebar', 'privileged'],
    ['extensionSidebarGeometry', 'privileged'],
    ['extensionInstallSite', 'network'], // 38-05: D-11 makes the install trigger network
]);

// 38-01 Task 2 landed the bridge (the PRESENCE_ASSERTION_TODO point): rule 6 requires the sanctioned click call and
// rule 1 the live file. Kept as a constant so the self-test can still run the pre-bridge shape.
const BRIDGE_LANDED = true;

function stripComments(text) {
    // Block comments keep their newlines, so a reported line number is the file's own.
    return text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, '')).replace(/(^|\s)\/\/.*$/gm, '$1');
}

function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return { surplus: [...a].filter(x => !e.has(x)), missing: [...e].filter(x => !a.has(x)) };
}

/** Product sources: .js/.mjs/.ts/.tsx/.xhtml under powerbrowser/ and every theia/extensions/<pkg>/src. */
function productFiles() {
    const files = [];
    for (const name of readdirSync(join(REPO_ROOT, 'powerbrowser'), { recursive: true })) {
        if (/\.(m?js|xhtml)$/.test(name)) files.push(`powerbrowser/${name}`);
    }
    for (const pkg of readdirSync(join(REPO_ROOT, 'theia/extensions'))) {
        const src = `theia/extensions/${pkg}/src`;
        if (!existsSync(join(REPO_ROOT, src))) continue;
        for (const name of readdirSync(join(REPO_ROOT, src), { recursive: true })) {
            if (/\.tsx?$/.test(name)) files.push(`${src}/${name}`);
        }
    }
    return files;
}

function readSources() {
    const src = {};
    for (const file of [...productFiles(), BRIDGE_GATE, PATCH_050]) src[file] = readFileSync(join(REPO_ROOT, file), 'utf8');
    if (existsSync(join(REPO_ROOT, UPSTREAM_SHORTCUTS))) src[UPSTREAM_SHORTCUTS] = readFileSync(join(REPO_ROOT, UPSTREAM_SHORTCUTS), 'utf8');
    if (existsSync(join(REPO_ROOT, LIVE))) src[LIVE] = readFileSync(join(REPO_ROOT, LIVE), 'utf8');
    return src;
}

/** Start and end line (0-based, inclusive) of a function or method whose header matches `header`, by brace depth. */
function span(lines, header) {
    const start = lines.findIndex(l => header.test(l));
    if (start < 0) return null;
    let depth = 0;
    for (let i = start; i < lines.length; i++) {
        for (const ch of lines[i]) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
        }
        if (depth === 0 && i > start) return { start, end: i };
    }
    return null;
}

/** The top-level function enclosing 0-based line `index`, by header and brace span; null when none does. */
function enclosingFunction(lines, index) {
    for (let i = index; i >= 0; i--) {
        const m = /^(?:async )?function ([A-Za-z_$][\w$]*)\(/.exec(lines[i]);
        if (!m) continue;
        const s = span(lines, new RegExp(`^(?:async )?function ${m[1]}\\(`));
        return s && index <= s.end ? { name: m[1], ...s } : null;
    }
    return null;
}

/** Rule 14: each extension-section function (name -> span, marker) whose body reaches a PB_SINKS marker. */
function privateBrowsingSinks(apiLines, text) {
    const at = text.indexOf(SECTION_MARK);
    const base = at < 0 ? apiLines.length : text.slice(0, at).split('\n').length - 1;
    const guarded = new Map();
    const unreached = [];
    for (const marker of PB_SINKS) {
        let found = 0;
        for (let i = base; i < apiLines.length; i++) {
            const fn = apiLines[i].includes(marker) ? enclosingFunction(apiLines, i) : null;
            if (fn && i !== fn.start) {
                found++;
                guarded.set(fn.name, { ...fn, marker });
            }
        }
        if (!found) unreached.push(marker);
    }
    return { guarded, unreached };
}

function setMembers(text, name) {
    const m = new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`).exec(text);
    return m ? [...m[1].matchAll(/"([A-Za-z]+)"/g)].map(x => x[1]) : null;
}

function mapEntries(text, name) {
    const m = new RegExp(`const ${name} = new Map\\(\\[([\\s\\S]*?)\\n\\]\\);`).exec(text);
    return m ? new Map([...stripComments(m[1]).matchAll(/\['([A-Za-z]+)',\s*'([a-z-]+)'\]/g)].map(x => [x[1], x[2]])) : null;
}

function check(src, fixtures = EXTENSION_FIXTURES, bridgeLanded = BRIDGE_LANDED) {
    const failures = [];
    const products = Object.keys(src).filter(f => PRODUCT_DIRS.some(d => f.startsWith(`${d}/`)));

    // 1. fixtures
    const derived = Object.entries(fixtures).map(([name, f]) => ({ name, id: f.manifest?.browser_specific_settings?.gecko?.id, version: f.manifest?.version }));
    if (derived.length === 0) failures.push('fixtures: derived ZERO fixture manifests (broken instrument, never a clean pass)');
    const seen = new Map();
    for (const f of derived) {
        if (typeof f.id !== 'string' || !FIXTURE_NAMESPACE.test(f.id)) failures.push(`fixtures: the ${f.name} fixture installs under ${f.id}, outside the @powerbrowser.test namespace`);
        if (typeof f.version !== 'string' || !f.version) failures.push(`fixtures: the ${f.name} fixture manifest has no version`);
        if (seen.has(f.id)) failures.push(`fixtures: the ${f.name} and ${seen.get(f.id)} fixtures install under the same id ${f.id} (drifted fixture id)`);
        seen.set(f.id, f.name);
    }
    if (src[LIVE] !== undefined) {
        const installed = [...stripComments(src[LIVE]).matchAll(/installFixture\(\s*app\s*,\s*'([a-z-]+)'\s*\)/g)].map(m => m[1]);
        if (installed.length === 0) failures.push(`fixtures: ${LIVE} installs no fixture by name (broken instrument)`);
        const { surplus, missing } = diff(installed, Object.keys(fixtures));
        if (surplus.length) failures.push(`fixtures: ${LIVE} installs fixtures the manifests do not define: ${surplus.join(', ')}`);
        if (missing.length) failures.push(`fixtures: fixtures no scenario installs: ${missing.join(', ')}`);
    } else if (bridgeLanded) {
        failures.push(`fixtures: ${LIVE} is missing; the bridge has landed, so the live check must exist`);
    }

    // 2. literals
    for (const file of products) {
        for (const f of derived) {
            if (typeof f.id === 'string' && src[file].includes(f.id)) failures.push(`literals: ${file} names the fixture id ${f.id} (hand-kept id literal)`);
        }
    }

    // 3. stock path
    for (const file of products) {
        const lines = src[file].split('\n');
        lines.forEach((line, i) => {
            if (line.includes(STOCK_TRIGGER)) failures.push(`stock-path: ${file}:${i + 1} calls the stock delegate's ${STOCK_TRIGGER} (the wrong-page path; use triggerClickOrPopup(selectedTab))`);
        });
    }

    // 4. group
    const apiLines = stripComments(src[API]).split('\n');
    const allowed = [span(apiLines, /^ {2}webTabOpen\(/), span(apiLines, /^function tabHostAddTab\(/)];
    if (allowed.some(s => !s)) failures.push(`group: ${API}: webTabOpen or tabHostAddTab not found (broken instrument)`);
    let groupHits = 0;
    for (const file of products) {
        stripComments(src[file]).split('\n').forEach((line, i) => {
            if (!line.includes('messagemanagergroup')) return;
            groupHits++;
            const inHost = file === API && allowed.some(s => s && i >= s.start && i <= s.end);
            if (!inHost) failures.push(`group: ${file}:${i + 1} names messagemanagergroup outside the 31.1 host sites (webTabOpen, tabHostAddTab)`);
        });
    }
    if (groupHits === 0) failures.push('group: derived ZERO messagemanagergroup sites (broken instrument; webTabOpen must set it)');

    // 5. kinds
    const storeKinds = setMembers(src[API], 'STORE_REQUEST_KINDS');
    const actionKinds = setMembers(src[API], 'WEB_TAB_ACTION_KINDS');
    const storeClasses = mapEntries(src[BRIDGE_GATE], 'STORE_KIND_CLASSES');
    const kindClasses = mapEntries(src[BRIDGE_GATE], 'KIND_CLASSES');
    if (!storeKinds?.length || !actionKinds?.length || !storeClasses?.size || !kindClasses?.size) {
        failures.push('kinds: STORE_REQUEST_KINDS, WEB_TAB_ACTION_KINDS, STORE_KIND_CLASSES or KIND_CLASSES derived nothing (broken instrument)');
    } else {
        for (const kind of storeKinds.filter(k => k.startsWith('extension'))) {
            const cls = storeClasses.get(kind);
            if (!cls) failures.push(`kinds: the store kind ${kind} has no STORE_KIND_CLASSES entry in ${BRIDGE_GATE} (unclassified kind)`);
            else if (REQUIRED_STORE_CLASS.has(kind) && cls !== REQUIRED_STORE_CLASS.get(kind)) failures.push(`kinds: ${kind} is classed ${cls}; D-11 makes it ${REQUIRED_STORE_CLASS.get(kind)}`);
        }
        for (const kind of actionKinds.filter(k => k.startsWith('extension'))) {
            failures.push(`kinds: ${kind} rides the webTab action channel; extension kinds are store kinds (D-11)`);
        }
        for (const kind of actionKinds.filter(k => k.startsWith('tabsBridge'))) {
            if (kindClasses.get(kind) !== 'tab-lifecycle') failures.push(`kinds: the action kind ${kind} is not classed tab-lifecycle in KIND_CLASSES (unclassified kind)`);
        }
        for (const [kind] of REQUIRED_STORE_CLASS) {
            if (bridgeLanded && !storeKinds.includes(kind)) failures.push(`kinds: the store kind ${kind} is not routed (STORE_REQUEST_KINDS)`);
        }
    }

    // 6. click path
    if (bridgeLanded) {
        const at = src[API].indexOf(SECTION_MARK);
        if (at < 0) {
            failures.push(`click-path: ${API} has no extension section (marker "${SECTION_MARK}")`);
        } else {
            const section = stripComments(src[API].slice(at));
            const calls = (stripComments(src[API]).match(/triggerClickOrPopup\(/g) ?? []).length;
            const sanctioned = (section.match(/triggerClickOrPopup\(selectedTab\)/g) ?? []).length;
            if (calls !== 1 || sanctioned !== 1) failures.push(`click-path: ${API} has ${calls} triggerClickOrPopup( call(s), ${sanctioned} spelled triggerClickOrPopup(selectedTab) in the extension section; the rule is exactly one, that one`);
            for (const word of ['tabTracker', 'getTabForBrowser(']) {
                if (section.includes(word)) failures.push(`click-path: the extension section names ${word}; tab identity comes only from the 31.1 host (D-05)`);
            }
            // 38-REVIEW CR-03: the host selection follows only a tab the frontend shows. tabsBridgeActivate selects an
            // adopted tab, or a pending one whose adoptTab push has not gone; after the push it defers to the attach.
            const act = span(apiLines, /^function tabsBridgeActivate\(/);
            const actBody = act ? apiLines.slice(act.start, act.end + 1).join('\n') : '';
            const selects = (actBody.match(/selectNode\(/g) ?? []).length;
            if (selects !== 2 || !/if \(tabId !== null\) \{\s*selectNode\(host, tab\);/.test(actBody) || !/if \(pending\.pushed\) \{\s*pending\.activateOnAck = true;\s*\} else \{\s*selectNode\(host, tab\);/.test(actBody)) {
                failures.push(`click-path: tabsBridgeActivate moves the host selection ahead of the frontend (${selects} selectNode( call(s); the rule is one for an adopted tab and one for a pending tab whose adoptTab push has not gone)`);
            }
            if (!/pending\.pushed = true;\s*sendWebTabPush\(theiaBrowser, \{ kind: "adoptTab"/.test(stripComments(src[API]))) failures.push(`click-path: createPendingOverlay does not mark pending.pushed as its adoptTab push goes`);
            if (!/entry\.activateOnAttach = Boolean\(pending\.activateOnAck\);/.test(src[API])) failures.push(`click-path: adoptPendingOverlay does not carry a deferred activation (activateOnAck) to the adopted entry`);
            if (!/if \(webTabs\.get\(tabId\)\.activateOnAttach\) \{\s*webTabs\.get\(tabId\)\.activateOnAttach = false;\s*sendWebTabPush\(theiaBrowser, \{ kind: "selectTab", tabId \}\);/.test(src[API])) failures.push(`click-path: webTabOpen's already-open branch does not show a deferred activation (selectTab) once the widget attaches`);
        }
    }

    // 7. signal
    if (bridgeLanded) {
        const fired = [...src[PATCH_050].matchAll(/^\+.*dispatchEvent\(new window\.Event\("([A-Za-z]+)"\)\)/gm)].map(m => m[1]);
        const heard = /const EXTENSION_TAB_EVENTS = \[([^\]]*)\]/.exec(src[API]);
        if (fired.length === 0 || !heard) failures.push(`signal: derived no event ${PATCH_050} dispatches, or no EXTENSION_TAB_EVENTS in ${API} (broken instrument)`);
        else for (const type of fired) if (!heard[1].includes(`"${type}"`)) failures.push(`signal: ${PATCH_050} dispatches ${type}, which EXTENSION_TAB_EVENTS does not listen for (a badge change would wait for a tab event)`);
    }

    // 8. widget
    const extensionSources = products.filter(f => f.startsWith(EXTENSIONS_DIR));
    for (const file of [EXTENSIONS_WIDGET, EXTENSIONS_ANCHOR]) {
        if (!extensionSources.includes(file)) failures.push(`widget: ${file} is missing from the chrome-bar extensions/ sources (derived ${extensionSources.length})`);
    }
    for (const file of products.filter(f => f.startsWith(CHROME_BAR_SRC))) {
        stripComments(src[file]).split('\n').forEach((line, i) => {
            for (const [needle, what] of THEIA_DOM_POPUP) {
                if (line.includes(needle)) failures.push(`widget: ${file}:${i + 1} renders extension content in Theia DOM (${what}); the popup is the native XUL panel (D-02)`);
            }
        });
    }
    // 9. page action
    if (bridgeLanded) {
        const section = stripComments(src[API].slice(Math.max(0, src[API].indexOf(SECTION_MARK))));
        if (!section.includes('action.isShownForTab(host.selected)')) failures.push(`page-action: the extension section of ${API} does not read action.isShownForTab(host.selected); the pill icon's shown state is chrome's (B2)`);
        if (!/typeof r\.pageActionShown === 'boolean'/.test(src[WEB_TAB] ?? '')) failures.push(`page-action: ${WEB_TAB}'s extensionActionRowsOf does not require pageActionShown`);
        const widgetLines = stripComments(src[EXTENSIONS_WIDGET] ?? '').split('\n');
        const body = span(widgetLines, /^ {4}renderPageActions\(\)/);
        if (!body) {
            failures.push(`page-action: ${EXTENSIONS_WIDGET} has no renderPageActions() (broken instrument)`);
        } else {
            const text = widgetLines.slice(body.start + 1, body.end).join('\n');
            if (!text.includes('.filter(row => row.pageActionShown)')) failures.push(`page-action: ${EXTENSIONS_WIDGET} renderPageActions does not show exactly the rows chrome pushed with pageActionShown`);
            const local = PAGE_MATCH.exec(text);
            if (local) failures.push(`page-action: ${EXTENSIONS_WIDGET} renderPageActions decides visibility from the page (${local[0]}) instead of the pushed pageActionShown`);
        }
        for (const file of products.filter(f => f.startsWith(CHROME_BAR_SRC) && f !== EXTENSIONS_WIDGET)) {
            if (stripComments(src[file]).includes('pb-page-action')) failures.push(`page-action: ${file} draws a page-action icon outside ${EXTENSIONS_WIDGET}'s renderPageActions`);
        }
    }
    // 10. menus
    const callLines = (lines, name) => lines.flatMap((l, i) => (l.includes(`${name}(`) && !new RegExp(`function ${name}\\(`).test(l) ? [i] : []));
    const notifies = products.flatMap(file => stripComments(src[file]).split('\n').flatMap((l, i) => (l.includes('"on-build-contextmenu"') && l.includes('notifyObservers') ? [{ file, i }] : [])));
    const builder = notifies.length === 1 && notifies[0].file === API ? enclosingFunction(apiLines, notifies[0].i) : null;
    if (builder?.name !== 'pageMenuExtensionEntries') {
        failures.push(`menus: the product notifies on-build-contextmenu at ${notifies.map(n => `${n.file}:${n.i + 1}`).join(', ') || 'no site'}; the rule is one site, in ${API}'s pageMenuExtensionEntries`);
    } else {
        const callers = callLines(apiLines, 'pageMenuExtensionEntries').map(i => enclosingFunction(apiLines, i)?.name);
        if (callers.length !== 1 || callers[0] !== 'openPageMenu') failures.push(`menus: pageMenuExtensionEntries is called from ${callers.join(', ') || 'nowhere'}; the rule is once, from openPageMenu`);
        const opens = callLines(apiLines, 'openPageMenu');
        if (opens.length === 0) failures.push(`menus: derived no openPageMenu caller in ${API} (broken instrument)`);
        for (const i of opens) {
            const fn = enclosingFunction(apiLines, i);
            const text = fn ? apiLines.slice(fn.start, fn.end + 1).join('\n') : '';
            if (!text.includes('getElementById("contentAreaContextMenu").addEventListener(') || !text.includes('"popupshowing"')) failures.push(`menus: ${API}:${i + 1} opens the page menu outside the #contentAreaContextMenu stub's popupshowing path (${fn?.name ?? 'top level'})`);
        }
    }
    const theiaSources = products.filter(f => f.startsWith('theia/extensions/'));
    if (!stripComments(src[PAGE_MENU] ?? '').includes("onPush('pageContextMenu'")) failures.push(`menus: ${PAGE_MENU} no longer subscribes to the pageContextMenu push (broken instrument)`);
    for (const file of theiaSources.filter(f => f !== PAGE_MENU)) {
        stripComments(src[file]).split('\n').forEach((line, i) => {
            const what = line.includes('extension-entry') ? 'extension-entry' : line.includes("'pageContextMenu'") ? 'pageContextMenu' : null;
            if (what) failures.push(`menus: ${file}:${i + 1} takes the page menu's rows (${what}) outside the relay's one consumer ${PAGE_MENU}`);
        });
    }
    // 11. sidebar
    if (bridgeLanded) {
        const sidebarDiff = /^diff --git a\/browser\/components\/extensions\/parent\/ext-sidebarAction\.js[\s\S]*?(?=^diff --git )/m.exec(src[PATCH_050])?.[0] ?? '';
        if (!sidebarDiff) failures.push(`sidebar: ${PATCH_050} has no ext-sidebarAction.js diff (broken instrument)`);
        for (const fn of ['createMenuItem(window, details)', 'updateWindow(window)']) {
            const hunk = sidebarDiff.split(/^@@/m).find(h => h.includes(fn));
            if (sidebarDiff && !/^\+.*windowTracker\.isTabHostWindow\(window\)/m.test(hunk ?? '')) failures.push(`sidebar: ${PATCH_050}'s ext-sidebarAction.js ${fn} no longer skips the shell window (isTabHostWindow); the B5 ruling moves the sidebar into a Theia view, it does not revert 050`);
        }
        const open = span(apiLines, /^function extensionSidebarOpen\(/);
        if (!open) {
            failures.push(`sidebar: ${API} has no extensionSidebarOpen (broken instrument)`);
        } else {
            const body = apiLines.slice(open.start, open.end + 1).join('\n');
            if (!body.includes('EXTENSION_SIDEBAR_HOST') || !body.includes('.loadPanel(')) failures.push(`sidebar: extensionSidebarOpen does not load the page through the stock panel document's loadPanel`);
            for (const opener of OVERLAY_OPENERS) {
                if (body.includes(opener)) failures.push(`sidebar: extensionSidebarOpen puts the sidebar page in an overlay (${opener}); an extension page never enters a web tab`);
            }
        }
        if (!/^const EXTENSION_SIDEBAR_HOST = "chrome:\/\/browser\/content\/webext-panels\.xhtml";$/m.test(src[API])) failures.push(`sidebar: EXTENSION_SIDEBAR_HOST is not the stock panel document chrome://browser/content/webext-panels.xhtml`);
        if (!/typeof r\.sidebarOpen === 'boolean'/.test(src[WEB_TAB] ?? '')) failures.push(`sidebar: ${WEB_TAB}'s extensionActionRowsOf does not require sidebarOpen`);
        if (!products.includes(EXTENSIONS_SIDEBAR_VIEW)) failures.push(`sidebar: ${EXTENSIONS_SIDEBAR_VIEW} is missing`);
        for (const file of products.filter(f => f.startsWith(CHROME_BAR_SRC) && f !== EXTENSIONS_WIDGET && f !== EXTENSIONS_SIDEBAR_VIEW)) {
            if (stripComments(src[file]).includes('ExtensionSidebarView')) failures.push(`sidebar: ${file} shows the sidebar view outside ${EXTENSIONS_WIDGET}`);
        }
    }
    // 12. tab pages
    if (bridgeLanded) {
        const create = span(apiLines, /^function tabsBridgeCreate\(/);
        const route = create ? apiLines.slice(create.start, create.end + 1).findIndex(l => l.includes('startsWith("moz-extension:")')) : -1;
        const block = route >= 0 ? span(apiLines.slice(create.start), /startsWith\("moz-extension:"\)/) : null;
        if (!create || !block) {
            failures.push(`tab-pages: tabsBridgeCreate does not route an extension page (startsWith("moz-extension:")) before its overlay`);
        } else {
            const body = apiLines.slice(create.start + block.start, create.start + block.end + 1).join('\n');
            const rest = apiLines.slice(create.start + block.end + 1, create.end + 1).join('\n');
            if (!body.includes('extensionOpenTabPage(')) failures.push(`tab-pages: tabsBridgeCreate's extension-page branch does not go to extensionOpenTabPage (the stock window)`);
            for (const opener of OVERLAY_OPENERS) {
                if (body.includes(opener)) failures.push(`tab-pages: tabsBridgeCreate puts an extension page in an overlay (${opener}); tab pages go to the stock window`);
            }
            if (!rest.includes('/^https?:\\/\\//i.test(url)')) failures.push(`tab-pages: tabsBridgeCreate no longer refuses every other non-http(s) URL`);
            // 38-REVIEW CR-02: a container request is refused before either branch opens anything (never silently dropped).
            const head = apiLines.slice(create.start, create.start + block.start).join('\n');
            if (!/if \(options\?\.userContextId\) \{\s*throw new extensionLazy\.ExtensionUtils\.ExtensionError\(/.test(head)) failures.push(`tab-pages: tabsBridgeCreate does not refuse a container (options.userContextId) before it opens a page; the tab would load in the default cookie jar`);
        }
        const opener = span(apiLines, /^function extensionOpenTabPage\(/);
        const openerBody = opener ? apiLines.slice(opener.start, opener.end + 1).join('\n') : '';
        if (!opener) failures.push(`tab-pages: ${API} has no extensionOpenTabPage (broken instrument)`);
        if (opener && !openerBody.includes('principal?.addonId !== policy.id')) failures.push(`tab-pages: extensionOpenTabPage admits another extension's page (no principal?.addonId !== policy.id check)`);
        for (const o of OVERLAY_OPENERS) {
            if (openerBody.includes(o)) failures.push(`tab-pages: extensionOpenTabPage opens an overlay (${o})`);
        }
        const wall = /^const OVERLAY_LOCATION = (.*);$/m.exec(src[API])?.[1];
        if (!wall) failures.push(`tab-pages: ${API} has no OVERLAY_LOCATION (broken instrument)`);
        else if (/moz-extension|extension:/i.test(wall)) failures.push(`tab-pages: OVERLAY_LOCATION admits an extension page into an overlay (${wall})`);
    }
    // 13. commands
    if (bridgeLanded) {
        const upstream = (src[UPSTREAM_SHORTCUTS] ?? '').split('\n');
        const build = span(upstream, /^ {2}buildKey\(doc, name, shortcut\) \{/);
        const derived = build ? new Set(upstream.slice(build.start, build.end + 1).join('\n').match(/_execute_[a-z_]+/g) ?? []) : new Set();
        const prefix = /keyset\.id = `([a-z-]+)\$\{/.exec(src[UPSTREAM_SHORTCUTS] ?? '')?.[1];
        const ours = JSON.parse(/^const EXTENSION_EXECUTE_COMMANDS = (\[[^\]]*\]);$/m.exec(src[API])?.[1] ?? 'null');
        const ourPrefix = /^const EXTENSION_KEYSET_PREFIX = "([^"]*)";$/m.exec(src[API])?.[1];
        if (derived.size === 0 || !prefix) {
            failures.push(`commands: derived no _execute_* name or keyset prefix from ${UPSTREAM_SHORTCUTS} (broken instrument)`);
        } else {
            const { surplus, missing } = diff(ours ?? [], [...derived]);
            if (!ours || surplus.length || missing.length) failures.push(`commands: EXTENSION_EXECUTE_COMMANDS drifted from upstream buildKey's _execute_* names (surplus ${surplus.join(', ') || 'none'}; missing ${missing.join(', ') || 'none'})`);
            if (ourPrefix !== prefix) failures.push(`commands: EXTENSION_KEYSET_PREFIX ${ourPrefix} is not the keyset id prefix upstream registerKeysToDocument uses (${prefix})`);
        }
        const focus = span(apiLines, /^ {2}pushPageFocus\(theiaBrowser, tabId\) \{/);
        const focusLines = focus ? apiLines.slice(focus.start, focus.end + 1) : [];
        const scoped = focusLines.findIndex(l => l.includes('extensionKeysFollowPageFocus('));
        const early = focusLines.findIndex(l => l.includes('return;'));
        if (scoped < 0 || (early >= 0 && scoped > early)) failures.push(`commands: pushPageFocus does not scope the extension keys (extensionKeysFollowPageFocus) before its early return; an extension key would fire with the IDE focused`);
        const installs = apiLines.filter(l => /\binstallExtensionReceivers\(win\);/.test(l)).length;
        if (installs !== 1) failures.push(`commands: installExtensionReceivers(win) is called ${installs} time(s); the rule is once, from the tab host install`);
        const receivers = span(apiLines, /^function installExtensionReceivers\(/);
        const receiversText = receivers ? apiLines.slice(receivers.start, receivers.end + 1).join('\n') : '';
        if (!/addEventListener\("command"[\s\S]*stopPropagation\(\)[\s\S]*\}, true\)/.test(receiversText)) failures.push(`commands: installExtensionReceivers has no capture command listener that stops the stock _execute_* path`);
        if (/createXULElement\("key"\)/.test(stripComments(src[API]))) failures.push(`commands: ${API} creates a <key> of its own; the Phase 27 key table owns key rows (key collision)`);
        if (stripComments(src[API]).includes('powerbrowser-page-key-')) failures.push(`commands: ${API} names a Phase 27 row id (powerbrowser-page-key-); an extension key must not take a Theia key's row (key collision)`);
    }
    // 14. private browsing
    if (bridgeLanded) {
        const { guarded, unreached } = privateBrowsingSinks(apiLines, src[API]);
        for (const marker of unreached) failures.push(`private-browsing: no function in the extension section reaches ${marker} (broken instrument)`);
        for (const [name, fn] of guarded) {
            if (!apiLines.slice(fn.start + 1, fn.end + 1).join('\n').includes('.canAccessWindow(')) failures.push(`private-browsing: ${name} reaches ${fn.marker} with no extension canAccessWindow check; an extension not allowed in private windows would reach a private window`);
            if (!/^(?:async )?function \w+\(win[,)]/.test(apiLines[fn.start])) continue;
            apiLines.forEach((line, i) => {
                if (i !== fn.start && new RegExp(`\\b${name}\\((?!win\\b)`).test(line)) failures.push(`private-browsing: ${API}:${i + 1} calls ${name} without the window it checks (win)`);
            });
        }
    }
    return failures;
}

function selfTest() {
    const clean = readSources();
    const baseline = check(clean);
    if (baseline.length) {
        console.error(`${NAME} --self-test: FAIL -- the unmutated tree is already red:`);
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log('  control: the unmutated tree is green');
    const firstProduct = Object.keys(clean).find(f => f.startsWith('theia/extensions/chrome-bar/src/'));
    const actionId = EXTENSION_FIXTURES.action.manifest.browser_specific_settings.gecko.id;
    const drifted = structuredClone(EXTENSION_FIXTURES);
    drifted.popup.manifest.browser_specific_settings.gecko.id = actionId;
    const apiWith = extra => ({ ...clean, [API]: `${clean[API]}\n${extra}\n` });
    const plants = [
        { name: 'drifted fixture id', run: () => check(clean, drifted), expect: `install under the same id ${actionId}` },
        { name: `${STOCK_TRIGGER}shell)`, run: () => check(apiWith(`browserActionFor(extension).${STOCK_TRIGGER}shell);`)), expect: "calls the stock delegate's" },
        { name: 'planted messagemanagergroup', run: () => check(apiWith('frame.setAttribute("messagemanagergroup", "browsers");')), expect: 'names messagemanagergroup outside the 31.1 host sites' },
        { name: 'unclassified kind', run: () => check({ ...clean, [API]: clean[API].replace('const STORE_REQUEST_KINDS = new Set([', 'const STORE_REQUEST_KINDS = new Set([\n  "extensionPlanted",') }), expect: 'the store kind extensionPlanted has no STORE_KIND_CLASSES entry' },
        { name: 'click path re-targeted', run: () => check({ ...clean, [API]: clean[API].replace('triggerClickOrPopup(selectedTab)', 'triggerClickOrPopup(host.selected)') }), expect: 'spelled triggerClickOrPopup(selectedTab)' },
        { name: 'activate ahead of ack', run: () => check({ ...clean, [API]: clean[API].replace('      pending.activateOnAck = true;\n', '      pending.activateOnAck = true;\n      selectNode(host, tab);\n') }), expect: 'tabsBridgeActivate moves the host selection ahead of the frontend' },
        { name: 'deferred activation never shown', run: () => check({ ...clean, [API]: clean[API].replace('        webTabs.get(tabId).activateOnAttach = false;\n        sendWebTabPush(theiaBrowser, { kind: "selectTab", tabId });\n', '        webTabs.get(tabId).activateOnAttach = false;\n') }), expect: "already-open branch does not show a deferred activation" },
        { name: 'signal unheard', run: () => check({ ...clean, [PATCH_050]: clean[PATCH_050].replace('new window.Event("TabHostActionUpdate")', 'new window.Event("TabHostPlanted")') }), expect: 'dispatches TabHostPlanted, which EXTENSION_TAB_EVENTS does not listen for' },
        { name: 'popup-dom', run: () => check({ ...clean, [EXTENSIONS_WIDGET]: `${clean[EXTENSIONS_WIDGET]}\nconst planted = <iframe src={popupUrl} />;\n` }), expect: `${EXTENSIONS_WIDGET}:` },
        { name: 'inlined svg icon', run: () => check({ ...clean, [EXTENSIONS_WIDGET]: `${clean[EXTENSIONS_WIDGET]}\nconst planted = <span dangerouslySetInnerHTML={{ __html: row.icon }} />;\n` }), expect: '(dangerouslySetInnerHTML)' },
        { name: 'anchor reporter gone', run: () => check(Object.fromEntries(Object.entries(clean).filter(([f]) => f !== EXTENSIONS_ANCHOR))), expect: `${EXTENSIONS_ANCHOR} is missing` },
        { name: 'pill-icon-local-match', run: () => check({ ...clean, [EXTENSIONS_WIDGET]: clean[EXTENSIONS_WIDGET].replace('.filter(row => row.pageActionShown)', ".filter(row => window.location.href.startsWith('http'))") }), expect: `${EXTENSIONS_WIDGET} renderPageActions decides visibility from the page` },
        { name: 'menus-bypass', run: () => check({ ...clean, 'theia/extensions/chrome-bar/src/browser/ide-extension-menus.ts': "this.channel.onPush('pageContextMenu', d => d.items.filter(i => String(i.id).startsWith('extension-entry-')).forEach(i => this.menus.registerMenuAction(MAIN_MENU_BAR, { commandId: i.id, label: i.label })));\n" }), expect: "ide-extension-menus.ts:1 takes the page menu's rows (extension-entry)" },
        { name: 'second on-build-contextmenu notify', run: () => check(apiWith('Services.obs.notifyObservers(subject, "on-build-contextmenu");')), expect: 'the rule is one site' },
        { name: 'sidebar skip reverted', run: () => check({ ...clean, [PATCH_050]: clean[PATCH_050].replace('+    if (windowTracker.isTabHostWindow(window) || !this.extension.canAccessWindow(window)) {', '+    if (!this.extension.canAccessWindow(window)) {') }), expect: 'createMenuItem(window, details) no longer skips the shell window' },
        { name: 'sidebar-as-tab', run: () => check({ ...clean, [API]: clean[API].replace('  win.document.body.appendChild(frame);\n  extensionSidebars.set(', '  createPendingOverlay(null, panel, true, null);\n  extensionSidebars.set(') }), expect: 'extensionSidebarOpen puts the sidebar page in an overlay (createPendingOverlay(' },
        { name: 'tabpage-in-overlay', run: () => check({ ...clean, [API]: clean[API].replace('    return extensionOpenTabPage(url, options?.triggeringPrincipal);', '    return createPendingOverlay(options.openerBrowser, url, true, null);') }), expect: 'tabsBridgeCreate puts an extension page in an overlay (createPendingOverlay(' },
        { name: 'container dropped', run: () => check({ ...clean, [API]: clean[API].replace('  if (options?.userContextId) {\n', '  if (false) {\n') }), expect: 'tabsBridgeCreate does not refuse a container' },
        { name: 'foreign extension page', run: () => check({ ...clean, [API]: clean[API].replace('principal?.addonId !== policy.id', 'false') }), expect: "extensionOpenTabPage admits another extension's page" },
        { name: 'execute name drift', run: () => check({ ...clean, [API]: clean[API].replace(', "_execute_sidebar_action"];', '];') }), expect: 'missing _execute_sidebar_action' },
        { name: 'commands-always-fire', run: () => check({ ...clean, [API]: clean[API].replace('    extensionKeysFollowPageFocus(theiaBrowser.ownerDocument.defaultView, tabId !== null);', '   ') }), expect: 'pushPageFocus does not scope the extension keys' },
        { name: 'key collision', run: () => check(apiWith('const key = document.createXULElement("key"); key.id = "powerbrowser-page-key-newTab";')), expect: '(key collision)' },
        { name: 'hand-kept id literal', run: () => check({ ...clean, [firstProduct]: `${clean[firstProduct]}\nconst planted = '${actionId}';\n` }), expect: `${firstProduct} names the fixture id ${actionId}` },
    ];
    // Rule 14: one plant per guarded function, derived; each removes that function's canAccessWindow check.
    const cleanLines = clean[API].split('\n');
    for (const [name, fn] of privateBrowsingSinks(stripComments(clean[API]).split('\n'), clean[API]).guarded) {
        const planted = cleanLines.map((l, i) => (i > fn.start && i <= fn.end ? l.replaceAll('.canAccessWindow(', '.plantedAccess(') : l)).join('\n');
        plants.push({ name: `${name} unguarded`, run: () => check({ ...clean, [API]: planted }), expect: `private-browsing: ${name} reaches` });
    }
    plants.push({ name: 'sidebar set read without the window', run: () => check({ ...clean, [API]: clean[API].replace('const sidebars = extensionSidebarsById(win);', 'const sidebars = extensionSidebarsById();') }), expect: 'calls extensionSidebarsById without the window it checks' });
    let failed = 0;
    for (const plant of plants) {
        const red = plant.run();
        const hit = red.find(f => f.includes(plant.expect));
        if (hit) {
            console.log(`  ok  plant ${plant.name} -> red: ${hit}`);
        } else {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- plant ${plant.name} did not go red naming '${plant.expect}': ${JSON.stringify(red)}`);
        }
    }
    if (failed) return 1;
    console.log(`${NAME} --self-test: PASS -- ${plants.length} plants (${plants.map(p => p.name).join('; ')}) each went red naming the drift`);
    return 0;
}

function main() {
    if (process.argv.includes('--self-test')) process.exit(selfTest());
    const src = readSources();
    const failures = check(src);
    if (failures.length) {
        failures.forEach(f => console.error(`FAIL -- ${f}`));
        console.error(`${NAME}: FAIL (${failures.length})`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- ${Object.keys(src).length} sources read; ${Object.keys(EXTENSION_FIXTURES).length} fixtures derived; no product source names a fixture id or the stock trigger; messagemanagergroup only at the 31.1 host sites; every extension kind classified${BRIDGE_LANDED ? '; one triggerClickOrPopup(selectedTab); every patch 050 signal heard; the extension widget draws no extension content in Theia DOM; the pill icon shows only pushed page actions; extension menu entries reach the menu only through the one on-build-contextmenu site (pageMenuExtensionEntries, from openPageMenu on the stub popupshowing) and only ' + PAGE_MENU + ' consumes the page menu rows; the sidebar stays off in the shell window and loads only in the stock panel document; extension tab pages go to the stock window, never an overlay; extension shortcuts follow page focus and _execute_* runs on the bridge; every private-browsing sink checks canAccessWindow' : ' (click-path presence pending the bridge)'}`);
}

main();
