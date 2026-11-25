#!/usr/bin/env node
// Phase 66 research gate (P66-04). Bounded live probes that fix the dependent
// picks before any plan is written. Nothing here is product code: the agent
// child is stood in for by p66-probe-child.sys.mjs, registered at run time in
// the probe's own throwaway profile; the S2 host is p66-thin-host.ts (built by
// build-p66-thin-host.sh). WebDriver BiDi is the test harness only (D-11).
//
//   --dpr N     layout.css.devPixelsPerPx for the launch (default 1)
//   --no-orca   skip the orcad half (the DPR 2 run needs only Q3)
//
// Run (headless, under the live lock, after build-orca.sh, the CLI build and
// build-p66-thin-host.sh):
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock \
//     node .planning/spikes/005-orca-browser-parity/p66-gate-probe.mjs --dpr 1
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock \
//     node .planning/spikes/005-orca-browser-parity/p66-gate-probe.mjs --dpr 2 --no-orca
// Writes results-p66-gate-dpr<N>.json beside this file. Output is redacted;
// the pairing input stays in memory.

import { execFile, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    REPO_ROOT, ensurePbNode, installOutputRedaction, orcaVersionFromPins, orcadEnv, redact, startOrcad, stopOrcad,
} from '../../../scripts/lib/orca-run.mjs';
import {
    WEB_TAB_STATE_EVENT, chromeActiveTabId, focusOverlay, inChrome, loadedAt, openWebTab, probe, pushes, serveNavPages, waitForPush, withProbeShell,
} from '../../../scripts/lib/pb-live-probe.mjs';
import { pollFor } from '../../../scripts/lib/pb-relaunch.mjs';
import { makeCurrent } from '../../../scripts/lib/pb-live-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DPR = Number(args[args.indexOf('--dpr') + 1] ?? 1) || 1;
const WITH_ORCA = !args.includes('--no-orca');
const ORCA_DIR = join(REPO_ROOT, 'orca');
const CLI = join(ORCA_DIR, 'out', 'cli', 'index.js');
const BUNDLE_REL = 'assets/pb-p66/pb-p66-thin-host.js';
const WORK = join(REPO_ROOT, '.mozbuild', 'p66-gate');
const PROFILE_ALIAS = join(homedir(), '.cache', 'pb-p66-gate-orca');
const ACTOR = 'PbP66Probe';
const PROBE_MODULE_DIR = join(dirname(process.env.PB_FIREFOX_BIN || join(REPO_ROOT, 'objdir', 'dist', 'bin', 'powerbrowser')), 'pbp66probe');
const KEEP_PROMPTS = { alwaysMatch: { unhandledPromptBehavior: { default: 'ignore' } } };
const COMMON_DIALOG_URL = 'chrome://global/content/commonDialog.xhtml';

const out = { date: new Date().toISOString(), dpr: DPR, withOrca: WITH_ORCA, q3: {}, q4: {}, q5: {}, console: {}, orca: {}, notes: [] };

const LOGGER = `<script>
window.__log = [];
for (const t of ['pointerdown','pointerup','pointermove','mousedown','mouseup','click','dblclick','wheel','keydown','keyup','beforeinput','input','focus','blur'])
  addEventListener(t, e => __log.push({ type: e.type, trusted: e.isTrusted, target: (e.target && (e.target.id || e.target.nodeName)) || 'window', x: e.clientX, y: e.clientY, key: e.key }), true);
</script>`;
const pagesSpec = {
    '/user': { title: 'P66 user', body: `<input id="in" value="">${LOGGER}` },
    '/user2': { title: 'P66 user2', body: '<p>user2</p>' },
    '/agent': {
        title: 'P66 agent',
        body: `<style>body{margin:0;height:3000px}#t{position:absolute;left:100px;top:80px;width:40px;height:40px;background:rgb(255,0,0)}#in{position:absolute;left:10px;top:200px}</style><div id="t"></div><input id="in">${LOGGER}`,
    },
    '/blank': { title: 'P66 blank', body: '<p>blank</p>' },
    '/s2': { title: 'P66 S2 goto', body: '<p>s2</p>' },
};

const actorQuery = (app, tabId, name, data = {}) => inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)});
    if (!o) return { error: 'no overlay' };
    let q;
    try { q = o.browsingContext.currentWindowGlobal.getActor(${JSON.stringify(ACTOR)}).sendQuery(${JSON.stringify(name)}, ${JSON.stringify(data)}); }
    catch (e) { return { error: 'getActor: ' + e }; }
    return Promise.race([q.then(v => v, e => ({ error: String(e) })), new Promise(r => setTimeout(() => r({ error: 'actor timeout' }), 6000))]);`);

async function registerProbeActor(app) {
    // The content sandbox cannot read the profile's files (run 1: the child never loaded), but it reads the
    // application directory; the module is placed in an untracked probe folder there and removed after the run.
    const dir = PROBE_MODULE_DIR;
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(HERE, 'p66-probe-child.sys.mjs'), join(dir, 'p66-probe-child.sys.mjs'));
    return inChrome(app, `const I = Components.interfaces;
        const io = Components.classes['@mozilla.org/network/io-service;1'].getService(I.nsIIOService);
        io.getProtocolHandler('resource').QueryInterface(I.nsIResProtocolHandler)
          .setSubstitution('pbp66probe', io.newURI(${JSON.stringify(`file://${dir}/`)}));
        const uri = 'resource://pbp66probe/p66-probe-child.sys.mjs';
        ChromeUtils.registerWindowActor(${JSON.stringify(ACTOR)}, {
          parent: { esModuleURI: uri }, child: { esModuleURI: uri }, messageManagerGroups: ['browsers'],
        });
        return 'registered';`);
}

const overlayFacts = (app, tabId) => inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)});
    if (!o) return null;
    return { visibility: o.style.visibility, width: o.style.width, height: o.style.height, active: o.docShellIsActive, chromeFocused: document.activeElement === o };`);

/** drawSnapshot of the overlay's top document, as P66-11's native screenshot row would; pixel reads at device px. */
const snapshotPixels = (app, tabId, points) => inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)});
    const wg = o.browsingContext.currentWindowGlobal;
    return wg.drawSnapshot(new window.DOMRect(0, 0, 300, 300), ${DPR}, 'rgb(255,255,255)').then(bmp => {
      const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0);
      const px = ${JSON.stringify(points)}.map(p => ({ ...p, rgba: [...ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data] }));
      return { size: [bmp.width, bmp.height], px };
    }, e => ({ error: String(e) }));`);

const DIALOG_WINDOW = `(() => { const en = Services.wm.getEnumerator(null); while (en.hasMoreElements()) { const w = en.getNext(); if (!w.closed && String(w.location && w.location.href) === ${JSON.stringify(COMMON_DIALOG_URL)} && w.document.readyState === 'complete') return w; } return null; })()`;

async function dialogFacts(app) {
    return inChrome(app, `const w = ${DIALOG_WINDOW};
        if (!w) return null;
        const bc = w.args && w.args.owningBrowsingContext;
        const embedder = bc && bc.top && bc.top.embedderElement;
        const I = Components.interfaces;
        return {
          promptType: w.args && w.args.promptType,
          modalType: w.args && w.args.modalType,
          body: (w.document.getElementById('infoBody')?.textContent ?? '').trim().slice(0, 80),
          ownerTabId: embedder ? W.tabIdOfBrowser(embedder) : null,
          shellInputEnabled: window.docShell.treeOwner.QueryInterface(I.nsIBaseWindow).enabled,
        };`);
}

const answerDialog = (app, { accept, text = null }) => inChrome(app, `const w = ${DIALOG_WINDOW};
    if (!w) return 'no dialog';
    if (${JSON.stringify(text)} !== null) { const e = w.document.getElementById('loginTextbox'); e.value = ${JSON.stringify(text)}; e.dispatchEvent(new w.Event('input', { bubbles: true })); }
    const dlg = w.document.getElementById('commonDialog');
    if (${accept}) dlg.acceptDialog(); else dlg.cancelDialog();
    return 'answered';`);

async function q3q4q5(app, pages) {
    out.q3.actor = await registerProbeActor(app);
    const A = await openWebTab(app, pages.url('/user'));
    if (await waitForPush(app, loadedAt(A, '/user')) < 0) throw new Error('user tab never loaded');
    out.q3.focusUserOverlay = await focusOverlay(app, A);
    out.q3.focusUserInput = await actorQuery(app, A, 'focusInput');
    if (out.q3.focusUserInput?.error) throw new Error(`probe actor unusable: ${out.q3.focusUserInput.error}`);
    const opened = await probe(app, `const ref = get('WebTabChannel').widgetOf(${JSON.stringify(A)});
        const w = await get('WebTabOpenHandler').openInBackground(${JSON.stringify(pages.url('/agent'))}, ref);
        return { tabId: w.tabId };`);
    const B = opened.tabId;
    out.q3.agentLoadedPush = await waitForPush(app, loadedAt(B, '/agent')) >= 0;
    await new Promise(r => setTimeout(r, 500));
    out.q3.current = await probe(app, `const c = get('ApplicationShell').currentWidget; return { tabId: c && c.tabId };`);
    out.q3.overlayAtOpen = { user: await overlayFacts(app, A), agent: await overlayFacts(app, B) };
    out.q3.agentStateAtOpen = await actorQuery(app, B, 'state');
    out.q3.before = { chromeActiveTabId: await chromeActiveTabId(app), user: await actorQuery(app, A, 'state') };

    // Three placements of the agent overlay, each driven the same way (Q3):
    //   neverShown       opened in the background and never shown (P66-07 as written)
    //   shownThenHidden  shown once, then the user's tab made current again
    //   occludedVisible  visibility visible, z-index under the Theia frame, the user's tab box; docShellIsActive untouched
    out.q3.variants = {};
    const variant = async (label, setup) => {
        const v = out.q3.variants[label] = {};
        v.setup = await setup();
        await new Promise(r => setTimeout(r, 1000));
        await actorQuery(app, B, 'run', { code: "window.__log.length = 0; document.getElementById('in').value = ''; document.activeElement && document.activeElement.blur && document.activeElement.blur()" });
        const st = await actorQuery(app, B, 'state');
        v.overlay = await overlayFacts(app, B);
        v.agent = { inner: st.inner, dpr: st.dpr, target: st.target, visibility: st.visibility, hasFocus: st.hasFocus };
        const cx = st.target.x + st.target.w / 2, cy = st.target.y + st.target.h / 2;
        v.hitAtTargetCenter = (await actorQuery(app, B, 'state', { at: { x: cx, y: cy } })).hit;
        v.chromeTopAtTargetCenter = await inChrome(app, `const e = document.elementFromPoint(${cx}, ${cy}); return e ? (W.tabIdOfBrowser(e) || e.id || e.localName) : null;`);
        // The user's log is cleared after setup, so a blur listed below came from the agent input, not from the setup's tab switch.
        await actorQuery(app, A, 'run', { code: 'window.__log.length = 0' });
        const before = { chromeActiveTabId: await chromeActiveTabId(app), user: await actorQuery(app, A, 'state') };
        for (const type of ['mousemove', 'mousedown', 'mouseup']) {
            await actorQuery(app, B, 'mouse', { type, x: cx, y: cy });
        }
        await actorQuery(app, B, 'wheel', { x: cx, y: cy, dy: 40 });
        await new Promise(r => setTimeout(r, 300));
        const afterMouse = await actorQuery(app, B, 'state');
        v.pointerEvents = afterMouse.log.filter(e => !['keydown', 'keyup', 'input', 'beforeinput', 'focus', 'blur'].includes(e.type)).map(e => `${e.type}:${e.target}:${e.trusted}:${e.x},${e.y}`);
        v.clickHitTarget = v.pointerEvents.some(e => e.startsWith('click:t:true'));
        v.focusInput = await actorQuery(app, B, 'focusInput');
        v.keySend = await actorQuery(app, B, 'key', { keys: [{ key: 'a', code: 'KeyA', keyCode: 65 }, { key: 'b', code: 'KeyB', keyCode: 66 }] });
        v.insert = await actorQuery(app, B, 'insert', { text: 'xyz' });
        await new Promise(r => setTimeout(r, 300));
        const afterKeys = await actorQuery(app, B, 'state');
        v.inputValue = afterKeys.value;
        v.keyEvents = afterKeys.log.filter(e => ['keydown', 'keyup', 'input', 'beforeinput', 'focus'].includes(e.type)).map(e => `${e.type}:${e.target}:${e.trusted}:${e.key ?? ''}`);
        const after = { chromeActiveTabId: await chromeActiveTabId(app), user: await actorQuery(app, A, 'state') };
        v.focus = {
            chromeActiveBefore: before.chromeActiveTabId, chromeActiveAfter: after.chromeActiveTabId,
            userActiveBefore: before.user.active, userActiveAfter: after.user.active,
            userHasFocusBefore: before.user.hasFocus, userHasFocusAfter: after.user.hasFocus,
            userBlurred: (after.user.log || []).filter(e => e.type === 'blur').map(e => e.target),
            agentHasFocusAfter: afterKeys.hasFocus, agentActiveAfter: afterKeys.active,
        };
        v.screenshot = await snapshotPixels(app, B, [
            { name: 'targetCenter', x: cx * DPR, y: cy * DPR },
            { name: 'targetInsideEdge', x: (st.target.x + 2) * DPR, y: (st.target.y + 2) * DPR },
            { name: 'outsideLeft', x: (st.target.x - 3) * DPR, y: cy * DPR },
        ]);
    };
    await variant('neverShown', async () => overlayFacts(app, B));
    await variant('shownThenHidden', async () => {
        const shown = await makeCurrent(app, B);
        await new Promise(r => setTimeout(r, 800));
        const sizeWhileShown = (await actorQuery(app, B, 'state')).inner;
        const back = await makeCurrent(app, A);
        await focusOverlay(app, A);
        await actorQuery(app, A, 'focusInput');
        return { shown, back, sizeWhileShown };
    });
    await variant('occludedVisible', async () => inChrome(app, `const a = overlayOf(${JSON.stringify(A)}), b = overlayOf(${JSON.stringify(B)});
        Object.assign(b.style, { left: a.style.left, top: a.style.top, width: a.style.width, height: a.style.height, zIndex: '-1', visibility: 'visible' });
        return { zIndex: b.style.zIndex, visibility: b.style.visibility, active: b.docShellIsActive };`));
    out.q4.screenshotHiddenOverlay = out.q3.variants.neverShown.screenshot;
    out.q4.clickThroughChild = Object.fromEntries(Object.entries(out.q3.variants).map(([k, v]) => [k, v.clickHitTarget]));

    // Console mechanism (P66-11): ConsoleAPIStorage listener in the child, then page console calls.
    out.console.listen = await actorQuery(app, B, 'console');
    await actorQuery(app, B, 'run', { code: "console.log('p66 log', 42); console.warn('p66 warn'); console.error('p66 err')" });
    await new Promise(r => setTimeout(r, 300));
    out.console.captured = (await actorQuery(app, B, 'state')).console;

    // Q5: alert, confirm, prompt from the hidden agent overlay.
    const kinds = [
        { kind: 'alert', code: "setTimeout(() => { window.__result = (alert('p66 alert'), 'returned'); }, 0)", answer: { accept: true } },
        { kind: 'confirm', code: "setTimeout(() => { window.__result = confirm('p66 confirm'); }, 0)", answer: { accept: false } },
        { kind: 'prompt', code: "setTimeout(() => { window.__result = prompt('p66 prompt', 'dflt'); }, 0)", answer: { accept: true, text: 'p66-text' } },
    ];
    out.q5.rows = [];
    for (const k of kinds) {
        await actorQuery(app, B, 'run', { code: `window.__result = undefined; ${k.code}` });
        const t0 = Date.now();
        let facts = null;
        try { facts = await pollFor(() => dialogFacts(app), 8000, 'a commonDialog'); } catch { facts = null; }
        const row = { kind: k.kind, appearedMs: facts ? Date.now() - t0 : null, facts };
        if (facts) {
            // While it is open: a Theia frontend -> chrome request round trip (what a webTabAgent call needs).
            const rt0 = Date.now();
            row.roundTrip = await probe(app, `const r = await Promise.race([
                get('WebTabChannel').widgetOf(${JSON.stringify(A)}).navigate(${JSON.stringify(pages.url('/user2'))}),
                new Promise(res => setTimeout(() => res({ timedOut: true }), 8000))]); return r;`, 30000);
            row.roundTripMs = Date.now() - rt0;
            row.answered = await answerDialog(app, k.answer);
            await new Promise(r => setTimeout(r, 400));
            row.pageResult = (await actorQuery(app, B, 'state')).result;
            row.after = await dialogFacts(app);
            // put the user tab back for the next row
            await probe(app, `await get('WebTabChannel').widgetOf(${JSON.stringify(A)}).navigate(${JSON.stringify(pages.url('/user'))}); return true;`);
        }
        out.q5.rows.push(row);
    }
    return { A, B };
}

function cli(nodeBin, env, cwd, secrets, cliArgs) {
    const started = Date.now();
    return new Promise((resolveP) => {
        execFile(nodeBin, [CLI, ...cliArgs, '--json'], { env, cwd, encoding: 'utf8', timeout: 90000 }, (error, stdout, stderr) => {
            let json = null;
            try { json = JSON.parse(stdout); } catch { /* text */ }
            resolveP({ ok: !error && json !== null, json, text: redact(`${stdout}${stderr}`, secrets).trim().slice(0, 400), ms: Date.now() - started });
        });
    });
}
const payload = (json) => json?.result ?? json;
/** Only the error code and message of a failed CLI call; the envelope's _meta (runtime id) is not recorded. */
const cliError = (r) => ({ errorCode: r.json?.error?.code ?? null, errorMessage: r.json?.error?.message ?? null });

/** The in-page S2 host over the thin client: one page table, background web tabs, user close reported as browser.tabClose. */
const HOST_SETUP = (pairingInput, origin, blankUrl) => `
    await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = ${JSON.stringify(`${origin}/${BUNDLE_REL}`)};
        s.onload = resolve; s.onerror = () => reject(new Error('thin bundle did not load'));
        document.head.appendChild(s);
    });
    const c = await PbThin.connect(${JSON.stringify(pairingInput)});
    const st = await c.call('status.get');
    const runtimeId = st._meta && st._meta.runtimeId;
    const H = window.__p66 = { c, runtimeId, events: [], pages: new Map(), hostId: 'pb-p66-' + crypto.randomUUID(), ready: null };
    const settle = async (ev, result) => {
        const { type: _t, command: _c, ...authority } = ev;
        const ack = await c.call('browser.clientHost.commandResult', { ...authority, result });
        H.events.push(ev.command.type + (ev.command.method ? '(' + ev.command.method + ')' : '') + ':' + result.status + ':' + (ack.ok ? 'acked' : ack.error.code));
    };
    const loaded = (tabId, url) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => { removeEventListener(${JSON.stringify(WEB_TAB_STATE_EVENT)}, on); reject(new Error('no loaded push')); }, 15000);
        const on = e => { const d = e.detail; if (d && d.kind === 'state' && d.tabId === tabId && d.loading === false && d.url === url) { clearTimeout(timer); removeEventListener(${JSON.stringify(WEB_TAB_STATE_EVENT)}, on); resolve({ url: d.url, title: d.title }); } };
        addEventListener(${JSON.stringify(WEB_TAB_STATE_EVENT)}, on);
    });
    const serve = async ev => {
        const cmd = ev.command;
        try {
            if (cmd.type === 'createPage') {
                if (H.pages.has(ev.browserPageId)) return settle(ev, { status: 'failed', errorCode: 'browser_tab_not_found' });
                const cur = get('ApplicationShell').currentWidget;
                const w = await get('WebTabOpenHandler').openInBackground(${JSON.stringify(blankUrl)}, cur);
                H.pages.set(ev.browserPageId, w.tabId);
                w.disposed.connect(() => { if (H.pages.get(ev.browserPageId) === w.tabId) { H.userClosed = H.userClosed || []; H.userClosed.push(ev.browserPageId); } });
                return settle(ev, { status: 'completed' });
            }
            if (cmd.type === 'closePage') {
                const id = (cmd.targetAuthority && cmd.targetAuthority.browserPageId) || ev.browserPageId;
                const tabId = H.pages.get(id); H.pages.delete(id);
                const w = tabId && get('WebTabChannel').widgetOf(tabId); if (w) w.close();
                return settle(ev, { status: 'completed' });
            }
            const tabId = H.pages.get(ev.browserPageId);
            if (!tabId) return settle(ev, { status: 'failed', errorCode: 'browser_tab_not_found' });
            if (cmd.type === 'navigate' || (cmd.type === 'automation' && cmd.method === 'browser.goto')) {
                const url = cmd.type === 'navigate' ? cmd.url : String(cmd.params.url);
                const p = loaded(tabId, url);
                await get('WebTabChannel').widgetOf(tabId).navigate(url);
                const v = await p;
                return settle(ev, cmd.type === 'navigate' ? { status: 'completed' } : { status: 'completed', value: v });
            }
            return settle(ev, { status: 'failed', errorCode: 'browser_command_unavailable' });
        } catch (e) {
            H.events.push(cmd.type + ':threw:' + e.message);
            return settle(ev, { status: 'failed', errorCode: 'browser_error' }).catch(() => {});
        }
    };
    H.subId = c.subscribe('browser.clientHost.attach', {
        authorityRuntimeId: runtimeId, browserHostClientId: H.hostId,
        hostCapabilities: ['webview', 'automation-v1'],
        pageCommandProtocolVersion: 1, pageInventoryProtocolVersion: 1, pageInventory: [], pageReconciliationProtocolVersion: 1,
    }, frame => {
        if (!frame.ok) { H.ready = 'error:' + (frame.error && frame.error.code); return; }
        const r = frame.result;
        if (r && r.type === 'ready') H.ready = 'accepted';
        else if (r && r.type === 'command') serve(r);
        else if (r && r.type === 'revoked') H.events.push('revoked:' + r.reason);
    });
    await until(() => H.ready, 15000);
    return { ready: H.ready, runtimeIdPresent: !!runtimeId, statusOk: st.ok, secure: window.isSecureContext };
`;

async function orcaHalf(app, pages, ctx) {
    const { node, env, repo, ready } = ctx;
    const web = new URL(ready.webClientUrl);
    const pairingInput = decodeURIComponent(web.hash.replace(/^#pairing=/, ''));
    const sel = `path:${repo}`;
    out.orca.attach = await probe(app, HOST_SETUP(pairingInput, web.origin, pages.url('/blank')), 60000);
    if (out.orca.attach?.ready !== 'accepted') return;

    // O4: CLI tab create -> createPage -> one background PB web tab.
    const created = await cli(node.path, env, repo, ready.secrets, ['tab', 'create', '--worktree', sel]);
    const pageId = payload(created.json)?.browserPageId;
    out.orca.cliTabCreate = { ok: created.ok, ms: created.ms, pageIdPresent: !!pageId, text: created.ok ? undefined : created.text };
    out.orca.afterCreate = await probe(app, `const H = window.__p66; const tabId = H.pages.get(${JSON.stringify(pageId ?? '')}); const c = get('ApplicationShell').currentWidget;
        return { events: H.events.slice(), mapped: !!tabId, mappedIsCurrent: !!c && c.tabId === tabId };`);

    // O5: the renderer path in the web build: browser.tabCreate from a paired client, without and with client placement.
    out.orca.rendererPath = await probe(app, `const H = window.__p66;
        const a = await H.c.call('browser.tabCreate', { worktree: ${JSON.stringify(sel)}, navigation: 'caller', waitForRegistration: false });
        const b = await H.c.call('browser.tabCreate', { worktree: ${JSON.stringify(sel)}, placement: { kind: 'client', browserHostClientId: H.hostId }, navigation: 'caller' });
        await sleep(500);
        return { noPlacement: a.ok ? { ok: true } : { ok: false, code: a.error.code, message: String(a.error.message).slice(0, 160) },
                 clientPlacement: b.ok ? { ok: true, pageIdPresent: !!(b.result && b.result.browserPageId) } : { ok: false, code: b.error.code, message: String(b.error.message).slice(0, 160) },
                 events: H.events.slice() };`, 60000);

    // O8: CLI goto on the CLI-created page through the thin host.
    if (pageId) {
        const went = await cli(node.path, env, repo, ready.secrets, ['goto', '--url', pages.url('/s2'), '--page', pageId]);
        out.orca.cliGoto = { ok: went.ok, ms: went.ms, title: payload(went.json)?.title ?? null, text: went.ok ? undefined : went.text };
        const click = await cli(node.path, env, repo, ready.secrets, ['click', '--page', pageId, '--element', 'p']);
        out.orca.cliUnservedCommand = { ok: click.ok, ...cliError(click) };
    }
    // An unmapped page id is refused (P66-05 default code).
    const bogus = await cli(node.path, env, repo, ready.secrets, ['goto', '--url', pages.url('/s2'), '--page', 'not-a-page']);
    out.orca.unknownPage = { ok: bogus.ok, ...cliError(bogus) };

    // O6: user closes the mapped tab; the host reports it as browser.tabClose on its own connection.
    if (pageId) {
        out.orca.userClose = await probe(app, `const H = window.__p66; const tabId = H.pages.get(${JSON.stringify(pageId)});
            const w = get('WebTabChannel').widgetOf(tabId); const before = H.events.length;
            w.close(); await sleep(300);
            H.pages.delete(${JSON.stringify(pageId)});
            const r = await H.c.call('browser.tabClose', { worktree: ${JSON.stringify(sel)}, page: ${JSON.stringify(pageId)} });
            return { userClosedSeen: (H.userClosed || []).includes(${JSON.stringify(pageId)}), reply: r.ok ? r.result : { code: r.error.code }, eventsAfter: H.events.slice(before) };`, 60000);
        const list = await cli(node.path, env, repo, ready.secrets, ['tab', 'list', '--worktree', sel]);
        const tabs = payload(list.json)?.tabs ?? [];
        out.orca.listAfterClose = { ok: list.ok, stillListed: tabs.some(t => t.browserPageId === pageId), count: tabs.length };
    }

    // O7: a second paired client from the same offer while the first stays attached.
    out.orca.secondClient = await probe(app, `const c2 = await PbThin.connect(${JSON.stringify(pairingInput)}).catch(e => ({ err: e.message }));
        if (c2.err) return { connected: false, err: c2.err };
        const st = await c2.call('status.get'); const tl = await c2.call('browser.tabList', { worktree: ${JSON.stringify(sel)} });
        const firstStill = await window.__p66.c.call('status.get');
        c2.close();
        return { connected: true, statusOk: st.ok, tabListOk: tl.ok, tabCount: tl.ok ? tl.result.tabs.length : null, firstStillOk: firstStill.ok };`, 60000);
}

function prepareOrca() {
    for (const f of [join(ORCA_DIR, 'out', 'orcad', 'orcad.js'), CLI, join(ORCA_DIR, 'out', 'web', BUNDLE_REL)]) {
        if (!existsSync(f)) throw new Error(`${f} is absent. Next step: build-orca.sh, the CLI build, build-p66-thin-host.sh`);
    }
    const profile = join(WORK, 'powerbrowser-orca');
    rmSync(profile, { recursive: true, force: true });
    mkdirSync(profile, { recursive: true });
    mkdirSync(dirname(PROFILE_ALIAS), { recursive: true });
    rmSync(PROFILE_ALIAS, { force: true });
    symlinkSync(profile, PROFILE_ALIAS);
    const repo = join(WORK, 'scratch-repo');
    if (!existsSync(join(repo, '.git'))) {
        mkdirSync(repo, { recursive: true });
        writeFileSync(join(repo, 'README.md'), 'p66 gate scratch repository\n');
        const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=probe', '-c', 'user.email=probe@invalid', ...a], { stdio: 'ignore' });
        git('init', '-q', '-b', 'main'); git('add', '.'); git('commit', '-q', '-m', 'scratch');
    }
    return repo;
}

async function main() {
    let restore = installOutputRedaction([]);
    const pages = await serveNavPages(pagesSpec);
    let run = null;
    let ctx = null;
    try {
        if (WITH_ORCA) {
            const repo = prepareOrca();
            const node = await ensurePbNode();
            const orcaVersion = orcaVersionFromPins();
            const env = orcadEnv(process.env, { profileDir: PROFILE_ALIAS, orcaVersion });
            run = await startOrcad({ nodeBin: node.path, orcaDir: ORCA_DIR, profileDir: PROFILE_ALIAS, env });
            restore();
            restore = installOutputRedaction(run.ready.secrets);
            ctx = { node, env, repo, ready: run.ready };
            Object.assign(out, { orcaVersion, node: node.version });
            const added = await cli(node.path, env, repo, run.ready.secrets, ['repo', 'add', '--path', repo]);
            if (!added.ok) out.notes.push(`repo add: ${added.text}`);
        }
        await withProbeShell(async (app) => {
            await q3q4q5(app, pages);
            if (ctx) await orcaHalf(app, pages, ctx);
        }, { extraPrefs: { 'layout.css.devPixelsPerPx': String(DPR) }, capabilities: KEEP_PROMPTS });
    } finally {
        await pages.close();
        if (run) {
            const { survivors } = await stopOrcad(run.child, run.ready.daemonPid);
            if (survivors?.length) out.notes.push(`orcad survivors after teardown: ${survivors.join(', ')}`);
        }
        restore();
        rmSync(PROBE_MODULE_DIR, { recursive: true, force: true });
    }
}

let failure = null;
try { await main(); } catch (e) { failure = redact(e.stack ?? String(e)).slice(0, 600); out.notes.push(`error: ${failure}`); }
writeFileSync(join(HERE, `results-p66-gate-dpr${DPR}.json`), `${JSON.stringify(out, null, 2)}\n`);
console.log(failure ? `p66-gate-probe: FAIL -- ${failure.split('\n')[0]}` : `p66-gate-probe: DONE -- dpr ${DPR}; see results-p66-gate-dpr${DPR}.json`);
process.exit(failure ? 1 : 0);
