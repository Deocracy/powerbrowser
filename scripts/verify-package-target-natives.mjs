#!/usr/bin/env node
// scripts/verify-package-target-natives.mjs -- PKG-23 (Phase 45): every
// staged native matches the package's target. For linux-x64: every `.node`,
// `rg` and `node` binary in the staged package is ELF x86-64 (magic
// `7f 45 4c 46 ... 3e 00`, read as exact bytes, never merged or accepted
// truncated). The checker is `--target` parameterised from day one
// (`linux-x64` now; `win64` expects PE32+, `macos` expects Mach-O universal
// later) so Phases H/I reuse it without a rewrite.
//
// The universe is judged by magic, not by name (Phase 68, P68-06): every regular
// file whose first bytes are ELF (7f454c46), PE (4d5a) or Mach-O (feedfacf,
// cffaedfe, cafebabe, feedface, cefaedfe -- the package-macos.sh magic_kind set),
// plus every file named like a native (.node, rg, node, rg.exe, node.exe) whatever
// its bytes. So Orca's agent-browser-<platform>-<arch>, node-pty's spawn-helper and
// any helper without an extension are judged too. One exception, outside orca/
// only: in a win64 stage uninstall/helper.exe (the one path the Mozilla package manifest
// gives the NSIS uninstaller) is 32-bit by design and is not examined; every other PE, an
// i386 .exe included, and every PE under orca/ must be PE32+ x86-64.
//
// Native paths are sorted before comparing, so output order is stable across
// runs and filesystems. A staged package with zero natives is red naming the
// EMPTY universe (staging dropped the sidecar), never green-by-absence; one
// native is checked alone.
//
// Honestly --quick for the twin only: mkdtemp fixtures, no build, no browser,
// no display, no network. The full row needs the container-built tarball (or
// a --stage dir) and FAILs naming the container-build procedure when neither
// exists (mar-hop precedent), never skips green.
//
// Usage:
//   node scripts/verify-package-target-natives.mjs [--target linux-x64]
//   node scripts/verify-package-target-natives.mjs --self-test [--target linux-x64]

import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-package-target-natives';
const BUILD_CMD = 'podman run --rm -v "$PWD:/src:rw" -w /src pb-gecko-build bash powerbrowser/packaging/package-linux.sh (after the plan 45-01 container build)';

const TARGETS = Object.freeze({
    'linux-x64': Object.freeze({ magic: Buffer.from([0x7f, 0x45, 0x4c, 0x46]), machine: Buffer.from([0x3e, 0x00]), label: 'ELF x86-64' }),
    // win64: MZ at 0, then the full PE32+ x86-64 header (see peHeaderFailure), not the MZ bytes alone.
    'win64': Object.freeze({ magic: Buffer.from([0x4d, 0x5a]), machine: null, pe: true, label: 'PE32+' }),
    'macos': Object.freeze({ magic: Buffer.from([0xca, 0xfe, 0xba, 0xbe]), machine: null, label: 'Mach-O universal' }),
});

const rawArgs = process.argv.slice(2);
let SELF_TEST = false;
let target = 'linux-x64';
for (let i = 0; i < rawArgs.length; i += 1) {
    const a = rawArgs[i];
    if (a === '--self-test') SELF_TEST = true;
    else if (a === '--stage') i += 1; // the value is read below, by rawArgs.indexOf('--stage')
    else if (a === '--target') {
        target = rawArgs[i + 1];
        i += 1;
        if (!target || !TARGETS[target]) {
            console.error(`${NAME}: FAIL -- unknown --target ${JSON.stringify(target)} (expected one of ${Object.keys(TARGETS).join(', ')})`);
            process.exit(2);
        }
    } else {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

// The Windows stage names its binaries node.exe and rg.exe; the POSIX names are checked too.
function isNativeName(name) {
    return name.endsWith('.node') || ['rg', 'node', 'rg.exe', 'node.exe'].includes(name);
}

const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const MZ = Buffer.from([0x4d, 0x5a]);
const MACHO = ['feedfacf', 'cffaedfe', 'cafebabe', 'feedface', 'cefaedfe'];
function hasNativeMagic(head) {
    return head.length >= 4 && (head.subarray(0, 4).equals(ELF) || head.subarray(0, 2).equals(MZ) || MACHO.includes(head.subarray(0, 4).toString('hex')));
}

// The NSIS uninstaller (uninstall/helper.exe) is i386 by design; only that path, outside orca/, in a win64 stage. The path is
// upstream/browser/installer/package-manifest.in's own line, @BINPATH@/uninstall/helper.exe, so the stage may root the
// application directory anywhere above it. Any other i386 .exe (a tool under the sidecar, a renamed helper) is examined and is red.
export const INSTALLER_HELPER_PATH = /(^|\/)uninstall\/helper\.exe$/;
function isInstallerHelper(rel, head) {
    if (rel.startsWith('orca/') || !INSTALLER_HELPER_PATH.test(rel)) return false;
    if (head.length < 0x40 || !head.subarray(0, 2).equals(MZ)) return false;
    const e = head.readUInt32LE(0x3c);
    return e + 6 <= head.length && head.subarray(e, e + 4).equals(Buffer.from([0x50, 0x45, 0x00, 0x00])) && head.readUInt16LE(e + 4) === 0x014c;
}

// PE32+ x86-64 from the first 4096 bytes: MZ at 0, e_lfanew at 0x3C, "PE\0\0" there, machine 0x8664,
// optional-header magic 0x020B. A file that cannot be read is never accepted.
function peHeaderFailure(path, rel) {
    let head;
    try {
        const fd = openSync(path, 'r');
        try {
            const buf = Buffer.alloc(4096);
            head = buf.subarray(0, readSync(fd, buf, 0, 4096, 0));
        } finally {
            closeSync(fd);
        }
    } catch {
        return `${rel}: unreadable -- PE32+ x86-64 cannot be verified, so it is never accepted`;
    }
    if (head.length < 0x40) return `${rel}: truncated (fewer than 64 bytes), so no PE32+ header can be read -- never accepted`;
    if (!head.subarray(0, 2).equals(Buffer.from([0x4d, 0x5a]))) return `${rel}: magic is not MZ (PE32+ expected)`;
    const e = head.readUInt32LE(0x3c);
    if (e + 26 > head.length) return `${rel}: PE header offset ${e} lies past the first 4096 bytes -- truncated or not PE32+`;
    if (!head.subarray(e, e + 4).equals(Buffer.from([0x50, 0x45, 0x00, 0x00]))) return `${rel}: no PE signature at offset ${e} -- not a PE image`;
    const machine = head.readUInt16LE(e + 4);
    if (machine !== 0x8664) return `${rel}: PE machine 0x${machine.toString(16)} is not x86-64 (0x8664) for --target win64 -- wrong-architecture binary`;
    const opt = head.readUInt16LE(e + 24);
    if (opt !== 0x020b) return `${rel}: optional header magic 0x${opt.toString(16)} is not PE32+ (0x020b)`;
    return null;
}

// Every regular file with a native magic or a native name. Reads 4 bytes per file.
function listNatives(root) {
    const out = [];
    const walk = (dir) => {
        for (const n of readdirSync(dir)) {
            const p = join(dir, n);
            let st;
            try { st = statSync(p); } catch { continue; }
            if (st.isDirectory()) walk(p);
            else if (st.isFile() && (isNativeName(n) || hasNativeMagic(magicOf(p, 4) ?? Buffer.alloc(0)))) out.push(p);
        }
    };
    walk(root);
    return out.sort();
}

// The first `length` bytes (fewer for a shorter file), without reading the whole file; null when unreadable.
function magicOf(path, length) {
    let fd;
    try {
        fd = openSync(path, 'r');
        const buf = Buffer.alloc(length);
        return buf.subarray(0, readSync(fd, buf, 0, length, 0));
    } catch {
        return null;
    } finally {
        if (fd !== undefined) closeSync(fd);
    }
}

function checkTree(root, targetId) {
    const spec = TARGETS[targetId];
    const relOf = (p) => (p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p);
    const natives = listNatives(root).filter((p) => !(spec.pe && isInstallerHelper(relOf(p), magicOf(p, 4096) ?? Buffer.alloc(0))));
    // EMPTY-universe branch: zero natives is red (staging dropped the
    // sidecar), never green-by-absence.
    if (natives.length === 0) {
        return { failures: [`EMPTY native universe under ${root} -- no ELF, PE or Mach-O file and no .node, rg or node name found (staging dropped the sidecar?)`], natives: 0 };
    }
    const failures = [];
    for (const native of natives) {
        const rel = relOf(native);
        const head = magicOf(native, 20);
        if (!head || head.length < 4) {
            failures.push(`${rel}: truncated magic (fewer than 4 bytes) -- expected ${spec.label}, never merged or accepted`);
            continue;
        }
        if (spec.pe && head.subarray(0, 4).equals(ELF)) {
            failures.push(`${rel}: ELF magic in a Windows stage -- magic 7f454c46 is not PE32+ for --target ${targetId} (a Linux native, whatever its name)`);
            continue;
        }
        if (!head.subarray(0, spec.magic.length).equals(spec.magic)) {
            failures.push(`${rel}: magic ${head.subarray(0, 4).toString('hex')} is not ${spec.label} for --target ${targetId} -- wrong-OS sidecar?`);
            continue;
        }
        if (spec.pe) {
            const failure = peHeaderFailure(native, rel);
            if (failure) failures.push(failure);
            continue;
        }
        if (spec.machine) {
            if (head.length < 20) {
                failures.push(`${rel}: truncated magic (fewer than 20 bytes) -- expected ${spec.label}, never merged or accepted`);
                continue;
            }
            const machine = head.subarray(18, 20);
            if (!machine.equals(spec.machine)) {
                failures.push(`${rel}: ELF machine ${machine.toString('hex')} is not x86-64 (3e 00) for --target ${targetId} -- wrong-architecture sidecar?`);
            }
        }
    }
    return { failures, natives: natives.length };
}

function selfTest() {
    let ok = true;
    const dir = mkdtempSync(join(tmpdir(), 'verify-package-target-natives-selftest-'));
    try {
        // Control green first: one real Linux native alone passes.
        const clean = join(dir, 'clean-stage', 'theia', 'lib', 'backend', 'native');
        mkdirSync(clean, { recursive: true });
        const realNode = join(REPO_ROOT, 'theia', 'applications', 'browser', 'lib', 'backend', 'native', 'drivelist.node');
        if (existsSync(realNode)) {
            copyFileSync(realNode, join(clean, 'drivelist.node'));
            const control = checkTree(join(dir, 'clean-stage'), 'linux-x64');
            if (control.failures.length !== 0) {
                console.error(`${NAME}: --self-test FAIL -- the unplanted single-native fixture is already red, so a red result after a plant would prove nothing:`);
                for (const f of control.failures) console.error(`  - ${f}`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- the unplanted single-native fixture is GREEN (${control.natives} native)`);
            }
        } else {
            console.log(`${NAME}: --self-test -- no built theia natives; control is the EMPTY-universe red branch instead`);
            const res = checkTree(join(dir, 'clean-stage'), 'linux-x64');
            const msg = res.failures.find((f) => f.includes('EMPTY native universe'));
            if (!msg) {
                console.error(`${NAME}: --self-test FAIL -- EMPTY native universe was NOT rejected`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- EMPTY native universe REJECTED: ${msg}`);
            }
        }

        // Plant: a Linux .node inside a fixture Windows staging copy goes red
        // naming the file and the expected magic. The fixture stages one real
        // Linux native under a win64 target, so the plant is a genuine
        // wrong-OS byte, not a text stub.
        const planted = join(dir, 'planted-stage');
        mkdirSync(join(planted, 'theia'), { recursive: true });
        if (existsSync(realNode)) {
            copyFileSync(realNode, join(planted, 'theia', 'planted.node'));
            const res = checkTree(planted, 'win64');
            const msg = res.failures.find((f) => f.includes('planted.node') && (f.includes('PE32+') || f.includes('magic')));
            if (!msg) {
                console.error(`${NAME}: --self-test FAIL -- Linux .node in a Windows fixture was NOT rejected naming planted.node and the expected magic`);
                for (const f of res.failures) console.error(`  - ${f}`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- Linux .node in Windows fixture REJECTED: ${msg}`);
            }
        } else {
            // No real native to plant: assert the EMPTY branch from the other
            // side -- a win64 check over an EMPTY native universe stage is
            // still red.
            const res = checkTree(planted, 'win64');
            if (res.failures.length === 0) {
                console.error(`${NAME}: --self-test FAIL -- EMPTY native universe Windows fixture was accepted`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- EMPTY native universe Windows fixture REJECTED: ${res.failures[0]}`);
            }
        }

        // Windows-stage PE32+ control and plants. The control is a synthetic PE32+ x86-64 header (MZ, e_lfanew
        // 0x80, PE\0\0, machine 0x8664, optional magic 0x020b): it must pass. A Mach-O universal named as a
        // stage binary and a magic-only MZ with no PE signature must each go red naming the file.
        {
            const pe = Buffer.alloc(0x200);
            pe[0] = 0x4d;
            pe[1] = 0x5a;
            pe.writeUInt32LE(0x80, 0x3c);
            pe.write('PE\0\0', 0x80, 'latin1');
            pe.writeUInt16LE(0x8664, 0x84);
            pe.writeUInt16LE(0x020b, 0x98);
            const winClean = join(dir, 'win-clean');
            mkdirSync(winClean, { recursive: true });
            writeFileSync(join(winClean, 'node.exe'), pe);
            writeFileSync(join(winClean, 'rg.exe'), pe);
            const ctl = checkTree(winClean, 'win64');
            if (ctl.failures.length !== 0) {
                console.error(`${NAME}: --self-test FAIL -- the synthetic PE32+ x86-64 control is already red: ${ctl.failures.join(' | ')}`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- the synthetic PE32+ x86-64 Windows stage is GREEN (${ctl.natives} native)`);
            }
            const winPlant = join(dir, 'win-planted');
            mkdirSync(winPlant, { recursive: true });
            writeFileSync(join(winPlant, 'macho.node'), Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x02]));
            writeFileSync(join(winPlant, 'mzonly.node'), Buffer.from([0x4d, 0x5a, 0x00, 0x00]));
            const planted = checkTree(winPlant, 'win64');
            const machoHit = planted.failures.find((f) => f.includes('macho.node') && f.includes('PE32+'));
            const mzHit = planted.failures.find((f) => f.includes('mzonly.node') && (f.includes('PE') || f.includes('magic')));
            if (!machoHit || !mzHit) {
                console.error(`${NAME}: --self-test FAIL -- a Mach-O or a magic-only MZ stage binary was NOT rejected naming the file and PE32+`);
                for (const f of planted.failures) console.error(`  - ${f}`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- Mach-O stage binary REJECTED: ${machoHit}`);
                console.log(`${NAME}: --self-test -- magic-only MZ stage binary REJECTED: ${mzHit}`);
            }
        }

        // PE branches, one synthetic file each (the cases above only reach the truncation and Mach-O branches).
        // Every fixture is a well-formed PE32+ x86-64 header with exactly one field broken; the control above is the
        // unbroken one. The wrong-OS plant is a synthetic ELF, so it runs whether or not a theia build exists.
        {
            const mkPe = ({ machine = 0x8664, opt = 0x020b, lfanew = 0x80, signature = true, size = 0x200 } = {}) => {
                const b = Buffer.alloc(size);
                b[0] = 0x4d;
                b[1] = 0x5a;
                b.writeUInt32LE(lfanew, 0x3c);
                if (signature && lfanew + 26 <= size) {
                    b.write('PE\0\0', lfanew, 'latin1');
                    b.writeUInt16LE(machine, lfanew + 4);
                    b.writeUInt16LE(opt, lfanew + 24);
                }
                return b;
            };
            const elf = Buffer.alloc(0x40);
            Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01]).copy(elf);
            const cases = [
                ['i386.node', mkPe({ machine: 0x014c }), 'is not x86-64'],
                ['arm64.node', mkPe({ machine: 0xaa64 }), 'is not x86-64'],
                ['pe32.node', mkPe({ opt: 0x010b }), 'is not PE32+'],
                ['farheader.node', mkPe({ lfanew: 0xffff }), 'lies past'],
                ['nosignature.node', mkPe({ signature: false }), 'no PE signature'],
                ['elf.node', elf, 'is not PE32+'],
                ['spawn-helper', elf, 'ELF magic in a Windows stage'],
                ['libnative.so', elf, 'ELF magic in a Windows stage'],
            ];
            const peDir = join(dir, 'pe-branches');
            mkdirSync(peDir, { recursive: true });
            for (const [file, bytes] of cases) writeFileSync(join(peDir, file), bytes);
            const res = checkTree(peDir, 'win64');
            for (const [file, , fragment] of cases) {
                const hit = res.failures.find((f) => f.startsWith(`${file}:`) && f.includes(fragment));
                if (!hit) {
                    console.error(`${NAME}: --self-test FAIL -- ${file} was NOT rejected naming '${fragment}'`);
                    for (const f of res.failures) console.error(`  - ${f}`);
                    ok = false;
                } else {
                    console.log(`${NAME}: --self-test -- ${file} REJECTED: ${hit}`);
                }
            }
            // Positive control: the NSIS uninstaller at its own path is the one i386 .exe that is not examined.
            const exeDir = join(dir, 'exe-names');
            mkdirSync(join(exeDir, 'uninstall'), { recursive: true });
            writeFileSync(join(exeDir, 'uninstall', 'helper.exe'), mkPe({ machine: 0x014c }));
            const exeRes = checkTree(exeDir, 'win64');
            if (exeRes.failures.some((f) => f.includes('helper.exe')) || !exeRes.failures.some((f) => f.includes('EMPTY native universe'))) {
                console.error(`${NAME}: --self-test FAIL -- uninstall/helper.exe (PE32 by design) was examined: ${exeRes.failures.join(' | ') || 'no failure at all'}`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- uninstall/helper.exe, 32-bit by design, is deliberately not examined (EMPTY universe reported)`);
            }
            // Negative controls (harness-other-09): an i386 .exe anywhere else outside orca/ is examined and red.
            for (const rel of ['sidecar/lib/foo.exe', 'uninstall-helper.exe', 'uninstall/other.exe', 'extras/uninstall/helper.exe.bak.exe', 'helper.exe']) {
                const negDir = join(dir, `exe-neg-${rel.replace(/[^a-z0-9]/gi, '-')}`);
                mkdirSync(dirname(join(negDir, rel)), { recursive: true });
                writeFileSync(join(negDir, rel), mkPe({ machine: 0x014c }));
                const neg = checkTree(negDir, 'win64');
                if (neg.failures.some((f) => f.startsWith(`${rel}:`) && f.includes('is not x86-64'))) {
                    console.log(`${NAME}: --self-test -- an i386 ${rel} outside orca/ is REJECTED (only uninstall/helper.exe is exempt)`);
                } else {
                    console.error(`${NAME}: --self-test FAIL -- an i386 ${rel} outside orca/ was NOT rejected naming 'is not x86-64': ${neg.failures.join(' | ') || 'no failure at all'}`);
                    ok = false;
                }
            }
        }

        // Phase 68 (P68-06): the magic universe under orca/. Each fixture carries a name the old name-based
        // universe never reached; a universal Mach-O control under orca/ must stay green for --target macos.
        {
            const put = (root, rel, bytes) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), bytes); };
            const thinArm = Buffer.alloc(0x40);
            thinArm.write('cffaedfe', 0, 'hex');
            thinArm.writeUInt32LE(0x0100000c, 4);
            const fat = Buffer.alloc(0x40);
            fat.write('cafebabe00000002', 0, 'hex');
            const elfExec = Buffer.alloc(0x40);
            Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01]).copy(elfExec);
            elfExec.writeUInt16LE(2, 16); // ET_EXEC, as node-pty's spawn-helper
            const pe32 = Buffer.alloc(0x200);
            pe32[0] = 0x4d;
            pe32[1] = 0x5a;
            pe32.writeUInt32LE(0x80, 0x3c);
            pe32.write('PE\0\0', 0x80, 'latin1');
            pe32.writeUInt16LE(0x014c, 0x84);
            pe32.writeUInt16LE(0x010b, 0x98);
            const cases = [
                ['macos', 'orca/out/orcad/agent-browser-darwin-arm64', thinArm, 'is not Mach-O universal'],
                ['win64', 'orca/out/orcad/node_modules/node-pty/build/Release/spawn-helper', elfExec, 'ELF magic in a Windows stage'],
                ['win64', 'orca/out/orcad/helper.exe', pe32, 'is not x86-64'],
            ];
            const ctlDir = join(dir, 'orca-macos-control');
            put(ctlDir, 'orca/out/orcad/agent-browser-darwin-arm64', fat);
            const ctl = checkTree(ctlDir, 'macos');
            if (ctl.failures.length !== 0 || ctl.natives !== 1) {
                console.error(`${NAME}: --self-test FAIL -- an unnamed universal Mach-O under orca/ is not exactly one green native: ${ctl.failures.join(' | ') || `${ctl.natives} natives`}`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- an unnamed universal Mach-O under orca/ is GREEN for --target macos (judged by magic)`);
            }
            cases.forEach(([t, rel, bytes, fragment], i) => {
                const d = join(dir, `orca-plant-${i}`);
                put(d, rel, bytes);
                const res = checkTree(d, t);
                const hit = res.failures.find((f) => f.startsWith(`${rel}:`) && f.includes(fragment));
                if (!hit) {
                    console.error(`${NAME}: --self-test FAIL -- ${rel} (--target ${t}) was NOT rejected naming '${fragment}': ${res.failures.join(' | ') || '(green)'}`);
                    ok = false;
                } else {
                    console.log(`${NAME}: --self-test -- ${rel} (--target ${t}) REJECTED: ${hit}`);
                }
            });
        }

        // Ordering probe: two runs list natives in the same sorted order.
        {
            const a = listNatives(dir).join('\n');
            const b = [...listNatives(dir)].sort().join('\n');
            if (a !== b) {
                console.error(`${NAME}: --self-test FAIL -- native listing order is not stable-sorted`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- ordering probe ok (native paths sorted, stable across runs)`);
            }
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    if (!ok) {
        console.error(`${NAME}: --self-test FAIL -- one or more plants misbehaved`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- control green first, then all planted faults behaved as pinned`);
}

if (SELF_TEST) {
    selfTest();
} else {
    let stageOverride = null;
    // --stage is accepted on the full row for local staging proofs; the
    // default subject is the container-built tarball.
    const stageIdx = rawArgs.indexOf('--stage');
    if (stageIdx !== -1) stageOverride = rawArgs[stageIdx + 1];
    const run = async () => {
        let root;
        let cleanup = null;
        if (stageOverride) {
            root = stageOverride;
        } else {
            const { extractPackage } = await import('./lib/built-tree.mjs');
            try {
                root = extractPackage();
            } catch (err) {
                console.error(`${NAME}: FAIL -- no container-built tarball: ${err.message}. Next step: run: ${BUILD_CMD}`);
                process.exit(1);
            }
            cleanup = join(root, '..');
        }
        const { failures, natives } = checkTree(root, target);
        if (cleanup) rmSync(cleanup, { recursive: true, force: true });
        if (failures.length) {
            console.error(`${NAME}: FAIL -- ${failures.length} failure(s) over ${natives} native(s) (--target ${target}):\n  ${failures.join('\n  ')}`);
            process.exit(1);
        }
        console.log(`${NAME}: PASS -- ${natives} native(s) match --target ${target} (${TARGETS[target].label}), sorted and stable`);
    };
    run().catch((err) => {
        console.error(`${NAME}: FAIL -- ${err.message}. Next step: run: ${BUILD_CMD}`);
        process.exit(1);
    });
}
