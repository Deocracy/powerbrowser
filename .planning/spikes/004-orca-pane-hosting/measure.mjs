#!/usr/bin/env node
// Spike 004 (TAB-03): the live harness. Starts the lane's own orcad (loopback, port 0) on
// PowerBrowser's Node, registers a throwaway repo, and hosts the PB-added pane
// (build-pb-entry.sh) one of four ways:
//   --route standalone   the pane page in a plain stock window (no Theia hosting)
//   --route a            same document: a Theia ReactWidget, Theia's React (page-routes.mjs)
//   --route b            an iframe of the pane page in a Lumino widget
//   --route b-prime      one PB web tab per pane page (spike 003 machinery)
//   --measure mount|observe|ws|css|memory|all
// Writes results-<route>.json beside this file. Last line: measure: PASS -- ... or
// measure: FAIL -- <sub-check>; exit 1 on FAIL, 2 on a bad argument.
//
// Run headless under the live lock, with the coordinating workspace's browser:
//   PB_FIREFOX_BIN=<objdir>/dist/bin/powerbrowser flock /home/chris/coding/Power-Browser/.git/pb-live.lock \
//     node .planning/spikes/004-orca-pane-hosting/measure.mjs --route standalone --measure mount
//
// The pairing offer is a bearer credential. It lives in memory only: every write to stdout and
// stderr passes installOutputRedaction, and no results field holds a URL with a fragment.
// Node built-ins plus the repo harness only (CONVENTIONS).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withFirefoxPage } from '../../../scripts/lib/firefox-bidi.mjs';
import {
    REPO_ROOT, ensurePbNode, installOutputRedaction, orcaVersionFromPins, orcadEnv, redact, startOrcad, stopOrcad,
} from '../../../scripts/lib/orca-run.mjs';
import { pollFor } from '../../../scripts/lib/pb-live-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTES = ['standalone', 'a', 'b', 'b-prime'];
const MEASURES = ['mount', 'observe', 'ws', 'css', 'memory', 'all'];
const ORCA_DIR = join(REPO_ROOT, 'orca');
const WORK_DIR = join(REPO_ROOT, '.mozbuild', 'p61-01');
// orcad's Unix socket sits in the profile directory and must stay under the 108-byte sun_path
// limit (60-EXT01-RECORD note 1), so orcad and the CLI reach the profile through a short alias.
const PROFILE_REAL = join(WORK_DIR, 'powerbrowser-orca');
const PROFILE_ALIAS = join(homedir(), '.cache', 'pb-p61-01-orca');
const REPO_DIR = join(WORK_DIR, 'repo');

function parseArgs(argv) {
    const out = { route: null, measure: null };
    for (let i = 0; i < argv.length; i += 2) {
        const [flag, value] = [argv[i], argv[i + 1]];
        if (flag === '--route' && ROUTES.includes(value)) out.route = value;
        else if (flag === '--measure' && MEASURES.includes(value)) out.measure = value;
        else return null;
    }
    return out.route && out.measure ? out : null;
}

const args = parseArgs(process.argv.slice(2));
if (!args) {
    console.error(`usage: measure.mjs --route ${ROUTES.join('|')} --measure ${MEASURES.join('|')}`);
    process.exit(2);
}

// Before any orcad output exists. Replaced by a secret-aware filter once the ready line parses.
let restoreOutput = installOutputRedaction([]);

// This tree is worked on from inside Orca desktop: its ORCA_* variables must reach neither the
// browser this run launches nor (through orcadEnv) orcad and the CLI.
for (const name of Object.keys(process.env)) {
    if (name.startsWith('ORCA_') || ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_REPL_EXTERNAL_MODULE'].includes(name)) {
        delete process.env[name];
    }
}

const COMMAND = `PB_FIREFOX_BIN=${process.env.PB_FIREFOX_BIN ?? '(unset)'} flock /home/chris/coding/Power-Browser/.git/pb-live.lock `
    + `node ${relative(REPO_ROOT, fileURLToPath(import.meta.url))} --route ${args.route} --measure ${args.measure}`;

class SubCheckFailure extends Error {
    constructor(subCheck, detail) {
        super(`${subCheck}: ${detail}`);
        this.subCheck = subCheck;
    }
}
const failIf = (condition, subCheck, detail) => { if (condition) throw new SubCheckFailure(subCheck, detail); };

function git(cwd, ...argv) {
    const r = spawnSync('git', argv, { cwd, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${argv[0]} failed: ${r.stderr.trim().split('\n').pop()}`);
    return r.stdout.trim();
}

/** A throwaway git repo with one commit; the terminal's worktree. Recreated every run. */
function makeRepo() {
    rmSync(REPO_DIR, { recursive: true, force: true });
    mkdirSync(REPO_DIR, { recursive: true });
    git(REPO_DIR, 'init', '-q', '-b', 'main');
    writeFileSync(join(REPO_DIR, 'README.md'), 'spike 004 throwaway repo\n');
    git(REPO_DIR, 'add', 'README.md');
    git(REPO_DIR, '-c', 'user.name=pb-spike', '-c', 'user.email=pb-spike@invalid', 'commit', '-q', '-m', 'spike 004 throwaway');
}

/** A fresh orcad profile behind the short alias. */
function makeProfile() {
    rmSync(PROFILE_REAL, { recursive: true, force: true });
    mkdirSync(PROFILE_REAL, { recursive: true });
    mkdirSync(dirname(PROFILE_ALIAS), { recursive: true });
    let linked = false;
    try { linked = lstatSync(PROFILE_ALIAS).isSymbolicLink(); } catch { /* absent */ }
    if (linked) rmSync(PROFILE_ALIAS);
    symlinkSync(PROFILE_REAL, PROFILE_ALIAS);
}

/**
 * orcad up and a throwaway repo registered through the built Orca CLI. The first terminal is
 * created by the hosting client itself (pb-pane-mount.tsx waitForTerminal): a terminal the CLI
 * creates with no client attached is a background handle and never becomes a tab.
 * Returns the handles a route needs; `stack.paneUrl(query)` carries the pairing fragment and
 * must never be logged or stored.
 */
async function startStack() {
    for (const rel of ['out/orcad/orcad.js', 'out/web/assets/pb/pb-pane.html', 'out/web/assets/pb-lib/pb-pane-lib.js', 'out/cli/index.js']) {
        failIf(!existsSync(join(ORCA_DIR, rel)), 'setup', `orca/${rel} is missing (run scripts/build-orca.sh, the CLI build and build-pb-entry.sh)`);
    }
    const node = await ensurePbNode();
    makeProfile();
    makeRepo();
    const orcaVersion = orcaVersionFromPins();
    const env = orcadEnv(process.env, { profileDir: PROFILE_ALIAS, orcaVersion });
    const { child, ready } = await startOrcad({ nodeBin: node.path, orcaDir: ORCA_DIR, profileDir: PROFILE_ALIAS, env });
    restoreOutput();
    restoreOutput = installOutputRedaction(ready.secrets);
    const stack = { node, child, ready, env, orcaVersion };
    try {
        // T-61-02: loopback only.
        failIf(!/^ws:\/\/127\.0\.0\.1:\d+(\/|$)/.test(ready.boundEndpoint ?? ''), 'loopback', 'the ready line does not name a ws://127.0.0.1 endpoint');
        failIf(!ready.webClientUrl, 'pairing', 'the ready line offers no web-client pairing URL');
        const client = new URL(ready.webClientUrl);
        failIf(client.hostname !== '127.0.0.1', 'loopback', 'the web client URL is not on 127.0.0.1');
        stack.origin = client.origin;
        const fragment = client.hash;
        const base = `${client.origin}${client.pathname.replace(/[^/]*$/, 'assets/pb/pb-pane.html')}`;
        stack.paneBase = base;
        stack.fragment = fragment;
        stack.pairingInput = decodeURIComponent(fragment.replace(/^#/, '').replace(/^pairing=/, ''));
        stack.paneUrl = (query = {}) => {
            const search = new URLSearchParams(query).toString();
            return `${base}${search ? `?${search}` : ''}${fragment}`;
        };
        stack.libUrl = file => `${client.origin}${client.pathname.replace(/[^/]*$/, `assets/pb-lib/${file}`)}`;
        stack.cli = (...argv) => {
            const r = spawnSync(node.path, [join(ORCA_DIR, 'out', 'cli', 'index.js'), ...argv, '--json'],
                { cwd: REPO_DIR, env, encoding: 'utf8', timeout: 60000 });
            const text = redact(`${r.stdout ?? ''}`, ready.secrets);
            if (r.status !== 0) {
                throw new Error(`orca ${argv.slice(0, 2).join(' ')} exited ${r.status}: ${redact(`${r.stderr ?? ''}`, ready.secrets).trim().split('\n').pop() || text.slice(0, 300)}`);
            }
            try { return JSON.parse(text); } catch { return { raw: text.slice(0, 500) }; }
        };
        stack.repo = stack.cli('repo', 'add', '--path', REPO_DIR);
        stack.marker = `pb61-${Date.now().toString(36)}`;
        return stack;
    } catch (error) {
        await stopStack(stack);
        throw error;
    }
}

async function stopStack(stack) {
    const { survivors } = await stopOrcad(stack.child, stack.ready?.daemonPid ?? null);
    return survivors;
}

/** Page-realm read of the pane: mount state, xterm count and the rendered rows' text. */
export const READ_PANE = `JSON.stringify((() => {
    const rows = [...document.querySelectorAll('.xterm-rows, .xterm-accessibility-tree')].map(e => e.innerText || e.textContent || '').join('\\n');
    let support = null;
    try { support = window.PbPane ? window.PbPane.deviceKeySupport() : null; } catch (e) { support = 'threw: ' + e; }
    return { href: location.origin + location.pathname, title: document.title, text: (document.body ? document.body.innerText : '').slice(0, 300),
        scripts: [...document.scripts].map(s => s.src.split('/').pop()), resources: performance.getEntriesByType('resource').length,
        state: window.__pbPaneState || null, errors: (window.__pbErrors || []).slice(0, 6),
        pane: [...document.querySelectorAll('[data-pb-pane-root]')].map(e => ({ state: e.getAttribute('data-pb-pane-state'), html: e.innerHTML.length, w: e.clientWidth, h: e.clientHeight, head: e.innerHTML.slice(0, 400) })), xterms: document.querySelectorAll('.xterm').length, rows: rows.slice(-4000),
        secure: window.isSecureContext, support, react: window.PbPane ? window.PbPane.reactVersion : null };
})())`;

/** How often the marker shows in the rows: 2 once the shell has echoed the typed command and run it. */
export const markerCount = (rows, marker) => rows.split(marker).length - 1;

/**
 * Types `echo <marker>` into the workspace's terminal from OUTSIDE the hosting document, through
 * the Orca CLI. The pane showing it twice proves live PTY output reaches the pane over orcad's
 * WebSocket, which a rendered-but-dead xterm would not.
 */
export function sendMarker(stack) {
    const listed = JSON.stringify(stack.cli('terminal', 'list', '--worktree', `path:${REPO_DIR}`));
    const handle = /"(term_[A-Za-z0-9-]+)"/.exec(listed)?.[1];
    if (!handle) throw new Error(`orca terminal list names no terminal handle: ${listed.slice(0, 200)}`);
    stack.cli('terminal', 'send', '--terminal', handle, '--text', `echo ${stack.marker}`, '--enter');
    return handle;
}

async function routeStandalone(stack, result) {
    // The page is launched without the fragment (a command line is visible to other processes),
    // then given it over the BiDi socket and reloaded.
    await withFirefoxPage(stack.paneBase, async ({ evaluate }) => {
        await evaluate(`location.replace(${JSON.stringify(stack.paneUrl({ create: '1' }))}); true`);
        let last = null;
        const started = Date.now();
        try {
            await pollFor(async () => {
                last = JSON.parse(await evaluate(READ_PANE));
                return last.state?.stage === 'failed' || (last.xterms > 0 && last.rows.trim().length > 0);
            }, 60000, 'the pane to render a terminal with text');
            if (last.state?.stage !== 'failed') sendMarker(stack);
            await pollFor(async () => {
                last = JSON.parse(await evaluate(READ_PANE));
                return last.state?.stage === 'failed' || markerCount(last.rows, stack.marker) >= 2;
            }, 30000, 'the pane to show the marker the CLI typed');
        } catch (error) {
            result.mountError = error.message;
        }
        if (process.env.PB61_DEBUG === '1') console.log(`debug: ${JSON.stringify({ ...last, rows: (last?.rows ?? '').slice(-300) })}`);
        result.mounted = last?.state?.stage === 'mounted';
        result.mountStage = last?.state?.stage ?? null;
        if (last?.state?.error) result.mountError = String(last.state.error).slice(0, 400);
        result.xterms = last?.xterms ?? 0;
        result.markerCount = last ? markerCount(last.rows, stack.marker) : 0;
        // The prompt line: the row that carries the typed command has text before it.
        const typed = (last?.rows ?? '').split('\n').find(line => line.includes(`echo ${stack.marker}`)) ?? '';
        result.promptChars = typed.indexOf('echo ');
        result.promptSeen = result.mounted && result.markerCount >= 2 && result.promptChars > 0;
        result.msToPrompt = Date.now() - started;
        result.isSecureContext = last?.secure ?? null;
        result.deviceKeySupport = last?.support ?? null;
        result.reactVersion = last?.react ?? null;
        result.ws = result.promptSeen ? 'works' : 'fails';
    });
    failIf(!result.promptSeen, 'mount', `no shell prompt in the pane's xterm rows (stage ${result.mountStage}, xterms ${result.xterms}, marker count ${result.markerCount}${result.mountError ? `, ${result.mountError}` : ''})`);
}

const startedAt = new Date().toISOString();
const result = { route: args.route, measure: args.measure, command: COMMAND, startedAt };
let failure = null;
let stack = null;
try {
    stack = await startStack();
    result.orcaVersion = stack.orcaVersion;
    result.nodeVersion = stack.node.version;
    result.orcadNodeVersion = stack.ready.nodeVersion;
    result.orcadEndpoint = stack.ready.boundEndpoint.replace(/:\d+/, ':<port>');
    if (args.route === 'standalone') {
        await routeStandalone(stack, result);
    } else {
        const { runRoute } = await import('./page-routes.mjs');
        await runRoute(stack, args, result, { failIf, READ_PANE, markerCount, sendMarker, REPO_DIR });
    }
} catch (error) {
    failure = error instanceof SubCheckFailure ? error.message : `harness: ${error.message}`;
} finally {
    if (stack) {
        const survivors = await stopStack(stack);
        result.orcadSurvivors = survivors.length;
        if (survivors.length && !failure) failure = `reap: ${survivors.length} orcad process(es) survived`;
    }
}
result.finishedAt = new Date().toISOString();
result.verdict = failure ? 'FAIL' : 'PASS';
if (failure) result.failure = redact(failure, stack?.ready?.secrets ?? []);
const file = join(HERE, `results-${args.route === 'standalone' ? 'standalone' : `route-${args.route}`}.json`);
// A run of one measure keeps the other measures' numbers already in the file.
let previous = {};
if (args.route !== 'standalone' && args.measure !== 'all' && existsSync(file)) {
    try { previous = JSON.parse(readFileSync(file, 'utf8')); } catch { /* rewritten below */ }
}
const text = redact(JSON.stringify({ ...previous, ...result }, null, 2), stack?.ready?.secrets ?? []);
failIfSecret(text);
writeFileSync(file, `${text}\n`);
console.log(failure ? `measure: FAIL -- ${failure}` : `measure: PASS -- route ${args.route}, measure ${args.measure}, ${relative(REPO_ROOT, file)}`);
restoreOutput();
process.exit(failure ? 1 : 0);

/** T-61-01: a results file with a fragment, a pairing code or a device token is never written. */
function failIfSecret(body) {
    if (/#pairing=|orca:\/\/pair|deviceToken"?\s*[:=]\s*"?[A-Za-z0-9_-]{16,}/.test(body)) {
        console.log('measure: FAIL -- redaction: the results body still carries a pairing credential; nothing written');
        process.exit(1);
    }
}
