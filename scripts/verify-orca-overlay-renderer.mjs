#!/usr/bin/env node
// scripts/verify-orca-overlay-renderer.mjs
//
// orca-overlay-renderer (v1.7 audit-fix lane G3a): static clauses over the Orca overlay's renderer files, one per
// audit finding this lane fixed. No browser, no display, no build of Orca needed except where a clause names it.
//
//   a. (overlay-renderer-02 = 64-CR-01) the CSS scoping pass (orca-overlay/files/pb-css-scope.mjs, run with Orca's
//      own postcss) treats every Tailwind variant utility of a theme variant as an ordinary selector: for each
//      @custom-variant in Orca's main.css whose selector names the .dark or .light class (derived at check time), a
//      utility rule written the way Tailwind emits it comes out with every selector carrying the scope before the
//      utility (S .dark\:x... or .dark\:x...:where(P)), and none of its declarations, custom properties included,
//      stays on an unscoped selector. Control: the bare theme class (.dark .btn) is still an ancestor condition.
//      Over the built sheet (orca/out/web/assets/pb-panes/pb-panes.css, when orca/pb-css-scope.mjs equals the
//      overlay file, i.e. the sheet was built by this pass): no rule head is a variant utility followed by the scope.
//
// --self-test plants each pre-fix fault into a copy of the source and requires red naming it.
//
// Usage:
//   node scripts/verify-orca-overlay-renderer.mjs
//   node scripts/verify-orca-overlay-renderer.mjs --self-test

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-overlay-renderer';
const ORCA = join(REPO_ROOT, 'orca');
const OVERLAY = join(REPO_ROOT, 'orca-overlay', 'files');
const CSS_PASS = join(OVERLAY, 'pb-css-scope.mjs');
const CSS_PASS_COPY = join(ORCA, 'pb-css-scope.mjs');
const POSTCSS_ESM = join(ORCA, 'node_modules', 'postcss', 'lib', 'postcss.mjs');
const MAIN_CSS = join(ORCA, 'src', 'renderer', 'src', 'assets', 'main.css');
const SHEET = join(ORCA, 'out', 'web', 'assets', 'pb-panes', 'pb-panes.css');

// ---------------------------------------------------------------- a. theme variant utilities

/** Loads a pass source (the overlay file or a planted copy) with its postcss import bound to Orca's postcss. */
async function loadPassFrom(source) {
    const dir = mkdtempSync(join(tmpdir(), 'pb-overlay-renderer-'));
    try {
        const file = join(dir, 'pb-css-scope.mjs');
        writeFileSync(file, source.replace(/from 'postcss'/, `from '${pathToFileURL(POSTCSS_ESM).href}'`));
        return await import(pathToFileURL(file).href);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/** Orca's theme variants: [name, selector with &] for each @custom-variant whose selector names .dark or .light. */
export function themeVariants(mainCss) {
    const out = [];
    for (const m of mainCss.matchAll(/@custom-variant\s+([\w-]+)\s+\((&[^;]*)\)\s*;/g)) {
        if (/\.(dark|light)(?![\w-])/.test(m[2])) out.push([m[1], m[2]]);
    }
    return out;
}

const cssEscape = s => s.replace(/[:/]/g, c => `\\${c}`);

/** Clause a over one loaded pass and Orca's variants; returns the failures. */
export function checkVariantScoping(pass, variants) {
    const fails = [];
    if (!variants.length) return ['no @custom-variant naming .dark or .light in Orca main.css (source moved)'];
    for (const [name, selector] of variants) {
        const util = `.${cssEscape(`${name}:bg-input/30`)}`;
        const rule = `${selector.replace('&', util)}{--pb-v:1;color:red}`;
        const out = pass.scopeCss(rule);
        const rules = [...out.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selectors: m[1].trim(), body: m[2] })).filter(r => r.selectors.includes(util));
        if (!rules.length) { fails.push(`variant ${name}: the utility rule vanished`); continue; }
        for (const r of rules) {
            for (const s of r.selectors.split(/,(?![^(]*\))/).map(x => x.trim())) {
                const descendant = s.startsWith(`${pass.SCOPE} ${util}`);
                const self = s.startsWith(util) && s.includes(`:where(${pass.PORTAL_ROOTS})`);
                if (!descendant && !self) fails.push(`variant ${name}: selector "${s.slice(0, 140)}" does not scope the utility (theme-root rewrite of an escaped class)`);
            }
        }
    }
    const control = pass.scopeCss('.dark .btn{color:red}');
    if (!control.includes(`.dark ${pass.SCOPE} .btn`)) fails.push('control: the bare .dark theme class is no longer an ancestor condition');
    return fails;
}

/** Clause a over a built sheet: rule heads that are a variant utility followed by the scope. */
export function checkBuiltSheet(pass, sheet) {
    const bad = [];
    for (const m of sheet.matchAll(/(^|[}\n])\s*([^{}@]+)\{/g)) {
        for (const s of m[2].split(/,(?![^(]*\))/).map(x => x.trim())) {
            if (/^\.(dark|light)\\/.test(s) && s.includes(` ${pass.SCOPE}`) && !s.startsWith(pass.SCOPE)) bad.push(s);
        }
    }
    return bad;
}

async function clauseA() {
    if (!existsSync(POSTCSS_ESM) || !existsSync(MAIN_CSS)) return { skip: 'orca/node_modules/postcss or orca main.css is absent (run scripts/build-orca.sh)' };
    const pass = await loadPassFrom(readFileSync(CSS_PASS, 'utf8'));
    const fails = checkVariantScoping(pass, themeVariants(readFileSync(MAIN_CSS, 'utf8')));
    let note = 'built sheet not checked (no build)';
    if (existsSync(SHEET) && existsSync(CSS_PASS_COPY)) {
        if (readFileSync(CSS_PASS_COPY, 'utf8') !== readFileSync(CSS_PASS, 'utf8')) {
            note = 'built sheet not checked (orca/pb-css-scope.mjs is stale; run scripts/build-orca.sh --panes-only)';
        } else {
            const bad = checkBuiltSheet(pass, readFileSync(SHEET, 'utf8'));
            if (bad.length) fails.push(`${bad.length} variant utility selector(s) of the built sheet rewritten as a theme root, first: ${bad[0].slice(0, 140)}`);
            note = 'built sheet checked';
        }
    }
    return { fails, note };
}

// ---------------------------------------------------------------- TypeScript helpers (b onwards)

const ENTRY = join(OVERLAY, 'src', 'renderer', 'src', 'pb', 'pb-pane-mount.tsx');
const WORKSPACE_API = join(OVERLAY, 'src', 'renderer', 'src', 'pb', 'pb-workspace-api.ts');
const ORCA_CONSTANTS = join(ORCA, 'src', 'renderer', 'src', 'constants', 'terminal.ts');
const TS_PATH = join(REPO_ROOT, 'theia', 'node_modules', 'typescript', 'lib', 'typescript.js');

let ts = null;
export async function loadTs() {
    if (!ts && existsSync(TS_PATH)) ts = (await import(pathToFileURL(TS_PATH).href)).default;
    return ts;
}

function parse(text, name = 'x.tsx') {
    return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function walk(node, visit) { visit(node); ts.forEachChild(node, child => walk(child, visit)); }

/** The function declaration named `name` (or a const arrow of that name), or null. */
function fn(sf, name) {
    let found = null;
    walk(sf, n => {
        if (found) return;
        if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n;
        else if (ts.isVariableDeclaration(n) && n.name.getText?.() === name && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) found = n.initializer;
    });
    return found;
}

/** Callee text of every call under `node` (property access spelled a.b.c). */
function calls(node) {
    const out = [];
    walk(node, n => { if (ts.isCallExpression(n)) out.push({ callee: n.expression.getText(), node: n }); });
    return out;
}

const squashTs = s => s.replace(/\s+/g, '');

/** Member names of the exported type alias `name` in a TypeScript source, or null when absent. */
function typeMembers(text, name) {
    const sf = parse(text, 'c.ts');
    let members = null;
    walk(sf, n => {
        if (members === null && ts.isTypeAliasDeclaration(n) && n.name.text === name && ts.isTypeLiteralNode(n.type)) {
            members = n.type.members.map(m => m.name?.getText()).filter(Boolean);
        }
    });
    return members;
}

// ---------------------------------------------------------------- b. a terminal leaf close addresses its leaf

/**
 * Clause b (overlay-renderer-01, 64-WR-02) over the entry text and Orca's terminal constants:
 *   - Orca's tab-wide close request carries no leaf (derived from RequestActiveTerminalPaneCloseDetail), so with one
 *     TerminalPane per leaf widget it reaches every instance: the entry never sends it;
 *   - Orca's leaf-addressed close (CloseTerminalPaneDetail) carries leafId, and the entry dispatches it;
 *   - closePane returns for a requested leaf that is no longer in the layout before any whole-tab close (closeItem).
 */
export function checkLeafClose(entryText, constantsText) {
    const fails = [];
    const tabWide = typeMembers(constantsText, 'RequestActiveTerminalPaneCloseDetail');
    const leafWise = typeMembers(constantsText, 'CloseTerminalPaneDetail');
    if (!tabWide || !leafWise) return ['RequestActiveTerminalPaneCloseDetail or CloseTerminalPaneDetail is absent from Orca constants/terminal.ts (source moved)'];
    if (!leafWise.includes('leafId')) fails.push('Orca CloseTerminalPaneDetail no longer carries leafId (source moved): re-derive the leaf close');
    const sf = parse(entryText, 'pb-pane-mount.tsx');
    const all = calls(sf);
    const addressesLeaf = tabWide.some(m => /leaf|pane/i.test(m));
    if (!addressesLeaf && all.some(c => c.callee === 'requestActiveTerminalPaneClose')) {
        fails.push('the entry sends Orca\'s tab-wide active-pane close (requestActiveTerminalPaneClose), which every leaf widget\'s TerminalPane handles');
    }
    if (!addressesLeaf && /REQUEST_ACTIVE_TERMINAL_PANE_CLOSE_EVENT/.test(entryText)) {
        fails.push('the entry dispatches REQUEST_ACTIVE_TERMINAL_PANE_CLOSE_EVENT, which carries no leaf');
    }
    const dispatchesLeafClose = all.some(c => c.callee === 'window.dispatchEvent' && /CLOSE_TERMINAL_PANE_EVENT/.test(c.node.getText()) && /leafId/.test(c.node.getText()));
    if (!dispatchesLeafClose) fails.push('no window.dispatchEvent of CLOSE_TERMINAL_PANE_EVENT with a leafId: nothing drops the closed leaf from the mounted instances');
    const close = fn(sf, 'closePane');
    if (!close) return [...fails, 'closePane is absent from the entry'];
    const body = close.body.getText();
    const stale = squashTs(body).search(/if\(!leaves\.includes\(leaf\)\)return/);
    const whole = squashTs(body).indexOf('.closeItem(');
    if (stale < 0 || (whole >= 0 && stale > whole)) fails.push('closePane does not return for a requested leaf that is gone before closing the whole tab (64-WR-02)');
    return fails;
}

async function clauseB() {
    if (!(await loadTs())) return { skip: 'theia/node_modules/typescript is absent (install Theia)' };
    if (!existsSync(ORCA_CONSTANTS)) return { skip: 'orca/src is absent (run scripts/fetch-orca.sh)' };
    return { fails: checkLeafClose(readFileSync(ENTRY, 'utf8'), readFileSync(ORCA_CONSTANTS, 'utf8')) };
}

// ---------------------------------------------------------------- driver

const CLAUSES = [['a', clauseA], ['b', clauseB]];

async function main() {
    let failed = 0;
    const notes = [];
    for (const [id, run] of CLAUSES) {
        const r = await run();
        if (r.skip) { console.log(`${NAME}: SKIP (clause ${id}) -- ${r.skip}`); continue; }
        for (const f of r.fails) { console.log(`${NAME}: FAIL (clause ${id}) -- ${f}`); failed += 1; }
        if (r.note) notes.push(`${id}: ${r.note}`);
    }
    if (failed) return 1;
    console.log(`${NAME}: PASS -- ${CLAUSES.length} clause(s)${notes.length ? `; ${notes.join('; ')}` : ''}`);
    return 0;
}

async function selfTest() {
    let failed = 0;
    const ok = (name, cond) => { console.log(`  ${cond ? 'ok ' : 'NOT OK '} ${name}`); if (!cond) failed += 1; };
    if (!existsSync(POSTCSS_ESM) || !existsSync(MAIN_CSS)) {
        console.log(`${NAME} self-test: SKIP -- orca/node_modules/postcss or orca main.css is absent (run scripts/build-orca.sh)`);
        return 0;
    }
    // a.
    const source = readFileSync(CSS_PASS, 'utf8');
    const variants = themeVariants(readFileSync(MAIN_CSS, 'utf8'));
    ok('a: Orca main.css yields at least one theme variant (derived)', variants.length > 0);
    const pass = await loadPassFrom(source);
    ok('a: control green on the tree', checkVariantScoping(pass, variants).length === 0);
    const prefix = source.replace(/(const THEME_RE = \/\^\\\.\(dark\|light\)\(\?!)\[\\w\\\\-\]\)/, '$1[\\w-])');
    ok('a: the pre-fix THEME_RE plant applies', prefix !== source);
    const planted = await loadPassFrom(prefix);
    const plantedFails = checkVariantScoping(planted, variants);
    ok('a: pre-fix THEME_RE (escaped class taken for the theme root) is red, naming it', plantedFails.some(f => /theme-root rewrite of an escaped class/.test(f)));
    const builtBad = planted.scopeCss(`.dark\\:invert:is(.dark *){filter:invert(1)}`);
    ok('a: a built sheet from the pre-fix pass is red', checkBuiltSheet(planted, builtBad).length === 1);
    ok('a: a built sheet from the fixed pass is green', checkBuiltSheet(pass, pass.scopeCss(`.dark\\:invert:is(.dark *){filter:invert(1)}.dark .b{color:red}`)).length === 0);
    ok('a: no theme variant in main.css is red "source moved"', checkVariantScoping(pass, []).some(f => /source moved/.test(f)));
    // b.
    if (!(await loadTs()) || !existsSync(ORCA_CONSTANTS)) {
        console.log('  skip b..: theia/node_modules/typescript or orca/src is absent');
    } else {
        const entry = readFileSync(ENTRY, 'utf8');
        const constants = readFileSync(ORCA_CONSTANTS, 'utf8');
        ok('b: control green on the tree', checkLeafClose(entry, constants).length === 0);
        const dispatch = /window\.dispatchEvent\(new CustomEvent<CloseTerminalPaneDetail>\(CLOSE_TERMINAL_PANE_EVENT[^\n]*\n/;
        const tabWide = entry.replace(dispatch, '  requestActiveTerminalPaneClose(tabId)\n');
        ok('b: the tab-wide close plant applies', tabWide !== entry);
        const tabWideFails = checkLeafClose(tabWide, constants);
        ok('b: the tab-wide active-pane close (pre-fix) is red, naming it', tabWideFails.some(f => /requestActiveTerminalPaneClose/.test(f)) && tabWideFails.some(f => /nothing drops the closed leaf/.test(f)));
        const leafAware = constants.replace(/(export type RequestActiveTerminalPaneCloseDetail = \{\s*tabId: string)/, '$1\n  leafId?: string');
        ok('b: derived: once Orca\'s tab-wide request carries a leaf, sending it is no longer red', leafAware !== constants && !checkLeafClose(tabWide, leafAware).some(f => /requestActiveTerminalPaneClose/.test(f)));
        const escalates = entry.replace(/\n\s*if \(!leaves\.includes\(leaf\)\) return\n/, '\n');
        ok('b: the stale-leaf plant applies', escalates !== entry);
        ok('b: a gone leaf falling through to the whole-tab close (64-WR-02) is red, naming it', checkLeafClose(escalates, constants).some(f => /64-WR-02/.test(f)));
        const noLeaf = constants.replace(/(export type CloseTerminalPaneDetail = \{[^}]*?)\n\s*leafId\?: string/, '$1');
        ok('b: Orca\'s leaf close losing leafId is red "source moved"', noLeaf !== constants && checkLeafClose(entry, noLeaf).some(f => /no longer carries leafId/.test(f)));
    }
    console.log(failed ? `${NAME} self-test: FAIL -- ${failed} case(s)` : `${NAME} self-test: PASS -- every planted fault went red naming it`);
    return failed ? 1 : 0;
}

const SELF = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === SELF) {
    const args = process.argv.slice(2);
    if (args.some(a => a !== '--self-test')) { console.error('usage: node scripts/verify-orca-overlay-renderer.mjs [--self-test]'); process.exit(2); }
    process.exit(args.includes('--self-test') ? await selfTest() : await main());
}
