#!/usr/bin/env node
// scripts/verify-win-spawn.mjs
//
// The win-spawn gate (v1.7 audit, 68-CR-02). The hosted windows-sidecar job runs `yarn build` on windows-latest, and
// the Theia browser application's package.json scripts run repository scripts from scripts/ as part of it. On Windows
// npm, npx, yarn and pnpm are .cmd / .ps1 shims: spawnSync and friends without a shell cannot start them (libuv tries
// only .com and .exe, and Node refuses a .cmd without shell since CVE-2024-27980), so such a call returns ENOENT and
// the build stops. This row reads every scripts/*.mjs that theia/applications/browser/package.json's scripts name
// (derived at check time) and is red, naming file and line, on a spawn, spawnSync, execFile or execFileSync call whose
// command is a bare 'npm', 'npx', 'yarn' or 'pnpm' string literal. Run npm's own JS entry under process.execPath.
//
// Tier: quick (reads tracked files). --self-test checks the real tree green first, then plants the pre-fix call and
// requires red naming the file and line; it writes nothing.
//
// Usage:
//   node scripts/verify-win-spawn.mjs
//   node scripts/verify-win-spawn.mjs --self-test

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'win-spawn';
const APP_PKG = 'theia/applications/browser/package.json';

/** The scripts/*.mjs the Theia application's package scripts run, as repo-relative paths. */
export function buildScripts(root = REPO_ROOT) {
    const pkg = JSON.parse(readFileSync(join(root, APP_PKG), 'utf8'));
    const out = new Set();
    for (const cmd of Object.values(pkg.scripts ?? {})) {
        for (const m of String(cmd).matchAll(/(?:\.\.\/)+scripts\/([\w.-]+\.mjs)\b/g)) out.add(`scripts/${m[1]}`);
    }
    return [...out].sort();
}

const BARE = /\b(?:spawnSync|spawn|execFileSync|execFile)\(\s*(['"`])(npm|npx|yarn|pnpm)\1/;

export function check(files) {
    const fails = [];
    if (Object.keys(files).length === 0) fails.push(`${APP_PKG}: its scripts run no scripts/*.mjs, so the row holds over nothing. Next step: fix the derivation or retire the row.`);
    for (const [rel, text] of Object.entries(files)) {
        text.split('\n').forEach((l, i) => {
            if (/^\s*\/\//.test(l)) return;
            const m = BARE.exec(l);
            if (m) fails.push(`${rel}:${i + 1}: spawns a bare '${m[2]}', which on windows-latest is a .cmd shim a shell-less spawn cannot start (ENOENT), so the Windows sidecar build stops. Next step: run ${m[2]}'s JS entry under process.execPath.`);
        });
    }
    return fails;
}

const read = (root = REPO_ROOT) => Object.fromEntries(buildScripts(root).map(rel => [rel, readFileSync(join(root, rel), 'utf8')]));

function selfTest() {
    const real = read();
    const base = check(real);
    if (base.length) {
        console.error(`${NAME} self-test: FAIL -- the real tree is already red, so the plants below would prove nothing:`);
        for (const f of base) console.error(`  ${f}`);
        return 1;
    }
    console.log(`  ok baseline ${Object.keys(real).join(', ')} -> green`);
    const rel = 'scripts/download-plugins.mjs';
    const plants = [
        ['npm ci spawned bare', real[rel]?.includes("const r = runNpm(['ci',") ? { ...real, [rel]: real[rel].replace("const r = runNpm(['ci',", "const r = spawnSync('npm', ['ci',") } : null, "spawns a bare 'npm'"],
        ['npm pack spawned bare', real[rel]?.includes("const r = runNpm(['pack',") ? { ...real, [rel]: real[rel].replace("const r = runNpm(['pack',", 'const r = spawnSync("npm", [\'pack\',') } : null, "spawns a bare 'npm'"],
    ];
    let failed = 0;
    for (const [name, files, naming] of plants) {
        if (files === null) { console.error(`${NAME} self-test: FAIL -- '${name}' planted nothing (its anchor is absent)`); failed++; continue; }
        const hit = check(files).find(f => f.startsWith(`${rel}:`) && f.includes(naming));
        if (hit) console.log(`  ok ${name} -> red: ${hit.split(', which')[0]}`);
        else { console.error(`${NAME} self-test: FAIL -- '${name}' did not go red naming '${naming}'`); failed++; }
    }
    if (failed) return 1;
    console.log(`${NAME} self-test: PASS -- the real tree is green and ${plants.length} planted faults each went red naming the file and line`);
    return 0;
}

const args = process.argv.slice(2);
if (args.some(a => a !== '--self-test')) {
    console.error(`${NAME}: unknown argument '${args.find(a => a !== '--self-test')}' (usage: node scripts/verify-win-spawn.mjs [--self-test])`);
    console.error('  Next step: run node scripts/verify-win-spawn.mjs --self-test');
    process.exit(2);
}
if (args.includes('--self-test')) process.exit(selfTest());
const files = read();
const fails = check(files);
if (fails.length) {
    console.error(`${NAME}: FAIL -- ${fails.length} problem(s):`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- ${Object.keys(files).join(', ')} (run by ${APP_PKG}) spawn no bare npm, npx, yarn or pnpm`);
