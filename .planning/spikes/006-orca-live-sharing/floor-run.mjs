#!/usr/bin/env node
// .planning/spikes/006-orca-live-sharing/floor-run.mjs
//
// Spike 006 (EXT-03, P61-06): the floor of live sharing, run without the owner.
// PB's own orcad (scripts/lib/orca-run.mjs, loopback, scrubbed environment) launches one
// Claude agent through Orca's CLI with --surface terminal in a throwaway repo. The session id
// is the jsonl under ~/.claude/projects/<encoded cwd> that holds this run's nonce marker. The
// agent is stopped through the CLI, then resumed with the argv Orca itself uses
// (orca/src/shared/agent-resume-argv.ts: claude --resume <id>) plus -p. PASS needs the resumed
// answer to contain the marker and the same jsonl to have grown.
//
// Cost: two model turns on this host's Claude login (one launch prompt, one resume prompt,
// one line each, no tool use asked). --dry-run stops before the launch and spends nothing.
//
// Evidence: results-floor.json holds ids, counts, commands and names. No transcript text is
// read beyond the marker match and none is written. Only the session directory that encodes
// this run's own cwd is opened; no other session is read.
//
// Usage: node .planning/spikes/006-orca-live-sharing/floor-run.mjs [--dry-run]
// Needs: orca/out/orcad/orcad.js and orca/out/cli/index.js (61-03-PLAN lane_brief Setup).

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    assertEnv, descendants, ensurePbNode, installOutputRedaction, orcaVersionFromPins, orcadEnv, redact,
    startOrcad, stopOrcad,
} from '../../../scripts/lib/orca-run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const ORCA_DIR = join(REPO_ROOT, 'orca');
const CLI = join(ORCA_DIR, 'out', 'cli', 'index.js');
const SCRATCH = join(REPO_ROOT, '.mozbuild', 'p61-03');
const PROFILE_REAL = join(SCRATCH, 'powerbrowser-orca');
// Short alias: orcad's Unix socket sits in the profile directory and sun_path is 108 bytes (60-EXT01-RECORD note 1).
const PROFILE = join(homedir(), '.cache', 'pb-p61-03-orca');
const ORCA_WORKSPACES = join(homedir(), 'orca', 'workspaces') + '/';
const RESULTS = join(HERE, 'results-floor.json');
const DRY = process.argv.includes('--dry-run');

const secrets = [];
installOutputRedaction(secrets);
const log = (m) => console.log(`floor-run: ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (p) => { try { return createHash('sha256').update(readFileSync(p)).digest('hex'); } catch { return null; } };

class StepError extends Error { constructor(step, msg) { super(msg); this.step = step; } }
let step = 'setup';
const fail = (msg) => { throw new StepError(step, msg); };

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
    if (r.error) fail(`${cmd} could not run: ${r.error.message}`);
    return r;
}

/** pid, ppid, cwd and argv of every process this user can read. */
function processes() {
    const out = [];
    for (const name of readdirSync('/proc')) {
        if (!/^\d+$/.test(name)) continue;
        try {
            const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
            const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
            const args = readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0').join(' ').trim();
            let cwd = null;
            try { cwd = readlinkSync(`/proc/${name}/cwd`); } catch { /* not ours */ }
            out.push({ pid: Number(name), ppid, args, cwd });
        } catch { /* the process exited */ }
    }
    return out;
}

const countLines = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).length;

async function main() {
    const nonce = randomBytes(4).toString('hex');
    const marker = `P61-MARKER-${nonce}`;
    const floorRepo = join(SCRATCH, `floor-${nonce}`);
    const result = { markerNonce: nonce, timings: {} };
    let orcad = null;
    let daemonPid = null;
    let createdWorktree = null;
    let verdict = null;
    let orcaEnv = null;
    let nodeBin = null;
    const laneProcs = () => processes().filter((p) => p.pid !== process.pid && p.args.includes(`${ORCA_DIR}/out/`));

    try {
        // (1) Environments. base: this lane's Claude session markers removed, HOME and PATH kept.
        // orcaEnv: base with every inherited ORCA_* removed, for orcad and every Orca CLI call.
        // plainEnv: base with every ORCA_* removed and none set, for the claude resume.
        step = 'environment';
        for (const f of ['out/orcad/orcad.js', 'out/cli/index.js']) {
            if (!existsSync(join(ORCA_DIR, f))) fail(`orca/${f} is missing; run the lane_brief Setup`);
        }
        const base = { ...process.env };
        const removed = [];
        for (const k of Object.keys(base)) {
            if ((k === 'CLAUDECODE' || k.startsWith('CLAUDE_')) && k !== 'CLAUDE_CONFIG_DIR') { delete base[k]; removed.push(k); }
        }
        const orcaVersion = orcaVersionFromPins(REPO_ROOT);
        rmSync(PROFILE_REAL, { recursive: true, force: true });
        mkdirSync(PROFILE_REAL, { recursive: true });
        mkdirSync(dirname(PROFILE), { recursive: true });
        rmSync(PROFILE, { force: true });
        symlinkSync(PROFILE_REAL, PROFILE);
        orcaEnv = orcadEnv(base, { profileDir: PROFILE, orcaVersion });
        const envFails = assertEnv(orcaEnv, { profileDir: PROFILE, orcaVersion });
        if (envFails.length) fail(envFails.join('; '));
        for (const k of Object.keys(base)) if (!(k in orcaEnv) || k.startsWith('ORCA_')) removed.push(k);
        const plainEnv = { ...base };
        for (const k of Object.keys(plainEnv)) if (k.startsWith('ORCA_')) delete plainEnv[k];
        result.removedEnvNames = [...new Set(removed)].sort();
        log(`removed ${result.removedEnvNames.length} inherited variable names from the run environments`);

        const version = run('claude', ['--version'], { env: plainEnv });
        result.claudeVersion = version.stdout.trim();
        const auth = run('claude', ['auth', 'status'], { env: plainEnv });
        if (!/"loggedIn":\s*true/.test(auth.stdout)) fail('claude auth status does not report loggedIn true');
        const settingsPath = join(homedir(), '.claude', 'settings.json');
        const settingsBefore = sha(settingsPath);

        // (2) orcad on PB's Node, loopback.
        step = 'orcad';
        const node = await ensurePbNode(REPO_ROOT);
        nodeBin = node.path;
        const t0 = Date.now();
        const started = await startOrcad({ nodeBin: node.path, orcaDir: ORCA_DIR, profileDir: PROFILE, env: orcaEnv });
        orcad = started.child;
        daemonPid = started.ready.daemonPid;
        secrets.push(...started.ready.secrets);
        result.timings.orcadReadyMs = Date.now() - t0;
        if (!/^ws:\/\/127\.0\.0\.1:\d+/.test(started.ready.boundEndpoint ?? '')) fail('orcad is not bound to a 127.0.0.1 ws endpoint');
        log(`orcad ready on loopback, Node ${started.ready.nodeVersion}`);

        const cli = (args, { allowFail = false } = {}) => {
            const r = run(node.path, [CLI, ...args, '--json'], { env: orcaEnv, cwd: floorRepo, timeout: 120000 });
            let json = null;
            try { json = JSON.parse(r.stdout); } catch { /* reported below */ }
            if ((r.status !== 0 || !json) && !allowFail) {
                fail(`orca ${args.slice(0, 2).join(' ')} exited ${r.status}: ${redact((r.stderr || r.stdout).trim().split('\n').pop() ?? '', secrets).slice(0, 300)}`);
            }
            return { ok: r.status === 0 && !!json, json };
        };

        // (3) Throwaway repo, registered with PB's orcad. Its own checkout is the workspace when the
        // selector resolves; otherwise an Orca worktree named with the nonce.
        step = 'repo';
        mkdirSync(floorRepo, { recursive: true });
        writeFileSync(join(floorRepo, 'README.md'), `spike 006 floor run ${nonce}\n`);
        for (const a of [['init', '-q', '-b', 'main'], ['add', 'README.md'],
            ['-c', 'user.name=spike-006', '-c', 'user.email=spike-006@localhost', 'commit', '-q', '-m', 'floor run']]) {
            const g = run('git', a, { cwd: floorRepo, env: plainEnv });
            if (g.status !== 0) fail(`git ${a[0]} failed: ${g.stderr.trim()}`);
        }
        const added = cli(['repo', 'add', '--path', floorRepo]);
        const repoId = added.json?.result?.repo?.id ?? added.json?.result?.id;
        let cwd = floorRepo;
        if (!cli(['worktree', 'show', '--worktree', `path:${floorRepo}`], { allowFail: true }).ok) {
            if (!repoId) fail('repo add returned no repo id and the checkout is not selectable');
            const made = cli(['worktree', 'create', '--name', `p61-${nonce}`, '--repo', `id:${repoId}`, '--no-parent']);
            cwd = made.json?.result?.worktree?.path;
            if (typeof cwd !== 'string') fail('worktree create returned no path');
            createdWorktree = cwd;
        }
        const selector = `path:${cwd}`;
        result.workspace = createdWorktree ? 'orca-worktree' : 'repo-checkout';
        log(`workspace ${result.workspace}`);
        if (DRY) { verdict = `PASS -- dry run: orcad, repo add and workspace selection work; no agent launched`; return; }

        // (4) Launch one agent, then find its session by the marker.
        step = 'launch';
        const launchPrompt = `Reply with only the token ${marker}.`;
        const launchArgs = ['agent', 'launch', '--agent', 'claude', '--surface', 'terminal', '--worktree', selector, '--prompt', launchPrompt];
        result.launchCommand = ['node', 'orca/out/cli/index.js', ...launchArgs, '--json'];
        const startMs = Date.now();
        const launched = cli(launchArgs);
        result.launchOutcomeKind = launched.json?.result?.launch?.outcome?.kind ?? launched.json?.result?.outcome?.kind ?? null;

        step = 'session-id';
        const sessionDir = join(homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
        let jsonl = null;
        let answered = false;
        while (Date.now() - startMs < 180000 && !answered) {
            await sleep(1500);
            if (!existsSync(sessionDir)) { if (Date.now() - startMs > 120000) break; continue; }
            for (const f of readdirSync(sessionDir).filter((n) => n.endsWith('.jsonl'))) {
                const p = join(sessionDir, f);
                if (statSync(p).mtimeMs < startMs - 1000) continue;
                const lines = readFileSync(p, 'utf8').split('\n').filter((l) => l.includes(marker));
                if (!lines.length) continue;
                jsonl = p;
                answered = lines.some((l) => l.includes('"type":"assistant"'));
            }
        }
        if (!jsonl) fail(`no session file holding the marker appeared under ~/.claude/projects/${sessionDir.split('/').pop()} within 120 s`);
        if (!answered) fail('the agent did not answer with the marker within 180 s');
        const sessionId = jsonl.split('/').pop().replace(/\.jsonl$/, '');
        if (!/^[0-9a-f-]{36}$/.test(sessionId)) fail('the session file name is not a UUID');
        result.sessionId = sessionId;
        result.sessionDirectory = sessionDir.split('/').pop();
        result.timings.launchToAnswerMs = Date.now() - startMs;
        await sleep(3000); // let the turn's trailing records land before the stop
        const listed = cli(['terminal', 'list', '--worktree', selector], { allowFail: true });
        result.sessionIdInTerminalList = JSON.stringify(listed.json ?? '').includes(sessionId);
        log(`session ${sessionId} answered with the marker; in terminal list: ${result.sessionIdInTerminalList}`);

        // (5) Stop the agent through the CLI and prove its process is gone.
        step = 'stop';
        const isAgent = (p) => p.args.includes(sessionId) || /(^|[\s/])claude(\s|$)/.test(p.args);
        const suspects = () => {
            const all = processes();
            const tree = descendants(all.map((p) => [p.pid, p.ppid]), [orcad.pid, daemonPid, ...laneProcs().map((p) => p.pid)]);
            return all.filter((p) => p.pid !== process.pid && (tree.has(p.pid) || p.cwd === cwd) && isAgent(p));
        };
        result.agentProcessesBeforeStop = suspects().length;
        cli(['terminal', 'close', '--worktree', selector, '--all']);
        const stopBy = Date.now() + 20000;
        while (Date.now() < stopBy && suspects().length) await sleep(500);
        result.agentProcessesAfterStop = suspects().length;
        if (result.agentProcessesAfterStop) fail(`${result.agentProcessesAfterStop} agent process(es) survived terminal close`);
        if (!result.agentProcessesBeforeStop) fail('no agent process was found before the stop, so the stop proves nothing');

        // (6) Resume with the argv Orca uses, non-interactive, on the plain environment.
        step = 'resume';
        result.jsonlLinesBefore = countLines(jsonl);
        const resumeArgs = ['--resume', sessionId, '-p', 'Repeat the token from my first message, nothing else.'];
        result.resumeCommand = ['claude', ...resumeArgs];
        const t1 = Date.now();
        const resumed = run('claude', resumeArgs, { cwd, env: plainEnv, timeout: 240000 });
        result.timings.resumeMs = Date.now() - t1;
        result.resumeExitCode = resumed.status;
        result.resumeOutputHasMarker = resumed.stdout.includes(marker);
        result.jsonlLinesAfter = countLines(jsonl);
        result.claudeSettingsChanged = sha(settingsPath) !== settingsBefore;
        if (!result.resumeOutputHasMarker) fail(`the resumed answer does not contain the marker (exit ${resumed.status})`);
        if (!(result.jsonlLinesAfter > result.jsonlLinesBefore)) fail('the session file did not grow on resume');
        verdict = `PASS -- session ${sessionId} stopped, resumed with claude --resume, marker echoed, jsonl ${result.jsonlLinesBefore} -> ${result.jsonlLinesAfter} lines`;
    } catch (e) {
        verdict = `FAIL -- step ${e.step ?? step}: ${redact(e.message, secrets)}`;
    } finally {
        // (8) Reap, then remove only what this run made.
        if (orcad) {
            if (createdWorktree) {
                spawnSync(nodeBin, [CLI, 'worktree', 'rm', '--worktree', `path:${createdWorktree}`, '--force', '--delete-branch', '--json'],
                    { env: orcaEnv, cwd: REPO_ROOT, timeout: 60000 });
            }
            const daemons = laneProcs().map((p) => p.pid).filter((p) => p !== orcad.pid);
            const { survivors } = await stopOrcad(orcad, daemonPid);
            for (const pid of daemons) { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
            await sleep(1500);
            for (const p of laneProcs()) { try { process.kill(p.pid, 'SIGKILL'); } catch { /* gone */ } }
            await sleep(300);
            const left = laneProcs().length;
            if ((survivors.length || left) && verdict?.startsWith('PASS')) verdict = `FAIL -- step cleanup: ${survivors.length + left} orcad or daemon process(es) survived`;
        }
        if (createdWorktree && createdWorktree.startsWith(ORCA_WORKSPACES) && createdWorktree.includes(nonce)) {
            rmSync(createdWorktree, { recursive: true, force: true });
        }
        if (floorRepo.startsWith(SCRATCH + '/') && floorRepo.includes(nonce)) rmSync(floorRepo, { recursive: true, force: true });
        if (!DRY && result.sessionId) {
            // Fixed key set: ids, counts, commands and names only (T-61-12).
            writeFileSync(RESULTS, JSON.stringify(result, null, 2) + '\n');
            log(`session directory left in place: ~/.claude/projects/${result.sessionDirectory}`);
        }
        // Printed from finally so the dry run's early return reaches it too.
        console.log(`floor-run: ${verdict}`);
        process.exitCode = verdict.startsWith('PASS') ? 0 : 1;
    }
}

main();
