#!/usr/bin/env node
/**
 * GUI-09's dependent-window content gate (14-03): a dependent hosts exactly
 * one tab view with no IDE frame, per the 14-PROBE GREEN verdict.
 *
 * Two halves. The STATIC half runs here and is honestly --quick: it derives
 * the built secondary-asset presence (the prebuilt secondary-window.html
 * carries the bare dock host), the extractable membership set from
 * `dependent-windows.ts` (NON_EXTRACTABLE_WIDGET_IDS), and the contracted
 * closed-state strings verbatim, comparing each as SET EQUALITY against the
 * one EXPECTED const block below. It also asserts the stock move call, the
 * loaded-never-opened timing (no onWindowOpened adjustment), and that no
 * modes source ever widens extractability. A surplus pin is unreviewed
 * surface, a missing pin reopens a second IDE frame, a reworded string
 * breaks the UI-SPEC copy contract -- each reported by name. An empty
 * derivation fails as a broken instrument, never passes as clean.
 *
 * The LIVE half (extraction, geometry, close-matrix observation through
 * the probe harness) is not judged by the default mode, which judges the
 * whole static half and claims nothing more. It is evaluated only under
 * --live, where it cites the standing probe record's verdict line rather
 * than re-running a browser; that mode is its own registry row
 * (gui09-dependent-window-content-live). The default mode prints a note
 * naming that row, not a SKIP line: no clause of the default row is left
 * unrun (SKIP-PROTOCOL.md). No build, no browser, no display, no network
 * either way.
 *
 * Usage:
 *   node scripts/verify-dependent-window-content.mjs
 *   node scripts/verify-dependent-window-content.mjs --self-test
 *   node scripts/verify-dependent-window-content.mjs --live
 */

import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-dependent-window-content';

const DEPENDENTS_REL = 'theia/extensions/modes/src/browser/dependent-windows.ts';
const SETUPS_REL = 'theia/extensions/modes/src/browser/setups-service.ts';
const MODES_SOURCE_RELS = [
    'theia/extensions/modes/src/browser/dependent-windows.ts',
    'theia/extensions/modes/src/browser/setups-service.ts',
    'theia/extensions/modes/src/browser/setups-commands.ts',
    'theia/extensions/modes/src/browser/mode-service.ts',
    'theia/extensions/modes/src/browser/modes-commands.ts',
    'theia/extensions/modes/src/browser/mode-descriptors.ts',
    'theia/extensions/modes/src/browser/modes-frontend-module.ts',
];
const SECONDARY_ASSET_REL = 'theia/applications/browser/lib/frontend/secondary-window.html';
const PROBE_RECORD_REL = '.planning/milestones/v1.3-phases/14-modes-windows-setups/14-PROBE-DEPENDENT-WINDOWS.md';
const PROBE_PHASE_DIR = '14-modes-windows-setups';
const PROBE_FILE = '14-PROBE-DEPENDENT-WINDOWS.md';

/**
 * Milestone archival moves phase dirs to
 * `.planning/milestones/<v>-phases/`, which must not silently break the
 * live half's citation. The live tree wins; otherwise the single
 * archived copy wins; zero or several is a failure naming the search.
 */
function resolveRecord(root, liveRel, phaseDir, fileName) {
    const live = join(root, liveRel);
    if (existsSync(live)) {
        return live;
    }
    let archived = [];
    try {
        archived = readdirSync(join(root, '.planning/milestones'), { withFileTypes: true })
            .filter(entry => entry.isDirectory() && /-phases$/.test(entry.name))
            .map(entry => join(root, '.planning/milestones', entry.name, phaseDir, fileName))
            .filter(existsSync);
    } catch {
        archived = [];
    }
    if (archived.length === 1) {
        return archived[0];
    }
    if (archived.length === 0) {
        throw new Error(`${PROBE_RECORD_REL} unreadable and none archived under .planning/milestones/*-phases/${phaseDir}/${fileName} -- the live half cites the standing probe record, which is absent`);
    }
    throw new Error(`${PROBE_RECORD_REL} missing and ${archived.length} archived copies -- exactly one must exist, an ambiguous record proves nothing`);
}

/**
 * The declared dependent contract. The ONE hand-kept block in this file:
 * editing it is how a deliberate contract change is made -- it shows up
 * in the diff for review. Everything it is compared against is derived at
 * check time.
 */
const EXPECTED_NON_EXTRACTABLE = Object.freeze([
    'powerbrowser.chrome-bar',
]);

/** Contracted closed-state strings (14-UI-SPEC.md, verbatim). */
const EXPECTED_CLOSED_STRINGS = Object.freeze([
    'This tab is closed',
    'The tab shown in this window was closed. Close this window to return to PowerBrowser.',
    'Close Window',
]);

function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return {
        surplus: [...a].filter(x => !e.has(x)),
        missing: [...e].filter(x => !a.has(x)),
    };
}

/** String values of the NON_EXTRACTABLE_WIDGET_IDS array, in source order. */
function derivedNonExtractableOf(source) {
    const anchor = /NON_EXTRACTABLE_WIDGET_IDS[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/.exec(source);
    if (!anchor) {
        return [];
    }
    return [...anchor[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

/**
 * @returns {string[]} failure messages for the static half -- empty means it holds.
 * `options.assetRel` overrides the secondary-asset path (the self-test's
 * missing-asset plant); `options.skipLive` keeps the live half reserved.
 */
function checkContent(sources, options = {}) {
    const failures = [];
    const dependentsSrc = sources[DEPENDENTS_REL] ?? '';
    const assetRel = options.assetRel ?? SECONDARY_ASSET_REL;

    const pins = derivedNonExtractableOf(dependentsSrc);
    if (pins.length === 0) {
        failures.push(`${DEPENDENTS_REL}: derived ZERO non-extractable pins -- the NON_EXTRACTABLE_WIDGET_IDS anchor drifted, so this comparison proves nothing`);
    } else {
        const pinDiff = diff(pins, [...EXPECTED_NON_EXTRACTABLE]);
        if (pinDiff.surplus.length) {
            failures.push(`${DEPENDENTS_REL}: membership pins NOT in the declared set (unreviewed surface): ${pinDiff.surplus.join(', ')}`);
        }
        if (pinDiff.missing.length) {
            failures.push(`${DEPENDENTS_REL}: declared membership pins are GONE (a second IDE frame is reachable again): ${pinDiff.missing.join(', ')}`);
        }
    }

    // Never widen: no modes source may mark a widget extractable.
    for (const rel of MODES_SOURCE_RELS) {
        const src = sources[rel] ?? '';
        if (/\.isExtractable\s*=\s*true/.test(src)) {
            failures.push(`${rel}: marks a widget extractable -- dependents narrow membership only, never widen it`);
        }
    }

    for (const expected of EXPECTED_CLOSED_STRINGS) {
        if (!dependentsSrc.includes(expected)) {
            failures.push(`${DEPENDENTS_REL}: contracted closed-state string missing: '${expected}' -- the tab-closed-elsewhere copy broke`);
        }
    }

    if (!dependentsSrc.includes('moveWidgetToSecondaryWindow')) {
        failures.push(`${DEPENDENTS_REL}: no moveWidgetToSecondaryWindow call -- dependents do not drive the stock secondary-window path`);
    }
    if (!dependentsSrc.includes('onWindowLoaded')) {
        failures.push(`${DEPENDENTS_REL}: no onWindowLoaded subscription -- dependent adjustments must land on loaded, never on opened`);
    }
    if (dependentsSrc.includes('onWindowOpened')) {
        failures.push(`${DEPENDENTS_REL}: adjusts on onWindowOpened -- the document is still blank at opened, adjustments land on loaded`);
    }
    if (!dependentsSrc.includes('setups.json')) {
        failures.push(`${DEPENDENTS_REL}: no setups.json snapshot contract -- dependent rects and hosted tab URIs are not recorded for verbatim restore`);
    }
    // The snapshot half of that contract lives in the setups service, not
    // in a doc comment: rect + tab-URI capture must exist where restore
    // reads it, so deleting the snapshot code trips this assertion.
    const setupsSrc = sources[SETUPS_REL] ?? '';
    for (const pin of ['snapshotWindows', 'activeTab']) {
        if (!setupsSrc.includes(pin)) {
            failures.push(`${SETUPS_REL}: no '${pin}' snapshot capture -- dependent rects and hosted tab URIs are not recorded for verbatim restore`);
        }
    }

    // Built secondary asset: the bare dock host the stock path loads.
    const assetPath = join(REPO_ROOT, assetRel);
    if (!existsSync(assetPath)) {
        failures.push(`${assetRel}: missing -- the built secondary-window asset the stock path loads is absent`);
    } else {
        let asset = '';
        try {
            asset = readFileSync(assetPath, 'utf8');
        } catch {
            asset = '';
        }
        if (!asset.includes('widget-host')) {
            failures.push(`${assetRel}: no widget-host dock -- the secondary frame is not the bare single-widget host the contract needs`);
        }
        for (const frame of ['chrome-bar', 'status-bar', 'tab-strip']) {
            if (asset.includes(frame)) {
                failures.push(`${assetRel}: names '${frame}' -- the secondary frame must carry no IDE chrome`);
            }
        }
    }

    return failures;
}

/** The live half: the --live mode (row gui09-dependent-window-content-live); cites the standing probe record. */
function checkLive() {
    let record = '';
    try {
        record = readFileSync(resolveRecord(REPO_ROOT, PROBE_RECORD_REL, PROBE_PHASE_DIR, PROBE_FILE), 'utf8');
    } catch (error) {
        return [error.message];
    }
    if (!/^Verdict: GREEN/m.test(record)) {
        return [`${PROBE_RECORD_REL}: no one-line GREEN verdict -- the live extraction/geometry/close-matrix evidence is not on record`];
    }
    return [];
}

function readSources() {
    const out = {};
    for (const rel of new Set([DEPENDENTS_REL, ...MODES_SOURCE_RELS])) {
        try {
            out[rel] = readFileSync(join(REPO_ROOT, rel), 'utf8');
        } catch {
            out[rel] = '';
        }
    }
    return out;
}

function main() {
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const failures = checkContent(readSources());
    if (process.argv.includes('--live')) {
        failures.push(...checkLive());
    } else {
        // A note, not a SKIP line: this row judges the static half only and its PASS line claims nothing more.
        console.log(`${NAME}: note -- the live half (extraction, geometry, close-matrix observation) is not judged by this row; the --live mode cites the standing probe record, as the gui09-dependent-window-content-live row`);
    }
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the dependent-window surface drifted from the declared contract.`);
        console.error(`If the change is deliberate, edit the EXPECTED consts in this script in the SAME commit so the contract change is visible in the diff.`);
        failures.forEach(f => console.error(`  - ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- secondary asset, membership pins, closed-state copy, and stock-path timing match the declared contract`);
    return 0;
}

function selfTest() {
    const clean = readSources();
    const baseline = checkContent(clean);
    if (baseline.length !== 0) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }

    const cleanDependents = clean[DEPENDENTS_REL];
    const cases = [
        {
            name: 'planted widened membership set',
            mutate: sources => ({ ...sources, [DEPENDENTS_REL]: cleanDependents.replace(
                "    'powerbrowser.chrome-bar',\n",
                "    'powerbrowser.chrome-bar',\n    'powerbrowser.extra-frame',\n"
            ) }),
            expect: 'powerbrowser.extra-frame',
        },
        {
            name: 'planted removed closed-state string',
            mutate: sources => ({ ...sources, [DEPENDENTS_REL]: cleanDependents.replace(
                "= 'This tab is closed';",
                "= 'This tab is gone';"
            ) }),
            expect: 'This tab is closed',
        },
        {
            name: 'planted missing asset',
            mutate: sources => sources,
            expect: 'secondary-window-missing.html',
            assetRel: 'theia/applications/browser/lib/frontend/secondary-window-missing.html',
        },
    ];

    let failed = 0;
    for (const testCase of cases) {
        const mutated = testCase.mutate(clean);
        // A planted fault that does not change the source at all would make
        // the case vacuous -- assert the mutation actually landed (the
        // missing-asset plant lands through its asset-path override).
        if (!testCase.assetRel && JSON.stringify(mutated) === JSON.stringify(clean)) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not modify the source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkContent(mutated, { assetRel: testCase.assetRel });
        // A plant that lands on its option rather than the source still
        // needs its land assertion: the override path must not exist.
        if (testCase.assetRel && existsSync(join(REPO_ROOT, testCase.assetRel))) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' override path unexpectedly exists; the plant is vacuous`);
            failed++;
            continue;
        }
        if (!failures.some(f => f.includes(testCase.expect))) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not go red naming '${testCase.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed++;
        } else {
            console.log(`  ok  ${testCase.name} -> red, naming '${testCase.expect}'`);
        }
    }

    // Resolution proof: milestone archival moves the probe record, and
    // the live half's citation must follow it without touching the
    // archive. Exercised against mkdtemp fixture roots, never the tree.
    const resolutionStages = [];
    try {
        const liveOnly = mkdtempSync(join(tmpdir(), `${NAME}-resolve-`));
        resolutionStages.push(liveOnly);
        writeFileSync(join(liveOnly, 'live.md'), 'x');
        const archiveOnly = mkdtempSync(join(tmpdir(), `${NAME}-resolve-`));
        resolutionStages.push(archiveOnly);
        const archiveDir = join(archiveOnly, '.planning/milestones/v9.9-phases', PROBE_PHASE_DIR);
        mkdirSync(archiveDir, { recursive: true });
        writeFileSync(join(archiveDir, PROBE_FILE), 'x');
        const neither = mkdtempSync(join(tmpdir(), `${NAME}-resolve-`));
        resolutionStages.push(neither);
        const resolutionCases = [
            { name: 'resolution live-only', root: liveOnly, liveRel: 'live.md', want: 'live' },
            { name: 'resolution archive-only', root: archiveOnly, liveRel: 'absent.md', want: 'v9.9-phases' },
            { name: 'resolution neither', root: neither, liveRel: 'absent.md', wantError: 'absent' },
        ];
        for (const resolutionCase of resolutionCases) {
            let resolved = null;
            let resolutionError = '';
            try {
                resolved = resolveRecord(resolutionCase.root, resolutionCase.liveRel, PROBE_PHASE_DIR, PROBE_FILE);
            } catch (error) {
                resolutionError = error.message;
            }
            const ok = resolutionCase.wantError
                ? resolutionError.includes(resolutionCase.wantError)
                : resolved !== null && resolved.includes(resolutionCase.want);
            if (!ok) {
                console.error(`${NAME} --self-test: FAIL -- '${resolutionCase.name}' resolved to '${resolved ?? resolutionError}'; want '${resolutionCase.want ?? resolutionCase.wantError}'`);
                failed++;
            } else {
                console.log(`  ok  ${resolutionCase.name} -> '${resolutionCase.want ?? resolutionCase.wantError}'`);
            }
        }
    } finally {
        for (const stage of resolutionStages) {
            rmSync(stage, { recursive: true, force: true });
        }
    }

    if (failed) {
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- all planted faults went red`);
    return 0;
}

process.exit(main());
