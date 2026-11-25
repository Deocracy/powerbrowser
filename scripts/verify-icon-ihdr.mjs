#!/usr/bin/env node
// scripts/verify-icon-ihdr.mjs
//
// The icon-output gate: the PNG rasters plus the ICO/ICNS containers the
// generator emits under generated/branding/ are structurally what the
// packaging step will ship.
//
// WHY IT EXISTS. The byte-identity gate proves each raster equals its
// hand-written counterpart, but the four containers have no hand-written
// originals -- nothing else reads their headers at all. An ICO whose
// directory points past the end of the file, or an ICNS without its magic,
// would otherwise ride into the build silently. This script reads the five
// defaultN.png files per variant and asserts PNG signature plus IHDR width
// and height both equal to N; asserts firefox.ico opens with reserved 0,
// type 1 and a count equal to its directory entries with each entry's
// payload slice byte-identical to the corresponding raster; and asserts
// firefox.icns opens with the icns magic and a total length equal to the
// file size with each chunk's payload slice byte-identical to its raster
// while walking the chunk chain.
//
// WHY THE SIZES AND CHUNK TYPES ARE WRITTEN DOWN HERE. The five sizes, the
// three ICO payload sizes in ascending order, and the ICNS chunk-type order
// restate the contract scripts/generate.mjs builds to -- they do not derive
// it, because this script reads the bytes on disk: the writer's assertion
// and this one share the contract, not the code path, so one cannot pass by
// agreeing with itself. (The same split the branding-agreement checker keeps
// for its term pairs.)
//
// ON A TREE WITH NO generated/branding/, THIS ROW SKIPS AND PASSES, for the
// same reason generate --check does: generated/ is git-ignored, so that is
// the state of every fresh clone, and a tree that has never generated cannot
// disagree with itself. A PRESENT but empty tree, or a present tree with a
// hole in it, is a defect and fails -- an absent icon file is a failure,
// never a skip.
//
// Honestly --quick: it reads PNG, ICO and ICNS bytes off disk only and emits
// its fixture into mkdtemp directories. No build, no browser, no display, no
// network.
//
// Usage:
//   node scripts/verify-icon-ihdr.mjs
//   node scripts/verify-icon-ihdr.mjs --self-test

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SELF), '..');
const NAME = 'verify-icon-ihdr';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
// --root=<dir> runs the main mode over another tree (the self-test's SKIP control uses it).
const ROOT_ARG = args.find(a => a.startsWith('--root='));
for (const a of args) {
    if (a !== '--self-test' && !a.startsWith('--root=')) {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

// --- assertion plumbing ------------------------------------------------------
//
// Failures accumulate rather than throwing: one run should report every wrong
// icon, not just the first. A single wrong size and thirteen right ones is a
// typo in a TARGETS row; fourteen wrong ones is a raster step that never ran.
function makeReporter() {
    const failures = [];
    return {
        failures,
        fail(msg) { failures.push(msg); },
        eq(label, actual, expected, where) {
            if (actual === expected) return true;
            failures.push(
                `${label}: ${where} carries ${JSON.stringify(actual)} but must equal ` +
                `${JSON.stringify(expected)}`,
            );
            return false;
        },
    };
}

function readBytes(root, rel) {
    const p = join(root, rel);
    if (!existsSync(p)) return null;
    return readFileSync(p);
}

/** The first eight bytes of every PNG. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The five raster sizes in pixels, ascending. The raster order is this order. */
const ICON_SIZES = Object.freeze([16, 32, 48, 64, 128]);

/** The three ICO payload sizes, ascending. The directory order is this order. */
const ICO_SIZES = Object.freeze([16, 32, 48]);

/**
 * The ICNS chunks in file order: type code plus the raster size it wraps.
 * Type codes from the Apple TN0617 icon-family table: ic07 is the 128-pixel
 * family member, icp5 the 32-pixel one, icp4 the 16-pixel one.
 */
const ICNS_CHUNKS = Object.freeze([
    Object.freeze({ type: 'ic07', size: 128 }),
    Object.freeze({ type: 'icp5', size: 32 }),
    Object.freeze({ type: 'icp4', size: 16 }),
]);

const BRANDING_PREFIX = 'generated/branding';

// --- the checks --------------------------------------------------------------

/**
 * One raster: PNG signature plus IHDR width and height both equal to `size`,
 * read as big-endian uint32 at bytes 16 and 20. Returns the bytes for the
 * payload-identity comparisons below, or null when the file is absent or not
 * a PNG -- further comparisons against it are skipped, never passed.
 */
function checkPng(r, root, variant, size) {
    const rel = `${BRANDING_PREFIX}/${variant}/default${size}.png`;
    const bytes = readBytes(root, rel);
    if (bytes === null) {
        r.fail(`${rel} is absent on disk. Next step: run: node scripts/generate.mjs`);
        return null;
    }
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
        r.fail(`${rel} does not open as a PNG file. Next step: run: node scripts/generate.mjs`);
        return null;
    }
    r.eq(`PNG width (${variant})`, bytes.readUInt32BE(16), size, rel);
    r.eq(`PNG height (${variant})`, bytes.readUInt32BE(20), size, rel);
    return bytes;
}

/**
 * One Windows container: reserved 0, type 1, a count equal to the directory
 * entries the writer emits, each entry's dimensions equal to its size, and
 * each entry's payload slice byte-identical to the raster read above. A
 * header that does not open as an icon, or a count this file cannot hold,
 * fails at once with nothing further read off it.
 */
function checkIco(r, root, variant, pngs) {
    const rel = `${BRANDING_PREFIX}/${variant}/firefox.ico`;
    const bytes = readBytes(root, rel);
    if (bytes === null) {
        r.fail(`${rel} is absent on disk. Next step: run: node scripts/generate.mjs`);
        return;
    }
    if (bytes.length < 6 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) {
        r.fail(`${rel} does not open as a Windows icon: the header must carry reserved byte 0 and image type 1.`);
        return;
    }
    const count = bytes.readUInt16LE(4);
    r.eq('ICO entry count', count, ICO_SIZES.length, rel);
    if (count !== ICO_SIZES.length) return;
    if (6 + 16 * count > bytes.length) {
        r.fail(`${rel} declares ${count} icon(s) but the file ends inside the directory.`);
        return;
    }
    let end = 6 + 16 * count;
    for (let i = 0; i < count; i++) {
        const size = ICO_SIZES[i];
        const at = 6 + 16 * i;
        r.eq(`ICO entry ${i} width`, bytes.readUInt8(at), size, rel);
        r.eq(`ICO entry ${i} height`, bytes.readUInt8(at + 1), size, rel);
        const length = bytes.readUInt32LE(at + 8);
        const offset = bytes.readUInt32LE(at + 12);
        if (offset + length > bytes.length) {
            r.fail(
                `${rel} entry ${i} points at bytes ${offset}..${offset + length} but the file is only ${bytes.length} bytes long.`,
            );
            continue;
        }
        const want = pngs.get(size);
        if (want !== undefined && !bytes.subarray(offset, offset + length).equals(want)) {
            r.fail(
                `${rel} entry ${i}: the wrapped ${size}-pixel payload is NOT byte-identical to ${BRANDING_PREFIX}/${variant}/default${size}.png.`,
            );
        }
        end = Math.max(end, offset + length);
    }
    if (end !== bytes.length) {
        r.fail(`${rel} carries ${bytes.length - end} trailing byte(s) past its last icon payload.`);
    }
}

/**
 * One macOS container: the icns magic, a total length equal to the file
 * size, and a chunk chain whose every type, length and payload slice matches
 * the contract -- each payload byte-identical to its raster. A header that
 * does not open as an icon fails at once; a broken chain stops the walk,
 * because offsets past the break are the corruption's echo, not new defects.
 */
function checkIcns(r, root, variant, pngs) {
    const rel = `${BRANDING_PREFIX}/${variant}/firefox.icns`;
    const bytes = readBytes(root, rel);
    if (bytes === null) {
        r.fail(`${rel} is absent on disk. Next step: run: node scripts/generate.mjs`);
        return;
    }
    const magic = bytes.length >= 4 ? bytes.subarray(0, 4).toString('ascii') : '';
    r.eq('ICNS magic', magic, 'icns', rel);
    r.eq('ICNS total length', bytes.length >= 8 ? bytes.readUInt32BE(4) : -1, bytes.length, rel);
    if (magic !== 'icns') return;
    if (bytes.length < 8 || bytes.readUInt32BE(4) !== bytes.length) return;
    let at = 8;
    let index = 0;
    let broken = false;
    while (at < bytes.length && !broken) {
        if (at + 8 > bytes.length) {
            r.fail(`${rel} ends inside an icon chunk header at byte ${at}.`);
            broken = true;
            break;
        }
        const type = bytes.subarray(at, at + 4).toString('ascii');
        const length = bytes.readUInt32BE(at + 4);
        const want = ICNS_CHUNKS[index];
        if (want !== undefined) r.eq(`ICNS chunk ${index} type`, type, want.type, rel);
        if (length < 8 || at + length > bytes.length) {
            r.fail(
                `${rel} chunk ${JSON.stringify(type)} declares a length of ${length} byte(s) but only ${bytes.length - at} remain from byte ${at}.`,
            );
            broken = true;
            break;
        }
        const wantBytes = want !== undefined ? pngs.get(want.size) : undefined;
        if (wantBytes !== undefined && !bytes.subarray(at + 8, at + length).equals(wantBytes)) {
            r.fail(
                `${rel} chunk ${JSON.stringify(type)}: the wrapped ${want.size}-pixel payload is NOT byte-identical to ${BRANDING_PREFIX}/${variant}/default${want.size}.png.`,
            );
        }
        at += length;
        index++;
    }
    if (!broken && at !== bytes.length) {
        r.fail(`${rel} carries ${bytes.length - at} trailing byte(s) past its last icon chunk.`);
    }
}

function runChecks(root) {
    const brandingRoot = join(root, 'generated', 'branding');
    // NOT A FAILURE. generated/ is git-ignored, so a fresh clone starts
    // without it -- and a gate red for "never generated" is a gate its
    // readers learn to skip, the failure mode generate --check's own SKIP
    // exists to avoid. An absent tree cannot disagree with itself; a PRESENT
    // but empty or partial one is a defect and fails below.
    if (!existsSync(brandingRoot)) return { skipped: true, failures: [] };

    const r = makeReporter();
    const variants = readdirSync(brandingRoot, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();

    // Non-vacuity: a comparison whose actual set is empty agrees with
    // anything at all, so it must fail as broken instrumentation rather than
    // report a clean diff of nothing against nothing.
    if (variants.length === 0) {
        r.fail(
            'generated/branding/ holds no variant directories at all, so this comparison proves nothing either way. '
            + 'Next step: run: node scripts/generate.mjs',
        );
        return { skipped: false, failures: r.failures };
    }

    let found = 0;
    for (const variant of variants) {
        const pngs = new Map();
        for (const size of ICON_SIZES) {
            const bytes = checkPng(r, root, variant, size);
            if (bytes !== null) {
                pngs.set(size, bytes);
                found++;
            }
        }
        checkIco(r, root, variant, pngs);
        checkIcns(r, root, variant, pngs);
    }

    // Non-vacuity, second half: a tree whose variants carry no icon files at
    // all -- every raster absent -- would otherwise pass on absence rows
    // alone without ever reading a single IHDR.
    if (found === 0) {
        r.fail(
            'generated/branding/ holds no icon rasters at all, so no IHDR dimension was asserted either way. '
            + 'Next step: run: node scripts/generate.mjs',
        );
    }

    return { skipped: false, failures: r.failures };
}

// --- --self-test ---------------------------------------------------------------
//
// Mirrors the real icon set into mkdtemp by copying the generated files --
// never the live tree, which the plants below must not touch -- asserts the
// unmutated control is green first, then plants one mutation per case and
// requires red naming the file and both values.
function selfTest() {
    const live = join(REPO_ROOT, 'generated', 'branding');
    if (!existsSync(live)) {
        // An absent input, so the plants cannot run: a SKIP, not a FAIL (SKIP-PROTOCOL.md rule 4).
        console.log(skipLine(`${NAME} --self-test`, 'generated/branding/ is not there, so there is nothing to mirror and the plants did not run. Next step: run node scripts/generate.mjs'));
        process.exit(SKIP_EXIT);
    }

    const dir = mkdtempSync(join(tmpdir(), 'verify-icon-ihdr-selftest-'));
    let ok = true;
    try {
        const mirror = () => {
            for (const variant of readdirSync(live).sort()) {
                for (const name of readdirSync(join(live, variant)).sort()) {
                    if (!/^default\d+\.png$/.test(name) && name !== 'firefox.ico' && name !== 'firefox.icns') continue;
                    const out = join(dir, 'generated', 'branding', variant, name);
                    mkdirSync(dirname(out), { recursive: true });
                    writeFileSync(out, readFileSync(join(live, variant, name)));
                }
            }
        };
        mirror();

        // Control: the unmutated mirror must be GREEN. Without this, a
        // self-test that plants a mutation and sees red proves nothing --
        // the fixture might be red for an unrelated reason and the plant
        // irrelevant.
        const control = runChecks(dir);
        if (control.skipped || control.failures.length !== 0) {
            console.error(`${NAME}: --self-test FAIL -- the unmutated fixture is already red, so a red result after the plant would prove nothing:`);
            for (const f of control.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- the unmutated icon set is GREEN`);
        }

        // Plant 1: a wrong-height raster -- the IHDR dimension drift the
        // per-file assertion exists to catch. The height byte is set to 31
        // while the file name and width still say 32.
        const pngRel = 'generated/branding/dev/default32.png';
        const pngPath = join(dir, pngRel);
        const pngBytes = Buffer.from(readFileSync(pngPath));
        pngBytes.writeUInt32BE(31, 20);
        writeFileSync(pngPath, pngBytes);
        const drifted = runChecks(dir);
        const driftMsg = drifted.failures.find(f => f.includes(pngRel) && f.includes('31') && f.includes('32'));
        if (!driftMsg) {
            console.error(`${NAME}: --self-test FAIL -- the wrong-height raster (${pngRel}) was NOT rejected naming the file and both values`);
            for (const f of drifted.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- set ${pngRel} to 31 high and it was REJECTED naming the file and both values: ${driftMsg}`);
        }
        mirror();

        // Plant 2: a truncated ICO -- the last directory entry then points
        // past the end of the file, aimed at the payload-slice walk.
        const icoRel = 'generated/branding/dev/firefox.ico';
        const icoPath = join(dir, icoRel);
        const icoBytes = readFileSync(icoPath);
        writeFileSync(icoPath, icoBytes.subarray(0, icoBytes.length - 1));
        const truncated = runChecks(dir);
        const truncatedMsg = truncated.failures.find(f => f.includes(icoRel) && f.includes('entry 2'));
        if (!truncatedMsg) {
            console.error(`${NAME}: --self-test FAIL -- the truncated container (${icoRel}) was NOT rejected naming the file and the entry`);
            for (const f of truncated.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- truncated ${icoRel} by one byte and it was REJECTED naming the file and the entry: ${truncatedMsg}`);
        }
        mirror();

        // Plant 3: a bad ICNS magic -- the header assertion has to name the
        // file carrying the planted magic and the icns it must carry.
        const icnsRel = 'generated/branding/dev/firefox.icns';
        const icnsPath = join(dir, icnsRel);
        const icnsBytes = Buffer.from(readFileSync(icnsPath));
        icnsBytes.write('XXXX', 0, 'ascii');
        writeFileSync(icnsPath, icnsBytes);
        const magic = runChecks(dir);
        const magicMsg = magic.failures.find(f => f.includes(icnsRel) && f.includes('XXXX') && f.includes('icns'));
        if (!magicMsg) {
            console.error(`${NAME}: --self-test FAIL -- the bad-magic container (${icnsRel}) was NOT rejected naming the file and both values`);
            for (const f of magic.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- set ${icnsRel} to magic XXXX and it was REJECTED naming the file and both values: ${magicMsg}`);
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }

    // SKIP control (SKIP-PROTOCOL.md): the main mode, run as a child with its output captured, over a tree that was
    // never generated must exit 77 with the SKIP line last and no PASS line.
    {
        const empty = mkdtempSync(join(tmpdir(), 'verify-icon-ihdr-root-'));
        try {
            const r = spawnSync(process.execPath, [SELF, `--root=${empty}`], { encoding: 'utf8' });
            const lines = (r.stdout ?? '').split('\n').filter(l => l.trim() !== '');
            const last = lines[lines.length - 1] ?? '';
            if (r.status !== SKIP_EXIT || !last.startsWith(`${NAME}: SKIP -- generated/branding/ is not there yet`)
                || lines.some(l => l.includes(`${NAME}: PASS`)) || /: SKIP/.test(r.stderr ?? '')) {
                console.error(`${NAME}: --self-test FAIL -- control: a never-generated tree did not exit 77 with the SKIP line last and no PASS line (status ${r.status}, last line ${JSON.stringify(last)})`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- control: a never-generated tree exits 77 with the SKIP line last`);
            }
        } finally {
            rmSync(empty, { recursive: true, force: true });
        }
    }

    if (!ok) {
        console.error(`${NAME}: --self-test FAIL`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- control green first, then 3 planted faults all behaved as pinned`);
    process.exit(0);
}

if (SELF_TEST) selfTest();

// A tree that was never generated did not run this check: exit 77 with the SKIP line last (SKIP-PROTOCOL.md).
const result = runChecks(ROOT_ARG ? resolve(ROOT_ARG.slice('--root='.length)) : REPO_ROOT);
if (result.skipped) {
    console.log('  The generated/ folder is not stored with the project, so a fresh copy of it starts out without one. This is not a mismatch.');
    console.log(skipLine(NAME, 'generated/branding/ is not there yet, so there is nothing to compare. Next step: run node scripts/generate.mjs'));
    process.exit(SKIP_EXIT);
}
if (result.failures.length > 0) {
    console.error(`${NAME}: FAIL -- ${result.failures.length} icon problem(s) under generated/branding/`);
    for (const f of result.failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- every icon raster is IHDR-exact and both containers are structurally valid`);
process.exit(0);
