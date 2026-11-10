#!/usr/bin/env node
// scripts/verify-bundled-extensions.mjs
//
// The pre-installed extensions gate (68-09, BEXT-01, D-30, P68-38). PowerBrowser ships
// third-party parts with their own terms (today Anthropic's Claude Agent SDK) inside
// bundled-extensions/<folder>/, a VS Code extension the build assembles under
// plugins/.user/<id>/ and the @powerbrowser/bundled-extensions seed copies into the profile
// as a user plugin, so the user can disable or uninstall it.
//
// MODES AND TIERS.
//   (default, quick)  For every bundled-extensions/*/: a VS Code manifest (name, publisher,
//                     version, engines.vscode, license "SEE LICENSE IN LICENSE.md", no main or
//                     browser entry); exactly one dependency at an exact version equal to the
//                     manifest version; a package-lock.json pinning it with a sha512 integrity and
//                     nothing else non-optional; LICENSE.md quoting the dependency's LICENSE.md
//                     (read from the built copy under plugins/.user, else orca/node_modules, else
//                     one SKIP line for that leg); README.md free of internal identifiers. When
//                     orca/pnpm-lock.yaml exists, the dependency's version and integrity must equal
//                     Orca's own entry, so the SDK Orca is typed and tested against is the one the
//                     extension carries; an Orca re-pin that moves the SDK turns this red.
//   --seed (quick)    The seed rule's behaviour table against the compiled seedBundledExtensions,
//                     in mkdtemp directories. One SKIP line when the extension is not compiled.
//   --live (full)     The built backend's list-extensions on a fresh THEIA_CONFIG_DIR: the
//                     extension is listed as a user plugin and not as a built-in; after its
//                     deployed directory is removed (what Theia's Uninstall does) a second start
//                     neither lists nor re-seeds it; the backend-settings record names each id at
//                     its version. One SKIP line when the backend is not built.
//   --self-test       Hermetic fixtures: a control green first, then seven plants, each required
//                     red naming it.
//
// LIMIT. --live proves Theia deploys the extension as a user plugin and that removing its
// directory sticks. It does not click the Extensions view's Uninstall or Disable.
//
// Usage:
//   node scripts/verify-bundled-extensions.mjs [--seed | --live | --self-test]
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-bundled-extensions.mjs --live
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'verify-bundled-extensions';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(REPO_ROOT, 'theia', 'applications', 'browser');
const SEED_JS = join(REPO_ROOT, 'theia', 'extensions', 'bundled-extensions', 'lib', 'node', 'bundled-extensions-seed.js');

// User-facing copy rule (01-UI-SPEC): no environment variable, pref key, absolute path or
// package-manager command in README.md.
const README_FORBIDDEN = [
    [/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/, 'an environment variable name'],
    [/\bpowerbrowser\.[a-z]+\./i, 'a pref key'],
    [/(^|[\s(`'"])(\/(home|usr|tmp|opt|etc|var|nix)\/|~\/|[A-Za-z]:\\)/m, 'an absolute path'],
    [/\b(npm|npx|yarn|pnpm)\s/, 'a package-manager command'],
];

// ---------------------------------------------------------------- static leg

/**
 * @param {{ root: string, userDir: string, orcaDir: string }} where
 * @returns {{ failures: string[], skips: string[], passes: string[] }}
 */
export function checkStatic({ root, userDir, orcaDir }) {
    const failures = [], skips = [], passes = [];
    const folders = existsSync(root) ? readdirSync(root).filter(n => existsSync(join(root, n, 'package.json'))).sort() : [];
    if (folders.length === 0) failures.push(`no bundled extension under ${root} -- BEXT-01 ships at least one`);
    const orcaLock = join(orcaDir, 'pnpm-lock.yaml');
    const orca = existsSync(orcaLock) ? readFileSync(orcaLock, 'utf8') : null;
    for (const folder of folders) {
        const at = `bundled-extensions/${folder}`;
        const dir = join(root, folder);
        const fail = m => failures.push(`${at}: ${m}`);
        const m = readJson(join(dir, 'package.json'));
        if (!m) { fail('package.json does not parse'); continue; }
        for (const k of ['name', 'publisher', 'version']) if (typeof m[k] !== 'string' || !m[k]) fail(`the manifest has no ${k}`);
        if (typeof m.engines?.vscode !== 'string') fail('the manifest has no engines.vscode, so Theia does not read it as a VS Code extension');
        if (m.license !== 'SEE LICENSE IN LICENSE.md') fail(`the manifest's license is ${JSON.stringify(m.license)}, not "SEE LICENSE IN LICENSE.md"`);
        for (const k of ['main', 'browser']) if (k in m) fail(`the manifest has a ${k} entry; a bundled extension carries a package and runs no code`);
        const deps = Object.entries(m.dependencies ?? {});
        if (deps.length !== 1) { fail(`the manifest has ${deps.length} dependencies; exactly one is the rule`); continue; }
        const [[dep, range]] = deps;
        if (!/^\d+\.\d+\.\d+$/.test(range)) fail(`${dep} is pinned as ${JSON.stringify(range)}, not an exact version`);
        if (range !== m.version) fail(`the manifest version is ${m.version}, its dependency ${dep} is ${range}; they must be equal`);
        const lock = readJson(join(dir, 'package-lock.json'));
        const entry = lock?.packages?.[`node_modules/${dep}`];
        if (!lock) fail('package-lock.json is missing or does not parse');
        else if (!entry) fail(`package-lock.json has no node_modules/${dep}`);
        else {
            if (entry.version !== range) fail(`package-lock.json pins ${dep}@${entry.version}, the manifest ${range}`);
            if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity ?? '')) fail(`package-lock.json carries no sha512 integrity for ${dep}`);
            const extra = Object.entries(lock.packages).filter(([k, v]) => k && k !== `node_modules/${dep}` && !v.optional).map(([k]) => k);
            if (extra.length) fail(`package-lock.json installs more than ${dep}: ${extra.join(', ')}`);
            if (orca !== null) {
                const pins = orcaPins(orca, dep);
                const ours = `${entry.version} ${entry.integrity}`;
                if (pins.length !== 1 || pins[0] !== ours) {
                    fail(`Orca's lockfile pins ${pins.length ? pins.join(' and ') : 'nothing'} for ${dep}, the extension pins ${ours}`);
                } else passes.push(`${at}: ${dep}@${entry.version} and its integrity equal Orca's lockfile`);
            }
        }
        if (orca === null) skips.push(`${at}: orca/pnpm-lock.yaml absent -- the Orca lock equality leg is not run`);
        const license = readText(join(dir, 'LICENSE.md'));
        const id = `${m.publisher}.${m.name}`;
        const theirs = [join(userDir, id, 'extension', 'node_modules', dep, 'LICENSE.md'), join(orcaDir, 'node_modules', dep, 'LICENSE.md')]
            .map(readText).find(t => t !== null);
        if (license === null) fail('LICENSE.md is missing');
        else if (theirs === undefined) skips.push(`${at}: no built or Orca copy of ${dep} -- the LICENSE.md quotation leg is not run`);
        else if (!license.includes(theirs)) fail(`LICENSE.md does not quote ${dep}'s LICENSE.md byte for byte`);
        const readme = readText(join(dir, 'README.md'));
        if (readme === null) fail('README.md is missing');
        else for (const [re, what] of README_FORBIDDEN) {
            const hit = readme.match(re);
            if (hit) fail(`README.md names ${what} (${JSON.stringify(hit[0].trim())}); user-facing copy carries no internal identifier`);
        }
        passes.push(`${at}: ${id}@${m.version} carries ${dep}@${range}`);
    }
    return { failures, skips, passes };
}

/** Every "<version> <integrity>" Orca's pnpm-lock.yaml packages section holds for dep. */
export function orcaPins(text, dep) {
    const out = [];
    const lines = text.split('\n');
    const head = new RegExp(`^  '?${dep.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}@([^'(:]+)'?:$`);
    for (let i = 0; i < lines.length; i++) {
        const v = lines[i].match(head);
        const integrity = v && lines[i + 1]?.match(/integrity: (sha512-[^,}\s]+)/);
        if (integrity) out.push(`${v[1]} ${integrity[1]}`);
    }
    return out;
}

// ---------------------------------------------------------------- seed leg

/**
 * The seed behaviour table. seed is seedBundledExtensions or a fixture standing in for it.
 * @returns {Promise<{ name: string, ok: boolean, detail: string }[]>}
 */
export async function runSeedScenarios(seed) {
    const id = 'fixture.bundled';
    const results = [];
    const scenario = async (name, fn) => {
        const t = mkdtempSync(join(tmpdir(), 'pb-seed-'));
        try {
            const src = join(t, 'plugins', '.user');
            const deploy = join(t, 'deployedPlugins');
            const ship = version => {
                rmSync(join(src, id), { recursive: true, force: true });
                mkdirSync(join(src, id, 'extension'), { recursive: true });
                writeFileSync(join(src, id, 'extension', 'package.json'), JSON.stringify({ name: 'bundled', publisher: 'fixture', version }));
            };
            const run = record => seed({ sources: [src], deploymentDir: deploy, record: record === undefined ? undefined : JSON.stringify(record) });
            const deployedVersion = () => readJson(join(deploy, id, 'extension', 'package.json'))?.version;
            const detail = await fn({ ship, run, deploy, deployedVersion, marker: join(deploy, id, 'user-marker') });
            results.push({ name, ok: detail === true, detail: detail === true ? '' : detail });
        } catch (err) {
            results.push({ name, ok: false, detail: `threw ${err.message}` });
        } finally {
            rmSync(t, { recursive: true, force: true });
        }
    };
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    await scenario('no record: copies and records', async ({ ship, run, deployedVersion }) => {
        ship('1.0.0');
        const r = await run(undefined);
        if (deployedVersion() !== '1.0.0') return 'the extension was not copied';
        return eq(r.record, { [id]: '1.0.0' }) || `the record is ${JSON.stringify(r.record)}`;
    });
    await scenario('same version recorded, directory present: does nothing', async ({ ship, run, marker }) => {
        ship('1.0.0');
        await run(undefined);
        writeFileSync(marker, 'kept');
        const r = await run({ [id]: '1.0.0' });
        if (!existsSync(marker)) return 'the deployed copy was replaced';
        return (eq(r.record, { [id]: '1.0.0' }) && r.actions.length === 0) || `record ${JSON.stringify(r.record)}, actions ${JSON.stringify(r.actions)}`;
    });
    await scenario('uninstalled (directory removed, record kept): nothing is copied', async ({ ship, run, deploy }) => {
        ship('1.0.0');
        await run(undefined);
        rmSync(join(deploy, id), { recursive: true, force: true });
        const r = await run({ [id]: '1.0.0' });
        if (existsSync(join(deploy, id))) return 'the uninstalled extension was copied again';
        return eq(r.record, { [id]: '1.0.0' }) || `the record is ${JSON.stringify(r.record)}`;
    });
    await scenario('new shipped version, directory present: replaced and recorded', async ({ ship, run, deployedVersion, marker }) => {
        ship('1.0.0');
        await run(undefined);
        writeFileSync(marker, 'old');
        ship('2.0.0');
        const r = await run({ [id]: '1.0.0' });
        if (deployedVersion() !== '2.0.0' || existsSync(marker)) return `the deployed copy is ${deployedVersion()}, not a clean 2.0.0`;
        return eq(r.record, { [id]: '2.0.0' }) || `the record is ${JSON.stringify(r.record)}`;
    });
    await scenario('new shipped version, directory absent: nothing copied, record kept', async ({ ship, run, deploy }) => {
        ship('2.0.0');
        const r = await run({ [id]: '1.0.0' });
        if (existsSync(join(deploy, id))) return 'an uninstalled extension came back with the upgrade';
        return eq(r.record, { [id]: '1.0.0' }) || `the record is ${JSON.stringify(r.record)}`;
    });
    for (const bad of ['not json', '[1]', '{"x":1}']) {
        await scenario(`malformed record ${JSON.stringify(bad)}: counts as empty`, async ({ ship, deploy, deployedVersion }) => {
            ship('1.0.0');
            const r = await seed({ sources: [join(deploy, '..', 'plugins', '.user')], deploymentDir: deploy, record: bad });
            if (deployedVersion() !== '1.0.0') return 'the extension was not copied';
            return eq(r.record, { [id]: '1.0.0' }) || `the record is ${JSON.stringify(r.record)}`;
        });
    }
    return results;
}

function loadSeed() {
    if (!existsSync(SEED_JS)) return null;
    return createRequire(SEED_JS)(SEED_JS).seedBundledExtensions;
}

// ---------------------------------------------------------------- live leg

function listExtensions(configDir, builtins) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ORCA_')));
    Object.assign(env, { THEIA_CONFIG_DIR: configDir, THEIA_DEFAULT_PLUGINS: `local-dir:${join(APP_DIR, 'plugins')}`, POWERBROWSER_TOKEN_DISABLE: '1' });
    const args = [join(APP_DIR, 'lib', 'backend', 'main.js'), 'list-extensions', '--show-versions', ...(builtins ? ['--show-builtins'] : [])];
    return new Promise((done, fail) => {
        // The backend keeps running after it prints the listing, so it is stopped once the
        // listing (written synchronously after its header) has arrived; the seed record was
        // written before the deployer ran, so nothing is lost.
        const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', timer = null;
        const deadline = setTimeout(() => { child.kill('SIGKILL'); fail(new Error(`list-extensions printed no listing in 120 s:\n${out.slice(-2000)}`)); }, 120_000);
        child.stdout.on('data', b => {
            out += b;
            if (!timer && out.includes('installed plugins:\n')) timer = setTimeout(() => child.kill('SIGKILL'), 1500);
        });
        child.stderr.on('data', () => {});
        child.on('exit', () => {
            clearTimeout(deadline);
            const listed = out.split('installed plugins:\n')[1];
            if (listed === undefined) return fail(new Error(`list-extensions exited without a listing:\n${out.slice(-2000)}`));
            done(listed.split('\n').filter(l => /^[^\s]+@[^\s]+$/.test(l)));
        });
    });
}

async function live() {
    if (!existsSync(join(APP_DIR, 'lib', 'backend', 'main.js'))) return { skip: 'the Theia backend is not built (theia/applications/browser/lib/backend/main.js)' };
    const userDir = join(APP_DIR, 'plugins', '.user');
    const shipped = (existsSync(userDir) ? readdirSync(userDir) : []).filter(n => !n.startsWith('.'))
        .map(id => ({ id, version: readJson(join(userDir, id, 'extension', 'package.json'))?.version }));
    const failures = [];
    if (shipped.length === 0) failures.push('plugins/.user holds no bundled extension; run yarn build');
    const t = mkdtempSync(join(tmpdir(), 'pb-bundled-live-'));
    try {
        const user1 = await listExtensions(t, false);
        const sys1 = await listExtensions(t, true);
        for (const { id, version } of shipped) {
            if (!user1.includes(`${id}@${version}`)) failures.push(`a fresh profile does not list ${id}@${version} as an installed user plugin (got ${user1.join(', ') || 'nothing'})`);
            if (sys1.some(l => l.startsWith(`${id}@`))) failures.push(`${id} is listed as a built-in plugin, which cannot be uninstalled`);
            rmSync(join(t, 'deployedPlugins', id), { recursive: true, force: true });
        }
        const user2 = await listExtensions(t, false);
        const sys2 = await listExtensions(t, true);
        for (const { id } of shipped) {
            if (user2.some(l => l.startsWith(`${id}@`)) || sys2.some(l => l.startsWith(`${id}@`))) failures.push(`${id} is listed again after its directory was removed`);
            if (existsSync(join(t, 'deployedPlugins', id))) failures.push(`${id} was seeded again after its directory was removed; an uninstall must stick`);
        }
        const settings = readJson(join(t, 'backend-settings.json')) ?? {};
        let record;
        try { record = JSON.parse(settings['bundledExtensions.seeded']); } catch { record = settings['bundledExtensions.seeded']; }
        const want = Object.fromEntries(shipped.map(s => [s.id, s.version]));
        if (JSON.stringify(record) !== JSON.stringify(want)) failures.push(`the backend-settings record is ${JSON.stringify(record)}, expected ${JSON.stringify(want)}`);
    } finally {
        rmSync(t, { recursive: true, force: true });
    }
    return { failures, shipped };
}

// ---------------------------------------------------------------- self-test

async function selfTest() {
    const t = mkdtempSync(join(tmpdir(), 'pb-bundled-self-'));
    const lines = [];
    let ok = true;
    try {
        const dep = '@fixture/sdk';
        const integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
        const licence = '(c) Fixture Corp. All rights reserved.\n';
        const fixture = () => {
            const root = join(t, `case-${lines.length}`);
            const dir = join(root, 'bundled', 'sdk');
            mkdirSync(join(root, 'orca', 'node_modules', dep), { recursive: true });
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(root, 'orca', 'node_modules', dep, 'LICENSE.md'), licence);
            writeFileSync(join(root, 'orca', 'pnpm-lock.yaml'), `packages:\n\n  '${dep}@1.2.3':\n    resolution: {integrity: ${integrity}}\n`);
            writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'sdk', publisher: 'fixture', version: '1.2.3', license: 'SEE LICENSE IN LICENSE.md', engines: { vscode: '^1.50.0' }, dependencies: { [dep]: '1.2.3' } }));
            writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ packages: { '': {}, [`node_modules/${dep}`]: { version: '1.2.3', integrity }, 'node_modules/@fixture/sdk-linux-x64': { version: '1.2.3', optional: true } } }));
            writeFileSync(join(dir, 'LICENSE.md'), `Ours.\n\n${licence}`);
            writeFileSync(join(dir, 'README.md'), 'Switch it off in the Extensions view.\n');
            return { where: { root: join(root, 'bundled'), userDir: join(root, 'none'), orcaDir: join(root, 'orca') }, dir };
        };
        const edit = (dir, file, fn) => {
            const p = join(dir, file);
            const v = fn(file.endsWith('.json') ? JSON.parse(readFileSync(p, 'utf8')) : readFileSync(p, 'utf8'));
            writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v));
        };
        const control = fixture();
        const c = checkStatic(control.where);
        const seed = loadSeed();
        const seedControl = seed ? await runSeedScenarios(seed) : null;
        const controlGreen = c.failures.length === 0 && c.skips.length === 0 && (!seedControl || seedControl.every(r => r.ok));
        lines.push(`${controlGreen ? 'PASS' : 'FAIL'} control: the clean fixture is green${seedControl ? ' and the compiled seed passes every scenario' : ''}`
            + (controlGreen ? '' : ` -- ${[...c.failures, ...c.skips, ...(seedControl ?? []).filter(r => !r.ok).map(r => `${r.name}: ${r.detail}`)].join(' | ')}`));
        if (!controlGreen) { ok = false; return { ok, lines }; }

        const plants = [
            ['manifest version differs from its dependency', d => edit(d, 'package.json', m => ({ ...m, version: '1.2.4' })), /manifest version is 1\.2\.4/],
            ['engines.vscode missing', d => edit(d, 'package.json', m => ({ ...m, engines: {} })), /no engines\.vscode/],
            ['a main entry', d => edit(d, 'package.json', m => ({ ...m, main: './x.js' })), /has a main entry/],
            ['lock integrity differs from Orca\'s', d => edit(d, 'package-lock.json', l => { l.packages[`node_modules/${dep}`].integrity = `sha512-${Buffer.alloc(64, 8).toString('base64')}`; return l; }), /Orca's lockfile pins 1\.2\.3 sha512-/],
            ['LICENSE.md missing the quoted line', d => edit(d, 'LICENSE.md', s => s.replace('All rights reserved.', 'All rights reserved')), /does not quote @fixture\/sdk's LICENSE\.md/],
            ['README naming an environment variable', d => edit(d, 'README.md', s => `${s}Set CLAUDE_AGENT_DIR first.\n`), /README\.md names an environment variable/],
        ];
        for (const [name, plant, expect] of plants) {
            const f = fixture();
            plant(f.dir);
            const r = checkStatic(f.where);
            const hit = r.failures.find(x => expect.test(x));
            lines.push(`${hit ? 'PASS' : 'FAIL'} plant "${name}" -> ${hit ? `red: ${hit}` : `stayed green or red for the wrong reason: ${r.failures.join(' | ') || 'no failure'}`}`);
            if (!hit) ok = false;
        }
        // The scenario runner must discriminate: a seed that ignores its record copies again after an uninstall.
        const name = 'a seed that copies again after an uninstall';
        if (!seed) {
            lines.push(`SKIP plant "${name}" -- the seed is not compiled (theia/extensions/bundled-extensions/lib)`);
        } else {
            const forgetful = input => seed({ ...input, record: undefined });
            const r = (await runSeedScenarios(forgetful)).find(x => x.name.startsWith('uninstalled'));
            const red = r && !r.ok && /copied again/.test(r.detail);
            lines.push(`${red ? 'PASS' : 'FAIL'} plant "${name}" -> ${red ? `red: ${r.name}: ${r.detail}` : 'the scenario runner stayed green'}`);
            if (!red) ok = false;
        }
    } finally {
        rmSync(t, { recursive: true, force: true });
    }
    return { ok, lines };
}

// ---------------------------------------------------------------- helpers and main

function readJson(p) {
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function readText(p) {
    try { return readFileSync(p, 'utf8'); } catch { return null; }
}

function report(failures, skips, passes, what) {
    for (const s of skips) console.log(`${NAME}: SKIP -- ${s}`);
    for (const p of passes) console.log(`  ok  ${p}`);
    if (failures.length) {
        for (const f of failures) console.error(`${NAME}: FAIL -- ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- ${what}`);
}

const mode = process.argv[2] ?? '';
if (mode === '') {
    const r = checkStatic({ root: join(REPO_ROOT, 'bundled-extensions'), userDir: join(APP_DIR, 'plugins', '.user'), orcaDir: join(REPO_ROOT, 'orca') });
    report(r.failures, r.skips, r.passes, 'every bundled extension is a declarative VS Code manifest pinning one package by version and sha512, quoting its licence, with clean user-facing copy');
} else if (mode === '--seed') {
    const seed = loadSeed();
    if (!seed) {
        console.log(`${NAME}: SKIP -- the seed is not compiled (theia/extensions/bundled-extensions/lib); run yarn build in theia/`);
    } else {
        const results = await runSeedScenarios(seed);
        report(results.filter(r => !r.ok).map(r => `seed scenario "${r.name}": ${r.detail}`), [], results.filter(r => r.ok).map(r => r.name), `${results.length} seed scenarios hold`);
    }
} else if (mode === '--live') {
    const r = await live();
    if (r.skip) console.log(`${NAME}: SKIP -- ${r.skip}`);
    else report(r.failures, [], r.shipped.map(s => `${s.id}@${s.version} deployed as a user plugin; removal sticks`), 'Theia deploys each bundled extension as a user plugin, never a built-in, and an uninstall is not undone');
} else if (mode === '--self-test') {
    const r = await selfTest();
    for (const l of r.lines) console.log(`  ${l}`);
    if (!r.ok) { console.error(`${NAME} --self-test: FAIL`); process.exit(1); }
    console.log(`${NAME} --self-test: PASS -- control green, every plant red naming it`);
} else {
    console.error(`usage: node scripts/verify-bundled-extensions.mjs [--seed | --live | --self-test]`);
    process.exit(2);
}
