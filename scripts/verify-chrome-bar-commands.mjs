#!/usr/bin/env node
/**
 * GUI-06's command-registry gate (13-03): the chrome bar's five commands
 * are registered with their contracted ids and labels.
 *
 * The registered command ids are DERIVED from
 * `chrome-bar-commands.ts` at check time (the `*_COMMAND_ID` const
 * assignments) and compared to the one EXPECTED const below as SET
 * EQUALITY: a surplus id is an unreviewed bar command, a missing id is a
 * dead palette entry or button -- both reported by name. An empty
 * derivation (no const found) fails as a broken instrument, never passes
 * as clean. The four visible labels are asserted verbatim plus the
 * labelless focus-only command (keybinding-reachable without invented
 * copy), and a duplicated id string fails naming the duplicate. Every
 * labelled Command block carries `category: CHROME_BAR_COMMAND_CATEGORY`
 * (D-11, 30-03) and the focus-only one carries no category. Call
 * sites (the widget, the keybindings) must import the exported id consts
 * rather than retype the strings -- a re-spelled literal fails naming the
 * file, per the browser-window-command precedent.
 *
 * Honestly --quick: reads text sources only. No build, no browser, no
 * display, no network.
 *
 * Usage:
 *   node scripts/verify-chrome-bar-commands.mjs
 *   node scripts/verify-chrome-bar-commands.mjs --self-test
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-chrome-bar-commands';

const COMMANDS_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts';
const WIDGET_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx';
const KEYBINDINGS_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts';
/** The pill's sources (30-01 D-04 move): each is held to the no-re-spelled-id rule. */
const ADDRESS_BAR_DIR_REL = 'theia/extensions/chrome-bar/src/browser/address-bar';

/** Every .ts/.tsx under address-bar/, recursively; none when the directory is absent. */
function addressBarSourceRels() {
    try {
        return readdirSync(join(REPO_ROOT, ADDRESS_BAR_DIR_REL), { recursive: true })
            .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
            .map(f => `${ADDRESS_BAR_DIR_REL}/${f.split(sep).join('/')}`)
            .sort();
    } catch {
        return [];
    }
}

/**
 * The declared command contract. The ONE hand-kept list in this file:
 * editing it is how a deliberate contract change is made -- it shows up
 * in the diff for review. Everything it is compared against is derived at
 * check time.
 */
const EXPECTED_IDS = Object.freeze([
    'powerbrowser.chrome-bar.back',
    'powerbrowser.chrome-bar.forward',
    'powerbrowser.chrome-bar.reload',
    'powerbrowser.chrome-bar.new-tab',
    'powerbrowser.chrome-bar.downloads',
    'powerbrowser.chrome-bar.focus-address',
]);

/** The contracted visible labels: four verbatim from 13-UI-SPEC.md, and Downloads from 32-UI-SPEC.md (Phase 32 plan 04). */
const EXPECTED_LABELS = Object.freeze(['Back', 'Forward', 'Reload', 'New Tab', 'Downloads']);

function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return {
        surplus: [...a].filter(x => !e.has(x)),
        missing: [...e].filter(x => !a.has(x)),
    };
}

/** Every `*_COMMAND_ID = '...'` assignment value, in source order. */
function derivedIdsOf(source) {
    const ids = [];
    for (const match of source.matchAll(/_COMMAND_ID\s*=\s*'([^']+)'/g)) {
        ids.push(match[1]);
    }
    return ids;
}

/** Every `label: '...'` value, in source order. */
function derivedLabelsOf(source) {
    const labels = [];
    for (const match of source.matchAll(/label:\s*'([^']+)'/g)) {
        labels.push(match[1]);
    }
    return labels;
}

/** @returns {string[]} failure messages -- empty means the gate holds. */
function checkCommands(sources) {
    const failures = [];
    const commandsSrc = sources[COMMANDS_REL] ?? '';

    const ids = derivedIdsOf(commandsSrc);
    if (ids.length === 0) {
        failures.push(`${COMMANDS_REL}: derived ZERO command ids -- no *_COMMAND_ID assignment found, so this comparison proves nothing`);
        return failures;
    }
    const { surplus, missing } = diff(ids, EXPECTED_IDS);
    if (surplus.length) {
        failures.push(`${COMMANDS_REL}: command ids NOT in the declared contract (surplus bar command nobody reviewed): ${surplus.join(', ')}`);
    }
    if (missing.length) {
        failures.push(`${COMMANDS_REL}: declared contract command ids are GONE (dead palette entry or button): ${missing.join(', ')}`);
    }
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length) {
        failures.push(`${COMMANDS_REL}: duplicated command id (two consts register one command): ${[...new Set(duplicates)].join(', ')}`);
    }

    const labels = derivedLabelsOf(commandsSrc);
    const labelDiff = diff(labels, EXPECTED_LABELS);
    if (labelDiff.surplus.length) {
        failures.push(`${COMMANDS_REL}: labels NOT in the contracted copy (reworded or invented): ${labelDiff.surplus.join(', ')}`);
    }
    if (labelDiff.missing.length) {
        failures.push(`${COMMANDS_REL}: contracted labels are GONE or reworded: ${labelDiff.missing.join(', ')}`);
    }
    // The focus-only command stays labelless: reachable through Ctrl/Cmd+L
    // without inventing palette copy.
    const focusBlock = /CHROME_BAR_FOCUS_ADDRESS:\s*Command\s*=\s*\{([^}]*)\}/.exec(commandsSrc);
    if (!focusBlock) {
        failures.push(`${COMMANDS_REL}: derived ZERO focus-command blocks -- CHROME_BAR_FOCUS_ADDRESS was not found, so the labelless assertion proves nothing`);
    } else if (/label:/.test(focusBlock[1])) {
        failures.push(`${COMMANDS_REL}: the focus-only command carries a label -- it must stay labelless (keybinding-reachable, never the palette)`);
    }

    // D-11 (30-03): every labelled command carries the Browser category
    // const, so the palette and the address bar's Actions mode list it; the
    // focus-only command carries neither label nor category. Derived from
    // every exported Command block, so an added command is held to it too.
    if (!/export const CHROME_BAR_COMMAND_CATEGORY\s*=\s*'Browser';/.test(commandsSrc)) {
        failures.push(`${COMMANDS_REL}: CHROME_BAR_COMMAND_CATEGORY = 'Browser' is gone -- the palette category and the Actions mode have no shared const`);
    }
    const blocks = [...commandsSrc.matchAll(/export const (CHROME_BAR_\w+):\s*Command\s*=\s*\{([^}]*)\}/g)];
    if (blocks.length === 0) {
        failures.push(`${COMMANDS_REL}: derived ZERO Command blocks, so the category assertion proves nothing`);
    }
    for (const [, name, body] of blocks) {
        const categorised = /category:\s*CHROME_BAR_COMMAND_CATEGORY\b/.test(body);
        if (/label:/.test(body) && !categorised) {
            failures.push(`${COMMANDS_REL}: ${name} has a label but no category: CHROME_BAR_COMMAND_CATEGORY -- it would be missing from the Browser category and the Actions mode`);
        }
        if (!/label:/.test(body) && /category:/.test(body)) {
            failures.push(`${COMMANDS_REL}: ${name} is labelless but carries a category -- the focus-only command must carry neither`);
        }
    }

    // Call-site discipline: import the exported consts, never re-spell the
    // id strings (a copy drifts silently from the registration). The
    // assertion names each declared id literally: neighbouring identifiers
    // in the same dotted namespace (the status-bar element id, the widget
    // id) are different registrations and must not trip this check.
    // The widget and keybindings always execute chrome-bar commands, so they
    // must reference a const; an address-bar source need not (it may execute
    // none), but none of them may re-spell an id.
    const addressBarRels = Object.keys(sources).filter(rel => rel.startsWith(`${ADDRESS_BAR_DIR_REL}/`));
    for (const rel of [WIDGET_REL, KEYBINDINGS_REL, ...addressBarRels]) {
        const src = sources[rel] ?? '';
        if ((rel === WIDGET_REL || rel === KEYBINDINGS_REL) && !src.includes('CHROME_BAR_')) {
            failures.push(`${rel}: does not reference any CHROME_BAR_* id const -- the call site forked off the shared command ids`);
        }
        for (const id of EXPECTED_IDS) {
            if (src.includes(`'${id}'`)) {
                failures.push(`${rel}: re-spells the command id '${id}' instead of importing the exported const -- the copy drifts silently`);
            }
        }
    }

    return failures;
}

function readSources() {
    const out = {};
    for (const rel of [COMMANDS_REL, WIDGET_REL, KEYBINDINGS_REL, ...addressBarSourceRels()]) {
        out[rel] = readFileSync(join(REPO_ROOT, rel), 'utf8');
    }
    return out;
}

function main() {
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const sources = readSources();
    const failures = checkCommands(sources);
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the chrome-bar command registry drifted from the declared contract.`);
        console.error(`If the change is deliberate, edit EXPECTED_IDS/EXPECTED_LABELS in this script in the SAME commit so the contract change is visible in the diff.`);
        failures.forEach(f => console.error(`  - ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${EXPECTED_IDS.length} command ids and ${EXPECTED_LABELS.length} contracted labels match the declared contract, call sites import the consts (${Object.keys(sources).length - 1} call-site source(s) read)`);
    return 0;
}

function selfTest() {
    const clean = readSources();
    const baseline = checkCommands(clean);
    if (baseline.length !== 0) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }

    const cleanCommands = clean[COMMANDS_REL];
    const cases = [
        {
            name: 'planted id removal',
            mutate: src => src.replace(
                "export const CHROME_BAR_RELOAD_COMMAND_ID = 'powerbrowser.chrome-bar.reload';",
                '// planted removal: reload id const deleted'
            ),
            expect: 'powerbrowser.chrome-bar.reload',
        },
        {
            name: 'planted label drift',
            mutate: src => src.replace("label: 'Back'", "label: 'Go Back'"),
            expect: 'Back',
        },
        {
            name: 'planted category dropped',
            mutate: src => src.replace(/(id: CHROME_BAR_RELOAD_COMMAND_ID,\n)\s*category: CHROME_BAR_COMMAND_CATEGORY,\n/, '$1'),
            expect: 'CHROME_BAR_RELOAD has a label but no category',
        },
        {
            name: 'planted category on the focus command',
            mutate: src => src.replace('    id: CHROME_BAR_FOCUS_ADDRESS_COMMAND_ID,\n', '    id: CHROME_BAR_FOCUS_ADDRESS_COMMAND_ID,\n    category: CHROME_BAR_COMMAND_CATEGORY,\n'),
            expect: 'CHROME_BAR_FOCUS_ADDRESS is labelless but carries a category',
        },
        {
            name: 'planted duplicate id',
            mutate: src => src.replace(
                "'powerbrowser.chrome-bar.forward'",
                "'powerbrowser.chrome-bar.back'"
            ),
            expect: 'powerbrowser.chrome-bar.back',
        },
    ];

    let failed = 0;
    for (const testCase of cases) {
        const mutated = { ...clean, [COMMANDS_REL]: testCase.mutate(cleanCommands) };
        // A planted fault that does not change the source at all would make
        // the case vacuous -- assert the mutation actually landed.
        if (mutated[COMMANDS_REL] === cleanCommands) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not modify the source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkCommands(mutated);
        if (!failures.some(f => f.includes(testCase.expect))) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not go red naming '${testCase.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed++;
        } else {
            console.log(`  ok  ${testCase.name} -> red, naming '${testCase.expect}'`);
        }
    }

    // Nested-file plant (30-01): an address-bar source re-spelling an id goes red naming it.
    const nestedRel = `${ADDRESS_BAR_DIR_REL}/nested/planted.tsx`;
    const nestedFailures = checkCommands({ ...clean, [nestedRel]: "void this.commands.executeCommand('powerbrowser.chrome-bar.new-tab');\n" });
    if (!nestedFailures.some(f => f.includes(nestedRel) && f.includes('powerbrowser.chrome-bar.new-tab'))) {
        console.error(`${NAME} --self-test: FAIL -- 'planted re-spelled id in ${nestedRel}' did not go red naming the file; got: ${nestedFailures.join(' | ') || '(no failures at all)'}`);
        failed++;
    } else {
        console.log(`  ok  planted re-spelled id in ${nestedRel} -> red, naming 'powerbrowser.chrome-bar.new-tab'`);
    }

    if (failed) {
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- ${cases.length + 1} planted faults all went red`);
    return 0;
}

process.exit(main());
