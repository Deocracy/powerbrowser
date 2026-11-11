#!/usr/bin/env node
// scripts/verify-orca-browser-abilities.mjs
//
// orca-browser-abilities (Phase 66, BRW-02/BRW-03; P66-05, P66-12, P66-19,
// P66-30; research A4, A6, A7, A8): what @powerbrowser/orca-browser serves, and
// how, agrees with the abilities of Orca's browser at the pin.
//
// Trace scenario: theia/extensions/orca-browser/src/common/orca-browser-abilities.ts
// and orca-browser-dispatch.ts are transpiled with theia/node_modules/typescript's
// transpileModule into a mkdtemp directory and the dispatcher runs against fakes:
// createPage binds one tab through openAgentTab; a second createPage for the same
// id answers failed and opens nothing; automation browser.click on the bound id
// calls agentCall once with that method and maps a done reply to completed;
// automation browser.upload answers browser_command_unavailable with no agentCall;
// automation on an unbound id answers browser_tab_not_found; closePage closes the
// tab and drops the pair.
//
// Tier: quick. One named SKIP when theia/node_modules/typescript is absent.
// Every judgment is an exported pure verdict over its inputs.
//
// Usage:
//   node scripts/verify-orca-browser-abilities.mjs

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-browser-abilities';
export const REL = {
    abilities: 'theia/extensions/orca-browser/src/common/orca-browser-abilities.ts',
    dispatch: 'theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts',
};

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

/** Fakes for the dispatcher's deps; every call is recorded. */
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

/** The trace scenario (Task 1 of 66-02). Returns failure strings, each naming its step. */
export async function traceFailures(dispatch) {
    const fails = [];
    const { deps, log } = fakeDeps(dispatch);
    const step = (name, ok, got) => { if (!ok) fails.push(`trace ${name}: ${got}`); };
    let out = await dispatch.dispatchCommand(ev('page-1', 'createPage', { workspaceId: 'wt-1' }), deps);
    step('createPage binds one tab', out.status === 'completed' && log.opened.length === 1 && deps.table.tabOf('page-1') === 'tab-1', `${JSON.stringify(out)}, opened ${log.opened.length}`);
    out = await dispatch.dispatchCommand(ev('page-1', 'createPage'), deps);
    step('duplicate createPage opens nothing', out.status === 'failed' && log.opened.length === 1, `${JSON.stringify(out)}, opened ${log.opened.length} tab(s)`);
    out = await dispatch.dispatchCommand(ev('page-1', 'automation', { method: 'browser.click', params: { selector: '#t' } }), deps);
    step('served method reaches agentCall once', out.status === 'completed' && log.calls.length === 1 && log.calls[0][1] === 'browser.click' && log.calls[0][0] === 'tab-1', `${JSON.stringify(out)}, calls ${JSON.stringify(log.calls)}`);
    out = await dispatch.dispatchCommand(ev('page-1', 'automation', { method: 'browser.upload', params: {} }), deps);
    step('unserved method never reaches agentCall', out.status === 'failed' && out.errorCode === 'browser_command_unavailable' && log.calls.length === 1, `${JSON.stringify(out)}, calls ${log.calls.length}`);
    out = await dispatch.dispatchCommand(ev('page-2', 'automation', { method: 'browser.click', params: {} }), deps);
    step('unbound id refused', out.status === 'failed' && out.errorCode === 'browser_tab_not_found' && log.calls.length === 1, `${JSON.stringify(out)}, calls ${log.calls.length}`);
    out = await dispatch.dispatchCommand(ev('page-1', 'closePage', { targetAuthority: { browserPageId: 'page-1' } }), deps);
    step('closePage closes and drops', out.status === 'completed' && log.closed.join() === 'tab-1' && deps.table.tabOf('page-1') === undefined && deps.table.pageOf('tab-1') === undefined, `${JSON.stringify(out)}, closed ${JSON.stringify(log.closed)}`);
    return fails;
}

export async function check(root = REPO_ROOT, read = (rel) => readFileSync(join(root, rel), 'utf8')) {
    const ts = loadTypescript(root);
    if (!ts) return { fails: [], skips: ['theia/node_modules/typescript is not installed (yarn install in theia/)'], notes: [] };
    let mods;
    try { mods = loadModules(ts, { abilities: read(REL.abilities), dispatch: read(REL.dispatch) }); } catch (err) {
        return { fails: [`the orca-browser sources did not load: ${err.message}`], skips: [], notes: [] };
    }
    const fails = await traceFailures(mods.dispatch);
    return { fails, skips: [], notes: ['trace scenario'] };
}

async function main() {
    const r = await check();
    if (r.skips.length) { console.log(`${NAME}: SKIP -- ${r.skips.join('; ')}`); return 0; }
    if (r.fails.length) { console.error(`${NAME}: FAIL`); r.fails.forEach((f) => console.error(`  ${f}`)); return 1; }
    console.log(`${NAME}: PASS -- ${r.notes.join(', ')}`);
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exit(await main());
}
