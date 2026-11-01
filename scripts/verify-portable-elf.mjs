#!/usr/bin/env node
// scripts/verify-portable-elf.mjs -- PKG-22 (Phase 45): the Linux tarball is
// portable. Every ELF in the extracted package -- Gecko binaries AND the
// sidecar natives (theia/**/native/*.node, node/bin/node, rg when staged) --
// must carry no /nix/store interpreter or RUNPATH, and the maximum required
// GLIBC_* symbol version must be <= the shipped glibc floor.
//
// The floor is one declared value the packaging owns:
// powerbrowser/packaging/portability-floor.json ("glibc"). Owner ruling
// 2026-10-22 (WR-09) set it to 2.28, because the pinned official Node needs
// GLIBC_2.28. The release sysroot is still measured (toolchain-baseline.txt,
// the glibc-<v> token on the sysroot line), and the check fails if the measured
// sysroot glibc is above the declared floor: the build must not out-run the
// promise. GLIBCXX_* is bounded separately by the measured sysroot-glibcxx line.
// Versions compare as dotted-triple tuples, exact, never floats. Equal-to-floor
// passes; floor-plus-one goes red.
//
// This row is red-by-design on the Nix-built tree (INTERP/RUNPATH on
// /nix/store, libxul needing symbols past the sysroot floor) and green only
// on the container bootstrap build. When the container tarball is absent the full row FAILS
// naming the container-build procedure (mar-hop precedent), never skips
// green.
//
// Honestly --quick for the twin only: mkdtemp fixtures plus text/bytes.
// No build, no browser, no display, no network.
//
// Usage:
//   node scripts/verify-portable-elf.mjs
//   node scripts/verify-portable-elf.mjs --self-test

import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-portable-elf';
const FLOOR_REL = 'powerbrowser/packaging/portability-floor.json';
const BUILD_CMD = 'podman run --rm -v "$PWD:/src:rw" -w /src pb-gecko-build bash powerbrowser/packaging/package-linux.sh (after the plan 45-01 container build)';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

function readelf(path, flag) {
    try {
        return execFileSync('readelf', [flag, path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
        return null;
    }
}

function isElf(path) {
    try {
        const fd = readFileSync(path);
        return fd.length > 4 && fd[0] === 0x7f && fd[1] === 0x45 && fd[2] === 0x4c && fd[3] === 0x46;
    } catch {
        return false;
    }
}

function listElfs(root) {
    const out = [];
    const walk = (dir) => {
        for (const n of readdirSync(dir)) {
            const p = join(dir, n);
            let st;
            try { st = statSync(p); } catch { continue; }
            if (st.isDirectory()) walk(p);
            else if (st.isFile() && isElf(p)) out.push(p);
        }
    };
    walk(root);
    return out.sort();
}

// The shipped glibc floor: powerbrowser/packaging/portability-floor.json.
// Parsed strictly; a missing or non-dotted value is a red, never a default.
function parseFloor(text) {
    let floor = null;
    try { floor = JSON.parse(text).glibc; } catch { floor = null; }
    const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(typeof floor === 'string' ? floor : '');
    if (!m) throw new Error(`${FLOOR_REL} must declare "glibc" as a dotted version (got ${JSON.stringify(floor ?? null)})`);
    return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

// Pure: toolchain-baseline.txt text and the floor-file text in, the GLIBC
// floor and GLIBCXX ceiling out. Two namespaces, two bounds. GLIBC_* tokens
// are bounded by the declared floor. GLIBCXX_* tokens are bounded by the
// libstdc++ the sysroot ships, measured in the container ("sysroot-glibcxx
// GLIBCXX_<v>" line). The measured sysroot glibc ("sysroot <dist> glibc-<v>")
// must not exceed the declared floor, so the build cannot out-run the promise.
function resolveCeiling(baseline, floorText) {
    const floor = parseFloor(floorText);
    const lineFor = (key) => baseline.split('\n').find(l => l.startsWith(`${key} `)) ?? '';
    const sysrootLine = lineFor('sysroot');
    const cxxLine = lineFor('sysroot-glibcxx');
    const measure = 'measure it in the release container: scripts/toolchain-baseline.sh --container runs after the bootstrap build (DSH-BLOCKED.md step 3)';
    if (!sysrootLine || /UNMEASURED/.test(sysrootLine)) throw new Error(`toolchain-baseline.txt sysroot line is missing or UNMEASURED -- ${measure}`);
    if (!cxxLine || /UNMEASURED/.test(cxxLine)) throw new Error(`toolchain-baseline.txt sysroot-glibcxx line is missing or UNMEASURED -- ${measure}`);
    const dist = sysrootLine.split(/\s+/)[1];
    const sg = /\bglibc-(\d+)\.(\d+)(?:\.(\d+))?\b/.exec(sysrootLine);
    if (!sg) throw new Error(`toolchain-baseline.txt sysroot line names no glibc-<v> token: "${sysrootLine}"`);
    const sysrootGlibc = [Number(sg[1]), Number(sg[2]), Number(sg[3] ?? 0)];
    if (cmpVer(sysrootGlibc, floor) > 0) {
        throw new Error(`measured sysroot glibc ${fmtVer(sysrootGlibc)} (dist ${dist}, toolchain-baseline.txt) is above the declared shipped floor ${fmtVer(floor)} (${FLOOR_REL}) -- the build must not out-run the promise: lower the sysroot, or raise the floor only by owner ruling`);
    }
    const cxx = /GLIBCXX_(\d+)\.(\d+)\.(\d+)/.exec(cxxLine);
    if (!cxx) throw new Error(`toolchain-baseline.txt sysroot-glibcxx line names no GLIBCXX_<v> token: "${cxxLine}"`);
    return {
        dist,
        sysrootGlibc,
        glibc: floor,
        glibcxx: [Number(cxx[1]), Number(cxx[2]), Number(cxx[3])],
        source: `${FLOOR_REL} (GLIBC floor); toolchain-baseline.txt (GLIBCXX, sysroot ${dist})`,
    };
}

function ceilingFromTree() {
    let floorText;
    try {
        floorText = readFileSync(join(REPO_ROOT, FLOOR_REL), 'utf8');
    } catch {
        throw new Error(`${FLOOR_REL} is missing -- the shipped glibc floor is declared there (owner ruling 2026-10-22)`);
    }
    return resolveCeiling(readFileSync(join(REPO_ROOT, 'toolchain-baseline.txt'), 'utf8'), floorText);
}

function cmpVer(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        const x = a[i] ?? 0, y = b[i] ?? 0;
        if (x !== y) return x - y;
    }
    return 0;
}

function fmtVer(v) { return (v.length > 2 && v[2] === 0 ? v.slice(0, 2) : v).join('.'); }

const SYMBOL_VERSION = /(GLIBCXX|GLIBC)_(\d+)\.(\d+)(?:\.(\d+))?/g;

function requiredSymbolVersions(elfPath) {
    // Versioned symbol requirement tokens as { token, ns, v }. Exact dotted
    // triples compared as tuples, never floats.
    let text = readelf(elfPath, '--version-info') ?? '';
    if (!/(GLIBCXX|GLIBC)_\d/.test(text)) {
        // Fallback when version-info is silent: strings carry the same tokens.
        try { text = execFileSync('strings', [elfPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch { text = ''; }
    }
    return [...text.matchAll(SYMBOL_VERSION)].map((m) => ({
        token: m[0],
        ns: m[1],
        v: [Number(m[2]), Number(m[3]), Number(m[4] ?? 0)],
    }));
}

function checkTree(root, fixedCeiling) {
    const failures = [];
    let ceiling = fixedCeiling;
    if (!ceiling) {
        try {
            ceiling = ceilingFromTree();
        } catch (err) {
            return { failures: [err.message], ceiling: null, elfs: 0 };
        }
    }
    const elfs = listElfs(root);
    if (elfs.length === 0) {
        return { failures: [`no ELF found under ${root} -- the staged tree is empty or missing`], ceiling, elfs: 0 };
    }
    for (const elf of elfs) {
        const rel = elf.startsWith(`${root}/`) ? elf.slice(root.length + 1) : elf;
        const interp = readelf(elf, '-l') ?? '';
        const interpLine = interp.split('\n').find(l => l.includes('Requesting program interpreter:'));
        if (interpLine && interpLine.includes('/nix/store')) {
            failures.push(`${rel}: PT_INTERP names /nix/store (${interpLine.trim()}) -- rebuild in the container (plan 45-01), never patchelf the Nix tree`);
        }
        const dyn = readelf(elf, '-d') ?? '';
        for (const line of dyn.split('\n')) {
            if (/RUNPATH|RPATH/.test(line) && line.includes('/nix/store')) {
                failures.push(`${rel}: ${line.trim()} -- strip at staging (package-linux.sh) or rebuild in the container`);
            }
        }
        for (const req of requiredSymbolVersions(elf)) {
            const floor = req.ns === 'GLIBCXX' ? ceiling.glibcxx : ceiling.glibc;
            if (cmpVer(req.v, floor) > 0) {
                failures.push(`${rel}: requires versioned symbol ${req.token}, above the ${req.ns} ceiling ${fmtVer(floor)} from ${ceiling.source} (dist ${ceiling.dist})`);
                break;
            }
        }
    }
    return { failures, ceiling, elfs: elfs.length };
}

// The self-test's own ceiling: the declared floor read from the tree (so a
// floor change flows into the plants) and a fixed GLIBCXX fixture. Never the
// measured baseline, which stays UNMEASURED until the container build runs.
function fixtureCeiling() {
    return Object.freeze({
        dist: 'self-test',
        sysrootGlibc: null,
        glibc: parseFloor(readFileSync(join(REPO_ROOT, FLOOR_REL), 'utf8')),
        glibcxx: [3, 4, 20],
        source: `self-test fixture ceiling (GLIBC floor from ${FLOOR_REL})`,
    });
}

function elfHash(name) {
    let h = 0;
    for (const c of Buffer.from(name)) {
        h = ((h << 4) + c) >>> 0;
        const g = (h & 0xf0000000) >>> 0;
        if (g) h = (h ^ (g >>> 24)) >>> 0;
        h = (h & ~g) >>> 0;
    }
    return h;
}

// A minimal ELF64 shared object whose only content is a .gnu.version_r
// section naming the given symbol-version tokens. readelf -V reads exactly
// those requirements, so the plants need no compiler and no host binary.
function writeVersionedElf(path, tokens) {
    const align8 = (n) => (n + 7) & ~7;
    const strs = ['', 'libc.so.6', ...tokens];
    const offs = [];
    let dynstr = Buffer.alloc(0);
    for (const s of strs) {
        offs.push(dynstr.length);
        dynstr = Buffer.concat([dynstr, Buffer.from(`${s}\0`)]);
    }
    const n = tokens.length;
    const verneed = Buffer.alloc(16 + 16 * n);
    verneed.writeUInt16LE(1, 0);            // vn_version
    verneed.writeUInt16LE(n, 2);            // vn_cnt
    verneed.writeUInt32LE(offs[1], 4);      // vn_file: libc.so.6
    verneed.writeUInt32LE(16, 8);           // vn_aux
    verneed.writeUInt32LE(0, 12);           // vn_next
    tokens.forEach((t, i) => {
        const at = 16 + 16 * i;
        verneed.writeUInt32LE(elfHash(t), at);          // vna_hash
        verneed.writeUInt16LE(0, at + 4);               // vna_flags
        verneed.writeUInt16LE(i + 2, at + 6);           // vna_other
        verneed.writeUInt32LE(offs[2 + i], at + 8);     // vna_name
        verneed.writeUInt32LE(i + 1 < n ? 16 : 0, at + 12); // vna_next
    });
    const shstr = Buffer.from('\0.dynstr\0.gnu.version_r\0.shstrtab\0');
    const dynOff = 64;
    const verOff = align8(dynOff + dynstr.length);
    const shstrOff = align8(verOff + verneed.length);
    const shOff = align8(shstrOff + shstr.length);
    const file = Buffer.alloc(shOff + 4 * 64);
    Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]).copy(file, 0); // ELF64, LE, version 1
    file.writeUInt16LE(3, 16);              // e_type ET_DYN
    file.writeUInt16LE(62, 18);             // e_machine x86-64
    file.writeUInt32LE(1, 20);              // e_version
    file.writeBigUInt64LE(BigInt(shOff), 40); // e_shoff
    file.writeUInt16LE(64, 52);             // e_ehsize
    file.writeUInt16LE(64, 58);             // e_shentsize
    file.writeUInt16LE(4, 60);              // e_shnum
    file.writeUInt16LE(3, 62);              // e_shstrndx
    dynstr.copy(file, dynOff);
    verneed.copy(file, verOff);
    shstr.copy(file, shstrOff);
    const sh = (i, name, type, off, size, link = 0, info = 0, align = 1) => {
        const at = shOff + 64 * i;
        file.writeUInt32LE(name < 0 ? 0 : shstr.indexOf(`${name}\0`), at);
        file.writeUInt32LE(type, at + 4);
        file.writeBigUInt64LE(BigInt(off), at + 24);
        file.writeBigUInt64LE(BigInt(size), at + 32);
        file.writeUInt32LE(link, at + 40);
        file.writeUInt32LE(info, at + 44);
        file.writeBigUInt64LE(BigInt(align), at + 48);
    };
    sh(0, -1, 0, 0, 0);
    sh(1, '.dynstr', 3, dynOff, dynstr.length, 0, 0, 1);
    sh(2, '.gnu.version_r', 0x6ffffffe, verOff, verneed.length, 1, 1, 8); // SHT_GNU_verneed
    sh(3, '.shstrtab', 3, shstrOff, shstr.length, 0, 0, 1);
    writeFileSync(path, file);
}

function selfTest() {
    let ok = true;
    const FIXTURE_CEILING = fixtureCeiling();
    const [fMaj, fMin] = FIXTURE_CEILING.glibc;
    const AT_FLOOR = `GLIBC_${fMaj}.${fMin}`;
    const OVER_FLOOR = `GLIBC_${fMaj}.${fMin + 1}`;
    const dir = mkdtempSync(join(tmpdir(), 'verify-portable-elf-selftest-'));
    try {
        // Control: an empty dir is red (never green-by-absence), and each
        // plant below goes red naming file plus value. The green control is
        // the plants' absence probed over idempotent reruns (see below) --
        // the live-tree probe reports its verdict verbatim rather than
        // failing opaquely when the host tree exceeds the ceiling.
        const expectRed = (label, setup, needleFile, needleValue) => {
            const fix = mkdtempSync(join(tmpdir(), 'verify-portable-elf-plant-'));
            try {
                try {
                    setup(fix);
                } catch (err) {
                    console.error(`${NAME}: --self-test FAIL -- ${label}: the plant could not be built: ${err.message.split('\n')[0]}`);
                    ok = false;
                    return;
                }
                const res = checkTree(fix, FIXTURE_CEILING);
                const msg = res.failures.find(f => f.includes(needleFile) && f.includes(needleValue));
                if (!msg) {
                    console.error(`${NAME}: --self-test FAIL -- ${label} was NOT rejected naming ${needleFile} and ${needleValue}`);
                    for (const f of res.failures) console.error(`  - ${f}`);
                    ok = false;
                } else {
                    console.log(`${NAME}: --self-test -- ${label} REJECTED: ${msg}`);
                }
            } finally {
                rmSync(fix, { recursive: true, force: true });
            }
        };

        // Plant (a): a Nix RUNPATH on a fixture ELF. Uses a real ELF copy so
        // readelf parses it; patchelf ships in both dev shells and the
        // release container, so the plant resolves it from the nix store
        // directly (a store path needs no `nix develop` evaluation, which
        // fails read-only here). Candidates are probed in order; the first
        // executable wins. When none works the plant is a SKIP with a printed
        // reason and the remaining probes still gate the twin.
        const srcElf = process.execPath;
        const PATCHELF_CANDIDATES = Object.freeze([
            '/nix/store/iyinjjn7gv8c77w9qgicfmz4mc4dwq5j-patchelf-0.15.2/bin/patchelf',
            'patchelf',
        ]);
        const patchelfBin = PATCHELF_CANDIDATES.find((bin) => {
            try {
                execFileSync(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
                return true;
            } catch { return false; }
        }) ?? null;
        if (patchelfBin) {
            expectRed(
                'nix RUNPATH plant',
                (fix) => {
                    const dst = join(fix, 'planted.elf');
                    // copyFileSync + chmod, not `cp`: cp keeps the 0555 mode of a
                    // store binary, and patchelf cannot write the copy.
                    copyFileSync(srcElf, dst);
                    chmodSync(dst, 0o755);
                    execFileSync(patchelfBin, ['--set-rpath', '/nix/store/planted-fake-lib', dst]);
                },
                'planted.elf',
                '/nix/store',
            );
        } else {
            // A missing patchelf is a red self-test, never a skip that exits 0.
            console.error(`${NAME}: --self-test FAIL -- no patchelf executable (store path nor PATH); the nix-RUNPATH plant cannot be built`);
            ok = false;
        }

        // Plant (b) is split by namespace: a GLIBC token above the glibc
        // ceiling, and a GLIBCXX token above the libstdc++ ceiling, each in its
        // own synthetic ELF. A control carries both namespaces AT their
        // ceilings and must stay green (regression for the old single-namespace
        // comparison, which made every GLIBCXX token look like a glibc 3.x).
        expectRed(
            'GLIBC above-floor plant (floor+1)',
            (fix) => writeVersionedElf(join(fix, 'planted-glibc.so'), ['GLIBC_2.2.5', OVER_FLOOR]),
            'planted-glibc.so',
            OVER_FLOOR,
        );

        // Sysroot-versus-floor: the measured sysroot glibc may equal or sit below
        // the declared floor, never above it. Pure: synthetic baseline text
        // against the real floor file, so no measurement is needed.
        {
            const floorText = readFileSync(join(REPO_ROOT, FLOOR_REL), 'utf8');
            const baselineFor = (glibc) => `clang clang 17.0.1\nsysroot jessie glibc-${glibc}\nsysroot-glibcxx GLIBCXX_3.4.20\nimage pb-gecko-build bookworm\n`;
            const probes = [
                { label: 'sysroot below the floor (jessie glibc-2.19)', glibc: '2.19', expectOk: true },
                { label: 'sysroot at the floor', glibc: `${fMaj}.${fMin}`, expectOk: true },
                { label: 'sysroot above the floor', glibc: `${fMaj}.${fMin + 1}`, expectOk: false },
            ];
            for (const p of probes) {
                let verdict;
                try {
                    resolveCeiling(baselineFor(p.glibc), floorText);
                    verdict = true;
                } catch (err) {
                    verdict = err.message;
                }
                if (p.expectOk) {
                    if (verdict !== true) {
                        console.error(`${NAME}: --self-test FAIL -- ${p.label} was rejected: ${verdict}`);
                        ok = false;
                    } else {
                        console.log(`${NAME}: --self-test -- ${p.label} accepted`);
                    }
                } else if (verdict === true || !/above the declared shipped floor/.test(verdict)) {
                    console.error(`${NAME}: --self-test FAIL -- ${p.label} was NOT rejected naming the declared floor`);
                    ok = false;
                } else {
                    console.log(`${NAME}: --self-test -- ${p.label} REJECTED: ${verdict}`);
                }
            }
        }
        expectRed(
            'GLIBCXX above-ceiling plant',
            (fix) => writeVersionedElf(join(fix, 'planted-cxx.so'), ['GLIBCXX_3.4.20', 'GLIBCXX_3.4.99']),
            'planted-cxx.so',
            'GLIBCXX_3.4.99',
        );
        {
            const fix = mkdtempSync(join(tmpdir(), 'verify-portable-elf-control-'));
            try {
                writeVersionedElf(join(fix, 'control.so'), ['GLIBC_2.2.5', AT_FLOOR, 'GLIBCXX_3.4.20']);
                const res = checkTree(fix, FIXTURE_CEILING);
                if (res.failures.length) {
                    console.error(`${NAME}: --self-test FAIL -- the at-floor control was rejected (namespaces must not cross): ${res.failures[0]}`);
                    ok = false;
                } else {
                    console.log(`${NAME}: --self-test -- at-floor control green (${AT_FLOOR} and GLIBCXX 3.4.20 pass in their own namespaces)`);
                }
            } finally {
                rmSync(fix, { recursive: true, force: true });
            }
        }

        // Empty-universe probe: an empty stage is red, never green.
        {
            const fix = mkdtempSync(join(tmpdir(), 'verify-portable-elf-empty-'));
            try {
                const res = checkTree(fix, FIXTURE_CEILING);
                if (res.failures.length === 0) {
                    console.error(`${NAME}: --self-test FAIL -- an EMPTY stage was accepted; it must be red (never green-by-absence)`);
                    ok = false;
                } else {
                    console.log(`${NAME}: --self-test -- EMPTY stage REJECTED: ${res.failures[0]}`);
                }
            } finally {
                rmSync(fix, { recursive: true, force: true });
            }
        }

        // Idempotency probe: two runs over the same input print the same verdict.
        {
            const fix = mkdtempSync(join(tmpdir(), 'verify-portable-elf-idem-'));
            try {
                const a = checkTree(fix, FIXTURE_CEILING).failures.join('\n');
                const b = checkTree(fix, FIXTURE_CEILING).failures.join('\n');
                if (a !== b) {
                    console.error(`${NAME}: --self-test FAIL -- two runs over one input disagree`);
                    ok = false;
                } else {
                    console.log(`${NAME}: --self-test -- idempotency probe ok (two runs agree)`);
                }
            } finally {
                rmSync(fix, { recursive: true, force: true });
            }
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    if (!ok) {
        console.error(`${NAME}: --self-test FAIL -- one or more plants misbehaved`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- control probes green first, then all planted faults behaved as pinned`);
}

if (SELF_TEST) {
    selfTest();
} else {
    // Full row: needs the container-built tarball. The Nix-built objdir tree
    // is the red-by-design subject when no container tarball exists yet.
    import('./lib/built-tree.mjs').then(({ extractPackage }) => {
        let root;
        try {
            root = extractPackage();
        } catch (err) {
            console.error(`${NAME}: FAIL -- no container-built tarball: ${err.message}. Next step: run: ${BUILD_CMD}`);
            process.exit(1);
        }
        const { failures, ceiling, elfs } = checkTree(root);
        rmSync(join(root, '..'), { recursive: true, force: true });
        if (failures.length) {
            console.error(`${NAME}: FAIL -- ${failures.length} failure(s) over ${elfs} ELFs (ceiling ${ceiling ? `GLIBC ${fmtVer(ceiling.glibc)}, GLIBCXX ${fmtVer(ceiling.glibcxx)} from ${ceiling.source}` : 'unresolved'}):\n  ${failures.join('\n  ')}`);
            process.exit(1);
        }
        console.log(`${NAME}: PASS -- ${elfs} ELFs carry no /nix/store INTERP/RUNPATH and need at most GLIBC ${fmtVer(ceiling.glibc)} (declared floor) and GLIBCXX ${fmtVer(ceiling.glibcxx)}; measured sysroot ${ceiling.dist} glibc ${fmtVer(ceiling.sysrootGlibc)} is within the floor (${ceiling.source})`);
    }).catch((err) => {
        console.error(`${NAME}: FAIL -- ${err.message}. Next step: run: ${BUILD_CMD}`);
        process.exit(1);
    });
}
