#!/usr/bin/env node
/**
 * Phase 32 plan 07 (PAGE-04, PAGE-10, PAGE-11): the reader, view-source, DevTools, crash and favicon contract,
 * derived from the tree and compared as set equality, so a surplus or a missing member goes red by name.
 *
 *   1. routing: the three new kinds (webTabReader, webTabViewSource, webTabDevtools) are in WEB_TAB_ACTION_KINDS, each has
 *      one case arm in handleWebTabAction, and each is a member of the WebTabMessage union. Every kind in the set has an arm
 *      and a union member, and the other way round.
 *   2. no restore primitive: no webTab kind named for a crash or a restore. A crashed tab reloads through webTabReload.
 *   3. state: favicon, crashed, isReaderMode and isArticle are WebTabState fields, and webTabPush and webTabPageFields carry them.
 *   4. favicon bound: webTabFaviconOf admits only data:image/ and caps the length at WEB_TAB_FAVICON_MAX = 65536.
 *   5. crash signal: exactly one oop-browser-crashed addEventListener in the shell, and no displayLoadError call outside a
 *      comment (the overlay's docShell is null after a crash, so the stock call would throw).
 *   6. wall: the literal view-source: appears in no Theia source (comments included), and no Theia source imports an
 *      inspector or toolbox module (no custom inspector; F12 is the stock DevTools route, D-23).
 *
 * --self-test plants five faults (a view-source literal in Theia, a custom inspector import, a crash-restore kind, a non-data
 * favicon, a missing crash listener) and requires each to go red naming its drift. Text reads only: no build, no browser.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-page-tools-reader-crash';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const WEB_TAB = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const THEIA_EXTENSIONS = join(REPO_ROOT, 'theia/extensions');
const NEW_KINDS = ['webTabReader', 'webTabViewSource', 'webTabDevtools'];
const STATE_FIELDS = ['favicon', 'crashed', 'isReaderMode', 'isArticle'];
const FAVICON_CAP = 65536;

/** Comments removed, so a literal in a comment is not a touchpoint. Good enough for these sources: no `//` follows a space inside a string. */
function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** Set difference, reported by name, so a failure says WHICH member drifted. */
function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return {
        surplus: [...a].filter(name => !e.has(name)),
        missing: [...e].filter(name => !a.has(name)),
    };
}

/** The webTab* string literals of `const NAME = new Set([ … ]);`, or null when the declaration is absent. */
function setLiterals(text, name) {
    const start = text.indexOf(`const ${name} = new Set([`);
    if (start === -1) {
        return null;
    }
    const end = text.indexOf(']);', start);
    return [...text.slice(start, end).matchAll(/"(webTab\w+)"/g)].map(m => m[1]);
}

/** The case arm kinds of handleWebTabAction, the one switch the frame's webTab* kinds reach. */
function handlerArms(text) {
    const start = text.indexOf('async function handleWebTabAction(');
    if (start === -1) {
        return null;
    }
    const end = text.indexOf('\n}\n', start);
    return [...text.slice(start, end).matchAll(/case "(webTab\w+)":/g)].map(m => m[1]);
}

/** The kind literals of the WebTabMessage union (comments stripped). */
function unionKinds(text) {
    const start = text.indexOf('export type WebTabMessage =');
    if (start === -1) {
        return null;
    }
    const end = text.indexOf(';\n\n', start);
    return [...stripComments(text.slice(start, end)).matchAll(/kind:\s*'(webTab\w+)'/g)].map(m => m[1]);
}

/** The field names of `export interface WebTabState { … }`, or null when the interface is absent. */
function stateFields(text) {
    const start = text.indexOf('export interface WebTabState {');
    if (start === -1) {
        return null;
    }
    const end = text.indexOf('\n}\n', start);
    return [...text.slice(start, end).matchAll(/^\s{4}(\w+)\??:/gm)].map(m => m[1]);
}

/** The text of one top-level function, from its header to the closing brace at column 0, or null. */
function functionBody(text, header) {
    const start = text.indexOf(header);
    if (start === -1) {
        return null;
    }
    const end = text.indexOf('\n}\n', start);
    return text.slice(start, end);
}

/** Every Theia source file under theia/extensions/*\/src, as { path, text }. */
function theiaSources() {
    const out = [];
    const walk = dir => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
                out.push({ path: relative(REPO_ROOT, full), text: readFileSync(full, 'utf8') });
            }
        }
    };
    for (const ext of readdirSync(THEIA_EXTENSIONS, { withFileTypes: true })) {
        if (ext.isDirectory()) {
            const src = join(THEIA_EXTENSIONS, ext.name, 'src');
            try {
                walk(src);
            } catch {
                // an extension without a src tree has nothing to scan
            }
        }
    }
    return out;
}

/** The inputs the checks read: the shell, the Theia union and state sources, and every Theia source file. */
function readInputs() {
    return {
        api: readFileSync(join(REPO_ROOT, API), 'utf8'),
        webTab: readFileSync(join(REPO_ROOT, WEB_TAB), 'utf8'),
        sources: theiaSources(),
    };
}

/** Every drift, as a string that names it. An empty list is a clean tree. */
function evaluate({ api, webTab, sources }) {
    const failures = [];
    const apiStripped = stripComments(api);

    // 1. routing: the set, the handler arms and the union agree, and the new kinds are present in all three.
    const actionKinds = setLiterals(api, 'WEB_TAB_ACTION_KINDS');
    const arms = handlerArms(api);
    const union = unionKinds(webTab);
    if (!actionKinds || !arms || !union) {
        failures.push(`routing: could not read ${!actionKinds ? 'WEB_TAB_ACTION_KINDS' : !arms ? 'handleWebTabAction' : 'WebTabMessage'}`);
    } else {
        const armDiff = diff(arms, actionKinds);
        for (const kind of armDiff.surplus) {
            failures.push(`routing: ${kind} has a case arm but is not in WEB_TAB_ACTION_KINDS`);
        }
        for (const kind of armDiff.missing) {
            failures.push(`routing: ${kind} is in WEB_TAB_ACTION_KINDS but has no case arm in handleWebTabAction`);
        }
        // The union covers both switches: the handler's kinds and the actor's own webTab arms (open, navigate, reload, ...).
        const allArms = [...new Set([...stripComments(api).matchAll(/case "(webTab\w+)":/g)].map(m => m[1]))];
        const unionDiff = diff(union, allArms);
        for (const kind of unionDiff.surplus) {
            failures.push(`routing: ${kind} is a WebTabMessage member with no case arm in the shell`);
        }
        for (const kind of unionDiff.missing) {
            failures.push(`routing: ${kind} has a case arm in the shell but is not a WebTabMessage member`);
        }
        for (const kind of NEW_KINDS) {
            if (!actionKinds.includes(kind) || !arms.includes(kind) || !union.includes(kind)) {
                failures.push(`routing: ${kind} is not in all three of WEB_TAB_ACTION_KINDS, handleWebTabAction and WebTabMessage`);
            }
        }
    }

    // 2. no restore primitive: a crashed tab reloads through webTabReload, never through a kind of its own.
    for (const kind of [...(actionKinds ?? []), ...(union ?? [])]) {
        if (/crash|restore/i.test(kind)) {
            failures.push(`crash-restore: ${kind} is a crash-restore primitive; a crashed tab reloads through webTabReload`);
        }
    }
    if (!/case "webTabReload":/.test(api)) {
        failures.push('crash-restore: the webTabReload arm is missing, so a crashed tab has no reload path');
    }

    // 3. state: the three fields are on the interface and on both pushes.
    const fields = stateFields(webTab);
    if (!fields) {
        failures.push('state: WebTabState interface is missing');
    } else {
        for (const field of STATE_FIELDS) {
            if (!fields.includes(field)) {
                failures.push(`state: WebTabState has no ${field} field`);
            }
            if (!new RegExp(`\\b${field}: pageFields\\.${field}\\b`).test(apiStripped)) {
                failures.push(`state: webTabPush does not carry ${field} from pageFields`);
            }
        }
    }

    // 4. favicon bound: data:image/ only, at most FAVICON_CAP characters.
    const faviconBody = functionBody(apiStripped, 'function webTabFaviconOf(');
    if (!faviconBody || !faviconBody.includes('startsWith("data:image/")') || !new RegExp(`icon\\.length\\s*<=\\s*WEB_TAB_FAVICON_MAX`).test(faviconBody)
        || !new RegExp(`const WEB_TAB_FAVICON_MAX = ${FAVICON_CAP};`).test(apiStripped)) {
        failures.push(`favicon: the icon is not bounded to data:image/ at ${FAVICON_CAP} characters (webTabFaviconOf)`);
    }

    // 5. crash signal: one listener per overlay, and no displayLoadError call on the overlay.
    const crashListeners = [...apiStripped.matchAll(/addEventListener\("oop-browser-crashed"/g)].length;
    if (crashListeners !== 1) {
        failures.push(`oop-browser-crashed: expected one addEventListener("oop-browser-crashed") in the shell, found ${crashListeners}`);
    }
    const displayLoadErrorCalls = [...apiStripped.matchAll(/displayLoadError\s*\(/g)].length;
    if (displayLoadErrorCalls > 0) {
        failures.push(`displayLoadError: ${displayLoadErrorCalls} call(s) outside a comment; a crashed overlay has a null docShell`);
    }

    // 6. wall: no view-source: literal in Theia, and no inspector or toolbox import.
    for (const source of sources) {
        if (source.text.includes('view-source:')) {
            failures.push(`view-source wall: ${source.path} carries the view-source: literal (the chrome mints it, never Theia)`);
        }
        if (/from\s+['"][^'"]*(inspector|toolbox)[^'"]*['"]/i.test(source.text)) {
            failures.push(`custom inspector: ${source.path} imports an inspector or toolbox module (F12 is the stock DevTools route)`);
        }
    }
    return failures;
}

/** Each plant rewrites one input; each must produce a failure that names `expect`. */
const PLANTS = [
    {
        plant: 'view-source-literal-in-theia',
        mutate: inputs => ({ ...inputs, sources: [...inputs.sources, { path: 'theia/extensions/tab-uris/src/browser/planted.ts', text: "const u = 'view-source:http://example.test/';" }] }),
        expect: 'view-source: literal',
    },
    {
        plant: 'custom-inspector-import',
        mutate: inputs => ({ ...inputs, sources: [...inputs.sources, { path: 'theia/extensions/chrome-bar/src/browser/planted.ts', text: "import { Inspector } from './inspector-panel';" }] }),
        expect: 'imports an inspector or toolbox module',
    },
    {
        plant: 'crash-restore-kind-added',
        mutate: inputs => ({ ...inputs, api: inputs.api.replace('const WEB_TAB_ACTION_KINDS = new Set(["webTabStop",', 'const WEB_TAB_ACTION_KINDS = new Set(["webTabCrashRestore", "webTabStop",') }),
        expect: 'webTabCrashRestore',
    },
    {
        plant: 'non-data-favicon-pushed',
        mutate: inputs => ({ ...inputs, api: inputs.api.replace('icon.startsWith("data:image/")', 'icon.startsWith("https://")') }),
        expect: 'data:image/',
    },
    {
        plant: 'crash-listener-missing',
        mutate: inputs => ({ ...inputs, api: inputs.api.replace('browser.addEventListener("oop-browser-crashed", state.crashedListener);', '') }),
        expect: 'oop-browser-crashed',
    },
];

function selfTest() {
    const clean = evaluate(readInputs());
    if (clean.length) {
        console.error(`${NAME} --self-test: the clean tree is red: ${clean.join(' | ')}`);
        return 1;
    }
    let missed = 0;
    for (const planted of PLANTS) {
        const got = evaluate(planted.mutate(readInputs()));
        if (!got.some(failure => failure.includes(planted.expect))) {
            console.error(`${NAME} --self-test: FAIL -- '${planted.plant}' did not go red naming '${planted.expect}'; got: ${got.join(' | ') || '(green)'}`);
            missed++;
        } else {
            console.log(`  ok  ${planted.plant} -> red, naming '${planted.expect}'`);
        }
    }
    if (missed) {
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- clean tree green, ${PLANTS.length} planted fault(s) went red`);
    return 0;
}

function main() {
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const failures = evaluate(readInputs());
    if (failures.length) {
        for (const failure of failures) {
            console.error(`${NAME}: FAIL -- ${failure}`);
        }
        return 1;
    }
    console.log(`${NAME}: PASS -- routing, state, favicon bound, crash signal and the view-source and inspector wall agree`);
    return 0;
}

process.exit(main());
