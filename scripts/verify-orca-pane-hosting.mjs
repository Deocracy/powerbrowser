#!/usr/bin/env node
// orca-pane-hosting: the v1.7 audit fixes of lane G3b in @powerbrowser/orca-panes, driven through
// the classes' own methods in Node (scripts/lib/ts-unit-loader.mjs transpiles each source in memory
// and stubs every import it does not load for real). No browser, no display, no network.
//
// Clauses (each names its audit item):
//  restart-repair   67-CR-01. A booted client, chrome could-not-start, Restart Orca accepted, chrome
//                   'starting' with no class: the page holds 'restarting' and the poll keeps running
//                   with no page shown; chrome 'ready': the re-pair runs once and the page clears.
//  boot-failed-page 67-WR-02. A failed boot of the pane bundle while chrome is ready shows
//                   pairing-lost, and Reconnect retries the boot instead of reporting success.
//  boot-final       review of 67-WR-02. A boot that failed at the final step shows a class whose
//                   page offers no Reconnect or Restart (they cannot help), and polling stops.
//  stuck-no-offer   67-WR-01. A boot still waiting after six ready polls, with no offer at all,
//                   reports offer-missing and shows pairing-lost.
//  reason-cleared   67-WR-04. A pairing reason reported to chrome is cleared there with
//                   { kind: 'orcaStatus', clientReason: null } when the client verifies again.
//  boot-retry       64-WR-01, pairing-credentials-01. A boot that failed at the load step is tried
//                   again: retry() boots and ready() resolves with the bundle API.
//  retry-assets     review of 64-WR-01. A retry replaces a stylesheet link that failed to load and
//                   keeps one that did not; failed loads leave no loader script behind.
//  close-unbooted   theia-pane-hosting-01 = 64-CR-02. A hosted tab closes in PowerBrowser while the
//                   bundle has not booted; once booted the close goes to Orca and the tab stays.
//  terminal-rekey   64-WR-03 (handed over by G3a). A terminal tab listed first with no leaf and then
//                   with its first leaf keeps its widget and name (planPanes rekey, tracked or
//                   layout-restored); the widget remounts with the leaf's pane key.
//  handoff-both-files, handoff-orcad-port, handoff-orcad-port-unknown, handoff-folder-refused
//                   pairing-credentials-01, 64-WR-01, 67-WR-03, 67-WR-01 on handOff over a real
//                   private bridge folder in a mkdtemp directory.
//  reveal-no-focus  theia-pane-hosting-02. An Orca store activation of a browser row reveals its web
//                   tab and never activates (focuses) it.
//  page-writeback, settings-writeback
//                   65-WR-04. A main-area tab that is not a page writes 'terminal' while the store's
//                   view is a page; the left panel leaving Orca writes 'terminal' while it is settings.
//  creating-closed, creating-refused
//                   theia-pane-hosting-05. The first store report with no creation pending closes a
//                   restored creating tab; once reported, pb-orca:creating opens nothing.
//  prune-unknown    theia-pane-hosting-03. An unknown reference set prunes no tombstone.
//
// Tier: quick. One named SKIP when theia/node_modules/typescript is absent. --self-test plants
// each pre-fix fault in memory (never on disk); each must go red naming its clause.
//
// Usage:
//   node scripts/verify-orca-pane-hosting.mjs
//   node scripts/verify-orca-pane-hosting.mjs --self-test

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SKIP_EXIT, skipLine, verdictExit } from './lib/skip-verdict.mjs';
import { REPO_ROOT, StubEmitter, flush, loadTs, typescript } from './lib/ts-unit-loader.mjs';

const SELF = fileURLToPath(import.meta.url);

const NAME = 'orca-pane-hosting';
const PANES = 'theia/extensions/orca-panes/src';
const REL = {
    status: `${PANES}/browser/failure/orca-hosting-status.ts`,
    copy: `${PANES}/browser/failure/orca-failure-copy.ts`,
    bundle: `${PANES}/browser/orca-pane-bundle.ts`,
    widget: `${PANES}/browser/orca-pane-widget.tsx`,
    backend: `${PANES}/node/orca-panes-backend-module.ts`,
    policy: `${PANES}/node/offer-file-policy.ts`,
    protocol: `${PANES}/common/orca-panes-protocol.ts`,
    observer: `${PANES}/browser/orca-pane-observer.ts`,
    routes: `${PANES}/browser/orca-pane-routes.ts`,
    sync: `${PANES}/browser/side-panel/orca-side-panel-sync.ts`,
    nameMap: `${PANES}/browser/restore/orca-pane-name-map.ts`,
};

const quiet = async run => {
    const saved = { info: console.info, warn: console.warn, log: console.log };
    console.info = console.warn = console.log = () => undefined;
    try {
        return await run();
    } finally {
        Object.assign(console, saved);
    }
};

// ---------------------------------------------------------------- window shim (timers only)

function installWindow() {
    const timers = new Set();
    const intervals = new Set();
    globalThis.window = {
        setInterval: (fn, ms) => { const id = setInterval(fn, ms); intervals.add(id); return id; },
        clearInterval: id => { clearInterval(id); intervals.delete(id); },
        setTimeout: (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; },
        clearTimeout: id => { clearTimeout(id); timers.delete(id); },
    };
    return () => {
        for (const id of intervals) clearInterval(id);
        for (const id of timers) clearTimeout(id);
        delete globalThis.window;
    };
}

// ---------------------------------------------------------------- hosting status

function bundleModule(sources) {
    const protocol = loadTs(REL.protocol, { sources });
    return loadTs(REL.bundle, { sources, overrides: { '@theia/core/shared/react': { __esModule: true }, [REL.protocol]: protocol } });
}

function hostingStatus(sources, { booted, bundleState = booted ? 'booted' : 'booting', retry = async () => false, rejects = false }) {
    const copy = loadTs(REL.copy, { sources });
    const { OrcaHostingStatus } = loadTs(REL.status, {
        sources,
        overrides: { [REL.copy]: copy, [REL.bundle]: bundleModule(sources) },
    });
    const status = new OrcaHostingStatus();
    const api = { repairs: 0, repair: async () => { api.repairs += 1; } };
    const bundleEmitter = new StubEmitter();
    const bundle = {
        state: bundleState,
        retries: 0,
        onDidChangeState: bundleEmitter.event,
        failed: undefined,
        ready: () => (booted ? Promise.resolve(api) : rejects ? Promise.reject(new Error('final')) : new Promise(() => undefined)),
        retry: async () => { bundle.retries += 1; return retry(); },
        emit: state => { bundle.state = state; bundleEmitter.fire(state); },
    };
    const chrome = { state: 'starting', failureClass: null };
    const sent = [];
    status.bundle = bundle;
    status.service = { handOff: async () => status.handOffResult };
    status.handOffResult = undefined;
    status.browserHost = { state: 'idle', onDidChangeState: () => ({ dispose() { /* inert */ } }), attach: async () => undefined, attaches: 0, attachAgain: async () => { status.browserHost.attaches += 1; return true; } };
    status.request = async msg => {
        sent.push(msg);
        if (msg.kind === 'orcaRestart') {
            status.onRestart?.();
            return { ok: true, kind: 'orcaRestart', accepted: true };
        }
        if (msg.kind === 'orcaStatus') {
            return { ok: true, kind: 'orcaStatus', state: chrome.state, failureClass: chrome.failureClass };
        }
        return { ok: true, kind: msg.kind };
    };
    return { status, api, bundle, chrome, sent };
}

async function clauseRestartRepair(sources, fail) {
    const { status, api, chrome } = hostingStatus(sources, { booted: true });
    status.handOffResult = { pairing: 'fixture-offer' };
    chrome.state = 'failed';
    chrome.failureClass = 'could-not-start';
    status.onStart();
    await flush();
    await status.poll();
    if (status.failureClass !== 'could-not-start') {
        fail('restart-repair', `before Restart Orca the page should show could-not-start, got ${status.failureClass}`);
        return;
    }
    status.onRestart = () => { chrome.state = 'starting'; chrome.failureClass = null; };
    await status.restart();
    await flush();
    if (status.failureClass !== 'restarting') {
        fail('restart-repair', `while orcad is starting after Restart Orca the page must stay up (restarting), got ${status.failureClass ?? 'no page'} (67-CR-01 point 1)`);
    }
    if (status.timer === undefined) {
        fail('restart-repair', 'the one-second poll stopped while the restart was pending and no page was shown (67-CR-01 point 2)');
    }
    chrome.state = 'ready';
    await status.poll();
    await flush();
    if (api.repairs !== 1) {
        fail('restart-repair', `when orcad became ready after Restart Orca the client re-paired ${api.repairs} time(s), want 1 (67-CR-01 point 3)`);
    }
    if (status.failureClass !== null) {
        fail('restart-repair', `after the re-pair the page should clear, got ${status.failureClass}`);
    }
}

/** The client's own browser host failed while orcad restarted: chrome reports browser-not-attached over a ready orcad, and the client still pairs again. */
async function clauseRestartHostFailed(sources, fail) {
    const { status, api, chrome } = hostingStatus(sources, { booted: true });
    status.handOffResult = { pairing: 'fixture-offer' };
    chrome.state = 'ready';
    status.onStart();
    await flush();
    await status.poll();
    chrome.state = 'failed';
    chrome.failureClass = 'restarting';
    await status.poll();
    await flush();
    status.browserHost.state = 'failed';
    chrome.state = 'ready';
    chrome.failureClass = 'browser-not-attached';
    await status.poll();
    await flush();
    if (api.repairs !== 1) {
        fail('restart-host-failed', `orcad restarted and this client's browser host failed: the client re-paired ${api.repairs} time(s), want 1 (gate run 7)`);
    }
    if (status.browserHost.attaches !== 1) {
        fail('restart-host-failed', `after the re-pair the browser host was attached again ${status.browserHost.attaches} time(s), want 1 (gate run 7)`);
    }
    // A user's Reconnect on that page, with no restart pending, still only attaches the host.
    const before = api.repairs;
    await status.reconnect();
    if (api.repairs !== before) {
        fail('restart-host-failed', 'Reconnect on the browser-not-attached page paired the client again with no restart');
    }
}

async function clauseBootFailedPage(sources, fail) {
    const { status, bundle, chrome } = hostingStatus(sources, { booted: false, bundleState: 'booting' });
    chrome.state = 'ready';
    status.onStart();
    await flush();
    await status.poll();
    bundle.emit('failed');
    await flush();
    if (status.failureClass !== 'pairing-lost') {
        fail('boot-failed-page', `a failed boot of the pane bundle while orcad is ready shows ${status.failureClass ?? 'no page'}, want pairing-lost (67-WR-02)`);
    }
    status.handOffResult = { pairing: 'fixture-offer' };
    const before = bundle.retries;
    await status.reconnect();
    if (bundle.retries === before) {
        fail('boot-failed-page', 'Reconnect after a failed boot did not retry the boot; it reported success over an empty host (67-WR-02)');
    }
    if (status.failureClass !== 'pairing-lost') {
        fail('boot-failed-page', `Reconnect whose retried boot failed removed the page (got ${status.failureClass ?? 'no page'}) (67-WR-02)`);
    }
}

async function clauseBootFinal(sources, fail) {
    const { ORCA_PANES_FINAL_STEP } = bundleModule(sources);
    const copy = loadTs(REL.copy, { sources });
    const { status, bundle, chrome } = hostingStatus(sources, { booted: false, bundleState: 'failed', rejects: true });
    bundle.failed = ORCA_PANES_FINAL_STEP;
    chrome.state = 'ready';
    status.onStart();
    await flush();
    await status.poll();
    bundle.emit('failed');
    await flush();
    const cls = status.failureClass;
    const buttons = cls ? copy.ORCA_FAILURE_BUTTONS[cls] ?? [] : [];
    if (!cls) {
        fail('boot-final', 'a boot that failed at the final step shows no page over empty Orca tabs');
    } else if (buttons.includes('reconnect') || buttons.includes('restart')) {
        fail('boot-final', `a boot that failed at the final step (no retry can pass it) shows ${cls}, whose page offers ${buttons.join(', ')}, a step that cannot help`);
    }
    status.show({});
    if (status.timer !== undefined) {
        fail('boot-final', 'after a final boot failure the status still polls chrome once a second, though nothing it reports can change the page');
    }
}

async function clauseStuckNoOffer(sources, fail) {
    const { status, chrome, sent } = hostingStatus(sources, { booted: false, bundleState: 'booting' });
    chrome.state = 'ready';
    chrome.failureClass = null;
    status.handOffResult = undefined;
    status.onStart();
    await flush();
    for (let i = 0; i < 8; i += 1) {
        await status.poll();
        await flush();
    }
    if (!sent.some(m => m.kind === 'orcaStatus' && m.clientReason === 'offer-missing')) {
        fail('stuck-no-offer', 'a boot stuck with no offer file while orcad is ready never reported offer-missing (67-WR-01)');
    }
    if (status.failureClass !== 'pairing-lost') {
        fail('stuck-no-offer', `a boot stuck with no offer file shows ${status.failureClass ?? 'no page'}, want pairing-lost (67-WR-01)`);
    }
}

async function clauseReasonCleared(sources, fail) {
    const { status, chrome, sent } = hostingStatus(sources, { booted: true });
    chrome.state = 'ready';
    status.onStart();
    await flush();
    await status.reportClientReason('unauthorized');
    status.onClientStatus({ transport: 'ready', verification: 'verified' });
    await flush();
    if (status.failureClass !== null) {
        fail('reason-cleared', `a client that verified again still shows ${status.failureClass}`);
    }
    if (!sent.some(m => m.kind === 'orcaStatus' && m.clientReason === null)) {
        fail('reason-cleared', 'the client recovered but chrome was never sent the clearing form { clientReason: null }, so its diagnostics row stays stale (67-WR-04)');
    }
}

// ---------------------------------------------------------------- pane bundle

async function clauseBootRetry(sources, fail) {
    const React = { __esModule: true, marker: 'react' };
    const protocol = loadTs(REL.protocol, { sources });
    const { OrcaPaneBundle } = loadTs(REL.bundle, { sources, overrides: { '@theia/core/shared/react': React, [REL.protocol]: protocol } });
    const bundle = new OrcaPaneBundle();
    bundle.service = { handOff: async () => ({ pairing: 'fixture-offer' }) };
    bundle.storage = { getData: async () => undefined, setData: async () => undefined };
    bundle.linkStyle = () => undefined;
    const api = { reactIdentity: React, bootstrap: async () => undefined };
    let loads = 0;
    bundle.loadEntry = () => (++loads === 1 ? Promise.reject(new Error('the pane bundle entry did not load')) : Promise.resolve(api));
    let settled = 'pending';
    let ready;
    try {
        ready = bundle.ready();
    } catch (err) {
        fail('boot-retry', `ready() threw: ${err.message}`);
        return;
    }
    ready.then(() => { settled = 'resolved'; }, () => { settled = 'rejected'; });
    await flush();
    if (settled === 'rejected') {
        fail('boot-retry', 'a boot that failed at the load step rejected ready() for the life of the document (64-WR-01)');
    }
    if (typeof bundle.retry !== 'function') {
        fail('boot-retry', 'the pane bundle has no retry(); a failed boot is never tried again (64-WR-01)');
        return;
    }
    const booted = await bundle.retry();
    await flush();
    if (!booted || settled !== 'resolved') {
        fail('boot-retry', `a retry after a failed load did not boot the bundle (retry ${booted}, ready() ${settled}) (64-WR-01)`);
    }
    if (bundle.retryTimer !== undefined) clearTimeout(bundle.retryTimer);
}

// ---------------------------------------------------------------- stylesheet and loader script on a retry

/** A minimal document: a head that holds elements, elements that fire events and can be removed. */
function fakeDocument() {
    const head = [];
    const element = tag => {
        const el = new EventTarget();
        Object.assign(el, {
            tagName: tag.toUpperCase(), rel: '', href: '', type: '', textContent: '',
            remove() { const at = head.indexOf(el); if (at >= 0) head.splice(at, 1); },
        });
        return el;
    };
    return {
        head: { children: head, appendChild: el => { head.push(el); return el; } },
        baseURI: 'http://127.0.0.1:4000/',
        createElement: element,
        querySelector: () => null,
    };
}

async function clauseRetryAssets(sources, fail) {
    const React = { __esModule: true };
    const protocol = loadTs(REL.protocol, { sources });
    const module = loadTs(REL.bundle, { sources, overrides: { '@theia/core/shared/react': React, [REL.protocol]: protocol } });
    const doc = fakeDocument();
    const win = new EventTarget();
    const savedDocument = globalThis.document;
    const savedWindow = globalThis.window;
    globalThis.document = doc;
    globalThis.window = win;
    try {
        const bundle = new module.OrcaPaneBundle();
        const links = () => doc.head.children.filter(el => el.tagName === 'LINK');
        const scripts = () => doc.head.children.filter(el => el.tagName === 'SCRIPT');
        bundle.linkStyle();
        const first = links()[0];
        first?.dispatchEvent(new Event('error'));
        bundle.linkStyle();
        if (links().length !== 1 || links()[0] === first || links()[0]?.href === first?.href) {
            fail('retry-assets', `after the stylesheet failed to load, a retry left ${links().length} link(s)${links()[0] === first ? ', the failed one kept' : ''}; a later boot would run Orca panes without CSS`);
        }
        const second = links()[0];
        bundle.linkStyle();
        if (links()[0] !== second || links().length !== 1) {
            fail('retry-assets', 'a stylesheet that did not fail was replaced or duplicated on the next attempt');
        }
        const failed = `${module.ORCA_PANES_BOOT_EVENT}-failed`;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const loading = bundle.loadEntry().catch(() => undefined);
            win.dispatchEvent(new Event(failed));
            await loading;
        }
        if (scripts().length > 0) {
            fail('retry-assets', `three failed loads left ${scripts().length} loader script(s) in the document head`);
        }
    } finally {
        globalThis.document = savedDocument;
        globalThis.window = savedWindow;
    }
}

// ---------------------------------------------------------------- widget close

async function clauseCloseUnbooted(sources, fail) {
    class ReactWidget {
        constructor() { this.disposedFlag = false; }
        dispose() { this.disposedFlag = true; }
    }
    const overrides = {
        '@theia/core/shared/react': { __esModule: true, createElement: () => null, Fragment: 'fragment', useEffect: () => undefined },
        '@theia/core/lib/browser/widgets/react-widget': { __esModule: true, ReactWidget },
    };
    const { OrcaPaneWidget } = loadTs(REL.widget, { sources, overrides });
    const make = bundle => {
        const widget = new OrcaPaneWidget();
        widget.options = { name: 'term1', kind: 'terminal', worktreeId: 'w1', tabId: 't1', paneKey: null };
        widget.bundle = bundle;
        return widget;
    };
    const pending = make({ isBooted: false, failed: undefined, ready: () => new Promise(() => undefined) });
    pending.onCloseRequest({});
    if (!pending.disposedFlag) {
        fail('close-unbooted', 'a restored Orca tab whose bundle is still booting cannot be closed (theia-pane-hosting-01)');
    }
    const failed = make({ isBooted: false, failed: 'load', ready: () => new Promise(() => undefined) });
    failed.onCloseRequest({});
    if (!failed.disposedFlag) {
        fail('close-unbooted', 'a restored Orca tab whose bundle boot failed cannot be closed (theia-pane-hosting-01)');
    }
    let closes = 0;
    const booted = make({ isBooted: true, failed: undefined, ready: () => Promise.resolve({ closePane: () => { closes += 1; } }) });
    booted.onCloseRequest({});
    await flush();
    if (booted.disposedFlag || closes !== 1) {
        fail('close-unbooted', `with the bundle booted a close must go to Orca's own close (P64-11): disposed ${booted.disposedFlag}, closePane ${closes}`);
    }
}

// ---------------------------------------------------------------- terminal leaf rekey

async function clauseTerminalRekey(sources, fail) {
    const { planPanes } = loadTs(REL.routes, { sources });
    const leaf = { kind: 'terminal', key: 'tab-1:leaf-1', worktreeId: 'w1', worktreeLabel: 'w', tabId: 'tab-1', paneKey: 'tab-1:leaf-1', active: false, title: 'Terminal', neighbours: [] };
    const fromKnown = planPanes({ known: new Map([['tab-1', { name: 'term1', title: 'Terminal', widgetId: 'orca-pane:term1' }]]), restored: [], reservedNames: ['term1'], hydrated: true }, [leaf]);
    const fromRestored = planPanes({ known: new Map(), restored: [{ name: 'term1', kind: 'terminal', worktreeId: 'w1', tabId: 'tab-1', paneKey: null }], reservedNames: ['term1'], hydrated: true }, [leaf]);
    for (const [label, plan] of [['a tracked', fromKnown], ['a layout-restored', fromRestored]]) {
        const moved = (plan.rekey ?? []).some(r => r.from === 'tab-1' && r.to === 'tab-1:leaf-1' && r.paneKey === 'tab-1:leaf-1' && r.widgetId === 'orca-pane:term1');
        if (!moved || plan.create.length || plan.dispose.length) {
            fail('terminal-rekey', `${label} leaf-less terminal tab whose first leaf appeared was ${plan.dispose.length ? 'disposed' : 'not moved'}${plan.create.length ? ` and a new tab ${plan.create[0].name} was created` : ''}; want the same widget re-keyed (64-WR-03)`);
        }
    }
    const second = { ...leaf, key: 'tab-1:leaf-2', paneKey: 'tab-1:leaf-2' };
    const both = planPanes({ known: new Map([['tab-1', { name: 'term1', title: 'Terminal', widgetId: 'orca-pane:term1' }]]), restored: [], reservedNames: ['term1'], hydrated: true }, [leaf, second]);
    if ((both.rekey ?? []).length !== 1 || both.create.length !== 1) {
        fail('terminal-rekey', 'with two leaves listed, only the first takes the leaf-less widget over and the second is a new tab');
    }

    class ReactWidget { dispose() { /* inert */ } }
    const { OrcaPaneWidget } = loadTs(REL.widget, {
        sources,
        overrides: {
            '@theia/core/shared/react': { __esModule: true, createElement: () => null, Fragment: 'fragment', useEffect: () => undefined },
            '@theia/core/lib/browser/widgets/react-widget': { __esModule: true, ReactWidget },
        },
    });
    const widget = new OrcaPaneWidget();
    const mounts = [];
    let unmounted = 0;
    widget.options = { name: 'term1', kind: 'terminal', worktreeId: 'w1', tabId: 'tab-1', paneKey: null };
    widget.bundle = { isBooted: true, ready: async () => ({ mountPane: (_el, pick) => { mounts.push(pick.paneKey); return () => { unmounted += 1; }; } }) };
    widget.shown = true;
    widget.host = {};
    widget.mountOnce();
    await flush();
    if (typeof widget.rekey !== 'function') {
        fail('terminal-rekey', 'OrcaPaneWidget has no rekey(); the leaf-less widget cannot take the leaf\'s pane key (64-WR-03)');
        return;
    }
    widget.rekey('tab-1:leaf-1');
    await flush();
    if (unmounted !== 1 || mounts[mounts.length - 1] !== 'tab-1:leaf-1' || widget.options.paneKey !== 'tab-1:leaf-1') {
        fail('terminal-rekey', `a re-keyed widget did not remount with the leaf's pane key (mounts ${JSON.stringify(mounts)}, unmounts ${unmounted}) (64-WR-03)`);
    }
}

// ---------------------------------------------------------------- backend hand-off

function fixtureOffer(endpointPort, urlPort) {
    const payload = { v: 2, endpoint: `ws://127.0.0.1:${endpointPort}/`, deviceToken: 'fixture-token-pane-hosting', publicKeyB64: 'Zml4dHVyZQ' };
    const code = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `http://127.0.0.1:${urlPort}/web-index.html#pairing=${encodeURIComponent(`orca://pair?code=${code}`)}`;
}

async function clauseHandOff(sources, fail, passes, skips) {
    // Not run off POSIX: a skip (SKIP-PROTOCOL.md rule 2), never a pass.
    if (process.platform !== 'linux' && process.platform !== 'darwin') {
        skips.push('the handoff-* clauses did not run: they read POSIX folder and file modes. Next step: run this check on Linux or macOS');
        return;
    }
    const root = mkdtempSync(join(tmpdir(), 'pb-pane-hosting-'));
    try {
        const bridge = join(root, 'bridge');
        const bundleDir = join(root, 'bundle');
        mkdirSync(bridge, { mode: 0o700 });
        chmodSync(bridge, 0o700);
        mkdirSync(bundleDir);
        writeFileSync(join(bundleDir, 'pb-panes.js'), 'export {}\n');
        const env = { POWERBROWSER_ORCA_BRIDGE_DIR: bridge, POWERBROWSER_ORCA_PORT: '26768' };
        const policy = loadTs(REL.policy, { sources });
        const protocol = loadTs(REL.protocol, { sources, overrides: { [REL.policy]: policy } });
        const { OrcaPanesServiceImpl } = loadTs(REL.backend, {
            sources,
            overrides: {
                '@powerbrowser/token-gate/lib/node/powerbrowser-env': { __esModule: true, POWERBROWSER_ENV: env },
                [REL.policy]: policy,
                [REL.protocol]: protocol,
            },
        });
        const service = () => new OrcaPanesServiceImpl();
        const writePrivate = (name, text) => {
            writeFileSync(join(bridge, name), text, { mode: 0o600 });
            chmodSync(join(bridge, name), 0o600);
        };
        const same = (got, want) => JSON.stringify(got) === JSON.stringify(want);

        writePrivate('web-pairing', fixtureOffer(26768, 26768));
        let got = await service().handOff();
        if (got !== undefined) {
            fail('handoff-both-files', `with web-pairing written and orca-panes-dir not yet, handOff returned ${JSON.stringify(got && Object.keys(got))}, want undefined (C6; 64-WR-01, pairing-credentials-01)`);
        }
        writePrivate('orca-panes-dir', bundleDir);
        got = await service().handOff();
        if (!got || !('pairing' in got)) {
            fail('handoff-both-files', `with both bridge files written handOff returned ${JSON.stringify(got)}, want the pairing`);
        }

        writePrivate('web-pairing', fixtureOffer(26769, 26769));
        got = await service().handOff();
        if (!same(got, { refused: 'offer-endpoint' })) {
            fail('handoff-orcad-port', `an offer whose endpoint and web-client URL both name 26769 while PowerBrowser started orcad on 26768 gave ${JSON.stringify(got && Object.keys(got))}, want refused offer-endpoint (67-WR-03)`);
        }
        writePrivate('web-pairing', fixtureOffer(26768, 26768));
        delete env.POWERBROWSER_ORCA_PORT;
        got = await service().handOff();
        if (!same(got, { refused: 'offer-endpoint' })) {
            fail('handoff-orcad-port-unknown', `with orcad's port not passed to the backend handOff gave ${JSON.stringify(got && Object.keys(got))}, want refused offer-endpoint on POSIX (67-WR-03)`);
        }
        env.POWERBROWSER_ORCA_PORT = '26768';

        chmodSync(bridge, 0o755);
        got = await service().handOff();
        chmodSync(bridge, 0o700);
        if (!same(got, { refused: 'offer-unreadable' })) {
            fail('handoff-folder-refused', `a bridge folder with group or other access gave ${JSON.stringify(got)}, want refused offer-unreadable so the page shows (67-WR-01)`);
        }
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------- observer reveal

async function clauseRevealNoFocus(sources, fail) {
    const routes = loadTs(REL.routes, { sources });
    const { OrcaPaneObserver } = loadTs(REL.observer, { sources, overrides: { [REL.routes]: routes } });
    const observer = new OrcaPaneObserver();
    const calls = { activate: 0, reveal: 0 };
    observer.shell = {
        activateWidget: async () => { calls.activate += 1; },
        revealWidget: async () => { calls.reveal += 1; },
    };
    observer.browserPages = { tabOf: () => ({}), reveal: () => [{ id: 'web-tab-1' }] };
    observer.revealBrowserTabs([{ kind: 'browser', browserPageId: 'page-1', key: 'k', worktreeId: 'w', tabId: 't', paneKey: null, active: true, title: '', neighbours: [] }]);
    await flush();
    if (calls.activate > 0) {
        fail('reveal-no-focus', `an Orca store activation of a browser row activated (focused) its web tab ${calls.activate} time(s); an agent can switch that row (theia-pane-hosting-02, D-34)`);
    }
    if (calls.reveal !== 1) {
        fail('reveal-no-focus', `an Orca store activation of a browser row revealed its web tab ${calls.reveal} time(s), want 1 (P66-09)`);
    }
}

// ---------------------------------------------------------------- side panel and restore

function sidePanelSync(sources) {
    class OrcaPaneWidget {
        constructor(options) { this.options = options; this.isDisposed = false; this.closed = false; }
        close() { this.closed = true; }
    }
    class ViewContainer { }
    const routes = loadTs(REL.routes, { sources });
    const module = loadTs(REL.sync, {
        sources,
        overrides: {
            '../orca-pane-widget': { __esModule: true, OrcaPaneWidget },
            '@theia/core/lib/browser': { __esModule: true, ViewContainer, Navigatable: { is: () => false }, open: async () => undefined },
            [REL.routes]: routes,
        },
    });
    return { ...module, OrcaPaneWidget };
}

async function clauseSidePanel(sources, fail) {
    const { OrcaSidePanelSync, OrcaPaneWidget } = sidePanelSync(sources);
    const writes = [];
    const sync = new OrcaSidePanelSync();
    sync.api = { setActiveView: view => writes.push(view), setOrchestrationFocus: () => undefined };
    sync.shell = { getAreaFor: () => 'main', leftPanelHandler: { tabBar: { currentTitle: { owner: { id: 'explorer-view-container' } } } } };
    sync.activeView = 'tasks';
    sync.onActiveWidget({ isDisposed: false, id: 'editor-1' });
    if (!writes.includes('terminal')) {
        fail('page-writeback', 'a main-area editor activated while the store\'s view is a page wrote nothing, so the next click on that page is swallowed (65-WR-04)');
    }
    writes.length = 0;
    sync.activeView = 'settings';
    if (typeof sync.leftPanelChanged === 'function') sync.leftPanelChanged();
    if (!writes.includes('terminal')) {
        fail('settings-writeback', 'the left panel left Orca while the store\'s view is settings and nothing was written, so the next Settings click is swallowed (65-WR-04)');
    }

    const creating = new OrcaPaneWidget({ name: 'creating', kind: 'page:creation', worktreeId: '', tabId: '', paneKey: null });
    const fresh = new OrcaSidePanelSync();
    fresh.widgetManager = { getWidgets: () => [creating] };
    fresh.opener = {};
    fresh.onActiveView({ view: 'terminal', pendingCreation: false });
    if (!creating.closed) {
        fail('creating-closed', 'a creating tab restored with no Orca worktree creation pending stayed open after the store\'s first report (theia-pane-hosting-05)');
    }
    if (fresh.creationPending !== false) {
        fail('creating-closed', `after the store reported no pending creation, creationPending is ${fresh.creationPending}, want false`);
    }
}

async function clauseRestore(sources, fail) {
    const routes = loadTs(REL.routes, { sources });
    const { OrcaPaneRestoreOpenHandler, OrcaPaneNameMapContribution } = loadTs(REL.nameMap, { sources, overrides: { [REL.routes]: routes } });
    const handler = new OrcaPaneRestoreOpenHandler();
    let created = 0;
    handler.sidePanel = { creationPending: false };
    handler.widgetManager = { getOrCreateWidget: async () => { created += 1; return {}; }, getWidgets: () => [] };
    handler.names = { lookup: async () => undefined };
    const widget = await handler.widgetFor('creating');
    if (widget !== undefined || created !== 0) {
        fail('creating-refused', 'pb-orca:creating opened the creation surface while the store reports no pending creation (theia-pane-hosting-05)');
    }
    handler.sidePanel = { creationPending: undefined };
    await handler.widgetFor('creating');
    if (created !== 1) {
        fail('creating-refused', 'before the store has reported, pb-orca:creating must still open (a restore that runs before orcad is ready, P65-19)');
    }

    const contribution = new OrcaPaneNameMapContribution();
    let prunes = 0;
    contribution.setups = { referencedTabUris: async () => undefined };
    contribution.names = { prune: async () => { prunes += 1; return 0; } };
    contribution.onStart();
    await flush();
    if (prunes !== 0) {
        fail('prune-unknown', 'the launch prune ran against an unknown reference set (setups.json unreadable or not parsed), releasing tombstoned names a saved Setup may hold (theia-pane-hosting-03)');
    }
}

// ---------------------------------------------------------------- driver

const CLAUSES = [
    clauseRestartRepair, clauseRestartHostFailed, clauseBootFailedPage, clauseBootFinal, clauseStuckNoOffer, clauseReasonCleared, clauseBootRetry,
    clauseRetryAssets, clauseCloseUnbooted, clauseTerminalRekey, clauseHandOff, clauseRevealNoFocus, clauseSidePanel, clauseRestore,
];

export async function check(sources = {}) {
    const failures = [];
    const passes = [];
    const skips = [];
    const fail = (clause, message) => failures.push({ clause, message });
    const uninstall = installWindow();
    try {
        await quiet(async () => {
            for (const clause of CLAUSES) {
                try {
                    await clause(sources, fail, passes, skips);
                } catch (err) {
                    fail(clause.name, `threw: ${err?.message ?? err}`);
                }
            }
        });
    } finally {
        uninstall();
    }
    return { failures, passes, skips };
}

/** Each plant restores the pre-fix behaviour of one item, in memory; `naming` is the clause it must turn red. */
export const PLANTS = [
    {
        name: 'a reported browser host failure reads as orcad not ready (gate run 7)', naming: 'restart-host-failed', file: REL.status,
        edits: [["const ready = next.state === 'ready' && (next.failureClass === null || next.failureClass === 'browser-not-attached');", "const ready = next.state === 'ready' && next.failureClass === null;"]],
    },
    {
        name: 'a restart re-pair stops at the browser-not-attached page (gate run 7)', naming: 'restart-host-failed', file: REL.status,
        edits: [["if (!restarted && this.failureClass === 'browser-not-attached') {", "if (this.failureClass === 'browser-not-attached') {"]],
    },
    {
        name: 'restart re-pair read from two adjacent samples (pre-fix 67-CR-01)', naming: 'restart-repair', file: REL.status,
        edits: [
            ['const recovered = (this.restartPending || restarted) && ready;', 'const recovered = this.chrome.failureClass !== null && REPAIR_AFTER.includes(this.chrome.failureClass) && ready;'],
            ["if (this.restartPending && !ready) {\n                this.held = 'restarting';", "if (false) {\n                this.held = 'restarting';"],
            ["this.restartPending = true;\n                    this.held = 'restarting';", 'this.restartPending = false;'],
        ],
    },
    {
        name: 'Reconnect after a failed boot reports success (pre-fix 67-WR-02)', naming: 'boot-failed-page', file: REL.status,
        edits: [['} else if (!await this.retryBoot()) {', '} else if (false) {']],
    },
    {
        name: 'a failed boot shows no page (pre-fix 67-WR-02)', naming: 'boot-failed-page', file: REL.status,
        edits: [["const boot: OrcaFailureClass | null = this.bootFailed && !this.api && this.chrome.state === 'ready' ? 'pairing-lost' : null;", 'const boot: OrcaFailureClass | null = null;']],
    },
    {
        name: 'a final boot failure shows pairing-lost and keeps polling (review of 67-WR-02)', naming: 'boot-final', file: REL.status,
        edits: [['this.bootFinal = this.bundle.failed === ORCA_PANES_FINAL_STEP;', 'this.bootFinal = false;']],
    },
    {
        name: 'a stuck boot with no offer does nothing (pre-fix 67-WR-01)', naming: 'stuck-no-offer', file: REL.status,
        edits: [["if (this.chrome.state === 'ready' && this.clientReason !== 'offer-missing') {", 'if (false) {']],
    },
    {
        name: 'a recovered client sends chrome nothing (pre-fix 67-WR-04)', naming: 'reason-cleared', file: REL.status,
        edits: [["void this.send({ kind: 'orcaStatus', clientReason: null })", "void Promise.resolve('no-chrome')"]],
    },
    {
        name: 'a failed boot is cached for the document (pre-fix 64-WR-01)', naming: 'boot-retry', file: REL.bundle,
        edits: [[/ready\(\): Promise<OrcaPaneBundleApi> \{[\s\S]*?\n {4}\}\n/, 'ready(): Promise<OrcaPaneBundleApi> {\n        return this.booted ??= this.boot();\n    }\n']],
    },
    {
        name: 'a failed stylesheet link is kept on a retry (review of 64-WR-01)', naming: 'retry-assets', file: REL.bundle,
        edits: [['        if (this.styleLink && !this.styleFailed) {\n            return;\n        }', '        if (this.styleLink) {\n            return;\n        }']],
    },
    {
        name: 'each failed load leaves its loader script (review of 64-WR-01)', naming: 'retry-assets', file: REL.bundle,
        edits: [['                window.removeEventListener(ORCA_PANES_BOOT_EVENT, onLoaded);\n                script.remove();', '                window.removeEventListener(ORCA_PANES_BOOT_EVENT, onLoaded);'], ['        this.loaderScript?.remove();\n', '']],
    },
    {
        name: 'a close before boot is dropped (pre-fix 64-CR-02)', naming: 'close-unbooted', file: REL.widget,
        edits: [['if (!this.bundle.isBooted) {', 'if (false) {']],
    },
    {
        name: 'a terminal tab is disposed and renumbered when its first leaf appears (pre-fix 64-WR-03)', naming: 'terminal-rekey', file: REL.routes,
        edits: [['} else if (record.paneKey !== null && record.tabId !== record.key', '} else if (false && record.paneKey !== null && record.tabId !== record.key']],
    },
    {
        name: 'a re-keyed widget keeps its leaf-less mount (pre-fix 64-WR-03)', naming: 'terminal-rekey', file: REL.widget,
        edits: [['        this.mounting = false;\n        this.mountOnce();\n    }', '    }']],
    },
    {
        name: 'handOff checks only web-pairing (pre-fix pairing-credentials-01)', naming: 'handoff-both-files', file: REL.backend,
        edits: [['if (this.bundleRootReal() === undefined) {\n            return undefined;\n        }', '']],
    },
    {
        name: 'the expected port comes from the offer file (pre-fix 67-WR-03)', naming: 'handoff-orcad-port', file: REL.backend,
        edits: [['expectedOfferPort(pairing, this.orcadPort, process.platform)', "expectedOfferPort(pairing, undefined, 'win32')"]],
    },
    {
        name: 'a non-private bridge folder reads as not written yet (pre-fix 67-WR-01)', naming: 'handoff-folder-refused', file: REL.backend,
        edits: [["this.logOnce(`no pairing hand-off: ${dirVerdict.reason}`);\n                return this.refuse('offer-unreadable');", 'this.logOnce(`no pairing hand-off: ${dirVerdict.reason}`);\n                return undefined;']],
    },
    {
        name: 'a store activation focuses the web tab (pre-fix theia-pane-hosting-02)', naming: 'reveal-no-focus', file: REL.observer,
        edits: [['void this.shell.revealWidget(widget.id);', 'this.shell.activateWidget(widget.id);']],
    },
    {
        name: 'a main-area tab writes nothing back (pre-fix 65-WR-04)', naming: 'page-writeback', file: REL.sync,
        edits: [["} else if (!view && this.api && this.shell.getAreaFor(widget) === 'main'", "} else if (false && !view && this.api && this.shell.getAreaFor(widget) === 'main'"]],
    },
    {
        name: 'hiding Settings writes nothing back (pre-fix 65-WR-04)', naming: 'settings-writeback', file: REL.sync,
        edits: [["if (this.api && this.activeView === 'settings') {", 'if (false) {']],
    },
    {
        name: 'a restored creating tab is kept (pre-fix theia-pane-hosting-05)', naming: 'creating-closed', file: REL.sync,
        edits: [['if (!pendingCreation && (creationChanged || first)) {', 'if (!pendingCreation && creationChanged) {']],
    },
    {
        name: 'pb-orca:creating opens with no creation pending (pre-fix theia-pane-hosting-05)', naming: 'creating-refused', file: REL.nameMap,
        edits: [['PENDING_CREATION_WORDS.has(name) && this.sidePanel.creationPending === false', 'false']],
    },
    {
        name: 'the prune runs on an unknown set (pre-fix theia-pane-hosting-03)', naming: 'prune-unknown', file: REL.nameMap,
        edits: [['.then(uris => (uris ? this.names.prune(uris) : 0))', '.then(uris => this.names.prune(uris ?? []))']],
    },
];

function planted(plant) {
    let text = readFileSync(join(REPO_ROOT, plant.file), 'utf8');
    for (const [from, to] of plant.edits) {
        const next = typeof from === 'string' ? text.replace(from, to) : text.replace(from, to);
        if (next === text) {
            return { error: `the plant '${plant.name}' did not apply: its anchor is not in ${plant.file}` };
        }
        text = next;
    }
    return { sources: { [plant.file]: text } };
}

/**
 * SKIP control (SKIP-PROTOCOL.md): the main mode, run as a child with its output captured, from a copy of this script
 * and its two helpers in a tree with no theia/ (the loader resolves typescript from the tree it sits in), must exit 77
 * with the SKIP line last and no PASS line. Returns a problem, or null.
 */
function skipControl() {
    const root = mkdtempSync(join(tmpdir(), `${NAME}-root-`));
    try {
        mkdirSync(join(root, 'scripts', 'lib'), { recursive: true });
        copyFileSync(SELF, join(root, 'scripts', 'verify-orca-pane-hosting.mjs'));
        for (const lib of ['ts-unit-loader.mjs', 'skip-verdict.mjs']) copyFileSync(join(REPO_ROOT, 'scripts', 'lib', lib), join(root, 'scripts', 'lib', lib));
        const r = spawnSync(process.execPath, [join(root, 'scripts', 'verify-orca-pane-hosting.mjs')], { encoding: 'utf8' });
        const lines = (r.stdout ?? '').split('\n').filter(l => l.trim() !== '');
        const last = lines[lines.length - 1] ?? '';
        if (r.status !== SKIP_EXIT || !last.startsWith(`${NAME}: SKIP -- theia/node_modules/typescript is not installed`)
            || lines.some(l => l.includes(`${NAME}: PASS`)) || /: SKIP/.test(r.stderr ?? '')) {
            return `control: a tree without typescript did not exit 77 with the SKIP line last and no PASS line (status ${r.status}, last line ${JSON.stringify(last)}, stderr ${JSON.stringify((r.stderr ?? '').slice(0, 300))})`;
        }
        console.log(`${NAME}: self-test ok -- control: a tree without typescript exits 77 with the SKIP line last`);
        return null;
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

/**
 * Partial-skip control (SKIP-PROTOCOL.md rule 2): the main mode, run as a child with its output captured and a preload
 * that makes process.platform read 'win32'. The handoff-* clauses do not run off POSIX and every other clause runs, so
 * it must exit 77 with the handoff-* SKIP line last and no PASS line. Returns a problem, or null.
 */
function offPosixControl() {
    const dir = mkdtempSync(join(tmpdir(), `${NAME}-win32-`));
    try {
        const preload = join(dir, 'win32.mjs');
        writeFileSync(preload, "Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });\n");
        const r = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, SELF], { encoding: 'utf8' });
        const lines = (r.stdout ?? '').split('\n').filter(l => l.trim() !== '');
        const last = lines[lines.length - 1] ?? '';
        if (r.status !== SKIP_EXIT || !last.startsWith(`${NAME}: SKIP -- the handoff-* clauses did not run`)
            || lines.some(l => l.includes(`${NAME}: PASS`)) || /: SKIP/.test(r.stderr ?? '')) {
            return `control: a win32 platform did not exit 77 with the handoff-* SKIP line last and no PASS line (status ${r.status}, last line ${JSON.stringify(last)}, stderr ${JSON.stringify((r.stderr ?? '').slice(0, 300))})`;
        }
        console.log(`${NAME}: self-test ok -- control: a win32 platform exits 77 with the handoff-* SKIP line last`);
        return null;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

async function selfTest() {
    const problems = [];
    const skipProblem = skipControl();
    if (skipProblem) problems.push(skipProblem);
    const offPosixProblem = offPosixControl();
    if (offPosixProblem) problems.push(offPosixProblem);
    const control = await check();
    if (control.failures.length) {
        problems.push(`control run is red: ${control.failures.map(f => `${f.clause}: ${f.message}`).join('; ')}`);
    }
    // Plants on a clause the control skipped cannot run (SKIP-PROTOCOL.md rule 4).
    if (!problems.length && control.skips.length) {
        console.log(skipLine(`${NAME} self-test`, `the control did not run every clause, so the plants did not run: ${control.skips.join('; ')}`));
        process.exit(SKIP_EXIT);
    }
    for (const plant of PLANTS) {
        const { sources, error } = planted(plant);
        if (error) {
            problems.push(error);
            continue;
        }
        const run = await check(sources);
        if (!run.failures.some(f => f.clause === plant.naming)) {
            problems.push(`plant '${plant.name}' stayed green in ${plant.naming}${run.failures.length ? ` (red elsewhere: ${run.failures.map(f => f.clause).join(', ')})` : ''}`);
        } else {
            console.log(`${NAME}: self-test ok -- '${plant.name}' goes red in ${plant.naming}`);
        }
    }
    if (problems.length) {
        for (const p of problems) console.log(`${NAME}: SELF-TEST FAIL -- ${p}`);
        process.exit(1);
    }
    console.log(`${NAME}: SELF-TEST PASS (${PLANTS.length} plants, each red in its clause; control green)`);
}

async function main() {
    // No typescript: nothing ran, so exit 77 with the SKIP line (SKIP-PROTOCOL.md); a self-test cannot run its plants.
    if (!typescript()) {
        const who = process.argv.includes('--self-test') ? `${NAME} self-test` : NAME;
        console.log(skipLine(who, 'theia/node_modules/typescript is not installed. Next step: run the audited Theia install (docs/BUILD.md "Theia half")'));
        process.exit(SKIP_EXIT);
    }
    if (process.argv.includes('--self-test')) {
        await selfTest();
        return;
    }
    const { failures, passes, skips } = await check();
    for (const p of passes) console.log(`${NAME}: ${p}`);
    for (const f of failures) console.log(`${NAME}: FAIL -- ${f.clause}: ${f.message}`);
    // FAIL wins; a clause not run makes the run exit 77 with one SKIP line printed last (SKIP-PROTOCOL.md).
    const code = verdictExit(NAME, failures, skips);
    if (code !== 0) process.exit(code);
    console.log(`${NAME}: PASS (${CLAUSES.length} clause groups)`);
}

await main();
