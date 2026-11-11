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
// Page-table clause: when lane p66-02's theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts exists, it
// (and ./orca-browser-abilities) is transpiled with theia/node_modules/typescript and its createPageTable must refuse
// a duplicate page and a second page for a tab; while it is absent the PASS line says "page-table clause SKIP (lane
// p66-02 not merged)"; present but missing an export is red, never a SKIP.
//
// Tier: quick (text reads and node:vm; acorn and typescript from theia/node_modules). --self-test is quick and
// hermetic: mutated copies of the shipped source in memory and a fixture dispatch module.
//
// Usage:
//   node scripts/verify-orca-browser-tab-scope.mjs
//   node scripts/verify-orca-browser-tab-scope.mjs --self-test

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-browser-tab-scope';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const CHILD = 'powerbrowser/shell/GroupActorChild.sys.mjs';
const SECTION_START = '// ---- Orca agent bridge (66-03, BRW-03/BRW-04) ----';
const SECTION_END = '// ---- end Orca agent bridge ----';
const ADOPT_START = '// Phase 36 (PROMPT-05): the new-window adopt section.';
const ADOPT_END = '// Phase 36: new-window adopt section end.';
const IDL = 'upstream/dom/interfaces/base/nsIBrowserDOMWindow.idl';

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
    const rec = { actor: [], aborts: [], draws: [], pushes: [], registered: [], attrs: [], cookies: [], nav: [], wm: 0, print: 0, focus: [], logs: [], answered: [], created: 0, stock: [], loads: [], uriLoads: 0 };
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
        const browser = { tabIdHint, appended: false, docShellIsActive: false, ownerDocument: doc, removed: false, attrs };
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
        sleep: () => new Promise(() => {}),
        scheduleSettleCapture: () => {},
        removeTabRow: () => Promise.resolve(),
        webTabNavigate: navigate('navigate'), webTabBack: navigate('back'), webTabForward: navigate('forward'), webTabReload: navigate('reload'),
    };
    const cookieCall = name => (...args) => { rec.cookies.push({ name, args }); return name === 'add' ? { result: 0 } : name.startsWith('get') ? [{ host: 'example.com', name: 'a', path: '/', value: 'b', expiry: 0, isSession: true, sameSite: 1 }] : undefined; };
    const prefs = new Map();
    const Services = {
        prefs: { getIntPref: (name, fallback) => (prefs.has(name) ? prefs.get(name) : fallback), setIntPref: (name, value) => prefs.set(name, value), getBoolPref: (name, fallback) => fallback },
        io: { newURI: spec => ({ spec }) },
        scriptSecurityManager: { createNullPrincipal: () => ({ isSystemPrincipal: false }) },
        cookies: { getCookiesFromHost: cookieCall('getCookiesFromHost'), getCookiesWithOriginAttributes: cookieCall('getCookiesWithOriginAttributes'), add: cookieCall('add'), remove: cookieCall('remove') },
        obs: { addObserver: () => {} },
        wm: { getEnumerator: () => { rec.wm += 1; return dialogs; } },
    };
    const iface = new Proxy({}, { get: () => new Proxy({}, { get: (t, k) => String(k) }) });
    const context = vm.createContext({
        webTabs, PowerBrowserAPI, Services, Ci: iface, Cc: {}, Cr: { NS_ERROR_ABORT: ABORT }, URL,
        Components: { Exception: (message, result) => Object.assign(new Error(message || 'xpcom'), { result }) },
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
        ChromeUtils: { registerWindowActor: (name, options) => rec.registered.push({ name, options }), generateQI: () => () => {} },
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
// The page-table clause: lane p66-02's pure dispatch module, transpiled with theia's TypeScript.

const DISPATCH = 'theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts';
const LOGIN_REGISTRY = 'upstream/toolkit/modules/ActorManagerParent.sys.mjs';
const ABILITIES = 'theia/extensions/orca-browser/src/common/orca-browser-abilities.ts';
export const PAGE_TABLE_SKIP = 'page-table clause SKIP (lane p66-02 not merged)';

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

/** files: { dispatch, abilities } source texts, or null when the dispatch module is absent. */
export function pageTableClause(files) {
    if (!files) return { skip: true, failures: [] };
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

export async function checkSource(text, childText, dispatchFiles, registry = null, idlText = null) {
    const sliced = sliceSource(text);
    if (sliced.error) return { failures: [sliced.error] };
    const table = pageTableClause(dispatchFiles);
    const login = loginManagerClause(registry);
    const opens = await opensClause(sliced, idlText);
    const openFailures = Array.isArray(opens) ? opens : opens.failures;
    const failures = [...await runScenarios(sliced, childText, 2), ...await runScenarios(sliced, childText, 1), ...visibilityReads(text), ...table.failures, ...login.failures, ...openFailures];
    const native = (() => { try { return Object.keys(makeWorld(sliced).AGENT_NATIVE_ROWS ?? {}).length; } catch { return 0; } })();
    return { failures: [...new Set(failures)], native, skip: !!table.skip, loginSkip: !!login.skip, paths: opens.paths ?? [], wheres: opens.wheres ?? 0 };
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
    const text = readFileSync(join(REPO_ROOT, API), 'utf8');
    const child = readFileSync(join(REPO_ROOT, CHILD), 'utf8');
    const fixture = { dispatch: FIXTURE_DISPATCH, abilities: FIXTURE_ABILITIES };
    const registry = '\n  LoginManager: {\n    allFrames: true,\n    messageManagerGroups: ["browsers", ""],\n  },\n';
    const idl = readOptional(IDL);
    const control = await checkSource(text, child, fixture, registry, idl);
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
        ['the content wall removed', { api: swap('  entry.browser.browsingContext.sandboxFlags |= SANDBOXED_AUXILIARY_NAVIGATION;\n', '') }, 'started without SANDBOXED_AUXILIARY_NAVIGATION'],
        ['a refused open not failing the command', { api: swap('    outcome = agentFailed("browser_command_unavailable");\n  }\n  if (control.stopped) {', '  }\n  if (control.stopped) {') }, 'expected failed browser_command_unavailable'],
        ['a refusal logged every time', { api: swap('  if (!entry.agentOpensLogged.has(path)) {', '  if (true) {') }, 'logged more than once per tab and path'],
        ['the opens detector blinded (no receivers installed)', { api: swap('    win.openLinkIn = (url, where, params) => adoptLinkIn(url, where, params);\n', '') }, 'broken instrument: derived'],
    ];
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
        try {
            api = mutate.api ? mutate.api(text) : text;
            files = mutate.dispatch ? { ...fixture, dispatch: mutate.dispatch(fixture.dispatch) } : fixture;
            var reg = mutate.registry ? mutate.registry(registry) : registry;
        } catch (err) {
            console.error(`${NAME} self-test: FAIL -- '${name}': ${err.message}`);
            failed++;
            continue;
        }
        if (api === text && files === fixture && reg === registry) {
            console.error(`${NAME} self-test: FAIL -- '${name}' changed nothing; its anchor has drifted`);
            failed++;
            continue;
        }
        const { failures } = await checkSource(api, child, files, reg, idl);
        if (failures.some(f => f.includes(expect))) {
            console.log(`  ok  ${name} -> red, naming '${expect}'`);
        } else {
            console.error(`${NAME} self-test: FAIL -- '${name}' did not go red naming '${expect}'; got: ${failures.join(' | ') || '(green)'}`);
            failed++;
        }
    }
    if (failed) return 1;
    console.log(`${NAME} self-test: PASS -- ${plants.length} planted faults each went red naming the drift`);
    return 0;
}

async function main() {
    if (process.argv.includes('--self-test')) return selfTest();
    const text = readFileSync(join(REPO_ROOT, API), 'utf8');
    const child = readFileSync(join(REPO_ROOT, CHILD), 'utf8');
    const dispatch = readOptional(DISPATCH);
    const files = dispatch === null ? null : { dispatch, abilities: readOptional(ABILITIES) ?? undefined };
    const { failures, native, skip, loginSkip, paths, wheres } = await checkSource(text, child, files, readOptional(LOGIN_REGISTRY), readOptional(IDL));
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the chrome side of the Orca agent bridge can reach a tab it did not create as an agent tab, or the drift below.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const total = /const AGENT_METHODS = Object\.freeze\(\[([^\]]*)\]\)/.exec(text)[1].match(/"browser\.[A-Za-z.]+"/g).length;
    console.log(`${NAME}: PASS -- ${total} methods (${native} native, ${total - native} actor): every one refused before page work for a user, unknown, foreign, wrong-container or stopped tab; ` +
        'the flag and the container are set only at creation and before append; cookies stay in the agent container; Stop aborts and lasts; the mark clears after 20000 ms; ' +
        'agent overlays sit in their own message manager group with no autocomplete popup and answer only alert/confirm/prompt dialogs; ' +
        `unshown agent tabs are parked, never hold the focus, and user tabs never park; every visibility read goes through overlayShownToUser; ` +
        `D-35: ${paths.length} open paths derived (${paths.join(', ')}) open nothing for an agent opener at any of ${wheres} OPEN_* locations or ${LINK_WHERES.length} link wheres, ` +
        `refusals log once without the URL and fail the command in flight, and agent overlays load with SANDBOXED_AUXILIARY_NAVIGATION${skip ? `; ${PAGE_TABLE_SKIP}` : '; page table compared'}` +
        (loginSkip ? '; login-manager group clause SKIP (no upstream/)' : '; the pinned LoginManager actor groups exclude the agent group'));
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(await main());
}
