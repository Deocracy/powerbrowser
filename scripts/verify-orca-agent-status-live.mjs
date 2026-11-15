#!/usr/bin/env node
// scripts/verify-orca-agent-status-live.mjs
//
// Phase 63 (TERM-02 criterion 2 on a real agent; the bridge-directory half of
// EXT-02; P63-17, P63-16, P63-26, P63-37, P63-38; D-07, D-31; spike 006
// findings 5 and 7): in a launched PowerBrowser, a real claude started through
// Orca's own CLI in an Orca terminal on Orca's own engine reports working,
// waiting and done, and ends when PowerBrowser quits.
//
// One launch of a fresh profile, headless:
//   - OrcaService.getState() reaches ready; TheiaService.getState() names the
//     Theia backend pid.
//   - Bridge directory (D-31, P63-35), from getState().bridgeDir:
//     orcad-data-root is a regular 0600 file whose one line equals
//     ORCA_USER_DATA in /proc/<orcad>/environ; claude-wrapper is 0700 and names
//     an existing wrapper file and that directory.
//   - Agent: agent launch --agent claude --surface terminal --worktree
//     path:<scratch repo> with ONE prompt. terminal.agentStatus is polled every
//     250 ms for up to 180 s (readAgentStatus, imported from
//     verify-orca-agent-hooks.mjs, which starts nothing on import). working and
//     then done are required. When deriveClaudeHookEvents (the derivation
//     orca-agent-hooks' stage A uses) names the event Orca maps to waiting,
//     waiting is required too. An idle Claude session emits no event Orca maps
//     to waiting (claude-events.ts maps PermissionRequest, Elicitation and
//     AskUserQuestion), so the prompt asks claude to ask one AskUserQuestion
//     question, the check answers it with one Enter through terminal send, and
//     claude then replies: one prompt, at most two model turns. Only when the
//     derivation names no waiting event is "waiting not derivable" a note (and
//     orca-agent-hooks is red "source moved" as well).
//   - The agent's PTY (a process whose argv names claude) must descend from the
//     terminal daemon getState() reports and not from the Theia backend (D-31).
//   - Claude session records for the repository's encoded path under
//     ~/.claude/projects are counted before and after; growth is required,
//     compared with the before count, never with a constant. The session id
//     (the newest session file's name) is a note (P63-16).
//   - Quit (D-07, P63-37): the agent process and the terminal daemon are
//     recorded (pid plus start ticks) before app.quit(); both must be gone
//     within 25 s after it, before any cleanup signal, else "survived quit".
//
// Model budget: one prompt on the owner's login, never more than two model
// turns. Signals: only recorded identities. The Orca CLI environment is built
// from scratch (PATH, HOME, the data root); this shell's ORCA_* names never
// reach Orca. MOZ_PURGE_CACHES=1 is set by the script.
//
// Run under the live lock, headless only:
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-orca-agent-status-live.mjs
//
// SKIP (exit 0, last line "orca-agent-status-live: SKIP -- <cause>"): no built
// PowerBrowser, no built orca/, or no claude on PATH. A passing run's last line
// starts "orca-agent-status-live: PASS -- " (63-04 reads it for TERM-02).
//
// Tier: full. --self-test is quick and pure: the verdicts over fixtures.
//
// Usage:
//   node scripts/verify-orca-agent-status-live.mjs
//   node scripts/verify-orca-agent-status-live.mjs --self-test

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as OrcaEnv from '../powerbrowser/shell/OrcaEnv.sys.mjs';
import { descendants, ensurePbNode, installOutputRedaction } from './lib/orca-run.mjs';
import { freePort, ppidMap, signalIdentity, startTicks } from './verify-orca-hidden-electron.mjs';
import { deriveClaudeHookEvents, deriveStatusMap, readAgentStatus, scrubOwnOrcaEnv } from './verify-orca-agent-hooks.mjs';
import { liveEnv, liveHome, seedClaudeLogin } from './lib/firefox-bidi.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-agent-status-live';
const SELF_REL = 'scripts/verify-orca-agent-status-live.mjs';
const WORK_REL = '.mozbuild/orca-agent-status-live';
const SERVICE_URL = 'chrome://powerbrowser/content/OrcaService.sys.mjs';
const THEIA_URL = 'chrome://powerbrowser/content/TheiaService.sys.mjs';
export const PROMPT_CAP = 2;
const POLL_MS = 250;
const STATUS_WINDOW_MS = 180000;
const WAITING_HOLD_MS = 90000;
const QUIT_BUDGET_MS = 25000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };
const oct = (mode) => (mode & 0o777).toString(8).padStart(4, '0');

// --- pure verdicts (the self-test's subject) ---------------------------------

/**
 * obs: { dataRootFile: { isFile, mode, content } | null, orcadUserData, launcher: { mode, text } | null,
 * wrapperExists, bridgeDir }.
 */
export function bridgeVerdict(obs) {
    if (!obs.bridgeDir) return ['bridge folder not available: OrcaService.getState().bridgeDir is empty'];
    const fails = [];
    const f = obs.dataRootFile;
    if (!f?.isFile) fails.push('orcad-data-root missing or not a regular file in the bridge folder');
    else {
        if ((f.mode & 0o777) !== 0o600) fails.push(`orcad-data-root mode ${oct(f.mode)}, not 0600`);
        if (f.content !== `${obs.orcadUserData}\n`) fails.push('orcad-data-root content differs from ORCA_USER_DATA in orcad\'s environment');
    }
    const l = obs.launcher;
    if (!l) fails.push('launcher missing: no claude-wrapper in the bridge folder (is orca-agents wired into the app?)');
    else {
        if ((l.mode & 0o777) !== 0o700) fails.push(`launcher mode ${oct(l.mode)}, not 0700`);
        if (!obs.wrapperExists) fails.push('the launcher names a wrapper file that does not exist');
        if (!l.text.includes(`--bridge-dir '${obs.bridgeDir.split("'").join(`'\\''`)}'`)) fails.push('the launcher does not name the bridge folder');
    }
    return fails;
}

/**
 * obs: { sequence: [statuses in order of change], statusMap: { working, waiting, done }, derivedWaitingEvent,
 * waitingNotDerivable, promptsSent, recordsBefore, recordsAfter }.
 */
export function agentVerdict(obs) {
    const fails = [];
    const m = obs.statusMap;
    const at = (s) => obs.sequence.indexOf(s);
    const iW = at(m.working);
    const iD = iW >= 0 ? obs.sequence.indexOf(m.done, iW) : -1;
    if (iW < 0) fails.push(`no working: the agent's status never read ${m.working} (read ${obs.sequence.join(' -> ') || 'nothing'})`);
    else if (iD < 0) fails.push(at(m.done) >= 0 ? `done before working: ${m.done} was read only before ${m.working}` : `no done: the agent's status never read ${m.done} after ${m.working}`);
    if (obs.derivedWaitingEvent) {
        if (obs.waitingNotDerivable) fails.push(`"waiting not derivable" was recorded although the derivation names ${obs.derivedWaitingEvent} as the event Orca maps to waiting`);
        else if (iW < 0 || obs.sequence.indexOf(m.waiting, iW) < 0) fails.push(`waiting required but absent: the derivation names ${obs.derivedWaitingEvent}, and ${m.waiting} was never read after ${m.working}`);
    }
    if (obs.promptsSent > PROMPT_CAP) fails.push(`model-turn cap exceeded: ${obs.promptsSent} prompts sent (the cap is ${PROMPT_CAP})`);
    if (!(obs.recordsAfter > obs.recordsBefore)) fails.push(`vacuous: Claude's session records for the repository did not grow (${obs.recordsBefore} before, ${obs.recordsAfter} after)`);
    return fails;
}

/** obs: { agentPid, ancestors: [pids from the agent up], daemonPid, theiaPid }. */
export function engineVerdict(obs) {
    if (!obs.agentPid) return ['no agent process: no process whose argv names claude was found under orcad or its terminal daemon'];
    const fails = [];
    if (obs.theiaPid && obs.ancestors.includes(obs.theiaPid)) fails.push(`the agent PTY descends from the Theia backend (pid ${obs.theiaPid}), not Orca's terminal daemon (D-31)`);
    else if (!obs.daemonPid || !obs.ancestors.includes(obs.daemonPid)) fails.push(`the agent PTY does not descend from the terminal daemon OrcaService reports (pid ${obs.daemonPid})`);
    return fails;
}

/** recorded: [{ pid, ticks, what }]; alive: Map pid -> ticks after the quit window. */
export function quitVerdict(recorded, alive) {
    if (!recorded.length) return ['vacuous: no agent or terminal daemon was recorded before the quit'];
    return recorded.filter((r) => alive.get(r.pid) === r.ticks).map((r) => `survived quit: the ${r.what} (pid ${r.pid}) was still alive ${QUIT_BUDGET_MS / 1000} s after app.quit()`);
}

// --- observations ----------------------------------------------------------------

const encodedProjectDir = (cwd) => join(liveHome(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
/** { files, records, newest }: the session files and their line count for `cwd`; never reads beyond counting. */
function sessionRecords(cwd) {
    const dir = encodedProjectDir(cwd);
    if (!existsSync(dir)) return { files: 0, records: 0, newest: null };
    let records = 0;
    let newest = null;
    const files = readdirSync(dir).filter((n) => n.endsWith('.jsonl'));
    for (const f of files) {
        const p = join(dir, f);
        records += (read(p) ?? '').split('\n').filter(Boolean).length;
        const t = lstatSync(p).mtimeMs;
        if (!newest || t > newest.t) newest = { t, id: f.replace(/\.jsonl$/, '') };
    }
    return { files: files.length, records, newest: newest?.id ?? null };
}

function environOf(pid) {
    const env = {};
    for (const entry of (read(`/proc/${pid}/environ`) ?? '').split('\0')) {
        const eq = entry.indexOf('=');
        if (eq > 0) env[entry.slice(0, eq)] = entry.slice(eq + 1);
    }
    return env;
}
const argvOf = (pid) => (read(`/proc/${pid}/cmdline`) ?? '').split('\0').filter(Boolean);
const isClaude = (pid) => argvOf(pid).slice(0, 2).some((a) => /(^|\/)claude$/.test(a));
function ancestorsOf(pid, map = ppidMap()) {
    const out = [];
    for (let p = map.get(pid); p && p > 1 && out.length < 64; p = map.get(p)) out.push(p);
    return out;
}
function fileObs(path) {
    try { const st = lstatSync(path); return { isFile: st.isFile(), mode: st.mode, content: read(path) ?? '', text: read(path) ?? '' }; } catch { return null; }
}
const onPath = (bin) => (process.env.PATH ?? '').split(delimiter).some((d) => d && existsSync(join(d, bin)));

// --- live run ----------------------------------------------------------------

async function chromeJson(app, expr) {
    const text = await app.evaluateIn(app.chrome, `(() => { try { return JSON.stringify(${expr}); } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`);
    return JSON.parse(text);
}

async function live() {
    const { FIREFOX_BIN } = await import('./lib/firefox-bidi.mjs');
    const orcaDir = join(REPO_ROOT, 'orca');
    if (!existsSync(FIREFOX_BIN)) return { skip: `no built PowerBrowser (${FIREFOX_BIN} missing; see docs/BUILD.md "Firefox half")` };
    if (!existsSync(join(orcaDir, 'out', 'orcad', 'orcad.js'))) return { skip: 'no built orca/ (orca/out/orcad/orcad.js missing; run: nix develop .#orca --command bash scripts/build-orca.sh)' };
    if (!onPath('claude')) return { skip: 'claude is not on PATH (the real-agent stage needs the owner\'s claude login)' };
    if (process.env.PB_LIVE_HEADED === '1' || process.env.PB_REAL_INPUT === '1') return { fails: ['this row runs headless only; unset PB_LIVE_HEADED and PB_REAL_INPUT'] };
    const { makeProfile, pollFor, withShell } = await import('./lib/pb-relaunch.mjs');

    scrubOwnOrcaEnv();
    process.env.MOZ_PURGE_CACHES = '1';
    const ev = deriveClaudeHookEvents(orcaDir);
    const sm = deriveStatusMap(orcaDir);
    if (sm.fails.length || !ev.events.working || !ev.events.done) return { fails: [...sm.fails, ...ev.fails] };
    const derivedWaitingEvent = ev.events.waiting;

    const node = await ensurePbNode();
    const port = await freePort(OrcaEnv);
    const profile = await makeProfile({ 'powerbrowser.sidecar.nodePath': node.path, 'powerbrowser.orca.port': port, 'powerbrowser.orca.root': orcaDir });
    const work = join(REPO_ROOT, WORK_REL);
    const repo = join(work, 'repo'); // a fixed path, so Claude's folder trust carries across runs
    const fails = [];
    const notes = [];
    const recordedForQuit = [];
    const cleanup = new Map();
    const record = (pid) => { const t = Number.isInteger(pid) ? startTicks(pid) : null; if (t !== null) cleanup.set(pid, t); return t; };
    let handle = null;
    let cli = null;
    let promptsSent = 0;
    try {
        mkdirSync(work, { recursive: true });
        if (!existsSync(join(repo, '.git'))) {
            rmSync(repo, { recursive: true, force: true });
            mkdirSync(repo, { recursive: true });
            writeFileSync(join(repo, 'README'), 'orca-agent-status-live scratch repository\n');
            const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', ...a], { env: { PATH: process.env.PATH ?? '', HOME: homedir() }, stdio: 'ignore' });
            git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', 'fixture');
        }
        let quitResult = null;
        seedClaudeLogin(); // the real claude runs under the scratch HOME orcad inherits
        await withShell(profile, async (app) => {
            const state = await pollFor(async () => { const s = await chromeJson(app, `ChromeUtils.importESModule(${JSON.stringify(SERVICE_URL)}).OrcaService.getState()`); return s.state === 'ready' ? s : null; }, 90000, 'OrcaService to reach ready');
            const theia = await chromeJson(app, `ChromeUtils.importESModule(${JSON.stringify(THEIA_URL)}).TheiaService.getState()`);
            record(state.pid);
            record(state.daemonPid);
            const orcadEnv = environOf(state.pid);
            const dataRoot = orcadEnv.ORCA_USER_DATA;

            // Bridge directory.
            const bridgeDir = state.bridgeDir ?? null;
            const launcher = bridgeDir ? fileObs(join(bridgeDir, 'claude-wrapper')) : null;
            const wrapperPath = /^exec '(?:[^']|'\\'')*' '((?:[^']|'\\'')*)'/m.exec(launcher?.text ?? '')?.[1]?.split(`'\\''`).join("'");
            fails.push(...bridgeVerdict({ bridgeDir, dataRootFile: bridgeDir ? fileObs(join(bridgeDir, 'orcad-data-root')) : null, orcadUserData: dataRoot, launcher, wrapperExists: Boolean(wrapperPath && existsSync(wrapperPath)) }));

            // Agent.
            const env = { PATH: process.env.PATH ?? '', HOME: homedir(), ORCA_USER_DATA: dataRoot, ORCA_USER_DATA_PATH: dataRoot };
            cli = (args) => JSON.parse(execFileSync(join(dataRoot, 'cli', 'bin', 'orca'), [...args, '--json'], { env: liveEnv(env), cwd: repo, timeout: 60000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))?.result;
            cli(['repo', 'add', '--path', repo]);
            const list = () => cli(['terminal', 'list'])?.terminals ?? [];
            const before = new Set(list().map((t) => t.handle));
            const recordsBefore = sessionRecords(repo).records;
            const marker = `pbmarker${Date.now().toString(36)}`;
            const prompt = derivedWaitingEvent
                ? `Use the AskUserQuestion tool once to ask me to choose red or blue. After I answer, reply with only the word ${marker}.`
                : `Reply with only the word ${marker}.`;
            cli(['agent', 'launch', '--agent', 'claude', '--surface', 'terminal', '--worktree', `path:${repo}`, '--prompt', prompt]);
            promptsSent++;
            handle = (await pollFor(async () => list().find((t) => !before.has(t.handle) && t.worktreePath === repo), 30000, 'the agent terminal'))?.handle;

            const sequence = [];
            let answered = false;
            let workingAt = null;
            const deadline = Date.now() + STATUS_WINDOW_MS;
            while (Date.now() < deadline) {
                const st = (await readAgentStatus(orcaDir, dataRoot, handle))?.status ?? null;
                if (st && st !== sequence[sequence.length - 1]) sequence.push(st);
                if (st === sm.map.working && workingAt === null) workingAt = Date.now();
                if (derivedWaitingEvent && st === sm.map.waiting && !answered) {
                    execFileSync(join(dataRoot, 'cli', 'bin', 'orca'), ['terminal', 'send', '--terminal', handle, '--text', '\r', '--json'], { env: liveEnv(env), timeout: 30000, stdio: 'ignore' });
                    answered = true; // an answer, not a prompt: the reply is the second model turn
                }
                const waitingDone = !derivedWaitingEvent || answered || (workingAt !== null && Date.now() - workingAt > WAITING_HOLD_MS);
                if (workingAt !== null && waitingDone && sequence.indexOf(sm.map.done, sequence.indexOf(sm.map.working)) >= 0) break;
                await sleep(POLL_MS);
            }
            await sleep(3000); // the turn's trailing records
            const after = sessionRecords(repo);
            fails.push(...agentVerdict({ sequence, statusMap: sm.map, derivedWaitingEvent, waitingNotDerivable: !derivedWaitingEvent, promptsSent, recordsBefore, recordsAfter: after.records }));
            if (!derivedWaitingEvent) notes.push('waiting not derivable: the derivation names no Claude event Orca maps to waiting (orca-agent-hooks is red "source moved")');
            notes.push(`status sequence: ${sequence.join(' -> ') || 'none'}; session records ${recordsBefore} -> ${after.records}`);
            notes.push(`session id (P63-16): ${after.newest ? `the newest session file names ${after.newest}` : 'no session file'}; resume comes from Claude's side`);

            // Engine.
            const map = ppidMap();
            const agentPid = [...descendants(map, [state.pid, state.daemonPid])].find(isClaude) ?? null;
            fails.push(...engineVerdict({ agentPid, ancestors: agentPid ? ancestorsOf(agentPid, map) : [], daemonPid: state.daemonPid, theiaPid: theia.pid }));

            // Quit with the agent alive.
            for (const [pid, what] of [[agentPid, 'agent process'], [state.daemonPid, 'terminal daemon']]) {
                const ticks = record(pid);
                if (ticks !== null) recordedForQuit.push({ pid, ticks, what });
            }
            quitResult = await app.quit();
        });
        if (quitResult !== 'exited') fails.push(`app.quit() returned '${quitResult}', not exited`);
        const until = Date.now() + QUIT_BUDGET_MS;
        let alive = new Map();
        do {
            alive = new Map(recordedForQuit.map((r) => [r.pid, startTicks(r.pid)]));
            if (!recordedForQuit.some((r) => alive.get(r.pid) === r.ticks)) break;
            await sleep(250);
        } while (Date.now() < until);
        handle = null; // the quit ended the terminal; nothing to close
        fails.push(...quitVerdict(recordedForQuit, alive));
    } catch (e) {
        fails.push(OrcaEnv.redact(String(e?.message ?? e)));
    } finally {
        if (handle && cli) { try { cli(['terminal', 'close', '--terminal', handle]); } catch { /* the kill below */ } }
        const tree = [...descendants(ppidMap(), [...cleanup.keys()])];
        for (const pid of tree) if (!cleanup.has(pid)) cleanup.set(pid, startTicks(pid));
        for (const [pid, ticks] of cleanup) signalIdentity(pid, ticks, 'SIGKILL');
        await profile.dispose();
        rmSync(repo, { recursive: true, force: true });
    }
    return fails.length ? { fails, notes } : { pass: true, notes, promptsSent };
}

// --- self-test -------------------------------------------------------------------

function control() {
    const bridgeDir = '/run/user/1000/pb-bridge-x';
    return {
        bridge: { bridgeDir, dataRootFile: { isFile: true, mode: 0o100600, content: '/run/user/1000/pb-orca-x\n' }, orcadUserData: '/run/user/1000/pb-orca-x',
            launcher: { mode: 0o100700, text: `#!/bin/sh\nexec '/n' '/w.mjs' --bridge-dir '${bridgeDir}' "$@"\n` }, wrapperExists: true },
        agent: { sequence: ['working', 'permission', 'working', 'idle'], statusMap: { working: 'working', waiting: 'permission', done: 'idle' },
            derivedWaitingEvent: 'PermissionRequest', waitingNotDerivable: false, promptsSent: 1, recordsBefore: 4, recordsAfter: 31 },
        engine: { agentPid: 300, ancestors: [299, 200, 100, 1], daemonPid: 200, theiaPid: 150 },
        quit: { recorded: [{ pid: 300, ticks: '9', what: 'agent process' }, { pid: 200, ticks: '8', what: 'terminal daemon' }], alive: new Map([[300, null], [200, null]]) },
    };
}
const verdicts = (o) => [...bridgeVerdict(o.bridge), ...agentVerdict(o.agent), ...engineVerdict(o.engine), ...quitVerdict(o.quit.recorded, o.quit.alive)];

const PLANTS = [
    ['no working', (o) => { o.agent.sequence = ['idle']; }],
    ['no done', (o) => { o.agent.sequence = ['working', 'permission']; }],
    ['done before working', (o) => { o.agent.sequence = ['idle', 'working', 'permission']; }],
    ['waiting required but absent', (o) => { o.agent.sequence = ['working', 'idle']; }],
    ['vacuous', (o) => { o.agent.recordsAfter = o.agent.recordsBefore; }],
    ['model-turn cap exceeded', (o) => { o.agent.promptsSent = 3; }],
    ['descends from the Theia backend', (o) => { o.engine.ancestors = [150, 1]; }],
    ['survived quit', (o) => { o.quit.alive.set(300, '9'); }],
    ['orcad-data-root mode 0644', (o) => { o.bridge.dataRootFile.mode = 0o100644; }],
    ['orcad-data-root content differs', (o) => { o.bridge.dataRootFile.content = '/elsewhere\n'; }],
    ['launcher missing', (o) => { o.bridge.launcher = null; }],
    ['launcher mode 0644', (o) => { o.bridge.launcher.mode = 0o100644; }],
    ['"waiting not derivable" was recorded although', (o) => { o.agent.waitingNotDerivable = true; }],
];

function selfTest() {
    const lines = [];
    let failures = 0;
    const c = verdicts(control());
    if (c.length) { failures++; lines.push(`  FAIL control went red: ${c.join(' | ')}`); } else lines.push('  ok control: fixture observations green');
    const nd = control();
    nd.agent.derivedWaitingEvent = null; nd.agent.waitingNotDerivable = true; nd.agent.sequence = ['working', 'idle'];
    const ndf = verdicts(nd);
    if (ndf.length) { failures++; lines.push(`  FAIL control (no waiting event derivable, a note only) went red: ${ndf.join(' | ')}`); } else lines.push('  ok control: no derivable waiting event is a note, not red');
    for (const [needle, plant] of PLANTS) {
        const o = control();
        plant(o);
        const f = verdicts(o);
        if (f.some((x) => x.includes(needle))) lines.push(`  ok plant: ${needle}`);
        else { failures++; lines.push(`  FAIL plant: ${needle}: stayed green or did not name it (${f.join(' | ') || 'no fails'})`); }
    }
    return { lines, failures, planted: PLANTS.length };
}

// --- entry -----------------------------------------------------------------------

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args[0] === '--self-test' && args.length === 1) {
        const { lines, failures, planted } = selfTest();
        for (const l of lines) console.log(l);
        if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); process.exit(1); }
        console.log(`${NAME} self-test: PASS -- ${planted} planted faults each went red naming the drift`);
        process.exit(0);
    }
    if (args.length) {
        console.error(`${NAME}: FAIL -- unknown argument '${args[0]}' (usage: node ${SELF_REL} [--self-test])`);
        process.exit(2);
    }
    const restore = installOutputRedaction([]);
    let code = 0;
    try {
        const r = await live();
        for (const n of r.notes ?? []) console.log(`${NAME}: note -- ${n}`);
        if (r.skip) console.log(`${NAME}: SKIP -- ${r.skip}`);
        else if (r.fails) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); code = 1; }
        else console.log(`${NAME}: PASS -- a real claude in an Orca terminal under Orca's terminal daemon read working, waiting and done through Orca's hooks with ${r.promptsSent} prompt; session records grew; the bridge folder holds orcad-data-root (0600, orcad's data root) and the claude-wrapper launcher (0700); the agent and the terminal daemon ended on quit`);
    } catch (e) {
        console.error(`${NAME}: FAIL -- ${OrcaEnv.redact(String(e?.message ?? e))}`);
        code = 1;
    } finally {
        restore();
    }
    process.exit(code);
}
