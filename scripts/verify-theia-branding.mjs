#!/usr/bin/env node
// scripts/verify-theia-branding.mjs
//
// The Theia branding gate (04-04, GEN-05 remainder): the manifest's
// [theia]/[installer] display values reach the sidecar as the
// theia.frontend.config applicationName/defaultTheme keys and the
// powerbrowserBranding block, and the branding extension compiles.
//
// WHAT IT ASSERTS. All three expectations are DERIVED at check time --
// from the manifest through scripts/generate.mjs's own resolver and
// emitters -- never kept here:
//
//  1. generated/theia-frontend-config.json parses and equals what the
//     manifest emits right now (a drifted name or theme fails naming the
//     key). Absent fragment SKIPS this step only: generated/ is
//     git-ignored, so that is the state of every fresh clone, and a gate
//     red on it would be a gate its readers skip (generate-check's own
//     rule).
//  2. generated/theia-branding.json parses and equals what the manifest
//     plus brand/mark.svg emit right now (a drifted text, repo URL or mark
//     fails naming the key). Same absent-fragment skip.
//  3. theia/applications/browser/package.json's theia.frontend.config
//     applicationName/defaultTheme keys and powerbrowserBranding block
//     equal those same maps (a block still carrying a repo URL the
//     manifest no longer emits is stale output, not a clean tree). The
//     tracked file is committed, so this step always runs -- it is what
//     pins the yarn-managed side.
//  4. The extension compiles (tsc -b, skipped with a message where the
//     theia install is absent).
//
// Honestly --quick: it reads text files and runs tsc on one extension.
// No app build, no browser, no display, no network.
//
// Usage:
//   node scripts/verify-theia-branding.mjs
//   node scripts/verify-theia-branding.mjs --self-test
//
// The self-test plants three faults and requires each to go red: a
// drifted tracked block, a drifted fragment, and a tracked block with the
// powerbrowserBranding key removed -- each with the unmutated control
// green first, so a red is plant-caused.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { emitTheiaBranding, emitTheiaFrontendConfig, resolveConfig } from './generate.mjs';
import { SKIP_EXIT, skipLine, verdictExit } from './lib/skip-verdict.mjs';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SELF), '..');
const NAME = 'verify-theia-branding';

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

const MANIFEST_REL = 'configuration.toml';
const FRONTEND_FRAGMENT_REL = 'generated/theia-frontend-config.json';
const BRANDING_FRAGMENT_REL = 'generated/theia-branding.json';
const APP_PKG_REL = 'theia/applications/browser/package.json';
const BRANDING_BLOCK_KEY = 'powerbrowserBranding';
const TSC_REL = 'theia/node_modules/typescript/bin/tsc';
const EXT_REL = 'theia/extensions/branding';
const RERUN_GENERATE = 'node scripts/generate.mjs';

function readBytes(root, rel) {
    const p = join(root, rel);
    if (!existsSync(p)) return null;
    return readFileSync(p);
}

function checkFragment(root, rel, emit, failures, skipped) {
    let expected;
    try {
        expected = JSON.parse(emit);
    } catch {
        failures.push(`the emitted ${rel} is not valid JSON, so it cannot be compared. Next step: report this; ${MANIFEST_REL} is not the cause and editing it will not help.`);
        return null;
    }
    const fragmentBytes = readBytes(root, rel);
    if (fragmentBytes === null) {
        skipped.push(`${rel} is absent (nothing generated in this copy yet) -- fragment equality unchecked; run ${RERUN_GENERATE} to cover it.`);
        return expected;
    }
    let fragment;
    try {
        fragment = JSON.parse(fragmentBytes.toString('utf8'));
    } catch {
        failures.push(`${rel} is not valid JSON, so it cannot be compared against ${MANIFEST_REL}. Next step: run ${RERUN_GENERATE} to rewrite it, then re-run this check.`);
        return expected;
    }
    for (const key of Object.keys(expected)) {
        if (!Object.hasOwn(fragment, key)) {
            failures.push(`${rel} is missing ${JSON.stringify(key)} -- stale output. Next step: run ${RERUN_GENERATE}, then re-run this check.`);
        } else if (JSON.stringify(fragment[key]) !== JSON.stringify(expected[key])) {
            failures.push(`${rel} carries ${JSON.stringify(key)} = ${JSON.stringify(fragment[key]).slice(0, 80)} but ${MANIFEST_REL} emits a different value -- stale output. Next step: run ${RERUN_GENERATE}, then re-run this check.`);
        }
    }
    for (const key of Object.keys(fragment ?? {})) {
        if (!Object.hasOwn(expected, key)) {
            failures.push(`${rel} carries ${JSON.stringify(key)}, which ${MANIFEST_REL} no longer emits -- stale output. Next step: run ${RERUN_GENERATE}, then re-run this check.`);
        }
    }
    return expected;
}

function runPinChecks(root) {
    const failures = [];
    const skipped = [];

    // --- 0. the manifest resolves -----------------------------------------
    const { failures: resolveFailures, config } = resolveConfig(join(root, MANIFEST_REL), undefined);
    if (resolveFailures.length > 0) {
        for (const f of resolveFailures) failures.push(`${MANIFEST_REL} is red, so the branding pins prove nothing: ${f}`);
        return { failures, skipped };
    }
    const dev = (config.variants ?? []).find(v => v.id === 'dev');

    // --- 1+2. the generated fragments --------------------------------------
    const frontendExpected = checkFragment(
        root, FRONTEND_FRAGMENT_REL, emitTheiaFrontendConfig(config, dev), failures, skipped,
    );
    const brandingExpected = checkFragment(
        root, BRANDING_FRAGMENT_REL, emitTheiaBranding(config, dev), failures, skipped,
    );

    // --- 3. the application package.json block ------------------------------
    const pkgBytes = readBytes(root, APP_PKG_REL);
    if (pkgBytes === null) {
        failures.push(`${APP_PKG_REL} does not exist, so the branding block cannot be checked at all.`);
        return { failures, skipped };
    }
    let pkg;
    try {
        pkg = JSON.parse(pkgBytes.toString('utf8'));
    } catch {
        failures.push(`${APP_PKG_REL} is not valid JSON, so the branding block cannot be checked at all.`);
        return { failures, skipped };
    }
    const block = pkg?.theia?.frontend?.config;
    if (block === undefined) {
        failures.push(`${APP_PKG_REL} carries no theia.frontend.config block, so the branding keys cannot be checked at all.`);
        return { failures, skipped };
    }
    if (frontendExpected !== null) {
        for (const key of Object.keys(frontendExpected)) {
            if (JSON.stringify(block[key]) !== JSON.stringify(frontendExpected[key])) {
                failures.push(`${APP_PKG_REL}'s theia.frontend.config ${JSON.stringify(key)} is ${JSON.stringify(block[key]).slice(0, 80)} but ${MANIFEST_REL} emits ${JSON.stringify(frontendExpected[key]).slice(0, 80)} -- stale output. Next step: copy the key from ${FRONTEND_FRAGMENT_REL} (that key only; leave every sibling key byte-identical), then re-run this check.`);
            }
        }
    }
    if (brandingExpected !== null) {
        const actual = block[BRANDING_BLOCK_KEY];
        if (actual === undefined) {
            failures.push(`${APP_PKG_REL}'s theia.frontend.config carries no ${BRANDING_BLOCK_KEY} block but ${MANIFEST_REL} emits one -- stale output. Next step: copy the block from ${BRANDING_FRAGMENT_REL} (that key only; leave every sibling key byte-identical), then re-run this check.`);
        } else if (JSON.stringify(actual) !== JSON.stringify(brandingExpected)) {
            failures.push(`${APP_PKG_REL}'s ${BRANDING_BLOCK_KEY} block differs from what ${MANIFEST_REL} emits -- stale output. Next step: copy the block from ${BRANDING_FRAGMENT_REL} (that key only; leave every sibling key byte-identical), then re-run this check.`);
        }
    }

    return { failures, skipped };
}

function runBuildChecks(root) {
    const failures = [];
    const skipped = [];

    if (!existsSync(join(root, TSC_REL))) {
        skipped.push(`the theia install is absent (${TSC_REL} not found) -- tsc proof unchecked; run the audited theia install, then re-run this check.`);
    } else {
        const child = spawnSync(process.execPath, [TSC_REL, '-b', EXT_REL], { cwd: root, encoding: 'utf8' });
        if ((child.status ?? 1) !== 0) {
            const output = `${child.stdout ?? ''}${child.stderr ?? ''}`;
            failures.push(`${EXT_REL} does not compile cleanly:\n${output.split('\n').filter(l => l.trim() !== '').slice(0, 20).join('\n')}`);
        }
    }

    return { failures, skipped };
}

// A step skipped for an absent input makes the run exit 77 with one SKIP line, printed last (SKIP-PROTOCOL.md).
function main() {
    const root = ROOT_ARG ? resolve(ROOT_ARG.slice('--root='.length)) : REPO_ROOT;
    const { failures: pinFailures, skipped: pinSkipped } = runPinChecks(root);
    const { failures: buildFailures, skipped: buildSkipped } = runBuildChecks(root);
    const failures = [...pinFailures, ...buildFailures];
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s)`);
        for (const f of failures) console.error(`  - ${f}`);
    }
    const code = verdictExit(NAME, failures, [...pinSkipped, ...buildSkipped]);
    if (code === 0) console.log(`${NAME}: PASS -- branding fragments, block and compile all green`);
    return code;
}

function copyInto(root, rel) {
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(REPO_ROOT, rel), dest);
}

function selfTest() {
    let failed = 0;
    const complain = (name, why) => {
        console.error(`${NAME}: --self-test FAIL -- '${name}' ${why}`);
        failed += 1;
    };

    // The plants copy both generated fragments from this tree; without them they cannot run (SKIP-PROTOCOL.md rule 4).
    const absent = [FRONTEND_FRAGMENT_REL, BRANDING_FRAGMENT_REL].filter(rel => !existsSync(join(REPO_ROOT, rel)));
    if (absent.length > 0) {
        console.log(skipLine(`${NAME} --self-test`, `${absent.join(' and ')} absent, so the plants did not run. Next step: run ${RERUN_GENERATE}, then re-run this self-test`));
        return SKIP_EXIT;
    }

    // Green control first: the unmutated tree proves nothing if red.
    const control = runPinChecks(REPO_ROOT);
    if (control.failures.length > 0) {
        complain('unmutated control', `is already red, so the plants below would mean nothing: ${control.failures.join(' | ')}`);
    } else {
        console.log(`  ok  unmutated control -> pin checks green`);
    }

    // Plant 1: a drifted tracked block must go red naming the block.
    // Plant 2: a drifted fragment must go red naming the fragment.
    // Plant 3: a tracked block with the branding key removed must go red
    // naming the key -- a removed block is stale output, not a clean tree.
    const plants = [
        { name: 'drifted tracked block', rel: APP_PKG_REL, drift: text => text.replace('"defaultTheme": "dark"', '"defaultTheme": "light"'), expect: 'defaultTheme' },
        { name: 'drifted fragment', rel: BRANDING_FRAGMENT_REL, drift: text => text.replace('"repoUrl": "https://powerbrowser.org"', '"repoUrl": "https://example.org"'), expect: BRANDING_FRAGMENT_REL },
        { name: 'removed branding block', rel: APP_PKG_REL, drift: text => text.replace(/,\s*"powerbrowserBranding": \{[\s\S]*?\n {8}\}/, ''), expect: BRANDING_BLOCK_KEY },
    ];
    for (const plant of plants) {
        const dir = mkdtempSync(join(tmpdir(), 'theia-branding-selftest-'));
        try {
            copyInto(dir, MANIFEST_REL);
            copyInto(dir, FRONTEND_FRAGMENT_REL);
            copyInto(dir, BRANDING_FRAGMENT_REL);
            copyInto(dir, APP_PKG_REL);
            // The mark read and the tsc step both reach back to the real
            // tree by construction (the fragment embeds brand/mark.svg; tsc
            // runs on the real extension) -- runPinChecks on the fixture
            // exercises the pin halves, which is what these plants target.
            const target = join(dir, plant.rel);
            const before = readFileSync(target, 'utf8');
            writeFileSync(target, plant.drift(before), 'utf8');
            if (readFileSync(target, 'utf8') === before) {
                complain(plant.name, 'planted no fault at all: the drift did not land');
                continue;
            }
            const { failures } = runPinChecks(dir);
            if (!failures.some(f => f.includes(plant.expect))) {
                complain(plant.name, `did not go red naming '${plant.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            } else {
                console.log(`  ok  ${plant.name} -> red, naming '${plant.expect}'`);
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    // SKIP control (SKIP-PROTOCOL.md rule 2): the main mode, run as a child with its output captured, over a
    // fixture with the manifest and the application package and neither fragment nor a theia install. The block
    // check runs green, the fragment and tsc steps do not run, so it exits 77 with the SKIP line last and no PASS.
    {
        const dir = mkdtempSync(join(tmpdir(), 'theia-branding-selftest-'));
        try {
            copyInto(dir, MANIFEST_REL);
            copyInto(dir, APP_PKG_REL);
            const r = spawnSync(process.execPath, [SELF, `--root=${dir}`], { encoding: 'utf8' });
            const lines = (r.stdout ?? '').split('\n').filter(l => l.trim() !== '');
            const last = lines[lines.length - 1] ?? '';
            if (r.status !== SKIP_EXIT || !last.startsWith(`${NAME}: SKIP -- `) || !last.includes(BRANDING_FRAGMENT_REL) || !last.includes(TSC_REL)
                || lines.some(l => l.includes(`${NAME}: PASS`)) || /: SKIP/.test(r.stderr ?? '')) {
                complain('control: no fragments, no theia install', `did not exit 77 with one SKIP line last naming the fragment and tsc and no PASS line (status ${r.status}, last line ${JSON.stringify(last)}, stderr ${JSON.stringify((r.stderr ?? '').slice(0, 300))})`);
            } else {
                console.log('  ok  control: no fragments, no theia install -> exit 77, one SKIP line last, no PASS line');
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- 3 planted faults all behaved as pinned, and a tree without the fragments or tsc exits 77`);
    return 0;
}

if (SELF_TEST) {
    process.exit(selfTest());
} else {
    process.exit(main());
}
