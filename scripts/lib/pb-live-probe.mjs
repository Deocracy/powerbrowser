// scripts/lib/pb-live-probe.mjs
//
// Phase 27: the live-probe harness for page-focus keys and the chrome-bar
// navigation buttons, on top of pb-relaunch.mjs's withShell. What it adds:
//   - a launch with MOZ_PURGE_CACHES=1 (the environment form of -purgecaches,
//     upstream/toolkit/xre/nsAppRunner.cpp), so an edited
//     powerbrowser/shell/*.js actually runs rather than its startup-cache copy;
//   - a push recorder in the Theia frame: every PowerBrowserWebTabState detail,
//     in arrival order;
//   - chrome-scope reads and writes of page focus and of the page-key rows,
//     finding an overlay through PowerBrowserWebTabs.tabIdOfBrowser;
//   - key synthesis at the PARENT, through nsITextInputProcessor in a
//     chrome-scope evaluate, so GlobalKeyListener and the reply path both see
//     the key. BiDi input on a content context would synthesise inside the
//     content process and never reach a chrome <key> (27-RESEARCH Pitfall P11);
//     BiDi input on the chrome context is the fallback if TIP is refused;
//   - served pages that may hang mid-body (`slow: true`) and a record of every
//     GET's cache headers, query string and Cookie header;
//   - (Phase 29) the pill and preference helpers the nav-keys and address-bar
//     live checks share.
//
// Node built-ins plus ./pb-relaunch.mjs only.

import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { GET_BY_NAME, makeProfile, pollFor, probe, sourceConst, withShell, REPO_ROOT } from './pb-relaunch.mjs';
import { join } from 'node:path';
import { activeWindow, osKeys, osPointer, raiseShell } from './pb-kwin.mjs';

export const WEB_TAB_STATE_EVENT = sourceConst('theia/extensions/tab-uris/src/browser/web-tab.ts', 'WEB_TAB_STATE_EVENT');
const API_URL = 'chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs';

/** Which route pressKey took on its last call: 'tip', 'bidi-chrome' or (PB_REAL_INPUT=1) 'os'. */
export const keyRoute = { last: '' };

// 39-15: PB_REAL_INPUT=1 sends pressKey and osClientPointer as real OS input (ydotool behind pb-kwin's gate),
// which needs a compositor window: the session runs headed.
const REAL_INPUT = process.env.PB_REAL_INPUT === '1';
if (REAL_INPUT) {
    process.env.PB_LIVE_HEADED = '1';
}

/**
 * A fresh profile, a purged startup cache, the shell up and the push recorder
 * installed; runs `fn(app)` and disposes the profile. `opts.extraPrefs`
 * appends `user_pref` lines to the profile before launch (Phase 31: the TLS
 * fixture's `network.dns.localDomains` must be in place at startup).
 * `opts.capabilities` goes to the BiDi session.new.
 */
export async function withProbeShell(fn, opts = {}) {
    const profile = await makeProfile(opts.extraPrefs ?? {});
    process.env.MOZ_PURGE_CACHES = '1';
    console.log('purgecaches: MOZ_PURGE_CACHES=1');
    try {
        return await withShell(profile, async app => {
            // Phase 31 plan 05: the quit checks read the profile's files after the browser exits.
            app.profileDir = profile.profileDir;
            await installPushRecorder(app);
            await installFireRecorder(app);
            if (opts.trustFixtureCA) {
                await trustFixtureCA(app);
            }
            return fn(app);
        }, { capabilities: opts.capabilities });
    } finally {
        await profile.dispose();
    }
}

/**
 * Phase 31: trusts the test-only fixture CA (`scripts/fixtures/tls/`,
 * never outside a throwaway probe profile) in the running shell. The CA
 * bytes come from the fixture tree at call time -- no CA bytes are
 * spelled here. Runs over `app.send` (WebDriver BiDi `script.evaluate`
 * against the shell document), never through a chrome-scope `Cc` line in
 * a tracked script: the `Cc`/`Ci` identifiers below live inside a
 * double-quoted BiDi expression string evaluated in the browser, which
 * the boundary scan does not treat as a tracked-file touchpoint (the
 * same standing rule every live check's chrome-scope reads already
 * rely on).
 */
export async function trustFixtureCA(app) {
    const pemPath = join(REPO_ROOT, 'scripts/fixtures/tls/test-ca.pem').replace(/\\/g, '/');
    const b64 = readFileSync(pemPath, 'utf8').split('\n').filter(l => l && !l.startsWith('-----')).join('');
    const expr = `(async () => {
        const C = globalThis.Cc ?? Components.classes;
        const I = globalThis.Ci ?? Components.interfaces;
        const certdb = C['@mozilla.org/security/x509certdb;1'].getService(I.nsIX509CertDB);
        certdb.addCertFromBase64(${JSON.stringify(b64)}, 'C,,');
        return true;
    })()`;
    return app.send('script.evaluate', {
        expression: expr,
        target: { context: app.chrome },
        awaitPromise: true,
    }).then(r => r?.result?.value ?? r);
}

export async function installPushRecorder(app) {
    const ok = await app.evaluate(`(() => {
        if (!window.__pbPushes) {
            window.__pbPushes = [];
            window.addEventListener(${JSON.stringify(WEB_TAB_STATE_EVENT)}, event => {
                try { window.__pbPushes.push(JSON.parse(JSON.stringify(event.detail))); } catch (e) { window.__pbPushes.push({ kind: '(unserialisable)' }); }
            });
        }
        return true;
    })()`);
    if (ok !== true) {
        throw new Error('the push recorder could not be installed in the Theia frame');
    }
}

/**
 * Records, in chrome, every firing of a page-key <key> row's command (the row
 * id, in order), and every F6/Shift+F6 keydown chrome prevents (as
 * focusAddressF6/focusAddressShiftF6, the reply listener's rows). A row that leaks under Theia focus fires its command even
 * though relayShortcut then refuses to push, so this, not the push, is what an
 * absence check under Theia focus must read.
 */
export async function installFireRecorder(app) {
    const rows = await app.evaluateIn(app.chrome, `(() => {
        const rows = [...document.querySelectorAll('key[id^="powerbrowser-page-key-"]')];
        if (!window.__pbFired) {
            window.__pbFired = [];
            for (const k of rows) k.addEventListener('command', () => window.__pbFired.push(k.id.slice('powerbrowser-page-key-'.length)));
            // F6/Shift+F6 have no <key> row: record chrome taking an F6 instead.
            // Bubble phase, after the reply listener. Chrome's preventDefault clears
            // isReplyEventFromRemoteContent (StopCrossProcessForwarding), and an
            // untouched reply arrives already prevented by content's ESM, so "chrome
            // prevented it" reads: prevented, not by a page script, and neither a
            // live reply nor waiting for one.
            window.addEventListener('keydown', e => {
                if (e.isTrusted && e.keyCode === KeyEvent.DOM_VK_F6 && !e.ctrlKey && !e.altKey && !e.metaKey
                    && e.defaultPrevented && !e.defaultPreventedByContent
                    && !e.isReplyEventFromRemoteContent && !e.isWaitingReplyFromRemoteContent) {
                    window.__pbFired.push(e.shiftKey ? 'focusAddressShiftF6' : 'focusAddressF6');
                }
            });
        }
        return rows.length;
    })()`);
    if (!(rows > 0)) {
        throw new Error('the page-key fire recorder found no powerbrowser-page-key-* rows in the shell document');
    }
}

/** Every page-key row firing recorded so far, in order. */
export async function firedRows(app) {
    return JSON.parse(await app.evaluateIn(app.chrome, 'JSON.stringify(window.__pbFired || [])'));
}

/** Every push recorded so far, in order. */
export async function pushes(app) {
    return JSON.parse(await app.evaluate('JSON.stringify(window.__pbPushes || [])'));
}

/** Waits for a recorded push at index >= `from` matching `pred`; returns its index, or -1 on timeout. */
export async function waitForPush(app, pred, { from = 0, timeoutMs = 15000 } = {}) {
    try {
        return await pollFor(async () => {
            const list = await pushes(app);
            for (let i = from; i < list.length; i++) {
                if (pred(list[i])) {
                    return i + 1;
                }
            }
            return 0;
        }, timeoutMs, 'a matching push') - 1;
    } catch {
        return -1;
    }
}

/** Opens `url` as an in-shell web tab through the stock open handler; returns its tab id. */
export async function openWebTab(app, url) {
    const result = await probe(app, `const widget = await get('WebTabOpenHandler').openUrl(${JSON.stringify(url)}); return { tabId: widget.tabId };`);
    if (!result || typeof result.tabId !== 'string') {
        throw new Error(`opening a web tab returned no tab id: ${JSON.stringify(result)}`);
    }
    return result.tabId;
}

/** Runs `body` in the shell document with `W` bound to PowerBrowserWebTabs and `overlayOf(tabId)` in scope. */
export async function inChrome(app, body) {
    return app.evaluateIn(app.chrome, `(() => {
        const W = ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserWebTabs;
        const overlayOf = tabId => [...document.querySelectorAll('browser')].find(b => W.tabIdOfBrowser(b) === tabId) || null;
        ${body}
    })()`);
}

/** Chrome's `style.visibility` for the overlay of `tabId` ('visible' or 'hidden'), or null when it has none. */
export async function overlayVisibility(app, tabId) {
    return inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); return o ? o.style.visibility : null;`);
}

/**
 * Focuses the overlay of `tabId` as a click into the page would; true when
 * chrome's active element is then that overlay. It waits for chrome to show
 * the overlay first: Gecko cannot focus a hidden element, and chrome shows it
 * again only when the frontend's next geometry publish arrives, a frame or
 * more after a menu or dropdown closes. A user cannot click a hidden page
 * either, so this waits on the state the step needs rather than retrying.
 */
export async function focusOverlay(app, tabId) {
    try {
        await pollFor(async () => await overlayVisibility(app, tabId) === 'visible', 5000, 'the page to be shown');
    } catch {
        return false;
    }
    return inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); if (!o) return false; o.focus(); return document.activeElement === o;`);
}

/** Focuses the Theia frame's <browser>; true when it is then chrome's active element. */
export async function focusTheiaFrame(app) {
    return inChrome(app, `const b = document.getElementById('powerbrowser-content'); b.focus(); return document.activeElement === b;`);
}

/** The tab id of the overlay chrome has focused, or null. */
export async function chromeActiveTabId(app) {
    return inChrome(app, 'return W.tabIdOfBrowser(document.activeElement);');
}

/** Whether the page-key row `id` carries `disabled`; null when the row element is missing (a broken instrument). */
export async function pageKeyDisabled(app, id) {
    return inChrome(app, `const k = document.getElementById(${JSON.stringify(`powerbrowser-page-key-${id}`)}); return k ? k.hasAttribute('disabled') : null;`);
}

const MODIFIER_KEYS = {
    shift: { key: 'Shift', code: 'ShiftLeft', keyCode: 16 },
    control: { key: 'Control', code: 'ControlLeft', keyCode: 17 },
    accel: { key: 'Control', code: 'ControlLeft', keyCode: 17 },
    alt: { key: 'Alt', code: 'AltLeft', keyCode: 18 },
    meta: { key: 'Meta', code: 'MetaLeft', keyCode: 91 },
};

/**
 * Presses one key at the parent: modifier keydowns first, the key, keyups in
 * reverse. `modifiers` is a list of 'shift' | 'control' | 'accel' | 'alt' | 'meta'.
 */
export async function pressKey(app, { key, code, keyCode, modifiers = [] }) {
    const mods = modifiers.map(name => {
        const m = MODIFIER_KEYS[name];
        if (!m) {
            throw new Error(`pressKey: unknown modifier ${name}`);
        }
        return m;
    });
    if (REAL_INPUT) {
        await shellActiveOnce(app);
        osKeys([...modifiers.map(name => OS_MODIFIERS[name]), osKeyName(code ?? key)]);
        keyRoute.last = 'os';
        // A uinput key reaches the page through the compositor, not inside this call: give the dispatch a moment.
        await new Promise(r => setTimeout(r, 200));
        return;
    }
    const tip = await app.evaluateIn(app.chrome, `(() => {
        try {
            const C = typeof Cc !== 'undefined' ? Cc : Components.classes;
            const I = typeof Ci !== 'undefined' ? Ci : Components.interfaces;
            const tip = C['@mozilla.org/text-input-processor;1'].createInstance(I.nsITextInputProcessor);
            if (!tip.beginInputTransactionForTests(window)) return 'tip: no transaction';
            const ev = d => new KeyboardEvent('', d);
            const mods = ${JSON.stringify(mods)};
            const target = ${JSON.stringify({ key, code, keyCode })};
            for (const m of mods) tip.keydown(ev(m));
            tip.keydown(ev(target));
            tip.keyup(ev(target));
            for (const m of mods.slice().reverse()) tip.keyup(ev(m));
            return 'ok';
        } catch (e) {
            return 'tip: ' + e;
        }
    })()`);
    if (tip === 'ok') {
        keyRoute.last = 'tip';
        return;
    }
    // Fallback: BiDi key input dispatched against the chrome context.
    const down = [...mods.map(m => m.key), key].map(k => ({ type: 'keyDown', value: BIDI_KEYS[k] ?? k }));
    const up = down.slice().reverse().map(a => ({ type: 'keyUp', value: a.value }));
    await app.send('input.performActions', { context: app.chrome, actions: [{ type: 'key', id: 'pb-keys', actions: [...down, ...up] }] });
    keyRoute.last = `bidi-chrome (${tip})`;
}

const OS_MODIFIERS = { shift: 'shift', control: 'ctrl', accel: 'ctrl', alt: 'alt', meta: 'meta' };
const OS_NAMED = {
    Escape: 'esc', Enter: 'enter', Space: 'space', ' ': 'space', Tab: 'tab', Backspace: 'backspace', Delete: 'delete',
    Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', ArrowUp: 'up', ArrowDown: 'down',
    ArrowLeft: 'left', ArrowRight: 'right', ContextMenu: 'menu', BrowserBack: 'back', BrowserForward: 'forward',
    ShiftLeft: 'shift', ControlLeft: 'ctrl', AltLeft: 'alt', MetaLeft: 'meta', Shift: 'shift', Control: 'ctrl', Alt: 'alt', Meta: 'meta',
};
/** pb-kwin's key name for a DOM `code` (or `key`): KeyR -> r, Digit5 -> 5, F5 -> f5, ArrowLeft -> left. */
function osKeyName(code) {
    const c = String(code);
    return OS_NAMED[c] ?? (/^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : c).toLowerCase();
}

// The sessions raised for real input: each new shell window is raised once, then the gate alone decides every send.
const raisedApps = new WeakSet();
/** Raises the shell window once per session and waits up to 5 s for KWin to report it active. */
async function shellActiveOnce(app) {
    if (raisedApps.has(app)) {
        return;
    }
    raiseShell();
    for (let i = 0; i < 50 && !String(activeWindow()?.resourceClass ?? '').toLowerCase().includes('powerbrowser'); i++) {
        await new Promise(r => setTimeout(r, 100));
    }
    raisedApps.add(app);
}

/** Which route osClientPointer took on its last call, and the calibration it used. */
export const pointerRoute = { last: '', calibration: null };
const pointerOrigins = new Map();

/**
 * Real pointer input (PB_REAL_INPUT=1) at client point (x, y) of the document in BiDi `context`. The screen mapping
 * is the shell's KWin frame geometry plus the document's mozInnerScreenX/Y, scaled by devicePixelRatio over the
 * output scale; it is calibrated by a hover read-back: the pointer moves to the mapped point, the document's last
 * trusted mousemove reports where it landed, and the origin is corrected until the read-back is within 2 px (at
 * most five attempts). Throws "calibration failed" with the measured error otherwise. `spec` is osPointer's, plus
 * `calibrateAt` (a client point to calibrate on when the target itself cannot be read back).
 */
export async function osClientPointer(app, context, { x: tx, y: ty, calibrateAt, ...spec }) {
    // `calibrateAt`: calibrate on that client point of the same document, then act at (tx, ty) through the same
    // mapping -- for a target that raises no mousemove in the document (a native window-drag handle over it).
    const { x, y } = calibrateAt ?? { x: tx, y: ty };
    await shellActiveOnce(app);
    const doc = JSON.parse(await app.evaluateIn(context, `(() => {
        if (!window.__pbHoverInstalled) {
            window.__pbHoverInstalled = true;
            addEventListener('mousemove', e => { if (e.isTrusted) window.__pbHover = { x: e.clientX, y: e.clientY }; }, true);
        }
        return JSON.stringify({ ix: mozInnerScreenX, iy: mozInnerScreenY, dpr: devicePixelRatio });
    })()`));
    const w = activeWindow();
    if (!w || !String(w.resourceClass).toLowerCase().includes('powerbrowser')) {
        throw new Error(`refused: active window class ${JSON.stringify(w?.resourceClass ?? '')} does not contain "powerbrowser"`);
    }
    const ratio = doc.dpr / (w.scale || 1);
    const key = `${context}@${w.x},${w.y}`;
    // mozInnerScreenX/Y count from the surface, which carries the client-side shadow KWin's frame excludes; the shell
    // document's own value is that inset (measured: 26.4, 23.2 CSS px at scale 1.25).
    const inset = JSON.parse(await app.evaluateIn(app.chrome, 'JSON.stringify({ x: mozInnerScreenX, y: mozInnerScreenY })'));
    let origin = pointerOrigins.get(key) ?? { x: w.x + (doc.ix - inset.x) * ratio, y: w.y + (doc.iy - inset.y) * ratio };
    const tries = [];
    for (let attempt = 0; attempt < 5; attempt++) {
        const sx = Math.round(origin.x + x * ratio);
        const sy = Math.round(origin.y + y * ratio);
        await app.evaluateIn(context, 'window.__pbHover = null; true');
        // A nudge first, so the final move is a real motion that raises a mousemove even when already on the point.
        await osPointer({ x: sx + 3, y: sy + 3, action: 'move' });
        await osPointer({ x: sx, y: sy, action: 'move' });
        await new Promise(r => setTimeout(r, 120));
        const seen = JSON.parse(await app.evaluateIn(context, 'JSON.stringify(window.__pbHover)'));
        if (!seen) {
            // No trusted mousemove reached the document: the mapped point is off it, or the move raised none yet.
            tries.push({ screen: [sx, sy], read: null });
            if (tries.filter(t => !t.read).length >= 2) {
                break;
            }
            continue;
        }
        const ex = seen.x - x;
        const ey = seen.y - y;
        tries.push({ screen: [sx, sy], read: [seen.x, seen.y], error: [Math.round(ex * 10) / 10, Math.round(ey * 10) / 10] });
        if (Math.abs(ex) <= 2 && Math.abs(ey) <= 2) {
            pointerOrigins.set(key, origin);
            pointerRoute.last = 'os';
            pointerRoute.calibration = { attempts: attempt + 1, error: [ex, ey], ratio, tries };
            const ax = Math.round(origin.x + tx * ratio);
            const ay = Math.round(origin.y + ty * ratio);
            return spec.action === 'move' && !calibrateAt ? { x: sx, y: sy } : osPointer({ x: ax, y: ay, ...spec });
        }
        origin = { x: origin.x - ex * ratio, y: origin.y - ey * ratio };
    }
    pointerRoute.last = 'calibration failed';
    pointerRoute.calibration = { ratio, tries };
    throw new Error(`calibration failed: the hover read-back never came within 2 px of (${x}, ${y}): ${JSON.stringify(tries)} (window ${w.x},${w.y} scale ${w.scale}, document at ${doc.ix},${doc.iy} dpr ${doc.dpr})`);
}

// WebDriver's normalised key code points for the non-printable keys used here.
const BIDI_KEYS = { Escape: '', Shift: '', Control: '', Alt: '', Meta: '', F5: '', F6: '', Enter: '\uE007' };

/**
 * Serves `pages` (`{ '/a': { title, body, slow, delayMs, extra(request) } }`) on
 * 127.0.0.1 over plain http, plus -- when `opts.tls` names the fixture
 * server names -- over `node:https` with the fixture leaf beside this
 * `serveNavPages` definition (never a `.planning/` path). A `slow` page
 * sends its headers and the head of its body, then holds the response open
 * until `close()`, so the tab stays loading; a `delayMs` page finishes that
 * many milliseconds after its head, so its loading and loaded pushes land
 * in separate frames. `extra(request)` appends to one page's body (Phase 31:
 * the mixed fixture's `http:` subresource, whose port is known only after
 * listen). A `json: params => value` page
 * answers `application/x-suggestions+json` with `value(searchParams)`, or
 * a 500 when that value is undefined (an engine whose suggest endpoint
 * fails). Every GET is recorded in `requests` as
 * `{ path, search, cookie, cacheControl, pragma, at }` (`search` is the
 * query string, `cookie` the Cookie header or null, `at` is Date.now()).
 */
export async function serveNavPages(pages, opts = {}) {
    const requests = [];
    const held = new Set();
    const handler = (request, response) => {
        const parsed = new URL(request.url, 'http://127.0.0.1');
        const path = parsed.pathname;
        if (request.method === 'GET') {
            requests.push({
                path,
                search: parsed.search,
                cookie: request.headers.cookie ?? null,
                cacheControl: request.headers['cache-control'] ?? null,
                pragma: request.headers.pragma ?? null,
                at: Date.now(),
            });
        }
        const page = pages[path];
        if (!page) {
            response.writeHead(404, { 'content-type': 'text/plain' });
            response.end('not found');
            return;
        }
        if (page.json) {
            const value = page.json(parsed.searchParams);
            if (value === undefined) {
                response.writeHead(500, { 'content-type': 'text/plain' });
                response.end('failed');
                return;
            }
            response.writeHead(200, { 'content-type': 'application/x-suggestions+json' });
            response.end(JSON.stringify(value));
            return;
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        const extra = typeof page.extra === 'function' ? page.extra(request) : '';
        const head = `<!doctype html><html><head><title>${page.title}</title></head><body>${page.body ?? ''}${extra}`;
        if (page.slow || page.delayMs) {
            response.write(head);
            held.add(response);
            response.on('close', () => held.delete(response));
            if (page.delayMs) {
                setTimeout(() => response.end('</body></html>'), page.delayMs);
            }
            return;
        }
        response.end(`${head}</body></html>`);
    };
    const server = createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const out = {
        origin,
        url: path => `${origin}${path}`,
        requests,
        close: () => new Promise(resolve => {
            for (const response of held) {
                response.end();
            }
            server.closeAllConnections?.();
            server.close(() => resolve());
        }),
    };
    // Phase 31: the TLS twin. `opts.tls.port` pins the https port (the
    // fixture host must resolve to loopback at connect time); the leaf and
    // key are read from beside `serveNavPages` at serve time.
    if (opts.tls) {
        const tlsDir = join(REPO_ROOT, 'scripts/fixtures/tls');
        const tlsServer = createHttpsServer({
            key: readFileSync(join(tlsDir, 'pb-fixture.key')),
            cert: readFileSync(join(tlsDir, 'pb-fixture.pem')),
        }, handler);
        await new Promise(resolve => tlsServer.listen(opts.tls.port, '127.0.0.1', resolve));
        out.tlsOrigin = `https://www.pb-fixture.test:${tlsServer.address().port}`;
        out.tlsUrl = path => `${out.tlsOrigin}${path}`;
        out.close = () => new Promise(resolve => {
            for (const response of held) {
                response.end();
            }
            server.closeAllConnections?.();
            tlsServer.closeAllConnections?.();
            server.close(() => tlsServer.close(() => resolve()));
        });
    }
    return out;
}

/** Prefix of a failure that means the check's own instrument broke, not the product. */
export const BROKEN = 'broken instrument:';

/** A state push for `tabId` with `loading` as given. */
export const isState = (tabId, loading) => p => p && p.kind === 'state' && p.tabId === tabId && p.loading === loading;

/** A loaded state push for `tabId` whose URL ends with `path`. */
export const loadedAt = (tabId, path) => p => isState(tabId, false)(p) && String(p.url).endsWith(path);

/** Sets a Home setting in the user scope (the profile's own config dir) and waits until it reads back. */
export const setPref = (app, key, value) => probe(app, `const prefs = get('PreferenceService');
    await prefs.ready;
    await prefs.set(${JSON.stringify(key)}, ${JSON.stringify(value)}, 1);
    return await until(() => prefs.get(${JSON.stringify(key)}) === ${JSON.stringify(value)}, 10000);`);

/** The pill input's focus and selection, and the dropdown's rows and footers, in the Theia frame. */
export const readPill = app => app.evaluate(`JSON.stringify((() => {
    const input = document.querySelector('.pb-chrome-bar-input');
    const dropdown = document.querySelector('.pb-chrome-bar-dropdown');
    return {
        focused: !!input && document.activeElement === input,
        value: input ? input.value : null,
        selected: !!input && input.selectionStart === 0 && input.selectionEnd === input.value.length,
        rows: dropdown ? [...dropdown.querySelectorAll('.pb-chrome-bar-row')].map(r => r.textContent) : [],
        footers: dropdown ? dropdown.querySelectorAll('.pb-chrome-bar-dropdown-footer').length : 0,
    };
})())`).then(JSON.parse);

/** Dispatches a keydown on the pill input (React's root listener sees it bubble). */
export const pillKey = (app, key) => app.evaluate(`(() => {
    const input = document.querySelector('.pb-chrome-bar-input');
    if (!input) return false;
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ${JSON.stringify(key)} }));
    return true;
})()`);

/** Page-realm expression: the configured application name, trimmed ('' when none). */
export const appNameExpr = `(() => {
    const key = Object.getOwnPropertySymbols(window).find(k => k.description === 'FrontendApplicationConfigProvider');
    return String((key && window[key] && window[key].applicationName) || '').trim();
})()`;

/** Makes the web tab `tabId` the shell's current, visible widget. */
export const makeCurrent = (app, tabId) => probe(app, `const shell = get('ApplicationShell');
    const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});
    await shell.activateWidget(w.id);
    return await until(() => shell.mainPanel.currentTitle?.owner === w && w.isVisible, 5000);`);

export { GET_BY_NAME, probe, pollFor };
