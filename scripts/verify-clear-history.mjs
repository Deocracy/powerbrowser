#!/usr/bin/env node
/**
 * BMK-05 / BMK-04 (Phase 33): the static gate on Clear Recent History and the
 * bookmark observer in PowerBrowserAPI.sys.mjs.
 *
 * Derived from the tree at check time and compared:
 *   1. FAN-OUT: the clearHistory fan-out targets (CLEAR_HISTORY_FANOUT) equal,
 *      as a set, the browsing-history stores the boundary declares:
 *        - `places` while the boundary lazy-imports PlacesUtils;
 *        - every tabs.sqlite table with a `url` column, from the PB-SQL DDL
 *          markers: `<table>.closed_at` when the table carries closed_at (its
 *          closed rows; an open row is never deleted), `<table>` otherwise;
 *        - every `thumbnail` column, as `<table>.thumbnail`;
 *        - every `*HISTORY*_FILE_NAME` constant (the web-tab history file);
 *        - `sessionstore.<list>` for every sessionstore closed list
 *          (`win._closed*`) iterated by a projection that
 *          sweepTabStoreFromSessionStore calls: the sweep re-fills the closed
 *          rows from it on every sessionstore write, so the clear must forget
 *          it (CR-01), and before any `<table>.closed_at` target runs.
 *      A new store with a url column, a dropped target and a surplus target
 *      each go red by name. Each target's function must also carry its
 *      evidence: removeVisitsByFilter with beginDate/endDate (never Sanitizer,
 *      D-09b), a DELETE on the table, every closed-row DELETE fenced by
 *      `closed_at IS NOT NULL`, the thumbnail reset, the file write, a
 *      SessionStore.forgetClosedTab* call.
 *   2. TOKEN EXEMPT: no fan-out function (nor clearHistory) names a cookie,
 *      the token cookie's name or literal, 127.0.0.1, Sanitizer,
 *      SiteDataManager or a clearData service. Positive control in the same
 *      run: the same detector must find the token in tokenCookieStrip's body,
 *      or the detector is blind and the check proves nothing.
 *   3. RANGES: CLEAR_HISTORY_RANGES keys are exactly
 *      {last-hour, last-2-hours, last-4-hours, today, everything}; each
 *      last-N-hours body subtracts N hours (N read from its own label), today
 *      starts at local midnight, everything at 0; clearHistory refuses any
 *      other range with fixed text.
 *   4. OBSERVER: BOOKMARK_OBSERVER_EVENTS equals the event list stock chrome
 *      passes to PlacesUtils.observers.addListener in
 *      upstream/browser/base/content/browser-places.js; installBookmarkObserver
 *      adds exactly that list with the push function, once-guarded; it is
 *      called exactly once, from setGroupSenderPort beside
 *      installTokenCookieStrip; the push goes to the shell window's Theia
 *      frame as kind "bookmarks-changed".
 * A derivation that finds nothing is a broken instrument, never a pass.
 * Honestly --quick: text reads only. The live proof (planted rows gone, the
 * token cookie surviving, the IDE still signed in) is the clear-history live
 * scenario.
 *
 * Usage:
 *   node scripts/verify-clear-history.mjs
 *   node scripts/verify-clear-history.mjs --self-test
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-clear-history';

const BOUNDARY_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const UPSTREAM_PLACES_REL = 'upstream/browser/base/content/browser-places.js';
// D-09: Firefox's range set minus the site-specific rows. The contract the range picker offers.
const RANGE_CONTRACT = ['last-hour', 'last-2-hours', 'last-4-hours', 'today', 'everything'];

const BROKEN = 'broken instrument:';

const stripLineComments = text => text.split('\n').map(line => line.replace(/^\s*\/\/.*$|\s\/\/\s.*$/, '')).join('\n');

/** The text of a top-level `[async] function <name>(` up to the next line that is exactly `}`, or null. */
function functionBody(src, name) {
    const match = new RegExp(`\\n(?:async )?function ${name}\\(`).exec(src);
    if (!match) {
        return null;
    }
    const end = src.indexOf('\n}', match.index + 1);
    return end < 0 ? null : stripLineComments(src.slice(match.index, end));
}

/** The text of a two-space-indented method `  [async ]<name>(` up to its `  },`, or null. */
function methodBody(src, name) {
    const start = src.search(new RegExp(`\\n  (?:async )?${name}\\(`));
    if (start < 0) {
        return null;
    }
    const end = src.indexOf('\n  },', start);
    return end < 0 ? null : stripLineComments(src.slice(start, end));
}

/** Tables and their columns from every PB-SQL DDL marker block. */
function deriveTables(src) {
    const tables = new Map();
    const add = (table, column) => {
        if (!tables.has(table)) {
            tables.set(table, new Set());
        }
        tables.get(table).add(column);
    };
    const blocks = [...src.matchAll(/\/\* PB-SQL-([A-Z0-9-]+)-DDL-START \*\/([\s\S]*?)\/\* PB-SQL-\1-DDL-END \*\//g)].map(m => m[2]);
    for (const block of blocks) {
        for (const create of block.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+) \(([\s\S]*?)\n\)/g)) {
            for (const line of create[2].split('\n')) {
                const column = /^\s*(\w+)\s+[A-Z]/.exec(line)?.[1];
                if (column) {
                    add(create[1], column);
                }
            }
        }
        for (const alter of block.matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+)/g)) {
            add(alter[1], alter[2]);
        }
    }
    return { blocks: blocks.length, tables };
}

function checkFanout(src, failures) {
    const fanoutLiteral = /\nconst CLEAR_HISTORY_FANOUT = Object\.freeze\(\[([\s\S]*?)\n\]\);/.exec(src)?.[1];
    const fanout = fanoutLiteral ? [...stripLineComments(fanoutLiteral).matchAll(/\[\s*"([^"]+)"\s*,\s*([A-Za-z_$][\w$]*)\s*\]/g)].map(m => ({ target: m[1], fn: m[2] })) : [];
    if (fanout.length === 0) {
        failures.push(`${BROKEN} ${BOUNDARY_REL}: CLEAR_HISTORY_FANOUT derived ZERO targets (the table is missing or reshaped)`);
        return [];
    }
    const clear = functionBody(src, 'clearHistory');
    if (!clear) {
        failures.push(`${BROKEN} ${BOUNDARY_REL}: the clearHistory function body did not derive`);
    } else if (!/for \(const \[\w+, \w+\] of CLEAR_HISTORY_FANOUT\)/.test(clear)) {
        failures.push('fan-out: clearHistory no longer runs every CLEAR_HISTORY_FANOUT target in turn');
    }

    const expected = new Set();
    if (/\bPlacesUtils: "resource:\/\/gre\/modules\/PlacesUtils\.sys\.mjs"/.test(src)) {
        expected.add('places');
    }
    const { blocks, tables } = deriveTables(src);
    if (blocks === 0 || tables.size === 0) {
        failures.push(`${BROKEN} ${BOUNDARY_REL}: derived ZERO PB-SQL DDL blocks (${blocks}) or tables (${tables.size})`);
    }
    for (const [table, columns] of tables) {
        if (columns.has('url')) {
            expected.add(columns.has('closed_at') ? `${table}.closed_at` : table);
        }
        if (columns.has('thumbnail')) {
            expected.add(`${table}.thumbnail`);
        }
    }
    for (const m of src.matchAll(/\nconst ([A-Z][A-Z0-9_]*HISTORY[A-Z0-9_]*_FILE_NAME) = "/g)) {
        expected.add(m[1]);
    }
    // CR-01: the sweep re-fills the closed rows from sessionstore on every write, so the source must be
    // cleared too. Every sessionstore closed list a sweep projection reads (win._closed*) is a target.
    const sweep = methodBody(src, 'sweepTabStoreFromSessionStore');
    const projections = sweep ? [...new Set([...sweep.matchAll(/PowerBrowserAPI\.(parseSessionStore\w+Rows)\(\)/g)].map(m => m[1]))] : [];
    if (projections.length === 0) {
        failures.push(`${BROKEN} ${BOUNDARY_REL}: sweepTabStoreFromSessionStore derived ZERO sessionstore projections`);
    }
    for (const name of projections) {
        const body = methodBody(src, name);
        if (!body) {
            failures.push(`${BROKEN} ${BOUNDARY_REL}: the sweep's projection ${name} did not derive`);
            continue;
        }
        for (const m of body.matchAll(/\bwin\.(_closed\w+)/g)) {
            expected.add(`sessionstore.${m[1]}`);
        }
    }
    if (expected.size === 0) {
        failures.push(`${BROKEN} ${BOUNDARY_REL}: derived ZERO browsing-history stores`);
    }
    const actual = new Set(fanout.map(entry => entry.target));
    const missing = [...expected].filter(target => !actual.has(target));
    const surplus = [...actual].filter(target => !expected.has(target));
    if (missing.length) {
        failures.push(`fan-out: browsing-history stores clearHistory does not clear (missing target): ${missing.join(', ')}`);
    }
    if (surplus.length) {
        failures.push(`fan-out: clearHistory targets no store declares (surplus target): ${surplus.join(', ')}`);
    }
    const lastSource = fanout.map(entry => entry.target).findLastIndex(target => target.startsWith('sessionstore.'));
    const firstRows = fanout.findIndex(entry => /^\w+\.closed_at$/.test(entry.target));
    if (lastSource >= 0 && firstRows >= 0 && lastSource > firstRows) {
        failures.push(`fan-out: ${fanout[lastSource].target} runs after ${fanout[firstRows].target}, so a sweep between the two re-imports the rows just deleted`);
    }

    for (const { target, fn } of fanout) {
        const body = functionBody(src, fn);
        if (!body) {
            failures.push(`fan-out: target ${target} names ${fn}, which is not a top-level function`);
            continue;
        }
        if (target === 'places') {
            if (!/PlacesUtils\.history\.removeVisitsByFilter\(\{[^}]*\bbeginDate\b[^}]*\bendDate\b/.test(body)) {
                failures.push(`fan-out: places: ${fn} does not call PlacesUtils.history.removeVisitsByFilter({beginDate, endDate})`);
            }
        } else if (/^sessionstore\._closed\w+$/.test(target)) {
            if (!/SessionStore\.forgetClosedTab(?:ById)?\(/.test(body)) {
                failures.push(`fan-out: ${target}: ${fn} does not forget sessionstore's closed tabs, so the sweep re-imports them`);
            }
        } else if (/^\w+\.closed_at$/.test(target)) {
            const table = target.split('.')[0];
            const deletes = [...body.matchAll(new RegExp(`DELETE FROM ${table}\\b[^"\`]*`, 'g'))].map(m => m[0]);
            if (deletes.length === 0) {
                failures.push(`fan-out: ${target}: ${fn} deletes nothing from ${table}`);
            }
            for (const statement of deletes) {
                if (!/closed_at IS NOT NULL/.test(statement)) {
                    failures.push(`fan-out: ${target}: ${fn} has a DELETE without closed_at IS NOT NULL, so an open row (closed_at NULL) can be deleted`);
                }
            }
        } else if (/^\w+\.thumbnail$/.test(target)) {
            if (!new RegExp(`UPDATE ${target.split('.')[0]} SET thumbnail = NULL`).test(body)) {
                failures.push(`fan-out: ${target}: ${fn} does not reset the thumbnail column`);
            }
        } else if (/_FILE_NAME$/.test(target)) {
            if (!body.includes(target) || !/IOUtils\.writeJSON\(/.test(body)) {
                failures.push(`fan-out: ${target}: ${fn} does not rewrite the ${target} file`);
            }
        } else if (tables.has(target)) {
            if (!new RegExp(`DELETE FROM ${target}\\b`).test(body)) {
                failures.push(`fan-out: ${target}: ${fn} deletes nothing from ${target}`);
            }
        } else {
            failures.push(`fan-out: ${target}: no evidence rule knows this target's shape`);
        }
    }
    return fanout;
}

function checkTokenExempt(src, fanout, failures) {
    const tokenName = /\nconst TOKEN_COOKIE_NAME = "([^"]+)";/.exec(src)?.[1];
    if (!tokenName) {
        failures.push(`${BROKEN} ${BOUNDARY_REL} declares no TOKEN_COOKIE_NAME literal`);
        return;
    }
    const forbidden = [/cookie/i, /\bTOKEN_COOKIE_NAME\b/, new RegExp(tokenName), /127\.0\.0\.1/, /\bSanitizer\b/, /\bSiteDataManager\b/, /\bclearData\b/i];
    const hits = body => forbidden.filter(re => re.test(body)).map(re => re.source);
    // Positive control: the detector must see the token where it really is.
    const strip = functionBody(src, 'tokenCookieAllowed') !== null ? /\nconst tokenCookieStrip = \{([\s\S]*?)\n\};/.exec(src)?.[1] : null;
    if (!strip || hits(stripLineComments(strip)).length === 0) {
        failures.push(`${BROKEN} the token detector finds nothing in tokenCookieStrip, where the token is filtered, so its silence over the fan-out proves nothing`);
        return;
    }
    for (const fn of ['clearHistory', ...fanout.map(entry => entry.fn)]) {
        const body = functionBody(src, fn);
        if (body && hits(body).length) {
            failures.push(`token: ${fn} reaches the token cookie or a cookie/site-data clear (${hits(body).join(', ')}); the fan-out must never enumerate the token host`);
        }
    }
    if (src.split('\n').some(line => !/^\s*(\/\/|\*|\/\*)/.test(line) && /\bSanitizer\b/.test(line))) {
        failures.push('token: the boundary reaches Sanitizer; D-09b clears through removeVisitsByFilter and never Sanitizer');
    }
}

function checkRanges(src, failures) {
    const literal = /\nconst CLEAR_HISTORY_RANGES = Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(src)?.[1];
    if (!literal) {
        failures.push(`${BROKEN} ${BOUNDARY_REL}: CLEAR_HISTORY_RANGES did not derive`);
        return;
    }
    const entries = [...stripLineComments(literal).matchAll(/^\s*"?([a-z0-9-]+)"?:\s*(.+?),?$/gm)].map(m => ({ key: m[1], body: m[2] }));
    const keys = entries.map(entry => entry.key);
    const missing = RANGE_CONTRACT.filter(key => !keys.includes(key));
    const surplus = keys.filter(key => !RANGE_CONTRACT.includes(key));
    if (missing.length || surplus.length) {
        failures.push(`range: CLEAR_HISTORY_RANGES is not exactly {${RANGE_CONTRACT.join(', ')}} (missing: ${missing.join(', ') || 'none'}; surplus: ${surplus.join(', ') || 'none'})`);
    }
    for (const { key, body } of entries) {
        const hours = key === 'last-hour' ? 1 : Number(/^last-(\d+)-hours$/.exec(key)?.[1]);
        if (Number.isFinite(hours)) {
            const factor = hours === 1 ? '60 \\* 60 \\* 1000' : `${hours} \\* 60 \\* 60 \\* 1000`;
            if (!new RegExp(`now => now - ${factor}$`).test(body)) {
                failures.push(`range: ${key} does not begin ${hours} hour(s) before now`);
            }
        } else if (key === 'today' && !/setHours\(0, 0, 0, 0\)/.test(body)) {
            failures.push('range: today does not begin at local midnight');
        } else if (key === 'everything' && !/=> 0$/.test(body)) {
            failures.push('range: everything does not begin at 0');
        }
    }
    const clear = functionBody(src, 'clearHistory') ?? '';
    if (!/hasOwnProperty\.call\(CLEAR_HISTORY_RANGES, range\)/.test(clear) || !/throw new Error\("clearHistory: refusing an unknown range"\)/.test(clear)) {
        failures.push('range: clearHistory does not refuse a range outside CLEAR_HISTORY_RANGES with fixed text');
    }
}

function checkObserver(src, upstream, failures) {
    if (!upstream) {
        failures.push(`${BROKEN} ${UPSTREAM_PLACES_REL} is unreadable (fetch upstream first), so the stock event list cannot be derived`);
        return;
    }
    const stock = [...upstream.matchAll(/PlacesUtils\.observers\.addListener\(\s*\[([^\]]*)\]/g)]
        .map(m => [...m[1].matchAll(/"([a-z-]+)"/g)].map(e => e[1]))
        .find(list => list.includes('bookmark-added'));
    if (!stock || stock.length === 0) {
        failures.push(`${BROKEN} ${UPSTREAM_PLACES_REL}: derived no PlacesUtils.observers.addListener list carrying bookmark-added`);
        return;
    }
    const ours = /\nconst BOOKMARK_OBSERVER_EVENTS = Object\.freeze\(\[([^\]]*)\]\);/.exec(src)?.[1];
    const events = ours ? [...ours.matchAll(/"([a-z-]+)"/g)].map(m => m[1]) : [];
    if (events.length === 0) {
        failures.push(`${BROKEN} ${BOUNDARY_REL}: BOOKMARK_OBSERVER_EVENTS derived ZERO events`);
    } else {
        const missing = stock.filter(e => !events.includes(e));
        const surplus = events.filter(e => !stock.includes(e));
        if (missing.length || surplus.length) {
            failures.push(`observer: BOOKMARK_OBSERVER_EVENTS differs from stock chrome's list (missing: ${missing.join(', ') || 'none'}; surplus: ${surplus.join(', ') || 'none'})`);
        }
    }
    const install = functionBody(src, 'installBookmarkObserver');
    if (!install) {
        failures.push('observer: installBookmarkObserver is missing');
        return;
    }
    if (!/PlacesUtils\.observers\.addListener\(\[\.\.\.BOOKMARK_OBSERVER_EVENTS\], pushBookmarksChanged\)/.test(install)) {
        failures.push('observer: installBookmarkObserver does not add BOOKMARK_OBSERVER_EVENTS with pushBookmarksChanged');
    }
    if (!/if \(bookmarkObserverInstalled\)/.test(install) || !/bookmarkObserverInstalled = true/.test(install)) {
        failures.push('observer: installBookmarkObserver has no once-guard, so a respawn installs a second listener');
    }
    const code = stripLineComments(src);
    const listeners = (code.match(/PlacesUtils\.observers\.addListener\(/g) ?? []).length;
    if (listeners !== 1) {
        failures.push(`observer: the boundary adds ${listeners} PlacesUtils observers; exactly one (single install) is allowed`);
    }
    const calls = (code.match(/(?<!function )\binstallBookmarkObserver\(\)/g) ?? []).length;
    if (calls !== 1) {
        failures.push(`observer: installBookmarkObserver() is called ${calls} times; exactly one install site is allowed`);
    }
    const site = methodBody(src, 'setGroupSenderPort') ?? '';
    if (!/installTokenCookieStrip\(\)/.test(site) || !/installBookmarkObserver\(\)/.test(site)) {
        failures.push('observer: the install site is not setGroupSenderPort beside installTokenCookieStrip');
    }
    const push = functionBody(src, 'pushBookmarksChanged') ?? '';
    if (!/findShellWindow\(\)/.test(push) || !/SHELL_CONTENT_BROWSER_ID/.test(push) || !/sendWebTabPush\(\w+, \{ kind: "bookmarks-changed" \}\)/.test(push)) {
        failures.push('observer: pushBookmarksChanged does not push kind "bookmarks-changed" to the shell window\'s Theia frame');
    }
}

function check(sources) {
    const failures = [];
    const src = sources[BOUNDARY_REL];
    const fanout = checkFanout(src, failures);
    checkTokenExempt(src, fanout, failures);
    checkRanges(src, failures);
    checkObserver(src, sources[UPSTREAM_PLACES_REL], failures);
    return failures;
}

function readSources() {
    const read = rel => {
        try {
            return readFileSync(join(REPO_ROOT, rel), 'utf8');
        } catch {
            return null;
        }
    };
    return { [BOUNDARY_REL]: read(BOUNDARY_REL), [UPSTREAM_PLACES_REL]: read(UPSTREAM_PLACES_REL) };
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
    const cases = [
        {
            name: 'dropped saved_pages target',
            mutate: src => src.replace('  ["saved_pages", clearSavedPages],\n', ''),
            expect: 'fan-out: browsing-history stores clearHistory does not clear (missing target): saved_pages',
        },
        {
            name: 'token-enumerating fan-out',
            mutate: src => src.replace('async function clearSavedPages(span) {\n', 'async function clearSavedPages(span) {\n  Services.cookies.remove("127.0.0.1", TOKEN_COOKIE_NAME, "/", {});\n'),
            expect: 'token: clearSavedPages reaches the token cookie',
        },
        {
            name: 'new history store left out of the fan-out',
            mutate: src => src.replace('/* PB-SQL-V6-DDL-END */;', '/* PB-SQL-V6-DDL-END */;\nconst PLANTED_DDL = /* PB-SQL-PLANTED-DDL-START */ `CREATE TABLE IF NOT EXISTS visits_cache (\n  url         TEXT NOT NULL\n)` /* PB-SQL-PLANTED-DDL-END */;'),
            expect: 'missing target): visits_cache',
        },
        {
            name: 'open rows deleted by the closed-row target',
            mutate: src => src.replace('await conn.execute("DELETE FROM tabs WHERE closed_at IS NOT NULL AND closed_at >= :begin', 'await conn.execute("DELETE FROM tabs WHERE closed_at >= :begin'),
            expect: 'fan-out: tabs.closed_at: clearClosedTabRows has a DELETE without closed_at IS NOT NULL',
        },
        {
            name: 'places cleared through Sanitizer',
            mutate: src => src.replace('await lazy.PlacesUtils.history.removeVisitsByFilter({ beginDate: new Date(span.begin), endDate: new Date(span.end) });', 'await lazy.Sanitizer.sanitize(["history"], { range: [span.begin, span.end] });'),
            expect: 'fan-out: places: clearPlacesHistory does not call PlacesUtils.history.removeVisitsByFilter',
        },
        {
            name: 'surplus range',
            mutate: src => src.replace('  everything: () => 0,\n', '  everything: () => 0,\n  "last-24-hours": now => now - 24 * 60 * 60 * 1000,\n'),
            expect: 'range: CLEAR_HISTORY_RANGES is not exactly',
        },
        {
            name: 'last-2-hours spans one hour',
            mutate: src => src.replace('"last-2-hours": now => now - 2 * 60 * 60 * 1000,', '"last-2-hours": now => now - 60 * 60 * 1000,'),
            expect: 'range: last-2-hours does not begin 2 hour(s) before now',
        },
        {
            name: 'observer drops bookmark-moved',
            mutate: src => src.replace('"bookmark-removed", "bookmark-moved", "bookmark-url-changed"', '"bookmark-removed", "bookmark-url-changed"'),
            expect: 'observer: BOOKMARK_OBSERVER_EVENTS differs from stock chrome\'s list (missing: bookmark-moved',
        },
        {
            name: 'second observer install',
            mutate: src => src.replace('async function bookmarkPage(url, title, folderGuid) {\n', 'async function bookmarkPage(url, title, folderGuid) {\n  installBookmarkObserver();\n'),
            expect: 'observer: installBookmarkObserver() is called 2 times',
        },
        {
            name: 'install moved off setGroupSenderPort',
            mutate: src => src.replace('    if (groupSenderPort !== null) installBookmarkObserver();\n', '').replace('async function bookmarkPage(url, title, folderGuid) {\n', 'async function bookmarkPage(url, title, folderGuid) {\n  installBookmarkObserver();\n'),
            expect: 'observer: the install site is not setGroupSenderPort beside installTokenCookieStrip',
        },
    ];
    let failed = 0;
    const b = clean[BOUNDARY_REL];
    for (const c of cases) {
        const mutated = c.mutate(b);
        if (mutated === b) {
            console.error(`${NAME} --self-test: FAIL -- '${c.name}' did not modify the source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = check({ ...clean, [BOUNDARY_REL]: mutated });
        if (failures.some(f => f.includes(c.expect) && !f.startsWith(BROKEN))) {
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
    const sources = readSources();
    if (!sources[BOUNDARY_REL]) {
        console.error(`${NAME}: FAIL -- ${BROKEN} ${BOUNDARY_REL} is unreadable`);
        return 1;
    }
    const failures = check(sources);
    if (failures.length) {
        console.error(`${NAME}: FAIL`);
        failures.forEach(f => console.error(`  - ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- clearHistory clears every browsing-history store the boundary declares, never reaches the token cookie, offers exactly the five D-09 ranges, and the bookmark observer is installed once on stock chrome's event list`);
    return 0;
}

process.exit(main());
