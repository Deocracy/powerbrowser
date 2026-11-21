#!/usr/bin/env node
// scripts/verify-orca-browser-tab-scope.mjs
//
// orca-browser-tab-scope (Phase 66 plan 03, BRW-03/BRW-04; P66-06, P66-12, P66-30, A1): the chrome side of
// the Orca agent bridge reaches only tabs chrome created as agent tabs. The SHIPPED source is evaluated, not a
// copy of its rules: the agent section of powerbrowser/shell/PowerBrowserAPI.sys.mjs (between its marker
// comments), the PowerBrowserAPI methods webTabOpen, webTabGeometry and webTabClose, the webTabAgent and
// webTabAgentStop arms of handleWebTabAction and the webTabOpen arm of handleGroupMutation are sliced out of it
// and run in node:vm over a stub boundary: a webTabs Map of fake entries, fake overlay browsers that record every
// style write and docShellIsActive, fake getActor and drawSnapshot recorders, a sendWebTabPush recorder and a
// fake clock. Scenarios drive them and pure verdicts judge the recorded calls.
//
// Derived at check time, never hand-kept:
//  a. the method list, from the shipped AGENT_METHODS (an empty list is a broken instrument, never a pass);
//  b. the mechanism of each method, from the section's AGENT_NATIVE_ROWS and the child's AGENT_RUN keys
//     (GroupActorChild.sys.mjs): every method in exactly one, nothing served outside the list;
//  c. the visibility reads, from the comment-stripped source: every `style.visibility ===` or `!==` comparison
//     must sit inside overlayShownToUser, whose own comparison is the positive control.
//
// Red on: any of the 40 methods doing page work (actor, drawSnapshot, cookie, navigation, dialog or print calls) for
// a user tab, an unknown id, another frontend's tab, an agent tab whose page is not in the agent container, or a
// stopped tab; a click not reaching the actor once or a screenshot not drawn once at the device pixel ratio; a method
// outside AGENT_METHODS or bad params accepted; the flag honoured on an already-open tab or a malformed flag accepted;
// the usercontextid attribute missing, set after appendChild or set on a user overlay; a cookie-service call without
// the agent userContextId; Stop not aborting an in-flight call or not pushing active false and stopped true; the mark
// not clearing after exactly 20000 ms; a user tab parked, an unshown agent tab not parked, or focus left on a parked
// overlay (coordinator finding 1); an agent overlay left in the "browsers" message manager group or with an
// autocomplete popup, the pair registered outside the agent group, an HTTP
// auth dialog answered (coordinator finding 3), the pinned LoginManager actor groups (upstream/toolkit/modules/
// ActorManagerParent.sys.mjs, a named SKIP without upstream/) including the agent group; a raw visibility read
// outside the predicate.
//
// Opens clause (66-08, D-35): the open paths are derived from what installNewWindowReceivers installs on a fake shell
// window (every function, and every browserDOMWindow member that answers null or an element for a user opener), and the
// where values from the pinned nsIBrowserDOMWindow IDL's OPEN_* constants (the adopt section's when upstream/ is
// absent). Red on: any path opening an overlay, a stock window, a load or an adoptTab push for an agent-overlay opener at
// any where; a browserDOMWindow member answering null or an element for one (Gecko then opens a stock window) instead
// of throwing the guard's failure; a refusal logged twice per tab and path or with the URL; a command whose open chrome
// refused answering anything but failed browser_command_unavailable; an agent overlay's first load without
// SANDBOXED_AUXILIARY_NAVIGATION, or a user overlay with it. Detectors first: a user opener must create an overlay
// through a member and the link path and reach the stock window. The self-test generates one plant per derived path.
//
// Walls outside the receivers (66-09, D-37): the derivation above sees only what installNewWindowReceivers installs, so
// three more clauses cover what does not run through it.
//  - downloads: the sandbox bits Gecko's ClassifyDownload tests (derived from the pinned
//    dom/security/nsContentSecurityUtils.cpp and dom/base/nsSandboxFlags.h; the section's own constant without
//    upstream/) must all be on an agent overlay's first load and on no user overlay's; every network observer the
//    section registers is driven with every topic it registered for, and an agent overlay's document channel that
//    stopped with NS_ERROR_ABORT (the wall's cancel) must fail the command in flight with browser_command_unavailable
//    and log once without the URL, also when the cancel lands after the child's reply (the settle), while a user overlay's channel, an agent subresource and an agent document that
//    loaded must not (the detector and controls).
//  - external protocols: a factory must be registered for the dispatch-chooser contract the pinned
//    nsExternalHelperAppService.cpp LoadURI creates (the section's constant without upstream/); its chooser must hand
//    a user overlay's and a null browsing context to the stock chooser (the detector), and refuse an agent overlay's
//    and a frame inside one, failing the command in flight and logging once without the URL.
//  - the initial document: on an agent overlay whose current window global is the initial about:blank, every method
//    of AGENT_METHODS but browser.goto answers failed browser_command_unavailable with no page work, and browser.goto
//    still navigates.
//
// Page-table clause: theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts (and ./orca-browser-abilities)
// is transpiled with theia/node_modules/typescript and its createPageTable must refuse a duplicate page and a second
// page for a tab. The module absent, or present but missing an export, is red, never a SKIP (lane p66-02 merged long
// ago, so an absence can only be a missing table).
//
// Cookie site clause (agent-browser-03): a cookie row for a host on another site, or a bare public suffix, is refused
// before any cookie-service call; a subdomain of the current site is served (the detector); cookie.get lists an
// httpOnly cookie with its value withheld.
//
// Tier: quick (text reads and node:vm; acorn and typescript from theia/node_modules). SKIP (exit 77, one line) when
// upstream/ is not fetched: the clauses derived from the pinned Gecko source then ran against the agent section's own
// constants, or did not run. --self-test is quick and hermetic: mutated copies of the shipped source in memory and a
// fixture dispatch module; without upstream/ its pin plants do not run and it exits 77.
//
// Usage:
//   node scripts/verify-orca-browser-tab-scope.mjs
//   node scripts/verify-orca-browser-tab-scope.mjs --self-test

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { SKIP_EXIT, skipLine, verdictExit } from './lib/skip-verdict.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-browser-tab-scope';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const CHILD = 'powerbrowser/shell/GroupActorChild.sys.mjs';
const SECTION_START = '// ---- Orca agent bridge (66-03, BRW-03/BRW-04) ----';
const SECTION_END = '// ---- end Orca agent bridge ----';
const ADOPT_START = '// Phase 36 (PROMPT-05): the new-window adopt section.';
const ADOPT_END = '// Phase 36: new-window adopt section end.';
const IDL = 'upstream/dom/interfaces/base/nsIBrowserDOMWindow.idl';
const SANDBOX_H = 'upstream/dom/base/nsSandboxFlags.h';
const CLASSIFY = 'upstream/dom/security/nsContentSecurityUtils.cpp';
const EXTHANDLER = 'upstream/uriloader/exthandler/nsExternalHelperAppService.cpp';

let acorn;
try {
    acorn = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('acorn');
} catch {
    console.error(`${NAME}: FAIL -- broken instrument: acorn is not installed in theia/. Next step: run the audited yarn install in theia/ first.`);
    process.exit(1);
}

function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');
}

function walk(node, visit) {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(n => walk(n, visit)); return; }
    if (typeof node.type === 'string') visit(node);
    for (const key of Object.keys(node)) {
        if (key !== 'loc') walk(node[key], visit);
    }
}

/** The pieces of the shipped source the scenarios run, or { error }. */
export function sliceSource(text) {
    const start = text.indexOf(SECTION_START);
    const end = text.indexOf(SECTION_END);
    if (start === -1 || end === -1 || end < start) {
        return { error: `broken instrument: the agent section markers were not found in ${API}` };
    }
    let ast;
    try {
        ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
    } catch (err) {
        return { error: `broken instrument: ${API} does not parse (${err.message})` };
    }
    const methods = {};
    const functions = {};
    walk(ast, n => {
        if (n.type === 'Property' && n.key?.type === 'Identifier' && n.value?.type === 'FunctionExpression' && ['webTabOpen', 'webTabGeometry', 'webTabClose', 'installNewWindowReceivers'].includes(n.key.name) && !methods[n.key.name]) {
            methods[n.key.name] = text.slice(n.start, n.end);
        }
        if (n.type === 'FunctionDeclaration' && ['handleWebTabAction', 'webTabIdIsValid', 'tabIdOfBrowser'].includes(n.id?.name)) {
            functions[n.id.name] = { node: n, text: text.slice(n.start, n.end) };
        }
        if (n.type === 'Property' && n.key?.name === 'handleGroupMutation' && n.value?.type === 'FunctionExpression' && !functions.handleGroupMutation) {
            functions.handleGroupMutation = { node: n, text: text.slice(n.start, n.end) };
        }
    });
    for (const name of ['webTabOpen', 'webTabGeometry', 'webTabClose', 'installNewWindowReceivers']) {
        if (!methods[name]) return { error: `broken instrument: PowerBrowserAPI.${name} was not found in ${API}` };
    }
    const adoptStart = text.indexOf(ADOPT_START);
    const adoptEnd = text.indexOf(ADOPT_END);
    if (adoptStart === -1 || adoptEnd === -1 || adoptEnd < adoptStart) {
        return { error: `broken instrument: the new-window adopt section markers were not found in ${API}` };
    }
    for (const name of ['handleWebTabAction', 'handleGroupMutation', 'webTabIdIsValid', 'tabIdOfBrowser']) {
        if (!functions[name]) return { error: `broken instrument: function ${name} was not found in ${API}` };
    }
    const caseText = (fn, kind) => {
        let found = null;
        walk(fn.node, n => {
            if (!found && n.type === 'SwitchCase' && n.test?.type === 'Literal' && n.test.value === kind) found = text.slice(n.start, n.end);
        });
        return found;
    };
    const arms = ['webTabAgent', 'webTabAgentStop'].map(kind => caseText(functions.handleWebTabAction, kind));
    if (arms.some(arm => arm === null)) {
        return { error: 'broken instrument: handleWebTabAction has no webTabAgent or webTabAgentStop case arm' };
    }
    const openArm = caseText(functions.handleGroupMutation, 'webTabOpen');
    if (openArm === null) {
        return { error: 'broken instrument: handleGroupMutation has no webTabOpen case arm' };
    }
    return {
        section: text.slice(start, end).replace(/^export /gm, ''),
        adopt: text.slice(adoptStart, adoptEnd),
        methods,
        helpers: [functions.webTabIdIsValid.text, functions.tabIdOfBrowser.text].join('\n'),
        arms: arms.join('\n'),
        openArm,
    };
}

// ---------------------------------------------------------------------------
// The stub boundary.

const CONTAINER = 7;
const ABORT = 0x80004004;
const SANDBOXED_AUXILIARY_NAVIGATION = 0x2;
const AGENT_GROUP = 'powerbrowser-orca-agent';
const COMMON_DIALOG = 'chrome://global/content/commonDialog.xhtml';

function fakeClock() {
    let now = 0;
    let next = 1;
    const timers = new Map();
    return {
        setTimeout(fn, ms) { const id = next++; timers.set(id, { at: now + ms, fn }); return id; },
        clearTimeout(id) { timers.delete(id); },
        advance(ms) {
            now += ms;
            for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
                if (t.at <= now && timers.has(id)) { timers.delete(id); t.fn(); }
            }
        },
    };
}

/** One world: the sliced source evaluated over fresh stubs that record every boundary call. */
export function makeWorld(sliced, { dpr = 2 } = {}) {
    const rec = { actor: [], aborts: [], draws: [], pushes: [], registered: [], attrs: [], cookies: [], nav: [], wm: 0, print: 0, focus: [], logs: [], answered: [], created: 0, stock: [], loads: [], uriLoads: 0, observers: [], factories: [], stockChooser: [] };
    const dialogs = [];
    const clock = fakeClock();
    const webTabs = new Map();
    const childReplies = new Map();
    const focusListeners = [];
    const shellWin = {
        devicePixelRatio: dpr, innerWidth: 1600, innerHeight: 1000,
        setTimeout: (fn, ms) => clock.setTimeout(fn, ms), clearTimeout: id => clock.clearTimeout(id),
        addEventListener: (type, fn) => { if (type === 'focus') focusListeners.push(fn); },
        DOMRect: class { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } },
    };
    const doc = {
        defaultView: shellWin,
        activeElement: null,
        body: { appendChild(browser) { browser.appended = true; } },
        createXULElement: () => { rec.created += 1; return fakeBrowser(null); },
        getElementById: () => theiaBrowser,
        fullscreenElement: null,
        exitFullscreen: () => Promise.resolve(),
        createElementNS: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: mime => `data:${mime};base64,AAAA` }),
    };
    shellWin.document = doc;
    const theiaBrowser = { tabIdHint: 'theia', ownerDocument: doc, getBoundingClientRect: () => ({ left: 0, top: 0 }), focus: () => rec.focus.push('theia') };
    const frontend = { browsingContext: { top: { embedderElement: theiaBrowser } } };
    const otherFrontend = { browsingContext: { top: { embedderElement: theiaBrowser } } };

    function fakeBrowser(tabIdHint) {
        const attrs = new Map();
        // The page the overlay shows: the cookie rows act only on its site (agent-browser-03).
        const browser = { tabIdHint, appended: false, docShellIsActive: false, ownerDocument: doc, removed: false, attrs, currentURI: { host: 'example.com', spec: 'https://example.com/' } };
        browser.style = {};
        browser.setAttribute = (name, value) => { attrs.set(name, value); rec.attrs.push({ browser, name, value, appended: browser.appended }); };
        browser.getAttribute = name => (attrs.has(name) ? attrs.get(name) : null);
        browser.remove = () => { browser.removed = true; };
        browser.removeProgressListener = () => {};
        browser.removeEventListener = () => {};
        browser.focus = () => rec.focus.push(browser.tabIdHint);
        browser.loadURI = () => { rec.uriLoads += 1; };
        const actor = {
            sendQuery(message, data) {
                rec.actor.push({ tab: browser.tabIdHint, message, method: data?.method });
                if (message === 'PowerBrowserAgent:Size') return Promise.resolve({ width: 1000, height: 3000 });
                const reply = childReplies.get(data?.method);
                return reply ? reply(data) : Promise.resolve({ where: 'done', result: { entries: [] } });
            },
            sendAsyncMessage(message) { rec.aborts.push({ tab: browser.tabIdHint, message }); },
        };
        browser.browsingContext = {
            get originAttributes() { return { userContextId: Number(attrs.get('usercontextid') || 0) }; },
            print: () => { rec.print += 1; return Promise.resolve(); },
            currentWindowGlobal: {
                getActor: name => { rec.actor.push({ tab: browser.tabIdHint, getActor: name }); return actor; },
                drawSnapshot: (rect, scale) => { rec.draws.push({ tab: browser.tabIdHint, rect, scale }); return Promise.resolve({ width: 10, height: 10, close() {} }); },
            },
        };
        return browser;
    }

    function addTab(tabId, { agent = false, owner = frontend, container = agent ? CONTAINER : 0, group = agent ? AGENT_GROUP : 'browsers' } = {}) {
        const browser = fakeBrowser(tabId);
        if (container) browser.attrs.set('usercontextid', String(container));
        browser.attrs.set('messagemanagergroup', group);
        const entry = { browser, owner, uri: `web:${tabId}`, rowKey: `web:${tabId}` };
        if (agent) Object.assign(entry, { agent: true, agentUserContextId: CONTAINER, agentNetwork: [] });
        webTabs.set(tabId, entry);
        return entry;
    }

    const navigate = name => tabId => { rec.nav.push({ name, tabId }); return 'loading'; };
    const PowerBrowserAPI = {
        log: (level, line) => rec.logs.push(`${level} ${line}`),
        createPermanentKey: () => ({}),
        webTabAttach: (tb, actorRef, tabId, browser) => {
            browser.tabIdHint = tabId;
            const entry = { browser, owner: actorRef, uri: `web:${tabId}`, rowKey: `web:${tabId}` };
            webTabs.set(tabId, entry);
            return entry;
        },
        takeWebTabHistory: () => null,
        // D-35: the sandbox flags the overlay carries when its first load starts.
        firstWebTabLoad: (tabId, entry) => { rec.loads.push({ tabId, sandboxFlags: entry.browser.browsingContext.sandboxFlags ?? 0 }); return Promise.resolve(); },
        openStockTab: url => { rec.stock.push(url); return Promise.resolve('opened'); },
        // A short beat (the agent settle, D-37) passes at once; a long timeout (the adopt fallback) never fires.
        sleep: ms => (ms < 1000 ? new Promise(resolve => setTimeout(resolve, 0)) : new Promise(() => {})),
        scheduleSettleCapture: () => {},
        removeTabRow: () => Promise.resolve(),
        webTabNavigate: navigate('navigate'), webTabBack: navigate('back'), webTabForward: navigate('forward'), webTabReload: navigate('reload'),
    };
    const cookieCall = name => (...args) => {
        rec.cookies.push({ name, args });
        if (name === 'add') return { result: 0 };
        return name.startsWith('get') ? [
            { host: 'example.com', name: 'a', path: '/', value: 'b', expiry: 0, isSession: true, sameSite: 1, isHttpOnly: false },
            { host: 'example.com', name: 'sid', path: '/', value: 'planted-session-secret', expiry: 0, isSession: true, sameSite: 1, isHttpOnly: true },
        ] : undefined;
    };
    const prefs = new Map();
    const Services = {
        prefs: { getIntPref: (name, fallback) => (prefs.has(name) ? prefs.get(name) : fallback), setIntPref: (name, value) => prefs.set(name, value), getBoolPref: (name, fallback) => fallback },
        io: { newURI: spec => ({ spec }) },
        scriptSecurityManager: { createNullPrincipal: () => ({ isSystemPrincipal: false }) },
        // Gecko's registrable domain, reduced to the last two labels; a bare suffix throws as getBaseDomainFromHost does.
        eTLD: { getBaseDomainFromHost: host => { const labels = String(host).split('.'); if (labels.length < 2) throw new Error('insufficient domain levels'); return labels.slice(-2).join('.'); } },
        cookies: { getCookiesFromHost: cookieCall('getCookiesFromHost'), getCookiesWithOriginAttributes: cookieCall('getCookiesWithOriginAttributes'), add: cookieCall('add'), remove: cookieCall('remove') },
        obs: { addObserver: (observer, topic) => rec.observers.push({ observer, topic }) },
        uuid: { generateUUID: () => `{fake-${rec.factories.length}}` },
        wm: { getEnumerator: () => { rec.wm += 1; return dialogs; } },
    };
    const iface = new Proxy({}, { get: () => new Proxy({}, { get: (t, k) => String(k) }) });
    const context = vm.createContext({
        webTabs, PowerBrowserAPI, Services, Ci: iface, Cc: {}, Cr: { NS_ERROR_ABORT: ABORT }, URL,
        Components: {
            Exception: (message, result) => Object.assign(new Error(message || 'xpcom'), { result }),
            manager: {
                QueryInterface: () => ({
                    contractIDToCID: contract => `{stock ${contract}}`,
                    registerFactory: (cid, description, contract, factory) => rec.factories.push({ cid, contract, factory }),
                }),
                getClassObject: cid => ({ createInstance: () => ({ handleURI: (...args) => { rec.stockChooser.push({ cid: String(cid), args }); } }) }),
            },
        },
        SHELL_CONTENT_BROWSER_ID: 'powerbrowser-content', promptRecords: new Map(), hideBars: () => {}, btoa: s => Buffer.from(s, 'binary').toString('base64'),
        lazy: { ContextualIdentityService: { getPublicIdentityFromId: id => (id === CONTAINER ? { userContextId: id } : null), create: () => ({ userContextId: CONTAINER }) } },
        webTabPushedSpec: spec => spec,
        sendWebTabPush: (target, payload) => rec.pushes.push(payload),
        showActivationOnAttach: () => {}, resendWebTabSharing: () => {}, tabHostAddTab: () => {}, tabHostDropTab: () => {},
        keepClosedWebTabHistory: () => {}, detachWebTabPageListeners: () => {}, webTabCloseToolbox: () => {},
        webTabPageState: new WeakMap(),
        GroupActorBase: class {},
        GROUP_ACTOR_PARENT_MODULE: 'chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs',
        GROUP_ACTOR_CHILD_MODULE: 'resource://powerbrowser/GroupActorChild.sys.mjs',
        ChromeUtils: { registerWindowActor: (name, options) => rec.registered.push({ name, options }), generateQI: () => function () { return this; } },
    });
    const exported = ['AGENT_METHODS', 'AGENT_NATIVE_ROWS', 'AGENT_MESSAGE_MANAGER_GROUP', 'overlayShownToUser', 'registerAgentActor'];
    const program = `${sliced.helpers}\n${sliced.section}\n${sliced.adopt}\n` +
        `const __api = ({ ${sliced.methods.webTabOpen}, ${sliced.methods.webTabGeometry}, ${sliced.methods.webTabClose}, ${sliced.methods.installNewWindowReceivers} });\n` +
        `async function __actionArms(data, actorRef) { const kind = data?.kind; switch (kind) { ${sliced.arms} default: return null; } }\n` +
        `async function __openArm(data, actorRef) { const kind = data?.kind; switch (kind) { ${sliced.openArm} default: return null; } }\n` +
        `({ ${exported.map(n => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')}, api: __api, actionArms: __actionArms, openArm: __openArm })`;
    const out = vm.runInContext(program, context, { filename: API });
    PowerBrowserAPI.webTabOpen = (...args) => out.api.webTabOpen(...args);
    // A call still pending after 200 ms of real time answers { hung: true } (a broken guard can reach a row that waits
    // on the fake clock forever).
    const settle = p => Promise.race([
        Promise.resolve().then(() => p).catch(err => ({ threw: String(err && err.message) })),
        new Promise(resolve => setTimeout(() => resolve({ hung: true }), 200)),
    ]);
    return {
        ...out, rec, clock, webTabs, frontend, otherFrontend, theiaBrowser, addTab, childReplies, shellWin, doc,
        focusEvent: target => focusListeners.forEach(fn => fn({ target })),
        // A commonDialog window the given overlay's page opened, of one prompt type.
        openDialog: (browser, promptType) => dialogs.push({
            closed: false, location: { href: COMMON_DIALOG }, Event: class {},
            args: { promptType, owningBrowsingContext: { top: { embedderElement: browser } } },
            document: { getElementById: id => (id === 'commonDialog'
                ? { acceptDialog: () => rec.answered.push(`accept ${promptType}`), cancelDialog: () => rec.answered.push(`cancel ${promptType}`) }
                : { value: '', dispatchEvent() {} }) },
        }),
        // A throw is an answer too: a plant that breaks a guard must go red by name, never crash the check.
        agent: (tabId, method, params, actorRef = frontend) => settle(out.actionArms({ kind: 'webTabAgent', tabId, method, params }, actorRef)),
        stop: (tabId, actorRef = frontend) => settle(out.actionArms({ kind: 'webTabAgentStop', tabId }, actorRef)),
        pageWork: () => rec.actor.length + rec.draws.length + rec.cookies.length + rec.nav.length + rec.wm + rec.print,
    };
}

// Valid params per method: test inputs, not an expectation list. A method of the shipped AGENT_METHODS without one is
// a broken instrument, so a method added to chrome is never silently left unchecked.
const SAMPLE_PARAMS = {
    'browser.back': {}, 'browser.forward': {}, 'browser.reload': {}, 'browser.pdf': {}, 'browser.snapshot': {},
    'browser.capture.start': {}, 'browser.capture.stop': {}, 'browser.dialogDismiss': {}, 'browser.screenshot': {}, 'browser.fullScreenshot': {},
    'browser.goto': { url: 'https://example.com/' }, 'browser.cookie.get': {}, 'browser.cookie.set': { name: 'a', value: 'b' },
    'browser.cookie.delete': { name: 'a' }, 'browser.network': { limit: 5 }, 'browser.console': {}, 'browser.dialogAccept': { text: 'x' },
    'browser.click': { element: '#e' }, 'browser.dblclick': { element: '#e' }, 'browser.hover': { element: '#e' }, 'browser.focus': { element: '#e' },
    'browser.clear': { element: '#e' }, 'browser.selectAll': { element: '#e' }, 'browser.scrollIntoView': { element: '#e' },
    'browser.check': { element: '#e', checked: true }, 'browser.fill': { element: '#e', value: 'v' }, 'browser.select': { element: '#e', value: 'v' },
    'browser.drag': { from: '#a', to: '#b' }, 'browser.eval': { expression: '1' }, 'browser.exec': { command: 'get title' },
    'browser.type': { input: 'ab' }, 'browser.keypress': { key: 'Enter' }, 'browser.keyboardInsertText': { text: 'x' },
    'browser.mouseMove': { x: 1, y: 2 }, 'browser.mouseDown': { button: 'left' }, 'browser.mouseUp': { button: 'left' },
    'browser.mouseClick': { x: 1, y: 2 }, 'browser.mouseWheel': { dy: 10 }, 'browser.scroll': { direction: 'down' }, 'browser.wait': { selector: '#e' },
};

const realTick = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Scenarios. Each returns failure strings; empty means it held.

export async function runScenarios(sliced, childText, dpr = 2) {
    const failures = [];
    const fresh = () => makeWorld(sliced, { dpr });
    let w;
    try {
        w = fresh();
    } catch (err) {
        return [`broken instrument: the sliced source does not evaluate over the stub boundary (${err.message})`];
    }
    if (!Array.isArray(w.AGENT_METHODS) || w.AGENT_METHODS.length === 0) {
        return ['broken instrument: AGENT_METHODS is missing or empty, so no method is checked'];
    }
    for (const name of ['overlayShownToUser', 'registerAgentActor']) {
        if (typeof w[name] !== 'function') failures.push(`broken instrument: ${name} is not defined in the agent section`);
    }
    const methods = [...w.AGENT_METHODS];
    const unsampled = methods.filter(m => !SAMPLE_PARAMS[m]);
    if (unsampled.length) failures.push(`broken instrument: no sample params for ${unsampled.join(', ')}, so their wall is unchecked`);

    // Mechanisms: every method is a native row or a child arm, never both, never neither.
    const native = Object.keys(w.AGENT_NATIVE_ROWS ?? {});
    const runBody = /const AGENT_RUN = \{([\s\S]*?)\n\};/.exec(childText)?.[1] ?? '';
    const actor = [...runBody.matchAll(/^ {2}"(browser\.[A-Za-z.]+)":/gm)].map(m => m[1]);
    if (!native.length || !actor.length) {
        failures.push(`broken instrument: derived ${native.length} native rows and ${actor.length} child arms`);
    }
    const both = native.filter(m => actor.includes(m));
    const neither = methods.filter(m => !native.includes(m) && !actor.includes(m));
    const extra = [...native, ...actor].filter(m => !methods.includes(m));
    if (both.length) failures.push(`mechanisms: served both natively and by the child: ${both.join(', ')}`);
    if (neither.length) failures.push(`mechanisms: in AGENT_METHODS but served by nothing: ${neither.join(', ')}`);
    if (extra.length) failures.push(`mechanisms: served but outside AGENT_METHODS: ${extra.join(', ')}`);

    // Click on an agent tab reaches the PowerBrowserAgent child exactly once.
    w.addTab('a1', { agent: true });
    let reply = await w.agent('a1', 'browser.click', { element: '#go' });
    const runs = w.rec.actor.filter(c => c.message === 'PowerBrowserAgent:Run' && c.tab === 'a1');
    if (reply?.where !== 'done' || runs.length !== 1 || runs[0].method !== 'browser.click') {
        failures.push(`wall: browser.click on an agent tab answered ${JSON.stringify(reply)} with ${runs.length} PowerBrowserAgent:Run call(s); expected done and exactly one`);
    }

    // Every method: a user tab, an unknown id, a foreign frontend's tab, an agent tab outside the agent container and
    // a stopped agent tab are refused before any page work.
    w = fresh();
    w.addTab('u1');
    w.addTab('f1', { agent: true, owner: w.otherFrontend });
    w.addTab('c1', { agent: true, container: 0 });
    w.addTab('s1', { agent: true });
    const stopped = await w.stop('s1');
    if (stopped?.where !== 'stopped') failures.push(`stop: webTabAgentStop on an agent tab answered ${JSON.stringify(stopped)}; expected stopped`);
    for (const method of methods.filter(m => SAMPLE_PARAMS[m])) {
        for (const [tabId, want, what] of [['u1', 'not-agent-tab', 'a user tab'], ['nope', 'unknown-tab', 'an unknown id'], ['f1', 'unknown-tab', "another frontend's agent tab"], ['c1', 'not-agent-tab', 'an agent tab whose page is in the default container'], ['s1', 'agent-stopped', 'a stopped agent tab']]) {
            const before = w.pageWork();
            reply = await w.agent(tabId, method, SAMPLE_PARAMS[method]);
            if (reply?.where !== want || w.pageWork() !== before) {
                failures.push(`wall: ${method} on ${what} answered ${JSON.stringify(reply)} after ${w.pageWork() - before} page call(s); expected ${want} and none`);
            }
        }
    }

    // Screenshot on an agent tab: one drawSnapshot at the window's device pixel ratio.
    w = fresh();
    w.addTab('a1', { agent: true });
    reply = await w.agent('a1', 'browser.screenshot', {});
    if (reply?.where !== 'done' || w.rec.draws.length !== 1 || w.rec.draws[0].scale !== dpr) {
        failures.push(`screenshot: browser.screenshot on an agent tab answered ${JSON.stringify(reply?.where)} with draws ${JSON.stringify(w.rec.draws)}; expected done and one drawSnapshot at scale ${dpr}`);
    }

    // Validation refusals: a method outside AGENT_METHODS, and bad params.
    reply = await w.agent('a1', 'browser.upload', { element: '#f', files: ['/etc/passwd'] });
    const before = w.pageWork();
    if (reply?.ok !== false || reply?.reason !== 'validation') {
        failures.push(`validation: browser.upload (outside AGENT_METHODS) answered ${JSON.stringify(reply)}; expected a validation refusal`);
    }
    reply = await w.agent('a1', 'browser.click', {});
    if (reply?.ok !== false || reply?.reason !== 'validation' || w.pageWork() !== before) {
        failures.push(`validation: browser.click without an element answered ${JSON.stringify(reply)}; expected a validation refusal with no page work`);
    }

    // Cookies act only in the agent container (P66-26).
    w = fresh();
    w.addTab('a1', { agent: true });
    for (const [method, params] of [['browser.cookie.get', {}], ['browser.cookie.get', { url: 'https://example.com/' }], ['browser.cookie.set', { name: 'a', value: 'b', domain: 'example.com' }], ['browser.cookie.delete', { name: 'a', domain: 'example.com' }]]) {
        reply = await w.agent('a1', method, params);
        if (reply?.where !== 'done') failures.push(`cookies: ${method} on an agent tab answered ${JSON.stringify(reply)}; expected done`);
    }
    if (w.rec.cookies.length === 0) failures.push('cookies: the cookie rows made no cookie-service call, so the container rule proves nothing');
    for (const call of w.rec.cookies) {
        const attrs = call.args.find(a => a && typeof a === 'object' && !Array.isArray(a)) ?? (typeof call.args[0] === 'string' && call.args[0].startsWith('{') ? JSON.parse(call.args[0]) : null);
        if (attrs?.userContextId !== CONTAINER) {
            failures.push(`cookies: Services.cookies.${call.name} ran without the agent userContextId (${JSON.stringify(attrs)})`);
        }
    }

    // Cookies act only on the tab's current site (agent-browser-03): a host on another site, or a bare public suffix,
    // is refused before any cookie-service call; a subdomain of the current site is the same site (the detector); an
    // httpOnly cookie's value never leaves chrome.
    w = fresh();
    w.addTab('a1', { agent: true });
    for (const [method, params, what] of [
        ['browser.cookie.get', { url: 'https://other.test/' }, 'a get for another site'],
        ['browser.cookie.set', { name: 'a', value: 'b', domain: 'other.test' }, 'a set for another site'],
        ['browser.cookie.delete', { name: 'a', domain: 'other.test' }, 'a delete for another site'],
        ['browser.cookie.set', { name: 'a', value: 'b', domain: 'com' }, 'a set for a bare public suffix'],
    ]) {
        const calls = w.rec.cookies.length;
        reply = await w.agent('a1', method, params);
        if (reply?.where !== 'failed' || reply?.code !== 'browser_command_unavailable' || w.rec.cookies.length !== calls) {
            failures.push(`cookies: ${what} answered ${JSON.stringify(reply)} after ${w.rec.cookies.length - calls} cookie-service call(s); expected failed browser_command_unavailable and none`);
        }
    }
    const setCalls = w.rec.cookies.length;
    reply = await w.agent('a1', 'browser.cookie.set', { name: 'a', value: 'b', domain: 'www.example.com' });
    if (reply?.where !== 'done' || w.rec.cookies.length === setCalls) {
        failures.push(`cookies: detector blind: a set for a subdomain of the current site answered ${JSON.stringify(reply)} with ${w.rec.cookies.length - setCalls} cookie-service call(s); expected done and a call`);
    }
    reply = await w.agent('a1', 'browser.cookie.get', {});
    const jar = Array.isArray(reply?.result?.cookies) ? reply.result.cookies : [];
    const plain = jar.find(c => c.name === 'a');
    const httpOnly = jar.find(c => c.name === 'sid');
    if (plain?.value !== 'b') failures.push(`cookies: detector blind: cookie.get on the current site answered ${JSON.stringify(reply)}; expected the plain cookie with its value`);
    if (!httpOnly || httpOnly.value !== '' || httpOnly.httpOnly !== true) {
        failures.push(`cookies: cookie.get returned an httpOnly cookie as ${JSON.stringify(httpOnly ?? null)}; expected it listed with httpOnly true and its value withheld`);
    }

    // Mark state: a served call lights it; 20000 ms without one clears it with one push.
    w = fresh();
    w.addTab('a1', { agent: true });
    await w.agent('a1', 'browser.click', { element: '#go' });
    const lit = w.rec.pushes.filter(p => p.kind === 'agentControlChanged');
    if (lit.length !== 1 || lit[0].active !== true || lit[0].stopped !== false || lit[0].tabId !== 'a1') {
        failures.push(`mark: a served call pushed ${JSON.stringify(lit)}; expected one agentControlChanged { tabId a1, active true, stopped false }`);
    }
    w.clock.advance(19999);
    const early = w.rec.pushes.length;
    w.clock.advance(1);
    const idle = w.rec.pushes.slice(early);
    if (early !== 1 || idle.length !== 1 || idle[0].active !== false) {
        failures.push(`mark: 20000 ms without a call did not clear active with exactly one push (pushes before ${early}, at 20000 ms ${JSON.stringify(idle)})`);
    }

    // Stop: aborts an in-flight call, pushes active false and stopped true, and lasts.
    w = fresh();
    w.addTab('a1', { agent: true });
    w.childReplies.set('browser.wait', () => new Promise(() => {}));
    const inFlight = w.agent('a1', 'browser.wait', { selector: '#never' });
    await realTick(5);
    reply = await w.stop('a1');
    const settled = await Promise.race([inFlight, realTick(100).then(() => 'hung')]);
    const last = w.rec.pushes.filter(p => p.kind === 'agentControlChanged').at(-1);
    if (reply?.where !== 'stopped' || settled === 'hung' || settled?.where !== 'agent-stopped' || !w.rec.aborts.some(a => a.message === 'PowerBrowserAgent:Abort')) {
        failures.push(`stop: Stop did not abort an in-flight call (stop ${JSON.stringify(reply)}, call ${JSON.stringify(settled)}, abort messages ${w.rec.aborts.length})`);
    }
    if (last?.active !== false || last?.stopped !== true) {
        failures.push(`stop: Stop pushed ${JSON.stringify(last)}; expected active false and stopped true`);
    }

    // The flag and the container are honoured only at creation, the attribute before append.
    w = fresh();
    const user = w.addTab('u1');
    const where = w.api.webTabOpen(w.theiaBrowser, w.frontend, 'u1', 'https://example.com/', undefined, undefined, null, true);
    if (where !== 'already-open' || user.agent !== undefined) {
        failures.push(`flag: webTabOpen with agent on an already-open user tab answered ${where} and left agent ${JSON.stringify(user.agent)}; expected already-open and the flag unset`);
    }
    const created = w.api.webTabOpen(w.theiaBrowser, w.frontend, 'n1', 'https://example.com/', undefined, undefined, null, true);
    if (created !== 'opened' || w.webTabs.get('n1')?.agent !== true) {
        failures.push(`flag: webTabOpen with agent for a new tab answered ${created} and recorded agent ${JSON.stringify(w.webTabs.get('n1')?.agent)}; expected opened and agent true (positive control)`);
    }
    w.api.webTabOpen(w.theiaBrowser, w.frontend, 'n3', 'https://example.com/', undefined, undefined, null, false);
    const ctx = w.rec.attrs.filter(a => a.name === 'usercontextid');
    const n1 = w.webTabs.get('n1')?.browser;
    const n3 = w.webTabs.get('n3')?.browser;
    if (!ctx.some(a => a.browser === n1 && a.value === String(CONTAINER) && a.appended === false)) {
        failures.push(`container: the agent overlay did not get usercontextid ${CONTAINER} before appendChild (${JSON.stringify(ctx.filter(a => a.browser === n1).map(a => ({ value: a.value, appended: a.appended })))}); the usercontextid attribute was set after appendChild or not at all`);
    }
    if (ctx.some(a => a.browser === n3)) failures.push('container: a user overlay got a usercontextid attribute');
    const bad = await w.openArm({ kind: 'webTabOpen', tabId: 'n2', url: 'https://example.com/', agent: 'yes' }, w.frontend);
    if (bad?.ok !== false || w.webTabs.has('n2')) {
        failures.push(`flag: the webTabOpen arm accepted agent "yes" (${JSON.stringify(bad)}); only exactly true may pass`);
    }

    // Parking (A1): geometry with visible false parks an agent entry and hides a user entry.
    w = fresh();
    const agentEntry = w.addTab('a1', { agent: true });
    const userEntry = w.addTab('u1');
    w.api.webTabGeometry(w.theiaBrowser, 'a1', { x: 10, y: 20, w: 800, h: 600, visible: false });
    w.api.webTabGeometry(w.theiaBrowser, 'u1', { x: 10, y: 20, w: 800, h: 600, visible: false });
    const a = agentEntry.browser.style;
    if (a.visibility !== 'visible' || a.zIndex !== '-1' || a.width !== '800px' || agentEntry.browser.docShellIsActive !== false || agentEntry.parked !== true) {
        failures.push(`parking: an unshown agent tab got visibility ${a.visibility}, zIndex ${a.zIndex}, width ${a.width}, docShellIsActive ${agentEntry.browser.docShellIsActive}, parked ${agentEntry.parked}; expected visible, -1, the sent box, false, true`);
    }
    const u = userEntry.browser.style;
    if (u.visibility !== 'hidden' || u.zIndex === '-1' || userEntry.parked === true) {
        failures.push(`parking: a user tab was parked (visibility ${u.visibility}, zIndex ${u.zIndex}, parked ${userEntry.parked}); a user tab is only ever shown or hidden`);
    }
    if (typeof w.overlayShownToUser === 'function' && w.overlayShownToUser(agentEntry.browser) !== false) {
        failures.push('parking: overlayShownToUser reports a parked agent overlay as shown to the user');
    }
    w.api.webTabGeometry(w.theiaBrowser, 'u1', { x: 0, y: 0, w: 800, h: 600, visible: true });
    w.api.webTabGeometry(w.theiaBrowser, 'a1', { x: 0, y: 0, w: 800, h: 600, visible: true });
    if (typeof w.overlayShownToUser === 'function' && (w.overlayShownToUser(userEntry.browser) !== true || w.overlayShownToUser(agentEntry.browser) !== true || a.zIndex !== '1')) {
        failures.push(`parking: shown overlays are not reported shown (user ${w.overlayShownToUser(userEntry.browser)}, agent ${w.overlayShownToUser(agentEntry.browser)}, agent zIndex ${a.zIndex}); the predicate or the unpark is broken`);
    }

    // Coordinator finding 3: an agent overlay is in its own message manager group (no login manager, no extension tab
    // host) with no autocomplete popup; the pair is registered for that
    // group alone; only alert, confirm and prompt dialogs are an agent's to answer.
    w = fresh();
    w.api.webTabOpen(w.theiaBrowser, w.frontend, 'n1', 'https://example.com/', undefined, undefined, null, true);
    w.api.webTabOpen(w.theiaBrowser, w.frontend, 'n3', 'https://example.com/', undefined, undefined, null, false);
    const attrOf = (id, name) => w.rec.attrs.filter(x => x.browser === w.webTabs.get(id)?.browser && x.name === name);
    const group = attrOf('n1', 'messagemanagergroup');
    if (w.AGENT_MESSAGE_MANAGER_GROUP !== AGENT_GROUP || group.at(-1)?.value !== AGENT_GROUP || group.some(x => x.appended)) {
        failures.push(`isolation: the agent overlay's message manager group is ${JSON.stringify(group.map(x => x.value))} (section constant ${JSON.stringify(w.AGENT_MESSAGE_MANAGER_GROUP)}); expected ${AGENT_GROUP} before append, so the login manager never attaches`);
    }
    if (attrOf('n1', 'autocompletepopup').at(-1)?.value !== '') failures.push('isolation: the agent overlay keeps an autocomplete popup, so saved-entry dropdowns can fill it');
    if (attrOf('n3', 'messagemanagergroup').at(-1)?.value !== 'browsers') failures.push('isolation: a user overlay left the browsers group');
    w.registerAgentActor?.();
    const groups = w.rec.registered.find(r => r.name === 'PowerBrowserAgent')?.options?.messageManagerGroups;
    if (JSON.stringify(groups) !== JSON.stringify([AGENT_GROUP])) failures.push(`isolation: the PowerBrowserAgent pair is registered for ${JSON.stringify(groups)}; expected [${AGENT_GROUP}] alone`);
    w.addTab('a1', { agent: true });
    w.openDialog(w.webTabs.get('a1').browser, 'promptUserAndPass');
    reply = await w.agent('a1', 'browser.dialogAccept', { text: 'x' });
    if (reply?.where !== 'failed' || reply?.code !== 'browser_command_unavailable' || w.rec.answered.length) {
        failures.push(`dialogs: an HTTP auth dialog in an agent tab answered ${JSON.stringify(reply)} with ${JSON.stringify(w.rec.answered)}; expected failed browser_command_unavailable and no answer`);
    }
    w.webTabs.get('a1').agentControl = undefined;
    const w2 = fresh();
    w2.addTab('a1', { agent: true });
    w2.openDialog(w2.webTabs.get('a1').browser, 'alert');
    reply = await w2.agent('a1', 'browser.dialogAccept', {});
    if (reply?.where !== 'done' || w2.rec.answered[0] !== 'accept alert') failures.push(`dialogs: an alert in an agent tab answered ${JSON.stringify(reply)}; expected done (positive control)`);

    // Focus (coordinator finding 1): a parked agent overlay never keeps the shell's focus.
    w = fresh();
    w.api.webTabOpen(w.theiaBrowser, w.frontend, 'a1', 'https://example.com/', undefined, undefined, null, true);
    w.addTab('u1');
    w.api.webTabGeometry(w.theiaBrowser, 'u1', { x: 0, y: 0, w: 800, h: 600, visible: true });
    w.focusEvent(w.webTabs.get('u1').browser);
    if (w.rec.focus.length !== 0) failures.push(`focus: focus landing on the shown user tab was moved (${JSON.stringify(w.rec.focus)}); the guard must leave it alone (positive control)`);
    w.api.webTabGeometry(w.theiaBrowser, 'a1', { x: 0, y: 0, w: 800, h: 600, visible: false });
    w.focusEvent(w.webTabs.get('a1').browser);
    if (w.rec.focus.at(-1) !== 'u1') failures.push(`focus: focus landing on a parked agent overlay was not returned to the shown tab (focus calls ${JSON.stringify(w.rec.focus)})`);
    w.api.webTabGeometry(w.theiaBrowser, 'a1', { x: 0, y: 0, w: 800, h: 600, visible: true });
    w.doc.activeElement = w.webTabs.get('a1').browser;
    const calls = w.rec.focus.length;
    w.api.webTabGeometry(w.theiaBrowser, 'a1', { x: 0, y: 0, w: 800, h: 600, visible: false });
    if (w.rec.focus.length === calls) failures.push('focus: an agent overlay parked while it held the focus kept it');
    return failures;
}

// ---------------------------------------------------------------------------
// The opens clause (D-35, 66-08): no new window, tab or popup for an agent-overlay opener, on every open path.

/** The where values a browserDOMWindow member is called with: the IDL's OPEN_* constants, else the adopt section's. */
export function openWhereNames(idlText, adoptText) {
    const fromIdl = idlText ? [...idlText.matchAll(/const\s+(?:unsigned\s+)?(?:short|long)\s+(OPEN_[A-Z_]+)\s*=/g)].map(m => m[1]) : [];
    if (fromIdl.length) return [...new Set(fromIdl)];
    return [...new Set([...adoptText.matchAll(/\b(OPEN_[A-Z_]+)\b/g)].map(m => m[1]))];
}
// Test inputs for openLinkIn's where (BrowserUtils.whereToOpenLink's answers plus an unknown word), not an expectation.
const LINK_WHERES = ['tab', 'tabshifted', 'window', 'current', 'save', 'planted-where'];

/**
 * The open paths, derived from what installNewWindowReceivers installs: every function it puts on the shell window
 * (openLinkIn) and every browserDOMWindow member that, for a user overlay opener, answers null or an element (an open
 * that Gecko or the receiver carries out). A member answering anything else (canClose) is not an open path.
 */
function openPaths(w) {
    const win = {};
    w.api.installNewWindowReceivers(win);
    const paths = [];
    for (const [name, value] of Object.entries(win)) {
        if (typeof value === 'function') {
            paths.push({ name, idl: false, call: (opener, where) => value('https://example.com/pop', where, { openerBrowser: opener, triggeringPrincipal: { isSystemPrincipal: false } }) });
        } else if (value && typeof value === 'object') {
            for (const [member, fn] of Object.entries(value)) {
                if (typeof fn !== 'function' || member === 'QueryInterface') continue;
                const call = (opener, where) => fn.call(value, { spec: 'https://example.com/pop' }, { openerBrowser: opener, parent: { top: { embedderElement: opener } }, openWindowInfo: null }, where, 0, '');
                paths.push({ name: `${name}.${member}`, idl: true, call });
            }
        }
    }
    return paths;
}

export async function opensClause(sliced, idlText) {
    const failures = [];
    let w;
    try {
        w = makeWorld(sliced);
    } catch (err) {
        return [`broken instrument: the sliced source does not evaluate over the stub boundary (${err.message})`];
    }
    const wheres = openWhereNames(idlText, sliced.adopt);
    if (!wheres.length) return ['broken instrument: no OPEN_* location derived from the IDL or the adopt section'];
    const effects = () => w.rec.created + w.rec.stock.length + w.rec.uriLoads + w.rec.pushes.filter(p => p.kind === 'adoptTab').length;
    const attempt = fn => { try { return { value: fn() }; } catch (err) { return { threw: err }; } };
    // Which candidates are open paths: a user opener's answer at OPEN_NEWTAB (or "tab").
    w.addTab('u1');
    const user = w.webTabs.get('u1').browser;
    const all = openPaths(w);
    const paths = [];
    for (const path of all) {
        const r = attempt(() => path.call(user, path.idl ? 'OPEN_NEWTAB' : 'tab'));
        if (r.threw) failures.push(`opens: ${path.name} threw for a user overlay opener (${r.threw.message}); only an agent opener is refused`);
        else if (r.value === null || r.value === undefined || typeof r.value === 'object') paths.push(path);
    }
    const idlPaths = paths.filter(p => p.idl);
    if (!idlPaths.length || paths.length === idlPaths.length) {
        return [...failures, `broken instrument: derived ${idlPaths.length} browserDOMWindow open member(s) and ${paths.length - idlPaths.length} window function(s) from installNewWindowReceivers`];
    }
    // Detectors: a user opener's tab open creates an overlay through some member and through the link path, and the
    // link path's "window" reaches the stock window.
    const createdBy = paths.filter(p => {
        const before = w.rec.created;
        attempt(() => p.call(user, p.idl ? 'OPEN_NEWTAB' : 'tab'));
        return w.rec.created > before;
    }).map(p => p.name);
    if (!createdBy.some(n => n.startsWith('browserDOMWindow.')) || !createdBy.some(n => !n.startsWith('browserDOMWindow.'))) {
        failures.push(`opens: detector blind: a user overlay opener created an overlay only through [${createdBy.join(', ')}]; a browserDOMWindow member and the link path must each create one`);
    }
    const stockBefore = w.rec.stock.length;
    for (const p of paths.filter(q => !q.idl)) attempt(() => p.call(user, 'window'));
    if (w.rec.stock.length === stockBefore) failures.push('opens: detector blind: a user opener\'s link open with where "window" never reached the stock window');

    // The agent opener: every path, every where, nothing opens. A browserDOMWindow member must throw the guard's
    // failure, because its null makes Gecko open a stock window (ContentParent.cpp:5505-5508).
    w.addTab('a1', { agent: true });
    const agent = w.webTabs.get('a1').browser;
    for (const path of paths) {
        for (const where of path.idl ? wheres : LINK_WHERES) {
            const before = effects();
            const r = attempt(() => path.call(agent, where));
            const opened = effects() - before;
            if (opened) failures.push(`opens: ${path.name} opened something for an agent opener at ${where} (${opened} overlay, stock-window, load or adoptTab call(s))`);
            if (path.idl && r.threw?.result !== ABORT) {
                failures.push(`opens: ${path.name} answered ${r.threw ? `a throw without the guard's failure (${r.threw.message})` : (r.value ? 'an element' : 'null')} for an agent opener at ${where}; a null or element lets Gecko open a window`);
            }
            if (!path.idl && (r.threw || (r.value !== null && r.value !== undefined))) {
                failures.push(`opens: ${path.name} answered ${r.threw ? `a throw (${r.threw.message})` : 'an element'} for an agent opener at ${where}; expected null and nothing opened`);
            }
        }
    }
    // Logged once per tab and path, with no URL.
    const refusals = w.rec.logs.filter(l => l.includes('refused'));
    const perPath = new Set(refusals);
    if (!refusals.length) failures.push('opens: no refusal was logged for an agent opener');
    else if (refusals.length !== perPath.size) failures.push(`opens: a refusal was logged more than once per tab and path (${refusals.length} lines, ${perPath.size} distinct)`);
    if (refusals.some(l => l.includes('example.com'))) failures.push('opens: a refusal log line carries the URL');

    // An agent command during which chrome refused an open answers browser_command_unavailable; one without, done.
    const linkPath = paths.find(p => !p.idl);
    w.childReplies.set('browser.mouseClick', () => { attempt(() => linkPath.call(agent, 'tab')); return Promise.resolve({ where: 'done', result: {} }); });
    const refusedCmd = await w.agent('a1', 'browser.mouseClick', { x: 1, y: 2, button: 'middle' });
    if (refusedCmd?.where !== 'failed' || refusedCmd?.code !== 'browser_command_unavailable') {
        failures.push(`opens: an agent command whose open chrome refused answered ${JSON.stringify(refusedCmd)}; expected failed browser_command_unavailable`);
    }
    w.childReplies.delete('browser.mouseClick');
    const plainCmd = await w.agent('a1', 'browser.mouseClick', { x: 1, y: 2 });
    if (plainCmd?.where !== 'done') failures.push(`opens: an agent command that opened nothing answered ${JSON.stringify(plainCmd)}; expected done (positive control)`);

    // The content wall: an agent overlay carries SANDBOXED_AUXILIARY_NAVIGATION when its first load starts; a user
    // overlay never does.
    const v = makeWorld(sliced);
    v.api.webTabOpen(v.theiaBrowser, v.frontend, 'n1', 'https://example.com/', undefined, undefined, null, true);
    v.api.webTabOpen(v.theiaBrowser, v.frontend, 'n3', 'https://example.com/', undefined, undefined, null, false);
    const load = id => v.rec.loads.find(l => l.tabId === id);
    if (!load('n1') || !load('n3')) failures.push('broken instrument: webTabOpen started no first load, so the content wall is unchecked');
    else {
        if (!(load('n1').sandboxFlags & SANDBOXED_AUXILIARY_NAVIGATION)) failures.push(`opens: the agent overlay's first load started without SANDBOXED_AUXILIARY_NAVIGATION (flags ${load('n1').sandboxFlags}), so its page can open popups`);
        if (load('n3').sandboxFlags & SANDBOXED_AUXILIARY_NAVIGATION) failures.push('opens: a user overlay got SANDBOXED_AUXILIARY_NAVIGATION');
    }
    return { failures, paths: paths.map(p => p.name), wheres: wheres.length };
}

// ---------------------------------------------------------------------------
// Walls outside the receivers (66-09, D-37): downloads, external protocols, the initial document.

/** A #define-free C++ constant table: NAME -> value, from `const unsigned long NAME = 0x...;`. */
function cppConstants(text) {
    return new Map([...(text ?? '').matchAll(/const\s+unsigned\s+long\s+([A-Z_]+)\s*=\s*(0x[0-9A-Fa-f]+|\d+)\s*;/g)].map(m => [m[1], Number(m[2])]));
}

/** The sandbox bits a forbidden download is classified by: the flags ClassifyDownload tests, valued from the header. */
export function downloadSandboxBits(sliced, sandboxH, classify) {
    const body = /ClassifyDownload\(nsIChannel\* aChannel\)\s*\{([\s\S]*?)\n\}/.exec(classify ?? '')?.[1];
    const table = cppConstants(sandboxH);
    if (body && table.size) {
        const names = [...new Set([...body.matchAll(/&\s*(SANDBOXED_[A-Z_]+)/g)].map(m => m[1]))];
        const bits = names.map(n => table.get(n));
        if (!names.length || bits.some(b => !Number.isInteger(b))) return { error: `broken instrument: ClassifyDownload's sandbox flags [${names.join(', ')}] were not all found in ${SANDBOX_H}` };
        return { bits: bits.reduce((a, b) => a | b, 0), names, from: 'the pin' };
    }
    const own = /const SANDBOXED_DOWNLOADS = (0x[0-9A-Fa-f]+);/.exec(sliced.section)?.[1];
    return own ? { bits: Number(own), names: ['SANDBOXED_DOWNLOADS'], from: 'the section (no upstream/)' } : { error: 'broken instrument: no download sandbox flag derived from upstream/ or the agent section' };
}

/** The contract LoadURI asks for its dispatch chooser (the pin), else the section's constant. */
export function chooserContract(sliced, exthandler) {
    const pinned = /nsCOMPtr<nsIContentDispatchChooser>\s+chooser\s*=\s*do_CreateInstance\("([^"]+)"/.exec(exthandler ?? '')?.[1];
    if (pinned) return { contract: pinned, from: 'the pin' };
    const own = /const CONTENT_DISPATCH_CHOOSER = "([^"]+)";/.exec(sliced.section)?.[1];
    return own ? { contract: own, from: 'the section (no upstream/)' } : { error: 'broken instrument: no dispatch-chooser contract derived from upstream/ or the agent section' };
}

const fakeChannel = (browser, { isDocument = true, status = ABORT } = {}) => ({
    isDocument, status, URI: { spec: 'https://example.com/file.pdf' }, requestMethod: 'GET', responseStatus: 200, contentType: 'application/pdf',
    loadInfo: { browsingContext: { top: { embedderElement: browser } } },
    QueryInterface() { return this; },
});

export async function wallsClause(sliced, upstream = {}) {
    const failures = [];
    let w;
    try {
        w = makeWorld(sliced);
    } catch (err) {
        return { failures: [`broken instrument: the sliced source does not evaluate over the stub boundary (${err.message})`] };
    }
    const dl = downloadSandboxBits(sliced, upstream.sandboxH, upstream.classify);
    const chooser = chooserContract(sliced, upstream.exthandler);
    if (dl.error) failures.push(dl.error);
    if (chooser.error) failures.push(chooser.error);
    w.api.webTabOpen(w.theiaBrowser, w.frontend, 'd1', 'https://example.com/', undefined, undefined, null, true);
    w.api.webTabOpen(w.theiaBrowser, w.frontend, 'u1', 'https://example.com/', undefined, undefined, null, false);
    const agent = w.webTabs.get('d1')?.browser;
    const user = w.webTabs.get('u1')?.browser;
    if (!agent || !user) return { failures: [...failures, 'broken instrument: webTabOpen did not register the agent and user overlays'] };
    const loadFlags = id => w.rec.loads.find(l => l.tabId === id)?.sandboxFlags ?? null;

    // Downloads: the wall's bits on the agent overlay's first load, never on a user overlay's.
    if (!dl.error) {
        if (loadFlags('d1') === null || loadFlags('u1') === null) failures.push('broken instrument: webTabOpen started no first load, so the download wall is unchecked');
        else {
            if ((loadFlags('d1') & dl.bits) !== dl.bits) failures.push(`downloads: the agent overlay's first load started without ${dl.names.join(', ')} (flags ${loadFlags('d1')}), so its page can save a file and open its viewer in a stock window`);
            if (loadFlags('u1') & dl.bits) failures.push(`downloads: a user overlay got ${dl.names.join(', ')}, so the user's own downloads would be refused`);
        }
    }
    // Downloads: every registered network observer, every topic it registered for, fired during an agent command.
    const fireAll = channel => { for (const { observer, topic } of w.rec.observers) { try { observer.observe(channel, topic); } catch { /* an observer that throws is judged by its effect */ } } };
    if (!w.rec.observers.length) failures.push('downloads: the agent section registered no network observer, so a download the wall cancelled can fail no command');
    const during = async (channel) => {
        w.childReplies.set('browser.click', () => { fireAll(channel); return Promise.resolve({ where: 'done', result: {} }); });
        const reply = await w.agent('d1', 'browser.click', { element: '#dl' });
        w.childReplies.delete('browser.click');
        return reply;
    };
    // The cancel lands after the child's reply (a download is a network round trip away from the click).
    w.childReplies.set('browser.click', () => { setTimeout(() => fireAll(fakeChannel(agent)), 0); return Promise.resolve({ where: 'done', result: {} }); });
    const late = await w.agent('d1', 'browser.click', { element: '#dl' });
    w.childReplies.delete('browser.click');
    if (late?.where !== 'failed' || late?.code !== 'browser_command_unavailable') failures.push(`downloads: a command whose download the wall cancelled after the child's reply answered ${JSON.stringify(late)}; expected failed browser_command_unavailable (the command must settle before answering)`);
    const refused = await during(fakeChannel(agent));
    if (refused?.where !== 'failed' || refused?.code !== 'browser_command_unavailable') failures.push(`downloads: a command during which the wall cancelled the agent overlay's download answered ${JSON.stringify(refused)}; expected failed browser_command_unavailable`);
    for (const [what, channel] of [['a user overlay\'s cancelled download', fakeChannel(user)], ['an agent subresource that was cancelled', fakeChannel(agent, { isDocument: false })], ['an agent document that loaded', fakeChannel(agent, { status: 0 })]]) {
        const reply = await during(channel);
        if (reply?.where !== 'done') failures.push(`downloads: ${what} failed the agent command (${JSON.stringify(reply)}); only a cancelled agent document load is a refused download`);
    }
    await during(fakeChannel(agent));
    const dlLogs = w.rec.logs.filter(l => l.includes('refused a download'));
    if (dlLogs.length !== 1) failures.push(`downloads: a refused download was logged ${dlLogs.length} time(s) for one tab; expected once`);
    if (w.rec.logs.some(l => l.includes('example.com'))) failures.push('downloads: a refusal log line carries the URL');

    // External protocols: the chooser registered for the pinned contract; stock for the user, refusal for the agent.
    if (!chooser.error) {
        const reg = w.rec.factories.filter(f => f.contract === chooser.contract);
        if (reg.length !== 1) failures.push(`protocols: ${reg.length} factories registered for ${chooser.contract} (from ${chooser.from}); expected exactly one, so LoadURI's chooser is Gecko's own for an agent page`);
        else {
            const instance = reg[0].factory.createInstance('nsIContentDispatchChooser');
            const handle = bc => { const before = w.rec.stockChooser.length; try { instance.handleURI({}, { spec: 'pbtest:secret-example.com' }, {}, bc, false); } catch (err) { return `threw ${err.message}`; } return w.rec.stockChooser.length - before; };
            const userBc = { top: { embedderElement: user } };
            const agentBc = { top: { embedderElement: agent } };
            if (handle(userBc) !== 1) failures.push('protocols: detector blind: a user overlay\'s external load did not reach the stock chooser');
            if (handle(null) !== 1) failures.push('protocols: an external load with no browsing context did not reach the stock chooser');
            if (handle(agentBc) !== 0) failures.push('protocols: an agent overlay\'s external load reached the stock chooser (a dialog or a launch)');
            if (handle({ top: agentBc.top, parent: agentBc }) !== 0) failures.push('protocols: an external load from a frame inside an agent overlay reached the stock chooser');
            w.childReplies.set('browser.click', () => { handle(agentBc); return Promise.resolve({ where: 'done', result: {} }); });
            const reply = await w.agent('d1', 'browser.click', { element: '#mailto' });
            w.childReplies.delete('browser.click');
            if (reply?.where !== 'failed' || reply?.code !== 'browser_command_unavailable') failures.push(`protocols: a command whose external load chrome refused answered ${JSON.stringify(reply)}; expected failed browser_command_unavailable`);
            const pLogs = w.rec.logs.filter(l => l.includes('refused a protocol'));
            if (pLogs.length !== 1) failures.push(`protocols: a refused external load was logged ${pLogs.length} time(s) for one tab; expected once`);
            if (w.rec.logs.some(l => l.includes('pbtest:'))) failures.push('protocols: a refusal log line carries the URI');
        }
    }

    // The initial document: only browser.goto runs until the first load commits.
    const v = makeWorld(sliced);
    const entry = v.addTab('i1', { agent: true });
    entry.browser.browsingContext.currentWindowGlobal.isInitialDocument = true;
    for (const method of (v.AGENT_METHODS ?? []).filter(m => m !== 'browser.goto' && SAMPLE_PARAMS[m])) {
        const before = v.pageWork();
        const reply = await v.agent('i1', method, SAMPLE_PARAMS[method]);
        if (reply?.where !== 'failed' || reply?.code !== 'browser_command_unavailable' || v.pageWork() !== before) {
            failures.push(`initial document: ${method} on an agent overlay still on its initial about:blank answered ${JSON.stringify(reply)} after ${v.pageWork() - before} page call(s); expected failed browser_command_unavailable and none`);
        }
    }
    const navBefore = v.rec.nav.length;
    await v.agent('i1', 'browser.goto', SAMPLE_PARAMS['browser.goto']);
    if (v.rec.nav.length === navBefore) failures.push('initial document: browser.goto on the initial about:blank did not navigate, so the tab can never leave it');
    return { failures, dl, chooser };
}

/** One plant per derived open path: its receiver body put back to the pre-D-35 answer (null, or the stock route). */
export function receiverPlants(text) {
    const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
    let method = null;
    walk(ast, n => {
        if (!method && n.type === 'Property' && n.key?.name === 'installNewWindowReceivers' && n.value?.type === 'FunctionExpression') method = n;
    });
    if (!method) return [];
    const plants = [];
    walk(method.value.body, n => {
        if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object?.name === 'win') {
            const name = n.left.property.name;
            if (n.right.type === 'ObjectExpression') {
                for (const prop of n.right.properties) {
                    if (prop.value?.type !== 'FunctionExpression' || prop.key.name === 'QueryInterface' || prop.kind !== 'init') continue;
                    const body = prop.value.body;
                    if (/^\{\s*return (true|false);\s*\}$/.test(text.slice(body.start, body.end))) continue;
                    plants.push({ name: `${name}.${prop.key.name}`, source: text.slice(0, body.start) + '{ return null; }' + text.slice(body.end) });
                }
            } else if (/Function/.test(n.right.type)) {
                plants.push({ name, source: text.slice(0, n.right.start) + '(url, where, params) => { PowerBrowserAPI.openStockTab(url); return null; }' + text.slice(n.right.end) });
            }
        }
    });
    return plants;
}

/** Structural clause (A1): no raw `style.visibility` comparison outside overlayShownToUser. */
export function visibilityReads(text) {
    const src = stripComments(text);
    const predicate = /function overlayShownToUser\([^)]*\)\s*\{[\s\S]*?\n\}/.exec(src);
    if (!predicate) {
        return ['broken instrument: function overlayShownToUser was not found, so the raw-read count has no positive control'];
    }
    if (!/\.style\.visibility\s*[!=]==/.test(predicate[0])) {
        return ['broken instrument: overlayShownToUser carries no style.visibility comparison, so the count has no positive control'];
    }
    const failures = [];
    for (const m of src.matchAll(/\.style\.visibility\s*[!=]==/g)) {
        if (m.index < predicate.index || m.index > predicate.index + predicate[0].length) {
            const line = src.slice(0, m.index).split('\n').length;
            failures.push(`visibility: a raw style.visibility comparison outside overlayShownToUser at stripped line ${line}: ${src.split('\n')[line - 1].trim().slice(0, 120)}`);
        }
    }
    return failures;
}

// ---------------------------------------------------------------------------
// The clipboard clause (66-10, D-38) and the permissions clause (66-10, D-39).

const SHORTCUTS = 'upstream/dom/events/ShortcutKeyDefinitions.cpp';
const CLIPBOARD_IDL = 'upstream/dom/webidl/Clipboard.webidl';
const EVENT_NAMES = 'upstream/dom/events/EventNameList.inc';
const PERMISSION_MANAGER = 'upstream/extensions/permissions/PermissionManager.cpp';
const STATIC_PREFS = 'upstream/modules/libpref/init/StaticPrefList.yaml';
const BRANDING_DIR = 'powerbrowser/branding';
const AGENT_PAGE_ACTOR = 'PowerBrowserAgentPage';
// The platforms PowerBrowser builds for; an #if branch naming none of them (Android, Emacs-only) is not ours.
const OUR_PLATFORMS = /\b(XP_WIN|MOZ_WIDGET_GTK|MOZ_WIDGET_COCOA)\b/;
const canonicalBinding = b => { const parts = b.split('+'); const key = parts.pop(); return [...parts.sort(), key].join('+'); };

/** The clipboard bindings of the pinned shortcut tables, as modifiers+key (accel kept), for our platforms. */
export function clipboardBindings(text) {
    const lines = (text ?? '').replace(/\\\n/g, ' ').split('\n');
    const stack = [];
    const found = new Set();
    for (const line of lines) {
        const pre = /^\s*#\s*(if|ifdef|ifndef|elif|else|endif)\b(.*)$/.exec(line);
        if (pre) {
            if (pre[1] === 'endif') stack.pop();
            else if (pre[1] === 'else') stack[stack.length - 1] = true; // the other branch may be ours: conservative
            else if (pre[1] === 'elif') stack[stack.length - 1] = OUR_PLATFORMS.test(pre[2]) || stack[stack.length - 1];
            else stack.push(pre[1] === 'if' && /^\s*!/.test(pre[2]) ? true : OUR_PLATFORMS.test(pre[2]));
            continue;
        }
        const m = /\{\s*u"keypress",\s*(?:u"VK_([A-Z_]+)"|nullptr),\s*(?:u"(.)"|nullptr),\s*(?:u"([a-z,]+)"|nullptr),\s*u"(cmd_\w+)"\s*\}/.exec(line);
        if (!m || !/^cmd_(copy|cut|paste)/i.test(m[4]) || stack.some(s => !s)) continue;
        const key = m[1] ? m[1][0] + m[1].slice(1).toLowerCase() : m[2].toLowerCase();
        found.add(canonicalBinding([...(m[3] ? m[3].split(',') : []), key].join('+')));
    }
    return [...found].sort();
}

/** The methods of the pinned `interface Clipboard`. */
export function clipboardMethods(idl) {
    const body = /interface\s+Clipboard\s*:\s*EventTarget\s*\{([\s\S]*?)\};/.exec(idl ?? '')?.[1];
    return body ? [...new Set([...body.matchAll(/(\w+)\s*\(/g)].map(m => m[1]))].sort() : [];
}

/** The events of the pinned clipboard event class. */
export function clipboardEvents(list) {
    return [...(list ?? '').replace(/\n\s+/g, ' ').matchAll(/EVENT\((\w+),[^)]*eClipboardEventClass\)/g)].map(m => m[1]).sort();
}

/** The child's tables, functions and the page class, evaluated over a stub actor base. */
function loadChild(childText) {
    const context = vm.createContext({ JSWindowActorChild: class {}, Cc: {}, Ci: {}, Object, Array, Set, Map, Error, Promise, String, JSON });
    return vm.runInContext(`${childText.replace(/^export /gm, '')}\n;({ agentPress, AGENT_CLIPBOARD_KEYS, AGENT_CLIPBOARD_METHODS, AGENT_CLIPBOARD_EVENTS, PowerBrowserAgentPageChild, AgentRowError })`, context, { filename: CHILD });
}

const setDiff = (a, b) => a.filter(x => !b.includes(x));

export async function clipboardClause(sliced, text, childText, upstream = {}) {
    const failures = [];
    let child;
    try {
        child = loadChild(childText);
    } catch (err) {
        return { failures: [`broken instrument: ${CHILD} does not evaluate over the stub actor base (${err.message})`] };
    }
    const own = [...(child.AGENT_CLIPBOARD_KEYS ?? [])].map(canonicalBinding).sort();
    const pinned = upstream.shortcuts ? clipboardBindings(upstream.shortcuts) : null;
    if (pinned && !pinned.length) failures.push(`broken instrument: no clipboard binding was derived from ${SHORTCUTS}`);
    const bindings = pinned ?? own;
    if (pinned && pinned.length) {
        for (const b of setDiff(pinned, own)) failures.push(`clipboard: the pinned shortcut tables bind ${b} to a clipboard command, and the child's AGENT_CLIPBOARD_KEYS lacks it`);
        for (const b of setDiff(own, pinned)) failures.push(`clipboard: the child's AGENT_CLIPBOARD_KEYS has ${b}, which no pinned clipboard binding has (stale table)`);
    }
    if (!bindings.length) failures.push('broken instrument: no clipboard binding to drive');

    // The key refusal: every binding, accel as Control and as Meta, is refused before any key; controls still type.
    const press = combo => {
        const sent = [];
        const tip = { keydown: e => sent.push(e.key), keyup: () => undefined };
        const actor = { contentWindow: { KeyboardEvent: class { constructor(_t, init) { Object.assign(this, init); } } } };
        try {
            child.agentPress(actor, tip, combo);
            return { sent, code: null };
        } catch (err) {
            return { sent, code: err?.code ?? 'threw' };
        }
    };
    const WORD = { accel: ['Control', 'Meta'], control: ['Control'], shift: ['Shift'], alt: ['Alt'], meta: ['Meta'] };
    for (const binding of bindings) {
        const parts = binding.split('+');
        const key = parts.pop();
        let combos = [[]];
        for (const word of parts) combos = combos.flatMap(c => (WORD[word] ?? [word]).map(n => [...c, n]));
        for (const c of combos) {
            const combo = [...c, key].join('+');
            const r = press(combo);
            if (r.code !== 'browser_command_unavailable' || r.sent.length) failures.push(`clipboard: the agent's ${combo} answered ${r.code ?? 'done'} with ${r.sent.length} key(s) sent; expected browser_command_unavailable and none`);
        }
    }
    for (const combo of ['Control+a', 'Enter', 'Shift+Tab', 'v', 'Insert']) {
        const r = press(combo);
        if (r.code || !r.sent.length) failures.push(`clipboard: detector blind: the control ${combo} answered ${r.code} with ${r.sent.length} key(s) sent, so the refusal is not specific to clipboard keys`);
    }

    // The page wall: derived Clipboard methods and clipboard events against the child and the registration.
    const methods = upstream.clipboardIdl ? clipboardMethods(upstream.clipboardIdl) : [...(child.AGENT_CLIPBOARD_METHODS ?? [])];
    const events = upstream.eventNames ? clipboardEvents(upstream.eventNames) : ['copy', 'cut', 'paste'];
    if (!methods.length) failures.push(`broken instrument: no Clipboard method was derived from ${CLIPBOARD_IDL}`);
    if (!events.length) failures.push(`broken instrument: no clipboard event was derived from ${EVENT_NAMES}`);
    for (const m of setDiff(methods, [...(child.AGENT_CLIPBOARD_METHODS ?? [])])) failures.push(`clipboard: the pinned Clipboard interface has ${m}, which the page wall leaves to the page`);
    let w;
    try {
        w = makeWorld(sliced);
        w.registerAgentActor?.();
    } catch (err) {
        return { failures: [...failures, `broken instrument: registerAgentActor does not run over the stub boundary (${err.message})`] };
    }
    const reg = w.rec.registered.find(r => r.name === AGENT_PAGE_ACTOR)?.options;
    const agentReg = w.rec.registered.find(r => r.name === 'PowerBrowserAgent')?.options;
    if (!reg) failures.push(`clipboard: no ${AGENT_PAGE_ACTOR} pair is registered, so agent pages keep the clipboard`);
    else {
        if (JSON.stringify(reg.messageManagerGroups) !== JSON.stringify([AGENT_GROUP])) failures.push(`clipboard: the ${AGENT_PAGE_ACTOR} pair is registered for ${JSON.stringify(reg.messageManagerGroups)}; expected [${AGENT_GROUP}] alone`);
        if (reg.allFrames !== true) failures.push(`clipboard: the ${AGENT_PAGE_ACTOR} pair is top-frame only, so an agent page's frames keep the clipboard`);
        if (reg.matches || reg.remoteTypes) failures.push(`clipboard: the ${AGENT_PAGE_ACTOR} pair narrows its documents (matches or remoteTypes), so some agent documents keep the clipboard`);
        if (reg.child?.esModuleURI !== agentReg?.child?.esModuleURI) failures.push(`clipboard: the ${AGENT_PAGE_ACTOR} child module is not the agent child's`);
        const ev = reg.child?.events ?? {};
        if (!ev.DOMWindowCreated) failures.push(`clipboard: the ${AGENT_PAGE_ACTOR} pair does not listen for DOMWindowCreated, so the Clipboard methods are never replaced`);
        // Gecko adds a pair's registered events to every content window root, whatever its groups, and a cut or copy listener
        // in a field's event chain enables Cut and Copy on a collapsed caret (EditorBase::CheckForClipboardCommandListener).
        for (const e of events) if (ev[e]) failures.push(`clipboard: the ${AGENT_PAGE_ACTOR} pair registers ${e}, which Gecko listens for on every tab's window root, so Cut and Copy stay enabled on every collapsed caret in every tab`);
    }
    for (const e of setDiff(events, [...(child.AGENT_CLIPBOARD_EVENTS ?? [])])) failures.push(`clipboard: the pinned clipboard event class has ${e}, which the child's AGENT_CLIPBOARD_EVENTS leaves to the page`);
    if (!new RegExp(`export class ${AGENT_PAGE_ACTOR}Child extends JSWindowActorChild`).test(childText)) failures.push(`clipboard: ${CHILD} exports no ${AGENT_PAGE_ACTOR}Child class`);
    if (!new RegExp(`export class ${AGENT_PAGE_ACTOR}Parent extends`).test(text)) failures.push(`clipboard: ${API} exports no ${AGENT_PAGE_ACTOR}Parent class`);

    // Drive the page child: a window with the Clipboard API, one without, and each clipboard event.
    const originals = Object.fromEntries(methods.map(m => [m, () => 'original']));
    const proto = { ...originals };
    class FakeDOMException extends Error { constructor(message, name) { super(message); this.name = name; } }
    const page = { Clipboard: { prototype: proto }, Promise, DOMException: FakeDOMException };
    // The overlay's chrome event handler records each listener the child adds to it.
    const added = [];
    const docShell = { chromeEventHandler: { addEventListener: (type, listener, options) => added.push({ type, listener, options }) } };
    const actor = Object.assign(new child.PowerBrowserAgentPageChild(), { contentWindow: { wrappedJSObject: page }, docShell });
    try {
        actor.handleEvent({ type: 'DOMWindowCreated' });
        Object.assign(new child.PowerBrowserAgentPageChild(), { contentWindow: { wrappedJSObject: { Promise, DOMException: FakeDOMException } }, docShell }).handleEvent({ type: 'DOMWindowCreated' });
    } catch (err) {
        failures.push(`clipboard: the page child threw at DOMWindowCreated (${err.message})`);
    }
    for (const m of methods) {
        let outcome;
        try {
            const r = proto[m]?.call({});
            outcome = r instanceof Promise ? await r.then(() => 'resolved', e => `rejected ${e?.name}`) : `answered ${r}`;
        } catch (err) {
            outcome = `threw ${err.message}`;
        }
        if (outcome !== 'rejected NotAllowedError') failures.push(`clipboard: an agent page's navigator.clipboard.${m} ${outcome}; expected rejected NotAllowedError`);
        const d = Object.getOwnPropertyDescriptor(proto, m);
        if (d && (d.writable || d.configurable)) failures.push(`clipboard: the replaced Clipboard.${m} stays writable or configurable, so page script can put a saved original back`);
    }
    for (const type of events) {
        const seen = [];
        const mine = added.filter(a => a.type === type);
        const capturing = mine.filter(a => (a.options === true || a.options?.capture === true) && !a.options?.mozSystemGroup);
        if (!capturing.length) failures.push(`clipboard: the ${AGENT_PAGE_ACTOR} child does not catch ${type} capturing in the default group on the overlay's chrome event handler, so a page listener runs first or the event writes`);
        try {
            for (const { listener } of capturing) listener({ type, preventDefault: () => seen.push('prevent'), stopImmediatePropagation: () => seen.push('stop') });
        } catch (err) {
            seen.push(`threw ${err.message}`);
        }
        if (!seen.includes('prevent') || !seen.includes('stop')) failures.push(`clipboard: a trusted ${type} in an agent page was ${seen.join(' and ') || 'left alone'}; expected cancelled and stopped, so Gecko writes or pastes nothing and no page listener runs`);
    }
    return { failures, bindings: bindings.length, from: pinned ? 'the pin' : 'the child (no upstream/)', methods, events };
}

/** The pref the pinned PermissionManager reads to keep the userContextId, with its pinned default. */
export function isolationPref(permissionManager, staticPrefs) {
    const accessor = /!StaticPrefs::(\w+)\(\)\)\s*\{\s*flags\s*\|=\s*OriginAttributes::STRIP_USER_CONTEXT_ID/.exec(permissionManager ?? '')?.[1];
    if (!accessor) return { error: `broken instrument: the pref guarding STRIP_USER_CONTEXT_ID was not found in ${PERMISSION_MANAGER}` };
    for (const m of (staticPrefs ?? '').matchAll(/^- name: (\S+)\n\s+type: \w+\n\s+value: (\w+)/gm)) {
        if (m[1].replace(/[.-]/g, '_') === accessor) return { name: m[1], pinned: m[2] };
    }
    return { error: `broken instrument: ${accessor} (${PERMISSION_MANAGER}) names no pref in ${STATIC_PREFS}` };
}

/** branding: { variant: firefox-branding.js text }. Each variant must set the isolation pref to the opposite of the pin. */
export function permissionsClause(upstream = {}, branding = {}) {
    const pref = upstream.permissionManager && upstream.staticPrefs ? isolationPref(upstream.permissionManager, upstream.staticPrefs) : { name: 'permissions.isolateBy.userContext', pinned: 'false', own: true };
    if (pref.error) return { failures: [pref.error] };
    const want = pref.pinned === 'false' ? 'true' : pref.pinned === 'true' ? null : undefined;
    if (want !== 'true') return { failures: [`permissions: the pinned default of ${pref.name} is ${pref.pinned}, not false; re-derive D-39`] };
    const failures = [];
    const variants = Object.keys(branding);
    if (variants.length < 2) failures.push(`broken instrument: ${variants.length} branding variant(s) under ${BRANDING_DIR}`);
    const escaped = pref.name.replace(/\./g, '\\.');
    for (const v of variants) {
        const lines = branding[v].split('\n').filter(l => !/^\s*\/\//.test(l) && l.includes(pref.name));
        const values = lines.map(l => new RegExp(`^pref\\("${escaped}",\\s*(\\w+)\\);$`).exec(l.trim())?.[1] ?? 'unparsed');
        if (values.length !== 1 || values[0] !== want) failures.push(`permissions: ${BRANDING_DIR}/${v}/pref/firefox-branding.js sets ${pref.name} to [${values.join(', ') || 'nothing'}]; expected exactly one pref() to ${want}, so a grant in one container is used in every other`);
    }
    return { failures, pref: pref.name, from: pref.own ? 'the clause (no upstream/)' : 'the pin', variants };
}

// ---------------------------------------------------------------------------
// The page-table clause: lane p66-02's pure dispatch module, transpiled with theia's TypeScript.

const DISPATCH = 'theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts';
const LOGIN_REGISTRY = 'upstream/toolkit/modules/ActorManagerParent.sys.mjs';
const ABILITIES = 'theia/extensions/orca-browser/src/common/orca-browser-abilities.ts';

function loadTs(files) {
    let ts;
    try {
        ts = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('typescript');
    } catch {
        throw new Error('broken instrument: typescript is not installed in theia/');
    }
    const cache = new Map();
    const load = name => {
        if (cache.has(name)) return cache.get(name).exports;
        if (files[name] === undefined) throw new Error(`page-table: ${name} imports a module the clause does not load`);
        const module = { exports: {} };
        cache.set(name, module);
        const js = ts.transpileModule(files[name], { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        vm.runInNewContext(`(function (exports, require, module) {${js}\n})`, { Map, Set, Array, Object, JSON })(module.exports, spec => {
            if (spec === './orca-browser-abilities') return load('abilities');
            throw new Error(`page-table: orca-browser-dispatch.ts imports ${spec}; it may import only ./orca-browser-abilities`);
        }, module);
        return module.exports;
    };
    return load('dispatch');
}

/** files: { dispatch, abilities } source texts, or null when the dispatch module is absent (red). */
export function pageTableClause(files) {
    if (!files) return { failures: [`page-table: ${DISPATCH} is absent, so the page table is unchecked`] };
    let mod;
    try {
        mod = loadTs(files);
    } catch (err) {
        return { failures: [err.message] };
    }
    const failures = [];
    for (const name of ['createPageTable', 'dispatchCommand', 'outcomeOf']) {
        if (typeof mod[name] !== 'function') failures.push(`page-table: orca-browser-dispatch.ts has no ${name} export (present but incomplete is red, never a SKIP)`);
    }
    if (typeof mod.createPageTable !== 'function') return { failures };
    const t = mod.createPageTable();
    const got = [t.bind('p1', 't1'), t.bind('p1', 't2'), t.bind('p2', 't1'), t.tabOf('p9'), t.pageOf('t1')];
    if (got[0] !== 'bound') failures.push(`page-table: binding a new page answered ${JSON.stringify(got[0])}; expected bound`);
    if (got[1] !== 'duplicate-page') failures.push(`page-table: the table accepted a duplicate page (bind of a bound page answered ${JSON.stringify(got[1])})`);
    if (got[2] !== 'duplicate-tab') failures.push(`page-table: the table accepted a second page for a tab (answered ${JSON.stringify(got[2])})`);
    if (got[3] !== undefined) failures.push(`page-table: tabOf an unbound page answered ${JSON.stringify(got[3])}; expected undefined`);
    if (got[4] !== 'p1') failures.push(`page-table: pageOf a bound tab answered ${JSON.stringify(got[4])}; expected p1`);
    if (t.drop('p1') !== true || t.tabOf('p1') !== undefined) failures.push('page-table: drop then tabOf still finds the page');
    return { failures };
}

/** Every pin text the walls, clipboard and permissions clauses derive from (null when upstream/ is absent). */
function readUpstream() {
    return {
        sandboxH: readOptional(SANDBOX_H), classify: readOptional(CLASSIFY), exthandler: readOptional(EXTHANDLER), shortcuts: readOptional(SHORTCUTS),
        clipboardIdl: readOptional(CLIPBOARD_IDL), eventNames: readOptional(EVENT_NAMES), permissionManager: readOptional(PERMISSION_MANAGER), staticPrefs: readOptional(STATIC_PREFS),
    };
}

/** Each tracked branding variant's firefox-branding.js, by variant directory. */
function readBranding() {
    return Object.fromEntries(readdirSync(join(REPO_ROOT, BRANDING_DIR), { withFileTypes: true }).filter(d => d.isDirectory())
        .map(d => [d.name, readOptional(`${BRANDING_DIR}/${d.name}/pref/firefox-branding.js`)]).filter(([, t]) => t !== null));
}

function readOptional(rel) {
    try {
        return readFileSync(join(REPO_ROOT, rel), 'utf8');
    } catch {
        return null;
    }
}

/** Derived from the pin: Gecko's LoginManager actor groups must not include the agent group (SKIP without upstream/). */
export function loginManagerClause(registry) {
    if (registry === null) return { skip: true, failures: [] };
    const body = /\n {2}LoginManager: \{([\s\S]*?)\n {2}\},/.exec(registry)?.[1];
    const groups = body && /messageManagerGroups:\s*\[([^\]]*)\]/.exec(body)?.[1];
    if (!groups) return { failures: ['broken instrument: the LoginManager actor groups were not found in upstream ActorManagerParent.sys.mjs, so the agent group is not proven outside them'] };
    const list = [...groups.matchAll(/"([^"]*)"/g)].map(m => m[1]);
    return { failures: list.includes(AGENT_GROUP) ? [`isolation: Gecko's LoginManager actor is registered for ${AGENT_GROUP}, so saved passwords can fill agent pages`] : [], groups: list };
}

export async function checkSource(text, childText, dispatchFiles, registry = null, idlText = null, upstream = {}, branding = {}) {
    const sliced = sliceSource(text);
    if (sliced.error) return { failures: [sliced.error] };
    const table = pageTableClause(dispatchFiles);
    const login = loginManagerClause(registry);
    const opens = await opensClause(sliced, idlText);
    const openFailures = Array.isArray(opens) ? opens : opens.failures;
    const walls = await wallsClause(sliced, upstream);
    const clipboard = await clipboardClause(sliced, text, childText, upstream);
    const permissions = permissionsClause(upstream, branding);
    const failures = [...clipboard.failures, ...permissions.failures, ...await runScenarios(sliced, childText, 2), ...await runScenarios(sliced, childText, 1), ...visibilityReads(text), ...table.failures, ...login.failures, ...openFailures, ...walls.failures];
    const native = (() => { try { return Object.keys(makeWorld(sliced).AGENT_NATIVE_ROWS ?? {}).length; } catch { return 0; } })();
    return { failures: [...new Set(failures)], native, loginSkip: !!login.skip, paths: opens.paths ?? [], wheres: opens.wheres ?? 0, walls, clipboard, permissions };
}

// ---------------------------------------------------------------------------
// --self-test: mutated copies of the shipped source in memory and a fixture dispatch module; each must go red naming it.

const FIXTURE_DISPATCH = `import * as abilities from './orca-browser-abilities';
export function createPageTable() {
    const byPage = new Map<string, string>();
    const byTab = new Map<string, string>();
    return {
        bind(pageId: string, tabId: string) {
            if (byPage.has(pageId)) return 'duplicate-page';
            if (byTab.has(tabId)) return 'duplicate-tab';
            byPage.set(pageId, tabId);
            byTab.set(tabId, pageId);
            return 'bound';
        },
        tabOf: (pageId: string) => byPage.get(pageId),
        pageOf: (tabId: string) => byTab.get(tabId),
        drop(pageId: string) { const tabId = byPage.get(pageId); if (tabId === undefined) return false; byPage.delete(pageId); byTab.delete(tabId); return true; },
        pages: () => [...byPage.keys()],
    };
}
export function dispatchCommand() { return abilities; }
export function outcomeOf() { return null; }
`;
const FIXTURE_ABILITIES = 'export const ORCA_BROWSER_ABILITIES = [];\n';

async function selfTest() {
    const selfSkips = [];
    const text = readFileSync(join(REPO_ROOT, API), 'utf8');
    const child = readFileSync(join(REPO_ROOT, CHILD), 'utf8');
    const fixture = { dispatch: FIXTURE_DISPATCH, abilities: FIXTURE_ABILITIES };
    const registry = '\n  LoginManager: {\n    allFrames: true,\n    messageManagerGroups: ["browsers", ""],\n  },\n';
    const idl = readOptional(IDL);
    const upstream = readUpstream();
    const branding = readBranding();
    const control = await checkSource(text, child, fixture, registry, idl, upstream, branding);
    if (control.failures.length) {
        console.error(`${NAME} self-test: FAIL -- the shipped source with the fixture dispatch module is already red, so the plants prove nothing:`);
        control.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  control: shipped source and fixture dispatch module -> green`);
    const swap = (from, to) => source => {
        if (!source.includes(from)) throw new Error(`plant anchor not found: ${from.slice(0, 70)}`);
        return source.replace(from, to);
    };
    const plants = [
        ['a method arm without the wall', { api: swap('  if (verdict) {\n    return { ok: true, kind, where: verdict };\n  }\n', '') }, 'wall: browser.click on a user tab'],
        ['the flag honoured on an existing tab', { api: swap('    if (webTabs.has(tabId)) {\n', '    if (webTabs.has(tabId)) {\n      if (agent === true) { webTabs.get(tabId).agent = true; }\n') }, 'flag: webTabOpen with agent on an already-open user tab'],
        ['a user tab parked', { api: swap('  const parked = !visible && entry.agent === true;', '  const parked = !visible;') }, 'parking: a user tab was parked'],
        ['a raw style.visibility read added', { api: swap('    const wasVisible = overlayShownToUser(entry.browser);', '    const wasVisible = entry.browser.style.visibility === "visible";') }, 'visibility: a raw style.visibility comparison outside overlayShownToUser'],
        ['Stop not aborting an in-flight call', { api: swap('    call.abort(agentFailed("browser_owner_unavailable"));\n', '') }, 'stop: Stop did not abort an in-flight call'],
        ['the idle timer not clearing', { api: swap('    control.idleTimer = null;\n    agentSetActive(tabId, entry, false);\n  }, AGENT_IDLE_MS);', '    control.idleTimer = null;\n  }, AGENT_IDLE_MS);') }, 'mark: 20000 ms without a call did not clear active'],
        ['the container attribute set after append', { api: s => swap('    doc.body.appendChild(browser);\n', '    doc.body.appendChild(browser);\n    if (agent === true) { browser.setAttribute("usercontextid", String(userContextId)); }\n')(swap('{ "usercontextid": String(userContextId), messagemanagergroup', '{ messagemanagergroup')(s)) }, 'the usercontextid attribute was set after appendChild'],
        ['a cookie row without the agent userContextId', { api: swap('  return { userContextId: entry.agentUserContextId };', '  return {};') }, 'without the agent userContextId'],
        ['the wall without the container check', { api: swap('entry.agent !== true || !agentInOwnContainer(entry)', 'entry.agent !== true') }, 'on an agent tab whose page is in the default container'],
        ['the parked-focus guard removed', { api: swap('  back?.focus();\n', '') }, 'focus: focus landing on a parked agent overlay was not returned'],
        ['a table accepting a duplicate page', { dispatch: swap("            if (byPage.has(pageId)) return 'duplicate-page';\n", '') }, 'page-table: the table accepted a duplicate page'],
        ['a table accepting a second page for a tab', { dispatch: swap("            if (byTab.has(tabId)) return 'duplicate-tab';\n", '') }, 'page-table: the table accepted a second page for a tab'],
        ['the dispatch module absent', { files: () => null }, 'page-table: theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts is absent'],
        // agent-browser-03: cookie rows act only on the current site and withhold httpOnly values.
        ['cookie rows not limited to the current site', { api: swap('  return site && agentSiteOf(host) === site ? host : "";', '  return host;') }, 'cookies: a get for another site answered'],
        ['an httpOnly cookie value returned', { api: swap('value: c.isHttpOnly ? "" : c.value', 'value: c.value') }, "cookies: cookie.get returned an httpOnly cookie"],
        ['the dispatch file present without createPageTable', { dispatch: swap('export function createPageTable()', 'export function createPageTableGone()') }, 'page-table: orca-browser-dispatch.ts has no createPageTable export'],
        ['the agent overlay left in the browsers group', { api: swap('"usercontextid": String(userContextId), messagemanagergroup: AGENT_MESSAGE_MANAGER_GROUP, ', '"usercontextid": String(userContextId), ') }, "isolation: the agent overlay's message manager group"],
        ['the dialog type filter removed', { api: swap('  if (!AGENT_DIALOG_TYPES.has(win.args?.promptType) || win.args?.inPermitUnload) {\n    return agentFailed("browser_command_unavailable");\n  }\n', '') }, 'dialogs: an HTTP auth dialog in an agent tab'],
        ['a pinned LoginManager actor registered for the agent group', { registry: r => r.replace('["browsers", ""]', '["browsers", "", "powerbrowser-orca-agent"]') }, "isolation: Gecko's LoginManager actor is registered for"],
        ['an empty AGENT_METHODS', { api: s => s.replace(/const AGENT_METHODS = Object\.freeze\(\[[^\]]*\]\);/, 'const AGENT_METHODS = Object.freeze([]);') }, 'broken instrument: AGENT_METHODS is missing or empty'],
        // D-35 (66-08): the shared guards, the content wall, the command code and the log rule.
        ['the link-open guard dropped', { api: swap(' || agentOpenRefused(opener, "link open")) {', ') {') }, 'opens: openLinkIn opened something for an agent opener'],
        ['the InFrame guard dropped', { api: swap('  agentOpenGuard(params?.openerBrowser, "new window");\n', '') }, 'opens: browserDOMWindow.createContentWindowInFrame'],
        ['the in-process guard dropped', { api: swap('  agentOpenGuard(openWindowInfo?.parent?.top?.embedderElement, "new window");\n', '') }, 'opens: browserDOMWindow.createContentWindow answered null'],
        ['the guard answering null instead of throwing', { api: swap('    throw Components.Exception("", Cr.NS_ERROR_ABORT);', '    return null;') }, 'a null or element lets Gecko open a window'],
        ['the content wall removed', { api: swap('  entry.browser.browsingContext.sandboxFlags |= SANDBOXED_AUXILIARY_NAVIGATION | SANDBOXED_DOWNLOADS;\n', '') }, 'started without SANDBOXED_AUXILIARY_NAVIGATION'],
        // D-37 (66-09): the download wall, its detector, the protocol chooser and the initial-document guard.
        ['the download wall dropped from the flag write', { api: swap('sandboxFlags |= SANDBOXED_AUXILIARY_NAVIGATION | SANDBOXED_DOWNLOADS;', 'sandboxFlags |= SANDBOXED_AUXILIARY_NAVIGATION;') }, "downloads: the agent overlay's first load started without SANDBOXED_DOWNLOADS"],
        ['the cancelled-download observer not registered', { api: swap('  Services.obs.addObserver(agentNetworkObserver, "http-on-stop-request");\n', '') }, "downloads: a command during which the wall cancelled the agent overlay's download answered"],
        ['every cancelled agent channel counted as a download', { api: swap('channel.isDocument && channel.status === Cr.NS_ERROR_ABORT', 'channel.status === Cr.NS_ERROR_ABORT') }, 'downloads: an agent subresource that was cancelled failed the agent command'],
        ['the settle after a child-run command dropped', { api: swap('      await agentSettleOpens(entry, control, opensRefused);\n', '') }, "downloads: a command whose download the wall cancelled after the child's reply answered"],
        ['the protocol chooser not installed', { api: swap('  agentNetworkInstall();\n  agentProtocolWallInstall();\n', '  agentNetworkInstall();\n') }, 'protocols: 0 factories registered for @mozilla.org/content-dispatch-chooser;1'],
        ['the protocol chooser handing agent loads to the stock chooser', { api: swap('          if (agentOpenRefused(browsingContext?.top?.embedderElement, "protocol launch")) {', '          if (false) {') }, "protocols: an agent overlay's external load reached the stock chooser"],
        ['the protocol chooser refusing every load', { api: swap('          if (agentOpenRefused(browsingContext?.top?.embedderElement, "protocol launch")) {', '          if (agentOpenRefused(browsingContext?.top?.embedderElement, "protocol launch") || true) {') }, "protocols: detector blind: a user overlay's external load did not reach the stock chooser"],
        ['the initial-document guard dropped', { api: swap('  if (data.method !== "browser.goto" && entry.browser.browsingContext?.currentWindowGlobal?.isInitialDocument === true) {', '  if (false) {') }, 'initial document: browser.click on an agent overlay still on its initial about:blank'],
        ['the initial-document guard refusing browser.goto too', { api: swap('  if (data.method !== "browser.goto" && entry.browser.browsingContext?.currentWindowGlobal?.isInitialDocument === true) {', '  if (entry.browser.browsingContext?.currentWindowGlobal?.isInitialDocument === true) {') }, 'initial document: browser.goto on the initial about:blank did not navigate'],
        ['a refused open not failing the command', { api: swap('    outcome = agentFailed("browser_command_unavailable");\n  }\n  if (control.stopped) {', '  }\n  if (control.stopped) {') }, 'expected failed browser_command_unavailable'],
        ['a refusal logged every time', { api: swap('  if (!entry.agentOpensLogged.has(path)) {', '  if (true) {') }, 'logged more than once per tab and path'],
        // D-38 (66-10): the key refusal, its table, the page wall and its registration.
        ['the clipboard key refusal dropped', { child: swap('  if (agentClipboardKey(parts, key)) {', '  if (false) {') }, "clipboard: the agent's Control+c answered done"],
        ['every key refused', { child: swap('  if (agentClipboardKey(parts, key)) {', '  if (true) {') }, 'clipboard: detector blind: the control Control+a'],
        ['accel matched by Control only', { child: swap('words.has("control") || words.has("meta")', 'words.has("control")') }, "clipboard: the agent's Meta+c answered done"],
        ['the Clipboard methods not replaced', { child: swap('      Object.defineProperty(proto, name, { value: refuse, writable: false, configurable: false });\n', '') }, "clipboard: an agent page's navigator.clipboard.writeText answered original"],
        ['the replaced methods left writable', { child: swap('{ value: refuse, writable: false, configurable: false }', '{ value: refuse, writable: true, configurable: true }') }, 'stays writable or configurable'],
        ['clipboard events not cancelled', { child: swap("function agentClipboardCancel(event) {\n  event.preventDefault();\n", "function agentClipboardCancel(event) {\n") }, 'clipboard: a trusted copy in an agent page was stop'],
        ['the page pair not registered', { api: s => s.replace(/  ChromeUtils\.registerWindowActor\(AGENT_PAGE_ACTOR_NAME, \{[\s\S]*?\n  \}\);\n/, '') }, 'no PowerBrowserAgentPage pair is registered'],
        ['the page pair top-frame only', { api: swap('messageManagerGroups: [AGENT_MESSAGE_MANAGER_GROUP],\n    allFrames: true,', 'messageManagerGroups: [AGENT_MESSAGE_MANAGER_GROUP],\n    allFrames: false,') }, 'pair is top-frame only'],
        ['the page pair in the browsers group too', { api: swap('messageManagerGroups: [AGENT_MESSAGE_MANAGER_GROUP],\n    allFrames: true,', 'messageManagerGroups: [AGENT_MESSAGE_MANAGER_GROUP, "browsers"],\n    allFrames: true,') }, 'pair is registered for ["powerbrowser-orca-agent","browsers"]'],
        ['clipboard caught bubbling', { child: swap('addEventListener(type, agentClipboardCancel, true)', 'addEventListener(type, agentClipboardCancel, false)') }, 'does not catch copy capturing'],
        ['paste left out of the child events', { child: swap('["copy", "cut", "paste"]', '["copy", "cut"]') }, "has paste, which the child's AGENT_CLIPBOARD_EVENTS leaves to the page"],
        // The 39-16 edit-greying regression: registered clipboard events reach every tab's window root.
        ['clipboard events registered on the pair', { api: swap('events: { DOMWindowCreated: {} },', 'events: { DOMWindowCreated: {}, copy: { capture: true } },') }, 'pair registers copy, which Gecko listens for on every tab'],
        ['DOMWindowCreated not listened for', { api: swap('events: { DOMWindowCreated: {} },', 'events: {},') }, 'does not listen for DOMWindowCreated'],
        // D-39 (66-10): the isolation pref in each branding variant.
        ['the pref missing from dev', { branding: b => ({ ...b, dev: b.dev.replace('pref("permissions.isolateBy.userContext", true);\n', '') }) }, 'dev/pref/firefox-branding.js sets permissions.isolateBy.userContext to [nothing]'],
        ['the pref false in release', { branding: b => ({ ...b, release: b.release.replace('pref("permissions.isolateBy.userContext", true);', 'pref("permissions.isolateBy.userContext", false);') }) }, 'release/pref/firefox-branding.js sets permissions.isolateBy.userContext to [false]'],
        ['the pref overridden later in dev', { branding: b => ({ ...b, dev: `${b.dev}pref("permissions.isolateBy.userContext", false);\n` }) }, 'sets permissions.isolateBy.userContext to [true, false]'],
        ['the opens detector blinded (no receivers installed)', { api: swap('    win.openLinkIn = (url, where, params) => adoptLinkIn(url, where, params);\n', '') }, 'broken instrument: derived'],
    ];
    // Pin plants (66-09, 66-10): drift against a pinned table must name it. Only with upstream/.
    if (upstream.shortcuts && upstream.clipboardIdl && upstream.eventNames && upstream.permissionManager && upstream.staticPrefs) {
        const pin = (key, from, to) => u => { if (!u[key].includes(from)) throw new Error(`plant anchor not found: ${from.slice(0, 70)}`); return { ...u, [key]: u[key].replace(from, to) }; };
        plants.push(
            // Compared with the pin, so only with upstream/ (without it the section's or child's own table is the expectation).
            ['the download wall on a different bit', { api: swap('const SANDBOXED_DOWNLOADS = 0x10000;', 'const SANDBOXED_DOWNLOADS = 0x20000;') }, "downloads: the agent overlay's first load started without SANDBOXED_DOWNLOADS"],
            ['Shift+Insert missing from the child table', { child: swap('"control+Insert", "shift+Insert",', '"control+Insert",') }, 'bind shift+Insert to a clipboard command, and the child\'s AGENT_CLIPBOARD_KEYS lacks it'],
            ['a stale binding in the child table', { child: swap('"accel+c", "accel+x",', '"accel+c", "accel+q", "accel+x",') }, 'has accel+q, which no pinned clipboard binding has'],
            ['readText left to the page', { child: swap('["read", "readText", "write", "writeText"]', '["read", "write", "writeText"]') }, 'the pinned Clipboard interface has readText, which the page wall leaves to the page'],
            ['a new pinned clipboard binding', { upstream: pin('shortcuts', 'ShortcutKeyData ShortcutKeys::sInputHandlers[] = {\n', 'ShortcutKeyData ShortcutKeys::sInputHandlers[] = {\n    {u"keypress", nullptr, u"y", u"accel", u"cmd_paste"},\n') }, 'bind accel+y to a clipboard command'],
            ['a new pinned Clipboard method', { upstream: pin('clipboardIdl', 'Promise<DOMString> readText();', 'Promise<DOMString> readText();\n  Promise<undefined> writeImage();') }, 'has writeImage, which the page wall leaves to the page'],
            ['a new pinned clipboard event', { upstream: pin('eventNames', 'EVENT(copy, eCopy,', 'EVENT(beforecopy, eBeforeCopy, EventNameType_HTMLXUL, eClipboardEventClass)\nEVENT(copy, eCopy,') }, 'does not catch beforecopy capturing'],
            ['the pinned isolation default flipped', { upstream: pin('staticPrefs', 'name: permissions.isolateBy.userContext\n  type: RelaxedAtomicBool\n  value: false', 'name: permissions.isolateBy.userContext\n  type: RelaxedAtomicBool\n  value: true') }, 'is true, not false; re-derive D-39'],
            ['the pinned isolation accessor renamed', { upstream: pin('permissionManager', 'StaticPrefs::permissions_isolateBy_userContext()', 'StaticPrefs::permissions_isolateBy_userContextRenamed()') }, 'names no pref in'],
        );
    } else {
        selfSkips.push('upstream/ is not fetched, so the nine pin plants (D-37 download bit, D-38, D-39) did not run. Next step: bash scripts/fetch-upstream.sh');
    }
    // One plant per derived open path, generated from installNewWindowReceivers: the receiver put back to its
    // pre-D-35 answer must go red naming that path.
    const derived = receiverPlants(text);
    if (derived.length < 2) {
        console.error(`${NAME} self-test: FAIL -- broken instrument: ${derived.length} receiver plant(s) derived from installNewWindowReceivers`);
        return 1;
    }
    for (const { name, source } of derived) plants.push([`the ${name} receiver unguarded`, { api: () => source }, `opens: ${name} `]);
    let failed = 0;
    for (const [name, mutate, expect] of plants) {
        let api;
        let files;
        let kid;
        let brand;
        let up;
        try {
            api = mutate.api ? mutate.api(text) : text;
            kid = mutate.child ? mutate.child(child) : child;
            brand = mutate.branding ? mutate.branding(branding) : branding;
            up = mutate.upstream ? mutate.upstream(upstream) : upstream;
            files = mutate.files ? mutate.files() : mutate.dispatch ? { ...fixture, dispatch: mutate.dispatch(fixture.dispatch) } : fixture;
            var reg = mutate.registry ? mutate.registry(registry) : registry;
        } catch (err) {
            console.error(`${NAME} self-test: FAIL -- '${name}': ${err.message}`);
            failed++;
            continue;
        }
        if (api === text && files === fixture && reg === registry && kid === child && brand === branding && up === upstream) {
            console.error(`${NAME} self-test: FAIL -- '${name}' changed nothing; its anchor has drifted`);
            failed++;
            continue;
        }
        const { failures } = await checkSource(api, kid, files, reg, idl, up, brand);
        if (failures.some(f => f.includes(expect))) {
            console.log(`  ok  ${name} -> red, naming '${expect}'`);
        } else {
            console.error(`${NAME} self-test: FAIL -- '${name}' did not go red naming '${expect}'; got: ${failures.join(' | ') || '(green)'}`);
            failed++;
        }
    }
    const code = verdictExit(`${NAME} self-test`, failed ? ['planted fault(s) above did not go red'] : [], selfSkips);
    if (code === 0) console.log(`${NAME} self-test: PASS -- ${plants.length} planted faults each went red naming the drift`);
    return code;
}

async function main() {
    if (process.argv.includes('--self-test')) return selfTest();
    const text = readFileSync(join(REPO_ROOT, API), 'utf8');
    const child = readFileSync(join(REPO_ROOT, CHILD), 'utf8');
    const dispatch = readOptional(DISPATCH);
    const files = dispatch === null ? null : { dispatch, abilities: readOptional(ABILITIES) ?? undefined };
    const upstream = readUpstream();
    const registry = readOptional(LOGIN_REGISTRY);
    const idl = readOptional(IDL);
    const { failures, native, loginSkip, paths, wheres, walls, clipboard, permissions } = await checkSource(text, child, files, registry, idl, upstream, readBranding());
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the chrome side of the Orca agent bridge can reach a tab it did not create as an agent tab, or the drift below.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    // A pinned Gecko text that is absent leaves its clause on the section's own constant (or, for the LoginManager
    // groups, not run at all): a partial run, so SKIP rather than PASS.
    const unpinned = [[LOGIN_REGISTRY, registry], [IDL, idl], ...[SANDBOX_H, CLASSIFY, EXTHANDLER, SHORTCUTS, CLIPBOARD_IDL, EVENT_NAMES, PERMISSION_MANAGER, STATIC_PREFS].map(rel => [rel, readOptional(rel)])]
        .filter(([, t]) => t === null).map(([rel]) => rel);
    if (unpinned.length) {
        console.log(skipLine(NAME, `every clause that ran passed, but ${unpinned.length} pinned Gecko source(s) are absent (${unpinned.join(', ')}), so the clauses derived from them ran against the agent section's own constants or did not run. Next step: bash scripts/fetch-upstream.sh`));
        return SKIP_EXIT;
    }
    const total = /const AGENT_METHODS = Object\.freeze\(\[([^\]]*)\]\)/.exec(text)[1].match(/"browser\.[A-Za-z.]+"/g).length;
    console.log(`${NAME}: PASS -- ${total} methods (${native} native, ${total - native} actor): every one refused before page work for a user, unknown, foreign, wrong-container or stopped tab; ` +
        'the flag and the container are set only at creation and before append; cookies stay in the agent container, act only on the current site and withhold httpOnly values; Stop aborts and lasts; the mark clears after 20000 ms; ' +
        'agent overlays sit in their own message manager group with no autocomplete popup and answer only alert/confirm/prompt dialogs; ' +
        `unshown agent tabs are parked, never hold the focus, and user tabs never park; every visibility read goes through overlayShownToUser; ` +
        `D-35: ${paths.length} open paths derived (${paths.join(', ')}) open nothing for an agent opener at any of ${wheres} OPEN_* locations or ${LINK_WHERES.length} link wheres, ` +
        `refusals log once without the URL and fail the command in flight, and agent overlays load with SANDBOXED_AUXILIARY_NAVIGATION; ` +
        `D-37: agent overlays load with ${walls.dl.names.join(', ')} (from ${walls.dl.from}) and a cancelled agent download fails the command, ` +
        `the ${walls.chooser.contract} chooser (from ${walls.chooser.from}) refuses agent external loads and passes user ones, and only browser.goto runs on the initial about:blank; ` +
        `D-38: ${clipboard.bindings} clipboard key bindings (from ${clipboard.from}) refused to the agent with Control and Meta, the Clipboard methods [${clipboard.methods.join(', ')}] reject and [${clipboard.events.join(', ')}] are cancelled in every agent document; ` +
        `D-39: ${permissions.pref} (from ${permissions.from}) set opposite the pinned default in [${permissions.variants.join(', ')}]; page table compared` +
        (loginSkip ? '' : '; the pinned LoginManager actor groups exclude the agent group'));
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(await main());
}
