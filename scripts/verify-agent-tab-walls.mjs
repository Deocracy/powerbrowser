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
//  budget        [59-WR-03]  over the stub world: a child row's done result over AGENT_RESULT_MAX_BYTES (read from the
//                section) answers failed browser_error, measured in UTF-8 bytes; a small one stays done.
//  history       [chrome-actor-05]  an agent overlay gets disableglobalhistory before append; a user overlay never.
//  services      [agent-browser-06]  orcad's port pref and default equal what OrcaService.sys.mjs binds; the URL wall
//                refuses the sidecar and orcad ports on every loopback spelling and nothing else; browser.goto there
//                navigates nothing; the observer cancels an agent request, redirect and loopback response on them,
//                never a dev-server request or a user overlay's.
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
import { makeWorld, sliceSource } from './verify-orca-browser-tab-scope.mjs';

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
    orcaService: 'powerbrowser/shell/OrcaService.sys.mjs',
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

/** A fresh stub world over the shipped chrome source (verify-orca-browser-tab-scope's boundary), or throws. */
function worldOf(texts) {
    const sliced = sliceSource(texts.api);
    if (sliced.error) throw new Error(sliced.error);
    return makeWorld(sliced);
}

// The budget the shipped section declares; the plant-free measure is UTF-8 bytes of the result's JSON.
function budgetOf(texts) {
    const m = /const AGENT_RESULT_MAX_BYTES = (\d+) \* (\d+);/.exec(texts.api);
    return m ? Number(m[1]) * Number(m[2]) : null;
}

// 59-WR-03: every row's done result is held to the budget, measured in UTF-8 bytes, child rows and native rows alike.
async function budgetClause(texts) {
    const failures = [];
    const max = budgetOf(texts);
    if (!max) return ['budget: broken instrument: AGENT_RESULT_MAX_BYTES not found'];
    const run = async (label, method, params, reply, want) => {
        const w = worldOf(texts);
        w.addTab('a1', { agent: true });
        if (reply) w.childReplies.set(method, () => Promise.resolve(reply));
        const answer = await w.agent('a1', method, params);
        const got = answer?.where === 'done' ? 'done' : `${answer?.where} ${answer?.code ?? ''}`.trim();
        if (got !== want) failures.push(`budget: ${label} answered ${got}; expected ${want} (59-WR-03)`);
    };
    await run('a small browser.eval result', 'browser.eval', { expression: '1' }, { where: 'done', result: { value: 'x' } }, 'done');
    await run('a browser.eval result over the budget', 'browser.eval', { expression: '1' }, { where: 'done', result: { value: 'x'.repeat(max) } }, 'failed browser_error');
    // Under the budget in UTF-16 code units, over it in UTF-8 bytes: the measure must be bytes.
    await run('a browser.exec result over the budget in UTF-8 bytes only', 'browser.exec', { command: 'get html' }, { where: 'done', result: { value: '€'.repeat(Math.ceil(max / 2.5)) } }, 'failed browser_error');
    return failures;
}

// chrome-actor-05: an agent overlay is created with disableglobalhistory before append (Gecko reads it when the
// browsing context is made); a user overlay never is.
async function historyClause(texts) {
    const failures = [];
    const w = worldOf(texts);
    w.api.webTabOpen(w.theiaBrowser, w.frontend, 'n1', 'https://example.com/', undefined, undefined, null, true);
    w.api.webTabOpen(w.theiaBrowser, w.frontend, 'n3', 'https://example.com/', undefined, undefined, null, false);
    const attr = id => w.rec.attrs.filter(a => a.browser === w.webTabs.get(id)?.browser && a.name === 'disableglobalhistory');
    if (!w.webTabs.get('n1')?.agent) return ['history: broken instrument: the agent open made no agent entry'];
    if (!attr('n1').some(a => a.value === 'true' && a.appended === false)) {
        failures.push(`history: the agent overlay did not get disableglobalhistory "true" before appendChild (${JSON.stringify(attr('n1'))}), so an agent's visits and titles reach the user's history and suggestions (chrome-actor-05)`);
    }
    if (attr('n3').length) failures.push('history: a user overlay got disableglobalhistory, so the user\'s own visits would not be recorded');
    return failures;
}

// agent-browser-06: the orcad port pref and default are what OrcaService binds (derived from its source); the URL wall
// refuses both PowerBrowser service ports on every loopback spelling and nothing else; goto refuses before any
// navigation; the network observer cancels a request, a redirect and a response from a loopback address on those ports.
async function servicesClause(texts) {
    const failures = [];
    const orca = /getIntPref\("([\w.]+)", (\d+)\)/.exec(texts.orcaService);
    const ours = { pref: /const AGENT_ORCA_PORT_PREF = "([\w.]+)";/.exec(texts.api)?.[1], port: Number(/const AGENT_ORCA_PORT_DEFAULT = (\d+);/.exec(texts.api)?.[1]) };
    if (!orca) return ['services: broken instrument: OrcaService reads no port pref'];
    if (ours.pref !== orca[1] || ours.port !== Number(orca[2])) {
        failures.push(`services: the agent wall reads ${ours.pref}/${ours.port} but OrcaService binds ${orca[1]}/${orca[2]}, so orcad's port drifts out of the wall (agent-browser-06)`);
    }
    const sidecar = 4123;
    const orcad = Number(orca[2]);
    const out = evalDeclarations(texts.api, ['AGENT_ORCA_PORT_PREF', 'AGENT_ORCA_PORT_DEFAULT', 'agentOwnServicePorts', 'agentLoopbackHost', 'agentServiceRefused', 'agentUrlRefused'],
        { URL, groupSenderPort: sidecar, Services: { prefs: { getIntPref: (name, fallback) => fallback } } }, ['agentUrlRefused']);
    if (typeof out.agentUrlRefused !== 'function') return [...failures, 'services: broken instrument: agentUrlRefused not found in the agent section'];
    const refused = [`http://127.0.0.1:${sidecar}/`, `http://localhost:${orcad}/x`, `http://[::1]:${sidecar}/`, `http://0.0.0.0:${orcad}/`, `http://127.1.2.3:${orcad}/`,
        `http://pane.webview.localhost:${sidecar}/`, `http://[::ffff:127.0.0.1]:${orcad}/`, `http://LOCALHOST.:${orcad}/`];
    const allowed = ['http://127.0.0.1:3000/', `https://example.com:${orcad}/`, 'http://192.168.1.1/', 'https://example.com/'];
    for (const spec of refused) if (out.agentUrlRefused(spec) !== true) failures.push(`services: ${spec} is not refused to an agent page (agent-browser-06)`);
    for (const spec of allowed) if (out.agentUrlRefused(spec) !== false) failures.push(`services: ${spec} is refused to an agent page, though it is not a PowerBrowser service`);

    const w = worldOf(texts);
    w.addTab('a1', { agent: true });
    const before = w.rec.nav.length;
    const reply = await w.agent('a1', 'browser.goto', { url: `http://127.0.0.1:${orcad}/` });
    if (reply?.where !== 'failed' || w.rec.nav.length !== before) {
        failures.push(`services: browser.goto to orcad's port answered ${JSON.stringify(reply)} after ${w.rec.nav.length - before} navigation(s); expected failed and none (agent-browser-06)`);
    }
    w.api.webTabOpen(w.theiaBrowser, w.frontend, 'n1', 'https://example.com/', undefined, undefined, null, true);
    w.api.webTabOpen(w.theiaBrowser, w.frontend, 'u1', 'https://example.com/', undefined, undefined, null, false);
    const channel = (browser, spec, extra = {}) => ({
        URI: { spec }, isDocument: true, status: 0, requestMethod: 'GET', cancelled: null, ...extra,
        loadInfo: { browsingContext: { top: { embedderElement: browser } } },
        cancel(status) { this.cancelled = status ?? 'cancelled'; },
        QueryInterface() { return this; },
    });
    const fire = (ch, topic) => w.rec.observers.filter(o => o.topic === topic).forEach(o => o.observer.observe(ch, topic));
    if (!w.rec.observers.some(o => o.topic === 'http-on-modify-request')) return [...failures, 'services: broken instrument: no http-on-modify-request observer registered'];
    const agentBrowser = w.webTabs.get('n1').browser;
    const userBrowser = w.webTabs.get('u1').browser;
    const toOrcad = channel(agentBrowser, `http://127.0.0.1:${orcad}/`);
    fire(toOrcad, 'http-on-modify-request');
    if (toOrcad.cancelled === null) failures.push('services: an agent overlay\'s request (or redirect) to orcad\'s port was not cancelled by the network observer (agent-browser-06)');
    const rebound = channel(agentBrowser, 'http://rebind.example/', { remoteAddress: '127.0.0.1', remotePort: orcad });
    fire(rebound, 'http-on-modify-request');
    fire(rebound, 'http-on-examine-response');
    if (rebound.cancelled === null) failures.push('services: an agent overlay\'s response from 127.0.0.1 on orcad\'s port, under a name resolving there, was not cancelled (agent-browser-06)');
    const devServer = channel(agentBrowser, 'http://127.0.0.1:3000/', { remoteAddress: '127.0.0.1', remotePort: 3000 });
    fire(devServer, 'http-on-modify-request');
    fire(devServer, 'http-on-examine-response');
    const userToOrcad = channel(userBrowser, `http://127.0.0.1:${orcad}/`);
    fire(userToOrcad, 'http-on-modify-request');
    if (devServer.cancelled !== null || userToOrcad.cancelled !== null) failures.push('services: the observer cancelled a request to a local development server or a user overlay\'s request');
    return failures;
}

const CLAUSES = [scrollClause, editStateClause, budgetClause, historyClause, servicesClause];

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
    {
        name: '59-WR-03: handleWebTabAgent replies with any done result unmeasured',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'if (outcome.where === "done" && !agentResultFits(outcome.result)) {', 'if (false) {', 'budget measure') }),
        expect: 'over the budget answered done',
    },
    {
        name: '59-WR-03: the budget measured in UTF-16 code units',
        plant: t => ({ ...t, api: replaceOnce(t.api, '    if (code < 0x80) {\n      bytes += 1;', '    if (code < 0x10000) {\n      bytes += 1;', 'budget bytes') }),
        expect: 'in UTF-8 bytes only answered done',
    },
    {
        name: 'chrome-actor-05: agent overlays record global history',
        plant: t => ({ ...t, api: replaceOnce(t.api, ', "disableglobalhistory": "true" }', ' }', 'agent attributes') }),
        expect: 'did not get disableglobalhistory',
    },
    {
        name: 'agent-browser-06: browser.goto loads any loopback port',
        plant: t => ({ ...t, api: replaceOnce(t.api, '(agentUrlRefused(agentUrl(params.url)) ? agentFailed("browser_navigation_failed") :', '(false ? null :', 'goto wall') }),
        expect: 'browser.goto to orcad\'s port answered',
    },
    {
        name: 'agent-browser-06: the observer lets agent requests to PowerBrowser services through',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'if (agentChannelRefused(channel, topic)) {', 'if (false) {', 'observer wall') }),
        expect: 'was not cancelled by the network observer',
    },
    {
        name: 'agent-browser-06: the response address is not checked',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'return agentServiceRefused(internal.remoteAddress, internal.remotePort);', 'return false && internal;', 'remote address') }),
        expect: 'under a name resolving there',
    },
    {
        name: 'agent-browser-06: the sidecar port is left out of the wall',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'ports.push(groupSenderPort);', 'void groupSenderPort;', 'sidecar port') }),
        expect: 'http://127.0.0.1:4123/ is not refused',
    },
    {
        name: 'agent-browser-06: IPv4-mapped loopback is not recognised',
        plant: t => ({ ...t, api: replaceOnce(t.api, '(mapped !== null && (', '(false && (', 'mapped loopback') }),
        expect: '[::ffff:127.0.0.1]',
    },
    {
        name: 'agent-browser-06: orcad\'s port pref drifts from OrcaService',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'const AGENT_ORCA_PORT_DEFAULT = 26768;', 'const AGENT_ORCA_PORT_DEFAULT = 26769;', 'orcad default') }),
        expect: 'drifts out of the wall',
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
