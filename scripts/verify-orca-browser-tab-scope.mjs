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
//  b. the visibility reads, from the comment-stripped source: every `style.visibility ===` or `!==` comparison
//     must sit inside overlayShownToUser, whose own comparison is the positive control.
//
// Red on: an agent call on a user tab or an unknown id that reaches the child actor or drawSnapshot; a click on
// an agent tab that does not reach the actor exactly once; a screenshot not drawn once at the window's device
// pixel ratio; a method outside AGENT_METHODS or bad params accepted; the agent flag honoured on an already-open
// tab, or a malformed flag accepted by the open arm; a user tab parked or an unshown agent tab not parked; a raw
// visibility read outside the predicate.
//
// Tier: quick (text reads and node:vm; acorn from theia/node_modules, as verify-sidecar-reap-blocker.mjs).
//
// Usage:
//   node scripts/verify-orca-browser-tab-scope.mjs

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-browser-tab-scope';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const SECTION_START = '// ---- Orca agent bridge (66-03, BRW-03/BRW-04) ----';
const SECTION_END = '// ---- end Orca agent bridge ----';

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
        if (n.type === 'Property' && n.key?.type === 'Identifier' && n.value?.type === 'FunctionExpression' && ['webTabOpen', 'webTabGeometry', 'webTabClose'].includes(n.key.name) && !methods[n.key.name]) {
            methods[n.key.name] = text.slice(n.start, n.end);
        }
        if (n.type === 'FunctionDeclaration' && ['handleWebTabAction', 'webTabIdIsValid', 'tabIdOfBrowser'].includes(n.id?.name)) {
            functions[n.id.name] = { node: n, text: text.slice(n.start, n.end) };
        }
        if (n.type === 'Property' && n.key?.name === 'handleGroupMutation' && n.value?.type === 'FunctionExpression' && !functions.handleGroupMutation) {
            functions.handleGroupMutation = { node: n, text: text.slice(n.start, n.end) };
        }
    });
    for (const name of ['webTabOpen', 'webTabGeometry', 'webTabClose']) {
        if (!methods[name]) return { error: `broken instrument: PowerBrowserAPI.${name} was not found in ${API}` };
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
        methods,
        helpers: [functions.webTabIdIsValid.text, functions.tabIdOfBrowser.text].join('\n'),
        arms: arms.join('\n'),
        openArm,
    };
}

// ---------------------------------------------------------------------------
// The stub boundary.

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
        pending: () => timers.size,
    };
}

/** One world: the sliced source evaluated over fresh stubs that record every boundary call. */
export function makeWorld(sliced, { dpr = 2 } = {}) {
    const rec = { actor: [], aborts: [], draws: [], pushes: [], registered: [], attrs: [], appends: [], logs: [] };
    const clock = fakeClock();
    const webTabs = new Map();
    const childReplies = new Map();
    const shellWin = {
        devicePixelRatio: dpr, innerWidth: 1600, innerHeight: 1000,
        setTimeout: (fn, ms) => clock.setTimeout(fn, ms), clearTimeout: id => clock.clearTimeout(id),
        document: {
            fullscreenElement: null,
            exitFullscreen: () => Promise.resolve(),
            createElementNS: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: mime => `data:${mime};base64,AAAA` }),
        },
    };
    const doc = {
        defaultView: shellWin,
        body: { appendChild(browser) { browser.appended = true; rec.appends.push(browser.tabIdHint); } },
        createXULElement: () => fakeBrowser(null),
    };
    shellWin.document = Object.assign(shellWin.document, { body: doc.body });
    const theiaBrowser = { ownerDocument: doc, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const frontend = { browsingContext: { top: { embedderElement: theiaBrowser } } };
    const otherFrontend = { browsingContext: { top: { embedderElement: theiaBrowser } } };

    function fakeBrowser(tabIdHint) {
        const browser = { tabIdHint, appended: false, docShellIsActive: false, ownerDocument: doc, removed: false };
        const styleWrites = [];
        browser.styleWrites = styleWrites;
        browser.style = new Proxy({}, { set(target, key, value) { target[key] = value; styleWrites.push([key, value]); return true; } });
        browser.setAttribute = (name, value) => rec.attrs.push({ browser, name, value, appended: browser.appended });
        browser.remove = () => { browser.removed = true; };
        browser.removeProgressListener = () => {};
        browser.removeEventListener = () => {};
        const actor = {
            sendQuery(message, data) {
                rec.actor.push({ tab: browser.tabIdHint, message, method: data?.method });
                const reply = childReplies.get(data?.method);
                return reply ? reply(data) : Promise.resolve({ where: 'done', result: { ok: true } });
            },
            sendAsyncMessage(message) { rec.aborts.push({ tab: browser.tabIdHint, message }); },
        };
        browser.browsingContext = {
            currentWindowGlobal: {
                getActor: name => { rec.actor.push({ tab: browser.tabIdHint, getActor: name }); return actor; },
                drawSnapshot: (rect, scale) => { rec.draws.push({ tab: browser.tabIdHint, rect, scale }); return Promise.resolve({ width: 10, height: 10, close() {} }); },
            },
        };
        return browser;
    }

    function addTab(tabId, { agent = false, owner = frontend } = {}) {
        const browser = fakeBrowser(tabId);
        const entry = { browser, owner, uri: `web:${tabId}`, rowKey: `web:${tabId}` };
        if (agent) entry.agent = true;
        webTabs.set(tabId, entry);
        return entry;
    }

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
        firstWebTabLoad: () => Promise.resolve(),
        scheduleSettleCapture: () => {},
        removeTabRow: () => Promise.resolve(),
    };
    const context = vm.createContext({
        webTabs, PowerBrowserAPI,
        sendWebTabPush: (target, payload) => rec.pushes.push(payload),
        showActivationOnAttach: () => {}, resendWebTabSharing: () => {}, tabHostAddTab: () => {}, tabHostDropTab: () => {},
        keepClosedWebTabHistory: () => {}, detachWebTabPageListeners: () => {}, webTabCloseToolbox: () => {},
        webTabPageState: new WeakMap(),
        GroupActorBase: class {},
        GROUP_ACTOR_PARENT_MODULE: 'chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs',
        GROUP_ACTOR_CHILD_MODULE: 'resource://powerbrowser/GroupActorChild.sys.mjs',
        ChromeUtils: { registerWindowActor: (name, options) => rec.registered.push({ name, options }) },
    });
    const program = `${sliced.helpers}\n${sliced.section}\n` +
        `const __api = ({ ${sliced.methods.webTabOpen}, ${sliced.methods.webTabGeometry}, ${sliced.methods.webTabClose} });\n` +
        `async function __actionArms(data, actorRef) { const kind = data?.kind; switch (kind) { ${sliced.arms} default: return null; } }\n` +
        `async function __openArm(data, actorRef) { const kind = data?.kind; switch (kind) { ${sliced.openArm} default: return null; } }\n` +
        `({ AGENT_METHODS: typeof AGENT_METHODS === 'undefined' ? undefined : AGENT_METHODS,
            overlayShownToUser: typeof overlayShownToUser === 'undefined' ? undefined : overlayShownToUser,
            registerAgentActor: typeof registerAgentActor === 'undefined' ? undefined : registerAgentActor,
            api: __api, actionArms: __actionArms, openArm: __openArm })`;
    const out = vm.runInContext(program, context, { filename: API });
    PowerBrowserAPI.webTabOpen = (...args) => out.api.webTabOpen(...args);
    return {
        ...out, rec, clock, webTabs, frontend, otherFrontend, theiaBrowser, addTab, childReplies, shellWin,
        // A throw is an answer too: a plant that breaks a guard must go red by name, never crash the check.
        agent: (tabId, method, params, actorRef = frontend) => Promise.resolve().then(() => out.actionArms({ kind: 'webTabAgent', tabId, method, params }, actorRef)).catch(err => ({ threw: String(err && err.message) })),
        stop: (tabId, actorRef = frontend) => Promise.resolve().then(() => out.actionArms({ kind: 'webTabAgentStop', tabId }, actorRef)).catch(err => ({ threw: String(err && err.message) })),
        pageWork: () => rec.actor.length + rec.draws.length,
    };
}

// ---------------------------------------------------------------------------
// Scenarios. Each returns failure strings; empty means it held.

export async function runScenarios(sliced, dpr = 2) {
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

    // Click on an agent tab reaches the PowerBrowserAgent child exactly once.
    w.addTab('a1', { agent: true });
    let reply = await w.agent('a1', 'browser.click', { element: '#go' });
    const runs = w.rec.actor.filter(c => c.message === 'PowerBrowserAgent:Run' && c.tab === 'a1');
    if (reply?.where !== 'done' || runs.length !== 1 || runs[0].method !== 'browser.click') {
        failures.push(`wall: browser.click on an agent tab answered ${JSON.stringify(reply)} with ${runs.length} PowerBrowserAgent:Run call(s); expected done and exactly one`);
    }
    if (!w.rec.actor.some(c => c.getActor === 'PowerBrowserAgent')) {
        failures.push('wall: browser.click on an agent tab never asked the overlay for the PowerBrowserAgent actor');
    }

    // A user tab and an unknown id are refused before any page work.
    w = fresh();
    w.addTab('u1');
    reply = await w.agent('u1', 'browser.click', { element: '#go' });
    if (reply?.where !== 'not-agent-tab' || w.pageWork() !== 0) {
        failures.push(`wall: browser.click on a user tab answered ${JSON.stringify(reply)} after ${w.pageWork()} actor/drawSnapshot call(s); expected not-agent-tab and none`);
    }
    reply = await w.agent('u1', 'browser.screenshot', {});
    if (reply?.where !== 'not-agent-tab' || w.pageWork() !== 0) {
        failures.push(`wall: browser.screenshot on a user tab answered ${JSON.stringify(reply)} after ${w.pageWork()} actor/drawSnapshot call(s); expected not-agent-tab and none`);
    }
    reply = await w.agent('nope', 'browser.click', { element: '#go' });
    if (reply?.where !== 'unknown-tab' || w.pageWork() !== 0) {
        failures.push(`wall: browser.click on an unknown id answered ${JSON.stringify(reply)}; expected unknown-tab with no page work`);
    }
    w.addTab('a2', { agent: true, owner: w.otherFrontend });
    reply = await w.agent('a2', 'browser.click', { element: '#go' });
    if (reply?.where !== 'unknown-tab' || w.pageWork() !== 0) {
        failures.push(`wall: another frontend's agent tab answered ${JSON.stringify(reply)}; expected unknown-tab with no page work`);
    }

    // Screenshot on an agent tab: one drawSnapshot at the window's device pixel ratio.
    w = fresh();
    w.addTab('a1', { agent: true });
    reply = await w.agent('a1', 'browser.screenshot', {});
    if (reply?.where !== 'done' || w.rec.draws.length !== 1 || w.rec.draws[0].scale !== dpr) {
        failures.push(`screenshot: browser.screenshot on an agent tab answered ${JSON.stringify(reply?.where)} with draws ${JSON.stringify(w.rec.draws)}; expected done and one drawSnapshot at scale ${dpr}`);
    }

    // Validation refusals: a method outside AGENT_METHODS, and bad params.
    w = fresh();
    w.addTab('a1', { agent: true });
    reply = await w.agent('a1', 'browser.upload', { element: '#f', files: ['/etc/passwd'] });
    if (reply?.ok !== false || reply?.reason !== 'validation' || w.pageWork() !== 0) {
        failures.push(`validation: browser.upload (outside AGENT_METHODS) answered ${JSON.stringify(reply)}; expected a validation refusal with no page work`);
    }
    reply = await w.agent('a1', 'browser.click', {});
    if (reply?.ok !== false || reply?.reason !== 'validation' || w.pageWork() !== 0) {
        failures.push(`validation: browser.click without an element answered ${JSON.stringify(reply)}; expected a validation refusal with no page work`);
    }

    // The flag is honoured only at creation.
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
    return failures;
}

/** Structural clause (A1): no raw `style.visibility` comparison outside overlayShownToUser. */
export function visibilityReads(text) {
    const src = stripComments(text);
    const predicate = /function overlayShownToUser\([^)]*\)\s*\{[\s\S]*?\n\}/.exec(src);
    if (!predicate) {
        return ['broken instrument: function overlayShownToUser was not found, so the raw-read count has no positive control'];
    }
    const inside = (predicate[0].match(/\.style\.visibility\s*[!=]==/g) || []).length;
    if (inside === 0) {
        return ['broken instrument: overlayShownToUser carries no style.visibility comparison, so the count has no positive control'];
    }
    const failures = [];
    const re = /\.style\.visibility\s*[!=]==/g;
    for (const m of src.matchAll(re)) {
        if (m.index < predicate.index || m.index > predicate.index + predicate[0].length) {
            const line = src.slice(0, m.index).split('\n').length;
            failures.push(`visibility: a raw style.visibility comparison outside overlayShownToUser at stripped line ${line}: ${src.split('\n')[line - 1].trim().slice(0, 120)}`);
        }
    }
    return failures;
}

export async function checkSource(text) {
    const sliced = sliceSource(text);
    if (sliced.error) return { failures: [sliced.error] };
    const failures = [...await runScenarios(sliced, 2), ...await runScenarios(sliced, 1), ...visibilityReads(text)];
    return { failures: [...new Set(failures)], sliced };
}

async function main() {
    const text = readFileSync(join(REPO_ROOT, API), 'utf8');
    const { failures } = await checkSource(text);
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the chrome side of the Orca agent bridge can reach a tab it did not create as an agent tab, or the drift below.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- agent calls reach the child or drawSnapshot only for agent tabs (user, unknown and foreign ids refused before page work), the flag is set only at creation, unshown agent tabs are parked and user tabs never are, and every visibility read goes through overlayShownToUser`);
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(await main());
}
