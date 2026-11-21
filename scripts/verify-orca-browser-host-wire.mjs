#!/usr/bin/env node
// scripts/verify-orca-browser-host-wire.mjs
//
// orca-browser-host-wire (v1.7 audit fix lane G1b; 66-CR-02, 66-CR-03, 66-CR-04, 66-WR-01..05, T-66-04): the
// PowerBrowser browser host, run end to end in Node against the pinned orcad's own browser-host code, puts on the wire
// only what that orcad accepts, and keeps its pages, its placement and its deadlines across detaches and restarts.
//
// What runs (transpiled with theia/node_modules/typescript and evaluated in vm contexts on one virtual clock):
//  - @powerbrowser/orca-browser's frontend module (OrcaBrowserHost, OrcaBrowserPages) with its real dispatcher and
//    wire helpers; Theia's DI, shell and web tab channel are stubs, and chrome is a scripted responder on the bridge's
//    PowerBrowserGroupRequest / PowerBrowserGroupResponse events;
//  - the shipped thin host bundle (pb-browser-host.ts) over a fake WebSocket, with Orca's pairing handshake stubbed
//    to plain text and every other import Orca's own pinned module;
//  - the shipped link (pb-browser-host-link.ts) over Orca's real web-runtime-credentials.ts, with the stored
//    environment, credential source and key store stubbed;
//  - orcad: the pinned BROWSER_CLIENT_HOST_METHODS handlers (orca/src/main/runtime/rpc/methods/browser-client-host.ts)
//    with the real lease registry, page registry, adoption, recovery and reconciliation they import. Requests are
//    parsed with each method's declared params schema as orcad's dispatcher parses them (`params ?? {}`), and pages are
//    created and driven through the registry's own createClientPage and issueClientPageCommand. status.get and
//    browser.tabClose, whose handlers need the whole runtime, are validated with their declared schema (derived from
//    orca/src/main/runtime/rpc/methods/*.ts) and answered by the fixture. Events the fixture injects (cases orcad
//    itself never produces) are first validated with Orca's BrowserClientHostCommandEvent.
// Derived constants: chrome's default agent wait (GroupActorChild.sys.mjs), chrome's settle (PowerBrowserAPI.sys.mjs
// AGENT_SETTLE_BEAT_MS + AGENT_SETTLE_MAX_MS), Orca's forwarding hop (browser-wait-timeout.ts), the web tab channel's
// acknowledgement timeout (web-tab.ts WEB_TAB_ACK_TIMEOUT_MS) and the inventory byte budget (browser-client-host-
// protocol.ts). The virtual clock fires a delay above 2^31 - 1 ms at once, as browser timers do.
//
// Clauses:
//  metadata        66-CR-02: page state pushes of a bound tab update orcad's page (a long url and title, and a push
//                  with no flags, included); a refused update is logged.
//  metadataReattach 66-CR-02 review: after a dropped socket the host re-attaches inside orcad's reconnect grace and a
//                  later navigation still updates orcad's page.
//  restart         66-CR-03: after an orcad restart with an agent tab open, orcad's reconciliation (close then
//                  restore) leaves the page on a new agent tab with its pane row, metadata reaches the new orcad, and
//                  after a further drop the inventory names the restored authority, so the page and its tab stay.
//  lostResult      66-CR-03 review: when a reclaim's result is lost (injected: the pinned orcad reclaims only across
//                  epochs of one runtime), the next inventory still names the authority orcad last accepted, and the
//                  page keeps its tab and its metadata path.
//  timeout         66-CR-04: an agent wait and an Orca navigate that chrome answers after the acknowledgement timeout
//                  complete; a timeout past the timer limit is lowered and still completes; the host's deadline lies
//                  between chrome's and Orca's forwarding hop; a command chrome never answers fails browser_timeout.
//  budget          66-WR-04: a completed value over Orca's result budget is answered with a result orcad accepts.
//  startDeadline   66-WR-02: with no link, and with a link that never becomes ready, the attach fails and logs the step.
//  detachedClose   66-WR-03: a user close while detached reaches orcad after re-attach; a createPage for that page
//                  opens nothing; a close orcad refuses is not sent again.
//  duplicate       66-WR-05: a losing duplicate createPage leaves the winner's records.
//  closeBeforeBind 66-WR-05 review: a tab closed between chrome's reply and the bind fails createPage, sends no user
//                  close and leaves no pane row.
//  inventoryBudget 66-CR-03 review: many bound tabs with long urls still re-attach inside Orca's inventory limits,
//                  and the pages left out are logged and their tabs closed.
//  chromeStatus    G1a round 2: with Stop held in chrome, a bound tab's navigate and automation fail
//                  browser_owner_unavailable; after a reload with only a restored agent row (chrome's agent status, no
//                  widget flag), createPage fails and opens no tab.
//  placement       T-66-04: a placement made before the host attaches is replaced by the host's own attach, the host
//                  ends attached, and a detach puts placement back on the server; a capability holds one id only.
//  credential      66-WR-01: after a re-pair, the credential source the link reads is the one the pane client created.
//
// --self-test plants each pre-fix fault in an in-memory copy and requires its clause red, naming the drift.
// Tier: quick. Hermetic (no network, no display, no browser). One named SKIP when orca/src, orca/node_modules/zod or
// theia/node_modules/typescript is absent.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as nodeCrypto from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { setMaxListeners } from 'node:events';

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
    hostMethods: 'orca/src/main/runtime/rpc/methods/browser-client-host.ts',
    leaseInstance: 'orca/src/main/runtime/browser-host/browser-host-lease-registry-instance.ts',
    pageRegistry: 'orca/src/main/runtime/runtime-browser-page-registry.ts',
    credentials: 'orca/src/renderer/src/web/preload-api/web-runtime-credentials.ts',
};
const LINK_KEY = Symbol.for('powerbrowser.orca-browser.link');
const HOST_MODULE_KEY = Symbol.for('powerbrowser.orca-browser.host-module');
const PANES_MODULE_KEY = Symbol.for('powerbrowser.orca-panes.module');
const DEVICE = 'device-1';
const TIMER_MAX = 2 ** 31 - 1;

class FixtureError extends Error {}

function loadTypescript() {
    try { return createRequire(join(REPO_ROOT, 'theia', 'package.json'))('typescript'); } catch { return undefined; }
}
function loadZod() {
    try { return createRequire(join(REPO_ROOT, 'orca', 'package.json'))('zod'); } catch { return undefined; }
}
function isFile(p) {
    try { return statSync(p).isFile(); } catch { return false; }
}

// ---------------------------------------------------------------------------------------------------------------
// Module loader: TypeScript -> CommonJS in a given vm context. An overlay file stands in for orca/<path>; a stub is
// keyed by its orca-relative path without extension ('src/shared/x') or by its bare specifier. Transpiled text is
// cached by path and source, so each world evaluates fresh module state cheaply.
// ---------------------------------------------------------------------------------------------------------------
const TRANSPILED = new Map();
function makeLoader({ ts, files, context, stubs = {}, bare = {} }) {
    const cache = new Map();
    const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    const textOf = abs => (has(files, relative(REPO_ROOT, abs)) ? files[relative(REPO_ROOT, abs)] : readFileSync(abs, 'utf8'));
    const exists = abs => has(files, relative(REPO_ROOT, abs)) || isFile(abs);
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
        if (key && has(stubs, key)) return { stub: stubs[key] };
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
        const text = textOf(abs);
        const key = `${abs}\0${text}`;
        let out = TRANSPILED.get(key);
        if (out === undefined) {
            out = ts.transpileModule(text, {
                fileName: abs,
                compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true, esModuleInterop: true },
            }).outputText;
            TRANSPILED.set(key, out);
        }
        const fn = vm.runInContext(`(function (exports, require, module, __filename, __dirname) {${out}\n})`, context, { filename: abs });
        const req = spec => {
            if (has(bare, spec)) return bare[spec];
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

// ---------------------------------------------------------------------------------------------------------------
// Declared params schemas of every orcad method, derived from the pinned source (for the methods the fixture answers).
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
    const protocol = shared('browser-client-host-protocol.ts');
    return {
        count: methods.size,
        validate(method, params) {
            const { schema, error } = schemaOf(method);
            if (error) return { ok: false, issues: error };
            if (schema === null) return { ok: true };
            const parsed = schema.safeParse(params ?? {});
            return parsed.success ? { ok: true } : { ok: false, issues: issuesOf(parsed.error) };
        },
        commandEvent: protocol.BrowserClientHostCommandEvent,
        inventoryMaxBytes: protocol.BROWSER_CLIENT_HOST_PAGE_INVENTORY_MAX_BYTES,
        waitHop: shared('browser-wait-timeout.ts').browserWaitRequestTimeoutMs,
    };
}
const issuesOf = error => error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');

// ---------------------------------------------------------------------------------------------------------------
// Virtual clock. A delay above the 32-bit timer limit fires at once, as browser and Node timers do.
// ---------------------------------------------------------------------------------------------------------------
const flush = async () => { for (let i = 0; i < 40; i += 1) await new Promise(r => setImmediate(r)); };
function makeClock() {
    let now = 0;
    let seq = 0;
    const timers = new Map();
    const delay = ms => { const n = Number(ms) || 0; return n > TIMER_MAX || n < 0 ? 0 : n; };
    const clock = {
        setTimeout: (fn, ms = 0, ...args) => { const id = (seq += 1); timers.set(id, { at: now + delay(ms), fn, args }); return { id, unref() { return this; }, ref() { return this; }, [Symbol.toPrimitive]: () => id }; },
        clearTimeout: handle => { timers.delete(typeof handle === 'object' && handle ? handle.id : handle); },
        setInterval: (fn, ms = 0, ...args) => {
            const id = (seq += 1);
            const every = Math.max(1, delay(ms));
            const arm = at => timers.set(id, { at, fn: () => { arm(now + every); fn(...args); }, args: [] });
            arm(now + every);
            return { id, unref() { return this; }, ref() { return this; }, [Symbol.toPrimitive]: () => id };
        },
        get now() { return now; },
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
    clock.clearInterval = clock.clearTimeout;
    return clock;
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
// orcad: the pinned browser-host handlers and registries, one instance per runtime (a restart makes a new one).
// ---------------------------------------------------------------------------------------------------------------
class UpstreamRuntime {
    constructor({ ts, zod, clock, runtimeId, warnings }) {
        const quiet = { log() {}, info() {}, debug() {}, warn: (...a) => warnings.push(a.map(String).join(' ')), error: (...a) => warnings.push(a.map(String).join(' ')) };
        const context = vm.createContext({
            console: quiet, TextEncoder, TextDecoder, URL, AbortController, AbortSignal, Buffer, queueMicrotask, structuredClone, process,
            setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, clearInterval: clock.clearInterval,
        });
        const loader = makeLoader({ ts, files: {}, context, bare: { zod, 'node:crypto': nodeCrypto } });
        this.runtimeId = runtimeId;
        this.cleanups = [];
        this.runtime = {
            getRuntimeId: () => runtimeId,
            notifyMobileSessionTabsChanged() {},
            retireRuntimeOwnedBrowserSessionTab() {},
            markClientHostedPagesReconciled() {},
            resolveBrowserExecutionHostKeyForWorkspace: async () => ({ status: 'resolved', executionHostKey: 'local' }),
            registerSubscriptionCleanup: (id, fn, connectionId) => { this.cleanups.push({ id, fn, connectionId }); },
        };
        this.methods = new Map(loader.load(REL.hostMethods).BROWSER_CLIENT_HOST_METHODS.map(m => [m.name, m]));
        this.registry = loader.load(REL.leaseInstance).getBrowserHostLeaseRegistry(this.runtime);
        this.pages = loader.load(REL.pageRegistry).getRuntimeBrowserPageRegistry(this.runtime);
        this.automationCapability = loader.load('orca/src/shared/browser-client-automation-protocol.ts').BROWSER_CLIENT_AUTOMATION_HOST_CAPABILITY;
    }
}

class Orcad {
    constructor(env, clock) {
        this.env = env;
        this.clock = clock;
        this.warnings = [];
        this.refusals = [];
        this.calls = [];
        this.attaches = [];
        this.tabCloses = [];
        this.injectedResults = new Map();
        this.refuse = new Set();
        this.sockets = new Set();
        this.restarts = 0;
        this.injected = 0;
        this.connections = 0;
        this.up = this.newRuntime();
    }
    newRuntime() {
        this.restarts += 1;
        return new UpstreamRuntime({ ts: this.env.ts, zod: this.env.zod, clock: this.clock, runtimeId: `runtime-${this.restarts}`, warnings: this.warnings });
    }
    reply(ws, frame) { this.clock.setTimeout(() => { if (!ws.closed) ws.onmessage?.({ data: JSON.stringify(frame) }); }, 0); }
    connect(ws) {
        ws.stage = 'hello';
        ws.connectionId = `connection-${(this.connections += 1)}`;
        ws.streams = [];
        ws.up = this.up;
        this.sockets.add(ws);
        this.ws = ws;
    }
    disconnect(ws) {
        this.sockets.delete(ws);
        for (const stream of ws.streams) stream.abort();
        for (const c of ws.up.cleanups.filter(c => c.connectionId === ws.connectionId)) {
            try { c.fn(); } catch { /* the handler's own cleanup */ }
        }
    }
    receive(ws, text) {
        if (ws.stage === 'hello') { ws.stage = 'auth'; this.clock.setTimeout(() => ws.onmessage?.({ data: 'ready-text' }), 0); return; }
        if (ws.stage === 'auth') { ws.stage = 'open'; ws.capabilities = this.env.lastCapabilities ?? []; this.clock.setTimeout(() => ws.onmessage?.({ data: 'authed' }), 0); return; }
        const { id, method, params } = JSON.parse(text);
        this.calls.push({ method, params });
        const refuse = code => this.reply(ws, { id, ok: false, error: { code } });
        if (this.refuse.has(method)) return refuse('refused_by_scenario');
        const up = ws.up;
        const definition = up.methods.get(method);
        if (method === 'browser.clientHost.commandResult' && String(params?.commandId).startsWith('injected-')) {
            const check = this.env.schemas.validate(method, params);
            if (!check.ok) { this.refusals.push({ method, issues: check.issues }); return refuse('invalid_argument'); }
            this.injectedResults.set(params.commandId, params.result);
            return this.reply(ws, { id, ok: true, result: { accepted: true } });
        }
        if (!definition) {
            const check = this.env.schemas.validate(method, params);
            if (!check.ok) { this.refusals.push({ method, issues: check.issues }); return refuse('invalid_argument'); }
            if (method === 'status.get') return this.reply(ws, { id, ok: true, result: {}, _meta: { runtimeId: up.runtimeId } });
            if (method === 'browser.tabClose') this.tabCloses.push(params);
            return this.reply(ws, { id, ok: true, result: {} });
        }
        const parsed = definition.params ? definition.params.safeParse(params ?? {}) : { success: true, data: undefined };
        if (!parsed.success) { this.refusals.push({ method, issues: issuesOf(parsed.error) }); return refuse('invalid_argument'); }
        const ctx = { runtime: up.runtime, connectionId: ws.connectionId, pairedDeviceId: DEVICE, clientKind: 'runtime', clientCapabilities: ws.capabilities };
        if (definition.stream) {
            const controller = new AbortController();
            ws.streams.push(controller);
            ws.attachId = id;
            const record = { params, ready: undefined, connectionId: ws.connectionId, runtimeId: up.runtimeId };
            this.attaches.push(record);
            const emit = value => {
                if (value?.type === 'ready') { record.ready = value; this.lease = { ...value, browserHostClientId: params.browserHostClientId, up }; }
                this.reply(ws, { id, ok: true, result: value });
            };
            Promise.resolve()
                .then(() => definition.handler(parsed.data, { ...ctx, signal: controller.signal }, emit))
                .then(() => this.reply(ws, { id, ok: true, result: { type: 'end' } }), error => {
                    if (!controller.signal.aborted) this.refusals.push({ method, issues: error?.message ?? String(error) });
                    this.reply(ws, { id, ok: false, error: { code: error?.message ?? 'error' } });
                });
            return;
        }
        Promise.resolve().then(() => definition.handler(parsed.data, ctx)).then(
            result => this.reply(ws, { id, ok: true, result }),
            error => { this.refusals.push({ method, issues: error?.message ?? String(error) }); refuse(error?.message ?? 'error'); });
    }
    /** A page created as orcad creates one on a client host, then published as the page registry's record. */
    createPage(browserPageId, workspaceId) {
        const { up, browserHostClientId, authorityEpoch, browserHostGeneration } = this.lease;
        const identity = { authorityEpoch, browserHostClientId, browserHostGeneration, pairedDeviceId: DEVICE };
        try { up.registry.grantExecutionHost(identity, 'local'); } catch { /* granted already */ }
        return up.registry.createClientPage({
            browserPageId, browserHostClientId, pairedDeviceId: DEVICE, browserProfileId: 'default', executionHostKey: 'local',
            requiredCapabilities: [up.automationCapability], workspaceId,
        }).then(placement => {
            up.pages.publishClientPage({ browserPageId, workspaceId, browserProfileId: 'default', executionHostKey: 'local', placement, pairedDeviceId: DEVICE, url: 'about:blank', loading: false, active: false });
            return { ok: true, placement };
        }, error => ({ ok: false, error: error?.message ?? String(error) }));
    }
    /** One page command through the registry, as orcad's browser methods issue it. Resolves with orcad's result. */
    command(browserPageId, command) {
        const up = this.up;
        const placement = up.registry.getPlacement(browserPageId);
        if (placement?.kind !== 'client') return Promise.resolve({ status: 'failed', errorCode: 'fixture_no_placement' });
        const authority = {
            authorityRuntimeId: up.runtimeId, authorityEpoch: up.registry.authorityEpoch, browserPageId,
            browserHostClientId: placement.browserHostClientId, browserHostGeneration: placement.browserHostGeneration, pageHostGeneration: placement.pageHostGeneration,
        };
        try {
            return up.registry.issueClientPageCommand(authority, command).result.catch(error => ({ status: 'failed', errorCode: error?.message ?? 'error' }));
        } catch (error) {
            return Promise.resolve({ status: 'failed', errorCode: error?.message ?? 'error' });
        }
    }
    page(browserPageId) { return this.up.pages.getPage(browserPageId); }
    /** An event orcad itself never sends (a duplicate createPage, a createPage for a closed page), validated first. */
    inject(browserPageId, command, pageHostGeneration = 1) {
        const { authorityEpoch, browserHostGeneration, browserHostClientId, up } = this.lease;
        this.injected += 1;
        const event = {
            type: 'command', authorityRuntimeId: up.runtimeId, authorityEpoch, browserHostClientId, browserHostGeneration,
            pageCommandProtocolVersion: 1, pageReconciliationProtocolVersion: 1, browserPageId, pageHostGeneration,
            commandSequence: 1_000_000 + this.injected, commandId: `injected-${this.injected}`, command,
        };
        const parsed = this.env.schemas.commandEvent.safeParse(event);
        if (!parsed.success) throw new FixtureError(`an injected ${command.type} event is refused by BrowserClientHostCommandEvent: ${issuesOf(parsed.error)}`);
        this.reply(this.ws, { id: this.ws.attachId, ok: true, result: event });
        return event;
    }
    drop() { this.ws?.dropFromServer(); }
    restart() {
        for (const ws of [...this.sockets]) ws.dropFromServer();
        this.up = this.newRuntime();
    }
}

// ---------------------------------------------------------------------------------------------------------------
// World: the frontend host, the thin host bundle, the link, orcad and a scripted chrome.
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
function environment(revision) {
    return { id: 'env-1', name: 'Orca Server', createdAt: 1, pairingRevision: revision, preferredEndpointId: 'e1', endpoints: [{ id: 'e1', endpoint: 'ws://127.0.0.1:1/', publicKeyB64: 'host-key', deviceToken: `token-${revision}` }] };
}
function linkStubs(state) {
    return {
        'src/renderer/src/web/web-runtime-environment': { readStoredWebRuntimeEnvironment: () => state.env },
        'src/renderer/src/web/web-device-key-support': { readWebDeviceKeySupport: () => 'device-key' },
        'src/renderer/src/web/web-device-key-store': { createIndexedDbWebDeviceKeyStore: () => ({}), createMemoryWebDeviceKeyStore: () => ({}) },
        'src/renderer/src/web/web-runtime-credential-source': {
            createWebRuntimeCredentialSource: o => ({ forgetPairing: o.forgetPairing, forgetStoredToken: o.forgetStoredToken, nextPlan: async () => ({ kind: 'legacy-token', deviceToken: o.environment.deviceToken }) }),
            tokenOnlyCredentialSource: token => ({ nextPlan: async () => ({ kind: 'legacy-token', deviceToken: token }) }),
        },
    };
}

function makeWorld({ ts, zod, schemas, files, link = 'ready', agent = () => ({ after: 5, reply: { ok: true, where: 'done', result: {} } }), closeOnOpen = () => false, chromeStop = { stopped: false } }) {
    const clock = makeClock();
    const events = new EventTarget();
    setMaxListeners(0, events);
    const logs = [];
    const storage = new Map();
    const env = { ts, zod, schemas, lastCapabilities: undefined };
    const orcad = new Orcad(env, clock);
    const agentCalls = [];
    let opens = 0;
    let uuid = 0;
    let tabs = 0;
    const widgets = new Map();
    const rows = new Set();
    class FakeWebSocket {
        constructor() { orcad.connect(this); clock.setTimeout(() => this.onopen?.(), 0); }
        send(text) { if (!this.closed) orcad.receive(this, text); }
        close() { if (this.closed) return; this.closed = true; orcad.disconnect(this); clock.setTimeout(() => this.onclose?.(), 0); }
        dropFromServer() { this.close(); }
    }
    const respond = (requestId, reply, after) => clock.setTimeout(() => events.dispatchEvent(new CustomEvent('PowerBrowserGroupResponse', { detail: { requestId, reply } })), after);
    const chrome = ev => {
        const { requestId, msg } = ev.detail ?? {};
        if (msg?.kind === 'webTabAgent') {
            agentCalls.push(msg);
            // Stop is chrome's, per shell window: every agent command is refused while it holds (G1a round 2).
            const plan = chromeStop.stopped ? { after: 5, reply: { ok: true, where: 'agent-stopped' } } : agent(msg);
            if (plan) respond(requestId, plan.reply, plan.after);
        } else if (msg) {
            respond(requestId, { ok: true }, 0);
        }
    };
    const handshake = {
        createPairedE2EEClientHandshake: () => ({
            helloText: () => 'hello',
            acceptReadyText: text => (text === 'ready-text' ? 'accepted' : 'refused'),
            sealAuth: async (_credential, options) => { env.lastCapabilities = options?.clientCapabilities; return 'auth'; },
            channel: { sealText: t => t, openText: t => t },
            classifyAuthReply: plain => (plain === 'authed' ? { kind: 'authenticated' } : { kind: 'pending' }),
        }),
    };
    const linkState = { env: environment(1), statusOk: link !== 'never-ready' };
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
        api: {
            runtimeEnvironments: {
                getStatus: async () => ({ ok: linkState.statusOk }),
                prepareBrowserClientHostPlacement: async () => ({ kind: 'server' }),
            },
        },
    };
    sandbox.window = sandbox;
    sandbox[PANES_MODULE_KEY] = { addBrowserPage: (_wt, id) => { rows.add(id); return true; }, removeBrowserPage: id => { rows.delete(id); } };
    const context = vm.createContext(sandbox);
    const loader = makeLoader({
        ts, files, context, bare: { ...theiaStubs(), zod },
        stubs: {
            'src/shared/paired-e2ee-client-handshake': handshake,
            'src/renderer/src/web/web-paired-e2ee-primitives': { WEB_PAIRED_E2EE_PRIMITIVES: {} },
            'src/shared/web-origin-security': { withWebClientUpgradeMarker: url => url },
            ...linkStubs(linkState),
        },
    });
    if (link) loader.load(REL.link);
    const frontend = loader.load(REL.frontend);
    sandbox[HOST_MODULE_KEY] = loader.load(REL.host);
    const makeWidget = () => {
        const tabId = `agent-tab-${(tabs += 1)}`;
        const listeners = [];
        const widget = {
            tabId, agent: true, isAttached: true, isDisposed: false, url: `https://example.com/${tabs}`, pageTitle: `Example ${tabs}`,
            loading: false, canGoBack: false, canGoForward: false, agentControl: { active: false, stopped: false, agent: true },
            disposed: { connect: fn => { listeners.push(fn); } },
            close() { if (widget.isDisposed) return; widget.isDisposed = true; widgets.delete(tabId); for (const fn of listeners) fn(); },
        };
        widget.opened = new Promise(r => clock.setTimeout(() => { r({ ok: true, where: chromeStop.stopped ? 'agent-stopped' : 'opened' }); if (closeOnOpen(widget)) widget.close(); }, 20));
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
        openHandler: { openAgentTab: async () => { opens += 1; return makeWidget(); } },
        shell: { onDidChangeActiveWidget() {}, getAreaFor: () => 'main', getCurrentWidget: () => undefined },
        widgetManager: { getWidgets: () => [...widgets.values()] },
        appState: { reachedState: async () => undefined },
    });
    const push = detail => { for (const h of pushes.state ?? []) h(detail); };
    const navigateTab = (tabId, url, title) => {
        const widget = widgets.get(tabId);
        if (widget) { widget.url = url; widget.pageTitle = title; }
        push({ tabId, url, title, loading: false, canGoBack: true, canGoForward: false });
    };
    const placement = () => sandbox.api.runtimeEnvironments.prepareBrowserClientHostPlacement();
    /** A restored agent row: chrome reports it an agent tab (and stopped, when Stop holds); its widget sent no flag. */
    const restoreAgentRow = () => {
        const widget = makeWidget();
        widget.agent = false;
        widget.agentControl = { active: false, stopped: chromeStop.stopped, agent: true };
        return widget;
    };
    return { clock, orcad, host, pages, widgets, rows, storage, logs, push, navigateTab, placement, agentCalls, restoreAgentRow, opens: () => opens, linkObject: () => sandbox[LINK_KEY] };
}

const refusalText = w => w.orcad.refusals.map(r => `${r.method} refused (${String(r.issues).slice(0, 160)})`).join('; ');

async function attached(w) {
    const done = w.host.attach();
    await w.clock.advance(1000);
    return done;
}
/** One page created by orcad on the attached host; resolves to its tab id. */
async function orcadPage(w, pageId, workspaceId = 'wt-1') {
    const created = w.orcad.createPage(pageId, workspaceId);
    await w.clock.advance(1000);
    const result = await created;
    if (!result.ok) throw new Error(`orcad's createPage for ${pageId} failed: ${result.error}${refusalText(w) ? `; ${refusalText(w)}` : ''}`);
    return w.pages.table.tabOf(pageId);
}
async function settled(w, promise, ms) {
    let value;
    let done = false;
    promise.then(v => { value = v; done = true; });
    await w.clock.advance(ms);
    return done ? value : { status: 'pending' };
}

// ---------------------------------------------------------------------------------------------------------------
// Scenarios. Each returns failure strings prefixed with its clause.
// ---------------------------------------------------------------------------------------------------------------
async function metadataScenario(env) {
    const fails = [];
    const w = makeWorld(env);
    if (!(await attached(w))) return [`metadata: the host did not attach (${refusalText(w) || 'no refusal'})`];
    const tabId = await orcadPage(w, 'page-1');
    w.push({ tabId, url: 'https://example.com/a', title: 'A', loading: true, canGoBack: true, canGoForward: false });
    await w.clock.advance(100);
    const first = w.orcad.page('page-1');
    if (first?.url !== 'https://example.com/a' || first?.title !== 'A' || first?.loading !== true) {
        fails.push(`metadata: after a state push orcad's page is ${JSON.stringify({ url: first?.url, title: first?.title, loading: first?.loading })} (${refusalText(w) || 'no refusal'})`);
    }
    w.push({ tabId, url: `https://example.com/${'u'.repeat(9000)}`, title: 't'.repeat(5000) });
    await w.clock.advance(100);
    const long = w.orcad.page('page-1');
    if (long?.url?.length !== 8192 || long?.title?.length !== 4096) fails.push(`metadata: a long url and title reached orcad as ${long?.url?.length ?? 'none'} and ${long?.title?.length ?? 'none'} characters (${refusalText(w) || 'no refusal'})`);
    w.orcad.refuse.add('browser.clientHost.pageMetadata');
    const before = w.logs.length;
    w.push({ tabId, url: 'https://example.com/b', title: 'B', loading: false, canGoBack: true, canGoForward: false });
    await w.clock.advance(100);
    if (!w.logs.slice(before).some(([, line]) => /metadata/i.test(line))) fails.push('metadata: a pageMetadata orcad refused was swallowed with no log line');
    return fails;
}

async function metadataReattachScenario(env) {
    const fails = [];
    const w = makeWorld(env);
    if (!(await attached(w))) return [`metadataReattach: the host did not attach (${refusalText(w) || 'no refusal'})`];
    const tabId = await orcadPage(w, 'page-1');
    w.navigateTab(tabId, 'https://example.com/before', 'Before');
    await w.clock.advance(100);
    w.orcad.drop();
    await w.clock.advance(3000);
    if (w.host.state !== 'attached' || w.orcad.attaches.length !== 2) {
        return [`metadataReattach: after a dropped socket the host is ${w.host.state} after ${w.orcad.attaches.length} attach(es); it re-attaches by itself inside orcad's reconnect grace (${refusalText(w) || 'no refusal'})`];
    }
    w.navigateTab(tabId, 'https://example.com/after', 'After');
    await w.clock.advance(100);
    const page = w.orcad.page('page-1');
    if (page?.url !== 'https://example.com/after') fails.push(`metadataReattach: a navigation after the re-attach left orcad's page at ${page?.url ?? 'no page'} (${refusalText(w) || 'no refusal'})`);
    return fails;
}

async function restartScenario(env) {
    const fails = [];
    const w = makeWorld(env);
    if (!(await attached(w))) return [`restart: the host did not attach (${refusalText(w) || 'no refusal'})`];
    const oldTab = await orcadPage(w, 'page-1');
    w.navigateTab(oldTab, 'https://example.com/before-restart', 'Before');
    await w.clock.advance(100);
    w.orcad.restart();
    await w.clock.advance(20_000);
    // Orca's reconciliation after a restart closes the page's old guest and restores the page (close then restore).
    const tabId = w.pages.table.tabOf('page-1');
    if (w.host.state !== 'attached' || !w.orcad.page('page-1') || !tabId || !w.widgets.has(tabId)) {
        return [`restart: after an orcad restart the host is ${w.host.state}, the new orcad ${w.orcad.page('page-1') ? 'has' : 'lacks'} the page, and the page is bound to ${tabId ?? 'no tab'} (${refusalText(w) || 'no refusal'})`];
    }
    if (!w.rows.has('page-1')) fails.push("restart: the restored page has no pane row");
    w.navigateTab(tabId, 'https://example.com/restarted', 'Restarted');
    await w.clock.advance(100);
    if (w.orcad.page('page-1')?.url !== 'https://example.com/restarted') fails.push(`restart: after the restore a navigation left the new orcad's page at ${w.orcad.page('page-1')?.url} (${refusalText(w) || 'no refusal'})`);
    const attachesBefore = w.orcad.attaches.length;
    w.orcad.drop();
    await w.clock.advance(20_000);
    const entry = w.orcad.attaches[attachesBefore]?.params.pageInventory?.find(p => p.browserPageId === 'page-1');
    if (!entry || entry.authorityRuntimeId !== w.orcad.up.runtimeId) fails.push(`restart: after the restore the next inventory names runtime ${entry?.authorityRuntimeId ?? '(no entry)'}, not the restoring ${w.orcad.up.runtimeId}`);
    if (w.pages.table.tabOf('page-1') !== tabId || !w.widgets.has(tabId)) fails.push(`restart: after a further drop the page is bound to ${w.pages.table.tabOf('page-1') ?? 'no tab'}, not its tab ${tabId}`);
    w.navigateTab(tabId, 'https://example.com/again', 'Again');
    await w.clock.advance(100);
    if (w.orcad.page('page-1')?.url !== 'https://example.com/again') fails.push(`restart: after a further drop a navigation left orcad's page at ${w.orcad.page('page-1')?.url ?? 'no page'} (${refusalText(w) || 'no refusal'})`);
    return fails;
}

async function lostResultScenario(env) {
    const w = makeWorld(env);
    if (!(await attached(w))) return [`lostResult: the host did not attach (${refusalText(w) || 'no refusal'})`];
    const tabId = await orcadPage(w, 'page-1');
    const { browserHostClientId, browserHostGeneration, up } = w.orcad.lease;
    // A reclaim (injected: the pinned orcad reclaims only across epochs of one runtime) whose result never lands.
    w.orcad.refuse.add('browser.clientHost.commandResult');
    w.orcad.inject('page-1', {
        type: 'reclaimPage',
        previousAuthority: { authorityRuntimeId: up.runtimeId, authorityEpoch: 'epoch-before', browserHostClientId, browserHostGeneration, pageHostGeneration: 1 },
        browserProfileId: 'default', executionHostKey: 'local', workspaceId: 'wt-1',
    }, 2);
    await w.clock.advance(1000);
    w.orcad.refuse.delete('browser.clientHost.commandResult');
    const attachesBefore = w.orcad.attaches.length;
    w.orcad.drop();
    await w.clock.advance(3000);
    const fails = [];
    const entry = w.orcad.attaches[attachesBefore]?.params.pageInventory?.find(p => p.browserPageId === 'page-1');
    if (!entry || entry.pageHostGeneration !== 1 || entry.authorityEpoch === 'epoch-before') {
        fails.push(`lostResult: after a reclaim whose result was lost the inventory names ${entry ? `page generation ${entry.pageHostGeneration}` : 'no entry'}; expected generation 1, the authority orcad last accepted`);
    }
    if (w.pages.table.tabOf('page-1') !== tabId || !w.widgets.has(tabId)) fails.push(`lostResult: after the re-attach the page is bound to ${w.pages.table.tabOf('page-1') ?? 'no tab'}, not its tab ${tabId}`);
    w.navigateTab(tabId, 'https://example.com/kept', 'Kept');
    await w.clock.advance(100);
    if (w.orcad.page('page-1')?.url !== 'https://example.com/kept') fails.push(`lostResult: after the re-attach a navigation left orcad's page at ${w.orcad.page('page-1')?.url ?? 'no page'} (${refusalText(w) || 'no refusal'})`);
    return fails;
}

async function timeoutScenario(env, consts) {
    const fails = [];
    const wire = makeWireModule(env);
    for (const t of [undefined, 0, 2000, 25000, 30000, 60000, 120000, 3_000_000_000]) {
        const ours = wire.agentCallTimeoutMs(t === undefined ? {} : { timeout: t });
        const sent = wire.agentParams(t === undefined ? {} : { timeout: t }).timeout;
        const chromeDeadline = (sent > 0 ? sent : consts.chromeWaitDefault) + consts.settle;
        const hop = env.schemas.waitHop(sent);
        if (!(ours > chromeDeadline && ours <= hop && ours <= TIMER_MAX)) fails.push(`timeout: for timeout ${t}, the host waits ${ours} ms and chrome is sent ${sent}; the wait must exceed chrome's ${chromeDeadline} ms, not exceed Orca's forwarding hop ${hop} ms, and stay under the timer limit`);
    }
    const w = makeWorld({ ...env, agent: msg => {
        if (msg.method === 'browser.wait') return { after: msg.params.timeout > 100_000 ? 5000 : 9000, reply: { ok: true, where: 'done', result: { matched: true } } };
        if (msg.method === 'browser.goto') return { after: 9000, reply: { ok: true, where: 'done', result: {} } };
        if (msg.method === 'browser.eval') return null;
        return { after: 5, reply: { ok: true, where: 'done', result: {} } };
    } });
    if (!(await attached(w))) return [`timeout: the host did not attach (${refusalText(w) || 'no refusal'})`];
    await orcadPage(w, 'page-1');
    const waited = await settled(w, w.orcad.command('page-1', { type: 'automation', method: 'browser.wait', params: { timeout: 10000 } }), 12_000);
    if (waited?.status !== 'completed') fails.push(`timeout: a browser.wait chrome answers after 9 s reached orcad as ${JSON.stringify(waited)}; expected completed`);
    const navigated = await settled(w, w.orcad.command('page-1', { type: 'navigate', url: 'https://example.com/slow' }), 12_000);
    if (navigated?.status !== 'completed') fails.push(`timeout: an Orca navigate chrome answers after 9 s reached orcad as ${JSON.stringify(navigated)}; expected completed`);
    const huge = await settled(w, w.orcad.command('page-1', { type: 'automation', method: 'browser.wait', params: { timeout: 3_000_000_000 } }), 8000);
    const sentHuge = w.agentCalls.filter(c => c.method === 'browser.wait').at(-1)?.params.timeout;
    if (huge?.status !== 'completed' || !(sentHuge <= TIMER_MAX)) fails.push(`timeout: a wait with a timeout past the timer limit reached orcad as ${JSON.stringify(huge)} and chrome was sent timeout ${sentHuge}; expected completed and a timeout under the limit`);
    const evaluated = await settled(w, w.orcad.command('page-1', { type: 'automation', method: 'browser.eval', params: { expression: '1' } }), wire.agentCallTimeoutMs({}) + 1000);
    if (evaluated?.status !== 'failed' || evaluated.errorCode !== 'browser_timeout') fails.push(`timeout: a command chrome never answers reached orcad as ${JSON.stringify(evaluated)}; expected failed browser_timeout`);
    return fails;
}

function makeWireModule(env) {
    const context = vm.createContext({ console, TextEncoder, setTimeout, clearTimeout });
    return makeLoader({ ts: env.ts, files: env.files, context }).load(REL.wire);
}

async function budgetScenario(env) {
    const big = 'x'.repeat(800 * 1024);
    const w = makeWorld({ ...env, agent: msg => ({ after: 5, reply: { ok: true, where: 'done', result: msg.method === 'browser.snapshot' ? { snapshot: big } : {} } }) });
    if (!(await attached(w))) return [`budget: the host did not attach (${refusalText(w) || 'no refusal'})`];
    await orcadPage(w, 'page-1');
    const result = await settled(w, w.orcad.command('page-1', { type: 'automation', method: 'browser.snapshot', params: {} }), 1000);
    return result?.status === 'failed' ? [] : [`budget: a snapshot over Orca's result budget reached orcad as ${JSON.stringify(result).slice(0, 120)} (${refusalText(w) || 'no refusal'}); expected an accepted failed result`];
}

async function startDeadlineScenario(env) {
    const fails = [];
    for (const [link, step] of [[null, 'link'], ['never-ready', 'connection']]) {
        const w = makeWorld({ ...env, link });
        let outcome = 'pending';
        w.host.attach().then(v => { outcome = v; });
        await w.clock.advance(125_000);
        const logged = w.logs.some(([level, line]) => level === 'error' && line.includes(`at the ${step} step`));
        if (w.host.state !== 'failed' || outcome !== false || !logged) {
            fails.push(`startDeadline: with ${link ? 'a link that never becomes ready' : 'no link'}, after 125 s the attach is ${outcome}, the state ${w.host.state}, and ${logged ? 'the' : 'no'} log line names the ${step} step`);
        }
    }
    return fails;
}

async function detachedCloseScenario(env) {
    const fails = [];
    {
        const w = makeWorld(env);
        if (!(await attached(w))) return [`detachedClose: the host did not attach (${refusalText(w) || 'no refusal'})`];
        const tabId = await orcadPage(w, 'page-1', 'wt-1');
        w.orcad.drop();
        await w.clock.advance(10);
        w.widgets.get(tabId)?.close();
        await w.clock.advance(3000);
        const close = w.orcad.tabCloses.find(c => c.page === 'page-1');
        if (!close || close.worktree !== 'id:wt-1') fails.push(`detachedClose: a user close while the host was detached reached orcad as ${JSON.stringify(close ?? 'nothing')} after the re-attach; expected browser.tabClose for page-1 in id:wt-1`);
        // orcad's recovery after the re-attach sends createPage for the page it still holds; the user closed it.
        if (w.pages.table.tabOf('page-1') !== undefined || w.widgets.size !== 0) fails.push(`detachedClose: after the re-attach the page the user closed is open again in ${w.widgets.size} tab(s) (orcad's recovery createPage was served)`);
        const tabsBefore = w.widgets.size;
        const replay = w.orcad.inject('page-1', { type: 'createPage', browserProfileId: 'default', executionHostKey: 'local', workspaceId: 'wt-1' }, 2);
        await w.clock.advance(1000);
        const answer = w.orcad.injectedResults.get(replay.commandId);
        if (answer?.status !== 'failed' || w.widgets.size !== tabsBefore) fails.push(`detachedClose: a createPage for the page the user closed answered ${JSON.stringify(answer ?? 'nothing')} and opened ${w.widgets.size - tabsBefore} tab(s); expected failed and none`);
    }
    {
        const w = makeWorld(env);
        if (!(await attached(w))) return [...fails, `detachedClose: the host did not attach (${refusalText(w) || 'no refusal'})`];
        const tabId = await orcadPage(w, 'page-1', 'wt-1');
        w.orcad.refuse.add('browser.tabClose');
        w.widgets.get(tabId)?.close();
        await w.clock.advance(100);
        for (let i = 0; i < 2; i += 1) {
            w.orcad.drop();
            await w.clock.advance(3000);
            if (w.host.state !== 'attached') await attached(w);
        }
        const sent = w.orcad.calls.filter(c => c.method === 'browser.tabClose' && c.params?.page === 'page-1').length;
        if (sent !== 1) fails.push(`detachedClose: a close orcad refused was sent ${sent} times over two more attaches; expected once`);
    }
    return fails;
}

async function duplicateScenario(env) {
    const w = makeWorld(env);
    if (!(await attached(w))) return [`duplicate: the host did not attach (${refusalText(w) || 'no refusal'})`];
    const command = { type: 'createPage', browserProfileId: 'default', executionHostKey: 'local', workspaceId: 'wt-2' };
    const first = w.orcad.inject('page-2', command);
    const second = w.orcad.inject('page-2', command);
    await w.clock.advance(1000);
    const outcomes = [w.orcad.injectedResults.get(first.commandId)?.status, w.orcad.injectedResults.get(second.commandId)?.status].sort().join(',');
    const fails = [];
    if (outcomes !== 'completed,failed') fails.push(`duplicate: two createPage for one id answered ${outcomes}; expected one completed, one failed`);
    const stored = JSON.parse(w.storage.get('powerbrowser.orca-browser.bound-pages') ?? '{}');
    if (!('page-2' in stored)) fails.push("duplicate: the losing tab's close erased the bound page's sessionStorage entry");
    w.orcad.drop();
    await w.clock.advance(3000);
    if (!(w.orcad.attaches.at(-1)?.params.pageInventory ?? []).some(p => p.browserPageId === 'page-2')) fails.push("duplicate: the losing tab's close removed the bound page from the inventory");
    for (const widget of [...w.widgets.values()]) widget.close();
    await w.clock.advance(1000);
    const close = w.orcad.tabCloses.find(c => c.page === 'page-2');
    if (!close || close.worktree !== 'id:wt-2') fails.push(`duplicate: the bound tab's user close reached orcad as ${JSON.stringify(close ?? 'nothing')}; expected browser.tabClose for page-2 in id:wt-2`);
    return fails;
}

async function closeBeforeBindScenario(env) {
    const w = makeWorld({ ...env, closeOnOpen: () => true });
    if (!(await attached(w))) return [`closeBeforeBind: the host did not attach (${refusalText(w) || 'no refusal'})`];
    const event = w.orcad.inject('page-3', { type: 'createPage', browserProfileId: 'default', executionHostKey: 'local', workspaceId: 'wt-3' });
    await w.clock.advance(1000);
    const answer = w.orcad.injectedResults.get(event.commandId);
    const fails = [];
    if (answer?.status !== 'failed') fails.push(`closeBeforeBind: a createPage whose tab closed before the bind answered ${JSON.stringify(answer ?? 'nothing')}; expected failed`);
    if (w.orcad.tabCloses.some(c => c.page === 'page-3')) fails.push('closeBeforeBind: a user close was sent for a page createPage never completed');
    if (w.rows.has('page-3')) fails.push('closeBeforeBind: a pane row was left for a page with no tab');
    return fails;
}

async function inventoryBudgetScenario(env) {
    const w = makeWorld(env);
    if (!(await attached(w))) return [`inventoryBudget: the host did not attach (${refusalText(w) || 'no refusal'})`];
    const count = Math.ceil(env.schemas.inventoryMaxBytes / 8192) + 20;
    for (let i = 0; i < count; i += 1) w.orcad.inject(`bulk-${i}`, { type: 'createPage', browserProfileId: 'default', executionHostKey: 'local', workspaceId: 'wt-4' });
    await w.clock.advance(2000);
    for (const widget of w.widgets.values()) widget.url = `https://example.com/${'v'.repeat(8100)}`;
    const tabsBefore = w.widgets.size;
    const before = w.logs.length;
    w.orcad.drop();
    await w.clock.advance(3000);
    const fails = [];
    const refused = w.orcad.refusals.filter(r => r.method === 'browser.clientHost.attach');
    if (w.host.state !== 'attached' || refused.length) fails.push(`inventoryBudget: with ${tabsBefore} bound tabs of long urls the re-attach ${refused.length ? `was refused: ${String(refused[0].issues).slice(0, 160)}` : `left the host ${w.host.state}`}`);
    const named = w.logs.slice(before).some(([, line]) => /inventory/i.test(line));
    if (w.widgets.size >= tabsBefore || !named) fails.push(`inventoryBudget: ${tabsBefore - w.widgets.size} tab(s) left out of the inventory were closed and ${named ? 'a' : 'no'} log line names it; pages left out must not be dropped silently`);
    return fails;
}

async function placementScenario(env) {
    const fails = [];
    const w = makeWorld(env);
    await w.clock.advance(1000); // the link becomes ready
    const foreign = await w.linkObject().connection();
    foreign.placement.attached('pb-host-foreign');
    if (!(await attached(w))) return [`placement: after a placement made before the host attached, the host did not attach (${w.logs.map(l => l[1]).join(' | ').slice(0, 200)})`];
    const hostId = w.orcad.attaches.at(-1)?.params.browserHostClientId;
    const placed = JSON.stringify(await w.placement());
    if (placed !== JSON.stringify({ kind: 'client', browserHostClientId: hostId }) || w.host.state !== 'attached') {
        fails.push(`placement: after a placement made before the host attached, placement is ${placed} and the host ${w.host.state}; expected the host's own id and attached`);
    }
    let refused = false;
    try { foreign.placement.attached('pb-host-other'); } catch { refused = true; }
    if (!refused) fails.push('placement: one placement capability accepted a second id');
    const created = await orcadPage(w, 'page-1').catch(error => error.message);
    if (typeof created !== 'string' || !created.startsWith('agent-tab-')) fails.push(`placement: a page placed on the host's id was not created (${created})`);
    w.orcad.drop();
    await w.clock.advance(100);
    const afterDrop = JSON.stringify(await w.placement());
    if (afterDrop !== JSON.stringify({ kind: 'server' })) fails.push(`placement: after the host's socket dropped, placement is ${afterDrop}; expected the server`);
    return fails;
}

async function chromeStatusScenario(env) {
    const fails = [];
    {
        // Stop pressed: chrome holds it for the shell window, so a bound tab's navigate and automation are refused.
        const chromeStop = { stopped: false };
        const w = makeWorld({ ...env, chromeStop });
        if (!(await attached(w))) return [`chromeStatus: the host did not attach (${refusalText(w) || 'no refusal'})`];
        await orcadPage(w, 'page-1');
        chromeStop.stopped = true;
        const navigated = await settled(w, w.orcad.command('page-1', { type: 'navigate', url: 'https://example.com/x' }), 1000);
        const automated = await settled(w, w.orcad.command('page-1', { type: 'automation', method: 'browser.click', params: { element: '@e1' } }), 1000);
        for (const [what, result] of [['navigate', navigated], ['automation', automated]]) {
            if (result?.status !== 'failed' || result.errorCode !== 'browser_owner_unavailable') fails.push(`chromeStatus: with Stop held, an Orca ${what} reached orcad as ${JSON.stringify(result)}; expected failed browser_owner_unavailable`);
        }
    }
    {
        // A reload of the Theia document while stopped: the new frontend has only a restored agent row with no flag.
        const chromeStop = { stopped: true };
        const w = makeWorld({ ...env, chromeStop });
        if (!(await attached(w))) return [...fails, `chromeStatus: the host did not attach (${refusalText(w) || 'no refusal'})`];
        w.restoreAgentRow();
        const opensBefore = w.opens();
        const created = await settled(w, w.orcad.createPage('page-2', 'wt-2'), 5000);
        if (created.ok || w.opens() !== opensBefore) fails.push(`chromeStatus: after a reload with Stop held and a restored agent row chrome reports, createPage ${created.ok ? 'completed' : `failed (${created.error})`} and opened ${w.opens() - opensBefore} tab(s); expected failed with none opened`);
    }
    return fails;
}

// The link over Orca's real credential cache.
async function credentialScenario(env) {
    const clock = makeClock();
    const events = new EventTarget();
    const state = { env: environment(1) };
    const sandbox = {
        console, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, Event, TextEncoder,
        addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
    };
    sandbox.window = sandbox;
    const context = vm.createContext(sandbox);
    const loader = makeLoader({ ts: env.ts, files: env.files, context, stubs: linkStubs(state) });
    const credentials = loader.load(REL.credentials);
    const pane = { forgetStoredToken: () => undefined, forgetPairing: () => undefined };
    sandbox.api = {
        runtimeEnvironments: {
            // The pane client's status call: its WebRuntimeClient is built with credentialFor(environment), as
            // web-runtime-session.ts does, so the source is created under the pane client's own callbacks.
            getStatus: async () => { credentials.webRuntimeCredentialFor(state.env, pane); return { ok: true }; },
            prepareBrowserClientHostPlacement: async () => ({ kind: 'server' }),
        },
    };
    loader.load(REL.link);
    const link = sandbox[LINK_KEY];
    const fails = [];
    await clock.advance(2000);
    const sourceIsPane = () => credentials.webRuntimeCredentialFor(state.env, { forgetStoredToken: () => 'probe', forgetPairing: () => 'probe' }).forgetPairing === pane.forgetPairing;
    try { await link.connection(); } catch (error) { return [`credential: the link never became ready (${error.message})`]; }
    if (!sourceIsPane()) fails.push("credential: before any re-pair the source is not the pane client's");
    state.env = environment(2); // a re-pair; the pane client has made no call under it yet
    let early = 'resolved';
    try { await link.connection(); } catch (error) { early = error.message; }
    await clock.advance(3000);
    try { await link.connection(); } catch (error) { return [...fails, `credential: after the re-pair the link stayed not ready (${error.message})`]; }
    if (!sourceIsPane()) fails.push(`credential: after a re-pair the link read the credential before the pane client did (it answered ${early}), so the cached source carries the link's no-op callbacks`);
    return fails;
}

const SCENARIOS = [
    ['metadata', metadataScenario], ['metadataReattach', metadataReattachScenario], ['restart', restartScenario], ['lostResult', lostResultScenario],
    ['timeout', timeoutScenario], ['budget', budgetScenario], ['startDeadline', startDeadlineScenario], ['detachedClose', detachedCloseScenario],
    ['duplicate', duplicateScenario], ['closeBeforeBind', closeBeforeBindScenario], ['inventoryBudget', inventoryBudgetScenario],
    ['chromeStatus', chromeStatusScenario], ['placement', placementScenario], ['credential', credentialScenario],
];

async function evaluate(files, only) {
    const ts = loadTypescript();
    const zod = loadZod();
    const schemas = makeSchemas(ts, zod);
    const consts = derived(files);
    const env = { ts, zod, schemas, files };
    const fails = [];
    for (const [clause, run] of SCENARIOS) {
        if (only && clause !== only) continue;
        try {
            fails.push(...await run(env, consts));
        } catch (error) {
            if (error instanceof FixtureError) throw error;
            fails.push(`${clause}: threw ${error?.stack ?? error}`);
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
    { name: "66-CR-02 review: metadata sent without the page's own generations", clause: 'metadataReattach', edits: [
        sub(REL.frontend, 'this.session.pageMetadata(pageId, metadata, page)', 'this.session.pageMetadata(pageId, metadata)'),
    ] },
    { name: '66-CR-02 review: no automatic re-attach and no lease reconnect', clause: 'metadataReattach', edits: [
        sub(REL.frontend, 'if (this.reattachArmed && reason', 'if (false && reason'),
        sub(REL.host, '          leaseReconnectProtocolVersion: 1,\n', ''),
    ] },
    { name: '66-CR-03: a new host id per attach and an unfiltered inventory', clause: 'restart', edits: [
        sub(REL.frontend, 'const browserHostClientId = this.browserHostClientId;', 'const browserHostClientId = `pb-host-${crypto.randomUUID()}`;'),
        sub(REL.wire, '        if (event.browserHostClientId !== browserHostClientId) {\n            continue;\n        }\n', ''),
    ] },
    { name: '66-CR-03 review: restorePage of an unbound id opens nothing', clause: 'restart', edits: [
        sub(REL.dispatch, "        if (command.type === 'restorePage' && table.tabOf(pageId) === undefined) {", "        if (false) {"),
    ] },
    { name: '66-CR-03 review: the authority moves before the reclaim result is delivered', clause: 'lostResult', edits: [
        sub(REL.frontend, '        const outcome = boundedOutcome(await dispatchCommand(event, this.deps(event)));\n', "        const outcome = boundedOutcome(await dispatchCommand(event, this.deps(event)));\n        if (outcome.status === 'completed' && this.bound.get(event.browserPageId)) {\n            this.bound.set(event.browserPageId, reboundEvent(this.bound.get(event.browserPageId) as BoundEvent, event as BoundEvent));\n        }\n"),
    ] },
    { name: "66-CR-04: agent calls on the web tab channel's acknowledgement timeout", clause: 'timeout', edits: [
        sub(REL.frontend, "agentCall: (tabId, method, params) => this.agentRequest({ kind: 'webTabAgent', tabId, method, params: agentParams(params) }),", "agentCall: (tabId, method, params) => this.channel.request({ kind: 'webTabAgent', tabId, method, params }),"),
    ] },
    { name: "66-CR-04 review: navigate on the web tab channel's acknowledgement timeout", clause: 'timeout', edits: [
        sub(REL.frontend, "navigate: (tabId, url) => this.agentRequest({ kind: 'webTabAgent', tabId, method: 'browser.goto', params: { url } }),", "navigate: (tabId, url) => this.channel.request({ kind: 'webTabAgent', tabId, method: 'browser.goto', params: { url } }),"),
    ] },
    { name: '66-CR-04 review: an agent timeout past the timer limit not bounded', clause: 'timeout', edits: [
        sub(REL.wire, '? Math.min(params.timeout, AGENT_CALL_MAX_TIMEOUT_MS) : 0;', '? params.timeout : 0;'),
        sub(REL.wire, "return typeof params.timeout === 'number' && params.timeout > AGENT_CALL_MAX_TIMEOUT_MS ? { ...params, timeout: AGENT_CALL_MAX_TIMEOUT_MS } : params;", 'return params;'),
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
        sub(REL.wire, 'export const START_STEP_DEADLINE_MS = 60_000;', 'export const START_STEP_DEADLINE_MS = 2_000_000_000;'),
    ] },
    { name: '66-WR-03: the entry deleted before the close is sent', clause: 'detachedClose', edits: [
        sub(REL.frontend, '        this.userClosed.add(pageId);\n        const session = this.session;', '        this.userClosed.add(pageId);\n        this.forgetBoundPage(pageId);\n        const session = this.session;'),
    ] },
    { name: '66-WR-03 review: createPage served for a page the user closed', clause: 'detachedClose', edits: [
        sub(REL.dispatch, '            if (deps.closedByUser?.(pageId)) {', '            if (false) {'),
    ] },
    { name: '66-WR-03 review: a refused close kept and resent at every attach', clause: 'detachedClose', edits: [
        sub(REL.frontend, 'if (transient && attempts < MAX_CLOSE_ATTEMPTS) {', 'if (true) {'),
    ] },
    { name: '66-WR-05: records written before the bind, and any close erases them', clause: 'duplicate', edits: [
        sub(REL.dispatch, "            const bound = table.bind(pageId, tabId);\n            if (bound === 'bound') {\n                if (deps.recordBound && deps.recordBound(tabId) === false) {", "            const early = deps.recordBound?.(tabId);\n            const bound = table.bind(pageId, tabId);\n            if (bound === 'bound') {\n                if (early === false) {"),
        sub(REL.frontend, '            if (this.pages.table.tabOf(pageId) === undefined) {\n                this.bound.delete(pageId);\n                this.forgetBoundPage(pageId);\n            }\n            return;', '            this.bound.delete(pageId);\n            this.forgetBoundPage(pageId);\n            return;'),
    ] },
    { name: '66-WR-05 review: a tab closed before the bind answered completed', clause: 'closeBeforeBind', edits: [
        sub(REL.dispatch, '                if (deps.recordBound && deps.recordBound(tabId) === false) {', '                if (deps.recordBound && deps.recordBound(tabId) === false && false) {'),
        sub(REL.frontend, "            return false; // closed between chrome's reply and the bind: createPage fails, and no user close is sent\n", "            this.bound.set(event.browserPageId, event as BoundEvent);\n            this.onTabClosed(event.browserPageId, tabId);\n            return false;\n"),
    ] },
    { name: "66-CR-03 review: the inventory not kept inside Orca's byte budget", clause: 'inventoryBudget', edits: [
        sub(REL.wire, 'const chosen = fits(withUrl) ? withUrl : fits(entry) ? entry : undefined;', 'const chosen = withUrl;'),
    ] },
    { name: "G1a round 2: Stop read from the widget's own flag, not chrome's status", clause: 'chromeStatus', edits: [
        sub(REL.frontend, '.some(widget => !widget.isDisposed && widget.agentControl.agent && widget.agentControl.stopped),', '.some(widget => widget.agent && !widget.isDisposed && widget.agentControl.stopped),'),
    ] },
    { name: 'T-66-04: the first placement holds and refuses the host', clause: 'placement', edits: [
        sub(REL.link, "      if (boundId !== null && browserHostClientId !== boundId) throw new Error('placement_refused')\n", "      if (boundId !== null && browserHostClientId !== boundId) throw new Error('placement_refused')\n      if (livePlacement && livePlacement.capability !== capability) throw new Error('placement_refused')\n"),
    ] },
    { name: 'T-66-04: a capability takes any id', clause: 'placement', edits: [
        sub(REL.link, "      if (boundId !== null && browserHostClientId !== boundId) throw new Error('placement_refused')\n", ''),
    ] },
    { name: '66-WR-01: readiness never re-armed after a re-pair', clause: 'credential', edits: [
        sub(REL.link, '  if (credentialKey(environment) !== readyKey) {', '  if (false) {'),
    ] },
];

async function main() {
    const selfTest = process.argv.includes('--self-test');
    const only = process.argv.find(a => a.startsWith('--only='))?.slice('--only='.length);
    const skip = skipReason();
    if (skip) { console.log(`${NAME}${selfTest ? ' self-test' : ''}: SKIP -- ${skip}`); return 0; }
    if (!selfTest) {
        const { fails, methods } = await evaluate(readAll(), only);
        if (fails.length) {
            console.error(`${NAME}: FAIL -- the browser host drifts from the pinned orcad's browser-host rules:`);
            for (const f of fails) console.error(`  ${f}`);
            return 1;
        }
        console.log(`${NAME}: PASS -- ${only ? `clause ${only}` : `${SCENARIOS.length} clauses hold (${SCENARIOS.map(([c]) => c).join(', ')})`}; orcad is the pinned browser-host handlers and registries, other requests validated with their declared schema (${methods} methods derived)`);
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
        const { fails } = await evaluate(files, plant.clause);
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
