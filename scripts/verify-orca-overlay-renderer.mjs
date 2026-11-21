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
//   b. (overlay-renderer-01, 64-WR-02) a terminal leaf close addresses its leaf: the entry never sends Orca's tab-wide
//      active-pane close while its detail type carries no leaf, dispatches Orca's leaf-addressed close with a leafId,
//      and closePane returns for a gone leaf before any whole-tab close.
//   b2. (overlay-renderer-01 follow-up) run: Orca's leaf-close handler closes the whole tab, unprompted, in a manager
//      holding that leaf as its only pane (derived from terminal-pane-lifecycle-close.ts); with a stub document whose
//      hosted terminal root of the tab holds only that leaf, no leaf event is sent and Orca's prompted tab close runs.
//   c. (64-WR-04) every call of subscribePanes' store listener runs inside a try block.
//   d. (overlay-renderer-04) run: the entry's recordError, called 2N times, keeps a bounded list.
//   e. (overlay-renderer-03) run: for each install step bootstrap calls after the session-only assertion (derived),
//      one throw rejects the first bootstrap, a second call runs again and resolves, nothing is installed twice.
//   f. (65-WR-01) run: pb-workspace-api's openFileRecords and subscribeWorktrees, with Orca's host resolver stubbed,
//      fail closed for an unknown, host-less or SSH-hosted worktree and find a folder workspace's own row.
//   b..f parse with theia/node_modules/typescript; a run clause evaluates the tree's own source against stubs.
//
// --self-test plants each pre-fix fault into a copy of the source and requires red naming it.
//
// Usage:
//   node scripts/verify-orca-overlay-renderer.mjs
//   node scripts/verify-orca-overlay-renderer.mjs --self-test

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { SKIP_EXIT, skipLine, verdictExit } from './lib/skip-verdict.mjs';

const SELF = fileURLToPath(import.meta.url);
const IS_MAIN = !!process.argv[1] && resolve(process.argv[1]) === SELF;
// --root=<dir> runs the main mode over another tree (the self-test's SKIP control uses it); never when imported.
const ROOT_ARG = IS_MAIN ? process.argv.slice(2).find(a => a.startsWith('--root=')) : undefined;
const REPO_ROOT = ROOT_ARG ? resolve(ROOT_ARG.slice('--root='.length)) : resolve(dirname(SELF), '..');
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
    // The built-sheet half not run for an absent or stale build is a partial skip (SKIP-PROTOCOL.md rule 2).
    let partial = 'built sheet not checked: the pane sheet is not built (run scripts/build-orca.sh --panes-only)';
    if (existsSync(SHEET) && existsSync(CSS_PASS_COPY)) {
        if (readFileSync(CSS_PASS_COPY, 'utf8') !== readFileSync(CSS_PASS, 'utf8')) {
            partial = 'built sheet not checked: orca/pb-css-scope.mjs is stale (run scripts/build-orca.sh --panes-only)';
        } else {
            const bad = checkBuiltSheet(pass, readFileSync(SHEET, 'utf8'));
            if (bad.length) fails.push(`${bad.length} variant utility selector(s) of the built sheet rewritten as a theme root, first: ${bad[0].slice(0, 140)}`);
            return { fails, note: 'built sheet checked' };
        }
    }
    return { fails, partial };
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
    // The whole-tab closes: a .closeItem( call, or a call of a local function of closePane whose body makes one.
    const closers = new Set();
    walk(close.body, n => {
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && /\.closeItem\(/.test(n.initializer.getText())) closers.add(n.name.text);
    });
    let stale = -1;
    walk(close.body, n => {
        if (stale < 0 && ts.isIfStatement(n) && squashTs(n.getText()) === 'if(!leaves.includes(leaf))return') stale = n.getStart();
    });
    const insideCloser = n => { for (let p = n.parent; p && p !== close.body; p = p.parent) if (ts.isVariableDeclaration(p) && closers.has(p.name.getText?.())) return true; return false; };
    const whole = calls(close.body)
        .filter(c => (/\.closeItem$/.test(c.callee) && !insideCloser(c.node)) || closers.has(c.callee))
        .map(c => c.node.getStart());
    if (stale < 0 || whole.some(at => at < stale)) fails.push('closePane does not return for a requested leaf that is gone before closing the whole tab (64-WR-02)');
    return fails;
}

const LIFECYCLE_CLOSE = join(ORCA, 'src', 'renderer', 'src', 'components', 'terminal-pane', 'terminal-pane-lifecycle-close.ts');

/**
 * Clause b2 (overlay-renderer-01 follow-up), run: Orca's handler of the leaf-addressed close closes the whole tab,
 * unprompted, in an instance whose manager holds the leaf as its only pane (derived: terminal-pane-lifecycle-close.ts
 * has that branch). The entry's leaf close runs against a stub document of hosted terminal roots: while a root of the
 * tab holds only that leaf, no leaf event may be sent and Orca's tab close (with its prompt) runs instead; when every
 * root holding it holds another pane, exactly one leaf event for that leaf is sent and the tab is not closed.
 */
export function checkLeafEventScope(entryText, lifecycleText) {
    if (!/getPanes\(\)\.length <= 1\)[\s\S]{0,200}closeTab\(\)/.test(lifecycleText)) return { fails: [], note: 'Orca\'s leaf close no longer closes the tab for a single-pane manager; b2 not needed' };
    const run = rootsLeaves => {
        const dispatched = [];
        let tabCloses = 0;
        const state = {
            terminalLayoutsByTabId: { t: { root: { type: 'split', direction: 'vertical', first: { type: 'leaf', leafId: 'L1' }, second: { type: 'leaf', leafId: 'L2' } }, ptyIdsByLeafId: {} } },
            tabsByWorktree: { w: [] }, settings: {}, setCacheTimerStartedAt() {}, dropAgentStatus() {},
        };
        const roots = rootsLeaves.map(leaves => ({
            getAttribute: name => (name === 'data-pb-orca-terminal-tab' ? 't' : null),
            querySelectorAll: () => leaves.map(leafId => ({ dataset: { leafId } })),
        }));
        const mod = evaluate(entryText, ['requestTerminalLeafClose'], {
            useAppStore: { getState: () => state },
            makePaneKey: (tab, leaf) => `${tab}:${leaf}`,
            document: { querySelectorAll: () => roots },
            window: { dispatchEvent: event => { dispatched.push(event); return true; } },
            CLOSE_TERMINAL_PANE_EVENT: 'pb-check-leaf-close',
        }, 'pb-pane-mount.tsx');
        if (!mod) return null;
        mod.requestTerminalLeafClose('w', 't', 'L1', 'label', () => { tabCloses += 1; });
        return { leafEvents: dispatched.filter(e => e?.type === 'pb-check-leaf-close' && e.detail?.leafId === 'L1').length, tabCloses };
    };
    const behind = run([['L1'], ['L1', 'L2']]);
    if (!behind) return { fails: ['requestTerminalLeafClose is absent from the entry (source moved)'] };
    const fails = [];
    if (behind.leafEvents) fails.push('the leaf close event is sent while a mounted instance holds that leaf as its only pane: Orca\'s handler closes the whole tab there, unprompted');
    if (behind.tabCloses !== 1) fails.push(`with an instance behind, Orca's prompted tab close ran ${behind.tabCloses} time(s) (want 1)`);
    const caughtUp = run([['L1', 'L2'], ['L1', 'L2'], ['L2']]);
    if (caughtUp.leafEvents !== 1 || caughtUp.tabCloses) fails.push(`with every instance holding both leaves, ${caughtUp.leafEvents} leaf event(s) and ${caughtUp.tabCloses} tab close(s) (want 1 and 0)`);
    return { fails };
}

async function clauseB() {
    if (!(await loadTs())) return { skip: 'theia/node_modules/typescript is absent (install Theia)' };
    if (!existsSync(ORCA_CONSTANTS)) return { skip: 'orca/src is absent (run scripts/fetch-orca.sh)' };
    const entry = readFileSync(ENTRY, 'utf8');
    const fails = checkLeafClose(entry, readFileSync(ORCA_CONSTANTS, 'utf8'));
    if (!existsSync(LIFECYCLE_CLOSE)) return { fails: [...fails, 'Orca terminal-pane-lifecycle-close.ts is absent (source moved)'] };
    const b2 = checkLeafEventScope(entry, readFileSync(LIFECYCLE_CLOSE, 'utf8'));
    return { fails: [...fails, ...b2.fails], ...(b2.note ? { note: b2.note } : {}) };
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
    const js = ts.transpileModule(`${source}\nreturn Object.assign(bootstrap, { booted: () => isBooted === true });`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
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
    const roots = (counts['ReactDOMClient.createRoot'] ?? 0) - (failing === 'ReactDOMClient.createRoot' ? 1 : 0);
    return { counts, first, second, booted: bootstrap.booted() === true, roots };
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
 * total (nothing wrapped or mounted twice), and the retried boot must end booted with exactly one services root.
 * The pairing step is failed the same way. Zero install steps is red "parser blind".
 */
export async function checkBootstrapRetry(entryText) {
    const steps = installCalls(entryText);
    if (!steps.length) return ['no install step found after the session-only assertion in bootstrap (parser blind)'];
    const fails = [];
    // The pairing step (before the assertion) as well as every install step: a boot that failed at pairing must pair on retry.
    for (const failing of [{ path: 'pairSessionOnly', group: -1 }, ...steps]) {
        const run = await runBootstrapTwice(entryText, failing.path);
        if (!run) return ['bootstrap is absent from the entry (source moved)'];
        if (run.first !== 'rejected') { fails.push(`a throw from ${failing.path} did not reject the first bootstrap`); continue; }
        if (run.second !== 'resolved' || (run.counts.pairSessionOnly ?? 0) < 2) {
            fails.push(`after ${failing.path} failed once, a second bootstrap did not run again and resolve: the rejected attempt is cached`);
            continue;
        }
        if (!run.booted || run.roots !== 1) fails.push(`after ${failing.path} failed once, the retried bootstrap ended ${run.booted ? 'booted' : 'not booted'} with ${run.roots} services root(s) (want booted, exactly one)`);
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

// ---------------------------------------------------------------- f. the local predicate fails closed

/**
 * Evaluates the named top-level functions of a TypeScript source, with the top-level declarations they reach, in an
 * environment where `stubs` stand for named free identifiers and anything else free is an inert stub.
 */
function evaluate(text, names, stubs, fileName = 'x.ts') {
    const sf = parse(text, fileName);
    const topFns = sf.statements.filter(ts.isFunctionDeclaration).map(f => f.name?.text).filter(Boolean);
    const topVars = sf.statements.filter(ts.isVariableStatement).flatMap(st => st.declarationList.declarations.map(d => d.name.getText()));
    const own = new Set(names);
    for (let changed = true; changed;) {
        changed = false;
        for (const name of [...own]) {
            const node = fn(sf, name) ?? sf.statements.find(st => ts.isVariableStatement(st) && st.declarationList.declarations.some(d => d.name.getText() === name));
            if (!node) continue;
            walk(node, n => {
                if (ts.isIdentifier(n) && !own.has(n.text) && !(n.text in stubs) && (topFns.includes(n.text) || topVars.includes(n.text))) { own.add(n.text); changed = true; }
            });
        }
    }
    if (names.some(n => !fn(sf, n))) return null;
    const js = ts.transpileModule(`${declarations(sf, [...own]).join('\n')}\nreturn { ${names.join(', ')} };`, { fileName, compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
    const env = new Proxy({}, {
        has: (_t, key) => typeof key === 'string' && !(key in globalThis),
        // A symbol (Symbol.unscopables above all) must read undefined, or `with` would hide every name.
        get: (_t, key) => (typeof key !== 'string' ? undefined : key in stubs ? stubs[key] : anything()),
    });
    // The overlay file is the tree's own source, evaluated only against stubs (no Orca module).
    return new Function('env', `with (env) { ${js} }`)(env);
}

/**
 * Clause f (65-WR-01), run, not read, over pb-workspace-api.ts with Orca's host resolver stubbed by the outcome under
 * test: an open file whose worktree is unknown, or whose host Orca cannot resolve, or resolves to a host other than
 * the local one or the paired runtime, is not local; a folder workspace's file finds its worktree (Orca's synthetic row,
 * with its path) instead of an empty path; a file of a resolved local worktree stays local (control).
 */
const ORCA_SHARED_CONSTANTS = join(ORCA, 'src', 'shared', 'constants.ts');

/** Orca's floating-workspace sentinel id, from its shared constants; a fixed stand-in when orca/src is absent. */
function floatingWorktreeId() {
    const m = existsSync(ORCA_SHARED_CONSTANTS) && /export const FLOATING_TERMINAL_WORKTREE_ID = '([^']+)'/.exec(readFileSync(ORCA_SHARED_CONSTANTS, 'utf8'));
    return m ? m[1] : 'global-floating-terminal';
}

export function checkLocalPredicate(apiText, floatingId = floatingWorktreeId()) {
    const resolutions = new Map();
    const stubs = {
        LOCAL_EXECUTION_HOST_ID: 'local',
        toRuntimeExecutionHostId: id => `runtime:${encodeURIComponent(id)}`,
        readStoredWebRuntimeEnvironment: () => ({ id: 'env-1' }),
        // Orca's own predicate (shared/floating-workspace-worktree.ts), over the id derived from its constants.
        isFloatingWorkspaceId: id => id === floatingId,
        FLOATING_TERMINAL_WORKTREE_ID: floatingId,
        createRepoRowExecutionHostLookup: () => ({}),
        resolveWorktreeExecutionHost: (_lookup, worktree) => resolutions.get(worktree.id) ?? { kind: 'unresolved', reason: 'unknown' },
        getFolderWorkspaceWorktree: f => ({ id: `folder:${f.id}`, repoId: `folder-workspace:${f.projectGroupId}`, path: f.folderPath, isArchived: false, hostId: f.executionHostId ?? 'local' }),
    };
    const mod = evaluate(apiText, ['openFileRecords'], stubs);
    if (!mod) return ['openFileRecords is absent from pb-workspace-api.ts (source moved)'];
    const file = (id, worktreeId) => ({ id, worktreeId, filePath: `/x/${id}`, relativePath: id, mode: 'edit' });
    const state = {
        repos: [],
        worktreesByRepo: { r: [
            { id: 'w-local', repoId: 'r', path: '/w/local', isArchived: false, hostId: 'local' },
            { id: 'w-hostless', repoId: 'r', path: '/w/hostless', isArchived: false },
            { id: 'w-ssh', repoId: 'r', path: '/w/ssh', isArchived: false },
        ] },
        folderWorkspaces: [{ id: 'f1', projectGroupId: 'g', folderPath: '/folder/one', executionHostId: 'ssh:remote' }],
        openFiles: [file('a', 'w-local'), file('b', 'w-hostless'), file('c', 'w-ssh'), file('d', 'w-unknown'), file('e', 'folder:f1'), file('g', floatingId)],
        unifiedTabsByWorktree: {},
        activeFileIdByWorktree: {},
    };
    resolutions.set('w-local', { kind: 'resolved', hostId: 'local' });
    resolutions.set('w-ssh', { kind: 'resolved', hostId: 'ssh:remote' });
    resolutions.set('folder:f1', { kind: 'resolved', hostId: 'ssh:remote' });
    let records;
    try { records = mod.openFileRecords(state); } catch (error) { return [`openFileRecords threw over the fixture state: ${error.message}`]; }
    const by = Object.fromEntries(records.map(r => [r.id, r]));
    const fails = [];
    if (by.a?.local !== true) fails.push('control: a file of a resolved local worktree is not local');
    if (by.b?.local !== false) fails.push('a file of a worktree with no host of its own and no resolvable repo row counts as local (fails open)');
    if (by.c?.local !== false) fails.push('a file of a worktree whose host resolves to an SSH host counts as local');
    if (by.d?.local !== false) fails.push('a file of an unknown worktree counts as local (fails open)');
    if (by.e?.worktreePath !== '/folder/one') fails.push(`a folder workspace's file gets worktreePath "${by.e?.worktreePath}" instead of its folder: its diff routes join against the filesystem root`);
    if (by.e?.local !== false) fails.push('a file of a remote folder workspace counts as local');
    if (by.g?.local !== true) fails.push(`a file of Orca's floating workspace (${floatingId}: floating-terminal opens, keybindings.json) is not local, though Orca resolves it to its local host`);
    // The same rule in B-3 (subscribeWorktrees), through its own projection.
    const b3 = evaluate(apiText, ['subscribeWorktrees'], { ...stubs, useAppStore: { getState: () => state, subscribe: () => () => {} } });
    let projected = null;
    try { b3?.subscribeWorktrees(value => { projected = value; }); } catch (error) { return [...fails, `subscribeWorktrees threw over the fixture state: ${error.message}`]; }
    const w = Object.fromEntries((projected?.worktrees ?? []).map(x => [x.id, x]));
    if (!projected) fails.push('subscribeWorktrees is absent or never called back (source moved)');
    else {
        if (w['w-local']?.local !== true) fails.push('control: subscribeWorktrees reports a resolved local worktree as not local');
        if (w['w-hostless']?.local !== false || w['w-ssh']?.local !== false) fails.push('subscribeWorktrees reports a host-less or SSH-hosted worktree as local (fails open)');
        if (projected.folders?.[0]?.local !== false) fails.push('subscribeWorktrees reports a remote folder workspace as local');
    }
    return fails;
}

const WORKTREE_HELPERS = join(ORCA, 'src', 'renderer', 'src', 'store', 'slices', 'worktree-helpers.ts');
const HYDRATED_FIELD = 'hasHydratedWorktreePurge';

/**
 * Clause f2 (65-WR-03), run: B-3 (subscribeWorktrees) reports `hydrated` exactly as Orca's store flag that the first
 * authoritative worktree listing is complete (HYDRATED_FIELD, which Orca's worktree slice must still declare as a
 * boolean): false while the store's flag is false, true once it is. A projection without the flag, or one that
 * reports hydrated before the store does, is red.
 */
export function checkHydratedFlag(apiText, helpersText) {
    if (!new RegExp(`\\b${HYDRATED_FIELD}: boolean\\b`).test(helpersText)) return [`Orca's worktree slice no longer declares ${HYDRATED_FIELD}: boolean (source moved): find the field that means "the first full worktree list has arrived"`];
    const fails = [];
    for (const flag of [false, true]) {
        const state = { repos: [], worktreesByRepo: {}, folderWorkspaces: [], [HYDRATED_FIELD]: flag };
        const mod = evaluate(apiText, ['subscribeWorktrees'], {
            LOCAL_EXECUTION_HOST_ID: 'local', toRuntimeExecutionHostId: id => `runtime:${id}`, readStoredWebRuntimeEnvironment: () => null,
            useAppStore: { getState: () => state, subscribe: () => () => {} },
        });
        let projected = null;
        try { mod?.subscribeWorktrees(v => { projected = v; }); } catch (error) { return [`subscribeWorktrees threw: ${error.message}`]; }
        if (!projected) return ['subscribeWorktrees is absent or never called back (source moved)'];
        if (!('hydrated' in projected)) { fails.push('subscribeWorktrees sends no hydrated flag: the host still guesses when the worktree list is complete'); break; }
        if (projected.hydrated !== flag) fails.push(`subscribeWorktrees reports hydrated=${projected.hydrated} while Orca's ${HYDRATED_FIELD} is ${flag}`);
    }
    return fails;
}

async function clauseF() {
    if (!(await loadTs())) return { skip: 'theia/node_modules/typescript is absent (install Theia)' };
    const api = readFileSync(WORKSPACE_API, 'utf8');
    const fails = checkLocalPredicate(api);
    if (existsSync(WORKTREE_HELPERS)) fails.push(...checkHydratedFlag(api, readFileSync(WORKTREE_HELPERS, 'utf8')));
    else return { fails, partial: 'hydrated flag not checked: orca/src is absent (run scripts/fetch-orca.sh)' };
    return { fails };
}

// ---------------------------------------------------------------- driver

const CLAUSES = [['a', clauseA], ['b', clauseB], ['c', clauseC], ['d', clauseD], ['e', clauseE], ['f', clauseF]];

// FAIL wins; a clause, or half of one, not run for an absent input makes the run exit 77 with one SKIP line
// printed last (SKIP-PROTOCOL.md); exit 0 means every clause ran.
async function main() {
    let failed = 0;
    const notes = [];
    const skips = [];
    for (const [id, run] of CLAUSES) {
        const r = await run();
        if (r.skip) { skips.push(`clause ${id} not run: ${r.skip}`); continue; }
        for (const f of r.fails) { console.log(`${NAME}: FAIL (clause ${id}) -- ${f}`); failed += 1; }
        if (r.partial) skips.push(`clause ${id} ${r.partial}`);
        if (r.note) notes.push(`${id}: ${r.note}`);
    }
    const code = verdictExit(NAME, failed ? [`${failed} failure(s)`] : [], skips);
    if (code === 0) console.log(`${NAME}: PASS -- ${CLAUSES.length} clause(s)${notes.length ? `; ${notes.join('; ')}` : ''}`);
    return code;
}

/**
 * SKIP control (SKIP-PROTOCOL.md rule 2): the main mode, run as a child with its output captured, over a tree holding
 * the overlay sources and Theia's typescript but no orca/. Clauses c to e run green; a and b do not run and f's
 * hydrated half does not, so it must exit 77 with the SKIP line last and no PASS line.
 */
function skipControl() {
    const dir = mkdtempSync(join(tmpdir(), 'pb-overlay-renderer-root-'));
    try {
        for (const file of [CSS_PASS, ENTRY, WORKSPACE_API]) {
            const dest = join(dir, file.slice(REPO_ROOT.length + 1));
            mkdirSync(dirname(dest), { recursive: true });
            copyFileSync(file, dest);
        }
        const tsDir = join(REPO_ROOT, 'theia', 'node_modules', 'typescript');
        if (existsSync(tsDir)) {
            mkdirSync(join(dir, 'theia', 'node_modules'), { recursive: true });
            symlinkSync(tsDir, join(dir, 'theia', 'node_modules', 'typescript'));
        }
        const r = spawnSync(process.execPath, [SELF, `--root=${dir}`], { encoding: 'utf8' });
        const lines = (r.stdout ?? '').split('\n').filter(l => l.trim() !== '');
        const last = lines[lines.length - 1] ?? '';
        const good = r.status === SKIP_EXIT && last.startsWith(`${NAME}: SKIP -- clause a not run`)
            && !lines.some(l => l.includes(`${NAME}: PASS`) || l.includes(`${NAME}: FAIL`)) && !/: SKIP/.test(r.stderr ?? '');
        return { good, detail: `status ${r.status}, last line ${JSON.stringify(last.slice(0, 200))}${r.stderr ? `, stderr ${JSON.stringify(r.stderr.slice(0, 200))}` : ''}` };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

async function selfTest() {
    let failed = 0;
    const ok = (name, cond) => { console.log(`  ${cond ? 'ok ' : 'NOT OK '} ${name}`); if (!cond) failed += 1; };
    const selfSkips = [];
    const control = skipControl();
    ok(`control: a tree without orca/ exits 77 with the SKIP line last and no PASS line (${control.detail})`, control.good);
    // a.
    if (!existsSync(POSTCSS_ESM) || !existsSync(MAIN_CSS)) {
        console.log('  skip a: orca/node_modules/postcss or orca main.css is absent (run scripts/build-orca.sh)');
        selfSkips.push('the clause a plants did not run: orca/node_modules/postcss or orca main.css is absent (run scripts/build-orca.sh)');
    } else {
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
    }
    if (!(await loadTs())) {
        console.log('  skip b..f: theia/node_modules/typescript is absent (install Theia)');
        selfSkips.push('the clause b to f plants did not run: theia/node_modules/typescript is absent (install Theia)');
    } else {
        const entry = readFileSync(ENTRY, 'utf8');
        // b.
        if (!existsSync(ORCA_CONSTANTS)) {
            console.log('  skip b: orca/src is absent (run scripts/fetch-orca.sh)');
            selfSkips.push('the clause b plants did not run: orca/src is absent (run scripts/fetch-orca.sh)');
        } else {
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
        // b2.
        const lifecycle = readFileSync(LIFECYCLE_CLOSE, 'utf8');
        ok('b2: derived: Orca\'s leaf close still closes the tab for a single-pane manager', !checkLeafEventScope(entry, lifecycle).note);
        ok('b2: control green on the tree', checkLeafEventScope(entry, lifecycle).fails.length === 0);
        const unguarded2 = entry.replace(/\n\s*if \(!leafEventIsPaneScoped\(tabId, leafId\)\) \{\n\s*closeTab\(\)\n\s*return\n\s*\}/g, '');
        ok('b2: the unguarded-leaf-event plant applies', unguarded2 !== entry);
        ok('b2: a leaf event sent while an instance holds only that leaf (the first overlay-renderer-01 fix) is red, naming it', checkLeafEventScope(unguarded2, lifecycle).fails.some(f => /closes the whole tab there, unprompted/.test(f)));
        const alwaysTab = entry.replace(/function leafEventIsPaneScoped\(tabId: string, leafId: string\): boolean \{/, '$&\n  return false');
        ok('b2: a leaf close that always falls back to the tab close is red, naming it', alwaysTab !== entry && checkLeafEventScope(alwaysTab, lifecycle).fails.some(f => /want 1 and 0/.test(f)));
        ok('b2: Orca dropping the single-pane tab close turns b2 into a note', !!checkLeafEventScope(entry, lifecycle.replace(/getPanes\(\)\.length <= 1\)/g, 'getPanes().length < 1)')).note);
        }
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
        // G3b handoff (64-WR-01, pairing-credentials-01, 67-WR-02): a boot that rejects once and then succeeds ends
        // mounted with exactly one root. A step after the services root fails once; the root must not be made twice.
        const afterRoot = entry.replace(/\n(\s*)isBooted = true\n/, '\n$1pbPlantedAfterRoot()\n$1isBooted = true\n');
        ok('e: the after-root plant applies', afterRoot !== entry);
        ok('e: control: a step failing after the root, with the root installed once, is green', (await checkBootstrapRetry(afterRoot)).length === 0);
        const secondRoot = afterRoot.replace("await once('services root'", "await step('services root'");
        ok('e: a retried boot that creates a second services root is red, naming it', secondRoot !== afterRoot && (await checkBootstrapRetry(secondRoot)).some(f => /2 services root\(s\)/.test(f)));
        const pairingCached = cached;
        ok('e: a boot that failed at pairing and is not retried (pre-fix) is red, naming it', (await checkBootstrapRetry(pairingCached)).some(f => /after pairSessionOnly failed once, a second bootstrap did not run again/.test(f)));
        ok('e: no install step is red "parser blind"', (await checkBootstrapRetry(entry.replace(/assertSessionOnly\(\)/g, 'assertSessionOnlyX()'))).some(f => /parser blind/.test(f)));
        // f.
        const api = readFileSync(WORKSPACE_API, 'utf8');
        ok('f: control green on the tree', checkLocalPredicate(api).length === 0);
        const openUnknown = api.replace(/if \(!worktree\) return false/, 'if (!worktree) return true');
        ok('f: the unknown-worktree plant applies', openUnknown !== api);
        ok('f: an unknown worktree counted local is red, naming it', checkLocalPredicate(openUnknown).some(f => /unknown worktree counts as local/.test(f)));
        const noFolders = api.replace(/new Map\(allWorktreeRecords\(state\)/, 'new Map(worktreeRecords(state)');
        ok('f: the folder-lookup plant applies', noFolders !== api);
        ok('f: a folder file looked up only in worktreesByRepo is red, naming it', checkLocalPredicate(noFolders).some(f => /folder workspace's file gets worktreePath ""/.test(f)));
        const noResolver = api.replace(/const host = resolveWorktreeExecutionHost\(lookup, worktree\)\n\s*return host\.kind === 'resolved' && hostIsPaired\(host\.hostId, paired\)/, "return !worktree.hostId || worktree.hostId === 'local'");
        ok('f: the host-less plant applies', noResolver !== api);
        ok('f: a host-less worktree taken as local without Orca\'s resolver is red, naming it', checkLocalPredicate(noResolver).some(f => /no host of its own/.test(f)));
        const noFloating = api.replace(/\(isFloatingWorkspaceId\(file\.worktreeId\) \|\| (worktreeIsLocal\(worktree, lookup, paired\))\)/, '$1');
        ok('f: the floating-workspace plant applies', noFloating !== api);
        ok('f: Orca\'s floating workspace failing closed (the first 65-WR-01 fix) is red, naming it', checkLocalPredicate(noFloating).some(f => /floating workspace .* is not local/.test(f)));
        // f2 (65-WR-03).
        if (existsSync(WORKTREE_HELPERS)) {
            const helpers = readFileSync(WORKTREE_HELPERS, 'utf8');
            ok('f2: control green on the tree', checkHydratedFlag(api, helpers).length === 0);
            const noFlag = api.replace(/,\n\s*hydrated: state\.hasHydratedWorktreePurge === true\n/, '\n');
            ok('f2: the no-flag plant applies', noFlag !== api);
            ok('f2: a projection without the hydrated flag is red, naming it', checkHydratedFlag(noFlag, helpers).some(f => /sends no hydrated flag/.test(f)));
            const early = api.replace(/hydrated: state\.hasHydratedWorktreePurge === true/, 'hydrated: true');
            ok('f2: a projection that reports hydrated before the store does is red, naming it', early !== api && checkHydratedFlag(early, helpers).some(f => /reports hydrated=true while/.test(f)));
            ok('f2: Orca dropping the field is red "source moved"', checkHydratedFlag(api, helpers.replace(/hasHydratedWorktreePurge: boolean/g, 'hydratedPurge: boolean')).some(f => /source moved/.test(f)));
        } else {
            console.log('  skip f2: orca/src is absent');
            selfSkips.push('the f2 plants did not run: orca/src is absent (run scripts/fetch-orca.sh)');
        }
        ok('c: no store listener is red "parser blind"', checkStoreListeners(entry.replace(/useAppStore\.subscribe\(\(state, prior\)/, 'useAppStore.subscribeTo((state, prior)')).some(f => /parser blind/.test(f)));
    }
    // The self-test's own verdict is its last line: FAIL wins, then a SKIP naming the plants that did not run.
    if (failed) { console.log(`${NAME} self-test: FAIL -- ${failed} case(s)`); return 1; }
    if (selfSkips.length) { console.log(skipLine(`${NAME} self-test`, selfSkips.join('; '))); return SKIP_EXIT; }
    console.log(`${NAME} self-test: PASS -- every planted fault went red naming it, and a tree without orca/ exits 77`);
    return 0;
}

if (IS_MAIN) {
    const args = process.argv.slice(2);
    if (args.some(a => a !== '--self-test' && !a.startsWith('--root='))) { console.error('usage: node scripts/verify-orca-overlay-renderer.mjs [--self-test]'); process.exit(2); }
    process.exit(args.includes('--self-test') ? await selfTest() : await main());
}
