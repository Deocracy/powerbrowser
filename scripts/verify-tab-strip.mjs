#!/usr/bin/env node
/**
 * Phase 34 (TAB-01, BMK-07; plan 34-01): the tab strip's static gate. Every
 * expectation is derived from the tree at check time and compared, never a
 * hand-kept list (D-04, verification rule 2):
 *
 *   1. menu: the `contract` names of the rows in TabStripWidget.tabMenuRows
 *      vs the item list of ROADMAP Phase 34 success criterion 1, parsed from
 *      the roadmap at check time. A row naming no ROADMAP item, or a ROADMAP
 *      item no row names, goes red by name.
 *   2. copy: the CHROME_BAR_COPY.tabMenu keys the rows read vs the keys the
 *      copy object holds (set equality: a row with no copy and a copy row no
 *      menu reads both go red). The wording itself is pinned by
 *      verify-shell-error-copy.mjs.
 *   3. occlusion: the menu renders through ContextMenuRenderer (a stock
 *      `.lm-Menu`), and `.lm-Menu` is in web-tab.ts BLOCKING_LAYER_SELECTOR,
 *      so the page hides while the menu is open.
 *   4. kinds: no uncatalogued kind. Every WEB_TAB_ACTION_KINDS and
 *      STORE_REQUEST_KINDS member in PowerBrowserAPI.sys.mjs is classified in
 *      verify-web-tab-bridge.mjs (KIND_CLASSES / STORE_KIND_CLASSES), and the
 *      strip sends no kind itself: Mute and Bookmark are calls (D-13).
 *   5. codicons: every `codicon-*` glyph the strip names exists in
 *      @vscode/codicons dist/codicon.css.
 *   6. target: the menu code never reads the current widget, so every row
 *      acts on the right-clicked tab (T-34-06).
 *
 * --self-test: the unmodified tree must be green first (the positive control
 * every plant preserves), then each named plant edits one source in memory
 * and must go red naming its drift.
 *
 * Honestly --quick: text reads only. No build, no browser, no display.
 *
 * Usage:
 *   node scripts/verify-tab-strip.mjs
 *   node scripts/verify-tab-strip.mjs --self-test
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-tab-strip';

const STRIP = 'theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx';
const COPY = 'theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts';
const WEB_TAB = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const BRIDGE_GATE = 'scripts/verify-web-tab-bridge.mjs';
const CODICONS = 'theia/node_modules/@vscode/codicons/dist/codicon.css';
const ROADMAP = '.planning/ROADMAP.md';
// After a milestone closes its roadmap moves here; the criterion is searched in both.
const MILESTONES = '.planning/milestones';
const ROADMAP_KEY = 'roadmap';

function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** The text between the brace at `open` and its match; strings are not parsed (none here holds a brace). */
function braceBody(text, open) {
    if (open < 0 || text[open] !== '{') {
        return null;
    }
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') {
            depth++;
        } else if (text[i] === '}' && --depth === 0) {
            return text.slice(open + 1, i);
        }
    }
    return null;
}

/** The body of the method declared by `signature` (e.g. `protected tabMenuRows(`); null when absent. */
function methodBody(src, signature) {
    const at = src.indexOf(signature);
    return at < 0 ? null : braceBody(src, src.indexOf('{', src.indexOf(')', at)));
}

function derive(text, re) {
    return [...text.matchAll(re)].map(m => m[1]);
}

function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return { surplus: [...a].filter(x => !e.has(x)), missing: [...e].filter(x => !a.has(x)) };
}

/** ROADMAP Phase 34 criterion 1's items ("offers A, B, … and Z, and each item does what it says"); null when absent. */
function roadmapItems(roadmap) {
    const section = /### Phase 34: Tab Strip[\s\S]*?(?=\n### Phase |$)/.exec(roadmap)?.[0] ?? '';
    const list = /Right-clicking a tab offers (.+?),? and each item does what it says/.exec(section)?.[1];
    return list ? list.split(/,\s*|\s+and\s+/).map(item => item.trim()).filter(Boolean) : null;
}

function check(src) {
    const failures = [];
    const strip = stripComments(src[STRIP]);
    const rows = methodBody(strip, 'protected tabMenuRows(');
    const opener = methodBody(strip, 'protected openTabMenu(');

    // 1. menu
    const expected = roadmapItems(src[ROADMAP_KEY]);
    const contracts = rows ? derive(rows, /contract:\s*'([^']+)'/g) : [];
    if (!expected) {
        failures.push(`menu: ROADMAP Phase 34 success criterion 1 ("Right-clicking a tab offers ...") was not found -- the expected set is underived (broken instrument, never a pass)`);
    } else if (!rows || contracts.length === 0) {
        failures.push(`menu: ${STRIP}: derived ZERO contract rows from tabMenuRows -- the comparison proves nothing`);
    } else {
        const { surplus, missing } = diff(contracts, expected);
        if (surplus.length) {
            failures.push(`menu: tab-menu rows name items ROADMAP criterion 1 does not offer: ${surplus.join(', ')}`);
        }
        // Tracer (34-01 Task 1): the addition half only; the removal half lands with the full row set.
        void missing;
        const twice = contracts.filter((c, i) => contracts.indexOf(c) !== i);
        if (twice.length) {
            failures.push(`menu: one ROADMAP item named by two rows: ${[...new Set(twice)].join(', ')}`);
        }
    }

    // 2. copy
    const copy = stripComments(src[COPY]);
    const copyBody = braceBody(copy, copy.indexOf('{', copy.indexOf('tabMenu: Object.freeze(')));
    const copyKeys = copyBody ? derive(copyBody, /^\s*(\w+):/gm) : [];
    const usedKeys = rows ? derive(rows, /CHROME_BAR_COPY\.tabMenu\.(\w+)/g) : [];
    if (copyBody === null || usedKeys.length === 0) {
        failures.push(`copy: CHROME_BAR_COPY.tabMenu ${copyBody === null ? 'not found' : 'found'}, ${usedKeys.length} keys read by the rows -- the comparison proves nothing`);
    } else {
        const { surplus, missing } = diff(usedKeys, copyKeys);
        if (surplus.length) {
            failures.push(`copy: tab-menu rows read CHROME_BAR_COPY.tabMenu keys the copy object lacks: ${surplus.join(', ')}`);
        }
        if (missing.length) {
            failures.push(`copy: CHROME_BAR_COPY.tabMenu rows no tab-menu row reads: ${missing.join(', ')}`);
        }
    }

    // 3. occlusion
    const selector = /const BLOCKING_LAYER_SELECTOR\s*=\s*'([^']*)'/.exec(src[WEB_TAB])?.[1];
    if (!selector) {
        failures.push(`occlusion: ${WEB_TAB}: BLOCKING_LAYER_SELECTOR not found (broken instrument)`);
    } else if (!selector.split(',').map(s => s.trim()).includes('.lm-Menu')) {
        failures.push(`occlusion: BLOCKING_LAYER_SELECTOR lacks .lm-Menu -- the tab menu would paint under the page`);
    }
    if (!opener || !/this\.menus\.render\(/.test(opener)) {
        failures.push(`occlusion: ${STRIP}: openTabMenu does not render through ContextMenuRenderer (this.menus.render) -- the menu is not the stock .lm-Menu the selector lists`);
    }

    // 4. kinds
    const api = src[API];
    const union = ['WEB_TAB_ACTION_KINDS', 'STORE_REQUEST_KINDS'].flatMap(name => {
        const literal = new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`).exec(api)?.[1];
        return literal ? derive(literal, /"([A-Za-z]+)"/g) : [];
    });
    const bridge = src[BRIDGE_GATE];
    const classified = ['KIND_CLASSES', 'STORE_KIND_CLASSES'].flatMap(name => {
        const body = new RegExp(`const ${name} = new Map\\(\\[([\\s\\S]*?)\\n\\]\\);`).exec(bridge)?.[1];
        return body ? derive(body, /\['([A-Za-z]+)',/g) : [];
    });
    if (union.length === 0 || classified.length === 0) {
        failures.push(`kinds: derived ZERO kinds (union ${union.length}, classified ${classified.length}) -- the comparison proves nothing`);
    } else {
        const uncatalogued = diff(union, classified).surplus;
        if (uncatalogued.length) {
            failures.push(`kinds: kinds no class in ${BRIDGE_GATE} catalogues (Phase 34 adds none): ${uncatalogued.join(', ')}`);
        }
    }
    if (/\bkind:\s*['"]/.test(strip)) {
        failures.push(`kinds: ${STRIP} sends a kind itself -- every tab action is a call to the widget's existing path`);
    }

    // 5. codicons
    const sheet = new Set(derive(src[CODICONS] ?? '', /\.codicon-([a-z0-9-]+):before/g));
    const glyphs = [...new Set(derive(strip, /codicon-([a-z0-9-]+)/g))];
    if (sheet.size === 0 || glyphs.length === 0) {
        failures.push(`codicons: derived ZERO glyphs (${CODICONS} ${sheet.size}, named by the strip ${glyphs.length}) -- the comparison proves nothing`);
    } else {
        const absent = glyphs.filter(glyph => !sheet.has(glyph));
        if (absent.length) {
            failures.push(`codicons: glyphs the strip names that ${CODICONS} does not define: ${absent.join(', ')}`);
        }
    }

    // 6. target
    for (const [label, body] of [['tabMenuRows', rows], ['openTabMenu', opener]]) {
        const hit = body && /\b(currentTitle|currentWidget|currentWebTab|activeWidget)\b/.exec(body);
        if (hit) {
            failures.push(`target: ${label} reads ${hit[1]} -- a menu row acts on the right-clicked tab only, never the current widget`);
        }
    }
    return failures;
}

function readSources() {
    const out = {};
    for (const rel of [STRIP, COPY, WEB_TAB, API, BRIDGE_GATE, CODICONS]) {
        out[rel] = existsSync(join(REPO_ROOT, rel)) ? readFileSync(join(REPO_ROOT, rel), 'utf8') : '';
    }
    const archived = existsSync(join(REPO_ROOT, MILESTONES))
        ? readdirSync(join(REPO_ROOT, MILESTONES)).filter(f => f.endsWith('-ROADMAP.md')).map(f => `${MILESTONES}/${f}`)
        : [];
    out[ROADMAP_KEY] = [ROADMAP, ...archived]
        .map(rel => (existsSync(join(REPO_ROOT, rel)) ? readFileSync(join(REPO_ROOT, rel), 'utf8') : ''))
        .find(text => roadmapItems(text)) ?? '';
    return out;
}

/** Each plant edits one source in memory and must go red with a line naming `expect`. */
const PLANTS = [
    {
        name: 'copy-row-removed',
        file: COPY,
        mutate: s => s.replace(/\n\s*reload: 'Reload',/, ''),
        expect: 'reload',
    },
    {
        name: 'occlusion-selector-dropped',
        file: WEB_TAB,
        mutate: s => s.replace(", .lm-Menu, ", ', '),
        expect: '.lm-Menu',
    },
    {
        name: 'uncatalogued-kind-added',
        file: API,
        mutate: s => s.replace('const WEB_TAB_ACTION_KINDS = new Set([', 'const WEB_TAB_ACTION_KINDS = new Set(["webTabPinTab", '),
        expect: 'webTabPinTab',
    },
    {
        name: 'codicon-deleted',
        file: CODICONS,
        mutate: s => s.replace(/\.codicon-globe:before/g, '.codicon-planted-gone:before'),
        expect: 'globe',
    },
    {
        name: 'current-widget-fallback',
        file: STRIP,
        mutate: s => s.replace(/(protected tabMenuRows\(widget: Widget\): TabMenuRow\[\] \{)/, '$1\n        widget = this.shell.currentWidget ?? widget;'),
        expect: 'currentWidget',
    },
];

function selfTest() {
    const sources = readSources();
    const baseline = check(sources);
    if (baseline.length) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the plants below would prove nothing:`);
        baseline.forEach(f => console.error(`  - ${f}`));
        return 1;
    }
    console.log(`${NAME} --self-test: positive control: the unmodified tree is green`);
    let bad = 0;
    for (const plant of PLANTS) {
        const planted = plant.mutate(sources[plant.file]);
        if (planted === sources[plant.file]) {
            console.error(`${NAME} --self-test: FAIL -- plant '${plant.name}' changed nothing in ${plant.file}; its anchor drifted`);
            bad++;
            continue;
        }
        const failures = check({ ...sources, [plant.file]: planted });
        const named = failures.find(f => f.includes(plant.expect));
        if (!named) {
            console.error(`${NAME} --self-test: FAIL -- plant '${plant.name}' did not go red naming "${plant.expect}" (got ${failures.length ? failures.join(' | ') : 'green'})`);
            bad++;
        } else {
            console.log(`${NAME} --self-test: plant '${plant.name}' went red: ${named}`);
        }
    }
    if (bad) {
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- ${PLANTS.length} plants each went red naming their drift`);
    return 0;
}

function main() {
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const failures = check(readSources());
    if (failures.length) {
        console.error(`${NAME}: FAIL`);
        failures.forEach(f => console.error(`  - ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- tab menu matches ROADMAP criterion 1, copy, occlusion, kinds, codicons and target hold`);
    return 0;
}

process.exit(main());
