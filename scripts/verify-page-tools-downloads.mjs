#!/usr/bin/env node
/**
 * Phase 32 plan 04 (PAGE-06): the Downloads family's contract, derived from the
 * tree and compared as set equality, so a dropped arm, a drifted action, an
 * extra row field and a removed view each go red by name.
 *
 *   1. routing: the webTabDownloads* kinds in WEB_TAB_ACTION_KINDS == the case
 *      arms of handleWebTabAction == the WebTabMessage union members.
 *   2. actions: the DownloadAction type == the WEB_TAB_DOWNLOAD_ACTIONS array ==
 *      the case labels of webTabDownloadAction (the frozen row-action set).
 *   3. rows: the keys of the serialized row == the WebTabDownloadRow interface,
 *      so no path, no error text and no object reaches the frame by accident.
 *   4. lifecycle: the view is installed with addView and removed on quit
 *      (removeView). Without addView there are no rows: the silent-save path.
 *   5. push: the downloadsChanged push sends the serialized rows and nothing
 *      else. A Download object does not structured-clone, so it must not ride.
 *   6. prohibition: no DownloadsPanel or DownloadsCommon literal anywhere in the
 *      shell, comments included (the stock panel needs a stock window).
 *
 * --self-test plants a dropped arm, a drifted row field, a dropped addView, an
 * unserialized push and a panel literal, and requires each to go red naming
 * the drift. Text reads only: --quick, no build, no browser, no display.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-page-tools-downloads';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const WEB_TAB = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const FAMILY = /^webTabDownloads/;
const PUSH_LINE = 'sendWebTabPush(frame, { kind: "downloadsChanged", rows });';

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

/** The `export interface name { … }` block, up to its column-0 `}`. */
function interfaceBlock(text, name) {
    const start = text.indexOf(`export interface ${name} {`);
    if (start === -1) {
        return '';
    }
    const end = text.indexOf('\n}', start);
    return end === -1 ? text.slice(start) : text.slice(start, end);
}

/** The `export type name = …;` declaration, up to its semicolon. */
function typeBlock(text, name) {
    const start = text.indexOf(`export type ${name} =`);
    if (start === -1) {
        return '';
    }
    const end = text.indexOf(';', start);
    return end === -1 ? text.slice(start) : text.slice(start, end);
}

/** The object literal of the first `return {` in a function body, up to its `};`. */
function returnedObject(body) {
    const start = body.indexOf('return {');
    if (start === -1) {
        return '';
    }
    const end = body.indexOf('\n  };', start);
    return end === -1 ? body.slice(start) : body.slice(start, end);
}

function readSources() {
    return {
        [API]: readFileSync(join(REPO_ROOT, API), 'utf8'),
        [WEB_TAB]: readFileSync(join(REPO_ROOT, WEB_TAB), 'utf8'),
    };
}

/** @returns {string[]} failure messages; empty means the downloads contract holds. */
function checkDownloads(sources) {
    const failures = [];
    const raw = sources[API];
    const api = stripComments(raw);
    const tab = stripComments(sources[WEB_TAB]);

    // 1. routing: routed set == case arms == union members, for the downloads family.
    const setLiteral = /const WEB_TAB_ACTION_KINDS = new Set\(\[([^\]]*)\]\)/.exec(api);
    const routed = setLiteral ? derive(setLiteral[1], /"(webTab[A-Za-z]+)"/g).filter(k => FAMILY.test(k)) : [];
    const arms = derive(functionBody(api, 'handleWebTabAction'), /case "(webTab[A-Za-z]+)"/g).filter(k => FAMILY.test(k));
    const union = derive(unionBlock(tab), /kind: '(webTab[A-Za-z]+)'/g).filter(k => FAMILY.test(k));
    if (routed.length === 0 || arms.length === 0 || union.length === 0) {
        failures.push(`routing: derived ZERO downloads kinds (routed ${routed.length}, arms ${arms.length}, union ${union.length}) -- the parse found nothing, so the comparison proves nothing (broken instrument, never a clean pass)`);
    } else {
        const armsVsUnion = diff(arms, union);
        if (armsVsUnion.missing.length) {
            failures.push(`routing: downloads union members with no case arm (dropped kind): ${armsVsUnion.missing.join(', ')}`);
        }
        if (armsVsUnion.surplus.length) {
            failures.push(`routing: downloads case arms with no union member: ${armsVsUnion.surplus.join(', ')}`);
        }
        const routedVsArms = diff(routed, arms);
        if (routedVsArms.surplus.length) {
            failures.push(`routing: WEB_TAB_ACTION_KINDS routes downloads kinds with no case arm: ${routedVsArms.surplus.join(', ')}`);
        }
        if (routedVsArms.missing.length) {
            failures.push(`routing: downloads case arms not routed by WEB_TAB_ACTION_KINDS: ${routedVsArms.missing.join(', ')}`);
        }
    }

    // 2. actions: the TS type, the frozen array and the switch labels are one set.
    const typeSet = derive(typeBlock(tab, 'DownloadAction'), /'([A-Za-z]+)'/g);
    const frozen = /const WEB_TAB_DOWNLOAD_ACTIONS = Object.freeze\(\[([^\]]*)\]\)/.exec(api);
    const frozenSet = frozen ? derive(frozen[1], /"([A-Za-z]+)"/g) : [];
    const switchSet = derive(functionBody(api, 'webTabDownloadAction'), /case "([A-Za-z]+)":/g);
    if (typeSet.length === 0 || frozenSet.length === 0 || switchSet.length === 0) {
        failures.push(`actions: derived ZERO row actions (type ${typeSet.length}, frozen ${frozenSet.length}, switch ${switchSet.length}) -- broken instrument`);
    } else {
        for (const [label, other] of [['WEB_TAB_DOWNLOAD_ACTIONS', frozenSet], ['the webTabDownloadAction switch', switchSet]]) {
            const d = diff(typeSet, other);
            if (d.surplus.length || d.missing.length) {
                failures.push(`actions: the DownloadAction type and ${label} disagree (surplus ${JSON.stringify(d.surplus)}, missing ${JSON.stringify(d.missing)}): the frozen row-action set drifted`);
            }
        }
    }

    // 3. rows: the serialized object's keys == the WebTabDownloadRow interface's fields.
    const serialized = derive(returnedObject(functionBody(api, 'webTabDownloadSerialize')), /^\s+(\w+)(?=\s*[:,])/gm);
    const iface = derive(interfaceBlock(tab, 'WebTabDownloadRow'), /^\s+(\w+)\??:/gm);
    if (serialized.length === 0 || iface.length === 0) {
        failures.push(`row fields: derived ZERO row fields (serialized ${serialized.length}, interface ${iface.length}) -- broken instrument`);
    } else {
        const d = diff(serialized, iface);
        if (d.surplus.length) {
            failures.push(`row fields: the serialized row carries fields the WebTabDownloadRow interface does not declare (a path or error text could reach the frame): ${d.surplus.join(', ')}`);
        }
        if (d.missing.length) {
            failures.push(`row fields: WebTabDownloadRow declares fields the serialized row never sends: ${d.missing.join(', ')}`);
        }
    }

    // 4. lifecycle: one view, installed with addView and removed on quit.
    const subscribe = functionBody(api, 'webTabDownloadsSubscribe');
    if (!subscribe.includes('addView(downloadsView)')) {
        failures.push('lifecycle: webTabDownloadsSubscribe never calls addView(downloadsView) -- no view, so no row is ever pushed (the silent-save path)');
    }
    if (!/removeView\(downloadsView\)/.test(api)) {
        failures.push('lifecycle: the Downloads view is never removed (no removeView(downloadsView) on quit)');
    }

    // 5. push: the downloadsChanged push sends the serialized rows and nothing else.
    const pushBody = functionBody(api, 'webTabDownloadsPush');
    if (!pushBody.includes(PUSH_LINE)) {
        failures.push('unserialized push: the downloadsChanged push does not send exactly the serialized rows (a Download object does not structured-clone)');
    }
    if (!/downloadsState\.rows\.values\(\)/.test(pushBody)) {
        failures.push('unserialized push: the rows in the downloadsChanged push are not read from the serialized row map');
    }

    // 6. prohibition: raw text, comments included, matching the grep rule that the shell names neither panel.
    for (const banned of ['DownloadsPanel', 'DownloadsCommon']) {
        if (raw.includes(banned)) {
            failures.push(`prohibition: ${banned} appears in ${API} (the shell builds its own panel; the stock panel is never instantiated)`);
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
    const cleanFailures = checkDownloads(clean);
    if (cleanFailures.length) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
        cleanFailures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const cases = [
        {
            name: 'dropped kind (the action arm renamed away)',
            sources: { [API]: plant(clean[API], 'case "webTabDownloadsAction": {', 'case "webTabDownloadsActionDropped": {') },
            expect: 'webTabDownloadsAction',
        },
        {
            name: 'panel reference (the stock panel named in the shell)',
            sources: { [API]: plant(clean[API], 'const downloadsLazy = {};', 'const downloadsLazy = {}; const panel = "DownloadsPanel";') },
            expect: 'DownloadsPanel',
        },
        {
            name: 'unserialized push (Download objects ride the push)',
            sources: { [API]: plant(clean[API], `  ${PUSH_LINE}`, '  sendWebTabPush(frame, { kind: "downloadsChanged", rows, raw: [...downloadsState.byId.values()] });') },
            expect: 'unserialized push',
        },
        {
            name: 'silent-save path (the view is never added)',
            sources: { [API]: plant(clean[API], '      list.addView(downloadsView);\n', '') },
            expect: 'addView(downloadsView)',
        },
        {
            name: 'drifted row field (a path rides the row)',
            sources: { [API]: plant(clean[API], '    error: !!download.error,\n', '    error: !!download.error,\n    targetPath: String(download.target?.path ?? ""),\n') },
            expect: 'targetPath',
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
        const failures = checkDownloads(sources);
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
        console.log('usage: verify-page-tools-downloads.mjs [--self-test]\n' +
            'Derives the downloads family (webTabDownloadsSubscribe, webTabDownloadsAction) from the shell and the union, compares routing, the frozen action set, the serialized row fields and the view lifecycle, and refuses the stock panel.');
        return 0;
    }
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const failures = checkDownloads(readSources());
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the downloads family no longer agrees across the shell, the union and the row push.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the downloads arms, the union, the frozen actions, the row fields and the view lifecycle agree`);
    return 0;
}

process.exit(main());
