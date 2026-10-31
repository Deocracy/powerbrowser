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
 *
 * --self-test plants a surplus literal, a dropped literal and a send site outside
 * the widget, and requires each to go red naming the drift. Text reads only:
 * --quick, no build, no browser, no display.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-page-tools-edit';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
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
            build: () => ({ ...clean, api: plant(clean.api, '"cmd_selectAll", "cmd_delete"]);', '"cmd_selectAll", "cmd_delete", "cmd_pasteNoFormatting"]);') }),
            expect: 'cmd_pasteNoFormatting',
        },
        {
            name: 'dropped literal (a frozen command removed from the union)',
            build: () => ({ ...clean, theia: { ...clean.theia, [WEB_TAB]: plant(clean.theia[WEB_TAB], "cmd: 'cmd_undo' | 'cmd_redo' |", "cmd: 'cmd_redo' |") } }),
            expect: 'GONE from the webTabEdit union: cmd_undo',
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
        if (sources.api === null || Object.values(sources.theia).some(text => text === null)) {
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
