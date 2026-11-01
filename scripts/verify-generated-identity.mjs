#!/usr/bin/env node
/**
 * GEN-04's byte-identity gate: what the generator emits from
 * configuration.toml is byte-for-byte its tracked comparands: the thirty-three
 * build surfaces Phase 1 wrote by hand, the surfaces later phases added (the
 * live total is printed on every run; 39 at Phase 55), and three declared
 * exceptions: the identity carrier
 * (MIG-05) and the two release-identity version files (REL-01) never had a
 * hand-written original, so their comparands are frozen copies of the
 * emission rather than independent originals.
 *
 * This is the phase's acceptance test made mechanical. Phase 1 deliberately
 * wrote every branding value as a hand-written literal -- CLAUDE.md says so in
 * as many words -- precisely so that Phase 2 would have something INDEPENDENT
 * to compare its generator against. Those thirty-three tracked files are that
 * comparand. They are never edited to make this check green; when this check
 * goes red, the emitter is what changed.
 *
 * ## Why the ACTUAL emitter set is derived and only the EXPECTED set is written down
 *
 * The tempting shape is a hand-kept list of thirty-three paths that the check loops
 * over. That check agrees with every tree: it can never go red on a SIXTH
 * emitter being added, because it never asks the generator what it emits. So
 * the actual set is DERIVED from generate.mjs's own frozen target table at
 * check time and compared to the declared set as a SET EQUALITY, which
 * discriminates in both directions -- a surplus emitter is reported by path, a
 * declared file whose emitter was deleted is reported by path. `--self-test`
 * proves that against a planted surplus and a planted removal rather than
 * trusting it.
 *
 * ## Why this emits into its own temporary directory instead of reading generated/
 *
 * This is the part that will not be obvious to a future reader. `generated/` is
 * git-ignored (.gitignore line `/generated/`), so every fresh clone and every
 * CI runner starts WITHOUT it. A check that compared the tracked files against
 * `generated/` would therefore be red on a tree with no defect at all -- and a
 * gate that is red for a reason that is not a defect trains its readers to
 * ignore it, at which point it gates nothing. So this check emits its own
 * comparand into an `mkdtempSync` directory removed in a `finally`, reads
 * nothing under `generated/`, and writes nothing there either. Running it on a
 * tree that has never run the generator is a supported case, not an edge case.
 *
 * The freshness of `generated/` itself is a DIFFERENT question with a different
 * answer, and it has its own instrument: `node scripts/generate.mjs --check`.
 *
 * Honestly --quick: it reads the manifest and every tracked comparand (39 at
 * Phase 55, ten of them PNG rasters; the run prints the live count) and writes
 * into the OS temp directory. No build, no browser, no display, no network.
 *
 * Usage:
 *   node scripts/verify-generated-identity.mjs
 *   node scripts/verify-generated-identity.mjs --self-test
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { REPO_ROOT, TARGETS, resolveConfig } from './generate.mjs';

const NAME = 'verify-generated-identity';
const OUTPUT_DIR_NAME = 'generated';

/**
 * The declared contract, as paths tracked in this repo.
 *
 * This is the ONE hand-kept list in the file, and it is deliberate. Without a
 * written-down expectation there is nothing for the derived set to be compared
 * AGAINST, and the check degenerates into "the generator emits whatever it
 * emits". The two can disagree because they have independent sources: this
 * list is authored here, the actual set comes out of generate.mjs's frozen
 * target table. Editing this constant is how a deliberate contract change is
 * made -- it lands in the diff where a reviewer sees it, which is the entire
 * point of freezing the set.
 */
const EXPECTED = Object.freeze([
    '.mozconfig',
    'powerbrowser/branding/dev/configure.sh',
    'powerbrowser/branding/release/configure.sh',
    'powerbrowser/powerbrowser.desktop',
    'powerbrowser/powerbrowser-release.desktop',
    // NEW (03-01): the GEN-01 locale surfaces -- both variants' brand.ftl and
    // brand.properties, emitted by the format emitters in scripts/generate.mjs
    // and compared here against the hand-written files plan 01-03 wrote.
    'powerbrowser/branding/dev/locales/en-US/brand.ftl',
    'powerbrowser/branding/dev/locales/en-US/brand.properties',
    'powerbrowser/branding/release/locales/en-US/brand.ftl',
    'powerbrowser/branding/release/locales/en-US/brand.properties',
    // NEW (03-01): the GEN-01 brand-literal layout surfaces -- zero
    // manifest-derived values, reproduced byte for byte by the literal
    // emitters, dev and release byte-identical except pref/firefox-branding.js
    // which carries the dev-only title-bar block by design.
    'powerbrowser/branding/dev/moz.build',
    'powerbrowser/branding/dev/content/jar.mn',
    'powerbrowser/branding/dev/content/moz.build',
    'powerbrowser/branding/dev/locales/jar.mn',
    'powerbrowser/branding/dev/locales/moz.build',
    'powerbrowser/branding/dev/content/aboutDialog.css',
    'powerbrowser/branding/dev/pref/firefox-branding.js',
    'powerbrowser/branding/release/moz.build',
    'powerbrowser/branding/release/content/jar.mn',
    'powerbrowser/branding/release/content/moz.build',
    'powerbrowser/branding/release/locales/jar.mn',
    'powerbrowser/branding/release/locales/moz.build',
    'powerbrowser/branding/release/content/aboutDialog.css',
    'powerbrowser/branding/release/pref/firefox-branding.js',
    // NEW (03-02): GEN-02's icon rasters -- both variants' five PNGs, drawn
    // from the single brand/mark.svg and compared here against the ten
    // hand-rasterized files plan 01-03 drew with the same inkscape.
    'powerbrowser/branding/dev/default16.png',
    'powerbrowser/branding/dev/default32.png',
    'powerbrowser/branding/dev/default48.png',
    'powerbrowser/branding/dev/default64.png',
    'powerbrowser/branding/dev/default128.png',
    'powerbrowser/branding/release/default16.png',
    'powerbrowser/branding/release/default32.png',
    'powerbrowser/branding/release/default48.png',
    'powerbrowser/branding/release/default64.png',
    'powerbrowser/branding/release/default128.png',
    // NEW (05-01, MIG-05): the identity carrier's declared bytes. Unlike
    // every entry above this one is NOT a Phase-1 hand-written original --
    // the carrier never had one -- it is a frozen copy of the emission,
    // authored once from the emitter and committed, so emitter drift on the
    // relocated telemetry-policy lines goes red here. Same contract as the
    // hand-written files: on a red, the emitter is what changes; this file
    // is never edited to make the gate green. It is a comparand, not a
    // build input: the build reads generated/identity.configure through the
    // upstream/identity.configure symlink, never this path.
    'powerbrowser/identity.configure.comparand',
    // NEW (Phase 40, REL-01): the release-identity version files. Frozen
    // copies of the emission, authored once from the emitter, same contract
    // as the carrier above. Release metadata, never a Gecko build input.
    'powerbrowser/packaging/version/version.txt',
    'powerbrowser/packaging/version/release.txt',
    // NEW (Phase 45, PKG-17): the release .mozconfig variant. Frozen copy of
    // the release emission (objdir-release, --enable-bootstrap, SB keyfile
    // mount), authored once from the emitter, same contract as the carrier
    // above: on a red, the emitter is what changes. The container release
    // build configures against the generated copy of these bytes.
    // Deliberately written here as well as in TARGETS (IN-03, Phase 45): the
    // TARGETS row is the emitter side, this line is the declared contract. Deriving
    // it from TARGETS would compare the generator with itself, so a dropped or
    // renamed release target would never go red.
    'powerbrowser/packaging/mozconfig.release',
    // NEW (Phase 55, PKG-14): the aarch64 macOS mozconfig. A deliberate contract
    // change, so it lands here in the same commit as its TARGETS row. Frozen copy
    // of the shared builder's output plus the Darwin tail, authored once from the
    // emitter; on a red, the emitter is what changes.
    'powerbrowser/packaging/mozconfig-macos-aarch64',
    // NEW (Phase 55, PKG-14): the x86_64 macOS mozconfig, the second target through
    // the same shared builder. Same contract as the aarch64 entry above.
    'powerbrowser/packaging/mozconfig-macos-x86_64',
    // NEW (Phase 54, PKG-11): the x86_64 Windows mozconfig through the same shared
    // builder, with the target triple and --disable-maintenance-service as its tail.
    // A deliberate contract change, so it lands here in the same commit as its
    // TARGETS row; on a red, the emitter is what changes, never this comparand.
    'powerbrowser/packaging/mozconfig-windows-x86_64',
]);

/** Set difference reported by name, so a failure says WHICH path drifted. */
function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return {
        surplus: [...a].filter(p => !e.has(p)),
        missing: [...e].filter(p => !a.has(p)),
    };
}

/**
 * The 1-based number of the first differing line, or 0 if equal.
 *
 * REPORTING AID ONLY. The assertion is Buffer.compare -- byte-identity -- and
 * this runs only after that assertion has already failed, to say where. A
 * line-level differ used as the check itself would call two files identical
 * when they differ in trailing whitespace or in line endings, which is exactly
 * the class of difference this phase's acceptance test is about.
 */
function firstDifferingLine(a, b) {
    const x = a.split('\n');
    const y = b.split('\n');
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
        if (x[i] !== y[i]) return i + 1;
    }
    return 0;
}

const variantOf = (config, id) => (config.variants ?? []).find(v => v.id === id);

/**
 * Emit `targets` into a fresh temporary directory and compare each emitted
 * file against its TRACKED counterpart in the repo.
 *
 * `targets` is a parameter rather than the imported constant so that
 * `--self-test` can drive this exact function with a mutated table. Two
 * comparison paths -- one for the real run, one for the self-test -- would let
 * the thing being proved and the thing being run drift apart, and the planted
 * faults would then prove nothing about the check that actually gates.
 *
 * `readTracked` is a parameter for the same reason: the different-root cases
 * substitute the tracked side in memory rather than editing one of the tracked
 * tracked files -- even temporarily, even restoring it afterwards -- which
 * would be one interrupted run away from corrupting the independent comparand
 * this phase's acceptance test rests on.
 *
 * @returns {string[]} failure messages -- empty means byte-identity holds.
 */
function compareAgainstTracked(targets, config, readTracked = (p) => readFileSync(p)) {
    const failures = [];
    // Never OUTPUT_ROOT. The comparand is emitted here and destroyed in the
    // finally below; nothing under generated/ is read or written by this file.
    const dir = mkdtempSync(join(tmpdir(), 'verify-generated-identity-'));
    try {
        /** @type {Map<string, string>} tracked repo path -> emitted temp path */
        const emitted = new Map();
        for (const target of targets) {
            const variant = variantOf(config, target.variant);
            if (variant === undefined) {
                failures.push(`${target.tracked}: the manifest declares no build variant with id "${target.variant}", so nothing could be emitted for it`);
                continue;
            }
            // Rows with no tracked comparand prove nothing here: GEN-02's
            // ICO/ICNS containers have no hand-written originals, so there is
            // nothing to compare them against. Skipped, not compared against
            // nothing -- their structure is scripts/verify-icon-ihdr.mjs's
            // contract, and the agreement gate still sees the rows through the
            // frozen table it derives from.
            if (target.tracked === undefined) continue;
            const out = join(dir, target.generated);
            mkdirSync(dirname(out), { recursive: true });
            writeFileSync(out, target.emit(config, variant), 'utf8');
            emitted.set(target.tracked, out);
        }

        // Non-vacuity, asserted BEFORE the set comparison. A comparison whose
        // comparand is empty agrees with anything at all, so an emission that
        // produced no files must fail as broken instrumentation rather than
        // report a clean diff of nothing against nothing.
        if (emitted.size === 0) {
            failures.push('the emission produced ZERO files, so this comparison proves nothing either way');
            return failures;
        }

        const { surplus, missing } = diff([...emitted.keys()], EXPECTED);
        for (const path of surplus) {
            failures.push(`${path}: emitted by a target that is NOT in the declared contract -- add it to EXPECTED in this script if that is deliberate`);
        }
        for (const path of missing) {
            failures.push(`${path}: named in the declared contract, but NO target emits it any more`);
        }

        for (const tracked of EXPECTED) {
            const temp = emitted.get(tracked);
            // Already reported by name as missing above; a second complaint
            // about the same path would read as a second problem.
            if (temp === undefined) continue;
            const want = readFileSync(temp);
            const have = Buffer.from(readTracked(join(REPO_ROOT, tracked)));
            if (Buffer.compare(want, have) !== 0) {
                const at = firstDifferingLine(have.toString('utf8'), want.toString('utf8'));
                failures.push(`${tracked}: the generator's output is NOT byte-identical to it, from line ${at}`);
            }
        }

        return failures;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * GEN-04's other half: the generated tree is not stored with the project.
 *
 * These ride on this row rather than in a third script for the reason CLAUDE.md
 * gives -- one driver, one registry -- and because they are the same claim from
 * the other side: the tracked files are the source of truth, the generated ones
 * are derived and disposable.
 */
function checkGeneratedIsNotTracked() {
    const failures = [];

    // THIS RUNS FIRST, and its failure returns rather than accumulating.
    //
    // Two reasons. It is the call that was NOT wrapped -- the check-ignore
    // below exits non-zero by design and always was -- so run where git is not
    // on PATH, or on an exported tarball with no .git, it threw ENOENT out of
    // main() uncaught: a stack trace carrying node: frames and this machine's
    // path to the project, the same user-facing copy rule generate.mjs
    // enforces by pattern. And it is the call whose failure means git itself
    // is unusable, which makes check-ignore's own non-zero exit meaningless --
    // reporting "generated/ is not ignored by git" alongside it would name a
    // second problem that does not exist and send the reader to .gitignore.
    let tracked;
    try {
        tracked = execFileSync('git', ['ls-files', '--', OUTPUT_DIR_NAME], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    } catch {
        failures.push(`the project's version control could not be read, so whether ${OUTPUT_DIR_NAME}/ is stored with the project could not be checked. Next step: run this from a working copy of the project, with git available.`);
        return failures;
    }

    if (tracked !== '') {
        const names = tracked.split('\n');
        failures.push(`git tracks ${names.length} file(s) under ${OUTPUT_DIR_NAME}/, which is generated output: ${names.join(', ')}`);
    }

    try {
        // THE TRAILING SLASH IS LOAD-BEARING. .gitignore's pattern is
        // `/generated/`, which matches directories only, and `git check-ignore`
        // cannot tell that a path is a directory when the directory does not
        // exist -- which is the state of every fresh clone and every CI runner.
        // Asked about bare `generated` on such a tree, git answers "not
        // ignored" and this gate would be red on a clone with no defect, which
        // is the exact failure mode this whole script is built to avoid.
        execFileSync('git', ['check-ignore', '-q', '--', `${OUTPUT_DIR_NAME}/`], { cwd: REPO_ROOT, stdio: 'ignore' });
    } catch {
        failures.push(`${OUTPUT_DIR_NAME}/ is not ignored by git -- add "/${OUTPUT_DIR_NAME}/" to .gitignore, so generated files are never stored with the project`);
    }

    return failures;
}

// --- self-test: planted faults that must each go red ------------------------

/**
 * Did this case's mutation actually change anything the check can see?
 *
 * A planted fault that did not land makes its case VACUOUS, and a vacuous case
 * that prints `ok` is worse than no case at all -- it is a green line asserting
 * nothing, which is precisely the failure this whole file exists to prevent one
 * level up. The comparison is against the real table on every axis the check
 * reads: the entry count, each entry's tracked path, and each emitter's actual
 * OUTPUT for the resolved config. That last one is what catches a drift wrapper
 * whose anchor drifted and which now returns the unmodified string.
 */
function mutationLanded(targets, config) {
    if (targets.length !== TARGETS.length) return true;
    return targets.some((target, i) => {
        const original = TARGETS[i];
        if (target.tracked !== original.tracked || target.variant !== original.variant) return true;
        const variant = variantOf(config, target.variant);
        if (variant === undefined) return false;
        return target.emit(config, variant) !== original.emit(config, variant);
    });
}

/** A copy of the frozen table with one entry's emitter wrapped to drift by one byte. */
function withDriftAt(index) {
    return TARGETS.map((target, i) => (
        i === index
            ? { ...target, emit: (config, variant) => `${target.emit(config, variant)}\n` }
            : target
    ));
}

/**
 * The foreign root the different-root cases substitute. A fixed literal, never
 * derived from this machine -- the one case that distinguishes this fix from
 * deleting the comparison must be checkable at any checkout, and a root read
 * off this tree would make it pass only here.
 */
const FOREIGN_SELFTEST_ROOT = '/foreign/checkout/pb';

/** The install-time placeholder both tracked .desktop entries carry. */
const DESKTOP_TOKEN = '@POWERBROWSER_REPO_ROOT@';

/**
 * The foreign-root substitution both readTracked cases share, applied to TEXT
 * files only. A PNG read as utf8 and re-encoded is NOT the same bytes --
 * undecodable sequences become the replacement character -- so substituting
 * blindly would redden every GEN-02 raster for an encoding reason rather
 * than a drift. Files that do not survive a utf8 round trip pass through
 * byte-identical, which is also what they would be at any other checkout:
 * tracked bytes are tracked bytes.
 */
function substituteForForeignRoot(path, from, to) {
    const raw = readFileSync(path);
    const text = raw.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(raw)) return raw;
    return text.split(from).join(to);
}

/**
 * The landed-guard for the `readTracked` cases, alongside `mutationLanded`.
 *
 * A substitution whose anchor occurs in no tracked file changes nothing the
 * check can see, and a case built on it printing `ok` is the vacuous green
 * this file exists to prevent one level up. Reported as broken
 * instrumentation, not as a pass -- and for the green case in particular the
 * anchor also proves the contract still holds: the token must still be in the
 * tracked files for "the substitution changed nothing" to mean "there is
 * nothing checkout-specific to change" rather than "the token already left".
 */
function trackedAnchorLanded(anchor) {
    return EXPECTED.some((tracked) => readFileSync(join(REPO_ROOT, tracked), 'utf8').includes(anchor));
}

/**
 * How many times this checkout's absolute root occurs across all emitted
 * outputs. Under the placeholder design the answer must be zero: an emitted
 * byte carrying the checkout path is what made this gate red everywhere but
 * here, and the relocated case below would be vacuous over an emitter that
 * still bakes one in.
 */
function emittedRootHits(config) {
    let hits = 0;
    for (const target of TARGETS) {
        const variant = variantOf(config, target.variant);
        if (variant === undefined) continue;
        // String() because the GEN-02 icon rows emit Buffers, which have no
        // split: for text rows it is the identity, for binary it decodes.
        hits += String(target.emit(config, variant)).split(REPO_ROOT).length - 1;
    }
    return hits;
}

/**
 * Proves the comparison discriminates before it is trusted. A check that can
 * only go green is not a check -- CLAUDE.md's verification rules say so, and
 * 01-05 shipped two assertions resting on a non-discriminating instrument
 * before that was caught.
 *
 * The faults are planted in the TABLE, never on disk. Those tracked files
 * are the independent comparand this phase's acceptance test rests on, and a
 * self-test that edited one of them -- even temporarily, even restoring it
 * afterwards -- would be one interrupted run away from corrupting the very
 * thing it is proving against.
 */
function selfTest() {
    const { failures: configFailures, config } = resolveConfig();
    if (configFailures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- configuration.toml does not pass its own checks, so nothing below could mean anything:`);
        configFailures.forEach(f => console.error(`  ${f}`));
        return 1;
    }

    // A planted-fault result measured against an already-red baseline says
    // nothing about the fault. Establish the baseline first and bail if the
    // unmodified tree is the thing that is broken.
    const baseline = compareAgainstTracked(TARGETS, config);
    if (baseline.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }

    const surplus = { ...TARGETS[0], generated: 'planted-surplus.mozconfig', tracked: 'powerbrowser/planted-surplus.mozconfig' };

    const cases = Object.freeze([
        // Drift rows cover the tracked set only: a container row with no
        // tracked comparand cannot drift against one, and the template-string
        // wrapper below would corrupt binary output on the way through.
        ...TARGETS.flatMap((target, i) => (target.tracked === undefined ? [] : [{
            name: `one-byte drift in the emitter for ${target.tracked}`,
            targets: withDriftAt(i),
            expect: target.tracked,
        }])),
        {
            name: 'a sixth target emitting a file nobody declared',
            targets: [...TARGETS, surplus],
            expect: surplus.tracked,
        },
        {
            name: 'a declared file whose target was deleted',
            targets: TARGETS.slice(1),
            expect: TARGETS[0].tracked,
        },
        // 02-08, option-4-placeholder: the case the seven above could not
        // express. The emitted bytes carry no checkout path, so a substitution
        // standing in for a foreign checkout changes nothing and the run must
        // stay GREEN -- reported with its polarity, because a set that can
        // only ever go red is the defect's mirror image.
        {
            name: 'relocated checkout',
            targets: TARGETS,
            readTracked: (p) => substituteForForeignRoot(p, REPO_ROOT, FOREIGN_SELFTEST_ROOT),
            anchor: DESKTOP_TOKEN,
            expectGreen: true,
        },
        // 02-08, option-4-placeholder: the drift this branch can still catch,
        // and the reason the row is not a tautology in the other direction. A
        // literal absolute path where the token belongs must go RED naming
        // the tracked file.
        {
            name: 'a literal absolute path planted where the token belongs',
            targets: TARGETS,
            readTracked: (p) => substituteForForeignRoot(p, DESKTOP_TOKEN, FOREIGN_SELFTEST_ROOT),
            anchor: DESKTOP_TOKEN,
            expect: 'powerbrowser/powerbrowser.desktop',
        },
    ]);

    let failed = 0;
    // THE CROSS-CUTTING ASSERTION, applied to every case's text in the loop
    // rather than written as an extra case -- a case could only ever check its
    // own fixture. No PASS or FAIL line this gate prints may carry this
    // checkout's absolute path (CLAUDE.md's no-internals copy rule). The
    // non-emptiness assertion runs FIRST: the red cases demonstrably print a
    // failure line naming a tracked path and the green case prints its
    // stayed-green detail, so this predicate is applied to text the code under
    // test really emits, never to an absence over nothing.
    const checkNoCheckoutPath = (caseName, lines) => {
        const text = lines.join('\n');
        if (text.length === 0) {
            console.error(`${NAME}: --self-test FAIL -- '${caseName}' produced no output text at all, so the no-path predicate would pass vacuously`);
            return false;
        }
        if (text.includes(REPO_ROOT)) {
            console.error(`${NAME}: --self-test FAIL -- '${caseName}' leaked this checkout's path into its output: ${text}`);
            return false;
        }
        return true;
    };
    for (const testCase of cases) {
        if (testCase.readTracked !== undefined) {
            if (!trackedAnchorLanded(testCase.anchor)) {
                console.error(`${NAME}: --self-test FAIL -- '${testCase.name}' substituted ${JSON.stringify(testCase.anchor)} but that anchor occurs in no tracked file; the case is vacuous and the contract it edits has drifted`);
                failed++;
                continue;
            }
            const failures = compareAgainstTracked(testCase.targets, config, testCase.readTracked);
            if (testCase.expectGreen === true) {
                const hits = emittedRootHits(config);
                if (hits !== 0) {
                    console.error(`${NAME}: --self-test FAIL -- '${testCase.name}' found ${hits} occurrence(s) of this checkout's root in the emitted bytes; the emitter still bakes in a checkout path`);
                    failed++;
                    continue;
                }
                if (failures.length !== 0) {
                    console.error(`${NAME}: --self-test FAIL -- '${testCase.name}' did not stay green at a different root; got: ${failures.join(' | ')}`);
                    failed++;
                    continue;
                }
                const detail = `emitted bytes carry no checkout path across ${TARGETS.length} targets; a foreign-root substitution changed nothing`;
                console.log(`  ok  ${testCase.name} -> stayed green at a different root (${detail})`);
                if (!checkNoCheckoutPath(testCase.name, [detail])) failed++;
                continue;
            }
            if (failures.some(f => f.includes(testCase.expect))) {
                console.log(`  ok  ${testCase.name} -> red, naming '${testCase.expect}'`);
                if (!checkNoCheckoutPath(testCase.name, failures)) failed++;
            } else {
                console.error(`${NAME}: --self-test FAIL -- '${testCase.name}' did not go red naming '${testCase.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                failed++;
            }
            continue;
        }
        if (!mutationLanded(testCase.targets, config)) {
            console.error(`${NAME}: --self-test FAIL -- '${testCase.name}' changed nothing the check can see; the case is vacuous and the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = compareAgainstTracked(testCase.targets, config);
        // CONTAINS the expected path, not merely non-empty: a failure naming
        // some other file would prove the check goes red, not that it goes red
        // on the thing that actually drifted.
        if (failures.some(f => f.includes(testCase.expect))) {
            console.log(`  ok  ${testCase.name} -> red, naming '${testCase.expect}'`);
            if (!checkNoCheckoutPath(testCase.name, failures)) failed++;
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${testCase.name}' did not go red naming '${testCase.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed++;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${cases.length} cases behaved as pinned (1 stayed green at a different root, the rest went red naming the drift)`);
    return 0;
}

function main() {
    // A typo -- --selftest, --self_test, --check -- used to run the FULL check
    // instead and print PASS, so an operator believed the self-test had
    // discriminated when it never ran. generate.mjs rejects unknown arguments
    // for exactly this reason; this sibling now does too.
    for (const arg of process.argv.slice(2)) {
        if (arg !== '--self-test') {
            console.error(`${NAME}: FAIL -- unknown argument '${arg}'`);
            console.error(`  Next step: run: node scripts/verify-generated-identity.mjs, or add --self-test to prove the comparison discriminates.`);
            return 1;
        }
    }

    if (process.argv.includes('--self-test')) return selfTest();

    const { failures: configFailures, config } = resolveConfig();
    if (configFailures.length > 0) {
        console.error(`${NAME}: FAIL -- configuration.toml does not pass its own checks, so nothing could be generated to compare:`);
        configFailures.forEach(f => console.error(`  ${f}`));
        console.error('  Next step: run: node scripts/generate.mjs -- it reports the same settings and how to fix each one.');
        return 1;
    }

    const failures = [
        ...compareAgainstTracked(TARGETS, config),
        ...checkGeneratedIsNotTracked(),
    ];

    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the generator's byte-identity to the hand-written build surfaces.`);
        console.error(`These ${EXPECTED.length} tracked files are the INDEPENDENT comparand Phase 1 wrote by hand for exactly this test (plus the MIG-05 identity-carrier comparand EXPECTED declares as the one exception). Do not edit them to make this green -- change the emitter in scripts/generate.mjs, or, if the difference is a deliberate contract change, change EXPECTED in this script in the same commit.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }

    console.log(`${NAME}: PASS -- ${EXPECTED.length} generated file(s) are byte-identical to their hand-written counterparts, and ${OUTPUT_DIR_NAME}/ is untracked`);
    return 0;
}

process.exit(main());
