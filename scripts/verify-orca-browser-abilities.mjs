#!/usr/bin/env node
// scripts/verify-orca-browser-abilities.mjs
//
// orca-browser-abilities (Phase 66, BRW-02/BRW-03; P66-05, P66-09, P66-11,
// P66-12, P66-18, P66-19, P66-30; research A4, A6, A7, A8): what
// @powerbrowser/orca-browser serves, and how, agrees with the abilities of
// Orca's browser at the pin.
//
// Derived at check time, never hand-kept, with scripts/orca-browser-parity.mjs's
// own exported functions (imported, not copied):
//  a. the ability set (deriveAll().rpc) and the automation methods
//     (deriveAll().automation) from the fetched orca/;
//  b. the tier column, from parseDispositions() over the spike's DISPOSITIONS.md;
//     tier-1 automation = automation methods whose tier is 1 or 1 (subset).
// Compared with theia/extensions/orca-browser/src/common/orca-browser-abilities.ts
// (transpiled with theia/node_modules/typescript and evaluated):
//  c. ORCA_BROWSER_ABILITIES has one row per derived ability and no other row;
//  d. each row's tier equals DISPOSITIONS'; no tier-1 row is unavailable; every
//     tier 2 or 3 row is unavailable; the mechanism is one of native, actor,
//     client, orcad, unavailable, and never BiDi or BiDi+ (P66-11);
//  e. browser.dialogAccept and browser.dialogDismiss are native (A4);
//  f. SERVED_AUTOMATION_METHODS equals tier-1 automation as a set;
//  g. chrome's AGENT_METHODS (the array literal in
//     powerbrowser/shell/PowerBrowserAPI.sys.mjs, comments stripped) equals both.
//     Clause (g) alone is a named SKIP while scripts/verify-orca-browser-tab-scope.mjs
//     does not exist (lane p66-03 not merged); with that file present an absent or
//     empty AGENT_METHODS is red, never a SKIP.
// Trace scenario over the pure dispatcher (orca-browser-dispatch.ts, transpiled
// into a mkdtemp directory) with fakes: one tab per createPage, a duplicate id
// opens nothing, a served method reaches agentCall once, an unserved one never,
// an unbound id is refused, closePage drops the pair, navigate and reclaim go
// through the table, a user close then closePage answers completed, the outcome
// table of the contract (A8), and the P66-09 reveal tracker: a page bound before a
// later store activation is revealed once; its own createPage activation, an
// unbound page and a page bound after the change are not.
//
// Tier: quick. Named SKIP for everything when theia/node_modules/typescript is
// absent, and for (a)-(g) when orca/src is absent. Every judgment is an exported
// pure verdict over its inputs. --self-test builds a hermetic fixture (an Orca
// tree with synthetic names, DISPOSITIONS text, abilities and API sources) in a
// mkdtemp directory: the control must be green with clause (g) compared, then each
// planted fault must go red naming its drift.
//
// Usage:
//   node scripts/verify-orca-browser-abilities.mjs
//   node scripts/verify-orca-browser-abilities.mjs --self-test

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveAll, parseDispositions } from './orca-browser-parity.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-browser-abilities';
export const REL = {
    abilities: 'theia/extensions/orca-browser/src/common/orca-browser-abilities.ts',
    dispatch: 'theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts',
    dispositions: '.planning/spikes/005-orca-browser-parity/DISPOSITIONS.md',
    api: 'powerbrowser/shell/PowerBrowserAPI.sys.mjs',
    tabScope: 'scripts/verify-orca-browser-tab-scope.mjs',
    orca: 'orca',
};
export const MECHANISMS = ['native', 'actor', 'client', 'orcad', 'unavailable'];
export const DIALOG_ROWS = ['browser.dialogAccept', 'browser.dialogDismiss'];
const TIER_ONE = /^1( \(subset\))?$/;

/** theia/node_modules/typescript, or undefined when it is not installed. */
export function loadTypescript(root = REPO_ROOT) {
    try { return createRequire(join(root, 'theia', 'package.json'))('typescript'); } catch { return undefined; }
}

/**
 * Transpiles the two sources to CommonJS in a mkdtemp directory and requires the
 * dispatcher (which requires ./orca-browser-abilities from the same directory).
 * The directory is removed before returning.
 */
export function loadModules(ts, sources) {
    const dir = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        const emit = (text) => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
        writeFileSync(join(dir, 'orca-browser-abilities.js'), emit(sources.abilities));
        writeFileSync(join(dir, 'orca-browser-dispatch.js'), emit(sources.dispatch));
        const req = createRequire(join(dir, 'index.js'));
        return { abilities: req('./orca-browser-abilities.js'), dispatch: req('./orca-browser-dispatch.js') };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------- trace scenario

/** Fakes for the dispatcher's deps; every call is recorded. reply may be a function of the method. */
export function fakeDeps(dispatch, reply = { ok: true, kind: 'webTabAgent', where: 'done', result: { ok: 1 } }) {
    const log = { opened: [], closed: [], navigated: [], calls: [] };
    let n = 0;
    const deps = {
        table: dispatch.createPageTable(),
        openAgentTab: async () => { const id = `tab-${++n}`; log.opened.push(id); return id; },
        closeTab: (tabId) => { log.closed.push(tabId); },
        navigate: async (tabId, url) => { log.navigated.push([tabId, url]); return { ok: true }; },
        agentCall: async (tabId, method) => { log.calls.push([tabId, method]); return typeof reply === 'function' ? reply(method) : reply; },
        pageInfo: () => ({ url: 'https://fixture.test/', title: 'Fixture' }),
    };
    return { deps, log };
}

export const ev = (browserPageId, type, extra = {}) => ({ browserPageId, command: { type, ...extra } });

/** The served method the trace drives, and one outside the served set. */
function traceMethods(served) {
    const on = served.includes('browser.click') ? 'browser.click' : served[0];
    const off = ['browser.upload', 'browser.planted-unserved'].find((m) => !served.includes(m));
    return { on, off };
}

/** The page-command trace. Returns failure strings, each naming its step. */
export async function traceFailures(dispatch, served) {
    const fails = [];
    const { on, off } = traceMethods(served);
    const step = (name, ok, got) => { if (!ok) fails.push(`trace ${name}: ${got}`); };
    const run = (deps, e) => dispatch.dispatchCommand(e, deps);
    const { deps, log } = fakeDeps(dispatch);
    let out = await run(deps, ev('page-1', 'createPage', { workspaceId: 'wt-1' }));
    step('createPage binds one tab', out.status === 'completed' && log.opened.length === 1 && deps.table.tabOf('page-1') === 'tab-1', `${JSON.stringify(out)}, opened ${log.opened.length}`);
    out = await run(deps, ev('page-1', 'createPage'));
    step('duplicate createPage opens nothing', out.status === 'failed' && log.opened.length === 1, `${JSON.stringify(out)}, opened ${log.opened.length} tab(s)`);
    out = await run(deps, ev('page-1', 'automation', { method: on, params: { selector: '#t' } }));
    step('served method reaches agentCall once', out.status === 'completed' && log.calls.length === 1 && log.calls[0][0] === 'tab-1' && log.calls[0][1] === on, `${JSON.stringify(out)}, calls ${JSON.stringify(log.calls)}`);
    out = await run(deps, ev('page-1', 'automation', { method: off, params: {} }));
    step('unserved method never reaches agentCall', out.status === 'failed' && out.errorCode === 'browser_command_unavailable' && log.calls.length === 1, `${JSON.stringify(out)}, calls ${log.calls.length}`);
    out = await run(deps, ev('page-2', 'automation', { method: on, params: {} }));
    step('unbound id refused', out.status === 'failed' && out.errorCode === 'browser_tab_not_found' && log.calls.length === 1, `${JSON.stringify(out)}, calls ${log.calls.length}`);
    out = await run(deps, ev('page-1', 'navigate', { url: 'https://fixture.test/a' }));
    step('navigate uses the bound tab', out.status === 'completed' && log.navigated.length === 1 && log.navigated[0][0] === 'tab-1', `${JSON.stringify(out)}, navigated ${JSON.stringify(log.navigated)}`);
    out = await run(deps, ev('page-2', 'reclaimPage'));
    step('reclaimPage never adopts', out.status === 'failed' && out.errorCode === 'browser_tab_not_found' && log.opened.length === 1, JSON.stringify(out));
    out = await run(deps, ev('page-1', 'restorePage'));
    step('restorePage of a bound id opens nothing', out.status === 'completed' && log.opened.length === 1, JSON.stringify(out));
    out = await run(deps, ev('page-1', 'closePage', { targetAuthority: { browserPageId: 'page-1' } }));
    step('closePage closes and drops', out.status === 'completed' && log.closed.join() === 'tab-1' && deps.table.tabOf('page-1') === undefined && deps.table.pageOf('tab-1') === undefined, `${JSON.stringify(out)}, closed ${JSON.stringify(log.closed)}`);
    out = await run(deps, ev('page-9', 'closePage'));
    step('closePage of a never-bound id refused', out.status === 'failed' && out.errorCode === 'browser_tab_not_found', JSON.stringify(out));
    // A7: a user close drops the pair first; orcad's following closePage is answered completed and closes nothing more.
    await run(deps, ev('page-3', 'createPage'));
    deps.table.drop('page-3');
    out = await run(deps, ev('page-3', 'closePage'));
    step('closePage after a user close answers completed', out.status === 'completed' && log.closed.length === 1, `${JSON.stringify(out)}, closed ${JSON.stringify(log.closed)}`);

    // The outcome table (A8), one reply per row.
    const rows = [
        [{ ok: true, where: 'done', result: { v: 1 } }, 'completed', undefined],
        [{ ok: true, where: 'unknown-tab' }, 'failed', 'browser_tab_not_found'],
        [{ ok: true, where: 'not-agent-tab' }, 'failed', 'browser_tab_not_found'],
        [{ ok: true, where: 'agent-stopped' }, 'failed', 'browser_owner_unavailable'],
        [{ ok: true, where: 'failed', code: 'browser_no_dialog' }, 'failed', 'browser_no_dialog'],
        [{ ok: false, reason: 'validation', message: 'm' }, 'failed', 'browser_error'],
    ];
    for (const [reply, status, code] of rows) {
        const o = dispatch.outcomeOf(reply);
        step(`outcome of ${reply.where ?? reply.reason}`, o.status === status && o.errorCode === code, JSON.stringify(o));
    }
    if (served.includes('browser.snapshot')) {
        const s = fakeDeps(dispatch, { ok: true, where: 'done', result: { snapshot: '- doc' } });
        await run(s.deps, ev('page-s', 'createPage'));
        out = await run(s.deps, ev('page-s', 'automation', { method: 'browser.snapshot', params: {} }));
        step('snapshot carries the page identity (A5)', out.status === 'completed' && out.result?.browserPageId === 'page-s' && out.result?.url === 'https://fixture.test/' && out.result?.title === 'Fixture' && out.result?.snapshot === '- doc', JSON.stringify(out));
    }
    fails.push(...await revealFailures(dispatch));
    return fails;
}

/** The P66-09 reveal tracker over fixture lists. */
export async function revealFailures(dispatch) {
    const fails = [];
    const { deps } = fakeDeps(dispatch);
    const tracker = dispatch.createRevealTracker();
    const create = async (id) => { tracker.noteCreated(id); await dispatch.dispatchCommand(ev(id, 'createPage'), deps); };
    const list = (...recs) => tracker.next(recs.map(([browserPageId, active]) => ({ browserPageId, active })), deps.table);
    const step = (name, got, want) => { if (got.join() !== want.join()) fails.push(`trace ${name}: revealed [${got.join(', ')}], expected [${want.join(', ')}]`); };
    // A: created, its record inactive once, then active: the activation that follows its own createPage.
    await create('A');
    step('createPage activation is not a reveal (inactive first)', list(['A', false]), []);
    step('createPage activation is not a reveal', list(['A', true]), []);
    // C: created and active at once; later the user leaves it and comes back in Orca: revealed once.
    await create('C');
    step('createPage activation is not a reveal (active first)', list(['A', true], ['C', true]), []);
    step('inactive store tab is not revealed', list(['A', true], ['C', false]), []);
    step('a page bound before a later store activation is revealed', list(['A', false], ['C', true]), ['C']);
    step('a revealed page is revealed once', list(['A', false], ['C', true]), []);
    // B: never bound; D: bound only after the store change.
    step('an unbound page is not revealed (inactive)', list(['B', false], ['D', false]), []);
    step('a page bound after the change is not revealed', list(['B', true], ['D', true]), []);
    deps.table.bind('D', 'tab-late');
    step('a page bound after the change stays unrevealed', list(['B', true], ['D', true]), []);
    return fails;
}

// ---------------------------------------------------------------- ability clauses

/** Chrome's AGENT_METHODS from the boundary source, comments stripped; undefined when the literal is absent. */
export function parseAgentMethods(apiText) {
    const text = apiText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
    const body = /\bAGENT_METHODS\s*=\s*(?:Object\.freeze\(\s*)?(?:new Set\(\s*)?\[([\s\S]*?)\]/.exec(text)?.[1];
    if (body === undefined) return undefined;
    return [...body.matchAll(/['"`](browser\.[A-Za-z0-9.]+)['"`]/g)].map((m) => m[1]);
}

const minus = (a, b) => [...a].filter((x) => !b.has(x)).sort();

/**
 * Clauses (c)-(g), pure. derived: deriveAll()'s result; rows: parseDispositions()'s map; table: the
 * ORCA_BROWSER_ABILITIES rows; served: SERVED_AUTOMATION_METHODS; chrome: { state: 'skip' } or
 * { state: 'compared', methods: string[] | undefined }.
 */
export function abilityFailures({ derived, rows, table, served, chrome }) {
    const fails = [];
    const byAbility = new Map();
    for (const row of table) {
        if (byAbility.has(row.ability)) fails.push(`row ${row.ability} appears twice in ${REL.abilities}`);
        byAbility.set(row.ability, row);
    }
    for (const a of minus(derived.rpc, new Set(byAbility.keys()))) fails.push(`ability ${a} is derived from the pin and has no row in ${REL.abilities}`);
    for (const a of minus(new Set(byAbility.keys()), derived.rpc)) fails.push(`row ${a} names no derived ability`);
    for (const row of table) {
        const tier = rows.get(row.ability)?.tier;
        if (tier !== undefined && row.tier !== tier) fails.push(`row ${row.ability} has tier ${row.tier}, DISPOSITIONS.md gives ${tier}`);
        if (/^BiDi\+?$/.test(row.mechanism)) fails.push(`row ${row.ability} is marked ${row.mechanism}: no row reaches a WebDriver BiDi module (P66-11)`);
        else if (!MECHANISMS.includes(row.mechanism)) fails.push(`row ${row.ability} has mechanism ${row.mechanism}, not one of ${MECHANISMS.join(', ')}`);
        if (TIER_ONE.test(row.tier) && row.mechanism === 'unavailable') fails.push(`tier-1 row ${row.ability} is unavailable`);
        if (!TIER_ONE.test(row.tier) && row.mechanism !== 'unavailable') fails.push(`tier ${row.tier} row ${row.ability} is ${row.mechanism}, not unavailable (P66-18)`);
    }
    for (const a of DIALOG_ROWS) {
        const row = byAbility.get(a);
        if (!row) fails.push(`dialog row ${a} is missing`);
        else if (row.mechanism !== 'native') fails.push(`dialog row ${a} is ${row.mechanism}, not native (A4)`);
    }
    const tierOne = new Set([...derived.automation].filter((a) => TIER_ONE.test(rows.get(a)?.tier ?? '')));
    if (tierOne.size === 0) fails.push('tier-1 automation set is empty (no automation method has tier 1 in DISPOSITIONS.md)');
    const servedSet = new Set(served);
    for (const m of minus(servedSet, tierOne)) fails.push(`served method ${m} is not tier 1`);
    for (const m of minus(tierOne, servedSet)) fails.push(`tier-1 method ${m} is missing from the served set`);
    if (chrome.state === 'compared') {
        if (!chrome.methods?.length) fails.push(`AGENT_METHODS not found or empty in ${REL.api} while ${REL.tabScope} exists (lane p66-03 merged)`);
        else {
            const agent = new Set(chrome.methods);
            for (const m of minus(tierOne, agent)) fails.push(`tier-1 method ${m} is missing from chrome's AGENT_METHODS`);
            for (const m of minus(agent, tierOne)) fails.push(`AGENT_METHODS method ${m} is not tier 1`);
            for (const m of minus(agent, servedSet)) fails.push(`AGENT_METHODS method ${m} is missing from the served set`);
        }
    }
    return { fails, tierOne };
}

// ---------------------------------------------------------------- the check

export async function check(root = REPO_ROOT) {
    const read = (rel) => readFileSync(join(root, rel), 'utf8');
    const ts = loadTypescript(REPO_ROOT);
    if (!ts) return { fails: [], skips: ['theia/node_modules/typescript is not installed (yarn install in theia/)'], notes: {} };
    let mods;
    try { mods = loadModules(ts, { abilities: read(REL.abilities), dispatch: read(REL.dispatch) }); } catch (err) {
        return { fails: [`the orca-browser sources did not load: ${err.message}`], skips: [], notes: {} };
    }
    const served = [...(mods.abilities.SERVED_AUTOMATION_METHODS ?? [])];
    const table = [...(mods.abilities.ORCA_BROWSER_ABILITIES ?? [])];
    const fails = await traceFailures(mods.dispatch, served);
    const notes = { trace: true };
    if (!existsSync(join(root, REL.orca, 'src'))) return { fails, skips: ['abilities: no fetched Orca tree (orca/src absent); run scripts/fetch-orca.sh'], notes };
    let derived;
    let rows;
    try { derived = deriveAll(join(root, REL.orca)); } catch (err) { fails.push(`derivation: ${err.message}`); }
    try { rows = parseDispositions(read(REL.dispositions)); } catch (err) { fails.push(`dispositions: ${err.message}`); }
    if (!derived || !rows) return { fails, skips: [], notes };
    const chrome = existsSync(join(root, REL.tabScope))
        ? { state: 'compared', methods: existsSync(join(root, REL.api)) ? parseAgentMethods(read(REL.api)) : undefined }
        : { state: 'skip' };
    const r = abilityFailures({ derived, rows, table, served, chrome });
    fails.push(...r.fails);
    Object.assign(notes, { rows: table.length, abilities: derived.rpc.size, tierOne: r.tierOne.size, served: served.length, chrome: chrome.state });
    return { fails, skips: [], notes };
}

function passLine(n) {
    const chrome = n.chrome === 'compared' ? 'chrome AGENT_METHODS compared' : 'chrome AGENT_METHODS SKIP ("lane p66-03 not merged")';
    return `${NAME}: PASS -- trace scenario green; ${n.rows} rows equal the ${n.abilities} derived abilities, tiers equal DISPOSITIONS.md's, no tier-1 row unavailable, no BiDi mechanism, dialogs native; ${n.tierOne} tier-1 automation methods equal the ${n.served}-method served set; ${chrome}`;
}

// ---------------------------------------------------------------- self-test

const FX = {
    methods: 'src/main/runtime/rpc/methods/fixture-core.ts',
    automation: 'src/shared/browser-client-automation-protocol.ts',
    members: 'src/main/runtime/browser/browser-commands.ts',
    cli: ['src/cli/specs/browser-basic.ts', 'src/cli/specs/browser-advanced.ts'],
};
const FIXTURE_ABILITIES = [
    ['browser.fixtureClick', '1', 'actor', true],
    ['browser.dialogAccept', '1', 'native', true],
    ['browser.dialogDismiss', '1', 'native', true],
    ['browser.fixtureUpload', '2', 'unavailable', true],
    ['browser.fixtureTabList', '1', 'orcad', false],
    ['browser.fixtureProfile', '3', 'unavailable', false],
];
const FIXTURE_SERVED = FIXTURE_ABILITIES.filter(([, tier, , auto]) => auto && tier === '1').map(([a]) => a).sort();

function fixtureAbilitiesSource(served = FIXTURE_SERVED, rows = FIXTURE_ABILITIES) {
    return [
        'export const SERVED_AUTOMATION_METHODS = Object.freeze([',
        ...served.map((m) => `    '${m}',`),
        ']);',
        'export const ORCA_BROWSER_ABILITIES = Object.freeze([',
        ...rows.map(([a, tier, mech]) => `    { ability: '${a}', tier: '${tier}', mechanism: '${mech}', proof: 'fixture' },`),
        ']);',
        '',
    ].join('\n');
}

function buildFixture(tmp) {
    const put = (rel, body) => { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); writeFileSync(join(tmp, rel), body); };
    const orca = (rel) => `${REL.orca}/${rel}`;
    put(orca(FX.methods), FIXTURE_ABILITIES.map(([a], i) => `export const M${i} = { name: '${a}' }`).join('\n') + '\n');
    put(orca(FX.automation), `export const BROWSER_CLIENT_AUTOMATION_METHODS = [\n${FIXTURE_ABILITIES.filter((r) => r[3]).map(([a]) => `  '${a}',`).join('\n')}\n] as const\n`);
    put(orca(FX.members), 'export class RuntimeBrowserCommands {\n  readonly browserFixtureClick: unknown\n}\n');
    put(orca(FX.cli[0]), "export const S = [{ path: ['fixture'] }]\n");
    put(orca(FX.cli[1]), 'export const S = []\n');
    put(orca('src/cli/browser/fixture.ts'), "call('browser.fixtureClick')\n");
    put(REL.dispositions, [
        '| ability | users | disposition | Gecko mechanism | tier | note |', '|---|---|---|---|---|---|',
        ...FIXTURE_ABILITIES.map(([a, tier]) => `| ${a} | none | native | fixture | ${tier} | fixture |`), '',
    ].join('\n'));
    put(REL.abilities, fixtureAbilitiesSource());
    put(REL.dispatch, readFileSync(join(REPO_ROOT, REL.dispatch), 'utf8'));
    put(REL.api, `// fixture boundary\nconst AGENT_METHODS = Object.freeze([\n${FIXTURE_SERVED.map((m) => `  "${m}",`).join('\n')}\n]);\n`);
    put(REL.tabScope, '// fixture: lane p66-03 present\n');
}

const sub = (from, to) => (s) => s.replace(from, to);
export const PLANTS = [
    { name: 'served-not-tier-1', naming: 'served method browser.fixtureUpload is not tier 1', file: REL.abilities, edit: () => fixtureAbilitiesSource([...FIXTURE_SERVED, 'browser.fixtureUpload']) },
    { name: 'tier-1-missing-from-served', naming: 'tier-1 method browser.fixtureClick is missing from the served set', file: REL.abilities, edit: () => fixtureAbilitiesSource(FIXTURE_SERVED.filter((m) => m !== 'browser.fixtureClick')) },
    { name: 'tier-1-missing-from-chrome', naming: "tier-1 method browser.fixtureClick is missing from chrome's AGENT_METHODS", file: REL.api, edit: sub('  "browser.fixtureClick",\n', '') },
    { name: 'ability-added-at-re-pin', naming: 'ability browser.fixtureNew is derived from the pin and has no row', file: `${REL.orca}/${FX.methods}`, edit: (s) => `${s}export const N = { name: 'browser.fixtureNew' }\n` },
    { name: 'row-without-ability', naming: 'row browser.fixtureGone names no derived ability', file: REL.abilities, edit: () => fixtureAbilitiesSource(FIXTURE_SERVED, [...FIXTURE_ABILITIES, ['browser.fixtureGone', '2', 'unavailable']]) },
    { name: 'row-marked-bidi', naming: 'row browser.fixtureClick is marked BiDi', file: REL.abilities, edit: sub("ability: 'browser.fixtureClick', tier: '1', mechanism: 'actor'", "ability: 'browser.fixtureClick', tier: '1', mechanism: 'BiDi'") },
    { name: 'dialog-row-actor', naming: 'dialog row browser.dialogAccept is actor', file: REL.abilities, edit: sub("ability: 'browser.dialogAccept', tier: '1', mechanism: 'native'", "ability: 'browser.dialogAccept', tier: '1', mechanism: 'actor'") },
    { name: 'tier-1-row-unavailable', naming: 'tier-1 row browser.fixtureTabList is unavailable', file: REL.abilities, edit: sub("ability: 'browser.fixtureTabList', tier: '1', mechanism: 'orcad'", "ability: 'browser.fixtureTabList', tier: '1', mechanism: 'unavailable'") },
    { name: 'tier-mismatch', naming: 'row browser.fixtureUpload has tier 1, DISPOSITIONS.md gives 2', file: REL.abilities, edit: sub("ability: 'browser.fixtureUpload', tier: '2'", "ability: 'browser.fixtureUpload', tier: '1'") },
    { name: 'empty-derivation', naming: 'is empty', file: `${REL.orca}/${FX.automation}`, edit: () => 'export const BROWSER_CLIENT_AUTOMATION_METHODS = [\n] as const\n' },
    { name: 'tab-scope-present-agent-methods-absent', naming: 'AGENT_METHODS not found or empty', file: REL.api, edit: () => '// fixture boundary without the agent section\n' },
    { name: 'trace-duplicate-opens-second-tab', naming: 'trace duplicate createPage opens nothing', file: REL.dispatch, edit: sub('            if (table.tabOf(pageId) !== undefined) {\n                return failed(\'browser_error\'); // a bound id never gets a second tab\n            }\n', '') },
    { name: 'trace-unserved-reaches-agent', naming: 'trace unserved method never reaches agentCall', file: REL.dispatch, edit: sub('if (!SERVED_AUTOMATION_METHODS.includes(method)) {', 'if (false) {') },
    { name: 'trace-reveal-at-own-createPage', naming: 'trace createPage activation is not a reveal', file: REL.dispatch, edit: sub('            created.set(pageId, 0);\n', '') },
    { name: 'trace-reveal-bound-after-change', naming: 'trace a page bound after the change is not revealed', file: REL.dispatch, edit: sub(' && table.tabOf(pageId) !== undefined) {', ') {') },
    { name: 'trace-unbound-id-served', naming: 'trace unbound id refused', file: REL.dispatch, edit: sub("        if (tabId === undefined) {\n            return failed('browser_tab_not_found');\n        }\n", '') },
];

async function runSelfTest() {
    if (!loadTypescript(REPO_ROOT)) { console.log(`${NAME} self-test: SKIP -- theia/node_modules/typescript is not installed`); return 0; }
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-self-`));
    try {
        buildFixture(tmp);
        const control = await check(tmp);
        if (control.fails.length || control.skips.length || control.notes.chrome !== 'compared') {
            console.error(`${NAME} self-test: FAIL -- control is not green with clause (g) compared: ${[...control.fails, ...control.skips].join(' | ') || control.notes.chrome}`);
            return 1;
        }
        console.log(`${NAME} self-test: control green -- fixture Orca tree (${control.notes.abilities} synthetic abilities), ${control.notes.rows} rows, chrome AGENT_METHODS compared`);
        let failures = 0;
        for (const p of PLANTS) {
            const file = join(tmp, p.file);
            const original = readFileSync(file, 'utf8');
            const planted = p.edit(original);
            if (planted === original) { console.error(`  FAIL ${p.name} -> the plant did not apply (its anchor text moved)`); failures++; continue; }
            writeFileSync(file, planted);
            const r = await check(tmp);
            writeFileSync(file, original);
            const text = [...r.fails, ...r.skips].join('\n');
            if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green${r.skips.length ? ` (SKIP: ${r.skips.join('; ')})` : ''}`); failures++; } else if (!text.includes(p.naming)) {
                console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++;
            } else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
        }
        // The tab-scope file absent turns clause (g) into its named SKIP, never a failure.
        rmSync(join(tmp, REL.tabScope));
        const skipped = await check(tmp);
        if (skipped.fails.length || skipped.notes.chrome !== 'skip') { console.error(`  FAIL chrome-clause-skip -> ${skipped.fails.join(' | ') || skipped.notes.chrome}`); failures++; } else console.log("  ok chrome-clause-skip -> clause (g) SKIP with lane p66-03's file absent");
        if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); return 1; }
        console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift`);
        return 0;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
        if (existsSync(tmp)) { console.error(`${NAME} self-test: FAIL -- fixture ${tmp} was not removed`); process.exitCode = 1; }
    }
}

async function main() {
    const r = await check();
    if (r.fails.length) { console.error(`${NAME}: FAIL`); r.fails.forEach((f) => console.error(`  ${f}`)); return 1; }
    if (r.skips.length && !r.notes.trace) { console.log(`${NAME}: SKIP -- ${r.skips.join('; ')}`); return 0; }
    if (r.skips.length) { console.log(`${NAME}: PASS -- trace scenario green; SKIP -- ${r.skips.join('; ')}`); return 0; }
    console.log(passLine(r.notes));
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = process.argv[2];
    if (arg && arg !== '--self-test') { console.error(`usage: node ${'scripts/verify-orca-browser-abilities.mjs'} [--self-test]`); process.exit(2); }
    process.exit(arg === '--self-test' ? await runSelfTest() : await main());
}
