// scripts/lib/orca-shipped-packages.mjs
//
// The third-party npm packages PowerBrowser ships inside Orca's build output
// (Phase 68, PLAT-01, P68-24, P68-25). Consumers: scripts/generate-licensing.mjs
// (the Orca section of THIRD-PARTY-NOTICES.txt) and scripts/verify-licence-allowlist.mjs
// (the per-package licence rule).
//
// Derived from what the bundles contain, never from `pnpm list --prod` alone: Vite
// bundles devDependencies such as react into out/web, and esbuild inlines the
// production closure into out/orcad, so neither lockfile view is the shipped set.
// The four sources:
//  1. out/orcad: an esbuild metafile pass (write: false) over Orca's own exported
//     entry configuration (orca/config/scripts/orcad-entry-build.mjs: ORCAD_ENTRY_POINT,
//     ORCAD_CHILD_ENTRY_POINTS, ORCAD_LAUNCHER_ENTRY_POINT, ORCAD_EXTERNAL_MODULES,
//     ORCAD_BUNDLE_PLUGINS), run with Orca's installed esbuild. A package Orca lists in
//     ORCAD_EXTERNAL_MODULES is not bundled, so it leaves this set with no change here.
//  2. out/orcad/node_modules: every package build:orcad stages there, read from its
//     source package under orca/node_modules; a staged bundle (index.js, no package.json)
//     gets its own metafile pass so the packages inlined into it count too. Packages
//     build-orcad.mjs copies files out of (join(ROOT, 'node_modules', ...)) count as well.
//  3. out/web: a scratch Vite build through Orca's run-vite-web-build.mjs with
//     --sourcemap --outDir .mozbuild/orca-shipped/web-<key>-<pid>; the maps' sources name
//     every module the client bundles.
//  4. out/mobile-web: the production closure of orca/mobile (pnpm list --prod). This is
//     a superset (it includes build tools of the Expo closure), so an overcount is
//     possible and a miss is not.
//
// Cache: .mozbuild/orca-shipped/<key>.json, key = sha256 of the orca/ HEAD, every
// tracked orca-overlay/ file (path and content), both pnpm lockfiles and this file.
// The Vite build runs only on a miss.
//
// Limit: a bundler-resolved package is named by the node_modules directory its input
// came from (the pnpm layout node_modules/.pnpm/<id>/node_modules/<name>); Orca's own
// workspace sources are not third-party packages and are covered by the orca tree row
// of inventory/licence-allowlist.json.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
export const BUILD_ORCA = 'nix develop .#orca --command bash scripts/build-orca.sh';
export const BUNDLES = ['orcad', 'web', 'mobile-web'];

// --- per-package record (shared with generate-licensing.mjs) --------------------

const LICENCE_FILE = /^(licen[cs]e|copying|notice)/i;

export function licenseField(pkg) {
    const l = pkg.license ?? pkg.licenses;
    if (typeof l === 'string') return l;
    if (Array.isArray(l)) return l.map((x) => (typeof x === 'string' ? x : x?.type)).filter(Boolean).join(' OR ') || 'no license field';
    if (typeof l?.type === 'string') return l.type;
    return 'no license field';
}

/** Licence, copying and notice files in the package root, in code-unit order. */
export function licenceFiles(dir) {
    return readdirSync(dir).filter((f) => LICENCE_FILE.test(f) && statSync(join(dir, f)).isFile()).sort();
}

// Licence, copying and notice files in the package root, in code-unit order, concatenated.
export function licenceText(dir) {
    const texts = licenceFiles(dir)
        .map((f) => readFileSync(join(dir, f), 'utf8').replace(/\r\n?/g, '\n').trimEnd())
        .filter((t) => t !== '');
    return texts.length > 0 ? texts.join('\n\n') : null;
}

/** The package directory an input path came from, or null for a non-package path. */
export function packageDirOf(path) {
    const parts = path.split(/[\\/]/);
    const i = parts.lastIndexOf('node_modules');
    if (i < 0 || !parts[i + 1] || parts[i + 1].startsWith('.')) return null;
    const n = parts[i + 1].startsWith('@') ? 2 : 1;
    if (parts.length < i + 1 + n) return null;
    return parts.slice(0, i + 1 + n).join(sep);
}

// Collects records keyed by real package directory; the same name@version and licence
// text from two directories (pnpm peer variants) merge into one record.
class Collector {
    constructor(repoRoot) { this.repoRoot = repoRoot; this.byDir = new Map(); }

    add(dir, bundle, from) {
        let real;
        try { real = realpathSync(dir); } catch { throw new Error(`${from} names ${dir}, which does not exist`); }
        const hit = this.byDir.get(real);
        if (hit) { hit.shippedIn.add(bundle); return; }
        const pj = join(real, 'package.json');
        if (!existsSync(pj)) throw new Error(`${from} names ${real}, which has no package.json`);
        const pkg = JSON.parse(readFileSync(pj, 'utf8'));
        this.byDir.set(real, { name: pkg.name, version: pkg.version, license: licenseField(pkg), text: licenceText(real), dir: relative(this.repoRoot, real), shippedIn: new Set([bundle]) });
    }

    addPath(path, bundle, from) {
        const dir = packageDirOf(path);
        if (dir) this.add(dir, bundle, from);
    }

    packages() {
        const merged = new Map();
        for (const p of this.byDir.values()) {
            const key = `${p.name}@${p.version}\0${p.text}`;
            const hit = merged.get(key);
            if (hit) { for (const b of p.shippedIn) hit.shippedIn.add(b); continue; }
            merged.set(key, { ...p, shippedIn: new Set(p.shippedIn) });
        }
        const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
        return [...merged.values()]
            .map((p) => ({ ...p, shippedIn: BUNDLES.filter((b) => p.shippedIn.has(b)) }))
            .sort((a, b) => cmp(`${a.name}@${a.version}`, `${b.name}@${b.version}`) || cmp(a.dir, b.dir));
    }
}

// --- 1 and 2: out/orcad ----------------------------------------------------------

async function orcadInputs(orcaDir, collector) {
    const cfgPath = join(orcaDir, 'config/scripts/orcad-entry-build.mjs');
    const cfg = await import(pathToFileURL(cfgPath).href);
    for (const k of ['ORCAD_ENTRY_POINT', 'ORCAD_LAUNCHER_ENTRY_POINT', 'ORCAD_CHILD_ENTRY_POINTS', 'ORCAD_EXTERNAL_MODULES', 'ORCAD_BUNDLE_PLUGINS', 'ORCAD_COMMONJS_MODULE_OPTIONS']) {
        if (cfg[k] === undefined) throw new Error(`${cfgPath} no longer exports ${k}; the orcad metafile pass cannot follow Orca's build`);
    }
    const esbuildMod = await import(pathToFileURL(createRequire(join(orcaDir, 'package.json')).resolve('esbuild')).href);
    const build = esbuildMod.build ?? esbuildMod.default?.build;
    const common = {
        ...cfg.ORCAD_COMMONJS_MODULE_OPTIONS,
        bundle: true, platform: 'node', format: 'cjs', write: false, metafile: true, logLevel: 'silent',
        absWorkingDir: orcaDir, outdir: join(orcaDir, 'out/.pb-metafile-scratch'),
    };
    const define = { ...cfg.ORCAD_COMMONJS_MODULE_OPTIONS.define, 'process.env.NODE_ENV': '"production"' };
    const passes = [
        // build-orcad.mjs buildForkedChild and buildOrcadEntry: server and children share options.
        ['orcad server and children', { ...common, define, entryPoints: [cfg.ORCAD_ENTRY_POINT, ...Object.values(cfg.ORCAD_CHILD_ENTRY_POINTS)], external: cfg.ORCAD_EXTERNAL_MODULES, plugins: cfg.ORCAD_BUNDLE_PLUGINS }],
        // buildOrcadLauncher: no externals, no plugins.
        ['orcad launcher', { ...common, define: { ...cfg.ORCAD_COMMONJS_MODULE_OPTIONS.define, ORCAD_SERVER_SHA256: '""' }, entryPoints: [cfg.ORCAD_LAUNCHER_ENTRY_POINT] }],
        // shortcut: buildOrcadCli hard-codes its entry rather than exporting it; follow it if Orca exports one.
        ['orcad cli', { bundle: true, platform: 'node', format: 'cjs', write: false, metafile: true, logLevel: 'silent', absWorkingDir: orcaDir, outdir: join(orcaDir, 'out/.pb-metafile-scratch'), entryPoints: ['src/cli/index.ts'], plugins: cfg.ORCAD_BUNDLE_PLUGINS }],
    ];
    // A staged bundle (build:orcad wrote index.js without a package.json) inlines packages too.
    const staged = join(orcaDir, 'out/orcad/node_modules');
    for (const name of stagedNames(staged)) {
        collector.add(join(orcaDir, 'node_modules', name), 'orcad', `out/orcad/node_modules/${name}`);
        if (!existsSync(join(staged, name, 'package.json')) && existsSync(join(staged, name, 'index.js'))) {
            passes.push([`staged ${name}`, { ...common, define, stdin: { contents: `module.exports = require(${JSON.stringify(name)})`, resolveDir: orcaDir, sourcefile: 'pb-staged-entry.js' }, outdir: undefined, outfile: join(orcaDir, 'out/.pb-metafile-scratch/staged.js'), plugins: cfg.ORCAD_BUNDLE_PLUGINS }]);
        }
    }
    for (const [label, opts] of passes) {
        let result;
        try { result = await build(opts); } catch (e) { throw new Error(`the esbuild metafile pass for ${label} failed: ${String(e.message).split('\n')[0]}`); }
        for (const input of Object.keys(result.metafile.inputs)) {
            const path = input.replace(/^[a-z-]+:/i, '');
            collector.addPath(resolve(orcaDir, path), 'orcad', `the ${label} metafile input ${input}`);
        }
    }
    // Packages build-orcad.mjs copies files out of (binaries, licence folders).
    const buildOrcad = readFileSync(join(orcaDir, 'config/scripts/build-orcad.mjs'), 'utf8');
    for (const m of buildOrcad.matchAll(/join\(ROOT, 'node_modules', '([^']+)'(?:, '([^']+)')?/g)) {
        const name = m[1].startsWith('@') ? `${m[1]}/${m[2]}` : m[1];
        if (existsSync(join(orcaDir, 'node_modules', name, 'package.json'))) collector.add(join(orcaDir, 'node_modules', name), 'orcad', `build-orcad.mjs copy from node_modules/${name}`);
    }
}

function stagedNames(dir) {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const n of readdirSync(dir).sort()) {
        if (n.startsWith('.')) continue;
        if (n.startsWith('@')) for (const s of readdirSync(join(dir, n)).sort()) out.push(`${n}/${s}`);
        else out.push(n);
    }
    return out;
}

// --- 3: out/web ----------------------------------------------------------------------

// Inherited Orca and Node knobs never reach Orca's toolchain (build-orca.sh step 3).
function scrubbedEnv(extra = {}) {
    const env = { ...process.env, ...extra };
    for (const k of Object.keys(env)) if (k.startsWith('ORCA_')) delete env[k];
    delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS; delete env.NODE_REPL_EXTERNAL_MODULE;
    return env;
}

function mapFiles(dir) {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...mapFiles(p));
        else if (e.name.endsWith('.map')) out.push(p);
    }
    return out;
}

function webInputs(repoRoot, orcaDir, key, collector, log) {
    // One folder per process: two checks can miss the cache at once (the stop hook's quick run beside another).
    const scratch = join(repoRoot, '.mozbuild/orca-shipped', `web-${key}-${process.pid}`);
    rmSync(scratch, { recursive: true, force: true });
    const cmd = ['config/scripts/run-vite-web-build.mjs', '--sourcemap', '--outDir', scratch, '--emptyOutDir'];
    log(`building the web client with sourcemaps into .mozbuild/orca-shipped/web-${key}-${process.pid} (cache miss)`);
    const r = spawnSync(process.execPath, cmd, { cwd: orcaDir, env: scrubbedEnv(), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const named = `node ${cmd.join(' ')} (in orca/)`;
    if (r.error || r.status !== 0) {
        const last = (r.stderr || r.stdout || String(r.error ?? '')).trim().split('\n').slice(-3).join(' | ');
        throw new Error(`${named} exited ${r.status ?? r.error?.code}: ${last}`);
    }
    const maps = existsSync(scratch) ? mapFiles(scratch) : [];
    if (maps.length === 0) throw new Error(`${named} wrote no .map file, so the web client's packages cannot be read`);
    for (const map of maps) {
        const m = JSON.parse(readFileSync(map, 'utf8'));
        const base = resolve(dirname(map), m.sourceRoot ?? '');
        for (const src of m.sources ?? []) {
            if (typeof src !== 'string' || src.startsWith('\0')) continue;
            let path = src.startsWith('file://') ? fileURLToPath(src) : resolve(base, src.replace(/^[a-z-]+:(?!\/\/)/i, ''));
            // Worker chunks carry sources relative to Vite's root, not to the map: when the
            // map-relative package is absent, read its node_modules part against orca/.
            const dir = packageDirOf(path);
            const i = src.indexOf('node_modules/');
            if (dir && !existsSync(dir) && i >= 0) path = join(orcaDir, src.slice(i));
            collector.addPath(path, 'web', `${relative(repoRoot, map)} source ${src}`);
        }
    }
    rmSync(scratch, { recursive: true, force: true });
}

// --- 4: out/mobile-web -------------------------------------------------------------

function mobileInputs(repoRoot, orcaDir, collector) {
    const pnpm = join(repoRoot, '.mozbuild/corepack/bin/pnpm');
    if (!existsSync(pnpm)) throw new Error(`.mozbuild/corepack/bin/pnpm is absent, so orca/mobile's production closure cannot be listed. Next step: run: ${BUILD_ORCA}`);
    const r = spawnSync(pnpm, ['list', '--prod', '--json', '--depth', 'Infinity'], {
        cwd: join(orcaDir, 'mobile'), encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
        env: scrubbedEnv({ COREPACK_HOME: join(repoRoot, '.mozbuild/corepack'), COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' }),
    });
    if (r.error || r.status !== 0) throw new Error(`pnpm list --prod --json --depth Infinity in orca/mobile exited ${r.status ?? r.error?.code}: ${(r.stderr ?? '').trim().split('\n').pop()}`);
    const seen = new Set();
    const walk = (deps) => {
        for (const d of Object.values(deps ?? {})) {
            // An optional package for another platform (fsevents) is listed but not installed, so it cannot ship.
            if (!d?.path || seen.has(d.path) || !existsSync(d.path)) continue;
            seen.add(d.path);
            if (packageDirOf(d.path)) collector.add(d.path, 'mobile-web', `orca/mobile pnpm list entry ${d.from ?? ''}@${d.version ?? ''}`);
            walk(d.dependencies);
        }
    };
    for (const project of JSON.parse(r.stdout)) { walk(project.dependencies); walk(project.optionalDependencies); }
    if (seen.size === 0) throw new Error('pnpm list --prod in orca/mobile listed no package');
}

// --- cache -------------------------------------------------------------------------

/** sha256 of what can change the shipped set: orca/ HEAD, orca-overlay/, the lockfiles, this file. */
export function cacheKey(repoRoot, orcaDir) {
    const h = createHash('sha256');
    h.update(`orca ${execFileSync('git', ['-C', orcaDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()}\n`);
    const overlay = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z', '--', 'orca-overlay'], { encoding: 'utf8' }).split('\0').filter(Boolean).sort();
    for (const f of overlay) h.update(`overlay ${f} ${createHash('sha256').update(readFileSync(join(repoRoot, f))).digest('hex')}\n`);
    for (const f of ['pnpm-lock.yaml', 'mobile/pnpm-lock.yaml', SELF]) {
        const abs = resolve(orcaDir, f);
        h.update(`file ${f === SELF ? 'self' : f} ${existsSync(abs) ? createHash('sha256').update(readFileSync(abs)).digest('hex') : 'absent'}\n`);
    }
    return h.digest('hex');
}

// --- the derivation ----------------------------------------------------------------

/**
 * { skip } when orca/ is not built, else { packages, key, cacheHit } where packages is
 * [{ name, version, license, text, dir, shippedIn }] and shippedIn a sorted subset of
 * orcad, web, mobile-web. Throws on a derivation that cannot complete; never returns an
 * empty set as a result.
 */
export async function orcaShippedPackages({ repoRoot, orcaDir = join(repoRoot, 'orca'), log = () => {} }) {
    if (!existsSync(join(orcaDir, 'out/orcad/orcad.js'))) {
        return { skip: `no built orca/ (run ${BUILD_ORCA})` };
    }
    const key = cacheKey(repoRoot, orcaDir);
    const cacheFile = join(repoRoot, '.mozbuild/orca-shipped', `${key}.json`);
    if (existsSync(cacheFile)) {
        log(`Orca shipped set from the cache (key ${key.slice(0, 12)})`);
        return { packages: JSON.parse(readFileSync(cacheFile, 'utf8')).packages, key, cacheHit: true };
    }
    log(`Orca shipped set not cached (key ${key.slice(0, 12)}); deriving from the bundles`);
    const collector = new Collector(repoRoot);
    await orcadInputs(orcaDir, collector);
    webInputs(repoRoot, orcaDir, key, collector, log);
    mobileInputs(repoRoot, orcaDir, collector);
    const packages = collector.packages();
    for (const b of BUNDLES) if (!packages.some((p) => p.shippedIn.includes(b))) throw new Error(`the derivation found no package in ${b}, which cannot be right`);
    checkKnownPositive(orcaDir, packages);
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(`${cacheFile}.${process.pid}.tmp`, `${JSON.stringify({ key, packages }, null, 1)}\n`);
    renameSync(`${cacheFile}.${process.pid}.tmp`, cacheFile);
    return { packages, key, cacheHit: false };
}

// The agent SDK writes its version into orcad-server.js; a derivation that finds the
// constant but not the package has missed what the bundle carries.
function checkKnownPositive(orcaDir, packages) {
    const server = join(orcaDir, 'out/orcad/orcad-server.js');
    if (!existsSync(server)) return;
    if (/CLAUDE_AGENT_SDK_VERSION\s*=/.test(readFileSync(server, 'utf8')) && !packages.some((p) => p.name === '@anthropic-ai/claude-agent-sdk')) {
        throw new Error('out/orcad/orcad-server.js carries CLAUDE_AGENT_SDK_VERSION but the derived set has no @anthropic-ai/claude-agent-sdk: the metafile pass missed a bundled package');
    }
}
