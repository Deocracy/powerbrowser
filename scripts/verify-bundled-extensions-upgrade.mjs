#!/usr/bin/env node
// scripts/verify-bundled-extensions-upgrade.mjs
//
// bundled-extensions-upgrade (v1.7 audit-fix lane G4; item 68-WR-04): a seeded upgrade of a
// pre-installed extension is crash-safe. The seed
// (theia/extensions/bundled-extensions/src/node/bundled-extensions-seed.ts) is transpiled from the
// tree with theia/node_modules/typescript and run on mkdtemp folders with the real fs; only
// Theia's DI and logger imports are stubbed.
//
// Clauses:
//  a. Crash at every step. The upgrade from 1.0.0 to 2.0.0 is run once per filesystem mutation
//     it makes; the run k "dies" at mutation k (that call and every later one throw, so no
//     cleanup runs, as when the backend is killed). A start after the death, with the record
//     still at 1.0.0, must leave the extension installed at 2.0.0 and no parked sibling behind:
//     a crash is never read as the user's uninstall. The mutation count is derived from a clean
//     run, so a reshaped copy is still covered.
//  b. Links. A parked old copy that is a link is never restored as <id>; a link at <id> is
//     replaced by a real copy and the folder it pointed to is left untouched.
//  b2. A folder that only looks parked by name (id x-old's temporary copy .x-old-AbC123 for id x)
//     is not x's park and is left alone.
//  c. The rules still hold: a removed folder with the record at the shipped version stays removed.
//
// Tier: quick. SKIP when theia/node_modules/typescript is absent. --self-test plants each pre-fix
// fault in memory (the seed's source text is edited before transpiling) and requires red naming the
// drift, then re-runs the control green.
//
// Usage:
//   node scripts/verify-bundled-extensions-upgrade.mjs
//   node scripts/verify-bundled-extensions-upgrade.mjs --self-test

import * as nodeFs from 'node:fs';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import * as nodePath from 'node:path';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

// --root=<dir> runs the main mode over another tree (the self-test's SKIP control uses it); only as the entry point.
const ROOT_ARG = process.argv.slice(2).find(a => a.startsWith('--root='));
const REPO_ROOT = ROOT_ARG && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    ? resolve(ROOT_ARG.slice('--root='.length))
    : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'bundled-extensions-upgrade';
const SELF_REL = 'scripts/verify-bundled-extensions-upgrade.mjs';
const TS_DIR = join(REPO_ROOT, 'theia', 'node_modules', 'typescript');
const SEED_REL = 'theia/extensions/bundled-extensions/src/node/bundled-extensions-seed.ts';
const ID = 'fixture.bundled';

let ts;

function loadSeed(text) {
    const out = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true, esModuleInterop: false } }).outputText;
    const decorator = () => () => undefined;
    const stub = new Proxy({}, { get: () => decorator });
    const deps = { fs: nodeFs, path: nodePath };
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', out)((id) => deps[id] ?? stub, mod, mod.exports);
    return mod.exports;
}

const MUTATIONS = ['mkdir', 'mkdtemp', 'cp', 'rename', 'rm', 'writeFile', 'unlink', 'rmdir', 'copyFile', 'symlink'];

/** fs.promises whose k-th mutation (1-based) and everything after it throws; k Infinity never dies. Counts mutations. */
function mortalFs(k) {
    const real = nodeFs.promises;
    const state = { n: 0, dead: false };
    const fs = new Proxy(real, {
        get(target, prop) {
            const fn = target[prop];
            if (typeof fn !== 'function') return fn;
            return (...args) => {
                if (state.dead) return Promise.reject(new Error('planted crash: the process is gone'));
                if (MUTATIONS.includes(prop)) {
                    state.n++;
                    if (state.n >= k) { state.dead = true; return Promise.reject(new Error(`planted crash at ${String(prop)}`)); }
                }
                return fn.apply(target, args);
            };
        },
    });
    return { fs, state };
}

function fixture() {
    const t = mkdtempSync(join(tmpdir(), `${NAME}-`));
    const src = join(t, 'plugins', '.user');
    const deploy = join(t, 'deployedPlugins');
    const ship = (version) => {
        rmSync(join(src, ID), { recursive: true, force: true });
        mkdirSync(join(src, ID, 'extension'), { recursive: true });
        writeFileSync(join(src, ID, 'extension', 'package.json'), JSON.stringify({ name: 'bundled', publisher: 'fixture', version }));
        writeFileSync(join(src, ID, 'extension', 'main.js'), `// ${version}\n`);
    };
    const deployedVersion = () => { try { return JSON.parse(readFileSync(join(deploy, ID, 'extension', 'package.json'), 'utf8')).version; } catch { return undefined; } };
    const parked = () => (existsSync(deploy) ? readdirSync(deploy).filter((n) => n.startsWith(`.${ID}-old-`)) : []);
    return { t, src, deploy, ship, deployedVersion, parked };
}

async function check(text) {
    const fails = [];
    const notes = [];
    let seedMod;
    try { seedMod = loadSeed(text); } catch (e) { return { fails: [`${SEED_REL} did not load: ${e?.message ?? e}`], notes }; }
    const seed = seedMod.seedBundledExtensions;
    if (typeof seed !== 'function') return { fails: [`${SEED_REL} exports no seedBundledExtensions`], notes };
    const rec = (v) => JSON.stringify({ [ID]: v });

    // a. derive the mutation count of a clean upgrade, then die at each.
    let steps = 0;
    {
        const f = fixture();
        try {
            f.ship('1.0.0');
            await seed({ sources: [f.src], deploymentDir: f.deploy, record: undefined });
            f.ship('2.0.0');
            const { fs, state } = mortalFs(Infinity);
            await seed({ sources: [f.src], deploymentDir: f.deploy, record: rec('1.0.0'), fs });
            steps = state.n;
            if (f.deployedVersion() !== '2.0.0') fails.push(`a clean upgrade left ${f.deployedVersion() ?? 'nothing'}, not 2.0.0`);
        } finally { rmSync(f.t, { recursive: true, force: true }); }
    }
    if (!steps) fails.push('source moved: a clean upgrade made no filesystem mutation');
    for (let k = 1; k <= steps; k++) {
        const f = fixture();
        try {
            f.ship('1.0.0');
            await seed({ sources: [f.src], deploymentDir: f.deploy, record: undefined });
            f.ship('2.0.0');
            const { fs } = mortalFs(k);
            let record = rec('1.0.0');
            try {
                const r = await seed({ sources: [f.src], deploymentDir: f.deploy, record, fs });
                record = JSON.stringify(r.record);
            } catch { /* the death; the record write after the seed never happens */ }
            const after = await seed({ sources: [f.src], deploymentDir: f.deploy, record: rec('1.0.0') });
            if (f.deployedVersion() !== '2.0.0') fails.push(`a crash during the upgrade at mutation ${k} of ${steps} left the extension uninstalled for good (deployed: ${f.deployedVersion() ?? 'nothing'}, record ${JSON.stringify(after.record)})`);
            if (f.parked().length) fails.push(`a crash at mutation ${k} of ${steps} left a parked copy behind after the next start (${f.parked().join(', ')})`);
        } finally { rmSync(f.t, { recursive: true, force: true }); }
    }
    notes.push(`${steps} crash points`);

    // b. links.
    {
        const f = fixture();
        try {
            f.ship('1.0.0');
            const outside = join(f.t, 'outside');
            mkdirSync(join(outside, 'extension'), { recursive: true });
            writeFileSync(join(outside, 'extension', 'package.json'), JSON.stringify({ version: '9.9.9' }));
            mkdirSync(join(f.deploy, `.${ID}-old-AbC123`), { recursive: true });
            symlinkSync(outside, join(f.deploy, `.${ID}-old-AbC123`, ID));
            // The record is at the shipped version, so the rules leave whatever the recovery made of <id>.
            await seed({ sources: [f.src], deploymentDir: f.deploy, record: rec('1.0.0') });
            let isLink = false;
            try { isLink = lstatSync(join(f.deploy, ID)).isSymbolicLink(); } catch { /* absent */ }
            if (isLink) fails.push('a parked old copy that is a link was restored as the extension folder');
            if (!existsSync(join(outside, 'extension', 'package.json'))) fails.push('recovering a parked link deleted the folder it pointed to');
        } finally { rmSync(f.t, { recursive: true, force: true }); }
    }
    {
        const f = fixture();
        try {
            f.ship('2.0.0');
            const outside = join(f.t, 'outside');
            mkdirSync(outside, { recursive: true });
            writeFileSync(join(outside, 'keep'), 'user data');
            mkdirSync(f.deploy, { recursive: true });
            symlinkSync(outside, join(f.deploy, ID));
            await seed({ sources: [f.src], deploymentDir: f.deploy, record: rec('1.0.0') });
            if (!existsSync(join(outside, 'keep'))) fails.push('an upgrade over a link at the extension folder deleted what the link pointed to');
            if (lstatSync(join(f.deploy, ID)).isSymbolicLink() || f.deployedVersion() !== '2.0.0') fails.push('an upgrade over a link at the extension folder did not put a real 2.0.0 copy in its place');
        } finally { rmSync(f.t, { recursive: true, force: true }); }
    }

    // b2. Another id's folder whose name looks parked (id x-old's temporary copy .x-old-AbC123 matches x's park
    // prefix) is left alone by x's recovery: a park is recognised by its layout, not its name.
    {
        const f = fixture();
        try {
            f.ship('1.0.0');
            const foreign = join(f.deploy, `.${ID}-old-AbC123`);
            mkdirSync(join(foreign, 'extension'), { recursive: true });
            writeFileSync(join(foreign, 'extension', 'package.json'), JSON.stringify({ name: 'bundled-old', version: '3.0.0' }));
            await seed({ sources: [f.src], deploymentDir: f.deploy, record: rec('1.0.0') });
            if (!existsSync(join(foreign, 'extension', 'package.json'))) fails.push(`b2: recovery for ${ID} deleted .${ID}-old-AbC123, the temporary copy of the id ${ID}-old`);
        } finally { rmSync(f.t, { recursive: true, force: true }); }
    }

    // c. an uninstall still sticks.
    {
        const f = fixture();
        try {
            f.ship('1.0.0');
            await seed({ sources: [f.src], deploymentDir: f.deploy, record: undefined });
            rmSync(join(f.deploy, ID), { recursive: true, force: true });
            await seed({ sources: [f.src], deploymentDir: f.deploy, record: rec('1.0.0') });
            if (existsSync(join(f.deploy, ID))) fails.push('a removed extension came back on the next start');
        } finally { rmSync(f.t, { recursive: true, force: true }); }
    }
    return { fails, notes };
}

// ---------------------------------------------------------------- self-test

const PLANTS = [
    {
        name: 'pre-fix-rm-then-rename', naming: 'left the extension uninstalled for good',
        edit: (s) => s.replace(/if \(await exists\(fs, dest\)\) \{\n\s*park = await fs\.mkdtemp\(path\.join\(deploymentDir, parkedPrefix\(id\)\)\);\n\s*await fs\.rename\(dest, path\.join\(park, id\)\);\n\s*\}/, 'await fs.rm(dest, { recursive: true, force: true });'),
    },
    { name: 'no-recovery-at-start', naming: 'left the extension uninstalled for good', edit: (s) => s.replace('for (const { id } of shipped) await recoverParked(fs, input.deploymentDir, id);', '') },
    { name: 'parked-link-restored', naming: 'a parked old copy that is a link was restored', edit: (s) => s.replace('(await fs.lstat(parked)).isDirectory()', '(await fs.stat(parked)).isDirectory()') },
    { name: 'park-by-name-only', naming: 'b2: recovery for', edit: (s) => s.replace("        if (inside.length > 1 || (inside.length === 1 && inside[0] !== id)) continue; // not this id's park\n", '') },
    { name: 'parked-copy-kept', naming: 'left a parked copy behind', edit: (s) => s.replace('        await fs.rm(park, { recursive: true, force: true });\n    }\n}', '    }\n}') },
];

async function runSelfTest(text) {
    const control = await check(text);
    if (control.fails.length) { console.error(`${NAME} self-test: FAIL -- the control is not green: ${control.fails.join(' | ')}`); return 1; }
    console.log(`${NAME} self-test: control green (${control.notes.join('; ')})`);
    let failures = 0;
    for (const p of PLANTS) {
        const planted = p.edit(text);
        if (planted === text) { console.error(`  FAIL ${p.name} -> the plant did not apply (its anchor text moved in ${SEED_REL})`); failures++; continue; }
        const r = await check(planted);
        const all = r.fails.join('\n');
        if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; }
        else if (!all.includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${all}`); failures++; }
        else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
    }
    const again = await check(text);
    if (again.fails.length) { console.error(`  FAIL the control did not re-run green: ${again.fails.join(' | ')}`); failures++; }
    // SKIP control (SKIP-PROTOCOL.md): the main mode, run as a child with its output captured, over a tree with no
    // Theia install must exit 77 with the SKIP line last and no PASS line.
    {
        const empty = mkdtempSync(join(tmpdir(), 'bundled-extensions-upgrade-root-'));
        try {
            const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--root=${empty}`], { encoding: 'utf8' });
            const lines = (r.stdout ?? '').split('\n').filter(l => l.trim() !== '');
            const last = lines[lines.length - 1] ?? '';
            if (r.status !== SKIP_EXIT || !last.startsWith(`${NAME}: SKIP -- theia/node_modules/typescript is absent`)
                || lines.some(l => l.includes(`${NAME}: PASS`)) || /: SKIP/.test(r.stderr ?? '')) {
                console.error(`  FAIL control: a tree without typescript did not exit 77 with the SKIP line last and no PASS line (status ${r.status}, last line ${JSON.stringify(last)})`);
                failures++;
            } else console.log('  ok control: a tree without typescript -> exit 77, the SKIP line last, no PASS line');
        } finally { rmSync(empty, { recursive: true, force: true }); }
    }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} problem(s) across ${PLANTS.length} plants`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift; the control re-ran green`);
    return 0;
}

// ---------------------------------------------------------------- entry

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--self-test' && !args[0].startsWith('--root='))) {
        console.error(`${NAME}: unknown argument ${args[0]} (usage: node ${SELF_REL} [--self-test])`);
        console.error(`Next step: run node ${SELF_REL} for the check or add --self-test for the planted-fault run.`);
        process.exit(2);
    }
    // No typescript: nothing ran, so exit 77 with the SKIP line (SKIP-PROTOCOL.md); a self-test cannot run its plants either.
    if (!existsSync(TS_DIR) || !statSync(TS_DIR).isDirectory()) {
        console.log(skipLine(args[0] === '--self-test' ? `${NAME} self-test` : NAME, 'theia/node_modules/typescript is absent. Next step: run the audited Theia install (docs/BUILD.md "Theia half")'));
        process.exit(SKIP_EXIT);
    }
    ts = createRequire(import.meta.url)(TS_DIR);
    const text = readFileSync(join(REPO_ROOT, SEED_REL), 'utf8');
    if (args[0] === '--self-test') process.exit(await runSelfTest(text));
    const r = await check(text);
    if (r.fails.length) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); process.exit(1); }
    console.log(`${NAME}: PASS -- a crash at any step of a seeded upgrade is recovered at the next start; links are never followed or restored; an uninstall still sticks (${r.notes.join('; ')})`);
    process.exit(0);
}
