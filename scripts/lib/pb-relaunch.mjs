// scripts/lib/pb-relaunch.mjs
//
// Non-GUI wave C (NG-029..NG-038): helpers for the wave's live checks, on top
// of firefox-bidi.mjs's withFirefoxPage, which owns the launch, the BiDi
// session and process hygiene. What this file adds:
//   - a kept profile (withFirefoxPage's `profileDir`, f4818a0) and a private
//     config home per check, so a check can quit and relaunch on the SAME
//     profile (NG-032..NG-034) and setups.json / modes.json start empty;
//   - the product's own quit: the core window's close button, or the
//     desktop's close (a cancelable 'close' event, then window.close() unless
//     a handler cancelled it -- AppWindow::RequestWindowClose's sequence),
//     driven in the chrome document through BiDi's "moz:scope": "chrome" tree
//     (withFirefoxPage launches with --remote-allow-system-access);
//   - page-realm probes over window.theia.container, served pages, a port
//     holder (the Review Focus port change), and constants derived from the
//     tree so no check re-spells an id.

import { lstatSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withFirefoxPage } from './firefox-bidi.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SHELL_DOCUMENT_URL = 'chrome://powerbrowser/content/powerbrowser.xhtml';

/** A `NAME = '<value>'` constant read out of a source file. */
export function sourceConst(rel, name) {
    const match = new RegExp(`\\b${name}\\s*=\\s*'([^']+)'`).exec(readFileSync(join(REPO_ROOT, rel), 'utf8'));
    if (!match) {
        throw new Error(`pb-relaunch: ${rel} no longer declares ${name}, so the check cannot derive it`);
    }
    return match[1];
}

/** The first capture group of `regex` in a source file. */
export function sourceMatch(rel, regex) {
    const match = regex.exec(readFileSync(join(REPO_ROOT, rel), 'utf8'));
    if (!match) {
        throw new Error(`pb-relaunch: ${rel} no longer matches ${regex}, so the check cannot derive its expectation`);
    }
    return match[1];
}

export const WEB_TAB_FACTORY_ID = sourceConst('theia/extensions/tab-uris/src/browser/web-tab.ts', 'WEB_TAB_FACTORY_ID');

/** Page-realm DI lookup by binding name, the helper every live check in this tree inlines. */
export const GET_BY_NAME = `function __getByName(container, name) {
    let found;
    container._bindingDictionary.traverse(key => {
        if (found) return;
        const keyStr = typeof key === 'symbol' ? key.toString() : (key && key.name) || String(key);
        if (keyStr === 'Symbol(' + name + ')' || keyStr === name) found = key;
    });
    if (!found) throw new Error('DI binding not found for identifier name: ' + name);
    return container.get(found);
}`;

/**
 * One page-realm expression around `body`, an async function body returning
 * a JSON-safe object. In scope: `container`, `get(name)`, `sleep(ms)`,
 * `until(predicate, ms)`, `webTabs()`. A throw becomes `{ error }`.
 */
export function probeExpression(body) {
    return `(async () => {
        ${GET_BY_NAME}
        const container = window.theia.container;
        const get = name => __getByName(container, name);
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const until = async (predicate, ms) => {
            const end = Date.now() + ms;
            for (;;) {
                try { if (await predicate()) return true; } catch (e) { /* keep polling */ }
                if (Date.now() > end) return false;
                await sleep(100);
            }
        };
        const webTabs = () => get('ApplicationShell').getWidgets('main').filter(widget => {
            const description = get('WidgetManager').getDescription(widget);
            return !!description && description.factoryId === ${JSON.stringify(WEB_TAB_FACTORY_ID)};
        });
        let result;
        try {
            result = await (async () => { ${body} })();
        } catch (e) {
            result = { error: 'probe threw: ' + e };
        }
        return JSON.stringify(result === undefined ? null : result);
    })()`;
}

let probeCount = 0;

/**
 * Runs `body` in the shell's Theia frame and returns its parsed result.
 * firefox-bidi.mjs gives every BiDi request 20 s, and a probe that waits on
 * the product (a 20 s `until`, then a settle) takes longer, so the probe is
 * started in one evaluation and its result read back by polling.
 */
export async function probe(app, body, timeoutMs = 180000) {
    const slot = JSON.stringify(`__pbProbe${probeCount += 1}`);
    const started = await app.evaluate(`(() => {
        window[${slot}] = null;
        ${probeExpression(body)}.then(text => { window[${slot}] = { text }; },
            e => { window[${slot}] = { text: JSON.stringify({ error: 'probe rejected: ' + e }) }; });
        return true;
    })()`);
    if (started !== true) {
        throw new Error('the page probe did not start (the frontend is gone or the script did not parse)');
    }
    const text = await pollFor(() => app.evaluate(`window[${slot}] ? window[${slot}].text : null`), timeoutMs, 'the page probe to finish');
    if (typeof text !== 'string') {
        throw new Error('the page probe returned nothing (the frontend is gone or the script did not parse)');
    }
    return JSON.parse(text);
}

/**
 * Polls `fn` every 250 ms until it returns a truthy value within `timeoutMs`.
 * A value that arrives after the deadline does not count. The timeout error
 * carries the last error `fn` threw, so a harness red says what went wrong.
 */
export async function pollFor(fn, timeoutMs, what) {
    const end = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() <= end) {
        try {
            const value = await fn();
            if (value && Date.now() <= end) {
                return value;
            }
        } catch (error) {
            lastError = error;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}${lastError ? ` (last error: ${lastError.message})` : ''}`);
}

/**
 * Holds `port` on 127.0.0.1 so the next launch's port-0 spawn cannot be given
 * it -- the Review Focus restart condition, where the backend port changes
 * between launches. Retries while the stopped backend still owns the port.
 */
export async function holdPort(port) {
    let server;
    try {
        await pollFor(async () => {
            server = createNetServer();
            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, '127.0.0.1', resolve);
            });
            return true;
        }, 10000, `port ${port} to be free to hold`);
    } catch (error) {
        // A listen that completed after the deadline does not count; do not leak it.
        if (server && server.listening) {
            server.close();
        }
        throw error;
    }
    return () => new Promise(resolve => server.close(() => resolve()));
}

/**
 * Serves `pages` (`{ '/a': { title, body } }`) on 127.0.0.1; `url(path)` builds
 * a served URL. A POST to any path (a page's navigator.sendBeacon) is recorded
 * in `received` as `{ path, body }`: how a page reports what it saw while it
 * is going away, when no BiDi read can reach it any more.
 */
export async function servePages(pages) {
    const received = [];
    const server = createHttpServer((request, response) => {
        const path = new URL(request.url, 'http://127.0.0.1').pathname;
        if (request.method === 'POST') {
            let body = '';
            request.setEncoding('utf8');
            request.on('data', chunk => { body += chunk; });
            request.on('end', () => {
                received.push({ path, body });
                response.writeHead(204, { 'access-control-allow-origin': '*' });
                response.end();
            });
            return;
        }
        const page = pages[path];
        if (!page) {
            response.writeHead(404, { 'content-type': 'text/plain' });
            response.end('not found');
            return;
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(`<!doctype html><html><head><title>${page.title}</title></head><body>${page.body ?? ''}</body></html>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    return { origin, url: path => `${origin}${path}`, received, close: () => new Promise(resolve => server.close(() => resolve())) };
}

/**
 * The BiDi content context on `url` in a stock browser window: a chrome-scope
 * window other than the shell document whose tabbrowser has a tab on `url`,
 * and the only content context on `url`, so an in-shell web-tab overlay on
 * the same page cannot stand in for it.
 */
export async function stockTabOn(app, url, timeoutMs = 20000) {
    return pollFor(async () => {
        const onUrl = (await app.contexts()).filter(entry => entry.url === url);
        if (onUrl.length !== 1) {
            return undefined;
        }
        for (const chromeWindow of (await app.contexts('chrome')).filter(entry => entry.url !== SHELL_DOCUMENT_URL)) {
            const holds = await app.evaluateIn(chromeWindow.context,
                `typeof gBrowser === 'object' && gBrowser.browsers.some(browser => browser.currentURI.spec === ${JSON.stringify(url)})`);
            if (holds === true) {
                return onUrl[0];
            }
        }
        return undefined;
    }, timeoutMs, `a stock browser window holding the only tab on ${url}`);
}

/** True while the profile's `lock` symlink exists (Gecko removes it when the browser exits). */
function profileLocked(profileDir) {
    try {
        lstatSync(join(profileDir, 'lock'));
        return true;
    } catch {
        return false;
    }
}

/**
 * A kept profile and a private config home. withFirefoxPage's spawn inherits
 * process.env, so every launch of this check uses this config home. The
 * profile's user.js turns off crash-resume: a launch the check had to kill
 * (an app that did not quit) must not bring its stock windows back into the
 * next launch, where they would sit beside the shell's own context.
 * withFirefoxPage appends its own override to this file (f4818a0).
 * `extraPrefs` (Phase 31: the TLS fixture hosts) appends one `user_pref`
 * line per entry, so the prefs are in place before the first launch --
 * prefs that only take effect at startup (e.g. `network.dns.localDomains`)
 * cannot be set later through any probe.
 */
export async function makeProfile(extraPrefs = {}) {
    const profileDir = await mkdtemp(join(tmpdir(), 'pb-ng-c-profile-'));
    const configHome = await mkdtemp(join(tmpdir(), 'pb-ng-c-config-'));
    const lines = ['user_pref("browser.sessionstore.resume_from_crash", false);'];
    for (const [key, value] of Object.entries(extraPrefs)) {
        lines.push(`user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`);
    }
    await writeFile(join(profileDir, 'user.js'), lines.join('\n') + '\n');
    process.env.XDG_CONFIG_HOME = configHome;
    return {
        profileDir,
        configHome,
        dispose: async () => {
            await rm(profileDir, { recursive: true, force: true });
            await rm(configHome, { recursive: true, force: true });
        },
    };
}

/**
 * Launches the shell on `profile` (kept between calls), waits for its Theia
 * frontend to reach 'ready', and runs `fn(app)`. `app`: evaluate(expr) in the
 * Theia frame, evaluateIn(context, expr), send(method, params),
 * contexts(scope?), chrome (the shell document's context), port (the
 * sidecar's), quit({ how, timeoutMs }) -> 'exited' | 'timeout'. Returns what
 * `fn` returns. withFirefoxPage stops a browser that is still running and
 * leaves the profile in place.
 */
export async function withShell(profile, fn, { capabilities } = {}) {
    return withFirefoxPage('', async ({ evaluate, evaluateIn, send, waitFor, exitCode }) => {
        await waitFor('window.theia && window.theia.container ? true : false', { timeoutMs: 120000 });
        await waitFor(`(() => { try { ${GET_BY_NAME}
            return __getByName(window.theia.container, 'FrontendApplicationStateService').state === 'ready';
        } catch (e) { return false; } })()`, { timeoutMs: 120000 });
        const contexts = async scope =>
            (await send('browsingContext.getTree', scope ? { 'moz:scope': scope } : {})).contexts
                .map(entry => ({ context: entry.context, url: entry.url }));
        const chrome = (await pollFor(async () => (await contexts('chrome')).find(entry => entry.url === SHELL_DOCUMENT_URL),
            30000, 'a chrome context for the shell document')).context;
        const hadLock = profileLocked(profile.profileDir);
        // Resolves 'exited' once the socket is closed and the profile lock is gone, else 'timeout'.
        const awaitExit = async (timeoutMs = 30000) => {
            try {
                await pollFor(async () => {
                    const socketClosed = await send('browsingContext.getTree', {}).then(() => false, () => true);
                    return socketClosed && !(hadLock && profileLocked(profile.profileDir));
                }, timeoutMs, 'the browser to exit');
                return 'exited';
            } catch {
                return 'timeout';
            }
        };
        const app = {
            evaluate,
            evaluateIn,
            send,
            contexts,
            chrome,
            port: Number(await evaluate('location.port')),
            awaitExit,
            exitCode,
            async quit({ how = 'button', timeoutMs = 30000 } = {}) {
                // 'desktop-close' is the desktop's close as Gecko delivers it
                // (AppWindow::RequestWindowClose, xpfe/appshell/AppWindow.cpp):
                // a cancelable 'close' event on the window, then the window
                // closes unless a handler cancelled it. A bare window.close()
                // fires no 'close' event, and the event alone has no default
                // action, so neither half alone is the desktop's close.
                const expression = how === 'desktop-close'
                    ? `if (window.dispatchEvent(new Event('close', { cancelable: true }))) window.close(); true`
                    : `document.getElementById('powerbrowser-window-close').click(); true`;
                // Not awaited: the chrome document may go away before the call returns.
                evaluateIn(chrome, expression).catch(() => undefined);
                return awaitExit(timeoutMs);
            },
        };
        return fn(app);
    }, { profileDir: profile.profileDir, capabilities });
}

/**
 * Runs one check: a fresh profile, `body({ profile, fail, defer })`, cleanup,
 * then `<label>: PASS` (exit 0) or one `<label>: FAIL -- <reason>` line per
 * failure (exit 1). A thrown error is reported as `harness: …`: the check
 * could not drive the product, which is a red that is not the row's.
 */
export async function runCheck(label, body) {
    const failures = [];
    const cleanups = [];
    const profile = await makeProfile();
    try {
        await body({ profile, fail: reason => failures.push(reason), defer: fn => cleanups.push(fn) });
    } catch (error) {
        failures.push(`harness: ${error.message}`);
    } finally {
        for (const fn of cleanups.reverse()) {
            try {
                await fn();
            } catch {
                // Best-effort cleanup.
            }
        }
        await profile.dispose();
    }
    if (failures.length) {
        for (const reason of failures) {
            console.error(`${label}: FAIL -- ${reason}`);
        }
        process.exit(1);
    }
    console.log(`${label}: PASS`);
    process.exit(0);
}
