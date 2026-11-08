// scripts/lib/firefox-bidi.mjs
//
// Zero-dependency WebDriver BiDi driver for `objdir/dist/bin/firefox`, the
// Firefox build this repo already produces (Phase 1). Per D-69: not
// Playwright, not Puppeteer, not geckodriver -- the pinned `nodejs_24`
// exposes a global `WebSocket`, so this file imports no package, only Node
// built-ins and globals.
//
// Dev-shell note, settled live on this host 2026-08-20: `objdir/dist/bin/
// firefox --version` was run both from a plain shell and from inside
// `nix develop .#theia` and returned `Mozilla Firefox 153.1.0esr` in both,
// with no shared-library error. The binary does NOT require
// `nix develop .#firefox` to run, so this driver spawns it directly rather
// than through a `nix develop .#firefox --command` wrapper.
//
// Process hygiene is a hard requirement, not a nicety (D-69): every caller
// goes through `withFirefoxPage`, whose `finally` always kills the spawned
// Firefox and removes its temporary profile directory -- on the success
// path, on a thrown assertion, and on SIGINT. Phase 5's whole subject is
// orphaned processes; this harness must not manufacture that failure mode.

import { spawn } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { existsSync, createWriteStream, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
// Phase 3 (03-02): the binary this driver targets by default is the
// PowerBrowser-branded build, not stock `firefox` -- plan 03-01 step 8 removes
// the stale `dist/bin/firefox` entirely, and identity surface 1 requires
// that no file by that name remain. Every caller that passes no override
// (four of the five Phase 2 checks) now routes through this renamed target;
// callers that need a different binary (e.g. a release-branding build) pass
// `binPath` explicitly.
// PB_FIREFOX_BIN / PB_BACKEND_MAIN (non-GUI build, 2026-09-25): a clone of this
// repo has no objdir/, so it drives the main checkout's binary (PB_FIREFOX_BIN)
// against its own Theia build (PB_BACKEND_MAIN, written into the temporary
// profile's user.js). Chrome-side .sys.mjs changes still load from the main
// checkout, because objdir/dist/bin symlinks into it.
export const FIREFOX_BIN = process.env.PB_FIREFOX_BIN || join(REPO_ROOT, 'objdir', 'dist', 'bin', 'powerbrowser');

// 39-REVIEW CR-01: the pids of the browsers withFirefoxPage launched that are still running. pb-kwin's real-input
// gate accepts only a window one of them owns, so a PowerBrowser the owner has open never receives a send.
const launchedPids = new Set();
/** The pids of the browsers this process launched through withFirefoxPage that have not exited. */
export function launchedBrowserPids() {
    return [...launchedPids];
}

/**
 * A BiDi RemoteValue as the plain value the evaluated expression returned. Primitives arrive as their value already;
 * an object arrives as [key, RemoteValue] pairs and an array as a RemoteValue list, so a caller reading `.field` off
 * a raw object result reads undefined (found live in the v1.5 end-of-milestone pass). Nodes, windows and other
 * handle types have no plain form and stay as the RemoteValue.
 */
export function fromRemoteValue(rv) {
    if (!rv || typeof rv !== 'object' || !('type' in rv)) {
        return rv;
    }
    switch (rv.type) {
        case 'undefined':
            return undefined;
        case 'null':
            return null;
        case 'number':
            return typeof rv.value === 'number' ? rv.value : Number(rv.value);
        case 'bigint':
            return BigInt(rv.value);
        case 'string':
        case 'boolean':
            return rv.value;
        case 'array':
        case 'set':
            return (rv.value || []).map(fromRemoteValue);
        case 'object':
        case 'map':
            return Object.fromEntries((rv.value || []).map(([k, v]) => [typeof k === 'string' ? k : fromRemoteValue(k), fromRemoteValue(v)]));
        case 'date':
            return new Date(rv.value);
        case 'regexp':
            return new RegExp(rv.value.pattern, rv.value.flags);
        default:
            return rv;
    }
}

/**
 * The libpulse directory the build linked against, read from the objdir's config.status next to the
 * binary. Gecko dlopens libpulse by bare name and libxul's RUNPATH does not list it, so a binary run
 * outside a Nix wrapper logs "libpulse not found" in the audio server, and every media element dies
 * with a media-sink error (32-01): no sound plays, and no audio event ever fires. Undefined when the
 * binary has no config.status beside it (a release install), in which case the launch is unchanged.
 */
function pulseLibDir(binPath) {
    try {
        const status = readFileSync(join(dirname(binPath), '..', '..', 'config.status'), 'utf8');
        return /'MOZ_PULSEAUDIO_LIBS':\s*\[\s*'-L([^']+)'/.exec(status)?.[1];
    } catch {
        return undefined;
    }
}

async function applyProfileOverrides(profileDir) {
    if (!process.env.PB_BACKEND_MAIN) return;
    // Appended, not written: a kept profile or a caller may already hold a user.js.
    await appendFile(join(profileDir, 'user.js'),
        `user_pref("powerbrowser.sidecar.backendMain", ${JSON.stringify(process.env.PB_BACKEND_MAIN)});\n`);
}

const BIDI_LINE_RE = /WebDriver BiDi listening on (ws:\/\/127\.0\.0\.1:\d+)/;

async function freePort() {
    return new Promise((resolve, reject) => {
        const srv = createServer();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

function waitForBiDiUrl(child) {
    return new Promise((resolve, reject) => {
        let buf = '';
        const onData = chunk => {
            buf += chunk.toString('utf8');
            const m = buf.match(BIDI_LINE_RE);
            if (m) {
                child.stderr.off('data', onData);
                child.off('exit', onExit);
                resolve(m[1]);
            }
        };
        const onExit = code => {
            child.stderr.off('data', onData);
            reject(new Error(`firefox exited (code ${code}) before printing its BiDi listening line; stderr so far:\n${buf}`));
        };
        child.stderr.on('data', onData);
        child.once('exit', onExit);
        child.once('error', reject);
    });
}

class BiDiClient {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 1;
        this.pending = new Map();
        ws.addEventListener('message', event => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            const pending = this.pending.get(msg.id);
            if (!pending) return;
            this.pending.delete(msg.id);
            if (msg.type === 'error') {
                pending.reject(new Error(`BiDi error: ${msg.error} -- ${msg.message}`));
            } else {
                pending.resolve(msg);
            }
        });
        // CR-02: without these, a Firefox crash mid-session leaves every
        // in-flight send() pending forever -- the socket closes (or stops
        // producing messages) but nothing ever settles the pending promise,
        // which also silently defeats waitFor()'s own timeoutMs (it only
        // checks its deadline after an `await evaluate(...)` returns).
        // `closedError` (CR-03 follow-up, found live while proving CR-03
        // with a real SIGINT): 'close'/'error' fire once and reject only
        // whatever was pending AT THAT MOMENT -- a caller whose current
        // await is a plain `setTimeout` sleep, not a BiDi call, issues its
        // *next* send() only after the socket has already closed, and that
        // new pending entry would otherwise sit unrejected until its own
        // per-request timeout (measured live: a captureScreenshot call
        // issued after SIGINT-triggered close took the full 20s instead of
        // rejecting immediately). Recording the terminal error and having
        // every subsequent send() reject with it immediately closes that
        // gap.
        this.closedError = null;
        const failAll = err => {
            this.closedError = err;
            for (const { reject } of this.pending.values()) reject(err);
            this.pending.clear();
        };
        ws.addEventListener('close', () => failAll(new Error('BiDi WebSocket closed (browser likely died)')));
        ws.addEventListener('error', err => failAll(new Error(`BiDi WebSocket error: ${err.message || err}`)));
    }

    send(method, params, { timeoutMs = 20000 } = {}) {
        if (this.closedError) {
            return Promise.reject(this.closedError);
        }
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`BiDi request '${method}' timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            this.pending.set(id, {
                resolve: v => { clearTimeout(timer); resolve(v); },
                reject: e => { clearTimeout(timer); reject(e); },
            });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
}

/**
 * Poll topLevelContexts() for a context whose url is exactly the requested
 * one and return its context id. Throws naming the URL and the contexts seen
 * when nothing matches within timeoutMs -- it never falls back to the first
 * context, because silent fallback to contexts[0] is the WINDOWS-14 defect
 * this helper exists to close.
 */
async function resolveUrlContext(topLevelContexts, requestedUrl, { timeoutMs = 10000, intervalMs = 250 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const seen = await topLevelContexts();
        const match = seen.find(c => c.url === requestedUrl);
        if (match) return match.context;
        if (Date.now() >= deadline) {
            throw new Error(
                `firefox-bidi: requested URL ${JSON.stringify(requestedUrl)} matched no top-level browsing context `
                + `(saw: ${JSON.stringify(seen.map(c => c.url))})`
            );
        }
        await new Promise(r => setTimeout(r, intervalMs));
    }
}

/**
 * Poll `evaluate(expression)` until it returns a truthy value or the
 * timeout elapses. Used to wait for `window.theia?.container` to exist --
 * the page is a single-page app and the container appears after load, not
 * on first paint.
 */
export async function waitFor(evaluate, expression, { timeoutMs = 15000, intervalMs = 100 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await evaluate(expression);
        if (value) return value;
        if (Date.now() >= deadline) {
            throw new Error(`waitFor timed out after ${timeoutMs}ms waiting for truthy: ${expression}`);
        }
        await new Promise(r => setTimeout(r, intervalMs));
    }
}

/**
 * Launch `objdir/dist/bin/firefox --headless --screenshot` against `url` and
 * write a PNG to `outputPath`. This is a separate, simpler launch mode from
 * `withFirefoxPage`'s BiDi one -- no remote agent, no socket, just
 * `--screenshot` and wait for the process to exit -- kept a sibling export
 * rather than bending the BiDi helper to do both. Plan 05's pixel comparison
 * is the consumer; this file has no caller of its own.
 *
 * Shares the same cleanup discipline as `withFirefoxPage`: the process is
 * killed if it outlives `timeoutMs`, and the temporary profile is removed
 * unconditionally in a `finally`, on the success path, the timeout path, and
 * on SIGINT.
 */
export async function captureScreenshot(url, outputPath, { windowSize = '800,600', timeoutMs = 15000, binPath = FIREFOX_BIN } = {}) {
    if (!existsSync(binPath)) {
        throw new Error(
            `firefox-bidi: ${binPath} does not exist. Run the Phase 1 Firefox build first ` +
            `(see docs/BUILD.md "Firefox half") -- a fresh clone has no objdir/ until that build runs.`
        );
    }

    const profileDir = await mkdtemp(join(tmpdir(), 'powerbrowser-firefox-bidi-'));
    await applyProfileOverrides(profileDir);
    let sigintHandler;

    const child = spawn(binPath, [
        '--headless',
        '--profile', profileDir,
        '--window-size', windowSize,
        '--screenshot', outputPath,
        url,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    const cleanup = async () => {
        if (sigintHandler) process.off('SIGINT', sigintHandler);
        if (!child.killed && child.exitCode === null) {
            child.kill('SIGTERM');
            await new Promise(resolve => {
                const timer = setTimeout(() => {
                    if (child.exitCode === null) child.kill('SIGKILL');
                    resolve();
                }, 5000);
                child.once('exit', () => { clearTimeout(timer); resolve(); });
            });
        }
        await rm(profileDir, { recursive: true, force: true });
    };

    sigintHandler = () => {
        cleanup().finally(() => process.exit(130));
    };
    process.on('SIGINT', sigintHandler);

    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`captureScreenshot: firefox did not exit within ${timeoutMs}ms`));
            }, timeoutMs);
            child.once('exit', code => {
                clearTimeout(timer);
                if (code === 0) resolve();
                else reject(new Error(`captureScreenshot: firefox exited with code ${code}`));
            });
            child.once('error', err => {
                clearTimeout(timer);
                reject(err);
            });
        });
        return outputPath;
    } finally {
        await cleanup();
    }
}

/**
 * Launch `objdir/dist/bin/firefox` headless against `url`, connect over
 * WebDriver BiDi, and invoke
 * `callback({ evaluate, evaluateIn, send, waitFor, screenshot, topLevelContexts })`.
 * Guarantees Firefox is killed and its temporary profile removed before
 * returning or throwing, including on SIGINT.
 *
 * `topLevelContexts()` re-queries the live context tree on every call, and
 * `evaluateIn(context, expression)` (14.1-03) evaluates inside one of the
 * contexts it returned. Together they are how a caller that opened a SECOND
 * context reads inside it: `evaluate` is pinned to the launch-time context
 * and can never see the other one. `send(method, params)` (14.1-03) is the
 * raw BiDi command for what no named member covers -- trusted input via
 * `input.performActions` -- and returns the command's `result`.
 *
 * `screenshot()` (added for Plan 05's pixel-comparison harness) captures
 * the CURRENT state of the already-loaded page via BiDi
 * `browsingContext.captureScreenshot`, returning a `Buffer` -- callers
 * decide what to do with the bytes (write to disk, hash, decode). This is
 * a deliberately different mechanism from the sibling `captureScreenshot`
 * export below: that one launches `--headless --screenshot`, a one-shot
 * "load and screenshot" process mode with no scripting hook in between,
 * which was found (Plan 05, live) to fire on the page's early `load` event
 * -- well before a Theia SPA's `startContributions()`/shell-attach
 * sequence finishes, so it only ever captures a near-blank loading screen.
 * `withFirefoxPage`'s `screenshot()` instead runs inside the same session
 * `waitFor` already uses, so a caller can wait for `#theia-app-shell` (and
 * settle past any debounce) before capturing -- the only way to actually
 * see the rendered app.
 */
export async function withFirefoxPage(url, callback, { binPath = FIREFOX_BIN, stdoutPath, profileDir: keptProfileDir, capabilities = {} } = {}) {
    if (!existsSync(binPath)) {
        throw new Error(
            `firefox-bidi: ${binPath} does not exist. Run the Phase 1 Firefox build first ` +
            `(see docs/BUILD.md "Firefox half") -- a fresh clone has no objdir/ until that build runs.`
        );
    }

    // `profileDir` (non-GUI build restart checks): a caller-owned profile that
    // survives this launch, so a second withFirefoxPage call relaunches on it.
    // The caller creates and removes it; without it a temporary one is used.
    if (keptProfileDir) await mkdir(keptProfileDir, { recursive: true });
    const profileDir = keptProfileDir || await mkdtemp(join(tmpdir(), 'powerbrowser-firefox-bidi-'));
    await applyProfileOverrides(profileDir);
    const port = await freePort();

    // Without the flag below, script.evaluate against a parent-process
    // browsing context (e.g. about:support, identity surface 3) is refused
    // outright -- upstream/remote/webdriver-bidi/modules/root/
    // script.sys.mjs:844 checks RemoteAgent.allowSystemAccess and throws
    // "unsupported operation" otherwise. Empirically confirmed both
    // directions this session (03-02 Task 1): identical BiDi session reads
    // about:support's application-box live when it is present, and the same
    // read throws that exact error when it is absent.
    // GUI-01 (01-05): `stdoutPath` tees the launched binary's stdout to a file
    // so a caller can assert against the shell's own dump() sentinel channel
    // (POWERBROWSER_SHELL_READY and friends) in the SAME session it drives
    // over BiDi. Without it stdout is discarded, which is right for every
    // caller that only reads the page -- but the window checks need the
    // sentinel stream, and launching a second, differently-configured
    // instance to get it would assert against a different process than the
    // one under test.
    const stdoutSink = stdoutPath ? createWriteStream(stdoutPath) : undefined;
    // An EMPTY `url` means "launch with no URL argument at all", which is not
    // the same launch as `about:blank`. Found live (01-05): with GUI-01's
    // startup-window move landed, a URL on the command line opens a stock
    // browser window IN ADDITION to the shell -- upstream's
    // nsDefaultCommandLineHandler gates only its no-URI branch on
    // `cmdLine.preventDefault`, and takes the URI branch regardless. So every
    // caller passing a url gets two top-level browsing contexts, and a caller
    // that needs to assert the shell opened ALONE must pass none.
    const pulse = pulseLibDir(binPath);
    const env = pulse
        ? { ...process.env, LD_LIBRARY_PATH: [pulse, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') }
        : process.env;
    // `ulimit -c 0; exec` keeps the pid (kill still reaches the browser) and stops crash scenarios writing systemd coredumps.
    // PB_LIVE_HEADED=1 (39-01): a real window for the KWin capture and the real-input gate
    // (scripts/lib/pb-kwin.mjs); a headless session has no compositor window and a text-only clipboard.
    const child = spawn('bash', ['-c', 'ulimit -c 0; exec "$@"', 'bash', binPath,
        ...(process.env.PB_LIVE_HEADED === '1' ? [] : ['--headless']),
        '--profile', profileDir,
        `--remote-debugging-port=${port}`,
        '--remote-allow-hosts', '127.0.0.1',
        '--remote-allow-system-access',
        ...(url ? [url] : []),
    ], { env, stdio: ['ignore', stdoutSink ? 'pipe' : 'ignore', 'pipe'] });
    if (child.pid) {
        launchedPids.add(child.pid);
        child.once('exit', () => launchedPids.delete(child.pid));
    }
    if (stdoutSink) {
        child.stdout.pipe(stdoutSink);
    }

    let ws;
    let client;
    let sigintHandler;

    const cleanup = async () => {
        if (sigintHandler) process.off('SIGINT', sigintHandler);
        if (ws) {
            try { ws.close(); } catch { /* already closed */ }
        }
        if (!child.killed && child.exitCode === null) {
            child.kill('SIGTERM');
            await new Promise(resolve => {
                const timer = setTimeout(() => {
                    if (child.exitCode === null) child.kill('SIGKILL');
                    resolve();
                }, 5000);
                child.once('exit', () => { clearTimeout(timer); resolve(); });
            });
        }
        if (stdoutSink) {
            await new Promise(resolve => stdoutSink.end(resolve));
        }
        if (!keptProfileDir) await rm(profileDir, { recursive: true, force: true });
    };

    // CR-03: this handler must not call process.exit() itself. A caller
    // (e.g. verify-customize-inert.mjs) may have its own teardown to run
    // in its own `finally` after this function's promise settles -- if
    // this handler force-exits, it races ahead of that, and ahead of the
    // 5s SIGKILL-escalation + `rm(profileDir, ...)` sequence inside
    // cleanup() below, exactly the orphaned-process/leaked-profile bug
    // CR-03 describes. Closing the socket here is what unblocks an
    // in-flight BiDi call (CR-02's failAll(), fired by the WebSocket
    // 'close' event), which lets the awaited `callback(...)` above reject
    // and this function's own `try/finally` unwind naturally and
    // deterministically -- no forced exit, no race. `process.exitCode`
    // (not `process.exit()`) marks the eventual natural exit with the
    // conventional SIGINT code, without terminating anything early.
    sigintHandler = () => {
        process.exitCode = 130;
        cleanup();
    };
    process.on('SIGINT', sigintHandler);

    try {
        const wsUrl = await waitForBiDiUrl(child);
        ws = new WebSocket(`${wsUrl}/session`);
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true });
            ws.addEventListener('error', reject, { once: true });
        });

        client = new BiDiClient(ws);
        await client.send('session.new', { capabilities });

        // GUI-01 (01-05): the top-level browsing contexts this session can
        // see, url and context id only. A caller asserting that a SECOND
        // window opened has no other way to see it -- and the chrome window
        // wrapping it is invisible on this platform (WINDOWS.md 7), so the
        // content context it owns is the only observable.
        const topLevelContexts = async () => {
            const tree = await client.send('browsingContext.getTree', {});
            return tree.result.contexts.map(c => ({ context: c.context, url: c.url }));
        };

        // WINDOWS 14 (08-03): a URL on the command line opens a stock
        // browser window IN ADDITION to the shell, so contexts[0] is the
        // shell's own supervised frontend rather than the requested page.
        // Select the context carrying the requested URL; with no URL passed
        // there is only the shell context, taken with a logged note. Launch
        // semantics and process hygiene below are untouched -- only which
        // context evaluate/screenshot target changes.
        const requestedUrl = url || '';
        let context;
        if (requestedUrl) {
            context = await resolveUrlContext(topLevelContexts, requestedUrl);
        } else {
            const seen = await topLevelContexts();
            if (seen.length === 0) {
                throw new Error('firefox-bidi: browsingContext.getTree returned zero top-level contexts');
            }
            context = seen[0].context;
            console.warn(
                `firefox-bidi: no URL requested, evaluating against the first of `
                + `${seen.length} top-level context(s)`
            );
        }

        const evaluate = async expression => {
            const result = await client.send('script.evaluate', {
                expression,
                target: { context },
                awaitPromise: true,
            });
            return fromRemoteValue(result.result.result);
        };

        // GUI-02 (14.1-03): the same evaluation against a caller-chosen
        // context. `evaluate` is pinned to the launch-time context, so a
        // caller that opened a SECOND context (an in-shell web-tab overlay
        // is one) has no other way to read inside it. The context id comes
        // from `topLevelContexts()`; an unknown id rejects with the BiDi
        // error rather than evaluating anywhere else.
        const evaluateIn = async (targetContext, expression) => {
            const result = await client.send('script.evaluate', {
                expression,
                target: { context: targetContext },
                awaitPromise: true,
            });
            return fromRemoteValue(result.result.result);
        };

        const screenshot = async () => {
            const result = await client.send('browsingContext.captureScreenshot', { context });
            return Buffer.from(result.result.data, 'base64');
        };

        // GUI-01 (01-05): the same top-level-context listing the
        // evaluate/screenshot target above was selected from, exposed so a
        // caller asserting that a SECOND window opened can observe it -- and
        // the chrome window wrapping it is invisible on this platform
        // (WINDOWS.md 7), so the content context it owns is the only
        // observable.
        // GUI-02 (14.1-03): the raw BiDi command, for the few things the
        // named members above do not cover -- `input.performActions` in
        // particular, which is the only way to deliver a TRUSTED pointer
        // or key event into a page (a script-dispatched event is not user
        // interaction to session history, so nothing evaluated in the page
        // can stand in for a click). Returns the command's `result`.
        const send = async (method, params) => (await client.send(method, params)).result;

        return await callback({
            evaluate,
            evaluateIn,
            send,
            waitFor: (expr, opts) => waitFor(evaluate, expr, opts),
            screenshot,
            topLevelContexts,
            // Phase 31 plan 05: the browser's exit status (null while it runs), for the quit checks.
            exitCode: () => child.exitCode,
        });
    } finally {
        if (ws && client && ws.readyState === WebSocket.OPEN) {
            try {
                await Promise.race([client.send('session.end', {}), new Promise(r => setTimeout(r, 2000))]);
            } catch {
                // best-effort -- cleanup() below still kills the process regardless
            }
        }
        await cleanup();
    }
}

// --- --self-test (08-03, WINDOWS 14) --------------------------------------
//
// Live two-context session assertion plus single-context positive control.
// A URL argument opens a stock browser window alongside the shell, so this
// needs the built binary like every other live check -- and is deliberately
// NOT registered in verify-platform.sh, so --quick never pays for a browser
// launch. Needs no network and no Theia backend: the probe URL is a fragment
// (same rationale as verify-gui01-window.mjs's PROBE_URL) and neither case
// waits for the frontend.
const SELF_TEST_PROBE_URL = 'about:blank#firefox-bidi-self-test';

async function runSelfTest() {
    const failures = [];
    const fail = message => {
        failures.push(message);
        console.error(`firefox-bidi: --self-test FAIL -- ${message}`);
    };

    // Case 1: two-context session. evaluate and screenshot must run against
    // the URL-bearing context, not the shell context.
    try {
        await withFirefoxPage(SELF_TEST_PROBE_URL, async ({ evaluate, screenshot, topLevelContexts }) => {
            const deadline = Date.now() + 15000;
            let seen = [];
            for (;;) {
                seen = await topLevelContexts();
                if (seen.length >= 2 && seen.some(c => c.url === SELF_TEST_PROBE_URL)) break;
                if (Date.now() >= deadline) break;
                await new Promise(r => setTimeout(r, 250));
            }
            if (seen.length < 2 || !seen.some(c => c.url === SELF_TEST_PROBE_URL)) {
                fail(
                    `expected a two-context session carrying ${SELF_TEST_PROBE_URL}, saw `
                    + `${seen.length}: ${JSON.stringify(seen.map(c => c.url))}`
                );
                return;
            }
            const href = await evaluate('location.href');
            if (href !== SELF_TEST_PROBE_URL) {
                fail(
                    `evaluate ran against ${JSON.stringify(href)}, expected the URL-bearing context `
                    + JSON.stringify(SELF_TEST_PROBE_URL)
                );
                return;
            }
            const png = await screenshot();
            if (!Buffer.isBuffer(png) || png.length === 0) {
                fail('screenshot did not return a non-empty Buffer from the URL-bearing context');
                return;
            }
            console.log(
                `firefox-bidi: --self-test PASS -- two-context session targets the URL-bearing context `
                + `(${seen.length} contexts, evaluate + screenshot)`
            );
        });
    } catch (err) {
        fail(`two-context session threw: ${err.message}`);
    }

    // Case 2: single-context positive control. No URL argument means the
    // shell alone; the first (only) context must still resolve.
    try {
        await withFirefoxPage('', async ({ evaluate, topLevelContexts }) => {
            const seen = await topLevelContexts();
            if (seen.length !== 1) {
                fail(
                    `expected a single-context session on a bare launch, saw `
                    + `${seen.length}: ${JSON.stringify(seen.map(c => c.url))}`
                );
                return;
            }
            const href = await evaluate('location.href');
            if (typeof href !== 'string' || href === '') {
                fail(`evaluate on the single context returned ${JSON.stringify(href)}`);
                return;
            }
            console.log('firefox-bidi: --self-test PASS -- single-context positive control resolves');
        });
    } catch (err) {
        fail(`single-context session threw: ${err.message}`);
    }

    // Case 3 (14.1-03): evaluateIn targets the context it is handed, and
    // ONLY that one. A helper that silently evaluated in the wrong context
    // would make every geometry assertion built on it meaningless, so both
    // halves are proven: the named context answers exactly as `evaluate`
    // does, and an unknown id rejects instead of evaluating anywhere.
    try {
        await withFirefoxPage('', async ({ evaluate, evaluateIn, topLevelContexts }) => {
            const seen = await topLevelContexts();
            if (seen.length === 0) {
                fail('evaluateIn case saw zero top-level contexts on a bare launch');
                return;
            }
            const viaIn = await evaluateIn(seen[0].context, 'location.href');
            const viaEvaluate = await evaluate('location.href');
            if (typeof viaIn !== 'string' || viaIn === '' || viaIn !== viaEvaluate) {
                fail(
                    `evaluateIn(${seen[0].context}) returned ${JSON.stringify(viaIn)}, `
                    + `expected the non-empty href evaluate returns: ${JSON.stringify(viaEvaluate)}`
                );
                return;
            }
            let rejected = false;
            try {
                await evaluateIn('no-such-context', '1');
            } catch {
                rejected = true;
            }
            if (!rejected) {
                fail('evaluateIn(\'no-such-context\') resolved instead of rejecting -- it evaluated somewhere');
                return;
            }
            console.log('firefox-bidi: --self-test PASS -- evaluateIn reads the named context and rejects an unknown one');
        });
    } catch (err) {
        fail(`evaluateIn session threw: ${err.message}`);
    }

    // Case 4 (14.1-03): `send` is the raw command and returns its `result`
    // -- proven on a command whose answer the same session can cross-check
    // (`browsingContext.getTree` against `topLevelContexts`), and an
    // unknown method must reject rather than resolve to nothing.
    try {
        await withFirefoxPage('', async ({ send, topLevelContexts }) => {
            const tree = await send('browsingContext.getTree', {});
            const seen = await topLevelContexts();
            const ids = (tree && tree.contexts ? tree.contexts : []).map(c => c.context);
            if (ids.length === 0 || ids.length !== seen.length || !seen.every(c => ids.includes(c.context))) {
                fail(`send('browsingContext.getTree') returned contexts ${JSON.stringify(ids)}, topLevelContexts saw ${JSON.stringify(seen.map(c => c.context))}`);
                return;
            }
            let rejected = false;
            try {
                await send('no.suchCommand', {});
            } catch {
                rejected = true;
            }
            if (!rejected) {
                fail('send(\'no.suchCommand\') resolved instead of rejecting');
                return;
            }
            console.log('firefox-bidi: --self-test PASS -- send returns the raw result and rejects an unknown command');
        });
    } catch (err) {
        fail(`send session threw: ${err.message}`);
    }

    if (failures.length !== 0) {
        process.exitCode = 1;
        return;
    }
    console.log('firefox-bidi: --self-test PASS -- 4 cases');
}

// Import guard: importing this module (six live scripts reuse withFirefoxPage
// and friends) must not run the self-test or exit the importer. An
// importer's own flags are not this file's (scripts/generate.mjs:153-156
// documents the prohibition); only a direct invocation honours --self-test,
// following the verify-mar-update-hop.mjs INVOKED_DIRECTLY pattern.
const INVOKED_DIRECTLY = (() => {
    try {
        return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
})();
if (INVOKED_DIRECTLY && process.argv.slice(2).includes('--self-test')) {
    await runSelfTest();
    process.exit(process.exitCode || 0);
}
