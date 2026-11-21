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
//  e. file content (harness-static-structure-04): every staged file's sha256 equals the same path's sha256 in
//     a built tree (any of them, for macos), so a modified orcad.js, a stale web chunk or a payload swapped
//     between build and package is red under an unchanged name. The two documented differences: a staged ELF
//     equal to the built ELF with its DT_RPATH and DT_RUNPATH entries removed (package-linux.sh's patchelf
//     pass), and, for macos, a fat Mach-O whose every slice is byte-equal to a Mach-O file of one of the thin
//     trees (the lipo merge; the pair of arch-named files is staged under both names).
//  f. executable modes (linux and macos targets; the macOS trees lost their executable bits in an artifact
//     round trip): every staged Mach-O and ELF executable has mode 0755. An executable is identified by its
//     magic bytes and header, never by name: a Mach-O of file type MH_EXECUTE (thin or any slice of a fat
//     file), an ELF of type ET_EXEC, or an ELF ET_DYN with a PT_INTERP program header (a PIE). Shared
//     libraries and .node modules are not executables by this rule.
// Red on: a built file not staged, a staged file not built, a changed file, an executable not 0755, a Node executable, a slot marker, an Electron
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
import { chmodSync, closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

const u16 = (b, o, le) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
const u32 = (b, o, le) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));

// Is this ELF an executable (ET_EXEC, or ET_DYN with a PT_INTERP program header)? null when the bytes are not an ELF.
function elfExecutable(buf) {
    if (buf.length < 52 || buf.readUInt32BE(0) !== 0x7f454c46) return null;
    const is64 = buf[4] === 2;
    const le = buf[5] !== 2;
    const type = u16(buf, 16, le);
    if (type === 2) return true;
    if (type !== 3) return false;
    const phoff = is64 ? Number(le ? buf.readBigUInt64LE(0x20) : buf.readBigUInt64BE(0x20)) : u32(buf, 0x1c, le);
    const phentsize = u16(buf, is64 ? 0x36 : 0x2a, le);
    const phnum = u16(buf, is64 ? 0x38 : 0x2c, le);
    for (let i = 0; i < phnum; i++) {
        const at = phoff + i * phentsize;
        if (at + 4 > buf.length) break;
        if (u32(buf, at, le) === 3) return true;
    }
    return false;
}

// The thin Mach-O file types of a buffer's header: { executable } or null when it is not a thin Mach-O.
function thinMachO(buf) {
    if (buf.length < 16) return null;
    const m = buf.readUInt32BE(0);
    const le = m === 0xcefaedfe || m === 0xcffaedfe;
    if (!le && m !== 0xfeedface && m !== 0xfeedfacf) return null;
    return { executable: u32(buf, 12, le) === 2 };
}

/** The slices of a fat Mach-O (fat32 or fat64), validated against the file length; null when it is not one (a Java class has the same magic). */
export function fatSlices(buf) {
    if (buf.length < 8) return null;
    const m = buf.readUInt32BE(0);
    if (m !== 0xcafebabe && m !== 0xcafebabf) return null;
    const wide = m === 0xcafebabf;
    const n = buf.readUInt32BE(4);
    const entry = wide ? 32 : 20;
    if (n < 1 || n > 32 || 8 + n * entry > buf.length) return null;
    const slices = [];
    for (let i = 0; i < n; i++) {
        const at = 8 + i * entry;
        const off = wide ? Number(buf.readBigUInt64BE(at + 8)) : buf.readUInt32BE(at + 8);
        const size = wide ? Number(buf.readBigUInt64BE(at + 16)) : buf.readUInt32BE(at + 12);
        if (off < 8 + n * entry || size < 16 || off + size > buf.length) return null;
        const bytes = buf.subarray(off, off + size);
        if (!thinMachO(bytes)) return null;
        slices.push(bytes);
    }
    return slices;
}

/** Is this file's content a Mach-O or ELF executable? Decided by the bytes alone. */
export function isExecutableBinary(buf) {
    const elf = elfExecutable(buf);
    if (elf !== null) return elf;
    const thin = thinMachO(buf);
    if (thin) return thin.executable;
    const fat = fatSlices(buf);
    return fat ? fat.some((sl) => thinMachO(sl).executable) : false;
}

function readHead(path, n) {
    const buf = Buffer.alloc(n);
    let fd;
    try { fd = openSync(path, 'r'); return buf.subarray(0, readSync(fd, buf, 0, n, 0)); } catch { return Buffer.alloc(0); } finally { if (fd !== undefined) closeSync(fd); }
}

const MAGIC_HEADS = new Set([0x7f454c46, 0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xcafebabf]);
const MODE_TARGETS = /^(linux|macos)/;

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

    // e. content: the same path's bytes in a built tree, or the two documented differences.
    let allBuilt = null;
    const allBuiltShas = () => {
        if (allBuilt === null) {
            allBuilt = new Set();
            for (const b of builts) for (const r of builtSet(b)) allBuilt.add(sha256(join(b, r)));
        }
        return allBuilt;
    };
    for (const r of [...staged].filter((x) => expected.has(x)).sort()) {
        const got = readFileSync(join(stage, r));
        const gotSha = shaOf(got);
        const candidates = new Set();
        for (const b of builts) {
            const bp = join(b, r);
            if (!existsSync(bp)) continue;
            const buf = readFileSync(bp);
            candidates.add(shaOf(buf));
            const stripped = withoutRunpath(buf);
            if (stripped !== null) candidates.add(shaOf(stripped));
        }
        if (candidates.has(gotSha)) continue;
        const slices = target === 'macos' ? fatSlices(got) : null;
        if (slices && slices.every((sl) => allBuiltShas().has(shaOf(sl)))) continue;
        fails.push(`staged content differs from the built tree: ${r} (staged sha256 ${gotSha}, built ${[...candidates].join(' or ') || 'absent'}); the file was modified or swapped between build and package`);
    }

    // f. executable modes on the unix targets.
    if (MODE_TARGETS.test(target)) {
        for (const r of [...staged].sort()) {
            const head = readHead(join(stage, r), 4);
            if (head.length < 4 || !MAGIC_HEADS.has(head.readUInt32BE(0))) continue;
            if (!isExecutableBinary(readFileSync(join(stage, r)))) continue;
            const mode = statSync(join(stage, r)).mode & 0o777;
            if (mode !== 0o755) fails.push(`executable ${r} has mode ${mode.toString(8).padStart(4, '0')}, not 0755 (a Mach-O or ELF executable by its magic bytes; its executable bit was lost, for example in an artifact round trip)`);
        }
    }
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
        // Binaries for the executable-mode clause, built by hand from their headers. None carries a telling name:
        // the clause must find them by magic bytes alone.
        const elfExec = () => { const b = Buffer.alloc(128); b.writeUInt32BE(0x7f454c46, 0); b[4] = 2; b[5] = 1; b.writeUInt16LE(2, 16); return b; };
        const elfPie = () => { const b = Buffer.alloc(256); b.writeUInt32BE(0x7f454c46, 0); b[4] = 2; b[5] = 1; b.writeUInt16LE(3, 16); b.writeBigUInt64LE(64n, 0x20); b.writeUInt16LE(56, 0x36); b.writeUInt16LE(2, 0x38); b.writeUInt32LE(1, 64); b.writeUInt32LE(3, 64 + 56); return b; };
        const elfSharedLib = () => { const b = Buffer.alloc(256); b.writeUInt32BE(0x7f454c46, 0); b[4] = 2; b[5] = 1; b.writeUInt16LE(3, 16); b.writeBigUInt64LE(64n, 0x20); b.writeUInt16LE(56, 0x36); b.writeUInt16LE(1, 0x38); b.writeUInt32LE(1, 64); return b; };
        const mach = (fileType, cpu = 0x0100000c) => { const b = Buffer.alloc(64); b.writeUInt32BE(0xcffaedfe, 0); b.writeUInt32LE(cpu, 4); b.writeUInt32LE(fileType, 12); return b; };
        const fat = (slices) => {
            const head = 8 + 20 * slices.length;
            const out = Buffer.alloc(head + slices.reduce((n, sl) => n + sl.length + 16, 0));
            out.writeUInt32BE(0xcafebabe, 0); out.writeUInt32BE(slices.length, 4);
            let off = head;
            slices.forEach((sl, i) => { const at = 8 + 20 * i; out.writeUInt32BE(0x0100000c + i, at); out.writeUInt32BE(off, at + 8); out.writeUInt32BE(sl.length, at + 12); sl.copy(out, off); off += sl.length + 16; });
            return out;
        };
        const javaClass = () => { const b = Buffer.alloc(64); b.writeUInt32BE(0xcafebabe, 0); b.writeUInt16BE(0, 4); b.writeUInt16BE(52, 6); return b; };
        const exec755 = (root, rel, body) => { put(root, rel, body); chmodSync(join(root, rel), 0o755); };
        exec755(built, 'out/orcad/bin/helper.dat', elfExec());
        exec755(built, 'out/orcad/bin/pie-helper', elfPie());
        exec755(built, 'out/orcad/bin/mach-helper', mach(2));
        put(built, 'out/orcad/lib/libshared.bin', elfSharedLib());
        put(built, 'out/orcad/lib/libmach.dylib', mach(6));
        put(built, 'out/orcad/Hello.class', javaClass());
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
        const modeOf = (rel, mode) => (s) => chmodSync(join(s, rel), mode);
        plants.push(
            { name: 'orcad.js modified in the stage, name unchanged', naming: 'staged content differs from the built tree: out/orcad/orcad.js', stage: (s) => writeFileSync(join(s, 'out/orcad/orcad.js'), '// swapped\n') },
            { name: 'a stale web chunk, same name', naming: 'staged content differs from the built tree: out/web/web-index.html', stage: (s) => writeFileSync(join(s, 'out/web/web-index.html'), '<!doctype html><!-- stale -->\n') },
            { name: 'an ELF executable named helper.dat with its executable bit cleared', naming: 'executable out/orcad/bin/helper.dat has mode 0644, not 0755', stage: modeOf('out/orcad/bin/helper.dat', 0o644) },
            { name: 'a PIE (ET_DYN with PT_INTERP) with its executable bit cleared', naming: 'executable out/orcad/bin/pie-helper has mode 0644, not 0755', stage: modeOf('out/orcad/bin/pie-helper', 0o644) },
            { name: 'a Mach-O executable with its executable bit cleared', naming: 'executable out/orcad/bin/mach-helper has mode 0644, not 0755', stage: modeOf('out/orcad/bin/mach-helper', 0o644) },
            { name: 'a Mach-O executable made group-writable', naming: 'executable out/orcad/bin/mach-helper has mode 0775, not 0755', stage: modeOf('out/orcad/bin/mach-helper', 0o775) },
        );
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
        // Shared libraries, modules and a Java class (the fat Mach-O magic) are not executables: mode 0644 stays green.
        const libStage = freshStage();
        const libs = run(libStage);
        rmSync(libStage, { recursive: true, force: true });
        if (libs.fails.length) { console.error(`  FAIL control: a shared library, a dylib and a Java class at mode 0644 -> ${libs.fails.join(' | ')}`); failures++; } else console.log('  ok control: ELF shared object, dylib and a Java class at mode 0644 are not executables -> green');
        // The windows target carries no unix mode: an executable at 0644 stays green there.
        const winStage = freshStage();
        modeOf('out/orcad/bin/helper.dat', 0o644)(winStage);
        const win = check({ target: 'win64', stage: winStage, builts: [built], manifest: null, tables });
        rmSync(winStage, { recursive: true, force: true });
        if (win.fails.length) { console.error(`  FAIL control: win64 with 0644 executables -> ${win.fails.join(' | ')}`); failures++; } else console.log('  ok control: win64 target, executables at 0644 -> green (no unix modes on NTFS)');

        // macos (universal): a fat Mach-O whose slices are the two thin trees' files.
        const thinTree = (name, cpu) => {
            const t = join(tmp, name);
            put(t, 'package.json', '{ "name": "fixture" }\n');
            put(t, 'out/orcad/orcad.js', '// fixture\n');
            put(t, 'out/web/web-index.html', '<!doctype html>\n');
            exec755(t, 'out/orcad/bin/tool', mach(2, cpu));
            return t;
        };
        const arm = thinTree('thin-arm', 0x0100000c);
        const x64 = thinTree('thin-x64', 0x01000007);
        const macStage = (tool, mode = 0o755) => {
            const st = mkdtempSync(join(tmp, 'mac-stage-'));
            writeFileSync(join(st, 'package.json'), readFileSync(join(arm, 'package.json')));
            for (const sub of ['out/orcad', 'out/web']) cpSync(join(arm, sub), join(st, sub), { recursive: true });
            writeFileSync(join(st, 'out/orcad/bin/tool'), tool);
            chmodSync(join(st, 'out/orcad/bin/tool'), mode);
            return st;
        };
        const mac = (st) => check({ target: 'macos', stage: st, builts: [arm, x64], manifest: null, tables });
        const goodFat = fat([readFileSync(join(arm, 'out/orcad/bin/tool')), readFileSync(join(x64, 'out/orcad/bin/tool'))]);
        for (const [name, tool, mode, naming] of [
            ['a fat Mach-O that is the lipo of the two thin trees', goodFat, 0o755, null],
            ['a fat Mach-O with a slice that is in neither thin tree', fat([readFileSync(join(arm, 'out/orcad/bin/tool')), mach(2, 0x01000018)]), 0o755, 'staged content differs from the built tree: out/orcad/bin/tool'],
            ['a fat Mach-O executable with its executable bit cleared', goodFat, 0o644, 'executable out/orcad/bin/tool has mode 0644, not 0755'],
        ]) {
            const st = macStage(tool, mode);
            const r = mac(st);
            rmSync(st, { recursive: true, force: true });
            const text = r.fails.join('\n');
            if (naming === null ? r.fails.length === 0 : text.includes(naming)) console.log(`  ok macos: ${name} -> ${naming === null ? 'green' : `red, naming '${naming}'`}`);
            else { console.error(`  FAIL macos: ${name} -> ${text || 'stayed green'}`); failures++; }
        }
        if (failures) {
            console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave (${plants.length} planted faults)`);
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
