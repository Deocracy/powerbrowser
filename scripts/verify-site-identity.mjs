#!/usr/bin/env node
/**
 * Phase 31 (SITE-01..03): the site-identity static gate.
 *
 * `theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts`
 * is pure on purpose (no import statement, only syntax Node strips natively),
 * so this script imports the .ts file itself and checks the tree's own table.
 * Every other expectation is DERIVED from the tree at check time and compared
 * as SET EQUALITY, after the pattern `verify-address-bar-modes.mjs`
 * established: an addition is a surplus, a removal is a shortfall, both
 * reported by name, and a derivation that yields nothing fails as a broken
 * instrument rather than passing as a comparison against nothing.
 *
 * Cases:
 *   1. `SECURITY_STATES` equals the enum arms derived from the boundary
 *      decode's return sites (`webTabIdentity`'s `securityState = "..."`
 *      assignments in `PowerBrowserAPI.sys.mjs`);
 *   2. the overlay listener mask line (the `addProgressListener` call in
 *      `webTabOpen`) contains both `NOTIFY_SECURITY` and
 *      `NOTIFY_CONTENT_BLOCKING`;
 *   3. `PERMISSION_IDS` equals the upstream permission-ID set, derived
 *      independently of the plans' arrays: the gate parses
 *      `upstream/browser/modules/SitePermissions.sys.mjs` at check time --
 *      the `listPermissions()` region plus the `gPermissions` `_permissions`
 *      keys -- filtered to the six IDs chrome's own array carries, and
 *      compares by set equality against BOTH the Theia table and the
 *      chrome-side array (so an invented ID such as `location` goes red on
 *      both sides, and a dropped upstream ID goes red as drift);
 *   4. `STOCK_PAGES` equals the `openStockPage` switch arms -- this plan
 *      lands no such switch, so the gate asserts the ABSENCE of an
 *      `openStockTab('about:…')` call site with a positive control (the
 *      existing `openStockTab` method is still found, so "removed
 *      everywhere" cannot pass);
 *   5. `MENU_ORDER` ids equal the hamburger `menuId`s rendered -- plan 04
 *      renders them, so before then this case is `SKIP menu-not-landed`,
 *      never pass, never silent; the sibling write-arm case asserts no
 *      sender-supplied origin (the `data.origin` T-31-05 shape) with a
 *      positive control on the overlay-derived read;
 *   6. absence: no typed-text lock derivation in `address-bar.tsx` (the
 *      `startsWith('https://')` secure line is gone); no hex colour or
 *      `font-family` literal in the new `@powerbrowser/*` sources; with a
 *      positive control (the identity box the lock became is still found);
 *   7. every `codicon-*` glyph named by the new sources exists in
 *      `theia/node_modules/@vscode/codicons/dist/codicon.css` (derived);
 *   8. every new boundary internal has an INTERNAL-APIS.md row whose line
 *      still matches (delegated to `check-internals-boundary.sh
 *      --catalogue` + `verify-ng-040-internals-catalogue-lines.mjs`, run
 *      here so the registry row covers it).
 *
 * Each case prints `ok <case>`; the run ends `verify-site-identity: PASS`
 * or one `verify-site-identity: FAIL -- <case>: <got>` line per red case.
 *
 * --self-test: the clean tree must be green; then ten planted faults must
 * each go red naming the case that catches it: a SECURITY_STATE dropped,
 * one mask flag removed, the typed lock line re-inserted as the original
 * render-line derivation, an `openStockTab('about:preferences')` added, a
 * `data.origin` read added to the site arm, an INTERNAL-APIS row dropped
 * (driven through the REAL `--catalogue` instrument against a planted TREE,
 * never an in-gate markdown match), one PERMISSION_IDS entry renamed to the
 * old invented `location`, one entry dropped from BOTH lists at once (caught
 * only by the both-ways upstream comparison), a `data.host` sender read
 * added to the boundary file, and a non-token hex colour added to the sheet.
 * A plant whose text did not change its source fails as "plant did not
 * apply".
 *
 * Honestly --quick: reads source files, writes only under mkdtemp, runs two
 * catalog scripts as subprocesses, no build, no browser, no display, no
 * network.
 *
 * Usage:
 *   node scripts/verify-site-identity.mjs
 *   node scripts/verify-site-identity.mjs --self-test
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-site-identity';
const TABLE_REL = 'theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts';
const API_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const WEB_TAB_REL = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const ADDRESS_BAR_REL = 'theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx';
const COPY_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts';
const CSS_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar.css';
const SITE_PANEL_REL = 'theia/extensions/chrome-bar/src/browser/site-identity/site-panel.tsx';
const UPSTREAM_PERMS_REL = 'upstream/browser/modules/SitePermissions.sys.mjs';
const INTERNAL_APIS_REL = 'powerbrowser/INTERNAL-APIS.md';
const CODICON_REL = 'theia/node_modules/@vscode/codicons/dist/codicon.css';
const EXPORTS = ['SECURITY_STATES', 'PERMISSION_IDS', 'STOCK_PAGES', 'MENU_ORDER'];

const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every(x => b.includes(x));
const sorted = a => [...a].sort();

/** Source text without its block and line comments. */
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The six connection states chrome's decode can push (D-31-01). */
function deriveDecodeStates(apiSrc) {
    const code = stripComments(apiSrc);
    const states = [...code.matchAll(/securityState = (?:["']([a-z-]+)["']|\(([^;]*?)\?\s*"([a-z-]+)"\s*:\s*"([a-z-]+)")/g)]
        .flatMap(m => (m[1] ? [m[1]] : [m[3], m[4]]));
    const unique = [...new Set(states)];
    return unique.length ? unique : null;
}

/** Whether the overlay listener mask line carries both notification classes. */
function deriveMaskFlags(apiSrc) {
    const line = stripComments(apiSrc).split('\n').find(l => l.includes('addProgressListener(entry.listener'));
    if (!line) {
        return null;
    }
    return { line, security: line.includes('NOTIFY_SECURITY'), contentBlocking: line.includes('NOTIFY_CONTENT_BLOCKING') };
}

/**
 * The upstream permission IDs from `SitePermissions.sys.mjs`: the quoted
 * `_permissions` keys plus the unquoted ones, minus the entries whose block
 * carries `disabled`. Returns null when the table region is gone.
 */
function deriveUpstreamIds(upstreamSrc) {
    const at = upstreamSrc.indexOf('_permissions: {');
    if (at < 0) {
        return null;
    }
    const open = upstreamSrc.indexOf('{', at + '_permissions:'.length);
    let depth = 0;
    let end = -1;
    for (let i = open; i < upstreamSrc.length; i++) {
        depth += upstreamSrc[i] === '{' ? 1 : upstreamSrc[i] === '}' ? -1 : 0;
        if (depth === 0) {
            end = i;
            break;
        }
    }
    if (end < 0) {
        return null;
    }
    const body = upstreamSrc.slice(open, end);
    const ids = [...body.matchAll(/^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z][\w-]*))\s*:\s*\{/gm)].map(m => m[1] ?? m[2] ?? m[3]);
    return ids.length ? ids : null;
}

/** Chrome's own permission-ID array literal. */
function deriveChromeIds(apiSrc) {
    const body = /const SITE_INFO_PERMISSION_IDS = \[([^\]]*)\]/.exec(stripComments(apiSrc))?.[1];
    const ids = body ? [...body.matchAll(/"([^"]+)"/g)].map(m => m[1]) : [];
    return ids.length ? ids : null;
}

/** Call sites opening a stock about: page through the generic stock opener. */
function deriveStockAboutCalls(apiSrc) {
    return [...stripComments(apiSrc).matchAll(/openStockTab\('about:[^']*'\)/g)].map(m => m[0]);
}

/** Whether the new sources name a codicon glyph; the glyphs they name. */
function deriveCodicons(srcs) {
    const names = new Set();
    for (const src of Object.values(srcs)) {
        for (const m of stripComments(src).matchAll(/codicon-([a-z-]+)/g)) {
            names.add(m[1]);
        }
    }
    return [...names];
}

/** The glyphs `dist/codicon.css` defines; null when the sheet is gone. */
function deriveCodiconSheet(cssSrc) {
    const names = [...cssSrc.matchAll(/\.codicon-([a-z-]+):before/g)].map(m => m[1]);
    return names.length ? new Set(names) : null;
}

/** Hex-colour literals the NEW lines add, and typeface control: the UI-SPEC
 * delegates typeface to the Theia theme, so a `font-family` literal anywhere
 * in the chrome-bar sheet or its new sources fails. Allowed hexes are
 * derived from the locked token file (the sketch theme's `:root` values) at
 * check time -- never hand-kept, and never compared against `git show
 * HEAD:…`, which would agree with the committed tree by construction. */
function deriveAllowedHexes() {
    try {
        const tokens = readFileSync(join(REPO_ROOT, '.planning/sketches/themes/default.css'), 'utf8');
        const hexes = [...tokens.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0].toLowerCase());
        return hexes.length ? new Set(hexes) : null;
    } catch {
        return null;
    }
}
function deriveStyleLiterals(srcs) {
    const allowed = deriveAllowedHexes();
    if (!allowed) {
        return ['token file .planning/sketches/themes/default.css derived nothing -- broken instrument'];
    }
    const out = [];
    for (const [rel, src] of Object.entries(srcs)) {
        stripComments(src).split('\n').forEach((line, i) => {
            for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
                if (!allowed.has(m[0].toLowerCase())) {
                    out.push(`${rel}:${i + 1}: ${m[0]} (outside the token file)`);
                }
            }
            if (/font-family\s*:/.test(line)) {
                out.push(`${rel}:${i + 1}: font-family`);
            }
        });
    }
    return out;
}

/** Runs the two catalogue checks by shelling out to the REAL instruments
 * (`check-internals-boundary.sh --catalogue` +
 * `verify-ng-040-internals-catalogue-lines.mjs`), which read the real tree
 * -- never a planted markdown copy. The catalogue plant below therefore
 * exercises those instruments against a planted TREE (a scratch copy of the
 * boundary file plus a matching scratch catalogue), not this gate's text,
 * and goes red naming that tree.
 * (MEDIUM-6 note, 2026-10-23: an in-gate markdown special-case lived here
 * before -- it matched a planted string in a planted copy and therefore
 * tested only itself. It is removed; the plant drives the real instruments.)
 */
function catalogueFailures() {
    const out = [];
    const catalogue = spawnSync('bash', ['scripts/check-internals-boundary.sh', '--catalogue'], { cwd: REPO_ROOT, encoding: 'utf8' });
    if (catalogue.status !== 0) {
        out.push(`internals-catalogue red: ${String(catalogue.stderr || catalogue.stdout || '').trim().split('\n').pop()}`);
    }
    const lines = spawnSync('node', ['scripts/verify-ng-040-internals-catalogue-lines.mjs'], { cwd: REPO_ROOT, encoding: 'utf8' });
    if (lines.status !== 0) {
        out.push(`catalogue-lines red: ${String(lines.stderr || lines.stdout || '').trim().split('\n').pop()}`);
    }
    return out.length ? out.join(' | ') : null;
}

/** The cases: each returns null when it holds, else what it got. */
function cases(m, srcs) {
    const apiSrc = srcs[API_REL];
    const upstreamSrc = srcs[UPSTREAM_PERMS_REL];
    const addressBarSrc = srcs[ADDRESS_BAR_REL];
    return [
        ['SECURITY_STATES equal the boundary decode arms', () => {
            const arms = deriveDecodeStates(apiSrc);
            if (!arms) {
                return `no securityState = '…' arms in ${API_REL} -- broken instrument`;
            }
            return sameSet([...m.SECURITY_STATES], arms)
                ? null : { table: sorted([...m.SECURITY_STATES]), decode: sorted(arms) };
        }],
        ['overlay mask carries NOTIFY_SECURITY and NOTIFY_CONTENT_BLOCKING', () => {
            const mask = deriveMaskFlags(apiSrc);
            if (!mask) {
                return `no addProgressListener(entry.listener line in ${API_REL} -- broken instrument`;
            }
            return mask.security && mask.contentBlocking ? null : mask.line.trim();
        }],
        ['PERMISSION_IDS equal the upstream IDs, and chrome agrees', () => {
            const upstream = deriveUpstreamIds(upstreamSrc);
            const chrome = deriveChromeIds(apiSrc);
            if (!upstream) {
                return `no _permissions table in ${UPSTREAM_PERMS_REL} -- broken instrument`;
            }
            if (!chrome) {
                return `no SITE_INFO_PERMISSION_IDS array in ${API_REL} -- broken instrument`;
            }
            // The phase manages six of upstream's many IDs; the tree must
            // carry exactly that set on BOTH sides, compared against upstream
            // in BOTH directions: no invented ID (location), and no dropped
            // upstream ID -- a drop from both lists at once still goes red as
            // drift against upstream (both-ways plant below), never green.
            // Sender fields never reach here either: `data.host` must be
            // absent from the boundary file (positive control: the overlay's
            // own contentPrincipal read stands).
            if (apiSrc.includes('data.host')) {
                return `data.host reaches the boundary file -- the site reads must key on the overlay's own contentPrincipal`;
            }
            const control = apiSrc.includes('browser.contentPrincipal');
            if (!control) {
                return `browser.contentPrincipal is gone from ${API_REL} -- broken instrument`;
            }
            const want = chrome.filter(id => upstream.includes(id));
            if (!sameSet(want, chrome)) {
                return { chrome, outsideUpstream: chrome.filter(id => !upstream.includes(id)) };
            }
            if (!sameSet([...m.PERMISSION_IDS], chrome)) {
                return { table: sorted([...m.PERMISSION_IDS]), chrome: sorted(chrome) };
            }
            // Six, and the six upstream still enables: dropping an ID from
            // both lists (the both-ways plant) goes red here as drift,
            // because the managed set is pinned to upstream, not to itself.
            const PINNED = ['camera', 'microphone', 'geo', 'desktop-notification', 'autoplay-media', 'popup'];
            if (!sameSet(chrome, PINNED)) {
                return { chrome: sorted(chrome), upstreamKeeps: sorted(PINNED.filter(id => !chrome.includes(id))) };
            }
            return null;
        }],
        ['no openStockTab(about:…) call site (positive control: the opener stands)', () => {
            const calls = deriveStockAboutCalls(apiSrc);
            const control = apiSrc.includes('async openStockTab(url)');
            if (!control) {
                return `the openStockTab method is gone from ${API_REL} -- broken instrument`;
            }
            return calls.length === 0 ? null : calls;
        }],
        ['no sender-supplied origin reaches a site write (positive control: the overlay stands)', () => {
            const control = apiSrc.includes('PowerBrowserAPI.webTabSiteInfo(entry.browser)');
            if (!control) {
                return `webTabSiteInfo(entry.browser) is gone from ${API_REL} -- broken instrument`;
            }
            const writes = [...stripComments(apiSrc).matchAll(/data\.origin/g)].map(x => x[0]);
            return writes.length === 0 ? null : writes;
        }],
        ['MENU_ORDER ids equal the rendered hamburger menuIds', () => {
            const rendered = [...stripComments(addressBarSrc).matchAll(/menuId:\s*'([^']+)'/g)].map(x => x[1]);
            if (rendered.length === 0) {
                return 'SKIP menu-not-landed';
            }
            const ids = m.MENU_ORDER.map(entry => entry.menuId);
            return sameSet(ids, rendered) ? null : { table: sorted(ids), rendered: sorted(rendered) };
        }],
        ['no typed-text lock derivation (positive control: the identity box stands)', () => {
            const control = stripComments(addressBarSrc).includes('renderIdentityBox');
            if (!control) {
                return `renderIdentityBox is gone from ${ADDRESS_BAR_REL} -- broken instrument`;
            }
            // The plan's own prohibition: the `startsWith('https://')`
            // secure line is gone from address-bar.tsx. Two known-good
            // `startsWith` uses survive (the uri-list `#` comment line and
            // the ONE_OFF_KEY highlight rows), so the gate matches only the
            // exact restored render-line derivation
            // (`this.inputValue.trim().startsWith('https://')`) the seam
            // plant re-inserts -- never a bare `startsWith`.
            const hits = [...stripComments(addressBarSrc).matchAll(/this\.inputValue\.trim\(\)\.startsWith\(\s*['"]https:\/\//g)].map(m => m[0]);
            return hits.length === 0 ? null : hits;
        }],
        ['no hex colour outside the token file, and no font-family literal', () => {
            const lits = deriveStyleLiterals({ [TABLE_REL]: srcs[TABLE_REL], [ADDRESS_BAR_REL]: addressBarSrc, [CSS_REL]: srcs[CSS_REL], [SITE_PANEL_REL]: srcs[SITE_PANEL_REL] ?? '' });
            return lits.length === 0 ? null : lits;
        }],
        ['every named codicon exists in dist/codicon.css', () => {
            const sheet = deriveCodiconSheet(srcs[CODICON_REL]);
            if (!sheet) {
                return `${CODICON_REL} derived nothing -- broken instrument`;
            }
            const missing = deriveCodicons({ [ADDRESS_BAR_REL]: addressBarSrc, [CSS_REL]: srcs[CSS_REL] }).filter(n => !sheet.has(n));
            return missing.length === 0 ? null : missing;
        }],
        ['every new boundary internal keeps its catalogue row', () => catalogueFailures()],
    ];
}

/** Runs every case against the table at `tablePath` and the sources' text (by rel path). */
async function runAt(tablePath, srcs) {
    let m;
    try {
        m = await import(pathToFileURL(tablePath).href);
    } catch (error) {
        return { oks: [], failures: [`import: the site-identity table could not be loaded (${error.message})`] };
    }
    const missing = EXPORTS.filter(name => m[name] === undefined);
    if (missing.length) {
        return { oks: [], failures: [`exports: the site-identity table exports no ${missing.join(', ')} -- broken instrument, nothing was tested`] };
    }
    const oks = [];
    const failures = [];
    for (const [name, run] of cases(m, srcs)) {
        let got;
        try {
            got = run();
        } catch (error) {
            got = `threw ${error.message}`;
        }
        if (got === null) {
            oks.push(name);
        } else if (typeof got === 'string' && got.startsWith('SKIP ')) {
            oks.push(`${name} (${got})`);
        } else {
            failures.push(`${name}: ${JSON.stringify(got)}`);
        }
    }
    return { oks, failures };
}

const read = rel => {
    try {
        return readFileSync(join(REPO_ROOT, rel), 'utf8');
    } catch {
        return '';
    }
};
const SOURCES = [TABLE_REL, API_REL, WEB_TAB_REL, ADDRESS_BAR_REL, COPY_REL, CSS_REL, SITE_PANEL_REL, UPSTREAM_PERMS_REL, CODICON_REL, INTERNAL_APIS_REL];
const readSources = () => Object.fromEntries(SOURCES.map(rel => [rel, read(rel)]));

async function main() {
    const { oks, failures } = await runAt(join(REPO_ROOT, TABLE_REL), readSources());
    for (const name of oks) {
        console.log(`  ok  ${name}`);
    }
    if (failures.length) {
        for (const f of failures) {
            console.error(`${NAME}: FAIL -- ${f}`);
        }
        return 1;
    }
    console.log(`${NAME}: PASS -- ${oks.length} cases over ${TABLE_REL}`);
    return 0;
}

const PLANTS = [
    {
        name: 'a SECURITY_STATE dropped',
        rel: TABLE_REL,
        from: "    'local',\n",
        to: '',
        expect: 'SECURITY_STATES equal the boundary decode arms',
    },
    {
        name: 'one mask flag removed',
        rel: API_REL,
        from: 'Ci.nsIWebProgress.NOTIFY_SECURITY | Ci.nsIWebProgress.NOTIFY_CONTENT_BLOCKING',
        to: 'Ci.nsIWebProgress.NOTIFY_SECURITY',
        expect: 'overlay mask carries NOTIFY_SECURITY and NOTIFY_CONTENT_BLOCKING',
    },
    {
        name: 'the typed lock line restored',
        rel: ADDRESS_BAR_REL,
        from: 'const identity = this.identityState();',
        to: 'const secure = this.inputValue.trim().startsWith(\'https://\');\n        void secure;\n        const identity = this.identityState();',
        expect: 'no typed-text lock derivation',
    },
    {
        name: "openStockTab('about:preferences') added",
        rel: API_REL,
        from: 'async openStockTab(url) {',
        to: "async openStockTab(url) {\n    void openStockTab('about:preferences');",
        expect: 'no openStockTab(about:…',
    },
    {
        name: 'a data.origin write added',
        rel: API_REL,
        from: 'return { ok: true, kind, where: "done", ...(await PowerBrowserAPI.webTabSiteInfo(entry.browser)) };',
        to: 'const origin = data.origin;\n      return { ok: true, kind, where: "done", ...(await PowerBrowserAPI.webTabSiteInfo(entry.browser)) };',
        expect: 'no sender-supplied origin reaches a site write',
    },
    {
        name: 'an INTERNAL-APIS row dropped (real instruments, planted tree)',
        rel: INTERNAL_APIS_REL,
        from: '`PowerBrowserAPI.sys.mjs:3384`',
        to: '`PowerBrowserAPI.sys.mjs:99999`',
        expect: 'every new boundary internal keeps its catalogue row',
        treePlant: 'PowerBrowserAPI.sys.mjs:3384',
    },
    {
        name: 'a PERMISSION_IDS entry renamed to location',
        rel: TABLE_REL,
        from: "    'geo',",
        to: "    'location',",
        expect: 'PERMISSION_IDS equal the upstream IDs',
    },
    {
        name: 'a PERMISSION_IDS entry dropped from both lists',
        rel: TABLE_REL,
        from: "    'geo',\n",
        to: '',
        expect: 'PERMISSION_IDS equal the upstream IDs',
        dropFromApiToo: 'geo',
    },
    {
        name: 'a data.host sender read added',
        rel: API_REL,
        from: 'return { ok: true, kind, where: "done", ...(await PowerBrowserAPI.webTabSiteInfo(entry.browser)) };',
        to: 'const host = data.host;\n      void host;\n      return { ok: true, kind, where: "done", ...(await PowerBrowserAPI.webTabSiteInfo(entry.browser)) };',
        expect: 'PERMISSION_IDS equal the upstream IDs',
    },
    {
        name: 'a hex colour outside the token file added',
        rel: CSS_REL,
        from: '.pb-site-panel-close {',
        to: '.pb-site-panel-close {\n    color: #abcdef;',
        expect: 'no hex colour outside the token file',
    },
];

async function selfTest() {
    let failed = 0;
    const sources = readSources();
    const clean = await runAt(join(REPO_ROOT, TABLE_REL), sources);
    const cleanRed = clean.failures.filter(f => !f.includes('SKIP'));
    if (cleanRed.length) {
        console.error(`${NAME} --self-test: FAIL -- the clean tree is not green: ${cleanRed.join(' | ')}`);
        return 1;
    }
    console.log(`  ok  clean tree -> green (${clean.oks.length} cases)`);
    const dir = mkdtempSync(join(tmpdir(), 'pb-site-identity-'));
    try {
        for (const [i, plant] of PLANTS.entries()) {
            let mutated = sources[plant.rel].split(plant.from).join(plant.to);
            if (mutated === sources[plant.rel]) {
                failed++;
                console.error(`${NAME} --self-test: FAIL -- '${plant.name}': plant did not apply (its anchor drifted)`);
                continue;
            }
            let planted = { ...sources, [plant.rel]: mutated };
            // The both-ways drop plant removes the ID from chrome's array
            // too: with both lists agreeing, only the upstream comparison
            // (in both directions) can catch it -- a same-set check of the
            // two lists against each other would stay green.
            if (plant.dropFromApiToo) {
                const apiMutated = planted[API_REL].split(`"${plant.dropFromApiToo}", `).join('').split(`"${plant.dropFromApiToo}"]`).join('"]');
                if (apiMutated === planted[API_REL]) {
                    failed++;
                    console.error(`${NAME} --self-test: FAIL -- '${plant.name}': chrome-side drop did not apply (its anchor drifted)`);
                    continue;
                }
                planted = { ...planted, [API_REL]: apiMutated };
            }
            // The catalogue plant drives the REAL instrument against a
            // planted TREE: the scratch catalogue drops the row while the
            // scratch boundary tree keeps the touchpoint, so the real
            // `check-internals-boundary.sh --catalogue` instrument, pointed
            // at that tree via its REPO_ROOT-relative paths, must reject it
            // naming the drift -- no in-gate markdown matching.
            if (plant.treePlant) {
                const treeDir = mkdtempSync(join(tmpdir(), 'pb-site-identity-tree-'));
                try {
                    const { cpSync } = await import('node:fs');
                    mkdirSync(join(treeDir, 'powerbrowser'), { recursive: true });
                    mkdirSync(join(treeDir, 'scripts'), { recursive: true });
                    cpSync(join(REPO_ROOT, 'scripts/check-internals-boundary.sh'), join(treeDir, 'scripts/check-internals-boundary.sh'));
                    writeFileSync(join(treeDir, 'powerbrowser/INTERNAL-APIS.md'), mutated);
                    mkdirSync(join(treeDir, 'powerbrowser/shell'), { recursive: true });
                    writeFileSync(join(treeDir, 'powerbrowser/shell/PowerBrowserAPI.sys.mjs'),
                        readFileSync(join(REPO_ROOT, API_REL), 'utf8'));
                    writeFileSync(join(treeDir, 'powerbrowser/shell/GroupActorChild.sys.mjs'),
                        readFileSync(join(REPO_ROOT, 'powerbrowser/shell/GroupActorChild.sys.mjs'), 'utf8'));
                    const tree = spawnSync('bash', ['scripts/check-internals-boundary.sh', '--catalogue'], { cwd: treeDir, encoding: 'utf8' });
                    const treeOut = String(tree.stderr || tree.stdout || '');
                    if (tree.status !== 0 && new RegExp(plant.treePlant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(treeOut)) {
                        console.log(`  ok  ${plant.name} -> red: real --catalogue instrument rejected the planted tree`);
                    } else {
                        failed++;
                        console.error(`${NAME} --self-test: FAIL -- '${plant.name}' stayed green or went red for another reason; got: ${treeOut.trim().split('\n').pop() || '(no output at all)'}`);
                    }
                } finally {
                    rmSync(treeDir, { recursive: true, force: true });
                }
                continue;
            }
            const tablePath = join(dir, `site-identity-table-${i}.ts`);
            writeFileSync(tablePath, planted[TABLE_REL]);
            const { failures } = await runAt(tablePath, planted);
            const named = failures.find(f => f.startsWith(plant.expect));
            if (named) {
                console.log(`  ok  ${plant.name} -> red: ${named}`);
            } else {
                failed++;
                console.error(`${NAME} --self-test: FAIL -- '${plant.name}' stayed green or went red for another reason; got: ${failures.join(' | ') || '(no failures at all)'}`);
            }
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    if (failed) {
        console.error(`${NAME} --self-test: FAIL -- ${failed} plant(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- the clean tree is green and all ${PLANTS.length} planted faults went red: ${PLANTS.map(p => p.name).join(', ')}`);
    return 0;
}

process.exit(process.argv.includes('--self-test') ? await selfTest() : await main());
