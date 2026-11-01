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
 * file, per the browser-window-command precedent. Since 35-REVIEW WR-05,
 * every executeCommand in page-context-menu.ts and chrome-bar-shortcuts.ts
 * (Bookmark Page, the F11 relay) must name an imported *_COMMAND_ID const
 * whose id is contracted here and whose Command block is registered.
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
/** 35-REVIEW WR-05: the Phase 35 sources that run Phase 33 commands by id (Bookmark Page, the F11 relay). */
const PAGE_MENU_REL = 'theia/extensions/chrome-bar/src/browser/page-context-menu.ts';
const SHORTCUTS_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts';
const PHASE35_RELS = Object.freeze([PAGE_MENU_REL, SHORTCUTS_REL]);
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
    // Phase 32 plan 06 (PAGE-09): the Edit items, stock labels from 32-UI-SPEC.md.
    'powerbrowser.chrome-bar.edit-undo',
    'powerbrowser.chrome-bar.edit-cut',
    'powerbrowser.chrome-bar.edit-copy',
    'powerbrowser.chrome-bar.edit-paste',
    // Phase 32 plan 08 (PAGE-10); Phase 33 plan 05 gives them the More Tools labels and the Browser category.
    'powerbrowser.chrome-bar.view-source',
    'powerbrowser.chrome-bar.reader-toggle',
    // Phase 34 plan 01 (TAB-01): the tab menu's single-tab actions, labelless and uncategorised (each needs its tab).
    'powerbrowser.chrome-bar.tab-reload',
    'powerbrowser.chrome-bar.tab-mute',
    'powerbrowser.chrome-bar.tab-duplicate',
    'powerbrowser.chrome-bar.tab-move-start',
    'powerbrowser.chrome-bar.tab-move-end',
    'powerbrowser.chrome-bar.tab-close-others',
    'powerbrowser.chrome-bar.tab-close-left',
    'powerbrowser.chrome-bar.tab-close-right',
    'powerbrowser.chrome-bar.tab-close-duplicates',
    'powerbrowser.chrome-bar.tab-close',
    // Phase 33 plan 02 (BMK-01): the star path's command, label from 33-UI-SPEC.md.
    'powerbrowser.chrome-bar.bookmark-page',
    // Phase 33 plan 03 (BMK-03, BMK-04): reopen and the toolbar toggle, labels from 33-UI-SPEC.md.
    'powerbrowser.chrome-bar.reopen-closed-tab',
    'powerbrowser.chrome-bar.toggle-bookmarks-toolbar',
    // Phase 33 plan 04 (BMK-05): opens the clear-history picker only, label from 33-UI-SPEC.md.
    'powerbrowser.chrome-bar.clear-history',
    // Phase 33 plan 05 (MENU-03, D-12/D-13/D-14): the hamburger rows' commands, each an Actions row too.
    'powerbrowser.chrome-bar.new-window',
    'powerbrowser.chrome-bar.full-screen',
    'powerbrowser.chrome-bar.print',
    'powerbrowser.chrome-bar.save-page',
    'powerbrowser.chrome-bar.find-in-page',
    'powerbrowser.chrome-bar.zoom-in',
    'powerbrowser.chrome-bar.zoom-out',
    'powerbrowser.chrome-bar.zoom-reset',
    'powerbrowser.chrome-bar.devtools',
    'powerbrowser.chrome-bar.settings',
    // Phase 33 plan 05 (PAGE-09): the Edit submenu's Redo and Select All, stock labels.
    'powerbrowser.chrome-bar.edit-redo',
    'powerbrowser.chrome-bar.edit-select-all',
]);

/** The contracted visible labels: four verbatim from 13-UI-SPEC.md, Downloads from 32-UI-SPEC.md (plan 04), and the Edit items (plan 06). */
const EXPECTED_LABELS = Object.freeze(['Back', 'Forward', 'Reload', 'New Tab', 'Downloads', 'Undo', 'Cut', 'Copy', 'Paste', 'Bookmark This Page', 'Reopen Closed Tab', 'Show Bookmarks Toolbar', 'Clear Recent History…',
    // Phase 33 plan 05 (MENU-03): 33-UI-SPEC's hamburger and More Tools rows, Firefox's casing; the zoom reset reads "Reset Zoom" out of its submenu.
    'Page Source', 'Reader View', 'New Window', 'Full Screen', 'Print…', 'Save Page As…', 'Find in Page…', 'Zoom In', 'Zoom Out', 'Reset Zoom',
    'Page Developer Tools', 'Settings', 'Redo', 'Select All']);

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

    // 35-REVIEW WR-05: every executeCommand in the Phase 35 sources names a *_COMMAND_ID const imported from
    // chrome-bar-commands.ts, whose value is a contracted id and whose Command block is registered there. A
    // rename or an unregistered id would otherwise leave Bookmark Page and F11 dead with every other check green.
    for (const rel of PHASE35_RELS) {
        const src = sources[rel] ?? '';
        const imported = new Set((/import \{([^}]*)\} from '\.\/chrome-bar-commands';/.exec(src)?.[1] ?? '').split(',').map(name => name.trim()).filter(Boolean));
        const calls = [...src.matchAll(/executeCommand\(\s*([^),\s]+)/g)].map(m => m[1]);
        if (calls.length === 0) {
            failures.push(`${rel}: derived ZERO executeCommand calls -- the Phase 35 command-id rule proves nothing`);
        }
        for (const arg of calls) {
            if (/^['"`]/.test(arg)) {
                failures.push(`${rel}: executeCommand(${arg}) re-spells a command id instead of importing the exported const`);
                continue;
            }
            if (!imported.has(arg)) {
                failures.push(`${rel}: executeCommand(${arg}) does not name a const imported from chrome-bar-commands`);
                continue;
            }
            const id = new RegExp(`export const ${arg}\\s*=\\s*'([^']+)'`).exec(commandsSrc)?.[1];
            const block = new RegExp(`export const (CHROME_BAR_\\w+):\\s*Command\\s*=\\s*\\{\\s*id:\\s*${arg}\\b`).exec(commandsSrc)?.[1];
            if (!id || !EXPECTED_IDS.includes(id) || !block || !commandsSrc.includes(`registerCommand(${block},`)) {
                failures.push(`${rel}: executeCommand(${arg}) names no registered contracted command (id ${id ?? 'undeclared'}, Command ${block ?? 'none'})`);
            }
        }
    }

    return failures;
}

function readSources() {
    const out = {};
    for (const rel of [COMMANDS_REL, WIDGET_REL, KEYBINDINGS_REL, ...PHASE35_RELS, ...addressBarSourceRels()]) {
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
        {
            name: 'planted full-screen id removal (Phase 35 runs it by this id)',
            mutate: src => src.replace("export const CHROME_BAR_FULL_SCREEN_COMMAND_ID = 'powerbrowser.chrome-bar.full-screen';", '// planted removal'),
            expect: 'powerbrowser.chrome-bar.full-screen',
        },
        {
            name: 'planted surplus menu command',
            mutate: src => src.replace("export const CHROME_BAR_SETTINGS_COMMAND_ID = 'powerbrowser.chrome-bar.settings';",
                "export const CHROME_BAR_SETTINGS_COMMAND_ID = 'powerbrowser.chrome-bar.settings';\nexport const CHROME_BAR_PLANTED_COMMAND_ID = 'powerbrowser.chrome-bar.planted';"),
            expect: 'powerbrowser.chrome-bar.planted',
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

    // Phase 33 plan 02: the pill re-spelling the bookmark-page id instead of importing the const goes red naming it.
    const pillRel = `${ADDRESS_BAR_DIR_REL}/address-bar.tsx`;
    const pillFailures = checkCommands({ ...clean, [pillRel]: `${clean[pillRel] ?? ''}\nvoid this.commands.executeCommand('powerbrowser.chrome-bar.bookmark-page');\n` });
    if (!pillFailures.some(f => f.includes(pillRel) && f.includes('powerbrowser.chrome-bar.bookmark-page'))) {
        console.error(`${NAME} --self-test: FAIL -- 'planted re-spelled bookmark-page id in ${pillRel}' did not go red naming it; got: ${pillFailures.join(' | ') || '(no failures at all)'}`);
        failed++;
    } else {
        console.log(`  ok  planted re-spelled bookmark-page id in ${pillRel} -> red, naming 'powerbrowser.chrome-bar.bookmark-page'`);
    }

    // 35-REVIEW WR-05: the Phase 35 command-id rule, one plant per way it breaks.
    const phase35Plants = [
        {
            name: 'Bookmark Page registration renamed away (the page menu row would be dead)',
            sources: { ...clean, [COMMANDS_REL]: cleanCommands.replace('registerCommand(CHROME_BAR_BOOKMARK_PAGE, {', 'registerCommand(CHROME_BAR_BOOKMARK_PAGE_PLANTED, {') },
            expect: `${PAGE_MENU_REL}: executeCommand(CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID) names no registered contracted command`,
        },
        {
            name: 'F11 relay re-spells the full-screen id',
            sources: { ...clean, [SHORTCUTS_REL]: clean[SHORTCUTS_REL].replace('executeCommand(CHROME_BAR_FULL_SCREEN_COMMAND_ID)', "executeCommand('powerbrowser.chrome-bar.full-screen')") },
            expect: `${SHORTCUTS_REL}: executeCommand('powerbrowser.chrome-bar.full-screen') re-spells a command id`,
        },
        {
            name: 'F11 relay runs a const not imported from chrome-bar-commands',
            sources: { ...clean, [SHORTCUTS_REL]: clean[SHORTCUTS_REL].replace('executeCommand(CHROME_BAR_FULL_SCREEN_COMMAND_ID)', 'executeCommand(PLANTED_FULL_SCREEN_ID)') },
            expect: `${SHORTCUTS_REL}: executeCommand(PLANTED_FULL_SCREEN_ID) does not name a const imported from chrome-bar-commands`,
        },
    ];
    for (const plant of phase35Plants) {
        if (Object.keys(plant.sources).every(rel => plant.sources[rel] === clean[rel])) {
            console.error(`${NAME} --self-test: FAIL -- '${plant.name}' did not modify any source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkCommands(plant.sources);
        if (!failures.some(f => f.includes(plant.expect))) {
            console.error(`${NAME} --self-test: FAIL -- '${plant.name}' did not go red naming '${plant.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed++;
        } else {
            console.log(`  ok  ${plant.name} -> red, naming '${plant.expect}'`);
        }
    }

    if (failed) {
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- ${cases.length + 2 + phase35Plants.length} planted faults all went red`);
    return 0;
}

process.exit(main());
