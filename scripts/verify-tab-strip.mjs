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
 *   3. occlusion: the tab menu and the List All Tabs menu both render
 *      through showMenu, which renders through ContextMenuRenderer (a stock
 *      `.lm-Menu`), and `.lm-Menu` is in web-tab.ts BLOCKING_LAYER_SELECTOR,
 *      so the page hides while either menu is open.
 *   4. kinds: no uncatalogued kind. Both kind-union literals in
 *      PowerBrowserAPI.sys.mjs (WEB_TAB_ACTION_KINDS, STORE_REQUEST_KINDS) are
 *      derived at check time and every member must be classified in
 *      verify-web-tab-bridge.mjs (KIND_CLASSES / STORE_KIND_CLASSES); the
 *      strip sends no kind itself: Mute and Bookmark are calls (D-13), and
 *      reorder, drop and List All Tabs are frontend-only (34-02).
 *   5. codicons: every `codicon-*` glyph the strip names exists in
 *      @vscode/codicons dist/codicon.css.
 *   6. target: the menu code never reads the current widget, so every row
 *      acts on the right-clicked tab (T-34-06).
 *   7. overflow (34-02, TAB-04): measureOverflow derives the overflow as
 *      scrollWidth > clientWidth and is the only writer of `overflowing`, and
 *      render shows the List All Tabs chevron only under `this.overflowing`.
 *   8. keys (34-03, D-08/D-09, C-01): every pinnedIds / selectedIds key and
 *      the Shift anchor, derived from every add/has/delete call and Set build
 *      in the strip, is `this.tabKey(...)`, and tabKey is GroupModel.keyOf;
 *      no `web:` key shape is assumed anywhere in the strip.
 *   9. delegation (34-03, C-03): every bulk arm in bulkMenuRows is exactly
 *      `this.runOnEach(<tabs>, '<id>')` naming a single-tab row in
 *      tabMenuRows that runs through its tab command, or through the one
 *      bookmarkTabs callback; runOnEach reaches rows only through runTabRow.
 *  10. pin store (34-03, T-34-05, W1): savePins builds the stored list from
 *      the open tabs filtered by pinnedIds (bounded by open tabs) and is the
 *      only writer; restorePins re-pins a tab only when its own key equals
 *      the stored key.
 *  11. preview occlusion and anchor (34-04, TAB-07, D-11): BLOCKING_LAYER_SELECTOR's
 *      members, derived from web-tab.ts at check time, hold both the tab
 *      menu's `.lm-Menu` and the strip's preview card class, which is derived
 *      from renderPreview's root; openPreview anchors the card at the hovered
 *      tab's own rect bottom plus 4px, and neither schedulePreview nor
 *      openPreview opens for a tab on screen.
 *  12. preview source (D-10, T-34-04): the preview methods make no capture,
 *      screenshot or chrome request; the image is the GroupModel cards'
 *      thumbnail, never a TabPlacesRow.
 *  13. push field (D-12, W3): the keys of webTabPush's state literal, derived
 *      from PowerBrowserAPI.sys.mjs at check time, include titleChanged,
 *      valued by chrome's own webTabTitleChanged (which reads no message
 *      field); no other literal in the boundary file carries titleChanged, so
 *      a new kind carrying the flag goes red naming that kind; the
 *      webTabActivated arm pushes the activated tab, which clears it.
 *  14. no frame write (T-34-07): every frame-side source (the Theia
 *      extensions' src trees, tests excluded, and GroupActorChild.sys.mjs) is
 *      scanned for a write to titleChanged; the only writes allowed are
 *      web-tab.ts reading the push (detail.titleChanged === true) and
 *      applyState copying it, plus its two declarations.
 *  15. registry (34-05): the rows of verify-platform.sh's quick block and its
 *      live block, derived at check time. Each gate script has exactly two
 *      rows, its gate and then its --self-test, adjacent and in that order,
 *      labelled from the script's file name: verify-tab-strip.mjs in the
 *      quick block, verify-tab-strip-live.mjs in the live block. A row
 *      running either script anywhere else, or any other tracked shell
 *      script or workflow running either one (a sibling driver), goes red.
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
const FRAME_KEY = 'frame-sources';
const FRAME_DIR = 'theia/extensions';
const FRAME_CHILD = 'powerbrowser/shell/GroupActorChild.sys.mjs';
const REGISTRY = 'scripts/verify-platform.sh';
// Every other shell script and workflow, as { rel, text }: none may run a tab-strip gate.
const DRIVERS_KEY = 'drivers';
// Each gate script and the registry block its two rows live in.
const GATE_HOMES = [['verify-tab-strip.mjs', 'quick'], ['verify-tab-strip-live.mjs', 'live']];
// The four titleChanged writes the frame may hold, all in web-tab.ts: the WebTabState and widget declarations, the
// read of chrome's push, and applyState's copy of it. Anything else writing the flag is a frame-minted mark.
const FRAME_WRITES_ALLOWED = new Set([
    `${WEB_TAB}|titleChanged: boolean;`,
    `${WEB_TAB}|titleChanged = false;`,
    `${WEB_TAB}|titleChanged: detail.titleChanged === true,`,
    `${WEB_TAB}|this.titleChanged = state.titleChanged;`,
]);

function stripComments(text) {
    // Block comments keep their newlines, so a line number read off the stripped text is the file's.
    return text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, '')).replace(/(^|[^:])\/\/.*$/gm, '$1');
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
    const bulk = methodBody(strip, 'protected bulkMenuRows(');
    const opener = methodBody(strip, 'protected openTabMenu(');
    const lister = methodBody(strip, 'protected openListAllMenu(');
    const shower = methodBody(strip, 'protected showMenu(');

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
        if (missing.length) {
            failures.push(`menu: ROADMAP criterion 1 items no tab-menu row offers: ${missing.join(', ')}`);
        }
    }

    // 2. copy
    const copy = stripComments(src[COPY]);
    const copyBody = braceBody(copy, copy.indexOf('{', copy.indexOf('tabMenu: Object.freeze(')));
    const copyKeys = copyBody ? derive(copyBody, /^\s*(\w+):/gm) : [];
    // The rows (single-tab, and 34-03's bulk rows) read CHROME_BAR_COPY.tabMenu directly or through one local alias of it.
    const readKeys = body => {
        const alias = body ? /const (\w+) = CHROME_BAR_COPY\.tabMenu;/.exec(body)?.[1] : undefined;
        return body ? derive(body, new RegExp(`(?:CHROME_BAR_COPY\\.tabMenu${alias ? `|\\b${alias}` : ''})\\.(\\w+)`, 'g')) : [];
    };
    const usedKeys = [...readKeys(rows), ...readKeys(bulk)];
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
    if (!shower || !/this\.menus\.render\(/.test(shower)) {
        failures.push(`occlusion: ${STRIP}: showMenu does not render through ContextMenuRenderer (this.menus.render) -- the strip's menus are not the stock .lm-Menu the selector lists`);
    }
    for (const [label, body] of [['openTabMenu', opener], ['openListAllMenu', lister]]) {
        if (!body || !/this\.showMenu\(/.test(body)) {
            failures.push(`occlusion: ${STRIP}: ${label} does not render through showMenu -- that menu is not the stock .lm-Menu the selector lists`);
        }
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
    for (const [label, body] of [['tabMenuRows', rows], ['openTabMenu', opener], ['bulkMenuRows', bulk]]) {
        const hit = body && /\b(currentTitle|currentWidget|currentWebTab|activeWidget)\b/.exec(body);
        if (hit) {
            failures.push(`target: ${label} reads ${hit[1]} -- a menu row acts on the right-clicked tab only, never the current widget`);
        }
    }

    // 7. overflow
    const measure = methodBody(strip, 'protected measureOverflow(');
    const render = methodBody(strip, 'protected render(');
    if (!measure || !/(\w+)\.scrollWidth\s*>\s*\1\.clientWidth/.test(measure)) {
        failures.push(`overflow: ${STRIP}: measureOverflow does not derive the overflow as scrollWidth > clientWidth -- the chevron has no overflow predicate`);
    }
    const writes = text => (text ?? '').match(/this\.overflowing\s*=[^=]/g)?.length ?? 0;
    if (writes(strip) !== writes(measure)) {
        failures.push(`overflow: ${STRIP}: \`overflowing\` is written outside measureOverflow (${writes(strip)} writes, ${writes(measure)} in measureOverflow) -- the chevron can show without overflow`);
    }
    if (!render || !/\{this\.overflowing && <button\s+className='pb-tab-strip-chevron\b/.test(render)) {
        failures.push(`overflow: ${STRIP}: render does not show the List All Tabs chevron (pb-tab-strip-chevron) only under this.overflowing -- the chevron can show without overflow`);
    }

    // 8. keys
    const tabKey = methodBody(strip, 'protected tabKey(');
    if (!tabKey || !/^\s*return this\.groups\.keyOf\(widget\);\s*$/.test(tabKey)) {
        failures.push(`keys: ${STRIP}: tabKey is not \`return this.groups.keyOf(widget);\` -- strip state is not keyed by GroupModel.keyOf`);
    }
    // Each call's argument up to its balanced close paren (a lazy match would stop inside this.tabKey(...)).
    const keyUses = [...strip.matchAll(/this\.(pinnedIds|selectedIds)\.(add|has|delete)\(/g)].map(m => {
        let depth = 1;
        let i = m.index + m[0].length;
        for (; i < strip.length && depth; i++) {
            depth += strip[i] === '(' ? 1 : strip[i] === ')' ? -1 : 0;
        }
        return [m[0], m[1], m[2], strip.slice(m.index + m[0].length, i - 1)];
    });
    const builds = [...strip.matchAll(/this\.(selectedIds|pinnedIds|anchorKey)\s*=\s*([^;]+);/g)];
    if (keyUses.length === 0) {
        failures.push(`keys: ${STRIP}: derived ZERO pinnedIds/selectedIds key uses -- the comparison proves nothing`);
    }
    for (const [, set, verb, arg] of keyUses) {
        if (!/^this\.tabKey\(\w+\)$/.test(arg.trim())) {
            failures.push(`keys: ${set}.${verb}(${arg.trim()}) is not keyed by this.tabKey(...) (GroupModel.keyOf) -- a tab id or URL key breaks duplicates and restarts`);
        }
    }
    for (const [, field, value] of builds) {
        const v = value.trim();
        const ok = field === 'anchorKey'
            ? /^(undefined|this\.tabKey\(\w+\)|\w+\[\w+\] \? this\.tabKey\(\w+\[\w+\]\) : undefined)$/.test(v)
            : /^new Set\((\w+)\.map\((\w+) => this\.tabKey\(\2\)\)\)$/.test(v) || /^new Set(<string>)?\(\)$/.test(v);
        if (!ok) {
            failures.push(`keys: this.${field} = ${v} is not built from this.tabKey(...) (GroupModel.keyOf)`);
        }
    }
    if (/['"`]web:/.test(strip)) {
        failures.push(`keys: ${STRIP} spells a web: key shape -- pin and selection assume no key format (NG-001: keyOf only)`);
    }

    // 9. delegation
    const bulkBody = bulk ?? '';
    const singleIds = rows ? derive(rows, /\bid: '([\w-]+)'/g) : [];
    const arms = [...bulkBody.matchAll(/\bid: '([\w-]+)'[\s\S]*?\brun: (.+?),?\n/g)];
    if (!bulk || arms.length === 0) {
        failures.push(`delegation: ${STRIP}: derived ZERO bulk arms from bulkMenuRows -- the comparison proves nothing`);
    }
    const rowBody = id => {
        const at = rows ? rows.indexOf(`id: '${id}'`) : -1;
        return at < 0 ? '' : rows.slice(at, rows.indexOf('\n            },', at));
    };
    for (const [, arm, run] of arms) {
        const call = /^\(\) => this\.runOnEach\((\w+), '([\w-]+)'\)$/.exec(run.trim());
        if (!call) {
            failures.push(`delegation: bulk arm ${arm} runs \`${run.trim()}\`, not this.runOnEach(<tabs>, '<single-tab row>') -- a second path beside the single-tab one`);
            continue;
        }
        const single = call[2];
        const body = rowBody(single);
        if (!singleIds.includes(single)) {
            failures.push(`delegation: bulk arm ${arm} names '${single}', which no single-tab row in tabMenuRows has`);
        } else if (!/command: CHROME_BAR_TAB_\w+_COMMAND_ID/.test(body) && !/run: \(\) => bookmark!\(\[page!\]\)/.test(body)) {
            failures.push(`delegation: bulk arm ${arm} reaches row '${single}', which runs through neither a tab command nor the one bookmarkTabs callback`);
        }
    }
    const direct = /\b(closeWidget|closeTabs|setMuted|moveInBar|reorderTo|bookmarkTabs|bookmarkPage|executeCommand)\b|\bbookmark!/.exec(bulkBody);
    if (direct) {
        const arm = arms.find(m => m[0].includes(direct[0]))?.[1] ?? 'bulkMenuRows';
        failures.push(`delegation: ${arm} calls ${direct[0]} directly -- every bulk action goes through runOnEach to the single-tab row`);
    }
    const onEach = methodBody(strip, 'protected async runOnEach(') ?? '';
    const runTab = methodBody(strip, 'protected async runTabRow(') ?? '';
    if (!/this\.runTabRow\(row, tab\)/.test(onEach) || /\b(closeWidget|setMuted|moveInBar|executeCommand)\b/.test(onEach)) {
        failures.push(`delegation: ${STRIP}: runOnEach does not run each tab's row through runTabRow alone`);
    }
    if (!/this\.commands\.executeCommand\(row\.command, widget\)/.test(runTab) || !/this\.runRow\(row\)/.test(runTab)) {
        failures.push(`delegation: ${STRIP}: runTabRow does not run the row's command (or the row itself when it has none)`);
    }

    // 10. pin store
    const save = methodBody(strip, 'protected async savePins(') ?? '';
    const restore = methodBody(strip, 'protected async restorePins(') ?? '';
    if (!/this\.openTabs\(\)\.filter\((\w+) => this\.pinnedIds\.has\(this\.tabKey\(\1\)\)\)/.test(save)
        || /\[\.\.\.this\.pinnedIds\]|Array\.from\(this\.pinnedIds\)|this\.pinnedIds\.(forEach|values|keys|entries)\b/.test(save)) {
        failures.push(`pin store: savePins does not build the stored list from the open tabs filtered by pinnedIds -- the store is not bounded by open tabs (T-34-05)`);
    }
    if ((strip.match(/\.writePinnedIds\(/g) ?? []).length !== 1 || !/\.writePinnedIds\(/.test(save)) {
        failures.push(`pin store: writePinnedIds is called outside savePins (or not at all) -- savePins is the one bounded writer`);
    }
    // The guard on the re-pin itself, not the lookup above it: the reopened tab's own key must be the stored one.
    if (!/if \((\w+) && this\.tabKey\(\1\) === entry\.key[^{]*\{\s*this\.pinnedIds\.add\(this\.tabKey\(\1\)\)/.test(restore)) {
        failures.push(`pin store: restorePins does not require the reopened tab's own key to equal entry.key -- a stale key could re-pin another tab (W1)`);
    }

    // 11. preview occlusion and anchor
    const members = selector ? selector.split(',').map(member => member.trim()) : [];
    const renderPreview = methodBody(strip, 'protected renderPreview(');
    const cardClass = renderPreview ? /return <div className='([\w-]+)'/.exec(renderPreview)?.[1] : undefined;
    if (!cardClass) {
        failures.push(`occlusion: ${STRIP}: renderPreview's root class not derived (broken instrument, never a pass)`);
    } else if (!members.includes(`.${cardClass}`)) {
        failures.push(`occlusion: BLOCKING_LAYER_SELECTOR lacks .${cardClass} -- the preview card would open with the page painted over it (D-11)`);
    }
    const schedule = methodBody(strip, 'protected schedulePreview(') ?? '';
    const openCard = methodBody(strip, 'protected openPreview(') ?? '';
    const box = /const (\w+) = node\.getBoundingClientRect\(\);/.exec(openCard)?.[1];
    if (!box || !new RegExp(`top: ${box}\\.bottom \\+ 4[,}\\s]`).test(openCard)) {
        failures.push(`anchor: ${STRIP}: openPreview does not place the card at the hovered tab's bottom plus 4px -- the card is not anchored below the tab`);
    }
    if (!/if \(widget\.isVisible\)/.test(schedule) || !/widget\.isVisible\)/.test(openCard)) {
        failures.push(`active: ${STRIP}: schedulePreview/openPreview do not refuse a tab on screen -- a card could hide the active tab's visible page`);
    }

    // 12. preview source
    const previewBodies = ['previewImage', 'schedulePreview', 'openPreview', 'closePreview', 'renderPreview']
        .map(name => [name, methodBody(strip, `protected ${name}(`)]);
    for (const [name, body] of previewBodies) {
        if (body === null) {
            failures.push(`capture: ${STRIP}: ${name} not found (broken instrument, never a pass)`);
        } else if (/captur|screenshot|drawSnapshot|drawWindow|toDataURL|getContext\(|this\.channel\b|\.request\(|\bkind:/i.test(body)) {
            failures.push(`capture: ${STRIP}: ${name} captures or asks chrome for an image -- the preview reads the settled GUI-08 thumbnail only (D-10)`);
        }
    }
    const imageBody = previewBodies[0][1] ?? '';
    if (!/this\.groups\.listUngrouped\(\)/.test(imageBody) || !/\.thumbnail\b/.test(imageBody) || /TabPlacesRow|queryTabsWithPlaces/.test(imageBody)) {
        failures.push(`capture: ${STRIP}: previewImage does not read the GroupModel cards' thumbnail (TabPlacesRow carries none)`);
    }

    // 13. push field
    const apiCode = stripComments(api);
    const push = methodBody(apiCode, '  webTabPush(theiaBrowser');
    const stateAt = push ? push.indexOf('.sendAsyncMessage("PowerBrowserWebTabState", {') : -1;
    const stateLiteral = stateAt >= 0 ? braceBody(push, push.indexOf('{', stateAt)) : null;
    const pushKeys = stateLiteral ? derive(stateLiteral, /^\s*(\w+):/gm) : [];
    if (!pushKeys.includes('kind') || !/kind: "state"/.test(stateLiteral ?? '')) {
        failures.push(`push field: ${API}: webTabPush's state literal not derived (broken instrument, never a pass)`);
    } else if (!pushKeys.includes('titleChanged')) {
        failures.push(`push field: webTabPush's state literal lacks titleChanged -- the attention flag must ride the existing push (W3)`);
    } else if (!/titleChanged: webTabTitleChanged\(theiaBrowser, tabId, browser, loading\)/.test(stateLiteral)) {
        failures.push(`push field: webTabPush's titleChanged is not chrome's own webTabTitleChanged(theiaBrowser, tabId, browser, loading)`);
    }
    const minter = braceBody(apiCode, apiCode.indexOf('{', apiCode.indexOf('function webTabTitleChanged(')));
    if (minter === null || /\b(data|detail|msg|message)\./.test(minter)) {
        failures.push(`push field: ${API}: webTabTitleChanged is missing or reads a message field -- the flag is minted from chrome state only`);
    }
    const pushStart = push === null ? -1 : apiCode.indexOf(push);
    for (const m of apiCode.matchAll(/\btitleChanged\s*:/g)) {
        if (pushStart >= 0 && m.index >= pushStart && m.index < pushStart + push.length) {
            continue;
        }
        const before = apiCode.slice(0, m.index);
        const kinds = [...before.matchAll(/(?:case |kind: )"(\w+)"/g)];
        const kind = kinds.length ? kinds[kinds.length - 1][1] : '(no kind)';
        failures.push(`push field: ${API}:${before.split('\n').length}: titleChanged rides ${kind}, not webTabPush's state push -- the flag is field-only on the existing push (W3)`);
    }
    const activatedArm = /case "webTabActivated": \{([\s\S]*?)\n {4}\}/.exec(apiCode)?.[1] ?? '';
    if (!/webTabPagePush\(/.test(activatedArm)) {
        failures.push(`push field: ${API}: the webTabActivated arm does not push the activated tab -- its attention flag would outlive activation`);
    }

    // 14. no frame write
    const frameFiles = src[FRAME_KEY] ?? [];
    if (!frameFiles.includes(WEB_TAB) || !frameFiles.includes(STRIP)) {
        failures.push(`frame write: the frame-side file list lacks ${WEB_TAB} or ${STRIP} (broken instrument)`);
    }
    let reads = 0;
    for (const rel of frameFiles) {
        const lines = stripComments(src[rel] ?? '').split('\n');
        lines.forEach((line, index) => {
            if (!/\btitleChanged\b\s*(?:=(?!=)|:|\+\+|--)/.test(line)) {
                return;
            }
            if (FRAME_WRITES_ALLOWED.has(`${rel}|${line.trim()}`)) {
                reads += line.includes('detail.titleChanged') ? 1 : 0;
                return;
            }
            failures.push(`frame write: ${rel}:${index + 1}: writes titleChanged (${line.trim()}) -- the attention flag is minted chrome-side only (T-34-07)`);
        });
    }
    if (reads !== 1) {
        failures.push(`frame write: ${WEB_TAB}: the push read of titleChanged (detail.titleChanged === true) was found ${reads} times, want 1`);
    }

    // 15. registry
    failures.push(...registryFailures(src[REGISTRY] ?? '', src[DRIVERS_KEY] ?? []));
    return failures;
}

/** Check 15: each tab-strip gate's two rows sit once, in order, in their own registry block; no other driver runs them. */
function registryFailures(registry, drivers) {
    const failures = [];
    const quickAt = registry.indexOf('local -a CHECKS=(');
    const quickEnd = quickAt < 0 ? -1 : registry.indexOf('\n  )\n', quickAt);
    const liveAt = quickEnd < 0 ? -1 : registry.indexOf('CHECKS+=(', quickEnd);
    const liveEnd = liveAt < 0 ? -1 : registry.indexOf('\n    )\n', liveAt);
    if ([quickAt, quickEnd, liveAt, liveEnd].some(at => at < 0)) {
        return [`registry: ${REGISTRY}: the quick block (local -a CHECKS=( ... )) or the live block (CHECKS+=( ... )) was not found (broken instrument)`];
    }
    const rowsOf = text => [...text.matchAll(/^\s*"([^|"\s]+)\|([^"]*)"\s*$/gm)].map(m => `${m[1]}|${m[2]}`);
    const blocks = { quick: rowsOf(registry.slice(quickAt, quickEnd)), live: rowsOf(registry.slice(liveAt, liveEnd)) };
    const everywhere = rowsOf(registry);
    for (const [script, home] of GATE_HOMES) {
        const runs = row => row.split('|').slice(1).join('|').split(/\s+/).includes(`$REPO_ROOT/scripts/${script}`);
        const label = script.replace(/^verify-/, '').replace(/\.mjs$/, '');
        const gate = `${label}|node $REPO_ROOT/scripts/${script}`;
        const selfTest = `${label}-self-test|node $REPO_ROOT/scripts/${script} --self-test`;
        const homeRows = blocks[home].filter(runs);
        const elsewhere = everywhere.filter(runs).length - homeRows.length;
        if (elsewhere > 0) {
            failures.push(`registry: ${elsewhere} row(s) run ${script} outside the ${home} block`);
        }
        for (const want of [gate, selfTest]) {
            const count = homeRows.filter(row => row === want).length;
            if (count !== 1) {
                failures.push(`registry: "${want.split('|')[0]}" appears ${count} times in the ${home} block, want exactly once`);
            }
        }
        for (const extra of homeRows.filter(row => row !== gate && row !== selfTest)) {
            failures.push(`registry: "${extra.split('|')[0]}" is an extra row running ${script} in the ${home} block`);
        }
        const at = blocks[home].indexOf(gate);
        if (at >= 0 && blocks[home].indexOf(selfTest) >= 0 && blocks[home][at + 1] !== selfTest) {
            failures.push(`registry: "${label}-self-test" does not run right after "${label}" in the ${home} block (documented order: the gate, then its --self-test)`);
        }
    }
    for (const { rel, text } of drivers) {
        if (/verify-tab-strip(?:-live)?\.mjs/.test(text)) {
            failures.push(`registry: ${rel} runs a tab-strip gate: a sibling driver (one driver, one registry: ${REGISTRY})`);
        }
    }
    return failures;
}

/** Every tracked-looking shell script under scripts/ and every workflow, except the registry itself. */
function driverFiles() {
    const out = [];
    const walk = (rel, keep) => {
        if (!existsSync(join(REPO_ROOT, rel))) {
            return;
        }
        for (const entry of readdirSync(join(REPO_ROOT, rel), { withFileTypes: true })) {
            const next = `${rel}/${entry.name}`;
            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules') {
                    walk(next, keep);
                }
            } else if (keep(entry.name) && next !== REGISTRY) {
                out.push({ rel: next, text: readFileSync(join(REPO_ROOT, next), 'utf8') });
            }
        }
    };
    walk('scripts', name => name.endsWith('.sh'));
    walk('.github/workflows', name => /\.ya?ml$/.test(name));
    return out;
}

/** The frame-side sources: tracked .ts/.tsx under the extensions' src trees (tests excluded), plus the child actor. */
function frameFiles() {
    const out = [];
    const walk = rel => {
        for (const entry of readdirSync(join(REPO_ROOT, rel), { withFileTypes: true })) {
            const next = `${rel}/${entry.name}`;
            if (entry.isDirectory()) {
                if (!['node_modules', 'lib', '__tests__', 'test'].includes(entry.name)) {
                    walk(next);
                }
            } else if (/\.tsx?$/.test(entry.name) && !/\.(spec|test)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
                out.push(next);
            }
        }
    };
    for (const ext of existsSync(join(REPO_ROOT, FRAME_DIR)) ? readdirSync(join(REPO_ROOT, FRAME_DIR)) : []) {
        if (existsSync(join(REPO_ROOT, FRAME_DIR, ext, 'src'))) {
            walk(`${FRAME_DIR}/${ext}/src`);
        }
    }
    return [...out, FRAME_CHILD];
}

function readSources() {
    const out = {};
    out[FRAME_KEY] = frameFiles();
    out[DRIVERS_KEY] = driverFiles();
    for (const rel of new Set([STRIP, COPY, WEB_TAB, API, BRIDGE_GATE, CODICONS, REGISTRY, ...out[FRAME_KEY]])) {
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
        name: 'menu-item-removed',
        file: STRIP,
        mutate: s => s.replace("contract: 'Close Duplicates', ", ''),
        expect: 'Close Duplicates',
    },
    {
        name: 'copy-row-removed',
        file: COPY,
        mutate: s => s.replace(/\n\s*closeDuplicates: 'Close Duplicate Tabs',/, ''),
        expect: 'closeDuplicates',
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
        mutate: s => s.replace(/\.codicon-pin:before/g, '.codicon-planted-gone:before'),
        expect: 'pin',
    },
    {
        name: 'uncatalogued-kind-added-34-02',
        file: API,
        mutate: s => s.replace('const STORE_REQUEST_KINDS = new Set([', 'const STORE_REQUEST_KINDS = new Set(["storeTabReorder", '),
        expect: 'storeTabReorder',
    },
    {
        name: 'chevron-without-overflow',
        file: STRIP,
        mutate: s => s.replace('{this.overflowing && <button', '{<button'),
        expect: 'chevron',
    },
    {
        name: 'url-keyed-pin',
        file: STRIP,
        mutate: s => s.replace('this.pinnedIds.add(this.tabKey(widget));', 'this.pinnedIds.add(widget.url);'),
        expect: 'pinnedIds.add(widget.url)',
    },
    {
        name: 'tabid-keyed-selection',
        file: STRIP,
        mutate: s => s.replace('this.selectedIds.add(this.tabKey(widget));', 'this.selectedIds.add(widget.id);'),
        expect: 'selectedIds.add(widget.id)',
    },
    {
        name: 'second-close-path',
        file: STRIP,
        mutate: s => s.replace("run: () => this.runOnEach(selected, 'close'),", 'run: () => this.closeTabs(selected),'),
        expect: 'close-n',
    },
    {
        name: 'unbounded-pin-store',
        file: STRIP,
        mutate: s => s.replace(/(const pinnedIds: PinnedTab\[\] = )[\s\S]*?;\n/, '$1[...this.pinnedIds].map(key => ({ key }));\n'),
        expect: 'savePins',
    },
    {
        name: 'stale-key-repinned',
        file: STRIP,
        mutate: s => s.replace(' && this.tabKey(widget) === entry.key', ''),
        expect: 'entry.key',
    },
    {
        name: 'current-widget-fallback',
        file: STRIP,
        mutate: s => s.replace(/(protected tabMenuRows\(widget: Widget\): TabMenuRow\[\] \{)/, '$1\n        widget = this.shell.currentWidget ?? widget;'),
        expect: 'currentWidget',
    },
    {
        name: 'occlusion-selector-dropped-34-04',
        file: WEB_TAB,
        mutate: s => s.replace(', .pb-tab-preview', ''),
        expect: '.pb-tab-preview',
    },
    {
        name: 'preview-anchor-over-page',
        file: STRIP,
        mutate: s => s.replace('top: box.bottom + 4,', 'top: box.top,'),
        expect: 'anchor',
    },
    {
        name: 'preview-on-active-tab',
        file: STRIP,
        mutate: s => s.replace(/(protected schedulePreview\([^)]*\): void \{\n\s*this\.closePreview\(\);\n\s*)if \(widget\.isVisible\) \{\n\s*return;\n\s*\}\n/, '$1'),
        expect: 'active',
    },
    {
        name: 'live-capture-call',
        file: STRIP,
        mutate: s => s.replace(/(protected previewImage\(widget: Widget\): string \| null \| undefined \{\n)/, "$1        void this.channel.request({ kind: 'webTabCapture', tabId: '' });\n"),
        expect: 'capture',
    },
    {
        name: 'push-field-missing',
        file: API,
        mutate: s => s.replace(/\n\s*titleChanged: webTabTitleChanged\(theiaBrowser, tabId, browser, loading\),/, ''),
        expect: 'lacks titleChanged',
    },
    {
        name: 'push-field-moved',
        file: API,
        mutate: s => s.replace(/(function webTabPagePush\(browser\) \{\n)/,
            '$1  browser.ownerGlobal?.browsingContext?.currentWindowGlobal?.getActor(GROUP_ACTOR_NAME).sendAsyncMessage("PowerBrowserWebTabState", { kind: "webTabAttention", titleChanged: true });\n'),
        expect: 'webTabAttention',
    },
    {
        name: 'frame-write-titleChanged',
        file: STRIP,
        mutate: s => s.replace(/(protected isUpdated\(widget: Widget, active: boolean\): boolean \{\n)/, '$1        (widget as WebTabWidget).titleChanged = true;\n'),
        expect: STRIP,
    },
    {
        name: 'registry-row-duplicated',
        file: REGISTRY,
        mutate: s => s.replace(/\n( *"tab-strip-self-test\|[^\n]*)/, (m, row) => `\n${row}\n${row}`),
        expect: '"tab-strip-self-test" appears 2 times in the quick block',
    },
    {
        name: 'registry-live-row-in-quick',
        file: REGISTRY,
        mutate: s => s.replace(/\n( *)("tab-strip-self-test\|[^\n]*)/, (m, pad, row) => `\n${pad}${row}\n${pad}"tab-strip-live|node $REPO_ROOT/scripts/verify-tab-strip-live.mjs"`),
        expect: 'run verify-tab-strip-live.mjs outside the live block',
    },
    {
        name: 'registry-self-test-first',
        file: REGISTRY,
        mutate: s => s.replace(/\n( *"tab-strip-live\|[^\n]*)\n( *"tab-strip-live-self-test\|[^\n]*)/, (m, gate, test) => `\n${test}\n${gate}`),
        expect: 'does not run right after "tab-strip-live"',
    },
    {
        name: 'sibling-driver',
        file: DRIVERS_KEY,
        mutate: drivers => [...drivers, { rel: 'scripts/verify-phase-34.sh', text: 'node "$REPO_ROOT/scripts/verify-tab-strip-live.mjs"\n' }],
        expect: 'scripts/verify-phase-34.sh runs a tab-strip gate',
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
    console.log(`${NAME}: PASS -- tab menu matches ROADMAP criterion 1, copy, occlusion, kinds, codicons, target, overflow, keys, delegation, pin store, preview occlusion/anchor/source, push field, no frame write and registry rows hold`);
    return 0;
}

process.exit(main());
