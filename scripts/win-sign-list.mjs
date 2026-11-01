#!/usr/bin/env node
// scripts/win-sign-list.mjs
//
// What the sign-windows job (release.yml, SEC-12) may sign, DERIVED from the tree and compared with the
// staged package, so legion's output never decides which bytes get the Authenticode signature.
//
//  --expected-base   prints "<base>\t<top>": the package zip base name and its one top directory, from
//                    configuration.toml ([identity] app_basename and the release ESR version, releaseIdentity)
//                    and the mach package tokens en-US.win64 (upstream browser/locales AB_CD default and
//                    toolkit/mozapps/installer/package-name.mk MOZ_PKG_PLATFORM for win64). The same tokens
//                    are the zip glob of powerbrowser/packaging/package-windows.sh; the self-test compares them.
//  --list --pkg <dir> [--manifest <package-manifest.in>]
//                    the PE files (.exe, .dll) under <dir>, the unpacked top directory, compared with the
//                    upstream package manifest (default upstream/browser/installer/package-manifest.in):
//                      allowed   every manifest entry naming a .exe or .dll, under any condition, with
//                                @BINPATH@/@RESPATH@ the top directory, @DLL_PREFIX@ empty, @DLL_SUFFIX@ .dll,
//                                @BIN_SUFFIX@ .exe, @MOZ_APP_NAME@ the app basename, any other @TOKEN@ and *
//                                one path segment;
//                      required  the entries outside every #if block with no wildcard: they ship in every build.
//                    A PE file the manifest does not allow (an extra) and a required entry that is absent
//                    (a missing one) are each red naming the file; zero PE files is red. On green it prints
//                    the sorted relative paths, one per line, and nothing else.
//                    Not signed and not listed: node/ (the vendor-signed Node runtime) and theia/ (the
//                    sidecar, built on windows-latest; BLOCKED.md item 8 owns its file list).
//  --self-test       mkdtemp fixtures over the real manifest; writes nothing in the repo.
//
// shortcut: conditional manifest entries are allowed but not required, because the build's defines live
// in legion's config.status, which this job does not trust. Upgrade to exact set equality when the
// hosted job evaluates the manifest with defines it derives itself.

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseIdentity, resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'win-sign-list';
const SELF_REL = 'scripts/win-sign-list.mjs';
const MANIFEST_REL = 'upstream/browser/installer/package-manifest.in';
const PACKAGE_SH_REL = 'powerbrowser/packaging/package-windows.sh';
export const WIN_PKG_TOKENS = 'en-US.win64';
const SKIP = ['node/', 'theia/'];
export const NAME_RE = /^[A-Za-z0-9._/-]+$/;
const PE = /\.(exe|dll)$/i;

const usage = `Next step: run node ${SELF_REL} --self-test, or read its header for the modes.`;
function refuse(msg) {
    console.error(`${NAME}: FAIL -- ${msg}`);
    console.error(`  ${usage}`);
    process.exit(2);
}

export function expectedBase(root = REPO_ROOT) {
    const { config, failures } = resolveConfig(join(root, 'configuration.toml'));
    if (failures.length > 0 || config === undefined) return null;
    const app = config.identity.app_basename;
    const esr = releaseIdentity(config).esrVersion;
    if (!/^[a-z0-9]+$/.test(app) || !/^\d+(\.\d+)*$/.test(String(esr))) return null;
    return { base: `${app}-${esr}.${WIN_PKG_TOKENS}`, top: app };
}

/** The PE entries of a package manifest: { allowed: RegExp[], required: string[] }. */
export function manifestPe(text, app) {
    const allowed = [];
    const required = [];
    let depth = 0;
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (/^#(if|ifdef|ifndef)\b/.test(line)) { depth += 1; continue; }
        if (/^#endif\b/.test(line)) { depth = Math.max(0, depth - 1); continue; }
        if (line.startsWith('#') || line.startsWith(';') || line.startsWith('[') || line === '') continue;
        const m = /^@(?:BINPATH|RESPATH)@\/(\S+)$/.exec(line);
        if (m === null) continue;
        const path = m[1].replace(/@DLL_PREFIX@/g, '').replace(/@DLL_SUFFIX@/g, '.dll').replace(/@BIN_SUFFIX@/g, '.exe').replace(/@MOZ_APP_NAME@/g, app);
        if (!PE.test(path.replace(/@[A-Z_]+@$/, ''))) continue;
        const open = /[*]|@[A-Z_]+@/.test(path);
        const re = new RegExp(`^${path.split(/(\*|@[A-Z_]+@)/).map(p => (p === '*' || /^@[A-Z_]+@$/.test(p) ? '[^/]*' : p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))).join('')}$`, 'i');
        allowed.push(re);
        if (depth === 0 && !open) required.push(path);
    }
    return { allowed, required };
}

function peFiles(dir) {
    const out = [];
    const walk = d => {
        for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const p = join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.isFile() && PE.test(e.name)) out.push(relative(dir, p).split('\\').join('/'));
        }
    };
    walk(dir);
    return out.filter(r => !SKIP.some(s => r.startsWith(s))).sort();
}

/** Returns { failures, list }. */
export function listChecks(pkgDir, manifestText, app) {
    const failures = [];
    if (manifestText === null) return { failures: [`${MANIFEST_REL} is unreadable, so nothing can be allowed. Next step: fetch the pinned source first.`], list: [] };
    const { allowed, required } = manifestPe(manifestText, app);
    if (allowed.length === 0) return { failures: ['the package manifest names no .exe or .dll, so nothing can be allowed. Next step: check the manifest path.'], list: [] };
    let list;
    try {
        list = peFiles(pkgDir);
    } catch (e) {
        return { failures: [`${pkgDir} cannot be read (${e.message}). Next step: unpack the staged zip first.`], list: [] };
    }
    if (list.length === 0) failures.push(`${pkgDir} holds no .exe or .dll to sign. Next step: check the staged zip.`);
    for (const f of list) {
        if (!NAME_RE.test(f)) failures.push(`unsafe file name ${JSON.stringify(f)} in the staged tree. Next step: rebuild; nothing is signed.`);
        else if (!allowed.some(re => re.test(f))) failures.push(`extra: ${f} is a PE file the package manifest does not name, so it is not signed. Next step: find out what put it in the staged tree.`);
    }
    const have = new Set(list.map(f => f.toLowerCase()));
    for (const r of required) if (!have.has(r.toLowerCase())) failures.push(`missing: ${r} is a PE file every build ships (unconditional in the package manifest) and it is absent. Next step: rebuild the package.`);
    return { failures, list: failures.length > 0 ? [] : list };
}

function selfTest() {
    const manifest = (() => { try { return readFileSync(join(REPO_ROOT, MANIFEST_REL), 'utf8'); } catch { return null; } })();
    const want = expectedBase();
    if (manifest === null || want === null) {
        console.error(`${NAME}: --self-test FAIL -- the pinned manifest or configuration.toml is unreadable, so no fixture can be built`);
        return 1;
    }
    let failed = 0;
    const pkgSh = readFileSync(join(REPO_ROOT, PACKAGE_SH_REL), 'utf8');
    if (pkgSh.includes(`*.${WIN_PKG_TOKENS}.zip`)) console.log(`  ok  ${PACKAGE_SH_REL} globs the same *.${WIN_PKG_TOKENS}.zip the expected base ${want.base} carries`);
    else { console.error(`${NAME}: --self-test FAIL -- ${PACKAGE_SH_REL} no longer globs *.${WIN_PKG_TOKENS}.zip, so the expected zip name drifted from the producer`); failed += 1; }
    const { required } = manifestPe(manifest, want.top);
    const dirs = [];
    const make = files => {
        const d = mkdtempSync(join(tmpdir(), 'win-sign-list-'));
        dirs.push(d);
        for (const f of files) {
            mkdirSync(dirname(join(d, f)), { recursive: true });
            writeFileSync(join(d, f), 'MZ fixture\n');
        }
        return d;
    };
    try {
        const good = [...required, 'node/node.exe', 'theia/rg.exe', 'browser/omni.ja'];
        const control = listChecks(make(good), manifest, want.top);
        if (control.failures.length > 0 || control.list.length !== required.length) {
            console.error(`${NAME}: --self-test FAIL -- the control (the ${required.length} required PE file(s)) is red: ${control.failures.join(' | ')}`);
            return 1;
        }
        console.log(`  ok  control: the ${required.length} unconditional PE file(s) -> green; node/ and theia/ are not listed`);
        const optional = listChecks(make([...required, 'msvcp140.dll']), manifest, want.top);
        if (optional.failures.length > 0) { console.error(`${NAME}: --self-test FAIL -- a conditional manifest entry (msvcp*.dll) went red: ${optional.failures.join(' | ')}`); failed += 1; }
        else console.log('  ok  a conditional manifest entry (msvcp140.dll) -> allowed');
        const plants = [
            ['extra PE file the manifest does not name', make([...required, 'implant.dll']), 'extra: implant.dll'],
            ['required PE file missing', make(required.slice(1)), `missing: ${required[0]}`],
            ['unsafe file name', make([...required, 'bad name.exe']), 'unsafe file name'],
            ['zero PE files', make(['browser/omni.ja']), 'holds no .exe or .dll'],
        ];
        for (const [name, dir, value] of plants) {
            const { failures } = listChecks(dir, manifest, want.top);
            if (failures.some(f => f.includes(value))) console.log(`  ok  ${name} -> red, naming '${value}'`);
            else { console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${value}'; got: ${failures.join(' | ') || '(no failures)'}`); failed += 1; }
        }
        const none = listChecks(make(required), null, want.top);
        if (none.failures.some(f => f.includes('unreadable'))) console.log('  ok  unreadable manifest -> red');
        else { console.error(`${NAME}: --self-test FAIL -- an unreadable manifest did not go red`); failed += 1; }
    } finally {
        for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- expected base ${want.base}, top ${want.top}; controls green and the planted faults went red naming the file`);
    return 0;
}

const DIRECT_RUN = (() => {
    try {
        return process.argv[1] !== undefined && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
})();

function main(argv) {
    if (argv.length === 1 && argv[0] === '--self-test') return selfTest();
    if (argv.length === 1 && argv[0] === '--expected-base') {
        const want = expectedBase();
        if (want === null) refuse('configuration.toml does not yield an app basename and an ESR version');
        console.log(`${want.base}\t${want.top}`);
        return 0;
    }
    if (argv[0] !== '--list') refuse(`unknown arguments ${JSON.stringify(argv)}`);
    const opts = {};
    for (let i = 1; i < argv.length; i += 2) {
        if (!['--pkg', '--manifest'].includes(argv[i]) || argv[i + 1] === undefined) refuse(`unknown or valueless argument '${argv[i]}'`);
        opts[argv[i]] = argv[i + 1];
    }
    if (opts['--pkg'] === undefined) refuse('--list needs --pkg <dir>');
    const want = expectedBase();
    if (want === null) refuse('configuration.toml does not yield an app basename');
    const mPath = resolve(opts['--manifest'] ?? join(REPO_ROOT, MANIFEST_REL));
    let text = null;
    try { if (statSync(mPath).isFile()) text = readFileSync(mPath, 'utf8'); } catch { text = null; }
    const { failures, list } = listChecks(resolve(opts['--pkg']), text, want.top);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s); nothing is signed.`);
        failures.forEach(f => console.error(`  - ${f}`));
        return 1;
    }
    process.stdout.write(`${list.join('\n')}\n`);
    return 0;
}

if (DIRECT_RUN) process.exit(main(process.argv.slice(2)));
