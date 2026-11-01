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
 *                    getTabForBrowser of its own).
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
const PRODUCT_DIRS = ['powerbrowser', 'theia/extensions'];
const SECTION_MARK = '// Phase 38 (EXT-06, EXT-07): the extension bridge.';
const CHROME_BAR_SRC = 'theia/extensions/chrome-bar/src/';
const EXTENSIONS_DIR = `${CHROME_BAR_SRC}browser/extensions/`;
const EXTENSIONS_WIDGET = `${EXTENSIONS_DIR}extension-actions-widget.tsx`;
const EXTENSIONS_ANCHOR = `${EXTENSIONS_DIR}extension-popup-anchor.ts`;
const WEB_TAB = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
// Rule 9: what computing a page action's visibility Theia-side would read (the page's address or the extension's patterns).
const PAGE_MATCH = /url|uri\b|href|location|match/i;
// D-02: what drawing extension content in Theia DOM looks like; the first two would host a popup page, the last names one.
const THEIA_DOM_POPUP = [['<iframe', 'an <iframe'], ['dangerouslySetInnerHTML', 'dangerouslySetInnerHTML'], [['moz', 'extension:'].join('-'), 'an extension-scheme URL']];
// The stock delegate's call, assembled so this file's own text never matches rule 3's scan of the tree.
const STOCK_TRIGGER = ['trigger', 'Action('].join('');
const FIXTURE_NAMESPACE = /@powerbrowser\.test$/;

// D-11, the one hand-kept table: the classes a ruling fixed, not a derivation.
const REQUIRED_STORE_CLASS = new Map([
    ['extensionClick', 'privileged'],
    ['extensionPin', 'privileged'],
    ['extensionRemove', 'privileged'],
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
        { name: 'signal unheard', run: () => check({ ...clean, [PATCH_050]: clean[PATCH_050].replace('new window.Event("TabHostActionUpdate")', 'new window.Event("TabHostPlanted")') }), expect: 'dispatches TabHostPlanted, which EXTENSION_TAB_EVENTS does not listen for' },
        { name: 'popup-dom', run: () => check({ ...clean, [EXTENSIONS_WIDGET]: `${clean[EXTENSIONS_WIDGET]}\nconst planted = <iframe src={popupUrl} />;\n` }), expect: `${EXTENSIONS_WIDGET}:` },
        { name: 'inlined svg icon', run: () => check({ ...clean, [EXTENSIONS_WIDGET]: `${clean[EXTENSIONS_WIDGET]}\nconst planted = <span dangerouslySetInnerHTML={{ __html: row.icon }} />;\n` }), expect: '(dangerouslySetInnerHTML)' },
        { name: 'anchor reporter gone', run: () => check(Object.fromEntries(Object.entries(clean).filter(([f]) => f !== EXTENSIONS_ANCHOR))), expect: `${EXTENSIONS_ANCHOR} is missing` },
        { name: 'pill-icon-local-match', run: () => check({ ...clean, [EXTENSIONS_WIDGET]: clean[EXTENSIONS_WIDGET].replace('.filter(row => row.pageActionShown)', ".filter(row => window.location.href.startsWith('http'))") }), expect: `${EXTENSIONS_WIDGET} renderPageActions decides visibility from the page` },
        { name: 'hand-kept id literal', run: () => check({ ...clean, [firstProduct]: `${clean[firstProduct]}\nconst planted = '${actionId}';\n` }), expect: `${firstProduct} names the fixture id ${actionId}` },
    ];
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
    console.log(`${NAME}: PASS -- ${Object.keys(src).length} sources read; ${Object.keys(EXTENSION_FIXTURES).length} fixtures derived; no product source names a fixture id or the stock trigger; messagemanagergroup only at the 31.1 host sites; every extension kind classified${BRIDGE_LANDED ? '; one triggerClickOrPopup(selectedTab); every patch 050 signal heard; the extension widget draws no extension content in Theia DOM; the pill icon shows only pushed page actions' : ' (click-path presence pending the bridge)'}`);
}

main();
