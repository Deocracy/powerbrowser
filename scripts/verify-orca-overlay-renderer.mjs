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

// ---------------------------------------------------------------- c. no throw into Orca's setState

function insideTry(node, stop) {
    for (let p = node.parent; p && p !== stop; p = p.parent) {
        if (ts.isBlock(p) && p.parent && ts.isTryStatement(p.parent) && p.parent.tryBlock === p) return true;
        // The handler records the failure (recordError); it is the guard itself, not guarded work.
        if (ts.isCatchClause(p)) return true;
    }
    return false;
}

/**
 * Clause c (64-WR-04): every call made by a listener the entry hands to Orca's store (useAppStore.subscribe), which
 * zustand runs synchronously inside Orca's own setState, is inside a try block of that listener, so nothing the
 * observation does can throw into Orca's update. Zero such listeners is red "parser blind".
 */
export function checkStoreListeners(entryText) {
    const sf = parse(entryText, 'pb-pane-mount.tsx');
    const fails = [];
    let listeners = 0;
    const scope = fn(sf, 'subscribePanes');
    if (!scope) return ['subscribePanes is absent from the entry'];
    for (const c of calls(scope)) {
        if (c.callee !== 'useAppStore.subscribe') continue;
        const cb = c.node.arguments[0];
        if (!cb || !(ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) continue;
        listeners += 1;
        for (const inner of calls(cb.body)) {
            if (!insideTry(inner.node, cb)) fails.push(`subscribePanes' store listener calls ${inner.callee}() outside a try block: a throw stops Orca's own setState`);
        }
    }
    if (!listeners) fails.push('no useAppStore.subscribe listener found in subscribePanes (parser blind)');
    return fails;
}

async function clauseC() {
    if (!(await loadTs())) return { skip: 'theia/node_modules/typescript is absent (install Theia)' };
    return { fails: checkStoreListeners(readFileSync(ENTRY, 'utf8')) };
}

// ---------------------------------------------------------------- d. mountErrors is bounded

/** The top-level statements of `sf` that declare one of `names` (variables or functions), as source text. */
function declarations(sf, names) {
    const out = [];
    for (const st of sf.statements) {
        const text = st.getText().replace(/^export\s+/, '');
        if (ts.isVariableStatement(st) && st.declarationList.declarations.some(d => names.includes(d.name.getText()))) out.push(text);
        else if (ts.isFunctionDeclaration(st) && names.includes(st.name?.text)) out.push(text);
    }
    return out;
}

/**
 * Clause d (overlay-renderer-04), run, not read: the entry's own recordError, with every top-level variable it reads,
 * is transpiled and called 2N times; the kept list must stop growing (its length after N calls equals its length
 * after 2N) and keep the newest entry. Missing recordError or mountErrors is red "source moved".
 */
export function checkMountErrorsBounded(entryText, n = 5000) {
    const sf = parse(entryText, 'pb-pane-mount.tsx');
    const record = fn(sf, 'recordError');
    if (!record) return ['recordError is absent from the entry (source moved)'];
    const read = new Set();
    walk(record, node => { if (ts.isIdentifier(node)) read.add(node.text); });
    const topVars = sf.statements.filter(ts.isVariableStatement).flatMap(st => st.declarationList.declarations.map(d => d.name.getText()));
    const names = ['recordError', ...topVars.filter(v => read.has(v))];
    if (!names.includes('mountErrors')) return ['recordError no longer writes mountErrors (source moved)'];
    const js = ts.transpileModule(`${declarations(sf, names).join('\n')}\nreturn { recordError, mountErrors };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = new Function(js)();
    for (let i = 0; i < n; i += 1) mod.recordError('k', 'p')(new Error(`e${i}`));
    const after = mod.mountErrors.length;
    for (let i = n; i < 2 * n; i += 1) mod.recordError('k', 'p')(new Error(`e${i}`));
    const fails = [];
    if (mod.mountErrors.length !== after || after >= n) fails.push(`mountErrors grows without bound: ${after} kept after ${n} errors, ${mod.mountErrors.length} after ${2 * n}`);
    if (mod.mountErrors.at(-1)?.message !== `e${2 * n - 1}`) fails.push('mountErrors does not keep the newest error last');
    return fails;
}

async function clauseD() {
    if (!(await loadTs())) return { skip: 'theia/node_modules/typescript is absent (install Theia)' };
    return { fails: checkMountErrorsBounded(readFileSync(ENTRY, 'utf8')) };
}

// ---------------------------------------------------------------- e. a failed bootstrap can be retried

/** A value every property, call and assignment of which succeeds and yields another such value (never a thenable). */
function anything() {
    const target = function () {};
    return new Proxy(target, {
        get: (_t, key) => (key === 'then' ? undefined : key === Symbol.toPrimitive ? () => 'x' : anything()),
        set: () => true,
        apply: () => anything(),
        construct: () => anything(),
    });
}

/**
 * Runs the entry's bootstrap, with the top-level functions and variables it reads, against stubs: every free
 * identifier (Orca's functions, document, React) is a counting stub, `failing` throws on its first call. Returns the
 * call counts and the outcome of a first and a second bootstrap call.
 */
async function runBootstrapTwice(entryText, failing) {
    const sf = parse(entryText, 'pb-pane-mount.tsx');
    const boot = fn(sf, 'bootstrap');
    if (!boot) return null;
    const steps = installCalls(entryText);
    const stubbed = new Set(steps.map(s => s.path.split('.')[0]));
    const topFns = sf.statements.filter(ts.isFunctionDeclaration).map(f => f.name?.text).filter(Boolean);
    const topVars = sf.statements.filter(ts.isVariableStatement).flatMap(st => st.declarationList.declarations.map(d => d.name.getText()));
    const isJsxTag = n => n.parent && (ts.isJsxOpeningElement(n.parent) || ts.isJsxSelfClosingElement(n.parent) || ts.isJsxClosingElement(n.parent)) && n.parent.tagName === n;
    // The closure of bootstrap over top-level declarations, less the install steps (stubs stand for them) and JSX tags.
    const own = new Set(['bootstrap']);
    for (let changed = true; changed;) {
        changed = false;
        for (const name of [...own]) {
            const node = fn(sf, name) ?? sf.statements.find(st => ts.isVariableStatement(st) && st.declarationList.declarations.some(d => d.name.getText() === name));
            if (!node) continue;
            walk(node, n => {
                if (ts.isIdentifier(n) && !isJsxTag(n) && !own.has(n.text) && !stubbed.has(n.text) && (topFns.includes(n.text) || topVars.includes(n.text))) { own.add(n.text); changed = true; }
            });
        }
    }
    const source = declarations(sf, [...own]).join('\n');
    const js = ts.transpileModule(`${source}\nreturn bootstrap;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
    const counts = {};
    let failedOnce = false;
    const recorder = path => new Proxy(function () {}, {
        get: (_f, k) => (k === 'then' ? undefined : typeof k === 'string' ? recorder(`${path}.${k}`) : undefined),
        set: () => true,
        apply: () => {
            counts[path] = (counts[path] ?? 0) + 1;
            if (path === failing && !failedOnce) { failedOnce = true; throw new Error(`planted ${path}`); }
            return anything();
        },
    });
    const env = new Proxy({}, {
        has: (_t, key) => typeof key === 'string' && !(key in globalThis),
        get: (_t, key) => (typeof key === 'string' ? recorder(key) : undefined),
    });
    // The entry is the tree's own source, evaluated only against stubs (no Orca module, no DOM).
    const bootstrap = new Function('env', `with (env) { ${js} }`)(env);
    const outcome = async p => { try { await p; return 'resolved'; } catch { return 'rejected'; } };
    const first = await outcome(bootstrap({ pairing: 'x' }));
    const second = await outcome(bootstrap({ pairing: 'x' }));
    return { counts, first, second };
}

/**
 * The calls bootstrap makes after its session-only assertion, to a function that is not bootstrap's own local or a
 * JavaScript global: the steps that install into the document. Each carries its group: the step()/once() call it
 * runs inside (calls of one group legitimately repeat together when that group is retried).
 */
export function installCalls(entryText) {
    const sf = parse(entryText, 'pb-pane-mount.tsx');
    const boot = fn(sf, 'bootstrap');
    if (!boot) return [];
    const after = boot.getText().indexOf('assertSessionOnly()');
    if (after < 0) return [];
    const locals = new Set();
    walk(boot, n => { if ((ts.isVariableDeclaration(n) || ts.isParameter(n)) && ts.isIdentifier(n.name)) locals.add(n.name.text); });
    const out = [];
    for (const c of calls(boot)) {
        if (c.node.getStart() - boot.getStart() <= after || !/^[A-Za-z_$][\w$]*(\.[\w$]+)*$/.test(c.callee)) continue;
        const root = c.callee.split('.')[0];
        if (['step', 'once'].includes(root) || locals.has(root) || root in globalThis || out.some(s => s.path === c.callee)) continue;
        let group = c.node.getStart();
        for (let p = c.node.parent; p && p !== boot; p = p.parent) {
            if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && ['step', 'once'].includes(p.expression.text)) { group = p.getStart(); break; }
        }
        out.push({ path: c.callee, group });
    }
    return out;
}

/**
 * Clause e (overlay-renderer-03), run, not read: for each install step bootstrap calls after its session-only
 * assertion (derived from the entry), the step is made to throw once; the first bootstrap must reject, a second call
 * must run again and resolve, and every install step outside the failed one's group must have run exactly once in
 * total (nothing wrapped or mounted twice). Zero install steps is red "parser blind".
 */
export async function checkBootstrapRetry(entryText) {
    const steps = installCalls(entryText);
    if (!steps.length) return ['no install step found after the session-only assertion in bootstrap (parser blind)'];
    const fails = [];
    for (const failing of steps) {
        const run = await runBootstrapTwice(entryText, failing.path);
        if (!run) return ['bootstrap is absent from the entry (source moved)'];
        if (run.first !== 'rejected') { fails.push(`a throw from ${failing.path} did not reject the first bootstrap`); continue; }
        if (run.second !== 'resolved' || (run.counts.pairSessionOnly ?? 0) < 2) {
            fails.push(`after ${failing.path} failed once, a second bootstrap did not run again and resolve: the rejected attempt is cached`);
            continue;
        }
        for (const s of steps) {
            const n = run.counts[s.path] ?? 0;
            const good = s === failing ? n === 2 : s.group === failing.group ? n >= 1 && n <= 2 : n === 1;
            if (!good) fails.push(`after ${failing.path} failed once, ${s.path} ran ${n} time(s) across the retry: installed twice or skipped`);
        }
    }
    return fails;
}

async function clauseE() {
    if (!(await loadTs())) return { skip: 'theia/node_modules/typescript is absent (install Theia)' };
    return { fails: await checkBootstrapRetry(readFileSync(ENTRY, 'utf8')) };
}

// ---------------------------------------------------------------- driver

const CLAUSES = [['a', clauseA], ['b', clauseB], ['c', clauseC], ['d', clauseD], ['e', clauseE]];

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
        // c.
        ok('c: control green on the tree', checkStoreListeners(entry).length === 0);
        const unguarded = entry.replace(/\n(\s*)try \{\n(\s*const next = paneRecords\(state\)[\s\S]*?\n)\s*\} catch \(error\) \{\n\s*recordError\('observation', 'subscribe'\)\(error\)\n\s*\}\n/, '\n$2');
        ok('c: the unguarded-listener plant applies', unguarded !== entry);
        ok('c: paneRecords outside a try in the store listener (pre-fix) is red, naming it', checkStoreListeners(unguarded).some(f => /calls paneRecords\(\) outside a try/.test(f)));
        // d.
        ok('d: control green on the tree', checkMountErrorsBounded(entry).length === 0);
        const unbounded = entry.replace(/\n\s*if \(mountErrors\.length > MOUNT_ERRORS_KEPT\)[^\n]*\n/, '\n');
        ok('d: the unbounded plant applies', unbounded !== entry);
        ok('d: recordError that only pushes (pre-fix) is red, naming it', checkMountErrorsBounded(unbounded).some(f => /grows without bound/.test(f)));
        ok('d: a missing recordError is red "source moved"', checkMountErrorsBounded(entry.replace(/function recordError\(/g, 'function recordFailure(')).some(f => /source moved/.test(f)));
        // e.
        const steps = installCalls(entry);
        ok(`e: install steps derived from bootstrap (${steps.map(s => s.path).join(', ')})`, steps.length >= 4);
        ok('e: control green on the tree', (await checkBootstrapRetry(entry)).length === 0);
        const cached = entry.replace(/\}\)\(\)\.catch\(\(error: unknown\) => \{\n\s*booting = null\n\s*throw error\n\s*\}\)/, '})()');
        ok('e: the cached-rejection plant applies', cached !== entry);
        ok('e: a rejected bootstrap kept for the document (pre-fix) is red, naming it', (await checkBootstrapRetry(cached)).some(f => /the rejected attempt is cached/.test(f)));
        const twice = entry.replace(/await once\(/g, 'await step(');
        ok('e: the install-twice plant applies', twice !== entry);
        ok('e: a retry that re-runs completed install steps is red, naming it', (await checkBootstrapRetry(twice)).some(f => /installed twice or skipped/.test(f)));
        ok('e: no install step is red "parser blind"', (await checkBootstrapRetry(entry.replace(/assertSessionOnly\(\)/g, 'assertSessionOnlyX()'))).some(f => /parser blind/.test(f)));
        ok('c: no store listener is red "parser blind"', checkStoreListeners(entry.replace(/useAppStore\.subscribe\(\(state, prior\)/, 'useAppStore.subscribeTo((state, prior)')).some(f => /parser blind/.test(f)));
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
