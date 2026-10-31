#!/usr/bin/env node
/**
 * Phase 32 plan 01 (PAGE-02, and the mute half of PAGE-05 once Task 2 lands):
 * the zoom family's contract, derived from the tree and compared as set
 * equality, so a dropped arm, a stale union member and a dropped state field
 * each go red by name.
 *
 *   1. routing: the webTabZoom* kinds in WEB_TAB_ACTION_KINDS == the case arms
 *      of handleWebTabAction == the WebTabMessage union members.
 *   2. state: WebTabState carries zoom, webTabPageFields pushes it, and
 *      webTabPush carries that function in the state push (zoom rides the
 *      push of the url, Pitfall 5 item 3).
 *   3. ladder: the step reads the live toolkit.zoomManager.zoomValues pref and
 *      clamps to the ladder's ends (Math.min/Math.max), so no zoom value is
 *      hard-coded and a step cannot leave the ladder.
 *   4. no pref write: nothing in the boundary sets the zoom pref (D-07). Zoom
 *      is a per-tab fullZoom, never a stored preference.
 *
 * --self-test plants a dropped arm, a stale union member, a dropped state field
 * and a pref write, and requires each to go red naming the drift.
 * Text reads only: --quick, no build, no browser, no display.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-page-tools-zoom-mute';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const WEB_TAB = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const FAMILY = /^webTabZoom/;

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

/** @returns {string[]} failure messages; empty means the zoom contract holds. */
function checkZoom(sources) {
    const failures = [];
    const api = stripComments(sources[API]);
    const tab = stripComments(sources[WEB_TAB]);

    // 1. routing: routed set == case arms == union members, for the zoom family.
    const setLiteral = /const WEB_TAB_ACTION_KINDS = new Set\(\[([^\]]*)\]\)/.exec(api);
    const routed = setLiteral ? derive(setLiteral[1], /"(webTab[A-Za-z]+)"/g).filter(k => FAMILY.test(k)) : [];
    const arms = derive(functionBody(api, 'handleWebTabAction'), /case "(webTab[A-Za-z]+)"/g).filter(k => FAMILY.test(k));
    const union = derive(unionBlock(tab), /kind: '(webTab[A-Za-z]+)'/g).filter(k => FAMILY.test(k));
    if (routed.length === 0 || arms.length === 0 || union.length === 0) {
        failures.push(`routing: derived ZERO zoom kinds (routed ${routed.length}, arms ${arms.length}, union ${union.length}) -- the parse found nothing, so the comparison proves nothing (broken instrument, never a clean pass)`);
    } else {
        const armsVsUnion = diff(arms, union);
        if (armsVsUnion.missing.length) {
            failures.push(`routing: zoom union members with no case arm (dropped kind): ${armsVsUnion.missing.join(', ')}`);
        }
        if (armsVsUnion.surplus.length) {
            failures.push(`routing: zoom case arms with no union member: ${armsVsUnion.surplus.join(', ')}`);
        }
        const routedVsArms = diff(routed, arms);
        if (routedVsArms.surplus.length) {
            failures.push(`routing: WEB_TAB_ACTION_KINDS routes zoom kinds with no case arm: ${routedVsArms.surplus.join(', ')}`);
        }
        if (routedVsArms.missing.length) {
            failures.push(`routing: zoom case arms not routed by WEB_TAB_ACTION_KINDS: ${routedVsArms.missing.join(', ')}`);
        }
    }

    // 2. state: zoom is a WebTabState field, pushed by webTabPageFields, which webTabPush carries.
    if (!/^\s+zoom\??:/m.test(interfaceBlock(tab, 'WebTabState'))) {
        failures.push('state: WebTabState has no zoom field (the zoom chip would never update)');
    }
    if (!/\bzoom\b/.test(functionBody(api, 'webTabPageFields'))) {
        failures.push('state: webTabPageFields does not push zoom');
    }
    const pushBody = apiMethodBody(api, 'webTabPush');
    if (!/^\s+zoom: pageFields\.zoom,/m.test(pushBody)) {
        failures.push('state: webTabPush does not push zoom in the state push (zoom would ride no push)');
    }

    // 3. ladder: read live from the pref, and the step clamps to the ladder's ends.
    const ladder = functionBody(api, 'webTabZoomLadder');
    if (!ladder.includes('WEB_TAB_ZOOM_PREF') && !ladder.includes('toolkit.zoomManager.zoomValues')) {
        failures.push('ladder: webTabZoomLadder does not read toolkit.zoomManager.zoomValues (the ladder must be live, never a literal)');
    }
    if (!functionBody(api, 'webTabZoomReply').includes('Math.min(ladder.length - 1')) {
        failures.push('ladder: webTabZoomReply does not clamp the step to the ladder ends');
    }

    // 4. no pref write: the zoom pref is read, never set (D-07).
    if (/Services\.prefs\.set\w*Pref\(\s*(WEB_TAB_ZOOM_PREF|["']toolkit\.zoomManager)/.test(api)) {
        failures.push('pref: the boundary writes the zoom pref (D-07: zoom is a per-tab fullZoom, never a stored preference)');
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
    const cleanFailures = checkZoom(clean);
    if (cleanFailures.length) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
        cleanFailures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const cases = [
        {
            name: 'dropped kind (the zoom-out arm renamed away)',
            sources: { [API]: plant(clean[API], 'case "webTabZoomOut": {', 'case "webTabZoomOutDropped": {') },
            expect: 'webTabZoomOut',
        },
        {
            name: 'stale union member (no arm)',
            sources: { [WEB_TAB]: plant(clean[WEB_TAB], "    | { kind: 'webTabZoomReset'; tabId: string }", "    | { kind: 'webTabZoomStale'; tabId: string }\n    | { kind: 'webTabZoomReset'; tabId: string }") },
            expect: 'webTabZoomStale',
        },
        {
            name: 'dropped state field (zoom)',
            sources: { [WEB_TAB]: plant(clean[WEB_TAB], '    zoom: number;', '') },
            expect: 'WebTabState has no zoom field',
        },
        {
            name: 'planted pref write (the zoom pref set, not read)',
            sources: { [API]: plant(clean[API], '  return PowerBrowserAPI.getStringPref(WEB_TAB_ZOOM_PREF, "")', '  Services.prefs.setStringPref(WEB_TAB_ZOOM_PREF, "1");\n  return PowerBrowserAPI.getStringPref(WEB_TAB_ZOOM_PREF, "")') },
            expect: 'writes the zoom pref',
        },
    ];
    let failed = 0;
    for (const testCase of cases) {
        if (Object.values(testCase.sources).some(text => text === null)) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not modify any source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkZoom({ ...clean, ...testCase.sources });
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
        console.log('usage: verify-page-tools-zoom-mute.mjs [--self-test]\n' +
            'Derives the zoom family (webTabZoomIn, webTabZoomOut, webTabZoomReset) from the boundary and the union, compares routing and the zoom state field, and refuses a pref write or a hard-coded ladder.');
        return 0;
    }
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const failures = checkZoom(readSources());
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the zoom family no longer agrees across the boundary, the union and the state push.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the zoom arms, the union, the routed set, the zoom state field and the live ladder agree`);
    return 0;
}

process.exit(main());
