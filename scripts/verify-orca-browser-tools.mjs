#!/usr/bin/env node
// scripts/verify-orca-browser-tools.mjs
//
// orca-browser-tools (Phase 66, BRW-05; P66-24, P66-25, P66-30): every user-facing
// tool of Orca's browser has a home in PowerBrowser.
//
// Derived at check time, never hand-kept:
//  a. the U-row ids from spike 005's README table (lines starting "| U-");
//  b. ORCA_BROWSER_TOOLS from theia/extensions/orca-browser/src/common/orca-browser-tools.ts,
//     transpiled with theia/node_modules/typescript and evaluated;
//  c. the registered command ids: every registerCommand(...) first argument in
//     theia/extensions/*/src (comments stripped), resolved through the
//     `const X = { id: ... }` command objects and `const Y = '<id>'` constants;
//  d. the chrome bar's render methods: defined in chrome-bar-widget.tsx and called
//     as this.<name>() in it;
//  e. KIND_CLASSES' keys in scripts/verify-web-tab-bridge.mjs;
//  f. the v2 requirement ids (bold **ID** rows under "## v2 Requirements") in
//     .planning/workstreams/orca/REQUIREMENTS.md.
// Compared: the U-row set equals the map's keys (both ways); a command entry is a
// registered id, a render entry a defined and called method, a kind entry a
// classified kind, a deferral a v2 id, a skip a non-empty reason; every entry has
// exactly one of the five shapes. An empty U-row parse is red ("broken instrument").
//
// Tier: quick. Named SKIP when theia/node_modules/typescript is absent. --self-test
// runs the verdict over in-memory fixture sources: the control must be green, then
// each planted fault must go red naming its drift.
//
// Usage:
//   node scripts/verify-orca-browser-tools.mjs
//   node scripts/verify-orca-browser-tools.mjs --self-test

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-browser-tools';
export const REL = {
    readme: '.planning/spikes/005-orca-browser-parity/README.md',
    tools: 'theia/extensions/orca-browser/src/common/orca-browser-tools.ts',
    widget: 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx',
    bridge: 'scripts/verify-web-tab-bridge.mjs',
    requirements: '.planning/workstreams/orca/REQUIREMENTS.md',
    extensions: 'theia/extensions',
};
export const SHAPES = ['command', 'render', 'webTabKind', 'skip', 'deferred'];

/** theia/node_modules/typescript, or undefined when it is not installed. */
export function loadTypescript(root = REPO_ROOT) {
    try { return createRequire(join(root, 'theia', 'package.json'))('typescript'); } catch { return undefined; }
}

/** Removes // and block comments outside string and template literals. */
export function stripComments(text) {
    let out = '';
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1;
            while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
            out += text.slice(i, j + 1);
            i = j;
        } else if (c === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i++;
            out += '\n';
        } else if (c === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            i = end < 0 ? text.length : end + 1;
        } else out += c;
    }
    return out;
}

/** The U-row ids of the README table, in order. */
export function parseURows(readme) {
    return readme.split('\n').map((l) => /^\|\s*(U-\d+)\s*\|/.exec(l)?.[1]).filter(Boolean);
}

/** The ids registered through registerCommand(...) across the given sources (text per file). */
export function registeredCommands(sources) {
    const texts = sources.map(stripComments);
    const strings = new Map();
    const objects = new Map();
    for (const t of texts) {
        for (const m of t.matchAll(/\bconst\s+(\w+)(?:\s*:\s*[\w.<>[\]]+)?\s*=\s*'([^']+)'/g)) strings.set(m[1], m[2]);
        for (const m of t.matchAll(/\bconst\s+(\w+)(?:\s*:\s*[\w.<>]+)?\s*=\s*\{([^{}]*)\}/g)) {
            const id = /\bid\s*:\s*('([^']+)'|\w+)/.exec(m[2]);
            if (id) objects.set(m[1], id[2] ?? id[1]);
        }
    }
    const value = (ref) => (ref.startsWith("'") ? ref.slice(1, -1) : strings.get(ref));
    const ids = new Set();
    for (const t of texts) {
        for (const m of t.matchAll(/registerCommand\(\s*(\{[^{}]*\}|[A-Za-z_]\w*)/g)) {
            const arg = m[1];
            const ref = arg.startsWith('{') ? /\bid\s*:\s*('([^']+)'|\w+)/.exec(arg)?.[1] : objects.get(arg);
            const id = ref && value(ref);
            if (id) ids.add(id);
        }
    }
    return ids;
}

/** Render methods defined in the widget source and called as this.<name>() in it. */
export function renderMethods(widget) {
    const t = stripComments(widget);
    const defined = [...t.matchAll(/^\s*(?:protected|private|public)?\s*(render\w*)\s*\([^)]*\)\s*:/gm)].map((m) => m[1]);
    return new Set(defined.filter((n) => t.includes(`this.${n}(`)));
}

/** KIND_CLASSES' keys in verify-web-tab-bridge.mjs. */
export function classifiedKinds(bridge) {
    const body = /const KIND_CLASSES = new Map\(\[([\s\S]*?)\n\]\);/.exec(stripComments(bridge))?.[1] ?? '';
    return new Set([...body.matchAll(/\[\s*'(\w+)'\s*,/g)].map((m) => m[1]));
}

/** Bold requirement ids under "## v2 Requirements", up to the next level-2 heading. */
export function v2Ids(requirements) {
    const at = requirements.indexOf('\n## v2 Requirements');
    if (at < 0) return new Set();
    const rest = requirements.slice(at + 1);
    const end = rest.indexOf('\n## ', 1);
    return new Set([...(end < 0 ? rest : rest.slice(0, end)).matchAll(/\*\*([A-Z]+-\d+)\*\*/g)].map((m) => m[1]));
}

/** Transpiles and evaluates the map source; returns ORCA_BROWSER_TOOLS. */
export function loadTools(ts, source) {
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
    const module = { exports: {} };
    new Function('module', 'exports', js)(module, module.exports);
    return module.exports.ORCA_BROWSER_TOOLS;
}

/**
 * The verdict. inputs: { rows: string[], tools: Record<string, object>, commands: Set,
 * renders: Set, kinds: Set, v2: Set }. Returns { fails: string[], counts }.
 */
export function judge({ rows, tools, commands, renders, kinds, v2 }) {
    const fails = [];
    const counts = { contributions: 0, mark: 0, skips: 0, deferrals: 0 };
    if (rows.length === 0) return { fails: ['broken instrument: the README table parse yielded zero U-rows'], counts };
    if (!tools || typeof tools !== 'object') return { fails: ['broken instrument: ORCA_BROWSER_TOOLS is not exported'], counts };
    const keys = Object.keys(tools);
    for (const id of rows) if (!keys.includes(id)) fails.push(`unmapped U-row: ${id} is in the spike table and not in ORCA_BROWSER_TOOLS`);
    for (const id of keys) if (!rows.includes(id)) fails.push(`stale map entry: ${id} is in ORCA_BROWSER_TOOLS and not in the spike table`);
    for (const [id, entry] of Object.entries(tools)) {
        const shape = Object.keys(entry ?? {});
        if (shape.length !== 1 || !SHAPES.includes(shape[0])) { fails.push(`bad entry shape: ${id} has ${JSON.stringify(shape)}`); continue; }
        const [k] = shape;
        const v = entry[k];
        if (k === 'command') { counts.contributions++; if (!commands.has(v)) fails.push(`command not registered: ${id} -> ${v}`); }
        if (k === 'render') {
            if (!renders.has(v)) fails.push(`render method missing: ${id} -> ${v} is not defined and called in chrome-bar-widget.tsx`);
            if (v === 'renderAgentControl') counts.mark++; else counts.contributions++;
        }
        if (k === 'webTabKind') { counts.contributions++; if (!kinds.has(v)) fails.push(`kind not classified: ${id} -> ${v} is not a KIND_CLASSES key`); }
        if (k === 'deferred') { counts.deferrals++; if (!v2.has(v)) fails.push(`deferral to unknown id: ${id} -> ${v} is not a v2 requirement`); }
        if (k === 'skip') { counts.skips++; if (typeof v !== 'string' || !v.trim()) fails.push(`empty skip reason: ${id}`); }
    }
    return { fails, counts };
}

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'lib') continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(name)) out.push(p);
    }
    return out;
}

/** Reads the tree into the verdict's inputs. */
export function gather(ts, root = REPO_ROOT) {
    const read = (rel) => readFileSync(join(root, rel), 'utf8');
    const ext = join(root, REL.extensions);
    const sources = readdirSync(ext).flatMap((e) => (existsSync(join(ext, e, 'src')) ? walk(join(ext, e, 'src')) : []));
    return {
        rows: parseURows(read(REL.readme)),
        tools: loadTools(ts, read(REL.tools)),
        commands: registeredCommands(sources.map((p) => readFileSync(p, 'utf8'))),
        renders: renderMethods(read(REL.widget)),
        kinds: classifiedKinds(read(REL.bridge)),
        v2: v2Ids(read(REL.requirements)),
        files: sources.length,
    };
}

// ---------------------------------------------------------------- self-test

const FIX = {
    readme: '| ID | Tool | PB | Note |\n|---|---|---|---|\n| U-01 | Address | chrome bar | x |\n| U-02 | Mark | chrome bar | x |\n| U-03 | Popups | native | x |\n| U-04 | Grab | panel | x |\n| U-05 | Profiles | skip | x |\n',
    tools: "export const ORCA_BROWSER_TOOLS = Object.freeze({ 'U-01': { command: 'pb.focus' }, 'U-02': { render: 'renderAgentControl' }, 'U-03': { webTabKind: 'webTabAdopt' }, 'U-04': { deferred: 'BRW-06' }, 'U-05': { skip: 'one profile' } });\n",
    commands: "export const FOCUS_ID = 'pb.focus';\nexport const FOCUS: Command = { id: FOCUS_ID, label: 'Focus' };\nclass C { registerCommands(c) { c.registerCommand(FOCUS, { execute: () => 1 }); } }\n",
    widget: 'class W {\n    protected renderAgentControl(): React.ReactNode { return 1; }\n    protected render(): React.ReactNode { return this.renderAgentControl(); }\n}\n',
    bridge: "const KIND_CLASSES = new Map([\n    ['webTabOpen', 'tab-lifecycle'],\n    ['webTabAdopt', 'tab-lifecycle'],\n]);\n",
    requirements: '## v1 Requirements\n- **BRW-02**: x\n## v2 Requirements\n- **BRW-06**: Grab.\n## Out of Scope\n- **BRW-99**: no.\n',
};

const PLANTS = [
    ['added-u-row', (f) => ({ ...f, readme: `${f.readme}| U-06 | New | native | x |\n` }), 'unmapped U-row: U-06'],
    ['removed-map-entry', (f) => ({ ...f, tools: f.tools.replace(" 'U-05': { skip: 'one profile' } ", ' ') }), 'unmapped U-row: U-05'],
    ['command-not-registered', (f) => ({ ...f, commands: f.commands.replace('c.registerCommand(FOCUS,', 'c.other(FOCUS,') }), 'command not registered: U-01'],
    ['render-method-missing', (f) => ({ ...f, widget: f.widget.replace('return this.renderAgentControl();', 'return 0;') }), 'render method missing: U-02'],
    ['kind-not-classified', (f) => ({ ...f, bridge: f.bridge.replace("    ['webTabAdopt', 'tab-lifecycle'],\n", '') }), 'kind not classified: U-03'],
    ['deferral-unknown-id', (f) => ({ ...f, tools: f.tools.replace("'BRW-06'", "'BRW-99'") }), 'deferral to unknown id: U-04'],
    ['empty-skip-reason', (f) => ({ ...f, tools: f.tools.replace("'one profile'", "' '") }), 'empty skip reason: U-05'],
    ['zero-row-parse', (f) => ({ ...f, readme: f.readme.replaceAll('| U-', '| V-') }), 'broken instrument'],
    ['stale-map-entry', (f) => ({ ...f, readme: f.readme.replace('| U-05 | Profiles | skip | x |\n', '') }), 'stale map entry: U-05'],
];

function judgeFixture(ts, f) {
    return judge({
        rows: parseURows(f.readme), tools: loadTools(ts, f.tools), commands: registeredCommands([f.commands]),
        renders: renderMethods(f.widget), kinds: classifiedKinds(f.bridge), v2: v2Ids(f.requirements),
    });
}

export function runSelfTest() {
    const ts = loadTypescript();
    if (!ts) { console.log(`${NAME} self-test: SKIP -- theia/node_modules/typescript is not installed`); return 0; }
    const control = judgeFixture(ts, FIX);
    if (control.fails.length) { console.error(`${NAME} self-test: FAIL -- control is not green: ${control.fails.join(' | ')}`); return 1; }
    console.log(`${NAME} self-test: control green -- 5 fixture rows, one of each shape`);
    let failures = 0;
    for (const [name, plant, naming] of PLANTS) {
        const r = judgeFixture(ts, plant(FIX));
        if (!r.fails.some((s) => s.includes(naming))) { console.error(`  FAIL ${name} -> ${r.fails.join(' | ') || 'green'} (expected '${naming}')`); failures++; } else console.log(`  ok ${name} -> red, naming '${naming}'`);
    }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} plant(s) did not go red naming the drift`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift`);
    return 0;
}

export function main() {
    const ts = loadTypescript();
    if (!ts) { console.log(`${NAME}: SKIP -- theia/node_modules/typescript is not installed`); return 0; }
    const g = gather(ts);
    const { fails, counts } = judge(g);
    if (fails.length) { for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`); return 1; }
    console.log(`${NAME}: PASS -- ${g.rows.length} U-rows equal the map's ${Object.keys(g.tools).length} entries: ${counts.contributions} existing contributions, ${counts.mark} mark, ${counts.skips} skips, ${counts.deferrals} deferrals; ${g.commands.size} registered command ids over ${g.files} extension sources, ${g.kinds.size} classified kinds, v2 ids ${[...g.v2].join(', ')}`);
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = process.argv[2];
    if (arg && arg !== '--self-test') { console.error('usage: node scripts/verify-orca-browser-tools.mjs [--self-test]'); process.exit(2); }
    process.exit(arg === '--self-test' ? runSelfTest() : main());
}
