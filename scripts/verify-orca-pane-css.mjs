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
// a root property), each red naming it. SKIP when orca/ has not been built with the overlay.
//
// Default (full): over the built sheet orca/out/web/assets/pb-panes/pb-panes.css and Theia's built
// frontend CSS (theia/applications/browser/lib/frontend/*.css), derived at check time:
//   a. Orca's keyframe names and Theia's are disjoint;
//   b. no custom property declared on an unscoped root or theme rule of pb-panes.css is read
//      through var() by any Theia sheet;
//   c. every other rule of pb-panes.css carries the scope.
// SKIP named when the bundle or the Theia frontend is not built.
//
// Usage:
//   node scripts/verify-orca-pane-css.mjs
//   node scripts/verify-orca-pane-css.mjs --self-test

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
        const bad = rule.selectors.filter(s => !s.includes(pass.PANE_ROOT) && !s.includes(pass.PORTAL_ROOTS));
        if (bad.length) unscoped.push(bad[0]);
    });
    if (unscoped.length) fails.push(`${unscoped.length} rule selector(s) of the pane sheet carry no scope, first: ${unscoped[0].slice(0, 120)}`);
    const theia = theiaTexts.join('\n');
    const read = [...rootProps].filter(p => new RegExp(`var\\(\\s*${p.replace(/[-]/g, '\\-')}\\s*[,)]`).test(theia));
    if (read.length) fails.push(`root custom propert(y/ies) of the pane sheet read by a Theia sheet through var(): ${read.slice(0, 8).join(', ')}`);
    return { fails, counts: { orcaFrames: orcaFrames.size, theiaFrames: theiaFrames.size, rootProps: rootProps.size, rules } };
}

async function selfTest() {
    const loaded = await loadPass();
    if (loaded.skip) { console.log(`${NAME} self-test: SKIP -- ${loaded.skip}`); return 0; }
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
    console.log(failed ? `${NAME} self-test: FAIL -- ${failed} case(s)` : `${NAME} self-test: PASS -- ${fx.length} fixtures, every planted fault went red naming it`);
    return failed ? 1 : 0;
}

async function main() {
    if (!existsSync(SHEET)) { console.log(`${NAME}: SKIP -- no built pane sheet (orca/out/web/assets/pb-panes/pb-panes.css; run scripts/build-orca.sh)`); return 0; }
    const theiaFiles = existsSync(THEIA_CSS_DIR) ? readdirSync(THEIA_CSS_DIR).filter(f => f.endsWith('.css')).map(f => join(THEIA_CSS_DIR, f)) : [];
    if (!theiaFiles.length) { console.log(`${NAME}: SKIP -- no built Theia frontend CSS (theia/applications/browser/lib/frontend/*.css; yarn build in theia/)`); return 0; }
    const loaded = await loadPass();
    if (loaded.skip) { console.log(`${NAME}: SKIP -- ${loaded.skip}`); return 0; }
    if (loaded.fail) { console.log(`${NAME}: FAIL -- ${loaded.fail}`); return 1; }
    const r = checkSheets(loaded.pass, loaded.postcss, readFileSync(SHEET, 'utf8'), theiaFiles.map(f => readFileSync(f, 'utf8')));
    if (r.fails.length) { for (const f of r.fails) console.log(`${NAME}: FAIL -- ${f}`); return 1; }
    const c = r.counts;
    console.log(`${NAME}: PASS -- ${c.rules} rule(s) scoped; ${c.orcaFrames} Orca keyframe name(s) disjoint from Theia's ${c.theiaFrames}; ${c.rootProps} root custom propert(y/ies) read by no Theia sheet`);
    return 0;
}

const SELF = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === SELF) {
    const args = process.argv.slice(2);
    if (args.some(a => a !== '--self-test')) { console.error('usage: node scripts/verify-orca-pane-css.mjs [--self-test]'); process.exit(2); }
    process.exit(args.includes('--self-test') ? await selfTest() : await main());
}
