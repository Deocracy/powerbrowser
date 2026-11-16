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
import { join, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { homedir, tmpdir, userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { existsSync, createWriteStream, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { aliasPathFor, bridgeDirFor, dataRootFor, nodePlatform } from '../../powerbrowser/shell/OrcaEnv.sys.mjs';

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

// P67-21 as amended by A-6: PowerBrowser refuses Orca on a profile under a temp folder, so every live profile and
// config home is a mkdtemp child of one repo-local, ignored base.
export const LIVE_PROFILE_BASE = join(REPO_ROOT, '.mozbuild', 'pb-live-profiles');

/** A new folder under LIVE_PROFILE_BASE, named `prefix` plus mkdtemp's suffix. */
export async function liveProfileDir(prefix) {
    await mkdir(LIVE_PROFILE_BASE, { recursive: true });
    return mkdtemp(join(LIVE_PROFILE_BASE, prefix));
}

// Owner ruling 2026-11-15 ("Scratch HOME"): no live launch of PowerBrowser, orcad or the Orca CLI sees the developer's
// real home, so orcad's ~/.orca (credential key, agent hooks), ~/.config/orca and the agent's ~/.claude edits land in
// one per-run folder under LIVE_PROFILE_BASE, removed when this process exits. Every launch passes env: liveEnv(...);
// live-scratch-home (scripts/verify-live-scratch-home.mjs) goes red on a launch that does not.
/** The variables that decide where a launched process writes home data, with each one's default under HOME. */
export const LIVE_HOME_VARS = Object.freeze({ HOME: '', XDG_CONFIG_HOME: '.config', XDG_DATA_HOME: '.local/share', XDG_STATE_HOME: '.local/state', XDG_CACHE_HOME: '.cache' });
const HARNESS_SCRATCH = join(REPO_ROOT, '.mozbuild');
const within = (p, root) => { const r = relative(root, p); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
/** The developer's real home folders: os.homedir() (HOME) and the passwd entry, which differ when the harness itself runs under a scratch HOME. */
export function realHomes() {
    let pw = '';
    try { pw = userInfo().homedir; } catch { /* no passwd entry */ }
    return [...new Set([homedir(), pw].filter(Boolean).map(h => resolve(h)))];
}
/** True when `path` is unset, a real home or inside one, unless it is harness scratch under <repo>/.mozbuild. */
export function inRealHome(path, homes = realHomes()) {
    if (typeof path !== 'string' || path === '') return true;
    const p = resolve(path);
    return homes.some(h => within(p, h)) && !within(p, HARNESS_SCRATCH);
}

let scratchHome = null;
/** The signals that end a live run: verify-platform.sh stops a check with SIGTERM to its group; Node runs no 'exit' listener on any of them. */
export const LIVE_HOME_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);
const HOME_PID_FILE = '.pid';
const HOME_SEED_FILE = '.seeded'; // SHA-256 of the refresh token seedClaudeLogin wrote, never the token
const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; } };
/** The real ~/.claude/.credentials.json (the first real home holding one), or null. */
const realClaudeCredentials = () => realHomes().map(h => join(h, '.claude', '.credentials.json')).find(f => existsSync(f)) ?? null;

/** True while the run that made scratch HOME `dir` is alive (its .pid). A folder with no .pid yet counts as alive for a minute. */
function homeInUse(dir) {
    let pid = 0;
    try { pid = Number(readFileSync(join(dir, HOME_PID_FILE), 'utf8').trim()) || 0; } catch { /* no .pid */ }
    if (!pid) { try { return Date.now() - statSync(dir).mtimeMs < 60000; } catch { return false; } }
    try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/**
 * 68-11-REVIEW CR-02: true when scratch HOME `dir` holds no Claude sign-in that exists nowhere else. When claude rotated
 * the seeded refresh token inside it, the rotated one is the only valid one, so it is written back to the real
 * credentials file if that still holds the seeded token (compare-and-swap; a 0600 temp file renamed over it, the file's
 * other keys kept). Otherwise the folder must be kept, and its path is printed with what to do. Never prints a token.
 */
function scratchSignInSettled(dir) {
    const scratchFile = join(dir, '.claude', '.credentials.json');
    const rotated = readJson(scratchFile).claudeAiOauth;
    if (!rotated?.refreshToken) return true;
    let seeded = '';
    try { seeded = readFileSync(join(dir, HOME_SEED_FILE), 'utf8').trim(); } catch { /* seeded before .seeded existed */ }
    if (sha256(rotated.refreshToken) === seeded) return true;
    const realFile = realClaudeCredentials();
    const real = realFile ? readJson(realFile) : {};
    const realToken = real.claudeAiOauth?.refreshToken;
    if (realToken === rotated.refreshToken) return true;
    if (seeded && realToken && sha256(realToken) === seeded) {
        const tmp = `${realFile}.pb-${process.pid}.tmp`;
        try {
            rmSync(tmp, { force: true });
            writeFileSync(tmp, JSON.stringify({ ...real, claudeAiOauth: rotated }), { mode: 0o600, flag: 'wx' });
            renameSync(tmp, realFile);
            console.error(`firefox-bidi: claude refreshed its sign-in inside the scratch HOME; the new sign-in was written back to ${realFile}`);
            return true;
        } catch (e) {
            rmSync(tmp, { force: true });
            console.error(`firefox-bidi: could not write the refreshed sign-in back to ${realFile} (${e.code ?? 'error'})`);
        }
    }
    const target = realFile ?? '~/.claude/.credentials.json';
    console.error(`firefox-bidi: FAIL -- claude refreshed its sign-in inside a scratch HOME, and it was not written back because ${target} changed during the run. The refreshed sign-in is kept in ${scratchFile}. If claude asks you to sign in again, replace the claudeAiOauth entry in ${target} with the one in that file; otherwise delete the folder ${dir}`);
    return false;
}

/** Removes scratch HOME `dir` unless it holds the only copy of a refreshed Claude sign-in; returns whether it was removed. */
function disposeHome(dir) {
    if (!scratchSignInSettled(dir)) return false;
    rmSync(dir, { recursive: true, force: true });
    return true;
}

/**
 * This run's scratch HOME (mode 0700, under LIVE_PROFILE_BASE): made on first use, removed when the process exits or a
 * LIVE_HOME_SIGNALS signal ends it. SIGKILL cannot be caught, so making one first removes every pb-home-* folder whose
 * run is no longer alive.
 */
export function liveHome() {
    if (scratchHome) return scratchHome;
    mkdirSync(LIVE_PROFILE_BASE, { recursive: true });
    for (const name of readdirSync(LIVE_PROFILE_BASE)) {
        const dir = join(LIVE_PROFILE_BASE, name);
        if (name.startsWith('pb-home-') && !homeInUse(dir)) disposeHome(dir);
    }
    const home = mkdtempSync(join(LIVE_PROFILE_BASE, 'pb-home-'));
    writeFileSync(join(home, HOME_PID_FILE), String(process.pid), { mode: 0o600 });
    scratchHome = home;
    process.once('exit', () => { if (!disposeHome(home)) process.exitCode = 1; });
    for (const sig of LIVE_HOME_SIGNALS) {
        const onSignal = () => {
            // Another listener (withFirefoxPage's SIGINT) unwinds to a natural exit, which runs the 'exit' listener.
            if (process.listenerCount(sig) > 1) return;
            disposeHome(home);
            process.off(sig, onSignal); // the default disposition again, so the re-raised signal ends the process
            process.kill(process.pid, sig);
        };
        process.on(sig, onSignal);
    }
    return home;
}

/**
 * A variable name that relocates a program's home data by convention (CLAUDE_CONFIG_DIR, CODEX_HOME, GEMINI_HOME,
 * XDG_CONFIG_HOME, HOME): orcad and claude read CLAUDE_CONFIG_DIR before HOME (68-11-REVIEW WR-02).
 */
export const HOME_RELOCATING_NAME = /(^|_)(HOME|CONFIG_DIR|DATA_DIR|STATE_DIR|CACHE_DIR)$/;

/**
 * Throws unless HOME and every XDG base folder in `env` are set and outside the real home, and no other
 * HOME_RELOCATING_NAME variable points inside it: the runtime half of the ruling.
 */
export function assertScratchHome(env, what = 'a live launch') {
    const refuse = (name) => { throw new Error(`firefox-bidi: ${what} would run with ${name}=${env?.[name] || '(unset)'}, the developer's real home (owner ruling 2026-11-15, Scratch HOME)`); };
    for (const name of Object.keys(LIVE_HOME_VARS)) if (inRealHome(env?.[name])) refuse(name);
    for (const [name, value] of Object.entries(env ?? {})) if (HOME_RELOCATING_NAME.test(name) && value && inRealHome(value)) refuse(name);
    return env;
}

/**
 * `env` with HOME and the XDG base folders moved off the real home: HOME to liveHome(), an XDG folder to its default
 * under that HOME. A value already outside the real home is kept (a row's own configHome, a check's own scratch HOME).
 * Any other HOME_RELOCATING_NAME variable inside the real home (CLAUDE_CONFIG_DIR=~/.claude) is dropped, so the
 * launched program falls back to the scratch HOME.
 * XAUTHORITY is the one real-home file passed through, explicitly, so a headed run can still reach the X server.
 */
export function liveEnv(env = process.env) {
    const out = { ...env };
    if (inRealHome(out.HOME)) out.HOME = liveHome();
    for (const [name, sub] of Object.entries(LIVE_HOME_VARS)) if (sub && inRealHome(out[name])) out[name] = join(out.HOME, sub);
    for (const name of Object.keys(out)) if (!(name in LIVE_HOME_VARS) && HOME_RELOCATING_NAME.test(name) && out[name] && inRealHome(out[name])) delete out[name];
    if (!out.XAUTHORITY) {
        const xauth = realHomes().map(h => join(h, '.Xauthority')).find(f => existsSync(f));
        if (xauth) out.XAUTHORITY = xauth;
    }
    return assertScratchHome(out);
}

/** Minutes of access-token life a real-agent run needs before it starts, so claude never refreshes inside the scratch HOME. */
export const CLAUDE_TOKEN_MARGIN_MIN = 60;
/** The ~/.claude.json keys a non-interactive claude needs to skip onboarding; folder trust is written by orcad itself. */
export const CLAUDE_STATE_KEYS = Object.freeze(['hasCompletedOnboarding', 'lastOnboardingVersion', 'oauthAccount', 'userID']);

/**
 * Seeds liveHome() with exactly what the real claude needs to run non-interactively, for the rows that drive the
 * owner's real agent (orca-tabs-live, orca-agent-status-live). Every file is written fresh, never linked or copied
 * whole, so nothing the run writes (orcad's hooks in HOME/.claude/settings.json, session records) reaches ~/.claude:
 *   .claude/.credentials.json  the claudeAiOauth sign-in only (no MCP server tokens, so no MCP refresh can happen)
 *   .claude.json               CLAUDE_STATE_KEYS only (no mcpServers, no per-project state)
 *   .claude/settings.json      skipDangerousModePermissionPrompt, mirrored from the real settings: orcad launches
 *                              claude with --dangerously-skip-permissions, and without it claude stops at the
 *                              Bypass Permissions confirmation, whose default is "No, exit"
 * Token refresh: a refresh rotates the refresh token, and the rotated one would live only in the scratch copy, leaving
 * the real sign-in with a spent token. So the run is refused unless the access token outlives CLAUDE_TOKEN_MARGIN_MIN,
 * and the SHA-256 of the seeded refresh token is kept beside the copy (.seeded): whenever the scratch HOME is removed
 * (exit, an ending signal, or the next run's sweep), a rotated token is written back or the folder kept
 * (scratchSignInSettled). A second call in the same process keeps the first seed (68-11-REVIEW IN-04).
 * Returns null when seeded, or the reason the row must not run.
 */
export function seedClaudeLogin() {
    if (scratchHome && existsSync(join(scratchHome, HOME_SEED_FILE))) return null; // once per process: .seeded names the first seed
    const realFile = realClaudeCredentials();
    if (!realFile) return 'no Claude sign-in in the real home (~/.claude/.credentials.json); sign in to claude once, then re-run';
    const real = dirname(dirname(realFile));
    const oauth = readJson(realFile).claudeAiOauth;
    if (!oauth?.refreshToken) return 'the Claude sign-in holds no claude.ai login (an API-key setup is not seeded); sign in to claude once, then re-run';
    const minutesLeft = Math.floor((Number(oauth.expiresAt) - Date.now()) / 60000);
    if (!(minutesLeft >= CLAUDE_TOKEN_MARGIN_MIN)) return `the Claude sign-in expires in ${Number.isFinite(minutesLeft) ? minutesLeft : '?'} min, under the ${CLAUDE_TOKEN_MARGIN_MIN} min a run needs without refreshing it in a scratch copy; use claude once so it refreshes its own sign-in, then re-run`;
    const home = liveHome();
    const state = readJson(join(real, '.claude.json'));
    const settings = readJson(join(real, '.claude', 'settings.json'));
    mkdirSync(join(home, '.claude'), { recursive: true, mode: 0o700 });
    const creds = join(home, '.claude', '.credentials.json');
    writeFileSync(join(home, HOME_SEED_FILE), sha256(oauth.refreshToken), { mode: 0o600 });
    writeFileSync(creds, JSON.stringify({ claudeAiOauth: oauth }), { mode: 0o600 });
    writeFileSync(join(home, '.claude.json'), JSON.stringify(Object.fromEntries(CLAUDE_STATE_KEYS.filter(k => k in state).map(k => [k, state[k]]))), { mode: 0o600 });
    writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify(settings.skipDangerousModePermissionPrompt === true ? { skipDangerousModePermissionPrompt: true } : {}), { mode: 0o600 });
    return null;
}

/**
 * Removes the data-root alias and the bridge folder OrcaEnv derives for `profileDir` (aliasPathFor, bridgeDirFor
 * over dataRootFor), ignoring absent paths: with a repo-local profile every launch that starts orcad makes both
 * (A-6, Pitfall 7). A removal error is logged, never thrown.
 */
export async function removeOrcaPathsFor(profileDir) {
    const env = liveEnv(); // the HOME the launch had: aliasPathFor falls back to <HOME>/.cache
    const getEnv = name => env[name];
    const dataRoot = dataRootFor(profileDir);
    for (const path of [await aliasPathFor(dataRoot, getEnv), await bridgeDirFor(dataRoot, getEnv, nodePlatform(process.platform))]) {
        if (!path) continue;
        try {
            await rm(path, { recursive: true, force: true }); // rm does not follow the alias link
        } catch (err) {
            console.error(`firefox-bidi: could not remove ${path} (${err.code ?? err.message})`);
        }
    }
}

// 39-REVIEW CR-01: the pids of the browsers withFirefoxPage launched that are still running. pb-kwin's real-input
// gate accepts only a window one of them owns, so a PowerBrowser the owner has open never receives a send.
const launchedPids = new Set();
/** The pids of the browsers this process launched through withFirefoxPage that have not exited. */
export function launchedBrowserPids() {
    return [...launchedPids];
}

// WINDOWS 54: a packaged row ends PowerBrowser with SIGTERM/SIGKILL, not a quit, so its OrcaService leaves orcad and
// its terminal daemon running from the extraction root the row then deletes. Teardown stops them by recorded identity:
// an argument under this run's own mkdtemp root, started no earlier than this run's browser, and pid plus start ticks
// at signal time (signalIdentity). Never by name, so another session's orcad survives.

/** The run's package extraction root when binPath lies under a <tmpdir>/pb-pkg-* folder (lib/built-tree.mjs extractPackage), else null. */
export function extractionRootOf(binPath, tmp = tmpdir()) {
    const rel = relative(resolve(tmp), resolve(binPath));
    const first = rel.split(sep)[0];
    if (!rel || isAbsolute(rel) || first === rel || !first.startsWith('pb-pkg-')) return null;
    return join(resolve(tmp), first);
}

/** procs: [{ pid, argv, ticks }]. Those with an argument under root that started at or after `since` (start ticks; null: any). */
export function strayUnder(root, procs, since = null) {
    return procs.filter((p) => p.argv.some((a) => a.startsWith(`${root}/`)) && (since === null || Number(p.ticks) >= Number(since)));
}

const argvOf = (pid) => { try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean); } catch { return []; } };

/** Stops every process strayUnder(root, <all processes>, since) names: SIGTERM, up to 10 s, then SIGKILL. Returns the count. */
export async function stopStrays(root, { since = null, label = 'firefox-bidi' } = {}) {
    const { startTicks, signalIdentity } = await import('../verify-orca-hidden-electron.mjs');
    let names;
    try { names = readdirSync('/proc'); } catch { return 0; }
    const procs = names.filter((n) => /^\d+$/.test(n) && Number(n) !== process.pid)
        .map((n) => ({ pid: Number(n), argv: argvOf(Number(n)), ticks: startTicks(Number(n)) })).filter((p) => p.ticks !== null);
    const found = strayUnder(root, procs, since);
    if (!found.length) return 0;
    for (const p of found) signalIdentity(p.pid, p.ticks, 'SIGTERM');
    const until = Date.now() + 10000;
    while (Date.now() < until && found.some((p) => startTicks(p.pid) === p.ticks)) await new Promise((r) => setTimeout(r, 250));
    for (const p of found) signalIdentity(p.pid, p.ticks, 'SIGKILL');
    console.log(`${label}: stopped ${found.length} process(es) left running from the extracted package ${root}`);
    return found.length;
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

    const profileDir = await liveProfileDir('powerbrowser-firefox-bidi-');
    await applyProfileOverrides(profileDir);
    let sigintHandler;

    const child = spawn(binPath, [
        '--headless',
        '--profile', profileDir,
        '--window-size', windowSize,
        '--screenshot', outputPath,
        url,
    ], { env: liveEnv(), stdio: ['ignore', 'ignore', 'pipe'] });

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
        await removeOrcaPathsFor(profileDir);
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
// PB_LIVE_STDOUT_PATH / PB_LIVE_STDERR_PATH (67-04): the default tee targets, for a caller that cannot pass them
// through a wrapper (orca-pairing-containment captures PowerBrowser's output under Phase 65's withOrcaProfile).
export async function withFirefoxPage(url, callback, { binPath = FIREFOX_BIN, stdoutPath = process.env.PB_LIVE_STDOUT_PATH, stderrPath = process.env.PB_LIVE_STDERR_PATH, profileDir: keptProfileDir, capabilities = {} } = {}) {
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
    const profileDir = keptProfileDir || await liveProfileDir('powerbrowser-firefox-bidi-');
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
    const stderrSink = stderrPath ? createWriteStream(stderrPath) : undefined;
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
    ], { env: liveEnv(env), stdio: ['ignore', stdoutSink ? 'pipe' : 'ignore', 'pipe'] });
    if (child.pid) {
        launchedPids.add(child.pid);
        child.once('exit', () => launchedPids.delete(child.pid));
    }
    const pkgRoot = extractionRootOf(binPath);
    const launchTicks = pkgRoot && child.pid ? (await import('../verify-orca-hidden-electron.mjs')).startTicks(child.pid) : null;
    if (stdoutSink) {
        child.stdout.pipe(stdoutSink);
    }
    if (stderrSink) {
        child.stderr.pipe(stderrSink);
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
        if (pkgRoot && launchTicks !== null) await stopStrays(pkgRoot, { since: launchTicks });
        if (stdoutSink) {
            await new Promise(resolve => stdoutSink.end(resolve));
        }
        if (stderrSink) {
            await new Promise(resolve => stderrSink.end(resolve));
        }
        if (!keptProfileDir) {
            await rm(profileDir, { recursive: true, force: true });
            await removeOrcaPathsFor(profileDir);
        }
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
