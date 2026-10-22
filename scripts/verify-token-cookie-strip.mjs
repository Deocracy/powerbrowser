#!/usr/bin/env node
/**
 * BAR-02 (Phase 29, REQUIREMENTS technical ruling 2026-10-20): the static gate
 * on the token-cookie strip in PowerBrowserAPI.sys.mjs's search area.
 *
 * The Theia token cookie is host-only on 127.0.0.1 and cookies are not
 * port-scoped, so the strip is what keeps a server on another loopback port
 * from receiving it. Derived from the tree at check time and compared:
 *   1. the boundary's TOKEN_COOKIE_NAME literal equals the token gate's
 *      POWERBROWSER_TOKEN_COOKIE_NAME and the cookie name probeHealth writes
 *      into its explicit Cookie header (a rename on one side strips nothing);
 *   2. TOKEN_STRIP_TOPIC is exactly http-on-modify-request (a -before-cookies
 *      topic runs before the cookie is on the request);
 *   3. setGroupSenderPort's body calls installTokenCookieStrip(), so the strip
 *      is live from the cookie mint on, before any web tab (a stock browser
 *      window can be opened first);
 *   4. tokenCookieAllowed compares the request port against groupSenderPort;
 *   5. its browsing-context branch keeps the token only when the load's top
 *      embedder is not an overlay (tabIdOfBrowser(...) === null), so a web tab
 *      on the sidecar's own port loses it;
 *   6. tokenCookieStrip.observe filters the Cookie header on
 *      `${TOKEN_COOKIE_NAME}=` (a filter on another name strips nothing).
 * A derivation that finds nothing is a broken instrument, never a pass.
 * Honestly --quick: text reads only. The live proof is
 * verify-address-bar-live.mjs --scenario token-cookie.
 *
 * Usage:
 *   node scripts/verify-token-cookie-strip.mjs
 *   node scripts/verify-token-cookie-strip.mjs --self-test
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-token-cookie-strip';

const BOUNDARY_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const TOKEN_GATE_REL = 'theia/extensions/token-gate/src/node/token-gate-backend-contribution.ts';
const STRIP_TOPIC = 'http-on-modify-request';

const BROKEN = 'broken instrument:';

const stripLineComments = text => text.split('\n').map(line => line.replace(/^\s*\/\/.*$|\s\/\/\s.*$/, '')).join('\n');

/** The text of `  <name>(` up to the next line that closes a two-space-indented method (`  },`), or null. */
function methodBody(src, name) {
    const start = src.indexOf(`\n  ${name}(`);
    if (start < 0) {
        return null;
    }
    const end = src.indexOf('\n  },', start);
    return end < 0 ? null : src.slice(start, end);
}

/** The text of `function <name>(` up to the next line that is exactly `}`, or null. */
function functionBody(src, name) {
    const start = src.indexOf(`\nfunction ${name}(`);
    if (start < 0) {
        return null;
    }
    const end = src.indexOf('\n}', start);
    return end < 0 ? null : src.slice(start, end);
}

function check(sources) {
    const failures = [];
    const boundary = sources[BOUNDARY_REL];
    const gate = sources[TOKEN_GATE_REL];

    const gateName = /export const POWERBROWSER_TOKEN_COOKIE_NAME = '([^']+)'/.exec(gate)?.[1];
    const stripName = /\nconst TOKEN_COOKIE_NAME = "([^"]+)";/.exec(boundary)?.[1];
    const probeName = /setRequestHeader\("Cookie", `([A-Za-z0-9_]+)=\$\{/.exec(boundary)?.[1];
    if (!gateName) {
        failures.push(`${BROKEN} ${TOKEN_GATE_REL} declares no POWERBROWSER_TOKEN_COOKIE_NAME literal`);
    }
    if (!stripName) {
        failures.push(`${BROKEN} ${BOUNDARY_REL} declares no TOKEN_COOKIE_NAME literal (the strip is missing)`);
    }
    if (!probeName) {
        failures.push(`${BROKEN} ${BOUNDARY_REL}: probeHealth's setRequestHeader("Cookie", ...) template did not derive`);
    }
    if (gateName && stripName && stripName !== gateName) {
        failures.push(`cookie name: the strip removes ${JSON.stringify(stripName)} but the token gate's POWERBROWSER_TOKEN_COOKIE_NAME is ${JSON.stringify(gateName)}`);
    }
    if (gateName && probeName && probeName !== gateName) {
        failures.push(`cookie name: probeHealth sends ${JSON.stringify(probeName)} but the token gate's POWERBROWSER_TOKEN_COOKIE_NAME is ${JSON.stringify(gateName)}`);
    }

    const topic = /\nconst TOKEN_STRIP_TOPIC = "([^"]+)";/.exec(boundary)?.[1];
    if (!topic) {
        failures.push(`${BROKEN} ${BOUNDARY_REL} declares no TOKEN_STRIP_TOPIC literal`);
    } else if (topic !== STRIP_TOPIC) {
        failures.push(`topic: the strip observes ${JSON.stringify(topic)}, not ${STRIP_TOPIC} (cookies are added to the request before ${STRIP_TOPIC}, never before a -before-cookies topic)`);
    }
    if (!/Services\.obs\.addObserver\(tokenCookieStrip, TOKEN_STRIP_TOPIC\)/.test(stripLineComments(functionBody(boundary, 'installTokenCookieStrip') ?? ''))) {
        failures.push(`install: installTokenCookieStrip does not add tokenCookieStrip on TOKEN_STRIP_TOPIC`);
    }

    const setPort = methodBody(boundary, 'setGroupSenderPort');
    if (!setPort) {
        failures.push(`${BROKEN} ${BOUNDARY_REL}: the setGroupSenderPort( method body did not derive`);
    } else if (!stripLineComments(setPort).includes('installTokenCookieStrip()')) {
        failures.push('install site: setGroupSenderPort does not call installTokenCookieStrip(), so a load made before that site runs (a stock browser window opened before any web tab) carries the token');
    }

    const allowed = functionBody(boundary, 'tokenCookieAllowed');
    if (!allowed) {
        failures.push(`${BROKEN} ${BOUNDARY_REL}: the tokenCookieAllowed function body did not derive`);
    } else {
        const code = stripLineComments(allowed);
        if (!/channel\.URI\.port !== groupSenderPort/.test(code)) {
            failures.push('port: tokenCookieAllowed does not compare the request port against groupSenderPort, so another loopback port can keep the token');
        }
        if (!/\n {2}if \(bc\) \{\s*return tabIdOfBrowser\(bc\.top\.embedderElement\) === null;\s*\}/.test(code)) {
            failures.push('overlay: tokenCookieAllowed\'s browsing-context branch does not return tabIdOfBrowser(bc.top.embedderElement) === null, so a web tab on the sidecar\'s own port can keep the token');
        }
    }

    const strip = /\nconst tokenCookieStrip = \{\n[\s\S]*?\n\};/.exec(boundary)?.[0];
    if (!strip) {
        failures.push(`${BROKEN} ${BOUNDARY_REL}: the tokenCookieStrip object did not derive`);
    } else if (!stripLineComments(strip).includes('.filter(entry => !entry.trim().startsWith(`${TOKEN_COOKIE_NAME}=`))')) {
        failures.push('filter: tokenCookieStrip.observe does not drop the Cookie entries that start with `${TOKEN_COOKIE_NAME}=`, so the strip removes nothing');
    }
    return failures;
}

function readSources() {
    return Object.fromEntries([BOUNDARY_REL, TOKEN_GATE_REL].map(rel => [rel, readFileSync(join(REPO_ROOT, rel), 'utf8')]));
}

function selfTest() {
    const clean = readSources();
    const baseline = check(clean);
    if (baseline.length) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the plants would mean nothing:`);
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log('  ok  clean tree -> green');
    const b = clean[BOUNDARY_REL];
    const cases = [
        {
            name: 'renamed cookie literal',
            mutate: src => src.replace('const TOKEN_COOKIE_NAME = "POWERBROWSER_TOKEN";', 'const TOKEN_COOKIE_NAME = "POWERBROWSER_TOKEN_OLD";'),
            expect: 'cookie name',
        },
        {
            name: 'a -before-cookies topic',
            mutate: src => src.replace(`const TOKEN_STRIP_TOPIC = "${STRIP_TOPIC}";`, 'const TOKEN_STRIP_TOPIC = "http-on-before-modify-request-before-cookies";'),
            expect: 'topic',
        },
        {
            name: 'install moved from setGroupSenderPort to webTabOpen',
            mutate: src => {
                const moved = src.replace('    if (groupSenderPort !== null) installTokenCookieStrip();\n', '');
                return moved === src ? src : moved.replace(/\n {2}webTabOpen\(([^)]*)\) \{\n/, match => `${match}    installTokenCookieStrip();\n`);
            },
            expect: 'install site',
        },
        {
            name: 'port comparison removed',
            mutate: src => src.replace('groupSenderPort === null || channel.URI.port !== groupSenderPort', 'groupSenderPort === null'),
            expect: 'port:',
        },
        {
            name: 'overlay branch keeps the token',
            mutate: src => src.replace('    return tabIdOfBrowser(bc.top.embedderElement) === null;', '    return true;'),
            expect: 'overlay:',
        },
        {
            name: 'filter on another cookie name',
            mutate: src => src.replace('entry.trim().startsWith(`${TOKEN_COOKIE_NAME}=`)', 'entry.trim().startsWith(`${TOKEN_STRIP_TOPIC}=`)'),
            expect: 'filter:',
        },
    ];
    let failed = 0;
    for (const c of cases) {
        const mutated = c.mutate(b);
        if (mutated === b || (c.name.includes('webTabOpen') && !mutated.includes('installTokenCookieStrip();\n'))) {
            console.error(`${NAME} --self-test: FAIL -- '${c.name}' did not modify the source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = check({ ...clean, [BOUNDARY_REL]: mutated });
        if (failures.some(f => f.startsWith(c.expect) && !f.startsWith(BROKEN))) {
            console.log(`  ok  ${c.name} -> red, naming '${c.expect}'`);
        } else {
            console.error(`${NAME} --self-test: FAIL -- '${c.name}' did not go red naming '${c.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed++;
        }
    }
    if (failed) {
        console.error(`${NAME} --self-test: FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- the clean tree is green and all ${cases.length} plants went red: ${cases.map(c => c.name).join(', ')}`);
    return 0;
}

function main() {
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const failures = check(readSources());
    if (failures.length) {
        console.error(`${NAME}: FAIL`);
        failures.forEach(f => console.error(`  - ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the strip removes the token gate's cookie name on ${STRIP_TOPIC}, is installed by setGroupSenderPort and keeps the token only on the sidecar's port, never for an overlay`);
    return 0;
}

process.exit(main());
