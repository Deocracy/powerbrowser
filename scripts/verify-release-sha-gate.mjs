#!/usr/bin/env node
// scripts/verify-release-sha-gate.mjs
//
// The release SHA gate (Phase 50, TRAIN-10 third sentence, RESEARCH finding 1). release.yml
// refuses any dispatched SHA that is neither the tip of main nor a configuration.toml-changing
// ancestor of main whose .github/workflows/ tree equals main's, before any build or sign step.
//
// The gate is bash inside release.yml. This row does not copy it into JavaScript: it reads the
// step's run text from the workflow with js-yaml and executes that exact text against scratch
// git repositories (mkdtemp, a local bare origin, no network). So a change to the shipped gate
// is what the scenarios test.
//
// Default mode (the registry row release-sha-gate): the gate text in build-linux and sign-publish
// must be identical, and the controls must pass (tip, and a configuration.toml ancestor with
// main's workflows). --self-test (release-sha-gate-self-test): plants one fault per branch, each
// required to go red naming the SHA, the file or the directory it refuses. Writes nothing outside
// mkdtemp. Honestly --quick: local git only; no build, browser, display or network.
//
// Usage:
//   node scripts/verify-release-sha-gate.mjs
//   node scripts/verify-release-sha-gate.mjs --self-test

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadYaml, stepsOf } from './lib/release-workflow.mjs';

const NAME = 'verify-release-sha-gate';
const SELF_REL = 'scripts/verify-release-sha-gate.mjs';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_REL = '.github/workflows/release.yml';
const GATE_PREFIX = 'Validate the release SHA';
const GATE_JOBS = ['build-linux', 'sign-publish'];
const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
if (args.length > 0 && !SELF_TEST) {
    console.error(`${NAME}: FAIL -- unknown argument '${args[0]}'. Next step: run with no argument, or with --self-test.`);
    process.exit(2);
}

/** The run text of the shipped gate step in one job, or null when the job carries none. */
function gateText(wf, jobId) {
    const step = stepsOf(wf.jobs?.[jobId]).find(s => typeof s.name === 'string' && s.name.startsWith(GATE_PREFIX));
    return step === undefined ? null : String(step.run ?? '');
}

function git(cwd, argv) {
    const r = spawnSync('git', ['-c', 'user.name=gate-fixture', '-c', 'user.email=gate-fixture@example.invalid', '-c', 'commit.gpgsign=false', ...argv], { cwd, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${argv.join(' ')} failed in a fixture: ${r.stderr}`);
    return r.stdout.trim();
}

/** Run the shipped gate text in the work tree with RELEASE_SHA set. Returns { code, out }. */
function runGate(work, text, sha) {
    const out = join(work, '.gate-output');
    writeFileSync(out, '');
    const r = spawnSync('bash', ['-c', text], {
        cwd: work,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: work, RELEASE_SHA: sha, GITHUB_OUTPUT: out },
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/**
 * A scratch repository with a bare origin whose main history is:
 *   A  configuration.toml v1, workflows v1
 *   N  README only                      (an ancestor that does not change configuration.toml)
 *   B  configuration.toml v2, workflows v1 (the bump; workflows unchanged to the tip)
 *   T  README only                      (the tip of main)
 * plus a side commit S that is never on main. The workflow-divergent variant appends W, which
 * changes .github/workflows/ after B, so B's workflows tree no longer equals the tip's.
 */
function scratchRepo({ divergent = false } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'release-sha-gate-'));
    const origin = join(root, 'origin.git');
    const work = join(root, 'work');
    git(root, ['init', '-q', '--bare', origin]);
    mkdirSync(work);
    git(work, ['init', '-q', '-b', 'main']);
    git(work, ['remote', 'add', 'origin', origin]);
    const put = (path, text) => {
        mkdirSync(dirname(join(work, path)), { recursive: true });
        writeFileSync(join(work, path), text);
    };
    const commit = (msg) => { git(work, ['add', '-A']); git(work, ['commit', '-q', '--allow-empty', '-m', msg]); return git(work, ['rev-parse', 'HEAD']); };
    put('configuration.toml', 'version = 1\n');
    put('.github/workflows/release.yml', 'name: Release v1\n');
    const A = commit('A: configuration v1, workflows v1');
    put('README.md', 'n\n');
    const N = commit('N: README only');
    put('configuration.toml', 'version = 2\n');
    const B = commit('B: configuration v2, workflows v1');
    put('README.md', 't\n');
    let T = commit('T: README only');
    if (divergent) {
        put('.github/workflows/release.yml', 'name: Release v2\n');
        T = commit('W: workflows v2 moves the tip');
    }
    git(work, ['push', '-q', 'origin', 'main']);
    git(work, ['checkout', '-q', '-b', 'side', N]);
    put('side.txt', 's\n');
    const S = commit('S: never on main');
    git(work, ['checkout', '-q', '--detach', T]);
    return { root, work, A, N, B, T, S, divergent };
}

function checkout(repo, sha) {
    git(repo.work, ['checkout', '-q', '--detach', sha]);
}

function cleanup(repo) {
    rmSync(repo.root, { recursive: true, force: true });
}

/** Scenario verdicts: { code, out } for one SHA in one scratch repository. */
function scenario(repo, text, sha, headSha = sha) {
    checkout(repo, headSha);
    return runGate(repo.work, text, sha);
}

const wf = loadYaml().load(readFileSync(join(REPO_ROOT, RELEASE_REL), 'utf8'));
const texts = Object.fromEntries(GATE_JOBS.map(j => [j, gateText(wf, j)]));

function defaultMode() {
    let failed = 0;
    for (const job of GATE_JOBS) {
        if (texts[job] === null || texts[job].trim() === '') {
            console.error(`${NAME}: FAIL -- ${RELEASE_REL} job ${job} carries no step named '${GATE_PREFIX}...'. Next step: restore the gate step.`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    if (texts['build-linux'] !== texts['sign-publish']) {
        console.error(`${NAME}: FAIL -- the SHA gate text in build-linux and sign-publish differs. Next step: make the two identical; the sign-publish gate re-checks the same dispatched SHA.`);
        return 1;
    }
    const repo = scratchRepo();
    try {
        const tip = scenario(repo, texts['build-linux'], repo.T);
        const ancestor = scenario(repo, texts['build-linux'], repo.B);
        const green = [['the tip of main', tip], ['a configuration.toml ancestor with main workflows', ancestor]];
        for (const [label, r] of green) {
            if (r.code !== 0) { console.error(`${NAME}: FAIL -- control ${label} went red (exit ${r.code}): ${r.out.trim()}`); failed += 1; }
            else console.log(`  ok  control: ${label} -> green`);
        }
    } finally {
        cleanup(repo);
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: PASS -- the gate text is identical in build-linux and sign-publish, and the controls stay green`);
    return 0;
}

function selfTest() {
    let failed = 0;
    const text = texts['build-linux'];
    const plant = (name, run, needles) => {
        const { code, out } = run();
        const missing = needles.filter(n => !out.includes(n));
        if (code === 0) { console.error(`${NAME}: --self-test FAIL -- '${name}' was accepted (exit 0)`); failed += 1; return; }
        if (missing.length > 0) { console.error(`${NAME}: --self-test FAIL -- '${name}' went red but did not name ${missing.map(m => JSON.stringify(m)).join(', ')}: ${out.trim()}`); failed += 1; return; }
        if (!out.includes('Next step:')) { console.error(`${NAME}: --self-test FAIL -- '${name}' went red without a next step: ${out.trim()}`); failed += 1; return; }
        console.log(`  ok  ${name} -> red, naming ${needles.map(n => JSON.stringify(n)).join(', ')}`);
    };
    const control = (name, run) => {
        const { code, out } = run();
        if (code !== 0) { console.error(`${NAME}: --self-test FAIL -- control '${name}' went red (exit ${code}): ${out.trim()}`); failed += 1; return; }
        console.log(`  ok  ${name} -> green`);
    };

    const repo = scratchRepo();
    const divergent = scratchRepo({ divergent: true });
    try {
        control('control: the tip of main is accepted', () => scenario(repo, text, repo.T));
        control('control: a configuration.toml ancestor with main workflows is accepted', () => scenario(repo, text, repo.B));
        plant('a side commit that is not on main', () => scenario(repo, text, repo.S), [repo.S, 'is not on main']);
        plant('an ancestor that does not change configuration.toml', () => scenario(repo, text, repo.N), ['configuration.toml']);
        plant('an ancestor whose .github/workflows/ diverges from the tip', () => scenario(divergent, text, divergent.B), ['.github/workflows/']);
        plant('a checked-out HEAD that is not the requested SHA', () => scenario(repo, text, repo.B, repo.T), ['is not the requested']);
    } finally {
        cleanup(repo);
        cleanup(divergent);
    }
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- four planted faults went red naming their drift, and two controls stayed green`);
    return 0;
}

process.exit(SELF_TEST ? selfTest() : defaultMode());
