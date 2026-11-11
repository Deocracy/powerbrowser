#!/usr/bin/env node
// scripts/verify-orca-browser-snapshot-live.mjs
//
// The snapshot row of BRW-03 (Phase 66 plan 04; P66-16, 66-RESEARCH A5/G9): PowerBrowser's browser.snapshot, built
// in the PowerBrowserAgent child from the DOM, compared structurally with what Orca's pinned agent-browser binary
// prints for the same fixture pages. Orca's agents read that binary's format, so it is the reference.
//
// Derived, never hand-kept:
//  a. the reference outputs, from scripts/fixtures/orca-snapshot/<page>.json, written by
//     scripts/gen-orca-snapshot-fixtures.mjs from a run of orca/node_modules/agent-browser against Chromium;
//  b. the pinned version, from orca/node_modules/agent-browser/package.json and orca/package.json's range;
//  c. PowerBrowser's outputs, from the Orca CLI against the orcad PowerBrowser started.
// Compared per fixture page (byte equality and ref numbering are never compared; Chromium-internal roles such as
// StaticText, LabelText or MenuListPopup appear only on lines without a ref):
//  1. every line of every PowerBrowser snapshot matches the grammar `- <role> "<name>" [<attrs>, ref=eN]`, with an
//     optional `: <value>` and ` clickable [<hints>]`;
//  2. the multiset of (role, name) of ref'd nodes equals the reference's, for the full and the interactive (-i) form;
//  3. the attribute tokens level, checked, expanded and selected are equal per ref'd node;
//  4. after the page's scripted change (pbChange(), run through the CLI eval), the --delta kind equals the
//     reference's, refs of nodes that survive keep their ids and names, and the ref'd multiset equals the
//     reference's surviving plus added nodes;
//  5. click @eN on each button and tab ref increments exactly that element's click counter, and an element row given
//     the ref of a removed node fails with browser_stale_ref in the error message (Pitfall 8: Orca carries a host code
//     as the message of runtime_error).
//
// Modes:
//   (none)        full tier, live, under the caller's flock on /home/chris/coding/Power-Browser/.git/pb-live.lock.
//                 Launches PowerBrowser with caches purged, waits for OrcaService ready, builds the Orca CLI's
//                 environment from scratch (this shell's ORCA_* never reach Orca), adds a scratch repository and
//                 drives one tab per fixture. SKIP (exit 0) without objdir/dist/bin/powerbrowser, a built orca/ or
//                 the fixtures.
//   --fixtures    quick, the orca-snapshot-fixtures row: the fixtures' recorded agent-browser version equals the
//                 installed one and satisfies orca/package.json's tilde range; every manifest page has its html and a
//                 json with full, interactive and afterChange. SKIP without orca/.
//   --self-test   quick, hermetic: every verdict over fixtures built in memory; each planted fault must go red
//                 naming it.
//
// Usage:
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-orca-browser-snapshot-live.mjs
//   node scripts/verify-orca-browser-snapshot-live.mjs --fixtures
//   node scripts/verify-orca-browser-snapshot-live.mjs --self-test

import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-browser-snapshot-live';
const FIX_REL = 'scripts/fixtures/orca-snapshot';
const WORK_REL = '.mozbuild/orca-browser-snapshot-live';
const SERVICE_URL = 'chrome://powerbrowser/content/OrcaService.sys.mjs';
export const TOKENS = ['level', 'checked', 'expanded', 'selected'];
const LINE = /^((?: {2})*)- ([A-Za-z]+)(?: ("(?:[^"\\]|\\.)*"))?(?: \[([^\]]*)\])?(?:: (.*?))?(?: clickable \[[^\]]*\])?$/;

const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };
const readJson = (path) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const key = (role, name) => `${role} ${JSON.stringify(name ?? '')}`;

// --- pure verdicts (the self-test's subject) ---------------------------------

/** The tree text of a snapshot result: a plain snapshot's string or a delta reply's full tree. */
export function treeOf(result) {
    const s = result?.snapshot;
    return typeof s === 'string' ? s : typeof s?.tree === 'string' ? s.tree : '';
}

/** ref -> { role, name }, from agent-browser's object or Orca's typed array form. */
export function refsOf(result) {
    const raw = result?.refs ?? result?.snapshot?.refs ?? {};
    const out = new Map();
    if (Array.isArray(raw)) for (const r of raw) out.set(String(r.ref).replace(/^@/, ''), { role: r.role, name: r.name ?? '' });
    else for (const [ref, r] of Object.entries(raw)) out.set(ref.replace(/^@/, ''), { role: r.role, name: r.name ?? '' });
    return out;
}

/** Clause 1: every line of the tree text matches the grammar; a ref token is ref=eN. */
export function grammarVerdict(text, label) {
    const fails = [];
    const lines = text.split('\n');
    if (!text.trim()) return [`${label}: the snapshot is empty`];
    lines.forEach((line, i) => {
        const m = LINE.exec(line);
        const refs = (m?.[4] ?? '').split(', ').filter((t) => t.startsWith('ref'));
        if (!m || refs.some((t) => !/^ref=e\d+$/.test(t))) fails.push(`${label}: line ${i + 1} breaks the grammar: ${JSON.stringify(line)}`);
    });
    return fails;
}

/** ref -> sorted attribute tokens of TOKENS on that ref's line. */
export function tokensByRef(text) {
    const out = new Map();
    for (const line of text.split('\n')) {
        const attrs = (LINE.exec(line)?.[4] ?? '').split(', ');
        const ref = attrs.find((t) => /^ref=e\d+$/.test(t));
        if (ref) out.set(ref.slice(4), attrs.filter((t) => TOKENS.includes(t.split('=')[0])).sort().join(','));
    }
    return out;
}

function multiset(entries) {
    const m = new Map();
    for (const e of entries) m.set(e, (m.get(e) ?? 0) + 1);
    return m;
}

function multisetDiff(pb, ref, label, what) {
    const fails = [];
    for (const [k, n] of ref) if ((pb.get(k) ?? 0) < n) fails.push(`${label}: ${what} ${k} is in the reference ${n} time(s) and in PowerBrowser's output ${pb.get(k) ?? 0}`);
    for (const [k, n] of pb) if (!ref.has(k)) fails.push(`${label}: ${what} ${k} is in PowerBrowser's output ${n} time(s) and not in the reference`);
    return fails;
}

/** Clause 2: the multiset of (role, name) of ref'd nodes. */
export function refSetVerdict(pbResult, refResult, label) {
    const pb = multiset([...refsOf(pbResult).values()].map((r) => key(r.role, r.name)));
    const ref = multiset([...refsOf(refResult).values()].map((r) => key(r.role, r.name)));
    if (!ref.size) return [`${label}: broken instrument: the reference has no ref'd node`];
    return multisetDiff(pb, ref, label, 'ref\'d node');
}

/** Clause 3: per (role, name), the multiset of TOKENS signatures. */
export function tokenVerdict(pbResult, refResult, label) {
    const sigs = (result) => {
        const refs = refsOf(result);
        const tokens = tokensByRef(treeOf(result));
        return multiset([...refs].map(([ref, r]) => `${key(r.role, r.name)} [${tokens.get(ref) ?? ''}]`));
    };
    return multisetDiff(sigs(pbResult), sigs(refResult), label, 'attribute tokens of');
}

/** Clause 4a: the --delta kind after the scripted change. */
export function deltaKindVerdict(pbAfter, refAfter, label) {
    const pk = pbAfter?.snapshot?.kind;
    const rk = refAfter?.snapshot?.kind;
    if (!rk) return [`${label}: broken instrument: the reference afterChange has no delta kind`];
    return pk === rk ? [] : [`${label}: the delta kind after the change is ${pk ?? 'missing'}, the reference's is ${rk}`];
}

/**
 * Clause 4b: refs survive. obs: { pbFirst, pbAfter, refFirst, refAfterChange } where the first two are PowerBrowser's
 * plain snapshots before and after the change, refFirst the reference's full output, refAfterChange its delta reply.
 */
export function survivalVerdict({ pbFirst, pbAfter, refFirst, refAfterChange }, label) {
    const fails = [];
    const before = refsOf(refFirst);
    const changes = refAfterChange?.snapshot?.changes ?? [];
    const removed = multiset(changes.filter((c) => c.op === 'remove').map((c) => { const r = before.get(c.ref.replace(/^@/, '')); return r ? key(r.role, r.name) : `unknown ${c.ref}`; }));
    const surviving = new Map(multiset([...before.values()].map((r) => key(r.role, r.name))));
    for (const [k, n] of removed) surviving.set(k, (surviving.get(k) ?? 0) - n);
    const pbBefore = refsOf(pbFirst);
    const pbNow = refsOf(pbAfter);
    const budget = new Map(surviving);
    for (const [ref, r] of pbBefore) {
        const k = key(r.role, r.name);
        if ((budget.get(k) ?? 0) <= 0) continue;
        budget.set(k, budget.get(k) - 1);
        const now = pbNow.get(ref);
        if (!now || key(now.role, now.name) !== k) fails.push(`${label}: ref ${ref} (${k}) was renumbered or lost after the change (now ${now ? key(now.role, now.name) : 'absent'})`);
    }
    const expected = new Map([...surviving].filter(([, n]) => n > 0));
    for (const c of changes.filter((x) => x.op === 'add')) { const k = key(c.node?.role, c.node?.name); expected.set(k, (expected.get(k) ?? 0) + 1); }
    fails.push(...multisetDiff(multiset([...pbNow.values()].map((r) => key(r.role, r.name))), expected, label, 'after the change, ref\'d node'));
    return fails;
}

/** Clause 5a: counters before and after one click: [{ text, clicks }] in document order. */
export function clickVerdict(before, after, refName, label) {
    if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) return [`${label}: the click counters could not be read before and after the click`];
    const moved = after.map((c, i) => ({ text: c.text, by: c.clicks - before[i].clicks })).filter((c) => c.by !== 0);
    if (moved.length !== 1 || moved[0].by !== 1) return [`${label}: click ${refName} changed ${moved.length} counter(s) (${moved.map((c) => `${c.text} +${c.by}`).join(', ') || 'none'}); exactly one +1 was expected`];
    return moved[0].text === refName ? [] : [`${label}: the click landed on "${moved[0].text}", the ref names "${refName}"`];
}

/** Clause 5b: the element row given a removed node's ref. */
export function staleVerdict(errorMessage, label) {
    return String(errorMessage ?? '').includes('browser_stale_ref') ? [] : [`${label}: a removed node's ref answered ${JSON.stringify(errorMessage ?? null)}, not browser_stale_ref`];
}

/** A tilde range ~a.b.c: same major and minor, patch at least c. Any other range shape is refused. */
export function tildeSatisfies(version, range) {
    const r = /^~(\d+)\.(\d+)\.(\d+)$/.exec(String(range ?? '').trim());
    const v = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version ?? ''));
    if (!r || !v) return false;
    return v[1] === r[1] && v[2] === r[2] && Number(v[3]) >= Number(r[3]);
}

/**
 * The orca-snapshot-fixtures verdict. obs: { manifest, installed, range, pages: { <name>: { html, json } } } where
 * html is a boolean and json the parsed page json or null.
 */
export function fixturesVerdict(obs) {
    const fails = [];
    const names = obs.manifest?.pages ?? [];
    if (!names.length) return ['broken instrument: the manifest lists no fixture page'];
    const recorded = obs.manifest.agentBrowserVersion;
    if (recorded !== obs.installed) fails.push(`the fixtures record agent-browser ${recorded}, orca/ has ${obs.installed} installed; re-run node scripts/gen-orca-snapshot-fixtures.mjs`);
    if (!tildeSatisfies(recorded, obs.range)) fails.push(`the fixtures' agent-browser ${recorded} is outside orca/package.json's range ${obs.range}`);
    for (const page of names) {
        const p = obs.pages[page] ?? {};
        if (!p.html) fails.push(`manifest page ${page} has no ${page}.html`);
        if (!p.json) { fails.push(`manifest page ${page} has no ${page}.json`); continue; }
        for (const part of ['full', 'interactive', 'afterChange']) if (!p.json[part]) fails.push(`${page}.json lacks ${part}`);
        if (p.json.agentBrowserVersion !== recorded) fails.push(`${page}.json records agent-browser ${p.json.agentBrowserVersion}, the manifest ${recorded}`);
    }
    return fails;
}

/** All snapshot-shape clauses of one fixture page. obs: PowerBrowser's results; ref: the page json. */
export function pageVerdict(obs, ref, page) {
    const fails = [];
    for (const [label, result] of [['full', obs.full], ['interactive', obs.interactive], ['after change', obs.after]]) {
        if (result) fails.push(...grammarVerdict(treeOf(result), `${page} ${label}`));
    }
    fails.push(...refSetVerdict(obs.full, ref.full, `${page} full`));
    fails.push(...tokenVerdict(obs.full, ref.full, `${page} full`));
    if (obs.interactive) fails.push(...refSetVerdict(obs.interactive, ref.interactive, `${page} interactive`));
    if (obs.deltaAfter) fails.push(...deltaKindVerdict(obs.deltaAfter, ref.afterChange, page));
    if (obs.after) fails.push(...survivalVerdict({ pbFirst: obs.full, pbAfter: obs.after, refFirst: ref.full, refAfterChange: ref.afterChange }, page));
    return fails;
}

// --- fixtures mode -------------------------------------------------------------

function fixturesObs(root = REPO_ROOT) {
    const fix = join(root, FIX_REL);
    const manifest = readJson(join(fix, 'manifest.json'));
    const pages = {};
    for (const page of manifest?.pages ?? []) pages[page] = { html: existsSync(join(fix, `${page}.html`)), json: readJson(join(fix, `${page}.json`)) };
    const range = /"agent-browser"\s*:\s*"([^"]+)"/.exec(read(join(root, 'orca', 'package.json')) ?? '')?.[1] ?? null;
    return { manifest, installed: readJson(join(root, 'orca', 'node_modules', 'agent-browser', 'package.json'))?.version ?? null, range, pages };
}

function runFixtures() {
    if (!existsSync(join(REPO_ROOT, 'orca', 'package.json'))) return { skip: 'no orca/ (run scripts/fetch-orca.sh and scripts/build-orca.sh)' };
    const obs = fixturesObs();
    const fails = fixturesVerdict(obs);
    return fails.length ? { fails } : { pass: `the fixtures record agent-browser ${obs.installed}, the installed version, inside ${obs.range}; ${obs.manifest.pages.length} pages each have html and full, interactive and afterChange` };
}

// --- live run ----------------------------------------------------------------

function environOf(pid) {
    const env = {};
    for (const entry of (read(`/proc/${pid}/environ`) ?? '').split('\0')) {
        const eq = entry.indexOf('=');
        if (eq > 0) env[entry.slice(0, eq)] = entry.slice(eq + 1);
    }
    return env;
}

async function chromeJson(app, expr) {
    const text = await app.evaluateIn(app.chrome, `(() => { try { return JSON.stringify(${expr}); } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`);
    return JSON.parse(text);
}

// The CLI runs asynchronously: a blocking call would stall this process's fixture server while the page loads.
function cliRunner(bin, env, cwd) {
    return (args) => new Promise((done) => {
        execFile(bin, [...args, '--json'], { env, cwd, encoding: 'utf8', timeout: 90000 }, (error, stdout) => {
            let json = null;
            try { json = JSON.parse(stdout); } catch { /* reported below */ }
            done({ ok: !error && json?.ok !== false && json !== null, result: json?.result ?? null, error: json?.error ?? (json ? null : { message: String(stdout).slice(0, 300) }) });
        });
    });
}

const COUNTERS = `JSON.stringify([...document.querySelectorAll('button, [role=button], [role=tab]')].map(b => ({ text: b.textContent.trim(), clicks: +b.dataset.clicks || 0 })))`;

async function livePage(cli, page, url, ref) {
    const fails = [];
    const must = async (what, args) => {
        const r = await cli(args);
        if (!r.ok) throw new Error(`${page}: ${what} failed: ${r.error?.code ?? ''} ${r.error?.message ?? ''}`.trim());
        return r.result;
    };
    const created = await must('tab create', ['tab', 'create', '--worktree', `path:${cli.repo}`]);
    const pageId = created?.browserPageId;
    if (!pageId) return [`${page}: tab create returned no browserPageId`];
    const on = ['--page', pageId];
    await must('goto', ['goto', '--url', url, ...on]);
    const obs = {};
    obs.full = await must('snapshot', ['snapshot', ...on]);
    obs.interactive = await must('snapshot --interactive', ['snapshot', '--interactive', ...on]);
    await must('snapshot --delta (baseline)', ['snapshot', '--delta', ...on]);
    await must('eval pbChange()', ['eval', '--expression', 'pbChange()', ...on]);
    obs.deltaAfter = await must('snapshot --delta (after the change)', ['snapshot', '--delta', ...on]);
    obs.after = await must('snapshot (after the change)', ['snapshot', ...on]);
    fails.push(...pageVerdict(obs, ref, page));

    let clicked = 0;
    for (const [r, node] of refsOf(obs.after)) {
        if (node.role !== 'button' && node.role !== 'tab') continue;
        const before = JSON.parse((await must('eval counters', ['eval', '--expression', COUNTERS, ...on]))?.result ?? 'null');
        await must(`click @${r}`, ['click', '--element', `@${r}`, ...on]);
        const after = JSON.parse((await must('eval counters', ['eval', '--expression', COUNTERS, ...on]))?.result ?? 'null');
        fails.push(...clickVerdict(before, after, node.name, `${page} click @${r}`));
        clicked++;
    }
    const firstRefs = refsOf(obs.full);
    const removed = [...firstRefs.keys()].filter((r) => !refsOf(obs.after).has(r));
    let stale = 0;
    for (const r of removed.slice(0, 1)) {
        const out = await cli(['click', '--element', `@${r}`, ...on]);
        fails.push(...(out.ok ? [`${page}: click on the removed node's ref @${r} succeeded`] : staleVerdict(out.error?.message, `${page} @${r}`)));
        stale++;
    }
    await cli(['tab', 'close', ...on]);
    return { fails, refs: refsOf(obs.full).size, clicked, stale };
}

async function live() {
    const { FIREFOX_BIN } = await import('./lib/firefox-bidi.mjs');
    const orcaDir = join(REPO_ROOT, 'orca');
    if (!existsSync(FIREFOX_BIN)) return { skip: `no built PowerBrowser (${FIREFOX_BIN} missing; see docs/BUILD.md "Firefox half")` };
    if (!existsSync(join(orcaDir, 'out', 'orcad', 'orcad.js'))) return { skip: 'no built orca/ (orca/out/orcad/orcad.js missing; run: nix develop .#orca --command bash scripts/build-orca.sh)' };
    const fix = fixturesObs();
    if (!fix.manifest?.pages?.length) return { skip: `no fixtures (${FIX_REL}/manifest.json; run node scripts/gen-orca-snapshot-fixtures.mjs)` };
    const fixFails = fixturesVerdict(fix);
    if (fixFails.length) return { fails: fixFails };

    for (const k of Object.keys(process.env)) if (k.startsWith('ORCA_')) delete process.env[k];
    const { withProbeShell } = await import('./lib/pb-live-probe.mjs');
    const { pollFor } = await import('./lib/pb-relaunch.mjs');
    const { ensurePbNode } = await import('./lib/orca-run.mjs');
    const { freePort } = await import('./verify-orca-hidden-electron.mjs');
    const OrcaEnv = await import('../powerbrowser/shell/OrcaEnv.sys.mjs');
    const node = await ensurePbNode();
    const port = await freePort(OrcaEnv);
    const work = join(REPO_ROOT, WORK_REL);
    const repo = join(work, 'repo');
    rmSync(work, { recursive: true, force: true });
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, 'README'), `${NAME} scratch repository\n`);
    const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', ...a], { env: { PATH: process.env.PATH ?? '', HOME: homedir() }, stdio: 'ignore' });
    git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', 'fixture');

    // Loopback only; the fixture pages and nothing else.
    const fixDir = join(REPO_ROOT, FIX_REL);
    const server = createServer((req, res) => {
        const m = /^\/([a-z0-9-]+)\.html$/.exec(new URL(req.url, 'http://127.0.0.1').pathname);
        if (!m || !fix.manifest.pages.includes(m[1])) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(readFileSync(join(fixDir, `${m[1]}.html`)));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const fails = [];
    let refs = 0;
    let clicked = 0;
    let stale = 0;
    try {
        await withProbeShell(async (app) => {
            const state = await pollFor(async () => { const s = await chromeJson(app, `ChromeUtils.importESModule(${JSON.stringify(SERVICE_URL)}).OrcaService.getState()`); return s.state === 'ready' ? s : null; }, 90000, 'OrcaService to reach ready');
            const dataRoot = environOf(state.pid).ORCA_USER_DATA;
            if (!dataRoot) { fails.push('orcad\'s environment names no ORCA_USER_DATA'); return; }
            const env = { PATH: process.env.PATH ?? '', HOME: homedir(), ORCA_USER_DATA: dataRoot, ORCA_USER_DATA_PATH: dataRoot };
            const cli = cliRunner(join(dataRoot, 'cli', 'bin', 'orca'), env, repo);
            cli.repo = repo;
            const added = await cli(['repo', 'add', '--path', repo]);
            if (!added.ok) { fails.push(`repo add failed: ${added.error?.message ?? ''}`); return; }
            for (const page of fix.manifest.pages) {
                const r = await livePage(cli, page, `${base}/${page}.html`, fix.pages[page].json);
                if (Array.isArray(r)) { fails.push(...r); continue; }
                fails.push(...r.fails);
                refs += r.refs;
                clicked += r.clicked;
                stale += r.stale;
            }
        }, { extraPrefs: { 'powerbrowser.sidecar.nodePath': node.path, 'powerbrowser.orca.port': port, 'powerbrowser.orca.root': orcaDir } });
    } finally {
        server.close();
    }
    if (!fails.length && !clicked) fails.push('vacuous: no button or tab ref was clicked');
    if (!fails.length && !stale) fails.push('vacuous: no fixture removed a ref\'d node, so browser_stale_ref was never exercised');
    return fails.length ? { fails } : { pass: `${fix.manifest.pages.length} fixture(s), ${refs} ref'd nodes matched; ${clicked} click(s) on refs landed on their nodes; a removed node's ref answered browser_stale_ref` };
}

// --- self-test -----------------------------------------------------------------

export function selfTest() {
    return { lines: ['(self-test lands with Task 3)'], failures: 0, planted: 0 };
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args[0] === '--self-test' && args.length === 1) {
        const { lines, failures, planted } = selfTest();
        for (const l of lines) console.log(l);
        if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); process.exit(1); }
        console.log(`${NAME} self-test: PASS -- ${planted} planted faults each went red naming the drift`);
        process.exit(0);
    }
    const fixturesMode = args[0] === '--fixtures' && args.length === 1;
    const label = fixturesMode ? 'orca-snapshot-fixtures' : NAME;
    if (args.length && !fixturesMode) {
        console.error(`${NAME}: FAIL -- unknown argument '${args[0]}' (usage: node scripts/verify-orca-browser-snapshot-live.mjs [--fixtures | --self-test])`);
        process.exit(2);
    }
    let code = 0;
    try {
        const r = fixturesMode ? runFixtures() : await live();
        if (r.skip) console.log(`${label}: SKIP -- ${r.skip}`);
        else if (r.fails) { for (const f of r.fails) console.error(`${label}: FAIL -- ${f}`); code = 1; }
        else console.log(`${label}: PASS -- ${r.pass}`);
    } catch (e) {
        console.error(`${label}: FAIL -- ${String(e?.message ?? e)}`);
        code = 1;
    }
    process.exit(code);
}
