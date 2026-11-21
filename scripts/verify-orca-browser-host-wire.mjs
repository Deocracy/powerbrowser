#!/usr/bin/env node
// scripts/verify-orca-browser-host-wire.mjs
//
// orca-browser-host-wire (v1.7 audit fix lane G1b; 66-CR-02, 66-CR-03, 66-CR-04, 66-WR-01..05, T-66-04): the
// PowerBrowser browser host, run end to end in Node, puts on the wire only what the pinned orcad accepts, and holds
// its pages and its deadlines across a detach.
//
// What runs (transpiled with theia/node_modules/typescript and evaluated in a vm context with a virtual clock):
//  - @powerbrowser/orca-browser's frontend module (OrcaBrowserHost, OrcaBrowserPages) with its real dispatcher and
//    wire helpers; Theia's DI, shell and web tab channel are stubs, chrome is a scripted responder on the bridge's
//    PowerBrowserGroupRequest / PowerBrowserGroupResponse events;
//  - the shipped thin host bundle (orca-overlay pb-browser-host.ts) over a fake WebSocket, with Orca's pairing
//    handshake stubbed to plain text and every other import Orca's own pinned module;
//  - a fake orcad that validates every request's params with the schema the pinned orcad declares for that method.
//    The method -> schema map is derived from orca/src/main/runtime/rpc/methods/*.ts (each defineMethod or
//    defineStreamingMethod's name and params, the params identifier resolved through the file's imports), and params
//    are parsed as orcad's dispatcher parses them (`params ?? {}`). Every command event the fake orcad sends is first
//    validated with Orca's BrowserClientHostCommandEvent, so the fixture cannot drift from the protocol either;
//  - the shipped link (pb-browser-host-link.ts) over Orca's real web-runtime-credentials.ts, with the credential
//    source, key store and stored environment stubbed.
// Derived deadlines: chrome's default agent wait (GroupActorChild.sys.mjs `params.timeout > 0 ? params.timeout : N`),
// chrome's settle (PowerBrowserAPI.sys.mjs AGENT_SETTLE_BEAT_MS + AGENT_SETTLE_MAX_MS), Orca's forwarding hop
// (browser-wait-timeout.ts browserWaitRequestTimeoutMs) and the web tab channel's acknowledgement timeout
// (tab-uris web-tab.ts WEB_TAB_ACK_TIMEOUT_MS, used by the stub channel's request()).
//
// Clauses:
//  metadata       66-CR-02: every page state push of a bound tab reaches orcad as a pageMetadata orcad accepts (a long
//                 url and title, and a push with no flags, included); a refused update is logged.
//  reattach       66-CR-03: after a detach with an agent tab open, the re-attach is accepted, names the same host id
//                 (and every placement names it), and its inventory carries the bound page; after orcad reclaims the
//                 page, the next inventory carries the reclaimed authority.
//  timeout        66-CR-04: an agent wait that chrome answers after the channel's acknowledgement timeout completes;
//                 the host's deadline lies between chrome's own deadline and Orca's forwarding hop for every sampled
//                 timeout; a command chrome never answers fails browser_timeout.
//  budget         66-WR-04: a completed value over Orca's result budget is still answered, with a result orcad accepts.
//  startDeadline  66-WR-02: with no link, and with a link that never becomes ready, the attach fails and logs the step.
//  detachedClose  66-WR-03: a user close while the host is detached reaches orcad as browser.tabClose after re-attach.
//  duplicate      66-WR-05: a losing duplicate createPage leaves the winner's records: it is in the next inventory,
//                 and its user close carries its worktree selector.
//  placement      T-66-04: the link binds placement to the first host id; another id is refused and changes nothing.
//  credential     66-WR-01: after a re-pair, the credential source the link reads is the one the pane client created,
//                 with the pane client's callbacks, never one the link created first.
//
// --self-test plants each pre-fix fault in an in-memory copy and requires its clause red, naming the drift.
// Tier: quick. Hermetic (no network, no display, no browser). One named SKIP when orca/src, orca/node_modules/zod or
// theia/node_modules/typescript is absent.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const NAME = 'orca-browser-host-wire';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OVERLAY = 'orca-overlay/files/';
const REL = {
    frontend: 'theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts',
    dispatch: 'theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts',
    wire: 'theia/extensions/orca-browser/src/common/orca-browser-host-wire.ts',
    host: 'orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts',
    link: 'orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts',
    webTab: 'theia/extensions/tab-uris/src/browser/web-tab.ts',
    groupChild: 'powerbrowser/shell/GroupActorChild.sys.mjs',
    api: 'powerbrowser/shell/PowerBrowserAPI.sys.mjs',
    methods: 'orca/src/main/runtime/rpc/methods',
    credentials: 'orca/src/renderer/src/web/preload-api/web-runtime-credentials.ts',
};
const LINK_KEY = Symbol.for('powerbrowser.orca-browser.link');
const HOST_MODULE_KEY = Symbol.for('powerbrowser.orca-browser.host-module');
const RUNTIME_ID = 'runtime-1';

class FixtureError extends Error {}

function loadTypescript() {
    try { return createRequire(join(REPO_ROOT, 'theia', 'package.json'))('typescript'); } catch { return undefined; }
}
function loadZod() {
    try { return createRequire(join(REPO_ROOT, 'orca', 'package.json'))('zod'); } catch { return undefined; }
}

// ---------------------------------------------------------------------------------------------------------------
// Module loader: TypeScript -> CommonJS in a given vm context. An overlay file stands in for orca/<path>; a stub is
// keyed by its orca-relative path without extension ('src/shared/x') or by its bare specifier.
// ---------------------------------------------------------------------------------------------------------------
function makeLoader({ ts, files, context, stubs = {}, bare = {} }) {
    const cache = new Map();
    const textOf = abs => {
        const rel = relative(REPO_ROOT, abs);
        return Object.prototype.hasOwnProperty.call(files, rel) ? files[rel] : readFileSync(abs, 'utf8');
    };
    const exists = abs => Object.prototype.hasOwnProperty.call(files, relative(REPO_ROOT, abs)) || isFile(abs);
    const orcaKey = abs => {
        const rel = relative(REPO_ROOT, abs).replace(/\.(tsx?|js)$/, '');
        if (rel.startsWith(OVERLAY)) return rel.slice(OVERLAY.length);
        if (rel.startsWith('orca/')) return rel.slice('orca/'.length);
        return null;
    };
    const candidates = base => [base + '.ts', base + '.tsx', base, join(base, 'index.ts')];
    function resolveFile(fromAbs, spec) {
        const base = resolve(dirname(fromAbs), spec);
        const key = orcaKey(base);
        if (key && Object.prototype.hasOwnProperty.call(stubs, key)) return { stub: stubs[key] };
        const tries = [...candidates(base)];
        const rel = relative(REPO_ROOT, base);
        if (rel.startsWith(OVERLAY)) tries.push(...candidates(join(REPO_ROOT, 'orca', rel.slice(OVERLAY.length))));
        const found = tries.find(exists);
        if (!found) throw new FixtureError(`cannot resolve ${spec} from ${relative(REPO_ROOT, fromAbs)}`);
        return { abs: found };
    }
    function load(abs) {
        if (cache.has(abs)) return cache.get(abs).exports;
        const module = { exports: {} };
        cache.set(abs, module);
        const out = ts.transpileModule(textOf(abs), {
            fileName: abs,
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true, esModuleInterop: true },
        }).outputText;
        const fn = vm.runInContext(`(function (exports, require, module, __filename, __dirname) {${out}\n})`, context, { filename: abs });
        const req = spec => {
            if (Object.prototype.hasOwnProperty.call(bare, spec)) return bare[spec];
            if (!spec.startsWith('.')) throw new FixtureError(`no stub for ${spec} (from ${relative(REPO_ROOT, abs)})`);
            const target = resolveFile(abs, spec);
            return target.stub ?? load(target.abs);
        };
        fn(module.exports, req, module, abs, dirname(abs));
        return module.exports;
    }
    return {
        load: rel => {
            const abs = candidates(join(REPO_ROOT, rel)).find(exists);
            if (!abs) throw new FixtureError(`cannot find ${rel}`);
            return load(abs);
        },
    };
}
function isFile(p) {
    try { return statSync(p).isFile(); } catch { return false; }
}

// ---------------------------------------------------------------------------------------------------------------
// Orca's schemas, derived from the pinned source.
// ---------------------------------------------------------------------------------------------------------------
function makeSchemas(ts, zod) {
    const context = vm.createContext({ console, TextEncoder, TextDecoder, URL });
    const loader = makeLoader({ ts, files: {}, context, bare: { zod } });
    const methods = new Map();
    const dir = join(REPO_ROOT, REL.methods);
    for (const name of readdirSync(dir)) {
        if (!name.endsWith('.ts') || name.includes('.test.')) continue;
        const abs = join(dir, name);
        const sf = ts.createSourceFile(abs, readFileSync(abs, 'utf8'), ts.ScriptTarget.Latest, true);
        const imports = new Map();
        for (const st of sf.statements) {
            if (ts.isImportDeclaration(st) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
                for (const el of st.importClause.namedBindings.elements) {
                    imports.set(el.name.text, { from: st.moduleSpecifier.text, name: (el.propertyName ?? el.name).text });
                }
            }
        }
        const visit = node => {
            if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^define(Streaming)?Method$/.test(node.expression.text)
                && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
                const props = new Map(node.arguments[0].properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(sf), p.initializer]));
                const methodName = props.get('name');
                if (methodName && ts.isStringLiteral(methodName)) {
                    const params = props.get('params');
                    let entry = { file: relative(REPO_ROOT, abs), params: null };
                    if (params && ts.isIdentifier(params)) {
                        const imp = imports.get(params.text);
                        entry = { ...entry, params: imp ? { module: resolve(dir, imp.from), name: imp.name } : { local: params.text } };
                    } else if (params && params.kind !== ts.SyntaxKind.NullKeyword) {
                        entry = { ...entry, params: { local: params.getText(sf).slice(0, 40) } };
                    }
                    methods.set(methodName.text, entry);
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(sf);
    }
    const resolved = new Map();
    const schemaOf = method => {
        if (resolved.has(method)) return resolved.get(method);
        const entry = methods.get(method);
        let result;
        if (!entry) result = { error: `orcad declares no method ${method}` };
        else if (entry.params === null) result = { schema: null };
        else if (entry.params.local) result = { error: `${method}'s params (${entry.params.local}) are not an imported schema in ${entry.file}` };
        else {
            const mod = loader.load(relative(REPO_ROOT, entry.params.module));
            result = mod[entry.params.name] ? { schema: mod[entry.params.name] } : { error: `${entry.params.name} is not exported where ${entry.file} imports it` };
        }
        resolved.set(method, result);
        return result;
    };
    const shared = rel => loader.load(join('orca/src/shared', rel));
    return {
        count: methods.size,
        validate(method, params) {
            const { schema, error } = schemaOf(method);
            if (error) return { ok: false, issues: error };
            if (schema === null) return { ok: true };
            const parsed = schema.safeParse(params ?? {});
            return parsed.success ? { ok: true } : { ok: false, issues: parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') };
        },
        commandEvent: shared('browser-client-host-protocol.ts').BrowserClientHostCommandEvent,
        waitHop: shared('browser-wait-timeout.ts').browserWaitRequestTimeoutMs,
    };
}

// ---------------------------------------------------------------------------------------------------------------
// Virtual clock.
// ---------------------------------------------------------------------------------------------------------------
const flush = async () => { for (let i = 0; i < 30; i += 1) await new Promise(r => setImmediate(r)); };
function makeClock() {
    let now = 0;
    let seq = 0;
    const timers = new Map();
    return {
        setTimeout: (fn, ms = 0, ...args) => { const id = (seq += 1); timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, args }); return id; },
        clearTimeout: id => { timers.delete(id); },
        async advance(ms) {
            const end = now + ms;
            for (;;) {
                await flush();
                let next;
                for (const [id, t] of timers) {
                    if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
                }
                if (!next) break;
                timers.delete(next[0]);
                now = next[1].at;
                next[1].fn(...next[1].args);
            }
            now = end;
            await flush();
        },
    };
}

// ---------------------------------------------------------------------------------------------------------------
// Derived constants.
// ---------------------------------------------------------------------------------------------------------------
function derived(files) {
    const text = rel => files[rel] ?? readFileSync(join(REPO_ROOT, rel), 'utf8');
    const num = (rel, re, what) => {
        const m = re.exec(text(rel));
        if (!m) throw new FixtureError(`${what} not found in ${rel}`);
        return Number(m[1].replace(/_/g, ''));
    };
    return {
        ackMs: num(REL.webTab, /export const WEB_TAB_ACK_TIMEOUT_MS = ([\d_]+);/, 'WEB_TAB_ACK_TIMEOUT_MS'),
        chromeWaitDefault: num(REL.groupChild, /params\.timeout > 0 \? params\.timeout : ([\d_]+)/, "chrome's default agent wait"),
        settle: num(REL.api, /const AGENT_SETTLE_BEAT_MS = ([\d_]+);/, 'AGENT_SETTLE_BEAT_MS') + num(REL.api, /const AGENT_SETTLE_MAX_MS = ([\d_]+);/, 'AGENT_SETTLE_MAX_MS'),
    };
}

// ---------------------------------------------------------------------------------------------------------------
// World: the frontend host, the thin host bundle, a fake orcad and a scripted chrome.
// ---------------------------------------------------------------------------------------------------------------
function theiaStubs() {
    class Emitter {
        constructor() { this.listeners = []; this.event = l => { this.listeners.push(l); return { dispose() {} }; }; }
        fire(v) { for (const l of this.listeners) l(v); }
    }
    return {
        '@theia/core/shared/inversify': { ContainerModule: class { constructor(fn) { this.fn = fn; } }, inject: () => () => undefined, injectable: () => t => t },
        '@theia/core/lib/common/event': { Emitter },
        '@theia/core/lib/browser': { ApplicationShell: class {}, FrontendApplicationContribution: Symbol('FrontendApplicationContribution'), Widget: class {}, WidgetManager: class {} },
        '@theia/core/lib/browser/frontend-application-state': { FrontendApplicationStateService: class {} },
        '@powerbrowser/tab-uris/lib/browser/web-tab': { WEB_TAB_FACTORY_ID: 'web-tab', WebTabChannel: class {}, WebTabOpenHandler: class {}, WebTabWidget: class {} },
        '@powerbrowser/tab-uris/lib/browser/orca-scheme-coverage': { ORCA_PANE_FACTORY_ID: 'orca-pane' },
    };
}

const handshakeStub = {
    createPairedE2EEClientHandshake: () => ({
        helloText: () => 'hello',
        acceptReadyText: text => (text === 'ready-text' ? 'accepted' : 'refused'),
        sealAuth: async () => 'auth',
        channel: { sealText: t => t, openText: t => t },
        classifyAuthReply: plain => (plain === 'authed' ? { kind: 'authenticated' } : { kind: 'pending' }),
    }),
};

class FakeOrcad {
    constructor(schemas, clock) {
        this.schemas = schemas;
        this.clock = clock;
        this.refusals = [];
        this.attaches = [];
        this.results = new Map();
        this.metadata = [];
        this.tabCloses = [];
        this.refuse = new Set();
        this.seq = 0;
        this.leaseGen = 0;
    }
    reply(ws, text) { this.clock.setTimeout(() => { if (!ws.closed) ws.onmessage?.({ data: text }); }, 0); }
    connect(ws) { ws.stage = 'hello'; this.ws = ws; }
    receive(ws, text) {
        if (ws.stage === 'hello') { ws.stage = 'auth'; this.reply(ws, 'ready-text'); return; }
        if (ws.stage === 'auth') { ws.stage = 'open'; this.reply(ws, 'authed'); return; }
        const { id, method, params } = JSON.parse(text);
        const check = this.refuse.has(method) ? { ok: false, issues: 'refused by the scenario' } : this.schemas.validate(method, params);
        if (!check.ok) {
            if (!this.refuse.has(method)) this.refusals.push({ method, issues: check.issues });
            this.reply(ws, JSON.stringify({ id, ok: false, error: { code: 'invalid_argument' } }));
            return;
        }
        if (method === 'status.get') {
            this.reply(ws, JSON.stringify({ id, ok: true, result: {}, _meta: { runtimeId: RUNTIME_ID } }));
        } else if (method === 'browser.clientHost.attach') {
            this.leaseGen += 1;
            this.lease = { authorityRuntimeId: RUNTIME_ID, authorityEpoch: `epoch-${this.leaseGen}`, browserHostClientId: params.browserHostClientId, browserHostGeneration: this.leaseGen };
            this.attachId = id;
            this.attaches.push({ params, lease: this.lease });
            this.reply(ws, JSON.stringify({ id, ok: true, result: { type: 'ready', authorityEpoch: this.lease.authorityEpoch, browserHostGeneration: this.leaseGen, pageCommandProtocolVersion: 1, pageInventoryProtocolVersion: 1, pageReconciliationProtocolVersion: 1 } }));
        } else {
            if (method === 'browser.clientHost.commandResult') this.results.set(params.commandId, params.result);
            if (method === 'browser.clientHost.pageMetadata') this.metadata.push(params);
            if (method === 'browser.tabClose') this.tabCloses.push(params);
            this.reply(ws, JSON.stringify({ id, ok: true, result: { accepted: true } }));
        }
    }
    command(browserPageId, command, pageHostGeneration = 1) {
        this.seq += 1;
        const event = { type: 'command', ...this.lease, pageCommandProtocolVersion: 1, pageReconciliationProtocolVersion: 1, browserPageId, pageHostGeneration, commandSequence: this.seq, commandId: `command-${this.seq}`, command };
        const parsed = this.schemas.commandEvent.safeParse(event);
        if (!parsed.success) throw new FixtureError(`the fake orcad built a ${command.type} event Orca's BrowserClientHostCommandEvent refuses: ${parsed.error.issues.map(i => i.message).join('; ')}`);
        this.reply(this.ws, JSON.stringify({ id: this.attachId, ok: true, result: event }));
        return event;
    }
    drop() { this.ws?.close(); }
}

function makeWorld({ ts, zod, schemas, files, link = 'ready', agent = () => ({ after: 5, reply: { ok: true, where: 'done', result: {} } }) }) {
    const clock = makeClock();
    const events = new EventTarget();
    const logs = [];
    const storage = new Map();
    const orcad = new FakeOrcad(schemas, clock);
    let uuid = 0;
    let tabs = 0;
    const widgets = new Map();
    class FakeWebSocket {
        constructor() { orcad.connect(this); clock.setTimeout(() => this.onopen?.(), 0); }
        send(text) { if (!this.closed) orcad.receive(this, text); }
        close() { if (this.closed) return; this.closed = true; clock.setTimeout(() => this.onclose?.(), 0); }
    }
    const respond = (requestId, reply, after) => clock.setTimeout(() => events.dispatchEvent(new CustomEvent('PowerBrowserGroupResponse', { detail: { requestId, reply } })), after);
    const chrome = ev => {
        const { requestId, msg } = ev.detail ?? {};
        if (msg?.kind === 'webTabAgent') {
            const plan = agent(msg);
            if (plan) respond(requestId, plan.reply, plan.after);
        } else if (msg) {
            respond(requestId, { ok: true }, 0);
        }
    };
    const sandbox = {
        console: { log() {}, info() {}, debug() {}, warn: (...a) => logs.push(['warn', a.join(' ')]), error: (...a) => logs.push(['error', a.join(' ')]) },
        setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
        TextEncoder, TextDecoder, URL, Event, CustomEvent, EventTarget,
        addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
        sessionStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => { storage.set(k, String(v)); }, removeItem: k => { storage.delete(k); } },
        location: { protocol: 'http:', hostname: '127.0.0.1' },
        crypto: { randomUUID: () => `00000000-0000-4000-8000-${String((uuid += 1)).padStart(12, '0')}` },
        document: { dispatchEvent: ev => { chrome(ev); return true; }, baseURI: 'http://127.0.0.1:3000/', head: { appendChild() {} }, createElement: () => ({}) },
        WebSocket: FakeWebSocket,
    };
    sandbox.window = sandbox;
    const context = vm.createContext(sandbox);
    const loader = makeLoader({
        ts, files, context, bare: { ...theiaStubs(), zod },
        stubs: {
            'src/shared/paired-e2ee-client-handshake': handshakeStub,
            'src/renderer/src/web/web-paired-e2ee-primitives': { WEB_PAIRED_E2EE_PRIMITIVES: {} },
            'src/shared/web-origin-security': { withWebClientUpgradeMarker: url => url },
        },
    });
    const placements = [];
    let connections = 0;
    if (link) {
        sandbox[LINK_KEY] = {
            connection: async () => {
                connections += 1;
                if (link === 'never-ready') throw new Error('link_not_ready');
                return { endpoint: 'ws://127.0.0.1:1/', hostPublicKeyB64: 'key', credential: { kind: 'token', deviceToken: 'device-token' } };
            },
            setPlacement: id => { placements.push(id); },
        };
    }
    const frontend = loader.load(REL.frontend);
    sandbox[HOST_MODULE_KEY] = loader.load(REL.host);
    const makeWidget = () => {
        const tabId = `agent-tab-${(tabs += 1)}`;
        const listeners = [];
        const widget = {
            tabId, agent: true, isAttached: true, isDisposed: false, url: `https://example.com/${tabs}`, pageTitle: `Example ${tabs}`, agentControl: { stopped: false },
            disposed: { connect: fn => { listeners.push(fn); } },
            close() { if (widget.isDisposed) return; widget.isDisposed = true; widgets.delete(tabId); for (const fn of listeners) fn(); },
        };
        widget.opened = new Promise(r => clock.setTimeout(() => r({ ok: true, where: 'opened' }), 20));
        widgets.set(tabId, widget);
        return widget;
    };
    const pushes = {};
    const { ackMs } = derived(files);
    let seq = 0;
    const channel = {
        onPush: (kind, handler) => { (pushes[kind] ??= []).push(handler); return { dispose() {} }; },
        widgetOf: id => widgets.get(id),
        // WebTabChannel.request: settles at the acknowledgement timeout, as tab-uris does.
        request: msg => new Promise(resolveReply => {
            const requestId = `web-tab-${msg.kind}-${(seq += 1)}`;
            const onResponse = ev => {
                if (ev.detail?.requestId !== requestId) return;
                events.removeEventListener('PowerBrowserGroupResponse', onResponse);
                clock.clearTimeout(timer);
                resolveReply(ev.detail.reply);
            };
            const timer = clock.setTimeout(() => { events.removeEventListener('PowerBrowserGroupResponse', onResponse); resolveReply({ ok: false, reason: 'timeout' }); }, ackMs);
            events.addEventListener('PowerBrowserGroupResponse', onResponse);
            chrome(new CustomEvent('PowerBrowserGroupRequest', { detail: { requestId, msg } }));
        }),
    };
    const pages = new frontend.OrcaBrowserPages();
    pages.channel = channel;
    const host = new frontend.OrcaBrowserHost();
    Object.assign(host, {
        pages, channel,
        openHandler: { openAgentTab: async () => makeWidget() },
        shell: { onDidChangeActiveWidget() {}, getAreaFor: () => 'main', getCurrentWidget: () => undefined },
        widgetManager: { getWidgets: () => [...widgets.values()] },
        appState: { reachedState: async () => undefined },
    });
    const push = detail => { for (const h of pushes.state ?? []) h(detail); };
    return { clock, orcad, host, widgets, storage, logs, placements, push, connections: () => connections };
}

const createPage = (workspaceId = 'wt-1') => ({ type: 'createPage', browserProfileId: 'default', executionHostKey: 'local', workspaceId });
const refusalText = w => w.orcad.refusals.map(r => `${r.method} refused (${r.issues})`).join('; ');

async function attached(w) {
    const done = w.host.attach();
    await w.clock.advance(1000);
    return done;
}

// ---------------------------------------------------------------------------------------------------------------
// Scenarios. Each returns failure strings prefixed with its clause.
// ---------------------------------------------------------------------------------------------------------------
async function metadataScenario(env) {
    const fails = [];
    const w = makeWorld(env);
    if (!(await attached(w))) return [`metadata: the host did not attach (${refusalText(w) || 'no refusal'})`];
    w.orcad.command('page-1', createPage());
    await w.clock.advance(1000);
    const [tabId] = [...w.widgets.keys()];
    w.push({ tabId, url: 'https://example.com/a', title: 'A', loading: true, canGoBack: true, canGoForward: false });
    await w.clock.advance(100);
    w.push({ tabId, url: `https://example.com/${'u'.repeat(9000)}`, title: 't'.repeat(5000) });
    await w.clock.advance(100);
    const refused = w.orcad.refusals.filter(r => r.method === 'browser.clientHost.pageMetadata');
    if (refused.length || w.orcad.metadata.length !== 2) {
        fails.push(`metadata: ${w.orcad.metadata.length} of 2 page state pushes were accepted by orcad as pageMetadata${refused.length ? `; refused: ${refused.map(r => r.issues).join(' | ')}` : ''}`);
    } else if (w.orcad.metadata[0].url !== 'https://example.com/a' || w.orcad.metadata[0].loading !== true || w.orcad.metadata[0].canGoBack !== true) {
        fails.push(`metadata: the first update reached orcad as ${JSON.stringify(w.orcad.metadata[0])}, not the pushed state`);
    }
    w.orcad.refuse.add('browser.clientHost.pageMetadata');
    const before = w.logs.length;
    w.push({ tabId, url: 'https://example.com/b', title: 'B', loading: false, canGoBack: true, canGoForward: false });
    await w.clock.advance(100);
    if (!w.logs.slice(before).some(([, line]) => /metadata/i.test(line))) fails.push('metadata: a pageMetadata orcad refused was swallowed with no log line');
    return fails;
}

async function reattachScenario(env) {
    const fails = [];
    const w = makeWorld(env);
    if (!(await attached(w))) return [`reattach: the first attach failed (${refusalText(w) || 'no refusal'})`];
    w.orcad.command('page-1', createPage());
    await w.clock.advance(1000);
    w.orcad.drop();
    await w.clock.advance(100);
    if (w.host.state !== 'failed') fails.push(`reattach: after a detach the host state is ${w.host.state}, not failed`);
    const second = await attached(w);
    const attachRefused = w.orcad.refusals.filter(r => r.method === 'browser.clientHost.attach');
    if (!second || attachRefused.length) {
        return [...fails, `reattach: the re-attach with an agent tab open was not accepted${attachRefused.length ? `: ${attachRefused.map(r => r.issues).join(' | ')}` : ''}`];
    }
    const ids = new Set([...w.orcad.attaches.map(a => a.params.browserHostClientId), ...w.placements.filter(p => p !== null)]);
    if (ids.size !== 1) fails.push(`reattach: the attaches and placements name ${ids.size} host ids (${[...ids].join(', ')}); one frontend keeps one id`);
    const entry = w.orcad.attaches[1].params.pageInventory?.find(p => p.browserPageId === 'page-1');
    if (!entry) return [...fails, 'reattach: the re-attach inventory does not carry the bound page, so Orca cannot reclaim it'];
    w.orcad.command('page-1', {
        type: 'reclaimPage',
        previousAuthority: { authorityRuntimeId: entry.authorityRuntimeId, authorityEpoch: entry.authorityEpoch, browserHostClientId: entry.browserHostClientId, browserHostGeneration: entry.browserHostGeneration, pageHostGeneration: entry.pageHostGeneration },
        browserProfileId: entry.browserProfileId, executionHostKey: entry.executionHostKey, workspaceId: entry.workspaceId,
    }, 2);
    await w.clock.advance(1000);
    const lease2 = w.orcad.lease;
    w.orcad.drop();
    await w.clock.advance(100);
    if (!(await attached(w))) return [...fails, `reattach: the third attach failed (${refusalText(w) || 'no refusal'})`];
    const third = w.orcad.attaches[2]?.params.pageInventory?.find(p => p.browserPageId === 'page-1');
    if (!third || third.authorityEpoch !== lease2.authorityEpoch || third.browserHostGeneration !== lease2.browserHostGeneration || third.pageHostGeneration !== 2) {
        fails.push(`reattach: after orcad reclaimed the page, the next inventory names ${third ? `epoch ${third.authorityEpoch}, generation ${third.browserHostGeneration}, page generation ${third.pageHostGeneration}` : 'no entry'}; expected the reclaim's ${lease2.authorityEpoch}, ${lease2.browserHostGeneration}, 2`);
    }
    return fails;
}

async function timeoutScenario(env, consts) {
    const fails = [];
    const { agentCallTimeoutMs } = makeLoaderForWire(env);
    for (const t of [undefined, 0, 2000, 25000, 30000, 60000, 120000]) {
        const ours = agentCallTimeoutMs(t === undefined ? {} : { timeout: t });
        const chromeDeadline = (t > 0 ? t : consts.chromeWaitDefault) + consts.settle;
        const hop = env.schemas.waitHop(t);
        if (!(ours > chromeDeadline && ours <= hop)) fails.push(`timeout: for timeout ${t}, the host waits ${ours} ms; it must exceed chrome's ${chromeDeadline} ms and not exceed Orca's forwarding hop ${hop} ms`);
    }
    const w = makeWorld({ ...env, agent: msg => (msg.method === 'browser.wait' ? { after: 9000, reply: { ok: true, where: 'done', result: { matched: true } } } : msg.method === 'browser.eval' ? null : { after: 5, reply: { ok: true, where: 'done', result: {} } }) });
    if (!(await attached(w))) return [`timeout: the host did not attach (${refusalText(w) || 'no refusal'})`];
    w.orcad.command('page-1', createPage());
    await w.clock.advance(1000);
    const wait = w.orcad.command('page-1', { type: 'automation', method: 'browser.wait', params: { timeout: 10000 } });
    await w.clock.advance(12000);
    const waited = w.orcad.results.get(wait.commandId);
    if (waited?.status !== 'completed') fails.push(`timeout: a browser.wait chrome answers after 9 s reached orcad as ${JSON.stringify(waited ?? 'no result')}; expected completed`);
    const evalCommand = w.orcad.command('page-1', { type: 'automation', method: 'browser.eval', params: { expression: '1' } });
    await w.clock.advance(agentCallTimeoutMs({}) + 1000);
    const evaluated = w.orcad.results.get(evalCommand.commandId);
    if (evaluated?.status !== 'failed' || evaluated.errorCode !== 'browser_timeout') fails.push(`timeout: a command chrome never answers reached orcad as ${JSON.stringify(evaluated ?? 'no result')}; expected failed browser_timeout`);
    return fails;
}

function makeLoaderForWire(env) {
    const context = vm.createContext({ console, TextEncoder, setTimeout, clearTimeout });
    return makeLoader({ ts: env.ts, files: env.files, context }).load(REL.wire);
}

async function budgetScenario(env) {
    const big = 'x'.repeat(800 * 1024);
    const w = makeWorld({ ...env, agent: msg => ({ after: 5, reply: { ok: true, where: 'done', result: msg.method === 'browser.snapshot' ? { snapshot: big } : {} } }) });
    if (!(await attached(w))) return [`budget: the host did not attach (${refusalText(w) || 'no refusal'})`];
    w.orcad.command('page-1', createPage());
    await w.clock.advance(1000);
    const snap = w.orcad.command('page-1', { type: 'automation', method: 'browser.snapshot', params: {} });
    await w.clock.advance(1000);
    const result = w.orcad.results.get(snap.commandId);
    return result ? [] : [`budget: a snapshot over Orca's result budget got no result orcad accepts (${refusalText(w) || 'none sent'}); the command is left unanswered`];
}

async function startDeadlineScenario(env) {
    const fails = [];
    for (const [link, step] of [[null, 'link'], ['never-ready', 'connection']]) {
        const w = makeWorld({ ...env, link });
        let settled = 'pending';
        w.host.attach().then(v => { settled = v; });
        await w.clock.advance(125_000);
        const logged = w.logs.some(([level, line]) => level === 'error' && line.includes(`at the ${step} step`));
        if (w.host.state !== 'failed' || settled !== false || !logged) {
            fails.push(`startDeadline: with ${link ? 'a link that never becomes ready' : 'no link'}, after 125 s the attach is ${settled}, the state ${w.host.state}, and ${logged ? 'the' : 'no'} log line names the ${step} step`);
        }
    }
    return fails;
}

async function detachedCloseScenario(env) {
    const w = makeWorld(env);
    if (!(await attached(w))) return [`detachedClose: the host did not attach (${refusalText(w) || 'no refusal'})`];
    w.orcad.command('page-1', createPage('wt-1'));
    await w.clock.advance(1000);
    w.orcad.drop();
    await w.clock.advance(100);
    for (const widget of [...w.widgets.values()]) widget.close();
    await w.clock.advance(100);
    if (!(await attached(w))) return [`detachedClose: the re-attach failed (${refusalText(w) || 'no refusal'})`];
    await w.clock.advance(1000);
    const close = w.orcad.tabCloses.find(c => c.page === 'page-1');
    const inventory = w.orcad.attaches[1]?.params.pageInventory ?? [];
    const fails = [];
    if (!close || close.worktree !== 'id:wt-1') fails.push(`detachedClose: a user close while the host was detached reached orcad as ${JSON.stringify(close ?? 'nothing')} after the re-attach; expected browser.tabClose for page-1 in id:wt-1`);
    if (inventory.some(p => p.browserPageId === 'page-1')) fails.push('detachedClose: the closed page is still in the re-attach inventory');
    return fails;
}

async function duplicateScenario(env) {
    const w = makeWorld(env);
    if (!(await attached(w))) return [`duplicate: the host did not attach (${refusalText(w) || 'no refusal'})`];
    const first = w.orcad.command('page-2', createPage('wt-2'));
    const second = w.orcad.command('page-2', createPage('wt-2'));
    await w.clock.advance(1000);
    const outcomes = [w.orcad.results.get(first.commandId)?.status, w.orcad.results.get(second.commandId)?.status].sort().join(',');
    const fails = [];
    if (outcomes !== 'completed,failed') fails.push(`duplicate: two createPage for one id answered ${outcomes}; expected one completed, one failed`);
    const stored = JSON.parse(w.storage.get('powerbrowser.orca-browser.bound-pages') ?? '{}');
    if (!('page-2' in stored)) fails.push("duplicate: the losing tab's close erased the bound page's sessionStorage entry");
    w.orcad.drop();
    await w.clock.advance(100);
    if (!(await attached(w))) return [...fails, `duplicate: the re-attach failed (${refusalText(w) || 'no refusal'})`];
    if (!(w.orcad.attaches[1]?.params.pageInventory ?? []).some(p => p.browserPageId === 'page-2')) fails.push("duplicate: the losing tab's close removed the bound page from the inventory");
    for (const widget of [...w.widgets.values()]) widget.close();
    await w.clock.advance(1000);
    const close = w.orcad.tabCloses.find(c => c.page === 'page-2');
    if (!close || close.worktree !== 'id:wt-2') fails.push(`duplicate: the bound tab's user close reached orcad as ${JSON.stringify(close ?? 'nothing')}; expected browser.tabClose for page-2 in id:wt-2`);
    return fails;
}

// The link over Orca's real credential cache.
function makeLinkWorld(env) {
    const clock = makeClock();
    const events = new EventTarget();
    const state = { env: environment(1) };
    const sandbox = {
        console, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, Event, TextEncoder,
        addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
    };
    sandbox.window = sandbox;
    const context = vm.createContext(sandbox);
    const loader = makeLoader({
        ts: env.ts, files: env.files, context,
        stubs: {
            'src/renderer/src/web/web-runtime-environment': { readStoredWebRuntimeEnvironment: () => state.env },
            'src/renderer/src/web/web-device-key-support': { readWebDeviceKeySupport: () => 'device-key' },
            'src/renderer/src/web/web-device-key-store': { createIndexedDbWebDeviceKeyStore: () => ({}), createMemoryWebDeviceKeyStore: () => ({}) },
            'src/renderer/src/web/web-runtime-credential-source': {
                createWebRuntimeCredentialSource: o => ({ forgetPairing: o.forgetPairing, forgetStoredToken: o.forgetStoredToken, nextPlan: async () => ({ kind: 'legacy-token', deviceToken: o.environment.deviceToken }) }),
                tokenOnlyCredentialSource: token => ({ nextPlan: async () => ({ kind: 'legacy-token', deviceToken: token }) }),
            },
        },
    });
    const credentials = loader.load(REL.credentials);
    const pane = { forgetStoredToken: () => undefined, forgetPairing: () => undefined };
    let statusCalls = 0;
    sandbox.api = {
        runtimeEnvironments: {
            // The pane client's status call: its WebRuntimeClient is built with credentialFor(environment), as
            // web-runtime-session.ts does, so the source is created under the pane client's own callbacks.
            getStatus: async () => { statusCalls += 1; credentials.webRuntimeCredentialFor(state.env, pane); return { ok: true }; },
            prepareBrowserClientHostPlacement: async () => ({ kind: 'server' }),
        },
    };
    loader.load(REL.link);
    const link = sandbox[LINK_KEY];
    return { clock, state, link, credentials, pane, api: sandbox.api.runtimeEnvironments, statusCalls: () => statusCalls };
}
function environment(revision) {
    return { id: 'env-1', name: 'Orca Server', createdAt: 1, pairingRevision: revision, preferredEndpointId: 'e1', endpoints: [{ id: 'e1', endpoint: 'ws://127.0.0.1:1/', publicKeyB64: 'host-key', deviceToken: `token-${revision}` }] };
}

async function placementScenario(env) {
    const w = makeLinkWorld(env);
    const fails = [];
    const placed = async () => JSON.stringify(await w.api.prepareBrowserClientHostPlacement());
    w.link.setPlacement('pb-host-a');
    const a = await placed();
    let refused = false;
    try { w.link.setPlacement('pb-host-b'); } catch { refused = true; }
    const afterB = await placed();
    if (!refused || afterB !== a) fails.push(`placement: after the host placed pb-host-a, setPlacement('pb-host-b') was ${refused ? 'refused' : 'accepted'} and the placement is ${afterB}`);
    w.link.setPlacement(null);
    const server = await placed();
    w.link.setPlacement('pb-host-a');
    const again = await placed();
    if (server !== JSON.stringify({ kind: 'server' }) || again !== a) fails.push(`placement: null then the bound id again gave ${server} then ${again}`);
    return fails;
}

async function credentialScenario(env) {
    const w = makeLinkWorld(env);
    const fails = [];
    await w.clock.advance(2000);
    const sourceIsPane = () => w.credentials.webRuntimeCredentialFor(w.state.env, { forgetStoredToken: () => 'probe', forgetPairing: () => 'probe' }).forgetPairing === w.pane.forgetPairing;
    try { await w.link.connection(); } catch (error) { return [`credential: the link never became ready (${error.message})`]; }
    if (!sourceIsPane()) fails.push("credential: before any re-pair the source is not the pane client's");
    w.state.env = environment(2); // a re-pair; the pane client has made no call under it yet
    let early = 'resolved';
    try { await w.link.connection(); } catch (error) { early = error.message; }
    await w.clock.advance(3000);
    try { await w.link.connection(); } catch (error) { return [...fails, `credential: after the re-pair the link stayed not ready (${error.message})`]; }
    if (!sourceIsPane()) fails.push(`credential: after a re-pair the link read the credential before the pane client did (it answered ${early}), so the cached source carries the link's no-op callbacks and the pane client's token cleanup and revocation handling are lost`);
    return fails;
}

const SCENARIOS = [
    ['metadata', metadataScenario], ['reattach', reattachScenario], ['timeout', timeoutScenario], ['budget', budgetScenario],
    ['startDeadline', startDeadlineScenario], ['detachedClose', detachedCloseScenario], ['duplicate', duplicateScenario],
    ['placement', placementScenario], ['credential', credentialScenario],
];

async function evaluate(files) {
    const ts = loadTypescript();
    const zod = loadZod();
    const schemas = makeSchemas(ts, zod);
    const consts = derived(files);
    const env = { ts, zod, schemas, files };
    const fails = [];
    for (const [clause, run] of SCENARIOS) {
        try {
            fails.push(...await run(env, consts));
        } catch (error) {
            if (error instanceof FixtureError) throw error;
            fails.push(`${clause}: threw ${error?.message ?? error}`);
        }
    }
    return { fails, methods: schemas.count };
}

function skipReason() {
    if (!existsSync(join(REPO_ROOT, 'orca', 'src'))) return 'no fetched Orca tree (orca/src absent); run scripts/fetch-orca.sh';
    if (!loadZod()) return 'orca/node_modules/zod is not installed';
    if (!loadTypescript()) return 'theia/node_modules/typescript is not installed';
    return null;
}

const readAll = () => Object.fromEntries(['frontend', 'dispatch', 'wire', 'host', 'link'].map(k => [REL[k], readFileSync(join(REPO_ROOT, REL[k]), 'utf8')]));

function sub(rel, from, to) {
    return files => {
        if (!files[rel].includes(from)) throw new Error(`plant anchor not found in ${rel}: ${from.slice(0, 80)}`);
        files[rel] = files[rel].replace(from, to);
    };
}

const PLANTS = [
    { name: '66-CR-02: the frontend sends url and title only and the host forwards the flags unchecked', clause: 'metadata', edits: [
        sub(REL.frontend, 'const metadata = pageMetadataOf(detail);', "const metadata = typeof detail.url === 'string' ? { url: detail.url, title: typeof detail.title === 'string' ? detail.title : '' } as PageMetadata : undefined;"),
        sub(REL.host, 'loading: metadata.loading === true,\n          canGoBack: metadata.canGoBack === true,\n          canGoForward: metadata.canGoForward === true', 'loading: metadata.loading,\n          canGoBack: metadata.canGoBack,\n          canGoForward: metadata.canGoForward'),
    ] },
    { name: '66-CR-02: the url and title caps dropped', clause: 'metadata', edits: [
        sub(REL.wire, 'url: detail.url.slice(0, PAGE_METADATA_URL_MAX),', 'url: detail.url,'),
        sub(REL.host, "url: String(metadata.url ?? '').slice(0, PAGE_METADATA_URL_MAX),", 'url: metadata.url,'),
    ] },
    { name: '66-CR-02: a refused update swallowed', clause: 'metadata', edits: [
        sub(REL.frontend, ".catch(() => console.warn(`${LOG_PREFIX} a page metadata update was not taken`));", '.catch(() => undefined);'),
    ] },
    { name: '66-CR-03: a new host id per attach and an unfiltered inventory', clause: 'reattach', edits: [
        sub(REL.frontend, 'const browserHostClientId = this.browserHostClientId;', 'const browserHostClientId = `pb-host-${crypto.randomUUID()}`;'),
        sub(REL.wire, 'return pages.filter(({ event }) => event.browserHostClientId === browserHostClientId).slice', 'return pages.slice'),
    ] },
    { name: '66-CR-03: a new host id per attach (inventory filtered)', clause: 'reattach', edits: [
        sub(REL.frontend, 'const browserHostClientId = this.browserHostClientId;', 'const browserHostClientId = `pb-host-${crypto.randomUUID()}`;'),
    ] },
    { name: "66-CR-03: a reclaim leaves the page's old authority in the inventory", clause: 'reattach', edits: [
        sub(REL.wire, "    if (event.command.type !== 'reclaimPage' && event.command.type !== 'restorePage') {\n        return previous;\n    }\n", '    return previous;\n'),
    ] },
    { name: "66-CR-04: agent calls on the web tab channel's acknowledgement timeout", clause: 'timeout', edits: [
        sub(REL.frontend, "agentCall: (tabId, method, params) => this.agentRequest({ kind: 'webTabAgent', tabId, method, params }),", "agentCall: (tabId, method, params) => this.channel.request({ kind: 'webTabAgent', tabId, method, params }),"),
    ] },
    { name: '66-CR-04: a local timeout answered browser_error', clause: 'timeout', edits: [
        sub(REL.dispatch, "return failed(reply?.reason === 'timeout' ? 'browser_timeout' : 'browser_error');", "return failed('browser_error');"),
    ] },
    { name: "66-CR-04: the host's deadline shorter than chrome's", clause: 'timeout', edits: [
        sub(REL.wire, 'export const AGENT_CALL_MIN_TIMEOUT_MS = 35_000;', 'export const AGENT_CALL_MIN_TIMEOUT_MS = 30_000;'),
    ] },
    { name: '66-WR-04: no budget and no retry', clause: 'budget', edits: [
        sub(REL.frontend, 'const outcome = boundedOutcome(await dispatchCommand(event, this.deps(event)));', 'const outcome = await dispatchCommand(event, this.deps(event));'),
        sub(REL.frontend, "if (outcome.status === 'completed' && event.command?.type === 'automation') {", 'if (false) {'),
    ] },
    { name: '66-WR-02: no deadline on the start steps', clause: 'startDeadline', edits: [
        sub(REL.wire, 'export const START_STEP_DEADLINE_MS = 60_000;', 'export const START_STEP_DEADLINE_MS = 1e12;'),
    ] },
    { name: '66-WR-03: the entry deleted before the close is sent', clause: 'detachedClose', edits: [
        sub(REL.frontend, '        this.pages.table.drop(pageId);\n        this.bound.delete(pageId);\n        const session = this.session;', '        this.pages.table.drop(pageId);\n        this.bound.delete(pageId);\n        this.forgetBoundPage(pageId);\n        const session = this.session;'),
    ] },
    { name: "66-WR-05: records written before the bind, and any close erases them", clause: 'duplicate', edits: [
        sub(REL.dispatch, '            const bound = table.bind(pageId, tabId);\n            if (bound === \'bound\') {\n                deps.recordBound?.(tabId);', '            deps.recordBound?.(tabId);\n            const bound = table.bind(pageId, tabId);\n            if (bound === \'bound\') {'),
        sub(REL.frontend, '            if (this.pages.table.tabOf(pageId) === undefined) {\n                this.bound.delete(pageId);\n                this.forgetBoundPage(pageId);\n            }\n            return;', '            this.bound.delete(pageId);\n            this.forgetBoundPage(pageId);\n            return;'),
    ] },
    { name: 'T-66-04: setPlacement takes any id', clause: 'placement', edits: [
        sub(REL.link, "  if (browserHostClientId !== null && placedHostId !== null && browserHostClientId !== placedHostId) {\n    throw new Error('placement_refused')\n  }\n", ''),
    ] },
    { name: '66-WR-01: readiness never re-armed after a re-pair', clause: 'credential', edits: [
        sub(REL.link, '  if (credentialKey(environment) !== readyKey) {', '  if (false) {'),
    ] },
];

async function main() {
    const selfTest = process.argv.includes('--self-test');
    const skip = skipReason();
    if (skip) { console.log(`${NAME}${selfTest ? ' self-test' : ''}: SKIP -- ${skip}`); return 0; }
    if (!selfTest) {
        const { fails, methods } = await evaluate(readAll());
        if (fails.length) {
            console.error(`${NAME}: FAIL -- the browser host's wire or its page records drift from the pinned orcad:`);
            for (const f of fails) console.error(`  ${f}`);
            return 1;
        }
        console.log(`${NAME}: PASS -- ${SCENARIOS.length} clauses hold (${SCENARIOS.map(([c]) => c).join(', ')}); every request validated with the schema orcad declares (${methods} methods derived)`);
        return 0;
    }
    let failed = 0;
    const control = await evaluate(readAll());
    if (control.fails.length) {
        console.error(`${NAME} self-test: FAIL -- the unmodified tree is already red, so the plants prove nothing:`);
        for (const f of control.fails) console.error(`  ${f}`);
        return 1;
    }
    console.log('  ok control green');
    for (const plant of PLANTS) {
        const files = readAll();
        try {
            for (const edit of plant.edits) edit(files);
        } catch (error) {
            console.error(`  FAIL ${plant.name}: ${error.message}`);
            failed += 1;
            continue;
        }
        const { fails } = await evaluate(files);
        const named = fails.filter(f => f.startsWith(`${plant.clause}:`));
        if (named.length) console.log(`  red as required: ${plant.name} -> ${named[0].slice(0, 160)}`);
        else { console.error(`  FAIL ${plant.name}: clause ${plant.clause} stayed green${fails.length ? ` (other reds: ${fails.join(' | ').slice(0, 200)})` : ''}`); failed += 1; }
    }
    if (failed) { console.error(`${NAME} self-test: FAIL -- ${failed} of ${PLANTS.length} plants`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length} plants each red on their clause`);
    return 0;
}

main().then(code => process.exit(code), error => {
    console.error(`${NAME}: FAIL -- ${error instanceof FixtureError ? 'fixture: ' : ''}${error?.stack ?? error}`);
    process.exit(1);
});
