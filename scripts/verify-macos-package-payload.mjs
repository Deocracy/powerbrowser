#!/usr/bin/env node
// scripts/verify-macos-package-payload.mjs
//
// The macOS universal payload gate (Phase 55, PKG-14, PKG-15, SEC-04 wiring). It judges what
// `powerbrowser/packaging/package-macos.sh universal` leaves under .mozbuild/macos-package/, from the
// files only. Every expectation is derived at check time and compared as set equality:
//
//   1. Targets. The Darwin BUILD_TARGET set is derived from the tracked per-target mozconfigs
//      (powerbrowser/packaging/mozconfig-macos-<x>, their --target=<cpu>-apple-darwin line), formatted
//      as UpdateUtils.sys.mjs formats %BUILD_TARGET% (OS_TARGET "_" TARGET_XPCOM_ABI, the ABI being
//      <cpu>-gcc3). No target list is kept here.
//   2. One BuildID. Two independent builds stamp two clock-time BuildIDs (upstream/build/
//      variables.py), and unify.py refuses the differing application.ini. Every per-target
//      application.ini, the unified bundle and every descriptor must carry one fourteen-digit BuildID.
//      How both builds get one date is the build job's concern; the no-build-date-pin row (UPD-26)
//      governs it, and this gate names no build-date variable.
//   3. Slices. Every Mach-O in the unified bundle is a fat file whose slice set equals the CPU set
//      derived in 1. A thin file, a missing slice and an extra slice are red.
//   4. Ad-hoc signature, at this plan. Every slice carries LC_CODE_SIGNATURE, its CodeDirectory page
//      hashes verify against the slice bytes, the CS_ADHOC flag is set, no Team ID is recorded and the
//      CMS blob is empty (no certificate chain). No stapled notarization ticket exists. The Developer
//      ID flip is Task 2 of plan 55-03, which waits on the owner's Team ID (BLOCKED.md item 2).
//   5. DMG. The disk image is extracted with the Linux dmg and hfsplus tools (the Linux branch of
//      upstream/python/mozbuild/mozpack/dmg.py) and must hold the same bundle, byte for byte and file
//      for file, plus the drag-to-install symlink whose name and target are read from dmg.py.
//   6. MAR and descriptors. Each descriptor under update/<channel>/<target>/update.xml is re-emitted
//      through the shared buildUpdateXml (scripts/verify-mar-update-hop.mjs) from the MAR bytes; hash
//      and size are never restated here. Exactly one descriptor per derived target, under the
//      UPDATE_CHANNEL directory, byte-identical to each other (they differ only in the target
//      directory: one universal MAR serves both architectures). The host and path come only through
//      the emitter's inputs (assumption A1: a Phase 47 host change is absorbed there).
//   7. No generic certs. The configure switch that widens privileged-update trust is read from
//      upstream/build/moz.configure/update-programs.configure; neither per-target config.status nor
//      any tracked macOS mozconfig may carry it.
//   8. Sidecar (PKG-15). The packaged paths TheiaService.sys.mjs resolves under GreD (macOS GreD is
//      Contents/Resources, nsAppRunner.cpp) exist in the bundle; every .node, .dylib, rg and node under
//      them is a fat Mach-O (an ELF is named as such); no staged sidecar file names this checkout; and
//      the spawn site passes the node path as the command and the backend entry as an argument, never
//      through a shell, so a bundle path containing a space reaches node intact. The live spawn from a
//      spaced bundle name is a plan 55-04 Mac-session observation.
//
// ABSENT EVIDENCE IS A FAIL naming the docs/BUILD.md procedure that produces it, never a skip (the
// mar-update-hop precedent). This full-tier row stays red until the universal build runs.
//
// Honestly --quick for --self-test only: it builds a synthetic evidence tree in mkdtemp (fat Mach-O
// files with real CodeDirectory hashes, a fake DMG extractor), proves the control green, then plants
// each fault and requires each to go red naming its drift. This script and its self-test only read the
// tree and the evidence; every plant is applied in memory or in mkdtemp.
//
// Usage:
//   node scripts/verify-macos-package-payload.mjs
//   node scripts/verify-macos-package-payload.mjs --self-test

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildUpdateXml, parseUpdateXml } from './verify-mar-update-hop.mjs';
import { UPDATE_CHANNEL } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'macos-package-payload';
const SELF_REL = 'scripts/verify-macos-package-payload.mjs';
const EVIDENCE_REL = '.mozbuild/macos-package';
const PROCEDURE = 'docs/BUILD.md, "macOS universal package (plan 55-03)": run bash powerbrowser/packaging/package-macos.sh universal after both per-target runs';
const PACKAGING_REL = 'powerbrowser/packaging';
const UPDATE_PROGRAMS_REL = 'upstream/build/moz.configure/update-programs.configure';
const DMG_PY_REL = 'upstream/python/mozbuild/mozpack/dmg.py';
const THEIA_SERVICE_REL = 'powerbrowser/shell/TheiaService.sys.mjs';
const API_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';

// Mach-O ABI constants (mach/machine.h, mach-o/loader.h, Security cs_blobs.h). These are the file
// format, not an expectation: which CPUs must be present is derived from the mozconfigs.
const CPU_TYPE = Object.freeze({ aarch64: 0x0100000c, x86_64: 0x01000007 });
const FAT_MAGIC = 0xcafebabe;
const LC_CODE_SIGNATURE = 0x1d;
const CSMAGIC_EMBEDDED_SIGNATURE = 0xfade0cc0;
const CSMAGIC_CODEDIRECTORY = 0xfade0c02;
const CSMAGIC_BLOBWRAPPER = 0xfade0b01;
const CSSLOT_CODEDIRECTORY = 0;
const CSSLOT_SIGNATURESLOT = 0x10000;
const CS_ADHOC = 0x2;
const HASH_ALG = Object.freeze({ 1: 'sha1', 2: 'sha256', 3: 'sha256', 4: 'sha384' });
// shortcut: stapler writes a bundle's notarization ticket to Contents/CodeResources (beside, not in,
// _CodeSignature). Confirm the location at the plan 55-04 Mac session, when a stapled build exists.
const STAPLED_TICKET_REL = 'Contents/CodeResources';

const DIRECT_RUN = (() => {
    try {
        return process.argv[1] !== undefined && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
})();
const args = DIRECT_RUN ? process.argv.slice(2) : [];
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
}

function makeReporter() {
    const failures = [];
    return {
        failures,
        fail(msg) { failures.push(msg); },
        eq(label, actual, expected, where) {
            if (actual === expected) return true;
            failures.push(`${label}: ${where} carries ${JSON.stringify(actual)} but must equal ${JSON.stringify(expected)}`);
            return false;
        },
    };
}

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

/** Every non-directory under dir as relative path -> { link } or { file }, sorted. */
function walk(dir) {
    const out = new Map();
    const rec = (d) => {
        for (const n of readdirSync(d).sort()) {
            const p = join(d, n);
            const st = lstatSync(p);
            if (st.isSymbolicLink()) out.set(relative(dir, p), { link: readlinkSync(p) });
            else if (st.isDirectory()) rec(p);
            else out.set(relative(dir, p), { file: p });
        }
    };
    rec(dir);
    return out;
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// --- Mach-O reading ----------------------------------------------------------------------------

/** 'fat', 'thin', 'elf' or null, from the first bytes. Pure. */
export function binaryKind(buf) {
    if (buf.length < 8) return null;
    if (buf.readUInt32BE(0) === FAT_MAGIC && buf.readUInt32BE(4) > 0 && buf.readUInt32BE(4) < 32) return 'fat';
    const le = buf.readUInt32LE(0);
    if (le === 0xfeedfacf || le === 0xfeedface) return 'thin';
    if (buf.readUInt32BE(0) === 0x7f454c46) return 'elf';
    return null;
}

/** The slices of a Mach-O as { cputype, bytes }. Pure. */
export function slicesOf(buf) {
    const kind = binaryKind(buf);
    if (kind === 'thin') return [{ cputype: buf.readUInt32LE(4), bytes: buf }];
    if (kind !== 'fat') return [];
    const out = [];
    for (let i = 0; i < buf.readUInt32BE(4); i += 1) {
        const base = 8 + i * 20;
        const offset = buf.readUInt32BE(base + 8);
        out.push({ cputype: buf.readUInt32BE(base), bytes: buf.subarray(offset, offset + buf.readUInt32BE(base + 12)) });
    }
    return out;
}

/**
 * The embedded signature of one thin slice: null when no LC_CODE_SIGNATURE exists, else
 * { adhoc, teamId, cmsLength, hashesVerify, problem }. Pure.
 */
export function signatureOf(slice) {
    const is64 = slice.readUInt32LE(0) === 0xfeedfacf;
    const ncmds = slice.readUInt32LE(16);
    let at = is64 ? 32 : 28;
    let sig = null;
    for (let i = 0; i < ncmds && at + 8 <= slice.length; i += 1) {
        const cmd = slice.readUInt32LE(at);
        if (cmd === LC_CODE_SIGNATURE) sig = { off: slice.readUInt32LE(at + 8), size: slice.readUInt32LE(at + 12) };
        at += slice.readUInt32LE(at + 4);
    }
    if (sig === null) return null;
    const sb = slice.subarray(sig.off, sig.off + sig.size);
    if (sb.length < 12 || sb.readUInt32BE(0) !== CSMAGIC_EMBEDDED_SIGNATURE) return { problem: 'the LC_CODE_SIGNATURE data is not an embedded-signature superblob' };
    let cd = null;
    let cmsLength = 0;
    for (let i = 0; i < sb.readUInt32BE(8); i += 1) {
        const type = sb.readUInt32BE(12 + i * 8);
        const off = sb.readUInt32BE(16 + i * 8);
        if (type === CSSLOT_CODEDIRECTORY && sb.readUInt32BE(off) === CSMAGIC_CODEDIRECTORY) cd = sb.subarray(off, off + sb.readUInt32BE(off + 4));
        if (type === CSSLOT_SIGNATURESLOT && sb.readUInt32BE(off) === CSMAGIC_BLOBWRAPPER) cmsLength = sb.readUInt32BE(off + 4) - 8;
    }
    if (cd === null) return { problem: 'the superblob carries no CodeDirectory' };
    const version = cd.readUInt32BE(8);
    const flags = cd.readUInt32BE(12);
    const hashOffset = cd.readUInt32BE(16);
    const nCodeSlots = cd.readUInt32BE(28);
    const codeLimit = cd.readUInt32BE(32);
    const hashSize = cd[36];
    const alg = HASH_ALG[cd[37]];
    const pageSize = 2 ** cd[39];
    const teamOffset = version >= 0x20200 ? cd.readUInt32BE(48) : 0;
    const teamId = teamOffset ? cd.subarray(teamOffset, cd.indexOf(0, teamOffset)).toString('latin1') : null;
    if (!alg) return { problem: `the CodeDirectory hash type ${cd[37]} is unknown` };
    let hashesVerify = true;
    for (let i = 0; i < nCodeSlots; i += 1) {
        const page = slice.subarray(i * pageSize, Math.min((i + 1) * pageSize, codeLimit));
        const want = cd.subarray(hashOffset + i * hashSize, hashOffset + (i + 1) * hashSize);
        if (!createHash(alg).update(page).digest().subarray(0, hashSize).equals(want)) hashesVerify = false;
    }
    return { adhoc: (flags & CS_ADHOC) !== 0, teamId, cmsLength, hashesVerify, problem: null };
}

// --- tree derivations --------------------------------------------------------------------------

/** The Darwin targets from the tracked per-target mozconfigs: [{ suffix, cpu, token }]. */
export function deriveTargets(root, read) {
    let names;
    try {
        names = readdirSync(join(root, PACKAGING_REL)).filter(n => n.startsWith('mozconfig-macos-')).sort();
    } catch {
        names = [];
    }
    const out = [];
    for (const n of names) {
        const cpu = /--target=([a-z0-9_]+)-apple-darwin\b/.exec(read(`${PACKAGING_REL}/${n}`) ?? '')?.[1] ?? null;
        out.push({ suffix: n.slice('mozconfig-macos-'.length), cpu, token: cpu ? `Darwin_${cpu}-gcc3` : null, mozconfig: `${PACKAGING_REL}/${n}` });
    }
    return out;
}

function iniBuildId(text) {
    return /^BuildID=(\S+)\s*$/m.exec(text ?? '')?.[1] ?? null;
}

function iniVersion(text) {
    return /^Version=(\S+)\s*$/m.exec(text ?? '')?.[1] ?? null;
}

/** The default DMG extractor: the Linux branch of mozpack/dmg.py (dmg extract, then hfsplus extractall). */
function extractDmgWithTools(dmgPath, outDir) {
    const fetches = process.env.MOZ_FETCHES_DIR;
    const dmgTool = process.env.DMG_TOOL ?? (fetches ? join(fetches, 'dmg/dmg') : null);
    const hfsTool = process.env.HFS_TOOL ?? (fetches ? join(fetches, 'dmg/hfsplus') : null);
    if (!dmgTool || !hfsTool || !existsSync(dmgTool) || !existsSync(hfsTool)) {
        return `the Linux dmg and hfsplus tools are not reachable (DMG_TOOL, HFS_TOOL or MOZ_FETCHES_DIR/dmg/), so the DMG cannot be opened. Next step: enter nix develop .#firefox-macos and set MOZ_FETCHES_DIR as docs/BUILD.md describes`;
    }
    const hfs = join(outDir, '..', 'payload.hfs');
    const a = spawnSync(dmgTool, ['extract', dmgPath, hfs], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
    if (a.status !== 0) return `${dmgTool} extract failed on the DMG (${(a.stderr || '').trim() || `exit ${a.status}`}). Next step: rebuild the DMG with package-macos.sh universal`;
    const b = spawnSync(hfsTool, [hfs, 'extractall', '/', outDir], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
    if (b.status !== 0) return `${hfsTool} extractall failed on the DMG (${(b.stderr || '').trim() || `exit ${b.status}`}). Next step: rebuild the DMG with package-macos.sh universal`;
    return null;
}

// --- the gate ----------------------------------------------------------------------------------

export function runChecks(root, overrides = {}) {
    const r = makeReporter();
    const read = overrides.read ?? ((rel) => readText(root, rel));
    const ev = overrides.evidenceDir ?? join(root, EVIDENCE_REL);
    const extractDmg = overrides.extractDmg ?? extractDmgWithTools;
    const evRel = (p) => relative(root, p).startsWith('..') ? p : relative(root, p);

    // 1. Targets from the tree.
    const targets = deriveTargets(root, read);
    if (targets.length === 0) {
        r.fail(`no ${PACKAGING_REL}/mozconfig-macos-<arch> exists, so the Darwin target set cannot be derived. Next step: restore the per-target mozconfigs (node scripts/generate.mjs)`);
        return { failures: r.failures };
    }
    for (const t of targets.filter(x => x.cpu === null || !CPU_TYPE[x.cpu])) {
        r.fail(`${t.mozconfig} carries no --target=<cpu>-apple-darwin line with a known Mach-O CPU (got ${JSON.stringify(t.cpu)}). Next step: regenerate it with node scripts/generate.mjs`);
    }
    if (r.failures.length > 0) return { failures: r.failures };
    const wantCpus = new Set(targets.map(t => CPU_TYPE[t.cpu]));
    const wantTokens = new Set(targets.map(t => t.token));

    // The evidence contract: absent is a FAIL naming the procedure.
    if (!existsSync(ev)) {
        r.fail(`${evRel(ev)} is absent, so the universal macOS payload is unproven (no evidence is not a pass). Next step: ${PROCEDURE}`);
        return { failures: r.failures };
    }
    const top = readdirSync(ev).sort();
    const one = (suffix, what) => {
        const hits = top.filter(n => n.endsWith(suffix));
        if (hits.length !== 1) {
            r.fail(`${evRel(ev)} must hold exactly one ${what} (*${suffix}), found ${hits.length}${hits.length ? `: ${hits.join(', ')}` : ''}. Next step: ${PROCEDURE}`);
            return null;
        }
        return join(ev, hits[0]);
    };
    const bundle = one('.app', 'unified bundle');
    const dmg = one('.dmg', 'disk image');
    const mar = one('.complete.mar', 'complete MAR');

    // 2. One BuildID across both per-target builds, the bundle and the descriptors.
    let buildDate = null;
    for (const t of targets) {
        const ini = readText(ev, `application-${t.suffix}.ini`);
        if (ini === null) {
            r.fail(`${evRel(ev)}/application-${t.suffix}.ini is absent, so the ${t.token} BuildID is unproven. Next step: ${PROCEDURE}`);
            continue;
        }
        const id = iniBuildId(ini);
        if (buildDate === null) {
            if (id !== null && /^\d{14}$/.test(id)) buildDate = id;
            else r.fail(`${evRel(ev)}/application-${t.suffix}.ini carries no fourteen-digit BuildID (got ${JSON.stringify(id)}). Next step: rebuild the ${t.token} tree`);
        } else {
            r.eq('shared BuildID', id, buildDate, `${evRel(ev)}/application-${t.suffix}.ini BuildID (divergent BuildIDs: both targets must be built with one build date)`);
        }
    }
    const uniIni = bundle ? readText(bundle, 'Contents/Resources/application.ini') : null;
    if (bundle && uniIni === null) r.fail(`${evRel(bundle)}/Contents/Resources/application.ini is absent. Next step: ${PROCEDURE}`);
    if (uniIni !== null && buildDate !== null) r.eq('shared BuildID', iniBuildId(uniIni), buildDate, `the unified bundle's application.ini BuildID`);

    // 7. No generic certs, in either config.status or any tracked macOS mozconfig.
    const switchName = /"(--enable-[a-z-]*generic-certs)"/.exec(read(UPDATE_PROGRAMS_REL) ?? '')?.[1] ?? null;
    if (switchName === null) {
        r.fail(`${UPDATE_PROGRAMS_REL} names no --enable-...-generic-certs option, so the forbidden switch cannot be derived. Next step: check the upstream checkout (scripts/fetch-upstream.sh) and this gate's derivation`);
    } else {
        for (const t of targets) {
            const status = readText(ev, `config.status-${t.suffix}`);
            if (status === null) r.fail(`${evRel(ev)}/config.status-${t.suffix} is absent, so the ${t.token} configure arguments are unproven. Next step: ${PROCEDURE}`);
            else if (status.includes(switchName)) r.fail(`${evRel(ev)}/config.status-${t.suffix} carries ${switchName} (generic-certs): it widens who may drive a privileged update and is forbidden permanently. Next step: remove it from the mozconfig and rebuild`);
            if ((read(t.mozconfig) ?? '').includes(switchName)) r.fail(`${t.mozconfig} carries ${switchName} (generic-certs), which is forbidden permanently. Next step: remove it in scripts/generate.mjs and regenerate`);
        }
    }

    const files = bundle ? walk(bundle) : new Map();

    // 3 and 4. Slices and the ad-hoc signature of every Mach-O in the bundle; ELF anywhere is red.
    let machoCount = 0;
    for (const [rel, entry] of files) {
        if (!entry.file) continue;
        const bytes = readFileSync(entry.file);
        const kind = binaryKind(bytes);
        const where = `${basename(bundle)}/${rel}`;
        if (kind === 'elf') {
            r.fail(`${where} is an ELF binary (a Linux build reached the macOS bundle). Next step: stage the darwin payload for this path and rerun package-macos.sh`);
            continue;
        }
        const isNativeName = /\.(node|dylib)$/.test(rel) || ['rg', 'node'].includes(basename(rel));
        if (kind === null) {
            if (isNativeName && /^Contents\/Resources\/(theia|node)\//.test(rel)) r.fail(`${where} is named as a native but is no Mach-O (first bytes ${bytes.subarray(0, 4).toString('hex')}). Next step: stage the darwin binary for it`);
            continue;
        }
        machoCount += 1;
        const slices = slicesOf(bytes);
        const have = new Set(slices.map(s => s.cputype));
        const missing = [...wantCpus].filter(c => !have.has(c));
        const extra = [...have].filter(c => !wantCpus.has(c));
        if (kind === 'thin' || missing.length || extra.length) {
            r.fail(`${where} slices: ${kind === 'thin' ? 'single-slice (thin) Mach-O' : 'fat Mach-O'} with CPU types [${[...have].map(c => `0x${c.toString(16)}`).join(', ')}] but the derived target set is [${[...wantCpus].map(c => `0x${c.toString(16)}`).join(', ')}]. Next step: merge both architectures with lipo (package-macos.sh universal)`);
        }
        for (const s of slices) {
            const sig = signatureOf(s.bytes);
            const label = `${where} (CPU 0x${s.cputype.toString(16)})`;
            if (sig === null) { r.fail(`${label} has no code signature (stripped signature): Apple Silicon refuses an unsigned arm64 binary. Next step: sign ad hoc with ./mach macos-sign --use_rcodesign (package-macos.sh universal)`); continue; }
            if (sig.problem) { r.fail(`${label} code signature is unreadable: ${sig.problem}. Next step: re-sign the bundle`); continue; }
            if (!sig.hashesVerify) r.fail(`${label} code signature page hashes do not verify against the slice bytes (modified after signing). Next step: re-sign after the last change`);
            if (!sig.adhoc) r.fail(`${label} code signature is not ad hoc (CS_ADHOC unset); a Developer ID signature belongs to Task 2 of plan 55-03 and waits on the owner's Team ID. Next step: sign ad hoc`);
            if (sig.teamId !== null) r.fail(`${label} code signature records Team ID ${JSON.stringify(sig.teamId)}; this plan ships ad hoc with no Team ID. Next step: sign ad hoc`);
            if (sig.cmsLength > 0) r.fail(`${label} code signature carries a certificate chain (CMS blob of ${sig.cmsLength} bytes); this plan ships ad hoc with none. Next step: sign ad hoc`);
        }
    }
    if (bundle && machoCount === 0) r.fail(`${evRel(bundle)} holds no Mach-O at all (an empty universe is not a pass). Next step: ${PROCEDURE}`);
    if (bundle && files.has(STAPLED_TICKET_REL)) r.fail(`${basename(bundle)}/${STAPLED_TICKET_REL} exists: a notarization ticket is stapled, which this plan does not claim (notarize and staple run at the owner checkpoint). Next step: rebuild without stapling`);

    // 8. Sidecar paths derived from TheiaService under GreD (= Contents/Resources on macOS).
    const svc = read(THEIA_SERVICE_REL) ?? '';
    const staged = [...new Set([...svc.matchAll(/\$\{appDir\}\/([A-Za-z0-9_./-]+)`/g)].map(m => m[1]))].sort();
    if (staged.length === 0) r.fail(`${THEIA_SERVICE_REL} names no \${appDir}/... staged path, so the sidecar layout cannot be derived. Next step: check this gate's derivation against _resolveSidecar`);
    if (bundle) {
        for (const p of staged) {
            if (!files.has(`Contents/Resources/${p}`)) r.fail(`${basename(bundle)}/Contents/Resources/${p} is absent: the packaged shell resolves it under GreD and would fall back to the dev tree. Next step: stage the sidecar (package-macos.sh universal)`);
        }
        for (const [rel, entry] of files) {
            if (!entry.file || !/^Contents\/Resources\/(theia|node)\//.test(rel)) continue;
            if (readFileSync(entry.file).includes(`${REPO_ROOT}/`)) r.fail(`${basename(bundle)}/${rel} carries a checkout path (${REPO_ROOT}/), which must not ship. Next step: rerun package-macos.sh, which rewrites or refuses it`);
        }
    }
    // A spaced bundle path stays one argv element: the node path is the command and the backend an argument.
    const spawnCall = /spawnProcess\(\{\s*command:\s*this\._nodePath,\s*args/.test(svc) && /const args = \[this\._backendMain,/.test(svc);
    const noShell = /Subprocess\.call\(\{[\s\S]{0,200}?command,[\s\S]{0,200}?arguments:\s*args/.test(read(API_REL) ?? '');
    if (!spawnCall || !noShell) r.fail(`the sidecar spawn no longer passes the node path as the command and the backend entry as an argument through Subprocess.call (${THEIA_SERVICE_REL}, ${API_REL}), so a bundle path with a space is not proven to reach node intact. Next step: restore the argv spawn`);

    // 5. The DMG holds the same bundle and the drag-to-install symlink read from dmg.py.
    const link = /"symlink",\s*"\/([^"]*)",\s*"([^"]+)"/.exec(read(DMG_PY_REL) ?? '');
    if (!link) r.fail(`${DMG_PY_REL} names no create_app_symlink target, so the DMG's install symlink cannot be derived. Next step: check the upstream checkout and this gate's derivation`);
    if (bundle && dmg) {
        const scratch = mkdtempSync(join(tmpdir(), 'pb-macos-dmg-'));
        try {
            const out = join(scratch, 'root');
            mkdirSync(out);
            const err = extractDmg(dmg, out);
            if (err) {
                r.fail(`DMG ${basename(dmg)}: ${err}`);
            } else {
                const inner = walk(out);
                const appName = basename(bundle);
                const fromDmg = new Map([...inner].filter(([k]) => k.startsWith(`${appName}/`)).map(([k, v]) => [k.slice(appName.length + 1), v]));
                for (const k of new Set([...files.keys(), ...fromDmg.keys()])) {
                    const a = files.get(k);
                    const b = fromDmg.get(k);
                    if (!a || !b) { r.fail(`DMG ${basename(dmg)}: ${appName}/${k} is ${a ? 'missing from the DMG' : 'in the DMG but not in the bundle'}. Next step: rebuild the DMG from the signed bundle`); continue; }
                    const same = a.link !== undefined ? a.link === b.link : (b.file && sha256(readFileSync(a.file)) === sha256(readFileSync(b.file)));
                    if (!same) r.fail(`DMG ${basename(dmg)}: ${appName}/${k} differs from the bundle. Next step: rebuild the DMG from the signed bundle`);
                }
                if (link && inner.get(link[1])?.link !== link[2]) r.fail(`DMG ${basename(dmg)} carries no drag-to-install symlink "${link[1]}" -> ${link[2]} (the Applications folder the macOS update copy tells users to move PowerBrowser to). Next step: build the DMG through mozbuild.action.make_dmg`);
            }
        } finally {
            rmSync(scratch, { recursive: true, force: true });
        }
    }

    // 6. Descriptors: one per derived target, re-emitted through buildUpdateXml from the MAR bytes.
    const updRoot = join(ev, 'update');
    const found = [];
    if (existsSync(updRoot)) {
        for (const [rel, entry] of walk(updRoot)) {
            const parts = rel.split('/');
            if (entry.file && parts.length === 3 && parts[2] === 'update.xml') found.push({ channel: parts[0], token: parts[1], rel: `update/${rel}`, text: readFileSync(entry.file, 'utf8') });
        }
    }
    if (found.length === 0) r.fail(`${evRel(ev)}/update/<channel>/<target>/update.xml: no descriptor exists. Next step: ${PROCEDURE}`);
    const byToken = new Map();
    for (const d of found) byToken.set(d.token, [...(byToken.get(d.token) ?? []), d]);
    for (const [token, list] of byToken) {
        if (list.length > 1) r.fail(`descriptors ${list.map(d => d.rel).join(' and ')} share the same target ${token} (same-target pair); each derived target needs its own. Next step: emit one descriptor per target`);
        if (!wantTokens.has(token)) r.fail(`descriptor target ${token} is not derived from any ${PACKAGING_REL}/mozconfig-macos-* (derived: ${[...wantTokens].join(', ')}). Next step: emit descriptors for the derived targets only`);
    }
    for (const token of wantTokens) {
        if (!byToken.has(token)) r.fail(`no descriptor exists for the derived target ${token}. Next step: ${PROCEDURE}`);
    }
    const marBytes = mar ? readFileSync(mar) : null;
    for (const d of found) {
        r.eq('descriptor channel', d.channel, UPDATE_CHANNEL, `${d.rel} channel directory (UPDATE_CHANNEL, scripts/generate.mjs)`);
        const p = parseUpdateXml(d.text);
        if (p === null) { r.fail(`${d.rel} is not the descriptor shape buildUpdateXml emits. Next step: emit it with buildUpdateXml`); continue; }
        if (buildDate !== null) r.eq('shared BuildID', p.buildID, buildDate, `${d.rel} buildID`);
        if (uniIni !== null) r.eq('descriptor appVersion', p.appVersion, iniVersion(uniIni), `${d.rel} appVersion (the unified bundle's Version)`);
        if (marBytes === null) continue;
        const again = buildUpdateXml({ marBytes, marUrl: p.url, appVersion: p.appVersion, platformVersion: p.platformVersion, buildID: p.buildID, displayVersion: p.displayVersion, detailsURL: p.detailsURL });
        if (again !== d.text) {
            const q = parseUpdateXml(again);
            r.fail(`${d.rel} differs from its buildUpdateXml re-emission over ${basename(mar)} (hashValue ${p.hashValue.slice(0, 16)}... size ${p.size} vs the MAR's ${q.hashValue.slice(0, 16)}... size ${q.size}). Next step: re-emit the descriptor from the shipped MAR bytes`);
        }
    }
    if (found.length > 1 && new Set(found.map(d => d.text)).size !== 1) r.fail(`the Darwin descriptors differ in content; they must differ only in their target directory (one universal MAR serves both). Next step: emit both from one buildUpdateXml call`);

    return { failures: r.failures, targets, machoCount, descriptors: found.length };
}

// --- self-test fixtures ------------------------------------------------------------------------

/** One thin 64-bit Mach-O slice with an optional embedded signature, its page hash real. */
export function fakeSlice(cputype, { sign = true, adhoc = true, team = null, cms = 0 } = {}) {
    const code = Buffer.alloc(4096, 0x90);
    code.fill(0, 0, 64);
    code.writeUInt32LE(0xfeedfacf, 0);
    code.writeUInt32LE(cputype, 4);
    code.writeUInt32LE(cputype === CPU_TYPE.x86_64 ? 3 : 0, 8); // CPU_SUBTYPE_X86_64_ALL, CPU_SUBTYPE_ARM64_ALL
    code.writeUInt32LE(2, 12);
    code.writeUInt32LE(sign ? 1 : 0, 16);
    code.writeUInt32LE(sign ? 16 : 0, 20);
    if (!sign) return code;
    const ident = Buffer.from('fixture\0', 'latin1');
    const teamBytes = team ? Buffer.from(`${team}\0`, 'latin1') : Buffer.alloc(0);
    const cdHead = 52;
    const identOffset = cdHead;
    const teamOffset = team ? identOffset + ident.length : 0;
    const hashOffset = identOffset + ident.length + teamBytes.length;
    const cdLen = hashOffset + 32;
    const cd = Buffer.alloc(cdLen);
    cd.writeUInt32BE(CSMAGIC_CODEDIRECTORY, 0);
    cd.writeUInt32BE(cdLen, 4);
    cd.writeUInt32BE(0x20200, 8);
    cd.writeUInt32BE(adhoc ? CS_ADHOC : 0, 12);
    cd.writeUInt32BE(hashOffset, 16);
    cd.writeUInt32BE(identOffset, 20);
    cd.writeUInt32BE(1, 28);
    cd.writeUInt32BE(4096, 32);
    cd[36] = 32; cd[37] = 2; cd[39] = 12;
    cd.writeUInt32BE(teamOffset, 48);
    ident.copy(cd, identOffset);
    teamBytes.copy(cd, identOffset + ident.length);
    const blobs = [[CSSLOT_CODEDIRECTORY, cd]];
    if (cms > 0) {
        const w = Buffer.alloc(8 + cms, 0x30);
        w.writeUInt32BE(CSMAGIC_BLOBWRAPPER, 0);
        w.writeUInt32BE(8 + cms, 4);
        blobs.push([CSSLOT_SIGNATURESLOT, w]);
    }
    const head = 12 + blobs.length * 8;
    const sbLen = head + blobs.reduce((n, [, b]) => n + b.length, 0);
    const sb = Buffer.alloc(sbLen);
    sb.writeUInt32BE(CSMAGIC_EMBEDDED_SIGNATURE, 0);
    sb.writeUInt32BE(sbLen, 4);
    sb.writeUInt32BE(blobs.length, 8);
    let off = head;
    blobs.forEach(([type, b], i) => { sb.writeUInt32BE(type, 12 + i * 8); sb.writeUInt32BE(off, 16 + i * 8); b.copy(sb, off); off += b.length; });
    code.writeUInt32LE(LC_CODE_SIGNATURE, 32);
    code.writeUInt32LE(16, 36);
    code.writeUInt32LE(4096, 40);
    code.writeUInt32LE(sbLen, 44);
    // The page hash covers the final header bytes, so it is computed last.
    createHash('sha256').update(code).digest().copy(cd, hashOffset);
    cd.copy(sb, head);
    return Buffer.concat([code, sb]);
}

/** A fat Mach-O of the given slices, 4096-aligned. */
export function fakeFat(slices) {
    const parts = [];
    let off = 4096;
    const head = Buffer.alloc(4096);
    head.writeUInt32BE(FAT_MAGIC, 0);
    head.writeUInt32BE(slices.length, 4);
    slices.forEach((s, i) => {
        const base = 8 + i * 20;
        head.writeUInt32BE(s.readUInt32LE(4), base);
        head.writeUInt32BE(s.readUInt32LE(8), base + 4);
        head.writeUInt32BE(off, base + 8);
        head.writeUInt32BE(s.length, base + 12);
        head.writeUInt32BE(12, base + 16);
        const padded = Buffer.alloc(Math.ceil(s.length / 4096) * 4096);
        s.copy(padded);
        parts.push(padded);
        off += padded.length;
    });
    return Buffer.concat([head, ...parts]);
}

function writeAt(root, rel, bytes) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), bytes);
}

/** A green evidence tree for the real tree's derived targets. */
function buildFixture(dir, targets) {
    const date = '20261031120000';
    const ini = `[App]\nVersion=153.5.1\nBuildID=${date}\n[Gecko]\nMaxVersion=153.5.1\n`;
    const fat = () => fakeFat(targets.map(t => fakeSlice(CPU_TYPE[t.cpu])));
    for (const t of targets) {
        writeAt(dir, `application-${t.suffix}.ini`, ini);
        writeAt(dir, `config.status-${t.suffix}`, `substs = {\n    'MOZ_UPDATE_CHANNEL': '${UPDATE_CHANNEL}',\n}\n`);
    }
    const app = 'Fixture.app';
    writeAt(dir, `${app}/Contents/MacOS/fixture`, fat());
    writeAt(dir, `${app}/Contents/Resources/application.ini`, ini);
    writeAt(dir, `${app}/Contents/_CodeSignature/CodeResources`, '<plist/>\n');
    writeAt(dir, `${app}/Contents/Resources/theia/lib/backend/main.js`, '// backend\n');
    writeAt(dir, `${app}/Contents/Resources/theia/lib/backend/native/rg`, fat());
    writeAt(dir, `${app}/Contents/Resources/theia/lib/backend/native/keytar.node`, fat());
    writeAt(dir, `${app}/Contents/Resources/node/bin/node`, fat());
    writeAt(dir, 'Fixture-153.5.1-1.macos-universal.dmg', 'fixture disk image\n');
    const marBytes = Buffer.from('fixture complete MAR bytes\n');
    writeAt(dir, 'Fixture-153.5.1-1.macos-universal.complete.mar', marBytes);
    const xml = buildUpdateXml({ marBytes, marUrl: 'https://mar.example.invalid/v153.5.1-1/fixture.complete.mar', appVersion: '153.5.1', platformVersion: '153.5.1', buildID: date, displayVersion: '153.5.1-1', detailsURL: 'https://example.invalid/releases' });
    for (const t of targets) writeAt(dir, `update/${UPDATE_CHANNEL}/${t.token}/update.xml`, xml);
}

function selfTest() {
    const realRead = (rel) => readText(REPO_ROOT, rel);
    const targets = deriveTargets(REPO_ROOT, realRead);
    const dmgLink = /"symlink",\s*"\/([^"]*)",\s*"([^"]+)"/.exec(realRead(DMG_PY_REL) ?? '');
    if (targets.length === 0 || targets.some(t => !CPU_TYPE[t.cpu]) || !dmgLink) {
        console.error(`${NAME}: --self-test FAIL -- the tree yields no usable Darwin target set or no dmg.py install symlink, so no fixture can be built`);
        return 1;
    }
    const scratch = mkdtempSync(join(tmpdir(), 'pb-macos-payload-'));
    let failed = 0;
    try {
        const base = join(scratch, 'base');
        buildFixture(base, targets);
        const fresh = (name) => {
            const d = join(scratch, name.replace(/[^a-z0-9]+/gi, '-'));
            cpSync(base, d, { recursive: true, verbatimSymlinks: true });
            return d;
        };
        // The fake extractor: the bundle plus the derived drag-to-install symlink, as dmg.py lays it out.
        const extractorFor = (d, link = dmgLink) => (dmgPath, outDir) => {
            cpSync(join(d, 'Fixture.app'), join(outDir, 'Fixture.app'), { recursive: true, verbatimSymlinks: true });
            if (link) symlinkSync(link[2], join(outDir, link[1]));
            return null;
        };
        const control = runChecks(REPO_ROOT, { evidenceDir: base, read: realRead, extractDmg: extractorFor(base) });
        if (control.failures.length > 0) {
            console.error(`${NAME}: --self-test FAIL -- the synthetic green evidence is already red, so the plants below would mean nothing:`);
            control.failures.forEach(f => console.error(`  ${f}`));
            return 1;
        }
        console.log(`  ok  baseline -> green (${control.machoCount} Mach-O, ${control.descriptors} descriptors, targets ${control.targets.map(t => t.token).join(', ')})`);

        const t0 = targets[0];
        const t1 = targets[targets.length - 1];
        const exe = 'Fixture.app/Contents/MacOS/fixture';
        const sliceAll = (opts) => fakeFat(targets.map(t => fakeSlice(CPU_TYPE[t.cpu], opts)));
        const plants = [
            ['single-slice binary', d => writeAt(d, exe, fakeSlice(CPU_TYPE[t0.cpu])), 'single-slice'],
            ['divergent BuildIDs', d => writeAt(d, `application-${t1.suffix}.ini`, readFileSync(join(d, `application-${t1.suffix}.ini`), 'utf8').replace(/BuildID=\d+/, 'BuildID=20261031120001')), 'divergent BuildIDs'],
            ['stripped signature', d => writeAt(d, exe, sliceAll({ sign: false })), 'stripped signature'],
            ['cert-chain signature', d => writeAt(d, exe, sliceAll({ cms: 64 })), 'certificate chain'],
            ['Team ID in the signature', d => writeAt(d, exe, sliceAll({ team: 'TEAMFIXTURE' })), 'Team ID'],
            ['non-ad-hoc signature', d => writeAt(d, exe, sliceAll({ adhoc: false })), 'not ad hoc'],
            ['byte changed after signing', d => { const b = readFileSync(join(d, exe)); b[4096 + 2000] ^= 0xff; writeAt(d, exe, b); }, 'page hashes do not verify'],
            ['stapled notarization ticket', d => writeAt(d, `Fixture.app/${STAPLED_TICKET_REL}`, 'ticket'), 'notarization ticket'],
            ['hash-mismatched descriptor', d => writeAt(d, 'Fixture-153.5.1-1.macos-universal.complete.mar', 'another MAR\n'), 'hashValue'],
            ['same-target descriptor pair', d => { rmSync(join(d, `update/${UPDATE_CHANNEL}/${t1.token}`), { recursive: true }); writeAt(d, `update/release/${t0.token}/update.xml`, readFileSync(join(d, `update/${UPDATE_CHANNEL}/${t0.token}/update.xml`))); }, 'same-target pair'],
            ['generic-certs config.status', d => writeAt(d, `config.status-${t0.suffix}`, `${readFileSync(join(d, `config.status-${t0.suffix}`), 'utf8')}args = ['--enable-mac-elevated-updates-with-generic-certs']\n`), 'generic-certs'],
            ['missing evidence', d => rmSync(d, { recursive: true }), 'docs/BUILD.md'],
            ['ELF node under a darwin name', d => writeAt(d, 'Fixture.app/Contents/Resources/node/bin/node', Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(60)])), 'ELF'],
            ['backend entry missing', d => rmSync(join(d, 'Fixture.app/Contents/Resources/theia/lib/backend/main.js')), 'theia/lib/backend/main.js'],
            ['checkout path in the sidecar', d => writeAt(d, 'Fixture.app/Contents/Resources/theia/lib/backend/main.js', `// ${REPO_ROOT}/theia/node_modules/x\n`), 'checkout path'],
            ['file missing from the DMG', d => ({ extractDmg: (dmgPath, outDir) => { extractorFor(d)(dmgPath, outDir); rmSync(join(outDir, 'Fixture.app/Contents/Resources/node/bin/node')); return null; } }), 'missing from the DMG'],
            ['no Applications symlink in the DMG', d => ({ extractDmg: extractorFor(d, null) }), 'Applications'],
            ['spawn through a shell string', () => ({ read: rel => (rel === THEIA_SERVICE_REL ? realRead(rel).replace('command: this._nodePath, args', 'command: "/bin/sh", args: ["-c", `${this._nodePath} ${args.join(" ")}`]') : realRead(rel)) }), 'argv spawn'],
        ];
        for (const [name, mutate, needle] of plants) {
            const d = fresh(name);
            const extra = mutate(d) ?? {};
            const { failures } = runChecks(REPO_ROOT, { evidenceDir: d, read: realRead, extractDmg: extractorFor(d), ...extra });
            if (failures.some(f => f.includes(needle))) {
                console.log(`  ok  ${name} -> red naming '${needle}'`);
            } else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${needle}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                failed += 1;
            }
        }
        if (failed > 0) return 1;
        console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming their drift, and the control stayed green`);
        return 0;
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, machoCount, descriptors } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the universal macOS payload`);
        failures.forEach(f => console.error(`  - ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${machoCount} Mach-O file(s) carry every derived slice and a verifying ad-hoc signature with no Team ID, certificate chain or ticket; one shared BuildID; the DMG holds the same bundle; ${descriptors} Darwin descriptor(s) re-emit byte-identical from the MAR`);
    return 0;
}

if (DIRECT_RUN) process.exit(main());
