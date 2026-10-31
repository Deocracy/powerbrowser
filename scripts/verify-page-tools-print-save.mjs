#!/usr/bin/env node
/**
 * Phase 32 plan 03 (PAGE-03), the print half: the webTabPrint family's contract,
 * derived from the tree and compared as set equality, so a dropped arm, a stale
 * union member, a tab-modal call or a browserDOMWindow shim each go red by name.
 *
 *   1. routing: the webTabPrint kind in WEB_TAB_ACTION_KINDS == the case arm of
 *      handleWebTabAction == the WebTabMessage union member.
 *   2. system path only: webTabPrintReply drives the print-dialog service and
 *      BrowsingContext.print; the arm refuses a non-boolean selectionOnly.
 *   3. no tab-modal path (D-08) and no browserDOMWindow shim (D-09a): the forbidden
 *      literals are absent from every chrome source once comments are stripped.
 *   4. probe gate: scripts/lib/pb-probe-verdicts.json records print-today, and the
 *      verdict is a completing one. A missing key or a failing verdict is a
 *      blocker the executor reports, never an assumed pass (D-08a).
 *
 * --self-test plants a dropped arm, a stale union member, a tab-modal call, a
 * browserDOMWindow shim and a failing verdict; each must go red naming the drift.
 * Text reads only: --quick, no build, no browser, no display.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-page-tools-print-save';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const WEB_TAB = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const VERDICTS = 'scripts/lib/pb-probe-verdicts.json';
const SHELL_DIR = 'powerbrowser/shell';
const PRINT_FAMILY = /^webTabPrint/;
// Names the tab-modal preview and the browserDOMWindow shim use. Absent from every chrome source, comments excluded.
const FORBIDDEN = ['getTabDialogBox', '_openTabModalPrint', 'print.html', 'PrintPreview', 'browserDOMWindow', 'OPEN_PRINT_BROWSER', 'nsIBrowserDOMWindow', 'printUtils.js'];

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

/** The `export type WebTabMessage` union, up to the blank line that ends it. */
function unionBlock(text) {
    const start = text.indexOf('export type WebTabMessage');
    if (start === -1) {
        return '';
    }
    const end = text.indexOf('\n\n', start);
    return end === -1 ? text.slice(start) : text.slice(start, end);
}

function readSources() {
    const sources = {
        [API]: readFileSync(join(REPO_ROOT, API), 'utf8'),
        [WEB_TAB]: readFileSync(join(REPO_ROOT, WEB_TAB), 'utf8'),
        [VERDICTS]: readFileSync(join(REPO_ROOT, VERDICTS), 'utf8'),
    };
    for (const name of readdirSync(join(REPO_ROOT, SHELL_DIR))) {
        if (/\.(m?js|js)$/.test(name) && `${SHELL_DIR}/${name}` !== API) {
            sources[`${SHELL_DIR}/${name}`] = readFileSync(join(REPO_ROOT, SHELL_DIR, name), 'utf8');
        }
    }
    return sources;
}

/** @returns {string[]} failure messages; empty means the print contract holds. */
function checkPrint(sources) {
    const failures = [];
    const api = stripComments(sources[API]);
    const tab = stripComments(sources[WEB_TAB]);

    // 1. routing: routed set == case arms == union members, for the print family.
    const setLiteral = /const WEB_TAB_ACTION_KINDS = new Set\(\[([^\]]*)\]\)/.exec(api);
    const routed = setLiteral ? derive(setLiteral[1], /"(webTab[A-Za-z]+)"/g).filter(k => PRINT_FAMILY.test(k)) : [];
    const arms = derive(functionBody(api, 'handleWebTabAction'), /case "(webTab[A-Za-z]+)"/g).filter(k => PRINT_FAMILY.test(k));
    const union = derive(unionBlock(tab), /kind: '(webTab[A-Za-z]+)'/g).filter(k => PRINT_FAMILY.test(k));
    if (routed.length === 0 || arms.length === 0 || union.length === 0) {
        failures.push(`routing: derived ZERO print kinds (routed ${routed.length}, arms ${arms.length}, union ${union.length}) -- the parse found nothing, so the comparison proves nothing (broken instrument, never a clean pass)`);
    } else {
        const armsVsUnion = diff(arms, union);
        if (armsVsUnion.missing.length) {
            failures.push(`routing: print union members with no case arm (dropped kind): ${armsVsUnion.missing.join(', ')}`);
        }
        if (armsVsUnion.surplus.length) {
            failures.push(`routing: print case arms with no union member: ${armsVsUnion.surplus.join(', ')}`);
        }
        const routedVsArms = diff(routed, arms);
        if (routedVsArms.surplus.length) {
            failures.push(`routing: WEB_TAB_ACTION_KINDS routes print kinds with no case arm: ${routedVsArms.surplus.join(', ')}`);
        }
        if (routedVsArms.missing.length) {
            failures.push(`routing: print case arms not routed by WEB_TAB_ACTION_KINDS: ${routedVsArms.missing.join(', ')}`);
        }
    }

    // 2. the system path: the dialog service and BrowsingContext.print, and a boolean-only option.
    const printBody = functionBody(api, 'webTabPrintReply');
    if (!printBody.includes('printdialog-service;1') || !printBody.includes('showPrintDialog(')) {
        failures.push('system path: webTabPrintReply does not open the system print dialog (printdialog-service showPrintDialog)');
    }
    if (!/\.print\(settings\)/.test(printBody)) {
        failures.push('system path: webTabPrintReply does not call BrowsingContext.print(settings)');
    }
    if (!functionBody(api, 'handleWebTabAction').includes('typeof data.selectionOnly !== "boolean"')) {
        failures.push('system path: the webTabPrint arm does not refuse a non-boolean selectionOnly (print options are booleans only)');
    }

    // 3. no tab-modal path and no shim, in any chrome source (comments excluded).
    for (const key of Object.keys(sources).filter(k => k.startsWith(`${SHELL_DIR}/`) || k === API)) {
        const code = stripComments(sources[key]);
        for (const literal of FORBIDDEN) {
            if (code.includes(literal)) {
                failures.push(`forbidden: ${key} carries '${literal}' outside a comment (no tab-modal print and no browserDOMWindow shim, D-08 and D-09a)`);
            }
        }
    }

    // 4. probe gate: the recorded print-today verdict must exist and must complete.
    let verdict = null;
    try {
        verdict = JSON.parse(sources[VERDICTS])['print-today'];
    } catch {
        verdict = null;
    }
    if (typeof verdict !== 'string') {
        failures.push(`probe: ${VERDICTS} has no print-today verdict (the print build is blocked until the probe is recorded, D-08a)`);
    } else if (!verdict.startsWith('completes')) {
        failures.push(`probe: print-today verdict is '${verdict}', not a completing verdict (D-08a: a print-today failure is a blocker, no stock-window fallback is built)`);
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
    const cleanFailures = checkPrint(clean);
    if (cleanFailures.length) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
        cleanFailures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const cases = [
        {
            name: 'dropped kind (the print arm renamed away)',
            sources: { [API]: plant(clean[API], 'case "webTabPrint": {', 'case "webTabPrintDropped": {') },
            expect: 'webTabPrint',
        },
        {
            name: 'stale union member (no arm)',
            sources: { [WEB_TAB]: plant(clean[WEB_TAB], "    | { kind: 'webTabPrint'; tabId: string; selectionOnly?: boolean };", "    | { kind: 'webTabPrintStale'; tabId: string };\n    | { kind: 'webTabPrint'; tabId: string; selectionOnly?: boolean };") },
            expect: 'webTabPrintStale',
        },
        {
            name: 'tab-modal call smuggled into the print helper',
            sources: { [API]: plant(clean[API], '  const printSvc = Cc["@mozilla.org/gfx/printsettings-service;1"]', '  const tabModal = entry.browser.ownerGlobal?.getTabDialogBox;\n  const printSvc = Cc["@mozilla.org/gfx/printsettings-service;1"]') },
            expect: 'getTabDialogBox',
        },
        {
            name: 'browserDOMWindow shim added to the shell',
            sources: { [`${SHELL_DIR}/powerbrowser.js`]: `${clean[`${SHELL_DIR}/powerbrowser.js`]}\nwindow.shimPrint = { browserDOMWindow: true };\n` },
            expect: 'browserDOMWindow',
        },
        {
            name: 'print-today verdict failing',
            sources: { [VERDICTS]: JSON.stringify({ 'downloads-today': 'saved-to-download-dir-without-prompt', 'print-today': 'fails-print-rejected-0x80004004' }) },
            expect: 'not a completing verdict',
        },
        {
            name: 'print-today verdict not recorded',
            sources: { [VERDICTS]: JSON.stringify({ 'downloads-today': 'saved-to-download-dir-without-prompt' }) },
            expect: 'has no print-today verdict',
        },
    ];
    let failed = 0;
    for (const testCase of cases) {
        if (Object.values(testCase.sources).some(text => text === null)) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not modify any source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkPrint({ ...clean, ...testCase.sources });
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
        console.log('usage: verify-page-tools-print-save.mjs [--self-test]\n' +
            'Derives the webTabPrint family from the boundary and the union, checks the system-dialog path, refuses the tab-modal preview and the browserDOMWindow shim, and requires a completing print-today verdict.');
        return 0;
    }
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const failures = checkPrint(readSources());
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the print family no longer agrees across the boundary, the union, the system path, the chrome sources or the probe verdict.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the print arm, union and routed set agree, the system path is the only print path, and the print-today verdict completes`);
    return 0;
}

process.exit(main());
