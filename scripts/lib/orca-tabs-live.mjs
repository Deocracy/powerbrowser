// scripts/lib/orca-tabs-live.mjs
//
// Phase 64 (P64-25, P64-27, P64-33, P64-35; interfaces C3, C5, C7, C9, C10): the
// one live session the Phase 64 rows share. PowerBrowser on a scratch profile
// with orcad and the booted Orca pane bundle, inherited ORCA_* scrubbed, output
// redaction installed before anything else, and a stub `claude` on the launched
// PowerBrowser's PATH only (agent 'stub', the default). With agent 'real' (64-06,
// D-30) no stub is written: the owner's own claude on the base PATH must answer
// --version naming Claude Code, and orcad's environment is read once for the
// pre-installed SDK extension's directory variable, recording only whether it is
// set and holds the SDK's package.json, never its value.
//
// Lane p64-02's code (theia/extensions/orca-panes) and lane p64-01's bundle
// (orca/out/web/assets/pb-panes) are read only through the C1-C12 contracts.
// prerequisites() names a SKIP only while one of those is absent; the directory
// present but the built app lacking orca-panes is a FAIL, never a SKIP.
//
// The bundle is reached only through C3's boot handle: the namespace stored
// under globalThis[Symbol.for(ORCA_PANES_MODULE_KEY)] and the window event
// ORCA_PANES_BOOT_EVENT. The two literals are spelled once, here, so
// orca-pane-routes clause (g) can compare them with the loader's.
//
// The addWidget recorder on ApplicationShell is instrumentation this harness
// owns. It is used only to stop the 1 s clock, never to judge an absence
// (CLAUDE.md verification rule 1).
//
// The pairing offer: offerFromFile() reads the bridge folder's web-pairing file
// and keeps the value in memory; it is never printed, logged or written. Every
// stdout and stderr write goes through orca-run.mjs's redact, which also
// replaces the offer itself once it has been read.
//
// The live lock (reexecUnderLiveLock): a live row takes <git common dir>/pb-live.lock itself,
// before it launches anything. It goes on in this process when an ancestor holds the lock
// (flock <lock> node <row>, or this function's own re-exec) or when PB_LIVE_LOCK_HELD=1 is set
// and the lock is in fact held (the driver's holder); PB_LIVE_LOCK_HELD=1 with a free lock is
// an error, never trusted. Otherwise it re-runs the row under flock -o in its own process group,
// forwards SIGINT, SIGTERM and SIGHUP to that group and exits with the re-run's status.
// The lock file is never overridable by a live run (PB_LIVE_LOCK_FILE counts only with --lock-probe).
//
// Fixture git: the scratch repository's git is the pane harness's fixtureGit (no global or
// system config, no signing, no hooks, a scratch HOME), and the Orca CLI gets the scratch HOME
// too (harness-live-tabs-13).
//
// Node built-ins and the repo's lib modules only.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { constants as osConstants, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveEnv, seedClaudeLogin } from './firefox-bidi.mjs';
import { verdictExit } from './skip-verdict.mjs';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** C3 boot handle. orca-pane-routes (g) requires both to be literals of this file. */
export const ORCA_PANES_MODULE_KEY = 'powerbrowser.orca-panes.module';
export const ORCA_PANES_BOOT_EVENT = 'powerbrowser-orca-panes-module';

export const ORCA_PANES_REL = 'theia/extensions/orca-panes';
export const PROTOCOL_REL = 'theia/extensions/orca-panes/src/common/orca-panes-protocol.ts';
export const PANES_BUNDLE_REL = 'orca/out/web/assets/pb-panes';
export const ORCAD_REL = 'orca/out/orcad/orcad.js';
export const BACKEND_MAIN_REL = 'theia/applications/browser/lib/backend/main.js';
/** Phase 65 (lane p65-02): the extension that opens Orca's editor, diff and conflict-review tabs in Theia's editors. */
export const ORCA_WORKSPACE_REL = 'theia/extensions/orca-workspace';
/** C5: the bridge-folder file OrcaService writes after orcad's ready line. */
export const WEB_PAIRING_FILE = 'web-pairing';
/** C7 */
export const ORCA_PANE_WIDGET_PREFIX = 'orca-pane:';
export const ORCA_SCHEME = 'pb-orca';

const SERVICE_URL = 'chrome://powerbrowser/content/OrcaService.sys.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

// ---------------------------------------------------------------------------
// The live lock.

/**
 * The lock file every live run shares: <git common dir>/pb-live.lock. PB_LIVE_LOCK_FILE names another file only for the
 * self-test's --lock-probe (probe true); a live run ignores it, so it cannot point the lock at a file nobody else takes.
 */
export function liveLockFile(root = REPO_ROOT, env = process.env, probe = false) {
    if (probe && env.PB_LIVE_LOCK_FILE) return env.PB_LIVE_LOCK_FILE;
    const common = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    return join(common, 'pb-live.lock');
}

/** 'held' when some process holds `lock` (a non-blocking flock cannot take it), 'free' when it can, 'error' when flock did not run. */
export function lockState(lock) {
    const r = spawnSync('flock', ['-n', lock, 'true'], { stdio: 'ignore' });
    if (r.error) return 'error';
    return r.status === 0 ? 'free' : r.status === 1 ? 'held' : 'error';
}

/**
 * Whether this process or one of its ancestors holds a flock on `lock` (mirrors lock_held_by_ancestor in scripts/verify-platform.sh):
 * the holders are read from /proc/locks by the lock file's inode, then the parent chain of `pid` is walked.
 */
export function lockHeldByAncestor(lock, pid = process.pid, procRoot = '/proc') {
    let ino;
    try { ino = String(statSync(lock).ino); } catch { return false; }
    const holders = new Set();
    for (const line of (read(join(procRoot, 'locks')) ?? '').split('\n')) {
        const f = line.trim().split(/\s+/);
        if (f.includes('->') || f[1] !== 'FLOCK') continue;
        if (String(f[5] ?? '').split(':').pop() === ino) holders.add(f[4]);
    }
    if (!holders.size) return false;
    for (let at = pid; at > 1;) {
        if (holders.has(String(at))) return true;
        const stat = read(join(procRoot, String(at), 'stat'));
        if (stat === null) return false;
        at = Number(stat.replace(/^.*\) /, '').split(' ')[1]);
    }
    return false;
}

/**
 * Takes the live lock. Resolves null when this process may go on: an ancestor holds the lock, or PB_LIVE_LOCK_HELD=1 is set and the
 * lock is held (the driver's holder is not an ancestor). Throws when PB_LIVE_LOCK_HELD=1 is set and the lock is free (a hand-set flag
 * would run the row with no lock). Otherwise runs `node <self> <args>` under flock -o (the row's children, a detached orcad among
 * them, do not inherit the descriptor and cannot keep the lock after the row ends) in its own process group, forwards termination
 * signals to that group, and resolves with the run's exit status (77 and every other status pass through). The caller exits with it.
 * Options for the self-test only: lockFile, ancestorCheck, forward.
 */
export async function reexecUnderLiveLock(self, args, { root = REPO_ROOT, env = process.env, lockFile, ancestorCheck = true, forward = true } = {}) {
    const lock = lockFile ?? liveLockFile(root, env, args.includes('--lock-probe'));
    if (ancestorCheck && lockHeldByAncestor(lock)) return null;
    if (env.PB_LIVE_LOCK_HELD === '1') {
        const state = lockState(lock);
        if (state === 'held') return null;
        throw new Error(`PB_LIVE_LOCK_HELD=1 is set but ${state === 'free' ? 'nothing holds' : 'the state could not be read of'} the live lock (${lock}), so this run would be unlocked. Next step: unset PB_LIVE_LOCK_HELD, or run through scripts/verify-platform.sh`);
    }
    return new Promise((resolveRun, reject) => {
        const child = spawn('flock', ['-o', lock, process.execPath, self, ...args], { stdio: 'inherit', detached: true, env: { ...env, PB_LIVE_LOCK_HELD: '1' } });
        const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
        const send = (sig) => { try { process.kill(-child.pid, sig); } catch { /* already gone */ } };
        const handlers = signals.map((sig) => [sig, () => send(sig)]);
        const onExit = () => send('SIGTERM');
        if (forward) { for (const [sig, h] of handlers) process.on(sig, h); process.on('exit', onExit); }
        const done = () => { for (const [sig, h] of handlers) process.off(sig, h); process.off('exit', onExit); };
        child.on('error', (err) => { done(); reject(new Error(`could not take the live lock with flock (${err.code ?? err.message}); install util-linux or run through scripts/verify-platform.sh`)); });
        child.on('close', (code, signal) => { done(); resolveRun(code ?? (signal ? 128 + (osConstants.signals[signal] ?? 0) : 1)); });
    });
}

/**
 * The self-test's control for a live row's lock (no browser): runs `node <self> --lock-probe` with PB_LIVE_LOCK_HELD
 * unset and its own lock file, and requires the row to report that it holds the lock (the env flag set and a lock that a
 * second flock -n cannot take). Resolves red reasons.
 */
export function lockProbeVerdict(self, name) {
    const dir = mkdtempSync(join(tmpdir(), 'pb-lock-probe-'));
    try {
        const lockFile = join(dir, 'pb-live.lock');
        writeFileSync(lockFile, '');
        const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'PB_LIVE_LOCK_HELD' && !k.startsWith('ORCA_')));
        const r = spawnSync(process.execPath, [self, '--lock-probe'], { encoding: 'utf8', timeout: 20000, env: { ...env, PB_LIVE_LOCK_FILE: lockFile } });
        const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
        const fails = [];
        if (r.status !== 0) fails.push(`${name} --lock-probe exited ${r.status} (${out.trim().slice(0, 120)})`);
        if (!/lock-probe: held=1 locked=1\b/.test(out)) fails.push(`${name} started without PB_LIVE_LOCK_HELD did not take the live lock before running (${out.trim().slice(0, 120)})`);
        return fails;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/** What a row prints for --lock-probe once it is running: whether this process holds the live lock. Never launches anything. */
export function lockProbeLine(name, env = process.env) {
    return `${name}: lock-probe: held=${env.PB_LIVE_LOCK_HELD === '1' ? 1 : 0} locked=${lockState(liveLockFile(REPO_ROOT, env, true)) === 'held' ? 1 : 0}`;
}

/**
 * The lock helper's own plants (no browser, a private lock file, real flock): each case runs a fixture row that calls
 * reexecUnderLiveLock and prints "ran held=<flag>". Resolves red reasons.
 */
export async function lockBehaviourVerdict() {
    const dir = mkdtempSync(join(tmpdir(), 'pb-lock-behaviour-'));
    const fails = [];
    const stragglers = [];
    try {
        const lock = join(dir, 'pb-live.lock');
        writeFileSync(lock, '');
        const pids = join(dir, 'pids');
        const row = join(dir, 'row.mjs');
        writeFileSync(row, `import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { reexecUnderLiveLock } from ${JSON.stringify(import.meta.url)};
const opts = { lockFile: process.env.FX_LOCK, ancestorCheck: process.env.FX_NO_ANCESTOR !== '1', forward: process.env.FX_NO_FORWARD !== '1' };
let held;
try { held = await reexecUnderLiveLock(import.meta.filename, process.argv.slice(2), opts); } catch (e) { console.error(String(e.message)); process.exit(1); }
if (held !== null) process.exit(held);
console.log('ran held=' + process.env.PB_LIVE_LOCK_HELD);
if (process.env.FX_SLEEP === '1') {
    const child = spawn('sleep', ['60'], { stdio: 'ignore' });
    writeFileSync(process.env.FX_PIDS, process.pid + ' ' + child.pid);
    await new Promise((r) => setTimeout(r, 60000));
}
`);
        const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'PB_LIVE_LOCK_HELD' && !k.startsWith('ORCA_')));
        const run = (cmd, args, extra = {}, timeout = 15000) => spawnSync(cmd, args, { encoding: 'utf8', timeout, env: { ...base, FX_LOCK: lock, ...extra } });
        // (a) a hand-set flag with the lock free is not trusted.
        const free = run(process.execPath, [row], { PB_LIVE_LOCK_HELD: '1' });
        if (free.status === 0 || !/PB_LIVE_LOCK_HELD=1 is set but nothing holds the live lock/.test(free.stderr)) fails.push(`lock: PB_LIVE_LOCK_HELD=1 with the lock free was trusted (exit ${free.status}, ${String(free.stderr).trim().slice(0, 100)})`);
        // (a, control) the same flag with the lock held by the driver's kind of holder (not an ancestor) is accepted.
        const holder = spawn('flock', ['-o', lock, 'sleep', '30'], { stdio: 'ignore', detached: true });
        stragglers.push(-holder.pid);
        for (let i = 0; i < 50 && lockState(lock) !== 'held'; i++) await sleep(100);
        const held = run(process.execPath, [row], { PB_LIVE_LOCK_HELD: '1' });
        if (held.status !== 0 || !/ran held=1/.test(held.stdout)) fails.push(`lock: PB_LIVE_LOCK_HELD=1 with the lock held was refused (exit ${held.status}, ${String(held.stderr).trim().slice(0, 100)})`);
        try { process.kill(-holder.pid, 'SIGKILL'); } catch { /* gone */ }
        for (let i = 0; i < 50 && lockState(lock) !== 'free'; i++) await sleep(100);
        // (b) flock <lock> node <row>: an ancestor holds the lock, the row goes on instead of waiting on it.
        const wrapped = run('flock', [lock, process.execPath, row], {}, 8000);
        if (wrapped.status !== 0 || !/ran held=undefined/.test(wrapped.stdout)) fails.push(`lock: a row under flock <lock> did not run (exit ${wrapped.status}${wrapped.error ? `, ${wrapped.error.code}` : ''}): it waited on its own ancestor`);
        // (b, plant) without the ancestor check the same invocation hangs: the detector can see the deadlock.
        const hung = spawn('flock', [lock, process.execPath, row], { stdio: 'ignore', detached: true, env: { ...base, FX_LOCK: lock, FX_NO_ANCESTOR: '1' } });
        stragglers.push(-hung.pid);
        await sleep(3000);
        const hungAlive = hung.exitCode === null && hung.signalCode === null;
        try { process.kill(-hung.pid, 'SIGKILL'); } catch { /* gone */ }
        await sleep(500);
        for (let i = 0; i < 50 && lockState(lock) !== 'free'; i++) await sleep(100);
        if (!hungAlive) fails.push('lock: the ancestor-wait plant did not hang, so the ancestor control proves nothing');
        // plain run: re-executed under the lock.
        const plain = run(process.execPath, [row]);
        if (plain.status !== 0 || !/ran held=1/.test(plain.stdout)) fails.push(`lock: a plain run was not re-run under the lock (exit ${plain.status}, ${String(plain.stderr).trim().slice(0, 100)})`);
        // (c) a SIGTERM to the row's first process reaches the re-run, its children and releases the lock.
        for (const forward of [true, false]) {
            rmSync(pids, { force: true });
            const parent = spawn(process.execPath, [row], { stdio: 'ignore', env: { ...base, FX_LOCK: lock, FX_SLEEP: '1', FX_PIDS: pids, FX_NO_FORWARD: forward ? '0' : '1' }, detached: true });
            for (let i = 0; i < 100 && !existsSync(pids); i++) await sleep(100);
            const [rowPid, kidPid] = (read(pids) ?? '0 0').split(' ').map(Number);
            if (!(rowPid > 1)) { fails.push('lock: the signal fixture row never started'); stragglers.push(parent.pid); continue; }
            for (const pid of [rowPid, kidPid]) if (Number.isInteger(pid) && pid > 1) stragglers.push(pid);
            process.kill(parent.pid, 'SIGTERM');
            await sleep(2500);
            const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
            if (forward && (alive(rowPid) || alive(kidPid) || lockState(lock) !== 'free')) fails.push('lock: SIGTERM to the parent left the re-run, its child or the lock behind');
            if (!forward && !alive(rowPid)) fails.push('lock: the no-forward plant did not leave the re-run running, so the signal control proves nothing');
            for (const pid of [rowPid, kidPid]) if (Number.isInteger(pid) && pid > 1) try { process.kill(pid, "SIGKILL"); } catch { /* gone */ }
        }
        return fails;
    } finally {
        for (const pid of stragglers) { if (pid === 0 || Math.abs(pid) <= 1) continue; try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
        rmSync(dir, { recursive: true, force: true });
    }
}

/** verdictExit with its SKIP line suppressed: the self-tests ask what the exit status is without printing a SKIP line of their own. */
export function verdictExitQuiet(name, failures, skips) {
    const log = console.log;
    console.log = () => {};
    try {
        return verdictExit(name, failures, skips);
    } finally {
        console.log = log;
    }
}

// ---------------------------------------------------------------------------
// Redaction after the session.

let retained = null;
/** Keeps a session's redact function and secret list so output printed after the session is redacted too. */
export function retainForOutput(redact, secrets) {
    retained = { redact, secrets };
}
/** Redacts text printed after a session ended (a verdict reason, a note, a harness error); unchanged before any session. */
export function redactAfterSession(text) {
    return retained ? retained.redact(String(text), retained.secrets) : String(text);
}

// ---------------------------------------------------------------------------
// Orca's confirmation dialog, judged against a baseline.

/** Orca's confirmation dialog, as the live rows detect it. */
export const CONFIRMATION_SELECTOR = 'body > [data-radix-popper-content-wrapper] [role="dialog"], body > [data-radix-popper-content-wrapper] [role="alertdialog"], body > [role="dialog"], body > [role="alertdialog"], body > div [role="alertdialog"]';
const ORCA_CLOSE_DIALOG_REL = 'orca/src/renderer/src/components/terminal-pane/CloseTerminalDialog.tsx';

/**
 * The dialog titles of Orca's close-terminal confirmation, read from the pinned source: [] only when orca/ is not fetched. With the
 * checkout present and no title read (the file moved or its copy keys changed) it throws: an empty list would accept any new dialog.
 */
export function closeDialogTitles(root = REPO_ROOT) {
    if (!existsSync(join(root, 'orca', 'src'))) return [];
    const text = read(join(root, ORCA_CLOSE_DIALOG_REL));
    const titles = [...(text ?? '').matchAll(/stop_(?:command|agent)_title',\s*'([^']+)'/g)].map((m) => m[1]);
    if (!titles.length) throw new Error(`source moved: no close-terminal dialog title read from ${ORCA_CLOSE_DIALOG_REL}${text === null ? ' (the file is absent)' : ''}, so the confirmation could not be told from another dialog`);
    return titles;
}

/** Page source: marks every confirmation dialog already present, so a later one is told from them. Resolves their count. */
export const DIALOG_BASELINE = `const found = document.querySelectorAll(${JSON.stringify(CONFIRMATION_SELECTOR)});
    for (const d of found) d.setAttribute('data-pb-dialog-baseline', '1');
    return found.length;`;
/** Page source: the dialogs that appeared since the baseline: { count, text } or null. */
export const DIALOG_NEW = `const d = [...document.querySelectorAll(${JSON.stringify(CONFIRMATION_SELECTOR)})].filter((e) => !e.hasAttribute('data-pb-dialog-baseline'));
    return d.length ? { count: d.length, text: d.map((e) => (e.textContent || '').replace(/\\s+/g, ' ').trim()).join(' | ') } : null;`;
/** Page source: clicks Cancel inside a dialog that appeared since the baseline only. */
export const DIALOG_CANCEL_NEW = `const d = [...document.querySelectorAll(${JSON.stringify(CONFIRMATION_SELECTOR)})].find((e) => !e.hasAttribute('data-pb-dialog-baseline'));
    const btn = d && [...d.querySelectorAll('button')].find((b) => /cancel/i.test(b.textContent));
    if (btn) btn.click();
    await sleep(500);
    return !!btn;`;

/**
 * Whether a dialog that appeared since the baseline is Orca's close-terminal confirmation: one appeared, and (when the
 * pinned source names its titles) its text carries one of them. A dialog that was already open, or another one, is not.
 */
export function confirmationAppeared(found, titles) {
    if (!found || !found.count) return false;
    return titles.length === 0 || titles.some((t) => String(found.text).includes(t));
}

// ---------------------------------------------------------------------------
// Fixture git.

/**
 * The self-test's control for a fixture git runner (no browser): a HOME whose .gitconfig demands signing with a program that does
 * not exist and names a hooks folder whose pre-commit hook records itself and fails. The raw invocation (that HOME, no
 * flags) must be hit by it (a commit that fails or a hook that ran: the detector), and makeGit(repo, home) (the pane harness's
 * fixtureGit) must then commit cleanly with no hook run. Resolves red reasons.
 */
export function fixtureGitVerdict(makeGit) {
    const dir = mkdtempSync(join(tmpdir(), 'pb-fixture-git-'));
    try {
        const home = join(dir, 'home');
        const hooks = join(dir, 'hooks');
        mkdirSync(home, { recursive: true });
        mkdirSync(hooks, { recursive: true });
        const marker = join(dir, 'hook-ran');
        writeFileSync(join(hooks, 'pre-commit'), `#!/bin/sh\ntouch ${JSON.stringify(marker)}\nexit 1\n`);
        chmodSync(join(hooks, 'pre-commit'), 0o755);
        writeFileSync(join(home, '.gitconfig'), `[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = /nonexistent/pb-gpg\n[core]\n\thooksPath = ${hooks}\n`);
        const path = process.env.PATH ?? '';
        const prepare = (name) => { const r = join(dir, name); mkdirSync(r, { recursive: true }); writeFileSync(join(r, 'README'), 'x\n'); return r; };
        const commitWith = (run) => { try { run('init', '-q'); run('add', '.'); run('commit', '-q', '-m', 'fixture'); return null; } catch (e) { return String(e.stderr ?? e.message).trim().split('\n').pop(); } };
        const fails = [];
        const rawRepo = prepare('raw');
        const rawGit = (...a) => execFileSync('git', ['-C', rawRepo, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', ...a], { env: { PATH: path, HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] });
        if (commitWith(rawGit) === null && !existsSync(marker)) fails.push('fixture git: the hostile HOME config blocked nothing on the raw invocation, so the control proves nothing');
        rmSync(marker, { force: true });
        const error = commitWith(makeGit(prepare('fixture'), home));
        if (error !== null) fails.push(`fixture git: the fixture commit failed under a developer config with signing and hooks (${error})`);
        if (existsSync(marker)) fails.push('fixture git: a global pre-commit hook ran for the fixture commit');
        return fails;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/** The built PowerBrowser this run launches. */
export const firefoxBin = (root = REPO_ROOT) => process.env.PB_FIREFOX_BIN || join(root, 'objdir', 'dist', 'bin', 'powerbrowser');
/** The Theia backend this run launches: PB_BACKEND_MAIN, else this tree's. */
export const backendMain = (root = REPO_ROOT) => process.env.PB_BACKEND_MAIN || join(root, BACKEND_MAIN_REL);

/**
 * Whether the app under test (PB_BACKEND_MAIN, else this tree's) has orca-panes in its generated frontend: its document then holds Orca's
 * listeners once the bundle boots. null when the generated frontend index cannot be read (the app is not built as expected).
 */
export function appWiresOrcaPanes(main = backendMain()) {
    const text = read(join(dirname(main), '..', '..', 'src-gen', 'frontend', 'index.js'));
    return text === null ? null : /@powerbrowser\/orca-panes\//.test(text);
}

/**
 * What a paste control in the Theia frame may claim about Orca's document listeners (WINDOWS 62), decided from the frontend under
 * test: wired (the app names orca-panes), bundleBuilt (the pane bundle this tree serves exists), booted (the bundle booted in the
 * frame). 'covered': booted. 'not-wired': the app has no Orca listeners to cover. 'red': built but never booted (a blind control).
 * 'skip': wired but the bundle is not built, so Orca's listeners were not in the frame and the control did not cover them.
 */
export function listenerCoverage({ wired, bundleBuilt, booted }) {
    if (wired === null || wired === undefined) return { verdict: 'red', reason: 'NOT SCORED -- the generated frontend index of the app under test (src-gen/frontend/index.js beside PB_BACKEND_MAIN) could not be read, so whether Orca\'s document listeners are in the Theia frame is unknown' };
    if (!wired) return { verdict: 'not-wired', note: 'the app under test wires no orca-panes module, so no Orca document listeners are in the Theia frame' };
    if (booted) return { verdict: 'covered' };
    if (bundleBuilt) return { verdict: 'red', reason: 'NOT SCORED -- the Orca pane bundle is built but did not boot in the Theia frame, so the paste control does not cover its document listeners' };
    return { verdict: 'skip', reason: `Orca listeners not covered: the app under test wires orca-panes but ${PANES_BUNDLE_REL} is not built, so the paste control ran without Orca's document listeners. Next step: nix develop .#orca --command bash scripts/build-orca.sh` };
}

/**
 * Phase 65 (C64-7, P65-01): the clause-level prerequisite of orca-tabs-live stage (g)'s merge-editor half. A named
 * SKIP only while lane p65-02's orca-workspace is absent; present but missing from the built app's generated
 * frontend is a FAIL, as orca-panes is treated above.
 */
export function mergeEditorHalf(root = REPO_ROOT, main = backendMain(root)) {
    if (!existsSync(join(root, ORCA_WORKSPACE_REL))) return { skip: `lane p65-02 not merged (${ORCA_WORKSPACE_REL} is absent)`, fail: null };
    const frontend = join(dirname(main), '..', '..', 'src-gen', 'frontend', 'index.js');
    if (!/@powerbrowser\/orca-workspace\//.test(read(frontend) ?? '')) {
        return { skip: null, fail: `orca-workspace not wired into the built app (${frontend} names no @powerbrowser/orca-workspace module)` };
    }
    return { skip: null, fail: null };
}

/**
 * What the live rows need, in order. Resolves { skip, fail } with at most one set: a skip names the
 * absent prerequisite (an unmerged lane first), a fail names a present lane whose code the built app does not carry.
 * needOrca false stops after the orca-panes clauses (the TERM-04 control runs without orcad). A run that may go
 * ahead also carries mergeEditor: { skip, fail }, stage (g)'s merge-editor half (Phase 65).
 */
export function prerequisites({ root = REPO_ROOT, needOrca = true, needPanes = true } = {}) {
    // The unmerged lane is named first: it is the absence a lane run expects, whatever else is built.
    if (needPanes && !existsSync(join(root, ORCA_PANES_REL))) return { skip: 'lane p64-02 not merged (theia/extensions/orca-panes is absent)', fail: null };
    const bin = firefoxBin(root);
    if (!existsSync(bin)) return { skip: `no built PowerBrowser (${bin} missing; see docs/BUILD.md "Firefox half")`, fail: null };
    const main = backendMain(root);
    if (!existsSync(main)) return { skip: `no built Theia app (${main} missing; see docs/BUILD.md "Theia half")`, fail: null };
    if (!needPanes) return { skip: null, fail: null, mergeEditor: mergeEditorHalf(root, main) };
    // The generated server of the app being launched names every composed backend module.
    const server = join(dirname(main), '..', '..', 'src-gen', 'backend', 'server.js');
    if (!/@powerbrowser\/orca-panes\//.test(read(server) ?? '')) {
        return { skip: null, fail: `orca-panes not wired into the built app (${server} names no @powerbrowser/orca-panes module; add it to theia/applications/browser/package.json and rebuild)` };
    }
    if (!needOrca) return { skip: null, fail: null, mergeEditor: mergeEditorHalf(root, main) };
    if (!existsSync(join(root, ORCAD_REL))) return { skip: `no built orca/ (${ORCAD_REL} missing; run: nix develop .#orca --command bash scripts/build-orca.sh)`, fail: null };
    if (!existsSync(join(root, PANES_BUNDLE_REL))) return { skip: `lane p64-01 not merged or Orca not built (${PANES_BUNDLE_REL} is absent)`, fail: null };
    return { skip: null, fail: null, mergeEditor: mergeEditorHalf(root, main) };
}

/** The stub agent: one line, then stdin echoed until it closes. Never a model. */
export const STUB_AGENT = '#!/bin/sh\necho "stub claude: ready"\nexec cat\n';

/** Writes the stub agent into a fresh scratch directory; returns the directory (prepend it to PATH). */
export function writeStubAgentDir() {
    const dir = mkdtempSync(join(tmpdir(), 'pb-orca-stub-agent-'));
    writeFileSync(join(dir, 'claude'), STUB_AGENT);
    chmodSync(join(dir, 'claude'), 0o755);
    return dir;
}

/** D-30: the variable orcad reads the SDK's directory from (OrcaEnv's ORCAD_CLAUDE_AGENT_SDK_DIR_ENV). */
const SDK_DIR_ENV = 'ORCA_CLAUDE_AGENT_SDK_DIR';

/** The real claude on `path`: { found, version } (the --version line only; no prompt is sent). */
export function realClaudeOn(path) {
    try {
        const version = execFileSync('claude', ['--version'], { env: liveEnv({ PATH: path }), timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n')[0];
        return { found: true, version };
    } catch (e) {
        return { found: e.code !== 'ENOENT', version: '' };
    }
}

/** Whether a process's environment sets the SDK directory and that directory holds package.json. The value never leaves this function. */
export function sdkDirIn(pid) {
    let set = false;
    let packageJson = false;
    try {
        const line = readFileSync(`/proc/${pid}/environ`, 'latin1').split('\0').find((e) => e.startsWith(`${SDK_DIR_ENV}=`));
        const dir = line ? line.slice(SDK_DIR_ENV.length + 1) : '';
        set = dir.length > 0;
        packageJson = set && existsSync(join(dir, 'package.json'));
    } catch { /* unreadable: both false */ }
    return { set, packageJson };
}

/** The environment names a session removes from this process before it launches anything. */
export function scrubbedNames(env = process.env) {
    return Object.keys(env).filter((k) => /^ORCA_/.test(k) || k === 'NODE_OPTIONS' || k === 'NODE_PATH');
}

/** Page-realm source: wraps ApplicationShell.addWidget once, recording { id, t } (Date.now) per call. */
export const ADD_WIDGET_RECORDER = `const shell = get('ApplicationShell');
    if (!window.__pbAddWidgetLog) {
        window.__pbAddWidgetLog = [];
        const original = shell.addWidget.bind(shell);
        shell.addWidget = function (widget, options) { window.__pbAddWidgetLog.push({ id: widget.id, t: Date.now() }); return original(widget, options); };
    }
    return true;`;

/** Page-realm source of hostedWidgets(): every attached widget whose node carries data-pb-orca-pane. */
export const HOSTED_WIDGETS = `const shell = get('ApplicationShell');
    const registry = get('TabUriRegistry');
    const bars = shell.mainPanel.tabBars ? [...shell.mainPanel.tabBars()] : [];
    const out = [];
    // Visible xterms, as orca-pane-standalone-live judges them: an isolated leaf's root also holds its tab's other leaves' xterms, hidden.
    const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && el.offsetParent !== null; };
    for (const area of ['main', 'bottom', 'left', 'right']) {
        for (const w of shell.getWidgets(area)) {
            if (!w.node || !w.node.hasAttribute('data-pb-orca-pane')) continue;
            const r = w.node.getBoundingClientRect();
            const uri = registry.uriOf(w);
            out.push({
                id: w.id, area, options: w.options ? { ...w.options } : null, kind: w.node.getAttribute('data-pb-orca-pane'),
                title: w.title.label, tabBar: bars.findIndex(b => b.titles.includes(w.title)),
                rect: { x: r.x, y: r.y, w: r.width, h: r.height }, xterms: [...w.node.querySelectorAll('.xterm')].filter(visible).length, xtermsTotal: w.node.querySelectorAll('.xterm').length,
                attached: w.isAttached, organising: uri ? uri.toString(true) : 'widget:' + w.id,
            });
        }
    }
    return out;`;

/** Page-realm source: waits for the bundle through C3's boot handle; resolves its state() (no credential). */
export const BOOT_WAIT = `const key = Symbol.for(${JSON.stringify(ORCA_PANES_MODULE_KEY)});
    if (!globalThis[key]) await new Promise(r => { window.addEventListener(${JSON.stringify(ORCA_PANES_BOOT_EVENT)}, r, { once: true }); setTimeout(r, 90000); });
    const m = globalThis[key];
    if (!m) return { error: 'the boot event never fired and no module namespace is stored' };
    const booted = await until(() => m.state().booted, 90000);
    return { booted, state: m.state() };`;

/**
 * One PowerBrowser session; calls fn(ctx) and always tears down (quit, then SIGKILL of each recorded identity
 * still alive, the scratch repository, the stub directory, the profile). needOrca: wait for OrcaService ready and
 * the booted bundle, register a throwaway repository with orcad. ctx: { app, log, record, pollFor, probe(body, ms),
 * command(id, ...args), orca(...args), orcaState(), bundle(expr), hostedWidgets(), organisingKeys(), uriOf(id),
 * luminoClose(id), activate(id), sendText(id, text), typeInto(id, text), typeText(text), pressKey(spec), focusTheiaFrame(),
 * focusOverlay(tabId), openWebTab(url), addedSince(t), tabState(), offerFromFile(), repo, worktree, stubDir }.
 * registerRepo false: the scratch repository is created but never added to orcad, so the session starts in Orca's
 * no-project state, as a fresh profile does (ctx.worktree stays null; ctx.orca still works).
 */
export async function withOrcaTabsSession({ log = () => {}, needOrca = true, agent = 'stub', registerRepo = true } = {}, fn) {
    if (agent !== 'stub' && agent !== 'real') throw new Error(`withOrcaTabsSession: agent must be 'stub' or 'real', not ${agent}`);
    const { installOutputRedaction, ensurePbNode, redact } = await import('./orca-run.mjs');
    const secrets = [];
    // Redaction first: nothing below may print before it is in place. The offer joins the list once read.
    const restoreOutput = installOutputRedaction(secrets);
    // The caller prints its verdict after this session has ended and the stream hook is gone: it redacts through
    // redactAfterSession, which keeps this session's list (harness-live-tabs-12).
    retainForOutput(redact, secrets);
    const savedEnv = {};
    for (const k of [...scrubbedNames(), 'PATH', 'MOZ_PURGE_CACHES', 'XDG_CONFIG_HOME']) savedEnv[k] = process.env[k];
    const recorded = new Map();
    const scratch = mkdtempSync(join(tmpdir(), 'pb-orca-tabs-'));
    const repo = join(scratch, 'repo');
    let stubDir = null;
    try {
        for (const k of scrubbedNames()) delete process.env[k];
        const live = await import('./pb-live-probe.mjs');
        const { pollFor, probe } = await import('./pb-relaunch.mjs');
        const { freePort, signalIdentity, startTicks } = await import('../verify-orca-hidden-electron.mjs');
        const OrcaEnv = await import('../../powerbrowser/shell/OrcaEnv.sys.mjs');
        const record = (pid) => { const t = Number.isInteger(pid) && pid > 0 ? startTicks(pid) : null; if (t !== null) recorded.set(pid, t); return t; };
        const basePath = savedEnv.PATH ?? '';
        // The stub is on the launched PowerBrowser's PATH (and so orcad's), never on the Orca CLI's.
        const claude = agent === 'real' ? realClaudeOn(basePath) : null;
        if (agent === 'real') { // the real agent runs under the scratch HOME orcad inherits
            const unseeded = seedClaudeLogin();
            if (unseeded) throw new Error(`the real agent cannot run: ${unseeded}`);
        }
        if (agent === 'stub') {
            stubDir = writeStubAgentDir();
            process.env.PATH = `${stubDir}:${basePath}`;
        } else process.env.PATH = basePath;
        const prefs = { 'powerbrowser.orca.root': join(REPO_ROOT, 'orca'), 'powerbrowser.orca.port': await freePort(OrcaEnv) };
        if (needOrca) prefs['powerbrowser.sidecar.nodePath'] = (await ensurePbNode()).path;
        return await live.withProbeShell(async (app) => {
            const chromeJson = async (expr) => JSON.parse(await app.evaluateIn(app.chrome, `(() => { try { return JSON.stringify(${expr}); } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`));
            const orcaState = () => chromeJson(`ChromeUtils.importESModule(${JSON.stringify(SERVICE_URL)}).OrcaService.getState()`);
            const ctx = {
                app, log, record, pollFor, repo, stubDir, worktree: null, scratch, agent,
                /** agent 'real': { claude: { found, version }, sdk: { set, packageJson } | null }; null for the stub. */
                agentPrecondition: agent === 'real' ? { claude, sdk: null } : null,
                probe: (body, ms) => probe(app, body, ms),
                orcaState,
                pressKey: (spec) => live.pressKey(app, spec),
                focusTheiaFrame: () => live.focusTheiaFrame(app),
                focusOverlay: (tabId) => live.focusOverlay(app, tabId),
                openWebTab: (url) => live.openWebTab(app, url),
                serveNavPages: live.serveNavPages,
            };
            /** The tabs of the main and bottom areas (Theia's terminals open in the bottom panel) and the active widget. */
            ctx.tabState = () => ctx.probe(`const shell = get('ApplicationShell');
                return { ids: [...shell.getWidgets('main'), ...shell.getWidgets('bottom')].map(w => w.id), active: shell.activeWidget ? shell.activeWidget.id : null };`);
            ctx.activate = (id) => ctx.probe(`const shell = get('ApplicationShell');
                await shell.activateWidget(${JSON.stringify(id)});
                return await until(() => shell.activeWidget && shell.activeWidget.id === ${JSON.stringify(id)}, 5000);`);
            /** Executes a command; resolves { t0 } (Date.now before the call) or { error }. */
            ctx.command = (id, ...args) => ctx.probe(`const t0 = Date.now();
                try { await get('CommandService').executeCommand(${[JSON.stringify(id), ...args.map((a) => JSON.stringify(a))].join(', ')}); } catch (e) { return { t0, error: String(e && e.message || e) }; }
                return { t0 };`);
            ctx.bundle = (expr) => ctx.probe(`const m = globalThis[Symbol.for(${JSON.stringify(ORCA_PANES_MODULE_KEY)})];
                if (!m) return { error: 'no bundle module' };
                return await (${expr});`);
            ctx.hostedWidgets = () => ctx.probe(HOSTED_WIDGETS);
            ctx.organisingKeys = async () => Object.fromEntries((await ctx.hostedWidgets()).map((w) => [w.id, w.organising]));
            ctx.uriOf = (id) => ctx.probe(`const w = get('ApplicationShell').getWidgetById(${JSON.stringify(id)}) || get('WidgetManager').getWidgets('powerbrowser.orca-pane').find(x => x.id === ${JSON.stringify(id)});
                const u = w && get('TabUriRegistry').uriOf(w); return u ? u.toString(true) : null;`);
            /** A Lumino close (the tab's x), which orca-panes turns into Orca's own close (P64-11). */
            ctx.luminoClose = (id) => ctx.probe(`const w = get('ApplicationShell').getWidgetById(${JSON.stringify(id)}); if (!w) return false; w.close(); return true;`);
            ctx.addedSince = (t) => ctx.probe(`return (window.__pbAddWidgetLog || []).filter(e => e.t >= ${Number(t)});`);
            ctx.typeText = async (text) => {
                for (const ch of text) await ctx.pressKey(ch === '\n' ? { key: 'Enter', code: 'Enter', keyCode: 13 } : { key: ch });
            };
            /** Sends text to a Theia terminal widget's PTY once its process has started (fixture setup, not a key under test). */
            ctx.sendText = (id, text) => ctx.probe(`const w = get('ApplicationShell').getWidgetById(${JSON.stringify(id)});
                if (!w || typeof w.sendText !== 'function') return false;
                await Promise.race([w.processId, sleep(15000)]);
                w.sendText(${JSON.stringify(text)});
                return true;`);
            ctx.typeInto = async (id, text) => { await ctx.focusTheiaFrame(); await ctx.activate(id); await ctx.typeText(text); };
            /** Adds a value (a needle form of the offer) to the redaction list. */
            ctx.addSecret = (value) => { if (value && !secrets.includes(value)) secrets.push(value); };
            ctx.offerFromFile = async () => {
                const s = await orcaState();
                const dir = s.dataRoot ? await OrcaEnv.bridgeDirFor(s.dataRoot, (n) => liveEnv()[n], 'linux') : null;
                const offer = dir ? (read(OrcaEnv.bridgeFileFor(dir, WEB_PAIRING_FILE, 'linux')) ?? '').trim() : '';
                if (offer && !secrets.includes(offer)) secrets.push(offer);
                return offer || null;
            };
            /** The pairing input Orca's own pairing field parses: the offer read from the web-client URL's fragment or query, as Orca's web client reads it. */
            ctx.pairingInputFromFile = async () => {
                const offer = await ctx.offerFromFile();
                if (!offer) return null;
                let input = null;
                try {
                    const u = new URL(offer);
                    const keys = ['pairing', 'pair', 'code', 'token'];
                    const fromSearch = keys.map((k) => u.searchParams.get(k)).find((v) => v?.trim());
                    const hash = u.hash.replace(/^#/, '').trim();
                    input = fromSearch ?? keys.map((k) => new URLSearchParams(hash).get(k)).find((v) => v?.trim()) ?? (hash || null);
                } catch { /* not a URL: the offer itself */ input = offer; }
                if (input && !secrets.includes(input)) secrets.push(input);
                return input;
            };
            if (!(await ctx.probe(ADD_WIDGET_RECORDER))) throw new Error('harness: the addWidget recorder did not install');
            if (needOrca) {
                const state = await pollFor(async () => { const s = await orcaState(); if (s.chromeError || s.state === 'failed') throw new Error(`OrcaService: ${s.chromeError ?? s.state}`); return s.state === 'ready' ? s : null; }, 90000, 'OrcaService to reach ready');
                record(state.pid);
                record(state.daemonPid);
                if (ctx.agentPrecondition) ctx.agentPrecondition.sdk = sdkDirIn(state.pid);
                await ctx.offerFromFile();
                const boot = await ctx.probe(BOOT_WAIT, 200000);
                if (!boot?.booted) throw new Error(`the Orca pane bundle did not boot: ${JSON.stringify(boot?.error ?? boot?.state ?? boot)}`);
                // The Orca CLI's environment, built from scratch: never this session's ORCA_* values, never the stub.
                // The CLI reads its endpoint from ORCA_USER_DATA, so it gets the scratch HOME too; the developer's HOME is never handed to a fixture process.
                const cliEnv = { PATH: basePath, HOME: scratch, ORCA_USER_DATA: state.effectiveRoot, ORCA_USER_DATA_PATH: state.effectiveRoot };
                mkdirSync(repo, { recursive: true });
                writeFileSync(join(repo, 'README'), 'orca-tabs-live scratch repository\n');
                // The fixture's git is the pane harness's: no developer config, no signing, no hooks, a scratch HOME (harness-live-tabs-13).
                const { fixtureGit } = await import('./orca-pane-harness.mjs');
                const git = fixtureGit(repo, scratch);
                git('init', '-q');
                git('add', '.');
                git('commit', '-q', '-m', 'fixture');
                ctx.git = git;
                const cli = join(state.effectiveRoot, 'cli', 'bin', 'orca');
                ctx.orca = (...a) => {
                    try { return JSON.parse(execFileSync(cli, [...a, '--json'], { env: liveEnv(cliEnv), cwd: repo, timeout: 60000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) {
                        throw new Error(`the Orca CLI call '${a.slice(0, 2).join(' ')}' failed: ${redact(String(e.stderr ?? e.message), secrets).trim().split('\n').pop()}`);
                    }
                };
                if (registerRepo) {
                    ctx.orca('repo', 'add', '--path', repo);
                    ctx.worktree = `path:${repo}`;
                }
            }
            try {
                return await fn(ctx);
            } finally {
                await app.quit().catch(() => undefined);
            }
        }, { extraPrefs: prefs });
    } finally {
        await sleep(500);
        const { signalIdentity } = await import('../verify-orca-hidden-electron.mjs');
        for (const [pid, ticks] of recorded) signalIdentity(pid, ticks, 'SIGKILL');
        rmSync(scratch, { recursive: true, force: true });
        if (stubDir) rmSync(stubDir, { recursive: true, force: true });
        for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        restoreOutput();
    }
}

/** Polls the addWidget log for a hosted widget added at or after t0 that is not in `except`; resolves { id, t } or null. */
export async function waitForHostedAdd(ctx, t0, except = [], ms = 5000) {
    try {
        return await ctx.pollFor(async () => {
            const added = (await ctx.addedSince(t0)).filter((e) => e.id.startsWith(ORCA_PANE_WIDGET_PREFIX) && !except.includes(e.id));
            return added[0] ?? null;
        }, ms, 'a hosted Orca widget');
    } catch {
        return null;
    }
}

/** The hosted widget ids now. */
export const hostedIds = async (ctx) => (await ctx.hostedWidgets()).map((w) => w.id);

/** The text orcad's terminal read returns for a handle. */
export const terminalText = (ctx, handle) => {
    const r = ctx.orca('terminal', 'read', '--terminal', handle);
    const tail = r?.result?.terminal?.tail;
    return Array.isArray(tail) ? tail.join('\n') : String(tail ?? '');
};
