#!/usr/bin/env node
// scripts/verify-orca-side-panel-live.mjs
//
// orca-side-panel-live (Phase 65, TAB-07; criterion 2; P65-09..P65-12, P65-24,
// P65-30; CA-10, CA-11; research A5): Orca's sidebar, Settings, Agents and
// right sidebar live in PowerBrowser side panels in the Orca mode and behave as
// in Orca.
//
// One PowerBrowser session through scripts/lib/orca-tabs-live.mjs (its own
// orcad and the booted pane bundle, ORCA_* scrubbed, redaction first; a plain
// probe shell boots no bundle), with MOZ_LOG=nsHostResolver:5 written to the
// scratch directory. The bundle is reached only through C3's boot handle
// (ctx.bundle); this check imports nothing of the bundle itself. Two scratch
// repositories are registered with the built CLI. Clauses, each printing one
// line "orca-side-panel-live: <clause>: PASS|FAIL -- <counts>":
//  a  containers   in the Orca mode the left container is in the left area and
//                  the right container in the right area; each part's host has
//                  descendants and state().mountErrors names none of its kinds.
//  b  rows         the sidebar's repository and worktree rows (attribute names
//                  derived at check time from Orca's row components) equal
//                  orca repo list --json and orca worktree list --json as sets.
//  c  setting      the experimental orchestration switch (its aria-label derived
//                  from Orca's setting component) toggled in the hosted Settings
//                  changes settings.experimentalOrchestrationPanel in orcad's
//                  orca-data.json (value only), and toggling back restores it.
//                  terminalShortcutPolicy and keybindings are never touched
//                  (C64-1's hostedTerminalKeys holds them in memory).
//  d  agents       with that setting on the Agents part is in the left
//                  container within 2 s; with it off it is gone within 2 s.
//  e  worktrees    a hosted terminal in each worktree (setActiveWorktree, then
//                  New Orca Terminal, C64-6); clicking the other worktree's row
//                  activates that worktree's tab.
//  f  pages        each page entry Orca's sidebar shows (derived from
//                  SidebarNav.tsx and SidebarTaskNavButton.tsx) opens
//                  pb-orca:<view> as the active tab; closed, a second click
//                  reopens it. Zero entries shown is red (blind).
//  g  modes        after switching to Coding and to Browsing neither container
//                  is in the left or right area (A5).
//  h  registry     TabUriRegistry resolves both container ids to a view
//                  contribution, the condition under which tab-uri-registry.ts
//                  would log its startup error (a positive read, CLAUDE.md
//                  verification rule 1).
//  i  egress       the Theia document first fetches http://pb-egress-control.invalid/
//                  and the resolver log must name that host (else "collector
//                  blind"); every other host resolved during the run, loopback
//                  excluded, must pass endpoint-verdict.mjs's unattended verdict,
//                  else red naming the host for the coordinator's measured row.
// Output names clauses, counts and host names only; never a path, the ready
// line, a pairing URL, an offer or a token.
//
// Tier: full. Runs under flock /home/chris/coding/Power-Browser/.git/pb-live.lock
// with inherited ORCA_* unset. SKIP (exit 0, one named line) while a built
// PowerBrowser, a built Theia app, orca/out or the pane bundle is absent
// (orca-tabs-live.mjs prerequisites). --self-test runs the pure comparators on
// fixtures (hermetic).
//
// Usage:
//   node scripts/verify-orca-side-panel-live.mjs
//   node scripts/verify-orca-side-panel-live.mjs --self-test

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { violations } from './lib/endpoint-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-side-panel-live';
const SELF_REL = 'scripts/verify-orca-side-panel-live.mjs';

export const LEFT = 'powerbrowser-orca-view-container';
export const RIGHT = 'powerbrowser-orca-right-view-container';
export const PARTS = { 'powerbrowser-orca-sidebar-view': 'sidebar', 'powerbrowser-orca-settings-view': 'settings', 'powerbrowser-orca-right-sidebar-view': 'right-sidebar' };
export const AGENTS = 'powerbrowser-orca-agents-view';
export const CONTROL_HOST = 'pb-egress-control.invalid';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const SRC = {
    sidebar: 'orca/src/renderer/src/components/sidebar',
    itemRow: 'orca/src/renderer/src/components/sidebar/worktree-list/rows/item-row.tsx',
    header: 'orca/src/renderer/src/components/sidebar/worktree-list/rows/SectionHeader.tsx',
    nav: ['orca/src/renderer/src/components/sidebar/SidebarNav.tsx', 'orca/src/renderer/src/components/sidebar/SidebarTaskNavButton.tsx'],
    toggle: 'orca/src/renderer/src/components/settings/orchestration/OrchestrationPanelExperimentalSetting.tsx',
    views: 'orca/src/shared/ui-chrome-types.ts',
};

// ---- pure comparators (the self-test feeds these fixtures) ----

/** Set equality; red names the side and the count, never the members' paths. */
export function setVerdict(what, shown, expected) {
    const s = new Set(shown);
    const e = new Set(expected);
    const missing = [...e].filter(x => !s.has(x)).length;
    const extra = [...s].filter(x => !e.has(x)).length;
    const fails = [];
    if (missing) fails.push(`${what}: ${missing} missing sidebar row(s) (in the CLI list, not in the sidebar)`);
    if (extra) fails.push(`${what}: ${extra} extra sidebar row(s) (in the sidebar, not in the CLI list)`);
    if (!e.size) fails.push(`${what}: the CLI list is empty, so the comparison is blind`);
    return fails;
}

/** d: the Agents part follows the setting both ways. */
export function agentsVerdict({ presentWhenOn, presentWhenOff }) {
    const fails = [];
    if (!presentWhenOn) fails.push('agents part absent with the orchestration setting on');
    if (presentWhenOff) fails.push('agents part stayed with the orchestration setting off');
    return fails;
}

/** g: areas holding an Orca container, per mode ({ coding: ['left'], ... }). */
export function leakVerdict(areasByMode) {
    const fails = [];
    for (const [mode, byContainer] of Object.entries(areasByMode)) {
        for (const [container, area] of Object.entries(byContainer)) {
            if (area === 'left' || area === 'right') fails.push(`container ${container} leaked into ${mode} (${area} area)`);
        }
    }
    return fails;
}

/** i: the control first, then the unattended verdict over every other non-loopback host. */
export function egressVerdict({ resolved, allowlist }) {
    if (!resolved.includes(CONTROL_HOST)) return [`collector blind: the control host ${CONTROL_HOST} is not in the resolver log`];
    const observed = resolved.filter(h => h !== CONTROL_HOST && !LOOPBACK.has(h));
    return violations(allowlist, observed, { userAction: false }).map(h => `unlisted host ${h} resolved while the Orca side panels rendered (unattended verdict)`);
}

/** The anchored `Resolving host [...]` names of <base>.moz_log and its .child-N.moz_log siblings (verify-endpoints.sh layer 3). */
export function resolvedHosts(base) {
    const dir = dirname(base);
    const stem = basename(base);
    const files = existsSync(dir) ? readdirSync(dir).filter(f => f === `${stem}.moz_log` || (f.startsWith(`${stem}.child-`) && f.endsWith('.moz_log'))) : [];
    const hosts = new Set();
    for (const f of files) for (const m of readFileSync(join(dir, f), 'latin1').matchAll(/Resolving host \[([^\]]+)\]/g)) hosts.add(m[1]);
    return [...hosts].sort();
}

// ---- derivations from the pinned Orca source (typescript) ----

let ts;
function loadTypeScript() {
    try { ts ??= createRequire(import.meta.url)(join(REPO_ROOT, 'theia', 'node_modules', 'typescript')); return true; } catch { return false; }
}
function parse(rel) {
    const path = join(REPO_ROOT, rel);
    if (!existsSync(path)) throw new Error(`source moved: ${rel} is absent`);
    return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function visit(node, fn) { fn(node); ts.forEachChild(node, c => visit(c, fn)); }
const attrName = a => a.name.getText();
const translateDefaults = node => {
    const out = [];
    visit(node, n => { if (ts.isCallExpression(n) && n.expression.getText() === 'translate' && n.arguments[1] && ts.isStringLiteral(n.arguments[1])) out.push(n.arguments[1].text); });
    return out;
};

/** The selectors and labels this check reads the hosted DOM with, derived from Orca's components. */
export function deriveSelectors() {
    if (!loadTypeScript()) throw new Error("theia/node_modules/typescript is absent");
    const fails = [];
    const attrWhose = (rel, test) => {
        let found;
        visit(parse(rel), n => { if (!found && ts.isJsxAttribute(n) && n.initializer && test(attrName(n), n.initializer.getText())) found = attrName(n); });
        return found;
    };
    const worktreeAttr = attrWhose(SRC.itemRow, (name, init) => name.startsWith('data-') && /\.worktree\.id\}$/.test(init));
    const repoAttr = attrWhose(SRC.header, (name) => /^data-repo-header-id$/.test(name));
    if (!worktreeAttr) fails.push(`source moved: no data- attribute carrying the worktree id in ${SRC.itemRow}`);
    if (!repoAttr) fails.push(`source moved: no data-repo-header-id attribute in ${SRC.header}`);
    const viewsText = readFileSync(join(REPO_ROOT, SRC.views), 'utf8');
    const views = [...(viewsText.match(/export type TopLevelView =([^]*?)(?:\n\n|\nexport|$)/)?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].map(m => m[1]);
    const pages = [];
    for (const rel of SRC.nav) {
        visit(parse(rel), n => {
            if (!ts.isJsxElement(n) || n.openingElement.tagName.getText() !== 'button') return;
            const onClick = n.openingElement.attributes.properties.find(a => ts.isJsxAttribute(a) && attrName(a) === 'onClick');
            const action = onClick?.initializer?.getText().match(/open(\w+?)Page/)?.[1]?.toLowerCase();
            const view = action && views.find(v => v === action || v === action + 's');
            const label = translateDefaults(n)[0];
            if (view && label) pages.push({ view, label });
        });
    }
    if (!pages.length) fails.push(`source moved: no page entry (a button whose onClick opens a TopLevelView page) in ${SRC.nav.join(', ')}`);
    let toggleLabel;
    visit(parse(SRC.toggle), n => {
        if (!toggleLabel && ts.isJsxAttribute(n) && attrName(n) === 'ariaLabel') toggleLabel = translateDefaults(n)[0];
    });
    if (!toggleLabel) fails.push(`source moved: no ariaLabel translate default in ${SRC.toggle}`);
    return { fails, worktreeAttr, repoAttr, pages, toggleLabel };
}

// ---- the live run ----

const ids = (list, key) => {
    const arr = Array.isArray(list) ? list : (list?.result?.[key] ?? list?.[key] ?? []);
    return arr.map(x => x.id).filter(Boolean);
};

async function live() {
    const lib = await import('./lib/orca-tabs-live.mjs');
    const pre = lib.prerequisites({ needOrca: true });
    if (pre.skip) { console.log(`${NAME}: SKIP -- ${pre.skip}`); return 0; }
    if (pre.fail) { console.error(`${NAME}: FAIL -- ${pre.fail}`); return 1; }
    if (!loadTypeScript()) { console.log(`${NAME}: SKIP -- theia/node_modules/typescript is absent; run the audited Theia install`); return 0; }
    const sel = deriveSelectors();
    if (sel.fails.length) { for (const f of sel.fails) console.error(`${NAME}: FAIL -- ${f}`); return 1; }
    const logDir = join(REPO_ROOT, '.mozbuild', NAME);
    mkdirSync(logDir, { recursive: true });
    const logBase = join(logDir, `resolver-${process.pid}`);
    process.env.MOZ_LOG = 'nsHostResolver:5';
    process.env.MOZ_LOG_FILE = logBase;
    const results = [];
    const clause = (name, fails, counts) => { results.push({ name, fails }); console.log(`${NAME}: ${name}: ${fails.length ? 'FAIL' : 'PASS'} -- ${fails.length ? fails.join('; ') : counts}`); };
    const J = JSON.stringify;
    try {
        await lib.withOrcaTabsSession({ log: () => {} }, async (ctx) => {
            // i (control first): a resolution the collector must see before any absence is judged.
            await ctx.probe(`try { await fetch('http://${CONTROL_HOST}/', { mode: 'no-cors' }); } catch (e) { /* NXDOMAIN expected */ } return true;`);
            const pairing = await ctx.bundle('m.state().pairing');
            if (!pairing?.sessionOnly) throw new Error('the bundle is not paired session-only (C3-65 state().pairing)');
            // A second repository beside the session's own.
            const repo2 = join(ctx.scratch, 'repo-two');
            mkdirSync(repo2, { recursive: true });
            const git = (...a) => execFileSync('git', ['-C', repo2, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', ...a], { stdio: ['ignore', 'pipe', 'pipe'] });
            git('init', '-q');
            git('commit', '-q', '--allow-empty', '-m', 'fixture');
            ctx.orca('repo', 'add', '--path', repo2);
            await ctx.probe(`await get('ModeService').activateMode('orca'); return true;`);

            // a
            const panel = await ctx.probe(`const wm = get('WidgetManager'); const shell = get('ApplicationShell');
                await until(() => ${J(Object.keys(PARTS))}.every(id => { const w = wm.tryGetWidget(id); return w && w.node.querySelector('.pb-orca-pane-host *'); }), 20000);
                const area = id => { const w = wm.tryGetWidget(id); return w && w.isAttached ? shell.getAreaFor(w) : null; };
                const parts = Object.fromEntries(${J(Object.keys(PARTS))}.map(id => { const w = wm.tryGetWidget(id); return [id, !!(w && w.node.querySelector('.pb-orca-pane-host *'))]; }));
                return { left: area(${J(LEFT)}), right: area(${J(RIGHT)}), parts };`);
            const mountErrors = (await ctx.bundle('m.state().mountErrors')) ?? [];
            const aFails = [];
            if (panel.left !== 'left') aFails.push(`left container in ${panel.left ?? 'no'} area`);
            if (panel.right !== 'right') aFails.push(`right container in ${panel.right ?? 'no'} area`);
            for (const [id, mounted] of Object.entries(panel.parts)) if (!mounted) aFails.push(`${PARTS[id]} part has no mounted content`);
            for (const e of mountErrors) if (Object.values(PARTS).includes(e.kind)) aFails.push(`mount error for ${e.kind} at ${e.phase}`);
            clause('a containers', aFails, `left and right containers docked, ${Object.keys(PARTS).length} parts mounted`);

            // b
            const rows = await ctx.probe(`const node = get('WidgetManager').tryGetWidget('powerbrowser-orca-sidebar-view').node;
                await until(() => node.querySelectorAll('[${sel.worktreeAttr}]').length >= 2, 15000);
                return { worktrees: [...node.querySelectorAll('[${sel.worktreeAttr}]')].map(e => e.getAttribute(${J(sel.worktreeAttr)})),
                         repos: [...node.querySelectorAll('[${sel.repoAttr}]')].map(e => e.getAttribute(${J(sel.repoAttr)})).filter(Boolean) };`);
            const cliRepos = ids(ctx.orca('repo', 'list'), 'repos');
            const cliWorktrees = ids(ctx.orca('worktree', 'list'), 'worktrees');
            clause('b rows', [...setVerdict('repositories', rows.repos, cliRepos), ...setVerdict('worktrees', rows.worktrees, cliWorktrees)],
                `${new Set(rows.repos).size} repository and ${new Set(rows.worktrees).size} worktree rows equal the CLI lists`);

            // c and d: one switch, read in orcad's store and in the dock.
            const state = await ctx.orcaState();
            const dataFile = [join(state.effectiveRoot, 'orca-data.json'), join(state.dataRoot ?? '', 'orca-data.json')].find(existsSync);
            const stored = () => { try { return JSON.parse(readFileSync(dataFile, 'utf8')).settings?.experimentalOrchestrationPanel === true; } catch { return null; } };
            const toggle = () => ctx.probe(`const part = get('WidgetManager').tryGetWidget('powerbrowser-orca-settings-view');
                const c = get('WidgetManager').tryGetWidget(${J(LEFT)}); c && c.activateWidget(part.id);
                const find = () => part.node.querySelector('[aria-label=${J(sel.toggleLabel)}]');
                await until(find, 10000);
                const sw = find();
                if (!sw) return { error: 'switch not found' };
                sw.click(); return { ok: true };`);
            const agentsIn = () => ctx.probe(`const c = get('WidgetManager').tryGetWidget(${J(LEFT)}); const a = get('WidgetManager').tryGetWidget(${J(AGENTS)});
                return !!(c && a && c.getPartFor(a));`);
            const waitAgents = (want) => ctx.probe(`const wm = get('WidgetManager');
                return await until(() => { const c = wm.tryGetWidget(${J(LEFT)}); const a = wm.tryGetWidget(${J(AGENTS)}); return !!(c && a && c.getPartFor(a)) === ${want}; }, 2000);`);
            const cFails = [];
            const before = dataFile ? stored() : null;
            if (!dataFile) cFails.push('orca-data.json not found in the data root');
            if (before === true) { await toggle(); await ctx.pollFor(async () => stored() === false, 10000, 'the setting off').catch(() => undefined); }
            const on = await toggle();
            if (on?.error) cFails.push(`settings ${on.error} (aria-label derived from ${SRC.toggle})`);
            const storedOn = await ctx.pollFor(async () => stored() === true, 10000, 'the setting on in orcad').then(() => true, () => false);
            if (!storedOn) cFails.push('the hosted switch did not set the setting in orcad\'s store');
            await waitAgents(true);
            const presentWhenOn = await agentsIn();
            await toggle();
            const storedOff = await ctx.pollFor(async () => stored() === false, 10000, 'the setting off in orcad').then(() => true, () => false);
            if (!storedOff) cFails.push('toggling back did not restore the setting in orcad\'s store');
            await waitAgents(false);
            const presentWhenOff = await agentsIn();
            clause('c setting', cFails, 'the hosted switch round-tripped through orcad\'s store');
            clause('d agents', agentsVerdict({ presentWhenOn, presentWhenOff }), 'agents part added with the setting on and removed with it off, each within 2 s');

            // e
            const worktrees = (await ctx.bundle('m.state().worktrees')) ?? [];
            const eFails = [];
            const tabs = {};
            for (const w of worktrees.slice(0, 2)) {
                await ctx.bundle(`m.setActiveWorktree(${J(w.id)})`);
                const t0 = Date.now();
                await ctx.command('powerbrowser.orca.newTerminal');
                const added = await lib.waitForHostedAdd(ctx, t0, Object.values(tabs), 10000);
                if (added) tabs[w.id] = added.id; else eFails.push('a worktree\'s New Orca Terminal gave no hosted tab');
            }
            if (worktrees.length < 2) eFails.push(`${worktrees.length} worktree(s) in the store, 2 needed`);
            if (!eFails.length) {
                const [first, second] = worktrees.slice(0, 2).map(w => w.id);
                await ctx.activate(tabs[first]);
                await ctx.probe(`const row = get('WidgetManager').tryGetWidget('powerbrowser-orca-sidebar-view').node.querySelector('[${sel.worktreeAttr}=' + CSS.escape(${J(second)}) + ']');
                    if (!row) return false; const t = row.querySelector('[data-worktree-card-surface]') || row;
                    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
                    t.click(); return true;`);
                const active = await ctx.probe(`return await until(() => { const a = get('ApplicationShell').activeWidget; return !!a && a.id === ${J(tabs[second])}; }, 5000);`);
                if (active !== true) eFails.push('a sidebar worktree click did not activate that worktree\'s tab');
            }
            clause('e worktrees', eFails, 'a sidebar worktree click activated that worktree\'s hosted tab');

            // f
            const fFails = [];
            let shown = 0;
            for (const { view, label } of sel.pages) {
                const click = () => ctx.probe(`const node = get('WidgetManager').tryGetWidget('powerbrowser-orca-sidebar-view').node;
                    const buttons = [...node.querySelectorAll('button')];
                    const b = buttons.find(x => x.textContent.trim() === ${J(label)}) || buttons.find(x => x.textContent.trim().startsWith(${J(label)}));
                    if (!b) return false; b.click(); return true;`);
                if (!(await click())) continue;
                shown++;
                const want = `pb-orca:${view}`;
                const activeUri = () => ctx.probe(`const shell = get('ApplicationShell');
                    const at = () => { const a = shell.activeWidget; const u = a && get('TabUriRegistry').uriOf(a); return u && u.toString(true) === ${J(want)} ? a.id : null; };
                    await until(at, 5000); return at();`);
                const id = await activeUri();
                if (!id) { fFails.push(`${view}: the entry did not open ${want}`); continue; }
                await ctx.luminoClose(id);
                await click();
                if (!(await activeUri())) fFails.push(`${view}: after closing, a second click did not reopen ${want}`);
            }
            if (!shown) fFails.push(`blind: none of the ${sel.pages.length} derived page entries is shown in the hosted sidebar`);
            clause('f pages', fFails, `${shown} page entr${shown === 1 ? 'y' : 'ies'} opened, closed and reopened their pb-orca: tab`);

            // g
            const areasByMode = {};
            for (const mode of ['coding', 'browsing']) {
                areasByMode[mode] = await ctx.probe(`await get('ModeService').activateMode(${J(mode)}); await sleep(500);
                    const wm = get('WidgetManager'); const shell = get('ApplicationShell');
                    const area = id => { const w = wm.tryGetWidget(id); return w && w.isAttached ? shell.getAreaFor(w) : null; };
                    return { [${J(LEFT)}]: area(${J(LEFT)}), [${J(RIGHT)}]: area(${J(RIGHT)}) };`);
            }
            clause('g modes', leakVerdict(areasByMode), 'neither container in the left or right area in Coding or Browsing');

            // h
            const reg = await ctx.probe(`const r = get('TabUriRegistry'); return [${J(LEFT)}, ${J(RIGHT)}].filter(id => !r.getViewContribution(id));`);
            clause('h registry', reg.map(id => `TabUriRegistry has no view contribution for ${id} (its startup error would fire)`), 'both container ids resolve to a view contribution');
        });
    } catch (err) {
        console.error(`${NAME}: FAIL -- the session did not complete: ${String(err?.message ?? err).split('\n')[0]}`);
        return 1;
    } finally {
        delete process.env.MOZ_LOG;
        delete process.env.MOZ_LOG_FILE;
    }
    // i, after the browser has exited and flushed its logs.
    const { hosts } = JSON.parse(readFileSync(join(REPO_ROOT, 'powerbrowser', 'endpoint-allowlist.json'), 'utf8'));
    const resolved = resolvedHosts(logBase);
    clause('i egress', egressVerdict({ resolved, allowlist: hosts }), `control seen; ${resolved.filter(h => h !== CONTROL_HOST && !LOOPBACK.has(h)).length} other host(s) pass the unattended verdict`);
    const failed = results.filter(r => r.fails.length).map(r => r.name);
    if (failed.length) { console.error(`${NAME}: FAIL -- ${failed.join(', ')}`); return 1; }
    console.log(`${NAME}: PASS -- ${results.length} clauses`);
    return 0;
}

// ---- self-test ----

function selfTest() {
    const allow = [{ host: 'api.github.com', disposition: 'allow' }, { host: 'example.org', disposition: 'user-initiated' }];
    const cases = [
        ['control: rows equal', () => setVerdict('worktrees', ['a', 'b'], ['b', 'a']), null],
        ['control: agents follow the setting', () => agentsVerdict({ presentWhenOn: true, presentWhenOff: false }), null],
        ['control: no container in Coding', () => leakVerdict({ coding: { [LEFT]: null, [RIGHT]: null } }), null],
        ['control: control seen, listed host', () => egressVerdict({ resolved: [CONTROL_HOST, 'api.github.com', 'localhost'], allowlist: allow }), null],
        ['a missing sidebar row', () => setVerdict('worktrees', ['a'], ['a', 'b']), 'missing sidebar row'],
        ['an extra sidebar row', () => setVerdict('repositories', ['a', 'b', 'c'], ['a', 'b']), 'extra sidebar row'],
        ['an agents part that stayed', () => agentsVerdict({ presentWhenOn: true, presentWhenOff: true }), 'agents part stayed'],
        ['a container leaked into Coding', () => leakVerdict({ coding: { [LEFT]: 'left', [RIGHT]: null } }), `container ${LEFT} leaked into coding`],
        ['a control host absent', () => egressVerdict({ resolved: ['api.github.com'], allowlist: allow }), 'collector blind'],
        ['an unlisted host', () => egressVerdict({ resolved: [CONTROL_HOST, 'tracker.example.net'], allowlist: allow }), 'unlisted host tracker.example.net'],
        ['a user-initiated host resolved unattended', () => egressVerdict({ resolved: [CONTROL_HOST, 'example.org'], allowlist: allow }), 'unlisted host example.org'],
    ];
    let failures = 0;
    for (const [name, run, naming] of cases) {
        const fails = run();
        const text = fails.join('\n');
        if (naming === null ? fails.length : !text.includes(naming)) {
            console.error(`  FAIL ${name} -> ${naming === null ? `control red: ${text}` : fails.length ? `red, but not naming '${naming}': ${text}` : 'stayed green'}`);
            failures++;
        } else console.log(`  ok ${name} -> ${naming === null ? 'green' : `red, naming '${naming}'`}`);
    }
    const plants = cases.filter(c => c[2] !== null).length;
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) wrong`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${plants} planted faults each went red naming the drift; ${cases.length - plants} controls green`);
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
