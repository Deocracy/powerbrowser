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
 *   3. `PERMISSION_IDS` equals the managed permission IDs, and chrome's
 *      array agrees. The managed six are the IDs UI-SPEC names ("Permission
 *      IDs are the upstream Firefox IDs (...)"); each must be a `_permissions`
 *      key parsed from `upstream/browser/modules/SitePermissions.sys.mjs` at
 *      check time (so an invented ID such as `location` goes red), and the
 *      Theia table and the chrome-side array must equal the managed set by
 *      set equality (so a dropped ID goes red as drift on both sides);
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
 *   6. absence: `startsWith('https://')` appears nowhere in `address-bar.tsx`
 *      (the plan's own check, comments included: no typed-text lock); no hex
 *      colour or `font-family` literal in the new `@powerbrowser/*` sources;
 *      with a positive control (the identity box the lock became is still found);
 *   7. every `codicon-*` glyph named by the new sources exists in
 *      `theia/node_modules/@vscode/codicons/dist/codicon.css` (derived);
 *   8. every new boundary internal has an INTERNAL-APIS.md row whose line
 *      still matches (delegated to `check-internals-boundary.sh
 *      --catalogue` + `verify-ng-040-internals-catalogue-lines.mjs`, run
 *      here so the registry row covers it);
 *   9. the shield count is behaviour-checked: `webTabBlockedTrackerCount`
 *      is run on a fixture log (loaded and allowed states, and blocked
 *      ones) with the blocking bits derived from upstream's
 *      `nsIWebProgressListener.idl`; it must count the blocked origins only;
 *  10. the shield reset sits inside the `!sameDocument` guard;
 *  11. the panel header copy equals the UI-SPEC copy rows (`Connection
 *      secure`, `Connection not secure`), and the identity box's aria-label
 *      is `CHROME_BAR_COPY.sitePanelOpen(host)`.
 *  12. (plan 02) the write arm accepts exactly the panel states, derived from
 *      `webTabPermissionCapability` and compared with the table's cycles; the
 *      autoplay-media constants it maps to are the upstream states array
 *      (SitePermissions.sys.mjs:888-892);
 *  13. (plan 02) no hand-kept permission label map in the site-identity
 *      sources (labels come from `getPermissionLabel`), and the permission
 *      glyph map is keyed by PERMISSION_IDS;
 *  14. (plan 02, review fix) the write arm's only sender-origin use is the
 *      echo compare against the overlay's own principal origin.
 *
 * Each case prints `ok <case>`; the run ends `verify-site-identity: PASS`
 * or one `verify-site-identity: FAIL -- <case>: <got>` line per red case.
 *
 * --self-test: the clean tree must be green; then twenty-two planted faults
 * must each go red naming the case that catches it: a SECURITY_STATE
 * dropped, one mask flag removed, the typed lock line re-inserted, an
 * `openStockTab('about:preferences')` added, a `data.origin` read added to
 * the site arm, an INTERNAL-APIS row dropped (driven through the REAL
 * `--catalogue` instrument against a planted TREE, never an in-gate markdown
 * match), one PERMISSION_IDS entry renamed to the invented `location`, one
 * entry dropped from BOTH lists at once (caught by the comparison with the
 * managed set), a `data.host` sender read added to the boundary file, a
 * non-token hex colour and a font-family literal added to the sheet, a
 * loaded and an allowed state counted as blocked, every logged origin
 * counted, the shield reset moved out of the same-document guard, the
 * connection copy drifted, and the identity box label changed.
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
const UPSTREAM_IDL_REL = 'upstream/uriloader/base/nsIWebProgressListener.idl';
const UI_SPEC_REL = '.planning/phases/31-site-identity-permissions-and-app-menu/31-UI-SPEC.md';
const INTERNAL_APIS_REL = 'powerbrowser/INTERNAL-APIS.md';
const CODICON_REL = 'theia/node_modules/@vscode/codicons/dist/codicon.css';
const EXPORTS = ['SECURITY_STATES', 'PERMISSION_IDS', 'STOCK_PAGES', 'MENU_ORDER', 'PERMISSION_STATES', 'AUTOPLAY_PERMISSION_STATES'];

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

/**
 * The managed permission IDs, from the UI-SPEC sentence that names them
 * ("Permission IDs are the upstream Firefox IDs (`camera`, ...)"). The
 * managed six are a design decision, not a derivable fact: upstream's
 * enabled set depends on preferences, so the gate takes the six from the
 * design contract and checks each one against upstream's `_permissions` keys.
 */
function deriveSpecPermissionIds(uiSpecSrc) {
    const m = /Permission IDs are the upstream Firefox IDs \(([^)]*)\)/.exec(uiSpecSrc ?? '');
    if (!m) {
        return null;
    }
    const ids = [...m[1].matchAll(/`([^`]+)`/g)].map(x => x[1]);
    return ids.length ? ids : null;
}

/** The copy cell of a UI-SPEC copy-table row, its first backticked token. */
function deriveSpecCopy(uiSpecSrc, rowLabel) {
    const row = (uiSpecSrc ?? '').split('\n').find(line => line.startsWith(`| ${rowLabel} |`));
    const m = /`([^`]+)`/.exec(row ? row.split('|')[2] ?? '' : '');
    return m ? m[1] : null;
}

/** A `key: '…',` string literal in chrome-bar-copy.ts (the file imports Theia, so it is read as text). */
function deriveCopyLiteral(copySrc, key) {
    const m = new RegExp(`^\\s*${key}: '([^']*)',`, 'm').exec(copySrc ?? '');
    return m ? m[1] : null;
}

/** The `STATE_*` constants of upstream's nsIWebProgressListener IDL, name to value (hex, decimal or `1 << n`). */
function deriveWebProgressStates(idlSrc) {
    const out = {};
    for (const m of (idlSrc ?? '').matchAll(/const unsigned long (STATE_[A-Z0-9_]+)\s*=\s*([^;]+);/g)) {
        const expr = m[2].trim();
        const shifted = /^1 << (\d+)$/.exec(expr);
        const value = shifted ? 2 ** Number(shifted[1]) : /^(0x[0-9a-f]+|\d+)$/i.test(expr) ? Number(expr) : null;
        if (value !== null) {
            out[m[1]] = value;
        }
    }
    return Object.keys(out).length ? out : null;
}

/** The source of one two-space-indented object method taking `(browser)`, braces matched; null when absent. */
function deriveMethodSource(src, name) {
    const start = new RegExp(`^  ${name}\\(browser\\) \\{`, 'm').exec(src ?? '');
    if (!start) {
        return null;
    }
    let depth = 0;
    for (let i = start.index + start[0].length - 1; i < src.length; i++) {
        if (src[i] === '{') {
            depth += 1;
        } else if (src[i] === '}') {
            depth -= 1;
            if (depth === 0) {
                return src.slice(start.index, i + 1);
            }
        }
    }
    return null;
}

/**
 * Plan 02: the chrome write arm's state literals and the SitePermissions
 * constants it maps them to, read from `webTabPermissionCapability`'s body.
 */
function deriveWriteArm(apiSrc) {
    const code = stripComments(apiSrc);
    const at = code.indexOf('function webTabPermissionCapability(');
    if (at < 0) {
        return null;
    }
    const next = code.indexOf('\nfunction ', at + 1);
    const body = code.slice(at, next < 0 ? undefined : next);
    const states = [...new Set([...body.matchAll(/state === "([^"]+)"/g)].map(x => x[1]))];
    const consts = [...new Set([...body.matchAll(/lazy\.SitePermissions\.([A-Z_]+)/g)].map(x => x[1]))];
    return { states, consts };
}

/** The upstream autoplay-media states array (SitePermissions.sys.mjs:888-892), by constant name. */
function deriveUpstreamAutoplayStates(upstreamSrc) {
    const at = upstreamSrc.indexOf('"autoplay-media": {');
    if (at < 0) {
        return null;
    }
    const m = /states:\s*\[([^\]]*)\]/.exec(upstreamSrc.slice(at));
    return m ? [...m[1].matchAll(/SitePermissions\.([A-Z_]+)/g)].map(x => x[1]) : null;
}

/** The keys of the permission glyph map in site-panel.tsx (icons by upstream ID). */
function deriveGlyphKeys(panelSrc) {
    return [...stripComments(panelSrc ?? '').matchAll(/^\s+'?([a-z-]+)'?: 'codicon-/gm)].map(x => x[1]);
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
            const managed = deriveSpecPermissionIds(srcs[UI_SPEC_REL]);
            if (!upstream) {
                return `no _permissions table in ${UPSTREAM_PERMS_REL} -- broken instrument`;
            }
            if (!chrome) {
                return `no SITE_INFO_PERMISSION_IDS array in ${API_REL} -- broken instrument`;
            }
            if (!managed) {
                return `no "Permission IDs are the upstream Firefox IDs (...)" list in ${UI_SPEC_REL} -- broken instrument`;
            }
            // The managed set is the six UI-SPEC names; the tree must carry
            // exactly that set on BOTH sides, and every ID on either side must
            // be a `_permissions` key upstream defines: no invented ID
            // (location), and no dropped managed ID -- a drop from both lists
            // at once still goes red as drift against the managed set.
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
            const outsideUpstream = [...new Set([...managed, ...chrome])].filter(id => !upstream.includes(id));
            if (outsideUpstream.length) {
                return { outsideUpstream };
            }
            if (!sameSet(managed, chrome)) {
                return { managed: sorted(managed), chrome: sorted(chrome) };
            }
            if (!sameSet([...m.PERMISSION_IDS], managed)) {
                return { table: sorted([...m.PERMISSION_IDS]), managed: sorted(managed) };
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
            // Phase 31 plan 02 (review fix, TOCTOU): the write arm's ONLY use of
            // the sender's origin is the echo compare against the overlay's own
            // principal origin. Any other use (a key, a log field, a second
            // read) is a sender-supplied site write and goes red.
            const code = stripComments(apiSrc);
            const compare = 'principal.origin !== data.origin';
            if (!code.includes(compare)) {
                return `the webTabSetPermission origin echo compare is gone (${compare}) -- a write could land on the wrong site`;
            }
            if (!code.includes('const principal = entry.browser.contentPrincipal;')) {
                return `the write arm no longer keys on entry.browser.contentPrincipal -- broken instrument or a sender key`;
            }
            // The type guard (`typeof data.origin !== "string"`) is a validation read, not a use.
            const uses = [...code.replace(/typeof data\.origin !== "string"/g, '').matchAll(/data\.origin/g)].map(x => x[0]);
            return uses.length === 1 ? null : { senderOriginUses: uses.length, want: 'the one echo compare, nothing else' };
        }],
        ['the write arm accepts exactly the panel states (derived from the arm and the table)', () => {
            const arm = deriveWriteArm(apiSrc);
            if (!arm || arm.states.length === 0) {
                return `no webTabPermissionCapability state literals in ${API_REL} -- broken instrument`;
            }
            const table = [...new Set([...m.PERMISSION_STATES, ...m.AUTOPLAY_PERMISSION_STATES])];
            return sameSet(arm.states, table) ? null : { chrome: sorted(arm.states), table: sorted(table) };
        }],
        ['the autoplay write constants are the upstream autoplay states (SitePermissions.sys.mjs:888-892)', () => {
            const arm = deriveWriteArm(apiSrc);
            const upstreamAuto = deriveUpstreamAutoplayStates(upstreamSrc);
            if (!arm || !upstreamAuto) {
                return `no webTabPermissionCapability constants or upstream autoplay states array -- broken instrument`;
            }
            const want = ['ALLOW', 'BLOCK', 'AUTOPLAY_BLOCKED_ALL'];
            return sameSet(upstreamAuto, want) && sameSet(arm.consts, want)
                ? null : { upstream: sorted(upstreamAuto), chrome: sorted(arm.consts) };
        }],
        ['no hand-kept permission label map (labels come from getPermissionLabel)', () => {
            if (!apiSrc.includes('lazy.SitePermissions.getPermissionLabel(')) {
                return `getPermissionLabel is gone from ${API_REL} -- broken instrument`;
            }
            const label = /\blabel\s*:\s*['"`]/;
            const hits = [TABLE_REL, SITE_PANEL_REL].filter(rel => label.test(stripComments(srcs[rel] ?? '')));
            return hits.length === 0 ? null : hits;
        }],
        ['rows show the effective state; the cycle and the identity-box icons key on the stored state (Firefox parity)', () => {
            const code = stripComments(apiSrc);
            const effective = 'lazy.SitePermissions.getForPrincipal(principal, id, browser)';
            if (!code.includes(effective)) {
                return `the rows no longer read the effective state (${effective}) -- broken instrument or a regression to the stored-only read`;
            }
            const storedRule = 'stored: effective === null || effective === defaultCapability ? "default" : state';
            if (!code.includes(storedRule)) {
                return `the stored state rule is gone (${storedRule}) -- an autoplay default-equal entry would read as saved`;
            }
            const iconRule = /const shown = webTabPermissionRows\(browser\)\.filter\(row => row\.stored !== "default"\);/;
            if (!iconRule.test(code)) {
                return 'the identity-box icons no longer key on the stored state (row.stored !== "default")';
            }
            const refresh = stripComments(srcs[WEB_TAB_REL] ?? '');
            return refresh.includes("reply.permissions.filter(row => row.stored !== 'default')")
                ? null : 'the tab-side icon refresh no longer keys on row.stored';
        }],
        ['the permission glyph map is keyed by PERMISSION_IDS', () => {
            const keys = deriveGlyphKeys(srcs[SITE_PANEL_REL]);
            if (keys.length === 0) {
                return `no permission glyph map in ${SITE_PANEL_REL} -- broken instrument`;
            }
            return sameSet(keys, m.PERMISSION_IDS) ? null : { glyphs: sorted(keys), table: sorted(m.PERMISSION_IDS) };
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
            // The phase plan's own check: `startsWith('https://')`
            // appears nowhere in address-bar.tsx. Applied to the raw text,
            // comments included, so no prose in the file can carry it.
            const hits = [...addressBarSrc.matchAll(/startsWith\(\s*['"]https:\/\/['"]\s*\)/g)].map(m => m[0]);
            return hits.length === 0 ? null : hits;
        }],
        ['shield count counts blocked origins only (upstream blocking bits, behaviour-checked)', () => {
            const body = deriveMethodSource(apiSrc, 'webTabBlockedTrackerCount');
            if (!body) {
                return `no webTabBlockedTrackerCount(browser) method in ${API_REL} -- broken instrument`;
            }
            const flags = deriveWebProgressStates(srcs[UPSTREAM_IDL_REL]);
            const named = ['STATE_LOADED_LEVEL_1_TRACKING_CONTENT', 'STATE_LOADED_LEVEL_2_TRACKING_CONTENT', 'STATE_ALLOWED_TRACKING_CONTENT',
                'STATE_BLOCKED_TRACKING_CONTENT', 'STATE_BLOCKED_FINGERPRINTING_CONTENT'];
            const absent = flags ? named.filter(name => !(name in flags)) : named;
            if (absent.length) {
                return `${UPSTREAM_IDL_REL} does not define ${absent.join(', ')} -- broken instrument`;
            }
            const f = name => flags[name];
            // Four origins: two loaded or allowed only (never counted), two with a blocking bit.
            const log = {
                'loaded.test': [[f('STATE_LOADED_LEVEL_1_TRACKING_CONTENT'), false]],
                'allowed.test': [[f('STATE_ALLOWED_TRACKING_CONTENT'), false]],
                'blocked.test': [[f('STATE_BLOCKED_TRACKING_CONTENT'), true]],
                'mixed.test': [[f('STATE_LOADED_LEVEL_2_TRACKING_CONTENT'), false], [f('STATE_BLOCKED_FINGERPRINTING_CONTENT'), true]],
            };
            let got;
            try {
                const count = new Function('Ci', `return ({ ${body} }).webTabBlockedTrackerCount;`)({ nsIWebProgressListener: flags });
                got = count({ getContentBlockingLog: () => JSON.stringify(log) });
            } catch (error) {
                return `threw ${error.message}`;
            }
            return got === 2 ? null : { counted: got, want: 2 };
        }],
        ['shield count resets only on a top-level, non-same-document location change', () => {
            const code = stripComments(apiSrc);
            if (!code.includes('LOCATION_CHANGE_SAME_DOCUMENT')) {
                return `the same-document flag is gone from ${API_REL} -- broken instrument`;
            }
            return /if \(!sameDocument\) \{\s*entry\.blockedTrackers = 0;\s*\}/.test(code)
                ? null : 'the blockedTrackers reset is not guarded by !sameDocument';
        }],
        ['panel header copy equals the UI-SPEC rows, and the identity box names the panel', () => {
            const specSecure = deriveSpecCopy(srcs[UI_SPEC_REL], 'Site panel header (secure)');
            const specInsecure = deriveSpecCopy(srcs[UI_SPEC_REL], 'Site panel header (insecure)');
            if (!specSecure || !specInsecure) {
                return `the UI-SPEC site-panel header rows derived nothing in ${UI_SPEC_REL} -- broken instrument`;
            }
            const drift = {};
            const treeSecure = deriveCopyLiteral(srcs[COPY_REL], 'siteConnectionSecure');
            const treeInsecure = deriveCopyLiteral(srcs[COPY_REL], 'siteConnectionInsecure');
            if (treeSecure !== specSecure) {
                drift.secure = { tree: treeSecure, spec: specSecure };
            }
            if (treeInsecure !== specInsecure) {
                drift.insecure = { tree: treeInsecure, spec: specInsecure };
            }
            if (Object.keys(drift).length) {
                return drift;
            }
            // Plan 02 moved the panel into site-panel.tsx; the header copy keys live there.
            const panelCode = stripComments(srcs[SITE_PANEL_REL] ?? '');
            if (!/CHROME_BAR_COPY\.siteConnectionSecure\b/.test(panelCode) || !/CHROME_BAR_COPY\.siteConnectionInsecure\b/.test(panelCode)) {
                return `the site panel header no longer renders the copy keys in ${SITE_PANEL_REL}`;
            }
            const code = stripComments(addressBarSrc);
            if (!/const label = CHROME_BAR_COPY\.sitePanelOpen\(/.test(code) || !/aria-label=\{label\}/.test(code)) {
                return 'the identity box aria-label is not CHROME_BAR_COPY.sitePanelOpen(host) (UI-SPEC identity box)';
            }
            return null;
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
            const missing = deriveCodicons({ [ADDRESS_BAR_REL]: addressBarSrc, [CSS_REL]: srcs[CSS_REL], [SITE_PANEL_REL]: srcs[SITE_PANEL_REL] ?? '' }).filter(n => !sheet.has(n));
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
const SOURCES = [TABLE_REL, API_REL, WEB_TAB_REL, ADDRESS_BAR_REL, COPY_REL, CSS_REL, SITE_PANEL_REL, UPSTREAM_PERMS_REL, UPSTREAM_IDL_REL, UI_SPEC_REL, CODICON_REL, INTERNAL_APIS_REL];
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
        name: 'origin-write: a data.origin write added',
        rel: API_REL,
        from: 'return { ok: true, kind, where: "done", ...(await PowerBrowserAPI.webTabSiteInfo(entry.browser)) };',
        to: 'const origin = data.origin;\n      return { ok: true, kind, where: "done", ...(await PowerBrowserAPI.webTabSiteInfo(entry.browser)) };',
        expect: 'no sender-supplied origin reaches a site write',
    },
    {
        name: 'hand-labels: a permission label map added to the panel',
        rel: SITE_PANEL_REL,
        from: 'export const PERMISSION_GLYPH_CLASS',
        to: "export const PERMISSION_LABELS: Readonly<Record<string, { label: string }>> = Object.freeze({ camera: { label: 'Camera' } });\n\nexport const PERMISSION_GLYPH_CLASS",
        expect: 'no hand-kept permission label map',
    },
    {
        name: 'glyph-drift: a permission glyph keyed by an invented ID',
        rel: SITE_PANEL_REL,
        from: "    popup: 'codicon-window',",
        to: "    popups: 'codicon-window',",
        expect: 'the permission glyph map is keyed by PERMISSION_IDS',
    },
    {
        name: 'icons-on-effective-state: the push keys its icons on the effective state',
        rel: API_REL,
        from: 'const shown = webTabPermissionRows(browser).filter(row => row.stored !== "default");',
        to: 'const shown = webTabPermissionRows(browser).filter(row => row.state !== "default");',
        expect: 'rows show the effective state; the cycle and the identity-box icons key on the stored state',
    },
    {
        name: 'write-state-drift: the write arm accepts a state the panel never shows',
        rel: API_REL,
        from: 'if (state === "block-all") {',
        to: 'if (state === "block-everything") {',
        expect: 'the write arm accepts exactly the panel states',
    },
    {
        name: 'origin-compare: the origin echo compare dropped',
        rel: API_REL,
        from: 'principal.origin !== data.origin',
        to: 'false',
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
        name: 'invented-id: a PERMISSION_IDS entry renamed to location',
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
    {
        name: 'a font-family literal added',
        rel: CSS_REL,
        from: '.pb-site-panel-close {',
        to: '.pb-site-panel-close {\n    font-family: serif;',
        expect: 'no hex colour outside the token file, and no font-family literal',
    },
    {
        name: 'a loaded state counted as blocked',
        rel: API_REL,
        from: '(pair[0] & blocked) !== 0',
        to: '(pair[0] & (blocked | Ci.nsIWebProgressListener.STATE_LOADED_LEVEL_1_TRACKING_CONTENT)) !== 0',
        expect: 'shield count counts blocked origins only',
    },
    {
        name: 'an allowed state counted as blocked',
        rel: API_REL,
        from: '(pair[0] & blocked) !== 0',
        to: '(pair[0] & (blocked | Ci.nsIWebProgressListener.STATE_ALLOWED_TRACKING_CONTENT)) !== 0',
        expect: 'shield count counts blocked origins only',
    },
    {
        name: 'every logged origin counted again',
        rel: API_REL,
        from: 'return Object.values(parsed).filter(actions => Array.isArray(actions) && actions.some(pair => Array.isArray(pair) && (pair[0] & blocked) !== 0)).length;',
        to: 'return Object.keys(parsed).length;',
        expect: 'shield count counts blocked origins only',
    },
    {
        name: 'the shield reset moved out of the same-document guard',
        rel: API_REL,
        from: '        if (!sameDocument) {\n          entry.blockedTrackers = 0;\n        }\n',
        to: '        entry.blockedTrackers = 0;\n',
        expect: 'shield count resets only on a top-level, non-same-document location change',
    },
    {
        name: 'the connection copy drifted from the UI-SPEC row',
        rel: COPY_REL,
        from: "siteConnectionSecure: 'Connection secure',",
        to: "siteConnectionSecure: 'Secure connection',",
        expect: 'panel header copy equals the UI-SPEC rows',
    },
    {
        name: 'the identity box label is not the panel-open copy',
        rel: ADDRESS_BAR_REL,
        from: 'const label = CHROME_BAR_COPY.sitePanelOpen(this.identityHostText(identity));',
        to: 'const label = CHROME_BAR_COPY.identityLocalLabel(this.identityHostText(identity));',
        expect: 'panel header copy equals the UI-SPEC rows',
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
