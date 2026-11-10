#!/usr/bin/env node
// Phase 64 research probe (P64-03, P64-23, P64-20, P64-08/condition 3). Route A in the Theia
// document of a headless PowerBrowser, on the spike lane's Theia build (window.__pbReact), with the
// probe bundle from build-probe.sh. Run from the spike lane tree's copy of this directory:
//   PB_FIREFOX_BIN=<objdir>/dist/bin/powerbrowser flock /home/chris/coding/Power-Browser/.git/pb-live.lock \
//     node <lane>/.planning/spikes/004-orca-pane-hosting/p64-probe/probe-64.mjs --bundle esm|lib
// Writes results-p64-<bundle>.json beside itself. The pairing offer stays in memory; every write to
// stdout passes installOutputRedaction (the spike's rule, T-61-01).
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, ensurePbNode, installOutputRedaction, orcaVersionFromPins, orcadEnv, redact, startOrcad, stopOrcad } from '../../../../scripts/lib/orca-run.mjs';
import { openWebTab, pollFor, probe, withProbeShell } from '../../../../scripts/lib/pb-live-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const bundle = process.argv[2] === '--bundle' ? process.argv[3] : null;
const cliOnly = process.argv.includes('--cli-only');
const noPersistence = process.argv.includes('--no-persistence');
const reloadPair = process.argv.includes('--reload-pair');
if (!['esm', 'lib'].includes(bundle)) { console.error('usage: probe-64.mjs --bundle esm|lib'); process.exit(2); }
const J = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEY = 'powerbrowser.orca-panes.react';
const ORCA_DIR = join(REPO_ROOT, 'orca');
const WORK = join(REPO_ROOT, '.mozbuild', 'p64-probe');
const PROFILE_REAL = join(WORK, 'powerbrowser-orca');
const PROFILE_ALIAS = join(homedir(), '.cache', 'pb-p64-probe-orca');
const REPO_DIR = join(WORK, 'repo');
const ESM_DIR = join(WORK, 'esm');

let restoreOutput = installOutputRedaction([]);
for (const name of Object.keys(process.env)) {
    if (name.startsWith('ORCA_') || ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_REPL_EXTERNAL_MODULE'].includes(name)) delete process.env[name];
}
process.env.PB_BACKEND_MAIN ??= join(REPO_ROOT, 'theia', 'applications', 'browser', 'lib', 'backend', 'main.js');

function git(...argv) {
    const r = spawnSync('git', ['-c', 'user.name=pb-probe', '-c', 'user.email=pb-probe@invalid', ...argv], { cwd: REPO_DIR, encoding: 'utf8' });
    if (r.status !== 0 && !argv.includes('merge')) throw new Error(`git ${argv[0]}: ${r.stderr.trim().split('\n').pop()}`);
    return r.stdout.trim();
}
/** A throwaway repo whose worktree holds one live merge conflict (README.md, both modified). */
function makeRepo() {
    rmSync(REPO_DIR, { recursive: true, force: true });
    mkdirSync(REPO_DIR, { recursive: true });
    git('init', '-q', '-b', 'main');
    writeFileSync(join(REPO_DIR, 'README.md'), 'p64 probe\nline\n');
    git('add', 'README.md'); git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'side');
    writeFileSync(join(REPO_DIR, 'README.md'), 'p64 probe\nside\n'); git('commit', '-qam', 'side');
    git('checkout', '-q', 'main');
    writeFileSync(join(REPO_DIR, 'README.md'), 'p64 probe\nmain\n'); git('commit', '-qam', 'main');
    git('merge', '-q', 'side');
    return git('status', '--porcelain');
}
function makeProfile() {
    rmSync(PROFILE_REAL, { recursive: true, force: true });
    mkdirSync(PROFILE_REAL, { recursive: true });
    mkdirSync(dirname(PROFILE_ALIAS), { recursive: true });
    try { if (lstatSync(PROFILE_ALIAS).isSymbolicLink()) rmSync(PROFILE_ALIAS); } catch { /* absent */ }
    symlinkSync(PROFILE_REAL, PROFILE_ALIAS);
}

/** CORS-enabled static server for the ESM build (orcad's static handler sends no CORS header, so a module script from it fails cross-origin; the product serves the bundle same-origin from Theia, P64-06). */
function serveEsm() {
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.html': 'text/html' };
    const served = [];
    const server = createServer((req, res) => {
        const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
        const file = join(ESM_DIR, path);
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (path === 'blank.html') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>blank</title>'); return; }
        if (!file.startsWith(ESM_DIR) || !existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
        served.push(path);
        res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        res.end(readFileSync(file));
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, served, origin: `http://127.0.0.1:${server.address().port}` })));
}

const result = { bundle, startedAt: new Date().toISOString(), theiaBuild: process.env.PB_BACKEND_MAIN };
let failure = null;
let child = null, ready = null, esm = null;
try {
    const node = await ensurePbNode();
    makeProfile();
    result.repoStatus = makeRepo();
    const env = orcadEnv(process.env, { profileDir: PROFILE_ALIAS, orcaVersion: orcaVersionFromPins() });
    ({ child, ready } = await startOrcad({ nodeBin: node.path, orcaDir: ORCA_DIR, profileDir: PROFILE_ALIAS, env }));
    restoreOutput(); restoreOutput = installOutputRedaction(ready.secrets);
    const client = new URL(ready.webClientUrl);
    if (client.hostname !== '127.0.0.1') throw new Error('web client is not on loopback');
    const pairing = decodeURIComponent(client.hash.replace(/^#/, '').replace(/^pairing=/, ''));
    const libUrl = f => `${client.origin}${client.pathname.replace(/[^/]*$/, `assets/pb-probe/${f}`)}`;
    const cli = (...argv) => {
        const r = spawnSync(node.path, [join(ORCA_DIR, 'out', 'cli', 'index.js'), ...argv, '--json'], { cwd: REPO_DIR, env, encoding: 'utf8', timeout: 60000 });
        const text = redact(`${r.stdout ?? ''}`, ready.secrets);
        if (r.status !== 0) throw new Error(`orca ${argv.slice(0, 2).join(' ')} exited ${r.status}: ${redact(`${r.stderr ?? ''}`, ready.secrets).trim().split('\n').pop()}`);
        try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300) }; }
    };
    cli('repo', 'add', '--path', REPO_DIR);
    esm = await serveEsm();
    const esmCss = readdirSync(join(ESM_DIR, 'assets')).filter(f => f.endsWith('.css'));

    await withProbeShell(async app => {
        const loaded = await probe(app, `
            if (!window.__pbReact) return { error: 'window.__pbReact is absent: not the lane Theia build' };
            // The P64-08 hand-off: one Symbol.for key on globalThis, filled before the bundle loads.
            globalThis[Symbol.for(${J(KEY)})] = window.__pbReact;
            const sheet = href => new Promise((resolve, reject) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
                l.setAttribute('data-pb-orca-sheet', ''); l.onload = resolve; l.onerror = () => reject(new Error('sheet ' + href)); document.head.appendChild(l); });
            const t0 = performance.now();
            if (${J(bundle)} === 'esm') {
                for (const f of ${J(esmCss)}) await sheet(${J(esm.origin)} + '/assets/' + f);
                window.PbProbe = await import(${J(esm.origin)} + '/pb-probe.js');
            } else {
                await sheet(${J(libUrl('pb-probe-lib.css'))});
                await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = ${J(libUrl('pb-probe-lib.js'))};
                    s.onload = resolve; s.onerror = () => reject(new Error('lib script')); document.head.appendChild(s); });
            }
            const loadMs = Math.round(performance.now() - t0);
            if (!window.PbProbe) return { error: 'no PbProbe after load' };
            await window.PbProbe.bootstrap({ pairing: ${J(pairing)}, persistence: ${J(!noPersistence)}, sessionOnly: ${J(reloadPair)} });
            await until(() => window.PbProbe.state().ready && window.PbProbe.state().worktrees.length > 0, 45000);
            return { loadMs, sameUseState: window.PbProbe.reactIdentity.useState === window.__pbReact.React.useState, reactVersion: window.PbProbe.reactVersion,
                theiaReact: window.__pbReact.React.version, state: window.PbProbe.state() };
        `);
        if (loaded?.error) throw new Error(loaded.error);
        result.load = { loadMs: loaded.loadMs, reactCopies: loaded.sameUseState ? 1 : 2, reactVersion: loaded.reactVersion, theiaReact: loaded.theiaReact,
            esmFilesFetchedAtBoot: esm.served.length };
        const st = () => app.evaluate('JSON.stringify(window.PbProbe.state())').then(JSON.parse);
        const wt = loaded.state.worktrees[0].id;
        result.initial = { activeWorktreeId: loaded.state.activeWorktreeId, visibility: loaded.state.visibility, tabs: loaded.state.tabs.length };

        // ---------------- P64-23: when does a CLI-created terminal become a tab in this client?
        const cliTrial = async (label, windowMs = 8000) => {
            const before = new Set((await st()).tabs.map(t => t.id));
            const t0 = Date.now();
            cli('terminal', 'create', '--worktree', `path:${REPO_DIR}`);
            let hit = null, last = null;
            try {
                hit = await pollFor(async () => { last = await st(); return last.tabs.find(t => !before.has(t.id) && t.contentType === 'terminal'); }, windowMs, 'cli tab');
            } catch { /* miss */ }
            const listed = JSON.stringify(cli('terminal', 'list', '--worktree', `path:${REPO_DIR}`)).match(/"term_[A-Za-z0-9-]+"/g)?.length ?? 0;
            return { label, becameTab: !!hit, ms: hit ? Date.now() - t0 : null, activeWorktreeId: (last ?? await st()).activeWorktreeId ? 'set' : 'null',
                visibility: (last ?? await st()).visibility, hostTerminalHandles: listed, tabsNow: (last ?? await st()).tabs.length,
                executionHostIds: [...new Set((last ?? await st()).tabs.map(t => t.executionHostId))] };
        };
        result.cli = [];
        if (reloadPair) {
            const storageKeys = () => app.evaluate(`JSON.stringify(Object.keys(localStorage).filter(k => k.startsWith('orca.')))`).then(JSON.parse);
            result.reloadPair = { first: { ready: true, timeOrigin: await app.evaluate('performance.timeOrigin'), localStorageOrcaKeys: await storageKeys() } };
            await app.evaluate('location.reload(); true').catch(() => null);
            await sleep(8000);
            const again = await probe(app, `
                globalThis[Symbol.for(${J(KEY)})] = window.__pbReact;
                for (const f of ${J(esmCss)}) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = ${J(esm.origin)} + '/assets/' + f; document.head.appendChild(l); }
                window.PbProbe = await import(${J(esm.origin)} + '/pb-probe.js');
                await window.PbProbe.bootstrap({ pairing: ${J(pairing)}, sessionOnly: true });
                await until(() => window.PbProbe.state().ready && window.PbProbe.state().worktrees.length > 0, 45000);
                return { ready: window.PbProbe.state().ready, worktrees: window.PbProbe.state().worktrees.length };
            `).catch(e => ({ error: String(e.message).slice(0, 300) }));
            result.reloadPair.second = { ...again, timeOrigin: await app.evaluate('performance.timeOrigin'), localStorageOrcaKeys: await storageKeys() };
            cli('terminal', 'create', '--worktree', `path:${REPO_DIR}`);
            await sleep(3000);
            result.reloadPair.second.tabsAfterCli = await st().then(s => s.tabs.length).catch(() => null);
            return;
        }
        if (cliOnly) {
            result.persistence = !noPersistence;
            const host = () => probe(app, `return await window.PbProbe.hostTabs(${J(wt)});`).catch(e => ({ error: String(e.message) }));
            result.cli.push(await cliTrial('T1 no active worktree'));
            await probe(app, `return await window.PbProbe.hostCreateTerminal(${J(wt)});`);
            await sleep(1500);
            result.hostAfterClientRpcCreate = await host();
            result.cli.push(await cliTrial('T3a after a client-issued terminal.create (host RPC path)'));
            await app.evaluate(`window.PbProbe.newTerminal(${J(wt)}).then(ok => { window.__pbNewTerm = ok; }); true`);
            await pollFor(async () => (await app.evaluate('window.__pbNewTerm === true')), 15000, 'store terminal');
            await sleep(1000);
            result.hostAfterStoreCreate = await host();
            result.cli.push(await cliTrial('T3b after a store-created terminal (createNewTerminalTab), 20 s window', 20000));
            result.hostAfterT3b = await host();
            const before = (await st()).tabs.filter(t => t.contentType === 'terminal').length;
            const t0 = Date.now();
            await probe(app, `await window.PbProbe.reselectWorktree(${J(wt)}); return true;`);
            let caught = null;
            try { caught = await pollFor(async () => (await st()).tabs.filter(t => t.contentType === 'terminal').length > before, 10000, 'reselect'); } catch { /* none */ }
            result.reselect = { terminalsBefore: before, terminalsAfter: (await st()).tabs.filter(t => t.contentType === 'terminal').length, ms: caught ? Date.now() - t0 : null };
            result.cli.push(await cliTrial('T6 after reselecting the worktree'));
            return;
        }
        result.cli.push(await cliTrial('T1 no active worktree'));
        await app.evaluate(`window.PbProbe.setActiveWorktree(${J(wt)}); true`); await sleep(1500);
        result.cli.push(await cliTrial('T2 active worktree set'));
        await app.evaluate(`window.PbProbe.newTerminal(${J(wt)}).then(ok => { window.__pbNewTerm = ok; }); true`);
        await pollFor(async () => (await app.evaluate('window.__pbNewTerm === true')), 15000, 'store terminal');
        await sleep(1000);
        result.cli.push(await cliTrial('T3 after a store-created terminal (spike Route A sequence)'));
        const webTab = await openWebTab(app, `${esm.origin}/blank.html`);
        await sleep(2500);
        result.cli.push(await cliTrial('T4 a web tab is current'));
        await probe(app, `const w = get('WebTabChannel').widgetOf(${J(webTab)}); w.dispose(); return true;`).catch(() => null);
        await sleep(2500);
        result.cli.push(await cliTrial('T5 web tab closed again'));

        // ---------------- P64-03: mount each hosted type in its own Lumino widget and React root.
        const s1 = await st();
        const localTerminal = s1.terminals.find(t => t.worktreeId === wt)?.id;
        const simId = await app.evaluate(`window.PbProbe.newSimulatorTab(${J(wt)})`).catch(e => `threw: ${e.message}`);
        const conflictId = await app.evaluate(`window.PbProbe.openConflictReview(${J(wt)}, 'README.md')`).catch(e => `threw: ${e.message}`);
        const checkId = await app.evaluate(`window.PbProbe.openCheckDetails(${J(wt)})`).catch(e => `threw: ${e.message}`);
        result.created = { simulatorTab: simId, conflictReviewFile: conflictId, checkDetailsFile: checkId, mobileEmulatorEnabled: s1.mobileEmulatorEnabled };
        const picks = [
            { kind: 'terminal', worktreeId: wt, tabId: localTerminal },
            { kind: 'agent-session', worktreeId: wt, tabId: 'pb-probe-chat-tab', sessionId: 'pb-probe-chat-session' },
            { kind: 'simulator', worktreeId: wt, tabId: typeof simId === 'string' && !simId.startsWith('threw') ? simId : 'pb-probe-sim-tab' },
            { kind: 'conflict-review', worktreeId: wt, tabId: conflictId },
            { kind: 'check-details', worktreeId: wt, tabId: checkId },
        ];
        result.mounts = [];
        for (const pick of picks) {
            const out = await probe(app, `
                const shell = get('ApplicationShell');
                const R = window.__pbReact;
                const errorsBefore = window.PbProbe.mountErrors.length;
                const winErrors = []; const onErr = e => winErrors.push(String(e.error?.message ?? e.message).slice(0, 300));
                window.addEventListener('error', onErr);
                class ProbeWidget extends R.BaseWidget { constructor() { super(); this.id = 'pb-probe:' + ${J(pick.kind)}; this.title.label = ${J(pick.kind)}; this.title.closable = true; this.node.style.cssText = 'display:flex;overflow:hidden'; } }
                const w = new ProbeWidget();
                await shell.addWidget(w, { area: 'main' });
                await shell.activateWidget(w.id).catch(() => null);
                const t0 = performance.now();
                const unmount = window.PbProbe.mountKind(w.node, ${J(pick)});
                await sleep(7000);
                const root = w.node.querySelector('[data-pb-pane-root]');
                const text = (root?.innerText ?? '').replace(/\\s+/g, ' ').trim();
                const out = { kind: ${J(pick.kind)}, tabId: ${J(pick.tabId ?? null)}, rendered: !!root && root.childElementCount > 0, elements: root ? root.querySelectorAll('*').length : 0,
                    w: root?.clientWidth ?? 0, h: root?.clientHeight ?? 0, text: text.slice(0, 240),
                    markers: { xterm: root?.querySelectorAll('.xterm').length ?? 0, emulator: root?.querySelectorAll('[data-emulator-pane]').length ?? 0,
                        textarea: root?.querySelectorAll('textarea, [contenteditable="true"]').length ?? 0, monaco: root?.querySelectorAll('.monaco-editor').length ?? 0,
                        probeState: root?.querySelector('[data-pb-probe-state]')?.getAttribute('data-pb-probe-state') ?? null },
                    reactErrors: window.PbProbe.mountErrors.slice(errorsBefore), windowErrors: winErrors.slice(0, 4),
                    bodyPortals: [...document.body.children].filter(e => e.hasAttribute('data-radix-popper-content-wrapper') || e.hasAttribute('data-slot')).length };
                window.removeEventListener('error', onErr);
                unmount(); w.dispose();
                return out;
            `);
            result.mounts.push(out);
            console.log(`mount ${pick.kind}: rendered=${out?.rendered} elements=${out?.elements} errors=${out?.reactErrors?.length ?? '?'}`);
        }
        result.final = await st();
        result.final.tabs = result.final.tabs.map(t => ({ contentType: t.contentType, executionHostId: t.executionHostId ? t.executionHostId.replace(/:.*/, ':<env>') : null }));
        result.final.terminals = result.final.terminals.length;
        result.final.worktrees = result.final.worktrees.length;
    });
} catch (error) {
    failure = `harness: ${error.message}`;
} finally {
    esm?.server.close();
    if (child) { const { survivors } = await stopOrcad(child, ready?.daemonPid ?? null); result.orcadSurvivors = survivors.length; }
}
result.finishedAt = new Date().toISOString();
result.verdict = failure ? 'FAIL' : 'DONE';
if (failure) result.failure = redact(failure, ready?.secrets ?? []);
const text = redact(JSON.stringify(result, null, 2), ready?.secrets ?? []);
if (/#pairing=|orca:\/\/pair|deviceToken"?\s*[:=]\s*"?[A-Za-z0-9_-]{16,}/.test(text)) { console.log('probe-64: FAIL -- redaction'); process.exit(1); }
writeFileSync(join(HERE, `results-p64-${bundle}${cliOnly ? `-cli${noPersistence ? '-nopersist' : ''}` : ''}${reloadPair ? '-reload' : ''}.json`), `${text}\n`);
console.log(failure ? `probe-64: FAIL -- ${result.failure}` : `probe-64: DONE -- results-p64-${bundle}.json`);
restoreOutput();
process.exit(failure ? 1 : 0);
