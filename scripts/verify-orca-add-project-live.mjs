#!/usr/bin/env node
// scripts/verify-orca-add-project-live.mjs
//
// orca-add-project-live (Phase 65, TAB-09; criterion 3; P65-14, CA-13, D-18):
// Orca's own Add-project flow and its sidebar remove behave in PowerBrowser's
// side panel exactly as on the stock standalone page.
//
// One session of scripts/lib/orca-pane-harness.mjs with pbOrcad (a scratch
// orcad for the standalone page, PowerBrowser's own orcad for its side panel;
// ORCA_* scrubbed, redaction first). A scratch repository is created. The same
// steps run twice, control first:
//   1. the standalone page (Orca's renderer unmodified, its sidebar mounted from
//      the standalone bundle) against the scratch orcad;
//   2. PowerBrowser's Orca side panel against PowerBrowser's orcad.
// Steps: Orca's Add-project control in the sidebar; the dialog's server-path
// step (in a web client Browse goes there, CA-13): "enter a host path", the
// repository path typed into its path field, "Add Git Project"; orca repo list
// --json recorded; then the repository's header actions, "Remove Project" and
// the dialog's confirm; orca repo list --json recorded again. Every label and
// selector is derived at check time from Orca's sidebar sources (typescript).
// Required: the two after-add lists are equal as sets of paths and contain the
// repository; the two after-remove lists are equal and do not; PowerBrowser's
// owned roots (ProfileStorageService powerbrowser.orca.ownedRoots, read through
// the Theia frame) gain the repository after the add and lose it after the
// remove. That half is a named SKIP only while theia/extensions/orca-workspace
// is absent. Output names steps and counts only; never a path, the ready line,
// a pairing URL, an offer or a token.
//
// Tier: full. Runs under flock /home/chris/coding/Power-Browser/.git/pb-live.lock
// with inherited ORCA_* unset. SKIP (exit 0, one named line) while a built
// PowerBrowser, orca/out, the pane bundle or its standalone variant is absent
// (orca-pane-harness.mjs skipReasons). --self-test runs the list comparator on
// fixtures (hermetic).
//
// Usage:
//   node scripts/verify-orca-add-project-live.mjs
//   node scripts/verify-orca-add-project-live.mjs --self-test

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-add-project-live';
const SELF_REL = 'scripts/verify-orca-add-project-live.mjs';
const OWNED_ROOTS_KEY = 'powerbrowser.orca.ownedRoots';
const WORKSPACE_EXT = 'theia/extensions/orca-workspace';
const SIDEBAR = 'orca/src/renderer/src/components/sidebar';
const SRC = {
    trigger: `${SIDEBAR}/sidebar-header-actions.tsx`,
    server: `${SIDEBAR}/AddRepoServerStartStep.tsx`,
    actions: `${SIDEBAR}/worktree-list/rows/repo-header-project-actions.tsx`,
    header: `${SIDEBAR}/worktree-list/rows/SectionHeader.tsx`,
    confirm: `${SIDEBAR}/RemoveFolderDialog.tsx`,
};

// ---- the pure comparator (the self-test feeds it fixtures) ----

const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));

/**
 * Lists are arrays of repository paths; owned* are true/false, or null while the PB-owned roots half is skipped.
 * Never prints a path: the repository is named "the scratch repository".
 */
export function addProjectVerdict({ addedStandalone, addedPb, removedStandalone, removedPb, repo, ownedAfterAdd, ownedAfterRemove }) {
    const fails = [];
    if (!same([...new Set(addedStandalone)], [...new Set(addedPb)])) fails.push(`unequal after-add lists (standalone ${new Set(addedStandalone).size}, PowerBrowser ${new Set(addedPb).size} repositories)`);
    if (!addedStandalone.includes(repo)) fails.push('repository missing from the standalone after-add list (the control did not add it)');
    if (!addedPb.includes(repo)) fails.push('repository missing from PowerBrowser\'s after-add list');
    if (!same([...new Set(removedStandalone)], [...new Set(removedPb)])) fails.push(`unequal after-remove lists (standalone ${new Set(removedStandalone).size}, PowerBrowser ${new Set(removedPb).size} repositories)`);
    if (removedStandalone.includes(repo)) fails.push('remove left a row on the standalone page (the control did not remove it)');
    if (removedPb.includes(repo)) fails.push('remove left a row in PowerBrowser\'s side panel');
    if (ownedAfterAdd === false) fails.push('PB-owned root not added after the add');
    if (ownedAfterRemove === true) fails.push('PB-owned root not removed after the remove');
    return fails;
}

// ---- labels and selectors from Orca's sidebar sources ----

let ts;
function loadTypeScript() {
    try { ts ??= createRequire(import.meta.url)(join(REPO_ROOT, 'theia', 'node_modules', 'typescript')); return true; } catch { return false; }
}
function visit(node, fn) { fn(node); ts.forEachChild(node, c => visit(c, fn)); }
function parse(rel) {
    const path = join(REPO_ROOT, rel);
    if (!existsSync(path)) throw new Error(`source moved: ${rel} is absent`);
    return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
const defaults = node => {
    const out = [];
    visit(node, n => { if (ts.isCallExpression(n) && n.expression.getText() === 'translate' && n.arguments[1] && ts.isStringLiteral(n.arguments[1])) out.push(n.arguments[1].text); });
    return out;
};
/** The first translate default inside the JSX element one of whose attributes' text matches `re`. */
function labelOf(rel, attr, re) {
    let found;
    visit(parse(rel), n => {
        if (found || !(ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n))) return;
        const open = ts.isJsxElement(n) ? n.openingElement : n;
        const a = open.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText() === attr && re.test(p.initializer?.getText() ?? ''));
        if (a) found = defaults(attr === 'aria-label' ? a : n)[0];
    });
    return found;
}

export function deriveSteps() {
    if (!loadTypeScript()) throw new Error('theia/node_modules/typescript is absent');
    let trigger;
    const sf = parse(SRC.trigger);
    visit(sf, n => {
        if (trigger || !ts.isFunctionDeclaration(n)) return;
        if (/openModal\('add-repo'\)/.test(n.getText())) trigger = defaults(n)[0];
    });
    let pathInput;
    visit(parse(SRC.server), n => {
        if (pathInput || !ts.isJsxSelfClosingElement(n) || n.tagName.getText() !== 'Input') return;
        const id = n.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText() === 'id');
        if (id?.initializer && ts.isStringLiteral(id.initializer)) pathInput = id.initializer.text;
    });
    const steps = {
        trigger,
        manualEntry: labelOf(SRC.server, 'onClick', /setPathEntryOpen\(true\)/),
        pathInput,
        addGit: labelOf(SRC.server, 'onClick', /onAddServerPath\('git'\)/),
        actionsPrefix: labelOf(SRC.actions, 'aria-label', /Project actions|\{\{value0\}\}/)?.split('{{')[0],
        removeItem: labelOf(SRC.actions, 'onSelect', /onRemoveProject\(/),
        confirm: labelOf(SRC.confirm, 'onClick', /handleConfirm/),
    };
    let headerAttr;
    visit(parse(SRC.header), n => { if (!headerAttr && ts.isJsxAttribute(n) && n.name.getText() === 'data-repo-header-id') headerAttr = 'data-repo-header-id'; });
    steps.headerAttr = headerAttr;
    const missing = Object.entries(steps).filter(([, v]) => !v).map(([k]) => k);
    return { steps, fails: missing.map(k => `source moved: the ${k} step was not derived from Orca's sidebar sources`) };
}

/** Page-realm helpers, evaluated in the standalone page or the Theia frame. */
const PAGE_HELPERS = `
    const byText = (sel, text, root = document) => { const all = [...root.querySelectorAll(sel)]; return all.find(e => e.textContent.trim() === text) || all.find(e => e.textContent.trim().startsWith(text)); };
    const press = el => { for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' })); el.click(); };
    const wait = async (f, ms) => { const end = Date.now() + ms; for (;;) { const v = f(); if (v) return v; if (Date.now() > end) return null; await new Promise(r => setTimeout(r, 100)); } };
    const setInput = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };`;

/** The add steps as an async page-realm function body; `root` is the sidebar's mount element expression. */
function addBody(steps, root, repo) {
    const J = JSON.stringify;
    return `${PAGE_HELPERS}
        const sidebar = ${root};
        const trigger = await wait(() => sidebar.querySelector('[aria-label=' + JSON.stringify(${J(steps.trigger)}) + ']'), 15000);
        if (!trigger) return 'no Add-project control in the sidebar';
        press(trigger);
        const manual = await wait(() => byText('button', ${J(steps.manualEntry)}), 10000);
        if (!manual) return 'no server-path step in the Add-project dialog';
        press(manual);
        const input = await wait(() => document.getElementById(${J(steps.pathInput)}), 10000);
        if (!input) return 'no host path field';
        setInput(input, ${J(repo)});
        const add = await wait(() => { const b = byText('button', ${J(steps.addGit)}); return b && !b.disabled ? b : null; }, 10000);
        if (!add) return 'the add button stayed disabled';
        press(add);
        return 'ok';`;
}

function removeBody(steps, root, repoId) {
    const J = JSON.stringify;
    return `${PAGE_HELPERS}
        const sidebar = ${root};
        const header = await wait(() => sidebar.querySelector('[${steps.headerAttr}=' + JSON.stringify(${J(repoId)}) + ']'), 15000);
        if (!header) return 'no sidebar header for the repository';
        const row = header.closest('[data-worktree-virtual-row-key]') || header.parentElement;
        const actions = [...row.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label').startsWith(${J(steps.actionsPrefix)}));
        if (!actions) return 'no project actions control on the header';
        press(actions);
        const item = await wait(() => byText('[role=menuitem]', ${J(steps.removeItem)}), 10000);
        if (!item) return 'no remove entry in the project menu';
        press(item);
        const confirm = await wait(() => byText('[role=dialog] button', ${J(steps.confirm)}), 10000);
        if (!confirm) return 'no remove confirmation';
        press(confirm);
        return 'ok';`;
}

const repoPaths = listed => (listed?.result?.repos ?? listed?.repos ?? []).map(r => r.path);
const repoIdOf = (listed, path) => (listed?.result?.repos ?? listed?.repos ?? []).find(r => r.path === path)?.id;

async function live() {
    const harness = await import('./lib/orca-pane-harness.mjs');
    const skips = harness.skipReasons({ needStandalone: true });
    if (skips.length) { console.log(`${NAME}: SKIP -- ${skips[0]}`); return 0; }
    if (!loadTypeScript()) { console.log(`${NAME}: SKIP -- theia/node_modules/typescript is absent; run the audited Theia install`); return 0; }
    if (!existsSync(join(REPO_ROOT, 'orca', 'src'))) { console.log(`${NAME}: SKIP -- orca/ is absent (P62-10)`); return 0; }
    const { steps, fails: derived } = deriveSteps();
    if (derived.length) { for (const f of derived) console.error(`${NAME}: FAIL -- ${f}`); return 1; }
    const ownedHalf = existsSync(join(REPO_ROOT, WORKSPACE_EXT));
    const { probe, pollFor } = await import('./lib/pb-relaunch.mjs');
    const scratch = join(REPO_ROOT, '.mozbuild', NAME, 'repo');
    rmSync(scratch, { recursive: true, force: true });
    mkdirSync(scratch, { recursive: true });
    execFileSync('git', ['-C', scratch, 'init', '-q']);
    execFileSync('git', ['-C', scratch, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', 'commit', '-q', '--allow-empty', '-m', 'fixture']);
    const record = {};
    const stepFail = (where, what) => { throw new Error(`${where}: ${what}`); };
    try {
        await harness.withOrcaPaneSession({ pbOrcad: true }, async (ctx) => {
            // 1. Control: the stock standalone page.
            const page = await ctx.openStandalone();
            await ctx.evalIn(page, `(() => { window.__pbSidebar = window.__pbHost('sidebar', 'sidebar', [0, 0, 360, 900]); window.PbPanes.mountPane(window.__pbSidebar, { kind: 'sidebar' }); return true; })()`);
            const inPage = async body => ctx.evalIn(page, `(async () => { ${body} })()`);
            let r = await inPage(addBody(steps, 'window.__pbSidebar', scratch));
            if (r !== 'ok') stepFail('standalone add', r);
            await pollFor(async () => repoPaths(ctx.orca('repo', 'list')).includes(scratch), 20000, 'the standalone add').catch(() => undefined);
            record.addedStandalone = repoPaths(ctx.orca('repo', 'list'));
            const sid = repoIdOf(ctx.orca('repo', 'list'), scratch);
            if (sid) {
                r = await inPage(removeBody(steps, 'window.__pbSidebar', sid));
                if (r !== 'ok') stepFail('standalone remove', r);
                await pollFor(async () => !repoPaths(ctx.orca('repo', 'list')).includes(scratch), 20000, 'the standalone remove').catch(() => undefined);
            }
            record.removedStandalone = repoPaths(ctx.orca('repo', 'list'));

            // 2. PowerBrowser's Orca side panel.
            await ctx.startPbOrcad();
            const owned = async () => {
                if (!ownedHalf) return null;
                const v = await probe(ctx.app, `const s = get('ProfileStorageService'); const v = await s.getData(${JSON.stringify(OWNED_ROOTS_KEY)}); return JSON.stringify(v ?? []);`);
                return String(v).includes(JSON.stringify(scratch).slice(1, -1));
            };
            const inTheia = body => probe(ctx.app, `const sidebarRoot = async () => { await get('ModeService').activateMode('orca');
                    const at = () => { const w = get('WidgetManager').tryGetWidget('powerbrowser-orca-sidebar-view'); return w && w.node.querySelector('.pb-orca-pane-host *') ? w.node : null; };
                    await until(at, 30000); return at(); };
                return await (async () => { ${body} })();`);
            r = await inTheia(addBody(steps, 'await sidebarRoot()', scratch));
            if (r !== 'ok') stepFail('PowerBrowser add', r);
            await pollFor(async () => repoPaths(ctx.pbOrca('repo', 'list')).includes(scratch), 20000, 'the PowerBrowser add').catch(() => undefined);
            record.addedPb = repoPaths(ctx.pbOrca('repo', 'list'));
            record.ownedAfterAdd = ownedHalf ? await pollFor(async () => (await owned()) || null, 10000, 'the owned root').then(() => true, () => false) : null;
            const pid = repoIdOf(ctx.pbOrca('repo', 'list'), scratch);
            if (pid) {
                r = await inTheia(removeBody(steps, 'await sidebarRoot()', pid));
                if (r !== 'ok') stepFail('PowerBrowser remove', r);
                await pollFor(async () => !repoPaths(ctx.pbOrca('repo', 'list')).includes(scratch), 20000, 'the PowerBrowser remove').catch(() => undefined);
            }
            record.removedPb = repoPaths(ctx.pbOrca('repo', 'list'));
            record.ownedAfterRemove = ownedHalf ? !(await pollFor(async () => (await owned()) === false || null, 10000, 'the owned root to go').then(() => true, () => false)) : null;
        });
    } catch (err) {
        console.error(`${NAME}: FAIL -- the session did not complete: ${String(err?.message ?? err).split('\n')[0]}`);
        return 1;
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
    const fails = addProjectVerdict({ ...record, repo: scratch });
    if (fails.length) { for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`); return 1; }
    console.log(`${NAME}: PASS -- after-add lists equal (${new Set(record.addedPb).size} repositories, scratch repository present), after-remove lists equal (${new Set(record.removedPb).size}, scratch repository gone); PB-owned root ${ownedHalf ? 'added and removed' : 'SKIP (theia/extensions/orca-workspace is absent)'}`);
    return 0;
}

// ---- self-test ----

function selfTest() {
    const repo = '/scratch/repo';
    const good = { addedStandalone: ['/a', repo], addedPb: [repo, '/a'], removedStandalone: ['/a'], removedPb: ['/a'], repo, ownedAfterAdd: true, ownedAfterRemove: false };
    const cases = [
        ['control: equal lists, root added and removed', good, null],
        ['control: PB-owned roots half skipped', { ...good, ownedAfterAdd: null, ownedAfterRemove: null }, null],
        ['unequal after-add', { ...good, addedPb: [repo] }, 'unequal after-add lists'],
        ['repository missing', { ...good, addedStandalone: ['/a'], addedPb: ['/a'] }, 'repository missing'],
        ['remove left a row', { ...good, removedPb: ['/a', repo] }, 'remove left a row'],
        ['root not removed', { ...good, ownedAfterRemove: true }, 'PB-owned root not removed'],
        ['root not added', { ...good, ownedAfterAdd: false }, 'PB-owned root not added'],
    ];
    let failures = 0;
    for (const [name, input, naming] of cases) {
        const fails = addProjectVerdict(input);
        const text = fails.join('\n');
        if (naming === null ? fails.length : !text.includes(naming)) {
            console.error(`  FAIL ${name} -> ${naming === null ? `control red: ${text}` : fails.length ? `red, but not naming '${naming}': ${text}` : 'stayed green'}`);
            failures++;
        } else console.log(`  ok ${name} -> ${naming === null ? 'green' : `red, naming '${naming}'`}`);
        if (text.includes(repo)) { console.error(`  FAIL ${name} -> a verdict printed a path`); failures++; }
    }
    const plants = cases.filter(c => c[2] !== null).length;
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) wrong`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${plants} planted faults each went red naming the drift; ${cases.length - plants} controls green; no verdict prints a path`);
    return 0;
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--self-test')) {
        console.error(`${NAME}: unknown argument ${args[0] === '--self-test' ? args[1] : args[0]}`);
        console.error(`Usage: node ${SELF_REL} [--self-test]`);
        console.error('Next step: run it with no argument, or with --self-test.');
        process.exit(2);
    }
    process.exit(args[0] === '--self-test' ? selfTest() : await live());
}
