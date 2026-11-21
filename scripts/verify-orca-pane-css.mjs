#!/usr/bin/env node
// scripts/verify-orca-pane-css.mjs
//
// orca-pane-css (Phase 64, TAB-04, spike 004 condition 1; P64-14, 64-RESEARCH A3, Pitfall 5): the
// scoping pass of the Orca pane bundle (orca-overlay/files/pb-css-scope.mjs), statically.
//
// --self-test (quick): the pass (its copy orca/pb-css-scope.mjs, which build-orca.sh writes and
// must equal the overlay file; Orca's node_modules/postcss beside it) over fixture rules (a root, a
// qualified root, a theme class, the universal selector, a pseudo-element, a portal self variant,
// keyframes with an animation, a root custom property, a host-owned --vscode-* property), compared with the expected output; then
// planted faults (a pseudo-element moved before the scope, an unprefixed keyframe, a scoped custom
// property, a dropped portal variant, an unscoped rule, a colliding keyframe, a Theia var() read of
// a root property), each red naming it; then the pass itself mutated (a scope wrapped in :not(), a descendant
// rule left unscoped), its sheet run through clause c, each red. When orca/ has not been built with the overlay
// the row exits 77 with the one SKIP line (SKIP-PROTOCOL.md).
//
// Default (full): over the built sheet orca/out/web/assets/pb-panes/pb-panes.css and Theia's built
// frontend CSS (theia/applications/browser/lib/frontend/*.css), derived at check time:
//   a. Orca's keyframe names and Theia's are disjoint;
//   b. no custom property declared on an unscoped root or theme rule of pb-panes.css is read
//      through var() by any Theia sheet;
//   c. every other rule of pb-panes.css carries the scope in a position that constrains it
//      (harness-static-structure-13): the scope pseudo, :where(<pane root>, <portal roots>) or :where(<portal roots>),
//      or the bare pane root, at the top level of the selector. The scope inside :not(), :is() or
//      another :where() argument list, or in a longer :where() list, does not constrain the subject.
// The row exits 77 with the one SKIP line when the bundle or the Theia frontend is not built.
//
// Usage:
//   node scripts/verify-orca-pane-css.mjs
//   node scripts/verify-orca-pane-css.mjs --self-test

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { entryPoint, mismatchMessage } from './lib/entry-point.mjs';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-pane-css';
const ORCA = join(REPO_ROOT, 'orca');
const PASS_COPY = join(ORCA, 'pb-css-scope.mjs');
const PASS_SOURCE = join(REPO_ROOT, 'orca-overlay', 'files', 'pb-css-scope.mjs');
const SHEET = join(ORCA, 'out', 'web', 'assets', 'pb-panes', 'pb-panes.css');
const THEIA_CSS_DIR = join(REPO_ROOT, 'theia', 'applications', 'browser', 'lib', 'frontend');

/** The pass and postcss, from the built Orca tree; null with a reason when not available. */
async function loadPass() {
    if (!existsSync(PASS_COPY) || !existsSync(join(ORCA, 'node_modules', 'postcss'))) return { skip: 'orca/pb-css-scope.mjs or orca/node_modules/postcss is absent (run nix develop .#orca --command bash scripts/build-orca.sh)' };
    if (readFileSync(PASS_COPY, 'utf8') !== readFileSync(PASS_SOURCE, 'utf8')) return { fail: 'orca/pb-css-scope.mjs differs from orca-overlay/files/pb-css-scope.mjs (run scripts/build-orca.sh --panes-only)' };
    const pass = await import(pathToFileURL(PASS_COPY).href);
    const postcss = createRequire(join(ORCA, 'package.json'))('postcss');
    return { pass, postcss };
}

const squash = s => s.replace(/\s+/g, ' ').replace(/\s*([{}:;,])\s*/g, '$1').trim();

/** The fixtures: [name, input, expected output after the two prepended resets], S and P expanded. */
export function fixtures(pass) {
    const S = pass.SCOPE, P = pass.PORTAL_ROOTS;
    return [
        ['root', 'html{color:red}', `${S}{color:red}`],
        ['qualified root', ':root.dark .x{color:red}', `:root.dark ${S} .x{color:red}`],
        ['theme class', '.dark .btn{color:red}', `.dark ${S} .btn{color:red}`],
        ['universal selector', '*{box-sizing:border-box}', `${S} *,*:where(${P}){box-sizing:border-box}`],
        ['pseudo-element', '.a::before{content:""}', `${S} .a::before,.a:where(${P})::before{content:""}`],
        ['portal self', '.b{opacity:1}', `${S} .b,.b:where(${P}){opacity:1}`],
        ['keyframes', '@keyframes spin{to{transform:rotate(1turn)}}.c{animation:spin 1s linear}', `@keyframes pb-orca-spin{to{transform:rotate(1turn)}}${S} .c,.c:where(${P}){animation:pb-orca-spin 1s linear}`],
        ['root custom property', ':root{--k:1;color:red}', `:root{--k:1}${S}{color:red}`],
        ['host-owned custom property', ':root{--vscode-sash-size:4px}', `${S}{--vscode-sash-size:4px}`],
    ];
}

/** The pass's output minus its two prepended resets (which are checked once, by name). */
export function runFixture(pass, postcss, input) {
    const root = postcss.parse(pass.scopeCss(input));
    const [paneReset, portalReset] = root.nodes;
    const resets = paneReset?.selector === pass.PANE_ROOT && /font-size:\s*medium\s*!important/.test(String(paneReset)) && portalReset?.selector === `:where(${pass.PORTAL_ROOTS})`;
    paneReset?.remove(); portalReset?.remove();
    return { body: squash(root.toString()), resets };
}

/** Fixture names whose (possibly planted) output differs from the expected one. */
export function compareFixtures(results, expected) {
    return expected.filter(([name, , want]) => squash(want) !== results[name]).map(([name]) => name);
}

// After a scope compound (which ends where the compound ends), the next combinator must be a descendant (whitespace) or
// a child (>) combinator, or there is none. A sibling combinator (~ or +) right after the scope styles elements that
// are beside the scope, outside the pane: `[scope] ~ .btn`, `[scope] + *` (harness-static-structure-13).
function followedByDescendant(selector, from) {
    let depth = 0;
    let j = from;
    for (; j < selector.length; j++) {
        const c = selector[j];
        if (c === '\\') { j++; continue; }
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (depth === 0 && /[\s>+~]/.test(c)) break;
    }
    while (j < selector.length && /\s/.test(selector[j])) j++;
    return j >= selector.length || (selector[j] !== '+' && selector[j] !== '~');
}

/**
 * Does the scope constrain this selector? True when, at the top level of the selector (outside every parenthesis and
 * bracket), the pass's own scope appears: pass.SCOPE, :where(<portal roots>) or the bare pane root. The scope as an
 * argument of :not(), :is() or another :where() does not constrain the subject, so it is not found there.
 */
export function scopeConstrains(selector, pass) {
    const forms = [pass.SCOPE, `:where(${pass.PORTAL_ROOTS})`, pass.PANE_ROOT];
    let depth = 0;
    let quote = null;
    for (let i = 0; i < selector.length; i++) {
        const c = selector[i];
        if (c === '\\') { i++; continue; } // a CSS escape: the next character is part of an identifier
        if (quote) { if (c === quote) quote = null; continue; }
        if (depth === 0) {
            const form = forms.find(f => selector.startsWith(f, i));
            if (form !== undefined && followedByDescendant(selector, i + form.length)) return true;
        }
        if (c === '"' || c === "'") quote = c;
        else if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
    }
    return false;
}

const keyframesOf = (postcss, text) => { const out = new Set(); postcss.parse(text).walkAtRules(/keyframes$/i, at => out.add(at.params.trim())); return out; };

/** Clauses a-c over one pb-panes sheet and the Theia sheets' texts. */
export function checkSheets(pass, postcss, sheetText, theiaTexts) {
    const fails = [];
    const orcaFrames = keyframesOf(postcss, sheetText);
    const theiaFrames = new Set(theiaTexts.flatMap(t => [...keyframesOf(postcss, t)]));
    const clash = [...orcaFrames].filter(n => theiaFrames.has(n));
    if (clash.length) fails.push(`keyframe name(s) defined by both Orca's pane sheet and Theia: ${clash.join(', ')} (Pitfall 5)`);
    const rootProps = new Set();
    const unscoped = [];
    let rules = 0;
    postcss.parse(sheetText).walkRules(rule => {
        for (let p = rule.parent; p; p = p.parent) if ((p.type === 'atrule' && /keyframes$/i.test(p.name)) || p.type === 'rule') return;
        rules += 1;
        if (rule.selectors.every(s => pass.isRootOrTheme(s) && !s.includes(pass.PANE_ROOT))) {
            const decls = rule.nodes.filter(n => n.type === 'decl');
            if (decls.length && decls.every(d => d.prop.startsWith('--'))) { decls.forEach(d => rootProps.add(d.prop)); return; }
        }
        const bad = rule.selectors.filter(s => !scopeConstrains(s, pass));
        if (bad.length) unscoped.push(bad[0]);
    });
    if (unscoped.length) fails.push(`${unscoped.length} rule selector(s) of the pane sheet carry no scope, first: ${unscoped[0].slice(0, 120)}`);
    const theia = theiaTexts.join('\n');
    const read = [...rootProps].filter(p => new RegExp(`var\\(\\s*${p.replace(/[-]/g, '\\-')}\\s*[,)]`).test(theia));
    if (read.length) fails.push(`root custom propert(y/ies) of the pane sheet read by a Theia sheet through var(): ${read.slice(0, 8).join(', ')}`);
    return { fails, counts: { orcaFrames: orcaFrames.size, theiaFrames: theiaFrames.size, rootProps: rootProps.size, rules } };
}

/** The pass with one source edit applied, loaded from a scratch directory beside a link to orca/node_modules (never written under orca/). */
async function mutatedPass(from, to) {
    const text = readFileSync(PASS_COPY, 'utf8');
    if (!text.includes(from)) throw new Error(`the mutation anchor is absent from orca/pb-css-scope.mjs: ${from}`);
    const dir = mkdtempSync(join(tmpdir(), `${NAME}-mut-`));
    try {
        symlinkSync(join(ORCA, 'node_modules'), join(dir, 'node_modules'));
        writeFileSync(join(dir, 'pb-css-scope.mjs'), text.replace(from, to));
        return await import(`${pathToFileURL(join(dir, 'pb-css-scope.mjs')).href}?t=${Date.now()}${Math.random()}`);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

async function selfTest() {
    const loaded = await loadPass();
    if (loaded.skip) { console.log(skipLine(`${NAME} self-test`, `${loaded.skip}, so the planted faults did not run`)); return SKIP_EXIT; }
    if (loaded.fail) { console.log(`${NAME} self-test: FAIL -- ${loaded.fail}`); return 1; }
    const { pass, postcss } = loaded;
    let failed = 0;
    const ok = (name, cond) => { console.log(`  ${cond ? 'ok ' : 'NOT OK '} ${name}`); if (!cond) failed += 1; };
    const fx = fixtures(pass);
    const results = {};
    let resets = true;
    for (const [name, input] of fx) { const r = runFixture(pass, postcss, input); results[name] = r.body; resets &&= r.resets; }
    ok('every fixture matches its expected output', compareFixtures(results, fx).length === 0);
    ok('both resets are prepended (pane !important, portal at zero specificity)', resets);
    const P = pass.PORTAL_ROOTS;
    const planted = (name, from, to) => ({ ...results, [name]: results[name].split(squash(from)).join(squash(to)) });
    ok('a pseudo-element moved before the scope is red', compareFixtures(planted('pseudo-element', `.a:where(${P})::before`, `.a::before:where(${P})`), fx).join() === 'pseudo-element');
    ok('an unprefixed keyframe is red', compareFixtures(planted('keyframes', 'pb-orca-spin', 'spin'), fx).join() === 'keyframes');
    ok('a scoped custom property is red', compareFixtures(planted('root custom property', ':root{--k:1}', `${pass.SCOPE}{--k:1}`), fx).join() === 'root custom property');
    ok('a dropped portal variant is red', compareFixtures(planted('portal self', `,.b:where(${P})`, ''), fx).join() === 'portal self');
    const sheet = pass.scopeCss(':root{--pb-k:1}@keyframes spin{to{opacity:0}}.c{animation:spin 1s}');
    ok('built-sheet control green', checkSheets(pass, postcss, sheet, ['.t{color:var(--other)}@keyframes theia-only{to{opacity:1}}']).fails.length === 0);
    ok('an unscoped rule is red', checkSheets(pass, postcss, `${sheet}.leak{color:red}`, []).fails.some(f => /carry no scope, first: \.leak/.test(f)));
    ok('a keyframe colliding with Theia is red', checkSheets(pass, postcss, sheet, ['@keyframes pb-orca-spin{to{opacity:1}}']).fails.some(f => /both Orca's pane sheet and Theia: pb-orca-spin/.test(f)));
    ok('a Theia var() read of a root property is red', checkSheets(pass, postcss, sheet, ['.t{color:var(--pb-k)}']).fails.some(f => /read by a Theia sheet through var\(\): --pb-k/.test(f)));
    // Clause c over selectors that carry the scope without being constrained by it (harness-static-structure-13).
    const scopeArg = pass.SCOPE;
    for (const [what, selector] of [
        ['the scope inside :not()', `.leak:not(${scopeArg}) .btn`],
        ['the scope inside :is()', `.leak :is(${scopeArg}, .other)`],
        ['the pane root inside a longer :where() list', `.leak:where(.other, ${pass.PANE_ROOT})`],
        ['the pane root as an attribute value', `.leak[title="${pass.PANE_ROOT}"]`],
        ['a sibling combinator (~) right after the scope', `${scopeArg} ~ .btn`],
        ['a sibling combinator (+) right after the scope', `${scopeArg} + *`],
        ['a spaced sibling combinator after the pane root', `${pass.PANE_ROOT}   ~   .btn`],
    ]) {
        ok(`${what} is red`, checkSheets(pass, postcss, `${selector}{color:red}`, []).fails.some(f => /carry no scope, first: /.test(f)));
    }
    for (const [what, selector] of [
        ['the scope as an ancestor', `${scopeArg} .btn`],
        ['the scope as a parent (>)', `${scopeArg} > .btn`],
        ['a sibling combinator after a descendant step', `${scopeArg} .a ~ .b`],
        ['the scope with an :nth-child(2n+1) tail on its compound', `${scopeArg}:nth-child(2n+1) .btn`],
        ['the portal self variant', `.btn:where(${pass.PORTAL_ROOTS})`],
        ['a qualified root before the scope', `:root.dark ${scopeArg} .btn`],
        ['the portal self variant before a pseudo-element', `.a:where(${pass.PORTAL_ROOTS})::before`],
        ['an escaped class name with brackets and a quote before the portal variant', `.before\\:content-\\[\\'\\'\\]:before:where(${pass.PORTAL_ROOTS})`],
    ]) {
        ok(`${what} stays green`, checkSheets(pass, postcss, `${selector}{color:red}`, []).fails.length === 0);
    }
    // The pass itself mutated: its sheet, not a result string, goes through clause c.
    const input = '.a{color:red}';
    const notWrapped = await mutatedPass('return [`${SCOPE} ${sel}`, self]', 'return [`:not(${SCOPE}) ${sel}`, self]');
    ok('a pass that wraps the scope in :not() yields a sheet clause c rejects', checkSheets(notWrapped, postcss, notWrapped.scopeCss(input), []).fails.some(f => /carry no scope, first: :not\(/.test(f)));
    const unscoped = await mutatedPass('return [`${SCOPE} ${sel}`, self]', 'return [sel]');
    ok('a pass that leaves a descendant rule unscoped yields a sheet clause c rejects', checkSheets(unscoped, postcss, unscoped.scopeCss(input), []).fails.some(f => /carry no scope, first: \.a/.test(f)));
    ok('the real pass yields a sheet clause c accepts', checkSheets(pass, postcss, pass.scopeCss(input), []).fails.length === 0);
    // The guard: through a symlinked directory the argument check must still answer (exit 2, never a silent exit 0).
    const scratch = mkdtempSync(join(tmpdir(), `${NAME}-link-`));
    try {
        symlinkSync(dirname(fileURLToPath(import.meta.url)), join(scratch, 'linked'));
        const viaLink = spawnSync(process.execPath, [join(scratch, 'linked', 'verify-orca-pane-css.mjs'), '--bogus'], { encoding: 'utf8' });
        ok('run through a symlinked directory the entry-point guard still reaches the usage check (exit 2 with the usage text, not the guard\'s mismatch message)', viaLink.status === 2 && viaLink.stderr.includes('usage: node scripts/verify-orca-pane-css.mjs') && !viaLink.stderr.includes('entry-point guard'));
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
    console.log(failed ? `${NAME} self-test: FAIL -- ${failed} case(s)` : `${NAME} self-test: PASS -- ${fx.length} fixtures, every planted fault went red naming it`);
    return failed ? 1 : 0;
}

async function main() {
    if (!existsSync(SHEET)) { console.log(skipLine(NAME, 'no built pane sheet (orca/out/web/assets/pb-panes/pb-panes.css). Next step: run scripts/build-orca.sh')); return SKIP_EXIT; }
    const theiaFiles = existsSync(THEIA_CSS_DIR) ? readdirSync(THEIA_CSS_DIR).filter(f => f.endsWith('.css')).map(f => join(THEIA_CSS_DIR, f)) : [];
    if (!theiaFiles.length) { console.log(skipLine(NAME, 'no built Theia frontend CSS (theia/applications/browser/lib/frontend/*.css). Next step: yarn build in theia/')); return SKIP_EXIT; }
    const loaded = await loadPass();
    if (loaded.skip) { console.log(skipLine(NAME, loaded.skip)); return SKIP_EXIT; }
    if (loaded.fail) { console.log(`${NAME}: FAIL -- ${loaded.fail}`); return 1; }
    const r = checkSheets(loaded.pass, loaded.postcss, readFileSync(SHEET, 'utf8'), theiaFiles.map(f => readFileSync(f, 'utf8')));
    if (r.fails.length) { for (const f of r.fails) console.log(`${NAME}: FAIL -- ${f}`); return 1; }
    const c = r.counts;
    console.log(`${NAME}: PASS -- ${c.rules} rule(s) scoped; ${c.orcaFrames} Orca keyframe name(s) disjoint from Theia's ${c.theiaFrames}; ${c.rootProps} root custom propert(y/ies) read by no Theia sheet`);
    return 0;
}

const how = entryPoint(import.meta.url);
if (how === 'mismatch') {
    console.error(mismatchMessage(NAME, import.meta.url));
    process.exit(2);
}
if (how === 'entry') {
    const args = process.argv.slice(2);
    if (args.some(a => a !== '--self-test')) { console.error('usage: node scripts/verify-orca-pane-css.mjs [--self-test]'); process.exit(2); }
    process.exit(args.includes('--self-test') ? await selfTest() : await main());
}
