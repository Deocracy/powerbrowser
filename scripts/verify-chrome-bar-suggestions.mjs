#!/usr/bin/env node
/**
 * GUI-06's suggestion-search gate (13-02): the chrome-bar prefix search over
 * `tabs.sqlite` returns at most the UI cap of recency-ordered rows with
 * wildcard input escaped, served through the first `TabQueryService`
 * consumer over the existing authenticated JSON-RPC channel.
 *
 * Two halves share this file:
 *
 *  STATIC -- the search statement text is DERIVED from
 *  `tab-query-service.ts` at check time (the `prepare(...)` literal inside
 *  `searchByPrefix`, unescaped from its TS quoting) and compared to the one
 *  EXPECTED const below: projection columns as SET EQUALITY (an addition is
 *  a surplus column nobody reviewed -- T-13-02-02; a removal is a shortfall
 *  that starves the dropdown), plus the escape clause, the recency
 *  ordering, and a bound (never interpolated) limit. An empty derivation --
 *  method or statement not found -- fails as a broken instrument, never
 *  passes as clean. The RPC half derives the path constant from the token
 *  source and requires both modules to import that const (never re-spell
 *  the literal), the impl to delegate to `searchByPrefix`, and both
 *  modules to bind statically in singleton scope.
 *
 *  LIVE -- the derived SQL statement (the tree's own text, not a
 *  reimplementation of it) runs against a scratch `tabs.sqlite` fixture in
 *  a mkdtemp directory outside the repo, using the stdlib `node:sqlite`
 *  engine. That engine choice is load-bearing, not incidental: the
 *  second-writer gate (`verify-sql-store-second-writer.mjs`, rule (c))
 *  exempts exactly the `DatabaseSync` shape in stage-disciplined scripts/
 *  instruments carrying the mkdtempSync marker -- a better-sqlite3
 *  `new Database(` open here would read as a second writer and fail the
 *  quick gate. LIKE/ESCAPE/LIMIT semantics are core SQLite, identical
 *  across both engines, so nothing is lost by the stdlib choice. Proven:
 *  prefix matching, literal `%`/`_` input matching literally only (no
 *  wildcard dump -- T-13-02-01), the UI cap honoured, recency newest-first.
 *  The only reimplemented logic
 *  is the three-replace LIKE escape, which the static half pins to the same
 *  three spellings in source; the --self-test's discrimination proof shows
 *  this live half CAN go red on an unescaped implementation.
 *
 * Activation routing (13-04, G-13-3 facet 1; retargeted by 14.1-02 /
 * GUI-02): committing a suggestion must navigate through its row URL on the
 * in-shell web-tab path. Derived from the chrome-bar browser sources at
 * check time: the widget imports the web tab from tab-uris and carries the
 * one routing line `await this.navigateWebTab(url);`; it never references
 * the stock-window command const and never re-spells the window-command id
 * string (only the GUI-01 palette command keeps that path); the commit path
 * references the row url field and never feeds the opaque row key into a
 * commit or open call (the React list key is the one sanctioned row.uri
 * use); no bare window.open literal and no search-engine host literal may
 * appear in any chrome-bar browser source. The banned hosts are derived at
 * check time from configuration.toml's [[search_engines]] url and
 * suggest_url and, when upstream/ is fetched, Firefox's own
 * search-config-v2.json, over a small floor of public hosts; a
 * case-insensitive query-param search pattern backs them. An empty derivation -- zero browser sources,
 * no widget source, or a missing routing anchor -- fails as a broken
 * instrument, never passes as clean. Zero routed call sites is a loud
 * failure: call sites exist, so there is no held-out STAGED pass.
 *
 *  Honestly --quick: reads text sources, runs a scratch fixture through the
 *  stdlib engine, touches no build, no browser, no display, no network.
 *
 * Usage:
 *   node scripts/verify-chrome-bar-suggestions.mjs
 *   node scripts/verify-chrome-bar-suggestions.mjs --self-test
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { resolveConfig } from './generate.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-chrome-bar-suggestions';

const QUERY_SERVICE_REL = 'theia/extensions/tab-uris/src/node/tab-query-service.ts';
const TOKEN_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-suggestion-service.ts';
const IMPL_REL = 'theia/extensions/chrome-bar/src/node/chrome-bar-suggestion-service-impl.ts';
const FRONTEND_MODULE_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts';
const BACKEND_MODULE_REL = 'theia/extensions/chrome-bar/src/node/chrome-bar-backend-module.ts';

/**
 * The declared search contract. The ONE hand-kept list in the static half:
 * editing it is how a deliberate contract change is made -- it shows up in
 * the diff for review. Everything it is compared against is derived at
 * check time.
 */
const EXPECTED = Object.freeze({
    projection: Object.freeze(['uri', 'url', 'title', 'last_active']),
    escapeClause: "ESCAPE '\\'",
    recencyOrder: 'ORDER BY last_active DESC',
    uiCap: 8,
});

function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return {
        surplus: [...a].filter(x => !e.has(x)),
        missing: [...e].filter(x => !a.has(x)),
    };
}

/** The `searchByPrefix` method body, derived from the reader source. */
function methodBodyOf(source) {
    const start = source.indexOf('searchByPrefix(prefix');
    if (start === -1) {
        return null;
    }
    const brace = source.indexOf('{', start);
    let depth = 0;
    for (let i = brace; i < source.length; i++) {
        if (source[i] === '{') {
            depth++;
        } else if (source[i] === '}') {
            depth--;
            if (depth === 0) {
                return source.slice(start, i + 1);
            }
        }
    }
    return null;
}

/**
 * The SQL statement text inside `prepare(...)`, with TS single-quote
 * escapes undone. Returns null when no statement derives -- the caller
 * reports a broken instrument, never a clean comparison against nothing.
 */
function searchSqlOf(source) {
    const body = methodBodyOf(source);
    if (!body) {
        return null;
    }
    const match = /\.prepare\(\s*'((?:[^'\\]|\\.)*)'\s*\)/.exec(body);
    if (!match) {
        return null;
    }
    return match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

function projectionOf(sql) {
    const match = /SELECT\s+([\s\S]*?)\s+FROM\b/i.exec(sql);
    if (!match) {
        return [];
    }
    return match[1].split(',').map(c => c.trim()).filter(Boolean);
}

/** @returns {string[]} failure messages -- empty means the static half holds. */
function checkStatic(sources) {
    const failures = [];
    const querySrc = sources[QUERY_SERVICE_REL] ?? '';

    const sql = searchSqlOf(querySrc);
    if (!sql) {
        failures.push(
            `${QUERY_SERVICE_REL}: derived ZERO search statements from searchByPrefix -- ` +
            `the method or its prepare() literal was not found, so this comparison proves nothing`
        );
        return failures;
    }

    const actualProjection = projectionOf(sql);
    if (actualProjection.length === 0) {
        failures.push(`${QUERY_SERVICE_REL}: derived ZERO projection columns -- the SELECT did not parse, so this comparison proves nothing`);
    } else {
        const { surplus, missing } = diff(actualProjection, EXPECTED.projection);
        if (surplus.length) {
            failures.push(`${QUERY_SERVICE_REL}: search projects columns NOT in the declared contract (T-13-02-02 -- never add a column without review): ${surplus.join(', ')}`);
        }
        if (missing.length) {
            failures.push(`${QUERY_SERVICE_REL}: declared contract columns are GONE from the search projection: ${missing.join(', ')}`);
        }
    }

    if (!sql.includes(EXPECTED.escapeClause)) {
        failures.push(`${QUERY_SERVICE_REL}: search carries no ${EXPECTED.escapeClause} clause -- metacharacter input degrades to a wildcard dump (T-13-02-01)`);
    }
    if (!sql.includes(EXPECTED.recencyOrder)) {
        failures.push(`${QUERY_SERVICE_REL}: search is not ${EXPECTED.recencyOrder} -- the recency-ordering contract (IN-02) drifted`);
    }
    if (/LIMIT\s+\d+/i.test(sql)) {
        failures.push(`${QUERY_SERVICE_REL}: search LIMIT is an interpolated literal -- the cap must be a bound parameter, never string-interpolated SQL`);
    } else if (!/LIMIT\s+(\?|:\w+)/i.test(sql)) {
        failures.push(`${QUERY_SERVICE_REL}: search carries no bound LIMIT -- the caller-supplied cap is unenforceable`);
    }
    if (!/url\s+LIKE\s+\S+\s+ESCAPE/i.test(sql) || !/title\s+LIKE\s+\S+\s+ESCAPE/i.test(sql)) {
        failures.push(`${QUERY_SERVICE_REL}: search must filter BOTH url and title under an escape clause -- one column lost its pattern guard`);
    }
    // The three-replace LIKE escape the live half's oracle mirrors. Pinned
    // by spelling so the mirror cannot drift silently from the source.
    for (const spelling of ['\\\\', '\\%', '\\_']) {
        if (!querySrc.includes(spelling)) {
            failures.push(`${QUERY_SERVICE_REL}: LIKE-escape routine lost the '${spelling}' neutralization -- typed text no longer matches literally`);
        }
    }

    // RPC half: the path is derived from the token source; every module
    // must carry that derived value, never a re-spelled copy.
    const tokenSrc = sources[TOKEN_REL] ?? '';
    const pathMatch = /CHROME_SUGGESTION_PATH\s*=\s*'([^']+)'/.exec(tokenSrc);
    if (!pathMatch) {
        failures.push(`${TOKEN_REL}: derived ZERO RPC paths -- CHROME_SUGGESTION_PATH was not found, so the channel comparison proves nothing`);
    } else {
        const rpcPath = pathMatch[1];
        // The proxy pair (backend handler + frontend proxy) must import the
        // shared path const -- never re-spell the literal (a copy drifts
        // silently, per the browser-window-command precedent). So the
        // assertion is two-sided: the symbol must be referenced, and no
        // `/services/` literal may appear where the const belongs.
        for (const rel of [BACKEND_MODULE_REL, FRONTEND_MODULE_REL]) {
            const src = sources[rel] ?? '';
            if (!src.includes('CHROME_SUGGESTION_PATH')) {
                failures.push(`${rel}: does not reference CHROME_SUGGESTION_PATH -- the proxy pair forked off the shared RPC path`);
            }
            const literal = /'\/services\/[^']*'/.exec(src);
            if (literal) {
                failures.push(`${rel}: re-spells the RPC path as ${literal[0]} instead of importing CHROME_SUGGESTION_PATH -- the copy drifts silently from '${rpcPath}'`);
            }
        }
        const backendSrc = sources[BACKEND_MODULE_REL] ?? '';
        if (!backendSrc.includes('JsonRpcConnectionHandler') || !backendSrc.includes('ConnectionHandler')) {
            failures.push(`${BACKEND_MODULE_REL}: does not bind the connection handler to the JSON-RPC handler -- the suggestion path left the authenticated channel`);
        }
        const frontendSrc = sources[FRONTEND_MODULE_REL] ?? '';
        if (!frontendSrc.includes('createProxy') || !frontendSrc.includes('inSingletonScope')) {
            failures.push(`${FRONTEND_MODULE_REL}: does not bind the interface to the websocket proxy in singleton scope`);
        }
    }
    const implSrc = sources[IMPL_REL] ?? '';
    if (!implSrc.includes('searchByPrefix') || !implSrc.includes('TabQueryService')) {
        failures.push(`${IMPL_REL}: does not delegate to TabQueryService.searchByPrefix -- the first-consumer link is broken`);
    }
    const capMatch = /CHROME_SUGGESTION_LIMIT\s*=\s*(\d+)/.exec(tokenSrc);
    if (!capMatch) {
        failures.push(`${TOKEN_REL}: derived ZERO UI caps -- CHROME_SUGGESTION_LIMIT was not found`);
    } else if (Number(capMatch[1]) !== EXPECTED.uiCap) {
        failures.push(`${TOKEN_REL}: UI cap is ${capMatch[1]} but the declared contract is ${EXPECTED.uiCap} visible rows`);
    }

    return failures;
}

function readSources() {
    const out = {};
    for (const rel of [QUERY_SERVICE_REL, TOKEN_REL, IMPL_REL, FRONTEND_MODULE_REL, BACKEND_MODULE_REL]) {
        out[rel] = readFileSync(join(REPO_ROOT, rel), 'utf8');
    }
    return out;
}

/** Script-side mirror of the source's three-replace LIKE escape + wrap. */
function escapeLikePattern(raw) {
    return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function loadEngine() {
    // Stdlib engine (see header: the second-writer gate's rule-(c)
    // carve-out). Required eagerly -- a missing engine is a broken
    // instrument (red), never a silent pass.
    try {
        return createRequire(import.meta.url)('node:sqlite').DatabaseSync;
    } catch (error) {
        throw new Error(`node:sqlite DatabaseSync unavailable (need node >= 22.5): ${error.message}`);
    }
}

/**
 * Scratch fixture: mirrors the writer's four-column shape
 * (`PowerBrowserAPI.sys.mjs` TABS_STORE_V1_DDL) with rows that discriminate
 * every live assertion -- shared-prefix rows for matching, literal `%`/`_`
 * rows for the escape proof, and more than the UI cap for the limit proof.
 */
function seedFixture(db) {
    db.exec(`CREATE TABLE tabs (
  uri         TEXT PRIMARY KEY CHECK(length(uri) > 0),
  url         TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  last_active INTEGER NOT NULL CHECK(last_active >= 0),
  closed_at   INTEGER NULL
)`);
    const insert = db.prepare('INSERT INTO tabs (uri, url, title, last_active) VALUES (?, ?, ?, ?)');
    const rows = [
        ['view:alpha-1', 'https://alpha.example/one', 'Alpha One', 100],
        ['view:alpha-2', 'https://alpha.example/two', 'Alpha Two', 300],
        ['view:alpha-3', 'https://alpha.example/three', 'Alpha Three', 200],
        ['view:beta-1', 'https://beta.example/one', 'Beta One', 400],
        ['view:pct-1', 'https://pct.example/100%coverage', 'Full percent title', 150],
        ['view:us-1', 'https://us.example/under_score', 'Under score title', 160],
        ['view:g1', 'https://g1.example/', 'Gamma', 90],
        ['view:g2', 'https://g2.example/', 'Delta', 80],
        ['view:g3', 'https://g3.example/', 'Epsilon', 70],
        ['view:g4', 'https://g4.example/', 'Zeta', 60],
    ];
    for (const row of rows) {
        insert.run(...row);
    }
    return rows.length;
}

/**
 * Runs the TREE'S OWN derived SQL (not a reimplementation of the
 * statement) with a caller-supplied escaping discipline, so the escape
 * proof below measures the statement + discipline pair honestly.
 */
function runDerivedQuery(DatabaseSync, sql, rawPrefix, limit, escape) {
    const dir = mkdtempSync(join(tmpdir(), 'chrome-bar-suggestions-'));
    try {
        const db = new DatabaseSync(join(dir, 'tabs.sqlite'));
        try {
            seedFixture(db);
            const pattern = `%${escape(rawPrefix)}%`;
            return db.prepare(sql).all(pattern, pattern, limit);
        } finally {
            db.close();
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/** @returns {string[]} failure messages -- empty means the live half holds. */
function checkLive() {
    const failures = [];
    let DatabaseSync;
    try {
        DatabaseSync = loadEngine();
    } catch (error) {
        failures.push(`fixture engine did not load, so the fixture proves nothing: ${error.message}`);
        return failures;
    }
    const sql = searchSqlOf(readFileSync(join(REPO_ROOT, QUERY_SERVICE_REL), 'utf8'));
    if (!sql) {
        failures.push('derived ZERO search statements -- the live half has no statement to execute');
        return failures;
    }
    const tokenSrc = readFileSync(join(REPO_ROOT, TOKEN_REL), 'utf8');
    const cap = Number(/CHROME_SUGGESTION_LIMIT\s*=\s*(\d+)/.exec(tokenSrc)?.[1] ?? EXPECTED.uiCap);

    // Prefix matching: only alpha rows, none of the others.
    const alpha = runDerivedQuery(DatabaseSync, sql, 'alpha', cap, escapeLikePattern);
    const alphaUris = alpha.map(r => r.uri).sort();
    const wantAlpha = ['view:alpha-1', 'view:alpha-2', 'view:alpha-3'];
    if (JSON.stringify(alphaUris) !== JSON.stringify(wantAlpha)) {
        failures.push(`prefix 'alpha' returned [${alphaUris.join(', ')}] -- want exactly [${wantAlpha.join(', ')}]`);
    }

    // Metacharacters match literally only: '%' hits the one literal-% row,
    // '_' hits rows carrying a literal underscore -- never the full table.
    const pct = runDerivedQuery(DatabaseSync, sql, '%', cap, escapeLikePattern);
    if (pct.length !== 1 || pct[0].uri !== 'view:pct-1') {
        failures.push(`input '%' returned ${pct.length} rows -- want exactly the 1 literal-% row, never a wildcard dump`);
    }
    const us = runDerivedQuery(DatabaseSync, sql, '_', cap, escapeLikePattern);
    if (!us.length || us.some(r => !(`${r.url}${r.title}`.includes('_')))) {
        failures.push(`input '_' returned ${us.length} rows with a non-literal match -- '_' must match literally only`);
    }

    // UI cap honoured: '' matches all 10 rows, the derived cap lets 8 through.
    const all = runDerivedQuery(DatabaseSync, sql, '', cap, escapeLikePattern);
    if (all.length !== cap) {
        failures.push(`empty prefix with limit ${cap} returned ${all.length} rows -- want exactly the UI cap`);
    }

    // Recency: newest first across the whole result.
    const ordered = all.every((row, i) => i === 0 || all[i - 1].last_active >= row.last_active);
    if (!ordered) {
        failures.push('results are not newest-first by last_active -- the recency-ordering contract drifted');
    }
    return failures;
}

/**
 * Activation routing (13-04, G-13-3 facet 1; GUI-02 retarget): a committed
 * suggestion must navigate through its row URL on the in-shell web-tab path
 * -- never the opaque row key (the blank-panel mint), never the stock-window
 * command (imported or re-spelled), never a bare window.open bypass, never
 * an invented search host.
 *
 * Derived from the chrome-bar browser sources at check time. The widget
 * half pins the commit routing; the every-file half pins the two bypasses
 * that could hide in any browser source. The React list key
 * (`key={row.uri}`) is the one sanctioned row.uri use -- it is stripped
 * before the key-feed assertion, so any surviving row.uri names a commit
 * or open call fed the opaque key.
 */
const CHROME_BAR_BROWSER_DIR = 'theia/extensions/chrome-bar/src/browser';
const CHROME_BAR_WIDGET_FILE = 'address-bar/address-bar.tsx';
const WINDOW_COMMAND_ID = 'powerbrowser.open-browser-window';

/**
 * The negated search-addressability floor (T-13-04-03): public engine hosts
 * banned even in a tree with no upstream/ checkout. The engines the product
 * actually ships are derived by engineHosts() below, never listed here.
 */
const ENGINE_HOSTS_FLOOR = Object.freeze([
    'google.com',
    'bing.com',
    'duckduckgo.com',
    'search.yahoo.com',
    'yandex.com',
    'yandex.ru',
    'startpage.com',
    'ecosia.org',
    'search.brave.com',
    'mojeek.com',
]);
const SEARCH_QUERY_PATTERN = /[?&](q|query|search)=|search\?/i;
const UPSTREAM_SEARCH_CONFIG_REL = 'upstream/services/settings/dumps/main/search-config-v2.json';

/** The template's host, or null; `{searchTerms}` is not valid URL text, so it is filled first. */
function templateHost(template) {
    try {
        return new URL(String(template).replace(/\{searchTerms\}/g, 'x')).host || null;
    } catch {
        return null;
    }
}

/**
 * The banned engine hosts, derived from the tree: every configured engine's
 * url and suggest_url host, every search base host in upstream's shipped
 * engine config when upstream/ is present, and the floor. A configured
 * template with no host is a broken instrument, never a smaller ban.
 */
function engineHosts(root = REPO_ROOT) {
    const hosts = new Set(ENGINE_HOSTS_FLOOR);
    const failures = [];
    const configured = [];
    const { failures: resolveFailures, config } = resolveConfig(join(root, 'configuration.toml'), undefined);
    for (const f of resolveFailures) {
        failures.push(`configuration.toml did not resolve, so the configured engine hosts cannot be derived: ${f}`);
    }
    for (const engine of config?.search_engines ?? []) {
        for (const template of [engine?.url, engine?.suggest_url].filter(t => t !== undefined)) {
            const host = templateHost(template);
            if (host) {
                configured.push({ host, template: String(template) });
                hosts.add(host);
            } else {
                failures.push(`configuration.toml: the [[search_engines]] template ${JSON.stringify(template)} has no host, so its engine cannot be banned (broken instrument)`);
            }
        }
    }
    let upstream = null;
    try {
        upstream = JSON.parse(readFileSync(join(root, UPSTREAM_SEARCH_CONFIG_REL), 'utf8'));
    } catch {
        // No upstream/ checkout: the configured hosts and the floor still hold.
    }
    const walk = node => {
        if (node && typeof node === 'object') {
            for (const [key, value] of Object.entries(node)) {
                const host = key === 'base' && typeof value === 'string' ? templateHost(value) : null;
                if (host) {
                    hosts.add(host);
                } else {
                    walk(value);
                }
            }
        }
    };
    walk(upstream?.data);
    return { hosts: [...hosts], configured, failures };
}

const ENGINE_HOSTS = engineHosts();

function checkActivationSources(entries) {
    const failures = [];
    const routed = [];
    const widget = entries.find(entry => entry.file === CHROME_BAR_WIDGET_FILE);
    if (!widget || !widget.src) {
        failures.push(
            `${CHROME_BAR_BROWSER_DIR}/${CHROME_BAR_WIDGET_FILE}: derived ZERO widget source -- ` +
            `the commit routing cannot be derived, so this comparison proves nothing`
        );
    } else {
        const rel = `${CHROME_BAR_BROWSER_DIR}/${CHROME_BAR_WIDGET_FILE}`;
        const src = widget.src;
        if (!src.includes("from '@powerbrowser/tab-uris/lib/browser/web-tab'")) {
            failures.push(`${rel}: does not import the web tab from tab-uris -- suggestion activation must route through the in-shell web tab imported from @powerbrowser/tab-uris/lib/browser/web-tab`);
        }
        if (src.includes('OPEN_BROWSER_WINDOW_COMMAND_ID')) {
            failures.push(`${rel}: references OPEN_BROWSER_WINDOW_COMMAND_ID -- the chrome bar must not reach the stock-window command; only the GUI-01 palette command keeps that path`);
        }
        if (!src.includes('await this.navigateWebTab(url);')) {
            failures.push(`${rel}: derived ZERO web-tab routing lines -- the anchor 'await this.navigateWebTab(url);' is absent, so the routing cannot be asserted (broken instrument, never a clean pass)`);
        }
        if (src.includes(`'${WINDOW_COMMAND_ID}'`)) {
            failures.push(`${rel}: re-spells the window-command id '${WINDOW_COMMAND_ID}' instead of importing the exported const -- the copy drifts silently from the tab-uris registration`);
        }
        if (!/row\.url/.test(src)) {
            failures.push(`${rel}: commit path does not reference the row url field -- suggestion activation must navigate through row.url, never the opaque row key`);
        } else {
            routed.push(rel);
        }
    }
    for (const { file, src } of entries) {
        const rel = `${CHROME_BAR_BROWSER_DIR}/${file}`;
        const dekeyed = src.split('key={row.uri}').join('');
        if (/row\.uri/.test(dekeyed)) {
            failures.push(`${rel}: feeds the opaque row key row.uri into a commit or open call -- the blank-panel mint recurrence (T-13-04-02); commit row.url instead`);
        }
        if (/window\.open\s*\(/.test(src)) {
            failures.push(`${rel}: bare window.open bypasses the stock-window command -- suggestion activation must navigate through the imported command const`);
        }
        for (const host of ENGINE_HOSTS.hosts) {
            if (src.includes(host)) {
                failures.push(`${rel}: invents search addressability with the engine host literal '${host}' -- a search URL is minted only by chrome's resolveTypedAddress (T-13-04-03)`);
            }
        }
        if (SEARCH_QUERY_PATTERN.test(src)) {
            failures.push(`${rel}: invents search addressability with a query-param search pattern -- a search URL is minted only by chrome's resolveTypedAddress (T-13-04-03)`);
        }
    }
    // No STAGED branch: call sites exist, so zero routed call sites is a
    // loud failure, never a held-out pass.
    if (routed.length === 0) {
        failures.push(
            `${CHROME_BAR_BROWSER_DIR}/${CHROME_BAR_WIDGET_FILE}: derived ZERO routed commit call sites -- ` +
            `no file routes a suggestion row through row.url, so activation cannot navigate`
        );
    }
    return { failures, routed };
}

/** Every .ts/.tsx under the chrome-bar browser dir, recursively (30-01: the pill is under address-bar/), keyed relative to it. */
function chromeBarSourceEntries() {
    let files;
    try {
        files = readdirSync(join(REPO_ROOT, CHROME_BAR_BROWSER_DIR), { recursive: true })
            .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
            .map(f => f.split(sep).join('/'));
    } catch {
        files = [];
    }
    return files.map(file => ({ file, src: readFileSync(join(REPO_ROOT, CHROME_BAR_BROWSER_DIR, file), 'utf8') }));
}

function checkActivation() {
    const entries = chromeBarSourceEntries();
    if (entries.length === 0) {
        return {
            failures: [`${CHROME_BAR_BROWSER_DIR}: derived ZERO chrome-bar browser sources -- the activation routing cannot be derived, so this comparison proves nothing`],
            routed: [],
            sources: 0,
        };
    }
    return { ...checkActivationSources(entries), sources: entries.length };
}

function main() {
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const failures = [...checkStatic(readSources()), ...checkLive(), ...ENGINE_HOSTS.failures];
    const activation = checkActivation();
    failures.push(...activation.failures);
    if (failures.length) {
        console.error(`${NAME}: FAIL`);
        failures.forEach(f => console.error(`  - ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- search shape matches the declared contract and fixture semantics hold (prefix, escape, cap ${EXPECTED.uiCap}, recency); activation routes row URLs through the in-shell web-tab path (${activation.routed.length} file(s); ${activation.sources} chrome-bar source(s) read)`);
    return 0;
}

function selfTest() {
    const clean = readSources();
    const baseline = [...checkStatic(clean), ...checkLive()];
    if (baseline.length !== 0) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }

    // Plants operate on the searchByPrefix method body where the assertion
    // reads: the plant is scoped to that body (the only search statement
    // the check derives), so it changes what the check derives, not just
    // the file.
    const searchBody = methodBodyOf(clean[QUERY_SERVICE_REL]);
    if (!searchBody) {
        console.error(`${NAME} --self-test: FAIL -- searchByPrefix body did not derive on the clean tree; the plants below would be meaningless`);
        return 1;
    }
    const withScopedBody = mutatedBody => clean[QUERY_SERVICE_REL].split(searchBody).join(mutatedBody);
    const cases = [
        {
            name: 'planted unescaped-wildcard',
            // Two scopes, one plant: the escape clause lives in the method
            // body (source spelling `ESCAPE \'\\\'` per the od ground
            // truth), while the percent-neutralizer lives in the
            // module-level routine -- scoping either step to the wrong
            // text plants nothing. A step that does not land returns the
            // original source so the plant-landed assertion below reports
            // the drifted anchor instead of a vacuous green.
            mutate: fullSrc => {
                const neutered = fullSrc.replace(/\.replace\(\/%\/g, '\\\\%'\)/, ".replace(/%/g, '%')");
                if (neutered === fullSrc) {
                    return fullSrc;
                }
                const target = methodBodyOf(neutered);
                const stripped = target.replace(/ESCAPE \\'\\\\\\'/g, '');
                if (stripped === target) {
                    return fullSrc;
                }
                return neutered.split(target).join(stripped);
            },
            expect: 'escape',
        },
        {
            name: 'planted limit breach',
            mutate: () => withScopedBody(searchBody.replace(/LIMIT \?/, 'LIMIT 100')),
            expect: 'LIMIT',
        },
    ];

    let failed = 0;
    for (const testCase of cases) {
        const mutated = { ...clean, [QUERY_SERVICE_REL]: testCase.mutate(clean[QUERY_SERVICE_REL]) };
        // A planted fault that does not change the source at all would make
        // the case vacuous -- assert the mutation actually landed.
        if (mutated[QUERY_SERVICE_REL] === clean[QUERY_SERVICE_REL]) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not modify the source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkStatic(mutated);
        if (!failures.some(f => f.includes(testCase.expect))) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not go red naming '${testCase.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed++;
        } else {
            console.log(`  ok  ${testCase.name} -> red, naming '${testCase.expect}'`);
        }
    }

    // Fixture-discrimination proof: the same derived statement with the
    // escape discipline REMOVED must dump on '%' input -- otherwise the
    // live half could never catch an unescaped implementation.
    try {
        const DatabaseSync = loadEngine();
        const sql = searchSqlOf(clean[QUERY_SERVICE_REL]);
        const dumped = runDerivedQuery(DatabaseSync, sql, '%', EXPECTED.uiCap, raw => raw);
        if (dumped.length <= 1) {
            console.error(`${NAME} --self-test: FAIL -- the unescaped oracle returned ${dumped.length} rows on '%' input; the fixture cannot discriminate an unescaped implementation`);
            failed++;
        } else {
            console.log(`  ok  fixture discrimination -> unescaped oracle dumps ${dumped.length} rows on '%' (escaped oracle returns 1)`);
        }
    } catch (error) {
        console.error(`${NAME} --self-test: FAIL -- discrimination proof errored: ${error.message}`);
        failed++;
    }

    // Activation-routing proof (13-04): the live tree is routed-green,
    // and four plants around the new contract each go red naming the
    // drift. Plants mutate the live widget source in memory; a plant that
    // does not land is reported as a drifted anchor, never a vacuous
    // green.
    const liveActivation = checkActivation();
    if (liveActivation.failures.length !== 0 || liveActivation.routed.length === 0) {
        console.error(`${NAME} --self-test: FAIL -- the live tree is not routed-green (failures: ${liveActivation.failures.join(' | ') || 'none'}, routed: ${liveActivation.routed.length})`);
        failed++;
    } else {
        console.log(`  ok  live tree activation -> routed-green (${liveActivation.routed.length} file(s))`);
    }

    const widgetRel = `${CHROME_BAR_BROWSER_DIR}/${CHROME_BAR_WIDGET_FILE}`;
    const widgetSrc = readFileSync(join(REPO_ROOT, widgetRel), 'utf8');
    const otherEntries = chromeBarSourceEntries().filter(entry => entry.file !== CHROME_BAR_WIDGET_FILE);
    const activationCases = [
        {
            name: 'planted row-key-fed commit',
            mutate: src => src.replace(": this.commitRow(row);", ": this.commitRow(row.uri);"),
            expect: 'row.uri',
        },
        {
            name: 'planted re-spelled window-command id',
            mutate: src => src.replace(
                'await this.navigateWebTab(url);',
                `await this.commands.executeCommand('${WINDOW_COMMAND_ID}', url);`
            ),
            expect: WINDOW_COMMAND_ID,
        },
        {
            name: 'planted engine-host literal',
            mutate: src => src.replace(
                'resolved = await this.store.resolveTypedAddress(text, engineName, canonize, engine !== undefined);',
                'resolved = { kind: \'search\', url: `https://duckduckgo.com/html/?q=${text}` };'
            ),
            expect: 'duckduckgo.com',
        },
        // Each configured template hardcoded in the widget: its derived host, not the floor, must name it.
        ...ENGINE_HOSTS.configured.map(({ host, template }) => ({
            name: `planted configured template ${template}`,
            mutate: src => src.replace(
                'resolved = await this.store.resolveTypedAddress(text, engineName, canonize, engine !== undefined);',
                `resolved = { kind: 'search', url: \`${template.replace(/\{searchTerms\}/g, '${text}')}\` };`
            ),
            expect: `'${host}'`,
        })),
        {
            name: 'planted Special:Search template on an unlisted host',
            mutate: src => src.replace(
                'resolved = await this.store.resolveTypedAddress(text, engineName, canonize, engine !== undefined);',
                'resolved = { kind: \'search\', url: `https://wiki.example.net/wiki/Special:Search?search=${text}` };'
            ),
            expect: 'query-param search pattern',
        },
        {
            name: 'planted bare window.open',
            mutate: src => src.replace(
                'await this.navigateWebTab(url);',
                'window.open(url, \'_blank\');'
            ),
            expect: 'window.open',
        },
    ];
    for (const testCase of activationCases) {
        const mutatedSrc = testCase.mutate(widgetSrc);
        if (mutatedSrc === widgetSrc) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not modify the source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkActivationSources([{ file: CHROME_BAR_WIDGET_FILE, src: mutatedSrc }, ...otherEntries]).failures;
        if (!failures.some(f => f.includes(testCase.expect))) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not go red naming '${testCase.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed++;
        } else {
            console.log(`  ok  ${testCase.name} -> red, naming '${testCase.expect}'`);
        }
    }

    // Nested-file plant (30-01, Pitfall 2): a key-fed commit in a file under a
    // subdirectory must go red naming that file, so the recursive scan is proven.
    const nestedFile = 'nested/planted.tsx';
    const nestedFailures = checkActivationSources([
        { file: CHROME_BAR_WIDGET_FILE, src: widgetSrc },
        ...otherEntries,
        { file: nestedFile, src: 'const planted = () => this.commitRow(row.uri);\n' },
    ]).failures;
    if (!nestedFailures.some(f => f.includes(`${CHROME_BAR_BROWSER_DIR}/${nestedFile}`) && f.includes('row.uri'))) {
        console.error(`${NAME} --self-test: FAIL -- 'planted row-key-fed commit in ${nestedFile}' did not go red naming '${nestedFile}' and 'row.uri'; got: ${nestedFailures.join(' | ') || '(no failures at all)'}`);
        failed++;
    } else {
        console.log(`  ok  planted row-key-fed commit in ${nestedFile} -> red, naming 'row.uri'`);
    }

    if (failed) {
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- ${cases.length} planted faults all went red plus the fixture-discrimination and activation-backstop proofs`);
    return 0;
}

process.exit(main());
