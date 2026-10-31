#!/usr/bin/env node
/**
 * Phase 32 plan 01 (PAGE-01): the find family's contract, derived from the tree
 * and compared as set equality, so a dropped arm, a stale union member and a
 * dropped state field each go red by name.
 *
 *   1. routing: the webTabFind* kinds in WEB_TAB_ACTION_KINDS == the case arms
 *      of handleWebTabAction == the WebTabMessage union members.
 *   2. state: WebTabState carries findCurrent, findTotal and findStatus, the
 *      boundary's webTabPageFields pushes them, and webTabPush carries that
 *      function in the state push (the counts ride the push of the url).
 *   3. listener: the boundary's Finder listener is attached through
 *      addResultListener and handles onFindResult and onMatchesCountResult.
 *   4. prohibition: no browser-fullZoom, findbar or modal-print reach in the
 *      boundary outside a comment (the never-load rule, D-28 and the plan's
 *      standing rules).
 *
 * TODO (owned by plan 32-02): the CHROME_BAR_COPY find rows are not asserted
 * here; they land with the find bar's copy in that plan.
 *
 * --self-test plants a dropped arm, a stale union member, a dropped state field
 * and a removed state push, and requires each to go red naming the drift.
 * Text reads only: --quick, no build, no browser, no display.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-page-tools-find';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const WEB_TAB = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const FAMILY = /^webTabFind/;
const STATE_FIELDS = ['findCurrent', 'findTotal', 'findStatus'];

function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function derive(text, re) {
    return [...text.matchAll(re)].map(m => m[1]);
}

/** Set difference reported by name, so a failure says WHICH name drifted. */
function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return {
        surplus: [...a].filter(name => !e.has(name)),
        missing: [...e].filter(name => !a.has(name)),
    };
}

/** The body of a top-level `[async] function name(…) { … }`, up to its column-0 `}`. */
function functionBody(text, name) {
    const start = text.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    if (start === -1) {
        return '';
    }
    const end = text.indexOf('\n}', start);
    return end === -1 ? text.slice(start) : text.slice(start, end);
}

/** The body of the `PowerBrowserAPI` object method `name(…) {` (two-space indentation). */
function apiMethodBody(text, name) {
    const start = text.search(new RegExp(`^ {2}${name}\\([^)]*\\)\\s*\\{`, 'm'));
    if (start === -1) {
        return '';
    }
    const rest = text.slice(start + 1);
    const next = rest.search(/^ {2}(?:async\s+)?[A-Za-z_$][\w$]*\([^)]*\)\s*\{/m);
    return next === -1 ? text.slice(start) : text.slice(start, start + 1 + next);
}

/** The `export type WebTabMessage` union, up to the blank line that ends it. */
function unionBlock(text) {
    const start = text.indexOf('export type WebTabMessage');
    if (start === -1) {
        return '';
    }
    const end = text.indexOf('\n\n', start);
    return end === -1 ? text.slice(start) : text.slice(start, end);
}

/** The `export interface name { … }` block, up to its column-0 `}`. */
function interfaceBlock(text, name) {
    const start = text.indexOf(`export interface ${name} {`);
    if (start === -1) {
        return '';
    }
    const end = text.indexOf('\n}', start);
    return end === -1 ? text.slice(start) : text.slice(start, end);
}

function readSources() {
    return {
        [API]: readFileSync(join(REPO_ROOT, API), 'utf8'),
        [WEB_TAB]: readFileSync(join(REPO_ROOT, WEB_TAB), 'utf8'),
    };
}

/** @returns {string[]} failure messages; empty means the find contract holds. */
function checkFind(sources) {
    const failures = [];
    const api = stripComments(sources[API]);
    const tab = stripComments(sources[WEB_TAB]);

    // 1. routing: routed set == case arms == union members, for the find family.
    const setLiteral = /const WEB_TAB_ACTION_KINDS = new Set\(\[([^\]]*)\]\)/.exec(api);
    const routed = setLiteral ? derive(setLiteral[1], /"(webTab[A-Za-z]+)"/g).filter(k => FAMILY.test(k)) : [];
    const arms = derive(functionBody(api, 'handleWebTabAction'), /case "(webTab[A-Za-z]+)"/g).filter(k => FAMILY.test(k));
    const union = derive(unionBlock(tab), /kind: '(webTab[A-Za-z]+)'/g).filter(k => FAMILY.test(k));
    if (routed.length === 0 || arms.length === 0 || union.length === 0) {
        failures.push(`routing: derived ZERO find kinds (routed ${routed.length}, arms ${arms.length}, union ${union.length}) -- the parse found nothing, so the comparison proves nothing (broken instrument, never a clean pass)`);
    } else {
        const armsVsUnion = diff(arms, union);
        if (armsVsUnion.missing.length) {
            failures.push(`routing: find union members with no case arm (dropped kind): ${armsVsUnion.missing.join(', ')}`);
        }
        if (armsVsUnion.surplus.length) {
            failures.push(`routing: find case arms with no union member: ${armsVsUnion.surplus.join(', ')}`);
        }
        const routedVsArms = diff(routed, arms);
        if (routedVsArms.surplus.length) {
            failures.push(`routing: WEB_TAB_ACTION_KINDS routes find kinds with no case arm: ${routedVsArms.surplus.join(', ')}`);
        }
        if (routedVsArms.missing.length) {
            failures.push(`routing: find case arms not routed by WEB_TAB_ACTION_KINDS: ${routedVsArms.missing.join(', ')}`);
        }
    }

    // 2. state: the union's state fields exist and are pushed in the state push.
    const stateBlock = interfaceBlock(tab, 'WebTabState');
    for (const field of STATE_FIELDS) {
        if (!new RegExp(`^\\s+${field}\\??:`, 'm').test(stateBlock)) {
            failures.push(`state: WebTabState has no ${field} field (the find counts never reach the bar)`);
        }
    }
    const pageFields = functionBody(api, 'webTabPageFields');
    for (const field of STATE_FIELDS) {
        if (!new RegExp(`\\b${field}\\b`).test(pageFields)) {
            failures.push(`state: webTabPageFields does not push ${field}`);
        }
    }
    const pushBody = apiMethodBody(api, 'webTabPush');
    if (!/const pageFields = webTabPageFields\(browser\)/.test(pushBody)) {
        failures.push('state: webTabPush does not read webTabPageFields (the counts would ride no push)');
    }
    for (const field of STATE_FIELDS) {
        if (!new RegExp(`^\\s+${field}: pageFields\\.${field},`, 'm').test(pushBody)) {
            failures.push(`state: webTabPush does not push ${field} in the state push`);
        }
    }

    // 3. listener: the Finder result listener is attached and handles both results.
    const ensure = functionBody(api, 'ensureWebTabFinderListener');
    if (!ensure.includes('addResultListener(')) {
        failures.push('listener: ensureWebTabFinderListener never calls addResultListener (no Finder result listener)');
    }
    for (const handler of ['onFindResult(', 'onMatchesCountResult(']) {
        if (!ensure.includes(handler)) {
            failures.push(`listener: the Finder listener has no ${handler.slice(0, -1)} handler`);
        }
    }

    // 4. prohibition: the never-load rule. Comments are stripped, so a comment naming the script is not a load.
    for (const banned of ['browser-fullZoom', 'findbar.js', 'getTabDialogBox', '_openTabModalPrint']) {
        if (api.includes(banned)) {
            failures.push(`prohibition: ${banned} appears in the boundary outside a comment (the never-load rule)`);
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
    const cleanFailures = checkFind(clean);
    if (cleanFailures.length) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
        cleanFailures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const cases = [
        {
            name: 'dropped kind (the find-close arm renamed away)',
            sources: { [API]: plant(clean[API], 'case "webTabFindClose": {', 'case "webTabFindCloseDropped": {') },
            expect: 'webTabFindClose',
        },
        {
            name: 'stale union member (no arm)',
            sources: { [WEB_TAB]: plant(clean[WEB_TAB], "    | { kind: 'webTabFindClose'; tabId: string }", "    | { kind: 'webTabFindStale'; tabId: string }\n    | { kind: 'webTabFindClose'; tabId: string }") },
            expect: 'webTabFindStale',
        },
        {
            name: 'dropped state field (findTotal)',
            sources: { [WEB_TAB]: plant(clean[WEB_TAB], '    findTotal: number;', '') },
            expect: 'findTotal',
        },
        {
            name: 'removed state push (findCurrent never pushed)',
            sources: { [API]: plant(clean[API], '          findCurrent: pageFields.findCurrent,\n', '') },
            expect: 'webTabPush does not push findCurrent',
        },
    ];
    let failed = 0;
    for (const testCase of cases) {
        const sources = { ...clean, ...testCase.sources };
        if (Object.values(testCase.sources).some(text => text === null)) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not modify any source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkFind(sources);
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
        console.log('usage: verify-page-tools-find.mjs [--self-test]\n' +
            'Derives the find family (webTabFind, webTabFindNext, webTabFindClose) from the boundary and the union, compares routing and the state fields and the Finder listener, and refuses the never-load scripts.');
        return 0;
    }
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const failures = checkFind(readSources());
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the find family no longer agrees across the boundary, the union and the state push.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the find arms, the union, the routed set, the state fields and the Finder listener agree`);
    return 0;
}

process.exit(main());
