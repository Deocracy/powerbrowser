#!/usr/bin/env node
// scripts/verify-orca-workspace-live.mjs
//
// orca-workspace-live (Phase 65, TAB-05; P65-01..P65-07, P65-21, P65-27; CA-01..CA-06, CA-15;
// ROADMAP Phase 65 criterion 1): files and diffs Orca opens open in Theia's editor, diff editor
// and merge editor, never in Orca's own editor, and every local Orca worktree is a Theia
// workspace folder kept in sync with Orca's store.
//
// Live, tier full, run on the merged, wired and built tree after orca-pane-css-live. A row started without
// PB_LIVE_LOCK_HELD=1 takes <git common dir>/pb-live.lock itself (lib/live-lock-reexec.mjs) before it launches
// anything; every inherited ORCA_* is unset. Exit 77 with one "SKIP -- <reason>" line (SKIP-PROTOCOL.md) when no
// built PowerBrowser, no built orca/ (orcad and the pane bundle), no built Theia app, or lane p65-01's bundle API is
// absent; a FAIL when the built app does not carry @powerbrowser/orca-workspace.
//
// Cleanup: every process this row started (PowerBrowser's orcad and its terminal daemon) is killed, and every
// directory it made is removed, when a clause throws and when a signal ends the run (lib/live-teardown.mjs). The
// worktrees it creates through Orca go to Orca's workspaceDir under the scratch HOME the launched programs run
// with (firefox-bidi.mjs liveEnv), never the real home: each one's path is checked against that HOME and removed.
//
// One PowerBrowser session on a fresh scratch profile with its own orcad, built as
// scripts/lib/orca-tabs-live.mjs's withOrcaTabsSession builds it (the three prefs, the built CLI
// from orcad's effective root, never this session's ORCA_* values), except that the scratch
// repository is added by this script after the reload detector is installed, because clause (e)
// measures that first add. The bundle is reached only through C64-1's boot handle.
// Clauses (output names clauses and counts only; never the offer, a token or orcad's ready line):
//  e. first add: no reload (a page marker survives), <fixed workspace URI>:perspective-layouts
//     deep-equals the old _global_:perspective-layouts, no Untitled file in the workspaces dir;
//  a. orca file open: a Theia editor on the file: URI within 1 s;
//  b. diffs (unstaged, staged, branch, commit and combined-uncommitted through the bundle's
//     check-only openPane: headless orcad refuses the CLI's file open-changed, it has no app window)
//     and conflicts (both_modified and deleted_by_them through
//     openPane's JSON detail): each diff side's text equals git cat-file blob of its CA-03 spec
//     (the working file for the unstaged right side), the merge editor's sides equal stages 1, 2
//     and 3, and deleted_by_them opens the working file in the editor;
//  c. positive control first: Orca's Monaco root selector (Monaco's own root class; Orca's editor
//     imports @monaco-editor/react, checked in the source) matches inside the Theia editor of (a);
//     then it matches nothing inside any Orca pane root ([data-pb-orca-pane]);
//  d. roots: the PB-owned roots equal the store's local non-archived worktree paths as a set; a
//     created worktree becomes a root; removing it removes the root, closes a clean editor under it
//     and keeps a dirty one; a root added through Theia survives the next store event; a PB-owned
//     root removed through Theia stays removed after the next store event;
//  f. quit returns with the process exited, and still no Untitled workspace file.
//
// --self-test: the pure comparators on fixtures (a wrong-revision text, a missing root, an extra
// root, a dirty editor closed, a key left behind, an Untitled file present, a reload), each red
// naming it, plus planRoots, noteUserRemovals and planMigration from orca-root-sync.ts transpiled in
// memory against the plan's behaviour list.
//
// Usage:
//   node scripts/verify-orca-workspace-live.mjs
//   node scripts/verify-orca-workspace-live.mjs --self-test

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveEnv } from './lib/firefox-bidi.mjs';
import { FIXTURE_GIT_ARGS, fixtureGitEnv } from './lib/orca-pane-harness.mjs';
import { takeLiveLock } from './lib/live-lock-reexec.mjs';
import { registerTeardown } from './lib/live-teardown.mjs';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-workspace-live';
const SELF_REL = 'scripts/verify-orca-workspace-live.mjs';
const TS_DIR = join(REPO_ROOT, 'theia', 'node_modules', 'typescript');
const ROOT_SYNC_REL = 'theia/extensions/orca-workspace/src/browser/orca-root-sync.ts';
const ENTRY_REL = 'orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx';
const ORCA_MONACO_REL = 'orca/src/renderer/src/components/editor/MonacoEditor.tsx';
const SERVER_REL = 'theia/applications/browser/src-gen/backend/server.js';
const FIXED_FILE = 'powerbrowser.theia-workspace';
/** Monaco's own root class: the editor Orca imports from @monaco-editor/react renders under it. */
const MONACO_SELECTOR = '.monaco-editor';
const LAYOUT_KEY = 'perspective-layouts';
/** The diff sources this row drives, each with its driver; a required source without one is red. */
const DRIVERS = { unstaged: 'openPane', staged: 'openPane', branch: 'openPane', commit: 'openPane', 'combined-uncommitted': 'openPane' };
const REQUIRED_SOURCES = ['unstaged', 'staged', 'branch', 'commit', 'combined-uncommitted'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- pure comparators (the self-test plants these)

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A side's text against git's bytes for its spec. */
export const blobVerdict = (label, got, want) => (got === want ? [] : [`wrong revision text: ${label}`]);

/** The PB-owned roots against the store's local non-archived worktree paths, as sets. */
export function rootsVerdict(pbRoots, storePaths) {
    const pb = new Set(pbRoots);
    const store = new Set(storePaths);
    return [...[...store].filter((p) => !pb.has(p)).map((p) => `missing root ${p}`), ...[...pb].filter((p) => !store.has(p)).map((p) => `extra root ${p}`)];
}

/** The store-drop close: the dirty editor stays, the clean one closes. */
export function closeVerdict({ dirtyOpen, cleanOpen }) {
    return [...(dirtyOpen ? [] : ['dirty editor closed']), ...(cleanOpen ? ['clean editor left open'] : [])];
}

/** The prefix copy: the fixed workspace prefix carries the old prefix's value. */
export const migrationVerdict = (oldValue, newValue) => (oldValue !== undefined && deepEqual(oldValue, newValue) ? [] : [`key left behind: ${LAYOUT_KEY}`]);

/** No Untitled workspace file (CA-05: it would ask to save the workspace on every quit). */
export const untitledVerdict = (files) => files.filter((f) => f.startsWith('Untitled')).map((f) => `Untitled file present: ${f}`);

/** The first root fires no reload: the page marker set before it survives. */
export const reloadVerdict = (markerKept) => (markerKept ? [] : ['the first root reloaded the Theia frontend']);

/**
 * Orca creates a worktree under its workspaceDir, `<HOME>/orca/workspaces/<repo>/<name>`, and the launched programs
 * run with the scratch HOME (liveEnv). A created worktree outside that folder is a worktree somewhere a row must never
 * write (the developer's real home); red names the clause, never the path.
 */
export function worktreeHomeVerdict(path, home) {
    const base = join(home, 'orca', 'workspaces') + sep;
    return String(path).startsWith(base) ? [] : [`a created worktree is outside the scratch HOME's Orca workspace folder (${basename(String(path))})`];
}

/** Absolute paths in a CLI result whose last segment starts with `prefix`, in order, without repeats. */
export function worktreePathsIn(value, prefix = 'ws-live') {
    const out = [];
    const walk = (v) => {
        if (typeof v === 'string') { if (v.startsWith('/') && basename(v).startsWith(prefix) && !out.includes(v)) out.push(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(value);
    return out;
}

/**
 * Removes the worktree directories this row created through Orca (each one's last segment starts with ws-live) and then
 * each now-empty parent (non-recursive: never anything else under Orca's workspace folder). Returns the paths removed.
 */
export function removeCreatedWorktrees(paths) {
    const removed = [];
    for (const p of paths) {
        if (!p || !basename(p).startsWith('ws-live') || !existsSync(p)) continue;
        rmSync(p, { recursive: true, force: true });
        removed.push(p);
        try { rmdirSync(dirname(p)); } catch { /* not empty or absent */ }
    }
    return removed;
}

/** The 1 s bound of clause (a). */
export const timingVerdict = (ms) => (ms !== null && ms <= 1000 ? [] : [`no Theia editor within 1 s (${ms === null ? 'none' : `${ms} ms`})`]);

// ---------------------------------------------------------------- self-test

async function loadRootSync() {
    const ts = createRequire(import.meta.url)(TS_DIR);
    const out = ts.transpileModule(readFileSync(join(REPO_ROOT, ROOT_SYNC_REL), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true, emitDecoratorMetadata: false },
    }).outputText;
    const decorator = () => () => undefined;
    const stub = new Proxy({}, { get: () => decorator });
    const mod = { exports: {} };
    // The file's own source, transpiled; its Theia imports become inert decorator stubs.
    new Function('require', 'module', 'exports', out)(() => stub, mod, mod.exports);
    return mod.exports;
}

const sorted = (xs) => [...xs].sort();

async function runSelfTest() {
    let failures = 0;
    const expect = (name, fails, naming) => {
        const text = fails.join('\n');
        if (naming === null) { if (fails.length) { console.error(`  FAIL ${name} -> red on a passing fixture: ${text}`); failures++; } else console.log(`  ok ${name} -> green`); return; }
        if (!fails.length) { console.error(`  FAIL ${name} -> stayed green`); failures++; } else if (!text.includes(naming)) { console.error(`  FAIL ${name} -> red, but not naming '${naming}': ${text}`); failures++; } else console.log(`  ok ${name} -> red, naming '${naming}'`);
    };
    expect('blob control', blobVerdict('diff:staged left', 'abc\n', 'abc\n'), null);
    expect('wrong-revision text', blobVerdict('diff:staged left', 'working\n', 'staged\n'), 'wrong revision text: diff:staged left');
    expect('roots control', rootsVerdict(['/a', '/b'], ['/b', '/a']), null);
    expect('missing root', rootsVerdict(['/a'], ['/a', '/b']), 'missing root /b');
    expect('extra root', rootsVerdict(['/a', '/x'], ['/a']), 'extra root /x');
    expect('close control', closeVerdict({ dirtyOpen: true, cleanOpen: false }), null);
    expect('dirty editor closed', closeVerdict({ dirtyOpen: false, cleanOpen: false }), 'dirty editor closed');
    expect('migration control', migrationVerdict({ coding: [1] }, { coding: [1] }), null);
    expect('key left behind', migrationVerdict({ coding: [1] }, undefined), `key left behind: ${LAYOUT_KEY}`);
    expect('untitled control', untitledVerdict([FIXED_FILE]), null);
    expect('Untitled file present', untitledVerdict([FIXED_FILE, 'Untitled-1.theia-workspace']), 'Untitled file present: Untitled-1.theia-workspace');
    expect('reload control', reloadVerdict(true), null);
    expect('reload', reloadVerdict(false), 'reloaded the Theia frontend');
    expect('timing control', timingVerdict(400), null);
    expect('timing', timingVerdict(1500), 'no Theia editor within 1 s');

    // harness-live-panels-10: worktrees stay under the scratch HOME, and the cleanup removes only what the row created.
    expect('worktree under the scratch HOME control', worktreeHomeVerdict('/tmp/pb-home-x/orca/workspaces/repo/ws-live', '/tmp/pb-home-x'), null);
    expect('a worktree under the real home', worktreeHomeVerdict('/home/dev/orca/workspaces/repo/ws-live', '/tmp/pb-home-x'), 'outside the scratch HOME');
    expect('a sibling folder that only shares the prefix', worktreeHomeVerdict('/tmp/pb-home-x2/orca/workspaces/repo/ws-live', '/tmp/pb-home-x'), 'outside the scratch HOME');
    {
        const root = mkdtempSync(join(tmpdir(), 'pb-ws-cleanup-'));
        try {
            const repoDir = join(root, 'orca', 'workspaces', 'repo');
            const a = join(repoDir, 'ws-live'), b = join(repoDir, 'ws-live-2'), other = join(repoDir, 'keep-me');
            for (const d of [a, b, other]) { mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'f'), 'x'); }
            const removed = removeCreatedWorktrees([a, b, other, join(repoDir, 'never-existed')]);
            const left = readdirSync(repoDir).sort().join();
            const fails = [...(removed.length === 2 ? [] : [`removed ${removed.length} paths, expected 2`]), ...(left === 'keep-me' ? [] : [`left ${left}`]), ...(existsSync(join(other, 'f')) ? [] : ['an unrelated worktree was removed'])];
            expect('cleanup removes the created worktrees, keeps everything else', fails, null);
            const again = removeCreatedWorktrees([other]);
            expect('cleanup refuses a directory that is not a ws-live worktree', again.length ? ['removed a non-ws-live directory'] : [], null);
            removeCreatedWorktrees([]);
            const empty = join(root, 'orca', 'workspaces', 'solo'); mkdirSync(join(empty, 'ws-live'), { recursive: true });
            removeCreatedWorktrees([join(empty, 'ws-live')]);
            expect('cleanup removes the parent folder once it is empty', existsSync(empty) ? ['the empty parent stayed'] : [], null);
        } finally { rmSync(root, { recursive: true, force: true }); }
    }
    expect('worktree paths found in a CLI result', JSON.stringify(worktreePathsIn({ result: { worktree: { path: '/h/orca/workspaces/repo/ws-live', other: '/h/x' }, list: ['/h/orca/workspaces/repo/ws-live-2'] } })) === JSON.stringify(['/h/orca/workspaces/repo/ws-live', '/h/orca/workspaces/repo/ws-live-2']) ? [] : ['wrong paths'], null);
    expect('no path in a CLI result with none', worktreePathsIn({ result: { ok: true } }).length ? ['found a path'] : [], null);
    {
        // The teardown runs once on a throw, once on exit and once on SIGTERM; the cleanup also runs when the process is signalled.
        const home = mkdtempSync(join(tmpdir(), 'pb-teardown-'));
        try {
            const marker = join(home, 'marker');
            const lib = join(REPO_ROOT, 'scripts', 'lib', 'live-teardown.mjs');
            const run = (body) => spawnSync(process.execPath, ['--input-type=module', '-e', `import { registerTeardown } from ${JSON.stringify(lib)}; import { appendFileSync } from 'node:fs'; const t = registerTeardown(() => appendFileSync(${JSON.stringify(marker)}, 'x')); ${body}`], { encoding: 'utf8', timeout: 20000 });
            const count = () => (existsSync(marker) ? readFileSync(marker, 'utf8').length : 0);
            rmSync(marker, { force: true });
            run('throw new Error("boom");');
            expect('teardown runs after an uncaught throw', count() === 1 ? [] : [`ran ${count()} times`], null);
            rmSync(marker, { force: true });
            run('t(); t(); process.exit(0);');
            expect('teardown runs once however often it is called, and not again at exit', count() === 1 ? [] : [`ran ${count()} times`], null);
            rmSync(marker, { force: true });
            const sig = run('setTimeout(() => process.kill(process.pid, "SIGTERM"), 50); setInterval(() => {}, 1000);');
            expect('teardown runs when SIGTERM ends the process, which then still ends by the signal', count() === 1 && sig.signal === 'SIGTERM' ? [] : [`ran ${count()} times, ended by ${sig.signal ?? `exit ${sig.status}`}`], null);
        } finally { rmSync(home, { recursive: true, force: true }); }
    }
    if (spawnSync('flock', ['--version']).error) {
        console.log('  skip the live-lock helper test: flock is not installed');
    } else {
        // lib/live-lock-reexec.mjs: a row started without PB_LIVE_LOCK_HELD=1 runs again under flock on the checkout's
        // pb-live.lock and passes the exit status on; one started with it (by the driver) does not take the lock again.
        const root = mkdtempSync(join(tmpdir(), 'pb-lock-helper-'));
        try {
            const clean = { PATH: process.env.PATH ?? '', HOME: root, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
            spawnSync('git', ['init', '-q', root], { env: clean });
            mkdirSync(join(root, 'scripts'));
            const lib = join(REPO_ROOT, 'scripts', 'lib', 'live-lock-reexec.mjs');
            const lock = join(realpathSync(root), '.git', 'pb-live.lock');
            writeFileSync(join(root, 'scripts', 'probe.mjs'), `import { takeLiveLock } from ${JSON.stringify(lib)};
                import { spawnSync } from 'node:child_process';
                const held = takeLiveLock(import.meta.url, 'probe');
                if (held !== null) process.exit(held);
                const busy = spawnSync('flock', ['-n', ${JSON.stringify(lock)}, 'true']).status === 1;
                console.log('inner: PB_LIVE_LOCK_HELD=' + process.env.PB_LIVE_LOCK_HELD + ' lockBusy=' + busy);
                process.exit(busy ? 7 : 8);`);
            const run = (extra) => { const env = { ...clean }; Object.assign(env, extra); return spawnSync(process.execPath, [join(root, 'scripts', 'probe.mjs')], { env, encoding: 'utf8', timeout: 20000 }); };
            const started = run({});
            expect('a row started by hand takes the live lock itself and its exit status comes back', started.status === 7 && /PB_LIVE_LOCK_HELD=1 lockBusy=true/.test(started.stdout) ? [] : [`status ${started.status}: ${started.stdout}${started.stderr}`], null);
            const driven = run({ PB_LIVE_LOCK_HELD: '1' });
            expect('a row the driver started (PB_LIVE_LOCK_HELD=1) does not take the lock again', driven.status === 8 && /lockBusy=false/.test(driven.stdout) ? [] : [`status ${driven.status}: ${driven.stdout}${driven.stderr}`], null);
        } finally { rmSync(root, { recursive: true, force: true }); }
    }
    {
        // The fixture repository builds under a user's hostile global git config (commit signing, hooks) without prompting or failing.
        const home = mkdtempSync(join(tmpdir(), 'pb-ws-fixture-'));
        try {
            writeFileSync(join(home, '.gitconfig'), '[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = /nonexistent/gpg\n');
            let status = 'none';
            try { const { git } = buildFixtureRepo(join(home, 'repo'), home); status = git('status', '--porcelain'); } catch (e) { status = `threw: ${String(e.message).split('\n')[0]}`; }
            expect("the fixture repository ignores the user's global git config and holds its merge conflicts", /UU conflict\.txt/.test(status) && /DU gone\.txt|UD gone\.txt/.test(status) ? [] : [`status: ${status}`], null);
        } finally { rmSync(home, { recursive: true, force: true }); }
    }
    // The plan's behaviour list through the real pure functions.
    if (!existsSync(TS_DIR)) {
        // The comparators above ran: a failure there is a FAIL; otherwise the part that needs typescript did not run, which is a SKIP.
        if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) wrong`); return 1; }
        console.log(skipLine(NAME, 'theia/node_modules/typescript is absent, so planRoots, noteUserRemovals and planMigration were not run; run the audited Theia install in theia/'));
        return SKIP_EXIT;
    }
    if (!existsSync(join(REPO_ROOT, ROOT_SYNC_REL))) { console.error(`${NAME} self-test: FAIL -- ${ROOT_SYNC_REL} is absent`); return 1; }
    const m = await loadRootSync();
    const behave = (name, good) => { if (good) console.log(`  ok ${name}`); else { console.error(`  FAIL ${name}`); failures++; } };
    const run = (fn, ...a) => { try { return fn(...a); } catch (e) { return { threw: String(e?.message ?? e) }; } };
    const p1 = run(m.planRoots, { wanted: ['A', 'B'], previousWanted: ['A'], roots: ['U', 'A'], owned: ['A'], userRemoved: [] });
    behave('planRoots adds B and removes nothing', deepEqual(p1?.add, ['B']) && deepEqual(p1?.remove, []) && deepEqual(sorted(p1?.owned ?? []), ['A', 'B']));
    const p2 = run(m.planRoots, { wanted: ['A'], previousWanted: ['A', 'B'], roots: ['U', 'A', 'B'], owned: ['A', 'B'], userRemoved: [] });
    behave('planRoots removes B when its worktree leaves; the user root U is never removed', deepEqual(p2?.remove, ['B']) && !p2?.remove?.includes('U') && deepEqual(p2?.owned, ['A']));
    const p2u = run(m.planRoots, { wanted: [], previousWanted: ['U', 'A'], roots: ['U', 'A'], owned: ['A'], userRemoved: [] });
    behave('planRoots never removes a root PB did not add', deepEqual(p2u?.remove, ['A']));
    const n3 = run(m.noteUserRemovals, { roots: ['U', 'B'], owned: ['A', 'B'], userRemoved: [] });
    behave('an owned root missing after a workspace change PB did not make moves to userRemoved', deepEqual(n3?.owned, ['B']) && deepEqual(n3?.userRemoved, ['A']));
    const p3 = run(m.planRoots, { wanted: ['A', 'B'], previousWanted: ['A', 'B'], roots: ['U', 'B'], owned: n3?.owned ?? [], userRemoved: n3?.userRemoved ?? [] });
    behave('the next store event does not re-add a user-removed root', deepEqual(p3?.add, []) && deepEqual(p3?.userRemoved, ['A']));
    const p3b = run(m.planRoots, { wanted: ['B'], previousWanted: ['A', 'B'], roots: ['U', 'B'], owned: ['B'], userRemoved: ['A'] });
    behave('a user-removed root leaves userRemoved when its worktree leaves the wanted set', deepEqual(p3b?.userRemoved, []) && deepEqual(p3b?.remove, []));
    const p3c = run(m.planRoots, { wanted: ['A', 'B'], previousWanted: ['B'], roots: ['U', 'B'], owned: ['B'], userRemoved: [] });
    behave('a worktree that returns is added again', deepEqual(p3c?.add, ['A']));
    const fixed = 'file:///p/powerbrowser-theia/workspaces/powerbrowser.theia-workspace';
    const mg = run(m.planMigration, { prefix: '_global_', keys: ['_global_:perspective-layouts', '_global_:x', 'powerbrowser.orca.ownedRoots', '_global_x'], fixedUri: fixed });
    behave('planMigration copies both _global_: keys under the fixed file URI prefix and leaves unprefixed keys alone',
        deepEqual(mg, [['_global_:perspective-layouts', `${fixed}:perspective-layouts`], ['_global_:x', `${fixed}:x`]]));
    behave('the fixed workspace file name is the one this row checks', m.ORCA_WORKSPACE_FILE === FIXED_FILE);
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) wrong`); return 1; }
    console.log(`${NAME} self-test: PASS -- every comparator plant went red naming its drift and its control stayed green; planRoots, noteUserRemovals and planMigration match the behaviour list`);
    return 0;
}

// ---------------------------------------------------------------- live

/** The SKIP reason, a FAIL, or neither. */
async function readiness() {
    const { prerequisites } = await import('./lib/orca-tabs-live.mjs');
    const pre = prerequisites({ needOrca: true, needPanes: true });
    if (pre.skip || pre.fail) return pre;
    const entry = existsSync(join(REPO_ROOT, ENTRY_REL)) ? readFileSync(join(REPO_ROOT, ENTRY_REL), 'utf8') : '';
    if (!/\bsubscribeOpenFiles\b/.test(entry) || !/\bsubscribeWorktrees\b/.test(entry)) return { skip: 'lane p65-01 not merged (the pane entry exports no subscribeOpenFiles or subscribeWorktrees)', fail: null };
    if (!/@powerbrowser\/orca-workspace\//.test(existsSync(join(REPO_ROOT, SERVER_REL)) ? readFileSync(join(REPO_ROOT, SERVER_REL), 'utf8') : '')) {
        return { skip: null, fail: `orca-workspace not wired into the built app (${SERVER_REL} names no @powerbrowser/orca-workspace module; rebuild the app)` };
    }
    if (!/from ['"]@monaco-editor\/react['"]/.test(existsSync(join(REPO_ROOT, ORCA_MONACO_REL)) ? readFileSync(join(REPO_ROOT, ORCA_MONACO_REL), 'utf8') : '')) {
        return { skip: null, fail: `source moved: ${ORCA_MONACO_REL} no longer imports @monaco-editor/react, so the Monaco root selector is not Orca's editor's` };
    }
    return { skip: null, fail: null };
}

/** The scratch repository: a base, a feature branch, a commit to compare, a staged and an unstaged change, and a merge left with UU and UD. */
function buildFixtureRepo(repo, home) {
    // The user's global and system git config never apply (a global commit.gpgsign or core.hooksPath would prompt, fail or run).
    const env = fixtureGitEnv(home);
    const git = (...a) => execFileSync('git', ['-C', repo, ...FIXTURE_GIT_ARGS, '-c', 'init.defaultBranch=main', ...a], { env, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    mkdirSync(repo, { recursive: true });
    const put = (f, t) => writeFileSync(join(repo, f), t);
    git('init', '-q');
    put('a.txt', 'a base\n'); put('b.txt', 'b base\n'); put('conflict.txt', 'conflict base\n'); put('gone.txt', 'gone base\n'); put('s.txt', 's base\n');
    git('add', '.'); git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'feature'); put('b.txt', 'b on feature\n'); git('commit', '-q', '-am', 'feature');
    git('checkout', '-q', 'main');
    git('checkout', '-q', '-b', 'side'); put('conflict.txt', 'conflict on side\n'); git('rm', '-q', 'gone.txt'); git('commit', '-q', '-am', 'side');
    git('checkout', '-q', 'main'); put('conflict.txt', 'conflict on main\n'); put('gone.txt', 'gone on main\n'); git('commit', '-q', '-am', 'main');
    try { git('merge', '-q', 'side'); } catch { /* the conflicts are the fixture */ }
    put('s.txt', 's staged\n'); git('add', 's.txt'); put('a.txt', 'a unstaged\n');
    return { git, mainCommit: git('rev-parse', 'HEAD') };
}

/** Page-realm source: every diff and merge editor with its side URIs and texts, and every plain editor with its URI and dirty flag. */
const EDITORS = `const shell = get('ApplicationShell');
    const out = { diffs: [], merges: [], editors: [] };
    for (const w of [...shell.getWidgets('main'), ...shell.getWidgets('bottom')]) {
        if (w.side1Pane && w.baseUri) {
            const t = p => { try { return p.editor.getControl().getModel().getValue(); } catch (e) { return null; } };
            out.merges.push({ id: w.id, base: w.baseUri.toString(), side1: w.side1Uri.toString(), side2: w.side2Uri.toString(), result: w.resultUri.toString(), baseText: t(w.basePane), side1Text: t(w.side1Pane), side2Text: t(w.side2Pane) });
            continue;
        }
        // A diff editor's getResourceUri() is its modified side; the editor's own uri is the diff: URI.
        const uri = w.editor && w.editor.uri && w.editor.uri.scheme === 'diff' ? w.editor.uri : typeof w.getResourceUri === 'function' ? w.getResourceUri() : undefined;
        if (!uri || !w.editor) continue;
        if (uri.scheme === 'diff') {
            let sides = [];
            try { sides = JSON.parse(uri.query); } catch (e) { /* unknown shape */ }
            out.diffs.push({ id: w.id, left: sides[0], right: sides[1], leftText: w.editor.originalModel ? w.editor.originalModel.getText() : null, rightText: w.editor.document ? w.editor.document.getText() : null });
        } else {
            out.editors.push({ id: w.id, uri: uri.toString(), dirty: !!(w.saveable && w.saveable.dirty), monaco: !!w.node.querySelector(${JSON.stringify(MONACO_SELECTOR)}) });
        }
    }
    return out;`;

/** Path and rev of a side URI string (file: or pb-orca-git:). */
function sideOf(uriText) {
    const u = new URL(uriText);
    return u.protocol === 'file:' ? { path: decodeURIComponent(u.pathname) } : { path: decodeURIComponent(u.pathname), rev: decodeURIComponent(u.search.replace(/^\?/, '')) };
}

/** CA-03: the expected sides of one diff record (relative paths). */
function expectedDiffSides(rec, headOid) {
    const source = rec.diffSource;
    const combined = source.startsWith('combined-');
    const rel = combined ? rec.combinedFirst?.relativePath : rec.relativePath;
    const oldRel = (combined ? rec.combinedFirst?.oldPath : rec.oldPath) ?? rel;
    const rule = !combined ? source : source === 'combined-branch' ? 'branch' : source === 'combined-commit' ? 'commit' : rec.combinedFirst?.area === 'staged' ? 'staged' : 'unstaged';
    if (rule === 'staged') return { rel, left: { rel: oldRel, rev: headOid ?? '' }, right: { rel, rev: ':0' } };
    if (rule === 'branch') return { rel, left: { rel: oldRel, rev: rec.branch?.mergeBase ?? '' }, right: { rel, rev: rec.branch?.headOid ?? '' } };
    if (rule === 'commit') return { rel, left: { rel: oldRel, rev: rec.commit?.parentOid ?? '' }, right: { rel, rev: rec.commit?.commitOid ?? '' } };
    return { rel, left: { rel, rev: rec.combinedFirst?.area === 'untracked' ? '' : ':0' }, right: { rel } };
}

async function runLive() {
    const ready = await readiness();
    if (ready.skip) { console.log(skipLine(NAME, ready.skip)); return SKIP_EXIT; }
    if (ready.fail) { console.error(`${NAME}: FAIL -- ${ready.fail}`); return 1; }
    // Nothing is launched before this: a row started by hand takes the live lock itself (harness-live-panels-02).
    const held = takeLiveLock(import.meta.url, NAME);
    if (held !== null) return held;
    const lib = await import('./lib/orca-tabs-live.mjs');
    const { installOutputRedaction, ensurePbNode, redact } = await import('./lib/orca-run.mjs');
    const secrets = [];
    const restoreOutput = installOutputRedaction(secrets);
    const fails = [];
    const notes = [];
    const savedEnv = {};
    for (const k of [...lib.scrubbedNames(), 'PATH', 'MOZ_PURGE_CACHES', 'XDG_CONFIG_HOME']) savedEnv[k] = process.env[k];
    const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'pb-orca-workspace-live-')));
    const repo = join(scratch, 'repo');
    const userFolder = join(scratch, 'user-folder');
    const stubDir = lib.writeStubAgentDir();
    const recorded = new Map();
    const createdWorktrees = new Set();
    const electron = await import('./verify-orca-hidden-electron.mjs');
    // The teardown runs in the finally below, and also at exit and on SIGINT, SIGTERM and SIGHUP; it is synchronous.
    // Whatever the run threw: the orcad and terminal daemon PowerBrowser started are killed, the worktrees Orca
    // created are removed, then the scratch folders (harness-live-panels-10).
    const teardown = registerTeardown(() => {
        for (const [pid, ticks] of recorded) electron.signalIdentity(pid, ticks, 'SIGKILL');
        removeCreatedWorktrees([...createdWorktrees]);
        rmSync(scratch, { recursive: true, force: true });
        rmSync(stubDir, { recursive: true, force: true });
    });
    try {
        for (const k of lib.scrubbedNames()) delete process.env[k];
        const live = await import('./lib/pb-live-probe.mjs');
        const { pollFor, probe } = await import('./lib/pb-relaunch.mjs');
        const { freePort, startTicks } = electron;
        const OrcaEnv = await import('../powerbrowser/shell/OrcaEnv.sys.mjs');
        const basePath = savedEnv.PATH ?? '';
        const cliHome = savedEnv.HOME ?? process.env.HOME ?? '';
        // The fixture's git runs with the scratch folder as HOME and no global config; the worktrees Orca creates are checked against liveEnv's HOME.
        const gitEnv = fixtureGitEnv(scratch);
        const orcaHome = liveEnv().HOME;
        const { git } = buildFixtureRepo(repo, scratch);
        mkdirSync(userFolder);
        process.env.PATH = `${stubDir}:${basePath}`;
        const prefs = { 'powerbrowser.orca.root': join(REPO_ROOT, 'orca'), 'powerbrowser.orca.port': await freePort(OrcaEnv), 'powerbrowser.sidecar.nodePath': (await ensurePbNode()).path };
        await live.withProbeShell(async (app) => {
            const p = (body, ms) => probe(app, body, ms);
            const chrome = async (expr) => JSON.parse(await app.evaluateIn(app.chrome, `(() => { try { return JSON.stringify(${expr}); } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`));
            const bundle = (expr, ms) => p(`const m = globalThis[Symbol.for(${JSON.stringify(lib.ORCA_PANES_MODULE_KEY)})];
                if (!m) return { error: 'no bundle module' };
                return await (${expr});`, ms);
            const openFiles = () => bundle(`new Promise(r => { let u; u = m.subscribeOpenFiles(f => { r(f); setTimeout(() => u && u(), 0); }); })`);
            const worktreesNow = () => bundle(`new Promise(r => { let u; u = m.subscribeWorktrees(s => { r(s); setTimeout(() => u && u(), 0); }); })`);
            const rootsNow = () => p(`return (await get('WorkspaceService').roots).map(r => r.resource.path.fsPath());`);
            const storage = (key) => p(`return (await get('ProfileStorageService').getData(${JSON.stringify(key)})) ?? null;`);

            // Session: OrcaService ready, the bundle booted, the hosted client paired session-only.
            const state = await pollFor(async () => { const s = await chrome(`ChromeUtils.importESModule('chrome://powerbrowser/content/OrcaService.sys.mjs').OrcaService.getState()`); if (s.chromeError || s.state === 'failed') throw new Error(`OrcaService: ${s.chromeError ?? s.state}`); return s.state === 'ready' ? s : null; }, 90000, 'OrcaService to reach ready');
            for (const pid of [state.pid, state.daemonPid]) { const t = Number.isInteger(pid) && pid > 0 ? startTicks(pid) : null; if (t !== null) recorded.set(pid, t); }
            const boot = await p(lib.BOOT_WAIT, 200000);
            if (!boot?.booted) throw new Error(`the Orca pane bundle did not boot: ${JSON.stringify(boot?.error ?? 'not booted')}`);
            const paired = await pollFor(async () => ((await bundle(`m.state()`))?.pairing?.sessionOnly === true) || null, 60000, 'the hosted client to pair session-only').catch(() => false);
            if (!paired) fails.push('the hosted client is not paired session-only (state().pairing.sessionOnly)');
            const cliEnv = { PATH: basePath, HOME: cliHome, ORCA_USER_DATA: state.effectiveRoot, ORCA_USER_DATA_PATH: state.effectiveRoot };
            const cli = join(state.effectiveRoot, 'cli', 'bin', 'orca');
            const orca = (...a) => {
                try { return JSON.parse(execFileSync(cli, [...a, '--json'], { env: liveEnv(cliEnv), cwd: repo, timeout: 60000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) {
                    throw new Error(`the Orca CLI call '${a.slice(0, 2).join(' ')}' failed: ${redact(String(e.stderr ?? e.message), secrets).trim().split('\n').pop()}`);
                }
            };

            // (e) the first add, measured with the reload marker and the old prefix's layout recorded first.
            const before = await p(`window.__pbWorkspaceLiveMarker = 'kept';
                const app = get('FrontendApplication'); get('ShellLayoutRestorer').storeLayout(app);
                await sleep(200);
                const ws = get('WorkspaceService');
                return { workspace: ws.workspace ? ws.workspace.resource.toString() : null, layouts: (await get('ProfileStorageService').getData('_global_:${LAYOUT_KEY}')) ?? null, configDir: await get('EnvVariablesServer').getConfigDirUri() };`);
            if (before.workspace !== null) notes.push('(e) the fresh profile opened with a workspace, so the old prefix is that workspace');
            const oldPrefix = before.workspace ?? '_global_';
            const oldLayouts = before.workspace ? await storage(`${before.workspace}:${LAYOUT_KEY}`) : before.layouts;
            orca('repo', 'add', '--path', repo);
            const rooted = await pollFor(async () => (await rootsNow()).includes(repo) || null, 30000, 'the repository to become a workspace root').catch(() => false);
            if (!rooted) fails.push('(e) the first Orca repository never became a Theia workspace root');
            const after = await p(`const ws = get('WorkspaceService'); return { marker: window.__pbWorkspaceLiveMarker === 'kept', workspace: ws.workspace ? ws.workspace.resource.toString() : null };`);
            fails.push(...reloadVerdict(after.marker).map((f) => `(e) ${f}`));
            const fixedUri = after.workspace ?? '';
            if (!fixedUri.endsWith(`/workspaces/${FIXED_FILE}`)) fails.push(`(e) the workspace after the first root is not the fixed file ${FIXED_FILE}`);
            fails.push(...migrationVerdict(oldLayouts ?? undefined, (await storage(`${fixedUri}:${LAYOUT_KEY}`)) ?? undefined).map((f) => `(e) ${f} (old prefix ${oldPrefix === '_global_' ? '_global_' : 'a folder'})`));
            const workspacesDir = join(new URL(before.configDir).pathname, 'workspaces');
            const listWorkspaces = () => (existsSync(workspacesDir) ? readdirSync(workspacesDir) : []);
            fails.push(...untitledVerdict(listWorkspaces()).map((f) => `(e) ${f}`));
            const worktreeId = (await worktreesNow())?.worktrees?.find((w) => w.path === repo)?.id;
            if (!worktreeId) throw new Error('the scratch repository has no worktree in the Orca store');

            // (a) orca file open: a Theia editor on the file: URI within 1 s.
            const aUri = `file://${repo}/a.txt`;
            orca('file', 'open', join(repo, 'a.txt'), '--worktree', `path:${repo}`);
            const t0 = Date.now();
            const seen = await pollFor(async () => ((await p(EDITORS)).editors.some((e) => e.uri === aUri) ? Date.now() : null), 5000, 'the Theia editor').catch(() => null);
            fails.push(...timingVerdict(seen === null ? null : seen - t0).map((f) => `(a) ${f}`));

            // (b) diffs and conflicts: drivers, then the texts against git.
            for (const s of REQUIRED_SOURCES) if (!DRIVERS[s]) fails.push(`(b) no driver for ${s}`);
            const head = git('rev-parse', 'HEAD');
            let mergeSeen = null;
            const openPane = (kind, detail) => bundle(`m.openPane(${JSON.stringify(kind)}, ${JSON.stringify(worktreeId)}, ${JSON.stringify(detail)})`);
            // C64-6: select the worktree first; Orca polls git status only for the active worktree, and its combined
            // uncommitted diff snapshots that status.
            await bundle(`m.setActiveWorktree(${JSON.stringify(worktreeId)})`);
            for (const [kind, detail] of [
                ['diff', JSON.stringify({ source: 'unstaged', relativePath: 'a.txt' })],
                ['diff', JSON.stringify({ source: 'staged', relativePath: 's.txt' })],
                // baseRef explicit: Orca's default comes from a branch compare its source-control panel ran, and none ran here.
                ['diff', JSON.stringify({ source: 'branch', relativePath: 'b.txt', baseRef: 'feature' })],
                ['diff', JSON.stringify({ source: 'commit', relativePath: 'conflict.txt', commitOid: head })],
                ['diff', JSON.stringify({ source: 'combined-uncommitted', relativePath: 's.txt' })],
                ['conflict-review', JSON.stringify({ relativePath: 'conflict.txt', conflictKind: 'both_modified' })],
                ['conflict-review', JSON.stringify({ relativePath: 'gone.txt', conflictKind: 'deleted_by_them' })],
            ]) {
                const r = await openPane(kind, detail);
                if (r?.error) fails.push(`(b) openPane ${kind} failed: ${r.error}`);
                // Orca keeps one Conflict Review tab per worktree, so the next conflict replaces this one: read the merge editor now.
                if (detail.includes('both_modified')) mergeSeen = await pollFor(async () => (await p(EDITORS)).merges.find((mm) => sideOf(mm.result).path === join(repo, 'conflict.txt')) ?? null, 10000, 'the merge editor').catch(() => null);
            }
            const combined = JSON.stringify({ source: 'combined-uncommitted', relativePath: 's.txt' });
            await pollFor(async () => ((await openFiles()) ?? []).some((r) => r.diffSource === 'combined-uncommitted' && r.combinedFirst) || (await openPane('diff', combined), null), 20000, 'the combined diff over a loaded git status').catch(() => null);
            await sleep(3000);
            const records = (await openFiles()) ?? [];
            const view = await p(EDITORS);
            const blob = (rev, rel) => (rev === '' ? '' : execFileSync('git', ['-C', repo, 'cat-file', 'blob', `${rev}:${rel}`], { env: gitEnv }).toString('utf8'));
            const textOf = (side) => (side.rev === undefined ? readFileSync(join(repo, side.rel), 'utf8') : blob(side.rev, side.rel));
            const diffSources = new Set();
            for (const rec of records.filter((r) => r.mode === 'diff' && r.worktreePath === repo)) {
                diffSources.add(rec.diffSource);
                const want = expectedDiffSides(rec, git('rev-parse', '--verify', '--quiet', 'HEAD^{commit}'));
                if (want.rel === undefined) { fails.push(`(b) diff:${rec.diffSource} has no entry to open`); continue; }
                const w = view.diffs.find((d) => { const l = sideOf(d.left); const r = sideOf(d.right); return l.path === join(repo, want.left.rel) && l.rev === want.left.rev && r.path === join(repo, want.right.rel) && r.rev === want.right.rev; });
                if (!w) { fails.push(`(b) diff:${rec.diffSource} ${want.rel}: no Theia diff editor with the CA-03 sides`); continue; }
                fails.push(...blobVerdict(`diff:${rec.diffSource} ${want.rel} left`, w.leftText, textOf(want.left)).map((f) => `(b) ${f}`));
                fails.push(...blobVerdict(`diff:${rec.diffSource} ${want.rel} right`, w.rightText, textOf(want.right)).map((f) => `(b) ${f}`));
            }
            for (const s of REQUIRED_SOURCES) if (!diffSources.has(s)) fails.push(`(b) no Orca diff tab of source ${s} was observed`);
            const merge = mergeSeen;
            if (!merge) fails.push('(b) both_modified conflict.txt opened no Theia merge editor');
            else for (const [side, stage] of [['base', 1], ['side1', 2], ['side2', 3]]) fails.push(...blobVerdict(`merge ${side} (stage ${stage})`, merge[`${side}Text`], blob(`:${stage}`, 'conflict.txt')).map((f) => `(b) ${f}`));
            if (!view.editors.some((e) => e.uri === `file://${repo}/gone.txt`)) fails.push('(b) deleted_by_them gone.txt did not open the working file in the Theia editor');

            // (c) the Monaco detector: positive in the Theia editor first, then nothing in any Orca pane root.
            // Read on the shown editor: Theia moves a hidden editor's node out for tab previews.
            const aShown = view.editors.find((e) => e.uri === aUri);
            const aEditor = aShown && { ...aShown, monaco: await p(`const w = get('ApplicationShell').getWidgetById(${JSON.stringify(aShown.id)}); if (!w) return false; await get('ApplicationShell').activateWidget(w.id); await sleep(500); return !!w.node.querySelector(${JSON.stringify(MONACO_SELECTOR)});`) };
            if (!aEditor?.monaco) fails.push(`(c) blind detector: ${MONACO_SELECTOR} matched nothing in the Theia editor of (a), so its absence below proves nothing`);
            else {
                // A hosted Orca terminal gives the scan a pane root; a scan over zero roots would prove nothing.
                await p(`await get('CommandService').executeCommand('powerbrowser.orca.newTerminal'); return await until(() => document.querySelectorAll('[data-pb-orca-pane]').length > 0, 20000);`, 30000);
                const inPanes = await p(`return [...document.querySelectorAll('[data-pb-orca-pane]')].map(n => ({ kind: n.getAttribute('data-pb-orca-pane'), n: n.querySelectorAll(${JSON.stringify(MONACO_SELECTOR)}).length }));`);
                for (const pane of inPanes.filter((x) => x.n > 0)) fails.push(`(c) Orca's editor DOM (${MONACO_SELECTOR}) inside an Orca ${pane.kind} pane`);
                if (inPanes.length === 0) fails.push('(c) no Orca pane root to scan, so the absence of Orca\'s editor in pane roots proves nothing');
                notes.push(`(c) ${inPanes.length} Orca pane root(s) scanned`);
            }

            // (d) roots against the store, create, delete, clean and dirty close, a user root, a user removal.
            const storeLocal = async () => { const s = await worktreesNow(); return [...(s?.worktrees ?? []).filter((w) => w.local && !w.isArchived).map((w) => w.path), ...(s?.folders ?? []).filter((f) => f.local).map((f) => f.path)]; };
            const ownedPaths = async () => ((await storage('powerbrowser.orca.ownedRoots')) ?? []).map((u) => decodeURIComponent(new URL(u).pathname));
            await sleep(1500);
            const owned0 = await ownedPaths();
            fails.push(...rootsVerdict(owned0, await storeLocal()).map((f) => `(d) ${f}`));
            notes.push(`(d) ${owned0.length} PB-owned root(s) compared with the store's local worktrees`);
            const created = orca('worktree', 'create', '--repo', `path:${repo}`, '--name', 'ws-live', '--setup', 'skip');
            for (const made of worktreePathsIn(created)) createdWorktrees.add(made);
            const wt = await pollFor(async () => (await storeLocal()).find((x) => x !== repo && x.includes('ws-live')) ?? null, 30000, 'the created worktree in the store').catch(() => null);
            if (!wt) fails.push('(d) the created worktree never reached the store');
            else {
                createdWorktrees.add(wt);
                fails.push(...worktreeHomeVerdict(wt, orcaHome).map((f) => `(d) ${f}`));
                const added = await pollFor(async () => (await rootsNow()).includes(wt) || null, 15000, 'the created worktree as a root').catch(() => false);
                if (!added) fails.push('(d) a created worktree did not become a root');
                writeFileSync(join(wt, 'clean.txt'), 'clean\n'); writeFileSync(join(wt, 'dirty.txt'), 'dirty\n');
                const cleanUri = `file://${wt}/clean.txt`;
                const dirtyUri = `file://${wt}/dirty.txt`;
                orca('file', 'open', join(wt, 'clean.txt'), '--worktree', `path:${wt}`);
                orca('file', 'open', join(wt, 'dirty.txt'), '--worktree', `path:${wt}`);
                const both = await pollFor(async () => { const e = (await p(EDITORS)).editors; return (e.some((x) => x.uri === cleanUri) && e.some((x) => x.uri === dirtyUri)) || null; }, 10000, 'the clean and dirty editors').catch(() => false);
                if (!both) fails.push('(d) the two editors under the created worktree did not open');
                // Theia's browser default files.autoSave is afterDelay, which would save the fixture clean before the removal.
                const dirtyNow = () => p(`const w = get('EditorManager').all.find(e => e.getResourceUri().toString() === ${JSON.stringify(dirtyUri)}); return !!(w && w.saveable && w.saveable.dirty);`);
                const dirtied = await p(`await get('PreferenceService').set('files.autoSave', 'off', 1);
                    const w = get('EditorManager').all.find(e => e.getResourceUri().toString() === ${JSON.stringify(dirtyUri)});
                    if (!w) return false; w.editor.document.textEditorModel.setValue('unsaved text'); await sleep(1500); return !!(w.saveable && w.saveable.dirty);`) && await dirtyNow();
                if (!dirtied) fails.push('(d) blind fixture: the dirty editor never became dirty, so its survival proves nothing');
                orca('worktree', 'rm', '--worktree', `path:${wt}`, '--force');
                const removed = await pollFor(async () => !(await rootsNow()).includes(wt) || null, 30000, 'the removed worktree root to go').catch(() => false);
                if (!removed) fails.push('(d) removing the worktree in Orca did not remove its root');
                const left = await p(EDITORS);
                fails.push(...closeVerdict({ dirtyOpen: left.editors.some((e) => e.uri === `file://${wt}/dirty.txt`), cleanOpen: left.editors.some((e) => e.uri === `file://${wt}/clean.txt`) }).map((f) => `(d) ${f}`));
            }
            // A root added through Theia survives store events; a PB root removed through Theia stays removed.
            await p(`const ws = get('WorkspaceService'); const r = (await ws.roots)[0]; await ws.addRoot(new r.resource.constructor('file://${userFolder}')); return true;`);
            await p(`const ws = get('WorkspaceService'); await ws.removeRoots((await ws.roots).filter(r => r.resource.path.fsPath() === ${JSON.stringify(repo)}).map(r => r.resource)); return true;`);
            for (const made of worktreePathsIn(orca('worktree', 'create', '--repo', `path:${repo}`, '--name', 'ws-live-2', '--setup', 'skip'))) createdWorktrees.add(made);
            await sleep(4000);
            const finalRoots = await rootsNow();
            if (!finalRoots.includes(userFolder)) fails.push('(d) a root added through Theia was removed by a sync');
            if (finalRoots.includes(repo)) fails.push('(d) a PB-owned root removed through Theia came back after the next store event');
            // Orca creates worktrees under its workspaceDir, <HOME>/orca/workspaces/<repo>/ with the scratch HOME the launched
            // programs run with: remove both through Orca here; the teardown removes whatever is left, also after a throw.
            const second = await pollFor(async () => (await storeLocal()).find((x) => x.includes('ws-live-2')) ?? null, 15000, 'the second created worktree').catch(() => null);
            if (second) {
                createdWorktrees.add(second);
                fails.push(...worktreeHomeVerdict(second, orcaHome).map((f) => `(d) ${f}`));
                orca('worktree', 'rm', '--worktree', `path:${second}`, '--force');
                const gone = await pollFor(async () => !(await storeLocal()).includes(second) || null, 30000, 'the second worktree to go').catch(() => false);
                if (!gone || existsSync(second)) notes.push('cleanup: the second created worktree is still on disk under Orca\'s workspace directory');
            }
            // The dirty fixture's editor is reverted, so nothing saves it back into the removed worktree at quit.
            if (wt) await p(`for (const w of get('EditorManager').all) if (w.getResourceUri().toString() === ${JSON.stringify(`file://${wt}/dirty.txt`)}) { await w.editor.document.revert(); w.close(); } return true;`);

            // (f) quit.
            const quit = await app.quit();
            if (quit !== 'exited') fails.push(`(f) quit did not exit (${quit})`);
            fails.push(...untitledVerdict(listWorkspaces()).map((f) => `(f) ${f}`));
            return true;
        }, { extraPrefs: prefs });
    } catch (e) {
        fails.push(`harness: ${redact(String(e?.message ?? e), secrets)}`);
    } finally {
        // After a throw too: the orcad and daemon are killed and the worktrees and scratch folders removed (once; it also runs on a signal).
        await sleep(500);
        teardown();
        for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        restoreOutput();
    }
    for (const n of notes) console.log(`${NAME}: note -- ${n}`);
    if (fails.length) { for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`); return 1; }
    console.log(`${NAME}: PASS -- clauses e, a, b (${REQUIRED_SOURCES.length} diff sources, a merge and a one-sided conflict), c, d and f`);
    return 0;
}

// ---------------------------------------------------------------- entry

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--self-test')) {
        console.error(`${NAME}: unknown argument ${args[0] === '--self-test' ? args[1] : args[0]} (usage: node ${SELF_REL} [--self-test])`);
        console.error(`Next step: run node ${SELF_REL} under the live lock for the check, or add --self-test for the comparator run.`);
        process.exit(2);
    }
    process.exit(args[0] === '--self-test' ? await runSelfTest() : await runLive());
}
