#!/usr/bin/env node
/**
 * Phase 32 plan 06 (PAGE-09): the edit family's contract, derived from the tree
 * and compared as set equality, so an extra command literal, a missing one, and
 * a send from anywhere but the widget handler each go red by name.
 *
 *   1. frozen set: the WEB_TAB_EDIT_CMDS literals in the shell == the cmd literals
 *      of the WebTabMessage webTabEdit member. Edit the set in one place only.
 *   2. routing: "webTabEdit" is in WEB_TAB_ACTION_KINDS, has one case arm in
 *      handleWebTabAction, and that arm refuses a cmd outside the frozen set.
 *   3. call sites: a request carrying kind 'webTabEdit' appears in the Theia
 *      sources exactly once, inside WebTabWidget.edit. Any other send site is a
 *      bare-command path that could send the kind without a widget handler.
 *   4. the Edit items: every edit('cmd_…') call in the Theia sources names a
 *      frozen command, and at least one item exists (the positive control for 3).
 *      The page menu's edit rows are Edit items too; since 35-REVIEW CR-02 chrome
 *      runs them on the right-clicked frame, so every PAGE_MENU_EDIT_CMDS value in
 *      PowerBrowserAPI.sys.mjs must also name a frozen command.
 *   5. (33-05, PAGE-09) the Edit menu: the hamburger's Edit submenu (the widget's
 *      appSubmenu `case 'edit'`) has one commandLeaf per Edit command, compared as
 *      set equality with the commands chrome-bar-commands.ts registers whose
 *      execute is edit('cmd_…'): a row with no command and a command with no row
 *      each go red by cmd.
 *   6. (PAGE-09) greying: each Edit row's enabled argument is the page's live reply
 *      for its own cmd (live('cmd_…') over readEditState, which reads edit(cmd, true)),
 *      never the command's own predicate.
 *   7. (PAGE-09) the live query: the webTabEdit arm's checkOnly reply comes from
 *      webTabEditEnabled, which sendQuery()s EDIT_STATE_QUERY to the EDIT_STATE_ACTOR_NAME
 *      actor; registerGroupActor registers that actor with the group child module;
 *      the child (GroupActorChild.sys.mjs) answers exactly that message name.
 *
 * --self-test plants a surplus literal, a dropped literal, a send site outside
 * the widget, an Edit item naming an unfrozen command, a page menu row naming
 * one, an Edit row dropped, a row greyed by the command predicate, a checkOnly
 * reply from the cache, and a child message-name drift, and requires each to go
 * red naming the drift. Text reads only: --quick, no build, no browser, no display.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-page-tools-edit';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const CHILD = 'powerbrowser/shell/GroupActorChild.sys.mjs';
const WIDGET = 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx';
const COMMANDS = 'theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts';
const WEB_TAB = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const SRC_ROOT = join(REPO_ROOT, 'theia/extensions');
const KIND = 'webTabEdit';
const SEND = /request\(\{\s*kind:\s*'webTabEdit'/g;

function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** Set difference reported by name, so a failure says WHICH literal drifted. */
function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return {
        surplus: [...a].filter(name => !e.has(name)),
        missing: [...e].filter(name => !a.has(name)),
    };
}

/** The literals of `const NAME = Object.freeze([ … ]);`, or null when the declaration is absent. */
function frozenArray(text, name) {
    const start = text.indexOf(`const ${name} = Object.freeze([`);
    if (start === -1) {
        return null;
    }
    const end = text.indexOf(']);', start);
    return [...text.slice(start, end).matchAll(/"(cmd_[A-Za-z]+)"/g)].map(m => m[1]);
}

/** The cmd literals of the webTabEdit member of the WebTabMessage union. */
function unionCmds(text) {
    const member = /\{\s*kind:\s*'webTabEdit';([^}]*)\}/.exec(text);
    return member ? [...member[1].matchAll(/'(cmd_[A-Za-z]+)'/g)].map(m => m[1]) : null;
}

/** The body of `handleWebTabAction`, up to its column-0 closing brace. */
function handlerBody(api) {
    const start = api.indexOf('async function handleWebTabAction(');
    if (start === -1) {
        return '';
    }
    const end = api.indexOf('\n}', start);
    return end === -1 ? api.slice(start) : api.slice(start, end);
}

/** Every .ts and .tsx source under the Theia extensions, keyed by repo-relative path. */
function readTheiaSources() {
    const out = {};
    const walk = dir => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && entry.name !== 'lib') {
                    walk(full);
                }
            } else if (/\.tsx?$/.test(entry.name)) {
                out[relative(REPO_ROOT, full)] = readFileSync(full, 'utf8');
            }
        }
    };
    walk(SRC_ROOT);
    return out;
}

function readSources() {
    return {
        api: readFileSync(join(REPO_ROOT, API), 'utf8'),
        child: readFileSync(join(REPO_ROOT, CHILD), 'utf8'),
        theia: readTheiaSources(),
    };
}

/** @returns {string[]} failure messages; empty means the edit family holds. */
function checkEdit(sources) {
    const failures = [];
    const api = stripComments(sources.api);
    const tabRaw = sources.theia[WEB_TAB] ?? '';
    const tab = stripComments(tabRaw);

    // 1. frozen set == union literals.
    const frozen = frozenArray(api, 'WEB_TAB_EDIT_CMDS');
    if (!frozen) {
        failures.push(`${API}: WEB_TAB_EDIT_CMDS (the frozen edit set) is not declared`);
    }
    const union = unionCmds(tab);
    if (!union) {
        failures.push(`${WEB_TAB}: the WebTabMessage webTabEdit member is not declared`);
    }
    if (frozen && union) {
        const d = diff(union, frozen);
        if (d.surplus.length) {
            failures.push(`${WEB_TAB}: webTabEdit union literals NOT in the frozen set WEB_TAB_EDIT_CMDS: ${d.surplus.join(', ')}`);
        }
        if (d.missing.length) {
            failures.push(`${WEB_TAB}: frozen edit commands GONE from the webTabEdit union: ${d.missing.join(', ')}`);
        }
        const dup = frozen.filter((name, i) => frozen.indexOf(name) !== i);
        if (dup.length) {
            failures.push(`${API}: WEB_TAB_EDIT_CMDS repeats ${dup.join(', ')}`);
        }
    }

    // 2. routing: one routed kind, one arm, the arm refuses an unfrozen cmd.
    const setLiteral = /const WEB_TAB_ACTION_KINDS = new Set\(\[([^\]]*)\]\)/.exec(api);
    if (!setLiteral || !setLiteral[1].includes(`"${KIND}"`)) {
        failures.push(`${API}: "${KIND}" is not in WEB_TAB_ACTION_KINDS`);
    }
    const handler = handlerBody(api);
    const armCount = handler.split(`case "${KIND}":`).length - 1;
    if (armCount !== 1) {
        failures.push(`${API}: expected exactly one case "${KIND}" arm in handleWebTabAction, found ${armCount}`);
    } else {
        const arm = handler.slice(handler.indexOf(`case "${KIND}":`), handler.indexOf('webTabEditReply(kind'));
        if (!arm.includes('WEB_TAB_EDIT_CMDS.includes(data.cmd)')) {
            failures.push(`${API}: the "${KIND}" arm does not refuse a cmd outside WEB_TAB_EDIT_CMDS`);
        }
    }

    // 3. call sites: exactly one send, inside WebTabWidget.edit.
    const sendsByFile = Object.entries(sources.theia)
        .map(([path, text]) => [path, [...stripComments(text).matchAll(SEND)].map(m => m.index)])
        .filter(([, at]) => at.length > 0);
    const editStart = tab.indexOf('async edit(');
    const editEnd = editStart === -1 ? -1 : tab.indexOf('\n    }', editStart);
    const sitesInWidget = editStart === -1 ? 0 : (sendsByFile.find(([path]) => path === WEB_TAB)?.[1] ?? []).filter(at => at > editStart && at < editEnd).length;
    if (editStart === -1) {
        failures.push(`${WEB_TAB}: WebTabWidget.edit (the single widget-handler sender) is not declared`);
    } else if (sitesInWidget !== 1) {
        failures.push(`${WEB_TAB}: WebTabWidget.edit must hold the one "${KIND}" send, found ${sitesInWidget}`);
    }
    for (const [path, at] of sendsByFile) {
        if (path !== WEB_TAB || at.length !== 1) {
            failures.push(`${path}: sends "${KIND}" outside WebTabWidget.edit (a bare-command path that bypasses the widget handler; ${at.length} site(s))`);
        }
    }

    // 4. the Edit items: each edit('cmd_…') call names a frozen command; at least one item exists (positive control).
    const items = [];
    for (const [path, text] of Object.entries(sources.theia)) {
        for (const m of stripComments(text).matchAll(/\.edit\('(cmd_[A-Za-z]+)'\)/g)) {
            items.push({ path, cmd: m[1] });
        }
    }
    if (frozen) {
        for (const item of items.filter(i => !frozen.includes(i.cmd))) {
            failures.push(`${item.path}: Edit item names '${item.cmd}', which is outside the frozen set WEB_TAB_EDIT_CMDS`);
        }
    }
    if (items.length === 0) {
        failures.push('no Edit item calls WebTabWidget.edit with a command literal (positive control for the send-site rule is missing)');
    }
    const pageMenuEdits = /const PAGE_MENU_EDIT_CMDS = Object\.freeze\(\{([^}]*)\}\)/.exec(api)?.[1];
    const pageMenuCmds = [...(pageMenuEdits ?? '').matchAll(/"context-[a-z-]+": "(cmd_[A-Za-z]+)"/g)].map(m => m[1]);
    if (!pageMenuCmds.length) {
        failures.push(`${API}: PAGE_MENU_EDIT_CMDS (the page menu's edit rows, CR-02) derived no command -- broken instrument, never a pass`);
    } else if (frozen) {
        for (const cmd of pageMenuCmds.filter(c => !frozen.includes(c))) {
            failures.push(`${API}: page menu edit row names '${cmd}', which is outside the frozen set WEB_TAB_EDIT_CMDS`);
        }
    }

    // 5. the Edit menu (PAGE-09): one row per Edit command, both ways.
    const commands = stripComments(sources.theia[COMMANDS] ?? '');
    const idConstOf = new Map();
    for (const m of commands.matchAll(/export const (CHROME_BAR_\w+): Command = \{\s*id: (CHROME_BAR_[A-Z_]+_COMMAND_ID)/g)) {
        idConstOf.set(m[1], m[2]);
    }
    const cmdOfId = new Map();
    for (const m of commands.matchAll(/commands\.registerCommand\((CHROME_BAR_\w+), \{\s*execute: \(\) => currentWebTab\(\)\?\.edit\('(cmd_[A-Za-z]+)'\)/g)) {
        cmdOfId.set(idConstOf.get(m[1]), m[2]);
    }
    const widget = stripComments(sources.theia[WIDGET] ?? '');
    const editCase = /case 'edit': \{([\s\S]*?)\n {12}\}/.exec(widget)?.[1] ?? '';
    const rows = [...editCase.matchAll(/this\.commandLeaf\('[a-z-]+', CHROME_BAR_COPY\.[A-Za-z]+, (CHROME_BAR_[A-Z_]+_COMMAND_ID), \[\], ([^)]*\))\)/g)]
        .map(m => ({ id: m[1], cmd: cmdOfId.get(m[1]), enabled: m[2] }));
    if (cmdOfId.size === 0 || !editCase) {
        failures.push(`${COMMANDS} / ${WIDGET}: derived ZERO Edit commands (${cmdOfId.size}) or no Edit submenu case -- broken instrument, never a pass`);
    } else {
        const rowCmds = rows.map(r => r.cmd ?? `${r.id} (no Edit command)`);
        const d = diff(rowCmds, [...cmdOfId.values()]);
        if (d.surplus.length) {
            failures.push(`${WIDGET}: Edit submenu rows that run no Edit command: ${d.surplus.join(', ')}`);
        }
        if (d.missing.length) {
            failures.push(`${WIDGET}: Edit commands with no Edit submenu row: ${d.missing.join(', ')}`);
        }
        // 6. greying from the page's live reply for the row's own cmd.
        for (const row of rows.filter(r => r.cmd && r.enabled !== `live('${r.cmd}')`)) {
            failures.push(`${WIDGET}: the ${row.cmd} Edit row is not greyed from the page's live reply (enabled: ${row.enabled})`);
        }
        if (!/protected async readEditState\(\)[\s\S]*?tab\.edit\(cmd, true\)/.test(widget) || !/const live = \(cmd: EditCmd\): boolean => editState\[cmd\] === true;/.test(editCase)) {
            failures.push(`${WIDGET}: the Edit rows' state is not read with edit(cmd, true) (readEditState) and handed to live() -- the greying has no page source`);
        }
    }

    // 7. the live query behind checkOnly (PAGE-09).
    const reply = /async function webTabEditReply\([\s\S]*?\n\}/.exec(api)?.[0] ?? '';
    if (!/if \(checkOnly\) \{\s*return \{ ok: true, kind, where: "checked", enabled: await webTabEditEnabled\(entry, cmd, enabled\) \};/.test(reply)) {
        failures.push(`${API}: webTabEditReply's checkOnly reply is not the page's live answer (webTabEditEnabled) -- Gecko's cached flag stays true after a collapse`);
    }
    const actorName = /const EDIT_STATE_ACTOR_NAME = "([A-Za-z]+)";/.exec(api)?.[1];
    const query = /const EDIT_STATE_QUERY = "([A-Za-z:]+)";/.exec(api)?.[1];
    const live = /async function webTabEditEnabled\([\s\S]*?\n\}/.exec(api)?.[0] ?? '';
    if (!actorName || !query || !/getActor\(EDIT_STATE_ACTOR_NAME\)/.test(live) || !/sendQuery\(EDIT_STATE_QUERY, \{ cmd \}\)/.test(live)) {
        failures.push(`${API}: webTabEditEnabled does not sendQuery EDIT_STATE_QUERY to the EDIT_STATE_ACTOR_NAME actor (name ${actorName}, query ${query})`);
    }
    // Raw text: the group registration's matches pin (`.../*`) opens a block comment for stripComments.
    const group = /registerGroupActor\(\) \{[\s\S]*?\n {2}\},/.exec(sources.api)?.[0] ?? '';
    if (!group.includes('registerEditStateActor();') || !/ChromeUtils\.registerWindowActor\(EDIT_STATE_ACTOR_NAME, \{[\s\S]*?child: \{ esModuleURI: GROUP_ACTOR_CHILD_MODULE \}/.test(api)) {
        failures.push(`${API}: the edit-state actor is not registered from registerGroupActor with the group child module`);
    }
    const child = stripComments(sources.child ?? '');
    if (actorName && !new RegExp(`export class ${actorName}Child extends JSWindowActorChild`).test(child)) {
        failures.push(`${CHILD}: no ${actorName}Child class -- Gecko loads the child by that name`);
    }
    if (query && !child.includes(`case "${query}":`)) {
        failures.push(`${CHILD}: the edit-state child does not answer "${query}", the message webTabEditEnabled sends`);
    }
    return failures;
}

/** Replaces the one occurrence of `from`; null when the anchor is absent (a drifted plant never silently passes). */
function plant(text, from, to) {
    if (!text.includes(from)) {
        return null;
    }
    return text.replace(from, to);
}

function selfTest() {
    const clean = readSources();
    const cleanFailures = checkEdit(clean);
    if (cleanFailures.length) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
        cleanFailures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const menuPath = 'theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts';
    const cases = [
        {
            name: 'surplus literal (a non-probed command added to the frozen set)',
            build: () => ({ ...clean, api: plant(clean.api, 'const WEB_TAB_EDIT_CMDS = Object.freeze([', 'const WEB_TAB_EDIT_CMDS = Object.freeze(["cmd_pasteNoFormatting", ') }),
            expect: 'cmd_pasteNoFormatting',
        },
        {
            name: 'dropped literal (a frozen command removed from the union)',
            build: () => ({ ...clean, theia: { ...clean.theia, [WEB_TAB]: plant(clean.theia[WEB_TAB], "cmd: 'cmd_undo' | 'cmd_redo' |", "cmd: 'cmd_redo' |") } }),
            expect: 'GONE from the webTabEdit union: cmd_undo',
        },
        {
            name: 'Edit item naming an unfrozen command',
            build: () => ({ ...clean, theia: { ...clean.theia, [menuPath]: plant(clean.theia[menuPath], "edit('cmd_undo')", "edit('cmd_pasteNoFormatting')") } }),
            expect: "'cmd_pasteNoFormatting', which is outside the frozen set",
        },
        {
            name: 'page menu row naming an unfrozen command (35-04)',
            build: () => ({ ...clean, api: plant(clean.api, '"context-copyimage-contents": "cmd_copyImage"', '"context-copyimage-contents": "cmd_zzzPlanted"') }),
            expect: `${API}: page menu edit row names 'cmd_zzzPlanted', which is outside the frozen set`,
        },
        {
            name: 'Edit row dropped (Select All has a command but no row)',
            build: () => ({ ...clean, theia: { ...clean.theia, [WIDGET]: plant(clean.theia[WIDGET],
                "                    this.commandLeaf('edit-select-all', CHROME_BAR_COPY.editSelectAllRow, CHROME_BAR_EDIT_SELECT_ALL_COMMAND_ID, [], live('cmd_selectAll')),\n", '') } }),
            expect: 'Edit commands with no Edit submenu row: cmd_selectAll',
        },
        {
            name: 'Edit row greyed by the command predicate',
            build: () => ({ ...clean, theia: { ...clean.theia, [WIDGET]: plant(clean.theia[WIDGET],
                "CHROME_BAR_EDIT_COPY_COMMAND_ID, [], live('cmd_copy'))", "CHROME_BAR_EDIT_COPY_COMMAND_ID, [], this.commands.isEnabled(CHROME_BAR_EDIT_COPY_COMMAND_ID))") } }),
            expect: 'the cmd_copy Edit row is not greyed from the page',
        },
        {
            name: 'checkOnly answered from the cache',
            build: () => ({ ...clean, api: plant(clean.api, 'enabled: await webTabEditEnabled(entry, cmd, enabled) };', 'enabled };') }),
            expect: "checkOnly reply is not the page's live answer",
        },
        {
            name: 'child message-name drift',
            build: () => ({ ...clean, child: plant(clean.child, 'case "PowerBrowserEditState:Query":', 'case "PowerBrowserEditState:Ask":') }),
            expect: 'the edit-state child does not answer',
        },
        {
            name: 'bare-command send (the kind sent outside the widget handler)',
            build: () => ({ ...clean, theia: { ...clean.theia, [menuPath]: `${clean.theia[menuPath]}\nexport const bare = { send: () => channel.request({ kind: 'webTabEdit', tabId: 'x', cmd: 'cmd_undo' }) };\n` } }),
            expect: 'outside WebTabWidget.edit',
        },
    ];
    let failed = 0;
    for (const testCase of cases) {
        const sources = testCase.build();
        if (sources.api === null || sources.child === null || Object.values(sources.theia).some(text => text === null)) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not modify any source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkEdit(sources);
        if (!failures.some(f => f.includes(testCase.expect))) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not go red naming '${testCase.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed++;
        } else {
            console.log(`  ok  ${testCase.name} -> red, naming '${testCase.expect}'`);
        }
    }
    if (failed) {
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- ${cases.length} planted faults all went red`);
    return 0;
}

function main() {
    if (process.argv.includes('--help')) {
        console.log('usage: verify-page-tools-edit.mjs [--self-test]\n' +
            'Derives the frozen edit set (WEB_TAB_EDIT_CMDS) and compares it with the webTabEdit union literals; checks the one case arm, the one widget send site, and that every Edit item names a frozen command.');
        return 0;
    }
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const failures = checkEdit(readSources());
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the edit family no longer agrees across the shell, the union and the Edit items.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the frozen edit set agrees with the union, the arm refuses outside it, and one widget method sends the kind`);
    return 0;
}

process.exit(main());
