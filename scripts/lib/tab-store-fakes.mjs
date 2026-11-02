// scripts/lib/tab-store-fakes.mjs
//
// The Firefox side of scripts/verify-tab-store-offline.mjs: the globals and
// lazy modules powerbrowser/shell/PowerBrowserAPI.sys.mjs reaches (Services,
// ChromeUtils, Cc/Ci, IOUtils, and the Sqlite, SessionStore and
// PrivateBrowsingUtils modules), faked so the real writer runs in node. The
// connection is node:sqlite over a check's own stage files only, and it
// enforces the rules Sqlite.sys.mjs and mozStorage enforce that node:sqlite
// does not (mozRules below). A helper, like tab-store-fixtures.mjs beside it.

import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { REPO_ROOT } from './tab-store-fixtures.mjs';

const API = join(REPO_ROOT, 'powerbrowser/shell/PowerBrowserAPI.sys.mjs');

// Sqlite.sys.mjs's isInvalidBoundLikeQuery regex (upstream/toolkit/modules/
// Sqlite.sys.mjs:43), pinned so the check runs without upstream/; where
// upstream/ is present the pin is compared with it and a drift fails.
export const LIKE_SQL_REGEX = /\bLIKE\b\s(?![@:?])/i;

// ---- fakes --------------------------------------------------------------------
export const env = { profile: '', state: { windows: [] }, windows: [], blockers: [], blockerThrows: 0, restored: null, conns: [] };
const customValues = new WeakMap();
const logged = [];

function mozRules(sql, params) {
    // Sqlite.sys.mjs execute()/executeCached() refuse the statement outright.
    if (LIKE_SQL_REGEX.test(sql)) {
        throw new Error('Please enter a LIKE clause with bindings');
    }
    // Sqlite.sys.mjs _bindParam: bindByName per key; mozStorage rejects a name
    // the statement lacks, and an array needs carray().
    for (const [key, value] of Object.entries(params || {})) {
        if (!new RegExp(`:${key}\\b`).test(sql)) {
            throw new Error(`bindByName: no parameter :${key} in statement`);
        }
        if (Array.isArray(value)) {
            throw new Error('Array parameters require carray()');
        }
        if (value === undefined) {
            throw new Error(`bindByName: undefined value for :${key}`);
        }
    }
}

function wrapRow(obj) {
    const values = Object.values(obj);
    return { getString: i => values[i], getResultByIndex: i => values[i], getResultByName: n => obj[n] };
}

function openConnection(path) {
    const db = new DatabaseSync(path);
    let closed = false;
    let inTransaction = false;
    const run = (sql, params) => {
        if (closed) {
            throw new Error('Connection is closed');
        }
        mozRules(sql, params);
        const statement = db.prepare(sql);
        return (params ? statement.all(params) : statement.all()).map(wrapRow);
    };
    const conn = {
        isClosed: () => closed,
        async execute(sql, params) { return run(sql, params); },
        async executeCached(sql, params) { return run(sql, params); },
        async executeTransaction(fn) {
            // Sqlite.sys.mjs queues a nested executeTransaction behind the outer one: a deadlock (CR-02).
            if (inTransaction) {
                throw new Error('nested executeTransaction');
            }
            inTransaction = true;
            db.exec('BEGIN');
            try {
                await fn();
                db.exec('COMMIT');
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            } finally {
                inTransaction = false;
            }
        },
        async getSchemaVersion() { return db.prepare('PRAGMA user_version').get().user_version; },
        async setSchemaVersion(v) { db.exec(`PRAGMA user_version = ${Number(v)}`); },
        async tableExists(n) { return !!db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(n); },
        async indexExists(n) { return !!db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'index' AND name = ?").get(n); },
        // OpenedConnection.backup: a page-level copy, which a tampered page fails.
        async backup(dest) { db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`); },
        async close() {
            if (!closed) {
                db.close();
                closed = true;
            }
        },
    };
    env.conns.push(conn);
    return conn;
}

const Sqlite = {
    async openConnection({ path }) { return openConnection(join(env.profile, path)); },
    shutdown: {
        addBlocker(name, fn) {
            if (env.blockerThrows > 0) {
                env.blockerThrows -= 1;
                throw new Error('Phase "profile-before-change" is finished, it is too late to register');
            }
            env.blockers.push({ name, fn });
        },
    },
};
export const SessionStore = {
    getBrowserState: () => JSON.stringify(env.state),
    getCustomTabValue: (tab, key) => (customValues.get(tab) || {})[key] || '',
    setCustomTabValue: (tab, key, value) => {
        if (typeof value !== 'string') {
            throw new TypeError('setCustomTabValue only accepts string values');
        }
        customValues.set(tab, { ...(customValues.get(tab) || {}), [key]: value });
    },
    moveCustomTabValue: (from, to) => {
        customValues.set(to, customValues.get(from));
        customValues.delete(from);
    },
    get promiseAllWindowsRestored() { return env.restored.promise; },
};
globalThis.dump = () => {};
globalThis.ChromeUtils = {
    defineESModuleGetters(obj, map) {
        const fakes = { Sqlite, SessionStore, PrivateBrowsingUtils: { isWindowPrivate: w => !!(w && w.private) } };
        for (const key of Object.keys(map)) {
            Object.defineProperty(obj, key, { get: () => fakes[key] ?? {} });
        }
    },
    generateQI: () => () => {},
};
globalThis.Services = {
    dirsvc: { get: () => ({ path: env.profile }) },
    io: {
        newURI: spec => {
            const url = new URL(spec);
            return { schemeIs: s => url.protocol === `${s}:`, host: url.hostname };
        },
    },
    wm: {
        getEnumerator: () => {
            const list = [...env.windows];
            return { hasMoreElements: () => list.length > 0, getNext: () => list.shift() };
        },
    },
    obs: { addObserver() {}, removeObserver() {} },
    // setGroupSenderPort writes extensions.webRequest.hiddenOrigins on the default branch (plan 38-06).
    prefs: { getDefaultBranch: () => ({ setStringPref() {} }) },
};
globalThis.Ci = { nsIFile: {}, nsITimer: { TYPE_ONE_SHOT: 0 } };
globalThis.Cc = {
    '@mozilla.org/timer;1': {
        createInstance: () => { let handle = null; return { initWithCallback: (cb, ms) => { handle = setTimeout(() => cb.notify(), ms); }, cancel() { if (handle !== null) { clearTimeout(handle); handle = null; } } }; },
    },
};
globalThis.IOUtils = {
    async getChildren(dir) { return readdirSync(dir).map(name => join(dir, name)); },
    async remove(path, { ignoreAbsent = false } = {}) {
        if (!existsSync(path)) {
            if (ignoreAbsent) {
                return;
            }
            throw new Error(`absent: ${path}`);
        }
        rmSync(path);
    },
    async copy(from, to) { copyFileSync(from, to); },
};
// PowerBrowserAPI.log writes through console[level]; a check prints through `report`.
export const report = console.error.bind(console);
for (const level of ['warn', 'error', 'info']) {
    console[level] = (...args) => logged.push(args.join(' '));
}

let loads = 0;
/** A fresh load of the writer (or of `source`, a planted copy) against a clean fake world. */
export async function freshApi(profile, source = API) {
    env.profile = profile;
    env.state = { windows: [] };
    env.windows = [];
    env.blockers = [];
    env.restored = Promise.withResolvers();
    const mod = await import(`${pathToFileURL(source).href}?load=${(loads += 1)}`);
    return mod.PowerBrowserAPI;
}
export async function closeAll() {
    for (const conn of env.conns.splice(0)) {
        await conn.close();
    }
}
