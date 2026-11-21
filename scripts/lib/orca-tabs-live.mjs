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
// The live lock: a live row started on its own (PB_LIVE_LOCK_HELD is not "1") takes
// <git common dir>/pb-live.lock itself, before it launches anything, through
// reexecUnderLiveLock (harness-live-tabs-14, lane H1: the driver takes it and exports
// PB_LIVE_LOCK_HELD=1 for the rows it runs). A row wrapped in flock on that same file by
// its caller must also export PB_LIVE_LOCK_HELD=1, or it waits on its own parent.
//
// Fixture git: the scratch repository's git runs with no global or system config, no
// signing and no hooks (fixtureGit), so a developer's ~/.gitconfig cannot block or alter
// the fixture commits (harness-live-tabs-13).
//
// Node built-ins and the repo's lib modules only.

import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

/** The lock file every live run shares: <git common dir>/pb-live.lock, or PB_LIVE_LOCK_FILE (the self-test's own file). */
export function liveLockFile(root = REPO_ROOT, env = process.env) {
    if (env.PB_LIVE_LOCK_FILE) return env.PB_LIVE_LOCK_FILE;
    const common = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    return join(common, 'pb-live.lock');
}

/**
 * Takes the live lock for a live row started outside the driver. Returns null when PB_LIVE_LOCK_HELD is "1" (the
 * driver, or a caller that holds the lock, already did: the row goes on in this process). Otherwise runs
 * `node <self> <args>` under flock -o on the lock file (-o: the row's own children, a detached orcad among them, do not inherit the
 * lock descriptor and so cannot keep it after the row ends) with PB_LIVE_LOCK_HELD=1 and returns that run's exit status (77
 * and every other status pass through); the caller exits with it and launches nothing itself.
 */
export function reexecUnderLiveLock(self, args, { root = REPO_ROOT, env = process.env } = {}) {
    if (env.PB_LIVE_LOCK_HELD === '1') return null;
    const r = spawnSync('flock', ['-o', liveLockFile(root, env), process.execPath, self, ...args], { stdio: 'inherit', env: { ...env, PB_LIVE_LOCK_HELD: '1' } });
    if (r.error) throw new Error(`could not take the live lock with flock (${r.error.code ?? r.error.message}); install util-linux or run through scripts/verify-platform.sh`);
    return r.status ?? 1;
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
    const lockFile = liveLockFile(REPO_ROOT, env);
    // A second, non-blocking flock fails (status 1) exactly while another open file description holds the lock.
    const taken = spawnSync('flock', ['-n', lockFile, 'true']);
    return `${name}: lock-probe: held=${env.PB_LIVE_LOCK_HELD === '1' ? 1 : 0} locked=${taken.status === 1 ? 1 : 0}`;
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

/** The dialog titles of Orca's close-terminal confirmation, read from the pinned source: [] when orca/ is absent. */
export function closeDialogTitles(root = REPO_ROOT) {
    const text = read(join(root, ORCA_CLOSE_DIALOG_REL)) ?? '';
    return [...text.matchAll(/stop_(?:command|agent)_title',\s*'([^']+)'/g)].map((m) => m[1]);
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

/** The environment fixture git runs in: no global or system config; HOME a scratch folder, never the developer's. */
export function fixtureGitEnv(basePath, home) {
    return { PATH: basePath, HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
}

/** Arguments that keep a fixture commit free of signing and hooks, whatever the repository's own config says. */
export const FIXTURE_GIT_ARGS = ['-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];

/** A git runner for the scratch repository `repo`: git(...args) runs `git -C repo` under fixtureGitEnv. */
export function fixtureGit(repo, basePath, home = dirname(repo)) {
    return (...a) => execFileSync('git', ['-C', repo, ...FIXTURE_GIT_ARGS, ...a], { env: fixtureGitEnv(basePath, home), stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * The self-test's control for fixtureGit (no browser): a HOME whose .gitconfig demands signing with a program that does
 * not exist and names a hooks folder whose pre-commit hook records itself and fails. The raw invocation (that HOME, no
 * flags) must be hit by it (a commit that fails or a hook that ran: the detector), and fixtureGit must then commit
 * cleanly with no hook run. Resolves red reasons.
 */
export function fixtureGitVerdict(makeGit = fixtureGit) {
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
        const error = commitWith(makeGit(prepare('fixture'), path, home));
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

/** Whether the app under test (PB_BACKEND_MAIN, else this tree's) has orca-panes in its generated frontend: its document then holds Orca's listeners once the bundle boots. */
export function appWiresOrcaPanes(main = backendMain()) {
    const frontend = join(dirname(main), '..', '..', 'src-gen', 'frontend', 'index.js');
    return /@powerbrowser\/orca-panes\//.test(read(frontend) ?? '');
}

/**
 * What a paste control in the Theia frame may claim about Orca's document listeners (WINDOWS 62), decided from the frontend under
 * test: wired (the app names orca-panes), bundleBuilt (the pane bundle this tree serves exists), booted (the bundle booted in the
 * frame). 'covered': booted. 'not-wired': the app has no Orca listeners to cover. 'red': built but never booted (a blind control).
 * 'skip': wired but the bundle is not built, so Orca's listeners were not in the frame and the control did not cover them.
 */
export function listenerCoverage({ wired, bundleBuilt, booted }) {
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
                const cliEnv = { PATH: basePath, HOME: savedEnv.HOME ?? process.env.HOME ?? '', ORCA_USER_DATA: state.effectiveRoot, ORCA_USER_DATA_PATH: state.effectiveRoot };
                mkdirSync(repo, { recursive: true });
                writeFileSync(join(repo, 'README'), 'orca-tabs-live scratch repository\n');
                // The fixture's git sees no developer config: no signing, no hooks (harness-live-tabs-13). The Orca CLI keeps the real HOME above.
                const git = fixtureGit(repo, basePath, scratch);
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
