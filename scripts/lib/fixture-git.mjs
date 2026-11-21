// scripts/lib/fixture-git.mjs
//
// Git for the throwaway fixture repositories that the verify-orca-* self-tests create (harness-static-structure-11).
// A fixture commit that sets only user.name and user.email inherits the developer's global and system git
// configuration: commit.gpgsign and gpg.program (a signing agent, a pinentry prompt), core.hooksPath (the
// developer's own hooks run inside a throwaway repository), init.templateDir, core.fsmonitor.
//
// fixtureGitArgs() is the -c list that turns signing and hooks off for one invocation; fixtureGitEnv() points
// GIT_CONFIG_GLOBAL at /dev/null and sets GIT_CONFIG_NOSYSTEM=1, so no config file outside the repository is read.
//
// withHostileGitConfig(fn) is the proof. It runs fn with HOME and XDG_CONFIG_HOME pointing at a directory whose
// .gitconfig turns signing on with a signer that always fails and points core.hooksPath at a hook that always
// fails, and with the GIT_CONFIG_* variables unset. A self-test run inside it goes red the moment one of its fixture
// commits no longer goes through fixtureGitArgs()/fixtureGitEnv(). A self-test whose work is not git (it never
// commits) has nothing to wrap.
//
// No top-level side effects.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The `-c` arguments that make one git invocation ignore signing and hooks. */
export function fixtureGitArgs() {
    return ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false'];
}

/** `base` (default process.env) with no global or system git config, for a fixture repository. */
export function fixtureGitEnv(base = process.env) {
    return { ...base, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
}

const HOSTILE_VARS = ['HOME', 'XDG_CONFIG_HOME', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'];

function hostileSetup() {
    const home = mkdtempSync(join(tmpdir(), 'hostile-git-home-'));
    const hooks = join(home, 'hooks');
    mkdirSync(hooks, { recursive: true });
    for (const h of ['pre-commit', 'commit-msg', 'prepare-commit-msg', 'post-commit', 'reference-transaction']) {
        writeFileSync(join(hooks, h), '#!/bin/sh\necho "hostile global hook ran" >&2\nexit 1\n', { mode: 0o755 });
    }
    writeFileSync(join(home, '.gitconfig'), `[commit]\n\tgpgsign = true\n[tag]\n\tgpgsign = true\n[gpg]\n\tprogram = /bin/false\n[core]\n\thooksPath = ${hooks}\n`);
    const saved = Object.fromEntries(HOSTILE_VARS.map((k) => [k, process.env[k]]));
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = home;
    for (const k of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM']) delete process.env[k];
    return () => {
        for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        rmSync(home, { recursive: true, force: true });
    };
}

/**
 * Run fn() with a global git config that fails every signed commit and every hook, then restore the environment.
 * Returns what fn returns.
 */
export function withHostileGitConfig(fn) {
    const restore = hostileSetup();
    try { return fn(); } finally { restore(); }
}

/** withHostileGitConfig for an async fn: the environment is restored after the promise settles. */
export async function withHostileGitConfigAsync(fn) {
    const restore = hostileSetup();
    try { return await fn(); } finally { restore(); }
}
