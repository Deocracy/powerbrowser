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
        add: (host) => { calls.push(`add ${host}`); return { result: 0 }; },
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
    calls.length = 0;
    const own = await w.agent('a1', 'browser.cookie.set', { name: 'theme', value: 'light', domain: 'app.example.com' });
    if (own?.where !== 'done' || !calls.includes('add app.example.com')) failures.push(`cookies: cookie.set on the current site answered ${JSON.stringify(own)}; expected done (positive control)`);
    return failures;
}

const CLAUSES = [scrollClause, editStateClause, budgetClause, historyClause, servicesClause, cookiesClause];

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
