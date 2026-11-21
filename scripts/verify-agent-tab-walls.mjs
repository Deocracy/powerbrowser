#!/usr/bin/env node
// scripts/verify-agent-tab-walls.mjs
//
// agent-tab-walls (v1.7 audit-fix lane G1a-chrome-shell): the chrome shell's agent-tab and page-menu fixes, each as a
// clause that reads the shipped tree and goes red when its fix is undone. Where a clause needs behaviour it runs the
// SHIPPED chrome source over the stub boundary verify-orca-browser-tab-scope.mjs already builds (its sliceSource and
// makeWorld), never a copy of the rules.
//
// Clauses (audit item in brackets):
//  scroll        [59-WR-02]  every scrollIntoView call in GroupActorChild.sys.mjs passes behavior "instant".
//  editState     [59-WR-01, chrome-actor-06]  run over the groups registerEditStateActor registers: a text-field edit
//                row in an overlay outside them (the agent group) goes through Controllers and answers done, and the
//                target-state read never asks for the pair there; a "browsers" field row still reaches the pair.
//
// Tier: quick (text reads and node:vm). --self-test plants each pre-fix fault in an in-memory copy of the tree and
// requires the clause to go red naming it.
//
// Usage:
//   node scripts/verify-agent-tab-walls.mjs
//   node scripts/verify-agent-tab-walls.mjs --self-test

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'agent-tab-walls';
let acorn;
try {
    acorn = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('acorn');
} catch {
    console.error(`${NAME}: FAIL -- broken instrument: acorn is not installed in theia/. Next step: run the audited yarn install in theia/ first.`);
    process.exit(1);
}
const FILES = {
    api: 'powerbrowser/shell/PowerBrowserAPI.sys.mjs',
    child: 'powerbrowser/shell/GroupActorChild.sys.mjs',
};

function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');
}

/** The argument text of every `<name>(` call in code, balanced on parentheses. */
function callArgs(code, name) {
    const out = [];
    const re = new RegExp(`\\.${name}\\(`, 'g');
    for (let m = re.exec(code); m; m = re.exec(code)) {
        let depth = 1;
        let i = m.index + m[0].length;
        const start = i;
        for (; i < code.length && depth > 0; i += 1) {
            if (code[i] === '(') depth += 1;
            if (code[i] === ')') depth -= 1;
        }
        out.push(code.slice(start, i - 1));
    }
    return out;
}

// ---------------------------------------------------------------------------
// Clauses. Each takes the texts and returns failure strings.

function scrollClause(texts) {
    const calls = callArgs(stripComments(texts.child), 'scrollIntoView');
    if (!calls.length) {
        return [`scroll: broken instrument: no scrollIntoView call found in ${FILES.child}`];
    }
    return calls.filter(args => !/\bbehavior:\s*"instant"/.test(args))
        .map(args => `scroll: scrollIntoView(${args.trim()}) in ${FILES.child} lacks behavior "instant", so a page with scroll-behavior: smooth reads the box before the scroll lands (59-WR-02)`);
}

/** Top-level declarations of `text` by name (functions, and const/let declarators), as source text. */
function declarations(text) {
    const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
    const out = new Map();
    for (let node of ast.body) {
        if (node.type === 'ExportNamedDeclaration' && node.declaration) node = node.declaration;
        if (node.type === 'FunctionDeclaration') out.set(node.id.name, text.slice(node.start, node.end));
        if (node.type === 'VariableDeclaration') {
            for (const d of node.declarations) {
                if (d.id.type === 'Identifier') out.set(d.id.name, `${node.kind} ${text.slice(d.start, d.end)};`);
            }
        }
    }
    return out;
}

/** Evaluates the named declarations of `text` in a fresh context over `globals`; returns the named values. */
function evalDeclarations(text, names, globals, wanted) {
    const decls = declarations(text);
    const program = names.filter(n => decls.has(n)).map(n => decls.get(n)).join('\n') +
        `\n({ ${wanted.map(n => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')} })`;
    return vm.runInContext(program, vm.createContext({ ...globals }), { filename: FILES.api });
}

// 59-WR-01 / chrome-actor-06: the edit-state pair is registered for some message manager groups; a page-menu edit row
// on a text field in an overlay outside them (an agent overlay) must run through Controllers, and the target-state
// read must not ask for the pair there. The groups are what registerEditStateActor registers, read by running it.
async function editStateClause(texts) {
    const failures = [];
    const registered = [];
    const calls = [];
    const browserIn = group => {
        const actorFor = name => {
            calls.push({ group, name });
            if (name === 'PowerBrowserEditState' && !registered.flatMap(r => r.groups).includes(group)) {
                throw Object.assign(new Error('NotSupportedError'), { name: 'NotSupportedError' });
            }
            return { sendAsyncMessage() {}, sendQuery: () => Promise.resolve({}), doCommand() {} };
        };
        return { getAttribute: n => (n === 'messagemanagergroup' ? group : null), browsingContext: { currentWindowGlobal: { getActor: actorFor } } };
    };
    const out = evalDeclarations(texts.api,
        ['EDIT_STATE_ACTOR_NAME', 'EDIT_STATE_GROUPS', 'AGENT_MESSAGE_MANAGER_GROUP', 'editStateReaches', 'registerEditStateActor', 'pageMenuEdit', 'pageEditTargetCommands', 'EDIT_STATE_BUDGET_MS'],
        {
            GROUP_ACTOR_PARENT_MODULE: 'p', GROUP_ACTOR_CHILD_MODULE: 'c', WEB_TAB_EDIT_CMDS: ['cmd_undo'],
            ChromeUtils: { registerWindowActor: (name, options) => { if (name === 'PowerBrowserEditState') registered.push({ groups: options.messageManagerGroups ?? [] }); } },
            webTabEditContext: browser => browser.browsingContext,
            PowerBrowserAPI: { sleep: () => new Promise(() => {}) },
        },
        ['AGENT_MESSAGE_MANAGER_GROUP', 'registerEditStateActor', 'pageMenuEdit', 'pageEditTargetCommands']);
    if (typeof out.registerEditStateActor !== 'function' || typeof out.pageMenuEdit !== 'function' || typeof out.pageEditTargetCommands !== 'function' || !out.AGENT_MESSAGE_MANAGER_GROUP) {
        return ['editState: broken instrument: registerEditStateActor, pageMenuEdit, pageEditTargetCommands or AGENT_MESSAGE_MANAGER_GROUP not found'];
    }
    out.registerEditStateActor();
    const groups = registered.flatMap(r => r.groups);
    if (!groups.length) return ['editState: broken instrument: registerEditStateActor registered no PowerBrowserEditState groups'];
    // Detector: a user overlay's field row goes through the pair.
    calls.length = 0;
    out.pageMenuEdit({ browser: browserIn(groups[0]), context: { onTextInput: true } }, 'cmd_undo');
    if (!calls.some(c => c.name === 'PowerBrowserEditState')) failures.push('editState: broken instrument: a field row in a "browsers" overlay did not reach the edit-state pair');
    if (groups.includes(out.AGENT_MESSAGE_MANAGER_GROUP)) return failures;
    calls.length = 0;
    let reply;
    try {
        reply = out.pageMenuEdit({ browser: browserIn(out.AGENT_MESSAGE_MANAGER_GROUP), context: { onTextInput: true } }, 'cmd_undo');
    } catch (err) {
        reply = { threw: err.name };
    }
    if (reply?.where !== 'done' || !calls.some(c => c.name === 'Controllers')) {
        failures.push(`editState: a text-field edit row in an agent overlay answered ${JSON.stringify(reply)} (actors asked: ${calls.map(c => c.name).join(', ') || 'none'}); the edit-state pair is not registered for ${out.AGENT_MESSAGE_MANAGER_GROUP}, so the row must use Controllers (59-WR-01)`);
    }
    calls.length = 0;
    const cached = { cmd_undo: true };
    const states = await Promise.race([out.pageEditTargetCommands({ browser: browserIn(out.AGENT_MESSAGE_MANAGER_GROUP) }, cached), new Promise(r => setTimeout(() => r('hung'), 100))]);
    if (states !== cached || calls.some(c => c.name === 'PowerBrowserEditState')) {
        failures.push('editState: pageEditTargetCommands asked the edit-state pair in an agent overlay, where it does not exist (chrome-actor-06)');
    }
    return failures;
}

const CLAUSES = [scrollClause, editStateClause];

export async function checkTexts(texts) {
    const failures = [];
    for (const clause of CLAUSES) {
        try {
            failures.push(...await clause(texts));
        } catch (err) {
            failures.push(`${clause.name}: broken instrument: threw ${err && err.message}`);
        }
    }
    return failures;
}

function readTree() {
    return Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, readFileSync(join(REPO_ROOT, path), 'utf8')]));
}

// ---------------------------------------------------------------------------
// Self-test: each plant reverts one fix in memory; its clause must go red naming the drift.

function replaceOnce(text, from, to, what) {
    const at = text.indexOf(from);
    if (at === -1) throw new Error(`plant anchor not found: ${what}`);
    return text.slice(0, at) + to + text.slice(at + from.length);
}

const PLANTS = [
    {
        name: '59-WR-02: agentCentre scrolls with the default behavior',
        plant: t => ({ ...t, child: replaceOnce(t.child, 'element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" })', 'element.scrollIntoView({ block: "center", inline: "center" })', 'agentCentre scroll') }),
        expect: 'lacks behavior "instant"',
    },
    {
        name: '59-WR-02: the browser.scrollIntoView row scrolls with the default behavior',
        plant: t => ({ ...t, child: replaceOnce(t.child, '.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });\n    return', '.scrollIntoView({ block: "center", inline: "center" });\n    return', 'scrollIntoView row') }),
        expect: 'lacks behavior "instant"',
    },
    {
        name: '59-WR-01: pageMenuEdit sends every text-field row to the edit-state pair',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'data.context.onTextInput && editStateReaches(data.browser) ?', 'data.context.onTextInput ?', 'pageMenuEdit route') }),
        expect: 'must use Controllers',
    },
    {
        name: 'chrome-actor-06: pageEditTargetCommands asks the pair in any overlay',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'async function pageEditTargetCommands(data, cached) {\n  if (!editStateReaches(data.browser)) {\n    return cached;\n  }\n', 'async function pageEditTargetCommands(data, cached) {\n', 'pageEditTargetCommands guard') }),
        expect: 'asked the edit-state pair in an agent overlay',
    },
];

async function selfTest() {
    const tree = readTree();
    const green = await checkTexts(tree);
    if (green.length) {
        console.error(`${NAME} self-test: FAIL -- the unplanted tree is not green: ${green.join(' | ')}`);
        return 1;
    }
    let failed = 0;
    for (const { name, plant, expect } of PLANTS) {
        let failures;
        try {
            failures = await checkTexts(plant(tree));
        } catch (err) {
            console.error(`${NAME} self-test: FAIL -- '${name}' could not be planted (${err.message})`);
            failed += 1;
            continue;
        }
        if (failures.some(f => f.includes(expect))) {
            console.log(`  red as required: ${name}`);
        } else {
            console.error(`${NAME} self-test: FAIL -- '${name}' did not go red naming '${expect}'; got: ${failures.join(' | ') || '(green)'}`);
            failed += 1;
        }
    }
    if (failed) return 1;
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift`);
    return 0;
}

async function main() {
    if (process.argv.includes('--self-test')) return selfTest();
    const failures = await checkTexts(readTree());
    if (failures.length) {
        console.error(`${NAME}: FAIL -- an agent-tab or page-menu wall is undone:`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${CLAUSES.length} clauses hold (${CLAUSES.map(c => c.name.replace(/Clause$/, '')).join(', ')})`);
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(await main());
}
