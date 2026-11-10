#!/usr/bin/env node
// scripts/verify-orca-packaged-tree.mjs
//
// The orca-packaged-tree gate (Phase 68, PLAT-01, P68-01, P68-05, P68-06, P68-33): the Orca root a
// package ships, <GreD>/orca (macOS: Contents/Resources/orca), is exactly the built Orca tree's
// package.json, out/orcad/** and out/web/** -- nothing more, nothing less -- and its node-pty prebuild
// was compiled on the target's own runner.
//
// Derived at check time, never hand-kept:
//  a. the expected file set: package.json plus every regular file under out/orcad and out/web of
//     --built (default orca/), and of --also-built as a union (target macos: the two thin trees the
//     universal tree merges). Compared with every regular file under --stage as a set, both ways.
//  b. the slot-marker names, imported from orca/src/shared/orcad-artifacts.ts through
//     scripts/lib/orca-artifacts.mjs (never a copy of their values).
//  c. the Node executable names, imported from verify-orca-build-shape.mjs (NODE_NAMES).
//  d. with --prebuild-manifest: the one slot of Orca's out/orcad-prebuilds/manifest.json. Its platform and
//     arch are the compiling host's process.platform and process.arch (build-orcad-prebuilds.mjs), so a
//     slot equal to the target, whose files' sha256 set equals the staged
//     out/orcad/node_modules/node-pty/build/Release/* set, is the evidence that node-pty was built on the
//     target's own runner (P68-05). package-linux.sh strips every RUNPATH (patchelf --remove-rpath), which
//     rewrites only the ELF .dynamic section, so a staged ELF also matches when it equals the --built
//     tree's copy -- itself hashing to the slot's sha256 -- with its DT_RPATH and DT_RUNPATH entries
//     removed the way patchelf removes them. A universal macOS tree has no single slot, so --target macos refuses
//     the flag (exit 2); each thin tree is checked with its own manifest before the merge.
// Red on: a built file not staged, a staged file not built, a Node executable, a slot marker, an Electron
// binary (basename electron, electron.exe or Electron, or a node_modules/electron/ path segment), an empty
// stage (vacuous), a manifest with other than one slot, a slot for another platform or arch, and a
// node-pty file whose sha256 differs from the slot's. Symlinks are not followed (sidecar-no-symlinks
// judges them over the whole tarball).
//
// Tier: full. With no --stage it extracts the container-built Linux release tarball and checks its
// orca/ (target linux-x64, manifest orca/out/orcad-prebuilds/manifest.json); with no tarball it FAILs
// naming the container build, never SKIPs. --self-test is --quick: mkdtemp fixtures, no build, no
// network, no browser.
//
// Usage:
//   node scripts/verify-orca-packaged-tree.mjs
//   node scripts/verify-orca-packaged-tree.mjs --target linux-x64|win64|macos-arm64|macos-x64 --stage DIR
//        [--built DIR] [--prebuild-manifest FILE]
//   node scripts/verify-orca-packaged-tree.mjs --target macos --stage DIR --built ARM --also-built X64
//   node scripts/verify-orca-packaged-tree.mjs --self-test

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { orcaArtifactTables } from './lib/orca-artifacts.mjs';
import { NODE_NAMES, walk } from './verify-orca-build-shape.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-packaged-tree';
const SELF_REL = 'scripts/verify-orca-packaged-tree.mjs';
const BUILD_CMD = 'podman run --rm -v "$PWD:/src:rw" -w /src -e PB_HOST_ROOT="$PWD" pb-gecko-build bash powerbrowser/packaging/package-linux.sh (after the plan 45-01 container build; docs/BUILD.md "Linux package")';
const ORCA_BUILD_CMD = 'bash scripts/fetch-orca.sh, then nix develop .#orca --command bash scripts/build-orca.sh';
// target -> the slot's process.platform / process.arch; macos (universal) has no single slot.
const TARGETS = Object.freeze({
    'linux-x64': ['linux', 'x64'],
    'win64': ['win32', 'x64'],
    'macos-arm64': ['darwin', 'arm64'],
    'macos-x64': ['darwin', 'x64'],
    'macos': null,
});
const PTY_RELEASE = 'out/orcad/node_modules/node-pty/build/Release';
const ELECTRON_NAMES = new Set(['electron', 'electron.exe', 'Electron']);

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const shaOf = (buf) => createHash('sha256').update(buf).digest('hex');

// patchelf --remove-rpath on an ELF64 little-endian file: every DT_RPATH (15) and DT_RUNPATH (29) entry of the
// SHT_DYNAMIC section is dropped, the kept entries move up, and the freed entries before DT_NULL are zeroed.
// Returns null for anything else (not ELF64 LE, no dynamic section, nothing to remove).
export function withoutRunpath(buf) {
    if (buf.length < 64 || buf.readUInt32BE(0) !== 0x7f454c46 || buf[4] !== 2 || buf[5] !== 1) return null;
    const shoff = Number(buf.readBigUInt64LE(0x28));
    const shentsize = buf.readUInt16LE(0x3a);
    const shnum = buf.readUInt16LE(0x3c);
    for (let i = 0; i < shnum; i++) {
        const sh = shoff + i * shentsize;
        if (sh + 0x28 > buf.length || buf.readUInt32LE(sh + 4) !== 6) continue;
        const off = Number(buf.readBigUInt64LE(sh + 0x18));
        const end = Math.min(off + Number(buf.readBigUInt64LE(sh + 0x20)), buf.length);
        const out = Buffer.from(buf);
        let last = off;
        let at = off;
        for (; at + 16 <= end && buf.readBigInt64LE(at) !== 0n; at += 16) {
            const tag = buf.readBigInt64LE(at);
            if (tag !== 15n && tag !== 29n) { buf.copy(out, last, at, at + 16); last += 16; }
        }
        if (last === at) return null;
        out.fill(0, last, at);
        return out;
    }
    return null;
}

function filesUnder(root, sub = '') {
    const base = join(root, sub);
    const out = [];
    if (!existsSync(base)) return out;
    walk(base, (p, kind) => { if (kind === 'file') out.push(relative(root, p).split('\\').join('/')); });
    return out;
}

function builtSet(builtDir) {
    const s = new Set();
    if (existsSync(join(builtDir, 'package.json'))) s.add('package.json');
    for (const sub of ['out/orcad', 'out/web']) for (const r of filesUnder(builtDir, sub)) s.add(r);
    return s;
}

/** The verdict. builts: the built trees (union); manifest: parsed prebuild manifest or null. */
export function check({ target, stage, builts, manifest = null, tables }) {
    const fails = [];
    const expected = new Set();
    for (const b of builts) {
        if (!existsSync(join(b, 'out', 'orcad', 'orcad.js'))) fails.push(`no built tree at ${b} (out/orcad/orcad.js absent). Next step: run ${ORCA_BUILD_CMD}`);
        for (const r of builtSet(b)) expected.add(r);
    }
    const staged = new Set(filesUnder(stage));
    if (staged.size === 0) {
        fails.push(`empty stage: vacuous (${stage} holds no file, so nothing was compared)`);
        return { fails, count: 0 };
    }
    for (const r of [...expected].sort()) if (!staged.has(r)) fails.push(`built but not staged: ${r}`);
    for (const r of [...staged].sort()) if (!expected.has(r)) fails.push(`staged but not built: ${r}`);
    const markers = new Set(tables.markerNames);
    for (const r of [...staged].sort()) {
        const name = basename(r);
        if (NODE_NAMES.has(name)) fails.push(`Node runtime ${r} (sha256 ${sha256(join(stage, r))}); orcad runs on the one staged Node`);
        if (markers.has(name)) fails.push(`slot marker ${r} (a name from orca/src/shared/orcad-artifacts.ts); the tree was not de-slotted`);
        if (ELECTRON_NAMES.has(name) || `/${r}`.includes('/node_modules/electron/')) fails.push(`Electron binary or package ${r}`);
    }

    let slot = null;
    let platformArch = null;
    if (manifest !== null) {
        const want = TARGETS[target];
        const slots = manifest && typeof manifest.slots === 'object' && manifest.slots !== null ? Object.entries(manifest.slots) : [];
        if (slots.length !== 1) {
            fails.push(`prebuild manifest has ${slots.length} slots (${slots.map(([k]) => k).join(', ') || 'none'}), not exactly one; a merged or empty manifest proves nothing about where node-pty was built`);
        } else {
            const [name, entry] = slots[0];
            slot = name;
            platformArch = `${entry?.platform}-${entry?.arch}`;
            if (entry?.platform !== want[0] || entry?.arch !== want[1]) {
                fails.push(`node-pty slot ${name} was built on ${entry?.platform}/${entry?.arch}, target ${target} needs ${want[0]}/${want[1]}`);
            }
            const slotFiles = entry && typeof entry.files === 'object' && entry.files !== null ? entry.files : {};
            const stagedPty = Object.fromEntries(filesUnder(join(stage, PTY_RELEASE)).map((r) => [r, sha256(join(stage, PTY_RELEASE, r))]));
            const strippedOfSlot = (r) => {
                const b = join(builts[0], PTY_RELEASE, r);
                if (!existsSync(b) || sha256(b) !== slotFiles[r]) return null;
                const s = withoutRunpath(readFileSync(b));
                return s === null ? null : shaOf(s);
            };
            for (const r of [...new Set([...Object.keys(slotFiles), ...Object.keys(stagedPty)])].sort()) {
                if (slotFiles[r] !== stagedPty[r] && !(stagedPty[r] !== undefined && strippedOfSlot(r) === stagedPty[r])) {
                    fails.push(`node-pty ${PTY_RELEASE}/${r}: staged sha256 ${stagedPty[r] ?? '(absent)'} differs from slot ${name}'s ${slotFiles[r] ?? '(absent)'}`);
                }
            }
            if (Object.keys(slotFiles).length === 0) fails.push(`node-pty slot ${name} lists no files, so the sha comparison is vacuous`);
        }
    }
    return { fails, count: staged.size, slot, platformArch };
}

function usage(msg) {
    console.error(`${NAME}: ${msg}`);
    console.error(`  usage: node ${SELF_REL} [--target ${Object.keys(TARGETS).join('|')}] [--stage DIR] [--built DIR] [--also-built DIR] [--prebuild-manifest FILE] | --self-test`);
    console.error(`  Next step: run node ${SELF_REL} --self-test, or pass --target and --stage as docs/BUILD.md "Packaged Orca" shows.`);
    process.exit(2);
}

function parseArgs(argv) {
    const o = { selfTest: false };
    const takes = new Set(['--target', '--stage', '--built', '--also-built', '--prebuild-manifest']);
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--self-test') o.selfTest = true;
        else if (takes.has(a)) {
            const v = argv[++i];
            if (v === undefined || v.startsWith('--')) usage(`${a} needs a value`);
            o[a.slice(2)] = v;
        } else usage(`unknown argument '${a}'`);
    }
    if (o.target !== undefined && !Object.hasOwn(TARGETS, o.target)) usage(`unknown --target '${o.target}'`);
    if (o.target === 'macos' && o['prebuild-manifest'] !== undefined) {
        console.error(`${NAME}: --prebuild-manifest is refused for --target macos: a universal tree merges two slots, so no single manifest describes it.`);
        console.error('  Next step: check each thin tree with --target macos-arm64 or macos-x64 and its own manifest before the merge.');
        process.exit(2);
    }
    if (o['also-built'] !== undefined && o.target !== 'macos') usage('--also-built is for --target macos only');
    return o;
}

function render(target, r) {
    if (r.fails.length) {
        console.error(`${NAME}: FAIL -- ${r.fails.length} problem(s) (--target ${target}):`);
        for (const f of r.fails) console.error(`  ${f}`);
        return 1;
    }
    const slot = r.slot ? `node-pty slot ${r.slot} built on ${r.platformArch}` : 'no prebuild manifest (set and names only)';
    console.log(`${NAME}: PASS -- ${r.count} files equal the built tree (${target}), ${slot}`);
    return 0;
}

async function selfTestTables(tmp) {
    if (existsSync(join(REPO_ROOT, 'orca', 'src', 'shared', 'orcad-artifacts.ts'))) {
        return { tables: await orcaArtifactTables(join(REPO_ROOT, 'orca')), from: 'the real orca/ tables' };
    }
    // orca/ not fetched (the hosted verify job): a fixture source with synthetic names, so a pass still proves derivation.
    const fx = join(tmp, 'orca-src');
    mkdirSync(join(fx, 'src', 'shared'), { recursive: true });
    writeFileSync(join(fx, 'src', 'shared', 'orcad-artifacts.ts'), [
        "export const ORCAD_SERVER_TARGET_FILENAME = '.fixture-target'",
        "export const ORCAD_NODE_RUNTIME_MARKER_FILENAME = '.fixture-runtime'",
        "export const ORCAD_VERSION_FILENAME = '.fixture-version'",
        "export const ORCAD_BUILD_TARGET_FILENAME = '.fixture-build-target'",
        "export const ORCAD_RIPGREP_ARTIFACTS = ['ripgrep/fixture-x64/rg'] as const",
        '',
    ].join('\n'));
    writeFileSync(join(fx, 'src', 'shared', 'orcad-agent-browser-name.ts'),
        'export function orcadAgentBrowserNativeName(p: string, a: string): string { return `agent-browser-${p}-${a}` }\n');
    writeFileSync(join(fx, 'package.json'), '{ "type": "module" }\n');
    return { tables: await orcaArtifactTables(fx), from: 'a fixture source (orca/ is not fetched here)' };
}

async function selfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        const { tables, from } = await selfTestTables(tmp);
        const built = join(tmp, 'built');
        const put = (root, rel, body) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); };
        // A minimal ELF64 LE with one SHT_DYNAMIC section: NEEDED, RUNPATH, SONAME, NULL. ptyStripped is written
        // out by hand (NEEDED, SONAME, then zeros), not computed by withoutRunpath, so the control is not circular.
        const elf64 = (dyn) => {
            const b = Buffer.alloc(0x180);
            b.writeUInt32BE(0x7f454c46, 0); b[4] = 2; b[5] = 1; b[6] = 1;
            b.writeBigUInt64LE(0x100n, 0x28); b.writeUInt16LE(64, 0x3a); b.writeUInt16LE(2, 0x3c);
            b.writeUInt32LE(6, 0x140 + 4); b.writeBigUInt64LE(0x80n, 0x140 + 0x18); b.writeBigUInt64LE(0x40n, 0x140 + 0x20);
            dyn.forEach(([t, v], i) => { b.writeBigInt64LE(BigInt(t), 0x80 + i * 16); b.writeBigUInt64LE(BigInt(v), 0x88 + i * 16); });
            return b;
        };
        const pty = elf64([[1, 5], [29, 9], [14, 3]]);
        const ptyStripped = elf64([[1, 5], [14, 3]]);
        put(built, 'package.json', '{ "name": "fixture" }\n');
        put(built, 'out/orcad/orcad.js', '// fixture\n');
        put(built, `${PTY_RELEASE}/pty.node`, pty);
        put(built, 'out/web/web-index.html', '<!doctype html>\n');
        // Present in the built tree but never staged: these must not enter the expected set.
        put(built, 'out/orcad-prebuilds/linux-x64-glibc/pty.node', pty);
        put(built, 'node_modules/left-pad/index.js', '');
        const manifest = { slots: { 'linux-x64-glibc': { platform: 'linux', arch: 'x64', files: { 'pty.node': createHash('sha256').update(pty).digest('hex') } } } };
        const freshStage = () => {
            const s = mkdtempSync(join(tmp, 'stage-'));
            writeFileSync(join(s, 'package.json'), readFileSync(join(built, 'package.json')));
            for (const sub of ['out/orcad', 'out/web']) cpSync(join(built, sub), join(s, sub), { recursive: true });
            return s;
        };
        const run = (stage, m = manifest) => check({ target: 'linux-x64', stage, builts: [built], manifest: m, tables });

        const control = run(freshStage());
        if (control.fails.length) {
            console.error(`${NAME} self-test: FAIL -- the unplanted fixture is already red, so the plants below would prove nothing: ${control.fails.join(' | ')}`);
            return 1;
        }
        console.log(`  ok control -> green (${control.count} files, slot ${control.slot}; markers from ${from})`);
        const strippedStage = freshStage();
        writeFileSync(join(strippedStage, PTY_RELEASE, 'pty.node'), ptyStripped);
        const stripped = run(strippedStage);
        rmSync(strippedStage, { recursive: true, force: true });
        if (stripped.fails.length) {
            console.error(`${NAME} self-test: FAIL -- a node-pty file whose only change is its removed RUNPATH (package-linux.sh's patchelf pass) is red: ${stripped.fails.join(' | ')}`);
            return 1;
        }
        console.log('  ok control RUNPATH-stripped pty.node -> green (equals the slot file minus DT_RUNPATH)');

        const marker = tables.markerNames[0];
        const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(60)]);
        const plants = [
            { name: 'missing file', naming: 'built but not staged: out/web/web-index.html', stage: (s) => rmSync(join(s, 'out/web/web-index.html')) },
            { name: 'extra file', naming: 'staged but not built: out/orcad/extra.js', stage: (s) => put(s, 'out/orcad/extra.js', '') },
            { name: 'node.exe staged', naming: 'Node runtime out/orcad/node.exe', stage: (s) => put(s, 'out/orcad/node.exe', Buffer.from('MZ')) },
            { name: `slot marker ${marker}`, naming: `slot marker out/orcad/${marker}`, stage: (s) => put(s, `out/orcad/${marker}`, 'linux-x64\n') },
            { name: 'Electron ELF', naming: 'Electron binary or package out/orcad/node_modules/electron/dist/electron', stage: (s) => put(s, 'out/orcad/node_modules/electron/dist/electron', elf) },
            { name: 'slot from another platform', naming: 'built on darwin/arm64, target linux-x64 needs linux/x64', manifest: { slots: { 'darwin-arm64': { ...manifest.slots['linux-x64-glibc'], platform: 'darwin', arch: 'arm64' } } } },
            { name: 'stripped pty.node with one more byte changed', naming: `${PTY_RELEASE}/pty.node: staged sha256`, stage: (s) => { const b = Buffer.from(ptyStripped); b[0x170] = 1; writeFileSync(join(s, PTY_RELEASE, 'pty.node'), b); } },
            { name: 'slot sha mismatch', naming: `${PTY_RELEASE}/pty.node: staged sha256`, manifest: { slots: { 'linux-x64-glibc': { ...manifest.slots['linux-x64-glibc'], files: { 'pty.node': 'a'.repeat(64) } } } } },
            { name: 'two slots (merged manifest)', naming: 'has 2 slots', manifest: { slots: { ...manifest.slots, 'darwin-x64': { platform: 'darwin', arch: 'x64', files: {} } } } },
            { name: 'empty stage', naming: 'empty stage: vacuous', stage: (s) => { rmSync(s, { recursive: true }); mkdirSync(s); } },
        ];
        let failures = 0;
        for (const p of plants) {
            const s = freshStage();
            p.stage?.(s);
            const r = run(s, p.manifest ?? manifest);
            const text = r.fails.join('\n');
            if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; }
            else if (!text.includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++; }
            else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
            rmSync(s, { recursive: true, force: true });
        }
        if (failures) {
            console.error(`${NAME} self-test: FAIL -- ${failures} of ${plants.length} plant(s) did not go red naming the drift`);
            return 1;
        }
        console.log(`${NAME} self-test: PASS -- ${plants.length} planted faults each went red naming the drift`);
        return 0;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

async function main() {
    const o = parseArgs(process.argv.slice(2));
    if (o.selfTest) return selfTest();
    let tables;
    try {
        tables = await orcaArtifactTables(join(REPO_ROOT, 'orca'));
    } catch (err) {
        console.error(`${NAME}: FAIL -- ${err.message}. Next step: run bash scripts/fetch-orca.sh`);
        return 1;
    }
    let stage = o.stage;
    let target = o.target ?? 'linux-x64';
    let manifestFile = o['prebuild-manifest'];
    let cleanup = null;
    if (stage === undefined) {
        const { extractPackage } = await import('./lib/built-tree.mjs');
        let prefix;
        try {
            prefix = extractPackage();
        } catch (err) {
            console.error(`${NAME}: FAIL -- no container-built Linux tarball: ${err.message}. Next step: run: ${BUILD_CMD}`);
            return 1;
        }
        cleanup = dirname(prefix);
        stage = join(prefix, 'orca');
        target = 'linux-x64';
        manifestFile ??= join(REPO_ROOT, 'orca', 'out', 'orcad-prebuilds', 'manifest.json');
    }
    try {
        let manifest = null;
        if (manifestFile !== undefined) {
            try {
                manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
            } catch (err) {
                console.error(`${NAME}: FAIL -- the prebuild manifest ${manifestFile} could not be read (${err.message.split('\n')[0]}). Next step: run ${ORCA_BUILD_CMD}`);
                return 1;
            }
        }
        const builts = [resolve(o.built ?? join(REPO_ROOT, 'orca'))];
        if (o['also-built'] !== undefined) builts.push(resolve(o['also-built']));
        return render(target, check({ target, stage: resolve(stage), builts, manifest, tables }));
    } finally {
        if (cleanup) rmSync(cleanup, { recursive: true, force: true });
    }
}

process.exit(await main());
