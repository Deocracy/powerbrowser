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
//     --sourcemap --outDir .mozbuild/orca-shipped/web-<key>; the maps' sources name
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
    const collector = new Collector(repoRoot);
    await orcadInputs(orcaDir, collector);
    const packages = collector.packages();
    checkKnownPositive(orcaDir, packages);
    return { packages };
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
