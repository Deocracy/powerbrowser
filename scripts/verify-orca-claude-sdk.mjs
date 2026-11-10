#!/usr/bin/env node
// scripts/verify-orca-claude-sdk.mjs
//
// BEXT-01, orcad half (Phase 68, plan 68-07; D-30, P68-38): the Claude agent
// SDK leaves orcad's bundle, and orcad's loadClaudeAgentSdk imports it only
// from the package directory ORCA_CLAUDE_AGENT_SDK_DIR names. Unset keeps
// Orca's stock import; an empty value, a directory without the package, or an
// entry resolved outside the directory rejects with ERR_MODULE_NOT_FOUND,
// which is Orca's own missing-package path.
//
// Default mode (quick). The overlay seam 070 in
// orca/src/main/claude/claude-stream-json-connection.ts is bundled with
// esbuild (orca/node_modules/esbuild, else theia/node_modules/esbuild) as ESM
// for Node, with the SDK external and every other non-built-in import resolved
// to an empty CommonJS stub, into .mozbuild/orca-claude-sdk/. Five scenarios,
// each in its own child node process because the loader caches its promise;
// a stub SDK is a package directory exporting a nonce:
//   S1  the value is a stub package directory: its nonce comes back.
//   S2  the value is empty (a stub is reachable by the stock lookup): rejected.
//   S3  the value is a directory without the package: rejected.
//   S4  the value is a directory whose parent's node_modules holds a stub:
//       rejected (no walk-up out of the named directory).
//   S5  the variable is unset and a stub sits in node_modules beside the
//       bundle: its nonce comes back (the stock path is unchanged).
// A rejection must carry code ERR_MODULE_NOT_FOUND and name the package (S3
// and S4 also the directory). The variable name is read from the patched
// source and must not carry a PowerBrowser token (/pb/i, /powerbrowser/i),
// and must equal OrcaEnv.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV.
//
// The OrcaEnv leg (default mode, needs no orca/): powerbrowser/shell/OrcaEnv.sys.mjs
// is imported by path and claudeAgentSdkDir runs a behavior table (no settings,
// the extension id disabled, versioned, malformed, non-array, another id);
// buildOrcadEnv must throw without a claudeAgentSdkDir decision and pass "" as "".
// THEIA_CONFIG_DIR_NAME must equal the folder TheiaService._resolveConfigDir
// appends to the profile directory, derived from its template literal.
//
// --built (full). ORCAD_EXTERNAL_MODULES, imported from
// orca/config/scripts/orcad-entry-build.mjs, must list the SDK. The needle
// CLAUDE_AGENT_SDK_VERSION="<version>" is derived from the installed SDK's
// package.json and must first be found in that package's sdk.mjs (otherwise
// the instrument is broken and an absence proves nothing); then no file under
// orca/out may contain it.
//
// Limit: the loader runs from a bundle of its own module with its other
// imports stubbed, not inside a running orcad.
//
// --self-test (quick, hermetic: fixtures under mkdtemp, no orca/ needed; SKIP
// without esbuild). The control bundles the loader taken from the post-image of
// orca-overlay/patches/070-claude-agent-sdk-dir.patch and must pass S1-S5, the
// token rule, the OrcaEnv table, a fixture TheiaService derivation and the
// --built leg over a fixture out/ and SDK. Then each plant must go red naming
// it: a stock loader (S1), an empty value treated as unset (S2), no
// inside-the-directory test (S4), a PB name (token rule), the needle in out/
// (and the same out/ without it green), the needle absent from sdk.mjs
// (broken instrument), a drifted THEIA_CONFIG_DIR_NAME (derivation), a
// disabled list that still returns the path (table).
//
// Tier: default quick (one SKIP line when orca/ is not fetched, the overlay is
// not applied, or no esbuild is installed); --built full (SKIP when
// orca/out/orcad is absent). Exit 0 pass or SKIP, 1 fail, 2 unknown argument.
//
// Usage:
//   node scripts/verify-orca-claude-sdk.mjs
//   node scripts/verify-orca-claude-sdk.mjs --built
//   node scripts/verify-orca-claude-sdk.mjs --self-test

import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-claude-sdk';
const SELF_REL = 'scripts/verify-orca-claude-sdk.mjs';
const SDK_PKG = '@anthropic-ai/claude-agent-sdk';
const LOADER_REL = 'src/main/claude/claude-stream-json-connection.ts';
const ENTRY_BUILD_REL = 'config/scripts/orcad-entry-build.mjs';
const WORK_REL = '.mozbuild/orca-claude-sdk';
const MISSING = 'ERR_MODULE_NOT_FOUND';
const EXTENSION_ID = 'powerbrowser.claude-agent-sdk';
const SDK_SUBPATH = `deployedPlugins/${EXTENSION_ID}/extension/node_modules/${SDK_PKG}`;

const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

/** esbuild from the first of `roots` that has it installed, or null. */
export function resolveEsbuild(roots) {
    for (const root of roots) {
        const dir = join(root, 'node_modules', 'esbuild');
        if (!existsSync(join(dir, 'package.json'))) continue;
        try { return { esbuild: createRequire(import.meta.url)(dir), from: dir }; } catch { /* next root */ }
    }
    return null;
}

/** Bundles `src` as Node ESM with the SDK external and every other non-built-in import stubbed. */
export async function bundleLoader(esbuild, src, outfile) {
    const stubs = {
        name: 'stub-non-builtins',
        setup(b) {
            b.onResolve({ filter: /.*/ }, (args) => {
                if (args.kind === 'entry-point') return undefined;
                if (args.path === SDK_PKG || args.path.startsWith('node:') || isBuiltin(args.path)) return { path: args.path, external: true };
                return { path: args.path, namespace: 'stub' };
            });
            b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
        },
    };
    await esbuild.build({ entryPoints: [src], bundle: true, format: 'esm', platform: 'node', target: 'node20', outfile, write: true, logLevel: 'silent', plugins: [stubs] });
}

/** A stub SDK package directory at `dir` whose sdk.mjs exports `nonce`. */
function stubSdk(dir, nonce) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: SDK_PKG, version: '0.0.0-stub', type: 'module', exports: { '.': './sdk.mjs' } }));
    writeFileSync(join(dir, 'sdk.mjs'), `export const nonce = ${JSON.stringify(nonce)};\n`);
}

/** Runs loadClaudeAgentSdk from `loader` in a fresh node with an environment built from scratch. */
function runLoader(loader, cwd, envName, value) {
    const script = `import(${JSON.stringify(pathToFileURL(loader).href)}).then((m) => m.loadClaudeAgentSdk()).then(`
        + '(sdk) => console.log(JSON.stringify({ ok: true, nonce: sdk.nonce ?? null })), '
        + '(e) => console.log(JSON.stringify({ ok: false, code: e?.code ?? null, message: String(e?.message ?? e) })))';
    const env = { PATH: process.env.PATH ?? '' };
    if (value !== undefined) env[envName] = value;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd, env, encoding: 'utf8', timeout: 30000 });
    try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { ok: false, code: null, message: `child exited ${r.status}: ${(r.stderr || '').trim().slice(-300)}` }; }
}

/** The environment name the loader reads, from its source: the first process.env.<NAME> in loadClaudeAgentSdk. */
export function envNameFrom(source) {
    const at = String(source).indexOf('function loadClaudeAgentSdk');
    if (at < 0) return null;
    const body = source.slice(at, source.indexOf('\n}\n', at) + 2);
    return /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/.exec(body)?.[1] ?? null;
}

/** Red reasons for a name that could not be offered upstream unchanged. */
export function tokenFails(name) {
    if (!name) return ['token rule: no process.env.<NAME> read in loadClaudeAgentSdk, so the loader names no directory variable'];
    return /pb/i.test(name) || /powerbrowser/i.test(name) ? [`token rule: the variable ${name} carries a PowerBrowser token (pb or powerbrowser); the seam must be offerable upstream unchanged`] : [];
}

/**
 * Bundles the loader source `src` into `work` and runs S1-S5 with `envName`. Resolves red reasons and a
 * one-word result per scenario.
 */
export async function loaderScenarios(esbuild, src, envName, work) {
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    const bundle = join(work, 'loader.mjs');
    try { await bundleLoader(esbuild, src, bundle); } catch (err) { return { fails: [`the loader source does not bundle: ${String(err.message).split('\n')[0]}`], results: {} }; }
    const at = (s) => { const d = join(work, s); mkdirSync(d, { recursive: true }); cpSync(bundle, join(d, 'loader.mjs')); return d; };
    const nonce = (s) => `${s}-${process.pid}-${Date.now()}`;
    const fails = [];
    const results = {};
    const expectNonce = (label, want, r) => {
        results[label] = r.ok && r.nonce === want ? 'loaded' : 'red';
        if (!r.ok) fails.push(`${label}: the stub SDK was not loaded (${r.code ?? 'no code'}: ${r.message})`);
        else if (r.nonce !== want) fails.push(`${label}: a module other than the stub SDK was loaded (nonce ${r.nonce})`);
    };
    const expectMissing = (label, r, dir) => {
        results[label] = !r.ok && r.code === MISSING ? 'rejected' : 'red';
        if (r.ok) fails.push(`${label}: the loader resolved an SDK (nonce ${r.nonce}) where it must report the package missing`);
        else if (r.code !== MISSING) fails.push(`${label}: the rejection has code ${r.code}, not ${MISSING} (Orca's missing-package path)`);
        else if (!r.message.includes(SDK_PKG) || (dir && !r.message.includes(dir))) fails.push(`${label}: the rejection message does not name ${SDK_PKG}${dir ? ` and ${dir}` : ''}: ${r.message}`);
    };

    const s1 = at('s1');
    const n1 = nonce('s1');
    stubSdk(join(s1, 'pkg'), n1);
    expectNonce('S1 (value names a package directory)', n1, runLoader(join(s1, 'loader.mjs'), s1, envName, join(s1, 'pkg')));

    const s2 = at('s2');
    stubSdk(join(s2, 'node_modules', SDK_PKG), nonce('s2'));
    expectMissing('S2 (empty value)', runLoader(join(s2, 'loader.mjs'), s2, envName, ''), null);

    const s3 = at('s3');
    mkdirSync(join(s3, 'empty'));
    expectMissing('S3 (directory without the package)', runLoader(join(s3, 'loader.mjs'), s3, envName, join(s3, 'empty')), join(s3, 'empty'));

    const s4 = at('s4');
    stubSdk(join(s4, 'node_modules', SDK_PKG), nonce('s4'));
    mkdirSync(join(s4, 'inner'));
    expectMissing('S4 (no walk-up to a parent node_modules)', runLoader(join(s4, 'loader.mjs'), s4, envName, join(s4, 'inner')), join(s4, 'inner'));

    const s5 = at('s5');
    const n5 = nonce('s5');
    stubSdk(join(s5, 'node_modules', SDK_PKG), n5);
    expectNonce('S5 (unset, stock lookup)', n5, runLoader(join(s5, 'loader.mjs'), s5, envName, undefined));
    return { fails, results };
}

/** Every regular file under `dir`, symlinks not followed. */
function filesUnder(dir) {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...filesUnder(p));
        else if (e.isFile()) out.push(p);
    }
    return out;
}

/**
 * The --built leg: `externals` must list the SDK; the version needle from `sdkDir` must be found in its
 * sdk.mjs (else a broken instrument) and in no file under `outDir`.
 */
export function builtLeg({ outDir, sdkDir, externals }) {
    const fails = [];
    if (!Array.isArray(externals) || !externals.includes(SDK_PKG)) fails.push(`ORCAD_EXTERNAL_MODULES (${JSON.stringify(externals)}) does not list ${SDK_PKG}, so build:orcad bundles it`);
    let version = null;
    try { version = JSON.parse(readFileSync(join(sdkDir, 'package.json'), 'utf8')).version; } catch { /* reported below */ }
    if (typeof version !== 'string' || !version) return { fails: [...fails, `broken instrument: no version in ${join(sdkDir, 'package.json')}`], needle: null, scanned: 0 };
    const needle = `CLAUDE_AGENT_SDK_VERSION="${version}"`;
    if (!(read(join(sdkDir, 'sdk.mjs')) ?? '').includes(needle)) {
        return { fails: [...fails, `broken instrument: the needle ${needle} is not in ${join(sdkDir, 'sdk.mjs')}, so its absence from the build would prove nothing`], needle, scanned: 0 };
    }
    const files = filesUnder(outDir);
    for (const f of files) if (readFileSync(f).includes(needle)) fails.push(`${f} carries ${needle}: the SDK is still bundled`);
    return { fails, needle, scanned: files.length };
}

/** The OrcaEnv behavior table (P68-38). `env` is the imported OrcaEnv module. Returns red reasons. */
export function orcaEnvTable(env) {
    const fails = [];
    if (typeof env.claudeAgentSdkDir !== 'function' || typeof env.buildOrcadEnv !== 'function') return ['OrcaEnv exports no claudeAgentSdkDir or no buildOrcadEnv'];
    if (env.CLAUDE_AGENT_SDK_EXTENSION_ID !== EXTENSION_ID) fails.push(`OrcaEnv.CLAUDE_AGENT_SDK_EXTENSION_ID is ${env.CLAUDE_AGENT_SDK_EXTENSION_ID}, not ${EXTENSION_ID} (the id lane 68-09 ships)`);
    const path = `/p/${env.THEIA_CONFIG_DIR_NAME}/${SDK_SUBPATH}`;
    const disabled = (value) => ({ 'installedPlugins.disabledPlugins': value });
    const rows = [
        ['no settings file', null, path],
        ['the extension disabled', disabled(JSON.stringify([EXTENSION_ID])), ''],
        ['the extension disabled by a versioned id', disabled(JSON.stringify([`${EXTENSION_ID}@1.0.0`])), ''],
        ['a malformed disabled list', disabled('["powerbrowser.claude'), path],
        ['a non-array disabled list', disabled(JSON.stringify({ [EXTENSION_ID]: true })), path],
        ['another id disabled', disabled(JSON.stringify(['vscode.git'])), path],
        ['no disabled key', { other: 1 }, path],
    ];
    for (const [label, backendSettings, want] of rows) {
        let got;
        try { got = env.claudeAgentSdkDir({ profileDir: '/p', backendSettings }); } catch (err) { got = `threw ${err.message}`; }
        if (got !== want) fails.push(`table: ${label}: claudeAgentSdkDir returned ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
    }
    const name = env.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV;
    if (!(env.ORCAD_FIXED_ENV_NAMES ?? []).includes(name)) fails.push(`OrcaEnv.ORCAD_FIXED_ENV_NAMES does not hold ${name}, so orcad may inherit it`);
    const opts = { dataRoot: '/d', orcaVersion: '1.0.0' };
    try { env.buildOrcadEnv(() => '', opts); fails.push('table: buildOrcadEnv accepts no claudeAgentSdkDir; every caller must decide'); } catch { /* required */ }
    try {
        const built = env.buildOrcadEnv(() => '', { ...opts, claudeAgentSdkDir: '' });
        if (built[name] !== '') fails.push(`table: buildOrcadEnv with claudeAgentSdkDir "" sets ${name} to ${JSON.stringify(built[name])}`);
    } catch (err) { fails.push(`table: buildOrcadEnv throws for claudeAgentSdkDir "": ${err.message}`); }
    try {
        const built = env.buildOrcadEnv((n) => (n === name ? '/inherited' : ''), { ...opts, claudeAgentSdkDir: '/x' });
        if (built[name] !== '/x') fails.push(`table: buildOrcadEnv sets ${name} to ${JSON.stringify(built[name])}, not the decided /x`);
    } catch (err) { fails.push(`table: buildOrcadEnv throws for claudeAgentSdkDir /x: ${err.message}`); }
    return fails;
}

/** THEIA_CONFIG_DIR_NAME against the folder TheiaService._resolveConfigDir appends to the profile directory. */
export function theiaDirFails(theiaSource, env) {
    const m = /_resolveConfigDir\(\)\s*\{[\s\S]*?return `\$\{profileDir\}\/([^`/]+)`/.exec(String(theiaSource ?? ''));
    if (!m) return ['derivation: TheiaService._resolveConfigDir has no `${profileDir}/<folder>` template, so the Theia config folder cannot be compared'];
    return m[1] === env.THEIA_CONFIG_DIR_NAME ? [] : [`derivation: OrcaEnv.THEIA_CONFIG_DIR_NAME is ${env.THEIA_CONFIG_DIR_NAME}, TheiaService._resolveConfigDir uses ${m[1]}`];
}

/** ORCAD_EXTERNAL_MODULES, imported by file URL in a child node (the module imports a .ts file). */
function readExternals(orcaDir) {
    const url = pathToFileURL(join(orcaDir, ENTRY_BUILD_REL)).href;
    const out = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', `const m = await import(${JSON.stringify(url)}); console.log(JSON.stringify(m.ORCAD_EXTERNAL_MODULES));`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out.trim().split('\n').pop());
}

/** True when orca/<rel> differs from the pin (the overlay is applied to it). */
function seamApplied(orcaDir, rel) {
    try { execFileSync('git', ['-C', orcaDir, 'diff', '--quiet', 'HEAD', '--', rel], { stdio: 'ignore' }); return false; } catch { return true; }
}

/** The OrcaEnv leg over `root`: the table and the Theia folder derivation. Resolves { fails, env }. */
async function orcaEnvLeg(root) {
    let env;
    try { env = await import(`${pathToFileURL(join(root, 'powerbrowser', 'shell', 'OrcaEnv.sys.mjs')).href}?t=${Date.now()}`); } catch (err) { return { fails: [`OrcaEnv.sys.mjs does not import in Node: ${err.message}`], env: null }; }
    return { fails: [...orcaEnvTable(env), ...theiaDirFails(read(join(root, 'powerbrowser', 'shell', 'TheiaService.sys.mjs')), env)], env };
}

/** The loader leg over `root`; { skip } when orca/ is not fetched, the seam is not applied, or no esbuild. */
async function loaderLeg(root, env) {
    const orcaDir = join(root, 'orca');
    const src = join(orcaDir, LOADER_REL);
    if (!existsSync(join(orcaDir, '.git')) || !existsSync(src)) return { skip: 'orca/ is not fetched (bash scripts/fetch-orca.sh)' };
    if (!seamApplied(orcaDir, LOADER_REL)) return { skip: `the overlay is not applied to orca/${LOADER_REL} (nix develop .#orca --command bash scripts/build-orca.sh)` };
    const eb = resolveEsbuild([orcaDir, join(root, 'theia')]);
    if (!eb) return { skip: 'no esbuild in orca/node_modules or theia/node_modules (build-orca.sh, or yarn install in theia/)' };
    const name = envNameFrom(read(src));
    const fails = tokenFails(name);
    if (name && env && name !== env.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV) fails.push(`the loader reads ${name}, OrcaEnv sets ${env.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV}`);
    const r = await loaderScenarios(eb.esbuild, src, name ?? 'ORCA_CLAUDE_AGENT_SDK_DIR', join(root, WORK_REL));
    fails.push(...r.fails);
    return { fails, name, results: r.results };
}

async function defaultMode(root) {
    const e = await orcaEnvLeg(root);
    const l = await loaderLeg(root, e.env);
    return { fails: [...e.fails, ...(l.fails ?? [])], skip: l.skip, name: l.name, results: l.results ?? {} };
}

function builtMode(root) {
    const orcaDir = join(root, 'orca');
    if (!existsSync(join(orcaDir, 'out', 'orcad'))) return { skip: 'orca/out/orcad is absent (nix develop .#orca --command bash scripts/build-orca.sh)' };
    let externals;
    try { externals = readExternals(orcaDir); } catch (err) { return { fails: [`ORCAD_EXTERNAL_MODULES could not be imported from orca/${ENTRY_BUILD_REL}: ${String(err.message).split('\n')[0]}`] }; }
    return builtLeg({ outDir: join(orcaDir, 'out'), sdkDir: join(orcaDir, 'node_modules', SDK_PKG), externals });
}

/**
 * The loader as seam 070 leaves it, from the patch alone: its added import lines, then every complete
 * top-level let/function statement in the hunks' post-images (a statement cut by a hunk edge is dropped).
 */
export function loaderFromPatch(patch) {
    const imports = [];
    const statements = [];
    for (const hunk of String(patch).split(/^@@.*$/m).slice(1)) {
        const post = hunk.split('\n').filter((l) => l.startsWith(' ') || l.startsWith('+') || l === '').map((l) => l.slice(1));
        for (const l of hunk.split('\n')) if (/^\+import /.test(l)) imports.push(l.slice(1));
        let open = null;
        let depth = 0;
        for (const line of post) {
            if (open === null && !/^(let |const |(export )?(async )?function )/.test(line)) continue;
            if (open === null) open = [];
            open.push(line);
            depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
            if (depth === 0) { statements.push(open.join('\n')); open = null; }
        }
    }
    return `${imports.join('\n')}\n\n${statements.join('\n\n')}\n`;
}

const FIXTURE_THEIA = '  _resolveConfigDir() {\n    const profileDir = PowerBrowserAPI.getProfileDir();\n    if (profileDir) {\n      return `${profileDir}/powerbrowser-theia`;\n    }\n  }\n';

async function runSelfTest() {
    const eb = resolveEsbuild([join(REPO_ROOT, 'orca'), join(REPO_ROOT, 'theia')]);
    if (!eb) {
        console.log(`${NAME} self-test: SKIP -- no esbuild in orca/node_modules or theia/node_modules (build-orca.sh, or yarn install in theia/)`);
        return 0;
    }
    const patch = read(join(REPO_ROOT, 'orca-overlay', 'patches', '070-claude-agent-sdk-dir.patch'));
    const orcaEnvText = read(join(REPO_ROOT, 'powerbrowser', 'shell', 'OrcaEnv.sys.mjs'));
    if (patch === null || orcaEnvText === null) {
        console.error(`${NAME} self-test: FAIL -- orca-overlay/patches/070-claude-agent-sdk-dir.patch or powerbrowser/shell/OrcaEnv.sys.mjs is missing`);
        return 1;
    }
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        const loaderText = loaderFromPatch(patch);
        let n = 0;
        const importEnv = async (text) => { const f = join(tmp, `OrcaEnv-${n++}.mjs`); writeFileSync(f, text); return import(pathToFileURL(f).href); };
        const baseEnv = await importEnv(orcaEnvText);
        // One world per run: fixture loader source, OrcaEnv text, TheiaService text, out/ and SDK fixtures.
        const runWorld = async (w) => {
            const dir = join(tmp, `w${n++}`);
            mkdirSync(dir);
            const src = join(dir, 'loader.ts');
            writeFileSync(src, w.loader);
            const env = w.env === orcaEnvText ? baseEnv : await importEnv(w.env);
            const name = envNameFrom(w.loader);
            const fails = [...tokenFails(name)];
            if (name && name !== env.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV) fails.push(`the loader reads ${name}, OrcaEnv sets ${env.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV}`);
            if (w.scenarios) fails.push(...(await loaderScenarios(eb.esbuild, src, name ?? baseEnv.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV, join(dir, 'run'))).fails);
            fails.push(...orcaEnvTable(env), ...theiaDirFails(w.theia, env));
            const out = join(dir, 'out');
            const sdk = join(dir, 'sdk');
            mkdirSync(join(out, 'orcad'), { recursive: true });
            mkdirSync(sdk);
            writeFileSync(join(out, 'orcad', 'orcad-server.js'), w.outText);
            writeFileSync(join(sdk, 'package.json'), JSON.stringify({ name: SDK_PKG, version: '9.9.9' }));
            writeFileSync(join(sdk, 'sdk.mjs'), w.sdkText);
            fails.push(...builtLeg({ outDir: out, sdkDir: sdk, externals: [SDK_PKG] }).fails);
            return fails;
        };
        const needle = 'CLAUDE_AGENT_SDK_VERSION="9.9.9"';
        const base = { loader: loaderText, env: orcaEnvText, theia: FIXTURE_THEIA, outText: 'module.exports = {};\n', sdkText: `var ${needle};\nexport {};\n`, scenarios: true };
        const control = await runWorld(base);
        if (control.length) {
            console.error(`${NAME} self-test: FAIL -- the control is not green: ${control.join(' | ')}`);
            return 1;
        }
        console.log(`  PASS control -> green (S1-S5 on the loader from the 070 post-image, token rule, OrcaEnv table, fixture derivation, --built leg)`);

        const swap = (text, a, b) => { if (!text.includes(a)) throw new Error(`plant target not found: ${a.slice(0, 60)}`); return text.split(a).join(b); };
        const stock = (text) => {
            const m = /(export function loadClaudeAgentSdk\(\)[^{]*\{\n)[\s\S]*?(\n {2}return claudeAgentSdk\n\})/.exec(text);
            if (!m) throw new Error('plant target not found: loadClaudeAgentSdk body');
            return text.replace(m[0], `${m[1]}  claudeAgentSdk ??= import('${SDK_PKG}')${m[2]}`);
        };
        const plants = [
            { name: 'stock loader, no seam', naming: 'S1', w: { ...base, loader: stock(loaderText) } },
            { name: 'an empty value treated as unset', naming: 'S2', w: { ...base, loader: swap(loaderText, 'dir === undefined', '!dir') } },
            { name: 'no inside-the-directory test', naming: 'S4', w: { ...base, loader: swap(loaderText, 'entry.startsWith(realpathSync(dir) + sep)', 'entry') } },
            { name: 'a PB token in the variable name', naming: 'token rule', w: { ...base, loader: swap(loaderText, 'ORCA_CLAUDE_AGENT_SDK_DIR', 'ORCA_PB_CLAUDE_AGENT_SDK_DIR'), scenarios: false } },
            { name: 'the needle in out/', naming: 'still bundled', w: { ...base, scenarios: false, outText: `var ${needle};\n` }, then: { ...base, scenarios: false } },
            { name: 'the needle absent from sdk.mjs', naming: 'broken instrument', w: { ...base, scenarios: false, sdkText: 'export {};\n' } },
            { name: 'THEIA_CONFIG_DIR_NAME drifted from the TheiaService template', naming: 'derivation', w: { ...base, scenarios: false, env: swap(orcaEnvText, 'THEIA_CONFIG_DIR_NAME = "powerbrowser-theia"', 'THEIA_CONFIG_DIR_NAME = "powerbrowser-theia-2"') } },
            { name: 'a disabled list that still returns the path', naming: 'table', w: { ...base, scenarios: false, env: swap(orcaEnvText, 'disabled.some(id => unversioned(id) === CLAUDE_AGENT_SDK_EXTENSION_ID)', 'false') } },
        ];
        let failures = 0;
        for (const p of plants) {
            const fails = await runWorld(p.w);
            const text = fails.join('\n');
            if (!fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; continue; }
            if (!text.includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++; continue; }
            if (p.then) {
                const after = await runWorld(p.then);
                if (after.length) { console.error(`  FAIL ${p.name} -> the same out/ without the needle is red: ${after.join(' | ')}`); failures++; continue; }
            }
            console.log(`  PASS ${p.name} -> red, naming '${p.naming}'${p.then ? '; without it, green' : ''}`);
        }
        if (failures) {
            console.error(`${NAME} self-test: FAIL -- ${failures} of ${plants.length} plant(s) did not go red naming the drift`);
            return 1;
        }
        console.log(`${NAME} self-test: PASS -- control green, ${plants.length} planted faults each went red naming the drift`);
        return 0;
    } catch (err) {
        console.error(`${NAME} self-test: FAIL -- ${err.message}`);
        return 1;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const unknown = args.find((a) => a !== '--built' && a !== '--self-test');
    if (unknown !== undefined || args.length > 1) {
        console.error(`${NAME}: FAIL -- unknown argument '${unknown ?? args[1]}' (usage: node ${SELF_REL} [--built | --self-test])`);
        console.error(`  Next step: run: node ${SELF_REL}, add --built after build-orca.sh, or --self-test to prove the check discriminates.`);
        process.exit(2);
    }
    if (args[0] === '--self-test') process.exit(await runSelfTest());
    const built = args[0] === '--built';
    const label = built ? `${NAME}-built` : NAME;
    const r = built ? builtMode(REPO_ROOT) : await defaultMode(REPO_ROOT);
    if (r.skip && (built || !r.fails.length)) {
        console.log(`${label}: SKIP${built ? '' : ' of the loader scenarios (the OrcaEnv leg passed)'} -- ${r.skip}`);
        process.exit(0);
    }
    if (r.fails.length) {
        for (const f of r.fails) console.error(`${label}: FAIL -- ${f}`);
        process.exit(1);
    }
    if (built) console.log(`${label}: PASS -- ORCAD_EXTERNAL_MODULES lists ${SDK_PKG}; the needle ${r.needle} is in the installed SDK's sdk.mjs and in none of ${r.scanned} files under orca/out`);
    else console.log(`${label}: PASS -- loadClaudeAgentSdk reads ${r.name} (no PowerBrowser token, OrcaEnv's name); ${Object.entries(r.results).map(([k, v]) => `${k.split(' ')[0]} ${v}`).join(', ')}; OrcaEnv table and the Theia config folder hold`);
    process.exit(0);
}
