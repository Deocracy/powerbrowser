#!/usr/bin/env node
// scripts/verify-nix-default-shell.mjs
//
// The nix-default-shell row. Plain `nix develop` and .envrc's `use flake` resolve
// devShells.default, and fall back to packages.default when it is absent. packages.default
// fetches the published Release tarball, which 404s on a tree with no Release, so the
// default shell must exist and its derivation closure must not contain that fetch.
//
// Eval-only and offline: `nix eval --offline` instantiates the .drv files from the locked
// nixpkgs already in the store and builds nothing. The fetch derivation is derived at check
// time from packages.default.src, never a hand-kept path.
//
// --self-test runs the same predicate over packages.default, whose closure does contain the
// fetch (must go red naming it), and over devShells.theia (must stay green).

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'nix-default-shell';
const SYS = 'x86_64-linux';

const args = process.argv.slice(2);
if (args.some((a) => a !== '--self-test')) {
    console.error(`${NAME}: FAIL -- unknown argument; usage: node scripts/verify-nix-default-shell.mjs [--self-test]`);
    process.exit(2);
}

function run(cmd, argv) {
    const r = spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 64 << 20 });
    if (r.error || r.status !== 0) {
        console.error(`${NAME}: FAIL -- ${cmd} ${argv.join(' ')} exited ${r.error ? r.error.code : r.status}: ${(r.stderr ?? '').trim().split('\n').slice(-3).join(' | ')}`);
        console.error(`  Next step: fix the nix error above; if the locked nixpkgs is not in the store yet, enter nix develop .#theia once, then rerun.`);
        process.exit(1);
    }
    return r.stdout.trim();
}

const drvPath = (attr) => run('nix', ['eval', '--offline', '--raw', `${REPO_ROOT}#${attr}.drvPath`]);
const fetchDrv = drvPath(`packages.${SYS}.default.src`);

// Returns null when the closure of `attr` is free of the Release fetch, else a reason.
function fault(attr) {
    const closure = run('nix-store', ['--query', '--requisites', drvPath(attr)]).split('\n');
    return closure.includes(fetchDrv) ? `${attr} depends on the Release tarball fetch ${fetchDrv}` : null;
}

if (args.includes('--self-test')) {
    const planted = fault(`packages.${SYS}.default`);
    const control = fault(`devShells.${SYS}.theia`);
    if (!planted || control) {
        console.error(`${NAME}: --self-test FAIL -- packages.default ${planted ? 'went red' : 'stayed green (the probe cannot see the fetch)'}; devShells.theia ${control ? `went red: ${control}` : 'stayed green'}`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- packages.default went red (${planted}); devShells.theia stayed green`);
} else {
    const f = fault(`devShells.${SYS}.default`);
    if (f) {
        console.error(`${NAME}: FAIL -- ${f}; plain nix develop would fail until a Release is published.`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- devShells.default evaluates and its closure excludes ${fetchDrv}`);
}
