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
 *  15. (plan 03, SITE-07) the clear keeps the token cookie by name and host
 *      (TOKEN_COOKIE_NAME, agreeing with the token gate), has no modal prompt,
 *      no SiteDataManager.remove or Sanitizer.sanitize, and subtracts CLEAR_COOKIES;
 *  16. (plan 03, SITE-08) the shield exception is written on entry.browser only,
 *      and the box shield follows the reply and the pushed exception;
 * 17. (plan 04, MENU-01) the stock pages in the openStockPage switch
 *      (`openStockPageFromMenu`) equal STOCK_PAGES, with a positive control on the arm;
 * 18. (plan 04) the app menu's order and separator groups equal the UI-SPEC
 *      "Hamburger entries" sentence, read from the copy row (derived: each
 *      phase row's label is found in the sentence, in table order, and a
 *      `separator` falls between two rows exactly when their groups differ);
 * 19. (plan 04) the rendered menu (the builder run in Node) equals the table rows
 *      of this phase: order, separator groups and enablement; a MENU-03 slot is absent;
 * 20. (plan 04) the wired rows are the rows the tree acts on: new-tab (the registered
 *      command), the stock pages (STOCK_PAGES, sent by name), and quit only once
 *      `quitRequest` exists (plan 05);
 * 21. (plan 04) every rendered row has a label in the widget switch, from CHROME_BAR_COPY;
 * 22. (plan 04, D-31-07) stock pages open by name only: no `about:` URL, `window.open(`,
 *      `openStockTab(` or `webTabOpen(` in the site-identity sources, with the widget's
 *      `this.store.openStockPage(page)` as the positive control;
 *  13. (plan 02) no hand-kept permission label map in the site-identity
 *      sources (labels come from `getPermissionLabel`), and the permission
 *      glyph map is keyed by PERMISSION_IDS;
 *  14. (plan 02, review fix) the write arm's only sender-origin use is the
 *      echo compare against the overlay's own principal origin.
 *
 * Each case prints `ok <case>`; the run ends `verify-site-identity: PASS`
 * or one `verify-site-identity: FAIL -- <case>: <got>` line per red case.
 *
 * --self-test: the clean tree must be green; then fifty planted faults
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
 * connection copy drifted, and the identity box label changed; plan 03 adds the
 * token cookie removed by the clear, a token name that drifts from the token
 * gate, the window-modal prompt, CLEAR_COOKIES left in the storage flags, the
 * shield exception written on another tab, and the shield reply not refreshing
 * the box.
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
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const UPSTREAM_CERT_VALIDITY_REL = 'upstream/security/manager/ssl/nsIX509CertValidity.idl';
const UI_SPEC_REL = '.planning/phases/31-site-identity-permissions-and-app-menu/31-UI-SPEC.md';
const INTERNAL_APIS_REL = 'powerbrowser/INTERNAL-APIS.md';
const CODICON_REL = 'theia/node_modules/@vscode/codicons/dist/codicon.css';
const TOKEN_GATE_REL = 'theia/extensions/token-gate/src/node/token-gate-backend-contribution.ts';
const APP_MENU_REL = 'theia/extensions/chrome-bar/src/browser/site-identity/app-menu.ts';
const WIDGET_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx';
const CMD_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts';
const STORE_CLIENT_REL = 'theia/extensions/tab-uris/src/browser/chrome-store-client.ts';
const EXPORTS = ['SECURITY_STATES', 'PERMISSION_IDS', 'STOCK_PAGES', 'MENU_ORDER', 'MENU_PHASE', 'PERMISSION_STATES', 'AUTOPLAY_PERMISSION_STATES', 'permissionOrder', 'nextPermissionState'];
/** Plan 04: the menu builder's exports, imported beside the table (app-menu.ts is import-free too). */
const MENU_EXPORTS = ['APP_MENU_ID', 'WIRED_MENU_IDS', 'applyMenuOrder', 'buildAppMenu'];

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

/** The UI-SPEC "Hamburger entries" copy-row cell (the Firefox-order sentence); null when the row is gone. */
function deriveSpecHamburgerCell(uiSpecSrc) {
    const row = (uiSpecSrc ?? '').split('\n').find(line => line.startsWith('| Hamburger entries |'));
    return row ? row.split('|')[2] ?? null : null;
}

/** A CHROME_BAR_COPY value by key: a plain literal, or a template whose one interpolation reads as {App}. */
function deriveCopyValue(copySrc, key) {
    const plain = new RegExp(`^\\s*${key}: '([^']*)',`, 'm').exec(copySrc ?? '');
    if (plain) {
        return plain[1];
    }
    const template = new RegExp(`^\\s*${key}: \\([^)]*\\) => \`([^\`]*)\`,`, 'm').exec(copySrc ?? '');
    return template ? template[1].replace(/\$\{[^}]+\}/g, '{App}') : null;
}

/** Row id -> its label, from the widget's appMenuLabel switch and CHROME_BAR_COPY; null when the switch is gone. */
function deriveRowLabels(widgetSrc, copySrc) {
    const fn = /function appMenuLabel\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(stripComments(widgetSrc ?? ''));
    if (!fn) {
        return null;
    }
    const out = new Map();
    for (const m of fn[1].matchAll(/case '([a-z-]+)': return CHROME_BAR_COPY\.([A-Za-z]+)/g)) {
        const label = deriveCopyValue(copySrc, m[2]);
        if (label !== null) {
            out.set(m[1], label);
        }
    }
    return out.size ? out : null;
}

/** The separator token in a drawn or wanted menu sequence. */
const SEPARATOR = '|';

/**
 * What Theia draws for a root menu, in order (@theia/core browser-menu-plugin.js createItems): a
 * group node draws a separator before it, unless one already precedes it, and one after it; the
 * trailing separators are dropped. A leaf at the root draws its own item. Ids are returned without
 * the menu prefix.
 */
function drawnSequence(menu, prefix) {
    const out = [];
    for (const node of menu.children) {
        if (Array.isArray(node.children)) {
            const items = node.children.map(leaf => leaf.id.slice(prefix.length));
            if (items.length) {
                if (out[out.length - 1] !== SEPARATOR) {
                    out.push(SEPARATOR);
                }
                out.push(...items);
                out.push(SEPARATOR);
            }
        } else {
            out.push(node.id.slice(prefix.length));
        }
    }
    while (out[out.length - 1] === SEPARATOR) {
        out.pop();
    }
    return out;
}

/** The sequence this phase's table wants: its rows in order, a separator where the group changes. */
function wantSequence(rows) {
    const out = [];
    rows.forEach((row, i) => {
        if (i > 0 && rows[i - 1].group !== row.group) {
            out.push(SEPARATOR);
        }
        out.push(row.menuId);
    });
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
function cases(m, srcs, mm) {
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
        ['a user-overridden certificate stays out of the secure arm (CR-01)', () => {
            // The bit is read from upstream's IDL, so the name is not a hand-kept value.
            const bit = deriveWebProgressStates(srcs[UPSTREAM_IDL_REL])?.STATE_CERT_USER_OVERRIDDEN;
            if (!bit) {
                return `no STATE_CERT_USER_OVERRIDDEN in ${UPSTREAM_IDL_REL} -- broken instrument`;
            }
            const code = stripComments(apiSrc);
            const read = /const overridden = !!\(state & wpl\.STATE_CERT_USER_OVERRIDDEN\);/.test(code);
            const arm = /if \(isSecure && !isBroken && !isInsecure && !overridden\) \{\s*securityState = "secure";/.test(code);
            return read && arm ? null : `the secure arm does not exclude STATE_CERT_USER_OVERRIDDEN (${bit}); upstream browser-siteIdentity.js:827,878,939-946`;
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
            // Phase 31 plan 03: every privileged write arm takes the same echo, and
            // nothing else. One compare per write arm (permission, clear, shield),
            // and no other use of the sender's origin anywhere in the file.
            const writeArms = ['webTabSetPermission', 'webTabClearSiteData', 'webTabShieldToggle'];
            const missingArms = writeArms.filter(name => !code.includes(`case "${name}"`));
            if (missingArms.length) {
                return `the write arm(s) ${missingArms.join(', ')} are gone from ${API_REL} -- broken instrument or a write without the echo`;
            }
            // The type guard (`typeof data.origin !== "string"`) is a validation read, not a use.
            const uses = [...code.replace(/typeof data\.origin !== "string"/g, '').matchAll(/data\.origin/g)].map(x => x[0]);
            const compares = code.split(compare).length - 1;
            return uses.length === writeArms.length && compares === writeArms.length
                ? null : { senderOriginUses: uses.length, echoCompares: compares, want: 'one echo compare per write arm, nothing else' };
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
        // Phase 31 plan 04 (MENU-01/02): the hamburger. The builder runs in Node (app-menu.ts is import-free),
        // so the drawn menu is checked, not a copy of it. Case 5's name is kept: the rendered-ids case.
        ['MENU_ORDER ids equal the rendered hamburger menuIds (the builder run in Node, the phase rows only)', () => {
            const rows = m.MENU_ORDER.filter(entry => entry.minPhase <= m.MENU_PHASE);
            const menu = mm.buildAppMenu(m.MENU_ORDER, mm.WIRED_MENU_IDS, m.MENU_PHASE, { label: id => id, run: () => undefined });
            const drawn = drawnSequence(menu, `${mm.APP_MENU_ID}.`).filter(id => id !== SEPARATOR);
            const want = rows.map(row => row.menuId);
            return JSON.stringify(drawn) === JSON.stringify(want) ? null : { drawn, want };
        }],
        ['the rendered app menu equals the table rows of this phase (order, separators, enablement)', () => {
            const rows = m.MENU_ORDER.filter(entry => entry.minPhase <= m.MENU_PHASE);
            const menu = mm.buildAppMenu(m.MENU_ORDER, mm.WIRED_MENU_IDS, m.MENU_PHASE, { label: id => id, run: () => undefined });
            const prefix = `${mm.APP_MENU_ID}.`;
            const drawn = drawnSequence(menu, prefix);
            const want = wantSequence(rows);
            if (JSON.stringify(drawn) !== JSON.stringify(want)) {
                return { drawn: drawn.join(' '), want: want.join(' ') };
            }
            const leaves = [...menu.children.filter(node => !Array.isArray(node.children)), ...menu.children.flatMap(node => (Array.isArray(node.children) ? node.children : []))];
            const enabled = leaves.map(leaf => leaf.isEnabled());
            const wantEnabled = leaves.map(leaf => mm.WIRED_MENU_IDS.includes(leaf.id.slice(prefix.length)));
            return JSON.stringify(enabled) === JSON.stringify(wantEnabled) ? null : { enabled, wantEnabled };
        }],
        ['the app menu order and separators match the UI-SPEC hamburger entries (derived)', () => {
            const cell = deriveSpecHamburgerCell(srcs[UI_SPEC_REL]);
            if (!cell) {
                return `no "Hamburger entries" row in ${UI_SPEC_REL} -- broken instrument`;
            }
            const labels = deriveRowLabels(srcs[WIDGET_REL], srcs[COPY_REL]);
            if (!labels) {
                return `no appMenuLabel switch in ${WIDGET_REL} -- broken instrument`;
            }
            const rows = m.MENU_ORDER.filter(entry => entry.minPhase <= m.MENU_PHASE);
            const unlabelled = rows.filter(row => !labels.has(row.menuId)).map(row => row.menuId);
            if (unlabelled.length) {
                return { unlabelled };
            }
            // The UI-SPEC names a shortcut as a badge ("`Quit {App}` with `Ctrl+Q` badge"), so a row label's
            // trailing " (<keys>)" is compared as that badge, and the row's name is what the sentence must carry.
            const specBadge = /`(Ctrl\+[A-Z])` badge/.exec(cell)?.[1] ?? null;
            const quitLabel = labels.get('quit') ?? '';
            if (specBadge !== null && !quitLabel.endsWith(` (${specBadge})`)) {
                return { badge: `the Quit row label ${JSON.stringify(quitLabel)} lacks the UI-SPEC badge (${specBadge})` };
            }
            const nameOf = label => label.replace(/ \(Ctrl\+[A-Z]\)$/, '');
            const at = rows.map(row => cell.indexOf(`\`${nameOf(labels.get(row.menuId))}\``));
            const absent = rows.filter((_, i) => at[i] < 0).map(row => labels.get(row.menuId));
            if (absent.length) {
                return { absentFromUiSpec: absent };
            }
            const ordered = at.every((pos, i) => i === 0 || pos > at[i - 1]);
            if (!ordered) {
                return { order: rows.map(row => row.menuId), uiSpecPositions: at };
            }
            const separatorsAgree = rows.slice(1).every((row, i) => cell.slice(at[i], at[i + 1]).includes('separator') === (row.group !== rows[i].group));
            return separatorsAgree ? null : { separators: 'a separator falls where the table groups differ from the UI-SPEC sentence, or misses where they do not' };
        }],
        ['every rendered row has a label (derived from the widget switch and CHROME_BAR_COPY)', () => {
            const labels = deriveRowLabels(srcs[WIDGET_REL], srcs[COPY_REL]);
            if (!labels) {
                return `no appMenuLabel switch in ${WIDGET_REL} -- broken instrument`;
            }
            const rows = m.MENU_ORDER.filter(entry => entry.minPhase <= m.MENU_PHASE).map(entry => entry.menuId);
            const missing = rows.filter(id => !labels.has(id));
            const surplus = [...labels.keys()].filter(id => !rows.includes(id));
            return missing.length || surplus.length ? { missing, surplus } : null;
        }],
        ['the wired rows are the rows this tree acts on (new-tab command, stock pages, quit once quitRequest exists)', () => {
            const widget = stripComments(srcs[WIDGET_REL] ?? '');
            const commands = stripComments(srcs[CMD_REL] ?? '');
            const newTab = /commands\.registerCommand\(CHROME_BAR_NEW_TAB,/.test(commands) && widget.includes('this.runCommand(CHROME_BAR_NEW_TAB_COMMAND_ID)');
            const stockSent = widget.includes('this.store.openStockPage(');
            const quit = /\bquitRequest\(/.test(stripComments(srcs[STORE_CLIENT_REL] ?? ''));
            const expected = m.MENU_ORDER.filter(entry => entry.minPhase <= m.MENU_PHASE).filter(row => {
                if (row.menuId === 'new-tab') {
                    return newTab;
                }
                if (row.menuId === 'quit') {
                    return quit;
                }
                return !!row.stockPage && m.STOCK_PAGES.includes(row.stockPage) && stockSent;
            }).map(row => row.menuId);
            return sameSet(expected, mm.WIRED_MENU_IDS) ? null : { expected: sorted(expected), wired: sorted(mm.WIRED_MENU_IDS) };
        }],
        ['the Quit row sends quitRequest from its own handler (the widget arm and the client method, no other quit)', () => {
            const widget = stripComments(srcs[WIDGET_REL] ?? '');
            const armed = /row\.menuId === 'quit'\)\s*\{\s*void this\.quitApplicationRow\(\);/.test(widget);
            const sends = /protected async quitApplicationRow\(\)[\s\S]{0,200}?await this\.store\.quitRequest\(\);/.test(widget);
            return armed && sends ? null : { armed, sends };
        }],
        ['one quit path: Services.startup.quit is spelled only by the boundary (PowerBrowserAPI.sys.mjs), in the tree', () => {
            const hits = Object.entries(srcs)
                .filter(([rel, text]) => rel !== API_REL && /\.(m?js|tsx?|xhtml)$/.test(rel) && /Services\.startup\.quit\b|eAttemptQuit|eForceQuit/.test(stripComments(text)))
                .map(([rel]) => rel);
            return hits.length === 0 ? null : { spellers: hits };
        }],
        ['STOCK_PAGES equal the openStockPage switch arms (positive control: the switch stands)', () => {
            const fn = /async function openStockPageFromMenu\(page\) \{([\s\S]*?)\n\}\n/.exec(apiSrc);
            if (!fn) {
                return `no openStockPageFromMenu in ${API_REL} -- broken instrument`;
            }
            const arms = [...stripComments(fn[1]).matchAll(/case "([a-z]+)":/g)].map(x => x[1]);
            return sameSet(arms, m.STOCK_PAGES) ? null : { arms: sorted(arms), table: sorted(m.STOCK_PAGES) };
        }],
        ['stock pages open by name only: no URL, window.open or openStockTab in site-identity/ (positive control: the store call stands)', () => {
            if (!stripComments(srcs[WIDGET_REL] ?? '').includes('this.store.openStockPage(page)')) {
                return `the widget no longer sends the stock page by name (this.store.openStockPage(page)) in ${WIDGET_REL} -- broken instrument or a URL path`;
            }
            const hits = [TABLE_REL, APP_MENU_REL, SITE_PANEL_REL].flatMap(rel =>
                [...stripComments(srcs[rel] ?? '').matchAll(/about:[a-z]+|window\.open\s*\(|openStockTab\(|webTabOpen\(/g)].map(x => `${rel}: ${x[0]}`));
            return hits.length === 0 ? null : hits;
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
        // Phase 31 plan 03 (SITE-07, D-31-12, T-31-03): the clear arm's exemption.
        ['the clear keeps the token cookie by name and host (derived from TOKEN_COOKIE_NAME, agreeing with the token gate)', () => {
            const code = stripComments(apiSrc);
            const literal = /\nconst TOKEN_COOKIE_NAME = "([^"]+)";/.exec(apiSrc)?.[1];
            if (!literal) {
                return `no TOKEN_COOKIE_NAME literal in ${API_REL} -- broken instrument`;
            }
            const gate = /export const POWERBROWSER_TOKEN_COOKIE_NAME = '([^']+)'/.exec(srcs[TOKEN_GATE_REL] ?? '')?.[1];
            if (!gate) {
                return `no POWERBROWSER_TOKEN_COOKIE_NAME in ${TOKEN_GATE_REL} -- broken instrument`;
            }
            if (gate !== literal) {
                return { boundary: literal, tokenGate: gate, want: 'the same name' };
            }
            const exempt = /function webTabTokenCookie\(cookie\) \{\s*return cookie\.name === TOKEN_COOKIE_NAME && cookie\.host === TOKEN_COOKIE_HOST;\s*\}/;
            if (!exempt.test(code)) {
                return 'the token exemption is not "cookie.name === TOKEN_COOKIE_NAME && cookie.host === TOKEN_COOKIE_HOST" (the clear would not keep the token)';
            }
            const clear = code.indexOf('async function webTabClearSiteData(');
            if (clear < 0) {
                return `no webTabClearSiteData in ${API_REL} -- broken instrument`;
            }
            const next = code.indexOf('\nasync function ', clear + 1);
            const body = code.slice(clear, next < 0 ? undefined : next);
            if (!body.includes('if (!webTabTokenCookie(cookie)) {')) {
                return 'the per-cookie removal is not guarded by webTabTokenCookie -- the token would be removed';
            }
            const removes = [...code.matchAll(/Services\.cookies\.remove\(/g)].length;
            return removes === 1 && body.includes('Services.cookies.remove(') ? null : { cookieRemoveCalls: removes, want: 'one, in the clear helper loop' };
        }],
        ['no modal site-data prompt and no SiteDataManager.remove or Sanitizer.sanitize in the clear path', () => {
            const code = stripComments(apiSrc);
            if (!code.includes('Services.clearData.deleteDataFromSite(schemeless, attrs, true, flags, resolve)')) {
                return 'the storage clear is not Services.clearData.deleteDataFromSite(schemeless, attrs, true, flags, resolve) -- broken instrument or a different clear';
            }
            const forbidden = ['promptSiteDataRemoval', 'SiteDataManager.remove(', 'Sanitizer.sanitize('].filter(name => apiSrc.includes(name) && code.includes(name));
            return forbidden.length === 0 ? null : forbidden;
        }],
        ['the cookie and storage clears share the registrable-domain scope (CR-03)', () => {
            // Both halves take their scope from one variable, derived from the page's host by
            // the registrable-domain rule (upstream browser-siteIdentity.js:473-475).
            const code = stripComments(apiSrc);
            const fn = /async function webTabClearSiteData\(browser, principal\) \{([\s\S]*?)\n\}\n/.exec(code)?.[1];
            if (!fn) {
                return `no webTabClearSiteData body in ${API_REL} -- broken instrument`;
            }
            const siteFn = /function webTabSite\(principal\) \{\s*return lazy\.SiteDataManager\.getBaseDomainFromHost\(principal\.asciiHost\);\s*\}/.test(code);
            const sited = fn.includes('const site = webTabSite(principal);');
            const cookieReads = [...fn.matchAll(/getCookiesFromHost\(([^,]+),/g)].map(m => m[1].trim());
            const storage = fn.includes('const schemeless = Services.eTLD.getSchemelessSiteFromHost(site);') && fn.includes('deleteDataFromSite(schemeless,');
            if (!siteFn || !sited || !storage || cookieReads.length !== 2 || cookieReads.some(arg => arg !== 'site')) {
                return { webTabSite: siteFn, siteVariable: sited, storageScope: storage, cookieReads, want: 'both cookie reads and the storage clear on site' };
            }
            return null;
        }],
        ['the storage clear excludes cookies (CLEAR_COOKIES subtracted from the site-data group)', () => {
            const code = stripComments(apiSrc);
            return code.includes('const flags = Ci.nsIClearDataService.CLEAR_COOKIES_AND_SITE_DATA & ~Ci.nsIClearDataService.CLEAR_COOKIES;')
                ? null : 'the storage clear flags do not subtract CLEAR_COOKIES';
        }],
        // Phase 31 plan 03 (SITE-08, D-31-06, T-31-04): the shield exception is browser-scoped to the tab the panel showed.
        ['the shield exception is written on the overlay the panel showed only (wrong site)', () => {
            const code = stripComments(apiSrc);
            const add = 'lazy.ContentBlockingAllowList.add(entry.browser);';
            const remove = 'lazy.ContentBlockingAllowList.remove(entry.browser);';
            if (!code.includes(add) || !code.includes(remove)) {
                return `the shield arm no longer applies the exception to its own entry.browser (${add} / ${remove}) -- a write could land on another site`;
            }
            const calls = [...code.matchAll(/ContentBlockingAllowList\.(add|remove)\(([^)]*)\)/g)].map(m => m[2]);
            return calls.every(arg => arg === 'entry.browser') && calls.length === 2
                ? null : { calls, want: 'two calls, both on entry.browser' };
        }],
        ['the box shield follows the shield reply and the pushed exception (web tab side)', () => {
            const web = stripComments(srcs[WEB_TAB_REL] ?? '');
            if (!web.includes('this.refreshShield(reply as WebTabShieldReply);') || !web.includes('this.shieldExcepted = reply.excepted;')) {
                return `the shield reply no longer refreshes the identity box in ${WEB_TAB_REL}`;
            }
            const push = /shieldExcepted: webTabShieldExcepted\(browser\)/.test(stripComments(apiSrc));
            return push ? null : 'the state push no longer carries shieldExcepted (the identity box would not learn of an exception with url)';
        }],
        ['the state router forwards every pushed field (CR-02, O-31-A)', () => {
            // The pushed field names are read from chrome's sendAsyncMessage literal,
            // the forwarded ones from the router's applyState literal; both sides derived.
            // Anchored on kind: "state", the page push (webTabPush); the flushShellState send is another literal.
            const push = /sendAsyncMessage\("PowerBrowserWebTabState", \{\s*kind: "state",([\s\S]*?)\n\s*\}\);/.exec(stripComments(apiSrc));
            const router = /widget\.applyState\(\{([\s\S]*?)\n\s*\}\);/.exec(stripComments(srcs[WEB_TAB_REL] ?? ''));
            if (!push || !router) {
                return `no PowerBrowserWebTabState push literal in ${API_REL} or no widget.applyState literal in ${WEB_TAB_REL} -- broken instrument`;
            }
            const keys = body => [...body.matchAll(/^\s+(\w+):/gm)].map(m => m[1]);
            const pushed = keys(push[1]).filter(k => k !== 'kind' && k !== 'tabId');
            const routed = keys(router[1]);
            return sameSet(pushed, routed) ? null : { pushed: sorted(pushed), routed: sorted(routed), dropped: sorted(pushed.filter(k => !routed.includes(k))) };
        }],
        ['the web-tab action arms log no err.message (O-31-B)', () => {
            // The handler body is cut at its closing brace (a column-0 `}` line), never by a name.
            const code = stripComments(apiSrc);
            const start = code.indexOf('async function handleWebTabAction(');
            if (start < 0) {
                return `no handleWebTabAction in ${API_REL} -- broken instrument`;
            }
            const end = code.indexOf('\n}\n', start);
            const body = code.slice(start, end < 0 ? undefined : end);
            const leaks = body.split('\n').filter(line => /\.log\(/.test(line) && /err\.message/.test(line));
            return leaks.length === 0 ? null : leaks.map(line => line.trim());
        }],
        ['the tab-store purge runs in its own try after a cleared clear (WR-06)', () => {
            const code = stripComments(apiSrc);
            const own = /const outcome = await webTabClearSiteData\(entry\.browser, principal\);[\s\S]*?try \{\s*await purgeSiteTabRows\(webTabSite\(principal\)\);\s*\} catch \(err\) \{/.test(code);
            return own ? null : 'the purge is not in its own try after the clear outcome: a tab-store failure would report the cleared clear as write-failed';
        }],
        ['the stock-window startup poll uses the module sleep, not a window timer (WR-07)', () => {
            const code = stripComments(apiSrc);
            const start = code.indexOf('async function stockWindowStarted(win) {');
            if (start < 0) {
                return `no stockWindowStarted in ${API_REL} -- broken instrument`;
            }
            const end = code.indexOf('\n}\n', start);
            const body = code.slice(start, end < 0 ? undefined : end);
            if (/win\.setTimeout/.test(body)) {
                return 'the poll waits on win.setTimeout, which never fires once the stock window is destroyed (the openStockPage reply would hang)';
            }
            return body.includes('await PowerBrowserAPI.sleep(') ? null : 'the poll does not wait on the module sleep()';
        }],
        ['webTabSiteInfo captures the origin before its await and refuses a page change (WR-01)', () => {
            const code = stripComments(apiSrc);
            const start = code.indexOf('  async webTabSiteInfo(browser) {');
            if (start < 0) {
                return `no webTabSiteInfo in ${API_REL} -- broken instrument`;
            }
            const end = code.indexOf('\n  },\n', start);
            const body = code.slice(start, end < 0 ? undefined : end);
            const await_ = body.indexOf('await lazy.SiteDataManager.hasSiteData(host)');
            const captured = body.indexOf('const origin = webTabPermissionOrigin(browser);');
            const refusal = body.indexOf('if (webTabPermissionOrigin(browser) !== origin) {');
            const refuses = refusal > await_ && /return \{ where: "site-changed" \};/.test(body.slice(refusal, refusal + 160));
            const replyUsesCaptured = /\n\s+origin,\n/.test(body);
            return await_ > 0 && captured >= 0 && captured < await_ && refuses && replyUsesCaptured
                ? null
                : { awaitAt: await_, capturedAt: captured, refusesAfterAwait: refuses, replyUsesCapturedOrigin: replyUsesCaptured };
        }],
        ['the identity host is the displaySpec as it is, a port stripped only from the fallback (WR-02)', () => {
            const src = stripComments(addressBarSrc ?? '');
            const start = src.indexOf('protected identityHostText(');
            if (start < 0) {
                return `no identityHostText in ${ADDRESS_BAR_REL} -- broken instrument`;
            }
            const end = src.indexOf('\n    }\n', start);
            const body = src.slice(start, end < 0 ? undefined : end);
            const direct = /if \(identity\.displaySpec\) \{\s*return identity\.displaySpec;\s*\}/.test(body);
            const fallbackBrackets = /\(\\\[\[\^\\\]\]\+\\\]\|\[\^:\]\+\)\(\?::\\d\+\)\?\$/.test(body);
            return direct && fallbackBrackets ? null : { displaySpecReturnedAsIs: direct, ipv6AwareFallback: fallbackBrackets };
        }],
        ['the base domain is sent in display form, as displaySpec is (WR-08)', () => {
            const code = stripComments(apiSrc);
            return code.includes('baseDomain = Cc["@mozilla.org/network/idn-service;1"].getService(Ci.nsIIDNService).convertToDisplayIDN(baseDomain);')
                ? null : 'the pushed baseDomain is not converted with convertToDisplayIDN, so the highlight never matches a Unicode host';
        }],
        ['the certificate validity dates are formatted from PRTime, not read as strings (WR-03)', () => {
            const code = stripComments(apiSrc);
            const start = code.indexOf('  async webTabSiteInfo(browser) {');
            const end = start < 0 ? -1 : code.indexOf('\n  },\n', start);
            if (start < 0 || end < 0) {
                return `no webTabSiteInfo in ${API_REL} -- broken instrument`;
            }
            const body = code.slice(start, end);
            const stringGuard = /typeof validity\.notBefore === "string"/.test(body);
            const formatted = body.includes('validFrom = webTabCertDate(validity.notBefore);') && body.includes('validTo = webTabCertDate(validity.notAfter);');
            const idl = srcs[UPSTREAM_CERT_VALIDITY_REL] ?? '';
            const prTime = /readonly attribute PRTime notBefore;/.test(idl) && /readonly attribute PRTime notAfter;/.test(idl);
            if (!prTime) {
                return `nsIX509CertValidity.idl no longer declares notBefore/notAfter as PRTime -- broken instrument`;
            }
            return !stringGuard && formatted ? null : { stringGuard, formattedFromPRTime: formatted, want: 'webTabCertDate(validity.notBefore) and notAfter, no string guard' };
        }],
        ['no permission cycle step is dead, for every default the table names (WR-05)', () => {
            // Behaviour, not text: the order is derived by the table module, and every step is taken from it.
            const defaults = [...new Set([...m.PERMISSION_STATES, ...m.AUTOPLAY_PERMISSION_STATES])];
            for (const id of m.PERMISSION_IDS) {
                for (const d of defaults) {
                    const order = m.permissionOrder(id, d);
                    if (new Set(order).size !== order.length) {
                        return { id, defaultState: d, order, want: 'each effective state listed once' };
                    }
                    for (const cur of order) {
                        const target = m.nextPermissionState(id, cur, d);
                        const effective = target === 'default' ? d : target;
                        if (order.length > 1 && effective === cur) {
                            return { id, defaultState: d, from: cur, dead: target };
                        }
                        if (!order.includes(effective)) {
                            return { id, defaultState: d, from: cur, outside: effective };
                        }
                    }
                }
            }
            // The panel's click is the reply's effective state and the table's default, nothing stored on the client.
            const panel = stripComments(srcs[SITE_PANEL_REL] ?? '');
            const address = stripComments(addressBarSrc ?? '');
            const wired = panel.includes("nextPermissionState(row.id, row.state, row.defaultState ?? 'default')");
            const rowDefault = stripComments(apiSrc).includes('defaultState: webTabPermissionStateName(id, defaultCapability),');
            const noIntents = !/sitePanelIntents|intents=\{/.test(address) && !/intents\[/.test(panel);
            return wired && rowDefault && noIntents
                ? null
                : { panelUsesRowState: wired, chromeSendsDefaultState: rowDefault, clientIntentsGone: noIntents };
        }],
        ['a declined quit is reported as declined: the shutdown check follows the quit, the pref follows the check (WR-04)', () => {
            const code = stripComments(apiSrc);
            const start = code.indexOf('  quitApplication() {');
            const end = start < 0 ? -1 : code.indexOf('\n  },\n', start);
            if (start < 0 || end < 0) {
                return `no quitApplication in ${API_REL} -- broken instrument`;
            }
            const body = code.slice(start, end);
            const quit = body.indexOf('Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);');
            const check = body.indexOf('if (!Services.startup.shuttingDown) {');
            const pref = body.indexOf('setIntPref("toolkit.shutdown.fastShutdownStage", 0)');
            const declines = /if \(!Services\.startup\.shuttingDown\) \{\s*return false;/.test(body);
            return quit >= 0 && check > quit && pref > check && declines
                ? null
                : { quitAt: quit, checkAt: check, prefAt: pref, declinedReturnsFalse: declines };
        }],
        ['every new boundary internal keeps its catalogue row', () => catalogueFailures()],
    ];
}

/** Runs every case against the table at `tablePath` and the sources' text (by rel path). */
async function runAt(tablePath, srcs, menuPath) {
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
    let mm;
    try {
        mm = await import(pathToFileURL(menuPath).href);
    } catch (error) {
        return { oks: [], failures: [`import: the app menu module could not be loaded (${error.message})`] };
    }
    const missingMenu = MENU_EXPORTS.filter(name => mm[name] === undefined);
    if (missingMenu.length) {
        return { oks: [], failures: [`exports: the app menu module exports no ${missingMenu.join(', ')} -- broken instrument, nothing was tested`] };
    }
    const oks = [];
    const failures = [];
    for (const [name, run] of cases(m, srcs, mm)) {
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
const SOURCES = [TABLE_REL, API_REL, WEB_TAB_REL, ADDRESS_BAR_REL, COPY_REL, CSS_REL, SITE_PANEL_REL, UPSTREAM_PERMS_REL, UPSTREAM_IDL_REL, UPSTREAM_CERT_VALIDITY_REL, UI_SPEC_REL, CODICON_REL, INTERNAL_APIS_REL, TOKEN_GATE_REL, APP_MENU_REL, WIDGET_REL, CMD_REL, STORE_CLIENT_REL];
/**
 * Phase 31 plan 05 (MENU-04, D-31-13, T-31-06): every source that could spell a quit, read from the tree
 * at check time: powerbrowser/shell and each theia/extensions/<name>/src (never lib/ or node_modules).
 * The one-quit-path case below derives its answer from this map, so a second speller anywhere in the
 * tree goes red by name.
 */
const QUIT_SCAN_ROOTS = ['powerbrowser/shell', 'theia/extensions'];
function scanQuitFiles() {
    const out = {};
    for (const root of QUIT_SCAN_ROOTS) {
        for (const name of readdirSync(join(REPO_ROOT, root), { recursive: true })) {
            const rel = `${root}/${name}`;
            if (!/\.(m?js|tsx?|xhtml)$/.test(name) || /(^|\/)(node_modules|lib)\//.test(name)) {
                continue;
            }
            if (root === 'theia/extensions' && !/^[^/]+\/src\//.test(name)) {
                continue;
            }
            out[rel] = read(rel);
        }
    }
    return out;
}
const readSources = () => ({ ...Object.fromEntries(SOURCES.map(rel => [rel, read(rel)])), ...scanQuitFiles() });

async function main() {
    const { oks, failures } = await runAt(join(REPO_ROOT, TABLE_REL), readSources(), join(REPO_ROOT, APP_MENU_REL));
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
        name: 'the permission order lists a default-equal state twice (WR-05)',
        rel: TABLE_REL,
        from: '        if (!order.includes(effective)) {',
        to: '        if (true) {',
        expect: 'no permission cycle step is dead, for every default the table names (WR-05)',
    },
    {
        name: 'a declined quit is not checked (WR-04)',
        rel: API_REL,
        from: '    if (!Services.startup.shuttingDown) {\n      return false;\n    }\n',
        to: '',
        expect: 'a declined quit is reported as declined: the shutdown check follows the quit, the pref follows the check (WR-04)',
    },
    {
        name: 'the certificate dates are read as strings (WR-03)',
        rel: API_REL,
        from: 'validFrom = webTabCertDate(validity.notBefore);',
        to: 'validFrom = typeof validity.notBefore === "string" ? validity.notBefore : null;',
        expect: 'the certificate validity dates are formatted from PRTime, not read as strings (WR-03)',
    },
    {
        name: 'the identity host strips the port from the chrome displaySpec (WR-02)',
        rel: ADDRESS_BAR_REL,
        from: 'if (identity.displaySpec) {\n            return identity.displaySpec;',
        to: "if (identity.displaySpec) {\n            return identity.displaySpec.replace(/:\\d+$/, '');",
        expect: 'the identity host is the displaySpec as it is, a port stripped only from the fallback (WR-02)',
    },
    {
        name: 'the pushed base domain stays in punycode (WR-08)',
        rel: API_REL,
        from: '          if (typeof baseDomain === "string" && baseDomain) {\n            baseDomain = Cc["@mozilla.org/network/idn-service;1"].getService(Ci.nsIIDNService).convertToDisplayIDN(baseDomain);\n          }',
        to: '',
        expect: 'the base domain is sent in display form, as displaySpec is (WR-08)',
    },
    {
        name: 'the site info reads the origin after its await (WR-01)',
        rel: API_REL,
        from: '      origin,\n      securityState: identity.securityState,',
        to: '      origin: webTabPermissionOrigin(browser),\n      securityState: identity.securityState,',
        expect: 'webTabSiteInfo captures the origin before its await and refuses a page change (WR-01)',
    },
    {
        name: 'the stock-window poll waits on a window timer (WR-07)',
        rel: API_REL,
        from: '    await PowerBrowserAPI.sleep(50);',
        to: '    await new Promise(resolve => win.setTimeout(resolve, 50));',
        expect: 'the stock-window startup poll uses the module sleep, not a window timer (WR-07)',
    },
    {
        name: 'the purge joins the clear try (WR-06)',
        rel: API_REL,
        from: '        try {\n          await purgeSiteTabRows(webTabSite(principal));\n        } catch (err) {\n          PowerBrowserAPI.log("error", "[web-tab] site-data clear: the tab-store rows were not purged");\n        }\n',
        to: '        await purgeSiteTabRows(webTabSite(principal));\n',
        expect: 'the tab-store purge runs in its own try after a cleared clear (WR-06)',
    },
    {
        name: 'a web-tab arm logs err.message again (O-31-B)',
        rel: API_REL,
        from: 'PowerBrowserAPI.log("error", "[web-tab] shield change failed");',
        to: 'PowerBrowserAPI.log("error", `[web-tab] shield change failed: ${err && err.message ? err.message : err}`);',
        expect: 'the web-tab action arms log no err.message (O-31-B)',
    },
    {
        name: 'the state router drops shieldExcepted',
        rel: WEB_TAB_REL,
        from: "                shieldExcepted: typeof detail.shieldExcepted === 'boolean' ? detail.shieldExcepted : widget.shieldExcepted,\n",
        to: '',
        expect: 'the state router forwards every pushed field (CR-02, O-31-A)',
    },
    {
        name: 'the secure arm stops excluding a user-overridden certificate',
        rel: API_REL,
        from: 'if (isSecure && !isBroken && !isInsecure && !overridden) {',
        to: 'if (isSecure && !isBroken && !isInsecure) {',
        expect: 'a user-overridden certificate stays out of the secure arm (CR-01)',
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
    // Phase 31 plan 03 (SITE-07/08): the clear path and the shield exception.
    {
        name: 'token-cleared: the clear removes every host cookie, the token included',
        rel: API_REL,
        from: '    if (!webTabTokenCookie(cookie)) {',
        to: '    if (true) {',
        expect: 'the clear keeps the token cookie by name and host',
    },
    {
        name: 'token-name-drift: the boundary token name differs from the token gate',
        rel: API_REL,
        from: 'const TOKEN_COOKIE_NAME = "POWERBROWSER_TOKEN";',
        to: 'const TOKEN_COOKIE_NAME = "POWERBROWSER_TOKEN_OLD";',
        expect: 'the clear keeps the token cookie by name and host',
    },
    {
        name: 'modal-confirm: the window-modal site-data prompt added to the clear',
        rel: API_REL,
        from: 'async function webTabClearSiteData(browser, principal) {',
        to: 'async function webTabClearSiteData(browser, principal) {\n  void lazy.SiteDataManager.promptSiteDataRemoval;',
        expect: 'no modal site-data prompt and no SiteDataManager.remove',
    },
    {
        name: 'cookie-scope-drift: the cookie reads take the exact host, the storage clear the site',
        rel: API_REL,
        from: '  const cookies = Services.cookies.getCookiesFromHost(site, attrs);',
        to: '  const cookies = Services.cookies.getCookiesFromHost(principal.asciiHost, attrs);',
        expect: 'the cookie and storage clears share the registrable-domain scope (CR-03)',
    },
    {
        name: 'clear-cookies-flag: the storage clear keeps CLEAR_COOKIES',
        rel: API_REL,
        from: ' & ~Ci.nsIClearDataService.CLEAR_COOKIES;',
        to: ';',
        expect: 'the storage clear excludes cookies',
    },
    {
        name: 'shield-leak: the exception written on another tab',
        rel: API_REL,
        from: 'lazy.ContentBlockingAllowList.add(entry.browser);',
        to: 'lazy.ContentBlockingAllowList.add([...webTabs.values()][0].browser);',
        expect: 'the shield exception is written on the overlay the panel showed only',
    },
    {
        name: 'shield-stale: the shield reply does not refresh the identity box',
        rel: WEB_TAB_REL,
        from: 'this.shieldExcepted = reply.excepted;',
        to: 'void reply;',
        expect: 'the box shield follows the shield reply',
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
    // Phase 31 plan 04 (MENU-01/02): the hamburger's order, builder, MENU-03 slots, stock pages and wired set.
    {
        name: 'menu-out-of-order: the table lists Add-ons before Passwords',
        rel: TABLE_REL,
        from: "    { menuId: 'passwords', stockPage: 'passwords', minPhase: 31, group: 2 },\n    { menuId: 'addons', stockPage: 'addons', minPhase: 31, group: 2 },\n",
        to: "    { menuId: 'addons', stockPage: 'addons', minPhase: 31, group: 2 },\n    { menuId: 'passwords', stockPage: 'passwords', minPhase: 31, group: 2 },\n",
        expect: 'the app menu order and separators match the UI-SPEC hamburger entries',
    },
    {
        name: 'menu-out-of-order: the builder renders the rows in reverse',
        rel: APP_MENU_REL,
        from: 'for (const { row, enabled } of applyMenuOrder(rows, wired, phase)) {',
        to: 'for (const { row, enabled } of applyMenuOrder(rows, wired, phase).reverse()) {',
        expect: 'the rendered app menu equals the table rows of this phase',
    },
    {
        name: 'a leading separator: the first group wrapped in a group node',
        rel: APP_MENU_REL,
        from: '            ...(first ? first.leaves : []),',
        to: "            ...(first ? [{ id: `${APP_MENU_ID}.group-first`, sortString: '00', isVisible: () => true, isEmpty: () => false, children: first.leaves }] : []),",
        expect: 'the rendered app menu equals the table rows of this phase',
    },
    {
        name: 'menu-extra: a MENU-03 slot rendered',
        rel: APP_MENU_REL,
        from: '.filter(row => row.minPhase <= phase)',
        to: '.filter(row => row.minPhase <= phase || row.minPhase > 0)',
        expect: 'the rendered app menu equals the table rows of this phase',
    },
    {
        name: 'stock-url: a settings URL in the menu module',
        rel: APP_MENU_REL,
        from: "export const APP_MENU_ID = 'powerbrowser-app-menu';",
        to: "export const APP_MENU_ID = 'powerbrowser-app-menu';\nexport const SETTINGS_URL = 'about:preferences';",
        expect: 'stock pages open by name only',
    },
    {
        name: 'quit wired without its client method',
        rel: STORE_CLIENT_REL,
        from: 'async quitRequest(',
        to: 'async quitRequestGone(',
        expect: 'the wired rows are the rows this tree acts on',
    },
    {
        name: 'quit unwired though its kind exists',
        rel: APP_MENU_REL,
        from: "'help', 'quit']);",
        to: "'help']);",
        expect: 'the wired rows are the rows this tree acts on',
    },
    {
        name: 'Quit badge dropped from the copy',
        rel: COPY_REL,
        from: 'menuQuit: (subject: string) => `Quit ${subject} (Ctrl+Q)`,',
        to: 'menuQuit: (subject: string) => `Quit ${subject}`,',
        expect: 'the app menu order and separators match the UI-SPEC hamburger entries (derived)',
    },
    {
        name: 'Quit row sends nothing',
        rel: WIDGET_REL,
        from: 'await this.store.quitRequest();',
        to: 'await Promise.resolve();',
        expect: 'the Quit row sends quitRequest from its own handler',
    },
    {
        name: 'quit-second-path: a second Services.startup.quit in the tree',
        rel: 'powerbrowser/shell/powerbrowser.js',
        from: 'const quitFromCoreClose = () => {',
        to: 'const quitFromCoreClose = () => {\n      Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);',
        expect: 'one quit path: Services.startup.quit is spelled only by the boundary',
    },
    {
        name: 'a row label dropped from the widget switch',
        rel: WIDGET_REL,
        from: "        case 'help': return CHROME_BAR_COPY.menuHelp;\n",
        to: '',
        expect: 'every rendered row has a label',
    },
    {
        name: 'a stock page dropped from the openStockPage switch',
        rel: API_REL,
        from: '    case "processes":\n    case "support":\n      break;',
        to: '    case "support":\n      break;',
        expect: 'STOCK_PAGES equal the openStockPage switch arms',
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
    const clean = await runAt(join(REPO_ROOT, TABLE_REL), sources, join(REPO_ROOT, APP_MENU_REL));
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
            const menuPath = join(dir, `app-menu-${i}.ts`);
            writeFileSync(menuPath, planted[APP_MENU_REL]);
            const { failures } = await runAt(tablePath, planted, menuPath);
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
