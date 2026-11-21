#!/usr/bin/env node
// scripts/verify-branding-agreement.mjs
//
// The branding-directory agreement gate: the tree generate.mjs emits under
// generated/branding/ is a complete drop-in branding directory per variant,
// and its two locale halves agree with each other.
//
// WHY IT EXISTS. The byte-identity gate proves each emitted file equals its
// hand-written counterpart, but it cannot see the directory AS a directory:
// a deleted emitter leaves its output out of the set without failing any
// per-file comparison (generate --check catches that only when generated/ is
// present and fresh), and two files that must carry the same name in both
// halves can silently disagree. This script derives the emitted file set
// under generated/branding/ per variant AT CHECK TIME and compares as set
// equality in three directions, then re-asserts the ftl-versus-properties
// term equality off the generated files -- the same agreement the emitter
// asserts in memory before writing, now proved on the bytes on disk.
//
// WHY THE EXPECTATION IS DERIVED, NOT WRITTEN DOWN. The expected set comes
// out of generate.mjs's own frozen TARGETS table at check time, restricted
// to rows whose generated path sits under branding/. A hand-kept list of
// eleven files could only ever agree with the table it was copied from: it
// would stay green when an emitter was added without a row and when a row
// was added without an emitter. The comparison still discriminates in both
// directions because the two sides have independent sources -- the table
// declares, the directory contains.
//
// Honestly --quick: it reads text files off disk only and emits its fixture
// into mkdtemp directories. No build, no browser, no display, no network.
//
// Usage:
//   node scripts/verify-branding-agreement.mjs
//   node scripts/verify-branding-agreement.mjs --self-test

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

import { TARGETS, resolveConfig } from './generate.mjs';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SELF), '..');
const NAME = 'verify-branding-agreement';

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

// --- assertion plumbing -----------------------------------------------------
//
// Failures accumulate rather than throwing: one run should report every
// wrong file, not just the first. A single missing file and ten present ones
// is a typo in a TARGETS row; eleven missing files is a generate that never
// ran.
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

function readText(root, rel) {
    const p = join(root, rel);
    if (!existsSync(p)) return null;
    return readFileSync(p, 'utf8');
}

/** Every file under `dir`, as slash-joined paths relative to it. */
function filesUnder(dir, prefix, out) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) filesUnder(join(dir, entry.name), rel, out);
        // Anything else -- a symlink, a socket, anything a generate never
        // writes -- is skipped structurally: it is neither an emitted file
        // to expect nor a directory to descend into.
        else if (entry.isFile()) out.push(rel);
    }
    return out;
}

/** One `name = value` term out of a locale file's text. */
function localeTermValue(text, term) {
    const m = text.match(new RegExp(`^${term}\\s*=\\s*(.*)$`, 'm'));
    return m ? m[1].trim() : null;
}

/**
 * The ftl-versus-properties pairs that must agree within one variant. The
 * same three pairs scripts/generate.mjs asserts in memory before writing,
 * restated here because this script reads the bytes on disk: the emitter's
 * assertion and this one share the contract, not the code path, so one
 * cannot pass by agreeing with itself.
 */
const AGREEMENT_PAIRS = Object.freeze([
    Object.freeze({ ftl: '-brand-full-name', props: 'brandFullName', what: 'the full name' }),
    Object.freeze({ ftl: '-brand-short-name', props: 'brandShortName', what: 'the short name' }),
    Object.freeze({ ftl: '-brand-shorter-name', props: 'brandShorterName', what: 'the shorter name' }),
]);

const BRANDING_PREFIX = 'branding/';

/** The TARGETS rows that declare branding-directory output. */
function brandingTargets() {
    return TARGETS.filter(t => t.generated.startsWith(BRANDING_PREFIX));
}

/** The file set one variant must carry, derived from the frozen table. */
function expectedFor(variant) {
    const prefix = `${BRANDING_PREFIX}${variant}/`;
    return brandingTargets()
        .filter(t => t.variant === variant && t.generated.startsWith(prefix))
        .map(t => t.generated.slice(prefix.length))
        .sort();
}

// --- the checks -------------------------------------------------------------

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

    // Non-vacuity, first half: a comparison whose actual set is empty agrees
    // with anything at all, so it must fail as broken instrumentation rather
    // than report a clean diff of nothing against nothing.
    if (variants.length === 0) {
        r.fail(
            'generated/branding/ holds no variant directories at all, so this comparison proves nothing either way. '
            + `Next step: run: node scripts/generate.mjs`,
        );
        return { skipped: false, failures: r.failures };
    }

    const emittedByVariant = {};
    for (const variant of variants) {
        const expected = expectedFor(variant);
        // Non-vacuity, second half: a variant the frozen table declares
        // nothing for would pass every comparison below by having nothing
        // to disagree about.
        if (expected.length === 0) {
            r.fail(
                `generated/branding/${variant}/ is on disk but no TARGETS row declares branding output for the ${JSON.stringify(variant)} variant, so its content is unchecked either way. `
                + 'Next step: report this; configuration.toml is not the cause and editing it will not help.',
            );
            emittedByVariant[variant] = [];
            continue;
        }
        const emitted = filesUnder(join(brandingRoot, variant), '', []).sort();
        emittedByVariant[variant] = emitted;

        // Direction (a): every emitted file expected by TARGETS. A file the
        // generator no longer declares -- a removed emitter's leftover, or a
        // hand-placed file -- must not ride along into the build silently.
        for (const rel of emitted) {
            if (!expected.includes(rel)) {
                r.fail(
                    `generated/branding/${variant}/${rel} is on disk but no TARGETS row in scripts/generate.mjs declares it. `
                    + 'Next step: delete it if it is a leftover, or add the emitter row that owns it, then run: node scripts/generate.mjs',
                );
            }
        }

        // Direction (b): every TARGETS branding row present on disk. A
        // declared file that was never written -- a stale tree, a partial
        // write -- is a branding directory with a hole in it.
        for (const rel of expected) {
            if (!emitted.includes(rel)) {
                r.fail(
                    `generated/branding/${variant}/${rel} is declared by a TARGETS row in scripts/generate.mjs but is absent on disk. `
                    + 'Next step: run: node scripts/generate.mjs',
                );
            }
        }
    }

    // Direction (c): the variants carry EQUAL destination sets. Every
    // branding change in this tree is written once per variant, so a file
    // present in dev but not release is a one-sided fix, not a variant
    // difference -- the one deliberate content difference (the dev-only
    // title-bar block in pref/firefox-branding.js) changes bytes, never
    // paths.
    for (let i = 1; i < variants.length; i++) {
        const a = variants[0];
        const b = variants[i];
        const setA = new Set(emittedByVariant[a] ?? []);
        const setB = new Set(emittedByVariant[b] ?? []);
        const onlyA = [...setA].filter(p => !setB.has(p)).sort();
        const onlyB = [...setB].filter(p => !setA.has(p)).sort();
        if (onlyA.length || onlyB.length) {
            r.fail(
                `generated/branding/${a}/ and generated/branding/${b}/ hold DIFFERENT file sets -- `
                + `only in ${a}: ${JSON.stringify(onlyA)}; only in ${b}: ${JSON.stringify(onlyB)}. `
                + 'Next step: run: node scripts/generate.mjs; if the difference persists, the TARGETS table is one-sided.',
            );
        }
    }

    // The agreement itself, re-asserted off the generated files: the three
    // shared names must match between brand.ftl and brand.properties within
    // each variant. An absent locale file is a failure, never a skip -- a
    // branding directory without its locale files is not a branding
    // directory.
    for (const variant of variants) {
        const ftlRel = `generated/branding/${variant}/locales/en-US/brand.ftl`;
        const propsRel = `generated/branding/${variant}/locales/en-US/brand.properties`;
        const ftl = readText(root, ftlRel);
        const props = readText(root, propsRel);
        if (ftl === null) {
            r.fail(`${ftlRel} is absent on disk. Next step: run: node scripts/generate.mjs`);
            continue;
        }
        if (props === null) {
            r.fail(`${propsRel} is absent on disk. Next step: run: node scripts/generate.mjs`);
            continue;
        }
        for (const { ftl: ftlTerm, props: propsKey, what } of AGREEMENT_PAIRS) {
            r.eq(
                `brand ${what} agreement (${variant})`,
                localeTermValue(ftl, ftlTerm),
                localeTermValue(props, propsKey),
                `${ftlRel}'s ${ftlTerm} versus ${propsRel}'s ${propsKey}`,
            );
        }
    }

    return { skipped: false, failures: r.failures };
}

// --- --self-test ------------------------------------------------------------
//
// Mirrors the generated branding tree into mkdtemp using the real TARGETS
// rows and the real emitters -- never the live generated/ tree, which the
// plants below must not touch -- asserts the unmutated control is green
// first, then plants one mutation per case and requires red naming the file
// and both values.
function selfTest() {
    const { failures: configFailures, config } = resolveConfig();
    if (configFailures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- configuration.toml does not pass its own checks, so nothing below could mean anything:`);
        configFailures.forEach(f => console.error(`  - ${f}`));
        process.exit(1);
    }

    const dir = mkdtempSync(join(tmpdir(), 'branding-agreement-selftest-'));
    let ok = true;
    try {
        const mirror = () => {
            for (const target of brandingTargets()) {
                const variant = (config.variants ?? []).find(v => v.id === target.variant);
                const out = join(dir, 'generated', target.generated);
                mkdirSync(dirname(out), { recursive: true });
                writeFileSync(out, target.emit(config, variant), 'utf8');
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
        }

        // Plant 1: a drifted full-name term -- the exact disagreement the
        // emitter-side assertion exists to prevent. The drift value is not
        // a brand value, so no new hardcoded literal enters this file; the
        // expected value is read back out of the unmutated properties file
        // rather than typed.
        const ftlRel = 'generated/branding/dev/locales/en-US/brand.ftl';
        const propsRel = 'generated/branding/dev/locales/en-US/brand.properties';
        const ftlPath = join(dir, ftlRel);
        const propsValue = localeTermValue(readFileSync(join(dir, propsRel), 'utf8'), 'brandFullName');
        writeFileSync(
            ftlPath,
            readFileSync(ftlPath, 'utf8').replace(/^(-brand-full-name = ).*$/m, '$1Planted Drift'),
        );
        const drifted = runChecks(dir);
        const driftMsg = drifted.failures.find(f => f.includes(ftlRel) && f.includes('Planted Drift') && f.includes(propsValue));
        if (!driftMsg) {
            console.error(`${NAME}: --self-test FAIL -- the drifted full-name term was NOT rejected naming the file and both values`);
            for (const f of drifted.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- drifted the full-name term in ${ftlRel} and it was REJECTED naming the file and both values: ${driftMsg}`);
        }
        mirror();

        // Plant 2: a removed layout file -- the pre-fix state of a
        // one-sided packaging fix, aimed at direction (b).
        const layoutRel = 'generated/branding/dev/moz.build';
        rmSync(join(dir, layoutRel));
        const removed = runChecks(dir);
        const removedMsg = removed.failures.find(f => f.includes(layoutRel) && f.includes('absent on disk'));
        if (!removedMsg) {
            console.error(`${NAME}: --self-test FAIL -- the removed layout file (${layoutRel}) was NOT rejected by name`);
            for (const f of removed.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- removed ${layoutRel} and it was REJECTED by name: ${removedMsg}`);
        }
        mirror();

        // Plant 3: an emptied branding directory -- the tree the stale-tree
        // failure mode leaves behind. Must fail with the distinct empty-set
        // message, not with eleven per-file rows and not with a pass.
        rmSync(join(dir, 'generated', 'branding'), { recursive: true, force: true });
        mkdirSync(join(dir, 'generated', 'branding'), { recursive: true });
        const emptied = runChecks(dir);
        const emptiedMsg = emptied.failures.find(f => f.includes('holds no variant directories'));
        if (!emptiedMsg) {
            console.error(`${NAME}: --self-test FAIL -- the emptied branding directory was NOT rejected with the distinct empty-set message`);
            for (const f of emptied.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- emptied generated/branding/ and it was REJECTED distinctly: ${emptiedMsg}`);
        }

        // Case 4: an absent branding directory -- the state of every fresh
        // clone -- SKIPS with exit 0 rather than failing. A gate red for a
        // non-defect is a gate its readers learn to skip, which is the
        // failure mode generate --check's own SKIP exists to avoid.
        rmSync(join(dir, 'generated', 'branding'), { recursive: true, force: true });
        const absent = runChecks(dir);
        if (!absent.skipped) {
            console.error(`${NAME}: --self-test FAIL -- the absent branding directory did not SKIP; got: ${absent.failures.join(' | ') || '(no failures at all)'}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- the absent branding directory SKIPPED as designed`);
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }

    // SKIP control (SKIP-PROTOCOL.md): the main mode, run as a child with its output captured, over a tree that was
    // never generated must exit 77 with the SKIP line last and no PASS line.
    {
        const empty = mkdtempSync(join(tmpdir(), 'verify-branding-agreement-root-'));
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
    console.log(`${NAME}: --self-test PASS`);
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
    console.error(`${NAME}: FAIL -- ${result.failures.length} branding agreement problem(s) under generated/branding/`);
    for (const f of result.failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- every generated branding directory agrees with the frozen table and its locale halves match`);
process.exit(0);
