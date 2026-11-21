#!/usr/bin/env node
// scripts/verify-orca-editor-router.mjs
//
// orca-editor-router (v1.7 audit-fix lane G4; items 65-WR-02, 65-WR-03, 65-WR-05): the
// behaviour of @powerbrowser/orca-workspace's OrcaEditorRouter and OrcaRootSync, run from the
// tree's sources (theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts and
// orca-root-sync.ts, transpiled with theia/node_modules/typescript; Theia's DI, shell and
// workspace are small fakes). Expectations are derived from the tree: the diff keys come from
// ORCA_EDITOR_ROUTES and the labels from ORCA_DIFF_RULE_LABELS.
//
// Clauses:
//  a. 65-WR-05: a record of every diff: key routes to a tab title that ends in one of
//     ORCA_DIFF_RULE_LABELS' plain-word values, never in the 'Changes' fallback, and that does
//     not carry the key's diff-source identifier.
//  b. 65-WR-02: a record whose open threw is not cached under its signature: after the root
//     sync applies (retry), it is opened again and maps to its URI.
//  c. 65-WR-03: a record whose widget PB disposed for a dropped root stays closed on an
//     unchanged snapshot and on a retry that does not name its root, and opens again on the
//     retry that does.
//  d. 65-WR-03: while the snapshot reports hydrated false, a persisted owned root missing from
//     the snapshot is neither removed nor has its editors closed; once hydrated is true it is.
//  e. 65-WR-02: the resolver's trusted roots include the latest snapshot's roots before its sync
//     runs, and the sync hands the router the roots it applied (retry).
//
// Tier: quick. SKIP when theia/node_modules/typescript is absent. --self-test plants each
// pre-fix fault in memory (source text edited before transpiling; no file written), requires
// red naming the drift, then re-runs the control green.
//
// Usage:
//   node scripts/verify-orca-editor-router.mjs
//   node scripts/verify-orca-editor-router.mjs --self-test

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-editor-router';
const SELF_REL = 'scripts/verify-orca-editor-router.mjs';
const TS_DIR = join(REPO_ROOT, 'theia', 'node_modules', 'typescript');
const EXT = 'theia/extensions/orca-workspace/src';
const REL = {
    protocol: `${EXT}/common/orca-git-protocol.ts`,
    routes: `${EXT}/browser/orca-editor-routes.ts`,
    rootSync: `${EXT}/browser/orca-root-sync.ts`,
};

let ts;

const transpile = (text) => ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true, emitDecoratorMetadata: false, esModuleInterop: false },
}).outputText;

function loadCjs(text, deps) {
    const mod = { exports: {} };
    const requireFn = (id) => {
        if (id in deps) return deps[id];
        throw new Error(`unexpected import ${id}`);
    };
    new Function('require', 'module', 'exports', transpile(text))(requireFn, mod, mod.exports);
    return mod.exports;
}

const decorator = () => () => undefined;
const stub = (extra = {}) => new Proxy(extra, { get: (t, p) => (p in t ? t[p] : decorator) });

/** A file: URI good enough for the root sync's fromFilePath / toString / path.fsPath round trip. */
class FakeUri {
    constructor(text) { this.text = text; }
    static fromFilePath(path) { return new FakeUri(`file://${path}`); }
    get path() { const text = this.text; return { fsPath: () => text.replace(/^file:\/\//, '') }; }
    toString() { return this.text; }
}

function load(texts) {
    const protocol = loadCjs(texts.protocol, {});
    const uriModule = { default: FakeUri };
    const routes = loadCjs(texts.routes, {
        '@theia/core/shared/inversify': stub(),
        '@theia/core/lib/browser': stub({ Saveable: { isDirty: () => false } }),
        '@theia/core/lib/browser/diff-uris': stub(),
        '@theia/core/lib/common/uri': uriModule,
        '@theia/editor/lib/browser': stub(),
        '@theia/filesystem/lib/browser/file-service': stub(),
        '@theia/scm/lib/browser/merge-editor/merge-editor': stub(),
        '@powerbrowser/orca-panes/lib/browser/orca-pane-bundle': stub(),
        '../common/orca-git-protocol': protocol,
        '@powerbrowser/modes/lib/browser/setups-service': stub(),
    });
    const rootSync = loadCjs(texts.rootSync, {
        '@theia/core/shared/inversify': stub(),
        '@theia/core/lib/browser': stub(),
        '@theia/core/lib/common/env-variables': stub(),
        '@theia/core/lib/common/uri': uriModule,
        '@theia/workspace/lib/browser/workspace-service': stub(),
        '@powerbrowser/orca-panes/lib/browser/orca-pane-bundle': stub(),
        '@powerbrowser/tab-uris/lib/browser/profile-storage': stub(),
        './orca-editor-routes': routes,
    });
    return { routes, rootSync };
}

const FILE = { tabId: 't', worktreeId: 'w1', worktreePath: '/w', filePath: '/w/src/app.ts', relativePath: 'src/app.ts', isPreview: false, active: false, local: true };
const OID = 'a'.repeat(40);

/** A router whose openRecord is a fake: ids in failing throw, the rest map to a fresh widget. */
function fakeRouter(Router) {
    const router = new Router();
    router.api = { activeWorktree: () => null, closePane: () => undefined };
    const failing = new Set();
    const opened = [];
    router.openRecord = async (file) => {
        opened.push(file.id);
        if (failing.has(file.id)) throw new Error('pb-orca-git URI outside the Orca worktree roots');
        const uri = `uri:${file.id}`;
        const widget = { id: file.id };
        router.byUri.set(uri, { widget, records: new Map() });
        return uri;
    };
    router.logOnce = () => undefined;
    const settle = async () => { await router.queue; await router.queue; };
    return { router, failing, opened, settle };
}

async function check(texts) {
    const fails = [];
    const notes = [];
    const savedWindow = globalThis.window;
    try {
        const { routes, rootSync } = load(texts);
        const table = routes.ORCA_EDITOR_ROUTES;
        const labels = routes.ORCA_DIFF_RULE_LABELS;
        if (!table || !labels) { fails.push(`${REL.routes} exports no ${!table ? 'ORCA_EDITOR_ROUTES' : 'ORCA_DIFF_RULE_LABELS'}`); return { fails, notes }; }

        // a. labels.
        const values = Object.values(labels);
        for (const v of values) if (!/^[A-Z][a-z]+(?: [A-Za-z][a-z]+)*$/.test(v)) fails.push(`the diff label ${JSON.stringify(v)} is not plain words`);
        const diffKeys = Object.keys(table).filter((k) => k.startsWith('diff:'));
        if (!diffKeys.length) fails.push('source moved: ORCA_EDITOR_ROUTES has no diff: key');
        for (const key of diffKeys) {
            const source = key.slice('diff:'.length);
            const file = { ...FILE, id: key, mode: 'diff', diffSource: source, branch: { mergeBase: OID, headOid: OID }, commit: { parentOid: OID, commitOid: OID }, combinedFirst: { relativePath: 'src/app.ts', area: 'unstaged' } };
            const r = routes.routeOpenFile(file, { headOid: OID });
            if (r.open !== 'diff') { fails.push(`${key} did not route to a diff: ${JSON.stringify(r)}`); continue; }
            const word = /\(([^)]*)\)$/.exec(r.label)?.[1];
            if (r.label.includes(source)) fails.push(`the diff tab title for ${key} shows Orca's diff-source identifier: ${JSON.stringify(r.label)}`);
            else if (!values.includes(word)) fails.push(`the diff tab title for ${key} is ${JSON.stringify(r.label)}, not a ORCA_DIFF_RULE_LABELS value`);
        }
        notes.push(`${diffKeys.length} diff keys labelled`);

        // b. a failed open is retried.
        if (typeof routes.OrcaEditorRouter?.prototype?.retry !== 'function') fails.push('OrcaEditorRouter has no retry()');
        else {
            const { router, failing, opened, settle } = fakeRouter(routes.OrcaEditorRouter);
            const a = { ...FILE, id: 'a', mode: 'edit' };
            failing.add('a');
            router.schedule([a]);
            await settle();
            failing.delete('a');
            router.schedule([a]);
            await settle();
            const beforeRetry = opened.length;
            router.retry(['/w']);
            await settle();
            if (opened.length === beforeRetry || router.known.get('a')?.uri !== 'uri:a') fails.push(`a record whose open failed is cached under its signature and never opened again after the roots arrive (opens: ${opened.join(',')})`);

            // c. a released record reopens only when its root returns.
            const b = { ...FILE, id: 'b', mode: 'edit', worktreePath: '/w2/', filePath: '/w2/x.ts' };
            router.schedule([a, b]);
            await settle();
            const mapping = router.byUri.get('uri:b');
            if (!mapping) fails.push('the fake router did not map record b');
            else {
                router.pbDisposing.add(mapping.widget);
                router.onWidgetDisposed(mapping.widget);
                const n0 = opened.filter((id) => id === 'b').length;
                router.schedule([a, b]);
                await settle();
                router.retry(['/w']);
                await settle();
                const n1 = opened.filter((id) => id === 'b').length;
                if (n1 !== n0) fails.push('a record PB closed for a dropped root opened again before its root returned');
                router.retry(['/w', '/w2']);
                await settle();
                const n2 = opened.filter((id) => id === 'b').length;
                if (n2 !== n1 + 1) fails.push('a record PB closed for a dropped root did not open again when its root returned');
            }
        }

        // d, e. hydration gating and the retry hand-off.
        globalThis.window = { setTimeout: () => 0, clearTimeout: () => undefined };
        const Sync = rootSync.OrcaRootSync;
        const make = () => {
            const store = new Map([['powerbrowser.orca.ownedRoots', ['file:///a', 'file:///b']], ['powerbrowser.orca.userRemovedRoots', []]]);
            let roots = ['file:///a', 'file:///b'];
            const removed = [];
            const closed = [];
            const retried = [];
            const sync = new Sync();
            sync.storage = { getData: async (k, d) => (store.has(k) ? store.get(k) : d), setData: async (k, v) => { store.set(k, v); }, keysWithPrefix: async () => [] };
            sync.workspace = {
                ready: Promise.resolve(),
                get roots() { return Promise.resolve(roots.map((r) => ({ resource: new FakeUri(r) }))); },
                tryGetRoots: () => roots,
                spliceRoots: async (_i, _d, ...add) => { roots = [...roots, ...add.map(String)]; },
                removeRoots: async (rm) => { const gone = rm.map(String); removed.push(...gone); roots = roots.filter((r) => !gone.includes(r)); },
                workspace: { isDirectory: false },
            };
            sync.router = { closeCleanUnder: (p) => closed.push(p), retry: (paths) => retried.push([...paths]) };
            return { sync, removed, closed, retried };
        };
        const snap = (paths, hydrated) => ({ worktrees: paths.map((p, i) => ({ id: `w${i}`, path: p, isArchived: false, local: true })), folders: [], ...(hydrated === undefined ? {} : { hydrated }) });
        const t = make();
        t.sync.onSnapshot(snap(['/a'], false));
        if (!t.sync.liveRootPaths().includes('/a')) fails.push("the resolver's trusted roots do not include the latest snapshot's roots before its sync runs");
        await t.sync.sync();
        if (t.removed.length || t.closed.includes('/b')) fails.push(`removed a root before hydration: a repository not yet listed lost its root (${t.removed.join(',')}) or its editors (${t.closed.join(',')})`);
        if (!t.retried.length || !t.retried.at(-1).includes('/a')) fails.push('the root sync did not hand the router the roots it applied (no retry)');
        t.sync.onSnapshot(snap(['/a'], true));
        await t.sync.sync();
        if (!t.removed.includes('file:///b') || !t.closed.includes('/b')) fails.push(`a root dropped after hydration was not removed (${t.removed.join(',') || 'none'}) and closed (${t.closed.join(',') || 'none'})`);
        const legacy = make();
        legacy.sync.onSnapshot(snap(['/a']));
        await legacy.sync.sync();
        if (!legacy.removed.includes('file:///b')) fails.push('a bundle that reports no hydration flag no longer applies drops (the fallback changed)');
    } catch (e) {
        fails.push(`the check could not run: ${e?.stack ?? e}`);
    } finally {
        globalThis.window = savedWindow;
    }
    return { fails, notes };
}

// ---------------------------------------------------------------- self-test

const PLANTS = [
    { name: 'label-shows-source', naming: "shows Orca's diff-source identifier", file: 'routes', edit: (s) => s.replace('(${ORCA_DIFF_RULE_LABELS[rule] ?? \'Changes\'})', '(${source})') },
    { name: 'failed-open-cached', naming: 'never opened again after the roots arrive', file: 'routes', edit: (s) => s.replace('this.known.set(file.id, failed ? { signature, uri, failed } : { signature, uri });', 'this.known.set(file.id, { signature, uri });') },
    { name: 'released-forgotten', naming: 'did not open again when its root returned', file: 'routes', edit: (s) => s.replace("this.known.set(id, { signature: this.known.get(id)?.signature ?? '', uri: undefined, released: true });", 'void id;') },
    { name: 'released-reopens-at-once', naming: 'opened again before its root returned', file: 'routes', edit: (s) => s.replace("this.known.set(id, { signature: this.known.get(id)?.signature ?? '', uri: undefined, released: true });", 'this.known.delete(id);') },
    { name: 'drops-before-hydration', naming: 'removed a root before hydration', file: 'rootSync', edit: (s) => s.replace('const effective = this.hydrated === false ?', 'const effective = false ?') },
    { name: 'no-retry-after-sync', naming: 'did not hand the router the roots it applied', file: 'rootSync', edit: (s) => s.replace('this.router.retry(this.liveRootPaths());', '') },
    { name: 'resolver-waits-for-sync', naming: "do not include the latest snapshot's roots", file: 'rootSync', edit: (s) => s.replace('...(this.reported ?? [])', '') },
];

async function runSelfTest(texts) {
    const control = await check(texts);
    if (control.fails.length) { console.error(`${NAME} self-test: FAIL -- the control is not green: ${control.fails.join(' | ')}`); return 1; }
    console.log(`${NAME} self-test: control green (${control.notes.join('; ')})`);
    let failures = 0;
    for (const p of PLANTS) {
        const planted = p.edit(texts[p.file]);
        if (planted === texts[p.file]) { console.error(`  FAIL ${p.name} -> the plant did not apply (its anchor text moved in ${REL[p.file]})`); failures++; continue; }
        const r = await check({ ...texts, [p.file]: planted });
        const text = r.fails.join('\n');
        if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; }
        else if (!text.includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++; }
        else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
    }
    const again = await check(texts);
    if (again.fails.length) { console.error(`  FAIL the control did not re-run green: ${again.fails.join(' | ')}`); failures++; }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} problem(s) across ${PLANTS.length} plants`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift; the control re-ran green`);
    return 0;
}

// ---------------------------------------------------------------- entry

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--self-test')) {
        console.error(`${NAME}: unknown argument ${args[0]} (usage: node ${SELF_REL} [--self-test])`);
        console.error(`Next step: run node ${SELF_REL} for the check or add --self-test for the planted-fault run.`);
        process.exit(2);
    }
    if (!existsSync(TS_DIR) || !statSync(TS_DIR).isDirectory()) { console.log(`${NAME}: SKIP -- theia/node_modules/typescript is absent; run the audited Theia install (docs/BUILD.md "Theia half")`); process.exit(0); }
    ts = createRequire(import.meta.url)(TS_DIR);
    const texts = Object.fromEntries(Object.entries(REL).map(([k, rel]) => [k, readFileSync(join(REPO_ROOT, rel), 'utf8')]));
    if (args[0] === '--self-test') process.exit(await runSelfTest(texts));
    const r = await check(texts);
    if (r.fails.length) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); process.exit(1); }
    console.log(`${NAME}: PASS -- diff titles use plain words; a failed open is retried after the root sync; a released record reopens only with its root; drops wait for hydration; the resolver trusts the latest snapshot (${r.notes.join('; ')})`);
    process.exit(0);
}
