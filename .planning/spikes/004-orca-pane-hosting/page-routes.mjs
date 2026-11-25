// Spike 004 (TAB-03): Routes A, B and B' inside PowerBrowser's dock, on the same numbers.
//
//   A        same document. A Theia ReactWidget subclass, defined at runtime in the Theia frame,
//            whose render() returns Orca's PaneRoot through Theia's own React (window.__pbReact).
//            The library bundle (pb-lib, externals) and its stylesheet load from the orcad origin
//            as a classic script and a link element.
//   B        a Theia BaseWidget holding an iframe of the pane page on the orcad origin.
//   B'       one PB web tab (chrome-owned xul:browser overlay) per pane page.
//
// window.__pbReact comes from the LANE's Theia build: Theia's frontend is one esbuild bundle with
// no chunk-loading global, so its React cannot be reached from outside at runtime. The lane build
// appends one line to the generated, git-ignored src-gen/frontend/index.js that publishes React,
// react-dom, react-dom/client, react/jsx-runtime, ReactWidget and BaseWidget (README, Setup).
// No tracked file under theia/ changes; measure.mjs points PB_BACKEND_MAIN at that build.
//
// Observation is read-only (P61-11), never the workspaceSession localStorage key:
//   A   PbPane.subscribeTabs (the renderer store) in the Theia frame
//   B   the pane page's {type:'pb-layout', nonce, ...} postMessage, origin and nonce checked
//   B'  a second paired client: the library bundle loaded observe-only in the Theia frame
// The one write is the close.
//
// Page-realm code is built as strings; the pairing input reaches a page over the BiDi socket only.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from '../../../scripts/lib/orca-run.mjs';
import { openWebTab, pollFor, probe, withProbeShell } from '../../../scripts/lib/pb-live-probe.mjs';

const J = JSON.stringify;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const CSS_FILE = join(REPO_ROOT, 'orca', 'out', 'web', 'assets', 'pb-lib', 'pb-pane-lib.css');

// ---------------------------------------------------------------- shared page-realm pieces

/** One pane's state in whichever document holds it (the Theia frame in A, the pane page in B, B'). */
const readPane = tabId => `JSON.stringify((() => {
    const root = document.querySelector('[data-pb-pane-root=${J(tabId)}]');
    const rows = root ? [...root.querySelectorAll('.xterm-rows')].map(e => e.innerText || '').join('\\n') : '';
    let support = null;
    try { support = window.PbPane ? window.PbPane.deviceKeySupport() : null; } catch (e) { support = 'threw: ' + e; }
    return { has: !!root, state: root ? root.getAttribute('data-pb-pane-state') : null,
        xterms: root ? root.querySelectorAll('.xterm').length : 0, rows: rows.slice(-4000),
        w: root ? root.clientWidth : 0, h: root ? root.clientHeight : 0,
        stage: window.__pbPaneState ? window.__pbPaneState.stage : null,
        stageError: window.__pbPaneState && window.__pbPaneState.error ? String(window.__pbPaneState.error).slice(0, 300) : null,
        errors: (window.__pbErrors || []).slice(0, 4), secure: window.isSecureContext, support };
})())`;

const STORE_STATE = `JSON.stringify(window.PbPane ? window.PbPane.state() : null)`;
/** The store's own new-terminal action in the hosting client; returns the trigger time. */
const triggerNewTerminal = worktreeId => `(() => { const at = window.PbPane.now(); window.PbPane.newTerminal(${J(worktreeId)}); return at; })()`;

/** Loads the library bundle into the Theia frame as a classic script (and, for Route A, its sheet). */
const loadLib = (stack, { stylesheet }) => `
    if (!window.__pbReact) return { error: 'window.__pbReact is absent: the sidecar is not the lane Theia build' };
    if (!window.PbPane) {
        ${stylesheet ? `await new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet'; link.href = ${J(stack.libUrl('pb-pane-lib.css'))}; link.setAttribute('data-pb-orca-sheet', '');
            link.onload = resolve; link.onerror = () => reject(new Error('the Orca stylesheet did not load'));
            document.head.appendChild(link);
        });` : ''}
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = ${J(stack.libUrl('pb-pane-lib.js'))};
            script.onload = resolve; script.onerror = () => reject(new Error('the library bundle did not load'));
            document.head.appendChild(script);
        });
    }
    if (!window.PbPane) return { error: 'the library bundle loaded but defined no PbPane global' };
`;

/** The observation log every route writes in the Theia frame. */
const OBS_INIT = `window.__pbObs = window.__pbObs || { events: [], closed: [], rejected: 0, known: [] };`;

// ---------------------------------------------------------------- Route A

const routeA = {
    observeChannel: 'store',
    closeCall: 'store close action closeTerminalTab(tabId) in the Theia document (PbPane.closeTab)',
    async mount(ctx) {
        const { app, stack, result } = ctx;
        const out = await probe(app, `
            ${loadLib(stack, { stylesheet: true })}
            const R = window.__pbReact;
            await window.PbPane.bootstrap({ pairing: ${J(stack.pairingInput)} });
            const pick = await window.PbPane.waitForTerminal(null, 45000, true);
            const shell = get('ApplicationShell');
            class PbPaneWidget extends R.ReactWidget {
                constructor(pick) {
                    super();
                    this.scrollOptions = undefined;
                    this.pick = pick;
                    this.id = 'pb-spike-pane:' + pick.tabId;
                    this.title.label = 'Orca terminal';
                    this.title.caption = pick.tabId;
                    this.title.closable = true;
                    this.update();
                }
                // Theia's React renders Orca's component: one root, one React.
                render() { return R.React.createElement(window.PbPane.PaneRoot, this.pick); }
            }
            window.__pbHost = {
                widgets: {},
                async add(pick) {
                    const widget = new PbPaneWidget(pick);
                    window.__pbHost.widgets[pick.tabId] = widget;
                    await shell.addWidget(widget, { area: 'main' });
                    // The latency clock stops here: the widget is in the dock. Activation is not
                    // awaited (headless, Theia waits about 2 s for a focus that never comes).
                    widget.pbAddedAt = window.PbPane.now();
                    shell.activateWidget(widget.id);
                    return widget;
                },
                dispose(tabId) { const w = window.__pbHost.widgets[tabId]; if (w) w.dispose(); delete window.__pbHost.widgets[tabId]; },
            };
            const widget = await window.__pbHost.add(pick);
            await until(() => !!widget.node.querySelector('[data-pb-pane-state="mounted"]'), 30000);
            return { pick, attached: widget.isAttached, inMain: shell.getWidgets('main').includes(widget),
                renderedInTheiaRoot: !!widget.node.querySelector('[data-pb-pane-state="mounted"]'),
                sameUseState: window.PbPane.reactIdentity.useState === R.React.useState,
                sameCreateRoot: typeof R.ReactDOMClient.createRoot === 'function',
                libReact: window.PbPane.reactVersion, theiaReact: R.React.version };
        `);
        if (out?.error) throw new Error(`Route A assembly: ${out.error}`);
        result.reactCopies = out.sameUseState ? 1 : 2;
        result.reactVersions = { theia: out.theiaReact, bundle: out.libReact };
        result.renderedInTheiaRoot = out.renderedInTheiaRoot;
        result.routeAForm = 'runtime ReactWidget subclass in the Theia frame; React from the lane Theia build (window.__pbReact); no scratch extension';
        result.widgetInMainArea = out.inMain && out.attached;
        ctx.pick = out.pick;
        ctx.hostEval = expr => app.evaluate(expr);
        ctx.paneEval = () => expr => app.evaluate(expr);
    },
    async observe(ctx) {
        await probe(ctx.app, `
            ${OBS_INIT}
            const obs = window.__pbObs;
            obs.known = window.PbPane.state().tabs.map(t => t.id);
            window.PbPane.subscribeTabs(change => {
                for (const ref of change.opened) {
                    if (ref.contentType !== 'terminal' || obs.known.includes(ref.id)) continue;
                    obs.known.push(ref.id);
                    window.__pbHost.add({ worktreeId: ref.worktreeId, tabId: ref.id })
                        .then(w => obs.events.push({ id: ref.id, observedAt: change.at, addedAt: w.pbAddedAt, widgetId: w.id }));
                }
                for (const ref of change.closed) obs.closed.push({ id: ref.id, at: change.at });
            });
            return true;
        `);
    },
    disposeWidget: (ctx, tabId) => ctx.app.evaluate(`window.__pbHost.dispose(${J(tabId)}); true`),
};

// ---------------------------------------------------------------- Route B

/** Every browsing context, nested frames included (app.contexts() lists top-level ones only). */
async function allContexts(app) {
    const tree = await app.send('browsingContext.getTree', {});
    const out = [];
    const walk = (node, top) => { out.push({ context: node.context, url: node.url, top }); for (const child of node.children ?? []) walk(child, false); };
    for (const node of tree.contexts) walk(node, true);
    return out;
}

/** The pane page document that mounted `tabId` (or is observing), found by origin then by its own state. */
async function paneContext(ctx, tabId, { timeoutMs = 60000, top, not } = {}) {
    const { app, stack } = ctx;
    return pollFor(async () => {
        for (const entry of await allContexts(app)) {
            if (!entry.url.startsWith(stack.origin) || (top !== undefined && entry.top !== top) || entry.context === not) continue;
            const state = await app.evaluateIn(entry.context, `JSON.stringify(window.__pbPaneState || null)`).then(JSON.parse, () => null);
            if (state?.stage === 'failed') throw new Error(`the pane page failed: ${String(state.error).slice(0, 300)}`);
            if (state?.stage === 'mounted' && (!tabId || state.tabId === tabId)) return { ...entry, state };
        }
        return undefined;
    }, timeoutMs, `a mounted pane page${tabId ? ` for ${tabId}` : ''}`);
}

const routeB = {
    observeChannel: 'postMessage',
    closeCall: 'store close action closeTerminalTab(tabId) inside a pane document; the Theia parent needs a parent-to-pane postMessage command or the orcad RPC session.tabs.close to reach it (the harness called it over BiDi)',
    async mount(ctx) {
        const { app, stack, result } = ctx;
        const out = await probe(app, `
            if (!window.__pbReact) return { error: 'window.__pbReact is absent: the sidecar is not the lane Theia build' };
            ${OBS_INIT}
            const obs = window.__pbObs;
            const shell = get('ApplicationShell');
            const ORCAD = ${J(stack.origin)};
            const nonces = {};
            class PbFrameWidget extends window.__pbReact.BaseWidget {
                constructor(tabId, url) {
                    super();
                    this.id = 'pb-spike-frame:' + (tabId || 'first');
                    this.title.label = 'Orca terminal';
                    this.title.closable = true;
                    const frame = document.createElement('iframe');
                    frame.src = url;
                    frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
                    this.node.appendChild(frame);
                }
            }
            window.__pbHost = {
                widgets: {},
                // The first pane page carries the pairing input; later ones read the environment
                // the first stored for the orcad origin.
                async add(tabId, pairingFragment) {
                    const nonce = crypto.randomUUID();
                    const query = new URLSearchParams({ nonce, parentOrigin: location.origin, ...(tabId ? { tab: tabId } : { create: '1' }) });
                    const widget = new PbFrameWidget(tabId, ${J(stack.paneBase)} + '?' + query + (pairingFragment || ''));
                    nonces[nonce] = widget.id;
                    window.__pbHost.widgets[tabId || 'first'] = widget;
                    await shell.addWidget(widget, { area: 'main' });
                    widget.pbAddedAt = performance.timeOrigin + performance.now();
                    shell.activateWidget(widget.id);
                    return widget;
                },
                dispose(tabId) { const w = window.__pbHost.widgets[tabId]; if (w) w.dispose(); delete window.__pbHost.widgets[tabId]; },
            };
            // T-61-03: only the orcad origin with a nonce this frame minted is believed.
            window.addEventListener('message', event => {
                const data = event.data;
                if (!data || data.type !== 'pb-layout') return;
                if (event.origin !== ORCAD || !Object.prototype.hasOwnProperty.call(nonces, data.nonce)) { obs.rejected += 1; return; }
                if (data.ready && data.tabId && !obs.known.includes(data.tabId)) obs.known.push(data.tabId);
                for (const ref of data.opened || []) {
                    if (ref.contentType !== 'terminal' || obs.known.includes(ref.id)) continue;
                    obs.known.push(ref.id);
                    window.__pbHost.add(ref.id)
                        .then(w => obs.events.push({ id: ref.id, observedAt: data.at, addedAt: w.pbAddedAt, widgetId: w.id }));
                }
                for (const ref of data.closed || []) obs.closed.push({ id: ref.id, at: data.at });
            });
            const widget = await window.__pbHost.add(null, ${J(stack.fragment)});
            return { attached: widget.isAttached, inMain: shell.getWidgets('main').includes(widget) };
        `);
        if (out?.error) throw new Error(`Route B assembly: ${out.error}`);
        result.widgetInMainArea = out.inMain && out.attached;
        const pane = await paneContext(ctx, null, { top: false });
        ctx.pick = { worktreeId: pane.state.worktreeId, tabId: pane.state.tabId };
        ctx.firstPane = pane.context;
        ctx.hostEval = expr => app.evaluateIn(ctx.firstPane, expr);
        ctx.paneEval = async tabId => {
            const found = tabId === ctx.pick.tabId ? { context: ctx.firstPane } : await paneContext(ctx, tabId, { top: false });
            return expr => app.evaluateIn(found.context, expr);
        };
        result.reactCopies = 1;
        result.reactCopiesNote = 'one bundled React per pane document; the Theia document keeps its own';
    },
    async observe() { /* the listener is installed with the first widget */ },
    disposeWidget: (ctx, tabId) => ctx.app.evaluate(`window.__pbHost.dispose(${J(tabId)}); true`),
    /** The control for the listener: one forged message per rejection rule, both must be counted. */
    async rejections(ctx) {
        const { app } = ctx;
        const before = await app.evaluate('window.__pbObs.rejected');
        const forged = `{ type: 'pb-layout', opened: [{ id: 'forged-tab', unifiedId: 'forged', worktreeId: 'forged', contentType: 'terminal' }], closed: [], at: 0 }`;
        // Wrong origin: the Theia document posts to itself with a guessed nonce.
        await app.evaluate(`window.postMessage(Object.assign(${forged}, { nonce: 'guessed' }), '*'); true`);
        // Right origin, wrong nonce: the pane document posts with a nonce nobody minted.
        await app.evaluateIn(ctx.firstPane, `window.parent.postMessage(Object.assign(${forged}, { nonce: 'not-minted' }), '*'); true`);
        await sleep(500);
        const after = await app.evaluate('window.__pbObs.rejected');
        const forgedWidget = await app.evaluate(`!!window.__pbHost.widgets['forged-tab']`);
        return { rejected: after - before, forgedWidget };
    },
};

// ---------------------------------------------------------------- Route B'

const routeBPrime = {
    observeChannel: 'second-client',
    closeCall: 'store close action closeTerminalTab(tabId) in any paired client (the Theia-frame observer or a pane page), or the orcad RPC session.tabs.close; closing the web tab alone leaves the Orca tab open',
    async mount(ctx) {
        const { app, stack, result } = ctx;
        // Spike 003 machinery, no new Theia code: the stock open handler.
        ctx.firstWebTabId = await openWebTab(app, stack.paneUrl({ create: '1' }));
        const pane = await paneContext(ctx, null, { top: true });
        ctx.pick = { worktreeId: pane.state.worktreeId, tabId: pane.state.tabId };
        ctx.firstPane = pane.context;
        ctx.hostEval = expr => app.evaluateIn(ctx.firstPane, expr);
        ctx.paneEval = async tabId => {
            const found = tabId === ctx.pick.tabId ? { context: ctx.firstPane } : await paneContext(ctx, tabId, { top: true });
            return expr => app.evaluateIn(found.context, expr);
        };
        result.widgetInMainArea = await probe(app, `return webTabs().length >= 1;`);
        result.reactCopies = 1;
        result.reactCopiesNote = 'one bundled React per pane page; the observer in the Theia frame runs on the React of Theia (library bundle, externals)';
    },
    async observe(ctx) {
        const { app, stack } = ctx;
        // A second paired client in the Theia frame: the library bundle, script only (its
        // stylesheet is not loaded), bootstrapped without Orca's document-appearance hook.
        const out = await probe(app, `
            ${loadLib(stack, { stylesheet: false })}
            ${OBS_INIT}
            const obs = window.__pbObs;
            await window.PbPane.bootstrap({ pairing: ${J(stack.pairingInput)}, appearance: false });
            await until(() => window.PbPane.state().ready, 45000);
            await until(() => window.PbPane.state().tabs.length > 0, 15000);
            obs.known = window.PbPane.state().tabs.map(t => t.id);
            const opener = get('WebTabOpenHandler');
            const shell = get('ApplicationShell');
            window.__pbHost = { widgets: {}, dispose(tabId) { const w = window.__pbHost.widgets[tabId]; if (w) w.dispose(); delete window.__pbHost.widgets[tabId]; } };
            window.PbPane.subscribeTabs(change => {
                for (const ref of change.opened) {
                    if (ref.contentType !== 'terminal' || obs.known.includes(ref.id)) continue;
                    obs.known.push(ref.id);
                    // No fragment: the pane page reads the environment the first page stored.
                    // The clock stops when the shell reports the web-tab widget added; the open
                    // handler itself resolves later (activation, chrome acknowledgement).
                    let addedAt = null;
                    const listener = shell.onDidAddWidget(() => { if (addedAt === null) addedAt = window.PbPane.now(); listener.dispose(); });
                    opener.openUrl(${J(stack.paneBase)} + '?tab=' + encodeURIComponent(ref.id)).then(w => {
                        const resolvedAt = window.PbPane.now();
                        window.__pbHost.widgets[ref.id] = w;
                        obs.events.push({ id: ref.id, observedAt: change.at, addedAt: addedAt === null ? resolvedAt : addedAt, openResolvedAt: resolvedAt, widgetId: w.id });
                    });
                }
                for (const ref of change.closed) obs.closed.push({ id: ref.id, at: change.at });
            });
            return { ready: window.PbPane.state().ready, known: obs.known.length, sameUseState: window.PbPane.reactIdentity.useState === window.__pbReact.React.useState };
        `);
        if (out?.error) throw new Error(`Route B' observer: ${out.error}`);
        ctx.result.observerInTheiaFrame = out;
    },
    disposeWidget: (ctx, tabId) => ctx.app.evaluate(`window.__pbHost.dispose(${J(tabId)}); true`),
};

const ROUTES = { a: routeA, b: routeB, 'b-prime': routeBPrime };

// ---------------------------------------------------------------- measurements shared by the routes

async function waitForMarker(ctx, h) {
    const { stack, result } = ctx;
    const evalPane = await ctx.paneEval(ctx.pick.tabId);
    let last = null;
    try {
        await pollFor(async () => {
            last = JSON.parse(await evalPane(readPane(ctx.pick.tabId)));
            return last.xterms > 0 && last.rows.trim().length > 0;
        }, 60000, 'the pane to render a terminal with text');
        h.sendMarker(stack);
        await pollFor(async () => {
            last = JSON.parse(await evalPane(readPane(ctx.pick.tabId)));
            return h.markerCount(last.rows, stack.marker) >= 2;
        }, 30000, 'the pane to show the marker the CLI typed');
    } catch (error) {
        result.mountError = `${error.message}${last?.errors?.length ? `; page errors: ${last.errors.join(' | ')}` : ''}`.slice(0, 600);
    }
    result.xterms = last?.xterms ?? 0;
    result.paneSize = last ? { w: last.w, h: last.h } : null;
    result.markerCount = last ? h.markerCount(last.rows, stack.marker) : 0;
    result.mounted = result.xterms > 0 && result.markerCount >= 2;
    // Cross-origin WebSocket: PTY output typed from outside reached the pane over orcad's socket.
    result.ws = result.mounted ? 'works' : 'fails';
    if (!result.mounted) result.wsError = result.mountError ?? 'no PTY output in the pane';
    result.deviceKeySupport = last?.support ?? null;                 // assumption A2
    result.paneDocumentSecureContext = last?.secure ?? null;
    result.theia = JSON.parse(await ctx.app.evaluate(`(async () => {
        let header = null;
        try { header = (await fetch(location.href, { method: 'HEAD' })).headers.get('content-security-policy'); } catch (e) { header = 'fetch threw: ' + e; }
        const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        return JSON.stringify({ secureContext: window.isSecureContext, cspHeader: header, cspMeta: meta ? meta.content : null });
    })()`));                                                         // assumption A3
    result.connectSrcRefusal = result.mounted ? 'none observed' : 'see wsError';
    h.failIf(!result.mounted, 'mount', result.mountError ?? 'the pane did not show PTY output');
}

const obsEvents = app => app.evaluate('JSON.stringify(window.__pbObs)').then(JSON.parse);

/** Triggers one Orca-side pane open and waits for the Lumino widget added for the new tab id. */
async function observeOnce(ctx, trigger) {
    const before = (await obsEvents(ctx.app)).events.length;
    const triggerAt = await trigger();
    let event = null;
    try {
        event = await pollFor(async () => (await obsEvents(ctx.app)).events[before], 10000, 'a Lumino widget for the new tab');
    } catch { /* a miss is recorded as a miss */ }
    return event ? { tabId: event.id, triggerAt, latencyMs: Math.round((event.addedAt - triggerAt) * 10) / 10,
        observeToAddMs: Math.round((event.addedAt - event.observedAt) * 10) / 10, widgetId: event.widgetId } : { miss: true, triggerAt };
}

async function measureObserve(ctx, h) {
    const { app, stack, result, route } = ctx;
    await route.observe(ctx);
    const first = await observeOnce(ctx, () => ctx.hostEval(triggerNewTerminal(ctx.pick.worktreeId)));
    result.observeChannel = route.observeChannel;
    result.observeTrigger = 'the store new-terminal action (createNewTerminalTab) in the hosting client';
    result.observeLatencyMs = first.miss ? null : first.latencyMs;
    result.observeToAddWidgetMs = first.miss ? null : first.observeToAddMs;
    result.observeWithinOneSecond = !first.miss && first.latencyMs <= 1000;
    h.failIf(first.miss, 'observe', 'no Lumino widget was added for the new Orca tab within 10 s');
    ctx.second = first;
    // The new pane is a real pane, not an empty tab.
    try {
        const evalPane = await ctx.paneEval(first.tabId);
        await pollFor(async () => JSON.parse(await evalPane(readPane(first.tabId))).xterms > 0, 30000, 'the observed pane to render');
        result.observedPaneMounted = true;
    } catch (error) {
        result.observedPaneMounted = false;
        result.observedPaneError = error.message.slice(0, 300);
    }
}

/** The extras after the latency number: a CLI-side open, a second client's view, and the close. */
async function measureObserveExtras(ctx, h) {
    const { app, stack, result, route } = ctx;
    // (a) The same clock with the open made OUTSIDE the hosting client: the Orca CLI. The trigger
    // time is taken before the CLI process starts, so its start-up is inside the number.
    const cli = await observeOnce(ctx, async () => { const at = Date.now(); stack.cli('terminal', 'create', '--worktree', `path:${h.REPO_DIR}`); return at; });
    result.observeLatencyCliMs = cli.miss ? null : cli.latencyMs;
    result.cliCreateBecameTab = !cli.miss;

    // (b) FEATURES Q7: does a second client on the same orcad see a tab another client opened?
    if (ctx.args.route === 'a') {
        await openWebTab(app, stack.paneUrl({ observe: '1' }));
        try {
            const seen = await pollFor(async () => {
                for (const entry of await allContexts(app)) {
                    if (!entry.url.startsWith(stack.origin)) continue;
                    const s = await app.evaluateIn(entry.context, STORE_STATE).then(JSON.parse, () => null);
                    if (s?.terminals?.some(t => t.id === ctx.second.tabId)) return true;
                }
                return false;
            }, 30000, 'the second client to list the tab');
            result.secondClientSeesTab = seen;
        } catch { result.secondClientSeesTab = false; }
    } else {
        // In B and B' the pane that mounted the new tab IS a second client of the same orcad.
        result.secondClientSeesTab = result.observedPaneMounted === true;
    }

    // (c) Close. First the Lumino side alone, then the one Orca-side write.
    const target = ctx.second.tabId;
    const listed = async () => JSON.parse(await ctx.hostEval(STORE_STATE)).terminals.some(t => t.id === target);
    await route.disposeWidget(ctx, target);
    await sleep(1500);
    result.closeLuminoOnlyLeavesOrcaTab = await listed();
    await ctx.hostEval(`window.PbPane.closeTab(${J(target)}); true`);
    let gone = false;
    try { gone = await pollFor(async () => !(await listed()), 10000, 'the Orca tab to close'); } catch { /* recorded */ }
    await sleep(2000);
    result.closeStaysClosed = gone && !(await listed());
    result.closeCall = route.closeCall;
    result.closeObservedByChannel = (await obsEvents(app)).closed.some(c => c.id === target);
    if (route.rejections) {
        const r = await route.rejections(ctx);
        result.rejectedMessages = r.rejected;
        result.forgedMessageAddedWidget = r.forgedWidget;
        h.failIf(r.rejected !== 2 || r.forgedWidget, 'postMessage-check', `expected 2 rejected forged messages and no widget, got ${r.rejected} and widget=${r.forgedWidget}`);
    }
}

// ---------------------------------------------------------------- CSS isolation

const PROPS = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'background-color', 'margin-top', 'margin-bottom',
    'padding-left', 'border-top-width', 'border-top-style', 'border-top-color', 'border-radius', 'box-sizing', 'text-decoration-line', 'cursor', 'list-style-type'];

/**
 * Page-realm helpers. __pbCount counts style rules whose selector list targets html, body,
 * :root, *, .dark or starts with a compound that has no class or id (a bare element, attribute
 * or pseudo selector). A sheet whose rules cannot be read (cross-origin) is counted as unreadable,
 * never as zero rules.
 */
const CSS_HELPERS = `
    window.__pbCount = sheets => {
        const isGlobal = text => text.split(',').some(part => {
            const first = part.trim().split(/[\\s>+~]+/)[0];
            if (!first || first.startsWith('&')) return false;
            if (/^(html|body|:root|\\*)(?![\\w-])/.test(first) || first === '.dark') return true;
            return !/[.#]/.test(first);
        });
        const out = { global: 0, total: 0, sheets: 0, unreadable: 0 };
        const walk = rules => { for (const rule of rules) {
            if (rule.selectorText !== undefined && rule.style) { out.total += 1; if (isGlobal(rule.selectorText)) out.global += 1; }
            if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
        } };
        for (const sheet of sheets) { out.sheets += 1; let rules; try { rules = sheet.cssRules; } catch (e) { out.unreadable += 1; continue; } walk(rules); }
        return out;
    };
    window.__pbStyles = targets => {
        const out = {};
        for (const [name, el] of Object.entries(targets)) {
            if (!el) { out[name + '|present'] = 'absent'; continue; }
            const cs = getComputedStyle(el);
            for (const prop of ${J(PROPS)}) out[name + '|' + prop] = cs.getPropertyValue(prop);
        }
        return out;
    };
    window.__pbTheiaSnapshot = () => {
        let box = document.querySelector('[data-pb-css-probe]');
        if (!box) {
            box = document.createElement('div');
            box.setAttribute('data-pb-css-probe', '');
            box.style.cssText = 'position:absolute;left:-9999px;top:0';
            box.innerHTML = '<button>b</button><input value="i"><a href="#">a</a><h1>h</h1><ul><li>x</li></ul><p>p</p><div data-scroll style="width:100px;height:100px;overflow:scroll"></div>';
            document.body.appendChild(box);
        }
        const out = window.__pbStyles({ html: document.documentElement, body: document.body, button: box.querySelector('button'), input: box.querySelector('input'),
            a: box.querySelector('a'), h1: box.querySelector('h1'), ul: box.querySelector('ul'), p: box.querySelector('p'),
            'theia-shell': document.getElementById('theia-app-shell'), 'theia-tab': document.querySelector('#theia-main-content-panel .lm-TabBar-tab, .lm-TabBar-tab'),
            'theia-toolbar-button': document.querySelector('.pb-chrome-bar button, #theia-top-panel button'), 'theia-input': document.querySelector('.pb-chrome-bar-input, input.theia-input') });
        const scroll = box.querySelector('[data-scroll]');
        out['scrollbar|width'] = String(scroll.offsetWidth - scroll.clientWidth);
        out['html|class'] = document.documentElement.className;
        out['html|style-attribute-length'] = String((document.documentElement.getAttribute('style') || '').length);
        return out;
    };
`;
const paneStyles = tabId => `JSON.stringify((() => {
    const root = document.querySelector('[data-pb-pane-root=${J(tabId)}]');
    if (!root) return null;
    return window.__pbStyles({ root, pane: root.querySelector('.pane'), xterm: root.querySelector('.xterm'), rows: root.querySelector('.xterm-rows'),
        row: root.querySelector('.xterm-rows > div'), viewport: root.querySelector('.xterm-viewport'), helper: root.querySelector('.xterm-helper-textarea'),
        surface: root.querySelector('[data-pane-title-surface]') });
})())`;
const diffMaps = (before, after) => Object.keys({ ...before, ...after }).filter(key => before[key] !== after[key])
    .map(key => ({ key, before: before[key] ?? null, after: after[key] ?? null }));

async function cssBefore(ctx) {
    const { app, result } = ctx;
    const out = JSON.parse(await app.evaluate(`(() => {
        ${CSS_HELPERS}
        const c0 = window.__pbCount(document.styleSheets);
        // The control: one planted global rule must move the counter by exactly one.
        const planted = document.createElement('style');
        planted.textContent = 'html { --pb-spike-control: 1 }';
        document.head.appendChild(planted);
        const c1 = window.__pbCount(document.styleSheets);
        planted.remove();
        const c2 = window.__pbCount(document.styleSheets);
        window.__pbCss = { c0, s0: window.__pbTheiaSnapshot() };
        return JSON.stringify({ c0, plantedDelta: c1.global - c0.global, restored: c2.global === c0.global });
    })()`));
    result.cssControl = { plantedGlobalRules: 1, counterDelta: out.plantedDelta, restoredAfterRemoval: out.restored, theiaDocumentBefore: out.c0 };
    if (out.plantedDelta !== 1 || !out.restored) throw new Error(`css-control: the rule counter is broken (planted 1, counted ${out.plantedDelta})`);
}

async function cssAfter(ctx, h) {
    const { app, stack, result, args } = ctx;
    const out = JSON.parse(await app.evaluate(`JSON.stringify({ c: window.__pbCount(document.styleSheets), s: window.__pbTheiaSnapshot(), before: window.__pbCss })`));
    const computed = diffMaps(out.before.s0, out.s);
    const documentDelta = out.c.global - out.before.c0.global;
    const unreadableDelta = out.c.unreadable - out.before.c0.unreadable;
    let orcaSheet = null;
    if (args.route === 'a') {
        // The Orca sheet is cross-origin in the Theia document, so its rules are unreadable there.
        // The same bytes are parsed in a constructed sheet (sent over BiDi in pieces) and counted.
        const text = readFileSync(CSS_FILE, 'utf8');
        await app.evaluate(`window.__pbCssText = ''; true`);
        for (let i = 0; i < text.length; i += 400000) await app.evaluate(`window.__pbCssText += ${J(text.slice(i, i + 400000))}; true`);
        orcaSheet = JSON.parse(await app.evaluate(`(() => { const sheet = new CSSStyleSheet(); sheet.replaceSync(window.__pbCssText); window.__pbCssText = '';
            return JSON.stringify(window.__pbCount([sheet])); })()`));
        orcaSheet.bytes = text.length;
    }
    result.cssLeakOut = {
        globalRulesAdded: orcaSheet ? orcaSheet.global : documentDelta,
        rulesAdded: orcaSheet ? orcaSheet.total : out.c.total - out.before.c0.total,
        theiaDocumentCounterDelta: documentDelta,
        unreadableSheetsAdded: unreadableDelta,
        orcaSheet,
        computedStyleDiffs: computed.length,
        changed: computed.slice(0, 30),
    };

    // Leak in: the pane's computed styles against the same pane on a standalone page. The first
    // pane is shown again first: a hidden dock tab is display:none, and a document inside a
    // display:none iframe reports empty computed styles (the first full Route B run read 144 blanks).
    if (args.route !== 'b-prime') {
        await probe(app, `const w = window.__pbHost.widgets[${J(ctx.pick.tabId)}] || window.__pbHost.widgets.first; get('ApplicationShell').activateWidget(w.id); await sleep(1500); return w.isVisible;`);
    }
    const evalPane = await ctx.paneEval(ctx.pick.tabId);
    await evalPane(`(() => { ${CSS_HELPERS} return true; })()`);
    const inRoute = JSON.parse(await evalPane(paneStyles(ctx.pick.tabId)));
    const paneBox = JSON.parse(await evalPane(readPane(ctx.pick.tabId)));
    if (paneBox.w === 0 || paneBox.h === 0 || Object.values(inRoute).every(value => value === '')) {
        // Route B, both full runs: the pane iframe has no layout box (0 x 0) in the headless dock,
        // so its document reports empty computed styles. Recorded as not measured, never as zero
        // differences; the run stays red on this sub-check.
        result.cssLeakIn = { measured: false, reason: `the pane has no layout box (${paneBox.w} x ${paneBox.h}); its computed styles read empty`,
            comparedProperties: Object.keys(inRoute).length };
        ctx.deferred.push('css-leak-in: not measurable, the pane has no layout box in this route');
        return;
    }
    await openWebTab(app, stack.paneUrl({ tab: ctx.pick.tabId }));
    const reference = await paneContext(ctx, ctx.pick.tabId, { top: true, not: ctx.firstPane });
    const evalRef = expr => app.evaluateIn(reference.context, expr);
    await pollFor(async () => JSON.parse(await evalRef(readPane(ctx.pick.tabId))).xterms > 0, 30000, 'the reference pane to render');
    await sleep(1500);
    await evalRef(`(() => { ${CSS_HELPERS} return true; })()`);
    const standalone = JSON.parse(await evalRef(paneStyles(ctx.pick.tabId)));
    const leakIn = diffMaps(standalone, inRoute);
    // The control: a planted host-side rule on the pane must show up as a difference.
    await evalPane(`(() => { const s = document.createElement('style'); s.setAttribute('data-pb-css-control', ''); s.textContent = '[data-pb-pane-root] .xterm { letter-spacing: 3px !important }'; document.head.appendChild(s); return true; })()`);
    const planted = diffMaps(standalone, JSON.parse(await evalPane(paneStyles(ctx.pick.tabId))));
    await evalPane(`(() => { document.querySelector('[data-pb-css-control]').remove(); return true; })()`);
    result.cssLeakIn = { computedStyleDiffs: leakIn.length, changed: leakIn.slice(0, 30), comparedProperties: Object.keys(standalone).length,
        controlDelta: planted.length - leakIn.length, reference: 'the same tab on a standalone pane page in a PB web tab' };
    h.failIf(planted.length - leakIn.length < 1, 'css-control', 'a planted host rule on the pane did not register as a leak-in difference');
}

// ---------------------------------------------------------------- memory

/** ChromeUtils.requestProcInfo() from chrome scope: per-process resident memory in bytes. */
async function procInfo(ctx, label) {
    const { app, stack } = ctx;
    await sleep(5000);
    const rows = JSON.parse(await app.evaluateIn(app.chrome, `(async () => {
        const info = await ChromeUtils.requestProcInfo();
        const origins = p => [...new Set((p.windows || []).map(w => { try { return new URL(w.documentURI.spec).origin; } catch (e) { return 'opaque'; } }))];
        return JSON.stringify([info, ...info.children].map(p => ({ pid: p.pid, type: p === info ? 'parent' : p.type, memory: p.memory, origins: origins(p) })));
    })()`));
    const label2 = origin => origin === ctx.theiaOrigin ? 'theia' : origin === stack.origin ? 'orcad' : origin.replace(/:\d+$/, '');
    const labelled = rows.map(row => ({ ...row, origins: row.origins.map(label2) }));
    // The parent plus every child hosting a Theia-origin or orcad-origin document.
    const relevant = labelled.filter(row => row.type === 'parent' || row.origins.includes('theia') || row.origins.includes('orcad'));
    return { label, relevantBytes: relevant.reduce((sum, row) => sum + row.memory, 0), totalBytes: labelled.reduce((sum, row) => sum + row.memory, 0),
        processes: labelled.length, rows: relevant.map(({ pid, ...row }) => row) };
}

function memorySummary(ctx, samples) {
    const [m0, m1, m2, m3] = samples.map(sample => sample.relevantBytes);
    ctx.result.memory = {
        method: 'ChromeUtils.requestProcInfo() through app.evaluateIn(app.chrome, ...), 5 s after each pane settled; sum of the parent and the children whose windows are on the Theia or orcad origin',
        samples,
        firstPaneDeltaBytes: m1 - m0,
        totalDeltaBytes: m3 - m0,
        perPaneDeltaBytes: Math.round((m3 - m0) / 3),
        laterPaneDeltaBytes: Math.round((m3 - m1) / 2),
        // The third pane alone: no one-time cost (bundle load, observer start) is left in it.
        lastPaneDeltaBytes: m3 - m2,
        totalAllProcessesDeltaBytes: samples[3].totalBytes - samples[0].totalBytes,
        notMeasured: 'the Theia backend (Node) and orcad are not Gecko processes and are outside this number',
    };
    ctx.result.memoryPerPaneBytes = ctx.result.memory.perPaneDeltaBytes;
}

// ---------------------------------------------------------------- driver

export async function runRoute(stack, args, result, h) {
    const route = ROUTES[args.route];
    const want = name => args.measure === name || args.measure === 'all';
    await withProbeShell(async app => {
        const ctx = { app, stack, args, result, route, deferred: [] };
        result.theiaBuild = process.env.PB_BACKEND_MAIN ?? '(coordinating workspace)';
        result.theiaOrigin = (await app.evaluate('location.origin')).replace(/:\d+$/, ':<port>');
        ctx.theiaOrigin = await app.evaluate('location.origin');
        const css = want('css') ? { cssBefore, cssAfter } : null;
        const mem = want('memory') ? { procInfo, memorySummary } : null;
        if (css) await css.cssBefore(ctx);
        const samples = [];
        if (mem) samples.push(await mem.procInfo(ctx, 'before the first pane'));
        await route.mount(ctx);
        await waitForMarker(ctx, h);
        if (mem) samples.push(await mem.procInfo(ctx, 'after pane 1'));
        if (want('observe') || mem) {
            await measureObserve(ctx, h);
            if (mem) {
                samples.push(await mem.procInfo(ctx, 'after pane 2'));
                const third = await observeOnce(ctx, () => ctx.hostEval(triggerNewTerminal(ctx.pick.worktreeId)));
                h.failIf(third.miss, 'memory', 'the third pane was not added');
                const evalPane = await ctx.paneEval(third.tabId);
                await pollFor(async () => JSON.parse(await evalPane(readPane(third.tabId))).xterms > 0, 30000, 'the third pane to render');
                samples.push(await mem.procInfo(ctx, 'after pane 3'));
                mem.memorySummary(ctx, samples);
            }
        }
        // After the memory samples: the leak-in reference opens one more pane page, which would
        // otherwise be counted as pane memory (it was, in the first full Route A run).
        if (css) await css.cssAfter(ctx, h);
        if (want('observe')) await measureObserveExtras(ctx, h);
        // A sub-check that could not be measured does not hide the others, and is still a FAIL.
        h.failIf(ctx.deferred.length > 0, ctx.deferred[0]?.split(':')[0] ?? '', ctx.deferred.map(text => text.split(': ').slice(1).join(': ')).join('; '));
    });
}
