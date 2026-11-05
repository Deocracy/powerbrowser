// scripts/lib/ng-a-live.mjs
//
// Wave A's live harness (non-GUI build). Launches the built browser on a
// profile the check keeps -- withFirefoxPage's `profileDir` (R3, f4818a0) -- so
// it can quit and relaunch on the same profile; waits for the Theia frontend;
// and installs `window.__ngA`: helpers that reach the frontend's own DI-bound
// services (opener, GroupModel, GroupActorClient, the group reader, the shell,
// commands). Checks drive behaviour only through those (G6) and read
// tabs.sqlite from outside. A launch a relaunch follows ends through the app's
// own quit (quitApp, withShellQuit). withFirefoxPage's SIGTERM is only the
// last resort after a failed quit, or the end of a single-launch check: on
// GTK it stops the event loop (nsAppShell::TermSignalHandler) and the process
// is gone in about 0.1 s without running profile-before-change.

import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withFirefoxPage } from './firefox-bidi.mjs';
import { readStore } from './tab-store-fixtures.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Polls `probe` until it returns something truthy or `ms` passes; resolves
 * that value or undefined. A probe that throws counts as "not yet": this is
 * the one place a read error is tolerated (a read can race the browser's
 * write). Every other read throws, so runCheck reports it as `harness:`.
 */
export async function waitUntil(probe, ms = 20000, stepMs = 250) {
    const end = Date.now() + ms;
    for (;;) {
        let value;
        try {
            value = await probe();
        } catch {
            value = undefined;
        }
        if (value) {
            return value;
        }
        if (Date.now() >= end) {
            return undefined;
        }
        await sleep(stepMs);
    }
}

/**
 * Review Focus: a live check never runs on a checkout carrying uncommitted
 * work. Tracked changes only: the kit's own runs leave an untracked
 * scripts/__pycache__/ behind, which tests nothing.
 */
export function assertCleanTree() {
    if (process.env.PB_NG_ALLOW_DIRTY === '1') {
        return;
    }
    const status = spawnSync('git', ['-C', REPO_ROOT, 'status', '--short', '--untracked-files=no'], { encoding: 'utf8' }).stdout.trim();
    if (status) {
        throw new Error(`uncommitted changes in ${REPO_ROOT}; a live run would test code that is not committed:\n${status}`);
    }
}

const profiles = [];
const privatePaths = new Set();
let signalsHooked = false;
/** withShell launches whose browser may still be running. */
let launches = 0;

/** rmSync with retries: a directory the browser was still writing into can throw ENOTEMPTY once. */
const removeTree = path => rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

function removePrivateData() {
    privatePaths.forEach(removeTree);
    privatePaths.clear();
}

/**
 * SIGINT/SIGTERM once private data is on disk. With no browser running the
 * profiles go now and the process exits. During a launch the browser may
 * still be writing into its profile, so deleting it here races the browser:
 * firefox-bidi's own SIGINT handler kills the browser and unwinds the launch
 * (its CR-03 note), and runCheck's finally then removes the profiles after
 * the browser is dead. SIGTERM takes the same route. Never throws: a crash
 * here would orphan the browser and leave part of the copy behind.
 */
function onSignal(signal, code) {
    if (launches > 0) {
        if (signal === 'SIGTERM') {
            try {
                process.emit('SIGINT', 'SIGINT');
            } catch (error) {
                console.error(`ng-a-live: handing SIGTERM to the launch failed: ${error && error.message ? error.message : error}`);
            }
        }
        // After firefox-bidi's handler (which sets 130), so a SIGTERM keeps 143.
        process.exitCode = code;
        return;
    }
    process.exitCode = code;
    try {
        removeProfiles();
    } catch (error) {
        console.error(`ng-a-live: removing the profiles on ${signal} failed: ${error && error.message ? error.message : error}`);
    }
    process.exit(code);
}

/**
 * Marks `path` as holding a copy of real browsing data (decisions.md R7). It
 * is removed on every exit a check controls -- removeProfiles (runCheck's
 * finally), SIGINT and SIGTERM -- and PB_NG_KEEP_PROFILES never keeps it.
 */
export function holdsPrivateData(path) {
    if (!signalsHooked) {
        signalsHooked = true;
        process.on('SIGINT', () => onSignal('SIGINT', 130));
        process.on('SIGTERM', () => onSignal('SIGTERM', 143));
    }
    privatePaths.add(path);
    return path;
}

/**
 * A fresh profile (space-free, outside the repo) with the prefs every wave A
 * live check needs: sessionstore writes every second, so the store's sweep
 * runs within a check's budget; the last session restores at launch with every
 * tab loaded at once, so a restart check sees restored tabs as contexts.
 * withFirefoxPage appends its own overrides to this user.js (R3).
 */
export function newProfile(name, extraPrefs = {}) {
    const dir = mkdtempSync(join(tmpdir(), `pb-ng-a-${name}-`));
    const prefs = {
        'browser.sessionstore.interval': 1000,
        'browser.startup.page': 3,
        'browser.sessionstore.restore_on_demand': false,
        'browser.sessionstore.max_resumed_crashes': 999,
        ...extraPrefs,
    };
    writeFileSync(join(dir, 'user.js'), Object.entries(prefs)
        .map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join('\n') + '\n');
    profiles.push(dir);
    return dir;
}

export function removeProfiles() {
    const kept = profiles.splice(0).filter(dir => !privatePaths.has(dir));
    removePrivateData();
    if (process.env.PB_NG_KEEP_PROFILES === '1') {
        console.log(`kept profiles: ${kept.join(' ')}`);
        return;
    }
    kept.forEach(removeTree);
}

/** Pages the overlays load: every path links to /b; /hang accepts and never answers. */
export async function servePages() {
    const hung = [];
    const server = createServer((req, res) => {
        if (req.url.startsWith('/hang')) {
            hung.push(res);
            return;
        }
        const name = req.url.replace(/[^A-Za-z0-9]/g, '') || 'root';
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><title>page ${name}</title><body style="background:#3a6"><a id="next" href="/b">next</a></body>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    return {
        url: path => `http://127.0.0.1:${port}${path}`,
        close: () => {
            hung.forEach(res => res.destroy());
            server.close();
        },
    };
}

/** The store's tab rows. A read error throws: an unreadable store is never "no rows". */
export function tabsOf(profile) {
    return readStore(join(profile, 'tabs.sqlite')).tabs;
}

export const show = rows => JSON.stringify(rows.map(r => ({ uri: r.uri, url: r.url, group_id: r.group_id, closed_at: r.closed_at })));

// Page-realm helpers. No template literals inside: this whole string is one.
const PAGE_HELPERS = `
window.__ngA = window.__ngA || (function () {
    var container = window.theia.container;
    function get(name) {
        var found;
        container._bindingDictionary.traverse(function (key) {
            if (found) return;
            var keyStr = typeof key === 'symbol' ? key.toString() : (key && key.name) || String(key);
            if (keyStr === 'Symbol(' + name + ')' || keyStr === name) found = key;
        });
        if (!found) throw new Error('DI binding not found: ' + name);
        return container.get(found);
    }
    var A = {
        get: get,
        sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
        shell: function () { return get('ApplicationShell'); },
        registry: function () { return get('TabUriRegistry'); },
        model: function () { return get('GroupModel'); },
        actor: function () { return get('GroupActorClient'); },
        reader: function () { return get('GroupQueryService'); },
        ready: function () {
            try { return get('FrontendApplicationStateService').state === 'ready'; } catch (e) { return false; }
        },
        uri: function (text) {
            var shell = A.shell();
            var areas = ['left', 'right', 'bottom', 'main'];
            for (var i = 0; i < areas.length; i++) {
                var widgets = shell.getWidgets(areas[i]);
                for (var j = 0; j < widgets.length; j++) {
                    var address = A.registry().uriOf(widgets[j]);
                    if (address) return new address.constructor(text);
                }
            }
            throw new Error('no addressable widget to take the URI class from');
        },
        open: async function (text, options) {
            var target = A.uri(text);
            var opener = await get('OpenerService').getOpener(target, options);
            return opener.open(target, options);
        },
        mutate: async function (msg) {
            try { return { ok: true, reply: await A.actor().mutate(msg) }; }
            catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
        },
        outcome: async function (call) {
            try { return { resolved: true, value: await call() }; }
            catch (e) { return { resolved: false, message: String((e && e.message) || e) }; }
        },
        mainWidgets: function () { return Array.from(A.shell().mainPanel.widgets()); },
        webTabs: function () {
            return A.mainWidgets().filter(function (w) { return typeof w.tabId === 'string' && typeof w.url === 'string'; });
        },
        organising: async function () {
            await get('ModeService').activateMode('organising');
            var org;
            for (var i = 0; i < 100 && !org; i++) {
                org = A.shell().getWidgetById('powerbrowser.modes.organising');
                if (!org) await A.sleep(100);
            }
            if (!org) throw new Error('the Organising surface never attached');
            await org.initialize();
            return org;
        },
        cardKey: async function (widget) {
            var org = await A.organising();
            // The model's own key for the one main-panel widget with this id:
            // liveTabs() runs over a main panel narrowed to that widget, so no
            // list position can pair a card with the wrong widget.
            var panel = Object.create(org.shell.mainPanel, { widgets: { value: function () {
                return Array.from(org.shell.mainPanel.widgets()).filter(function (w) { return w.id === widget.id; });
            } } });
            var view = Object.create(org, { shell: { value: Object.create(org.shell, { mainPanel: { value: panel } }) } });
            var live = org.liveTabs.call(view);
            if (live.length !== 1) throw new Error('the Panorama model has ' + live.length + ' card(s) for widget ' + widget.id + ', want 1');
            return live[0].uri;
        },
        // PAN-04: Close Group opens an undo window and commits when it ends.
        // Both bounds are timeouts only, never an expected duration.
        closeGroupCommitted: async function (id) {
            var i;
            for (i = 0; i < 50 && !A.model().isClosing(id); i++) await A.sleep(100);
            if (!A.model().isClosing(id)) throw new Error('the Close Group undo window never opened');
            for (i = 0; i < 600 && A.model().isClosing(id); i++) await A.sleep(100);
            if (A.model().isClosing(id)) throw new Error('the Close Group undo window never ended');
            // isClosing turns false before the closeGroup write is sent; the
            // pending slot clears only after the write and the widget closes.
            for (i = 0; i < 600 && A.model().hasPendingWrite; i++) await A.sleep(100);
            if (A.model().hasPendingWrite) throw new Error('the Close Group commit never finished');
        },
    };
    return A;
})();
`;

/**
 * Launches the built browser on `profileDir` (kept after exit, R3), waits for
 * the Theia frontend, installs the page helpers, and calls
 * fn({ run, topLevelContexts, evaluateIn, send, ... }). `run(body)` evaluates
 * an async function body in the Theia frame with `A` bound to the helpers and
 * resolves its JSON result; a throw inside rejects naming the page error.
 * `stdoutPath` tees the browser's stdout (its dump() channel) to that file.
 */
export async function withShell(profileDir, fn, { url = '', stdoutPath } = {}) {
    launches += 1;
    try {
        return await launchShell(profileDir, fn, { url, stdoutPath });
    } finally {
        launches -= 1;
    }
}

async function launchShell(profileDir, fn, { url, stdoutPath }) {
    return withFirefoxPage(url, async page => {
        await page.waitFor('window.theia && window.theia.container ? true : false', { timeoutMs: 90000 });
        await page.evaluate(`${PAGE_HELPERS}; true`);
        await page.waitFor('window.__ngA.ready()', { timeoutMs: 90000 });
        const run = async body => {
            const text = await page.evaluate(`(async () => {
                const A = window.__ngA;
                try {
                    const out = await (async () => { ${body} })();
                    return JSON.stringify({ out: out === undefined ? null : out });
                } catch (error) {
                    // Gecko's Error.stack carries the frames only, never the message.
                    return JSON.stringify({ error: error && error.stack ? String(error) + '\\n' + error.stack : String(error) });
                }
            })()`);
            const parsed = JSON.parse(text);
            if (parsed.error) {
                throw new Error(`page: ${parsed.error}`);
            }
            return parsed.out;
        };
        return fn({ ...page, run });
    }, { profileDir, stdoutPath });
}

/** The same budget wave C gives a quit. */
export const QUIT_BUDGET_MS = 30000;

/** A launch that did not quit within its budget: runCheck prints it as the red line, not as `harness:`. */
class QuitFailure extends Error {}

/** /proc/<pid>/stat after the command name: [state, ppid, ...]. Throws once the process is gone. */
function statOf(pid) {
    const text = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return text.slice(text.lastIndexOf(')') + 2).split(' ');
}

/**
 * The browser running on `profile`: the process whose argv carries
 * `--profile <profile>` (on Linux, child processes get no profile argument).
 * A launch wrapper (NG-017's) carries the same argv, so the browser is the
 * match that no other match is the parent of.
 */
function browserPid(profile) {
    const matches = new Map();
    for (const pid of readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
        try {
            const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
            if (argv[argv.indexOf('--profile') + 1] === profile) {
                matches.set(Number(pid), Number(statOf(pid)[1]));
            }
        } catch {
            // It exited while being read.
        }
    }
    const parents = new Set(matches.values());
    const leaves = [...matches.keys()].filter(pid => !parents.has(pid));
    if (leaves.length !== 1) {
        throw new Error(`found ${leaves.length} browser process(es) on ${profile}, want 1`);
    }
    return leaves[0];
}

/** False once the process is gone, or a zombie waiting to be reaped. */
function running(pid) {
    try {
        return statOf(pid)[0] !== 'Z';
    } catch {
        return false;
    }
}

/**
 * The app's own quit: Services.startup.quit(eAttemptQuit) in the shell's
 * chrome window, then a wait for the browser process to exit. Resolves the ms
 * the quit took, or null when the process was still running after `budgetMs`
 * (withFirefoxPage's cleanup then SIGTERMs it, the last resort). Never
 * SIGTERM as the quit itself: on GTK that stops the event loop and skips
 * profile-before-change, and so the shutdown writes a relaunch relies on.
 */
export async function quitApp({ send, evaluateIn }, profile, budgetMs = QUIT_BUDGET_MS) {
    const pid = browserPid(profile);
    const tree = await send('browsingContext.getTree', { 'moz:scope': 'chrome' });
    const shell = tree.contexts.find(c => c.url.startsWith('chrome://powerbrowser/'));
    if (!shell) {
        throw new Error(`no shell chrome window to quit from: ${JSON.stringify(tree.contexts.map(c => c.url))}`);
    }
    const start = Date.now();
    // Deferred, so the evaluation answers before the quit starts.
    await evaluateIn(shell.context, 'setTimeout(() => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit), 0); true');
    return (await waitUntil(() => !running(pid), budgetMs, 100)) ? Date.now() - start : null;
}

/**
 * A launch that ends the way a user ends it: withShell runs `fn`, then
 * quitApp must finish within QUIT_BUDGET_MS. Every launch of a restart check
 * goes through here. A launch that does not quit in time ends the scenario
 * with "did not quit within 30 s" as its failure.
 */
export async function withShellQuit(profileDir, fn, options) {
    return withShell(profileDir, async page => {
        const out = await fn(page);
        if (await quitApp(page, profileDir) === null) {
            throw new QuitFailure(`the browser did not quit within ${QUIT_BUDGET_MS / 1000} s of the app's own quit (Services.startup.quit), so no relaunch can follow a real quit`);
        }
        return out;
    }, options);
}

/**
 * Entry for every live check file: one scenario, receiving { pages, expect,
 * failures }; exits 1 naming every failure, 0 with a PASS line.
 */
export async function runCheck(name, scenario) {
    const failures = [];
    const expect = (ok, message) => {
        if (!ok) {
            failures.push(message);
        }
    };
    assertCleanTree();
    const pages = await servePages();
    try {
        await scenario({ pages, expect, failures });
    } catch (error) {
        failures.push(error instanceof QuitFailure ? error.message : `harness: ${error && error.stack ? error.stack : error}`);
    } finally {
        pages.close();
        removeProfiles();
    }
    if (failures.length) {
        console.error(`${name}: FAIL`);
        failures.forEach(f => console.error(`  ${f}`));
        process.exit(1);
    }
    console.log(`${name}: PASS`);
}
