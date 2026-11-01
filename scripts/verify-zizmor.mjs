#!/usr/bin/env node
// scripts/verify-zizmor.mjs
//
// The zizmor row (Phase 41, AUTO-09). zizmor --offline audits every workflow
// under .github/workflows/ and .github/dependabot.yml (dependabot-cooldown, Phase 51)
// at its default (regular) persona, and the row passes only on exit 0. It covers template injection and unpinned uses more broadly
// than the workflows row's GH-12 rules; the two are complementary.
//
// The binary is zizmor 1.29.0 from the theia dev shell (pkgs.zizmor in
// flake.nix, from the locked nixpkgs). It is taken from PATH when present,
// else resolved once through `nix develop <repo>#theia`. When neither works
// the row FAILS naming the shell; it never skips.
//
// --self-test writes a bad and a clean fixture into separate mkdtemp
// directories under the OS temp dir and requires the bad one to exit non-zero
// naming template-injection and unpinned-uses, and the clean one to exit 0. A bad dependabot.yml
// (no cooldown) must exit non-zero naming dependabot-cooldown, and a clean one with a cooldown exit 0.
// It writes nothing in the repository.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'zizmor';
const SELF_REL = 'scripts/verify-zizmor.mjs';
const WF_DIR = '.github/workflows';
const DEP_REL = '.github/dependabot.yml';
const NO_TOOL = `zizmor is not on PATH and could not be run through nix develop .#theia. Next step: run nix develop .#theia, or install nix`;

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the audit discriminates.`);
        process.exit(2);
    }
}

// Returns the zizmor binary to run, or null when neither PATH nor the theia shell has it.
function resolveZizmor() {
    const onPath = spawnSync('zizmor', ['--version'], { encoding: 'utf8' });
    if (!onPath.error) return 'zizmor';
    const viaNix = spawnSync('nix', ['develop', `${REPO_ROOT}#theia`, '--command', 'sh', '-c', 'command -v zizmor'], { encoding: 'utf8' });
    if (viaNix.error || viaNix.status !== 0) return null;
    // The shell hook prints its own banner; the store path is the last line.
    const bin = viaNix.stdout.trim().split('\n').pop();
    return bin?.startsWith('/') ? bin : null;
}

function runZizmor(bin, ...paths) {
    const r = spawnSync(bin, ['--offline', ...paths], { encoding: 'utf8' });
    return { status: r.error ? null : r.status, stdout: r.stdout ?? '', out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function version(bin) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
    return (r.stdout ?? '').trim() || 'unknown version';
}

function main() {
    const bin = resolveZizmor();
    if (bin === null) {
        console.error(`${NAME}: FAIL -- ${NO_TOOL}`);
        return 1;
    }
    if (args.includes('--self-test')) return selfTest(bin);
    const { status, stdout, out } = runZizmor(bin, join(REPO_ROOT, WF_DIR), join(REPO_ROOT, DEP_REL));
    // The finding summary is the last stdout line; progress lines go to stderr.
    const summary = stdout.trim().split('\n').pop();
    if (status !== 0) {
        console.error(out.trimEnd());
        console.error(`${NAME}: FAIL -- ${version(bin)} --offline over ${WF_DIR}/ and ${DEP_REL} exited ${status}.`);
        console.error(`  Next step: fix the finding in the workflow or dependabot.yml; never suppress it to make the row green.`);
        return 1;
    }
    console.log(`${NAME}: PASS -- ${version(bin)} --offline over ${WF_DIR}/ and ${DEP_REL}: ${summary}`);
    return 0;
}

const BAD = [
    'on: issues',
    'jobs:',
    '  echo:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: echo "${{ github.event.issue.title }}"',
    '',
].join('\n');

const CLEAN = [
    'name: Clean',
    'on: workflow_dispatch',
    'permissions: {}',
    'jobs:',
    '  echo:',
    '    name: Echo',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: echo clean',
    '',
].join('\n');

// zizmor collects a workflows directory, not a bare directory of YAML files,
// so each fixture lives at <mkdtemp>/.github/workflows/<name>.
function auditFixture(bin, name, text) {
    const root = mkdtempSync(join(tmpdir(), 'verify-zizmor-'));
    try {
        const dir = join(root, WF_DIR);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, name), text);
        return runZizmor(bin, dir);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

const DEP_BAD = 'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"\n';
const DEP_CLEAN = `${DEP_BAD}    cooldown:\n      default-days: 7\n`;

// A dependabot.yml is found by its fixed name under <mkdtemp>/.github/.
function auditDependabot(bin, text) {
    const root = mkdtempSync(join(tmpdir(), 'verify-zizmor-'));
    try {
        mkdirSync(join(root, '.github'), { recursive: true });
        writeFileSync(join(root, DEP_REL), text);
        return runZizmor(bin, join(root, DEP_REL));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

function selfTest(bin) {
    let failed = 0;
    const bad = auditFixture(bin, 'bad.yml', BAD);
    const missing = ['template-injection', 'unpinned-uses'].filter(a => !bad.out.includes(a));
    if (bad.status !== null && bad.status !== 0 && missing.length === 0) {
        console.log(`  ok  bad.yml (event text in run:, actions/checkout@v4) -> exit ${bad.status}, naming template-injection and unpinned-uses`);
    } else {
        console.error(`${NAME}: --self-test FAIL -- bad.yml exited ${bad.status}${missing.length ? `, missing ${missing.join(' and ')}` : ''}; got: ${bad.out.trim() || '(no output)'}`);
        failed += 1;
    }
    const clean = auditFixture(bin, 'clean.yml', CLEAN);
    if (clean.status === 0) {
        console.log(`  ok  clean.yml (workflow_dispatch, permissions {}, one echo step) -> exit 0`);
    } else {
        console.error(`${NAME}: --self-test FAIL -- clean.yml exited ${clean.status}; got: ${clean.out.trim() || '(no output)'}`);
        failed += 1;
    }
    const depBad = auditDependabot(bin, DEP_BAD);
    if (depBad.status !== null && depBad.status !== 0 && depBad.out.includes('dependabot-cooldown')) {
        console.log(`  ok  dependabot.yml without a cooldown -> exit ${depBad.status}, naming dependabot-cooldown`);
    } else {
        console.error(`${NAME}: --self-test FAIL -- a dependabot.yml without a cooldown exited ${depBad.status} without naming dependabot-cooldown; got: ${depBad.out.trim() || '(no output)'}`);
        failed += 1;
    }
    const depClean = auditDependabot(bin, DEP_CLEAN);
    if (depClean.status === 0) {
        console.log(`  ok  dependabot.yml with default-days 7 -> exit 0`);
    } else {
        console.error(`${NAME}: --self-test FAIL -- a dependabot.yml with a cooldown exited ${depClean.status}; got: ${depClean.out.trim() || '(no output)'}`);
        failed += 1;
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${version(bin)}: the bad fixtures went red naming their audits, the clean fixtures stayed green`);
    return 0;
}

process.exit(main());
