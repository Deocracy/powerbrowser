#!/usr/bin/env node
// scripts/verify-orca-browser-host-bundle.mjs
//
// The orca-browser-host-bundle gate (Phase 66, BRW-03; P66-02, P66-30, A3, A7, A9): the thin browser host that
// scripts/build-orca-browser-host.sh compiles with Orca's Vite into the pane bundle's served directory works end to
// end against a real orcad, from Node, as the Theia frontend will drive it (lane p66-02).
//
// Derived at check time, never hand-kept:
//  a. the served directory, from the outDir of orca-overlay/files/vite.pb-panes.config.ts;
//  b. the pairing offer, from the scratch orcad's own ready line, held in memory only.
//
// Attach clause (default mode): a scratch orcad (scripts/lib/orca-run.mjs startOrcad) in a mkdtemp profile on a
// free loopback port; output redaction is installed before orcad starts and re-installed with the offer's secrets
// before anything else prints. The built pb-browser-host.js is imported in Node and attached with the offer's token
// credential. Through the Orca CLI, with an environment built from scratch (never this session's ORCA_*): a scratch
// repository is added, `tab create` must arrive as exactly one createPage event within 1 s of the CLI's exit and its
// completed result must be acked; a CLI `goto` for that page must arrive as one automation command whose completed
// answer reaches the CLI as success; userClosedPage (browser.tabClose on the host's connection) must answer
// { closed: true }, the following closePage is answered completed and acked, and `tab list` no longer lists the
// page. Every judgment is an exported pure verdict function. Results carry codes and booleans only.
//
// Tier: full (needs the Orca build, the Orca CLI and a free port; run under the live lock:
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-browser-host-bundle).
// SKIP (exit 0, one named line) when orca/ has no pb-browser-host.js, no built orcad or no built CLI.
//
// Usage:
//   node scripts/verify-orca-browser-host-bundle.mjs
//
// Limit: the probe is Node, not the Theia document; the document-side wiring (the link global, the placement
// override, the renderer path) is 66-02's and 66-05's live rows.

import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    REPO_ROOT as LIB_ROOT, ensurePbNode, installOutputRedaction, orcaVersionFromPins, orcadEnv, redact, startOrcad, stopOrcad,
} from './lib/orca-run.mjs';

const NAME = 'orca-browser-host-bundle';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORCA_DIR = join(REPO_ROOT, 'orca');
const PANES_CONFIG = join(REPO_ROOT, 'orca-overlay', 'files', 'vite.pb-panes.config.ts');
const BUNDLE_NAME = 'pb-browser-host.js';
const PROBE_TITLE = 'PB host probe';
const PROBE_URL = 'http://127.0.0.1:9/pb-host-probe';

// ---------------------------------------------------------------- derivation (pure)

/** The pane bundle's default outDir, relative to orca/, from the pane config's source text; null when absent. */
export function paneOutDirOf(configText) {
    const m = String(configText).match(/outDir:\s*resolve\(process\.env\.PB_PANES_OUT\s*\|\|\s*'([^']+)'\)/);
    return m ? m[1] : null;
}

/** The offer fields of a pairing input (orca://pair?code=..., or the bare code). Throws a reason word only. */
export function offerOf(pairingInput) {
    let code = String(pairingInput ?? '').trim();
    if (code.toLowerCase().startsWith('orca://')) {
        const u = new URL(code);
        code = u.searchParams.get('code') ?? u.hash.slice(1);
    }
    let offer;
    try { offer = JSON.parse(Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { throw new Error('offer unreadable'); }
    if (typeof offer?.endpoint !== 'string' || typeof offer?.deviceToken !== 'string' || typeof offer?.publicKeyB64 !== 'string') throw new Error('offer lacks endpoint, token or key');
    return { endpoint: offer.endpoint, deviceToken: offer.deviceToken, publicKeyB64: offer.publicKeyB64 };
}

// ---------------------------------------------------------------- verdicts (pure)

/** Red reasons for one attach run's observations (codes, counts and booleans only). */
export function attachVerdict(o) {
    const fails = [];
    if (o.attach !== 'accepted') return [`attach not accepted: ${o.attach ?? 'no outcome'}`];
    if (!o.cliTabCreateOk) fails.push('CLI tab create failed or returned no browserPageId');
    if (o.createPageCount !== 1) fails.push(`expected exactly one createPage event, saw ${o.createPageCount}`);
    else if (!(o.createPageAfterCliMs <= 1000)) fails.push(`createPage arrived ${o.createPageAfterCliMs} ms after the CLI exited (limit 1000)`);
    if (o.createPageAck !== true) fails.push('the createPage completed result was not acked');
    if (o.gotoEventCount !== 1) fails.push(`expected one browser.goto command event, saw ${o.gotoEventCount}`);
    if (o.gotoAck !== true) fails.push('the browser.goto completed result was not acked');
    if (!o.cliGotoOk || o.cliGotoTitleMatches !== true) fails.push('the CLI goto did not report the host\'s completed answer');
    if (o.userCloseClosed !== true) fails.push('userClosedPage (browser.tabClose) did not answer { closed: true }');
    if (o.closePageCount !== 1 || o.closePageAck !== true) fails.push(`the closePage after the user close was not answered and acked (events ${o.closePageCount})`);
    if (!o.tabListOk) fails.push('CLI tab list failed after the user close');
    else if (o.stillListed !== false) fails.push('tab list still lists the page after the user close');
    return fails;
}

/** Occurrences of any secret (the offer, its code, token, key, endpoint) in the given output text. */
export function redactionMatches(text, secrets) {
    let n = 0;
    for (const s of secrets) if (s && s.length >= 8) n += String(text).split(s).length - 1;
    return n;
}

// ---------------------------------------------------------------- attach clause (live, Node)

const payload = (json) => json?.result ?? json;

function cli(nodeBin, env, cwd, secrets, args) {
    const started = Date.now();
    return new Promise((resolveP) => {
        execFile(nodeBin, [join(ORCA_DIR, 'out', 'cli', 'index.js'), ...args, '--json'], { env, cwd, encoding: 'utf8', timeout: 90000 }, (error, stdout, stderr) => {
            let json = null;
            try { json = JSON.parse(stdout); } catch { /* reported as not ok */ }
            resolveP({ ok: !error && json !== null && json.ok !== false, json, code: json?.error?.code ?? null, text: redact(`${stdout}${stderr}`, secrets).trim().slice(0, 300), started, ended: Date.now() });
        });
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(pred, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (pred()) return true; await sleep(20); }
    return pred();
}

/** A profile path short enough for orcad's Unix socket (sun_path). */
function scratchDir() {
    const base = tmpdir().length > 40 ? '/tmp' : tmpdir();
    return mkdtempSync(join(base, 'pb-hb-'));
}

async function attachClause(bundlePath, notes) {
    const obs = { attach: null };
    let restore = installOutputRedaction([]);
    const work = scratchDir();
    const profile = join(work, 'p');
    const repo = join(work, 'repo');
    mkdirSync(profile, { recursive: true });
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, 'README.md'), 'orca-browser-host-bundle scratch repository\n');
    const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', ...a], { stdio: 'ignore' });
    git('init', '-q', '-b', 'main');
    git('add', '.');
    git('commit', '-q', '-m', 'scratch');

    const node = await ensurePbNode(LIB_ROOT);
    const orcaVersion = orcaVersionFromPins(LIB_ROOT);
    const env = orcadEnv(process.env, { profileDir: profile, orcaVersion });
    // The CLI's environment from scratch: PATH and HOME only, plus Orca's documented profile names.
    const cliEnv = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ORCA_USER_DATA: profile, ORCA_USER_DATA_PATH: profile, ORCA_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' };
    let run = null;
    let session = null;
    let secrets = [];
    try {
        run = await startOrcad({ nodeBin: node.path, orcaDir: ORCA_DIR, profileDir: profile, env });
        const { ready } = run;
        if (!ready.boundEndpoint?.startsWith('ws://127.0.0.1:')) throw new Error('orcad did not bind loopback');
        if (!ready.webClientUrl) throw new Error('the ready line offers no web-client pairing');
        const hash = new URL(ready.webClientUrl).hash.replace(/^#/, '').replace(/^pairing=/, '');
        const offer = offerOf(decodeURIComponent(hash));
        secrets = [...ready.secrets, offer.deviceToken, offer.publicKeyB64, offer.endpoint, ready.boundEndpoint].filter((s) => typeof s === 'string' && s.length >= 8);
        restore();
        restore = installOutputRedaction(secrets);

        // The bundle reads window (btoa in Orca's web e2ee) and self (tweetnacl's PRNG, self.crypto); Node's globals
        // stand in for both, as the browser document provides them.
        globalThis.window ??= globalThis;
        globalThis.self ??= globalThis;
        // A .mjs copy, so Node loads it as the ES module it is without a typeless-package warning.
        const copy = join(work, 'pb-browser-host.mjs');
        copyFileSync(bundlePath, copy);
        const host = await import(pathToFileURL(copy).href);
        if (host.PB_BROWSER_HOST_API !== 1 || typeof host.attachBrowserHost !== 'function') throw new Error('the bundle does not export PB_BROWSER_HOST_API 1 and attachBrowserHost');

        const events = [];
        const acks = [];
        const settle = (event, outcome) => session.commandResult(event, outcome).then(
            (r) => acks.push({ type: event.command.type, method: event.command.method ?? null, accepted: r?.accepted === true }),
            (e) => acks.push({ type: event.command.type, method: event.command.method ?? null, accepted: false, code: String(e?.message ?? e).slice(0, 80) }));
        const onCommand = (event) => {
            const cmd = event.command;
            events.push({ type: cmd.type, method: cmd.method ?? null, at: Date.now(), page: event.browserPageId });
            const answer = () => {
                if (cmd.type === 'createPage' || cmd.type === 'closePage') return settle(event, { status: 'completed' });
                if (cmd.type === 'automation' && cmd.method === 'browser.goto') return settle(event, { status: 'completed', result: { url: String(cmd.params?.url ?? ''), title: PROBE_TITLE } });
                return settle(event, { status: 'failed', errorCode: 'browser_command_unavailable' });
            };
            // session is set by the time orcad can send a command (ready precedes every command).
            if (session) answer(); else setTimeout(answer, 0);
        };
        const detached = [];
        try {
            session = await host.attachBrowserHost({
                connection: { endpoint: offer.endpoint, hostPublicKeyB64: offer.publicKeyB64 },
                credential: { kind: 'token', deviceToken: offer.deviceToken },
                browserHostClientId: `pb-host-${randomUUID()}`,
                inventory: () => [],
                onCommand,
                onDetached: (reason) => detached.push(reason),
            });
            obs.attach = 'accepted';
        } catch (e) {
            obs.attach = redact(String(e?.message ?? e), secrets).slice(0, 120);
            return obs;
        }

        const sel = `path:${repo}`;
        const added = await cli(node.path, cliEnv, repo, secrets, ['repo', 'add', '--path', repo]);
        if (!added.ok) notes.repoAdd = added.code ?? 'failed';
        const created = await cli(node.path, cliEnv, repo, secrets, ['tab', 'create', '--worktree', sel]);
        const pageId = payload(created.json)?.browserPageId;
        obs.cliTabCreateOk = created.ok && typeof pageId === 'string';
        if (!obs.cliTabCreateOk) notes.tabCreate = created.code ?? 'no browserPageId';
        await until(() => events.some((e) => e.type === 'createPage'), 1000);
        await sleep(300);
        const creates = events.filter((e) => e.type === 'createPage');
        obs.createPageCount = creates.length;
        obs.createPageMs = creates[0] ? creates[0].at - created.started : null;
        obs.createPageAfterCliMs = creates[0] ? Math.max(0, creates[0].at - created.ended) : null;
        await until(() => acks.some((a) => a.type === 'createPage'), 2000);
        obs.createPageAck = acks.find((a) => a.type === 'createPage')?.accepted === true;
        if (!pageId) return obs;

        const went = await cli(node.path, cliEnv, repo, secrets, ['goto', '--url', PROBE_URL, '--page', pageId]);
        obs.cliGotoOk = went.ok;
        obs.cliGotoTitleMatches = payload(went.json)?.title === PROBE_TITLE;
        if (!went.ok) notes.goto = went.code ?? 'failed';
        obs.gotoEventCount = events.filter((e) => e.type === 'automation' && e.method === 'browser.goto').length;
        obs.gotoAck = acks.find((a) => a.method === 'browser.goto')?.accepted === true;

        const before = events.length;
        try {
            const reply = await session.userClosedPage(sel, pageId);
            obs.userCloseClosed = reply?.closed === true;
        } catch (e) {
            obs.userCloseClosed = false;
            notes.userClose = redact(String(e?.message ?? e), secrets).slice(0, 80);
        }
        await until(() => acks.some((a) => a.type === 'closePage'), 3000);
        obs.closePageCount = events.slice(before).filter((e) => e.type === 'closePage').length;
        obs.closePageAck = acks.find((a) => a.type === 'closePage')?.accepted === true;
        const list = await cli(node.path, cliEnv, repo, secrets, ['tab', 'list', '--worktree', sel]);
        obs.tabListOk = list.ok;
        const tabs = payload(list.json)?.tabs ?? [];
        obs.stillListed = tabs.some((t) => t.browserPageId === pageId);
        obs.detachedEarly = detached.length > 0 ? detached[0] : null;
        return obs;
    } finally {
        try { session?.detach(); } catch { /* closed */ }
        if (run) {
            const { survivors } = await stopOrcad(run.child, run.ready?.daemonPid);
            if (survivors?.length) notes.survivors = survivors.length;
        }
        restore();
        obs.secrets = secrets;
        rmSync(work, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------- main

function newestBuildLog() {
    const dir = join(REPO_ROOT, '.mozbuild', 'orca-build');
    let names = [];
    try { names = readdirSync(dir).filter((n) => /^build-.*\.log$/.test(n)); } catch { return null; }
    names.sort();
    return names.length ? join(dir, names[names.length - 1]) : null;
}

async function main() {
    const outRel = existsSync(PANES_CONFIG) ? paneOutDirOf(readFileSync(PANES_CONFIG, 'utf8')) : null;
    if (!outRel) {
        console.log(`${NAME}: FAIL -- orca-overlay/files/vite.pb-panes.config.ts has no outDir line (the pane config moved)`);
        return 1;
    }
    const bundle = join(ORCA_DIR, outRel, BUNDLE_NAME);
    for (const [path, what] of [[bundle, `orca/${outRel}/${BUNDLE_NAME}`], [join(ORCA_DIR, 'out', 'orcad', 'orcad.js'), 'orca/out/orcad/orcad.js'], [join(ORCA_DIR, 'out', 'cli', 'index.js'), 'orca/out/cli/index.js']]) {
        if (!existsSync(path)) {
            console.log(`${NAME}: SKIP -- ${what} is absent (nix develop .#orca --command bash scripts/build-orca.sh; the CLI as docs/BUILD.md "Browser host bundle" records)`);
            return 0;
        }
    }
    const bytes = statSync(bundle).size;
    const notes = {};
    let obs;
    try {
        obs = await attachClause(bundle, notes);
    } catch (e) {
        console.log(`${NAME}: FAIL -- attach probe: ${redact(String(e?.message ?? e)).slice(0, 200)}`);
        return 1;
    }
    const fails = attachVerdict(obs);
    const lines = fails.map((f) => `${NAME}: FAIL -- ${f}`);
    if (Object.keys(notes).length) lines.unshift(`${NAME}: note -- ${JSON.stringify(notes)}`);
    const log = newestBuildLog();
    const matches = redactionMatches(lines.join('\n'), obs.secrets) + (log ? redactionMatches(readFileSync(log, 'utf8'), obs.secrets) : 0);
    if (matches) lines.push(`${NAME}: FAIL -- redaction: ${matches} offer field occurrence(s) in the output or the newest build log`);
    if (!lines.some((l) => l.includes(': FAIL -- '))) {
        lines.push(`${NAME}: PASS -- attach accepted, createPage in ${obs.createPageMs} ms, user close reported, ${bytes} bytes (redaction 0 matches)`);
    }
    for (const l of lines) console.log(redact(l, obs.secrets));
    return lines.some((l) => l.includes(': FAIL -- ')) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.length) { console.error(`${NAME}: unknown argument ${args[0]}`); process.exit(2); }
    process.exit(await main());
}
