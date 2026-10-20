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
//     GET's cache headers.
//
// Node built-ins plus ./pb-relaunch.mjs only.

import { createServer } from 'node:http';
import { GET_BY_NAME, makeProfile, pollFor, probe, sourceConst, withShell } from './pb-relaunch.mjs';

export const WEB_TAB_STATE_EVENT = sourceConst('theia/extensions/tab-uris/src/browser/web-tab.ts', 'WEB_TAB_STATE_EVENT');
const API_URL = 'chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs';

/** Which route pressKey took on its last call: 'tip' or 'bidi-chrome'. */
export const keyRoute = { last: '' };

/**
 * A fresh profile, a purged startup cache, the shell up and the push recorder
 * installed; runs `fn(app)` and disposes the profile.
 */
export async function withProbeShell(fn) {
    const profile = await makeProfile();
    process.env.MOZ_PURGE_CACHES = '1';
    console.log('purgecaches: MOZ_PURGE_CACHES=1');
    try {
        return await withShell(profile, async app => {
            await installPushRecorder(app);
            return fn(app);
        });
    } finally {
        await profile.dispose();
    }
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

/** Focuses the overlay of `tabId`; true when chrome's active element is then that overlay. */
export async function focusOverlay(app, tabId) {
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

// WebDriver's normalised key code points for the non-printable keys used here.
const BIDI_KEYS = { Escape: '', Shift: '', Control: '', Alt: '', Meta: '', F5: '', F6: '' };

/**
 * Serves `pages` (`{ '/a': { title, body, slow } }`) on 127.0.0.1. A `slow` page
 * sends its headers and the head of its body, then holds the response open
 * until `close()`, so the tab stays loading. Every GET is recorded in
 * `requests` as `{ path, cacheControl, pragma }`.
 */
export async function serveNavPages(pages) {
    const requests = [];
    const held = new Set();
    const server = createServer((request, response) => {
        const path = new URL(request.url, 'http://127.0.0.1').pathname;
        if (request.method === 'GET') {
            requests.push({ path, cacheControl: request.headers['cache-control'] ?? null, pragma: request.headers.pragma ?? null });
        }
        const page = pages[path];
        if (!page) {
            response.writeHead(404, { 'content-type': 'text/plain' });
            response.end('not found');
            return;
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        const head = `<!doctype html><html><head><title>${page.title}</title></head><body>${page.body ?? ''}`;
        if (page.slow) {
            response.write(head);
            held.add(response);
            response.on('close', () => held.delete(response));
            return;
        }
        response.end(`${head}</body></html>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    return {
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
}

export { GET_BY_NAME, probe, pollFor };
