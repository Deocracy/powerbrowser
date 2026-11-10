#!/usr/bin/env node
// scripts/verify-orca-terminal-keys-live.mjs
//
// orca-terminal-keys-live (Phase 64, TERM-04 live, criterion 7; D-09, D-31,
// P64-33; interface C10): the six tab keys pressed in a hosted Orca terminal tab
// reach its PTY, and the same keys in a Theia t<n> terminal and a web tab keep
// PowerBrowser's behaviour.
//
// Ported from refs/heads/ServerDestroyer/p63-05:scripts/verify-orca-terminal-keys-live.mjs
// by reading it and writing it again (never merged). Kept: the in-session
// control, keySpecFor, visibleFormFor, segmentsOf, the raw-mode cat -v probe
// command and the import-silence self-test. Not ported, because they belong to
// the dropped o<n> bridge (D-31): runTabStage, the backend-parent chain, the
// kind 'orca' restore stage and the o<n> name pattern.
//
// One PowerBrowser session (scripts/lib/orca-tabs-live.mjs):
//  1. Control, before any Orca terminal tab exists: each of the six keys is
//     pressed in a t<n> terminal tab running a raw-mode cat -v recorder and in a
//     web tab; the effect is recorded: the tab count change (main and bottom
//     areas, where Theia's terminals open), whether
//     the active widget changed, and for t<n> the bytes the recorder saw.
//  2. Only when the prerequisites hold (orca-panes merged and wired, orcad and
//     the pane bundle built): an Orca terminal created through orcad's CLI runs
//     the same recorder, its hosted tab is focused and each key is pressed with
//     a typed separator. orcad's terminal read must show ^W and ^T and a
//     non-empty sequence for every other key; the tab count and the active
//     widget must not change on any key. While theia/extensions/orca-panes is
//     absent this stage prints its named SKIP.
//  3. The t<n> and web tabs are measured again and each key's effect must
//     equal the control.
//  Why an in-session control stands in for P63-25's control taken before the
//  Orca extension is loaded: orca-terminal-keys proves statically that every
//  passthrough row's when clause is the scoped key powerbrowser.orcaTerminalFocus,
//  created only on hosted terminal nodes, so outside one the rows are inert and
//  the session behaves as one without the extension. Measuring again after a
//  hosted terminal had focus catches a key left set on another widget. This
//  substitution is an owner-review item (64-04-SUMMARY).
//
// Keys, derived at check time: ORCA_TERMINAL_PASSTHROUGH_KEYS from orca-panes'
// protocol file when orca-panes is present, else the reserved PAGE_KEYS rows
// (verify-orca-terminal-keys.mjs's derivation); each key's visible form from
// its name. TERMINAL_NAME_PATTERN from tab-uris' terminal-naming-contribution.ts.
//
// Run under the live lock with this shell's ORCA_* unset:
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-orca-terminal-keys-live.mjs
// It signals only identities it recorded; the Orca CLI gets an environment built
// from scratch. No pairing value, env value or token is printed.
//
// Tier: full. --self-test is quick: the pure verdicts over fixture
// observations, the derivations over fixture sources, plus a child Node that
// imports this module and must stay silent.
//
// Usage:
//   node scripts/verify-orca-terminal-keys-live.mjs
//   node scripts/verify-orca-terminal-keys-live.mjs --self-test

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const NAME = 'orca-terminal-keys-live';
const SELF_REL = 'scripts/verify-orca-terminal-keys-live.mjs';
const PROTOCOL_REL = 'theia/extensions/orca-panes/src/common/orca-panes-protocol.ts';
const ORCA_PANES_REL = 'theia/extensions/orca-panes';
const NAMING_REL = 'theia/extensions/tab-uris/src/browser/terminal-naming-contribution.ts';
const PAGE_KEYS_REL = 'powerbrowser/shell/powerbrowser.js';
const WORK_REL = '.mozbuild/orca-terminal-keys-live';
// Raw mode so ^W reaches cat instead of the line discipline's word erase.
export const PROBE_COMMAND = 'stty -icanon -echo -isig -iexten; exec cat -v';
const sep = (i) => `@K${i}@`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

// ---------------------------------------------------------------------------
// Check-time reads.

/** The string literals of ORCA_TERMINAL_PASSTHROUGH_KEYS, or null when the declaration is absent. */
export function readPassthroughKeys(text) {
    const at = String(text ?? '').search(/export\s+const\s+ORCA_TERMINAL_PASSTHROUGH_KEYS\b/);
    if (at < 0) return null;
    // After the '=', so a type annotation's brackets (readonly string[]) are not taken for the array.
    const open = text.indexOf('[', text.indexOf('=', at));
    const close = text.indexOf(']', open);
    if (open < 0 || close < 0) return null;
    return [...text.slice(open, close).matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
}

/** The exported regex literal `name` of a source, or null. */
export function readPattern(text, name) {
    const m = new RegExp(`export\\s+const\\s+${name}\\b[^=]*=\\s*\\/((?:\\\\.|[^/\\n])+)\\/([a-z]*)`).exec(String(text ?? ''));
    return m ? new RegExp(m[1], m[2]) : null;
}

const NAMED_KEYS = { tab: ['Tab', 'Tab', 9], pageup: ['PageUp', 'PageUp', 33], pagedown: ['PageDown', 'PageDown', 34] };
/** A Theia key string (ctrl+shift+tab) as a pressKey spec, or null when it cannot be mapped. */
export function keySpecFor(theiaKey) {
    const parts = String(theiaKey).toLowerCase().split('+');
    const base = parts.pop();
    const modifiers = parts.map((p) => (p === 'ctrl' ? 'control' : p));
    if (modifiers.some((m) => !['control', 'shift', 'alt', 'meta'].includes(m))) return null;
    if (/^[a-z]$/.test(base)) return { key: base, code: `Key${base.toUpperCase()}`, keyCode: base.toUpperCase().charCodeAt(0), modifiers };
    const named = NAMED_KEYS[base];
    return named ? { key: named[0], code: named[1], keyCode: named[2], modifiers } : null;
}

/** What cat -v prints for a ctrl+<letter> key (^W), or null when only a non-empty sequence is required. */
export function visibleFormFor(theiaKey) {
    const m = /^ctrl\+([a-z])$/.exec(String(theiaKey).toLowerCase());
    return m ? `^${m[1].toUpperCase()}` : null;
}

/** The text between separator i and i+1 for each key, from orcad's terminal read. A missing separator gives null. */
export function segmentsOf(text, keys) {
    return keys.map((_, i) => {
        const a = text.indexOf(sep(i));
        const b = text.indexOf(sep(i + 1), a + 1);
        return a < 0 || b < 0 ? null : text.slice(a + sep(i).length, b);
    });
}

/**
 * The keys to press: the protocol's list when orca-panes is present (a missing or unmappable list throws, red),
 * else the reserved PAGE_KEYS rows. Resolves { keys, source, userName }.
 */
export async function readKeys(root = REPO_ROOT) {
    const userName = readPattern(read(join(root, NAMING_REL)), 'TERMINAL_NAME_PATTERN');
    if (!userName) throw new Error(`${NAMING_REL} exports no TERMINAL_NAME_PATTERN`);
    let keys;
    let source;
    if (existsSync(join(root, ORCA_PANES_REL))) {
        keys = readPassthroughKeys(read(join(root, PROTOCOL_REL)));
        if (!keys || !keys.length) throw new Error(`${PROTOCOL_REL} exports no ORCA_TERMINAL_PASSTHROUGH_KEYS while ${ORCA_PANES_REL} is present`);
        source = 'ORCA_TERMINAL_PASSTHROUGH_KEYS';
    } else {
        const { loadTypeScript, derivePageKeys } = await import('./verify-orca-terminal-keys.mjs');
        if (!loadTypeScript()) throw new Error('theia/node_modules/typescript is absent, so PAGE_KEYS cannot be derived; run the audited Theia install');
        const d = derivePageKeys(read(join(root, PAGE_KEYS_REL)) ?? '');
        if (d.fails.length) throw new Error(d.fails.join('; '));
        keys = d.keys;
        source = 'PAGE_KEYS reserved rows';
    }
    const unmapped = keys.filter((k) => !keySpecFor(k));
    if (unmapped.length) throw new Error(`unmapped key ${unmapped.join(', ')} in ${source}`);
    return { keys, source, userName };
}

// ---------------------------------------------------------------------------
// Pure verdicts (the self-test's subject). Each returns red reasons.

/** Stage 1: the control measured every key in both tabs. obs: { keys, control: { term, web } }. */
export function controlVerdict(obs) {
    if (!obs.keys?.length) return ['no keys were read, so nothing was pressed'];
    const missing = obs.keys.filter((k) => !obs.control?.term?.[k] || !obs.control?.web?.[k]);
    return missing.length ? [`control incomplete: no effect recorded for ${missing.join(', ')} in the t<n> terminal or the web tab`] : [];
}

/** Stage 2. obs: { keys, orca: { text, effects: { key: { tabDelta, activeChanged } } } }. */
export function orcaStageVerdict(obs) {
    const fails = [];
    if (!obs.orca) return ['stage 2 not measured'];
    if (!obs.orca.tab) return ['hosted terminal tab missing: the CLI-created Orca terminal produced no hosted widget'];
    const segments = segmentsOf(obs.orca.text ?? '', obs.keys);
    obs.keys.forEach((key, i) => {
        const form = visibleFormFor(key);
        const seg = segments[i];
        if (seg === null) fails.push(`separators around ${key} are missing from orcad's terminal read, so the hosted terminal did not get the typed text`);
        else if (form && !seg.includes(form)) fails.push(`${form} missing: ${key} pressed in the hosted Orca terminal did not reach the PTY (read ${JSON.stringify(seg)})`);
        else if (!form && !seg.length) fails.push(`no sequence for ${key}: it did not reach the PTY from the hosted Orca terminal`);
        const e = obs.orca.effects?.[key];
        if (!e || e.tabDelta !== 0 || e.activeChanged) fails.push(`${key} closed or switched a tab in the hosted Orca terminal (tab count change ${e?.tabDelta}, active widget changed ${e?.activeChanged})`);
    });
    return fails;
}

const sameEffect = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Stage 3. obs: { keys, control: { term, web }, after: { term, web } }. */
export function repeatVerdict(obs) {
    const fails = [];
    for (const key of obs.keys) {
        if (!sameEffect(obs.after?.term?.[key], obs.control?.term?.[key])) fails.push(`${key} in the t<n> tab differs from the control: ${JSON.stringify(obs.after?.term?.[key])} now, ${JSON.stringify(obs.control?.term?.[key])} in the control`);
        if (!sameEffect(obs.after?.web?.[key], obs.control?.web?.[key])) fails.push(`${key} in the web tab differs from the control: ${JSON.stringify(obs.after?.web?.[key])} now, ${JSON.stringify(obs.control?.web?.[key])} in the control`);
    }
    return fails;
}

/** The last line: a stage-2 SKIP counts only while orca-panes is absent; a SKIP with it present is red. */
export function overallVerdict({ control, stage2, stage2Skip, panesPresent, repeat }) {
    const fails = [...control, ...repeat];
    if (stage2Skip) {
        if (panesPresent) fails.push(`stage 2 skipped while ${ORCA_PANES_REL} is present (${stage2Skip})`);
    } else fails.push(...stage2);
    return fails;
}

/** obs: { exitCode, stdout, stderr, timedOut, startedProcess } of a child Node that only imported this module. */
export function importSilenceVerdict(obs) {
    const what = [];
    if (obs.timedOut) what.push('did not finish within 10 s');
    if (obs.exitCode !== 0) what.push(`exited ${obs.exitCode}`);
    if (obs.stdout) what.push(`printed ${JSON.stringify(String(obs.stdout).slice(0, 80))}`);
    if (obs.stderr) what.push(`wrote ${JSON.stringify(String(obs.stderr).slice(0, 80))} to stderr`);
    if (obs.startedProcess) what.push('started a process');
    return what.length ? [`side effect on import: importing ${SELF_REL} ${what.join(', ')}`] : [];
}

// ---------------------------------------------------------------------------
// Live.

/** One key's effect in the active tab: tab count change, active change and (t<n>) the bytes the recorder saw. */
async function effectOf(ctx, spec, recorderFile) {
    const before = await ctx.tabState();
    const size = recorderFile ? (read(recorderFile) ?? '').length : 0;
    await ctx.pressKey(spec);
    await sleep(400);
    const after = await ctx.tabState();
    const effect = { tabDelta: after.ids.length - before.ids.length, activeChanged: after.active !== before.active };
    if (recorderFile) effect.bytes = (read(recorderFile) ?? '').slice(size);
    return effect;
}

async function waitForWidget(ctx, pattern, except, ms = 30000) {
    return ctx.pollFor(async () => (await ctx.tabState()).ids.find((id) => pattern.test(id) && !except.includes(id)) ?? null, ms, `a main-area widget matching ${pattern}`);
}

async function run({ log }) {
    const lib = await import('./lib/orca-tabs-live.mjs');
    const base = lib.prerequisites({ needPanes: false });
    if (base.skip) return { skip: base.skip };
    const orcaPrereq = lib.prerequisites({ needOrca: true });
    const panesPresent = existsSync(join(REPO_ROOT, ORCA_PANES_REL));
    const { keys, source, userName } = await readKeys();
    const obs = { keys, control: { term: {}, web: {} }, orca: null, after: { term: {}, web: {} } };
    const work = join(REPO_ROOT, WORK_REL);
    mkdirSync(work, { recursive: true });
    let stage2Skip = orcaPrereq.skip;
    let stage2Fail = orcaPrereq.fail;
    await lib.withOrcaTabsSession({ log, needOrca: !orcaPrereq.skip && !orcaPrereq.fail }, async (ctx) => {
        const pages = await ctx.serveNavPages({ '/k': { title: 'keys control', body: '<p>keys control page</p>' } });
        try {
            let term = null;
            let web = null;
            let webTabId = null;
            let recorder = null;
            let hosted = null;
            // The tabs the session opened with; a key's stray tab is anything else.
            const baseline = (await ctx.tabState()).ids;
            // (Re)creates the t<n> recorder and the web tab when a key closed one, and closes any tab a key opened.
            const fixtures = async () => {
                const ids = (await ctx.tabState()).ids;
                if (!term || !ids.includes(term)) {
                    const before = (await ctx.tabState()).ids;
                    await ctx.command('terminal:new');
                    term = await waitForWidget(ctx, userName, before);
                    recorder = join(work, `${term}-${Date.now()}.bytes`);
                    if (!(await ctx.sendText(term, `stty -icanon -echo -isig -iexten; cat -v > ${recorder}\r`))) throw new Error(`harness: ${term} takes no text`);
                    await ctx.pollFor(async () => existsSync(recorder), 10000, 'the t<n> recorder file');
                }
                if (!web || !ids.includes(web)) {
                    webTabId = await ctx.openWebTab(pages.url('/k'));
                    web = (await ctx.tabState()).ids.find((id) => id.endsWith(`:${webTabId}`)) ?? null;
                    if (!web) throw new Error('harness: the opened web tab has no main-area widget');
                }
                const known = [...baseline, term, web, ...(hosted ? [hosted] : [])];
                await ctx.probe(`const shell = get('ApplicationShell');
                    for (const w of [...shell.getWidgets('main'), ...shell.getWidgets('bottom')]) if (!${JSON.stringify(known)}.includes(w.id)) w.close();
                    return true;`);
            };
            const measure = async (into) => {
                for (const key of keys) {
                    await fixtures();
                    await ctx.focusTheiaFrame();
                    await ctx.activate(term);
                    into.term[key] = await effectOf(ctx, keySpecFor(key), recorder);
                    await fixtures();
                    await ctx.activate(web);
                    await ctx.focusOverlay(webTabId);
                    into.web[key] = await effectOf(ctx, keySpecFor(key), null);
                }
            };
            await measure(obs.control);
            log(`control: ${keys.length} keys measured in a t<n> terminal and a web tab (keys from ${source})`);

            if (!stage2Skip && !stage2Fail) {
                obs.orca = { tab: null, text: '', effects: {} };
                const before = await lib.hostedIds(ctx);
                const t0 = Date.now();
                const created = ctx.orca('terminal', 'create', '--worktree', ctx.worktree, '--command', PROBE_COMMAND);
                const handle = created?.result?.terminal?.handle;
                if (!handle) throw new Error('the Orca CLI created a terminal but returned no handle');
                const added = await lib.waitForHostedAdd(ctx, t0, before, 30000);
                hosted = added?.id ?? null;
                obs.orca.tab = hosted;
                if (hosted) {
                    await ctx.focusTheiaFrame();
                    await ctx.activate(hosted);
                    for (const [i, key] of keys.entries()) {
                        await ctx.typeText(sep(i));
                        obs.orca.effects[key] = await effectOf(ctx, keySpecFor(key), null);
                        await ctx.activate(hosted);
                    }
                    await ctx.typeText(sep(keys.length));
                    await ctx.pollFor(async () => lib.terminalText(ctx, handle).includes(sep(keys.length)), 15000, 'the last separator in orcad\'s terminal read').catch(() => false);
                    obs.orca.text = lib.terminalText(ctx, handle);
                }
            }
            await measure(obs.after);
        } finally {
            await pages.close();
        }
    });
    if (stage2Fail) return { obs, panesPresent, stage2Skip: null, stage2: [stage2Fail] };
    return { obs, panesPresent, stage2Skip, stage2: stage2Skip ? [] : orcaStageVerdict(obs) };
}

async function main() {
    const say = (line) => console.log(`${NAME}: ${line}`);
    let r;
    try { r = await run({ log: say }); } catch (err) {
        console.error(`${NAME}: FAIL -- harness: ${err.message}`);
        return 1;
    }
    if (r.skip) { say(`SKIP -- ${r.skip}`); return 0; }
    const control = controlVerdict(r.obs);
    const repeat = repeatVerdict(r.obs);
    if (r.stage2Skip) say(`stage 2: SKIP -- ${r.stage2Skip}`);
    else say(r.stage2.length ? `stage 2: FAIL -- ${r.stage2.join('; ')}` : 'stage 2: PASS -- every key reached the hosted terminal\'s PTY with the tab count and active widget unchanged');
    say(repeat.length ? `stage 3: FAIL -- ${repeat.join('; ')}` : 'stage 3: equal to the control');
    say(`note -- control effects t<n> ${JSON.stringify(r.obs.control.term)}, web ${JSON.stringify(r.obs.control.web)}`);
    const fails = overallVerdict({ control, stage2: r.stage2, stage2Skip: r.stage2Skip, panesPresent: r.panesPresent, repeat });
    if (fails.length) { for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`); console.log(`${NAME}: FAIL`); return 1; }
    say(`PASS -- control measured; stage 2 ${r.stage2Skip ? 'SKIP (orca-panes absent)' : 'PASS'}; the t<n> and web tab effects equal the in-session control`);
    return 0;
}

// ---------------------------------------------------------------------------
// --self-test

/** Imports this module in a child Node and observes it. Exit 3 from the child means it had a child process. */
export function observeImport() {
    const script = `await import(${JSON.stringify(pathToFileURL(SELF).href)});
await new Promise((r) => setTimeout(r, 200));
let kids = '';
try { kids = (await import('node:fs')).readFileSync('/proc/self/task/' + process.pid + '/children', 'utf8').trim(); } catch {}
process.exit(kids ? 3 : 0);`;
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ORCA_')));
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000, env, cwd: REPO_ROOT });
    return { exitCode: r.status === 3 ? 0 : r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut: r.error?.code === 'ETIMEDOUT', startedProcess: r.status === 3 };
}

const KEYS = ['ctrl+w', 'ctrl+t', 'ctrl+tab', 'ctrl+shift+tab', 'ctrl+pageup', 'ctrl+pagedown'];
const FORMS = { 'ctrl+w': '^W', 'ctrl+t': '^T', 'ctrl+tab': '\t', 'ctrl+shift+tab': '^[[Z', 'ctrl+pageup': '^[[5;5~', 'ctrl+pagedown': '^[[6;5~' };
function fixtureObs() {
    const still = { tabDelta: 0, activeChanged: false };
    const term = { 'ctrl+w': { tabDelta: -1, activeChanged: true, bytes: '' }, 'ctrl+t': { tabDelta: 1, activeChanged: true, bytes: '' }, 'ctrl+tab': { tabDelta: 0, activeChanged: true, bytes: '' }, 'ctrl+shift+tab': { tabDelta: 0, activeChanged: true, bytes: '' }, 'ctrl+pageup': { tabDelta: 0, activeChanged: true, bytes: '' }, 'ctrl+pagedown': { tabDelta: 0, activeChanged: true, bytes: '' } };
    const web = Object.fromEntries(KEYS.map((k) => [k, { tabDelta: term[k].tabDelta, activeChanged: true }]));
    return {
        keys: KEYS,
        control: { term: structuredClone(term), web: structuredClone(web) },
        orca: { tab: 'orca-pane:term1', text: `${KEYS.map((k, i) => `${sep(i)}${FORMS[k]}`).join('')}${sep(KEYS.length)}`, effects: Object.fromEntries(KEYS.map((k) => [k, { ...still }])) },
        after: { term: structuredClone(term), web: structuredClone(web) },
    };
}
const all = (o) => overallVerdict({ control: controlVerdict(o), stage2: orcaStageVerdict(o), stage2Skip: null, panesPresent: true, repeat: repeatVerdict(o) });

function runSelfTest() {
    const keysTs = `export const ORCA_TERMINAL_PASSTHROUGH_KEYS: readonly string[] = Object.freeze([\n    'ctrl+w', 'ctrl+t', 'ctrl+tab',\n    'ctrl+shift+tab', 'ctrl+pageup', 'ctrl+pagedown',\n]);\n`;
    const namingTs = 'export const TERMINAL_NAME_PATTERN = /^t(\\d+)$/;\n';
    const derive = () => {
        const fails = [];
        if (JSON.stringify(readPassthroughKeys(keysTs)) !== JSON.stringify(KEYS)) fails.push(`readPassthroughKeys gave ${JSON.stringify(readPassthroughKeys(keysTs))}`);
        const t = readPattern(namingTs, 'TERMINAL_NAME_PATTERN');
        if (!t?.test('t3') || t.test('orca-pane:term3')) fails.push('readPattern did not read TERMINAL_NAME_PATTERN');
        if (KEYS.some((k) => !keySpecFor(k)) || keySpecFor('ctrl+f13') !== null) fails.push('keySpecFor maps a key it cannot press or drops one of the six');
        if (visibleFormFor('ctrl+w') !== '^W' || visibleFormFor('ctrl+tab') !== null) fails.push('visibleFormFor');
        return fails;
    };
    const cases = [
        ['all stages control', null, () => all(fixtureObs())],
        ['pre-merge run: stage 2 SKIP while orca-panes is absent', null, () => { const o = fixtureObs(); o.orca = null; return overallVerdict({ control: controlVerdict(o), stage2: [], stage2Skip: 'lane p64-02 not merged', panesPresent: false, repeat: repeatVerdict(o) }); }],
        ['derivations over fixture sources', null, derive],
        ['real module import (child Node, 10 s)', null, () => importSilenceVerdict(observeImport())],
        ['stage 2 SKIP with orca-panes present', 'stage 2 skipped while', () => { const o = fixtureObs(); return overallVerdict({ control: controlVerdict(o), stage2: [], stage2Skip: 'no built orca/', panesPresent: true, repeat: repeatVerdict(o) }); }],
        ['control missing a key', 'control incomplete', () => { const o = fixtureObs(); delete o.control.web['ctrl+t']; delete o.after.web['ctrl+t']; return all(o); }],
        ['hosted terminal tab missing', 'hosted terminal tab missing', () => { const o = fixtureObs(); o.orca.tab = null; return all(o); }],
        ['^W missing', '^W missing', () => { const o = fixtureObs(); o.orca.text = o.orca.text.replace('^W', ''); return all(o); }],
        ['a separator missing', 'separators around ctrl+tab are missing', () => { const o = fixtureObs(); o.orca.text = o.orca.text.replace(sep(2), ''); return all(o); }],
        ['a key that closed the hosted tab', 'closed or switched a tab', () => { const o = fixtureObs(); o.orca.effects['ctrl+w'] = { tabDelta: -1, activeChanged: true }; return all(o); }],
        ['a key that switched away from the hosted tab', 'closed or switched a tab', () => { const o = fixtureObs(); o.orca.effects['ctrl+pagedown'] = { tabDelta: 0, activeChanged: true }; return all(o); }],
        ['a t<n> effect differing from the control', 't<n> tab differs from the control', () => { const o = fixtureObs(); o.after.term['ctrl+tab'] = { tabDelta: 0, activeChanged: false, bytes: '\t' }; return all(o); }],
        ['a web-tab effect differing from the control', 'web tab differs from the control', () => { const o = fixtureObs(); o.after.web['ctrl+t'] = { tabDelta: 0, activeChanged: false }; return all(o); }],
        ['an import that printed a line', 'side effect on import', () => importSilenceVerdict({ exitCode: 0, stdout: 'orca-terminal-keys-live: SKIP\n', stderr: '', timedOut: false, startedProcess: false })],
        ['an import that started a process', 'side effect on import', () => importSilenceVerdict({ exitCode: 0, stdout: '', stderr: '', timedOut: false, startedProcess: true })],
    ];
    let failures = 0;
    let ok = 0;
    for (const [label, naming, runCase] of cases) {
        let fails;
        try { fails = runCase(); } catch (err) { fails = [`threw ${err.message}`]; }
        const text = fails.join('\n');
        if (naming === null) {
            if (fails.length) { console.error(`  FAIL ${label} -> not green: ${text}`); failures++; } else console.log(`  control ${label} -> green`);
        } else if (!fails.length) { console.error(`  FAIL ${label} -> stayed green`); failures++; }
        else if (!text.includes(naming)) { console.error(`  FAIL ${label} -> red, but not naming '${naming}': ${text}`); failures++; }
        else { console.log(`  ok ${label} -> red, naming '${naming}'`); ok++; }
    }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${ok} planted faults each went red naming the drift`);
    return 0;
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(SELF); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const unknown = args.find((a) => a !== '--self-test');
    if (unknown !== undefined) {
        console.error(`${NAME}: FAIL -- unknown argument '${unknown}' (usage: node ${SELF_REL} [--self-test])`);
        process.exit(2);
    }
    process.exit(args.includes('--self-test') ? runSelfTest() : await main());
}
