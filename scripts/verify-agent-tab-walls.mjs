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
//  services      [agent-browser-06]  orcad's port pref and default equal what OrcaService.sys.mjs binds; the loopback
//                recogniser classifies raw spellings (numeric, octal and hex IPv4, mapped and compatible IPv6 in hex
//                and dotted form, unspecified addresses, zones, brackets, a trailing dot, *.localhost); browser.goto
//                there navigates nothing; the observer cancels before send (a spelled host at once, a name after its
//                suspended lookup, cancel before resume), judges agent-container worker loads by origin attributes,
//                keeps the response address as a second line, and never touches a dev server, a user overlay or a
//                user-container worker.
//  cookies       [agent-browser-03, chrome-actor-04]  over a two-site jar, an agent tab on one site reads that site's
//                cookies only, never an httpOnly value and never the whole container; another site's or a public
//                suffix's get, set and delete are refused with no cookie-service call; its own site's set works.
//  agentFlag     [agent-browser-02 = chrome-actor-02 = 66-CR-01]  an agent tab closed and opened again under its id
//                or row key without the flag is an agent overlay (container and group before append); a fresh user
//                tab is not; every webTabOpen request in web-tab.ts spreads this.agentFlag(), which is { agent: true }
//                for every agent widget.
//  stop          [agent-browser-04, 66-WR-06]  Stop on one agent tab stops every agent tab of that frontend, refuses
//                its new agent tabs, reopens a remembered one stopped, spares another frontend, and Resume undoes it;
//                the transpiled dispatcher refuses createPage while stopped and maps a DispatchFailure and an agent-wall
//                navigate refusal to their codes; the host sends navigate as browser.goto through webTabAgent and
//                awaits the first open's reply; the chrome-bar mark shows on every agent tab and offers Resume.
//  sideHeader    [59-WR-05]  the top-tabs side header builds its scrollbar on X and its icons do not shrink.
//  orcaStatus    [67-WR-04, from lane G3b]  orcaStatus accepts the literal { clientReason: null }, calls
//                OrcaService.clientRecovered when present and never throws without it; any other unknown value,
//                and null beside browserHost, is still a validation refusal.
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
import { ev, fakeDeps, loadModules, loadTypescript } from './verify-orca-browser-abilities.mjs';

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
    webTab: 'theia/extensions/tab-uris/src/browser/web-tab.ts',
    chromeBar: 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx',
    dispatch: 'theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts',
    abilities: 'theia/extensions/orca-browser/src/common/orca-browser-abilities.ts',
    frontendModule: 'theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts',
    sideTopTabs: 'theia/extensions/chrome-bar/src/browser/side-panel-top-tabs.ts',
    sideTopTabsCss: 'theia/extensions/chrome-bar/src/browser/side-panel-top-tabs.css',
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
    const webTabs = new Map();
    const agentGroup = /const AGENT_MESSAGE_MANAGER_GROUP = "([^"]+)";/.exec(texts.api)?.[1];
    const browserIn = group => {
        const actorFor = name => {
            calls.push({ group, name });
            if (name === 'PowerBrowserEditState' && !registered.flatMap(r => r.groups).includes(group)) {
                throw Object.assign(new Error('NotSupportedError'), { name: 'NotSupportedError' });
            }
            return { sendAsyncMessage() {}, sendQuery: () => Promise.resolve({}), doCommand() {} };
        };
        // webTabOpen gives the agent group to agent overlays alone, so the entry's agent flag is the group.
        const browser = { getAttribute: n => (n === 'messagemanagergroup' ? group : null), browsingContext: { currentWindowGlobal: { getActor: actorFor } } };
        webTabs.set(`t${webTabs.size}`, { browser, agent: group === agentGroup });
        return browser;
    };
    const out = evalDeclarations(texts.api,
        ['EDIT_STATE_ACTOR_NAME', 'EDIT_STATE_GROUPS', 'AGENT_MESSAGE_MANAGER_GROUP', 'tabIdOfBrowser', 'editStateReaches', 'registerEditStateActor', 'pageMenuEdit', 'pageEditTargetCommands', 'EDIT_STATE_BUDGET_MS'],
        {
            GROUP_ACTOR_PARENT_MODULE: 'p', GROUP_ACTOR_CHILD_MODULE: 'c', WEB_TAB_EDIT_CMDS: ['cmd_undo'],
            ChromeUtils: { registerWindowActor: (name, options) => { if (name === 'PowerBrowserEditState') registered.push({ groups: options.messageManagerGroups ?? [] }); } },
            webTabEditContext: browser => browser.browsingContext, webTabs,
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

const realTick = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A global of a stub world's vm context, read through that context's own Function constructor. */
function contextGlobal(w, name) {
    return w.AGENT_NATIVE_ROWS['browser.goto'].constructor(`return ${name};`)();
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
    const run = async (label, method, params, reply, want, url = 'https://example.com/') => {
        const w = worldOf(texts);
        w.addTab('a1', { agent: true }).browser.currentURI = { spec: url, host: 'example.com' };
        if (reply) w.childReplies.set(method, () => Promise.resolve(reply));
        const answer = await w.agent('a1', method, params);
        const got = answer?.where === 'done' ? 'done' : `${answer?.where} ${answer?.code ?? ''}`.trim();
        if (got !== want) failures.push(`budget: ${label} answered ${got}; expected ${want} (59-WR-03)`);
    };
    await run('a small browser.eval result', 'browser.eval', { expression: '1' }, { where: 'done', result: { value: 'x' } }, 'done');
    await run('a browser.eval result over the budget', 'browser.eval', { expression: '1' }, { where: 'done', result: { value: 'x'.repeat(max) } }, 'failed browser_error');
    // Under the budget in UTF-16 code units, over it in UTF-8 bytes: the measure must be bytes.
    // The dispatcher adds browserPageId, url and title to a snapshot after chrome measured it: room is kept for them.
    await run('a browser.eval result 2000 bytes under the budget', 'browser.eval', { expression: '1' }, { where: 'done', result: { value: 'x'.repeat(max - 2000) } }, 'done');
    await run('a browser.snapshot result 2000 bytes under the budget', 'browser.snapshot', {}, { where: 'done', result: { snapshot: 'x'.repeat(max - 2000) } }, 'failed browser_error');
    await run('a small browser.snapshot result', 'browser.snapshot', {}, { where: 'done', result: { snapshot: 'x'.repeat(1000) } }, 'done');
    await run('a small browser.snapshot result on a page whose url is longer than the budget allows', 'browser.snapshot', {}, { where: 'done', result: { snapshot: 'x' } }, 'failed browser_error', `https://example.com/?q=${'a'.repeat(Math.ceil(max / 3))}`);
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

// agent-browser-06: the orcad port pref and default are what OrcaService binds (derived from its source); the loopback
// recogniser classifies every spelling a URL parser, a resolver or a socket address can give; browser.goto refuses
// before any navigation; the network observer refuses before anything is sent: a spelled loopback host at once, a
// name on a service port after its pre-send lookup (suspended, cancelled before resume), a worker load in the agent
// container by its origin attributes, and a loopback response address as a second line.
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
    const out = evalDeclarations(texts.api,
        ['AGENT_ORCA_PORT_PREF', 'AGENT_ORCA_PORT_DEFAULT', 'agentOwnServicePorts', 'agentParseV4', 'agentParseV6', 'agentParseAddress', 'agentLoopbackV4', 'agentLoopbackHost', 'agentServiceRefused', 'agentUrlParts', 'agentUrlRefused'],
        { URL, groupSenderPort: sidecar, Services: { prefs: { getIntPref: (name, fallback) => fallback } } }, ['agentUrlRefused', 'agentLoopbackHost']);
    if (typeof out.agentUrlRefused !== 'function' || typeof out.agentLoopbackHost !== 'function') return [...failures, 'services: broken instrument: agentUrlRefused or agentLoopbackHost not found in the agent section'];
    // Raw spellings, as a socket address, a DNS record or an un-normalised URI host can carry them.
    const loopback = ['127.0.0.1', '127.1', '0177.0.0.1', '0x7f000001', '0x7f.1', '2130706433', '0.0.0.0', '0', '::1', '[::1]', '::1%lo', '0:0:0:0:0:0:0:1', '::',
        '::ffff:127.0.0.1', '::ffff:7f00:1', '[::ffff:7f00:1]', '::ffff:0.0.0.0', '::ffff:0:0', '::127.0.0.1', 'localhost', 'localhost.', 'LOCALHOST', 'a.b.localhost', 'pane.webview.localhost.'];
    const notLoopback = ['10.0.0.1', '192.168.1.1', '128.0.0.1', '::ffff:192.168.1.1', 'fe80::1%lo', '2001:db8::1', 'example.com', 'localhost.example.com', '127.example', ''];
    for (const host of loopback) if (out.agentLoopbackHost(host) !== true) failures.push(`services: the loopback recogniser misses ${JSON.stringify(host)} (agent-browser-06)`);
    for (const host of notLoopback) if (out.agentLoopbackHost(host) !== false) failures.push(`services: the loopback recogniser calls ${JSON.stringify(host)} loopback`);
    const refused = [`http://127.0.0.1:${sidecar}/`, `http://localhost:${orcad}/x`, `http://[::1]:${sidecar}/`, `http://0.0.0.0:${orcad}/`, `http://[::ffff:0:0]:${orcad}/`, `http://[::]:${orcad}/`, `http://pane.webview.localhost:${sidecar}/`, `http://LOCALHOST.:${orcad}/`];
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
    const container = Number(w.webTabs.get('n1')?.agentUserContextId);
    // A stub resolver: each name resolves to the addresses given; the listener is called on a later tick.
    const dnsAnswers = new Map([['rebind.example', ['93.184.216.34', '127.0.0.1']], ['public.example', ['93.184.216.34']]]);
    const services = contextGlobal(w, 'Services');
    services.tm = { mainThread: {} };
    services.dns = {
        asyncResolve(host, type, flags, info, listener) {
            const addresses = [...(dnsAnswers.get(host) ?? [])];
            setTimeout(() => listener.onLookupComplete(null, { QueryInterface() { return this; }, hasMore: () => addresses.length > 0, getNextAddrAsString: () => addresses.shift() }, 0), 0);
        },
    };
    contextGlobal(w, 'Components').isSuccessCode = status => status === 0;
    const channel = (browser, spec, extra = {}) => ({
        URI: { spec }, isDocument: true, status: 0, requestMethod: 'GET', cancelled: null, suspended: 0, resumed: 0, events: [], ...extra,
        loadInfo: { browsingContext: browser ? { top: { embedderElement: browser } } : null, originAttributes: { userContextId: browser === null ? (extra.userContextId ?? 0) : 0 } },
        cancel(status) { this.cancelled = status ?? 'cancelled'; this.events.push('cancel'); },
        suspend() { this.suspended += 1; this.events.push('suspend'); },
        resume() { this.resumed += 1; this.events.push('resume'); },
        QueryInterface() { return this; },
    });
    const fire = (ch, topic) => w.rec.observers.filter(o => o.topic === topic).forEach(o => o.observer.observe(ch, topic));
    if (!w.rec.observers.some(o => o.topic === 'http-on-modify-request')) return [...failures, 'services: broken instrument: no http-on-modify-request observer registered'];
    const agentBrowser = w.webTabs.get('n1').browser;
    const userBrowser = w.webTabs.get('u1').browser;
    const toOrcad = channel(agentBrowser, `http://127.0.0.1:${orcad}/`);
    fire(toOrcad, 'http-on-modify-request');
    if (toOrcad.cancelled === null) failures.push('services: an agent overlay\'s request (or redirect) to orcad\'s port was not cancelled before it was sent (agent-browser-06)');
    // A name on a service port resolving to loopback: cancelled before the suspended request is resumed.
    const rebound = channel(agentBrowser, `http://rebind.example:${orcad}/`);
    fire(rebound, 'http-on-modify-request');
    await realTick(5);
    const cancelAt = rebound.events.indexOf('cancel');
    if (rebound.suspended !== 1 || cancelAt === -1 || cancelAt > rebound.events.indexOf('resume')) {
        failures.push(`services: a name on orcad's port resolving to loopback was sent (events ${rebound.events.join(', ') || 'none'}); expected suspend, cancel, resume before anything is written (agent-browser-06)`);
    }
    const publicName = channel(agentBrowser, `http://public.example:${orcad}/`);
    fire(publicName, 'http-on-modify-request');
    await realTick(5);
    if (publicName.cancelled !== null || publicName.resumed !== publicName.suspended) failures.push(`services: a name resolving to a public address on orcad's port was cancelled or left suspended (events ${publicName.events.join(', ')})`);
    // Second line: a response that came from loopback on a service port.
    const late = channel(agentBrowser, `http://public.example:${orcad}/`, { remoteAddress: '::ffff:127.0.0.1', remotePort: orcad });
    fire(late, 'http-on-examine-response');
    if (late.cancelled === null) failures.push('services: an agent response from a loopback address on orcad\'s port was not cancelled (the response-time second line)');
    // A worker of an agent page has no embedder; its load is judged by the agent container in its origin attributes.
    const worker = channel(null, `http://127.0.0.1:${orcad}/`, { userContextId: container });
    fire(worker, 'http-on-modify-request');
    if (!Number.isInteger(container) || container <= 0) failures.push('services: broken instrument: the agent overlay recorded no container id');
    else if (worker.cancelled === null) failures.push('services: a worker load in the agent container to orcad\'s port was not cancelled (no embedder; agent-browser-06)');
    const userWorker = channel(null, `http://127.0.0.1:${orcad}/`, { userContextId: 0 });
    fire(userWorker, 'http-on-modify-request');
    const devServer = channel(agentBrowser, 'http://127.0.0.1:3000/', { remoteAddress: '127.0.0.1', remotePort: 3000 });
    fire(devServer, 'http-on-modify-request');
    fire(devServer, 'http-on-examine-response');
    const userToOrcad = channel(userBrowser, `http://127.0.0.1:${orcad}/`);
    fire(userToOrcad, 'http-on-modify-request');
    if (devServer.cancelled !== null || userToOrcad.cancelled !== null || userWorker.cancelled !== null || devServer.suspended) {
        failures.push('services: the observer cancelled or suspended a request to a local development server, a user overlay\'s request or a user-container worker\'s');
    }
    return failures;
}

// agent-browser-03 / chrome-actor-04: over the stub world with a cookie jar holding two sites' cookies (one httpOnly
// each), an agent tab on one site: cookie.get with no url and with that site's url returns that site's cookies only and
// no httpOnly value; a url, set domain or delete domain on the other site is refused with no cookie-service call; the
// whole-container read is never made. The stub's own cookie service is replaced, so the jar is this clause's.
async function cookiesClause(texts) {
    const failures = [];
    const w = worldOf(texts);
    const entry = w.addTab('a1', { agent: true });
    entry.browser.currentURI = { host: 'app.example.com', spec: 'https://app.example.com/' };
    const jar = [
        { host: '.example.com', name: 'sid', value: 'SECRET-EXAMPLE', path: '/', isHttpOnly: true, isSession: true, sameSite: 1 },
        { host: 'app.example.com', name: 'theme', value: 'dark', path: '/', isHttpOnly: false, isSession: true, sameSite: 1 },
        { host: '.other.test', name: 'sid', value: 'SECRET-OTHER', path: '/', isHttpOnly: true, isSession: true, sameSite: 1 },
    ];
    const calls = [];
    const site = h => h.replace(/^\./, '').split('.').slice(-2).join('.');
    // The world's Services object is its vm context's global; the context's own Function constructor reaches it.
    const services = contextGlobal(w, 'Services');
    services.cookies = {
        getCookiesFromHost: (host) => { calls.push(`getCookiesFromHost ${host}`); return jar.filter(c => site(c.host) === site(host)); },
        getCookiesWithOriginAttributes: () => { calls.push('getCookiesWithOriginAttributes'); return jar; },
        add: (host) => { calls.push(`add ${host.replace(/^\./, '')}`); return { result: 0 }; },
    };
    // Gecko's eTLD service throws for an IP address and for a host with too few labels.
    services.eTLD = { getBaseDomainFromHost: h => { if (/^[\d.]+$/.test(h) || !h.includes('.')) throw new Error('NS_ERROR_HOST_IS_IP_ADDRESS'); return site(h); } };
    const valuesOf = reply => (reply?.result?.cookies ?? []).map(c => `${c.domain}:${c.name}=${c.value}`);
    for (const [label, params] of [['cookie.get with no url', {}], ['cookie.get for the current site', { url: 'https://example.com/' }]]) {
        const reply = await w.agent('a1', 'browser.cookie.get', params);
        const got = valuesOf(reply);
        if (reply?.where !== 'done') { failures.push(`cookies: ${label} answered ${JSON.stringify(reply)}; expected done`); continue; }
        if (got.some(v => v.includes('other.test'))) failures.push(`cookies: ${label} returned another site's cookies (${got.join(', ')}) (agent-browser-03)`);
        if (got.some(v => v.includes('SECRET'))) failures.push(`cookies: ${label} returned an httpOnly cookie's value (${got.join(', ')}) (agent-browser-03)`);
        if (!got.some(v => v.includes('theme=dark'))) failures.push(`cookies: broken instrument: ${label} did not return the site's own cookie (${got.join(', ')})`);
    }
    if (calls.includes('getCookiesWithOriginAttributes')) failures.push('cookies: cookie.get read the whole agent container (getCookiesWithOriginAttributes), every site of every agent (chrome-actor-04)');
    for (const [label, method, params] of [
        ['cookie.get for another site', 'browser.cookie.get', { url: 'https://other.test/' }],
        ['cookie.set on another site', 'browser.cookie.set', { name: 'sid', value: 'x', domain: '.other.test' }],
        ['cookie.set on a public suffix', 'browser.cookie.set', { name: 'sid', value: 'x', domain: 'com' }],
        ['cookie.delete on another site', 'browser.cookie.delete', { name: 'sid', domain: 'other.test' }],
    ]) {
        calls.length = 0;
        const reply = await w.agent('a1', method, params);
        if (reply?.where === 'done' || calls.length) failures.push(`cookies: ${label} answered ${JSON.stringify(reply?.where)} after cookie calls [${calls.join(', ')}]; expected a refusal with none (agent-browser-03)`);
    }
    // The httpOnly wall: the agent picks the current site with browser.goto, so the site scope alone is no wall.
    for (const [label, method, params] of [
        ['cookie.set with httpOnly true', 'browser.cookie.set', { name: 'fresh', value: 'x', domain: 'app.example.com', httpOnly: true }],
        ['cookie.set over a name the site holds as httpOnly', 'browser.cookie.set', { name: 'sid', value: 'attacker', domain: 'app.example.com', path: '/app' }],
        ['cookie.delete of an httpOnly cookie', 'browser.cookie.delete', { name: 'sid', domain: 'example.com' }],
    ]) {
        calls.length = 0;
        const reply = await w.agent('a1', method, params);
        if (reply?.where === 'done' || calls.some(c => c.startsWith('add '))) failures.push(`cookies: ${label} answered ${JSON.stringify(reply?.where)} after cookie calls [${calls.join(', ')}]; page script cannot touch an httpOnly cookie, so an agent may not swap or end one (agent-browser-03)`);
    }
    calls.length = 0;
    const plain = await w.agent('a1', 'browser.cookie.delete', { name: 'theme', domain: 'app.example.com' });
    if (plain?.where !== 'done' || !calls.includes('add app.example.com')) failures.push(`cookies: cookie.delete of a plain cookie on the current site answered ${JSON.stringify(plain)}; expected done (positive control)`);
    calls.length = 0;
    const own = await w.agent('a1', 'browser.cookie.set', { name: 'theme', value: 'light', domain: 'app.example.com' });
    if (own?.where !== 'done' || !calls.includes('add app.example.com')) failures.push(`cookies: cookie.set on the current site answered ${JSON.stringify(own)}; expected done (positive control)`);
    return failures;
}

/** The object literal of every `request({ kind: '<kind>', ... })` call in code. */
function requestLiterals(code, kind) {
    const out = [];
    const re = new RegExp(`request\\(\\{ kind: '${kind}'`, 'g');
    for (let m = re.exec(code); m; m = re.exec(code)) {
        let depth = 0;
        let i = m.index + 'request('.length;
        const start = i;
        for (; i < code.length; i += 1) {
            if (code[i] === '{') depth += 1;
            if (code[i] === '}') { depth -= 1; if (depth === 0) break; }
        }
        out.push(code.slice(start, i + 1));
    }
    return out;
}

// agent-browser-02 / 66-CR-01: agent status is chrome's, per tab id and row key. Over the stub world: an agent tab
// closed and opened again under its id without the flag (the crash recreate, the lost-view reopen) is an agent overlay
// in the agent container and group before append; so is a new id opened under the agent tab's row key; a fresh user
// tab is not. In the frontend, every webTabOpen request of web-tab.ts carries the widget's agent flag.
async function agentFlagClause(texts) {
    const failures = [];
    const w = worldOf(texts);
    if (w.api.webTabOpen(w.theiaBrowser, w.frontend, 'a1', 'https://example.com/', undefined, undefined, null, true) !== 'opened') {
        return ['agentFlag: broken instrument: the first agent open did not open'];
    }
    w.api.webTabClose('a1');
    if (w.webTabs.has('a1')) return ['agentFlag: broken instrument: webTabClose left the entry'];
    const before = w.rec.attrs.length;
    w.api.webTabOpen(w.theiaBrowser, w.frontend, 'a1', 'https://example.com/', 'web:a1', undefined, null, false);
    const reopened = w.webTabs.get('a1');
    const attrs = w.rec.attrs.slice(before).filter(a => a.browser === reopened?.browser && !a.appended);
    const value = name => attrs.filter(a => a.name === name).at(-1)?.value;
    if (reopened?.agent !== true || !Number(value('usercontextid')) || value('messagemanagergroup') !== w.AGENT_MESSAGE_MANAGER_GROUP) {
        failures.push(`agentFlag: an agent tab re-opened under its id without the flag became agent ${JSON.stringify(reopened?.agent)}, container ${JSON.stringify(value('usercontextid'))}, group ${JSON.stringify(value('messagemanagergroup'))}; it reopened as a user tab in the user's container (agent-browser-02)`);
    }
    w.api.webTabOpen(w.theiaBrowser, w.frontend, 'k1', 'https://example.com/', 'web:a1', undefined, null, false);
    if (w.webTabs.get('k1')?.agent !== true) failures.push('agentFlag: a tab opened under an agent tab\'s row key (its kept history) was not an agent tab (agent-browser-02)');
    w.api.webTabOpen(w.theiaBrowser, w.frontend, 'u9', 'https://example.com/', undefined, undefined, null, false);
    if (w.webTabs.get('u9')?.agent === true) failures.push('agentFlag: a fresh user tab was made an agent tab');

    const literals = requestLiterals(stripComments(texts.webTab), 'webTabOpen');
    if (!literals.length) return [...failures, `agentFlag: broken instrument: no webTabOpen request in ${FILES.webTab}`];
    for (const literal of literals) {
        if (!/\.\.\.this\.agentFlag\(\)/.test(literal)) failures.push(`agentFlag: ${FILES.webTab} sends ${literal.replace(/\s+/g, ' ').slice(0, 140)} without the widget's agent flag (66-CR-01)`);
    }
    if (!/protected agentFlag\(\): \{ agent\?: true \} \{\s*return this\.agent \? \{ agent: true as const \} : \{\};/.test(stripComments(texts.webTab))) {
        failures.push(`agentFlag: ${FILES.webTab}'s agentFlag() does not return { agent: true } for every agent widget (66-CR-01)`);
    }
    return failures;
}

/** The text of a method or function body named `name` in `code` (from its signature to the matching brace). */
function bodyOf(code, signature) {
    const at = code.indexOf(signature);
    if (at === -1) return null;
    let depth = 0;
    for (let i = code.indexOf('{', at + signature.length - 1); i < code.length; i += 1) {
        if (code[i] === '{') depth += 1;
        if (code[i] === '}') { depth -= 1; if (depth === 0) return code.slice(at, i + 1); }
    }
    return null;
}

// agent-browser-04 (and 66-WR-06): Stop is the frontend's. Over the stub world: Stop on one agent tab stops the
// frontend's other agent tabs, refuses its new agent tabs (agent-stopped, no overlay), lets a remembered agent tab
// reopen stopped, and leaves another frontend's agent tab working; Resume undoes all of it. The transpiled dispatcher
// answers createPage browser_owner_unavailable while agents are stopped or when the open dep says so, and maps a
// navigate refused by chrome's agent wall to its code. In the sources: the host sends navigate as browser.goto through
// webTabAgent and awaits the first open's reply; the chrome-bar mark is shown for every agent tab.
async function stopClause(texts) {
    const failures = [];
    const w = worldOf(texts);
    w.addTab('a1', { agent: true });
    w.addTab('a2', { agent: true });
    w.addTab('f1', { agent: true, owner: w.otherFrontend });
    if (w.api.webTabOpen(w.theiaBrowser, w.frontend, 'r1', 'https://example.com/', undefined, undefined, null, true) !== 'opened') return ['stop: broken instrument: the agent open did not open'];
    w.api.webTabClose('r1');
    const stopped = await w.stop('a1');
    if (stopped?.where !== 'stopped') return [`stop: broken instrument: Stop answered ${JSON.stringify(stopped)}`];
    const other = await w.agent('a2', 'browser.click', { element: '#e' });
    if (other?.where !== 'agent-stopped') failures.push(`stop: after Stop on one agent tab, another agent tab of the same frontend answered ${JSON.stringify(other?.where)}; expected agent-stopped (agent-browser-04)`);
    const fresh = w.api.webTabOpen(w.theiaBrowser, w.frontend, 'n1', 'about:blank', undefined, undefined, null, true);
    if (fresh !== 'agent-stopped' || w.webTabs.has('n1')) failures.push(`stop: a new agent tab after Stop answered ${fresh} (entry ${w.webTabs.has('n1')}); expected agent-stopped and no overlay, so an agent cannot carry on in a new background tab (agent-browser-04)`);
    const reopen = w.api.webTabOpen(w.theiaBrowser, w.frontend, 'r1', 'https://example.com/', undefined, undefined, null, true);
    const reopenCall = await w.agent('r1', 'browser.click', { element: '#e' });
    if (reopen !== 'opened' || reopenCall?.where !== 'agent-stopped') failures.push(`stop: a stopped frontend's crashed agent tab reopened ${reopen} and answered ${JSON.stringify(reopenCall?.where)}; expected opened and agent-stopped`);
    const foreign = await w.agent('f1', 'browser.click', { element: '#e' }, w.otherFrontend);
    if (foreign?.where !== 'done') failures.push(`stop: Stop in one frontend stopped another frontend's agent tab (${JSON.stringify(foreign?.where)})`);
    const lastPush = w.rec.pushes.filter(p => p.kind === 'agentControlChanged' && p.tabId === 'a2').at(-1);
    if (lastPush?.stopped !== true) failures.push(`stop: the other agent tab's mark was not told it is stopped (${JSON.stringify(lastPush)})`);
    const resumed = await w.actionArms({ kind: 'webTabAgentStop', tabId: 'a2', resume: true }, w.frontend);
    const after = await w.agent('a1', 'browser.click', { element: '#e' });
    const afterOpen = w.api.webTabOpen(w.theiaBrowser, w.frontend, 'n2', 'about:blank', undefined, undefined, null, true);
    if (resumed?.where !== 'resumed' || after?.where !== 'done' || afterOpen !== 'opened') failures.push(`stop: Resume answered ${JSON.stringify(resumed?.where)}, then a call ${JSON.stringify(after?.where)} and a new agent tab ${afterOpen}; expected resumed, done, opened`);

    // The dispatcher.
    const ts = loadTypescript(REPO_ROOT);
    if (!ts) return [...failures, 'stop: broken instrument: typescript is not installed in theia/'];
    const { dispatch } = loadModules(ts, { abilities: texts.abilities, dispatch: texts.dispatch });
    const base = fakeDeps(dispatch);
    const stoppedDeps = { ...base.deps, agentsStopped: () => true };
    let out = await dispatch.dispatchCommand(ev('p1', 'createPage'), stoppedDeps);
    if (out.status !== 'failed' || out.errorCode !== 'browser_owner_unavailable' || base.log.opened.length) failures.push(`stop: createPage while agents are stopped answered ${JSON.stringify(out)} after ${base.log.opened.length} open(s); expected browser_owner_unavailable and none (agent-browser-04)`);
    if (typeof dispatch.DispatchFailure !== 'function') {
        failures.push('stop: the dispatcher exports no DispatchFailure, so a refused open answers browser_error only (66-WR-06)');
    } else {
        const refusing = { ...fakeDeps(dispatch).deps, openAgentTab: async () => { throw new dispatch.DispatchFailure('browser_owner_unavailable'); } };
        out = await dispatch.dispatchCommand(ev('p2', 'createPage'), refusing);
        if (out.errorCode !== 'browser_owner_unavailable' || refusing.table.tabOf('p2') !== undefined) failures.push(`stop: createPage whose open chrome refused answered ${JSON.stringify(out)}; expected browser_owner_unavailable and no binding (66-WR-06)`);
    }
    for (const [where, code] of [['agent-stopped', 'browser_owner_unavailable'], ['not-agent-tab', 'browser_tab_not_found']]) {
        const { deps } = fakeDeps(dispatch);
        deps.navigate = async () => ({ ok: true, kind: 'webTabAgent', where });
        await dispatch.dispatchCommand(ev('p3', 'createPage'), deps);
        out = await dispatch.dispatchCommand(ev('p3', 'navigate', { url: 'https://example.com/' }), deps);
        if (out.status !== 'failed' || out.errorCode !== code) failures.push(`stop: a navigate chrome's agent wall answered ${where} came back ${JSON.stringify(out)}; expected ${code} (agent-browser-04)`);
    }

    // The host and the mark, in their sources.
    const host = stripComments(texts.frontendModule);
    const navigateDep = /navigate: \(tabId, url\) => ([^\n]*)/.exec(host)?.[1] ?? '';
    if (!/kind: 'webTabAgent'/.test(navigateDep) || !/'browser\.goto'/.test(navigateDep) || /\.navigate\(/.test(navigateDep)) {
        failures.push(`stop: the host's navigate dep (${navigateDep.slice(0, 120) || 'missing'}) does not go through chrome's agent wall as browser.goto (agent-browser-04, 66-CR-01)`);
    }
    const openDep = bodyOf(host, 'openAgentTab: async () =>') ?? '';
    if (!/await widget\.opened/.test(openDep) || !/throw new DispatchFailure\(/.test(openDep)) {
        failures.push('stop: the host\'s openAgentTab dep does not await the first open\'s reply and fail createPage when chrome made no overlay (66-WR-06)');
    }
    if (!/readonly opened: Promise<WebTabReply>/.test(texts.webTab) || !/this\.resolveOpened\?\.\(reply\)/.test(stripComments(texts.webTab))) {
        failures.push(`stop: ${FILES.webTab} does not expose the first open's reply as opened (66-WR-06)`);
    }
    const mark = bodyOf(stripComments(texts.chromeBar), 'protected renderAgentControl(): React.ReactNode {') ?? '';
    const guard = /if \(([^)]*)\) \{\s*return undefined;/.exec(mark)?.[1] ?? '';
    if (!/\.agent\b/.test(guard) || /agentControl\.active/.test(guard)) {
        failures.push(`stop: the chrome-bar mark is shown on "${guard}", not on every agent tab, so the user cannot stop an agent before it acts (agent-browser-04)`);
    }
    if (!/agentStop\(stopped\)/.test(mark)) failures.push('stop: the chrome-bar mark has no Resume on a stopped agent tab');
    return failures;
}

// 59-WR-05: the side header row scrolls on X when its icons do not fit: createSideBar builds the bar's scrollbar with
// suppressScrollX false (stock suppresses it for a vertical rail), and the icons keep their width.
function sideHeaderClause(texts) {
    const failures = [];
    const body = bodyOf(stripComments(texts.sideTopTabs), 'protected override createSideBar(): SideTabBar {');
    if (!body) return ['sideHeader: broken instrument: createSideBar not found'];
    if (!/scrollbarOptions:[^\n]*suppressScrollX: false/.test(body)) {
        failures.push(`sideHeader: ${FILES.sideTopTabs} keeps the stock suppressScrollX, so a side header narrower than its icons clips the trailing views with no way to reach them (59-WR-05)`);
    }
    if (!/\.pb-side-header \.lm-TabBar\.theia-app-sides \.lm-TabBar-tab \{[^}]*flex-shrink: 0;/.test(texts.sideTopTabsCss)) {
        failures.push(`sideHeader: ${FILES.sideTopTabsCss} lets the header icons shrink, so the row never overflows into its scroll (59-WR-05)`);
    }
    return failures;
}

// 67-WR-04 (handed over by lane G3b): orcaStatus accepts { clientReason: null }, the clearing form a successful
// Reconnect sends, calls OrcaService.clientRecovered when it exists and never throws when it does not; every other
// value that is not a known reason, and null beside browserHost, stays a validation refusal.
async function orcaStatusClause(texts) {
    const failures = [];
    const run = async (data, { recovered = true } = {}) => {
        const calls = [];
        const OrcaService = {
            browserHostAttached: () => calls.push('attached'),
            reportClientFailure: reason => calls.push(`failure ${reason}`),
            getState: () => ({ state: 'ready' }),
            ...(recovered ? { clientRecovered: () => calls.push('recovered') } : {}),
        };
        const OrcaEnv = { isClientReason: v => v === 'pairing-failed', orcaStatusReply: state => ({ status: state.state }) };
        const out = evalDeclarations(texts.api, ['ORCA_SERVICE_MODULE', 'ORCA_ENV_MODULE', 'handleOrcaShellMessage'],
            { ChromeUtils: { importESModule: url => (/OrcaEnv/.test(url) ? OrcaEnv : { OrcaService }) } }, ['handleOrcaShellMessage']);
        if (typeof out.handleOrcaShellMessage !== 'function') throw new Error('handleOrcaShellMessage not found');
        return { reply: await out.handleOrcaShellMessage({ kind: 'orcaStatus', ...data }, {}), calls };
    };
    let got = await run({ clientReason: null });
    if (got.reply?.ok !== true || got.calls.join() !== 'recovered') failures.push(`orcaStatus: rejected the clearing form { clientReason: null } (reply ${JSON.stringify(got.reply)}, calls [${got.calls}]); expected ok and one clientRecovered (67-WR-04)`);
    got = await run({ clientReason: null }, { recovered: false });
    if (got.reply?.ok !== true) failures.push(`orcaStatus: { clientReason: null } threw when OrcaService.clientRecovered is absent (reply ${JSON.stringify(got.reply)}) (67-WR-04)`);
    got = await run({ clientReason: 'pairing-failed' });
    if (got.reply?.ok !== true || got.calls.join() !== 'failure pairing-failed') failures.push('orcaStatus: broken instrument: a known client reason was not reported');
    for (const value of ['bogus', '', 0, false, {}]) {
        got = await run({ clientReason: value });
        if (got.reply?.ok !== false || got.calls.length) failures.push(`orcaStatus: accepted clientReason ${JSON.stringify(value)} (reply ${JSON.stringify(got.reply)}, calls [${got.calls}]); only a known reason or the literal null may pass`);
    }
    got = await run({ browserHost: 'attached', clientReason: null });
    if (got.reply?.ok !== false || got.calls.length) failures.push('orcaStatus: accepted clientReason null beside browserHost; that pairing stays a validation refusal');
    return failures;
}

const CLAUSES = [scrollClause, editStateClause, budgetClause, historyClause, servicesClause, cookiesClause, agentFlagClause, stopClause, sideHeaderClause, orcaStatusClause];

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
        name: '59-WR-03: no room kept for what the dispatcher adds to a snapshot',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'data.method === "browser.snapshot" ? agentSnapshotReserve(entry) : 0', '0', 'snapshot reserve') }),
        expect: '2000 bytes under the budget answered done',
    },
    {
        name: '59-WR-03: the reserve ignores a url longer than the Orca bound',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'Math.max(AGENT_SNAPSHOT_URL_UNITS * 3, url.length * 3)', 'AGENT_SNAPSHOT_URL_UNITS * 3', 'long url') }),
        expect: 'whose url is longer than the budget allows answered done',
    },
    {
        name: 'agent-browser-03: cookie.set makes an httpOnly cookie',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'if (!host || params.httpOnly === true || agentHttpOnlyNamed(', 'if (!host || agentHttpOnlyNamed(', 'httpOnly set') }),
        expect: 'cookie.set with httpOnly true answered',
    },
    {
        name: 'agent-browser-03: cookie.set overwrites or shadows an httpOnly name',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'if (!host || params.httpOnly === true || agentHttpOnlyNamed(host, params.name, agentOriginAttributes(entry))) {', 'if (!host || params.httpOnly === true) {', 'httpOnly name set') }),
        expect: 'over a name the site holds as httpOnly',
    },
    {
        name: 'agent-browser-03: cookie.delete ends an httpOnly cookie',
        plant: t => ({ ...t, api: replaceOnce(t.api, '  if (agentHttpOnlyNamed(host, params.name, attrs)) {\n    return agentFailed("browser_command_unavailable");\n  }\n  let deleted = 0;', '  let deleted = 0;', 'httpOnly delete') }),
        expect: 'cookie.delete of an httpOnly cookie',
    },
    {
        name: '67-WR-04: orcaStatus rejects { clientReason: null }',
        plant: t => ({ ...t, api: replaceOnce(t.api, '} else if (data.clientReason === null) {', '} else if (false) {', 'null branch') }),
        expect: 'rejected the clearing form',
    },
    {
        name: '67-WR-04: clientRecovered called unguarded',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'OrcaService.clientRecovered?.();', 'OrcaService.clientRecovered();', 'guard') }),
        expect: 'threw when OrcaService.clientRecovered is absent',
    },
    {
        name: '67-WR-04: any falsy clientReason accepted as the clearing form',
        plant: t => ({ ...t, api: replaceOnce(t.api, '} else if (data.clientReason === null) {', '} else if (!data.clientReason) {', 'loose null') }),
        expect: 'accepted clientReason ""',
    },
    {
        name: '59-WR-05: the side header keeps stock suppressScrollX',
        plant: t => ({ ...t, sideTopTabs: replaceOnce(t.sideTopTabs, 'suppressScrollX: false', 'suppressScrollX: true', 'side scroll') }),
        expect: 'keeps the stock suppressScrollX',
    },
    {
        name: '59-WR-05: the header icons shrink',
        plant: t => ({ ...t, sideTopTabsCss: replaceOnce(t.sideTopTabsCss, '    flex-shrink: 0;\n', '', 'icon shrink') }),
        expect: 'lets the header icons shrink',
    },
    {
        name: 'agent-browser-04: Stop ends control of the one tab only',
        plant: t => ({ ...t, api: replaceOnce(replaceOnce(t.api, 'for (const [tabId, other] of [...owned.filter(([id]) => id !== data.tabId), [data.tabId, entry]]) {', 'for (const [tabId, other] of [[data.tabId, entry]]) {', 'stop loop'), 'agentStoppedOwners.add(actorRef);', 'void 0;', 'owner stop') }),
        expect: 'another agent tab of the same frontend answered',
    },
    {
        name: 'agent-browser-04: chrome opens new agent tabs after Stop',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'if (agent === true && !remembered && agentOwnerStopped(actorRef)) {', 'if (false) {', 'open refusal') }),
        expect: 'a new agent tab after Stop answered',
    },
    {
        name: 'agent-browser-04: the dispatcher opens pages while agents are stopped',
        plant: t => ({ ...t, dispatch: replaceOnce(t.dispatch, 'if (deps.agentsStopped?.()) {', 'if (false) {', 'dispatch stop') }),
        expect: 'createPage while agents are stopped',
    },
    {
        name: '66-WR-06: a refused open answers browser_error only',
        plant: t => ({ ...t, dispatch: replaceOnce(t.dispatch, "return failed(error instanceof DispatchFailure ? error.errorCode : 'browser_error');", "return failed('browser_error');", 'failure code') }),
        expect: 'whose open chrome refused',
    },
    {
        name: 'agent-browser-04: a navigate chrome refused reports done',
        plant: t => ({ ...t, dispatch: replaceOnce(t.dispatch, "const outcome = reply?.ok === true && reply.where === undefined ? completed() : outcomeOf(reply);\n            return outcome.status === 'completed' ? completed() : outcome;", "return reply?.ok === true ? completed() : failed('browser_error');", 'navigate mapping') }),
        expect: 'agent wall answered agent-stopped',
    },
    {
        name: '66-CR-01: the host navigates through the widget, outside the agent wall',
        plant: t => ({ ...t, frontendModule: replaceOnce(t.frontendModule, "navigate: (tabId, url) => this.channel.request({ kind: 'webTabAgent', tabId, method: 'browser.goto', params: { url } }),", 'navigate: (tabId, url) => this.channel.widgetOf(tabId)?.navigate(url) ?? Promise.resolve(undefined),', 'navigate dep') }),
        expect: 'does not go through chrome\'s agent wall',
    },
    {
        name: '66-WR-06: createPage completes before chrome makes the overlay',
        plant: t => ({ ...t, frontendModule: replaceOnce(t.frontendModule, 'const reply = widget.isAttached ? await widget.opened : { ok: false };', "const reply = { ok: true, where: 'opened' };", 'open await') }),
        expect: 'does not await the first open',
    },
    {
        name: 'agent-browser-04: the mark shows only while an agent is active',
        plant: t => ({ ...t, chromeBar: replaceOnce(t.chromeBar, 'if (!tab?.agentControl.agent) {', 'if (!tab?.agentControl.active) {', 'mark guard') }),
        expect: 'not on every agent tab',
    },
    {
        name: 'agent-browser-02: chrome forgets an agent tab id at close',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'const remembered = pending === null && agentTabRemembered(tabId, key);', 'const remembered = false;', 'remembered id') }),
        expect: 'reopened as a user tab',
    },
    {
        name: 'agent-browser-02: chrome forgets an agent tab row key',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'agentRowKeys.has(key || `web:${tabId}`)', 'false', 'remembered key') }),
        expect: 'under an agent tab\'s row key',
    },
    {
        name: '66-CR-01: reopen() sends webTabOpen without the agent flag',
        plant: t => ({ ...t, webTab: replaceOnce(t.webTab, "url: this.url, key: this.rowKey, ...this.agentFlag() });", "url: this.url, key: this.rowKey });", 'reopen') }),
        expect: 'without the widget\'s agent flag',
    },
    {
        name: '66-CR-01: the flag on the first open only',
        plant: t => ({ ...t, webTab: replaceOnce(t.webTab, 'return this.agent ? { agent: true as const } : {};', 'return this.agent && !this.isAttached ? { agent: true as const } : {};', 'agentFlag') }),
        expect: 'does not return { agent: true }',
    },
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
        plant: t => ({ ...t, api: replaceOnce(t.api, 'if (outcome.where === "done" && !agentResultFits(outcome.result, data.method === "browser.snapshot" ? agentSnapshotReserve(entry) : 0)) {', 'if (false) {', 'budget measure') }),
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
        name: 'agent-browser-06: the sidecar port is left out of the wall',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'ports.push(groupSenderPort);', 'void groupSenderPort;', 'sidecar port') }),
        expect: 'http://127.0.0.1:4123/ is not refused',
    },
    {
        name: "agent-browser-06: a spelled loopback host on a service port is not cancelled before send",
        plant: t => ({ ...t, api: replaceOnce(t.api, "if (agentLoopbackHost(parts.host)) {\n    agentServiceCancel(channel, entry);", "if (false) {\n    agentServiceCancel(channel, entry);", "pre-send spelled") }),
        expect: "was not cancelled before it was sent",
    },
    {
        name: "agent-browser-06 (review 1): a name on a service port is sent without the pre-send lookup",
        plant: t => ({ ...t, api: replaceOnce(t.api, "agentResolveBeforeSend(channel, parts.host, entry);\n  return false;", "return false;", "pre-send lookup") }),
        expect: "resolving to loopback was sent",
    },
    {
        name: "agent-browser-06 (review 1): the lookup resumes before it cancels",
        plant: t => ({ ...t, api: replaceOnce(t.api, "    if (refused) {\n      agentServiceCancel(channel, entry);\n    }\n    try {\n      channel.resume();\n    } catch {\n      // cancelled elsewhere meanwhile\n    }", "    try {\n      channel.resume();\n    } catch {\n      // cancelled elsewhere meanwhile\n    }\n    if (refused) {\n      agentServiceCancel(channel, entry);\n    }", "cancel order") }),
        expect: "resolving to loopback was sent",
    },
    {
        name: "agent-browser-06: the response address is not checked",
        plant: t => ({ ...t, api: replaceOnce(t.api, "if (agentServiceRefused(internal.remoteAddress, internal.remotePort)) {", "if (false && internal) {", "remote address") }),
        expect: "response-time second line",
    },
    {
        name: "agent-browser-06 (review 2): an agent-container worker load is judged by its browsing context only",
        plant: t => ({ ...t, api: replaceOnce(t.api, "if ((entry || agentChannelInContainer(channel)) && agentServiceWall(channel, topic, entry)) {", "if (entry && agentServiceWall(channel, topic, entry)) {", "container judge") }),
        expect: "worker load in the agent container",
    },
    {
        name: "agent-browser-06 (review 3): single-number and hex IPv4 forms are not parsed",
        plant: t => ({ ...t, api: replaceOnce(t.api, "if (/^0x[0-9a-f]*$/.test(part)) {", "if (false) {", "hex v4") }),
        expect: "misses \"0x7f000001\"",
    },
    {
        name: "agent-browser-06 (review 3): mapped unspecified addresses are not loopback",
        plant: t => ({ ...t, api: replaceOnce(t.api, "(g[5] === 0xffff || g[5] === 0)", "(g[5] === 0xffff && g[6] !== 0)", "mapped unspecified") }),
        expect: "misses \"::ffff:0:0\"",
    },
    {
        name: "agent-browser-06 (review 3): 0.0.0.0 is not loopback",
        plant: t => ({ ...t, api: replaceOnce(t.api, "return top === 127 || top === 0;", "return top === 127;", "zero net") }),
        expect: "misses \"0.0.0.0\"",
    },
    {
        name: "agent-browser-06 (review 3): a trailing dot on localhost is not stripped",
        plant: t => ({ ...t, api: replaceOnce(t.api, "const name = String(host ?? \"\").toLowerCase().replace(/^\\[|\\]$/g, \"\").replace(/\\.+$/, \"\");", "const name = String(host ?? \"\").toLowerCase().replace(/^\\[|\\]$/g, \"\");", "trailing dot") }),
        expect: "misses \"localhost.\"",
    },
    {
        name: "agent-browser-06 (review 3): an IPv6 zone is not stripped",
        plant: t => ({ ...t, api: replaceOnce(t.api, "let h = text.replace(/%.*$/, \"\");", "let h = text;", "zone") }),
        expect: "misses \"::1%lo\"",
    },
    {
        name: 'agent-browser-06: orcad\'s port pref drifts from OrcaService',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'const AGENT_ORCA_PORT_DEFAULT = 26768;', 'const AGENT_ORCA_PORT_DEFAULT = 26769;', 'orcad default') }),
        expect: 'drifts out of the wall',
    },
    {
        name: 'agent-browser-03: cookie.get returns httpOnly values',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'value: c.isHttpOnly ? "" : c.value', 'value: c.value', 'httpOnly value') }),
        expect: 'returned an httpOnly cookie\'s value',
    },
    {
        name: 'agent-browser-03: the cookie rows act on any site',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'return site && agentSiteOf(host) === site ? host : "";', 'return host;', 'site scope') }),
        expect: 'cookie.set on another site answered',
    },
    {
        name: 'chrome-actor-04: cookie.get with no url reads the whole agent container',
        plant: t => ({ ...t, api: replaceOnce(t.api, 'cookies: Services.cookies.getCookiesFromHost(host, attrs).map(', 'cookies: (params.url ? Services.cookies.getCookiesFromHost(host, attrs) : Services.cookies.getCookiesWithOriginAttributes(JSON.stringify(attrs))).map(', 'whole container') }),
        expect: 'read the whole agent container',
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
